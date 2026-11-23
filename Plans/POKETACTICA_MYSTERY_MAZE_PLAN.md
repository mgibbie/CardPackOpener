# Poketactica — Mystery Maze (plan)

Owner, 2026-11-23: a single-player sub-mode inside Poketactica "quite close to pokemon mystery dungeon … study the decomp
of blue rescue team to match the level generation". Same isometric view, sprites and battle system as Poketactica; "the
same type of turn based as mystery dungeon where everything only moves when I move". It must have spectating and replays.
**Nothing here is built yet.** Build order: permanent loss, then Tower Defense, then this.

Research (from the pret/pmd-red decompilation, read only; Red and Blue Rescue Team share this code):
- `Plans/PMD_FLOOR_GENERATION_SPEC.md` — the floor generator, function by function, with its constants.
- `Plans/PMD_SYSTEMS_SPEC.md` — turns, speed, spawning, enemy AI, items, traps, vision, recruiting.

## Owner's decisions

| Question | Answer |
|---|---|
| Name on the camp menu | **Mystery Maze** |
| Movement | **8 directions**, as the original. |
| Who you control | **The leader only.** Up to 3 partner figurines follow and act on their own. |
| Systems in version 1 | **All four**: bag, items and traps · belly (hunger) · Monster Houses and shops · recruiting. |
| Dungeons | **All three kinds**: named dungeons at your figurines' own levels · special dungeons that reset everyone to Lv 5 with an empty bag · one endless dungeon. |
| Fainting | **A figurine that faints is gone for good** (the permanent-loss plan). If the party is wiped out, everything from the run is lost. |

## What "match the level generation" means here

The generator is rebuilt in JavaScript **step for step** from the decompiled one: the same 56 × 32 grid, the same 12
layouts, the same order of steps, the same constants, and the same random number generator, so that the same seed and
floor settings walk the same path through the algorithm.

| Piece | From the decomp |
|---|---|
| Floor size | 56 × 32 tiles; the outer ring is unbreakable wall. |
| Random numbers | `state = state × 1566083941 + 1` (32-bit); a roll uses the top 16 bits; `RandInt(n)` gives 0…n−1; `RandRange(a, b)` excludes `b`. Generation and play share one stream. |
| Layouts | Large, Small, One-room Monster House, Outer ring, Crossroads, Two rooms with a Monster House, Line, Cross, Large (small grid), Beetle, Outer rooms, Medium. |
| Standard pipeline | Pick a grid of cells (up to 6 × 4) → choose which cells are rooms (room density) → size and place each room → connect cells by a random walk (floor connectivity) → remove dead ends (unless allowed) → dig the kinked corridors → merge some rooms (5%) → shop → Monster House → extra corridors → room imperfections → secondary structures → junctions → rivers and lakes (water or lava by theme). |
| Retries | Up to 10 layouts per try (a floor needs ≥ 30 room tiles and ≥ 2 rooms), up to 10 tries (the player and the stairs must both be placed and the stairs reachable); if all fail, a one-room Monster House. |
| Then | Stairs, items (some buried in walls), traps, the player, enemies, Monster House contents, the shop's stock. |

Per-floor settings are the original's `FloorProperties` fields, kept under the same names: `layout`, `roomDensity`,
`floorConnectivity`, `enemyDensity`, `kecleonShopChance`, `monsterHouseChance`, `allowDeadEnds`,
`secondaryStructuresBudget`, `roomFlags` (rivers / imperfect rooms), `itemDensity`, `trapDensity`, `numExtraHallways`,
`buriedItemDensity`, `standaloneLakeDensity`, `visibilityRange`.

**Faithful, quirks included.** The original has a few accidents; each is copied where it is well-defined and noted in the code:
- a corridor-junction pass that ignores the tile below for columns 30 and up;
- shop / Monster House flags that carry over between retries;
- maze rooms that can never appear but still use up one random roll.

One quirk can't be copied as-is: dead-end removal sometimes reads memory the original never set. The port reads 0 there
and says so.

**How we know it matches.** No ROM is involved, so:
1. *Structure tests* on thousands of seeded floors per layout: border walls, room counts, every room reachable, stairs
   reachable from the start, no item or trap on a corridor junction, shop and Monster House never the same room, the
   counts inside the spec's formulas.
2. *A second, blind port.* A separate agent writes the generator again from the spec alone; the two must agree tile for
   tile on 1,000 seeds per layout. Where they differ, the decomp decides. This catches misreadings.
3. *If it proves practical:* compile the decomp's own `dungeon_generation.c` on the desktop with its dependencies stubbed
   and use its output as golden floors. This is the strongest check, but it may not be worth the stubbing; stage 1 tries
   it for a day and reports.

