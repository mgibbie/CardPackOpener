// targeting_test.mjs — unit tests for engine/targeting.js (PR 9).
//
// The extraction is verbatim (seeded-digest-verified at move time); these pin
// each targeting RULE individually: spec derivation from effects, filter
// riders, the required-target rules, and legalTargets'/attackTargets' board
// visibility rules (stealth, elusive, dormant, taunt, piercing, rush).
import fs from 'fs';
import * as E from '../../engine.js';
import { targetSpec, legalTargets, equipTargets, attackTargets } from '../../engine/targeting.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- facade parity ---
{
	ok('all four re-exported identically', E.targetSpec === targetSpec && E.legalTargets === legalTargets
		&& E.equipTargets === equipTargets && E.attackTargets === attackTargets);
}
// --- targetSpec derivation ---
{
	const { state } = new Scenario(byId)
		.def('t_bolt', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 3, target: 'any' }] })
		.def('t_pat', { type: 'sorcery', cost: 1, effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }] })
		.def('t_notarget', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 2 }] })
		.def('t_battlecry', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['battlecry'], effects: [{ type: 'damage', value: 1, target: 'creature' }] })
		.def('t_pick', { type: 'sorcery', cost: 1, choices: [{ effects: [{ type: 'damage', value: 2, target: 'creature' }] }, { effects: [{ type: 'armor', value: 2 }] }] })
		.def('t_capped', { type: 'sorcery', cost: 1, effects: [{ type: 'destroy', target: 'enemy-creature', maxAttack: 3 }] })
		.hand(0, ['t_bolt', 't_pat', 't_notarget', 't_battlecry', 't_pick', 't_capped'])
		.run();
	const hand = id => state.players[0].hand.find(c => c.id === id);

	const sBolt = targetSpec(state, 0, hand('t_bolt'));
	ok('spell damage any: required target', sBolt?.targets === 'any' && sBolt.required === true);
	const sPat = targetSpec(state, 0, hand('t_pat'));
	ok('buff friendly-creature spec derived', sPat?.targets === 'friendly-creature');
	ok('untargeted spell: null spec', targetSpec(state, 0, hand('t_notarget')) === null);
	const sBc = targetSpec(state, 0, hand('t_battlecry'));
	ok('creature battlecry: target optional (fizzles without)', sBc?.targets === 'creature' && sBc.required === false);
	ok('choose-one with no branch picked: null (menu first)', targetSpec(state, 0, hand('t_pick')) === null);
	const sPick = targetSpec(state, 0, hand('t_pick'), 0);
	ok('choose-one branch 0: damage target derived', sPick?.targets === 'creature' && sPick.required === true);
	ok('choose-one branch 1: untargeted', targetSpec(state, 0, hand('t_pick'), 1) === null);
	const sCap = targetSpec(state, 0, hand('t_capped'));
	ok('maxAttack rider becomes a filter', !!sCap?.filter && sCap.filter({ attack: 3 }) && !sCap.filter({ attack: 4 }));
}
// --- legalTargets visibility rules ---
{
	const { state } = new Scenario(byId)
		.def('t_plain', { type: 'creature', cost: 1, attack: 2, health: 2 })
		.def('t_sneak', { type: 'creature', cost: 1, attack: 2, health: 2 })
		.def('t_slick', { type: 'creature', cost: 1, attack: 2, health: 2, keywords: ['elusive'] })
		.board(0, ['t_plain'])
		.board(1, ['t_plain', 't_sneak', 't_slick'])
		.run();
	const eBoard = state.players[1].board;
	eBoard[1].stealthed = true;
	eBoard.push({ id: 't_dormant', uid: 88801, zone: 'board', type: 'creature', attack: 2, maxHealth: 2, damage: 0, keywords: [], dormantLeft: 2, controller: 1 });

	const anySpec = { targets: 'any' };
	const t = legalTargets(state, 0, anySpec);
	ok('any: own creature + own hero + enemy hero + plain enemy', t.length === 4, JSON.stringify(t));
	ok('stealthed enemy untargetable', !t.some(x => x.uid === eBoard[1].uid));
	ok('elusive enemy untargetable', !t.some(x => x.uid === eBoard[2].uid));
	ok('dormant enemy untargetable', !t.some(x => x.uid === 88801));
	const own = legalTargets(state, 1, { targets: 'friendly-creature' });
	ok('own stealth/elusive still targetable by owner', own.some(x => x.uid === eBoard[1].uid) && own.some(x => x.uid === eBoard[2].uid));
	// Spellward Jeweler: hero untargetable this window
	state.players[1].heroElusiveUntil = state.turnNumber;
	const t2 = legalTargets(state, 0, { targets: 'enemy-hero' });
	ok('heroElusiveUntil blocks enemy-hero targeting', t2.length === 0);
}
// --- attackTargets combat rules ---
{
	const { state } = new Scenario(byId)
		.def('t_hitter', { type: 'creature', cost: 1, attack: 3, health: 3 })
		.def('t_wall', { type: 'creature', cost: 2, attack: 1, health: 5, keywords: ['taunt'] })
		.def('t_bystander', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, ['t_hitter'])
		.board(1, ['t_wall', 't_bystander'])
		.run();
	const hitter = state.players[0].board[0];
	const t = attackTargets(state, 0, hitter);
	ok('taunt wall: only the taunt is attackable, no hero', t.length === 1 && t[0].uid === state.players[1].board[0].uid, JSON.stringify(t));
	hitter.keywords.push('piercing');
	const t2 = attackTargets(state, 0, hitter);
	ok('piercing ignores the wall: both creatures + hero', t2.length === 3);
	hitter.keywords = hitter.keywords.filter(k => k !== 'piercing');
	state.players[1].board[0].stealthed = true;
	const t3 = attackTargets(state, 0, hitter);
	ok('stealthed taunt does not wall (and is unattackable)', t3.some(x => x.type === 'hero') && !t3.some(x => x.uid === state.players[1].board[0].uid));
	// rush: summoning-sick attacker can hit creatures but never the hero
	state.players[1].board[0].stealthed = false;
	hitter.sick = true;
	hitter.keywords.push('rush');
	const t4 = attackTargets(state, 0, hitter);
	ok('rush while sick: creatures only, no hero', t4.length > 0 && !t4.some(x => x.type === 'hero'));
}
// --- equipTargets ---
{
	const { state } = new Scenario(byId)
		.def('t_min', { type: 'creature', cost: 1, attack: 2, health: 2 })
		.board(0, ['t_min', 't_min'])
		.run();
	const p = state.players[0];
	p.artifacts.push({ id: 't_sword', uid: 88802, zone: 'artifact', equip: { cost: 1, attack: 2 }, controller: 0 });
	const t = equipTargets(state, 0, 88802);
	ok('equip: both friendly creatures listed', t.length === 2 && t.every(x => x.player === 0));
	ok('equip: unknown uid → empty', equipTargets(state, 0, 40404).length === 0);
	p.board[0].dormantLeft = 1;
	ok('equip: dormant creature excluded', equipTargets(state, 0, 88802).length === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
