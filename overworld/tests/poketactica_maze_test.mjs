// poketactica_maze_test.mjs — Tower Defense, MAZE BUILDER, stage 1 (owner, 2026-11-24; Plans/POKETACTICA_MAZE_BUILDER_PLAN.md):
// the maze itself. No road: enemies walk the shortest way from each gate to the base, around the blocks the player lays.
// Checked here: the shapes and their turns; the way is never closed; the same blocks always give the same way; enemies in
// the simulation walk the worked-out way; blocks lock when a wave is called; figurines stand only on blocks; a run is
// exact (same inputs, same run; a snapshot resumes). And the ROAD mode is untouched: its fingerprints are pinned.
//   node overworld/tests/poketactica_maze_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as TD from '../../poketactica/js/td/sim.js';
import * as MZ from '../../poketactica/js/td/maze.js';
import { TD_MAPS, MAZE_MAPS as ALL_MAZE_MAPS, tdMapById, isMazeMap } from '../../poketactica/js/td/maps.js';
const MAZE_MAPS = ALL_MAZE_MAPS.slice(0, 3);   // (the first three: the maps this file was written on; the later ones are poketactica_maze_maps_test.mjs's)
import { buildMap } from '../../poketactica/js/campaign.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { chooseOrders, squadAt } from '../../tools/poketactica/td_auto.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const J = JSON.stringify;

// a Maze Builder map: a flat field, one gate on the left, the base on the right, a rock and a pond
const FIELD = Object.freeze({ id: 'mz-test', name: 'Test Field', theme: 'meadow',
	rows: ['............', '............', '............', '............', '............', '.....1......', '............', '............'],
	ground: ['gggggggggggg', 'ggggggggwggg', 'gggggggggggg', 'gggggggggggg', 'gggggggggggg', 'gggggsgggggg', 'gggggggggggg', 'gggggggggggg'],
	gates: [[0, 3]], base: [11, 3] });
const TWO = Object.freeze({ ...FIELD, id: 'mz-two', gates: [[0, 0], [0, 7]] });
const squad = () => [0, 1, 2].map((i) => makeFigurine(['pikachu', 'squirtle', 'charmander'][i], 30, makeRng('mz' + i), data, { id: 'mz' + i, shinyRate: 0 }));
// (stage 2 put block cards behind every block: a test that only wants a block is handed its card first)
let xn = 0;
const ap = (S, a, d) => {
	if (a.t !== 'block' || !a.shape || !S.hand) return TD.applyInput(S, a, d);
	const id = 'x' + (++xn); S.hand.push({ id, shape: a.shape });
	const why = TD.applyInput(S, { ...a, card: id }, d);
	if (why) S.hand = S.hand.filter((c) => c.id !== id);
	return why;
};
const stepsOk = (p) => p.every(([x, y], i) => !i || Math.abs(x - p[i - 1][0]) + Math.abs(y - p[i - 1][1]) === 1);

