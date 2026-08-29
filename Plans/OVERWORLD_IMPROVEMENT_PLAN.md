# Overworld Improvement Plan — the RPG's next arc

2026-08-29. Grounded in a code audit of the current state. The engine is mature
(weather/terrain/hazards, ~130 abilities, TMs/EVs/natures, badges → E4 →
Champion, frontier, quests, rivals, villains, day/night, shinies, VS Seeker
rematches, berry regrowth, boss equipment). What remains clusters into seven
batches, ranked by how much play they touch. Audio is deliberately excluded.

Verified starting points:
- `battle.js chooseFoeMove()` — one-ply greedy damage; NEVER switches; 15%
  random even for trainers; `if (!pw) continue` means status moves are never
  picked on purpose, only by the random fallback.
- `daycare.js` — the baby is `buildMon(species, 5)`: full re-roll, zero
  inheritance from parents.
- No `genderRatio` data anywhere (species_extra carries catch/exp/learn only)
  → every species is 50/50, including genderless and locked lines.
- `party.js` — ONE PC box array, no release, no search.

---

## Batch A — Battle brains — DONE (PR #123)

1. **Foe switching.** After a KO, send the best matchup (effectiveness of the
   incoming mon's moves vs yours, minus yours vs it) instead of party order.
   Mid-battle: a boss-tier trainer whose active mon is hard-countered (all
   moves ≤0.5× vs you AND you hit it ≥2×) switches to a better answer, at most
   once per few turns so it can't loop.
2. **Status-move intelligence.** Score status moves instead of skipping them:
   hazards and setup early (turns 1-2), status vs a healthy target, healing
   under 50%, never re-status a statused target, never re-lay hazards.
3. **Trainer strategy tiers.** Route trainers keep the 15% random wobble;
   boss-tier (the same BOSS_CLASSES set as the equipment pass) drop the
   randomness entirely, use switching + status logic, and lead smart. The
   difficulty bump lands exactly where the equipment pass put it.
4. **Boss potions.** Gym leaders/E4 heal once at low HP (classic), announced
   ("Misty used a HYPER POTION!") so it feels fair.

## Batch B — Breeding & genetics — DONE (PR #124)

5. **IV inheritance.** 3 random IVs from the parents (5 with a DESTINY KNOT
   held), rest rolled. EVERSTONE passes the holder's nature. Both items join
   the mart/held pool (everstone is currently missing entirely).
6. **Egg moves.** The father's current moves that the baby's species can learn
   (level-up ∪ TM table — `canLearn` already exists) come with the egg.
7. **Gender ratios.** Generate `genderRatio` per species from the Showdown dex
   (the gen_tm_learnsets.mjs pattern — CRLF gotcha applies): fixes genderless
   species, 87.5% starters, all-female/all-male lines, and makes Ditto the
   universal partner it should be. buildMon + daycare pairing rules read it.
8. **Shiny breeding + the Shiny Charm.** Eggs roll shiny at 2× odds; a SHINY
   CHARM (awarded at a Pokédex milestone, see batch E) doubles odds everywhere.
   Turns the dex grind + daycare into the shiny endgame.

## Batch C — Storage & trainer QoL — DONE (PR #125; item 10 already existed as the Move Shop)

9. **PC boxes.** 8 boxes × 30 with names, box switching, RELEASE (with
   confirm), and search/sort (dex no., level, type, shiny-first). The single
   `magepunk_box_v1` array migrates into box 1.
10. **Move Reminder NPC** (one per region's big city): relearn any level-up
    move your mon's level covers, for a small fee. Kills the "picked the wrong
    TM slot" regret loop.
11. **Stat Judge NPC** at each PC: reads IVs in words ("Best… decent…") so
    breeding progress is visible in-game.
12. **Ability Capsule + nature MINTS** in the department store (post-badge-6
    stock): swap between a species' listed abilities; overwrite battle nature.
    Both already have engine support (ability field, statsFor nature opt).

## Batch D — Dailies & outbreaks — SKIPPED (user call, 2026-08-29)

13. **Daily outbreak.** One route per day (seeded by date) swarms with a
    species at high encounter rate — including species otherwise rare or
    off-region — with a small shiny bonus. A billboard NPC (or the town sign)
    announces it.
14. **Daily gift NPC** — one berry/item hand-out per day, scaling with badges.
15. **Roaming legendary** (post-E4): one legendary wanders routes, moving on
    the daily tick and fleeing battles until trapped/caught. Reuses the
    legendary encounter machinery.
16. **Weekly frontier bonus** — one facility pays double BP each week.

## Batch E — Content completion — DONE (PR #126; 19 exp curves + 20 cries deferred, need data/asset sourcing)

17. **The 11 no-op status moves** (victorydance, shelter, toxicthread,
    corrosivegas, chillyreception, powershift + the doubles no-ops) get real
    effects or curated replacements in learnsets.
18. **Missing competitive items**: ASSAULT VEST, EVIOLITE, HEAVY-DUTY BOOTS,
    WEAKNESS POLICY (+ EVERSTONE/DESTINY KNOT from batch B). All slot into the
    existing held-item hooks.
19. **Exp growth families.** Source per-species growth rates (erratic/fast/
    medium/slow/fluctuating) from the dex data instead of uniform medium-fast.
20. **The 4 missing cries.**
21. **Ransei finish.** The 389 imported fakemon become findable: a post-game
    "Ransei rift" zone (or rift encounters seeded across regions) with their
    own encounter tables; the 49 overworld sprites become followers/statics
    there. Currently they exist only as data.
22. **Pokédex milestones.** Seen/caught tiers pay rewards (money, rare items,
    the SHINY CHARM at ~200 caught) — the dex currently records and pays
    nothing.

## Batch F — Multiplayer polish — 23 & 24 turned out ALREADY FIXED (ghost waypoint queue + ordered PvP event playback); only 25 (async Pokémon) remains

23. **Friend-ghost jitter fix** (from the July test: "clipping all over the
    place, visible only every few frames") — interpolate ghost positions
    between presence polls instead of teleporting on each sample.
24. **Pokémon PvP turn presentation** (same test: "both players seemed to act
    simultaneously") — explicit turn banners + a "waiting for X" state so the
    simultaneous-resolution engine reads as turns.
25. **Async Pokémon battles** — reuse the Battlecards `amatch` correspondence
    infra for play-by-mail Pokémon PvP. Same server keys, a Pokémon snapshot
    instead of a card one.

## Batch G — Story cutscenes — OPEN (its own session)

26. The events.js interpreter already runs transpiled decomp scripts and the
    badge/E4/villain spine works without cutscenes. Flesh out region by region
    — Kanto first: pick the ~10 load-bearing beats (Oak intro w/ rival naming,
    rocket takeovers, Silph, champion ceremony), enable their scripts, stub
    what the interpreter can't do yet, and gate by STORY_SEED so the
    region-picker still skips cleanly. Repeat for Johto/Hoenn only after
    Kanto proves the workflow.

---

Suggested order: **A → B → D → C → E → F → G.** A upgrades every fight in the
game overnight; B+D create the play-forever loops (breeding, shiny charm,
outbreaks); C removes the friction those loops expose; E is steady data work
that can interleave; F needs a two-account test session; G is its own project.

Test gates: every batch lands with a headless suite in overworld/tests/
(depth_test pattern) — run the suite in chunks; the full run-all exceeds the
10-minute shell cap.
