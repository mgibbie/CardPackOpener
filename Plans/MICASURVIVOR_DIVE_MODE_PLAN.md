# MicaSurvivor — Dive Mode plan

Status: owner took the defaults (2026-11-02) plus PokéDive moves; building on `feat/micasurvivor-dive`. Source study: the shipped pokedive.com client
(main bundle + `summitArt` shared-logic chunk + floor paint worker), read 2026-11-02.
PokéDive is server-authoritative, so its final damage formula and some AI live on its server;
everything below is from client-visible tables and strings.

Owner requirements:
1. A third MicaSurvivor mode, **Dive**.
2. All **1025** species playable AND appearing as enemies.
3. Tied to the **same stats/upgrades** as regular MicaSurvivor (per-family `save.pupg`, Pokémonedas).
4. Capture the essence of what players love about PokéDive.

---

## 1. What PokéDive actually is (the essence)

**Pokémon Mystery Dungeon's rescue fantasy played in real time, like Hades or Vampire Survivors.**

Six things make it work, in order of importance:

1. **Push-your-luck banking.**
   - The HUD always shows "{n} coins secured" next to "{m} more at stake — lost if you fall".
   - Every 5th floor has an **alpha**. Killing it *secures* everything you carry and unlocks the stairs.
   - Escape Rope exits on floors 10, 20, 25, 30…: leave with everything, or keep diving.
   - If you faint you keep the secured loot plus **¼ of the rest**.
   - This is the core hook: every floor is a decision.
2. **Every floor pays something.**
   - One **lost Pokémon to rescue/escort** to the stairs.
   - About 40% of floors have a landmark (shrine heal, obelisk +30% dmg, altar, shipwreck…).
   - Secret pockets behind a boulder or thicket hold a chest or a hidden rescue.
   - Rare catchables appear sometimes; guardian legendaries sit at floor 25.
3. **Few, meaningful inputs on top of auto-combat.**
   - The basic attack is automatic.
   - You make three active choices: **dodge** (0.2 s i-frames, 1.2 s cooldown), aim or spend specials, and fire the **ultimate**.
   - Enemies **telegraph on red ground** (slam ellipses, shot lines, charge lanes), so dodging is a real skill.
4. **Elemental chemistry.**
   - Wet + Electric = chain shock across soaked foes.
   - Wet + Ice = flash freeze. Wet + Ground = mud.
   - Fire on grass tiles = wildfire, which spreads on the map.
   - Burning + Flying = firestorm. Frozen + Rock/Fighting/Steel = shatter. Poisoned + Psychic = toxic burst.
   - Combos that hit 4 or more foes get a banner. They reward type-diverse parties.
5. **Combo ("Racha") plus juice reserved for big moments.**
   - Combo:
     - The window is 3 s: the combo breaks after 3 s without a KO.
     - Each stack gives +2% XP, capped at +30%. Every 10 stacks pays coins.
     - The meter turns hot at ×10 and fire at ×20.
     - It plays a rising arpeggio, and XP-pickup chimes climb a semitone per pickup.
   - Hitstop:
     - Each struck enemy freezes 40 ms, 70 ms on a crit, 90 ms on a big hit.
     - Global hitstop is reserved for alpha kills (160 ms), the last kill on a floor (120 ms plus a "clear" sting) and the ult blast (140 ms).
   - Shake is tiered: crit 90 ms, getting hurt 160 ms, alpha 350 ms, boss intro 500 ms.
   - The ult gets a portrait cut-in with a ×1.18 zoom, then a Back.easeOut snap back.
6. **Your roster is the whole Pokédex, and kits are generated.**
   - Each type has 1 basic attack plus 4 specials across 10 move "kinds".
   - Any species gets its type-1 basic plus specials drawn from both types.
   - Move power is derived from cooldown: `power = DPS[kind] × cd × statusFactor`. That one rule keeps all 1025 Pokémon in balance.

Things PokéDive has that we **should not** copy into v1:
- The town/haven builder (11 buildings, type-matched jobs).
- Breeding, IVs and natures.
- Gacha Poké Balls.
- The "Tired" 30-minute penalty.

These are a whole second game. MicaSurvivor already has its own meta: shop upgrades, Pokédex and League.

---

## 2. Dive mode design (Magepunk version)

### 2.1 Run structure
- **Routes.** Pick one of **8 biome routes** before diving.
  - Mapping: Forest, Canyon (desert), Crater (lava), Reef (sea), Grotto (ice), Marsh (swamp), Ruins, Fungal.
  - Each route biases enemy types and the hazard tiles on its floors.
