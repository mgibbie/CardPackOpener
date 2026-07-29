// tombs_runonly_test.mjs — the deferred Tombs "run-only"/ctx-heavy treasures:
// Navigators, Tomb Divers, Aegis of Death, Kodo Hide Whip, Explorer Retraining,
// Stolen Titan Secrets, House Special.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const T_PING = { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 1, target: 'creature' }] };
const T_SECRET = { type: 'secret', cost: 0, secret: { trigger: 'enemy-attack', effects: [] } };
const T_SECRET2 = { type: 'secret', cost: 0, secret: { trigger: 'enemy-minion-played', effects: [] } };

// all nine cards present and marked treasure+token
{
	const ids = ['ulda_jr_navigator', 'ulda_sr_navigator', 'ulda_jr_tomb_diver', 'ulda_sr_tomb_diver', 'ulda_aegis_of_death', 'ulda_kodo_hide_whip', 'ulda_explorer_retraining', 'ulda_stolen_titan_secrets', 'ulda_house_special'];
	ok('all 9 run-only treasures present', ids.every(id => byId[id] && byId[id].treasure && byId[id].set === 'TOMBS_OF_TERROR'), ids.filter(id => !byId[id]));
}

// ---- Navigators: a spell targeting me adds 2 copies of it to my hand ----
for (const [id, atk, hpv] of [['ulda_jr_navigator', 1, 5], ['ulda_sr_navigator', 2, 10]]) {
	const { state } = new Scenario(byId).def('t_ping', T_PING)
		.mana(0, 10).board(0, [id]).hand(0, ['t_ping'])
		.play(0, 't_ping', { targetBoard: [0, id] }).run();
	const copies = state.players[0].hand.filter(c => c.id === 't_ping');
	const nav = state.players[0].board.find(c => c.id === id);
	ok(`${id}: 2 copies of the targeting spell added to hand`, copies.length === 2, copies.length);
	ok(`${id}: survives the ping (${atk}/${hpv})`, !!nav && E.hp(nav) === hpv - 1);
}
// an ENEMY spell on my Navigator does NOT trigger it ("whenever YOU target")
{
	const { state } = new Scenario(byId).def('t_ping', T_PING)
		.mana(1, 10).board(0, ['ulda_jr_navigator']).hand(1, ['t_ping'])
		.do((s, E) => { s.current = 1; })
		.play(1, 't_ping', { targetBoard: [0, 'ulda_jr_navigator'] }).run();
	ok('Navigator: enemy spell does not add copies to my hand', state.players[0].hand.filter(c => c.id === 't_ping').length === 0);
}

// ---- secret counter increments on playing a secret ----
{
	const { state } = new Scenario(byId).def('t_secret', T_SECRET).def('t_secret2', T_SECRET2)
		.mana(0, 10).hand(0, ['t_secret', 't_secret2']).play(0, 't_secret').play(0, 't_secret2').run();
	ok('secretsThisGame counts played secrets', state.players[0].secretsThisGame === 2, state.players[0].secretsThisGame);
}

// ---- Tomb Divers: battlecry swaps power to Treasure Cache iff enough secrets ----
for (const [id, threshold] of [['ulda_jr_tomb_diver', 6], ['ulda_sr_tomb_diver', 3]]) {
	// below threshold: power unchanged
	{
		const { state } = new Scenario(byId).mana(0, 10).hand(0, [id])
			.do((s) => { s.players[0].secretsThisGame = threshold - 1; })
			.play(0, id).run();
		ok(`${id}: below ${threshold} secrets keeps power`, state.players[0].heroPowers[0]?.id !== 'ulda_uldum_treasure_cache');
	}
	// at threshold: power becomes Treasure Cache
	{
		const { state } = new Scenario(byId).mana(0, 10).hand(0, [id])
			.do((s) => { s.players[0].secretsThisGame = threshold; })
			.play(0, id).run();
		ok(`${id}: ${threshold}+ secrets swaps to Treasure Cache power`, state.players[0].heroPowers[0].id === 'ulda_uldum_treasure_cache', state.players[0].heroPowers[0].id);
	}
}

