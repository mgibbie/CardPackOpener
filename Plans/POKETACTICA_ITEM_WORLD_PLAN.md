# Poketactica: Plush Gemstones and the Item World

Owner, 2026-11-24:

> I want to add a new type of item called plush gemstones. They boost individual stats. Each poketactica held item
> should have 4 slots to equip these gemstones. We should add an item world for the poketactica mode and the mystery
> maze mode that allow you to go deeper into an item & boost the numbers on it as well as get up to 8 slots & find
> stronger plush gemstones & items that allow you to combine the plush gemstones into stronger ones. Max item level
> should be 100. Only poketactica held items and plush gemstones can level up but the held items level up from the
> item world and the plush gemstones level up from being combined.

Status: stages 1 to 4 built (2026-11-24): the rules, the camp's screens, and the Item World played as battles or as a Mystery Maze. Left: the balance pass (stage 5). See "Build stages" and "As built".

## The owner's answers (question dialog, 2026-11-24)

| Question | Answer |
|---|---|
| How is a dive played? | **Either style, your pick.** Each dive is tactics battles or a Mystery Maze dungeon; both level the same item. |
| A figurine faints in the Item World | **Gone for good, as elsewhere.** The item is never lost; a failed dive keeps what was banked at the last exit floor (every 10 floors). |
| How strong at the top? | **Huge, Disgaea-like.** A level 100 item's effect is three times its level 1 effect. A level 100 gemstone gives +50% to its stat; eight of one stat give +400%. |
| Where do they count? | **Everywhere, Versus too.** |

## The rules

### Held items have a level (1 to 100)
- Every held item starts at level 1. Only the Item World raises it: **one level a floor cleared**.
- A level multiplies the item's own number by `k = 1 + 2 x (level - 1) / 99`: 1 at level 1, 3 at level 100. It is
  the BONUS that grows (a Charcoal Stick's +20% becomes +60%; Leftover Clay's 1/16 becomes 3/16).
- Items with no number of their own gain only slots from levels: the curing beads, Focus Thread, White Moss, Scope
  Sight, and a Choice item's lock.
- Evolution items, Rare Polish, Mystery Maze's items and the Bonus Gauge's rewards have no level.

| Item | Level 1 | Level 100 |
|---|---|---|
| Type boosters (Charcoal Stick ...) | x1.2 | x1.6 |
| Choice Ribbon / Goggles | x1.5 | x2.5 |
| Choice Bandana | Speed x1.5, +1 Move | Speed x2.5, +1 Move |
| Life Marble | x1.3 (costs 1/10 HP a hit) | x1.9 (same cost) |
| Expert Strap | x1.2 | x1.6 |
| Muscle Wrap / Wise Monocle | x1.1 | x1.3 |
| Leftover Clay / Black Glue | heals 1/16 | heals 3/16 |
| Oran Bead | 10 HP | 30 HP |
| Sitrus Bead | 1/4 HP | 3/4 HP |
| Leppa Bead | 10 PP | 30 PP |
| Rocky Cap | 1/6 | 1/2 |
| Shell Chime | 1/8 of damage dealt | 3/8 |
| Focus Knot | 1 in 10 | 3 in 10 |
| Bright Glitter | foes land 10% less | 30% less |
| Wide Loupe | +10% | +30% |
| Assault Padding / Eviolite Chip | x1.5 | x2.5 |
| Weakness Warranty | +2 Attack and Sp. Atk | +4 |
| Lucky Capsule | x1.5 EXP | x2.5 EXP |

### Slots
A held item has **4 slots**, and one more at levels 25, 50, 75 and 100: **8 at level 100**.

### Plush gemstones
- A gemstone is one stat and a level (1 to 100): **HP, Attack, Defense, Sp. Atk, Sp. Def or Speed**.
- In a slot it gives the figurine holding the item **+0.5% of that stat a level** (+50% at level 100). Gemstones of
  the same stat add up.
- A gemstone levels only by being **combined**: two of the same stat become one whose level is the two added
  together (100 at most). It costs one **Stitching Kit**.
- Gemstones and Stitching Kits are found in the Item World. The camp shop sells level 1 gemstones, so the system has
  a way in before the first dive.
- A gemstone can be taken out of a slot again, free.

