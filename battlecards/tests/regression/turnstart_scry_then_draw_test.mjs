// Elven Chorus "At the start of your turn, Scry 1, then draw a card" — the card kept on
// top was skipped by that turn's draws, every Chorus turn (bug:1794007175555 + follow-up
// 1794008211404: the draws resolved while the scry modal was still pending).
// CAUSE (two parts):
//  1. runSecretEffects (the trigger path) ran each effect as its own execEffects([e]), so
//     execEffects' "defer the rest of the list onto a pending scry" never saw the draw.
//  2. beginTurn's normal turn draw ran right after the turn-start triggers, while the scried
//     card was still held in scryQueue — it pulled the card beneath it.
// FIX: runSecretEffects defers the rest of a trigger's effects onto the pending scry (replayed
// by resolveScry), and the turn draw waits on a pending scry of the drawer's own deck
// (scryQueue entry .turnDraw, drawn after the choice). Respects the loot/modal invariant:
// nothing that depends on the decision happens before it.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
for (const n of ['a', 'b', 'c', 'd', 'ring']) byId['_' + n] = { id: '_' + n, name: n.toUpperCase(), type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

function fresh() {
	const st = E.createGame(byId, seededRng(3), null, 2,
		[{ id: 'druid', name: 'Galadriel', power: null }, { id: 'warrior', name: 'Foe', power: null }]);
	st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.enchantments = []; p.deck = ['_a', '_a', '_a', '_a', '_a', '_a']; }
	const ch = E.instantiate(byId.me_galadriel_chorus, 0); ch.zone = 'enchantment';
	st.players[0].enchantments.push(ch);
	st.players[0].deck = ['_d', '_c', '_b', '_a', '_ring']; // end = top
	st.current = 1; // the foe ends their turn; Galadriel's turn begins
	return st;
}
const handIds = st => st.players[0].hand.map(c => c.id).sort().join(',');

// keep the scried card on top: the Chorus draw AND the turn draw take it first
{
	const st = fresh();
	E.endTurn(st);
	ok('it is Galadriel\'s turn with a pending scry of _ring', st.current === 0 && st.scryQueue.length === 1 && st.scryQueue[0].ids[0] === '_ring', JSON.stringify(st.scryQueue.map(q => q.ids)));
	ok('nothing is drawn while the scry decision is pending', st.players[0].hand.length === 0, handIds(st));
	E.resolveScry(st, [{ id: '_ring', bottom: false }]);
	ok('after keeping it on top, the two draws are _ring then _a', handIds(st) === '_a,_ring', handIds(st));
	ok('the deck lost exactly those two', st.players[0].deck.join(',') === '_d,_c,_b', st.players[0].deck.join(','));
}

// bottom it: the draws take the two cards beneath, and the scried card sits at the bottom
{
	const st = fresh();
	E.endTurn(st);
	E.resolveScry(st, [{ id: '_ring', bottom: true }]);
	ok('bottomed: the draws are _a and _b', handIds(st) === '_a,_b', handIds(st));
	ok('bottomed: _ring is at the bottom', st.players[0].deck[0] === '_ring', st.players[0].deck.join(','));
}

// the deferred draw survives a snapshot round-trip (resume mid-modal)
{
	const st = fresh();
	E.endTurn(st);
	const snap = JSON.parse(JSON.stringify(E.toSnapshot(st)));
	const st2 = E.fromSnapshot(snap, st.cardsById, seededRng(3));
	E.resolveScry(st2, [{ id: '_ring', bottom: false }]);
	ok('resumed mid-scry: keeping it on top still draws _ring + _a', st2.players[0].hand.map(c => c.id).sort().join(',') === '_a,_ring', st2.players[0].hand.map(c => c.id).join(','));
}

// a turn with no Chorus draws normally, right away
{
	const st = fresh();
	st.players[0].enchantments = [];
	E.endTurn(st);
	ok('no pending scry: the turn draw happens immediately', handIds(st) === '_ring', handIds(st));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
