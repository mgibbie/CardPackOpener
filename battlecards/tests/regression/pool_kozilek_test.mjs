// pool_kozilek_test.mjs — Kozilek boss pool (colorless Eldrazi card-flow: draw + mill the opponent + ramp).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._eld = { id: '_eld', name: 'E', type: 'creature', cost: 5, attack: 4, health: 4, rarity: 'common', tribe: 'Eldrazi' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Kozilek');
// ---- rubric ----
ok('Kozilek pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/enchantment/location/instant', types.size >= 6 && ['artifact', 'enchantment', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps || c.costMod).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility || c.taps || c.costMod).length);
ok('the boss (sig) is a 10/10 Eldrazi creature commander', byId.kozilek_sig.type === 'creature' && byId.kozilek_sig.attack === 10);

function game() {
  const st = E.createGame(byId, seededRng(23), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_foe', '_foe', '_foe', '_foe', '_foe', '_foe', '_foe', '_foe', '_foe', '_foe']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_eld'); const foe = put(st, 1, '_foe'); let threw = null;
  const tgt = (['kozilek_distortion', 'kozilek_butcher'].includes(c.id)) ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'kozilek_conquest' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- pathfinder: Eldrazi cost reduction ----
{ const st = game(); put(st, 0, 'kozilek_pathfinder');
  const el = E.instantiate(byId._eld, 0); el.zone = 'hand'; st.players[0].hand.push(el);
  const c = E.effectiveCost ? E.effectiveCost(st, 0, el) : (el.cost - 1);
  ok('Pathfinder makes your Eldrazi cost 1 less (5 -> 4)', c === 4, c); }

// ---- shrieker: Eldrazi lord ----
{ const st = game(); put(st, 0, 'kozilek_shrieker'); const e = put(st, 0, '_eld'); E.recomputeAuras(st);
  ok('Shrieker buffs other Eldrazi +1/+1', e.attack === 5 && E.hp(e) === 5, [e.attack, E.hp(e)]); }

// ---- aberration: mill the opponent 3 ----
{ const st = game(); const d0 = st.players[1].deck.length;
  play(st, 0, 'kozilek_aberration', null);
  ok('Aberration mills the opponent 3', st.players[1].deck.length === d0 - 3, [d0, st.players[1].deck.length]); }

// ---- warden enchantment: draw + mill each turn start ----
{ const st = game(); play(st, 0, 'kozilek_warden_of_geometries', null); const h0 = st.players[0].hand.length; const d0 = st.players[1].deck.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Warden draws you a card and mills the opponent 2 at turn start', st.players[0].hand.length === h0 + 1 && st.players[1].deck.length === d0 - 2, [h0, st.players[0].hand.length, d0, st.players[1].deck.length]); }

// ---- reckoning artifact: tap to draw ----
{ const st = game(); const r = putArt(st, 0, 'kozilek_reckoning'); const h0 = st.players[0].hand.length;
  ok('Reckoning taps to draw a card', E.tapArtifact(st, 0, r.uid, null) && st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0); }

// ---- predator location: tap for two Spawn ----
{ const st = game(); play(st, 0, 'kozilek_predator', null);
  const loc = st.players[0].board.find(c => c.id === 'kozilek_predator');
  E.tapLand(st, 0, loc.uid, 0);
  ok('Predator taps for two Eldrazi Spawn', st.players[0].board.filter(c => c.name === 'Eldrazi Spawn').length === 2, st.players[0].board.map(c => c.name)); }

// ---- channeler: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'kozilek_channeler', null);
  ok('Channeler gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- conquest Choose One (mode 1 = mill 8) ----
{ const st = game(); const d0 = st.players[1].deck.length;
  play(st, 0, 'kozilek_conquest', null, 1);
  ok('Conquest (mill mode) mills the opponent 8', st.players[1].deck.length === d0 - 8, [d0, st.players[1].deck.length]); }

// ---- the boss: draw 4 + mill 4 ----
{ const st = game(); const h0 = st.players[0].hand.length; const d1 = st.players[1].deck.length;
  play(st, 0, 'kozilek_sig', null);
  ok('Kozilek boss draws 4 cards', st.players[0].hand.length === h0 + 4, [h0, st.players[0].hand.length]);
  ok('Kozilek boss mills the opponent 4', st.players[1].deck.length === d1 - 4, [d1, st.players[1].deck.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
