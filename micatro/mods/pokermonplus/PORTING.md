# Sonfive's Pokermon+ — porting notes

Rebuilt natively for Micatro on top of the Pokermon rebuild (requires `pokermon`). Code map: `index.js` header.

## 1.2.0 upgrade (batch 20 of Plans/MICATRO_MODS_UPGRADES.md, 2026-10-21)

- **Source**: github.com/SonfiveTV/PokermonPlus, `main` at **52c74167fbd2f98c4e1cf21eab1922ca3b993c2c** (2026-10-18, "Nacli evo
  fix"; main.json `1.2.0-261018a`, Thunderstore 1.2.4). Our 1.0.3 port was a65a74b ("Sticker loc fix", 1.0.3-251101e).
- **Pin: `1.2.0-261018a+r2`** (`version: '1.2.0-261018a'`, `contentRev: 2`; 1.0.3 was `1.0.3-251101e+r1`). `LEGACY_MOD_VERSIONS`
  untouched (pokermonplus `1.0.3-251101e`): a run or replay recorded on 1.0.3 shows the "Mod updated" prompt / banner.
- **Data** (never hand-edit the generated files):
  1. `NODE_PATH=<fengari> node tools/micatro/extract_mod_data.cjs <PokermonPlus @ 52c7416> micatro/mods/pokermonplus/data120.js tools/micatro/specs/pokermonplus_120.json`
     (the spec's prelude stubs `pokermon.*` / `SONFIVE` / `SMODS.find_mod`; `src/blinds`, `src/vouchers`, `src/quests` ship empty lists).
  2. `node tools/micatro/gen_pokermonplus_120_sprites.mjs <Pokermon 3.9.1 extract>` -> `sprites120.js`: 1.2.0's jokers draw from
     Pokermon's 3.9.1 sheets (`pokermon.sprites.load_sprites`), so each takes its 3.9.1 PokemonSprites cell on the batch-5 sheets
     (`poke_AtlasJokersBasic*391`). It fails on a joker with neither its own atlas nor a 3.9.1 cell.
  3. `data.js` (1.0.3) stays: only the legacy definitions (and their text) read it. The loc is 1.2.0's over 1.0.3's.

### Content

| | 1.2.0 |
|---|---|
| **New jokers (12)** | Heatran, Mega Darkrai, Helioptile, Heliolisk, Minior, Duraludon, Archaludon, Shroodle, Grafaiai, Canari Plush, Member Card, Mystery Box |
| **Dropped (7) -> legacy** | Nincada, Ninjask, Shedinja (1.2.0 ships the file with an empty list), Croagunk, Toxicroak, Vullaby, Mandibuzz (files deleted) |
| Reworked | Darkrai (a Nightmare when it joins; held Energy applied by type, `darkrai_ecount` deltas; has a Mega), Lechonk / Oinkologne (interest into sell value, no interest while held; Uncommon; by Emma), Melmetal (1 + floor(Metal Energy + Metal jokers / 2) retriggers), Nacli line (scale_card, destroy_cards, evolves at X2 - 0.00001), Cetoddle / Cetitan (scale_card, no Perishable), Stonjourner (no Perishable), Timer Ball (ANY joker of the rarity) |
| Decks | Pearlescent new; Shiny reworked (-1 Booster slot, a Shiny Tag after a Small / Big Blind); Void reworked (reroll: 1 in 15 Nightmare in the shop; no Nightmare after the Boss); Prophetic dropped -> legacy |
| Sleeves | Prophetic dropped -> legacy; Void Sleeve = the Void deck's reroll |
| Stake / stickers | Lilac's flag renamed (`enable_sonfive_weakened`); Weakened is a Steamodded sticker (rate 0.3, compat = an energizable family) and takes 1 Energy + 1 Energy limit (1.0.3: 2 Energies, re-applied after evolving); Forged sticker (Heatran) |
| Challenges | Wonder Guard deleted; Metallurgy / Salt Cured gain a text-less `{id = 'no'}` rule |
| Not ported | the Quests system (1.2.0 ships its blinds, vouchers and guides with empty lists: disabled upstream), the Saffron stake (empty list), G-Max Duraludon (Agarmons only, commented out), JokerDisplay, the 0-Energy tooltip on Weakened jokers |

### Legacy definitions (no aliases, nothing `removed`)

The 7 dropped jokers, the Prophetic deck and the Prophetic Sleeve stay registered with their 1.0.3 data and behaviour
(`sonfive_legacy: '1.0.3-251101e'`, `legacy: true`): saves, replays, custom decks and win stickers resolve and an owned card keeps
playing as it did. They are out of every pool (`in_pool` false + a `POKE_POOL_RULES` entry), off the New Run picker (`modBacks`,
the sleeve picker skip `legacy`), the deck editor and the design wiki. The Croagunk / Vullaby options are hidden (a stored value
loads). The Nincada line is also superseded by base Pokermon (unchanged: `js/mods/superseded.js` keeps its 12 rows).

**Wonder Guard** (1.2.0 deleted the challenge): kept and still listed, by the owner's ruling that it keeps Pokermon+'s own
Shedinja (now the legacy one). Hiding it is one filter if the owner prefers upstream's removal.

### Pokermon precedence

No 1.2.0 species is a Pokermon joker (checked by name over our Pokermon 3.9.1 + main pin): all 12 are added. `mark_precedence` runs
on every center. Not taken: 1.2.0's lovely patch that re-parents **Pokermon's Elite stake above Lilac** (Elite would then apply
Lilac's Weakened): base Pokermon's Elite stays as Pokermon defines it.

### Deviations (contentRev 2)

Intended-design fixes and Micatro shapes, each marked in the code and tested in `micatro/tests/mods/pokermonplus_120_test.mjs`:
- **Void deck**: 1.2.0's `can_apply_energy` wrap returns true for ANY joker while a Negative Energy is used (type and
  energizable checks gone; a number `extra` crashed): ours keeps them and only lifts the limit by one.
- **Pearlescent / Weakened / Void on a base-game joker**: no table `extra` to hold `e_limit_up` (the Lua crashed):
  `ability.sonfive_e_limit_up` (Pokermon `ENERGY_LIMIT_BONUS` reads both).
- **Lechonk**: the Lua returned from the banking step before `level_evo`, so a round that banked interest never counted toward the
  evolution; ours banks and counts.
- **Member Card**: compared `consumeable.ability.name` (`grass_energy`) with the KEY (`c_poke_grass_energy`): typed Energy never
  counted. Ours compares the key.
- **Canari Plush**: took the consumable slots back by `level(silver)` (the count since the last level, 0 right after one) — the
  slots stayed after selling it; and a debuff removed every bonus for good. Ours takes the reached levels back and restores them
  when a debuff ends.
- **Darkrai**: a base-game joker's number / nil `extra` keeps its own value (`ability.sonfive_darkrai_ecount`).
- **Grafaiai**: a debuffed one merges no types.
- **Heatran**: `(perma or 1) + n` starts from Steamodded's 0 (every ability has perma_* = 0), so it is `(perma || 0) + n`. The forged
  card's kept values show in the Forged tooltip (Steamodded localize_perma_bonuses).
- Kept as written (upstream behaviour): Melmetal's precedence (`energies + types / 2`), Duraludon / Archaludon advancing their
  hand counter under Blueprint too, the Timer Ball's "Pokemon" text (it now makes any joker; with Pokermon's default "Pokémon only"
  option it is a Pokémon), Shroodle's tag pick (base tags + the active mods', registration order: Lua `pairs()` is unordered).
