# PMD Red Rescue Team — dungeon systems reference (everything except floor layout)

Source: `pret/pmd-red` decompilation (shallow clone, read only). All paths are relative to the repo root.
Line numbers refer to that clone. Symbols named `sub_80xxxxx` / `unkNN` are **not yet named by the decomp**; where I
describe what they do, it is from reading their body, and that is stated.

Conventions used below

- "tick" = one call of `RunFractionalTurn_Async` (a *fractional turn*). 24 ticks = one cycle. A normal-speed monster acts every 4th tick, so **1 turn = 4 ticks**.
- `DungeonRandInt(n)` returns an integer in `[0, n-1]` (`src/dungeon_random.c:48`): `((rand16 * n) >> 16)`.
- `DungeonRandRange(lo, hi)` returns `[lo, hi-1]` (**upper bound exclusive**), or `lo` if `lo == hi` (`src/dungeon_random.c:53`).
- Map size: `DUNGEON_MAX_SIZE_X 56`, `DUNGEON_MAX_SIZE_Y 32` (`include/structs/str_dungeon.h:16-17`).
- Entity limits: `MAX_TEAM_MEMBERS 4`, `DUNGEON_MAX_WILD_POKEMON 16`, `DUNGEON_MAX_POKEMON 20`, `DUNGEON_MAX_TRAPS 64`, `DUNGEON_MAX_ITEMS 64`, `MAX_TEAM_BODY_SIZE 6`, `MAX_MON_MOVES 4`, `INVENTORY_SIZE 20`.
- Directions (`include/constants/direction.h`): 0=S, 1=SE, 2=E, 3=NE, 4=N, 5=NW, 6=W, 7=SW. Odd = diagonal. Offsets in `src/dungeon_pos_data.c:5` (S = `{0,+1}`).

---

## 1. The turn system

### 1.1 Outer loop

`src/run_dungeon.c:458-461` — after a floor is built:

```c
do {
    RunFractionalTurn_Async(param);   // param TRUE only on the first tick of a floor
    param = FALSE;
} while (!IsFloorOver());
```

`IsFloorOver()` (`src/dungeon_engine.c:452`) is true when the leader is gone, when the stairs were taken (`gDungeon->unk2 == DUNGEON_UNK2_1`), on a pitfall, or when `gDungeon->unk4` is set (rescue/quit paths).

### 1.2 One tick — exact order (`src/dungeon_engine.c:44-77`)

```
RunFractionalTurn(firstTick):
  1. TrySpawnMonsterAndActivatePlusMinus()      // only if gSpeedTurns[1][tick] != 0  (once per normal turn)
        TrySpawnWildMonster()                   // respawn timer, section 3
        for every active monster: attacking = FALSE
        recompute Plus/Minus/Lightningrod holders
  2. acted = RunLeaderTurn(firstTick)           // BLOCKS on player input
  3. if acted: UpdateWindTurns()                // turn limit, section 1.9
  4. sub_8044574()                              // teammates (team slots 0..3, leader skipped)
  5. sub_8044820()                              // wild monsters (slots 0..15)
  6. sub_8044AB4()                              // if gSpeedTurns[1][tick+1] != 0:
                                                //    DisplayActions (play queued walk animations),
                                                //    sub_807EAA0(1,0) = weather tick
  7. if (++fractionalTurn == 24) fractionalTurn = 0
```

Every step is followed by an `IsFloorOver()` early-out.

**"Everything moves only when the player acts"** is implemented by step 2: `RunLeaderTurn_Async` calls `DungeonHandlePlayerInput()` (`src/dungeon_engine.c:117`), which spins a frame loop until the player commits an action. Nothing else in the tick runs until it returns. Walk actions are *queued* (`numMoveTiles`) and animated together by `DisplayActions_Async` (`src/dungeon_entity_movement.c:146`), which is why the party and enemies appear to move simultaneously.

### 1.3 Who acts on which tick — the speed table

`src/dungeon_engine.c:36-42` (quoted exactly; `NUM_SPEED_COUNTERS 5`, columns = tick 0..24):

```c
const s16 gSpeedTurns[NUM_SPEED_COUNTERS][25] = {
    [0] = {0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0},
    [1] = {0, 0, 0, 4, 0, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 7, 0, 0, 0, 8, 0, 0, 0, 9, 0},
    [2] = {0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 16, 0, 17, 0, 18, 0, 19, 0, 20, 0, 21, 0},
    [3] = {0, 22, 23, 24, 0, 25, 26, 27, 0, 28, 29, 30, 0, 31, 32, 33, 0, 34, 35, 36, 0, 37, 38, 39, 0},
    [4] = {40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64},
};
```

Only zero / non-zero matters (the non-zero values are just a running index). A monster may act on a tick when `gSpeedTurns[speedStage][tick] != 0`.

| Speed stage | Name | Acting ticks (of 0..23) | Actions per 24 ticks | Actions per normal turn |
|---|---|---|---|---|
| 0 | half | 7, 15, 23 | 3 | 0.5 |
| 1 | **normal** | 3, 7, 11, 15, 19, 23 | 6 | 1 |
| 2 | double | every odd tick | 12 | 2 |
| 3 | triple | ticks where `tick % 4 != 0` | 18 | 3 |
| 4 | quadruple | every tick | 24 | 4 |

Column 24 is only ever read by `sub_8044AB4` as `[fractionalTurn + 1]` (`src/dungeon_engine.c:439`).

Speed stage — `CalcSpeedStage` (`src/dungeon_logic.c:324-366`), `MAX_SPEED_STAGE 4` (`include/structs/dungeon_entity.h:19`):

```
speed  = (number of non-zero speedUpCounters[0..4]) - (number of non-zero speedDownCounters[0..4])
speed -= 1 if PARALYSIS
speed += GetMovementSpeed(species)            // data value is 1 for all 424 species (data/monster/monster_data.json)
speed += 1 if Ice-type and weather == SNOW
speed += 1 if apparentID == DEOXYS_SPEED
speed += 1 if Kecleon && isNotTeamMember && stoleFromKecleon
clamp to [0, 4]
```

Each speed boost / slow is an independent counter with its own duration: `gSpeedRaiseTurnRange = {8, 10}`, `gSpeedLowerTurnRange = {6, 8}` (`src/dungeon_config.c:98,100`). They tick down in `TickStatusAndHealthRegen` (`src/dungeon_turn_effects.c:548-570`).

**The `attacking` flag (one attack per turn at high speed).** `src/dungeon_action_execution.c:108`:
```c
if (((ACTION_PASS_TURN < info->action.action) && (info->action.action != 4)) && (info->action.action != ACTION_WALK)) {
    info->attacking = TRUE;
}
```
A monster with `attacking == TRUE` is skipped on its speed ticks (`dungeon_engine.c:91, 230, 353`). The flag is cleared for everyone only on normal-speed ticks (step 1, which runs *before* the leader on that tick). Worked example at double speed (acting ticks 1, 3, 5, 7 …; clears at 3, 7, 11 …): attack on tick 3 → tick 5 is skipped → cleared at 7 → may attack on 7 → tick 9 skipped. So in steady state extra speed gives **one attack per normal turn plus extra walks/passes**, not extra attacks. (An attack on an off tick such as tick 1 is cleared at tick 3, so two attacks in a row are possible once.)

**Leader speed change mid-turn** (`dungeon_engine.c:142-144`): if the leader's speed stage changed during its action, `fractionalTurn = 0` and the leader loop runs again immediately.

### 1.4 The leader's turn (`RunLeaderTurn_Async`, `src/dungeon_engine.c:79-149`)

```
if gSpeedTurns[CalcSpeedStage(leader)][tick] == 0: return FALSE
if leader.attacking: return FALSE
loop:
    flush pending animations (DisplayActions)
    if not firstTick: TickStatusAndHealthRegen(leader)     // regen + status countdowns, 1.8
    EnemyEvolution(leader)
    DungeonHandlePlayerInput()                             // blocks
    ExecuteEntityDungeonAction_Async(leader)
    sub_8086AC0(); TryForcedLoss_Async(FALSE)
    sub_8044454_Async()         // resolves the teammate that was swapped with (see 1.7)
    if a leader switch was requested (gDungeon->unkBC): do it (sub_805F02C) and loop again with firstTick = TRUE
    else if !speedStageChanged: break
    else fractionalTurn = 0 and loop
return TRUE
```

If the leader has a status that prevents acting (asleep, frozen, wrap, petrified, paused, infatuated, bide...), `DungeonHandlePlayerInput` auto-passes after a 60-frame wait (`src/dungeon_main.c:96-99`, `sub_80701A4` in `src/status_checks.c:90`).

### 1.5 Teammates (`sub_8044574_Async`, `src/dungeon_engine.c:208-326`)

For team slots 0..3, skipping the leader, if on a speed tick, not `attacking`, and not flagged `0x8000` (already moved by a swap):

```
TickStatusAndHealthRegen(mon); EnemyEvolution(mon)
for j in 0..2:
    RunMonsterAI(mon, 0)
    if floor over or !ExecuteEntityDungeonAction_Async(mon): break   // returns TRUE only when the action was interrupted by pending movement
```

Then **three follow-up passes** for teammates whose AI set `aiAllySkip` (they were blocked by another Pokémon). They are re-run sorted by Chebyshev distance to the leader — distance 0/1 first, then 2, then ≥3 (`distance >= 3 → 2` bucket, lines 279-288) — with `recalculateFollow = TRUE`. Anyone still flagged after that just gets `DoEndOfTurnEffects_Async`.

### 1.6 Wild monsters (`sub_8044820_Async`, `src/dungeon_engine.c:328-386`)

For wild slots 0..15 in order: if on a speed tick and not `attacking`:
`TickStatusAndHealthRegen → EnemyEvolution → RunMonsterAI → ExecuteEntityDungeonAction_Async`. Then a second loop gives end-of-turn effects to any still flagged `aiAllySkip`.

**Order summary:** leader → teammates in team-slot order → wild monsters in wild-slot order. There is no initiative/speed sorting inside a group; speed only decides *whether* you get a slot on a given tick.

### 1.7 What uses a turn / passing / diagonals / swapping

**Action table.** Actions are `enum DungeonAction` (`include/constants/dungeon_action.h`). Anything that goes through `ExecuteEntityDungeonAction_Async` (`src/dungeon_action_execution.c:54`) consumes the actor's slot: `ACTION_WALK 0x2`, `ACTION_PASS_TURN 0x1`, `ACTION_REGULAR_ATTACK 0x32`, `ACTION_USE_MOVE_PLAYER 0x14`, `ACTION_STRUGGLE 0x17`, `ACTION_STAIRS 0x26`, item actions (`EAT_BERRY_SEED_DRINK 0xD`, `USE_TM 0x12`, `USE_ORB 0x31`, `THROW_* 0xB/0x27/0x41`, `PICK_UP_PLAYER 0x9`, `PLACE_ITEM 0x8`, `GIVE_ITEM 0x36`, `TAKE_ITEM 0x37`, `SET_ITEM 0x3C`, `UNSET_ITEM 0x3D`, swap-with-floor `0xA/0x3A`), `ACTION_TALK_FIELD 0x13`, `ACTION_STEPPED_ON_TRAP 0x25`. Unknown ids fall to `default: action = ACTION_PASS_TURN`.
Menu-only actions (check moves, summary, tactics, set/link moves, view IQ, message log, map) are handled inside the input loop and do **not** return to the engine. *Which* menu actions are free is decided in `ShowMainMenu` / the menu files (`src/dungeon_menu_*.c`); I did not trace each one.

A walk that turns out to be illegal at execution time becomes `ACTION_NOTHING` with `waiting = TRUE` (`dungeon_action_execution.c:136-150`) — the slot is still spent.

**Passing a turn** (`src/dungeon_main.c:176-198`):
- Hold **A+B** (or press A while holding B) → `ACTION_PASS_TURN`, *only if belly ≠ 0* (`FixedPointToInt(leaderInfo->belly) != 0`).
- Pressing a direction while immobilised (Shadow Hold / Constriction / Ingrain / Wrap / Wrapped) → message + `ACTION_PASS_TURN` (lines 433-463).
- Pressing A while "terrified"/running away → pass (line 193).
- Hold **B + direction** = run (`gDungeon->unk644.unk28 = 1`), also requires belly ≠ 0 and not confused (lines 466-469). Running is repeated walking; each step is a normal turn.

**A button** (no modifiers): if facing a talkable ally/shopkeeper → `ACTION_TALK_FIELD`, else `ACTION_REGULAR_ATTACK` (lines 244-248). **L+A** uses the "set" move; with all PP 0 → `ACTION_STRUGGLE`. **L+R** throws the "set" item. **R held** = diagonal-only mode (`sInDiagonalMode`, line 419: only odd directions accepted). **R tap / START** = rotate-in-place mode (turning is free).

**Diagonal movement / corner cutting.** Legality is a precomputed bitmask per tile, `walkableNeighborFlags[terrainClass]`, built by `sub_8049BB0` (`src/dungeon_map_access.c:341-439`). Bit `1 << direction`. For the regular class:

