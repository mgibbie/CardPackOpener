// gen_species_data.mjs — fill the three per-species data holes the audit found.
//
//   WEIGHT   species_battle.json has name/num/sprite/types/baseStats/learnset and
//            no weight, which is why HEAVY METAL and LIGHT METAL are inert AND
//            why Heavy Slam, Heat Crash, Low Kick and Grass Knot are flat. Four
//            moves and two abilities blocked on one missing field.
//   GENDER   genders.json covers 628 species — of which 207 are forms that do
//            not exist in this port — and leaves 1330 battle species with no
//            entry, so they get a forced 50/50 roll. That breaks Attract,
//            Rivalry and Cute Charm, and makes genderless species gendered.
//   CATCH    a handful of obtainable species still have no catch rate and fall
//            back to 45.
//
// Weight and gender come from the vendored Showdown dex; catch rates from the
// Emerald/FireRed decomps, which is where the existing ones came from.
//
//   node tools/gen_species_data.mjs            (dry run)
//   node tools/gen_species_data.mjs --write
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const REF = path.resolve('../Magepunk66/Reference');
const DEX = path.join(REF, 'pokemon-showdown-master/data/pokedex.ts');

const bat = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
const ext = JSON.parse(fs.readFileSync(`${D}/species_extra.json`, 'utf8'));

// ---------- parse the Showdown dex ----------
// Entries are `key: { ... },` at one indent level; we only need three fields, so
// a scan for the ones we want is safer than trying to parse TS object literals.
const src = fs.readFileSync(DEX, 'utf8');
const dex = new Map();
const entry = /^\t([a-z0-9]+):\s*\{$/gm;
let m;
const starts = [];
while ((m = entry.exec(src))) starts.push([m[1], m.index]);
for (let i = 0; i < starts.length; i++) {
	const [key, at] = starts[i];
	const body = src.slice(at, i + 1 < starts.length ? starts[i + 1][1] : src.length);
	const w = /weightkg:\s*([\d.]+)/.exec(body);
	const gr = /genderRatio:\s*\{\s*M:\s*([\d.]+)/.exec(body);
	const g = /\bgender:\s*"([MFN])"/.exec(body);
	dex.set(key, {
		weight: w ? +w[1] : null,
		// male share, or null for "the default 50/50"
		male: g ? (g[1] === 'M' ? 1 : g[1] === 'F' ? 0 : -1) : (gr ? +gr[1] : null),
	});
}
console.log(`showdown dex parsed: ${dex.size} species`);

// our ids strip underscores/hyphens; Showdown keys are already squashed
const squash = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dexOf = id => dex.get(squash(id)) || null;

// ---------- weight ----------
let wrote = 0, noDex = [];
for (const [id, sp] of Object.entries(bat)) {
	if (id.startsWith('_')) continue;
	const d = dexOf(id);
	if (!d || d.weight == null) { noDex.push(id); continue; }
	if (sp.weightkg === d.weight) continue;
	sp.weightkg = d.weight;   // the exact field battle.js weightOf() already reads
	wrote++;
}
console.log(`weight:  set on ${wrote} species (${noDex.length} not in the Showdown dex — mostly imported fakemon)`);

// ---------- gender ----------
// -1 = genderless, otherwise the male share 0..1. Only stored when it is NOT
// the 50/50 default, so the file stays small and the engine's default stands.
const genders = {};
let gTouched = 0;
for (const id of Object.keys(bat)) {
	if (id.startsWith('_')) continue;
	const d = dexOf(id);
	if (!d || d.male == null) continue;
	genders[id] = d.male;
	gTouched++;
}
console.log(`gender:  ${gTouched} species carry a non-default ratio (was 628 entries, 207 of them for forms this port does not have)`);

// ---------- catch rate ----------
// scrape catchRate out of the decomp species tables
const catchRate = new Map();
for (const game of ['pokeemerald', 'pokefirered']) {
	const p = path.join(REF, game, 'src/data/pokemon/species_info.h');
	if (!fs.existsSync(p)) continue;
	const text = fs.readFileSync(p, 'utf8');
	const re = /\[SPECIES_([A-Z0-9_]+)\][^{]*\{([\s\S]*?)\n\s*\},/g;
	let e;
	while ((e = re.exec(text))) {
		const c = /\.catchRate\s*=\s*(\d+)/.exec(e[2]);
		if (c) catchRate.set(squash(e[1]), +c[1]);
	}
}
let cWrote = 0, cMiss = [];
for (const id of Object.keys(bat)) {
	if (id.startsWith('_')) continue;
	const cur = ext[id]?.catch;
	if (cur != null) continue;
	const c = catchRate.get(squash(id));
	if (c == null) { cMiss.push(id); continue; }
	(ext[id] ||= {}).catch = c;
	cWrote++;
}
console.log(`catch:   filled ${cWrote} (${cMiss.length} still unknown — imported fakemon and forms the decomps predate)`);

if (WRITE) {
	fs.writeFileSync(`${D}/species_battle.json`, JSON.stringify(bat));
	fs.writeFileSync(`${D}/species_extra.json`, JSON.stringify(ext));
	fs.writeFileSync(`${D}/genders.json`, JSON.stringify(genders));
	console.log('\nwritten.');
} else console.log('\n(dry run — pass --write)');
