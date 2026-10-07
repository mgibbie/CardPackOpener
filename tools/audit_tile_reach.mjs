// audit_tile_reach.mjs — tile-level reachability across the overworld data:
// a flood fill that walks tiles (a cell is walkable when its collision bits are
// clear, or it is a warp), steps off map edges through the map connections, and
// rides every warp it stands on. It is OPTIMISTIC — water counts as walkable
// (SURF), ledges as two-way, NPCs/boulders/cut trees/scripted gates are ignored —
// so anything it can NOT reach is sealed for every player, whatever they carry.
//
//   node tools/audit_tile_reach.mjs                        Johto audit (from New Bark)
//   node tools/audit_tile_reach.mjs MAP_ROUTE_34 9 1       what that tile reaches
//   node tools/audit_tile_reach.mjs --region=HOENN|KANTO   the other regions
//
// The audit lists every warp (door/stairs) on a reached map that the fill never
// stood on: each one is a door you can see but can't walk to.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'overworld/data');
const COLLISION_MASK = 0x0C00;
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'));
const cache = new Map();
export function loadMap(id) {
	if (cache.has(id)) return cache.get(id);
	let out = null;
	const name = index[id];
	try {
		const map = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', name + '_map.json'), 'utf8'));
		const layout = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', map.layout + '.json'), 'utf8'));
		out = { id, name, map, layout, warps: map.warp_events || [] };
	} catch (e) { out = null; }
	cache.set(id, out);
	return out;
}
const normDir = d => ({ north: 'up', south: 'down', east: 'right', west: 'left' })[d] || d;
export function walkable(m, x, y) {
	if (x < 0 || y < 0 || x >= m.layout.width || y >= m.layout.height) return false;
	if (m.warps.some(w => w.x === x && w.y === y)) return true;
	const v = m.layout.map[y]?.[x];
	return v != null && (v & COLLISION_MASK) === 0; // 0 is a real cell (metatile 0)
}
// where a step off the edge of m at (x,y) lands
function across(m, x, y) {
	const W = m.layout.width, H = m.layout.height;
	const dir = y < 0 ? 'up' : y >= H ? 'down' : x < 0 ? 'left' : 'right';
	for (const c of m.map.connections || []) {
		if (normDir(c.direction) !== dir) continue;
		const n = loadMap(c.map);
		if (!n) continue;
		const nx = dir === 'left' ? x + n.layout.width : dir === 'right' ? x - W : x - c.offset;
		const ny = dir === 'up' ? y + n.layout.height : dir === 'down' ? y - H : y - c.offset;
		if (nx >= 0 && ny >= 0 && nx < n.layout.width && ny < n.layout.height) return [n, nx, ny];
	}
	return null;
}
export function flood(startId, sx, sy, { maps: limit } = {}) {
	const seen = new Map(); // mapId -> Set("x,y")
	const q = [];
	const push = (m, x, y) => {
		if (limit && !limit.has(m.id)) return;
		let s = seen.get(m.id);
		if (!s) seen.set(m.id, s = new Set());
		const k = x + ',' + y;
		if (s.has(k)) return;
		s.add(k);
		q.push([m, x, y]);
	};
	const m0 = loadMap(startId);
	if (!m0) throw new Error('no map ' + startId);
	push(m0, sx, sy);
	while (q.length) {
		const [m, x, y] = q.pop();
		const w = m.warps.find(w => w.x === x && w.y === y);
		if (w && /^MAP_/.test(w.dest_map) && w.dest_map !== 'MAP_DYNAMIC') {
			const d = loadMap(w.dest_map);
			const i = parseInt(w.dest_warp_id, 10);
			const dw = d && !isNaN(i) ? d.warps[i] : null;
			if (dw) push(d, dw.x, dw.y);
		}
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < m.layout.width && ny < m.layout.height) {
				if (walkable(m, nx, ny)) push(m, nx, ny);
			} else {
				const a = across(m, nx, ny);
				if (a && walkable(a[0], a[1], a[2])) push(a[0], a[1], a[2]);
			}
		}
	}
	return seen;
}

const START = { JOHTO: ['MAP_NEW_BARK_TOWN', 13, 6], KANTO: ['MAP_PALLET_TOWN', 6, 8], HOENN: ['MAP_LITTLEROOT_TOWN', 10, 10] };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	if (args[0] && args[0].startsWith('MAP_')) {
		const seen = flood(args[0], +args[1], +args[2]);
		for (const [id, s] of seen) console.log(id, s.size);
	} else {
		const region = (args.find(a => a.startsWith('--region=')) || '--region=JOHTO').split('=')[1];
		const [id, x, y] = START[region];
		const seen = flood(id, x, y);
		let unreached = 0;
		for (const [mid, s] of [...seen].sort()) {
			const m = loadMap(mid);
			const miss = m.warps.filter(w => !s.has(w.x + ',' + w.y));
			if (miss.length) { unreached += miss.length; console.log(`${m.name}: ${miss.map(w => `(${w.x},${w.y})->${String(w.dest_map).replace('MAP_', '')}`).join(' ')}`); }
		}
		console.log(`${region}: ${seen.size} maps reached; ${unreached} warps on reached maps never walked to`);
	}
}
