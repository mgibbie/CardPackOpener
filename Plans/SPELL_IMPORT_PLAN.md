# Battlecards — HS Spell Import Plan (scoping)

_Scoped from `tools/data/hs_cards_full.json` (the HearthstoneJSON dump that fed the
4,502-minion import) vs. `battlecards/cards.json`._

## The gap

| Card type | HS collectible (unique) | In cards.json | Missing |
|-----------|------------------------:|--------------:|--------:|
| Minions   | ~4,500                  | 4,502         | ~0 (complete) |
| Weapons   | 200                     | 200           | 0 (complete) |
| Locations | 52                      | 51            | 1 (Relic Vault — blocked on Relic mechanic) |
| **Spells**| **1,820**               | **~469 by name*** | **1,351** |

\* Most "matches" are name collisions with homebrew/WUBRG/paper cards — only ~34
spells have real HS expansion set codes. **HS spells were essentially never
imported.** The 787 spell-type cards in the game are overwhelmingly non-HS:
`hsx` 151, `wubrg` 108, `hs` 98, `paper` 82, `(none)` 174, plus run-mode pools
(Tombs 56 / Duels 43 / Heist 41).

## Why this is authoring, not a data copy

The minions bulk-imported because HearthstoneJSON structures their stats/tribe/
keywords. **Spells are pure effect text, which the DB does NOT translate into engine
effects.** There is no text→effect importer in `tools/`. So each spell needs its
`effects` JSON authored — exactly like the weapon/location waves (waves 19–39).

The upside: the engine already has **~1,008 effect types** and supports nearly every
HS keyword (Discover, Secret, Combo, Choose One, Corrupt, Forge, Dredge, Overload,
Outcast, Quickdraw, Lifesteal…), so most spells map to **existing** effects.

## Buildability of the 1,351 missing spells

Bucketed by leading text pattern:

| Bucket | Count | Maps to |
|--------|------:|---------|
| deal-damage | 195 | `damage` |
| discover | 142 | `discover` |
| buff-stats | 120 | `buff` / `grant` |
| summon | 117 | `summon` / `summon-random` |
| draw | 54 | `draw` |
| secret | 50 | secret infra |
| destroy | 49 | `destroy` |
| transform | 26 | transform effects |
| restore-heal | 20 | `heal` |
| armor | 16 | `armor` |
| freeze | 12 | `freeze` |
| silence | 9 | `silence` |
| gain-mana | 6 | mana effects |
| **template-simple subtotal** | **~816 (60%)** | existing effects, data-only |
| **bespoke / multi-clause tail** | **~535 (40%)** | some need new effects |

Missing by class (even spread): Priest 151, Warlock 146, Mage 144, Hunter 131,
Rogue 129, Paladin 129, Druid 121, Shaman 115, Warrior 110, Demon Hunter 93,
Death Knight 54, Neutral 18.

Missing by school: (none) 677, Shadow 191, Nature 127, Holy 103, Arcane 80,
Fire 76, **Fel 57**, Frost 40. _(The Fel 57 includes the DH Relic spells — importing
them unblocks Relic Vault, the last location.)_

## Recommended execution

Two viable modes; recommend **B**, falling back to A for the hard tail.

**A. Manual waves** (proven, waves 19–39): highest quality, but 1,351 spells at a
careful pace is impractical alone.

**B. Multi-agent workflow** (opted into earlier): fan out per-class/per-batch agents
that author each spell's `effects` JSON constrained to the engine's real effect
vocabulary, then a strict validator (every effect/event/condition checked against the
registry) + smoke test before append — the exact harness used for the weapon-wiring +
adversarial-verify workflow earlier in the project. Ideal for the ~816 template-simple
spells. Reserve manual waves for the ~535 bespoke tail (new mechanics/effects).

### Suggested order
1. **Fel/DH batch first** — clears the Relic spells → unblocks Relic Vault → HS
   location set 52/52 complete.
2. Template-simple by class (workflow), class at a time, ~100–150 each.
3. Bespoke tail by mechanic family (manual waves): quests, twinspell, side-quests,
   the multi-clause 535.

### Guardrails (unchanged from weapon/location waves)
- Web-verify or source-DB-verify each card's exact text before authoring.
- Surgical append to `cards.json` (2-space, CRLF); dedupe by id.
- Per-batch regression test; full `tests/run-all.mjs` + fuzz green before commit.
- Bump the registry-count assertion whenever new effects are added.
- `gen_battlecards_design.py` already emits an "unimported HS cards" backlog — it can
  seed the worklist.