Names (figurine versions, as the rest of Poketactica's items): Plush Ruby (Attack), Plush Sapphire (Sp. Atk), Plush
Emerald (HP), Plush Topaz (Speed), Plush Amethyst (Sp. Def), Plush Garnet (Defense). Each has its own picture.

### The Item World
- You dive into **one held item from your bag** (not one a figurine is holding).
- A dive is **10 floors**, from the item's level to the next exit floor (10, 20 ... 100). The foes' level rises with
  the floor and with what the item costs in the shop.
- **Tactics style:** ten battles in a row on generated boards (the Dungeon's generator). The tenth is a boss.
- **Mystery Maze style:** one ten-floor Mystery Maze dungeon; a boss guards the last stairs.
- Clearing the dive **banks** it: +10 levels (the item's new slots with them), and what was found: plush gemstones
  (stronger the deeper the dive) and, from the boss, a Stitching Kit.
- Giving up or losing mid-dive banks nothing from that dive. The item keeps what earlier dives banked.
- A fainted figurine is gone for good, in either style.
- A tactics dive in progress is saved between floors, as a Dungeon run is.

## How it is stored
- `fig.held` stays the item's id. A figurine holding an item with a level or gemstones also carries
  `fig.gear = { lv, gems: ['atk:12', ...] }`. It goes wherever the figurine goes (a trade, a loss).
- In the bag an item is `items[uid] = id` as before; its state, if it has any, is `gear[uid]`.
- Loose gemstones: `gems[uid] = 'atk:12'`. Stitching Kits are goods (`items`), kind `kit`.
- A recipe's figurines keep `gear`, so a replay and a friend's live view play the same numbers.
- No rules revision is needed: a figurine with no `gear` plays exactly as before (the pinned fingerprints hold).

## Build stages
1. **Rules and data.** `gear.js` (levels, slots, gemstones, combining), the collection (clean, merge, the server's
   copy), the engine reading an item's level and a figurine's gemstones in every mode. No screens yet.
2. **The camp.** An item's own screen (level, slots, gemstones in and out), combining, gemstones and kits in the
   shop and the Inventory, pictures.
3. **The Item World, tactics style.**
4. **The Item World, Mystery Maze style.**
5. **Help, wiki, balance pass** with the dive measured by the game's own AI.

## As built
- **Tactics dive** (`itemworld.js`, `main.js` target kind `item`): a floor is the Dungeon's generator with the foes' levels set by `itemFoeLevel(floor, item)` = 5 + floor x (1.2 + price / 100), a boss 5 over. The dive is kept in `magepunk_poketactica_itemworld_v1` between floors. A lost floor ends it; giving a floor up leaves it waiting.
- **Mystery Maze dive** (`mm/dungeons.js` `itemDungeon`): a dungeon with the id `iw-<item>-<level>`, so a run's recipe finds it again (resume, replay, live). Its wild Pokémon are those of one of the eight story dungeons (later ones for deeper items) at the item's levels; the last floor is the exit, that dungeon's boss. It pays no clear prize and keeps no dungeon record. Clearing it banks the level and the finds of every floor of the dive; escaping keeps the Mystery Maze bag but banks nothing.
- **Finds** (`findsOf`): a plain floor a gemstone half the time, level about 1 + floor / 4 (plus up to floor / 6); an exit one at 1.5 times that and a Stitching Kit, two gemstones from floor 50. A whole item (floors 2 to 100) gives ten kits.
- One dive at a time. The item being dived into cannot be put on a figurine. A dive whose item has left the bag still brings out its finds.
- The shop sells level 1 gemstones (60 stars); kits come only from exits.

**Not done:** the balance pass. Nothing has been measured by play or by the AI: the foe levels, the finds' levels and the ceiling the owner chose (a level 100 item with eight level 100 gemstones is +400% of a stat) are first numbers.

## Open questions
- Whether Versus should cap item levels after all, once testers have level 100 items (the owner chose "everywhere").
- Whether gemstones should be tradeable. Not built: figurines trade with what they hold, loose gemstones do not.

## Measured (2026-11-27): the bonus curve and the gemstone percentages (modes plan item I4)

`node tools/poketactica/gear_measure.mjs` plays the Tower Defense Road's auto-player (Meadow Loop, 12 figurines, 4 runs
a case) with the same squad holding nothing, then each its type's booster at a level, then that with every slot full
of gemstones (half Attack, half Sp. Atk).

**The sums**

| Item level | Bonus | A type booster's moves | Slots | All slots Lv 100 gemstones, one stat |
|---|---|---|---|---|
| 1 | x1.00 | x1.2 | 4 | x3.0 |
| 25 | x1.48 | x1.3 | 5 | x3.5 |
| 50 | x1.99 | x1.4 | 6 | x4.0 |
| 75 | x2.49 | x1.5 | 7 | x4.5 |
| 100 | x3.00 | x1.6 | 8 | x5.0 |

**Waves reached**

| Squad holds | Lv 20 squad | Lv 40 squad |
|---|---|---|
| nothing | 15.8 | 24.0 |
| item Lv 1 | 16.5 | 25.3 |
| item Lv 25 | 17.0 | 26.0 |
| item Lv 50 | 17.0 | 26.0 |
| item Lv 100 | 17.8 | 26.3 |
| item Lv 50, Lv 25 gemstones | 18.0 | 27.5 |
| item Lv 100, Lv 50 gemstones | 20.0 | 32.5 |
| item Lv 100, Lv 100 gemstones | 21.8 | 33.0 |

**What it says**

- An item's LEVEL is worth little on its own: about one wave from level 1 to level 100 (a type booster goes from x1.2
  to x1.6 on its own type's moves only).
- GEMSTONES are the larger part by far: full slots of Lv 50 gemstones add 4 to 8 waves, because they multiply a stat
  outright (8 slots of Lv 100 in one stat is x5). The item's level matters mostly for the slots it opens.
- One map, one mode, one kind of item, the auto-player: it ranks the two, it does not say what a player gets. Nothing
  was changed. If gemstones should be tamed, the number to move is `GEM_PCT` (0.5% a level); if levels should matter
  more, it is the x3 at level 100.
- Pinned by `poketactica_gear_measure_test` (the sums exactly; gemstones against level over three runs).
