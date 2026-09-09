// cascade_creature_test.mjs (2026-09-08)
//
// Owner request: Cascade works on CREATURES, not just spells. When a creature
// with Cascade is CAST from hand, it cascades like a spell — casts the first
// card off the deck that costs less, for free (random targeting), else fizzles.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 97) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const hand = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// the two Green cascade creatures carry the keyword now
ok('Transcendant Fauna has the cascade keyword', (cardsById.transcendant_fauna.keywords || []).includes('cascade'));
ok('Pantlaza has the cascade keyword', (cardsById.pantlaza_sun_favored.keywords || []).includes('cascade'));

// ---------- casting a Cascade creature cascades a cheaper card ----------
{
	const st = game();
	st.players[0].deck = ['grizzly_bears']; // top of deck, cost 3 < Pantlaza's 5
	const p = hand(st, 0, 'pantlaza_sun_favored'); // cost 5, Cascade
	E.playCard(st, 0, p.uid, null, null, 0);
	ok('Pantlaza itself is on the board', st.players[0].board.some(c => c.id === 'pantlaza_sun_favored'));
	ok('Cascade cast the cheaper creature off the deck (Grizzly Bears summoned)', st.players[0].board.some(c => c.id === 'grizzly_bears'), st.players[0].board.map(c => c.id));
	ok('the cascaded card left the deck', !st.players[0].deck.includes('grizzly_bears'), st.players[0].deck);
}

// ---------- fizzles when no cheaper card is available ----------
{
	const st = game();
	st.players[0].deck = []; // nothing to cascade into
	const p = hand(st, 0, 'pantlaza_sun_favored');
	E.playCard(st, 0, p.uid, null, null, 0);
	const others = st.players[0].board.filter(c => c.id !== 'pantlaza_sun_favored');
	ok('Cascade fizzles with an empty deck (no extra creature summoned)', others.length === 0, others.map(c => c.id));
}

// ---------- a non-Cascade creature does NOT cascade ----------
{
	const st = game();
	st.players[0].deck = ['grizzly_bears'];
	const g = hand(st, 0, 'grizzly_bears'); // cost 3, NO cascade
	E.playCard(st, 0, g.uid, null, null, 0);
	ok('a plain creature leaves the deck untouched', st.players[0].deck.includes('grizzly_bears'), st.players[0].deck);
	ok('only the played creature is on the board', st.players[0].board.filter(c => c.type === 'creature').length === 1, st.players[0].board.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
