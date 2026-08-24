// pool_riveteers_test.mjs — Riveteers land pool (BRG / Jund tri-color: Blitz aggression + Treasure ramp + Devils + sacrifice).
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

const pool = raw.cards.filter(c => c.landSet === 'Riveteers');
// ---- rubric ----
ok('Riveteers pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/location/weapon', types.size >= 6 && ['instant', 'enchantment', 'location', 'weapon'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays BRG (order B,R,G)', pool.every(c => JSON.stringify(c.colors) === '["B","R","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(79), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['riveteers_provocateur', 'riveteers_charm', 'riveteers_confluence'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Ziatora: two Devils that ping on death ----
{ const st = game(); const d0 = devils(st, 0);
  play(st, 0, 'ziatora_riveteers_incinerator', null);
  ok('Ziatora summons two Devils', devils(st, 0) === d0 + 2, [d0, devils(st, 0)]);
  const devil = st.players[0].board.find(c => c.name === 'Devil'); const life0 = st.players[1].life;
  kill(st, devil);
  ok('a Devil deals 1 to the opponent when it dies', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- Henzie: grant Charge ----
{ const st = game(); const v = put(st, 0, '_v', true);
  play(st, 0, 'henzie_torre_riveteers_thief', null);
  ok('Henzie gives your creatures Charge', has(v, 'charge'), v.keywords); }

// ---- Blitz: initiate draws when it dies ----
{ const st = game(); const c = put(st, 0, 'riveteers_initiate'); const h0 = st.players[0].hand.length;
  ok('Initiate has Charge', has(c, 'charge'));
  kill(st, c);
  ok('Initiate draws a card when it dies (Blitz)', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- Ognis: Treasure ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'ognis_riveteers_warrior', null);
  ok('Ognis gains an empty Mana Crystal (max +1)', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- ascendancy enchantment: blaze-of-glory death payoff ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'riveteers_ascendancy', null); const life0 = st.players[1].life;
  kill(st, fodder);
  ok('Ascendancy deals 2 to each opponent when a friendly dies', st.players[1].life === life0 - 2, [life0, st.players[1].life]); }

// ---- command location: tap for a Devil ----
{ const st = game(); play(st, 0, 'riveteers_command', null); const loc = st.players[0].board.find(c => c.id === 'riveteers_command'); const d0 = devils(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Command taps for a Devil', devils(st, 0) === d0 + 1, [d0, devils(st, 0)]); }

// ---- beatstick weapon: rally on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'riveteers_beatstick', null); const a0 = v.attack;
  ok('Beatstick equips a weapon', !!st.players[0].weapon);
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Beatstick gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- charm: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'riveteers_charm', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Charm deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- confluence: removal + Treasure ----
{ const st = game(); const foe = put(st, 1, '_wall'); const max0 = st.players[0].mana.max;
  play(st, 0, 'riveteers_confluence', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Confluence deals 3 and gains a Mana Crystal', foe.damage === 3 && st.players[0].mana.max === max0 + 1, [foe.damage, max0, st.players[0].mana.max]); }

// ---- provocateur: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'riveteers_provocateur', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Provocateur deals 1 to a creature', foe.damage === 1, foe.damage); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
