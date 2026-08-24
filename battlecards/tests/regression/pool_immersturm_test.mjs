// pool_immersturm_test.mjs — Immersturm land pool (BR / Kaldheim realm, 30 cards: Demons/Devils + sacrifice/aristocrats + burn + haste + Berserker aggro).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const devils = (st, pi) => st.players[pi].board.filter(c => c.name === 'Devil').length;

const pool = raw.cards.filter(c => c.landSet === 'Immersturm');
// ---- rubric ----
ok('Immersturm pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BR', pool.every(c => JSON.stringify(c.colors) === '["B","R"]'));
ok('all names contain Immersturm + uncollectible', pool.every(c => /immersturm/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(99), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const hand = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].hand.push(E.instantiate(byId._v, pi)); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); hand(st, 1, 3); let threw = null;
  const foeTgt = ['immersturm_devil', 'immersturm_pyromancer', 'weigh_down'].includes(c.id);
  const frTgt = ['demonic_gifts', 'immersturm_runeseal'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Kardur: reach ----
{ const st = game(); const life0 = st.players[1].life;
  const { c } = play(st, 0, 'kardur_doomscourge', null);
  ok('Kardur deals 2 to each opp and has Lifesteal', st.players[1].life === life0 - 2 && has(c, 'lifesteal'), [life0, st.players[1].life]); }

// ---- Devil pings on death ----
{ const st = game(); play(st, 0, 'immersturm_monument', null); const loc = st.players[0].board.find(c => c.id === 'immersturm_monument');
  E.tapLand(st, 0, loc.uid, 0); const devil = st.players[0].board.find(c => c.name === 'Devil'); const life0 = st.players[1].life;
  ok('Monument taps for a Devil', devils(st, 0) === 1, devils(st, 0));
  kill(st, devil);
  ok('a Devil deals 1 to the opponent when it dies', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- death ritual enchantment: aristocrat burn ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'immersturm_death_ritual', null); const life0 = st.players[1].life;
  kill(st, fodder);
  ok('Death Ritual deals 1 to each opp when a friendly dies', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- legend artifact: tap for a Devil ----
{ const st = game(); play(st, 0, 'legend_of_immersturm', null); const d0 = devils(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'legend_of_immersturm').uid, null);
  ok('Legend taps for a Devil', devils(st, 0) === d0 + 1, [d0, devils(st, 0)]); }

// ---- raze: sweep ----
{ const st = game(); const a = put(st, 1, '_v'); const b = put(st, 1, '_wall');
  play(st, 0, 'raze_immersturm', null);
  ok('Raze deals 3 to all enemy creatures', a.damage === 3 && b.damage === 3, [a.damage, b.damage]); }

// ---- execution instant: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'weigh_down', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Execution deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- NEW Egon: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'immersturm_egon', null);
  ok('Egon deals 2 to each opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- NEW Draugr's Helm weapon: burn on hero attack ----
{ const st = game(); play(st, 0, 'immersturm_draugrs_helm', null); const life0 = st.players[1].life;
  ok("Draugr's Helm equips a weapon", !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok("Draugr's Helm deals 1 to the opponent after the hero attacks", st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
