# 00 — Current Architecture

*Assessment date: 2026-07-28. All numbers measured against the working tree.*

## The headline numbers

| Artifact | Size | Notes |
|---|---|---|
| `engine.js` | **13,814 lines / 850 KB** | The entire rules engine. Zero imports — a pure, self-contained ES module. |
| `game.js` | 4,095 lines | UI renderer (Three.js) **plus** dungeon mode, PvP duels, spectator mode, animation queue, and all modals. |
| `ai.js` | 393 lines | Opponent AI. Calls the public engine API for all actions. |
| `cards.json` | 3.1 MB | ~5,600 card definitions (data-driven effects). |
| `dungeon.js` | 316 lines | Pure data: starter decks, bosses, treasures, reward buckets. |
| `viewer.js` | 257 lines | Collection browser. Does **not** touch the engine. |
| `mpmode.js` | 60 lines | Server RPC wrapper (`MPX.call`) + auth/localStorage token. |
| `pvpbattle.js` | 248 lines | **Not Battlecards** — this is the Pokémon overworld battle module. Out of scope. |

## What the engine actually is

`engine.js` is a single module exporting **98 functions/constants**. Internally it is one
giant closure-free procedural core operating on a mutable `state` object that is passed
as the first argument to every function. There are no classes, no internal imports, no
timers, no promises, and — critically — **no `Math.random()` calls**: all 368 randomness
sites go through `state.rng()`, which is injected at `createGame(cardsById, rng, ...)`.
The engine is therefore *already* fully synchronous and fully seedable. This is the
single biggest asset for the hardening phase.

The single biggest liability is `execEffects` — **one function spanning lines
~3,554–11,215 (≈7,660 lines)** containing **942 dispatch branches over 927 distinct
effect types** (measured by `tests/tools/effect-census.mjs`). A second dispatcher,
`runSecretEffects` (triggers/secrets/ongoing effects), is a `switch` with **141
cases / 138 distinct types** whose `default:` falls through to `execEffects`.
**11 effect types are implemented in both dispatchers** (drift risk; a documented
source of past bugs), the switch has **3 duplicated case labels** (dead second
bodies: `summon-of-spell-cost`, `summon-copy-of-played`, `gain-armor-by-amount`)
and the chain has **14 duplicated unguarded branches** whose later copy is dead
code (`equip-id`, `summon-remembered`, `buff-random-friendly`, `mill`, `excavate`,
`refresh-mana`, …) — run the census tool for the authoritative list.

## Subsystem line map (measured)

| Subsystem | Location in engine.js |
|---|---|
| Constants, KW, DARK_GIFTS, ADAPT_TABLE | 1–390 |
| `instantiate(def, controller)` — the card-instance factory (explicit field-copy list) | 177–390 |
| `createGame` (deck build, class picks, companions, start-of-game pass) | 392–740 |
| Zones: `toGraveyard`, draw pipeline (`drawCards` with ~30 on-draw riders) | 560–1,160 |
| Damage: `damageCreature` / `damageHero` (two parallel hero paths: pierce + armor) | 1,166–1,480 |
| Death: `sweepDeaths` (death bookkeeping, reborn, corpses, per-death riders) | 1,480–1,630 |
| `summon` + `recomputeAuras` (delta-tracked aura engine) | 1,633–1,920 |
| Triggers: `fireOngoing`, `fireCreatureTrigger`, `ongoingCondOk`, secrets | 1,922–2,280 |
| `runSecretEffects` (trigger-side effect switch, 141 cases) | 2,244–3,460 |
| `runBattlecry` / `runDeathrattle` (incl. per-card-id switch, LEGACY_SCRIPTED) | 3,461–3,554 |
| **`execEffects` — the 942-branch effect dispatcher** | 3,554–11,215 |
| `runSpell`, `effectiveCost` (~60 stacked cost modifiers), `playCard` | 11,215–12,370 |
| Combat: `resolveCombat`, `attack`, `attackTargets`, hero attacks | 12,376–13,300 |
| `endTurn` (cleanup riders) + turn-switch (turn-start riders) + `takeEvents` | 13,312–13,814 |
| Pick/scry/ask/discard/sac resolution (`resolvePick` and friends) | interleaved, ~11,900–12,300 |

## Event model (as-is)

The engine communicates outward exclusively through `emit(state, ev)` →
`state.events.push(ev)`. There are **175 distinct event types**. The renderer drains
them via `E.takeEvents(state)` (game.js:1410) into an animation queue; the duel guest
drains and discards them (game.js:3610). Events are fire-and-forget presentation
hints — **they are not a replay log** and are not persisted or transmitted.

## Modes and their entry points

| Mode | Entry | Engine usage |
|---|---|---|
| Solo vs AI | `index.html` → `game.js` | Full API; AI turns via `ai.js` |
| Dungeon run | `game.js` (`?dungeon`, RUN_KEY in localStorage) | Same as solo + treasure mutations applied **directly to state** in game.js |
| PvP duel (host) | `game.js` (`?cardpvp=<id>`) | Host runs the engine authoritatively; publishes JSON snapshots ~1s via `MPX.call('card-publish')` |
| PvP duel (guest) | `game.js` | **Optimistic local apply** (same engine, `rng: Math.random`) + snapshot ingestion overwrites `state` |
| Spectator | `game.js` (`?spectate=<name>`) | No engine calls; renders polled snapshots read-only |
| Collection/deck/packs | `viewer.js`, `deck.js`, `packs.js` | None (cards.json + server only) |

## Where the intended layering is violated (summary — details in 01)

1. **game.js mutates engine state directly** at ~27 sites (dungeon treasures, duel
   ingestion, cheat/setup paths) instead of going through engine functions.
2. **ai.js reads engine internals** (`p.hand`, `p.board`, `p.mana`, card fields)
   rather than a read-only query API — acceptable today, but it freezes the state
   shape.
3. **The guest duel client rebuilds `state` by object spread** (`{...snap, cardsById,
   rng: Math.random, events: []}`), silently dropping ~15 top-level engine fields
   (`forcedTurns`, `expanseEvents`, `minionsDiedGame`, `shortTurns`, `pendingReturns`,
   `plane`, `hpResolver`, `exactKills`, `blinkDepth`, `recasting`, `ponderLock`, …).
   Host authority papers over this, but guest-side optimistic simulation runs on an
   incomplete state.
4. **No schema version anywhere** — dungeon saves (`magepunk_dungeon_v1` key name is
   the only versioning), duel snapshots, and spectator snapshots are all implicit-shape.

## What is already healthy

- Engine is pure data-in/data-out, synchronous, seedable, and import-free.
- The renderer identifies cards by `uid`, not object identity, for most lookups.
- Card *definitions* are immutable data in cards.json; instances are created through
  one factory (`instantiate`) with an explicit field-copy list.
- Decks are arrays of card **ids** (not instances) — cheap to serialize by design.
- A 495-assertion characterization suite now lives in `battlecards/tests/`
  (ported from the Faithful Flags project) and passes 14/14 suites.
