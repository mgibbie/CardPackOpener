// gen_crystal_dead_warps.mjs — Crystal warp_events that the GBC engine never fires.
//
// In pokecrystal a warp_event is only a destination table entry. Stepping onto its
// square warps you ONLY when that square's collision is a warp: a pit (COLL_PIT), or
// anything in the $7x warp row — doors, staircases, ladders, cave mouths, warp
// panels, the carpets (home/map.asm WarpCheck -> engine/overworld/tile_events.asm
// CheckWarpCollision). Every other warp_event is a LANDING square (you arrive there
// from a hole or the floor above, and walking back over it does nothing) or a
// leftover the maps keep "inaccessible, left over from G/S".
//
// This port fired every warp_event underfoot. Burned Tower B1F's (10,8) — the square
// between where you land and the beasts — sent the player straight back up to 1F,
// so the ReleaseTheBeasts scene at (10,6) could not be walked to and the Tin Tower
// beasts never woke (bug:1792417108739, 2026-10-19). The same shape: Burned Tower
// 1F's G/S leftovers, the Olivine Lighthouse and Ruins of Alph landing squares,
// Ice Path B2F, Blackthorn and Ecruteak gym landings.
//
// A square a script REBUILDS (changeblock) is left alone: the Elite Four doors and
// the Mahogany Mart stairs become warps when the story opens them.
//
// Writes tracked overworld/crystal_dead_warps_data.js { <map stem>: ["x,y", ...] };
// World.load (engine.js) marks those warps inert: never fired by a step, never a
// free pass through their own collision — still the arrival square of whatever
// warp names them.
//
//   node tools/gen_crystal_dead_warps.mjs            (report)
//   node tools/gen_crystal_dead_warps.mjs --write
// MAGEPUNK_OWDATA=<dir> reads another checkout's overworld/data (a worktree has none).
import fs from 'fs';
import path from 'path';
import { loadCrystalMaps } from './crystal_blocks.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DATA_ROOT = process.env.MAGEPUNK_OWDATA ? path.resolve(process.env.MAGEPUNK_OWDATA, '..', '..') : ROOT;
const DATA = path.join(DATA_ROOT, 'overworld', 'data');
const MP66 = process.env.MAGEPUNK66 || (() => {
	for (let d = ROOT; ; d = path.dirname(d)) {
		const c = path.join(path.dirname(d), 'Magepunk66');
		if (fs.existsSync(path.join(c, 'Reference', 'pokecrystal'))) return c;
		if (path.dirname(d) === d) return path.resolve(ROOT, '..', 'Magepunk66');
	}
})();
const CR = path.join(MP66, 'Reference', 'pokecrystal');
const OUT = path.join(ROOT, 'overworld', 'crystal_dead_warps_data.js');
const read = f => fs.readFileSync(f, 'utf8');

const COLL = {};
for (const l of read(path.join(CR, 'constants', 'collision_constants.asm')).split(/\r?\n/)) {
	const m = /DEF COLL_(\w+)\s+EQU \$(\w+)/.exec(l);
	if (m) COLL[m[1]] = parseInt(m[2], 16);
}
const NAME = Object.fromEntries(Object.entries(COLL).map(([k, v]) => [v, k]));
// CheckWarpCollision: COLL_PIT, COLL_PIT_68, or the HI_NYBBLE_WARPS ($70) row
const isWarpColl = c => c === COLL.PIT || c === COLL.PIT_68 || (c & 0xF0) === 0x70;

// TILESET_CAVE -> TilesetCaveColl -> its INCLUDEd collision file. Several labels can
// share one INCLUDE (TilesetCaveColl:: / TilesetDarkCaveColl::), so collect them all.
const collFile = {};
{
	let pending = [];
	for (const l of read(path.join(CR, 'gfx', 'tilesets.asm')).split(/\r?\n/)) {
		const m = /^Tileset(\w+)Coll::/.exec(l);
		if (m) { pending.push(m[1]); continue; }
		const inc = /INCLUDE "([^"]+)"/.exec(l);
		if (inc) for (const n of pending) collFile[n] = path.join(CR, inc[1]);
		pending = [];
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
const rows = [];
let live = 0, skippedCb = 0;
for (const c of loadCrystalMaps(DATA_ROOT, CR)) {
	const bc = blockColl(c.ts);
	if (!bc) continue;
	const map = JSON.parse(read(path.join(DATA, 'maps', c.stem + '_map.json')));
	// blocks a script rebuilds: their collision is the story's, not the .blk's
	let rebuilt = new Set();
	try {
		rebuilt = new Set([...read(path.join(CR, 'maps', (map.name || c.stem) + '.asm')).matchAll(/changeblock\s+(\d+),\s*(\d+)/g)]
			.map(m => ((+m[1]) >> 1) + ',' + ((+m[2]) >> 1)));
	} catch (e) { continue; }   // no source to check it against: leave the map alone
	(map.warp_events || []).forEach((w, i) => {
		const x = +w.x, y = +w.y;
		if (x < 0 || y < 0 || x >= c.wb * 2 || y >= c.hb * 2) return;
		const coll = bc[c.blk[(y >> 1) * c.wb + (x >> 1)]]?.[(y & 1) * 2 + (x & 1)];
		if (coll == null || isWarpColl(coll)) { live++; return; }
		if (rebuilt.has((x >> 1) + ',' + (y >> 1))) { skippedCb++; return; }
		(out[c.stem] = out[c.stem] || []).push(x + ',' + y);
		rows.push(`  ${c.stem} #${i} (${x},${y}) ${NAME[coll] || coll} -> ${w.dest_map}`);
	});
}
const n = Object.values(out).reduce((a, v) => a + v.length, 0);
console.log(`${live} live Crystal warps; ${n} on non-warp squares across ${Object.keys(out).length} maps (${skippedCb} more left alone: a changeblock rebuilds their block)`);
console.log(rows.join('\n'));
if (process.argv.includes('--write')) {
	const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
	fs.writeFileSync(OUT, '// GENERATED by tools/gen_crystal_dead_warps.mjs — do not edit.\n'
		+ '// { <map stem>: ["x,y", ...] }: Crystal warp_events on squares whose collision is not a\n'
		+ '// warp — landings and G/S leftovers the GBC never fires (see the generator).\n'
		+ 'export const DEAD_WARPS = ' + JSON.stringify(sorted, null, '\t') + ';\n');
	console.log('wrote ' + path.relative(ROOT, OUT));
}
