# Pokemon Upscale 3 — the bottom of the barrel, and the proof passes

> **STATUS: FULLY COMPLETE (2026-09-03).** All four batches shipped as PRs
> #224–#227: **1** Trainer Hill timed gauntlet (dynamic guard injection,
> time-tiered prizes, best-time memory) + Game Corner slots · **2** museum
> paintings (master-rank capstone w/ backfill), ruins word rooms, the
> Mirage Tower → Desert Underpass → Fossil Maniac loop, the New Mauville
> generator, and the disguised-Voltorb junk-pickup BUG fixed · **3**
> Imprison/Grudge/Teatime + Dancer/Opportunist/Perish Body/Emergency
> Exit/Wimp Out/Stall ('arenaaura' proved vacuous — no species carries it;
> form-change abilities stay honestly out of scope) · **4** the story-arc
> talk-to-everyone sweep across 9 villain-arc venues (every actor answers;
> Rocket B2F's mute props are pokecrystal's own `ObjectEvent` no-ops) and
> all three 2026-07 multiplayer bugs verified fixed + pinned. Tests: hill
> 31 · venues2 23 · mechanics 15 · storyarcs 14.

2026-09-03, from the fresh gap audit after round two closed (PRs #215–#222).
The world is genuinely full now: this round is smaller by design — the last
dead venues, the last three tractable battle noops, one ability, and two
VERIFICATION passes (story arcs, multiplayer) that either confirm health or
surface a short fix list.

Verified done and needing nothing: all 35 held-item payloads read, zero dead
damaging moves, doubles ally bug fixed, Battle Tents wired as facilities,
Sealed Chamber/regis, Sky Pillar, event islands, Sevii reachable.

Run batches in order; PR-sized as usual.

## Batch 1 — Trainer Hill + the Game Corner's second game **[4/5 · M]**

- **Trainer Hill** (Hoenn, 14 maps, zero engine): the timed four-floor
  trainer gauntlet. Reception desk at the entrance, the clock starts, fight
  up the floors on the existing trainer system, prize at the roof scaled by
  the time. Repeatable; best time remembered.
- **Slots** at the Game Corners: Voltorb Flip carries the coin loop alone —
  add the classic three-reel slots (pure-logic module, node-testable) beside
  it in the hub.

## Batch 2 — the museum payoff + small dungeon events **[3/5 · M]**

- **Lilycove Museum paintings**: winning a MASTER rank contest hangs your
  Pokémon's portrait (its real sprite, framed) in the gallery — the contest
  system's missing capstone. The curator narrates; one painting per category.
- **Ruins of Alph word rooms**: solving a chamber's slide puzzle also opens
  its word room (flavor + a one-time item).
- **Mirage Tower**: the fossil choice at the top (Root vs Claw — the other
  vanishes with the tower's collapse rumble).
- **New Mauville**: the generator event — reach the core, throw the switch,
  Wattson's thanks (mailed reward).
- **Desert Underpass**: the other fossil, so both lines are completable.

## Batch 3 — the last tractable battle pieces **[2/5 · S]**

- **IMPRISON**: the target can't use moves the user also knows (a
  moveUsable gate, like Taunt's).
- **GRUDGE**: if the user faints to a move that turn, that move loses all
  its PP.
- **TEATIME**: everyone's held berry triggers immediately.
- **ARENA AURA** — the one ability left (315/316).
- Stays honestly noop (needs re-ordering/interception machinery):
  afteryou/quash/instruct/mefirst, snatch/magiccoat/powder.

## Batch 4 — proof passes **[4/5 · M, mostly QA]**

- **Story-arc film pass**: walk the Rocket Mahogany + Radio Tower chain,
  the Magma/Aqua chain, Olivine Lighthouse (Amphy), and the Weather
  Institute end-to-end with screenshots, the way the three intros were
  proven (PR #209 style). The scene machinery is recovered and the scripts
  read honestly — this pass either confirms it or yields a short fix list;
  fix what it catches.
- **Multiplayer re-check**: of the 2026-07 test's three bugs, the card-guest
  loading got real fixes; ghost clipping and PvP turn-order presentation
  have no fix commits — reproduce with the 2-client harness and fix.

**Standing exclusions unchanged:** no dailies-shaped systems (lottery,
swarms, Mirage Island, base-rematch timers, TV), no link rooms, no Battle
Frontier decomp scripts, Hoenn2 stays the sandbox, WHIRLPOOL stays absent.
Cries remain the owner's chip-away worklist.
