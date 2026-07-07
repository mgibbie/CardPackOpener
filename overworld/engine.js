// engine.js — Magepunk web-native overworld engine (Canvas2D, GBA 240x160).
// Faithful port of Magepunk66's Lua Map/Player system:
//   MapLoader.lua   -> tileset name mangling, palette bands, metatile split
//   MapRenderer.lua -> metatile draw (bottom/top/COVERED), borders, connections
//   MapCollision.lua-> grid collision bits, behaviors, ledges
//   Player.lua      -> grid movement @120px/s, 9-frame sprite, walk anim

export const TILE = 8, META = 16, VIEW_W = 240, VIEW_H = 160;
const METATILE_MASK = 0x3FF, COLLISION_MASK = 0x0C00, BEHAVIOR_MASK = 0x1FF;
const TILE_INDEX_MASK = 0x3FF, FLIP_X = 0x400, FLIP_Y = 0x800, PAL_MASK = 0xF000;
const LAYER_COVERED = 1;
const MB_TALL_GRASS = 0x02;
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
			img.onload = () => res(img);
			img.onerror = () => { imgCache.delete(url); rej(new Error('img ' + url)); };
			img.src = url;
		}));
	}
	return imgCache.get(url);
}

// ---------- tileset name mangling (MapLoader.getTilesetFileName) ----------
function mangle(tilesetName) {
	let n = tilesetName.replace('gTileset_', '');
	n = n.replace(/([A-Z])/g, c => '_' + c.toLowerCase());
	n = n.replace(/(\d+)/g, d => '_' + d);
	n = n.replace(/^_/, '').replace(/__/g, '_');
	return n;
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
		const img = await getImage(tilesetPng(name, game)).catch(() => null);
		if (!img) return null;
		const bandH = img.height / 16;                       // 16 palette bands
		const tilesPerBand = (bandH / TILE) * (img.width / TILE);
		let meta = null;
		try { meta = await getJSON(metatileJson(name, isPrimary, game)); } catch (e) { /* some primaries have none */ }
		return { img, bandH, tilesPerBand, metatiles: meta?.metatiles || null, attributes: meta?.attributes || null };
	}

	ts.primary = await side(layout.primary_tileset, true);
	ts.secondary = await side(layout.secondary_tileset, false);
	// split threshold = primary tile capacity (NOT #primaryMetatiles) — MapShared invariant
	ts.primaryTileCount = ts.primary ? ts.primary.tilesPerBand : 640;
	ts.primaryMetatileCount = ts.primaryTileCount;
	return ts;
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
		this.connections = {};  // dir -> { map, layout, ts, canvases, offset, name }
		this.warps = [];
		this.lastWarpSource = null; // for Crystal -1 back-warps
	}

	async init() {
		this.index = await getJSON(`${DATA}/map_index.json`);
	}

	fileFor(mapId) { return this.index[mapId] || null; }

	async loadBundle(name) {
		const map = await getJSON(`${DATA}/maps/${name}_map.json`);
		const layout = await getJSON(`${DATA}/layouts/${map.layout}.json`);
		const ts = await loadTilesetsFor(layout);
		return { name, map, layout, ts };
	}

	async load(name) {
		const b = await this.loadBundle(name);
		b.canvases = renderSection(b.layout, b.ts);
		b.borderCv = renderBorder(b.layout, b.ts);
		this.current = b;
		this.warps = (b.map.warp_events || []).map(w => ({ ...w, x: +w.x, y: +w.y }));
		this.connections = {};
		const conns = (b.map.connections || []).filter(c => ['up', 'down', 'left', 'right', 'north', 'south', 'east', 'west'].includes(c.direction));
		await Promise.all(conns.map(async c => {
			const file = this.fileFor(c.map);
			if (!file) return;
			try {
				const cb = await this.loadBundle(file);
				cb.canvases = renderSection(cb.layout, cb.ts);
				this.connections[normDir(c.direction)] = { ...cb, offset: c.offset || 0 };
			} catch (e) { console.warn('connection failed', c.map, e); }
		}));
	}

	// world-tile -> grid value (main map or connections); 0 = outside
	gridAt(tx, ty) {
		const lay = this.current.layout;
		if (tx >= 0 && tx < lay.width && ty >= 0 && ty < lay.height) {
			return lay.map[ty]?.[tx] ?? 0;
		}
		for (const dir of Object.keys(this.connections)) {
			const conn = this.connections[dir];
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
		for (const dir of Object.keys(this.connections)) {
			const conn = this.connections[dir];
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
	isTallGrass(tx, ty) { return this.behaviorAt(tx, ty) === MB_TALL_GRASS; }

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
		// main map
		const cv = layer === 'bottom' ? this.current.canvases.bottom : this.current.canvases.top;
		ctx.drawImage(cv, -camX, -camY);
		// connections
		for (const dir of Object.keys(this.connections)) {
			const conn = this.connections[dir];
			const [ox, oy] = DIR_OFFSET(dir, lay, conn);
			const ccv = layer === 'bottom' ? conn.canvases.bottom : conn.canvases.top;
			ctx.drawImage(ccv, ox * META - camX, oy * META - camY);
		}
	}
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
		this.animT = 0; this.stepParity = 0;
	}

	async init() {
		this.img = await getImage(`${DATA}/sprites/red_normal.png`);
	}

	setTile(tx, ty) {
		this.tx = tx; this.ty = ty;
		this.px = tx * META; this.py = ty * META;
		this.moving = false; this.jumping = false;
	}

	tryMove(dir) {
		if (this.moving) return;
		this.facing = dir;
		const [dx, dy] = DIRS[dir];
		const nx = this.tx + dx, ny = this.ty + dy;
		// ledge hop: entered tile OR current tile has a matching JUMP behavior; land 2 tiles out
		const hop = this.world.isLedge(nx, ny, dir) || this.world.isLedge(this.tx, this.ty, dir);
		if (hop) {
			const lx = this.tx + dx * 2, ly = this.ty + dy * 2;
			if (this.world.isPassable(lx, ly) && !(this.blocked && this.blocked(lx, ly))) {
				this.beginMove(lx, ly, META * 2, true);
				return;
			}
		}
		// while surfing, water is open sea; stepping ashore ends the ride
		const open = this.surfing
			? (this.world.isSurfable(nx, ny) || this.world.isPassable(nx, ny))
			: this.world.isPassable(nx, ny) && !this.world.isSurfable(nx, ny);
		if (!open) return;
		if (this.blocked && this.blocked(nx, ny)) return;
		this.beginMove(nx, ny, META, false);
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
			// hold B / Shift to run at nearly double speed
			this.moveT += (SPEED * (this.run ? 1.85 : 1) * dt) / this.moveDist;
			if (this.moveT >= 1) {
				this.px = this.moveTo[0]; this.py = this.moveTo[1];
				this.moving = false; this.jumping = false;
				if (this.surfing && !this.world.isSurfable(this.tx, this.ty)) this.surfing = false;
				this.onArrive?.();
				// keep walking if a key is held
				if (held) this.tryMove(held);
			} else {
				this.px = this.moveFrom[0] + (this.moveTo[0] - this.moveFrom[0]) * this.moveT;
				this.py = this.moveFrom[1] + (this.moveTo[1] - this.moveFrom[1]) * this.moveT;
			}
		} else if (held) {
			this.tryMove(held);
		}
	}

	draw(ctx, camX, camY) {
		if (!this.img) return;
		// a simple surf mount under the sprite while riding the waves
		if (this.surfing) {
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
		ctx.drawImage(this.img, frame * 16, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
	}
}
