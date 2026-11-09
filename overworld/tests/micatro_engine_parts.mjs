// micatro_engine_parts.mjs — Micatro's headless node suites (micatro/tests/*_test.mjs, micatro/tests/mods/*_test.mjs
// and the fuzz passes), split into PARTS balanced parts so the CI gate can run them on different runners.
//
// The suite list is the one micatro_engine_test.mjs always ran. The split is DETERMINISTIC: greedy longest-first
// on the committed micatro-engine-timings.json (seconds per suite; a suite it doesn't know yet counts DEFAULT_SECS
// and still lands in exactly one part), ties broken by name. Every part computes the same split from the same
// inputs, so the parts never overlap and never miss a suite (micatro_engine_parts_test.mjs checks that).
//
//   node overworld/tests/micatro_engine_test.mjs            every suite (developers; the parts together = this)
//   node overworld/tests/micatro_engine_test.mjs --part 3/8 one part (= micatro_engine_3_test.mjs, what the gate runs)
//   node overworld/tests/micatro_engine_parts.mjs --plan    print the split and each part's estimated seconds
//   node overworld/tests/micatro_engine_parts.mjs --update <log>...  fold the "ok   - micatro/tests/x (Ns)" lines of
//        micatro_engine_test.mjs output into micatro-engine-timings.json (relative times are all the balance needs)
//   node overworld/tests/micatro_engine_parts.mjs --gen     (re)write the micatro_engine_<i>_test.mjs wrappers for PARTS
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../');
const DIR = path.join(ROOT, 'micatro/tests');
// how many gate suites the engine suites are split into (micatro_engine_1_test.mjs .. micatro_engine_<PARTS>_test.mjs)
export const PARTS = 8;
export const TIMINGS = path.join(here, 'micatro-engine-timings.json');
export const DEFAULT_SECS = 10;

// [label, argv] for every suite, in the order micatro_engine_test.mjs has always run them
export function engineSuites() {
	const suites = fs.readdirSync(DIR).filter((f) => f.endsWith('_test.mjs')).sort()
		.map((f) => [f, [path.join(DIR, f), ...(f === 'fuzz_runs_test.mjs' ? ['40'] : [])]]);
	const MODDIR = path.join(DIR, 'mods');
	if (fs.existsSync(MODDIR)) {
		for (const f of fs.readdirSync(MODDIR).filter((x) => x.endsWith('_test.mjs')).sort()) suites.push(['mods/' + f, [path.join(MODDIR, f)]]);
	}
	// a fuzz pass with Pokermon on ...
	suites.push(['fuzz_runs_test.mjs 24 pokermon', [path.join(DIR, 'fuzz_runs_test.mjs'), '24', 'pokermon']]);
	// ... and every mod on at once (mod decks / stakes / jokers favoured by the bot)
	suites.push(['fuzz_runs_test.mjs 16 all', [path.join(DIR, 'fuzz_runs_test.mjs'), '16', 'all']]);
	return suites;
}

export function loadTimings(file = TIMINGS) {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}
export const estOf = (label, timings) => (Number.isFinite(timings[label]) ? timings[label] : DEFAULT_SECS);
// -> k bins { labels, secs } (part i is result[i - 1]); greedy longest-first, ties by name, then the lowest part
export function assignParts(labels, k = PARTS, timings = loadTimings()) {
	const bins = Array.from({ length: k }, () => ({ labels: [], secs: 0 }));
	const order = [...new Set(labels)].sort((a, b) => estOf(b, timings) - estOf(a, timings) || (a < b ? -1 : a > b ? 1 : 0));
	for (const l of order) {
		let best = 0;
		for (let j = 1; j < k; j++) if (bins[j].secs < bins[best].secs) best = j;
		bins[best].labels.push(l);
		bins[best].secs += estOf(l, timings);
	}
	return bins;
}
// the part (1-based) a suite label runs in
export function partOfLabel(label, k = PARTS, timings = loadTimings()) {
	const bins = assignParts(engineSuites().map(([l]) => l), k, timings);
	const i = bins.findIndex((b) => b.labels.includes(label));
	return i < 0 ? null : i + 1;
}
// the parts a changed micatro/tests/** file maps to (the quick gate): a suite file -> the part(s) running it
// (fuzz_runs_test.mjs runs three times); a shared helper/fixture -> null (= every part)
export function partsOfTestFile(rel, k = PARTS, timings = loadTimings()) {
	const m = rel.replace(/\\/g, '/').match(/^micatro\/tests\/((?:mods\/)?[^/]+_test\.mjs)$/);
	if (!m) return null;
	const bins = assignParts(engineSuites().map(([l]) => l), k, timings);
	const parts = bins.map((b, i) => (b.labels.some((l) => l.split(' ')[0] === m[1]) ? i + 1 : 0)).filter(Boolean);
	return parts.length ? parts : null;
}
export const partSuiteName = (i) => `micatro_engine_${i}_test.mjs`;

