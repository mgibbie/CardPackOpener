// goldbeard_recursion_test.mjs — regression for fuzz finding, seed 9419695:
//
// Shoplifter Goldbeard ('summon-copy-attack-die', fired on 'summoned') marked
// its copy `_shoplifterCopy` only AFTER summon() returned — but summon() fires
// the 'summoned' trigger internally, so Goldbeard re-triggered on its own
// still-unmarked copy: infinite recursion, JS stack overflow, 300+ minions on
// the board along the way.
//
// Correct behavior: one real summon -> exactly one Goldbeard copy.
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

{
	const s = new Scenario(byId)
		.def('t_van9', { type: 'creature', cost: 1, attack: 1, health: 9, tribe: 'Pirate' })
		.mana(0, 10)
		.board(0, ['shoplifter_goldbeard'])
		.hand(0, ['t_van9']);
	let threw = null, r = null;
	try { r = s.play(0, 't_van9').run(); } catch (e) { threw = e.message; }
	ok('no stack overflow', threw === null, threw);
	if (r) {
		const copies = r.state.players[0].board.filter(c => c.id === 't_van9').length
			+ r.state.players[0].graveyard.filter(c => c.id === 't_van9').length;
		// the played original + exactly ONE Goldbeard copy (which attacks, then dies —
		// with no enemies it may survive on board; count board+graveyard together)
		ok('exactly one copy was created', copies === 2, `saw ${copies}`);
		ok('board is sane', r.state.players[0].board.length <= 3, r.state.players[0].board.length);
	}
}
// the original fuzz seed must complete
{
	const { execSync } = await import('child_process');
	let out = '';
	try { out = execSync(`node "${fileURLToPath(new URL('../fuzz/fuzz_test.mjs', import.meta.url))}" --games=1 --actions=800 --seed=9419695`, { encoding: 'utf8' }); }
	catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
	ok('fuzz seed 9419695 runs clean', out.includes('0 failed'), out.split('\n').slice(0, 3).join(' | '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
