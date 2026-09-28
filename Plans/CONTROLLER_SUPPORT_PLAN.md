# Controller Support Plan

Gamepad support (the browser Gamepad API) for the three surfaces a player spends time in: the **overworld**, **Pokémon battles** (which run inside the overworld), and **Battlecards**. Nothing in the repo uses the Gamepad API today.

## What the investigation found

**Overworld + Pokémon battles are nearly ready.** Every discrete action already goes through one router, `pressKey(k)` (`overworld/ow_menukeys.js`), and walking reads one array, `heldKeys` (`overworld/ow_input.js`). The touch d-pad already feeds both (`main.js`, touch controls block). A gamepad layer can do exactly what the d-pad does, so no menu or battle code needs to know it exists. The gaps are narrow:

- **Text entry:** three `prompt()` boxes — Name Rater rename, friend code, PC search. Chat is out of scope here.
- **Pointer-only features:** TAKE held item, summary "move to lead" and move reordering, the PC release toggle, and advancing PvP animations.
- **Letter-only shortcuts:** dex filters `t/r/f/g`, PC `Tab/s/r/f`, trainer-card share `s`, battle `s/r`, bike `c`.
- **Stuck keys:** there is no blur or visibility handling for held keys, so a key held while the tab loses focus stays held. Keyboard players have this bug too.
- **Music:** it starts on the first key or pointer press, and browsers don't count a gamepad press as a user gesture.
- **PokéChess:** a separate page with its own key handler.

**Battlecards has a clean action layer but no focus model.** In a match, every action goes through `act*()` intents (`actPlay`, `actAttack`, `actPower`, `actEndTurn`, …) and "pre-intent" helpers (`playFromHand`, `tryArmAttack`, `commitPending`, `panelClick`, `clearModes`). The engine hands out legal targets as data (`E.legalTargets`, `E.attackTargets`). A controller can call these directly and never raycast. The work is:

- **Focus/navigation on the canvas board:** hand, both boards, heroes, lands, artifacts and locations, plus choosing a board slot when placing a creature.
- **Pointerdown-only modals:** `#scry-modal` (mulligan, discover, loot and the rest) and `#walker-menu` listen for `pointerdown`, not `click`, and mulligan cells are plain `<div>`s. A generic DOM navigator won't fire them.
- **Hover-driven UI:** hand-card lift/zoom, tooltips and long-press previews all key off hover, so they need a "focused card" equivalent.
- **Pack opening:** you drag the pack to open it.
- **Text entry:** deck names, chat, login, and the deck-code and replay-code `prompt()`s.

About 115 run-mode screens (dungeon, heist, tombs, duels, lorequest) are DOM overlays built from real `<button>`s with `click` handlers. A generic spatial navigator covers all of them at once.

## Owner decisions (2026-09-28)

- **Signed-in players only.** Controller play starts once the account has loaded with a username. Anyone else who plugs in a pad gets a one-time "Sign in to play with a controller" message.
- **Nintendo layout is the standard.** The RIGHT face button confirms and the BOTTOM one cancels, as on a Switch, SNES or GBA. The Xbox layout (bottom confirms) is an option (`layout: 'xbox'` in `site/gamepad.js`; settings UI in Phase 5).

## Button layout

The table below uses Xbox button names for the positions. **With the Nintendo standard, confirm and cancel trade places:** the right face button confirms and the bottom one cancels. The table's "A" is therefore the right face button. On other controllers the same positions are used; only the on-screen labels change (Phase 5).

| Button | Overworld | Pokémon battle | Battlecards match | Menus / DOM |
|---|---|---|---|---|
| Left stick / D-pad | walk (held) | move cursor | move focus | move focus |
| A | confirm / talk (`z`) | select | select / play / commit target | activate |
| B | cancel (`x`); hold = run | back | cancel targeting (`clearModes`) | back (`nav.js` Esc-back) |
| Start | start menu (`Enter`) | — | end turn (**hold 0.6s**) | — |
| Select / View | party (`p`) | — | concede/options menu | — |
| Y | bag (`b`) | bag | hero power | context action |
| X | context action (see below) | — | inspect focused card | context action |
| LB / RB | page / switch tabs; register bike (`c`) on LB | — | jump between zones (hand ↔ board ↔ enemy) | page / tabs |
| Right stick | — | — | virtual cursor (fallback for anything unmapped) | scroll |

