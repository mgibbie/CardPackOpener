// gen_crystal_branch_fix.mjs — re-emit the Crystal scripts with the condition
// bug fixed, without losing the hand-injected battles.
//
// THE BUG (fixed upstream in Magepunk66/tools/transpile_crystal.py):
// `checkitem` and `yesorno` sat in the transpiler's no-op list. They returned []
// WITHOUT touching `pending`, so the `iftrue`/`iffalse` that followed read the
// PREVIOUS `checkevent`'s flag and emitted a branch on the wrong condition —
// byte-identical to the earlier one, and therefore provably unreachable, because
// the first branch had already consumed that exact test:
//
//     op1  branch(EVENT_GOT_BICYCLE, true)  -> .GotBicycle
//     op3  branch(EVENT_GOT_BICYCLE, false) -> .Refused      <- was `yesorno`
//
// After op1 the flag is necessarily false, so op3 always fires and the `give`
// after it is dead code. Every "do you have item X" gate and every yes/no prompt
// in the Crystal half died that way: the MACHINE PART turn-in (and TM07, and 15
// maps of post-quest dialogue), the BICYCLE, the SUPER ROD, Bill's grandfather's
// five evolution stones, the Copycat questline.
//
// `sdefer` was dropped too, which left every scene entry point that used one as a
// bare `end` — including CeruleanGymGruntRunsOutScene, the cutscene that arms
// Misty's date. The scene armed and then played nothing.
//
// WHY THIS IS A MERGE AND NOT AN OVERWRITE. A fresh transpile reproduces 352 of
// our 359 Crystal script files byte for byte. The other 7 were hand-patched by
// tools/inject_static_battles.mjs — Snorlax, the red Gyarados, Sudowoodo, the
// Rocket-base Electrodes, the Union Cave Lapras, the Togepi egg — using ops the
// transpiler cannot emit. Overwriting would silently delete all of them, so this
// applies the fix LABEL BY LABEL and refuses to touch any label whose current
// body contains an op no transpiler run could have produced. Every skip is
// reported rather than swallowed.
//
//   node tools/gen_crystal_branch_fix.mjs           (report)
//   node tools/gen_crystal_branch_fix.mjs --write   (apply)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const MP66 = path.resolve('../Magepunk66');
const MAPS = path.join(MP66, 'Reference/pokecrystal/maps');
const TR = path.join(MP66, 'tools/transpile_crystal.py');
const D = path.resolve('overworld/data');

for (const p of [MAPS, TR]) if (!fs.existsSync(p)) { console.error('missing: ' + p); process.exit(1); }

// ops the transpiler cannot produce — their presence means a human put them there
const HAND_ONLY = /"op":"(wildbattle|giveegg)"/;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crystalfix-'));
console.log('transpiling pokecrystal ->', tmp);
execFileSync('python', [TR, MAPS, tmp], { stdio: ['ignore', 'ignore', 'inherit'] });

// our Crystal script files, mapped back to their Crystal stem via the map's `name`
const pairs = [];
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (!j._crystal_tileset || !j.name) continue;
	const stem = f.replace('_map.json', '');
	const ours = path.join(D, 'scripts', stem + '.json');
	const fresh = path.join(tmp, 'scripts', j.name + '.json');
	if (fs.existsSync(ours) && fs.existsSync(fresh)) pairs.push({ stem, ours, fresh });
}

let changedFiles = 0, changedLabels = 0, protectedLabels = 0;
const kinds = { item: 0, prompt: 0, sdefer: 0, other: 0 };
const protectedList = [], byFile = [];
for (const p of pairs) {
	const ours = JSON.parse(fs.readFileSync(p.ours, 'utf8'));
	const fresh = JSON.parse(fs.readFileSync(p.fresh, 'utf8'));
	let n = 0;
	for (const label of Object.keys(fresh)) {
		const a = JSON.stringify(ours[label] ?? null);
		const b = JSON.stringify(fresh[label]);
		if (a === b) continue;
		if (HAND_ONLY.test(a)) { protectedLabels++; protectedList.push(`${p.stem}:${label}`); continue; }
		if (/"item":/.test(b)) kinds.item++;
		else if (/"op":"prompt"/.test(b)) kinds.prompt++;
		else if (a === '[{"op":"end"}]' || ours[label] == null) kinds.sdefer++;
		else kinds.other++;
		ours[label] = fresh[label];
		n++; changedLabels++;
	}
	if (!n) continue;
	changedFiles++;
	byFile.push(`${p.stem} (${n})`);
	if (WRITE) fs.writeFileSync(p.ours, JSON.stringify(ours));
}

console.log(`\nCrystal script files: ${pairs.length}`);
console.log(`  files changed:  ${changedFiles}`);
console.log(`  labels changed: ${changedLabels}`);
console.log(`     item conditions restored: ${kinds.item}`);
console.log(`     yes/no prompts restored:  ${kinds.prompt}`);
console.log(`     sdefer jumps restored:    ${kinds.sdefer}`);
console.log(`     other:                    ${kinds.other}`);
console.log(`  labels PROTECTED (hand-injected, left alone): ${protectedLabels}`);
for (const s of protectedList) console.log(`     ${s}`);
console.log('\nchanged files: ' + byFile.slice(0, 40).join(', '));

console.log(WRITE
	? '\nWRITTEN — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true'
	: '\n(dry run — pass --write to apply)');
