# Emberward — research for a maze-building Tower Defense variant

Researched 2026-11-23 for a Poketactica Tower Defense variant "based on Emberward". This file is research only; the
plan comes next. It has three parts: what Emberward is, what that means for us, and (Appendix) a full rules reference
rebuilt from the developer's own patch notes.

**House rule that applies:** we build a mode with the same *kind* of mechanics. We do not copy Emberward's name, its
characters, tower names, relic names, maps or look. Everything named below is reference, not a content list to port.

## Sources and how far to trust them

| Source | What it gave | Trust |
|---|---|---|
| Developer's Steam posts, all 41 (Nov 2023 demo → v1.1.0, 21 Nov 2026), read in full via the Steam news API (app 2459550) | Rules, numbers, every balance change and the reason for it | High. It is patch notes, not a manual: base numbers that never changed are never stated |
| Steam store page | Feature list, modes, dates | High |
| Steam community guides (achievements; a Tana/buff guide; Scrap Tank table; a 170-hour veteran guide) | Buff card list with numbers, 1x1 tower costs, strategy archetypes | Good; player-measured |
| emberward.wiki, emberward.houyulong.com (fan guide sites) | Tower list with footprints and upgrade costs, element numbers, relic names | Mixed. They disagree with each other and with the developer (they still list a Frost Flame and Candle Flame the developer removed, and "Demon Flame" which was renamed). Where they conflict, the developer's notes win |
| Reviews (Rogueliker, Game Atlas, TrueScore, SassyGamers), PC Gamer demo piece | How it feels, criticisms | Good for opinion, thin on rules |
| emberward.fandom.com | Nothing: blocked (HTTP 402) | — |

**Not found anywhere:** hand size, the gold cost of drawing a card, starting gold, rounds per normal stage, base Fire
Source HP, stages per region, shop prices, most tower base stats. These would need the game itself or a video.

## Emberward in one page

Made by one developer (Refic Games). Early Access 25 Jun 2024, 1.0 on 17 Sep 2026, v1.1.0 on 21 Nov 2026. PC only so
far; console ports are planned. Full controller support since v0.4.10 (the developer said it took about 90% of that
patch).

**The idea:** tower defense where there is no road. Monsters walk the shortest way from their spawn points to your Fire
Source. You are dealt tetromino-shaped **block cards**; each block you lay is a wall that bends that way, and **towers
may only stand on blocks**. So every block is two decisions at once: a longer walk for the monsters, and a place for a
tower. The path can never be closed completely.

**One stage**
1. A round is a preparation phase (180 s timer, can be switched off, can be ended early) and then a wave.
2. Block cards are dealt each round from your deck (the "backpack"); extra draws cost gold; there is a hand limit; unplayed
   cards stay in hand; right-click discards.
3. A live preview shows the path as you hover a block. A block can be taken back to hand until it locks.
4. Towers are bought with gold from your loadout of tower *types*, in preparation or mid-wave, and can be sold at a loss.
   Each tower has two upgrades, a red one and a blue one, bought with gold.
5. The next wave's monsters are shown in advance. Monsters that reach the Fire Source take its HP (a normal one 1, a large
   one 5). At 0 the run ends (on Casual it does not).
6. Chests dropped mid-wave offer a pick of three: coins, healing, or a buff card to put on a tower.

**One run** is one region: a branching map of stages ending in a boss. You start at the Academy (pick a starting set of
tower types and a relic). After each stage you pick 1 of 3 new tower types and get a block card, and may put a **rune** on
it. The maze, the built towers and the gold do **not** carry to the next stage; the deck, its runes, the tower types, the
relics and the Fire Source's HP do. Other map stops: shop, workshop (reshape a block, remove a card, add a rune),
campsite (heal / wheel / altar pacts: accept a handicap next stage for a strong relic).

**Depth comes from**
- **Tower footprints**: 1x1, 1x2, 1x3, 2x2, 2x3 (L), 1x5, 3x3 and oversized. Big towers are strong, so you must leave
  pockets in the maze for them. About 45-50 tower types.
- **Runes on block cards** (one per card): they make a buff tile on the block (damage, range, an element, gold, crit,
  cheaper upgrades), or change the block (double size, five free throwaway towers, mirror copies).
- **Five elements with a status each**: Fire burns (% of max HP), Ice chills (5% slow a stack, 7 at most), Electric
  builds Charge to a short stun, Poison stacks damage over time (wants a long path), Arcane crits healthy monsters. Relics
  (about 80) mostly reward mixing two of them.
- **Map gimmicks per region**: ground buff tiles, corrupted tiles, water and obstacles, minecarts on rails carrying
  towers, blocks freezing, blocks conducting electricity to machines, portals, void that swallows blocks.
- **Monsters that attack the plan, not the base**: they "malfunction" (switch off) towers, taunt, summon, split, speed
  up. One (Crusher Bot) is beaten by maze shape alone.
- **Characters and flames** change one rule each (interest on gold; tiny blocks but dearer draws; towers dearer but buffs
  permanent; a flame that levels up from kills).
- **Meta**: EXP buys a small talent tree (done in 10-15 runs, reviewers say too fast); three difficulties; after the last
  region, eight optional handicaps of three levels each ("Infernal Shards", level 24 at most).

