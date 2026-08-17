// quest_graph.mjs — shared helper: build the overworld map graph (connections +
// warps) from the real data, and compute reachability under a gate table. Used by
// quest_test.mjs (no-strand/reachability check) and for deriving GATED_MAPS.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTRA_DIVE } from '../divelinks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../data');

let _index = null;
export function mapIndex() {
	if (!_index) _index = JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'));
	return _index;
}
function fileFor(mapId) { return mapIndex()[mapId] || null; }
function readMap(stem) {
	try { return JSON.parse(fs.readFileSync(path.join(DATA, 'maps', `${stem}_map.json`), 'utf8')); } catch { return null; }
}

// adjacency: stem -> Set(neighbourStem), via cardinal connections AND warp_events.
// Both are bidirectional for reachability purposes (you can walk back through a
// connection edge, and warps generally have a return warp).
export function buildGraph() {
	const idx = mapIndex();
	const adj = new Map();
	const add = (a, b) => { if (!a || !b) return; if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
	const seen = new Set();
	// walk every map file referenced by the index
	for (const stem of new Set(Object.values(idx))) {
		if (seen.has(stem)) continue; seen.add(stem);
		const m = readMap(stem);
		if (!m) continue;
		for (const c of m.connections || []) {
			// cardinal walk edges + dive/emerge (a real traversal used to reach e.g.
			// Sootopolis); skip only truly non-traversable link types
			if (!['up', 'down', 'left', 'right', 'north', 'south', 'east', 'west', 'dive', 'emerge'].includes(c.direction)) continue;
			const dest = fileFor(c.map) || c.map;
			add(stem, dest); add(dest, stem);
		}
		for (const w of m.warp_events || []) {
			const dest = fileFor(w.dest_map);
			if (dest) { add(stem, dest); add(dest, stem); }
		}
	}
	// code-restored dive/emerge links (divelinks.js) that the map data is missing
	for (const [stem, kinds] of Object.entries(EXTRA_DIVE)) {
		for (const k of Object.keys(kinds)) {
			const dest = fileFor(kinds[k].map);
			if (dest) { add(stem, dest); add(dest, stem); }
		}
	}
	return adj;
}

// reachable set from `start`, treating any map whose gate need > `badges` as a
// wall you cannot enter (edges INTO it are blocked; you can still stand adjacent).
export function reachable(adj, start, gatedNeed, badges) {
	const need = (m) => gatedNeed[m] ?? 0;
	const open = new Set([start]);
	const q = [start];
	while (q.length) {
		const cur = q.shift();
		for (const nb of adj.get(cur) || []) {
			if (open.has(nb)) continue;
			if (need(nb) > badges) continue; // gated shut at this badge level
			open.add(nb); q.push(nb);
		}
	}
	return open;
}
