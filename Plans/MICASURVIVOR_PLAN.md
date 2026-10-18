# MicaSurvivor — plan (owner request, 2026-10-16)

> "We are going to build MicaSurvivor, it will have a tile on the main page like Micatro but also
> attach it to an Arcade box that we will put in Pewter City. Extract the value from the android
> port's superior controller support. After we port this into our project we will be adding all
> the fakemon to it but we have some graphical hurdles to clear before that point so we can port
> it as is for now."

MicaSurvivor = **PokéSurvivor** by JPTER78 (https://github.com/JPTER78/pokesurvivor), a browser
bullet-heaven / horde-survival roguelike with a character gacha, 966 Pokémon in Mystery Dungeon
sprites — ported into the Magepunk site as-is, with the controller support of the Godot Android
port (https://github.com/JayElDragon/poke-survivor) brought over.

## 0. What's there (inventoried 2026-10-16)

**Web original (JPTER78/pokesurvivor, HEAD 5bbc3b2, 2026-10-15).** Plain HTML/CSS/JS, no build
step needed to run (it ships `js/app.min.js` built from `js/` by `tools/build.js`). ~20k lines:
- `js/core` audio, camera, db (save), i18n, input (keyboard/mouse), touch (virtual stick),
  settings, sprites, updater, firebase-config
- `js/entities` player, enemy, projectile, pickup, fx, vfx · `js/systems` combat, spawner,
  levelup, rift (legendaries), judgment (Arceus), gacha, progress, events, hazards, weather, pathing
- `js/ui` menu, hud, gacha, goals, ranking, social, login, settings, slots, news, support
- `js/net` net, coop (WebRTC up to 4 players), ranking, social — **Firebase** (auth, Firestore)
- `js/data` pokedex (966), moves, items, enemies, starters (29), upgrades, achievements,
  missions, music (procedural), lang-en (UI is Spanish-first, full English pack)
- assets: **13,481 files / 104 MB**, almost all `assets/pokemon/<dex>/` PMD sprite sheets
- Static site extras (guia/, pokedex/, objetos/, legendarios/, novedades/…): SEO pages, not the game.
- **No gamepad support at all** (no `getGamepads` anywhere).

**Android port (JayElDragon/poke-survivor, Godot 4, MIT).** Same game rebuilt in GDScript. Its
controller layer is what we take — the *design*, re-implemented in JS on our gamepad core:
- `scripts/pad.gd` — 10 remappable **actions**: prev / next move, pause, confirm, cancel,
  reroll, ban (card), swap (team mode), Z-move, Dynamax. Defaults (Xbox): LB/RB, Start, A, B,
  Y, X, R3, L3, Back. **3 layouts** (Xbox / PlayStation / Nintendo — Nintendo swaps confirm and
  cancel). Remap with **swap-on-conflict** (binding a button another action used trades them).
  Reset per layout. Saved in settings.
- `scripts/padicons.gd` — on-screen **button glyphs** per layout (A/B/X/Y, ✕○□△, B/A/Y/X,
  shoulders, sticks, D-pad) so every prompt shows the right button.
- Menus fully **focus-navigable** (D-pad / left stick move focus, confirm/cancel), pause UI,
  card choice (level-up) with reroll/ban on face buttons, left stick moves the player.

## 1. Licences — must be honoured

- **Code:** PolyForm **Noncommercial** 1.0.0 for everything after commit b297089 (14-10-2026);
  MIT before that. The site is free with no ads or purchases, which is a permitted purpose.
  Obligations: ship the licence text (or its URL) and the line
  `Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)`.
  **MicaSurvivor must never get ads, paid items or anything sold.**
- **Sprites:** SpriteCollab, **CC BY-NC 4.0** — non-commercial, attribute every artist
  (their CREDITS.md table) → a Credits screen in-game + a credits page.
- **Android port:** MIT (JayElDragon) — credit it for the controller design.
- Pokémon names/designs: same fan-project footing as the rest of the site; credit Nintendo /
  Creatures / GAME FREAK as the original does.

## 2. Phases

### M1 — Port as-is (playable, offline)
- Vendor the web game into `micasurvivor/` (source `js/` modules + `index.html` + `css/`; drop the
  SEO sub-sites, Firebase config, donation/support UI, updater/forced-update).
- Assets (13.5k files) go to their **own Cloudflare Pages project** `magepunk-micasurvivor` (like
  `battlecards/art` and the Micatro mod art), gitignored, served via `_redirects`; deploy script
  `npm run deploy-micasurvivor`.
- Networking stubbed: no Firebase. Guest/local play works fully (save in localStorage, per
  Magepunk user key when logged in).
- English by default (keep Spanish + the other languages selectable).
- Licence + Required Notice + full sprite credits shipped.
- Tests: boots headless, starts a run, survives N seconds with a bot, level-up card pick works,
  save round-trips.

### M2 — Controller support (from the Android port)
- `micasurvivor/js/core/pad.js` on top of the site's gamepad conventions (see
  `site`/overworld/Battlecards pad modules; site standard is the Nintendo-style layout option):
  left stick + D-pad move, deadzone + radial scaling, the 10 actions with defaults per layout,
  **remap screen with swap-on-conflict**, reset to defaults, layout picker (Xbox / PS / Nintendo).
- Button **glyph prompts** everywhere a key/button is shown (HUD, card choice, menus, pause).
- Every menu/screen **focus-navigable** with a visible focus ring; cancel = back everywhere.
- Hot-plug, multiple pads (first active pad drives), rumble on hit if supported (optional).
- Tests: synthetic Gamepad API in puppeteer — move, pick a card, reroll/ban, pause/resume, remap
  persists, navigate every menu without mouse/keyboard.

### M3 — Into Magepunk
> **Built 2026-10-17** (branch `feat/micasurvivor-m3`; details in `micasurvivor/README.md` → "Magepunk
> (M3)"): landing tile, the cabinet in the Pewter Museum 1F lobby (15,8), Magepunk accounts
> (`micasurvivor-save-get/-put`, revision compare-and-set + upstream's merge, once-only guest
> carry-over with a backup), the `micasurvivor` run board, the design wiki section and the news
> launch entry. Log out / Delete account stay hidden (the account is the site's; Settings shows the
> Magepunk username and a link to Magepunk). Live spectating stays optional/later.
- **Landing-page tile** like Micatro/Pair of Pears (index.html game tiles).
- **Arcade box in Pewter City** (overworld arcade-box pattern: Route 1 → PokéChess, Celadon →
  Micatro cabinet): pick a sensible indoor spot (e.g. the Pewter Museum lobby or a house), a
  cabinet sprite, interaction opens MicaSurvivor (same flow as the other arcade boxes), works with
  the overworld controller too.
- Accounts: logged-in players' progress (Pokémonedas, collection, upgrades) saved to `/api/mp`
  (exact keys, guarded, `micasurvivor:<user>`), local for guests.
- **Leaderboard** (time survived, solo) on our run-score board (`mode: micasurvivor`), replacing
  their Firebase ranking.
- Live now / spectating (optional, later): publish snapshots like Micatro.
- Design wiki section + Magepunk News entry.

### M4 — Later (not now)
- Co-op (their WebRTC host-star) with our accounts/friends for signalling.
- **Fakemon**: add the 623 fakemon as playable/enemy Pokémon — blocked on graphics: the game needs
  PMD-style multi-direction animated sheets; our fakemon only have battle/front-back sprites. To be
  planned separately once the sprite pipeline exists.

### M5 — Every mechanic from the Android port (owner, 2026-10-17: "any and all missing mechanics")
Audit (Godot port vs web, 2026-10-17) found these missing; ported in this order, one batch per PR,
each with tests and the matching controller action wired into js/core/pad.js once the feature exists:
1. **Foundation** *(built 2026-10-17, branch `feat/micasurvivor-m5-b1`; README → "Mechanics from the
   Android port")*: per-type kill tracking; enemy status effects (freeze, paralysis, sleep, confusion,
   boss resistance/immunity); Hypnosis + Dream Eater; 9 alternative evolutions + Big Orb route;
   knockback by move level; the "Calibre" stat card.
2. **Abilities** *(built 2026-10-17, branch `feat/micasurvivor-m5-b2`; README → "Batch 2: Abilities")*:
   54 passives, one per Pokémon (shown in HUD / Pokédex / partner / starters / pause).
3. **Items +15** (incl. Rare Candy, Light Ball/Thick Club, Weakness Policy…), carry 2 items,
   **upgrades +4** (Calibre, TM, Second Chance, Bag) — keep the web's free reroll.
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b3`; README → "Batch 3: Items and upgrades")*
4. **Z-moves** (18 types, cinematic, unlocks by kills / Z-crystal missions / gacha crystal).
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b4`; README → "Batch 4: Z-moves")*
5. **Dynamax + raid dens**.
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b5`; README → "Batch 5: Dynamax and raid dens")*
6. **Quick modes**: Daily Challenge, Rift Time Attack, Type Survival, Party, 6 modifiers; the
   in-run level-up card **ban** (owner asked for it).
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b6`; README → "Batch 6: Quick modes, modifiers and the card ban")*
7. **Team mode** (2–3 Pokémon, swap mid-run).
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b7`; README → "Batch 7: Team mode")*
8. **Boss Rush**, then the **Tower** (30 floors, risk pacts, relics, checkpoints).
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b8`; README → "Batch 8: Boss Rush and the Floor Tower")*
9. **Adaptive difficulty**, biome-themed spawns, enemy support caps.
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b9`; README → "Batch 9: Adaptive difficulty, biome spawns and support caps")*
10. **Minimap**, field-of-view slider, UI scale.
   *(built 2026-10-17, branch `feat/micasurvivor-m5-b10`; README → "Batch 10: Minimap, field of view and UI scale")*
11. **Achievements/missions/titles** (+93 / +13 / more missions), run damage breakdown,
    in-game encyclopedia, trainer card.
12. **Local co-op partner** (AI or 2nd pad).
13. **9 more languages** (Godot %s -> {x} converter; CJK fonts).
Not ported: Android-only parts (APK updater, notch insets beyond CSS env(), save codes, keep-awake).
Kept as the web has them unless the owner asks: altar powers (port redesigned them), melee balance.

## 3. Owner decisions (2026-10-16)
1. **Version: latest HEAD under PolyForm Noncommercial** — MicaSurvivor never gets ads, paid items
   or anything sold; ship the licence + Required Notice + sprite credits.
2. **Arcade box: the Pewter Museum lobby.**
3. **Economy: keep the gacha + Pokémonedas as-is** (all earned in play, nothing bought).

## 4. Execution order
M1 → gate → merge · M2 → gate → merge · M3 → gate → merge · M4 parked.
