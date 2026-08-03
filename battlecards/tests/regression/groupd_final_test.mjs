// Group D — the final three bespoke turn-triggers (closes Group D).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 32) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const handCard = (pi, id, type = 'creature') => { const c = E.instantiate({ id, name: id, type, cost: 2, rarity: 'common', attack: 1, health: 1, effects: type !== 'creature' ? [] : undefined }, pi); c.zone = 'hand'; return c; };

ok('larva token exists (1/1 Zerg, transforms in hand into Zerg)', cardsById['larva'] && cardsById['larva'].transformInHand && cardsById['larva'].transformInHandTribe === 'Zerg');

// Rat Burglar: steal cards that entered the opponent's hand during your turn
{
	const st = game(); put(st, 0, 'rat_burglar');
	// a card the opponent has HELD from before (entered on an earlier turn) shouldn't be stolen
	const old = handCard(1, 'oldcard'); old._enteredTurn = st.turnNumber - 5; st.players[1].hand.push(old);
	// a card that enters the opponent's hand THIS turn (your turn) — emit conjure stamps it
	E.execEffects(st, 0, [{ type: 'give-enemy-card', id: 'chillwind_yeti' }], null, null); // give the opponent a card now (marks _enteredTurn)
	const gained = st.players[1].hand.filter(c => c._enteredTurn === st.turnNumber);
	ok('a card entered the opponent hand this turn', gained.length >= 1, st.players[1].hand.map(c => [c.id, c._enteredTurn]));
	const h0 = st.players[0].hand.length;
	E.endTurn(st); // your turn ends -> Rat Burglar steals the this-turn card, not the old one
	ok('Rat Burglar: stole the card that entered this turn', st.players[0].hand.some(c => c.id === 'chillwind_yeti'), st.players[0].hand.map(c => c.id));
	ok('Rat Burglar: did NOT steal the opponent\'s older card', st.players[1].hand.some(c => c.id === 'oldcard'));
}

// Alarm-o-Matic: swap itself with a random creature in the opponent's hand
{
	const st = game(); const a = put(st, 0, 'alarm_o_matic');
	const em = E.instantiate(cardsById['chillwind_yeti'], 1); em.zone = 'hand'; st.players[1].hand = [em]; // a real registered minion
	E.endTurn(st); E.endTurn(st); // your next turn start
	ok('Alarm-o-Matic: left your board (into the opponent\'s hand)', !st.players[0].board.some(c => c.uid === a.uid) && st.players[1].hand.some(c => c.id === 'alarm_o_matic'), st.players[1].hand.map(c => c.id));
	ok('Alarm-o-Matic: the opponent\'s hand creature is now on your board', st.players[0].board.some(c => c.id === 'chillwind_yeti'), st.players[0].board.map(c => c.id));
}

// Hive Queen: end of turn, get a Larva (which transforms into a Zerg each turn)
{
	const st = game(); put(st, 0, 'hive_queen');
	E.endTurn(st);
	ok('Hive Queen: a Larva is added to hand', st.players[0].hand.some(c => c.id === 'larva'), st.players[0].hand.map(c => c.id));
	// the Larva morphs into a Zerg at your next turn start
	E.endTurn(st); // opponent
	E.endTurn(st); // your turn start -> Larva transforms
	const morphed = st.players[0].hand[0];
	ok('the Larva transformed into a Zerg minion', morphed && morphed.id !== 'larva' && (cardsById[morphed.id]?.tribe || '').includes('Zerg'), morphed && [morphed.id, cardsById[morphed.id]?.tribe]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
