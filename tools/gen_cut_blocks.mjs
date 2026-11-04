// gen_cut_blocks.mjs — Crystal's CUT trees, as tiles our engine can cut.
//
// Crystal has no cut-tree OBJECTS: the tree is painted into the map's blocks
// (a quadrant with COLL_CUT_TREE), and CUT swaps the whole block for its
// replacement (data/collision/field_move_blocks.asm). Our port kept the painted,
// solid tile and nothing that could clear it — Ilex Forest's (8,25) was patched
// with a code-seeded tree object whose removal left the solid tile behind
// (2026-10-02, Instinct's bug report).
//
// For every Crystal-tileset map this finds each cut-tree quadrant (block in the
// tileset's cut list, quadrant with COLL_CUT_TREE) and the grid value of the
// replacement block's same quadrant, harvested from our own converted layouts
// (block -> metatile is deduped, not by index, so it can only be read off a
// map where the replacement block actually appears). Grass entries (animation 1)
// are skipped: cutting tall grass is cosmetic, and an obstacle there would wall
// the grass off.
//
// Writes tracked overworld/cut_blocks.json: { MAP_ID: [[x, y, treeValue, cutValue], ...] }
//
//   node tools/gen_cut_blocks.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'overworld', 'data');
const CR = path.resolve(ROOT, '..', 'Magepunk66', 'Reference', 'pokecrystal');
const read = f => fs.readFileSync(f, 'utf8');

// tileset -> [[facing, replacement, animation]]
const cutLists = {};
{
	const src = read(path.join(CR, 'data', 'collision', 'field_move_blocks.asm')).split(/\r?\n/);
	const ptr = {};   // label -> tileset
	let section = null, label = null;
	for (const line of src) {
		if (/^CutTreeBlockPointers:/.test(line)) { section = 'cut'; continue; }
		if (/^\w+BlockPointers:/.test(line)) { section = null; continue; }
		if (section !== 'cut') continue;
		let m;
		if ((m = /dbw\s+(TILESET_\w+),\s*\.(\w+)/.exec(line))) { ptr[m[2]] = m[1]; continue; }
		if ((m = /^\.(\w+):/.exec(line))) { label = m[1]; continue; }
		if ((m = /db\s+\$?([0-9a-fA-F]+),\s*\$?([0-9a-fA-F]+),\s*\$?([0-9a-fA-F]+)/.exec(line)) && label && ptr[label]) {
			(cutLists[ptr[label]] = cutLists[ptr[label]] || []).push([parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]);
		}
	}
}

// tileset -> block -> [TL, TR, BL, BR] collision names
const collision = ts => {
	const f = path.join(CR, 'data', 'tilesets', ts.replace(/^TILESET_/, '').toLowerCase() + '_collision.asm');
	return read(f).split(/\r?\n/).filter(l => /^\s*tilecoll\b/.test(l)).map(l => l.replace(/^\s*tilecoll\s+/, '').split(';')[0].split(',').map(s => s.trim()));
};

// Crystal map name -> .blk path
const blkOf = {};
{
	const src = read(path.join(CR, 'data', 'maps', 'blocks.asm')).split(/\r?\n/);
	let pending = [];
	for (const line of src) {
		let m;
		if ((m = /^(\w+)_Blocks:/.exec(line))) { pending.push(m[1]); continue; }
		if ((m = /INCBIN\s+"([^"]+\.blk)"/.exec(line))) { for (const n of pending) blkOf[n] = path.join(CR, m[1]); pending = []; }
	}
}

// our Crystal maps, with their blocks
const maps = [];
for (const f of fs.readdirSync(path.join(DATA, 'maps')).filter(f => f.endsWith('_map.json'))) {
	const m = JSON.parse(read(path.join(DATA, 'maps', f)));
	if (!m._crystal_tileset || !cutLists[m._crystal_tileset]) continue;
	const name = f.replace(/_map\.json$/, '');
	const wb = m._crystal_width_blocks, hb = m._crystal_height_blocks;
	const cands = [name, name.replace(/^JohKanto/, ''), name.replace(/^Crystal/, '')];
	const blkFile = cands.map(n => blkOf[n]).find(p => p && fs.existsSync(p) && fs.statSync(p).size === wb * hb);
	if (!blkFile) { console.log('  no matching .blk for', name); continue; }
	const lay = JSON.parse(read(path.join(DATA, 'layouts', m.layout + '.json')));
	if (lay.width !== wb * 2 || lay.height !== hb * 2) { console.log('  size mismatch', name); continue; }
	maps.push({ id: m.id, name, ts: m._crystal_tileset, blk: fs.readFileSync(blkFile), wb, hb, grid: lay.map });
}

const Q = [[0, 0], [1, 0], [0, 1], [1, 1]];
// harvest: tileset/block/quadrant -> our grid value (most common)
const harvest = (ts, block, q) => {
	const count = {};
	for (const m of maps) {
		if (m.ts !== ts) continue;
		for (let i = 0; i < m.blk.length; i++) {
			if (m.blk[i] !== block) continue;
			const x = (i % m.wb) * 2 + Q[q][0], y = Math.floor(i / m.wb) * 2 + Q[q][1];
			const v = m.grid[y]?.[x];
			if (v != null) count[v] = (count[v] || 0) + 1;
		}
	}
	const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
	return best ? +best[0] : null;
};

const out = {};
let trees = 0;
const unresolved = [];
for (const m of maps) {
	const coll = collision(m.ts);
	for (const [facing, repl, anim] of cutLists[m.ts]) {
		if (anim !== 0) continue;   // grass
		const quads = (coll[facing] || []).map((c, q) => /CUT_TREE/.test(c) ? q : -1).filter(q => q >= 0);
		for (let i = 0; i < m.blk.length; i++) {
			if (m.blk[i] !== facing) continue;
			for (const q of quads) {
				const x = (i % m.wb) * 2 + Q[q][0], y = Math.floor(i / m.wb) * 2 + Q[q][1];
				const tree = m.grid[y]?.[x];
				const cut = harvest(m.ts, repl, q);
				if (tree == null || cut == null) { unresolved.push(`${m.name} (${x},${y}) block ${facing.toString(16)}->${repl.toString(16)}`); continue; }
				(out[m.id] = out[m.id] || []).push([x, y, tree, cut]);
				trees++;
			}
		}
	}
}
const dst = path.join(ROOT, 'overworld', 'cut_blocks.json');
fs.writeFileSync(dst, JSON.stringify({ generated: 'tools/gen_cut_blocks.mjs', maps: out }) + '\n');
console.log(`${trees} cut trees on ${Object.keys(out).length} maps -> ${path.relative(ROOT, dst)}`);
for (const [id, list] of Object.entries(out)) console.log('  ' + id + ': ' + list.map(([x, y]) => `(${x},${y})`).join(' '));
if (unresolved.length) console.log('UNRESOLVED:\n  ' + unresolved.join('\n  '));
