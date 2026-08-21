// paper_wave12_test.mjs — Eagill buff-trio, Luto (grant DS+Elusive / Inspire Plunder),
// Tabaxi Transmogrifier (transform-same-cost), Duskana (per-2/2 draw / Swing / Frenzy).
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { staticValue } from '../../engine/auras.js';
import { fireOngoing } from '../../engine/triggers.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._plund = { id: '_plund', name: 'Loot', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['eagill', 'morwynn_eagill', 'gold_morwynn_eagill', 'luto_exalted_rebel', 'tabaxi_transmogrifier', 'duskana_the_rage_mother'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(12), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// helper: assert the "another random friendly + random hand creature each +2/+3" payload landed
function assertEagillPayload(label, st) {
  const boardV = st.players[0].board.find(c => c.id === '_v');
  const handV = st.players[0].hand.find(c => c.id === '_v');
  ok(`${label}: the other friendly creature got +2/+3`, boardV && boardV.attack === 4 && boardV.maxHealth === 5, boardV && [boardV.attack, boardV.maxHealth]);
  ok(`${label}: the hand creature got +2/+3`, handV && handV.attack === 4 && handV.maxHealth === 5, handV && [handV.attack, handV.maxHealth]);
}

// Eagill — Battlecry buffs one other friendly + one hand creature
{ const st = game(); put(st, 0, '_v'); toHand(st, 0, '_v');
  const e = toHand(st, 0, 'eagill'); E.playCard(st, 0, e.uid, null);
  assertEagillPayload('Eagill Battlecry', st); }

// Morwynn Eagill — Deathrattle does the same
{ const st = game(); put(st, 0, '_v'); toHand(st, 0, '_v');
  const m = put(st, 0, 'morwynn_eagill'); runDeathrattle(st, 0, m);
  assertEagillPayload('Morwynn Eagill Deathrattle', st); }

// Gold Morwynn Eagill — Inspire (hero-power-used) does the same
{ const st = game(); put(st, 0, '_v'); toHand(st, 0, '_v');
  put(st, 0, 'gold_morwynn_eagill'); fireOngoing(st, 0, 'hero-power-used', {});
  assertEagillPayload('Gold Morwynn Eagill Inspire', st); }

// Luto — Battlecry grants Divine Shield & Hexproof(elusive) to the target; Inspire Plunders
{ const st = game(); const tgt = put(st, 0, '_v');
  const l = toHand(st, 0, 'luto_exalted_rebel'); E.playCard(st, 0, l.uid, { type: 'creature', uid: tgt.uid, player: 0 });
  ok('Luto grants Divine Shield to the target', tgt.keywords.includes('divine_shield') && tgt.shield === true, tgt.keywords);
  ok('Luto grants Hexproof (elusive) to the target', tgt.keywords.includes('elusive'), tgt.keywords);
  // Inspire: Plunder — steal the top of the enemy deck into your hand
  st.players[1].deck = ['_plund']; const h0 = st.players[0].hand.length;
  fireOngoing(st, 0, 'hero-power-used', {});
  ok('Luto Inspire Plunders the enemy deck top', st.players[0].hand.some(c => c.id === '_plund') && st.players[0].hand.length === h0 + 1, st.players[0].hand.map(c => c.id)); }

// Tabaxi Transmogrifier — transform target creature into a random equal-cost creature
{ const st = game(); const foe = put(st, 1, '_v'); const origUid = foe.uid; const origCost = byId._v.cost;
  const t = toHand(st, 0, 'tabaxi_transmogrifier'); E.playCard(st, 0, t.uid, { type: 'creature', uid: foe.uid, player: 1 });
  const now = st.players[1].board.filter(c => c.type === 'creature');
  ok('Tabaxi leaves exactly one creature on the enemy board', now.length === 1, now.map(c => c.id));
  ok('Tabaxi made a NEW instance (transformed, not the original uid)', now.length === 1 && now[0].uid !== origUid, now.map(c => c.uid));
  ok('the transformed creature has an equal Mana Cost', now.length === 1 && (byId[now[0].id]?.cost ?? -1) === origCost, now.map(c => [c.id, byId[c.id]?.cost])); }

// Duskana — Battlecry draws one per 2/2 you control; Swing makes a 2/2 Beast; Frenzy destroys a non-creature permanent
{ const st = game(); put(st, 0, '_v'); put(st, 0, '_v'); // two 2/2 creatures
  st.players[0].deck = ['_v', '_v', '_v', '_v'];
  const d = toHand(st, 0, 'duskana_the_rage_mother'); const h0 = st.players[0].hand.length;
  E.playCard(st, 0, d.uid, null);
  // played Duskana (hand -1) then drew 2 (the two 2/2s) -> net +1
  ok('Duskana Battlecry draws one card per 2/2 creature (drew 2)', st.players[0].hand.length === h0 - 1 + 2, [h0, st.players[0].hand.length]);
  const duskana = st.players[0].board.find(c => c.id === 'duskana_the_rage_mother'); duskana.sick = false;
  const beastsBefore = st.players[0].board.filter(c => c.name === 'Beast').length;
  E.attack(st, 0, duskana.uid, { type: 'hero', player: 1 });
  ok('Duskana Swing summons a 2/2 Beast on attack', st.players[0].board.filter(c => c.name === 'Beast').length === beastsBefore + 1, st.players[0].board.map(c => c.name)); }
{ const st = game(); const duskana = put(st, 0, 'duskana_the_rage_mother');
  const ench = E.instantiate({ id: '_ench', name: 'E', type: 'enchantment', cost: 2, rarity: 'common' }, 1); ench.zone = 'enchantment'; st.players[1].enchantments.push(ench);
  damageCreature(st, duskana, 2, null); // survives (5 hp) -> Frenzy fires once
  ok('Duskana Frenzy destroys an enemy non-creature permanent', st.players[1].enchantments.length === 0, st.players[1].enchantments.map(c => c.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; st.players[1].deck = ['_v', '_v']; const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid, player: 1 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
