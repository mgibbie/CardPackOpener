# Poketactica — Tower Defense: Maze Builder (plan)

A second way to play Tower Defense, in the style of Emberward (research: `Plans/EMBERWARD_RESEARCH.md`). There is no
road. Enemies walk the shortest way from the gates to your base, and you bend that way with **block cards**. Your
figurines stand on the blocks.

**House rule:** same kind of mechanics, our own content. Nothing of Emberward's is copied: not its name, towers,
relics, characters, maps or look. In the game this is called **Maze Builder**.

Status: being built. Stage 1 (the maze) is in; no page reaches it yet. See "Build stages".

## Owner's decisions (2026-11-24)

| Question | Answer |
|---|---|
| What are the towers? | **Your own figurines**, as in Tower Defense today: their levels, moves, abilities and held items; they earn EXP |
| Does a Pokémon's size matter? | **No. One tile each** |
| Run shape | **One map, endless waves** first. (A run of stages with a boss may come later; not in this plan) |
| What does gold buy? | **Placements, block draws and boosts.** Gold replaces slots and energy in this variant |
| Build timer | **None.** The wave starts when you call it |
| Enemies | **Walk only**, as today |
| Bonuses on blocks | **Yes, from what battles already have** (Geo colours, terrain, height). No relics |
| Where it lives | **A choice inside Tower Defense**: "Road" or "Maze Builder" |

Rules that already stand and apply here: a fainted figurine is not lost in Tower Defense; stars are the only real
currency (gold is run-only); keyboard, controller and touch must all work; every mode can be replayed, watched, resumed
and bet on; nothing in the Road mode may change (its replays must stay exact).

## How a run plays

1. **Pick a Maze Builder map and a squad** (up to 12 of your figurines, as today).
2. **Build.** You hold block cards. Lay them on the ground to wall the enemies' way. A line on the board shows the way
   they will walk and how long it is, and it updates as you move a block around before dropping it. There is no clock.
