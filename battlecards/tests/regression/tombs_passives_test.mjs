// tombs_passives_test.mjs — the 16 Tombs of Terror passive treasures
// (tombs.js applyPassive + the engine hooks behind them).
import fs from 'fs';
import * as E from '../../engine.js';
import * as T from '../../tombs.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('16 passives defined', Object.keys(T.PASSIVES).length === 16, Object.keys(T.PASSIVES).length);
ok('16 passive display cards imported', raw.cards.filter(c => c.set === 'TOMBS_OF_TERROR' && c.passive).length === 16);

// Unlocked Potential: drawn creatures get Attack = Health
{
	const { state } = new Scenario(byId)
		.def('t_tank', { type: 'creature', cost: 4, attack: 1, health: 7 })
		.mana(0, 20).deck(0, ['t_tank']).run();
	T.applyPassive(state, 0, 'unlocked_potential');
	E.drawCards(state, 0, 1);
	const c = state.players[0].hand.find(x => x.id === 't_tank');
	ok('Unlocked Potential: 1/7 drawn as 7/7', c && c.attack === 7);
}
// Titanic Ring: your creatures have +1 Health and Taunt
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(0, ['t_c']).run();
	T.applyPassive(state, 0, 'titanic_ring');
	const c = state.players[0].board[0];
	ok('Titanic Ring: +1 Health + Taunt', E.hp(c) === 3 && E.has(c, 'taunt'));
}
// Band of Bees: your cost-2-or-less creatures have Poisonous
{
	const { state } = new Scenario(byId)
		.def('t_cheap', { type: 'creature', cost: 2, attack: 1, health: 1 })
		.def('t_big', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.mana(0, 20).board(0, ['t_cheap', 't_big']).run();
	T.applyPassive(state, 0, 'band_of_bees');
	const cheap = state.players[0].board.find(c => c.id === 't_cheap');
	const big = state.players[0].board.find(c => c.id === 't_big');
	ok('Band of Bees: cheap gets Poisonous, big does not', E.has(cheap, 'poisonous') && !E.has(big, 'poisonous'));
}
// Band of Scarabs: enemy creatures have -1 Attack
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).board(1, ['t_e']).run();
	T.applyPassive(state, 0, 'band_of_scarabs');
	E.recomputeAuras(state);
	ok('Band of Scarabs: enemy 3/3 is now 2 Attack', state.players[1].board[0].attack === 2, state.players[1].board[0].attack);
}
// Scroll of Nonsense: +10 Spell Damage that decays each turn
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	T.applyPassive(state, 0, 'scroll_of_nonsense');
	ok('Scroll of Nonsense: +10 Spell Damage', E.staticValue(state.players[0], 'spell-damage') === 10, E.staticValue(state.players[0], 'spell-damage'));
	state.current = 0;
	E.endTurn(state);
	ok('Scroll of Nonsense: decayed to +9', E.staticValue(state.players[0], 'spell-damage') === 9, E.staticValue(state.players[0], 'spell-damage'));
}
// Disks of Swiftness: the opponent skips their first 2 turns
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	T.applyPassive(state, 0, 'disks_of_swiftness');
	ok('Disks of Swiftness: opponent has 2 skips queued', state.players[1].skipTurns === 2);
	state.current = 0;
	E.endTurn(state); // should skip player 1 and land back on 0
	ok('Disks of Swiftness: skipped opponent -> back to you', state.current === 0 && state.players[1].skipTurns === 1);
}
// Mummy Magic: first Deathrattle creature each turn gets Reborn
{
	const { state } = new Scenario(byId)
		.def('t_dr', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 1 }] })
		.mana(0, 20).hand(0, ['t_dr', 't_dr']).run();
	T.applyPassive(state, 0, 'mummy_magic');
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('Mummy Magic: first DR creature gained Reborn', state.players[0].board[0].keywords.includes('reborn'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_dr').uid, null);
	ok('Mummy Magic: second one this turn does NOT', !state.players[0].board[1].keywords.includes('reborn'));
}
// Disks of Legend: playing a Legendary creature summons a copy
{
	const { state } = new Scenario(byId)
		.def('t_leg', { type: 'creature', cost: 4, attack: 4, health: 4, rarity: 'legendary' })
		.mana(0, 20).hand(0, ['t_leg']).run();
	T.applyPassive(state, 0, 'disks_of_legend');
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('Disks of Legend: two copies on board', state.players[0].board.filter(c => c.id === 't_leg').length === 2);
}
// Alchemist's Stone: playing an odd-Cost card discounts your hand by 1
{
	const { state } = new Scenario(byId)
		.def('t_odd', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.def('t_other', { type: 'creature', cost: 5, attack: 5, health: 5 })
		.mana(0, 20).hand(0, ['t_odd', 't_other']).run();
	T.applyPassive(state, 0, 'alchemists_stone');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_odd').uid, null);
	ok("Alchemist's Stone: hand card discounted to 4", state.players[0].hand.find(c => c.id === 't_other').cost === 4);
}
// Darklight Torch: playing an even-Cost card refreshes the hero power at (0)
{
	const { state } = new Scenario(byId)
		.def('t_even', { type: 'sorcery', cost: 2, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 20).hand(0, ['t_even']).run();
	T.applyPassive(state, 0, 'darklight_torch');
	const pw = Object.assign(E.instantiate(byId['ulda_spread_shot'] || { id: 'hp', name: 'HP', type: 'heropower', cost: 0, power: { cost: 2, effects: [{ type: 'armor', value: 1 }] } }, 0), { zone: 'heropower', usedThisTurn: true });
	state.players[0].heroPowers = [pw];
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('Darklight Torch: hero power refreshed', !pw.usedThisTurn);
	ok('Darklight Torch: costs 0 this turn', E.heroPowerCost(state, 0, pw) === 0, E.heroPowerCost(state, 0, pw));
}
// Crook and Flail: casting a spell pulls a creature from your deck onto the board
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 1 }] })
		.def('t_body', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).deck(0, ['t_body']).hand(0, ['t_bolt']).run();
	T.applyPassive(state, 0, 'crook_and_flail');
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	ok('Crook and Flail: a creature came out of the deck', state.players[0].board.some(c => c.id === 't_body'));
}
// Ever-Changing Elixir: end of turn, a friendly creature transforms +1 cost
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).board(0, ['t_c']).run();
	T.applyPassive(state, 0, 'ever_changing_elixir');
	state.current = 0;
	E.endTurn(state);
	ok('Ever-Changing Elixir: the creature changed', state.players[0].board.length === 1 && state.players[0].board[0].id !== 't_c');
}
// Robes of Diminishing: a drawn spell costs 0
{
	const { state } = new Scenario(byId)
		.def('t_spell', { type: 'sorcery', cost: 6, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 20).deck(0, ['t_spell']).run();
	T.applyPassive(state, 0, 'robes_of_diminishing');
	E.drawCards(state, 0, 1);
	ok('Robes of Diminishing: drawn spell costs 0', state.players[0].hand.find(c => c.id === 't_spell').cost === 0);
}
// Lucky Spade: after a Discover, add 2 copies at -2 cost
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, [Object.keys(byId).find(id => byId[id].type === 'sorcery' && !byId[id].token)]).run();
	T.applyPassive(state, 0, 'lucky_spade');
	// trigger a discover directly
	E.execEffects(state, 0, [{ type: 'discover', pick: 3, cardType: 'creature' }], null, null);
	if (state.pickQueue.length) {
		const picked = state.pickQueue[0].ids[0];
		const before = state.players[0].hand.filter(c => c.id === picked).length;
		E.resolvePick(state, picked);
		ok('Lucky Spade: 3 copies of the pick (1 + 2)', state.players[0].hand.filter(c => c.id === picked).length === before + 3);
	} else { ok('Lucky Spade: discover queued', false); }
}
// Primordial Bulwark: block one lethal hit + blast the opponent for 20
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	T.applyPassive(state, 0, 'primordial_bulwark');
	state.players[0].life = 5; state.players[0].armor = 0;
	const foeLife = state.players[1].life;
	const dealt = E.damageHero(state, 0, 30, 1);
	ok('Primordial Bulwark: lethal blocked', dealt === 0 && state.players[0].life === 5);
	ok('Primordial Bulwark: opponent took 20', state.players[1].life === foeLife - 20, state.players[1].life);
	// second lethal is NOT blocked
	E.damageHero(state, 0, 30, 1);
	ok('Primordial Bulwark: only once per game', state.players[0].life <= 0 || state.players[0].eliminated || state.players[0].life < 5);
}
// VIP Membership: a run-cosmetic flag (no in-battle crash)
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	ok('VIP Membership applies without error', T.applyPassive(state, 0, 'vip_membership') && state.players[0].vipMembership === true);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
