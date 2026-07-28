// shadowed_handlers_test.mjs — regressions for duplicate-handler shadows found
// by tests/tools/twin-audit.mjs. In both dispatchers, the FIRST matching
// handler wins; these four types each had a second copy carrying semantics the
// first copy lacked, silently breaking the cards below:
//
//   summon-remembered      Taka's `_takaId` branch shadowed the `rememberedId`
//                          branch -> Amorphous Slime / Ravenous Kraken /
//                          Carnivorous Cubicle deathrattles no-opped
//   summon-copy-of-played  Ixlid's branch shadowed Playmaker's `health` rider
//                          -> Playmaker copies arrived at full Health
//   summon-deck-copy       Barnes' branch shadowed Boom Reaver's `grant`
//                          -> Boom Reaver's copy lost Rush
//   buff-random-friendly   the single-target chain branch shadowed the
//                          `count` branch -> Menagerie Mug/Jug and Eager
//                          Underling buffed ONE minion instead of 2-3
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- summon-remembered honors rememberedId (Ravenous Kraken) ---
{
	const r = new Scenario(byId)
		.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 60, target: 'creature' }] })
		.mana(0, 10)
		.board(0, ['t_bear'])
		.hand(0, ['ravenous_kraken', 't_kill'])
		.play(0, 'ravenous_kraken', { targetBoard: [0, 0] })   // battlecry: destroy + remember the bear
		.expectDead(0, 0)
		.expect('kraken remembered its meal', st => {
			const k = st.players[0].board.find(c => c.id === 'ravenous_kraken');
			return k && k.rememberedId === 't_bear';
		})
		.do((st) => {                                            // kill the kraken -> DR should resummon the bear
			const k = st.players[0].board.find(c => c.id === 'ravenous_kraken');
			k.shield = false;
			const kill = st.players[0].hand.find(c => c.id === 't_kill');
			E.playCard(st, 0, kill.uid, { type: 'creature', uid: k.uid, player: 0 }, null, 0);
		})
		.expect('deathrattle resummoned the remembered bear', st => st.players[0].board.some(c => c.id === 't_bear'))
		.run();
	ok('summon-remembered: rememberedId cards work again (kraken)', r.failures.length === 0, r.failures);
}
// --- ...while Taka's _takaId path still works (pinned by ff10b too) ---
{
	const s = new Scenario(byId)
		.def('t_kill2', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 60, target: 'creature' }] })
		.mana(0, 10).hand(0, ['beast_speaker_taka', 't_kill2']).play(0, 'beast_speaker_taka');
	const r = s.run();
	const st = r.state;
	if (st.pickQueue.length) {
		const pickId = st.pickQueue[0].ids[0];
		E.resolvePick(st, pickId);
		const taka = st.players[0].board.find(c => c.id === 'beast_speaker_taka');
		taka.shield = false;
		const k = st.players[0].hand.find(c => c.id === 't_kill2');
		E.playCard(st, 0, k.uid, { type: 'creature', uid: taka.uid, player: 0 }, null, 0);
		ok('summon-remembered: taka path unbroken', st.players[0].board.some(c => c.id === pickId), st.players[0].board.map(c => c.id));
	} else ok('taka discover opened', false);
}
// --- summon-copy-of-played honors Playmaker's health rider ---
{
	const r = new Scenario(byId)
		.def('t_rushbig', { type: 'creature', cost: 4, attack: 4, health: 6, keywords: ['rush'] })
		.mana(0, 10)
		.board(0, ['playmaker'])
		.hand(0, ['t_rushbig'])
		.play(0, 't_rushbig')
		.expect('a copy was summoned', st => st.players[0].board.filter(c => c.id === 't_rushbig').length === 2)
		.expect('the copy arrived at 1 Health', st => {
			const copies = st.players[0].board.filter(c => c.id === 't_rushbig');
			return copies.some(c => E.hp(c) === 1) && copies.some(c => E.hp(c) === 6);
		})
		.run();
	ok('summon-copy-of-played: Playmaker copy at 1 Health', r.failures.length === 0, r.failures);
}
// --- summon-deck-copy honors Boom Reaver's grant ---
{
	const r = new Scenario(byId)
		.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
		.mana(0, 10)
		.deck(0, ['t_bear'])
		.hand(0, ['the_boom_reaver'])
		.play(0, 'the_boom_reaver')
		.expect('a deck copy was summoned', st => st.players[0].board.some(c => c.id === 't_bear'))
		.expect('the copy has Rush', st => {
			const c = st.players[0].board.find(x => x.id === 't_bear');
			return c && c.keywords.includes('rush');
		})
		.expect('the original stays in the deck', st => st.players[0].deck.includes('t_bear'))
		.run();
	ok('summon-deck-copy: Boom Reaver grants Rush', r.failures.length === 0, r.failures);
}
// --- buff-random-friendly honors count (Menagerie Mug) ---
{
	const r = new Scenario(byId)
		.def('t_van', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.mana(0, 10)
		.board(0, ['t_van', 't_van', 't_van'])
		.hand(0, ['menagerie_mug'])
		.play(0, 'menagerie_mug')
		.expect('all three friendlies buffed (+1/+1 each)', st => {
			const buffed = st.players[0].board.filter(c => c.id === 't_van' && c.attack === 2);
			return buffed.length === 3;
		})
		.run();
	ok('buff-random-friendly: count buffs N distinct minions (mug)', r.failures.length === 0, r.failures);
}
// --- ...and single-target callers (no count) still buff exactly one ---
{
	const r = new Scenario(byId)
		.def('t_van', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_single', { type: 'sorcery', cost: 0, effects: [{ type: 'buff-random-friendly', attack: 2, health: 2 }] })
		.mana(0, 10)
		.board(0, ['t_van', 't_van'])
		.hand(0, ['t_single'])
		.play(0, 't_single')
		.expect('exactly one minion got +2/+2', st =>
			st.players[0].board.filter(c => c.attack === 3).length === 1)
		.run();
	ok('buff-random-friendly: default remains single-target', r.failures.length === 0, r.failures);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
