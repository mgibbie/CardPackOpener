# Poketactica — Mystery Maze (plan)

Owner, 2026-11-23: a single-player sub-mode inside Poketactica "quite close to pokemon mystery dungeon … study the decomp
of blue rescue team to match the level generation". Same isometric view, sprites and battle system as Poketactica; "the
same type of turn based as mystery dungeon where everything only moves when I move". It must have spectating and replays.
**Built and on the camp menu (2026-11-23): stages 1 to 9, and a first balance pass.** The notes on each stage are at the end, under "Build stages".

Research (from the pret/pmd-red decompilation, read only; Red and Blue Rescue Team share this code):
- `Plans/PMD_FLOOR_GENERATION_SPEC.md` — the floor generator, function by function, with its constants.
- `Plans/PMD_SYSTEMS_SPEC.md` — turns, speed, spawning, enemy AI, items, traps, vision, recruiting.

## Owner's decisions

| Question | Answer |
|---|---|
| Name on the camp menu | **Mystery Maze** |
| Movement | **8 directions**, as the original. |
| Who you control | **The leader only.** Partner figurines follow and act on their own. |
| Systems in version 1 | **All four**: bag, items and traps · belly (hunger) · Monster Houses and shops · recruiting. |
| Dungeons | **All three kinds**: named dungeons at your figurines' own levels · special dungeons that reset everyone to Lv 5 with an empty bag · one endless dungeon. |
| Fainting | **A figurine that faints is gone for good** (the permanent-loss plan). If the party is wiped out, everything from the run is lost. |
| The leader faints | **The next partner takes over.** The run ends only when nobody is left. |
| Items | **A storage** (200 items) filled by what you carry out; **take up to 20 in**. Lv 5 dungeons start empty. |
| Turn limit | **None.** No wind; belly is what pushes you on. |
| Party size | **Set per dungeon**, from 1 (solo) to 6. |
| Today's Dungeon mode | **Stays** beside Mystery Maze. |
| Launch size | **8 named + 2 Lv 5 + the endless one.** |

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
- **No turn limit** (owner): the original's wind, which throws you out after 1,000 turns on a floor, is left out. Belly
  is the clock. (Wild Pokémon keep arriving every 36 turns, so standing still is never free.)

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

- A leader and partners chosen from your figurines before you enter. **Each dungeon sets its own party size** (owner),
  from 1 (solo) up to 6; most named dungeons allow 4, as the original.
- **Partners act by themselves** with the original's logic: attack if something is in reach, else move; they follow the
  leader, and you can set each one's tactic (Stay close, Go after foes, Keep away, Wait here).
- **Permanent loss.** A partner that faints is gone at once (the permanent-loss plan: tombstone, held item lost,
  memorial). **If the leader faints, the next partner becomes the leader** (owner); the run ends when nobody is left.
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
  the bag's 20 in (none into Lv 5 dungeons) (owner).

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
| `turn.js` | Ticks, the speed table, actions, upkeep. |
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

**Built 2026-11-23: stage 1, the generator.** `poketactica/js/mm/rng.js` and `gen.js`; `tools/poketactica/mm_floor.mjs`
prints any floor as text and as a PNG. The try at a compiled reference worked: the original's C compiled unmodified and
ran beside the port on 3,960 floors (all 12 layouts), and every tile matched. The test pins 360 of those floors by hash
(`overworld/tests/fixtures/mm_gen_golden.json`), so the port cannot drift. The blind second port agreed as well, bar two
places where the spec's wording had misled it (now corrected there). Notes for the later stages:
- The original's "everything is reachable" check walks floor only, except that an island's moat counts as crossable. So on
  a lava floor the 2 x 2 island (three items and a trap) can only be reached by something that crosses lava; stage 3's
  movement rules must decide who can.
- The stairs and the start can be the same tile (the original allows it).
- The generator returns the shopkeeper's tile and the Monster House's room; it places no Pokémon or items itself, only
  the marks stage 4-6 turn into them.

**Built 2026-11-23: stages 2 and 3** (one PR; the shared groundwork of stage 2 had landed with Tower Defense).
- `mm/shapes8.js`: the 8 directions, the corner rule, lines of fire, sight, and every move shape laid out 8 ways. Facing
  straight a shape is the battle's own; all 882 moves and what they grow into are checked.
- `mm/turn.js`: the run. The original's 24-tick speed table, the leader's actions (step, turn, pass, stairs), swapping
  with a partner, partners that follow by the shortest walk, floors from the original's per-floor seed chain, the fog,
  snapshots and a hash. Tests: `poketactica_mm_shapes_test`, `poketactica_mm_turn_test`.