// ---------- the shapes
{
	A(Object.keys(MZ.SHAPES).length === 11 && MZ.SMALL.length === 4 && MZ.TETROMINOES.length === 7 && MZ.TETROMINOES.every((s) => MZ.SHAPES[s].length === 4), 'eleven shapes: four small ones and the seven tetrominoes (four tiles each)');
	A(Object.keys(MZ.SHAPES).every((s) => J(MZ.turned(s, 4)) === J(MZ.turned(s, 0)) && J(MZ.turned(s, -1)) === J(MZ.turned(s, 3))), 'four quarter turns bring a shape back; a turn the other way is three');
	A(J(MZ.turned('I', 1)) === J([[0, 0], [0, 1], [0, 2], [0, 3]]) && J(MZ.turned('O', 1)) === J(MZ.turned('O', 0)), 'a turned I stands up; an O is the same every way');
	A(J(MZ.turned('L', 1)) === J([[0, 0], [1, 0], [2, 0], [0, 1]]) && J(MZ.cellsAt('two', 1, 4, 2)) === J([[4, 2], [4, 3]]), 'a turn is clockwise, and a shape is laid from the top-left of its box', MZ.turned('L', 1));
	const all = new Set(); for (const s of Object.keys(MZ.SHAPES)) for (let t = 0; t < 4; t++) { const c = MZ.turned(s, t); all.add(J(c)); if (Math.min(...c.map((x) => x[0])) || Math.min(...c.map((x) => x[1]))) all.add('bad'); }
	A(!all.has('bad') && all.size === 1 + 2 + 2 + 4 + 2 + 1 + 4 + 4 + 4 + 2 + 2, 'every turn starts its box at 0, 0; 28 different layouts in all', all.size);
}
// ---------- the flood and the way
{
	const open = (rows) => ({ w: rows[0].length, h: rows.length, open: rows.join('').split('').map((c) => (c === '.' ? 1 : 0)) });
	const g = open(['.....', '.....', '.....']);
	const d = MZ.flood(g, [4, 1]);
	A(d[1 * 5 + 4] === 0 && d[1 * 5 + 0] === 4 && d[0] === 5, 'the flood counts steps from the base');
	A(J(MZ.wayFrom(g, d, [0, 2])) === J([[0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]]), 'ties are broken up, right, down, left: the same every time', MZ.wayFrom(g, d, [0, 2]));
	const wall = open(['..#..', '..#..', '..#..']);
	A(MZ.ways(wall, [[0, 1]], [4, 1]) === null && MZ.flood(wall, [4, 1])[0] === -1, 'a gate walled off has no way');
	const bend = open(['..#..', '..#..', '.....']);
	const p = MZ.ways(bend, [[0, 0]], [4, 0])[0];
	A(MZ.wayLength(p) === 8 && stepsOk(p) && p.every(([x, y]) => bend.open[y * 5 + x]), 'the way goes round a wall, a tile at a time', p);
	A(MZ.blockProblem(bend, [[2, 2]], [[0, 0]], [4, 0]) === 'that would close the way', 'a block that would close the way is refused');
	A(MZ.blockProblem(bend, [[0, 0]], [[0, 0]], [4, 0]) === 'that is a gate' && MZ.blockProblem(bend, [[4, 0]], [[0, 0]], [4, 0]) === 'that is the base' && MZ.blockProblem(bend, [[2, 0]], [[0, 0]], [4, 0]) === 'something is in the way' && MZ.blockProblem(bend, [[5, 0]], [[0, 0]], [4, 0]) === 'off the board', 'not on a gate, the base, a wall, or off the board');
	A(MZ.blockProblem(bend, [[1, 0]], [[0, 0]], [4, 0]) === null && MZ.blockProblem(bend, [[1, 0]], [[0, 0]], [4, 0], () => 'a figurine') === 'a figurine', 'a free tile takes a block, unless the map says something stands there');
}
// ---------- many seeded mazes: never closed, always the same
{
	const names = Object.keys(MZ.SHAPES);
	let laid = 0, refused = 0, bad = null, longest = 0;
	for (let n = 0; n < 60 && !bad; n++) {
		const rng = makeRng('maze-fuzz' + n), gates = n % 2 ? [[0, 0], [0, 9]] : [[0, 5]], base = [13, 4];
		let g = { w: 14, h: 10, open: new Array(140).fill(1) };
		const done = [];
		for (let k = 0; k < 120; k++) {
			const cells = MZ.cellsAt(names[Math.floor(rng() * names.length)], Math.floor(rng() * 4), Math.floor(rng() * 14), Math.floor(rng() * 10));
			if (MZ.blockProblem(g, cells, gates, base)) { refused++; continue; }
			g = MZ.walled(g, cells); done.push(cells); laid++;
			const w = MZ.ways(g, gates, base);
			if (!w || !w.every((p) => stepsOk(p) && p.every(([x, y]) => g.open[y * 14 + x]) && p[p.length - 1][0] === 13 && p[p.length - 1][1] === 4)) { bad = { n, k }; break; }
			longest = Math.max(longest, MZ.wayLength(w[0]));
		}
		// the same blocks, laid again in another order, give the very same way
		let h = { w: 14, h: 10, open: new Array(140).fill(1) };
		for (const c of [...done].reverse()) h = MZ.walled(h, c);
		if (!bad && J(MZ.ways(h, gates, base)) !== J(MZ.ways(g, gates, base))) bad = { n, why: 'order' };
	}
	A(!bad && laid > 600 && refused > 600 && longest > 30, 'sixty seeded mazes, block after block: a gate always has its way, every step is to the next open tile, and the same blocks give the same way', { bad, laid, refused, longest });
}
// ---------- the map
{
	A(TD.mapProblems(FIELD, buildMap({ ...FIELD, foes: [] })).length === 0 && TD.mapProblems(TWO, buildMap({ ...TWO, foes: [] })).length === 0, 'a Maze Builder map (gates and a base, no road) is sound');
	const shut = { ...FIELD, rows: FIELD.rows.map((r) => r.slice(0, 6) + '1' + r.slice(7)) };
	A(TD.mapProblems(shut, buildMap({ ...shut, foes: [] })).join().includes('no way to the base'), 'a map whose gate cannot reach the base is a problem');
	A(TD.mapProblems({ ...FIELD, gates: [[8, 1]] }, buildMap({ ...FIELD, foes: [] })).join().includes('not on open ground') && TD.mapProblems({ ...FIELD, gates: [[10, 3]] }, buildMap({ ...FIELD, foes: [] })).join().includes('too close'), 'a gate in the pond, or one beside the base, is a problem');
	const g = TD.gridOf(buildMap({ ...FIELD, foes: [] }));
	A(!g.open[5 * 12 + 5] && !g.open[1 * 12 + 8] && g.open.filter(Boolean).length === 96 - 2, 'enemies walk flat ground: not the rock, not the pond');
}
// ---------- the game's own Maze Builder maps
{
	A(MAZE_MAPS.length === 3 && MAZE_MAPS.every((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] })).length === 0 && isMazeMap(m) && m.tip && tdMapById(m.id) === m), 'three Maze Builder maps, each sound (every gate reaches the base over open ground)', MAZE_MAPS.map((m) => TD.mapProblems(m, buildMap({ ...m, foes: [] }))));
	A(TD_MAPS.length === 3 && TD_MAPS.every((m) => !isMazeMap(m)) && new Set([...TD_MAPS, ...MAZE_MAPS].map((m) => m.id)).size === 6, 'the Road maps are the Road maps: six ids in all');
	const lens = MAZE_MAPS.map((m) => TD.newRun('len', { map: m, squad: [] }, data).paths.map((p) => MZ.wayLength(p)));
	A(J(lens) === J([[23], [33, 34], [44]]), 'their ways with no blocks laid: 23 steps; 33 and 34; 44 (round the lake)', lens);
	A(TD.TD_RULES_REV === 21, 'Tower Defense rules revision 21 (21: more heroes and second decks; 20: hero cards; 19: battle rules 13; 18: the enemy kinds on the Road; 11: Maze Builder; 12: its panel blocks keep their colour; 13: its heroes; 14: its enemy kinds; 15: a deck trimmed and upgraded; 16: its maps four times the size; 17: the Beacon, Mud and Caltrops)');
}
// ---------- a run
{
	const S = TD.newRun('mz', { map: FIELD, squad: squad() }, data);
	A(S.mode === 'maze' && S.paths.length === 1 && MZ.wayLength(S.paths[0]) === 11 && S.phase === 'wait', 'a new run: the way is the straight one, 11 steps', MZ.wayLength(S.paths[0]));
	for (let i = 0; i < 20 * 60; i++) TD.step(S, [], data);
	A(S.phase === 'wait' && S.wave === 0, 'there is no clock: a minute on, no wave has come');
	A(ap(S, { t: 'place', fig: 0, x: 4, y: 1 }, data) === 'figurines stand on blocks', 'a figurine does not stand on the ground');
	A(ap(S, { t: 'place', fig: 0, x: 5, y: 5 }, data) === null && ap(S, { t: 'recall', uid: 't0' }, data) === null, 'it may stand on the map\'s own rock');
	// a wall down from the top across the way: an I stood up at x 4 (y 0..3)
	A(J(TD.waysWith(S, 'I', 1, 4, 0)) !== J(S.paths) && MZ.wayLength(TD.waysWith(S, 'I', 1, 4, 0)[0]) === 13, 'the line shows the way as it would be: 11 -> 13', MZ.wayLength(TD.waysWith(S, 'I', 1, 4, 0)[0]));
	A(ap(S, { t: 'block', shape: 'I', turns: 1, x: 4, y: 0 }, data) === null && MZ.wayLength(S.paths[0]) === 13 && S.blocks.length === 1, 'a block bends the way');
	A(S.B.map.height[2 * 12 + 4] === 1 && !S.open[2 * 12 + 4], 'a block is a tile one level up, and no way through');
	A(ap(S, { t: 'block', shape: 'one', turns: 0, x: 4, y: 2 }, data) === 'something is in the way' && ap(S, { t: 'block', shape: 'one', turns: 0, x: 0, y: 3 }, data) === 'that is a gate' && ap(S, { t: 'block', shape: 'one', turns: 0, x: 8, y: 1 }, data) === 'something is in the way' && ap(S, { t: 'block', shape: 'nope', x: 1, y: 1 }, data) === 'no such block', 'not on a block, a gate or the pond; not a shape that does not exist');
	// the rest of the wall, but for the last tile: closing it is refused
	A(ap(S, { t: 'block', shape: 'three', turns: 1, x: 4, y: 4 }, data) === null && ap(S, { t: 'block', shape: 'one', turns: 0, x: 4, y: 7 }, data) === 'that would close the way', 'the way can never be closed');
	const before = J(S.paths), len = MZ.wayLength(S.paths[0]);
	A(len === 19 && S.paths[0].some(([x, y]) => x === 4 && y === 7), 'the way now goes round the bottom of the wall: 19 steps', len);
	A(ap(S, { t: 'unblock', id: 'b1' }, data) === null && MZ.wayLength(S.paths[0]) === 13 && S.B.map.height[5 * 12 + 4] === 0, 'a block laid this round comes back: the way and the ground are as they were');
	ap(S, { t: 'block', shape: 'three', turns: 1, x: 4, y: 4 }, data);
	A(J(S.paths) === before, 'laid again, the very same way');
	A(ap(S, { t: 'place', fig: 0, x: 4, y: 3 }, data) === null && ap(S, { t: 'unblock', id: 'b2' }, data) === null && ap(S, { t: 'unblock', id: 'b0' }, data) === 'a figurine stands on it', 'a figurine stands on a block; that block does not come back from under it');
	ap(S, { t: 'block', shape: 'three', turns: 1, x: 4, y: 4 }, data);
	A(TD.towerReach(S, 't0', data).length > 0, 'and it reaches from there');

	// the wave: enemies walk the worked-out way, tile by tile, never over a block
	const snap0 = TD.toSnapshot(S);
	const way = new Set(S.paths[0].map(([x, y]) => y * 12 + x));
	let off = 0, seen = 0, leaks = 0, firstLeak = 0, locked = null, during = null, snapMid = null;
	const play = (R, n, each) => { for (let i = 0; i < n && !R.over; i++) { TD.step(R, R.phase === 'wait' && R.wave < 1 && i === 0 ? [{ t: 'call' }] : [], data); if (each) each(R); } return R; };
	play(S, 20 * 90, (R) => {
		for (const e of R.enemies) { const u = R.B.units.find((x) => x.uid === e.uid); seen++; if (!way.has(u.y * 12 + u.x) || !R.open[u.y * 12 + u.x]) off++; }
		for (const e of R.ev) if (e.t === 'leak') { leaks++; if (!firstLeak) firstLeak = R.tick; }
		if (R.phase === 'wave' && !locked) { locked = R.blocks.every((b) => b.locked); during = [ap(R, { t: 'block', shape: 'one', turns: 0, x: 8, y: 6 }, data), ap(R, { t: 'unblock', id: 'b0' }, data)]; }
		if (R.tick === snap0.tick + 200) snapMid = TD.toSnapshot(R);
	});
	A(S.wave === 1 && seen > 50 && off === 0, 'a called wave walks the way that was worked out: every enemy, every tick, on a tile of it and never on a block', { wave: S.wave, seen, off });
	A(locked && J(during) === J(['not during a wave', 'not during a wave']), 'calling the wave locks the blocks; none is laid or taken back during a wave', during);
	A(S.phase === 'wait' && S.cleared === 1 && ap(S, { t: 'unblock', id: 'b0' }, data) !== null && ap(S, { t: 'unblock', id: 'b3' }, data) === 'that block is locked', 'after the wave they stay locked', [S.phase, S.cleared]);
	const waited = S.tick; for (let i = 0; i < 400; i++) TD.step(S, [], data);
	A(S.phase === 'wait' && S.wave === 1 && S.tick === waited + 400, 'and the next wave waits to be called');

	// exact: the same inputs, the same run; a snapshot from the middle continues to the same state
	const again = play(TD.fromSnapshot(JSON.parse(J(snap0))), 20 * 90 + 400);
	A(TD.hashOf(again) === TD.hashOf(S) && again.tick === S.tick, 'the same build and the same call give the same run (hash)', [TD.hashOf(again), TD.hashOf(S)]);
	const mid = TD.fromSnapshot(JSON.parse(J(snapMid))); while (mid.tick < S.tick) TD.step(mid, [], data);
	A(TD.hashOf(mid) === TD.hashOf(S), 'a snapshot taken mid-wave (through JSON) continues to the very same state');
	const other = TD.fromSnapshot(JSON.parse(J(snap0))); ap(other, { t: 'block', shape: 'one', turns: 0, x: 9, y: 6 }, data);
	A(TD.hashOf(other) !== TD.hashOf(TD.fromSnapshot(snap0)), 'a block is part of the fingerprint');

	// a longer way is a longer walk: with no towers, the first enemy reaches the base later
	const leakAt = (blocks) => { const R = TD.newRun('walk', { map: FIELD, squad: [] }, data); for (const b of blocks) ap(R, b, data); ap(R, { t: 'call' }, data); let at = 0; while (!at && !R.over && R.tick < 4000) { TD.step(R, [], data); if (R.ev.some((e) => e.t === 'leak')) at = R.tick; } return at; };
	const short = leakAt([]), long = leakAt([{ t: 'block', shape: 'I', turns: 1, x: 4, y: 0 }, { t: 'block', shape: 'three', turns: 1, x: 4, y: 4 }, { t: 'block', shape: 'I', turns: 1, x: 7, y: 4 }, { t: 'block', shape: 'three', turns: 1, x: 7, y: 1 }]);
	A(short > 0 && long > short * 2, 'with no towers the first enemy reaches the base far later through a maze', { short, long });
	A(TD.view(S).mode === 'maze' && TD.view(S).blocks.length === S.blocks.length && TD.view(S).ways.length === 1 && TD.view(S).nextIn === 0, 'the view carries the blocks and the way');
}
// ---------- two gates: one way each
{
	const S = TD.newRun('two', { map: TWO, squad: [] }, data);
	A(S.paths.length === 2 && S.paths[0][0][1] === 0 && S.paths[1][0][1] === 7, 'two gates, a way each');
	A(ap(S, { t: 'block', shape: 'I', turns: 1, x: 1, y: 0 }, data) === null && ap(S, { t: 'block', shape: 'I', turns: 0, x: 0, y: 4 }, data) === 'that would close the way', 'a block that would cut off either gate is refused');
	ap(S, { t: 'call' }, data);
	const gates = new Set(); for (let i = 0; i < 600; i++) { TD.step(S, [], data); for (const e of S.enemies) gates.add(e.gate); }
	A(S.wave === 1 && gates.size >= 1 && [...gates].every((g) => g === 0 || g === 1), 'its waves come from its gates');
}
// ---------- the Road mode is untouched
{
	const PIN = { 'td-loop': [6000, 11, '91528218'], 'td-ridge': [6000, 10, '1218c614'], 'td-twin': [6000, 13, '64afb0f4'] };   // (recorded on main before Maze Builder)
	const got = {};
	for (const m of TD_MAPS) {
		const S = TD.newRun('road-pin', { map: m, squad: squadAt(20, 6, data), rev: 17 }, data);   // (rules 18 put the enemy kinds on the Road: this pins the Road as a run recorded before that plays it)
		while (!S.over && S.tick < 6000) { if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) ap(S, a, data); TD.step(S, [], data); }
		got[m.id] = [S.tick, S.cleared, TD.hashOf(S)];
	}
	A(J(got) === J(PIN), 'a Road run recorded under rules 17 plays tick for tick as it did before Maze Builder (three maps, 5 minutes each, by fingerprint)', got);
	// (rules 18) the same three runs with the enemy kinds on the Road: pinned too, and about as far as before (11, 10, 13 waves)
	const PIN18 = { 'td-loop': [6000, 11, '672e92b6'], 'td-ridge': [6000, 10, '95fbe5d4'], 'td-twin': [6000, 12, 'e2e74182'] };
	const got18 = {};
	for (const m of TD_MAPS) {
		const S = TD.newRun('road-pin', { map: m, squad: squadAt(20, 6, data) }, data);
		while (!S.over && S.tick < 6000) { if (S.tick % 10 === 0) for (const a of chooseOrders(S, data)) ap(S, a, data); TD.step(S, [], data); }
		got18[m.id] = [S.tick, S.cleared, TD.hashOf(S)];
	}
	A(J(got18) === J(PIN18), 'with the enemy kinds on the Road the auto-player gets as far, bar one wave on one map (11, 10, 12 against 11, 10, 13)', got18);
	const R = TD.newRun('road', { map: TD_MAPS[0], squad: [] }, data);
	A(!R.mode && ap(R, { t: 'block', shape: 'one', turns: 0, x: 3, y: 3 }, data) === 'no such order' && ap(R, { t: 'unblock', id: 'b0' }, data) === 'no such block' && TD.view(R).mode === undefined && TD.view(R).nextIn > 0, 'a Road run has no blocks, and keeps its clock');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
