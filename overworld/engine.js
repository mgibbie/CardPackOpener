// engine.js — Magepunk web-native overworld engine (Canvas2D, GBA 240x160).
// Faithful port of Magepunk66's Lua Map/Player system:
//   MapLoader.lua   -> tileset name mangling, palette bands, metatile split
//   MapRenderer.lua -> metatile draw (bottom/top/COVERED), borders, connections
//   MapCollision.lua-> grid collision bits, behaviors, ledges
//   Player.lua      -> grid movement @120px/s, 9-frame sprite, walk anim

import { metatileId } from './metatile_labels.js';
export const TILE = 8, META = 16;
// The logical view. 240x160 is the GBA window; portrait phones open the
// vertical view (main.js fitCanvas drives this through setViewSize). These are
// live ESM bindings, so every importer — the culling below, dialog/evolution
// boxes, the camera — reads the current size at draw time.
export let VIEW_W = 240, VIEW_H = 160;
export function setViewSize(w, h) { VIEW_W = w; VIEW_H = h; }

// Overworld Pokémon sprites (data/pokemon_ow/*.png — legendaries, awakenings, walk-up blockers) are
// authored at ~2× the intended overworld size (uniformly 40px tall). Every other actor is size-controlled
// (humans 16×32; the party follower downscales its 32px frame to 26), so drawing these 1:1 makes them
// render twice as big and overhang neighbouring tiles. This helper halves the sprite (preserving each
// mon's relative bulk) and anchors it bottom-centre (feet on the tile) — the shared draw for all three sites.
export function drawOwMon(ctx, img, cx, by, camX, camY) {
	const dw = Math.round(img.width / 2), dh = Math.round(img.height / 2);
	ctx.drawImage(img, Math.round(cx - dw / 2 - camX), Math.round(by - dh - camY), dw, dh);
}
const METATILE_MASK = 0x3FF, COLLISION_MASK = 0x0C00, BEHAVIOR_MASK = 0x1FF;
// A map-grid cell is one u16: metatile id | collision | elevation. The editor
// needs to take it apart and put it back together, so the layout is public.
export const GRID = { METATILE: METATILE_MASK, COLLISION: COLLISION_MASK, ELEVATION: 0xF000, ELEVATION_SHIFT: 12 };
// how many metatiles this tileset pair can address (palette size for the editor)
export const metatileCount = ts =>
	(ts?.primaryMetatileCount || 0) + (ts?.secondary?.metatiles?.length || 0);
const TILE_INDEX_MASK = 0x3FF, FLIP_X = 0x400, FLIP_Y = 0x800, PAL_MASK = 0xF000;
const LAYER_COVERED = 1;
const MB_TALL_GRASS = 0x02;
// Emerald's MB_LONG_GRASS — the waist-high grass on Routes 119/120. It is an
// encounter tile there just like MB_TALL_GRASS, but the engine only knew 0x02,
// so those two maps read as having NO grass at all and fell through to the
// grassless "cave" rule: encounters on every walkable tile of the route instead
// of only in the grass.
const MB_LONG_GRASS = 0x03;
const isGrassBehavior = b => b === MB_TALL_GRASS || b === MB_LONG_GRASS;
const MB_CRACKED_FLOOR = 0xD2;
const MB_JUMP = { right: 0x38, left: 0x39, up: 0x3A, down: 0x3B };

const DATA = 'data';

// ---------- fetch/image caches ----------
const jsonCache = new Map(), imgCache = new Map();
export async function getJSON(url) {
	if (!jsonCache.has(url)) {
		jsonCache.set(url, fetch(url).then(r => {
			if (!r.ok) throw new Error(`${r.status} ${url}`);
			return r.json();
		}).catch(e => { jsonCache.delete(url); throw e; }));
	}
	return jsonCache.get(url);
}
export function getImage(url) {
	if (!imgCache.has(url)) {
		imgCache.set(url, new Promise((res, rej) => {
			const img = new Image();
			img.crossOrigin = 'anonymous'; // data (sprites/tiles) is served cross-origin (magepunk-owdata project) — keep the canvas untainted
			img.onload = () => res(img);
			img.onerror = () => { imgCache.delete(url); rej(new Error('img ' + url)); };
			img.src = url;
		}));
	}
	return imgCache.get(url);
}

