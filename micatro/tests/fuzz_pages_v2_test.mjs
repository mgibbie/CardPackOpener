// Pages v2 = Pages v2, byte for byte. Rev 4 added the no-prize Fair Page guarantee (engine/pages.js ensureFairSafe); a run recorded on rev 3 must
// keep rev 3's offers exactly, or its save / replay re-simulates into a different game. The fuzz bot
// (fuzz_runs_test.mjs) plays on engine rev 3 (MICATRO_FUZZ_REV=3) and prints a hash of every run's actions + end state. The
// expected hashes were recorded by the same bot on origin/main before rev 4 existed (2026-11-08, 74ff6573): if a rev-4 rule
// ever leaks into a rev-3 run, the hash changes.
//   node micatro/tests/fuzz_pages_v2_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES = [
  { args: ['30'], digest: '78e586329fe307ef142cb1e6b2f2877db822b4477183c449f1f9f18cee0b8a7b' },
  { args: ['10', 'pokermon'], digest: 'faa4a9e96543be30300c0581beca98d313fb00a06f2c803182d71c3eeba1e56d' },
];
let fail = 0;
for (const c of CASES) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), ...c.args], {
    encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_FUZZ_REV: '3', MICATRO_FUZZ_DIGEST: '1' },
  });
  const m = /digest ([0-9a-f]{64})/.exec(r.stdout || '');
  const ok = r.status === 0 && m && m[1] === c.digest;
  if (!ok) { fail++; console.log('FAIL', c.args.join(' '), 'status', r.status, 'digest', m && m[1], (r.stderr || '').slice(0, 800)); }
  else console.log('ok  ', c.args.join(' '), 'identical to the rev-3 (Pages v2) runs');
}
console.log(`pages v2: ${CASES.length - fail}/${CASES.length} identical to rev 3`);
process.exit(fail ? 1 : 0);
