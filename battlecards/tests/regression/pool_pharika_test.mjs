// pool_pharika_test.mjs — Pharika land pool (BG devotion: deathtouch + Snakes + recursion + lifegain).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 5, attack: 5, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const snakes = (st, pi) => st.players[pi].board.filter(c => c.name === 'Snake').length;

const pool = raw.cards.filter(c => c.landSet === 'Pharika');
// ---- rubric ----
ok('Pharika pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/location/enchantment/artifact', types.size >= 6 && ['instant', 'location', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BG', pool.every(c => (c.colors || []).slice().sort().join('') === 'BG'));

function game() {
  const st = E.createGame(byId, seededRng(61), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_big'); hand(st, 1, 2); let threw = null;
  const tgt = (c.id === 'pharikas_heirophant') ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: battlecry Snakes + death engine ----
{ const st = game(); const s0 = snakes(st, 0);
  play(st, 0, 'pharika_god_of_affliction', null);
  ok('Pharika battlecry summons two Deathtouch Snakes', snakes(st, 0) === s0 + 2 && st.players[0].board.some(c => c.name === 'Snake' && has(c, 'deathtouch')), [s0, snakes(st, 0)]);
  const s1 = snakes(st, 0); const fodder = put(st, 0, '_v'); kill(st, fodder);
  ok('Pharika: a friendly death summons a Snake', snakes(st, 0) === s1 + 1, [s1, snakes(st, 0)]); }

// ---- mender: lifegain ----
{ const st = game(); const life0 = st.players[0].life;
  const { c } = play(st, 0, 'pharikas_mender', null);
  ok('Mender gains 4 life and has Lifesteal', st.players[0].life === life0 + 4 && has(c, 'lifesteal'), [life0, st.players[0].life]); }

// ---- heirophant: +1/+1 and Deathtouch ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'pharikas_heirophant', { type: 'creature', uid: v.uid, player: 0 });
  ok('Heirophant gives +1/+1 and Deathtouch', v.attack === a0 + 1 && has(v, 'deathtouch'), [a0, v.attack, v.keywords]); }

// ---- spawn location: tap for a Snake ----
{ const st = game(); play(st, 0, 'pharikas_spawn', null); const loc = st.players[0].board.find(c => c.id === 'pharikas_spawn'); const s0 = snakes(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Spawn taps for a 1/1 Deathtouch Snake', snakes(st, 0) === s0 + 1 && st.players[0].board.some(c => c.name === 'Snake' && has(c, 'deathtouch')), [s0, snakes(st, 0)]); }

// ---- cure: lifegain ----
{ const st = game(); const life0 = st.players[0].life;
  play(st, 0, 'pharikas_cure', null);
  ok('Cure gains 5 life', st.players[0].life === life0 + 5, [life0, st.players[0].life]); }

// ---- libation: discard + life ----
{ const st = game(); hand(st, 1, 2); const life0 = st.players[0].life;
  play(st, 0, 'pharikas_libation', null);
  ok('Libation: opponent discards and you gain 3', st.players[1].hand.length === 1 && st.players[0].life === life0 + 3, [st.players[1].hand.length, life0, st.players[0].life]); }

// ---- infusion enchantment: Deathtouch to played creatures ----
{ const st = game(); play(st, 0, 'pharikas_infusion', null);
  const { c } = play(st, 0, '_v', null);
  ok('Infusion gives a freshly played creature Deathtouch', has(c, 'deathtouch'), c.keywords); }

// ---- malady artifact: tap to sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_big'); play(st, 0, 'pharikas_malady', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'pharikas_malady').uid, null);
  ok('Malady taps to deal 1 to all enemy creatures', a.damage === 1 && b.damage === 1, [a.damage, b.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
