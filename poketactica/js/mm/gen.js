// mm/gen.js — Mystery Maze's floor generator (owner, 2026-11-23: "match the level generation"): a port of the original
// Mystery Dungeon generator, function for function, from Plans/PMD_FLOOR_GENERATION_SPEC.md (the section numbers below are
// that document's). Every random draw is made in the original's order, and the original's quirks are kept as written
// (they shape the floors), so the same state and settings give the same floor. Fixed (hand-made) rooms are not ported:
// our dungeons have none.
// CHECKED against the original itself: its C, compiled and run, made the same 3,960 floors tile for tile; the test pins
// 360 of them (overworld/tests/fixtures/mm_gen_golden.json). So a change here that moves one tile fails the test: this
// file only changes on purpose, with MM_RULES_REV (replays re-run floors from their seeds).
//
//   generateFloor(seed | rng, props, opts) -> { terrain, spawn, room, player, stairs, mh, forceMh, shop, shopKeeper, rng }
//     terrain[y * 56 + x]   bits 0-1: 0 wall, 1 floor, 2 water / lava (3 = both, water tilesets); the T_* flags above that
//     spawn[y * 56 + x]     the S_* flags: stairs, item, trap, enemy, ...
//     room[y * 56 + x]      the room number, or 255 for a corridor / wall
//   props: the floor's settings (spec 2.1), all numbers: layout, roomDensity, floorConnectivity, enemyDensity,
//     kecleonShopChance, monsterHouseChance, mazeRoomChance, allowDeadEnds, secondaryStructuresBudget, roomFlags,
//     itemDensity, trapDensity, numExtraHallways, buriedItemDensity, standaloneLakeDensity, kecleonShopLayout,
//     itemlessMonsterHouseChance
//   opts: { water } the tileset's liquid is water (walkable shallows at the end), not lava
// Pure: node-tested (overworld/tests/poketactica_mm_gen_test.mjs).
import { makeRng } from './rng.js';

export const MM_W = 56, MM_H = 32;
export const T_WALL = 0, T_FLOOR = 1, T_LIQUID = 2;
export const T_CUT = 0x4, T_JUNCTION = 0x8, T_IMPASSABLE = 0x10, T_SHOP = 0x20, T_MONSTER_HOUSE = 0x40, T_DIVIDED = 0x80, T_UNBREAKABLE = 0x100, T_STAIRS = 0x200;
export const S_STAIRS = 0x1, S_ITEM = 0x2, S_TRAP = 0x4, S_ENEMY = 0x8, S_SPECIAL = 0x10, S_STRUCTURE = 0x20, S_ISLAND_TRAP = 0x40;
export const NO_ROOM = 0xFF;
export const LAYOUTS = ['large', 'small', 'one-room', 'outer-ring', 'crossroads', 'two-rooms', 'line', 'cross', 'large-8', 'beetle', 'outer-rooms', 'medium'];
export const ROOM_FLAG_LIQUID = 0x1, ROOM_FLAG_IMPERFECT = 0x4;

const W = MM_W, H = MM_H, N = W * H, ANCHOR = 0xFE;
const SMALL = 1, MEDIUM = 2;
// the 8 directions: S, SE, E, NE, N, NW, W, SW
const OFF = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
// room imperfections: which straight neighbours of a corner tile must be open (S, E, N, W) for each corner
const EXPECT_OPEN = [[1, 1, 0, 0], [1, 0, 0, 1], [0, 0, 1, 1], [0, 1, 1, 0]];
const RIVERS = [1, 1, 1, 2, 2, 2, 3, 3];
const SHOP_ITEM_CHANCE = [[57, 57, 57], [100, 57, 100], [57, 57, 57]];   // ([y][x]; the same for every shop layout)
const MH_MAX_MONS = 12;

const newCell = () => ({ sx: 0, sy: 0, ex: 0, ey: 0, isInvalid: false, hasSecondary: false, isRoom: false, isConnected: false, isShop: false, isMH: false, isMaze: false,
	hasBeenMerged: false, isMerged: false, cT: false, cB: false, cL: false, cR: false, sT: false, sB: false, sL: false, sR: false, flagImperfect: false, flagSecondary: false, unk15: false });
/** A layout's work grid: 15 x 15 cells, grid[x][y], all clear. (The original leaves cells outside the used part unset.) */
const newGrid = () => Array.from({ length: 15 }, () => Array.from({ length: 15 }, newCell));
const div = (a, b) => Math.trunc(a / b);

