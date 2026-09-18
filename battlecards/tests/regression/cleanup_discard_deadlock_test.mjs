// cleanup_discard_deadlock_test.mjs — Lorequest "Lukka turn-18 hang" regression.
//
// A human who ENDS their turn holding more than HAND_LIMIT cards gets an MTG
// cleanup discard. That discard is pushed the instant the turn flips to the AI,
// and the client's maybeRunAI() (correctly) refuses to advance the AI while a
// human decision is pending. But the cleanup push used to be the ONE
// discardQueue.push in the engine that did NOT emit a `lootStart` event — and
// `lootStart` is the only thing that opens the discard modal during live play.
// So the human could never resolve it and the AI turn hung forever.
//
// Fix: the cleanup discard now emits lootStart (player, count, cleanup:true),
// exactly like every other loot. This test pins that, plus the snapshot
// round-trip with AI turn ownership + a pending human discard (the resume path).
import fs from 'fs';
import * as E from '../../engine.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';
import { seededRng } from '../../engine/rng.js';
import { HAND_LIMIT } from '../../engine/core.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._fill = { id: '_fill', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(18), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Lukka', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_fill', '_fill', '_fill', '_fill']; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
const fillHand = (st, pi, n) => { for (let i = 0; i < n; i++) { const c = E.instantiate(byId._fill, pi); c.zone = 'hand'; st.players[pi].hand.push(c); } };
const lootEvents = st => st.events.filter(e => e.type === 'lootStart');

// ---- 1) human ends turn overloaded -> cleanup discard + a lootStart event ----
{
	const st = fresh();
	fillHand(st, 0, HAND_LIMIT + 2); // 17 cards
	E.endTurn(st);
	ok('turn flipped to the AI (current = 1)', st.current === 1, st.current);
	ok('game is not over', !st.over);
	const dq = st.discardQueue.find(d => d.player === 0);
	ok('a cleanup discard is pending for the human', dq && dq.count === 2 && dq.cleanup === true, JSON.stringify(st.discardQueue));
	const le = lootEvents(st).find(e => e.player === 0 && e.cleanup);
	ok('the cleanup discard EMITS a lootStart(player 0, cleanup) — the modal opener', !!le && le.count === 2, JSON.stringify(lootEvents(st)));
}

// ---- 2) snapshot round-trip preserves AI ownership + the pending human discard ----
{
	const st = fresh();
	fillHand(st, 0, HAND_LIMIT + 2);
	E.endTurn(st);
	const snap = toSnapshot(st);
	const st2 = fromSnapshot(snap, byId, seededRng(18));
	ok('restored state keeps current = 1 (AI owns the turn)', st2.current === 1, st2.current);
	const dq2 = st2.discardQueue.find(d => d.player === 0);
	ok('restored state keeps the pending human cleanup discard', dq2 && dq2.count === 2 && dq2.cleanup === true, JSON.stringify(st2.discardQueue));
	ok('events are NOT serialized (empty after restore — why resumePendingChoices exists)', (st2.events || []).length === 0, (st2.events || []).length);
	// resolving the discard clears the block so the AI turn can proceed
	const p0 = st2.players[0];
	E.resolveDiscard(st2, p0.hand.slice(0, 2).map(c => c.uid));
	ok('resolving the discard empties the queue', !st2.discardQueue.some(d => d.player === 0), JSON.stringify(st2.discardQueue));
	ok('hand is back at the limit', st2.players[0].hand.length === HAND_LIMIT, st2.players[0].hand.length);
	ok('no human decision blocks the AI now (playable)', !st2.over && st2.current === 1 && st2.discardQueue.length === 0 && st2.scryQueue.length === 0 && st2.pickQueue.length === 0, 'stuck');
}

// ---- 3) an AI ending its own turn overloaded also emits lootStart (auto-resolved, no modal) ----
{
	const st = fresh();
	st.current = 1;
	fillHand(st, 1, HAND_LIMIT + 1); // 16 cards on the AI
	E.endTurn(st);
	const le = lootEvents(st).find(e => e.player === 1 && e.cleanup);
	ok('AI cleanup also emits lootStart(player 1, cleanup)', !!le && le.count === 1, JSON.stringify(lootEvents(st)));
	ok('AI cleanup discard is queued for the AI seat (client auto-resolves it)', st.discardQueue.some(d => d.player === 1 && d.cleanup), JSON.stringify(st.discardQueue));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
