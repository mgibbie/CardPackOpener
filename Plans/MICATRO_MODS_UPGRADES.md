# Micatro mods — upstream upgrade survey (2026-10-19)

The owner asked which of Micatro's ported Balatro mods have newer upstream versions, what changed, and
whether we can take the upgrades. This is read-only research; nothing here is implemented yet.

**How this was done.** Each port's `index.js` header names a local source folder (`Desktop/mods off/*`,
`AppData/Roaming/Balatro/Mods/Pokermon-main`, or the old `Projects/Programming/Micatro/Micatro/*`). Each
source was matched to its upstream: GitHub (via `gh`), Thunderstore's package API, and
`skyline69/balatro-mod-index`. The content files were md5-compared against upstream `main` and its tags.
For the mods that moved, both versions were cloned and inventoried (keys, counts, config numbers). Pokermon,
Bunco and the Pokermon add-ons were also run through our own `tools/micatro/extract_mod_data.cjs`.
Scratch clones are under `%TEMP%/claude/` (`modres/`, `pkr/`, `bunco/`, `mf/`) and the session scratchpad.

## 1. Summary

| Mod | Ours | Latest upstream | What's new | Effort | Rec. |
|---|---|---|---|---|---|
| **Pokermon** | 3.2.1 (really commit 87fb499, 2025-11-01, just before 3.5.0) | **3.9.1** (2026-09-18); main 3.9.1-1016a (2026-10-17) | +109 jokers (68 Gen 3, 12 Megas), 189 reworded or reworked jokers, 41 rarity shifts, Hazard rework, Seed enhancement, Elite stake, 5 boss blinds, 5 challenges, DNA seal, full art pass (no placeholders) | **XL** | **Upgrade, in batches** (version pin first) |
| Pokermon+ | 1.0.3-251101e | 1.2.0-261018a (Thunderstore 1.2.4, 2026-10-18) | +12 jokers, −7 (moved to base or other add-ons), Pearlescent deck, Shiny/Void deck reworks, Quests (half disabled upstream) | M | **DONE** (batch 20, 2026-10-21: 1.2.0-261018a @ 52c7416, pin 1.2.0-261018a+r2) |
| Nacho's Pokermon Dip | 1.6.4 | v1.7.9 (2026-07-27); main 1.7.9-5 | +40 jokers; 10 of ours **moved into base Pokermon** (key collisions); Elite stake moved to base; ~10 reworks | L | **DONE** (batches 18–19, 2026-10-21: 1.7.9-5 @ 904ae39, pin 1.7.9-5+r2) |
| MoreFluff | 1.5.6+ (main b32b916, 2025-09-17) | 1.9.9999 (2026-09-06), a **full rewrite**; main still churning | 150 active jokers (81 new), 12 of ours retired to a hidden "Old Fluff" rarity, 2 deleted; new stakes, stickers, Attributes, exile, MTG Slivers, Pacts and Planeswalkers; 2x art dropped. **LICENSE deleted** | XL | **Hold**: licence question + unstable. Later, as a new `morefluff2` id |
| Bunco | 5.1 (= Firch final) | Firch: 5.1 (abandoned). Community fork **jumbocarrot0 v5.4.8b** (2026-02-20) | No new content; ~20 behaviour fixes and tweaks, 2 edition cost changes, reworded text, art touch-ups | S/M | **DONE** (batches 2 + 21, 2026-10-21: 5.4.8b @ 9643e85, pin 5.4.8b-JumboFork+r1) |
| BETMMA | Vouchers 3.0.2.3 | same (byte-identical) | Nothing for the parts we ported. Sibling modules never ported: Abilities (28 + 4 vouchers), Spells (23 + 1 + 2) | — (new: L) | Up to date. Abilities/Spells optional new content |
| Reverie | labelled "1.0 (old-API)", **really v1.2.6** | v1.2.6 (2024-07-25) is the latest release; main is 1.3.0 unreleased (2024-10-09) | main: SMODS-1.0 port, 2 sleeves, Jovial M (Cryptid only), Morsel food list +Bunco foods, coupon/Nopeus fixes | S | **DONE** (batch 3, 2026-10-21: label 1.2.6, sleeves + Bunco foods from main @ 3728d64, pin 1.2.6+r1) |
| Inscrybed | 1.0 (old file) | LunaAstraCassiopeia/LunasBalatroMods (2024-10-12, MIT) | +1 joker (Mycologists); the author's own bug fixes and rebalance, which **differ from our intended-design fixes** | S | **DONE** (batch 3, 2026-10-21: Mycologists @ 88b7c9c, pin 1.0+r1; rebalance not taken, owner rule) |
| Milatro | 1.1.0 | 1.1.0 (identical); unreleased `v2-beta` branch (2.DEV.0, stale since 2025-06) | v2-beta: 60 jokers (30 new), 5 blinds, 5 consumables, 5 decks, 4 vouchers, 3 tags, 1 enhancement | (M) | Skip for now (unreleased, abandoned branch) |
| MikasBalatro | 0.13.3 | 0.13.3 (identical; last real release 2024-05) | `development` branch: an unfinished SMODS-1.0 rewrite (13 of 60 jokers, 2024-12) | — | Up to date |
| Risk of Jesters | 1.0.0 | identical (dvrp0, 2024-05) | — (lshtech fork is only an API port) | — | Up to date |
| SylvieSilly | 0.11 (clean copy) | upstream main is the broken WIP after 0.1.1 (2024-04) | — (lshtech fork patches the WIP) | — | Up to date (keep clean copy) |
| Olympus | 1.0 | identical (AbhinavR314, CC0) | lshtech fork (2024-10): **redrawn art** for all 6 jokers + JokerDisplay | S (art) | Optional alt-art skin |
| TagTeam | 1.0 | identical (Snoresville, 2024-04) | — | — | Up to date |
| Autumn Circus | 0.0.0f | **upstream deleted** (AutumnMood924 repos 404); only mirror is Dimserene's older 0.0.0a | — | — | Up to date (frozen; ours is the newest copy known) |
| AutumnMood Mechanics | 0.0.0f | **upstream deleted** (404) | — | — | Same |
| AltaVista | 1.0 | none: owner-authored ("Mica") | — | — | n/a |
| Smirkeo | 1.0 | none: owner-authored ("Mica") | — | — | n/a |
| OmertaDeck | 1.0 | none: owner-authored ("Mica") | — | — | n/a |

**Licences.**

