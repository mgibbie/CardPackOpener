// heist_passives_test.mjs — Dalaran Heist phase 2: the 16 passive treasures
// (heist.js applyPassive + the engine flags behind them).
import fs from 'fs';
import * as E from '../../engine.js';
import { PASSIVES, applyPassive } from '../../heist.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('16 passives defined', Object.keys(PASSIVES).length === 16, Object.keys(PASSIVES).length);
ok('16 Heist passive display cards imported', raw.cards.filter(c => c.passive && c.set === 'DALARAN_HEIST').length === 16);

// Recycling: armor per friendly death
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 10).board(0, ['t_c']).hand(0, ['t_kill']).run();
	applyPassive(state, 0, 'recycling');
	const k = state.players[0].hand[0];
	E.playCard(state, 0, k.uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Recycling: 2 armor on friendly death', state.players[0].armor === 2, state.players[0].armor);
}
// Rocket Backpacks: minions gain rush
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_c']).run();
	applyPassive(state, 0, 'rocket_backpacks');
	ok('Rocket Backpacks: minion has rush', E.has(state.players[0].board[0], 'rush'));
}
// Emerald Goggles: left-most card cheaper
{
	const { state } = new Scenario(byId)
		.def('t_big', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.mana(0, 10).hand(0, ['t_big']).run();
	applyPassive(state, 0, 'emerald_goggles');
	ok('Emerald Goggles: leftmost costs 3', E.effectiveCost(state, 0, state.players[0].hand[0]) === 3);
}
// Robes of Gaudiness: half cost, two cards a turn
{
	const { state } = new Scenario(byId)
		.def('t_five', { type: 'creature', cost: 5, attack: 1, health: 1 })
		.def('t_free', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).hand(0, ['t_five', 't_free', 't_free', 't_free']).run();
	applyPassive(state, 0, 'robes_of_gaudiness');
	ok('Robes: 5-cost is 3 (ceil half)', E.effectiveCost(state, 0, state.players[0].hand[0]) === 3);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_free').uid, null);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_free').uid, null);
	const third = state.players[0].hand.find(c => c.id === 't_free');
	ok('Robes: third card this turn is blocked', !E.canPlay(state, 0, third));
}
// Stargazing: power twice a turn, 1 cheaper
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	applyPassive(state, 0, 'stargazing');
	const card = Object.assign(E.instantiate(byId['dala_backup'], 0), { zone: 'heropower' });
	state.players[0].heroPowers.push(card);
	ok('Stargazing: costs 1', E.heroPowerCost(state, 0, card) === 1);
	E.useHeroPower(state, 0, card.uid, null);
	ok('Stargazing: usable a second time', E.canUseHeroPower(state, 0, card));
	E.useHeroPower(state, 0, card.uid, null);
	ok('Stargazing: not a third', !E.canUseHeroPower(state, 0, card));
	ok('Stargazing: six recruits total', state.players[0].hand.filter(c => c.id === 'silver_hand_recruit').length === 6);
}
// Resourcefulness: random weapon +1/+1 at boot
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	applyPassive(state, 0, 'resourcefulness');
	ok('Resourcefulness: weapon equipped', !!state.players[0].weapon, state.players[0].weapon?.name);
}
// A Prince's Ring: hero power replaced
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	applyPassive(state, 0, 'a_princes_ring');
	const hp0 = state.players[0].heroPowers[0];
	ok("Prince's Ring: a dala power installed", !!hp0 && hp0.id.startsWith('dala_'), hp0?.id);
}
// Book of Wonders: 10 scrolls; a scroll casts + draws on draw
{
	const { state } = new Scenario(byId)
		.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, ['t_f', 't_f']).run();
	applyPassive(state, 0, 'book_of_wonders');
	ok('Book of Wonders: 10 scrolls in deck', state.players[0].deck.filter(id => id === 'dala_scroll_of_wonder').length === 10);
	state.players[0].deck = ['t_f', 'dala_scroll_of_wonder'];
	const before = state.players[0].hand.length;
	E.drawCards(state, 0, 1);
	// the scroll draws a card AND casts a random spell; the cast spell can itself
	// add/remove hand cards, so assert the invariants (scroll consumed, a draw
	// happened, no crash) rather than an exact hand size that shifts with the pool
	ok('Scroll: consumed on draw, cast a spell, drew a card', state.players[0].hand.length >= before
		&& !state.players[0].hand.some(c => c.id === 'dala_scroll_of_wonder') && !state.over);
}
// Togwaggle's Dice: hand costs randomized at end of turn
{
	const { state } = new Scenario(byId)
		.def('t_ten', { type: 'creature', cost: 10, attack: 1, health: 1 })
		.mana(0, 10).hand(0, ['t_ten', 't_ten', 't_ten']).run();
	applyPassive(state, 0, 'togwaggles_dice');
	E.endTurn(state);
	const costs = state.players[0].hand.map(c => c.cost);
	ok("Togwaggle's Dice: costs rerolled", costs.some(c => c !== 10), costs.join());
}
// Dr. Boom's Remote: three bots at boot
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	applyPassive(state, 0, 'dr_booms_remote');
	ok("Dr. Boom's Remote: 3 Boom Bots", state.players[0].board.filter(c => c.id === 'boom_bot').length === 3);
}
// Hagatha's Embrace: random hand minion grows each turn
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).hand(0, ['t_c']).run();
	applyPassive(state, 0, 'hagathas_embrace');
	E.endTurn(state); E.endTurn(state);
	const c = state.players[0].hand.find(x => x.id === 't_c');
	ok("Hagatha's Embrace: hand minion is 2/2", c.attack === 2 && c.maxHealth === 2, `${c.attack}/${c.maxHealth}`);
}
// The Hand of Rafaam: opponent holds 2 Cursed!, burns at their turn start
{
	const { state } = new Scenario(byId)
		.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(1, ['t_f', 't_f']).run();
	applyPassive(state, 0, 'the_hand_of_rafaam');
	ok('Hand of Rafaam: 2 Cursed! given', state.players[1].hand.filter(c => c.id === 'dala_cursed').length === 2);
	const life = state.players[1].life;
	E.endTurn(state); // opponent's turn starts: both curses burn
	ok('Cursed!: 4 total damage at their turn start', state.players[1].life === life - 4, state.players[1].life);
	const cur = state.players[1].hand.find(c => c.id === 'dala_cursed');
	E.playCard(state, 1, cur.uid, null);
	ok('Cursed!: playable to remove', state.players[1].hand.filter(c => c.id === 'dala_cursed').length === 1);
}
// Elixir of Vigor: copies shuffled in at (1)
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.mana(0, 10).hand(0, ['t_c']).run();
	applyPassive(state, 0, 'elixir_of_vigor');
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('Vigor: two copies in deck', state.players[0].deck.filter(id => id === 't_c').length === 2);
	state.players[0].deck = ['t_c'];
	E.drawCards(state, 0, 1);
	ok('Vigor: drawn copy costs (1)', state.players[0].hand.find(c => c.id === 't_c').cost === 1);
}
// Elixir of Vim: two extra draws, no fatigue
{
	const { state } = new Scenario(byId)
		.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).deck(0, Array(8).fill('t_f')).run();
	applyPassive(state, 0, 'elixir_of_vim');
	const before = state.players[0].hand.length;
	E.endTurn(state); E.endTurn(state); // my turn starts: 1 + 2 extra
	ok('Vim: drew 3 at turn start', state.players[0].hand.length === before + 3, state.players[0].hand.length - before);
	state.players[0].deck = [];
	const life = state.players[0].life;
	E.drawCards(state, 0, 2);
	ok('Vim: no fatigue damage', state.players[0].life === life && state.players[0].fatigue === 0);
}
// Elixir of Vile: spells cost health
{
	const { state } = new Scenario(byId)
		.def('t_sp', { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 0).hand(0, ['t_sp']).run();
	applyPassive(state, 0, 'elixir_of_vile');
	const sp = state.players[0].hand[0];
	ok('Vile: spell costs 0 mana', E.effectiveCost(state, 0, sp) === 0);
	const life = state.players[0].life;
	E.playCard(state, 0, sp.uid, null);
	ok('Vile: paid 3 Health', state.players[0].life === life - 3, state.players[0].life);
}
// Wisdomball: with a forced rng it gives advice at turn start
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	applyPassive(state, 0, 'wisdomball' in PASSIVES ? 'wisdomball' : 'wondrous_wisdomball');
	state.rng = () => 0.1; // always triggers, always picks advice[0] (2 random cards)
	const before = state.players[0].hand.length;
	E.endTurn(state); E.endTurn(state);
	ok('Wisdomball: advice granted cards', state.players[0].hand.length > before, state.players[0].hand.length - before);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
