# Mystery Maze: improvement plan

Owner, 2026-11-24. One of four; see `POKETACTICA_IMPROVEMENT_PLAN.md`. What is built is in
`POKETACTICA_MYSTERY_MAZE_PLAN.md`.

Status: a plan. Nothing here is built. Sizes: S under a day, M a few days, L a week or more.

How it was made: a read of the rules, the items, the traps, the AI, the dungeons and the page by a reviewer that ran
nothing. It read the floor generator and the page by search only, so the claims about inspecting a foe and a map
legend rest on not finding them. The small fixes of the last pass (the shop warning, Rest, status chips and the rest)
are done and are not repeated here.

## Where it stands
Eleven dungeons and an endless one, a faithful floor generator, 23 items, traps, shops, Monster Houses, partners with
tactics, recruits, a storage, replays and live watching. It plays correctly. What it lacks is the decisions that make
a roguelike worth a second run.

## The three biggest gaps
1. **The bag has no decisions.** You can use, throw, take, pay and put back. You cannot drop, swap on a full bag, hand
   an item to a partner or sell to the shop. A full bag just leaves the item on the floor.
2. **Every dungeon has the same loot and the same hazards.** One item list serves every floor of every dungeon; traps
   vary only by depth. Dungeons differ in their wild Pokémon, water or lava, length, and (two of them) darkness.
3. **Nothing to come back for.** Clearing a dungeon again pays 40 to 800 stars. The endless one records a depth and
   pays nothing. Recruits are ordinary figurines at about a 2% rate.

## Plan

### Now (S to M each)
| # | What | Size | Why |
|---|---|---|---|
| 1 | **Items and traps of its own for each dungeon** | S to M | The cheapest way to make eleven dungeons feel like eleven |
| 2 | **A message log** to scroll back through, and **a map legend** | S | Three lines of messages; the minimap is colours only |
| 3 | **Print what the auto-explorer already counts**: recruits, stars and bag size a run | S | It returns them and shows none; it is how the rest of this plan gets measured |

### Next: the bag (M; new actions need a rules revision)
| # | What | Why |
|---|---|---|
| 4 | **Drop, swap on a full bag, give to a partner, sell to the shop** | The core bag decisions. It also unblocks the Trip trap, which waits on dropping |
| 5 | **Held items as finds** on floors and in shops | The long chase the mode lacks; the plan has owed it since the start |
| 6 | **More kinds of item**: wands with charges, moves to teach in the run, pellets you must try to know, more food | 23 items and none is a gamble |

### Next: partners (M)
| # | What | Why |
|---|---|---|
| 7 | **Partners that think**: no strongest move on a nearly beaten foe, no walking onto a trap that is showing | They pick a move by a plain random roll, and their path ignores traps |
| 8 | **More orders**: save PP, plain Attack only, a move switched off | Tactics today are about where to stand, not what to use |
| 9 | **Look**: inspect a foe, a trap, a partner's moves and PP without opening Change moves | Nothing on the floor can be asked what it is |

### Next: floors (M to L)
| # | What | Why |
|---|---|---|
| 10 | **Weather by dungeon** (hail in Frostspire, sand in Pebble Hollow), with its upkeep | Weather is cleared on every floor and does nothing over time |
| 11 | **Special floors**: a gold vault, a locked room and its key, a floor of sleepers | Shops and Monster Houses at 5 to 8% are the only events |
| 12 | **Real boss floors**: an arena, helpers or a trick for each boss | Every boss is a wild Pokémon standing on the stairs |

### Later: reasons to return (M to L)
| # | What | Why |
|---|---|---|
| 13 | **Challenges for each dungeon** (no items, alone, under so many turns), milestones in the endless one, and **a daily dungeon** from one seed | The seed already makes a run exact |
| 14 | **Recruits that matter**: species only one dungeon has, a recruit log, an item that raises the rate, bosses that can join on a second clear | A recruit is a plain figurine today |
| 15 | **Item World dives of their own**: gemstones and the kit as pickups on the floors, a floor rule tied to the item | A dive borrows a story dungeon wholesale; see the Item World plan, item 10 |
| 16 | **Lift and throw; wild Pokémon that pick items up** | Planned from the start, not built |

## Planned before and still not built
Dropping and selling, the Trip trap, held items on floors, partners and wild Pokémon picking items up, items buried in
walls, pitfalls for partners, lift and throw, weather upkeep, hand-made boss rooms, the moves and abilities sweep
table, and the watched phone playtest.

## Checked and fine
- Partners never enter lava or water they cannot cross.
- Partners do not spring hidden traps.
- Storage, stars, EXP, move XP and recruits all carry out of a run.

## Questions for the owner
1. Item 4 changes the rules (new actions): fine to raise the rules revision, as before?
2. Item 6: should some items need identifying, or should everything always say what it is?
3. Item 13: a daily dungeon: is that wanted, and should stars ride on it?
4. Which first: the bag (4 to 6) or the partners (7 to 9)?

## How to tell it worked
- The auto-explorer's runs differ by dungeon in what they carry out, not only in levels.
- Testers clear a dungeon more than once.
- Bug reports stop saying a partner "wasted" a move or "walked into" a trap.
