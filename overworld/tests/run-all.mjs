// tests/run-all.mjs — run every overworld test in sequence (the battlecards
// runner's twin). These are dev-machine checks: most boot headless Chrome
// against the LOCAL overworld/data assets (gitignored + offloaded), so this
// is a pre-push gate for overworld work, not CI.
// Usage:  node overworld/tests/run-all.mjs           (from the repo root)
//         CHROME=<path> node overworld/tests/run-all.mjs
// Exit code is non-zero if any test fails. Each test gets 5 minutes.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
// every *_test.mjs, plus the two runnables that predate the naming convention
// (quest_graph.mjs is a shared helper, not a test)
const files = [
	...readdirSync(here).filter(f => f.endsWith('_test.mjs')),
	'boot_smoke.mjs', 'quest_reach.mjs',
].sort();

let suites = 0, failed = 0;
const t0 = Date.now();
for (const f of files) {
	const started = Date.now();
	const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8', timeout: 5 * 60_000 });
	const secs = Math.round((Date.now() - started) / 1000);
	const tail = (r.stdout || '').trim().split('\n').pop() || '(no output)';
	const ok = r.status === 0;
	suites++;
	if (!ok) {
		failed++;
		console.log(`FAIL  ${f} (${secs}s): ${r.signal ? 'TIMED OUT / ' + r.signal : tail}`);
		if (r.stderr) console.log(r.stderr.slice(0, 800));
	} else {
		console.log(`ok    ${f} (${secs}s): ${tail}`);
	}
}
console.log(`\n${suites - failed}/${suites} tests passed in ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(failed ? 1 : 0);
