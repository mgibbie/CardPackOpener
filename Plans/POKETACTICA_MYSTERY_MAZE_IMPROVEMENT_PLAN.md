# Mystery Maze: improvement plan

Owner, 2026-11-24. One of four; see `POKETACTICA_IMPROVEMENT_PLAN.md`. What is built is in
`POKETACTICA_MYSTERY_MAZE_PLAN.md`.

Status: the owner answered on 2026-11-24; items 1 to 4 and 7 to 9 are built (see the end). The rest is not. Sizes: S under a day, M a few days, L a week or more.

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
| 6 | **More kinds of item**: wands with charges, moves to teach in the run, pellets you must try to know (in the hard dungeons only, the owner's answer), more food | 23 items and none is a gamble |

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
| 13 | **Challenges for each dungeon** (no items, alone, under so many turns), and milestones in the endless one. ~~A daily dungeon~~ dropped by the owner | Clearing a dungeon again has no point today |
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

## The owner's answers (2026-11-24)
1. **Raise the rules revision** for the bag actions; old runs and replays stay on their recorded rules.
2. **Unknown items only in hard dungeons.** Everything is named everywhere else. Which dungeons count as hard (the
   proposal: the late ones and the endless one) is settled when item 6 is built.
3. **No daily dungeon.** Challenges for each dungeon and milestones in the endless one stand.
4. **The bag (4 to 6) comes before the partners (7 to 9).**

## How to tell it worked
- The auto-explorer's runs differ by dungeon in what they carry out, not only in levels.
- Testers clear a dungeon more than once.
- Bug reports stop saying a partner "wasted" a move or "walked into" a trap.

## Built (2026-11-25): items 1 to 3
- **1 Each dungeon has items and traps of its own** (rules revision 15; a run or replay recorded before it keeps the shared
  lists it was played on). A dungeon's recipe bends the shared lists: Pebble Hollow has Gravel Chips, Iron Tacks and
  pitfalls; Tidepool Isles Quick Pellets and Trawl Marbles; Ember Rift Rawst Beads, Blast Pellets and blasts that wait
  until the dungeon is under way; Frostspire Chesto Beads, Slumber Marbles, slow and gust traps; the dark Sunken Ruins
  Luminous Marbles, seal and PP-Zero traps; Gale Tower Warp and Quick Pellets, gusts and warps; Starfall Spire Max Joint
  Oil and the big marbles. No dungeon opens with a blast, a Pokémon Trap or a pitfall on its first floor. An item's world
  keeps the shared lists for now (the Item World plan, items 10 and 11).
- **2 Messages and a map legend** in the field menu: the run's last 120 messages, the newest first, under their floor;
  and each colour of the minimap with what it means.
- **3 The auto-explorer prints what a run brings out**: recruits, stars, the bag's size and the five items it most often
  holds; `--rev=14` plays the dungeons as they were.

Measured before and after with it (a careful party at each dungeon's suggested level, 20 runs; Starfall Spire 40):

| Dungeon | Cleared before / after | Fallen a run before / after | Now most often carried out (after apples and Oran Beads) |
|---|---|---|---|
| Whisper Woods | 20 / 20 | 0.1 / 0.0 | Pecha Bead |
| Pebble Hollow | 19 / 19 | 0.3 / 0.3 | Gravel Chip, Iron Tack |
| Tidepool Isles | 20 / 20 | 0.3 / 0.3 | Rawst Bead, Cheri Bead |
| Ember Rift | 20 / 19 | 0.3 / 0.3 | Blast Pellet, Rawst Bead |
| Frostspire | 18 / 19 | 0.3 / 0.3 | Chesto Bead, Pecha Bead |
| Sunken Ruins | 18 / 17 | 0.6 / 0.8 | Pecha Bead, Luminous Marble |
| Gale Tower | 17 / 18 | 1.1 / 1.1 | Warp Pellet, Quick Pellet |
| Starfall Spire (of 40) | 28 / 26 | 1.3 / 1.1 | Blast Pellet, Joint Oil |
| Sprout Trial | 18 / 18 | 0.3 / 0.3 | Iron Tack, Blast Pellet |
| Ancients' Descent | 8 / 14 | 0.3 / 0.3 | Cheri Bead, Escape Marble |

So the dungeons are about as hard as they were, and what a run carries out now differs by dungeon. Ancients' Descent
is the one that moved (more Oran and Sitrus Beads and Escape Marbles for a lone Lv 5): it was the hardest by far.

## Built (2026-11-25): item 4, the bag (rules revision 16)
- **Drop**: what is in a bag slot goes down where the leader stands (a turn). Not onto another item, the stairs or a
  shop's carpet; a sticky item stays stuck.
- **Swap**: a bag slot for what lies underfoot (a turn). It is how a full bag takes something better; the "bag is full"
  message says so.
- **Give**: a bead, a drink or a Quick Pellet to a partner, who takes it in at once (a turn). Food stays the leader's
  (the belly is the leader's); pellets that harm, marbles and things to throw are refused.
- **Sell**: on a shop's carpet with its keeper friendly, an item of yours for half its price (free, like paying).
- A run recorded under rules 15 has none of the four. The auto-explorer does not use them, so its numbers stand.
- Not done here: the Trip trap (it waited on dropping), and wild Pokémon picking items up.

## Built (2026-11-25): items 7, 8 and 9, the partners (rules revision 17)
- **7 Partners that think.** A partner used to pick its move by one plain roll, as a wild Pokémon does. Now a foe beside
  it with a quarter of its HP or less gets the plain Attack (free, and enough); otherwise it uses the move worth most
  against what it would hit (power times type matchup, over the foes in the move's area), never one the foe is immune to.
  Following the leader, chasing or keeping away, it walks round a trap that is showing, and crosses one only when there
  is no other step. Wild Pokémon choose as they always did.
- **8 Orders for moves**, under Menu, Tactics, a partner: "Its best move", "Save PP" (the plain Attack while a foe is in
  reach; its moves for a boss or from a distance) or "Attack only"; and any one move switched off. Free, like a tactic.
- **9 Look**, in the field menu: a cursor over what is in sight; a foe (types, HP, status, ability), a trap (what it
  does), an item (what it does, its price in a shop), the stairs, a partner (its orders, its moves and PP).
- A run recorded under rules 16 has the old partners and no orders.

Measured with the auto-explorer (20 runs a dungeon at its suggested level), figurines lost a run before / after:
Whisper Woods 0.0 / 0.0, Pebble Hollow 0.3 / 0.2, Tidepool Isles 0.3 / 0.1, Ember Rift 0.3 / 0.1, Frostspire 0.3 / 0.2,
Sunken Ruins 0.8 / 0.7, Gale Tower 1.1 / 0.7, Starfall Spire 1.3 / 1.1, Sprout Trial 0.3 / 0.1, Ancients' Descent (alone)
0.3 / 0.3. Clears are within a run or two of where they were. So the dungeons are a little kinder, as partners that waste
less should make them; the one dungeon with no partners did not move.
