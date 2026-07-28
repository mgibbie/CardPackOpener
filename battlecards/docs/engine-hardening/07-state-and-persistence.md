# 07 — State Ownership & Persistence

## Major mutable objects

### `state` (top level) — owner: engine
| Field | Writers | Persisted (duel/spectate snapshot) | Notes |
|---|---|---|---|
| `players[]` | engine (+27 game.js sites — V1) | **yes (raw)** | the whole game lives here |
| `cardsById` | never (shared def DB) | no — reattached client-side | non-serializable by size; treat as immutable |
| `rng` | never reassigned | no | **function in state** — the one truly non-serializable field |
| `events` | engine push / takeEvents drain | no | presentation-only |
| `current, turnNumber, over, winner, classPicks` | engine | yes | core |
| `stack, priority, passers, priorityNext` | engine | yes | response windows |
| `pickQueue, scryQueue, askQueue, discardQueue, sacQueue, dredgeQueue` | engine + resolve* | yes | pend objects are JSON-safe (ids/uids/flags) |
| `forcedTurns, shortTurns, expanseEvents, minionsDiedGame, diedThisTurn, exactKills, plane, hpResolver, hpDamageBonus, hpDoubling, dealt, blinkDepth, recasting, ponderLock, pendingReturns` | engine | **NO — dropped by both snapshot fns** | the silent-loss list; `pendingReturns` even holds card instances |

### `player` objects (~130 fields) — categories
- **Zones (instances):** hand, board, graveyard, exile, secrets, traps, quests,
  enchantments, artifacts, emblems, planeswalkers, weapon, heroPowers, command.
- **Zone (ids):** `deck` — serialization-friendly by design.
- **Limbo instance refs:** `savedHand, godfreyHeld, futureCards[].card` — persisted
  only because they sit on the player object; identity breaks on round-trip.
- **Scalar/JSON-safe trackers (~90):** corpses, armor, heraldCount, imbueCount,
  playedCountById, diedCountById, startingDeckIds, startingHandIds, rewindSpent,
  starshipPieces, bwonsamdiBoons, vistahAt/vistahSpells, defGrowth, deckIdBuffs,
  voidPile, mugMagic/zeeMight, … — all persist fine via the raw-players snapshot.
- **Derived (recompute, don't persist):** aura deltas (`auraAttack/auraHealth/
  auraKeywords`) are *both* stored and derived — recomputeAuras heals them, so
  round-trip is safe even if stale.

### Card instances — owner: engine via `instantiate`
JSON-safe except: `_lastDamager` (object ref → duplicates on stringify),
`ongoing.spent` mutations (fine), scratch `_` fields (fine but noisy).
`uid` collisions across two machines both calling `instantiate` are possible in
duel-guest optimistic mode (host overwrite masks it).

### game.js module globals — owner: UI
`state` (the live game), `duel{on,id,seq,hold,…}`, `duelDebug`, `queue`/`queueBusy`
(animation), `playerCount`, THREE scene objects, DOM refs, `setInterval` handles.
None belong in engine state and none leak into it today. **Keep it that way.**

## Non-serializable / hazard checklist (from the brief)

| Hazard | Present? | Where |
|---|---|---|
| Functions in state | **Yes** — `state.rng` only | excluded by both snapshot fns ✓ |
| Sets/Maps in state | No (engine uses arrays/objects; Sets are local temporaries) | ✓ |
| Circular refs | `_lastDamager` (card→card), `pendingReturns` defs | stringify duplicates rather than cycles (parents not referenced) — no JSON crash observed; still an identity loss |
| Three.js / DOM in state | No | renderer keys meshes by uid externally |
| Timers/Promises in state | No | game.js-only |
| RNG state | `rng` is a closure; seeded runs can't resume mid-stream | Phase 2: serializable counter-based PRNG for replay mode |
| Temporary selection state | UI-side only (pending target arrows etc.) | ✓ |

## Persistence surfaces

1. **Dungeon run — `localStorage['magepunk_dungeon_v1']`** (game.js:53–72,
   dungeon.js data): run metadata + deck ids + treasures + level. Mid-*battle*
   state is NOT saved — a run resumes between battles. Refactors that rename card
   ids or treasure keys would break it (constraint: don't).
2. **Class pick — `localStorage['magepunk_class_v1']`.** Trivial.
3. **Duel snapshot — server-relayed JSON** (`snapshotForDuel`): players (raw) +
   queues + stack/priority. **No schemaVersion; no validation on ingest** (a
   try/catch shows an error banner — good instinct, no recovery).
4. **Spectator snapshot** (`snapshotState`): same family, slightly different
   assembly. Two hand-maintained allow-lists = drift by construction.
5. **Collections/decks/packs** — server-side via mpmode; out of engine scope.

## Proposed state policy

1. **Authoritative game state** = `state` minus (`rng`, `cardsById`, `events`).
   Everything in it must be JSON-serializable; instance cross-references must be
   stored as **uids** (migrate `_lastDamager` → `_lastDamagerUid`, resolve at use).
2. **Derived rules state** = aura deltas; keep stored (healed by recompute), tag in docs.
3. **UI presentation state** = game.js globals; never on `state`.
4. **Animation state** = the events queue + game.js `queue`; never persisted.
5. **Network transport** = `toSnapshot(state)` output ONLY (see below).
6. **Cached data** = `cardsById`; reattach on restore, never transmit.

## Serialization plan (Phase 3)

```js
// engine/serialize.js
export const SCHEMA_VERSION = 1;
export function toSnapshot(state) {
  // structuredClone-safe subset: EVERYTHING except rng/cardsById/events,
  // built by enumeration of known top-level fields + players, with
  // schemaVersion stamped. Unknown extra fields → dev warning (drift detector).
}
export function fromSnapshot(snap, cardsById, rng) {
  // migrate(snap) → validate shape → reattach { cardsById, rng, events: [] }
}
export function normalize(state) { /* for tests/diffs: strip _scratch, remap uids, stable order */ }
export function migrate(snap) { /* switch (snap.schemaVersion ?? 0) { case 0: add missing fields with defaults; … } */ }
```
- `snapshotForDuel`/`snapshotState` in game.js become one-line delegates
  (adapter compatibility) — and the guest ingest replaces its spread-rebuild with
  `fromSnapshot`, which **fixes the silent field-drop class** (V2) as a bug fix,
  documented as such.
- **Version-0 handling:** current snapshots have no version field → `migrate`
  treats `undefined` as v0 and fills the dropped fields with engine defaults
  (exactly what the spread-rebuild accidentally does today), so old
  hosts/spectators keep working against new clients during rollout.
- **Fixtures:** commit a captured v0 duel snapshot + a v0 dungeon RUN_KEY blob to
  `tests/fixtures/`, with round-trip tests.

## What current saved data could break during refactoring
- Dungeon `RUN_KEY` blobs: only if card ids, treasure keys, or starter-deck ids
  change (explicitly out of scope).
- In-flight duels across a deploy: snapshot shape changes mid-duel → guests on old
  code ingest new snapshots. Mitigation: additive-only snapshot changes until
  Phase 3's version stamp lands; after that, `migrate` handles it.
- Nothing else persists engine state; there are no mid-battle saves to migrate.
