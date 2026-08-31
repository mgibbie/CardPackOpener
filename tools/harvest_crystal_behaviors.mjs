// harvest_crystal_behaviors.mjs — recover the block->metatile mapping the
// Crystal tileset converter used, by reading it back out of the maps.
//
// Why not just patch attributes by index: `crystal_native_build.py` splits each
// Crystal 32x32 block into FOUR 16x16 quadrants and DEDUPES them by
// (tile-pixels, behavior). So our metatile ids are neither block ids nor
// block*4 — they are first-appearance order over deduped quadrants. Index 3 in
// `johto` happening to be Crystal block 3's grass is a coincidence, and acting
// on it wrote wrong water into every `kanto` tileset (its grass is our index 21,
// Crystal's block 11).
//
// The mapping is recoverable without rerunning the asset pipeline, because both
// halves are on disk: pokecrystal's `maps/<Name>.blk` is width*height block ids,
// and our layout is exactly twice that in each axis. So
//
//     our layout cell (2*bx + qx, 2*by + qy)  <->  block (bx,by) quadrant (qx,qy)
//
// Walking every Johto and JohKanto map gives, for each of our metatiles, the set
// of Crystal collision names that produced it. Where that set agrees, the
// behavior is safe to assign; where a metatile was deduped from both water and
// land quadrants it is ambiguous and is left alone (splitting it would renumber
// metatiles and invalidate every layout).
//
//   node tools/harvest_crystal_behaviors.mjs           (report)
//   node tools/harvest_crystal_behaviors.mjs --write   (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const CRY = path.resolve('../Magepunk66/Reference/pokecrystal');
const D = path.resolve('overworld/data');
const TS = path.join(D, 'tilesets');

const MB = { TALL_GRASS: 0x02, POND_WATER: 0x10, WATERFALL: 0x13, OCEAN_WATER: 0x15, ICE: 0x23,
	JUMP_EAST: 0x38, JUMP_WEST: 0x39, JUMP_NORTH: 0x3A, JUMP_SOUTH: 0x3B };
const BEHAVIOR = {
	WATER: MB.OCEAN_WATER, WATER_21: MB.OCEAN_WATER,
	WHIRLPOOL: MB.POND_WATER, WHIRLPOOL_2C: MB.POND_WATER,
	WATERFALL: MB.WATERFALL, WATERFALL_RIGHT: MB.WATERFALL, WATERFALL_LEFT: MB.WATERFALL, WATERFALL_UP: MB.WATERFALL,
	CURRENT_RIGHT: MB.OCEAN_WATER, CURRENT_LEFT: MB.OCEAN_WATER, CURRENT_UP: MB.OCEAN_WATER, CURRENT_DOWN: MB.OCEAN_WATER,
	BUOY: MB.POND_WATER, RIGHT_BUOY: MB.POND_WATER, LEFT_BUOY: MB.POND_WATER, UP_BUOY: MB.POND_WATER,
	DOWN_BUOY: MB.POND_WATER, DOWN_RIGHT_BUOY: MB.POND_WATER, DOWN_LEFT_BUOY: MB.POND_WATER,
	UP_RIGHT_BUOY: MB.POND_WATER, UP_LEFT_BUOY: MB.POND_WATER,
	TALL_GRASS: MB.TALL_GRASS, TALL_GRASS_10: MB.TALL_GRASS, LONG_GRASS: MB.TALL_GRASS, LONG_GRASS_1C: MB.TALL_GRASS,
	GRASS_48: MB.TALL_GRASS, GRASS_49: MB.TALL_GRASS, GRASS_4A: MB.TALL_GRASS, GRASS_4B: MB.TALL_GRASS, GRASS_4C: MB.TALL_GRASS,
	HOP_RIGHT: MB.JUMP_EAST, HOP_LEFT: MB.JUMP_WEST, HOP_UP: MB.JUMP_NORTH, HOP_DOWN: MB.JUMP_SOUTH,
	HOP_DOWN_RIGHT: MB.JUMP_SOUTH, HOP_DOWN_LEFT: MB.JUMP_SOUTH, HOP_UP_RIGHT: MB.JUMP_NORTH, HOP_UP_LEFT: MB.JUMP_NORTH,
	// ICE is deliberately NOT in the 0x10-0x1B surfable band even though Crystal's
	// CollisionPermissionTable calls it WATER_TILE — inheriting that literally
	// would let the player Surf across the Ice Path.
	ICE: MB.ICE, ICE_2B: MB.ICE,
};
const isWater = b => b >= 0x10 && b <= 0x1B;

