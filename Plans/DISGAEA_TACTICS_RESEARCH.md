# Disgaea × Pokémon tactics — research and comparison

Owner, 2026-11-20: "an isometric grid based tactics game based on Disgaea but using the Pokémon battle system / hybrid
with Disgaea", in the 3D-world / 2D-sprite style of MicaSurvivor's 3D Expedition and Dive. This is the research step:
how Disgaea works, how our Pokémon battle system works, where they line up and clash, and what we can reuse. Nothing
is decided yet: the questions for the owner are at the end.

Sources: Disgaea — community wikis, guides and datamines (NIS publishes no formulas; numbers marked *≈* are community
measurements). Ours — `overworld/battle.js` (6,387 lines), `battlecards/pvpbattle.js`, `overworld/pokechess/`,
`micasurvivor/m3d/`. The full source list for Disgaea is at the bottom.

---

## 1. How Disgaea works

### Map and turns
- **Isometric square grid with height.** Each tile has an elevation. Units have **Move** (tiles per turn) and **Jump**
  (the biggest height step they can climb or drop). Height also shifts accuracy (D5+: ≈1% per step above/below) and,
  in some games, damage.
- **Base Panel.** Units deploy from one tile, up to **10 on the map**. It is also the retreat (throw an ally in) and the
  **capture** tile (throw an enemy in).
- **Player phase → enemy phase.** In your phase you act with any units in any order. **Moving is instant and undoable
  until the unit acts. Attacks, specials and items are queued, and resolve in order when you press Execute** (ending the
  turn executes the rest). You can Execute several times per turn. This "plan the whole turn, then watch it go off" is the
  heart of the series.
- **Facing matters**: hitting from the side ×1.25 accuracy, from behind ×1.67 (D2–D4).

### Lift, throw, towers, team attacks, combos
- **Lift & Throw**: a humanoid lifts an adjacent unit (ally, enemy or object) and throws it a few tiles. It extends an
  ally's reach (a thrown ally can still act), drops enemies off ledges or away from Geo Symbols, and captures enemies on the
  base panel. Monsters can be lifted but can't lift. Lifted units stack into **towers** (Tower Attack, D3+).
- **Team attacks**: allies standing next to the attacker may join a normal attack (the % is shown on screen; D5: higher
  in the same squad or with the same weapon).
- **Combos**: every attack after the first in one Execute gets **+10%** (D5: multiplicative, capped ×3 at 20 hits; +10%
  accuracy too) and fills the Bonus Gauge faster.

### Geo Panels and Geo Symbols
- Coloured tiles + pyramid **symbols**: a symbol's effect (ATK +50%, Invincible, Damage 20%/turn, Recover 20%, Enemy Lv
  +N, EXP +50%, No Lift, Warp, Ally Damage, …) applies to **every unit, both sides, on every tile of that colour**.
- **Geo chains**: destroying a symbol repaints its colour's tiles to the symbol's colour, one tile at a time spiralling
  outward. Every unit on a changing tile takes damage (yours too). Any other symbol caught in the repaint is destroyed and
  starts its own repaint. The chain counter fills the **Bonus Gauge** (levels 0–9, each unlocking a reward from a list
  rolled at stage start). Clearing every coloured tile triggers a map-wide explosion bonus.
- Stage design is often a **Geo puzzle**: which symbol to break first, and where to stand.

### Stats and formulas
- HP, SP (pays for specials), ATK, DEF, INT, RES, HIT, SPD, plus Counter, Crit, Move, Jump, Throw range.
- **Damage** (D1–D4): `(Power × ATK / 3 − DEF / 6) × modifiers`; D5/D7 `(Power × ATK − DEF / 2) × mods`;
  D6 `(ATK − DEF / 2) × Power × mods`. The halved defence means **a big enough attack always wins**, which is where the
  series' number bloat comes from.
- **Accuracy** = HIT / SPD × facing × combo × height. **Crits** ×1.5 (D5/D7) or ×2 (D6); a sleeping target is always crit.
- **Levels to 9,999** (D6: 99,999,999), **reincarnation** back to level 1 with bonuses (costs Mana, earned per kill).
  **Aptitudes** (% multipliers per stat) and **weapon mastery** (per weapon type, unlocks weapon skills).
- Buffs/debuffs capped at +100% / −50% (to D6).

