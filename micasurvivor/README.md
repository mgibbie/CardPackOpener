# MicaSurvivor

MicaSurvivor is **PokéSurvivor by JPTER78** (https://github.com/JPTER78/pokesurvivor), a browser
bullet-heaven roguelike with Pokémon Mystery Dungeon sprites, ported into the Magepunk site. This
is phase M1 of `Plans/MICASURVIVOR_PLAN.md`: the game as-is, offline, with no network calls.
Phase M2 adds controller support (see "Controller" below).

Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)

## Licences

- **Code**: PolyForm Noncommercial License 1.0.0 (`LICENSE-NONCOMMERCIAL.md`). Code from before
  commit b297089 (14-10-2026) is MIT (`LICENSE`). Vendored from upstream HEAD
  `5bbc3b29288d6af4596f21188fb8b54e0e9b739f` (2026-10-15).
  **MicaSurvivor must never get ads, paid items or anything sold.**
- **Sprites**: PMDCollab SpriteCollab, CC BY-NC 4.0. Every artist is listed in `CREDITS.md`, and
  the in-game Credits screen (title screen → "Credits & licences", or Settings → About) shows them.
- **Font**: Pixelify Sans, SIL OFL (`fonts/OFL.txt`).
- **Controller design** (M2): taken from the Android port by JayElDragon (MIT),
  https://github.com/JayElDragon/poke-survivor.
- Pokémon © Nintendo / Creatures Inc. / GAME FREAK. This is a non-commercial fan project.

## How it loads

There is **no build step**. `index.html` is upstream's `dev.html` (the source page) and loads each
classic script under `js/` in order with `<script defer>`. Every module hangs off the global `G`,
so `window.G` can be reached from the console and from tests. Upstream's `tools/build.js`
(terser + javascript-obfuscator into `app.min.js`) is deliberately not used: the obfuscated
bundle is unreadable, and it is the only thing their updater needs. All paths are relative, so
the page works from `/micasurvivor/`.

## Assets (not in git)

`assets/pokemon/<dex>/` (13,481 files, ~104 MB) is **gitignored**. On the live site
`_redirects` sends `/micasurvivor/assets/*` with a 301 to `https://magepunk-micasurvivor.pages.dev/`,
which is a separate Pages project. Sheets load with `crossOrigin = 'anonymous'`, and the staged
`_headers` adds `Access-Control-Allow-Origin: *`.

- Local copy: `cp -r <pokesurvivor checkout>/assets/pokemon micasurvivor/assets/`
- Deploy (owner): `npm run deploy-micasurvivor`. This runs `tools/micasurvivor/stage_assets.mjs`,
  which copies `micasurvivor/assets` into `.micasurvivor/` and writes `_headers`, then deploys
  from inside `.micasurvivor` so the site's functions aren't bundled.
- The small essentials are tracked in git: `fonts/` (Pixelify, ~100 KB), `icons/`, `favicon.ico`.

## Saves

The game saves to localStorage only. Every key starts with `micasurvivor_` (upstream used
`ps.`). The main save is `micasurvivor_save.guest`. In M3 this moves to `/api/mp` for logged-in
players.

## What changed from upstream

Every edit is marked `MicaSurvivor` in a comment:

- **Left out**: the SEO sub-sites (guia/, pokedex/, objetos/, legendarios/, novedades/, en/, apoyar/,
  contacto/, logros/, movimientos/, tipos/, shinies/, docs/), `js/core/firebase-config.js`,
  `js/core/updater.js` (forced-update reloads), `js/data/funding.js` and `js/ui/support-ui.js`
  (donations), `sw.js` and `manifest.webmanifest`, CNAME, firebase.json, Firestore and database rules,
  `version.json`, `dev.html`, `js/app.min.js`, `tools/`, GDD.md and `assets/og-image.jpg`.
- `js/core/db.js`: the Firebase cloud is stubbed (`initCloud` returns false, so the game never
  loads the SDK). The upstream body is kept, never called, to keep the diff small. "Play" is a
  **persistent** local guest profile, where upstream's guest save lived only in memory.
- `index.html`: SEO/og/ld+json and preconnects are gone. The login screen has one **Play**
  button (password and Google login are hidden until Magepunk accounts arrive in M3). The
  Gmail-recovery and donation screens are gone. The legal screen is now **Credits & licences**,
  filled by `js/mica/credits.js`. The title says MicaSurvivor, with the "based on PokéSurvivor by
  JPTER78" credit on the boot screen, title screen, menu, footer and Settings → About.
- `js/core/i18n.js`: English by default. Español is still selectable in Settings → Graphics.
- `js/ui/social-ui.js`, `js/ui/menu.js`: Friends, co-op and Ranking show "Coming soon"
  (they need the cloud).
