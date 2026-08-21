// paper_wave11_test.mjs — Choose One, tutor-by-school, Planeshift+Plunder, Blood Gems, costMod.
import fs from 'fs';
import * as E from '../../engine.js';
import { runDeathrattle } from '../../engine/death.js';
import { staticValue } from '../../engine/auras.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._holy = { id: '_holy', name: 'Bless', type: 'sorcery', cost: 2, rarity: 'common', tribe: 'Holy', effects: [{ type: 'draw', value: 1 }] };
byId._beastgy = { id: '_beastgy', name: 'GYBeast', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['drover_of_the_swine', 'lemon_magician_girl', 'zock_galactic_wanderer', 'giant_ambush_beetle', 'esolen_beastmaster_prodigy', 'iron_hymn_soloist'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const playChoice = (st, pi, id, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, choice); return c; };

// Drover of the Swine — Choose One
{ const st = game(); const h0 = st.players[0].hand.length; playChoice(st, 0, 'drover_of_the_swine', 0);
  ok('Drover choice 1 adds three Beasts to hand', st.players[0].hand.length - h0 === 3, st.players[0].hand.length - h0); }
{ const st = game(); st.players[0].graveyard = [E.instantiate(byId._beastgy, 0), E.instantiate(byId._beastgy, 0), E.instantiate(byId._beastgy, 0)];
  const h0 = st.players[0].hand.length; playChoice(st, 0, 'drover_of_the_swine', 1);
  ok('Drover choice 2 returns Beasts from the graveyard', st.players[0].hand.filter(c => c.id === '_beastgy').length >= 1, st.players[0].hand.map(c => c.id)); }

// Lemon Magician Girl — Spell Damage static + Deathrattle tutors a Holy spell
{ const st = game(); const lem = put(st, 0, 'lemon_magician_girl');
  ok('Lemon Magician Girl grants Spell Damage +1', staticValue(st.players[0], 'spell-damage') === 1);
  ok('Lemon Magician Girl has Ward 2', byId.lemon_magician_girl.ward === 2);
  st.players[0].deck = ['_v', '_holy', '_v']; runDeathrattle(st, 0, lem);
  ok('Lemon Deathrattle tutors a Holy spell', st.players[0].hand.some(c => c.id === '_holy'), st.players[0].hand.map(c => c.id)); }

// Zock — Battlecry Plunder steals a card off the enemy deck (Planeshift also arrives at a random plane)
{ const st = game(); st.players[1].deck = ['_v', '_v', '_v', '_v', '_v', '_v']; const ed0 = st.players[1].deck.length;
  const c = E.instantiate(byId.zock_galactic_wanderer, 0); c.zone = 'hand'; st.players[0].hand.push(c); E.playCard(st, 0, c.uid, null);
  ok('Zock Plunders an enemy card into your hand', st.players[0].hand.some(x => x.id === '_v') && st.players[1].deck.length < ed0, [st.players[0].hand.map(x => x.id), st.players[1].deck.length]); }

// Iron Hymn Soloist — Battlecry adds four Blood Gems
{ const st = game(); const h0 = st.players[0].hand.length; const c = E.instantiate(byId.iron_hymn_soloist, 0); c.zone = 'hand'; st.players[0].hand.push(c); E.playCard(st, 0, c.uid, null);
  ok('Iron Hymn Soloist adds four Blood Gems', st.players[0].hand.filter(c => c.id === 'blood_gem').length === 4, st.players[0].hand.filter(c => c.id === 'blood_gem').length); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_holy', '_v']; st.players[1].deck = ['_v', '_v']; put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null, 0); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
