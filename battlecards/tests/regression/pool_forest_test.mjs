// pool_forest_test.mjs — Forest basic-color pool (mono-G, 70, no rarity). LIGHT ENHANCEMENT: faithful cards
// left untouched; this asserts the rubric + the enhanced/repurposed cards.
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

const pool = raw.cards.filter(c => c.landSet === 'Forest');
// ---- rubric ----
ok('Forest pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl enchantment/artifact/location', types.size >= 6 && ['enchantment', 'artifact', 'location', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-G', pool.every(c => JSON.stringify(c.colors) === '["G"]'));
ok('carries NO rarity + uncollectible', pool.every(c => !c.rarity && c.collectible === false));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(110), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const beasts = (st, pi) => st.players[pi].board.filter(c => c.name === 'Beast').length;

// ---- blanchwood_treefolk ENCHANTMENT: turn-start bolster ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'blanchwood_treefolk', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Blanchwood Treefolk (enchantment) bolsters at turn start', v.attack === a0 + 1, [a0, v.attack]); }

// ---- cowl_prowler ARTIFACT: tap +1/+1 counter ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; play(st, 0, 'cowl_prowler', null);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'cowl_prowler').uid, { type: 'creature', uid: v.uid, player: 0 });
  ok('Cowl Prowler (artifact) taps to put a +1/+1 counter', v.attack === a0 + 1, [a0, v.attack]); }

// ---- ferocious_zheng LOCATION: tap for a Beast ----
{ const st = game(); play(st, 0, 'ferocious_zheng', null); const loc = st.players[0].board.find(c => c.id === 'ferocious_zheng'); const b0 = beasts(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const b = st.players[0].board.find(c => c.name === 'Beast');
  ok('Ferocious Zheng (location) taps for a 3/3 Trample Beast', beasts(st, 0) === b0 + 1 && b && has(b, 'trample'), [b0, beasts(st, 0)]); }

// ---- elvish_herder: ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'elvish_herder', null);
  ok('Elvish Herder gains an empty Mana Crystal', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- starved_rusalka: +2/+2 buff ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'starved_rusalka', { type: 'creature', uid: v.uid, player: 0 });
  ok('Starved Rusalka gives +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- fusion_elemental: big trampler ----
{ const st = game(); const { c } = play(st, 0, 'fusion_elemental', null);
  ok('Fusion Elemental is an 8/8 Trample', c.attack === 8 && has(c, 'trample'), [c.attack, c.keywords]); }

// ---- enhanced cards leave state valid ----
for (const id of ['craw_wurm', 'grizzly_bears', 'nessian_courser', 'chardalyn_dragon', 'bitterbow_sharpshooters', 'garruk_s_gorehorn', 'trained_armodon']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
