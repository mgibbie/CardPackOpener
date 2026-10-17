# MicaSurvivor

MicaSurvivor is **PokéSurvivor by JPTER78** (https://github.com/JPTER78/pokesurvivor), a browser
bullet-heaven roguelike with Pokémon Mystery Dungeon sprites, ported into the Magepunk site. This
is phase M1 of `Plans/MICASURVIVOR_PLAN.md`: the game as-is, offline, with no network calls.

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

## Tests

- `node overworld/tests/micasurvivor_boot_test.mjs` covers boot (no console errors, no external
  requests), guest start, a 30 s bot run with level-up picks, and the save round-trip through a
  reload.
- `node overworld/tests/micasurvivor_phone_test.mjs` is the 390px phone smoke test (touch
  controls).
- Set `MICASURVIVOR_SHOTS=<dir>` to save screenshots.
