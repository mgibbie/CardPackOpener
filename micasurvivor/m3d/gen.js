// m3d/gen.js — MicaSurvivor 3D, P2 (Plans/MICASURVIVOR_3D_PLAN.md): level generation. Pure, seeded: the same seed and
// biome always give the same level (replays, co-op guests and spectators rebuild a level from its seed).
//
// A level is a square of TILES. The generator
//   1. carves a spanning tree over the tiles from a start tile (so every tile is reachable), then opens a few extra
//      links (`loops`) so it is not a pure maze;
//   2. walks out from the start giving each tile a HEIGHT LEVEL: at each step the level stays or moves by one
//      (`volatility`), pulled toward a target profile over the map (`bias`: a hill in the middle, or a cone);
//   3. joins linked tiles: level with level by open floor, one level apart by a RAMP (a floor slope you can run up);
//      tiles that are not linked meet at a cliff (you can drop off it, not climb it) or, at the same level, sometimes
//      at a ridge wall (`closed`);
//   4. dresses each tile with a SET PIECE (blocks to jump on, a pond, ice, mud, a bounce pad, a mound) and scatters
//      small decorations;
//   5. puts the spawn on the start tile and the exit on the tile farthest from it;
//   6. CHECKS the result (validate): everything you can reach you can walk back from without jumping, every tile and
//      the exit are reachable on foot, no slope is too steep to stand on. If a ridge or a set piece broke that, they
//      are taken out until it holds.
// The level it returns is a sim.js room (a height field), so the rules and the renderer need nothing new.
import { CELL, K, makeRoom, setCell, idx, groundAt } from './sim.js';

export const TS = 7;          // cells along a tile (14 m)
export const LEVEL = 1.5;     // metres between height levels: one jump (1.67 m) clears one level
const MID = 3, RAMP = LEVEL / 2;   // a ramp is two cells long (one in each tile): 0.75 m a cell = 20.6°

/** What a biome's levels are like. size: tiles along a side. levels: how many height levels. volatility: how often the
 *  level changes from tile to tile. bias / center: the target profile. loops: extra links beyond the tree. closed: how
 *  often two unlinked tiles at the same level get a ridge between them. pieces: the set pieces' weights. */
export const BIOMES = {
	meadow: { size: 5, levels: 3, volatility: 0.55, bias: 'gaussian', center: 1.4, loops: 0.2, closed: 0.5, pieces: { plain: 5, blocks: 3, pond: 1.2, ice: 0, mud: 0.6, bounce: 0.8, mound: 1 } },
	peaks: { size: 5, levels: 5, volatility: 0.85, bias: 'linear', center: 4, loops: 0.1, closed: 0.7, pieces: { plain: 4, blocks: 4, pond: 0.4, ice: 1.6, mud: 0, bounce: 1.6, mound: 1.4 } },
	marsh: { size: 5, levels: 2, volatility: 0.3, bias: 'gaussian', center: 0.6, loops: 0.35, closed: 0.3, pieces: { plain: 3, blocks: 1.5, pond: 4, ice: 0, mud: 3, bounce: 0.4, mound: 0.5 } },
};

