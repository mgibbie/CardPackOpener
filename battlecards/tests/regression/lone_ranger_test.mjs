// lone_ranger_test.mjs — The Lone Ranger's choose-one battlecry was pure
// rules text with no effects (playtest report: "didn't do anything").
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// choice 0: destroy target creature with cost 4 or less
{
	const { state } = new Scenario(byId)
		.def('t_cheap', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.def('t_pricey', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.mana(0, 10).board(1, ['t_cheap', 't_pricey']).hand(0, ['the_lone_ranger'])
		.play(0, 'the_lone_ranger', { choice: 0, targetBoard: [1, 0] })
		.run();
	ok('choice 0: destroyed the cost-4 creature', !state.players[1].board.some(c => c.id === 't_cheap'));
	ok('choice 0: the cost-5 creature survives', state.players[1].board.some(c => c.id === 't_pricey'));
	ok('choice 0: Ranger on board', state.players[0].board.some(c => c.id === 'the_lone_ranger'));
}
// cost-5+ creatures are not legal targets for choice 0
{
	const { state } = new Scenario(byId)
		.def('t_pricey', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.mana(0, 10).board(1, ['t_pricey']).hand(0, ['the_lone_ranger'])
		.run();
	const card = state.players[0].hand.find(c => c.id === 'the_lone_ranger');
	const spec = E.targetSpec(state, 0, card, 0);
	const targets = spec ? E.legalTargets(state, 0, spec) : [];
	ok('choice 0: no legal targets when everything costs 5+', targets.length === 0);
}
// choice 1: add a copy of target creature with cost 2 or less to your hand
{
	const { state } = new Scenario(byId)
		.def('t_small', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(1, ['t_small']).hand(0, ['the_lone_ranger'])
		.play(0, 'the_lone_ranger', { choice: 1, targetBoard: [1, 0] })
		.run();
	ok('choice 1: a copy of the target is in hand', state.players[0].hand.some(c => c.id === 't_small'));
	ok('choice 1: the original stays on their board', state.players[1].board.some(c => c.id === 't_small'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
