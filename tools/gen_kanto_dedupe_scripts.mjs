// gen_kanto_dedupe_scripts.mjs — give Kanto's de-duplicated maps their scripts back.
//
// FireRed and Emerald share thirteen map NAMES. The original import copied Emerald
// over FireRed, and the repair (tools/dedupe_kanto_collisions.py, back in the Lua
// days) gave Kanto's copies a KANTO_ namespace: KantoVictoryRoad_1F/2F/3F and
// KantoSafariZone_North.
//
// The MAPS were renamed. THE SCRIPTS WERE NOT. The engine loads scripts by map
// file stem (`loadMapScripts(world.current.name)`, and the bundle's `name` is the
// stem), so all four maps have looked for KantoVictoryRoad_1F.json etc. and found
// nothing ever since:
//
//   KantoVictoryRoad_1F     7 scripted objects + 1 coord_event   -> silent
//   KantoVictoryRoad_2F    13 scripted objects + 2 coord_events  -> silent
//   KantoVictoryRoad_3F    12 scripted objects + 1 coord_event   -> silent
//   KantoSafariZone_North   3 objects + 5 signs                  -> silent
//
// Victory Road is the road to the Kanto league, so that is every trainer on the
// final climb standing mute.
//
// The bare-named files that remain are EMERALD's (VictoryRoad_1F.json is full of
// Wally), so this cannot be a rename — the FireRed versions have to come from the
// FireRed decomp. VictoryRoad_2F/3F.json ARE FireRed's, orphaned because Emerald
// has no such floors, but they are regenerated here too so all four come from one
// source rather than half from a leftover.
//
//   node tools/gen_kanto_dedupe_scripts.mjs           (report)
//   node tools/gen_kanto_dedupe_scripts.mjs --write   (apply)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const MP66 = path.resolve('../Magepunk66');
const TR = path.join(MP66, 'tools/transpile_scripts.py');
const MAPS = path.join(MP66, 'Reference/pokefirered/data/maps');
const D = path.resolve('overworld/data');

for (const p of [TR, MAPS]) if (!fs.existsSync(p)) { console.error('missing: ' + p); process.exit(1); }

// decomp map name -> our de-duplicated stem
const PAIRS = {
	VictoryRoad_1F: 'KantoVictoryRoad_1F',
	VictoryRoad_2F: 'KantoVictoryRoad_2F',
	VictoryRoad_3F: 'KantoVictoryRoad_3F',
	SafariZone_North: 'KantoSafariZone_North',
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kantoded-'));
console.log('transpiling pokefirered ->', tmp);
execFileSync('python', [TR, MAPS, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });

let wrote = 0, skipped = 0;
for (const [src, dst] of Object.entries(PAIRS)) {
	const mapPath = path.join(D, 'maps', dst + '_map.json');
	if (!fs.existsSync(mapPath)) { console.log(`  ${dst.padEnd(24)} no such map here, skipping`); continue; }
	const dstScript = path.join(D, 'scripts', dst + '.json');
	if (fs.existsSync(dstScript)) { console.log(`  ${dst.padEnd(24)} already has scripts, left alone`); skipped++; continue; }
	const srcScript = path.join(tmp, 'scripts', src + '.json');
	if (!fs.existsSync(srcScript)) { console.log(`  ${dst.padEnd(24)} no ${src}.json from the decomp`); continue; }

	// how much this actually wakes up
	const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
	const labels = new Set(Object.keys(JSON.parse(fs.readFileSync(srcScript, 'utf8'))));
	const wanted = [...(map.object_events || []), ...(map.bg_events || []), ...(map.coord_events || [])]
		.map(o => o.script).filter(s => s && s !== '0x0' && s !== '0');
	const hit = wanted.filter(w => labels.has(w)).length;
	console.log(`  ${dst.padEnd(24)} <- ${src.padEnd(18)} ${hit}/${wanted.length} of its event labels resolve`);

	if (WRITE) {
		fs.copyFileSync(srcScript, dstScript);
		const srcStr = path.join(tmp, 'strings', src + '.json');
		const dstStr = path.join(D, 'strings', dst + '.json');
		if (fs.existsSync(srcStr) && !fs.existsSync(dstStr)) fs.copyFileSync(srcStr, dstStr);
	}
	wrote++;
}
console.log(`\nrestored: ${wrote}   already present: ${skipped}`);
console.log(WRITE
	? '\nWRITTEN — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true'
	: '\n(dry run — pass --write to apply)');