// ---- Crystal collision tables ----
const collision = new Map();
for (const f of fs.readdirSync(path.join(CRY, 'data/tilesets')).filter(x => x.endsWith('_collision.asm'))) {
	const blocks = [];
	for (const line of fs.readFileSync(path.join(CRY, 'data/tilesets', f), 'utf8').split('\n')) {
		const m = /tilecoll\s+([A-Z0-9_]+),\s*([A-Z0-9_]+),\s*([A-Z0-9_]+),\s*([A-Z0-9_]+)/.exec(line);
		if (m) blocks.push([m[1], m[2], m[3], m[4]]);   // TL, TR, BL, BR
	}
	collision.set(f.replace('_collision.asm', ''), blocks);
}
// TILESET_KANTO -> kanto. A few Crystal constants name a file that does not exist
// on its own (TILESET_JOHTO_MODERN -> johto_modern); resolve by lowercasing and
// falling back to the un-suffixed base.
const tilesetFile = c => {
	const n = c.replace(/^TILESET_/, '').toLowerCase();
	return collision.has(n) ? n : collision.has(n.replace(/_\d+$/, '')) ? n.replace(/_\d+$/, '') : null;
};

// ---- walk every map that came from Crystal ----
const mapsDir = path.join(D, 'maps'), layDir = path.join(D, 'layouts');
const seen = new Map();          // "<tilesetJsonFile>|<metatileId>" -> Map(collisionName -> count)
const stats = { maps: 0, skipped: 0, noBlk: 0, mismatch: 0 };

for (const file of fs.readdirSync(mapsDir).filter(f => f.endsWith('_map.json'))) {
	let map;
	try { map = JSON.parse(fs.readFileSync(path.join(mapsDir, file), 'utf8')); } catch { continue; }
	if (!map._crystal_tileset) { stats.skipped++; continue; }
	const base = tilesetFile(map._crystal_tileset);
	if (!base) { stats.skipped++; continue; }

	// our layout
	let lay;
	try { lay = JSON.parse(fs.readFileSync(path.join(layDir, map.layout + '.json'), 'utf8')); } catch { stats.skipped++; continue; }
	const tsName = (lay.primary_tileset || '').replace('gTileset_', '');
	const mangled = tsName.replace(/([A-Z])/g, c => '_' + c.toLowerCase()).replace(/(\d+)/g, d => '_' + d).replace(/^_/, '').replace(/__/g, '_');
	const tsFile = `primary_${mangled}_metatiles.json`;
	if (!fs.existsSync(path.join(TS, tsFile))) { stats.skipped++; continue; }

	// the Crystal .blk for this map: strip our region prefix off the file stem
	const stem = file.replace('_map.json', '');
	const cand = [stem, stem.replace(/^JohKanto/, ''), stem.replace(/^Johto/, '')];
	const blkPath = cand.map(c => path.join(CRY, 'maps', c + '.blk')).find(p => fs.existsSync(p));
	if (!blkPath) { stats.noBlk++; continue; }

	const bw = map._crystal_width_blocks, bh = map._crystal_height_blocks;
	const blk = fs.readFileSync(blkPath);
	if (blk.length < bw * bh || lay.width < bw * 2 || lay.height < bh * 2) { stats.mismatch++; continue; }

	const table = collision.get(base);
	for (let by = 0; by < bh; by++) {
		for (let bx = 0; bx < bw; bx++) {
			const quads = table[blk[by * bw + bx]];
			if (!quads) continue;
			for (let q = 0; q < 4; q++) {
				const lx = bx * 2 + (q % 2), ly = by * 2 + (q >> 1);   // TL,TR,BL,BR
				const v = lay.map[ly]?.[lx];
				if (v == null) continue;
				const key = `${tsFile}|${v & 0x3FF}`;
				let m = seen.get(key);
				if (!m) seen.set(key, m = new Map());
				m.set(quads[q], (m.get(quads[q]) || 0) + 1);
			}
		}
	}
	stats.maps++;
}

console.log(`maps harvested ${stats.maps}   (skipped ${stats.skipped}, no .blk ${stats.noBlk}, size mismatch ${stats.mismatch})`);
console.log(`distinct (tileset, metatile) pairs observed: ${seen.size}\n`);

// ---- decide a behavior per metatile ----
const byFile = new Map();
let clean = 0, ambiguous = 0, ambiguousWater = 0;
const ambigSamples = [];
for (const [key, names] of seen) {
	const [tsFile, idStr] = key.split('|');
	const id = +idStr;
	// what behaviors do this metatile's sources imply?
	const behs = new Map();
	let total = 0;
	for (const [n, c] of names) { const b = BEHAVIOR[n] ?? 0; behs.set(b, (behs.get(b) || 0) + c); total += c; }
	if (behs.size === 1) {
		const b = [...behs.keys()][0];
		if (b) { (byFile.get(tsFile) || byFile.set(tsFile, new Map()).get(tsFile)).set(id, b); clean++; }
		continue;
	}
	// mixed sources. Accept only an overwhelming majority (>=90%) so a metatile
	// that is water almost everywhere still becomes water, but a genuinely shared
	// tile stays untouched.
	const [topB, topN] = [...behs].sort((a, b) => b[1] - a[1])[0];
	if (topB && topN / total >= 0.9) {
		(byFile.get(tsFile) || byFile.set(tsFile, new Map()).get(tsFile)).set(id, topB);
		clean++;
	} else {
		ambiguous++;
		if ([...behs.keys()].some(isWater)) ambiguousWater++;
		if (ambigSamples.length < 8) ambigSamples.push(`${tsFile.replace(/^primary_|_metatiles\.json$/g, '')}#${id}: ` +
			[...names].map(([n, c]) => `${n}x${c}`).join(' '));
	}
}
console.log(`metatiles with an unambiguous behavior: ${clean}`);
console.log(`ambiguous (left alone): ${ambiguous}  of which water-involving: ${ambiguousWater}`);
if (ambigSamples.length) console.log('  e.g.\n    ' + ambigSamples.join('\n    '));

