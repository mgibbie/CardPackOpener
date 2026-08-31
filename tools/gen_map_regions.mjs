// gen_map_regions.mjs — group every ported map under the region it belongs to,
// for the map editor's region picker.
//
// Classifying by NAME prefix is what you reach for first and it is wrong: the
// Johto rosters/maps do not carry a region prefix, JohKanto's Crystal-side
// border maps sit in the plain MAP_* namespace, and Kanto interiors reuse
// Emerald layouts. So this walks the real map graph (connections + warp
// destinations) out from each region's start town, which is the only source
// that actually knows.
//
// Namespaced regions (JOHKANTO, and any clone made by clone_region.mjs) are
// claimed by prefix FIRST, so a walk can't drag them into their parent.
//
//   node tools/gen_map_regions.mjs          (writes overworld/map_regions.json)
//
// The output lives in the MAIN repo (not overworld/data/), so it ships with an
// ordinary site deploy and needs no owdata push.
import fs from 'fs';

const D = 'overworld/data';
const OUT = 'overworld/map_regions.json';
const index = JSON.parse(fs.readFileSync(`${D}/map_index.json`, 'utf8'));

// Walk roots, in order; earlier regions keep a map that both could reach.
// A start town alone leaves ~350 maps unreached, because whole areas are
// entered by CODE rather than by a warp the data knows about — the Sevii
// ferry, the Battle Frontier, the event islands, the dive-only wrecks. Those
// hubs are listed here as extra roots so their interiors come along.
const ROOTS = [
	['KANTO', 'MAP_PALLET_TOWN'],
	['KANTO', 'MAP_ONE_ISLAND'], ['KANTO', 'MAP_TWO_ISLAND'], ['KANTO', 'MAP_THREE_ISLAND'],
	['KANTO', 'MAP_FOUR_ISLAND'], ['KANTO', 'MAP_FIVE_ISLAND'], ['KANTO', 'MAP_SIX_ISLAND'],
	['KANTO', 'MAP_SEVEN_ISLAND'],
	['JOHTO', 'MAP_NEW_BARK_TOWN'],
	// the Crystal-side league and Mt Silver are entered by code, not a warp
	['JOHTO', 'MAP_INDIGO_PLATEAU_POKECENTER_1F'], ['JOHTO', 'MAP_SILVER_CAVE_OUTSIDE'],
	['HOENN', 'MAP_LITTLEROOT_TOWN'],
	['HOENN', 'MAP_BATTLE_FRONTIER_OUTSIDE_WEST'], ['HOENN', 'MAP_BATTLE_FRONTIER_OUTSIDE_EAST'],
	['HOENN', 'MAP_SOUTHERN_ISLAND_EXTERIOR'], ['HOENN', 'MAP_BIRTH_ISLAND_EXTERIOR'],
	['HOENN', 'MAP_FARAWAY_ISLAND_ENTRANCE'], ['HOENN', 'MAP_NAVEL_ROCK_ENTRANCE'],
	['HOENN', 'MAP_ARTISAN_CAVE_B1F'], ['HOENN', 'MAP_TRAINER_HILL_ENTRANCE'],
	['HOENN', 'MAP_MIRAGE_TOWER_1F'], ['HOENN', 'MAP_DESERT_UNDERPASS'],
	['HOENN', 'MAP_ALTERING_CAVE'], ['HOENN', 'MAP_SKY_PILLAR_ENTRANCE'],
	['HOENN', 'MAP_TERRA_CAVE_ENTRANCE'], ['HOENN', 'MAP_MARINE_CAVE_ENTRANCE'],
	['HOENN', 'MAP_SEALED_CHAMBER_OUTER_ROOM'],
];
// regions that live in their own id namespace — claimed before any walk runs
const PREFIXED = [['JOHKANTO', /^MAP_JOHKANTO_/]];
// clone_region.mjs output: MAP_<NAME>_... for a name that isn't a known region
for (const id of Object.keys(index)) {
	const m = /^MAP_([A-Z0-9]+)_/.exec(id);
	if (!m) continue;
	const p = m[1];
	if (['PALLET', 'NEW', 'JOHKANTO'].includes(p)) continue;
	if (/^HOENN\d+$/.test(p) || /^KANTO\d+$/.test(p) || /^JOHTO\d+$/.test(p)) {
		if (!PREFIXED.some(([n]) => n === p)) PREFIXED.push([p, new RegExp('^MAP_' + p + '_')]);
	}
}

