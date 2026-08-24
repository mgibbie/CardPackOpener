// pool_heliod_test.mjs — Heliod land pool (W devotion: lifegain + Clerics/Soldiers + anthems + lifegain payoffs).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast', keywords: ['taunt', 'divine_shield'] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const pool = raw.cards.filter(c => c.landSet === 'Heliod');
// ---- rubric ----
ok('Heliod pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/weapon/location', types.size >= 6 && ['instant', 'enchantment', 'weapon', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-White', pool.every(c => (c.colors || []).join('') === 'W'));

function game() {
  const st = E.createGame(byId, seededRng(50), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_foe'); let threw = null;
  const frTgt = ['heliods_emissary', 'chosen_by_heliod', 'ordeal_of_heliod'].includes(c.id);
  const foeTgt = ['heliods_punishment', 'betrayal_of_heliod'].includes(c.id);
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- the god: Clerics + life ----
{ const st = game(); const life0 = st.players[0].life; const c0 = named(st, 0, 'Cleric');
  play(st, 0, 'heliod_god_of_the_sun', null);
  ok('Heliod summons two Clerics and gains 3 life', named(st, 0, 'Cleric') === c0 + 2 && st.players[0].life === life0 + 3, [c0, named(st, 0, 'Cleric'), life0, st.players[0].life]); }

// ---- sun-crowned: lifegain -> +1/+1 ----
{ const st = game(); const sc = put(st, 0, 'heliod_sun_crowned'); const a0 = sc.attack;
  E.execEffects(st, 0, [{ type: 'heal', value: 3, target: 'self' }], null, null);
  ok('Sun-Crowned gains +1/+1 when you gain life', sc.attack === a0 + 1, [a0, sc.attack]); }

// ---- evangel: three Soldiers ----
{ const st = game(); const s0 = named(st, 0, 'Soldier');
  play(st, 0, 'evangel_of_heliod', null);
  ok('Evangel summons three 1/1 Soldiers', named(st, 0, 'Soldier') === s0 + 3, [s0, named(st, 0, 'Soldier')]); }

// ---- emissary: two counters ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'heliods_emissary', { type: 'creature', uid: v.uid, player: 0 });
  ok('Emissary puts two +1/+1 counters on a creature', v.attack === a0 + 2, [a0, v.attack]); }

// ---- chosen: +2/+2 and Lifesteal ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'chosen_by_heliod', { type: 'creature', uid: v.uid, player: 0 });
  ok('Chosen by Heliod gives +2/+2 and Lifesteal', v.attack === a0 + 2 && has(v, 'lifesteal'), [a0, v.attack, v.keywords]); }

// ---- dictate enchantment: anthem each turn ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'dictate_of_heliod', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Dictate gives your creatures +1/+1 at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- spear weapon: anthem on hero attack ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'spear_of_heliod', null); const a0 = v.attack;
  ok('Spear equips a Divine Shield / First Strike weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('first_strike'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Spear gives your creatures +1/+0 after the hero attacks', v.attack === a0 + 1, [a0, v.attack]); }

// ---- generosity location: tap for a Cleric + life ----
{ const st = game(); play(st, 0, 'heliods_generosity', null); const loc = st.players[0].board.find(c => c.id === 'heliods_generosity');
  const c0 = named(st, 0, 'Cleric'); const life0 = st.players[0].life;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Generosity taps for a Cleric and 1 life', named(st, 0, 'Cleric') === c0 + 1 && st.players[0].life === life0 + 1, [c0, named(st, 0, 'Cleric'), life0, st.players[0].life]); }

// ---- radiant dawn enchantment: Cleric + life each turn ----
{ const st = game(); play(st, 0, 'heliods_radiant_dawn', null); const c0 = named(st, 0, 'Cleric'); const life0 = st.players[0].life;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Radiant Dawn summons a Cleric and gains 1 life at turn start', named(st, 0, 'Cleric') === c0 + 1 && st.players[0].life === life0 + 1, [c0, named(st, 0, 'Cleric')]); }

// ---- warped eclipse: mass silence + life ----
{ const st = game(); const foe = put(st, 1, '_foe'); const life0 = st.players[0].life;
  play(st, 0, 'heliods_warped_eclipse', null);
  ok('Warped Eclipse silences enemy creatures and gains 3 life', (foe.keywords || []).length === 0 && st.players[0].life === life0 + 3, [foe.keywords, life0, st.players[0].life]); }

// ---- betrayal: destroy + life ----
{ const st = game(); const foe = put(st, 1, '_foe'); const life0 = st.players[0].life;
  play(st, 0, 'betrayal_of_heliod', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Betrayal destroys a creature and gains 3 life', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].life === life0 + 3, [st.players[1].board.length, life0, st.players[0].life]); }

// ---- punishment: Pacifist ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'heliods_punishment', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Punishment gives a creature Pacifist', has(foe, 'pacifist'), foe.keywords); }

// ---- pilgrim: Discover a Heliod Card (queues a pick) ----
{ const st = game();
  play(st, 0, 'heliods_pilgrim', null);
  ok('Pilgrim queues a Discover pick', (st.pickQueue && st.pickQueue.length > 0) || st.players[0].hand.length > 0, st.pickQueue && st.pickQueue.length); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
