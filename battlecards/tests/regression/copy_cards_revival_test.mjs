// copy_cards_revival_test.mjs — Flipper Friends' real tokens + the 11 cards
// whose copy mechanics were imported as literal vanilla tokens ("summon a
// 1/1 token named 'copy of it'"). Each now uses real copy machinery.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- Flipper Friends: real Orca / Otter tokens (HS TSC_650t / TSC_650t4) ---
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['flipper_friends'])
		.play(0, 'flipper_friends', { choice: 0 })
		.run();
	const orca = state.players[0].board[0];
	ok('Flipper Friends c0: a real 6/6 Orca with Taunt', orca?.id === 'tsc_orca' && orca.attack === 6 && E.hp(orca) === 6 && orca.keywords.includes('taunt'));
}
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['flipper_friends'])
		.play(0, 'flipper_friends', { choice: 1 })
		.run();
	const otters = state.players[0].board.filter(c => c.id === 'tsc_otter');
	ok('Flipper Friends c1: six real 1/1 Otters with Rush', otters.length === 6 && otters.every(c => c.attack === 1 && c.keywords.includes('rush')));
}
// --- mirage_caller: targeted 1/1 copy ---
{
	const { state } = new Scenario(byId)
		.def('t_big', { type: 'creature', cost: 5, attack: 5, health: 5, tribe: 'Beast' })
		.mana(0, 10).board(0, ['t_big']).hand(0, ['mirage_caller'])
		.play(0, 'mirage_caller', { targetBoard: [0, 0] })
		.run();
	const copy = state.players[0].board.find(c => c.id === 't_big' && c.attack === 1);
	ok('Mirage Caller: a 1/1 copy of the target (same card id)', !!copy && E.hp(copy) === 1);
}
// --- power_word_replicate: 5/5 copy of chosen friendly ---
{
	const { state } = new Scenario(byId)
		.def('t_wisp', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10).board(0, ['t_wisp']).hand(0, ['power_word_replicate'])
		.play(0, 'power_word_replicate', { targetBoard: [0, 0] })
		.run();
	ok('PW: Replicate: a 5/5 copy', state.players[0].board.some(c => c.id === 't_wisp' && c.attack === 5 && E.hp(c) === 5));
}
// --- gift_of_luminance: DS on target + 1/1 copy of it ---
{
	const { state } = new Scenario(byId)
		.def('t_pal', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.mana(0, 10).board(0, ['t_pal']).hand(0, ['gift_of_luminance'])
		.play(0, 'gift_of_luminance', { targetBoard: [0, 0] })
		.run();
	const orig = state.players[0].board.find(c => c.attack === 3);
	const copy = state.players[0].board.find(c => c.id === 't_pal' && c.attack === 1);
	ok('Gift of Luminance: target shielded + a 1/1 copy', orig?.shield === true && !!copy);
}
// --- herald_volazj: 1/1 copies of each other friendly ---
{
	const { state } = new Scenario(byId)
		.def('t_a', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.def('t_b', { type: 'creature', cost: 4, attack: 4, health: 4 })
		.mana(0, 10).board(0, ['t_a', 't_b']).hand(0, ['herald_volazj'])
		.play(0, 'herald_volazj')
		.run();
	const minis = state.players[0].board.filter(c => c.attack === 1 && E.hp(c) === 1);
	ok('Herald Volazj: 1/1 copies of both others', minis.length === 2
		&& minis.some(c => c.id === 't_a') && minis.some(c => c.id === 't_b'));
}
// --- kobold_illusionist: DR summons a 1/1 copy from hand ---
{
	const { state } = new Scenario(byId)
		.def('t_held', { type: 'creature', cost: 6, attack: 6, health: 6 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 10).board(0, ['kobold_illusionist']).hand(0, ['t_held', 't_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	ok('Kobold Illusionist: 1/1 copy of the held creature', state.players[0].board.some(c => c.id === 't_held' && c.attack === 1)
		&& state.players[0].hand.some(c => c.id === 't_held' && c.attack === 6));
}
// --- posse_possession: 4/4 copy from the ENEMY hand ---
{
	const { state } = new Scenario(byId)
		.def('t_theirs', { type: 'creature', cost: 8, attack: 8, health: 8 })
		.mana(0, 10).hand(0, ['posse_possession']).hand(1, ['t_theirs'])
		.play(0, 'posse_possession')
		.run();
	ok('Posse Possession: 4/4 copy of an enemy hand creature, on YOUR board',
		state.players[0].board.some(c => c.id === 't_theirs' && c.attack === 4)
		&& state.players[1].hand.some(c => c.id === 't_theirs'));
}
// --- masked_reveler: DR summons a 2/2 deck copy ---
{
	const { state } = new Scenario(byId)
		.def('t_deckling', { type: 'creature', cost: 7, attack: 7, health: 7 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 9, target: 'creature' }] })
		.mana(0, 10).deck(0, ['t_deckling']).board(0, ['masked_reveler']).hand(0, ['t_kill'])
		.play(0, 't_kill', { targetBoard: [0, 0] })
		.run();
	ok('Masked Reveler: a 2/2 copy from the deck (original stays)', state.players[0].board.some(c => c.id === 't_deckling' && c.attack === 2)
		&& state.players[0].deck.includes('t_deckling'));
}
// --- zerek_s_cloning_gallery: 1/1 copy of EACH deck creature ---
{
	const { state } = new Scenario(byId)
		.def('t_c1', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_c2', { type: 'creature', cost: 3, attack: 3, health: 3 })
		.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.mana(0, 10).deck(0, ['t_c1', 't_c2', 't_sp']).hand(0, ['zerek_s_cloning_gallery'])
		.play(0, 'zerek_s_cloning_gallery')
		.run();
	const b = state.players[0].board;
	ok('Zerek\'s: a 1/1 of each distinct deck creature (spell skipped)', b.length === 2
		&& b.every(c => c.attack === 1) && b.some(c => c.id === 'token_t_c1') && b.some(c => c.id === 'token_t_c2'));
}
// --- searing_reflection: draw a creature + 8/8 shielded copy ---
{
	const { state } = new Scenario(byId)
		.def('t_only', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.mana(0, 10).deck(0, ['t_only']).hand(0, ['searing_reflection'])
		.play(0, 'searing_reflection')
		.run();
	const copy = state.players[0].board.find(c => c.id === 't_only');
	ok('Searing Reflection: drew it AND summoned an 8/8 Divine Shield copy',
		state.players[0].hand.some(c => c.id === 't_only') && copy?.attack === 8 && copy?.shield === true);
}
// --- ritual_of_life / cactus_construct: discover then stat-copy the pick ---
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['ritual_of_life'])
		.play(0, 'ritual_of_life')
		.run();
	ok('Ritual of Life: discover pending', state.pickQueue.length === 1);
	const picked = state.pickQueue[0].ids[0];
	E.resolvePick(state, picked);
	const copy = state.players[0].board.find(c => c.id === picked);
	ok('Ritual of Life: pick in hand + a 2/3 copy on board', state.players[0].hand.some(c => c.id === picked)
		&& copy?.attack === 2 && E.hp(copy) === 3);
}
{
	const { state } = new Scenario(byId)
		.mana(0, 10).hand(0, ['cactus_construct'])
		.play(0, 'cactus_construct')
		.run();
	const picked = state.pickQueue[0].ids[0];
	E.resolvePick(state, picked);
	const copy = state.players[0].board.find(c => c.id === picked);
	ok('Cactus Construct: pick in hand + a 1/2 copy on board', copy?.attack === 1 && E.hp(copy) === 2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