export function rng(seed) {
	let a = (seed >>> 0) || 1;
	return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DIRS = [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']];
const OPP = { e: 'w', w: 'e', s: 'n', n: 's' };

/** generate(seed, biome | params) -> a room, plus: tiles (the plan it was built from), exit [x, y, z], scatter
 *  [{ kind, x, z, s }], biome, seed, repaired (how many ridges / pieces the check took out). */
export function generate(seed, biome = 'meadow', overrides = null) {
	const P = { ...(typeof biome === 'string' ? BIOMES[biome] || BIOMES.meadow : biome), ...(overrides || {}) };
	const N = P.size, r = rng((seed >>> 0) * 2654435761 + 97);
	const pick = (n) => Math.floor(r() * n);
	const T = (tx, tz) => tz * N + tx;
	const tiles = [];
	for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) tiles.push({ tx, tz, level: 0, link: {}, ridge: {}, ramp: {}, piece: 'plain', parent: -1, dist: 0 });

	// 1. the spanning tree (a randomised depth-first walk), then a few loops
	const start = T(pick(N), pick(N)), seen = new Set([start]), stack = [start], order = [start];
	while (stack.length) {
		const cur = stack[stack.length - 1], t = tiles[cur];
		const open = DIRS.map(([dx, dz, d]) => [t.tx + dx, t.tz + dz, d]).filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !seen.has(T(x, z)));
		if (!open.length) { stack.pop(); continue; }
		const [x, z, d] = open[pick(open.length)], nx = T(x, z);
		t.link[d] = true; tiles[nx].link[OPP[d]] = true; tiles[nx].parent = cur;
		seen.add(nx); stack.push(nx); order.push(nx);
	}

	// 2. heights: walking out from the start, each tile stays at its parent's level or moves one, toward the profile
	const mid = (N - 1) / 2, dmax = Math.hypot(mid, mid) || 1;
	const target = (t) => { const d = Math.hypot(t.tx - mid, t.tz - mid); return P.bias === 'linear' ? P.center * (1 - d / dmax) : P.center * Math.exp(-(d * d) / (2 * (N / 3.2) ** 2)); };
	const clampL = (v) => Math.max(0, Math.min(P.levels - 1, v));
	tiles[start].level = clampL(Math.round(target(tiles[start])));
	for (const i of order.slice(1)) {
		const t = tiles[i], p = tiles[t.parent];
		let lv = p.level;
		if (r() < P.volatility) { const want = Math.sign(target(t) - p.level) || (r() < 0.5 ? 1 : -1); lv += r() < 0.72 ? want : -want; }
		t.level = clampL(lv);
	}
	// loops: link some neighbours the tree left apart, where they are at most a level apart
	for (const t of tiles) for (const [dx, dz, d] of [DIRS[0], DIRS[2]]) {
		const x = t.tx + dx, z = t.tz + dz; if (x >= N || z >= N) continue;
		const o = tiles[T(x, z)];
		if (!t.link[d] && Math.abs(o.level - t.level) <= 1 && r() < P.loops) { t.link[d] = true; o.link[OPP[d]] = true; }
		else if (!t.link[d] && o.level === t.level && r() < P.closed) t.ridge[d] = true;   // 3b. a ridge between unlinked equals
	}
	// 3a. ramps: where a link joins two levels, which three rows of the shared edge carry it
	for (const t of tiles) for (const [dx, dz, d] of [DIRS[0], DIRS[2]]) {
		if (!t.link[d]) continue;
		const o = tiles[T(t.tx + dx, t.tz + dz)];
		if (o.level !== t.level) { const c = 2 + pick(3); t.ramp[d] = c; o.ramp[OPP[d]] = c; }
	}
	// distances over the links (for the exit), then the set pieces
	{ const q = [start]; const dist = new Map([[start, 0]]);
		for (let k = 0; k < q.length; k++) { const t = tiles[q[k]]; for (const [dx, dz, d] of DIRS) if (t.link[d]) { const n = T(t.tx + dx, t.tz + dz); if (!dist.has(n)) { dist.set(n, dist.get(q[k]) + 1); q.push(n); } } }
		for (const [i, v] of dist) tiles[i].dist = v; }
	// the exit: the tile farthest from the start along the links — among those at least two tiles away as the crow flies
	// (a long winding route can end right beside where it began)
	let exit = -1;
	const apart = (i) => Math.max(Math.abs(tiles[i].tx - tiles[start].tx), Math.abs(tiles[i].tz - tiles[start].tz));
	for (let i = 0; i < tiles.length; i++) if (apart(i) >= Math.min(2, N - 1) && (exit < 0 || tiles[i].dist > tiles[exit].dist)) exit = i;
	const names = Object.keys(P.pieces), total = names.reduce((s, n) => s + P.pieces[n], 0);
	for (let i = 0; i < tiles.length; i++) {
		let v = r() * total, name = 'plain';
		for (const n of names) { v -= P.pieces[n]; if (v < 0) { name = n; break; } }
		tiles[i].piece = i === start || i === exit ? 'plain' : name;
		tiles[i].pr = Math.floor(r() * 0x7fffffff);   // the piece's own seed (so taking a piece out changes nothing else)
	}

	// 4-6. build, check, and take out whatever broke the check
	let room = build(seed, P, tiles, start, exit), check = validate(room), repaired = 0;
	if (!check.ok) { for (const t of tiles) for (const d of ['e', 's']) if (t.ridge[d]) { delete t.ridge[d]; repaired++; } room = build(seed, P, tiles, start, exit); check = validate(room); }
	if (!check.ok) { for (const t of tiles) if (t.piece !== 'plain') { t.piece = 'plain'; repaired++; } room = build(seed, P, tiles, start, exit); check = validate(room); }
	room.repaired = repaired; room.check = check;
	room.rails = railsFor(room, seed);   // (laid over the finished level, from a stream of their own: the level itself is as it was)
	room.biome = typeof biome === 'string' ? biome : 'custom'; room.seed = seed >>> 0;
	return room;
}

