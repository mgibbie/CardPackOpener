# Micatro mods — native rebuild plan

Owner ask (2026-10-15): rebuild the Balatro mods on this PC (Steam `Mods/` + `Desktop/mods off/`)
**from scratch** inside Micatro — no Steamodded compatibility layer — and let players turn
each mod **on/off**. Pokermon first. Where a mod shipped broken, rebuild it the way its author
evidently intended (documented per fix, each with a test).

## 0. What's there (inventories done 2026-10-15)

| Mod | Source (canonical) | Jokers | Other content | New systems | Size |
|---|---|---|---|---|---|
| **Pokermon 3.2.1** | `AppData/Roaming/Balatro/Mods/Pokermon-main` | 452 (+4 unregistered) | 66 consumables (Item, Energy types), 10 packs, 4 vouchers, 10 decks, 6 tags, 1 showdown boss, 2 enh, 2 seals, shiny edition, 12 Tera stickers, 7 challenges, 8 deck skins | types/Tera, evolution, energy, shiny, megas, safari/mega rarities, family pools, scry, Unown, ~57 lovely patches | ~50 MB art |
| Nacho's Pokermon Dip 1.6.4 | `mods off` | 43 (47 written) | 1 stake (Elite Four), 1 sticker, 4 challenges | Stellar type, `poke_evolved` event, Passimian | 0.4 MB |
| Pokermon+ 1.0.3 | `mods off` | 18 (**none load as shipped**) | Timer Ball, 5 decks, 1 stake, Weakened sticker, 4 challenges | negative energy, per-joker energy cap | 0.2 MB |
| Bunco 5.1 | `mods off` | 80 | 20 consumables (Polymino), 8 packs, 12 vouchers, 25 blinds, 16 tags, 5 hands, 2 suits, ... | exotic suits, linked cards, Blind/Virtual packs | 6 MB |
| MoreFluff 1.5.6 | `mods off` | 83 | Colour + Rotarot types (39), 16 packs, 15 blinds, 8 enh, 4 decks | charging Colour cards, Superboss endless | 18 MB (15 MB music) |
| TheAutumnCircus + AutumnMoodMechanics | `mods off` | 87 | ~103 consumables (60 Oddities), 14 vouchers, 19 decks, stamps, aspects | stamps, aspects, graveyard, suit levels | 2.8 MB |
| BETMMA | `mods off` | 11 | 82 vouchers, 2 editions, 3 voucher packs, 5 challenges | voucher rarity + fusion vouchers | 0.9 MB |
| Fortlatro 1.2.0 | `mods off` | 125 | 86 consumables (LTM), 25 vouchers, 15 enh, 8 seals, 8 blinds | Jewel random-boss mode | 20 MB — **see §6** |
| MikasBalatro 0.13.3 | `mods off` | 60 | 7 decks, 2 tarots, 1 spectral | perma-mult on cards | 0.3 MB |
| Milatro 1.1.0 | `mods off` | 30 | — | — | 0.2 MB |
| Reverie | `mods off` | 1 | 26 Cine/quest cards, 9 packs, 2 decks | Cine special shops, tags as cards | 0.2 MB |
| Risk of Jesters | `mods off` | 11 | 2 vouchers, 4 blinds | bigger packs | 0.1 MB |
| Ro-Balatro 1.2.1 | `mods off` | 10 | 14 Gear consumables | duplicate-allowed type | 0.8 MB (ripped Roblox audio) |
| SylvieSilly 0.11 | **old Micatro folder copy** (the `mods off` copy has a syntax error) | 0 | 4 decks, 6 blinds, 8 packs, 8 moons | suit-chip planets | 0.3 MB |

Not ported as mods (they fix the original game's UI/engine; Micatro gets native equivalents
where useful): Better_Vouchers_This_Run_UI, Deck Creator (→ optional native deck editor later),
InfiniteScore (→ native big-number scoring, §2.6), JokerDisplay compat, speed mods.
Also in the old `Projects/Programming/Micatro/Micatro` folder only: Olympus (6), Inscrybed (4),
TagTeam (1), Smirkeo (1), AltaVista (1), OmertaDeck (1 deck) — small; port with the S-tier batch if wanted.

