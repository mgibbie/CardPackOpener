// Lorequest base decks: 37 named-character pools tagged loreDeck, each 15 uncollectible cards
// that run as 2 copies -> a 30-card starter deck. This validates deck structure + that every
// loreDeck card plays without throwing and leaves the game state valid.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const decks = [...new Set(raw.cards.map(c => c.loreDeck).filter(Boolean))];
ok('37 lore decks exist', decks.length === 37, decks.length);

const PLANESWALKERS = ['Ajani','Chandra','Daretti','Elspeth','Garruk','Gideon','Jace','Karn','Liliana','Lukka','Nissa','Ob Nixilis','Sorin','Teferi','Tezzeret','Vivian'];
const BOSSES = ['Drana','Drivnod','Edgar Markov','Elesh Norn','Emrakul','Gix','Kozilek','Lolth','Mishra','Mondrak','Nicol Bolas','Sheoldred','Solphim','Tekuthal','Ulamog','Urabrask','Urza','Vorinclex','Yawgmoth','Zhulodok','Zopandrel'];
ok('16 planeswalker + 21 boss decks all present', [...PLANESWALKERS, ...BOSSES].every(d => decks.includes(d)));

for (const d of [...PLANESWALKERS, ...BOSSES]) {
	const cards = raw.cards.filter(c => c.loreDeck === d && !c.token);
	ok(`${d}: exactly 15 cards`, cards.length === 15, cards.length);
	ok(`${d}: all uncollectible`, cards.every(c => c.collectible === false));
	ok(`${d}: has a legendary signature`, cards.some(c => c.rarity === 'legendary'));
}

// headless: play every loreDeck card, drain picks, validate
const vanilla = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
byId._v = vanilla;
function fresh() {
	const st = E.createGame(byId, seededRng(11), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['_v','_v','_v','_v','_v']; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	for (const pi of [0,1]) for (let i = 0; i < 2; i++) { const c = E.instantiate(vanilla, pi); c.zone='board'; c.sick=false; st.players[pi].board.push(c); }
	return st;
}
function drainPicks(st, tag) {
	let guard = 0;
	while (st.pickQueue && st.pickQueue.length && st.pickQueue[0].player === 0) {
		if (guard++ > 20) { ok(tag + ': picks terminate', false, 'infinite loop'); break; }
		const pend = st.pickQueue[0];
		let choice = Array.isArray(pend.ids) && pend.ids.length ? pend.ids[0]
			: (st.players.flatMap(p => p.board).find(c => c.type === 'creature') || {}).uid || null;
		const before = st.pickQueue.length;
		E.resolvePick(st, choice);
		if (st.pickQueue.length >= before && st.pickQueue[0] === pend) { ok(tag + ': pick advanced', false, 'stuck'); break; }
	}
}
const all = raw.cards.filter(c => c.loreDeck && !c.token);
let played = 0;
for (const card of all) {
	let threw = null;
	const st = fresh();
	try { const inst = E.instantiate(card, 0); inst.zone='hand'; st.players[0].hand.push(inst); E.playCard(st, 0, inst.uid, null); drainPicks(st, card.id); }
	catch (e) { threw = e; }
	if (threw) ok(card.id + ' plays without throwing', false, threw.message);
	const v = validateGameState(st);
	if (v && v.length) ok(card.id + ' leaves state valid', false, v);
	played++;
}
ok('played all ' + played + ' loreDeck cards cleanly', fail === 0 || played === all.length, played);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
