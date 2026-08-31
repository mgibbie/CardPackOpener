// clone_into_region.mjs — add maps to a region that was ALREADY cloned.
//
// clone_region.mjs walks the map graph from a root, which is the right way to
// pick a region but leaves out anything the walk cannot reach. Hoenn2 was cloned
// from LittlerootTown, and SOOTOPOLIS CITY has no connections and no inbound
// warps — in the real game you get there by DIVE. So Hoenn2 ended up with 7 of
// its 8 gyms, meaning Badges.count('HOENN2') could never reach 8 and the region
// could never be completed even once it is wired up.
//
// clone_region refuses to run when any target id already exists, so it cannot be
// re-run to patch a gap. This clones a named SET of maps (plus everything they
// warp to, transitively) into an existing clone, skipping anything already
// there, and rewrites destinations onto the clone's ids wherever a twin exists.
//
//   node tools/clone_into_region.mjs --prefix=HOENN2 --name=Hoenn2 --roots=MAP_SOOTOPOLIS_CITY
//   node tools/clone_into_region.mjs --prefix=HOENN2 --name=Hoenn2 --roots=MAP_SOOTOPOLIS_CITY --write
//
// Deploy after:
//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true
import fs from 'fs';

const D = 'overworld/data';
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const WRITE = process.argv.includes('--write');
const PREFIX = arg('prefix');       // HOENN2
const NAME = arg('name');           // Hoenn2
const ROOTS = (arg('roots') || '').split(',').map(s => s.trim()).filter(Boolean);
if (!PREFIX || !NAME || !ROOTS.length) {
	console.error('usage: node tools/clone_into_region.mjs --prefix=HOENN2 --name=Hoenn2 --roots=MAP_A,MAP_B [--write]');
	process.exit(1);
}

const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const index = readJSON(`${D}/map_index.json`);
const mapPath = stem => `${D}/maps/${stem}_map.json`;
const resolve = id => (typeof id === 'string' ? (index[id] ? id : (index['MAP_' + id] ? 'MAP_' + id : null)) : null);

const newMapId = id => 'MAP_' + PREFIX + '_' + id.replace(/^MAP_/, '');
const newStem = stem => NAME + '_' + stem;
const newLayoutId = lid => 'LAYOUT_' + PREFIX + '_' + String(lid).replace(/^LAYOUT_/, '');

// ---------- walk out from the roots, but ONLY through maps that have no twin ----------
// A map whose clone already exists is a boundary: we link to the existing copy
// rather than cloning it a second time.
const toClone = new Map();
const seen = new Set();
const queue = [];
for (const r of ROOTS) {
	const id = resolve(r);
	if (!id) { console.error('root not in map_index: ' + r); process.exit(1); }
	queue.push(id); seen.add(id);
}
while (queue.length) {
	const id = queue.shift();
	if (index[newMapId(id)]) continue;              // already cloned — a boundary
	const stem = index[id];
	if (!exists(mapPath(stem))) continue;
	const m = readJSON(mapPath(stem));
	toClone.set(id, m);
	for (const n of [...(m.connections || []).map(c => c.map), ...(m.warp_events || []).map(w => w.dest_map)]) {
		const nid = resolve(n);
		if (nid && !seen.has(nid)) { seen.add(nid); queue.push(nid); }
	}
}

// where every outbound destination will land
const twinOf = id => (toClone.has(id) || index[newMapId(id)] ? newMapId(id) : null);
const leaks = [];
for (const [id, m] of toClone) {
	for (const w of (m.warp_events || [])) {
		const d = resolve(w.dest_map);
		if (d && !twinOf(d)) leaks.push(`${index[id]} warp -> ${d}`);
	}
	for (const c of (m.connections || [])) {
		const d = resolve(c.map);
		if (d && !twinOf(d)) leaks.push(`${index[id]} connect -> ${d}`);
	}
}

const layoutsUsed = new Set();
for (const m of toClone.values()) if (m.layout) layoutsUsed.add(m.layout);
let encounters = {};
try { encounters = readJSON(`${D}/encounters.json`); } catch {}

console.log(`clone ${ROOTS.join(' + ')} into ${NAME}`);
console.log(`  new maps    ${toClone.size}`);
for (const id of toClone.keys()) console.log(`     ${index[id]}  ->  ${newStem(index[id])}`);
console.log(`  layouts     ${layoutsUsed.size}`);
console.log(`  encounters  ${[...toClone.keys()].filter(id => encounters[id]).length}`);
console.log(`  destinations with no twin (would leak to the SOURCE region): ${leaks.length}`);
for (const l of leaks.slice(0, 8)) console.log(`     ${l}`);
if (!toClone.size) { console.log('\nnothing to do — every root already has a twin.'); process.exit(0); }
if (!WRITE) { console.log('\n(dry run — pass --write)'); process.exit(0); }

// ---------- write ----------
function rewriteIds(node) {
	if (Array.isArray(node)) return node.map(rewriteIds);
	if (node && typeof node === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(node)) out[k] = rewriteIds(v);
		return out;
	}
	if (typeof node === 'string') {
		const r = resolve(node);
		// rewrite only when the WHOLE string is a map id that has (or will have) a twin
		if (r && (node === r || 'MAP_' + node === r)) return twinOf(r) || node;
	}
	return node;
}

let wroteLayouts = 0;
for (const lid of layoutsUsed) {
	const src = `${D}/layouts/${lid}.json`;
	if (!exists(src)) continue;
	const nid = newLayoutId(lid);
	if (exists(`${D}/layouts/${nid}.json`)) continue;   // shared with an earlier clone
	const lay = readJSON(src);
	lay.id = nid;
	if (typeof lay.name === 'string') lay.name = NAME + '_' + lay.name;
	fs.writeFileSync(`${D}/layouts/${nid}.json`, JSON.stringify(lay));
	wroteLayouts++;
}

const newIndex = { ...index };
let wroteMaps = 0, wroteScripts = 0, wroteStrings = 0;
const newEnc = {};
for (const [id, m] of toClone) {
	const stem = index[id], nStem = newStem(stem), nId = newMapId(id);
	const out = rewriteIds(m);
	out.id = nId;
	out.name = nStem;
	if (m.layout) out.layout = newLayoutId(m.layout);
	fs.writeFileSync(mapPath(nStem), JSON.stringify(out));
	newIndex[nId] = nStem;
	wroteMaps++;
	for (const kind of ['scripts', 'strings']) {
		const s = `${D}/${kind}/${stem}.json`;
		if (!exists(s) || exists(`${D}/${kind}/${nStem}.json`)) continue;
		fs.copyFileSync(s, `${D}/${kind}/${nStem}.json`);
		if (kind === 'scripts') wroteScripts++; else wroteStrings++;
	}
	if (encounters[id]) newEnc[nId] = encounters[id];
}

fs.writeFileSync(`${D}/map_index.json`, JSON.stringify(newIndex));
if (Object.keys(newEnc).length) {
	fs.writeFileSync(`${D}/encounters.json`, JSON.stringify({ ...encounters, ...newEnc }));
}
console.log(`\nwrote ${wroteMaps} maps, ${wroteLayouts} layouts, ${wroteScripts} scripts, ${wroteStrings} strings, ${Object.keys(newEnc).length} encounter tables`);