- **Floors**:
  - Every floor: spawn → find the stairs, plus one lost Pokémon to escort.
  - **Every 5th floor** is an arena with an **alpha**. Killing it banks your loot and unlocks the stairs. A camp follows it (pay coins to heal 50%).
  - **Every 25th floor** has a **guardian legendary**: a gated arena boss with an intro pan, a name banner and a fanfare.
    - Beating it saves a **stage checkpoint**, so you can start the route at floor 26 next time.
    - It awakens the route **Seal**: a permanent +10% damage and −10% damage taken on that route.
  - **Floors 26+** are the deep layer. Banking there happens only at guardians (floors 50, 75…).
- **Exits.**
  - The Escape Rope works on floors 10, 20 and every multiple of 25. Standing still for a 3 s channel exits with everything. Getting hit cancels the channel without using the rope.
  - The fail state is fainting (with no revive left). You keep the banked loot plus ¼ of the unbanked loot.
- **Level.** Every run starts at **level 1**.
  - In-run XP drives levels, and each level-up offers a choice of upgrades (see 2.4).
  - Evolving mid-run at Lv 25 and 50 is a stretch goal (§6).

### 2.2 Combat — PokéDive's move model (OWNER 2026-11-02: "for moves go with poke dive default")
Dive does NOT use the 4-slot all-fire rule from 2026-10-26. A Dive Pokémon carries:
- **Basic attack** (slot 0): auto-fires on its own cooldown at the nearest foe. It's the species' type-1 basic.
- **Special 1 / Special 2** (slots 1–2): fire **only when you press** them (1 / 2, left/right click, X / Y, touch buttons).
  - Auto-aimed at the nearest foe by default; dragging on touch, or aiming with the mouse, sets the direction.
  - A press within 0.15 s of the cooldown ending is buffered.
  - Specials are drawn from the species' two types.
- **New specials** are offered at run levels 4, 10, 16, 22… (`L>=4 && (L-4)%6==0`) and arrive at the next floor.
  - You pick which one to forget (or decline the new one).
- **Mastery**: 80 uses of a move gives «+» (power ×1.45, radius ×1.2, range ×1.1, duration ×1.25, plus a per-kind rider). 180 uses evolves it to ★, e.g. Flamethrower → Blast Burn.
- **Ultimate** (key 3 / LB / a button): one named ult per type (18). Expedition's existing `ultimates.js` handles the cast, cut-in and i-frames.
  - The charge is PokéDive's: +0.75 per hit, +0.25 when hurt, +4 per alpha kill, out of 24.
  - Effect: freeze inside 120 px, a 0.7 s windup, then the blast. Normal foes take 75% max HP, alphas 16%, bosses 7%.
  - In co-op, two ults within 0.5 s give "Double combo!" at ×1.5.
- **Dodge** (Space / A): 0.2 s i-frames, a 1.2 s cooldown and a 250 px/s dash. It's Expedition's slide verb retuned, and Dive has no hop.
- **Telegraphed enemy attacks** (red ground: slam, shot and charge) are new for MicaSurvivor. Alphas and guardians get wider lanes and patterns.
- **The held item** stays: one slot, as everywhere else in MicaSurvivor.
- **Move power** derives from cooldown, as in PokéDive: `power = DPS[kind] × cd × statusFactor`.
  - DPS per kind: projectile 10.5, counter 10, strike 9, trap 8.5, line 8, dash 8, burst 7, ring 3.6, zone 3.2, heal 1.4.
  - That keeps all 1025 kits on one scale.
  - PokéDive's 10 kinds map onto existing combat kinds (projectile, melee, beam, nova, mine, meteor, dash, trail, aura/buff) plus Expedition's 8 archetypes. Nothing new is needed in base `combat.js` except one seam: a slot marked `manual` only fires when the player triggers it.

### 2.3 Maps — a new generator (base and Expedition are open arenas)
Port PokéDive's approach:
- **Grid and smoothing.**
  - Fixed **56×40 tile** floors with 16 px tiles.
  - **Cellular automaton**: wall fill of about 0.40 (maze 0.47, islands 0.34). Run 6 smoothing passes, remove pillars and diagonal leaks, keep the largest region, and retry up to 12 seeds until at least 45% is open.
  - Shape roll: caves 50%, clearing 20%, islands 15%, maze 15%.
