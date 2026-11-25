# Item World: improvement plan

Owner, 2026-11-24. One of four; see `POKETACTICA_IMPROVEMENT_PLAN.md`. What is built is in
`POKETACTICA_ITEM_WORLD_PLAN.md`.

Status: the owner answered on 2026-11-24; items 1 to 4 are built (see the end). The rest is not. Sizes: S under a day, M a few days, L a week or more.

How it was made: by the session that built the Item World the same day. No tester has played it, and no number in it
has been measured.

## Where it stands
It works end to end: item levels 1 to 100, 4 to 8 slots, plush gemstones, combining, and dives played as battles or
as a Mystery Maze. It was built in a day, so it is the right shape and unproven in every number.

## The three biggest gaps
1. **Nothing is measured.** Foe levels, how strong the finds are, and the ceiling (a level 100 item with eight level
   100 gemstones is +400% of a stat, in Versus too) are first guesses.
2. **A dive is the Dungeon with a different prize.** The floors, the foes and the boss do not know which item you are
   in. A Charcoal Stick's world and a Leftover Clay's world differ only in level.
3. **The finds are invisible.** In a battle dive they appear on the results; in a maze dive they are rolled off the
   board and handed over at the end. Nothing is picked up, fought for or missed.

## Plan

### Now: measure, then fix what the numbers say
| # | What | Size | Why |
|---|---|---|---|
| 1 | **A dive auto-player** (the game's own AI on both sides for battles; `mm_explore` for mazes) that reports, by item price and level: win rate, figurines lost, turns | M | Every other number waits on this |
| 2 | **Tune foe levels and finds** from item 1, pinned by a test | S | The first pass was by eye |
| 3 | **Say an item's real numbers**: "Fire moves x1.33" on its panel, not "its bonus is x1.66 what it was" | S | The player has to do the sum today |
| 4 | **Show the item's level in battle**: the unit panel and the forecast | S | A levelled item looks like a plain one once the battle starts |

### Next: make the slots and gemstones pleasant (S to M each)
| # | What | Why |
|---|---|---|
| 5 | **Combine many at once** ("join all Plush Rubies") and show how many kits it takes | A level 100 gemstone is many joins, one screen each |
| 6 | **Sell Stitching Kits for stars**, at a high price | Kits come only from exits, ten an item; it is also the star sink the game lacks |
| 7 | **Dive into an item a figurine is holding** | It must be taken off first today |
| 8 | **Give the plain items something for their level** (curing beads, Focus Thread, White Moss, Scope Sight gain only slots) | Ten items have no reason to be levelled but slots |
| 9 | **Fill and empty all slots in one press**; sort gemstones by stat or level | Eight slots is a lot of presses |

### Next: make a dive its own thing (M each)
| # | What | Why |
|---|---|---|
| 10 | **Finds on the board**: gemstones and the kit as pickups in a maze dive; a treasure tile or a foe that carries the gemstone in a battle dive | Finds become something you go and get |
| 11 | **Each item's world is its own**: a type booster's world holds that type and its terrain; a bead's world is gentle; a Choice item's world is fast | Dives stop feeling like the Dungeon |
| 12 | **A way out before the exit, as an item** in the style of an Escape Rope (the owner's answer), banking part of the dive (proposed: the levels, not the kit) | All-or-nothing over ten deadly floors is harsh; this is the owner's call |
| 13 | **Records**: deepest item, total levels, gemstones made | Nothing marks the progress today |

### Later (L)
| # | What | Why |
|---|---|---|
| 14 | **Versus fairness**: a match setting that caps item levels and gemstones, off by default | The owner chose "everywhere"; a level 100 set decides a match before it starts |
| 15 | **Foes with levelled items** deep in the Dungeon and Mystery Maze | The player's ceiling rises; nothing else's does |
| 16 | **Gemstones in trades** | Loose gemstones cannot be traded; a figurine trades with what it holds |

## The owner's answers (2026-11-24)
1. **A way out: "Escape Rope style item definitely."** Leaving a dive early takes an item, not a free button. The
   item needs a figurine name of its own (no Poketactica item shares a main-game name). Still to settle when it is
   built: what it banks (this plan's proposal is the levels and not the kit), where it comes from and its price.
2. **Kits are sold for stars, at a high price** (about 500 each).
3. **Versus gets a capped match setting, optional and off by default.**
4. **Worlds that differ (item 11) come before finds on the board (item 10).**

## How to tell it worked
- The auto-player clears a dive at the item's level with a team near the foes' level about half the time.
- Testers level more than one item, and dive in both styles.
- Nobody reports a Versus match decided by gear alone.

## Built and measured (2026-11-25): items 1 to 4
`node tools/poketactica/iw_auto.mjs` plays whole dives as battles with the game's own AI on both sides (the player's
side deploys and plays as a computer seat does), a knocked-out figurine gone for the rest of the dive, EXP kept between
floors. Its team is six ordinary lines (the starters, a bird, a mouse, a rock), so it is a weak player: read it for
how dives compare with each other, not for how hard they are for a person.

What it showed, with the team's level set against the exit floor's foes (10 dives a row):

| Dive | Before: clears at 1.25x / 1.5x / 1.75x | After the cap: at 1.25x / 1.5x |
|---|---|---|
| 1 to 10 | 100% / 100% / 100% | 100% / 100% |
| 31 to 40 | 0% / 20% / 60% | 10% / 90% |
| 61 to 70 | 0% / 0% / 80% | 0% / 30% |
| 91 to 100 | 0% / 10% / 50% | 0% / 30% |

- **A cheap item's world is the Dungeon at the same floor** (same generator, near the same levels); a 40-star item is
  about 1.2 times its levels and a 120-star one about 1.7 times. So the levels are a choice, not an error, and stay.
- **Deep dives were far harder than shallow ones at the same relative level**, because the Dungeon puts 8 foes on a
  floor from floor 30 and a team is 6. Ten such floors in a row, with losses kept, asked for a team 1.75 times the foes.
  **Changed: a floor of an item's world holds at most 6 foes** (`IW_MAX_FOES`, pinned by a test). The boss stays.
- What is left of the gap past floor 60 is probably the auto-player's ordinary team against the stronger species the
  Dungeon picks at depth. Not tuned further on that evidence.
- Finds: gemstones average about level 3 by floor 10, 12 by floor 40, 23 by floor 70 and 33 by floor 100. Left alone.
- Item 3: an item's panel says its own numbers at its level ("Fire moves deal 1.6x damage"), and what it is at level 1
  and level 100. Item 4: the battle's unit panel shows the item's level.
