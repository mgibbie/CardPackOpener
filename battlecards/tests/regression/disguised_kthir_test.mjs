// Disguised K'thir: each turn in your hand, transform into a random card in your
// opponent's deck (reuses the handTransform hook with a new fromEnemyDeck mode).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

ok('card carries handTransform:{fromEnemyDeck}', cardsById['disguised_kthir'].handTransform && cardsById['disguised_kthir'].handTransform.fromEnemyDeck === true);

const game = () => {
	const st = E.createGame(cardsById, seededRng(4), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	// a known opponent deck (ids)
	st.players[1].deck = ['wolfrider', 'boulderfist_ogre', 'fireball', 'chillwind_yeti'].filter(id => cardsById[id]);
	return st;
};
const p0turn = (st) => { E.endTurn(st); E.endTurn(st); };

{
	const st = game();
	const deckSet = new Set(st.players[1].deck);
	const k = E.instantiate(cardsById['disguised_kthir'], 0); k.zone = 'hand'; st.players[0].hand.push(k);
	const uid = k.uid;
	ok('starts as Disguised K\'thir', st.players[0].hand[0].id === 'disguised_kthir');

	p0turn(st);
	const c1 = st.players[0].hand[0];
	ok('after your turn: became a card from the opponent\'s deck', deckSet.has(c1.id) && c1.id !== 'disguised_kthir', c1.id);
	ok('keeps the same hand slot/uid (entity continuity)', c1.uid === uid);
	ok('still carries handTransform so it keeps morphing', c1.handTransform && c1.handTransform.fromEnemyDeck === true);

	p0turn(st);
	const c2 = st.players[0].hand[0];
	ok('morphs again next turn into an opponent-deck card', deckSet.has(c2.id));

	// it plays as its current form
	const cur = st.players[0].hand[0];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	if (cur.type === 'creature') {
		E.playCard(st, 0, cur.uid, null, null, 0);
		ok('plays as its current form (a real opponent-deck creature on board)', st.players[0].board.some(b => b.id === cur.id), cur.id);
	} else { ok('current form is a non-creature card (also valid)', true); }
}

// controller-scoped: an empty enemy deck -> no morph, stays K'thir
{
	const st = game(); st.players[1].deck = [];
	const k = E.instantiate(cardsById['disguised_kthir'], 0); k.zone = 'hand'; st.players[0].hand.push(k);
	p0turn(st);
	ok('empty opponent deck: stays Disguised K\'thir (no crash)', st.players[0].hand[0].id === 'disguised_kthir');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
