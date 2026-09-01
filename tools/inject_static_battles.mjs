// inject_static_battles.mjs — put the static wild battles back into the scripts
// the transpilers dropped them from.
//
// Snorlax asleep in the road, the Sudowoodo posing as a tree, the Voltorb
// disguised as a Rocket-base switch: the decomps start these with
//
//   FireRed/Emerald   setwildbattle SPECIES_X, N   ...   dowildbattle
//   Crystal           loadwildmon X, N             ...   startbattle
//
// Neither survived. `dowildbattle` appears in ZERO of our 1548 scripts, and
// Crystal's `startbattle` came through as `{"op":"trainerbattle","args":[""]}` —
// a trainer battle with no trainer, which expands to a battle against an empty
// trainer id and does nothing. So the scripts play the whole encounter (the
// POKe FLUTE prompt, the shake animation, the cry, hiding the object) and never
// fight. That is why Snorlax and Sudowoodo are catchable nowhere.
//
// Two anchors, both of which DID survive:
//   FireRed/Emerald — `setflag FLAG_SYS_SPECIAL_WILD_BATTLE` (FR) or
//                     `setflag FLAG_SYS_CTRL_OBJ_DELETE` (Em) bracket the
//                     dropped `dowildbattle`; insert straight after it.
//   Crystal        — replace the empty `trainerbattle` in place.
//
// Species already in main.js's LEGENDARY_ENCOUNTERS are SKIPPED. Those work
// through a different mechanism (walk onto the lair tile) and giving them a
// second, script-driven battle would let one save catch them twice.
//
// Hoenn2 is skipped too — it is the unwired editing clone, with no entry in any
// runtime registry.
//
//   node tools/inject_static_battles.mjs            (report)
//   node tools/inject_static_battles.mjs --write    (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const REF = path.resolve('../Magepunk66/Reference');
const SCRIPTS = path.resolve('overworld/data/scripts');
const MAIN = fs.readFileSync(path.resolve('overworld/main.js'), 'utf8');

// species the tile-based legendary system already owns
const LEGENDARY = new Set();
{
	const at = MAIN.indexOf('const LEGENDARY_ENCOUNTERS');
	const body = MAIN.slice(at, MAIN.indexOf('\n};', at));
	for (const m of body.matchAll(/species:\s*'([a-z0-9_]+)'/g)) LEGENDARY.add(m[1]);
}
const speciesKey = s => s.replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- collect every static battle the decomps declare ----
// [{ script, species, level, source }] in file order, so the Nth site in a file
// lines up with the Nth anchor in our transpiled copy of it.
const sites = [];
const scanGba = (root, dir, label) => {
	const base = path.join(REF, root, dir);
	if (!fs.existsSync(base)) return;
	for (const mapDir of fs.readdirSync(base)) {
		const f = path.join(base, mapDir, 'scripts.inc');
		if (!fs.existsSync(f)) continue;
		for (const m of fs.readFileSync(f, 'utf8').matchAll(/setwildbattle\s+(SPECIES_[A-Z0-9_]+),\s*(\d+)/g)) {
			sites.push({ script: mapDir, species: speciesKey(m[1]), level: +m[2], source: label });
		}
	}
};
scanGba('pokefirered', 'data/maps', 'firered');
scanGba('pokeemerald', 'data/maps', 'emerald');
{
	const base = path.join(REF, 'pokecrystal/maps');
	for (const f of fs.readdirSync(base).filter(x => x.endsWith('.asm'))) {
		for (const m of fs.readFileSync(path.join(base, f), 'utf8').matchAll(/loadwildmon\s+([A-Z0-9_]+),\s*(\d+)/g)) {
			sites.push({ script: f.replace('.asm', ''), species: speciesKey(m[1]), level: +m[2], source: 'crystal' });
		}
	}
}

// group by script file, preserving order
const byScript = new Map();
for (const s of sites) (byScript.get(s.script) || byScript.set(s.script, []).get(s.script)).push(s);

// ---- apply ----
const FR_ANCHORS = ['FLAG_SYS_SPECIAL_WILD_BATTLE', 'FLAG_SYS_CTRL_OBJ_DELETE'];
let injected = 0, skippedLegendary = 0, noScript = 0, noAnchor = 0, alreadyDone = 0;
const done = [], problems = [];

