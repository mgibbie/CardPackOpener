# PMD Red Rescue Team: floor generation specification

Source: pret/pmd-red decompilation, read-only. All line numbers are for `src/dungeon_generation.c` unless another file is named.
Files read: `src/dungeon_generation.c` (all C; the 700-line assembly copy of one function at 4866-5574 was skipped, see section 9), `include/dungeon_generation.h`, `include/structs/map.h`, `include/structs/str_dungeon.h` (FloorProperties and the fields the generator touches), `src/dungeon_random.c`, `src/dungeon_map_access.c` (GetTile), `src/run_dungeon.c` (seeding, GetFloorType), `src/dungeon_config.c` (constants), and a skim of `src/dungeon_generation_fixed.c`.

Conventions used below:

- `RandInt(n)` = `DungeonRandInt(n)`, uniform integer in `[0, n-1]`.
- `RandRange(a, b)` = `DungeonRandRange(a, b)`, integer in `[a, b-1]` (upper bound EXCLUSIVE). See section 7 for the edge cases, which matter for RNG parity.
- Every `RandInt` call consumes exactly one RNG step, even `RandInt(0)` and `RandInt(1)`. `RandRange(a, a)` consumes none.
- All divisions are C integer divisions (truncate toward zero).
- Grid cell rectangles are `start` inclusive, `end` exclusive.

---

## 1. The floor grid and tile data

### 1.1 Dimensions

| Constant | Value | Where |
|---|---|---|
| `DUNGEON_MAX_SIZE_X` | 56 | `include/structs/str_dungeon.h:16` |
| `DUNGEON_MAX_SIZE_Y` | 32 | `include/structs/str_dungeon.h:17` |
| `DUNGEON_MAX_NUM_TILES` | 56 * 32 = 1792 | `str_dungeon.h:18` |
| `DUNGEON_MAX_TRAPS` | 64 | `str_dungeon.h:22` |
| `MAX_ROOM_COUNT` | 32 | `include/structs/map.h:7` |
| `GRID_CELL_LEN` (max grid cells per axis in the work array) | 15 | line 66 |
| `CORRIDOR_ROOM` (room index of "not a room") | 0xFF | `map.h:9` |
| `ROOM_0xFE` (room index of a hallway anchor before finalising) | 0xFE | `map.h:8` |
| `DEFAULT_MAX_POSITION` | 9999 | `str_dungeon.h:233` |

Tiles are stored `tiles[y][x]` (`str_dungeon.h:448`). Every generator loop that sweeps the map does `for x in 0..55 { for y in 0..31 }` (x outer, y inner) unless stated otherwise. Sweep order matters for `FinalizeJunctions` and for the order of entries in the valid-spawn lists.

`GetTile(x, y)` out of bounds returns a constant tile with `terrainFlags = 0` (a plain wall, not impassable), `room = 0xFF`, `unk8 = 1` (`src/dungeon_map_access.c:30-48`). `GetTileMut` out of bounds returns a scratch copy of that tile, so out-of-bounds writes are silently dropped (`dungeon_map_access.c:50-59`).

### 1.2 Tile struct (`include/structs/map.h:65-77`)

| Field | Type | Use by the generator |
|---|---|---|
| `terrainFlags` | u16 | terrain type in bits 0-1 plus flags (table below) |
| `spawnOrVisibilityFlags.spawn` | u16 | spawn flags (table below); the same storage is reused as visibility flags during play |
| `unk8` | u8 | reset to 0 |
| `room` | u8 | room index 0..N, 0xFE anchor, 0xFF none |
| `walkableNeighborFlags[4]` | u8 x4 | reset to 0 (computed later, outside this file) |
| `unkE` | u8 | reset to 0; fixed rooms store the fixed-tile action id here |
| `monster`, `object` | pointers | reset to NULL |

`ResetTile` (3971-3984) sets `terrainFlags = 0`, `spawn = 0`, `room = -1` (0xFF), everything else 0/NULL.

### 1.3 Terrain flags (`map.h:11-32`)

| Name | Bit | Set by the generator at |
|---|---|---|
| `TERRAIN_TYPE_WALL` | value 0 of bits 0-1 | default after reset |
| `TERRAIN_TYPE_NORMAL` | 0x1 | rooms, hallways (open floor) |
| `TERRAIN_TYPE_SECONDARY` | 0x2 | water or lava |
| (both bits, value 3) | 0x3 | only at the very end on water tilesets (`sub_804FC74`, 3942-3953) and in fixed rooms |
| `TERRAIN_TYPE_CORNER_CUTTABLE` | 0x4 | island moat tiles (3784-3797); cleared on every tile at the end (430) |
| `TERRAIN_TYPE_NATURAL_JUNCTION` | 0x8 | `FinalizeJunctions` (2985) and `sub_804B534` (422) |
| `TERRAIN_TYPE_IMPASSABLE_WALL` | 0x10 | map border in `ResetFloor` (4018), fixed rooms |
| `TERRAIN_TYPE_SHOP` | 0x20 | `GenerateKecleonShop` (3196) |
| `TERRAIN_TYPE_IN_MONSTER_HOUSE` | 0x40 | `GenerateMonsterHouse` (3350), rescue floors (4135) |
| `TERRAIN_TYPE_UNK_7` | 0x80 | one half of a divider room (3737, 3764) |
| `TERRAIN_TYPE_UNBREAKABLE` | 0x100 | fixed room tiles only (5883) |
| `TERRAIN_TYPE_STAIRS` | 0x200 | `ResolveInvalidSpawns` (3930) |
| `TERRAIN_TYPE_UNK_x800`, `_x1000` | 0x800, 0x1000 | fixed room tile actions only |
| `TERRAIN_TYPE_UNREACHABLE_FROM_STAIRS` | 0x8000 | `StairsAlwaysReachable` only when called with `markUnreachable = TRUE` (not during generation) |

Helpers (`map.h:98-122`): `SetTerrainType(tile, t)` clears bits 0-1 then ORs `t`; `SetTerrainNormal/Secondary/Wall`; `GetTerrainType` = `terrainFlags & 3`. `SetTerrainWall` does NOT change `tile.room` or any other flag.

### 1.4 Spawn flags (`map.h:43-53`)

| Name | Bit | Meaning |
|---|---|---|
| `SPAWN_FLAG_STAIRS` | 0x1 | stairs here |
| `SPAWN_FLAG_ITEM` | 0x2 | item here |
| `SPAWN_FLAG_TRAP` | 0x4 | trap here |
| `SPAWN_FLAG_MONSTER` | 0x8 | enemy here |
| `SPAWN_FLAG_SPECIAL_TILE` | 0x10 | every tile of a Kecleon shop room, and the 4 island tiles; blocks stairs |
| `SPAWN_FLAG_UNK5` | 0x20 | every tile of a room given a secondary structure, except plus/dot rooms (`SetSpawnFlag5`, 3662) |
| `SPAWN_FLAG_UNK6` | 0x40 | the island's trap tile (3802; the decomp comment says "Warp Tile ?") |
| `SPAWN_FLAG_UNK7` | 0x80 | never set in this file |

### 1.5 Generator output outside the tile grid

`gDungeon->playerSpawn`, `stairsSpawn` (both `-1,-1` when unset), `forceMonsterHouse`, `monsterHouseRoom` (0xFF = none), `kecleonShopPos` (inclusive min/max), `naturalJunctionList[32][32]` + counts (`sub_804EB30`, 3052-3074), `unk3A0A` (1 if a shop exists), `unk3A16` (current inner attempt number).

### 1.6 Work grid (`struct GridCell`, 36-64)

`start`, `end` (tile rectangle), and booleans: `isInvalid`, `hasSecondaryStructure`, `isRoom`, `isConnected`, `isKecleonShop`, `isMonsterHouse`, `isMazeRoom`, `hasBeenMerged`, `isMerged`, `connectedToTop/Bottom/Left/Right`, `shouldConnectToTop/Bottom/Left/Right`, `flagImperfect`, `flagSecondaryStructure`, plus `unk13`, `unk15`, `unk27`, `unk30`, `unk31`. The grid is `grid[x][y]`, 15x15, a local variable of each layout function (so it is rebuilt each attempt).

---

## 2. Inputs

### 2.1 `FloorProperties` (`include/structs/str_dungeon.h:119-148`, size 0x1C)

| Offset | Field | Type | Read by generator? How |
|---|---|---|---|
| 0x00 | `layout` | u8 | Yes. `layout % 16` selects the generator (260); raw `layout != 8` picks the grid-size range (227). |
| 0x01 | `roomDensity` | s8 | Yes, `AssignRooms` (1485-1490). Negative = exactly `-roomDensity` rooms. Non-negative = `roomDensity + RandInt(3)` rooms. |
| 0x02 | `tileset` | u8 | Indirect: `gDungeon->tileset` decides water (vs lava) via `gDungeonWaterType` (170) and, in fixed rooms, `tileset >= 64` (5935). |
| 0x03 | `bgMusic` | u8 | No. |
| 0x04 | `weather` | u8 | No. |
| 0x05 | `floorConnectivity` | u8 | Yes. Number of steps of the connection random walk (1776). |
| 0x06 | `enemyDensity` | u8 | Yes (4418). `> 0`: `RandRange(d/2, d)`, minimum 1. Else `abs(d)`. Because the field is unsigned the "negative = exact" branch only fires for 0 (decomp comment 4420-4422). |
| 0x07 | `kecleonShopChance` | u8 | Yes, percent (173, 3100-3103). |
| 0x08 | `monsterHouseChance` | u8 | Yes, percent (174, 3261). |
| 0x09 | `mazeRoomChance` | u8 | Read, but maze rooms can never be made (3385). Still consumes one RNG call when non-zero. |
| 0x0A | `itemStickyChance` | u8 | No (not in this file). |
| 0x0B | `allowDeadEnds` | bool8 | Yes (1869). FALSE runs the dead-end removal pass. |
| 0x0C | `secondaryStructuresBudget` | u8 | Yes (188). Max number of secondary structures. Forced to 0 on every inner attempt after the first (201-203). |
| 0x0D | `roomFlags` | u8 | Yes. `0x1` = `ROOM_FLAG_ALLOW_SECONDARY_TERRAIN` (rivers/lakes, 4618). `0x4` = `ROOM_FLAG_ALLOW_IMPERFECTIONS` (1643). |
| 0x0E | `unkE` | bool8 | No ("Unreferenced flag"). |
| 0x0F | `itemDensity` | u8 | Yes (4178). |
| 0x10 | `trapDensity` | u8 | Yes (4335). |
| 0x11 | `floorNumber` | u8 | No. |
| 0x12 | `fixedRoomNumber` | u8 | Indirect: copied to `gDungeon->fixedRoomNumber` in `run_dungeon.c:308`; non-zero takes the fixed-room path (213). |
| 0x13 | `numExtraHallways` | u8 | Yes (1200). |
| 0x14 | `buriedItemDensity` | u8 | Yes (4219). |
| 0x15 | `standaloneLakeDensity` | u8 | Yes (4780). Number of standalone lakes. |
| 0x16 | `visibilityRange` | u8 | No. |
| 0x17 | `moneyUpperBound` | u8 | No. |
| 0x18 | `kecleonShopLayout` | u8 | Yes, index into `sKecleonShopItemSpawnChances[16][3][3]` (6097). |
| 0x19 | `itemlessMonsterHouseChance` | u8 | Yes, percent (369). Comment says always 0 in the data. |
| 0x1A, 0x1B | `unk1A`, `unk1B` | u8 | No. |

