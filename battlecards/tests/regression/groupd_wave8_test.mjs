// Group D (turn triggers) wave 8 — Ysera Dream cards, Gutwrencher conditional
// discard, Tortotem multi-tribe conjure.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 28) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const roundTrip = st => { E.endTurn(st); E.endTurn(st); };
const DREAM = ['dream', 'nightmare', 'laughing_sister', 'emerald_drake', 'ysera_awakens'];

for (const id of ['ysera', 'gutwrencher_oni', 'tortotem'])
	ok(`${id} carries an ongoing`, cardsById[id].ongoing, id);
ok('gutwrencher_oni gained Poisonous/Taunt/Trample', ['poisonous', 'taunt', 'trample'].every(k => cardsById['gutwrencher_oni'].keywords.includes(k)));

// Ysera: end of turn, get two random Dream cards
{
	const st = game(); put(st, 0, 'ysera');
	E.endTurn(st);
	const dreams = st.players[0].hand.filter(c => DREAM.includes(c.id));
	ok('Ysera: two Dream cards added to hand', dreams.length === 2, st.players[0].hand.map(c => c.id));
}
// Gutwrencher Oni: start of turn, discard a card UNLESS you control a Devil/Ogre/Horror
{
	const st = game(); put(st, 0, 'gutwrencher_oni');
	st.players[0].hand = ['a', 'b', 'c'].map(n => E.instantiate({ id: 'h' + n, name: n, type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0));
	roundTrip(st);
	ok('Gutwrencher: discarded a card with no Devil/Ogre/Horror in play', st.players[0].hand.length === 2, st.players[0].hand.length);

	const st2 = game(); put(st2, 0, 'gutwrencher_oni'); put(st2, 0, null, { id: 'ogre', name: 'Ogre', type: 'creature', cost: 3, rarity: 'basic', attack: 3, health: 3, tribe: 'Ogre' });
	st2.players[0].hand = ['a', 'b', 'c'].map(n => E.instantiate({ id: 'h' + n, name: n, type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0));
	roundTrip(st2);
	ok('Gutwrencher: NO discard while you control an Ogre', st2.players[0].hand.length === 3, st2.players[0].hand.length);
}
// Tortotem: end of turn, get a random creature with multiple creature types
{
	const st = game(); put(st, 0, 'tortotem');
	E.endTurn(st);
	const got = st.players[0].hand.find(c => { const d = cardsById[c.id]; return d && d.type === 'creature' && (d.tribe || '').split('/').filter(Boolean).length >= 2; });
	ok('Tortotem: a multi-tribe creature is added to hand', !!got, st.players[0].hand.map(c => c.id + ':' + (cardsById[c.id]?.tribe || '')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
