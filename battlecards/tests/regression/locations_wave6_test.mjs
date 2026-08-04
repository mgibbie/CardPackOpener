// Wave 35 (locations): Cenarion Hold — your next Choose One card this turn has
// both effects combined.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
// a Choose One spell: 3 armor OR 5 armor (so "both" = 8, choice0 = 3, choice1 = 5)
cardsById.t_choose = { id: 't_choose', name: 'Wrath', type: 'sorcery', cost: 0, choices: [
	{ text: 'Gain 3 Armor.', effects: [{ type: 'armor', value: 3 }] },
	{ text: 'Gain 5 Armor.', effects: [{ type: 'armor', value: 5 }] },
] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'druid', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.armor = 0; }
	st.players[0].heroClass = 'druid'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const playChoose = (st, choice) => { const s = E.instantiate(cardsById.t_choose, 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, null, choice, 0); };

ok('cenarion_hold exists', cardsById.cenarion_hold);

// Baseline: without Cenarion Hold, a Choose One card runs only the chosen branch
{
	const st = game();
	playChoose(st, 0);
	ok('baseline choice 0 gives 3 armor only', st.players[0].armor === 3, st.players[0].armor);
}

// Tap Cenarion Hold -> next Choose One has BOTH effects (3 + 5 = 8)
{
	const st = game();
	const loc = placeLoc(st, 'cenarion_hold');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('flag set after tapping', st.players[0].nextChooseOneBoth === true, st.players[0].nextChooseOneBoth);
	playChoose(st, 0); // choice is overridden to "both"
	ok('both effects combined: 3 + 5 = 8 armor', st.players[0].armor === 8, st.players[0].armor);
	ok('flag was consumed', st.players[0].nextChooseOneBoth === false, st.players[0].nextChooseOneBoth);
}

// Only the NEXT Choose One benefits; a second one reverts to a single choice
{
	const st = game();
	const loc = placeLoc(st, 'cenarion_hold');
	E.tapLand(st, 0, loc.uid, 0, null);
	playChoose(st, 1); // both -> 8
	playChoose(st, 1); // single choice 1 -> +5
	ok('first was both (8), second was single (+5) = 13 total', st.players[0].armor === 13, st.players[0].armor);
}

// The flag lasts only this turn
{
	const st = game();
	const loc = placeLoc(st, 'cenarion_hold');
	E.tapLand(st, 0, loc.uid, 0, null);
	E.endTurn(st); E.endTurn(st); // back to player 0's next turn
	ok('flag cleared by the new turn', !st.players[0].nextChooseOneBoth, st.players[0].nextChooseOneBoth);
	playChoose(st, 0);
	ok('after the turn passed, Choose One is single again (3 armor)', st.players[0].armor === 3, st.players[0].armor);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
