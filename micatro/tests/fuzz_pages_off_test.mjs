// Pages off = the game before Pages, byte for byte. The fuzz bot (fuzz_runs_test.mjs) plays on the LEGACY engine rules
// (MICATRO_FUZZ_PAGES=0: newRun / the replay on engine rev 1) and prints a hash of every run's actions + end state. The
// expected hashes were recorded by the same bot on origin/main before Pages existed (2026-11-07, 8da0394c): if Pages ever
// leak into a run recorded before them (an old save, an old replay), the hash changes.
//   node micatro/tests/fuzz_pages_off_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES = [
  { args: ['30'], digest: 'dffbf7b77753434049d2c9f713d39b9119df851c23efce15051fe7fca6effb6e' },
  { args: ['10', 'pokermon'], digest: '183502a74e6e089ee15a68bb150f3ea46276e6db377477a7edc2ed129f29f0ee' },
];
let fail = 0;
for (const c of CASES) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), ...c.args], {
    encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_FUZZ_PAGES: '0', MICATRO_FUZZ_DIGEST: '1' },
  });
  const m = /digest ([0-9a-f]{64})/.exec(r.stdout || '');
  const ok = r.status === 0 && m && m[1] === c.digest;
  if (!ok) { fail++; console.log('FAIL', c.args.join(' '), 'status', r.status, 'digest', m && m[1], (r.stderr || '').slice(0, 800)); }
  else console.log('ok  ', c.args.join(' '), 'identical to the pre-Pages runs');
}
console.log(`pages off: ${CASES.length - fail}/${CASES.length} identical to before Pages`);
process.exit(fail ? 1 : 0);
