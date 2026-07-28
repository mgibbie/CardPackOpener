# 01 — Dependency Map

## Measured import graph

```text
index.html ──► game.js ──► engine.js        (import * as E)
                 │   ├──► ai.js ──► engine.js
                 │   ├──► collection.js ──► mpmode.js
                 │   ├──► dungeon.js            (data only, no engine import)
                 │   ├──► mpmode.js             (server RPC + auth)
                 │   ├──► chat.js
                 │   ├──► keywords.js           (text only; mirrors KW by convention)
                 │   └──► cardart.js            (procedural card faces)
viewer.html ──► viewer.js ──► cardart.js / keywords.js / collection.js / mpmode.js
deck.html   ──► deck.js   ──► (same family; no engine)
packs.html  ──► packs.js  ──► (no engine)
```

**Only two modules import the engine: `game.js` and `ai.js`.** There are **no
circular dependencies** — engine.js imports nothing at all. `pvpbattle.js` is the
Pokémon battle module and never touches Battlecards.

## Intended vs actual direction

```text
UI/game.js   AI   Dungeon   PvP/MP   Spectator   Deck/Collection
     ↓        ↓      ↓         ↓         ↓            ↓
             Public engine API (98 exports)
                        ↓
              Rules subsystems (internal fns)
                        ↓
            Game state  +  cards.json defs
```

### Violations found (each is a hardening target)

| # | Violation | Evidence | Severity |
|---|---|---|---|
| V1 | game.js writes engine state directly (~27 sites): dungeon treasure application (`state.players[HUMAN].life/maxLife/lands/heroClass/hand/board = ...`), duel guest state reconstruction, test/setup paths | `grep "state\.players\[" game.js` → 27 | Medium — freezes state shape, invisible to engine invariants |
| V2 | Duel guest rebuilds state via `{...snap, cardsById, rng: Math.random, events: []}` (game.js:~3482) — drops all top-level fields not in the snapshot allow-list | `snapshotForDuel()` (game.js:3565) lists only `players/current/turnNumber/over/winner/classPicks/queues/stack/priority` | High for guest-side prediction fidelity |
| V3 | ai.js reads `p.hand/p.board/p.mana`, card instance fields, and `state.players[]` directly (11 sites) | ai.js greps | Low — read-only, but couples AI to raw shape |
| V4 | keywords.js duplicates engine keyword semantics as prose ("Meanings match the engine (see KW in engine.js)") — convention-coupled, not code-coupled | keywords.js:3 | Low |
| V5 | Spectator/duel snapshot serializers live in game.js, not the engine — the engine has no official "serialize me" function | `snapshotState()` game.js:3186, `snapshotForDuel()` game.js:3565 | High — two hand-maintained allow-lists that already disagree with the real state shape |
| V6 | Dungeon-run persistence (`RUN_KEY = 'magepunk_dungeon_v1'`) stores deck ids + run metadata from game.js with no schema guard | game.js:53,70–72 | Medium |

## Public engine API (98 exports, grouped)

- **Constants/data:** `KW, MAX_BASE_MANA, MAX_HAND, MAX_SECRETS, MAX_PLAYERS, STARTING_LIFE, MAX_LANDS, MAX_TRAPS, MAX_QUESTS, MAX_HERO_POWERS, LAND_COST, BOOST_TABLES, DARK_GIFTS, ADAPT_TABLE, UNPLAYABLE, SPELL_SCHOOLS`
- **Pure helpers:** `has, hp, opponentsOf, schoolOf, kindredActive, applyGift, availableMana, effectsOf, comboActive, liveEffectsOf, heroAttackValue, colorIdentity`
- **Game lifecycle:** `createGame, endTurn, takeEvents`
- **Query (can*/spec/targets — the UI/AI legality surface):** `canPlay, canKick, canPayMana, canPayAlt, canTrade, canPrepare, canSacrifice, canEquip, canBuyLand, canTapLand, canActivate, canPlayAdventure, canAttackWith, canHeroAttack, canUseWalker, canUseHeroPower, canPlaneswalk, canUnmask, targetSpec, legalTargets, equipTargets, attackersFor, attackTargets, heroAttackTargets, abilitySpec, tapSpec, walkerSpec, heroPowerSpec, adventureSpec, heroPowerCost, effectiveCost, planarRollCost, landTaps, landPool, availableLands, hasPriority, responseOptions, counterOptions, pendingSpellFor, powerEffectsOf`
- **Mutating actions:** `playCard, attack, heroAttack, useHeroPower, useCoin, addCoin, tradeCard, prepareCard, sacrificeToken, sacrificeLand, equip, buyLand, tapLand, activateAbility, useWalker, playAdventure, planeswalk, unmask, installSecret, drawCards`
- **Decision resolution (async-by-queue):** `resolveScry, resolveDredge, resolvePick, resolveAsk, resolveDiscard, resolveSac, resolveResponse`

The **can*/spec/resolve* triads are already a de-facto command API** — the facade
phase mostly needs to document and freeze this, not invent it.

## Other boundary inventories

- **Sources of randomness:** engine: `state.rng` only (368 refs, injected). game.js: 7
  `Math.random()` (UI-only: shuffle animations, AI deck pick, guest optimistic rng).
  ai.js: 3 (tie-breaking).
- **Timers/async that can affect state:** engine: none (fully synchronous). game.js:
  17 `setTimeout/setInterval` — animation queue, duel publish loop (1s), spectator
  poll, banner timing. Only the duel loops touch state (ingestion overwrite).
- **Browser automation/test hooks:** none in the repo before this phase;
  `battlecards/tests/` (14 suites, 495 assertions) added now.
- **Duplicate rules implementations:** effect types implemented in both
  `runSecretEffects` and `execEffects` (e.g. `buff-random-friendly` exists in **three**
  places — case 2622-region copy, secret-executor copy, execEffects copy); 4 dup case
  labels (see 06); `keywords.js` prose duplicates KW semantics.
- **Card-specific exceptions inside generic systems:** `LEGACY_SCRIPTED` set (engine
  ~168) gates data-driven battlecries; per-id `switch (card.id)` blocks in
  `runBattlecry`/`runDeathrattle`/`runSpell`; ~40 inline `.id === '...'` checks
  (e.g. `gdb_launch_starship` in effectiveCost/consumption, `high_kings_hammer`
  bonus application, `broxigar`/`king_llane`/`nythendra`/`warptooth`/`sprite_bulb`/
  `uluu_the_everdrifter` in various hooks).
- **Object-identity-after-serialization assumptions:** `c !== source` comparisons,
  `p.board.includes(card)`, and instance references stored in state:
  `_lastDamager`, `futureCards[].card` (Runi), `savedHand` (Illucia/Fins),
  `godfreyHeld`, `oringExiled`, `duel.hold` optimistic instances. All are safe on the
  authoritative host and only degrade guest prediction — but any future "restore a
  mid-game save" feature would hit them immediately.
