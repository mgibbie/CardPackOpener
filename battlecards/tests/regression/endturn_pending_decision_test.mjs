// endturn_pending_decision_test.mjs — a forced decision must not be orphaned
// into the next turn (Lorequest AI-turn deadlock, e.g. an unresolved Jace's
// Triumph Discover as the turn passed).
//
// endTurn now no-ops while the active player still owes a pick/discard/scry/etc.
// If it flipped anyway, the orphaned human choice would soft-lock the AI turn:
// the AI driver refuses to advance while a human decision is pending, but nothing
// is left to surface its modal. (The client also has a surfacePendingChoice()
// backstop, but that lives in the DOM layer; this pins the engine guard.)
import fs from 'fs';
import * as E from '../../engine.js';
import { hasPendingDecision } from '../../engine/core.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._fill = { id: '_fill', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(12), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Ajani', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_fill', '_fill', '_fill', '_fill']; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}

// ---- 1) a pending Discover for the active player blocks endTurn ----
{
	const st = fresh();
	st.pickQueue.push({ player: 0, ids: ['_fill'], discover: true }); // an unresolved Discover (Jace's Triumph shape)
	ok('hasPendingDecision sees the human Discover', hasPendingDecision(st, 0) === true);
	E.endTurn(st);
	ok('endTurn is a no-op while the Discover is pending (turn stays with the human)', st.current === 0, st.current);
	ok('the pick is still queued (not lost)', st.pickQueue.length === 1, st.pickQueue.length);
	// resolve it, then the turn ends normally
	st.pickQueue.shift();
	ok('no decision pending after resolving', hasPendingDecision(st, 0) === false);
	E.endTurn(st);
	ok('endTurn now flips to the AI (current = 1)', st.current === 1, st.current);
}

// ---- 2) the same guard covers discard / scry / sac / ask / dredge ----
{
	for (const setup of [
		st => st.discardQueue.push({ player: 0, count: 1 }),
		st => st.scryQueue.push({ chooser: 0, deckOwner: 0, ids: ['_fill'] }),
		st => st.sacQueue.push({ player: 0, uids: [] }),
		st => st.askQueue.push({ player: 0, prompt: '?' }),
		st => st.dredgeQueue.push({ player: 0, ids: ['_fill'] }),
	]) {
		const st = fresh();
		setup(st);
		E.endTurn(st);
		ok('endTurn blocked by a pending ' + Object.keys(st).find(k => Array.isArray(st[k]) && st[k].length && k.endsWith('Queue')), st.current === 0, st.current);
	}
}

// ---- 3) an ACTIVE player with NO pending decision ends the turn normally ----
{
	const st = fresh();
	E.endTurn(st);
	ok('a clean turn ends and flips to the AI', st.current === 1 && !st.over, st.current);
}

// ---- 4) resume: a snapshot with the human's pending Discover + AI-to-come is safe ----
{
	const st = fresh();
	st.pickQueue.push({ player: 0, ids: ['_fill'], discover: true });
	const st2 = fromSnapshot(toSnapshot(st), byId, seededRng(12));
	ok('restored state keeps the pending human Discover', st2.pickQueue.length === 1 && st2.pickQueue[0].player === 0, JSON.stringify(st2.pickQueue));
	ok('restored: hasPendingDecision still true', hasPendingDecision(st2, 0) === true);
	E.endTurn(st2);
	ok('restored: endTurn still refuses to orphan the choice', st2.current === 0, st2.current);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