- `js/net/net.js`: no STUN servers, so the game makes no external request even if co-op code runs.
- `js/main.js`, `js/game.js`: no service worker, no SupportUI or Updater.
- `js/core/sprites.js`: `crossOrigin = 'anonymous'` on sprite sheets.
- Every storage key went from `ps.` to `micasurvivor_`. All text files were normalised to LF.

## Controller (M2)

`js/core/pad.js` (`G.Pad`) adds controller play. The design comes from the Godot Android port
by **JayElDragon** (MIT, https://github.com/JayElDragon/poke-survivor: `scripts/pad.gd`,
`padicons.gd`, and the menu / pause / card-choice handling). It is rebuilt in JS on the site's
gamepad core, `/site/gamepad.js`, which handles edges, held-direction repeat and blur latching.
`pad.js` loads that core with a relative dynamic `import()`.

- **Move**: the left stick (radial deadzone 0.2, rescaled so speed is analog) or the D-pad,
  alongside the keyboard and touch. `G.Input.axis()` asks `G.Pad.axis()` after touch.
- **Actions** (remappable):

  | Action | What it does | Xbox | PlayStation | Nintendo |
  |---|---|---|---|---|
  | prev / next | switch move (Q / E); cycle a screen's tabs; walk the level-up cards | LB / RB | L1 / R1 | L / R |
  | pause | pause / resume (Esc) | Menu | Options | + |
  | confirm | press the focused control; pick the focused card | A | ✕ | **A (right face)** |
  | cancel | back on every screen; resume from pause | B | ○ | **B (bottom face)** |
  | reroll | reroll the level-up cards (R) | Y | △ | X |

  View / Back with nothing bound to it works as back in menus and as pause in a run. The port's
  **ban, swap, Z-move and Dynamax** actions are left out because the web game has none of those
  mechanics: there is no in-run card ban (Veto is chosen in Upgrades), no team mode, no Z-moves
  and no Dynamax.
- **Layouts**: Xbox, PlayStation and Nintendo. Nintendo swaps confirm and cancel. It is the
  default (the site standard, also read from `magepunk_pad_v1`). Picking a layout resets the
  mapping to that layout's defaults.
- **Settings → Controls** has the layout picker, a **remap** row per action, a vibration switch
  and **Reset mapping**. To remap, select a row, then press any button except the D-pad or Guide.
  If another action already used that button, the two actions **swap**. Keyboard Esc or 8 s
  without a press cancels. Everything is saved in `micasurvivor_settings` (`padLayout`,
  `padMap`, `padRumble`).
- **Glyphs**: button icons drawn as SVG, the same per-layout set as the port's `padicons.gd`.
  They appear on the level-up / item / bond cards (the focused card shows confirm), the
  "1 2 3" and "R" prompts, the pause hints, the HUD (LB / RB beside the move bar, plus the first
  14 s hint line), the menu hint bar, and the remap rows. `body.pad-input` switches every prompt
  to glyphs while a pad is in use. Any key, mouse click or touch switches back to keys.
- **Focus navigation**: every screen and overlay (title, test, menu, Pokémon, Upgrades, Gacha
  with the slot machine, Missions, Settings, Credits, pause, cards, summary...) has a gold focus
  ring. Focus moves spatially with the D-pad or stick. Confirm presses the focused control. Left
  and right change a `<select>` or slider. Cancel is back everywhere. The right stick scrolls long
  panels. The first press after keyboard or mouse use only shows the ring. Cards that pop up in a
  run ignore confirm for 0.4 s, so a held button can't pick one by accident.
- **Hot-plug**: the first pad that presses something drives. Other pads are ignored until it is
  unplugged. **Rumble on hit** (`player.hurt`) is optional and off by default.
- **Site rule**: controller play is for **signed-in** Magepunk players (owner decision
  2026-09-28, the same as the overworld, Battlecards and Micatro). A guest's pad only shows
  "Log in to Magepunk to use a controller". The game itself still plays fully for guests with
  keyboard and touch. One switch turns this off: `SIGNED_IN_ONLY` in `pad.js`.

## Tests

- `node overworld/tests/micasurvivor_boot_test.mjs` covers boot (no console errors, no external
  requests), guest start, a 30 s bot run with level-up picks, and the save round-trip through a
  reload.
- `node overworld/tests/micasurvivor_phone_test.mjs` is the 390px phone smoke test (touch
  controls).
- `node overworld/tests/micasurvivor_pad_test.mjs` covers the controller with a synthetic Gamepad
  API: the guest gate, title to run with the pad only, every menu screen, the gacha, layouts, remap
  with swap-on-conflict surviving a reload, stick and D-pad movement, pause, level-up reroll and
  pick, glyphs switching between keys and pad, rumble, and hot-plug.
- Set `MICASURVIVOR_SHOTS=<dir>` to save screenshots.