// ---- clear behaviors that the converter guessed wrong ----
// The pre-existing attributes put 0x38/0x39/0x3B (MB_JUMP_EAST/WEST/SOUTH) on
// HEADBUTT_TREE metatiles, and `isLedge` is the only thing in the engine that
// reads those values — so trees were letting the player hop straight over them.
// Where the harvest says a metatile's sources are unanimously NOT a ledge, an
// existing ledge value is wrong and gets cleared.
for (const [key, names] of seen) {
	const [tsFile, idStr] = key.split('|');
	const id = +idStr;
	if ([...names.keys()].some(n => (BEHAVIOR[n] ?? 0) >= 0x38 && (BEHAVIOR[n] ?? 0) <= 0x3B)) continue;
	const m = byFile.get(tsFile) || byFile.set(tsFile, new Map()).get(tsFile);
	if (!m.has(id)) m.set(id, 0);          // 0 = explicit clear, applied below
}

// ---- propagate to variants we could not observe ----
// `cr_kanto_16` is used only by interiors, which have no .blk to harvest from.
// The 13 `cr_kanto_*` files are palette re-banks of ONE Crystal tileset and
// their `metatiles` arrays are byte-identical, so the numbering carries over.
// Only propagate where that is literally true — the 11 `johto` variants differ
// (different roof tiles shift the dedup), and guessing there is how the first
// attempt at this went wrong.
{
	const byBase = new Map();
	for (const f of fs.readdirSync(TS).filter(x => /^primary_cr_.*_metatiles\.json$/.test(x))) {
		const base = f.replace(/^primary_cr_|_metatiles\.json$/g, '').replace(/_\d+$/, '');
		(byBase.get(base) || byBase.set(base, []).get(base)).push(f);
	}
	let filled = 0;
	for (const [, files] of byBase) {
		if (files.length < 2) continue;
		const docs = files.map(f => JSON.parse(fs.readFileSync(path.join(TS, f), 'utf8')));
		const ref = JSON.stringify(docs[0].metatiles);
		if (!docs.every(d => JSON.stringify(d.metatiles) === ref)) continue;   // not interchangeable
		const merged = new Map();
		for (const f of files) for (const [id, b] of (byFile.get(f) || new Map())) if (!merged.has(id)) merged.set(id, b);
		for (const f of files) {
			const m = byFile.get(f) || byFile.set(f, new Map()).get(f);
			for (const [id, b] of merged) if (!m.has(id)) { m.set(id, b); filled++; }
		}
	}
	console.log(`propagated ${filled} assignments across byte-identical tileset variants`);
}

// ---- apply ----
let water = 0, grass = 0, ledge = 0, ice = 0, changed = 0, trees = 0;
for (const [tsFile, ids] of byFile) {
	const p = path.join(TS, tsFile);
	const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
	const attrs = doc.attributes || new Array(doc.metatiles.length).fill(0);
	for (const [id, b] of ids) {
		if (id >= attrs.length) continue;
		const old = attrs[id] & 0x1FF;
		if (old >= 0x38 && old <= 0x3B && !(b >= 0x38 && b <= 0x3B)) trees++;
		const next = (attrs[id] & ~0x1FF) | b;
		if (next !== attrs[id]) { attrs[id] = next; changed++; }
		if (isWater(b)) water++; else if (b === MB.TALL_GRASS) grass++;
		else if (b >= 0x38 && b <= 0x3B) ledge++; else if (b === MB.ICE) ice++;
	}
	doc.attributes = attrs;
	if (WRITE) fs.writeFileSync(p, JSON.stringify(doc));
}
console.log(`\nbehaviors assigned: water ${water}  grass ${grass}  ledge ${ledge}  ice ${ice}`);
console.log(`attribute entries changed: ${changed}`);
console.log(`metatiles freed from a wrong MB_JUMP (headbutt trees acting as ledges): ${trees}`);
console.log(WRITE ? '\nWRITTEN' : '\n(dry run — pass --write to apply)');
