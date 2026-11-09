// micatro_engine_test.mjs — runs Micatro's headless engine suites (micatro/tests/*_test.mjs:
// jokers, consumables, blinds/tags/backs, run flow) plus a short fuzz, the per-mod suites
// (micatro/tests/mods/*_test.mjs) and fuzz passes with Pokermon on and with every mod on, so the gate covers the
// engine and the mods. No browser, no server.
// Covers micatro/js/engine: core.js run.js jokers.js consumables.js blind.js tag.js
// back.js describe.js odds.js view.js session.js smods.js smods_attributes.js customdeck.js (custom decks: micatro/tests/customdeck_test.mjs), micatro/data/balatro_data.js, micatro/js/mods/registry.js
// challenge.js sleeve.js micatro/data/challenges.js (challenges + sleeves: micatro/tests/challenges_test.mjs — apply_challenge, challenge_protos,
// challengeInfo, prepareChallenge, sleeveInfo, prepareSleeve, apply_sleeve; mods/*/challenges.js, mods/*/sleeves.js)
// and micatro/mods/pokermon (index.js defs.js api.js data.js data391.js systems/ jokers/ consumables/
// boosters/), micatro/mods/pokermonplus (index.js data.js data120.js sprites120.js sleeves.js src/), micatro/mods/nacho (index.js data179.js sprites179.js dip.js items.js systems.js pokemon/), micatro/js/mods/superseded.js + tools/micatro/gen_superseded.mjs
// micatro/js/refusedlog.js (the refused-actions log: micatro/tests/refusedlog_test.mjs),
// (the add-on dedupe's sticker merge: micatro/tests/mods/addon_sticker_merge_test.mjs) — named here so `run-all.mjs --changed` selects this suite when any of them change.
//   node overworld/tests/micatro_engine_test.mjs            (every suite: what a developer runs)
//   node overworld/tests/micatro_engine_test.mjs --part 3/8 (one part; the gate runs micatro_engine_<i>_test.mjs instead,
//                                                            see micatro_engine_parts.mjs — run-all.mjs skips THIS file)
import { engineSuites, partSuites, runSuites, PARTS } from './micatro_engine_parts.mjs';

const pi = process.argv.indexOf('--part');
if (pi >= 0) {
  const m = String(process.argv[pi + 1] || '').match(/^(\d+)\/(\d+)$/);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.log(`--part wants i/k with 1 <= i <= k (the gate uses k = ${PARTS})`); process.exit(2); }
  process.exit(runSuites(partSuites(+m[1], +m[2]), ` (part ${m[1]}/${m[2]})`));
}
process.exit(runSuites(engineSuites()));