const resolve = id => (typeof id === 'string' ? (index[id] ? id : (index['MAP_' + id] ? 'MAP_' + id : null)) : null);
const mapOf = id => {
	try { return JSON.parse(fs.readFileSync(`${D}/maps/${index[id]}_map.json`, 'utf8')); } catch { return null; }
};

const owner = new Map(); // MAP_ID -> region
for (const [name, re] of PREFIXED) for (const id of Object.keys(index)) if (re.test(id)) owner.set(id, name);

for (const [region, root] of ROOTS) {
	if (!index[root]) { console.warn(`root missing: ${root}`); continue; }
	const q = [root];
	if (!owner.has(root)) owner.set(root, region);
	while (q.length) {
		const m = mapOf(q.shift());
		if (!m) continue;
		const next = [...(m.connections || []).map(c => c.map), ...(m.warp_events || []).map(w => w.dest_map)];
		for (const n of next) {
			const id = resolve(n);
			if (!id || owner.has(id)) continue;   // first region to reach it keeps it
			owner.set(id, region);
			q.push(id);
		}
	}
}

// Two passes over whatever the walks missed, cheapest signal first.
// 1) name stem: AbandonedShip_HiddenFloorRooms inherits from
//    AbandonedShip_CaptainsOffice. Only when every map sharing the stem agrees.
const stemOf = n => String(n).split('_')[0];
const byStem = new Map();
for (const [id, r] of owner) {
	const k = stemOf(index[id]);
	if (!byStem.has(k)) byStem.set(k, new Set());
	byStem.get(k).add(r);
}
for (const id of Object.keys(index)) {
	if (owner.has(id)) continue;
	const s = byStem.get(stemOf(index[id]));
	if (s && s.size === 1) owner.set(id, [...s][0]);
}
// 2) tileset: an unclaimed EMERALD map is Hoenn. This is only safe as a
//    fallback — Kanto's marts/centres/houses also use Emerald layouts, but the
//    Kanto walk has already claimed those, so what's left over is Hoenn's.
const layoutGame = {};
for (const f of fs.readdirSync(`${D}/layouts`)) {
	try { const j = JSON.parse(fs.readFileSync(`${D}/layouts/${f}`, 'utf8')); layoutGame[j.id] = j.game; } catch {}
}
for (const id of Object.keys(index)) {
	if (owner.has(id)) continue;
	const m = mapOf(id);
	if (m && layoutGame[m.layout] === 'emerald') owner.set(id, 'HOENN');
}

const out = {};
for (const [id, region] of owner) (out[region] = out[region] || []).push({ id, name: index[id] });
// whatever is still unplaced stays reachable in the picker rather than vanishing
const orphans = Object.keys(index).filter(id => !owner.has(id));
if (orphans.length) out.OTHER = orphans.map(id => ({ id, name: index[id] }));
for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(OUT, JSON.stringify(out));
const total = Object.values(out).reduce((n, l) => n + l.length, 0);
console.log(`${OUT}: ${total} maps across ${Object.keys(out).length} groups`);
for (const [r, l] of Object.entries(out)) console.log(`  ${r.padEnd(10)} ${String(l.length).padStart(5)}   e.g. ${l.slice(0, 3).map(x => x.name).join(', ')}`);
console.log(`(index has ${Object.keys(index).length} entries)`);