Honest limit: floors will be the same *kind* of floor made the same *way*. Reproducing a specific floor from a cartridge
save also needs the rolls the game makes between seeding and generating, which the decomp research did not trace.

**The dungeons themselves are ours.** The generator and its settings format match the original; the list of dungeons,
their names, themes, floor tables and Pokémon lists are written for Poketactica, using its board themes (meadow, forest,
ruins, cave, snow, volcano, islands, tower, spire). The research records three of the original's floors only to show the
range of real settings.

## A turn (from the original)

- Time moves in ticks; a normal turn is 4 ticks. On each tick, in this order: the respawn check, **the leader** (the game
  waits here for you), **partners** in party order, **wild Pokémon** in spawn order. Nothing moves until you act.
- Everyone gets one action a turn. Speed *stages* (from moves and items: Agility, a Slow Trap) give 2, 3 or 4 actions a
  turn, or one every two turns, by the original's 24-tick table. A figurine's Speed *stat* keeps its Poketactica job
  (accuracy and evasion); it does not give extra turns.
- **Uses a turn**: a step, an attack, a move, an item, picking up, the stairs, passing. **Free**: turning to face, menus,
  looking at the map.
- **Diagonals**: you can't step or strike diagonally around a wall corner (both side tiles must be open; water and lava
  count as open). Walking into a partner swaps places.
- **Every action**: belly −0.1 (100 belly lasts 1,000 actions; at 0 you lose HP each action instead of healing); HP back
  by max HP ÷ 200 for your party only; status timers count down.
- **The wind**: 1,000 turns on a floor (2,000 in long dungeons), warnings as it nears, then you are blown out of the
  dungeon. *(Open question 3: what that costs.)*

## The battle system is Poketactica's

- **Damage**: `overworld/rules/` exactly as in a Poketactica battle: the real formula, the mainline type chart, STAB,
  abilities, held items, weather, move levels, the hit chance with Speed and facing. Not the original's own damage maths.
- **PP and SP**: both, as in Poketactica. Walking gives SP back (2% of max per tile), which suits a game about walking.
  PP comes back only from items.
- **A plain attack**: the original lets you attack with no PP at all. Mystery Maze adds that one thing: a weak, typeless
  "Attack" (Z facing a foe) that costs nothing, so you are never helpless. Out of PP on every move: Struggle.
- **Move shapes in 8 directions.** Poketactica's shapes (`move_shapes.json`: one, line, cone, arc, dash, cross, dia,
  burst, aura, …) are kept; Mystery Maze adds a layer that lays them out in 8 directions:
  - aimed-by-direction shapes get a diagonal form (a line runs diagonally; a cone and an arc turn 45°);
  - reach is counted the 8-direction way (a diagonal step is one step);
  - walls stop everything: melee obeys the corner rule, beams stop at the first wall, lobs can't leave the room.
  This lives in a new file (`mm/shapes8.js`); the 4-direction battles don't change. A test lays every move's shape out
  in all 8 directions and checks it is the 4-direction shape when facing straight.
- **Facing**: 8 facings; a hit from the back arc or the side is more accurate, as now.
- **Height**: floors are flat (walls are raised blocks), so the height bonus is rarely in play; it stays in the rules for
  floors with raised rooms later.
- **Team attacks** (a partner next to the attacker may join) and **lift and throw** stay: throw a partner over a river,
  throw a foe into another.