/** Turn the plan (tiles with levels, links, ramps, ridges and pieces) into a room. */
function build(seed, P, tiles, start, exit) {
	const N = P.size, W = N * TS + 2, room = makeRoom(W, W, 0);
	const T = (tx, tz) => tz * N + tx, top = (P.levels - 1) * LEVEL + 7;
	const cx0 = (t) => 1 + t.tx * TS, cz0 = (t) => 1 + t.tz * TS;
	for (let i = 0; i < W; i++) { setCell(room, i, 0, top); setCell(room, i, W - 1, top); setCell(room, 0, i, top); setCell(room, W - 1, i, top); }   // the rim
	for (const t of tiles) { const h = t.level * LEVEL; for (let z = 0; z < TS; z++) for (let x = 0; x < TS; x++) setCell(room, cx0(t) + x, cz0(t) + z, h); }
	// ridges (on the west / north tile's own edge) and ramps
	for (const t of tiles) {
		const h = t.level * LEVEL, x0 = cx0(t), z0 = cz0(t);
		if (t.ridge.e) for (let z = 0; z < TS; z++) setCell(room, x0 + TS - 1, z0 + z, h + 2 * LEVEL);
		if (t.ridge.s) for (let x = 0; x < TS; x++) setCell(room, x0 + x, z0 + TS - 1, h + 2 * LEVEL);
		for (const d of ['e', 's']) {
			if (!t.link[d] || t.ramp[d] === undefined) continue;
			const o = tiles[d === 'e' ? T(t.tx + 1, t.tz) : T(t.tx, t.tz + 1)], c = t.ramp[d], up = o.level > t.level;   // up: rising toward +x / +z
			const low = Math.min(t.level, o.level) * LEVEL, ax = d === 'e' ? 'x' : 'z';
			for (let k = c - 1; k <= c + 1; k++) {
				// two cells across the boundary: this tile's last cell, the other tile's first
				const a = d === 'e' ? [x0 + TS - 1, z0 + k] : [x0 + k, z0 + TS - 1], b = d === 'e' ? [x0 + TS, z0 + k] : [x0 + k, z0 + TS];
				if (up) { setCell(room, a[0], a[1], low, { ax, rise: RAMP }); setCell(room, b[0], b[1], low + RAMP, { ax, rise: RAMP }); }
				else { setCell(room, a[0], a[1], low + LEVEL, { ax, rise: -RAMP }); setCell(room, b[0], b[1], low + RAMP, { ax, rise: -RAMP }); }
			}
		}
	}
	// set pieces: inside the tile's edge ring only (cells 1..5), so links and ramps are never touched
	room.scatter = [];
	for (const t of tiles) {
		const h = t.level * LEVEL, x0 = cx0(t), z0 = cz0(t), pr = rng(t.pr || 1), at = (x, z) => idx(room, x0 + x, z0 + z);
		const quads = [[1, 1], [4, 1], [1, 4], [4, 4]];   // the four 2 × 2 corners of the inside, off the middle cross
		if (t.piece === 'blocks') {
			for (const [qx, qz] of quads) {
				if (pr() > 0.6) continue;
				const tall = pr() < 0.35, one = pr() < 0.3, ox = one ? Math.floor(pr() * 2) : 0, oz = one ? Math.floor(pr() * 2) : 0;
				for (let z = 0; z < (one ? 1 : 2); z++) for (let x = 0; x < (one ? 1 : 2); x++) setCell(room, x0 + qx + ox + x, z0 + qz + oz + z, h + (tall ? 2 * LEVEL + 0.3 : LEVEL));
			}
		} else if (t.piece === 'pond') {
			for (let z = 1; z <= 5; z++) for (let x = 1; x <= 5; x++) {
				const ring = Math.max(Math.abs(x - MID), Math.abs(z - MID));   // 2: the outside, 1: inside it, 0: the middle
				// beside a ramp the bank stays dry floor: stepping out of the water straight onto a rising ramp is more than a step
				if (ring === 2 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => room.slopes.has(at(x + dx, z + dz)))) continue;
				setCell(room, x0 + x, z0 + z, h - (ring === 2 ? 0.34 : ring === 1 ? 0.68 : 2.2));   // (floating in the middle you are at -1.0: each lip out is 0.32-0.34 m, well inside a step)
				room.water.set(at(x, z), h - 0.1);
			}
		} else if (t.piece === 'ice' || t.piece === 'mud') {
			for (let z = 1; z <= 5; z++) for (let x = 1; x <= 5; x++) room.mats.set(at(x, z), t.piece);
		} else if (t.piece === 'bounce') {
			const [qx, qz] = quads[Math.floor(pr() * 4)]; room.mats.set(at(qx + Math.floor(pr() * 2), qz + Math.floor(pr() * 2)), 'bounce');
		} else if (t.piece === 'mound') {
			for (let z = 2; z <= 4; z++) for (let x = 2; x <= 4; x++) setCell(room, x0 + x, z0 + z, h + 0.35);
			setCell(room, x0 + MID, z0 + MID, h + 0.7);
		}
		// scatter: small decorations on plain flat floor (they block nothing)
		const n = Math.floor(pr() * 5);
		for (let k = 0; k < n; k++) {
			const x = 1 + Math.floor(pr() * 5), z = 1 + Math.floor(pr() * 5), i = at(x, z);
			if (room.cells[i] !== h || room.slopes.has(i) || room.water.has(i) || room.mats.has(i)) { pr(); pr(); pr(); pr(); continue; }
			room.scatter.push({ kind: ['grass', 'flower', 'pebble'][Math.floor(pr() * 3)], x: (x0 + x + 0.15 + pr() * 0.7) * CELL, z: (z0 + z + 0.15 + pr() * 0.7) * CELL, s: 0.7 + pr() * 0.6, y: h });
		}
	}
	const centre = (t) => [(cx0(t) + MID + 0.5) * CELL, t.level * LEVEL, (cz0(t) + MID + 0.5) * CELL];
	room.spawn = centre(tiles[start]); room.exit = centre(tiles[exit]);
	room.tiles = tiles.map((t) => ({ tx: t.tx, tz: t.tz, level: t.level, piece: t.piece, link: { ...t.link }, ridge: { ...t.ridge }, dist: t.dist, centre: centre(t) }));
	room.start = start; room.exitTile = exit; room.size = N;
	room.rimH = top; room.maxH = (P.levels - 1) * LEVEL;   // (the renderer: what is the rim, and how high the floor goes)
	return room;
}

