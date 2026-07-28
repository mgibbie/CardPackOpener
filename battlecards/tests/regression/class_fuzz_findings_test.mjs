// class_fuzz_findings_test.mjs — PR 41: the two bugs the class-enabled fuzzer
// found the moment hero powers joined the games (the exact coverage gap the
// PR 37 discover regression exposed).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- finding 1 (fuzz seed 1437874): a defless dynamic token id in a deck
// crashed drawCards. Under "tokens cease to exist when they leave play",
// such an id now evaporates and the draw continues. ---
{
	const { state } = new Scenario(byId)
		.def('t_real', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(0, ['t_real'])
		.run();
	const p = state.players[0];
	// simulate what a become-copy token shuffled into the deck by id looks like
	p.deck.push('token_sharp_eyed_seeker'); // no such def — minted dynamically at transform time
	let threw = null, n = 0;
	try { n = E.drawCards(state, 0, 1); } catch (e) { threw = e.message; }
	ok('defless token id: no crash', threw === null, threw);
	ok('the id evaporated and the REAL card was drawn instead', n === 1
		&& state.players[0].hand.some(c => c.id === 't_real')
		&& !p.deck.includes('token_sharp_eyed_seeker'));
}
// --- finding 2 (fuzz seed 2063475): responseOptions offered an instant that
// canPlay then rejected — parityBlock (Thaddius-style even/odd lock) was
// enforced at resolve time but not at offer time. ---
{
	const { state } = new Scenario(byId)
		.def('t_zap', { type: 'instant', cost: 2, effects: [{ type: 'armor', value: 1 }] })
		.def('t_slow', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).mana(1, 10)
		.hand(0, ['t_slow'])
		.hand(1, ['t_zap'])
		.run();
	// open a priority window: p0 casts a sorcery, p1 may respond
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_slow').uid, null, null, 0);
	ok('setup: p1 holds priority over a stacked spell', state.priority === 1 && state.stack.length === 1);
	const before = E.responseOptions(state, 1).map(c => c.id);
	ok('unblocked: the instant is offered', before.includes('t_zap'), before);
	state.players[1].parityBlock = 'even'; // Thaddius-style lock: cost-2 instant is now illegal
	const after = E.responseOptions(state, 1).map(c => c.id);
	ok('parityBlock: the offer and the validator now agree (not offered)', !after.includes('t_zap'), after);
	// and if something tries anyway, the engine still refuses (consistent)
	ok('forced attempt still rejected', E.resolveResponse(state, 1, state.players[1].hand[0].uid, null, null) === false);
}
// --- the coverage gap itself: split-mode fuzz games now field hero classes ---
{
	const CLASSES = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
	const state = E.createGame(byId, seededRng(9), null, 2, [CLASSES[0], CLASSES[1]]);
	ok('class picks equip hero powers', state.players[0].heroPowers.length === 1 && state.players[1].heroPowers.length === 1);
	const hp = state.players[0].heroPowers[0];
	ok('the class power is usable through the public API', typeof E.canUseHeroPower(state, 0, hp) === 'boolean');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
