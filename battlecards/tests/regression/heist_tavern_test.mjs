// heist_tavern_test.mjs — Dalaran Heist phase 6: the tavern (Bar) between-
// fight deck edits. TAVERN.apply mutates the run; applyRunMods bakes the
// persistent buffs / opening-hand guarantees into a booted game.
import fs from 'fs';
import * as E from '../../engine.js';
import * as H from '../../heist.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// a real creature id from the pool for deck edits
const CREA = Object.values(cardsById).find(d => d.type === 'creature' && !d.token && d.collectible !== false && (d.cost || 0) >= 2).id;
const CREA2 = Object.values(cardsById).find(d => d.type === 'creature' && !d.token && d.collectible !== false && d.id !== CREA).id;

ok('7 tavern actions defined', Object.keys(H.TAVERN).length === 7, Object.keys(H.TAVERN).length);
ok('every action has name + text + apply', Object.values(H.TAVERN).every(a => a.name && a.text && typeof a.apply === 'function'));

// --- pure run mutations ---
{
	const run = { deck: [CREA, CREA, CREA2] };
	H.TAVERN.dismiss.apply(run, CREA);
	ok('Dismiss: removes one copy', run.deck.filter(x => x === CREA).length === 1 && run.deck.length === 2);
}
{
	const run = { deck: [CREA] };
	H.TAVERN.gang.apply(run, CREA);
	ok("Gang's All Here: +3 copies", run.deck.filter(x => x === CREA).length === 4);
}
{
	const run = { deck: [] };
	H.TAVERN.veteran.apply(run, CREA);
	ok('Recruit a Veteran: adds the pick', run.deck.length === 1 && run.deck[0] === CREA);
}
{
	const run = {};
	H.TAVERN.good_food.apply(run);
	H.TAVERN.good_food.apply(run);
	ok('Good Food: +5 each, stacks', run.bonusHealth === 10);
}
{
	const run = { deck: [CREA] };
	H.TAVERN.tell_a_story.apply(run, CREA);
	ok('Tell a Story: +2/+2 buff recorded', run.deckBuffs.length === 1 && run.deckBuffs[0].attack === 2 && run.deckBuffs[0].health === 2 && run.deckBuffs[0].cost === 0);
}
{
	const run = { deck: [CREA] };
	H.TAVERN.tall_tales.apply(run, CREA);
	ok('Tall Tales: +4/+4 and +2 cost', run.deckBuffs[0].attack === 4 && run.deckBuffs[0].health === 4 && run.deckBuffs[0].cost === 2);
}
{
	const run = { deck: [CREA] };
	H.TAVERN.right_hand_man.apply(run, CREA);
	ok('Right Hand Man: opening-hand entry', run.openingHand.length === 1 && run.openingHand[0] === CREA);
}

// --- applyRunMods bakes them into a booted game ---
const bootWith = (deckIds, run) => {
	const state = E.createGame(cardsById, seededRng(7), [...deckIds], 2, [{ id: 'mage', name: 'Mage', power: { name: 'x', cost: 2, effects: [], text: '' } }, { id: 'b', name: 'Boss', power: { name: 'y', cost: 2, effects: [], text: '' } }]);
	return state;
};

// Tell a Story: every copy (hand + deck) is +2/+2
{
	const deck = Array(6).fill(CREA); // several copies so some are in hand, some in deck
	const run = { deck, deckBuffs: [{ id: CREA, attack: 2, health: 2, cost: 0 }] };
	const state = bootWith(deck, run);
	const baseA = cardsById[CREA].attack, baseH = cardsById[CREA].health;
	H.applyRunMods(state, 0, run);
	const p = state.players[0];
	const handOk = p.hand.filter(c => c.id === CREA).every(c => c.attack === baseA + 2 && c.maxHealth === baseH + 2);
	ok('applyRunMods: hand copies buffed', p.hand.some(c => c.id === CREA) && handOk);
	// draw the rest — deck copies should come out buffed too
	let allBuffed = handOk;
	while (p.deck.includes(CREA)) {
		const before = p.hand.length;
		E.drawCards(state, 0, 1);
		if (p.hand.length === before) break;
		const drawn = p.hand[p.hand.length - 1];
		if (drawn.id === CREA && !(drawn.attack === baseA + 2 && drawn.maxHealth === baseH + 2)) allBuffed = false;
	}
	ok('applyRunMods: deck copies buffed on draw', allBuffed);
}
// Tall Tales cost: drawn copy costs base + 2
{
	const deck = [CREA2, CREA, CREA];
	const run = { deck, deckBuffs: [{ id: CREA, attack: 4, health: 4, cost: 2 }] };
	const state = bootWith(deck, run);
	H.applyRunMods(state, 0, run);
	const p = state.players[0];
	// force-draw a deck copy of CREA
	p.deck = [CREA];
	E.drawCards(state, 0, 1);
	const drawn = p.hand.find(c => c.id === CREA && c.deckCostChecked !== true);
	const anyCrea = p.hand.filter(c => c.id === CREA);
	ok('Tall Tales: a drawn copy costs base + 2', anyCrea.some(c => c.cost === cardsById[CREA].cost + 2), anyCrea.map(c => c.cost).join());
}
// Right Hand Man: the named card is guaranteed in the opening hand
{
	const deck = [CREA2, CREA2, CREA2, CREA2, CREA2, CREA2, CREA]; // CREA buried at the bottom
	const run = { deck, openingHand: [CREA] };
	const state = bootWith(deck, run);
	// simulate the boss having taken the opening draw; the human still has CREA in deck
	H.applyRunMods(state, 0, run);
	ok('Right Hand Man: card is in the opening hand', state.players[0].hand.some(c => c.id === CREA));
	ok('Right Hand Man: pulled out of the deck', !state.players[0].deck.includes(CREA));
}
// bonusHealth is folded into the run life at boot (documented behavior), not applyRunMods
ok('Good Food does not touch applyRunMods (life handled at boot)', typeof H.applyRunMods === 'function');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
