# Poketactica — Tower Defense (plan)

Owner, 2026-11-23: a single-player sub-mode inside Poketactica. "You place your figurines as towers & as the game goes you
get to use more & more to fight increasing waves." Same isometric view, sprites and battle system as Poketactica; no
turns: "everything can operate on cooldown timers that factor in the speed of the Pokémon using the move". It must have
spectating and replays. **Nothing here is built yet.** Build order: permanent loss, then this, then Mystery Maze.

## Owner's decisions

| Question | Answer |
|---|---|
| Name on the camp menu | **Tower Defense** |
| Do enemies fight back? | **No. They only walk.** Towers have no HP and are never lost (so the permanent-loss rule never bites here). |
| Where can towers go? | **Any free tile off the path.** The path is fixed and shown. |
| "More and more" figurines | **Slots + in-run energy.** Slots open on set waves; kills earn energy to spend during the run. Energy is not stars and vanishes at the end. |
| What is a run? | **Endless only.** Waves grow until the base falls; the score is the wave reached. |
| Time | **Pause to plan + speed.** Menus pause the action; a pause button; 1× / 2× / 3×. |
| What limits a move? | **Cooldown, SP and PP, all three.** SP refills slowly over time (not by walking). |

## How a run plays

1. **Pick a map and a squad.** A squad is up to 12 of your figurines, in the order you expect to place them. They play at
   their own level with their own four moves, move levels, ability and held item.
2. **Place.** Z (or a tap) on a free tile opens the squad list (the game pauses); pick one and it stands there as a tower.
   You start with 3 slots.
3. **Waves walk the path** from the gate(s) to your base (the pale base tile). An enemy that reaches the base costs lives
   (a normal enemy 1, a boss 5; 20 lives). At 0 lives the run ends.
4. **Towers act on their own.** Each of a tower's moves fires when it is off cooldown, the tower has the SP and the PP,
   and an enemy stands where the move can reach. You set each tower's target rule (First, Last, Strongest, Weakest,
   Fastest) and can switch any of its moves off.
5. **Between and during waves** you place more, recall, change orders, spend energy, and may call the next wave early for
   bonus energy.
6. **The run ends** when the base falls (or you retire). You are paid stars for the waves cleared, your towers keep the
   EXP and move XP they earned, and the map's best wave is recorded.

## The map

- The same board Poketactica draws today (`terrain3d.js`): heights, ground kinds, props.
- A map adds a **path**: an ordered list of tiles from each gate to the base. The path is drawn as a road with arrows.
  Towers can't stand on it; enemies never leave it.
- **Where you place matters, with the rules the battle system already has:**
  - Height: +10% damage per level above the target, up to +50% (`HEIGHT_STEP`, `HEIGHT_CAP`).
  - A move's height rule: a melee move can't reach more than 2 levels up or down, a beam is blocked by higher ground
    between, a lob goes over.
  - Living terrain under the tower: Water moves from water, Fire from lava, Grass from tall grass, Ice from ice do 20% more.
  - Geo panels: a tower on a coloured panel gets that colour's effect (attack up, no-miss, …) while its Geo symbol stands.
- **Version 1 ships 3 hand-built maps** (a short loop, a long winding path with high ground, a two-gate map). Later: paths
  on Map Maker maps, so players can build and share Tower Defense maps.

## Real time, from the turn-based rules

One tick is 1/20 s. Everything is counted in ticks, so a run is exactly repeatable.

### Cooldowns (owner: "factor in the speed of the Pokémon using the move")

```
cooldownSeconds = (CD_BASE + CD_PER_SP × move.spCost) × speedFactor
speedFactor     = clamp(sqrt(SPE_REF / speedStat), 0.5, 2)      // the figurine's Speed stat with its stage boosts
```

- Starting numbers: `CD_BASE 1.0`, `CD_PER_SP 0.4`, `SPE_REF` = the Speed of a base-80 Pokémon at the tower's level (so
  speed matters the same at Lv 5 and Lv 500). A base-130 Pokémon acts about 1.3× as often as a base-80; a base-40, 0.7×.
