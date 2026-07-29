// tombs_powers_test.mjs — Tombs of Terror phase 2: the 12 Explorer hero
// powers (3 per dual-class Explorer), each fired through the real pipeline.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const usePower = (state, pi, id, target = null, choice) => {
	const card = Object.assign(E.instantiate(byId[id], pi), { zone: 'heropower', usedThisTurn: false });
	state.players[pi].heroPowers.push(card);
	return E.useHeroPower(state, pi, card.uid, target, choice);
};

ok('12 Explorer powers + the shared Treasure Cache imported', raw.cards.filter(c => c.set === 'TOMBS_OF_TERROR' && c.type === 'heropower').length === 13);

// Reno: Amateur Mage — 1 damage; Combo (a card played this turn) — 2
{
	const { state } = new Scenario(byId)
		.def('t_wall', { type: 'creature', cost: 1, attack: 0, health: 10 })
		.def('t_free', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 20).board(1, ['t_wall']).hand(0, ['t_free']).run();
	usePower(state, 0, 'ulda_amateur_mage', { type: 'creature', uid: state.players[1].board[0].uid, player: 1 });
	ok('Amateur Mage: 1 damage (no combo)', state.players[1].board[0].damage === 1, state.players[1].board[0].damage);
	// play a card to enable combo, then fire again
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_free').uid, null);
	const pw = state.players[0].heroPowers[0]; pw.usedThisTurn = false;
	E.useHeroPower(state, 0, pw.uid, { type: 'creature', uid: state.players[1].board[0].uid, player: 1 });
	ok('Amateur Mage: Combo deals 2 more (total 3)', state.players[1].board[0].damage === 3, state.players[1].board[0].damage);
}
// Reno: Relicologist — next spell +2 spell damage (a 1-damage bolt hits for 3)
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] })
		.mana(0, 20).hand(0, ['t_bolt']).run();
	usePower(state, 0, 'ulda_relicologist');
	ok('Relicologist: set the next-spell bonus', (state.players[0].nextSpellDamageBonus || 0) === 2, state.players[0].nextSpellDamageBonus);
	const foeLife = state.players[1].life;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_bolt').uid, null);
	ok('Relicologist: the 1-damage bolt dealt 3', state.players[1].life === foeLife - 3, foeLife - state.players[1].life);
}
// Reno: Arcane Craftiness — two 1-damage missiles at enemies
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 1, attack: 1, health: 5 })
		.mana(0, 20).board(1, ['t_a']).run();
	const foeLife = state.players[1].life;
	usePower(state, 0, 'ulda_arcane_craftiness');
	const dealt = state.players[1].board[0].damage + (foeLife - state.players[1].life);
	ok('Arcane Craftiness: 2 total damage among enemies', dealt === 2, dealt);
}
// Elise: Elise's Might — choose one (armor branch)
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_elises_might', null, 1); // choice 1 = Gain 2 Armor
	ok("Elise's Might: +2 Armor branch", state.players[0].armor === 2, state.players[0].armor);
}
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_elises_might', null, 0); // choice 0 = +2 Attack this turn
	ok("Elise's Might: +2 hero attack this turn", E.heroAttackValue(state.players[0]) === 2, E.heroAttackValue(state.players[0]));
}
// Elise: Druidic Teaching — heal 2 to a character
{
	const { state } = new Scenario(byId)
		.def('t_hurt', { type: 'creature', cost: 3, attack: 3, health: 6 })
		.mana(0, 20).board(0, ['t_hurt']).run();
	state.players[0].board[0].damage = 4;
	usePower(state, 0, 'ulda_druidic_teaching', { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Druidic Teaching: healed 2', state.players[0].board[0].damage === 2, state.players[0].board[0].damage);
}
// Elise: Starseeker — add a Moonfire
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_starseeker');
	ok('Starseeker: Moonfire in hand', state.players[0].hand.some(c => c.id === 'moonfire'));
}
// Finley: New Recruits — a 2/2 all-types Amalgam
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_new_recruits');
	const am = state.players[0].board.find(c => c.name === 'Amalgam');
	ok('New Recruits: 2/2 Amalgam (tribe All)', am && am.attack === 2 && E.hp(am) === 2 && (am.tribe || '') === 'All');
}
// Finley: Bubble Blower — Discover a Battlecry creature + Overload 1
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_bubble_blower');
	ok('Bubble Blower: a discover is pending', state.pickQueue.length === 1);
	if (state.pickQueue.length) {
		const picks = state.pickQueue[0].ids.map(id => byId[id]);
		ok('Bubble Blower: picks are Shaman/Paladin Battlecry creatures', picks.every(d => d && d.type === 'creature' && (d.keywords || []).includes('battlecry') && ['shaman', 'paladin'].includes(d.cardClass)), picks.map(d => d.id).join());
		E.resolvePick(state, state.pickQueue[0].ids[0]);
	}
	ok('Bubble Blower: overloaded 1', (state.players[0].overloadPending || 0) >= 1);
}
// Finley: Power Up! — Divine Shield & Windfury to a creature
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(0, ['t_c']).run();
	usePower(state, 0, 'ulda_power_up', { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	const c = state.players[0].board[0];
	ok('Power Up!: DS + Windfury', c.keywords.includes('divine_shield') && c.keywords.includes('windfury'));
}
// Brann: Spread Shot — 1 to all enemies, +1 more to the hero
{
	const { state } = new Scenario(byId)
		.def('t_m', { type: 'creature', cost: 2, attack: 2, health: 4 })
		.mana(0, 20).board(1, ['t_m']).run();
	const foeLife = state.players[1].life;
	usePower(state, 0, 'ulda_spread_shot');
	ok('Spread Shot: minion took 1', state.players[1].board[0].damage === 1);
	ok('Spread Shot: hero took 2 (1 + 1)', state.players[1].life === foeLife - 2, state.players[1].life);
}
// Brann: Well Equipped — a random weapon at 1 durability
{
	const { state } = new Scenario(byId).mana(0, 20).run();
	usePower(state, 0, 'ulda_well_equipped');
	ok('Well Equipped: equipped a weapon at Durability 1', state.players[0].weapon && state.players[0].weapon.durability === 1, state.players[0].weapon?.durability);
}
// Brann: Dino Tracking — Discover a card from your deck
{
	const { state } = new Scenario(byId)
		.def('t_d1', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_d2', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 20).deck(0, ['t_d1', 't_d2']).run();
	usePower(state, 0, 'ulda_dino_tracking');
	ok('Dino Tracking: a deck-discover is pending', state.pickQueue.length === 1 && state.pickQueue[0].ids.every(id => ['t_d1', 't_d2'].includes(id)));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
