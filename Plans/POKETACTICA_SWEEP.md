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

## Where it stands (2026-11-23, after the third pass)
| | does something | does nothing | at the start |
|---|---|---|---|
| turn-based battle | 790 | 92 | 184 |
| Mystery Maze | 790 | 92 | 184 |
| Tower Defense | 712 | 170 | 185 |

(The sweep's set-up cannot show twelve of the 92 that do work but need the right target: Flower Shield and Rototiller
a Grass type, Venom Drench a poisoned foe, Haze / Psych Up / Topsy-Turvy / Heart Swap / Power Swap / Guard Swap stages
to act on, Power Trick unequal stats, Spite a foe's PP, Endeavor a user with less HP than its target. Each has its own
check in `poketactica_sweep_test`. So 80 moves really do nothing.)

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

### Fixed in the third pass: 28 more (battle `RULES_REV` 6, `statusfx.js` EXTRA6)
Marks that last on a unit (`unit.fx = { name: turns left }`), and Leech Seed.
- **Screens and guards, 5 turns on each ally in the move's shape:** Reflect and Light Screen halve a physical / special
  hit (a critical hit goes through), Aurora Veil is both, Safeguard turns a foe's status move away, Lucky Chant stops
  critical hits.
- **On a foe:** Taunt (3 turns: no status moves; the battle, the maze and the computer all ask the same refusal), Heal
  Block, Foresight and Odor Sleuth, Leech Seed (an eighth of its HP a turn to whoever planted it; Grass is immune), Yawn
  (asleep at the end of its next turn), Nightmare (a sleeper loses a quarter a turn), Spite (4 PP off a move).
- **On the user or an ally:** Aqua Ring and Ingrain (a sixteenth back a turn), Wish (half, two turns on), Endure, Lock-On
  and Mind Reader (the next attack cannot miss), Laser Focus (the next is a critical hit), Helping Hand (an ally's next
  attack at one and a half times).
- **Abilities:** Gastro Acid, Worry Seed, Simple Beam, Entrainment, Role Play, Doodle, Skill Swap.
- A mark's "turn" is the end of the unit's side's phase in a battle, and every 10th turn of the unit's own in the maze
  (as a burn bites there).
- **On screen (2026-11-23):** a unit wears its marks as short tags over its HP bar (RFL, TAUNT, SEED ...), its panel
  names them with the turns left, and each one pops up and is logged when it lands (battles and the maze).
- **Owed:** Ingrain does
  not root the user in place. Tower Defense has no rule for any of these.
- Versus protocol 7.

### Still doing nothing: 80 moves
- **Held back for the owner's call (they kill outright, and a fainted figurine is gone for good):** Perish Song, Destiny
  Bond, Grudge. Also Healing Wish, Lunar Dance and Revival Blessing (the user faints / a fainted ally returns).
- **Need a held item to spend or move:** Fling, Natural Gift, Trick, Switcheroo, Bestow, Recycle, Stuff Cheeks,
  Corrosive Gas, Embargo, Magic Room.
- **Entry hazards (a tile effect is needed):** Spikes, Toxic Spikes, Stealth Rock, Sticky Web.
- **Need the engine to remember the last move used:** Disable, Encore, Torment, Mimic, Sketch, Copycat, Mirror Move, Me
  First, Instruct, Conversion 2. Also the moves that call another move: Metronome, Assist, Sleep Talk, Nature Power.
- **Trapping and forced movement:** Block, Mean Look, Spider Web, Fairy Lock, Octolock, Roar, Whirlwind, Teleport,
  Baton Pass, Shed Tail.
- **Turn-order and doubles-only helpers, with nothing to act on here:** After You, Quash, Follow Me, Rage Powder,
  Spotlight, Quick Guard, Wide Guard, Trick Room, Tailwind.
- **Field rules:** Gravity, Wonder Room, Mud Sport, Water Sport, Ion Deluge, Electrify, Powder, Court Change, Defog,
  Magnet Rise, Telekinesis, Mist, Miracle Eye, Imprison, Snatch, Magic Coat.
- **One-offs:** Substitute, Transform, Attract, Teatime, Power Shift, Gear Up and Magnetic Flux (they need the Plus /
  Minus abilities).
- **Do nothing by design (cosmetic in Pokémon too):** Splash, Celebrate, Hold Hands, Happy Hour.
- In Tower Defense, 11 more are of no use to a tower by design (Protect and its kin, Ally Switch): nothing attacks a
  tower.

## Not started
- Abilities (318) and held items (48): the same kind of sweep.
- The wiki page built from the table.
- Known gaps the move sweep cannot see: knockback is not applied in turn-based battles; the maze has no lift-and-throw,
  no weather upkeep and no held items as floor items.
