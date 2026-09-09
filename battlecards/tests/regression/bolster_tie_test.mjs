// bolster_tie_test.mjs (2026-09-08)
//
// Owner ruling: Bolster gives +N/+N to your lowest-Health creature, but when
// several creatures are TIED for least Health the controller PICKS which one
// gets it (reuses the buff-target pick; the AI auto-resolves it). A single
// clear minimum still auto-applies with no prompt.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 91) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } st.pickQueue = []; return st; };
const put = (st, pi, name, atk, hp) => { const c = E.instantiate({ id: name, name, type: 'creature', cost: 1, attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
// fire Folklore Sycamore Ritual's end-of-turn Bolster 1
const fireBolster = (st) => { const e = E.instantiate(cardsById.blanchwood_treefolk, 0); e.zone = 'enchantment'; st.players[0].enchantments.push(e); E.fireOngoing(st, 0, 'turn-end', {}); };

// ---------- single clear minimum: auto-applies, no prompt ----------
{
	const st = game();
	const big = put(st, 0, 'big', 4, 5);
	const mid = put(st, 0, 'mid', 4, 4);
	const weak = put(st, 0, 'weak', 4, 3); // unique least Health
	fireBolster(st);
	ok('no pick is queued when there is a unique lowest-Health creature', (st.pickQueue || []).length === 0, st.pickQueue);
	ok('the single weakest creature auto-gets +1/+1 (3 -> 4 Health)', weak.maxHealth === 4 && weak.attack === 5, [weak.attack, weak.maxHealth]);
	ok('the others are untouched', big.maxHealth === 5 && mid.maxHealth === 4);
}

// ---------- tie for least Health: the controller picks ----------
{
	const st = game();
	const a = put(st, 0, 'a', 2, 2); // tied
	const b = put(st, 0, 'b', 3, 2); // tied
	const big = put(st, 0, 'big', 5, 6);
	fireBolster(st);
	const pick = (st.pickQueue || [])[0];
	ok('a buff-target pick is queued on a tie', !!pick && pick.mode === 'buff-target' && pick.attack === 1 && pick.health === 1, JSON.stringify(pick));
	ok('the pick offers exactly the tied creatures (not the healthy one)', !!pick && pick.ids.length === 2 && pick.ids.includes(a.uid) && pick.ids.includes(b.uid) && !pick.ids.includes(big.uid), pick && pick.ids);
	ok('nothing is buffed until the pick resolves', a.maxHealth === 2 && b.maxHealth === 2, [a.maxHealth, b.maxHealth]);
	// resolve the pick onto creature `b`
	E.resolvePick(st, b.uid);
	ok('the CHOSEN tied creature gets +1/+1', b.attack === 4 && b.maxHealth === 3, [b.attack, b.maxHealth]);
	ok('the other tied creature is untouched', a.attack === 2 && a.maxHealth === 2, [a.attack, a.maxHealth]);
}

// ---------- AI auto-resolves a tie (no stall) ----------
{
	const st = game();
	const a = put(st, 0, 'a', 2, 2);
	const b = put(st, 0, 'b', 3, 2);
	fireBolster(st);
	ok('a tie queued a pick for the AI too', (st.pickQueue || [])[0]?.mode === 'buff-target');
	// AI resolves the first offered id (fallback path in ai.js)
	const first = st.pickQueue[0].ids[0];
	E.resolvePick(st, first);
	const chosen = [a, b].find(c => c.uid === first);
	ok('the AI-picked tied creature got +1/+1', chosen.maxHealth === 3, chosen.maxHealth);
	ok('the pick queue is now empty', (st.pickQueue || []).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