- Micatro shapes: `G.GAME.blind.in_blind` = `G.GAME.facing_blind`; the joker `round_eval` context (Minior) runs from the mod's
  `evaluate_round` hook; `poke_energy_plus` / `poke_scry_amount` are our `energy_plus` / `scry_amount`; Steamodded rarity names
  Common / Uncommon / Rare are rarity pools `'1'/'2'/'3'`.

### Engine / Pokermon seams added (all inert without Pokermon+)
- `js/engine/run.js`: hook `no_interest` on the cash-out interest row (Lechonk / Oinkologne). Registry hook list updated.
- Pokermon `systems/types.js`: `IS_TYPE_RULES` (is_type + find_pokemon_type) and `systems/energy.js` energy_matches read it.
- `js/mods/index.js` modBacks + `js/ui/main.js` sleeve picker + `tools/micatro/gen_designwiki_mods.mjs` sleeves: skip `legacy`.
- Pokermon+ hooks for Heatran's Steamodded perma values the engine doesn't score (`chip_h_x_mult` perma_h_x_mult with
  multiplicative stacking, `p_dollars` perma_p_dollars, `card_repetitions` perma_repetitions); the `tag_triggered` context via a
  Tag:apply_to_run wrap (only while Pokermon+ is active); the Void deck's reroll via `reroll_shop`.

### Art
Real art for everything (no composing needed): the 8 Pokémon on Pokermon's 3.9.1 sheets (Natdex / Gen07, Shiny twins too);
Mega Darkrai, Canari Plush, Member Card, Mystery Box on 1.2.0's own `other.png`. Vendored (gitignored, main checkout; deploy
before merging): `micatro/mods/pokermonplus/assets/2x/{other,backs,stickers}-120.png` (other = the 4 cards; backs = + Pearlescent
{6,0}; stickers = + Forged {1,0}). Existing jokers moved to their 3.9.1 cells (all checked real; Oinkologne is Gen09 {0,0} on 3.9.1).
