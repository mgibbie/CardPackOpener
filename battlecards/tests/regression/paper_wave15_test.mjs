// paper_wave15_test.mjs — Planeswalkers (Sara/Torik/Zaxas) + Locations (Ogrefist Boulder,
// Tarnation Station). All effects already exist; only a tribes[] filter was added to add-random-card.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['sara_pyrosage', 'torik_icewind_prodigy', 'zaxas_realmscourge', 'ogrefist_boulder', 'tarnation_station'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}
ok('Sara/Torik/Zaxas are planeswalkers with abilities', ['sara_pyrosage', 'torik_icewind_prodigy', 'zaxas_realmscourge'].every(id => byId[id].type === 'planeswalker' && byId[id].abilities.length === 3 && byId[id].loyalty > 0));
ok('Ogrefist/Tarnation are Locations with taps', ['ogrefist_boulder', 'tarnation_station'].every(id => byId[id].type === 'location' && byId[id].durability === 2 && byId[id].taps.length));

function game() {
  const st = E.createGame(byId, seededRng(15), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.lands = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putPW = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'planeswalker'; st.players[pi].planeswalkers.push(c); return c; };
const putLoc = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; st.players[pi].board.push(c); return c; };
const foeC = (st) => ({ type: 'creature', uid: st._foeUid, player: 1 });

// Sara, Pyrosage — +1 deal 1 to a creature; -4 deal 5 to any
{ const st = game(); const foe = put(st, 1, '_v'); const sara = putPW(st, 0, 'sara_pyrosage');
  ok('Sara +1 deals 1 to target creature', (E.useWalker(st, 0, sara.uid, 0, { type: 'creature', uid: foe.uid, player: 1 }), foe.damage === 1 && sara.loyalty === 7), [foe.damage, sara.loyalty]); }
{ const st = game(); const sara = putPW(st, 0, 'sara_pyrosage'); const life0 = st.players[1].life;
  E.useWalker(st, 0, sara.uid, 1, { type: 'hero', player: 1 });
  ok('Sara -4 deals 5 to any target (enemy hero)', st.players[1].life === life0 - 5 && sara.loyalty === 2, [life0, st.players[1].life, sara.loyalty]); }

// Torik, Icewind Prodigy — +1 Freeze; -3 Planeshift/Excavate/Enrich (enrich makes a treasure)
{ const st = game(); const foe = put(st, 1, '_v'); const torik = putPW(st, 0, 'torik_icewind_prodigy');
  E.useWalker(st, 0, torik.uid, 0, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Torik +1 Freezes target creature', !!foe.frozen && torik.loyalty === 4, [foe.frozen, torik.loyalty]); }
{ const st = game(); const torik = putPW(st, 0, 'torik_icewind_prodigy');
  E.useWalker(st, 0, torik.uid, 1, null); // loyalty 3 -3 -> 0, effects still run
  ok('Torik -3 Enriches (a treasure_token appears)', st.players[0].artifacts.some(a => a.id === 'treasure_token'), st.players[0].artifacts.map(a => a.id)); }

// Zaxas, Realmscourge — +1 make a 1/1 Dragon Taunt; -3 Investigate (clue) among its effects
{ const st = game(); const zaxas = putPW(st, 0, 'zaxas_realmscourge');
  E.useWalker(st, 0, zaxas.uid, 0, null);
  const drag = st.players[0].board.find(c => c.name === 'Dragon');
  ok('Zaxas +1 creates a 1/1 Dragon with Taunt', drag && drag.attack === 1 && drag.maxHealth === 1 && drag.keywords.includes('taunt'), drag && [drag.attack, drag.maxHealth, drag.keywords]); }
{ const st = game(); const zaxas = putPW(st, 0, 'zaxas_realmscourge');
  E.useWalker(st, 0, zaxas.uid, 1, null); // -3
  ok('Zaxas -3 Investigates (a clue_token appears)', st.players[0].artifacts.some(a => a.id === 'clue_token'), st.players[0].artifacts.map(a => a.id)); }

// Ogrefist Boulder — tap sets a creature's stats to 6/7
{ const st = game(); const foe = put(st, 1, '_v'); const loc = putLoc(st, 0, 'ogrefist_boulder');
  const okTap = E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Ogrefist Boulder tap sets the target to 6/7', okTap && foe.attack === 6 && foe.maxHealth === 7, [okTap, foe.attack, foe.maxHealth]); }

// Tarnation Station — tap flips a coin (either a Mech token OR a card into hand)
{ const st = game(); const loc = putLoc(st, 0, 'tarnation_station');
  const b0 = st.players[0].board.length, h0 = st.players[0].hand.length;
  const okTap = E.tapLand(st, 0, loc.uid, 0, null);
  const gainedBody = st.players[0].board.length > b0, gainedCard = st.players[0].hand.length > h0;
  ok('Tarnation Station tap yields a Mech body OR a random card', okTap && (gainedBody || gainedCard), [okTap, gainedBody, gainedCard]); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid, player: 1 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
