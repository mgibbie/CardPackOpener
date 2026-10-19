# More Fluff — porting notes

**Mod:** More Fluff by **notmario and contributors** (github.com/notmario/MoreFluff; the manifest's author list is
"notmario, and more"; in-mod art credits name Multi for the Colour cards, and footlongdingledong, marigold, LFMoth, Ice
and Incognito for other art).

**Version in Micatro:** `1.9.9999` (tag `1.9.9999`, commit 8eb1e77, 2026-09-06), `contentRev` 1 — pin `1.9.9999+r1`
(`micatro/js/mods/pins.js`). Earlier: 1.5.6+ (main at b32b916, 2025-09-17), the legacy pin `1.5.6`.

## Licence

- Up to 2026-03-06 the repository carried an MIT `LICENSE`. Commit `32701ac` ("Kill", 2026-03-06) deleted it; the
  1.9.9999 tree has no licence file.
- The mod's manifest (`MoreFluff.json`, still in 1.9.9999) says `"allow_redistribution": true`.
- Nothing in the 1.9.9999 tree (code, README, manifest, localization) forbids redistribution or porting.
- The owner chose to port the 1.9.9999 rewrite on 2026-10-19 with the licence-file removal flagged
  (Plans/MICATRO_MODS_PLAN.md §10).

## How the port is built

- `data.js` / `loc.js` are generated from the mod's own Lua by `tools/micatro/gen_morefluff_data.cjs` (it runs
  `tools/micatro/extract_mod_data.cjs` on exactly the files `src/jokers.lua` loads, on a checkout of the tag:
  `git -C MoreFluff archive 1.9.9999 | tar -x -C <dir>`). Never edit them by hand.
