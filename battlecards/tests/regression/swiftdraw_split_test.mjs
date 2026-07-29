// swiftdraw_split_test.mjs — "Swiftdraw" split into its two real keywords:
//   Miracle   (HS Quickdraw): bonus effects when played the turn it was drawn
//   Quickdraw (OG Magepunk):  temporary draw; unplayed cards shuffle back at end of turn
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// no card mentions the old keyword anywhere
ok('no card text/fields mention Swiftdraw', !JSON.stringify(raw).toLowerCase().includes('swiftdraw'));

// --- Miracle: bonus fires only when played the turn it was drawn ---
{
	// bounty_wrangler: "Miracle or Combo: Get a Coin." — drawn this turn → coin
	const { state } = new Scenario(byId)
		.mana(0, 10).deck(0, ['bounty_wrangler'])
		.run();
	E.drawCards(state, 0, 1);
	const card = state.players[0].hand.find(c => c.id === 'bounty_wrangler');
	ok('miracle card drawn this turn is marked', card?.drawnThisTurn === true);
	const coins = state.players[0].hand.filter(c => c.id === 'coin').length;
	E.playCard(state, 0, card.uid, null);
	ok('Miracle fired: got a Coin when played the turn drawn', state.players[0].hand.filter(c => c.id === 'coin').length > coins);
}
{
	// starts in hand (not drawn this turn) → no coin
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['bounty_wrangler'])
		.run();
	const card = state.players[0].hand.find(c => c.id === 'bounty_wrangler');
	card.drawnThisTurn = false; // held since an earlier turn
	E.playCard(state, 0, card.uid, null);
	ok('Miracle did NOT fire when not drawn this turn', !state.players[0].hand.some(c => c.id === 'coin'));
}
// azerite_chain_gang: "Taunt. Battlecry and Miracle: Summon a copy of this."
// drawn this turn: played body + battlecry copy + miracle copy = 3; held: 2
{
	const { state } = new Scenario(byId)
		.mana(0, 10).deck(0, ['azerite_chain_gang'])
		.run();
	E.drawCards(state, 0, 1);
	const card = state.players[0].hand.find(c => c.id === 'azerite_chain_gang');
	E.playCard(state, 0, card.uid, null);
	ok('Chain Gang drawn-this-turn: 3 bodies (battlecry + Miracle)', state.players[0].board.filter(c => c.id === 'azerite_chain_gang').length === 3);
}
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['azerite_chain_gang'])
		.run();
	const card = state.players[0].hand.find(c => c.id === 'azerite_chain_gang');
	card.drawnThisTurn = false;
	E.playCard(state, 0, card.uid, null);
	ok('Chain Gang held: 2 bodies (battlecry only)', state.players[0].board.filter(c => c.id === 'azerite_chain_gang').length === 2);
}
// flint_firearm: conjure pool is non-empty now that miracle is a real keyword
{
	const pool = raw.cards.filter(c => (c.keywords || []).includes('miracle'));
	ok('Miracle keyword pool for Flint Firearm has 10 cards', pool.length === 10, pool.length);
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['flint_firearm'])
		.run();
	const card = state.players[0].hand.find(c => c.id === 'flint_firearm');
	E.playCard(state, 0, card.uid, null);
	const got = state.players[0].hand[0];
	ok('Flint Firearm conjured a Miracle card', !!got && (byId[got.id]?.keywords || []).includes('miracle'), got?.id);
}

// --- Quickdraw: temporary draw, unplayed shuffle back at end of turn ---
{
	// officer_octo: Battlecry: Quickdraw 8.
	const { state } = new Scenario(byId)
		.def('t_filler', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, Array(10).fill('t_filler')).hand(0, ['officer_octo'])
		.play(0, 'officer_octo')
		.run();
	const p = state.players[0];
	const qd = p.hand.filter(c => c.quickdrawn);
	ok('Officer Octo drew 8, all marked quickdrawn', qd.length === 8, qd.length);
	const deckBefore = p.deck.length;
	E.endTurn(state);
	ok('unplayed Quickdrawn cards left the hand at end of turn', p.hand.filter(c => c.quickdrawn).length === 0);
	ok('...and shuffled back into the deck', p.deck.length === deckBefore + 8, p.deck.length);
}
{
	// a played Quickdrawn card STAYS played (only unplayed ones return)
	const { state } = new Scenario(byId)
		.def('t_cheap', { type: 'creature', cost: 0, attack: 1, health: 1 })
		.def('t_qd', { type: 'sorcery', cost: 0, effects: [{ type: 'quickdraw', value: 2 }] })
		.mana(0, 10).deck(0, ['t_cheap', 't_cheap']).hand(0, ['t_qd'])
		.play(0, 't_qd')
		.run();
	const p = state.players[0];
	const drawn = p.hand.find(c => c.quickdrawn);
	E.playCard(state, 0, drawn.uid, null);
	E.endTurn(state);
	ok('played Quickdrawn creature stays on board', p.board.some(c => c.id === 't_cheap'));
	ok('the other one went back to the deck', p.deck.length === 1, p.deck.length);
}
{
	// landlocked_privateer: Inspire: Quickdraw 2 (fires on hero power use)
	const { state } = new Scenario(byId)
		.def('t_filler', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, ['t_filler', 't_filler', 't_filler']).board(0, ['landlocked_privateer'])
		.run();
	const p = state.players[0];
	state.players[0].heroPowers.push(Object.assign(E.instantiate({ id: 'test_power', name: 'Test', type: 'heropower', cost: 0, power: { cost: 0, effects: [{ type: 'armor', value: 1 }] } }, 0), { zone: 'heropower' }));
	E.useHeroPower(state, 0, p.heroPowers[0].uid, null);
	ok('Privateer Inspire: Quickdraw 2 on hero power', p.hand.filter(c => c.quickdrawn).length === 2, p.hand.length);
}
{
	// captain_eberhart: your Quickdraw cards cost 1 less
	const { state } = new Scenario(byId)
		.mana(0, 10).board(0, ['captain_eberhart']).hand(0, ['gale_lizard'])
		.run();
	const card = state.players[0].hand.find(c => c.id === 'gale_lizard');
	ok('Eberhart discounts a Quickdraw card by 1', E.effectiveCost(state, 0, card) === (byId.gale_lizard.cost - 1),
		`${E.effectiveCost(state, 0, card)} vs base ${byId.gale_lizard.cost}`);
}
{
	// westward_prosperity: Quest — Quickdraw 9 cards → 9 damage to all enemies
	const { state } = new Scenario(byId)
		.def('t_filler', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_qd9', { type: 'sorcery', cost: 0, effects: [{ type: 'quickdraw', value: 9 }] })
		.def('t_wall', { type: 'creature', cost: 2, attack: 2, health: 12 })
		.mana(0, 10).deck(0, Array(12).fill('t_filler')).hand(0, ['westward_prosperity', 't_qd9']).board(1, ['t_wall'])
		.run();
	const p = state.players[0];
	const quest = p.hand.find(c => c.id === 'westward_prosperity');
	E.playCard(state, 0, quest.uid, null);
	ok('quest installed', p.quests.length === 1);
	const foeLife = state.players[1].life;
	const spell = p.hand.find(c => c.id === 't_qd9');
	E.playCard(state, 0, spell.uid, null);
	ok('quest completed at 9 quickdraws', p.quests.length === 0);
	ok('reward: 9 damage to enemy hero', state.players[1].life === foeLife - 9, state.players[1].life);
	ok('reward: 9 damage to enemy creatures', state.players[1].board[0].damage === 9);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
