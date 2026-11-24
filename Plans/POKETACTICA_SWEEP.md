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

## Moves, fourth pass (battle `RULES_REV` 10, `engine/statusfx2.js`): 40 more
**The owner's rules for permanent loss (2026-11-23):** Perish Song, Destiny Bond, Grudge and Revival Blessing STAY OFF
(no figurine is lost to a move with no counterplay). Healing Wish and Lunar Dance do not make the user faint: they
heal the ally beside it by half and cost the user half its HP (Lunar Dance also cures). Pinned in `poketactica_moves10_test`.
- **Guards:** Substitute (a quarter of its HP; it takes hits and stops a foe's status moves until it breaks), Mist,
  Magnet Rise, Telekinesis, Wide Guard, Quick Guard, Magic Coat, Follow Me, Rage Powder, Spotlight. **Endure was broken**
  the way Protect was (as a one-turn mark it wore off before any foe moved): it now holds until its user's next turn.
- **On a foe:** Disable, Encore, Torment (the battle now remembers each unit's last move), Mean Look, Block, Spider Web,
  Fairy Lock, Octolock (it cannot leave its tile), Attract (half the time it cannot act; figurines have no gender, so it
  works on any foe), Miracle Eye, Defog.
- **The field, 5 turns:** Gravity, Mud Sport, Water Sport, Trick Room (Speed is accuracy on the grid, so the slower one
  is the surer), and Tailwind on allies.
- **Moves that use another move:** Metronome, Copycat, Mirror Move, Sleep Talk, Assist, Nature Power.
- **Held items:** Trick, Switcheroo, Bestow, Recycle, Corrosive Gas, Fling (for the battle: a figurine keeps its item afterwards).
- Gear Up, Magnetic Flux, Power Shift.
- The table says 66 do nothing in a battle or the maze; 29 of those work where the sweep cannot stage them
  (`poketactica/data/move_sweep_checked.json`, each with its own check). **37 really do nothing:** the four above; entry
  hazards (Spikes, Toxic Spikes, Stealth Rock, Sticky Web) and Court Change; Roar, Whirlwind, Teleport, Baton Pass, Shed
  Tail (no switching); After You, Quash, Instruct, Me First, Snatch (no order within a phase); Mimic, Sketch, Transform,
  Conversion 2; Embargo, Magic Room, Wonder Room, Imprison, Ion Deluge, Electrify, Powder; Natural Gift, Stuff Cheeks,
  Teatime; and Splash, Celebrate, Hold Hands, Happy Hour, which do nothing anywhere.
- Not on screen yet: a field effect has no badge; the log has no line for "infatuated", a substitute taking a hit, or a
  called move. The lasting marks do show (tags over the HP bar).
- Memento still makes its user faint (it was carried over before the owner's rule; the user chooses it, as with Explosion).

## Moves, fifth pass (battle `RULES_REV` 11, `engine/statusfx3.js`): hazards, knockback, 9 more
- **Entry hazards are trap tiles.** Nobody switches in on a board, so Spikes, Toxic Spikes, Stealth Rock and Sticky Web are
  laid on the tiles the move covers and stay (16 a side at most). A unit of another side standing on one when ITS side's
  phase ends takes it: an eighth of its HP, poison, an eighth by how Rock hits its types, Speed -1 once. Flying types,
  Levitate and Magnet Rise are over all but Stealth Rock; a Poison type soaks up Toxic Spikes. Rapid Spin clears the ones
  within a tile of its user, Defog the ones within 2 of its aim, Court Change hands them all to the other side. They are
  marked on the board (a triangle and SPK / TOX / ROCK / WEB).
- **In Tower Defense (`TD_RULES_REV` 10)** a tower lays them on the road tiles in reach, and an enemy that walks over them
  takes each kind once (a boss a quarter of the hurt). Sticky Web slows its walk.
- **Not in Mystery Maze:** it has its own traps. There the four still do nothing.
- **Knockback** (the known gap): Roar, Whirlwind, Dragon Tail and Circle Throw push what they reach straight away from
  the user, 2 or 3 tiles, stopping at an edge, a height it cannot step, or another unit.
- Mimic and Sketch (the target's last move, in their place, for the battle), Transform (types, stats, ability, moves; not
  HP), Conversion 2, Stuff Cheeks, Electrify, Ion Deluge, Powder.
- The table: 56 do nothing in a battle, 60 in the maze; 34 of the 56 work where the sweep cannot stage them. **22 really do
  nothing in a battle:** the four the owner keeps off; Splash, Celebrate, Hold Hands, Happy Hour; After You, Quash,
  Instruct, Me First, Snatch (no order within a phase); Baton Pass, Shed Tail, Teleport (no switching); Embargo, Magic
  Room, Wonder Room, Imprison; Natural Gift, Teatime. 125 moves are of no use to a tower.

## Status moves in Tower Defense (`TD_RULES_REV` 9, `td/effects.js`)
The status moves the sweep carried over had no kind in Tower Defense, so a tower that knew only those never fired. 41 now
have a use there (170 moves of no use to a tower -> 129):
- **Boosts for the tower** (timed, like Swords Dance): Belly Drum, Clangorous Soul, Fillet Away, Geomancy, Tidy Up, Take
  Heart, Coaching, Decorate, Spicy Extract, Acupressure; Focus Energy and Dragon Cheer (once: they stay on); Lock-On, Mind
  Reader and Laser Focus (again each time the sure hit is spent). A tower has no HP, so Belly Drum costs it only SP.
- **On an enemy:** Soak, Magic Powder, Forest's Curse, Trick-or-Treat (its type), Gastro Acid, Worry Seed, Simple Beam (its
  ability), Foresight, Odor Sleuth, Miracle Eye, Defog. **Mean Look, Block, Spider Web, Fairy Lock and Octolock stop it
  walking for 2 seconds**; the same enemy cannot be stopped that way again for 6, and a boss walks on.
- **SP** (the owner's rule for healing moves): Wish, Aqua Ring, Ingrain, Swallow, Healing Wish, Lunar Dance.
- **The field:** Gravity and Trick Room, for as long as a weather lasts.
- **Metronome and Nature Power** fire as the move they turn into, reaching 1 to 3 tiles.
- Still of no use, by the mode's design: what guards a unit (Protect, Substitute, Reflect, Mist) and what needs a foe that
  acts (Taunt, Encore, Disable, Attract). Entry hazards on the road would suit the mode; they come with the hazards batch.
- Not re-measured: how much Belly Drum and the stops move the wave a squad reaches.

## Abilities (2026-11-23, first measurement)
`node tools/poketactica/sweep_abilities.mjs` puts each of the 318 abilities a species can have on a unit and plays it
through fixed scenes (entering next to foes; attacking with 56 moves of every type and kind, healthy, hurt, statused, in
each weather; being attacked with the same; the end of the phase with each status and weather; auras; knockouts), next
to the same unit with NO ability and the same dice. Where the two differ, the ability did something. The table is
`poketactica/data/ability_sweep.json`, held by `poketactica_ability_sweep_test`.

**109 of 318 change something. 209 change nothing.** Of 1,778 species, 1,205 have at least one ability that does
nothing here and **489 have only abilities that do nothing**.

Why: Poketactica's battle uses the shared pure rule tables (`overworld/rules/`: damage modifiers, immunities), plus
its own few (entry drops, weather setters, Surges, auras, contact effects). The overworld game's battle has a handler
for nearly every ability, but those handlers live in that game's own battle code and were never carried over.

The most common ones that do nothing, by how many species have them: Swift Swim 56, Keen Eye 53, Chlorophyll 48, Inner
Focus 48, Run Away 48, Rock Head 37, Regenerator 36, Gluttony 34, Frisk 33, Infiltrator 32, Pickup 32, Shell Armor 31,
Telepathy 31, Overcoat 30, Unnerve 30, Oblivious 29, Mold Breaker 27, Shed Skin 27, Cute Charm 26, Ice Body 26, Weak
Armor 26, Defiant 25, Natural Cure 25, Synchronize 25, Prankster 24, Clear Body 23, Hydration 22, Rattled 22, Big Pecks
21, Moxie 20, Poison Touch 20.

The sweep can under-count: an ability whose trigger the scenes never produce (a critical hit that did not roll, a
flinch, a held item) shows as nothing. Each one fixed gets its own check.

### Abilities, first batch (battle `RULES_REV` 7, `engine/abilities2.js`): 59 carried over
Huge Power, Pure Power, Marvel Scale; Swift Swim, Chlorophyll, Sand Rush, Slush Rush, Quick Feet (Speed is accuracy and
evasion on the grid); Shell Armor, Battle Armor, Merciless; Sturdy, Rock Head, Magic Guard; Clear Body, White Smoke, Full
Metal Body, Hyper Cutter, Big Pecks, Keen Eye, Contrary, Simple, Defiant, Competitive; Inner Focus, Oblivious, Own Tempo
and Scrappy against Intimidate; Anger Point, Weak Armor, Stamina, Justified, Rattled, Water Compaction, Steam Engine,
Berserk, Anger Shell, Gooey, Tangling Hair, Aftermath; Skill Link, Serene Grace, Shield Dust, Poison Touch, Infiltrator;
Moxie, Chilling Neigh, As One, Grim Neigh, Beast Boost; Speed Boost, Moody, Shed Skin, Hydration, Healer, Ice Body, Rain
Dish, Poison Heal, and Regenerator (a sixteenth each phase: nobody leaves a board).
- The table now says 165 change nothing; 12 of those are in this batch and work but the scenes cannot trigger them, so
  153 really do nothing.
- The end-of-phase ones run in the maze too (every 10th turn of the unit's own, `MM_RULES_REV` 6), and Magic Guard and
  Poison Heal reach the maze's own burn and poison. Tower Defense does not run them (a tower has no turns).
- Maze difficulty re-measured with abilities working (2026-11-23, auto-player, 10 runs a dungeon at the suggested
  level): figurines lost per run 0.1 / 0.4 / 0.3 / 0.4, then 1.4 / 1.0 / 1.3, Starfall Spire 2.9, Sprout Trial 1.9,
  Ancients' Descent never cleared. Unchanged from before. Tower Defense was not re-measured.

### Abilities, second batch (battle `RULES_REV` 8, `engine/abilities3.js`): 72 carried over
- **The type a move has:** Pixilate, Refrigerate, Galvanize, Normalize, Liquid Voice; Protean and Libero (the user
  becomes the move's type, every time it moves).
- **Ignoring the target:** Mold Breaker, Teravolt, Turboblaze; Unaware; Unseen Fist; Long Reach; Stalwart and Propeller
  Tail (not drawn off by Lightning Rod).
- **The field:** Air Lock and Cloud Nine (weather does nothing while one is on the board); Dark Aura, Fairy Aura, Aura
  Break and the four Ruin abilities (within 3 tiles: in Pokémon they fill the field); Battery, Power Spot, Plus, Minus
  and Flower Gift (the ally beside it); Supreme Overlord; Protosynthesis, Quark Drive, Surge Surfer, Unburden, Tangled Feet.
- **Moves it will not take:** Queenly Majesty, Dazzling, Armor Tail (priority moves, for it and the ally beside it);
  Telepathy; Good as Gold; Overcoat against powder status moves; Magic Bounce.
- **When struck:** Disguise, Ice Face, Color Change, Cotton Down, Sand Spit, Seed Sower, Mummy, Lingering Aroma,
  Wandering Spirit, Innards Out, Liquid Ooze, Synchronize, Mirror Armor, Soul-Heart; Toxic Chain when striking; Early Bird.
- **On landing:** Intrepid Sword, Dauntless Shield, Download, Trace, Hospitality, Curious Medicine, Costar, Screen
  Cleaner; Guard Dog against Intimidate.
- **Berries and the end of a turn:** Ripen, Cheek Pouch, Unnerve, Harvest, Bad Dreams, and Natural Cure (Shed Skin's 1
  in 3 each turn: nobody leaves a board). The last three run in the maze every 10th turn (`MM_RULES_REV` 7).
- The table now says 121 change nothing; 41 of those work (29 from this batch, 12 from the first) but the scenes cannot
  trigger them. They are checked in `poketactica_abilities3_test` and `poketactica_ability_sweep_test`. **80 really do nothing.**
- Maze difficulty re-measured after this batch (same method): 0.1 / 0.4 / 0.3 / 0.4, then 1.4 / 0.9 / 1.2, Starfall
  Spire 2.4, Sprout Trial 1.9, Ancients' Descent never cleared. Unchanged. Tower Defense was not re-measured.
- **Still nothing, by why:** no turn order to act on (Prankster, Gale Wings, Triage, Quick Draw, Stall, Analytic,
  Mycelium Might, Stench and Steadfast's flinch); nobody switches (Emergency Exit, Wimp Out, Stakeout, Zero to Hero);
  form changes (Zen Mode, Stance Change, Schooling, Shields Down, Forecast, Hunger Switch, Battle Bond, Power Construct,
  Multitype, RKS System, Tera Shift, Mimicry, Imposter, Illusion, Commander); no mark for it yet (Cursed Body's Disable,
  Cute Charm's attraction, Truant, Slow Start, Electromorphosis, Wind Power, Wind Rider, Gulp Missile, Toxic Debris's
  spikes); items changing hands (Magician, Pickpocket, Sticky Hold, Symbiosis, Klutz, Cud Chew); copying (Receiver, Power
  of Alchemy, Opportunist, Dancer, Neutralizing Gas); weight (Heavy Metal, Light Metal); gender (Rivalry); nothing to do
  in a battle by nature (Run Away, Pickup, Honey Gather, Ball Fetch, Illuminate, Anticipation, Forewarn, Frisk); waiting
  on the owner's answer about instant knockouts (Perish Body); and the fan-game's own (Persistent, Bloodlust, Energizate,
  Inflated Chest, Infuriate, Rebound, Rebuild, Mountaineer, Quick Charge, Sharp Coral).

## Held items (2026-11-23)
`node tools/poketactica/sweep_items.mjs` puts each of the 48 held items on a unit and plays it next to the same unit
holding nothing, with the same dice, in the three ways the game fights: a turn-based battle (the abilities sweep's
scenes), Mystery Maze (the leader holds it) and Tower Defense (a tower holds it). The table is
`poketactica/data/item_sweep.json`, held by `poketactica_item_sweep_test`.

- **Turn-based battles: all 48 work.**
- **Mystery Maze: all 48 work** since `MM_RULES_REV` 8. The sweep found two that did nothing there: **Leftovers and Black
  Sludge** act at the end of a battle's phase, and the maze has its own end of a turn. They now act every 10th turn of the
  holder's own, the pace the lasting effects use (Leftovers a sixteenth: a little more than the maze's own regeneration).
- **A floor is a battle to a held item** (also rev 8): a berry, a Focus Sash, a Weakness Policy and a White Herb work
  once on each floor, and a Choice item lets go of its move on the stairs. Before, "once a battle" meant once a run.
- **Tower Defense: 28 work, 20 do nothing, by the mode's design.** A tower has no HP, keeps no status and has its PP
  refilled each wave, so what guards, heals or cures has nothing to do: Leftovers, Black Sludge, Shell Bell, all ten
  berries, Focus Sash, Focus Band, Rocky Helmet, BrightPowder, Eviolite, Weakness Policy, White Herb. The held-item
  screen says so for each of them (goods.js TD_IDLE). For the same reason a Life Orb costs a tower nothing.

## The wiki page
The design wiki has a Poketactica page (`#/poketactica`, `designwiki/app.js` poketacticaView): every held item, ability and move
with what it does in each mode. It reads the three tables directly, so it cannot drift from the measurement.
`poketactica/data/ability_sweep_checked.json` lists the abilities that work where the sweep cannot see, so the page shows
them as working. `designwiki_poketactica_test` holds the page to the tables.

## Not started

- Known gaps the move sweep cannot see: knockback is not applied in turn-based battles; the maze has no lift-and-throw,
  no weather upkeep and no held items as floor items.