- **Placement.**
  - Spawn goes in the most open area.
  - Stairs go at 90% or more of the maximum walk distance, out of line of sight.
  - The lost Pokémon goes at 35–80% of the path, at least 12 tiles from the stairs.
  - Enemy groups: 1 per about 62 open tiles, at least 16 tiles from spawn. The first two act as guards on the stairs path.
- **Tiles**:
  - Water (×0.62 speed), deep water, grass (fuel for wildfire), lava, quicksand (×0.4), ice (low friction), currents (30 px/s push), boulders and thickets.
  - **Secret pockets** sit behind a boulder (broken by Rock-type hits) or a thicket (burned by Fire).
  - Our twist on PokéDive's HM gating: a **type** check instead of HMs.
- **Landmarks** appear on about 40% of floors, one per floor:

| Landmark | Effect |
|---|---|
| Shrine | full heal |
| Obelisk | +30% dmg for 60 s |
| Altar | pay 30% HP for an item |
| Shipwreck | coins |
| Frost spire | freezes nearby foes |
| Totem | reveals the map |
| Monolith | XP |
| Fairy ring | revives and heals |

- **Seeded per floor** with `runSeed + floor`, so replays and co-op stay deterministic. This matches the existing `G.Rng` and replay model.

### 2.4 Leveling inside a run
MicaSurvivor's `levelup.offer` seam already exists. Dive offers its existing move and held-item upgrades, plus Dive-only cards taken from PokéDive's 20-item list:
- Reflexes (dodge cooldown −12%).
- Ram (dodging through enemies damages them).
- Second Wind (one revive per floor at 30%).
- Frenzy (+50% attack speed for 2 s after a KO).
- Fortune (+40% coins).
- Split Shot.
- Pierce.

### 2.5 Enemies — all 1025
- Port PokéDive's **depth → target BST curve**:
  `target = 260 + 12·floor` up to floor 25, then `620 − 60·e^(−(floor−25)/45)`.
  - Pick species from `G.DEX` by a Gaussian on BST (σ = 45) × rarity^0.3, with route-type bias.
  - Co-op shifts the target by ±48 BST for party size.
- **Coverage guarantee.** Every species must be reachable on some route and depth band. Write a coverage test (as D20 did for Expedition).
  - Very low-BST babies show up on early floors.
  - Legendaries and mythicals are guardians or rare encounters only: 4 per route plus Arceus on the Origin route.
- **Elite affixes**: swift, tough and rage. **Alpha** = 1.45× scale plus telegraph patterns. **Guardian** = 1.9×.
- **Rare encounter**: a 35% chance per floor, guaranteed after 3 misses. It's a glowing catchable. Weaken it below ¼ HP to "befriend" it, which feeds the reward hook in §2.7.

### 2.6 Playable — all 1025
- Everyone uses the base character select (`save.partner` / the dex grid).
- Moves come from the existing `G.startMoveOf` and `G.Moves.poolFor(mon)` (types plus Normal), so no new kit table is needed.
- The **ult is chosen by the species' type 1** (18 named ults).

### 2.7 Shared stats/upgrades — the tie-in (non-negotiable)
- **Upgrades.** At run start, read `G.Upgrades.perks(G.DB.levelsOf(dex))`, exactly as in `game.js:106/177`. That gives HP, ATK, SPD, CD, DEF, regen, magnet, XP, coins, crit, size, TM, ban, revive and reroll for the same family.
  - No Dive-specific permanent stat tree.
- **Currency.** Banked coins pay out in **Pokémonedas** (`save.coins`), the same wallet that buys upgrades in the shop.
  - So a good dive directly buys base-mode power, and the reverse holds too.
- **Revive upgrade.** It maps onto Dive's fainting: each level is one extra "get up" per run.
- **Pokédex.** Rescued and encountered species mark "seen" in the shared Pokédex. Rescued ones add a per-species "rescued ★" badge.
- **Route Seals and stage checkpoints** are the only Dive-only progression. They're stored in a new `save.dive = {routes:{forest:{deepest, stage, seal}}, …}` block on the base save. They're not a separate save like Expedition's (smaller surface). The alternative is to mirror `js/expedition/save.js`; that's decided in §5.

### 2.8 In-dungeon Kecleon shop
- About 1 in 4 non-arena floors has a Kecleon shop.
- It shows 3 items, with a ⅓ chance of a 30%-off sale. The game keeps running while you browse.
- In co-op, purchases come from the **party pot**.

