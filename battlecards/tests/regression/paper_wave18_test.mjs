// paper_wave18_test.mjs — Regenerate/Medic (Jubilant Jamfrog), sac-land (Gitrog),
// turn-end conditional tribe-destroy (Cerise), and Party (Angel of Unity).
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { fireOngoing } from '../../engine/triggers.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._vamp = { id: '_vamp', name: 'V', type: 'creature', cost: 3, attack: 2, health: 3, rarity: 'common', tribe: 'Vampire' };
byId._merf = { id: '_merf', name: 'M', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Merfolk' };
byId._faerie = { id: '_faerie', name: 'F', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Faerie' };
byId._demon = { id: '_demon', name: 'D', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Demon' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['jubilant_jamfrog', 'gitrog_horror_of_zhava', 'cerise_slayer_of_fear', 'angel_of_unity'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(18), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.lands = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const land = (st, pi, n) => { for (let i = 0; i < n; i++) st.players[pi].lands.push({ uid: 60000 + pi * 100 + i, id: '_land', type: 'land', zone: 'land', tapped: false, colors: [] }); };

// Jubilant Jamfrog — Battlecry mills 3 off the enemy deck; Regenerate 2 + Medic 1 at turn-end
{ const st = game(); st.players[1].deck = ['_v', '_v', '_v', '_v', '_v']; const d0 = st.players[1].deck.length;
  const c = toHand(st, 0, 'jubilant_jamfrog'); E.playCard(st, 0, c.uid, null);
  ok('Jamfrog Battlecry burns 3 off the enemy deck', st.players[1].deck.length === d0 - 3, [d0, st.players[1].deck.length]);
  ok('Jamfrog has Lifesteal & Poisonous', byId.jubilant_jamfrog.keywords.includes('lifesteal') && byId.jubilant_jamfrog.keywords.includes('poisonous')); }
{ const st = game(); const jf = put(st, 0, 'jubilant_jamfrog'); damageCreature(st, jf, 2, null); st.players[0].life = 25;
  fireOngoing(st, 0, 'turn-end', {});
  ok('Jamfrog Regenerate 2 heals itself at turn-end', jf.damage === 0, jf.damage);
  ok('Jamfrog Medic 1 heals your hero at turn-end', st.players[0].life === 26, st.players[0].life); }

// Gitrog — Deathrattle: each player sacrifices a land
{ const st = game(); land(st, 0, 2); land(st, 1, 2); const g = put(st, 0, 'gitrog_horror_of_zhava');
  runDeathrattle(st, 0, g);
  ok('Gitrog Deathrattle: each player loses a land', st.players[0].lands.length === 1 && st.players[1].lands.length === 1, [st.players[0].lands.length, st.players[1].lands.length]); }

// Cerise — turn-end: if you control a Faerie/Angel, destroy an enemy Demon/Devil/Phyrexian
{ const st = game(); put(st, 0, 'cerise_slayer_of_fear'); put(st, 0, '_faerie'); const demon = put(st, 1, '_demon');
  fireOngoing(st, 0, 'turn-end', {});
  ok('Cerise destroys the enemy Demon (Faerie controlled)', demon.damage >= demon.maxHealth || !st.players[1].board.includes(demon), demon.damage); }
{ const st = game(); put(st, 0, 'cerise_slayer_of_fear'); const demon = put(st, 1, '_demon'); // no Faerie/Angel
  fireOngoing(st, 0, 'turn-end', {});
  ok('Cerise does NOTHING without a Faerie/Angel', demon.damage < demon.maxHealth, demon.damage); }

// Angel of Unity — Party: with 4+ distinct creature tribes, gains +3/+3
{ const st = game(); put(st, 0, '_vamp'); put(st, 0, '_merf'); put(st, 0, '_faerie'); // Vampire/Merfolk/Faerie + Angel Cleric = 5 tokens
  const a = toHand(st, 0, 'angel_of_unity'); E.playCard(st, 0, a.uid, null);
  const ang = st.players[0].board.find(c => c.id === 'angel_of_unity');
  ok('Angel of Unity gains +3/+3 with a Party', ang && ang.attack === 4 && ang.maxHealth === 6, ang && [ang.attack, ang.maxHealth]); }
{ const st = game(); const a = toHand(st, 0, 'angel_of_unity'); E.playCard(st, 0, a.uid, null);
  const ang = st.players[0].board.find(c => c.id === 'angel_of_unity');
  ok('Angel of Unity stays 1/3 without a Party', ang && ang.attack === 1 && ang.maxHealth === 3, ang && [ang.attack, ang.maxHealth]); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; st.players[1].deck = ['_v', '_v', '_v', '_v']; land(st, 0, 1); land(st, 1, 1); put(st, 1, '_demon');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
