// effect_registry_test.mjs — the PR 13 effect-registry pilot.
//
// Six types now resolve through engine/effects/registry.js instead of the
// legacy chain: armor, draw, conjure-id, hero-shield, hero-immune-until-next,
// shuffle-ids-into-deck. These tests drive them through REAL plays (the
// registry sits inside execEffects, so gameplay is the honest surface), plus
// the trigger path (the switch's armor twin was retired — one handler now
// serves both dispatchers) and the strict-mode contract.
import fs from 'fs';
import * as E from '../../engine.js';
import { getEffectHandler, registeredTypes } from '../../engine/effects/registry.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- registry contract ---
{
	ok('pilot + batch types registered (1006 after amirdrassil-tap)', registeredTypes().length === 1006 && !!getEffectHandler('armor') && !!getEffectHandler('amirdrassil-tap'));
	ok('unknown types miss (the chain is fully retired — nothing else answers)', getEffectHandler('damage') !== undefined && getEffectHandler('no-such-type') === undefined);
	let threw = null;
	try { (await import('../../engine/effects/registry.js')).register('armor', () => {}); } catch (e) { threw = e.message; }
	ok('double registration throws', !!threw && threw.includes('twice'), threw);
}
// --- armor: battlecry path, all-heroes variant, trigger path (retired twin) ---
{
	const { state } = new Scenario(byId)
		.def('t_plate', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 3 }] })
		.def('t_vendor', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 4, target: 'all-heroes' }] })
		.mana(0, 10).hand(0, ['t_plate', 't_vendor']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_plate').uid, null, null, 0);
	ok('armor via registry', state.players[0].armor === 3);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_vendor').uid, null, null, 0);
	ok('armor all-heroes: both heroes plated', state.players[0].armor === 7 && state.players[1].armor === 4);
}
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 1, target: 'creature' }] })
		.def('t_smith', { type: 'creature', cost: 2, attack: 1, health: 6, ongoing: { on: 'self-damaged', effects: [{ type: 'armor', value: 2 }] } })
		.mana(0, 10).board(0, ['t_smith']).hand(0, ['t_bolt'])
		.play(0, 't_bolt', { targetBoard: [0, 0] })
		.run();
	ok('armor on the TRIGGER path (retired switch twin → registry)', state.players[0].armor === 2);
}
// --- draw: value, valuePer scaling, and the count-tolerance fix ---
{
	const { state } = new Scenario(byId)
		.def('t_fill', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_dr', { type: 'sorcery', cost: 0, effects: [{ type: 'draw', value: 2 }] })
		.deck(0, ['t_fill', 't_fill', 't_fill'])
		.mana(0, 10).hand(0, ['t_dr']).run();
	const before = state.players[0].hand.length;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_dr').uid, null, null, 0);
	ok('draw via registry (value)', state.players[0].hand.length === before - 1 + 2);
}
{
	// king_llane regression: {type:'draw', count:1} with NO value drew NOTHING
	// through the old chain (it read only e.value) — the handler honors count
	const { state } = new Scenario(byId)
		.def('t_fill', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_llane_draw', { type: 'sorcery', cost: 0, effects: [{ type: 'draw', count: 1 }] })
		.deck(0, ['t_fill', 't_fill'])
		.mana(0, 10).hand(0, ['t_llane_draw']).run();
	const before = state.players[0].hand.length;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_llane_draw').uid, null, null, 0);
	ok('draw count-only (king_llane fix): actually draws', state.players[0].hand.length === before - 1 + 1);
	const llaneDraw = byId.king_llane.effects.find(e => e.type === 'draw');
	ok('real king_llane data still count-only (fix is live for it)', llaneDraw.count === 1 && llaneDraw.value === undefined);
}
{
	const { state } = new Scenario(byId)
		.def('t_fill', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_shield_slam_draw', { type: 'sorcery', cost: 0, effects: [{ type: 'draw', value: 1, valuePer: 'cards-played' }] })
		.def('t_coin', { type: 'sorcery', cost: 0, effects: [{ type: 'armor', value: 0 }] })
		.deck(0, Array(5).fill('t_fill'))
		.mana(0, 10).hand(0, ['t_coin', 't_shield_slam_draw']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_coin').uid, null, null, 0);
	const before = state.players[0].hand.length;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_shield_slam_draw').uid, null, null, 0);
	ok('draw valuePer scaling still works (ctx.scaled threaded)', state.players[0].hand.length === before - 1 + 1);
}
// --- conjure-id: own hand, forEnemy, MAX_HAND guard ---
{
	const { state } = new Scenario(byId)
		.def('t_gift', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_conj', { type: 'sorcery', cost: 0, effects: [{ type: 'conjure-id', id: 't_gift' }] })
		.def('t_curse', { type: 'sorcery', cost: 0, effects: [{ type: 'conjure-id', id: 't_gift', forEnemy: true }] })
		.mana(0, 10).hand(0, ['t_conj', 't_curse']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_conj').uid, null, null, 0);
	ok('conjure-id: card materializes in own hand', state.players[0].hand.some(c => c.id === 't_gift'));
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_curse').uid, null, null, 0);
	ok('conjure-id forEnemy: lands in the enemy hand', state.players[1].hand.some(c => c.id === 't_gift'));
}
// --- hero-shield + hero-immune-until-next ---
{
	const { state } = new Scenario(byId)
		.def('t_cloud', { type: 'sorcery', cost: 0, effects: [{ type: 'hero-shield' }] })
		.def('t_bunker', { type: 'sorcery', cost: 0, effects: [{ type: 'hero-immune-until-next' }] })
		.mana(0, 10).hand(0, ['t_cloud', 't_bunker']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_cloud').uid, null, null, 0);
	ok('hero-shield set', state.players[0].heroShield === true);
	E.damageHero(state, 0, 5, 1);
	ok('hero-shield pops on the next hit', state.players[0].life === 40 && state.players[0].heroShield === false);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_bunker').uid, null, null, 0);
	ok('hero-immune-until-next: window spans a full round', state.players[0].heroImmuneUntilTurn === state.turnNumber + 2);
	E.damageHero(state, 0, 5, 1);
	ok('immune window blocks damage', state.players[0].life === 40);
}
// --- shuffle-ids-into-deck: own + forEnemy ---
{
	const { state } = new Scenario(byId)
		.def('t_seed', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_plant', { type: 'sorcery', cost: 0, effects: [{ type: 'shuffle-ids-into-deck', ids: ['t_seed', 't_seed'] }] })
		.def('t_infest', { type: 'sorcery', cost: 0, effects: [{ type: 'shuffle-ids-into-deck', ids: ['t_seed'], forEnemy: true }] })
		.mana(0, 10).hand(0, ['t_plant', 't_infest']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_plant').uid, null, null, 0);
	ok('shuffle-ids: two copies into own deck', state.players[0].deck.filter(id => id === 't_seed').length === 2);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_infest').uid, null, null, 0);
	ok('shuffle-ids forEnemy: into the enemy deck', state.players[1].deck.filter(id => id === 't_seed').length === 1);
}
// --- batch 1 spot-checks: three migrated types through real plays ---
{
	const { state } = new Scenario(byId)
		.def('t_iceblock', { type: 'sorcery', cost: 0, effects: [{ type: 'hero-immune' }] })
		.def('t_shout', { type: 'sorcery', cost: 0, effects: [{ type: 'commanding-shout' }] })
		.def('t_prep', { type: 'sorcery', cost: 0, effects: [{ type: 'spells-cost-one' }] })
		.def('t_big', { type: 'sorcery', cost: 7, effects: [{ type: 'armor', value: 1 }] })
		.def('t_frail', { type: 'creature', cost: 1, attack: 0, health: 1 })
		.mana(0, 10).board(0, ['t_frail']).hand(0, ['t_iceblock', 't_shout', 't_prep', 't_big'])
		.run();
	const p = state.players[0];
	E.playCard(state, 0, p.hand.find(c => c.id === 't_iceblock').uid, null, null, 0);
	E.damageHero(state, 0, 9, 1);
	ok('batch: hero-immune blocks damage this turn', p.life === 40);
	E.playCard(state, 0, p.hand.find(c => c.id === 't_shout').uid, null, null, 0);
	ok('batch: commanding-shout arms the survive-turn floor', p.minionsSurviveTurn === state.turnNumber);
	E.playCard(state, 0, p.hand.find(c => c.id === 't_prep').uid, null, null, 0);
	ok('batch: spells-cost-one caps spell costs', E.effectiveCost(state, 0, p.hand.find(c => c.id === 't_big')) === 1);
}
// --- strict mode: registry miss + chain miss still throws ---
{
	const s = new Scenario(byId)
		.def('t_typo', { type: 'sorcery', cost: 0, effects: [{ type: 'not-a-real-type' }] })
		.mana(0, 10).hand(0, ['t_typo']);
	const r = s.run();
	r.state.debug = { strictEffects: true };
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('strict: unknown type still throws past the registry', !!threw && threw.includes('not-a-real-type'), threw);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
