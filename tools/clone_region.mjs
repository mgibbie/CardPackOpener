// clone_region.mjs — duplicate a whole region into a new one you can edit
// without touching the original.
//
// Picking the map set is the fiddly part. Selecting by tileset does NOT work:
// Kanto's marts, POKeMON CENTERs and houses reuse Emerald layouts, so "every
// emerald layout" sweeps up 100+ Kanto interiors. Instead this walks the real
// map graph (connections + warp destinations) out from a root, which yields the
// region and nothing else — verified: from LittlerootTown you reach 321 maps
// and zero Kanto/Johto ones.
//
// Everything a map needs is cloned so the copy is playable on arrival: the map,
// its LAYOUT (its own copy, so editing the clone never writes back to Hoenn —
// this matters because generic interiors share a layout with Kanto), the map's
// script + string files, and its wild-encounter table. Script LABELS are left
// alone: they're resolved per-map out of the cloned script file, so they keep
// working under the new name.
//
//   node tools/clone_region.mjs --name=Ardova                     (dry run)
//   node tools/clone_region.mjs --name=Ardova --write
//   node tools/clone_region.mjs --name=Ardova --roots=MAP_LITTLEROOT_TOWN,MAP_BATTLE_FRONTIER_OUTSIDE_WEST --write
//
// Writes into overworld/data/ — the tree that deploys to magepunk-owdata:
//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true
// (WITHOUT --branch=main it lands on a preview URL and 404s in production.)
import fs from 'fs';
import path from 'path';

const D = 'overworld/data';
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const has = k => process.argv.includes(`--${k}`);

const NAME = arg('name');
const WRITE = has('write');
const ROOTS = (arg('roots') || 'MAP_LITTLEROOT_TOWN').split(',').map(s => s.trim()).filter(Boolean);
if (!NAME || !/^[A-Z][A-Za-z0-9]{1,15}$/.test(NAME)) {
	console.error('usage: node tools/clone_region.mjs --name=Ardova [--roots=MAP_A,MAP_B] [--write]');
	console.error('       --name must be CamelCase letters/digits, 2-16 chars');
	process.exit(1);
}
const PREFIX = NAME.toUpperCase();          // MAP_ARDOVA_...
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };

const index = readJSON(`${D}/map_index.json`);
const mapPath = stem => `${D}/maps/${stem}_map.json`;

// ---------- 1. walk the region ----------
const resolve = id => (typeof id === 'string' ? (index[id] ? id : (index['MAP_' + id] ? 'MAP_' + id : null)) : null);
const seen = new Set();
const queue = [];
for (const r of ROOTS) {
	const id = resolve(r);
	if (!id) { console.error(`root not in map_index: ${r}`); process.exit(1); }
	if (!seen.has(id)) { seen.add(id); queue.push(id); }
}
const maps = new Map(); // MAP_ID -> map json
while (queue.length) {
	const id = queue.shift();
	const stem = index[id];
	if (!exists(mapPath(stem))) continue;
	const m = readJSON(mapPath(stem));
	maps.set(id, m);
	const next = [
		...(m.connections || []).map(c => c.map),
		...(m.warp_events || []).map(w => w.dest_map),
	];
	for (const n of next) {
		const nid = resolve(n);
		if (nid && !seen.has(nid)) { seen.add(nid); queue.push(nid); }
	}
}

// ---------- 2. plan the renames ----------
const newMapId = id => 'MAP_' + PREFIX + '_' + id.replace(/^MAP_/, '');
const newStem = stem => NAME + '_' + stem;
const newLayoutId = lid => 'LAYOUT_' + PREFIX + '_' + String(lid).replace(/^LAYOUT_/, '');

const layoutsUsed = new Set();
for (const m of maps.values()) if (m.layout) layoutsUsed.add(m.layout);

let scriptFiles = 0, stringFiles = 0, missingLayouts = [], external = [];
for (const lid of layoutsUsed) if (!exists(`${D}/layouts/${lid}.json`)) missingLayouts.push(lid);
for (const [id, m] of maps) {
	if (exists(`${D}/scripts/${index[id]}.json`)) scriptFiles++;
	if (exists(`${D}/strings/${index[id]}.json`)) stringFiles++;
	// destinations that leave the cloned set stay pointed at the ORIGINAL region
	for (const w of (m.warp_events || [])) {
		const d = resolve(w.dest_map);
		if (d && !maps.has(d)) external.push(`${index[id]} warp -> ${d}`);
	}
	for (const c of (m.connections || [])) {
		const d = resolve(c.map);
		if (d && !maps.has(d)) external.push(`${index[id]} connect -> ${d}`);
	}
}

