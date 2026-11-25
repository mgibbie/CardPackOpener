// terrain3d.js — Poketactica's board, drawn (owner, 2026-11-22: "improve the map graphics a lot. the pokemon themselves
// look perfect i just want the tiled terrain to look more detailed and intentional").
// A diorama: every tile's top is pixel art of what it is made of (engine/terrain.js GROUND: grass, tall grass, dirt, stone
// flagstones, sand, snow, ice, wood planks; water and lava animated), every cliff is textured per level (earth strata,
// rock blocks, sandstone, brick, basalt) with a lip of the ground above hanging over it, corners next to a wall are shaded
// (ambient occlusion), sides darken toward the bottom, drops are outlined, and the board stands on a plinth (an island map
// in its sea). Small props make it lived-in: tufts and flowers on grass, tall grass that hides feet, pebbles on dirt.
// All of it is drawn here, on a canvas, at 32 px a tile (nearest-filtered: crisp next to the Pokémon's pixel sprites);
// nothing is downloaded. Deterministic: the same map looks the same every time.
import * as THREE from 'three';

const PX = 32, ATLAS = 1024, COLS = ATLAS / PX;
const CELL = 2, LV = 1.0, PLINTH = 1.6, WATER_DROP = 0.3, LAVA_DROP = 0.15;
/** How far below its level a tile's surface lies (water and lava sit a little low: a figurine there wades). */
export const surfaceDrop = (kind) => (kind === 'water' ? WATER_DROP : kind === 'lava' ? LAVA_DROP : 0);

import { THEMES } from './themes.js';
export { THEMES };
const SIDE_OF = { grass: 'earth', tallgrass: 'earth', dirt: 'earth', stone: 'rock', sand: 'sandstone', snow: 'rock', ice: 'rock', wood: 'brick', water: 'rock', lava: 'basalt', blockfree: 'blockside', beacon: 'blockside0', mud: 'earth', caltrops: 'rock' };
// Maze Builder's blocks: four muted stones [top, light, dark, speckle a, speckle b, side a, side b, side c, side light, mortar]; a block wears one, by its number
const BLOCK_PAL = [
	['#5d6f8c', '#8698b6', '#39465c', '#586a86', '#637592', '#52637f', '#4b5c77', '#586a86', '#7486a4', '#2f3a4d'],   // slate
	['#7a6590', '#a591ba', '#4c3d5e', '#74608a', '#806b96', '#6b5880', '#635078', '#725e88', '#927fa8', '#3c304b'],   // heather
	['#8c8068', '#b6ab92', '#5a5140', '#857962', '#93876e', '#7b705a', '#736853', '#827660', '#a39880', '#463f31'],   // sandstone
	['#5f8478', '#8bb0a3', '#3b574e', '#5a7e72', '#658a7e', '#547469', '#4d6c61', '#5a7a6f', '#799d91', '#2f443d'],   // moss
];
export const BLOCK_LOOKS = BLOCK_PAL.length;
for (let n = 0; n < BLOCK_PAL.length; n++) SIDE_OF['block' + n] = 'blockside' + n;
// the lip each ground hangs over its cliff (null: none)
const LIP = { grass: ['#5ea24c', '#79c263', '#4b8a3e'], tallgrass: ['#4f9a45', '#6cbf5a', '#3d7f37'], snow: ['#eef4fa', '#ffffff', '#cddbea'], sand: ['#e3cf91', '#ecdba2', '#cdb877'], ice: ['#b9e4f2', '#e6f7fd', '#8cc8dd'] };