// run suites (in engineSuites order), print one line each + a summary; -> exit code
export function runSuites(suites, tag = '') {
	let fail = 0;
	const t0 = Date.now(), took = [];
	for (const [f, args] of suites) {
		const s0 = Date.now();
		const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 600000 });
		const secs = Math.round((Date.now() - s0) / 1000);
		took.push([f, secs]);
		const last = (r.stdout || '').trim().split('\n').pop();
		const ok = r.status === 0;
		if (!ok) fail++;
		console.log(`${ok ? 'ok  ' : 'FAIL'} - micatro/tests/${f} (${secs}s): ${last}`);
		if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).slice(0, 15).join('\n') + (r.stderr || '').slice(0, 2000));
	}
	const slow = took.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, s]) => `${f} ${s}s`).join(', ');
	console.log(`${suites.length - fail} passed, ${fail} failed${tag} in ${Math.round((Date.now() - t0) / 1000)}s (slowest: ${slow})`);
	return fail ? 1 : 0;
}
// "3/8" -> one part's suites, in engineSuites order
export function partSuites(i, k = PARTS) {
	const all = engineSuites();
	const mine = new Set(assignParts(all.map(([l]) => l), k)[i - 1].labels);
	return all.filter(([l]) => mine.has(l));
}
export function runPart(i, k = PARTS) {
	if (!(i >= 1 && i <= k)) throw new Error(`part ${i}/${k} out of range`);
	process.exit(runSuites(partSuites(i, k), ` (part ${i}/${k})`));
}

// the gate wrappers, one per part: the header (shared) names what they cover, so `run-all.mjs --changed` selects them
// (micatro_engine_test.mjs's header, up to its usage lines)
function header() {
	const lines = fs.readFileSync(path.join(here, 'micatro_engine_test.mjs'), 'utf8').split(/\r?\n/);   // (a CRLF checkout too)
	const end = lines.findIndex((l) => /^\/\/ +node overworld\/tests\//.test(l));
	return lines.slice(0, end).filter((l) => l.startsWith('//')).map((l, j) => (j ? l : l.replace(/^\/\/ micatro_engine_test\.mjs — runs/, '// They run')));
}
export function wrapperSource(i, k = PARTS) {
	return [
		`// ${partSuiteName(i)} — part ${i} of ${k} of micatro_engine_test.mjs (GENERATED by micatro_engine_parts.mjs --gen; do not edit).`,
		`// The gate runs the Micatro engine suites as ${k} parts so its shards can run them in parallel; the split lives in`,
		`// micatro_engine_parts.mjs (balanced on micatro-engine-timings.json). What the parts cover:`,
		...header(),
		`//   node overworld/tests/${partSuiteName(i)}`,
		`import { runPart } from './micatro_engine_parts.mjs';`,
		`runPart(${i}, ${k});`,
		'',
	].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const args = process.argv.slice(2);
	if (args[0] === '--update') {
		const t = loadTimings();
		for (const f of args.slice(1)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
			const m = l.match(/^ok\s+- micatro\/tests\/(.+?) \((\d+)s\):/);
			if (m) t[m[1]] = Math.max(1, +m[2]);
		}
		const labels = new Set(engineSuites().map(([l]) => l));
		const sorted = Object.fromEntries(Object.keys(t).filter((l) => labels.has(l)).sort().map((l) => [l, t[l]]));   // drop deleted suites
		fs.writeFileSync(TIMINGS, JSON.stringify(sorted, null, 1) + '\n');
		console.log(`micatro-engine-timings.json: ${Object.keys(sorted).length} suites, ${Object.values(sorted).reduce((a, b) => a + b, 0)}s serial`);
	} else if (args[0] === '--plan') {
		const k = +args[1] || PARTS;
		assignParts(engineSuites().map(([l]) => l), k).forEach((b, j) => console.log(`part ${j + 1}/${k}: ${b.labels.length} suites, ~${b.secs}s (longest ${b.labels[0]})`));
	} else if (args[0] === '--gen') {
		for (const f of fs.readdirSync(here).filter((x) => /^micatro_engine_\d+_test\.mjs$/.test(x))) fs.unlinkSync(path.join(here, f));
		for (let i = 1; i <= PARTS; i++) fs.writeFileSync(path.join(here, partSuiteName(i)), wrapperSource(i));
		console.log(`wrote ${PARTS} wrappers: ${partSuiteName(1)} .. ${partSuiteName(PARTS)}`);
	} else console.log('usage: micatro_engine_parts.mjs --plan [k] | --update <log>... | --gen');
}
