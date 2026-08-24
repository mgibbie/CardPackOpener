// pool_wastes_test.mjs — Wastes basic pool (COLORLESS, 70, no rarity, cardClass neutral). LIGHT ENHANCEMENT:
// faithful cards left untouched; this asserts the rubric + the enhanced/repurposed cards. (wastes_pool_test.mjs
// guards the colorless/neutral/no-rarity structure; keep it green too.)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Wastes');
// ---- rubric (Wastes: colorless, neutral, no rarity) ----
ok('Wastes pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl weapon/artifact/location/enchantment', types.size >= 6 && ['weapon', 'artifact', 'location', 'enchantment'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays colorless + neutral + no rarity key', pool.every(c => Array.isArray(c.colors) && c.colors.length === 0 && c.cardClass === 'neutral' && !('rarity' in c)));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(111), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const scions = (st, pi) => st.players[pi].board.filter(c => c.name === 'Eldrazi Scion').length;

// ---- Skullclamp weapon: draw on friendly death ----
{ const st = game(); const fodder = put(st, 0, '_v'); play(st, 0, 'wastes_skullclamp', null); const h0 = st.players[0].hand.length;
  ok('Skullclamp equips a weapon', !!st.players[0].weapon);
  kill(st, fodder);
  ok('Skullclamp draws when a friendly dies', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- Sword of Fire and Ice weapon: burn + draw on hero attack ----
{ const st = game(); play(st, 0, 'wastes_sword_of_fire_and_ice', null); const life0 = st.players[1].life; const h0 = st.players[0].hand.length;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Sword of Fire and Ice deals 2 and draws after hero attacks', st.players[1].life === life0 - 2 && st.players[0].hand.length === h0 + 1, [life0, st.players[1].life]); }

// ---- Batterskull weapon: lifegain on hero attack ----
{ const st = game(); play(st, 0, 'wastes_batterskull', null); const life0 = st.players[0].life;
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Batterskull gains 4 life after hero attacks', st.players[0].life === life0 + 4, [life0, st.players[0].life]); }

// ---- phyrexian_metamorph ARTIFACT: tap +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'wastes_phyrexian_metamorph', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'wastes_phyrexian_metamorph').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Phyrexian Metamorph (artifact) taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- conduit_of_ruin LOCATION: tap for an Eldrazi Scion ----
{ const st = game(); play(st, 0, 'wastes_conduit_of_ruin', null); const loc = st.players[0].board.find(c => c.id === 'wastes_conduit_of_ruin'); const s0 = scions(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Conduit of Ruin (location) taps for a 2/2 Eldrazi Scion', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- deceiver_of_form ENCHANTMENT: turn-start Scion ----
{ const st = game(); play(st, 0, 'wastes_deceiver_of_form', null); const s0 = scions(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Deceiver of Form (enchantment) summons a Scion at turn start', scions(st, 0) === s0 + 1, [s0, scions(st, 0)]); }

// ---- Eldrazi keywords ----
{ const st = game(); const { c } = play(st, 0, 'wastes_endless_one', null);
  ok('Endless One has Trample', has(c, 'trample'), c.keywords); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
