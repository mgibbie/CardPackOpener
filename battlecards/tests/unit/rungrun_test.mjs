// rungrun_test.mjs — the run rules Middle-earth, the Sword Coast and Final Fantasy share (rungrun.js).
// They were three copies that differed only in the card tag and the stats key; this pins the rules once,
// on a synthetic run, and then checks each real run hands rungRun its own tag / stats key / rung names.
import fs from 'fs';
import { rungRun, WINS_TO_CLEAR, LOSSES_TO_END } from '../../rungrun.js';
import * as ME from '../../middleearth.js';
import * as SC from '../../swordcoast.js';
import * as FF from '../../finalfantasy.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- the rules, on a tiny synthetic run tagged `zz` ----
const R = rungRun({
	mode: 'zzrun', tag: 'zz',
	HEROES: ['H1', 'H2', 'H3', 'H4'], SECRET_HEROES: ['S1'],
	ENEMY_RUNGS: { A: ['A1', 'A2', 'Astar'], B: ['B1', 'B2'], C: ['C1'], D: ['D1'] },
	FIRST_ONLY: new Set(['Astar']),
	CLASS_OF: { H1: 'mage', A1: 'rogue' }, COLOR_IDENTITY: { H1: ['U'] },
	HERO_POWERS: { H1: { name: 'Zap', cost: 2 } },
	RUNG_LABELS: { A: 'a-label', B: 'b-label', C: 'c-label', D: 'd-label' },
	STARTERS: ['H1', 'H2'], CORE_UNLOCK_ORDER: ['H3', 'H4'],
	ENEMY_UNLOCKS: { A1: ['H1', 2], D1: ['H2', 4] },
});
const cards = {
	h_b: { id: 'h_b', zzDeck: 'H1', zzSide: 'hero' }, h_a: { id: 'h_a', zzDeck: 'H1', zzSide: 'hero' },
	h_tok: { id: 'h_tok', zzDeck: 'H1', token: true },
	e_2: { id: 'e_2', zzDeck: 'A1', zzSide: 'enemy' }, e_1: { id: 'e_1', zzDeck: 'A1', zzSide: 'enemy' }, e_3: { id: 'e_3', zzDeck: 'A1', zzSide: 'enemy' },
	e_tok: { id: 'e_tok', zzDeck: 'A1', zzSide: 'enemy', token: true },
	other: { id: 'other', meDeck: 'H1', meSide: 'hero' }, // another run's tag: never ours
	t_duels: { id: 't_duels', treasure: true, set: 'DUELS' }, t_other: { id: 't_other', treasure: true, set: 'TOMBS' },
	t_flag: { id: 't_flag', duelsTreasure: true }, t_zz: { id: 't_zz', zzTreasure: true }, t_me: { id: 't_me', meTreasure: true },
};
ok('run length', WINS_TO_CLEAR === 12 && LOSSES_TO_END === 3);
ok('classOf / default', R.classOf('H1') === 'mage' && R.classOf('H2') === 'neutral');
ok('colorsOf / default', same(R.colorsOf('H1'), ['U']) && same(R.colorsOf('H2'), []));
ok('powerOf / default', R.powerOf('H1').name === 'Zap' && R.powerOf('H2') === null);
ok('isHero includes secret heroes, not enemies', R.isHero('H1') && R.isHero('S1') && !R.isHero('A1'));
ok('isEnemy spans every rung', ['A1', 'Astar', 'B2', 'C1', 'D1'].every(R.isEnemy) && !R.isEnemy('H1'));
ok('seatOf', same(R.seatOf('H1'), { id: 'mage', name: 'H1', power: { name: 'Zap', cost: 2 } }));
ok('hero deck: one of each, sorted, no tokens, own tag only', same(R.deckOf(cards, 'H1'), ['h_a', 'h_b']), R.deckOf(cards, 'H1'));
ok('enemy deck: two of each, sorted, no tokens', same(R.deckOf(cards, 'A1'), ['e_1', 'e_1', 'e_2', 'e_2', 'e_3', 'e_3']), R.deckOf(cards, 'A1'));
ok('generateEnemy is static', same(R.generateEnemy(cards, 'A1'), { id: 'A1', name: 'A1', cls: 'rogue', deck: R.deckOf(cards, 'A1'), rung: null }));
// rung windows: A 0-2 (first-only at win 0 only), B 3-6, C 7-10, D 11+
ok('win 0 offers the first-only enemy', same(R.enemyRosterFor(0), ['A1', 'A2', 'Astar']));
ok('wins 1-2 do not', same(R.enemyRosterFor(1), ['A1', 'A2']) && same(R.enemyRosterFor(2), ['A1', 'A2']));
ok('B is wins 3-6', same(R.enemyRosterFor(3), ['B1', 'B2']) && same(R.enemyRosterFor(6), ['B1', 'B2']));
ok('C is wins 7-10', same(R.enemyRosterFor(7), ['C1']) && same(R.enemyRosterFor(10), ['C1']));
ok('D is win 11 on', same(R.enemyRosterFor(11), ['D1']) && same(R.enemyRosterFor(99), ['D1']));
ok('a negative / junk win count is win 0', same(R.enemyRosterFor(-3), R.enemyRosterFor(0)) && same(R.enemyRosterFor(undefined), R.enemyRosterFor(0)));
ok('the roster is a copy', (R.enemyRosterFor(3).push('x'), same(R.enemyRosterFor(3), ['B1', 'B2'])));
ok('rungFor', [0, 2, 3, 6, 7, 10, 11].map(R.rungFor).join('') === 'AABBCCD');
ok("rungLabel uses the run's own names", R.rungLabel(0) === 'a-label' && R.rungLabel(5) === 'b-label' && R.rungLabel(8) === 'c-label' && R.rungLabel(11) === 'd-label');
// randomEnemy: skip the last foe and anyone already faced, while someone new is left
ok('never the avoided enemy while another is left', [0, 0.3, 0.6, 0.99].every(x => R.randomEnemy(3, () => x, 'B1') === 'B2'));
ok('never a faced enemy while a new one is left', [0, 0.5, 0.99].every(x => R.randomEnemy(1, () => x, null, ['A1']) === 'A2'));
ok('everyone faced: falls back to anyone but the last', [0, 0.99].every(x => R.randomEnemy(3, () => x, 'B1', ['B1', 'B2']) === 'B2'));
ok('a one-enemy rung repeats rather than return nothing', R.randomEnemy(7, () => 0.5, 'C1', ['C1']) === 'C1');
ok('one rng() call per pick', (() => { let n = 0; R.randomEnemy(0, () => (n++, 0.1)); return n === 1; })());
ok('rewardForWin alternates from a treasure', [1, 2, 3, 4].map(R.rewardForWin).join() === 'treasure,bucket,treasure,bucket');
{
	const got = R.spoilsChoices(cards, 'A1', () => 0);
	ok('spoils: three distinct enemy cards, no tokens', same(got.slice().sort(), ['e_1', 'e_2', 'e_3']), got);
	ok('spoils: count caps at the pool', R.spoilsChoices(cards, 'A1', () => 0, 9).length === 3 && R.spoilsChoices(cards, 'A1', () => 0, 2).length === 2);
	ok("spoils: a hero's cards are not spoils", R.spoilsChoices(cards, 'H1', () => 0).length === 0);
}
ok("treasure pool: Duels treasures + this run's own, not another run's", same(R.treasurePool(cards).map(c => c.id).sort(), ['t_duels', 't_flag', 't_zz']), R.treasurePool(cards).map(c => c.id));
// progression
ok('no account: the full roster', same(R.unlockedCharacters(null), ['H1', 'H2', 'H3', 'H4', 'A1', 'A2', 'Astar', 'B1', 'B2', 'C1', 'D1']));
ok('a new account: the starters', same(R.unlockedCharacters({}), ['H1', 'H2']));
ok('one core hero per completed run', same(R.unlockedCharacters({ modes: { zzrun: { runs: 1 } } }), ['H1', 'H2', 'H3']));
ok("another run's count does not unlock", same(R.unlockedCharacters({ modes: { middleearth: { runs: 5 } } }), ['H1', 'H2']));
ok('enemies wait for every core hero', same(R.unlockedCharacters({ modes: { zzrun: { runs: 1 } }, chars: { 'zzrun|H1': { best: 9 } } }), ['H1', 'H2', 'H3']));
ok("then unlock by the linked hero's best streak", same(R.unlockedCharacters({ modes: { zzrun: { runs: 2 } }, chars: { 'zzrun|H1': { best: 2 }, 'zzrun|H2': { best: 3 } } }), ['H1', 'H2', 'H3', 'H4', 'A1']));
ok('a streak in another run does not count', same(R.unlockedCharacters({ modes: { zzrun: { runs: 2 } }, chars: { 'middleearth|H1': { best: 9 } } }), ['H1', 'H2', 'H3', 'H4']));

