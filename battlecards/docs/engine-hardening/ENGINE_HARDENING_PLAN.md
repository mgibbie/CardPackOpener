# Battlecards Engine Hardening — Executive Plan

*2026-07-28. Full analysis in `00`–`10` alongside this file.*

## Current condition

The engine (`engine.js`, 13,814 lines, 98 exports) is a pure, synchronous,
import-free, fully seedable rules module — architecturally healthier than its size
suggests. All randomness is injected (`state.rng`, zero `Math.random`), there are no
timers or async paths, effects never call the renderer, and the UI/AI already act
through a de-facto command API (`can*` / action / `resolve*` triads). A
495-assertion characterization suite now lives in `battlecards/tests/` and passes
(14/14 suites), covering the highest-churn ~40% of the engine.

The liabilities are concentration and duplication, not architecture: one
7,660-line effect dispatcher with 942 branches over 927 effect types; a second 141-case trigger-side
dispatcher that partially duplicates it (with known drift bugs and **four dead
duplicate case labels today**); serialization owned by the UI as two hand-written
allow-lists that silently drop ~15 engine fields on the duel guest; ~27 direct
state mutations from game.js; and (before this PR) zero test coverage of
stack/priority and vanilla combat — both now characterized (33 assertions).
The census + twin-audit tools proved: 11 twin-implemented effect types, and
17 duplicate handlers of which FOUR were live card-breaking shadows (7 cards
silently broken — now fixed, regression-tested); 13 benign dead duplicates
remain for cleanup. Zero card-data effect types lack a handler, now enforced
in dev/test by strict-effects mode. Lands, equipment, and the multiplayer apply path remain
untested.

## Highest-risk areas

1. **Damage → death → trigger pipeline** — highest traffic, subtle ordering, two
   parallel hero-damage paths that must be hooked in tandem (a proven bug class).
2. **Effect dispatch duplication** — twin implementations across
   `execEffects`/`runSecretEffects` drift independently; unknown effect types
   silently no-op.
3. **Multiplayer serialization** — unversioned, UI-owned, silently lossy on the
   guest; only host authority keeps it correct.

## Recommended first PR

`hardening/02-scenario-and-census` *(PR 1, the baseline suite, landed with this
assessment)*: a scenario-builder test helper, an effect-type census script, and
characterization suites for the two blind spots — vanilla combat and
stack/priority. Low risk, no production changes, and it unlocks every later phase.

## Phase sequence (details in 08, PRs in 09)

0. Baseline & safety net *(mostly done)* → 1. Diagnostics (validator,
strict-effects, depth counter) → 2. Seeded RNG helpers *(half-phase — injection
already exists)* → 3. Versioned engine-owned serialization (+ guest ingest fix) →
4. Pure read-only services (cost, targeting) → 5. Zone operations → 6. Damage &
death modules → 7. Effect-registry pilot (5 types) → 8. Trigger/secret/aura
pipeline → 9. Public facade + lightweight action log (not event sourcing) →
10. Gradual decomposition (registry batches, choices, priority, turns).

## Expected benefits

Deterministic replays of any failure seed; a validator that catches zone/uid/
resource corruption at action boundaries; one serialization path with versioning
and migration (unblocking save/resume and honest guest prediction); extraction of
~2,500 lines into pure, unit-testable modules within the first six phases; and a
permanent end to the twin-dispatcher drift class as the registry absorbs effect
types.

## Explicitly not refactored yet

The 942-branch chain wholesale; `resolvePick`'s ~20 accreted mode flags; the
renderer/animation queue and game.js layout; class-pick/companion/commander flows;
and any renaming of card ids, effect-type strings, or event-type strings — all
three are load-bearing data contracts.

## Verification

```
node battlecards/tests/run-all.mjs      # 14/14 suites, 495 assertions (verified)
```
