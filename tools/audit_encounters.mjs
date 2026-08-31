// audit_encounters.mjs — check every KANTO / HOENN / HOENN2 wild table against the
// decomp it actually came from, and repair the ones that are serving the wrong
// region's roster.
//
// Why this exists: FireRed and Emerald BOTH define MAP_VICTORY_ROAD_1F and
// MAP_SAFARI_ZONE_NORTH. When Kanto's maps were renamed to MAP_KANTO_*, their
// tables kept the old key — so two Hoenn maps ended up serving FireRed rosters
// (Machop/Onix in Hoenn's Victory Road) and the Kanto maps had nothing at all.
// Fixing those two by hand would have left the same class of error unfound
// elsewhere, so this compares the WHOLE pool against source.
//
// Region -> source:  KANTO/JohKanto-Kanto -> pokefirered,  HOENN + HOENN2 -> pokeemerald.
// Johto/JohKanto grass+water come from pokecrystal (see gen_johto_water.mjs) and
// are skipped here.
//
//   node tools/audit_encounters.mjs            (report only)
//   node tools/audit_encounters.mjs --write    (repair mismatches)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = path.resolve('../Magepunk66/Reference');
const DATA = path.resolve('overworld/data');
const ENC = path.join(DATA, 'encounters.json');

const enc = JSON.parse(fs.readFileSync(ENC, 'utf8'));
const regions = JSON.parse(fs.readFileSync(path.resolve('overworld/map_regions.json'), 'utf8'));
const idRegion = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) idRegion[m.id] = r;

const speciesId = s => s.replace(/^SPECIES_/, '').toLowerCase().replace(/_/g, '');
const KIND = { land_mons: 'land', water_mons: 'water', rock_smash_mons: 'rock_smash', fishing_mons: 'fishing' };

function loadDecomp(name) {
	const p = path.join(REF, name, 'src/data/wild_encounters.json');
	const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
	const rates = {}, out = new Map();
	for (const g of doc.wild_encounter_groups) {
		for (const f of (g.fields || [])) rates[f.type] = f.encounter_rates;
		for (const e of (g.encounters || [])) {
			const t = out.get(e.map) || {};
			for (const [field, kind] of Object.entries(KIND)) {
				if (!e[field]) continue;
				t[kind] = {
					rate: e[field].encounter_rate,
					slots: e[field].mons.map((m, i) => ({
						id: speciesId(m.species), min: m.min_level, max: m.max_level,
						w: (rates[field] || [])[i] ?? 1,
					})),
				};
			}
			out.set(e.map, t);
		}
	}
	return out;
}
const FR = loadDecomp('pokefirered');
const EM = loadDecomp('pokeemerald');

// our map id -> [source table, which decomp]
function sourceFor(id) {
	const r = idRegion[id];
	if (r === 'KANTO') return [FR.get(id) || FR.get(id.replace(/^MAP_KANTO_/, 'MAP_')), 'firered'];
	if (r === 'HOENN') return [EM.get(id), 'emerald'];
	if (r === 'HOENN2') return [EM.get(id.replace(/^MAP_HOENN2_/, 'MAP_')), 'emerald'];
	return [null, null];
}

const sig = t => (t?.slots || []).map(s => s.id).join(',');
const wrong = [], missing = [], ok = [];
for (const [id, table] of Object.entries(enc)) {
	const r = idRegion[id];
	if (!['KANTO', 'HOENN', 'HOENN2'].includes(r)) continue;
	const [src, which] = sourceFor(id);
	if (!src) { missing.push(`${r} ${id} (no ${which || 'decomp'} entry)`); continue; }
	for (const kind of ['land', 'water', 'rock_smash', 'fishing']) {
		if (!table[kind] && !src[kind]) continue;
		const a = sig(table[kind]), b = sig(src[kind]);
		if (a === b) { ok.push(`${id}.${kind}`); continue; }
		// EMERALD is authoritative for Hoenn: it is one game, so any difference is
		// drift, not a version choice, and MAP_VICTORY_ROAD_1F / MAP_SAFARI_ZONE_NORTH
		// are outright holding FireRed's roster (both names exist in both decomps).
		//
		// KANTO is NOT rewritten. FireRed and LeafGreen have genuinely different
		// rosters (Growlithe/Koffing vs Vulpix/Grimer in the Mansion, Arbok vs
		// Sandslash in Victory Road) and our tables are consistently the FireRed
		// side, which is the right choice for a FireRed port. Overwriting 140-odd
		// curated tables from whichever variant this JSON happens to hold would be
		// a much bigger change than the bug, and probably a regression.
		const swapped = (r === 'HOENN' || r === 'HOENN2') && !!src[kind];
		wrong.push({ id, kind, region: r, which, swapped, have: a.slice(0, 60), want: b.slice(0, 60), src: src[kind] });
	}
}

const swapped = wrong.filter(w => w.swapped);
const differs = wrong.filter(w => !w.swapped);
console.log(`matched source exactly: ${ok.length}`);
console.log(`no decomp entry:        ${missing.length}`);
console.log(`HOENN drift from Emerald: ${swapped.length}   <- repaired (Emerald is one game, so it is authoritative)`);
console.log(`KANTO differs from JSON:  ${differs.length}   <- FireRed/LeafGreen split, deliberately left alone\n`);
for (const w of swapped) {
	console.log(`  ${w.region} ${w.id}.${w.kind}`);
	console.log(`     have: ${w.have}`);
	console.log(`     want: ${w.want || '(none in source)'}`);
}
console.log('\n  KANTO differences left alone (sample):');
for (const w of differs.slice(0, 5)) console.log(`   ${w.id}.${w.kind}: ${w.have}  vs  ${w.want}`);

if (WRITE) {
	let fixed = 0;
	for (const w of swapped) {
		if (!w.src) continue;
		enc[w.id][w.kind] = w.src; fixed++;
	}
	fs.writeFileSync(ENC, JSON.stringify(enc));
	console.log(`\nrepaired ${fixed} mis-assigned tables; ${differs.length} version differences left alone.`);
} else console.log('\n(report only — pass --write to repair)');
