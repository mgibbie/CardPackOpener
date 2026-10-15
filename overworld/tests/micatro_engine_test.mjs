// micatro_engine_test.mjs — runs Micatro's headless engine suites (micatro/tests/*_test.mjs:
// jokers, consumables, blinds/tags/backs, run flow) plus a short fuzz, so the gate covers
// the engine. No browser, no server.
// Covers micatro/js/engine: core.js run.js jokers.js consumables.js blind.js tag.js
// back.js describe.js view.js session.js and micatro/data/balatro_data.js (named here so
// `run-all.mjs --changed` selects this suite when any of them change).
//   node overworld/tests/micatro_engine_test.mjs
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const DIR = path.join(ROOT, 'micatro/tests');
const suites = fs.readdirSync(DIR).filter((f) => f.endsWith('_test.mjs')).sort();
let fail = 0;
for (const f of suites) {
  const args = [path.join(DIR, f)];
  if (f === 'fuzz_runs_test.mjs') args.push('40');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 600000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} - micatro/tests/${f}: ${last}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).slice(0, 15).join('\n') + (r.stderr || '').slice(0, 2000));
}
console.log(`${suites.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