- Behaviour is ported by hand, module by module (see `index.js`'s header).
- `legacy.js` holds what this version keeps from the 1.5.6 port on purpose (below).

## Batch A (this version, contentRev 1)

In: the 69 jokers 1.9.9999 keeps from our 1.5.6 set (with its reworks and number changes), the 11 it retires to the
hidden "Old Fluff" rarity (registered, weight 0: never offered, but old saves / replays / win stickers load them),
the Token "Oops! All 5s", the 16 Colour cards + Gold (now a hidden Spectral), 22 Rotarots + Rotarot Merchant / Tycoon,
8 enhancements, the Superboss rework (free Ticket, Superboss Pack and 15 tokens, unskippable pack, frozen ante),
6 stakes + Heavy / Potato / Suspended stickers, the exile zone + suspended cards, the Purple Deck, the 2 Modded packs
(weight 0 — Repack's).

Kept from 1.5.6 on purpose (`legacy.js`):
- the retired jokers' real art — 1.9.9999 draws its whole "Old Fluff" rarity as placeholder sketches;
- Tall Joker's and Triangle's 1.5.6 behaviour and text — their reworks read Steamodded attributes and
  `SMODS.scale_card`'s calc_scaling, i.e. the engine seams of the unmerged `feat/micatro-pokermon-391-seams` branch
  (`micatro/js/engine/smods.js`): `has_attribute` + the 80 built-in attributes, `scale_card` with the scaling_card
  listener pass. `util.scale_card` stands in for the latter until then (no listeners in this batch);
- Fast-Growing Sapling's Jimbo art (1.5.6 had no atlas; 1.9.9999: a placeholder sketch). The 1.5.6 port pointed it
  at the magenta "missing texture" cell (Missing Joker's art): fixed;
- the pre-turned art of the Rotarot cards / packs and Cartomancer! (1.9.9999 turns upright sprites by pi/4 in the
  engine; Micatro has no turned sprites, the 1.5.6 sheets are the same art turned).

Engine seams added (no behaviour change without a mod using them): hooks `ease_ante_mod`, `can_skip_booster`,
`can_use_consumeable` (`js/mods/registry.js`), the board's `view.pack_no_skip`.

Port notes: Deep Blue / Red / Orange pick their card with an undefined `rng_seed` (math.random) upstream: seeded here.
Pink Stake's Standard Pack uses math.random(1, 4): the engine's seeded math_random. A Superboss Token's text names the
slot its pick fills next (upstream's `used or 0 + 1` reads the last one). The superboss backdrop, screen shaders,
art-credit popup and mod-page UI are visual only and not drawn.

## Retired keys (`micatro/js/mods/aliases.js`, `MOD_ALIASES.morefluff`)

| Key | Name | Why |
|---|---|---|
| j_mf_complexitycreep | Complexity Creep | deleted in 1.9.9999 |
| j_mf_lightningstrikesthrice | Lightning Strikes Thrice | deleted |
| b_mf_grosmichel / b_mf_blasphemy | Gros Michel / Blasphemous Deck | decks removed |
| sleeve_mf_grosmichel / _philosophical / _rainbow / _blasphemy | the 4 sleeves | CardSleeves support removed |
| p_mf_modded_jumbo_1 / p_mf_modded_mega_1 | Jumbo / Mega Modded Pack | packs removed |
| tag_mf_moddedpack / tag_mf_clutch | Modded / Clutch Tag | tags removed |
| c_mf_superboss_always | Better Balatro II | challenge removed |

Nothing was renamed. The 11 "Old Fluff" jokers are NOT retired keys: they are still registered.

## Art (assets are gitignored; deployed by `npm run deploy-micatro-mods`)

1.9.9999 ships 1x art only. The old 2x files were that same art doubled (checked cell by cell), so the 1.9.9999 sheets
are staged at 2x nearest-neighbour as new files under `assets/2x/1.9.9999/` (jokers, colours, packs, vouchers,
enhancers, tags, blinds, stakes, stake stickers), plus `assets/sounds/1.9.9999/buzzer.ogg` and
`assets/fonts/1.9.9999/NotoEmoji-Bold.ttf`. Unchanged sheets keep their 1.5.6 files (`mf_hyperjimbo`, `mf_mv`,
`watermark`, `mf_rotarots`, `mf_rotarotpacks`, `mf_rot_cartomancer`, `mf_jokers_refresh` for the retired jokers).

## Follow-up batches (each bumps contentRev: new jokers change the pools)

Upstream's art decides most of it: of the 81 new active jokers only about 20 have real art in 1.9.9999 (the rest are
"Placeholder" sketches, which Micatro can't ship: `no_placeholder_art_test`).

- **B1 — new jokers with real art (13):** Dinner, Forge, Doubled Scale, Bouncer, Jokes for Minecrafters, Apple Friends,
  Gem Alert, Gentle Melon, Joker Reacts, Retrigger Joker, Digital Exclusive, Mind Sculptor + John Balatro
  (Planeswalkers: loyalty system, `src/planeswalker.lua`). Some need the attribute / scale_card seams.
- **B2 — the hidden pools with real art:** the 26 Letter jokers (mf_letterjokers.png, quantum enhancements, Lettergem
  animations) and the 3 Purple jokers; the Old Deck then (it also needs the 32 other Old Fluff jokers, all sketches).
- **B3 — rot legendaries (7, real art) + The Soul!:** their Spectral cards (mf_rot_legendary_consumables.png) are
  placeholders upstream: needs art first.
- **Blocked on art (about 61):** the 15 Slivers, 5 Pacts, Emeritus jokers, Ransom Note (+ its enhancement), Repack,
  Nemesis (+ pack / tag), Cryptic Mod (+ the Cryptic edition), Triangle Walker ("wip"), Lone Wolf ("TODO new art"),
  Bonus Sheet, and the rest; also the Spellchaser's Deck ("Lutri Placeholder") and Halt's Power enhancement.
- **After the pkseams merge:** Tall Joker's and Triangle's reworks, `util.scale_card` -> the engine's `scale_card`,
  attribute-reading jokers (Slivers, Joker with Sets Mechanic, Tall Joker), the `object_weights` feature 1.9.9999 turns on.
