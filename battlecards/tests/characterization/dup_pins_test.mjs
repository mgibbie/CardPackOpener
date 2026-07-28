// dup_pins_test.mjs — pins for the surviving first-wins duplicate handlers.
//
// After the shadow FIXES (see tests/regression/shadowed_handlers_test.mjs),
// these pins assert that the remaining duplicates' FIRST copies serve every
// caller correctly — so a future cleanup that deletes the dead copies (or a
// registry migration) has the intended behavior on record.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- summon-of-spell-cost: the merged first case serves BOTH variants ---
// (its own comment records the old shadow; the dead 2920 copy must never matter)
{
	const r = new Scenario(byId)
		.def('t_tiger_watch', { type: 'creature', cost: 2, attack: 2, health: 2,
			ongoing: { on: 'spell-played', effects: [{ type: 'summon-of-spell-cost', name: 'Tiger', tribe: 'Beast' }] } })
		.def('t_sp3', { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).board(0, ['t_tiger_watch']).hand(0, ['t_sp3'])
		.play(0, 't_sp3')
		.expect('named variant: a 3/3 Tiger token', st =>
			st.players[0].board.some(c => c.name === 'Tiger' && c.attack === 3 && E.hp(c) === 3))
		.run();
	ok('summon-of-spell-cost: token variant (e.name) works', r.failures.length === 0, r.failures);
	const r2 = new Scenario(byId)
		.def('t_stone_watch', { type: 'creature', cost: 2, attack: 2, health: 2,
			ongoing: { on: 'spell-played', effects: [{ type: 'summon-of-spell-cost' }] } })
		.def('t_sp3', { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).board(0, ['t_stone_watch']).hand(0, ['t_sp3'])
		.play(0, 't_sp3')
		.expect('random variant: summoned a 3-cost minion', st =>
			st.players[0].board.some(c => c.id !== 't_stone_watch' && (byId[c.id]?.cost || 0) === 3))
		.run();
	ok('summon-of-spell-cost: random variant (no e.name) works', r2.failures.length === 0, r2.failures);
}
// --- gain-armor-by-amount: identical twins; the first fires on the ctx amount ---
{
	const r = new Scenario(byId)
		.def('t_smith', { type: 'creature', cost: 2, attack: 1, health: 6,
			ongoing: { on: 'self-damaged', effects: [{ type: 'gain-armor-by-amount' }] } })
		.def('t_poke', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 3, target: 'creature' }] })
		.mana(0, 10).board(0, ['t_smith']).hand(0, ['t_poke'])
		.play(0, 't_poke', { targetBoard: [0, 0] })
		.expect('armor equal to the damage taken', st => st.players[0].armor === 3)
		.run();
	ok('gain-armor-by-amount: first copy fires with ctx.amount', r.failures.length === 0, r.failures);
}
// --- equip-id: the first (hammer-bonus-aware) copy serves every caller ---
{
	const r = new Scenario(byId)
		.def('t_wpn9', { type: 'weapon', cost: 3, attack: 2, durability: 3 })
		.def('t_call', { type: 'sorcery', cost: 0, effects: [{ type: 'equip-id', id: 't_wpn9' }] })
		.mana(0, 10).hand(0, ['t_call'])
		.play(0, 't_call')
		.expect('weapon equipped by id', st => st.players[0].weapon && st.players[0].weapon.id === 't_wpn9')
		.run();
	ok('equip-id: first copy equips (Medivh-duplicate stays dead)', r.failures.length === 0, r.failures);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
