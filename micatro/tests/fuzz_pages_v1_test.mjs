// Pages v1 = Pages v1, byte for byte. Pages v2 (engine rules rev 3) changed the Pages tables; a run recorded on rev 2 must
// keep v1's offers, effects and prizes, or its save / replay re-simulates into a different game. The fuzz bot
// (fuzz_runs_test.mjs) plays on engine rev 2 (MICATRO_FUZZ_REV=2) and prints a hash of every run's actions + end state. The
// expected hashes were recorded by the same bot on origin/main before Pages v2 existed (2026-11-07, b32f6903): if a v2 rule
// ever leaks into a rev-2 run, the hash changes.
//   node micatro/tests/fuzz_pages_v1_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES = [
  { args: ['30'], digest: 'ef2546d3eef3972ded3f9e2da967695b6735361cefa0f91cd2bce8233c11c885' },
  { args: ['10', 'pokermon'], digest: '31234925ab15b62a7a6182b0b9720cf8e0a0952ae538336c5246ab54c40344eb' },
];
let fail = 0;
for (const c of CASES) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), ...c.args], {
    encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_FUZZ_REV: '2', MICATRO_FUZZ_DIGEST: '1' },
  });
  const m = /digest ([0-9a-f]{64})/.exec(r.stdout || '');
  const ok = r.status === 0 && m && m[1] === c.digest;
  if (!ok) { fail++; console.log('FAIL', c.args.join(' '), 'status', r.status, 'digest', m && m[1], (r.stderr || '').slice(0, 800)); }
  else console.log('ok  ', c.args.join(' '), 'identical to the Pages v1 runs');
}
console.log(`pages v1: ${CASES.length - fail}/${CASES.length} identical to Pages v1`);
process.exit(fail ? 1 : 0);
