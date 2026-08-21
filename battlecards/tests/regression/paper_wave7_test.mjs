// paper_wave7_test.mjs — seventh wave: self-attacked keyword grant, cook/food-sac,
// token-sac punish, destroy-permanent (location), enemy discard.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { staticValue } from '../../engine/auras.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._loc = { id: '_loc', name: 'L', type: 'location', cost: 2, durability: 2, rarity: 'common', tapAbility: { effects: [{ type: 'draw', value: 1 }], text: 'Draw.' } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['wayward_grimscale', 'unscrupulous_agent', 'mirkwood_hexmage', 'town_razer_tyrant', 'hungry_turtle', 'vengeful_tracker'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, t = null) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, t); return c; };

// Wayward Grimscale: attacked -> gains Venomous
{ const st = game(); const w = put(st, 0, 'wayward_grimscale');
  fireOngoing(st, 0, 'self-attacked', { damaged: w });
  ok('Wayward Grimscale gains Venomous when attacked', (w.keywords || []).includes('venomous'), w.keywords); }

// Unscrupulous Agent: enemy discards a card
{ const st = game(); st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)]; const h0 = st.players[1].hand.length;
  play(st, 0, 'unscrupulous_agent');
  ok('Unscrupulous Agent makes the enemy discard', st.players[1].hand.length < h0, st.players[1].hand.length); }

// Mirkwood Hexmage: Spell Damage +1 static
{ const st = game(); put(st, 0, 'mirkwood_hexmage');
  ok('Mirkwood Hexmage grants Spell Damage +1', staticValue(st.players[0], 'spell-damage') === 1, staticValue(st.players[0], 'spell-damage')); }

// Town-Razer Tyrant: destroys an enemy Location
{ const st = game(); const loc = E.instantiate(byId._loc, 1); loc.zone = 'board'; st.players[1].board.push(loc);
  play(st, 0, 'town_razer_tyrant');
  ok('Town-Razer Tyrant destroys an enemy Location', !st.players[1].board.some(c => c.uid === loc.uid), st.players[1].board.map(c => c.id)); }

// Hungry Turtle: Swing cooks a Food; sacrificing a Food gains Life
{ const st = game(); put(st, 0, 'hungry_turtle');
  fireOngoing(st, 0, 'self-attacks', {});
  const food = st.players[0].artifacts.find(a => a.id === 'food_token');
  ok('Hungry Turtle Swing cooks a Food token', !!food, st.players[0].artifacts.map(a => a.id));
  if (food) { st.players[0].life = 20; E.sacrificeToken(st, 0, food.uid);
    ok('sacrificing a Food gains Life (Turtle + Food)', st.players[0].life > 20, st.players[0].life); }
  else ok('sacrificing a Food gains Life (Turtle + Food)', false, 'no food'); }

// Vengeful Tracker: sacrificing a token burns each opponent for 2
{ const st = game(); put(st, 0, 'vengeful_tracker'); E.gainTokenCard(st, 0, 'clue_token');
  const clue = st.players[0].artifacts.find(a => a.id === 'clue_token'); st.players[1].life = 40;
  E.sacrificeToken(st, 0, clue.uid);
  ok('Vengeful Tracker burns the opponent for 2 on a token sacrifice', st.players[1].life === 38, st.players[1].life); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; st.players[1].hand = [E.instantiate(byId._v, 1)];
  const loc = E.instantiate(byId._loc, 1); loc.zone = 'board'; st.players[1].board.push(loc);
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