// ---------------------------------------------------------------- rails
/** Rails for a finished level: lines through the air from high ground to lower ground, 20 to 44 m long, each end half a
 *  metre over the floor (a jump catches it), clear of the ground in between (arched over what is in the way). Seeded: the
 *  same level always has the same rails. -> [{ pts: [[x, y, z], …] }] */
export function railsFor(room, seed, want = null) {
	const r = rng(((seed >>> 0) ^ 0x5A17C0DE) * 2654435761 + 331), out = [], W = room.w, H = room.h;
	const n = want === null ? Math.max(1, Math.min(4, Math.round(W * H / 870))) : want;
	const flat = (cx, cz) => { if (cx < 2 || cz < 2 || cx >= W - 2 || cz >= H - 2) return false; const i = cz * W + cx; return !room.slopes.has(i) && !room.mats.has(i) && !room.water.has(i) && room.cells[i] < (room.rimH || 1e3); };
	const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
	for (let tries = 0; tries < 400 && out.length < n; tries++) {
		const ax = 2 + Math.floor(r() * (W - 4)), az = 2 + Math.floor(r() * (H - 4)), [dx, dz] = D8[Math.floor(r() * 8)], len = 10 + Math.floor(r() * 13);
		const bx = ax + dx * len, bz = az + dz * len;
		if (!flat(ax, az) || !flat(bx, bz)) continue;
		const ha = room.cells[az * W + ax], hb = room.cells[bz * W + bx];
		if (ha - hb < LEVEL - 1e-6 || ha - hb > 4 * LEVEL + 1e-6) continue;   // from high ground to lower: one to four levels down
		const A = [(ax + 0.5) * CELL, ha + 0.5, (az + 0.5) * CELL], B = [(bx + 0.5) * CELL, hb + 0.5, (bz + 0.5) * CELL];
		if (Math.hypot(A[0] - room.spawn[0], A[2] - room.spawn[2]) < 5 || Math.hypot(B[0] - room.spawn[0], B[2] - room.spawn[2]) < 5) continue;
		if (out.some((q) => { const p = q.pts[0], e = q.pts[q.pts.length - 1]; return Math.hypot(p[0] - A[0], p[2] - A[2]) < 8 || Math.hypot(e[0] - B[0], e[2] - B[2]) < 8; })) continue;
		const L = Math.hypot(B[0] - A[0], B[2] - A[2]), steps = Math.max(4, Math.round(L / 2));
		let pts = null;
		for (const arch of [0, 1.5, 3, 4.5]) {
			const line = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + arch * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
			let clear = true;
			for (let k = 1, m = Math.ceil(L * 5); k < m && clear; k++) { const t = k / m, p = line(t),   /* (every 20 cm: a cliff's corner is not stepped over) */ near = Math.min(t, 1 - t) * L; if (groundAt(room, p[0], p[2]) > p[1] - (near < 2.5 ? 0.3 : 1.1)) clear = false; }
			if (clear) { pts = []; for (let k = 0; k <= steps; k++) pts.push(line(k / steps).map((v) => Math.round(v * 100) / 100)); break; }
		}
		if (pts) out.push({ pts });
	}
	return out;
}

