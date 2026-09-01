// gen_frem_branch_fix.mjs — re-emit the FireRed/Emerald scripts with the
// VAR_RESULT bugs fixed, without losing the hand-injected battles.
//
// THE BUGS (fixed upstream in Magepunk66/tools/transpile_scripts.py):
//
//   msgbox TEXT, MSGBOX_YESNO   is a QUESTION. It writes the answer to VAR_RESULT
//   and the next lines are `compare VAR_RESULT, NO` / `goto_if_eq .Refused`. Only
//   the text label was kept, so the question was never asked and the branch read
//   whatever the LAST script happened to leave in VAR_RESULT. 319 of these.
//
//   checkitemspace  writes VAR_RESULT too, and emitted nothing — so a bag-full
//   path could fire with an empty bag. This engine's bag is unbounded, so it now
//   answers TRUE explicitly instead of leaving the var stale. 54 of these.
//
//   checkitem  was not handled AT ALL (68 occurrences, counted in the
//   transpiler's own unhandled report), so every FireRed/Emerald item gate
//   compared against a stale VAR_RESULT.
//
// This is the FireRed/Emerald sibling of gen_crystal_branch_fix.mjs. Note the
// bug is NOT the same shape: Crystal's `checkitem`/`yesorno` corrupted a pending
// CONDITION register, while these two decomps name their flags inline
// (`goto_if_set FLAG, label`) and only their VAR_RESULT path was affected. Two
// adjacent `goto_if_set`/`goto_if_unset` on one flag is an ordinary if/else here,
// not a defect — 58 look like duplicates and every one of them is correct.
//
// WHY THIS IS A MERGE, AND HOW IT KNOWS WHAT NOT TO TOUCH. Some of our script
// files were hand-patched after transpile (inject_static_battles.mjs, the
// FireRed/Emerald collision de-dup). Rather than guess, this runs the PRE-FIX
// transpiler out of git as a baseline: a label is only replaced when our shipped
// body is byte-identical to what the unfixed transpiler produced, which proves no
// human touched it. Everything else is skipped and listed.
//
//   node tools/gen_frem_branch_fix.mjs           (report)
//   node tools/gen_frem_branch_fix.mjs --write   (apply)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const MP66 = path.resolve('../Magepunk66');
const TR = path.join(MP66, 'tools/transpile_scripts.py');
const D = path.resolve('overworld/data');
const DECOMPS = ['pokefirered', 'pokeemerald'];

if (!fs.existsSync(TR)) { console.error('missing: ' + TR); process.exit(1); }

// ---------- the pre-fix transpiler, straight out of git ----------
// The baseline is whichever revision predates the fix. While the fix is still
// uncommitted that is HEAD; once it is committed, pass --base=HEAD~1.
const BASE_REV = (process.argv.find(x => x.startsWith('--base=')) || '--base=HEAD').split('=')[1];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frem-'));
const baseTR = path.join(tmp, 'transpile_scripts_base.py');
try {
	fs.writeFileSync(baseTR, execFileSync('git', ['-C', MP66, 'show', `${BASE_REV}:tools/transpile_scripts.py`], { encoding: 'utf8' }));
	console.log(`baseline transpiler: ${BASE_REV}`);
} catch (e) {
	console.error('could not read the pre-fix transpiler from git: ' + e.message);
	console.error('(commit the transpiler change in Magepunk66 first, so HEAD is the fixed version\n and HEAD~1 the baseline — or point this at the right revision)');
	process.exit(1);
}

const run = (script, maps, out) => {
	fs.mkdirSync(out, { recursive: true });
	execFileSync('python', [script, maps, out], { stdio: ['ignore', 'pipe', 'inherit'] });
	return out;
};
const fresh = {}, base = {};
for (const dec of DECOMPS) {
	const maps = path.join(MP66, 'Reference', dec, 'data/maps');
	if (!fs.existsSync(maps)) { console.log(`(no ${dec} checkout, skipping)`); continue; }
	console.log(`transpiling ${dec} …`);
	fresh[dec] = run(TR, maps, path.join(tmp, dec + '-fixed'));
	base[dec] = run(baseTR, maps, path.join(tmp, dec + '-base'));
}

// ---------- our frem-mapped script files ----------
const stems = [];
for (const f of fs.readdirSync(path.join(D, 'maps'))) {
	if (!f.endsWith('_map.json')) continue;
	const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
	if (j._crystal_tileset) continue;
	const stem = f.replace('_map.json', '');
	if (fs.existsSync(path.join(D, 'scripts', stem + '.json'))) stems.push(stem);
}

const find = (dirs, stem) => {
	const b = stem.replace(/^Hoenn2_/, '');   // Hoenn2_ is the editing clone
	for (const dec of Object.keys(dirs)) {
		const p = path.join(dirs[dec], 'scripts', b + '.json');
		if (fs.existsSync(p)) return p;
	}
	return null;
};

let changedFiles = 0, changedLabels = 0, protectedLabels = 0, noSrc = 0;
const kinds = { prompt: 0, hasitem: 0, itemspace: 0, other: 0 };
const protectedFiles = new Set();
for (const stem of stems) {
	const fp = find(fresh, stem), bp = find(base, stem);
	if (!fp || !bp) { noSrc++; continue; }
	const ours = JSON.parse(fs.readFileSync(path.join(D, 'scripts', stem + '.json'), 'utf8'));
	const nu = JSON.parse(fs.readFileSync(fp, 'utf8'));
	const old = JSON.parse(fs.readFileSync(bp, 'utf8'));
	let n = 0;
	for (const label of Object.keys(nu)) {
		const a = JSON.stringify(ours[label] ?? null);
		const b = JSON.stringify(nu[label]);
		if (a === b) continue;
		// only replace what the UNFIXED transpiler also produced — proof no human edited it
		if (a !== JSON.stringify(old[label] ?? null)) { protectedLabels++; protectedFiles.add(stem); continue; }
		if (/"op":"prompt"/.test(b)) kinds.prompt++;
		else if (/"op":"hasitem"/.test(b)) kinds.hasitem++;
		else if (/"var":"VAR_RESULT","value":1/.test(b)) kinds.itemspace++;
		else kinds.other++;
		ours[label] = nu[label];
		n++; changedLabels++;
	}
	if (!n) continue;
	changedFiles++;
	if (WRITE) fs.writeFileSync(path.join(D, 'scripts', stem + '.json'), JSON.stringify(ours));
}

console.log(`\nFireRed/Emerald script files: ${stems.length}   (no decomp source: ${noSrc})`);
console.log(`  files changed:  ${changedFiles}`);
console.log(`  labels changed: ${changedLabels}`);
console.log(`     yes/no questions restored (MSGBOX_YESNO): ${kinds.prompt}`);
console.log(`     checkitem gates restored:                 ${kinds.hasitem}`);
console.log(`     checkitemspace answered explicitly:       ${kinds.itemspace}`);
console.log(`     other:                                    ${kinds.other}`);
console.log(`  labels PROTECTED (differ from a clean transpile — hand-patched): ${protectedLabels}`);
console.log('     in: ' + [...protectedFiles].join(', '));

console.log(WRITE
	? '\nWRITTEN — owdata is gitignored, deploy with:\n  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true'
	: '\n(dry run — pass --write to apply)');
