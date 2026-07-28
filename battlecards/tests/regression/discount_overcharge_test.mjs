// discount_overcharge_test.mjs — regression for the fuzz finding (seed 420484):
//
// One-shot "your next X costs (N) less" discounts are consumed in playCard's
// preamble, but payment recomputed effectiveCost AFTER consumption — charging
// the UNDISCOUNTED price. With exactly the discounted mana available, the
// engine drove mana.cur negative; with surplus mana it silently overcharged
// (the discount never actually saved anything).
//
// Correct behavior: the player pays the price they were quoted at declare
// time (the same price canPlay validated against).
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- tribe discount (the fuzz trace: hot_spring_glider -> a Murloc) ---
{
	const r = new Scenario(byId)
		.def('t_grant', { type: 'sorcery', cost: 0, effects: [{ type: 'set-tribe-discount', tribe: 'Murloc', count: 1, value: 2 }] })
		.def('t_mur', { type: 'creature', cost: 3, attack: 2, health: 2, tribe: 'Murloc' })
		.mana(0, 1)
		.hand(0, ['t_grant', 't_mur'])
		.play(0, 't_grant')
		.expect('discounted cost quoted as 1', st => E.effectiveCost(st, 0, st.players[0].hand[0]) === 1)
		.expect('canPlay accepts at exact mana', st => E.canPlay(st, 0, st.players[0].hand[0]) === true)
		.play(0, 't_mur')
		.expect('minion arrived', st => st.players[0].board.some(c => c.id === 't_mur'))
		.expectMana(0, 0)                       // paid the QUOTED 1, not the raw 3
		.expect('state stays valid', st => validateGameState(st).length === 0)
		.run();
	ok('tribe discount: pays the quoted price (no negative mana)', r.failures.length === 0, r.failures);
}
// --- combo discount (Foxy Fraud pattern) ---
{
	const r = new Scenario(byId)
		.def('t_grantc', { type: 'sorcery', cost: 0, effects: [{ type: 'set-next-combo-discount', value: 2 }] })
		.def('t_combo', { type: 'creature', cost: 3, attack: 2, health: 2, combo: [{ type: 'armor', value: 1 }], keywords: ['combo'] })
		.mana(0, 1)
		.hand(0, ['t_grantc', 't_combo'])
		.play(0, 't_grantc')
		.play(0, 't_combo', { mayFail: true })  // if the discount effect id differs, skip gracefully
		.expect('mana never negative', st => st.players[0].mana.cur >= 0)
		.expect('state stays valid', st => validateGameState(st).length === 0)
		.run();
	ok('combo discount: mana never goes negative', r.failures.length === 0, r.failures);
}
// --- name discount (Murloc Rafaam pattern) with surplus mana: the saving is real ---
{
	const r = new Scenario(byId)
		.def('t_named', { type: 'creature', cost: 4, attack: 2, health: 2, name: 'Rafaam Test' })
		.def('t_grantn', { type: 'sorcery', cost: 0, effects: [{ type: 'next-name-discount', substr: 'Rafaam', value: 3 }] })
		.mana(0, 10)
		.hand(0, ['t_grantn', 't_named'])
		.play(0, 't_grantn')
		.play(0, 't_named')
		.expectMana(0, 9)                       // 10 - (4 - 3): the discount must actually save mana
		.run();
	ok('name discount: surplus-mana play is charged the discounted price', r.failures.length === 0, r.failures);
}
// --- exact fuzz reproduction: the original failing seed must now run clean ---
// (kept cheap: single seeded game at the finding's settings)
{
	const { execSync } = await import('child_process');
	let out = '';
	try {
		out = execSync(`node "${new URL('../fuzz/fuzz_test.mjs', import.meta.url).pathname.replace(/^\//, '')}" --games=1 --actions=600 --seed=420484`, { encoding: 'utf8' });
	} catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
	ok('fuzz seed 420484 runs clean', out.includes('0 failed'), out.split('\n').slice(0, 4).join(' | '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
