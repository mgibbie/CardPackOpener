# 09 — PR Sequence

Each PR: independently reviewable, no formatting-only churn mixed with behavior,
public API preserved, tests included, migration note in description, revertible
without cascading (later PRs depend only on earlier *interfaces*, not diffs).

| # | Branch | Title | Contents | Risk |
|---|---|---|---|---|
| 1 | `hardening/01-baseline-tests` | Characterization suite + runner in-repo | *(landed with this assessment)* tests/, run-all.mjs, docs/ | low |
| 2 | `hardening/02-scenario-and-census` | Scenario builder, effect census tool, combat + stack/priority characterization | tests/tools/, tests/characterization/combat, stack | low |
| 3 | `hardening/03-state-validator` | `engine/validate.js` + opt-in wiring + fuzz driver v1 | new files; ~5 lines in engine.js | low |
| 4 | `hardening/04-strict-effects` | Unknown-effect detector, recursion depth counter, twin-audit script, dup-case pin tests | ~15 lines engine.js (debug-gated), tests/regression/ | low |
| 5 | `hardening/05-seeded-rng` | `engine/rng.js`, serializable PRNG, replay-a-seed test | new files | low |
| 6 | `hardening/06-versioned-snapshots` | `engine/serialize.js` (toSnapshot/fromSnapshot/normalize/migrate, v0 fixtures); game.js delegates | engine + ~20 lines game.js | med |
| 7 | `hardening/07-guest-ingest-fix` | Duel guest uses `fromSnapshot`; `_lastDamager`→uid | game.js ingest block; small engine change; MP tests | med |
| 8 | `hardening/08-cost-calculator` | Move effectiveCost/heroPowerCost → `engine/cost.js` + per-modifier unit tests | move-only + facade | low |
| 9 | `hardening/09-targeting-service` | Move targetSpec/legalTargets/CHOSEN → `engine/targeting.js` | move-only + facade | low |
| 10 | `hardening/10-zone-ops` | `engine/zones.js`: draw pipeline, toGraveyard, bounce, named deck ops; idiom replacement | mechanical + characterization first | med |
| 11 | `hardening/11-damage-module` | `engine/damage.js` move-only | pre-req: PR2 combat tests | high |
| 12 | `hardening/12-death-module` | `engine/death.js` (isDead/sweepDeaths/runDeathrattle) | move-only | high |
| 13 | `hardening/13-effect-registry-pilot` | Registry + context + 5 pilot handlers, branches deleted | engine/effects/ | med |
| 14 | `hardening/14-trigger-pipeline` | triggers.js + auras.js; begin switch-case retirement | ordering tests first | high |
| 15 | `hardening/15-engine-facade` | engine.js → shim; `engine/index.js`; kill game.js direct writes via new narrow APIs | game.js + engine | med |
| 16 | `hardening/16-action-log` | Dev/replay action log + replay dispatcher; fuzz-shrinker uses it | diagnostics | low |
| 17+ | `hardening/17-registry-batch-N` | ~30 effect types per batch, census-tracked | repeatable template | per-batch |

Sequencing rules:
- PR 6 lands host-side first and is additive (old snapshot shape still accepted) —
  in-flight duels survive a deploy.
- PRs 8–9 may land in either order; both before 10.
- PR 11 must not land in the same release as PR 14 (isolate blame surface for any
  combat regression).
- Every PR description links the census/validator output before vs after.