// ---------------------------------------------------------------- pixel painting
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
function painter(ctx, ox, oy) {
	return {
		px(x, y, c) { if (x < 0 || y < 0 || x >= PX || y >= PX) return; ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); },
		rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); },
		noise(base, alts, r, p = 0.35) { this.rect(0, 0, PX, PX, base); for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) if (r() < p) this.px(x, y, alts[Math.floor(r() * alts.length)]); },
		edge(c) { for (let i = 0; i < PX; i++) { this.px(PX - 1, i, c); this.px(i, PX - 1, c); } },   // the faint grid: right and bottom
	};
}
const TOPS = {
	grass(p, r, v) {
		p.noise('#6fb85a', ['#66ad52', '#79c263', '#69b154'], r, 0.45);
		for (let i = 0; i < 14; i++) { const x = Math.floor(r() * 30) + 1, y = Math.floor(r() * 28) + 3; p.px(x, y, '#4f9441'); p.px(x, y - 1, '#5ea24c'); p.px(x + (r() < 0.5 ? -1 : 1), y - 2, '#8fd677'); }
		if (v === 3) for (let i = 0; i < 3; i++) { const x = 4 + Math.floor(r() * 24), y = 4 + Math.floor(r() * 24), c = ['#ffe36e', '#ff8fb3', '#ffffff'][i % 3]; p.px(x, y, c); p.px(x + 1, y, c); p.px(x, y + 1, c); p.px(x + 1, y + 1, c); p.px(x, y, '#f5a623'); }
		p.edge('#5ea24c');
	},
	tallgrass(p, r) {
		p.noise('#4f9a45', ['#478f3e', '#58a64d'], r, 0.5);
		for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 32), y = Math.floor(r() * 32); p.px(x, y, '#3d7f37'); p.px(x - 1, y - 1, '#6cbf5a'); p.px(x + 1, y - 1, '#6cbf5a'); }
		p.edge('#3d7f37');
	},
	dirt(p, r) {
		p.noise('#a57a4f', ['#9a7048', '#b08657', '#a0764c'], r, 0.5);
		for (let i = 0; i < 7; i++) { const x = Math.floor(r() * 30), y = Math.floor(r() * 30); p.rect(x, y, 2, 2, r() < 0.5 ? '#c9a77a' : '#7d5a37'); p.px(x, y, '#d8b98d'); }
		p.edge('#8a6440');
	},
	// Tower Defense, Maze Builder: a laid block is one cut slab, slate blue, with a stud at each corner. (`blockfree`: laid
	// this round and not yet locked: paler, with a dashed rim, so what can still be taken back is plain to see.)
	block(p, r, v, free, n = 0) {
		const P = BLOCK_PAL[n], base = free ? '#8fa6c4' : P[0], hi = free ? '#c3d3ea' : P[1], lo = free ? '#5f7696' : P[2];
		p.noise(base, free ? ['#8aa1bf', '#96acc9'] : [P[3], P[4]], r, 0.3);
		for (let i = 0; i < 32; i++) { p.px(i, 0, hi); p.px(0, i, hi); p.px(i, 1, hi); p.px(1, i, hi); p.px(31, i, lo); p.px(i, 31, lo); p.px(30, i, lo); p.px(i, 30, lo); }
		for (let i = 4; i < 28; i++) { const on = !free || i % 4 < 2; if (on) { p.px(i, 4, lo); p.px(4, i, lo); p.px(i, 27, hi); p.px(27, i, hi); } }
		for (const [x, y] of [[7, 7], [23, 7], [7, 23], [23, 23]]) { p.rect(x, y, 2, 2, lo); p.px(x, y, hi); }
		if (v % 2 && !free) { let x = 12 + Math.floor(r() * 8), y = 9; for (let k = 0; k < 8; k++) { p.px(x, y, lo); y++; if (r() < 0.4) x += r() < 0.5 ? -1 : 1; } }
	},
	blockfree(p, r, v) { TOPS.block(p, r, v, true); },
	// (rules 17) a Beacon: the slab with a lit lamp set in it. Mud and Caltrops lie ON the way: open ground, marked.
	beacon(p, r, v) {
		TOPS.block(p, r, v, false, 0);
		p.rect(11, 11, 10, 10, '#b8862b'); p.rect(12, 12, 8, 8, '#ffd23c'); p.rect(14, 14, 4, 4, '#fff6c9');
		for (const [x, y] of [[15, 7], [15, 23], [7, 15], [23, 15]]) p.rect(x, y, 2, 2, '#ffe680');
	},
	mud(p, r) {
		p.noise('#6b4a2c', ['#5d3f25', '#775335', '#634428'], r, 0.55);
		for (let i = 0; i < 5; i++) { const x = 3 + Math.floor(r() * 22), y = 3 + Math.floor(r() * 24), w = 4 + Math.floor(r() * 5); p.rect(x, y, w, 2, '#4a321d'); p.rect(x + 1, y - 1, w - 2, 1, '#8a6440'); }
		p.edge('#4a321d');
	},
	caltrops(p, r) {
		p.noise('#8d8778', ['#817b6d', '#989282'], r, 0.4);
		for (let i = 0; i < 9; i++) { const x = 3 + (i % 3) * 10 + Math.floor(r() * 3), y = 3 + Math.floor(i / 3) * 10 + Math.floor(r() * 3); p.rect(x, y + 2, 5, 1, '#3f4650'); p.rect(x + 2, y, 1, 5, '#3f4650'); p.px(x + 2, y + 2, '#e6edf5'); p.px(x, y + 2, '#c3ccd6'); p.px(x + 4, y + 2, '#c3ccd6'); p.px(x + 2, y, '#c3ccd6'); p.px(x + 2, y + 4, '#c3ccd6'); }
		p.edge('#6d6558');
	},
	stone(p, r, v) {
		// one bevelled flagstone a tile: light on its top-left edge, the joint dark on its bottom-right; a crack or two, moss now and then
		const base = ['#9aa2a8', '#949ca2', '#a0a8ad', '#8f979d'][v % 4];
		p.noise(base, ['#929aa0', '#a2a9ae', '#979fa5'], r, 0.3);
		for (let i = 0; i < 32; i++) { p.px(i, 0, '#b9c0c5'); p.px(0, i, '#b4bbc0'); p.px(i, 1, '#acb3b8'); p.px(31, i, '#5f676d'); p.px(i, 31, '#5f676d'); p.px(30, i, '#7b838a'); p.px(i, 30, '#7b838a'); }
		if (v % 2) { let x = 8 + Math.floor(r() * 16), y = 5 + Math.floor(r() * 8); for (let k = 0; k < 9; k++) { p.px(x, y, '#7b838a'); y++; if (r() < 0.4) x += r() < 0.5 ? -1 : 1; } }
		if (v === 3) for (let i = 0; i < 18; i++) { const x = Math.floor(r() * 30) + 1, y = 22 + Math.floor(r() * 8); p.px(x, y, r() < 0.5 ? '#6f9a52' : '#5d8a45'); }
	},
	sand(p, r) {
		p.noise('#e3cf91', ['#d8c283', '#ecdba2', '#dccb8b'], r, 0.45);
		for (let row = 3; row < 32; row += 7) for (let x = 0; x < 32; x++) if ((x + row) % 5 < 3) p.px(x, row + (x % 7 === 0 ? 1 : 0), '#cdb877');
		if (r() < 0.5) { const x = 6 + Math.floor(r() * 20), y = 6 + Math.floor(r() * 20); p.px(x, y, '#ffffff'); p.px(x + 1, y, '#f3c6c6'); }
		p.edge('#d0bb80');
	},
	snow(p, r) {
		p.noise('#eef4fa', ['#e1eaf3', '#f6f9fc', '#e6eef6'], r, 0.4);
		for (let i = 0; i < 6; i++) p.px(Math.floor(r() * 32), Math.floor(r() * 32), '#ffffff');
		for (let i = 0; i < 10; i++) p.px(Math.floor(r() * 32), Math.floor(r() * 32), '#cddbea');
		p.edge('#d4e0ec');
	},
	ice(p, r) {
		p.noise('#b9e4f2', ['#b0dcec', '#c4ebf7'], r, 0.3);
		for (let k = 0; k < 3; k++) { const o = Math.floor(r() * 40) - 8; for (let i = 0; i < 10; i++) { p.px(o + i, i + 4 + k * 9, '#e6f7fd'); p.px(o + i + 1, i + 4 + k * 9, '#f4fcff'); } }
		let x = Math.floor(r() * 32), y = 0; for (let k = 0; k < 20; k++) { p.px(x, y, '#8cc8dd'); y += 2; x += Math.floor(r() * 3) - 1; }
		p.edge('#9fd3e5');
	},
	wood(p, r, v) {
		// two wide planks a tile, honey-coloured, with grain and the nails at their ends
		for (let row = 0; row < 2; row++) {
			const c = ['#c99558', '#c08b50', '#cf9c5f', '#bd884d'][(v + row) % 4], y0 = row * 16;
			p.rect(0, y0, 32, 16, c);
			for (let k = 0; k < 4; k++) { const gy = y0 + 3 + Math.floor(r() * 10); let x = 0; while (x < 32) { const run = 3 + Math.floor(r() * 8); for (let i = 0; i < run && x < 32; i++, x++) p.px(x, gy, '#b27d45'); x += 2 + Math.floor(r() * 4); } }
			for (let x = 0; x < 32; x++) { p.px(x, y0, '#dcae74'); p.px(x, y0 + 15, '#7e5530'); p.px(x, y0 + 14, '#a8743f'); }
			for (const nx of [2, 29]) { p.px(nx, y0 + 4, '#6b4a2b'); p.px(nx, y0 + 11, '#6b4a2b'); }
		}
		for (let y = 0; y < 32; y++) p.px(31, y, '#8a5e36');
	},
};
const SIDES = {
	earth(p, r) {
		p.noise('#8a6440', ['#81603d', '#946c45'], r, 0.4);
		for (const y of [9, 21]) for (let x = 0; x < 32; x++) if (r() < 0.8) p.px(x, y + (x % 9 === 0 ? 1 : 0), '#74532f');
		for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 29), y = Math.floor(r() * 29); p.rect(x, y, 3, 2, '#a07a52'); p.px(x, y, '#b48d62'); }
	},
	rock(p, r) {
		p.rect(0, 0, 32, 32, '#5f666c');
		for (let row = 0; row < 4; row++) { const off = row % 2 ? 8 : 0; for (let bx = -1; bx < 2; bx++) { const x = bx * 16 + off + 1; p.rect(x, row * 8 + 1, 14, 6, ['#7d858c', '#778087', '#838a91'][Math.floor(r() * 3)]); for (let i = 0; i < 14; i++) p.px(x + i, row * 8 + 1, '#9097a0'); } }
	},
	sandstone(p, r) {
		p.noise('#d1b276', ['#c8a96c', '#d9bb80'], r, 0.4);
		for (const y of [6, 13, 22, 28]) for (let x = 0; x < 32; x++) p.px(x, y + ((x >> 3) % 2), '#bf9e62');
	},
	blockside(p, r, n = 0) {
		// cut stone in two courses, the colour of the block's top
		const P = BLOCK_PAL[n];
		p.rect(0, 0, 32, 32, P[9]);
		for (let row = 0; row < 2; row++) { const off = row ? 8 : 0; for (let bx = -1; bx < 3; bx++) { const x = bx * 16 + off + 1, xa = Math.max(0, x), xb = Math.min(32, x + 14), c = [P[5], P[6], P[7]][Math.floor(r() * 3)]; if (xb > xa) p.rect(xa, row * 16 + 1, xb - xa, 14, c);   // (kept inside its own cell of the atlas)
			for (let i = 0; i < 14; i++) p.px(x + i, row * 16 + 1, P[8]); } }
	},
	brick(p, r) {
		p.rect(0, 0, 32, 32, '#6e3a26');
		for (let row = 0; row < 4; row++) { const off = row % 2 ? 8 : 0; for (let bx = -1; bx < 2; bx++) { const x = bx * 16 + off + 1; p.rect(x, row * 8 + 1, 14, 6, ['#9e5a3c', '#a6603f', '#955436'][Math.floor(r() * 3)]); for (let i = 0; i < 14; i++) p.px(x + i, row * 8 + 1, '#b87252'); } }
	},
	basalt(p, r) {
		p.noise('#4a4446', ['#433d3f', '#524b4d'], r, 0.45);
		for (let k = 0; k < 3; k++) { let x = Math.floor(r() * 32), y = 0; for (let i = 0; i < 16; i++) { p.px(x, y, '#2f2a2c'); y += 2; x += Math.floor(r() * 3) - 1; } }
	},
};
const PROPS = {
	tuft(p, r) { for (let k = 0; k < 7; k++) { const x = 6 + k * 3 + Math.floor(r() * 2), h = 8 + Math.floor(r() * 10); for (let y = 0; y < h; y++) p.px(x + (y > h * 0.6 ? (k % 2 ? 1 : -1) : 0), 31 - y, y > h - 3 ? '#8fd677' : y < 3 ? '#3d7f37' : '#5ea24c'); } },
	flower(p, r) { for (let y = 14; y < 32; y++) p.px(16, y, '#4b8a3e'); p.px(15, 22, '#5ea24c'); p.px(14, 21, '#5ea24c'); const c = ['#ffe36e', '#ff8fb3', '#b79cff', '#ffffff'][Math.floor(r() * 4)]; for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) p.px(16 + dx, 12 + dy, c); p.px(16, 12, '#f5a623'); },
	tall(p, r) { for (let k = 0; k < 9; k++) { const x = 2 + k * 3 + Math.floor(r() * 2), h = 18 + Math.floor(r() * 13); for (let y = 0; y < h; y++) p.px(x + Math.round(Math.sin(y / 5 + k) * 1.2), 31 - y, y > h - 4 ? '#6cbf5a' : y < 4 ? '#2f6a2b' : '#4f9a45'); } },
	pebble(p, r) { for (let k = 0; k < 3; k++) { const x = 4 + Math.floor(r() * 22), w = 3 + Math.floor(r() * 3); p.rect(x, 27, w, 3, '#8c8c8c'); p.rect(x + 1, 26, w - 2, 1, '#a8a8a8'); p.rect(x, 30, w, 1, '#5d5d5d'); } },
};
for (let n = 0; n < BLOCK_PAL.length; n++) { TOPS['block' + n] = (p, r, v) => TOPS.block(p, r, v, false, n); SIDES['blockside' + n] = (p, r) => SIDES.blockside(p, r, n); }
function animTex(draw, size = 64) {
	const c = document.createElement('canvas'); c.width = c.height = size;
	const g = c.getContext('2d'), r = rng(size * 7 + draw.length);
	draw(g, r, size);
	const t = new THREE.CanvasTexture(c);
	t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = false;
	return t;
}
const WATER = (g, r, n) => {
	g.fillStyle = '#3f8fd8'; g.fillRect(0, 0, n, n);
	for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? '#3a86cd' : '#4796df'; g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1); }
	for (let i = 0; i < 16; i++) { const x = Math.floor(r() * n), y = Math.floor(r() * n), w = 3 + Math.floor(r() * 5); g.fillStyle = '#5aa8ec'; g.fillRect(x, y, w, 1); g.fillStyle = '#bfe6ff'; g.fillRect(x + 1, y, Math.max(1, w - 3), 1); }
};
const LAVA = (g, r, n) => {
	g.fillStyle = '#e0481a'; g.fillRect(0, 0, n, n);
	for (let i = 0; i < 300; i++) { g.fillStyle = ['#ea5a1f', '#cc3d12', '#f26a24'][Math.floor(r() * 3)]; g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1); }
	for (let k = 0; k < 6; k++) { let x = Math.floor(r() * n), y = Math.floor(r() * n); for (let i = 0; i < 18; i++) { g.fillStyle = i % 3 ? '#ffb43a' : '#ffe27a'; g.fillRect(((x % n) + n) % n, ((y % n) + n) % n, 1, 1); x += Math.floor(r() * 3) - 1; y += 1; } }
	for (let k = 0; k < 7; k++) { const x = Math.floor(r() * n), y = Math.floor(r() * n), w = 4 + Math.floor(r() * 6); g.fillStyle = '#5a1c10'; g.fillRect(x, y, w, 3); g.fillStyle = '#7a2a16'; g.fillRect(x + 1, y, w - 2, 1); }
};