// ---- each real run: its own tag, stats key and rung names; the same export surface ----
const byId = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards.map(c => [c.id, c]));
const RULES = ['classOf', 'isEnemy', 'isHero', 'colorsOf', 'powerOf', 'seatOf', 'deckOf', 'enemyRosterFor', 'rungFor', 'rungLabel', 'randomEnemy', 'generateEnemy', 'rewardForWin', 'spoilsChoices', 'treasurePool', 'unlockedCharacters'];
for (const [name, M, tag, labels] of [
	['middleearth', ME, 'me', ['Mook', 'Lieutenant', 'Commander', 'The Dark Lord']],
	['swordcoast', SC, 'sc', ['Henchman', 'Lieutenant', 'Commander', 'Archfiend']],
	['finalfantasy', FF, 'ff', ['Henchman', 'Lieutenant', 'Archvillain', 'Final Boss']],
]) {
	ok(name + ' exports every rule', RULES.every(k => typeof M[k] === 'function'), RULES.filter(k => typeof M[k] !== 'function'));
	ok(name + ' exports the run length', M.WINS_TO_CLEAR === 12 && M.LOSSES_TO_END === 3);
	ok(name + ' rung names', same([0, 3, 7, 11].map(M.rungLabel), labels), [0, 3, 7, 11].map(M.rungLabel));
	const hero = M.HEROES[0], foe = M.ENEMY_RUNGS.A[0];
	const hd = M.deckOf(byId, hero), ed = M.deckOf(byId, foe);
	ok(name + ' hero deck is its 10 tagged cards', hd.length === 10 && hd.every(id => byId[id][tag + 'Deck'] === hero), hd.length);
	ok(name + ' enemy deck is 15 x 2 of its tagged cards', ed.length === 30 && new Set(ed).size === 15 && ed.every(id => byId[id][tag + 'Deck'] === foe), ed.length);
	ok(name + ' spoils come from the fallen foe', M.spoilsChoices(byId, foe, () => 0.5).every(id => byId[id][tag + 'Deck'] === foe && byId[id][tag + 'Side'] === 'enemy'));
	ok(name + ' unlocks read its own stats key', M.unlockedCharacters({ modes: { [name]: { runs: 1 } } }).length === M.STARTERS.length + 1 && M.unlockedCharacters({ modes: { other: { runs: 1 } } }).length === M.STARTERS.length);
	const full = { modes: { [name]: { runs: 99 } }, chars: Object.fromEntries(M.HEROES.map(h => [name + '|' + h, { best: 99 }])) };
	ok(name + ' every enemy with an unlock row becomes playable', Object.keys(M.ENEMY_UNLOCKS).every(e => M.unlockedCharacters(full).includes(e)));
}

console.log(`rungrun: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
