# Mystery Maze: improvement plan

> **Replaced 2026-11-25 by `POKETACTICA_MODES_PLAN.md`.** What was still unbuilt here is carried there; the "Built" sections below stay as the record.

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
| 11 | ~~**Special floors**: a gold vault, a locked room and its key, a floor of sleepers~~ BUILT | Shops and Monster Houses at 5 to 8% are the only events |
| 12 | ~~**Real boss floors**: an arena, helpers or a trick for each boss~~ BUILT (helpers and tricks; no arena) | Every boss is a wild Pokémon standing on the stairs |

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

## Built (2026-11-25): items 5 and 6, finds and new kinds of item (rules revision 18)
- **5 Held items as finds.** A floor's list has a `find`: a held item of the camp's, lying in the maze or on a shop's
  shelf at its camp price. Which one is rolled by the floor: nothing dearer than 30 + 12 stars a floor, so floor 1 gives
  beads and charms and floor 30 nearly everything. It cannot be eaten, thrown or handed to a partner; it can be put
  down, or sold for half. Carried out, it goes to **your items at the camp**, not the maze's storage; lost with the rest
  if the party falls or gives up. Finds are commoner in Gale Tower and Starfall Spire. The held beads that share a name
  with a maze bead (Oran, Sitrus and the status ones) are never finds: two Oran Beads in one bag would be a muddle.
- **6 Wands.** Dozing, Slowing, Banishing and Swapping Wand, 3 to 6 charges each. "Wave" fires the way the leader
  faces at the first Pokémon ahead and uses one charge whether or not it hits; nothing lands on the floor.
- **6 More food.** Glazed Wax Apple (belly 50 and half of all HP) and Wax Banquet (a full belly, all HP, any status).
- **6 The Vigor Pellet**: whoever eats it, or is hit by it, hits harder for the rest of the floor.
- **6 Unknown pellets, in the hard dungeons only** (the owner's answer; Starfall Spire, Ancients' Descent, The Abyss).
  A pellet goes by a colour ("Red Pellet") in the bag, the messages, Look and its picture, until one of its kind is
  eaten, hits someone, is handed to a partner, or is taken from a shop's shelf (the shelf names it). The colours are
  dealt by the run's seed. Everything is named everywhere else.
