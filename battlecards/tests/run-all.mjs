// tests/run-all.mjs — run every Battlecards engine test suite in sequence.
// Usage:  node battlecards/tests/run-all.mjs         (from the repo root)
//         node battlecards/tests/run-all.mjs frigid  (only suites whose filename contains "frigid")
//         npm test -- frigid                         (same, through npm)
//         node battlecards/tests/run-all.mjs --shard 2/3  (every 3rd suite from the 2nd: CI's gate.yml runs 3 such jobs)
// Exit code is non-zero if any suite fails, so this is CI-safe.
import { existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
// a cloud session's Chrome (tools/cloud/setup.sh) — suites read CHROME and inherit this env
if (!process.env.CHROME && existsSync('/opt/chrome/chrome')) process.env.CHROME = '/opt/chrome/chrome';
const dirs =['characterization', 'unit', 'regression', 'fuzz'];
const argv = process.argv.slice(2).flatMap(a => /^--shard=/.test(a) ? ['--shard', a.slice(8)] : [a]);
const si = argv.indexOf('--shard');
const shard = si >= 0 ? argv.splice(si, 2)[1] : null;
const sm = shard && shard.match(/^(\d+)\/(\d+)$/);
if (shard && (!sm || +sm[1] < 1 || +sm[1] > +sm[2])) { console.log(`--shard wants i/n with 1 <= i <= n, got "${shard}"`); process.exit(2); }
const filter = (argv[0] || '').toLowerCase(); // substring match on the filename
let seen = 0;   // the suite's index over every directory: a shard takes every n-th one
let suites = 0, failed = 0;

for (const d of dirs) {
	let files = [];
	try { files = readdirSync(join(here, d)).filter(f => f.endsWith('_test.mjs') && (!filter || f.toLowerCase().includes(filter))).sort(); } catch { continue; }
	for (const f of files) {
		if (sm && (seen++ % +sm[2]) !== +sm[1] - 1) continue;
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
