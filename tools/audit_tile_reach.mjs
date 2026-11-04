// audit_tile_reach.mjs — tile-level reachability across the overworld data:
// a flood fill that walks tiles (a cell is walkable when its collision bits are
// clear, or it is a warp), steps off map edges through the map connections, and
// rides every warp it stands on. It is OPTIMISTIC — water counts as walkable
// (SURF), ledges as two-way and as hops (the JUMP tile carries you two tiles),
// NPCs/boulders are ignored, and a requirement counts as met: a CUT tree
// (cut_blocks.json) or a cell a script's changeblock opens (a CARD KEY shutter,
// a locked door: crystal_scriptvar_data.json) is passable — so anything it can
// NOT reach is sealed for every player, whatever they carry.
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
const COLLISION_FIX = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/crystal_collision_fix.json'), 'utf8')).maps || {}; } catch (e) { return {}; } })();
const cache = new Map();
export function loadMap(id) {
	if (cache.has(id)) return cache.get(id);
	let out = null;
	const name = index[id];
	try {
		const map = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', name + '_map.json'), 'utf8'));
		const layout = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', map.layout + '.json'), 'utf8'));
		// the engine's Crystal collision corrections (tools/gen_crystal_collision_fix.mjs)
		for (const [x, y, open] of COLLISION_FIX[id] || []) if (layout.map[y]?.[x] != null) layout.map[y][x] = open ? layout.map[y][x] & ~COLLISION_MASK : layout.map[y][x] | COLLISION_MASK;
		out = { id, name, map, layout, warps: map.warp_events || [] };
	} catch (e) { out = null; }
	cache.set(id, out);
	return out;
}
const normDir = d => ({ north: 'up', south: 'down', east: 'right', west: 'left' })[d] || d;

