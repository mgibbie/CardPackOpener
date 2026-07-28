// dup_retirement_test.mjs — PR 22: the four double-branch effect types.
//
// Each type had TWO chain branches; first-wins meant the second never ran.
// The winners moved to the registry verbatim (pinned here), and the one
// shadowed variant that was a real card bug — Echoing Ooze's "exact copy",
// which ignored hand-buffs because the fresh-def branch won — is revived
// behind e.exact and fixed in the card data.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- double-attack-self: LIVE semantics = plain double (no buff riders) ---
{
	const { state } = new Scenario(byId)
		.def('t_gahz', { type: 'creature', cost: 7, attack: 6, health: 9, keywords: ['battlecry'], effects: [{ type: 'double-attack-self' }] })
		.mana(0, 10).hand(0, ['t_gahz'])
		.play(0, 't_gahz')
		.run();
	ok('double-attack-self: 6 → 12', state.players[0].board[0].attack === 12);
}
// --- summon-self-copy: fresh-def copies with count (the 10 battlecry users) ---
{
	const { state } = new Scenario(byId)
		.def('t_gang', { type: 'creature', cost: 4, attack: 2, health: 3, keywords: ['battlecry'], effects: [{ type: 'summon-self-copy', count: 2 }] })
		.mana(0, 10).hand(0, ['t_gang'])
		.play(0, 't_gang')
		.run();
	ok('summon-self-copy: two fresh copies + the original', state.players[0].board.filter(c => c.id === 't_gang').length === 3);
	ok('fresh copies carry BASE stats', state.players[0].board.every(c => c.attack === 2));
}
// --- summon-self-copy exact: the revived Echoing Ooze variant ---
{
	const { state } = new Scenario(byId)
		.def('t_ooze', { type: 'creature', cost: 2, attack: 1, health: 2, ongoing: { on: 'turn-end', once: true, effects: [{ type: 'summon-self-copy', exact: true }] } })
		.def('t_pump', { type: 'sorcery', cost: 0, effects: [{ type: 'buff', attack: 4, health: 4, target: 'friendly-creature' }] })
		.mana(0, 10).board(0, ['t_ooze']).hand(0, ['t_pump'])
		.play(0, 't_pump', { targetBoard: [0, 0] })
		.run();
	E.endTurn(state); // the once-only turn-end trigger fires
	const oozes = state.players[0].board.filter(c => c.id === 't_ooze');
	ok('exact copy: buffed 5/6 clones as 5/6 (was silently 1/2 pre-fix)', oozes.length === 2
		&& oozes.every(c => c.attack === 5 && E.hp(c) === 6), oozes.map(c => `${c.attack}/${E.hp(c)}`).join(','));
	ok('real echoing_ooze data carries exact:true', byId.echoing_ooze.ongoing.effects[0].exact === true);
}
// --- gain-weapon-stats: weapon stats buff the source ---
{
	const { state } = new Scenario(byId)
		.def('t_freebooter', { type: 'creature', cost: 3, attack: 2, health: 2, keywords: ['battlecry'], effects: [{ type: 'gain-weapon-stats' }] })
		.mana(0, 10).hand(0, ['t_freebooter'])
		.run();
	state.players[0].weapon = { id: 't_axe', uid: 95001, zone: 'weapon', attack: 3, durability: 2, keywords: [], controller: 0 };
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const c = state.players[0].board[0];
	ok('gain-weapon-stats: +3/+2 from the weapon', c.attack === 5 && E.hp(c) === 4, `${c.attack}/${E.hp(c)}`);
}
// --- destroy-self: plain + ifAlone gate ---
{
	const { state } = new Scenario(byId)
		.def('t_corporal', { type: 'creature', cost: 2, attack: 5, health: 4, keywords: ['battlecry'], effects: [{ type: 'destroy-self' }] })
		.mana(0, 10).hand(0, ['t_corporal'])
		.play(0, 't_corporal')
		.run();
	ok('destroy-self: dies on play', state.players[0].board.length === 0
		&& state.players[0].graveyard.some(c => c.id === 't_corporal'));
}
{
	const { state } = new Scenario(byId)
		.def('t_golem', { type: 'creature', cost: 2, attack: 9, health: 2, keywords: ['battlecry'], effects: [{ type: 'destroy-self', ifAlone: true }] })
		.def('t_friend', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_friend']).hand(0, ['t_golem'])
		.play(0, 't_golem')
		.run();
	ok('destroy-self ifAlone: survives with company', state.players[0].board.some(c => c.id === 't_golem'));
}
{
	const { state } = new Scenario(byId)
		.def('t_golem', { type: 'creature', cost: 2, attack: 9, health: 2, keywords: ['battlecry'], effects: [{ type: 'destroy-self', ifAlone: true }] })
		.mana(0, 10).hand(0, ['t_golem'])
		.play(0, 't_golem')
		.run();
	ok('destroy-self ifAlone: dies when alone', !state.players[0].board.some(c => c.id === 't_golem'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
