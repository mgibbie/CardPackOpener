# 03 — State Invariants

Invariants the engine must always satisfy. Each is annotated with how the *current*
code relates to it. "Soft" means the engine deliberately allows temporary violation.

## Core invariants (must hold at every action boundary)

| # | Invariant | Current status |
|---|---|---|
| I1 | Every card instance has a unique `uid`; no two live instances share one | Holds — `instantiate` assigns from a monotonic counter. **Caveat:** duel-guest snapshot ingestion resets nothing; if the guest ever *creates* instances optimistically while the host does too, uid spaces can collide across machines (host-authoritative overwrite hides this). |
| I2 | A card instance lives in exactly one zone (`hand/board/graveyard/exile/secrets/traps/quests/enchantments/artifacts/planeswalkers/weapon/heroPowers/command`) — **decks hold ids, not instances** | Mostly holds. Known deliberate exceptions: `savedHand` (Illucia/Fins swap), `futureCards[].card` (Runi), `godfreyHeld`, `oringExiled` — instances "in limbo" referenced only from those fields, with `zone` left stale. A validator must whitelist these limbo fields. |
| I3 | `card.zone` field matches the container that holds it | **Violated routinely** — `zone` is set on transition but stale copies exist (e.g. `zone:'gone'` after transforms, limbo fields above). Validator should check container membership as truth, `zone` as advisory. |
| I4 | A dead creature (`isDead(c)`) never remains attackable/targetable | Holds via `sweepDeaths` after every damage cluster; between `damage +=` and sweep there is a window where other effects see the corpse — this is load-bearing (e.g. `_ursocKills` records kills before sweep). Validator must run at action boundaries only. |
| I5 | Resources: `0 ≤ mana.cur`, `mana.max ≤ MAX_BASE_MANA` (10), `bonus ≥ 0`; corpses ≥ 0; armor ≥ 0 | Holds by construction (`spendMana` floors, `Math.max(0, …)` idiom). Neth'rek surge sets max=10 explicitly. Validator: cheap numeric checks. |
| I6 | Hand size ≤ MAX_HAND (15) **at turn boundaries only** — overflow is legal mid-turn ("No burn on overdraw", enforced by cleanup discard queue) | Soft by design. Validator must check only after `endTurn` resolution, and account for `discardQueue` pending. |
| I7 | A chosen target must be validated at resolution time | **Partially holds.** `chosenCreature()` re-finds by uid at resolution (stale targets fizzle). But some multi-step effects capture object refs (`_lastDamager`, `pend.gainStatsUid` looked up at resolve — OK). Stack responses can invalidate targets; `resolveStackedSpell` relies on fizzle-by-lookup. |
| I8 | `state.current` and `state.priority` always index a live, non-eliminated player | Holds; turn-switch skips eliminated players; `forcedTurns` queue is filtered against eliminated. Validator: bounds + eliminated checks. |
| I9 | Trigger iteration must tolerate mutation | Mostly defensive: hot loops iterate `[...pl.board]` copies. `fireOngoing` builds `sources` snapshot first. **`p.hand` iteration during effects that splice hand** is the risky pattern (several sites iterate live `p.hand` while pushing). No known bug, but fuzz target. |
| I10 | `recomputeAuras` is deterministic and idempotent | Holds **by design**: contributions are recomputed from scratch and applied as deltas vs tracked `auraAttack/auraHealth/auraKeywords`. Calling twice is a no-op. This is a genuinely good pattern — preserve it. |
| I11 | Serialized+restored state preserves gameplay-relevant info | **Violated today** for anything outside the snapshot allow-list (see 07). Fine host-side; wrong for any future save/resume feature. |
| I12 | Same seed + same action sequence ⇒ same result | Holds engine-side (all randomness via injected `state.rng`; no Date/timers). The test suite exploits this with `() => 0.4`. Guest optimistic sim breaks it deliberately (`Math.random`). |
| I13 | Validation must not mutate | Trivially satisfiable — but note `isDead`, `availableMana`, `effectiveCost` are pure and safe for a validator to call; `legalTargets` is pure; **do not** call `recomputeAuras` from the validator (it emits events on change). |
| I14 | No effect recursion deeper than a sane bound | Guarded ad-hoc: `state.blinkDepth < 20`, `guard` counters in loops (Impulsive, morchok, fyrakk, draw-until). `execEffects`→`execEffects` recursion is common and unbounded in principle (e.g. velen-exiled-replay replaying deathrattles that summon). Validator can't check this statically; add a runtime depth counter in Phase 1 diagnostics. |
| I15 | Every `e.type` reaching a dispatcher has a handler | **Silently violated**: unknown types fall through the 942-branch chain and do nothing (census currently proves all 1,042 data-used types ARE handled — the detector keeps it that way). A dev-mode "unknown effect" detector is one of the cheapest, highest-value diagnostics available (see Phase 1). |
| I16 | Duplicate `case` labels must not exist in `runSecretEffects` | **Violated now**: `fortify`, `gain-armor-by-amount`, `summon-copy-of-played`, `summon-of-spell-cost` are each declared twice; the second body is dead code. Needs a characterization decision per label (which body is intended?) before "fixing". |
| I17 | Deck arrays contain only valid card ids present in `cardsById` (or intentional ghost ids like `bomb`/`mine`/`blight` draw-triggers) | Holds; draw pipeline tolerates unknown ids poorly (skips). Validator: cheap. |
| I18 | Event queue only grows between `takeEvents` drains; events are presentation-only | Holds. Validator: type-check shape only in dev. |

