// macaw_recursion_test.mjs — Brilliant Macaw ("repeat your last Battlecry")
// must not recurse without bound when the last Battlecry it finds is another
// Macaw's repeat. Also verifies the normal single-repeat still works.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// normal case: Macaw repeats a real Battlecry (2 damage to the enemy hero)
{
	const { state } = new Scenario(byId)
		.def('t_bolt_bc', { type: 'creature', cost: 1, attack: 1, health: 1, keywords: ['battlecry'], effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] })
		.mana(0, 20).hand(0, ['t_bolt_bc', 'brilliant_macaw']).run();
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_bolt_bc').uid, null); // 2 to face, recorded as last BC
	const foeLife = state.players[1].life;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'brilliant_macaw').uid, null); // repeats it: 2 more
	ok('Macaw repeats a real Battlecry (2 to face)', state.players[1].life === foeLife - 2, foeLife - state.players[1].life);
}

// pathological case: two Macaws back to back. The second's "last Battlecry" is
// the first Macaw's repeat — must terminate, not overflow the stack.
{
	let threw = false;
	try {
		const { state } = new Scenario(byId)
			.mana(0, 20).hand(0, ['brilliant_macaw', 'brilliant_macaw']).run();
		E.playCard(state, 0, state.players[0].hand[0].uid, null);
		E.playCard(state, 0, state.players[0].hand.find(c => c.id === 'brilliant_macaw').uid, null);
		ok('two Macaws: both resolve onto the board', state.players[0].board.filter(c => c.id === 'brilliant_macaw').length === 2);
	} catch (e) { threw = true; }
	ok('two Macaws did NOT overflow the stack', !threw);
}

// the re-entry lock is transient — reset after the action settles
{
	const { state } = new Scenario(byId).mana(0, 20).hand(0, ['brilliant_macaw']).play(0, 'brilliant_macaw').run();
	ok('macaw lock resets between actions', !state._macawLock);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
