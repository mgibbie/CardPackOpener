// "Each turn this is in your hand, swap its Attack & Health." — a reusable
// in-hand hook (inHandSwap). Covers Duskhaven Hunter, Gilnean Royal Guard,
// Pumpkin Peasant, Swift Messenger, Spellshifter.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const IDS = ['duskhaven_hunter', 'gilnean_royal_guard', 'pumpkin_peasant', 'swift_messenger', 'spellshifter'];
ok('all 5 in-hand-swap cards carry the flag', IDS.every(id => cardsById[id].inHandSwap === true));

const game = () => {
	const st = E.createGame(cardsById, seededRng(3), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	return st;
};
const p0turn = (st) => { E.endTurn(st); E.endTurn(st); }; // back to player 0's turn start

// Duskhaven Hunter is 2/5 -> after your turn start it's 5/2 -> then 2/5 again
{
	const st = game();
	const c = E.instantiate(cardsById['duskhaven_hunter'], 0); c.zone = 'hand'; st.players[0].hand.push(c);
	const [a0, h0] = [c.attack, E.hp(c)];
	ok('starts 2/5', a0 === 2 && h0 === 5, [a0, h0]);
	p0turn(st);
	ok('after your turn start: swapped to 5/2', c.attack === 5 && E.hp(c) === 2, [c.attack, E.hp(c)]);
	p0turn(st);
	ok('swaps back to 2/5 the following turn', c.attack === 2 && E.hp(c) === 5, [c.attack, E.hp(c)]);
}

// the swapped stats persist when you play it
{
	const st = game();
	const c = E.instantiate(cardsById['gilnean_royal_guard'], 0); c.zone = 'hand'; st.players[0].hand.push(c);
	p0turn(st); // 3/8 -> 8/3 in hand
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	E.playCard(st, 0, c.uid, null, null, 0);
	const onBoard = st.players[0].board.find(x => x.id === 'gilnean_royal_guard');
	ok('plays with the swapped stats (8/3) and keeps its keywords', onBoard && onBoard.attack === 8 && E.hp(onBoard) === 3 && onBoard.keywords.includes('divine_shield') && onBoard.keywords.includes('rush'), onBoard && [onBoard.attack, E.hp(onBoard), onBoard.keywords]);
}

// the opponent's copy only swaps on the OPPONENT's turn (controller-scoped)
{
	const st = game();
	const c = E.instantiate(cardsById['swift_messenger'], 1); c.zone = 'hand'; st.players[1].hand.push(c); // enemy hand, 2/6
	E.endTurn(st); // -> opponent (p1) turn start: their card swaps to 6/2
	ok("enemy's in-hand card swaps on the enemy's turn", c.attack === 6 && E.hp(c) === 2, [c.attack, E.hp(c)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
