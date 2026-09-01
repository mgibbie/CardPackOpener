// gen_crystal_coord_events.mjs — Gen-2 Kanto's story triggers, which were never
// extracted at all.
//
// A coord_event is the tile you STEP ON that fires a cutscene: Mom stopping you
// at the edge of New Bark, the beasts waking in the Burned Tower, Misty's date on
// Route 25. Johto has 102 of them across 36 maps. JOHKANTO HAS ZERO — not one,
// across all 135 maps — because the extraction only ever walked the Johto list.
// The same shape as the trainers bug (crystal_parse_trainers ran on Johto+Indigo
// only) and the tileset water bug: a whole region skipped by a region-blind pass.
//
// Seven Crystal-Kanto maps declare coord_events, ten events in total:
//   PowerPlant          the guard's phone call — the hook for the MACHINE PART quest
//   Route25             MISTY'S DATE (both trigger tiles)
//   Route16Gate         \ the CYCLING ROAD bicycle checks
//   Route17Route18Gate  /
//   SaffronMagnetTrainStation   arriving from Goldenrod
//   TrainerHouseB1F     the receptionist
//   VictoryRoadGate     the 8-badge check
//
// VALIDATION RULE (learned from the tileset harvest): a derivation is only
// trustworthy if it reproduces every value that is ALREADY there. This tool
// regenerates Johto's 102 events from the same decomp source and refuses to
// write unless all 102 match ours exactly — coordinates, gating var and value.
// That is what proves the coordinate mapping is 1:1 and the scene indices right,
// rather than assuming it.
//
//   node tools/gen_crystal_coord_events.mjs           (report + validate)
//   node tools/gen_crystal_coord_events.mjs --write   (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const CRY = path.resolve('../Magepunk66/Reference/pokecrystal/maps');
const D = path.resolve('overworld/data');
const regions = JSON.parse(fs.readFileSync(path.resolve('overworld/map_regions.json'), 'utf8'));

if (!fs.existsSync(CRY)) { console.error('missing pokecrystal checkout: ' + CRY); process.exit(1); }

// ---------- parse the decomp ----------
// scene constants are positional: the Nth `scene_script` line IS scene N.
const parse = stem => {
	const src = fs.readFileSync(path.join(CRY, stem + '.asm'), 'utf8');
	const sm = /def_scene_scripts\s*\n((?:\s*scene_script[^\n]*\n)+)/.exec(src);
	const scenes = {};
	if (sm) { let i = 0; for (const s of sm[1].matchAll(/scene_script\s+[A-Za-z0-9_]+,\s*([A-Z0-9_]+)/g)) scenes[s[1]] = i++; }
	const cm = /def_coord_events\s*\n((?:\s*coord_event[^\n]*\n)+)/.exec(src);
	if (!cm) return null;
	const evs = [...cm[1].matchAll(/coord_event\s+([^,]+),\s*([^,]+),\s*([A-Za-z0-9_]+),\s*([A-Za-z0-9_]+)/g)]
		.map(m => ({ x: +m[1].trim(), y: +m[2].trim(), scene: m[3].trim(), script: m[4] }));
	return { scenes, evs };
};

// DELIBERATELY NOT RESTORED — fail open.
//
// Both gates are the CYCLING ROAD bicycle check, and the BICYCLE cannot be
// obtained in the Crystal regions: GoldenrodBikeShopClerkScript's `yesorno` was
// mistranspiled into a duplicate branch on the surrounding flag
//   op1  branch(EVENT_GOT_BICYCLE, true)  -> .GotBicycle
//   op3  branch(EVENT_GOT_BICYCLE, false) -> .Refused
// and after op1 the flag is necessarily false, so op3 always refuses and the
// `give BICYCLE` on op5 is dead code.
//
// Restoring these triggers would therefore SEAL CYCLING ROAD the moment anyone
// fixes that transpile bug — the same trap the Victory Road badge gate would
// have been without a live VAR_BADGES. A walkable Cycling Road is a far smaller
// loss than an unreachable one, so these stay out until the bike is obtainable.
const SKIP = new Set(['Route16Gate', 'Route17Route18Gate']);

const stems = fs.readdirSync(CRY).filter(f => f.endsWith('.asm')).map(f => f.replace(/\.asm$/, ''));
const src = new Map();
for (const s of stems) { const p = parse(s); if (p && !SKIP.has(s)) src.set(s, p); }
console.log('skipped (fail open, see SKIP): ' + [...SKIP].join(', '));

// ---------- which of our files is which ----------
const regionOf = {};
for (const [r, list] of Object.entries(regions)) for (const m of list) regionOf[m.name] = r;
const readMap = f => {
	const p = path.join(D, 'maps', f + '_map.json');
	return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

// The map's own `name` field is the Crystal stem, and it is what the gating var
// is built from (VAR_SCENE_<name>) — the convention Johto already uses. Verified
// unique: no two Crystal maps of ours share a `name`.
const build = (stem, p) => p.evs.map(e => ({
	x: e.x, y: e.y, elevation: 0,
	var: 'VAR_SCENE_' + stem,
	var_value: String(p.scenes[e.scene] ?? 0),
	script: e.script,
}));

const same = (a, b) => a.length === b.length && a.every((e, i) =>
	+e.x === +b[i].x && +e.y === +b[i].y && e.var === b[i].var
	&& String(e.var_value) === String(b[i].var_value) && e.script === b[i].script);

// ---------- validate against Johto, then fill JohKanto ----------
let okJohto = 0, badJohto = [], toWrite = [], already = 0;
for (const [stem, p] of src) {
	for (const file of [stem, 'JohKanto' + stem]) {
		const map = readMap(file);
		if (!map || !map._crystal_tileset) continue;
		const want = build(map.name, p);
		const have = map.coord_events || [];
		if (have.length) {
			if (same(want, have)) okJohto++;
			else badJohto.push({ file, want, have });
			continue;
		}
		toWrite.push({ file, region: regionOf[file] || '?', want, map });
	}
}

console.log(`Crystal maps declaring coord_events: ${src.size}`);
console.log(`\nVALIDATION — our existing tables this tool reproduces exactly: ${okJohto}`);
if (badJohto.length) {
	console.log(`CONTRADICTED: ${badJohto.length}  — the derivation is wrong, refusing to write`);
	for (const b of badJohto.slice(0, 5)) {
		console.log(`  ${b.file}`);
		console.log(`    ours: ${JSON.stringify(b.have)}`);
		console.log(`    mine: ${JSON.stringify(b.want)}`);
	}
}

const byRegion = {};
for (const t of toWrite) byRegion[t.region] = (byRegion[t.region] || 0) + t.want.length;
console.log(`\nmaps missing their coord_events: ${toWrite.length}  (${toWrite.reduce((a, t) => a + t.want.length, 0)} events)`);
console.log('by region: ' + (Object.entries(byRegion).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'));
for (const t of toWrite) {
	console.log(`  ${t.file.padEnd(34)} ${t.region.padEnd(9)} ${t.want.length}`);
	for (const e of t.want) console.log(`      (${e.x},${e.y}) ${e.var}=${e.var_value}  ${e.script}`);
}

if (WRITE) {
	if (badJohto.length) { console.error('\nREFUSING TO WRITE: the derivation contradicts existing data.'); process.exit(1); }
	for (const t of toWrite) {
		t.map.coord_events = t.want;
		fs.writeFileSync(path.join(D, 'maps', t.file + '_map.json'), JSON.stringify(t.map));
	}
	console.log(`\nWROTE ${toWrite.length} maps — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true`);
} else {
	console.log('\n(dry run — pass --write to apply)');
}
