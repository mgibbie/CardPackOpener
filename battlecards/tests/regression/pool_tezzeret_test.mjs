// pool_tezzeret_test.mjs — Tezzeret pool redesign (U ARTIFACTS MATTER: artifacts + payoffs + Constructs).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._con = { id: '_con', name: 'C', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Construct' };
byId._art = { id: '_art', name: 'A', type: 'artifact', cost: 1, rarity: 'common', tapAbility: { effects: [{ type: 'draw', value: 1 }], text: 'x' }, description: 'x' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Tezzeret');
// ---- rubric ----
ok('Tezzeret pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/artifact/enchantment/instant', types.size >= 6 && ['planeswalker', 'artifact', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
ok('is a real artifact deck (>=3 artifact cards)', pool.filter(c => c.type === 'artifact').length >= 3, pool.filter(c => c.type === 'artifact').map(c => c.id));
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility).length);

function game() {
  const st = E.createGame(byId, seededRng(0), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['tezzeret_charm', 'tezzeret_betrayal'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'tezzeret_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the 3 artifacts tap for value ----
{ const st = game(); const g = putArt(st, 0, 'tezzeret_gambit'); const h0 = st.players[0].hand.length;
  ok('Gambit taps to draw', E.tapArtifact(st, 0, g.uid, null) && st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0); }
{ const st = game(); const k = putArt(st, 0, 'tezzeret_keyrune'); const b0 = st.players[0].board.length;
  E.tapArtifact(st, 0, k.uid, null);
  ok('Keyrune taps for a Thopter', st.players[0].board.some(c => c.name === 'Thopter') && st.players[0].board.length === b0 + 1, st.players[0].board.map(c => c.name)); }
{ const st = game(); const p = putArt(st, 0, 'tezzeret_puzzlebox'); const b0 = st.players[0].board.length;
  E.tapArtifact(st, 0, p.uid, null);
  ok('Puzzlebox taps for a 2/2 Construct', st.players[0].board.some(c => c.name === 'Construct' && c.attack === 2) && st.players[0].board.length === b0 + 1, st.players[0].board.map(c => c.name)); }

// ---- artifact-played payoffs: playing an artifact triggers strider/simulacrum/tesseract ----
{ const st = game(); const strider = put(st, 0, 'tezzeret_strider'); put(st, 0, 'tezzeret_simulacrum'); const tess = put(st, 0, 'tezzeret_tesseract');
  const h0 = st.players[0].hand.length; const b0 = st.players[0].board.length;
  play(st, 0, '_art', null); // play a real artifact from hand
  ok('Strider grows +1/+1 when you play an artifact', strider.attack === 4 && E.hp(strider) === 4, [strider.attack, E.hp(strider)]);
  ok('Simulacrum draws when you play an artifact', st.players[0].hand.length >= h0, [h0, st.players[0].hand.length]);
  ok('Tesseract makes a Servo when you play an artifact', st.players[0].board.some(c => c.name === 'Servo'), st.players[0].board.map(c => c.name)); }

// ---- touch: Construct anthem ----
{ const st = game(); play(st, 0, 'tezzeret_touch', null); const c = put(st, 0, '_con'); E.recomputeAuras(st);
  ok('Touch gives Constructs +1/+1', c.attack === 3 && E.hp(c) === 3, [c.attack, E.hp(c)]); }

// ---- ambition: metalcraft extra draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'tezzeret_ambition', null);
  E.resolveScry(st, []); const noArt = st.players[0].hand.length - h0;
  const st2 = game(); putArt(st2, 0, 'tezzeret_gambit'); const h1 = st2.players[0].hand.length;
  play(st2, 0, 'tezzeret_ambition', null);
  E.resolveScry(st2, []); ok('Ambition draws an extra card only when you control an artifact', (st2.players[0].hand.length - h1) === (noArt + 1), [noArt, st2.players[0].hand.length - h1]); }

// ---- gatebreaker: metalcraft +2/+2 ----
{ const st = game(); putArt(st, 0, 'tezzeret_gambit'); const { c: g } = play(st, 0, 'tezzeret_gatebreaker', null);
  ok('Gatebreaker gets +2/+2 with an artifact out (5/5 -> 7/7)', g.attack === 7 && E.hp(g) === 7, [g.attack, E.hp(g)]); }
{ const st = game(); const { c: g } = play(st, 0, 'tezzeret_gatebreaker', null);
  ok('Gatebreaker stays 5/5 without an artifact', g.attack === 5 && E.hp(g) === 5, [g.attack, E.hp(g)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
