// me_gm_art_triple_tap_test.mjs (2026-09-11)
//
// Owner request for Gríma Wormtongue's Relic of Sauron (me_gm_art):
//  (1) it should TRIPLE-tap — like lands/locations double-tap, but staying
//      tapped for two of the owner's turns and only untapping on the third.
//  (2) "Each opponent discards a card" should let the DISCARDING player choose
//      which card (MTG-style), not a random discard.
//
// Also guards that ordinary single-tap artifacts still untap every turn and
// that enemy-discard WITHOUT `choose` still discards at random.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 3) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warlock', name: 'M', power: null }, { id: 'warlock', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.graveyard = []; p.deck = Array(8).fill('grizzly_bears'); }
	st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const cycle = st => { E.endTurn(st); E.endTurn(st); }; // one full round-trip = one of player 0's turn-starts

// ---------- card data ----------
{
	const def = cardsById.me_gm_art;
	ok('me_gm_art is a triple-tap (tapTurns 3)', def.tapTurns === 3, def.tapTurns);
	ok('description shows {T}{T}{T}', def.description === '{T}{T}{T}: Each opponent discards a card; draw a card.', JSON.stringify(def.description));
	const disc = (def.tapAbility.effects || []).find(e => e.type === 'enemy-discard');
	ok('the discard lets the opponent choose', disc && disc.choose === true, JSON.stringify(disc));
}

// ---------- triple-tap recharge ----------
{
	const st = game();
	const art = E.instantiate(cardsById.me_gm_art, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	st.players[1].hand = [E.instantiate(cardsById.grizzly_bears, 1)];
	ok('the relic can be tapped initially', E.canTapArtifact(st, 0, art.uid));
	E.tapArtifact(st, 0, art.uid, null);
	ok('after tapping it is tapped (cooldown 2)', art.tapped && art.tapCooldown === 2, [art.tapped, art.tapCooldown]);
	cycle(st); ok('still tapped after the 1st of my turns', art.tapped && !E.canTapArtifact(st, 0, art.uid), [art.tapped, art.tapCooldown]);
	cycle(st); ok('still tapped after the 2nd of my turns', art.tapped && !E.canTapArtifact(st, 0, art.uid), [art.tapped, art.tapCooldown]);
	cycle(st); ok('untapped and usable on the 3rd of my turns', !art.tapped && E.canTapArtifact(st, 0, art.uid), [art.tapped, art.tapCooldown]);
}

// ---------- discard is the opponent's choice + tapper draws ----------
{
	const st = game();
	const art = E.instantiate(cardsById.me_gm_art, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	const a = E.instantiate(cardsById.grizzly_bears, 1), b = E.instantiate(cardsById.grizzly_bears, 1);
	st.players[1].hand = [a, b];
	const drewBefore = st.players[0].hand.length;
	E.tapArtifact(st, 0, art.uid, null);
	ok('the tapper drew a card', st.players[0].hand.length === drewBefore + 1, [drewBefore, st.players[0].hand.length]);
	ok('the opponent did NOT discard at random (still holds both)', st.players[1].hand.length === 2, st.players[1].hand.length);
	ok('a discard choice was queued for the opponent', st.discardQueue.length === 1 && st.discardQueue[0].player === 1 && st.discardQueue[0].count === 1, JSON.stringify(st.discardQueue));
	// the opponent resolves their own choice (b) -> it hits their graveyard
	E.resolveDiscard(st, [b.uid]);
	ok('the chosen card left the opponent hand', !st.players[1].hand.some(c => c.uid === b.uid), st.players[1].hand.map(c => c.uid));
	ok('the chosen card went to the opponent graveyard', st.players[1].graveyard.some(c => c.uid === b.uid), st.players[1].graveyard.map(c => c.uid));
	ok('the un-chosen card stayed in hand', st.players[1].hand.some(c => c.uid === a.uid), st.players[1].hand.map(c => c.uid));
}

// ---------- regression: ordinary single-tap artifacts still untap next turn ----------
{
	const st = game();
	const def = { id: 't_single_art', name: 'T Single', type: 'artifact', cost: 1, tapAbility: { effects: [{ type: 'draw', value: 1 }], text: 'Draw a card.' } };
	cardsById[def.id] = def;
	const art = E.instantiate(def, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	E.tapArtifact(st, 0, art.uid, null);
	ok('single-tap artifact is tapped after use', art.tapped && art.tapCooldown === 0, [art.tapped, art.tapCooldown]);
	cycle(st);
	ok('single-tap artifact untaps on my very next turn', !art.tapped && E.canTapArtifact(st, 0, art.uid), [art.tapped, art.tapCooldown]);
	delete cardsById[def.id];
}

// ---------- regression: enemy-discard WITHOUT choose still discards at random ----------
{
	const st = game();
	const def = { id: 't_rand_disc', name: 'T Rand', type: 'artifact', cost: 1, tapAbility: { effects: [{ type: 'enemy-discard', count: 1 }], text: 'Discard.' } };
	cardsById[def.id] = def;
	const art = E.instantiate(def, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	st.players[1].hand = [E.instantiate(cardsById.grizzly_bears, 1)];
	E.tapArtifact(st, 0, art.uid, null);
	ok('random enemy-discard removed a card immediately', st.players[1].hand.length === 0, st.players[1].hand.length);
	ok('random enemy-discard queued no choice', st.discardQueue.length === 0, JSON.stringify(st.discardQueue));
	delete cardsById[def.id];
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