There is no hidden-stairs field and no hidden-stairs code in Red (the comment at 4064 mentions it only for "later gens").

### 2.2 Other inputs

| Input | Use |
|---|---|
| `GetFloorType()` (`run_dungeon.c:688-696`) | `FLOOR_TYPE_RESCUE` (2) when on a rescue mission and this is the target floor; `FLOOR_TYPE_FIXED` (1) when `fixedRoomNumber` is a floor-wide fixed room; else `FLOOR_TYPE_NORMAL` (0). |
| `gDungeon->unk644.unk44` (s16) | Non-zero blocks monster houses (3265) and adds one enemy (4472). Reset to 0 per floor in `run_dungeon.c:300`; meaning not determined. |
| `gDungeon->unk644.canChangeLeader` | Monster house traps are only placed when TRUE (4290). |
| `gMonsterHouseMaxItemsTraps` = 7, `gMonsterHouseMaxMons` = 12 | `src/dungeon_config.c:20, 22` |
| `GENERATION_CONSTANT_MERGE_ROOMS_CHANCE` = 5 | `include/dungeon_generation.h:8` |
| `GENERATION_CONSTANT_NO_IMPERFECTIONS_CHANCE` = 60 | `dungeon_generation.h:9` |
| `GENERATION_CONSTANT_SECONDARY_STRUCTURE_FLAG_CHANCE` = 80 | `dungeon_generation.h:10` |
| `sKecleonShopItemSpawnChances[layout][y][x]` | `src/dungeon_config.c:612`. Entries 0-13 seen are all `{57,57,57},{100,57,100},{57,57,57}` (14 and 15 not printed, see section 9). |

---

## 3. Top-level function: `GenerateFloor` (159-420)

### 3.1 Setup (164-188)

```
open "fixedmap" file
sHasKecleonShop = sHasMonsterHouse = sHasMaze = FALSE
gUnknown_202F1A8 = (gDungeonWaterType[tileset] == WATER)   // "is water tileset"
sStairsRoomIndex = 0xFF; sFloorSize = 0 (LARGE)
sKecleonShopChance = props.kecleonShopChance
sMonsterHouseChance = props.monsterHouseChance
sSecondSpawn = TRUE
sKecleonShopPosition = {-1,-1,-1,-1}
ResetFloor()
gDungeon.unk644.enemyDensity = abs(props.enemyDensity)
unk3A09 = unk3A0A = 0
sSecondaryStructuresBudget = props.secondaryStructuresBudget
secondaryGen = FALSE          // local; NEVER reset inside the loops
```

`ResetFloor` (4000-4040): reset every tile; mark `IMPASSABLE_WALL` on any tile with an out-of-bounds neighbour, which is exactly the outermost ring (`x == 0 || x == 55 || y == 0 || y == 31`); `stairsSpawn = (-1,-1)`; reset the 8x8 fixed-room tile buffer; `numItems = 0`; clear trap types.

### 3.2 Loops

```
for spawnAttempts in 0..9:                                   // outer, line 190
    playerSpawn = stairsSpawn = (-1,-1)
    for genAttempts in 0..9:                                 // inner, line 199
        gDungeon.unk3A16 = genAttempts
        if genAttempts > 0: sSecondaryStructuresBudget = 0
        sInvalidGeneration = FALSE
        sKecleonShopMiddlePos = (-1,-1)
        ResetFloor()
        playerSpawn = (-1,-1); forceMonsterHouse = FALSE
        if gDungeon.fixedRoomNumber != 0:
            if ProcessFixedRoom(fixedRoomNumber, props): break   // floor-wide fixed room: done
        else:
            choose grid size (3.3); forceMonsterHouse = FALSE; monsterHouseRoom = 0xFF
            sFloorLayout = layout
            dispatch on layout % 16 (3.4)
        ResetInnerBoundaryTileRows()        // 6110: ResetTile every tile of rows y=1 and y=30;
                                            // re-mark x=0 and x=55 of those rows impassable
        EnsureImpassableTilesAreWalls()     // 3958: any IMPASSABLE_WALL tile -> terrain wall
        if !sInvalidGeneration:             // always true; nothing ever sets it
            roomTiles = count of tiles with (terrainFlags & 3) == NORMAL and room <= 240
            numRooms  = count of distinct room values < 64 among those tiles
            if roomTiles >= 30 and numRooms >= 2: break      // line 349
    if genAttempts == 10:                   // all 10 failed
        sKecleonShopMiddlePos = (-1,-1)
        GenerateOneRoomMonsterHouseFloor()  // NOTE: no ResetFloor before this
        forceMonsterHouse = TRUE
    FinalizeJunctions()
    if secondaryGen: GenerateSecondaryTerrainFormations(0x1, props)
    isEmptyMonsterHouse = RandInt(100) < props.itemlessMonsterHouseChance
    SpawnNonEnemies(props, isEmptyMonsterHouse)
    SpawnEnemies(props, isEmptyMonsterHouse)
    ResolveInvalidSpawns()
    if playerSpawn.x != -1 and playerSpawn.y != -1:
        if GetFloorType() == FLOOR_TYPE_FIXED: break
        if stairsSpawn.x != -1 and stairsSpawn.y != -1
           and StairsAlwaysReachable(stairsSpawn.x, stairsSpawn.y, FALSE): break
if spawnAttempts == 10:                     // final bailout, 387-400
    sKecleonShopMiddlePos = (-1,-1)
    ResetFloor(); GenerateOneRoomMonsterHouseFloor(); forceMonsterHouse = TRUE
    FinalizeJunctions()
    SpawnNonEnemies(props, FALSE); SpawnEnemies(props, FALSE); ResolveInvalidSpawns()
    // no secondary terrain, no reachability check
if sKecleonShopMiddlePos.x >= 0 and .y >= 0:
    sub_806C330(x, y, MONSTER_KECLEON, 0)   // spawn the shopkeeper (outside this file)
if sKecleonShopPosition.minX >= 0: sub_8051654(props); unk3A0A = 1   else unk3A0A = 0
sub_804B534(0, 0, 56, 32)                   // corridor junction pass, 3.6
if gUnknown_202F1A8: sub_804FC74()          // water tileset: SECONDARY -> NORMAL|SECONDARY
close file
```

What makes an attempt invalid:

1. Inner loop: fewer than 30 open room tiles or fewer than 2 distinct rooms (line 349; the comment at 150 and 319 says 20, the code says 30).
2. Outer loop: no player spawn, no stairs spawn, or `StairsAlwaysReachable` false.

The header comment's "6x4 cap, 4x4 default" (144-146) matches the code. The comment at 248 says "at least 7 tiles per grid cell" while the code tests `< 8`.

### 3.3 Grid size (220-255)

```
attempts = 32
loop:
    if layout != 8:  gridSizeX = RandRange(2, 9)   // 2..8
                     gridSizeY = RandRange(2, 8)   // 2..7
    else:            gridSizeX = RandRange(2, 5)   // 2..4
                     gridSizeY = RandRange(2, 4)   // 2..3
    if gridSizeX <= 6 and gridSizeY <= 4: break
    if --attempts == 0: gridSizeX = 4; gridSizeY = 4; break
if 56 / gridSizeX < 8: gridSizeX = 1     // cannot trigger for X <= 6 (56/6 = 9)
if 32 / gridSizeY < 8: gridSizeY = 1     // cannot trigger for Y <= 4 (32/4 = 8)
```

These RNG calls happen for every non-fixed layout, including the ones that ignore the result.

### 3.4 Layout dispatch (260-311)

`enum FloorLayout` (`include/dungeon_generation.h:12-30`):

