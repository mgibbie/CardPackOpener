// excavate_revival_test.mjs — PR 28: the real tiered Excavate, revived.
//
// The Badlands tier progression (Fool's Azerite → Fragment → Chunk → Gem →
// class Azerite legendary, repeating) was fully implemented but sat in a
// SHADOWED second chain branch — all 27 Excavate cards silently got the old
// random-Treasure approximation instead. The tiered path is primary now.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

{
	const s = new Scenario(byId)
		.def('t_dig', { type: 'sorcery', cost: 0, effects: [{ type: 'excavate' }] })
		.mana(0, 10)
		.hand(0, ['t_dig', 't_dig', 't_dig', 't_dig', 't_dig']);
	const { state } = s.run();
	const p = state.players[0];
	const digOnce = () => E.playCard(state, 0, p.hand.find(c => c.id === 't_dig').uid, null, null, 0);
	const gained = () => p.hand.filter(c => c.id !== 't_dig').map(c => c.id);

	digOnce();
	ok('tier 1: Fool\'s Azerite', gained().includes('fools_azerite'), gained());
	digOnce();
	ok('tier 2: Azerite Fragment', gained().includes('azerite_fragment'));
	digOnce();
	ok('tier 3: Azerite Chunk', gained().includes('azerite_chunk'));
	digOnce();
	ok('tier 4: Azerite Gem', gained().includes('azerite_gem'));
	digOnce();
	const fifth = gained().filter(id => !['fools_azerite', 'azerite_fragment', 'azerite_chunk', 'azerite_gem'].includes(id));
	ok('tier 5: an Azerite legendary from the pool', fifth.length === 1 && E.ALL_AZERITE_LEGENDARIES.includes(fifth[0]), fifth);
	ok('excavateCount tracks the digs (excavatedTwice conds keep working)', p.excavateCount === 5);
	ok('event stream announces each excavation', state.events.filter(ev => ev.type === 'excavated').length === 5);
}
// --- the e.id escape hatch keeps the old conjure-specific path ---
{
	const { state } = new Scenario(byId)
		.def('t_olddig', { type: 'sorcery', cost: 0, effects: [{ type: 'excavate', id: 'ww_treasure' }] })
		.mana(0, 10).hand(0, ['t_olddig'])
		.play(0, 't_olddig')
		.run();
	ok('e.id: conjures the named treasure (legacy path)', state.players[0].hand.some(c => c.id === 'ww_treasure'));
}
// --- refresh-mana retirement: live merged semantics pinned ---
{
	const { state } = new Scenario(byId)
		.def('t_kun', { type: 'sorcery', cost: 0, effects: [{ type: 'refresh-mana' }] })
		.def('t_sip', { type: 'sorcery', cost: 3, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).hand(0, ['t_sip', 't_kun'])
		.run();
	const p = state.players[0];
	E.playCard(state, 0, p.hand.find(c => c.id === 't_sip').uid, null, null, 0);
	ok('setup: 3 mana spent', p.mana.cur === 7);
	E.playCard(state, 0, p.hand.find(c => c.id === 't_kun').uid, null, null, 0);
	ok('refresh-mana (no value): full refill', p.mana.cur === p.mana.max);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