```c
// orthogonal: neighbour must be NORMAL floor
if (var_4C[0] == TERRAIN_TYPE_NORMAL) flags[CROSSABLE_TERRAIN_REGULAR] |= 1;   // S, likewise E/N/W
// diagonal: target must be NORMAL floor AND both orthogonal neighbours must be non-wall
if (var_4C[0] != 0 && var_4C[1] == TERRAIN_TYPE_NORMAL && var_4C[2] != 0)
    flags[CROSSABLE_TERRAIN_REGULAR] |= 2;                                      // SE, likewise NE/NW/SW
```

(`var_4C[i]` = neighbour's `terrainFlags & (NORMAL | SECONDARY)`; `0` = wall.) So: **you cannot move diagonally around a wall corner** — both orthogonally adjacent tiles must be floor *or water/lava* (a liquid tile does not block the diagonal even for a walker). Four classes exist:

| Class | Orthogonal step allowed onto | Diagonal extra rule |
|---|---|---|
| `CROSSABLE_TERRAIN_REGULAR` | normal floor | both side tiles non-wall |
| `CROSSABLE_TERRAIN_LIQUID` | floor or secondary (water/lava) | both side tiles non-wall |
| `CROSSABLE_TERRAIN_CREVICE` (index 2) | anything non-wall | diagonal target and both sides non-wall |
| `CROSSABLE_TERRAIN_WALL` | everything (`0xFF`) except the map border | none (can cut corners) |

`CanMoveInDirection` (`src/dungeon_logic.c:685-714`) = target tile is not `TERRAIN_TYPE_IMPASSABLE_WALL`, has no monster, and the bit is set for the mover's class. Mobile status / Mobile Scarf → wall class; IQ All-Terrain Hiker → crevice class; IQ Super Mobile → wall class orthogonally only.

**Attacks use the same corner rule.** `CanAttackInDirection` (`src/dungeon_logic.c:869-914`) uses at least the crevice class, so a regular attack or front-tile move **cannot hit diagonally past a wall corner**. Moves with range `TARGETING_FLAG_CUT_CORNERS (0x80)` and line moves ignore this (section 6.5).

**Swapping places with a teammate** (`sub_805EC4C`, `src/dungeon_main.c:860-926`): walking into a tile occupied by a team member (or shopkeeper / rescue client / experience-locked guest) swaps, unless either side is Shadow Hold / Frozen / Constriction / Ingrain / Wrap / Wrapped, either is Confused, either is asleep (Sleepless/Yawning are fine), the other is charging a two-turn move, or the diagonal/corner test `sub_8070F80` fails. If the swap would put the teammate on terrain it cannot stand on, a Yes/No prompt is shown (line 907). Both get `ACTION_WALK`, both get flag `0x8000`, `gDungeon->unkE = 1`; the teammate's forced walk is executed right after the leader's action by `sub_8044454_Async` and the teammate then skips its own slot that tick. It costs the leader one turn like any step.

### 1.8 Per-turn upkeep

Two separate routines, both **per action slot, not per 4 ticks** — a double-speed monster runs them twice per turn.

#### (a) Before acting: `TickStatusAndHealthRegen` (`src/dungeon_turn_effects.c:396-571`)

**HP regeneration** (lines 410-439), quoted:

```c
if (!entityInfo->bellyEmpty && status != STATUS_POISONED && status != STATUS_BADLY_POISONED) {
    s32 regenSpeed = 0;
    if (!entityInfo->isNotTeamMember)
        regenSpeed = GetRegenSpeed(entityInfo->id);
    if (regenSpeed != 0) {
        if (HasHeldItem(entity, ITEM_HEAL_RIBBON))            regenSpeed += gHealRibbonRegenValue;   // -100
        if (reflectClassStatus.status == STATUS_WISH)          regenSpeed += gWishRegenValue;         // -220
        if (Rain Dish && weather == RAIN)                      regenSpeed += gRainDishRegenValue;     // -150
        if (regenSpeed > 500) regenSpeed = 500;
        if (regenSpeed < 30)  regenSpeed = 30;
        entityInfo->unk1F8 += entityInfo->maxHPStat;
        while (entityInfo->unk1F8 >= regenSpeed) { entityInfo->HP++; entityInfo->unk1F8 -= regenSpeed; }
        if (HP >= maxHPStat) HP = maxHPStat;
    }
}
```

- Accumulator model: each slot adds `maxHP`; every `regenSpeed` points = 1 HP. So **HP per turn = maxHP / regenSpeed**, i.e. a full heal takes `regenSpeed` turns regardless of max HP.
- `GetRegenSpeed` (`src/pokemon.c:764`): `return ((u8)(sMonsterParameters[index].regenSpeed) << 25) >> 24;` The data value is `100` for every species (`include/structs/str_pokemon.h:123`: "100 for all Pokémon"), and the expression doubles it → **effective regenSpeed = 200** (full heal in 200 turns; 100 with Heal Ribbon; 30 = floor with Wish). See section 9 for the caveat on this arithmetic.
- **Wild Pokémon (`isNotTeamMember`) never regenerate** — `regenSpeed` stays 0.
- No regen while poisoned / badly poisoned, or on a turn where belly was 0.

**Status countdowns.** Each status *class* has a `turns` byte decremented by `sub_80838EC` (`src/dungeon_range.c:342`: decrement unless `0x7F`, which means "indefinite"). Classes, in tick order: sleep, burn (burn/poison/badly poisoned/paralysis), frozen (frozen/shadow hold/wrap/constriction/ingrain/petrified), cringe (cringe/confused/paused/cowering/taunted/infatuated…), reflect (reflect/light screen/safeguard/mist/wish/protect…), curse (cursed/decoy/snatch), leech seed, sure shot (sure shot/whiffer/set damage/focus energy), invisible (invisible/transformed/mobile), blinker (blinker/cross-eyed/eyedrops), muzzled, terrified, then the 5 speed-up and 5 speed-down counters. One status per class at a time.

Duration ranges (`src/dungeon_config.c:93-157`, `{min, max}` fed to `DungeonRandRange`, so max is exclusive; `0x7F` = permanent until cured): Freeze `{3,5}`, Burn/Poison/Bad Poison `{0x7F,0x7F}`, Cringe `{1,1}`, Confusion `{6,12}`, Paralysis `{1,2}`, Shadow Hold `{2,5}`, Constriction `{3,6}`, Wrap `{2,5}`, Ingrain `{15,30}`, Pause `{1,1}`, Sleep `{3,7}`, Nightmare `{4,8}`, Napping `{2,4}`, Yawn `{2,2}` then sleep `{4,8}`, Sleepless `{10,12}`, Reflect/Light Screen `{10,12}`, Safeguard `{15,20}`, Mist `{10,14}`, Protect `{2,6}`, Curse `{3,5}`, Leech Seed `{10,12}`, Decoy `{20,50}`, Taunt `{10,12}`, Invisible `{10,20}`, Blinker / Cross-Eyed / Muzzled `{10,10}`, Infatuated `{4,6}`, Perish Song `{3,3}`, Petrified `{0x7F,0x7F}` (leader: `{20,30}`), Whiffer `{1,6}`, Cower `{10,12}`. Self Curer IQ halves; Natural Cure caps at 5 (`CalculateStatusTurns`, `src/dungeon_random.c:85`).

#### (b) After acting: `DoEndOfTurnEffects_Async` (`src/dungeon_turn_effects.c:47-394`)

Called at the end of `ExecuteEntityDungeonAction_Async` for non-walk actions (`dungeon_action_execution.c:312`) and from `DisplayActions_Async` after a walk finishes (`dungeon_entity_movement.c:278`).

1. Warp Scarf roll (table `gWarpScarfActivationChances`, `dungeon_config.c:455`).
2. **Belly — leader only** (lines 79-162):

```c
s32 arrIndex = 10;
if (HasHeldItem(entity, ITEM_TIGHT_BELT))    arrIndex = 0;
if (HasHeldItem(entity, ITEM_STAMINA_BAND))  arrIndex--;
if (IqSkillIsEnabled(entity, IQ_ENERGY_SAVER)) arrIndex--;
if (HasHeldItem(entity, ITEM_DIET_RIBBON))   arrIndex++;
if (HasHeldItem(entity, ITEM_HEAL_RIBBON))   arrIndex++;
if (HasHeldItem(entity, ITEM_MUNCH_BELT))    arrIndex++;
clamp arrIndex to [0, 19]
baseBellyDecrementValue = 6554 / 65536            // "here baseBellyDecrementValue is 0.1"
decrement = 0.1 * gBellyGoDownValues[arrIndex]
if (usedLinkedMovesCounter > 1) decrement += gLinkedMovesBellyGoDownValues[usedLinkedMovesCounter];   // whole belly points
belly -= decrement
```

`gBellyGoDownValues[20]` (`dungeon_config.c:431`) = `{0,0,0,0,0,0, 0.10001, 0.25, 0.5, 0.75, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 128.0, 128.0}`.
`gLinkedMovesBellyGoDownValues[5]` (`dungeon_config.c:1051`) = `{1, 1, 1, 2, 4}` (index = number of linked moves used that turn).

| Situation | Index | Belly lost per action |
|---|---|---|
| **default** | 10 | **0.1** (belly 100 → empty after 1000 actions) |
| Stamina Band or Energy Saver | 9 | 0.075 |
| both | 8 | 0.05 |
| Tight Belt | 0 | 0 |
| one of Diet Ribbon / Heal Ribbon / Munch Belt | 11 | 0.2 |
| two of them | 12 | 0.4 |

Belly starts at `IntToFixedPoint(100)` with `maxBelly 100` (`src/dungeon_mon_spawn.c:746-747`). Messages fire when the integer part crosses **≤19** and **≤9**. At integer 0: `DealDamageToEntity_Async(entity, 1, RESIDUAL_DAMAGE_HUNGER, …)` — **1 HP per action** — and `bellyEmpty = TRUE` (which also blocks regen next slot). Three escalating alert messages (`emptyBellyAlert`).
Teammates never lose belly here. A non-leader with belly 0 refuses to move (`src/dungeon_ai_movement.c:67`) and deals 1 damage (`src/dungeon_damage.c:1125`).

3. **Weather damage** (lines 166-179): only when `gDungeon->weather.weatherDamageCounter == 0`. The counter starts at 9 and cycles 9→0 in the weather tick (`src/weather.c:289-294`), so **once every 10 turns**: Hail hits non-Ice, Sandstorm hits non-Ground/Rock/Steel, for `gHailSandstormDmgValue = 5`.
4. Shed Skin (`gShedSkinActivateChance = 50`), Speed Boost (every `gSpeedBoostActivationFrame = 250` slots).
5. Residual status damage, each with its own countdown that reloads after firing:

| Status | Every N slots | Damage |
|---|---|---|
| Burn | `gBurnDmgCountdown = 20` | `gBurnDmgValue = 5` |
| Poison | `gPoisonDmgCountdown = 10` | `gPoisonDmgValue = 4` |
| Badly poisoned | `gBadPoisonDmgCountdown = 2` | 6 (table is all 6s) |
| Constriction | 2 | 5 |
| Wrapped | 2 | 6 |
| Ingrain | 5 | heals `gIngrainHealValue = 10` |
| Curse | `gCurseDmgCountdown = 10` | `maxHP / 4` (min 1) |
| Leech Seed | 2 | 10, healed to the seeder (Liquid Ooze reverses) |

6. Perish Song countdown (9999 damage at 0 unless Protect), Bide release, Enraged expiry.

#### (c) Weather (`src/weather.c`)

- Per floor: `floorProperties.weather`; value `8` = `WEATHER_RANDOM` → `DungeonRandInt(WEATHER_COUNT)` (`weather.c:48-57`).
- IDs (`include/constants/weather.h`): 0 Clear, 1 Sunny, 2 Sandstorm, 3 Cloudy, 4 Rain, 5 Hail, 6 Fog, 7 Snow.
- Weather tick `sub_807EAA0` runs once per normal turn (step 6). Move-induced weather lasts `gMoveWeatherDuration = 20`; the highest remaining counter wins, otherwise the floor's natural weather returns (`weather.c:259-278`).
- Weather Band holder sees `WEATHER_CLEAR` (`GetApparentWeather`, `weather.c:39`).
- Effects on damage: section 6.2. Snow: Ice-types +1 speed stage.

### 1.9 Turn limit / wind (`src/dungeon_wind.c:25-85`)

- `gDungeon->unk644.windTurns = GetTurnLimit(dungeonId)` is set on dungeon start **and again for every floor** (`src/run_dungeon.c:137, 337`) — the limit is **per floor**.
- Decremented once per **leader action** (step 3), not per tick.
- Warnings (compare after decrement):

| `windPhase` | Fires when `windTurns <` | Message |
|---|---|---|
| 0 → 1 | `0xfa` = **250** | `gText_SomethingStirring` |
| 1 → 2 | `0x96` = **150** | `gText_SomethingApproaching` |
| 2 → 3 | `0x32` = **50** | `gText_ItsGettingCloser` |
| 3 → 4 | **1** (i.e. 0) | `gText_ItsRightNearbyGustingHard`, then `HandleFaint_Async(leader, DUNGEON_EXIT_BLOWN_OUT_UNSEEN_FORCE, leader)` |

- Being blown out is a *failed* run (no rescue offer: `DUNGEON_EXIT_BLOWN_OUT_UNSEEN_FORCE` is excluded in `HandleFaint_Async`, `src/dungeon_misc.c:507`).
- Limits in data (`data/dungeon/dungeon_data.json`, 98 entries): **1000** (39 dungeons), **2000** (50), 800 (5), 600 (2), 500 (1), 100 (1).

---

## 2. Floor data format

### 2.1 Per-dungeon header — `DungeonDataEntry` (`include/dungeon_data.h:14-34`), size 0x10

Table `gDungeons[]`, generated from `data/dungeon/dungeon_data.json` (`data_dungeon.mk`). Accessors in `src/dungeon_info.c:2397-2536`.

| Off | Field | Meaning |
|---|---|---|
| 0x0 | `bool8 stairDirectionUp` | true → floors print as `nF`, false → `BnF`. Cosmetic only. |
| 0x1 | `bool8 enemiesEvolveWhenKOed` | Enemy that KOs a team member evolves. "False for all dungeons, but the code still works". |
| 0x2 | `bool8 recruitingEnabled` | |
| 0x3 | `s8 rescuesAllowed` | −1 = none; 10 (59 dungeons); 30 (3). |
| 0x4 | `u8 maxItemsAllowed` | 20 almost everywhere; 0 / 3 / 10 once each. `0` wipes the bag and held items on entry (`EnforceMaxItemsAndMoney`, `run_dungeon.c:876`). |
| 0x5 | `u8 maxPartyMembers` | 3 (89), 4 (7), 1 (2). |
| 0x6 | `bool8 levelResetTo1` | 3 dungeons. |
| 0x7 | `bool8 keepMoney` | false → money set to 0 on entry. |
| 0x8 | `bool8 leaderCanSwitch` | |
| 0x9 | `bool8 hasCheckpoint` | 6 dungeons. |
| 0xA | `bool8 enterWithoutGameSave` | false → forced quicksave on entry. |
| 0xB | `u8 HMMask` | Entry requirement bits (Fly, Dive, Waterfall, Surf, Water). |
| 0xC | `s16 turnLimit` | Section 1.9. |
| 0xE | `s16 randomMovementChance` | % chance a *respawned* wild Pokémon gets `moveRandomly` (section 4.4). 50 for 77 dungeons, 0 for 13. |

**Number of floors is not in this struct** — it is `sDungeonFloorCount[]` in `src/dungeon_info.c:20-85`, and the stored value is **real floors + 1** (Tiny Woods = 4 for 3 floors). The advance test is `if (dungeonLocation.floor + 1 < gDungeon->unk1CEC8) floor++; else cleared` (`run_dungeon.c:579`). All dungeons start at floor index 0 in `sDungeonStartingFloor[]`; floors are 1-based in the tables (each per-dungeon table has a null entry prepended, `tools/dungeonjson/dungeonjson.cpp:608`).

Real header examples:

| Field | `DUNGEON_TINY_WOODS` | `DUNGEON_SKY_TOWER` | `DUNGEON_PURITY_FOREST` |
|---|---|---|---|
| floors (count−1) | 3 | 25 | 99 |
| stairDirectionUp | false | true | true |
| recruitingEnabled | false | true | false |
| rescuesAllowed | −1 | 10 | 30 |
| maxItemsAllowed | 20 | 20 | **0** |
| maxPartyMembers | 3 | 3 | **1** |
| levelResetTo1 | (false) | (false) | **true** |
| keepMoney | true | true | **false** |
| hasCheckpoint | (false) | true | (false) |
| HMMask | `0b00000000` | `0b00000001` | `0b00000000` |
| turnLimit | 1000 | 2000 | 2000 |
| randomMovementChance | 0 | 0 | 30 |

### 2.2 How a floor references its data

Runtime: `SetFloorItemMonsterSpawns` (`src/dungeon_floor_spawns.c:30-93`) opens archive file `"mapparam"` (`struct DungeonMapParam2`, `include/structs/dungeon_mapparam.h`):

```c
struct DungeonMapParam1 { s16 unk0; s16 unk2; s16 unk4; s16 unk6[5]; };   // one per (dungeon, floor)
struct DungeonMapParam2 {
    struct DungeonMapParam1 **unk0;      // [dungeonId][floor]
    FloorProperties *floorProperties;    // global array, 28 bytes each (1764 rows)
    u16 **itemSpawns;                    // global list of item sets (178)
    SpawnPokemonData **monsterSpawns;    // global list of spawn tables (839)
    u16 **trapSpawnChances;              // global list of trap sets (148)
};
```

Each floor's 8 × `s16` record (source: `data/dungeon/<Dungeon>/floor_id.json`):

| JSON key | Struct slot | Indexes into |
|---|---|---|
| `MainData` | `unk0` | global `FloorProperties` array (`data/dungeon/main_data.inc` + per-dungeon `main_data.inc`) |
| `Pokemon` | `unk2` | `DungeonPokemonFoundTable` (`data/dungeon/pokemon_found.inc`; tables in `<Dungeon>/pokemon_found.json`) |
| `Traps` | `unk4` | `DungeonTrapsFoundTable` (`data/dungeon/trap_data.json`, sets `trap_found_outN`) |
| `Items` | `unk6[0]` = `ITEM_SPAWN_NORMAL` | `DungeonItemsFoundTable` (`data/dungeon/dungeon_item_data.json`, sets `items_found_outN`) |
| `KecleonShop` | `unk6[1]` = `ITEM_SPAWN_IN_SHOP` | same list |
| `MonsterRoomItems` | `unk6[2]` = `ITEM_SPAWN_IN_MONSTER_HOUSE` | same list |
| `BuriedItems` | `unk6[3]` = `ITEM_SPAWN_WALL` | same list |
| (always 0) | `unk6[4]` | unused |

All indexes are **global**, so floors and dungeons share tables freely (every floor of Tiny Woods uses shop set 1, monster-house set 2, buried set 3).

Mazes: `GeneralizeMazeDungeonLoc` remaps every training maze to `DUNGEON_NORMAL_MAZE` with `floor = (id - DUNGEON_NORMAL_MAZE_2) * 3 + floor` (`dungeon_info.c:2467`).

### 2.3 Per-floor properties — `FloorProperties` (`include/structs/str_dungeon.h:121-151`), size 0x1C

| # | Field | Meaning (struct comments quoted where given) |
|---|---|---|
| 0 | `u8 layout` | Layout generator id (other researcher). |
| 1 | `s8 roomDensity` | "If positive, allow variance. If negative, use exact value of abs(roomDensity)." |
| 2 | `u8 tileset` | Also drives Camouflage type, Nature Power, Secret Power, water-vs-lava. |
| 3 | `u8 bgMusic` | Index into `gDungeonMusic`. |
| 4 | `u8 weather` | 0-7, or 8 = random. |
| 5 | `u8 floorConnectivity` | Layout. |
| 6 | `u8 enemyDensity` | Initial enemy count (section 3.2). 0 = no wild Pokémon at all (also disables respawn). |
| 7 | `u8 kecleonShopChance` | % |
| 8 | `u8 monsterHouseChance` | % |
| 9 | `u8 mazeRoomChance` | % |
| 10 | `u8 itemStickyChance` | % per generated item (section 5.2). Only 0 or 5 in data. |
| 11 | `bool8 allowDeadEnds` | Layout. |
| 12 | `u8 secondaryStructuresBudget` | Layout. |
| 13 | `u8 roomFlags` | `ROOM_FLAG_ALLOW_SECONDARY_TERRAIN 0x1`, `ROOM_FLAG_ALLOW_IMPERFECTIONS 0x4`. |
| 14 | `bool8 unkE` | "Unreferenced flag". |
| 15 | `u8 itemDensity` | Section 5.1. |
| 16 | `u8 trapDensity` | Section 5.5. |
| 17 | `u8 floorNumber` | "Unreferenced". |
| 18 | `u8 fixedRoomNumber` | Non-zero = scripted/boss floor. |
| 19 | `u8 numExtraHallways` | Layout. |
| 20 | `u8 buriedItemDensity` | Items inside walls. |
| 21 | `u8 standaloneLakeDensity` | Layout. |
| 22 | `u8 visibilityRange` | Darkness level, section 8. Only `& 3` is used. |
| 23 | `u8 moneyUpperBound` | Poké stacks capped at this × 40. |
| 24 | `u8 kecleonShopLayout` | Index into `sKecleonShopItemSpawnChances[16][3][3]` (all 16 entries identical). |
| 25 | `u8 itemlessMonsterHouseChance` | "always 0" (confirmed: 0 on all 1764 rows). |
| 26-27 | `unk1A`, `unk1B` | "Unreferenced (always 0)". |

Value ranges over all 1764 rows (decoded from the data): `visibilityRange` 0 ×623 / 1 ×480 / 2 ×661; `enemyDensity` 0, 3-10, and 255 (×285, fixed/boss rows); `monsterHouseChance` mostly 0, 5, 6, 7 (up to 100 on 8 rows); `kecleonShopChance` mostly 0, 3, 7, 8; `itemDensity` 0-7 (mostly 4-5); `trapDensity` 0-25 (mostly 3-15); `moneyUpperBound` 1-50 (mostly 7 and 12); `weather` 0 ×1547, 8 (random) ×152.

### 2.4 Encodings of the three list types

**Pokémon spawn table** (`tools/dungeonjson/dungeonjson.cpp:259-295`): entries of 4 × `u16`:
`{ species + level*512, cumProb, cumProb, 0 }`, terminated by `{0,0,0,0}`. JSON `probability` is the entry's own weight; the tool writes the **running total** (out of 10000). An entry with `probability: 0` is written as `0, 0` and can never be rolled. Max 32 entries (`MONSTER_SPAWNS_ARR_COUNT`). The two probability words are `randNum[0]` (normal spawns) and `randNum[1]` (monster house); the tool always writes the same number to both.

**Trap set**: 20 × `u16` cumulative thresholds out of 10000, in `enum TrapID` order; 0 = absent.

**Item set**: run-length-encoded list of `NUM_ITEM_CATEGORIES (12)` category thresholds followed by `NUMBER_OF_ITEM_IDS` item thresholds. A word `>= ITEM_SETS_SKIP_NUMBER (30000)` means "skip (word − 30000) zero entries". Category thresholds are cumulative across categories; item thresholds are cumulative **within their own category** (`dungeonjson.cpp:505-597`, decoder `dungeon_floor_spawns.c:63-90`).

### 2.5 Three real floors

**Tiny Woods B1F** — `data/dungeon/TinyWoods/floor_id.json` → `{MainData 0, Pokemon 0, Traps 0, Items 0, KecleonShop 1, MonsterRoomItems 2, BuriedItems 3}`

- `FloorProperties` row 0 (bytes `01 05 0e 01 00 0f 04 00 00 00 00 00 00 00 00 02 00 01 00 05 00 00 00 01 01 00 00 00`): layout 1, roomDensity 5, tileset 14, bgMusic 1, weather 0, floorConnectivity 15, **enemyDensity 4**, kecleonShopChance 0, monsterHouseChance 0, mazeRoomChance 0, itemStickyChance 0, allowDeadEnds 0, **itemDensity 2**, **trapDensity 0**, floorNumber 1, fixedRoomNumber 0, numExtraHallways 5, buriedItemDensity 0, **visibilityRange 0**, **moneyUpperBound 1** (max 40 Poké), kecleonShopLayout 1.
- Pokémon `TinyWoods1F_2F_Pokemon`: Pidgey Lv1 3333, Sunkern Lv1 3334, Wurmple Lv1 3333, Kecleon Lv90 0, Decoy Lv1 0.
- Traps `trap_found_out0`: Wonder Tile 10000 (irrelevant, density 0).
- Items `items_found_out0` ("Lost Woods B1F"): `CATEGORY_POKE` 10000 → `ITEM_POKE` 10000. Floor 1 only ever drops money.

**Sky Tower 13F** — `{MainData 165, Pokemon 102, Traps 0, Items 42, KecleonShop 37, MonsterRoomItems 2, BuriedItems 3}`

- Props: layout 11, roomDensity 5, tileset 35, bgMusic 13, weather 0, floorConnectivity 50, **enemyDensity 4**, kecleonShopChance 0, **monsterHouseChance 5**, itemStickyChance 0, allowDeadEnds 1, roomFlags 1, **itemDensity 4**, **trapDensity 4**, numExtraHallways 0, **visibilityRange 0**, **moneyUpperBound 8** (max 320), kecleonShopLayout 7.
- Pokémon `SkyTower_12F_14F_Pokemon`: Koffing Lv24 2051, Ledian Lv24 1795, Altaria Lv24 2051, Solrock Lv24 2052, Duskull Lv27 2051 (+ Kecleon Lv90 0, Decoy 0).
- Traps `trap_found_out0`: Wonder Tile 10000 → every "trap" on this floor is a Wonder Tile.
- Items `items_found_out42` ("Sky Tower 4F-25F"): THROWN_LINE 1235, FOOD_GUMMIES 2469, HELD_ITEMS 987, TMS_HMS 741, POKE 4321, LINK_BOX 247.

**Purity Forest 60F** — `{MainData 1723, Pokemon 809, Traps 142, Items 174, KecleonShop 169, MonsterRoomItems 170, BuriedItems 57}`

- Props: layout 0, roomDensity 8, tileset 60, bgMusic 10, weather 0, floorConnectivity 15, **enemyDensity 6**, **kecleonShopChance 8**, **monsterHouseChance 6**, mazeRoomChance 1, **itemStickyChance 5**, allowDeadEnds 1, **itemDensity 5**, **trapDensity 10**, numExtraHallways 15, standaloneLakeDensity 40, **visibilityRange 1**, **moneyUpperBound 12** (max 480), kecleonShopLayout 15.
- Pokémon `PurityForest_60F_Pokemon`: Arbok Lv21 1481, Rhyhorn Lv16 1482, Ditto Lv25 370, Magcargo Lv21 1482, Piloswine Lv16 1481, Mightyena Lv17 1111, Swablu Lv18 1112, Snorunt Lv20 1481 (+ Kecleon Lv90 0, Decoy 0).
- Traps `trap_found_out142`: Mud 2454, Sticky 1227, Grimy 368, Summon 491, Spin 307, Slumber 490, Slow 369, Seal 920, Poison 307, Explosion 613, PP-Zero 1227, Wonder Tile 920, Pokémon Trap 307.
- Items `items_found_out174` ("Purity Forest 60F-99F"): THROWN_LINE 329, THROWN_ARC 460, BERRIES_SEEDS_VITAMINS 2698, FOOD_GUMMIES 1316, HELD_ITEMS 394, TMS_HMS 527, POKE 2500, ORBS 1644, LINK_BOX 132.

(The three floors above were decoded from the decomp's `data/dungeon` JSON with a small throwaway script; it is not kept.)

---

## 3. Enemy spawning

### 3.1 Choosing species and level (`src/dungeon_floor_spawns.c:185-214`)

```c
s16 GetRandomFloorMonsterId(s32 arrId)          // arrId 0 = normal, 1 = monster house
{
    s32 rand = DungeonRandInt(10000);
    for (i = 0; i < currFloorMonsterSpawnsCount; i++)
        if (monsterSpawns[i].randNum[arrId] != 0 && monsterSpawns[i].randNum[arrId] >= rand)
            return ExtractSpeciesIndex(&monsterSpawns[i]);
    for (i = 0; i < currFloorMonsterSpawnsCount; i++)            // fallback: first non-zero entry
        if (monsterSpawns[i].randNum[arrId] != 0) return ExtractSpeciesIndex(&monsterSpawns[i]);
    return MONSTER_KECLEON;
}
```

- Weighted pick over cumulative thresholds out of 10000.
- **Level is fixed per table entry** (`GetSpawnedMonsterLevel`): no randomisation. Level 0 → 1.
- Stats come from summing the species' level-up table from base (`CalcSpeciesHPAtLevel` etc., `src/dungeon_mon_spawn.c:1015-1058`); moves from `sub_8072AC8` (level-up learnset; not traced). Results are cached per (species, level) in `gDungeon->unk2F3C[64]`.
- Wild monsters get `IQ = 1`, default IQ skills (Item Catcher, Course Checker, Item Master), `belly 100`, and `expMultiplier = EXP_HALVED` (`dungeon_mon_spawn.c:741, 900`).
- `sub_806AA0C` (`src/dungeon_misc.c:1620`) vetoes locked "exclusive" species, a second Deoxys, and Mew outside its special case.

### 3.2 Initial count (`src/dungeon_generation.c:4418-4492`)

```c
if (enemyDensity > 0) {
    numEnemies = DungeonRandRange(enemyDensity / 2, enemyDensity);   // upper bound exclusive
    if (numEnemies < 1) numEnemies = 1;
} else {
    numEnemies = abs(enemyDensity);     // "Negative means exact value" — but see the BUG comment
}
```

Source comment: "BUG: Game assumes floorProps->enemyDensity is a signed byte, but in reality it's unsigned." So density 4 → 2 or 3 enemies; density 6 → 3-5; density 10 → 5-9.
Valid tiles: normal floor, **in a room** (not corridor), not a shop, no item, no stairs, not a room-exit junction, not unbreakable, not the player's spawn tile. Positions are shuffled; `SpawnWildMonsOnFloor` (`dungeon_mon_spawn.c:440`) then rolls a species for every flagged tile.

If the floor is flagged `forceMonsterHouse`, extra spawns are placed in that room: `DungeonRandRange(7*count/10, 8*count/10)` of its valid tiles, capped at `(gMonsterHouseMaxMons * 3) / 2 = 18` (`dungeon_generation.c:4501-4545`).

### 3.3 Asleep vs awake (`src/dungeon_mon_spawn.c:517-523`)

```c
if (!monSpawnInfo->unk2 && !a1 && !monSpawnInfo->unk10) {
    s32 rand = DungeonRandInt(100);
    if (GetChanceAsleep(monSpawnInfo->species) > rand) {
        sub_8075BF4(entity, 0x7F);      // sleep with turns = 0x7F = indefinite
```

- `chanceAsleep` is per species (`data/monster/monster_data.json`): **8** for 344 of 424 species; 0 (43), 15 (10), 5 (8), 100 (6), 10 (5), 20 (3), 25 (3).
- Applies to both initial spawns and timer respawns. Not applied to Summon-Trap / Pokémon-Trap spawns (`a1 == TRUE`) or Monster House drops (`unk10 == 1`).
- Indefinite sleep ends when (`TryWakeSleepingWildPokemon`, `src/dungeon_monster_house.c:34`, run after every movement batch): a team member without a Sneak Scarf is within 1 tile (Chebyshev), or a team member holding a Racket Band is in the same room. Any damage also wakes it (`dungeon_damage.c:279-283`).

### 3.4 Respawn timer (`TrySpawnWildMonster`, `src/dungeon_wild_mon_spawn.c:22-111`)

Called once per normal turn.

```
if enemyDensity == 0: return
wildMonSpawnFrames++
if wildMonSpawnFrames < (stoleFromKecleon ? gKecleonSpawnIntervalFrames : gWildSpawnIntervalFrames): return
wildMonSpawnFrames = 0
count = wild monsters not standing on TERRAIN_TYPE_UNBREAKABLE
if !stoleFromKecleon:
    if (gDungeon->monsterHouseRoom == CORRIDOR_ROOM) { if (count >= gMaxWildMonsInMonsterHouse) return; }
    else                                             { if (count >= gMaxWildMonsInRoom) return; }
species = stoleFromKecleon ? MONSTER_KECLEON : GetRandomFloorMonsterId(0)
level   = GetSpawnedMonsterLevel(species)
if sub_806AA0C(species, 0) && sub_8083660(&pos):
    moveRandomly = DungeonRandInt(100) < GetRandomMovementChance(dungeonId)
    SpawnWildMon(...)
```

Constants (`src/dungeon_config.c:20-26`):

| Constant | Value | Note |
|---|---|---|
| `gWildSpawnIntervalFrames` | **36** | despite the name, counted in **turns** |
| `gKecleonSpawnIntervalFrames` | **5** | after stealing; also **no cap** |
| `gMaxWildMonsInMonsterHouse` | **10** | cap used when `monsterHouseRoom == CORRIDOR_ROOM` |
| `gMaxWildMonsInRoom` | **4** | cap used otherwise |

`CORRIDOR_ROOM` is `0xFF`, and `monsterHouseRoom` is initialised to `0xFF` and only set when a monster house is generated (`dungeon_generation.c:258, 3351, 4136`). Read literally: **a floor with no monster house caps at 10 wild Pokémon; a floor that has a monster house caps at 4.** The constant names suggest the opposite intent; see section 9.

If the timer fails on the cap, the counter has already been reset, so the next attempt is another 36 turns away. Illuminate sets `wildMonSpawnFrames = 999` when its holder is hit (`dungeon_move.c:1364`), forcing a spawn next turn.

**Where** (`sub_8083660`, `src/dungeon_range.c:230-313`) — three passes, first one with any candidate wins, uniform choice among candidates:

1. normal floor, in a room, no object, no monster, and `abs(dx) >= 6 || abs(dy) >= 6` from the leader;
2. same without the distance test;
3. same without the room test (corridors allowed).

So respawns appear in rooms, at least 6 tiles from the leader on one axis — which can be inside the leader's own room if it is large.

### 3.5 Monster Houses (`src/dungeon_monster_house.c:78-183`, config `dungeon_config.c:20-22`)

- Whether a floor has one, and which room, is decided by generation (`monsterHouseChance`). The room's tiles carry `TERRAIN_TYPE_IN_MONSTER_HOUSE`.
- **Trigger**: after any *team member* (not only the leader) finishes a step onto such a tile, and at floor start for the leader's spawn tile (`TryTriggerMonsterHouseWithMsg_Async`, `dungeon_entity_movement.c:469`; `run_dungeon.c:447`). Once per floor (`monsterHouseTriggered`).
- **Spawn area**: room tiles within x ∈ [pos−4, pos+4], y ∈ [pos−4, pos+4] of the triggering Pokémon (clipped to the room), that are empty normal floor in the house; max 100 candidates.
- **Count**: `DungeonRandRange(gMonsterHouseMinMons, gMonsterHouseMaxMons)` = `DungeonRandRange(8, 12)` → **8-11**, capped by candidate count.
- Species: `GetRandomFloorMonsterId(1)`; they drop from the ceiling awake (`unk10 = 1` skips the sleep roll).
- Items/traps placed in the house at generation: `DungeonRandRange(count/2, count*8/10)`, minimum 6, capped at `gMonsterHouseMaxItemsTraps = 7`; each is 50/50 item or trap (`dungeon_generation.c:4267-4300`), items use the `MonsterRoomItems` set.
- IQ skill House Avoider stops AI allies from stepping in before it is triggered (`dungeon_logic.c:928`).

---

## 4. Enemy AI

Entry point: `RunMonsterAI` (`src/dungeon_ai.c:34-152`). The same code drives teammates; differences are noted.

### 4.1 Decision order

```
if useHeldItem pending: AIDecideUseItem → return if it chose something
if HasStatusThatPreventsActing(mon): return           // sleep, frozen, wrap, petrified, paused, infatuated, bide,
                                                      // decoy (random walk), shopkeeper (never acts),
                                                      // blinker (walk forward / random), cross-eyed (random walk)
note any visible Decoy
ClearMonsterActionFields
if rescue-target client: random-direction walk
AIDecideUseItem(mon)                                  // src/dungeon_ai_items.c
if still no action:
    ChooseAIMove(mon)                                 // attack if something is in range   (4.2)
    if an attack was chosen: return
    if CONFUSED: walk (direction randomised at execution)
    else if species can move: AIMovement(mon, TRUE)   // (4.3)
```

(With IQ Dedicated Traveler the order is movement first, then attack.) **Attack takes priority over movement**: a wild Pokémon moves only when `ChooseAIMove` found nothing usable.

### 4.2 Move selection (`ChooseAIMove`, `src/dungeon_ai_attack.c:53-339`)

Bail-outs: `CannotAttack`, should-run-away, tactic Keep Your Distance, or confused and `DungeonRandOutcome(gAIConfusedAttackChance)` (**70** % chance to *skip* attacking).

```
if all moves have 0 PP: use Struggle if it has a target; return
for each of the 4 moves that exists, is enabled for AI and CanAIUseMove:
    weight[i] = GetMoveAIWeight(move)                 // per-move data field aiWeight
weight[REGULAR_ATTACK_INDEX = 4] = gAiRegularAttackWeights[numUsableMoves]
total = sum of weights
r = DungeonRandInt(total)
walk the 5 slots accumulating weights; first slot with (running >= r):
    regular attack → use it if an enemy is adjacent (TargetRegularAttack)
    move           → AIConsiderMove(); if it has a valid target use it, else STOP considering moves
fallback: regular attack if an enemy is adjacent, else no attack
```

`const s16 gAiRegularAttackWeights[5] = {100, 20, 30, 40, 50};` (`dungeon_config.c:90`) indexed by the number of AI-enabled moves. Sample `aiWeight` values (`data/move/move_data.json`): Tackle 25, Ember 20, Bubble 10, Flamethrower 10, Earthquake 20, Growl 10, Sky Attack 15, Struggle 30.

Example — monster with Tackle (25) + Growl (10): regular attack weight `[2] = 30`, total 65 → Tackle 38 %, Growl 15 %, regular attack 46 %. Important consequence of the "STOP" rule: **if the rolled move has no valid target the AI does not re-roll**, it falls back to the regular attack (if adjacent) or to moving.

Note the comparison is `weightCounter >= randomWeight` with `randomWeight ∈ [0, total-1]`, which biases slightly toward earlier slots (slot 0 wins on `r ≤ w0`, i.e. `w0 + 1` values).

**`AIConsiderMove`** (`dungeon_ai_attack.c:341-533`) finds targets using the move's **AI** targeting flags (`aiTargetingFlags`, which can differ from the player's — e.g. Earthquake is room-wide for the player but front-only for the AI; Growl is room for the player, 2-tiles-ahead for the AI):

| AI range (high nibble) | Candidates |
|---|---|
| `0x00` front, `0x10` cone, `0x20` around | the 8 adjacent tiles (front-only also needs `CanAttackInDirection`, i.e. no corner cutting) |
| `0x30` room | every monster with `CanSeeTarget` |
| `0x40` two tiles ahead | adjacent tile, else the tile 2 away, in each of 8 directions |
| `0x50` line / `0x80` cut-corners | targets exactly on one of the 8 lines, within range **10** (line) or **1** (cut-corners), visible, and path clear (Course Checker, a default skill) |
| `0x60` floor | everyone |
| `0x70` self | self |

One candidate per direction. Eligibility (`IsAITargetEligible`, lines 608-718): low nibble says enemies / allies / everyone / all-but-user / teammates / self; bits `0xF00` add a condition — `AI_CONDITION_RANDOM` (roll `aiConditionRandomChance`, 75 for most moves), HP ≤ 25 %, has negative status, asleep, unexposed Ghost. Target weights are all 1 for wild monsters (the weighting IQ skills only apply against non-team targets), so the direction is uniform among candidates.

`RANGED_ATTACK_RANGE` is used as a hard cap in `IsTargetInLineRange` (line 542); its `#define` was not read — line moves pass `range = 10`.

### 4.3 Movement (`AIMovement`, `src/dungeon_ai_movement.c`)

```
if tactic Wait There → nothing
if non-leader with belly 0 → nothing
if ShouldMonsterRunAwayAndShowEffect → AvoidEnemies()
else if standing on an item and can take it → ACTION_PICK_UP_AI    // wild: needs empty held slot, not in a wall, not a shop item
else ChooseTargetPosition()
then DecideMovement()
```

**`ChooseTargetPosition`** (lines 142-308), for a wild monster:

1. Scan the 4 team slots. A team member is a valid target if `CanTargetEntity(mon, target)` (4.4). Wall-crossers (`CanCrossWalls`) skip the sight test when the target is within `CHECK_VISIBILITY_DISTANCE 5` on both axes. Shopkeepers are never targets. Pick the **nearest** (`GetDistance`); stop early at distance < 2.
   → `aiObjective = AI_CHASE_TARGET`, target position = target's tile, `moveRandomly = FALSE`.
2. Otherwise, if it was chasing (`AI_CHASE_TARGET` / `AI_CHASE_REMEMBERED_TARGET`) and that entity still exists: look through the target's last `NUM_PREV_POS 4` positions and head for the first one it can see → `AI_CHASE_REMEMBERED_TARGET`. This is the "follows you around a corner" behaviour — **memory is the target's 4 most recent tiles**. If the target is gone → `AI_STAND_STILL`.
3. Otherwise `Wander()`.

**`DecideMovement`** (lines 310-445): `direction = GetDirectionTowardsPosition(pos, targetPos)`; if legal (`CanAIMonsterMoveInDirection`: no impassable wall, corner rule, tile empty) walk there. If blocked, try in order **left 45°, right 45°, left 90°, right 90°** (plus left 135° when fleeing), using `gFaceDirectionIncrements`. If nothing works → `ACTION_PASS_TURN`. There is no pathfinding: it is greedy step-toward-target with sidesteps.

### 4.4 Vision

Two different sight tests exist (`src/dungeon_range.c:16-70`):

| Function | Used by | In a room | In a corridor |
|---|---|---|---|
| `IsPositionInSight` (via `CanTargetEntity`, `CanTargetPosition`) | **AI chase targeting** | target inside the room rectangle expanded by 1 tile on every side | Chebyshev distance ≤ **2**, hard-coded; at exactly 2 the straight path between must be non-wall both ways (`IsPositionWithinTwoTiles`) |
| `IsPositionActuallyInSight` (via `CanSeeTarget`) | room-range moves, AI ranged-move checks, `AvoidEnemies`, recruiting, **what the player sees** | same expanded room rectangle | `abs(dx) <= v && abs(dy) <= v`, `v = GetVisibilityRange()` |

`GetVisibilityRange()` (`include/dungeon_range.h:9`): the floor's `visibilityRange`, with `0 → 2`. So `v` is 1 on dark floors, 2 otherwise. `CORRIDOR_VISIBILITY 2` (`dungeon_ai_movement.c:26`).

Both tests are evaluated **from the observer's tile**: a monster in a room sees the whole room plus the 1-tile ring (which includes corridor mouths); a monster in a corridor sees 2 tiles. Blinker blocks sight; invisible targets are unseen unless the observer can see invisibles.

### 4.5 Wandering (`Wander`, `src/dungeon_ai_movement.c:623-727`)

- **In a corridor**: keep going. Try directions in the order of `gFaceDirectionIncrements` starting from the current facing. At a junction (`IsAtJunction`: the open-neighbour mask is one of `0x54, 0x51, 0x45, 0x15, 0x55`, i.e. T or + shapes) pick a uniformly random facing first and never choose the direction it came from. → `AI_ROAM`.
- **In a room**:
  - `moveRandomly` set → step to a random adjacent tile every turn (`AI_STAND_STILL` objective). Set at spawn for timer respawns with probability `randomMovementChance` (initial floor spawns always get 0, `dungeon_mon_spawn.c:480`); cleared for good the first time the monster targets someone.
  - otherwise, if not already leaving: pick a random room exit from `naturalJunctionList[room]` that is not the tile it stands on (10 tries) → `AI_LEAVE_ROOM` and walk to it. On an exit tile, step into the adjoining corridor (`AI_ROAM`).
  - room with no exits → random adjacent step.

So an unaware wild Pokémon patrols: room → random exit → follow corridor → next room.

### 4.6 Fleeing

`ShouldMonsterRunAway` (`src/dungeon_logic.c:1056-1088`):

```c
if (pokemonInfo->terrifiedTurns != 0) return TRUE;
if (pokemonInfo->isTeamLeader) return FALSE;
if (AbilityIsActive(pokemon, ABILITY_RUN_AWAY)) {
    bool8 runAwayActive = pokemonInfo->HP < pokemonInfo->maxHPStat / 2;
    if (runAwayActive) return TRUE;
}
if (IsTacticSet(pokemon, TACTIC_GET_AWAY) ||
    (IsTacticSet(pokemon, TACTIC_AVOID_TROUBLE) && pokemonInfo->HP <= pokemonInfo->maxHPStat / 2)) return TRUE;
return FALSE;
```

**There is no general "flee at low HP" for wild Pokémon.** A wild monster flees only if it has the **Run Away ability and HP < 50 %**, or is terrified (Stench: `gStenchTerrifiedTurnsNo = 3`, and similar effects). Tactics are a teammate feature. A fleeing monster does not attack at all (`ChooseAIMove` bails).

`AvoidEnemies` (lines 449-621): find the nearest visible enemy; if in the same room, head for the room exit farthest from that enemy among exits that do not bring it closer; on an exit tile step out; otherwise move directly away (`pos - (enemy - pos)`). If no enemy is visible → `Wander`.

### 4.7 Friend / foe table

`GetTreatmentBetweenMonsters` (`src/dungeon_logic.c:1113`): team vs wild = enemy; same side = ally; shopkeepers (while in shopkeeper mode), rescue clients and the cutscene Diglett are `TREATMENT_IGNORE`. A Decoy overrides this per `gTreatmentData[3][2][2][2]`.

---

## 5. Items and traps

### 5.1 How many items (`src/dungeon_generation.c:4177-4241`)

- Floor items: `n = itemDensity`; if non-zero `n = DungeonRandRange(n - 2, n + 2)` (→ `n-2 … n+1`), minimum 1. Density 0 → none.
- Buried items (in walls): `DungeonRandRange(d - 2, d + 2)`, none if ≤ 0.
- Monster-house items: section 3.5. Shop stock: section 5.3.

### 5.2 Rolling an item (`GetRandomFloorItem`, `src/dungeon_floor_spawns.c:107-129`)

```c
s32 rand = DungeonRandInt(ITEM_SETS_RANDOM_CAP + 1);          // 0..9999
u8 category = NUM_ITEM_CATEGORIES;
for (i = 0; i < NUM_ITEM_CATEGORIES; i++)
    if (categoryValues[i] != 0 && categoryValues[i] >= rand) { category = i; break; }
if (category == NUM_ITEM_CATEGORIES) return ITEM_POKE;

rand = DungeonRandInt(ITEM_SETS_RANDOM_CAP + 1);
for (i = 0; i < NUMBER_OF_ITEM_IDS; i++)
    if (itemValues[i] != 0 && GetItemCategory(i) == category && itemValues[i] >= rand) return i;
return ITEM_POKE;
```

Two independent rolls: **category first, then item within the category**. Which set is used depends on the tile (`CreateFloorItems`, `src/dungeon_items.c:86-143`): shop tile → `ITEM_SPAWN_IN_SHOP`; wall tile → `ITEM_SPAWN_WALL`; monster-house tile → `ITEM_SPAWN_IN_MONSTER_HOUSE`; else `ITEM_SPAWN_NORMAL`.

Categories (`include/constants/item.h:12-24`): 0 `THROWN_LINE` (spikes/thorns/sticks), 1 `THROWN_ARC` (Gravelerock, Geo Pebble), 2 `BERRIES_SEEDS_VITAMINS`, 3 `FOOD_GUMMIES`, 4 `HELD_ITEMS`, 5 `TMS_HMS`, 6 `POKE`, 7 `CATEGORY_7`, 8 `OTHER`, 9 `ORBS`, 10 `LINK_BOX`, 11 `USED_TM`.

**Money stacks** (`sub_8046CE4`, `src/dungeon_items.c:707-721`): `rand = DungeonRandInt(100)`; while `gUnknown_810A3F0[rand] > moneyUpperBound * 40`, `rand /= 2`. The stored quantity is the index; the amount is the lookup (`src/dungeon_data.c:112`, 100 entries from 4 … 998, 1000, 1100, 1300, 1500, 20000).

**Sticky items** (`CreateItemWithStickyChance`, `src/dungeon_items.c:59-84`): for non-"special" items, `DungeonRandInt(100) < floorProperties.itemStickyChance` → `ITEM_FLAG_STICKY`. Only 0 % or 5 % appear in the data (5 % on 413 of 1764 rows).
Sticky Trap makes one random non-sticky bag/held item sticky (5.6). Effects of the flag found in code: a sticky held item cannot be taken off (`dungeon_action_handler.c:217`), cannot be swapped or thrown (`:352, 405, 465, 470`), and Reviver Seed / Reviver Orb / Possess Orb checks require `!ItemSticky` (`dungeon_damage.c:512, 547, 607`). The "can't use, it's sticky" path for eating/using is in `src/dungeon_item_action.c:816` (not read in full).

Item flags (`include/structs/str_items.h:76-80`): `EXISTS 1`, `IN_SHOP 2`, `UNPAID 4`, `STICKY 8`, `SET 16`.

Pick-up: the leader picks up automatically on stepping (`CheckLeaderTile` → `TryLeaderItemPickUp_Async`), unless the item is `IN_SHOP`. Teammates and **wild Pokémon also pick up** an item they step on if their held slot is empty (`CheckEntityTileForInteraction`, `dungeon_entity_movement.c:442-457`); a wild holder drops it when it faints (`dungeon_damage.c:654`).

### 5.3 Kecleon shops (brief)

- Existence/room: generation, `kecleonShopChance`. Each tile of the 3×3 template gets an item with the chance in `sKecleonShopItemSpawnChances[layout][y][x]` (`dungeon_config.c:612`): all 16 layouts are `{57,57,57},{100,57,100},{57,57,57}`. Stock comes from the floor's `KecleonShop` item set; non-"shoppable" items lose the shop flag.
- Shopkeeper: the spawn table's **Kecleon Lv 90** entry (`probability 0`, so never a random spawn), flagged `shopkeeper = 1` (`dungeon_mon_spawn.c:711-717`). In shopkeeper mode it never acts and cannot be targeted.
- Bookkeeping in `unkDungeon644`: `unk48`/`unk50` track the value taken vs owed, `unk4C` the value of player items laid on shop tiles. `sub_807EC28` (`src/dungeon_kecleon_shop.c:39`) runs on every leader step: entering greets; **leaving a shop tile with unpaid goods** → Kecleon warps adjacent and asks for payment; laid-down items → offers to buy.
- **Theft** (`sub_807F33C`, lines 311-353) happens if you decline/cannot pay and are off shop tiles, or leave while Kecleon cannot reach/see you: `stoleFromKecleon = 1`; every `IN_SHOP` flag is cleared; every monster's `shopkeeper` field is zeroed (shopkeepers become ordinary enemies) and speeds are recalculated — hostile Kecleon get **+1 speed stage** (`CalcSpeedStage`); respawns become **Kecleon every 5 turns with no cap** (3.4).
- Attacking a shopkeeper also turns it hostile (`SetShopkeeperAggression`, `dungeon_damage.c:1456`).
- While a thief: no rescue offer on fainting, and on defeat `AllItemsToPlainSeed()` (`run_dungeon.c:540`). Reaching the next floor counts as a success (`IncrementThievingSuccesses`). Leader switching is refused while holding unpaid items or after stealing (`dungeon_main.c:1038-1043`).
- Prices are in the item data (`data_item.mk`), not traced here.

### 5.4 Trap list and weights (`GetRandomFloorTrap`, `src/dungeon_floor_spawns.c:95-105`)

```c
s32 rand = DungeonRandInt(10000);
for (i = 0; i < NUM_TRAPS; i++)
    if (gDungeon->trapSpawnChances[i] != 0 && gDungeon->trapSpawnChances[i] >= rand) return i;
return TRAP_CHESTNUT_TRAP;
```

Count (`dungeon_generation.c:4335-4342`): `DungeonRandRange(trapDensity / 2, trapDensity)`, capped at 56. `CanLayTrap`-style placement rules: in a room, normal floor, not stairs, not a room-exit junction, not a shop.

### 5.5 Hidden vs revealed

- At generation (`sub_807FA18`, `src/trap.c:42-78`): **Wonder Tiles are visible** (`isVisible = TRUE`, owner byte 2); **every other trap is hidden** (owner byte 0).
- `Trap.unk1` (owner): 0 = natural, 1 = laid to hit wild Pokémon, 2 = laid to hit the team / Wonder Tile.
- Who triggers what:

| Stepper | natural (0) | owner 1 | owner 2 |
|---|---|---|---|
| Leader (`CheckLeaderTile`, `dungeon_main.c:949-969`) | **always**, hidden or not | no | yes |
| Teammate (`TryInteractWithTile`, `dungeon_entity_movement.c:365-390`) | only if the trap is **already visible** | no | yes |
| Wild Pokémon | **never** | yes | no |

- Revealing: stepping on it (`TryTriggerTrap` sets `isVisible = TRUE`); the leader's **regular attack reveals a trap on the tile in front** (`UseTemporaryMove` → `sub_807FE44`, `dungeon_action_handler.c:810-817`); room/radius reveal effects (`sub_807D3CC`, `src/expose_trap.c`); IQ Trap Seer reveals instead of triggering; `showInvisibleTrapsMonsters` shows all.
- Misfire (`trap.c:286-306`): Trap Scarf holder → never triggers. Otherwise a trap that was **hidden** when stepped on has a **15 %** chance to do nothing (`else if (rand < 0xf)`); an already-visible trap never misfires (`if (rand < 0)`). Wonder Tiles are exempt from this roll.
- Traps are shown on screen and the minimap only when visible.

### 5.6 Trap effects (`src/trap.c`, `enum TrapID` in `include/constants/trap.h`)

| ID | Trap | Effect |
|---|---|---|
| 0 | Trip Trap | Victim's held item is knocked onto a nearby tile. |
| 1 | Mud Trap | 25 % each: −1 stage Attack / Sp. Attack / Defense / Sp. Defense. |
| 2 | Sticky Trap | One random non-sticky item (leader: bag + held; others: held) becomes sticky. Blocked by held item id `0xe`. |
| 3 | Grimy Trap | Each food-category item (bag + held) has `gGrimyTrapActivateChance = 30` % to become Grimy Food. |
| 4 | Summon Trap | `DungeonRandInt(3) + 2` = 2-4 wild Pokémon appear on adjacent tiles (floor spawn table, awake); trap is consumed. Nothing on fixed floors. |
| 5 | Pitfall Trap | Leader: `gPitfallTrapDmgValue = 5` damage and falls to the next floor. Anyone else: removed (`HandleFaint_Async … DUNGEON_EXIT_FELL_INTO_PITFALL`). Nothing on fixed floors. |
| 6 | Warp Trap | Random warp on the floor. |
| 7 | Whirlwind (Gust) Trap | Blown away in a random direction (`BlowAwayTarget`, `gBlowAwayDmgValue = 5`). |
| 8 | Spin Trap | Confused. |
| 9 | Slumber Trap | Sleep, `gSleepTurnRange {3,7}`. |
| 10 | Slow Trap | −1 speed stage. |
| 11 | Seal Trap | One random unsealed move is sealed (blocked by Safeguard). |
| 12 | Poison Trap | Poisoned. |
| 13 | Selfdestruct Trap | `HandleExplosion(…, 1, …)` — small blast. |
| 14 | Explosion Trap | `HandleExplosion(…, 2, …)` — large blast. Radius/damage are in `src/explosion.c` (not read). |
| 15 | PP-Zero Trap | One random move with PP > 0 goes to 0 PP. |
| 16 | Chestnut Trap | `gChestnutTrapDmgValue = 10` damage. Also the fallback trap. |
| 17 | Wonder Tile | `sub_8079E34` — by its use and game behaviour resets stat stages; body not read. |
| 18 | Pokémon Trap | Every non-shop item in the room (or within the visibility radius in a corridor) turns into a wild Pokémon; trap is consumed. |
| 19 | Spike Trap ("Spiked Tile") | `gSpikeTrapDmgValue = 20` damage. |

---

## 6. Combat

### 6.1 Stats

Each monster has `atk[2]`, `def[2]` (index 0 = physical, 1 = special), `maxHPStat`. Split is **by move type**: `splitIndex = (!IsTypePhysical(moveType)) ? 1 : 0` using `gIsTypePhysicalTable` (`include/dungeon_data.h:52`). Caps: HP 999, stats 255. Stat stages run 0-20, neutral 10.

### 6.2 Damage formula (`CalcDamage`, `src/dungeon_damage.c:1118-1379`)

Special cases first: a **non-leader with belly 0**, or the **regular attack against Wonder Guard**, deal exactly 1.

Otherwise (reconstructed from the fixed-point code; key lines quoted):

```c
statCalc = s24_8_mul(IntToF248(attackerInfo->atk[splitIndex] + movePower), gAtkStatStageMultipliers[atkStatStage]);
statCalc = s24_8_mul(statCalc, attackerInfo->offensiveMultipliers[splitIndex]);
atkStat  = F248ToInt(statCalc);
...
statCalc = s24_8_mul(IntToF248(targetInfo->def[splitIndex]), gDefStatStageMultipliers[defStatStage]);
statCalc = s24_8_mul(statCalc, targetInfo->defensiveMultipliers[splitIndex]);
defStat  = F248ToInt(statCalc);
```

```
A = floor((atk + movePower) * atkStageMult * offensiveMultiplier)
    + 12 if Power Band (physical) / Special Band (special); + 8 if Munch Belt
    clamp to [0, 999]; then ability multipliers (below)
D = floor(def * defStageMult * defensiveMultiplier)
    + 8 if target holds Def Scarf (physical) / Zinc Band (special)

if attacker is a TEAM member:   L = level * 0xAAAA/0x10000        (≈ level * 2/3)
else (wild attacker):           L = atkRaw / 3                    (its unmodified atk stat, after ability multipliers)

X    = (A - D) / 8 + L
base = X*X * (0xCCC / 0x10000)  +  2*X  -  D  +  10               (0xCCC/0x10000 ≈ 0.04998, i.e. X²/20)
base = clamp(base, 1, 999)                                        // gUnknown_8106F04 = 1.0, gUnknown_8106F24 = 999.0

damage = floor( base * typeAndModifierProduct * moveModifier * rnd )
rnd    = (0xE000 + DungeonRandInt(0x4000)) / 0x10000              // uniform in [0.875, 1.125)
```

`moveModifier` (`arg8`) is 1.0 for ordinary moves; 2.0 for the release turn of two-turn moves and Facade-style doubling (`gSolarBeamModifier` … `gFacadeModifier = 2.0`, `dungeon_config.c:176-185`).

Note the asymmetry: **wild attackers use their own attack stat / 3 in place of the level term**, so enemy damage does not scale with level directly.

**Stat-stage multipliers** (`dungeon_config.c:276-289`, index 0…20):
`gAtkStatStageMultipliers` = 0.25, 0.2696, 0.2892, 0.3087, 0.3282, 0.3478, 0.3985, 0.4493, 0.5, 0.6993, **1.0**, 1.2969, 1.5, 1.5978, 1.6485, 1.6993, 1.75, 1.7969, 1.8478, 1.8985, 2.0
`gDefStatStageMultipliers` = same except indices 7-9: 0.5469, 0.6993, 0.8672.

**Ability multipliers on A / D** (`ApplyAtkDefStatBoosts`, lines 1018-1105): Guts with a negative status ×2; Huge/Pure Power ×1.5 on physical with a 33 % roll; Hustle ×1.5 physical; Plus/Minus ×1.5 special when the partner ability is on the same side; target Intimidate ×0.8 physical; target Marvel Scale ×1.5 defense when statused.

**`typeAndModifierProduct`** (`sub_806E100`, lines 735-912), multiplied in this order:

| Factor | Value |
|---|---|
| Type effectiveness, applied **once per defender type** | see 6.3 |
| Wonder Guard, result not super effective | set to `gUnknown_8106EFC` (value not read; effectively 0) |
| Thick Fat vs Fire/Ice | ×0.5 |
| Flash Fire vs Fire / Levitate vs Ground | ×0 |
| Torrent / Overgrow / Swarm / Blaze, `maxHP/4 >= HP`, matching type | ×2.0 |
| **STAB** (`MonsterIsType(attacker, type)`) | **×1.5** |
| Sunny: Fire ×1.5, Water ×0.5 | |
| Rain: Fire ×0.5, Water ×1.5 | |
| Cloudy: every non-Normal type | ×0.75 (`0xC000`) |
| Mud Sport or Fog: Electric | ×0.5 |
| Water Sport: Fire | ×0.5 |
| Charge status: Electric | ×2.0 |
| Reflect (physical) / Light Screen (special) on target | ×0.5 |
| Critical hit | ×1.5 |

### 6.3 Type effectiveness (`src/dungeon_damage.c:776`, chart `dungeon_config.c:382-402`)

```c
const s48_16 *local_48[] = {&gUnknown_8106F3C, &gUnknown_8106F44, &gUnknown_8106F04, &gUnknown_8106F4C};
//                            IMMUNE = 0x8000     RESIST = 0xE666     NEUTRAL = 0x10000  SUPER = 0x18000
```

| Matchup (`EFFECTIVENESS_*`) | Multiplier |
|---|---|
| `IMMUNE` (0) | **×0.5** — immunities are *not* zero |
| `RESIST` (1) | **×0.9** (`0xE666/0x10000`) |
| `NEUTRAL` (2) | ×1.0 |
| `SUPER` (3) | **×1.5** |

Dual types multiply (super + super = ×2.25; super + resist = ×1.35). The chart itself is the standard Gen 3 chart (17 types + `TYPE_NONE`, which is neutral to everything — the regular attack is `TYPE_NONE`). Exception: Normal/Fighting vs an **unexposed Ghost** uses `IMMUNE`. The displayed message uses the combined table `gEffectivenessChart` (`dungeon_config.c:404`).

### 6.4 Accuracy and critical hits

**Two rolls per target.** Each move has `accuracy1` and `accuracy2` (`MoveDataEntry.accuracy[]`):

1. `UseMoveAgainstTargets` (`src/dungeon_move.c:250`): `AccuracyCalc(attacker, target, move, ACCURACY_1, selfAlwaysHits)` — move misses entirely.
2. Damaging moves: `TryHitTarget_Async` (`dungeon_move.c:1361`): `AccuracyCalc(…, ACCURACY_2, TRUE)` — on failure "took no damage".

`AccuracyCalc` (`src/dungeon_move_util.c:738-816`):

```
if selfAlwaysHits && attacker == target: hit
if regular attack && IQ Sure-Hit Attacker: hit
if attacker has SURE_SHOT: hit;  if WHIFFER: miss
if accuracy > 100: hit                                   // 125 = "never misses on this roll"
if target holds Detect Band: accuracy -= 30
if target has IQ Quick Dodger: accuracy -= 30
accStage = attacker.hitChanceStages[0] (+2 Compoundeyes; Thunder: rain → hit, sun → −2); clamp 0..20
accuracy = accuracy * gAccEvsStatStageMultipliers[0][accStage]
evaStage = target.hitChanceStages[1] (10 if exposed; +2 Sand Veil in sandstorm; +2 if attacker has Hustle and move is physical); clamp 0..20
accuracy = accuracy * gAccEvsStatStageMultipliers[1][evaStage]
hit if DungeonRandInt(100) < accuracy
```

Typical data: `accuracy1` is 125 for 281 of 413 moves and 100 for 112; `accuracy2` carries the real hit chance (Tackle 95, Scratch/Pound/Ember 90, Flamethrower/Bubble 88, Earthquake 65, **regular attack 93**). Thrown items use `gProjectileHitChance = 90`.

Accuracy stage table (0…20): 0.3282, 0.3478, 0.3672, 0.3985, 0.4297, 0.4493, 0.5469, 0.5977, 0.6993, 0.7969, **1.0**, 1.25, 1.5, 1.5978, 1.6485, 1.6993, 1.75, 1.7969, 1.8478, 1.8985, 2.0.
Evasion stage table: 2.0, 1.8985, 1.8478, 1.7969, 1.75, 1.6993, 1.6485, 1.5978, 1.5, 1.3515, **1.0**, 0.7969, 0.6993, 0.5977, 0.5, 0.3985, 0.3477, 0.2969, 0.25, 0.1993, 0.1485.

**Critical hits** (`dungeon_damage.c:1309-1342`):

```c
if (attackerInfo->isNotTeamMember) critOdds = 0;        // wild Pokémon never crit from the move's own chance
else                               critOdds = critChance;   // per-move data, 12 for 330 of 413 moves
if (FOCUS_ENERGY) critOdds = 999;
else {
    if (HasHeldItem(attacker, ITEM_SCOPE_LENS)) critOdds += gCritOddsScopeLensPatsyBand;   // 40
    if (HasHeldItem(target, ITEM_PATSY_BAND))   critOdds += gCritOddsScopeLensPatsyBand;   // 40
    if (superEffective && IQ Type-Advantage Master) critOdds = gCritOddsIqAdvantageMaster; // 40
}
if (DungeonRandInt(100) < critOdds) { ×1.5; isCrit = TRUE; }
```

Blocked by Battle Armor / Shell Armor. Crit = ×1.5. The regular attack has no `critChance` in the data.

### 6.5 Move range

Each move stores `targetingFlags` (player) and `aiTargetingFlags` (AI) (`include/structs/str_moves.h:13`). Low nibble = who, bits 4-7 = range (`include/constants/move.h:40-55`), resolved in `SetTargetsForMove` (`src/dungeon_move_util.c:818-928`) and `TryUseChosenMove` (`:318-333`).

| Range bits | Name | Tiles affected | Count in data (player flags) |
|---|---|---|---|
| `0x00` | `TARGET_OTHER` — front | The 1 tile in front; **blocked diagonally by wall corners** (`CanAttackInDirection`) | 173 (flags `0x00`) |
| `0x10` | `TARGET_FRONTAL_CONE` | 3 tiles: facing−1, facing, facing+1 (Wide Slash) | 1 |
| `0x20` | `TARGET_AROUND` | All 8 adjacent tiles | 9 |
| `0x30` | `TARGET_ROOM` | Every monster for which `IsPositionActuallyInSight` holds: the whole room (+1 ring), or the visibility radius in a corridor | 16 enemies-only + others |
| `0x40` | `TARGET_2_TILES_AHEAD` | Front tile; if nothing was hit there, the tile 2 ahead (`sub_80696FC` / `sub_806977C`) | 5 |
| `0x50` | `TARGET_LINE` | Projectile up to **10 tiles** (`var_28 = 10`); stops at the first wall or the first monster; hits that monster only | 33 |
| `0x60` | `TARGET_FLOOR` | Every monster on the floor | few |
| `0x70` | `TARGET_SELF` | User | 95 |
| `0x80` | `CUT_CORNERS` | 1-tile projectile: front tile, **ignoring the corner rule** | 45 |

There is **no 4-tile range category in Red** — only 1, 2 and 10. (The `MOVE_RANGE_*` names in `include/constants/move_range.h`, e.g. `MOVE_RANGE_STRAIGHT_LINE`, `MOVE_RANGE_ROOM_FOES`, `MOVE_RANGE_CUTS_CORNERS_FOE`, are the `rangeID` field, used for the description text; the mechanics come from the flag bits above.)

Who (low nibble, `SetNewTarget`, lines 930-994): `0` enemies, `1` allies (incl. self), `2` anyone, `3` user, `4` two-turn move (self on the charge turn, enemy front on release), `5` everyone except user, `6` allies except user. If the user is Confused / Blinker / Cowering, **anyone** can be hit (friendly fire), unless IQ Nontraitor. Max 64 targets.

Line projectiles: the path loop (`sub_80566F8`, `dungeon_move_util.c:612-720`) advances while the tile has `NORMAL | SECONDARY` terrain, so they **pass over water/lava** and stop at walls.

Multi-hit moves: `numberOfChainedHits` (loop in `TryUseChosenMove`, line 392).
Swift Swim in rain / Chlorophyll in sun: the whole action is performed **twice** (`sub_8070828`, `dungeon_logic.c:368`).

### 6.6 PP, regular attack, Struggle

- PP is per move slot (`Move.PP`, base from `basePP`). Using a move marks it; `sub_8057588` (`dungeon_move_util.c:1356-1390`) then removes **1 PP per used move at the end of the action** (2 if the move carries `MOVE_FLAG_LAST_USED` from Grudge-style effects). A move with 0 PP "can't be used" (line 131).
- **Regular attack** (`ACTION_REGULAR_ATTACK` → `UseTemporaryMove(entity, MOVE_REGULAR_ATTACK)`, `dungeon_action_handler.c:767`): a temporary move object, **costs no PP, no belly**. Data: `basePower 1`, `type TYPE_NONE` (neutral to everything, no STAB), front-tile range, `accuracy1 125`, `accuracy2 93`, no crit chance. Blocked by Cringe and Paralysis. For the leader it also reveals a trap in front. Enemies KO'd only with regular attacks give **half EXP** (7.1).
- **Struggle** (`ACTION_STRUGGLE`): `basePower 30`, front tile, used when all moves are at 0 PP.
- Sample move data (`data/move/move_data.json`; note power values are small integers added to the attack stat):

| Move | Power | Type | Range | PP | acc1 / acc2 | crit | aiWeight |
|---|---|---|---|---|---|---|---|
| Regular Attack | 1 | NONE | front | (17) | 125 / 93 | — | 70 |
| Tackle | 7 | Normal | front | 22 | 100 / 95 | 12 | 25 |
| Scratch / Pound | 8 | Normal | front | 22 | 125 / 90 | 12 | 25 |
| Ember | 7 | Fire | cut-corners | 18 | 125 / 90 | 12 | 20 |
| Bubble | 4 | Water | line (10) | 15 | 125 / 88 | 12 | 10 |
| Flamethrower | 18 | Fire | line (10) | 12 | 125 / 88 | 12 | 10 |
| Quick Attack | 4 | Normal | 2 tiles | 13 | 125 / 88 | 12 | 25 |
| Heat Wave | 10 | Fire | room, foes | 15 | 125 / 90 | 12 | 10 |
| Earthquake | 5 | Ground | room, all but user | 10 | 100 / 65 | 12 | 20 |
| Wide Slash | 20 | NONE | 3-tile cone | 10 | 125 / 88 | 12 | 20 |
| Fury Swipes | 4 | Normal | front, multi-hit | 19 | 125 / 78 | 1 | 25 |
| Struggle | 30 | Normal | front | 1 | 100 / 100 | 12 | 30 |

### 6.7 Linked moves (`TryUseMoveInMoveset`, `src/dungeon_move_util.c:52-219`)

- Moves in adjacent slots can be chained: slots flagged `MOVE_FLAG_SUBSEQUENT_IN_LINK_CHAIN` follow the first. Using the chain's first slot executes **every move in the chain in order within one action**.
- Each move that actually executes costs its own PP; a 0-PP member prints "can't be used" and is skipped. (Source comment in the AI: "Linked moves unlink if any move in the chain runs out of PP".)
- Belly: `usedLinkedMovesCounter` increments per linked move used, and at end of turn adds `gLinkedMovesBellyGoDownValues[count]` = +1 (2 moves), +2 (3), +4 (4) whole belly points (leader only).
- EXP: a target hit by a linked move gets `expMultiplier = EXP_BOOSTED` (×1.5) (`dungeon_move.c:308-310`).
- Linking is done with the Link Box item or the Gulpin shop outside the dungeon (`ACTION_USE_LINK_BOX`, `ACTION_LINK_MOVES`); those UIs were not traced.

### 6.8 Other differences worth knowing

- Fixed-damage moves: Sonicboom 55, Dragon Rage 65, Vacuum-Cut 35 (`dungeon_config.c:194-196`); thrown Gravelerock 20, Geo Pebble 15; Blast Seed 45 eaten / 20 thrown.
- Frozen targets take no damage (`dungeon_damage.c:271`).
- Burn does not reduce attack in `CalcDamage` (no such term in the function).
- Secondary effect chances: `dungeon_config.c:32-75` (most 10 %; Thunder 20, Headbutt 25, Fake Out 35, Smog 40 …).
- Contact abilities (Static, Poison Point, Flame Body, Effect Spore, Cute Charm, Stench, Arena Trap, Shadow Tag, Magnet Pull): 12 % each (`dungeon_config.c:80-88`).

---

## 7. Progression inside a run

### 7.1 Experience (`src/dungeon_damage.c:662-707`, `src/pokemon.c:862`)

```c
s32 CalculateEXPGain(s16 index, s32 level) {
    s32 expYield = sMonsterParameters[index].expYield;
    return expYield + (expYield * (level - 1)) / 10;
}
...
switch (targetData->expMultiplier) {
    case EXP_BOOSTED: exp *= 3; exp /= 2; break;
    case EXP_HALVED:  exp /= 2; break;
}
if (exp == 0) exp = 1;
```

- `expMultiplier` starts at `EXP_HALVED` for every spawned monster. It becomes `EXP_REGULAR` the first time the monster is hit by a real move — `move->id != MOVE_REGULAR_ATTACK && itemId == 0` — and `EXP_BOOSTED` if hit by a linked move (`dungeon_move.c:303-311`). So: **regular attacks / thrown items / orbs only → ×0.5; any move → ×1; linked moves → ×1.5.**
- Awarded only when a team member KOs a wild monster. **Every valid team member receives the full amount** (no splitting): `AddExpPoints(attacker, attacker, exp)` then each other teammate (lines 690-696).
- `AddExpPoints` (`src/dungeon_leveling.c:49`): no gain at level 100 or for "experience locked" guests; total capped at 9,999,999; accumulated in `expGainedInTurn` and applied afterwards.
- Example yields: Pidgey 12, Wurmple 15, Sunkern 16, Bulbasaur 18 (Lv 1 → that many EXP; Lv 24 → `y + y*23/10`).

### 7.2 Level up (`LevelUp`, `src/dungeon_leveling.c:354-446`)

Loop `level+1 … 100` while `leveldata.expRequired <= exp`. Per level a per-species `LevelData` record (`GetLvlUpEntry`) gives `expRequired`, `gainHP`, `gainAtt[2]`, `gainDef[2]`. Max HP and current HP both rise by `gainHP` (cap 999); stats cap at 255. New moves are offered via `sub_8072778`. The tables are built by `data_monster.mk` (learnset JSON in `data/monster/learnset`); not dumped here. Multiple levels can be gained at once.
`levelResetTo1` dungeons: level/stat changes are not written back to the roster (`IsLevelResetDungeon` checks in `HandleFaint_Async`).

### 7.3 Recruitment (`TryRecruitMonster`, `src/dungeon_mon_recruit.c:38-150`)

Attempted only when (`dungeon_damage.c:685-716`) a wild monster is KO'd with EXP-giving damage **by the team leader**.

Preconditions: dungeon `recruitingEnabled` (special rules on boss floors); `gDungeon->unk644.canRecruit`; species recruitable and its friend area owned (`IsMonsterRecruitable`); one-time legendaries not already recruited; **leader within 1 tile** (`abs(dx) >= 2 || abs(dy) >= 2 → FALSE`); target can see the leader; not a mission client.

```c
rand = DungeonRandInt(1000);
recruitRate = GetRecruitRate(targetInfo->id);          // per species, tenths of a percent; -999 = never
if (recruitRate == -999) return FALSE;
if (HasHeldItem(attacker, ITEM_FRIEND_BOW)) recruitRate += gFriendBowRecruitRateUpValue;   // +100 (10 %)
recruitRate += gRecruitRateByLevel[attackerInfo->level];
if (rand >= recruitRate) return FALSE;
```

`gRecruitRateByLevel[101]` (`dungeon_config.c:593`): Lv 0-29 → 0, 30-39 → 50, 40-49 → 75, 50-59 → 100, 60-69 → 125, 70-79 → 150, 80-89 → 175, 90-100 → 240.
Examples: Pidgey 101 (10.1 %), Wurmple 74, Sunkern 52, Bulbasaur 125, Kecleon −339.

Then capacity: a free run of body-size slots (`MAX_TEAM_BODY_SIZE 6`; sizes 1, 2 or 4), a free `dungeonTeam` slot (max 4), a free entity slot. On success a join prompt/sequence runs; if declined the monster simply faints.

### 7.4 Fainting

Damage reaching 0 HP runs the tail of `HandleDealingDamageInternal_Async` (`dungeon_damage.c:507-733`), in order:

1. **Reviver Orb** held (not sticky, not a shop item) → full HP, full belly, statuses cleared, orb consumed.
2. Leader holding a **Possess Orb** with a teammate adjacent → the teammate is sacrificed, leader takes its place with full HP.
3. **Reviver Seed** — gated on `IqSkillIsEnabled(target, IQ_ITEM_MASTER)` (a default-on skill): held seed, or for team members the first non-sticky Reviver Seed in the bag → full HP and belly, seed becomes a **Plain Seed**. Wild Pokémon holding one revive too.
4. Non-leaders drop their held item on the floor.
5. EXP, recruitment roll, then `HandleFaint_Async` (`src/dungeon_misc.c:450-624`).

`HandleFaint_Async`:
- **Teammate**: removed for the rest of the run (`dungeonTeam[i].flags = 0`, `ClearOnTeamFlag`), its held item is cleared on the roster.
- **Story partner** (when `!canChangeLeader`) → forced loss `DUNGEON_EXIT_RETURNED_WITH_FALLEN_PARTNER`. **Escort client** → `DUNGEON_EXIT_FAILED_TO_PROTECT_CLIENT`. (`TryForcedLoss_Async`, `run_dungeon.c:766`.)
- **Leader**: message log, then the rescue offer (7.5); otherwise the run ends.

**Penalty on a lost run** (`RemoveMoneyAndRandomItems`, `src/main_loops.c:1041-1059`, run for `STARTMODE_DUNGEON_LOST`):

```c
for (i = 0; i < INVENTORY_SIZE; i++)
    if (RandInt(100) < 50) ZeroOutItem(&gTeamInventoryRef->teamItems[i]);     // each bag slot: 50 % lost
... every team member: mon->heldItem.id = ITEM_NOTHING;                        // all held items lost
gTeamInventoryRef->teamMoney = 0;                                              // all carried money lost
```

A second mode `RemoveAllMoneyAndItems` (`STARTMODE_11`) removes everything; which exits map to it was not traced. If you fainted as a Kecleon thief, all items become Plain Seeds first. Levels/EXP gained are kept (except in level-reset dungeons).

### 7.5 Rescue (`src/dungeon_misc.c:500-532`)

Offered when the leader faints and all hold: not a thief; cause is not the wind, an event deletion, or failing a client; no cutscene; `rescuesAllowed >= 0`; not already on a rescue mission. If the remaining count (`unk644.unk37`, initialised from `rescuesAllowed`) is > 0 the player is asked Yes/No; Yes decrements it, serialises the dungeon state (`SaveDungeonState(…, 0x4800)`) and exits to the "awaiting rescue" flow (friend-rescue mail / password, `src/wonder_mail*.c`). On resume, `sub_8043D60` (`run_dungeon.c:704-764`) removes all wild monsters and restores every team member to full HP, belly and PP. The rescuer's side is a normal run with `missionKind == DUNGEON_MISSION_OUTONRESCUE` that ends on the target floor (`FLOOR_TYPE_RESCUE`).

### 7.6 Stairs

- Leader stepping on a stairs tile sets `gDungeon->unk1` (`CheckLeaderTile`, `dungeon_main.c:941`); before the next input the stairs menu opens (`ShowDungeonStairsMenu`). Choosing to proceed issues `ACTION_STAIRS`, which sets `gDungeon->unk2 = DUNGEON_UNK2_1` → `IsFloorOver()`.
- **Only the leader matters**; teammates anywhere on the floor come along.
- Next floor: `floor++` while `floor + 1 < floorCount`, else `DUNGEON_EXIT_CLEARED_DUNGEON` (`run_dungeon.c:579-593`). Up vs down is cosmetic.
- Reset per floor (`run_dungeon.c:290-306, 337`): `fractionalTurn`, spawn timer, `stoleFromKecleon`, monster-house flags, weather, **wind turns**. HP, PP, belly, statuses on the team carry over as serialised by the floor transition (statuses are reset by `ResetMonEntityData` on respawn; not traced field by field).
- Pitfall Trap = forced descent with 5 damage.
- Meteor Cave blocks the stairs until Deoxys is beaten (`dungeon_action_execution.c:171`).

### 7.7 Missions (brief)

`enum MissionTypes` (`include/constants/wonder_mail.h:41-50`): `FRIEND_RESCUE`, `FIND_ITEM`, `DELIVER_ITEM`, `RESCUE_CLIENT`, `RESCUE_TARGET`, `ESCORT_CLIENT`, `SPECIAL_MISSION`. Wonder-mail job types (`:52-60`): rescue client, rescue target, escort client, find item, deliver item, plus an unnamed type 6.
In-dungeon pieces: `enum DungeonMissionKind` (`str_dungeon.h:242`), `BEHAVIOR_RESCUE_TARGET` monsters (stand still, cannot be attacked, talk to complete), escort clients as extra party members whose faint is a forced loss, the destination-floor banner (`DisplayYouReachedDestFloorStr`), and `src/dungeon_jobs.c`. Rewards and generation live in `src/wonder_mail*.c` / `src/dungeon_jobs.c` (not traced).

---

## 8. Fog / visibility and the minimap

### 8.1 Darkness level

`sub_803F27C` (`src/dungeon_tilemap.c:89-94`):

```c
strPtr->visibilityRange = gDungeon->floorProperties.visibilityRange & 3;
if (strPtr->visibilityRange == 0) {
    strPtr->unk1820C = 1;          // no darkness on this floor
}
```

| Floor value | Darkness overlay | Corridor sight radius `v` (mechanics) | Floors in data |
|---|---|---|---|
| 0 | none (`unk1820C = 1`) — the whole screen is lit | 2 | 623 |
| 1 | dark, `COPY_WINDOW_BG_BUFFER_DIM1` | **1** | 480 |
| 2 | dark, `COPY_WINDOW_BG_BUFFER_DIM2` | **2** | 661 |

Overlay selection (`dungeon_tilemap.c:300-322`): in a corridor a fixed circle window (DIM1 smaller, DIM2 larger) around the player; **in a room the lit window is the room's rectangle** (`COPY_WINDOW_BG_BUFFER_ROOM_DIM` with the room's pixel bounds). Tiles are always drawn; darkness is a dimming window, not hidden geometry.