### Classes, monsters, skills
- **Humanoid classes** in ~6 recoloured tiers; they lift, throw and use weapons. **Monsters** can't lift; they learn
  innate specials by level. **Magichange** (D3–D5, D7): a monster turns into a weapon for an adjacent humanoid for 3 turns.
- **Evilities**: passive abilities, a unique one plus several bought generic slots. The obvious match for Pokémon Abilities
  (but Disgaea allows several).
- **Skill shapes**: single, line, cross, 3×3, diamond, star, arcs; many rotatable. **Spell tiers** keep the cast range
  and grow the area: Fire (1 tile) → Mega (≈5-tile cross) → Giga (≈3×3) → Omega (large diamond).

### Elements
- Fire, Wind, Ice + Star. Every unit has a **resistance % per element** (e.g. Nine-Tails Fire +50%, Ice −25%), shifted by
  gear. Not cyclic, no STAB. Flexible for build-crafting, much **less readable** than a type chart.

### Progression loops
- **Item World**: every item holds randomly generated floors (30/60/100 by rarity; D5/D6 endless); clearing floors levels
  the item; **Innocents** inside it are subdued and moved between items for bonuses. Boss floors every 10.
- **Dark Assembly**: propose bills (new classes, better shops, cheats), senators vote, you bribe them or fight them.
- **Capture**: throw a weakened enemy onto the base panel; your units inside fight it as a stat check; win and it joins.
- **Others**: Netherworld Hospital (heal/revive, rewards for spending), master–pupil (spells pass along the line),
  Chara World, Squads, **Revenge Mode** (D5 gauge → 3 turns of 100% crits and 1-SP specials), **Overload** (once-per-battle
  ultimates), D6 auto-battle and AI scripting, D7 **Jumbification** (giant units).

### Enemy AI and stages
- Many enemy groups are **passive until you enter their reach** (so you pull them a few at a time); bosses often stand
  still; aggressive units go for the nearest or weakest, prefer area specials, heal, and lift/throw your units.
- Stage types: Geo puzzles, height puzzles (pillars beyond any Jump — throw or tower up), base-panel pressure, defeat-all /
  defeat-boss / reach / survive.

### What players love and dislike
- **Love**: plan-then-Execute turns, combo and throw relays, geo chain fireworks, breaking the game, a grind you tune.
- **Dislike**: monumental grind, **number bloat** (damage in the billions; defence meaningless), **unreadable** chains,
  team-attack odds and hidden formulas, menus on menus, D6's auto-battle hollowing out play.

---

## 2. Our Pokémon battle system, in the terms that matter here

- **One engine for the overworld**, `overworld/battle.js`: a `Battle` class (~126 methods) that holds rules, AI, state,
  input and drawing together. Battles are **1v1 or 2v2 in four fixed slots** (`me`, `meAlly`, `foe`, `foeAlly`).
  Speed + priority order a turn; both sides choose, then it resolves.
- **The damage formula is the real one**: `floor(floor(floor(2L/5+2)·Power·A/D)/50)+2`, then crit (×2, ×2.5 Sniper) ×
  STAB 1.5 × type chart × screens × weather/terrain × ~40 abilities × held items × **spread 0.75** × random 0.85–1.0.
  Stat stages (±6), accuracy/evasion stages, priority (+Prankster, Gale Wings, …), Trick Room.
- **Data**: 1,778 species (base stats, types, level-up learnsets), 882 moves, ~445 move effects (`MOVE_FX`), 318
  abilities (~222 implemented), ~400 items (106 held effects), the full 18-type chart, natures, IVs/EVs, levels to 500.
- **Status, weather, terrain, hazards, screens**: all there (burn/poison/par/sleep/freeze, confusion, leech seed,
  substitute, 4 terrains, Trick Room, Spikes/Stealth Rock, Reflect/Light Screen, Tailwind…).
- **AI**: scores each move (damage as % of HP, KO bonus, status value), with boss trainers smarter (counter-switching,
  potion, Mega). It never has to think about *where* to stand.
- **What a grid game can't take as-is**:
  - **No move has a target or range.** The move data is just `{name, category, power, acc, type, pp, priority}`;
    "hits both foes" or "hits everyone adjacent" lives in hard-coded name sets (`SPREAD_MOVES`, `ALL_ADJACENT`).
  - Rules change state inside on-screen message callbacks, so a turn only finishes when the messages have played.
  - **Unseeded** (`Math.random` ~75 times): battle replays are video-like snapshot tapes, not re-runs.
  - Side-wide effects (screens, hazards, Tailwind) assume two sides, not positions.
