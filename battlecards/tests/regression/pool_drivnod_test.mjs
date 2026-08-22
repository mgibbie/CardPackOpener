// pool_drivnod_test.mjs — Drivnod boss pool (B death-DOUBLER aristocrats: deathrattles/death-triggers fire twice).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._f = { id: '_f', name: 'F', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Undead' };
byId._foe = { id: '_foe', name: 'X', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const skele = (st, pi) => st.players[pi].board.filter(c => c.name === 'Skeleton').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Drivnod');
// ---- rubric ----
ok('Drivnod pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/enchantment/quest/instant', types.size >= 6 && ['location', 'enchantment', 'quest', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('has two death doublers (sig + Charnel Colossus)', pool.filter(c => c.static && c.static.type === 'death-doubler').length === 2);
ok('the boss (sig) is an Undead creature commander', byId.drivnod_sig.type === 'creature');

function game() {
  const st = E.createGame(byId, seededRng(21), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_f', '_f', '_f', '_f', '_f', '_f']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const kill = (st, c) => { c.damage = c.maxHealth; c.shield = false; E.sweepDeaths(st); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_f'); const foe = put(st, 1, '_foe'); let threw = null;
  const tgt = (['drivnod_reaping', 'drivnod_torturous_tendencies'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'drivnod_spikes' ? 1 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- baseline: grin deathrattle deals 1 (no doubler) ----
{ const st = game(); const g = put(st, 0, 'drivnod_grin'); const life0 = st.players[1].life; kill(st, g);
  ok('Grin deathrattle deals 1 (no doubler)', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- 1 doubler (sig): grin deathrattle fires twice -> 2 ----
{ const st = game(); put(st, 0, 'drivnod_sig'); const g = put(st, 0, 'drivnod_grin'); const life0 = st.players[1].life; kill(st, g);
  ok('Drivnod doubles the deathrattle: Grin deals 2', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- 2 doublers stack (sig + Charnel Colossus): grin deals 4 ----
{ const st = game(); put(st, 0, 'drivnod_sig'); put(st, 0, 'drivnod_charnel_colossus'); const g = put(st, 0, 'drivnod_grin'); const life0 = st.players[1].life; kill(st, g);
  ok('Two death doublers stack: Grin deathrattle fires 4x -> 4', st.players[1].life === life0 - 4, [life0, st.players[1].life]); }

// ---- necrogen hulk: deathrattle makes 2 Skeletons, doubled to 4 ----
{ const st = game(); put(st, 0, 'drivnod_sig'); const h = put(st, 0, 'drivnod_necrogen_hulk'); const s0 = skele(st, 0); kill(st, h);
  ok('Necrogen Hulk deathrattle (2 Skeletons) doubled -> 4', skele(st, 0) - s0 === 4, [s0, skele(st, 0)]); }

// ---- deathcaller death-trigger: draw, doubled ----
{ const st = game(); put(st, 0, 'drivnod_sig'); put(st, 0, 'drivnod_deathcaller'); const fodder = put(st, 0, '_f'); const h0 = st.players[0].hand.length;
  kill(st, fodder);
  ok('Deathcaller draw-on-death is doubled (draw 2)', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// ---- skeletal tapestry: Skeleton per friendly death, doubled ----
{ const st = game(); put(st, 0, 'drivnod_sig'); play(st, 0, 'drivnod_skeletal_tapestry', null); const fodder = put(st, 0, '_f'); const s0 = skele(st, 0);
  kill(st, fodder);
  ok('Skeletal Tapestry summons a Skeleton per death, doubled -> 2', skele(st, 0) - s0 === 2, [s0, skele(st, 0)]); }

// ---- burnished bones location: tap for a Skeleton ----
{ const st = game(); play(st, 0, 'drivnod_burnished_bones', null);
  const loc = st.players[0].board.find(c => c.id === 'drivnod_burnished_bones'); const s0 = skele(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Burnished Bones taps for a Skeleton', skele(st, 0) === s0 + 1, [s0, skele(st, 0)]); }

// ---- spikes Choose One (mode 1 = sacrifice + draw) ----
{ const st = game(); const fodder = put(st, 0, '_f'); const h0 = st.players[0].hand.length;
  play(st, 0, 'drivnod_spikes', null, 1);
  ok('Spikes (sac mode) sacrifices a friendly and draws 2', !st.players[0].board.some(c => c.uid === fodder.uid) && st.players[0].hand.length === h0 + 2, [st.players[0].board.length, st.players[0].hand.length - h0]); }

// ---- crescendo quest: 6 deaths -> Skeletons + drain ----
{ const st = game(); play(st, 0, 'drivnod_crescendo_of_death', null); const life0 = st.players[1].life; const s0 = skele(st, 0);
  for (let i = 0; i < 6; i++) { const f = put(st, 0, '_f'); kill(st, f); }
  ok('Crescendo reward: three Skeletons + 4 to each opponent', skele(st, 0) - s0 >= 3 && st.players[1].life === life0 - 4, [s0, skele(st, 0), life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
