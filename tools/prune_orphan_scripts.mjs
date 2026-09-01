// prune_orphan_scripts.mjs — delete the script/strings files no map can load.
//
// The engine loads scripts by MAP FILE STEM: `loadMapScripts(world.current.name)`,
// and the bundle's `name` is the stem passed to loadBundle, not the map JSON's
// `name` field. So a file in data/scripts/ with no <stem>_map.json beside it is
// unreachable — nothing can ever fetch it.
//
// Most of these came from gen_johkanto_scripts.mjs, which COPIES a Crystal script
// to the JohKanto stem and leaves the original in place. 90 are stale twins of a
// live JohKanto file, and stale is the word: the branch-fix pass only touched
// map-backed files, so 22 of them have since drifted from the copy that is
// actually used. The rest are Crystal cable-club rooms this port has no map for
// (Colosseum, TimeCapsule, MobileTradeRoom, MobileBattleRoom).
//
// They are harmless at runtime but they are NOT harmless to read: a census of
// data/scripts/ counts them, so any audit that scans the directory blindly gets
// wrong answers. That is exactly how a "97 duplicate branches" figure got filed
// against FireRed/Emerald when most of it was dead Crystal copies.
//
// THE GUARD. Two of these orphans turned out to be the ONLY copy of a live map's
// scripts (VictoryRoad_2F/3F, whose maps were renamed to KantoVictoryRoad_* by the
// FireRed/Emerald collision de-dup while the scripts kept the old name). So this
// refuses to delete any file whose labels are referenced by a map that currently
// has no script file of its own, and reports it instead. Deleting is only safe
// once nothing needs the content — run gen_kanto_dedupe_scripts.mjs first.
//
//   node tools/prune_orphan_scripts.mjs           (report)
//   node tools/prune_orphan_scripts.mjs --write   (delete)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const D = path.resolve('overworld/data');

const mapStems = new Set();
for (const f of fs.readdirSync(path.join(D, 'maps'))) if (f.endsWith('_map.json')) mapStems.add(f.replace('_map.json', ''));

const listOrphans = dir => fs.readdirSync(path.join(D, dir))
	.filter(f => f.endsWith('.json') && f !== '_index.json')
	.map(f => f.replace('.json', ''))
	.filter(s => !mapStems.has(s));

const orphanScripts = listOrphans('scripts');
const orphanStrings = fs.existsSync(path.join(D, 'strings')) ? listOrphans('strings') : [];

// ---------- the guard: is any orphan the only copy for a script-less map? ----------
const scriptless = [];
for (const stem of mapStems) {
	if (fs.existsSync(path.join(D, 'scripts', stem + '.json'))) continue;
	const p = path.join(D, 'maps', stem + '_map.json');
	const j = JSON.parse(fs.readFileSync(p, 'utf8'));
	const wanted = [...(j.object_events || []), ...(j.bg_events || []), ...(j.coord_events || [])]
		.map(o => o.script).filter(s => s && s !== '0x0' && s !== '0');
	if (wanted.length) scriptless.push({ stem, wanted });
}
const needed = new Map();
for (const o of orphanScripts) {
	const labels = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(D, 'scripts', o + '.json'), 'utf8'))));
	for (const s of scriptless) {
		const hit = s.wanted.filter(w => labels.has(w)).length;
		if (hit > 0) needed.set(o, `${s.stem} needs ${hit} of its labels`);
	}
}

console.log(`orphaned script files:  ${orphanScripts.length}`);
console.log(`orphaned strings files: ${orphanStrings.length}`);
console.log(`maps with scripted events but no script file: ${scriptless.length}`);
if (needed.size) {
	console.log(`\nHELD BACK — these are the only copy of a live map's scripts:`);
	for (const [o, why] of needed) console.log(`  ${o.padEnd(30)} ${why}`);
	console.log('  (run tools/gen_kanto_dedupe_scripts.mjs first)');
}

const delScripts = orphanScripts.filter(o => !needed.has(o));
const delStrings = orphanStrings.filter(o => !needed.has(o));
console.log(`\nto delete: ${delScripts.length} scripts + ${delStrings.length} strings`);
console.log('  ' + delScripts.slice(0, 12).join(', ') + (delScripts.length > 12 ? ', …' : ''));

if (WRITE) {
	let n = 0;
	for (const o of delScripts) { fs.unlinkSync(path.join(D, 'scripts', o + '.json')); n++; }
	for (const o of delStrings) { fs.unlinkSync(path.join(D, 'strings', o + '.json')); n++; }
	console.log(`\nDELETED ${n} files — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true`);
	console.log('(they regenerate from the decomps via transpile_scripts.py / gen_johkanto_scripts.mjs)');
} else {
	console.log('\n(dry run — pass --write to delete)');
}
