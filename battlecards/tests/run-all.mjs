// tests/run-all.mjs — run every Battlecards engine test suite in sequence.
// Usage:  node battlecards/tests/run-all.mjs         (from the repo root)
//         node battlecards/tests/run-all.mjs frigid  (only suites whose filename contains "frigid")
//         npm test -- frigid                         (same, through npm)
// Exit code is non-zero if any suite fails, so this is CI-safe.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const dirs = ['characterization', 'unit', 'regression', 'fuzz'];
const filter = (process.argv[2] || '').toLowerCase(); // substring match on the filename
let suites = 0, failed = 0;

for (const d of dirs) {
	let files = [];
	try { files = readdirSync(join(here, d)).filter(f => f.endsWith('_test.mjs') && (!filter || f.toLowerCase().includes(filter))).sort(); } catch { continue; }
	for (const f of files) {
		const r = spawnSync(process.execPath, [join(here, d, f)], { encoding: 'utf8' });
		const tail = (r.stdout || '').trim().split('\n').pop() || '(no output)';
		const ok = r.status === 0;
		suites++;
		if (!ok) { failed++; console.log(`FAIL  ${d}/${f}: ${tail}`); if (r.stderr) console.log(r.stderr.slice(0, 800)); }
		else console.log(`ok    ${d}/${f}: ${tail}`);
	}
}
if (!suites && filter) console.log(`no suites match "${filter}"`);
console.log(`\n${suites - failed}/${suites} suites passed`);
process.exit(failed || (!suites && filter) ? 1 : 0);
