// micasurvivor_expedition_forceload_test.mjs — MicaSurvivor DLC D0b: loading the Expedition code doesn't leak into the
// base modes. Runs the UNCHANGED D0a golden-run test (micasurvivor_dlc_base_unchanged_test.mjs, its fixtures as
// recorded, no re-record) with the preload micasurvivor_expedition_forceload.mjs, which awaits G.Expedition.load() in
// every page before its base-mode sim / replay playback: the base tables frozen, js/expedition/* injected and attached
// to every G.Hooks seam. Every base mode (Normal, Daily, Boss Rush, Tower, Team, local Co-op) and the fixture replay
// must still match the D0a fixtures to the byte (per-second hashes, Math.random draws, spawns, totals, saves).
//   node overworld/tests/micasurvivor_expedition_forceload_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout>, as for the D0a test.)
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + extra : '')); } };

const t0 = Date.now();
const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(HERE, 'micasurvivor_expedition_forceload.mjs')).href, path.join(HERE, 'micasurvivor_dlc_base_unchanged_test.mjs')],
	{ encoding: 'utf8', env: process.env, maxBuffer: 64 * 2 ** 20, timeout: 900_000 });
const out = (r.stdout || '') + (r.stderr || '');
const loads = out.split('\n').filter(l => l.startsWith('forceload: '));
const okLoads = loads.filter(l => l.startsWith('forceload: ok '));
const sum = out.match(/\n(\d+) passed, (\d+) failed/);
const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const pages = (only.length || 6) + (!only.length || only.includes('normal') ? 1 : 0);   // a page per mode + the replay player
for (const l of loads) console.log('     ' + l);
A(okLoads.length === pages && loads.length === pages, `every D0a page loaded the Expedition code first (${okLoads.length} / ${pages}: freeze, js/expedition/*, every seam attached)`, loads.filter(l => !l.startsWith('forceload: ok ')).join(' | '));
A(okLoads.length > 0 && okLoads.every(l => / seams 1(\/1){3,} /.test(l)), 'in each, the Expedition listens on every seam once (run.start / run.end / replay.header / spectate.snap; D1: net.frame)');
A(r.status === 0 && sum && +sum[2] === 0 && +sum[1] > 0, `the UNCHANGED D0a golden runs still pass against the D0a fixtures (${sum ? sum[1] + ' passed, ' + sum[2] + ' failed' : 'no summary'})`, fails.slice(0, 6).join('\n      ') || out.slice(-600));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
