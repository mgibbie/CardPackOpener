// micatro_engine_test.mjs — runs Micatro's headless engine suites (micatro/tests/*_test.mjs:
// jokers, consumables, blinds/tags/backs, run flow) plus a short fuzz, the per-mod suites
// (micatro/tests/mods/*_test.mjs) and fuzz passes with Pokermon on and with every mod on, so the gate covers the
// engine and the mods. No browser, no server.
// Covers micatro/js/engine: core.js run.js jokers.js consumables.js blind.js tag.js
// back.js describe.js view.js session.js smods.js smods_attributes.js customdeck.js (custom decks: micatro/tests/customdeck_test.mjs), micatro/data/balatro_data.js, micatro/js/mods/registry.js
// challenge.js sleeve.js micatro/data/challenges.js (challenges + sleeves: micatro/tests/challenges_test.mjs — apply_challenge, challenge_protos,
// challengeInfo, prepareChallenge, sleeveInfo, prepareSleeve, apply_sleeve; mods/*/challenges.js, mods/*/sleeves.js)
// and micatro/mods/pokermon (index.js defs.js api.js data.js systems/ jokers/ consumables/
// boosters/), micatro/mods/pokermonplus (index.js data.js src/) — named here so `run-all.mjs --changed` selects this suite when any of them change.
//   node overworld/tests/micatro_engine_test.mjs
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const DIR = path.join(ROOT, 'micatro/tests');
const suites = fs.readdirSync(DIR).filter((f) => f.endsWith('_test.mjs')).sort()
  .map((f) => [f, [path.join(DIR, f), ...(f === 'fuzz_runs_test.mjs' ? ['40'] : [])]]);
const MODDIR = path.join(DIR, 'mods');
if (fs.existsSync(MODDIR)) {
  for (const f of fs.readdirSync(MODDIR).filter((x) => x.endsWith('_test.mjs')).sort()) suites.push(['mods/' + f, [path.join(MODDIR, f)]]);
}
suites.push(['fuzz_runs_test.mjs 24 pokermon', [path.join(DIR, 'fuzz_runs_test.mjs'), '24', 'pokermon']]);
// ... and every mod on at once (mod decks / stakes / jokers favoured by the bot)
suites.push(['fuzz_runs_test.mjs 16 all', [path.join(DIR, 'fuzz_runs_test.mjs'), '16', 'all']]);
let fail = 0;
for (const [f, args] of suites) {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 600000 });
  const last = (r.stdout || '').trim().split('\n').pop();
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} - micatro/tests/${f}: ${last}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).slice(0, 15).join('\n') + (r.stderr || '').slice(0, 2000));
}
console.log(`${suites.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
