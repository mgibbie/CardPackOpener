// gen_crystal_collision_fix.mjs — Crystal cells whose converted collision is wrong.
//
// Our converted layouts carry each cell's collision in its grid value (bits
// 0x0C00). For the Celadon Mansion (TILESET_MANSION: 1F-3F and the roof) the
// converter baked those bits per cell from the wrong place — the same metatile
// reads solid in one cell and open in the next — so the roof was a wall from end
// to end and its house door could not be reached (2026-10-07, the tile-reach
// audit). pokecrystal's own collision is the truth: every map's .blk block, its
// tileset's tilecoll quadrant, and that collision's permission
// (data/collision/collision_permissions.asm: LAND/WATER open, WALL shut).
//
// Writes tracked overworld/crystal_collision_fix.json
//   { maps: { MAP_ID: [[x, y, open(1)|shut(0)], ...] } }
// for the cells where ours disagrees; World.loadBundle (engine.js) and
// tools/audit_tile_reach.mjs set those bits at load. Left alone:
//   - warp tiles (the engine walks onto a warp whatever its bits say)
//   - COLL_BUOY: a WALL in Crystal, open sea in our layouts on purpose (Surf
//     goes around them as water) — 838 cells, not a conversion slip
//
//   node tools/gen_crystal_collision_fix.mjs
import fs from 'fs';
import path from 'path';
import { loadCrystalMaps } from './crystal_blocks.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'overworld', 'data');
// the Magepunk66 checkout: $MAGEPUNK66, else the first ancestor folder with one beside it
const MP66 = process.env.MAGEPUNK66 || (() => {
	for (let d = ROOT; ; d = path.dirname(d)) {
		const c = path.join(path.dirname(d), 'Magepunk66');
		if (fs.existsSync(path.join(c, 'Reference', 'pokecrystal'))) return c;
		if (path.dirname(d) === d) return path.resolve(ROOT, '..', 'Magepunk66');
	}
})();
const CR = path.join(MP66, 'Reference', 'pokecrystal');
const OUT = path.join(ROOT, 'overworld', 'crystal_collision_fix.json');
const read = f => fs.readFileSync(f, 'utf8');

const COLL = {};
for (const l of read(path.join(CR, 'constants', 'collision_constants.asm')).split(/\r?\n/)) {
	const m = /DEF COLL_(\w+)\s+EQU \$(\w+)/.exec(l);
	if (m) COLL[m[1]] = parseInt(m[2], 16);
}
const PERM = [];
for (const l of read(path.join(CR, 'data', 'collision', 'collision_permissions.asm')).split(/\r?\n/)) {
	const m = /^\s*db\s+(\w+)/.exec(l);
	if (m) PERM.push(m[1]);
}
// TILESET_RADIO_TOWER -> TilesetRadioTowerColl -> its INCLUDEd collision file
const collFile = {};
{
	const g = read(path.join(CR, 'gfx', 'tilesets.asm')).split(/\r?\n/);
	for (let i = 0; i < g.length; i++) {
		const m = /^Tileset(\w+)Coll::/.exec(g[i]);
		const inc = m && /INCLUDE "([^"]+)"/.exec(g[i + 1] || '');
		if (inc) collFile[m[1]] = path.join(CR, inc[1]);
	}
}
const camel = t => t.replace(/^TILESET_/, '').toLowerCase().split('_').map(s => s[0].toUpperCase() + s.slice(1)).join('');
const quads = {};
function blockColl(ts) {
	if (ts in quads) return quads[ts];
	const f = collFile[camel(ts)];
	quads[ts] = f ? [...read(f).matchAll(/tilecoll\s+(\w+),\s*(\w+),\s*(\w+),\s*(\w+)/g)].map(m => m.slice(1, 5).map(n => COLL[n] ?? 0)) : null;
	return quads[ts];
}

const out = {};
let total = 0;
const perMap = [];
for (const c of loadCrystalMaps(ROOT, CR)) {
	const bc = blockColl(c.ts);
	if (!bc) continue;
	const map = JSON.parse(read(path.join(DATA, 'maps', c.stem + '_map.json')));
	const warps = new Set((map.warp_events || []).map(w => +w.x + ',' + +w.y));
	const cells = [];
	for (let y = 0; y < c.hb * 2; y++) for (let x = 0; x < c.wb * 2; x++) {
		if (warps.has(x + ',' + y)) continue;
		const coll = bc[c.blk[(y >> 1) * c.wb + (x >> 1)]]?.[(y & 1) * 2 + (x & 1)];
		if (coll == null || coll === COLL.BUOY) continue;
		const open = /^(LAND|WATER)_TILE/.test(PERM[coll] || 'WALL_TILE');
		const v = c.grid[y]?.[x];
		if (v == null) continue;
		const ours = (v & 0x0C00) === 0;
		if (ours !== open) cells.push([x, y, open ? 1 : 0]);
	}
	if (cells.length) { out[c.id] = cells; total += cells.length; perMap.push(`${c.stem} ${cells.length}`); }
}
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_collision_fix.mjs', maps: out }) + '\n');
console.log(`collision fixed: ${total} cell(s) on ${Object.keys(out).length} map(s): ${perMap.join(', ')}`);
