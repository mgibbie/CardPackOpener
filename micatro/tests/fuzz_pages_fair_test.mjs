// Pages "fair safe" = Pages "fair safe", byte for byte. Rev 5 made the Page guarantee per ante (engine/pages.js pageGuaranteed: no
// Page on the Small / Big Blind -> that ante's Boss gets one); a run recorded on rev 4 must keep rev 4's cross-ante pity timer exactly,
// or its save / replay re-simulates into a different game. The fuzz bot (fuzz_runs_test.mjs) plays on engine rev 4
// (MICATRO_FUZZ_REV=4) and prints a hash of every run's actions + end state. The expected hashes were recorded by the same bot on
// origin/main before rev 5 existed (2026-11-09, f808d580): if a rev-5 rule ever leaks into a rev-4 run, the hash changes.
//   node micatro/tests/fuzz_pages_fair_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES = [
  { args: ['30'], digest: '883e604d9279af9b2032e362c18beb0a451aee2a8bd15b87268b3359329bf800' },
  { args: ['10', 'pokermon'], digest: 'd9f3de63163ebbcc17968b94577c5c791ad7b728a5eb407b26dc561b143e066a' },
];
let fail = 0;
for (const c of CASES) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), ...c.args], {
    encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_FUZZ_REV: '4', MICATRO_FUZZ_DIGEST: '1' },
  });
  const m = /digest ([0-9a-f]{64})/.exec(r.stdout || '');
  const ok = r.status === 0 && m && m[1] === c.digest;
  if (!ok) { fail++; console.log('FAIL', c.args.join(' '), 'status', r.status, 'digest', m && m[1], (r.stderr || '').slice(0, 800)); }
  else console.log('ok  ', c.args.join(' '), 'identical to the rev-4 (Pages fair safe) runs');
}
console.log(`pages fair: ${CASES.length - fail}/${CASES.length} identical to rev 4`);
process.exit(fail ? 1 : 0);
