// gen_crystal_block_cells.mjs — every Crystal `changeblock` target, as our grid cells.
//
// tools/crystal_blocks.mjs harvests a block's cells from converted maps where the
// block appears, so a changeblock to a block that no map uses could not be built
// (32 of them in the map callbacks: the Ruins chambers' opened walls, the Elite
// Four rooms' closed entrances, Route 19's cleared rocks, Blackthorn Gym's
// boulder floor...). But the tileset converter rendered EVERY block of every
// Crystal tileset — the art and metatiles all exist — it just never saved the
// block -> metatile mapping. tools/crystal_block_cells.py recomputes it from the
// decomp with the converter's own code.
//
// VALIDATION (the rule from the Crystal tileset harvest): the computed cells must
// CONFIRM every block the harvest already knows. A single contradiction fails
// the run, and nothing is written.
//
// Writes tools/data/crystal_block_cells.json: { "<crystal map>:<block>": [TL,TR,BL,BR] }
//   node tools/gen_crystal_block_cells.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { loadCrystalMaps, makeHarvester } from './crystal_blocks.mjs';

const ROOT = path.resolve('.');
let MP66 = process.env.MAGEPUNK66;
for (let d = ROOT; !MP66 && d !== path.dirname(d); d = path.dirname(d)) if (fs.existsSync(path.join(d, 'Magepunk66', 'Reference', 'pokecrystal'))) MP66 = path.join(d, 'Magepunk66');
if (!MP66) throw new Error('Magepunk66 not found (set MAGEPUNK66)');
const CR = path.join(MP66, 'Reference', 'pokecrystal');

// every changeblock in pokecrystal's map scripts, by crystal map name
const req = [], seen = new Set();
for (const f of fs.readdirSync(path.join(CR, 'maps')).filter(f => f.endsWith('.asm'))) {
	const name = f.replace('.asm', '');
	for (const m of fs.readFileSync(path.join(CR, 'maps', f), 'utf8').matchAll(/changeblock\s+\d+,\s*\d+,\s*\$([0-9a-fA-F]+)/g)) {
		const block = parseInt(m[1], 16), k = name + ':' + block;
		if (!seen.has(k)) { seen.add(k); req.push({ name, block }); }
	}
}
const py = process.platform === 'win32' ? 'python' : 'python3';
const out = JSON.parse(execFileSync(py, [path.join('tools', 'crystal_block_cells.py')], { input: JSON.stringify(req), env: { ...process.env, MAGEPUNK66: MP66 }, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] }).toString());

// validate against the harvest (per converted map of that crystal map name)
const maps = loadCrystalMaps(ROOT, CR);
const harvest = makeHarvester(maps);
const tsOfName = {};
for (const m of maps) tsOfName[m.name] = tsOfName[m.name] || m.ts;
let confirmed = 0, added = 0;
const contradicted = [], collisionDiffers = [], table = {};
for (const { name, block } of req) {
	const k = name + ':' + block, c = out[k];
	if (!c) { contradicted.push(k + ' (no cells computed)'); continue; }
	const ts = tsOfName[name];
	const h = ts ? harvest(ts, block) : null;
	// the METATILE ids must agree (bits 0-9); collision bits may differ where a
	// shipped map's collision was hand-fixed after conversion — the harvest (what
	// ships) wins there, and the decomp only fills blocks the harvest doesn't know
	const ids = a => a.map(v => v & 0x3ff).join();
	if (h) {
		if (ids(h) !== ids(c.cells)) { contradicted.push(`${k} harvest ${h} vs decomp ${c.cells}`); continue; }
		confirmed++;
		if (h.join() !== c.cells.join()) collisionDiffers.push(`${k} harvest ${h} / decomp ${c.cells}`);
		table[k] = h;
	} else { added++; table[k] = c.cells; }
}
console.log(`${req.length} changeblock targets; confirmed ${confirmed} against the harvest (metatile ids), ${added} new from the decomp, contradicted ${contradicted.length}; collision differs (harvest kept) ${collisionDiffers.length}`);
for (const d of collisionDiffers) console.log('  collision differs: ' + d);
if (contradicted.length) { console.log('  ' + contradicted.join('\n  ')); process.exit(1); }
fs.mkdirSync(path.join('tools', 'data'), { recursive: true });
fs.writeFileSync(path.join('tools', 'data', 'crystal_block_cells.json'), JSON.stringify(table, null, 1) + '\n');
console.log('wrote tools/data/crystal_block_cells.json');
