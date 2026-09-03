// perf_budget.mjs — regress-guard for the WORST-case board: an 8-player FFA
// with every board filled, on a DPR3 phone viewport. Drives tools/perf-snap.cjs
// (board scenario, --players=8) and asserts the numbers stay inside budget.
//
// Budgets are set from the 2026-09-03 baseline (headless swiftshader:
// fps ~20, textures 70, faceCache 66, entities 111, longtasks 0) with wide
// slack — this trips on a REGRESSION CLASS (texture leak, cache blowup,
// entity leak, main-thread stalls), not on run-to-run noise.
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
//   node battlecards/tests/integration/perf_budget.mjs
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const OUTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-perf-budget-'));

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra !== undefined ? '  ' + extra : '')); } };

const r = spawnSync(process.execPath, [
	path.join(ROOT, 'tools', 'perf-snap.cjs'), 'board',
	'--viewport=phone', '--players=8', '--label=budget', `--outdir=${OUTDIR}`,
], { encoding: 'utf8', timeout: 240000 });

const out = r.stdout || '';
const jsonAt = out.lastIndexOf('\n{');
let metrics = null;
try { metrics = JSON.parse(out.slice(jsonAt + 1))['board:phone']; } catch { /* asserted below */ }

A(!!metrics && !metrics.error, 'perf-snap board --players=8 @ phone completed', metrics?.error || (r.stderr || '').slice(0, 300) || out.slice(-300));
if (metrics && !metrics.error) {
	const t = metrics.three || {};
	A(metrics.summoned >= 8 * 7, 'all 8 boards filled (7 minions each)', 'summoned=' + metrics.summoned);
	A(metrics.fps >= 12, `fps ${metrics.fps} >= 12 (baseline ~20 under swiftshader)`, JSON.stringify({ fps: metrics.fps, gaps50: metrics.gaps50, maxGapMs: metrics.maxGapMs }));
	A(metrics.longtaskTotalMs <= 4000, `longtask total ${metrics.longtaskTotalMs}ms <= 4000ms`, 'worst=' + metrics.worstLongtaskMs);
	A(t.textures <= 120, `GPU textures ${t.textures} <= 120 (baseline 70)`);
	A(t.faceCache <= 110, `face-texture cache ${t.faceCache} <= 110 (baseline 66)`);
	A(t.entities <= 160, `live entities ${t.entities} <= 160 (baseline 111)`);
	A(t.geometries <= 30, `geometries ${t.geometries} <= 30 (baseline 6)`);
}

try { fs.rmSync(OUTDIR, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
