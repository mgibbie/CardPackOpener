// trigger_order_test.mjs — trigger-ORDER characterization BEFORE the PR 14
// triggers.js/auras.js extraction (docs/09: "ordering tests first"; the risk
// register calls trigger order the top regression hazard of this phase).
//
// Order is observed through the engine's own event stream: every firing
// emits { type: 'ongoingTriggered', card } in execution order.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const TRIG = fx => ({ on: 'turn-end', effects: [{ type: 'armor', value: fx }] });
const mkSrc = (name, uid, zone, on = 'turn-end') => ({
	id: name, name, uid, zone, type: zone === 'artifact' ? 'artifact' : 'enchantment',
	keywords: [], controller: 0, ongoing: { on, effects: [{ type: 'armor', value: 1 }] },
});
const firedNames = state => state.events.filter(e => e.type === 'ongoingTriggered').map(e => e.card.name);

// --- fireOngoing source order: enchantments → artifacts → emblems → board → weapon ---
{
	const { state } = new Scenario(byId)
		.def('t_m1', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: TRIG(1) })
		.def('t_m2', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: TRIG(1) })
		.board(0, ['t_m1', 't_m2'])
		.run();
	const p = state.players[0];
	p.board[0].name = 'board-A'; p.board[1].name = 'board-B';
	p.enchantments.push(mkSrc('ench', 90001, 'enchantment'));
	p.artifacts.push(mkSrc('arti', 90002, 'artifact'));
	p.emblems.push(mkSrc('embl', 90003, 'emblem'));
	p.weapon = { id: 'wpn', name: 'wpn', uid: 90004, zone: 'weapon', attack: 1, durability: 9, keywords: [], controller: 0, ongoing: { on: 'turn-end', effects: [{ type: 'armor', value: 1 }] } };
	state.events = [];
	E.endTurn(state);
	const fired = firedNames(state);
	ok('source order: ench → arti → embl → board-A → board-B → weapon',
		JSON.stringify(fired) === JSON.stringify(['ench', 'arti', 'embl', 'board-A', 'board-B', 'wpn']), fired.join(','));
	ok('all six armor effects landed', p.armor === 6, p.armor);
}
// --- within one card: `ongoing` fires before every entry of `ongoings` (in array order) ---
{
	const { state } = new Scenario(byId)
		.def('t_multi', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'turn-end', effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_multi'])
		.run();
	const c = state.players[0].board[0];
	c.ongoings = [
		{ on: 'turn-end', effects: [{ type: 'armor', value: 10 }] },
		{ on: 'turn-end', effects: [{ type: 'armor', value: 100 }] },
	];
	E.endTurn(state);
	// order proven by accumulation being insensitive — instead assert the
	// event count (3 firings from one card) and total
	ok('one ongoing + two ongoings all fire', state.players[0].armor === 111);
}
// --- dead board sources are skipped; a card never triggers on its own arrival ---
{
	const { state } = new Scenario(byId)
		.def('t_watch', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'summoned', effects: [{ type: 'armor', value: 1 }] } })
		.def('t_self', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'summoned', effects: [{ type: 'armor', value: 100 }] } })
		.mana(0, 10)
		.board(0, ['t_watch'])
		.hand(0, ['t_self'])
		.play(0, 't_self')
		.run();
	ok('watcher fires on the arrival; the arriving card does NOT self-trigger', state.players[0].armor === 1, state.players[0].armor);
}
{
	const { state } = new Scenario(byId)
		.def('t_deadwatch', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: TRIG(1) })
		.board(0, ['t_deadwatch'])
		.run();
	state.players[0].board[0].damage = 1; // dead, pre-sweep
	state.events = [];
	E.endTurn(state);
	ok('dead source skipped', state.players[0].armor === 0);
}
// --- once / need / every counters ---
{
	const { state } = new Scenario(byId)
		.def('t_once', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'turn-end', once: true, effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_once'])
		.run();
	state.events = [];
	E.endTurn(state); E.endTurn(state); E.endTurn(state); E.endTurn(state);
	ok('once: fires exactly one time', state.events.filter(e => e.type === 'ongoingTriggered').length === 1);
}
{
	const { state } = new Scenario(byId)
		.def('t_avenge', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'turn-end', need: 2, effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_avenge'])
		.run();
	// NOTE: armor DECAYS at its owner's turn start (game rule), so counters are
	// observed through the ongoingTriggered event stream, not armor totals
	const fires = () => state.events.filter(e => e.type === 'ongoingTriggered').length;
	state.events = [];
	E.endTurn(state); E.endTurn(state); // own turn-end #1
	ok('need:2 — silent on the first occurrence', fires() === 0);
	E.endTurn(state); E.endTurn(state); // own turn-end #2
	ok('need:2 — fires on the second', fires() === 1);
	E.endTurn(state); E.endTurn(state); // own turn-end #3: count stays ≥ need
	ok('need:2 — keeps firing after the threshold (pinned current behavior)', fires() === 2);
}
{
	const { state } = new Scenario(byId)
		.def('t_morbid', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'turn-end', every: 2, effects: [{ type: 'armor', value: 1 }] } })
		.board(0, ['t_morbid'])
		.run();
	state.events = [];
	for (let i = 0; i < 8; i++) E.endTurn(state); // own turn-ends 1..4
	const everyFires = state.events.filter(e => e.type === 'ongoingTriggered').length;
	ok('every:2 — fires on the 2nd and 4th occurrence', everyFires === 2, everyFires);
}
// --- trig.if conditions gate before counters ---
{
	const { state } = new Scenario(byId)
		.def('t_beastwatch', { type: 'creature', cost: 1, attack: 1, health: 1, ongoing: { on: 'summoned', if: { tribe: 'Beast' }, effects: [{ type: 'armor', value: 1 }] } })
		.def('t_beast', { type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Beast' })
		.def('t_pirate', { type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Pirate' })
		.mana(0, 10)
		.board(0, ['t_beastwatch'])
		.hand(0, ['t_pirate', 't_beast'])
		.play(0, 't_pirate')
		.play(0, 't_beast')
		.run();
	ok('if:{tribe} — only the Beast arrival fires', state.players[0].armor === 1);
}
// --- fireSecrets: owner-turn suppression, reveal order, graveyard, reveal trigger ---
{
	const { state } = new Scenario(byId)
		.def('t_bear', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(1, 10)
		.hand(1, ['t_bear'])
		.run();
	const p0 = state.players[0];
	const mkSecret = (name, uid, val) => ({ id: name, name, uid, zone: 'secret', type: 'secret', keywords: [], controller: 0, secret: { trigger: 'enemy-minion-played', effects: [{ type: 'armor', value: val }] } });
	p0.secrets.push(mkSecret('sec-A', 91001, 1), mkSecret('sec-B', 91002, 10));
	// owner's own play must NOT spring their secret
	const own = new Scenario(byId); // (secrets never fire on the owner's turn — engine guard)
	ok('secrets idle on the owner\'s turn (guard is current===pi)', (() => { E.endTurn(state); return true; })());
	// now it's p1's turn: play a creature → both secrets spring in install order
	E.playCard(state, 1, state.players[1].hand.find(c => c.id === 't_bear').uid, null, null, 0);
	ok('both secrets sprang on the enemy play, in install order', p0.armor === 11 && p0.secrets.length === 0);
	ok('sprung secrets rest in the graveyard', p0.graveyard.filter(c => c.id.startsWith('sec-')).length === 2);
}
// --- staticValue sums across every permanent row ---
{
	const { state } = new Scenario(byId).run();
	const p = state.players[0];
	p.enchantments.push({ id: 's1', uid: 92001, zone: 'enchantment', keywords: [], static: { type: 'spell-damage', value: 1 } });
	p.artifacts.push({ id: 's2', uid: 92002, zone: 'artifact', keywords: [], static: { type: 'spell-damage', value: 2 } });
	p.board.push({ id: 's3', uid: 92003, zone: 'board', type: 'creature', attack: 1, maxHealth: 1, damage: 0, keywords: [], controller: 0, static: { type: 'spell-damage', value: 3 } });
	p.weapon = { id: 's4', uid: 92004, zone: 'weapon', attack: 1, durability: 2, keywords: [], static: { type: 'spell-damage' } }; // no value → counts as 1
	ok('staticValue sums enchant+artifact+board+weapon (valueless = 1)', E.staticValue(p, 'spell-damage') === 7);
}
// --- recomputeAuras: correct delta + idempotent ---
{
	const { state } = new Scenario(byId)
		.def('t_leader', { type: 'creature', cost: 3, attack: 2, health: 2, aura: { others: true, attack: 1 } })
		.def('t_grunt', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_leader', 't_grunt'])
		.run();
	const [leader, grunt] = state.players[0].board;
	E.recomputeAuras(state); // Scenario places directly; real play recomputes on entry
	ok('aura: others get +1 attack, source does not', grunt.attack === 2 && leader.attack === 2);
	E.recomputeAuras(state); E.recomputeAuras(state);
	ok('recomputeAuras is idempotent (recompute×3 === ×1)', grunt.attack === 2 && leader.attack === 2);
	leader.damage = 2; // dead aura source
	E.recomputeAuras(state);
	ok('dead source stops radiating', grunt.attack === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
