# Inscrybed Jokers — porting notes

Inscrybed Jokers (LunaAstraCassiopeia, MIT) is rebuilt natively for Micatro (`registerMod` id `inscrybed`, prefix
`inscrybed`); the 4 original jokers and our intended-design fixes: the header of `index.js`.

## Mycologists (batch 3 of Plans/MICATRO_MODS_UPGRADES.md, 2026-10-21)

- **Source.** github.com/LunaAstraCassiopeia/LunasBalatroMods, `InscrybedJokers/` at **88b7c9c6146f224e36937154720c9709f37501fd**
  (2024-10-12, "Update InscrybedJokers.lua"; the repo head `6c4a43c`, 2024-12-03, doesn't touch it). No version number upstream.
- **Pin: `1.0+r1`** (`version: '1.0'` unchanged, `contentRev: 1` = Mycologists). `LEGACY_MOD_VERSIONS` untouched (inscrybed `1.0`):
  a new Uncommon joker changes the joker pools, so an Inscrybed run or replay from before shows the "Mod updated" prompt / banner.
- **Taken: Mycologists only** — `j_inscrybed_mycologist`, Uncommon, $5, blueprint / eternal compatible. When the poker hand
  contains a Pair or Two Pair, each scored card gives Mult equal to its rank (`base.nominal`: 2-10, J/Q/K 10, A 11), as upstream.
  Its text is upstream's; art: upstream `assets/2x/j_mycologist.png` -> `micatro/mods/inscrybed/assets/2x/j_mycologist.png`
  (gitignored: deploy).
- **Not taken (owner rule, 2026-10-19): the revision's rebalance** — Deathly (Common $4, `base.nominal` from 0), Techno (from 0,
  +8 per hand), Magickal (Common, +3), Beastly's first-hand juice. Our intended-design numbers stay (Deathly 2 x rank from +22,
  Techno from +8, ...). Retro Joker is commented out upstream.

Tests: `micatro/tests/mods/mod_catchups_test.mjs` (Pair, Two Pair, no pair, Blueprint, the other four's numbers unchanged).
