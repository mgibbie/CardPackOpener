// ffa_duel_test.mjs — N-player free-for-all matchmaking (2-8 players).
//
// The online host deals ALL N seats exactly the way startDuelHost does:
//   createGame(rng, seat0deck, N, picks, loadouts)  → then for every other seat
//   resetDeckAndHand(seat, deck) + drawCards(seat, 4) + addCoin(seat)
// (createGame only injects seat 0's deck; the rest get their own here). This pins
// that dealing, the FFA turn rotation / elimination / last-hero-standing win, and
// that a real AI-driven 4-player game runs to completion on a seeded rng.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// a pool of real, drawable card ids (same filter createGame uses for a class-pool deck)
const playable = Object.values(byId).filter(d =>
	!d.token && d.collectible !== false && d.type !== 'land' && !(d.colors && d.colors.length) && !d.companion && !d.commander);
const deckOf = (offset) => Array.from({ length: 30 }, (_, i) => playable[(offset + i) % playable.length].id);

// deal an N-seat game the way the host does
function dealHostGame(N, seed = 12345) {
	const seats = Array.from({ length: N }, (_, s) => ({ seat: s, deck: deckOf(s * 7), classId: null, commander: null, companion: null }));
	const picks = seats.map(s => (s.classId ? { id: s.classId } : null));
	const loadouts = seats.map(s => ({ commander: s.commander, companion: s.companion }));
	const state = E.createGame(byId, seededRng(seed), [...seats[0].deck], N, picks, loadouts);
	for (let s = 1; s < N; s++) { E.resetDeckAndHand(state, s, seats[s].deck); E.drawCards(state, s, 4); E.addCoin(state, s); }
	return { state, seats };
}

// --- dealing: a 4-player table is set up correctly ---
{
	const { state } = dealHostGame(4);
	ok('createGame honours the requested player count', state.players.length === 4);
	ok('game state is valid after the N-seat deal', validateGameState(state).length === 0, validateGameState(state).join(' | '));
	// seat 0 goes first: 3 opening + 1 turn-1 draw = 4 cards, no coin
	const p0 = state.players[0];
	ok('seat 0 has 4 cards and no coin', p0.hand.length === 4 && !p0.hand.some(c => c.id === 'coin'), p0.hand.map(c => c.id).join(','));
	// seats 1..3: 4 cards + The Coin = 5, exactly one coin each
	for (let s = 1; s < 4; s++) {
		const p = state.players[s];
		const coins = p.hand.filter(c => c.id === 'coin').length;
		ok(`seat ${s} holds exactly one Coin (no double-coin from reset+draw+addCoin)`, coins === 1, `coins=${coins} hand=${p.hand.length}`);
		ok(`seat ${s} hand is 4 cards + the coin`, p.hand.length === 5, `hand=${p.hand.length}`);
	}
	// each seat's remaining deck is drawn from its OWN injected list
	for (let s = 0; s < 4; s++) {
		const allowed = new Set(deckOf(s * 7));
		const stray = state.players[s].deck.filter(id => !allowed.has(id));
		ok(`seat ${s} deck came from its own decklist`, stray.length === 0, stray.slice(0, 4).join(','));
	}
}

// --- turn rotation cycles through every seat, skipping no one ---
{
	const { state } = dealHostGame(4, 777);
	const seen = [state.current];
	for (let i = 0; i < 7; i++) { E.endTurn(state); seen.push(state.current); }
	ok('turn order rotates 0→1→2→3→0…', seen.slice(0, 5).join(',') === '0,1,2,3,0', seen.join(','));
	ok('state stays valid across a full rotation', validateGameState(state).length === 0);
}

