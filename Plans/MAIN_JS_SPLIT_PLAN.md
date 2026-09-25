# Splitting overworld/main.js: plan — 2026-09-24

**Goal:** turn the 10,853-line `overworld/main.js` into focused modules without
changing behaviour. Each phase is its own PR, passes the full overworld gate,
and can be reverted on its own.

## What makes it hard

- **About 75 sections share one module scope.** ES module imports are
  read-only, so a top-level `let` that is reassigned can't simply move to
  another file.
- **85 top-level `let`s, of which 82 are reassigned somewhere.**
  - `party` is the big one: 415 references and 5 reassignments.
  - After that come `follower` (80), `loading` (48), `menuUi` (42) and
    `menuHover` (35).
  - Most of the rest belong to one subsystem (`safari`, `hillRun`,
    `bugContest`, `baseCtx`, `radioTune`...) and can move with it.
- **The core singletons are `const`:** `screen`, `sctx`, `hud`, `world`,
  `player`, `npcs`, `battle`, `trainers`, `dialog`, `cutscene`. They are
  created once and never reassigned, so a shared module can own them.
- **A missing binding fails late.** In an ES module it only throws
  `ReferenceError` when that path runs, so tests alone won't catch every one.
  Each extraction therefore gets a static free-variable check (below).

## Approach

### Phase 0: tooling (no game code moves) — DONE

- `tools/eslint.undef.config.mjs` runs ESLint `no-undef` over `overworld/*.js`.
  - Browser globals are allowed, **minus the confusable ones** (`screen`,
    `name`, `status`, `event`, `top`, `history`, ...). main.js has its own
    `screen`; moved without its import it would silently become
    `window.screen`.
- `overworld/tests/undef_test.mjs` runs the check in the gate and in CI (the
  Tests workflow now does `npm install`; the lockfile is gitignored).
- Baseline: 54 modules, 0 findings, after making one genuine browser-global use
  explicit (`window.history` in the factory-spectator exit).
- ESLint's scope analysis handles hoisting, shadowing and destructuring, which
  is why it was used instead of a hand-written acorn checker.

### Phase 1: `ow_core.js`, the shared singletons

- Move the construction of `screen`/`sctx`/`hud`/`world`/`player`/`npcs`/
  `battle`/`trainers`/`dialog`/`cutscene` (plus the small pure helpers they
  need) into `ow_core.js`.
- main.js imports them.
- Zero behaviour change. It is the foundation every later module imports.

### Phase 2: `ow_state.js`, the shared mutable state — DONE

- Ten `let`s used across five or more sections now live on `S`:
  `party` (38 sections), `loading`, `menuUi`, `mpAccount`, `mapScripts`,
  `menuHover`, `friends`, `lastBattleOutcome`, plus `visiting` and
  `trainerTeams`.
- `tools/codemod_state.mjs` did the rewrite: espree + eslint-scope, so only
  references bound to the module-level variable changed. 479 references.
  - Each `let x = init` became `S.x = init` in the same spot, so evaluation
    order is unchanged.
  - Shorthand `{ loading }` became `loading: S.loading`.
- Two source-reading tests matched `healParty(party)` literally; both now
  accept `S.party`. Every regex and string literal in the 45 tests that read
  main.js's source was checked against old vs new main.js, and none else
  drifted.
- Subsystem-owned `let`s (`safari`, `baseCtx`, `follower`, `hillRun`...) stay
  put. They move with their subsystem in phase 3, and go onto `S` only if other
  code must write them.

### Phase 3 progress

- **Extraction 1: `ow_menus.js`, DONE on this branch.** The full-resolution
  menus (drawing + taps, 1,231 lines) moved out. main.js went from 10,839 to
  9,618 lines.
- **Extraction 2: `ow_pvp.js`, DONE on this branch.** Live PvP, async
  matches, card trades, presence and visiting (559 lines). main.js is at 9,070
  lines. `mailWaiting` was assigned from inside the block, so it moved onto `S`
  first.
- **Extraction 3: `ow_saves.js`, DONE on this branch.** Server save sync,
  revision, achievements sync, gifts and the OPTIONS save-data actions
  (383 lines). main.js is at 8,688 lines. The starter-pick / intro functions
  that sat at the end of that stretch stayed behind for the intro module.
  `extract_block` redirected `ow_menus.js`'s imports of `restoreBackup` /
  `runSaveAction` to `ow_saves.js` by itself.