| Value | Name | Call | `secondaryGen = TRUE`? | `forceMonsterHouse`? |
|---|---|---|---|---|
| 0 | `LAYOUT_LARGE` | `GenerateStandardFloor(gridSizeX, gridSizeY)` | yes | no |
| 1 | `LAYOUT_SMALL` | `gridSizeX = 4; gridSizeY = RandInt(2) + 2; sFloorSize = FLOOR_SIZE_SMALL (1)`; standard | yes | no |
| 2 | `LAYOUT_ONE_ROOM_MONSTER_HOUSE` | `GenerateOneRoomMonsterHouseFloor()` | no | yes |
| 3 | `LAYOUT_OUTER_RING` | `GenerateOuterRingFloor` | yes | no |
| 4 | `LAYOUT_CROSSROADS` | `GenerateCrossroadsFloor` | yes | no |
| 5 | `LAYOUT_TWO_ROOMS_WITH_MONSTER_HOUSE` | `GenerateTwoRoomsWithMonsterHouseFloor()` | no | yes |
| 6 | `LAYOUT_LINE` | `GenerateLineFloor` | yes | no |
| 7 | `LAYOUT_CROSS` | `GenerateCrossFloor` | no | no |
| 8 | `LAYOUT_LARGE_0x8` | standard, with the smaller grid range of 3.3 | yes | no |
| 9 | `LAYOUT_BEETLE` | `GenerateBeetleFloor` | no | no |
| 10 | `LAYOUT_OUTER_ROOMS` | `GenerateOuterRoomsFloor(gridSizeX, gridSizeY)` | yes | no |
| 11 | `LAYOUT_MEDIUM` | `gridSizeX = 4; gridSizeY = RandInt(2) + 2; sFloorSize = FLOOR_SIZE_MEDIUM (2)`; standard | yes | no |
| 12-15 | `LAYOUT_UNUSED_0xC..0xF` | `default:` = same as LARGE | yes | no |

`sFloorSize` effect (`InitDungeonGrid`, 1427-1435): SMALL marks grid columns `x >= gridSizeX / 2` invalid; MEDIUM marks columns `x >= (gridSizeX * 3) / 4` invalid. With `gridSizeX = 4` that leaves 2 or 3 usable columns.

### 3.5 Things that carry over between attempts (as written)

- `secondaryGen` is never reset, so a one-room fallback after a standard layout still gets rivers and lakes.
- `sHasKecleonShop` and `sHasMonsterHouse` are only cleared at the top of `GenerateFloor`. A monster house made in a failed attempt blocks the shop in later attempts (3100) and vice versa (3263).
- `sKecleonShopPosition` is only reset at the top. If an earlier attempt made a shop and the accepted attempt did not, `sub_8051654` still runs on the stale rectangle (406).
- The fallback at `genAttempts == 10` does not call `ResetFloor`; flags from the tenth attempt outside the new room rectangle (and non-terrain flags inside it) remain.
- A `LAYOUT_ONE_ROOM_MONSTER_HOUSE` floor has one room, so the `numRooms >= 2` test fails ten times and the floor is produced by the fallback; the ten failed attempts still consume RNG.

### 3.6 `sub_804B534` (422-448), final corridor junction pass

For every tile: clear `CORNER_CUTTABLE`. If `room == 0xFF` and terrain is NORMAL, count open (terrain exactly NORMAL) cardinal neighbours:

```
x > 0   and left is NORMAL   -> count++
y > 0   and up is NORMAL     -> count++
x < 54  and right is NORMAL  -> count++
x < 30  and down is NORMAL   -> count++     // BUG in original: tests x against DUNGEON_MAX_SIZE_Y - 2
if count > 2: set NATURAL_JUNCTION
```

The down neighbour is therefore ignored for every corridor tile with `x >= 30`.

---

## 4. Layout generators

### 4.1 Standard (`GenerateStandardFloor`, 462-488)

```
GetGridPositions(listX, listY, gridSizeX, gridSizeY)
InitDungeonGrid(grid, gridSizeX, gridSizeY)
AssignRooms(grid, gx, gy, props.roomDensity)
CreateRoomsAndAnchors(grid, gx, gy, listX, listY, props.roomFlags)
AssignRandomGridCellConnections(grid, gx, gy, props)
CreateGridCellConnections(grid, gx, gy, listX, listY, disableRoomMerging = FALSE)
EnsureConnectedGrid(grid, gx, gy, listX, listY)
GenerateMazeRoom(grid, gx, gy, props.mazeRoomChance)
GenerateKecleonShop(grid, gx, gy, sKecleonShopChance)
GenerateMonsterHouse(grid, gx, gy, sMonsterHouseChance)
GenerateExtraHallways(grid, gx, gy, props.numExtraHallways)
GenerateRoomImperfections(grid, gx, gy)
GenerateSecondaryStructures(grid, gx, gy)
```

Cell sizing (`GetGridPositions`, 1398-1413): `listX[i] = i * (56 / gridSizeX)` for `i = 0..gridSizeX` and `listY[i] = i * (32 / gridSizeY)` for `i = 0..gridSizeY` (integer division; leftover columns/rows at the right/bottom are unused).

### 4.2 One-room monster house (`GenerateOneRoomMonsterHouseFloor`, 1090-1113)

```
InitDungeonGrid(grid, 1, 1)
cell(0,0): start = (2,2), end = (54,30); isRoom = TRUE; isConnected = TRUE; isInvalid = FALSE
every tile x in 2..53, y in 2..29: SetTerrainNormal, room = 0
GenerateMonsterHouse(grid, 1, 1, 999)
```

Also the fallback layout. No hallways.

### 4.3 Outer ring (`GenerateOuterRingFloor`, 491-634)

Grid 6x4. `listX = [0, 5, 16, 28, 39, 51, 56]`, `listY = [2, 7, 16, 25, 30]`. `InitDungeonGrid`. Border cells (x = 0, x = 5, y = 0, y = 3) are hallway anchors; the inner 4x2 are rooms.

For `y` outer, `x` inner (540-589):

```
room cell:
    minX = listX[x] + 2; minY = listY[y] + 2
    rangeX = listX[x+1] - listX[x] - 3; rangeY = listY[y+1] - listY[y] - 3
    sizeX = RandRange(5, rangeX); sizeY = RandRange(4, rangeY)
    startX = RandInt(rangeX - sizeX) + minX; startY = RandInt(rangeY - sizeY) + minY
    carve [startX, startX+sizeX) x [startY, startY+sizeY) as NORMAL, room = currRoomIndex++
anchor cell:
    minX = listX[x] + 1; minY = listY[y] + 1; rangeX, rangeY as above
    startX = RandRange(minX, minX + rangeX); startY = RandRange(minY, minY + rangeY)
    cell = 1x1 at (startX, startY); SetTerrainNormal; room = 0xFF   // not 0xFE
```

No odd-size or aspect-ratio adjustment here, and `flagImperfect` / `flagSecondaryStructure` are never set.

Fixed connections (591-622): every horizontally adjacent pair along row 0 and along row 3, and every vertically adjacent pair along column 0 and column 5 (both sides of each link flagged).

Then: `AssignRandomGridCellConnections`, `CreateGridCellConnections(merge allowed)`, `EnsureConnectedGrid`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`. No maze room, no secondary structures.

### 4.4 Crossroads (`GenerateCrossroadsFloor`, 640-768)

Grid 5x4. `listX = [0, 11, 22, 33, 44, 56]`, `listY = [1, 9, 16, 23, 31]`. Border cells are rooms, the inner 3x2 are anchors, the four corners `(0,0) (4,0) (0,3) (4,3)` are invalid. Rooms and anchors are created by the same formulas as 4.3 (skipping invalid cells).

Fixed connections (746-758):

```
for x in 1..3: for y in 0..2:  (x,y).connectedToBottom = (x,y+1).connectedToTop = TRUE
for y in 1..2: for x in 0..3:  (x,y).connectedToRight  = (x+1,y).connectedToLeft = TRUE
```

Then: `CreateGridCellConnections(disableRoomMerging = TRUE)`, `EnsureConnectedGrid`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`. No random connections.

### 4.5 Two rooms with monster house (`GenerateTwoRoomsWithMonsterHouseFloor`, 1116-1168)

Grid 2x1. `listX = [2, 28, 54]`, `listY = [2, 30]`. Both cells are rooms:

```
minX = listX[x] + 1; minY = listY[y] + 1
rangeX = listX[x+1] - listX[x] - 3   (= 23); rangeY = listY[y+1] - listY[y] - 3   (= 25)
sizeX = RandRange(10, rangeX); sizeY = RandRange(16, rangeY)
startX = RandInt(rangeX - sizeX) + minX; startY = RandInt(rangeY - sizeY) + minY
carve, room = 0 then 1
```

`(0,0).connectedToRight = (1,0).connectedToLeft = TRUE`; `CreateGridCellConnections(merge allowed)`; `GenerateMonsterHouse(grid, 2, 1, 999)`. No `EnsureConnectedGrid`.

### 4.6 Line (`GenerateLineFloor`, 771-806)

Grid 5x1. `listX = [0, 11, 22, 33, 44, 56]`, `listY = [4, 15]`. Standard pipeline: `InitDungeonGrid`, `AssignRooms`, `CreateRoomsAndAnchors`, `AssignRandomGridCellConnections`, `CreateGridCellConnections(disableRoomMerging = TRUE)`, `EnsureConnectedGrid`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`.

### 4.7 Cross (`GenerateCrossFloor`, 809-861)

Grid 3x3. `listX = [11, 22, 33, 44]`, `listY = [2, 11, 20, 30]`. All cells rooms, four corners invalid. `CreateRoomsAndAnchors`. Fixed connections: `(0,1)-(1,1)`, `(1,1)-(2,1)`, `(1,0)-(1,1)`, `(1,1)-(1,2)`. `CreateGridCellConnections(disableRoomMerging = TRUE)`, `EnsureConnectedGrid`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`.

### 4.8 Beetle (`GenerateBeetleFloor`, 865-913)

