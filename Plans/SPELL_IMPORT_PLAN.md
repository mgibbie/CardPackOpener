# Battlecards — HS Spell Import Plan (status)

_Re-scoped against the HearthstoneJSON dump (`tools/data/hs_cards_full.json`,
regenerated from HearthSim `CardDefs.xml` build 251951) vs. `battlecards/cards.json`._

## Status: the HS constructed-spell import is COMPLETE

The original version of this plan (written against a much older dump) reported
1,351 missing spells, a blocked Relic mechanic and a missing Relic Vault. All
three are stale — that work landed in the intervening waves. Measured fresh:

| Card type | HS collectible (unique) | In cards.json | Missing |
|-----------|------------------------:|--------------:|--------:|
| Minions   | 4,745                   | 4,502+        | ~0 |
| Weapons   | 245                     | 200+          | ~0 |
| Locations | 62                      | 62            | **0** |
| **Spells**| **2,150**               | **2,150**     | **0** |

Of the 2,150 HS collectible constructed spells, 2,099 match a `cards.json` card
of the same class outright; the remaining 51 were checked by hand and are either
dual-class cards (HS class `INVALID` → `druid__demon_hunter` and friends) or
genuine name collisions (below).

### The Relic package (was "blocked")
Fully built and covered by `tests/regression/relics_test.mjs`:
`relic_of_extinction`, `relic_of_phantasms`, `relic_of_dimensions` (all
`relic: true`, scaling via `improveScaled` off `player.relicImprove`) plus the
`relic_vault` location and its `next-relic-double-cast` tap. HS locations are
62/62.

### The last 14 (imported in the Violet Hold wave)
`ESCAPEFROM_VIOLET_HOLD` spells were the only real remainder — the set's weapons
and locations had landed but its spells never did. All 14 are now in under set
code `VIOLET_HOLD`, covered by `tests/regression/violethold_spells_test.mjs`:

- **Warrior** — `land_ho`, `hook_n_heave`, `follow_the_fuse`
- **Priest** — `haunt`, `follow_the_ghosts`, `slime_em`
- **Rogue** — `follow_the_footsteps`, `silent_strike`, `tricks_of_the_trade`
- **Warlock** — `follow_the_evidence`, `frame_job`, `harsh_sentence`
- **Demon Hunter** — `soul_immolation`
- **Shaman** — `desperate_bribe`

Supporting tokens: `cap_cannoneer`, `cap_spooky_ghost`, `cap_impformant`, and the
`collapsing_star` Hero Power.

## Known, deliberate non-imports

Eight HS spells share a name with an existing non-HS card and were left alone by
owner decision — importing them would put two cards with one display name in the
pool. Revisit only if disambiguated ids are wanted:

| HS card | class | collides with |
|---|---|---|
| Bear Trap | Hunter | `bounty_hunter` trap of the same name |
| Counterspell | Mage | WUBRG neutral instant |
| Lightning Bolt | Shaman | WUBRG neutral instant |
| Naturalize | Druid | WUBRG neutral instant |
| Divination | Mage | WUBRG neutral sorcery |
| Flame Geyser | Mage | neutral `UNGORO` import |
| Mirror Image | Mage | neutral `ICECROWN` import |
| Wanted Poster | Neutral | `bounty_hunter` hero power |

## Regenerating the source dump

`tools/data/hs_cards_full.json` is gitignored (large third-party data). Rebuild it
from the HearthSim definitions when a fresh session needs it:

```
curl -sS -o CardDefs.xml https://raw.githubusercontent.com/HearthSim/hsdata/master/CardDefs.xml
curl -sS -o enums.py    https://raw.githubusercontent.com/HearthSim/python-hearthstone/master/hearthstone/enums.py
# parse Entity/Tag pairs into HearthstoneJSON shape (id/name/text/cost/set/cardClass/type/rarity/collectible)
```

`api.hearthstonejson.com` and the community card-DB sites are blocked by the
sandbox egress policy; `raw.githubusercontent.com` is reachable, so the HearthSim
XML is the practical source of truth.

## What is actually left

Nothing in the HS constructed-spell backlog. Remaining HS-adjacent work is the
non-constructed pools (Battlegrounds, Mercenaries, the adventure/boss decks) and
the eight name collisions above — all of which are design calls, not imports.
