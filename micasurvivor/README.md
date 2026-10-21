# MicaSurvivor

MicaSurvivor is **PokéSurvivor by JPTER78** (https://github.com/JPTER78/pokesurvivor), a browser
bullet-heaven roguelike with Pokémon Mystery Dungeon sprites, ported into the Magepunk site
(`Plans/MICASURVIVOR_PLAN.md`). Phase M1 is the game as-is, offline. Phase M2 adds controller
support (see "Controller" below). Phase M3 brings it into Magepunk: the landing tile, the Pewter
Museum arcade cabinet, Magepunk accounts and the leaderboard (see "Magepunk (M3)" below).

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
- **Mechanics** (M5): ported from the same Android port by JayElDragon (MIT); see "Mechanics from
  the Android port".
- Pokémon © Nintendo / Creatures Inc. / GAME FREAK. This is a non-commercial fan project.

## How it loads

There is **no build step**. `index.html` is upstream's `dev.html` (the source page) and loads each
classic script under `js/` in order with `<script defer>`. Every module hangs off the global `G`,
so `window.G` can be reached from the console and from tests. Upstream's `tools/build.js`
(terser + javascript-obfuscator into `app.min.js`) is deliberately not used: the obfuscated
bundle is unreadable, and it is the only thing their updater needs. All paths are relative, so
the page works from `/micasurvivor/`.

## Assets (not in git)

`assets/pokemon/<dex>/` (13,699 files, ~105 MB) is **gitignored**. On the live site
`_redirects` sends `/micasurvivor/assets/*` with a 301 to `https://magepunk-micasurvivor.pages.dev/`,
which is a separate Pages project. Sheets load with `crossOrigin = 'anonymous'`, and the staged
`_headers` adds `Access-Control-Allow-Origin: *`.

- Local copy: `cp -r <pokesurvivor checkout>/assets/pokemon micasurvivor/assets/`
- Deploy (owner): `npm run deploy-micasurvivor`. This runs `tools/micasurvivor/stage_assets.mjs`,
  which copies `micasurvivor/assets` into `.micasurvivor/` and writes `_headers`, then deploys
  from inside `.micasurvivor` so the site's functions aren't bundled.
- The small essentials are tracked in git: `fonts/` (Pixelify, ~100 KB), `icons/`, `favicon.ico`.

## Batch B1: the complete Pokédex (2026-10-19)

The owner's decision (`Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md`, "Update (owner, 2026-10-19)"): all 1025
canon Pokémon can be enemies in every mode. The game shipped with 966: upstream's `fetch_pokedex.py` only took
Pokémon whose SpriteCollab entry had all three of Idle, Walk and Attack. B1 vendors upstream's generators into
`tools/micasurvivor/` (they were left out with upstream's `tools/`) and extends them:

- `fetch_sprites.py` takes a Pokémon when its folder has ANY of Idle / Walk / Attack; upstream's own FALLBACK
  table fills the rest (Walk <- Idle, Attack <- Strike / Swing / Shoot / Idle, Hurt <- Cringe / Idle...). Four
  species use an alternate-form folder (`FORMS`): Falinks (the Brass), Gimmighoul (Roaming), Ting-Lu (the full
  sheet SpriteCollab files as "Temp") and Miraidon (Low-Power Mode). It keeps every row already in
  `sprites-meta.js` (`--refresh` re-fetches), so published sheets never change.
- `hover_flags.py` is upstream's, re-run: it reproduces the 966 rows byte for byte.
- `fetch_pokedex.py` lists exactly the Pokémon in `sprites-meta.js`; the stat formula and rarity are upstream's,
  and re-running it reproduces the 966 rows byte for byte.
- `fetch_credits.py --only <dexes>` merges the new sheets' artists into `CREDITS.md` (the existing rows stay as
  they were when those sheets were downloaded).

Result: **983 Pokémon** (+17): Jellicent, Stunfisk, Aromatisse, Toucannon, Sirfetch'd, Falinks, Copperajah,
Dolliv, Grafaiai, Toedscool, Iron Treads, Gimmighoul, Ting-Lu, Miraidon, Gouging Fire, Raging Bolt, Pecharunt.
They follow the existing rules: tiers by BST, Paradox like the other Paradox (Iron Treads rarity 4; Gouging Fire
and Raging Bolt rarity 5, boss-only), Ting-Lu / Miraidon / Pecharunt legendary (rifts, Judgment, Tower). Each has
an ability (`abilities.js`), English names where the Spanish one differs (`lang-en.js`), and Aromatisse is a
healer (`enemies.js`). Eight of them only have a one-frame Idle on SpriteCollab, used for every animation; when
they walk they hop 2 px (`js/core/sprites.js`; none of the 966 has a one-frame Walk).

**Pending the owner's call (42, no SpriteCollab sheet at all; 24 got a fallback in B1b, below):** 514, 516, 520, 522, 523, 538, 558, 564, 565, 591,
592, 616, 626, 668, 732, 735, 756, 765, 837, 838, 839, 866, 878, 893, 931, 942, 943, 944, 947, 949, 950, 954, 956,
962, 973, 986, 993, 1001, 1002, 1014, 1022, 1023. They are not in `pokedex.js` (nothing can spawn them);
`overworld/tests/micasurvivor_pokedex_test.mjs` lists them as `PENDING_ART`.

Deploy order: the new sheets first (`npm run deploy-micasurvivor`), then merge the code, or the new Pokémon 404.

## Batch B1b: fallback sheets from the overworld followers (2026-10-19)

The owner's call on the 42: build fallbacks from images we already have (crop, scale, re-pack; nothing drawn).

- **24 Gen 5–8 Pokémon, from the overworld follower sprites**: `tools/micasurvivor/follow_sprites.py` turns each
  4-direction follower charset (`overworld/data/pokemon_follow/<id>.png`: 4x4 cells of 32 px, rows
  down/left/right/up, the walk cycle stand/step/stand/step) into a MicaSurvivor sheet in
  `assets/pokemon/{dex}/follow/`: **Walk** = the 4 frames, **Idle** = walk frame 0; Attack / Hurt / ... are
  missing on purpose, so the game's own fallback (`animName`) plays Idle for them, with the usual hurt flash.
  Those charsets were downscaled smoothly from the PokemonZero2024 Essentials pack, where they are the same
  drawings at exactly 2x; when the pack is on the PC (`ESSENTIALS_ROOT`) the generator takes its pixels at 1x
  instead (crisp), and its "Followers shiny" folder gives all 24 a shiny. Every frame is cropped to the union of
  all 16 (no jitter), the feet 2 px below the ground anchor (the usual PMD walker).
- The row in `sprites-meta.js` carries `"src":"follow"` (the sheet folder), `"k"` (art scale) and `"dm"` (the
  sheet has 4 rows, Down / Right / Up / Left; `dm` maps the game's 8 directions to them, a diagonal taking the
  side view). `js/core/sprites.js` applies them (`artScale`, `rowOf`: the drawing, the body radius and height,
  the boss scale, the menu previews and the minimap). `k` = the median ratio of PMD Walk height to follower
  height over the 872 Pokémon that have both, among those whose follower is about as tall (1.05–1.45 here);
  `s` (shadow) is that group's median; Frillish floats like Jellicent (`HV_LIKE`).
- **Real sheets win**: `fetch_sprites.py` does not count a `src` row as "already there", so once SpriteCollab
  has a sheet, `fetch_sprites.py --only <dex>` fetches it and the real row replaces the fallback (the real files
  are in `{dex}/`, so no published file changes); `follow_sprites.py` never writes a row for a Pokémon
  SpriteCollab covers and tells you to fetch it. `hover_flags.py` leaves `src` rows alone.
- Pokédex rows from `fetch_pokedex.py` as for the rest; abilities by B1's rule (the family's, else the closest);
  Mr. Rime shields like Mr. Mime; Zarude is mythical (leg: rifts, Judgment, Tower, its achievement: 227).
  Credits: the "Sprites de respaldo" section of `CREDITS.md`, written by the generator.

Result: **1007 Pokémon** (+24): Simisear, Simipour, Tranquill, Blitzle, Zebstrika, Throh, Crustle, Tirtouga,
Carracosta, Amoonguss, Frillish, Shelmet, Bouffalant, Pyroar, Trumbeak, Gumshoos, Shiinotic, Oranguru, Rolycoly,
Carkol, Coalossal, Mr. Rime, Cufant, Zarude.

**Still pending (18, Gen 9):** 931, 942, 943, 944, 947, 949, 950, 954, 956, 962, 973, 986, 993, 1001, 1002, 1014,
1022, 1023. The plan was their SpriteCollab portraits, using only transparent ones; every one of their portraits
(all emotions, 18 species) is a 40x40 bust on an opaque painted background, so none qualifies. They have no
follower sprite either. They stay out of `pokedex.js`, listed as `PENDING_ART` in the Pokédex test.

Deploy order again: `npm run deploy-micasurvivor` (the 96 new files in `{dex}/follow/`) before the merge.

## Batch B1c: fallback sheets from the overworld battle sprites (2026-10-19)

The owner's call on the last 18 (Gen 9: no SpriteCollab sheet, no follower sprite): use their transparent battle
sprites, `overworld/data/pokemon/` (crop, scale, re-pack; nothing drawn; the motion is runtime transforms only).

- `tools/micasurvivor/battle_sprites.py` writes `assets/pokemon/{dex}/battle/Idle.png` and `Walk.png` (the same
  one-frame sheet) and a row with `"src":"battle"`. **2 rows**: the battle FRONT (a big smooth drawing, facing the
  viewer's left) and the BACK (`-b`, 96 px pixel art: the PokemonZero2024 pack's for 931–1002, PokeAPI's for 1014 /
  1022 / 1023). `"dm"` sends straight Up to the back and every other direction to the front; the new `"fx"` says
  which directions draw it mirrored (everything with a rightward part), applied around the ground anchor by
  `js/core/sprites.js` (`flipOf`; the minimap icon too). Walking, the one-frame Walk gets B1's 2 px hop; Attack /
  Hurt / ... play Idle (`animName`) with the usual hurt flash.
- Size: the front is scaled down (premultiplied Lanczos, edge alpha snapped at 128 so it reads as pixel art) to its
  on-field height: its visible height times the median PMD-Walk / battle-front height ratio of the 15 Pokémon most
  alike in front height and real height, among the 109 that have a SpriteCollab sheet and a big battle front of the
  same kind; `s` is their median shadow. The back keeps the pack's own back / front height relation. No `k`: the
  sheet is at PMD pixel scale already. Rabsca, Bombirdier and Iron Jugulis float (`hv`, airborne pictures).
- **No shiny**: the battle set has no shiny pictures (the Essentials pack's "shiny" files for these are copies or a
  different drawing), so the rows have no `sh` and a shiny roll shows the normal sheet.
- **Better art wins**: `fetch_sprites.py` ignores any `src` row, so a SpriteCollab sheet replaces this one
  (`--only <dex>`); `follow_sprites.py` also replaces a `battle` row when a follower sprite turns up;
  `battle_sprites.py` skips a Pokémon either of them covers and says which to run. Each lives in its own folder.
- The gitignored dirs are not in a git worktree: `MAGEPUNK_ASSET_ROOT=<checkout>` makes the generators (and the
  Pokédex test's static server) read `micasurvivor/assets/` and `overworld/data/` from that checkout.
- Pokédex rows from `fetch_pokedex.py` (+18, nothing else changed); abilities by B1's rule (`abilities.js`);
  English names for the 4 Paradox whose Spanish name differs (`lang-en.js`); Brute Bonnet and Iron Jugulis like
  Iron Thorns (rarity 4), Iron Boulder and Iron Crown like Walking Wake (rarity 5, boss-only); Wo-Chien, Chien-Pao
  and Okidogi legendary (rifts, Judgment, Tower, their achievements: 230). Credits: "Sprites de respaldo (lote
  B1c)" in `CREDITS.md`, written by the generator.

Result: **1025 Pokémon, the whole Pokédex** (+18): Squawkabilly, Maschiff, Mabosstiff, Shroodle, Brambleghast,
Toedscruel, Klawf, Rabsca, Espathra, Bombirdier, Flamigo, Brute Bonnet, Iron Jugulis, Wo-Chien, Chien-Pao,
Okidogi, Iron Boulder, Iron Crown. Nothing is pending.

Deploy order again: `npm run deploy-micasurvivor` (the 36 new files in `{dex}/battle/`) before the merge.

## Saves

Every localStorage key starts with `micasurvivor_` (upstream used `ps.`). A guest's save is
`micasurvivor_save.guest` and stays in the browser (a guest makes no network request at all). A
player logged into Magepunk saves to their account (see "Magepunk (M3)").

## Magepunk (M3)

- **Landing tile**: `index.html` (art: `icons/tile.png`, a sprite composite drawn by
  `tools/micasurvivor/make_art.mjs` from the game's own SpriteCollab sheets), with the "Based on
  PokéSurvivor by JPTER78" credit. Also in `sitemap.xml`.
- **Arcade cabinet**: the Pewter Museum 1F lobby, `overworld/arcade.js` (15,8), against the foot of
  the reception counter; played from (14,8). Sprite `overworld/fx/micasurvivorbox.png` (20x32, same
  script). Interacting saves party + position and opens `/micasurvivor/?direct=1`; with `?direct=1`
  the game's "Back to the overworld" links (login screen, menu) go to `/overworld/`, otherwise
  "Back to Magepunk" goes to `/`.
- **Accounts** (`js/mica/account.js` + the Magepunk mode in `js/core/db.js`): with the site's
  login in localStorage (`magepunk_mp_token_v1` + `magepunk_mp_state_v1`) the game skips the login
  screen and plays as that user (the user pill shows the username). The save is the server row
  `micasurvivor:<user>` (`POST /api/mp` `micasurvivor-save-get` / `micasurvivor-save-put`: logged
  in only, exact key from the token, 400 KB cap, 30 writes a minute), and this browser keeps a copy
  under `micasurvivor_save.mp:<user>` (cache and offline play) with the row's revision under
  `micasurvivor_rev.mp:<user>`. Writes are debounced (a purchase or pull ~3 s, a finished run ~2 s,
  anything else ~30 s) and flushed when the tab is hidden or closed.
- **Merge strategy**: every write is a compare-and-set on the row's `rev` (one atomic SQL
  statement). A device that has not seen the latest revision gets **409** with the stored save; it
  merges the two with upstream's own `merge()` and writes again on the new revision, so a second
  device never silently overwrites the first. `merge()` never loses progress: owned Pokémon,
  shinies, legendaries, arenas, items, evolved moves and achievements are unioned; upgrades, stats
  and records keep the max; Pokémonedas and tickets come from the per-device ledger (`save.led`,
  earned / spent per device, the max of each entry, the balance is the sum), so coins earned on two
  devices both count and a spend is never undone; the partner and other choices come from the most
  recently updated save. On boot the server copy and the local copy are merged the same way. Back in
  a tab after 5+ minutes, the menu pulls and merges what another device saved.