Grid 3x3. `listX = [5, 15, 35, 50]`, `listY = [2, 11, 20, 30]`. All nine cells rooms. `CreateRoomsAndAnchors`. For each row `y`: `(0,y)-(1,y)` and `(1,y)-(2,y)`. `CreateGridCellConnections(disableRoomMerging = TRUE)`. Then `MergeRoomsVertically(1, 0, 1, grid)` and `MergeRoomsVertically(1, 0, 2, grid)`, then `EnsureConnectedGrid`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`.

`MergeRoomsVertically(roomX, roomY1, dy, grid)` (916-944):

```
A = grid[roomX][roomY1]; B = grid[roomX][roomY1 + dy]
xStart = min(A.start.x, B.start.x); yStart = A.start.y
xEnd   = max(A.end.x,   B.end.x);   yEnd   = B.end.y
roomId = tile(A.start).room
carve [xStart, xEnd) x [yStart, yEnd) as NORMAL with room = roomId
A.start = (xStart, yStart); A.end = (xEnd, yEnd)
B.isMerged = A.isMerged = TRUE; B.isConnected = FALSE; B.hasBeenMerged = TRUE
```

### 4.9 Outer rooms (`GenerateOuterRoomsFloor`, 948-1024)

Uses the random grid size of 3.3. `GetGridPositions`, `InitDungeonGrid`, all cells rooms, interior cells (`1 <= x <= gx-2` and `1 <= y <= gy-2`) invalid, `CreateRoomsAndAnchors`. Connections, exactly as written (982-1011):

```
for x in 0 .. gx-2:
    if x != 0:      (x,0).connectedToRight = (x,gy-1).connectedToRight = TRUE
    if x < gx - 2:  (x+1,0).connectedToLeft = (x+1,gy-1).connectedToLeft = TRUE
for y in 0 .. gy-2:
    if y != 0:      (0,y).connectedToTop = (gx-1,y).connectedToTop = TRUE
    if y < gy - 2:  (0,y).connectedToBottom = (gx-1,y).connectedToBottom = TRUE
```

Then `CreateGridCellConnections(merge allowed)`, `EnsureConnectedGrid`, `GenerateMazeRoom`, `GenerateKecleonShop`, `GenerateMonsterHouse`, `GenerateExtraHallways`, `GenerateRoomImperfections`, `GenerateSecondaryStructures`.

The decomp comments (947, 978-981, 988-991) say this is bugged for `gridSizeX <= 2`. Reading the y loop literally, the vertical link between rows `gy-2` and `gy-1` is also never flagged; see section 9.

---

## 5. Standard pipeline in detail

### 5.1 `InitDungeonGrid` (1421-1458)

For every cell `x < gx`, `y < gy`: `isInvalid` per `sFloorSize` (3.4); `isRoom = TRUE`; and FALSE for `isConnected`, `unk15`, `isMonsterHouse`, `isKecleonShop`, all eight connection flags, `hasSecondaryStructure`, `hasBeenMerged`, `isMazeRoom`, `isMerged`, `flagImperfect`, `flagSecondaryStructure`. Not initialised: `start`, `end`, `unk13`, `unk27`, `unk30`, `unk31`.

### 5.2 `AssignRooms` (1474-1566)

```
extra = RandInt(3)                              // always drawn
if roomsNumber < 0: roomsNumber = -roomsNumber else roomsNumber += extra
bits[0 .. roomsNumber-1] = TRUE; bits[roomsNumber .. 255] = FALSE
maxRooms = gx * gy
repeat 64 times: a = RandInt(maxRooms); b = RandInt(maxRooms); swap(bits[a], bits[b])
i = 0; sNumRooms = 0
for x in 0..gx-1: for y in 0..gy-1:             // COLUMN-major
    if cell.isInvalid: continue                 // i is not advanced
    if sNumRooms >= 32: cell.isRoom = FALSE     // then possibly overwritten just below
    if bits[i]:
        cell.isRoom = TRUE; sNumRooms++
        if gx % 2 != 0 and x == (gx - 1) / 2 and y == 1: cell.isRoom = FALSE   // still counted
    else: cell.isRoom = FALSE
    i++
if sNumRooms >= 2: return
repeat up to 200 times:
    for x: for y:                               // first valid cell first
        if cell.isInvalid: continue
        if RandInt(100) < 60: cell.isRoom = TRUE; stop everything
sSecondSpawn = FALSE                            // written, never read in this file
```

The fallback adds at most one room and the first valid cell is tried first on each pass.

### 5.3 `CreateRoomsAndAnchors` (1574-1705)

Iterates `y` outer, `x` inner (row-major); room numbers are assigned in that order starting at 0.

```
minX = listX[x] + 2;  minY = listY[y] + 2
rangeX = listX[x+1] - listX[x] - 4
rangeY = listY[y+1] - listY[y] - 3
if cell.isInvalid: continue
if cell.isRoom:
    sizeX = RandRange(5, rangeX); sizeY = RandRange(4, rangeY)
    if (sizeX | 1) < rangeX: sizeX |= 1
    if (sizeY | 1) < rangeY: sizeY |= 1
    if sizeX > (sizeY * 3) / 2: sizeX = (sizeY * 3) / 2
    if sizeY > (sizeX * 3) / 2: sizeY = (sizeX * 3) / 2
    startX = RandInt(rangeX - sizeX) + minX
    startY = RandInt(rangeY - sizeY) + minY
    cell.start = (startX, startY); cell.end = (startX + sizeX, startY + sizeY)
    carve the rectangle: SetTerrainNormal, room = roomNumber
    flagImperfect = TRUE
    flagSecondary = RandInt(100) < 80           // always drawn
    if sSecondaryStructuresBudget == 0: flagSecondary = FALSE
    if !(roomFlags & 0x4): flagImperfect = FALSE
    if flagImperfect and flagSecondary:
        if RandInt(100) < 50: flagImperfect = FALSE else flagSecondary = FALSE
    cell.flagImperfect |= flagImperfect; cell.flagSecondaryStructure |= flagSecondary
    roomNumber++
else:                                           // hallway anchor
    ux1 = (x == 0) ? 1 : 2;       uy1 = (y == 0) ? 1 : 2
    ux2 = (x == gx - 1) ? 2 : 4;  uy2 = (y == gy - 1) ? 2 : 4
    px = RandRange(minX + ux1, minX + rangeX - ux2)
    py = RandRange(minY + uy1, minY + rangeY - uy2)
    cell = 1x1 at (px, py); SetTerrainNormal; room = 0xFE
```

### 5.4 Connection assignment

`AssignRandomGridCellConnections` (1744-1750): `cursorX = RandInt(gx); cursorY = RandInt(gy)`, then `AssignGridCellConnections`.

`AssignGridCellConnections` (1771-1982). `enum CardinalDirection { RIGHT = 0, UP = 1, LEFT = 2, DOWN = 3 }` (25-32).

```
x, y = cursor
dir = RandInt(4)
repeat floorConnectivity times:
    test = RandInt(8); newDir = RandInt(4)      // both always drawn
    if test < 4: dir = newDir                   // 50%: keep going straight
    loop:                                       // rotate until not pointing off the grid
        switch dir & 3:
            RIGHT: if x < gx - 1: ok else dir++
            UP:    if y > 0:      ok else dir++
            LEFT:  if x > 0:      ok else dir++
            DOWN:  if y < gy - 1: ok else dir++
        if ok: break
    switch dir & 3:                             // link and step, only if the target is valid
        RIGHT: if !grid[x+1][y].isInvalid: (x,y).connectedToRight = (x+1,y).connectedToLeft = TRUE; x++
        UP:    if !grid[x][y-1].isInvalid: (x,y).connectedToTop = (x,y-1).connectedToBottom = TRUE; y--
        LEFT:  if !grid[x-1][y].isInvalid: (x,y).connectedToLeft = (x-1,y).connectedToRight = TRUE; x--
        DOWN:  if !grid[x][y+1].isInvalid: (x,y).connectedToBottom = (x,y+1).connectedToTop = TRUE; y++
if props.allowDeadEnds: return
loop:                                           // dead-end removal
    more = FALSE
    for x in 0..gx-1: for y in 0..gy-1:
        if cell.isInvalid or cell.isRoom: continue
        if number of TRUE among connectedToTop/Bottom/Left/Right != 1: continue
        dir = RandInt(4)
        ok = FALSE
        for i in 0..7:
            switch dir & 3:
                RIGHT: if x < gx - 1 and !cell.connectedToRight:  ok = TRUE else dir++
                UP:    if y > 0      and !cell.connectedToTop:    ok = TRUE else dir++
                LEFT:  if x > 0      and !cell.connectedToLeft:   ok = TRUE else dir++
                DOWN:  if y < gy - 1 and !cell.connectedToBottom: ok = TRUE else dir++
            if ok: break
        if !ok: continue
        // BUG in original (1937-1939): every case tests grid[x + 1][y].isInvalid
        if !grid[x + 1][y].isInvalid:
            set the link in direction (dir & 3) on both cells; more = TRUE
    if !more: break
```

The buggy validity test can read a cell outside the initialised grid (uninitialised stack memory in the original); see section 9.

### 5.5 `CreateGridCellConnections` (2002-2362)

Pass 1 (2007-2042), every cell: invalid cells get all four `shouldConnectTo*` = FALSE. Valid cells first clear `connectedTo*` flags that point off the grid, then copy `connectedTo*` into `shouldConnectTo*`.

Pass 2 (2044-2164), `x` outer, `y` inner, skipping invalid cells:

```
if cell.isRoom: ptX = RandRange(start.x + 1, end.x - 1); ptY = RandRange(start.y + 1, end.y - 1)
else:           ptX = start.x; ptY = start.y            // drawn for every valid cell, linked or not
if shouldConnectToTop:      N = grid[x][y-1]
    if !N.isInvalid:
        pt2X = N.isRoom ? RandRange(N.start.x + 1, N.end.x - 1) : N.start.x
        CreateHallway(ptX, cell.start.y, pt2X, N.end.y - 1, vertical = TRUE, listX[x], listY[y])
    cell.shouldConnectToTop = N.shouldConnectToBottom = FALSE; cell.isConnected = N.isConnected = TRUE
if shouldConnectToBottom:   N = grid[x][y+1]
    if !N.isInvalid:
        pt2X as above
        CreateHallway(ptX, cell.end.y - 1, pt2X, N.start.y, TRUE, listX[x], listY[y+1] - 1)
    clear the pair of flags; both isConnected = TRUE
