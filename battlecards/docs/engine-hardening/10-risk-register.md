# 10 — Risk Register

| Risk | Likelihood | Impact | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|
| Behavior change during extraction (move-only diffs that aren't) | Med | High | 495-assertion suite + per-phase characterization; census diff | Move-only PRs; no logic edits in move PRs; review rule: diff must be cut/paste-shaped | Revert single PR (facade isolates) |
| Trigger-order regression (fireOngoing source order: enchant→artifact→emblem→board→weapon; secrets-before/after; turn-end rider order) | Med | High | New trigger-order characterization suite (Phase 0.5/8 pre-req); fuzz diffs vs baseline seeds | Encode current order in tests BEFORE Phase 8; never "clean up" order in a move PR | Revert PR 14 |
| Aura recompute regression | Low | Med | ff10a hellbat/leokk tests + idempotency unit test (`recompute×2 === recompute×1`) | recomputeAuras is already delta-idempotent; move verbatim | Revert |
| Card-instance identity loss (`c !== source`, `includes(card)`, `_lastDamager`, limbo refs) after serialization changes | Med | High | MP round-trip tests; fuzz with serialize-restore-continue cycles | uid-ify stored refs (PR 7); validator flags dup uids; never serialize mid-effect | Revert PR 7; host authority masks guest impact meanwhile |
| Serialization incompatibility with in-flight duels/spectators at deploy time | Med | Med | Version stamp + migrate(v0); staged rollout host-first | Additive-only snapshot fields until PR 6; keep v0 ingest path one release | Server relays raw JSON — reverting client restores old behavior |
| AI assumptions on raw state shape (p.hand/p.board/p.mana reads) | High (it does) | Low-Med | ai.js greps in CI (shape-change checklist); AI-vs-AI smoke game in fuzz driver | Don't rename player fields; facade phase gives AI read APIs opportunistically | n/a (read-only) |
| Renderer assumptions on object references / event stream (175 types; queue at game.js:1410) | Med | Med | Manual smoke script (solo, dungeon, duel, spectate) per release; event-type census | Never rename event types; renderer keys by uid already | Revert |
| Multiplayer desync (guest optimistic sim on incomplete state + Math.random) | Certain today (by design) | Low (host-authoritative overwrite) | duelDebug counters; MP tests | PR 6/7 shrink the gap (full-state snapshots, seeded guest rng possible later); do NOT chase full determinism now | Keep 1s snapshot loop as the corrector |
| Randomness change breaking seeded tests (idiom → rng.js helpers reorders draws) | Med | Med | Suite is seed-sensitive by construction — any drift fails loudly | Migrate call sites only with suite green per-commit; helpers must consume identical rng() call counts | Revert helper adoption commit |
| Infinite loops via effect recursion/composition | Low | High (browser hang) | Phase 1 depth counter + fuzz action budget | Keep existing guards; registry adds per-resolve depth check in strict mode | Debug flag off = current behavior |
| Performance regression (registry Map dispatch vs if-chain; validator in hot path) | Low | Med | Fuzz driver reports actions/sec vs baseline | Registry checked first only for migrated types; validator opt-in, never default-on in prod | Flag off |
| Unsupported/unknown effect types silently no-oping (I15) | Certain today | Med (silent wrong behavior) | Strict-effects detector (PR 4) + census | Turn on in tests/CI always, prod never | n/a — diagnostic only |
| Tests locking in bugs (dup-case first-wins, twin-drift semantics) | Med | Med | Explicit "pinned-oddity" test naming convention (`pins_current_behavior_*`); archaeology notes in test comments | Decision log per oddity: keep (documented quirk) vs fix (regression test first) | Change the pin deliberately |
| Card-specific exceptions missed during extraction (~40 inline id checks, LEGACY_SCRIPTED, per-id switches) | Med | Med | Census script also greps `.id === '` count per module; suite covers most of these ids already (ff6–ff10e) | Inventory in 01/06; move id checks WITH their host function; convert to fields only as separate PRs | Revert |
| game.js direct-mutation sites breaking when player shape moves (27 sites: treasures, ingest, setup) | Med | Med | grep-based CI check + dungeon smoke test (treasure application) | Phase 9 narrow APIs; until then, never rename the fields those sites touch (life, maxLife, hand, board, lands, heroClass) | Revert |
| Dungeon RUN_KEY save breakage | Low | Med (player-visible run loss) | Fixture test with a captured v0 run blob | Card ids/treasure keys frozen (constraint 6); loader already try/catch-null | Old key name retained |

## Realized findings (fuzz + strict mode, PR 3–4)

The rows above predicted three classes of defect that the fuzzer then actually found:

1. **Discount overcharge** (PR 3, fuzz seed 420484): playCard recomputed effective cost after
   one-shot discounts were consumed → `mana.cur = -1`. Fixed with a captured `playedCost`;
   pinned by `tests/regression/discount_overcharge_test.mjs`.
2. **Shoplifter Goldbeard trigger recursion** (PR 4, fuzz seed 9419695): the
   `summon-copy-attack-die` handler marked its copy `_shoplifterCopy` only after `summon()`
   returned, but `summon()` fires `'summoned'` internally → the handler re-triggered on its own
   unmarked copy → stack overflow. Fixed with a re-entrancy latch on the trigger holder; the
   effect budget now also counts `runSecretEffects` entries so future trigger-side loops trip
   the budget instead of the JS stack. Pinned by `tests/regression/goldbeard_recursion_test.mjs`.
3. **Unbounded board growth is real but is NOT a loop bug** (fuzz seed 1984285): exponential
   summon cards (`lab_constructor`, "at end of turn summon a copy of this") legitimately reach
   4,800+ minions because `summon()` has no board cap — a design decision this project does not
   change (card-balance constraint). The fuzz driver ends such games cleanly at board > 300
   rather than reporting a false trigger-loop finding. If a board cap is ever wanted, it is a
   gameplay/balance decision for the owner, not a hardening PR.
