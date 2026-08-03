// Group C (cost modification) wave 10 — the last niche counter cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { damageHero } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 19) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].life = 30; st.players[1].life = 30; st.players[0].armor = 0;
	st.players[0].heroDmgInstancesOwnTurn = 0; st.players[0].oppLifeLossInstancesThisTurn = 0;
	return st;
};
const eff = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };

for (const id of ['sauna_regular', 'devious_coyote', 'azerite_giant', 'seaside_giant'])
	ok(`${id} carries selfCost`, cardsById[id].selfCost && cardsById[id].selfCost.per, id);

// Sauna Regular (c5): -1 per time your hero took damage on your turn
{
	const st = game(); // current = 0
	damageHero(st, 0, 2, null); damageHero(st, 0, 1, null); // two hits to your own hero on your turn
	ok('Sauna Regular: two damage instances -> counter 2', st.players[0].heroDmgInstancesOwnTurn === 2, st.players[0].heroDmgInstancesOwnTurn);
	ok('Sauna Regular: 5 - 2 = 3', eff(st, 0, 'sauna_regular') === 3);
	// damage on the OPPONENT's turn does not count toward yours
	const st2 = game(); st2.current = 1;
	damageHero(st2, 0, 3, null);
	ok('Sauna Regular: damage on the opponent\'s turn does NOT count', (st2.players[0].heroDmgInstancesOwnTurn || 0) === 0);
}

// Devious Coyote (c5): -1 per time an opponent lost life this turn
{
	const st = game(); // you (p0) on turn; damage p1 twice
	damageHero(st, 1, 4, 0); damageHero(st, 1, 2, 0);
	ok('Devious Coyote: opponent lost life twice -> your counter 2', st.players[0].oppLifeLossInstancesThisTurn === 2, st.players[0].oppLifeLossInstancesThisTurn);
	ok('Devious Coyote: 5 - 2 = 3', eff(st, 0, 'devious_coyote') === 3);
}

// Azerite Giant (c8): -1 per turn in a row you've played an Elemental
{
	const st = game();
	st.players[0].elementalTurnStreak = 4;
	ok('Azerite Giant: 8 - 4 streak = 4', eff(st, 0, 'azerite_giant') === 4);
	// end-to-end: playing an Elemental builds the streak; a gap resets it
	const st2 = game();
	st2.players[0].elementalThisTurn = true; E.endTurn(st2); E.endTurn(st2); // p0 turn ends with an elemental -> streak 1
	ok('playing an Elemental then ending your turn increments the streak', st2.players[0].elementalTurnStreak === 1, st2.players[0].elementalTurnStreak);
	st2.players[0].elementalThisTurn = false; E.endTurn(st2); E.endTurn(st2); // a turn with no elemental -> reset
	ok('a turn with no Elemental resets the streak to 0', st2.players[0].elementalTurnStreak === 0, st2.players[0].elementalTurnStreak);
}

// Seaside Giant (c10): -2 per location used this game
{
	const st = game();
	st.players[0].locationsUsedGame = 3;
	ok('Seaside Giant: 10 - 2*3 locations = 4', eff(st, 0, 'seaside_giant') === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
