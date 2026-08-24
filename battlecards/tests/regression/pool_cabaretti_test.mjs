// pool_cabaretti_test.mjs — Cabaretti land pool (RGW / Naya tri-color: Alliance/go-wide + Cat & Human tokens + anthems + haste).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._plain = { id: '_plain', name: 'P', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const cats = (st, pi) => st.players[pi].board.filter(c => c.name === 'Cat').length;
const humans = (st, pi) => st.players[pi].board.filter(c => c.name === 'Human').length;

const pool = raw.cards.filter(c => c.landSet === 'Cabaretti');
// ---- rubric ----
ok('Cabaretti pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl instant/enchantment/artifact/location', types.size >= 6 && ['instant', 'enchantment', 'artifact', 'location'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays RGW (order W,R,G)', pool.every(c => JSON.stringify(c.colors) === '["W","R","G"]'));

function game() {
  const st = E.createGame(byId, seededRng(80), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); put(st, 1, '_v'); let threw = null;
  const frTgt = c.id === 'cabaretti_charm';
  const tgt = frTgt ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- Jetmir: go-wide finisher (+2/+0 and Trample) ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'jetmir_cabaretti_boss', null);
  ok('Jetmir gives your creatures +2/+0 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- Rocco: two Cats ----
{ const st = game(); const c0 = cats(st, 0);
  play(st, 0, 'rocco_cabaretti_caterer', null);
  ok('Rocco summons two 2/2 Cats', cats(st, 0) === c0 + 2, [c0, cats(st, 0)]); }

// ---- Kitt: grant Charge ----
{ const st = game(); const v = put(st, 0, '_v', true); const a0 = v.attack;
  play(st, 0, 'kitt_kanto_cabaretti_diva', null);
  ok('Kitt gives your creatures +1/+0 and Charge', v.attack === a0 + 1 && has(v, 'charge'), [a0, v.attack, v.keywords]); }

// ---- Jinnie: two Cats ----
{ const st = game(); const c0 = cats(st, 0);
  play(st, 0, 'jinnie_faye_cabaretti_heir', null);
  ok('Jinnie summons two 2/2 Cats', cats(st, 0) === c0 + 2, [c0, cats(st, 0)]); }

// ---- ascendancy enchantment: Alliance (creature enters -> team +1/+0) ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'cabaretti_ascendancy', null); const a0 = v.attack;
  play(st, 0, '_plain', null); // a creature enters -> Alliance fires
  ok('Ascendancy gives your creatures +1/+0 when a creature enters', v.attack >= a0 + 1, [a0, v.attack]); }

// ---- initiate: a Human ----
{ const st = game(); const h0 = humans(st, 0);
  play(st, 0, 'cabaretti_initiate', null);
  ok('Initiate summons a 1/1 Human', humans(st, 0) === h0 + 1, [h0, humans(st, 0)]); }

// ---- charm: +2/+2 and Trample ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'cabaretti_charm', { type: 'creature', uid: v.uid, player: 0 });
  ok('Charm gives +2/+2 and Trample', v.attack === a0 + 2 && has(v, 'trample'), [a0, v.attack, v.keywords]); }

// ---- confluence: two Cats + anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const c0 = cats(st, 0);
  play(st, 0, 'cabaretti_confluence', null);
  ok('Confluence summons two Cats and gives +1/+1', cats(st, 0) === c0 + 2 && v.attack === a0 + 1, [c0, cats(st, 0), a0, v.attack]); }

// ---- revels: three Cats ----
{ const st = game(); const c0 = cats(st, 0);
  play(st, 0, 'cabaretti_revels', null);
  ok('Revels summons three 1/1 Cats', cats(st, 0) === c0 + 3, [c0, cats(st, 0)]); }

// ---- arming gala: anthem ----
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'cabaretti_arming_gala', null);
  ok('Arming Gala gives your creatures +2/+2', v.attack === a0 + 2, [a0, v.attack]); }

// ---- hymn artifact: tap for a Cat ----
{ const st = game(); play(st, 0, 'cabaretti_hymn', null); const c0 = cats(st, 0);
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'cabaretti_hymn').uid, null);
  ok('Hymn taps for a 2/2 Cat', cats(st, 0) === c0 + 1, [c0, cats(st, 0)]); }

// ---- command location: tap for a Cat ----
{ const st = game(); play(st, 0, 'cabaretti_command', null); const loc = st.players[0].board.find(c => c.id === 'cabaretti_command'); const c0 = cats(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  ok('Command taps for a 2/2 Cat', cats(st, 0) === c0 + 1, [c0, cats(st, 0)]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