// ---------- tileset name mangling (MapLoader.getTilesetFileName) ----------
// gTileset_PetalburgWoods -> petalburg_woods, to match the exported asset names.
//
// The old rule put an underscore before EVERY capital, which breaks on a run of
// them: gTileset_SSAnne became s_s_anne while the exported file is ss_anne. The
// secondary tileset then 404'd, side() swallowed the failed image load, and the
// whole S.S. Anne interior rendered black with only sprites visible — no console
// error to go on. Reported from production, where it blocks the Kanto story.
//
// Now a standard camel->snake: split only where a run of capitals ENDS (the last
// capital before a lowercase starts the next word) or where a lowercase meets a
// capital. Checked against all 191 tilesets the layouts reference — 189 are
// byte-identical to the old rule, SSAnne is fixed, and the remaining one is a
// "NULL" placeholder that resolves to nothing either way.
function mangle(tilesetName) {
	let n = tilesetName.replace('gTileset_', '');
	n = n.replace(/([a-z0-9])([A-Z])/g, '$1_$2')      // Petalburg|Woods
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');   // SS|Anne
	n = n.replace(/([A-Za-z])(\d+)/g, '$1_$2');       // Route1 -> route_1
	return n.toLowerCase().replace(/^_/, '').replace(/__/g, '_');
}
const tilesetPng = (name, game) => `${DATA}/tilesets/${game === 'emerald' ? 'emerald_' : ''}${mangle(name)}_tiles.png`;
const metatileJson = (name, isPrimary, game) =>
	`${DATA}/tilesets/${game === 'emerald' ? 'emerald_' : ''}${isPrimary ? 'primary_' : 'secondary_'}${mangle(name)}_metatiles.json`;

// ---------- tileset bundle for one layout ----------
// { img, tilesPerBand, bandH } per primary/secondary + metatiles/attributes
async function loadTilesetsFor(layout) {
	const game = layout.game;
	const ts = { game };

	async function side(name, isPrimary) {
		if (!name) return null;
		// the PNG and its metatile JSON don't depend on each other — fetch both at
		// once (each request also pays the _redirects hop, so serial hops add up)
		const [img, meta] = await Promise.all([
			getImage(tilesetPng(name, game)).catch(() => null),
			getJSON(metatileJson(name, isPrimary, game)).catch(() => null), // some primaries have none
		]);
		if (!img) return null;
		const bandH = img.height / 16;                       // 16 palette bands
		const tilesPerBand = (bandH / TILE) * (img.width / TILE);
		return { img, bandH, tilesPerBand, metatiles: meta?.metatiles || null, attributes: meta?.attributes || null };
	}

	// primary and secondary are independent too
	[ts.primary, ts.secondary] = await Promise.all([
		side(layout.primary_tileset, true),
		side(layout.secondary_tileset, false),
	]);
	// split threshold = primary tile capacity (NOT #primaryMetatiles) — MapShared invariant
	ts.primaryTileCount = ts.primary ? ts.primary.tilesPerBand : 640;
	ts.primaryMetatileCount = ts.primaryTileCount;
	await applySharedPalettes(ts, layout);
	return ts;
}

// ---------- shared BG palettes ----------
// Each sheet's 16 bands are coloured with that tileset's OWN palettes, but the GBA
// shares BG palettes: primary supplies 0..N-1, secondary N..12 (Emerald N=6, FRLG 7).
// A primary tile drawn with palette 11 must use the SECONDARY's 11 (General's own 11
// is all zeros — Route 115's Fallarbor terrain came out opaque black), and a
// secondary tile drawn with 0..N-1 uses the primary's. Repaint those bands per pair
// from tools/gen_tile_palettes.py's colour indices.
const NUM_PALS_IN_PRIMARY = { emerald: 6, firered: 7 }, NUM_PALS_TOTAL = 13;
const palStem = (name, game) => `${game === 'emerald' ? 'emerald_' : ''}${mangle(name)}`;
let palIndex = null;
function tilePalettes(name, game) {
	palIndex ||= getJSON(`${DATA}/tilesets/pal_index.json`).then(a => new Set(a)).catch(() => new Set());
	return palIndex.then(have => have.has(palStem(name, game))
		? getJSON(`${DATA}/tilesets/${palStem(name, game)}_pal.json`).catch(() => null) : null);
}
function repaintBands(img, own, other, from, to) {
	const { w, h } = own;
	if (img.width !== w || img.height !== h * 16) return img;
	const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
	const g = c.getContext('2d');
	g.drawImage(img, 0, 0);
	const raw = atob(own.idx), band = g.createImageData(w, h), d = band.data;
	for (let b = from; b < to; b++) {
		const rgb = other.pals[b].map(hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)));
		for (let i = 0; i < w * h; i++) {
			const byte = raw.charCodeAt(i >> 1), v = i & 1 ? byte & 15 : byte >> 4, o = i * 4;
			if (v) { const col = rgb[v]; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
			else d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;   // colour 0 is transparent
		}
		g.clearRect(0, b * h, w, h);
		g.putImageData(band, 0, b * h);
	}
	return c;
}
const pairCache = new Map();   // "game|primary|secondary" -> { primary, secondary } repainted sheets
async function applySharedPalettes(ts, layout) {
	const game = layout.game, n = NUM_PALS_IN_PRIMARY[game];
	if (!n || !ts.primary || !ts.secondary) return;
	const key = `${game}|${layout.primary_tileset}|${layout.secondary_tileset}`;
	if (!pairCache.has(key)) {
		pairCache.set(key, Promise.all([tilePalettes(layout.primary_tileset, game), tilePalettes(layout.secondary_tileset, game)])
			.then(([p, s]) => p && s ? {
				primary: repaintBands(ts.primary.img, p, s, n, NUM_PALS_TOTAL),
				secondary: repaintBands(ts.secondary.img, s, p, 0, n),
			} : null));
		if (pairCache.size > 8) pairCache.delete(pairCache.keys().next().value);
	}
	const sheets = await pairCache.get(key);
	if (sheets) { ts.primary.img = sheets.primary; ts.secondary.img = sheets.secondary; }
}

