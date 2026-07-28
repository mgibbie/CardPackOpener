# 05 — Target Architecture

## Verdict on the proposed structure

The hypothesized `engine/` tree is directionally right but should be adapted to
repository reality:

1. **Do not introduce classes for the state.** The whole engine is
   `fn(state, ...)` procedural style; the 495-assertion suite and both callers
   depend on plain-object state. Modules should stay as function bags operating on
   the same state shape. `GameEngine.js` as a class is unnecessary ceremony;
   `engine/index.js` re-exporting the current 98 functions is the real facade.
2. **`EventBus` should stay a two-function module** (`emit`, `takeEvents`) — the
   current push-array model is exactly right for the animation queue and needs no
   subscription machinery.
3. **`RandomSource` is nearly done already** — randomness is injected at
   `createGame`. The only work is wrapping it (`state.rng` → `rand.pick(pool)`,
   `rand.shuffle(arr)`, `rand.int(n)`) so the 368 call sites stop repeating the
   `pool[Math.floor(state.rng() * pool.length)]` idiom, plus a `SeededRandomSource`
   for tests/replays. Low priority; the idiom is verbose but not buggy.
4. **`effects/handlers/` is the long game** — with 935+ branch bodies, full
   registry migration is a multi-month background task. The registry itself plus a
   pilot batch is Phase 7; the rest moves opportunistically (see 06).
5. **`turns/PriorityManager`** exists implicitly (stack/priority/passers) and is the
   least-tested subsystem — extract only after characterization tests exist.

## Adapted target tree

```text
battlecards/
  engine.js                  ← becomes a thin re-export shim (compat adapter)
  engine/
    index.js                 ← the 98-export facade (same names, same signatures)
    state.js                 ← createGame, instantiate, player factory, constants
    validate.js              ← dev-only validateGameState (Phase 1)
    rng.js                   ← rand helpers over injected rng (Phase 2)
    serialize.js             ← toSnapshot/fromSnapshot + schemaVersion (Phase 3)
    cost.js                  ← effectiveCost, heroPowerCost (Phase 4, pure)
    targeting.js             ← targetSpec, legalTargets, CHOSEN (Phase 4, pure)
    zones.js                 ← toGraveyard, bouncePermanent, draw pipeline, deck ops (Phase 5)
    damage.js                ← damageCreature/damageHero/heal/armor (Phase 6)
    death.js                 ← isDead, sweepDeaths, runDeathrattle (Phase 6)
    combat.js                ← resolveCombat, attack*, heroAttack* (Phase 6+)
    effects/
      registry.js            ← Map-based dispatch w/ unknown-type error (Phase 7)
      context.js             ← {state, pi, p, enemies, source, target, rand, emit}
      basic.js …             ← handler batches, migrated incrementally
    triggers.js              ← fireOngoing/fireCreatureTrigger/ongoingCondOk/secrets (Phase 8)
    auras.js                 ← recomputeAuras + staticValue (Phase 8)
    turns.js                 ← endTurn, turn-switch, turn-cycle riders (late)
    priority.js              ← stack, priority, responses (late, after tests)
    choices.js               ← resolvePick/Scry/Ask/Discard/Sac/Dredge (late)
  tests/                     ← exists; grows per 04
  docs/engine-hardening/     ← this assessment
```

## Per-module contracts

For every module: **may mutate only the state fields listed; everything else via
calls to the owning module.** All keep `(state, …)` signatures.

| Module | Moves there | Mutates | Public API | Depends on | Introduction path |
|---|---|---|---|---|---|
| `state.js` | createGame, instantiate, player literal, KW/constants | builds state | createGame, instantiate, constants | serialize (SoG pass), effects (via injection) | cut-and-paste + re-export; instantiate stays THE only instance factory |
| `validate.js` | new | none (pure) | validateGameState | none | new file; opt-in wiring |
| `rng.js` | new | none | pick/shuffle/int(rand) | none | new file; call sites migrate lazily |
| `serialize.js` | snapshotState/snapshotForDuel logic (from game.js) + new normalizer/migrator | none | toSnapshot(state), fromSnapshot(snap, cardsById, rng), normalize(state), migrate(snap) | state.js | engine gains the fns; game.js delegates (adapter keeps old fns calling new ones) |
| `cost.js` | effectiveCost, heroPowerCost, cost-consumption *table* (data, applied by playCard) | none (pure) | effectiveCost, heroPowerCost | targeting? no — only helpers (kindredActive, staticValue, schoolOf — move or share via state.js) | pure-function move; engine.js re-exports |
| `targeting.js` | targetSpec, legalTargets, CHOSEN, equipTargets, attackTargets(read-only part) | none | same names | cost.js? no; pure helpers | pure move |
| `zones.js` | toGraveyard, bouncePermanent, drawCards, deck splice helpers (`removeFromDeck(id)`, `shuffleInto(deck, ids)` — new named helpers replacing ~40 inline splice/shuffle idioms) | zones + zone-transition riders | drawCards, toGraveyard, bounce, deckOps | triggers (on-draw riders), effects (drawTrigger) | extract + keep rider hooks as injected callbacks first, direct calls later |
| `damage.js` | damageCreature, damageHero, healHero, gainArmor + their ~20 riders | damage/life/armor + rider fields | same names | triggers, death (sweep is called by callers, not here) | move with riders intact; NO behavior change |
| `death.js` | isDead, sweepDeaths, runDeathrattle | graveyard, corpses, per-death fields | same | zones, effects (deathrattles), triggers | after damage.js |
| `effects/registry.js` | new + pilot handlers | per-handler | register/get/resolve | context.js | chain checks registry FIRST, falls back to legacy chain (see 06) |
| `triggers.js` | fireOngoing, fireCreatureTrigger, ongoingCondOk, fireSecrets*, runSecretEffects shell | trig.spent, counters | same | effects | after registry exists (runSecretEffects cases become handlers too) |
| `auras.js` | recomputeAuras, staticValue | aura deltas | same | none | clean move any time after Phase 0 (self-contained) |

## Compatibility strategy (applies to every phase)

`engine.js` becomes:
```js
export * from './engine/index.js';
```
and `engine/index.js` re-exports everything with unchanged names/signatures.
game.js and ai.js never change their import line. Each extraction PR moves code +
adds `export { x } from './cost.js'` lines to the facade; the old in-file definition
is deleted in the same PR (no dual definitions). Rollback = revert the one PR.
