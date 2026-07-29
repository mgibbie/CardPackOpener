// summon_recursion_test.mjs — a runaway "summon → summon…" chain must
// terminate via the MAX_SUMMON_DEPTH guard, not overflow the stack.
// Repro: Spiritsinger Umbra fires a summoned minion's deathrattle on summon;
// give a token a deathrattle that summons a copy of itself, and Umbra turns
// every summon into another summon — unbounded before the guard.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// a token whose deathrattle summons another copy of itself
byId.t_selfsummon = {
	id: 't_selfsummon', name: 'Self Summoner', type: 'creature', cost: 1, attack: 1, health: 1,
	rarity: 'common', token: true, keywords: ['deathrattle'],
	deathrattle: [{ type: 'summon', count: 1, summonId: 't_selfsummon' }],
};

// with Umbra on board, playing the self-summoner recurses: summon fires
// Umbra's 'summoned' trigger → runs the token's deathrattle → summons another
// → fires again → … The guard must stop it cleanly.
{
	let threw = false, board = 0;
	try {
		const { state } = new Scenario(byId)
			.mana(0, 20).board(0, ['spiritsinger_umbra']).hand(0, ['t_selfsummon'])
			.play(0, 't_selfsummon').run();
		board = state.players[0].board.filter(c => c.id === 't_selfsummon').length;
	} catch (e) { threw = true; }
	ok('runaway summon chain did NOT overflow the stack', !threw);
	ok('the chain terminated with a bounded number of tokens', board > 0 && board < 60, board);
}

// branching version: the deathrattle summons TWO copies, so the chain fans
// out exponentially in breadth — the board ceiling must contain it (the depth
// guard alone would let it explode into an out-of-memory blowup)
{
	byId.t_branch = {
		id: 't_branch', name: 'Brancher', type: 'creature', cost: 1, attack: 1, health: 1,
		rarity: 'common', token: true, keywords: ['deathrattle'],
		deathrattle: [{ type: 'summon', count: 2, summonId: 't_branch' }],
	};
	let threw = false, live = 0;
	try {
		const { state } = new Scenario(byId)
			.mana(0, 20).board(0, ['spiritsinger_umbra']).hand(0, ['t_branch'])
			.play(0, 't_branch').run();
		live = state.players[0].board.filter(c => c.id === 't_branch' && E.hp(c) > 0).length;
	} catch (e) { threw = true; }
	ok('branching summon chain did NOT overflow or OOM', !threw);
	ok('branching chain bounded by the board ceiling (<= 41)', live <= 41, live);
}

// a normal (non-recursive) summon still fires its on-summon trigger once
{
	const { state } = new Scenario(byId)
		.def('t_plain', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 20).board(0, ['spiritsinger_umbra']).hand(0, ['t_plain'])
		.play(0, 't_plain').run();
	ok('a normal summon still resolves (Umbra present, no deathrattle)',
		state.players[0].board.some(c => c.id === 't_plain'));
}

// depth counter is transient — back to 0 after the action settles
{
	const { state } = new Scenario(byId).mana(0, 20).board(0, ['spiritsinger_umbra']).hand(0, ['t_selfsummon']).play(0, 't_selfsummon').run();
	ok('summonDepth resets to 0 between actions', !state.summonDepth);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
