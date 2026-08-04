// Wave 21: Parrot Sanctuary — tap discounts your next Battlecry minion by (1);
// after you play a Battlecry minion the location reopens (can tap again this turn).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
// a 3-cost Battlecry minion, and a 3-cost vanilla minion
const bcMinion = { id: 'bc_guy', name: 'BC Guy', type: 'creature', cost: 3, attack: 2, health: 2, keywords: ['battlecry'], effects: [{ type: 'armor', value: 1 }] };
const vanilla = { id: 'plain_guy', name: 'Plain', type: 'creature', cost: 3, attack: 2, health: 2 };
cardsById.bc_guy = bcMinion; cardsById.plain_guy = vanilla;

ok('parrot_sanctuary exists', cardsById.parrot_sanctuary);

// Tap → next Battlecry minion costs (1) less; vanilla minion unaffected
{
	const st = game();
	const loc = placeLoc(st, 'parrot_sanctuary');
	const bc = E.instantiate(bcMinion, 0); bc.zone = 'hand'; st.players[0].hand.push(bc);
	const plain = E.instantiate(vanilla, 0); plain.zone = 'hand'; st.players[0].hand.push(plain);
	ok('before tap: Battlecry minion costs 3', E.effectiveCost(st, 0, bc) === 3, E.effectiveCost(st, 0, bc));
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('after tap: Battlecry minion costs 2', E.effectiveCost(st, 0, bc) === 2, E.effectiveCost(st, 0, bc));
	ok('after tap: vanilla minion still costs 3 (keyword filter)', E.effectiveCost(st, 0, plain) === 3, E.effectiveCost(st, 0, plain));
	// location is now tapped/on cooldown
	const onBoard = st.players[0].board.find(c => c.id === 'parrot_sanctuary');
	ok('location tapped after use', onBoard.tapped === true, onBoard.tapped);
	ok('durability spent (3 -> 2)', onBoard.durability === 2, onBoard.durability);
}

// Playing the discounted Battlecry minion consumes the discount AND reopens the location
{
	const st = game();
	const loc = placeLoc(st, 'parrot_sanctuary');
	const bc = E.instantiate(bcMinion, 0); bc.zone = 'hand'; st.players[0].hand.push(bc);
	const bc2 = E.instantiate(bcMinion, 0); bc2.zone = 'hand'; st.players[0].hand.push(bc2);
	E.tapLand(st, 0, loc.uid, 0, null);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, bc.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'parrot_sanctuary');
	ok('after playing a Battlecry minion, the location reopened (untapped)', onBoard.tapped === false, onBoard.tapped);
	ok('discount was consumed: second Battlecry minion is back to 3', E.effectiveCost(st, 0, bc2) === 3, E.effectiveCost(st, 0, bc2));
	// can tap it again this turn for another discount
	ok('reopened location is tappable again', E.canTapLand(st, 0, onBoard, 0), onBoard.tapped);
	E.tapLand(st, 0, onBoard.uid, 0, null);
	ok('second tap re-applies the discount', E.effectiveCost(st, 0, bc2) === 2, E.effectiveCost(st, 0, bc2));
	ok('durability spent twice (3 -> 1)', onBoard.durability === 1, onBoard.durability);
}

// Playing a NON-Battlecry minion does NOT reopen the location
{
	const st = game();
	const loc = placeLoc(st, 'parrot_sanctuary');
	const plain = E.instantiate(vanilla, 0); plain.zone = 'hand'; st.players[0].hand.push(plain);
	E.tapLand(st, 0, loc.uid, 0, null);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, plain.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'parrot_sanctuary');
	ok('vanilla minion does not reopen the location', onBoard.tapped === true, onBoard.tapped);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
