// grid.js — Poketactica's map: tiles with height, movement reach (Move + Jump), a move's shape turned into tiles, line of
// sight, knockback. Pure (stage 3; Plans/POKETACTICA_PLAN.md). Coordinates are integer tiles; height is in levels.
//
// A map: { w, h, height: [w*h] (an integer level per tile; null = no tile), base: {x, y} (the player's base tile),
//          name? }
export const DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const DIR_KEYS = ['n', 'e', 's', 'w'];

export const inside = (map, x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h;
export const heightAt = (map, x, y) => (inside(map, x, y) ? map.height[y * map.w + x] : null);
export const isTile = (map, x, y) => heightAt(map, x, y) != null;
export const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
export const key = (x, y) => x + ',' + y;

/** The direction from (ax,ay) toward (bx,by): the larger axis wins (ties go to the vertical axis). */
export function dirToward(ax, ay, bx, by) {
	const dx = bx - ax, dy = by - ay;
	if (!dx && !dy) return 'n';
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w';
	return dy > 0 ? 's' : 'n';
}

/** Can a unit with this Jump step from one tile to a neighbour? (Jump Infinity: Flying / Levitate ignore height.) */
export const canStep = (map, x0, y0, x1, y1, jump) => {
	const h0 = heightAt(map, x0, y0), h1 = heightAt(map, x1, y1);
	return h0 != null && h1 != null && Math.abs(h1 - h0) <= jump;
};

/**
 * Where a unit can move: a breadth-first search over the 4 neighbours, `move` steps, each step within `jump` height. Foes
 * block; allies can be passed through but not stopped on. -> Map key -> { x, y, d, from } (its own tile included, d 0)
 * occupant(x, y) -> null | 'ally' | 'foe'
 */
export function reach(map, x, y, move, jump, occupant) {
	const out = new Map([[key(x, y), { x, y, d: 0, from: null }]]);
	let frontier = [[x, y]];
	for (let d = 1; d <= move && frontier.length; d++) {
		const next = [];
		for (const [cx, cy] of frontier) for (const k of DIR_KEYS) {
			const nx = cx + DIRS[k][0], ny = cy + DIRS[k][1], kk = key(nx, ny);
			if (out.has(kk) || !canStep(map, cx, cy, nx, ny, jump)) continue;
			const occ = occupant(nx, ny);
			if (occ === 'foe') continue;
			out.set(kk, { x: nx, y: ny, d, from: key(cx, cy), pass: occ === 'ally' });
			next.push([nx, ny]);
		}
		frontier = next;
	}
	for (const [k, v] of out) if (v.pass) out.delete(k);   // allies can be passed, not stood on
	return out;
}
/** The path (list of tiles) to a reach() tile, for animation and facing. */
export function pathTo(reachMap, x, y) {
	const path = [];
	let cur = reachMap.get(key(x, y));
	while (cur) { path.unshift([cur.x, cur.y]); cur = cur.from ? reachMap.get(cur.from) : null; }
	return path;
}

/** Tiles on the straight line between two tiles (Bresenham), both ends excluded. */
export function between(ax, ay, bx, by) {
	const out = [];
	let x = ax, y = ay;
	const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
	let err = dx + dy;
	for (;;) {
		if (x === bx && y === by) break;
		const e2 = 2 * err;
		if (e2 >= dy) { err += dy; x += sx; }
		if (e2 <= dx) { err += dx; y += sy; }
		if (x === bx && y === by) break;
		out.push([x, y]);
	}
	return out;
}

/**
 * Can a move with this height rule reach from the user's tile to the target tile?
 *   melee  the height difference is at most MELEE_REACH levels
 *   beam   nothing on the line between stands higher than the higher of the two ends (+1)
 *   lob / any  always
 */
export const MELEE_REACH = 2;
export function heightReach(map, rule, ax, ay, bx, by) {
	const ha = heightAt(map, ax, ay), hb = heightAt(map, bx, by);
	if (ha == null || hb == null) return false;
	if (rule === 'melee') return Math.abs(ha - hb) <= MELEE_REACH;
	if (rule === 'beam') { const top = Math.max(ha, hb) + 1; return between(ax, ay, bx, by).every(([x, y]) => (heightAt(map, x, y) ?? 0) <= top); }
	return true;
}

/**
 * The tiles a move's shape covers (poketactica/data/move_shapes.json vocabulary), for a user at (ux,uy) aiming at (tx,ty).
 * Aimed-by-direction shapes (line, cone, arc, dash) take the direction toward the aim tile. -> [[x, y], ...] on the map
 */
export function shapeTiles(map, s, ux, uy, tx, ty) {
	const out = [], add = (x, y) => { if (isTile(map, x, y) && !out.some(([a, b]) => a === x && b === y)) out.push([x, y]); };
	const d = DIRS[dirToward(ux, uy, tx, ty)], side = [-d[1], d[0]];
	const around = (cx, cy, n, incl) => { for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) if (Math.abs(x) + Math.abs(y) <= n && (incl || x || y)) add(cx + x, cy + y); };
	const n = s.n || 0;
	switch (s.s) {
		case 'one': case 'swap': case 'leap': add(tx, ty); break;
		case 'cross': add(tx, ty); for (let i = 1; i <= n; i++) { add(tx + i, ty); add(tx - i, ty); add(tx, ty + i); add(tx, ty - i); } break;
		case 'dia': case 'trap': case 'paint': around(tx, ty, n, true); break;
		case 'line': for (let i = 1; i <= n; i++) add(ux + d[0] * i, uy + d[1] * i); break;
		case 'arc': for (let k = 1; k <= n; k++) for (let j = -1; j <= 1; j++) add(ux + d[0] * k + side[0] * j, uy + d[1] * k + side[1] * j); break;
		case 'cone': for (let k = 1; k <= n; k++) for (let j = -(k - 1); j <= k - 1; j++) add(ux + d[0] * k + side[0] * j, uy + d[1] * k + side[1] * j); break;
		case 'burst': around(ux, uy, n, false); break;
		case 'aura': around(ux, uy, n, true); break;
		case 'dash': for (let i = 1; i <= n; i++) add(ux + d[0] * i, uy + d[1] * i); break;   // the engine stops at the first unit
		case 'map': for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) add(x, y); break;
		case 'self': add(ux, uy); break;
	}
	return out;
}

/** Does this shape aim at a tile within its reach (r), or by a direction (an adjacent tile)? */
export const AIM_BY_DIR = new Set(['line', 'cone', 'arc', 'dash']);
export const NO_AIM = new Set(['self', 'burst', 'aura', 'map']);
