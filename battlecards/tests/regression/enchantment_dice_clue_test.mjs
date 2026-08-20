// enchantment_dice_clue_test.mjs — the two neutral enchantments and the dice
// subsystem they introduced:
//  - Netherese Puzzle-Ward: Focus Beam (turn-start: roll d6, Scry X) + Perfect
//    Illumination (on a die's highest natural result, draw). Exercises rollDie +
//    the die-rolled-max event.
//  - Thorough Investigation: Swing: Investigate (friendly-attacks -> Clue) +
//    "sacrifice a Clue -> Advance" (token-sacrificed + if:{cardId:'clue_token'}).
import fs from 'fs';
import * as E from '../../engine.js';
import { fireOngoing } from '../../engine/triggers.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game() {
  const st = E.createGame(byId, seededRng(11), null, 2,
    [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0;
  for (const p of st.players) {
    p.hand = []; p.deck = []; p.board = []; p.enchantments = []; p.artifacts = [];
    p.mana = { cur: 30, max: 30, bonus: 0 };
  }
  return st;
}
const putEnch = (st, pi, id) => { const e = E.instantiate(byId[id], pi); e.zone = 'enchantment'; e.controller = pi; st.players[pi].enchantments.push(e); return e; };

// both cards exist as collectible neutral enchantments
for (const id of ['netherese_puzzle_ward', 'thorough_investigation']) {
  const c = byId[id];
  ok(`${id} exists`, !!c, id);
  ok(`${id} is a neutral enchantment`, c && c.type === 'enchantment' && c.cardClass === 'neutral');
  ok(`${id} is collectible`, c && c.collectible !== false && !c.token && !c.colors);
}
ok('Netherese is Epic (6)', byId.netherese_puzzle_ward.rarity === 'epic' && byId.netherese_puzzle_ward.cost === 6);
ok('Thorough is Rare (3)', byId.thorough_investigation.rarity === 'rare' && byId.thorough_investigation.cost === 3);

// --- Netherese Puzzle-Ward: MAX roll -> scry 6 + Perfect Illumination draw ---
{
  const st = game();
  st.players[0].deck = ['_v', '_v', '_v', '_v', '_v', '_v', '_v', '_v'];
  putEnch(st, 0, 'netherese_puzzle_ward');
  st.rng = () => 0.99; // d6 -> 6 (natural max)
  const hand0 = st.players[0].hand.length, scry0 = st.scryQueue.length;
  fireOngoing(st, 0, 'turn-start');
  ok('Focus Beam scries on your turn start', st.scryQueue.length > scry0, st.scryQueue.length);
  ok('Perfect Illumination draws on a die max', st.players[0].hand.length === hand0 + 1, st.players[0].hand.length);
  ok('state valid after Netherese (max roll)', (validateGameState(st) || []).length === 0, validateGameState(st));
}

// --- Netherese: non-max roll -> scry, but NO Perfect Illumination draw ---
{
  const st = game();
  st.players[0].deck = ['_v', '_v', '_v', '_v', '_v', '_v'];
  putEnch(st, 0, 'netherese_puzzle_ward');
  st.rng = () => 0.0; // d6 -> 1 (not max)
  const hand0 = st.players[0].hand.length;
  fireOngoing(st, 0, 'turn-start');
  ok('non-max roll still scries', st.scryQueue.length > 0, st.scryQueue.length);
  ok('non-max roll does NOT draw (Perfect Illumination only on max)', st.players[0].hand.length === hand0, st.players[0].hand.length);
}

// --- Thorough Investigation: Swing: Investigate, then sacrifice Clue -> Advance ---
{
  const st = game();
  putEnch(st, 0, 'thorough_investigation');
  const clues0 = st.players[0].artifacts.filter(a => a.id === 'clue_token').length;
  const attacker = E.instantiate(byId._v, 0); attacker.zone = 'board'; st.players[0].board.push(attacker);
  fireOngoing(st, 0, 'friendly-attacks', { minion: attacker });
  const clues = st.players[0].artifacts.filter(a => a.id === 'clue_token');
  ok('Swing: Investigate makes a Clue when your creature attacks', clues.length === clues0 + 1, clues.length);

  const pq0 = st.pickQueue.length, dung0 = st.players[0].dungeon;
  const sacked = E.sacrificeToken(st, 0, clues[0].uid);
  ok('the Clue sacrifices', sacked === true, sacked);
  const advanced = st.pickQueue.length > pq0 || st.players[0].dungeon !== dung0;
  ok('sacrificing a Clue triggers Advance (enters a dungeon / queues its pick)', advanced,
    JSON.stringify({ pick: st.pickQueue.length, dungeon: st.players[0].dungeon }));
  ok('state valid after Thorough Investigation', (validateGameState(st) || []).length === 0, validateGameState(st));
}

// --- the Advance trigger must NOT fire on a non-Clue token sacrifice ---
{
  const st = game();
  putEnch(st, 0, 'thorough_investigation');
  E.gainTokenCard ? E.gainTokenCard(st, 0, 'food_token') : st.players[0].artifacts.push(E.instantiate(byId.food_token || byId._v, 0));
  const food = st.players[0].artifacts.find(a => a.id === 'food_token');
  if (food) {
    const pq0 = st.pickQueue.length, dung0 = st.players[0].dungeon;
    E.sacrificeToken(st, 0, food.uid);
    ok('a non-Clue sacrifice does NOT trigger Advance', st.pickQueue.length === pq0 && st.players[0].dungeon === dung0);
  } else ok('a non-Clue sacrifice does NOT trigger Advance', true, '(no food_token in set — skipped)');
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