- **Old runs**: a run or replay recorded under rules 17 has the floors without any of this, and names every pellet.
- **Measured** (`mm_explore.mjs`, Ancients' Descent, one Lv 5 Bulbasaur, 40 runs): the lone figurine came back 28
  times under rules 17 and 22 with the new lists as first written (the new items thinned the healing). With more
  wands and healing food in that dungeon's own list it comes back 29 times. The other dungeons' checks did not move.
- **Not built**: moves to teach inside a run (the last part of item 6). No page test presses "Wave" or reads a
  coloured pellet's name off the bag: the rules are tested in node (`poketactica_mm_finds_test.mjs`), the page only
  for not having broken.

## Built (2026-11-25): item 10, weather by dungeon (rules revision 19)
- **A dungeon's sky.** A recipe's `sky: [kind, from, every]` gives some floors a weather that lasts the whole floor:
  a sandstorm in Pebble Hollow (2 floors of 8) and Gale Tower (2 of 20), rain in the Tidepool Isles (4 of 10), harsh
  sun in Ember Rift (4 of 12), hail in Frostspire (5 of 14). Never the first floor, never the boss's. The Abyss turns
  through all four, every fourth floor from B6F. Whisper Woods, the two dark dungeons and the two Lv 5 ones stay clear.
- **It is the battle's weather**: rain and sun bend Water and Fire moves (Water Gun about half as hard again in rain),
  for the party and the wild Pokémon alike.
- **Upkeep**: hail and a sandstorm take 1/32 of max HP every 10 turns from whoever is not at home in them (Ice types in
  hail; Rock, Ground and Steel in sand; Ice Body, Sand Veil, Magic Guard and the like). Never the last HP: the weather
  wears a party down, it does not bury anyone. Resting still mends, more slowly.
- **Shown**: a line when the floor begins, a badge beside the floor's number, and the dungeon's weather on its camp
  card before going in.
- **Old runs**: a run or replay recorded under rules 18 has clear skies on every floor.
- **Measured** (`mm_explore.mjs`, 16 runs at each dungeon's suggested level, rules 18 against 19): figurines lost a run
  Pebble Hollow 0.1 and 0.1, Tidepool Isles 0.2 and 0.3, Ember Rift 0.1 and 0.1, Frostspire 0.3 and 0.3; the same
  number cleared in each. The auto-explorer does not pick moves by the weather, so it shows the cost and not the use.
- **Not built**: weather that an item or a trap changes on purpose; fog.

## Built (2026-11-25): item 11, special floors (rules revision 20)
Every fourth floor from the third (never a boss's; none in Whisper Woods) is one of three kinds, in turn. The endless
dungeon has one every fifth floor.
- **A gold vault**: the room farthest from where you start holds six piles of stars, each bigger than a floor's own,
  and two guards standing over them, awake, who go back to their posts when nobody is in sight.
- **A locked room**: a far room's doors are shut. Inside: a held item, two of the floor's things (never sticky) and a
  great pile of stars. A **Brass Key** lies in another room. Walking into a door with the key opens it (that is the
  turn, and the key is spent). The key stays behind when you go down, and never leaves the dungeon. From inside (a
  warp) the door opens without it. A Trawl Marble does not pull out what is locked away. The room is only locked
  when nothing else on the floor is cut off by it; a floor with no such room stays an ordinary one and says nothing.
- **A floor of sleepers**: three more wild Pokémon and two more items than usual, and every wild Pokémon asleep until
  someone comes beside it.
- **Shown**: a banner and a line when the floor begins, a badge beside the floor's number, the doors marked on the
  board and the minimap, and a line on the dungeon's camp card.
- **Old runs**: a run or replay recorded under rules 19 has none.
- **Measured** (`mm_explore.mjs`, 20 runs at each dungeon's suggested level, rules 19 against 20): cleared 182 of 200
  and 176 of 200 (Sunken Ruins 19 and 17, Gale Tower 17 and 15, the rest within one). Stars carried out rose (Tidepool
  Isles 56 and 103). Over 40 floors of each kind in every dungeon a vault was made on 518 of 520 and a locked room on
  414 of 440.
- **Not built**: doors drawn as doors (they are a mark on open ground); a vault that is hidden until found.

## Built (2026-11-25): item 12, real boss floors (rules revision 21)
A boss may have **helpers** beside it (awake, three levels under it, wild Pokémon in strength, keeping to its side) and
one **trick** it plays once, on its own turn.
- **Rage**: at half HP it moves at double speed for the rest of the fight (Magmar, Gengar).
- **Mend**: at a third of its HP it takes a quarter back (Starmie, Dragonite).
- **Rally**: at half HP it calls two more helpers (Glalie, Tyranitar).
- **Who has what**: Butterfree alone, as before. Onix two Geodude. Starmie two Staryu and mend. Magmar two Slugma and
  rage. Glalie two Snorunt and rally. Gengar two Haunter and rage. Dragonite mend, nobody beside it. Tyranitar rally
  (two Pupitar at half HP), nobody beside it at the start. The two Lv 5 dungeons' bosses are as they were.
- **Shown**: a banner, a line and a shake when the trick is played; the dungeon's camp card says what its boss brings.
- **Old runs**: a run or replay recorded under rules 20 meets the boss alone.
- **Measured** (`mm_explore.mjs`, 20 runs at each dungeon's suggested level, rules 20 against 21): cleared 176 of 200
  and 173 of 200. A helper beside the last two bosses cost far more than their tricks: Gale Tower cleared 15 with
  rules 20, 14 with the mend alone, 12 with one Dragonair added (wipes the same; more runs left by Escape Marble);
  Starfall Spire 16, then 15 with the rally alone, 11 to 13 with Pupitar at the start. So those two have a trick only.
  Mend at a third of HP back and at a quarter measured the same; the quarter stays.
- **Not built**: an arena of the boss's own (the floor is still the plain layout); a boss with moves picked for the
  fight; no page test plays a trick (the node test does).