if shouldConnectToLeft:     N = grid[x-1][y]
    if !N.isInvalid:
        pt2Y = N.isRoom ? RandRange(N.start.y + 1, N.end.y - 1) : N.start.y
        CreateHallway(cell.start.x, ptY, N.start.x - 1, pt2Y, FALSE, listX[x], listY[y])
        // original bug: N.start.x - 1 instead of N.end.x - 1; the hallway stops when it hits N anyway
    clear the pair of flags; both isConnected = TRUE
if shouldConnectToRight:    N = grid[x+1][y]
    if !N.isInvalid:
        pt2Y as above
        CreateHallway(cell.end.x - 1, ptY, N.start.x, pt2Y, FALSE, listX[x+1] - 1, listY[y])
    clear the pair of flags; both isConnected = TRUE
```

`isConnected` is set on both cells even when the neighbour is invalid and no hallway is drawn.

`CreateHallway(x, y, endX, endY, vertical, turnX, turnY)` (2643-2793), the kinked corridor:

```
step(): if terrain(x,y) != NORMAL: SetTerrainNormal(x,y)
        else if (x,y) != (startX,startY): return from CreateHallway   // met existing floor
each of the three legs has its own counter; a leg aborts the whole function after 56 steps
vertical:   leg 1: while y != turnY: step(); y += sign(turnY - y)
            leg 2: while x != endX:  step(); x += sign(endX - x)
            leg 3: while y != endY:  step(); y += sign(endY - y)
horizontal: leg 1: while x != turnX: step(); x += sign(turnX - x)
            leg 2: while y != endY:  step(); y += sign(endY - y)
            leg 3: while x != endX:  step(); x += sign(endX - x)
```

The final `(endX, endY)` tile itself is never stepped on. Hallway tiles only get `SetTerrainNormal`; their `room` stays 0xFF.

Pass 3, room merging (2167-2361), skipped when `disableRoomMerging`. `x` outer, `y` inner, for EVERY cell:

```
chance = RandInt(100)                           // always drawn, even for invalid cells
if chance < 5 and !isInvalid and isConnected and !isMerged and !hasSecondaryStructure and isRoom:
    d = RandInt(4)                              // 0 left, 1 up, 2 right, 3 down
    N = neighbour in direction d; bounds: left x > 0, up y >= 1, right x <= gx - 2, down y <= gy - 2
    require N.isConnected and !N.isInvalid and N.isRoom and !N.hasSecondaryStructure and !N.isMerged
    roomIndex = tile(cell.start).room           // always the current cell's index
    rectangle:
        left:  x from N.start.x to cell.end.x;  y from min(start.y) to max(end.y)
        up:    y from N.start.y to cell.end.y;  x from min(start.x) to max(end.x)
        right: x from cell.start.x to N.end.x;  y from min(start.y) to max(end.y)
        down:  y from cell.start.y to N.end.y;  x from min(start.x) to max(end.x)
    carve it: SetTerrainNormal, room = roomIndex
    left/up:    N takes the merged bounds; cell.isMerged = N.isMerged = TRUE;
                cell.isConnected = FALSE; cell.hasBeenMerged = TRUE
    right/down: cell takes the merged bounds; both isMerged = TRUE;
                N.isConnected = FALSE; N.hasBeenMerged = TRUE
```

The comment at 1995 gives the resulting pair chance as 9.75%.

### 5.6 `EnsureConnectedGrid` (2803-2941)

Pass 1, `x` outer, `y` inner; skip cells that are invalid, `hasBeenMerged` or `isConnected`:

```
if cell.isRoom and !cell.hasSecondaryStructure:
    rndX = RandRange(start.x + 1, end.x - 1); rndY = RandRange(start.y + 1, end.y - 1)
    first neighbour N, tried in the order up, down, left, right, that is in the grid and has
        !N.isInvalid and !N.isMerged and N.isConnected:
        if N.isRoom: ptX = RandRange(N.start.x + 1, N.end.x - 1); ptY = RandRange(N.start.y + 1, N.end.y - 1)
                     // BOTH drawn in this order although only one is used
        else:        ptX = N.start.x; ptY = N.start.y
        up:    CreateHallway(rndX, start.y,   ptX, N.end.y - 1, TRUE,  listX[x], listY[y])
        down:  CreateHallway(rndX, end.y - 1, ptX, N.start.y,   TRUE,  listX[x], listY[y+1] - 1)
        left:  CreateHallway(start.x, rndY, N.start.x - 1, ptY, FALSE, listX[x], listY[y])
        right: CreateHallway(end.x - 1, rndY, N.start.x,   ptY, FALSE, listX[x+1] - 1, listY[y])
        cell.isConnected = TRUE; set the matching connectedTo* pair
else:                                           // unconnected anchor
    tile(cell.start): SetTerrainWall; clear STAIRS, ITEM, TRAP spawn flags
```

Pass 2 (2918-2940): every cell that is still not invalid, not `hasBeenMerged`, not `isConnected` and not `unk15` has its whole rectangle set to wall, the three spawn flags cleared, and `room = 0xFF`.

### 5.7 `GenerateMazeRoom` (3374-3471)

```
if chance == 0: return
if chance <= RandInt(100): return               // one RNG call whenever chance != 0
if gDungeon.unk3A16 >= 0: return                // always true (unk3A16 = genAttempts): never proceeds
```

The rest (count candidate rooms with odd width and height, 64-swap shuffle, `GenerateMaze(cell, FALSE)`) is unreachable in practice. `GenerateMaze` itself is reachable through secondary structures, see 5.11.

### 5.8 `GenerateKecleonShop` (3089-3236)

```
sKecleonShopMiddlePos = (-1,-1)
if sHasMonsterHouse or GetFloorType() == RESCUE or chance == 0: return
if chance <= RandInt(100): return
listX[i] = listY[i] = i  for i in 0..14
repeat 200: a = RandInt(15); b = RandInt(15); swap(listX[a], listX[b])
repeat 200: a = RandInt(15); b = RandInt(15); swap(listY[a], listY[b])
for i in 0..14: x = listX[i]; if x >= gx: continue
  for j in 0..14: y = listY[j]; if y >= gy: continue
    skip if isInvalid, hasBeenMerged, isMerged, !isConnected, !isRoom,
            hasSecondaryStructure, isMazeRoom, flagSecondaryStructure
    skip if abs(end.x - start.x) < 5 or abs(end.y - start.y) < 4
    sHasKecleonShop = TRUE; cell.isKecleonShop = TRUE
    shop = { minX: start.x + 1, maxX: end.x - 1, minY: start.y + 1, maxY: end.y - 1 }   // max exclusive
    if shop.maxY - shop.minY < 3: shop.maxY++
    for X in [shop.minX, shop.maxX), Y in [shop.minY, shop.maxY):
        set TERRAIN_TYPE_SHOP; clear SPAWN_FLAG_MONSTER and SPAWN_FLAG_STAIRS
        widen gDungeon.kecleonShopPos (inclusive min/max, initialised to +9999 / -9999)
    for every tile of the whole cell rectangle: set SPAWN_FLAG_SPECIAL_TILE
    sKecleonShopMiddlePos = ((shop.minX + shop.maxX) / 2, (shop.minY + shop.maxY) / 2)
    return
```

### 5.9 `GenerateMonsterHouse` (3247-3360)

```
if chance == 0 or chance <= RandInt(100): return   // no RNG call when chance == 0
if sHasKecleonShop: return
if gDungeon.unk644.unk44 != 0: return
if GetFloorType() != NORMAL: return
candidate cell: !isInvalid, !hasBeenMerged, isConnected, isRoom, !isKecleonShop, !unk15,
                !isMazeRoom, !hasSecondaryStructure
numValid = number of candidates (x outer, y inner); if 0: return
values[0] = TRUE, values[1..255] = FALSE
repeat 64: a = RandInt(numValid); b = RandInt(numValid); swap(values[a], values[b])
walk the candidates in the same order; the one whose values[i] is TRUE:
    sHasMonsterHouse = TRUE; cell.isMonsterHouse = TRUE
    every tile of the cell rectangle: set IN_MONSTER_HOUSE; gDungeon.monsterHouseRoom = tile.room
```

Called with `chance = 999` by the one-room and two-room layouts.

### 5.10 `GenerateExtraHallways` (1200-1395)

Directions are the 8-way enum (`include/constants/direction.h`): SOUTH 0, EAST 2, NORTH 4, WEST 6; offsets from `gAdjacentTileOffsets` (`src/dungeon_pos_data.c:5-14`): S (0,1), SE (1,1), E (1,0), NE (1,-1), N (0,-1), NW (-1,-1), W (-1,0), SW (-1,1). `DIRECTION_MASK_CARDINAL = 6`.

```
if numExtraHallways == 0: return
repeat numExtraHallways times:
    x = RandInt(gx); y = RandInt(gy)
    if !cell.isRoom or !cell.isConnected or cell.isInvalid or cell.isMazeRoom: continue
    curX = RandRange(start.x, end.x); curY = RandRange(start.y, end.y)
    dir = RandInt(4) * 2
    repeat 3 times:
        if dir == SOUTH and y >= gy - 1: dir = EAST
        if dir == EAST  and x >= gx - 1: dir = NORTH
        if dir == NORTH and y <= 0:      dir = WEST
        if dir == WEST  and x <= 0:      dir = SOUTH
    roomId = tile(curX, curY).room
    while tile(cur).room == roomId: cur += offset[dir]          // leave the room
    while terrain(cur) == NORMAL:   cur += offset[dir]          // cross any open floor
    if terrain(cur) == SECONDARY: continue
    if any tile of the 5x5 square centred on cur is out of bounds: continue   // needs 2 <= curX <= 53, 2 <= curY <= 29
    if terrain(cur + offset[(dir + 2) & 6]) == NORMAL: continue
    if terrain(cur + offset[(dir - 2) & 6]) == NORMAL: continue
    steps = RandInt(3) + 3
    loop:
        if curX <= 1 or curY <= 1 or curX >= 55 or curY >= 31: break
        if terrain(cur) == NORMAL: break
        if tile(cur) has IMPASSABLE_WALL: break
        wouldMakeSquare = any of the four 2x2 squares containing cur has its other three tiles NORMAL
        if !wouldMakeSquare: SetTerrainNormal(cur)              // otherwise no dig, but no break either
        if terrain(cur + offset[(dir + 2) & 6]) == NORMAL: break
        if terrain(cur + offset[(dir - 2) & 6]) == NORMAL: break
        steps--
        if steps == 0:
            steps = RandInt(3) + 3
            if RandInt(100) < 50: dir += 2 else dir -= 2
            dir &= 6
            if curX >= 32 and sFloorSize == SMALL  and dir == EAST: break
            if curX >= 48 and sFloorSize == MEDIUM and dir == EAST: break
        cur += offset[dir]
