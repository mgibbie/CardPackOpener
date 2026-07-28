// stack_priority_test.mjs — characterization of the stack, priority windows,
// responses, and counterspells. This subsystem had zero coverage before this
// suite; every assertion pins CURRENT behavior.
//
// Key facts encoded here:
//  - Actions resolve synchronously unless an opponent holds a castable instant.
//  - Attacks go on the stack too and can fizzle if the attacker dies.
//  - Counters lock onto the top matching spell at declare time.
//  - Soft counters ("unless they pay N") pause the stack via the ask queue.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const sc = () => new Scenario(byId)
	.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
	.def('s_facebolt', { type: 'sorcery', cost: 2, effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] })
	.def('i_bolt', { type: 'instant', cost: 1, effects: [{ type: 'damage', value: 3, target: 'creature' }] })
	.def('i_armor', { type: 'instant', cost: 1, effects: [{ type: 'armor', value: 5 }] })
	.def('i_counter', { type: 'instant', cost: 2, counterSpell: true, effects: [], description: 'Counter target spell.' })
	.def('i_counter_mv4', { type: 'instant', cost: 1, counterSpell: true, counter: { manaValue: 4 }, effects: [] })
	.def('i_soft_counter', { type: 'instant', cost: 1, counterSpell: true, counter: { unlessPay: 2 }, effects: [] })
	.mana(0, 10).mana(1, 10);

