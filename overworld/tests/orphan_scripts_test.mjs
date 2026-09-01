// orphan_scripts_test.mjs — no script file the engine cannot reach, and Kanto's
// de-duplicated maps have their scripts back.
//
// The engine loads scripts by MAP FILE STEM: `loadMapScripts(world.current.name)`,
// where the bundle's `name` is the stem handed to loadBundle — NOT the map JSON's
// `name` field. So a file in data/scripts/ with no <stem>_map.json beside it can
// never be fetched.
//
// 96 such files existed, 90 of them stale copies left behind by
// gen_johkanto_scripts.mjs (which copies a Crystal script to the JohKanto stem and
// leaves the original). Harmless at runtime, but not harmless to READ: any audit
// that scans data/scripts/ counts them, which is how a "97 duplicate branches"
// figure got filed against FireRed/Emerald when most of it was dead Crystal.
//
// Two of them turned out to be the ONLY copy of a live map's scripts, which is the
// reason this is a test and not just a cleanup.
//
// Pure data test — no browser needed:
//   node overworld/tests/orphan_scripts_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const mapStems = new Set();
for (const f of fs.readdirSync(path.join(D, 'maps'))) if (f.endsWith('_map.json')) mapStems.add(f.replace('_map.json', ''));

// ---------- the loader really does key on the stem ----------
{
	const eng = fs.readFileSync(path.join(ROOT, 'overworld/engine.js'), 'utf8');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/return \{ name, map, layout, ts \}/.test(eng),
		"loadBundle returns the STEM as `name` — so world.current.name is the file stem, not the map's `name` field");
	A(/loadMapScripts\(world\.current\.name\)/.test(main), 'and loadMapScripts is called with it');
}

// ---------- nothing unreachable is left ----------
for (const dir of ['scripts', 'strings']) {
	const orphans = fs.readdirSync(path.join(D, dir))
		.filter(f => f.endsWith('.json') && f !== '_index.json')
		.map(f => f.replace('.json', ''))
		.filter(s => !mapStems.has(s));
	A(orphans.length === 0, `every file in data/${dir}/ belongs to a real map`, `${orphans.length}: ${orphans.slice(0, 6).join(', ')}`);
}

// ---------- Kanto's de-duplicated maps are not mute ----------
// FireRed and Emerald share thirteen map names; the de-dup gave Kanto's copies a
// KANTO_ namespace but left their SCRIPTS under the old bare names, where Emerald's
// versions had already claimed the filename. All four looked for a file that did
// not exist — every trainer on the road to the Kanto league among them.
{
	for (const stem of ['KantoVictoryRoad_1F', 'KantoVictoryRoad_2F', 'KantoVictoryRoad_3F', 'KantoSafariZone_North']) {
		const sp = path.join(D, 'scripts', stem + '.json');
		A(fs.existsSync(sp), `${stem} has a script file`);
		if (!fs.existsSync(sp)) continue;
		const labels = new Set(Object.keys(JSON.parse(fs.readFileSync(sp, 'utf8'))));
		const map = JSON.parse(fs.readFileSync(path.join(D, 'maps', stem + '_map.json'), 'utf8'));
		// Excluded, and each for a real reason:
		//   *_EventScript_Item* / StrengthBoulder — items.js owns those objects.
		//   *Tutor — the MOVE TUTORS live in the decomp's data/scripts/move_tutors.inc,
		//     a SHARED file. transpile_scripts.py only walks data/maps/<Map>/scripts.inc,
		//     so all 96 shared .inc files (2,841 labels across the two decomps) are
		//     missed — the FireRed/Emerald analogue of Crystal's dropped `jumpstd`.
		//     A separate gap, not something this restore could have fixed.
		const wanted = [...(map.object_events || []), ...(map.bg_events || []), ...(map.coord_events || [])]
			.map(o => o.script)
			.filter(s => s && s !== '0x0' && s !== '0' && !/_EventScript_Item|StrengthBoulder|Tutor$/.test(s));
		const missing = wanted.filter(w => !labels.has(w));
		A(missing.length === 0, `...and every one of its ${wanted.length} scripted NPCs resolves`, missing.join(', '));
	}
	// the bare file must still be EMERALD's — this is not a rename, the two decomps
	// genuinely both have a VictoryRoad_1F and Emerald's map still uses it
	const em = JSON.parse(fs.readFileSync(path.join(D, 'scripts', 'VictoryRoad_1F.json'), 'utf8'));
	A(Object.keys(em).some(k => /Wally/.test(k)),
		"the bare VictoryRoad_1F.json is still Emerald's (Wally), serving Emerald's own map");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
