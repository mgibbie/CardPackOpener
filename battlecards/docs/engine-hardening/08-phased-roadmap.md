# 08 — Phased Roadmap

Order deviates from the brief's template where repository evidence supports it:
Phase 2 (randomness) shrinks to a half-phase because injection already exists;
an **Action/event assessment** is folded into Phase 3/9 (see below) because the
can*/resolve* API already is a command surface; stack/priority characterization is
pulled EARLIER (into Phase 0.5) because it is the only wholly untested core system.

Every phase: land behind the compat facade, suite must stay green
(`node battlecards/tests/run-all.mjs`), rollback = revert the PR.

### Phase 0 — Baseline & safety net *(mostly DONE in this assessment)*
- **Goal:** runnable characterization suite + repo map + census tooling.
- **Done now:** `tests/characterization/` (14 suites, 495 assertions, verified),
  `tests/run-all.mjs`, these docs.
- **Remaining:** scenario-builder helper (~80 lines), `tests/tools/effect-census.mjs`
  (count real effect types, flag duplicates/twins), vanilla-combat + stack/priority
  characterization suites (the two blind spots), CI wire-up.
- Risk: **low**. Completion: run-all green in CI; census committed.

### Phase 1 — Diagnostics
- **Goal:** see problems before moving code.
- New: `engine/validate.js` (validateGameState per 03), dev-mode unknown-effect
  detector + effect-recursion depth counter (opt-in flag on state, e.g.
  `state.debug = {strictEffects: true}`), twin-implementation audit script,
  duplicate-case characterization tests (pin first-wins behavior of the 4 labels).
- Files: engine.js (+~15 lines of opt-in hooks), new files. Compat: no behavior
  change with debug off. Risk: **low**.
- Completion: fuzz driver can run 1,000 seeded actions with validator on, zero
  violations (or violations triaged into regression tests).

### Phase 2 — Randomness boundary *(half-phase)*
- **Goal:** replayable seeds.
- New: `engine/rng.js` (`pick/shuffle/int` over injected rng) + a serializable
  counter-based PRNG (mulberry32-style) for test/replay mode. Migrate call sites
  opportunistically (no bulk rewrite — the idiom is correct today).
- Risk: **low**. Completion: fuzz driver replays a failing seed identically.

### Phase 3 — Persistence boundary
- **Goal:** engine-owned, versioned serialization.
- New: `engine/serialize.js` (toSnapshot/fromSnapshot/normalize/migrate,
  SCHEMA_VERSION=1, v0 migration). game.js snapshot fns delegate; duel-guest ingest
  switches to `fromSnapshot` (fixes silent field drop — documented bug fix).
  `_lastDamager` → uid (small engine change, test-pinned).
- Tests first: multiplayer round-trip suite w/ expected-fail markers for dropped
  fields; fixtures of v0 snapshots. Risk: **medium** (touches live duels —
  additive rollout, host-first).
- Completion: round-trip property green in fuzz; spectator + duel manually smoke-tested.

### Phase 4 — Read-only services
- **Goal:** first extractions, zero mutation risk.
- Move `effectiveCost`/`heroPowerCost` → `engine/cost.js`; `targetSpec`/
  `legalTargets`/CHOSEN → `engine/targeting.js`; facade re-exports. Unit-test the
  cost modifier stack per-modifier (new `tests/unit/`).
- Risk: **low** (pure functions). Completion: suite green, engine.js shrinks ~700 lines.

### Phase 5 — Zone operations
- **Goal:** one owner for card movement + entity identity.
- Move draw pipeline, toGraveyard, bouncePermanent; add named deck ops
  (`deckRemove/deckShuffleIn/deckTop`) and replace ~40 inline splice/shuffle
  idioms mechanically. Characterize draw-rider order first (deckIdBuffs, defGrowth,
  aegwynn, saruun, kiljaeden branch, bomb/blight drawTriggers).
- Risk: **medium** (rider order). Completion: suite + new zone characterization green.

### Phase 6 — Damage & death pipeline
- **Goal:** formalize the highest-traffic mutation path.
- Move damageCreature/damageHero/heal/armor → `engine/damage.js`; isDead/
  sweepDeaths/runDeathrattle → `engine/death.js`. Pre-req: vanilla combat
  characterization suite (Phase 0 remainder) + tests for both hero damage paths
  (pierce/armor — a past bug class: hooks must exist in BOTH).
- Risk: **high** — mitigations: no logic edits, move-only diffs, riders travel verbatim.
- Completion: suite green + fuzz clean at 10k actions.

### Phase 7 — Effect registry pilot
- **Goal:** prove the registry inside the loop (see 06).
- New `engine/effects/registry.js` + context; migrate the 5 pilot types; delete
  their chain branches; strict-mode unknown-type detection becomes meaningful.
- Risk: **low-medium**. Completion: census shows 5 registry-served types; suite green.

### Phase 8 — Trigger & secret pipeline
- **Goal:** one publication path.
- Move fireOngoing/fireCreatureTrigger/ongoingCondOk/fireSecrets/auras. Fix (as
  documented bug, test-first) `fireCreatureTrigger`'s missing `trig.if` gating IF
  a live card depends on it (audit first — currently no data uses `if` on
  creature-trigger events). Begin retiring runSecretEffects cases into registry
  handlers (kills the twin-drift class).
- Risk: **high** (ordering). Completion: trigger-order characterization suite green.

### Phase 9 — Public engine facade + action model decision
- **Goal:** documented API; UI/AI/dungeon/MP/spectator use only it.
- engine.js → shim; `engine/index.js` documented exports; eliminate the 27 direct
  game.js state writes by adding narrow engine functions (`applyTreasure(state, pi,
  treasure)`, `grantCards`, `setLife`) — dungeon treasures become engine-visible.
- **Action model (Step 8 verdict):** adopt a *lightweight action log*, not event
  sourcing: the host apply switch (game.js:3417) already enumerates ~20 action
  kinds — formalize as `{type, pi, uid?, target?, choice?, seq}` records appended
  to `state.actionLog` in dev/replay mode, replayable via a dispatcher that maps
  type→existing API call. This buys replays/crash-repro/fuzz-shrinking cheaply.
  Full event sourcing is NOT recommended: 175 event types are presentation-tuned
  and non-authoritative; making them authoritative would be a rewrite.
- Risk: **medium**. Completion: grep shows zero `state.players[` writes in game.js.

### Phase 10 — Gradual decomposition
- Continue: turns.js, priority.js, choices.js (resolvePick mode-handler split),
  combat.js; registry migration in batches of ~30 effect types with census
  tracking; LEGACY_SCRIPTED per-id switches convert to data or named handlers
  opportunistically. Only ever behind fresh characterization tests.
- Risk: managed per-batch. Completion criterion per batch: census delta + green suite.

## What should explicitly NOT be refactored yet
- The 942-branch chain as a whole (registry migrates it incrementally).
- `resolvePick`'s flag accretion (late Phase 10 — needs its own test net first).
- The renderer/animation queue and game.js structure (out of scope).
- Class picks/loadouts/companions/commander flows (Micatro-adjacent, low churn, untested — characterize before touching).
- Anything that would rename card ids, effect type strings, or event type strings
  (all three are load-bearing data contracts).