- **Guest -> account**: a guest save in this browser is offered to the account **once**
  (`#scr-carry`). An empty account takes it over (its own starting ledger entries zeroed, so no
  extra 500 coins appear later); an account with progress is merged with it (the guest ledger
  re-keyed `g.<device>` so both balances add up; the account's own choices win). The account save
  is backed up first to `micasurvivor_backup.mp:<user>.<time>`; the guest save is never deleted; the
  answer is remembered in `micasurvivor_migrated.guest`.
- **Log out / Delete account** stay hidden: a Magepunk player's account belongs to the site
  (Settings -> Account shows "Magepunk account", the username, and a link to Magepunk instead).
  Upstream's "What's new" stays hidden too (it is PokéSurvivor's own changelog).
- **Leaderboard**: `run-score` mode `micasurvivor` on the site's run boards: a clean solo Normal run
  with no modifiers of 2+ minutes (upstream's `MIN_T`, and its anti-tamper `clean()`) sends `{time, kills, level, dex,
  shiny}`; the board ranks by survival time, then kills; a time past 4 hours is refused. The menu's
  Ranking item opens the board (top 50 + your rank) in place of upstream's Firebase boards. Friends
  and co-op came in M5 batch 12b ("Batch 12b: Online co-op").
- **Design wiki**: `#/micasurvivor` (overview, Pokémon, Moves, Items & Upgrades), data generated by
  `node tools/micasurvivor/gen_designwiki.mjs` into `designwiki/data/micasurvivor.json` — rerun it
  after changing `js/data`.
- **Magepunk News**: `tools/gen-magepunknews.mjs` announces the launch on the commit that first
  adds `js/mica/account.js` (entry kind `micasurvivor`).

## What changed from upstream

Every edit is marked `MicaSurvivor` in a comment:

- **Left out**: the SEO sub-sites (guia/, pokedex/, objetos/, legendarios/, novedades/, en/, apoyar/,
  contacto/, logros/, movimientos/, tipos/, shinies/, docs/), `js/core/firebase-config.js`,
  `js/core/updater.js` (forced-update reloads), `js/data/funding.js` and `js/ui/support-ui.js`
  (donations), `sw.js` and `manifest.webmanifest`, CNAME, firebase.json, Firestore and database rules,
  `version.json`, `dev.html`, `js/app.min.js`, `tools/`, GDD.md and `assets/og-image.jpg`.
- `js/core/db.js`: the Firebase cloud is stubbed (`initCloud` returns false, so the game never
  loads the SDK). The upstream body is kept, never called, to keep the diff small. "Play" is a
  **persistent** local guest profile, where upstream's guest save lived only in memory. (M3) A
  Magepunk mode: a logged-in player's save lives in their account (see "Magepunk (M3)").
- `index.html`: SEO/og/ld+json and preconnects are gone. The login screen has one **Play**
  button and a "Log in with Magepunk" button (upstream's password and Google login stay hidden:
  Magepunk accounts replace them). The
  Gmail-recovery and donation screens are gone. The legal screen is now **Credits & licences**,
  filled by `js/mica/credits.js`. The title says MicaSurvivor, with the "based on PokéSurvivor by
  JPTER78" credit on the boot screen, title screen, menu, footer and Settings → About.
- `js/core/i18n.js`: English by default. Español is still selectable in Settings → Graphics.
- `js/ui/social-ui.js`, `js/ui/menu.js`: Friends and co-op run on Magepunk accounts (M5 batch 12b; before it they
  said "Coming soon"). `js/ui/ranking-ui.js`: the Ranking opens the Magepunk leaderboard (M3).
- `js/net/net.js`: signalling and the relay over `/api/mp` (M5 batch 12b); public STUN only, and only once you are in a
  co-op lobby (until 12b it had no STUN at all).
- `js/net/social.js`: replaced by `js/mica/social.js` (M5 batch 12b); the upstream body is kept, never started.
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
  | ban | ban a level-up card (B), M5 batch 6 | X | □ | Y |
  | swap | switch Pokémon in Team mode (Tab), M5 batch 7 | RS (R3) | R3 | RS |
  | zmove | the Z-move (Z), M5 batch 4 | LS (L3) | L3 | LS |
  | dynamax | Dynamax (C), M5 batch 5 | View | Share | − |

  View / Back with nothing bound to it works as back in menus and as pause in a run (by default it
  is now Dynamax, the port's `JOY_BUTTON_BACK`; pause stays on Start). In a run the port's extras
  also fire the Z-move: the reroll button (Y / △ / X, which only rerolls on the card screen) and
  the right trigger when nothing is bound to it; and Dynamax: the left trigger and the left face
  button (X / □ / Y) when nothing is bound to them. Since batch 6 that button is **ban**, which
  only bans on the card screen and fires Dynamax in a run (as reroll fires the Z-move). The port's
  **swap** action came with Team mode (batch 7) on R3, a button nothing else used. A map saved before an
  action existed keeps its buttons; the new action gets its default, or the first free button if
  a remap already took it.
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
- **Guests too**: from 2026-09-28 controller play was for signed-in Magepunk players only (a
  guest's pad showed "Log in to Magepunk to use a controller"). The owner dropped that rule on
  2026-10-18: batch 12a removed `SIGNED_IN_ONLY`, the toast and the Settings note, so a pad works
  for everyone.
- **Player 2** (M5 batch 12a, Co-op Mode): a second pad moves the partner with its left stick; see
  "Batch 12a" below.

## Mechanics from the Android port

M5 brings over every mechanic the Godot Android port by **JayElDragon** (MIT,
https://github.com/JayElDragon/poke-survivor) added to the game, one batch at a time
(`Plans/MICASURVIVOR_PLAN.md` → M5). The behaviour and the numbers are the port's; the code is
the web game's own (no GDScript translated line by line). Every edit is marked `MicaSurvivor (M5)`.

### Batch 1: Foundation

- **Kills per type** (`js/systems/progress.js`, port `progress.gd` "tk_"): every enemy that falls
  adds 1 to `save.stats.tk_<type>` for each of its types (a Charizard counts fire and flying), for
  life. `G.Progress.typeKills(type)` reads it. The save merge (`js/core/db.js merge()`, used for
  the Magepunk account's 409 conflicts and the guest carry-over) keeps the max of every stats
  key, so two devices never lose counts.
- **Enemy status effects** (`js/systems/status.js`, `G.Status`; port `main.gd` 213-216 and
  2489-2641), next to the web's burn / poison / slow:

  | Status | Lasts | Effect |
  |---|---|---|
  | Frozen | 1.8 s | doesn't move or attack (only knockback moves it); takes +25% damage |
  | Paralysed | 3 s | 40% speed; attacks and shoots 2.5x slower; takes +35% electric damage |
  | Asleep | 4 s | doesn't move or attack; the next hit does +30% and wakes it (hits from sleep moves don't) |
  | Confused | 3 s | wanders toward the nearest other enemy (within 380) and hits it every 0.6 s for 1.8x its damage + 3% of the target's max HP (1.2% on a boss), waking it; doesn't attack you |

  Bosses get 35% of freeze / sleep and 50% of paralysis / confusion, then are immune for 4 s.
  Darkrai (491) never falls asleep ("Immune!"). A frozen or sleeping enemy can't be paralysed or
  confused; freezing ends sleep and confusion, sleep ends confusion. Moves carry `cc` (the status)
  and `ccp` (the chance per hit), the port's values: Grass Knot (sleep 6%), Thunder Shock (para
  18%), Discharge (7%), Thunderbolt (15%), Confusion (conf 14%), Psybeam (12%), Psychic (10%), Ice
  Beam (freeze 15%), Powder Snow (7%), Lick (para 20%), Night Shade (sleep 8%), Hail (freeze 12%),
  Hypnosis and Dream Eater. Every hit goes through one function, `G.Combat.land()` (projectiles,
  orbs and fields included). Hex counts these statuses too. The new-move card says the chance
  ("Can freeze (15%)."). The indicators are drawn in code, no new art: an ice block, rising
  "Z z z", yellow sparks, pink stars circling the head, a coloured patch on the ground, and a
  floating "Frozen!" / "Paralyzed!" / "Asleep!" / "Confused!" when it starts.
- **Hypnosis** (aura, radius 120, 5 damage, 30% sleep) and **Dream Eater** (aura, radius 150, 46
  damage, only hits sleeping enemies, heals 1.2% of your max HP per enemy hit, doesn't wake them)
  are new psychic moves (`js/data/moves.js`). Their icons are generated like the others
  (`G.Icons`, the psychic emblem + the aura badge); their effects come from `js/entities/vfx.js`.
- **Alternative evolutions** (`G.Moves.EVO_ALT`, port `moves_data.gd` 99-110 and `main.gd`
  1484-1532): 9 moves have a second evolution. Gust → Colossal Cyclone needs **Calibre**; Fire
  Spin, Petal Blizzard, Bulldoze, Discharge, Flamethrower, Toxic, Flame Wheel and Razor Leaf need
  the **Big Orb** item. When both evolutions of a move are ready, both gold cards come up together
  and the player picks one. A missing stat shows its card flagged "Evolves <move>". The Big Orb
  ("Colossal Orb") is an item since batch 3. The hook is `Player.hasItem('bigorb')`, which also gives x1.3 size.
  **EVO_EXTRA** (`moves_data.gd` 112-118) adds the port's extra tweaks to five normal
  evolutions: Confusion x1.6, Rock Throw x1.6 and knock 30, Shadow Ball x1.3, Fairy Wind x1.5,
  Gust x1.6.
- **Knockback by move level** (`G.Moves.KNOCK_LV` / `knockOf()`, port `moves_data.gd` 94 and
  `main.gd` 1405-1410): 20 moves push nothing at Lv1. From Lv2 they push the table's value (+50%
  for each level after that) plus their own knockback, and x1.5 once evolved. For example, Hyper
  Voice pushes 0 / 260 / 390 / 520 / 650, then 975 evolved. Beams and auras now pass their
  knockback on too, so Hydro Pump, Bulldoze and Bug Buzz push.
- **Calibre** (`js/systems/levelup.js`, port `main.gd` 143-156 and 1397-1420): a level-up stat card,
  +12% size of projectiles, orbs and areas, up to 6 times. `Player.sizeK()` = permanent upgrade
  (`perks.size`, the Caliber upgrade of batch 3, +8% a level) x 1.12^cards x Big Orb 1.3. Combat attacks
  with a scaled view of the move (`G.Combat.eff()`): the radius of auras, melee, mines, meteors,
  cones, chains, trails, beams, boomerangs and dashes; projectile / orb size; beam width. The orbit
  ring itself grows half as much.
- Every new string is in `js/data/lang-en.js`. The English is taken from the port's own
  `lang_en.json`.

**Kept as the web has them:** melee balance and the altars (owner). The port's base numbers for
the moves (it rebalanced many) are **not** taken. Only the `cc` / `ccp` fields, the two new
moves, the alternative evolutions, EVO_EXTRA and KNOCK_LV are.

**Not yet (later batches or co-op):** the port's status traps (freeze / shock / sleep / confuse
pads that also hit you) and the ability / Z-move sources of these statuses come with those
batches. In online co-op (batch 12b), a partner's statuses on the host's enemies, and a
partner's alternative evolution in the ghost replay, are not synced.

### Batch 2: Abilities

Every Pokémon has one **passive ability** (`js/systems/abilities.js`, `G.Abilities`; port
`abilities.gd` and its hooks in `main.gd`). There are 54 abilities. The per-dex table is the
port's own: all 966 Pokémon are listed, plus the 17 of batch B1, and the port's fallback (Protean) is never needed. The
numbers are the port's:

| Family | Abilities | Effect |
|---|---|---|
| Pinch | Blaze, Overgrow, Torrent, Swarm | below 40% HP, moves of that type deal +35% |
| Flat damage | Huge Power ("Power") +25%, Guts +12% (and 4% less taken), Technician +10%, Protean +8% (and +4% speed), Mold Breaker +6% (and +10% vs bosses) | multiplies attack |
| By move | Iron Fist (melee), Mega Launcher (projectile / beam / boomerang / cone / chain / meteor) +20%; Adaptability +20% with your own types; Drought (fire), Drizzle (water), Snow Warning (ice), Sand Stream (rock + ground) +15% | multiplies the hit |
| Hits | Tinted Lens: not-very-effective hits +40% · Moxie: +2% damage per 40 kills this run, max +20% · Defiant ("Competitive"): +15% damage for 4 s after you are hit | |
| Speed | Speed Boost ("Haste") +12%, Run Away +8% (and +5% XP); Swift Swim (rain), Chlorophyll (sun), Sand Rush (sand), Slush Rush (snow) +30% in that weather once it is past half strength | |
| Economy | Early Bird +12% XP, Pickup +20% coins at the end, Lucky +8% crit and +10% coins, Compound Eyes +10% crit, Magnet Pull ("Magnet") +40% magnet, Prankster -10% cooldown, Regenerator ("Regen") 1% max HP per second | |
| Defence | Intimidate 10%, Battle Armor 8%, Fur Coat 12%, Wonder Guard 35% less damage (added to defence, still capped at 80%); Thick Fat halves fire + ice; Water Absorb, Volt Absorb, Flash Fire, Sap Sipper halve their type; Solid Rock: super-effective hits -25%; Multiscale: the first hit every 25 s does half | |
| Sturdy | a hit that would KO you leaves 1 HP and 1.2 s of invulnerability, once every 90 s (after Focus Sash, as in the port) | |
| Contact | when an enemy touches you: Static 25% paralysis, Flame Body 25% burn (1 stack), Poison Point 25% poison (1 stack), Cute Charm 25% confusion, Effect Spore 20% sleep (through `G.Status`); Rough Skin hurts the attacker 12 + 3 x level | |
| Immunities | Levitate: map traps don't affect you · Sand Veil, Sand Rush, Slush Rush, Sand Stream: no weather damage · Inner Focus (sleep, confusion) and Limber (paralysis, freeze): status immunity | |

Where it plugs in: `Player` (`atk`, `spd`, `reduction`, `regen`, `hurt()` for the incoming
side and Sturdy, `update()` for the clocks); `G.Combat.land()` (every hit of yours, with the move
kind carried by projectiles and orbs as `mkind`); the contact loop in `G.Combat.resolve()`;
`G.Weather` (the chip damage; `level()` is exported now); and `G.Interact.trapEffect`. Cooldown,
magnet, XP, coins and crit are multiplied in once by `G.Abilities.set(pl, id)`, which also undoes
the previous ability. That is the call team mode (batch 7) will make when it swaps the active
Pokémon. The Sturdy and Multiscale clocks belong to the player, as in the port.

**Shown:** a gold chip "✦ Blaze" at the start of the HUD's buff row. It lights up while the
ability is acting (low HP for the pinch ones, Defiant, the weather boost, Sturdy or Multiscale
ready), shows the recharge ("62s") or Moxie's bonus ("+6%"), and tapping or clicking it shows
what it does. It also appears in the Pokédex detail (under the stats), the main-menu partner card
(the description is the tooltip), the personality result, the starter choice and the pause screen.
The English is the port's `lang_en.json`, so some names differ from the games: Power, Regen,
Haste, Magnet, Lucky, Competitive, Snowfall. The design wiki lists the abilities and gives each
Pokémon's ability (`tools/micasurvivor/gen_designwiki.mjs`).

**Approximations and hooks:**
- Inner Focus and Limber only matter against the port's status traps that hit the player
  (sleep / confusion / paralysis / freeze pads). Those are not ported yet. `G.Abilities.statusImmune(pl,
  kind)` is ready for them, and the test checks it.
- The port's Safety Goggles and Heavy-Duty Boots items (same immunities as Sand Veil and Levitate)
  came with batch 3: `trapImmune()` / `weatherImmune()` check them too.
- The web slows non-ice Pokémon in snow. The port has no such slow for the player, so Slush Rush
  and Sand Veil don't remove it, as in the port.
- In online co-op (batch 12b) each player's ability applies on their own machine. A partner
  copy has its ability set, but its stats come over the network.

### Batch 3: Items and upgrades

**15 new held items** (`js/data/items.js`, port `types_data.gd` ITEMS and their hooks in
`main.gd`), 26 in all, in the port's order. They drop where the web's items always did (bosses
always, locked chests 50%, plain chests 8%). As in the port, every item has the same chance,
you never roll one you already hold, and the species-locked ones only drop for the Pokémon that
can use them (`G.Items.roll()` / `okFor()`). The icons are the port's pixel art, copied as-is
from `data/icons.json` "ui" (the Colossal Orb from `icons.gd` EXTRA) into `G.Icons.UI`.

| Item | Effect | Where it plugs in |
|---|---|---|
| Never-Melt Ice | an enemy that hits you is 30% slower for 2 s | the contact loop in `G.Combat.resolve()` |
| Scope Lens | +15% critical hit chance | `critChance`, on equip / unequip |
| Expert Belt | super-effective hits x1.25 | `G.Items.outK()` in `G.Combat.land()` |
| Wide Lens | x1.2 radius (and reach) of every move | `G.Combat.eff()` |
| Colossal Orb (Big Orb) | x1.3 size; enables the 8 Big Orb alternative evolutions of batch 1 | `Player.sizeK()`, `hasItem('bigorb')` |
| Type Gem | x1.2 with moves of your Pokémon's types | `outK()` |
| Sitrus Berry | when a hit leaves you below 50%, heal 30% of max HP, once every 90 s | `Player.hurt()` |
| Heavy-Duty Boots | map traps don't affect you | `G.Abilities.trapImmune()` |
| Safety Goggles | no sandstorm / snow damage | `G.Abilities.weatherImmune()` |
| Weakness Policy | a super-effective hit on you gives x1.5 attack for 8 s | `Player.hurt()`, `Player.atk` |
| Rare Candy | +1 level at once (its level-up cards come up); takes no slot | `offerItem()` in `game.js` |
| Pure Incense | 25% fewer enemies (x0.75 spawn rate), each with x1.3 HP and x1.5 XP; coins picked up x1.25 | `G.Spawner`, coin pickup |
| Light Ball | Pichu, Pikachu, Raichu only: Electric x2 | `outK()`; drops only for them |
| Thick Club | Cubone, Marowak only: Ground x1.5 | `outK()`; drops only for them |
| Silver Powder | Bug moves x1.2 | `outK()` |

**Carry two** (`Player.item2`, `itemSlots()`, `items()`, `equip(id, slot)`; port `main.gd`
5754-5793): with the Backpack upgrade you hold two items. A new one goes into a free slot by
itself. With both full, the item screen shows three cards: replace slot 1, replace slot 2, or keep
both (keys 1-3, or the pad). Without the Backpack it is the web's two-card choice as before.
`hasItem()` checks both slots. The HUD stacks the second slot above the first, each with its name.
The Tower's "Double baggage" pact (batch 8) only has to set `Player.bagPact = true`.

**4 new permanent upgrades** (`js/data/upgrades.js`, port `save_data.gd` UPGRADES / perks), each
bought per Pokémon like the others:

| Upgrade | Levels | Cost per level | Effect |
|---|---|---|---|
| Caliber | 6 | 80 · 110 · 160 · 220 · 310 · 430 | +8% size per level (`perks.size` -> `Player.sizePerk`, the permanent half of `sizeK()`) |
| TM | 1 | 2000 | choose your starting move: "Choose" opens the editor under the row (port `menu.gd` `_tm_panel`). The pool is the Pokémon's types plus Normal, without support moves (Mew: every move). Changing it is free. The pick leaves the ban list (`G.tmPool`, `G.tmPick`, `G.tmSet` in `js/data/starters.js`; `G.startMoveOf()` returns the pick while the TM is owned) |
| Second Chance | 2 | 2500 · 5000 | a heart per level: a lethal hit spends one and you revive with full HP, 2.5 s invulnerable, and every enemy within 260 is knocked away (500). It comes after Focus Sash and Sturdy. The hearts show next to the HP bar |
| Backpack | 1 | 7500 | two item slots (above) |

The web's **free card reroll** stays (the port has none). The TM editor is plain buttons in the
upgrades screen, so the pad's focus navigation reaches it. While doing this, `G.Pad`'s D-pad
navigation got a 2:1 cone: going right from a wide price button no longer jumps to the row above.

**Saved and merged:** levels go in `save.pupg[dex]`, as before. `G.DB.merge()` keeps the max of
every level, so new ids need nothing extra, and `sanitize()` clamps a hand-edited level to the
max. The TM pick is `save.ptm[dex]` (a move id; sanitized). On merge the newer save's pick wins,
and Pokémon it has no pick for take the other save's. The "Item collector" achievement now asks
for all 26 items, as the port's does.

**Approximations:**
- **Rare Candy** is used the moment you pick it up. The port shows it as an item card (take or
  keep yours). The item's own text says "Gain 1 level when you take it (doesn't use a slot)", and
  turning a free level down makes no sense.
- **Drop places and rates** stay the web's. The port also rebalanced its chests (16% item chance,
  guaranteed when you hold none) and enemies (1.5% item drop). That is a separate balance change,
  like the altars and melee balance the owner kept.
- **Bug fix found by the tests:** Focus Sash's clock started at -999 ms against
  `performance.now()`, so the Sash could not save you during the first minute after the page
  loaded. It starts at -Infinity now (regression test in the items suite).
- In online co-op (batch 12b) items stay per player, as before. Pure Incense reads the host's
  items.

### Batch 4: Z-moves

One **Z-move** per type (18), each with its own choreography (`js/systems/zmoves.js`, `G.ZMoves`;
port `zmove.gd`, `main.gd` 171-182 / 1226-1322 / 8504-8594, `save_data.gd` 250-266 / 479-551,
`progress.gd` 233-289, `menu.gd`). The numbers are the port's.

| Rule | Value |
|---|---|
| Usable from | level 15 |
| Cooldown | 240 s, counted after the move **ends** (so not during the cinematic or the move) |
| Cinematic | 2.2 s: the world and the run clock stop, the screen dims, a banner opens with rotating rays, speed lines, the type's Z-crystal and the name falling letter by letter (white flash on the first letter; a third of it with "Fewer flashes") |
| Invulnerable | the whole time (the cinematic, then 0.3 s renewed every frame of the move; lava and "pure" damage too) |
| Damage | (100 + 24 x level) x attack, times each hit's factor; every hit goes through `G.Combat.land()` (type chart, crit, ability, items) |
| Bosses | one Z takes at most 28 % of a boss's max HP in total (counted after every multiplier: `enemy.hpFloor` during the hit). A boss with less than 28 % left can still fall |
| Not allowed | the Tower (`G.Game.mode === 'tower'`, the flag batch 8 sets), a rift arena (`G.Rift.inArena`), the Judgment of Arceus (`G.Judgment.active`) |