- **Extractions 4 + 5: `ow_frontier.js` + `ow_menukeys.js`, DONE on this
  branch.**
  - The Battle Frontier facilities, runs and publishing (160 lines) moved
    out. `recordHallOfFame`, which the League also uses, stayed in main.js.
  - The menus' input layer (782 lines) moved out: `pressKey`, `menuBlocking`
    / `canvasMenuOpen`, and the bag / PC / shop / BP-exchange / ferry / portal
    / starter key handlers.
  - `fluteState` was assigned from inside the block, so it moved onto `S`.
  - main.js is at 7,775 lines.
- **Extractions 6 + 7: `ow_venues.js` + `ow_minigames.js`, DONE on this
  branch.**
  - `ow_venues.js` (584 lines): the Bug-Catching Contest, the Trick House,
    the Alph sliding puzzles + UNOWN DEX, and Pokémon Contests with the
    berry blender.
  - `ow_minigames.js` (226 lines): Trainer Hill and the Game Corner slots.
  - `hillRun` was assigned from outside its block (a test hook's setter), so
    it moved onto `S`.
  - main.js is at 6,979 lines.
- **Extraction 8: `ow_story.js`, DONE on this branch.** The story layer
  (971 lines): map-script triggers, `runScriptLabel` / `runSpecial`, scripted
  battles, the Space Center multi battle, the Johto gifts, the Fork B
  campaign open, villain arcs and the recurring rival.
  - `lastTalkedNpc` and `multiPicks` were assigned across the boundary, so
    they moved onto `S`.
  - main.js is at 6,018 lines.
- **Extractions 9–13, DONE on this branch.** main.js is at 4,020 lines.
  - `ow_render.js` (239 lines): camera, caves, day/night, step ambience,
    banner, weather. The frame loop `tick` stays in main.js: it writes a
    dozen input-watchdog lets owned by the input code, and belongs with it.
  - `ow_features.js` (551 lines): Secret Bases, async friend trades, Shoal
    tides, roamers, the Johto RADIO.
  - `ow_legendaries.js` (197 lines): static legendaries and the Hoenn
    awakening chain.
  - `ow_fieldmoves.js` (466 lines): Mach Bike, Silph doors, the glass
    workshop, Dive, HM field moves.
  - `ow_screens.js` (576 lines): the "in-game NPC trades" section turned out
    to hold the START-menu screens and service counters too, so it is named
    for what it is.
  - `repelSteps`, `strengthActive`, `baseCtx` and `radioTune` moved onto `S`.
    `codemod_state` now also handles an **exported** let: it drops the
    `export` and rewrites each split module that imported it to read `S.x`.
- **Extractions 14–16, DONE on this branch.** main.js is at 3,251 lines.
  - `ow_loop.js` (380 lines): the frame loop `tick` + the touch HUD. Its
    eleven watchdog lets (`cutsceneStall`, `moveStarveT`, `strandedSince`...)
    moved onto `S` first.
  - `ow_input.js` (364 lines): keyboard input, movement gates, the run button,
    repel/gadget helpers. `ow_keybinds.js` (38 lines): remappable bindings.
  - `runHeld`, `keyBinds` and `factoryStandalone` moved onto `S`. The last
    two were exported, and codemod_state rewrote their importers.
  - **Refused by extract_block, kept in main.js:** touch controls + INPUT
    DIAGNOSTICS. Their top-level code calls `fitCanvas()` / `owlog()` while
    loading, and `fitCanvas` reads main.js lets (`SCALE`) that don't exist
    until main.js's body runs. That is the TDZ guard doing its job.
- **Extractions 17–21: main.js under 2,000 (1,905 lines), DONE on this
  branch.**
  - `ow_progression.js` (sealed champions → level cap).
  - `ow_scaling.js` (postgame level scaling + forms).
  - `ow_gamecorner.js` (Voltorb Flip corner).
  - `ow_places.js` (blackout, Safari, museum/fossils/New Mauville).
  - `ow_follower.js` (the follower, plus the legendary triggers, rift wilds,
    dex milestones, map weather and battle backdrop that shared its stretch).
  - **The REVIEW list earned its keep.** Two ranges swept in top-level
    statements that sat just before the next header: `initTouchHud();` (into
    ow_scaling, which would have reintroduced the #577 touch-HUD bug) and
    `evolution.onDone / onEvolved / S.loading = true` (into ow_progression).
    Both were put back in main.js at their original spots. Lesson: when a
    range ends at "the line before the next header", read the REVIEW output.
    A block's tail can hold unrelated load-time code.
  - `prizemoney_test`'s "no caller re-credits a battle prize" now scans every
    module, which is the scope it always meant: callers had been moving out
    of main.js.
- **Tools used for every extraction:**
  - `tools/split_deps.mjs <file> <from> <to>` reports what a line range imports,
    exports, and whether anything is assigned across the boundary (a blocker).
  - `tools/extract_block.mjs <from> <to> <module> "<header>" --write` makes the
    move. The code is byte-identical; the tool adds the import/export plumbing.
    main.js's own declarations are exported and imported back. That cycle is
    safe because main.js is loaded plainly as `main.js`, and the tool refuses
    any block whose top level would read main.js bindings while loading.
  - `undef_test` also checks that every relative import names something its
    module exports. A missing export is a link error that takes the whole page
    down at load, and no-undef can't see it.
  - `tools/split_drift.mjs` lists source-reading tests whose literals no longer
    match after a move.
  - CI also runs `battlecards/tests/unit/overworld_imports_test.mjs`, a static
    import lint that assumes a plain ESM subset with **no re-exports**. So when
    a moved name was imported from main.js by an earlier split module,
    `extract_block` rewrites that module to import it from the new one directly
    (PR #567 first tried a re-export from main.js, and CI caught it). Run it
    locally before each PR.
  - `overworld/tests/owsource.mjs` gives source-reading tests main.js + every
    `ow_*.js`, so a check follows the code when it moves. Before each PR, every
    test literal is compared old vs new, and anything that no longer matches
    gets switched over.

### Phase 3+: extract subsystems, leaf-first, one or two per PR

Each moves with its own private state and exports what main.js calls.
Rough sizes:

| Module | Section(s) | ~Lines |
|---|---|---|
| `ow_menus.js` | full-resolution menus (draw + keys + taps) | 1,230 |
| `ow_pvp.js` | live PvP battles | 400 |
| `ow_presence.js` | multiplayer presence & visiting | 150 |
| `ow_saves.js` | server save, revision, gifts, save-data actions, sync instrumentation | 430 |
| `ow_frontier.js` | Battle Frontier + BP exchange | 350+ |
| `ow_trades.js` | NPC trades + async friend trades | 700 |
| `ow_minigames.js` | Game Corner, slots, Voltorb Flip, contests, Trick House, Alph puzzles, Unown Dex, bug contest, safari | 1,300 |
| `ow_fieldmoves.js` | HM field moves, Dive, Mach Bike, Silph doors, glass workshop | 400 |
| `ow_legendaries.js` | static legendaries, Hoenn awakening chain, roamers | 350 |
| `ow_story.js` | cutscenes, map-script triggers, specials (`runSpecial`), Space Center, Johto gifts, Fork B intro, villain/rival arcs | 1,200 |
| `ow_render.js` | loop, camera, caves, step ambience, banners, weather, touch HUD | 700 |
| `ow_input.js` | input, key bindings, touch controls, input diagnostics | 700 |

What stays in main.js: boot, map transitions and the wiring between modules.
The target is under 2,000 lines.

### Order and rules

- Leaf-first: modules that call nothing else in main.js go first. `ow_menus`
  and `ow_pvp` are the largest leaves.
- Every PR must pass:
  - split_check clean;
  - the full overworld gate;
  - boot_smoke on all three regions;
  - a manual boot in the browser.
- A move is **cut and paste only.** No refactors ride along; behaviour changes
  go in their own PRs.
- The test hooks in `window.__ow` stay exactly as they are (many suites reach
  in through them).

## Risks

- **Circular imports.** Modules call back into main.js (e.g. `warpTo`).
  Callbacks go through `ow_core` hooks that main.js fills at boot (an
  `ow.hooks.warpTo = warpTo` style registry), never through an import cycle.
- **Test hooks.** Suites import `overworld/main.js` indirectly via the page;
  the hooks object must keep every key.
- **Load order.** Top-level side effects (event listeners, timers) must keep
  their order; each extraction lists the ones it moves.
