// mm/shapes8.js — Mystery Maze's geometry: 8 directions, the corner rule, what walls stop, sight, and Poketactica's move
// shapes (poketactica/data/move_shapes.json) laid out in 8 directions (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "The battle
// system is Poketactica's"). The 4-direction battles are untouched: facing straight, a shape here IS the battle's shape.
//   - aimed-by-direction shapes (line, cone, arc, dash) get a diagonal form: a line runs along the diagonal, a cone and an
//     arc turn 45 degrees;
//   - reach is counted the 8-direction way (a diagonal step is one step);
//   - walls stop everything: nothing strikes or steps diagonally round a wall's corner, a beam stops at the first wall, a
//     lobbed shot lands anywhere in the thrower's room but cannot leave it.
// A floor F is what mm/gen.js returns, with its size: { w, h, terrain, room }.
// Pure: node-tested (overworld/tests/poketactica_mm_shapes_test.mjs).
import { T_WALL, NO_ROOM } from './gen.js';
import { between, AIM_BY_DIR, NO_AIM } from '../engine/grid.js';

// clockwise from north; an odd index is a diagonal
export const DIR8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const DIR8_KEYS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const isDiagonal = (d) => (d & 1) === 1;
export const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const inFloor = (F, x, y) => x >= 0 && y >= 0 && x < F.w && y < F.h;
/** A wall, or off the floor. (Water and lava are not walls: they count as open for corners and for shots.) */
export const isWall = (F, x, y) => !inFloor(F, x, y) || (F.terrain[y * F.w + x] & 3) === T_WALL;
export const roomAt = (F, x, y) => (inFloor(F, x, y) ? F.room[y * F.w + x] : NO_ROOM);

/** The facing (0..7) from one tile toward another: the nearest of the 8 directions. */
export function dir8Toward(ax, ay, bx, by) {
	const dx = bx - ax, dy = by - ay;
	if (!dx && !dy) return 0;
	const adx = Math.abs(dx), ady = Math.abs(dy);
	if (adx > 2 * ady) return dx > 0 ? 2 : 6;
	if (ady > 2 * adx) return dy > 0 ? 4 : 0;
	return dx > 0 ? (dy > 0 ? 3 : 1) : dy > 0 ? 5 : 7;
}
/** The corner rule: a step (or a strike) in direction d from (x, y) needs the tile open and, on a diagonal, both tiles beside the way open too. */
export function canStep8(F, x, y, d) {
	const [dx, dy] = DIR8[d];
	if (isWall(F, x + dx, y + dy)) return false;
	return !(dx && dy) || (!isWall(F, x + dx, y) && !isWall(F, x, y + dy));
}
/** Can a shot fly from one tile to another? Every step of the straight line between must be open, corners included. */
export function lineOfFire(F, ax, ay, bx, by) {
	if (isWall(F, bx, by)) return false;
	let px = ax, py = ay;
	for (const [x, y] of [...between(ax, ay, bx, by), [bx, by]]) {
		if (isWall(F, x, y)) return false;
		if (x !== px && y !== py && (isWall(F, x, py) || isWall(F, px, y))) return false;
		px = x; py = y;
	}
	return true;
}
/** Does a move with this height rule (melee / beam / lob / any) get from (ax, ay) to (bx, by) past the walls? */
export function clearTo(F, rule, ax, ay, bx, by) {
	if (ax === bx && ay === by) return !isWall(F, bx, by);
	if (rule === 'lob') { const r = roomAt(F, ax, ay); if (r !== NO_ROOM && r === roomAt(F, bx, by)) return !isWall(F, bx, by); }
	return lineOfFire(F, ax, ay, bx, by);
}

/**
 * What a Pokémon standing on (x, y) sees (the original's rule, Plans/PMD_SYSTEMS_SPEC.md 4.4 and 8): in a room, the whole
 * room and the ring of tiles round it (its doorways); in a corridor, the square within `range` tiles (2; 1 on a dark
 * floor), walls or not: you do see round a corridor's bend. -> [[x, y], ...] (wall tiles included: the edges you see)
 */
export function sightTiles(F, x, y, range = 2) {
	const out = [], seen = new Set();
	const add = (ax, ay) => { if (!inFloor(F, ax, ay)) return; const k = ay * F.w + ax; if (!seen.has(k)) { seen.add(k); out.push([ax, ay]); } };
	const r = roomAt(F, x, y);
	if (r !== NO_ROOM) {
		for (let ty = 0; ty < F.h; ty++) for (let tx = 0; tx < F.w; tx++) if (F.room[ty * F.w + tx] === r && !isWall(F, tx, ty)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(tx + dx, ty + dy);
		add(x, y);
		return out;
	}
	add(x, y);
	for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) add(x + dx, y + dy);
	return out;
}

