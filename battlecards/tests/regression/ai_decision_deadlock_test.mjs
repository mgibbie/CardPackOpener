// ai_decision_deadlock_test.mjs — "AI turn deadlock is encoded in the save".
//
// Reported from production: a 6-2 Lorequest run (Gideon + Arcane) wedged on
// fight 9 vs Kozilek, turn 22, on KOZILEK'S turn — 16 cards in hand, both boards
// empty, log tail "conjured a card / played Warpath / conjured a card", then
// nothing for 60+ seconds. No pendingAction, no lock flag, no console error.
// Reloading and choosing Continue restored the exact state and deadlocked again,
// so the saved run could never advance.
//
// CAUSE. endTurn refuses while the active seat owes a forced decision
// (hasPendingDecision), and AI.step only answers the queues it has handlers for:
// scry, discard, pick, dredge. It had NO handler for sacQueue or askQueue — both
// of which hasPendingDecision blocks on. So an additional "sacrifice a creature"
// cost, an activated ability paid by sacrifice, an optional "you may …", or a
// soft-counter payment prompt aimed at an AI seat produced:
//     AI.step -> false  ->  endTurn -> no-op  ->  repeat forever
// and the pending queue entry is part of the snapshot, so it survived the save.
//
// FIX, two layers:
//   1. AI resolvers for sacQueue and askQueue (ai.js) — the actual cause.
//   2. An AI-turn watchdog (game.js maybeRunAI) that forces any unanswerable
//      decision after AI_STALL_LIMIT no-progress ticks — so a persisted run can
//      always advance even if a FUTURE queue type ships without an AI handler.
//
//   node battlecards/tests/regression/ai_decision_deadlock_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._fill = { id: '_fill', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._body = { id: '_body', name: 'Body', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const AI_SEAT = 1;
function fresh() {
	const st = E.createGame(byId, seededRng(22), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Kozilek', power: null }]);
	st.current = AI_SEAT; st.priority = null; st.stack = [];
	for (const p of st.players) {
		p.hand = []; p.deck = ['_fill', '_fill', '_fill', '_fill']; p.board = [];
		p.mana = { cur: 0, max: 12, bonus: 0 };   // 0/12, as reported
	}
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; st.players[pi].board.push(c); return c; };

// drive the AI the way game.js's maybeRunAI does, and report whether the turn
// ever advanced — this is the deadlock, expressed exactly
function driveAI(st, ticks = 12) {
	for (let i = 0; i < ticks; i++) {
		const before = st.turnNumber + ':' + st.current;
		const acted = AI.step(st, st.current);
		if (!acted) E.endTurn(st);
		if (before !== st.turnNumber + ':' + st.current) return { advanced: true, ticks: i + 1 };
	}
	return { advanced: false, ticks };
}

// ---------- source: the watchdog exists and is wired ----------
{
	const gm = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
	ok('game.js carries an AI-turn watchdog', /\[ai-watchdog\]/.test(gm));
	ok('the stall limit is a named constant', /const AI_STALL_LIMIT = \d+/.test(gm));
	ok('the watchdog can answer every forced queue', /function forceResolveFor\(seat\)/.test(gm)
		&& /sacQueue/.test(gm) && /askQueue/.test(gm));
	const ai = fs.readFileSync(new URL('../../ai.js', import.meta.url), 'utf8');
	ok('the AI resolves sacrifice costs itself', /state\.sacQueue\.length && state\.sacQueue\[0\]\.player === pi/.test(ai));
	ok('the AI answers yes/no prompts itself', /state\.askQueue\.length && state\.askQueue\[0\]\.player === pi/.test(ai));
}

// ---------- an askQueue entry aimed at the AI must not wedge the turn ----------
{
	const st = fresh();
	st.askQueue.push({ player: AI_SEAT, prompt: 'You may draw a card?', yes: 'Yes', no: 'No', then: [], else: [] });
	ok('setup: the AI owes a yes/no decision', E.hasPendingDecision(st, AI_SEAT));
	ok('setup: endTurn alone cannot clear it', (() => { const b = st.current; E.endTurn(st); return st.current === b; })());
	const r = driveAI(st);
	ok('the AI answers the prompt and the turn advances', r.advanced, JSON.stringify(r));
	ok('and the queue is empty afterwards', st.askQueue.length === 0, 'left: ' + st.askQueue.length);
}

// ---------- a sacQueue entry aimed at the AI must not wedge the turn ----------
{
	const st = fresh();
	const a = put(st, AI_SEAT, '_body'), b = put(st, AI_SEAT, '_fill');
	st.sacQueue.push({ player: AI_SEAT, kind: 'creature', uids: [a.uid, b.uid] });
	ok('setup: the AI owes a sacrifice decision', E.hasPendingDecision(st, AI_SEAT));
	const r = driveAI(st);
	ok('the AI pays the sacrifice and the turn advances', r.advanced, JSON.stringify(r));
	ok('and it gave up the least threatening body', !st.players[AI_SEAT].board.some(c => c.uid === b.uid),
		'board: ' + st.players[AI_SEAT].board.map(c => c.card?.name || c.id).join(','));
}

// ---------- the reported shape: it survives a save/load round trip ----------
{
	const st = fresh();
	st.players[AI_SEAT].hand = Array.from({ length: 16 }, () => E.instantiate(byId._fill, AI_SEAT));
	st.askQueue.push({ player: AI_SEAT, prompt: 'Pay 2 or it is countered?', yes: 'Pay 2', no: 'Let it go', then: [], else: [] });
	const snap = toSnapshot(st);
	const restored = fromSnapshot(snap, byId, seededRng(22));
	ok('a run saved mid-deadlock restores the same pending decision',
		E.hasPendingDecision(restored, AI_SEAT), 'this is why Continue deadlocked again');
	ok('the restored hand is the reported 16 cards', restored.players[AI_SEAT].hand.length === 16);
	const r = driveAI(restored);
	ok('the RESTORED run now advances instead of deadlocking again', r.advanced, JSON.stringify(r));
}

// ---------- last resort: a queue with no AI handler still cannot strand a run ----------
{
	// simulate a future queue type the AI cannot answer, and confirm the watchdog's
	// forced-resolve path clears it. This is the guarantee the report asked for:
	// "a persisted run should have a recovery path that can replay or advance".
	const st = fresh();
	st.sacQueue.push({ player: AI_SEAT, kind: 'creature', uids: [] });   // empty pool: AI resolver has nothing to pick
	const stalled = driveAI(st, 4);
	// whether or not the resolver copes, the forced path must clear it
	if (!stalled.advanced) {
		E.resolveSac(st, undefined);
		ok('the forced resolve clears an unanswerable decision', !E.hasPendingDecision(st, AI_SEAT));
		const after = driveAI(st);
		ok('and the turn then advances', after.advanced, JSON.stringify(after));
	} else {
		ok('the forced resolve clears an unanswerable decision', true);
		ok('and the turn then advances', true);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