- **Liquid, decided here:** water is crossed by Water types and fliers, lava by Fire types and fliers, and nobody else
  steps in (the original's rule). This replaces the "water slows, lava burns" line above for Mystery Maze: the generator
  only promises every floor tile can be reached dry-footed, and rooms split by a river are meant to be a barrier. A
  partner that cannot cross waits on its bank. Easy to loosen later if it plays badly.
- Sight in a corridor is the original's square of 2 tiles (1 on a dark floor), walls or not.
- Still to come in stage 4: SP back from walking, wild Pokémon in the tick order, the leader passing to the next partner.

**Built 2026-11-23: stage 4, fighting.**
- The shared move resolution: the battle engine's own `resolve` now takes its geometry as a parameter and is exported as
  `useMoveAt`. Battles pass nothing and behave exactly as before (the same seeded matches give the same hash); Mystery
  Maze passes 8 directions and walls (`mm/combat.js`). So a hit in the maze is a battle's hit: accuracy with Speed and
  facing (8 facings), the damage formula, types, abilities, held items, team attacks, secondary effects.
- The plain Attack: typeless, power 20, the tile in front, no PP or SP.
- Wild Pokémon stand on the floor's marks, from the floor's list (`{ species, level, w }`); 8 in 100 start asleep; one
  more walks in every 36 turns (10 at most, 4 on a Monster House floor, read as the original has it).
- `mm/ai.js`: the original's order and weights. Wild Pokémon chase greedily, remember where they last saw you, and
  patrol room to room. Partners: follow, hunt, away, wait.
- Permanent loss: a fainted figurine leaves the run at once and is listed in `S.fallen` (the page buries it with
  `loseFig` in stage 7); the next partner leads; nobody left loses the run.
- Upkeep, per turn of the one it belongs to: the party heals 1/200 of max HP; walking gives 2% SP; a burn bites every 20
  turns, poison every 10 (1/16 of max HP); sleep and ice cost turns; statuses and stat changes end at the stairs.
- Numbers that are starting values for the balance pass: the Attack's power, the bite sizes, the AI's 20 per move.
- Not yet: lift and throw, weather upkeep, EXP and levelling inside a run (the engine notes EXP; stage 8 pays it),
  confusion's random walking. Test: `poketactica_mm_combat_test`.

**Built 2026-11-23: stages 5 and 6** (one PR).
- `mm/items.js`: 23 items and stars (food, berries, seeds, orbs, thrown, drinks), each with a shop price. Use one or throw
  one, a turn each; a berry thrown at a partner heals it. The bag holds 20; the leader picks up what it walks over.
- The leader's belly: 0.1 an action; at 0, 1 HP an action and no healing.
- `mm/traps.js`: 19 traps, hidden; the leader springs them (a hidden one misfires 15 times in 100), a partner only one
  that shows, wild Pokémon never. The plain Attack shows the trap in front. Damage is a share of max HP.
- Monster Houses: 8 to 11 drop round whoever steps in, once a floor.
- Shops: `take`, `pay`, `putback` (all free); leave the carpet owing and the keeper (Kecleon, Lv 90, double speed)
  turns on you and more arrive every 5 turns. A run starts with `setup.stars` to spend.
- Recruiting: catch rate / 255 x 12% (never under 0.5%) plus the original's level bonus; joins if there is room, else
  waits outside; listed in `S.recruits` for the page to turn into figurines on the way out.
- Left out, for the playability pass to weigh: held items as floor items (they come with the dungeons, stage 8), selling
  to the shop, dropping items, partners and wild Pokémon picking items up, items buried in walls, pitfalls for partners.
- Tests: `poketactica_mm_items_test` (every item and trap used and observed), `poketactica_mm_house_test`.

**Built 2026-11-23: stage 7, the page** (`poketactica/js/mmmode.js`; hooks in `main.js`). Not on the camp menu yet: it
opens through `window.__poketactica.startMm(dungeonId, figurines)` until the dungeons, resume, replays and spectating are
in (stages 8 and 9), as Tower Defense did.
- The board is drawn from what has been explored: floor, walls as blocks one level up, water and lava; rebuilt when new
  ground comes into view. The stairs, items and shown traps are coloured tiles for now (gold, green, purple; a shop's
  goods orange): proper props are for the playability pass.
- A bar at the bottom (floor, belly, purse, bag, SP, the party's HP, the last three messages, and Attack / Moves / Bag /
  Wait / Menu for touch); a minimap top left; a menu hides the bar while it is open.
- Controls as built: arrows step, two together step diagonally (a 45 ms wait for the second key); walking into a foe
  turns and attacks; into a wall only turns. Z attacks, or takes the stairs (asked first), or takes a shop's item. C the
  moves, then aim with the arrows (the move's reach and what it would cover are lit). V the bag. X then a direction turns
  on the spot. Enter: wait, pay, tactics, give up. Touch: tap next to you to step or strike, further off to walk there
  (it stops when a foe appears or you are hurt), yourself for the menu.
- Differences from the plan's control table, for the playability pass: "pass" is in the menu and on a button, not Z + X;
  there is no hold-Q diagonal lock (Q / E still turn the board); "turn" is X-then-direction, not hold-X.
- A figurine that falls is removed from the collection the moment it happens (`loseFig`), as in battles.
- One starter dungeon exists for now: Whisper Woods (5 floors). `mm/dungeons.js`.
- The result screen says what happened; nothing is paid or carried out yet (stage 8).
- Test: `poketactica_mm_page_test` (42 checks: keyboard, controller, touch on a phone).

**Built 2026-11-23: stage 8, the dungeons and what a run pays.** Still off the camp menu (the screens are reached through
`hub.mmDungeons()`): the home entry comes with resume, replays and spectating in stage 9.
- `mm/dungeons.js`: the launch list. Named: Whisper Woods (5 floors), Pebble Hollow (8), Tidepool Isles (10), Ember Rift
  (12, lava), Frostspire (14), Sunken Ruins (16, dark), Gale Tower (20), Starfall Spire (30). Lv 5: Sprout Trial (20
  floors, 3 enter), Ancients' Descent (50 floors, alone). Endless: The Abyss. Each opens when the one before it is
  cleared; wild levels run from 3 to a Lv 92 boss.
- **Bosses without fixed rooms:** the last floor of a named or Lv 5 dungeon has its boss standing on the stairs, and the
  stairs stay shut while it stands. (The original's hand-made boss rooms were not ported.)
- **The endless dungeon** makes floor n from n alone (`endlessFloor`), so any floor can be re-made for a replay.
- **EXP inside a run:** a knockout's EXP goes to everyone in the party in full (the original's rule), and they level up
  on the spot. A Lv 5 dungeon's EXP goes to the real figurine at its own level on the way out.
- **What a run pays** (`mm/rewards.js`): cleared or escaped keeps the purse, the bag (into the storage) and the recruits
  (new figurines); a clear also pays the dungeon's prize (150 to 2,500 stars the first time, less after). Gave up or the
  party fell: those are lost. The living always keep their EXP and move XP.
- **Stars carried in are at risk.** The pack screen lets you carry 0, 100, 300, 1,000 or all your stars for the shops;
  they leave your wallet at the door and come back only with a clear or an escape. The default is 0.
- **The record is inside the figurine collection** (`mm: { clear, best, store }`), not a separate synced record as this
  plan first said: one sync path, the same cleaning on the server, and the storage joins across devices by item as goods
  do (an item used on one device stays used). The storage holds 200; what does not fit is left behind and said so.
- Camp screens: the dungeon list (locked ones say what opens them), the party (the first picked leads), the pack (items
  from storage, stars to carry), the storage.
- Tests: `poketactica_mm_dungeons_test` (41: all 185 floors plus 60 endless ones are made; bosses; Lv 5; levelling;
  every way a run can end, applied to a collection; merging two devices), and the page test's camp section.
- Not yet: held items as floor items; Lv 5 dungeons do not yet stop you bringing a held item.

**Built 2026-11-23: stage 9, resume, replays, spectating, bets; ON THE CAMP MENU.**
- `mm/replay.js`: a run is its recipe `{ seed, dungeon id, party, bag, stars, acts }`. Actions are packed (a step is one
  character): 703 actions of a real run are under 6 KB. Re-run, it is the same run to the hash.
- **Resume:** the recipe is saved on the device after every action; a reload offers "Resume Mystery Maze" first on the
  camp menu and lands on the same state. While a run is saved no other dungeon can be entered (what it carries is out of
  the storage and the wallet).
- **Replays:** a finished run is uploaded like any other; the viewer plays it at 5 actions a second (1× to 8×), jumps to
  where a floor began, and opens at a floor from a link (`&t=<floor>`).
- **Live spectating:** a friend is sent only the player's view (explored ground, Pokémon in sight, the bar, the last
  messages), never the seed. The same drawing code draws it.
- **Bets:** `prog` is the floor; the bet is on clearing the dungeon (the endless one: beating the record).
- The camp menu has "Mystery Maze" (after Tower Defense); How to play has a Mystery Maze page.
- Tests: `poketactica_mm_replay_test` (18), `poketactica_mm_live_test` (28, two browsers against the real server),
  `poketactica_mm_page_test` (77).

**A first balance pass (stage 10 begun), because the mode is deadly and now public.** `tools/poketactica/mm_explore.mjs`
plays a dungeon many times with a simple leader (it eats, heals, rests when hurt, fights what is next to it, walks to the
stairs). What it found, and what was changed:
- As first written, three Lv 5 starters cleared Whisper Woods 2 times in 40 and were wiped out 38 times, nearly always by
  the boss. Now: 39 or 40 of 40, about 0.3 figurines lost a run, no wipe-outs. A test pins it.
- **Wild Pokémon are weaker than a figurine of their level**: 60% of the HP and 60% of the Attack and Sp. Atk (`WILD_HP`,
  `WILD_ATK`). **A boss keeps all its HP but hits at 60%** (`BOSS_ATK`), and stands 1 level over its dungeon's top.
- EXP inside a run is doubled (`MM_EXP_RATE` 2).
- The level bands were lowered: 2-4 (boss 5), 6-11 (12), 11-18 (19), 17-26 (27), 25-34 (35), 33-44 (45), 43-56 (57), 55-78
  (79); the Lv 5 dungeons 3-22 (23) and 3-46 (47).
- Each dungeon's screen shows its wild levels, its boss and a **suggested party level** (2 over the boss; the first one
  Lv 5), and the party screen flags anyone under it.