### 8.2 What the player can see (entities)

`sub_803F428` (`dungeon_tilemap.c:120-133`):

```c
if (abs(cameraPos.x - pos->x) <= 6 && abs(cameraPos.y - pos->y) <= 5) {
    if (allTilesRevealed == 0 && unk1820C == 0 && cameraEntity != NULL)
        return IsPositionActuallyInSight(&cameraPos, pos);
    return TRUE;
}
return FALSE;
```

Screen = 13 × 11 tiles (±6, ±5; tiles are 24 px). `ShouldDisplayEntity` (`src/dungeon_util.c:438-485`):

- **Team members**: always drawn.
- **Wild Pokémon**: drawn only if in sight per the test above (and not invisible) — on a lit floor (value 0) anything on screen; on a dark floor only those in the current room (+1 ring) or within `v` tiles in a corridor.
- **Floor items**: same sight test, unless `showAllFloorItems`.
- **Traps**: only if `isVisible` or `showInvisibleTrapsMonsters`.

Flags that widen this (`str_dungeon.h:86-92`): `allTilesRevealed`, `unk1820D` (shows all monsters), `showAllFloorItems`, `showInvisibleTrapsMonsters`; `blinded` (Blinker) blacks out the screen and stops map discovery.

### 8.3 Minimap (`DiscoverMinimap`, `src/dungeon_map_access.c:1019-1065`)

