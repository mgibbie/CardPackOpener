// bill_ferny_coin_loop_test.mjs — an AI turn can never loop forever.
//
// 2026-10-13, found by the run-mode simulation: 116 of 200 Bill Ferny fights never ended.
// Bill Ferny's Fateful Discovery read "Whenever you cast a spell, gain a Coin" — and the
// Coin is a spell. The AI played a Coin, got a Coin, played it, forever: its turn never
// ended, so a player facing him (he can be your very first Middle-earth fight) saw the
// game freeze. Taking the card as spoils was an unlimited-mana engine the other way.
//   1. Fateful Discovery now triggers only on spells that cost (1) or more
//   2. the AI ends any turn past AI_TURN_ACTION_CAP voluntary actions, so a future card
//      with the same flaw slows a turn down instead of freezing the game
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._spell = { id: '_spell', name: 'One-Drop Spell', type: 'sorcery', cost: 1, rarity: 'common', effects: [{ type: 'draw', value: 1 }] };
// the card as it shipped: the loop, kept as a fixture for the AI safety net
byId._oldDiscovery = { ...byId.me_bf_ench, id: '_oldDiscovery', ongoing: { on: 'spell-played', effects: [{ type: 'gain-coin', value: 1 }] } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game() {
	const st = E.createGame(byId, seededRng(7), ['_v', '_v', '_v', '_v', '_v', '_v'], 2);
	st.current = 1; st.priority = null; st.stack = [];
	for (const p of st.players) { p.mana = { cur: 0, max: 5, bonus: 0 }; p.hand = []; }
	return st;
}
const install = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'enchantments'; st.players[pi].enchantments.push(c); return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const coins = (st, pi) => st.players[pi].hand.filter(c => c.id === 'coin').length;

// ===== 1. the card =====
ok('Fateful Discovery only counts spells that cost (1) or more', byId.me_bf_ench.ongoing?.if?.minCost === 1, JSON.stringify(byId.me_bf_ench.ongoing));
ok('...and says so', /costs \(1\) or more/.test(byId.me_bf_ench.description), byId.me_bf_ench.description);
{ const st = game(); install(st, 1, 'me_bf_ench'); const coin = give(st, 1, 'coin');
  E.playCard(st, 1, coin.uid, null, null);
  ok('playing the Coin does NOT give a new Coin', coins(st, 1) === 0, coins(st, 1)); }
{ const st = game(); install(st, 1, 'me_bf_ench'); st.players[1].mana.cur = 1; const s = give(st, 1, '_spell');
  E.playCard(st, 1, s.uid, null, null);
  ok('a 1-mana spell still gives a Coin', coins(st, 1) === 1, coins(st, 1)); }
{ // the AI with the real card and a Coin: its turn ends
  const st = game(); install(st, 1, 'me_bf_ench'); give(st, 1, 'coin');
  let n = 0; while (n < 1000 && AI.step(st, 1)) n++;
  ok('the AI holding a Coin under Fateful Discovery ends its turn', n < 20, n); }

// ===== 2. the safety net =====
{ const st = game(); install(st, 1, '_oldDiscovery'); give(st, 1, 'coin');
  let n = 0; while (n < 5000 && AI.step(st, 1)) n++;
  ok(`a looping card stops the AI at the turn cap (${AI.AI_TURN_ACTION_CAP})`, n === AI.AI_TURN_ACTION_CAP, n);
  E.endTurn(st);
  ok('...and the turn passes to the opponent', st.current === 0, st.current);
  // a new turn resets the count
  st.current = 1; st.turnNumber++;
  ok('the cap resets on the next turn', AI.step(st, 1) === true); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
