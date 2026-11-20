# New game rules

The owner's house rules for every game on the site (2026-11-20). A new game follows **all** of them before it ships;
`overworld/tests/game_rules_test.mjs` (in every PR's quick gate) fails while one is missing, and names what is.
The games that predate the rules carry frozen waivers in `overworld/tests/game_rules.mjs` (mostly stars); a new game
never gets a waiver.

**The reference implementation is Pair of Pears** (`pairofpears/`): the only game wired into all of it. When in doubt,
do what it does. Its files: `index.html`, `js/main.js` (UI + wiring; test hook `window.__pears`), `js/pear.js` (the
rules engine, pure: `view()` / `label()`), `js/save.js` (run + device replays), `js/net.js` (8 lines), `css/pears.css`.

## 1. The Balatro / Micatro look, with button sounds (no music needed)
- Load the kit: `<link rel="stylesheet" href="/site/ui/balatro.css">` and `<body class="bal-page">` — or, for a card
  game on Micatro's table, `micatro/css/micatro.css` (it imports the kit) plus your own CSS (Pears: `css/pears.css`).
- Use the kit's pieces (`.bal-btn`, `.bal-panel`, `.bal-tab`, `--bal-*` tokens; canvas games: `site/ui/canvas.js`
  `panel / button / text / bar / tooltip`). The style guide is the page `/site/ui/`; the API is `site/ui/README.md`.
- Every button clicks: `import { sfx } from '/site/ui/sfx.js'` and `sfx.wire(root)` (or `sfx.press()` / `back()` /
  `error()` / `coin()` …), or Micatro's `js/ui/sound.js`. The 🔊 switch is shared (`localStorage.micatro_sfx`).
- A canvas redrawn every frame must NOT sit on the fixed felt: `html body.bal-page { background: var(--bal-bg); }`
  (README, last section; `site_ui_gamebg_test.mjs` — add the page to its `PAGES`).

## 2. Controls: keyboard, controller and touch — all three, always
- One call: `startInput({ onAction, onRelease, pad: true, padOptions })` from `/site/input.js` (its header documents
  it). Keys: arrows / WASD move, **Z = A (confirm), X = B (cancel), C = X, V = Y**, Q / E prev / next, Enter = menu.
  Expose it for tests: `window.__<game>Input = startInput(...)`.
- Prompts show the right labels: `keyLabel(action)` / `gamepad.js buttonLabel(action, kind)`.
- Touch: every action has a tappable control; check portrait AND landscape phones (`PORTRAIT` / `LANDSCAPE` in the
  tests); typing in a text field (`isTyping`) moves nothing; text entry on a pad uses `site/osk.js askText()`.
- The Games switcher: load the top bar (`<script type="module" src="/site/topbar.js">`, it brings `site/switcher.js`):
  backtick, hold Esc, Start + Select, or a ⚙️ with `data-mp-switcher`. A run that would be lost on leaving sets
  `window.mpLeaveGuard` (switcher.js header).
- Register: `site/switcher.js` `ENTRIES` (its id, name, icon, href), and `overworld/tests/switcher_games_lib.mjs`
  `PAGES` (how it boots). Add the game to `controls_b7_test.mjs`-style coverage: played keyboard-only,
  controller-only and touch-only.

## 3. Stars are the currency
- Anything the game pays or charges is in stars: `import * as Stars from '/site/stars.js'`, then
  `Stars.earn(n)` / `Stars.spend(n)` (returns false when short) and `Stars.sync((a, b) => net.call(a, b))` for a
  signed-in player (Pears' `bankStars()`; Pocket's debounced `starSync`). `STARS_PER_PACK` = 100 is the yardstick.
- Show the balance (`Stars.stars()`) where it is earned or spent; expose `window.__<game>.wallet` for tests.
- Pay once per finished run (and on abandon, what was banked); a guest's stars stay on the device.
- Anything tradeable is valued in stars (`site/values.js`), so it can be traded and staked.

## 4. Watch live, replay, clip, bet
- **Live**: a `js/net.js` wrapper over Micatro's channel, `startPublisher(view, label, { action: 'publish-<g>',
  bet })` while playing and `startSpectate(user, { action: '<g>-state', onSnapshot })` for the viewer at
  `/<game>/?spectate=<user>`. The engine's `view()` is the snapshot; a spectator never sees what the player can't.
  The final push (`finish({ won, replay })`) carries the replay.
- **Server**: `server/mp.mjs` `SOLO_LIVE` (+ `SOLO_REPLAY_RE` for a URL-param replay, + the `publish-<g>` /
  `<g>-state` rate-limit entries).
- **Presence → watch links**: `site/livewatch.js` (`activityFromStatus`, a `<g>ActivityLabel`, `watchHref`),
  `watch/watch.js` `KIND_NAME` + `KIND_ICON`, `site/topbar.js` `friendActivity`.
- **Replays**: a `?replay=` viewer; list it in `site/replaylib.js` (`GAME_NAME`, `GAME_ICON`, `replayHref`; a device
  replay also in `DEVICE_LISTS`; a server one in mp.mjs `REPLAY_LIB_GAMES`). Replays are recipes (seed + actions)
  replayed by the engine, or snapshot tapes.
- **Clips**: the viewer reads `&t=` and offers "Copy link to this moment" (`site/clip.js` `clipStart` /
  `clipButton`; `replay_clips_test.mjs`).
- **Bets**: the publish's `bet` callback returns `{ run, prog, res?: 'win' | 'lose' | 'draw' }`; add the game's
  milestone to `server/bets.mjs` `MARK` (betting closes when `prog` reaches it). The channel mounts the spectators'
  bet widget and the player's "riding" badge by itself.

## 5. The rest of a new game's checklist
- `overworld/tests/game_rules.mjs`: its row (copy Pears', change the names); `game_rules_test.mjs` passes.
- `overworld/tests/select-changed.mjs` `LANES`: its row (paths, suite-name pattern, 1–3 boot suites).
- The home page tile (`index.html`), `sitemap.xml`, `site/topbar.js`'s analytics label.
- Its rules engine is pure and deterministic from a seed (replays, spectating and resume all depend on it), with a
  `window.__<game>` test hook; its suites: engine, UI, guest, replays, spectate e2e.
- The overworld stays login-only; the weekly tournament stays retired.