## 1. Principles
- **Native, not emulated.** Each mod is rebuilt as a Micatro content pack against Micatro's own
  API. Steamodded concepts get native equivalents only where the content needs them.
- **Faithful to the mod's design** (numbers, rules, text, art), except documented fixes.
- **Deterministic + spectatable.** Mods use the engine's seeded RNG and event log, so runs stay
  replayable and spectators see exactly what the player sees.
- **Off means gone.** A disabled mod contributes nothing: no pool entries, no hooks, no UI.

## 2. Mod framework (phase M0, engine) — `micatro/js/mods/`
1. **Registry** `registerMod({id, name, version, author, requires:[ids], optional:[ids], content, hooks, assets})`.
   Content keys are prefixed (`j_poke_bulbasaur`), so same-named items in two mods never collide.
2. **Content types**: jokers, consumable types (new sets: Item, Energy, Polymino, Colour, Rotarot,
   Oddity, LTM, Gear, Cine...), consumables, boosters, vouchers, decks, sleeves (as deck variants),
   tags, blinds, enhancements, seals, editions, stickers, stakes, challenges, poker hands, suits,
   rarities, deck skins. Each item carries behaviour as plain JS functions (`calculate`, `loc_vars`,
   `use`, `can_use`, `in_pool`, `add_to_deck`, `remove_from_deck`, `set_ability`, `update`).
3. **Engine hook points** replacing the mods' lovely patches with explicit, named seams:
   pool filtering, create_card (forced seals/stickers), set_cost, is_face/is_suit/get_id overrides,
   find_joker aliases (Pareidolia/Four Fingers/Smeared/Splash-style effects), poker-hand parts
   (3-card straights/flushes, Spectrum), debuff rules, new contexts (`post_discard`, `poke_evolved`,
   `hand_drawn`...), end-of-round, cash-out modifiers, pack size/choices, booster slots, extra
   card areas (scry, graveyard, cine quests). Each seam is one line in vanilla code and a no-op when
   no enabled mod uses it.