// --- no responder: sorcery resolves immediately, no window ---
{
	const r = sc().hand(0, ['s_facebolt'])
		.play(0, 's_facebolt')
		.expect('no stack/priority left', st => st.stack.length === 0 && st.priority == null)
		.expectLife(1, E.STARTING_LIFE - 3)
		.run();
	ok('no instants anywhere: spell resolves synchronously', r.failures.length === 0, r.failures);
}
// --- window opens when the opponent holds a castable instant ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_armor'])
		.play(0, 's_facebolt')
		.expect('spell is parked on the stack', st => st.stack.length === 1 && st.stack[0].kind === 'spell')
		.expect('priority handed to the opponent', st => st.priority === 1 && E.hasPriority(st, 1) && !E.hasPriority(st, 0))
		.expect('pendingSpellFor shows them the spell', st => E.pendingSpellFor(st, 1)?.card.id === 's_facebolt')
		.expect('responseOptions lists their instant', st => E.responseOptions(st, 1).map(c => c.id).join() === 'i_armor')
		.expect('spell has NOT resolved yet', st => st.players[1].life === E.STARTING_LIFE)
		.run();
	ok('response window opens with priority + pending info', r.failures.length === 0, r.failures);
}
// --- passing resolves the spell ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_armor'])
		.play(0, 's_facebolt')
		.respondPass(1)
		.expect('stack drained', st => st.stack.length === 0 && st.priority == null)
		.expectLife(1, E.STARTING_LIFE - 3)
		.run();
	ok('pass: original spell resolves', r.failures.length === 0, r.failures);
}
// --- responding: LIFO — the response resolves BEFORE the original ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_armor'])
		.play(0, 's_facebolt')
		.respond(1, 'i_armor')
		.expect('armor went up first and absorbed the bolt', st =>
			st.players[1].life === E.STARTING_LIFE && st.players[1].armor === 2)
		.expect('stack fully drained afterwards', st => st.stack.length === 0 && st.priority == null)
		.run();
	ok('LIFO: response resolves before the spell it answered', r.failures.length === 0, r.failures);
}
// --- hard counter: spell is countered, no effect, both cards leave play ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_counter'])
		.play(0, 's_facebolt')
		.expect('counter listed via counterOptions', st => E.counterOptions(st, 1).length === 1)
		.respond(1, 'i_counter')
		.expectLife(1, E.STARTING_LIFE)         // never resolved
		.expect('spell in caster graveyard', st => st.players[0].graveyard.some(c => c.id === 's_facebolt'))
		.expect('counter in responder graveyard', st => st.players[1].graveyard.some(c => c.id === 'i_counter'))
		.expect('stack empty', st => st.stack.length === 0)
		.run();
	ok('hard counter: countered spell has no effect', r.failures.length === 0, r.failures);
}
// --- restricted counter that does not match opens NO window ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_counter_mv4'])
		.play(0, 's_facebolt')                   // MV 2 spell vs a "counter MV 4 only"
		.expect('no window opened (counter cannot target it)', st => st.priority == null && st.stack.length === 0)
		.expectLife(1, E.STARTING_LIFE - 3)
		.run();
	ok('counter restrictions gate the response window itself', r.failures.length === 0, r.failures);
}
// --- soft counter: controller may pay to save the spell ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_soft_counter'])
		.play(0, 's_facebolt')
		.respond(1, 'i_soft_counter')
		.expect('payment decision queued for the caster', st =>
			st.askQueue.length === 1 && st.askQueue[0].player === 0 && !!st.askQueue[0].counterPay)
		.expect('stack paused while the ask is open', st => st.priority == null && st.stack.length === 1)
		.do(st => E.resolveAsk(st, true))        // pay the 2
		.expect('paid: spell survived and resolved', st => st.players[1].life === E.STARTING_LIFE - 3)
		.expect('payment actually spent mana', st => E.availableMana(st.players[0]) === 10 - 2 - 2) // cast 2 + ransom 2
		.run();
	ok('soft counter: pay-to-save resolves the spell', r.failures.length === 0, r.failures);
	const r2 = sc().hand(0, ['s_facebolt']).hand(1, ['i_soft_counter'])
		.play(0, 's_facebolt')
		.respond(1, 'i_soft_counter')
		.do(st => E.resolveAsk(st, false))       // decline
		.expectLife(1, E.STARTING_LIFE)
		.expect('declined: spell countered to graveyard', st => st.players[0].graveyard.some(c => c.id === 's_facebolt'))
		.run();
	ok('soft counter: declining counters the spell', r2.failures.length === 0, r2.failures);
}
// --- attacks use the stack: a response can kill the attacker and fizzle the swing ---
{
	const r = sc().board(0, ['t_bear']).hand(1, ['i_bolt'])
		.attack(0, 0, { targetHero: 1 })
		.expect('attack parked on the stack', st => st.stack.length === 1 && st.stack[0].kind === 'attack' && st.priority === 1)
		.respond(1, 'i_bolt', { targetBoard: [0, 0] })
		.expectDead(0, 0)
		.expectLife(1, E.STARTING_LIFE)          // the swing fizzled — dead attackers don't hit
		.expect('stack drained', st => st.stack.length === 0 && st.priority == null)
		.run();
	ok('attack on the stack fizzles when the attacker dies in response', r.failures.length === 0, r.failures);
}
// --- new attacks are illegal while the stack is busy ---
{
	const r = sc().board(0, ['t_bear', 't_bear']).hand(1, ['i_armor'])
		.attack(0, 0, { targetHero: 1 })
		.expect('second attacker frozen out mid-window', st =>
			E.canAttackWith(st, 0, st.players[0].board[1]) === false)
		.respondPass(1)
		.expect('and legal again once drained', st =>
			E.canAttackWith(st, 0, st.players[0].board[1]) === true)
		.run();
	ok('no new attacks while priority is open', r.failures.length === 0, r.failures);
}
// --- an instant with a required target and no legal targets can't respond ---
{
	const r = sc().hand(0, ['s_facebolt']).hand(1, ['i_bolt'])  // bolt targets creatures; no creatures exist
		.play(0, 's_facebolt')
		.expect('no window: their only instant has no legal target', st => st.priority == null)
		.expectLife(1, E.STARTING_LIFE - 3)
		.run();
	ok('target-less instants do not hold the stack open', r.failures.length === 0, r.failures);
}
// --- hasPriority defaults to the active player when no window is open ---
{
	const r = sc()
		.expect('active player holds priority by default', st => E.hasPriority(st, 0) && !E.hasPriority(st, 1))
		.run();
	ok('hasPriority: current player when stack is quiet', r.failures.length === 0, r.failures);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
