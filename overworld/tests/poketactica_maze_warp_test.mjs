// poketactica_maze_warp_test.mjs — MAZE BUILDER, A TELEPORTER PAIR (Plans/POKETACTICA_MODES_PLAN.md item B4; Tower Defense
// rules 23). Two Warp Pads, laid ON the way as Mud and Caltrops are. An enemy that steps on one is sent BACK to an earlier
// Warp Pad on its own way: once an enemy, WARP.max tiles at most (a boss half that). One pad alone does nothing.
// Pure: node only.   node overworld/tests/poketactica_maze_warp_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as MZ from '../../poketactica/js/td/maze.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
// a straight way along row 3 (gate at x 0, base at x 11)
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '............', '............', '............'],
	ground: Array(8).fill('gggggggggggg'), gates: [[0, 3]], base: [11, 3] });
const squad = [makeFigurine('mew', 40, makeRng('wp'), data, { id: 'wp-mew', shinyRate: 0 })];
const ap = (S, a) => TD.applyInput(S, a, data);
const run = (o = {}) => { const S = TD.newRun(o.seed || 'warp', { map: FIELD, squad, ...(o.rev ? { rev: o.rev } : {}) }, data); S.gold = 999; return S; };
const lay = (S, x) => { const c = C.addCard(S, 'one', 'warp'); return ap(S, { t: 'block', card: c.id, turns: 0, x, y: 3 }); };
const W = 12;
// the first wave with nobody placed: when the first enemy reaches the base, and the jumps on the way
const through = (pads, o) => {
	const S = run(o);
	for (const x of pads) lay(S, x);
	ap(S, { t: 'call' });
	let leakAt = 0; const warps = [];
	for (let i = 0; i < 20 * 600 && !leakAt && !S.over && S.cleared < 1; i++) {
		TD.step(S, [], data);
		for (const e of S.ev) { if (e.t === 'leak' && !leakAt) leakAt = S.tick; if (e.t === 'warp') warps.push(e); }
	}
	return { leakAt, warps, S };
};

// ---------- the card
{
	A(TD.TD_RULES_REV >= 23 && C.WARP_REV === 23 && C.BONUS.warp.name === 'Warp Pad' && C.BONUS.warp.floor === 'warp' && C.BONUS.warp.pair && TD.isFloor('warp'), 'rules 23: the Warp Pad, a card laid on the way');
	A(C.bonusesAt(23).includes('warp') && !C.bonusesAt(22).includes('warp') && C.bonusesAt(22).length === 11 && C.bonusesAt(23).length === 12, 'offered under rules 23, never under 22');
	// a reward gives the PAIR: two cards of one tile each, and is shown as a single tile
	const offers = []; for (let n = 1; n <= 400; n++) for (const o of C.rewardsOf('wp', n, n % 10 === 0, false, C.bonusesAt(23)).opts) if (o.k === 'bonus' && o.bonus === 'warp') offers.push(o);
	A(offers.length > 5 && offers.every((o) => o.shape === 'one'), `the rewards offer it (${offers.length} times in 400 waves), always as single tiles`);
	const S = run(); S.pick = { opts: [{ k: 'bonus', shape: 'one', bonus: 'warp' }], wave: 1 };
	const n0 = S.hand.length;
	A(ap(S, { t: 'pick', i: 0 }) === null && S.hand.length === n0 + 2 && S.hand.slice(-2).every((c) => c.bonus === 'warp' && c.shape === 'one'), 'taking the reward puts TWO Warp Pads in the hand', S.hand.slice(-2));
}
// ---------- laid on the way: the way does not change
{
	const S = run(), way0 = MZ.wayLength(S.paths[0]);
	A(lay(S, 3) === null && lay(S, 8) === null && MZ.wayLength(S.paths[0]) === way0 && S.pads[3 * W + 3] === 'warp' && S.pads[3 * W + 8] === 'warp', 'two pads on the way: the way is as long as it was');
	A(lay(S, 3) === 'something is laid there already' && lay(S, 0) === 'not on a gate or the base', 'not on another pad, a gate or the base');
}
// ---------- what it does
{
	const plain = through([]), one = through([6]), pair = through([3, 8]);
	A(plain.leakAt > 0 && plain.warps.length === 0 && one.warps.length === 0 && one.leakAt === plain.leakAt, 'one pad alone does nothing: it takes the pair', [plain.leakAt, one.leakAt]);
	A(pair.warps.length > 0 && pair.warps.every((w) => w.from === 8 && w.to === 3) && pair.leakAt > plain.leakAt * 1.25, `a pair at tiles 3 and 8: an enemy on the far one is sent back to the near one, and reaches the base at tick ${pair.leakAt}, not ${plain.leakAt}`, [pair.warps.slice(0, 3), pair.leakAt, plain.leakAt]);
	A(new Set(pair.warps.map((w) => w.uid)).size === pair.warps.length, 'once an enemy: nobody is sent back twice');
	// further apart than WARP.max: nothing
	A(C.WARP.max === 8 && through([1, 10]).warps.length === 0 && through([2, 10]).warps.length > 0, 'pads further apart than 8 tiles of the way do not reach each other (9 apart: nothing; 8 apart: a jump)');
	// three pads: the earliest within reach
	const three = through([2, 6, 9]);
	A(three.warps.length > 0 && three.warps.every((w) => (w.from === 6 && w.to === 2)), 'three pads: the middle one sends back to the first, and that enemy then walks over the third', three.warps.slice(0, 4));
	// a boss goes half as far
	A(Math.floor(C.WARP.max * C.WARP.bossPart) === 4, 'a boss would be sent back 4 tiles at most (the number only: no boss is walked over a pad here)');
	// the same seed is the same run, pads and all
	A(TD.hashOf(through([3, 8]).S) === TD.hashOf(pair.S), 'the same seed and the same pads are the same run');
}
// ---------- taken back: the marks go
{
	const S = run(); lay(S, 4);
	const b = S.blocks[0];
	A(ap(S, { t: 'unblock', id: b.id }) === null && !S.pads && S.hand[S.hand.length - 1].bonus === 'warp', 'taken back this round: the pad is gone and the card is in the hand');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
