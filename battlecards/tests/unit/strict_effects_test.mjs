// strict_effects_test.mjs — the dev-mode strict hooks must be loud when armed
// and PERFECTLY inert when not (state.debug is never set in production).
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- unknown effect type: silent no-op by default (current prod behavior) ---
{
	const r = new Scenario(byId)
		.def('t_typo', { type: 'sorcery', cost: 0, effects: [{ type: 'this-type-does-not-exist' }, { type: 'armor', value: 2 }] })
		.mana(0, 10).hand(0, ['t_typo'])
		.play(0, 't_typo')
		.expect('later effects still ran', st => st.players[0].armor === 2)
		.run();
	ok('debug off: unknown type is a silent no-op (pinned prod behavior)', r.failures.length === 0, r.failures);
}
// --- unknown effect type: throws under strictEffects ---
{
	const s = new Scenario(byId)
		.def('t_typo', { type: 'sorcery', cost: 0, effects: [{ type: 'this-type-does-not-exist' }] })
		.mana(0, 10).hand(0, ['t_typo']);
	const r = s.run();
	r.state.debug = { strictEffects: true };
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('strict: unknown type throws with the type named', !!threw && threw.includes('this-type-does-not-exist'), threw);
}
// --- every KNOWN effect used by real card data stays quiet under strict ---
// (spot check via a composed effect: armor-per-wisp internally execs 'armor')
{
	const s = new Scenario(byId)
		.def('t_comp', { type: 'sorcery', cost: 0, effects: [{ type: 'armor-per-wisp', value: 2 }] })
		.mana(0, 10).hand(0, ['t_comp']);
	const r = s.run();
	r.state.debug = { strictEffects: true };
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('strict: composed known effects pass', threw === null && r.state.players[0].armor === 2, threw);
}
// --- effect budget trips on runaway composition ---
{
	const s = new Scenario(byId)
		.def('t_comp', { type: 'sorcery', cost: 0, effects: [{ type: 'armor-per-wisp', value: 1 }] }) // 2 execEffects calls
		.mana(0, 10).hand(0, ['t_comp']);
	const r = s.run();
	r.state.debug = { effectBudget: 1 };
	r.state._fxCount = 0;
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('budget: composition beyond the budget throws', !!threw && threw.includes('budget'), threw);
}
// --- and a generous budget lets the same play through ---
{
	const s = new Scenario(byId)
		.def('t_comp', { type: 'sorcery', cost: 0, effects: [{ type: 'armor-per-wisp', value: 1 }] })
		.mana(0, 10).hand(0, ['t_comp']);
	const r = s.run();
	r.state.debug = { effectBudget: 100 };
	r.state._fxCount = 0;
	let threw = null;
	try { E.playCard(r.state, 0, r.state.players[0].hand[0].uid, null, null, 0); }
	catch (e) { threw = e.message; }
	ok('budget: normal play fits comfortably', threw === null && r.state.players[0].armor === 1, threw);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
