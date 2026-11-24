// td/scenery.js — what stands round a Tower Defense board, as a plain layout (no drawing: scenery3d.js builds the mesh;
// the node tests read this). A map names its surround (`scenery`: woods, crags, lake). Laid out from the map's size alone
// (a hash of each spot): the same every time. Nothing here is part of play.
export const CELL = 2, PLINTH = 1.6, BG = [0x16 / 255, 0x24 / 255, 0x2a / 255];
export const REACH = 9, NEAR = 3;   // (cells out from the board: where the ground has faded away, and where the fade starts)
export const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export const rnd = (x, y, k) => hash(x, y, k) / 4294967296;
export const hex = (n) => [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lit = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

export const SCENERY = Object.freeze({
	woods: { ground: 0x4f8a3c, ground2: 0x3f7634, y: -PLINTH },
	crags: { ground: 0x6d6558, ground2: 0x585247, y: -PLINTH },
	lake: { ground: null, y: -0.62 },   // (an island map already stands in its sea: only what floats on it and rises from it)
});

/** How far (in cells) a spot is outside the board; 0 on or under it. */
export const outside = (cx, cz, W, H) => Math.hypot(Math.max(0, -cx, cx - W), Math.max(0, -cz, cz - H));

/** The things on the ground, as a plain list (also what the tests read): [{ k, x, z, s, d }] in cells; s a size 0..1, d cells out. */
export function sceneryProps(map, kind) {
	const W = map.w, H = map.h, out = [];
	if (!SCENERY[kind]) return out;
	for (let gz = -REACH; gz < H + REACH; gz++) for (let gx = -REACH; gx < W + REACH; gx++) {
		const x = gx + 0.2 + rnd(gx, gz, 11) * 0.6, z = gz + 0.2 + rnd(gx, gz, 12) * 0.6, d = outside(x, z, W, H);
		if (d < 1.2 || d > REACH - 1.5) continue;
		const r = rnd(gx, gz, 13), s = rnd(gx, gz, 14);
		if (kind === 'woods') { if (r < 0.24 && d > 1.8) out.push({ k: 'tree', x, z, s, d }); else if (r < 0.36) out.push({ k: 'bush', x, z, s, d }); else if (r < 0.52) out.push({ k: 'flower', x, z, s, d }); }
		else if (kind === 'crags') { if (r < 0.2 && d > 1.6) out.push({ k: 'crag', x, z, s, d }); else if (r < 0.38) out.push({ k: 'rock', x, z, s, d }); else if (r < 0.46) out.push({ k: 'shrub', x, z, s, d }); }
		else if (kind === 'lake') { if (r < 0.12) out.push({ k: 'pad', x, z, s, d }); else if (r < 0.19) out.push({ k: 'rock', x, z, s, d }); else if (r < 0.26) out.push({ k: 'reed', x, z, s, d }); }
	}
	return out;
}
/** How tall (world units, from the surround's ground) a thing may stand at d cells out and still hide no tile: the camera
 *  looks down at 0.62 rad, so a thing hides the ground behind it for its height ÷ tan(0.62); the plinth's drop is free. */
export const maxTall = (kind, d) => (SCENERY[kind].y < -1 ? PLINTH : 0.5) + Math.max(0, d - 0.6) * CELL * 0.7;
/** How tall each thing stands. */
export function tallOf(kind, p) {
	const cap = maxTall(kind, p.d);
	const want = p.k === 'tree' ? 2.6 + p.s * 1.8 : p.k === 'crag' ? 1.6 + p.s * 2.6 : p.k === 'bush' ? 0.6 + p.s * 0.4 : p.k === 'rock' ? 0.25 + p.s * 0.45 : p.k === 'shrub' ? 0.5 + p.s * 0.3 : p.k === 'reed' ? 0.7 + p.s * 0.5 : p.k === 'flower' ? 0.22 : 0.04;
	return Math.min(want, cap);
}

