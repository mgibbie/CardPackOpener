# MicaSurvivor — unified UI, multiplayer, coverage and replays

Status: PLAN (2026-11-02). Owner request:
1. One character picker for every mode.
2. Then a category: Survival / Expedition (Bonk) / Dive.
3. Then its variant.
4. Then players: solo / local / online with friends. Build the multiplayer where it isn't fleshed out.
5. Then a final screen: map, run modifiers, difficulty.
6. The whole flow styled like Micatro and good with controllers.
7. Then a sweep so every mode has all 1025 species, all Megas and all regional formes playable AND as enemies.
8. Then a unified replay system for all 3 categories that handles long runs and multiplayer.

## What exists today (research 2026-11-02)

### UI
- `#scr-modes` is one long list:
  - the base modes
  - Expedition cards with their own sub-panels (League pick, tiers, HQ, Dive route picker)
  - modifier toggles for base modes only
- There are two character pickers:
  - **Base:** `save.partner`, any owned species.
  - **Expedition / Dive:** the League pick (`micasurvivorexp_pick`), 553 families, gated by challenges or base ownership; "Start as" a stage was added in #920.
- Daily, Party and Team override the Pokémon.
- Every run starts through `G.Flow.play(mode)` → `G.Modes.plan`, so the new flow only writes prefs and calls it.
- **Pad navigation** (`js/core/pad.js`) works on any `.scr` built from buttons with stable ids, a `[data-back]`, and `.on` on the current choice. Don't use `.card` outside the card screens.
- **Micatro's look** (`micatro/css/micatro.css`):
  - the m6x11 font
  - flat slate panels with a solid drop lip
  - buttons that press down 4 px
  - chunky text shadows
  - springy animations
  - its arrow-carousel "new run" screen (`.new-run` / `.nr-row`)

  It must be PORTED into a scoped sheet: its fixed-px stage and its class names (`.btn`, `.card`, `.chip`, `.tabs`) clash with MicaSurvivor's.

### Multiplayer (mode × local / online)

| Mode | Local | Online |
|---|---|---|
| normal | only as the separate "coop" card | works, but no modifiers |
| daily / rush / party / tower / rifts / type / team | refused | refused (a base lobby always runs Normal) |
| exp-classic / exp-survival | works | works, tested (≤4) |
| exp-dive | partial | partial: floor 1 only, no Weekly, no 2-browser test |
| couch + online together | refused everywhere | |

- **Local co-op** is 2 players. Player 2 moves only (+ hop / dodge in Expedition) with one auto-attack: no specials, no Ultimate, no items.
- **Online** is up to 4 over WebRTC or the relay. The host owns the enemies; each player owns their own Pokémon.

### Coverage
- **1025 / 1025 species are playable and are enemies** in base, Classic and Survival.
- **Dive is missing 61 legendaries as foes.** It only has its 33 guardians.
- **Megas:** 93 of them (87 species), playable only in Expedition at Lv 40+.
  - Never an enemy, anywhere.
  - Not in base modes.
  - 48 have battle sprites; 45 are composed at runtime.
- **Regional formes (~58 over 54 species: Alolan, Galarian, Hisuian, Paldean) don't exist anywhere.**
  - There are no data entries and no animated sheets.
  - The overworld's static battle fronts (`overworld/data/pokemon/s<dex*32+k>.png`) probably include them; not yet verified.

### Replays (`js/mica/replay.js`)
- One tape per run, from one player's point of view.
- Partners are position / HP rows only, sent whole on any change.
- Each co-op client records its own tape, with nothing linking them.
- **Size limits:**
  - Base tapes never thin, so a busy base run over ~50 min can't be shared (packed over 1.2 MB).
  - Expedition tapes thin and then silently stop at 4.5 M chars or 30,000 frames, which loses the end of deep Dives.
- **Server:** a v:1 tape only, 1.2 MB packed, 10 per user, kept 30 days.

## The plan (batches)