- A tower has one **global cooldown** of 0.4 s between any two of its moves, so four moves never fire in one frame.
- Priority moves (Quick Attack…) halve their own cooldown. Two-turn moves (Solar Beam…) charge for one cooldown, then fire.
- Paralysis on an **enemy** slows its walk; it never applies to towers (enemies don't attack).

### SP and PP

- **SP** is the figurine's own pool (`spMax`: 20 + level / 5). A move costs what it costs in a battle. SP refills at
  `SP_REGEN` = 4% of max per second (a full bar in 25 s), so a tower can open with its big move and then falls back to
  what it can afford.
- **PP** is the move's own count, as in a battle, full at the start of a run. PP does **not** refill by itself. Ways back:
  every boss wave cleared restores all PP; energy buys a restore; a recalled figurine regains 1 PP per move every 10 s on
  the bench. A tower with no usable move uses **Struggle** (weak, typeless, slow). Running low is what makes you bring
  the next figurine in. *(Open question 1.)*

### What a move does

The damage is Poketactica's (`overworld/rules/`: the real formula, type chart, STAB, abilities, held items, weather),
with the forecast's accuracy and Poketactica's move shapes and move levels.

| In a battle | In Tower Defense |
|---|---|
| Damage | The same, to every enemy on the shape's tiles. |
| Shape and reach | The same tiles. A tower's reach is every tile its moves can hit from where it stands (shown when selected, the way the enemy range overlay is drawn). |
| Sleep, freeze | The enemy stops for a few seconds. |
| Paralysis | Walks at half speed, with short stalls. |
| Burn, poison | Damage every second (1/16, 1/8 of max HP per 4 s). |
| Confusion | Walks backwards for a few seconds. |
| Stat drops on a foe | Stay on that enemy (Defense down: it takes more). Speed down: it walks slower. |
| Self buffs | Last 20 s (Swords Dance: +2 Attack for 20 s); at move level 99 they share with adjacent towers, as now. |
| Knockback, Whirlwind, Roar | Push the enemy back along the path. |
| Weather, terrain paint | As in a battle, for their usual time. |
| Protect, Taunt, Encore, healing | No use here (enemies don't attack, towers have no HP). Marked "no effect in Tower Defense" on the squad screen, and never fired. *(Open question 4: healing moves could refill allies' SP.)* |

- A generated table (`tools/poketactica/gen_td_effects.mjs` → `poketactica/data/td_effects.json`) classes all 882 moves
  into those rows from the data the game already has (`MOVE_FX`, `STAT_MOVES`, shapes). A test fails if a move has no class.
- **Abilities and held items**: everything that acts through the damage rules works untouched (type boosters, Choice
  items, Life Orb, Adaptability, weather abilities…). Aura abilities on the grid (`engine/abilities.js`) work between
  adjacent towers. Things that only matter when being hit (Leftovers, Focus Sash, Intimidate) do nothing here and say so.
- **Lift and throw**: a figurine that can lift may throw one enemy back toward the gate (its own 10 s cooldown; bosses are
  too heavy). *(Open question 3: throwing a weakened enemy onto your base to catch it.)*

## Waves

- Generated from the run's seed, so a seed always gives the same waves.
- Wave `n`: enemy level `round(2.5 + 1.5 n)` (the Dungeon's floor curve), +5 for a boss. Species from the same base-stat
  band the Dungeon uses for floor `n`, so early waves are weak Pokémon and everything appears by wave 60.
- Count and spacing grow with `n`. Each wave has a shape: a steady line, a swarm of weak fast ones, a few tanks, mixed.
- **Every 10th wave is a boss wave**: one boss with many times the HP (legendaries from wave 30), with an escort.
- Enemy HP is its real HP stat × a wave multiplier (tuned so a wave takes about as long as it takes to arrive). Walk speed
  comes from its Speed stat, clamped to 0.6–2.2 tiles a second.
- **Flying and levitating enemies** fly straight from the gate to the base from wave 10 on, ignoring the path, so
  long-reach and high-ground towers matter. *(Open question 2.)*
- **Checkpoints**: after a boss wave is cleared, new runs on that map may start from the next wave (11, 21, …), as
  Dungeon runs start from checkpoints. A Lv 100 squad doesn't have to replay wave 1.

## Slots and energy

- **Slots**: 3 at the start; +1 after waves 3, 6, 10, 15, 20, 25, 30, 40, 50 (12 at most).
- **Energy** comes from knockouts (by the enemy's level band), a wave cleared without a leak, and calling a wave early.
- **Spend it on**:
  - opening the next slot early;
  - an instant recall-and-replace (a normal recall leaves the slot empty for 10 s);
  - restoring one figurine's PP;
  - Overdrive: one tower's cooldowns halved for 10 s.
- Energy is run-only. Stars stay the only real currency (house rule).

## Rewards

- **Stars**: by waves cleared, on the Dungeon's scale (`(10 + 2n)` per wave, ×3 for a boss wave), paid at the end.
- **EXP and move XP**: towers earn them from the damage they deal, at a Tower Defense rate tuned so an hour here is worth
  about an hour of Dungeon. *(Open question 5.)*
- **Records**: best wave per map, shown on the map list and the profile.

## The engine: exact, so it can be replayed

- `poketactica/js/td/sim.js`, pure (node-tested), no page code:
  `newRun(seed, setup)`, `step(S, inputsThisTick)`, `view(S)`, `toSnapshot(S)` / `fromSnapshot(o)`.
- Fixed step, 20 ticks a second. Positions are whole numbers (1/256 of a tile). One seeded RNG stream (`rules/rng.js`).
  No clocks, no `Math.random`, no sine / cosine in the rules (only + − × ÷ and square root, which every device computes
  the same).
- Pause and speed are the page's business (0, 1, 2 or 3 steps of 50 ms per 50 ms): they never enter the sim.
- **Inputs** are the only thing a player adds, each stamped with its tick: `place`, `recall`, `rule` (target rule),
  `toggle` (a move on / off), `spend`, `throw`, `call` (next wave early), `retire`.
- Damage goes through one shared function with the battles (see "Shared groundwork").
- `TD_RULES_REV` in every recipe: a later balance change never changes an old replay (the versioned-rules rule).

## Replays, spectating, resume, bets (required)

- **Replay** = the recipe: `{ v, kind: 'td', rev, seed, map, squad (slimmed figurines), startWave, inputs: [[tick, …]], endTick, wave }`.
  A long run is a few hundred inputs: a few KB packed. Stored with the site's tape store (`replay-put`, game
  `poketactica`), listed in the replay library, opened at `/poketactica/?replay=<id>`.
- **The viewer** re-runs the sim: play / pause, 1× 2× 4× 8×, jump to a wave (it keeps a snapshot at each wave start, so
  jumping back is instant), and clip links `&t=<wave>`.
- **Resume**: the run is saved on the device as `{ recipe so far, snapshot }` at every wave start and every input. A
  reload puts it back exactly (the owner's frame-exact resume rule); the snapshot and a re-run from tick 0 must agree,
  and a test checks they do.
- **Live spectating** on the existing channel (`publish-poketactica` / `poketactica-state`): the player publishes the
  recipe header once, then new inputs and the current tick, plus a state hash each wave. A spectator runs the same sim a
  few seconds behind, so they see smooth motion from a trickle of data, and checks the hash; a mismatch or a late join
  loads the last wave-start snapshot. Spectators see what the player sees and nothing more.
- **Spectator bets**: the run reports `prog` = the wave, so friends can bet on "reaches wave N".
- **TV mode / watch hub / alerts**: it is a Poketactica broadcast with the label "Tower Defense · wave 23", so the
  existing registries pick it up. `game_rules_test` stays green (no waiver).

## The page

- The board, sprites, move effects, damage numbers and toasts are Poketactica's. New: enemies walking (Walk sheets
  exist for 1,083 of the 1,178 sprite sets; the rest fall back to Idle, as attack animations do today), HP bars, the road, a tower's reach when selected, the wave bar, lives, energy, speed.
- **Controls** (all three inputs):

| | Keyboard | Controller | Touch |
|---|---|---|---|
| Move the cursor | Arrows / WASD | D-pad | Tap a tile |
| Place / open a tower's menu | Z | A | Tap |
| Back | X | B | Back button |
| Speed 1× 2× 3× | C | X | Speed button |
| Call the next wave | V | Y | Wave button |
| Pause / field menu | Enter | Start | Pause button |
| Turn the camera | Q / E | L / R | ⟲ ⟳ |

- Every menu pauses. Reduced-motion settings are respected as now.
- **Speed target**: 150 enemies and 12 towers at 60 fps on a mid phone. The sim's own cost is checked with the same
  slowed-phone tool as the big-map work (`tools/poketactica/perf_big.mjs`).

## Shared groundwork (also needed by Mystery Maze)

**One function that resolves "this unit uses this move at this aim"** outside a turn-based battle. Today that logic sits
inside `engine/battle.js` (`strike`, `applyDamage`, the forecast). It gets a small exported entry point that takes a
battle-shaped state and an explicit list of tiles, and returns events. The battles call the same code they do now.
Guard: the seeded-match hash check from the big-map work, and every existing replay test, must not change.

## Build stages (one PR each, each with its tests)

1. **Groundwork**: the shared move-resolution entry point; hash and replay guards.
2. **Sim core**: map + path, enemies walking, lives, towers, cooldowns, SP, PP, targeting, waves from a seed. Tests:
   the same recipe twice gives the same hash; a snapshot taken mid-run continues identically; no tower fires a move it
   can't pay for.
3. **Move effects**: the effects table and its generator; statuses, pushes, buffs, weather in real time. A test per row
   of the table above.
4. **The page**: drawing, HUD, placing, tower menu, pause and speed; keyboard, controller, touch (browser test).
5. **Slots, energy, checkpoints, rewards**; a headless auto-player (places greedily) to tune the wave numbers.
6. **Resume, replays, spectating, bets, library**; real-server end-to-end test like `poketactica_spectate_replay_test`.
7. **Camp entry, How to play, records, 3 maps**, full gate.

## Open questions for the owner

1. **PP**: is "no refill by itself; boss waves, energy and the bench restore it" right, or should PP refill slowly like SP?
2. **Flying enemies** ignore the path from wave 10. Yes, or keep everyone on the road?
3. **Catching**: may a lifter throw a weakened enemy onto your base to try to catch it (it becomes a figurine if it
   works, and counts as a leak if it fails)?
4. **Healing moves** do nothing here. Should they refill nearby towers' SP instead?
5. **EXP**: should towers earn EXP and move XP here at all, and should squads be capped (a "everyone Lv 50" variant)?
6. **Maps**: are 3 hand-built maps enough to start, with Map Maker paths later?