- At the suggested level the explorer's three unevolved starters lose about 0.3 (Pebble Hollow), 0.6 (Tidepool Isles) and
  0.9 (Ember Rift) figurines a run. **Frostspire and everything after it are NOT balanced yet**: the explorer runs out of
  food on long dungeons and loses most runs there. They are locked behind the first four clears.
- A bug the explorer found: a recruit that had come to lead and then fainted left the run leaderless (fixed, with a
  regression test).
- Still to do in stage 10: the five later dungeons and the endless one; food on long floors; the explorer itself (it uses
  no seeds, orbs or tactics, and takes three, not four).

**Stage 10, second pass (2026-11-23): the later dungeons.** The explorer now takes the party a player would have (the
three starters and a bird, evolved as far as their level allows, as many as the dungeon lets in), plays every dungeon
with `--dungeon=all --level=suggested`, and says what knocked each lost figurine out.
- What it showed: in the long dungeons the losses were hunger, Monster Houses and bosses; in Starfall Spire and the Lv 5
  dungeons, plain attrition.
- Changed: more food on every floor (apples 14 to 22, big apples 2 to 4, Oran 14 to 18, of the same total); Monster
  Houses rarer (5% at a dungeon's end, not 8); fewer wild Pokémon in Frostspire, Sunken Ruins, Gale Tower and Starfall
  Spire; Starfall Spire's band 55-68 (boss 69); Sprout Trial 2-12 (boss 13); Ancients' Descent 2-20 (boss 21).
- Figurines lost a run, at the suggested level, 10 runs each:

| Dungeon | Suggested | Cleared | Lost a run | Mostly lost to |
|---|---|---|---|---|
| Whisper Woods | Lv 5 | 10 of 10 | 0.1 | the boss |
| Pebble Hollow | Lv 14 | 10 of 10 | 0.2 | a Monster House |
| Tidepool Isles | Lv 21 | 10 of 10 | 0.3 | hunger |
| Ember Rift | Lv 29 | 10 of 10 | 0.4 | the boss |
| Frostspire | Lv 37 | 7 of 10 | 1.3 | hunger, a Monster House |
| Sunken Ruins | Lv 47 | 10 of 10 | 1.0 | wild Pokémon, the boss |
| Gale Tower | Lv 59 | 10 of 10 | 1.0 | wild Pokémon, a Monster House |
| Starfall Spire | Lv 71 | 4 of 10 | 2.9 | wild Pokémon, hunger |
| Sprout Trial | (Lv 5) | 6 of 10 | 1.8 | a Monster House, wild Pokémon |
| Ancients' Descent | (Lv 5, alone) | 0 of 10 | all | wild Pokémon |

- **Starfall Spire, both Lv 5 dungeons and The Abyss are marked "very hard"** on the dungeon list, with a line saying to
  expect losses. They are the end of the mode, behind three to seven clears.
- The first two dungeons are pinned by tests (24 and 12 explorer runs).
- What the explorer does not do, so a person should beat these numbers: throw seeds, use orbs, set tactics, flee, or
  ration its resting (it rests whenever anyone is under three quarters, which is where most of the hunger comes from).
- Still open: Frostspire's food; whether a solo 50-floor Lv 5 dungeon can be fair at all with permanent loss; the endless
  dungeon has not been measured.

**Touch controls, 2026-11-23 (owner: "a control scheme similar to what we are navigating the overworld with except instead
of a 4 directional D pad we want a joystick to go 8 directions").** On a touch screen the maze now has the overworld's pad:
- **A joystick, bottom left.** Push it any of 8 ways and the leader steps that way *on screen* (up is up the screen, which
  on the corner-on board is a diagonal of the grid). Held, it keeps stepping (first repeat after 0.26 s, then every
  0.15 s); sliding the thumb round changes the way without lifting; a nudge inside the centre does nothing. It follows
  the camera when the board is turned.
- **A and B, bottom right.** A is Z (attack, the stairs, a shop's item; OK in a menu; USE while aiming) and says which.
  B backs out of a menu or an aim; held, the stick only turns the leader.
- **MENU, MOVES, BAG, WAIT, top right**, as the overworld's MENU / PARTY / BAG.
- In a menu the stick moves the choice; while aiming it moves the aim.
- The bar moves to the top with no buttons of its own; the minimap and the camera's turn buttons hang under it.
- Tapping the board still walks there. Keyboard and controller are unchanged.
- The controller's left stick is the same 8-way stick (owner, 2026-11-23): pushed past half way it steps the way it
  points on screen and repeats while held; a light touch does nothing; the d-pad stays the four arrows; X, then the
  stick, turns on the spot.

**The owner's answers, 2026-11-23** (asked after the first balance passes): keep wild Pokémon at 60%; keep tuning the
"very hard" dungeons until a careful party at the suggested level usually comes back (shorten Ancients' Descent if 50
floors alone cannot be made fair); stars carried in stay at risk; water and lava stay closed to all but their own kind
and fliers. What is owed, in this order: the playability pass, the moves and abilities sweep, the rest of the balance.

**Playability pass, batch 1, 2026-11-23.**
- The first run on a device is coached: five steps in the bar (move, fight, items, rest and belly, the stairs), each
  ticked off by doing it, in a phone's words on a phone, with Skip. It signs off with the permanent-loss rule.
- The board says what lies on it: a gold arrow and "stairs", a green diamond on items, a star on star piles, a shop's
  price, a purple cross on shown traps, BOSS over a boss. (Labels drawn over the tiles, not 3D props.)
- A wide screen starts further out (about 12 tiles across) so the bar no longer hides the party; a phone stays close.
- Tower Defense: the hint under the cursor names a tower (level, SP, how often each move fires) or an enemy (level, HP,
  status); a phone starts a little closer; the bar no longer runs off a phone's right edge.
- Still owed in this pass: a Tower Defense coach, fewest-presses review, a person's playtest on a real phone.

## After both modes are built (owner, 2026-11-23)

Two passes follow the builds, each its own piece of work:

1. **The moves and abilities sweep.** "Make sure that they all function in all modes as intended." Every one of the 882
   moves and 318 abilities (and the 48 held items) is checked in every mode: Story / Dungeon / Versus battles, Tower
   Defense and Mystery Maze.
   - A generated table, one row per move / ability / held item and one column per mode, each cell one of: *works as in a
     battle*, *works, adapted* (with the rule), *no effect here* (and the player is told), *not decided*.
   - A test per cell that isn't "no effect": the move is USED in that mode and its effect observed (damage, the status,
     the push, the buff, the timed version). The sweep is done when no cell says "not decided" and every test passes.
   - The table is published as a wiki page so the owner can read and overrule any row.
   - Anything found broken in the existing battles is fixed with a regression test, as always.
2. **The UI / playability pass.** "Make each new game mode really easy to play." For Tower Defense and Mystery Maze:
   - a first-run coach for each (as the battle coach), and How to play pages;
   - every action reachable in the fewest presses on keyboard, controller and touch; a phone played one-handed;
   - readable at a glance: reach, cooldowns, SP / PP, danger, belly, what an item does before you use it;
   - a watched playtest of each mode start to finish (screens recorded, every stumble listed and fixed), on a desktop
     and a phone, before it is called done;
   - the speed check on a slowed phone (`tools/poketactica/perf_big.mjs`'s method) for both modes.

## Open questions

None: every question asked on 2026-11-23 is answered above. Today's Dungeon mode stays as it is.