| Licence | Mods |
|---|---|
| GPL-3.0 | Pokermon, Nacho, Pokermon+, Reverie, Mikas |
| MIT | Inscrybed (Luna's repo); MoreFluff up to 2026-03-06 (commit `32701ac` "Kill" deleted LICENSE; the manifest still says `allow_redistribution: true`) |
| CC0 | Olympus |
| No licence file | Bunco (both repos), BETMMA, Milatro, Risk of Jesters, SylvieSilly, TagTeam, Autumn |

The mods with no licence file were already ported on the same basis, so the upgrades don't change that.

## 2. Per-mod detail

### 2.1 Pokermon — 3.2.1 → 3.9.1 (InertSteak/Pokermon, GPL-3.0)

**Baseline.**
- Our source says `3.2.1-1029a`, but it matches upstream commit 87fb499 (2025-11-01). 301 of 321 files are identical.
- So most of 3.5.0 is already ported (Riolu/Lucario, Rotom, the Professor, Flower cards).
- There were no 3.3 or 3.4 releases. Since our snapshot there are 1,809 commits to 3.9.1, and 49 more on main.

**Releases.**

| Release | Date | Highlights |
|---|---|---|
| 3.5.0 | 2025-11-05 | Already ported |
| 3.5.1 | 2025-12-07 | "All placeholder sprites now have proper art"; Mirror and Rocket blinds; Lileep and Anorith lines |
| 3.6.0 | 2026-01-14 | **Hazard rework** (a global Hazard layer); Seed enhancement plus Miracle Seed and Heavy-Duty Boots; 3 blinds; Daycare; Rival rework; ~25 balance changes |
| 3.6.1 | 2026-01-29 | Debris deck and sleeve; Safety First challenge; Nincada line; Spinda |
| 3.7.0 | 2026-04-22 | 15 Gen-3 lines; Mystery Dungeon daily challenge; `SMODS.scale_card`; Attributes |
| 3.8.0 | 2026-06-13 | **Elite Stake**; Mega Lucario; Eevee and Jirachi/wish reworks; Onix line uses quantum enhancements; Flower ×3 → ×2 |
| 3.9.0 | 2026-09-13 | Legends ZA Megas for Gens 1–2; 11 more lines; globals moved under a `pokermon.*` namespace |
| 3.9.1 | 2026-09-18 | Soul items use object weights; the "Pokeballs allowed" option is removed |
| main | to 2026-10-19 | +9 jokers (Lotad, Greavard and Electrike lines, Cryogonal, Mawile: ported in sub-batch 15b at af0b656); Solrock / Lunatone (2026-10-19, not taken) |

**New content (baseline → 3.9.1).**
- **Jokers: 452 → 561 (+109).** No joker key was removed or renamed.
  - Gen 3: 68.
  - Gen 4: Budew, Roserade, Chingling, Bronzor, Bronzong, Gallade.
  - Gen 5: Munna, Musharna, the Klink line, the Axew line.
  - Gen 6: Bunnelby, Diggersby.
  - Gen 7: Drampa.
  - Gen 9: the Smoliv, Bramblin and Rellor lines.
  - Non-Pokémon jokers: Bitter Rival, Champion, Daycare, Imposter Professor, Oologist, RageCandyBar.
  - 3 April Fools jokers.
- **Megas: +12.** Raichu X and Y, Clefable, Victreebel, Dragonite, Starmie, Skarmory, Feraligatr, Meganium, Lucario, Drampa.
  - Mega Stone `used_on` now stores the card's `unique_val`.
  - New Mega Berry Juice and a `poke_infinite_megastone` modifier (Mega sleeve).
- **Energy: no gameplay rework.** The math (`energy_count + c_energy_count/2`, max 3) only moved to `pokermon.energy.*`. What's new:
  - vanilla jokers can be energized;
  - an optional Energy UI;
  - Energy cards and Mega Stone target "highlighted if valid, else leftmost valid", the same rule as our house rule.
  - Set keys renamed: `Energy` → `poke_energy` and `Item` → `poke_item`.
- **Items:** Miracle Seed, Heavy-Duty Boots, Meteorite (reusable Spectral; changes Deoxys's forme), Mega Berry Juice.
  - The Soul items (Great Ball, Leftovers, Thick Club, Leek, Tera Orb, Heavy Boots) now spawn through object weights.
- **Other:**
  - Seed enhancement, DNA seal, Bird sticker.
  - Dicey deck and sleeve, Debris deck and sleeve.
  - Elite stake.
  - `starterq` pack and tag.
  - Boss blinds: Mirror, Rocket, Star, Gray Godfather, White Executive.
  - Challenges: Delibird Dilemma, Safety First, Mystery Dungeon (daily), Imposter Syndrome, Mean Look.

**Reworks and balance.**
- 163 of 453 jokers have changed static data:
  - 41 rarities (mostly to Safari);
  - 7 costs;
  - 42 config numbers;
  - compat flags;
  - 7 new enhancement gates on the Eeveelutions, Probopass and Gholdengo.
- 189 joker texts changed. The real reworks: Eevee line (twice), Jirachi forms and wishes, Onix line, Zubat, Golduck, Kingambit, Xatu/Espeon/Bronzor, Corsola, Spearow, Rival, Kangaskhan, Volbeat.
- Hazard card chance 1-in-6 → 1-in-3. Wish Pack offers 6 → 3. Pink Seal gets a 1-in-3 chance.
- The full per-joker change list is in the scratchpad: `changes_jokers.txt`, from `data_base.js` vs `data_391.js`.

**Art (requested check).**
- 3.9.1 changes 39 atlases (every Basic Gen01–09 and shiny sheet, Others, Decks, Consumables, Bossblinds, Stickers, Enhancements) and adds 21.
- Series A alternate-art entries: 91 → 136.
- Our current placeholders and their upstream 3.9.1 art:

| Placeholder | Upstream 3.9.1 |
|---|---|
| **Rotom Dex** | `AtlasJokersBasicOthers` (0,4) |
| Stadium deck | `AtlasDecksBasic` (8,0) |
| Mega deck | `AtlasDecksBasic` (9,0) |
| Stadium sleeve | `AtlasDecksBasic` (8,1) |
| Mega sleeve | `AtlasDecksBasic` (9,1) |
| 6 Jirachi `fake_*` wish cards | `AtlasJokersSeriesAGen03`, which our port never registered |

- The placeholder-art agent's branch `fix/micatro-placeholder-art` (worktree `.worktrees/placeholder`) already maps these to 3.9.1 sheets.
- Upstream itself still uses placeholders for: the Starter pack, the 5 Rotom machine items, Meteorite, and the Moltres and Ho-Oh Series A alternates.
- Hisuian Qwilfish: 3.9.1 does ship its art (the Gen 2 sheet {2,5}); the port draws it since new-jokers sub-batch 15 (the Micatro-made card is retired).

**House rules, checked against upstream.**

| House rule | Upstream now | Effect on an upgrade |
|---|---|---|
| Deino/Zweilous: "contains a Three of a Kind" | Still exact `scoring_name == "Three of a Kind"`; only the text changed | Re-apply our rule |
| Transformation: leftmost valid joker | `find_leftmost_or_highlighted()`, no validity check | Re-apply our rule |
| Berry Juice Energy: leftmost valid joker | Unchanged (plain leftmost) | Re-apply our rule |
| Nuzlocke/Monotype run badges | No achievements upstream. The Nuzlocke challenge only bans Mirror (and, on main, the Vanillite line) | No conflict; consider banning Mirror in our Nuzlocke check too |

**Our intended-design fixes, checked against upstream.**

| Fix | Status upstream |
|---|---|
| Chartreuse Chamber state shared across blinds | Fixed upstream, but the blind was **renamed** `bl_poke_cgoose` → `bl_poke_iridescent_hacker` |
| Dragon Scale status text | Fixed upstream |
| `create_random_poke_joker` area bug | Gone (code path changed) |
| Arbok `a_chips` text | Still broken upstream; keep ours |
| Scyther pre-slice Mult | Still broken upstream; keep ours |
| Pink Seal double fire | Still broken upstream; keep ours |
| Starter Tag `in_pool` | Still broken upstream; keep ours |
| Shiny on playing cards | Still broken upstream; keep ours |
| Revenant deck `revenanteck` typo | Still broken upstream; keep ours |
| Jirachi copy/negging and Hisuian Qwilfish/Overqwil | Still unregistered upstream; our enablement stays a deviation |

**Engine and API.**
- Steamodded ≥26.829.0, Lovely ≥0.9.
- Needs new seams:
  - `SMODS.scale_card` (116 uses);
  - Attributes (43; Poké Balls draw from attribute pools such as `stage_basic`);
  - `poll_object` with `modify_weights`;
  - quantum enhancements for the Onix line;
  - new contexts: `setting_ability`, `modify_scoring_hand`, `money_altered`, `ante_change`, `modify_booster_card`, `press_play`, `drawing_cards`, `debuff_card` and more.
- About 25 pseudorandom seed keys were renamed and 44 added. Every Pokermon run replays differently.

**Effort: XL.** Batches are in §3.
**Recommendation: upgrade.** It is our flagship mod, it is GPL, upstream is active, and the new art closes our
placeholder gaps. Do it only behind a mod-version pin (§4).

### 2.2 Pokermon+ — 1.0.3 → 1.2.0-261018a (SonfiveTV/PokermonPlus, GPL-3.0)

**DONE** in batch 20 (2026-10-21; "Batch 20" below, `micatro/mods/pokermonplus/PORTING.md` "1.2.0 upgrade").

**Requirement:** Pokermon ≥3.8.1 (Thunderstore pins 3.9.1). It uses the `pokermon.*` namespace, so it **cannot
be upgraded before base Pokermon.**

**Content.**
- +12 jokers: Heatran, Mega Darkrai, Helioptile, Heliolisk, Minior, Duraludon, Archaludon, Shroodle, Grafaiai (Nature system), Canari Plush, plus the Member Card and Mystery Box key items.
- −7 jokers:
  - the Nincada line (now in base 3.6.1);
  - Croagunk, Toxicroak, Vullaby, Mandibuzz (dropped; Croagunk now lives in Toxic-Stall).
- Decks: Pearlescent deck added; Prophetic deck dropped; Shiny and Void decks reworked.
- Quests system: shipped in v1.1.1, but main empties its blind, voucher and guide lists.
- Lechonk and Oinkologne reworked, and their rarity changed.

**Our fixes, against upstream.**

| Our fix | Upstream |
|---|---|
| Loader not loading the jokers | Fixed |
| Nacli stage | Fixed |
| Sandstorm `m_count` | Moot (function deleted) |
| Toxtricity branch | Moot (removed) |
| Croagunk/Vullaby | Moot (dropped) |
| Balls of Patience `tag_holographic` / fake buffoon pack ids | **Still broken upstream; keep ours** |

**Effort:** M. **Recommendation:** partial, after base 3.9. Take the 12 jokers and the deck reworks. Skip Quests until upstream turns them back on.
Keep our Croagunk/Vullaby and Nincada as legacy definitions or aliases (see §4).

### 2.3 Nacho's Pokermon Dip — 1.6.4 → 1.7.9-5 (Eternalnacho, GPL-3.0)

**DONE** in batches 18–19 (2026-10-21; "Batches 18–19" below, `micatro/mods/nacho/PORTING.md` "1.7.9 upgrade"). Recounted against the
1.7.9-5 tree (904ae39): our port had **9** duplicate `j_nacho_*` jokers (not 10), 1.7.9 adds **40** jokers of which 31 load (+ 4
Toxic-Stall data-only, 3 Impidimp with `can_load = false`, 2 G-Max needing Agarmons), and it reworks nearly every existing joker.

**Requirement:** Pokermon ≥3.8.1-0708a.

**New content.**
- **+40 jokers:**
  - Cranidos and Shieldon lines; Snover with Mega Abomasnow; Victini; Solosis; Bounsweet; Wimpod; Togedemaru; Dhelmise.
  - The Applin family with 2 G-Max forms; Impidimp; Finizen/Palafin; Frigibax with Mega Baxcalibur; the Loyal Three; Pecharunt; Fossil Excavator.
- Other: 3 Apple consumables, an Ancient pack, a Fossil tag.

**Moved to base Pokermon (key collisions).**
- The Ralts, Swablu, Bagon, Bronzor and Smoliv lines are deprecated in Nacho (`can_load=false`), because base 3.7–3.9 owns them now as `j_poke_*`.
- Mega Gardevoir, Mega Altaria and Mega Gallade are re-keyed to `j_poke_*`. Mega Salamence is dropped.
- Elite stake moves to base: `stake_nacho_elite` → `stake_poke_elite`.
- **Our port ships 10 `j_nacho_*` jokers that 3.9.1 base now owns.**

**Reworks.**
- Galarian Meowth/Perrserker, Passimian, Turtonator, Carbink, Mega Audino, Dedenne, Torterra (hand-size cap 4 → 3), Chimchar/Monferno (now evolve by rounds), Terapagos.
- Our `deck_rank_evo` fix: upstream fixed it too.

**Effort:** L. **Recommendation:** partial, after base 3.9. Deprecations and re-keys first, then the new lines.

**Other Pokermon add-ons now available (not ported):**

| Add-on | Licence | Size | Updated | Content | Note |
|---|---|---|---|---|---|
| Pokermon-Maelmc v1.18.0 | GPL | 35 MB | 2026-10 | 83 jokers, 12 blinds, Pokérus sticker | Best GPL candidate |
| Toxic-Stall v0.7.87 | GPL | 1.5 MB | 2026-10 | 87 jokers, 6 enhancements | Unlocks Nacho's Sneasel/Sneasler; best GPL candidate |
| Gem-Pokermon v0.1.8 | GPL | 16 MB | 2026-10 | 108 jokers | |
| PokermonGymBlinds | GPL | 0.9 MB | 2026-02 | Gym-leader blinds | |
| Agarmons 0.20.9a | **No licence**: do not port | 16 MB | 2026-10 | 132 jokers, Megas/G-Max | |

All of them need Pokermon ≥3.8.1 or ≥3.9.1, and several overlap each other. Consider them only after the base upgrade.

### 2.4 MoreFluff — 1.5.6+ → 1.9.9999 (notmario/MoreFluff)

**Baseline.** Our source matches main at b32b916 (2025-09-17). That is after the 1.5.6 tag (2025-05-16), which is why
we have Lightning Strikes Thrice and Complexity Creep.

**Releases.**
- 1.6.0-rc1/rc2/rc3 (2025-10-12 → 2026-01-06): +16 jokers, some without sprites.
- 1.9.999 (2026-06-12): "Full rewrite … placeholder art but the content is in place".
- 1.9.9999 (2026-09-06): "nothing new, just publishing to Thunderstore", but its diff from 1.9.999 is large.
- Main has had 10 more commits up to 2026-10-09 (Final Stake and music). The README still calls it unfinished.

**Content (our snapshot → 1.9.9999).**
- **Jokers:** active pool 83 → **150**. Of ours, 69 stay active, 12 move to the hidden "Old Fluff" rarity, and 2 are deleted (Complexity Creep, Lightning Strikes Thrice).
  - 81 new active jokers include 15 MTG Slivers with shared abilities, 5 Pacts, 5 Emeritus, 3 Planeswalkers (loyalty), and 7 "rot" legendaries, each with its own Spectral.
  - 77 hidden: Old Fluff, 27 Letter jokers, purple, tokens.
- **Consumables:**
  - Colour 17 → 16; New Gold moves to Spectral; Red, Deep Blue, Orange and Seaweed become permanent card bonuses.
  - Rotarot: the same 22, plus The Soul!.
  - 10 Spectrals.
  - New SuperbossToken type.
- **Packs:** Modded jumbo and mega removed; new Superboss and Nemesis packs.
- **Blinds and enhancements:** +1 blind (Event Horizon); +2 enhancements (Power, Ransom Note); new Cryptic edition.
- **Decks:** Blasphemy and Gros Michel removed; Old, Purple and Spellchaser's added. All sleeves removed.
- **Tags:** 8 → 3.
- **Stakes and stickers:** 6 new stakes, 3 stickers.
- **Ticket:** reworked.
- **New systems:** Attributes, exile zone, Prepared, poison, tetration scoring.

**Reworks.** Triangle (a full rework), Tall Joker, Unpleasant Card, Brass, MS Paint, Sapling, Lollipop, Blood Pact (renamed).
36 of our 81 surviving jokers have changed numbers.

**Art and music.**
- 2x art was dropped (only 1x now).
- `mf_jokers_refresh.png`, which our atlas uses, is gone.
- 14 new atlases, 10 changed; placeholders are admitted.
- 10 new sounds, including an 8.5 MB shop track.

**Our fixes, against upstream.**
- Fixed upstream: Sapling, Black typo, Less Fluff popup, Jolly in Modded packs.
- Moot: Complexity Creep (joker deleted).
- Still broken upstream: Rotarot `G.STATE` check, Missing Joker global.
- Unverified: House/Hook DX, Joke Merge Valley.

**API.**
- Steamodded ≥26.829.0, Lovely 0.9.
- The file layout is completely new (`main.lua` + `src/`), so the extract spec must be rewritten.

**Cross-mod.** Our Reverie port's Every Hue writes MoreFluff 1.5.6's Colour fields. A MoreFluff upgrade must update it.

**Effort:** XL. **Recommendation: hold.**
- Ask notmario whether the post-rewrite code is still MIT; LICENSE was deleted on 2026-03-06.
- Wait for a stable tag ("2.0").
- Then add it as a separate mod id (`morefluff2`) beside a frozen 1.5.6 rather than upgrading in place: too many removals and reworks.
- Small take-now item: none needed. Our fixes already cover the bugs upstream fixed.

### 2.5 Bunco — 5.1 → jumbocarrot0 fork v5.4.8b-JumboFork (no licence)

**Status of the fork.**
- Firch's repo has had no commits since 5.1 (2025-03-20); the fork says Firch "has moved on".
- The mod index was pointed at the fork by a community PR (2025-05). There is no endorsement from Firch.
- The fork has 22 tags, and v5.4.8b (2026-02-20) is the latest.
- **No new gameplay content.** Same 80 jokers and same everything else.

**Changes.**
- About 20 behaviour fixes and tweaks:
  - Gameplan triggers per adjacent joker;
  - Fiendish and Bounty Hunter rebuilt;
  - Conquest makes a single random pick (different RNG use);
  - Fingerprints, Games Collector, Puzzle Board, Dogs Playing Poker, Vandalism, Domino, Prehistoric, Registration Plate;
  - rankless/suitless guards on 7 jokers and 3 blinds;
  - The Prince timing;
  - The Flame and Indigo Tower stop debuffing consumables;
  - shop-only stickers;
  - Eternal Tag and Breaking Tag fixes;
  - Spectrum detection with 6+ cards.
- Glitter edition +$3 and Fluorescent +$1 cost. The Deal's `above_hand` changes.
- 45 description texts reworded; 101 art touch-ups.

**Bugs.**
- **New fork bug:** The Mask's `in_pool` is always false. Don't copy it.
- Of our own fixes, the fork also fixed Loan Shark, Protester and Pawn (differently). It did not fix Sledgehammer, Dread, Knight or Juggalo, so keep ours.

**Extractor.** It needs a `SMODS.find_mod = () => ({})` stub for the fork (tested in a temp copy).

**Effort:** S/M. **Recommendation: partial.**
- PR A: pure fixes.
- PR B: balance and timing changes, behind the version pin.
- Optional: text and art.

### 2.6 BETMMA — up to date

- `Betmma_Vouchers.lua`, `Betmma_Jokers.lua` and `Betmma_Voucher_Pack.lua` are byte-identical to `betmma/my_balatro_mods` main.
- The only later commit (2026-04-09) touches `Better_Vouchers_This_Run_UI`, which we don't port.
- Our local copy lacks two sibling modules that predate it:
  - **Betmma Abilities 1.0.3.18:** an "Ability" consumable type in its own area, with cooldowns; 28 abilities and 4 vouchers.
  - **Betmma Spells 0.1.9.3:** 23 Spell cards with randomly generated suit/rank sequences and fusion; 1 ability; 2 vouchers.
- These are new content, not upgrades. Effort L each (each needs a new card area plus cooldown and sequence systems). **Optional.**

### 2.7 Reverie — label fix + small partial

- Our source is byte-identical to tag **v1.2.6**, the newest release. The registry label `'1.0 (old-API)'` is wrong; it should be `'1.2.6'`.
- main (1.3.0, unreleased, 2024-10-09) adds:
  - the SMODS-1.0 port;
  - **Filmstrip and Stamp sleeves**, with `_alt` variants on their own decks;
  - **Jovial M**, a Cine card that needs Cryptid: skip;
  - a refined Morsel food list that now includes **`j_bunc_fondue`, `j_bunc_starfruit`** (we have Bunco) plus foods from other mods;
  - a coupon-progress guard;
  - a Nopeus pack-area fix (n/a for us).
- **Effort:** S. **Recommendation:** partial. Add the 2 sleeves (`engine/sleeve.js` exists), add the Bunco foods to `get_food_jokers()` when Bunco is on, and fix the version label.

### 2.8 Inscrybed — 2024-10 revision (LunaAstraCassiopeia/LunasBalatroMods, MIT)

- Upstream moved to Luna's repo and was updated in Oct 2024, which is newer than our old-folder copy.
- The author's own fixes **differ from our intended-design reconstruction:**

| Joker | Upstream now | Our port |
|---|---|---|
| Deathly | Common, $4; gains Chips equal to `base.nominal` (J/Q/K = 10, A = 11), starts at 0 | 2 × rank |
| Techno | Starts at 0, gains +8 per hand, resets to 0 | Starts at +8 |
| Magickal | Common, +3 | |
| Beastly | Juices on the first hand | |

- **+1 joker: Mycologists** (Uncommon, $5): when the hand contains a Pair or Two Pair, each scored card gives Mult equal to its rank. The sprite exists upstream.
- Retro Joker is commented out upstream.
- **Effort:** S. **Recommendation:** add Mycologists. Ask the owner whether to adopt the author's balance; it changes keys' behaviour, so put it behind the pin.

### 2.9 Milatro, Mikas, Risk of Jesters, SylvieSilly, TagTeam, Olympus — up to date

All are byte-identical to upstream main.

- **Milatro.** The unreleased `v2-beta` branch (2.DEV.0, last commit 2025-06-23, 61 commits ahead) is a bigger mod: 60 jokers, 5 blinds, 5 consumables, 5 decks, 4 vouchers, 3 tags, 1 enhancement. Main has only fixes merged from it, so don't port it unless the author releases it.
- **Mikas.** The `development` branch is an abandoned 13-of-60 rewrite.
- **lshtech forks.** The lshtech org maintains SMODS-1.0 ports of RoJ, Olympus, Mikas and SylvieSilly. These are API ports, not author releases.
  - The one thing of interest is the **Olympus fork's redrawn art** (6 jokers, column-frame style, 142×190).
  - It could ship as an optional alt skin through `ui/skins.js`. Its licence follows the CC0 original.
- **SylvieSilly.** Upstream main is still the broken WIP; our clean 0.1.1 ("0.11") copy remains correct.

### 2.10 Autumn Circus + AutumnMood Mechanics — frozen

- `github.com/AutumnMood924/TheAutumnCircus` and `/AutumnMoodMechanics` return 404 (deleted or private). The author's public repos are now only JankJonklers and a Pokermon fork.
- The only mirror, Dimserene/TheAutumnCircus, is older (0.0.0a, 2025-03).
- Our 0.0.0f copy (2025-09-17) is the newest copy we can find. Nothing to upgrade. Note that there is no licence and the author has withdrawn the source.

### 2.11 AltaVista, Smirkeo, OmertaDeck

- All three are authored by "Mica" (the owner); there is no external upstream.
- AltaVista and Smirkeo reuse the TagTeam template.

## 3. Suggested upgrade batches (each about one PR, in order)

| # | PR | Size | Depends on |
|---|---|---|---|
| 0 | **Mod-version pin in recipes** (§4) + fix Reverie's label to 1.2.6 | S | — |
| 1 | Merge the placeholder-art branch (`fix/micatro-placeholder-art`, Pokermon 3.9.1 sheets) | S | — |
| 2 | **DONE** (see "Batches 2, 3, 21" below) — Bunco fork pure fixes (Spectrum 6+, Flame/Indigo consumables, rankless guards, Eternal/Breaking Tag, Registration Plate, Bounty Hunter sell) + extractor stub | S | 0 |
| 3 | **DONE** (see "Batches 2, 3, 21" below) — Reverie: 2 sleeves + Bunco foods in Morsel; Inscrybed: Mycologists | S | 0 |
| 4 | Pokermon engine seams: `scale_card`, Attributes + attribute pools, `poll_object` weights, new contexts, `poke_energy`/`poke_item` set aliases | M | 0 |
| 5 | **DONE** (see "Batch 5" below) — Pokermon 3.9.1 data re-extract: rarities, costs, configs, gates, the cgoose → iridescent_hacker alias; refresh test expectations; vendor the 39 changed + 21 new atlases | M | 4 |
| 6–8 | **DONE** (#773 files 01–08, #774 09–17, batch 8 18–34 + zother/zmissingno): 435 existing jokers on 3.9.1, 18 held (see "Batches 6–8" below) | 3 × L | 5 |
| 10 | **DONE** (see "Batch 10" below) — Pokermon Hazard layer rework + Seed enhancement, Miracle Seed, Heavy Boots, Debris deck and sleeve (3.9.1's `diceydeck`: "Dicey" and "Debris" are one deck), Flower ×2 — 16 jokers un-held (11 Hazard jokers, Mega Steelix via a quantum seam, Bellossom/Hoppip line), Shaymin's Flower part | L | 5 |
| 10b | **DONE** (see "Batch 10b" below) — Pokermon **Unown rework** (Unown, Unown Swarm, Ruins of Alph free-Unown rule; 3.9.1 Unown art, the swarm strips tiled) + **Wish Pack** 6 → 3 unused wishes (Jirachi) | M | 5 |
| 11–15 | Pokermon new jokers: 68 Gen 3 + 15 others, by Lua file. **11 DONE** (see "New jokers, sub-batch 11" below: the 26 of pokejokers_09 / 10); **12 DONE** (the 15 of pokejokers_11, below); **13 DONE** (the 19 of pokejokers_12, below); **14 DONE** (the 14 of pokejokers_13–16, below); **15 DONE** (the 18 of pokejokers_18–32, below) | 5 × L | 5 |
| 15b | **DONE** (see "New jokers, sub-batch 15b" below) — **Pokermon main (post-3.9.1) +9 jokers** (owner: must ship): Lotad, Lombre, Ludicolo; Greavard, Houndstone; Electrike, Manectric; Cryogonal; Mawile. Ported from upstream main pinned at af0b656 ("3.9.1-1016a"); `version` stays 3.9.1, contentRev 13 counts them (see below why) | M | 11–15 |
| 16 | **DONE** (see "Batch 16" below) — Pokermon 12 Megas (11 new: Mega Steelix was already ported) + Mega Stone `unique_val` + Mega Berry Juice + the Mega sleeve's `poke_infinite_megastone`. **Keep the add-on dedupe rule** (checkpoint 1 below; PORTING.md "Add-on dedupe"): a base Mega whose name an add-on Mega has makes the add-on's a duplicate automatically (`precedence.js replaced_by`); re-run `addon_dedupe_test`, and update its inventory if a new duplicate appears | M | 5 |
| 17 | **DONE** (see "Batch 17" below; **the Pokermon 3.9.1 upgrade is complete**) — Pokermon non-Pokémon jokers (then finish Rival → Bitter Rival/Champion, Mystery Egg ← Oologist), ~~DNA seal~~, `starterq`, ~~Meteorite/Deoxys~~ (both done in new-jokers sub-batch 14), 5 blinds, Elite stake, 5 challenges; object_weights for Soul items | M | 5 |
| 18 | **DONE** (see "Batches 18–19" below) — Nacho 1.7.9: deprecate the 10 jokers now in base (aliases), re-key Megas and Elite, reworks. **Keep the add-on dedupe rule**: our 9 Nacho duplicates are already out of play as registered legacy definitions (checkpoint 1); when 1.7.9 drops the keys, choose `renamed` aliases (`aliases.js`) vs keeping the legacy definitions. Nacho's Megas re-keyed to `j_poke_*` there replace ours only if base registers them. Its 40 new jokers go through `mark_precedence` like the rest; Pokermon+ 1.2.0 (batch 20) too | M | 17 |
| 19 | **DONE** (see "Batches 18–19" below) — Nacho 40 new jokers (31 load; 4 Toxic-Stall data-only; Impidimp / G-Max not loaded upstream) | L | 18 |
| 20 | **DONE** (see "Batch 20" below) — Pokermon+ 1.2.0: 12 jokers, deck reworks, legacy defs for the 7 dropped | M | 17 |
| 21 | **DONE** (see "Batches 2, 3, 21" below) — Bunco fork balance/timing changes (gated: by the version pin, no mod option) | S/M | 0 |
| later | BETMMA Abilities/Spells; Olympus alt art; MoreFluff 2.x as `morefluff2` once licence and stability are settled | — | — |

## 4. Saves and replays across mod-version changes

**Today.**
- A Micatro **replay and a resumable save are the same thing:** a recipe `{v, seed, back, stake, mods, modOptions, customDeck?, actions}`. `js/engine/session.js` re-simulates it from the start.
- The recipe stores mod **ids only**. `ENGINE_VERSION = 1` is the only version.
- So any change to a card's behaviour, a pool (rarity, weights), an RNG seed key, or a removed key silently changes:
  - every replay that used the mod. The viewer only notices at the end, when `viewChecksum` differs ("recorded on an older version"), or when an action is rejected;
  - **every in-progress run that is resumed.**
- Pokermon 3.9.1 changes all of these. Bunco, Inscrybed and Nacho change some.

**Proposal.**
1. **Pin mod versions in the recipe.**
   - `Session` records `modVersions: {pokermon: '3.2.1', …}` from `registerMod({version})`, and `buildMeta` copies it.
   - Fold it into the server allow-list for `micatro-replay-put`.
   - A recipe without `modVersions` is treated as the versions shipped on the day this lands. Freeze that table as `LEGACY_MOD_VERSIONS`.
2. **Before playback or resume, compare the pins with the loaded registry.**
   - Same versions: play as now.
   - Different versions, **replay:** play anyway but show the existing "older version" notice up front (not only at the end), naming the mod and both versions. Optional: link to a snapshot build (below).
   - Different versions, **resume:** offer "Finish this run on the old rules" only if a legacy build is available; otherwise warn and let the player abandon. Never silently resume a run on new rules, because the action log would desync mid-run.
3. **Keep keys loadable.** Every removed or renamed key gets an alias or legacy definition in the mod: `bl_poke_cgoose`, the moved Nacho jokers and stake, the dropped Pokermon+ jokers, the `Energy`/`Item` sets. Collections, win stickers (`micatro_stickers:<user>`) and old replays then still resolve names and art.
4. **Optional, for faithful old replays: versioned static builds.** Before a mod upgrade merges, deploy the current `micatro/` to an immutable path such as `/micatro/v/<date>/`. The replay viewer then sends recipes whose pins don't match to the build that recorded them. This works because the engine is static JS and the recipe is the whole replay. It's cheap and avoids keeping two copies of the behaviour in code.
5. **Tests.**
   - A recipe made with the old pins must show the mismatch notice before playback.
   - A recipe without `modVersions` must map to `LEGACY_MOD_VERSIONS`.
   - The seeded mod tests and fuzz baselines are re-recorded in the same PR as each upgrade. Record the version in the test name or fixture so drift is attributable.

**Leaderboard.** Modded runs are already tagged by mod set. Add the version to the tag (`pokermon@3.9.1`) so scores made under the old balance stay comparable or can be filtered.

## Owner decisions (2026-10-19)
- **Inscrybed:** keep **our** intended-design numbers. Don't adopt the author's later rebalance; only take new content
  (Mycologists) if ported.
- **MoreFluff:** use the **new 1.9.9999 rewrite** (owner's call; the upstream licence-file removal was flagged).
  It's an XL port and goes after the mod version pin, which must land first, since 12 of our MoreFluff jokers are
  retired upstream and 2 deleted, so saves and replays need the pin plus key aliases.
- **Order:** version pin first, then the MoreFluff rewrite and the Pokermon 3.9.1 batches.

## Mod upgrade checklist (version pin, 2026-10-19)
The version pin (branch `feat/micatro-mod-version-pin`; how it works: `Plans/MICATRO_MODS_PLAN.md` §9) must be merged
before any of the upgrade batches. In each batch:
- [ ] Bump the mod's `version` to the upstream one, and its `contentRev` for every behaviour change of ours (house rules,
      port fixes, re-extracted data, pool weights, RNG seed keys). Base-game change: bump `ENGINE_CONTENT_REV`.
- [ ] Never edit `LEGACY_MOD_VERSIONS` (`micatro/js/mods/pins.js`): it is what pre-pin saves and replays are read as.
- [ ] Every renamed key: `renamed: {old: new}` in `micatro/js/mods/aliases.js` under the mod (Pokermon's
      `bl_poke_cgoose` -> `bl_poke_iridescent_hacker` is already seeded, dormant until cgoose stops being registered).
- [ ] Every removed key (MoreFluff 1.9.9999: the 12 retired + 2 deleted jokers; the moved Nacho jokers and stake; the
      dropped Pokermon+ jokers): `removed: [key]` + `names: {key: 'Name'}`. Never reuse the key.
- [ ] Re-record that mod's seeded tests and fuzz baselines in the same PR; name the version in the fixture.
- [ ] Check: resuming a run started before the upgrade shows the "Mod updated" prompt; an old replay shows the banner.

## Batch 4 — Pokermon engine seams: DONE (2026-10-19, branch `feat/micatro-pokermon-391-seams`)
No content change and no behaviour change (Pokermon `contentRev` stays 1). Details: `micatro/mods/pokermon/PORTING.md`
"Pokermon 3.9.1 upgrade" / "Steamodded seams for 3.9.1" (Steamodded reference: smods 5b8a087, 26.1018.0~dev-b).
- `micatro/js/engine/smods.js` (new): SMODS.scale_card / reset_card (+ scaling_card / resetting_card), attributes
  (`get_attribute_pool`, `has_attribute`, `add_attribute`; Steamodded's 80 built-ins vendored in `smods_attributes.js` by
  `tools/micatro/gen_smods_attributes.cjs`), SMODS.poll_object (weights, `get_weight`, `modify_weights`, attributes +
  `union`, rarity poll, `filter`) + `poll_object_type` + the **object_weights** optional-feature routes (create_card key,
  poll_edition, tags, packs, bosses, vouchers, the shop roll) — off until a mod declares the feature.
- New calculate contexts, opt-in per mod (`registerMod({smods_seams: true})`; Pokermon opts in, Bunco / MoreFluff /
  AutumnCircus do not — they emulate stay_flipped / debuff_card themselves): setting_ability, money_altered,
  modify_ante / ante_change (+ante_end), drawing_cards, debuff_card, debuff_hand, modify_scoring_hand, stay_flipped
  (+ `modify.to_area`), modify_hand, modify_booster_card, create_booster_card, ending_booster, modify_final_cashout,
  poker_hand_changed, playing_card_end_of_round, modify_weights, create_shop_card / modify_shop_card; plus
  SMODS.Blind `calculate` on the vanilla contexts.
- Set aliases `poke_energy` -> `Energy`, `poke_item` -> `Item` (old names stay canonical; registry `set_aliases`,
  `resolve_set`, `is_set`). Every Pokémon center carries `<type>_type` / `stage_<stage>` / `pokemon` attributes.
- Proof: seeded fingerprint fuzz (per-run view hash + hash of every action's event stream) identical to pristine HEAD:
  vanilla x100, pokermon x120, all mods x60, pokermon+nacho+pokermonplus x60. Tests: `micatro/tests/mods/smods_seams_test.mjs`
  (98 checks; 38 fail with the seams disabled).
- Not done here (by design): turning object_weights on for Pokermon (3.9.1 does; it changes every Pokermon run ->
  batch 5+ with a `contentRev` bump); Blind:calculate for the per-card scoring contexts (individual / repetition).

## Batch 5 — Pokermon 3.9.1 data re-extract: DONE (2026-10-19, branch `feat/micatro-pokermon-391-data`)
Pokermon is pinned **`3.9.1+r2`** (`version: '3.9.1'`, `contentRev: 2`; `LEGACY_MOD_VERSIONS` untouched). Details and the full
skipped list: `micatro/mods/pokermon/PORTING.md` "3.9.1 static data for the existing jokers (batch 5)" / "3.9.1 art (batch 5)".
- `micatro/mods/pokermon/data391.js` (generated by `tools/micatro/gen_pokermon_391_overlay.mjs` from the 3.9.1 extract —
  `tools/micatro/extract_mod_data.cjs` + `specs/pokermon_391.json`, new `prelude` option — with the decisions in
  `specs/pokermon_391_overlay.json`) is applied by index.js on top of data.js (3.2.1, untouched).
- Taken: 41 rarities, 7 costs, 7 enhancement gates, 49 perishable_compat + 1 eternal_compat, the jokers' Steamodded
  `attributes` (inert), 9 config numbers (Voltorb, Electrode, Primeape evo, Ursaring, Larvitar, Pupitar, Kricketot, Grubbin,
  Charjabug: their 3.9.1 calculate is a refactor), 4 blueprint flags (Mega Pidgeot, Pokédex, Professor, Treasure Eatery).
- `bl_poke_cgoose` -> `bl_poke_iridescent_hacker`: registered under the new key (3.9.1 name / colour / art, our behaviour);
  the seeded alias is now active.
- Art: the 39 changed sheets vendored as `<name>-391.png`, the 21 new files under their names (gitignored; deploy with
  `npm run deploy-micatro-mods` before merging). Pokermon's own cards draw from the 3.9.1 sheets (jokers at 3.9.1's
  PokemonSprites cells: 70 moved); crop check: 496 identical, 22 touched up, 2 redrawn on purpose (Flower, the boss).
  Unown and the add-ons stay on the 3.2.1 sheets.
- Tests: `micatro/tests/mods/pokermon_391_data_test.mjs` (fails on origin/main); re-recorded expectations in pokejokers
  02/04/08/09/13/14/25, pokermon_content, pokermon_systems, engine_polish, modpin, micatro_mod_version_pin; the 3.2.1
  tester fixture of micatro_resume_win_badges is served the overlay without its joker data (and now asserts the
  "Mod updated" prompt).
- **Skipped to later batches:** every reworked joker's numbers / flags (PORTING.md list: Spearow / Pikachu / Zubat / Eevee /
  Onix / Starters / Jirachi / Rival / Vanillite lines ... -> batches 6–9); the Hazard joker numbers and the Hazard card
  chance 1/6 -> 1/3 (batch 10, entangled with the Hazard layer); Wish Pack 6 -> 3 (Jirachi / wish rework); Pink Seal 1-in-3
  (a new challenge modifier: batch 17); 3.9.1's own Iridescent Hacker logic (blinds batch); **object_weights** — not
  self-contained (needs 3.9.1 item weights, the hidden-item weight path, `pokermon.modify_pool`; re-rolls every shop):
  with the items batch, its own contentRev bump; the 3.9.1 joker texts (with the reworks).

## Batches 5–8 — Pokermon data + reworks of existing jokers: DONE (2026-10-19/20)
- Batch 5 (#771): 3.9.1 static data overlay (`data391.js`, `tools/micatro/gen_pokermon_391_overlay.mjs`), cgoose → iridescent_hacker,
  3.9.1 art sheets (deployed to magepunk-micatromods), pin 3.9.1+r2.
- Batches 6–8 (#773, #774, + batch 8): every existing joker file reworked; contentRev 3 → 5 (pin 3.9.1+r5). Seams added:
  `mod_calculate` (after / individual / end_of_round), unscored destroy step, `add_booster_to_shop`, destroy-step hand info.
- Still held / deferred (full tally: `micatro/mods/pokermon/PORTING.md`):

| Waits on | Held on 3.2.1 | On 3.9.1, one part deferred |
|---|---|---|
| ~~Batch 10 (Hazard / Seed / Flower)~~ DONE | — (all 16 un-held) | — (Shaymin done) |
| ~~Batch 10b (Unown + Wish Pack)~~ DONE | — (Unown, Unown Swarm reworked) | — (Ruins of Alph, Jirachi done) |
| ~~Batch 16 (Megas)~~ DONE | — | — (Mega Lucario, Mega Skarmory, Mega Drampa all landed) |
| ~~Batch 17 (non-Pokémon jokers)~~ DONE | — | — (Rival chain, Mystery Egg ← Oologist landed) |
| Kept by design | — | Porygon-Z's Energy counter |

- New jokers still to add: none (batch 17 added the last 3.9.1 ones: 6 non-Pokémon, 3 April Fools, and Repel, which 3.9.1 never registers). The 9 from upstream main came in sub-batch 15b; the 11 Megas in batch 16. (117 before sub-batch 11, which added 26; sub-batch 12 added 15, sub-batch 13 19, sub-batch 14 14, sub-batch 15 18, sub-batch 15b 9 from main, batch 16 11 Megas; the 2 Jirachi wish forms and Hisuian Qwilfish / Overqwil the tally counted were already in the port.)
- New jokers ported without one part (`new_deferred`): none (Drampa's Mega came with batch 16). (Skitty -> Delcatty: done in sub-batch 12; Kirlia -> Gallade, Roselia -> Roserade, Budew -> Roselia: sub-batch 14.)

## Batch 10 — Pokermon Hazard layer, Seed, Flower ×2, Debris deck: DONE (2026-10-20, branch `feat/micatro-pokermon-391-hazard-seed`)
- Pin **3.9.1+r6** (`contentRev` 6; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "The Hazard layer,
  Seed and Flower (batch 10)".
- The run-wide Hazard layer (level / limit 3; min(limit, level) Hazards dealt into the first hand of each round), Hazard 1 in 3, the Seed
  card, Miracle Seed, Heavy-Duty Boots, Flower ×2 (×3 with Shaymin), the Debris deck + sleeve ($1 per Hazard, no interest).
- Un-held (16): Qwilfish, Skarmory, Roggenrola, Boldore, Gigalith, Golett, Golurk, Ferroseed, Ferrothorn, Tarountula, Spidops, Mega Steelix,
  Bellossom, Hoppip, Skiploom, Jumpluff; Shaymin / Shaymin Sky's Flower part done.
- Engine seams (opted-in mods only; vanilla / Pokermon / all-mods fuzz and More Fluff fingerprints identical on the seam-only diff):
  `first_hand_drawn` at mod level; `quantum_mod_calculate` (a quantum MOD enhancement's own end-of-round calculate).
- Deviations / left: Heavy-Duty Boots spawn as a hidden Item (object_weights still off; retired in batch 17); the Debris sleeve's alt on the Debris deck (needs
  a playing-card `card_limit` seam); batch 10b (Unown rework + Wish Pack) followed (below).

## Batch 10b — Pokermon Unown rework + Wish Pack: DONE (2026-10-20, branch `feat/micatro-pokermon-391-unown-wish`)
- Pin **3.9.1+r7** (`contentRev` 7; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "The Unown rework and the
  Wish Pack (batch 10b)".
- Unown / Unown Swarm reworked (never in a pool; `SMODS.destroy_cards`; 3.9.1 config / text / attributes): spec `rework_hold` and
  `sprite_hold` are empty, so every existing Pokermon joker is on 3.9.1. Ruins of Alph makes its Unown by `SMODS.add_card` (Negative).
- Ruins of Alph's "three free Unown": 3.9.1 followed. The batch-8 guard (cost / sell value zeroed by hand) is dropped, because the
  exploit cannot happen: an Unown always sells for $0 through the set_cost rule both versions have (3.9.1 lovely/poke_utils.toml,
  our rules.js). Fired by the new test.
- Art: Unown on its 3.9.1 card, with its form letter drawn as the soul layer. The Unown Swarm's 3.9.1 strips (20880 px) are split into
  tiles <= 8192 px by `tools/micatro/split_pokermon_unown_swarm.mjs`; the sprite lookup (`js/ui/assets.js` `modCellRect`) picks the
  tile and crops to the card. 12 new gitignored files: `micatro/mods/pokermon/assets/2x/j_poke_unown_swarm[_shiny][_soul]-391-t{0,1,2}.png`
  (deploy with `npm run deploy-micatro-mods` before merging).
- Wish Pack: 3 offers, each a different wish of the 5 (`used_wishes`, seed `jirachi<i>`; no Master Ball). Wishes are `change_form`
  ("Transformed!") and name their form in the tooltip. Jirachi's deferred part is done.
- Tests: `micatro/tests/mods/pokermon_391_unown_wish_test.mjs` (26 passed / 35 failed on origin/main, 61 / 0 here).
- Left on purpose: the Swarm's glued playing-card front (cosmetic; 3.9.1 draws it with a seeded random card inside the renderer).
  Still pending across the 3.9.1 rework of existing content: ~~Mega Lucario / Mega Skarmory (batch 16)~~ done, Rival's chain + the Oologist
  (batch 17), Porygon-Z's counter (kept by design), the Debris sleeve's alt (a playing-card `card_limit` seam), object_weights
  (items batch), Pink Seal 1-in-3 (challenges, batch 17).

## New jokers, sub-batch 11 — Pokermon 3.9.1 pokejokers_09 / 10: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r8** (`contentRev` 8; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 11".
- 26 jokers, in the pools by rarity like every Pokermon joker:
  - from pokejokers_09: Wurmple, Silcoon, Beautifly, Cascoon, Dustox;
  - from pokejokers_10: Seedot, Nuzleaf, Shiftry, Taillow, Swellow, Wingull, Pelipper, Ralts, Kirlia, Gardevoir, Surskit, Masquerain,
    Slakoth, Vigoroth, Slaking, Nincada, Ninjask, Shedinja, Makuhita, Hariyama, Skitty.
- Nincada's Multi Evolution (Ninjask + a Shedinja copy) needed no engine seam.
- New-joker pipeline (for 12–15): static data, sprites, text and families are generated from the 3.9.1 extract into `data391.js`
  (`new_jokers`, `families`, `new_deferred`). The spec lists the names by sub-batch.
- Shared: Wingull's rank and Skitty's type per round, duplicate-rank Straights (Surskit / Masquerain), `get_target_card_suit`,
  `get_consumeables`. An add-on family overlapping a 3.9.1 family joins it (3.9.1 `add_to_family`): Nacho's Ralts line, Pokermon+'s
  Nincada line.
- Deferred: Kirlia -> Gallade (sub-batch 14), Skitty -> Delcatty (sub-batch 12, done there). Their item_req and stone text wait with them.
- Art: their 3.9.1 cells on the Natdex sheets vendored in batch 5. No new files.
- Tests: `micatro/tests/mods/pokermon_391_new_11_test.mjs` (5 passed / 45 failed on origin/main, 176 / 0 here).

## New jokers, sub-batch 12 — Pokermon 3.9.1 pokejokers_11: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r9** (`contentRev` 9; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 12".
- 15 jokers, in the pools by rarity: Delcatty, Sableye, Meditite, Medicham, Plusle, Minun, Volbeat, Illumise, Roselia, Carvanha, Sharpedo,
  Wailmer, Wailord, Torkoal, Spinda. Built with the sub-batch 11 pipeline (spec `new_jokers` "12", regenerated `data391.js`).
- Skitty -> Delcatty (Moon Stone) is on: sub-batch 11's deferral dropped. Meditite -> Medicham, Carvanha -> Sharpedo, Wailmer -> Wailord.
- Deferred: Roselia -> Roserade (Shiny Stone) and Budew -> Roselia, sub-batch 14. Roselia's item_req and stone text wait with them.
- Shared: Minun's $1 shop discount (`rules.js set_cost`), `get_target_card_enhancements` / `find_playing_card` / `get_depleted` /
  `get_enhancements`; Wailord reads `modify_booster_card`. Not ported: Wailord's 1.2x `display_size` (the card frame is fixed).
- Art: their 3.9.1 cells on the Natdex sheets vendored in batch 5. No new files.
- Design wiki: `designwiki_micatro_mods_test`'s sprite-cell check (failing on the Unown Swarm since batch 10b) fixed. The generator emits the
  tiled atlas; the wiki's `mcSprite` picks the tile and crop as `modCellRect` does. Regenerated.
- Tests: `micatro/tests/mods/pokermon_391_new_12_test.mjs` (0 passed / 30 failed on origin/main, 119 / 0 here).

## New jokers, sub-batch 13 — Pokermon 3.9.1 pokejokers_12: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r10** (`contentRev` 10; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 13".
- 19 jokers, in the pools by rarity: Cacnea, Cacturne, Swablu, Altaria, Zangoose, Seviper, Corphish, Crawdaunt, Baltoy, Claydol, Lileep,
  Cradily, Anorith, Armaldo, Kecleon, Shuppet, Banette, Tropius, Chimecho. Built with the sub-batch 11 pipeline (spec `new_jokers` "13").
- Evolutions: Cacnea, Swablu, Corphish, Baltoy, Lileep, Anorith, Shuppet lines. Chimecho's family waits for Chingling (sub-batch 14). Nothing deferred.
- Seams: engine `poker_hand_cards` hook (Zangoose's added cards don't change the poker hand); food jokers' removal fires
  `joker_type_destroyed` with mods on (SMODS.destroy_cards; Tropius); Chimecho's free Vouchers (`rules.js set_cost`); `add_playing_card`,
  `rank` / `suit` in `smods_create_card`; Kecleon's type follows the joker row (hooks) and its card is drawn by `ui.js face()`.
- Fossils: 3.9.1 has no fossil item / pack: Lileep and Anorith are plain Uncommon pool jokers. Nothing to port.
- Art: Natdex cells vendored in batch 5; Kecleon's 11 type cards on the Gen 3 sheet. No new files. The Series A Baltoy / Claydol animations
  are 3.9.1's alternate series (picked per profile), not base art: unused like every Series A alt (a port-wide option, an art batch).
- Tests: `micatro/tests/mods/pokermon_391_new_13_test.mjs` (0 passed / 31 failed on origin/main, 138 / 0 here).

## New jokers, sub-batch 14 — Pokermon 3.9.1 pokejokers_13 / 14 / 15 / 16: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r11** (`contentRev` 11; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 14".
- 14 jokers, in the pools by rarity: Clamperl, Huntail, Gorebyss, Relicanth, Bagon, Shelgon, Salamence, Deoxys, Budew, Roserade, Chingling,
  Bronzor, Bronzong, Gallade. Built with the sub-batch 11 pipeline (spec `new_jokers` "14").
- The deferrals are gone (`new_deferred` empty): Kirlia -> Gallade (Dawn Stone), Roselia -> Roserade (Shiny Stone), Budew -> Roselia; and
  Chingling -> Chimecho. Nacho's Ralts line's `get_highest_evo` resolves again (it needed `j_poke_gallade`). The Flower card's Roserade rule
  (3 suits) is live.
- Ported here instead of batch 17: the DNA Seal (Deoxys's) and the Meteorite (reusable Spectral: Deoxys's formes). Seams: mod consumables
  see `reroll_shop`; Steamodded `perma_h_dollars`; `saveable` consumables can be kept from a pack.
- Jirachi Copy / Negging: already in the port (since the 3.2.1 port); 3.9.1 never registers them, and its Wish Pack offers neither (its "copy" wish is
  Jirachi Invis). Checked and tested; the pack is unchanged.
- Art: all on the batch-5 3.9.1 sheets (Natdex, Gen 3 for Deoxys, Consumables for the Meteorite, Stickers for the DNA Seal). No new files.
- Tests: `micatro/tests/mods/pokermon_391_new_14_test.mjs` (6 passed / 41 failed on origin/main, 7 / 46 on sub-batch 13, 145 / 0 here).

## New jokers, sub-batch 15 — Pokermon 3.9.1 pokejokers_18 / 20 / 21 / 22 / 26 / 31 / 32: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r12** (`contentRev` 12; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 15".
- 18 jokers, in the pools by rarity: Munna, Musharna, Klink, Klang, Klinklang, Axew, Fraxure, Haxorus, Bunnelby, Diggersby, Drampa, Smoliv,
  Dolliv, Arboliva, Bramblin, Brambleghast, Rellor, Rabsca. Built with the sub-batch 11 pipeline (spec `new_jokers` "15").
- Hisuian Qwilfish / Overqwil (the plan's other 2): already in the port since 3.2.1 (3.9.1 still never registers them). 3.9.1 has
  Hisuian Qwilfish's art after all (Gen 2 sheet {2,5}): it now draws that card (spec `unregistered_sprites`), and the Micatro-made card is
  retired. Overqwil is reached through it (+80 Chips). Qwilfish has no evolution in 3.9.1, so none is wired.
- Deferred: Drampa's Mega (batch 16). Seams: Steamodded's usage count of every consumable set (`consumeable_usage_total.item`: Rellor);
  `copy_scaled_values` keeps `Xmult_multi` (3.9.1); Drampa's `get_pack` hook and shop-pack upgrade; Bramblin's rank of the round.
- Add-ons: Nacho 1.6.4 / Pokermon+ ship none of them (Nacho 1.7.9's Smoliv line is deprecated in favour of base: batch 18).
- Art: all on the batch-5 3.9.1 sheets (Natdex; Gen 2 for Hisuian Qwilfish). No new files.
- Fix found by the all-mods fuzz: Zangoose (sub-batch 13) + The Hook could leave a card in two areas; a card The Hook discards is no longer
  added to the hand.
- Tests: `micatro/tests/mods/pokermon_391_new_15_test.mjs` (4 passed / 36 failed on origin/main, 5 / 36 on sub-batch 14, 136 / 0 here).

## New jokers, sub-batch 15b — Pokermon upstream main (post-3.9.1) +9: DONE (2026-10-20, branch `feat/micatro-pokermon-391-new-jokers`)
- Pin **3.9.1+r13** (`contentRev` 13; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "New jokers, sub-batch 15b".
- **Source**: InertSteak/Pokermon main @ **`af0b656cb1d871d541b643b85d97d40caaf0c4b7`** (2026-10-19; `Pokermon.json` "3.9.1-1016a"). That
  is the newest main commit, and all 9 are in it. The 9 are unchanged since the plan's 2042690 (2026-10-17): the only later commit adds
  Solrock / Lunatone, which is not taken.
- **9 jokers**, in the pools by rarity: Lotad, Lombre, Ludicolo, Mawile, Electrike, Manectric, Cryogonal, Greavard, Houndstone.
  - Evolutions: Lotad -> Lombre -> Ludicolo (Water Stone), Electrike -> Manectric, Greavard -> Houndstone.
  - Shared: the Lotad line's beat (2 <-> 4 cards after every hand), main's `deplete` attribute, and `Other.depleted` (which also gives
    Relicanth's tooltip its text).
- **Pipeline**: a second extract (the main tree) and a spec `upstream_main` section. The generator takes ONLY the listed jokers from main
  (data, text, sprite, family, order); the rest of main is listed as drift in PORTING.md for a future rebase.
- **Version**: kept at `'3.9.1'`, with contentRev 13. The prompt / banner read "Pokermon 3.9.1 (rev 12) → 3.9.1 (rev 13)". "3.9.1-1016a"
  would claim main's ~40 other changes, which we don't take.
- **Megas**: none to defer. Upstream has no Mega Mawile / Mega Manectric joker yet, only sprites.
- **Add-ons**: no overlap. Our Nacho 1.6.4 / Pokermon+ 1.0.3 and upstream's newest (Nacho 1.7.9-5, Pokermon+ 1.2.0-261018a) ship none of
  the 9 or their Megas, so there is nothing for the dedupe step.
- **Art**: no new files. All 9 (and Shiny) are drawn on the batch-5 `AtlasJokersBasicNatdex[Shiny]-391.png`; main changed no asset.
  `tools/micatro/compose_pokermon_joker_art.mjs` (new) builds a card for a joker with no upstream art (sibling frame + battle sprite +
  Shiny filter). It was proven on one scratch sample and is not wired in.
- **Tests**: `micatro/tests/mods/pokermon_391_new_15b_test.mjs` (3 passed / 25 failed on origin/main and on sub-batch 15, 92 / 0 here).
  Fixture shim: `micatro_runsync_test` serves pokejokers_21 / 33 as of 9a00cd8f (Cryogonal / Greavard changed its fixture's shop rolls).
  Engine suite 97 / 0 (fuzz vanilla / Pokermon / all mods ok); browser: designwiki_micatro_mods, mod_version_pin, resume_win_badges, runsync all pass.

## Checkpoint 1 ready — the new-jokers stack (sub-batches 11–15b), 2026-10-20
Branch `feat/micatro-pokermon-391-new-jokers` (worktree `.worktrees/pknew`), one commit per sub-batch. Next: ONE full gate, then merge
when the owner says.
- **Jokers added: 101**.
  - 92 that 3.9.1 added: sub-batch 11 26 (files 09 / 10), 12 15 (file 11), 13 19 (file 12), 14 14 (files 13–16), 15 18 (files 18–32).
  - 9 from upstream main (15b).
  - Plus, outside the 101: the DNA Seal and the Meteorite (sub-batch 14); Hisuian Qwilfish now on its 3.9.1 card (15).
  - All of them are in the pools by rarity, with evolutions wired both ways.
  - Pin: **3.9.1+r13** (r7 → r13 over the stack, one rev per sub-batch; `LEGACY_MOD_VERSIONS` never touched).
- **Engine changes** (`micatro/js`, all inert in vanilla runs):
  - Sub-batch 13:
    - `run.js get_poker_hand_info`: a `poker_hand_cards` hook (`registry.js`; Zangoose).
    - `jokers.js`: the food jokers' removal goes through SMODS.destroy_cards with mods on, so `joker_type_destroyed` fires (Tropius).
  - Sub-batch 14:
    - `run.js reroll_shop`: mod consumables see `reroll_shop` (the Meteorite).
    - `core.js`: Steamodded's `perma_h_dollars` (the DNA Seal).
  - Sub-batch 15: `core.js set_consumeable_usage` counts every consumable set (`consumeable_usage_total.item`: Rellor).
  - Sub-batches 11, 12 and 15b: none (mod-side only).
  - Mod-side shared code (`micatro/mods/pokermon/systems/*`):
    - rules.js: per-round cards (Wingull, Skitty, Bronzor, Bramblin), duplicate-rank Straights, `set_cost` (Minun / Chimecho), `get_pack`
      (Drampa), the Lotad beat.
    - utils.js: the 3.9.1 helpers each joker needs.
  - Tools: the overlay generator's `new_jokers` / `families` / `new_deferred` / `unregistered_sprites` / `upstream_main`; the extractor's
    `{name, expr}` globals.
  - Design wiki: tiled atlases (`gen_designwiki_mods.mjs`, `designwiki/app.js`), data regenerated.
- **Art files to deploy across the whole stack: none.**
  - Every new card is on the 3.9.1 sheets vendored and deployed in batch 5 (`AtlasJokersBasic{Natdex,Gen02,Gen03}[Shiny]-391.png`,
    `AtlasConsumablesBasic-391.png`, `AtlasStickersBasic-391.png`).
  - No file was added to `micatro/mods/pokermon/assets/2x/` by sub-batches 11–15b.
  - The retired `hisuian_qwilfish[Shiny].png` stay in the gitignored assets, unused.
  - The art composer's sample output is in a scratch folder only.
- **Still open after the stack**:
  - ~~Batch 16: the Megas~~: **done** (below; checkpoint 2).
  - Batch 17: the non-Pokémon jokers and April Fools.
  - The upstream-main drift (PORTING.md "Known upstream drift").
  - ~~The add-on dedupe step~~: **done** (below). Our Nacho 1.6.4 has no Bronzor / Smoliv line (those are 1.7.9's).

### Add-on dedupe (Pokermon precedence) — the last step before checkpoint 1: DONE (2026-10-20)
Owner rule: base Pokermon wins any conflict with Nacho / Pokermon+. Details: `micatro/mods/pokermon/PORTING.md` "Add-on dedupe (Pokermon
precedence)".
- **Duplicates: exactly 12.** A script check of every registered joker of the three mods, by name and display name, found no others.
  - Nacho: Ralts, Kirlia, Gardevoir, Gallade, Swablu, Altaria, Bagon, Shelgon, Salamence (9 jokers, not the 10 §2.3 counts).
  - Pokermon+: Nincada, Ninjask, Shedinja.
  - Regional forms (Galarian Meowth, the Hisuian ones) and Nacho's Megas are distinct cards, so they stay.
- **Mechanism**: `micatro/mods/pokermon/systems/precedence.js`. An add-on joker with a Pokermon joker's name is detected, not listed.
  - Out of every pool: `mark_precedence` wraps its `in_pool`, and a first `POKE_POOL_RULES` entry covers the random-Pokémon picks.
  - Its key stays registered and active, so an owned one keeps working.
  - Every evolution into it retargets to Pokermon's key (`poke_evolve` / `poke_backend_evolve`), as does Pokermon+'s Shedinja shell.
  - Pokermon's Gardevoir / Gallade / Altaria / Salamence reach Nacho's Megas with a Mega Stone (`addon_megas`), and devolve back.
  - The Pokédex, the design wiki and the deck editor's pickers skip the duplicates.
- **Legacy definitions, no aliases**: `aliases.js` only acts on unregistered keys. Saves, replays, custom decks, stickers and Pokermon+'s
  Wonder Guard challenge (its eternal Shedinja) resolve to the old key, which still plays.
- Pins: **Nacho `1.6.4+r1`**, **Pokermon+ `1.0.3-251101e+r1`** (first `contentRev` for both). Pokermon stays `3.9.1+r13`: alone it
  plays as before. `LEGACY_MOD_VERSIONS` is untouched.
- Test `micatro/tests/mods/addon_dedupe_test.mjs`: 55 / 34 failed before (371428ce), 121 / 0 after. `nacho_test`, `pokermonplus_test`,
  `modpin_test` and `designwiki_micatro_mods_test` were updated for it.

## Batch 16 — Pokermon Megas: DONE (2026-10-20, branch `feat/micatro-pokermon-391-checkpoint2`)
- Pin **3.9.1+r14** (`contentRev` 14; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "The Megas (batch 16)".
- **11 Megas** (the plan's 12 counted Mega Steelix, ported since 3.2.1): Mega Raichu X and Y, Clefable, Victreebel, Starmie, Dragonite,
  Meganium, Feraligatr, Skarmory, Lucario, Drampa. Rarity `poke_mega` (never in a pool), 3.9.1 data / text / sprites.
  - Each base form links its Mega(s). The generator takes a reworked joker's 3.9.1 `megas` and checks every Mega is registered.
  - Raichu picks X / Y like Charizard and Mewtwo: leftmost X, rightmost Y, random in between.
  - Un-deferred: Lucario and Skarmory (`rework_deferred`), Drampa (`new_deferred`, now empty).
- **Mega Stone, 3.9.1**: `used_on` = the Mega's `unique_val`. A used stone targets only its own Mega. A stone whose Mega is gone forgets it at
  end of round. Reverting says "Reverted".
  - Old saves: a resume or replay re-simulates, so nothing stores a stone's ability. A 3.2.1-shaped `used_on` (a center key) still
    resolves at read time and is never rewritten.
- **Items / modifiers**: the Mega Berry Juice (Shuckle slicing a Mega Stone). `poke_infinite_megastone`: the Mega Sleeve's alt on the Mega
  Deck. The Mega Deck and Sleeve also gain 3.9.1's Crystal Ball.
- **Upstream main** (af0b656): still no Mega Mawile / Mega Manectric joker, only sprites, so they are left out.
- **Precedence**: no Nacho / Pokermon+ joker is one of these Megas (by name or display name), so the duplicate set stays 12.
- **Art**: no new files. All 11 (card + soul, and Shiny) are on the batch-5 Gen01 / 02 / 04 / 07 `-391` sheets; the juice is
  `AtlasConsumablesBasic-391` {7,7}.
- **Tests**: `micatro/tests/mods/pokermon_391_megas_test.mjs` (10 passed / 55 failed on origin/main 2acf967b, 108 / 0 here). Updated:
  count pins, rev 14, `addon_dedupe_test` / `nacho_test` / `pokermon_systems_test` (`used_on` = `unique_val`), and the deferral checks.
  Engine suite 100 / 0 (fuzz vanilla / Pokermon / all mods ok); browser: resume_win_badges, runsync (no shim needed), mod_version_pin,
  designwiki_micatro_mods all pass; wiki data regenerated.
- **Pending tally after batch 16**: new jokers still to add, 10 from 3.9.1 (7 non-Pokémon, 3 April Fools: batch 17); `new_deferred` empty;
  `rework_deferred` holds Porygon-Z (kept by design), Rival, and the Mystery Egg (batch 17).

## Batch 17 — Pokermon non-Pokédex jokers, April Fools, blinds, Elite, challenges, object_weights: DONE (2026-10-20, branch `feat/micatro-pokermon-391-checkpoint2`)
- Pin **3.9.1+r15** (`contentRev` 15; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermon/PORTING.md` "Batch 17".
- **Jokers** (data391.js `new_jokers` "17"): Rage Candy Bar, Bitter Rival, Champion (the Rival chain is done), Imposter Professor (+ the
  Starter Pack...? and Tag...?; 3.9.1's knock-off starter flags taken), Daycare, Oologist (the Mystery Egg's speed-ups now apply), and
  Repel (3.9.1 never registers it: registered here, never offered). The April Fools Spiclops, Miror Budicolo (+ the Ludicolo card) and
  Capture Disc: 3.9.1 gates them by the `pokemon_aprilfools` OPTION (no date), and so do we. Capture Disc's shake is a recorded action
  (`poke_capture_disc_drag`, the board's drag distances), so replays stay exact.
- **Blinds**: The Mirror, The Rocket, The Star, Gray Godfather, White Executive, and 3.9.1's own Iridescent Hacker logic (SMODS.Blind
  `calculate`: debuff_card, stay_flipped, drawing_cards).
- **Elite stake**: a mod stake over Gold (+2 win ante, the last 4 antes showdowns). The engine plays mod stakes at level 8. The
  recipe and leaderboard keep its key. Nacho's own Elite stake (`stake_nacho_elite_stake`) is superseded: off the New Run picker, still
  registered. **Win stickers: level 9 = Elite** (owner-approved follow-up, branch `feat/micatro-elite-sticker`): a stake declares
  `sticker_level` (Pokermon's and Nacho's Elite: 9), the win event carries it, stickers.js levels 1..9 with 3.9.1's Elite sticker art
  and colour (#ba8514), server `stickerLevel` 1..9; old clients (no `maxLevel: 9`) are answered with 9 as Gold. Earlier Elite wins were
  recorded as Gold and can't be told apart: no backfill. Other mod stakes (Lilac, MoreFluff's) still record Gold.
  Tests: micatro/tests/mods/elite_sticker_test.mjs, micatro_stickers_server_test, micatro_winstickers_test, designwiki_win_stickers_test.
- **Challenges**: Delibird Dilemma, Safety First (`poke_no_energy`), Mystery Dungeon, Imposter Syndrome, Mean Look; the 7 old ones take
  3.9.1's changes. **Mystery Dungeon's daily seed**: the UI passes today's UTC date at the start, newRun makes it the run's seed
  (`POKE_DDMMYYYY`), the recipe records the seed; the engine reads no clock, so replays / resumes are exact on any day.
- **Pink Seal 1 in 3**: it is 3.9.1's Obituary Sleeve alt on the Obituary Deck (not a challenge): ported, with the Revenant Sleeve alt.
- **object_weights on** (3.9.1 optional_features): the Soul items' weights from the extract (`consumable_spawn`: Great Ball 3, Tera Orb 5,
  Thick Club / Leek 1, Heavy-Duty Boots 2 — batch 10's hidden-Boots deviation retired; Leftovers stays hidden in 3.9.1, so a Spectral
  soul at 0.003), Pokermon's poll_seal / poll_enhancement through poll_object, the Negative / Polychrome weights (Jirachi).
- **Art**: the batch-5 vendored files (Others sheet, miror_budicolo, capture_disc, boss sheet, elite_stake / _sticker). Composed (no
  upstream art): `micatro/mods/pokermon/assets/2x/rage_candy_bar.png` and `repel.png` (main checkout, gitignored; deploy before merging),
  by `tools/micatro/compose_pokermon_joker_art.mjs` (+ `--sprite`, `--base` / `--clear`, `--key-corner`, 4-bit palette PNGs).
- **Tests**: `micatro/tests/mods/pokermon_391_batch17_test.mjs` (8 passed / 56 failed on origin/main 2acf967b, 150 / 0 here). Updated:
  pokermon_391_data, pokermon_content, pokermon_391_hazard, pokermon_391_reworks_c, zotherjokers, smods_seams, zmissingno, challenges,
  modpin, micatro_mod_version_pin, micatro_challenges_ui (37), micatro_runsync (serves batch 16's Pokermon files to its 3.2.1 fixture).
  Engine suite 101 / 0 (fuzz ok); browser: resume_win_badges, runsync, mod_version_pin, challenges_ui, winstickers, designwiki_micatro_mods
  pass; wiki data regenerated. A UI fix rides along: mod blinds' chips and names on the blind-select / HUD (they showed vanilla chips).

## Pokermon 3.9.1 upgrade: complete (2026-10-20)
Batches 4–17 are done: every Pokermon 3.9.1 content file is ported (435 reworked jokers, 121 new ones + Repel, the Megas, the Hazard /
Seed / Flower layer, the Unown rework, the Wish Pack, every item, seal, deck, sleeve, tag, pack, the 6 boss blinds, the Elite stake, the
12 challenges, object_weights), pinned `3.9.1+r15`. What intentionally stays different from upstream is listed in
`micatro/mods/pokermon/PORTING.md` "Pokermon 3.9.1 upgrade: complete" — chiefly: the owner's house rules and intended-design fixes,
Porygon-Z's counter, the Pocket Packs' 3.9.1 contents and the Debris Sleeve's alt (not ported), Elite wins as Gold stickers, and
cosmetic animations / music. Next in this plan: batch 18 (Nacho 1.7.9) and batch 20 (Pokermon+ 1.2.0).

## Batches 18–19 — Nacho's Pokermon Dip 1.6.4 → 1.7.9-5: DONE (2026-10-21, branch `feat/micatro-nacho-179`)
- Upstream: Eternalnacho/NachosPokermonDip `main` @ **904ae3979b8e3d18348c2b9c819c1692daf9d61e** (2026-10-19, main.json 1.7.9-5).
  Pin **1.7.9-5+r2** (`contentRev` 2; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/nacho/PORTING.md` "1.7.9 upgrade".
- Data: `micatro/mods/nacho/data179.js` (extractor + `tools/micatro/specs/nacho_179.json`), `sprites179.js`
  (`tools/micatro/gen_nacho_179_sprites.mjs`: 1.7.9 draws its jokers from Pokermon's 3.9.1 PokemonSprites). `data.js` (1.6.4) stays
  for the legacy definitions.
- **Batch 18**:
  - Retired lines (Ralts, Swablu, Bagon; 1.7.9 `deprecated/`, `can_load = false`): **kept as legacy definitions**, not aliases
    (an alias would swap an owned card's 1.6.4 behaviour for Pokermon's mid-save; the sticker merge stays as generated, 12 rows).
    Out of every pool, no option, evolve into Pokermon's. Mega Salamence (dropped upstream) is legacy too, unreachable.
  - Megas re-keyed: `j_nacho_mega_gardevoir / _altaria / _gallade` → `j_poke_mega_*` (registered by Nacho, attached to Pokermon's
    Gardevoir / Altaria / Gallade: Pokermon `attach_mega`), `renamed` aliases for the old keys.
  - Elite: `stake_nacho_elite_stake` → `stake_poke_elite` (`renamed`); Nacho registers no stake.
  - Reworks of every existing joker taken (table in PORTING.md); Clauncher on by default.
- **Batch 19**: 40 new jokers upstream: **31 ported** (fossils, Snover / Mega Abomasnow, Victini, Solosis, Bounsweet, Wimpod,
  Togedemaru, Dhelmise, Applin ×5, Finizen / Palafin / Palafin-Hero, Frigibax ×3 + Mega Baxcalibur, Excavator) + the 3 apples, the
  Ancient Pack, the Fossil Tag; **4 data only** (Loyal Three, Pecharunt: Toxic-Stall, like Hisuian Sneasel); **not registered**: the
  Impidimp line (`can_load = false` upstream) and the 2 G-Max apples (Agarmons only). Precedence: no new species is a Pokermon joker.
- Art: no joker needed composing (every cell + Shiny twin is real on the 3.9.1 sheets). Vendored (gitignored, main checkout; deploy
  before merging): `micatro/mods/nacho/assets/2x/{consumables,boosters,tags,excavator,excavator_shiny,terapagos_stellar,terapagos_stellar_shiny}-179.png`.
- Seams (inert without Nacho): core.js `debuff_set` / `chip_h_x_mult` hooks, run.js `held_card_evaluated`, view / cardsprite
  `soul_atlas` + soul-only animation; Pokermon `attach_mega`, `EVO_OVERRIDES`, add-on prefix in `generate_pickup_item_key`.
- Tests: `micatro/tests/mods/nacho_179_test.mjs` **37 passed / 88 failed on origin/main (79d033cf), 205 / 0 here**; `nacho_test` rewritten
  for 1.7.9 (137 / 0). Updated: addon_dedupe, elite_sticker, engine_polish, mod_text, pokermon_391_batch17, modpin,
  micatro_stake_unlocks, designwiki_micatro_mods. Engine suite 104 / 0 (fuzz Pokermon + all mods ok); browser: resume_win_badges,
  runsync, mod_version_pin, stake_unlocks_ui, designwiki_micatro_mods pass; wiki data regenerated.
- **Pending tally after batches 18–19**: Nacho — nothing left from 1.7.9-5 but the cosmetic parts (Dip+BFP badge, better fossil UI,
  Tera Orb Stellar text, JokerDisplay). Next in this plan: batch 20 (Pokermon+ 1.2.0), batch 21 (Bunco fork balance).

## Batch 20 — Pokermon+ 1.0.3 → 1.2.0-261018a: DONE (2026-10-21, branch `feat/micatro-pokermonplus-120`)
- Upstream: SonfiveTV/PokermonPlus `main` @ **52c74167fbd2f98c4e1cf21eab1922ca3b993c2c** (2026-10-18, main.json 1.2.0-261018a). Pin
  **1.2.0-261018a+r2** (`contentRev` 2; `LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/pokermonplus/PORTING.md` "1.2.0 upgrade".
- Data: `data120.js` (extractor + `tools/micatro/specs/pokermonplus_120.json`), `sprites120.js` (`tools/micatro/gen_pokermonplus_120_sprites.mjs`:
  the 3.9.1 sheet cells). `data.js` (1.0.3) stays for the legacy definitions.
- **+12 jokers**: Heatran (forged cards: Steamodded perma values), Mega Darkrai, Helioptile / Heliolisk, Minior (quantum Core), Duraludon /
  Archaludon, Shroodle / Grafaiai (Nature, tag_triggered, the is_type rule), Canari Plush, Member Card, Mystery Box. **Reworks**: Darkrai,
  Lechonk / Oinkologne, Melmetal, Nacli line, Cetoddle line, Stonjourner, Timer Ball. **Decks**: Pearlescent new, Shiny / Void reworked;
  Void Sleeve reworked; Weakened sticker / Lilac flag reworked (e_limit_up).
- **Legacy (the 7 dropped)**: Nincada, Ninjask, Shedinja, Croagunk, Toxicroak, Vullaby, Mandibuzz + the Prophetic deck and sleeve stay
  registered with 1.0.3 behaviour, out of every pool and picker; no aliases, nothing `removed`. The hidden Nincada option is kept;
  Croagunk / Vullaby options hidden too. **Wonder Guard**: 1.2.0 DELETED the challenge — kept and listed by the owner's ruling (its
  eternal Shedinja is Pokermon+'s legacy one); hiding it is a one-line filter if wanted.
- **Precedence**: no 1.2.0 species is a Pokermon joker; superseded.js unchanged (12). Not taken: the lovely patch re-parenting Pokermon's
  Elite stake above Lilac (base Pokermon wins).
- Not ported: Quests (upstream ships them empty), Saffron stake (empty), G-Max Duraludon (Agarmons), JokerDisplay.
- Seams (inert without Pokermon+): run.js hook `no_interest`; Pokermon `IS_TYPE_RULES` (types.js, energy.js); `legacy` skipped by
  modBacks / the sleeve picker / the wiki generator.
- Art: all real (3.9.1 sheets + 1.2.0's own `other.png`); vendored (gitignored, main checkout; deploy before merging):
  `micatro/mods/pokermonplus/assets/2x/{other,backs,stickers}-120.png`. Nothing composed.
- Tests: `micatro/tests/mods/pokermonplus_120_test.mjs` **74 passed / 59 failed on origin/main (0199f756), 197 / 0 here**; `pokermonplus_test`
  updated for 1.2.0 (116 / 0). Updated: addon_dedupe, addon_sticker_merge, br_lines, designwiki_micatro_mods (legacy sleeve). Engine suite
  105 / 0 (fuzz Pokermon + all mods ok); browser: micatro_mod_version_pin 47 / 0, micatro_runsync 81 / 0, designwiki_micatro_mods 296 / 0;
  wiki data regenerated.
- **Pending tally after batch 20**: Pokermon+ — nothing left from 1.2.0-261018a but the disabled Quests, the empty Saffron stake, G-Max
  Duraludon and JokerDisplay. Next in this plan: batch 21 (Bunco fork balance).

## Batches 2, 3, 21 — Bunco 5.4.8b fork, Reverie 1.2.6 + 1.3.0 partial, Inscrybed Mycologists: DONE (2026-10-21, branch `feat/micatro-mod-catchups`)
- **Bunco** (batches 2 + 21): jumbocarrot0/Bunco **v5.4.8b-JumboFork = 9643e85326f2ba796ae2b0e043e2e45ec5d0e953** (2026-02-20) on top
  of Firch 5.1 (016e4cd). Pin **5.4.8b-JumboFork+r1** (`LEGACY_MOD_VERSIONS` untouched). Details: `micatro/mods/bunco/PORTING.md`.
  - Batch 2 taken: Spectrum 6+, The Flame / Indigo Tower spare consumables, rankless / suitless guards (7 jokers, The Tine,
    Chartreuse Crown, Filigree), Eternal / Perishable Tag eligibility, Breaking Tag + Luchador immediate, Registration Plate debuff
    re-roll, The Deal (5+ cards, 6-card Deals). Bounty Hunter sell: nothing to port (a fix of the fork's own rebuild).
  - Batch 21 taken: Gameplan per adjacent joker, Conquest single pick + mark, Fingerprints (winning hand, no debuffed), Games
    Collector once per group per round, Puzzle Board needs a selection, Dogs (rankless breaks), Vandalism via the stay_flipped
    context (Blueprint copies roll; `smods_seams: ['stay_flipped']`), Domino neighbour filter, Prehistoric snapshots, The Prince
    flag, Glitter +$3 / Fluorescent +$1, The Deal above Spectrum Five. Shop-only stickers: already so.
  - **Gating: the version pin only, no mod option** (the pin gates resumes and replays; nothing asks for an option).
  - Not copied: The Mask's always-false `in_pool`, The Deal's early return (fork bugs); the Fiendish / Bounty Hunter rebuild (sums
    the answers of several copies: a bug — ours keeps the ordered walk). Kept ours: Sledgehammer, Dread, Knight, Juggalo, Loan
    Shark, Pawn; Protester adopts the fork's (also skips debuffed discards).
  - Port fix found: every Bunco joker is `perishable_compat` (Steamodded's default the port had missed).
  - Text: 29 of the 37 reworded descriptions (the ones keeping their `#n#`). Art: the only changed sheets, under new names —
    `micatro/mods/bunco/assets/2x/Jokers/Jokers-548b.png` (exotic Cassette / Crop Circles / Slothful variants) and
    `.../Enhancements/Enhancements-548b.png` (lighter Cracker); the rest of the "101 touch-ups" are pixel-identical re-saves.
  - Extractor: `SMODS.find_mod` stub in `tools/micatro/extract_mod_data.cjs` (the fork extracts; data.js hand-patched, see PORTING).
- **Reverie** (batch 3): label **1.2.6** (byte-identical to the tag) + from main **3728d64** (1.3.0, 2024-10-10): the Filmstrip and
  Stamp sleeves (+ `_alt`s and the Mega Stamp Tag `tag_rev_mega_stamp`), Bunco's Fondue / Starfruit in Morsel (+ the morseled
  Fondue's second hand). Pin **1.2.6+r1**. Art: `micatro/mods/reverie/assets/2x/sleeves.png`. Details: `micatro/mods/reverie/PORTING.md`.
- **Inscrybed** (batch 3): Mycologists from LunaAstraCassiopeia/LunasBalatroMods **88b7c9c** (2024-10-12). Pin **1.0+r1**; the
  author's rebalance NOT taken (owner rule). Art: `micatro/mods/inscrybed/assets/2x/j_mycologist.png`. Details: `micatro/mods/inscrybed/PORTING.md`.
- **Art to deploy before merging** (gitignored, main checkout): the 4 PNGs above.
- Tests: `micatro/tests/mods/mod_catchups_test.mjs` **20 passed / 48 failed on origin/main (0199f756), 81 / 0 here**; updated
  `bunco_test` (hand order) and `bunco_jokers_a_test` (Dogs + Stone). micatro_engine_test 105 / 0 (fuzz, all mods), modpin 38 / 0,
  micatro_mod_version_pin 47 / 0, micatro_mods_ui 50 / 0, designwiki_micatro_mods 296 / 0 (wiki data regenerated).
- **Pending tally after batches 2, 3, 21**: Bunco — the fork changes outside §2.5's list (PORTING.md "Not taken"); Reverie — nothing
  from 1.3.0 that applies to Micatro (Jovial M needs Cryptid); Inscrybed — nothing (rebalance declined). Next in this plan: batch 20
  (Pokermon+ 1.2.0); later: BETMMA Abilities / Spells, Olympus alt art.
