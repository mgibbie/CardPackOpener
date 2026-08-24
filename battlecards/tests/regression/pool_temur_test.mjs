// pool_temur_test.mjs — Temur land pool (GRU / Tarkir wedge, 30 cards: big Beasts + ferocious + ramp + fight/burn + trample).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Temur');
// ---- rubric ----
ok('Temur pool has 30 cards', pool.length === 30, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GRU (order G,R,U)', pool.every(c => JSON.stringify(c.colors) === '["G","R","U"]'));
ok('all names contain Temur + uncollectible', pool.every(c => /temur/i.test(c.name) && c.collectible === false));

function game() {
  const st = E.createGame(byId, seededRng(90), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep (all 30) ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = ['temur_avalanche_tusker', 'temur_charm', 'temur_command', 'temur_pyromancer'].includes(c.id);
  const frTgt = ['temur_battle_rage', 'temur_runemark'].includes(c.id);
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Surrak: ferocious anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'temur_surrak', null);
  ok('Surrak gives your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }

// ---- avalanche tusker: burn ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'temur_avalanche_tusker', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Avalanche Tusker deals 4 to a creature', foe.damage === 4, foe.damage); }

// ---- ascendancy enchantment: turn-start draw ----
{ const st = game(); play(st, 0, 'temur_ascendancy', null); const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Ascendancy draws a card at turn start', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- monument artifact: tap for a Beast ----
{ const st = game(); play(st, 0, 'temur_monument', null); const b0 = named(st, 0, 'Beast');
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'temur_monument').uid, null);
  const b = st.players[0].board.find(c => c.name === 'Beast');
  ok('Monument taps for a 4/4 Trample Beast', named(st, 0, 'Beast') === b0 + 1 && b && b.attack === 4 && has(b, 'trample'), [b0, named(st, 0, 'Beast')]); }

// ---- banner location: tap for mana + scry ----
{ const st = game(); play(st, 0, 'temur_banner', null); const loc = st.players[0].board.find(c => c.id === 'temur_banner'); const bonus0 = st.players[0].mana.bonus;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Banner taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- battle rage instant: +3/+0 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'temur_battle_rage', { type: 'creature', uid: v.uid, player: 0 });
  ok('Battle Rage gives +3/+0 and Trample', v.attack === a0 + 3 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- war chant sorcery: anthem + rush ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'temur_war_chant', null);
  ok('War Chant gives your creatures +1/+1 and Rush', v.attack === a0 + 1 && has(v, 'rush'), [a0, v.attack, v.keywords]); }

// ---- NEW Rattleclaw Mystic: ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'temur_rattleclaw_mystic', null);
  ok('Rattleclaw Mystic gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- NEW Bear's Companion: a 4/4 Bear ----
{ const st = game(); const bears0 = named(st, 0, 'Bear');
  play(st, 0, 'temur_bears_companion', null);
  const bear = st.players[0].board.find(c => c.name === 'Bear');
  ok("Bear's Companion summons a 4/4 Taunt Bear", named(st, 0, 'Bear') === bears0 + 1 && bear && bear.attack === 4 && has(bear, 'taunt'), [bears0, named(st, 0, 'Bear')]); }

// ---- NEW Surrak Hunt Caller: grant Charge ----
{ const st = game(); const v = put(st, 0, '_v', true);
  play(st, 0, 'temur_surrak_hunt_caller', null);
  ok('Surrak the Hunt Caller gives your creatures Charge', has(v, 'charge'), v.keywords); }

// ---- NEW Thunderbreak Regent: reach ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'temur_thunderbreak_regent', null);
  ok('Thunderbreak Regent deals 3 to each opponent', st.players[1].life === life0 - 3, [life0, st.players[1].life]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