**Context actions (X/LB/RB)** replace the letter-only shortcuts per screen. For example: in the PC, X = sort, LB/RB = previous/next box, RB+Y = release; in the dex, X cycles filters. Each screen's hint bar shows what the buttons do there.

Switching to the Xbox layout is a settings toggle (Phase 5). The Nintendo layout is the default.

## Phases

Each phase ships on its own, with a regression test, through the full gate.

### Phase 0: shared gamepad core (`site/gamepad.js`)
One module used by all three surfaces.
- **Polling:** a `requestAnimationFrame` poll of `navigator.getGamepads()`, the standard mapping, and a radial stick deadzone (0.35).
- **Edges and repeat:** per-button rising/falling edges, and held-direction repeat (250 ms delay, then every 90 ms) for menus.
- **Output:** `onPress(action)`, `onRelease(action)` and `held()` in *logical* actions (`confirm`, `cancel`, `menu`, `up`, …), not raw buttons, so remapping and the A/B swap happen in one place.
- **Lifecycle:** connect/disconnect events, and releasing everything on `blur`, `visibilitychange` and disconnect.
- **Testability:** the pad is read through an injectable `readPads()`, so puppeteer tests can feed a fake pad. Headless Chrome has no real gamepads.
- **Controller type:** detected from `gamepad.id` (Xbox / PlayStation / Switch / generic) for labels.
- **Test:** `gamepad_core_test.mjs`. Pure node, fake pads: edges, repeat timing, deadzone, blur release, disconnect release.

### Phase 1: overworld + Pokémon battles (`overworld/ow_gamepad.js`)
- **Input bridge:**
  - While free to move (`!menuBlocking()`), stick and d-pad write directions into `heldKeys`. The pad's contribution is tracked separately, as the touch d-pad does with `dpadDir`, so a keyboard keyup can't cancel a held stick.
  - While blocked, directions become `pressKey('ArrowX')` with the core's repeat.
  - Buttons call `pressKey('z'|'x'|'Enter'|'p'|'b'|'c')` on the rising edge. Holding B sets `S.runHeld`.
- **Stuck-key fix:** clear `heldKeys` and `S.runHeld` on blur and visibility change. This fixes the keyboard bug too.
- **Letter shortcuts to context buttons:** the per-screen map for dex, PC, trainer card and battle `s/r`.
- **Pointer-only features get key paths:** TAKE item, summary "move to lead" and reorder, PC release toggle, PvP advance on `z`. Keyboard players gain them as well.
- **Touch HUD:** hidden while a pad is connected, back on the next touch.
- **PokéChess:** loads the same core.
- **Music:** show a one-time "Press A to begin" overlay. If the browser won't count the button as a gesture, the overlay also accepts a click. (Browser behaviour needs testing.)
- **Test:** `ow_gamepad_test.mjs`. Fake pad, driven through the real `pressKey`/`heldKeys`:
  - walk a route; open start → bag → use an item;
  - talk to an NPC; win a battle (move select, switch, bag);
  - PC box paging; hold B to run;
  - blur mid-walk releases the stick;
  - keyboard and pad held at once don't cancel each other.

### Phase 2: on-screen keyboard (shared)
A small DOM component (`site/osk.js`), navigable with the pad, that replaces `prompt()`.
- **Overworld:** Name Rater, friend code, PC search.
- **Battlecards:** deck name, deck-code paste, replay code.
- **Keyboard players:** type straight into it; it's a normal input.
- **Out of scope:** chat and login. Login happens once, and chat is optional. Offering the emote row to pad players may be enough; open question below.
- **Test:** `osk_test.mjs`. Enter a name via the pad; Enter/Esc from a keyboard still work; the result matches what `prompt()` returned.

### Phase 3: Battlecards DOM surfaces (`battlecards/padnav.js`)
A spatial-focus navigator for DOM screens.
- **How it works:** it collects visible focusables (buttons, `[tabindex]`, cards) and moves to the nearest in the pressed direction. A draws a visible focus ring; B goes back via `nav.js`.
- **Coverage:**
  - Lobby/start page, game over and concede.
  - Every run-mode overlay (`dungeonOverlay`/`overlayButton`, ~115 screens, one pattern).
  - Deck builder: tiles are already `tabIndex`; A = zoom, then A = Add.
  - Gallery, profile, and the replay bar (LB/RB = step, A = play/pause).
