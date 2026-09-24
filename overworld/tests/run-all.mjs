// tests/run-all.mjs — run every overworld test (the battlecards runner's twin).
// These are dev-machine checks: most boot headless Chrome against the LOCAL
// overworld/data assets (gitignored + offloaded), so this is a pre-push gate for
// overworld work, not CI.
//
// Usage:  node overworld/tests/run-all.mjs             (from the repo root)
//         node overworld/tests/run-all.mjs portals     (only files whose name contains "portals")
//         node overworld/tests/run-all.mjs --jobs 2    (parallel; default is sized to RAM, 1 below 8 GB)
//         node overworld/tests/run-all.mjs --no-retry  (report first-run failures as-is)
//         CHROME=<path> node overworld/tests/run-all.mjs
// Exit code is non-zero if any test fails (after its retry). Each test gets 5 minutes.
//
// PARALLEL, SAFELY. Suites run in a worker pool, with two constraints read from
// the files themselves:
//   * PORTS: most suites serve the site on a hard-coded port, and many share one
//     (8875 is used by four). Two suites that name the same port never overlap.
//   * EXCLUSIVE: a suite that writes into the real data tree (EXCLUSIVE below)
//     runs alone, so nothing else reads a half-written map.
// The slowest suites start first, using timings from previous runs.
//
// FLAKES ARE REPORTED, NOT HIDDEN. A suite that fails is rerun once, alone, after
// everything else. If it passes then, it is listed as FLAKY (and counted in the
// history file) rather than silently passed. A suite that fails twice fails the gate.
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const jobsArg = flag('--jobs');
const noRetry = args.includes('--no-retry') && args.splice(args.indexOf('--no-retry'), 1);
const filter = (args[0] || '').toLowerCase(); // substring match on the filename
const TIMEOUT = 5 * 60_000;
// ~4 GB of RAM per worker. Each suite is a node process plus a headless Chrome,
// and on a 5.8 GB machine two workers ran each suite ~1.9x slower (145/145 in
// 1579s vs 1761s serial). Parallelism only pays with memory to spare.
const JOBS = Math.max(1, +jobsArg || Math.min(4, Math.floor(os.totalmem() / 2 ** 30 / 4)));
// suites that write into the real data tree
const EXCLUSIVE = new Set(['mapedit_places_test.mjs']);
const HISTORY = join(here, '.gate-history.json');   // gitignored

// every *_test.mjs, plus the two runnables that predate the naming convention
// (quest_graph.mjs is a shared helper, not a test)
const files = [
	...readdirSync(here).filter(f => f.endsWith('_test.mjs')),
	'boot_smoke.mjs', 'quest_reach.mjs',
].sort().filter(f => !filter || f.toLowerCase().includes(filter));

let history = {};
try { history = JSON.parse(readFileSync(HISTORY, 'utf8')); } catch {}
const portsOf = f => {
	const src = readFileSync(join(here, f), 'utf8');
	return new Set([...src.matchAll(/\bPORT\s*=\s*(\d{4,5})|\.listen\(\s*(\d{4,5})/g)].map(m => m[1] || m[2]));
};
const suites = files.map(f => ({ f, ports: portsOf(f), exclusive: EXCLUSIVE.has(f), est: history[f]?.secs ?? 30 }))
	.sort((a, b) => b.est - a.est);

function runOne(f) {
	return new Promise(resolve => {
		const started = Date.now();
		const child = spawn(process.execPath, [join(here, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '', err = '', timedOut = false;
		child.stdout.on('data', d => { out += d; });
		child.stderr.on('data', d => { err += d; });
		const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, TIMEOUT);
		child.on('close', code => {
			clearTimeout(timer);
			const secs = Math.round((Date.now() - started) / 1000);
			const tail = out.trim().split('\n').pop() || '(no output)';
			// the assertions that failed, so a red line says WHAT broke, not just a count
			const fails = out.split('\n').filter(l => /^FAIL[: ]/.test(l)).slice(0, 5).map(l => '        ' + l.slice(0, 300));
			resolve({ f, ok: code === 0 && !timedOut, secs, tail: timedOut ? 'TIMED OUT / SIGTERM' : tail, err, fails });
		});
	});
}

async function pool(list, jobs) {
	const pending = [...list], running = new Set(), results = [];
	const busyPorts = () => new Set([...running].flatMap(s => [...s.ports]));
	const canStart = s => {
		if (!running.size) return true;
		if (s.exclusive || [...running].some(r => r.exclusive)) return false;
		const busy = busyPorts();
		return ![...s.ports].some(p => busy.has(p));
	};
	await new Promise(done => {
		const pump = () => {
			while (running.size < jobs) {
				const i = pending.findIndex(canStart);
				if (i < 0) break;
				const s = pending.splice(i, 1)[0];
				running.add(s);
				runOne(s.f).then(r => {
					running.delete(s);
					results.push(r);
					console.log(`${r.ok ? 'ok   ' : 'FAIL '} ${r.f} (${r.secs}s): ${r.tail}`);
					if (!r.ok && r.fails.length) console.log(r.fails.join('\n'));
					if (!r.ok && r.err) console.log(r.err.slice(0, 800));
					if (!pending.length && !running.size) done(); else pump();
				});
			}
			if (!pending.length && !running.size) done();
		};
		pump();
	});
	return results;
}

const t0 = Date.now();
console.log(`${suites.length} suites, ${JOBS} at a time${noRetry ? '' : ', failures retried once alone'}\n`);
const first = await pool(suites, JOBS);
const failedFirst = first.filter(r => !r.ok);
let retried = [];
if (failedFirst.length && !noRetry) {
	console.log(`\nretrying ${failedFirst.length} failed suite(s) alone...`);
	retried = await pool(failedFirst.map(r => suites.find(s => s.f === r.f)), 1);
}
const flaky = retried.filter(r => r.ok).map(r => r.f);
const failed = noRetry ? failedFirst.map(r => r.f) : retried.filter(r => !r.ok).map(r => r.f);

// timings feed the next run's longest-first order; flake counts expose chronic offenders
for (const r of first) {
	const h = history[r.f] || { secs: r.secs, flaky: 0, failed: 0 };
	if (r.ok) h.secs = r.secs;
	if (flaky.includes(r.f)) h.flaky = (h.flaky || 0) + 1;
	if (failed.includes(r.f)) h.failed = (h.failed || 0) + 1;
	history[r.f] = h;
}
try { writeFileSync(HISTORY, JSON.stringify(history, null, 1)); } catch {}

if (!suites.length && filter) console.log(`no tests match "${filter}"`);
const secs = Math.round((Date.now() - t0) / 1000);
console.log(`\n${suites.length - failed.length}/${suites.length} tests passed in ${secs}s (${JOBS} jobs)`);
if (flaky.length) console.log(`FLAKY (failed, then passed alone): ${flaky.join(', ')}`);
if (failed.length) console.log(`FAILED: ${failed.join(', ')}`);
process.exit(failed.length || (!suites.length && filter) ? 1 : 0);
