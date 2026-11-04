// gate-shard.mjs — split the overworld gate's suites into N balanced shards.
//
// The CI gate (.github/workflows/gate.yml) runs `run-all.mjs --shard i/n` on n
// runners at once; locally the same command runs the same slice. Every shard
// computes the SAME assignment from the same inputs, so no coordination is needed:
//   * the suite list (the full list, or the --changed selection),
//   * gate-timings.json (committed: seconds per suite from a real gate log;
//     a suite it doesn't know is DEFAULT_SECS),
// and nothing machine-local (.gate-history.json is never used for assignment).
// Assignment is greedy longest-first: suites by time (desc, then name), each into
// the shard with the least total so far (ties: the lowest shard number).
//
//   node overworld/tests/gate-shard.mjs --update <gate.log>...   (fold "ok x.mjs (Ns)" timings into gate-timings.json)
//   node overworld/tests/gate-shard.mjs --plan 16                 (print the full gate's 16 shards and their totals)
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export const TIMINGS = join(here, 'gate-timings.json');
export const DEFAULT_SECS = 30;

export function loadTimings(file = TIMINGS) {
	try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
// "3/16" -> { i: 3, n: 16 } (1-based), or throws
export function parseShard(s) {
	const m = String(s || '').match(/^(\d+)\/(\d+)$/);
	if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error(`--shard wants i/n with 1 <= i <= n, got "${s}"`);
	return { i: +m[1], n: +m[2] };
}
export const estOf = (f, timings) => (Number.isFinite(timings[f]) ? timings[f] : DEFAULT_SECS);
// -> n arrays of suite names (shard k is result[k - 1]) + their estimated totals
export function assignShards(suites, n, timings = {}) {
	const bins = Array.from({ length: n }, () => ({ suites: [], secs: 0 }));
	const order = [...new Set(suites)].sort((a, b) => estOf(b, timings) - estOf(a, timings) || (a < b ? -1 : a > b ? 1 : 0));
	for (const f of order) {
		let best = 0;
		for (let k = 1; k < n; k++) if (bins[k].secs < bins[best].secs) best = k;
		bins[best].suites.push(f);
		bins[best].secs += estOf(f, timings);
	}
	return bins;
}
// timings from gate logs: every "ok    x.mjs (Ns)" line, the later log winning
export function timingsFromLogs(texts) {
	const out = {};
	for (const t of texts) for (const l of t.split(/\r?\n/)) {
		const m = l.match(/^ok\s+([\w.-]+\.mjs) \((\d+)s\)/);
		if (m) out[m[1]] = +m[2];
	}
	return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const args = process.argv.slice(2);
	if (args[0] === '--update') {
		const t = { ...loadTimings(), ...timingsFromLogs(args.slice(1).map(f => readFileSync(f, 'utf8'))) };
		const suites = new Set([...readdirSync(here).filter(f => f.endsWith('_test.mjs')), 'boot_smoke.mjs', 'quest_reach.mjs']);
		const sorted = Object.fromEntries(Object.keys(t).filter(k => suites.has(k)).sort().map(k => [k, t[k]]));   // drop deleted suites
		writeFileSync(TIMINGS, JSON.stringify(sorted, null, 1) + '\n');
		console.log(`gate-timings.json: ${Object.keys(sorted).length} suites, ${Object.values(sorted).reduce((a, b) => a + b, 0)}s serial`);
	} else if (args[0] === '--plan') {
		const n = +args[1] || 16, timings = loadTimings();
		const all = [...readdirSync(here).filter(f => f.endsWith('_test.mjs')), 'boot_smoke.mjs', 'quest_reach.mjs'].sort();
		assignShards(all, n, timings).forEach((b, k) => console.log(`shard ${k + 1}/${n}: ${b.suites.length} suites, ~${b.secs}s serial (longest ${b.suites[0]})`));
	} else console.log('usage: gate-shard.mjs --update <gate.log>... | --plan <n>');
}
