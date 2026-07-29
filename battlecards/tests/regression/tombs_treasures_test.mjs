// tombs_treasures_test.mjs — Tombs of Terror active treasures, batch 1.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

ok('batch-1 treasures marked treasure+token', raw.cards.filter(c => c.set === 'TOMBS_OF_TERROR' && c.treasure).length >= 14);

// Staff of Scales: three 1/1 rush/poisonous/reborn Snakes
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_staff_of_scales']).play(0, 'ulda_staff_of_scales').run();
	const snakes = state.players[0].board.filter(c => c.id === 'ulda_ancient_snake');
	ok('Staff of Scales: 3 Snakes', snakes.length === 3 && snakes.every(s => s.keywords.includes('poisonous') && s.keywords.includes('reborn') && s.keywords.includes('rush')));
}
// Jr. Scout: end of turn, 4 to a random enemy creature
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 3, attack: 1, health: 10 })
		.mana(0, 10).board(1, ['t_e']).board(0, ['ulda_jr_scout']).run();
	state.current = 0;
	E.endTurn(state);
	ok('Jr. Scout: 4 to an enemy creature at end of turn', state.players[1].board[0].damage === 4, state.players[1].board[0].damage);
}
// Sanctum Golem: can't attack
{
	const { state } = new Scenario(byId).mana(0, 10).board(0, ['ulda_sanctum_golem']).run();
	const g = state.players[0].board[0]; g.sick = false; state.current = 0;
	ok('Sanctum Golem: cannot attack (Pacifist)', !E.canAttackWith(state, 0, g));
}
// Enflamed Golem: DR nukes all creatures for 3 + summons a Sanctum Golem
{
	const { state } = new Scenario(byId)
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.def('t_bystander', { type: 'creature', cost: 2, attack: 1, health: 3 })
		.mana(0, 10).board(0, ['ulda_enflamed_golem']).board(1, ['t_bystander']).hand(0, ['t_kill']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Enflamed Golem: summoned a Sanctum Golem', state.players[0].board.some(c => c.id === 'ulda_sanctum_golem'));
	ok('Enflamed Golem: 3 damage hit the bystander', !state.players[1].board.length || state.players[1].board[0].damage >= 3 || state.players[1].board.length === 0);
}
// Runaway Gyrocopter: DR 5 to enemy creatures + shuffle self back
{
	const { state } = new Scenario(byId)
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.def('t_e', { type: 'creature', cost: 3, attack: 2, health: 8 })
		.mana(0, 10).board(0, ['ulda_runaway_gyrocopter']).board(1, ['t_e']).hand(0, ['t_kill']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, { type: 'creature', uid: state.players[0].board[0].uid, player: 0 });
	ok('Gyrocopter: 5 to enemy creature', state.players[1].board[0].damage === 5, state.players[1].board[0].damage);
	ok('Gyrocopter: shuffled back into deck', state.players[0].deck.includes('ulda_runaway_gyrocopter'));
}
// Crawling Claw: Rush+Reborn body; DR steals a card on its FINAL death
// (this engine's Reborn returns it at 1 health and skips the deathrattle the
// first time — the steal fires when it dies for good)
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 20).board(0, ['ulda_crawling_claw']).hand(1, ['t_held']).hand(0, ['t_kill', 't_kill']).run();
	const claw = state.players[0].board[0];
	ok('Crawling Claw: Rush + Reborn body', claw.keywords.includes('rush') && claw.keywords.includes('reborn'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: claw.uid, player: 0 });
	const reborn = state.players[0].board.find(c => c.id === 'ulda_crawling_claw');
	ok('Crawling Claw: reborned once (no steal yet)', !!reborn && !state.players[0].hand.some(c => c.id === 't_held'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_kill').uid, { type: 'creature', uid: reborn.uid, player: 0 });
	ok('Crawling Claw: stole from the enemy hand on final death', state.players[0].hand.some(c => c.id === 't_held'));
}
// Reno's Crafty Lasso: weapon steals on hero attack
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 10).hand(0, ['ulda_renos_crafty_lasso']).hand(1, ['t_held']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok("Reno's Crafty Lasso: stole on attack", state.players[0].hand.some(c => c.id === 't_held'));
}
// Reno's Lucky Hat: +2/+2 and Spell Damage +2
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ['ulda_renos_lucky_hat'])
		.play(0, 'ulda_renos_lucky_hat', { targetBoard: [0, 0] }).run();
	const c = state.players[0].board[0];
	ok("Reno's Lucky Hat: +2/+2", c.attack === 4 && E.hp(c) === 4);
	ok("Reno's Lucky Hat: Spell Damage +2", (c.spellDamage || (c.static && c.static.value) || 0) >= 2 || c.spellDamage === 2);
}
// Elise's Machete: summons two Treants on hero attack
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ["ulda_elises_machete"]).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	const treants = state.players[0].board.filter(c => c.name === 'Treant');
	ok("Elise's Machete: two Rush Treants", treants.length === 2 && treants.every(t => t.keywords.includes('rush')));
}
// Ol' Faithful: 1 to all enemies on hero attack
{
	const { state } = new Scenario(byId)
		.def('t_e', { type: 'creature', cost: 2, attack: 1, health: 5 })
		.mana(0, 10).board(1, ['t_e']).hand(0, ["ulda_ol_faithful"]).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	const foeLife = state.players[1].life;
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok("Ol' Faithful: enemy creature took 1", state.players[1].board[0].damage === 1);
}
// Karl the Lost: six Recruits + all friendly get Taunt
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_karl_the_lost']).play(0, 'ulda_karl_the_lost').run();
	const recruits = state.players[0].board.filter(c => c.id === 'silver_hand_recruit');
	ok('Karl the Lost: 6 Recruits', recruits.length === 6);
	ok('Karl the Lost: friendly board has Taunt', state.players[0].board.every(c => c.keywords.includes('taunt')));
}
// Finley's Pith Helmet: +0/+2 to friendly + shuffle self
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).board(0, ['t_c']).hand(0, ["ulda_finleys_pith_helmet"])
		.play(0, 'ulda_finleys_pith_helmet').run();
	ok("Pith Helmet: +2 Health", E.hp(state.players[0].board[0]) === 4);
	ok("Pith Helmet: shuffled back", state.players[0].deck.includes('ulda_finleys_pith_helmet'));
}
// Truesilver Lance: lifesteal weapon heals on hero attack
{
	const { state } = new Scenario(byId).mana(0, 10).hand(0, ['ulda_truesilver_lance']).run();
	E.playCard(state, 0, state.players[0].hand[0].uid, null);
	state.players[0].life = 20; state.players[0].maxLife = 40;
	E.heroAttack(state, 0, { type: 'hero', player: 1 });
	ok('Truesilver Lance: Lifesteal healed the hero', state.players[0].life === 25, state.players[0].life);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