function metatileOf(ts, metatileId) {
	const index = metatileId & METATILE_MASK;
	if (index >= ts.primaryMetatileCount) {
		const si = index - ts.primaryMetatileCount;
		const m = ts.secondary?.metatiles;
		return m && si < m.length ? { tiles: m[si], attr: ts.secondary.attributes?.[si] ?? 0 } : { tiles: null, attr: 0 };
	}
	const m = ts.primary?.metatiles;
	return m && index < m.length ? { tiles: m[index], attr: ts.primary.attributes?.[index] ?? 0 } : { tiles: null, attr: 0 };
}
const layerTypeOf = attr => (attr & 0x60000000) >>> 29;

// ---------- tile drawing ----------
function drawTileTo(ctx, ts, tileId, dx, dy) {
	if (!tileId) return;
	const index = tileId & TILE_INDEX_MASK;
	const fx = (tileId & FLIP_X) !== 0, fy = (tileId & FLIP_Y) !== 0;
	const pal = (tileId & PAL_MASK) >> 12;

	let side, local;
	if (index < ts.primaryTileCount) { side = ts.primary; local = index; }
	else {
		side = ts.secondary;
		if (!side) return;
		local = index - ts.primaryTileCount;
		const cap = side.tilesPerBand;
		if (cap > 0) local %= cap;
	}
	if (!side) return;
	const perRow = side.img.width / TILE;
	const sx = (local % perRow) * TILE;
	const sy = pal * side.bandH + Math.floor(local / perRow) * TILE;

	if (fx || fy) {
		ctx.save();
		ctx.translate(dx + (fx ? TILE : 0), dy + (fy ? TILE : 0));
		ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
		ctx.drawImage(side.img, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
		ctx.restore();
	} else {
		ctx.drawImage(side.img, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
	}
}

// draw one metatile's bottom or top tiles (COVERED: top tiles go to bottom pass)
export function drawMetatileTo(ctxBottom, ctxTop, ts, metatileId, dx, dy) {
	const { tiles, attr } = metatileOf(ts, metatileId);
	if (!tiles) return;
	const covered = layerTypeOf(attr) === LAYER_COVERED;
	for (let i = 0; i < 4; i++) {
		drawTileTo(ctxBottom, ts, tiles[i], dx + (i % 2) * TILE, dy + ((i / 2) | 0) * TILE);
	}
	const topCtx = covered ? ctxBottom : ctxTop;
	for (let i = 4; i < 8; i++) {
		drawTileTo(topCtx, ts, tiles[i], dx + ((i - 4) % 2) * TILE, dy + (((i - 4) / 2) | 0) * TILE);
	}
}

// ---------- map section: pre-rendered bottom/top canvases ----------
function renderSection(layout, ts) {
	const w = layout.width * META, h = layout.height * META;
	const bottom = document.createElement('canvas'); bottom.width = w; bottom.height = h;
	const top = document.createElement('canvas'); top.width = w; top.height = h;
	const cb = bottom.getContext('2d'), ct = top.getContext('2d');
	for (let row = 0; row < layout.height; row++) {
		const r = layout.map[row];
		if (!r) continue;
		for (let col = 0; col < layout.width; col++) {
			const v = r[col];
			if (v != null) drawMetatileTo(cb, ct, ts, v & METATILE_MASK, col * META, row * META);
		}
	}
	return { bottom, top };
}

// pre-rendered border pattern tile (bw x bh metatiles), bottom+top
function renderBorder(layout, ts) {
	if (!layout.border) return null;
	const bw = layout.border_width > 0 ? layout.border_width : 2;
	const bh = layout.border_height > 0 ? layout.border_height : 2;
	const bottom = document.createElement('canvas'); bottom.width = bw * META; bottom.height = bh * META;
	const top = document.createElement('canvas'); top.width = bw * META; top.height = bh * META;
	const cb = bottom.getContext('2d'), ct = top.getContext('2d');
	for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
		const v = layout.border[y]?.[x];
		if (v != null) drawMetatileTo(cb, ct, ts, v & METATILE_MASK, x * META, y * META);
	}
	return { bottom, top, bw, bh };
}

// ---------- world ----------
const DIR_OFFSET = (dir, cur, conn) => {
	if (dir === 'up') return [conn.offset, -conn.layout.height];
	if (dir === 'down') return [conn.offset, cur.height];
	if (dir === 'left') return [-conn.layout.width, conn.offset];
	return [cur.width, conn.offset]; // right
};
const normDir = d => ({ north: 'up', south: 'down', east: 'right', west: 'left' })[d] || d;

export class World {
	constructor() {
		this.index = null;
		this.current = null;    // { map, layout, ts, canvases, border }
		// [{ dir, map, layout, ts, canvases, offset, name }] — a LIST, not keyed by
		// direction: a map can have two connections on one side (Route 111's west edge
		// meets Route 113 at offset 0 AND Route 112 at offset 20)
		this.connections = [];
		this.warps = [];
		this.lastWarpSource = null; // for Crystal -1 back-warps
		// fully-fetched-and-rendered bundles by map name (LRU). Crossing a route
		// edge used to refetch + re-render the very map you were just standing on
		// (a multi-second frozen screen on phones); with this, walking back and
		// forth between maps is instant after the first visit.
		this._rendered = new Map();
	}

	async init() {
		this.index = await getJSON(`${DATA}/map_index.json`);
	}

	// Some ported warps name their destination without the MAP_ prefix
	// (VERMILION_PORT rather than MAP_VERMILION_PORT), which used to read as an
	// unknown map and silently cancel the warp — that is what stranded the Fast
	// Ship gangways and Ecruteak's closed-gym bounce. Accept either spelling.
	fileFor(mapId) {
		if (typeof mapId !== 'string') return null;
		return this.index[mapId] || this.index['MAP_' + mapId] || null;
	}

	async loadBundle(name) {
		const map = await getJSON(`${DATA}/maps/${name}_map.json`);
		const layout = await getJSON(`${DATA}/layouts/${map.layout}.json`);
		const ts = await loadTilesetsFor(layout);
		return { name, map, layout, ts };
	}

	// fetch + render one map, through the LRU cache (8 maps ≈ the current map,
	// its neighbours, and where you just came from; canvases are read-only so
	// sharing them between `current` and `connections` entries is safe)
	async _renderedBundle(name) {
		let b = this._rendered.get(name);
		if (b) {
			this._rendered.delete(name); // refresh recency
		} else {
			b = await this.loadBundle(name);
			b.canvases = renderSection(b.layout, b.ts);
			b.borderCv = renderBorder(b.layout, b.ts);
		}
		this._rendered.set(name, b);
		while (this._rendered.size > 8) this._rendered.delete(this._rendered.keys().next().value);
		return b;
	}

	async load(name) {
		const b = await this._renderedBundle(name);
		this.current = b;
		this.warps = (b.map.warp_events || []).map(w => ({ ...w, x: +w.x, y: +w.y }));
		// Keyed by direction, this kept ONE connection per side, and the two on
		// Route 111's west edge loaded concurrently: whichever finished last
		// overwrote the other. When Route 113 won, Route 112 could not be entered
		// from Route 111 at all (the playtester's hard block on the Hoenn story);
		// when Route 112 won, Route 113 was cut off instead. Keep every one, in
		// the map's own order.
		this.connections = [];   // the previous map's must not outlive its layout while these load
		const conns = (b.map.connections || []).filter(c => ['up', 'down', 'left', 'right', 'north', 'south', 'east', 'west'].includes(c.direction));
		const loaded = await Promise.all(conns.map(async c => {
			const file = this.fileFor(c.map);
			if (!file) return null;
			try {
				const cb = await this._renderedBundle(file);
				return { ...cb, dir: normDir(c.direction), offset: c.offset || 0 };
			} catch (e) { console.warn('connection failed', c.map, e); return null; }
		}));
		this.connections = loaded.filter(Boolean);
	}

	// world-tile -> grid value (main map or connections); 0 = outside
	gridAt(tx, ty) {
		const lay = this.current.layout;
		if (tx >= 0 && tx < lay.width && ty >= 0 && ty < lay.height) {
			return lay.map[ty]?.[tx] ?? 0;
		}
		for (const conn of this.connections) {
			const dir = conn.dir;
			const [ox, oy] = DIR_OFFSET(dir, lay, conn);
			const lx = tx - ox, ly = ty - oy;
			if (lx >= 0 && lx < conn.layout.width && ly >= 0 && ly < conn.layout.height) {
				return conn.layout.map[ly]?.[lx] ?? 0;
			}
		}
		return 0;
	}

	// which connection (if any) contains this world tile; returns {dir, conn, lx, ly}
	connectionAt(tx, ty) {
		const lay = this.current.layout;
		for (const conn of this.connections) {
			const dir = conn.dir;
			const [ox, oy] = DIR_OFFSET(dir, lay, conn);
			const lx = tx - ox, ly = ty - oy;
			if (lx >= 0 && lx < conn.layout.width && ly >= 0 && ly < conn.layout.height) {
				return { dir, conn, lx, ly };
			}
		}
		return null;
	}

	warpAt(tx, ty) {
		return this.warps.find(w => w.x === tx && w.y === ty) || null;
	}

	isPassable(tx, ty) {
		if (this.warpAt(tx, ty)) return true; // doors are always enterable
		const v = this.gridAt(tx, ty);
		if (v === 0) return false;
		return (v & COLLISION_MASK) === 0;
	}

	// live tile edit (the decomp `setmetatile` op): swap the metatile at (tx,ty) on
	// the CURRENT section and repaint just that cell into the cached bottom/top
	// canvases so plot scenes can open a passage / drop an object mid-cutscene.
	// impassable toggles the collision bits; pass null to keep the tile's current
	// passability. Returns true if a tile was changed.
	setMetatile(tx, ty, tile, impassable) {
		const cur = this.current;
		const lay = cur?.layout;
		if (!lay || tx < 0 || ty < 0 || tx >= lay.width || ty >= lay.height) return false;
		if (!lay.map[ty]) return false;
		// The scripts name tiles the decomp way ("METATILE_VermilionGym_Floor").
		// `tile & METATILE_MASK` on a string is 0, the "outside the map" metatile, so
		// every scripted tile edit used to wall the tile off (the Vermilion Gym beams
		// stayed shut after both switches; 1,098 ops across 95 maps). Resolve the
		// name; if it can't be resolved, leave the tile alone rather than write void.
		if (typeof tile === 'string') {
			const id = metatileId(tile, cur.name);
			if (id == null) { console.warn('[setmetatile] unknown tile name', tile, 'on', cur.name); return false; }
			tile = id;
		}
		const prev = lay.map[ty][tx] ?? 0;
		let v = tile & METATILE_MASK;
		if (impassable == null) v |= (prev & COLLISION_MASK); // keep existing collision
		else if (impassable) v |= COLLISION_MASK;
		lay.map[ty][tx] = v;
		// repaint the single cell: clear the old pixels, redraw the new metatile
		const cb = cur.canvases?.bottom?.getContext('2d');
		const ct = cur.canvases?.top?.getContext('2d');
		if (cb && ct) {
			const dx = tx * META, dy = ty * META;
			cb.clearRect(dx, dy, META, META);
			ct.clearRect(dx, dy, META, META);
			drawMetatileTo(cb, ct, cur.ts, v & METATILE_MASK, dx, dy);
		}
		return true;
	}

	// Raw grid write, for the map editor. setMetatile() above masks its argument
	// down to a metatile id plus a pass/block flag, which silently drops the
	// elevation nibble — fine for a cutscene opening a door, wrong for an editor
	// that owns the whole u16 (metatile 0x03FF | collision 0x0C00 | elevation
	// 0xF000). Repaints the one cell, same as setMetatile.
	setGridValue(tx, ty, value) {
		const cur = this.current;
		const lay = cur?.layout;
		if (!lay || tx < 0 || ty < 0 || tx >= lay.width || ty >= lay.height) return false;
		if (!lay.map[ty]) return false;
		lay.map[ty][tx] = value & 0xFFFF;
		const cb = cur.canvases?.bottom?.getContext('2d');
		const ct = cur.canvases?.top?.getContext('2d');
		if (cb && ct) {
			const dx = tx * META, dy = ty * META;
			cb.clearRect(dx, dy, META, META);
			ct.clearRect(dx, dy, META, META);
			drawMetatileTo(cb, ct, cur.ts, value & METATILE_MASK, dx, dy);
		}
		return true;
	}

	behaviorAt(tx, ty) {
		const v = this.gridAt(tx, ty);
		if (v === 0) return 0;
		const id = v & METATILE_MASK;
		// behavior must come from the owning section's tilesets
		const owner = this.connectionAt(tx, ty)?.conn || this.current;
		const { attr } = metatileOf(owner.ts, id);
		return attr & BEHAVIOR_MASK;
	}

	isLedge(tx, ty, dir) { return this.behaviorAt(tx, ty) === MB_JUMP[dir]; }
	isTallGrass(tx, ty) { return isGrassBehavior(this.behaviorAt(tx, ty)); }
	// Does THIS map have any grass to encounter in? Caves and interiors have none
	// — their land table is meant to fire on the floor itself (gen 3 does the
	// same). Encounters.roll uses this to decide which rule applies, so it must
	// describe the current map only: cached per load, never across maps.
	hasTallGrass() {
		const cur = this.current;
		if (cur._hasGrass == null) {
			const lay = cur.layout;
			let found = false;
			for (let y = 0; y < lay.height && !found; y++) {
				for (let x = 0; x < lay.width; x++) {
					const v = lay.map[y]?.[x] ?? 0;
					if (v === 0) continue;
					const { attr } = metatileOf(cur.ts, v & METATILE_MASK);
					if (isGrassBehavior(attr & BEHAVIOR_MASK)) { found = true; break; }
				}
			}
			cur._hasGrass = found;
		}
		return cur._hasGrass;
	}
	isCrackedFloor(tx, ty) { return this.behaviorAt(tx, ty) === MB_CRACKED_FLOOR; }
	// a map whose sea can be dived into (offers a 'dive' overlay); its deep water
	// gets a distinct tint so DIVE spots are readable
	isDiveMap() { return (this.current.map.connections || []).some(c => c.direction === 'dive'); }

	// surfable water: the 0x10-0x1B "sea/pond/river" behavior band. These
	// tiles block walking (you need a Water-type to Surf) but are open once
	// you're riding the waves.
	isSurfable(tx, ty) {
		if (this.gridAt(tx, ty) === 0) return false;
		const b = this.behaviorAt(tx, ty);
		return b >= 0x10 && b <= 0x1B;
	}

	// draw one layer ('bottom'|'top') of world around camera
	drawLayer(ctx, layer, camX, camY) {
		const lay = this.current.layout;
		// border fill (pattern or black void)
		const b = this.current.borderCv;
		const startX = Math.floor(camX / META) - 1, startY = Math.floor(camY / META) - 1;
		const endX = startX + Math.ceil(VIEW_W / META) + 2, endY = startY + Math.ceil(VIEW_H / META) + 2;
		for (let ty = startY; ty <= endY; ty++) {
			for (let tx = startX; tx <= endX; tx++) {
				const inside = (tx >= 0 && tx < lay.width && ty >= 0 && ty < lay.height) || this.connectionAt(tx, ty);
				if (inside) continue;
				const dx = tx * META - camX, dy = ty * META - camY;
				if (b) {
					let bx = tx % b.bw; if (bx < 0) bx += b.bw;
					let by = ty % b.bh; if (by < 0) by += b.bh;
					ctx.drawImage(layer === 'bottom' ? b.bottom : b.top, bx * META, by * META, META, META, dx, dy, META, META);
				} else if (layer === 'bottom') {
					ctx.fillStyle = '#000';
					ctx.fillRect(dx, dy, META, META);
				}
			}
		}
		// main map — blit only the visible 240x160 window instead of submitting the
		// whole (possibly 640x1920+) map canvas and letting the driver clip it;
		// with 4 connections that was up to 10 full-size texture binds per frame
		const cv = layer === 'bottom' ? this.current.canvases.bottom : this.current.canvases.top;
		blitVisible(ctx, cv, -camX, -camY);
		// deep water you can DIVE beneath reads a touch darker + shimmers, so the
		// dive-able sea is visually distinct from ordinary water (see isDiveMap)
		if (layer === 'bottom' && this.isDiveMap()) {
			const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
			for (let ty = startY; ty <= endY; ty++) {
				for (let tx = startX; tx <= endX; tx++) {
					if (tx < 0 || ty < 0 || tx >= lay.width || ty >= lay.height) continue;
					if (!this.isSurfable(tx, ty)) continue;
					// quantized alpha from a lookup table: the old per-tile template
					// literal parsed ~200 fresh fillStyle strings every frame
					const a = 0.15 + 0.035 * Math.sin(t * 1.3 + (tx + ty) * 0.35);
					ctx.fillStyle = DIVE_TINTS[Math.max(0, Math.min(DIVE_TINTS.length - 1, Math.round((a - 0.115) / 0.07 * (DIVE_TINTS.length - 1))))];
					ctx.fillRect(tx * META - camX, ty * META - camY, META, META);
				}
			}
		}
		// connections
		for (const conn of this.connections) {
			const dir = conn.dir;
			const [ox, oy] = DIR_OFFSET(dir, lay, conn);
			const ccv = layer === 'bottom' ? conn.canvases.bottom : conn.canvases.top;
			blitVisible(ctx, ccv, ox * META - camX, oy * META - camY);
		}
	}
}

// draw only the part of `cv` that overlaps the 240x160 viewport (cv's top-left
// sits at screen-space offX/offY)
const DIVE_TINTS = Array.from({ length: 13 }, (_, i) => `rgba(6, 22, 66, ${(0.115 + i * 0.07 / 12).toFixed(3)})`);
function blitVisible(ctx, cv, offX, offY) {
	const sx = Math.max(0, -offX), sy = Math.max(0, -offY);
	const dx = Math.max(0, offX), dy = Math.max(0, offY);
	const w = Math.min(cv.width - sx, VIEW_W - dx), h = Math.min(cv.height - sy, VIEW_H - dy);
	if (w > 0 && h > 0) ctx.drawImage(cv, sx, sy, w, h, dx, dy, w, h);
}

// ---------- player ----------
const SPEED = 120; // px/s
const FRAMES = { DOWN_STILL: 0, UP_STILL: 1, LEFT_STILL: 2, DOWN_W1: 3, DOWN_W2: 4, UP_W1: 5, UP_W2: 6, LEFT_W1: 7, LEFT_W2: 8 };
const STILL = { down: FRAMES.DOWN_STILL, up: FRAMES.UP_STILL, left: FRAMES.LEFT_STILL, right: FRAMES.LEFT_STILL };
const WALKS = { down: [FRAMES.DOWN_W1, FRAMES.DOWN_W2], up: [FRAMES.UP_W1, FRAMES.UP_W2], left: [FRAMES.LEFT_W1, FRAMES.LEFT_W2], right: [FRAMES.LEFT_W1, FRAMES.LEFT_W2] };
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const JUMP_Y = [0, -2, -4, -6, -8, -9, -10, -10, -10, -9, -8, -7, -6, -4, -2, 0];

export class Player {
	constructor(world) {
		this.world = world;
		this.img = null;
		this.tx = 0; this.ty = 0;          // grid position (tiles)
		this.px = 0; this.py = 0;          // pixel position (top-left of tile)
		this.facing = 'down';
		this.moving = false;
		this.jumping = false;
		this.moveFrom = null; this.moveTo = null; this.moveT = 0; this.moveDist = META;
		this.moveOutcome = null;   // why the last step attempt did/didn't start
		this.canStep = null;       // set by main.js: may a NEW step begin right now?
		this.animT = 0; this.stepParity = 0;
		this.surfing = false; this.biking = false;
	}

	async init() {
		this.img = await getImage(`${DATA}/sprites/red_normal.png`);
		// the real ride sheets (decomp, same 9-frame layout as the walk sheet):
		// wired in draw() so biking and surfing show a proper mount instead of a
		// speed change and a plain blue ellipse. Best-effort — a missing sheet
		// falls back to the walk sprite (+ the drawn ellipse for surf).
		this.bikeImg = await getImage(`${DATA}/people/red_bike.png`).catch(() => null);
		this.surfImg = await getImage(`${DATA}/people/red_surf.png`).catch(() => null);
	}

	setTile(tx, ty) {
		this.tx = tx; this.ty = ty;
		this.px = tx * META; this.py = ty * META;
		this.moving = false; this.jumping = false;
		// Landing on water means you are surfing, whatever you were doing before.
		// Johto and JohKanto shipped with no water behaviors at all, so their sea
		// routes were walkable floor; a save from before that fix can restore onto
		// open ocean, and without this the player is frozen there — every direction
		// out is water, and you cannot walk onto water.
		if (this.world?.isSurfable?.(tx, ty)) this.surfing = true;
	}

	// Why the last attempted step did or did not start. A refusal that reports
	// nothing is indistinguishable from "no input arrived", which is exactly how a
	// frozen player can look healthy from outside: `moveOutcome` makes the
	// distinction observable (see gateReport/WATCHDOG 3 in main.js).
	tryMove(dir) {
		if (this.moving) { this.moveOutcome = 'busy'; return; }
		this.facing = dir;
		const [dx, dy] = DIRS[dir];
		const nx = this.tx + dx, ny = this.ty + dy;
		// ledge hop: entered tile OR current tile has a matching JUMP behavior; land 2 tiles out
		const hop = this.world.isLedge(nx, ny, dir) || this.world.isLedge(this.tx, this.ty, dir);
		if (hop) {
			const lx = this.tx + dx * 2, ly = this.ty + dy * 2;
			if (this.world.isPassable(lx, ly) && !(this.blocked && this.blocked(lx, ly))) {
				this.beginMove(lx, ly, META * 2, true);
				this.moveOutcome = 'hop';
				this.onHop?.();
				return;
			}
		}
		// while surfing, water is open sea; stepping ashore ends the ride
		const open = this.surfing
			? (this.world.isSurfable(nx, ny) || this.world.isPassable(nx, ny))
			: this.world.isPassable(nx, ny) && !this.world.isSurfable(nx, ny);
		if (!open) { this.moveOutcome = 'bump'; this.onBump?.(nx, ny); return; }   // walls thud too, not just blockers
		// Sky Pillar's cracked floors give way underfoot — only the bike carries you
		// across (they read as normal floor otherwise, so gate them explicitly)
		if (this.world.isCrackedFloor(nx, ny) && !this.biking) { this.moveOutcome = 'cracked'; this.onBlockedCracked?.(); return; }
		if (this.blocked && this.blocked(nx, ny)) {
			// a Strength boulder in the way may be shoved one tile ahead; if it
			// moves, the player steps into the vacated tile
			if (this.pushBoulder && this.pushBoulder(nx, ny, dx, dy)) {
				this.beginMove(nx, ny, META, false);
				this.moveOutcome = 'push';
				return;
			}
			this.moveOutcome = 'blocked';
			this.onBump?.(nx, ny);
			return;
		}
		this.beginMove(nx, ny, META, false);
		this.moveOutcome = 'moved';
	}

	beginMove(nx, ny, dist, jump) {
		this.moveFrom = [this.px, this.py];
		this.moveTo = [nx * META, ny * META];
		this.moveDist = dist;
		this.moveT = 0;
		this.moving = true;
		this.jumping = jump;
		this.tx = nx; this.ty = ny;
		this.stepParity ^= 1;
	}

	update(dt, held) {
		this.animT += dt;
		if (this.moving) {
			// scripts move the PLAYER too (LOCALID_PLAYER), through the same cutscene
			// driver that borrows `moving` without setting moveFrom/moveTo — so an
			// interrupted scene can strand the player here exactly as it strands an NPC.
			// See the twin guard in npcs.js.
			if (!this.moveTo || !this.moveFrom) {
				this.px = this.tx * META; this.py = this.ty * META;
				this.moving = false; this.jumping = false; this.moveT = 0;
				return;
			}
			// the bike is fastest; hold B / Shift to run at nearly double speed
			const pace = this.biking ? 2.2 : this.run ? 1.85 : 1;
			this.moveT += (SPEED * pace * dt) / this.moveDist;
			if (this.moveT >= 1) {
				// carry the sub-frame overshoot into the next tile: discarding it made
				// walk speed display-Hz dependent (a 120Hz phone walked ~3% faster)
				const spill = Math.min(this.moveT - 1, 0.5);
				const prevDist = this.moveDist;
				this.px = this.moveTo[0]; this.py = this.moveTo[1];
				this.moving = false; this.jumping = false;
				if (this.surfing && !this.world.isSurfable(this.tx, this.ty)) this.surfing = false;
				// ...and the inverse, which is a rescue rather than a rule: Johto and
				// JohKanto shipped with no water behaviors at all, so their sea routes
				// were walkable floor and a save could be sitting in the middle of one.
				// Now that those tiles are water, standing on them without surfing is a
				// position you can never move out of.
				else if (!this.surfing && this.world.isSurfable(this.tx, this.ty)) this.surfing = true;
				this.onArrive?.();
				// keep walking if a key is held — but ONLY if arriving here did not
				// just start something. onArrive is where the wild-encounter roll, the
				// trainer sight line, warps and item pickups fire, so by the time it
				// returns a battle may already be up. Committing another step against
				// the stale `held` began a move that then froze mid-flight for the whole
				// battle (the tick stops updating the player while battle.blocking), and
				// completed the instant the battle ended — the player sliding one square
				// forward after every encounter. Flushing held keys on battle end cannot
				// fix that: the step is already begun, not key-driven.
				if (held && (!this.canStep || this.canStep())) {
					this.tryMove(held);
					if (this.moving && spill > 0) {
						this.moveT = spill * prevDist / this.moveDist;
						this.px = this.moveFrom[0] + (this.moveTo[0] - this.moveFrom[0]) * this.moveT;
						this.py = this.moveFrom[1] + (this.moveTo[1] - this.moveFrom[1]) * this.moveT;
					}
				}
			} else {
				this.px = this.moveFrom[0] + (this.moveTo[0] - this.moveFrom[0]) * this.moveT;
				this.py = this.moveFrom[1] + (this.moveTo[1] - this.moveFrom[1]) * this.moveT;
			}
		} else if (held) {
			this.tryMove(held);
		}
	}

	// the sprite sheet for the current mode: surf mount / bike / walk. Each ride
	// sheet draws the character ON the mount, so it replaces the walk sprite.
	rideImg() {
		return this.surfing ? (this.surfImg || this.img)
			: this.biking ? (this.bikeImg || this.img)
			: this.img;
	}

	draw(ctx, camX, camY) {
		if (!this.img) return;
		const sheet = this.rideImg();
		// only draw the fallback water ellipse when the real surf sheet is missing
		if (this.surfing && !this.surfImg) {
			const bob = Math.sin(this.animT * 4) * 1.2;
			ctx.fillStyle = 'rgba(40,90,160,0.85)';
			ctx.beginPath();
			ctx.ellipse(this.px - camX + 8, this.py - camY + 13 + bob, 9, 5, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = 'rgba(220,240,255,0.5)';
			ctx.beginPath();
			ctx.ellipse(this.px - camX + 8, this.py - camY + 15 + bob, 11, 3, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		let frame;
		if (this.moving) {
			const seq = WALKS[this.facing];
			frame = this.moveT < 0.5 ? seq[this.stepParity] : STILL[this.facing];
		} else {
			frame = STILL[this.facing];
		}
		let y = this.py - 16 - camY;
		if (this.jumping) y += JUMP_Y[Math.min(15, Math.floor(this.moveT * 16))];
		const x = this.px - camX;
		const mirror = this.facing === 'right';
		ctx.save();
		if (mirror) { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.drawImage(sheet, frame * 16, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
	}
}