The 18 plans, as in `zmove.gd`: Starlight Dash (three dashes, then a blast), Pyrotechnic Holocaust
(a crown of 24 will-o'-wisps drawn in code, each launched at an enemy), Abyssal Hydro Vortex
(pulls everything in, a final wave), Gigavolt Storm (three chains of up to 14 bolts that
paralyse), Cataclysmic Bloom (roots: slow, squeeze, bloom and heal 2 % per enemy, max 25 %),
Absolute Zero (freeze all, then shatter), Total Crush (22 blows on the strongest enemy, then an
uppercut), Acid Deluge (9 acid pools that poison), Tectonic Fury (three waves of 5 cracks), Supersonic
Dive (vanish, dive on the densest group), Shattered Mind (6 waves of confusion), Devastating
Plague (16 bugs hunting on their own, poison + slow), Continental Avalanche (two rock walls across
the screen), Eternal Nightmare (8 drains: 22 % + 7 % of the enemy's HP, heal up to 18 %),
Draconic Cataclysm (4 spinning dragon beams), Abyssal Eclipse (a shrinking dark ring, then an
implosion), Metal Drill (a 900-unit drill dash, then an explosion) and Dreamy Flash (sleep all,
heal over time, then eat their dreams). The effects use the shapes of `js/entities/vfx.js`, the
sounds `legend` (start) and `bossDown` (the move).

**Unlocking** a type's Z (any of):
- **250 defeated** of that type (`stats.tk_<type>` from batch 1);
- its **Z-crystal mission** (18, port `progress.gd` ZMIS, 500 coins each, checked with the
  achievements): defeat 1,500 Pokémon (normal), survive 8 min (fire), play 15 runs (water), reach
  level 25 (electric), open 25 chests (grass; `stats.chests` is new and counts every chest), 30
  gacha pulls (ice), 10 bosses (fighting), evolve 10 moves (poison), own 30 Pokémon (ground),
  find 10 items (psychic), win 5 rift fights (ghost), survive 12 min (dragon), 3 legendaries
  (dark). Five read stats that later batches write: 5 Daily Challenges (flying, batch 6), 4 Boss
  Rush bosses (bug, batch 8), Tower floor 8 (rock, batch 8), 8 min of Type Survival (steel,
  batch 6), 8 min of Team Mode (fairy, batch 7). Until then those unlock by kills or the gacha;
- a **Z-crystal from the gacha**: each x10 pull has a 3 % chance to give the crystal of a type
  still locked (never on x1, nothing once all 18 are unlocked). The pull result shows it, and the
  gacha's rates panel shows the 18 crystals (locked ones dimmed).

The **Z type follows the active Pokémon**: it is read from `pl.dex` when you use it (the port fixed
it at the start of the run). Team mode (batch 7) only has to change the active Pokémon. A Pokémon
with two unlocked types uses the first, or the one chosen in its **Pokédex** entry (a button per
type, focus-navigable). Missions has a new **Z-Crystals** tab with the 18 missions, their
progress and the kills of each type.

**Input:** the Z key, the round **HUD button** (bottom right; click or tap it; it pulses when
ready, shows "Lv. 15", the cooldown "3:58" or "Not here", and the Z key or the pad's zmove glyph
in its corner), and the controller's `zmove` action (above).

**Saved and merged:** crystals are `stats.zcr_<type> = 1` (as in the port), so the merge's max of
every stat makes them a union, like the kills. Completed missions are `save.zmis[id]` (union).
The per-Pokémon choice is `save.pz[dex] = { type, at }`: on merge (`G.DB.merge()`, used by the
account's 409 path and the guest carry-over) the choice with the latest `at` wins for each
Pokémon, whichever save is newer. `sanitize()` drops bad types, unknown Pokémon and bad mission
keys. The carry-over text now lists Z-moves among what is merged.

**Deviations, and why:**
- The **Z type is read at use time** (the port's bug: it was fixed once per run).
- The Z button is shown **greyed in a rift arena / the Judgment** ("Not here"); the port showed it
  ready but did nothing. In the Tower it is hidden, as in the port.
- The Pokédex shows **one button per unlocked type** instead of the port's single "Switch Z-Move"
  button that cycles.
- The **boss cap** clamps the HP during the hit (`hpFloor`) instead of refunding the excess
  afterwards: the port's refund came after the death check, so a capped hit could still kill.
- The steel and flying final bursts start where you land, not at the starting point (a visual fix).
- Screen shake uses the web's camera (port shake / 7, x0.25 with "Fewer shakes").
- The HUD button has a fixed place (it is not in the touch layout editor yet).
- In online co-op (batch 12b) a guest's Z hits the host's enemies through the usual hit
  forwarding; the boss cap and the statuses are only enforced on the host's own enemies.
- The HUD level label: "Nv. {x}" now has an English pattern, so the HUD level reads
  "Lv. 20" in English (it used to stay "Nv.").

### Batch 5: Dynamax and raid dens

**Dynamax** (`js/systems/dynamax.js`, `G.Dynamax`; port `dynamax.gd` whole, `main.gd` 183-189 /
383-385 / 1226-1281 / 4216 / 4263 / 5867-5870 / 5903-5936 / 5990-5996 / 6037-6051 / 6189-6221, HUD
`draw_dyn` 8430-8503). The numbers are the port's.

| Rule | Value |
|---|---|
| Unlock | clear one **raid den** (`stats.dens >= 1`, plus `stats.dynamax = 1`) |
| Usable from | level 20 |
| Lasts | 60 s; then a 240 s cooldown (counted only after it ends). Every den cleared recharges it at once (the port's "Dynamax Candy") |
| Stats | +30 % to all: damage x1.3, speed x1.3, cooldowns /1.3, 23.08 % less damage taken (`pl.dyn`, read live in the `Player` getters, so the end reverts exactly; `cdMul` is now a getter over `_cdMul`) |
| HP | max HP +30 % (rounded), current HP up by the same; at the end the bonus goes and HP keeps its proportion (never below 1) |
| Size | the sprite (and shadow and aura) grows in Super Mario Bros DS steps 1.22x1.0, 1.04, 1.42x1.3, 1.16x1.2, 1.792, 1.6 (0.9 s, a flash + sound + ring on three of them); shrinks back in 0.35 s. Hit radius unchanged, as in the port |
| Max waves | every 1.5 s (the first at 0.6 s): (30 + 8 x level) x attack, radius 280; every 3rd radius 420, x1.9 and a ring of stars. Through `G.Combat.land()` via the Z-move helpers (`G.ZMoves.area`), with the type's status from the port's STATUS table: electric paralyses, ice freezes, ghost sleeps, psychic / fairy confuse, poison / grass poison, water / bug / ground slow 40 / 35 / 30 % |
| Not allowed | the Tower (`G.Game.mode === 'tower'`), the Judgment of Arceus, during a Z-move cinematic. **Allowed in rift and den arenas** (the port's `_dyn_can` does not block them, unlike the Z-move) |
| Ends early | when you fall; `G.Dynamax.stop(pl)` is the hook team mode (batch 7) calls on a swap |

On screen: a red aura drawn in code (light puddle, glow, spiralling red / violet mist, sparks), a
pulsing red border, a time bar "DYNAMAX 42 s", and the "DYNAMAX" banner whose letters drop and
bounce in (with a pink flash; a third of it with "Fewer flashes").

**Raid dens** (`js/systems/rift.js` + `dynamax.js`): from 120 s into a run, every 30 s rift check
has a 5 % chance to open a **den** instead of a rift (not in Rift Time Attack: `G.Game.mode ===
'rifts'`, batch 6; it does not touch the rift miss streak). A den stays open 30 s and is drawn in
code: a rocky crater with seven red crystals and a pulsing energy pit, and a red light pillar with
rising rings and sparks (additive, above everything). The notice, the arrow and the label turn red
("A DYNAMAX DEN HAS OPENED!", "DEN · 12 m · 30 s"). Inside waits a **normal Pokémon of the current
tier** (any candidate of that tier's BST band, not just the run's cast), in the arena of one of its
types: HP 2400 + 8 x t (scaled in co-op like the legendary), XP 380 + t, drawn 1.5x (sprite and
height) with the red aura and a red tint, and 28 % of its attacks become its **Max Move** (two
warned rings of explosions: 1 + 6 + 9 zones). Winning gives **12 big XP orbs (380 + t), 2 items,
2 tickets, 120 coins (12 x 10) and a heal**, all pulled to you, recharges Dynamax and counts
`stats.dens`; the first time it says "You unlocked Dynamax! MAX button, C key or left trigger
(from level 20)". A den is not a legendary (no `legends` entry), a rift win or a bond.

**Input:** the C key, the round **MAX button** above the Z button (click or tap; it pulses when
ready, shows "Lv. 20", the cooldown or "Not here", and the C key or the pad's glyph in its
corner; hidden until unlocked, in the Tower and while active), and the pad's `dynamax` action
(View / Share / − by default; plus the left trigger and the left face button when unbound).
Missions → **Z-Crystals** starts with a **Dynamax** card (unlocked or "Clear a Dynamax den: 0/1",
the rules, dens cleared).

**Saved and merged:** `stats.dens` and `stats.dynamax` ride on the merge's max of every stat, so
an account never loses the unlock (a newer save from another device without it merges it back).
No port mission or achievement reads the den count (`progress.gd` has none; the port only shows
it in its encyclopedia, batch 11), so nothing else changed there.

**Deviations, and why:**
- The time bar sits above the move bar, not at the top (the web HUD has the clock, the event line
  and the boss bar there).
- The MAX button shows greyed "Lv. 20" below level 20 (the port hid it, although its draw code
  has that state); the same for "Not here" in the Judgment.
- The den boss's red tint is a translucent red wash over the sprite (canvas has no `modulate`).
- The arena's normal boss scale (`bossScale`) applies before the x1.5, as the port's boss scaling does.
- Online co-op (batch 12b): the host decides dens (`'rift'` carries a den flag, the arena cfg
  `den: true`), each player's save counts the den, only the host drops the reward; a partner's
  Dynamax is not mirrored on other screens yet.

### Batch 6: Quick modes, modifiers and the card ban

**Game modes** (`js/systems/modes.js`, `G.Modes`; the screen `js/ui/modes-ui.js`, `G.ModesUI`; port
`menu.gd` 1496-1675, `save_data.gd` 16-22 / 556-572, `main.gd` 262 / 339-357 / 426-449 / 782-860 /
966-983 / 1063 / 1861 / 2859-2998 / 3146-3152 / 3261 / 5862-5871 / 6266 / 8701-8705). The menu's
**Game modes** entry (under Play; mouse, touch and pad) opens "Choose a mode": one card per mode,
"Choose the party Pokémon", "Change type" and the six modifier switches, in the port's wording.
Play still starts a Normal run in one tap. `G.Game.mode` is the run's mode. The numbers are the port's.

| Mode | Rules |
|---|---|
| Normal run | as before, with the chosen modifiers |
| Daily Challenge | the seed is the date (`YYYYMMDD`): the Pokémon (`pool[(sd x 7919 + 13) % n]`, non-legendary, owned or not), the rule (`MOD_IDS[(sd x 31 + 7) % 6]`, the only modifier) and, through a seeded `Math.random` while the run is set up, the map, the enemy cast, the bosses and the starting moves. Coins x1.25 (chosen modifiers not added). `save.daily = { date, best }`: the best time of the day, replayable |
| Party Mode | any Pokémon (Pikachu by default; the picker lists every Pokémon), cannot die (a lethal hit leaves 1 HP), saves nothing: no coins, stats, records, kills per type, missions, achievements, Z-crystal missions, tickets, shinies, rescues, dens or ranking (`G.Progress.off`, the port's `PG.off`) |
| Rift Time Attack | 8:00 counting down (red under 30 s, "Rifts won: N" below): the first rift check at 20 s, then every 8 s (6 s after a fight), each opens a rift (if no boss is alive), none in the last 40 s, no dens. Time's up only outside an arena. Coins +0.25; `stats.riftsBest` / `riftsRuns` |
| Survival by Type | only the chosen type: the enemy cast (each tier's candidates, if it has any), the 5 bosses (their band, then 580+, then any of the type) and the raid dens. Coins +0.5. 10 minutes marks the type beaten (`save.typeDone`); `typeRuns`, `typeBestMin` |

**Modifiers** (every mode but Daily and Party; +0.25 coins each): Fast (enemies x1.4 speed, bosses
x1.15), Horde (spawn rate x1.8), Tough (x1.6 HP), Heavy hitters (x1.5 damage), Fragile (your max HP
halved at the start), No healing (HP never goes up except by what a max-HP gain adds; the port's
per-frame clamp). The enemy ones apply in `G.EnemyMgr.add` to every enemy (waves, bosses,
legendaries, dens; once, even across an arena's stash and restore). Ending a run: coins = base x
(1 + 0.25 per modifier, or 1.25 in the Daily) x your multiplier, + 0.5 (Type) or + 0.25 (Rifts);
`stats.mn1..mn6` and `mb_<mod>` keep the best minutes.

**Achievements:** a "Game modes" category with the port's 20 for these modes (`progress.gd`
107-134: daily x5, modifiers x7, type x4, rifts x4), same goals, rewards and titles. The Z-crystal
missions that read `dailyPlays` (Flying) and `typeBestMin` (Steel) now progress.

**The level-up card ban** (`js/ui/run-ui.js`; port `main_e16.gd` 197 and the `Cards` class,
`main.gd` 7484-7670): the **Ban (N)** button next to Reroll (the B key, a click / tap, or the pad's
new `ban` action). N = the Ban upgrade's level (0-3) per run. Ban mode turns the button red, hides
Reroll and says "Pick a new move to ban it"; only new-move cards can be banned (the others dim).
The banned move joins `pl.banned` and never shows up again in the run; three fresh cards are dealt,
free (no reroll used). Hidden with no bans left.

**Controller:** the `ban` action (X / Square / Y on every layout, pad.gd `JOY_BUTTON_X`), remappable
in Settings > Controls. In a run it fires Dynamax, the way reroll fires the Z-move (the port's X =
Dynamax unless the cards are open). A map saved before batch 6 gains `ban` (X, or the first free
button); missing actions are now filled in the order they arrived (zmove, dynamax, ban).

**Saved and merged:** records are stats (the merge keeps the max of each); `save.daily` merges by
date (the newer date wins; the same date keeps the better time); `save.typeDone` is a union;
`save.modes` (modifiers, type, party Pokémon) follows the newer save. All three are sanitized.

**Deviations, and why:**
- Play still starts a Normal run; the modes are a separate **Game modes** menu entry (in the port
  Play opens the list). One tap to play stays, and the existing flows and tests are unchanged.
- Only this batch's modes are on the screen; Boss Rush and the Tower (batch 8), Team mode (batch 7)
  and the local co-op partner (batch 12) come with their batches. Online co-op runs stay Normal
  without modifiers.
- The ban count: the port's last version made the in-run ban dead code (`bans = 0`) and kept only
  the pre-run Veto list; earlier builds (`main_e16.gd`) gave Veto-level bans per run. The owner asked
  for the in-run ban, so it uses that count, and the pre-run list in Upgrades keeps working too.
- Daily determinism: the port seeds the whole run; here `Math.random` is seeded only while the run
  is set up (map, cast, bosses, moves), as the frame timing makes the rest differ anyway.
- Party saves nothing at all; the port still counted a won legendary or a den during it.
- Leaderboards (ours and Magepunk's) only take Normal runs with no modifiers on: the other modes and
  the modifiers change the rules, and Party never ends. (Until the base-board fix a Normal run with
  modifiers still ranked; the personal `mn` / `mb_` records and "New time record!" are unaffected.)
- The HUD shows the mode and the modifier icons at the top right (the port shows none).
- The run summary's "recogidas" and "Nv.3" were left in Spanish in English; translated now.

### Batch 7: Team mode

**Team mode** (`js/systems/team.js`, `G.Team`; port `save_data.gd` 21 / 189-203, `menu.gd` 1640-1657 /
2158-2174, `main.gd` 265-269 / 436-438 / 498 / 642 / 667-668 / 704-705 / 806-807 / 844-846 / 1055 /
1425-1428 / 1733-1804 / 1885-1902 / 8359-8396 / 8815-8863, `pad.gd` 17 / 42, `progress.gd` 129-131 /
253 / 316 / 330). A **Team Mode** card on "Choose a mode" (mouse, touch and pad), in the port's words,
names the team; **Choose team (up to 3)** opens a picker of your own Pokémon (by generation). The
numbers are the port's.

| Rule | Port |
|---|---|
| Who | up to 3 of your Pokémon; locked below 2 ("You need at least 2 Pokémon to form a team.", the card only says "Get another Pokémon first") |
| Picking | opening the picker clears the team; a tap adds (or removes) one, numbered; the third closes it ("Team ready!") |
| Filling (`team_list`) | the picked ones you still own (no repeats, 3 at most); if none, your partner; then the first Pokémon you got (`owned[].at`) up to 3. Saved as `save.modes.team` |
| The run | the first one starts; its upgrades, Veto list, slot binds and starting move are the run's. Each member's HP = its species' base + the Vitality upgrade (halved by Fragile) |
| Swapping | Tab, the pad's `swap` (R3), the round swap button (left of the Z button) or a tap / click on a team card; to the next one standing (or that card). 3 s between swaps; not on the cards, while paused or during the Z-move |
| On a swap | the old one keeps its HP on the bench; max-HP gains are the team's (max HP = base + that gain); the new one comes in with its own HP, 1 s invulnerable, a 0.5 flash, the gold ring (8 to 150 in 0.5 s), "Go, X!" |
| Per member / shared | species, sprite, types, speed, attack and passive ability are the active one's; level, XP, moves, items, buffs, Second Chance hearts and the Z-move (one per run) are the team's. A swap ends Dynamax (`G.Dynamax.stop`, its 240 s cooldown starts) and restarts No healing from the new HP |
| The bench | recovers 1.2 % of its base HP a second (up to the base), like the cooldown, whenever the game is not paused |
| Fainting | Focus Sash, Sturdy and a Second Chance heart come first; then the next one comes in at once (no cooldown wait, 1.5 s invulnerable) and the fallen card shows KO. Nobody left: the run ends |

**Other modes:** modifiers apply (+0.25 coins each, no extra for the mode, the `mn` / `mb_` records
count); Daily, Party and Survival by Type are other modes; online co-op runs stay Normal; leaderboards
only take Normal runs with no modifiers.

**HUD:** the team cards under your HP (name, HP, bar; gold border on the active one, dimmed during the
cooldown, KO when down) and the round swap button with the next one's name, a red cooldown arc, and
the Tab key or the pad's glyph. The controls hint adds "Tab switch Pokémon" / "tap a card to switch
Pokémon" / the swap glyph.

**Controller:** the `swap` action, R3 / RS on every layout (`pad.gd` `JOY_BUTTON_RIGHT_STICK`),
remappable; no other action used that button. A map saved before batch 7 gains `swap` (R3, or the first
free button).

**Achievements and missions** (`progress.gd`): Better together (1 team run: 150 coins, 2 tickets),
Perfect relay (10 minutes: 1500 coins, a x10 ticket), Team leader (20 minutes: 3500 coins, 2 tickets, 2
x10 tickets, the title); the daily mission "Survive 5 / 8 minutes in Team Mode" and the weekly one (10 /
15 minutes), counting only team runs (`runEnd` now carries `mode` and `nmods`); the Fairy Z-crystal
mission (8 minutes) now progresses. `stats.teamRuns` / `teamBestMin` merge by max on a 409; the picked
team follows the newer save and is sanitized.

**Deviations, and why:**
- The port's `_swap_team` calls `_dyn_stop()` before checking the cooldown and the target, so pressing
  swap during the cooldown ended Dynamax without swapping. Here Dynamax ends only when a swap happens.
- The team cards sit under your HP on the left (the port: top right) and the swap button left of the
  Z button (the port: a 120 px button bottom right): the web's right column already holds the weather,
  the mode tag and the Z / MAX buttons. The cards also show the HP numbers and "KO".
- Tab: the web used Tab for "next move" (as E). In a team run Tab swaps, like the port; otherwise it
  still cycles moves (E always does).
- Upgrades are per Pokémon on the web (the port's are global), so the leader's apply to the run,
  including every member's Vitality HP.
- The Z-move's type follows the active Pokémon (batch 4's choice; the port fixed it at the start).
- Shiny: the web's single "play shiny" switch applies to each member whose shiny you own.
- The picker is a grid of your Pokémon by generation (the port reused the Pokédex filtered to owned).

### Batch 8: Boss Rush and the Floor Tower

**Boss Rush** (`js/systems/bossrush.js`, `G.BossRush`; port `main.gd` 339-343 / 441-445 / 577 / 795-798 /
847-849 / 1007 / 2931-2955 / 3249-3251 / 3598-3611 / 4705 / 5288-5320 / 5863, `menu.gd` 1571-1572,
`progress.gd` 113-117 / 247 / 313 / 328) and the **Floor Tower** (`js/systems/tower.js`, `G.Tower`, with its
rest / pact picker in `js/ui/tower-ui.js`; port `main.gd` 117-139 / 203-261 / 451-466 / 808-815 / 842-843 /
1035-1067 / 1143-1158 / 1348-1381 / 1834-1848 / 3154-3164 / 3189-3192 / 3286-3611 / 4174-4183 / 4493-4498 /
4706 / 5260 / 5371 / 8711-8720, `save_data.gd` 206-213, `menu.gd` 1601-1625, `progress.gd` 136-142 / 248 /
317 / 331). Both are cards on "Choose a mode", in the port's menu order (Normal, Daily, Boss Rush, Party,
Floor Tower, Rift Time Attack, Survival by Type, Team), by mouse, touch and pad. Neither has an unlock
(as in the port). The numbers are the port's.

| Boss Rush | Port |
|---|---|
| Flow | only bosses: the first at 5 s ("Boss Rush! Get ready…" in the last 4 s), each next one 8 s after the last falls ("Boss N: name"). No waves, surges, events, rifts, dens or Judgment |
| Order | boss i (0-based): a legendary when i % 3 == 2 (any with sprites); else a non-legendary with base stat total in [lo, lo + 110], lo = min(640, 490 + 14 i) (fallback: any non-legendary of 480+) |
| Scaling | HP 1400 x 1.27^i x 1.35, damage min(150, 34 + 5 i) x 1.2, shots 0.55 of that every 1.1 s (range 260), speed 40 + base speed / 2 (40-100); created as at second 60 i (HP and damage x (1 + 60 i / 600)); XP = your level's x 1.25 |
| Between fights | each boss leaves its XP, coins and an item, plus a heal berry (30 % HP) and a magnet |
| World | a random starting biome, then a new one every 150 s; never the Judgment ruins (`G.Tiles.CYCLE`) |
| End | only by falling. Record = bosses beaten (`stats.rushBest`, "New record!"); `stats.rushRuns` |

| Floor Tower | Port |
|---|---|
| Floors | 30. Each: waves for 50 s (the HUD: "Floor N / 30 · Boss in Xs", then "Boss!", "Pacts: N", "Thirst for victory +x%"), then its fixed boss ("Floor N: name"); beating it clears the floor and clears the floor's enemies. One biome per floor (`G.Tower.biomeOf`), never the Judgment ruins |
| Bosses | fixed per floor (seeded 7919 f + 31): a legendary every 5 floors, Eternatus on 25, Arceus on 30. HP 900 x 1.2^(min(f,15)-1) x 1.07^(f-15) x (1.8 + 3.2 clamp((f-5)/25)) x 1.35; damage min(120, 26 + 4.5 f) x 1.2; created at t = 15 f. Arceus has floor 30's HP plus floor 25's, x 1.25, and a last breath at 25 % (x1.1 speed, a wave of up to 14). From floor 11 the boss brings 3 + (f-10)/2 escorts |
| Scaling | difficulty time 20 + 42 (f-1) + 14 max(0, f-10) + floor time; enemies x1.15 HP, x1.12 damage, x1.12 spawns (x1.06 more per floor past 10), x1.02 speed per floor past 10 (half for bosses); bosses x1.2 HP; surges from floor 11 (every max(16, 46 - 1.5 (f-10)) s, 8 + (f-10) enemies; during the boss too from 21); the cap +2 per floor past 20 (up to +20); XP x0.65 |
| Adaptive | every 2 s: run upgrades (stat cards + move levels) and the Pokémon's permanent upgrades raise new enemies' HP (+1 % / +0.4 % each, up to x2; bosses up to x1.5) and damage (+0.4 % / +0.2 %, up to +40 %) |
| Rest | after each floor: Rest (heal 40 % of max HP; 25 % from floor 22), Training (an extra level-up card) or Shield (35 % of max HP absorbs the next floor's damage) |
| Pacts | then three random risk cards and "No risks"; up to 6 pacts per run, each for the whole run. 1 % per screen: a golden legendary card (no cost, not counted) replaces one. The 15: Frenzy (cooldown x0.8, damage taken x1.2), Glass cannon (damage x1.2, max HP x0.85), Light feet (speed x1.2, enemies x1.1), Blood pact (+2 HP per kill, bosses hit x1.2), Forbidden knowledge (XP x1.5, enemies HP x1.2), Stone skin (damage taken x0.75, speed x0.85), Boss contract (floor coins x1.5, bosses HP x1.25), Fasting (damage x1.15, berries and rest heal x0.55), Call of the horde (damage x1.12, XP x1.2, spawns x1.3), Quick hands (cooldown x0.7, damage x0.9), Charged blows (damage x1.22, cooldown x1.2), Overclock (cooldown x0.75, max HP x0.9), Frantic rhythm (cooldown x0.8, spawns x1.15), Slow burn (cooldown x1.15, damage taken x0.75, +1 HP/s), Blind fury (cooldown x0.85, damage x1.1, damage taken x1.1). Legendary: Time mastery (cooldown x0.3), Double baggage (2 item slots + an item now), Thirst for victory (+0.30 % damage per kill), Legendary armor (+60 % defense) |
| Rewards | first clear of floor f: 120 + 40 f coins, 1 + f/5 tickets, and f/5 x10 tickets every 5 floors; a repeat clear 40 + 10 f coins (both x the coins pacts). Floors 10 and 20: an attack bond |
| Relics | one per floor multiple of 5 ever cleared (up to 6): +6 max HP and +2 % attack each, inside the Tower; shown on the card ("Relics: N / 6") and announced on the clear ("Tower relic!") |
| Checkpoints | floors 6 / 11 / 16 / 21 / 26 open once the floor before was cleared; "Starting floor: N" under the card cycles them (`save.modes.towerStart`). Starting there gives a free level-up card per skipped floor (level = floor) |
| End | falling ("You fell…", "Tower: floor N", the last 3 bosses' time and HP lost) or clearing floor 30 ("TOWER COMPLETE!", "Floors cleared: N"). `stats.towerRuns`; `stats.towerBest` and `stats.arceus` at each clear |
| Blocked | Z-moves and Dynamax (`G.ZMoves` / `G.Dynamax` `BLOCKED_MODES`, keyed on `G.Game.mode === 'tower'`; their HUD buttons hide) |

**Pickers:** the rest and pact cards are their own screen (`scr-tower`): a click, a tap, the 1-4 keys, or
the pad (D-pad / LB / RB walk the cards, confirm picks, cancel on the pact cards = "No risks"; the screen
is guarded against an accidental pick as it pops up). The game is paused while you choose.

**Other modes:** modifiers apply to both (+0.25 coins each, no extra for the mode, the `mn` / `mb_` records
count). Daily, Party, Survival by Type and Team are other modes (the port's single mode switch); online
co-op runs stay Normal; leaderboards only take Normal runs with no modifiers.

**Achievements and missions** (`progress.gd`): Boss warm-up / Boss barrage / Boss crusher / Rush King (3 /
6 / 10 / 15 bosses), Record hunter (25 Rushes); First floors / Climbing / Almost at the top / Climber (clear
floor 5 / 10 / 15 / 20), Master of the Tower (reach floor 30: `towerBest` 29), Arceus Conqueror, Tower
apprentice (10 Tower runs), with the port's coins, tickets and titles. Missions: "Defeat N bosses in the
Boss Rush" (2 / 4, daily), "... in a single Boss Rush run" (6 / 9, weekly), "Clear N floors of the Floor
Tower" (2 / 3, daily) and "... in a single run" (6 / 9, weekly), counting only their mode (`runEnd` now
carries `bosses` and `floor`). The Bug (4 Rush bosses) and Rock (clear floor 8) Z-crystal missions now
progress.

**Saves:** `stats.rushBest` / `rushRuns` / `towerBest` / `towerRuns` / `arceus` merge by max on a 409.
`save.tower = { claimed: { floor: date }, best, log }`: the claimed floors are a union (the earliest date;
relics and checkpoints derive from them), the best floor the max, the boss log (last 80) the newer save's.
The chosen checkpoint keeps the higher floor of the two saves, then falls back to floor 1 if it is not a
valid checkpoint; a hand-edited record is cleaned (`sanitize`).

**Deviations, and why:**
- "Relics" in the port are not picked: they are earned automatically (one per 5th floor cleared once) and
  only add HP and attack. The pickable cards are the rest cards, the risk pacts and the 4 golden legendary
  cards; all are ported as such. The task's "relic picker" is the legendary card on the pact screen.
- The fixed boss of each floor uses the web's seeded RNG (mulberry32) instead of Godot's, so the species on
  floors other than 25 and 30 differ from the Android build, but each floor is still always the same boss.
- The Boss Rush biome offset and the Tower's floor biomes run through `G.Tiles.CYCLE`: all of `G.Tiles.BIOMES`
  (3 normal + the rift themes) except the Judgment ruins, as the port's `ground.count()` does (`tileworld.gd`
  58-78 leaves "judgment" out). Before the base-board fix the web cycled through the ruins too (Tower floor 22,
  1 Rush start in 22); floors 22-30 now map one biome earlier in the cycle than they used to.
- Boss drops: the web never dropped the port's 1-in-3 x10 ticket from bosses; Rush and Tower bosses add only
  the port's heal berry and magnet, so the Rush (all bosses) does not become a ticket farm.
- Spawning uses the web's spawn curve (its `DENSITY` and HP factors) with the Tower's multipliers on top.
- The HUD line also shows the rest shield while it lasts ("Shield N"), and the floor clear waits for the
  boss to be counted (kills, boss missions, Thirst for victory) before it clears the floor's enemies.
- Port strings with two spaces ("Floor N cleared!  +X coins") use one: the web's translator joins spaces.

### Batch 9: Adaptive difficulty, biome spawns and support caps

**Adaptive difficulty** (`js/systems/adaptive.js`, `G.Adaptive`; port `main.gd` 173-177 / 992 / 1037 / 1162-1223 /
3111 / 3228 / 3262 / 3663 / 8708-8710, `menu.gd` 4144, `save_data.gd` 87). The numbers are the port's.

| Rule | Port |
|---|---|
| Where | Normal runs only, with the setting on, outside a rift arena. Not in the Daily (the same run for everyone), Party, Rift Time Attack, Survival by Type, Team, Boss Rush or the Tower (which keeps its own adaptive scaling from batch 8) |
| Power | stat cards taken + move levels (+3 per evolved move) + level / 2 |
| Base | the Pokémon's permanent upgrades (0-40) |
| Target | 0.62 + 0.38 b + (0.2 + 0.3 b) p, with b = smoothstep(upgrades / 40) and p = smoothstep(power / 70); x0.9 rising to x1 over your first 8 runs (`stats.runs`); plus the suffering adjustment; clamped 0.55-1.5 |
| Suffering | every 45 s of run time, unless a boss is alive: HP lost in the window > 50 % of max HP, or HP under 30 % -> -0.05; lost < 8 % -> +0.03; the adjustment stays in -0.2..+0.1 |
| Glide | a run starts at 100 % and moves 0.03 a second towards the target; in a rift arena it is off and resets to 100 % |
| Effect (k) | enemy and boss HP x k, their damage x k^0.7, the spawn rate x k, the horde / golden hour interval / k, the XP each level needs x k^0.8. Coins and records are unaffected. Modifiers stack on top |
| HUD | "Challenge: N%" under the clock (and the biome line): green under 100, gold at 100, orange above. The boss bar moves down a line while it shows |
| Setting | Settings > Graphics > "Adaptive difficulty" (Yes / No; mouse, touch, pad), on by default. Saved in the save as `save.modes.adaptive = false` (only "off" is stored), so it follows the account; a 409 merge keeps the newer save's choice like the other menu choices; `sanitize` drops anything but `false` |

**Biome-themed spawns** (`js/data/enemies.js`; port `main.gd` 87-104 / 3028-3106 / 3614-3624). Biome keys:
forest, cave, volcano, then each rift-arena biome's type (the Tower's later floors, Boss Rush's random start).

| Biome | Types | Its own Pokémon |
|---|---|---|
| Shady Forest | Bug, Grass | - |
| Crystal Cave | Rock, Ground | Zubat, Golbat, Crobat, Woobat, Swoobat, Noibat, Noivern |
| Ash Volcano | Fire | - |
| an arena biome | its own type | - |

The run's enemy cast members that fit the biome on screen (a type, or the biome's list) weigh x1.6 in the bag
(16 instead of 10, or 5 instead of 3 for old tiers), and each tier adds 2 extra Pokémon of the biome (its own
Pokémon first, then its types; never a support, never one already in the cast, plain attackers only in tier 0),
also x1.6, picked once per run. A tier with no candidates for the biome adds none and the bag is the cast's
(the Judgment ruins have no type, so nothing changes there). Survival by Type wins over the biome (no biome
weighting at all, only the chosen type). The Tower's waves use each floor's biome; Boss Rush has no waves. The
current and the next biome's extras are preloaded. The biome weather now uses `BIOME_W[min(biome, 2)]` like the
port (arena biomes take the volcano's weather; they used to wrap to the forest's / cave's).

**Support caps** (`js/entities/enemy.js`, the numbers in `G.Enemies.SUPPORT_CAPS`; port `main.gd` 4026-4102 /
3876-3881):
- Healers: with more than 4 healers alive each heal is x0.9.
- Shielders: every 8 s (was 6) shield up to 5 (was 6) of the nearest foes within 160 px, itself included, for 30 %
  of their max HP (was 35 %) for 7 s (was 8); a foe that got a shield cannot get another for 14 s (new: no endless
  shields), and one already shielded is skipped.
- Summoners: 4 per summon (was 2); no summon with 8 of its own alive (was 4) or 20 summoned Pokémon on the map
  (new; a summon never takes the map past 20), or with more than CAP + 15 enemies out.
- One support per tier in the cast (as before), none in the biome extras or the hordes.

**Deviations, and why:**
- Online co-op runs (still "coming soon") get no adaptive difficulty: it measures one player, and co-op already
  scales by the number of players.
- The setting lives in the save (`save.modes`), not in the device's settings: the port keeps it in its save too,
  and this way it follows the Magepunk account.
- The Daily stays seeded: the biome extras use their own seed (the day's), so drawing them never shifts the
  seeded set-up (map, cast, bosses, moves), and adaptive difficulty never applies to it.
- "beach" and "sky" (and the beach list of 28 coast Pokémon) are in the port's tables but no biome of the port
  or of the web has those keys, so they never apply; they are kept as in the port.
- The web has 22 biomes (the Judgment ruins included, batch 8); the Tower and Boss Rush skip the ruins like the
  port (`G.Tiles.CYCLE`), so neither lands on that biome (it has no themed spawns).
- Port-only numbers in this area that were not changed: the port's base spawn density (0.17, surges x0.28)
  against the web's (0.24, x0.4). Batch 8 kept the web's curve; changing it is a balance call for the owner.
- "Challenge" sits one line lower than in the port: the web's biome / defeated / coins line is already there.

### Batch 10: Minimap, field of view and UI scale

`js/core/display.js` (`G.Display`) and `js/ui/minimap.js` (`G.Minimap`); port `main.gd` 335 / 532 / 546-554 /
3176-3184 / 7798-8120, `pause_ui.gd` 178-216, `display.gd`, `menu.gd` 3965-4001, `save_data.gd` 87 / 126-129. The
numbers are the port's. All three live in Settings > Graphics > Display (mouse, touch, pad; the sliders move by 5
with the D-pad's left / right), and the field of view is also on the pause screen, as in the port.

| Setting | Port | Here |
|---|---|---|
| Field of view ("View") | 100-200 %, step 5, default 165; it is the camera's zoom, applied live | The same. 165 % is the web's existing view (768 x 420 world px), so the visible world is 768 x 165 / FOV wide (1267 at 100 %, 634 at 200 %). Dynamax and the Tower / rift arena keep it, like the port (its zoom only changes from the slider) |
| UI scale ("Screen size") | 60-140 %, step 5, default 100, a Reset button and "Screen (px) → game view" | The same range, Reset and info line. Scales the canvas HUD (drawn in w / k x h / k units) and every DOM layer (each laid out in a virtual 100vw / k x 100dvh / k viewport and scaled by k) |
| Minimap | Always on | On by default, with a Yes / No switch |

**The minimap** (port `class Minimap`): a 200 px circle (radius 96, white rim, an "N") showing 48 tiles across at
4 px a tile, centred on you and scrolling with you. Real terrain colours (floor, flowers, wall faces and tops,
water / lava with shore and foam; the web's biome palettes are the same as the port's) under a fog of
exploration: within 14 tiles full colour and explored, explored ground dimmed (0.5), the rest near black (0.94).
Chests (and the web's locked chests), altars and springs within 20 tiles or on explored tiles, with a pulsing ring
when near; traps within 9 tiles; enemies (red dots) within 12 tiles; bosses always (their Pokémon in a red disc),
pinned to the rim when far; the rift always, pinned to the rim, with a pointer on the rim; you in the centre with
your Pokémon and a gold ring. Hidden in the rift arena, during the Judgment and while down, like the port.

**Placement.** The port puts it at (8, 92), under the HP. Here it goes in that left column at the first free spot
under what is already there: `hud.js` records every element's rect (HP, ability / buff chips, the centre clock
block, weather, mode tag, boss bar, move bar, items, Z / MAX / swap, Team chips, co-op rows, the touch pause
button, the fixed joystick, the controls hint) and `G.Minimap.place` scans down from y 92 for a spot that touches
none of them; if the column is full (a phone in Team mode with the fixed joystick) it tries just right of the
column, then shrinks it (down to 72). It is 200 px at 720 px tall and proportionally smaller on shorter screens
(108 on an 844 x 390 phone; the port's view is 720 tall), times the UI scale. The edge arrows (rift, shinies,
co-op mates, the lost Pokémon, thieves) step aside so they never sit under it.

**Clamps** (so phones stay playable and nothing overflows):
- Field of view: on a small screen (the short side under 500 px) it never goes below 130 % (the setting keeps the
  chosen value; the slider says so).
- UI scale: it goes only as large as keeps the virtual viewport (screen / scale) in the same height / width bracket
  of `style.css` (781 / 661 / 521 / 401 px tall, 360 on a landscape phone; 761 / 640 wide), never below 100 %:
  1280 x 720 reaches 109 %, 1366 x 768 116 %, 1920 x 1080 138 %, 844 x 390 108 %. With a touch screen it does not go
  below 85 %; HUD buttons keep at least their 100 % touch area, and menu controls stay at least 24 px tall.

**Saved** device-locally with the other display settings (`micasurvivor_settings` in localStorage: `fov`,
`uiScale`, `minimap`), not in the account save: the port keeps them in its local settings file and each device has
its own screen. Nothing new to merge on a 409.

**Deviations, and why:**
- The UI scale scales the interface only. The port's content_scale_factor scales the whole canvas, world
  included; here the world's zoom is the field of view alone, so the two settings do not compound.
- The maximum UI scale depends on the screen (above). At 140 % on a 1280 x 720 screen the menus' compact
  layout rules would no longer match, so it stops at 109 %; the info line shows the applied size.
- The setting is named "Interface size" (port: "Screen size"), since it no longer zooms the world.
- The minimap can be switched off (the port has no switch; no pad action or key, as in the port), and it also
  hides on the level-up / item / pause screens (the port covers it with those screens).
- Dens are red and co-op mates show as dots in their colour (the port shows neither on its minimap). Chests,
  altars, springs and traps use the port's fallback shapes, not its prop sprites.
- The minimap redraws every frame (the web's HUD does); the port caches its drawing at 25 Hz.

### Batch 11: Achievements, missions, titles, damage breakdown, Lexicon and trainer card

`js/data/achievements.js`, `js/data/missions.js`, `js/systems/progress.js`, `js/systems/dmglog.js` (`G.DmgLog`),
`js/ui/lexicon-ui.js` (`G.LexiconUI`), `js/ui/goals-ui.js` (`G.TrainerCard`, the Titles tab), `js/ui/run-ui.js`;
port `progress.gd` 9-151 / 291-334 / 447-639, `main.gd` 351-355 / 758-858 / 2481 / 4484-4492 / 5168, `menu.gd`
1465 / 1691 / 1801-1890 / 3047-3194 / 3503-3826, `save_data.gd` 84-86 / 588. The plan's "+93 / +13" was counted
before batches 6-8; diffing the port's full lists against ours left exactly this:

| | Port | We had | Added |
|---|---|---|---|
| Achievements | 82 + 54 per type + one per legendary (230 here since B1c) | 165 | 58: `boss10`, `boss250`, `boss500`, `boss1000` and the 54 "Por tipo" ones |
| Daily missions | 17 | 13 | `mDaily`, `mMods`, `mType`, `mRifts` |
| Weekly missions | 13 | 9 | `wDailyCh`, `wType`, `wRifts`, `wMods` |
| Titles | 36 (one per achievement that gives one) | 34 | "Verdugo de jefes" (500 bosses), "Rey de los jefes" (1,000) |

**Achievements.** The port's goals, tiers and rewards; the new "Por tipo" category sits after Combate, as in the
port. Per type: defeat 250 / 1,000 / 5,000 Pokémon of a type ("Rastreador / Cazador / Maestro de tipo X";
300 coins + 2 tickets, 1,000 + 3 + one x10, 3,000 + three x10), from `stats.tk_<type>`, which progress.js
already counted (a dual-type Pokémon counts for both). Bosses: 10 (3 tickets), 250 (three x10), 500 (five x10 and
a title), 1,000 (ten x10 and a title), from `stats.bossesTotal`. Every reward is coins or gacha tickets, earned in
play. Nothing in the port depends on local co-op or on other languages, so nothing is pending.

**Missions.** The lists are now in the port's order (the daily draw picks by position), with its goals, rewards
and wording. The new ones count only their own runs, as the port's `req`: `mDaily` / `wDailyCh` the Daily
Challenge, `mType` / `wType` Survival by Type, `mRifts` / `wRifts` the rifts won in a Rift Time Attack (game.js now
sends `rifts` with `runEnd`), `mMods` any run with a modifier and `wMods` one with 3 or more (the Daily's rule is
not a modifier: it reports 0). Rotation as the port: 3 daily + 2 weekly a period, seeded by FNV-1a of period +
account and mulberry32, one reroll a day to a mission not already listed.

**Titles.** Missions → Titles (the port's `_goals_titles`): "Title in use", "No title", then every title with its
achievement and Use / In use / Locked. The Profile tab's select does the same. Equipping stores
`profile.title` and `profile.titleAt`; on a 409 or any merge the title chosen later wins (whichever save is newer
otherwise), and the titles you own come from the achievements (a union), so none is ever lost. Shown on the main
menu under your Pokémon (`menu.gd` 1691), on the trainer card and on the public profile, as before.

**Run damage breakdown** (`menu.gd` "Damage and defeats per move"). Every point of HP an enemy loses is recorded
in `Enemy.hurt` (after shields, never more than the HP it had; the kill goes to the finishing source), with the
source set by `G.Combat.land` (moves, their projectiles, orbs, mines, turrets, trails; the Z-move; Dynamax's Max
waves) or where the hit happens (Rocky Helmet → Items, contact abilities → Abilities, burn / poison ticks and
confused enemies → Status effects, a co-op mate's hits → Partner / team; traps, bombs and lava → Other). The
run-over screen lists your moves (icon, level; most damage first), then Z-Move, Dynamax, Items, Abilities, Status
effects, Partner / team and Other, each with damage (12.3k as the port), its percentage and defeats. The table
scrolls past 5 rows.

**Lexicon** (main menu → Lexicon; mouse, touch, pad). The port's five tabs: Items ("✔ Found" / "Not found yet" and
"Items: n / 26 found"), Moves (by type, "Evolves into: …"), Status (the port's 7 texts), Abilities, Z-Moves &
Dynamax (the rule, the Dynamax entry left pending in batch 5, each Z with "Defeat 250 X-type Pokémon: n/250" or
"Unlocked"). Then, as the plan asks: raid dens, Pokémon (all 1025 since B1c, by generation; yours with their sprite, the
others as silhouettes), Modes (the 8 modes with your records, the Tower and Boss Rush included, the 6 modifiers,
adaptive difficulty) and the Floor Tower (relics, the rest cards, the 15 + 4 pacts and the boss log that was only
on the fail screen). Every card opens an entry with its full text and data; Close, Esc, B or a tap outside closes
it. Tracking reads what the save already has (items found, moves evolved, Z unlocks, dens, owned Pokémon, mode
stats); nothing new is stored.

**Trainer card** (Profile → "View my trainer card"; `menu.gd` `_show_card`): your display name, your title (or
"(no title)"), your Pokémon and your 3 favourites, and the port's 9 cells: Runs, Best time, Best level, Defeated,
Bosses, Chests, Pokémon (n / 1025), Achievements (n / 230), Time played (new stat `stats.totalTime`, seconds,
max-merged like every stat). Below, "Records by mode". View only, like the port: no share or export, and nothing
from the account but the name other players already see.

**Deviations, and why:**
- The breakdown splits the port's single "Other (status, traps, items)" row into Z-Move, Dynamax, Items,
  Abilities, Status effects and Other (the plan asks for each), and shows a percentage on every row (the port
  leaves it off "Other"), rounded by largest remainder so they add up to 100. No DPS column and nothing on the
  pause screen: the port has neither.
- The mission seeds keep this web game's period ids (`d20261018`, ISO weeks) and account key (`created` in ms)
  rather than the port's (`2026-10-18`, the Monday's date, seconds). The algorithm and the list order are the
  port's; changing the seed format would have re-rolled everyone's missions of the day.
- The Lexicon adds the Pokémon, Modes, Floor Tower and dens pages, and opens each card into an entry (the port
  shows the text on the card only).
- Titles are not shown on co-op name tags: the port's co-op (batch 12) doesn't show them either.
- The trainer card adds "Records by mode" (batch 8 asked for the Tower / Rush records there). The name is the
  account's display name: the web has no separate "trainer name" field (the port's nick).
- Not ported (languages dropped by the owner, 2026-10-18): nothing; the port has no language achievements or
  missions, and its Lexicon text is ported in Spanish and English only.

### Batch 12a: Co-op Mode (the local partner)

`js/systems/localcoop.js` (`G.LocalCoop`), `js/systems/modes.js`, `js/ui/modes-ui.js`, `js/core/pad.js` (player 2),
`js/ui/hud.js`, `js/ui/minimap.js`; port `menu.gd` 1584-1600 / 2109 / 2151-2156, `main.gd` 162-167 / 195-202 / 439 /
523-524 / 815-817 / 838-841 / 985-989 / 1062 / 1243 / 1267 / 1623-1731 / 1807-1811 / 1917 / 1939-2007 / 8653-8661,
`progress.gd` 105-106 / 155. The numbers are the port's. It is the port's local co-op, on one screen; the online
4-player co-op (`js/net/coop.js`, batch 12b) is a separate thing: an online run is always Normal, so this mode never starts in one.

| Rule | Port |
|---|---|
| Mode | "Co-op Mode" on Choose a mode, after Party (the port's order), its own mode: "A second Pokémon comes along and attacks on its own. Plug in a second controller and player 2 moves it with the left stick. It shares your upgrades. -20% coins. Partner: X". Modifiers apply (+0.25 coins each, then ×0.8). No leaderboard |
| Partner | "Choose partner": your own Pokémon only, by generation (mouse, touch, pad; Esc / Back / B back). Saved as `save.coopDex` (+ `coopAt`). With no pick (or an unknown one): the first of your team (`G.Team.list`) that is not the Pokémon you play, else Eevee (Pikachu if you play Eevee). Shiny if you play shinies and own it |
| Movement (AI) | speed 118. Past 150 from you it walks to you; within 120 of you, with an enemy within 240 of it, it closes in at half speed; else it stops. Steering eases (lerp ×5 a second). Past 520 from you it reappears 70 from you with a blue ring |
| Player 2 | a second connected pad (the one player 1 is not using) moves it with the left stick: raw axes, 0.22 deadzone, speed 118 × the stick. No buttons: player 2 never drives a menu, pauses or picks a card, and while a co-op run is on, player 2's pad is never taken as player 1's. Unplugged: the AI takes over ("Player 2: controller disconnected, the AI takes over your partner"); plugged in: player 2 again ("Player 2: controller connected"). The HUD chip says "X · AI" or "X · P2" (with the left-stick glyph) and the partner wears a P2 tag |
| Attack | the first projectile move of its main type (else a Normal one, else Ember), level 1 + your level / 6, at the nearest enemy within 520, every move-cooldown ×1.15 (your cooldown upgrades don't apply). Each shot does the move's damage × YOUR attack × 0.8 — "it shares your upgrades": attack upgrades, cards, items, ability, Dynamax — with your size (Calibre, Big Orb), crits and on-hit item effects. Its damage and defeats are "Partner / team" on the run-over breakdown |
| Safety | enemies only go for you; it takes no damage while you stand. Not in a rift arena (hidden; it waits) |
| Falling | after any Second Chance heart, a lethal hit doesn't end the run: you spectate ("You fell! Watch your partner"; the camera follows it; your Dynamax ends, no Z-move or Dynamax). It gets your max HP and takes the hits meant for you (×0.8, with its types and the weather; pure damage as is; 0.45 s apart); the AI flees enemies within 190. The HUD: "Spectating: you revive in N s" and "Your partner's HP". After 20 s it revives you next to it at half HP, 2.5 s invulnerable, knocking enemies within 220 back (450). If it falls first, the run is over |
| End | coins ×0.8 ("×0.80 with the mode"), "Co-op Mode" on the result. `stats.coopRuns` +1; a run of 60 s or more also adds `stats.groupRuns`, which "In good company" / "Loyal partner" count (the port: "Co-op Mode already counts as a group run"). Both merge by max |

The minimap shows the partner as a dot in the online co-op's second colour (`#5fc8ff`), and a HUD arrow points to it
when it is off screen. The Lexicon's Modes tab lists Co-op Mode with your runs and partner.

**Deviations, and why:**
- The pick is saved as `save.coopDex` with a `coopAt` time (the port's `coop_dex` has none), so that a 409 merge keeps
  the pick made last even when the other save is newer for another reason.
- Its hits are always "Partner / team" (`dsrc: 'ally'`). The port files them under the move's id and moves you don't
  carry go to that row, so a partner using the same move as you would have its damage counted as yours.
- Its move level stops at the move's top level (5 for projectiles). The port asks for up to 6, past the end of its
  4-step ladder.
- Player 2 is "the pad player 1 is not using" rather than Godot's `get_connected_joypads()[1]`: the web keeps
  player 1 on whichever pad pressed first.
- Added for clarity (the port has none): the HUD chip, the off-screen arrow, the P2 tag, the minimap dot, and the
  player-2 connect / disconnect toasts.
- The partner is not tinted blue (the port modulates it slightly); the tag, chip and minimap colour mark it instead.

### Batch 12b: Online co-op

Upstream PokéSurvivor's own 4-player group runs (`js/net/coop.js`, `js/net/net.js`), switched on with Magepunk
accounts and friends in place of Firebase: `js/mica/social.js` (`G.Social`: friends, lobbies, invites),
`js/mica/online.js` (`G.MicaNet`: signalling + relay over `/api/mp`), `js/ui/social-ui.js` (Friends, the lobby, the
invite popup), `js/ui/menu.js`, `js/game.js` (`G.Flow.startCoop`), and the `msurv-*` actions in `server/mp.mjs`. The
game rules are upstream's, unchanged. Online co-op and the local partner (`js/systems/localcoop.js`, batch 12a) are
separate: an online run is always a Normal run, so Co-op Mode never starts in one.

**Getting together.** Main menu → Friends (for a guest: "Sign in to play with friends", a toast and nothing more:
friends need an account; it is not a controller rule, pads work for everyone). The list is your Magepunk friends
(`friends`, with "In MicaSurvivor" / "Online" / "Playing" from presence); "Add friend" takes a Magepunk username
(`add-friend`). "Play with friends" creates a lobby; Invite (in the list or the lobby) sends an invite. A friend in
MicaSurvivor's menus gets the popup ("alice invites you to play in their lobby" · Join / No, thanks; bottom left, so it
never covers the menu); in a solo run a toast ("open the menu to join"); anywhere else on Magepunk a bell message in
their inbox. The lobby shows each member's Pokémon ("Change Pokémon" opens the collection; Play brings you back),
ready state and connection ("Host · Connected", "Ready · Connected (via server)"); guests press "I'm ready"; the host's
Start needs everyone ready and connected. Everything works by mouse, touch and pad.

**Rules (upstream's group runs, `coop.js` / `game.js`):**

| Rule | How it works |
|---|---|
| Players | 2-4; colours gold, blue, green, pink (HUD bars, name tags, minimap) |
| Authority | the host runs enemies, pickups, the team's XP / level, the clock and the end; each player runs their own Pokémon; a guest's hits go to the host, who applies them (`'h'` events) |
| Mode | always Normal with no modifiers (`G.Modes.begin({mode:'normal'})`): no Daily / Rush / Tower / Team / Co-op Mode / other modes; adaptive difficulty off (batch 9); not on the leaderboard (solo runs only) |
| Scaling | foes appear ×(1 + 0.75 per extra player), enemy HP ×(1 + 0.3 per extra), bosses ×1.4 more in a group |
| XP | shared: the average of the players' XP bonuses, ÷ (1 + 0.6 per extra player) |
| Level-up | cards for everyone at once; the run waits until all have picked ("Waiting for bob and carl…"); who is still choosing rides on EVERY frame (upstream's 2026-10 fix), so a lost message never freezes the screen. A bond (fusion) choice pauses everyone the same way |
| Falling | a partner standing next to you for 3 s revives you at 50 % HP; the run ends 1.6 s after everyone is down |
| Pause | does not stop the others; a host whose tab is hidden or silent for 2.5 s pauses everyone ("Paused: waiting for alice (host)…") |
| Rewards | each player's own coins from the team's time / defeats / bosses / coins, `groupRuns` ("In good company", "Loyal partner") and `bestGroupTime` |
| Leaving | a guest who quits or closes the tab says goodbye (`'bye'`, also on `pagehide`) and is removed ("carl left the game"); the host quitting ends the run for all ("The host has ended the game"), then everyone is back in the lobby, reopened (guests not ready). No reconnect mid-run (upstream has none) |

**Architecture.**
- *Lobby* (`msurvlobby:<id>`, a 12-hex id): `msurv-lobby-create` / `-join` / `-leave` / `-poll` / `-update` (Pokémon,
  ready; host: open, start). Friends only: the host must be on YOUR friends list and you on theirs (the server reads
  both). Up to 4. Every change is a compare-and-set on the row's `rev` (`setIfRev`), so two friends joining at once
  both land. A waiting lobby closes when its host hasn't polled for 60 s; a waiting guest silent for 45 s is dropped; a
  started lobby lives 10 min past the host's last keep-alive (the host polls every 2 min in a run). The start is stored
  (seed, host, members) and also reaches guests by the poll (2 s on the lobby screen), besides upstream's `start` message.
  The host leaving deletes the lobby, every member's signalling / relay row and its open invites (exact keys).
- *Invites* (`msurvinv:<to>:<host>`, 3 min): `msurv-invite` (host, to a friend; plus a bell message in
  `chat:dm:<to>`, at most once a minute per friend), `msurv-invites` (polled every 15 s in the menus, 30 s in a solo
  run, only when you have friends; it also writes your "In MicaSurvivor" presence at most once a minute),
  `msurv-invite-decline`.
- *Signalling* (`msurvsig:<id>:<from>`): one row per sender holding its window of signals to each member (≤ 48, ≤ 24
  KB), batched 200 ms; `msurv-signal-poll` returns what was sent to you, newer than `since`. Polled every second only
  while a pair is still connecting; it stops once every data channel is open. ICE: public STUN only (Google,
  Cloudflare), no TURN.
- *Relay* (`msurvrelay:<id>:<from>`): the fallback when a pair has no data channel after 9 s (12 s for the guest), or
  when the channel dies (`disconnected` for 4 s). Each sender's row holds its unacknowledged messages per peer (≤ 30, 16
  KB each, 64 KB per row); receivers ack by seq in their own pushes; a push also returns what is waiting for you, so
  one request a tick does both. **1 update a second** (owner, 2026-10-18: "slow relay + time cap"; upstream: 3), and
  partners and enemies glide between updates (their velocity is led for up to 1.1 s and eased; a guest only shows
  "waiting for the host" after 7 s on the relay instead of 2.5). Hard caps: one write per 1000 ms per sender (checked
  against the sender's own row, so it holds across isolates; 429), 15 requests per 10 s per account, rows older than
  30 s ignored (that peer is gone: dropped like a closed channel), swept after 1 h. In the lobby the relay only reads
  (nothing to send; the lobby poll says who is there); keep-alives (every 5 s) and the 20 s silence rule apply in a
  run. A pair that later gets its channel moves back to it.
- *The relay's daily minutes* (`msurvrelaybudget:<host>:<YYYYMMDD>`, `MSURV_RELAY_DAILY_MIN = 30` in `server/mp.mjs`):
  each host gets 30 relay minutes per UTC day, across all their lobbies. A minute counts once, when the first relay
  write of that minute lands in one of the host's lobbies (a compare-and-set on the row, so two players can't count it
  twice). The lobby poll and every relay answer carry the minutes left; while a pair is on the relay the lobby warns
  "Relay: 12 min left today" (red under 6). Used up: relay pushes and pulls in that host's lobbies answer 403
  `{budget: true}` and write nothing; a relayed guest's run ends with its rewards saved and the toast "Relay time is
  used up for today; players who can't connect directly can't continue. Direct connections still work." (it stays in
  the lobby); the host is told the same and plays on with anyone connected directly; in the lobby that pair shows "Could
  not connect" with the same message, and Start stays off for it. Direct (WebRTC) pairs never touch it. A new UTC day
  starts a new row. Swept after 2 days.
- *Who reads what*: every msurv action is behind the login gate; signalling and relay check that the lobby is live and
  that you are in it, and only return the part addressed to you, so nobody reads another lobby (or another member's
  mail). Every row written is an exact key of the caller or its own lobby.
- *Ephemeral prefixes* (GC table): `msurvsig:` and `msurvrelay:` and `msurvinv:` 1 h, `msurvlobby:` 12 h,
  `msurvrelaybudget:` 48 h.

**D1 write budget** (rows written; the site's D1 is on the free plan's 100,000 rows a day):

| What | Writes |
|---|---|
| A run over WebRTC (direct) | 0 per message. Signalling: ~2-4 batched puts per side per pair, once. Then only the host's keep-alive (1 per 2 min) and presence (≤ 1 a minute per player) |
| Lobby | create 1; join 1 + the used invite; ready 1; start 1; each member's `seen` ≤ 4 a minute while on the lobby screen; an invite 3 (invite row, bell message, lobby) |
| Menus | presence ≤ 1 a minute per signed-in player with friends; invite polls are reads |
| **A relay game** (1 a second) | at most 1 row a second per player on the relay, plus the host's minute row once a minute (measured: 1.7-1.8 a second for 2 players): **2 players ≤ 120 a minute (≤ ~7,260 an hour); 4 players all on the relay ≤ 240 a minute (≤ ~14,460 an hour)**. Requests: about the same count (one request does push + pull) |
| **Worst case per host per day** | the 30-minute cap: **4 players ≤ 30 × 240 + 30 = 7,230 rows** (~7 % of the daily 100,000); 2 players ≤ 3,630 |

At 3 a second (12b as first built) one hour of a 4-player all-relay game was ~43,000 rows. The owner chose "slow relay
+ time cap" (2026-10-18): a third of the rate and 30 minutes per host per day, so one host's relay can use at most ~7 %
of the site's daily write quota; ~14 hosts maxing it out on the same day would use it all. A game over WebRTC costs
almost nothing, and most pairs connect directly (STUN works for most home networks); the relay is only for the pairs
that can't (symmetric NAT, some mobile data).

**Deviations, and why:**
- Firebase → `/api/mp` polling (no sockets on the site): the nickname screen is unused (your Magepunk username is your
  name), friendships are the site's (mutual, by username; managed on Magepunk, so no Remove here), presence is the
  site's (90 s), public profiles are not ported (your own preview still works).
- A **ready** step: the server refuses the start until every guest is ready (upstream: the host starts any time).
- The start is also stored on the server (guests read it from the lobby) besides upstream's `start` message.
- A pair still connecting sends nothing over the relay (upstream relayed everything): no D1 write is spent on it.
- The relay runs at 1 a second (upstream: 3) with smoothing for relayed partners and enemies, and has a daily cap of
  30 minutes per host (owner's choice, 2026-10-18, for the D1 write budget).
- `'disconnected'` for 4 s moves a pair to the relay, where a silent peer is dropped after 20 s (upstream waited for
  `'failed'`, ~30 s); a guest who loses the host leaves the lobby too (it would wait for a host that is gone).
- On `pagehide`, a co-op player says goodbye (upstream's `leave()`) and leaves the lobby.
- The level-up wait joins names with "and" in English (upstream's "y" leaked).
- The invite popup sits bottom-left (upstream: bottom-right, over the menu's last items).
- English uses "lobby" for upstream's "sala" (was "room").

**Not yet:** reconnecting mid-run (upstream has none); a guest's status effects on the host's enemies and a guest's
alternative evolutions in the ghost replay are still not synced (as noted in batch 1).

**For 12c (spectate + replays):** the host's frames already carry the full state every time (players, nearby enemies
with HP / animation / status, team XP / level / clock, who is choosing): a spectator can be fed host frames, and a
replay can record them (the relay sends them at 1 a second). `G.Net.snapshot()` and `G.MicaNet.snapshot()` give the connection
state as plain data; the lobby row (`msurvlobby:<id>`, with `start`) and the presence status `micasurvivor:run` say who
is in a group run (for "live now").

### Batch 12c: Spectating and replays

Watch a friend's run live, read-only, and share a whole run as a replay link anyone can open. Not upstream (upstream
has neither). `js/mica/spectate.js` (`G.Spectate`: the snapshot, the live publisher and the watcher's poll),
`js/mica/replay.js` (`G.Replay`: the recorder, its codec, the local store, sharing and the reader),
`js/ui/watch-ui.js` (`G.WatchUI`: the read-only renderer for both, the banner, the replay controls and the end card),
`js/game.js` (the `'watch'` state, the hooks at run start / each frame / run end, `?watch=` / `?replay=` at boot),
`js/ui/run-ui.js` (Share replay), `js/ui/social-ui.js` (Live now, your recent runs), `js/ui/hud.js` / `js/ui/minimap.js`
(a watched player's HUD without its controls; partners on the minimap), and in the site: `server/mp.mjs`,
`site/livewatch.js`, `site/topbar.js`, `overworld/ow_screens.js`, `battlecards/start.html`, `_redirects`.

**Watching a friend.** Friends only, both ways (the server reads both friend lists). A friend in a run is listed:

- in MicaSurvivor's Friends screen under **Live now** (with what they play, "Pikachu · Boss Rush" or "Pikachu · co-op
  with bob"), with **Watch**;
- on the rest of Magepunk: `live-friends` (the Battlecards "Live now" hub) has a new kind `micasurvivor`, and the
  `friends` action reports a friend in a run as online with status `micasurvivor:run` (so the top bar's Friends tab and
  the overworld friends menu offer Watch). All of them route through `site/livewatch.js` to
  `/micasurvivor/?watch=<username>`.

The view is the game's own canvas: the run's world (its seed, biome and rift arena), their Pokémon and partners as
puppets (`G.Player` / `G.EnemyMgr.addRemote` copies that never think), the foes and pickups, harmless ghost copies of
their attacks (like a co-op partner's), their HUD (HP, level, XP, clock, "Challenge: N%", moves, held items, boss bar;
no touch / pad controls or hints) and minimap, plus a line on the right for what the HUD leaves out for a watched
player: Z-move ("Z-Move: Fire · ready / in use! / used"), Dynamax, Team Mode, each partner's HP ("Eevee · AI · 51%"),
and in the middle "Choosing an upgrade…" (or "Choosing…", "Paused", "Fainted: revives in N s"). Events arrive as the
game's banner ("Level 5! · Flamethrower Lv. 2", "A boss appears: Onix!", "Z-Move!"). A banner top right says
"Watching alice · LIVE" (and "Watching: 3" with company) with **Leave** (or Esc). Nothing the viewer presses reaches the
run: in the `'watch'` state the game reads only Esc (and Space in a replay). When their run ends the viewer gets the
summary card ("alice's run has ended": Pokémon, time, level, defeated, bosses, moves). Online co-op groups can be
watched through any member: each member publishes their own view (its partners included).

**Snapshots.** `G.Spectate.snap()` (≈0.08 ms): your Pokémon `p` (position, facing, animation, HP, max HP, flags: fainted /
walking / Dynamax / down in Co-op Mode / in the sky), `lv` level / XP, `k` `bo` `co` kills / bosses / coins, `mv` moves
(+ evolved), `ac`, `it` items, `lu` the level-up (1) or another choice (2) or pause (3) open, `ds` the Dynamax scale, `z`
Z-move, `dy` Dynamax, `tm` Team Mode, `ar` the rift arena, `wx` weather, `ad` the adaptive challenge, `mt` partners
(online: name, colour; local: its controller AI / P2, the HP it has while you are down, and `dn` the seconds until you
revive), `e` foes within 720 (bosses within 1600, the nearest 80: id, species, position, HP %, max HP, boss / shiny /
burn / poison / shield / den flags, animation + facing), `pk` pickups within 520 (24 special, 40 XP orbs), the clock `t`,
seed `sd`, biome `b`, mode `m`, and the events / defeated foes since the last one. A live snapshot is 2-6 KB.

**Server (live).** All behind the login gate, rate-limited per account (30 / 10 s each):

| Action | What it does |
|---|---|
| `publish-micasurvivor` {run, label, mode, dex, group, over, seq, snapshot?} | The player's client, every 10 s WITHOUT a snapshot (a watcher check: it only READS), every 1 s WITH one while somebody watches (the answer's `watchers`), once more at the end (`over`, the summary in the snapshot) and a keepalive "over" on `pagehide`. A player with no friends writes nothing at all. |
| `micasurvivor-state` {username, seq} | A friend's poll (1 s): `{waiting}` (live, no snapshot yet), the snapshot, `{unchanged}` for the same seq, `{over}` (+ the summary when a watcher saw the end), `{live:false}`. Spectator cap 10 (403 `full`). |

| Row | Written | Life |
|---|---|---|
| `msurvlive:<user>` {run, ts, since, label, mode, dex, group, over} — the "in a run" beacon | at the start, the end, a mode / group change, else every 5 min | live for 6 min after its last write (a dead tab lapses); GC 6 h |
| `msurvstate:<user>` {run, seq, ts, snap, label, mode, group, over, watchers} | only while a friend's heartbeat is fresh; ≤ 1 per 900 ms (1 per 5 s past 60 watched minutes a day) | a viewer waits once it is 20 s old; GC 1 h |
| `msurvspec:<user>:<viewer>` (ms) — a viewer's heartbeat | by the viewer's poll, at most every 4 s, only while the run is live | counts as watching for 12 s; GC 1 h |
| `msurvspecbudget:<user>:<YYYYMMDD>` {rev, used, last} — watched minutes per UTC day | once per watched minute (compare-and-set) | GC 48 h |

**Replays.** Every run is recorded from the start (`G.Replay.observe` in the game loop: a time check each frame, a
snapshot every 0.5 s of RUN time, so pauses and level-up screens take no room), delta-encoded as it goes: frame =
[dt, your Pokémon's differences, the counters' differences, the slow state when it changed, the foes' table, the
pickups' table, the partners when they moved]. Positions are quantized (your Pokémon to 2 world units, the rest to 4);
in the entity tables ids are delta-coded, every entity is predicted to repeat its last step, and only the fields that
differ from that are written (id + a bit mask + the corrections), so a foe walking straight on costs nothing; foes'
facing is not recorded (they face where they walk). Events ride beside the frames (`lv` level-up, `mv` a move learned or
levelled = the card picked, `xe` a move evolved, `bs` / `bk` a boss appears / is beaten, `z` Z-move, `dx` Dynamax, `dd`
fainted, `bi` biome, `ar` rift arena) and which foes that vanished died (they play their Faint). At the end the stream is
gzipped ('G1.' + base64url, the Micatro replays' format; 'R1.' raw fallback) and kept in this browser
(`micasurvivor_replays_v1`, the last 3 runs, the oldest dropped if storage is full).

The run summary has **Share replay** (uploads it, shows the short link `/msr/<id>` and copies it: "Link copied!") and
**Watch replay** (plays it right there). A failed upload says so ("Couldn't upload it. It's saved in this browser: try
again.") and the button becomes Retry; a retry sends the same `rid`, so the server returns the first id instead of
storing it twice. Friends → **Your recent runs** lists the local ones with Watch / Share (Copy link once shared). Guests
can watch their own; sharing needs a login.

| Action / row | |
|---|---|
| `micasurvivor-replay-put` {code, meta, rid} (login, 20 a minute) | validates the code (G1. / R1., ≤ 1.2 MB packed, unpacked under 8 MB — a gzip bomb stops there — `{v:1, h, f:[arrays] ≤ 30,000, ev?}`), allow-lists the meta (Pokémon, mode, time, level, kills, bosses, fainted, co-op names, frames counted by the server); writes `msurvreplay:<8 hex>` {code, meta, by, when} and the player's list `msurvreplays:<user>` {ids:[{id, when, rid}]} |
| per-player cap | 10 shared replays: the 11th deletes the oldest (only if that row is the player's own: `by` is checked) |
| `micasurvivor-replay-get` {id} | PUBLIC (no login, above the auth gate like `replay-playlist-get` / `micatro-replay-get`, the same per-IP limit) |
| `micasurvivor-replay-list` | your stored replays with their meta |
| life | `msurvreplay:` 30 days (GC, like `mreplay:`), `msurvreplays:` 60 days |
| link | `/msr/<id>` → `/micasurvivor/?replay=<id>` (302 in `_redirects`) |

The player is the same renderer: play / pause (Space), 1× · 2× · 4×, a seek bar (decoded from a checkpoint every 40
frames: a seek costs ~0.3 ms) with marks for bosses, Z-moves and Dynamax, "Replay of alice", and at the end the run's
summary card with Watch again / Back to menu. An unknown or expired id: "This replay doesn't exist or has expired
(replays are kept for 30 days)."

**Cost (D1 row writes; measured in `micasurvivor_spectate_test.mjs` / a 30-minute run):**

| What | Writes |
|---|---|
| A run nobody watches | the beacon: 1 at the start + 1 every 5 min + 1 at the end (**~0.2 a minute**; 1 in the test's 6.7 s). The watcher checks are reads. Friendless or guest: 0 |
| A watched run | **~76 a minute per run with one viewer**: 60 snapshots + 15 heartbeats + 1 watched-minute row (measured 80/min); +15 a minute per extra viewer. Past 60 watched minutes a day: 12 snapshots a minute |
| Watching (the viewer) | ~15 heartbeats a minute (reads otherwise) |
| Sharing a replay | **2 rows** (the replay + the list; +1 delete when the 11th evicts the oldest) |

**Sizes and speed** (measured with a 30-minute Normal run, real spawns, an invulnerable bot, the clock sped up ×8, ~65 foes in range from minute 5 on): 3,668 frames, 2,084 KB of JSON, **679 KB packed** (≈ 22 KB a minute; the first encoding, without the prediction and with foes’ facing at 2 px, was 858 KB). The cap is therefore **1.2 MB** packed (about 50 minutes of a busy run; a longer one stays watchable in the browser but is "too big to share"). Packing takes ~140 ms at the end of the run; seeking ~0.7 ms. The recorder costs **0.045 ms per frame** on average (a snapshot every 0.5 s: 0.16 ms average, 0.7 ms at most; 0.008 ms per frame in the e2e test’s quiet run), well under the 0.5 ms budget, and it reads nothing random and changes nothing in the run.

**Deviations, and why:**
- Discovery uses its own beacon, not presence: an unwatched solo run writes no presence (12b made those polls
  read-only), and a presence row lasts 90 s. The beacon is refreshed every 5 minutes, so a closed tab can stay "live"
  for up to 6 minutes (the `pagehide` keepalive usually ends it at once); Watch then shows "alice isn't playing right
  now."
- The view runs about a second behind the player (it glides between the last two snapshots).
- Keys are `msurvreplay:` / `msurvreplays:` rather than `msurv_replay:`: the store's prefix scans and the GC use LIKE,
  where `_` is a wildcard.
- Not shown to a viewer: projectiles exactly as fired (ghost copies of the active moves are drawn instead), floating
  damage numbers, broken crates, weather particles, the Judgment cinematic. A replay doesn't record the foes' facing
  or animations.

## DLC D0a: base-unchanged harness

The Expedition DLC (`Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md`) adds new modes, and the existing modes must stay
exactly as they are. Batch D0a is the proof: a deterministic harness and recorded golden runs of every base mode.
Every later DLC batch re-runs them and must match.

**Run it:** `node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs` (about 30 s). The quick gate
(`run-all.mjs --changed`) selects it for any `micasurvivor/**` change, and for a `server/` or `functions/` change
whose diff touches the `micasurvivor-*` / `msurv-*` actions (`BY_PATH` in `overworld/tests/select-changed.mjs`).

**What it runs:** Normal, Daily, Boss Rush, Tower, Team and local Co-op, each in a fresh browser context.
- **The profile:** a fixed guest save, set in localStorage before boot. It has 5 Pokémon, all fully upgraded so
  the runs last. The device id and the 1280×720 viewport are fixed too (the viewport sets the camera, and the
  camera sets where enemies spawn).
- **Up to 120 s of sim per mode,** or until the player falls: Normal ~112 s, Daily ~74 s, Boss Rush ~49 s.
- **Fixtures:** `overworld/tests/fixtures/micasurvivor_golden/<mode>.json`, ~110 KB in all. Each holds:
  - a per-second hash of the player, the enemies, the pickups, the projectiles and the rest (clock, state,
    biome, the co-op partner, the team), plus their counts;
  - the `Math.random` draw count;
  - the spawn log;
  - the kill / XP / coin totals;
  - the final save (timestamps normalised to `<ts>`).
- **The replay:** `replay.json` is the Normal run's 12c replay. The test checks that the run records the same
  replay again, and that the fixture replay plays through the replay player (`G.WatchUI`) to the same final
  frame hash.

**The game-side hook:** `G.Game.debugStep(n, dt)` (`js/game.js`). It does what `frame()` does to move the
game, n times with a fixed dt: keys, `update`, the replay player, the level-up / choice tick and the replay
recorder. It skips rendering, the real clock, the pad, the network and `requestAnimationFrame`. Like the other
`debug*` hooks it marks the run as tampered, so it never reaches the ranking. Nothing calls it outside the test.

**Determinism lives in the test, not the game:**
- **Randomness:** before any page script runs, the test swaps in a seeded, counting `Math.random`, a seeded
  `crypto.getRandomValues` (the replay id) and a virtual clock. `performance.now` and `Date` run on that
  clock: a fixed day, and exactly dt per step once the sim starts. The game reads the clock in the sim itself:
  the pathing line-of-sight throttle, Focus Sash, achievement checks and timestamps.
- **No real frames:** `requestAnimationFrame` is frozen once the sim starts.
- **No interleaving:** each mode's whole sim runs inside one synchronous `page.evaluate`, so no timer,
  network reply or asset load can run in the middle. Sprite loading doesn't affect the sim: the test still
  passes with 70 % of the images and fonts failing to load.
- **Silenced sound:** `G.Audio.sfx` and `music` are no-ops, because sound effects draw `Math.random` only where
  an audio device exists.
- **Input:** it goes through the game's own layer, as `KeyboardEvent`s on `window` read by `G.Input`. The
  player keeps away from nearby enemies, and otherwise walks for 1 s and stands for 1.5 s. Digit1 takes the
  first card of any level-up, bond, item or Tower screen.

**When it fails:** it prints the first second and the field that diverged, then the first difference in the
spawn log, the totals and the save. For example:

```
FAIL: normal: per-second hashes ... match (112 s)
      second 3: enemies (e) diverged: fixture 5e090c14 vs now 874764e6 · also differing that second: nothing else
FAIL: normal: the spawn log matches (185 spawns)
      first difference at spawns[7][1] [t*100, dex, boss, den, maxHp]: fixture 837 vs now 751
```

A DLC batch that fails it has changed a base mode. Find out what changed, and don't re-record. To dig in, run
`ONLY=<mode> TRACE=1` to print the HP, position and enemy count each second.

**Re-recording (`--record`):** only for a deliberate change to a base mode, such as a balance pass, the
Pokédex growing or a new base mechanic. Run `node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs
--record`, review the fixture diff, and say in the PR why the base changed. The fixtures record the 1025-entry
Pokédex of batch B1c (re-recorded then: the 18 new enemies change every mode's enemy pool; first recorded on the
1007 of B1/B1b). The fixture JSON is written with LF line endings. In a git worktree (no gitignored assets) add
`MAGEPUNK_ASSET_ROOT=<main checkout>` so the static server finds `micasurvivor/assets/` and `overworld/data/`.

**Not covered:** what `render()` does (the harness never draws, and draws by the renderer don't shift the
stream), sound, online co-op and the network.

## DLC D0b: Expedition plumbing

Expedition is a set of new modes picked on "Choose a mode", like Tower or Boss Rush. There is no on/off switch
(owner, 2026-10-19), and the existing modes play exactly as before. D0b is the plumbing only, with no gameplay yet:
every Expedition mode says "Coming soon".

**The mode select:** an **Expedition** group sits between the base modes and the modifiers, with Classic, Survival
and League (`js/systems/expedition.js` `MODES`).
- Each card is `aria-disabled` but not `[disabled]`, so mouse, touch and pad all reach it. Pressing one says
  "Expedition is coming soon." and starts nothing.
- The gate is also in `G.Flow.play`, and `G.Modes.plan()` plans a disabled Expedition mode as a normal run.
- A later batch turns a mode on with `G.Expedition.ENABLED.add('exp-classic')`. `plan()` then returns
  `{mode, dv, map, diff}` with no modifiers, and `G.Flow.play` loads the Expedition code before `startRun`.

**What a base page loads:** only `js/core/hooks.js` and `js/systems/expedition.js` (the registry, the loader and the
version gates). The Expedition code itself, `js/expedition/save.js` then `core.js`, is injected by
`G.Expedition.load()`.
- Only starting an Expedition mode calls `load()`. A base boot or a base run never fetches it (the plumbing test
  checks the network log).
- `load()` runs once, and a failure can be retried. It checks that the loaded code is this build's `dv`, so a stale
  cache is refused.

**The seams** (`js/core/hooks.js`, `G.Hooks.on / call / reduce / first`): Expedition code reaches the base game only
through these four. With no listener, a seam returns its input unchanged. A listener that throws is logged and skipped.
Every Expedition listener leaves base runs alone.

| Seam | Where | What the Expedition does with it |
|---|---|---|
| `run.start` | `game.js` `startRun`, after setup | notes the run's `{mode, dv, map, diff}` |
| `run.end` | `game.js` `endRun`, Expedition runs only (reduce over the run-over lines) | records the run in the Expedition save; a clean solo run's mark goes to the Expedition board |
| `replay.header` | `replay.js` `begin` | adds `dv`, `map` and `diff` to the header |
| `spectate.snap` | `spectate.js` `snap()` | adds `dv` to each live or replay snapshot |

**An Expedition run never writes the base save.** `endRun` gives it its own early branch, like the Party's: no coins,
stats, missions or base board. `G.Modes.saves()` is false and `G.Progress` is off. Pokémonedas stay the base game's
(owner decision #4). `G.Expedition.wallet.earn / spend / balance` go through the base save, but nothing calls them yet:
D9 and D10 pay the runs.

**The freeze:** `load()` first deep-freezes `G.Moves`, `G.Items` (and its item order `LIST` / `BY`), `G.Upgrades`,
`G.Enemies`, `G.DEX` and `G.DEX_BY`.
- Only plain objects and arrays are frozen: 2,455 objects, a one-time 2–20 ms.
- From then on, any write throws in strict code (the Expedition files are `'use strict'`) and changes nothing.
- It happens only in a page that loaded the Expedition code. A base page is never frozen.
- Measured cost, the same seeded Normal run frozen and not: the sim's per-step time is within noise (×1.01–1.17
  between runs). A tight read loop over the tables is about ×1.24 slower (7 ms per 2 million reads).

**The Expedition save** (`js/expedition/save.js`, `G.ExpSave`) is separate from the base save.
- **Signed in:** the server row is `micasurvivorexp:<user>`, through `micasurvivor-exp-save-get` / `-put`
  (`server/mp.mjs`). The browser keeps a copy in `micasurvivorexp_save.mp:<user>` and its rev in
  `micasurvivorexp_rev.mp:<user>`.
- **A put** is compare-and-set on `rev`. A stale put gets 409 with the stored save, merges it and retries. On the
  current rev the server also merges the put into what it holds, so a put can add progress but never take any away.
- **The blob** is `{v, counters:{name: n}, sets:{name: [id]}}`, and the merge never loses progress: the max of each
  counter, the union of each set. So a counter is a level or a record. Anything spendable is two counters (earned,
  spent).
- **Limits:** 2,000 counters, 200 sets of up to 5,000 ids, 200 KB. The server refuses an unknown top-level field,
  `coins` included.
- **Guests:** localStorage `micasurvivorexp_save.guest` only, with no request. The first time the Expedition opens
  signed in in that browser, the guest progress is merged into the account once (`micasurvivorexp_migrated.guest`).
  The guest copy is kept. Because the merge can't lose anything, there is no question to ask, unlike the base save's
  carry-over.
- The base row `micasurvivor:<user>` is never read or written by any of this.

**Boards:** `run-score` / `run-leaderboard` with mode `micasurvivor_expedition` and `{expMode, dv, map, diff}`.
- There is one board per map and difficulty, `runboard:micasurvivor_expedition:<map>:<diff>`, built server-side from
  allow-listed maps (`viridian`, `mtmoon`, `cerulean`) and difficulties (`normal`, `hard`, `nightmare`).
- It ranks by score, then time. D0b's score is the time survived; D9 brings the formula.
- Your best per board is `runBest['micasurvivor_expedition:<map>:<diff>']`.
- Enforcement follows `micatro_modded`: a `micasurvivor` score that carries any Expedition field is refused (400), and
  an Expedition score without them is refused. The base board stays pure.
- The client side is `G.Exp.submitScore` / `G.Exp.leaderboard(map, diff)`. A board screen comes in D9.

**Version fields:** `G.Expedition.DV = 1` (an integer; bump it whenever Expedition content changes what a run or a
snapshot means).
- **Runs:** every Expedition run carries `G.Modes.run = {mode: 'exp-…', dv, map, diff}`.
- **Replays and spectating:** the replay header and meta, and every live snapshot, carry `dv` (and `map` / `diff`).
  The server's replay-meta allow-list and the live beacon accept `exp-…` modes and `dv`.
- **Watching:** a replay or live run whose `dv` is missing, unknown or newer, or whose mode this build doesn't know,
  plays with a notice: "This replay is from a newer version of Expedition: reload the page to watch it properly."
- **Co-op lobbies** (12b): `G.Social.createRoom({mode})` makes an Expedition lobby whose row, view and start carry
  `mode` and `dv`. A join sends the client's `dv`. An Expedition lobby refuses any other `dv`, or none (409, nothing
  written), and the client says "Your game is out of date: reload." `G.Flow.startCoop` refuses a mismatched start
  too.
- **Base runs, replays and lobbies carry none of these fields**, so every existing replay and lobby stays valid.

**Base unchanged:** the D0a test passes against its fixtures as recorded, with no re-record. So does
`micasurvivor_expedition_forceload_test.mjs`, which runs the same unchanged D0a test with the Expedition code loaded
and frozen in every page before its base sim. Loading the Expedition doesn't leak into the base modes.

**Not yet (later batches):**
- any playable Expedition mode, its map / difficulty pickers and the board screen (D3, D9);
- starting an Expedition co-op run (the lobby carries the fields; `startRun` for a group is still base);
- loading the Expedition renderer for an Expedition replay (D1: done, see below);
- paying runs through `wallet` (D9 / D10);
- the Expedition entries in the Lexicon and Goals.

## DLC D1: terrain layers

An Expedition run plays on a **bounded zone with heights**, the GBA look of Pokémon's ledges and stairs
(`Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md` 5.2). It is Expedition-only: base modes never get a zone, and the D0a
fixtures pass unchanged. The modes are still "Coming soon" (D3 turns Classic on); tests use
`G.Expedition.debugEnable('exp-classic')`.

**The zone** (`js/expedition/terrain.js`, `G.ExpTerrain`): 120 × 120 tiles centred on the world origin. Outside it is
rock, drawn by the base wall painter.
- Every tile has a height 0–3. Neighbouring tiles differ by at most 1, and no plateau is smaller than 14 tiles.
- A cliff is the edge between two heights. A **ramp** (stairs) joins its tile's level with the one above.
- Rock outcrops sit on flat ground, and ponds on low flat ground. Trees, rocks and tall grass come from the generator.
- The spawn is a flat clearing (radius 7) at the origin.

**The generator:** `G.ExpTerrain.generate({seed, map, zone})`.
- It takes the run's world seed, the map (`viridian`, `mtmoon`, `cerulean`, each with its own profile) and the zone
  number.
- It draws only from its own stream, `G.DLC.rng` (mulberry32), never `Math.random`. The same three inputs always give
  the same zone, byte for byte (`zone.hash`, FNV-1a over every grid).
- Steps: three octaves of value noise cut into 4 levels, the clearing, smoothing (no 1-tile ridges or trenches, steps of
  1, small plateaus merged), outcrops and ponds. Land or water cut off by them becomes rock.
- Then **ramps until a flood-fill from the spawn reaches every walkable tile**, with stairs going up to the north
  preferred. More ramps go along long cliffs, one per ~34 tiles of cliff, at least 12 tiles apart.
- Solid props (trees, rocks) only go on a flat 3 × 3 with no other solid prop next to them, so no prop can ever cut a
  path.
- About 50–120 ms per zone, once per zone.
- `G.ExpTerrain.custom(spec)` builds a zone from explicit grids (the tests; later, hand-made shrines).

**Layers:** `zone.mask(tx, ty)` holds one bit per level a tile joins. A plain tile at height h is `1 << h`, a ramp is
`(1 << h) | (1 << (h + 1))`, and a wall is 0. Two tiles connect when their masks share a bit.
- **Collision** (`js/world/world.js`, `collideZone`):
  - Each walking entity keeps the mask of its last good tile (`zMask`) and where that was (`zLx`, `zLy`).
  - A tile of another layer blocks it like a wall: you can't walk up a cliff or step off one (hop-down is D2).
  - A single step that carries the centre straight across an edge (a dash, a knock-back, a jumper's landing) puts the
    entity back on its last good spot.
  - `entity.layer` is the height it stands at (h, or h + 0.5 on a ramp). This is the per-entity z that D2's verbs will
    use.
- **Pathing** (`js/systems/pathing.js`): the BFS field stores each cell's mask and only joins cells that share a bit.
  Ground enemies go round a cliff to its ramp. The straight-line shortcut also has to follow the layers.
- **Flying, ghost and boss enemies** never collide, so they ignore the terrain as before.
- **Projectiles** fly over cliffs. Only walls stop them, as before.
- Without a zone, every one of these branches is skipped.

**Drawing:** the code tile painter (`zone.paint`, run by `chunkImage` over the base chunk) adds, in the biome's own
palette and with no image assets:
- a height tint (low ground ×0.9, up to ×1.17 on top);
- a 6-row rock face on the south edge of a higher tile, and ledge lips and side edges on the other sides;
- drop shadows on the low side;
- stairs on ramps.

**Minimap:** `zone.mini` shades it by height (darker low, lighter high). Cliff faces are dark and ramps are sandy.
`G.Minimap.colorAt(tx, ty)` is the test hook.

**The `x` block v1** `{xv: 1, m: map, z: zone, th: terrain hash}`: terrain is never streamed.
- An Expedition run's live and replay snapshots carry it (the `spectate.snap` seam; the replay keeps it in its slow
  state). So do its co-op host frames, through a new `net.frame` seam in `coop.js` `hostFrame`.
- A replay viewer, a live spectator (`watch-ui.js` `world()`) and a co-op guest (`coop.js` `onHostFrame`) rebuild the
  zone with `G.Expedition.viewZone(seed, x)`. It loads the Expedition code if needed, generates the zone from
  seed + x (`G.Exp.applyX`), checks the hash, and does this once per seed and zone.
- An unknown `xv` is ignored. A base snapshot or frame has no `x`, so nothing runs.
- `G.Expedition.DV` stays 1: no Expedition run could be played before D1 (every mode is "Coming soon").

**What changed in base files:** each change is one `if` on the zone, or on the `x` block.
- `world.js`: `setZone`, `zone`, `maskAt`, `layerAt`, the zone branches in `terrainRaw`, `placeProps` and `collide`, and
  the painter call. `reset()` drops the zone.
- `pathing.js`, `minimap.js`, `watch-ui.js` and `coop.js`.
- `replay.js`: `slowOf` keeps `x`.
- `hooks.js`: the `net.frame` seam.
- `expedition.js`: `terrain.js` in `SCRIPTS`, and `viewZone`.

**Not yet:**
- the movement verbs (hop down a ledge, slide, the extra hop up one layer, glide, climb, surf, bounce pads): done in D2,
  see below;
- the zone timeline, guardian and portal to zone 2 (D3: `G.Exp.enterZone(n)` already builds any zone);
- per-map biome palettes for Mt. Moon and Cerulean (D12; the run still cycles the base biomes every 4 minutes);
- the per-enemy z / airborne column in the `x` block: done in D2 (`x` v2).

## DLC D2: movement verbs

An Expedition run gets PokéBonk's movement, rebuilt as the GBA's ledges, Surf and Fly (`Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md`
5.2). It is Expedition-only: every hook is behind `G.World.zone`, which base modes never have, and the D0a fixtures pass
unchanged. The modes are still "Coming soon"; tests use `G.Expedition.debugEnable('exp-classic')`.

**The verbs** (`js/expedition/verbs.js`, `G.ExpVerbs`, numbers in `K`):

| Verb | Who | Rule |
|---|---|---|
| Hop | everyone | A 0.45 s arc. The sprite rises up to 12 art px and its shadow stays on the ground, smaller. Airborne, ground enemies don't hurt you on contact (flyers and projectiles still do), and you pass over deep water. You can drop off a ledge onto any lower level: you land on the level of the tile under you. You can't hop up a level. |
| Extra hop | everyone (`K.EXTRA_HOPS = 1`) | Hop again in the air: a new arc that also reaches **one** level above the take-off level, so hopping into a cliff face lands you on top. Never two levels; a third press does nothing. |
| Glide | Flying | Hold hop past the top of the arc: the airtime stretches to 1.2 s (a 3-tile gap). Let go and you drop in 0.18 s. |
| Slide | everyone | 0.55 s at ×1.9 the way you move (or face), then 0.9 s of cool-down. Ground only, with a dust trail. |
| Climb | Fighting, Bug, Ghost | Walk up (or down) a cliff face one level at a time, at half speed. |
| Surf | Water | Cross deep water (a liquid tile with liquid on all 4 sides) at ×1.35. Anyone else is blocked by deep water unless airborne; the shallow rim only slows, as before. |
| Bounce pad | everyone | Stepping on a pad throws you 2 tiles its way, along a fixed 0.85 s arc, onto the plateau above, with a squash on landing. |

The types follow the study's PokéBonk reference. A dual type gets both verbs: Gyarados surfs and glides, Scyther climbs and
glides, and Charizard glides. `G.ExpVerbs.verbsOf(types)` is the table.

**Bounce pads:** the generator places up to 8 per zone, 14 tiles apart.
- Each sits on flat ground at the foot of a cliff, with its landing one level up and the tile behind it at its own level.
- They come from their own seeded stream after D1's steps, so D1's grids are unchanged. They are part of `zone.hash`.
- They are painted in code by the terrain painter, with an arrow chevron the way they throw you: a red mushroom, or a coiled
  spring where the liquid is lava. There are no image assets.
- `G.ExpTerrain.custom({pads: [[tx, ty, dir]]})` places them by hand.

**Input** (Expedition runs only; a base run's controls are unchanged):

| | Hop (hold: glide) | Slide |
|---|---|---|
| Keyboard | Space | Shift |
| Pad | confirm: A (Xbox A, PlayStation Cross, Nintendo A) | cancel: B (Xbox B, PlayStation Circle, Nintendo B) |
| Touch / mouse | the HOP button, to the left of the Z-move button | the SLIDE button, above HOP (to the left of MAX) |

- In a base run, confirm and cancel do nothing in play, so giving them a meaning in an Expedition run changes no base
  binding. They follow a remap, and there is no new remappable action, so the Controls screen and saved maps are
  unchanged. `G.Pad.held(action)` is new (hold to glide).
- The buttons show the key (Space / Shift) on desktop and the pad glyph in pad mode, like the Z and MAX buttons. A label
  under each button names the verb ("Hop · Glide" for a Flying type), and a chip above SLIDE names what the types add
  (Surf, Climb).
- The buttons are pressed on `pointerdown` on the canvas, not through `G.Touch`'s button callback, which drops a second tap
  on the same spot within 350 ms. The extra hop is exactly such a quick second tap. They are still registered with
  `G.Touch`, so a finger on them never opens the joystick.
- Layout: at 844 × 390 and 667 × 375 the buttons are on screen and overlap nothing else on the HUD (`G.HUD.rects()`:
  `hop`, `slide`). Portrait is the game's "rotate your phone" prompt.

**Where it hooks in** (each one an `if` on the zone, or on a field only Expedition code sets):
- `player.js` `update`: `G.ExpVerbs.step` before the move and `after` once collided (the landing). Airborne, you are not
  "in" liquid.
- `player.js` `draw`: the lift, the smaller shadow, the wake / dust, and the squash.
- `world.js` `collideZone`: the player's own tile rule, its airborne levels and a climber's reach. Enemies keep D1's rule
  exactly.
- `combat.js`: no ground contact while airborne.
- `pad.js` `gameplay`, and `held`.
- `hud.js`: the buttons.
- `coop.js`: a guest's frame goes through the `net.frame` seam too, with no mate, and the air rows are applied both ways.
- `watch-ui.js`: the air rows on the puppets.
- `replay.js`: field 7.
- `expedition.js`: `verbs.js` in `SCRIPTS`.

**The `x` block v2** `{xv: 2, m, z, th, a}`: the terrain part is v1's, and `a` is the airborne state.
- `a.p` is the player's air row `[lift, verb, layer × 2, phase cs, airtime cs, hops]`. Verbs: 1 hop, 2 glide, 3 bounce,
  4 slide, 5 surf, 6 climb.
- `a.q` holds the co-op players' rows: by uid in a host frame (the host and the other guests), by name in a snapshot (the
  partners in the air or using a verb).
- `a.e` lists the leaping enemies, `[id, lift, …]`. Their layer is the zone's under them.
- A viewer plays the rest of an arc from its phase. A hop that came and went between two snapshots (the hop counter went
  up) is still played, so a 1-a-second live view shows the hops too.
- **Co-op:** the host's frames carry every row. A guest's frames to the host carry its own row (`net.frame` with no mate).
  The host keeps it on the mate for its frames and snapshots.
- **Replays** keep `a` out of the slow state, in frame field 7, written only when it changes. A hop costs a few bytes, not
  a slow-state rewrite. A base replay has no `x`, so its frames are unchanged (the D0a replay fixture still matches).
- **The v1 reader is kept:** a v1 block still rebuilds the terrain, and everyone is shown on the ground.
- `G.Expedition.DV` stays 1 (no Expedition mode is playable yet).

**Deviations from the study:**
- Everyone has the extra hop for now. The study gives it to an item; D5 can set `K.EXTRA_HOPS` to 0 and raise
  `player.extraHops` with the item.
- Slide is on B, not RB, so RB keeps "next move" as in every base run.
- A pad re-arms 0.5 s after you land, not 25 s: in 2D it's a route up.

**Not yet:**
- Shed Shell-style slide i-frames, +25% airborne damage, and the landing shockwave. These are items and passives for
  D5 / D6; `player.air` and `player.landed` are ready for them.
- Deep water blocks only the player: ground enemies still wade it, and pathing is not deep-aware yet (D3).
- The local co-op partner has no verbs: its AI and player 2's pad walk as in D1.
- Hazards (mud, brambles, burning ground) are not passed over yet; they arrive with Survival.
- Chasm and lava gaps for gliding arrive with the later maps.
- Sound: the verbs reuse the select click.

## Tests

- `node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs` (DLC D0a): the golden runs of every base
  mode (see "DLC D0a: base-unchanged harness" above); `--record` only for a deliberate base change.
- `node overworld/tests/micasurvivor_expedition_forceload_test.mjs` (DLC D0b): the same unchanged D0a test with the
  Expedition code force-loaded (and the base tables frozen) in every page before its base sim; it must still match the
  D0a fixtures.
- `node overworld/tests/micasurvivor_expedition_plumbing_test.mjs` (DLC D0b), the real handler behind a static server:
  lazy loading (the network log: no js/expedition/ fetch on a base boot or run, guest or signed in; then exactly
  save.js + core.js once); the Expedition group by mouse, touch (844x390) and pad, "Coming soon", starting nothing; the
  freeze throwing on 14 kinds of write and changing nothing, its cost, and the sim's cost frozen vs not; the Expedition
  save's round trip, a 409 merge with another device, a lower counter not going back, a guest's local progress carried
  into the account once; the Expedition board vs the base board; an Expedition run's mode / dv on the run, snapshot,
  replay header, meta and shared row, with the base save byte-equal; the newer-dv notices for replays and live runs;
  the lobby's dv gate (join and start) and a base lobby unchanged; no Spanish in English.
- `node overworld/tests/micasurvivor_expedition_terrain_test.mjs` (DLC D1): the generator's determinism (same
  seed + map + zone, no `Math.random`), heights and steps, every walkable tile reachable (the game's own
  `walkable` + `maskAt`, on the run's zone and 45 others, with props as walls too), the player blocked by a cliff and
  up / down a ramp, a ground enemy going round to the ramp (and never up without one), a flyer straight over, the
  minimap shading, the `x` block on snapshots, host frames and the replay, a fresh page rebuilding the same zone as
  replay viewer, live spectator and co-op guest, a later Normal run without a zone, and the painted zone at desktop
  and phone size (`SHOTS=<dir>` saves screenshots). (D2: it checks `xv: 2`, and an unknown schema is now `xv: 99`.)
- `node overworld/tests/micasurvivor_expedition_movement_test.mjs` (DLC D2), on hand-made zones at a normalised speed:
  - hopping off a ledge onto the level below, with no ground contact damage in the air (a flyer still hits);
  - the extra hop reaching exactly one level;
  - Pidgey gliding across a 3-tile deep pond, Squirtle surfing it at ×1.35, Machop climbing a cliff at half speed and
    back down, and Charmander (and the wrong types) doing none of those;
  - the type table;
  - a bounce pad onto the plateau, and the generator's pads;
  - slide and its cool-down;
  - the HUD buttons by mouse, the gamepad's confirm / cancel / hold-to-glide, and a Normal run untouched;
  - the `x` block v2 on snapshots, host and guest frames, the replay's field 7, and a v1 rewrite of the replay still
    loading;
  - a fresh page as co-op guest (a host frame through `G.Net`'s handler), live spectator and replay viewer, seeing the
    player in the air;
  - the phone layouts (844 × 390 and 667 × 375) with taps, the double tap and the slide.

  `SHOTS=<dir>` saves mid-hop / mid-glide / mid-surf screenshots at desktop and phone size.
- `node overworld/tests/micasurvivor_boot_test.mjs` covers boot (no console errors, no external
  requests), guest start, a 30 s bot run with level-up picks, and the save round-trip through a
  reload.
- `node overworld/tests/micasurvivor_phone_test.mjs` is the 390px phone smoke test (touch
  controls).
- `node overworld/tests/micasurvivor_pad_test.mjs` covers the controller with a synthetic Gamepad
  API: a guest's pad working (no sign-in gate), title to run with the pad only, every menu screen, the gacha, layouts, remap
  with swap-on-conflict surviving a reload, stick and D-pad movement, pause, level-up reroll and
  pick, glyphs switching between keys and pad, rumble, and hot-plug.
- `node overworld/tests/micasurvivor_server_test.mjs` (M3): the save actions (login, exact key,
  shape, size cap, 409 on a stale revision, one winner in a race, rate limit), the `micasurvivor`
  board, and the wiring (cabinet tiles, sprite, landing tile, sitemap).
- `node overworld/tests/micasurvivor_account_test.mjs` (M3): the real server in the loop — playing
  as the Magepunk user, two devices merging, the guest carry-over (take over / merge / decline),
  the leaderboard screen.
- `node overworld/tests/micasurvivor_arcade_test.mjs` (M3): the Pewter Museum cabinet, walked to
  and opened with the overworld controller, and the way back.
- `designwiki_micasurvivor_test.mjs` and `magepunknews_micasurvivor_test.mjs` (M3): the wiki
  section and the news entry.
- `node overworld/tests/micasurvivor_mechanics_test.mjs` (M5 batch 1) steps a paused run by
  hand and checks every rule above with numbers: kills per type (a real kill, saved, back after a
  reload, merged by max), each status's duration, boss resistance and immunity, frozen +25%, sleep
  +30% and wake, paralysis speed / attack rate / +35% electric, confusion infighting, Darkrai, the
  cc moves and their roll through the real projectile code, Hypnosis, Dream Eater, choosing
  Colossal Cyclone in the real level-up screen, the Big Orb hook, EVO_EXTRA, knockback per level
  (a real Hydro Pump hit), Calibre scaling (a real aura and Ember shot) and its cap, and the
  English of every new string.
- `node overworld/tests/micasurvivor_abilities_test.mjs` (M5 batch 2): the 54 abilities and the
  966-entry table; every fx key handled and every ability measurably doing something (no silent
  no-ops); each family with the port's numbers (pinch, flat stats, weather speed and immunity,
  contact chances through the real contact loop and over 4000 rolls, type halving, Solid Rock,
  Multiscale's 25 s, Sturdy's 90 s, Defiant's 4 s, the Moxie steps and cap, Tinted Lens, Mold
  Breaker, Iron Fist / Mega Launcher through real casts, Levitate against real traps); swapping an
  ability back exactly; and the HUD chip, the Pokédex, the partner card, the result, the starters
  and the pause screen, in English.
- `node overworld/tests/micasurvivor_items_test.mjs` (M5 batch 3), logged in with a stubbed account
  row: the 26 items and 17 upgrades (order, icons, costs, English); buying Caliber / TM / Second
  Chance / Backpack in the real screen; the TM editor driven by a synthetic gamepad; the upgrades
  and the TM pick reaching the account, surviving a reload and a 409 merge (max levels, a clamped
  hand edit); a run with them; every new item's effect with numbers (a real Ember for Type Gem, the
  real contact loop for Never-Melt Ice, real traps and sandstorm for the Boots and Goggles, the
  spawner for Pure Incense, 3000 rolls for the species locks); Rare Candy; carrying two (auto-fill,
  the 3-card choice, keys, HUD); Second Chance revive and knockback; the Focus Sash regression.
- `node overworld/tests/micasurvivor_zmoves_test.mjs` (M5 batch 4), logged in with a stubbed account
  row: the 18 Z-moves (names, numbers, icons, English); each unlock route (the 250th kill, the
  mission paying once, 3 % of x10 pulls over 30000 rolls only for locked types, the real pull and
  gacha screen); the Z-Crystals tab; the Pokédex choice picked with a synthetic gamepad; the account
  push and a 409 merge (union, newest choice per Pokémon), `merge()` both ways, `sanitize()`; in a
  run the level-15 gate, locked types, the type following the active Pokémon, the Tower / rift /
  Judgment blocks, the real-time cinematic freeze, invulnerability, the cooldown after the end, the
  damage formula through a real hit, the 28 % boss cap; all 18 plans (duration, damage, their own
  effects); the Z key, the HUD button clicked on the canvas, the pad's zmove (L3), the right trigger,
  Y, remap with swap-on-conflict, an old saved map gaining zmove, the HUD glyph.
- `node overworld/tests/micasurvivor_dynamax_test.mjs` (M5 batch 5), logged in with a stubbed
  account row: the port's numbers and STATUS table, English strings; locked on a new save; the
  unlock by a real den clear (arena won), reaching the account, a 409 merge and `merge()` both
  ways; the level-20 gate; every stat x1.3 and max HP +30 % reverting exactly (a cooldown card taken
  meanwhile kept), HP in proportion, 60 s; the size steps; pulse cadence (40 in 60 s), radii,
  damage through a real hit and x1.9, the status of every type; the 240 s cooldown and the den
  recharge; falling and the swap hook; the Tower / Judgment blocks and arenas allowed; den odds over
  200000 rolls and thousands of real `G.Rift.update` checks (never before 120 s or in Rift Time
  Attack), 30 s open; the den boss (tier, HP, XP, x1.5, aura, Max Move with its 16 zones); the
  rewards; the C key, the MAX button clicked, the pad (View, left trigger, X), remap, an old map
  gaining dynamax, the glyph; the Dynamax card on the missions screen.
- `node overworld/tests/micasurvivor_modes_test.mjs` (M5 batch 6), logged in with a stubbed account
  row: the port's numbers and daily formulas, every new string in English; the modes screen by mouse,
  touch (phone tap) and pad (focus, confirm, cancel out of the picker), modifier switches, the type
  button, the party picker; the Daily (today's Pokémon and rule, the same world / cast / bosses /
  moves twice, another date differs, its best keyed by date, x1.25 coins, stats); Party (an unowned
  Pokémon, no death, nothing saved); Rift Time Attack (20 / 8 / 6 s checks, always a rift, a boss
  blocks, never a den in 2000 checks, none in the last 40 s, the countdown HUD, 8:00 waits for the
  arena, the record, coins); Survival by Type (cast, bosses, dens, 10 minutes, coins, the HUD tag);
  the 6 modifiers (factors through `EnemyMgr.add`, once across a stash, the spawner's horde factor,
  Fragile, No healing against heals, regen and a max-HP card; mn / mb stats; achievements); the ban
  (B key, click, pad action, only new moves, never offered again in 600 offers, free, 0 = hidden;
  Dynamax from the ban button in a run; remap and migration); the account push, a 409 merge and
  `merge()` both ways; English on every new screen. `ONLY=3,7` runs just those sections.
- `node overworld/tests/micasurvivor_team_test.mjs` (M5 batch 7), logged in with a stubbed account
  row: the port's numbers, the `swap` pad action, the team achievements, missions and the Fairy
  Z-mission, English; `team_list` (partner, order got, cleaning, a team of 2, locked at 1); the Team
  card and picker by mouse, touch (phone) and pad; a run: Tab, a HUD card click, the swap button
  (click and tap) and R3; the cooldown, the level-up block, HP per member, the shared max-HP gain,
  level / XP / moves / item, species / types / stats / ability, bench recovery, Dynamax ending, No
  healing; fainting after a Second Chance heart, the auto-swap ignoring the cooldown, the end, coins
  with modifiers, stats, achievements and missions (only team runs); no Spanish on the canvas or the
  screens; the account push, a 409 merge and `merge()` both ways.
- `node overworld/tests/micasurvivor_tower_test.mjs` (M5 batch 8), logged in with a stubbed account row:
  the port's numbers, the 15 risk and 4 legendary cards with their exact effects, icons, achievements,
  missions and the Rock Z-mission, English; every floor's boss (pool, HP, damage, Eternatus, Arceus) and
  reward; the Tower card and the "Starting floor" checkpoints by mouse, touch and pad; a run: the Z-move /
  Dynamax block, relics, XP x0.65, the HUD line, the boss at 50 s and its scaling, the floor clear (reward,
  the boss counted, enemies cleared), the rest and pact pickers by keys, mouse and pad (RB, confirm, cancel
  = No risks), every pact fired (player stats, a real hit, new enemies and bosses, the spawn rate, coins,
  heals, kills), the 6-pact cap, the shield, Boss contract and Double baggage through real clears, bonds,
  escorts, Arceus's last breath and the clear screen; resuming from a checkpoint, the fail screen, missions
  (only Tower runs), the Rock Z-crystal; no Spanish on the screens or the canvas; the account push, a 409
  merge, `merge()` both ways and `sanitize()`.
- `node overworld/tests/micasurvivor_bossrush_test.mjs` (M5 batch 8), logged in with a stubbed account row:
  the port's numbers, achievements, missions and the Bug Z-mission, English; the boss order and scaling
  (24 bosses x 40 draws); the card by mouse, pad and touch; a run: nothing but bosses, the warning, the
  first boss at 5 s, the heal / magnet drops, 8 s between bosses, scaling x1.1 for the second, the third a
  legendary, a Tough modifier, Z / Dynamax allowed, no rifts / Judgment / events past minute 30, biomes
  every 150 s; the end (record, rushRuns, coins, achievements, missions, a worse run keeping the record);
  the account push and a 409 merge.
- `node overworld/tests/micasurvivor_adaptive_test.mjs` (M5 batch 9), logged in with a stubbed account row:
  the port's numbers and English; the adaptive formula at four player states (new, 4 runs, mid, maxed)
  measured on real spawned enemies and bosses (HP, damage), the XP per level, the real spawner's rate, the
  horde interval, the 45 s suffering window and its caps, the glide, off in the rift arena and every other
  mode, with modifiers, the Tower's shared counts; the "Challenge: N%" HUD and its colours (hidden when off,
  in the Daily and in the Tower); the setting by mouse, touch and pad, the account push, a reload, a 409
  merge, `merge()` both ways, `sanitize()`; the Daily (no adaptive, two identical seeded starts including
  the biome extras); biome spawns (the bag's weights, 4000 real spawns per biome, the extras' rules for
  every tier and biome, the fallback, preloading, the biome weather); Survival by Type winning, the Tower's
  floor biomes; the support caps through 10 simulated minutes of the real spawner and enemy AI (minions,
  per-summoner stop, shields per cast and the 14 s lock), healers x0.9 above 4.
- `node overworld/tests/micasurvivor_display_test.mjs` (M5 batch 10), logged in with a stubbed account row: the
  port's numbers and English; the minimap's contents read from what it drew (you, an enemy at a known offset, one
  beyond 12 tiles, a near and a far boss pinned to the rim, the rift and a den, props by the radar rules, the fog's
  explored disc) and when it hides; the switch; the field of view moving the real camera live (100 / 165 / 200 %,
  clamps, 130 % on a phone, unchanged by Dynamax and the Tower); the UI scale measured on real DOM and HUD sizes,
  its caps, touch areas, Reset, and nothing overflowing at the min / max on 1280 x 720 and 844 x 390; no overlap
  between the minimap and any HUD element in a busy run at three scales on desktop and phone (and with the fixed
  joystick); the pad on both sliders and the pause screen's; device-local persistence after a reload.
- `node overworld/tests/micasurvivor_progress_test.mjs` (M5 batch 11), logged in with a stubbed account row: the port's
  full achievement list (the 58 added with their goals, tiers, rewards and titles, the category's place) and both
  mission lists in the port's order, English; every new achievement unlocked by a real kill (not one short) and
  paying exactly its reward, dual types, the Judgment exception; the mission rotation against a reimplementation of
  progress.gd over 10 days / accounts and 400 days, the reroll; each new mission counting only its own mode, then
  real runs of each mode ended by the game, claiming; titles: the list, Use / Locked, equip by mouse, touch and pad,
  the profile select, the menu, the public profile, the account row, a reload, a 409 merge (the later title, the max
  of each stat) and `merge()` both ways; damage attribution in a controlled run (2 moves, Rocky Helmet through the
  real contact, a Z-move, Dynamax, a burn tick) against the HP each really took, the kill, the row order, the
  largest-remainder percentages, Partner / team, and the run-over table (12.0k, %, headers); the trainer card
  against the save by mouse, touch, pad and Esc; no Spanish on any of these screens.
- `node overworld/tests/micasurvivor_encyclopedia_test.mjs` (M5 batch 11): the Lexicon's tabs, the port's status
  texts and every entry list; reaching it by mouse, touch and pad, Back / B / Esc; every one of its 1,178 entries
  opening (all 966 Pokémon included); on each tab an entry opened by pad and by touch; unlock tracking against the
  save (items found, moves evolved, Z unlocks, Dynamax before / after dens, owned Pokémon, mode records, relics,
  the Tower boss log); no Spanish on any tab or entry.
- `node overworld/tests/micasurvivor_localcoop_test.mjs` (M5 batch 12a), logged in with a stubbed account row and
  two synthetic gamepads: the port's numbers and the move per type; who the partner is (pick, fallback, sanitize,
  merge by the newest pick, the account push and a 409); the Co-op card and "Choose partner" by mouse, touch
  (844x390), pad and Esc; an AI run (following, standing still, engaging, the leash teleport, hidden in a rift
  arena, its shots from YOUR attack and size at ×0.8 and ×1.15 cooldown, the move level, real hits counted as
  Partner / team, the minimap dot, the HUD chip fitting at phone width); player 2 (the second pad's stick, the
  deadzone, no buttons, player 1 keeping the pause menu, disconnect -> AI and connect -> P2 with toasts, player 2's
  presses never taking player 1's seat); fainting (Second Chance first, spectating, the partner taking your hits
  ×0.8 with its type, no Z / Dynamax, the revive after 20 s, the run ending when it falls); the run end (-20 % coins
  measured on the result, coopRuns / groupRuns and "In good company", the Partner / team row, a short run, a normal
  run without a partner); no Spanish on the screens or the canvas; the Lexicon entry.
- `node overworld/tests/micasurvivor_lobby_server_test.mjs` (M5 batch 12b): the msurv-* actions against the real
  handler over sqlite, counting row writes: login, friends-only joins (a non-friend and a one-way friendship refused,
  nothing written), up to 4, two joins racing both landing, ready / start (refused until all are ready; seed, host and
  members stored), reopen, a guest leaving and the host leaving (exact keys only, the other lobby untouched); the
  lifetimes (a waiting lobby's 60 s TTL, a silent guest dropped after 45 s, a started lobby's 10 min, invites' 3 min,
  presence once a minute, an unchanged poll writing nothing); invites (friends only, host only, the bell message
  once, a forged invite row ignored, `_` in usernames not matching other users' rows); signalling (one row per sender,
  only your part, `since`, the 24 KB / 48 caps, members only, no access across lobbies); the relay (one row per push,
  the 1000 ms floor, the 16 KB / 30 / 64 KB caps, acks, members only, stale rows ignored, the per-account rate limit);
  the relay's daily minutes on an injectable clock (`globalThis.__msurvClock`): a minute counted once whoever writes,
  30 minutes then 403 {budget} for pushes and pulls with nothing written, the lobby's minutes left, signalling and the
  lobby (direct play) unaffected, per host across its lobbies (another host still relays), a new UTC day a new row;
  the GC prefixes and the login gate.
- `node overworld/tests/micasurvivor_online_test.mjs` (M5 batch 12b): the real handler behind a static server and
  three signed-in friends in separate browser contexts (+ two more for the relay, + a guest): Friends (presence, "You
  play as"), "Play with friends", invites (popup in MicaSurvivor, the bell row), joining, the lobby (members, Pokémon,
  ready, connection, Start gated on ready, 844x390 fit), WebRTC data channels opening on localhost (host candidates, no
  STUN) and the signalling stopping; one seed for all; positions both ways (keyboard), a guest's kill dying on the
  host, the team's kills, the shared level-up and its wait ("Waiting for bob and carl…") releasing for all; a guest
  closing the tab (the host goes on: "carl left the game"); the host's renderer crashing (the guest's run ends: "Lost
  connection to the host.", rewards saved locally and in the account, back to the menu); the relay with WebRTC off
  (falls back, "Connected (via server)", "Relay: 30 min left today" for host and guest, positions and a kill over the
  relay at 1 update a second (≤ ~1 write a second per player, the minute row once a minute, relayed partners marked
  for smoothing), joining by touch and getting ready by pad, the host quitting: "The host has ended the game", back in
  the reopened lobby; then a second run whose relay minutes run out: the guest's run ends with the used-up message and
  its rewards, the host plays on and is told why, the lobby says it and keeps Start off); a guest told to sign in (and making no co-op request); no Spanish in the DOM, toasts or canvas.
- `node overworld/tests/micasurvivor_spectate_server_test.mjs` (M5 batch 12c): the real handler over sqlite:
  publishing (login, a friendless player writes nothing, the beacon at the start / every 5 min / on a group change /
  at the end, NO snapshot row without a fresh watcher, the 900 ms floor, the 60 watched minutes a day, caps and
  validation), watching (friends both ways, a non-friend and a one-way friend refused with no write, waiting / snapshot
  / unchanged / over / stale / not live, the 4 s heartbeat, the 10-viewer cap, `_` in names), `live-friends` /
  `friends`, the TTLs and GC prefixes, replays (put / public get with no token above the auth gate, packed / unpacked /
  frame caps, validation, the meta allow-list, a retried upload, the 10-per-player cap that never deletes another
  player's row, the list) and no cross-user writes.
- `node overworld/tests/micasurvivor_spectate_test.mjs` (M5 batch 12c): the real handler behind a static server and
  separate browser contexts: the replay codec round-trip; alice's unwatched run (1 write: the beacon); bob sees her
  under "Live now", watches, and his view follows her position, enemies (species / position / HP), HP, level, the
  level-up screen and its banner, at 844x390 too; the write cost while watched; bob's keys and clicks do nothing to her
  run; the recorder's per-frame cost; her run ends (his summary card); she shares the replay (the link copied, 2
  writes, a retry stores nothing), carl with no account opens it, seeks, plays at 1× / 4×, pauses, reaches the summary;
  an unknown id; her recent runs; a non-friend refused; a local co-op run and an online co-op group (watched through
  the guest) watched; Esc back to the menu; no Spanish (DOM and canvas).
  In CI the WebRTC part runs with `--disable-features=WebRtcHideLocalIpsWithMdns` (real localhost host candidates)
  and `window.__msurvNet = {ice: []}`; the relay part with `{noRtc: true}`.
- `node overworld/tests/micasurvivor_pokedex_test.mjs` (batch B1): every dex 1..1025 is in the game or pending art,
  every sheet of every Pokémon on disk with its meta's geometry, the 17 new ones loading in the browser, spawning
  in a normal run (forced into the cast), as bosses, the legendaries as rift bosses, their Lexicon entries and
  English names. Batch B1b: the 24 follower-based ones the same way (sheets decode, they spawn, Zarude as a rift
  boss), drawn at their neighbours' size (sampled pixels) and facing the way they walk.
- Set `MICASURVIVOR_SHOTS=<dir>` to save screenshots.