// ---------------------------------------------------------------- the atlas
function makeAtlas() {
	const canvas = document.createElement('canvas'); canvas.width = canvas.height = ATLAS;
	const ctx = canvas.getContext('2d');
	const cells = new Map();
	let next = 0;
	const cell = (key, paint) => {
		if (cells.has(key)) return cells.get(key);
		const i = next++, cx = (i % COLS) * PX, cy = Math.floor(i / COLS) * PX;
		paint(painter(ctx, cx, cy), rng(hash(i, key.length, 7)));
		const u0 = (cx + 0.02) / ATLAS, v0 = 1 - (cy + PX - 0.02) / ATLAS, u1 = (cx + PX - 0.02) / ATLAS, v1 = 1 - (cy + 0.02) / ATLAS;
		const out = { u0, v0, u1, v1 };
		cells.set(key, out);
		return out;
	};
	const tex = new THREE.CanvasTexture(canvas);
	tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
	return { cell, tex, ctx };
}

/** The ground at every tile: the map's own (`ground`), else its theme's. */
export function groundsOf(map) {
	const th = THEMES[map.theme] || THEMES.meadow, out = [];
	for (let i = 0; i < map.w * map.h; i++) out.push((map.ground && map.ground[i]) || th.ground);
	return out;
}

/**
 * The board. map: { w, h, height (levels, null = a gap), ground?, theme? }; opts.bases: [[x, y]] (kept clear of props);
 * opts.over: { tile index: ground kind } drawn in place of the map's own (the look only: Maze Builder's blocks).
 * -> { group (add to the scene), tick(seconds) (water and lava move), dispose() }
 */