// ---------------------------------------------------------------- the check
/** Where you stand in a cell, at a point: the floor, or the float line in water too deep to stand in. */
function standAt(room, cx, cz, x, z) {
	const i = idx(room, cx, cz), s = room.slopes.get(i), base = room.cells[i];
	const g = !s ? base : base + s.rise * (s.ax === 'x' ? x / CELL - cx : z / CELL - cz);
	const w = room.water.get(i);
	return w !== undefined && w - g > K.SWIM_DEPTH ? w - K.SWIM_DEPTH : g;
}
/** The on-foot graph: from cell a you can step to its neighbour b if b's floor is no more than a step above a's where
 *  they meet (down any distance: a drop). No jumping. You are not a point: the floor is compared from a body's radius
 *  back in a to a body's radius on into b, whichever is worse, so a lip that leads straight onto a rising ramp counts
 *  as the climb it is. -> { can(a) -> [b…] } over cell indices. */
export function footGraph(room) {
	const W = room.w, H = room.h;
	const out = new Array(W * H);
	for (let cz = 0; cz < H; cz++) for (let cx = 0; cx < W; cx++) {
		const a = idx(room, cx, cz), list = out[a] = [];
		for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
			// the midpoint of the shared edge, nudged a hair into each cell
			const ex = (cx + 0.5 + dx * 0.5) * CELL, ez = (cz + 0.5 + dz * 0.5) * CELL, e = 1e-6;
			const R = K.RADIUS;
			const ha = Math.min(standAt(room, cx, cz, ex - dx * e, ez - dz * e), standAt(room, cx, cz, ex - dx * R, ez - dz * R));
			const hb = Math.max(standAt(room, nx, nz, ex + dx * e, ez + dz * e), standAt(room, nx, nz, ex + dx * R, ez + dz * R));
			if (hb - ha <= K.STEP + 1e-6) list.push(idx(room, nx, nz));
		}
	}
	return out;
}
/** Check a level. -> { ok, problems: [...], reach: cells reachable from the spawn, cells: W × H } */
export function validate(room) {
	const problems = [], W = room.w, cellOf = (p) => idx(room, Math.floor(p[0] / CELL), Math.floor(p[2] / CELL));
	const g = footGraph(room), spawn = cellOf(room.spawn);
	const flood = (from, edges) => { const seen = new Uint8Array(W * room.h); const q = [from]; seen[from] = 1; for (let k = 0; k < q.length; k++) for (const n of edges[q[k]]) if (!seen[n]) { seen[n] = 1; q.push(n); } return seen; };
	const back = new Array(g.length); for (let i = 0; i < g.length; i++) back[i] = [];
	for (let i = 0; i < g.length; i++) for (const n of g[i]) back[n].push(i);
	const reach = flood(spawn, g), home = flood(spawn, back);   // home[i]: from i you can get to the spawn
	let n = 0, traps = 0;
	for (let i = 0; i < reach.length; i++) if (reach[i]) { n++; if (!home[i]) traps++; }
	if (traps) problems.push(`${traps} cells you can reach on foot but not walk back from`);
	for (const t of room.tiles || []) if (!reach[cellOf(t.centre)]) problems.push(`tile ${t.tx},${t.tz} is not reachable on foot`);
	if (room.exit && !reach[cellOf(room.exit)]) problems.push('the exit is not reachable on foot');
	for (const [i, s] of room.slopes) if (Math.atan(Math.abs(s.rise) / CELL) * 180 / Math.PI > K.FLOOR_ANGLE) problems.push(`a slope too steep to stand on at cell ${i}`);
	for (let i = 0; i < room.cells.length; i++) if (!Number.isFinite(room.cells[i])) problems.push(`a hole at cell ${i}`);
	if (room.exit && room.spawn && Math.hypot(room.exit[0] - room.spawn[0], room.exit[2] - room.spawn[2]) < TS * CELL) problems.push('the exit is on top of the spawn');
	return { ok: problems.length === 0, problems, reach: n, cells: W * room.h };
}
/** The cells to walk through from the spawn to a point, on foot (no jumps). -> [[cx, cz], …] or null */
export function footPath(room, to) {
	const g = footGraph(room), W = room.w, from = idx(room, Math.floor(room.spawn[0] / CELL), Math.floor(room.spawn[2] / CELL)), goal = idx(room, Math.floor(to[0] / CELL), Math.floor(to[2] / CELL));
	const prev = new Int32Array(g.length).fill(-1), q = [from]; prev[from] = from;
	for (let k = 0; k < q.length && prev[goal] < 0; k++) for (const n of g[q[k]]) if (prev[n] < 0) { prev[n] = q[k]; q.push(n); }
	if (prev[goal] < 0) return null;
	const out = []; for (let i = goal; i !== from; i = prev[i]) out.push([i % W, Math.floor(i / W)]); out.push([from % W, Math.floor(from / W)]);
	return out.reverse();
}

/** A level's fingerprint (heights, slopes, surfaces, water, spawn, exit): the same seed must always give the same one. */
export function hashRoom(room) {
	let h = 0x811c9dc5;
	const add = (v) => { const n = Math.round(v * 1000) | 0; for (let k = 0; k < 4; k++) { h ^= (n >>> (k * 8)) & 255; h = Math.imul(h, 0x01000193) >>> 0; } };
	add(room.w); add(room.h);
	for (const v of room.cells) add(v >= 1e3 ? 9999 : v);
	for (const [i, s] of [...room.slopes].sort((a, b) => a[0] - b[0])) { add(i); add(s.ax === 'x' ? 1 : 2); add(s.rise); }
	for (const [i, m] of [...room.mats].sort((a, b) => a[0] - b[0])) { add(i); add(m.charCodeAt(0)); }
	for (const [i, w] of [...room.water].sort((a, b) => a[0] - b[0])) { add(i); add(w); }
	for (const v of [...room.spawn, ...(room.exit || [])]) add(v);
	return h.toString(16).padStart(8, '0');
}