### U1 — the new flow, in Micatro's style
- New `css/mx.css`: Micatro's tokens, font, buttons, panels, carousel and animations, scoped under `.mx` and sized in MicaSurvivor's `--ui` units.
- One screen, `#scr-play`, with 5 steps (breadcrumbs, Back to the previous step, a pad-friendly carousel):
  1. **Character:** the unified picker (decision 1).
  2. **Category:** Survival / Expedition / Dive (three big tiles).
  3. **Variant:**
     - Survival: Normal, Daily, Boss Rush, Party, Tower, Rifts, Type, Team.
     - Expedition: Classic, Survival (+ the League HQ as a side door).
     - Dive: Route dive, Weekly.
  4. **Players:** Solo, Local (2–4 pads), Online (create or join a friends lobby).
  5. **Setup:** the variant's own options only.
     - Survival: modifiers, the Tower start floor, the Type pick.
     - Expedition: map, difficulty.
     - Dive: route, start floor.
     - Then Start.
- "Play" on the main menu opens it.
  - The old `#scr-modes` stays reachable only for the League hub until U1 is done, then it's retired.
  - Every old pref key is kept, so saves and the old buttons' behaviour carry over.
- **Tests:** each step by mouse, touch and pad; Back at every step; phone layout; every variant starts the same run as before (plan objects equal).

### U2 — multiplayer for every mode
- **Online lobbies carry `{category, variant, opts}`** and `G.Flow.startCoop` plans that run.
  - The host is the authority for each base mode's rules: the Daily seed and rule, the Tower floor and relics, Rush, Rifts, Type, Party's no-save, and Team switching.
  - Dive passes `start` / `weekly`.
- **Local co-op becomes a players count on every mode** (2–4 pads; decision 4) instead of the separate "coop" card.
  - Local partners get the full kit (specials, dodge, Ultimate) through per-pad input.
- **Tests:** a two-browser online run per category (Normal, Tower, Classic, Dive); local 3–4 pads.

### U3 — coverage sweep
- **Regional formes as real entries** (decision 2):
  - Extend `G.DEX` with form ids (dex + form key).
  - Types and stats from PokéAPI.
  - Sprites: animated SpriteCollab sheets where they exist, the static battle fronts otherwise.
  - Families map forms to their base species.
- **Playable:** base partner and gacha, the League (a stage variant), Dive.
- **Enemies:** each form joins the spawn pools by its own BST and types (Alolan foes weighted to sea and ice routes, etc.).
- **Megas as enemies** (decision 3), and Megas playable in base modes too.
- **Dive:** the 61 missing legendaries as rare legendary encounters (PokéDive's 35 %, pity after 3).
- **Coverage tests per mode:** every species, every forme and every Mega is reachable as an enemy (seed union) and pickable.

### U4 — unified replays (format v2)
- **One tape per SESSION, recorded by the host:**
  - every player's full row (position, HP, level, the move cast with its target, the dodge or verb, items)
  - delta-encoded per player
  - viewers can switch whose view to follow
- **Segments** (e.g. every 5 minutes or 10 Dive floors), each its own packed chunk under the cap.
  - They upload as the run goes, so long runs are never truncated.
  - A segment index makes seeking fast.
- One size policy for every category: thin → segment, never silent truncation.
- **Server:** `micasurvivor-replay-put` takes v2 segments (`rid` + `seg`), with a session cap instead of a per-run cap. v1 tapes still play.
- **Tests:** a 45-min base run, a floor-60 Dive and a 4-player session all round-trip; switching POV; seeking across segments.

## Decisions for the owner
Decided 2026-11-02 (the owner took every recommended option):
1. **Picker = your collection.** Every species you own is playable in every mode. Expedition and Dive start as that exact stage (later evolutions still come mid-run). League challenges stay as a second way to unlock families you don't own.
2. **Regional formes = animated SpriteCollab sheets.** The overworld's static fronts are used only where SpriteCollab has none (an asset fetch plus a deploy to the sprite host).
3. **Megas as enemies = rare elites and bosses.** Survival after ~15 min, Expedition zone 3, Dive below floor 30, sometimes an alpha / boss. Megas are also playable in Survival modes.
4. **Local multiplayer = 2–4 pads with full kits; no mixing** of local players into online lobbies (online stays one player per device, up to 4 devices).