// walk one script's op arrays, calling fn(arr, index) at each candidate anchor
function eachAnchor(doc, kind, fn) {
	for (const [label, ops] of Object.entries(doc)) {
		if (!Array.isArray(ops)) continue;
		for (let i = 0; i < ops.length; i++) {
			const op = ops[i];
			if (!op || typeof op !== 'object') continue;
			if (kind === 'crystal') {
				if (op.op === 'trainerbattle' && Array.isArray(op.args) && op.args.length === 1 && op.args[0] === '') fn(ops, i, label);
			} else if (op.op === 'setflag' && FR_ANCHORS.includes(op.flag)) fn(ops, i, label);
		}
	}
}

for (const [scriptName, list] of byScript) {
	// Resolve the decomp script to OUR copies, minding the name collision that made
	// JohKanto mute in the first place: Crystal's CeruleanCity/VermilionCity/Route12
	// and FireRed's are different games' maps sharing a stem. A Crystal battle must
	// never land in a FireRed map, so match on the map's provenance (`_crystal_tileset`
	// in the map JSON) rather than on the name.
	const crystalSource = list[0].source === 'crystal';
	const isCrystalMap = stem => {
		const mp = path.resolve('overworld/data/maps', stem + '_map.json');
		if (!fs.existsSync(mp)) return false;
		try { return !!JSON.parse(fs.readFileSync(mp, 'utf8'))._crystal_tileset; } catch { return false; }
	};
	const targets = [scriptName, 'JohKanto' + scriptName]
		.filter(n => fs.existsSync(path.join(SCRIPTS, n + '.json')))
		.filter(n => isCrystalMap(n) === crystalSource);
	if (!targets.length) { noScript += list.length; problems.push(`no script: ${scriptName} (${list.map(s => s.species).join(',')})`); continue; }

	for (const target of targets) {
		if (/^Hoenn2_/.test(target)) continue;
		const p = path.join(SCRIPTS, target + '.json');
		const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
		const kind = list[0].source === 'crystal' ? 'crystal' : 'gba';

		const anchors = [];
		eachAnchor(doc, kind, (ops, i, label) => anchors.push({ ops, i, label }));
		if (!anchors.length) {
			noAnchor += list.length;
			problems.push(`no anchor: ${target} (${list.map(s => s.species).join(',')})`);
			continue;
		}
		// pair the Nth declared battle with the Nth anchor; if the counts disagree,
		// only pair as far as both go and report the rest rather than guessing
		const n = Math.min(anchors.length, list.length);
		if (anchors.length !== list.length) {
			problems.push(`count mismatch: ${target} has ${anchors.length} anchors for ${list.length} battles`);
		}
		// insert from the end so earlier indices stay valid
		for (let k = n - 1; k >= 0; k--) {
			const site = list[k], a = anchors[k];
			if (LEGENDARY.has(site.species)) { skippedLegendary++; continue; }
			const already = a.ops.some(o => o?.op === 'wildbattle' && o.species === site.species);
			if (already) { alreadyDone++; continue; }
			const opNew = { op: 'wildbattle', species: site.species, level: site.level };
			if (kind === 'crystal') a.ops.splice(a.i, 1, opNew);   // replace the empty trainerbattle
			else a.ops.splice(a.i + 1, 0, opNew);                  // straight after the bracketing setflag
			injected++;
			done.push(`${target}::${a.label}  ${site.species} Lv${site.level}`);
		}
		if (WRITE) fs.writeFileSync(p, JSON.stringify(doc));
	}
}

console.log(`static battles declared by the decomps: ${sites.length}`);
console.log(`  injected            ${injected}`);
console.log(`  skipped (legendary) ${skippedLegendary}   already owned by LEGENDARY_ENCOUNTERS`);
console.log(`  already present     ${alreadyDone}`);
console.log(`  no transpiled script ${noScript}`);
console.log(`  no anchor found      ${noAnchor}`);
console.log('\ninjected:');
for (const d of done.sort()) console.log('  ' + d);
if (problems.length) { console.log('\nnot placed (left alone rather than guessed):'); for (const p of problems) console.log('  ' + p); }
console.log(WRITE ? '\nWRITTEN' : '\n(dry run — pass --write to apply)');