| Item | Effect | Price (unbanked run coins) |
|---|---|---|
| Sitrus Berry | heal 35% | 18 |
| Lum Berry | cure | 12 |
| Revive Seed | | 18 |
| Elixir | specials reset | 14 |
| X Attack | +20% dmg, 3 floors | 16 |
| Luminous Orb | reveal the map | 8 |
| Lure Orb | magnet | 10 |
| Escape Rope | exit from any floor | 75 |
| Rare Candy | | 26 |

All prices are scaled to our coin economy during balance (§3, V7).

### 2.9 Combo, juice and HUD
- Combo meter (§1.5), floor banner ("B12F · Ember Crater").
- Secured / at-stake coin counter.
- Faces of the rescues you're carrying ("lost if you fall").
- 25-pip route progress (every 5th pip marked, 25th = guardian).
- Minimap (`minimap.draw` seam) with fog of war.
- A low-HP red vignette.
- Every effect respects the existing reduce-motion and perf settings (see `magepunk-mobile-perf`).

### 2.10 Co-op, leaderboards, replays
- **Co-op**: up to 4 via the existing `js/net/coop.js` host-frame model.
  - The party pot is shared.
  - Downed allies are revived by standing on them for 2 s.
  - Using the rope requires a unanimous vote.
  - A stage continue requires everyone to have that stage.
- **Leaderboards** (`run-score` / `run-leaderboard`):
  - Deepest floor per route.
  - A total-depth sum across all 8 routes, PokéDive's "overall".
  - A **Weekly Dive**: same seed for everyone, always from floor 1, no stages, rotating modifiers (Glass Cannon, Horde, Fasting, Pitch Dark).
- **Replays** reuse the existing per-run tape plus a `dv` content version, like Expedition's `DV`. A run with many floors is a single tape, and the floor seed comes from the header.

---

## 3. Architecture — a fourth Expedition mode (revised 2026-11-02 after reading the code)
Expedition already ships most of what Dive needs:
- bounded tile zones with walls and collision (`G.World.setZone`, the `zone.mask/terr/paint/mini/hash` interface)
- seeded streams (`G.DLC.rng`)
- the Ultimate (`ultimates.js`)
- elemental reactions (`reactions.js`)
- the slide verb (the dodge)
- level-up cards
- the held item
- the ₽ economy and Meowth's shop
- captures and alphas
- per-family shared upgrades and the `wallet` (Pokémonedas)
- dv / co-op / replay plumbing

So Dive is **`exp-dive`**, an Expedition run mode, and gets all of that for free. Its own code is a few files in `js/expedition/`:
- `dive-gen.js` (the CA floor generator, which emits a zone object)
- `dive.js` (floors, banking, rope, rescue, landmarks, the PokéDive move model, the HUD)
- `dive-data.js` (routes, guardians, type kits, ults)

Dive's progress (deepest floor per route, stages, Seals) lives in the **Expedition save** (`G.ExpSave`). That's the save Expedition code is allowed to write, so it replaces decision #2's "base save" default. Coins still go to the shared Pokémonedas via `G.Expedition.wallet`.

The original standalone-registry sketch, kept for reference:
- **Registry**: `js/systems/dive.js`, modelled on `js/systems/expedition.js`.
  - `MODES = ['dive-route','dive-weekly']`, `DV = 1`, `BOARD = 'micasurvivor_dive'`.
  - `isDive(mode)`, and `load()` lazily injects `js/dive/*` and calls `freezeBase()` first.
- **Folder** `js/dive/` (lazy):
  - `core.js` (seams)
  - `floorgen.js` (CA generator, pure + seeded, unit-testable in Node)
  - `tiles.js` (tile physics + render)
  - `floors.js` (cadence, stairs, alpha/guardian, banking)
  - `spawns.js` (BST curve, coverage)
  - `telegraph.js` (red-ground attacks)
  - `combos.js` (element reactions)
  - `dodge.js`
  - `ult.js`
  - `rescue.js`
  - `shop.js`
  - `hud.js`
  - `routes.js` (8 routes, guardians, seals)
- **Hooks.**
  - Existing seams: `run.start`, `run.end`, `run.tick`, `combat.run`, `levelup.offer`, `item.roll`, `minimap.draw`, `replay.header`, `net.frame`.
  - New seams added to `SEAMS`: `world.collide` (tile walls instead of the open arena), `camera.bounds`, `enemy.ai` (telegraph behaviours), `player.input` (dodge/ult).
  - Each new seam defaults to a no-op so base behaviour stays the same. `micasurvivor_dlc_base_unchanged_test` must keep passing.
- **Mode select**: add a Dive card to `js/ui/modes-ui.js`, plus a route-picker screen with deepest floor, stage, seal and guardians per route.

---