export function generateFloor(seed, props, opts = {}) {
	const rng = seed && typeof seed === 'object' ? seed : makeRng(seed);
	const R = (n) => rng.int(n), RR = (a, b) => rng.range(a, b);
	const terrain = new Uint16Array(N), spawn = new Uint8Array(N), room = new Uint8Array(N);
	const water = !!opts.water, unk44 = opts.unk44 | 0, canChangeLeader = opts.canChangeLeader !== false;

	// ---- tiles (spec 1): out of bounds reads as plain wall, writes are dropped
	const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
	const tt = (x, y) => (inb(x, y) ? terrain[y * W + x] & 3 : 0);
	const tf = (x, y) => (inb(x, y) ? terrain[y * W + x] : 0);
	const rm = (x, y) => (inb(x, y) ? room[y * W + x] : NO_ROOM);
	const setT = (x, y, t) => { if (inb(x, y)) { const i = y * W + x; terrain[i] = (terrain[i] & ~3) | t; } };
	const orT = (x, y, f) => { if (inb(x, y)) terrain[y * W + x] |= f; };
	const clrT = (x, y, f) => { if (inb(x, y)) terrain[y * W + x] &= ~f; };
	const orS = (x, y, f) => { if (inb(x, y)) spawn[y * W + x] |= f; };
	const clrS = (x, y, f) => { if (inb(x, y)) spawn[y * W + x] &= ~f; };
	const setRoom = (x, y, r) => { if (inb(x, y)) room[y * W + x] = r; };
	const carve = (x0, y0, x1, y1, r) => { for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) { setT(x, y, T_FLOOR); setRoom(x, y, r); } };
	const liquidOnWall = (x, y) => { if (inb(x, y) && tt(x, y) === T_WALL && !(tf(x, y) & T_IMPASSABLE)) setT(x, y, T_LIQUID); };

	// ---- the generator's own state (spec 3.1, 3.5: what carries over between attempts does so as in the original)
	let hasShop = false, hasMH = false, floorSize = 0, secondaryGen = false;
	let shopPos = { minX: -1, maxX: -1, minY: -1, maxY: -1 }, shopMid = [-1, -1];
	let budget = props.secondaryStructuresBudget | 0;
	let player = [-1, -1], stairs = [-1, -1], forceMH = false, mhRoom = NO_ROOM;
	const shopChance = props.kecleonShopChance | 0, mhChance = props.monsterHouseChance | 0;

	function resetFloor() {
		terrain.fill(0); spawn.fill(0); room.fill(NO_ROOM);
		for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (x === 0 || x === W - 1 || y === 0 || y === H - 1) terrain[y * W + x] |= T_IMPASSABLE;
		stairs = [-1, -1];
	}

	// ================================================================ 5.1 - 5.3: the grid, which cells are rooms, the rooms
	function initGrid(grid, gx, gy) {
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y], sx = c.sx, sy = c.sy, ex = c.ex, ey = c.ey;
			Object.assign(c, newCell(), { sx, sy, ex, ey });
			c.isInvalid = (floorSize === SMALL && x >= div(gx, 2)) || (floorSize === MEDIUM && x >= div(gx * 3, 4));
			c.isRoom = true;
		}
	}
	function gridPositions(gx, gy) {
		const lx = [], ly = [];
		for (let i = 0; i <= gx; i++) lx.push(i * div(W, gx));
		for (let i = 0; i <= gy; i++) ly.push(i * div(H, gy));
		return [lx, ly];
	}
	function assignRooms(grid, gx, gy, roomsNumber) {
		const extra = R(3);
		if (roomsNumber < 0) roomsNumber = -roomsNumber; else roomsNumber += extra;
		const bits = new Array(256).fill(false);
		for (let i = 0; i < roomsNumber && i < 256; i++) bits[i] = true;
		const max = gx * gy;
		for (let i = 0; i < 64; i++) { const a = R(max), b = R(max); const t = bits[a]; bits[a] = bits[b]; bits[b] = t; }
		let i = 0, num = 0;
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid) continue;
			if (num >= 32) c.isRoom = false;
			if (bits[i]) {
				c.isRoom = true; num++;
				if (gx % 2 !== 0 && x === div(gx - 1, 2) && y === 1) c.isRoom = false;
			} else c.isRoom = false;
			i++;
		}
		if (num >= 2) return;
		for (let a = 0; a < 200; a++) {
			for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
				if (grid[x][y].isInvalid) continue;
				if (R(100) < 60) { grid[x][y].isRoom = true; return; }
			}
		}
	}
	function createRoomsAndAnchors(grid, gx, gy, lx, ly, roomFlags) {
		let roomNumber = 0;
		for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
			const c = grid[x][y];
			const minX = lx[x] + 2, minY = ly[y] + 2, rangeX = lx[x + 1] - lx[x] - 4, rangeY = ly[y + 1] - ly[y] - 3;
			if (c.isInvalid) continue;
			if (c.isRoom) {
				let sizeX = RR(5, rangeX), sizeY = RR(4, rangeY);
				if ((sizeX | 1) < rangeX) sizeX |= 1;
				if ((sizeY | 1) < rangeY) sizeY |= 1;
				if (sizeX > div(sizeY * 3, 2)) sizeX = div(sizeY * 3, 2);
				if (sizeY > div(sizeX * 3, 2)) sizeY = div(sizeX * 3, 2);
				const startX = R(rangeX - sizeX) + minX, startY = R(rangeY - sizeY) + minY;
				c.sx = startX; c.sy = startY; c.ex = startX + sizeX; c.ey = startY + sizeY;
				carve(c.sx, c.sy, c.ex, c.ey, roomNumber);
				let imperfect = true, secondary = R(100) < 80;
				if (budget === 0) secondary = false;
				if (!(roomFlags & ROOM_FLAG_IMPERFECT)) imperfect = false;
				if (imperfect && secondary) { if (R(100) < 50) imperfect = false; else secondary = false; }
				c.flagImperfect = c.flagImperfect || imperfect; c.flagSecondary = c.flagSecondary || secondary;
				roomNumber++;
			} else {
				const ux1 = x === 0 ? 1 : 2, uy1 = y === 0 ? 1 : 2, ux2 = x === gx - 1 ? 2 : 4, uy2 = y === gy - 1 ? 2 : 4;
				const px = RR(minX + ux1, minX + rangeX - ux2), py = RR(minY + uy1, minY + rangeY - uy2);
				c.sx = px; c.sy = py; c.ex = px + 1; c.ey = py + 1;
				setT(px, py, T_FLOOR); setRoom(px, py, ANCHOR);
			}
		}
	}
	/** The simpler room maker of the ring / crossroads / two-room layouts (4.3 - 4.5): `pad` 2 for a room, 1 for an anchor. */
	function plainRoom(c, lx, ly, x, y, minW, minH, pad, r) {
		const minX = lx[x] + pad, minY = ly[y] + pad, rangeX = lx[x + 1] - lx[x] - 3, rangeY = ly[y + 1] - ly[y] - 3;
		const sizeX = RR(minW, rangeX), sizeY = RR(minH, rangeY);
		const startX = R(rangeX - sizeX) + minX, startY = R(rangeY - sizeY) + minY;
		c.sx = startX; c.sy = startY; c.ex = startX + sizeX; c.ey = startY + sizeY;
		carve(c.sx, c.sy, c.ex, c.ey, r);
	}
	function plainAnchor(c, lx, ly, x, y) {
		const minX = lx[x] + 1, minY = ly[y] + 1, rangeX = lx[x + 1] - lx[x] - 3, rangeY = ly[y + 1] - ly[y] - 3;
		const px = RR(minX, minX + rangeX), py = RR(minY, minY + rangeY);
		c.sx = px; c.sy = py; c.ex = px + 1; c.ey = py + 1;
		setT(px, py, T_FLOOR); setRoom(px, py, NO_ROOM);
	}

	// ================================================================ 5.4: which cells link
	const link = (grid, x, y, d) => {   // (d: 0 right, 1 up, 2 left, 3 down)
		if (d === 0) { grid[x][y].cR = true; grid[x + 1][y].cL = true; } else if (d === 1) { grid[x][y].cT = true; grid[x][y - 1].cB = true; } else if (d === 2) { grid[x][y].cL = true; grid[x - 1][y].cR = true; } else { grid[x][y].cB = true; grid[x][y + 1].cT = true; }
	};
	function assignConnections(grid, gx, gy) {
		let x = R(gx), y = R(gy);
		let dir = R(4);
		for (let n = 0; n < (props.floorConnectivity | 0); n++) {
			const test = R(8), newDir = R(4);
			if (test < 4) dir = newDir;
			for (;;) {
				const d = dir & 3;
				if (d === 0 ? x < gx - 1 : d === 1 ? y > 0 : d === 2 ? x > 0 : y < gy - 1) break;
				dir++;
			}
			const d = dir & 3;
			if (d === 0) { if (!grid[x + 1][y].isInvalid) { link(grid, x, y, 0); x++; } } else if (d === 1) { if (!grid[x][y - 1].isInvalid) { link(grid, x, y, 1); y--; } } else if (d === 2) { if (!grid[x - 1][y].isInvalid) { link(grid, x, y, 2); x--; } } else if (!grid[x][y + 1].isInvalid) { link(grid, x, y, 3); y++; }
		}
		if (props.allowDeadEnds) return;
		for (;;) {   // dead-end removal
			let more = false;
			for (let x2 = 0; x2 < gx; x2++) for (let y2 = 0; y2 < gy; y2++) {
				const c = grid[x2][y2];
				if (c.isInvalid || c.isRoom) continue;
				if ((c.cT ? 1 : 0) + (c.cB ? 1 : 0) + (c.cL ? 1 : 0) + (c.cR ? 1 : 0) !== 1) continue;
				let d = R(4), ok = false;
				for (let i = 0; i < 8; i++) {
					const k = d & 3;
					if (k === 0 ? x2 < gx - 1 && !c.cR : k === 1 ? y2 > 0 && !c.cT : k === 2 ? x2 > 0 && !c.cL : y2 < gy - 1 && !c.cB) { ok = true; break; }
					d++;
				}
				if (!ok) continue;
				// (the original tests the cell to the RIGHT whatever the direction; past the grid it reads an unset cell)
				const right = x2 + 1 < 15 ? grid[x2 + 1][y2] : null;
				if (!(right && right.isInvalid)) { link(grid, x2, y2, d & 3); more = true; }
			}
			if (!more) break;
		}
	}

	// ================================================================ 5.5: the corridors between linked cells, and merging
	function hallway(x, y, endX, endY, vertical, turnX, turnY) {
		const startX = x, startY = y;
		let stop = false;
		const step = () => { if (tt(x, y) !== T_FLOOR) setT(x, y, T_FLOOR); else if (x !== startX || y !== startY) stop = true; };
		let n;
		if (vertical) {
			n = 0; while (y !== turnY) { if (n++ >= W) return; step(); if (stop) return; y += y < turnY ? 1 : -1; }
			n = 0; while (x !== endX) { if (n++ >= W) return; step(); if (stop) return; x += x < endX ? 1 : -1; }
			n = 0; while (y !== endY) { if (n++ >= W) return; step(); if (stop) return; y += y < endY ? 1 : -1; }
		} else {
			n = 0; while (x !== turnX) { if (n++ >= W) return; step(); if (stop) return; x += x < turnX ? 1 : -1; }
			n = 0; while (y !== endY) { if (n++ >= W) return; step(); if (stop) return; y += y < endY ? 1 : -1; }
			n = 0; while (x !== endX) { if (n++ >= W) return; step(); if (stop) return; x += x < endX ? 1 : -1; }
		}
	}
	function createConnections(grid, gx, gy, lx, ly, noMerge) {
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid) { c.sT = c.sB = c.sL = c.sR = false; continue; }
			if (x === 0) c.cL = false;
			if (y === 0) c.cT = false;
			if (x === gx - 1) c.cR = false;
			if (y === gy - 1) c.cB = false;
			c.sT = c.cT; c.sB = c.cB; c.sL = c.cL; c.sR = c.cR;
		}
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid) continue;
			let ptX, ptY;
			if (c.isRoom) { ptX = RR(c.sx + 1, c.ex - 1); ptY = RR(c.sy + 1, c.ey - 1); } else { ptX = c.sx; ptY = c.sy; }
			if (c.sT) {
				const n = grid[x][y - 1];
				if (!n.isInvalid) { const p2 = n.isRoom ? RR(n.sx + 1, n.ex - 1) : n.sx; hallway(ptX, c.sy, p2, n.ey - 1, true, lx[x], ly[y]); }
				c.sT = false; n.sB = false; c.isConnected = true; n.isConnected = true;
			}
			if (c.sB) {
				const n = grid[x][y + 1];
				if (!n.isInvalid) { const p2 = n.isRoom ? RR(n.sx + 1, n.ex - 1) : n.sx; hallway(ptX, c.ey - 1, p2, n.sy, true, lx[x], ly[y + 1] - 1); }
				c.sB = false; n.sT = false; c.isConnected = true; n.isConnected = true;
			}
			if (c.sL) {
				const n = grid[x - 1][y];
				if (!n.isInvalid) { const p2 = n.isRoom ? RR(n.sy + 1, n.ey - 1) : n.sy; hallway(c.sx, ptY, n.sx - 1, p2, false, lx[x], ly[y]); }   // (n.sx - 1: the original's own slip; the corridor stops on reaching n)
				c.sL = false; n.sR = false; c.isConnected = true; n.isConnected = true;
			}
			if (c.sR) {
				const n = grid[x + 1][y];
				if (!n.isInvalid) { const p2 = n.isRoom ? RR(n.sy + 1, n.ey - 1) : n.sy; hallway(c.ex - 1, ptY, n.sx, p2, false, lx[x + 1] - 1, ly[y]); }
				c.sR = false; n.sL = false; c.isConnected = true; n.isConnected = true;
			}
		}
		if (noMerge) return;
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			const chance = R(100);
			if (!(chance < 5 && !c.isInvalid && c.isConnected && !c.isMerged && !c.hasSecondary && c.isRoom)) continue;
			const d = R(4);   // (0 left, 1 up, 2 right, 3 down)
			let n = null;
			if (d === 0) { if (x > 0) n = grid[x - 1][y]; } else if (d === 1) { if (y >= 1) n = grid[x][y - 1]; } else if (d === 2) { if (x <= gx - 2) n = grid[x + 1][y]; } else if (y <= gy - 2) n = grid[x][y + 1];
			if (!n || !n.isConnected || n.isInvalid || !n.isRoom || n.hasSecondary || n.isMerged) continue;
			const r = rm(c.sx, c.sy);
			let x0, x1, y0, y1;
			if (d === 0 || d === 2) { y0 = Math.min(c.sy, n.sy); y1 = Math.max(c.ey, n.ey); if (d === 0) { x0 = n.sx; x1 = c.ex; } else { x0 = c.sx; x1 = n.ex; } } else { x0 = Math.min(c.sx, n.sx); x1 = Math.max(c.ex, n.ex); if (d === 1) { y0 = n.sy; y1 = c.ey; } else { y0 = c.sy; y1 = n.ey; } }
			carve(x0, y0, x1, y1, r);
			const keep = d === 0 || d === 1 ? n : c, gone = d === 0 || d === 1 ? c : n;
			keep.sx = x0; keep.sy = y0; keep.ex = x1; keep.ey = y1;
			c.isMerged = true; n.isMerged = true; gone.isConnected = false; gone.hasBeenMerged = true;
		}
	}

	// ================================================================ 5.6: nothing left cut off
	function ensureConnected(grid, gx, gy, lx, ly) {
		const ok = (n) => !n.isInvalid && !n.isMerged && n.isConnected;
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid || c.hasBeenMerged || c.isConnected) continue;
			if (c.isRoom && !c.hasSecondary) {
				const rx = RR(c.sx + 1, c.ex - 1), ry = RR(c.sy + 1, c.ey - 1);
				const pt = (n) => (n.isRoom ? [RR(n.sx + 1, n.ex - 1), RR(n.sy + 1, n.ey - 1)] : [n.sx, n.sy]);   // (both drawn, one used)
				let n;
				if (y > 0 && ok(n = grid[x][y - 1])) { const p = pt(n); hallway(rx, c.sy, p[0], n.ey - 1, true, lx[x], ly[y]); c.isConnected = true; c.cT = true; n.cB = true; }
				else if (y < gy - 1 && ok(n = grid[x][y + 1])) { const p = pt(n); hallway(rx, c.ey - 1, p[0], n.sy, true, lx[x], ly[y + 1] - 1); c.isConnected = true; c.cB = true; n.cT = true; }
				else if (x > 0 && ok(n = grid[x - 1][y])) { const p = pt(n); hallway(c.sx, ry, n.sx - 1, p[1], false, lx[x], ly[y]); c.isConnected = true; c.cL = true; n.cR = true; }
				else if (x < gx - 1 && ok(n = grid[x + 1][y])) { const p = pt(n); hallway(c.ex - 1, ry, n.sx, p[1], false, lx[x + 1] - 1, ly[y]); c.isConnected = true; c.cR = true; n.cL = true; }
			} else {
				setT(c.sx, c.sy, T_WALL); clrS(c.sx, c.sy, S_STAIRS | S_ITEM | S_TRAP);
			}
		}
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid || c.hasBeenMerged || c.isConnected || c.unk15) continue;
			for (let X = c.sx; X < c.ex; X++) for (let Y = c.sy; Y < c.ey; Y++) { setT(X, Y, T_WALL); clrS(X, Y, S_STAIRS | S_ITEM | S_TRAP); setRoom(X, Y, NO_ROOM); }
		}
	}

	// ================================================================ 5.7 - 5.9: the maze room (never made), the shop, the Monster House
	function mazeRoom(chance) {
		if (chance === 0) return;
		if (chance <= R(100)) return;
		// (the original then tests a counter that is never negative and returns: one draw, no maze)
	}
	function kecleonShop(grid, gx, gy, chance) {
		shopMid = [-1, -1];
		if (hasMH || chance === 0) return;
		if (chance <= R(100)) return;
		const listX = [], listY = [];
		for (let i = 0; i < 15; i++) { listX.push(i); listY.push(i); }
		for (let i = 0; i < 200; i++) { const a = R(15), b = R(15); const t = listX[a]; listX[a] = listX[b]; listX[b] = t; }
		for (let i = 0; i < 200; i++) { const a = R(15), b = R(15); const t = listY[a]; listY[a] = listY[b]; listY[b] = t; }
		for (let i = 0; i < 15; i++) {
			const x = listX[i];
			if (x >= gx) continue;
			for (let j = 0; j < 15; j++) {
				const y = listY[j];
				if (y >= gy) continue;
				const c = grid[x][y];
				if (c.isInvalid || c.hasBeenMerged || c.isMerged || !c.isConnected || !c.isRoom || c.hasSecondary || c.isMaze || c.flagSecondary) continue;
				if (Math.abs(c.ex - c.sx) < 5 || Math.abs(c.ey - c.sy) < 4) continue;
				hasShop = true; c.isShop = true;
				shopPos = { minX: c.sx + 1, maxX: c.ex - 1, minY: c.sy + 1, maxY: c.ey - 1 };
				if (shopPos.maxY - shopPos.minY < 3) shopPos.maxY++;
				for (let X = shopPos.minX; X < shopPos.maxX; X++) for (let Y = shopPos.minY; Y < shopPos.maxY; Y++) { orT(X, Y, T_SHOP); clrS(X, Y, S_ENEMY | S_STAIRS); }
				for (let X = c.sx; X < c.ex; X++) for (let Y = c.sy; Y < c.ey; Y++) orS(X, Y, S_SPECIAL);
				shopMid = [div(shopPos.minX + shopPos.maxX, 2), div(shopPos.minY + shopPos.maxY, 2)];
				return;
			}
		}
	}
	function monsterHouse(grid, gx, gy, chance) {
		if (chance === 0 || chance <= R(100)) return;
		if (hasShop || unk44 !== 0) return;
		const can = (c) => !c.isInvalid && !c.hasBeenMerged && c.isConnected && c.isRoom && !c.isShop && !c.unk15 && !c.isMaze && !c.hasSecondary;
		let num = 0;
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) if (can(grid[x][y])) num++;
		if (!num) return;
		const values = new Array(256).fill(false);
		values[0] = true;
		for (let i = 0; i < 64; i++) { const a = R(num), b = R(num); const t = values[a]; values[a] = values[b]; values[b] = t; }
		let i = 0;
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (!can(c)) continue;
			if (values[i]) {
				hasMH = true; c.isMH = true;
				for (let X = c.sx; X < c.ex; X++) for (let Y = c.sy; Y < c.ey; Y++) { orT(X, Y, T_MONSTER_HOUSE); mhRoom = rm(X, Y); }
				return;
			}
			i++;
		}
	}

	// ================================================================ 5.10: extra corridors that wander off from a room
	function extraHallways(grid, gx, gy, count) {
		for (let n = 0; n < count; n++) {
			const x = R(gx), y = R(gy), c = grid[x][y];
			if (!c.isRoom || !c.isConnected || c.isInvalid || c.isMaze) continue;
			let cx = RR(c.sx, c.ex), cy = RR(c.sy, c.ey);
			let dir = R(4) * 2;
			for (let i = 0; i < 3; i++) {
				if (dir === 0 && y >= gy - 1) dir = 2;
				if (dir === 2 && x >= gx - 1) dir = 4;
				if (dir === 4 && y <= 0) dir = 6;
				if (dir === 6 && x <= 0) dir = 0;
			}
			const roomId = rm(cx, cy);
			while (rm(cx, cy) === roomId) { if (!inb(cx, cy)) break; cx += OFF[dir][0]; cy += OFF[dir][1]; }   // (the break: a guard for a room number of 255, which the original would loop on)
			while (tt(cx, cy) === T_FLOOR) { cx += OFF[dir][0]; cy += OFF[dir][1]; }
			if (tt(cx, cy) === T_LIQUID) continue;
			if (cx < 2 || cx > W - 3 || cy < 2 || cy > H - 3) continue;
			const side = (d) => tt(cx + OFF[d & 6][0], cy + OFF[d & 6][1]) === T_FLOOR;
			if (side(dir + 2) || side(dir - 2 + 8)) continue;
			let steps = R(3) + 3;
			for (;;) {
				if (cx <= 1 || cy <= 1 || cx >= W - 1 || cy >= H - 1) break;
				if (tt(cx, cy) === T_FLOOR) break;
				if (tf(cx, cy) & T_IMPASSABLE) break;
				let square = false;
				for (const dx of [-1, 1]) for (const dy of [-1, 1]) if (tt(cx + dx, cy) === T_FLOOR && tt(cx, cy + dy) === T_FLOOR && tt(cx + dx, cy + dy) === T_FLOOR) square = true;
				if (!square) setT(cx, cy, T_FLOOR);
				if (side(dir + 2) || side(dir - 2 + 8)) break;
				steps--;
				if (steps === 0) {
					steps = R(3) + 3;
					if (R(100) < 50) dir += 2; else dir -= 2;
					dir &= 6;
					if (cx >= 32 && floorSize === SMALL && dir === 2) break;
					if (cx >= 48 && floorSize === MEDIUM && dir === 2) break;
				}
				cx += OFF[dir][0]; cy += OFF[dir][1];
			}
		}
	}

	// ================================================================ 5.11: rooms with a corner or two filled in
	function imperfections(grid, gx, gy) {
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) {
			const c = grid[x][y];
			if (c.isInvalid || c.hasBeenMerged || c.isMerged || !c.isConnected || !c.isRoom || c.hasSecondary || c.isMaze || !c.flagImperfect) continue;
			if (R(100) < 60) continue;
			let length = div((c.ex - c.sx) + (c.ey - c.sy), 4);
			if (length === 0) length = 1;
			for (let k = 0; k < length; k++) for (let i = 0; i < 2; i++) {
				const corner = R(4);
				let px, py, mx, my;
				if (corner === 0) { px = c.sx; py = c.sy; if (i) { mx = 1; my = 0; } else { mx = 0; my = 1; } } else if (corner === 1) { px = c.ex - 1; py = c.sy; if (i) { mx = 0; my = 1; } else { mx = -1; my = 0; } } else if (corner === 2) { px = c.ex - 1; py = c.ey - 1; if (i) { mx = -1; my = 0; } else { mx = 0; my = -1; } } else { px = c.sx; py = c.ey - 1; if (i) { mx = 0; my = -1; } else { mx = 1; my = 0; } }
				for (let v = 0; v < 10; v++) {
					if (px < c.sx || px >= c.ex || py < c.sy || py >= c.ey) break;
					if (tt(px, py) === T_FLOOR) {
						let nearHall = false;
						for (let d = 0; d < 8 && !nearHall; d++) {
							const nx = px + OFF[d][0], ny = py + OFF[d][1];
							for (let oy = -1; oy <= 1 && !nearHall; oy++) for (let ox = -1; ox <= 1; ox++) if (tt(nx + ox, ny + oy) === T_FLOOR && rm(nx + ox, ny + oy) === NO_ROOM) { nearHall = true; break; }
						}
						if (!nearHall) {
							let fits = true;
							for (let d = 0; d < 8; d += 2) if ((tt(px + OFF[d][0], py + OFF[d][1]) === T_FLOOR) !== !!EXPECT_OPEN[corner][d >> 1]) { fits = false; break; }
							if (fits) setT(px, py, T_WALL);
						}
						break;
					}
					px += mx; py += my;
				}
			}
		}
	}

	// ================================================================ 5.12: structures inside rooms (pools, islands, dividers, mazes)
	const cellFlag5 = (c) => { for (let x = c.sx; x < c.ex; x++) for (let y = c.sy; y < c.ey; y++) orS(x, y, S_STRUCTURE); };
	const nextToHallway = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx, y + dy) && tt(x + dx, y + dy) === T_FLOOR && rm(x + dx, y + dy) === NO_ROOM);
	function mazeLine(x0, y0, c, useSecondary, roomIndex) {
		const obstacle = (x, y) => { setT(x, y, T_WALL); if (useSecondary && rm(x, y) === roomIndex) setT(x, y, T_LIQUID); };
		for (;;) {
			let dir = R(4);
			obstacle(x0, y0);
			let tries = 0, dx, dy;
			for (;;) {
				const d = dir & 3;
				dx = d === 0 ? 2 : d === 2 ? -2 : 0; dy = d === 1 ? -2 : d === 3 ? 2 : 0;
				if (x0 + dx >= c.sx && x0 + dx < c.ex && y0 + dy >= c.sy && y0 + dy < c.ey && tt(x0 + dx, y0 + dy) === T_FLOOR) break;
				dir++;
				if (++tries >= 4) return;
			}
			obstacle(x0 + dx / 2, y0 + dy / 2);
			x0 += dx; y0 += dy;
		}
	}
	function maze(c, useSecondary) {
		c.isMaze = true;
		const r = rm(c.sx, c.sy);
		for (let X = c.sx + 1; X < c.ex - 1; X += 2) if (tt(X, c.sy - 1) !== T_FLOOR) mazeLine(X, c.sy - 1, c, useSecondary, r);
		for (let Y = c.sy + 1; Y < c.ey - 1; Y += 2) if (tt(c.ex, Y) !== T_FLOOR) mazeLine(c.ex, Y, c, useSecondary, r);
		for (let X = c.sx + 1; X < c.ex - 1; X += 2) if (tt(X, c.ey) !== T_FLOOR) mazeLine(X, c.ey, c, useSecondary, r);
		for (let Y = c.sy + 1; Y < c.ey - 1; Y += 2) if (tt(c.sx - 1, Y) !== T_FLOOR) mazeLine(c.sx - 1, Y, c, useSecondary, r);
		for (let X = c.sx + 3; X < c.ex - 3; X += 2) for (let Y = c.sy + 3; Y < c.ey - 3; Y += 2) {
			if (tt(X, Y) !== T_FLOOR) continue;
			setT(X - 1, Y, useSecondary ? T_LIQUID : T_WALL);
			mazeLine(X, Y, c, useSecondary, r);
		}
	}
	function secondaryStructure(c) {
		const w = c.ex - c.sx, h = c.ey - c.sy, midX = div(c.sx + c.ex, 2), midY = div(c.sy + c.ey, 2);
		const liquid = (x, y, f = 0) => { setT(x, y, T_LIQUID); if (f) orT(x, y, f); };
		switch (R(6)) {
			case 1:   // a maze, or (an even side) a plus / dot of liquid
				if (budget === 0) break;
				budget--;
				if (w % 2 === 0 || h % 2 === 0) {
					if (w >= 5 && h >= 5) { liquid(midX + 1, midY); liquid(midX, midY + 1); liquid(midX - 1, midY); liquid(midX, midY - 1); }
					liquid(midX, midY);
				} else { cellFlag5(c); maze(c, true); }
				c.hasSecondary = true;
				break;
			case 2:   // a checkerboard
				if (w % 2 !== 0 && h % 2 !== 0 && budget !== 0) {
					budget--; cellFlag5(c);
					for (let i = 0; i < 64; i++) { const rx = R(w), ry = R(h); if ((rx + ry) % 2 !== 0) liquid(c.sx + rx, c.sy + ry); }
					c.hasSecondary = true;
				}
				break;
			case 3:   // a pool
				if (w >= 5 && h >= 5) {
					let x1 = RR(c.sx + 2, c.ex - 3), y1 = RR(c.sy + 2, c.ey - 3), x2 = RR(c.sx + 2, c.ex - 3), y2 = RR(c.sy + 2, c.ey - 3);
					if (budget !== 0) {
						budget--; cellFlag5(c);
						if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
						if (y1 > y2) { const t = y1; y1 = y2; y2 = t; }
						for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) liquid(x, y);
						c.hasSecondary = true;
					}
				}
				break;
			case 4:   // an island: a moat round a 2 x 2 with items and a trap
				if (w >= 6 && h >= 6 && budget !== 0) {
					budget--; cellFlag5(c);
					for (let x = midX - 2; x <= midX + 1; x++) for (let y = midY - 2; y <= midY + 1; y++) if (x === midX - 2 || x === midX + 1 || y === midY - 2 || y === midY + 1) liquid(x, y, T_CUT);
					orS(midX - 1, midY - 1, S_TRAP | S_ISLAND_TRAP);
					orS(midX, midY - 1, S_ITEM); orS(midX - 1, midY, S_ITEM); orS(midX, midY, S_ITEM);
					for (const [x, y] of [[midX - 1, midY - 1], [midX, midY - 1], [midX - 1, midY], [midX, midY]]) orS(x, y, S_SPECIAL);
					c.hasSecondary = true;
				}
				break;
			case 5:   // a room split by a line of liquid
				if (budget === 0) break;
				budget--; cellFlag5(c);
				if (R(2) !== 0) {
					let bad = false;
					for (let y = c.sy; y < c.ey; y++) if (nextToHallway(midX, y)) { bad = true; break; }
					if (!bad) {
						for (let y = c.sy; y < c.ey; y++) liquid(midX, y);
						for (let x = c.sx; x < midX; x++) for (let y = c.sy; y < c.ey; y++) orT(x, y, T_DIVIDED);
						c.hasSecondary = true;
					}
				} else {
					let bad = false;
					for (let x = c.sx; x < c.ex; x++) if (nextToHallway(x, midY)) { bad = true; break; }
					if (!bad) {
						for (let x = c.sx; x < c.ex; x++) liquid(x, midY);
						for (let y = c.sy; y < midY; y++) for (let x = c.sx; x < c.ex; x++) orT(x, y, T_DIVIDED);
						c.hasSecondary = true;
					}
				}
				break;
			default: break;
		}
	}
	function secondaryStructures(grid, gx, gy) {
		for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
			const c = grid[x][y];
			if (!c.isInvalid && !c.isMH && !c.isMerged && c.isRoom && !c.flagImperfect && c.flagSecondary) secondaryStructure(c);
		}
	}

	// ================================================================ 4: the layouts
	function standardFloor(gx, gy) {
		const [lx, ly] = gridPositions(gx, gy), grid = newGrid();
		initGrid(grid, gx, gy);
		assignRooms(grid, gx, gy, props.roomDensity | 0);
		createRoomsAndAnchors(grid, gx, gy, lx, ly, props.roomFlags | 0);
		assignConnections(grid, gx, gy);
		createConnections(grid, gx, gy, lx, ly, false);
		ensureConnected(grid, gx, gy, lx, ly);
		mazeRoom(props.mazeRoomChance | 0);
		kecleonShop(grid, gx, gy, shopChance);
		monsterHouse(grid, gx, gy, mhChance);
		extraHallways(grid, gx, gy, props.numExtraHallways | 0);
		imperfections(grid, gx, gy);
		secondaryStructures(grid, gx, gy);
	}
	function oneRoomFloor() {
		const grid = newGrid();
		initGrid(grid, 1, 1);
		const c = grid[0][0];
		c.sx = 2; c.sy = 2; c.ex = W - 2; c.ey = H - 2; c.isRoom = true; c.isConnected = true; c.isInvalid = false;
		carve(2, 2, W - 2, H - 2, 0);
		monsterHouse(grid, 1, 1, 999);
	}
	const tail = (grid, gx, gy) => { kecleonShop(grid, gx, gy, shopChance); monsterHouse(grid, gx, gy, mhChance); extraHallways(grid, gx, gy, props.numExtraHallways | 0); imperfections(grid, gx, gy); };
	function outerRingFloor() {
		const gx = 6, gy = 4, lx = [0, 5, 16, 28, 39, 51, 56], ly = [2, 7, 16, 25, 30], grid = newGrid();
		initGrid(grid, gx, gy);
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) grid[x][y].isRoom = !(x === 0 || x === gx - 1 || y === 0 || y === gy - 1);
		let r = 0;
		for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) { const c = grid[x][y]; if (c.isRoom) plainRoom(c, lx, ly, x, y, 5, 4, 2, r++); else plainAnchor(c, lx, ly, x, y); }
		for (let x = 0; x < gx - 1; x++) { link(grid, x, 0, 0); link(grid, x, gy - 1, 0); }
		for (let y = 0; y < gy - 1; y++) { link(grid, 0, y, 3); link(grid, gx - 1, y, 3); }
		assignConnections(grid, gx, gy);
		createConnections(grid, gx, gy, lx, ly, false);
		ensureConnected(grid, gx, gy, lx, ly);
		tail(grid, gx, gy);
	}
	function crossroadsFloor() {
		const gx = 5, gy = 4, lx = [0, 11, 22, 33, 44, 56], ly = [1, 9, 16, 23, 31], grid = newGrid();
		initGrid(grid, gx, gy);
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) grid[x][y].isRoom = x === 0 || x === gx - 1 || y === 0 || y === gy - 1;
		for (const [x, y] of [[0, 0], [gx - 1, 0], [0, gy - 1], [gx - 1, gy - 1]]) grid[x][y].isInvalid = true;
		let r = 0;
		for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) { const c = grid[x][y]; if (c.isInvalid) continue; if (c.isRoom) plainRoom(c, lx, ly, x, y, 5, 4, 2, r++); else plainAnchor(c, lx, ly, x, y); }
		for (let x = 1; x < gx - 1; x++) for (let y = 0; y < gy - 1; y++) link(grid, x, y, 3);
		for (let y = 1; y < gy - 1; y++) for (let x = 0; x < gx - 1; x++) link(grid, x, y, 0);
		createConnections(grid, gx, gy, lx, ly, true);
		ensureConnected(grid, gx, gy, lx, ly);
		tail(grid, gx, gy);
	}
	function twoRoomsFloor() {
		const gx = 2, gy = 1, lx = [2, 28, 54], ly = [2, 30], grid = newGrid();
		initGrid(grid, gx, gy);
		let r = 0;
		for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) plainRoom(grid[x][y], lx, ly, x, y, 10, 16, 1, r++);
		link(grid, 0, 0, 0);
		createConnections(grid, gx, gy, lx, ly, false);
		monsterHouse(grid, gx, gy, 999);
	}
	function lineFloor() {
		const gx = 5, gy = 1, lx = [0, 11, 22, 33, 44, 56], ly = [4, 15], grid = newGrid();
		initGrid(grid, gx, gy);
		assignRooms(grid, gx, gy, props.roomDensity | 0);
		createRoomsAndAnchors(grid, gx, gy, lx, ly, props.roomFlags | 0);
		assignConnections(grid, gx, gy);
		createConnections(grid, gx, gy, lx, ly, true);
		ensureConnected(grid, gx, gy, lx, ly);
		tail(grid, gx, gy);
	}
	function crossFloor() {
		const gx = 3, gy = 3, lx = [11, 22, 33, 44], ly = [2, 11, 20, 30], grid = newGrid();
		initGrid(grid, gx, gy);
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) grid[x][y].isRoom = true;
		for (const [x, y] of [[0, 0], [2, 0], [0, 2], [2, 2]]) grid[x][y].isInvalid = true;
		createRoomsAndAnchors(grid, gx, gy, lx, ly, props.roomFlags | 0);
		link(grid, 0, 1, 0); link(grid, 1, 1, 0); link(grid, 1, 0, 3); link(grid, 1, 1, 3);
		createConnections(grid, gx, gy, lx, ly, true);
		ensureConnected(grid, gx, gy, lx, ly);
		tail(grid, gx, gy);
	}
	function mergeVertically(grid, x, y1, dy) {
		const a = grid[x][y1], b = grid[x][y1 + dy];
		const x0 = Math.min(a.sx, b.sx), y0 = a.sy, x1 = Math.max(a.ex, b.ex), y1e = b.ey, r = rm(a.sx, a.sy);
		carve(x0, y0, x1, y1e, r);
		a.sx = x0; a.sy = y0; a.ex = x1; a.ey = y1e;
		b.isMerged = true; a.isMerged = true; b.isConnected = false; b.hasBeenMerged = true;
	}
	function beetleFloor() {
		const gx = 3, gy = 3, lx = [5, 15, 35, 50], ly = [2, 11, 20, 30], grid = newGrid();
		initGrid(grid, gx, gy);
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) grid[x][y].isRoom = true;
		createRoomsAndAnchors(grid, gx, gy, lx, ly, props.roomFlags | 0);
		for (let y = 0; y < gy; y++) { link(grid, 0, y, 0); link(grid, 1, y, 0); }
		createConnections(grid, gx, gy, lx, ly, true);
		mergeVertically(grid, 1, 0, 1);
		mergeVertically(grid, 1, 0, 2);
		ensureConnected(grid, gx, gy, lx, ly);
		tail(grid, gx, gy);
	}
	function outerRoomsFloor(gx, gy) {
		const [lx, ly] = gridPositions(gx, gy), grid = newGrid();
		initGrid(grid, gx, gy);
		for (let x = 0; x < gx; x++) for (let y = 0; y < gy; y++) { grid[x][y].isRoom = true; if (x >= 1 && x <= gx - 2 && y >= 1 && y <= gy - 2) grid[x][y].isInvalid = true; }
		createRoomsAndAnchors(grid, gx, gy, lx, ly, props.roomFlags | 0);
		// (the links exactly as the original writes them, its slips included)
		for (let x = 0; x < gx - 1; x++) {
			if (x !== 0) { grid[x][0].cR = true; grid[x][gy - 1].cR = true; }
			if (x < gx - 2) { grid[x + 1][0].cL = true; grid[x + 1][gy - 1].cL = true; }
		}
		for (let y = 0; y < gy - 1; y++) {
			if (y !== 0) { grid[0][y].cT = true; grid[gx - 1][y].cT = true; }
			if (y < gy - 2) { grid[0][y].cB = true; grid[gx - 1][y].cB = true; }
		}
		createConnections(grid, gx, gy, lx, ly, false);
		ensureConnected(grid, gx, gy, lx, ly);
		mazeRoom(props.mazeRoomChance | 0);
		tail(grid, gx, gy);
		secondaryStructures(grid, gx, gy);
	}

	// ================================================================ 5.13, 3.6: junctions
	function finalizeJunctions() {
		for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
			if (tt(x, y) !== T_FLOOR) continue;
			const r = room[y * W + x];
			if (r === NO_ROOM) {
				const mark = (nx, ny) => { if (room[ny * W + nx] !== NO_ROOM) { terrain[ny * W + nx] |= T_JUNCTION; if (tt(nx, ny) === T_LIQUID) setT(nx, ny, T_FLOOR); } };
				if (x > 0) mark(x - 1, y);
				if (y > 0) mark(x, y - 1);
				if (y < H - 1) mark(x, y + 1);
				if (x < W - 1) mark(x + 1, y);
			} else if (r === ANCHOR) room[y * W + x] = NO_ROOM;
		}
	}
	function corridorJunctions() {
		for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
			const i = y * W + x;
			terrain[i] &= ~T_CUT;
			if (room[i] !== NO_ROOM || (terrain[i] & 3) !== T_FLOOR) continue;
			let n = 0;
			if (x > 0 && tt(x - 1, y) === T_FLOOR) n++;
			if (y > 0 && tt(x, y - 1) === T_FLOOR) n++;
			if (x < W - 2 && tt(x + 1, y) === T_FLOOR) n++;
			if (x < H - 2 && tt(x, y + 1) === T_FLOOR) n++;   // (the original's slip: it tests x against the HEIGHT)
			if (n > 2) terrain[i] |= T_JUNCTION;
		}
	}

	// ================================================================ 5.14: rivers and lakes
	function secondaryTerrain(flag) {
		if (!((props.roomFlags | 0) & flag)) return;
		const near = (x, y) => { let n = 0; for (let d = 0; d < 8; d++) if (tt(x + OFF[d][0], y + OFF[d][1]) === T_LIQUID) n++; return n; };
		const margin = (x, y) => x < 2 || x >= W - 2 || y < 2 || y >= H - 2;
		for (let n = RIVERS[R(8)]; n !== 0; n--) {
			let upwards, y, dirY;
			if (R(100) < 50) { upwards = true; y = H - 1; dirY = -1; } else { upwards = false; y = 0; dirY = 1; }
			let untilLake = R(50) + 10, x = RR(2, W - 2), dirX = 0;
			river: for (;;) {
				let fill = R(6) + 2;
				while (fill !== 0) {
					if (x >= 0 && x < W) {
						if (tt(x, y) === T_LIQUID) break river;
						liquidOnWall(x, y);
					}
					fill--;
					x += dirX; y += dirY;
					if (y < 0 || y >= H) break;
					untilLake--;
					if (untilLake !== 0) continue;
					for (let j = 0; j < 64; j++) {
						const ox = R(7) - 3, oy = R(7) - 3;
						if (margin(x + ox, y + oy)) continue;
						if (near(x + ox, y + oy) > 0) liquidOnWall(x + ox, y + oy);
					}
					for (let ox = -3; ox <= 3; ox++) for (let oy = -3; oy <= 3; oy++) {
						if (margin(x + ox, y + oy)) continue;
						if (near(x + ox, y + oy) >= 4) liquidOnWall(x + ox, y + oy);
					}
				}
				if (dirX !== 0) { dirY = upwards ? -1 : 1; dirX = 0; } else { dirX = R(100) < 50 ? -1 : 1; dirY = 0; }
				if (y < 0 || y >= H) break;
			}
		}
		for (let k = 0; k < (props.standaloneLakeDensity | 0); k++) {
			let rx = 0, ry = 0, n = 0;
			while (n < 200) {
				rx = RR(0, W); ry = RR(0, H);
				if (rx >= 1 && rx < W - 1 && ry >= 1 && ry < H - 1) break;
				n++;
			}
			if (n === 200) continue;
			const table = Array.from({ length: 10 }, (_, x) => Array.from({ length: 10 }, (_2, y) => x === 0 || x === 9 || y === 0 || y === 9));
			for (let i = 0; i < 80; i++) {
				const x = R(8) + 1, y = R(8) + 1;
				if (table[x - 1][y] || table[x + 1][y] || table[x][y - 1] || table[x][y + 1]) table[x][y] = true;
			}
			for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) if (!table[x][y]) liquidOnWall(x + rx - 5, y + ry - 5);
		}
		for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
			if (tt(x, y) !== T_LIQUID) continue;
			if ((tf(x, y) & (T_SHOP | T_MONSTER_HOUSE | T_UNBREAKABLE)) || (spawn[y * W + x] & S_STAIRS)) setT(x, y, T_FLOOR);
			else if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) setT(x, y, T_WALL);
		}
	}

	// ================================================================ 6: where the stairs, items, traps, the player and enemies go
	function spots(test) {
		const list = [];
		for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (test(terrain[y * W + x], spawn[y * W + x], room[y * W + x], x, y)) list.push(y * W + x);
		return list;
	}
	function shuffle(list) {
		const n = list.length;
		for (let i = 0; i < n * 2; i++) { const a = R(n), b = R(n); const t = list[a]; list[a] = list[b]; list[b] = t; }
	}
	/** Shuffle, pick a start, flag `n` spots in a row (wrapping round). */
	function scatter(list, n, each) {
		shuffle(list);
		let idx = R(list.length);
		for (; n > 0; n--) { each(list[idx]); if (++idx === list.length) idx = 0; }
	}
	const isFloor = (t) => (t & 3) === T_FLOOR;
	function spawnNonEnemies(emptyMH) {
		if (stairs[0] === -1 || stairs[1] === -1) {
			const list = spots((t, s, r) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_JUNCTION | T_UNBREAKABLE)) && !(s & (S_ENEMY | S_SPECIAL)));
			if (list.length) {
				const i = list[R(list.length)];
				spawn[i] |= S_STAIRS; spawn[i] &= ~S_ITEM;
				stairs = [i % W, (i / W) | 0];
			}
		}
		{
			const list = spots((t, s, r) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_MONSTER_HOUSE | T_JUNCTION | T_UNBREAKABLE)));
			if (list.length) {
				let n = props.itemDensity | 0;
				if (n !== 0) { n = RR(n - 2, n + 2); if (n <= 0) n = 1; }
				if (n > 0) scatter(list, n, (i) => { spawn[i] |= S_ITEM; });
			}
		}
		{
			const list = spots((t) => (t & 3) === T_WALL);
			if (list.length) {
				let n = props.buriedItemDensity | 0;
				if (n !== 0) n = RR(n - 2, n + 2);
				if (n > 0) scatter(list, n, (i) => { spawn[i] |= S_ITEM; });
			}
		}
		if (!emptyMH) {
			const list = spots((t) => (t & T_MONSTER_HOUSE) && !(t & (T_SHOP | T_JUNCTION)));
			if (list.length) {
				let n = RR(div(list.length, 2), div(list.length * 8, 10));
				if (n < 6) n = 6;
				if (n >= 7) n = 7;
				scatter(list, n, (i) => { if (R(2) !== 0) spawn[i] |= S_ITEM; else if (canChangeLeader) spawn[i] |= S_TRAP; });
			}
		}
		{
			const list = spots((t, s, r) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_JUNCTION | T_UNBREAKABLE)) && !(s & S_ITEM));
			if (list.length) {
				const d = props.trapDensity | 0;
				let n = RR(div(d, 2), d);
				if (n > 0) { if (n >= 56) n = 56; scatter(list, n, (i) => { spawn[i] |= S_TRAP; }); }
			}
		}
		if (player[0] === -1 || player[1] === -1) {
			const list = spots((t, s, r) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_JUNCTION | T_UNBREAKABLE)) && !(s & (S_ITEM | S_ENEMY | S_TRAP)));
			if (list.length) { const i = list[R(list.length)]; player = [i % W, (i / W) | 0]; }
		}
	}
	function spawnEnemies(emptyMH) {
		const d = props.enemyDensity | 0;
		let n;
		if (d > 0) { n = RR(div(d, 2), d); if (n < 1) n = 1; } else n = Math.abs(d);
		const notPlayer = (x, y) => !(x === player[0] && y === player[1]);
		{
			const list = spots((t, s, r, x, y) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_JUNCTION | T_UNBREAKABLE)) && !(s & (S_ITEM | S_STAIRS)) && notPlayer(x, y));
			if (list.length) {
				if (unk44) n++;
				if (n !== 0) scatter(list, n, (i) => { spawn[i] |= S_ENEMY; });
			}
		}
		if (!forceMH) return;
		let cap = emptyMH ? 3 : MH_MAX_MONS;
		cap = div(cap * 3, 2);
		const list = spots((t, s, r, x, y) => isFloor(t) && r !== NO_ROOM && !(t & (T_SHOP | T_UNBREAKABLE)) && (t & T_MONSTER_HOUSE) && notPlayer(x, y));
		if (list.length) {
			let m = RR(div(7 * list.length, 10), div(8 * list.length, 10));
			if (m === 0) m = 1;
			if (m >= cap) m = cap;
			scatter(list, m, (i) => { spawn[i] |= S_ENEMY; });
		}
	}
	function resolveInvalidSpawns() {
		for (let i = 0; i < N; i++) {
			if ((terrain[i] & 3) !== T_FLOOR) {
				if (terrain[i] & (T_UNBREAKABLE | T_IMPASSABLE)) spawn[i] &= ~S_ITEM;
				spawn[i] &= ~S_TRAP;
			}
			if (spawn[i] & S_STAIRS) { terrain[i] |= T_STAIRS; spawn[i] &= ~S_TRAP; }
			if (spawn[i] & S_ITEM) spawn[i] &= ~S_TRAP;
		}
	}
	// 5.15: every open tile reachable from the stairs, without cutting corners
	function stairsReachable() {
		const f = new Uint8Array(N);
		for (let i = 0; i < N; i++) {
			const t = terrain[i];
			if ((t & 3) !== T_FLOOR && !(t & T_CUT)) f[i] |= 1;
			if ((t & 3) === T_LIQUID && !(t & T_CUT)) f[i] |= 2;
		}
		f[stairs[1] * W + stairs[0]] |= 0x50;
		for (;;) {
			let any = false;
			for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
				const i = y * W + x;
				if (!(f[i] & 0x40) || (f[i] & 0x80)) continue;
				f[i] = (f[i] & ~0x40) | 0x80;
				any = true;
				const q = (nx, ny, mask) => { if (inb(nx, ny) && !(f[ny * W + nx] & mask)) f[ny * W + nx] |= 0x40; };
				const solid = (nx, ny) => inb(nx, ny) && (f[ny * W + nx] & 1);
				q(x - 1, y, 0x83); q(x + 1, y, 0x83); q(x, y - 1, 0x83); q(x, y + 1, 0x83);
				for (const dx of [-1, 1]) for (const dy of [-1, 1]) if (!solid(x + dx, y) && !solid(x, y + dy)) q(x + dx, y + dy, 0x87);
			}
			if (!any) break;
		}
		for (let i = 0; i < N; i++) if (!(f[i] & 0x87) && !(terrain[i] & T_UNBREAKABLE)) return false;
		return true;
	}
	// 6.4: the shop shrinks to a random carpet and gets its goods
	function shopContents() {
		const S = shopPos;
		let rangeX = RR(3, (S.maxX - S.minX) - 2); if (rangeX < 3) rangeX = 3;
		let rangeY = RR(3, (S.maxY - S.minY) - 2); if (rangeY < 3) rangeY = 3;
		const r = RR(2, 4);
		for (let i = 0; i < r; i++) {
			if (S.maxX - S.minX <= rangeX) break;
			if (R(100) < 50) { for (let y = S.minY; y < S.maxY; y++) clrT(S.minX, y, T_SHOP); S.minX++; } else { S.maxX--; for (let y = S.minY; y < S.maxY; y++) clrT(S.maxX, y, T_SHOP); }
		}
		for (let i = 0; i < r; i++) {
			if (S.maxY - S.minY <= rangeY) break;
			if (R(100) < 50) { for (let x = S.minX; x < S.maxX; x++) clrT(x, S.minY, T_SHOP); S.minY++; } else { S.maxY--; for (let x = S.minX; x < S.maxX; x++) clrT(x, S.maxY, T_SHOP); }
		}
		for (let x = S.minX; x < S.maxX; x++) for (let y = S.minY; y < S.maxY; y++) if ((tf(x, y) & T_SHOP) && (tf(x, y) & T_JUNCTION)) clrT(x, y, T_SHOP);
		const midX = div(S.minX + S.maxX, 2) - 1, midY = div(S.minY + S.maxY, 2) - 1;
		for (let xi = 0; xi < 3; xi++) for (let yi = 0; yi < 3; yi++) {
			const x = midX + xi, y = midY + yi, t = tf(x, y);
			if (!(t & T_SHOP) || (t & (T_MONSTER_HOUSE | T_JUNCTION))) continue;
			if (SHOP_ITEM_CHANCE[yi][xi] > R(100)) orS(x, y, S_ITEM);
		}
	}

	// ================================================================ 3: the floor
	resetFloor();
	const layout = props.layout | 0;
	let spawnAttempts;
	for (spawnAttempts = 0; spawnAttempts < 10; spawnAttempts++) {
		player = [-1, -1]; stairs = [-1, -1];
		let g;
		for (g = 0; g < 10; g++) {
			if (g > 0) budget = 0;
			shopMid = [-1, -1];
			resetFloor();
			player = [-1, -1]; forceMH = false;
			let gx, gy, tries = 32;
			for (;;) {
				if (layout !== 8) { gx = RR(2, 9); gy = RR(2, 8); } else { gx = RR(2, 5); gy = RR(2, 4); }
				if (gx <= 6 && gy <= 4) break;
				if (--tries === 0) { gx = 4; gy = 4; break; }
			}
			if (div(W, gx) < 8) gx = 1;
			if (div(H, gy) < 8) gy = 1;
			forceMH = false; mhRoom = NO_ROOM;
			switch (layout % 16) {
				case 1: gx = 4; gy = R(2) + 2; floorSize = SMALL; standardFloor(gx, gy); secondaryGen = true; break;
				case 11: gx = 4; gy = R(2) + 2; floorSize = MEDIUM; standardFloor(gx, gy); secondaryGen = true; break;
				case 2: oneRoomFloor(); forceMH = true; break;
				case 3: outerRingFloor(); secondaryGen = true; break;
				case 4: crossroadsFloor(); secondaryGen = true; break;
				case 5: twoRoomsFloor(); forceMH = true; break;
				case 6: lineFloor(); secondaryGen = true; break;
				case 7: crossFloor(); break;
				case 9: beetleFloor(); break;
				case 10: outerRoomsFloor(gx, gy); secondaryGen = true; break;
				default: standardFloor(gx, gy); secondaryGen = true; break;
			}
			for (const y of [1, H - 2]) for (let x = 0; x < W; x++) { const i = y * W + x; terrain[i] = x === 0 || x === W - 1 ? T_IMPASSABLE : 0; spawn[i] = 0; room[i] = NO_ROOM; }
			for (let i = 0; i < N; i++) if (terrain[i] & T_IMPASSABLE) terrain[i] &= ~3;
			let roomTiles = 0;
			const seen = new Set();
			for (let i = 0; i < N; i++) if ((terrain[i] & 3) === T_FLOOR && room[i] <= 240) { roomTiles++; if (room[i] < 64) seen.add(room[i]); }
			if (roomTiles >= 30 && seen.size >= 2) break;
		}
		if (g === 10) { shopMid = [-1, -1]; oneRoomFloor(); forceMH = true; }
		finalizeJunctions();
		if (secondaryGen) secondaryTerrain(ROOM_FLAG_LIQUID);
		const emptyMH = R(100) < (props.itemlessMonsterHouseChance | 0);
		spawnNonEnemies(emptyMH);
		spawnEnemies(emptyMH);
		resolveInvalidSpawns();
		if (player[0] !== -1 && player[1] !== -1 && stairs[0] !== -1 && stairs[1] !== -1 && stairsReachable()) break;
	}
	if (spawnAttempts === 10) {
		shopMid = [-1, -1];
		resetFloor(); oneRoomFloor(); forceMH = true;
		finalizeJunctions();
		spawnNonEnemies(false); spawnEnemies(false); resolveInvalidSpawns();
	}
	const keeper = shopMid[0] >= 0 && shopMid[1] >= 0 ? shopMid : null;
	const hasShopNow = shopPos.minX >= 0;
	if (hasShopNow) shopContents();
	corridorJunctions();
	if (water) for (let i = 0; i < N; i++) if ((terrain[i] & 3) === T_LIQUID) terrain[i] |= T_FLOOR;
	return { terrain, spawn, room, player, stairs, mh: mhRoom, forceMh: forceMH, shop: hasShopNow ? { ...shopPos } : null, shopKeeper: keeper, attempts: spawnAttempts, rng: rng.state };
}

/** A floor as text: # wall, . floor, ~ liquid, > stairs, @ the player, $ shop floor, i item, ^ trap, e enemy. */
export function floorText(f) {
	const rows = [];
	for (let y = 0; y < H; y++) {
		let s = '';
		for (let x = 0; x < W; x++) {
			const i = y * W + x, t = f.terrain[i], sp = f.spawn[i], k = t & 3;
			s += x === f.player[0] && y === f.player[1] ? '@' : sp & S_STAIRS ? '>' : k === T_WALL ? (sp & S_ITEM ? 'b' : '#') : sp & S_ENEMY ? 'e' : sp & S_ITEM ? 'i' : sp & S_TRAP ? '^' : k !== T_FLOOR ? '~' : t & T_SHOP ? '$' : t & T_MONSTER_HOUSE ? 'm' : f.room[i] === NO_ROOM ? ',' : '.';
		}
		rows.push(s);
	}
	return rows.join('\n');
}