- **What lifts out cleanly**: the type chart, stat formulas and stages, natures, `buildMon`, exp curves, the move and
  ability tables, and the damage pieces once separated from the message queue. `battlecards/pvpbattle.js` is a working
  example of a small pure, testable Pokémon turn resolver (it runs on the server for live PvP).
- **PokéChess** is our only Pokémon grid game: a capture starts a real 1v1 `Battle` on its own screen. It proves the
  engine can be embedded, but nothing yet runs Pokémon moves *on* a grid.

---

## 3. Side by side

| | Disgaea | Our Pokémon system | Hybrid fit |
|---|---|---|---|
| Field | Iso grid, height, 10 units | 1v1 / 2v2 slots | New: grid with height (MicaSurvivor's height grid already is one) |
| Turn order | Your phase, then theirs; queue + Execute | Both choose, speed + priority resolve | **The big decision** (see §4.1) |
| Movement | Move + Jump | None | Derive Move/Jump from species (speed tier, types: Flying ignores height, etc.) |
| Damage | `Power×ATK/3 − DEF/6`, defence subtracts | The real Pokémon formula, A/D ratio | **Keep Pokémon's.** The ratio stops number bloat; add Disgaea modifiers on top |
| Physical / magic | ATK/DEF vs INT/RES | Atk/Def vs SpA/SpD by move category | Same idea, already there |
| Elements | % resistances per unit, 4 elements | 18-type chart + STAB | **Keep the type chart**: far more readable |
| Accuracy | HIT/SPD × facing × height | Move accuracy × stages | Pokémon accuracy × Disgaea facing (side/back) and height bonuses |
| Crits | ×1.5, sleeping = always | ×2 (1/16), stages | Pokémon's; "sleeping target = crit" is a nice import |
| Skills | Shaped areas, tiers grow area | 882 moves, no ranges | **Needs a move-shape table** (§4.3) |
| Resource | SP pool | PP per move | Keep PP (per stage), or SP from the move's PP cost |
| Passives | Evilities, several slots | 1 Ability | 1 Ability (+ held item); Evility slots could be a later meta layer |
| Gear | Weapons, armour, Innocents | Held items | Held items; Innocents-style upgrades later |
| Field effects | Geo panels + symbols, chains | Weather, terrain, hazards, screens | **Terrains as Geo colours**, hazards as tile traps, weather map-wide (§4.4) |
| Team play | Team attacks, combos, towers | Doubles spread moves, Helping Hand, partner AI | Combos + team attacks fit; Helping Hand, Follow Me get positional meaning |
| Throw | Humanoids lift/throw | — | Only some units throw (§4.5) |
| Switching | Units go back to the base panel | Switch out of a slot | Base panel = the party bench |
| Capture | Throw onto the base panel | Poké Balls, catch rate | **Throw-to-capture with the real catch formula** — the two systems' best meeting point |
| Growth | Lv 9,999, reincarnation, aptitudes | Lv 500, EVs/IVs, evolution, learnsets | Pokémon growth; evolution mid-campaign is a Disgaea "tier up" |
| Meta loops | Item World, Dark Assembly, Cheat Shop | Overworld, Frontier | Item World ≈ a generated-floor dungeon (MicaSurvivor Dive already generates floors) |
| AI | Passive until triggered, nearest/weakest | Move scoring | Pokémon move scoring × a tile/position search |
| Randomness | Rolls | Unseeded | **Seeded from day one** (replays, spectating, bets need it) |

---

## 4. Where they clash, and options

### 4.1 Turn order — the biggest decision
- **A. Disgaea phases + Execute.** All your units move, queue attacks, Execute; then the enemy. Keeps Disgaea's best
  feature (planning combos and throw relays). Speed then becomes evasion and Move range instead of turn order, and
  priority moves get a new meaning (e.g. resolve first in the Execute queue, or allow a counter).
- **B. Speed initiative** (one unit at a time, fastest first, like Final Fantasy Tactics' CT). Keeps Pokémon's Speed,
  priority, Trick Room and Tailwind exactly as they work today. Loses the plan-the-whole-turn feeling and combos.
- **C. Hybrid.** Phases + Execute, but within an Execute the queue is ordered by priority then Speed (not by the order you
  queued), so Quick Attack and Trick Room still matter, and a slow unit's combo finisher really comes last.
- My lean: **C** — it keeps both games' signature mechanics at the cost of a turn-order preview in the UI.

### 4.2 Damage — keep Pokémon's formula
Disgaea's subtractive defence is the source of its number bloat; Pokémon's A/D ratio and level-based scaling stays
readable at any level. On top of it, add the Disgaea modifiers as ordinary multipliers (the `envMult` list already works
this way): **height** (±10% per level above/below), **facing** (side/back accuracy and maybe +crit), **combo** (+10% per
earlier hit in the Execute, capped), **team attack** (joiner hits at reduced power), **geo effects**.

### 4.3 Moves need a shape
No move has a range or area today. Proposal: one generated table, `move → {range, shape, size, friendlyFire, contact}`,
built once from the move's category and the existing sets, then hand-tuned:
- **Contact physical** (Tackle, Punch moves) → range 1, single.
- **Non-contact / special single** (Thunderbolt, Water Gun) → range 2–4 by power, single (Pulse/Bullet moves longer).
- **`SPREAD_MOVES`** (Rock Slide, Heat Wave) → a 3-wide arc or cone in front.
- **`ALL_ADJACENT`** (Earthquake, Surf, Discharge) → a radius around the user that **hits allies too** — Pokémon's own
  rule, which on a grid becomes real positioning.
- **Beams** (Hyper Beam, Solar Beam) → lines; **Explosion** → big radius incl. allies; **self / ally moves** → self or an
  adjacent ally; **hazards** → place on tiles; **weather / terrain** → map or area; **Follow Me** → taunts in a radius.
- Disgaea's tier idea maps onto evolution lines and move tiers (Ember → Flamethrower → Fire Blast grows the area).

### 4.4 Field effects become geography
- **Terrains → Geo colours.** Electric / Grassy / Psychic / Misty terrain as painted tiles; a terrain-setting move or
  ability paints an area. **Geo Symbols** are objects with a Pokémon flavour (e.g. a Damp Rock that makes its colour
  rainy). Chains keep Disgaea's repaint-and-damage rule.
- **Hazards** (Spikes, Stealth Rock, Toxic Spikes, Sticky Web) → traps on tiles.
- **Screens / Tailwind / Safeguard** → auras around the user, or apply to units on its colour.
- **Weather** stays map-wide (it's already "whole field").

### 4.5 Who lifts and throws?
Disgaea gives throwing to humanoids. Options: (a) Pokémon with the right moves/abilities lift (Strength, Fighting types,
large Psychic users via Telekinesis); (b) **a Trainer unit on the field** — your trainer can't attack but can lift,
throw, use items and capture, and losing them ends the battle (Disgaea's leader rule); (c) both. Throw-to-capture works
in any of them.

### 4.6 Counts and pacing
Disgaea fields 10 units; Pokémon parties are 6. Options: 6 deployed (parties stay Pokémon-sized), or a bigger roster with a
10-unit cap. Stage length and the 3D renderer's phone budget (≈300 sprites at 60 fps measured) are no constraint either way.

---

## 5. What we can reuse

### Rules
- **Lift out of `battle.js`**: type chart, `calcStat`/stages, natures, `buildMon`, exp curves, the data JSON, and the
  damage, accuracy, crit, status and ability pieces of `useMove`, as pure functions over plain unit objects with an
  injected seeded RNG, returning events (like `pvpbattle.js`). Have `battle.js` call the same functions where it can, with
  parity tests, so the overworld and the tactics game can't drift apart (a second engine copy — as `pvpbattle.js` is — is
  the risk to avoid).
- **New**: the grid, turn/Execute loop, move shapes, positional effects, AI over (tile, move, target), capture-by-throw.

### Look (MicaSurvivor 3D)
- **Reusable nearly as-is**: `micasurvivor/m3d/render.js` (terrain mesh from a height grid with the checkerboard tops,
  water, upright billboard sprites with 8 camera-relative directions, blob shadows, hit flash), `fx.js` (move VFX incl. the
  Emerald battle animations by type), `props.js`, the height-grid helpers in `sim.js`/`gen.js`, Three.js r165 (vendored),
  the PMD SpriteCollab sheets for 1,178 species.
- **The grid is already tactics-shaped**: 2 m cells, heights in 1.5 m steps, `footGraph` = a walkability graph where the
  step limit becomes the Jump stat.
- **New**: an orthographic (or narrow-FOV) camera that rotates in 90° steps with zoom, tile highlights for move/attack
  ranges, HP bars over units, **Attack / Hurt / Faint sheet playback** (the sheets are on disk, 3D modes only use Idle and
  Walk today), a turn-order strip, damage previews. `main.js` (1,473 lines) mixes the action camera, loop and input, so
  the loop / sheet loading / damage numbers / hit-stop parts should come out into a shared module.

### House rules (Plans/NEW_GAME_RULES.md) — how this game meets them
- **UI**: Balatro DOM panels over the canvas (MicaSurvivor 3D's `runui.js` pattern), sounds on every button.
- **Controls**: `startInput` — the d-pad / arrows move a tile cursor, Z confirm, X cancel/undo move, C unit info,
  V Execute, Q/E rotate the camera; touch taps tiles; pad as keyboard.
- **Stars**: stage and campaign rewards pay stars.
- **Watch / replay / bets**: a **seeded deterministic engine makes replays a recipe (seed + actions)**, the way Pair of
  Pears does it — small, exact, and the same code drives spectating; bets resolve on win/lose with `prog` = turn.

---

## 6. Owner's decisions (2026-11-20)

1. **Turn order: Disgaea phases.** All your units move and queue attacks; Execute resolves them **in the order you
   queued them**; then the enemy phase. Speed does not set turn order (it feeds evasion / Move range).
2. **Pokémon only on the map — no Trainer unit.** Lifting and throwing belong to some Pokémon (to design: e.g. Strength
   users, Fighting types, big Psychics).
3. **Units are FIGURINES**, a new item type. Figurines are the tactics fighters; they are **found in the overworld** and used
   in this game. **No EVs, IVs or natures** (stats come from species and level only). As items they join the universal
   inventory and trading (so they are valued in stars).
4. **Max level 999, no reincarnation.**
5. **v1 content: both** a hand-built story campaign and an Item-World-style generated dungeon.
6. **Single player first** (with spectating, replays and bets per the house rules); PvP later.
7. **6 units on the map** (party-sized).

8. **Figurines come both ways**: found in the overworld AND won in battle by throwing a weakened enemy onto your base
   tile (odds shown on screen).
9. **Moves: the species' real level-up learnset**, stretched over levels 1–999. A figurine has **1 ability and 4 equipped
   moves**; every move it has ever learned stays in **that figurine's move pool**, and the 4 can be swapped from the pool
   **between battles** (never mid-battle). Nothing learned is ever lost.
10. **In the overworld, figurines turn up everywhere**: hidden items and item balls, a chance when catching a wild
    Pokémon, shops and prize corners (stars), and trainer / gym leader rewards.

## 6b. The questions as asked

1. **Turn order**: Disgaea phases + Execute (A), speed initiative (B), or the hybrid (C, my lean)?
2. **The Trainer on the field**: a trainer unit that throws, captures and uses items (and losing it loses the battle)?
3. **Whose Pokémon**: a standalone roster for this game, or the player's overworld party / box (the overworld is
   login-only)? Does capture add to the same collection?
4. **Scale**: Pokémon-sized levels (to 100, or our 500), or Disgaea-style big numbers? (Research says the bloat is the most
   criticised thing in the series.)
5. **Meta loop for v1**: story campaign of hand-made maps, an Item-World-style generated dungeon, or both?
6. **Multiplayer**: single player first, with PvP / co-op later?
7. **Deployment cap**: 6 (party-sized) or up to 10?

---

## Disgaea sources
Disgaea Wiki (fandom): Damage Formula, Accuracy Formula, Statistics, Critical Hit, Combos, Bonus Gauge, Geo Effects,
Aptitude, Reincarnation, Super Reincarnation, Item Bosses. StrategyWiki: Disgaea D1 Geo Panels / Gameplay / Human
Classes, D2 Battle basics. Akurasu wiki D2 formulas. NIS America official system pages (D5, DD2 Geo, D6). Prima DD2
eGuide (attacking, lift/throw). GamerGuides D5 battle basics / services / Chara World, D6 Evility slots. GameFAQs boards
(D5, D6 damage formula; D4 accuracy; AoD geo panels). Neoseeker (damage formula; geo-chaining). Ludo.guide D5 monsters.
Siliconera (Dark Assembly; D6→D7 interview; Jumbification; D6 review). RPGSite, RPGamer, Push Square, CGM, Prima,
OpenCritic reviews and features (D6, D7). TV Tropes (capture). Numbers marked ≈, and the AI section, are community
observation rather than official.
