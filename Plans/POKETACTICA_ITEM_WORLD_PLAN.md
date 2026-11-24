# Poketactica: Plush Gemstones and the Item World

Owner, 2026-11-24:

> I want to add a new type of item called plush gemstones. They boost individual stats. Each poketactica held item
> should have 4 slots to equip these gemstones. We should add an item world for the poketactica mode and the mystery
> maze mode that allow you to go deeper into an item & boost the numbers on it as well as get up to 8 slots & find
> stronger plush gemstones & items that allow you to combine the plush gemstones into stronger ones. Max item level
> should be 100. Only poketactica held items and plush gemstones can level up but the held items level up from the
> item world and the plush gemstones level up from being combined.

Status: stages 1 to 3 built (the rules, the camp's screens, the Item World played as battles). Stage 4, the Mystery Maze way in, is next. See "Build stages".

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

## Open questions
- Whether Versus should cap item levels after all, once testers have level 100 items (the owner chose "everywhere").
- Whether gemstones should be tradeable. Not built: figurines trade with what they hold, loose gemstones do not.
