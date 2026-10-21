# Reverie — porting notes

Reverie (DVRP, GPL-3.0) is rebuilt natively for Micatro (`registerMod` id `reverie`, prefix `rev`); the port's layout and its
intended-design fixes: the header of `index.js`.

## Label + 1.3.0 partial (batch 3 of Plans/MICATRO_MODS_UPGRADES.md, 2026-10-21)

- **Sources.** Ours is byte-identical to tag **v1.2.6** (github.com/dvrp0/reverie, 2024-07-25, the latest release). The partial
  comes from `main` = **3728d640e80df5e8da44babcf46bafdc235e89cb** (2024-10-10, "Merge pull request #10 from dvrp0/port";
  1.3.0, unreleased: the SMODS-1.0 port).
- **Pin: `1.2.6+r1`** (`version: '1.2.6'` — the old label `'1.0 (old-API)'` was wrong — and `contentRev: 1` for the 1.3.0 parts).
  `LEGACY_MOD_VERSIONS` untouched (reverie `1.0 (old-API)`), so a Reverie run or replay recorded before this shows the
  "Mod updated" prompt / banner. No key was renamed or removed.
- **Taken from 1.3.0 (only what §2.7 lists):**
  - **Bunco foods in Morsel** — `get_food_jokers()` adds `j_bunc_fondue`, `j_bunc_starfruit` while Bunco is on. A morseled
    Starfruit is doubled like any food (1 in 8 to be eaten); a morseled Fondue also converts the SECOND hand of the round
    (1.3.0's `custom_morsel_compat`, on by default; its alternative text `j_bunc_fondue_morsel_alternative` -> `MORSEL_ALT`).
    The other foods 1.3.0 lists belong to mods Micatro doesn't have.
  - **Filmstrip and Stamp sleeves** (data/sleeves.lua, CardSleeves -> `registerMod({sleeves})`, engine/sleeve.js):
    - Filmstrip Sleeve: Cines stack and +1 Cine slot (the Filmstrip Deck's effect). On the Filmstrip Deck (`_alt`): no second
      slot, and an Exchange Coupon placed in the shop or a pack is Negative 1 in 4 (`pseudorandom('filmstrip_sleeve')`, only when
      no Cine edition applied — 1.3.0's order). 1.3.0's `_alt` text also says coupons "may appear in the shop" — its
      `config.rate = 2` is read by nothing, so that part doesn't exist upstream; our `_alt` text says only what happens.
    - Stamp Sleeve: skips give a Stamp Tag (the Stamp Deck's effect). On the Stamp Deck (`_alt`): a **Mega Stamp Tag** — a free
      Jumbo Tag Pack and a random tag (`get_next_tag_key('mega_stamp')`, an Orbital Tag picks its hand by `mega_stamp_orbital`).
      1.3.0 keys it `mega_tag`, which is OUR (1.2.6) Stamp Tag's key, so it is registered as `tag_rev_mega_stamp`; it uses the
      tag sheet's cell x2 as 1.3.0 does (the same cell 1.2.6 drew the Stamp Tag with).
    - Art: 1.3.0's `assets/2x/sleeves.png` (two 71x95 cells) -> `micatro/mods/reverie/assets/2x/sleeves.png` (gitignored: deploy).
- **Not taken:** the SMODS-1.0 port itself (no behaviour), Jovial M (needs Cryptid), the coupon-progress guard (`945b9c9`: ours
  already drops `ability.progress` on conversion and skips a coupon without it), the Nopeus pack-area fix, Cartomancer / JokerDisplay compat, the config tab.

Tests: `micatro/tests/mods/mod_catchups_test.mjs` (Morsel foods, Starfruit / Fondue, both sleeves and both alts, the Mega Stamp
Tag, the pin). `reverie_test` unchanged.