// --- a real AI-driven 4-player FFA runs to a single winner (or stays valid) ---
{
	const { state } = dealHostGame(4, 24680);
	// minimal queue resolver mirroring game.js resolveAI* (Discover/scry/loot/etc.)
	const resolveQueues = () => {
		let g = 800;
		while (g-- > 0) {
			if (state.over) return;
			if (state.scryQueue.length) { const q = state.scryQueue[0]; E.resolveScry(state, q.ids.map(id => ({ id, bottom: false }))); continue; }
			if (state.pickQueue.length) { const q = state.pickQueue[0]; E.resolvePick(state, q.mode === 'adapt' ? q.ids[0] : q.ids[q.ids.length - 1]); continue; }
			if (state.discardQueue.length) { const q = state.discardQueue[0]; const p = state.players[q.player]; E.resolveDiscard(state, p.hand.slice(0, q.count).map(c => c.uid)); continue; }
			if (state.askQueue.length) { E.resolveAsk(state, false); continue; }
			if (state.sacQueue.length) { const q = state.sacQueue[0]; E.resolveSac(state, q.uids[0]); continue; }
			if (state.dredgeQueue.length) { const q = state.dredgeQueue[0]; E.resolveDredge(state, q.ids[0]); continue; }
			if (state.priority != null) { E.resolveResponse(state, state.priority, null); continue; }
			break;
		}
	};
	let guard = 6000, threw = null, invalidAt = null;
	try {
		while (!state.over && guard-- > 0) {
			resolveQueues();
			if (state.over) break;
			const acted = AI.step(state, state.current);
			resolveQueues();
			if (!acted) E.endTurn(state);
			if (validateGameState(state).length) { invalidAt = 6000 - guard; break; }
		}
	} catch (e) { threw = e.message; }
	ok('4-player AI FFA never threw', threw === null, threw);
	ok('4-player AI FFA never entered an invalid state', invalidAt === null, 'invalid at action ' + invalidAt);
	const alive = state.players.filter(p => !p.eliminated).length;
	if (state.over) {
		ok('finished FFA has exactly one hero standing', alive === 1, `alive=${alive}`);
		ok('finished FFA names that survivor the winner', state.winner != null && !state.players[state.winner].eliminated, `winner=${state.winner}`);
	} else {
		// didn't converge inside the guard — that's fine as long as it's still healthy & progressed
		ok('unfinished FFA is still valid and progressed', validateGameState(state).length === 0 && state.turnNumber > 3, `turn=${state.turnNumber}`);
	}
}

// --- a guest at a NON-1 seat ingests the host board (the multi-human path) ---
{
	const { state: host } = dealHostGame(3, 555);
	for (let i = 0; i < 6 && !host.over; i++) E.endTurn(host); // advance a few turns
	const wire = JSON.parse(JSON.stringify(E.toSnapshot(host))); // server relay
	const guest = E.fromSnapshot(wire, byId); // a seat-2 guest ingests (client sets HUMAN = 2)
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	ok('3p guest ingest is valid', validateGameState(guest).length === 0, validateGameState(guest).join(' | '));
	ok('3p guest sees all three seats', guest.players.length === 3);
	// deterministic-rng carry (host seeds → snapshot carries position → guest restores):
	// the seat-2 guest's rolls track the host's, so its optimistic FFA board matches
	ok('guest rng resumed at the host position', guest.rng.snapshot && guest.rng.snapshot().calls === wire.rng.calls);
	const hr = [], gr = []; for (let i = 0; i < 8; i++) { hr.push(host.rng()); gr.push(guest.rng()); }
	ok('seat-2 guest rolls match the host exactly', JSON.stringify(hr) === JSON.stringify(gr));
}

// --- concede: 1v1 ends immediately; FFA drops the conceder and plays on ---
{
	const { state: two } = dealHostGame(2, 4242);
	E.concede(two, 0);
	ok('1v1 concede ends the game, the opponent wins', two.over && two.winner === 1, `over=${two.over} winner=${two.winner}`);

	const { state: four } = dealHostGame(4, 4243);
	E.concede(four, 1);
	ok('FFA concede eliminates only the conceder; the game continues',
		!four.over && four.players[1].eliminated && !four.players[0].eliminated && !four.players[2].eliminated && !four.players[3].eliminated);
	ok('a conceded (eliminated) player is a safe no-op if it concedes again', (() => { E.concede(four, 1); return four.players[1].eliminated; })());
	E.concede(four, 2); E.concede(four, 3); // down to seat 0
	ok('FFA last hero standing after the others concede wins', four.over && four.winner === 0, `over=${four.over} winner=${four.winner}`);
}

// --- sizes 2 and 8 also deal cleanly (bounds of the 2-8 selector) ---
for (const N of [2, 8]) {
	const { state } = dealHostGame(N, 1000 + N);
	ok(`size ${N}: correct player count + valid`, state.players.length === N && validateGameState(state).length === 0);
	ok(`size ${N}: every guest seat has its coin`, state.players.slice(1).every(p => p.hand.filter(c => c.id === 'coin').length === 1));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
