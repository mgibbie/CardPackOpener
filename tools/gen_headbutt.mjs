// gen_headbutt.mjs — harvest Crystal's headbutt-tree encounters into a small
// committed data module (overworld/headbutt_data.js). The last encounter
// modality: land/water/fishing/rock-smash all shipped, treemons never did.
//
// Sources: pokecrystal data/wild/treemons.asm (per-set common/rare tables,
// "db %, SPECIES, level") and treemon_maps.asm (map -> set).
//
//   node tools/gen_headbutt.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CR = 'C:/Users/guide/Desktop/Magepunk66/Reference/pokecrystal';

const lc = s => s.toLowerCase().replace(/_/g, '');
// ROUTE_29 -> Route29, AZALEA_TOWN -> AzaleaTown, ILEX_FOREST -> IlexForest
const file = s => s.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join('');

const tm = fs.readFileSync(path.join(CR, 'data/wild/treemons.asm'), 'utf8');
const sets = {};
for (const m of tm.matchAll(/TreeMonSet_(\w+):\n; common\n([\s\S]*?)db -1\n; rare\n([\s\S]*?)db -1/g)) {
	const parse = block => [...block.matchAll(/db\s+(\d+),\s+(\w+),\s+(\d+)/g)]
		.map(x => [+x[1], lc(x[2]), +x[3]]);
	sets[m[1].toLowerCase()] = { common: parse(m[2]), rare: parse(m[3]) };
}
delete sets.none;
if (!sets.canyon || !sets.forest) throw new Error('set parse failed: ' + Object.keys(sets));

const tmm = fs.readFileSync(path.join(CR, 'data/wild/treemon_maps.asm'), 'utf8');
const maps = {};
for (const m of tmm.matchAll(/treemon_map (\w+),\s+TREEMON_SET_(\w+)/g)) {
	if (m[2] === 'NONE') continue;
	const f = file(m[1]);
	if (fs.existsSync(path.join(ROOT, `overworld/data/maps/${f}_map.json`))) maps[f] = m[2].toLowerCase();
}
if (Object.keys(maps).length < 15) throw new Error('too few maps: ' + Object.keys(maps).length);

const out = `// headbutt_data.js — Crystal's headbutt-tree encounters, harvested by
// tools/gen_headbutt.mjs from pokecrystal's treemons.asm / treemon_maps.asm.
// Sets carry [weight%, species, level] rows; 10% of shakes read the RARE
// table (where HERACROSS lives), matching the original's rare-tree odds.
export const HEADBUTT_SETS = ${JSON.stringify(sets, null, '\t')};

// map file -> set (only maps that shipped and have trees worth hitting)
export const HEADBUTT_MAPS = ${JSON.stringify(maps, null, '\t')};
`;
fs.writeFileSync(path.join(ROOT, 'overworld/headbutt_data.js'), out);
console.log(`headbutt_data.js: ${Object.keys(sets).length} sets, ${Object.keys(maps).length} maps`);