**Modes**: Adventure; Endless (pick a map, choose rewards between waves, leaderboards, daily and weekly challenge);
a 3-round puzzle mode with a fixed kit (the developer's answer to runs being long).

## What the developer learned (the most useful part for us)

The full list of 42 is in the Appendix, section 13. The ones that should shape our design:

1. **Slows and mazes multiply.** "After everyone started building mazes seriously, the original slowing effect became too
   strong." Stuns got an immunity window (3 s immune after 3 s stunned) and then a decaying resistance.
2. **Anything that moves monsters backwards breaks the game.** Portal, black hole and gilding towers are limited to one
   on the field: "otherwise you can win every game with a full line of portals". A tower that deletes blocks let a player
   juggle monsters for 8 hours and was pulled from Endless.
3. **Percentage damage needs caps** or it becomes the only answer in Endless.
4. **Small blocks are the strongest blocks** (tighter mazes, stacked buff tiles), so the small-block character pays double
   to draw.
5. **Sinking everything into one tower is fun once, then boring**: the tower that eats other towers got a hard cap.
6. **Restrictions feel worse than goals.** Quests of the form "don't do X" and Endless's random handicaps were both
   replaced by positive ones.
7. **Optional content must pay nothing** or players feel forced to do it.
8. **Runs are long by nature** in a maze TD. The fixes: an optional timer, speeds up to "Ultra Fast", and the short puzzle
   mode. A marathon across all regions was refused outright.
9. **Don't make players sell before the last kill** to bank gold; make carry-over automatic or absent.
10. **The timer stressed players**; it is now optional, and a relic pays for ending early instead.
11. **Tower balance is not equal damage**: awkward shapes and ranges get better numbers; towers that work anywhere get
    worse ones.
12. **A full hand must never eat a reward card.**

**What reviewers and players complain about:** block placement is fiddly and mis-drops happen; runs feel alike once you
know the systems; some towers dominate; meta progression is over quickly; few maps at first.

## What this means for a Poketactica variant

What we have today (Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md): fixed road, towers are your own figurines standing off the
road, each fires its four moves on cooldowns, lives 20, endless waves, slots and energy, exact replays.

| Emberward | Closest thing we already have | Gap |
|---|---|---|
| No road; shortest path around walls | A fixed `path` per map; `S.onPath` | A deterministic pathfinder, re-run on every block; the "never fully blocked" check; several spawns |
| Block cards, deck, hand, draw, recall | Nothing | New: shapes, rotation, a hand UI that works on keyboard, pad and touch |
| Towers only on blocks; footprints 1x1 to 3x3 | A figurine stands on any free tile; all are 1 tile | Decide whether size matters (Pokémon height/weight could give a footprint) |
| Gold buys and upgrades towers | Slots + energy; figurines are your own and level up outside the run | The big design question: what does gold buy when the towers are your figurines? |
| Red / blue upgrade per tower | Move levels, evolutions, held items | Possibly none needed |
| Elements + statuses + relic combos | The real type chart, real statuses, abilities, held items, weather, hazards, Gravity/Trick Room in TD | Already richer than Emberward; relics would be new |
| Runes → buff tiles | Geo panels, living terrain, height bonus | Runes can simply lay Geo panels / terrain / height |
| Fire Source HP, and it shoots | 20 lives | Small |
| Region map with shops and rewards | Dungeon floors and Mystery Maze runs | A node map is new; could reuse maze items as "relics" |
| Malfunction, taunt, summoners | Enemies only walk (owner's rule) | Owner's rule stands unless changed |
| Chests with buff cards | Maze items (orbs, seeds) | Could reuse |

**Fits us well:** exact replays (pathfinding is deterministic); the status moves that already work on a tower (41 of
them); hazards on the road; knockback now exists (and Emberward warns it must be limited).

**Risks:** touch and controller placement of rotated blocks (the one thing reviewers call fiddly, on mouse); run length;
slow + maze + our stronger statuses (sleep, freeze, paralysis, Mean Look's 2 s stop) will stack harder than Emberward's
did; Roar-type pushes need the "one on the field" or resistance treatment from day one.

## Decisions the plan needs (owner)

1. **What are the towers?** (a) your own figurines, as in Tower Defense today; (b) a per-run draft of Pokémon unrelated
   to your collection, as Emberward drafts tower types; (c) your figurines as the starting set, drafted extras on top.
2. **What does gold do?** Buy placements (each figurine has a price by its level or base stats), buy block draws, and
   buy in-run boosts. Or keep slots + energy and use gold only for blocks.
3. **Does size matter?** One tile each (simple), or footprints by the Pokémon's size (Emberward's central puzzle, much
   more UI work).
4. **Run shape:** one endless map as today; or a short region of stages with a boss and picks in between (Emberward's
   Adventure). The second is far more work.
5. **Timer:** none (recommended; touch players and replays), or optional.
6. **Do enemies stay walkers only?** Emberward's enemy variety is mostly things that switch towers off.
7. **Name and place:** a second Tower Defense tab, or a separate mode in the hub.

---

# Appendix — rules reference rebuilt from the developer's notes

Conventions used here:
- Plain statements are read directly from the notes. "(inferred)" marks a conclusion drawn from a passing mention.
- "NOT STATED" means the notes never give the value. The notes are patch notes, not a manual, so many base numbers (hand size, draw cost, wave counts, most tower costs) never appear.
- Where a value changed, the newest value is given first and the history follows in brackets.
- The notes use "round", "turn" and "wave" interchangeably for one preparation-plus-battle cycle, and "level" / "stage" for one map. "Relic" was sometimes written "artifact", "fire source" = "flame".

---

### 1. Core loop of a battle

#### Phases
- A stage alternates a **preparation phase** and a **battle phase** each round. (inferred from "Preparation phase", "battle phase starts", "at the start of each round", "at the end of each round")
- **Preparation countdown timer**: fixed at **180 seconds**, **210 seconds in the Sealed Citadel** (v0.4.7). [Before v0.4.7 the talent "Superior Efficiency" lengthened it; that talent was removed and its effect made baseline. v0.1.3 "increased the preparation time between each battle".]
- The timer can be switched off entirely in settings ("Remove countdown timer: there will be no countdown timers in the levels, nor will time-related items appear").
- The player can start the battle early "by holding down the space bar". The relic Time-Saving Device pays for time left on the timer, so starting early is an intended choice.
- "Idle Auto Pause" setting: with no input for 30 seconds, the game pauses "within the 30 seconds before battle begins".
- Game speed: Slow / Normal / Fast / Ultra Fast (v0.1.7), max speed raised a further 50% in v0.4.12 (flagged as "still testing"). Space toggles 0.5x and normal.
- Chrono Traveler has his own timer: 60 s first round, 15 s later rounds (see section 6).

#### Rounds per stage
- NOT STATED for normal stages.
- The only hints: the achievement "defeat the Void Depths boss before the end of round 8" (so that boss stage runs longer than 8 rounds); the Skeleton King presents a trial "every three turns" with five options each usable once; Sacred Flame range grows "+2 tiles per round, up to +20" (so 10 rounds is a meaningful length); Enigma Sanctum is 3 rounds.
- The player can see the monsters of the next wave, with detailed information (v0.1.7, v0.3.4).

#### Block cards: deck, drawing, hand
- Block cards live in a **backpack** (the deck); a "card deck" and a "backpack icon" sit beside the hand, and hovering the backpack shows the block cards in it.
- There is a **Draw Card** action (Steam Deck hotkey O). Drawing has a **cost** — amount NOT STATED; currency is gold (inferred: "Tiny: Card drawing cost is doubled... players will have slightly less cards each round, and need to consider whether to use cards for extending the maze or for build stronger tower"; Cartographer's Manual gives "one free card draw").
- Cards are also dealt automatically each round (inferred: Skeleton King's gift "Draw extra card", stacking up to 10; Adaptive Blueprint "at the end of each round, discard all block cards in hand and draw the same number"; Tana "will now gain buff cards at the start of each turn").
- Unplayed cards stay in hand between rounds (inferred from Adaptive Blueprint and Cursed Tarot "for each card in your hand").
- A **redraw / reroll button** exists in the first round (inferred: "redraw button did not disappear in some situations"; "having too many cards in your hand during the first round could cover part of the reroll button"; "issues related to redrawing cards with Tana").
- **Hand size limit** exists; the number is NOT STATED. Newest rule (v0.4.9): "When you gain extra cards in the game (for example from opening a chest), you will no longer fail to obtain the card because of the hand size limit, but you still cannot draw cards once you exceed the limit."
- Card order in hand matters to some relics ("leftmost card", "rightmost card").
- Cards are played by clicking or dragging (v0.1.2).

#### Discard
- Right-click a card in hand to discard it (added v0.3.0, after players asked for it).
- Discard has no stated cost or reward by itself; relic Gold Furnace pays 1–10 coins per discard; Blessing of Death pays one instant-kill card per 3 block cards discarded.

#### Rotating
- Blocks rotate before placing (inferred: keybind bug "required movement or rotation before placement"; "rotated 2x2 towers misalign"). Key NOT STATED.

#### Placing rules
- Blocks are walls placed on the ground; monsters path around them. A **path preview** updates "immediately while building blocks" (v0.1.7). A setting shows "Maximum Path Length".
- **The path cannot be fully blocked** (inferred): every case where a path became blocked was fixed as a bug ("Fixed a path-blocking issue that could occur when upgrading towers", "placing blocks too far forward could block the path as the stage progressed"), and placing shows error messages.
- Blocks cannot go on water, on obstacles (the relic Blessed Chisel lifts the obstacle rule), on tombstones, or in "non-buildable areas"; "enemy territory" is a restricted zone (it restricted S.C.R.A.B. until 1.0).
- **Towers must stand on blocks** (inferred: the Fort Tower's selling point is that it "can be placed without a block"; "blocks under Poison Towers could be recalled" was a bug).
- Buff tiles and corrupted tiles on the ground apply to whatever is built over them; while placing, "the boost/corruption tiles on the ground will now display their corresponding positions on the block".
- **Building towers during a battle is allowed** (inferred: the Ice pact's penalty is "unable to build towers during battle"; an old quest was "Do not build towers during battle"; Explosive Demolition triggers "when you sell a tower during battle"). The player can queue a tower without enough coins and it is built once the gold arrives (v0.1.8).
- Placing blocks during a battle: NOT STATED.
- Hold Shift to build the same tower repeatedly (optional setting to do it without Shift).

#### Recall and locking
- **Recall** returns a placed block to the hand. Default input is hold-to-recall; a setting makes it instant on right-click ("Does recalling blocks take too much time? Switch it to the right mouse button").
- Blocks become **locked** (inferred): recall only works on blocks not yet locked. Evidence: relic Cartographer's Manual counts "blocks locked"; Wood Elf's Charm and Venom Satchel say "the block it places will be locked immediately"; relic Volatile Blueprint returns "under-construction cards"; the skill **Unlock** exists to reverse it. When exactly a block locks (probably when the battle starts) is NOT STATED.
- A block with a tower on it cannot be recalled (inferred from the Poison Tower bug fix).
- Recalling with a full hand used to delete the block (fixed v0.1.5).

#### Removing / demolishing blocks
- **Unlock** skill: unlocks a placed block; "can also restore blocks that have been turned into lava or ice"; used in the preparation phase it "returns the block card directly to the hand (if there is space)" (stated for Chrono Traveler).
- **Drill Tower** destroys the block under it (see section 2).
- **Joker** has a "block-removal mechanic" (details NOT STATED).
- Removing a card from the deck permanently is a Workshop action (Dismantle).

#### What carries between stages
- Each stage is a different map; the maze and built towers do **not** carry over (inferred: "since resources are limited at the start of each stage"; Silas's fix "You don't need to sell towers before clearing the level anymore"; rewards are tower types and block cards, not placed objects).
- **Gold does not carry over** by default (inferred): only Silas's interest "is carried over to the next level", and the talent Loot Scavenging is described as needing the same rework "to prevent the need to sell towers before victory".
- Carries over: the tower loadout (types you may build), the block deck with its runes, relics, fire source HP, Gambler's Tokens, Ember Stones, Soul Flame level.
- "Tower loadout is now locked in a level" (v0.3.5).

---

### 2. Towers

#### Getting towers
- **Academy** (start of every run): choose a starting tower combination and a starting relic. Combinations never repeat among the options and always include "at least one AoE tower and one single-target tower". Relic options never have an element none of the offered towers use. Scrap Tower never appears there.
- **After each cleared stage**: choose **one of three towers** (v0.1.3); also receive a wall card (v0.1.5). Rerollable with Gambler's Tokens.
- Other sources: quest rewards, Circus wheel (campsite), shop, treasure chests with the talent Lost and Found (a tower card "you've built before"), Scrap Rune / Waste Recovery System (free Scrap Towers), Endless/Enigma/Custom presets.
- "Free tower cards" exist as hand cards that place one tower without cost (inferred from the Shift-placement bug fix).
- Custom Game lets you pick "up to 8" towers — the only stated loadout size.

#### Paying
- Towers are built with **gold** from tower buttons (number keys). Gold comes from monster kills and round income (section 8).
- Each tower has a build cost; upgrades cost gold separately. "Tower stat enhancements will now be calculated additively, rather than multiplicatively" (v0.3.4).

#### Upgrades
- Two upgrade options per tower, called the **red upgrade** and the **blue upgrade**. At Early Access launch: "All the towers larger than 1x1 have 2 upgrades to choose from". Some 1x1 towers have them too (Laser, Drill).
- Whether a tower can take both is NOT STATED ("2 upgrades to choose from" suggests one or the other).
- Upgrade options are visible in the tooltip.

#### Targeting
- Each tower has a target priority that cycles on click (right-click or Shift+Tab cycles backwards). Changing it makes the tower drop its target at once.
- Default priority per tower type is set by right-clicking the tower's build button; a menu also exists for defaults.
- Only named options: "Highest Health" (Sniper default) and nearest. The fire source targets "the enemies with the most progress".
- Towers that cannot use priorities show no menu.

#### Selling
- Towers can be sold for gold, in preparation or in battle. The sell price is below cost and "loses value over time" (inferred from Auctioneer's Cheat Sheet: on buff tiles, in preparation, towers "can be sold at full price, and does not lose value over time").
- Chaos Transmuter lowers the sell price of transformed towers; Giant Dice sell price depends on its roll; Waste Recovery System lowers sell price by 5/10/15.

#### Build limits
- Blackhole Tower, Portal Tower and Golden Statue: **one on the field at a time**. Reason given: "otherwise you can win every game with a full line of portals".

#### Malfunction
- Monsters and bosses apply **malfunction** to towers: the tower stops working for a duration. Sources named: Werewolf ground slam, Frost Elemental (large area), forest boss fireballs / fire breath, Ancient Defense Towers ("interfering with your turrets").
- Counters: Fort Tower (immune), Royal Barrier (immune + reflect), talent Resilient Forging (shorter), relics Debug Encyclopedia and Impact Dispersion System.
- Separate from malfunction: Hornet King's noise (-30% attack speed nearby); Tanky Bot taunts towers.

#### Elements and status effects
Five elements plus Normal: **Fire, Ice, Electric (Lightning), Poison, Arcane**. "Utility" towers also show an element.
- **Burn** (fire): damage over time. Trigger chance 5% (was 3%), capped at 100 damage. On bosses 0.25% of max HP per second (was 0.5%).
- **Chill** (ice): stacks; "each stack slows enemies by 5% over 2.5 seconds, up to a maximum of 7 stacks". **Freeze** also exists as a distinct state.
- **Charge** (electric): accumulates on hit; "when fully charged, they are briefly stunned". Since v0.4.9 each electric tower builds Charge at its own rate and the amount needed scales with monster size. [Originally "based on the ratio of damage to health".]
- **Poison**: stacking damage over time. "Tick damage increases with each attack, and deals full damage much faster" (v0.1.7). Health bars show accumulated poison; Dart Towers skip targets whose stored poison exceeds their health.
- **Fragile** (arcane, v0.4.8): raises the monster's chance to be critically hit; decays over time; "bigger, slower or close-range towers apply more per hit".
- **Vulnerable**: keyword for "monsters take an additional X% damage for X seconds".
- **Stun / knockback / black hole**: subject to the crowd-control resistance system (section 13); also "3-second stun immunity after 3 consecutive seconds of stun".
- Monster armor: flat reduction, minimum 1 damage.

#### Tower list (newest values; costs and stats only where the notes give them)
Footprint in brackets where stated. "3x3+" is the developer's label for special oversized towers.

Normal / element not stated:
- **Basic Tower** — removed in 1.0. Range 6 (was 4).
- **Cannon Tower** — damage 6 (was 5).
- **Dice Tower** (1x1, inferred) — rolls a die that sets its strength; range 5 (was 4). Quick-reroll button costing "the price of selling (based on its previous roll) and rebuilding". Relics: Remote Dice, Elemental Dice.
- **Giant Dice Tower** (2x2) — "20-sided... the number you roll determines its attack speed"; a 20 is "crazy DPS", a 1 is nearly worthless. Range 5.5 (was 4.5).
- **Drone Tower** — has a detection range; attack speed 2.5 (was 2). Red: detection range +100% (was +50%).
- **Earthquake Tower** — range 5 (was 4), damage 10 (was 8).
- **Decimate Tower** — very slow attack: speed 0.3 (was 0.25, after an earlier +25%). Red: damage +25 (was +20).
- **Hammer Tower** — damage 65 (50 → 60 → 65). Blue: speed +30% (was +40%).
- **Sniper Tower** — damage 70 (was 80), cost 80 (was 90), 50% base crit chance (1.0). Default priority Highest Health; "can stay locked onto a large monster for a long time".
- **Boulder Tower** — attack speed +20% (2024). Red: "boulders now roll along the monsters' path instead of in the direction they were fired".
- **Axe Tower** — damage 14 (10 → 12 → 14); close-range (inferred).
- **Missile Tower** — "enormous range, covers 3 elements by itself, handles both single targets and groups"; base numbers deliberately lower.
- **Scrap Tower** (1x1) — damage 4 (was 2), **ammo 20** (was 30); "will be destroyed when the ammo is exhausted". Meant as "an excellent emergency defense". Never offered at the Academy; excluded from "build X 1x1 towers" quests.
- **Scrap Tank Tower** — "can dismantle 1x1 towers to enhance its abilities" (damage, attack speed, crit). Cap on total value fed in: **300 gold**; blue upgrade +300; each of the three "Scrap Master" relics +150; maximum 1,050. Eats faster after the first tower (+33% per tower, up to 2x). Hold Shift to feed repeatedly.
- **Golden Statue** (reworked v0.4.6) — "turns monsters into gold; attacking gilded enemies makes them drop extra coins". Limit 1. Its second upgrade "deactivates when the player has no coins left" (old version).
- **Sentry Tower** (1x1) — "enters Alert Mode after going without attacking for a while, then greatly increases its attack speed when a monster appears".
- **Dynamite Tower** (1x1) — "throws explosives that stick to monsters and deal increasing damage as the targets move".
- **Ballista Tower** (2x2) — "VERY long range, and the damage of its giant bolts grows with flight distance".
- **Balloon Tower** (2x2) — "releases homing balloons that chase enemies and explode on impact".
- **Fort Tower** (2x2; also written "Fortress Tower") — "can be placed without a block and is immune to Malfunction effects"; transmits electricity; its red upgrade strengthens it. Blocks the path like a wall (used as the maze piece on Wyrmfell Bridge).
- **Chainball Tower** (1x2) — "launches a massive chainball that knocks back enemies straight ahead and stuns them". Red: damage +30 (was +20).
- **Portal Tower** (1x3) — "teleports passing monsters back to where they were a few seconds ago". Limit 1.
- **Barrage Tower** (1x5) — "rapidly bombards a distant area". Cost 95 (was 85); 15 bullets per second (was 20).
- **Bomb Tower** — "throws a bomb that explodes after a short delay, dealing damage in a small area with a cross-shaped spread". Damage 35 (was 30). Red: damage +20 (was +15).
- **Fan Tower** — "blows strong winds forward, slowing down monsters' movement speed". Range 12 (was 8).
- **Scythe Tower** (2x3, "the first L-shaped tower") — damage 18 (was 15); attack effect scales with range.
- **Mine Tower / Landmine Tower** (2x2; was 3x3) — "places mines along the monster path around it"; mines regenerate "when there are path changes outside of combat". Landmine damage 35 (was 30). (Treating the two names as one tower is inferred.)
- **Drill Tower** (1x1, utility) — "drills downwards and destroys the block below it at the start of the next round". Cost 15 (was 20). A button pays coins to trigger at once. Red (new): destroys blocks in a 3x3 area. Removed from Endless Mode in v0.4.6 (section 13).

Fire:
- **Fireball Tower** — AoE; damage 10 (was 12); fire rate +20% (v0.4.6).
- **Flamethrower Tower** (earlier "Flame Tower") — continuous damage to passing enemies with no cooldown; tick rate 2 (3 → 2.5 → 2).
- **Torch Tower** (1x1) — "rapidly fires torches with a chance to bounce"; bounce chance 50% (30 → 40 → 50).
- **Scorch Tower** (3x3+) — "shoots flames in four directions and spins. You can freely control its rotation direction." Range 4 (was 3.5); 5% chance to Burn for 3 s.
- **Lava Tower** (2x2) — "pours lava onto the ground in front of it"; damage 14 (was 16); lava flows over corrupted tiles. Blue: 1 s burn (only while on the lava). (Element inferred.)
- **Volcano Tower** (3x3) — "fires multiple magma orbs... explode on impact and have a high chance to apply burning".

Ice:
- **Icicle Tower** — fire rate 5 (was 6); bonus damage against low-health enemies (slated to move to another tower).
- **Snowball Tower** — attack speed and range trimmed in the demo.
- **Icespike Tower** (2x2) — "launches massive, sharp spikes"; applies Chill.
- **Frost Ray Tower** (1x2) — "freezing beam that damages enemies in a straight line"; damage 5 (was 6). Blue: explosion at 2x multiplier (was 3x).
- **Froststorm Tower** (3x3) — "summons a powerful freezing tornado"; range 7.5 (was 11); cost +15 (v0.4.6).
- "Frost Tower" is named once (visual tweak only).

Electric:
- **Lightning Tower** — chain lightning; attack speed +50%, bounce distance +20% (v0.3.0).
- **Lightning Ball Tower** — "shoots lightning ball in a straight line". Second upgrade: "reduces cooldown by 10% per hit on an enemy, triggering up to five times per orb".
- **Laser Tower** (1x1) — "attacks while charging up; its attack speed increases over time as it fires". Energy decays after 1 s without attacking. Repeatedly nerfed (charge speed -20% in 1.0). Red: damage +1 / range +1.
- **Lasso Tower** (2x2) — "binds targets" with an electric lasso. Blue: stun, only after the lasso stays on a target more than 2 s.
- **Thunder Tower** (3x3) — "releases lightning to strike monsters in a wide area"; cost +15. Red: instantly applies 100% Fragile, split evenly. Blue: 250 extra Charge, split evenly.
- **Electro Gate Tower** (1x5) — "powerful electric field to continuously attack passing monsters"; damage 6 (was 5); conducts electricity.

Arcane:
- **Arcane Missile Tower** — damage 6 (was 4), speed 0.8; "always critically hit against enemies with more than 80% HP".
- **Magic Arrow Tower** (1x1) — "deals damage to monsters or enhances your towers" (it can be aimed at your own towers to buff them). Damage 15, cost 20 (was 15).
- **Starfall Tower** (3x3) — "Meteor shower!!"; cost 135 (105 → 120 → +15); meteor radius 1 (was 1.5). Red: radius 2.5 (was 3.5), does not stack on one monster.
- **Blackhole Tower** (3x3+) — "fires a mini black hole that pulls in monsters within its range". Limit 1. Ignores attack-speed bonuses (they become damage). Blue: stun 1 s (was 1.5 s).

Poison:
- **Poison Tower** — has a sprinkler; damage 35 (was 25). "Magma Upgrade" guarantees 3 s burn. Blue upgrade cost 40 (was 50). Conducts electricity.
- **Dart Tower** ("Poison Dart Tower") — range 4.5, attack speed 1.
- **Slime Tower** (1x1) — "fires slimes that continuously bounce forward"; damage 5.
- **Mushroom Tower** (2x2) — "throws mushrooms that stick to monsters and continuously emit toxic spores".
- **Cauldron Tower** (3x3) — "absorbs nearby defeated monsters to increase the toxicity in the cauldron"; range 8.
- **Chomp Tower** — close-range bite (inferred); Poison since v0.4.3; damage 40. Red: damage +30.

Chess towers (v1.1.0): Pawn, Knight, Bishop, Rook, Queen — see section 14.

The "Big Five" achievement names one 3x3 flagship per element: Volcano (fire), Froststorm (ice), Thunder (electric), Starfall (arcane), Cauldron (poison). (element mapping inferred)

Developer's stated balancing rule (1.0): towers with awkward ranges, odd shapes or dependence on other towers get higher base numbers; towers that work anywhere, have very strong effects, or need no thought about placement get lower ones.

---

### 3. Block cards and runes

#### Blocks
- Blocks are tetromino-style wall pieces ("LINE PIECE", T-shapes, 1x4, 2x2 are named). The deck is chosen from starting sets (an all-T set was removed, then returned "but some have grown a bit").
- Size variants: Tiny's small blocks (never more than 3 tiles); Chunk's mega/giant blocks; Enchanted Quill grows blocks by one tile up to 5; anomaly effects and the Poison pact "twist cards into strange shapes".
- New block cards are gained after clearing stages ("an additional wall card"), from chests, quests, shops, the Royal Library.
- Terrain can turn blocks into **lava blocks** or **ice blocks** (unusable until restored with Unlock or the "Unfreeze" card).
- In the Sealed Citadel, blocks **conduct electricity** to power ancient machines. In Void Depths, blocks dropped on void zones sink and become ground.

#### Runes
- A block card has a **rune slot** ("a block card with an empty rune slot"). One slot per card (inferred).
- Gained: "After acquiring a new block, you can enhance it with runes" (pick from options; a weaker and a greater version of one rune are never offered together); Workshop / Abandoned Forge "Enhance" for 20 Ember Stones (was 15); some relics add them.
- Runes generally create **buff tiles** on the block, which boost a tower built on that tile (inferred: "stacking buff tiles to make an OP 3x3"; Mega Rune "creates four buff tiles").
- Developer observation: players pick an elemental rune if offered, otherwise attack boost — hence the utility runes added in 1.0.

Runes named:
- **Damage Rune / Greater Damage Rune** — attack boost tile (two tiers).
- **Elemental runes** — one per element (effect details NOT STATED).
- Range buff tiles and gold tiles exist ("a gold tile... extra coins"); which runes make them is NOT STATED.
- **Explosion Rune** — effect NOT STATED (granted by Bomber's Package).
- **Scrap Rune** — "spawns up to 5 scrap towers on the block"; with a Mega Rune, 10.
- **Inspiration Rune** — effect NOT STATED; rarity raised; "will no longer appear if more than half of the blocks in your inventory have the Inspiration Rune".
- **Mega Rune** (Chunk) — makes a mega block; "no longer affected by corrupted blocks and now creates four buff tiles if there are other runes on the block" (the four tiles are separated).
- **Astral Runes** (Estelle) — effect NOT STATED.
- **Mirror Rune** (1.0) — "When you place a 1x1 tower on it, weaker copies appear on every other Mirror Rune."
- **Precision Rune** (1.0) — "Greatly increases a tower's critical chance and critical damage."
- **Upgrade Rune** (1.0) — "Greatly reduces the cost of upgrades of the matching color."

Block skins: cosmetic, bought with spare EXP (12 at 1.0).

---

### 4. Consumable cards and active skills

#### Skills (buttons; hotkeys R / F / V, so up to three per character)
- **Overcharge** — the default skill. Began as a buff card given every turn; became a button in v0.1.7. Duration 10 s (was 15). Applied to a tower; exact effect NOT STATED. Costs 3 gold under Shard of Confusion (Chrono Traveler note).
- **Unlock** — unlocks a placed block so it can be taken back; also restores lava/ice blocks. Listed under talents in one note, as a skill in another.
- **Royal Barrier** (Belloc) — "The tower gains a 50% damage boost and becomes immune to malfunction effects. When monsters attempt to apply a malfunction effect, it is reflected, stunning the monster for twice the duration." Once per 5 s; no effect on bosses.
- **Focus Fire** (Scrap Master) — towers concentrate on one target; 5 s cooldown (was once per round). Removed when the target dies.
- Cooldowns of Overcharge, Unlock and Royal Barrier: NOT STATED.

#### Buff cards
- Applied to one tower. A tower holds one buff card effect (inferred from "a tower... that does not already have a buff card"). Timed effects "only count down during combat". Right-click cancels.
- Sources: treasure chests, Tana's skill, relics, Royal Library.
- Named:
  - **Powerful Shot** — damage +150% for 20 s (was +100% for 30 s).
  - **Magma Ammo** — attacks also apply Burn.
  - **Kill Shot** — attacks instantly kill low-HP enemies.
  - **Armor Breaker** — enemies hit take more damage.
  - **Poison Bottle** — area poison damage (has a cooldown).
  - **Energy Infusion** — large firing-speed boost that shrinks with each shot.
  - **Horror Mask** — slows monsters around the tower.
  - **Critical Up** — crit boost.
  - **Unfreeze** — Frost Ruins only; thaws frozen blocks (inferred).
  - "Upgrade card" effects (Tana) — permanent.
- Other one-off cards: **Purification Potion** (removes all corrupted tiles in its area), the "forbidden card" from Blessing of Death (instantly kills a monster).

---

### 5. The fire source (flame) and Ember Spark

- The thing being defended. It has HP; base value NOT STATED. Shard of Fragility level 3 sets it to 3.
- Damage taken equals the monster's "attack power": elite monsters deal 5 (v0.1.7); "a large monster" counts 5.
- It has **armor** for Belloc (absorbs hits first).
- It **attacks** when the talent **Ember Spark** is owned (three tiers). Hovering shows its range and damage. It targets the enemy with the most progress.
- Max HP can be raised (altar "Strengthen" also healed 5); healing comes from shops, chests, Supply Station, relics.
- Flames are chosen before a run. Many players did not know they could switch.

Flames (newest rules, after the v0.4.7 rework that removed most drawbacks):
- **Basic flame** — default.
- **Soul Flame** (was Demon Flame) — unlocked by clearing Frost Ruins (earlier: Heroic Bone Desert). It levels from kills, and levels persist across stages with rising requirements. "Killing a large monster grants +5 exp points, but getting hit by one reduces 5 levels." [Earlier: being hit destroyed 3 towers; removed.]
- **Sacred Flame** — "prioritizes clearing corrupted tiles within its attack range"; range +2 tiles per round, up to +20.
- **Arkflare Flame** — unlocked by clearing Bone Desert. "Randomly stuns 3 to 10 enemies on the field for 1 to 2 seconds and increases Charge by 15%"; attacks slightly slower but hits three targets.
- **Ancient Flame** — unlocked by clearing Sealed Citadel on Normal+. Seals towers; "removing the corrupted seal no longer costs coins"; grants +15% crit and +10% attack speed per round (was +25% / +10%); still generates a few corrupted tiles each round.
- **Void Flame** — unlocked by clearing Void Depths on Normal+. Rules NOT STATED (an achievement calls it "Thinking with Portals").
- Removed: **Frost Flame** (Frostfire, the Frost Ruins unlock); **Candle Flame** (first a 1-HP challenge, then fog of war; its mechanic became the Darkness elite level).

---

### 6. Characters

- **Feri** — the default character (inferred; named only as one of three allowed in Enigma Sanctum). Kit NOT STATED.
- **Belloc the Pyroguard** — fire source has armor; exclusive relic Royal Command gives a quest every stage; skill Royal Barrier. No longer reduces starting HP (1.0).
- **Chunk the Builder** — starts with 2 giant blocks (Mega Rune); exclusive relic Blessed Chisel. Unlock: build towers larger than 1x1.
- **Silas the Merchant** — "At the start of each turn, you gain interest equal to 10% of your current gold, which is carried over to the next level, up to a maximum of 150 gold."
- **Tiny** — small blocks (max 3 tiles) with elemental runes; "card drawing cost is doubled". Unlock: build 500 blocks.
- **Chrono Traveler** — speed character; only when the timer is on. Prep limit 60 s first round, 15 s later rounds. Uses skills heavily. Unlock: clear Misty Forest on the hardest difficulty.
- **Tana the Sorcerer** — towers and upgrades cost +30% (75 → 60 → 50 → 30%, upgrades added at the last step); her skill gives buff cards each turn, dealt "more evenly" since 1.0. Unlock: open over 50 treasure chests.
- **Estelle the Astromancer** — the last normal character; her blocks carry Astral Runes. Unlock: collect 40 tower types in the Compendium.
- **Joker** (event) — "a clown from another dimension. In his world, blocks are precious resources!"; chaotic, block-removal mechanic.
- **Scrap Master** (event) — pilots **S.C.R.A.B.**, a controllable unit that deals damage; skill Focus Fire; gains experience and levels at stage end.
- **Marlsen the White King** (event, v1.1.0) — see section 14.
- Event characters unlock after clearing the whole game on any difficulty, are "designed to be much stronger", and cannot earn the hard achievements.
- Silas, Tiny and Chunk were made "slightly easier to unlock" after 1.0.

---

### 7. Relics

Economy and cards:
- **Wealth Vault** — interest of 10% of current gold at the start of each round (was 5%); 100 gold cap.
- **Adventurer's Legacy** — +20 gold at the start of each level (was 15).
- **Time-Saving Device** — 3 coins per 10 s left on the timer (was 1).
- **Demonic Pact** — each battle: lose 1 current and max HP, gain 50 starting gold.
- **Gold Furnace** — 1–10 coins per discarded card.
- **Statue of Greed** — monsters dying within 5 tiles of the fire source give 30–100% extra gold, more the closer.
- **Statue of Poverty** — under 30 gold, each missing gold gives all towers +1% crit.
- **Stargazer's Journal** — end of turn: +3 gold per tower type on the field.
- **Key of Wicked Fortune** — chests show three covered choices of 1, 30 or 120 coins.
- **Coin Hunter** — effect NOT STATED (gold on kills).
- **Gambler's License** — clear a stage with no monster damage: +2 Gambler's Tokens.
- **Auctioneer's Cheat Sheet** — in preparation, towers on buff tiles sell at full price and do not lose value.
- **Dormant Hammer** — a tower type not built this round costs 15% less, stacking 5 times; resets when built.
- **Wood Elf's Charm** — playing the leftmost card makes all towers cost 3 less until one is built; a block that triggers it locks at once.
- **Waste Recovery System** — building a tower costing over 15/45/75 gold creates 1/2/3 Scrap Towers in a 5x5 area; sell price -5/10/15.
- **Cartographer's Manual** — one free card draw per 5 blocks locked.
- **Adaptive Blueprint** — end of round: discard all block cards in hand, draw the same number.
- **Volatile Blueprint** — effect NOT STATED (returns under-construction cards).
- **Aggressive Construction** — effect NOT STATED (affects blocks).
- **Enchanted Quill** — start of round: up to three block cards in hand gain one tile (max 5).
- **Bomber's Package** — leftmost block card with an empty slot gains an Explosion Rune; up to 3 per turn.
- **Blessed Chisel** — wall blocks ignore obstacles; overlapped obstacles are cleared.
- **Cursed Tarot** — per card in hand, monsters are 2% likelier to be crit (1% bosses).
- **Prophet's Crystal Ball** — effect NOT STATED.
- **Mercenary Contract**, **Craftsman's Luck Charm** — effects NOT STATED; only offered at the start of a run.

Fire source and defence:
- **Royal Command** — old: heal 3 HP per cleared level but prep time limited to 25 s; reworked into Belloc's per-stage quest relic.
- **Flamekeeper's Guard** — clear a level taking 3 or less damage: heal 1.
- **Sacrificial Pact** — when the fire source is hit and falls below 5 HP, consume the relic and heal up to 10. [Earlier: 1 HP per 5 Ember Stones.]
- **Ember Guardian** — each stage, 5 random buff tiles appear within the fire source's range.
- **Flash Freeze Device** — monsters first coming within 10 tiles of the fire source get 7 Chill stacks, then 1 per second.
- **Gigantic Roasted Ham** — monsters in the fire source's range move 15% faster but are 50% likelier to be crit; not bosses.
- **Amulet of Light** — end of turn: remove the 5 corrupted tiles nearest the fire source; one becomes an Attack Boost Tile.
- **Vengeance Statue** — effect NOT STATED (banned from Endless).

Tower modifiers:
- **Chaos Transmuter** — end of each wave, towers randomly become another tower of the same size; the count rises by 1 each round (was a flat 5, before that 3). Only 1x1, 2x2, 3x3; never into utility towers; banned from Endless.
- **Anarchy Core** — all towers +20% attack speed but attack random targets.
- **Rusty Telescope** — a tower with no adjacent towers gets +20% range.
- **Energy Storage System** — a tower idle for 3 s (was 5) crits on its next attack.
- **Rapid Cooling System** — a kill has a 20% chance to reset the tower's cooldown.
- **Smithing Mask** — the last tower upgraded gets +30% damage, attack speed and crit.
- **Ancient War Flag** — killing a large monster gives towers within 5 tiles +50% attack speed for 5 s.
- **Amplify Matrix** — a crit gives towers within 3 tiles +20% crit for 5 s; no stacking.
- **Echo Crystal** — a buff card also applies to another unbuffed tower within 5 tiles.
- **Venom Satchel** — every 5 s in battle, give "Poison Bottle" to a random unbuffed tower. [Earlier: on playing the rightmost card.]
- **Chameleon Shell** — a Normal tower placed next to an elemental tower takes that element.
- **Elemental Blueprint** — bonus based on which elements are on the field (effect NOT STATED).
- **Balanced Circuit** — effect NOT STATED.
- **Beacon of the Sapling Queen** — Drone detection range +50%; each Drone adds 2% attack speed to all Drones, up to 50%.
- **Remote Dice** — Dice Towers showing 1 reroll when battle starts. **Elemental Dice** — Dice Tower takes an element by its roll. (Both appear only if you have Dice Tower.)
- Three **"Scrap Master" relics** — only with Scrap Tower; each also adds 150 to the Scrap Tank cap.
- **Debug Encyclopedia** — malfunction duration halved; tower gains +50% damage for 10 s afterwards.
- **Impact Dispersion System** — malfunction is halved; if more than 2 s remain, it is spread across working towers within 3 tiles.
- **Explosive Demolition** — selling a tower in battle explodes for 10x the gold gained.
- **Antique Golden Bell** — every 10 s in battle, stun all enemies 1.5 s; not bosses.
- **Weakspot Radar** — stunned monsters are always crit.
- **Dark Grip** — effect NOT STATED (moves a target).

Elemental:
- **Frostfire** — fire towers -20% attack speed, their damage also chills.
- **Phoenix Feather** — fire towers +5% crit; their crits burn for 5 s.
- **Spark Amplifier** — electric damage on a burning monster extends burn 1 s (once per second per monster).
- **Wildfire Sigil** — a burning monster that dies burns others within 3 tiles for 5 s.
- **Magma Gem** — burn lasts 100% longer but eats 1 Chill stack per second.
- **Lava Bucket** — fire damage may leave a lava pool dealing 3x the round number per second.
- **Glacial Axe** — each Chill stack: +5% chance to be crit.
- **Frost Venom** — poisoned monsters gain 1 Chill stack per second.
- **Cryo Conductor** — electric damage on a chilled monster consumes the chill for +200% Charge (was +100%).
- **Lightning Conductor** — electric hits have a 5% chance of chain lightning to 5 monsters, 10 damage and 10 Charge each.
- **Static Shocker** — when Charge triggers, deal 5% of current HP (1.5% bosses), cap 500, once per 5 s per monster. [Was 10% / 3%, cap 1000.]
- **Overcharged Battery** — when Charge triggers, 10% of the accumulated Charge spreads to monsters within 2 tiles.
- **Horn of the Storm** — killing a large monster raises Charge of others within 6 tiles by 50%.
- **Amplify Poison** — electric damage on a poisoned monster doubles poison tick rate for 3 s; electric hits on poisoned monsters have a 50% chance of double Charge.
- **Volatile Poison** — every 5 s, a poisoned monster that is burned explodes, consuming half its poison for twice that as fire damage split within 2.5 tiles; chains.
- **Giant Lizard Fang** — poisoned monsters gain 1% Fragile per second, up to 20% (5% bosses).
- **Scepter of the Elements** — arcane crits apply a random Burn, Freeze, Poison or Charge.
- **Magic Dust** — monsters hit by arcane towers take +20% arcane damage on the next hit.
- **Ring of Shattered Ice** — arcane damage on a frozen monster deals +30%, split within 3 tiles.
- **Forbidden Grimoire** — Fragile applied below 40% HP counts double and decays at half speed below 20% HP.
- **Unstable Mixture** — a monster with Burn, Freeze and over 30% Charge (was 50%) loses them and takes 15% of max HP as arcane damage (3% bosses), cap 1500. The developer keeps hinting at a nerf.

Five altar-only relics (v0.4.9) are not named.

---

### 8. Economy and adventure-map nodes

#### Currencies
- **Gold / coins** — in-battle money for towers, upgrades, card draws. From monster kills, round income, interest, chests, selling. Capped at 9999. Starting gold per stage NOT STATED.
- **Ember Stones** — run-level currency for the Workshop, Abandoned Forge, altars and the White King's upgrades. Source NOT STATED.
- **Gambler's Tokens** — reroll currency shared across the run. Start with 2, plus 1/2/3 from talents; stage rewards give 2 at a time; also mini shops, relics, very rarely chests. They reroll tower and relic choices.
- **EXP** — meta currency (section 12).
- **Academy reroll points** — reroll the starting offer. Until all regions are cleared: 1 point back per cleared level, 5 per boss, store up to 20; unlimited afterwards.

#### Treasure chests
- Dropped at random by monsters during battle. Opening offers "a choice between three bundles": coins, healing, buff cards. Small chances of a Gambler's Token and (talent) a tower card.

#### Map nodes
- **Academy** — run start: towers plus a relic. Void Depths also lends "support items" and serves **dishes** from Academy chests ("the full Academy meal"); dish effects NOT STATED.
- **Royal Library** (talent Royal Emblem) — pick your starting cards at the start of each adventure; type-restricted relics allowed if the tower was chosen first.
- **Secret Vault** (Custom Game) — freely pick up to 8 towers, blocks, relics from ones used before; no records, achievements or EXP.
- **Battle node** — reward shown on the map: tower, block, relic, "Tower + Artifact", and possibly a Mini Shop, a Quest, Gambler's Tokens or an Abandoned Forge.
- **Corrupted battle** — harder; grants an extra relic choice.
- **Elite: Darkness** (Heroic only) — towers cannot hit enemies hidden in the dark; build towers to extend vision.
- **Anomaly level** — one visible special effect makes the battle harder, for higher rewards. Unlocks after clearing Frost Ruins.
- **Boss** — ends the region. The last group of stages before it is "guaranteed to include either a Mini Shop or an Abandoned Forge".
- **Shop** — sells relics, healing and more; has a reroll; talents give discounts; can be re-entered until you move on. Prices NOT STATED.
- **Mini Shop** — a stage-clear reward offering "some items that would (possibly) suit your build".
- **Workshop** — unlimited uses, paid in Ember Stones: **Reforge** (change a block's shape), **Dismantle** (remove a card, 15, was 10), **Enhance** (add a rune, 20, was 15). Placed further back on the map.
- **Abandoned Forge** — stage-clear version of the Workshop; "can only be used twice before it goes out".
- **Campsite** (replaced the Altar node) — three options:
  - **Supply Station** — buy supplies to restore the fire source.
  - **Circus** — spin a wheel for towers or relics.
  - **Altar** — sign elemental **pacts**; succeed in the next stage for a powerful altar-only relic. Any number may be stacked, up to all five. Stated: **Ice** = cannot build towers during battle; **Electric** = cannot see the monsters' path; **Poison** = also twists cards into strange shapes. Fire and Arcane: NOT STATED.
- **Quests** (formerly Barracks / Training Ground) — chosen at the start of a level; goal-type only since v0.4.9. Examples: "build X of a certain 1x1 tower", "keep enemies at least X tiles away from the Fire Source" (square range). Rewards are towers or relics, biased to your elements.
- Older altar (history): pay Ember Stones or HP; "Strengthen" (max HP +, heal 5), "Purify" (remove a card, later "restore all HP").

#### After a stage
- "More Challenges!" continues waves on the cleared map for no reward (section 11).
- EXP is awarded; +5/10/20% for a no-damage stage (later folded into base values).

---

### 9. Run structure

- **Regions** in order: **Misty Forest**, **Bone Desert**, **Frost Ruins**, **Sealed Citadel**, **Void Depths**.
- A run covers **one region**, picked at the start with difficulty, character and flame (inferred: the region-select screen shows records per region; a marathon across regions was rejected as "wayyyyyy too long"). Stage count per region NOT STATED.
- The map is a branching node map; path generation was simplified twice.
- **Chaos Realm** — each battle uses a random map from any region.
- **Difficulty**: Casual, Normal, Heroic. On Casual, failing a level does not end the run. Darkness levels are Heroic-only. Exact stat differences NOT STATED.
- Defeat ends the run on Normal and Heroic.

#### Bosses
- **Misty Forest** — name NOT STATED. Stage has **minecarts** on rails carrying towers (double attack power and range; three per side). The boss "will spit fireballs and breathe fire", causing malfunction; with Infernal Shards the malfunction is twice as long and blocks turn to lava.
- **Bone Desert — Steelrail Overlord** — a train with a railgun cannon; you push it back and a new train arrives with a non-fixed layout; the stage advances.
- **Frost Ruins — Skeleton King** — "Trial of the Skeleton King": every three turns, choose one of five trials, each once. [Earlier wind mechanic removed.]
- **Sealed Citadel** and **Void Depths** bosses — names and abilities NOT STATED (Void Depths: "find the source of the corruption").
- Boss HP raised about 10% in v0.3.4. Bosses resist most percentage and control effects.

#### Infernal Shards
- Unlocked by clearing the final region. Available on all three difficulties.
- **8 shard types, 3 tiers each** — maximum "Infernal Shard Level 24". More shards make monsters and bosses stronger and upgrade boss fights. Unlocked tiers carry down to lower difficulties.
- Named: **Shard of Fragility** L3 (fire source HP becomes 3, was 1); **Shard of Nightmares** L2 (large monsters from other regions appear; Werebeasts and Frost Elementals excluded); **Shard of Confusion** (affects skills; Overcharge costs 3 gold for Chrono Traveler).
- The other five and all remaining levels: NOT STATED.

#### After the final boss
- "More Levels!" continues the run: each level adds 15% difficulty, ramped across its waves (level 1: +0% first wave, +15% last; level 2: +0% to +30%).
- Later change: monster speed gain capped at 30%, HP growth 30% per wave (was 25%).

---

### 10. Enemies and map gimmicks

Monsters have health, attack power (damage to the fire source), armor, a gold reward and a size class (small, medium, large, elite, boss). "Corrupted monsters" are a visual variant.

Named:
- **Werewolf / Werebeast** — at 50% HP slams the ground; nearby towers malfunction.
- **Giant Spider** — 5 small spiders on death. **Broodmother** — spawner (inferred).
- **Lizard Mage** — low health; periodically enhances nearby monsters.
- **Hornet King** — nearby towers -30% attack speed.
- **Scorpion King** — half damage above 70% HP; 20% faster below.
- **Orc Warchief** (uses skills), **Orc Berserker**.
- **Skeleton Guardian** — charges on entering; normal speed once attacked.
- **Necromancer** — summons Skeletons.
- **Swift Phantom** — fast; teleports (inferred).
- **Frost Elemental** — large-area malfunction.
- **Crusher Bot** — rolls faster and faster; stunned 5 s when it hits a wall. "One of the few enemies that needs special maze layouts."
- **Tanky Bot** — taunts towers.
- **Corrupt Elemental** — leaves Corrupted Tiles on death.
- **Winged Demon** — 20% damage reduction for 1 s when crossing a corrupted tile.
- **Spitopus** — a skill, frequency reduced.
- **Warpbeast** — splits; longer cooldown, at most 5 times.
- **Voidstalker** — teleports (disabled for now).

Map gimmicks:
- **Buff tiles** on the ground (attack, range, gold) and **Corrupted Tiles** (harmful; spread by monsters, the Corrupted Altar, Ancient Flame).
- Misty Forest: wooden fences, obstacles, water, minecarts (boss).
- Bone Desert: Bone Walls; the train boss.
- Frost Ruins: blocks freeze into ice; "Unfreeze" card; **Frozen Treasures** broken by towers ("sometimes they even open new paths"). Removed: Sliding Ice Blocks, wind.
- Sealed Citadel: **ancient machines** powered by a chain of blocks; **Ancient Defense Towers** that wake and disrupt your towers and can be destroyed; **Corrupted Altar**; **Purification Potion Mixer**.
- Void Depths: **void zones** (blocks sink and become ground), **portals**, energy / **Poison Crystals** (destroying one triggers an area effect).
- Darkness levels; "Snow Mountain block-freezing" on some stages.
- Anomaly examples: 1x1 lava tiles fall each round; medium+ monsters spawn three skeletons on death; distorted blocks.

---

### 11. Modes

- **Adventure / Campaign** — sections 8 and 9.
- **Custom Game** (campaign) — after all regions are cleared on a difficulty; Secret Vault start; nothing recorded.
- **"More Challenges!"** — continue waves on a cleared stage. Health and speed rise, gold falls. A leak ends it without damage. "These optional challenges don't grant any exp points."
- **"More Levels!"** — continue past the final boss (section 9).
- **Endless Mode** — unlocks after clearing Misty Forest; maps gated by progress.
  - Choose starting blocks; pick rewards between waves (sometimes a chest, a Gambler's Token or HP regen); upcoming rewards shown.
  - Scaling: unchanged for waves 1–10, much faster after; after wave 25, +3% monster speed per wave.
  - **Blessings** (v0.4.12) replaced negative anomalies: **Blessing of Fate** (start with 99 Gambler's Tokens), **Blessing of Death** (every 3 block cards discarded gives an instant-kill card), **Blessing of Wisdom** (first card played each round is copied back to hand), **Maze Blessing** (grants block cards).
  - **Daily / Weekly Challenge** — fixed map and conditions, 3 blessings, per-character leaderboards (ties by kills).
  - **Custom Game** — any cleared map (80), up to five blessings.
  - **Event maps**: **Misty Graveyard** (Skeleton King's gifts between waves); **Snowridge Outpost** (gifts each round: Chunk gives Mega Rune blocks, Silas coins); **Wyrmfell Bridge** (no block cards; Fort Towers plus seven 2x2 towers).
  - Banned: Chaos Transmuter, Vengeance Statue, Anarchy Core from random relics; Drill Tower.
- **Enigma Sanctum** — puzzle mode. Daily, Weekly, Random. Three rounds; each gives a fixed set of towers and cards (plus a rune-less 1x4 and 2x2 block per wave). Monsters spawn continuously "until one of them reaches the Fire Source", then the next round starts. Score from kills. Only Feri, Chunk, Tana.
- "Relic game": no mode by that name appears in the notes.

---

### 12. Meta progression

- **EXP** from stages; spent on the talent page, and on block skins once talents are done.
- Talents (costs and most numbers NOT STATED):
  - **Ember Spark** — centre of the tree, 3 tiers; the fire source attacks.
  - **Unlock** — the block-unlock ability.
  - **Loot Scavenging** — gold-based bonus; excludes gold from selling towers.
  - Gambler's Token talent — +1/2/3 starting tokens.
  - Shop discount talents; a Workshop enhancement talent.
  - **Lost and Found** — chests may hold a tower card you have built before.
  - **Resilient Forging** — shorter malfunctions.
  - **Royal Emblem** — the final talent; opens the Royal Library.
  - Removed: **Superior Efficiency**, **Fast Learner**, **Poison Mastery** and most damage talents.
- "Learn All" button; talents were reset and refunded once.
- Unlocks by play: characters, flames, anomaly levels, Endless, Infernal Shards, event characters, menu backgrounds.
- **Compendium**: towers, relics, monsters, tutorials, achievements (100), completion records, last 20 games.

---

### 13. Design lessons (changes the developer explained)

1. **Too easy at first** — "especially with those OP 2x2 towers"; fixed by a full rebalance, less crowded spawns "making AOE towers less effective", and three difficulties.
2. **Slows versus mazes** — "After everyone started building mazes seriously, the original slowing effect became too strong."
3. **Poison** — stacking totals with fixed tick interval so that poison needs "a longer path for the DOT damage".
4. **Scrap Tower ammo** — made a disposable emergency defence.
5. **Tiny** — too strong because small blocks build efficient mazes and stack buff tiles; kept the fun part and doubled draw cost so cards compete between maze and tower.
6. **Scrap Tank cap** — "balancing breaks when players invest all their resources into it. It's cool when you're doing it the first time, but after that, it makes the game boring."
7. **Scrap Rune + Mega Rune** — 20 scrap towers "was way too strong"; set to 10.
8. **Selling before victory** — Silas's interest now carries over so players need not sell towers before the last kill.
9. **Chunk** — mega blocks hard to place; gave him Blessed Chisel.
10. **Belloc** — lacked identity beyond armor; added quests and Royal Barrier.
11. **Rerolls** — per-choice rerolls became one shared resource (Gambler's Tokens).
12. **Academy rerolls** — limited for new players (encourages new combinations), unlimited once everything is cleared ("having to constantly restart the game... gets really annoying").
13. **Percentage damage in Endless** — caps added so it does not become "the only viable solution".
14. **Stun lock** — 3 s immunity after 3 s of stun, then a decaying crowd-control resistance that should not be felt in normal play.
15. **Blackhole Tower** — ignores attack speed because it made enemies "barely move at all".
16. **Path-moving towers** — "mechanics like that can easily break the balance"; given a limit of one.
17. **Drill Tower** — pulled from Endless after a player spent "8 HOURS" juggling monsters with it.
18. **3x3 towers** — kept strong, raised cost 10–15% ("strong damage output feels better for the 3x3s").
19. **Laser Tower** — "rather than changing its damage values... make its weak points more obvious."
20. **Crusher Bot** — made its weakness stand out.
21. **Restriction quests** — failing "just because you forgot" felt bad; quests became goals only.
22. **Optional extra waves give nothing** — "Feeling forced to do optional content can really hurt the overall experience."
23. **Shop before boss** — a guaranteed one made earlier shops "feel like a waste or even a punishment"; a Mini Shop or Forge instead.
24. **Sliding Ice Blocks** — removed: "it didn't have enough impact on players' tactical decisions".
25. **Corruption in Sealed Citadel** — too hard to handle; fewer tiles and the Purification Potion Mixer.
26. **Flames** — drawbacks made redundant by Infernal Shards; removed so flames are a style choice.
27. **Endless anomalies** — "those restrictive effects didn't feel great"; replaced by blessings, though runs got longer.
28. **Endless pacing** — steeper scaling after wave 10 because it had turned into "an idle game".
29. **Run length** — a built-in problem of maze TD; Enigma Sanctum was the short-format answer.
30. **Casual** — failing no longer ends the run.
31. **Event characters locked** — so a first run is not on an odd, overpowered character.
32. **Marathon mode** — rejected; balancing and length.
33. **Shard of Nightmares** — excluded malfunction monsters to avoid unlucky pile-ups.
34. **Shard of Fragility** — 1 HP eased to 3.
35. **Timer** — stressed some players; made optional.
36. **Recall** — hold was slow; instant right-click option.
37. **Runes** — players picked by numbers; added utility runes.
38. **Rune offers** — no weak and greater version together; relic offers match your elements.
39. **Hand limit versus rewards** — reward cards are never lost to a full hand; drawing is still blocked.
40. **Tana** — smaller surcharge that also hits upgrades (easier early, weaker late); buff cards dealt more evenly.
41. **Tower balance is not equal DPS** — awkward towers get more, universal ones less.
42. **Completion tracking** — added with a plea not to grind it.

---

### 14. What v1.1.0 added (2026-11-21)

- **Marlsen the White King** — event character, unlocked by clearing the game on any difficulty. "Starts the game with every Chess Tower." "After clearing each stage, you can spend Ember Stones to upgrade your Chess Towers!"
- Five chess towers:
  - **Pawn Tower** (1x1) — close-range frontline.
  - **Knight Tower** (2x2) — "can move freely within its detection range. When attacking, it leaps to the target's location and deals area damage to all enemies within 2 tiles. Damage is split evenly."
  - **Bishop Tower** (2x2) — generates orbiting energy orbs, "storing up to 15", fired rapidly when enemies enter range.
  - **Rook Tower** (2x2) — fires cannonballs "at the nearest enemies in four directions simultaneously"; each explodes for area damage.
  - **Queen Tower** (3x3) — a beam hitting all enemies in a line; "each enemy hit reduces the damage dealt to subsequent targets by 5%, down to a minimum of 25%".
- 10 new Daily/Weekly maps (2 per region).
- Camera rotation modes (Toggle / Hold / Disable).
- Tower tooltips show effects that apply to that tower (for example Frostfire's -20% attack speed).
- Spitopus uses its skill less; Warpbeast splits at most 5 times with a longer cooldown.
- Scythe Tower's effect scales with range; Silas, Tiny and Chunk easier to unlock.
- Hold Shift to feed a Scrap Tank repeatedly.
- Fixes of note: Tana gets buff cards under the Ice Pact; Tiny can no longer get blocks over 3 tiles; Poison Crystal area damage got a cap; a Bone Desert boss path-block was fixed.
- Stated next: changes to Endless Mode (blessings versus negative effects), a possible Unstable Mixture nerf, console ports.

---

# Appendix 2 — numbers from player guides and fan sites (less reliable)

### Tower footprints and upgrade costs (fan site; gold, red / blue)

| Size | Towers |
|---|---|
| 1x1 | Dart 15/15, Cannon 20/20, Magic Arrow 20/25, Laser 25/20, Arcane Missile 25/25, Axe 25/30, Drill 35/30, Lightning 30/45, Frost 40/30, Icicle 40/30, Flamethrower 50/20, Drone 20/25, Dice, Scrap, Sentry, Torch, Slime, Dynamite, Pawn |
| 1x2 | Lightning Ball 55/40, Chainball, Frost Ray |
| 1x3 | Poison 45/50, Portal |
| 2x2 | Giant Dice 25/50, Lava 50/65, Fan 30/35, Snowball 50/65, Missile 50/50, Chomp 55/70, Boulder 60/75, Golden Statue 60/75, Hammer 60/65, Lasso 65/60, Landmine 60/50, Sniper 70/60, Fireball 85/75, Ballista, Balloon, Fort, Icespike, Mushroom, Knight, Bishop, Rook |
| 2x3 (L) | Scythe |
| 1x5 | Barrage, Electro Gate |
| 3x3 | Scrap Tank 30/50, Earthquake 60/80, Thunder 65/80, Starfall 60/75, Volcano, Froststorm, Cauldron, Queen |
| oversized | Bomb 60/55, Decimate 60/50, Scorch, Blackhole |

An upgrade can change a tower's element (Missile red Fire / blue Ice; Chomp blue Poison; Boulder blue Arcane).
Bomb, Starfall and Scrap Tank cannot hit monsters next to them.

### Build cost of 1x1 towers (player guide)

Scrap 5; Dart, Dice 10; Torch, Drill, Cannon, Drone, Arcane Missile, Axe, Magic Arrow 15; Slime, Laser 20;
Frost, Icicle, Lightning 25; Flamethrower 30. (2x2 towers run about 80-95, 3x3 about 135, from the developer's notes.)

### Buff cards (player guide, v1.0)

Attack Boost +200% damage; Range Boost +200% range; Speed Boost +50% attack speed; Powerful Shot; Critical Boost (50%
chance of 150%); Energy Infusion (big attack speed, -10% a shot); Overcharge (attack speed x4); Extra Fireball; Arcane
Blast; Armor Breaker (+30% damage taken); Dark Grip (pulls the 5 furthest-along monsters in range to the target); Kill
Shot (kills below 20% HP); Poison Bottle; Magma Ammo (burn, 1% max HP a second); Toxic Coating (+50% poison); Stun
Enhance; Frost Pulse; Arcane Storm (on kill); Coin Hunter (gold on last hits); Horror Mask (50% slow around the tower).
A tower holds one buff; a new one replaces it.

### Other numbers

- Burn: 1% of max HP a second, 100 a tick at most. Charge stun: 0.5 s. Frost Tower slow: 25%.
- Silas: interest 10% of gold a round, 150 at most carried to the next stage.
- Stated counts differ by source: "45 towers, 78 relics, 7 characters, 5 flames" (store listing copy), 36 towers (one fan
  site), 100 achievements, 80 Endless maps.
- Player-described build archetypes: long path + long range; one-tile "dead path" with stuns; freeze then shatter;
  crit stacking; idle-then-big-hit; a single tower fed by all the others.