## Proposed dev-only validator (Phase 1)

```js
// diagnostics/validateGameState.js — DEV ONLY, never in the hot path by default.
// Pure read; returns an array of violation strings (empty = healthy).
export function validateGameState(state) {
  const errs = [];
  const seen = new Map(); // uid -> zone label
  const LIMBO = ['savedHand', 'godfreyHeld'];
  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    for (const [zone, arr] of [['hand', p.hand], ['board', p.board],
        ['graveyard', p.graveyard], ['exile', p.exile], ['secrets', p.secrets],
        ['traps', p.traps], ['quests', p.quests], ['enchantments', p.enchantments],
        ['artifacts', p.artifacts], ['planeswalkers', p.planeswalkers],
        ['heroPowers', p.heroPowers], ['command', p.command || []],
        ...(p.weapon ? [['weapon', [p.weapon]]] : []),
        ...LIMBO.map(k => [k, p[k] || []]),
        ['future', (p.futureCards || []).map(f => f.card)]]) {
      for (const c of arr) {
        if (c == null) { errs.push(`${zone}[p${pi}] holds null`); continue; }
        if (seen.has(c.uid)) errs.push(`uid ${c.uid} (${c.name}) in ${zone} AND ${seen.get(c.uid)}`);
        seen.set(c.uid, `p${pi}.${zone}`);
      }
    }
    if (p.mana && (p.mana.cur < 0 || p.mana.bonus < 0)) errs.push(`p${pi} negative mana`);
    if ((p.corpses ?? 0) < 0) errs.push(`p${pi} negative corpses`);
    if (p.armor < 0) errs.push(`p${pi} negative armor`);
    for (const id of p.deck) if (typeof id !== 'string') errs.push(`p${pi} deck holds non-id`);
  }
  if (state.players[state.current]?.eliminated) errs.push('current player eliminated');
  if (state.priority != null && !state.players[state.priority]) errs.push('invalid priority index');
  return errs;
}
```

Notes on the sketch:
- **Board corpses**: between damage and `sweepDeaths` a dead creature legally sits on
  board. The validator therefore must only be invoked from *action boundaries*
  (after each public API call returns), which is where Phase 1 wires it.
- The multi-zone check must treat `graveyard` presence together with a limbo
  reference as a violation *except* for the documented `returnBuffedOnDiscard`-style
  flows — expect to tune the whitelist against the characterization suite before
  trusting it in CI.
- Implementation is safe to add independently (new file, no engine edits); wiring it
  into dev builds is a one-line opt-in from game.js or the test runner.
