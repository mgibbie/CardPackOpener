// Rogue four: Contraband Stash, Interrogation, Savory Deviate Delight,
// Shenanigans (+ the dk_plague_crate token fix for the round-4 Crate cards).
import fs from 'fs';
import * as E from '../../engine.js';
import { drawCards } from '../../engine/zones.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_one = { id: 't_one', name: 'One', type: 'creature', cost: 1, attack: 1, health: 4 };
byId.t_mage_plate = { id: 't_mage_plate', name: 'Mage Plate', type: 'sorcery', cost: 1, cardClass: 'mage', effects: [{ type: 'armor', value: 1 }] };

function game() {
	const st = E.createGame(byId, seededRng(91), null, 2, [{ id: 'rogue', name: 'A', power: null }, { id: 'rogue', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(10).fill('t_one'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function give(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'hand';
	st.players[pi].hand.push(c); return c;
}
function cast(st, id, tgt = null) {
	const sp = give(st, 0, id);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}

// --- Contraband Stash: replays 5 random other-class cards you've played ---
{
	const st = game();
	st.players[0].heroClass = 'rogue';
	st.players[0].otherClassPlayedGame = ['t_mage_plate', 't_mage_plate', 't_mage_plate', 't_mage_plate', 't_mage_plate', 't_mage_plate'];
	cast(st, 'contraband_stash');
	ok('stash: replayed exactly 5 of the 6 (armor 5)', st.players[0].armor === 5, st.players[0].armor);
}
// --- Interrogation: Ambushes shuffle in; drawing one creates a 3/3 Stealth Ninja ---
{
	const st = game();
	st.players[0].deck = [];
	cast(st, 'interrogation');
	ok('interrogation: 3 Ambushes in the deck', st.players[0].deck.filter(id => id === 'ninja_ambush').length === 3, st.players[0].deck);
	st.players[0].deck = ['t_one', 'ninja_ambush']; // pop() draws the Ambush first
	drawCards(st, 0, 1);
	const ninja = st.players[0].board.find(c => c.name === 'Spectral Ninja');
	ok('interrogation: drawing it creates the Ninja instead', !!ninja && ninja.attack === 3 && ninja.maxHealth === 3 && ninja.keywords.includes('stealth'), ninja && [ninja.attack, ninja.maxHealth]);
	ok('interrogation: the Ambush never reaches hand (consumes the draw, Fal\'dorei-style)', !st.players[0].hand.some(c => c.id === 'ninja_ambush'));
	drawCards(st, 0, 1);
	ok('interrogation: the next draw proceeds normally', st.players[0].hand.some(c => c.id === 't_one'));
}
// --- dk_plague_crate (round-4 fix): drawing a Crate creates a 2/2 Undead ---
{
	const st = game();
	st.players[0].deck = ['dk_plague_crate'];
	drawCards(st, 0, 1);
	const u = st.players[0].board.find(c => c.name === 'Plagued Undead');
	ok('crate: creates a 2/2 Undead when drawn', !!u && u.attack === 2 && u.maxHealth === 2 && (u.tribe || '').includes('Undead'), u && [u.attack, u.maxHealth]);
}
// --- Savory Deviate Delight: a hand minion on EACH side becomes Pirate/Stealth ---
{
	const st = game();
	give(st, 0, 't_one'); give(st, 1, 't_one');
	cast(st, 'savory_deviate_delight');
	const check = pi => {
		const h = st.players[pi].hand.filter(c => c.type === 'creature');
		return h.length === 1 && h[0].id !== 't_one' && ((h[0].tribe || '').includes('Pirate') || h[0].keywords.includes('stealth'));
	};
	ok('savory: my minion transformed', check(0), st.players[0].hand.map(c => [c.id, c.tribe]));
	ok('savory: their minion transformed too', check(1), st.players[1].hand.map(c => [c.id, c.tribe]));
}
// --- Shenanigans: the opponent's SECOND draw in a turn becomes a Banana ---
{
	const st = game();
	cast(st, 'shenanigans');
	ok('shenanigans: secret installed', st.players[0].secrets.length === 1, st.players[0].secrets.length);
	E.endTurn(st); // opponent's turn (secrets never fire on the owner's turn)
	st.players[1].deck = ['t_one', 't_one', 't_one'];
	const draws = st.players[1].drawsThisTurn; // the turn-start draw already happened
	drawCards(st, 1, 1);
	const afterFirst = st.players[1].hand.filter(c => c.id === 'banana').length;
	drawCards(st, 1, 1);
	const bananas = st.players[1].hand.filter(c => c.id === 'banana').length;
	if (draws === 1) {
		// turn-start draw was #1, so our first manual draw is #2 -> transforms
		ok('shenanigans: the second draw became a Banana', afterFirst === 1 && bananas === 1, [draws, afterFirst, bananas]);
	} else {
		ok('shenanigans: the second draw became a Banana', afterFirst === 0 && bananas === 1, [draws, afterFirst, bananas]);
	}
	ok('shenanigans: the secret is spent', st.players[0].secrets.length === 0, st.players[0].secrets.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