- **Modal fix:** switch `#scry-modal` / `#walker-menu` / `#inspect` handlers from `pointerdown` to `click`. Mulligan cells become buttons, so both mouse and pad fire the same path. Keeping pointerdown's instant response on touch needs checking; `click` fires on tap anyway.
- **Pack opening:** A opens the pack; stick + A flips cards.
- **Test:** `padnav_smoke.mjs` (puppeteer, fake pad):
  - walk the lobby → start a dungeon run;
  - pick a class and treasure through overlays;
  - resolve a mulligan and a discover modal with the pad;
  - build a deck;
  - open a pack.

### Phase 4: Battlecards match board (`battlecards/padboard.js`)
The one surface that needs a real focus model.
- **Zones:** hand, my board, my hero/orb, enemy board, enemy hero(es), lands/artifacts/locations and end turn. LB/RB jump zones; left/right moves within one.
  - The focused card sets `hoverUid`, so the existing lift, zoom and tooltip just work.
  - X opens `#inspect`.
- **Playing a card:** A on a hand card runs `playFromHand`.
  - A creature enters **slot-pick**: left/right moves the existing place marker (`updatePlaceMarker`), A places, B backs out.
  - Choose-one, alt-cost and kicker menus appear in `#walker-menu`, which Phase 3's navigator drives.
  - Helpers that only use `ev` to position a menu get `{clientX, clientY}` from `screenPosOf(uid)`.
- **Targeting:** while `pending` or an armed attack is live, focus cycles **only the legal targets** (`E.legalTargets` / `E.attackTargets`). A calls `commitPending(t)` / `actAttack` / `panelClick`; B calls `clearModes()`.
  - The red line already draws to `mouseX/mouseY`, so the focus sets those to the target's screen position and the arrow follows for free.
- **Attacks:** A on a ready creature arms it (`tryArmAttack`), and focus jumps to the enemy zone.
- **Hero power, end turn and fallback:** Y = hero power. Start (held 0.6 s, with a fill ring) = end turn, so a stray tap can't end the turn. The right stick drives a virtual cursor as a fallback for anything unmapped.
- **Multiplayer:** the `act*` layer already relays for guests, so no extra work.
- **Test:** extend `targeting_commit_smoke.mjs` / `handcard_drag_smoke.mjs` with a pad driver:
  - play a creature into slot 2; cast a targeted spell;
  - attack a creature, then the hero;
  - hero power; end turn by hold;
  - B cancels targeting;
  - a guest in a 2-player match plays with the pad.

### Phase 5: polish
- **Button labels:** on-screen hints show the connected controller's buttons (Xbox A/B/X/Y, PlayStation ✕/○/□/△, Switch). This covers overworld hint bars, battle prompts and the Battlecards action bar.
- **Remapping:** Options → CONTROLS gains a controller column, alongside `ow_keybinds`' keyboard table, plus the Nintendo A/B swap.
- **Haptics:** `GamepadHapticActuator` rumble on damage, crits, ball shakes and card attacks. Off by default.
- **Steam Deck / handheld check:** the layout at 1280×800, and the touch HUD not flickering with a pad attached.
- **Docs:** a "Controls" section on the design wiki.

## Order and size

| Phase | Size | Notes |
|---|---|---|
| 0: core | small | everything depends on it |
| 1: overworld + battles | small–medium | highest payoff for least work; the router already exists |
| 2: on-screen keyboard | small | unblocks three overworld and three Battlecards prompts |
| 3: Battlecards DOM | medium | one navigator covers ~115 overlay screens; the modal handler change touches mouse/touch paths too |
| 4: Battlecards board | large | the only new interaction model |
| 5: polish | medium | can be split up and done any time after 1 |

Recommended order: **0 → 1 → 2 → 3 → 4 → 5.** After Phase 1 the whole Pokémon side is fully playable on a controller.

## Risks

- **Headless tests can't press a real controller.** Every test drives the injectable `readPads()`. A short manual check with a real pad goes in each PR.
- **Pointerdown → click on Battlecards modals** changes mouse and touch behaviour. Phase 3 has to re-run the existing gesture/targeting smokes.
- **Audio unlock:** browsers differ on whether a gamepad press unlocks audio; the Phase 1 overlay covers both cases.
- **Accidental end turn:** mitigated by the hold-to-confirm.

## Open questions for the owner

1. ~~**Layout:**~~ answered: Nintendo layout is the standard (see Owner decisions).
2. **Chat and login:** skip for pad players, or have the on-screen keyboard cover them too?
3. **End turn:** hold Start (proposed), or a press plus confirmation?
4. **Order:** start with the overworld (Phase 0–1) as proposed, or Battlecards first?
