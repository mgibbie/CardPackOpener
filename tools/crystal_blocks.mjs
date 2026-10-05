// crystal_blocks.mjs — a Crystal BLOCK, as our converted grid cells.
//
// pokecrystal paints maps in 32x32 blocks (a .blk byte each); our converted
// layouts are 16x16 metatile grids, two cells per block each way, and the
// block -> metatile mapping was deduped, NOT by index — so a block's cells can
// only be read off a converted map where that block actually appears
// (tools/gen_cut_blocks.mjs did this for CUT trees). This generalises it:
// harvestBlock(tileset, block) -> [TL, TR, BL, BR] grid values (the most common
// value per quadrant across every converted map of that tileset), or null when
// the block never appears in any of them.
import fs from 'fs';
import path from 'path';

const read = f => fs.readFileSync(f, 'utf8');

export function loadCrystalMaps(ROOT, CR) {
	const DATA = path.join(ROOT, 'overworld', 'data');
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
	const maps = [];
	for (const f of fs.readdirSync(path.join(DATA, 'maps')).filter(f => f.endsWith('_map.json'))) {
		const m = JSON.parse(read(path.join(DATA, 'maps', f)));
		if (!m._crystal_tileset) continue;
		const stem = f.replace(/_map\.json$/, '');
		const wb = m._crystal_width_blocks, hb = m._crystal_height_blocks;
		const cands = [m.name, stem, stem.replace(/^JohKanto/, ''), stem.replace(/^Crystal/, '')].filter(Boolean);
		const blkFile = cands.map(n => blkOf[n]).find(p => p && fs.existsSync(p) && fs.statSync(p).size === wb * hb);
		if (!blkFile) continue;
		const lay = JSON.parse(read(path.join(DATA, 'layouts', m.layout + '.json')));
		if (lay.width !== wb * 2 || lay.height !== hb * 2) continue;
		maps.push({ id: m.id, stem, name: m.name, ts: m._crystal_tileset, blk: fs.readFileSync(blkFile), wb, hb, grid: lay.map });
	}
	return maps;
}

const Q = [[0, 0], [1, 0], [0, 1], [1, 1]];
export function makeHarvester(maps) {
	const cache = new Map();
	return function harvestBlock(ts, block) {
		const key = ts + ':' + block;
		if (cache.has(key)) return cache.get(key);
		const cells = Q.map((_, q) => {
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
		});
		const out = cells.some(v => v == null) ? null : cells;
		cache.set(key, out);
		return out;
	};
}