```

### 5.11 `GenerateRoomImperfections` (2432-2626)

`x` outer, `y` inner. Skip a cell if `isInvalid`, `hasBeenMerged`, `isMerged`, `!isConnected`, `!isRoom`, `hasSecondaryStructure`, `isMazeRoom` or `!flagImperfect`.

```
if RandInt(100) < 60: continue                                  // 40% of flagged rooms proceed
length = ((end.x - start.x) + (end.y - start.y)) / 4; if length == 0: length = 1
repeat length times:
    for i in 0..1:                                              // 0 counter-clockwise, 1 clockwise
        corner = RandInt(4)
        corner 0 top-left     (start.x,   start.y):   move = i == 0 ? (0, 1)  : (1, 0)
        corner 1 top-right    (end.x - 1, start.y):   move = i == 0 ? (-1, 0) : (0, 1)
        corner 2 bottom-right (end.x - 1, end.y - 1): move = i == 0 ? (0, -1) : (-1, 0)
        corner 3 bottom-left  (start.x,   end.y - 1): move = i == 0 ? (1, 0)  : (0, -1)
        for v in 0..9:
            if p is outside the cell rectangle: break
            if terrain(p) == NORMAL:
                A: for each of the 8 directions d: n = p + offset[d]; if any tile of the 3x3 square
                   centred on n is NORMAL with room == 0xFF: give up on this p
                B: for d in {SOUTH, EAST, NORTH, WEST}:
                       (terrain(p + offset[d]) == NORMAL) must equal expectOpen[corner][d]
                if A found nothing and B matches on all four: SetTerrainWall(p)
                break                                           // one tile examined per (counter, i)
            else: p += move
```

`expectOpen` (`sCornerCardinalNeighborExpectOpen`, 2371-2416): top-left = SOUTH and EAST open; top-right = SOUTH and WEST; bottom-right = NORTH and WEST; bottom-left = NORTH and EAST; every other direction closed. The filled tile keeps its room index.

### 5.12 Secondary structures

`GenerateSecondaryStructures` (1720-1742): `y` outer, `x` inner; for each cell with `!isInvalid && !isMonsterHouse && !isMerged && isRoom && !flagImperfect && flagSecondaryStructure` call `GenerateSecondaryStructure(cell)`.

`GenerateSecondaryStructure` (3706-3900): `switch (RandInt(6))`. `w = end.x - start.x`, `h = end.y - start.y`, `midX = (start.x + end.x) / 2`, `midY = (start.y + end.y) / 2`, `budget = sSecondaryStructuresBudget`.

| Roll | Type | Behaviour |
|---|---|---|
| 0 | `SECONDARY_STRUCTURE_NONE` | nothing |
| 1 | `MAZE_PLUS_DOT` | if `budget != 0`: `budget--`. If `w` or `h` is even: if `w >= 5 && h >= 5` set secondary at `(midX+1,midY)`, `(midX,midY+1)`, `(midX-1,midY)`, `(midX,midY-1)`; always set secondary at `(midX,midY)`. Else (both odd): `SetSpawnFlag5(cell)`, `GenerateMaze(cell, TRUE)`. Then `hasSecondaryStructure = TRUE`. (3871-3898) |
| 2 | `CHECKERBOARD` | if `w` odd and `h` odd and `budget != 0`: `budget--`, `SetSpawnFlag5`, then 64 times `rx = RandInt(w); ry = RandInt(h); if (rx + ry) % 2 != 0` set secondary at `(start.x + rx, start.y + ry)`. `hasSecondaryStructure = TRUE`. (3852-3870) |
| 3 | `POOL` | if `w >= 5 && h >= 5`: draw `x1 = RandRange(start.x + 2, end.x - 3)`, `y1 = RandRange(start.y + 2, end.y - 3)`, `x2`, `y2` the same way, in that order (drawn before the budget test). If `budget != 0`: `budget--`, `SetSpawnFlag5`, sort each pair, fill the inclusive rectangle `[x1..x2] x [y1..y2]` with secondary, `hasSecondaryStructure = TRUE`. (3817-3851) |
| 4 | `ISLAND` | if `w >= 6 && h >= 6` and `budget != 0`: `budget--`, `SetSpawnFlag5`. Secondary + `CORNER_CUTTABLE` on the 12-tile ring `x in midX-2..midX+1`, `y in midY-2..midY+1` minus the inner 2x2. `(midX-1, midY-1)`: `SPAWN_FLAG_TRAP | SPAWN_FLAG_UNK6`. `(midX, midY-1)`, `(midX-1, midY)`, `(midX, midY)`: `SPAWN_FLAG_ITEM`. All four inner tiles: `SPAWN_FLAG_SPECIAL_TILE`. `hasSecondaryStructure = TRUE`. (3773-3816) |
| 5 | `DIVIDER` | if `budget != 0`: `budget--`, `SetSpawnFlag5`. `if RandInt(2) != 0`: vertical line at `x = midX` for `y in [start.y, end.y)`; else horizontal line at `y = midY`. If any tile of the line has `IsNextToHallway` the line is not drawn (budget stays spent). Otherwise set the line secondary, set `TERRAIN_TYPE_UNK_7` on the tiles left of / above the line, `hasSecondaryStructure = TRUE`. (3710-3772) |

`IsNextToHallway(x, y)` (3676-3703): true if the tile itself or one of its four cardinal neighbours (in bounds) is NORMAL with `room == 0xFF`.

`GenerateMaze(cell, useSecondary)` (3482-3551):

```
sHasMaze = TRUE; cell.isMazeRoom = TRUE; roomIndex = tile(cell.start).room
for X = start.x + 1; X < end.x - 1; X += 2: if terrain(X, start.y - 1) != NORMAL: MazeLine(X, start.y - 1)
for Y = start.y + 1; Y < end.y - 1; Y += 2: if terrain(end.x, Y)       != NORMAL: MazeLine(end.x, Y)
for X = start.x + 1; X < end.x - 1; X += 2: if terrain(X, end.y)       != NORMAL: MazeLine(X, end.y)
for Y = start.y + 1; Y < end.y - 1; Y += 2: if terrain(start.x - 1, Y) != NORMAL: MazeLine(start.x - 1, Y)
for X = start.x + 3; X < end.x - 3; X += 2:
    for Y = start.y + 3; Y < end.y - 3; Y += 2:
        if terrain(X, Y) == NORMAL:
            (X - 1, Y) = useSecondary ? secondary : wall
            MazeLine(X, Y)
```

`GenerateMazeLine(x0, y0, xMin, yMin, xMax, yMax, useSecondary, roomIndex)` (3573-3651), bounds = the cell rectangle:

```
loop:
    dir = RandInt(4)                                  // RIGHT 0, UP 1, LEFT 2, DOWN 3
    Obstacle(x0, y0)
    tries = 0
    loop:
        (dx, dy) = RIGHT (2,0) / UP (0,-2) / LEFT (-2,0) / DOWN (0,2) for dir & 3
        if xMin <= x0 + dx < xMax and yMin <= y0 + dy < yMax and terrain(x0 + dx, y0 + dy) == NORMAL: break
        dir++; if ++tries >= 4: return
    Obstacle(x0 + dx / 2, y0 + dy / 2); x0 += dx; y0 += dy
```

`Obstacle` = `SetTerrainObstacleChecked` (2950-2956): `SetTerrainWall(tile)`, then if `useSecondary` and `tile.room == roomIndex`, `SetTerrainSecondary(tile)`.

### 5.13 `FinalizeJunctions` (2985-3050)

One sweep, `x` outer, `y` inner, over tiles whose terrain is NORMAL:

```
if tile.room == 0xFF:
    for neighbour N in the order left (x > 0), up (y > 0), down (y < 31), right (x < 55):
        if N.room != 0xFF:                       // N's terrain is NOT tested
            N.terrainFlags |= NATURAL_JUNCTION
            if terrain(N) == SECONDARY: set N to NORMAL
