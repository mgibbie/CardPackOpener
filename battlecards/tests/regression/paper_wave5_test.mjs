// paper_wave5_test.mjs — fifth hand-import wave of neutral paper cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._loc = { id: '_loc', name: 'L', type: 'location', cost: 2, durability: 2, rarity: 'common', tapAbility: { effects: [{ type: 'draw', value: 1 }], text: 'Draw.' } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['vizzerdrix', 'turbo_toad', 'crime_novelist', 'thorncaller', 'huatli_poet_of_unity', 'lightspeed_enthusiast', 'geistpack_alpha', 'balor_shadow_magistrate'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// Vizzerdrix: Deathrattle Scry 2
{ const st = game(); st.players[0].deck = ['_v', '_v', '_v']; const v = put(st, 0, 'vizzerdrix'); const s0 = st.scryQueue.length;
  runDeathrattle(st, 0, v);
  ok('Vizzerdrix Deathrattle scries', st.scryQueue.length > s0, st.scryQueue.length); }

// Turbo Toad: summoning a Beast gives it +1/+1
{ const st = game(); put(st, 0, 'turbo_toad'); const b = play(st, 0, '_beast');
  ok('Turbo Toad buffs a summoned Beast +1/+1', b.attack === 2 && b.maxHealth === 2, `${b.attack}/${b.maxHealth}`); }

// Crime Novelist: sacrificing a token -> +1/+1 and a Coin
{ const st = game(); const cn = put(st, 0, 'crime_novelist'); E.gainTokenCard(st, 0, 'clue_token');
  const clue = st.players[0].artifacts.find(a => a.id === 'clue_token'); const a0 = cn.attack, hand0 = st.players[0].hand.length;
  E.sacrificeToken(st, 0, clue.uid);
  ok('Crime Novelist grows when you sacrifice a token', cn.attack === a0 + 1, cn.attack);
  ok('Crime Novelist adds a Coin', st.players[0].hand.some(c => c.id === 'coin') || st.players[0].hand.length > hand0); }

// Thorncaller: Deathrattle adds a Blood Gem
{ const st = game(); const t = put(st, 0, 'thorncaller'); runDeathrattle(st, 0, t);
  ok('Thorncaller Deathrattle adds a Blood Gem to hand', st.players[0].hand.some(c => c.id === 'blood_gem'), st.players[0].hand.map(c => c.id)); }

// Huatli: Battlecry draws a Location from the deck
{ const st = game(); st.players[0].deck = ['_v', '_loc', '_v']; play(st, 0, 'huatli_poet_of_unity');
  ok('Huatli tutors a Location to hand', st.players[0].hand.some(c => c.id === '_loc'), st.players[0].hand.map(c => c.id)); }

// Geistpack Alpha: Deathrattle tutors a creature
{ const st = game(); st.players[0].deck = ['_v', '_v']; const g = put(st, 0, 'geistpack_alpha'); const h0 = st.players[0].hand.length;
  runDeathrattle(st, 0, g);
  ok('Geistpack Alpha Deathrattle tutors a creature', st.players[0].hand.length > h0, st.players[0].hand.length); }

// Balor: Battlecry returns a creature from graveyard
{ const st = game(); st.players[0].graveyard = [E.instantiate(byId._v, 0)]; play(st, 0, 'balor_shadow_magistrate');
  ok('Balor returns a creature from graveyard', st.players[0].hand.some(c => c.id === '_v'), st.players[0].hand.map(c => c.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_loc', '_v'];
  const foe = put(st, 1, '_v');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
