// fix_region_data.mjs — repair three classes of rename/transpile damage in
// overworld/data. Idempotent; run with --write to apply.
//
//   node tools/fix_region_data.mjs            (dry run)
//   node tools/fix_region_data.mjs --write
//
// 1. KANTO ENCOUNTER KEYS. The Kanto maps were renamed to MAP_KANTO_* but their
//    encounter tables were not, so Kanto's Victory Road and Safari Zone North
//    have nothing to catch. Two keys became orphans matching no map at all
//    (MAP_VICTORY_ROAD_2F/_3F, FireRed's floors), and two are sitting on HOENN
//    maps that happen to share the name.
//
//    The two orphans are MOVED — nothing else can want them. The two collisions
//    are COPIED, deliberately: MAP_VICTORY_ROAD_1F and MAP_SAFARI_ZONE_NORTH are
//    real, reachable Hoenn maps, and moving the table would leave them with no
//    encounters at all. They keep a wrong-region roster, which is a pre-existing
//    bug needing Emerald's real tables — out of scope here, but flagged below so
//    it isn't forgotten.
//
// 2. CLASS POOLS. trainers.json spells the Nidoran forms `nidoran-m`/`nidoran-f`
//    while the species table uses `nidoranm`/`nidoranf`. buildMon returns null
//    for a bad id with no retry, so a Youngster or Lass can enter battle with an
//    EMPTY party.
//
// 3. SPECIES KEYS. species_extra.json writes regional forms without the
//    underscore species_battle.json uses (`raichualola` vs `raichu_alola`, and
//    `ho_oh`/`mr_mime`/`nidoran_m` vs `hooh`/`mrmime`/`nidoranm`). 33 evolution
//    targets dangle as a result, and 19 regional pre-evos have their `evos`
//    stranded on a key nothing reads — they can never evolve.
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data/';
const read = f => JSON.parse(fs.readFileSync(D + f, 'utf8'));
const write = (f, v) => { if (WRITE) fs.writeFileSync(D + f, JSON.stringify(v)); };
const log = [];

// ---------- 1. encounter keys ----------
const enc = read('encounters.json');
const MOVE = { MAP_VICTORY_ROAD_2F: 'MAP_KANTO_VICTORY_ROAD_2F', MAP_VICTORY_ROAD_3F: 'MAP_KANTO_VICTORY_ROAD_3F' };
const COPY = { MAP_VICTORY_ROAD_1F: 'MAP_KANTO_VICTORY_ROAD_1F', MAP_SAFARI_ZONE_NORTH: 'MAP_KANTO_SAFARI_ZONE_NORTH' };
let encChanged = 0;
for (const [from, to] of Object.entries(MOVE)) {
	if (!enc[from] || enc[to]) continue;
	enc[to] = enc[from]; delete enc[from]; encChanged++;
	log.push(`  moved  ${from} -> ${to}`);
}
for (const [from, to] of Object.entries(COPY)) {
	if (!enc[from] || enc[to]) continue;
	enc[to] = JSON.parse(JSON.stringify(enc[from])); encChanged++;
	log.push(`  copied ${from} -> ${to}  (source keeps a wrong-region roster; needs Emerald's real table)`);
}
console.log(`encounters.json: ${encChanged} keys repaired`);
log.splice(0).forEach(l => console.log(l));
if (encChanged) write('encounters.json', enc);

// ---------- 2. class pools ----------
const tr = read('trainers.json');
const SPELL = { 'nidoran-m': 'nidoranm', 'nidoran-f': 'nidoranf' };
let poolFixed = 0;
for (const [cls, pool] of Object.entries(tr.classPools || {})) {
	if (!Array.isArray(pool)) continue;
	pool.forEach((id, i) => {
		if (SPELL[id]) { pool[i] = SPELL[id]; poolFixed++; console.log(`classPools: ${cls}  ${id} -> ${SPELL[id]}`); }
	});
}
console.log(`trainers.json: ${poolFixed} pool species repaired`);
if (poolFixed) write('trainers.json', tr);

// ---------- 3. species_extra keys ----------
const bat = read('species_battle.json');
const ext = read('species_extra.json');
const flat = new Map();                       // 'raichualola' -> 'raichu_alola'
for (const k of Object.keys(bat)) flat.set(k.replace(/_/g, ''), k);
const canon = id => (typeof id === 'string' && !bat[id] && flat.has(id.replace(/_/g, '')))
	? flat.get(id.replace(/_/g, '')) : id;

const next = {};
let keyFixed = 0, evoFixed = 0;
for (const [k, v] of Object.entries(ext)) {
	const ck = canon(k);
	if (ck !== k) keyFixed++;
	for (const e of (v.evos || [])) {
		const ct = canon(e.target);
		if (ct !== e.target) { e.target = ct; evoFixed++; }
	}
	// a collision would silently drop data — merge rather than clobber
	next[ck] = next[ck] ? { ...next[ck], ...v } : v;
}
console.log(`species_extra.json: ${keyFixed} keys renamed, ${evoFixed} evolution targets re-pointed`);
if (keyFixed || evoFixed) write('species_extra.json', next);

// ---------- what still dangles ----------
const stillBad = [];
for (const [k, v] of Object.entries(next)) {
	for (const e of (v.evos || [])) if (e.target && !bat[e.target]) stillBad.push(`${k} -> ${e.target}`);
}
console.log(`\nstill dangling (species genuinely absent from species_battle): ${stillBad.length}`);
stillBad.slice(0, 10).forEach(s => console.log('  ' + s));
console.log(WRITE ? '\nwritten.' : '\n(dry run — pass --write)');
