// pool_plains_test.mjs — Plains basic-color pool (mono-W, 70, no rarity). LIGHT ENHANCEMENT: the 54 faithful
// real-MTG cards are covered by other tests; this asserts the rubric + the enhanced/repurposed cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Plains');
// ---- rubric (basics: mono-color, no rarity, 70) ----
ok('Plains pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-W', pool.every(c => JSON.stringify(c.colors) === '["W"]'));
ok('carries NO rarity + uncollectible (basic-pool rule)', pool.every(c => !c.rarity && c.collectible === false));
const hasFx = c => !!((c.effects && c.effects.length) || c.ongoing || c.aura || c.taps || c.tapAbility || c.deathrattle || c.static);
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(106), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const soldiers = (st, pi) => st.players[pi].board.filter(c => c.name === 'Soldier').length;

// ---- ageless_guardian ARTIFACT: tap +0/+1 ----
{ const st = game(); const v = put(st, 0, '_v'); const h0 = E.hp(v); play(st, 0, 'ageless_guardian', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'ageless_guardian').uid, null);
  ok('Ageless Guardian (artifact) taps to give your creatures +0/+1', E.hp(v) === h0 + 1, [h0, E.hp(v)]); }

// ---- alaborn_trooper LOCATION: tap for a Soldier ----
{ const st = game(); play(st, 0, 'alaborn_trooper', null); const loc = st.players[0].board.find(c => c.id === 'alaborn_trooper'); const s0 = soldiers(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Alaborn Trooper (location) taps for a 1/1 Soldier', soldiers(st, 0) === s0 + 1, [s0, soldiers(st, 0)]); }

// ---- angel_of_light: evasive shielded flier ----
{ const st = game(); const { c } = play(st, 0, 'angel_of_light', null);
  ok('Angel of Light has Elusive + Divine Shield', has(c, 'elusive') && has(c, 'divine_shield') && c.shield === true, c.keywords); }

// ---- ghostly_prison ENCHANTMENT aura: your creatures +0/+2 ----
{ const st = game(); const v = put(st, 0, '_v'); const h0 = E.hp(v); play(st, 0, 'ghostly_prison', null); E.recomputeAuras(st);
  ok('Ghostly Prison gives your creatures +0/+2', E.hp(v) === h0 + 2, [h0, E.hp(v)]); }

// ---- austere_command: board wipe ----
{ const st = game(); put(st, 1, '_v'); put(st, 1, '_wall'); put(st, 0, '_v');
  play(st, 0, 'austere_command', null); E.sweepDeaths(st);
  ok('Austere Command destroys all creatures', st.players[0].board.length === 0 && st.players[1].board.length === 0, [st.players[0].board.length, st.players[1].board.length]); }

// ---- martyred_rusalka: freeze battlecry ----
{ const st = game(); const foe = put(st, 1, '_wall');
  const { c } = play(st, 0, 'martyred_rusalka', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Martyred Rusalka has Deathtouch and freezes an enemy', has(c, 'deathtouch') && !!foe.frozen, [c.keywords, foe.frozen]); }

// ---- the enhanced cards leave state valid ----
for (const id of ['giant_killer', 'elite_vanguard', 'savannah_lions', 'serra_avenger', 'abbey_griffin', 'armored_pegasus', 'alabaster_kirin', 'alpine_watchdog', 'farewell']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
