// Stage 7 (The Order, the rulesets) must not touch a solo run or a stage-6 Vanilla match by a single roll. The fuzz bot
// (fuzz_runs_test.mjs) prints a hash of every run's actions + end state; the expected hashes were recorded by the same bot
// on origin/main before stage 7 (2026-11-08, c69b1ba2): solo runs (vanilla and Pokermon) and Vanilla Attrition matches
// (MICATRO_FUZZ_PVP=1: the bot READYs into each Nemesis and applies a random referee result). If any of stage 7's branches
// leaks into those runs, a hash changes.
//   node micatro/tests/fuzz_pvp_solo_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CASES = [
  { what: 'solo', args: ['30'], digest: '883e604d9279af9b2032e362c18beb0a451aee2a8bd15b87268b3359329bf800' },
  { what: 'solo', args: ['8', 'pokermon'], digest: 'eddfd420c7d0146ee482d239c0bdf23af28cfc0e1fbb7236929fd0651b51090c' },
  { what: 'Vanilla match', pvp: '1', args: ['24'], digest: 'f140f75488a500e5117794b217962d6dd7684c13727a2763af827f4d3d72e536' },
  { what: 'Vanilla match', pvp: '1', args: ['8', 'pokermon'], digest: '908f2a98b1693609a637280ef0c7ee9f138fa7be0c33d5cd5fea4f41476c73c8' },
];
let fail = 0;
for (const c of CASES) {
  const env = { ...process.env, MICATRO_FUZZ_DIGEST: '1' };
  delete env.MICATRO_FUZZ_PVP; delete env.MICATRO_FUZZ_REV; delete env.MICATRO_FUZZ_PAGES;
  if (c.pvp) env.MICATRO_FUZZ_PVP = c.pvp;
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), ...c.args], { encoding: 'utf8', timeout: 900000, env });
  const m = /digest ([0-9a-f]{64})/.exec(r.stdout || '');
  const good = r.status === 0 && m && m[1] === c.digest;
  if (!good) { fail++; console.log('FAIL', c.what, c.args.join(' '), 'status', r.status, 'digest', m && m[1], (r.stderr || '').slice(0, 800)); }
  else console.log('ok  ', c.what, c.args.join(' '), 'identical to the runs before stage 7');
}
// ...and the new modes play whole matches deterministically (crash / stall / replay checks of the bot)
for (const cfg of ['{"lives":4,"pvpStart":2,"ruleset":"balanced","order":true}', '{"lives":4,"pvpStart":2,"ruleset":"balanced","order":false,"mode":"showdown"}']) {
  const r = spawnSync(process.execPath, [path.join(DIR, 'fuzz_runs_test.mjs'), '12'], { encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_FUZZ_PVP: cfg } });
  if (r.status !== 0) { fail++; console.log('FAIL', cfg, (r.stdout || '').slice(-800), (r.stderr || '').slice(0, 800)); } else console.log('ok   fuzz', cfg);
}
console.log(`stage 7 isolation: ${fail ? fail + ' FAIL' : 'all ok'}`);
process.exit(fail ? 1 : 0);
