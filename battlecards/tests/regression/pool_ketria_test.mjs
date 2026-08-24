// pool_ketria_test.mjs — Ketria land pool (GUR / Temur tri-color: ramp + big Elementals + draw + burn).
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
const elems = (st, pi) => st.players[pi].board.filter(c => c.name === 'Elemental').length;

const pool = raw.cards.filter(c => c.landSet === 'Ketria');
// ---- rubric ----
ok('Ketria pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays GUR (order U,R,G)', pool.every(c => JSON.stringify(c.colors) === '["U","R","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(82), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); let threw = null;
  const foeTgt = c.id === 'naireh_ketria_elementalist';
  const frTgt = c.id === 'ketria_boon';
  const tgt = foeTgt ? { type: 'creature', uid: foe.uid, player: 1 } : frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Illuna: draw 2 + a 5/5 Elemental ----
{ const st = game(); const e0 = elems(st, 0); const h0 = st.players[0].hand.length;
  play(st, 0, 'illuna_ketria_wish_giver', null);
  const el = st.players[0].board.find(c => c.name === 'Elemental');
  ok('Illuna draws 2 and summons a 5/5 Trample Elemental', st.players[0].hand.length === h0 + 2 && elems(st, 0) === e0 + 1 && el && el.attack === 5 && has(el, 'trample'), [h0, st.players[0].hand.length, e0, elems(st, 0)]); }

// ---- gimmerbell: permanent ramp ----
{ const st = game(); const max0 = st.players[0].mana.max;
  play(st, 0, 'ketria_gimmerbell', null);
  ok('Gimmerbell gains an empty Mana Crystal (max +1)', st.players[0].mana.max === max0 + 1, [max0, st.players[0].mana.max]); }

// ---- mythos: draw 2 + ramp ----
{ const st = game(); const max0 = st.players[0].mana.max; const h0 = st.players[0].hand.length;
  play(st, 0, 'ketria_mythos', null);
  ok('Mythos draws 2 and gains a Mana Crystal', st.players[0].hand.length === h0 + 2 && st.players[0].mana.max === max0 + 1, [h0, st.players[0].hand.length, max0, st.players[0].mana.max]); }

// ---- bond enchantment: ramp each turn ----
{ const st = game(); play(st, 0, 'ketria_bond', null); const bonus0 = st.players[0].mana.bonus;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Bond grants +2 bonus mana at turn start', st.players[0].mana.bonus === bonus0 + 2, [bonus0, st.players[0].mana.bonus]); }

// ---- crystal artifact: tap ramp + scry ----
{ const st = game(); play(st, 0, 'ketria_crystal', null); const bonus0 = st.players[0].mana.bonus;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'ketria_crystal').uid, null);
  ok('Crystal taps for +1 bonus mana', st.players[0].mana.bonus === bonus0 + 1, [bonus0, st.players[0].mana.bonus]); }

// ---- crystal hymn location: tap for an Elemental ----
{ const st = game(); play(st, 0, 'ketria_crystal_hymn', null); const loc = st.players[0].board.find(c => c.id === 'ketria_crystal_hymn'); const e0 = elems(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Crystal Hymn taps for a 3/3 Trample Elemental', elems(st, 0) === e0 + 1, [e0, elems(st, 0)]); }

// ---- boon: +3/+3 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'ketria_boon', { type: 'creature', uid: v.uid, player: 0 });
  ok('Boon gives +3/+3 and Trample', v.attack === a0 + 3 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- naireh: burn a creature ----
{ const st = game(); const foe = put(st, 1, '_wall');
  play(st, 0, 'naireh_ketria_elementalist', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Naireh deals 3 to a creature', foe.damage === 3, foe.damage); }

// ---- gemstone amalgam: scry + draw ----
{ const st = game(); const h0 = st.players[0].hand.length;
  play(st, 0, 'ketria_gemstone_amalgam', null);
  ok('Gemstone Amalgam draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
