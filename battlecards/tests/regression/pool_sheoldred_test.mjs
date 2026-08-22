// pool_sheoldred_test.mjs — Sheoldred boss pool (B Phyrexian attrition: drain-on-draw + deathtouch/lifesteal + toxic).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._phy = { id: '_phy', name: 'P', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Phyrexian' };
byId._draw = { id: '_draw', name: 'D', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'draw', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Sheoldred');
// ---- rubric ----
ok('Sheoldred pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/weapon/instant', types.size >= 6 && ['artifact', 'enchantment', 'weapon', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.ongoings || c.aura || c.tapAbility).length >= 3, pool.filter(c => c.ongoing || c.ongoings || c.aura || c.tapAbility).map(c => c.id));
ok('the boss (sig) is a Phyrexian creature commander, not a planeswalker', byId.sheoldred_sig.type === 'creature');

function game() {
  const st = E.createGame(byId, seededRng(13), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const drawAs = (st, pi) => { const c = E.instantiate(byId._draw, pi); c.zone = 'hand'; st.players[pi].hand.push(c); st.current = pi; st.priority = null; st.stack = []; E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_phy'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['sheoldred_edict', 'sheoldred_grasp'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'sheoldred_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Sheoldred, the Apocalypse: gain 2 on your draw, opponent loses 2 on theirs ----
{ const st = game(); st.players[0].life = 20; put(st, 0, 'sheoldred_the_apocalypse');
  drawAs(st, 0);
  ok('Apocalypse: you gain 2 life when you draw', st.players[0].life === 22, st.players[0].life);
  const foeLife = st.players[1].life; drawAs(st, 1);
  ok('Apocalypse: an opponent loses 2 life when they draw', st.players[1].life === foeLife - 2, [foeLife, st.players[1].life]); }

// ---- terror: opponent loses 1 on their draw ----
{ const st = game(); put(st, 0, 'sheoldred_terror'); const foeLife = st.players[1].life;
  drawAs(st, 1);
  ok('Terror: opponent loses 1 life when they draw', st.players[1].life === foeLife - 1, [foeLife, st.players[1].life]); }

// ---- necrologist: gain 1 on your draw ----
{ const st = game(); st.players[0].life = 20; put(st, 0, 'sheoldred_the_necrologist');
  drawAs(st, 0);
  ok('Necrologist: you gain 1 life when you draw', st.players[0].life === 21, st.players[0].life); }

// ---- whisper enchantment: end-of-turn discard + draw ----
{ const st = game(); play(st, 0, 'sheoldred_whisper', null);
  st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)]; const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-end');
  ok('Whisper: opponent discards and you draw at end of turn', st.players[1].hand.length === 1 && st.players[0].hand.length === h0 + 1, [st.players[1].hand.length, h0, st.players[0].hand.length]); }

// ---- assimilator artifact: gain life + a Phyrexian ----
{ const st = game(); st.players[0].life = 20; const asm = putArt(st, 0, 'sheoldred_assimilator'); const b0 = st.players[0].board.length;
  E.tapArtifact(st, 0, asm.uid, null);
  ok('Assimilator taps to gain 2 life and a 1/1 Phyrexian', st.players[0].life === 22 && st.players[0].board.some(c => c.name === 'Phyrexian'), [st.players[0].life, st.players[0].board.map(c => c.name)]); }

// ---- headcleaver weapon: draw after the hero attacks ----
{ const st = game(); play(st, 0, 'sheoldred_headcleaver', null);
  const w = st.players[0].weapon; const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Headcleaver draws a card after the hero attacks', w && (w.keywords || []).includes('lifesteal') && st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- boss sig: drain + discard battlecry ----
{ const st = game(); const foeLife = st.players[1].life; st.players[1].hand = [E.instantiate(byId._v, 1)];
  play(st, 0, 'sheoldred_sig', null);
  ok('Sheoldred (boss) drains 3 and forces a discard', st.players[1].life === foeLife - 3 && st.players[1].hand.length === 0, [foeLife, st.players[1].life, st.players[1].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
