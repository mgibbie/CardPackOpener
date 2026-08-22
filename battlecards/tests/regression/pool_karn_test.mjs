// pool_karn_test.mjs — Karn pool redesign (colorless big-artifact goodstuff: ramp + Constructs + metalcraft + exile).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._con = { id: '_con', name: 'C', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Construct' };
byId._art = { id: '_art', name: 'A', type: 'artifact', cost: 1, rarity: 'common', tapAbility: { effects: [{ type: 'draw', value: 1 }], text: 'x' }, description: 'x' };
byId._dr = { id: '_dr', name: 'D', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', value: 1 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Karn');
// ---- rubric ----
ok('Karn pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/artifact/location/instant', types.size >= 6 && ['planeswalker', 'artifact', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps).map(c => c.id));
ok('Karn stays colorless (no colored cards)', pool.every(c => !(c.colors && c.colors.length)));

function game() {
  const st = E.createGame(byId, seededRng(7), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.exile = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_con'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (c.id === 'karn_sacrifice' || c.id === 'karn_temporal_sundering') ? { type: 'creature', uid: foe.uid, player: 1 }
    : (c.id === 'karn_touch') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'karn_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- scouting drone: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'karn_scouting_drone', null);
  ok('Scouting Drone gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- puzzlebox artifact: tap to draw ----
{ const st = game(); const box = putArt(st, 0, 'karn_puzzlebox'); const h0 = st.players[0].hand.length;
  ok('Puzzlebox taps to draw a card', E.tapArtifact(st, 0, box.uid, null) && st.players[0].hand.length === h0 + 1 && box.tapped, st.players[0].hand.length - h0); }

// ---- touch metalcraft: +4/+4 & DS with an artifact, else +2/+2 ----
{ const st = game(); const c = put(st, 0, '_con');
  play(st, 0, 'karn_touch', { type: 'creature', uid: c.uid, player: 0 });
  ok('Touch without an artifact gives +2/+2', c.attack === 4 && E.hp(c) === 4 && !c.shield, [c.attack, E.hp(c), c.shield]); }
{ const st = game(); putArt(st, 0, 'karn_scrying_orb'); const c = put(st, 0, '_con');
  play(st, 0, 'karn_touch', { type: 'creature', uid: c.uid, player: 0 });
  ok('Touch with an artifact gives +4/+4 and Divine Shield', c.attack === 6 && E.hp(c) === 6 && c.shield === true, [c.attack, E.hp(c), c.shield]); }

// ---- sacrifice: EXILE a creature (no deathrattle, goes to exile) ----
{ const st = game(); const foe = put(st, 1, '_dr'); const h1 = st.players[1].hand.length;
  play(st, 0, 'karn_sacrifice', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Sacrifice exiles a creature (removed, deathrattle does NOT fire)', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length === h1, [st.players[1].board.map(c => c.id), h1, st.players[1].hand.length]); }

// ---- bastion: Construct lord (+0/+1) ----
{ const st = game(); put(st, 0, 'karn_bastion'); const c = put(st, 0, '_con'); E.recomputeAuras(st);
  ok('Bastion buffs other Constructs +0/+1', c.attack === 2 && E.hp(c) === 3, [c.attack, E.hp(c)]); }

// ---- reconstruction location: tap for a 2/2 Construct ----
{ const st = game(); play(st, 0, 'karn_reconstruction', null);
  const loc = st.players[0].board.find(c => c.id === 'karn_reconstruction'); const b0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Reconstruction taps for a 2/2 Construct', loc && loc.type === 'location' && st.players[0].board.some(c => c.name === 'Construct' && c.attack === 2), st.players[0].board.map(c => c.name)); }

// ---- chrome automaton metalcraft: +3/+3 with an artifact ----
{ const st = game(); putArt(st, 0, 'karn_scrying_orb'); const { c: a } = play(st, 0, 'karn_chrome_automaton', null);
  ok('Chrome Automaton is 8/8 with an artifact out', a.attack === 8 && E.hp(a) === 8, [a.attack, E.hp(a)]); }
{ const st = game(); const { c: a } = play(st, 0, 'karn_chrome_automaton', null);
  ok('Chrome Automaton stays 5/5 without an artifact', a.attack === 5 && E.hp(a) === 5, [a.attack, E.hp(a)]); }

// ---- sylex: wipe all creatures ----
{ const st = game(); const a = put(st, 0, '_con'); const b = put(st, 1, '_con');
  play(st, 0, 'karn_sylex', null); E.sweepDeaths(st);
  ok('Sylex deals 4 to all creatures (2/2s die)', !st.players[0].board.some(c => c.uid === a.uid) && !st.players[1].board.some(c => c.uid === b.uid), [st.players[0].board.length, st.players[1].board.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