3. **Place figurines on blocks** (only on blocks, or on the map's own rocks). Each costs gold.
4. **Call the wave.** Blocks laid this round lock. Enemies come out of the gate(s) and walk the way shown. Towers fire
   on their own, as today. You may still place, recall and order figurines and buy boosts during the wave. You may not
   lay or lift blocks during a wave.
5. **Wave cleared:** gold, then **pick 1 of 3 rewards**, then new block cards are dealt. Back to 2.
6. **The run ends** when the base falls (20 lives, as today) or you retire. Stars by waves cleared, EXP kept, best wave
   recorded per map: all as today.

## Blocks

- **A block is a raised tile.** It is one level higher than the ground it sits on. Enemies cannot walk on it;
  figurines can stand on it. So a tower on a block already has the high-ground bonus against enemies on the ground
  (+10% a level, the battle rule), and beam / melee / lob height rules apply as they do now.
- **Shapes** (rotate in quarter turns):
  - small: 1 tile; 2 in a line; 3 in a line; 3 in a corner;
  - the seven tetrominoes: I, O, T, L, J, S, Z.
- **Where a block can go:** on free ground tiles. Not on a gate, the base, water, a rock or another block.
- **The way can never be closed.** A block is refused if any gate would lose its way to the base. The ghost turns red
  and the bar says why.
- **Locking.** A block laid in this build phase can be taken back to hand (free) until the wave is called. Then it is
  locked for good, with one exception: **Lift**, a gold boost, takes a locked block with nobody on it back to hand,
  in a build phase only.
- **Why blocks never move during a wave** (Emberward's lesson: a player juggled monsters for 8 hours by removing blocks
  mid-wave). It also keeps the game exact: the way is worked out once, when the wave is called.

### Block cards: the hand

- No deck to manage in the endless mode. Cards come from a **seeded bag**: the 7 tetrominoes and 4 small shapes, dealt
  without repeats until the bag is empty, then refilled (so a seed always deals the same cards, and you never get five
  S pieces in a row).
- **3 cards are dealt** at the start of each build phase (5 before wave 1).
- **Hand limit 6.** Unplayed cards stay. A reward card is never lost to a full hand (it may take you over 6); you just
  cannot draw while over.
- **Draw**: gold buys one more card: 5 gold, +5 for each further draw in the same round.
- **Discard**: any card, for 2 gold.

### Bonuses on blocks (from what battles already have)

A card may carry one bonus. The whole block gets it.

| Bonus | What the figurine on it gets | Already exists as |
|---|---|---|
| Tall | One more level of height (+10%, and more reach for beams) | height |
| Water / Lava / Grass / Ice | +20% to Water / Fire / Grass / Ice moves used from it | living terrain |
| A Geo colour | That colour's panel effect (attack up, no-miss, ...) | Geo panels |

- Bonus cards come **only from rewards**; the bag deals plain blocks.
- To check when building: a Geo panel's effect needs its Geo symbol standing in a battle. Here the block is the
  source, so the panel must work without a symbol. If that is awkward in the engine, Geo colours are dropped from
  version 1 and the other two kinds ship.
- Emberward's lesson: small blocks are the strongest (tighter mazes). So bonus cards are mostly the big shapes, and a
  1-tile bonus block is rare.

## The way enemies walk

- **Shortest way, 4 directions**, from each gate to the base, around blocks, rocks and water. Worked out from a distance
  map flooded from the base; ties broken in a fixed order (up, right, down, left), so the same blocks always give the
  same way. One way per gate.
- Enemies walk flat ground only. A raised tile on the map is a **rock**: no way through, and a figurine may stand on
  it. Water and lava are no way through, and nothing stands on them. (Built so in stage 1: `gridOf` in `td/sim.js`.)
- **Everything already in Tower Defense that says "road"** means this way: where towers aim, where hazards are laid
  (Spikes and the rest go on tiles of the current way; they stay on those tiles if the way later moves).
- Flying and levitating enemies walk it like the rest (owner's rule from the Road mode).
- The line drawn on the board is the real way, with its length in tiles, and the change a hovering block would make
  ("38 -> 46").

## Gold (replaces slots and energy here)

Run-only, as energy is. All numbers are **starting values**, tuned with the auto-player in stage 5.

| Earn | Gold |
|---|---|
| Start | 60 |
| A knockout | 1 + the enemy's level / 20; a boss +10 (today's energy rule) |
| Wave cleared | 10 + the wave number; +5 with no leak |
| Discard a card | 2 |

| Spend | Gold |
|---|---|
| Place a figurine | 20 + 10 for each one already on the board (the 1st 20, the 6th 70, the 12th 130) |
| Draw a card | 5, +5 each further draw that round |
| Lift a locked block | 15 |
| SP refill for one tower | 8 (as today) |
| Overdrive: one tower's cooldowns halved for 10 s | 15 (as today) |

- **Placing costs the same for any figurine.** Your figurines are already as strong as you made them; a price by
  strength would punish a good collection. The rising price does what the 3-to-12 slots do in the Road mode.
- **Recall** gives back half of what that placement cost; in the build phase it was placed in, all of it (an undo).
  No "resting" slot.
- No interest and no carry-over, so there is never a reason to sell before the last knockout (Emberward's lesson).

## Rewards between waves

After each cleared wave, pick 1 of 3, drawn from the seed and shown before you choose:

- a **bonus block card** (most common): a shape with Tall, a terrain or a Geo colour;
- **gold**: 15 + the wave number;
- **2 plain cards** of your choice of shape;
- **1 life back** (rare; never above 20).

After a **boss wave** (every 10th): pick 2 of 4, and one of the four is always a bonus tetromino.

No relics, no talents, no characters, no map of stops: not asked for, and each is new content to balance.

## Waves, checkpoints, rewards outside the run

- **Waves** come from `waveOf` as today (same species bands, shapes, a boss every 10th).
- **Enemy HP needs its own multiplier** here: the walk is as long as you make it, so the Road mode's numbers would be
  far too easy by wave 10. Target for tuning: a careful player with a squad at the wave's level clears wave 10 with a
  plain back-and-forth maze, and waves past 25 need bonus blocks and good type cover.
- **Checkpoints** as today (start from wave 11, 21, ...). A late start gets the gold and block cards an average player
  would have had: starting values 60 + 25 a skipped wave in gold, and 2 cards a skipped wave (rounded down to a whole
  bag). No rewards are back-paid.
- **Stars, EXP, move XP, bets, records**: exactly today's rules. Each Maze Builder map keeps its own best wave.

## What we take from Emberward's mistakes

1. **Stops and a long maze multiply.** Sleep, freeze, paralysis and Mean Look's 2 s stop are already stronger than
   Emberward's slows. In this mode an enemy that has been held still for 3 s in total cannot be held again for 3 s.
   (Maze Builder only; the Road mode is not changed.)
2. **Nothing moves an enemy backwards along the way.** Roar and its kin do not push in Tower Defense today, and that
   stays.
3. **Percent-of-HP damage** (burn, poison, hazards) keeps the boss reduction it has, and is watched in tuning.
4. **No restrictions as content**: no "don't do X" rewards.
5. **Misdrops**: a block is always placed in two steps (put the ghost, then confirm), on every input.

## Controls

| | Keyboard | Controller | Touch |
|---|---|---|---|
| Choose a card | V cycles the hand | Y cycles | tap the card |
| Move the ghost | arrows / WASD | stick / d-pad | tap a tile (or drag) |
| Rotate | C | X | the rotate button |
| Drop / confirm | Z | A | the tick button |
| Back / take back a block | X on it | B | tap the block, "Take back" |
| Call the wave | Enter | Start | the Wave button |

Placing figurines, orders, pause and speed stay as in the Road mode. With no card chosen, Z on a block opens the squad
list as today.

## The engine

- `td/sim.js` gains a mode. A run's recipe says `mode: 'maze'`. `TD_RULES_REV` goes to 11; a Road run plays exactly as
  under rev 10 (guard: the Road mode's seeded hashes and replay tests must not change).
- New, pure files: `td/maze.js` (blocks, shapes, rotation, legality, the flood and the way), `td/cards.js` (the bag,
  the hand, rewards). The sim asks them; they know nothing of drawing.
- `S.paths` stops being fixed: it is worked out when a wave is called and kept in the state (so a snapshot resumes
  exactly). `S.onPath` follows it.
- New inputs, all recorded for replays: `block` (card, x, y, turns), `unblock`, `lift`, `draw`, `discard`, `pick`, `go`.
- A block changes the board (`B.map.height`, and its bonus the ground / Geo layer), so drawing, reach and height rules
  need nothing new.
- Maps: the Road format without `paths`, with `gates: [[x, y], ...]` and `base`. `mapProblems` checks every gate
  reaches the base on the empty map.

## Maps for version 1 (3, hand-built)

1. **A small open field**, one gate, a few rocks: learn to fold the way.
2. **Two gates** on opposite sides: every block changes two ways at once.
3. **A wide field with water and a ridge**: the natural way is short, room for a long maze, terrain that suits Water
   and Ice blocks.

Later, not in this plan: Maze Builder maps from Map Maker.

## Build stages (one PR each, each with its tests)

1. **(Built.) The maze, pure.** `td/maze.js`: shapes, rotation, legality, the flood, the way, tie-breaks. Enemies in the sim
   walk a worked-out way. Tests: a way is never closed; the same blocks give the same way; the Road mode's hashes are
   unchanged. As built: `block` and `unblock` are free and unlimited until stage 2 puts cards and gold behind them;
   a Maze Builder run is any map with `gates` (no `mode` field needed); the wave is called with the existing `call`
   input; `TD_RULES_REV` stays 10 until the page ships in stage 4, since no Maze Builder run can be recorded before then.
2. **Cards and gold.** The bag, dealing, hand limit, draw, discard, take back, lock, Lift; gold in place of slots and
   energy; rewards. Tests: a seed deals the same cards; a reward is never lost to a full hand; nothing can be bought
   without the gold; snapshot mid-build resumes exactly.
3. **Bonus blocks.** Tall, terrain, Geo. A test per kind that the figurine on it really gets the bonus.
4. **The page.** The Road / Maze Builder choice, the hand, the ghost and its two-step drop, the way line and its
   length, the reward pick. Browser test on keyboard, controller and touch.
5. **Maps and tuning.** The 3 maps; the auto-player learns to build (greedy: the block that lengthens the way most,
   towers at the folds); the HP multiplier, gold numbers and the hold limit are tuned to the targets above, with the
   measured numbers written into this plan.
6. **Resume, replays, watching, bets, records; How to play and the first-run coach; wiki rows.** Real-server
   end-to-end test, full gate.

## Not in this plan

A run of stages with a boss; relics; talents; characters; enemies with abilities or that switch towers off; a timer;
footprints bigger than one tile; a daily challenge and leaderboards; a short puzzle mode. Each was offered or
considered and left out; any can be a later plan.

## Open questions

1. Geo colours on blocks depend on the engine check noted above.
2. The name "Maze Builder" is mine; say if you want another.
