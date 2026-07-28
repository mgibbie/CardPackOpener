// cost_test.mjs — per-modifier unit tests for engine/cost.js (PR 8).
//
// The extraction is verbatim (verified by seeded-digest comparison at move
// time); these tests pin each modifier FAMILY individually so future edits to
// the calculator fail here with a named modifier, not deep in a fuzz trace.
import fs from 'fs';
import * as E from '../../engine.js';
import { effectiveCost, heroPowerCost, discountIndex } from '../../engine/cost.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// helper: build a state, return [state, findInHand]
const mk = defs => {
	const s = new Scenario(byId);
	for (const [id, def] of Object.entries(defs)) s.def(id, def);
	return s;
};
const inHand = (st, pi, id) => st.players[pi].hand.find(c => c.id === id);

// --- facade parity: engine.js re-exports THE SAME functions ---
{
	ok('effectiveCost re-exported identically', E.effectiveCost === effectiveCost);
	ok('heroPowerCost re-exported identically', E.heroPowerCost === heroPowerCost);
}
// --- selfCost scaling (Giants family) ---
{
	const { state } = mk({
		t_giant: { type: 'creature', cost: 10, attack: 8, health: 8, selfCost: { per: 'other-creatures', amount: -1 } },
		t_body: { type: 'creature', cost: 1, attack: 1, health: 1 },
	}).hand(0, ['t_giant']).board(0, ['t_body', 't_body']).board(1, ['t_body']).run();
	ok('selfCost per other-creatures: 10 - 3 boards = 7', effectiveCost(state, 0, inHand(state, 0, 't_giant')) === 7,
		effectiveCost(state, 0, inHand(state, 0, 't_giant')));
}
{
	const { state } = mk({
		t_ghalta: { type: 'creature', cost: 12, attack: 12, health: 12, selfCost: { per: 'board-power', amount: -1 } },
		t_fatty: { type: 'creature', cost: 1, attack: 5, health: 5 },
	}).hand(0, ['t_ghalta']).board(0, ['t_fatty', 't_fatty']).run();
	ok('selfCost per board-power: 12 - 10 attack = 2', effectiveCost(state, 0, inHand(state, 0, 't_ghalta')) === 2);
}
// --- costMod board auras (Mana Wraith / Sorcerer's Apprentice family) ---
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 4, effects: [{ type: 'armor', value: 1 }] },
		t_apprentice: { type: 'creature', cost: 2, attack: 3, health: 2, costMod: { cardType: 'spell', amount: -1 } },
	}).hand(0, ['t_spell']).board(0, ['t_apprentice', 't_apprentice']).run();
	ok('costMod own spells: 4 - 2 apprentices = 2', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 2);
}
{
	const { state } = mk({
		t_min: { type: 'creature', cost: 3, attack: 3, health: 3 },
		t_wraith: { type: 'creature', cost: 2, attack: 2, health: 2, costMod: { scope: 'all', cardType: 'creature', amount: 1 } },
	}).hand(0, ['t_min']).board(1, ['t_wraith']).run();
	ok('costMod scope:all taxes the enemy hand too: 3 + 1 = 4', effectiveCost(state, 0, inHand(state, 0, 't_min')) === 4);
}
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 5, effects: [{ type: 'armor', value: 1 }] },
		t_floorer: { type: 'creature', cost: 2, attack: 2, health: 2, costMod: { cardType: 'spell', amount: -3, floor: 1 } },
	}).hand(0, ['t_spell']).board(0, ['t_floorer', 't_floorer']).run();
	ok('costMod floor: 5 - 6 stops at the floor (1)', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 1);
}
// --- one-shot discounts (costDiscounts + discountIndex consumption pairing) ---
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 4, effects: [{ type: 'armor', value: 1 }] },
	}).hand(0, ['t_spell']).run();
	const p = state.players[0];
	p.costDiscounts = [{ cardType: 'spell', amount: -2 }];
	const card = inHand(state, 0, 't_spell');
	ok('one-shot discount applies: 4 - 2 = 2', effectiveCost(state, 0, card) === 2);
	ok('discountIndex finds the same discount the payment step consumes', discountIndex(state, p, card) === 0);
	const minion = { type: 'creature', cost: 3, id: 't_x' };
	ok('discountIndex ignores non-matching card types', discountIndex(state, p, minion) === -1);
	p.costDiscounts[0].setZero = true;
	ok('setZero discount: cost becomes 0', effectiveCost(state, 0, card) === 0);
}
// --- turn-scoped free/capped spells ---
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 6, effects: [{ type: 'armor', value: 1 }] },
	}).hand(0, ['t_spell']).run();
	const card = inHand(state, 0, 't_spell');
	state.players[0].spellsCostOneThisTurn = true;
	ok('spellsCostOneThisTurn caps at 1', effectiveCost(state, 0, card) === 1);
	state.players[0].freeSpellsThisTurn = true;
	ok('freeSpellsThisTurn wins: 0', effectiveCost(state, 0, card) === 0);
}
// --- next-X one-shot player fields ---
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 5, effects: [{ type: 'armor', value: 1 }] },
		t_taunter: { type: 'creature', cost: 4, attack: 2, health: 6, keywords: ['battlecry'], effects: [] },
	}).hand(0, ['t_spell', 't_taunter']).run();
	state.players[0].nextSpellDiscount = 3;
	ok('nextSpellDiscount: 5 - 3 = 2', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 2);
	state.players[0].spellTaxNext = 2;
	ok('spellTaxNext stacks on top: 2 + 2 = 4', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 4);
	state.players[0].battlecryTaxNext = 5;
	ok('battlecryTaxNext taxes battlecry minions', effectiveCost(state, 0, inHand(state, 0, 't_taunter')) === 9);
}
// --- foreignCostReduce floors at 1, not 0 (Arcane Luminary) ---
{
	const { state } = mk({
		t_conj: { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] },
		t_lum: { type: 'creature', cost: 3, attack: 4, health: 3, foreignCostReduce: 5 },
	}).hand(0, ['t_conj']).board(0, ['t_lum']).run();
	const card = inHand(state, 0, 't_conj');
	// Scenario deals hand cards through the deck, so they carry fromDeck — and
	// Arcane Luminary only discounts cards that did NOT start in your deck
	ok('foreignCostReduce: deck-drawn cards unaffected', effectiveCost(state, 0, card) === 3);
	delete card.fromDeck; // now it reads as conjured/foreign
	ok('foreignCostReduce: foreign cards floored at 1, not 0', effectiveCost(state, 0, card) === 1);
}
// --- cost-floor static (Razorscale) beats discounts but yields to true-free ---
{
	const { state } = mk({
		t_spell: { type: 'sorcery', cost: 4, effects: [{ type: 'armor', value: 1 }] },
		t_razor: { type: 'creature', cost: 5, attack: 4, health: 6, static: { type: 'cost-floor', value: 2 } },
	}).hand(0, ['t_spell']).run();
	const p = state.players[0];
	p.board.push(Object.assign(state.players[0].hand[0].constructor === Object ? {} : {}, { id: 't_razor', uid: 99991, zone: 'board', type: 'creature', attack: 4, maxHealth: 6, damage: 0, keywords: [], static: { type: 'cost-floor', value: 2 }, controller: 0 }));
	p.costDiscounts = [{ cardType: 'spell', amount: -4 }];
	ok('cost-floor: discount stops at 2', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 2);
	p.firstCardFreeEachTurn = true;
	ok('cost-floor yields to first-card-free', effectiveCost(state, 0, inHand(state, 0, 't_spell')) === 0);
}
// --- global overrides ---
{
	const { state } = mk({
		t_min: { type: 'creature', cost: 7, attack: 7, health: 7 },
	}).hand(0, ['t_min']).run();
	state.players[0].minionCostSet = 3;
	ok('minionCostSet pins minion cost', effectiveCost(state, 0, inHand(state, 0, 't_min')) === 3);
	state.players[0].allCardsCostOne = true;
	ok('allCardsCostOne wins over minionCostSet (applied later)', effectiveCost(state, 0, inHand(state, 0, 't_min')) === 1);
}
// --- heroPowerCost modifiers ---
{
	const { state } = mk({}).run();
	const p = state.players[0];
	const hp = { power: { cost: 2 } };
	ok('hero power base cost', heroPowerCost(state, 0, hp) === 2);
	p.board.push({ id: 't_maiden', uid: 99992, zone: 'board', type: 'creature', attack: 2, maxHealth: 2, damage: 0, keywords: [], heroPowerCostSet: 1, controller: 0 });
	ok('heroPowerCostSet (Maiden of the Lake): min(2, 1) = 1', heroPowerCost(state, 0, hp) === 1);
	p.heroPowerTaxNext = 3;
	ok('heroPowerTaxNext adds', heroPowerCost(state, 0, hp) === 4);
	p.heroPowerDiscountNext = 4;
	ok('discount nets against tax, floored at 0', heroPowerCost(state, 0, hp) === 0);
	p.heroPowerTaxNext = 0; p.heroPowerDiscountNext = 0;
	p.heroPowerFreeGame = true;
	ok('heroPowerFreeGame (Raza): always 0', heroPowerCost(state, 0, hp) === 0);
}
// --- never negative ---
{
	const { state } = mk({
		t_cheap: { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] },
	}).hand(0, ['t_cheap']).run();
	state.players[0].nextSpellDiscount = 99;
	ok('effectiveCost floors at 0', effectiveCost(state, 0, inHand(state, 0, 't_cheap')) === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
