// pool_elspeth_test.mjs — Elspeth pool redesign (W: wide token swarm + per-creature scaling + Angels).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._sol = { id: '_sol', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Soldier' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Elspeth');
// ---- rubric ----
ok('Elspeth pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/location/secret/enchantment/instant', types.size >= 6 && ['planeswalker', 'location', 'secret', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura).length >= 3, pool.filter(c => c.ongoing || c.aura).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(8), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_sol'); const foe = put(st, 1, '_v'); let threw = null;
  const tgt = (['elspeth_smite', 'elspeth_nightmare', 'elspeth_vanishing', 'elspeth_conquers_death', 'elspeth_ultimatum'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- smite: go-wide reward (draw only with 3+ other creatures) ----
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'elspeth_smite', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Smite: no bonus draw with an empty board', st.players[0].hand.length === h0, [h0, st.players[0].hand.length]); }
{ const st = game(); const foe = put(st, 1, '_v'); put(st, 0, '_sol'); put(st, 0, '_sol'); put(st, 0, '_sol'); const h0 = st.players[0].hand.length;
  play(st, 0, 'elspeth_smite', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Smite draws with 3+ other creatures', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- devotee: token engine at turn start ----
{ const st = game(); put(st, 0, 'elspeth_devotee'); const b0 = st.players[0].board.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Devotee summons a Soldier at the start of your turn', st.players[0].board.length === b0 + 1 && st.players[0].board.some(c => c.name === 'Soldier'), st.players[0].board.map(c => c.name)); }

// ---- talent: every summoned creature enters +1/+1 ----
{ const st = game(); play(st, 0, 'elspeth_talent', null);
  const { c: s } = play(st, 0, '_sol', null);
  ok('Talent makes a summoned creature enter +1/+1 (1/1 -> 2/2)', s.attack === 2 && E.hp(s) === 2, [s.attack, E.hp(s)]); }

// ---- vanguard: +1/+1 per other creature ----
{ const st = game(); put(st, 0, '_sol'); put(st, 0, '_sol'); put(st, 0, '_sol');
  const { c: vg } = play(st, 0, 'elspeth_vanguard', null);
  ok('Vanguard gains +1/+1 per other creature (3/4 -> 6/7)', vg.attack === 6 && E.hp(vg) === 7, [vg.attack, E.hp(vg)]); }

// ---- ascent: Angel commander buffs Soldiers ----
{ const st = game(); put(st, 0, 'elspeth_ascent'); const s = put(st, 0, '_sol'); E.recomputeAuras(st);
  ok('Ascent buffs other Soldiers +1/+1', s.attack === 2 && E.hp(s) === 2, [s.attack, E.hp(s)]); }

// ---- solidarity location: tap -> a 2/2 Soldier ----
{ const st = game(); play(st, 0, 'elspeth_solidarity', null);
  const loc = st.players[0].board.find(c => c.id === 'elspeth_solidarity'); const b0 = st.players[0].board.length;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Solidarity taps for a 2/2 Soldier', loc && loc.type === 'location' && st.players[0].board.some(c => c.name === 'Soldier' && c.attack === 2), st.players[0].board.map(c => c.name)); }

// ---- conquers death: destroy + Angel ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'elspeth_conquers_death', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Conquers Death destroys and makes a 4/4 Angel', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].board.some(c => c.name === 'Angel' && c.attack === 4), st.players[0].board.map(c => c.name)); }

// ---- moment of truth secret: reinforcements on being attacked ----
{ const st = game(); play(st, 0, 'elspeth_moment_of_truth', null);
  const foe = put(st, 1, '_v'); const b0 = st.players[0].board.length; st.current = 1; st.priority = null; st.stack = [];
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 });
  ok('Moment of Truth summons two Soldiers when the hero is attacked', st.players[0].board.filter(c => c.name === 'Soldier').length === 2, st.players[0].board.map(c => c.name)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
