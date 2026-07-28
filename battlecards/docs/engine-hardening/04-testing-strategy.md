# 04 — Testing Strategy

## What exists today (verified running)

`battlecards/tests/characterization/` — 14 suites, **495 assertions, all passing**
(`node battlecards/tests/run-all.mjs`). These are the Faithful Flags suites: they
construct real games (`E.createGame(byId, () => 0.4, …)`), drive them through the
public API (`playCard/attack/endTurn/resolvePick/useHeroPower/…`), and assert on
resulting state. They already cover: Tradeable/Colossal/locations, swiftdraw,
temporaries, start-of-game, hand transforms, Dark Gifts, Imbue, Kindred + dual
tribes, Rewind, Starships, Fabled/SoG legendaries, Prepare, and ~200 long-tail
card kits — i.e. **the highest-churn 40% of the engine**.

There is **no coverage** of: stack/priority/response windows, lands, artifacts/equip,
planeswalkers, multiplayer apply/snapshot paths, AI turns, or plain-vanilla combat
math (it's only exercised incidentally).

Test-harness conventions that already work well (keep them):
- Injected constant rng (`() => 0.4`) makes shuffles/pools deterministic.
- `give/summon/mana/kill/fx` helpers manipulate state directly for *setup*, then act
  through the public API for the *behavior under test*.
- Known pitfalls are documented in suite comments (opening-hand deals, coin for P2,
  crypt_lord's own ongoing, divine-shield vs test kill-spells).

## Layered plan

### 1. Characterization tests (exists — extend)
Before each extraction phase, add suites that pin the *current* behavior of the
subsystem being moved, including its oddities (e.g. duplicate-case first-wins
behavior for `fortify` etc. should be pinned AS-IS first, then a deliberate decision
made). Target order matches the roadmap: cost/targeting (mostly covered), zones,
damage/death, stack/priority (**net-new — write before Phase 6**), lands, equip.

### 2. Unit tests (new: `tests/unit/`)
Pure-function surfaces first — they need no game loop:
`effectiveCost` modifier stack, `targetSpec/legalTargets` per CHOSEN entry,
`schoolOf/has/hp/opponentsOf`, `heroPowerCost`, `ongoingCondOk` cond-by-cond,
`validateGameState` itself.

### 3. Scenario tests (new: `tests/scenarios/`)
A tiny builder over the existing helpers — not the DSL in the brief verbatim, but the
same idea adapted to this engine's realities (uid-based targeting, id decks):

```js
new Scenario(byId)
  .players(2).mana(0, 10)
  .hand(0, ['fireball']).board(1, [{ id: 'test_creature', health: 4 }])
  .play(0, 'fireball', { targetBoard: [1, 0] })   // resolves uid internally
  .expectDead(1, 0)
  .expectMana(0, 6)
  .run();
```

Implementation note: `playCard` takes `(state, pi, cardUid, target, choice, position,
useAlt, kicked)` and targets are `{type, uid, player}` — the builder's job is exactly
to hide uid bookkeeping. ~80 lines; build it in Phase 0.

### 4. Snapshot tests (selective)
Normalize then snapshot **state**, never renderer output. The normalizer (shared
with persistence work, Phase 3) must strip/canonicalize: `uid` values (remap to
dense ints by first-seen order), `state.events`, `state.rng`, `state.cardsById`,
`_`-prefixed scratch fields that are timing-only (`_handIndex`, `_paidCost` after
turn end), and object key order (stable stringify). Use for: post-`createGame`
shape, end-of-scripted-game shape, serialization round-trips.

### 5. Property / fuzz tests (new: `tests/fuzz/`)
A driver that, from a seeded rng, repeatedly picks any legal action (enumerate via
the can*/legalTargets API — this is exactly what ai.js already does) and asserts
after each action:
- `validateGameState(state)` returns `[]`
- no duplicate uids, no negative counts, no card in two zones
- every `e.type` dispatched was known (Phase 1 detector feeds this)
- action count bound reached without exception (infinite-loop guard: wall-clock+
  action budget)
- **round-trip property**: `normalize(state)` = `normalize(restore(serialize(state)))`
  once Phase 3 lands.
Seeds that fail get committed to `tests/regression/` as replay fixtures.

### 6. Regression tests (policy)
Every bug found from here on gets a failing test in `tests/regression/` before the
fix — including the four duplicate-case labels and any divergent
`runSecretEffects`-vs-`execEffects` twin implementations that get unified.

### 7. Multiplayer tests (new: `tests/multiplayer/`)
Pure-node, no network: simulate host+guest as two engine instances.
- **Host apply**: drive the game.js:3417 action switch's engine calls directly
  (`tradeCard/prepareCard/resolvePick/…`) with hostile inputs: wrong player index,
  stale uid, absent queue entry, replayed action. Assert state unchanged or cleanly
  rejected (`return false`), never thrown.
- **Snapshot round-trip**: `snapshotForDuel()`-shaped serialize → guest-style rebuild →
  assert renderability invariants + document (as expected-fail today) the dropped
  top-level fields; flip to strict equality after Phase 3 moves serialization into
  the engine.
- **Reconnect**: ingest snapshot seq N, then N-1 (stale) — assert ignored; then N+5 —
  assert adopted.

## Runner

Keep the zero-dependency pattern: plain `.mjs` files with the `ok(label, cond)`
convention, orchestrated by `tests/run-all.mjs` (already in place; add new dirs to
its `dirs` list as they appear). CI = `node battlecards/tests/run-all.mjs`.
No framework install is needed or wanted for phase 0–3; revisit only if parallel
execution becomes a bottleneck.
