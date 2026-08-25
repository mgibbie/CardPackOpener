// pool_island_test.mjs — Island basic-color pool (mono-U, 70, no rarity). LIGHT ENHANCEMENT: faithful cards
// (incl. all counterspells via counterSpell:true) left untouched; this asserts the rubric + the enhanced cards.
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

const pool = raw.cards.filter(c => c.landSet === 'Island');
// ---- rubric ----
ok('Island pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-U', pool.every(c => JSON.stringify(c.colors) === '["U"]'));
ok('carries NO rarity + uncollectible', pool.every(c => !c.rarity && c.collectible === false));
ok('counterspells still counter (counterSpell:true preserved)', ['counterspell', 'negate', 'dispel', 'force_of_will'].every(id => byId[id].counterSpell === true));
const hasFx = c => !!((c.effects && c.effects.length) || c.ongoing || c.aura || c.taps || c.tapAbility || c.deathrattle || c.static || c.counterSpell || c.choices);
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(107), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const merfolk = (st, pi) => st.players[pi].board.filter(c => c.name === 'Merfolk').length;

// ---- lumengrid_warden ARTIFACT: tap draw ----
{ const st = game(); play(st, 0, 'lumengrid_warden', null); const h0 = st.players[0].hand.length;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'lumengrid_warden').uid, null);
  E.resolveScry(st, []); ok('Lumengrid Warden (artifact) taps to draw', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

// ---- fortress_crab LOCATION: tap for a Merfolk ----
{ const st = game(); play(st, 0, 'fortress_crab', null); const loc = st.players[0].board.find(c => c.id === 'fortress_crab'); const m0 = merfolk(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const m = st.players[0].board.find(c => c.name === 'Merfolk');
  ok('Fortress Crab (location) taps for a Taunt Merfolk', merfolk(st, 0) === m0 + 1 && m && has(m, 'taunt'), [m0, merfolk(st, 0)]); }

// ---- cloud_manta: elusive windfury flier ----
{ const st = game(); const { c } = play(st, 0, 'cloud_manta', null);
  ok('Cloud Manta has Elusive + Windfury', has(c, 'elusive') && has(c, 'windfury'), c.keywords); }

// ---- ancient_crab: taunt divine shield wall ----
{ const st = game(); const { c } = play(st, 0, 'ancient_crab', null);
  ok('Ancient Crab has Taunt + Divine Shield', has(c, 'taunt') && has(c, 'divine_shield') && c.shield === true, c.keywords); }

// ---- merfolk_looter: loot ----
{ const st = game(); st.players[0].hand.push(E.instantiate(byId._v, 0)); const h0 = st.players[0].hand.length;
  play(st, 0, 'merfolk_looter', null);
  ok('Merfolk Looter draws then discards (net hand unchanged after playing self)', st.players[0].hand.length === h0, [h0, st.players[0].hand.length]); }

// ---- waterfront_bouncer: bounce ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'waterfront_bouncer', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Waterfront Bouncer returns a creature to hand', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- sigiled_starfish: scry + taunt ----
{ const st = game(); const { c } = play(st, 0, 'sigiled_starfish', null);
  ok('Sigiled Starfish has Taunt', has(c, 'taunt'), c.keywords); }

// ---- enhanced cards leave state valid ----
for (const id of ['wind_drake', 'storm_crow', 'air_elemental', 'giant_octopus', 'horned_turtle', 'coral_commando', 'naga_eternal', 'tolarian_scholar']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
