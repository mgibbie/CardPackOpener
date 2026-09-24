// owsource.mjs — the text of "the old main.js", for tests that check source code.
//
// The main.js split (Plans/MAIN_JS_SPLIT_PLAN.md) moves sections into ow_*.js
// modules. A test that greps main.js for a piece of code would fail the moment
// that code moves, though nothing changed. Reading main.js plus every split-out
// ow_*.js module keeps those checks about WHAT the code does, not which file
// holds it. (Not a *_test.mjs, so the gate runner doesn't run it.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function overworldSource() {
	const split = fs.readdirSync(OW).filter(f => /^ow_.*\.js$/.test(f)).sort();
	return ['main.js', ...split].map(f => fs.readFileSync(path.join(OW, f), 'utf8')).join('\n');
}
