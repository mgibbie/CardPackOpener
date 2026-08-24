// pool_mountain_test.mjs — Mountain basic-color pool (mono-R, 70, no rarity). LIGHT ENHANCEMENT: faithful cards
// left untouched; this asserts the rubric + the enhanced/repurposed cards.
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

const pool = raw.cards.filter(c => c.landSet === 'Mountain');
// ---- rubric ----
ok('Mountain pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-R', pool.every(c => JSON.stringify(c.colors) === '["R"]'));
ok('carries NO rarity + uncollectible', pool.every(c => !c.rarity && c.collectible === false));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(109), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const soldiers = (st, pi) => st.players[pi].board.filter(c => c.name === 'Soldier').length;

// ---- cobblebrute ARTIFACT: tap burn ----
{ const st = game(); const foe = put(st, 1, '_wall'); play(st, 0, 'cobblebrute', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'cobblebrute').uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Cobblebrute (artifact) taps to deal 2 to a target', foe.damage === 2, foe.damage); }

// ---- capital_guard LOCATION: tap for a Soldier ----
{ const st = game(); play(st, 0, 'capital_guard', null); const loc = st.players[0].board.find(c => c.id === 'capital_guard'); const s0 = soldiers(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const s = st.players[0].board.find(c => c.name === 'Soldier');
  ok('Capital Guard (location) taps for a Rush Soldier', soldiers(st, 0) === s0 + 1 && s && has(s, 'rush'), [s0, soldiers(st, 0)]); }

// ---- ember_hauler: burn battlecry ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'ember_hauler', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Ember Hauler deals 2 to any target', foe.damage === 2, foe.damage); }

// ---- mogg_fanatic: burn battlecry ----
{ const st = game(); const life0 = st.players[1].life;
  play(st, 0, 'mogg_fanatic', { type: 'hero', player: 1 });
  ok('Mogg Fanatic deals 1 to any target', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- goblin_bushwhacker: anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'goblin_bushwhacker', null);
  ok('Goblin Bushwhacker gives your creatures +1/+0', v.attack === a0 + 1, [a0, v.attack]); }

// ---- axegrinder_giant: trample beater ----
{ const st = game(); const { c } = play(st, 0, 'axegrinder_giant', null);
  ok('Axegrinder Giant has Trample', has(c, 'trample'), c.keywords); }

// ---- enhanced cards leave state valid ----
for (const id of ['goblin_sledder', 'blazing_rootwalla', 'bold_impaler', 'boggart_brute', 'canyon_minotaur', 'bonebreaker_giant', 'barbarian_horde', 'scorched_rusalka']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
