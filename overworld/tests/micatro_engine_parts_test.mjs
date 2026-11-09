// micatro_engine_parts_test.mjs — the gate's split of the Micatro engine suites (micatro_engine_parts.mjs):
// every suite micatro_engine_test.mjs runs lands in exactly ONE micatro_engine_<i>_test.mjs part, the split is
// deterministic, the generated wrappers are current, and the quick gate maps a changed micatro test to its part.
// Pure: reads the suite folders, runs nothing.
//   node overworld/tests/micatro_engine_parts_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PARTS, engineSuites, assignParts, partSuites, partsOfTestFile, partSuiteName, wrapperSource, loadTimings, estOf, DEFAULT_SECS } from './micatro_engine_parts.mjs';
import { gateSuites, NOT_SUITES } from './gate-shard.mjs';
import { selectSuites } from './select-changed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const all = engineSuites().map(([l]) => l);
A(all.length > 150 && new Set(all).size === all.length, `the engine suite list: ${all.length} distinct suites`);
A(all.includes('fuzz_runs_test.mjs') && all.includes('fuzz_runs_test.mjs 24 pokermon') && all.includes('fuzz_runs_test.mjs 16 all'), 'the three fuzz passes are listed');

// exactly once: the union of the parts is the list, and no suite is in two parts
{
	const seen = new Map();
	for (let i = 1; i <= PARTS; i++) for (const [l] of partSuites(i)) seen.set(l, [...(seen.get(l) || []), i]);
	const missing = all.filter((l) => !seen.has(l));
	const twice = [...seen].filter(([, ps]) => ps.length > 1).map(([l, ps]) => `${l} in parts ${ps.join(',')}`);
	const extra = [...seen.keys()].filter((l) => !all.includes(l));
	A(!missing.length, 'every engine suite is in a part', missing.join(', '));
	A(!twice.length, 'no engine suite is in two parts', twice.join('; '));
	A(!extra.length, 'the parts run nothing else', extra.join(', '));
	A(Array.from({ length: PARTS }, (_, j) => partSuites(j + 1).length).every((n) => n > 0), `all ${PARTS} parts run something`);
}
// a suite the timings don't know yet still lands in exactly one part (it counts DEFAULT_SECS)
{
	const bins = assignParts([...all, 'brand_new_test.mjs'], PARTS);
	A(bins.filter((b) => b.labels.includes('brand_new_test.mjs')).length === 1 && bins.reduce((a, b) => a + b.labels.length, 0) === all.length + 1, 'an unknown suite is assigned exactly once');
}
// deterministic: the input order doesn't matter
{
	const t = loadTimings();
	const a = JSON.stringify(assignParts(all, PARTS, t));
	const b = JSON.stringify(assignParts([...all].reverse(), PARTS, t));
	let s = 12345;
	const shuffled = all.map((l) => [(s = (s * 1664525 + 1013904223) >>> 0), l]).sort((x, y) => x[0] - y[0]).map(([, l]) => l);
	const c = JSON.stringify(assignParts(shuffled, PARTS, t));
	A(a === b && a === c, 'the split does not depend on the listing order');
}
// the timings know every suite (refresh: micatro_engine_parts.mjs --update <micatro_engine_test.mjs log>), the fuzz
// passes are on different parts, and no part is far over the mean
{
	const t = loadTimings();
	const unknown = all.filter((l) => !Number.isFinite(t[l]));
	A(unknown.length <= 10, `micatro-engine-timings.json knows the suites (${unknown.length} counted at ${DEFAULT_SECS}s)`, unknown.slice(0, 10).join(', ') + (unknown.length > 10 ? ' ...' : ''));
	const bins = assignParts(all, PARTS, t);
	const fuzzParts = bins.map((b, i) => (b.labels.some((l) => /^fuzz_runs_test\.mjs/.test(l)) ? i : -1)).filter((i) => i >= 0);
	A(fuzzParts.length === 3, 'the three fuzz_runs passes run in three different parts', JSON.stringify(fuzzParts));
	const mean = bins.reduce((a, b) => a + b.secs, 0) / PARTS, max = Math.max(...bins.map((b) => b.secs));
	const longest = Math.max(...all.map((l) => estOf(l, t)));
	A(max <= Math.max(mean * 1.25, longest), `balanced: the longest part ~${max}s vs a mean of ~${Math.round(mean)}s`);
}
// the generated wrappers: exactly PARTS of them, each current
{
	const files = fs.readdirSync(here).filter((f) => /^micatro_engine_\d+_test\.mjs$/.test(f)).sort();
	const want = Array.from({ length: PARTS }, (_, j) => partSuiteName(j + 1)).sort();
	A(JSON.stringify(files) === JSON.stringify(want), `wrappers micatro_engine_1..${PARTS}_test.mjs (regenerate: micatro_engine_parts.mjs --gen)`, JSON.stringify(files));
	const stale = want.filter((f, j) => fs.existsSync(path.join(here, f)) && fs.readFileSync(path.join(here, f), 'utf8').replace(/\r\n/g, '\n') !== wrapperSource(+f.match(/\d+/)[0]));
	A(!stale.length, 'every wrapper is current (micatro_engine_parts.mjs --gen)', stale.join(', '));
}
// the gate runs the parts, never the all-in-one runner (which would run every suite twice)
{
	const g = gateSuites();
	A(NOT_SUITES.has('micatro_engine_test.mjs') && !g.includes('micatro_engine_test.mjs'), 'micatro_engine_test.mjs is not a gate suite');
	A(Array.from({ length: PARTS }, (_, j) => partSuiteName(j + 1)).every((s) => g.includes(s)), 'every part is a gate suite');
}
// the quick gate: a changed micatro test selects the part(s) that run it; a helper selects every part
{
	const g = gateSuites();
	const sel = (f) => [...selectSuites({ files: [f], diffFor: () => '', contentFor: () => '', suiteFiles: g, suiteSource: () => '' }).suites.keys()].filter((s) => /^micatro_engine_\d+_test\.mjs$/.test(s));
	const owner = (l) => partSuiteName(assignParts(all, PARTS).findIndex((b) => b.labels.includes(l)) + 1);
	A(JSON.stringify(sel('micatro/tests/mods/bunco_test.mjs')) === JSON.stringify([owner('mods/bunco_test.mjs')]), 'a changed mod suite selects just its part', JSON.stringify(sel('micatro/tests/mods/bunco_test.mjs')));
	A(JSON.stringify(sel('micatro/tests/jokers_test.mjs')) === JSON.stringify([owner('jokers_test.mjs')]), 'a changed engine suite selects just its part');
	const fz = ['fuzz_runs_test.mjs', 'fuzz_runs_test.mjs 24 pokermon', 'fuzz_runs_test.mjs 16 all'].map(owner).sort();
	A(JSON.stringify(sel('micatro/tests/fuzz_runs_test.mjs').sort()) === JSON.stringify([...new Set(fz)]), 'fuzz_runs_test.mjs selects the parts of all three fuzz passes');
	A(sel('micatro/tests/mods/poke_helpers.mjs').length === PARTS && sel('micatro/tests/replay_bot.mjs').length === PARTS, 'a changed test helper selects every part');
	A(sel('overworld/tests/micatro_engine_test.mjs').length === PARTS, 'a changed micatro_engine_test.mjs selects every part');
	A(partsOfTestFile('micatro/js/engine/run.js') === null && sel('README.md').length === 0, 'non-test paths are not mapped by file');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
