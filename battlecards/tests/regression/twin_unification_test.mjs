// twin_unification_test.mjs — PR 39: the trigger/effects twin cleanup.
//
// 2 redundant trigger handlers deleted (their effects twins are equivalent;
// the runSecretEffects default delegate routes trigger-path calls there),
// 3 no-op effects stubs deleted (the strict check now recognizes trigger-only
// types as known), 5 divergent twins kept and documented.
import fs from 'fs';
import * as E from '../../engine.js';
import { getEffectHandler, getTriggerHandler } from '../../engine/effects/registry.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- registry shape after unification ---
{
	ok('unified: buff-random-hand / damage-self have no trigger handler', !getTriggerHandler('buff-random-hand') && !getTriggerHandler('damage-self'));
	ok('unified: their effects handlers serve both paths', !!getEffectHandler('buff-random-hand') && !!getEffectHandler('damage-self'));
	ok('stubs gone: trigger-only types live only in the trigger registry',
		!getEffectHandler('buff-played-grant-deathrattle') && !!getTriggerHandler('buff-played-grant-deathrattle')
		&& !getEffectHandler('set-attacked-health') && !!getTriggerHandler('set-attacked-health')
		&& !getEffectHandler('become-copy-of-dead') && !!getTriggerHandler('become-copy-of-dead'));
	ok('kept twins still dual-registered', !!getTriggerHandler('set-attack') && !!getEffectHandler('set-attack')
		&& !!getTriggerHandler('buff-self') && !!getEffectHandler('buff-self'));
	ok('multi-label sibling survived the shared-fn line removal', !!getTriggerHandler('buff-random-hand-on-death'));
}
// --- trigger-path buff-random-hand: now routes via the delegate to the effects twin ---
{
	const { state } = new Scenario(byId)
		.def('t_bat', { type: 'creature', cost: 2, attack: 2, health: 2, ongoing: { on: 'turn-end', effects: [{ type: 'buff-random-hand', attack: 2, health: 2 }] } })
		.def('t_handling', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_bat']).hand(0, ['t_handling'])
		.run();
	E.endTurn(state);
	const c = state.players[0].hand.find(x => x.id === 't_handling');
	ok('ongoing buff-random-hand still buffs a hand creature', c.attack === 3 && c.maxHealth === 3, `${c.attack}/${c.maxHealth}`);
}
// --- trigger-path damage-self: delegate + zone guard, same outcome ---
{
	const { state } = new Scenario(byId)
		.def('t_masochist', { type: 'creature', cost: 2, attack: 2, health: 6, ongoing: { on: 'turn-end', effects: [{ type: 'damage-self', value: 2 }] } })
		.board(0, ['t_masochist'])
		.run();
	E.endTurn(state);
	ok('ongoing damage-self still damages the holder', state.players[0].board[0].damage === 2);
}
// --- trigger-only stub type: no-ops via execEffects, and strict mode accepts it ---
{
	const s = new Scenario(byId)
		.def('t_misroute', { type: 'sorcery', cost: 0, effects: [{ type: 'set-attacked-health', value: 1 }, { type: 'armor', value: 2 }] })
		.mana(0, 10).hand(0, ['t_misroute']);
	const r = s.run();
	r.state.debug = { strictEffects: true };
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('trigger-only type via execEffects: no strict throw, later effects run', threw === null && r.state.players[0].armor === 2, threw);
}
// --- kept twin still routes trigger-path to the trigger handler ---
// (set-attack's trigger subject is triggering() = ctx.minion — a SUMMONED
// context; self-damaged contexts carry no ctx.minion and historically no-op)
{
	const { state } = new Scenario(byId)
		.def('t_watch', { type: 'creature', cost: 2, attack: 2, health: 9, ongoing: { on: 'summoned', effects: [{ type: 'set-attack', value: 9 }] } })
		.def('t_arrival', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_watch']).hand(0, ['t_arrival'])
		.play(0, 't_arrival')
		.run();
	const arrival = state.players[0].board.find(c => c.id === 't_arrival');
	ok('kept twin: trigger set-attack hits the arriving minion (ctx.minion subject)', arrival.attack === 9, arrival.attack);
	ok('kept twin: the watcher itself is untouched', state.players[0].board.find(c => c.id === 't_watch').attack === 2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
