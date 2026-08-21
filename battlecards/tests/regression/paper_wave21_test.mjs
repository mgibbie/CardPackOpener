// paper_wave21_test.mjs — Slashing (Rampaging Ceratops double-to-face + Frenzy destroy-permanent),
// reveal-tax-draw (Keen Duelist), Bonehoard Dracosaur keywords.
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 5, health: 5, rarity: 'common', tribe: 'Beast' };
byId._c3 = { id: '_c3', name: 'C3', type: 'creature', cost: 3, attack: 2, health: 2, rarity: 'common' };
byId._c2 = { id: '_c2', name: 'C2', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['rampaging_ceratops', 'keen_duelist', 'bonehoard_dracosaur'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(21), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Rampaging Ceratops — Slashing doubles combat damage to the enemy hero
{ const st = game(); const cer = put(st, 0, 'rampaging_ceratops'); cer.sick = false; const life0 = st.players[1].life;
  E.attack(st, 0, cer.uid, { type: 'hero', player: 1 });
  ok('Ceratops Slashing deals double to the hero (5 -> 10)', st.players[1].life === life0 - 10, [life0, st.players[1].life]); }
{ const st = game(); const plain = put(st, 0, '_v'); plain.sick = false; const life0 = st.players[1].life; // control: no Slashing
  E.attack(st, 0, plain.uid, { type: 'hero', player: 1 });
  ok('a non-Slashing 5-attack creature deals 5', st.players[1].life === life0 - 5, [life0, st.players[1].life]); }
{ const st = game(); const cer = put(st, 0, 'rampaging_ceratops');
  const art = E.instantiate({ id: '_art', name: 'A', type: 'artifact', cost: 2, rarity: 'common' }, 1); art.zone = 'artifact'; st.players[1].artifacts.push(art);
  damageCreature(st, cer, 2, null); // survives -> Frenzy
  ok('Ceratops Frenzy destroys an enemy permanent', st.players[1].artifacts.length === 0, st.players[1].artifacts.map(a => a.id));
  ok('Ceratops has Rush, Slashing & Piercing', ['rush', 'slashing', 'piercing'].every(k => byId.rampaging_ceratops.keywords.includes(k))); }

// Keen Duelist — each player draws the top card and loses Life equal to its Mana Value
{ const st = game(); st.players[0].deck = ['_c3']; st.players[1].deck = ['_c2']; const l0 = st.players[0].life, l1 = st.players[1].life;
  const c = toHand(st, 0, 'keen_duelist'); E.playCard(st, 0, c.uid, null);
  ok('Keen Duelist: you draw the top and lose its Mana Value (3)', st.players[0].hand.some(x => x.id === '_c3') && st.players[0].life === l0 - 3, [st.players[0].life, l0]);
  ok('Keen Duelist: the opponent draws & loses their card cost (2)', st.players[1].hand.some(x => x.id === '_c2') && st.players[1].life === l1 - 2, [st.players[1].life, l1]); }

// Bonehoard Dracosaur — keyword check
{ ok('Bonehoard has Swift(first_strike), Impulsive & Windfury', ['first_strike', 'impulsive', 'windfury'].every(k => byId.bonehoard_dracosaur.keywords.includes(k))); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_c3', '_c2']; st.players[1].deck = ['_c2', '_c3']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