- **Statuses, weather, living terrain** (water slows non-swimmers, lava burns, as Poketactica's terrain rules) as now.

## Your party

- A leader and up to 3 partners, chosen from your figurines before you enter (a dungeon may allow fewer).
- **Partners act by themselves** with the original's logic: attack if something is in reach, else move; they follow the
  leader, and you can set each one's tactic (Stay close, Go after foes, Keep away, Wait here).
- **Permanent loss.** A partner that faints is gone at once (the permanent-loss plan: tombstone, held item lost,
  memorial). If the leader faints, the next partner becomes the leader; the run ends when nobody is left.
  *(Open question 1.)*
- **Lv 5 dungeons**: everyone enters as a Lv 5 copy of itself (stats and the moves it would know at 5) with an empty bag,
  and levels up inside. It is still the real figurine: if it faints there, it is gone. The EXP earned inside is given to
  the real figurine on the way out.

## Wild Pokémon

- Each floor has a weighted list of species with levels. Count at the start from `enemyDensity`. A new one may appear
  every 36 turns, in a room at least 6 tiles from the leader, up to 10 on the floor (4 on a Monster House floor).
- **What they do** (the original's order): use a move if something is in reach, otherwise move. A Pokémon in a room sees
  the whole room and one tile around it; in a corridor, 2 tiles. One that can't see you wanders between rooms. Some start
  asleep.
- **Monster House**: a room that looks quiet; step in and 8–11 Pokémon drop in, with a pile of items and traps.
- **Recruiting**: when the leader knocks out a wild Pokémon while standing next to it, it may ask to join. The chance
  comes from the species' catch rate plus a bonus for the leader's level (the original's shape: nothing extra below
  Lv 30, more every 10 levels). It joins the party if there is room, otherwise it waits outside. Recruits become real
  figurines only when you get out; a wiped party loses them.

## Items, belly, traps, shops

- **The bag** holds 20. Items lie on floors (and a few inside walls). Version 1 has about 35, in the original's groups:

| Group | Examples | Notes |
|---|---|---|
| Food | Apple, Big Apple | Belly. |
| Berries | Oran, Sitrus, Pecha, Cheri, Rawst, Chesto | The overworld's berries and their icons. |
| Seeds | Blast, Sleep, Stun, Warp, Quick | Eat or throw. **No Reviver Seed**: a knockout is final. |
| Orbs | Escape, Luminous (shows the map), Petrify, Slumber, Trawl | One use, room-wide or floor-wide. **The Escape Orb leaves the dungeon with everything.** |
| Thrown | Gravelrock (arcs), Iron Thorn (flies straight) | |
| Drinks | Elixir, Max Elixir | PP. |
| Held items | Poketactica's own 48 | One per figurine, as now. |
| Stars | Piles of stars | Instead of Poké. Stars are the only currency. |

- **Sticky items** (can't be used until cleaned) by the floor's sticky chance, as the original.
- **Belly** as above. Food matters on long dungeons.
- **Traps** are hidden until stepped on or revealed. Version 1: Mud, Sticky, Grimy, Summon, Pitfall, Warp, Gust, Spin,
  Slumber, Slow, Seal, Poison, Selfdestruct, Explosion, PP-Zero, Chestnut, Spike, Wonder Tile, Pokémon Trap (19 of the
  original's 20; Trip waits until items can be dropped).
- **Shops**: a shopkeeper's room on some floors, 3 × 3 of stock. Pick something up and leave the mat without paying and
  the shopkeeper turns on you, far stronger than anything on the floor. Prices are in stars.
- **Taking things in and out**: what you carry out goes into a Mystery Maze **storage** (200 items). You may take up to
  the bag's 20 in (none into Lv 5 dungeons). *(Open question 2.)*

## Dungeons

- **Named dungeons** (own levels): 8 at launch, opening in order, each with a theme, 5 to 30 floors, its own Pokémon
  list, item list, trap list and floor settings, and a boss floor at the bottom (a fixed room, the original's way).
  Clearing one pays stars (first clear more) and opens the next.
- **Lv 5 dungeons**: 2 at launch (20 and 50 floors), opened by clearing named ones.
- **The endless dungeon**: one descent that never ends; floor settings cycle through all the layouts with rising enemy
  levels, trap and Monster House chances. The record is the deepest floor.
- A floor's theme picks its look and whether its rivers are water or lava.

## What you see

- The Poketactica board: floors as flat ground tiles, walls as low raised blocks (low enough that nothing behind them is
  hidden), water and lava as the terrain renderer draws them, the stairs, items and revealed traps as props.
- The camera follows the leader, zoomed to about 11 × 9 tiles; Q / E turn it as now. A floor is 1,792 tiles, about the
  size of the 32 × 32 boards that already draw at ~58 fps.
- **Darkness and the map**: tiles you haven't seen aren't drawn. On dark floors only your room, or 1–2 tiles in a
  corridor, is lit. A minimap in the corner shows explored ground, stairs, items and the Pokémon you can see.
- Sprites are the same sheets Poketactica uses: Walk, Attack, Hurt and Faint animations, a row per facing (the page already
  picks the row from an angle, so diagonal facings need no new art; stage 3 confirms it on every sheet).

## Controls (all three inputs)

| | Keyboard | Controller | Touch |
|---|---|---|---|
| Step | Arrows / WASD; two arrows together step between them | D-pad (two together), or the stick in 8 directions | Tap a tile: walk there one turn at a time, stopping when anything appears |
| Attack / talk / pick up | Z | A | Tap the foe next to you |
| Moves (1–4) | C, then pick | X, then pick | Moves button |
| Bag | V | Y | Bag button |
| Turn without moving | hold X + direction | hold B + direction | Drag from the leader |
| Pass a turn | Z + X | A + B | Wait button |
| Diagonals only | hold Q | hold L | — |
| Map / menu | Enter | Start | Menu button |

Arrow keys keep Poketactica's meaning (up = up-right on screen), so two arrows together give the straight screen
directions. The exact chords are settled in the page stage with a playtest.

## Replays, spectating, resume, bets (required)

- The whole run is deterministic from its seed: floors, spawns, AI, damage rolls. A **replay** is the recipe:
  `{ v, kind: 'mm', rev, seed, dungeon, party (slimmed figurines), bag taken in, actions }`, each turn one or two
  characters (a direction, attack, move + direction, item + slot, stairs, pass). A 3,000-turn run packs to a few KB.
  Stored with the site's tape store, listed in the replay library, opened at `/poketactica/?replay=<id>`.
- **The viewer** re-runs it: play / pause, speeds, step a turn, jump to a floor (a snapshot is kept at each floor's
  start), clip links `&t=<floor>.<turn>`.
- **Resume**: saved on the device every turn as a snapshot plus the actions so far; a reload returns to the exact turn
  (the frame-exact rule). A test checks the snapshot and a re-run from the seed agree.
- **Live spectating** on the existing channel: each turn the player publishes their **view**: the tiles they have
  explored, what is in sight, the party and the messages. No seed, no hidden traps, nothing behind the fog: a spectator
  sees what the player sees.
- **Bets**: `prog` = the floor; friends bet on "reaches floor N" or "clears the dungeon".
- `MM_RULES_REV` in every recipe; the dungeon tables are versioned with it.

## Saving

A new synced record beside the figurine collection (`ptmm`): dungeons cleared, records, storage. It has its own merge
(union of clears, best records, storage by item id) and its own server action, on the pattern of the figurine
collection. The figurine collection itself only changes through the paths it already has (recruits are added; the
fallen get tombstones). Nothing existing is migrated.

## The engine

`poketactica/js/mm/`, all pure and node-tested:

| File | Job |
|---|---|
| `rng.js` | The original's generator and its `RandInt` / `RandRange`. |
| `gen.js` | The floor generator (the spec's sections 3–6). |
| `dungeons.js` | Our dungeons: floors, settings, Pokémon, item and trap lists. |
| `turn.js` | Ticks, the speed table, actions, upkeep, the wind. |
| `ai.js` | Wild Pokémon and partners. |
| `shapes8.js` | Move shapes in 8 directions, the corner rule, sight. |
| `combat.js` | The bridge to the shared move-resolution function (see the Tower Defense plan's "Shared groundwork"). |
| `items.js`, `traps.js` | Their effects. |
| `view.js` | Fog, sight, what a spectator gets. |
| `replay.js` | Recipes, snapshots. |

The page side is `mmmode.js` (drawing, HUD, minimap, input) and camp screens in `hub.js`.

## Build stages (one PR each, each with its tests)

1. **The generator**: `rng.js`, `gen.js`, the structure tests, the blind second port, the try at a compiled reference.
   A tool prints a floor as text and as a picture for any seed and settings.
2. **Shared groundwork** (if Tower Defense hasn't already landed it) and `shapes8.js`.
3. **Turns and walking**: the tick loop, 8-direction movement and the corner rule, stairs, fog, a party that follows.
4. **Combat and AI**: moves, the plain attack, wild Pokémon, spawning, partners' tactics. Permanent loss hooked in.
5. **Items, belly, traps.**
6. **Monster Houses, shops, recruiting.**
7. **The page**: board, camera, darkness, minimap, HUD, keyboard / controller / touch.
8. **Dungeons**: the 8 named, 2 Lv 5 and the endless one; storage; rewards; the `ptmm` record and its server action.
9. **Resume, replays, spectating, bets, library**; real-server end-to-end test.
10. **A balance pass** with a headless auto-explorer, then the full gate.

## Open questions for the owner

1. **The leader faints**: does the next partner take over (the plan), or does the run end at once as in the original?
2. **Bringing items in**: a storage you fill from runs and take up to 20 from (the plan), or always start empty-handed?
3. **The wind** (1,000 turns on one floor): are you thrown out and lose the bag but keep your figurines (the plan), or is
   it a wipe?
4. **Party size**: 4 as the original (the plan), or 6 as Poketactica's squads?
5. **Today's Dungeon mode** (floor-by-floor tactics battles): keep it beside Mystery Maze (the plan), or retire it once
   Mystery Maze is out?
6. **Launch size**: 8 named dungeons, 2 Lv 5 dungeons and the endless one. More, fewer?