4. **Per-run mod set**: chosen on the New Run screen (Mods panel with dependency auto-enable and
   per-mod options like Pokermon's `pokemon_only`, gens, hazards, unlimited energy). Stored in the run
   recipe → save/resume/replay/spectate all load the same mods. Spectator view lists active mods.
5. **Assets**: per-mod atlases under `micatro/mods/<id>/`. Big ones (Pokermon ~50 MB, MoreFluff
   music) go to a separate Cloudflare Pages project like `battlecards/art` (20,000-file limit) —
   see §6.
6. **Big-number scoring** (native, replaces InfiniteScore/Talisman): chips/mult/score as a Decimal
   type once any enabled mod can exceed 1e308; vanilla runs keep plain numbers.
7. **Leaderboard**: modded runs are tagged with their mod set; the default board shows vanilla
   runs, with a "Modded" tab.
8. **Wiki + news**: each mod gets a design-wiki section (generated from its registry entry); the news
   generator also diffs `micatro/mods/*/` so new mod cards appear as releases (e.g. "Pokermon: 12 new
   cards").

## 3. Pokermon (phases M1–M3)
- **M1 systems** (native): types + Tera stickers, evolution (level/scaling/item/type/deck evo,
  in-place swap carrying scaled values, Everstone), energy (energize coefficients, limits, Colorless,
  Double Rainbow, Bird), shiny edition (+1 booster slot, alt art), megas (Megastone), safari/mega
  rarities + family-aware pools + gen filter + pokemon-only option, held items, Unown/swarm, scry
  area, faint (Baby) and volatile rules, animated jokers, evolution/shiny/zorua shaders, the
  Pokédex family viewer. Plus the ~57 vanilla-behaviour patches as hook-point uses.
- **M2 content**: 452 jokers in ~15 batches by Pokédex file (parallel agents, one file range each),
  each batch with tests that fire every joker's effect and evolution; then consumables/packs/
  vouchers/decks/tags/boss/enhancements/seals/stickers/challenges/deck skins.
- **M3 add-ons**: Nacho's Pokermon Dip (Stellar type, Elite Four stake, `poke_evolved`) and Pokermon+.
- **Intended-design fixes** (each documented + tested):
  - Pokermon+: jokers actually load; per-line toggles scoped to its own jokers (shipped version
    leaked into Pokermon's pool); `sandstorm` checks the intended enhancement (not `m_count`);
    Nacli staged as a base form; cross-mod Toxtricity reference resolved or removed.
  - Pokermon: finish/enable the 4 written-but-unregistered jokers where complete (Jirachi copy/negging,
    Hisuian Qwilfish/Overqwil); `create_random_poke_joker` area bug; `revenanteck` typo; `fake_negging`
    offered in the Wish pack as intended; hazard-poke & rainbow-roll bugs.
  - Nacho: `deck_rank_evo` `_count` bug.
  - Config: use the shipped DEFAULTS (Pokermon 3.2.0's config), not this PC's saved settings.

## 4. The rest (phases M4–M8), by value per effort
- **M4 (S)**: Risk of Jesters, SylvieSilly (clean copy), Milatro, MikasBalatro (skip its 9 dev tarots).
- **M5 (L)**: MoreFluff (Colour/Rotarot types, Superboss), BETMMA (voucher rarity + fusions; drop the
  orphan Abilities/Spells patches).
- **M6 (L/XL)**: Bunco (exotic suits, linked cards, Spectrum hands, Blind/Virtual packs),
  Reverie (Cine shops).
- **M7 (XL)**: TheAutumnCircus + AutumnMoodMechanics (stamps, aspects, graveyard, suit levels,
  Oddities); cross-mod items load only when the partner mod is on.
- **M8**: old-folder-only mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista, OmertaDeck); native deck editor. (Fortlatro and Ro-Balatro skipped.)
- Each mod: its own wiki section, news entry, tests (every item fired), fuzz runs with the mod on.

## 5. Testing
Per mod: unit tests firing every item; fuzz runs (existing harness) with the mod alone and with all
mods on; determinism/replay check; spectate snapshot size check; a browser smoke test of the Mods
panel. Gate wrapper `overworld/tests/micatro_engine_test.mjs` picks up `micatro/tests/mods/*`.

## 6. Owner decisions (2026-10-15)
1. **Fortlatro: SKIP.** (real IP, real-person jokers, ripped/profane audio)
2. **Ro-Balatro: SKIP.**
3. **Assets: separate Cloudflare Pages project** for mod art/music (like `battlecards/art` → magepunk-cardart).
4. **In scope extras:** the old-folder-only mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista,
   OmertaDeck); a **native deck editor** (Deck Creator's builder, later phase); **big-number scoring**.
5. **Leaderboard:** vanilla board by default + a **Modded** tab (runs tagged with their mod set).
6. Broken mods are rebuilt **as their authors intended** (Pokermon+ especially), each fix documented + tested.

## 7. Execution order (owner, 2026-10-15)
Each step: gate → merge when it passes → next.
1. M0 framework + M1 Pokermon systems + Mods UI → merge (Pokermon listed as **Preview** until all jokers land).
2. Pokermon joker batches (parallel agents, one range of `pokejokers_NN` files each), then the rest of
   Pokermon's content (consumables, packs, vouchers, decks, tags, boss, challenges).
3. Nacho's Pokermon Dip + Pokermon+ (in parallel; Pokermon+ fixed as intended).
4. Small mods batch: Risk of Jesters, SylvieSilly (clean copy), Milatro, MikasBalatro, + the old-folder
   mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista, OmertaDeck).
5. MoreFluff + BETMMA (in parallel).
6. Bunco + Reverie (in parallel).
7. Then: TheAutumnCircus + AutumnMoodMechanics, big-number scoring, native deck editor.
8. Then the rest of the plan (owner, 2026-10-15): everything left over from the steps above —
   mod-specific UI polish (Pokédex family viewer, evolution/shiny/zorua shader animations, type
   badges, energy pips, animated jokers like Unown swarm), deck skins (Pokermon RBY/GSC, Bunco),
   challenges for every mod (one Challenges screen), sleeves as deck variants, Pokermon's open
   seams (Xatu all-planets packs, previous-evo win stickers), per-mod design-wiki sections + news
   for any mod that lacks them, and a final all-mods-on fuzz/perf pass (load time, snapshot size,
   spectator bandwidth) before calling the rebuild done.
