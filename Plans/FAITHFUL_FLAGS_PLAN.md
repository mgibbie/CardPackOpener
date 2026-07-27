# FAITHFUL FLAGS — COMPLETE (2026-07-27). All 378 flags resolved; zero remain. See git history (P1-P10, 5 tail batches).

# Faithful Flags Plan — upgrade all flagged approximations

Goal: make the ~378 cards flagged "(Not modeled: X)" / "(Approximated: X)" fully
faithful, mechanic by mechanic. Each phase = one commit, smoke-tested.

## Semantics pinned from hs_cards_full.json
- **Rewind** (TIME): Mister Clocksworth token chain (`Rewind, Rewind` -> `Rewind` -> none)
  proves Rewind = when played, a copy with ONE FEWER Rewind returns to your deck.
- **Prepare** (JAIL): enchantments `Prepared: Cost reduced` + `Preparing: Can't be played
  this turn` = hand action: discount a card, locked for the turn. Needs a client action.
- **Dark Gift** (EDR): EDR_102t "Executes nightmare bonus" — a random bonus effect
  attached to the discovered card. Exact pool absent from dump -> curated pool.
- **Starships** (GDB): real `Launch Starship` spell exists (GDB_905). Pieces assemble;
  launch merges stats + fires launch effects.
- **Magmaw** appendages: "Magmaw's Body" 2/1, DR: +2 Attack to a random friendly.
- **Leviathan's Claw**: 4/2 Rush/DS, after attacks -> draw. **Gigafin's Maw**: 4/7 Taunt.

## Phases
- [x] P1  Quick wins (engine already supports): Tradeable flags (19 cards),
        Colossal appendages (Leviathan/Gigafin/Magmaw), Location interactions
        (Runi/Elise discover location, Cruise Captain summon 2 locations,
        Scrapbooking copy friendly location).
- [ ] P2  Known-semantics keywords: Quickdraw (conditional drawnThisTurn),
        Temporary (end-of-turn discard flag), Start-of-Game hook (deck scan at
        game start), in-hand turn transforms (reuse chameleosTransform machinery),
        Health-cost (altCost life).
- [ ] P3  Discover-with-bonus: Dark Gift + Bonus Effects (curated random-bonus pool
        attached on discover/trigger).
- [ ] P4  Imbue: per-class imbued Hero Powers + imbueCount (replaces the Justicar proxy).
- [ ] P5  Kindred: shared-minion-type condition (control/played another minion sharing
        a type) replacing fires-on-play.
- [ ] P6  Rewind: on play, shuffle a copy with rewind-1 into deck.
- [ ] P7  Starships: piece zone + Launch Starship card (merge stats, fire launch effects).
- [ ] P8  Fabled + Start-of-Game legendaries (Broxigar, Garona, Muradin, Lady Azshara,
        Mug'Zee, Chainbreaker Hogger, Chef Neth'rek, Godfrey) — bespoke per card.
- [ ] P9  Prepare: client-side hand action (like Trade) + Prepared/Preparing states.
- [ ] P10 Long tail: per-card riders (in-hand growth, killer-transform, hand-swap,
        excess-damage draw, cleave, heal-lock, put-back, Archon merge, etc.).

Flag hygiene: when a card becomes faithful, strip its "(Not modeled/Approximated ...)"
suffix from the description.
