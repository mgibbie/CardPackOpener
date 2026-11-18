# State machines in this app

Owner, 2026-11-18: "Find all of the implicit state machines in my app. Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything."

This is the inventory from that survey (four read-only passes over the overworld, Pocket Enhanced with the Inventory and `site/`, the server, and the other games), and the decision taken.

## The decision

**Declare and watch; do not rewrite.**

About fifty flows in the app are state machines in everything but name. They work. Saved runs, frame-exact replays, multiplayer protocols and players' live saves depend on their exact behaviour, and most have tests that set their fields directly. Rewriting them onto a state-machine library would put all of that at risk for nothing a player could see, and goes against the standing rule of no refactors without a concrete trigger.

So each flow gets, beside the code that owns it:

1. **A declaration** with `observe()` from `site/machine.js`: the list of its states, a `read()` that works the state out from the fields the flow already keeps, the moves it makes, and which field combinations are illegal. Reading changes nothing.
2. **A check** (`machine.check()`) at a point where the flow already redraws or polls. An illegal state or an undeclared move is noted once and sent to the site's error beacon (`/errors.html`). It never throws and never blocks.
3. **One call to see it:** `window.__states()` lists every declared flow on the page with its state; `__states.problems()` lists what the checks noted; `__states.describe()` gives the declarations.

What each of the three gets:

- **UX:** a flow that drifts on a real player's screen shows up on the errors page instead of weeks later as a bug report. Real defects the survey found get fixed one by one, each with its own regression test (the first two are in the same change as this file).
- **DX:** one list of states per flow, next to the code, checked while the game runs. No new framework to learn: `observe()` is about forty lines.
- **AX:** a test or an agent asks `__states()` instead of reading five fields and guessing; `describe()` says what is possible next.

**When a flow may be changed, not only watched:** on a concrete trigger. That is a bug in it, a feature that has to touch it, or a `problems()` report from the field. Then the change is made with a regression test, as always.

**Order for declaring the rest:** by harm if it drifts, then by how often it is touched. The tiers below say which is which.

## Declared so far

| Flow | File | States |
|---|---|---|
| `inventory.trade` | `inventory/inventory.js` | closed, lobby, offers, countdown, carrying-out, handing-over, done, cancelled |
| `overworld.trade` | `overworld/ow_pvp.js` | closed, offers, countdown, carrying-out, handing-over, done, cancelled |
| `pocket.page` | `pocketenhanced/js/main.js` | menu, match, online-lobby, online-match, replay, spectate |
| `pocket.turn` | `pocketenhanced/js/main.js` | no-match, watching, setup-placing, setup-waiting, my-turn, choosing, waiting, over |

Already explicit before this (the patterns the codebase accepts): the live trade on the server (`server/trade.mjs`: phases and one `settle()` that moves them), Scoundrel's `STATE` enum, Micatro's `G.STATES` enum (values declared, moves not), Battlecards' pack opening `phase`, the Pocket and Micatro PvP lobbies (row shapes in header comments).

## Defects the survey found