## 4. Build batches (V-series)

| Batch | Scope | Exit test |
|---|---|---|
| V0 | Registry + lazy load + mode card + `save.dive` block (migration-safe) | boot + base-unchanged + forceload tests |
| V1 | `floorgen.js` CA generator + tile collision/camera seams; walk one floor to the stairs | floorgen determinism + connectivity (1,000 seeds: ≥45% open, stairs reachable, rescue placed) |
| V2 | Floor cadence: stairs → next floor, banner, alpha arena every 5, rope on 10/20/25, banking + ¼-on-faint, run summary | dive_banking_test |
| V3 | Spawns: BST curve over all 1025 + route bias; elite affixes; alpha; **coverage test** that every dex is reachable | dive_coverage_test (1025/1025) |
| V4 | Dodge + telegraphed attacks (slam/shot/charge) + per-hit freeze/shake tiers | telegraph timing test; headless dodge-through |
| V5 | Ultimate (18 named) + combo meter + element reactions + tile reactions (wildfire, wet) | combos_test (all 7 reactions fire) |
| V6 | Rescue escort + landmarks + secret pockets + Kecleon shop + party pot | rescue/shop tests |
| V7 | Guardians (32 + Arceus), stage checkpoints, route Seals, boss intro | guardian_test |
| V8 | Co-op (pot, revive, rope vote), leaderboards, Weekly Dive, replays (`dv`) | coop + replay round-trip |
| V9 | Balance via sim (extend `runmode-sim`-style headless autoplay) + perf on mobile | 45-min equivalent budget, perf-snap |

Gate per the owner's batching rule: stack V0–V3 on `feat/micasurvivor-dive`, gate and merge, then V4–V6, then V7–V9.

---

## 5. Decisions for the owner (recommended default first)
1. **Move model.** DECIDED (owner 2026-11-02): **PokéDive's** model (auto basic + 2 triggered specials + ult + dodge, + 1 held item), §2.2.
2. **Save.** DECIDED: the Expedition save (`G.ExpSave`), since Dive is an Expedition mode (§3); coins via `wallet`.
3. **Haven/town.** **(Rec)** Skip it in v1. Rescues pay coins and Pokédex badges. The alternative is a light "Rescue Camp" screen later.
4. **Fail penalty.** **(Rec)** Keep the banked loot plus ¼ of the rest, with no "Tired" timer.
5. **Legendaries.** **(Rec)** Guardians and rare encounters only, never trash spawns. They're still playable from character select, like every other species.
6. **Routes.** **(Rec)** 8 routes at launch, with the Origin route (Arceus) unlocked by all 8 Seals.
7. **Starting access.** **(Rec)** Same unlocks as base character select. Owning any family member in base unlocks it in Dive.
8. **Coin rate.** **(Rec)** Tune so a floor-25 clear pays about the same as a 15-minute base run. Otherwise one mode becomes the only farm.

---

## Progress log
- **V0+V1** (27cfa725): `exp-dive` registered; `js/expedition/dive-gen.js` CA floors; `micasurvivor_dive_floorgen_test`.
- **V2+V3** (549640b7): `js/expedition/dive.js` floors / stairs / alpha / guardian / rescue / rope / loot / BST spawns; `micasurvivor_dive_test`.
- **V4** — PokéDive's kit and controls on every input, the red ground, and viewer sync.
  - **Kit:** the basic move auto-fires; specials fire on press (`m.xman` in `combat.js`).
    - Inputs: 1/2/J/K, left/right click, pad X/Y, touch buttons.
    - A press within 0.15 s of the cooldown ending is buffered.
    - Specials do ×1.25 damage.
    - New specials are offered at Lv 4/10/16/22 as swap cards, plus a keep card.
  - **Dodge:** 0.2 s, invulnerable, 1.2 s cooldown. Bound to Space/Shift, pad A/B and a touch button. Dive has no hop.
  - **Ultimate:** 3/Z/R on the keyboard; LB/LT/RT/L3 on the pad.
  - **Red ground:** brawlers slam; alphas and guardians slam wider and charge.
  - **Viewers:** Dive's block rides in the x block's `c` slot. Live spectators, replays (field 11) and co-op guests all see:
    - the floor and its HUD line
    - the loot
    - the seal
    - the rope
    - the lost Pokémon
    - the red ground
  - **Known gap:** a cold spectator page skips the very first snapshot while the Expedition code loads. The next snapshot, about 0.5 s later, applies.
  - **Not done yet:** co-op guests do not follow the host down the stairs on their own; that is V8.