// encounters are keyed by MAP_ id
let encounters = {};
try { encounters = readJSON(`${D}/encounters.json`); } catch {}
const encCount = [...maps.keys()].filter(id => encounters[id]).length;

console.log(`clone ${ROOTS.join(' + ')} -> ${NAME}`);
console.log(`  maps        ${maps.size}`);
console.log(`  layouts     ${layoutsUsed.size}${missingLayouts.length ? `  (MISSING ${missingLayouts.length}: ${missingLayouts.slice(0, 3).join(', ')})` : ''}`);
console.log(`  scripts     ${scriptFiles}`);
console.log(`  strings     ${stringFiles}`);
console.log(`  encounters  ${encCount}`);
console.log(`  exits still pointing at the source region: ${external.length}`);
for (const e of external.slice(0, 8)) console.log(`     ${e}`);
if (external.length > 8) console.log(`     … ${external.length - 8} more`);

const clash = [...maps.keys()].filter(id => index[newMapId(id)]);
if (clash.length) {
	console.error(`\nREFUSING: ${clash.length} target ids already exist (e.g. ${newMapId(clash[0])}).`);
	console.error('Pick a different --name, or delete the previous clone first.');
	process.exit(1);
}
if (!WRITE) { console.log('\n(dry run — pass --write to create the files)'); process.exit(0); }

// ---------- 3. write ----------
// Deep-rewrite every map id we cloned, wherever it appears in the map JSON
// (connections, warps, and any id-shaped field a future importer adds).
const remap = id => (maps.has(id) ? newMapId(id) : null);
function rewriteIds(node) {
	if (Array.isArray(node)) return node.map(rewriteIds);
	if (node && typeof node === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(node)) out[k] = rewriteIds(v);
		return out;
	}
	if (typeof node === 'string') {
		const r = resolve(node);
		// only rewrite when the WHOLE string is a map id we cloned
		if (r && maps.has(r) && (node === r || 'MAP_' + node === r)) return remap(r);
	}
	return node;
}

let wroteLayouts = 0;
for (const lid of layoutsUsed) {
	const src = `${D}/layouts/${lid}.json`;
	if (!exists(src)) continue;
	const lay = readJSON(src);
	lay.id = newLayoutId(lid);
	if (typeof lay.name === 'string') lay.name = NAME + '_' + lay.name;
	fs.writeFileSync(`${D}/layouts/${lay.id}.json`, JSON.stringify(lay));
	wroteLayouts++;
}

const newIndex = { ...index };
let wroteMaps = 0, wroteScripts = 0, wroteStrings = 0;
const newEnc = {};
for (const [id, m] of maps) {
	const stem = index[id], nStem = newStem(stem), nId = newMapId(id);
	const out = rewriteIds(m);
	out.id = nId;
	out.name = nStem;
	if (m.layout) out.layout = newLayoutId(m.layout);
	fs.writeFileSync(mapPath(nStem), JSON.stringify(out));
	newIndex[nId] = nStem;
	wroteMaps++;
	// scripts + strings ride along under the new map name; the LABELS inside are
	// untouched because they're only ever looked up within their own map
	for (const kind of ['scripts', 'strings']) {
		const s = `${D}/${kind}/${stem}.json`;
		if (!exists(s)) continue;
		fs.copyFileSync(s, `${D}/${kind}/${nStem}.json`);
		if (kind === 'scripts') wroteScripts++; else wroteStrings++;
	}
	if (encounters[id]) newEnc[nId] = encounters[id];
}

fs.writeFileSync(`${D}/map_index.json`, JSON.stringify(newIndex));
if (Object.keys(newEnc).length) {
	fs.writeFileSync(`${D}/encounters.json`, JSON.stringify({ ...encounters, ...newEnc }));
}

console.log(`\nwrote  ${wroteMaps} maps, ${wroteLayouts} layouts, ${wroteScripts} scripts, ${wroteStrings} strings, ${Object.keys(newEnc).length} encounter tables`);
console.log(`map_index.json now has ${Object.keys(newIndex).length} entries`);
console.log(`\nStart map: ${newMapId(resolve(ROOTS[0]))}  (${newStem(index[resolve(ROOTS[0])])})`);
console.log(`Edit it:   /overworld/?mapedit=1&map=${newStem(index[resolve(ROOTS[0])])}`);
console.log(`Deploy:    npx wrangler pages deploy ${D} --project-name=magepunk-owdata --branch=main --commit-dirty=true`);
