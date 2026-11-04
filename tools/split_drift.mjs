// split_drift.mjs — after an extraction, find source-reading tests that lost their target
// (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3). Every string/regex literal in a test that
// reads main.js is matched against the committed main.js and the working-tree source;
// one that matched before and not now is a check that no longer finds the code it
// checks. Fix: switch that test to overworldSource() (overworld/tests/owsource.mjs).
//
//   node tools/split_drift.mjs      (no output = nothing drifted)
import fs from 'fs';
import { execSync } from 'child_process';
import * as espree from 'espree';
import { overworldSource } from '../overworld/tests/owsource.mjs';
const oldMain = execSync('git show HEAD:overworld/main.js', { encoding: 'utf8', maxBuffer: 64 << 20 });
const newAll = overworldSource();
const files = fs.readdirSync('overworld/tests').filter(f => f.endsWith('.mjs')).map(f => 'overworld/tests/' + f)
	// only tests that actually READ the source (mentioning main.js in a comment isn't enough:
	// their localStorage keys and mock-server actions are runtime values, not source checks)
	.filter(f => /readFileSync\([^)]*main\.js|overworldSource\(\)/.test(fs.readFileSync(f, 'utf8')));
const newMain = fs.readFileSync('overworld/main.js', 'utf8');
for (const f of files) {
	const text = fs.readFileSync(f, 'utf8');
	const usesAll = /overworldSource\(\)/.test(text);
	const newSrc = usesAll ? newAll : newMain;
	let toks; try { toks = espree.tokenize(text, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; }
	const hits = [];
	for (const t of toks) {
		let ok = null;
		// a bare identifier-like string ('magepunk_story', 'ow-save') is a runtime value —
		// a localStorage key, a mock-server action — not a piece of source being checked
		if (t.type === 'String' || t.type === 'Template') { const lit = t.value.slice(1, -1); if (lit.length >= 6 && !/^[\w-]+$/.test(lit) && !/^[a-z]+\/[\w.+-]+$/.test(lit)) ok =[oldMain.includes(lit), newSrc.includes(lit)]; }
		else if (t.type === 'RegularExpression') { try { const re = new RegExp(t.regex.pattern, t.regex.flags.replace('g', '')); ok = [re.test(oldMain), re.test(newSrc)]; } catch {} }
		if (ok && ok[0] && !ok[1]) hits.push(t.value.slice(0, 90));
	}
	if (hits.length) console.log(`${f}${usesAll ? '' : ' (reads main.js only)'}: ${hits.slice(0, 4).join('  |  ')}`);
}
