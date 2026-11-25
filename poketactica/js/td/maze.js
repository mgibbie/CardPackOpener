// td/maze.js — Tower Defense, MAZE BUILDER: the maze (owner, 2026-11-24; Plans/POKETACTICA_MAZE_BUILDER_PLAN.md).
// There is no road. Enemies walk the shortest way from each gate to the base, and the player bends that way with
// BLOCKS. This file is the pure part: the block shapes and their quarter turns, where a block may go, the flood from
// the base and the way it gives. No engine, no drawing, no clock, no randomness: the same blocks always give the same
// way (a replay, a resume and a spectator all work it out alike).
//
// A GRID is { w, h, open: [0 | 1] } (row by row): 1 = an enemy can walk there.

/** The shapes, as cells [x, y] from the top-left of their box, before any turn. Four small ones and the seven tetrominoes. */
export const SHAPES = Object.freeze({
	one: [[0, 0]],
	two: [[0, 0], [1, 0]],
	three: [[0, 0], [1, 0], [2, 0]],
	corner: [[0, 0], [0, 1], [1, 1]],
	I: [[0, 0], [1, 0], [2, 0], [3, 0]],
	O: [[0, 0], [1, 0], [0, 1], [1, 1]],
	T: [[0, 0], [1, 0], [2, 0], [1, 1]],
	L: [[0, 0], [0, 1], [0, 2], [1, 2]],
	J: [[1, 0], [1, 1], [1, 2], [0, 2]],
	S: [[1, 0], [2, 0], [0, 1], [1, 1]],
	Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
});
export const SMALL = Object.freeze(['one', 'two', 'three', 'corner']);
export const TETROMINOES = Object.freeze(['I', 'O', 'T', 'L', 'J', 'S', 'Z']);

/** A shape after `turns` quarter turns clockwise, moved back so its box starts at 0, 0; cells in reading order. */
export function turned(shape, turns = 0) {
	let cells = (SHAPES[shape] || []).map(([x, y]) => [x, y]);
	for (let k = ((turns % 4) + 4) % 4; k > 0; k--) cells = cells.map(([x, y]) => [-y, x]);
	if (!cells.length) return cells;
	const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
	return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
/** The board tiles a shape covers with its box's top-left at (x, y). */
export const cellsAt = (shape, turns, x, y) => turned(shape, turns).map(([cx, cy]) => [x + cx, y + cy]);

// the order ties are broken in: up, right, down, left
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** How far each tile is from the base, walking 4 ways over open tiles: [steps | -1 (no way)]. */
export function flood(grid, base) {
	const { w, h, open } = grid, dist = new Array(w * h).fill(-1);
	const b = base[1] * w + base[0];
	if (!open[b]) return dist;
	dist[b] = 0;
	const q = [b];
	for (let qi = 0; qi < q.length; qi++) {
		const i = q[qi], x = i % w, y = (i - x) / w;
		for (const [dx, dy] of DIRS) {
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const n = ny * w + nx;
			if (!open[n] || dist[n] >= 0) continue;
			dist[n] = dist[i] + 1; q.push(n);
		}
	}
	return dist;
}

/** The way from a gate down a flood to the base: [[x, y], …] (gate first, base last), or null when there is none. */
export function wayFrom(grid, dist, gate) {
	const { w, h } = grid;
	let [x, y] = gate;
	if (x < 0 || y < 0 || x >= w || y >= h || dist[y * w + x] < 0) return null;
	const out = [[x, y]];
	while (dist[y * w + x] > 0) {
		const d = dist[y * w + x];
		let moved = false;
		for (const [dx, dy] of DIRS) {
			const nx = x + dx, ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[ny * w + nx] !== d - 1) continue;
			x = nx; y = ny; out.push([x, y]); moved = true; break;
		}
		if (!moved) return null;   // (cannot happen on a flood from the same grid)
	}
	return out;
}

/** One way a gate, in the gates' order; null when any gate has no way to the base. */
export function ways(grid, gates, base) {
	// (a map with two bases: `base` is a list, one base a lane, in the gates' order)
	const each = Array.isArray(base[0]), floods = new Map(), out = [];
	const distTo = (b) => { const k = b[0] + ',' + b[1]; if (!floods.has(k)) floods.set(k, flood(grid, b)); return floods.get(k); };
	for (const [i, g] of gates.entries()) { const p = wayFrom(grid, distTo(each ? base[i] : base), g); if (!p) return null; out.push(p); }
	return out;
}

/**
 * Why a block cannot go on these tiles, or null. `taken(x, y)` (optional) names anything else in the way (the map's
 * own say: a figurine, a Geo symbol …) or returns null.
 */
export function blockProblem(grid, cells, gates, base, taken) {
	const { w, h, open } = grid;
	if (!cells || !cells.length) return 'no such block';
	for (const [x, y] of cells) {
		if (x < 0 || y < 0 || x >= w || y >= h) return 'off the board';
		if (Array.isArray(base[0]) ? base.some((b) => b[0] === x && b[1] === y) : base[0] === x && base[1] === y) return 'that is the base';
		if (gates.some((g) => g[0] === x && g[1] === y)) return 'that is a gate';
		if (!open[y * w + x]) return 'something is in the way';
		const why = taken && taken(x, y);
		if (why) return why;
	}
	const next = { w, h, open: open.slice() };
	for (const [x, y] of cells) next.open[y * w + x] = 0;
	return ways(next, gates, base) ? null : 'that would close the way';
}

/** The grid with these tiles walled (a new grid). */
export function walled(grid, cells) {
	const open = grid.open.slice();
	for (const [x, y] of cells) open[y * grid.w + x] = 0;
	return { w: grid.w, h: grid.h, open };
}
/** How many steps the way is (its tiles less one), for the "38 -> 46" line. */
export const wayLength = (p) => (p ? p.length - 1 : 0);
