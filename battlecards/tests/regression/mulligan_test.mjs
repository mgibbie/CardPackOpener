// mulligan_test.mjs — opening-hand mulligan (engine primitive E.mulligan).
//
// Swap a chosen subset of the opening hand once: the picks go back into the deck
// and replacements come off the top, then the returned cards are shuffled in.
// Pins: net-zero hand/deck sizes, the picks leave the hand, the Coin is never
// swapped, once-per-player idempotency, seeded determinism, and validator safety.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- swap two cards: sizes hold, the picks leave the hand, state stays valid ---
{
	const state = E.createGame(byId, seededRng(1), null, 2);
	const p = state.players[0];
	const handBefore = p.hand.length, deckBefore = p.deck.length;
	const swap = p.hand.slice(0, 2).map(c => c.uid);
	E.mulligan(state, 0, swap);
	ok('mulliganed flag is set', p.mulliganed === true);
	ok('hand size is unchanged (drew as many as returned)', p.hand.length === handBefore, `${p.hand.length} vs ${handBefore}`);
	ok('deck size is unchanged (net)', p.deck.length === deckBefore, `${p.deck.length} vs ${deckBefore}`);
	ok('the swapped cards are gone from hand', !p.hand.some(c => swap.includes(c.uid)));
	ok('state is valid after a mulligan', validateGameState(state).length === 0, validateGameState(state).join(' | '));

	// idempotent: a second mulligan does nothing
	const snapshot = p.hand.map(c => c.uid).join(',');
	E.mulligan(state, 0, p.hand.map(c => c.uid));
	ok('a second mulligan is a no-op (once per player)', p.hand.map(c => c.uid).join(',') === snapshot);
}

// --- mulligan [] keeps the hand but still spends the mulligan ---
{
	const state = E.createGame(byId, seededRng(2), null, 2);
	const p = state.players[1];
	const before = p.hand.map(c => c.uid).join(',');
	E.mulligan(state, 1, []);
	ok('keeping the hand sets the flag and changes nothing', p.mulliganed === true && p.hand.map(c => c.uid).join(',') === before);
}

// --- the Coin can't be mulliganed even if named ---
{
	const state = E.createGame(byId, seededRng(3), null, 2);
	const p = state.players[1]; // 2nd player holds The Coin
	const coin = p.hand.find(c => c.id === 'coin');
	ok('seat 1 was dealt the Coin', !!coin);
	const other = p.hand.find(c => c.id !== 'coin');
	E.mulligan(state, 1, [coin.uid, other.uid]);
	ok('the Coin survives a mulligan that names it', p.hand.some(c => c.uid === coin.uid));
	ok('a non-Coin named alongside it is still swapped', !p.hand.some(c => c.uid === other.uid));
}

// --- deterministic: same seed + same picks → identical replacement hand ---
{
	const A = E.createGame(byId, seededRng(99), null, 2);
	const B = E.createGame(byId, seededRng(99), null, 2);
	E.mulligan(A, 0, A.players[0].hand.slice(0, 3).map(c => c.uid));
	E.mulligan(B, 0, B.players[0].hand.slice(0, 3).map(c => c.uid));
	ok('seeded mulligan reproduces the same hand',
		A.players[0].hand.map(c => c.id).join(',') === B.players[0].hand.map(c => c.id).join(','),
		A.players[0].hand.map(c => c.id).join(','));
}

// --- an eliminated / already-mulliganed player is a safe no-op ---
{
	const state = E.createGame(byId, seededRng(4), null, 2);
	state.players[0].eliminated = true;
	E.mulligan(state, 0, state.players[0].hand.map(c => c.uid));
	ok('mulligan on an eliminated player is a no-op', state.players[0].mulliganed !== true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