// A metatile's BEHAVIOR, read the way engine.js does (primary/secondary split at
// the primary sheet's tile capacity). Crystal ledges are a JUMP behavior on the
// tile you stand on: the hop clears the wall row below it, so a flood that only
// steps tile to tile never gets past one (Route 5's yard).
const MB_JUMP = { 0x38: [1, 0], 0x39: [-1, 0], 0x3A: [0, -1], 0x3B: [0, 1] };
const mangle = n => n.replace('gTileset_', '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
	.replace(/([A-Za-z])(\d+)/g, '$1_$2').toLowerCase().replace(/^_/, '').replace(/__/g, '_');
const SHARED_GRAPHICS = { firered: { SilphCo: 'Condominiums' } };
const tsCache = new Map();
function tilesetSide(name, isPrimary, game) {
	const key = [name, isPrimary, game].join('|');
	if (tsCache.has(key)) return tsCache.get(key);
	let out = null;
	if (name) {
		const pre = game === 'emerald' ? 'emerald_' : '';
		try {
			const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'tilesets', `${pre}${isPrimary ? 'primary_' : 'secondary_'}${mangle(name)}_metatiles.json`), 'utf8'));
			out = { attributes: meta.attributes || [] };
		} catch (e) { out = { attributes: [] }; }
		if (isPrimary) {
			const own = name.replace('gTileset_', ''), gfx = SHARED_GRAPHICS[game]?.[own] ? 'gTileset_' + SHARED_GRAPHICS[game][own] : name;
			try {
				const png = fs.readFileSync(path.join(DATA, 'tilesets', `${pre}${mangle(gfx)}_tiles.png`));
				const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
				out.tilesPerBand = (h / 16 / 8) * (w / 8);
			} catch (e) { out.tilesPerBand = 640; }
		}
	}
	tsCache.set(key, out);
	return out;
}
export function behaviorAt(m, x, y) {
	const v = m.layout.map[y]?.[x];
	if (v == null) return 0;
	const id = v & 0x3FF, L = m.layout;
	const p = tilesetSide(L.primary_tileset, true, L.game), s = tilesetSide(L.secondary_tileset, false, L.game);
	const split = p ? p.tilesPerBand : 640;
	const attr = id >= split ? s?.attributes[id - split] : p?.attributes[id];
	return (attr || 0) & 0x1FF;
}
// Crystal CUT trees the engine can clear (tools/gen_cut_blocks.mjs): a requirement,
// not a wall — the audit counts them as passable
const CUT = new Set();
try {
	for (const [id, l] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/cut_blocks.json'), 'utf8')).maps || {}))
		for (const [x, y] of l) CUT.add(id + ':' + x + ',' + y);
} catch (e) {}
// Cells a Crystal script or map callback can OPEN with a changeblock (the Radio
// Tower's CARD KEY shutter, the BASEMENT KEY door, the switch-room doors, the
// Ruins' floors): a requirement too, so the audit counts the opened cell passable
// (overworld/crystal_scriptvar_data.json — every changeblock any script restores)
const OPENED = new Set();
try {
	const patches = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/crystal_scriptvar_data.json'), 'utf8')).patches || {};
	for (const [stem, labels] of Object.entries(patches)) {
		let id = null;
		try { id = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', stem + '_map.json'), 'utf8')).id; } catch (e) { continue; }
		for (const ops of Object.values(labels)) for (const op of ops) {
			if (op.op !== 'changeblock') continue;
			(op.cells || []).forEach((v, q) => { if (v != null && (v & COLLISION_MASK) === 0) OPENED.add(id + ':' + (op.x + (q & 1)) + ',' + (op.y + (q >> 1))); });
		}
	}
} catch (e) {}
// The same for FireRed / Emerald: a `setmetatile x, y, TILE, FALSE` in any script
// the map can run (its own labels, and the shared / restored labels they call)
// opens that cell — the Pokémon Mansion's switch walls, the League's doors,
// the Magma / Aqua hideout gates
// the decomps spell it TRUE/FALSE or 1/0 — "FALSE" is a truthy string (engine.js scriptBool)
const scriptBool = v => !(v == null || v === false || v === 0 || /^(false|0)$/i.test(String(v).trim()));
const DYNAMIC = new Map(), FORCED = new Map();
// events.js COMMON_MOVEMENTS: the shared walks a script names without steps
const COMMON_WALKS = { Common_Movement_WalkUp: ['up'], Common_Movement_WalkUp2: ['up', 'up'], Common_Movement_WalkUp4: ['up', 'up', 'up', 'up'], Common_Movement_WalkUp5: ['up', 'up', 'up', 'up', 'up'] };
for (const [k, v] of Object.entries(COMMON_WALKS)) COMMON_WALKS[k] = v.map(dir => ({ dir, mode: 'walk' }));
const stemToId = new Map();
const idOfStem = stem => {
	if (!stemToId.has(stem)) { let id = null; try { id = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', stem + '_map.json'), 'utf8')).id; } catch (e) {} stemToId.set(stem, id); }
	return stemToId.get(stem);
};
try {
	const shared = {};
	const addShared = o => { for (const [k, v] of Object.entries(o || {})) if (Array.isArray(v)) shared[k] = v; };
	try { addShared(JSON.parse(fs.readFileSync(path.join(DATA, 'shared_scripts.json'), 'utf8')).scripts); } catch (e) {}
	try { addShared(JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/missing_labels_data.json'), 'utf8')).scripts); } catch (e) {}
	let mc = {};
	try { mc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/multichoice_data.json'), 'utf8')); addShared(mc.shared); } catch (e) {}
	const strings = (v, out) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };
	for (const f of fs.readdirSync(path.join(DATA, 'scripts'))) {
		if (!f.endsWith('.json')) continue;
		const stem = f.slice(0, -5), id = idOfStem(stem);
		if (!id) continue;
		let own = {};
		try { own = JSON.parse(fs.readFileSync(path.join(DATA, 'scripts', f), 'utf8')); } catch (e) { continue; }
		const lists = Object.values(own).filter(Array.isArray).concat(Object.values(mc.patches?.[stem] || {}).filter(Array.isArray));
		const done = new Set();
		for (let i = 0; i < lists.length; i++) {
			for (const op of lists[i]) {
				if (op && op.op === 'setmetatile' && !scriptBool(op.impassable) && Number.isInteger(op.x)) OPENED.add(id + ':' + op.x + ',' + op.y);
				// an elevator's floors: the cab's MAP_DYNAMIC door goes wherever its
				// setdynamicwarp pointed
				if (op && op.op === 'setdynamicwarp' && /^MAP_/.test(op.map)) { if (!DYNAMIC.has(id)) DYNAMIC.set(id, []); DYNAMIC.get(id).push(op); }
			}
			for (const s of strings(lists[i], [])) if (shared[s] && !done.has(s)) { done.add(s); lists.push(shared[s]); }
		}
		// a walk-in the map's ON_FRAME / ON_WARP scene forces on arrival (FireRed's
		// Elite Four: Common_Movement_WalkUp5 through the room's solid entry row) —
		// a scripted walk has no collision
		const label = k => own[k] || mc.patches?.[stem]?.[k] || shared[k];
		const meta = own.__map__ || {};
		for (const e of [...(meta.onFrame || []), ...(meta.onWarp || [])]) {
			const steps = [], seen = new Set();
			const walk = (k, depth) => {
				const ops = label(k);
				if (!ops || seen.has(k) || depth > 6) return;
				seen.add(k);
				for (const op of ops) {
					if (op.op === 'move' && /PLAYER/i.test(String(op.who))) {
						const st = op.steps || COMMON_WALKS[op.movement] || [];
						for (const x of st) if (x.mode !== 'face' && ['up', 'down', 'left', 'right'].includes(x.dir)) steps.push(x.dir);
					}
					if ((op.op === 'call' || op.op === 'goto' || op.op === 'branch') && op.label) walk(op.label, depth + 1);
				}
			};
			walk(e.label, 0);
			if (steps.length) { if (!FORCED.has(id)) FORCED.set(id, []); FORCED.get(id).push(steps); }
		}
	}
} catch (e) {}
// a map whose scripts switch it to another layout (setmaplayoutindex: Sky Pillar's
// entrance, Shoal Cave's tides, Seafoam's currents — overworld/maplayout_data.json):
// a cell open in ANY of its layouts is reachable at some point
const ALT = new Map();
try {
	const patches = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/maplayout_data.json'), 'utf8')).patches || {};
	for (const [stem, labels] of Object.entries(patches)) {
		const id = idOfStem(stem);
		if (!id) continue;
		for (const ops of Object.values(labels)) for (const op of ops) {
			if (op.op !== 'setmaplayout' || !op.layout) continue;
			let lay = null;
			try { lay = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', op.layout + '.json'), 'utf8')); } catch (e) {}
			if (lay) { if (!ALT.has(id)) ALT.set(id, []); ALT.get(id).push(lay); }
		}
	}
} catch (e) {}
// the floor below a cracked floor (overworld/holewarp_data.js, tools/gen_holewarps.mjs)
let HOLES = {};
try { HOLES = (await import(new URL('../overworld/holewarp_data.js', import.meta.url).href)).HOLE_WARPS; } catch (e) {}
// scripted rides: the two ends are joined by a scene, not a warp. Both directions.
const RIDES = {};
for (const [a, b, why] of [
	['MAP_ROUTE112_CABLE_CAR_STATION', 'MAP_MT_CHIMNEY_CABLE_CAR_STATION', 'the Cable Car (ow_story.js cable car scenes)'],
]) { (RIDES[a] ||= []).push(b); (RIDES[b] ||= []).push(a); void why; }
export function walkable(m, x, y) {
	// a door is always enterable (engine.js isPassable) — including the exits
	// upstream puts one row past the edge (FRLG rest houses, Slateport harbor)
	if (m.warps.some(w => w.x === x && w.y === y)) return true;
	if (x < 0 || y < 0 || x >= m.layout.width || y >= m.layout.height) return false;
	if (CUT.has(m.id + ':' + x + ',' + y) || OPENED.has(m.id + ':' + x + ',' + y)) return true;
	const v = m.layout.map[y]?.[x];
	if (v != null && (v & COLLISION_MASK) === 0) return true; // 0 is a real cell (metatile 0)
	for (const L of ALT.get(m.id) || []) { const a = L.map?.[y]?.[x]; if (a != null && (a & COLLISION_MASK) === 0) return true; }
	return false;
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
		// an elevator cab's MAP_DYNAMIC door: every floor its script can pick
		if (w && w.dest_map === 'MAP_DYNAMIC') for (const op of DYNAMIC.get(m.id) || []) {
			const d = loadMap(op.map);
			if (!d) continue;
			const i = parseInt(op.warp, 10);
			const dw = !isNaN(i) && i >= 0 && i < 255 ? d.warps[i] : null;
			if (dw) push(d, dw.x, dw.y);
			else if (Number.isInteger(op.x) && op.x >= 0 && op.x < d.layout.width) push(d, op.x, op.y);
		}
		// arriving on a door whose map forces a walk-in (ON_FRAME / ON_WARP scene)
		if (w) for (const steps of FORCED.get(m.id) || []) {
			let px = x, py = y;
			for (const dir of steps) {
				const [ddx, ddy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
				px += ddx; py += ddy;
				if (px < 0 || py < 0 || px >= m.layout.width || py >= m.layout.height) break;
				// a scripted walk never rides a warp it passes over
				if (!m.warps.some(q => q.x === px && q.y === py)) push(m, px, py);
			}
		}
		// a cracked floor / hole drops you to the floor below at the same x, y (holes.js)
		const below = HOLES[m.name];
		if (below) {
			const b = behaviorAt(m, x, y);
			if (b === 0xD2 || b === 0x66) { const d = loadMap(below); if (d && walkable(d, x, y)) push(d, x, y); }
		}
		// a scripted ride (no warp joins the two ends)
		for (const r of RIDES[m.id] || []) { const d = loadMap(r); if (d && d.warps[0]) push(d, d.warps[0].x, d.warps[0].y); }
		// a ledge hop (engine.js tryMove): standing on a JUMP tile, or stepping onto
		// one, carries you two tiles that way when the landing is open
		const hop = MB_JUMP[behaviorAt(m, x, y)];
		if (hop && walkable(m, x + hop[0] * 2, y + hop[1] * 2)) push(m, x + hop[0] * 2, y + hop[1] * 2);
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const jn = x + dx, jm = y + dy;
			const j = jn >= 0 && jm >= 0 && jn < m.layout.width && jm < m.layout.height ? MB_JUMP[behaviorAt(m, jn, jm)] : null;
			if (j && j[0] === dx && j[1] === dy && walkable(m, x + dx * 2, y + dy * 2)) push(m, x + dx * 2, y + dy * 2);
		}
		for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
			const nx = x + dx, ny = y + dy;
			if (nx >= 0 && ny >= 0 && nx < m.layout.width && ny < m.layout.height) {
				if (walkable(m, nx, ny)) push(m, nx, ny);
			} else if (m.warps.some(w => w.x === nx && w.y === ny)) {
				push(m, nx, ny); // an edge exit past the map's last row
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
