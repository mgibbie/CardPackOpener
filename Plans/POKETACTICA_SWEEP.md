# Poketactica: the moves and abilities sweep

Owner, 2026-11-23: check every move, ability and held item in every mode (Story, Dungeon, Versus, Tower Defense,
Mystery Maze), with a table, a test per cell and a wiki page.

## How a move is checked
`node tools/poketactica/sweep_moves.mjs` fires each of the 882 moves for real and compares the board before and after.
- **turn**: the turn-based battle. Story, Dungeon and Versus share one engine (`engine/battle.js`), so one column covers
  all three.
- **maze**: Mystery Maze (the same hit on the maze's 8-way geometry).
- **td**: Tower Defense (what a tower does with the move, by that mode's own rule).

Each move is tried from every tile it can be aimed at, with three dice, in two set-ups: fresh, and "set" (foes asleep
and hurt, the user and its allies hurt, which moves like Dream Eater or Rest need). A cell lists what changed: damage,
heal, status, stat, moved, weather, terrain, and so on. An empty cell is a move that does nothing there.

The table is `poketactica/data/move_sweep.json`. `poketactica_sweep_test` runs the sweep again and holds the table to
it cell by cell, so a move that stops working fails the gate. Rewrite the table on purpose with `--write`.

## Where it stands (2026-11-23, after the second pass)
| | does something | does nothing | at the start |
|---|---|---|---|
| turn-based battle | 763 | 119 | 184 |
| Mystery Maze | 763 | 119 | 184 |
| Tower Defense | 712 | 170 | 185 |

(The sweep's set-up cannot show ten more that do work but need the right target: Flower Shield and Rototiller a Grass
type, Venom Drench a poisoned foe, Haze / Psych Up / Topsy-Turvy / Heart Swap / Power Swap / Guard Swap stages to act
on, Power Trick unequal stats. Each has its own check in `poketactica_sweep_test`. So the true count is 109.)

- No move throws an error in any mode.
- The maze does with a move exactly what a battle does (one roll-of-the-dice difference in 882).

### Fixed in the first pass: 22 attacking moves that always failed
Their power is not a number in the tables; Pokémon works it out when the move is used. The engine had no rule for
that, so they failed with "no power" everywhere, and a tower never fired them. Now (`engine/dynpower.js`, battle
`RULES_REV` 4):
Return, Frustration, Veevee Volley, Pika Papow, Gyro Ball, Electro Ball, Flail, Reversal, Wring Out, Crush Grip, Hard
Press, Punishment, Trump Card, Low Kick, Grass Knot, Heavy Slam, Heat Crash, Magnitude, Present, Beat Up, Psywave and
Final Gambit.
- There are no weights in this game's tables, so the four weight moves use a fixed "expected" power (Low Kick and Grass
  Knot 60, Heavy Slam and Heat Crash 80).
- Battles, maze runs and Tower Defense runs recorded before the change replay by their own rules (the revision is
  stored with each).
- Versus bumped its protocol to 5, so both players are on the same rules (an open old tab is told to reload).

### Fixed in the second pass: 53 more (battle `RULES_REV` 5, `engine/statusfx.js`)
- **Status moves the shared tables had no entry for (47).** Belly Drum, Fillet Away, Clangorous Soul, No Retreat,
  Geomancy, Charge, Tidy Up, Take Heart, Stockpile, Swallow, Acupressure, Focus Energy, Dragon Cheer, Coaching, Aromatic
  Mist, Decorate, Flower Shield, Rototiller, Noble Roar, Parting Shot, Venom Drench, Spicy Extract, Memento, Strength
  Sap, Haze, Psych Up, Topsy-Turvy, Heart Swap, Power Swap, Guard Swap, Speed Swap, Power Split, Guard Split, Power
  Trick, Pain Split, Heal Bell, Aromatherapy, Refresh, Purify, Psycho Shift, Soak, Magic Powder, Camouflage, Forest's
  Curse, Trick-or-Treat, Reflect Type, Conversion.
- **The moves that answer a hit (5).** Counter, Mirror Coat, Metal Burst, Comeuppance, Bide. A unit now remembers the
  last hit it took (how much, physical or special, from whom); these send it back at whoever struck, doubled (one and a
  half times for Metal Burst and Comeuppance). Bide is simplified to "the last hit, doubled".
- **Spit Up**, now that Stockpile exists.
- Departures from Pokémon, on purpose: Parting Shot only lowers (nobody switches out on a board); Geomancy has no
  charging turn; Haze clears everyone on the board.
- A tower does not use Counter's kin (nothing hits a tower). The other 47 are still "no use" to a tower: Tower Defense
  has no rule yet for what these would do there.
- The forecast does not yet preview Counter's kin.
- Versus protocol 6. Recordings made under earlier rules replay by them.

### Still doing nothing: 119 moves (109 really, see above)
- **3 attacking moves.** Fling and Natural Gift need a held item to spend. Endeavor works, but not in the sweep's
  set-up (the user has more HP than its target).
- **Need an every-turn upkeep in both the battle and the maze:** Leech Seed, Aqua Ring, Ingrain, Wish, Yawn, Perish
  Song, Nightmare.
- **Do nothing by design (cosmetic in Pokémon too):** Splash, Celebrate, Hold Hands, Happy Hour.
- **The rest, roughly:** screens and team guards (Reflect, Light Screen, Safeguard, Mist, Aurora Veil, Tailwind);
  entry hazards (Spikes, Stealth Rock, Toxic Spikes, Sticky Web); move and ability meddling (Disable, Encore, Taunt,
  Torment, Skill Swap, Role Play, Transform, Mimic, Sketch); stat swaps (Power Swap, Guard Swap, Heart Swap, Psych Up,
  Haze); items (Trick, Switcheroo, Bestow, Recycle); doubles-only helpers (Follow Me, Helping Hand, After You, Quash);
  and one-offs (Leech Seed, Substitute, Belly Drum, Wish, Yawn, Perish Song, Destiny Bond, Baton Pass, Teleport).
- In Tower Defense, 11 more are of no use to a tower by design (Protect and its kin, Ally Switch): nothing attacks a
  tower.

## Not started
- Abilities (318) and held items (48): the same kind of sweep.
- The wiki page built from the table.
- Known gaps the move sweep cannot see: knockback is not applied in turn-based battles; the maze has no lift-and-throw,
  no weather upkeep and no held items as floor items.
