// paper_wave30_test.mjs — Pathfinder Axejaw (copy an enemy Location to hand) and
// Mothwood Mystic Owl (Battlecry Flicker via blink + Fey Subterfuge Adventure that Bounces).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'X', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._loc = { id: '_loc', name: 'Loc', type: 'location', cost: 3, durability: 2, rarity: 'common', taps: [{ text: 'Draw a card.', effects: [{ type: 'draw', value: 1 }] }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const WAVE = ['pathfinder_axejaw', 'mothwood_mystic_owl'];
for (const id of WAVE) {
  const c = byId[id];
  ok(`${id} exists as a neutral collectible`, c && c.cardClass === 'neutral' && c.collectible !== false && !c.colors && !c.token);
}

function game() {
  const st = E.createGame(byId, seededRng(30), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// Pathfinder Axejaw — Battlecry adds a copy of an enemy Location to your hand
{ const st = game(); put(st, 1, '_loc'); // an enemy Location on board
  const pa = toHand(st, 0, 'pathfinder_axejaw'); E.playCard(st, 0, pa.uid, null);
  ok('Pathfinder adds a copy of the enemy Location to hand', st.players[0].hand.some(c => c.id === '_loc'), st.players[0].hand.map(c => c.id)); }
{ const st = game(); // no enemy Location -> nothing added (and no throw)
  const pa = toHand(st, 0, 'pathfinder_axejaw'); E.playCard(st, 0, pa.uid, null);
  ok('Pathfinder adds nothing with no enemy Location', !st.players[0].hand.some(c => c.id === '_loc'), st.players[0].hand.map(c => c.id)); }

// Mothwood Mystic Owl — Battlecry Flickers a creature (blink) without throwing
{ const st = game(); const ally = put(st, 0, '_v');
  const mo = toHand(st, 0, 'mothwood_mystic_owl');
  let threw = null; try { E.playCard(st, 0, mo.uid, { type: 'creature', uid: ally.uid, player: 0 }); } catch (e) { threw = e; }
  ok('Mothwood Battlecry Flickers a creature without throwing', !threw, threw && threw.message);
  ok('the flickered creature is on the board (a _v remains)', st.players[0].board.some(c => c.id === '_v'), st.players[0].board.map(c => c.id)); }

// Mothwood — Fey Subterfuge Adventure bounces a target creature to its owner's hand
{ const st = game(); const foe = put(st, 1, '_v');
  const mo = toHand(st, 0, 'mothwood_mystic_owl');
  ok('Fey Subterfuge Adventure is castable', E.canPlayAdventure(st, 0, mo));
  E.playAdventure(st, 0, mo.uid, { type: 'creature', uid: foe.uid, player: 1 }, null);
  ok('Fey Subterfuge bounces the enemy creature to hand', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.some(c => c.id === '_v'), [st.players[1].board.map(c => c.id), st.players[1].hand.map(c => c.id)]);
  ok('Mothwood returns to hand (adventure spent)', st.players[0].hand.some(c => c.id === 'mothwood_mystic_owl' && c.adventureSpent), st.players[0].hand.map(c => c.id)); }

// play-without-throw + valid-state sweep
for (const id of WAVE) {
  let threw = null; const st = game(); st.players[0].deck = ['_v', '_v']; put(st, 0, '_v'); put(st, 1, '_v'); put(st, 1, '_loc');
  try { const inst = E.instantiate(byId[id], 0); inst.zone = 'hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, { type: 'creature', uid: st.players[0].board[0].uid, player: 0 }); }
  catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${id} leaves state valid`, !threw && (!v || v.length === 0), v);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
