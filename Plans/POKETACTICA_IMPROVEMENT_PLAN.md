# Poketactica as a whole: improvement plan

Owner, 2026-11-24: "Look for ways to improve Item World, Maze Builder, Mystery Maze and Poketactica as a whole. Each
should get its own improvement plan starting with Poketactica as a whole."

This is the first of four. The others: `POKETACTICA_ITEM_WORLD_IMPROVEMENT_PLAN.md`,
`POKETACTICA_MAZE_BUILDER_IMPROVEMENT_PLAN.md`, `POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md`.

Status: a plan, with the owner's answers (2026-11-24). Nothing here is built. Sizes: S under a day, M a few days, L a week or more.

How it was made: a read of the camp, the battle page, the rules, the rewards and the plans, by a reviewer that ran
nothing. Phone findings come from the CSS, not from a phone. One suspected bug (item 3) was traced in the code and not
reproduced.

## Where the game stands
Seven ways to play hang off one camp: Story (22 maps), the Dungeon, Training, Versus, Tower Defense (Road and Maze
Builder), Mystery Maze and the Item World. The core battle is in good shape: move undo, queued attacks that refund,
forecasts with hit chance and damage range, an enemy-range overlay, fast enemy phases. The permanent-loss warning is
done well.

What is thin is everything round the modes: what to do first, what to chase later, and what stars are for.

## The three biggest gaps
1. **Nothing to chase.** After the Story the only targets are a dungeon checkpoint, the book's count and best waves.
   There are no quests, milestones or daily reasons to come back.
2. **The camp is a flat list.** Up to 17 rows in the order they were built. A new player sees all of it at once, and
   only the Dungeon is locked behind anything.
3. **Stars run out of things to buy.** Nothing costs more than 200 stars and only Rare Polish can be bought twice.

## Plan

### Now: small fixes (each S). BUILT 2026-11-25: Rare Polish takes one more for every ten levels; Training pays half the gauge's stars, EXP and move XP; item 3 was a real bug ("Try again" with nobody left) and is now "Pick a new team"; the Item World's icon is its own
| # | What | Why |
|---|---|---|
| 1 | **Confirm End turn** when figurines can still act | It fires at once, and on a phone it sits beside Execute |
| 2 | **Reprice Rare Polish** so its price rises with the figurine's level | A flat 25 stars a level to 999 while EXP a level grows with the square of the level: a floor 100 clear buys 8 levels |
| 3 | **"Try again" after a wipe** (suspected bug) | A Story defeat loses the whole team, yet the button is offered and then does nothing |
| 4 | **Training pays less than deadly modes** | It is safe and pays the full Bonus Gauge, against the same wild team each time |
| 5 | **Wording pass** | Fallen texts name only "the Story and the Dungeon"; the gauge list prints raw kinds ("moveXp 300"); Mystery Maze and the Item World share an icon |
| 6 | **Say that Give up is a free retreat** in the permanent-loss warning | It is the one way to save a team, and the warning does not mention it |

### Next: the camp and the first hour (M each). BUILT 2026-11-25: item 7 (the camp in three groups: Play, Figurines, Shop and more; nothing new is locked) and item 10 (Settings: six switches, the coaches and the warning, from the camp). Item 12 (squad tools: Sort by level, name, type or newest; Show all, your team, favourites, can evolve, holding an item or duplicates; a favourite, C on a card, cannot be released; Release, asked first, pays nothing and hands back what the figurine held) is built too. Items 9 and 11 are not built yet.
| # | What | Why |
|---|---|---|
| 7 | **Group the camp home**: Play, Figurines, Shop | 17 flat rows; Help sits above Items and the Item World |
| 8 | ~~Open the modes in steps~~ **Dropped by the owner: all modes stay open** | A new player meets everything at once; say what each unlock is and what to do next |
| 9 | **Coach past the first map** | The coach covers five steps on one map; combos, throwing, catching and Geo panels get one popup each |
| 10 | **One Settings screen** | Enemy-phase speed is in the battle menu, effects and speed in Tower Defense, the bar's fold in Mystery Maze; the camp has none |
| 11 | **One results screen** | Battles offer Next or Try again; Tower Defense and Mystery Maze offer only Back to camp |
| 12 | **Squad tools**: sort, filter, favourite-lock, release | The squad sorts by level only, against a cap of 5,000; duplicates have no use |

### Next: permanent loss (M each). BUILT 2026-11-25: item 14. "In danger": a figurine the foes could knock out next phase stands on a red tile and its panel says so (an estimate from the same forecast the player sees). Withdraw (battle rules 12): on the base tile, from the turn after it came out, a figurine goes back to the reserve as it is; never the last one on the map. Item 13 was dropped by the owner.
| # | What | Why |
|---|---|---|
| 13 | ~~Bring a figurine back from the memorial for stars~~ **Dropped by the owner: gone is gone** | The restore already exists in the rules with no button; it is the star sink the game lacks |
| 14 | **Withdraw to base** and an "in danger" tag | The only protection today is a Focus Thread; the permanent-loss plan deferred both |

### Later: reasons to keep playing (L)
| # | What | Why |
|---|---|---|
| 15 | **Goals**: milestones across modes and a few daily tasks (the owner chose both), rewards in stars and figurines | The biggest gap. It also gives every other plan's records somewhere to count |
| 16 | **A Story ending and a post-game ladder** | The ending is one clause; the Story tops out at level 60 and foes reach 999 only near Dungeon floor 664 |
| 17 | **Map objectives other than defeat-all** | The rules only test for a wipe |

## Still open from before
- The enemy AI ignores hazards.
- Memento still faints its user.
- Team-attack odds are not in the forecast.
- The battle balance simulator and the EXP curve were never tuned.
- Whether knockback is in turn battles: two documents disagree.

## Not reviewed
The enemy AI's quality, Versus, the map maker, the figurine book and the server. Star income an hour was not measured.

## The owner's answers (2026-11-24)
1. **A fallen figurine is not bought back.** "No, gone is gone." Item 13 is dropped; the memorial stays a memorial.
2. **Modes stay all open; the camp is only grouped.** Item 8 is dropped. Item 7 (Play, Figurines, Shop) stands.
3. **Goals: both** one-time milestones and a few daily tasks.
4. **Order: the camp and the first hour (7, 9 to 12) come before the goals (15).**

## How to tell it worked
- A new tester reaches the third Story map without asking what to do.
- Testers still play in the week after they clear the Story.
- Stars are spent, not hoarded: look at wallets in the tester digest.