export function buildBoard(map, opts = {}) {
	const th = THEMES[map.theme] || THEMES.meadow;
	const W = map.w, H = map.h, g = groundsOf(map);
	if (opts.over) for (const [i, k] of Object.entries(opts.over)) if (TOPS[k]) g[i] = k;
	const hAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : map.height[y * W + x]);
	const kindAt = (x, y) => g[y * W + x];
	const surf = (x, y) => { const h = hAt(x, y); if (h == null) return null; const k = kindAt(x, y); return h * LV - (k === 'water' ? WATER_DROP : k === 'lava' ? LAVA_DROP : 0); };
	const sideOf = (k) => /^block/.test(k) ? SIDE_OF[k] : ((th.side && !['water', 'lava'].includes(k) && k !== 'ice' ? (map.theme ? th.side : SIDE_OF[k]) : SIDE_OF[k]) || 'earth');
	const A = makeAtlas();
	const bases = new Set((opts.bases || []).map(([x, y]) => x + ',' + y));
	const solid = { pos: [], uv: [], col: [] }, water = { pos: [], uv: [], col: [] }, lava = { pos: [], uv: [], col: [] }, props = { pos: [], uv: [], col: [] };
	const quad = (m, a, b, c, d, uv, shade, rot = 0) => {
		const U = [[uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0]];
		const q = [a, b, c, d], s = Array.isArray(shade) ? shade : [shade, shade, shade, shade];
		for (const i of [0, 1, 2, 0, 2, 3]) { const p = q[i], t = U[(i + rot) % 4]; m.pos.push(p[0], p[1], p[2]); m.uv.push(t[0], t[1]); m.col.push(s[i], s[i], s[i]); }
	};
	const flowQuad = (m, a, b, c, d, shade) => {   // water / lava: world-space UVs, so the texture runs on across tiles
		for (const p of [a, b, c, a, c, d]) { m.pos.push(p[0], p[1], p[2]); m.uv.push(p[0] / (CELL * 2), p[2] / (CELL * 2)); m.col.push(shade, shade, shade); }
	};
	const maxH = Math.max(1, ...map.height.filter((h) => h != null));
	const lines = [];
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const h = hAt(x, y);
		if (h == null) continue;
		const k = kindAt(x, y), top = surf(x, y), x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL, z1 = z0 + CELL;
		// the top: its ground, a variant and a turn chosen from the tile (wood keeps its planks one way)
		const hh = hash(x, y, 1), lit = 0.9 + 0.12 * (h / maxH);
		// ambient occlusion: a corner beside higher ground is darker
		const higher = (dx, dy) => { const n = surf(x + dx, y + dy); return n != null && n > top + 0.2 ? 1 : 0; };
		const ao = (dx, dy) => lit * (1 - 0.13 * (higher(dx, 0) + higher(0, dy) + (higher(dx, 0) || higher(0, dy) ? 0 : higher(dx, dy))));
		const corners = [ao(-1, -1), ao(-1, 1), ao(1, 1), ao(1, -1)];
		if (k === 'water' || k === 'lava') flowQuad(k === 'water' ? water : lava, [x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0], lit);
		else {
			const v = k === 'grass' ? (hh % 7 === 0 ? 3 : hh % 3) : hh % 4;
			const uv = A.cell('top:' + k + ':' + v, (p, r) => TOPS[k](p, r, v));
			quad(solid, [x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0], uv, corners, k === 'wood' ? 0 : (hh >>> 8) % 4);
		}
		// the cliffs: wherever this tile stands above its neighbour (or the board's edge / a gap: down to the plinth)
		const sideK = sideOf(k);
		const wall = (ax, az, bx, bz, nx, ny, dirShade) => {
			const nTop = surf(nx, ny), bottom = nTop == null ? -PLINTH : nTop;
			if (top <= bottom + 0.01) return;
			if (nTop == null || top - nTop >= LV * 0.99) lines.push([ax, top + 0.005, az, bx, top + 0.005, bz]);
			// one textured segment per level, from the top down; the top one wears the ground's lip
			let yTop = top, seg = 0;
			while (yTop > bottom + 0.001) {
				const yBot = Math.max(bottom, yTop - LV);
				const lipped = seg === 0 && LIP[k];
				const uv = A.cell('side:' + sideK + ':' + (lipped ? 'lip-' + k : (hash(ax | 0, az | 0, seg) % 2)), (p, r) => { SIDES[sideK](p, r); if (lipped) { const [c, hi, lo] = LIP[k]; for (let px = 0; px < 32; px++) { const d = 3 + ((px * 7 + 3) % 5 === 0 ? 2 : (px % 3 === 0 ? 1 : 0)); for (let py = 0; py < d; py++) p.px(px, py, py === 0 ? hi : py === d - 1 ? lo : c); } } });
				const frac = (yTop - yBot) / LV;
				const sub = { u0: uv.u0, u1: uv.u1, v1: uv.v1, v0: uv.v1 - (uv.v1 - uv.v0) * frac };
				const shadeAt = (yy) => dirShade * 0.9 * (0.58 + 0.42 * Math.max(0, Math.min(1, (yy + PLINTH) / (maxH * LV + PLINTH))));
				quad(solid, [ax, yTop, az], [ax, yBot, az], [bx, yBot, bz], [bx, yTop, bz], { u0: sub.u0, v0: sub.v1, u1: sub.u1, v1: sub.v0 }, [shadeAt(yTop), shadeAt(yBot), shadeAt(yBot), shadeAt(yTop)]);
				yTop = yBot; seg++;
			}
		};
		wall(x0, z0, x1, z0, x, y - 1, 0.8);    // north
		wall(x1, z1, x0, z1, x, y + 1, 0.94);   // south
		wall(x0, z1, x0, z0, x - 1, y, 0.72);   // west
		wall(x1, z0, x1, z1, x + 1, y, 1.0);    // east
		// props: small things on the ground (none on a base, nor on water / lava / ice / wood)
		if (bases.has(x + ',' + y)) continue;
		const pr = rng(hash(x, y, 5)), dense = th.props || 1;
		const prop = (name, n, size) => {
			const uv = A.cell('prop:' + name + ':' + (hash(x, y, n) % 3), (p, r) => PROPS[name](p, r));
			for (let i = 0; i < n; i++) {
				const px = x0 + 0.3 + pr() * (CELL - 0.6), pz = z0 + 0.3 + pr() * (CELL - 0.6), s = size * (0.8 + pr() * 0.4), a = pr() * Math.PI;
				for (const turn of [0, Math.PI / 2]) {
					const dx = Math.cos(a + turn) * s / 2, dz = Math.sin(a + turn) * s / 2;
					quad(props, [px - dx, top + s, pz - dz], [px - dx, top, pz - dz], [px + dx, top, pz + dz], [px + dx, top + s, pz + dz], { u0: uv.u0, v0: uv.v1, u1: uv.u1, v1: uv.v0 }, [1, 0.8, 0.8, 1]);
				}
			}
		};
		if (k === 'grass') { const n = Math.floor(pr() * 3 * dense); if (n) prop('tuft', n, 0.5); if (pr() < 0.22 * dense) prop('flower', 1, 0.55); }
		else if (k === 'tallgrass') prop('tall', 5, 1.0);
		else if ((k === 'dirt' || k === 'stone' || k === 'sand') && pr() < 0.3) prop('pebble', 1, 0.45);
	}
	const group = new THREE.Group();
	const mk = (m, mat) => {
		if (!m.pos.length) return null;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
		geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
		const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; group.add(mesh); return mesh;
	};
	A.tex.needsUpdate = true;
	const pick = [];
	pick.push(mk(solid, new THREE.MeshBasicMaterial({ map: A.tex, vertexColors: true, side: THREE.DoubleSide })));
	mk(props, new THREE.MeshBasicMaterial({ map: A.tex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 }));
	const wTex = animTex(WATER), lTex = animTex(LAVA);
	const lavaMat = new THREE.MeshBasicMaterial({ map: lTex, vertexColors: true, side: THREE.DoubleSide });
	pick.push(mk(water, new THREE.MeshBasicMaterial({ map: wTex, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })));
	pick.push(mk(lava, lavaMat));
	// an island map stands in its sea; every map on its plinth's shadow
	if (th.sea || map.sea) {
		const sea = { pos: [], uv: [], col: [] }, m = 14 * CELL, y = -WATER_DROP - 0.35;
		flowQuad(sea, [-m, y, -m], [-m, y, H * CELL + m], [W * CELL + m, y, H * CELL + m], [W * CELL + m, y, -m], 0.86);
		mk(sea, new THREE.MeshBasicMaterial({ map: wTex, vertexColors: true, side: THREE.DoubleSide }));
	} else {
		const sc = document.createElement('canvas'); sc.width = sc.height = 64;
		const sg = sc.getContext('2d'), grad = sg.createRadialGradient(32, 32, 8, 32, 32, 32);
		grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
		sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
		const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL * 1.5, H * CELL * 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
		sh.rotation.x = -Math.PI / 2; sh.position.set(W * CELL / 2, -PLINTH - 0.02, H * CELL / 2); group.add(sh);
	}
	// the drops, outlined
	if (lines.length) {
		const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines.flat(), 3));
		group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x15201a, transparent: true, opacity: 0.45 })));
	}
	return {
		group,
		pick: pick.filter(Boolean),   // (what a tap on the board can land on: the ground, water and lava; not props, nor the sea)
		tick(t) { wTex.offset.set(t * 0.025, t * 0.017); lTex.offset.set(t * 0.008, -t * 0.006); lavaMat.color.setScalar(0.9 + 0.1 * Math.sin(t * 2.2)); },
		dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); },
	};
}