else if tile.room == 0xFE: tile.room = 0xFF      // anchors become corridor during the same sweep
```

Because anchors are converted in sweep order, an anchor is flagged as a junction when a corridor neighbour is visited before it (see the diagrams at 2967-2983). Then `sub_804EB30` (3052-3074) rebuilds `naturalJunctionList[room][]` for rooms `< 32`, up to 32 entries each, in sweep order.

### 5.14 Secondary terrain: `GenerateSecondaryTerrainFormations(flag, props)` (C version 4609-4864)

`SetSecondaryTerrainOnWall(tile)` (4575-4586): set secondary only if the tile's terrain is WALL and it is not `IMPASSABLE_WALL`. `sNumToGenTable = {1, 1, 1, 2, 2, 2, 3, 3}` (4588).

```
if !(props.roomFlags & flag): return
// rivers
for n = sNumToGenTable[RandInt(8)]; n != 0; n--:
    if RandInt(100) < 50: upwards = TRUE;  y = 31; dirY = -1
    else:                 upwards = FALSE; y = 0;  dirY = 1
    stepsUntilLake = RandInt(50) + 10
    x = RandRange(2, 54)                              // 2..53
    dirX = 0
    loop:
        numTilesFill = RandInt(6) + 2                 // 2..7
        while numTilesFill != 0:
            if 0 <= x < 56:
                if terrain(x, y) == SECONDARY: end this river (jump out of both loops)
                if in bounds: SetSecondaryTerrainOnWall(x, y)
            numTilesFill--
            x += dirX; y += dirY
            if y < 0 or y >= 32: break
            stepsUntilLake--
            if stepsUntilLake != 0: continue
            // lake around (x, y)
            repeat 64:
                ox = RandInt(7) - 3; oy = RandInt(7) - 3
                if x + ox < 2 or x + ox >= 54 or y + oy < 2 or y + oy >= 30: continue
                if any of the 8 neighbours of (x + ox, y + oy) is SECONDARY: SetSecondaryTerrainOnWall(x + ox, y + oy)
            for ox in -3..3: for oy in -3..3:         // smoothing, in place
                if outside the same 2-tile margin: continue
                if at least 4 of the 8 neighbours of (x + ox, y + oy) are SECONDARY: SetSecondaryTerrainOnWall(x + ox, y + oy)
        // change direction after each run (also runs after the y-out-of-bounds break)
        if dirX != 0: dirY = upwards ? -1 : 1; dirX = 0
        else:         dirX = (RandInt(100) < 50) ? -1 : 1; dirY = 0
        if y < 0 or y >= 32: break
// standalone lakes
repeat props.standaloneLakeDensity times:
    n = 0
    while n < 200:
        rx = RandRange(0, 56); ry = RandRange(0, 32)
        if 1 <= rx < 55 and 1 <= ry < 31: break
        n++
    if n == 200: continue
    table[10][10]: TRUE on the border (index 0 or 9), FALSE inside
    repeat 80: tx = RandInt(8) + 1; ty = RandInt(8) + 1
               if table[tx-1][ty] or table[tx+1][ty] or table[tx][ty-1] or table[tx][ty+1]: table[tx][ty] = TRUE
    for tx in 0..9: for ty in 0..9:
        if !table[tx][ty]: SetSecondaryTerrainOnWall(tile(tx + rx - 5, ty + ry - 5))   // out of bounds is a no-op
// clean-up
for every tile with terrain == SECONDARY:
    if it has SHOP, IN_MONSTER_HOUSE or UNBREAKABLE, or SPAWN_FLAG_STAIRS: SetTerrainNormal
    else if x <= 1 or x >= 55 or y <= 1 or y >= 31: SetTerrainWall
```

Rivers only overwrite plain wall tiles, so they never cut into rooms or corridors. Called once with `flag = ROOM_FLAG_ALLOW_SECONDARY_TERRAIN` (0x1), after `FinalizeJunctions`, only when `secondaryGen` is TRUE. Whether the result is water or lava is purely the tileset's business; at the very end water tilesets convert SECONDARY to NORMAL|SECONDARY (`sub_804FC74`).

### 5.15 `StairsAlwaysReachable(stairsX, stairsY, markUnreachable)` (5593-5730)

```
per tile: f = 0
    if terrain != NORMAL and !CORNER_CUTTABLE: f |= 1
    if terrain == SECONDARY and !CORNER_CUTTABLE: f |= 2
f[stairs] |= 0x10 | 0x40                              // start, queued
if gDungeon.stairsSpawn != (stairsX, stairsY): return FALSE
repeat until a full sweep visits nothing:
    sweep x outer, y inner: each tile that is queued (0x40) and not visited (0x80):
        clear 0x40, set 0x80
        queue each in-bounds cardinal neighbour N with (f[N] & (1 | 2 | 0x80)) == 0
        queue each in-bounds diagonal neighbour D with (f[D] & (1 | 2 | 4 | 0x80)) == 0
              provided neither of the two cardinal tiles between has bit 1
        (tiles queued ahead in the same sweep are visited in that sweep)
for every tile with (f & (1 | 2 | 4 | 0x80)) == 0:    // walkable but not reached
    if markUnreachable: set UNREACHABLE_FROM_STAIRS
    else if tile is not UNBREAKABLE: return FALSE
return TRUE
```

So the floor is valid only if every open tile (and every `CORNER_CUTTABLE` moat tile) is reachable from the stairs without cutting corners around walls or liquid. Bit 4 is never set.

---

## 6. Spawn placement

All candidate lists are built by a full sweep (`x` outer, `y` inner). `ShuffleSpawnPositions(list, count)` (4045-4056): `count * 2` times, `a = RandInt(count); b = RandInt(count); swap`. The common pick pattern is: shuffle, `idx = RandInt(count)`, then take `n` consecutive entries wrapping around (so if `n > count` tiles are simply revisited).

### 6.1 `SpawnNonEnemies(props, isEmptyMonsterHouse)` (4073-4404), in this order

| Step | Eligible tile | Count | Effect |
|---|---|---|---|
| Stairs (only if `stairsSpawn` unset) | terrain NORMAL; `room != 0xFF`; no SHOP; no `SPAWN_FLAG_MONSTER`; no `SPAWN_FLAG_SPECIAL_TILE`; no NATURAL_JUNCTION; no UNBREAKABLE | 1: `validSpawns[RandInt(count)]` (no shuffle) | set `SPAWN_FLAG_STAIRS`, clear `SPAWN_FLAG_ITEM`, set `stairsSpawn`. On `FLOOR_TYPE_RESCUE`, every NORMAL tile of the stairs' room gets IN_MONSTER_HOUSE and `monsterHouseRoom` is set (4129-4140). |
| Items | terrain NORMAL; `room != 0xFF`; no SHOP; no IN_MONSTER_HOUSE; no NATURAL_JUNCTION; no UNBREAKABLE | `n = itemDensity`; if `n != 0`: `n = RandRange(n - 2, n + 2)` (n-2..n+1), and `n <= 0` becomes 1 | shuffle + wrap pick; set `SPAWN_FLAG_ITEM` |
| Buried items | terrain exactly WALL (any wall, including the impassable border) | `n = buriedItemDensity`; if `n != 0`: `n = RandRange(n - 2, n + 2)`; placed only if `n > 0` | shuffle + wrap pick; set `SPAWN_FLAG_ITEM` (border ones are removed later by `ResolveInvalidSpawns`) |
| Monster house contents (skipped when `isEmptyMonsterHouse`) | IN_MONSTER_HOUSE; no SHOP; no NATURAL_JUNCTION (terrain is not tested) | `n = RandRange(count / 2, (count * 8) / 10)`; `n < 6` becomes 6; `n >= 7` becomes 7 | shuffle + wrap pick; per tile `RandInt(2) != 0` gives `SPAWN_FLAG_ITEM`, otherwise `SPAWN_FLAG_TRAP` but only if `gDungeon->unk644.canChangeLeader` |
| Traps | terrain NORMAL; `room != 0xFF`; no SHOP; no `SPAWN_FLAG_ITEM`; no NATURAL_JUNCTION; no UNBREAKABLE | `n = RandRange(trapDensity / 2, trapDensity)`; placed only if `n > 0`; capped at 56 | shuffle + wrap pick; set `SPAWN_FLAG_TRAP` |
| Player (only if `playerSpawn` unset) | terrain NORMAL; `room != 0xFF`; no SHOP; no NATURAL_JUNCTION; no UNBREAKABLE; no `SPAWN_FLAG_ITEM`, `_MONSTER`, `_TRAP` | 1: `validSpawns[RandInt(count)]` (no shuffle) | set `playerSpawn` |

RNG note: when a candidate list is empty, or the computed count is 0, the shuffle and index draws for that step are skipped. The count draw happens before the shuffle.

### 6.2 `SpawnEnemies(props, isEmptyMonsterHouse)` (4409-4569)

```
d = props.enemyDensity (u8)
if d > 0: n = RandRange(d / 2, d); if n < 1: n = 1
else:     n = abs(d)                                  // i.e. 0
eligible: terrain NORMAL; room != 0xFF; no SHOP; no SPAWN_FLAG_ITEM; no SPAWN_FLAG_STAIRS;
          no NATURAL_JUNCTION; no UNBREAKABLE; not the player spawn tile
if count != 0:
    if gDungeon.unk644.unk44: n++
    if n != 0: shuffle; idx = RandInt(count); set SPAWN_FLAG_MONSTER on n tiles (wrapping)
if !gDungeon.forceMonsterHouse: return
// forced monster house only (one-room and two-room layouts and the fallbacks)
cap = gMonsterHouseMaxMons (12); if isEmptyMonsterHouse: cap = 3
cap = (cap * 3) / 2                                   // 18, or 4
eligible: terrain NORMAL; room != 0xFF; no SHOP; no UNBREAKABLE; IN_MONSTER_HOUSE; not the player spawn tile
if count != 0:
    n = RandRange((7 * count) / 10, (8 * count) / 10); if n == 0: n = 1; if n >= cap: n = cap
    shuffle; idx = RandInt(count); set SPAWN_FLAG_MONSTER on n tiles (wrapping)
```

Enemies for an ordinary (not forced) monster house are not placed by this file.

### 6.3 `ResolveInvalidSpawns` (3911-3939)

Per tile: if terrain != NORMAL, clear `SPAWN_FLAG_ITEM` when the tile is UNBREAKABLE or IMPASSABLE_WALL, and always clear `SPAWN_FLAG_TRAP`. If `SPAWN_FLAG_STAIRS`: set `TERRAIN_TYPE_STAIRS`, clear TRAP. If `SPAWN_FLAG_ITEM`: clear TRAP.

### 6.4 Kecleon shop contents: `sub_8051654` (6003-6102)

Runs once at the end if `sKecleonShopPosition.minX >= 0`. `S` = `sKecleonShopPosition` (max exclusive).

```
rangeX = RandRange(3, (S.maxX - S.minX) - 2); if rangeX < 3: rangeX = 3     // the 20-try loop always exits on try 1
rangeY = RandRange(3, (S.maxY - S.minY) - 2); if rangeY < 3: rangeY = 3
r = RandRange(2, 4)                                                          // 2 or 3
repeat r times: if S.maxX - S.minX <= rangeX: break
    if RandInt(100) < 50: clear SHOP on column S.minX (rows S.minY..S.maxY-1); S.minX++
    else:                 S.maxX--; clear SHOP on column S.maxX
