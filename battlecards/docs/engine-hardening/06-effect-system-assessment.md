# 06 — Effect System Assessment

## Measured shape

- **`execEffects(state, pi, effects, target, source)`** — lines ~3,554–11,215.
  **935 `else if (e.type === '…')` branches** in one if-chain, inside one function
  whose prelude defines shared closures every branch uses: `enemies`, `boost`
  (Velen doubling), `chosenCreature()`, `mend`, `buffCreature`, `rollv`,
  `schoolImmune`, lifesteal bookkeeping (`lsBefore/totalHurt`).
- **`runSecretEffects(state, pi, effects, ctx)`** — a `switch` with **187 case
  labels** for trigger-context effects (needs `ctx.self/ctx.minion/…`), whose
  `default:` delegates to `execEffects`. **Dispatch rule: the switch wins.**
- **`runDeathrattle`/`runBattlecry`/`runSpell`** each carry a per-card-id `switch`
  for `LEGACY_SCRIPTED` cards (pre-data-driven imports), plus generic paths.
- **175 emitted event types**; ~40 inline card-id checks sprinkled through generic
  code paths.

## Findings against the checklist

| Question | Finding |
|---|---|
| Effect type count | ~935 in execEffects + 187 switch cases; real distinct-type count is lower (shared/overlapping); an exact census script is a Phase 0 deliverable (`tests/tools/effect-census.mjs`) |
| Generic vs card-specific | Majority are generic-with-options (`e.count/value/target/tribe/…`); a long tail are single-card verbs named after their card (`'kiljaeden'`, `'nythendra-split'`, `'talanji'`, `'gorm-consume'`, `'picklock'`) — *these are fine*: a named handler per legendary is clearer than a mega-generic |
| Card-ID branches inside generic systems | The problem cases are id checks in shared paths, not named effects: `gdb_launch_starship` in effectiveCost/consumption, `high_kings_hammer` bonus in equip/conjure, `sprite_bulb`/`uluu` turn-start scans, `warptooth`/`nythendra_beetle` id scans. Registry migration should convert these to instance/def *fields*, the established better pattern (cf. `murmurAura`, `killerTransform`) |
| Duplicated targeting logic | `chosenCreature()` centralizes chosen targets, but AoE loops re-implement pool building ~30×; `random-damage` pool builder vs `attack-random-enemies` vs `grunty` etc. — candidates for `targeting.pools()` helpers |
| Twin implementations | **The #1 correctness hazard.** Effects implemented in BOTH `runSecretEffects` and `execEffects` with drifting option support. Historical bugs: `buff-random-friendly` existed in *three* places, one missing `grant` (fixed during P8); `buff-random-hand` existed only in the secret path (fixed earlier). A diff-audit of the 187 switch cases vs same-named chain branches is a Phase 1 diagnostic script |
| Duplicate case labels (dead code) | `fortify`, `gain-armor-by-amount`, `summon-copy-of-played`, `summon-of-spell-cost` each appear twice in switches — second body unreachable. Requires per-label archaeology: pin current (first-wins) behavior in a characterization test, then decide |
| Choice/continuation logic | No async — continuations are **queue objects** (`pickQueue/scryQueue/askQueue/discardQueue/sacQueue/dredgeQueue`) resolved by `resolve*` calls. `resolvePick` has accreted ~20 mode/option flags on the pend object (search `pend.` in that fn) — it is effectively a second dispatcher and should become per-mode handlers during Phase 7/late |
| Renderer/UI calls from effects | **None.** Effects only `emit()` data events. Clean. |
| Mutate-while-iterating | Defended via `[...arr]` copies in most death/board loops; live-`p.hand` iteration exists in ~10 branches (hand-buff loops that also push). Fuzz target, not known-broken |
| Recursion | Common and intentional: composed effects call `execEffects` with synthesized effect arrays (~80 sites). Loop guards are ad-hoc (`blinkDepth`, local `guard` counters). Runtime depth counter belongs in Phase 1 diagnostics |
| Loop creators | Known bounded: Rewind (rewindSpent), Infinite Banana (conjure-self, player-paced), grove treants, aegwynn chain (draw-paced), velen replay (playedCountById-bounded). Unbounded-in-principle: effect compositions that summon→trigger→summon; fuzz + depth counter is the mitigation |
| Implicit globals | None in the effect layer (module-scope constants only: DARK_GIFTS, ADAPT_TABLE, TOKENS, CHOSEN, ULUU pool). `p` is **not** in scope in the chain — a recurring authoring bug (3 incidents) that argues for a context object |

## Registry assessment

The proposed `EffectRegistry` fits, with three engine-specific complications:

1. **Shared closure prelude.** Branches use `enemies/boost/chosenCreature/buffCreature/
   rollv/schoolImmune/lsBefore` defined in the prelude. Handlers therefore need an
   **EffectContext** carrying these, built once per `execEffects` call:
   `{state, pi, p, enemies, source, target, rand, emit, chosenCreature, buffCreature, boost, …}`.
   Building it is cheap; the risk is subtle order dependencies (lifesteal
   accounting wraps the whole effect list, not one effect) — so the registry must
   be invoked *inside* the existing loop, not replace the loop.
2. **Two dispatchers, one registry.** Register handlers with a capability flag:
   context-needing handlers get `ctx` (trigger side); plain handlers ignore it.
   Migration retires switch cases and chain branches into one handler, killing the
   twin-drift problem class permanently.
3. **`validate/getLegalTargets/describe` methods are premature.** Targeting already
   lives in `targetSpec`/CHOSEN keyed by effect type — keep that table; a handler
   only needs `resolve(ctx, effect)`. Add other methods later if a real consumer
   appears.

Dispatch-order rule during migration (behavior-preserving):
```js
// inside the existing loop, before the legacy if-chain:
const h = registry.get(e.type);          // returns undefined if unmigrated
if (h) { h(ctx, e); continue; }
// … legacy 935-branch chain unchanged below …
```
Plus dev-mode: if neither registry nor chain handled the type → log/throw
"unknown effect type" (Invariant I15).

## Pilot batch (Phase 7) — first five extractions

Chosen for: no `ctx` needs, no twin implementation, no target continuation, heavy
test coverage already:

1. `armor` (pure resource gain; tested via warchief/viking/etc.)
2. `draw` (well-understood; note the `count` vs `value` field tolerance — pin it)
3. `conjure-id` (self-contained; forEnemy option; tested ff10b/e)
4. `hero-shield` / `hero-immune-until-next` (single-field writes; tested ff10a)
5. `shuffle-ids-into-deck` (zone op; forEnemy option; tested ff8+)

Success criteria: suite stays 495/495, census script shows 5 types served by
registry, chain branches deleted.
