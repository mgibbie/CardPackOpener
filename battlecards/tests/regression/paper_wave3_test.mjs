// paper_wave3_test.mjs — third hand-import wave of neutral paper cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { runDeathrattle } from '../../engine/death.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._vamp = { id: '_vamp', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Vampire' };
byId._pirate = { id: '_pirate', name: 'P', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Pirate' };
byId._spirit = { id: '_spirit', name: 'S', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Spirit' };
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['master_of_cruelties', 'queen_s_bay_paladin', 'admiral_brass_unsinkable', 'maxo_glitch_agent', 'radiant_solar',
  'wispdrinker_vampire', 'talion_s_throneguard', 'crosis_the_purger', 'anuran_troubadour', 'fae_glyph_snapdragon'];
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

// Master of Cruelties: Swing -> each player loses 10 Life
{ const st = game(); const m = put(st, 0, 'master_of_cruelties'); st.players[0].life = 40; st.players[1].life = 40;
  E.attack(st, 0, m.uid, { type: 'hero', player: 1 });
  ok('Master of Cruelties Swing costs its own hero 10 life', st.players[0].life === 30, st.players[0].life);
  ok('Master of Cruelties Swing hits the enemy hero too', st.players[1].life <= 30, st.players[1].life); }

// Queen's Bay Paladin: Swing -> return a Vampire from graveyard
{ const st = game(); const q = put(st, 0, 'queen_s_bay_paladin'); st.players[0].graveyard = [E.instantiate(byId._vamp, 0)];
  E.attack(st, 0, q.uid, { type: 'hero', player: 1 });
  ok("Queen's Bay Paladin Swing returns a Vampire", st.players[0].hand.some(c => c.id === '_vamp'), st.players[0].hand.map(c => c.id)); }

// Admiral Brass: Battlecry mills 4
{ const st = game(); st.players[1].deck = Array(6).fill('_v'); play(st, 0, 'admiral_brass_unsinkable');
  ok('Admiral Brass Battlecry mills the enemy 4', st.players[1].deck.length === 2, st.players[1].deck.length); }

// Maxo: Battlecry exile a creature; Deathrattle mills 6
{ const st = game(); const foe = put(st, 1, '_v'); st.players[1].deck = Array(8).fill('_v');
  const mx = play(st, 0, 'maxo_glitch_agent', { type: 'creature', uid: foe.uid });
  ok('Maxo Battlecry exiles the target', !st.players[1].board.some(c => c.uid === foe.uid));
  runDeathrattle(st, 0, mx);
  ok('Maxo Deathrattle mills 6', st.players[1].deck.length === 2, st.players[1].deck.length); }

// Wispdrinker Vampire: Battlecry destroys a Spirit; Alliance heals
{ const st = game(); const sp = put(st, 1, '_spirit');
  const w = play(st, 0, 'wispdrinker_vampire', { type: 'creature', uid: sp.uid });
  ok('Wispdrinker destroys the target Spirit', E.isDead(sp) || !st.players[1].board.some(c => c.uid === sp.uid));
  st.players[0].life = 20; fireOngoing(st, 0, 'creature-played', { minion: E.instantiate(byId._v, 0) });
  ok('Wispdrinker Alliance gains 1 Life', st.players[0].life === 21, st.players[0].life); }

// Talion's Throneguard: Battlecry bounces a creature back to hand
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[1].hand.length;
  play(st, 0, 'talion_s_throneguard', { type: 'creature', uid: foe.uid });
  ok("Talion's Throneguard bounces the target off the board", !st.players[1].board.some(c => c.uid === foe.uid));
  ok("Talion's Throneguard returns it to hand", st.players[1].hand.length === h0 + 1, st.players[1].hand.length); }

// Crosis: Connect (combat damage to a hero) -> enemy discards
{ const st = game(); const cr = put(st, 0, 'crosis_the_purger');
  st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)]; const h0 = st.players[1].hand.length;
  E.attack(st, 0, cr.uid, { type: 'hero', player: 1 });
  ok('Crosis Connect makes the enemy discard', st.players[1].hand.length < h0, st.players[1].hand.length); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v', '_v']; st.players[1].deck = ['_v', '_v', '_v'];
  const foe = put(st, 1, '_spirit');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: foe.uid }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