Run every time the leader finishes a step (and at floor start):

```
if blinded: nothing
if leader is in a corridor: reveal the square [x-v, x+v] × [y-v, y+v]      (v = visibilityRange, 0 → 2)
else: if this room was already revealed: nothing
      else reveal the room rectangle expanded by 1 (bottomRightCorner-1 … topLeftCorner), once
tile.visibility |= VISIBILITY_FLAG_REVEALED | VISIBILITY_FLAG_VISITED;  DrawMinimapTile(x, y)
```

(The decomp's `RoomData` field names `bottomRightCorner*` / `topLeftCorner*` are used as *min* / *max* respectively.) So entering a room reveals the whole room at once; corridors are revealed in a radius of 1 or 2.

Minimap dots (`ShouldMinimapDisplayEntity`, `dungeon_util.c:398-436`): team members always; wild Pokémon only while in sight (or with the reveal flags); items and traps return TRUE (subject to their tile being revealed and, for traps, visible — drawn by `DrawMinimapTile`, `src/dungeon_map.c:159`, not read in full). SELECT opens the full-screen floor map; A toggles monster dots (`dungeon_main.c:358-388`).

---

## 9. Ambiguities, traps for the implementer, and things not decompiled / not traced

1. **Enemy cap looks inverted.** `dungeon_wild_mon_spawn.c:71-79` applies `gMaxWildMonsInMonsterHouse (10)` when `monsterHouseRoom == CORRIDOR_ROOM (0xFF)`, i.e. when the floor has **no** monster house, and `gMaxWildMonsInRoom (4)` when it has one. The code is unambiguous; the *names* (assigned by decompilers) are probably wrong. Implement: cap 10 normally, 4 on monster-house floors.
2. **"Frames" that are turns.** `gWildSpawnIntervalFrames = 36` and `gKecleonSpawnIntervalFrames = 5` are incremented once per normal turn. Likewise `gSpeedBoostActivationFrame = 250` counts end-of-turn calls.
3. **Regen divisor.** `GetRegenSpeed` is `((u8)x << 25) >> 24` with data `x = 100`. Arithmetically that is `(100 * 2) & 0xFF = 200` when truncated to the `u8` return type; I did not run the ROM to confirm compiler behaviour for this expression. Treat "full heal in 200 turns" as the reading of the source, not a measured value.
4. **Upkeep is per action, not per turn.** Hunger, regen, status countdowns and residual damage all run once per action slot, so sped-up monsters burn belly and heal twice as fast per turn, and the wind counter drops once per leader action.
5. **`DungeonRandRange` is upper-exclusive.** Monster House count is 8-11 (not 12); status durations like Sleep `{3,7}` are 3-6; initial enemies `density/2 … density-1`.
6. **Enemy density sign.** The source itself flags a BUG: negative ("exact") densities are read as unsigned. 285 rows hold 255; those are fixed/boss rows and whether any are reachable as ordinary floors was not checked.
7. **Weighted-pick off-by-one.** Species, trap, item and AI move picks compare `threshold >= rand` with `rand ∈ [0, N-1]`, which gives the first entry one extra value. Negligible, but exact replication needs it.
8. **Monster House spawn loop** (`dungeon_monster_house.c:138-180`) never marks a chosen position as used; it relies on the occupied-tile check inside `SpawnWildMon` failing. A duplicate pick silently wastes one of the 8-11 spawns.
9. **`BEHAVIOR_FIXED_ENEMY` (0)** is the value every ordinary monster has (`monSpawnInfo.unk2 = 0`), despite the name; `ChooseTargetPosition` only targets entities with it.
10. **Not traced / not read**: Wonder Tile body (`sub_8079E34`); explosion radius and damage (`src/explosion.c`); `gUnknown_8106EFC` (Wonder Guard multiplier); `RANGED_ATTACK_RANGE`; wild move selection at spawn (`sub_8072AC8`); item use effects and shop prices (`src/dungeon_item_action.c`, item data); AI item use (`src/dungeon_ai_items.c`, `dungeon_ai_item_weight.c`); the per-species level-up tables; which menu actions are free; exact carry-over of statuses between floors; mission generation/rewards; the friend-rescue password flow; boss/cutscene behaviours (`src/dungeon_cutscene*.c`); which exit reasons use `RemoveAllMoneyAndItems`.
11. **Still unnamed in the decomp** (behaviour above inferred from bodies): the tick sub-steps `sub_8044574_Async` (teammates), `sub_8044820_Async` (wild), `sub_8044AB4` (animation + weather), `sub_8044454_Async` (swap partner); `sub_8083660` (respawn position); `sub_8049BB0` (neighbour masks); `sub_806E100` (type multiplier); `sub_80566F8` (line projectile); `sub_8057588` (PP deduction); `sub_8046CE4` (money amount); `sub_807EC28` / `sub_807F33C` (shop step check / theft); `sub_803F428` (on-screen sight); `sub_807EAA0` (weather tick); most of `unkDungeon644` (`unk48/4C/50` shop totals, `unk37` rescues left, `unk28` running flag) and `gDungeon->unk1/unk2/unk4` (stairs / floor-over state).
12. **Easy to get wrong from memory of mainline Pokémon** (all verified above in this codebase): immunities are ×0.5, not ×0; resist is ×0.9 and super effective ×1.5; there is no 4-tile range, only 1 / 2 / 10 / room / floor; wild Pokémon never crit from a move's own chance and never regenerate HP; the Reviver Seed check is tied to the Item Master IQ skill; the turn limit restarts on every floor. No comparison with other PMD games was made — only this repository was read.