// ---- Aegis of Death: immune while equipped; bleeds durability; DR nukes you ----
{
	const { state } = new Scenario(byId).mana(0, 10).life(0, 30).hand(0, ['ulda_aegis_of_death']).play(0, 'ulda_aegis_of_death').run();
	const w = state.players[0].weapon;
	ok('Aegis: equipped with immune + tick flags + 3 durability', !!w && w.heroImmuneAura && w.loseDurabilityEachTurn && w.durability === 3);
	const before = state.players[0].life;
	E.damageHero(state, 0, 15, 1);
	ok('Aegis: hero is Immune to damage', state.players[0].life === before);
}
{
	// bleed it down and detonate: durability 1, then reach p0's next turn
	const { state } = new Scenario(byId).mana(0, 10).life(0, 40).hand(0, ['ulda_aegis_of_death']).play(0, 'ulda_aegis_of_death')
		.do((s) => { s.players[0].weapon.durability = 1; s.current = 0; })
		.endTurn(2) // p0 -> p1 -> p0: at p0's turn start the weapon ticks to 0 and breaks
		.run();
	ok('Aegis: breaks on its turn tick', !state.players[0].weapon);
	ok('Aegis: deathrattle deals 100 to own hero (lethal)', state.players[0].life <= 0 || state.over, state.players[0].life);
}

// ---- Kodo Hide Whip: hero attacks a survivor -> steal it to your hand ----
{
	const { state } = new Scenario(byId)
		.def('t_bigguy', { type: 'creature', cost: 5, attack: 1, health: 8 })
		.mana(0, 10).board(1, ['t_bigguy']).hand(0, ['ulda_kodo_hide_whip'])
		.play(0, 'ulda_kodo_hide_whip')
		.do((s) => { s.current = 0; })
		.heroAttack(0, { targetBoard: [1, 't_bigguy'] })
		.run();
	ok('Kodo Hide Whip: survivor removed from enemy board', !state.players[1].board.some(c => c.id === 't_bigguy'));
	ok('Kodo Hide Whip: survivor is now in your hand', state.players[0].hand.some(c => c.id === 't_bigguy'));
}
// a creature the hero KILLS is not bounced
{
	const { state } = new Scenario(byId)
		.def('t_weakling', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(1, ['t_weakling']).hand(0, ['ulda_kodo_hide_whip'])
		.play(0, 'ulda_kodo_hide_whip')
		.do((s) => { s.current = 0; })
		.heroAttack(0, { targetBoard: [1, 't_weakling'] })
		.run();
	ok('Kodo Hide Whip: a killed creature is NOT put in hand', !state.players[0].hand.some(c => c.id === 't_weakling'));
}

// ---- Explorer Retraining: Discover a new Hero Power ----
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_explorer_retraining']).play(0, 'ulda_explorer_retraining').run();
	ok('Explorer Retraining: opens a hero-power discover', state.pickQueue.length === 1 && state.pickQueue[0].heroPower === true, JSON.stringify(state.pickQueue[0]));
}

// ---- Stolen Titan Secrets: copy target opponent's Hero Power ----
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_stolen_titan_secrets'])
		.do((s) => {
			const pw = E.instantiate(byId['ulda_uldum_treasure_cache'], 1);
			pw.zone = 'heropower'; pw.usedThisTurn = false;
			s.players[1].heroPowers = [pw];
		})
		.play(0, 'ulda_stolen_titan_secrets').run();
	ok('Stolen Titan Secrets: you gain a copy of the boss power', state.players[0].heroPowers.some(h => h.id === 'ulda_uldum_treasure_cache'));
}

// ---- House Special: replace your deck with a themed premade ----
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_house_special'])
		.do((s) => { s.players[0].deck = ['ulda_house_special', 'ulda_house_special']; })
		.play(0, 'ulda_house_special').run();
	const deck = state.players[0].deck;
	ok('House Special: deck replaced with ~20 creatures', deck.length >= 10 && deck.length <= 20 && deck.every(id => byId[id] && byId[id].type === 'creature'), deck.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
