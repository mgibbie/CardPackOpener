// tile_reach_test.mjs — tester reports of sealed Johto areas (2026-10-05/07).
//
// Crystal's tilesets put a plain ground metatile at index 0, so a walkable cell
// can hold the grid value 0 — and the engine read 0 as "outside the map", walling
// off 1,012 walkable cells on 38 maps (Route 34's middle and its Ilex Forest gate
// landing, the Day Care's front door, most of Pewter / Viridian / Cerulean).
// This walks the REAL World.isPassable / isSurfable over the shipped map data,
// on foot (no SURF), and also guards the routes reported as sealed that are in
// fact the decomp's own geometry (Azalea from Route 33's lower path, Sprout Tower
// 3F via 1F's top corridor).
//   node overworld/tests/tile_reach_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'overworld/data');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const J = p => JSON.parse(fs.readFileSync(path.join(DATA, p), 'utf8'));

function side(name, primary) {
	try { return J(`tilesets/${primary ? 'primary' : 'secondary'}_${name}_metatiles.json`); } catch (e) { return null; }
}
const mangle = n => n.replace('gTileset_', '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
	.replace(/([A-Za-z])(\d+)/g, '$1_$2').toLowerCase().replace(/^_/, '').replace(/__/g, '_');
// a World standing on one map, with that map's real layout + tileset attributes
function worldOn(mapName) {
	const map = J(`maps/${mapName}_map.json`);
	const layout = J(`layouts/${map.layout}.json`);
	const ts = { primary: side(mangle(layout.primary_tileset), true), secondary: side(mangle(layout.secondary_tileset), false), primaryMetatileCount: 640 };
	const w = Object.create(World.prototype);
	w.current = { map, layout, ts };
	w.connections = [];
	w.warps = map.warp_events || [];
	return w;
}
// on foot: passable and not water
function reach(w, sx, sy) {
	const lay = w.current.layout, seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
	while (q.length) {
		const [x, y] = q.pop();
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
			if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height || seen.has(k)) continue;
			if (!w.isPassable(nx, ny) || w.isSurfable(nx, ny)) continue;
			seen.add(k); q.push([nx, ny]);
		}
	}
	return seen;
}

// ---- Route 34 (bug:1791379351112): Goldenrod -> Day Care door -> Ilex Forest gate ----
{
	const w = worldOn('Route34');
	A(w.gridAt(7, 12) === 0, 'Route 34 (7,12) is a metatile-0 grass cell in the shipped layout', String(w.gridAt(7, 12)));
	A(w.isPassable(7, 12), 'a metatile-0 cell is walkable (0 is a real tile, not "outside the map")');
	A(w.gridAt(-1, 5) == null && !w.isPassable(-1, 5), 'off the map (no connection loaded) is still nothing and still blocked');
	const r = reach(w, 9, 1);
	A(r.has('11,14') || r.has('11,15'), 'from the Goldenrod arrival (9,1) the Day Care door is walkable', String(r.size));
	A(r.has('13,37') && r.has('14,37'), 'Route 34 walks end to end: Goldenrod (9,1) -> the Ilex Forest gate (13,37)/(14,37)');
	A(r.has('10,26') || r.has('10,27') || r.has('9,26') || r.has('11,26'), "Picnicker Gina's spot in the middle section is reachable");
}

// ---- every Crystal-native metatile-0 cell is walkable ground ----
{
	let cells = 0, blocked = [];
	for (const f of fs.readdirSync(path.join(DATA, 'maps'))) {
		const name = f.replace(/_map\.json$/, '');
		let map, layout;
		try { map = J(`maps/${f}`); layout = J(`layouts/${map.layout}.json`); } catch (e) { continue; }
		if (layout._source !== 'crystal_native') continue;
		const w = worldOn(name);
		for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
			if (layout.map[y][x] !== 0) continue;
			cells++;
			if (!w.isPassable(x, y)) blocked.push(`${name}(${x},${y})`);
		}
	}
	A(cells > 900, 'the Crystal maps do hold metatile-0 cells (the case this guards)', String(cells));
	A(blocked.length === 0, `all ${cells} metatile-0 cells on Crystal maps are walkable`, `${blocked.length} blocked, e.g. ${blocked.slice(0, 4).join(' ')}`);
}

// ---- Azalea (bug:1791247206540): the town is entered from Route 33's LOWER path ----
{
	const r33 = reach(worldOn('Route33'), 11, 10); // the Union Cave exit
	A(r33.has('0,14') || r33.has('0,15'), "Route 33: Union Cave's exit (11,10) walks to the west edge at rows 14-15");
	const az = reach(worldOn('AzaleaTown'), 39, 14);
	A(az.has('15,9') && az.has('9,5') && az.has('10,15'), 'Azalea from its east edge (39,14): POKeMON CENTER, Kurt and the Gym doors are walkable');
	const strip = reach(worldOn('AzaleaTown'), 37, 1);
	A(!strip.has('15,9'), "Azalea's top-right strip is a dead end in the decomp too (Route 33's top rows, not the route)");
}

// ---- Sprout Tower (bug:1791276752701): 3F is reached through 1F's top corridor ----
{
	A(reach(worldOn('SproutTower1F'), 17, 3).has('2,6'), "Sprout Tower 1F: the east stairs' pocket runs along the top to the west stairs (2,6)");
	A(reach(worldOn('SproutTower2F'), 2, 6).has('10,14'), 'Sprout Tower 2F: the west stairs (2,6) lead down the west column to the 3F stairs (10,14)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