repeat r times: if S.maxY - S.minY <= rangeY: break
    if RandInt(100) < 50: clear SHOP on row S.minY (columns S.minX..S.maxX-1); S.minY++
    else:                 S.maxY--; clear SHOP on row S.maxY
for every tile in S: if SHOP and NATURAL_JUNCTION: clear SHOP
midX = (S.minX + S.maxX) / 2 - 1; midY = (S.minY + S.maxY) / 2 - 1
for xi in 0..2 (x = midX + xi): for yi in 0..2 (y = midY + yi):
    skip unless SHOP; skip if IN_MONSTER_HOUSE or NATURAL_JUNCTION
    if sKecleonShopItemSpawnChances[props.kecleonShopLayout][yi][xi] > RandInt(100): set SPAWN_FLAG_ITEM
```

The shopkeeper is spawned at `sKecleonShopMiddlePos` (computed in 5.8, before the shrink) by `sub_806C330` (line 403), outside this file. `gDungeon->kecleonShopPos` is not updated by the shrink.

---

## 7. Random number generator (`src/dungeon_random.c`)

```
u32 gDungeonRngState = 1
u32 gDungeonRngPreseedState = 1

SetDungeonRNGPreseed23Bit(p):  preseed = (1 | p) & 0xFFFFFF                    // 14-17
GenerateDungeonRNGSeed():                                                      // 19-35
    r1 = preseed * 0x5D588B65 + 1          (u32 wraparound)
    r0 = r1 >> 16
    r1 = r1 * 0x5D588B65 + 1
    preseed = r1
    r0 = ((r0 | (r1 & 0xFFFF0000)) & 0x00FFFFFF) | 1
    return r0
InitDungeonRNG(v):             state = v | 1                                   // 37-40
DungeonRand16Bit():            state = 1566083941 * state + 1; return state >> 16   // 42-46
DungeonRandInt(cap):           return (((DungeonRand16Bit() & 0xFFFF) * cap) >> 16) & 0xFFFF   // 48-51
DungeonRandRange(low, high):                                                   // 53-65
    if low == high: return low             // NO RNG call
    if low <  high: return DungeonRandInt(high - low) + low     // [low, high - 1]
    else:           return DungeonRandInt(low - high) + high    // [high, low - 1]
DungeonRandOutcome(pct):       return DungeonRandInt(100) < pct                // 67-74
```

- LCG: multiplier 1566083941 = 0x5D588B65, increment 1, modulus 2^32; output is the top 16 bits.
- `DungeonRandInt(cap)`: `[0, cap - 1]` for `cap >= 1`; 0 for `cap == 0`; still one RNG step in every case. For a negative `cap` the s32 product is negative, the shift is arithmetic and the result is masked to 16 bits (a large positive number); reproduce that literally if exact parity on degenerate cells matters.
- `DungeonRandRange`: upper bound exclusive, bounds may be given in either order, equal bounds draw nothing.
- JavaScript: `state = (Math.imul(state, 0x5D588B65) + 1) >>> 0; r16 = state >>> 16; RandInt = ((r16 * cap) >> 16) & 0xFFFF` (the product fits in s32 for `cap <= 32768`).

Seeding (`src/run_dungeon.c`): once per dungeon entry the 24-bit preseed is set from `Rand32Bit() & 0xFFFFFF` (the general, non-dungeon RNG), or from the stored mission seed on a rescue (189-195). At the start of every floor `unk3C = GenerateDungeonRNGSeed(); InitDungeonRNG(unk3C)` (251-253). There is one dungeon RNG stream: the same `gDungeonRngState` is used by generation and by gameplay afterwards. Between `InitDungeonRNG` and `GenerateFloor()` (line 336) at least `DungeonRandInt(4)` for the Deoxys form (260) is drawn; other calls in between were not traced (section 9).

---

## 8. Fixed rooms (summary only)

- `gDungeon->fixedRoomNumber` (copied from `FloorProperties.fixedRoomNumber`) non-zero routes each inner attempt to `ProcessFixedRoom` (1026-1050). Room data comes from the `fixedmap` archive: per room a header `{u8 x, u8 y, u8 unk2}` followed by a tile-action stream.
- Size 0 in either dimension: `GenerateOneRoomMonsterHouseFloor()`, return FALSE.
- Floor-wide rooms (`fixedRoomNumber < FIRST_NON_FLOORWIDE_FIXED_ROOM`, i.e. up to `FIXED_ROOM_RESCUE_TEAM_MAZE_BOSS`): `sub_8051288` (5888-5947) writes the room at map offset (5,5), one action id per tile in row-major order, marks every tile `UNBREAKABLE`, and applies `PlaceFixedRoomTile` (`src/dungeon_generation_fixed.c:850`). Everything outside the room becomes impassable wall (or impassable NORMAL|SECONDARY on water tilesets). Special cases: extra walls for the Moltres room, and all walls impassable when `tileset >= 64`. `FinalizeJunctions` is called; return TRUE ends the inner loop at once, and the outer loop accepts the floor without the stairs check (`FLOOR_TYPE_FIXED`, 377).
- The action stream is run-length coded (`sub_80511F0`, 5861-5879): a byte of 14 means "next byte is a literal id"; otherwise high nibble = id, low nibble = number of extra repeats.
- `PlaceFixedRoomTile` actions seen: 0 floor, 1 wall, 4 player spawn, 5 secondary, 6/7/10 NORMAL|SECONDARY variants, 8 and 67 stairs, 9 corridor floor, 2/13/14 impassable wall, 11/12/68/69 special tiles, 16-219 entries of `sFixedRoomEntities[204]` (item, species, trap, room id).
- Other fixed rooms (embedded in a random floor): `sub_804C790` (1052-1084) with `gridSizeX = max(1, 56 / (sizeX + 4))`, `gridSizeY = max(1, 32 / (sizeY + 4))`: `AssignRooms`, pick a random room cell (up to 64 tries), `CreateRoomsAndAnchorsForFixedFloor` (5732-5854; the chosen cell gets the exact fixed size at the cell's `min` corner, the other rooms use minimum size 5x5, or 10 wide when `gridSizeX <= 2` and 16 tall when `gridSizeY == 1`), then connections without merging, `EnsureConnectedGrid`, and `sub_8051438` stamps the fixed tiles into the cell. No shop, monster house, extra hallways, imperfections or secondary structures on this path.

---

## 9. Ambiguous, undecompiled or not determined

1. **`GenerateSecondaryTerrainFormations` is built from assembly.** The C version (4609-4864) is under `#ifdef NONMATCHING`; the default build uses the `NAKED` asm at 4866-5574. The decomp comment (4604) says the C is functionally the same and differs only in stack layout. Section 5.14 follows the C; I checked only the first few asm instructions against it, not the whole body.
2. **Outer rooms layout connectivity.** Reading 998-1011 literally, no link is ever flagged between rows `gy-2` and `gy-1`, which would leave the bottom row cut off (the decomp comments only acknowledge a bug for `gridSizeX <= 2` and call the vertical issue harmless). I could not tell whether the C is a faithful match there or whether I am missing an effect; check against a real floor before relying on it.
3. **Dead-end removal reads the wrong cell** (1937-1973, `grid[x + 1][y].isInvalid` for all four directions). For `x = gx - 1` this reads a cell that `InitDungeonGrid` never initialised (stack garbage on hardware; the decomp notes this makes generation "occasionally inconsistent even when using the same seed"). A port must pick a policy for that read.
4. **Uninitialised grid fields.** `unk15` is initialised FALSE and tested but never set TRUE. `unk13`, `unk30`, `unk31` are never used; `unk27` is only written (1066). `start`/`end` of invalid cells are never set.
5. **`gDungeon->unk644.unk44`**: blocks monster houses and adds one enemy; reset to 0 each floor. Its real meaning (the comments suggest a mission/outlaw target) was not determined.
6. **`gDungeon->unk644.canChangeLeader`** gating monster house traps (4290): the field name is the decomp's; why it gates traps is not clear from this file.
7. **`SPAWN_FLAG_UNK5`, `SPAWN_FLAG_UNK6`, `TERRAIN_TYPE_UNK_7`**: set as described, consumers not traced. `map.h` describes `SPAWN_FLAG_UNK7` as the divider flag, but the code sets the terrain flag `TERRAIN_TYPE_UNK_7`.
8. **RNG draws before `GenerateFloor`.** After `InitDungeonRNG` the game draws the Deoxys form and calls `SetFloorItemMonsterSpawns`, `SetCurrentMonsterSpawns` and other setup before generation; how many RNG steps those consume was not traced. Exact seed-for-seed parity with the cartridge needs that count.
9. **`sKecleonShopItemSpawnChances` entries 14 and 15** were not printed (0-13 are identical).
10. **`sub_806C330`** (shopkeeper spawn) and everything that turns spawn flags into actual items, traps and monsters live outside this file and were not read. `itemStickyChance` is not read by the generator.
11. **Comment/code mismatches worth knowing:** the room-tile threshold is 30 in code (349), 20 in comments; the cell-size test is `< 8` in code, "7 tiles" in the comment; `sInvalidGeneration` is never set TRUE.
12. **`sub_804B534` south-neighbour bug** (439): the decomp comment is unsure whether it matters; as written it suppresses the south neighbour for all corridor tiles with `x >= 30`.
13. **Maze rooms** via `mazeRoomChance` are unreachable (`unk3A16 >= 0` is always true), but the function still consumes one RNG call when the chance is non-zero.
14. **Hidden stairs**: not present in this game's generator.
15. **`dungeon_generation_fixed.c`** was only skimmed (function list, `PlaceFixedRoomTile`); the 204-entry entity table and the remaining functions were not read.
