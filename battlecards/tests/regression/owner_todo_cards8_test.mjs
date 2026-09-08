// Eighth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Pelakka Wurm -> give it the Beast tag (tribe added; its Battlecry "Gain 7
//                   life" and Deathrattle "Draw a card" are untouched).
//
// The tribe is additive, but its abilities are FIRED to prove the retag didn't
// disturb them: the Deathrattle draws a card on death.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

{
	const c = cardsById.pelakka_wurm;
	ok('Pelakka Wurm is now a Beast', c.tribe === 'Beast', c.tribe);
	ok('Pelakka Wurm keeps its 7/7 body + Battlecry/Deathrattle text',
		c.attack === 7 && c.health === 7 && c.description === 'Battlecry: Gain 7 life.\nDeathrattle: Draw a card.', JSON.stringify([c.attack, c.health, c.description]));
	ok('keeps battlecry + deathrattle keywords', ['battlecry', 'deathrattle'].every(k => (c.keywords || []).includes(k)), JSON.stringify(c.keywords));

	// FIRE the Deathrattle: put it on board with a card in deck, kill it, sweep → a draw
	const st = game();
	st.players[0].deck = ['pelakka_wurm']; // any id; drawing pulls one into hand
	const w = E.instantiate(c, 0); w.zone = 'board'; w.sick = false;
	st.players[0].board.push(w);
	E.recomputeAuras(st);
	const handBefore = st.players[0].hand.length, deckBefore = st.players[0].deck.length;
	w.damage = w.maxHealth;
	ok('the wurm is dead', E.isDead(w), [w.damage, w.maxHealth]);
	E.sweepDeaths(st);
	ok('Deathrattle drew a card', st.players[0].hand.length === handBefore + 1 && st.players[0].deck.length === deckBefore - 1,
		JSON.stringify([handBefore, st.players[0].hand.length, deckBefore, st.players[0].deck.length]));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