/**
 * The tiles a shape covers for a user at (ux, uy) FACING d (0..7) and aiming at (tx, ty), before walls are counted (but
 * never a wall tile itself). Facing straight this is engine/grid.js's shapeTiles; on a diagonal:
 *   line / dash   along the diagonal
 *   arc           each step out: the diagonal tile and the two tiles beside it (the 3 in front, turned 45 degrees)
 *   cone          a quarter turned 45 degrees: 1 tile, then 3, then 5 ... along the diagonal
 * 'map' is everything in sight (a room-wide move), not the whole floor.
 */
export function shapeTiles8(F, s, ux, uy, d, tx, ty) {
	const out = [], seen = new Set();
	const add = (x, y) => { if (isWall(F, x, y)) return; const k = y * F.w + x; if (!seen.has(k)) { seen.add(k); out.push([x, y]); } };
	const [dx, dy] = DIR8[d], diag = dx !== 0 && dy !== 0, side = [-dy, dx];
	const around = (cx, cy, n, incl) => { for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) if (Math.abs(x) + Math.abs(y) <= n && (incl || x || y)) add(cx + x, cy + y); };
	const n = s.n || 0;
	switch (s.s) {
		case 'one': case 'swap': case 'leap': add(tx, ty); break;
		case 'cross': add(tx, ty); for (let i = 1; i <= n; i++) { add(tx + i, ty); add(tx - i, ty); add(tx, ty + i); add(tx, ty - i); } break;
		case 'dia': case 'trap': case 'paint': around(tx, ty, n, true); break;
		case 'line': case 'dash': for (let i = 1; i <= n; i++) add(ux + dx * i, uy + dy * i); break;
		case 'arc':
			for (let k = 1; k <= n; k++) {
				if (diag) { add(ux + dx * k, uy + dy * k); add(ux + dx * (k - 1), uy + dy * k); add(ux + dx * k, uy + dy * (k - 1)); }
				else for (let j = -1; j <= 1; j++) add(ux + dx * k + side[0] * j, uy + dy * k + side[1] * j);
			}
			break;
		case 'cone':
			for (let k = 1; k <= n; k++) {
				if (diag) { add(ux + dx * k, uy + dy * k); for (let j = 1; j < k; j++) { add(ux + dx * (k - j), uy + dy * k); add(ux + dx * k, uy + dy * (k - j)); } }
				else for (let j = -(k - 1); j <= k - 1; j++) add(ux + dx * k + side[0] * j, uy + dy * k + side[1] * j);
			}
			break;
		case 'burst': around(ux, uy, n, false); break;
		case 'aura': around(ux, uy, n, true); break;
		case 'map': for (const [x, y] of sightTiles(F, ux, uy)) add(x, y); break;
		case 'self': add(ux, uy); break;
	}
	return out;
}
/** Shapes centred on the aim tile (the rest spread from the user). */
const FROM_TARGET = new Set(['one', 'swap', 'leap', 'cross', 'dia', 'trap', 'paint']);

/**
 * The tiles a move really hits: its shape in 8 directions, minus what the walls stop. m: { s, n, r, h } (a move's shape
 * entry). The user must be able to reach the aim tile; an area then spreads from its centre only as far as the walls let it.
 */
export function hitTiles8(F, m, ux, uy, tx, ty, d = dir8Toward(ux, uy, tx, ty)) {
	const rule = m.h || 'any';
	if (m.s === 'map') return shapeTiles8(F, m, ux, uy, d, tx, ty);
	const fromTarget = FROM_TARGET.has(m.s);
	if (fromTarget && !clearTo(F, rule, ux, uy, tx, ty)) return [];
	const cx = fromTarget ? tx : ux, cy = fromTarget ? ty : uy;
	// (a melee swing at a neighbour is the corner rule; anything longer is a line the walls can cut)
	return shapeTiles8(F, m, ux, uy, d, tx, ty).filter(([x, y]) => clearTo(F, fromTarget ? 'beam' : rule, cx, cy, x, y));
}
/**
 * Where a move can be aimed from (ux, uy): its own tile (no aim), the 8 neighbours that give it at least one tile (aimed by
 * direction), or every tile within its reach, counted in 8 directions, that the walls let it get to. -> [[x, y], ...]
 */
export function aimTiles8(F, m, ux, uy) {
	if (NO_AIM.has(m.s)) return [[ux, uy]];
	if (AIM_BY_DIR.has(m.s)) return DIR8.map(([dx, dy], d) => [ux + dx, uy + dy, d]).filter(([x, y, d]) => hitTiles8(F, m, ux, uy, x, y, d).length).map(([x, y]) => [x, y]);
	const [r0, r1] = m.r || [1, 1], rule = m.h || 'any', out = [];
	for (let y = uy - r1; y <= uy + r1; y++) for (let x = ux - r1; x <= ux + r1; x++) {
		const c = cheb(ux, uy, x, y);
		if (c < r0 || c > r1 || isWall(F, x, y)) continue;
		if (clearTo(F, rule, ux, uy, x, y)) out.push([x, y]);
	}
	return out;
}