| Defect | Where | Status |
|---|---|---|
| A half-made dust printing whose price has left the table is skipped for ever: the dust is gone and no printing comes | `server/pocket_collection.mjs` settle | **Fixed** with this file (the dust goes back) |
| A closed overworld trade screen keeps the last trade's flags (`done`, `applied`, `scene`, `goAt`...) until the next opens; an answer arriving after closing is still taken in | `overworld/ow_pvp.js` closeTrade / ingestTrade | **Fixed** with this file |
| Five lists decide "which menu is open" and disagree (draw order puts the party menu over the trade screen, key order the reverse; `anyMenuOpen` leaves out twelve menus, the trade screen among them) | `overworld/ow_loop.js`, `ow_menukeys.js`, `ow_menus.js`, `ow_diagnostics.js` | Open. Next to declare: one table, each list's membership as it is today, then the disagreements settled one at a time |
| The "is the player blocked" test is written by hand in seven places with small differences | `overworld/ow_loop.js`, `ow_menukeys.js`, `ow_diagnostics.js` | Open |
| Two players acting at the same moment in an async or a live match can lose one action (plain overwrite, no guard) | `server/mp.mjs` `async-act`, `match-action` | **Fixed** (guarded on the row's `rev`) |
| A gift is marked claimed before the game has the items; a lost answer loses them | `server/mp.mjs` `gift-claim` | **Fixed** (a claim key: the same key asking again gets the same items; the game notes it first) |
| `repair-send` silently replaces a repair still pending | `server/mp.mjs` | **Fixed** (refused unless sent with `replace: true`) |
| A replay session row is written before the player's index; a death between leaves an orphan and a retry makes a second | `server/mp.mjs` `micasurvivor-replay-put` | **Fixed** (the list first; a retry fills in the id it names) |
| Account-row writes are plain overwrites, so one can wipe a trade's or a dust action's note | `server/mp.mjs` | Open (known; noted in the code) |
| Pocket Enhanced resets "no game" by hand in several copies when the page changes mode | `pocketenhanced/js/main.js` | **Reviewed, not changed**: the copies differ only in what the next screen sets up again itself (leaving for the menu does not clear the table's choices; the next `begin()` does), and the end screen's flag is only read while playing. No path reaches stale state. Watched by `pocket.page` |

## Every flow found

Tier A: a drift loses or doubles something a player owns. Tier B: a drift freezes or confuses a screen. Tier C: local and self-correcting.

### Overworld (`overworld/`)

| Tier | Flow | State lives in | Notes |
|---|---|---|---|
| A | Save sync | `ow_saves.js`: `_lastAckedBody`, `_pendingBody`, `_importing`, hydrate latches, revision | Seven undeclared states (hydrating, clean, dirty, in flight, conflict, importing, paused). Readable only through `syncLog`. Never change without a backup and rollback |
| A | Trade hand-over journal | `ow_tradelog.js`: none, 'taking', 'out' (in the save) | Pure and tested; the model for the others |
| A | Trade screen | `ow_menustate.js` `trade`, moved in `ow_pvp.js` | **Declared** (`overworld.trade`) |
| A | Tab lock | `tab_lock.js`: `paused`, `pausedBy`, `heard` | Guards the save against a stale tab |
| B | Which screen is up | about 40 objects with `.open`, written at 184 sites in 23 files | Five lists disagree (see defects) |
| B | Input gate | `battle.blocking`, `dialog.blocking`, `cutscene.blocking`, `pvp`, `S.loading`, `fading()` | Seven hand-written combinations. `__ow.gateReport()` is the nearest thing to one reader |
| B | Battle | `battle.active.phase` (flash, msg, menu, moves, target, switch, bag, learn, done) and `_starting` | Saved for battle resume; read in 7 other files |
| B | PvP and Factory battles | `pvp.js` phase (12 values), `factorySpec` | Live multiplayer |
| B | Cutscene runner | `events.js` `cur` and `sub.kind`; scripts wait on menus | A watchdog rebuilds its progress by hand |
| B | Map loading / stranded rescue | `S.loading` (16 writes), `S.strandedSince` | |
| C | Dialog | `dialog.pages`, `onClose` | Cleared from outside by other modules |

### Pocket Enhanced, the Inventory, shared helpers

| Tier | Flow | State lives in | Notes |
|---|---|---|---|
| A | Inventory trade window | `inventory.js` `T` | **Declared** (`inventory.trade`). It moves overworld save data |
| A | Collection sync | `colsync.js`: `status`, `running`/`again`, stored `{user, rev, base, sent}` | Six returns from `once()` |
| A | Engine turn state | `engine/engine.js`: `S.phase`, `S.pending`, `S.over` | In saved runs, replays and the server match. Watched from the page as `pocket.turn`; the engine itself is not touched |
| B | Page mode | `main.js`: `MODE` with `G`, `S`, `V`, `R` | **Declared** (`pocket.page`) |
| B | Online lobby and match | `main.js` `ON` | Server protocol |
| B | Pocket's own trade screen | `main.js` `TR` | A field (`synced`) missing from its declaration |
| B | Modal stack | `main.js` `mstack` | Entries carry no type |
| B | Table choices | `ui.pick`, `ui.setup`, `ui.cmds` | |
| C | Pack opening | `openOne` `phase` (idle, tearing, revealing, done) | |
| C | Focus ring | `makePad` in `main.js`; `site/focusnav.js`; `site/osk.js` | |
| C | Coin queue, replay playback, drag, dust mutex | `main.js` | |
| C | Games switcher | `site/switcher.js` leave guard (safe, confirm, block) | |

### Server (`server/`)

| Tier | Flow | Rows | Notes |
|---|---|---|---|
| A | Live trade | `xtrade:`, notes in four other rows | Explicit; the reference |
| A | Dust craft / break | account `pkCraft`, `pkcol:` `owed` | Declared in a comment; one stuck state fixed |
| A | Mailbox Pokémon trade | `trades:`, `tradeback:` | Guarded; a retry finishes it, only the accepter can retry |
| A | Gifts, repairs | `gifts:`, `repair:` | See defects |
| A | `ow-save` revision guard | `ow:` | Atomic |
| B | Async correspondence match | `amatch:`, `amlist:` | invited, active, over; undeclared; see defects |
| B | Live challenge and match | `challenge:`, `ready:`, `curmatch:`, `match:`, `cardmatch:` | See defects |
| B | Card duel rematch | `cardmatch:` rematch fields | Two row shapes live |
| B | Pocket PvP lobby | `pkpvp:` | Timeouts applied by whoever polls |
| B | Micatro PvP | `mtpvp:` | Best commented; protocols 2 to 4 live |
| B | MicaSurvivor replay sessions | `msurvsess:`, `msurvseg:`, `msurvreplays:` | See defects |
| C | Matchmaking, pack inbox, rate limits | `mm:`, `pkinbox:`, `rl:` | Self-healing or approximate by design |

### Other games

| Tier | Flow | State lives in | Notes |
|---|---|---|---|
| A | Battlecards run lifecycle | `game.js` `run.snapshot`, `pendingResult`, `postGame` | Saved and cloud-synced; the resume dispatch is copied nine times |
| A | MicaSurvivor save-sync mode | `core/db.js` `mode` (cloud, local, magepunk) | The comment lists two of the three |
| B | MicaSurvivor run state | `game.js` `state` (ui, playing, paused, levelup, held, choice, over, watch), about 30 writes, 60 reads | Feeds the frame-exact replay tape; 58 suites read it |
| B | Micatro `G.STATE` | `engine/run.js` | Enum declared, 30 direct writes, a return stack in loose fields; recorded into run recipes |
| B | Battlecards board input mode | `game_state.js` `GS.pending.mode`, `selectedAttacker`, `placing`, `queueBusy` | Mirrored by duel relay intents |
| B | Battlecards "who must act" | `engine/core.js` stack, priority, `askQueue`, `pickQueue` (19 modes) | In snapshots, replays and the balance simulator |
| B | MicaSurvivor watching | `ui/watch-ui.js` `mode` with `Game.state === 'watch'` | |
| B | MicaSurvivor 3D page mode | `m3d/main.js` URL constants and `runOver`, `replayState` | `__m3d` exposes most of it |
| B | Pair of Pears phase | `pear.js` `phase()` from five flags | Illegal combinations hidden by the order of checks |
| C | Scoundrel | `engine.js` `STATE` | Explicit |
| C | Battlecards packs | `packs.js` `phase` | Explicit |
| C | MicaSurvivor Judgment, Rift, game mode | `systems/` | |
