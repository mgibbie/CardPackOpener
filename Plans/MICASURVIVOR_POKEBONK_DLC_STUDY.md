# MicaSurvivor × PokéBonk: design study and DLC plan

> **Owner request (2026-10-19).** Players like **PokéBonk** (Charcher, pokebonk.com) more than
> PokéSurvivor, the game MicaSurvivor is ported from. Study what PokéBonk does and pick what to pull
> into a **MicaSurvivor DLC**. MicaSurvivor keeps its own 2D pixel style, and the owner has
> permission.
>
> **Method.** This study is design only: systems, rules, numbers, progression and UX flow. Every
> part of the DLC is reimplemented in MicaSurvivor's code and art. **None of PokéBonk's code, models,
> textures, UI art or music comes into the repo**, and this document cites numbers instead of
> pasting code.
>
> **Sources.**
> - The shipped client, build `mvekcp7c`, v0.7.3 (2026-10-19): `index.html`, the 1.47 MB `main` bundle, the shared
>   `news` chunk (patch notes plus the game's data tables), and the es→en string map. The game is
>   authored in Spanish, like PokéSurvivor.
> - Public pages: pokebonk.org (guides, updates, the Season 2 roadmap), the Dexerto article
>   (2026-10-18), and community posts.
> - Numbers marked *(bundle)* are read from the client. Everything else is marked as coming from the web.

---

## 0. TL;DR

PokéBonk is a **"Megabonk with Kanto Pokémon"**: a 3D, browser-based survivors-like. Its Pokémon
are the same PMD SpriteCollab billboards MicaSurvivor uses, standing in a stylised voxel-ish 3D world.
Players do not prefer it for the 3D graphics alone. The reasons that carry over to 2D are:

1. **A run you can win.**
   - PokéBonk: a map has 3 zones of up to 10 minutes. You wake the zone's guardian when you are
     ready, and beating it opens a portal; a legendary shrine waits at the end.
   - PokéSurvivor/MicaSurvivor: every Normal run ends in Arceus's Judgment at 30:00. Arceus can't
     be beaten, so every run ends in death.
2. **Movement verbs.** Jump, double-jump, slide, glide (Flying types), wall-climb (Fighting/Bug/
   Ghost), surf (Water) and bounce mushrooms on terraced terrain.
3. **Evolving mid-run.** Your Charmander becomes Charizard during the run. Fully evolved
   Pokémon get "Maturity" at Lv 24/44 instead. Each species has its own 4-move kit and a
   **signature Ultimate** charged by play.
4. **Catching to build your roster.** Each Pokémon has a challenge. When you complete it, the
   Pokémon appears in your next run; weaken it and throw a Poké Ball, and it joins your
   **League**, the playable roster.
   - MicaSurvivor's roster comes from a ticket gacha.
5. **A dense, readable in-run economy.**
   - ₽ drops buy Poké Ball "chests".
   - Meowth's shop raises its prices as you buy.
   - Unown altars are stand-in-the-circle charge zones.
   - Cursed and greed risk/reward altars, Alphas you can recruit, 102 items in 5 rarities, and
     elemental reactions.
6. **Competitive structure.**
   - Normal, Hard and Nightmare difficulty tiers.
   - Time-attack splits and medals.
   - Weekly leaderboard seasons per map, tier, mode and species, plus clans.

**Recommendation.** Build an on/off DLC, working title **"MicaSurvivor: Expedition"**.
- It adds a new **Expedition** run structure on bounded, terraced 2D maps, with:
  - 2D-native verticality: ledges, ramps, hop, slide and bounce pads.
  - In-run evolution and signature Ultimates.
  - A catch-to-unlock **League** roster.
  - A ₽ economy with chests, shops and altars.
  - Rarity-rolled level-ups, difficulty tiers, a Survival (endless) mode, and separate DLC
    leaderboards.
- **Batch D0 (D0a + D0b)** comes before any content:
  - a determinism harness and golden fixtures;
  - the toggle and plumbing;
  - a test proving that with the DLC off, MicaSurvivor plays byte-identically to today.

  §5.0 covers the architecture: switch, saves, co-op, replays and boards.

---

## 1. What PokéBonk is

| Aspect | PokéBonk (v0.7.3) |
|---|---|
| Genre and presentation | 3D survivors-like (three.js). Toon-shaded terraced terrain with props and day-phase lighting. Pokémon are **2D PMD sprite billboards** with 8-direction sheets (`pmd` asset pack), the same family MicaSurvivor uses. Free, in the browser, on desktop and mobile. 9 UI languages. |
| Credits | The game credits "Megabonk (vedinad) and the survivors-likes; pokesurvivor (community)" *(bundle)*. |
| Controls | WASD/stick to move, mouse/right stick for the camera. Space jumps (hold to glide), Shift/LT slides, E interacts, R/RT casts the Ultimate. Right-click locks a target, Q toggles auto/manual aim (manual aims along the camera). T toggles auto-run, M opens the big map, Tab shows the build. Full pad support with rebinding. Optional auto-Ultimate (Y). |
| Attacking | Every move auto-fires on its cooldown at the nearest enemy (or along the camera in manual aim). The player only moves, jumps, slides, interacts and casts the Ultimate. |
| Run: **Classic** | Pick a map (Season 1 ships 2 of 6 defined) and a tier (Normal, Hard, Nightmare). The map is 3 **zones**, plus a 4th **shrine** zone on maps that have one.<br>In each zone you level up, open Poké Balls and do events, then wake the **guardian** at its altar. Beating it opens a **portal** to the next zone.<br>At 10:00 in a zone the **FINAL SWARM** starts: ×6 spawns, and enemy HP ×4 and damage ×2 every minute.<br>Zone 3 (or the shrine) ends in a **legendary** fight (forest: Mew; desert: Moltres). Winning completes the map.<br>A normal clear takes roughly 15–30 min. Time-attack medal targets are Gold < 20:00 and Champion < 14:30 on Normal (§2.13). |
| Run: **Survival** | Endless, one per map. A milestone boss every 5 min, and every 3rd one a legendary. **Mewtwo at minute 45.**<br>Phases at 12 and 24 min. "Deep wounds" (healing falls a little each minute) from minute 30, "Endless Night" (enemies get stronger every minute) from minute 45.<br>Pacts trade a boon for a bane. A migration portal moves you to new lands. Hostile terrain: mud, brambles, quicksand and burning ground. |
| Meta-progression | **Account** with trainer name + password, no email; guests by default.<br>**Stardust** (★) currency: earned from daily and weekly tasks, achievements, map clears and season prizes, scaled by tier. Spent in the **Lab** on 19 permanent upgrades and on buying 35 items into the drop pool.<br>The **League** (playable roster) is unlocked by challenges plus an in-run capture.<br>The **Research Notebook** gives avatars and frames. **Shiny** milestones give small permanent perks. Weekly **seasons** with medals, titles and clan prizes. |
| Social | Friends, a mailbox, and **clans**: 2,000★ to found one; clan points come from members' runs; seasonal clan prizes. Per-Pokémon leaderboards with titles such as «Pikachu Master».<br>No co-op yet; the roadmap puts co-op "shortly after Season 2".<br>Anti-cheat: server heartbeats every 15 s with plausibility checks, and 47 accounts banned on 2026-10-18. |
| Monetization | **None found.** No ads, purchases or donation links in the client, and the creator calls it a non-profit fan project.<br>The ad trackers people mention are on third-party *guide* sites, not the game.<br>MicaSurvivor's rule still applies: never ads, paid items or anything sold. |
| Age | Very new: public on 2026-10-15, and Patch #7 came out on 2026-10-18. It changes daily, so its numbers below are a snapshot. |

**Season 2** (roadmap, web): 2 new maps, new and reworked bosses, **Mega Evolutions**,
achievements and new items. **No Gen 2.** Co-op "shortly after Season 2". No date.
- The client already defines 6 maps. Season 1 enables only `forest` and `desert` (`maxDex: 151`).
- The next two are likely Lavender Tower and Volcano Island, then Celestial Glacier and Storm
  Coast. Each unlocks by beating the previous map's guardian.

---

## 2. Systems inventory (with the numbers from the bundle)

### 2.1 Starters, roster ("League") and evolution
- **Playable roster: 79 League members** *(bundle)*: 17 common, 36 uncommon, 21 rare and 5
  legendary (Articuno, Zapdos, Moltres, Mewtwo and Mew). Only the base of each family is listed.
  - All 151 Kanto Pokémon appear as **enemies**, guardians and evolutions.
  - Advertising "all 151" means the dex, not 151 playable starts.
- **Starters:** Bulbasaur ("Healer"), Charmander ("Fiery Assault") and Squirtle ("Defender").
  - Their challenge is to finish 2 runs, so they are effectively free.
- **Every member has:**
  - a role name;
  - a **class passive** with stat mods plus a scripted effect, e.g. Iron Fist "every 3 s an auto-punch at the
    nearest enemy within 4 m, punches +20%";
  - a fixed **4-move kit**;
  - a rank (common to legendary);
  - a **challenge**.
- **Challenge examples:**
  - Pidgey: finish 4 runs.
  - Pikachu: 10,000 KOs in rain.
  - Snorlax: 30 League members + eat 500 berries.
  - Mewtwo: 60 members + catch the 3 birds + win the desert on Hard.
  - Mew: catch the other 78.
- **Unlock flow:** challenge complete → in your next Classic run a "wild X appeared!" encounter
  spawns 50–120 s into a zone.
  - The encounter has 0.8× HP (common), 1.6× (rare) or 5× (legendary).
  - It flees after 150 s (240 s for a legendary).
  - Weaken it, then throw a Poké Ball (3 shake pips, a capture cinematic) → it joins the League.
  - Mewtwo instead **invades** zone 2 or 3 at 70–150 s, with a psychic barrier and a 60 s fight.
- **Kit unlocks:** kit moves unlock at levels **1, 2, 4 and 7**.
  - Level-up can also offer other moves the line learns (real learnsets, by level).
  - It can also offer moves from **other League members of your type**: owning more Pokémon
    widens every build.
  - Mew's passive draws from every move of power ≥ 60.
- **Evolution:**
  - Happens **in-run, at the level-up**, using the real evolution levels (stones mapped to a level).
  - Overrides: Caterpie/Weedle at Lv 8/36, Magikarp at 40, fossils at 40.
  - Eevee **branches** at Lv 36, and you choose Vaporeon, Jolteon or Flareon.
  - Evolving restores HP (to ≥50% plus 30% of max), raises base stats and upgrades the Ultimate tier.
  - Pokémon that can't evolve further get **Maturity** at Lv 24 and 44: +12% damage and HP, and the
    next Ultimate tier.
- **Stats from base stats:**
  - HP = 70 + 45·f(hp).
  - Armor = 6·f(def) + 3·f(spd).
  - Speed = 0.92 + 0.12·f(spe).
  - Physical/special multipliers = 0.82 + 0.2·f(atk/spa).
  - Base crit 5% / ×1.75.
  - Pickup range 6.
- **XP to next level:** 8 + 5.5·L + L^1.8.

### 2.2 Movement and verticality (the "Bonk")
| Verb | Rule *(bundle)* |
|---|---|
| Walk | Base speed 6.3 m/s × the speed stat. Ground acceleration ~70/s. Air control capped at 1.7× walking speed. |
| Jump | Launch velocity 11·√(jumpHeight), gravity 30. Apex ≈ **2.0 m**. |
| Extra jumps | Each extra jump is 0.92× the first. Sources: Air Balloon (+1 and +15% height), Silver Wing, the Wind pact, and the Hitmonlee, Pidgey-line, Aerodactyl and Dragonite passives. |
| Slide | Shift/LT, only on the ground: **0.55 s** at 1.9× speed, **0.9 s** cooldown. Shed Shell makes it 0.54 s cooldown + i-frames. |
| Glide | Flying types (or floaters) hold Jump: falling speed is capped at 2 m/s. |
| Climb | Fighting, Bug and Ghost types (and Magneton's "Iron Body") walk up cliff faces (upward speed 7.5). |
| Water | **Surf** for Water types (1.35× speed on deep water). Others swim at 0.7× or wade at 0.85×. |
| Step-up | You walk up rises of ≤ 0.6 m. Anything higher needs a jump, a ramp, a climb or a pad. |
| Terrain | Seeded heightfield of **terraces**: 4–5 levels per map, **4.6 m** per level (more than two jumps, so plateaus are real barriers).<br>2 spiral **massifs** per map (mountains with a ramp wound 2.3 turns). Plateaus are always connected by ≤ 0.9 m slopes (a flood-fill guarantees it).<br>Ponds with lily pads, cliffs with overhanging grass. Maps are 340–360 m wide. |
| Bounce mushroom | An interactable that launches you along a 0.85 s arc to a set landing spot (usually up a terrace), with a 25 s cooldown. |
| Height mechanics | Aerodactyl: +25% damage while airborne. Dragonite: a shockwave when landing from high up. Rock Slide: telegraphed circles you must leave. Enemy "Flocks" fly over terrain. Auto-unstick if you're trapped 3 s. |

### 2.3 Moves and auto-fire
- **Moves come from data:** every real Pokémon move in `moves.json` is mapped to one of **25
  archetypes** by its type, power, class, ailment and priority, with ~60 hand overrides.
- **Scaling from the real move:**
  - Damage × clamp(0.72 + power/260, 0.85, 1.3).
  - Cooldown × clamp(0.88 + (power−60)/500, 0.85, 1.15), and ×0.85 for priority moves.
  - Status chance = ailment chance × 1.6 (15–80%). Moves without an ailment get their type's default status at 12%.
- **The 25 archetypes** (damage / cooldown in seconds):

  | Archetype | Dmg / cd | Archetype | Dmg / cd | Archetype | Dmg / cd |
  |---|---|---|---|---|---|
  | bolt | 13 / 1.0 | orb | 15 / 1.5 | lob | 20 / 1.9 |
  | barrage | 5×4 / 1.15 | homing | 9×2 / 1.25 | beam | 7 / 2.2 (pierce) |
  | cone | 3.2 / 2.0 | nova | 22 / 2.6 | aura | 4.5 / 0.45 |
  | orbit | 9×2 / 5.5 | strike | 17 / 0.95 | dash | 20 / 2.3 |
  | chain | 13×3 / 1.4 | smite | 24×2 / 1.7 | meteor | 45 / 4.0 |
  | boomerang | 14 / 1.7 | trap | 30×2 / 2.6 | vortex | 34 / 3.6 |
  | wave | 15 / 2.4 | trail | 6 / 0.28 | drain | 10 / 1.3 |
  | spin | 9 / 0.8 | weather | 32 s cd, 14 s duration | buff | 14 s cd, 6 s duration |
  | random (Metronome) | turns into a League move | | | | |

- **Move slots:** 3 to start; the 4th is a Lab upgrade costing 1,500★.
- **Move levels:** **max level 8**. Each level adds +8% damage, plus **2 random stat rolls**
  from that archetype's list (3 rolls at Epic or better).
- **Roll sizes**, scaled by the rarity multiplier m:
  - dmg +22%·m;
  - cooldown −min(25%, 8%·m);
  - +1 projectile (+2 at Epic or better);
  - +15%·m area or speed;
  - +20%·m duration;
  - +5%·m crit;
  - +25%·m status chance.
- **Weather moves** (Rain Dance, Sunny Day, Sandstorm, Hail) change the run's weather:
  - Rain: Water and Electric +, Fire −.
  - Sun: Fire and Grass +, Water −.
  - Sand: Rock, Ground and Steel +.
  - Hail: Ice +.
  - Mist: Ghost and Dark +.
  - Ash: Fire and Dragon +, Ice −.
- **18 buff moves** (Swords Dance, Dragon Dance and others) give a temporary +damage, attack-speed and speed boost.
- **Type statuses:** every type has a default status.
  - Fire: burn. Water: wet. Electric: paralysis. Ice: chill → freeze.
  - Grass: root. Psychic: confusion. Ghost: curse. Dark: heal-block.
  - Fairy: charm. Rock and Ground: stun.
- **Elemental reactions** (0.25 s cooldown each):

  | Combo | Name | Effect |
  |---|---|---|
  | Wet + Electric | Electrocuted | ×1.5, and chains to up to 12 other wet foes within 9 m (paralysis 60%) |
  | Burn + Water | Steam | ×1.4, and confuses and roots within 6 m |
  | Burn + Grass/Flying | Inferno | Spreads burn within 7 m |
  | Frozen + Fighting/Rock/Steel | Wreckage | ×2.6 |
  | Poison + Fire | Poison Gas | — |
  | Psychic | Psychic Meltdown | Combo with a Psychic hit |
  | Dragon | Dragon Rage | Combo with a Dragon hit |

  - 3 chill stacks (or 1 on a wet target) freeze for 1.6 s.

### 2.4 Ultimates
- **Signature Ultimates:** 63 species have a scripted one, named per evolution tier.
  - Examples: Charmander "Rising Blaze → Blast Burn → Giga Blaze"; Zapdos's "Legendary Storm";
    Ditto copies a random League member's Ultimate; Mew chains 1–3 copies.
  - The rest use a **type Ultimate** ("its own will arrive with its generation block").
- **Charge** (0 → 1):
  - **Passive fill: full in 95 s.**
  - Per kill +0.004, from a refilling bucket capped at 0.024 (so mass kills can't spam it).
  - Elite +0.03, Alpha or Totem +0.08, Boss +0.2.
  - Damage taken × 0.35.
  - Lunar Blessing ×1.3, Soul Dew ×1.4.
- **Cast:** R, RT or auto. Base damage 40 × (1 + 0.1·level) × (1 + 0.15·tier), with area scaling as
  √(area).
  - **I-frames for the whole cast + 0.6 s**, a 0.32 s hit-stop and a portrait cut-in.
  - Tier = evolution stage + Maturity (0–2).

### 2.5 Level-up offers, rarity, reroll/skip/banish
- **3 cards per level** (4 with the 3,000★ "Fourth option" Lab upgrade). The kinds are:
  - a **new move**: kit moves are weighted ×3; it can come from your line's learnset or from
    other League members' kits;
  - a **move level-up**: two offers per owned move;
  - a **new vitamin** or a **vitamin level-up**.
- A move card is always pulled to the front. When everything is maxed, a level gives
  "**Training**": a small permanent stat bonus with diminishing returns, at least ⅓ of the first.
- **21 vitamins** (max level 10, **3 slots**, +1/+2 from the Lab):
  - Protein/Calcium +10% phys/spec; Iron +5 armor; Zinc +12 regenerating shield; Carbos +7% speed;
    HP Up +18; PP Up +0.5 projectile; Ether +8% attack speed; Dire Hit +5% crit;
    X Speed +12% projectile speed; X Defense +3.5% evasion.
  - Also status chance, area, duration, regen, ₽, XP, luck, lifesteal and pickup range.
  - **Cursed Incense:** +12% difficulty per level, in exchange for +6% XP and ₽.
- **Rarity:** Common, Uncommon, Rare, Epic, Legendary, which multiply the card's values by
  ×1, ×1.2, ×1.45, ×1.75 and ×2.1.
- **Rarity roll:**
  - Base weights 70 / 24 / 5 / 0.9 / 0.12.
  - Luck a = luck/100: Uncommon ×(1+0.5a), Rare ×(1+a)², Epic ×(1+a)³, Legendary ×(1+a)⁴.
  - The higher tiers are **gated by "power"** = level + luck/8 + 12·(zone−1): Rare ramps in from power
    3→10, Epic 8→18, Legendary 14→26.
- **Run tools:** **Refresh (reroll) 2, Skip 2 and Banish 1** per run.
  - Each gets +1 per Lab level (max 6 each).
  - Skip pays ₽: max(10·zone, 20% of a Poké Ball's price).
  - Banish removes a move or vitamin for the rest of the run.
  - A pre-run **Archive** (+3 slots per Lab level) keeps chosen items out of the pool.

### 2.6 Items (relics)
- **102 items**:
  - 34 common, including the 18 type boosters at +30% to their type and +3% overall;
  - 24 uncommon, 18 rare, 15 epic and 11 legendary.
- **Caps:** many items have a stack cap (e.g. Stick ×4, Revive ×2). Since 0.5.3, bonuses of the same
  stat **add** instead of multiplying, which caps long-run inflation.
- **Common examples:**
  - Life Orb +30% damage / −10% HP; Choice Band/Specs +35%, −8% attack speed; Choice Scarf.
  - Expert Belt +30% super-effective.
  - Focus Band: 15% to survive at 1 HP, every 20 s.
  - Stick: 3% chance of ×8 damage ("Bonk!").
  - Razor Fang executes non-bosses below 8%.
  - Shell Bell, Big Root, Rocky Helmet (thorns 25).
  - Light Clay +20% duration, Air Balloon (+1 jump), Metronome (up to +40% while untouched).
- **Epic and Legendary examples:**
  - Electirizer: a bolt on 3 foes every 2.5 s.
  - Sun Stone: a solar strike every 6 s.
  - Lustrous Orb: a pulling rift every 8 s.
  - Adamant Orb: stops time on hit, every 20 s.
  - Rainbow Wing: revive in flames once per zone.
  - Master Ball: +25% damage, and guarantees a wild capture.
  - Max Revive: revive at 60%.
- **Unlocking:** 35 of the items start locked. Each is revealed by a counter goal (e.g. "Dodge 200
  hits" → Shed Shell) and then **bought with Stardust** (150–3,500★) into the drop pool.
- **Pre-run boosts:** Rare Candy (+2 levels), Lucky Egg (+25% XP), Amulet Coin (+50% ₽),
  Honey (+1 Alpha per zone), Dawn Stone (a guaranteed shiny in zone 1), Master Ball (a guaranteed
  first capture).
  - They come from tasks, max 9 of each.

### 2.7 Interactables, the economy and NPCs
- **₽ (PokéDollars):** 0.2 ₽ per KO (×gold stat).
- **Rewards:** Rock Smash gold rocks give 6–14 ₽ × zone. Berries heal 50%.

| Interactable | Rule *(bundle)* |
|---|---|
| **Poké Ball (paid "chest")** | Costs 18 ₽ × 1.22^(0.65·bought). Big Nugget gives −8% per stack (to −40%), and luck up to −25%. Gives an item, a pick of 3 from 0.7.0. |
| Free Poké Ball / cursed Poké Ball | The cursed one is free, but gives +5% difficulty and a ghost ambush of 4 + 2·zone. 2 items with 40%·luck chance. |
| **Meowth's shop** | Shows up and leaves after a while, with a stock refresh. Prices rise ×1.15–2 per purchase beyond a free allowance of 2 + ⌊balls/3⌋ ("market heat"; buying too much without opening balls costs more). |
| **Unown altar** (blessing) | Stand in the circle to charge it; leaving drains it. 4 tiers: 8/14/22/35 s charge, radii 6–4.5 m. Rewards: 3 offers pick 1, up to Golden: 4 offers pick 2. Epic and Golden tiers summon waves of the horde while charging; Golden is sealed for the first 90 s. |
| Comet shard | A 10 s charge altar that burns out if ignored. |
| Challenge altar | Summons a wave; clear it for a Great Ball (a free item ball). |
| Cursed altar | A rare item for +15% enemies and +difficulty. |
| Gengar greed altar | More difficulty, XP and loot. |
| Ditto | Clones one of your items (never a maxed one). |
| Hypno | Makes you forget a move or vitamin. |
| Snorlax | A blessing or ₽. |
| Magnemite | Pulls in all the XP. |
| Cage | 20 + 10·zone ₽ frees a Pokémon: +25 research and +50% of a level's XP. |
| Slot machine | ₽ per spin, for items. A bad roll spawns Voltorb or Electrode. |
| Guardian altar | Wakes the zone boss when you choose. The hint says "first level up and open the balls". |
| Shrine and portal | The 4th zone and the legendary fight; the portal goes to the next zone. |

Survival respawns used interactables after 120–240 s, depending on kind.

### 2.8 Enemies, waves and scaling
- **Enemy pool:** each map has primary types, "late" types (mixed in after 4:00) and
  **residents**, families tied to the map.
  - Zone 1 spawns base forms, zone 2 middle stages, zone 3 final stages.
  - Spawn cards are weighted: a newly drawn card gets ×1.4 and older ones decay ×0.85.
- **Budget** (by effective time t in minutes):
  - Spawn credits per second = 0.7 + 0.014t + 0.5(t/60)^1.75, × (1 + 0.35·(zone−1)).
  - A card costs 1 + BST/220.
  - Concurrent cap = (10 + 0.65t + 4.5(t/60)²) × (1 + 0.6·(zone−1)), up to **500/900/1,400** by
    graphics quality.
  - Each zone starts its clock 0, 75 or 150 s ahead.
- **HP:** (1 + 0.3t + c·t²) × [1, 5.5, 13, 20] by zone.
- **Damage:** (1 + 0.13t) × [1, 2, 3.1, 3.4] by zone.
- **Speed:** up to ×1.3.
- **Zone timeline** (zone 1; later zones arrive earlier):
  - a new spawn card each ~60 s;
  - **Alphas** at 150, 330 and 480 s;
  - a swarm or stampede at 235 s, a swarm at 390 s, a stampede at 520 s;
  - elite waves at 330 and 450 s;
  - **Totems** at 290 and 420 s and a **Summoner** at 360 s;
  - 1–2 random events.
  - Hard and Nightmare pull events 15/30 s earlier and add a totem at 510 s.
- **Event types:**
  - **Swarm:** a 40–82 ring of foes.
  - **Stampede:** a 30–58 herd that charges in a line.
  - **Flock:** fliers crossing the map.
  - **Rock Slide:** 14 telegraphed boulders.
  - **Elite wave.**
- **Totem Pokémon:** an aura that calls its allies.
- **Summoner:** a stationary miniboss that calls minions until it leaves.
- **Alphas:** giant elites. Weaken one and it **faints**, giving 8 s to throw a **Friend Ball**.
  - It then fights for you this run as a **Support Alpha**: 2 slots, 3 with the Lab.
  - Each gives a type perk, e.g. Fire +15% status damage, Rock +15 HP, Fairy +8 luck.
  - If you don't recruit it, it drops a prize.
- **Shinies:** 8% chance per zone (+ luck/1,000), ×1.5 with the Shiny Charm.
  - The shiny roams and flees after 120 s (150 s with the charm).
- **Anti-idle:** in Survival from 5:00, staying within 12 m of one spot (or not moving) for 20 s
  starts a **Siege**: your damage falls toward 30% and flocks hunt you.

### 2.9 Bosses
- **Guardians:** one per zone, chosen from 3 per zone per map.
  - Forest: Scyther, Raichu or Golduck; then Pinsir, Primeape or Persian; then Nidoking,
    Rapidash or Arcanine.
- **Totems and Summoners** have per-zone pools.
- **Boss HP** = max(the curve, **your measured DPS × a target time**): guardians 40/50/60 s by zone,
  legendaries 60 s, × (1 + 0.15·tier).
  - So a boss is never a 2-second melt or a 10-minute slog.
  - "Exhaustion" after the target time makes it take more and more damage.
- **Patterns:** slams, ring, charge, volley and wave; legendaries add spiral, meteor and hostile
  pools.
  - Phases at 66% and 33% HP, with speed and damage ×1, ×1.12 and ×1.3, barriers and escorts
    (+0/+1/+2 by tier).

### 2.10 Map objectives
- Clear 3 zones by beating each guardian, then the legendary (or the shrine's), and leave through
  the portal.
- Optional goals: open all the balls (the minimap marks what's left once the guardian falls),
  charge altars, catch the League encounter and any shiny, and recruit Alphas.
- Fog-of-war map: since 0.6.0 the map shows only what you have seen.

### 2.11 Difficulty tiers
Normal, Hard and Nightmare. Some tiers unlock through map clears and challenges, e.g. "Win the Forest on Hard".

| Multiplier | Normal | Hard | Nightmare |
|---|---|---|---|
| Enemy HP | ×1 | ×1.4 | ×1.9 |
| Enemy damage | ×1 | ×1.42 | ×1.96 |
| Enemy speed | ×1 | ×1.08 | ×1.16 |
| Enemy amount | ×1 | ×1.3 | ×1.6 |
| Concurrent cap | ×1 | ×1.15 | ×1.3 |
| Elite share | 0 | +4% | +8% |
| Event size | ×1 | ×1.2 | ×1.4 |
| Events earlier | — | 15 s | 30 s |
| Telegraph time | ×1 | ×0.92 | ×0.85 |
| Boss escorts | 0 | 1 | 2 |
| XP | ×1 | ×1.15 | ×1.3 |
| Stardust | ×1 | ×1.75 | ×2.5 |
| Score | ×1 | ×1.5 | ×2 |

### 2.12 Scoring
- **Classic** = (2·KOs + 3·seconds + damage/200 + 1,500·(zone−1) + 800·bosses + 6,000 if won) × (1 + 0.5·tier).
- **Survival** = 2·KOs + 4·seconds + damage/200 + 800·bosses + 2,000·legendaries.

### 2.13 Leaderboards and seasons
- **Boards:**
  - KOs · Global, and Survival · Global: 100 places each.
  - Per map × tier: **KOs** and **Time attack**, 50 places each.
  - Survival per map.
  - **Per Pokémon**, for both Classic and Survival.
  - Clans.
- **Seasons:** 7-day leaderboard seasons, started automatically on 2026-10-12. Break windows count only toward the all-time record.
- **Season prizes:**

  | Place | Medal | Global board ★ | Map board ★ |
  |---|---|---|---|
  | #51–100 | Top 100 | 100 | 0 |
  | #26–50 | Top 50 | 180 | 100 |
  | #11–25 | Top 25 | 300 | 180 |
  | #4–10 | Top 10 | 500 | 300 |
  | #2–3 | Elite | 900 | 600 |
  | #1 | Master | 1,500 | 1,000 |

  - #1 on a Pokémon board earns a title: «X Master», or «X Legend» in Survival.
- **Time-attack medals** (Normal; ×(1 + 0.08·tier); +3 min on maps with a shrine):

  | Medal | Clear time |
  |---|---|
  | Bronze | Finish |
  | Silver | < 27:00 |
  | Gold | < 20:00 |
  | Champion | < 14:30 |

- Each zone records **splits** against your personal best.

### 2.14 Meta-progression ("Lab", tasks, achievements, research, shinies)
- **Lab (19 upgrades, paid in ★):**
  - 4th move slot (1,500).
  - Vitamin slots (1,200 / 3,000).
  - Refresh, Skip and Banish (+1 each, up to 6).
  - Fourth option (3,000).
  - Training +4% damage ×8; Stamina +8 HP ×8; Agility +2.5% speed ×6.
  - Study +5% XP; Trading +8% ₽; Fortune +5 luck; Magnetism; Leftovers; Shell +2 armor.
  - Revive (start with a Max Revive, 5,000).
  - Research +25%.
  - Support team (+1 Alpha slot, 3,500).
  - Archive.
  - Price formula: round(base × growth^level / 5) × 5.
- **Tasks:**
  - 3 daily tasks (60, 100, 160★) plus a completion bonus of 50★ × streak (up to 5) and a boost item.
  - 3 weekly tasks (300, 450, 700★) plus 500★ and 3 boosts.
  - One reroll.
- **Achievements:** 27 (50–1,500★).
- **Research Notebook:** every KO adds research to that family: 1, elite 2, Summoner 4,
  Alpha/Totem 5, boss 10, cage 25. A finished family unlocks the Pokémon as an **avatar**. Lab
  Research gives +25% per level.
- **Shiny perks** by number of shinies caught:
  - 2: +3 luck.
  - 4: +4% XP.
  - 6: **Shiny Charm**.
  - 10: +3% damage.
  - 15: your shiny partner starts at Bond 2 (+20% damage).
  - Shiny skins are cosmetic.

### 2.15 UX and onboarding
- Contextual first-run tips (ball, altar, shop, guardian, Alpha, portal, level-up) for the first 3 runs.
- A Lab guide.
- A move sheet and glossary, and a "check your build" (Tab) view while picking.
- A run damage breakdown: moves, Ultimate, items, Alphas.
- Splits, a big map, a north-up minimap, auto-run, auto-Ultimate, "hide my attacks", and FX
  opacity.
- Run recovery after a crash or connection loss.

---

## 3. What players seem to like more than PokéSurvivor

PokéBonk has been public for four days, so community evidence is thin.
- Direct evidence:
  - patch notes;
  - the Dexerto article;
  - guide sites;
  - a few posts, including a Threads post: "played PokeSurvivor for two days and stopped, then found the
    more fun PokéBonk".
- The rest is inferred from what the game puts first.

| Likely driver | Evidence | Applies in 2D? |
|---|---|---|
| **Winning a run.** Authored zones, a boss you trigger yourself, a portal and a final legendary | The objective structure; map clears and medals; "Regional champion" achievements. PokéSurvivor's runs always end in Arceus's Judgment | **Yes. Highest value** |
| **Moving with intent.** Jump, slide, glide, climb, surf, bounce pads, terraces | Dexerto's headline ("turns Kanto into Megabonk"); the game's tagline; many items and passives touch jumps | **Yes, rebuilt as ledges, hop and pads** (§5.2) |
| **Evolving mid-run**, plus Maturity | Guides call the evolve-in-run feel (养成感, "raising" feel) the core appeal; the cinematic evolution | **Yes** |
| **A signature Ultimate per Pokémon** | 63 scripted Ultimates; an Ultimate-ready toast, a cut-in and an auto toggle | **Yes. Reuse the Z-move visuals as the type fallback** |
| **Catching Pokémon to grow the roster** instead of a gacha | The League challenges; a capture cinematic; Support Alphas; shinies | **Yes, as a DLC-only roster** |
| **Decisions in the run** (₽, chests, shop, altars, curses) | Patch 5 rebuilt the economy; Patch 7 made Meowth's pricing smarter. Players argue about it | **Yes** |
| **Build depth from real Pokémon data** (learnsets, 25 archetypes, rarities, reactions, weather) | 79 kits; moves from other League members; elemental reactions in tasks and achievements | **Yes, but sourcing moves/learnsets is a data job** |
| **Competing** (tiers, weekly seasons, per-species boards, clans) | The cheat bans show how much players care about rankings | **Partly.** Magepunk boards plus friends; clans are open (Q9) |
| The 3D look | Chinese-language Threads posts praise it; others prefer 2D | **No**, by owner rule. The 2D pixel style stays |
| Pace and polish (patches every day, tips, run recovery) | 18 versions in 5 days | Already MicaSurvivor's habit |

**Where PokéSurvivor/MicaSurvivor already wins:**
- 966 Pokémon against 79;
- online co-op exists today;
- replays and spectating;
- Z-moves and Dynamax;
- Tower, Boss Rush and Team modes;
- no account friction.

The DLC should **add** PokéBonk's structure on top of these strengths, not replace them.

---

## 4. Gap analysis: PokéBonk system → MicaSurvivor today

✅ has it · 🟡 partly has it · ❌ lacks it

| PokéBonk system | MicaSurvivor | Notes |
|---|---|---|
| Bounded map with zones, a guardian altar, a portal and a win state | ❌ | Infinite chunked arena. Biome changes every 240 s; 5 timed bosses; ends in the unwinnable Judgment at 30:00 |
| Final swarm (soft timer) | 🟡 | The Judgment is a hard death timer |
| Terrain heights, ledges, ramps | ❌ | Flat tiles: floor, wall and liquid |
| Jump / double jump | ❌ | — |
| Slide / dodge | ❌ | The Dash move kind is an attack, not a movement verb |
| Glide, climb, surf by type | 🟡 | Flying/ghost enemies ignore terrain; the player can't. Liquid only slows |
| Bounce pads | ❌ | — |
| In-run evolution | ❌ | Only moves evolve. Species are separate unlocks |
| Per-species 4-move kit + class passive | 🟡 | 54 abilities (one per Pokémon); one starting move; level-up offers from a shared pool of 66 moves |
| 25 move archetypes from real move data | 🟡 | 15 hand-authored kinds, 66 moves, a 4-step ladder (max level 5), move evolutions and bonds |
| Signature Ultimate with a charge meter | 🟡 | 18 type Z-moves on a 240 s cooldown from level 15; Dynamax |
| Card rarities (5) + luck | ❌ | Weighted cards, no rarity |
| Reroll / Banish / Skip | 🟡 / 🟡 / ❌ | Reroll (free + upgrade); "Ban" for new-move cards; no skip |
| Vitamins (stat cards with levels and slots) | 🟡 | 10 stat cards, no slots |
| Items: 102, 5 rarities, stack caps, unlocks | 🟡 | 26 held items, 1–2 slots, equal drop odds |
| ₽ in-run economy, paid chests, shop | ❌ | Coins are meta currency. Plain/locked chests are free; the treasure-thief event |
| Charge-circle altars (Unown) | 🟡 | Altars give a one-use 25 s power; springs heal |
| Risk/reward altars (cursed, greed), Ditto, Hypno, slots | ❌ | Traps exist |
| Elemental reactions | ❌ | Statuses exist (freeze, paralysis, sleep, confusion, burn, poison, slow) |
| Weather that buffs types | 🟡 | `systems/weather.js` (upstream) |
| Alphas + Support Alphas (recruit) | 🟡 | Elites; the lost-Pokémon escort event; team mode with your own collection |
| Totems / summoners / swarm / stampede / flock / rock slide | 🟡 | Type horde, golden hour, surges, summoner and thief behaviours |
| Boss HP tuned to your DPS + exhaustion | ❌ | Fixed HP (1,400 → 16,000); a 28% Z-move cap |
| Shiny encounters to catch | 🟡 | Shiny enemies at 1/4096; shinies come from the gacha |
| Catch-to-unlock roster (League) | ❌ | Ticket gacha (9 banners, pity) |
| Difficulty tiers | ❌ | 6 modifiers + adaptive difficulty |
| Survival (endless), milestones, pacts | 🟡 | Tower pacts (15 + 4); Type Survival (10 min); no endless |
| Score formula | 🟡 | Ranks by time, then kills |
| Time attack + splits + medals | 🟡 | Rift Time Attack (8:00 countdown) |
| Per-map / per-tier / per-species boards, weekly seasons | ❌ | One `micasurvivor` board |
| Lab (meta upgrades) | ✅ | 17 per-Pokémon upgrades bought with coins |
| Daily/weekly tasks | ✅ | 17 daily / 13 weekly missions |
| Achievements | ✅ | 223 achievements, 36 titles |
| Research → avatars | 🟡 | Lexicon, trainer card, titles |
| Friends | ✅ | Magepunk friends |
| Clans | ❌ | — |
| Co-op | ✅ | PokéBonk lacks it. Local 12a + online 12b |
| Spectating, replays | ✅ | PokéBonk lacks them (12c) |
| Controller, rebinding | ✅ | — |
| Tips, glossary, build view | 🟡 | Lexicon. No contextual first-run tips |

---

## 5. DLC proposal: "MicaSurvivor: Expedition"

### 5.0 DLC architecture (owner requirements, 2026-10-19)

The DLC is an **on/off switch, like Micatro's mods**. With it **OFF, MicaSurvivor plays exactly as
it does today**: the same rules, numbers, RNG draws, spawns and saves. Everything below serves that
guarantee.

File references are as of `feat/micasurvivor-m5-b12c`. "mp.mjs" means `server/mp.mjs`, which
`functions/api/mp.mjs` re-exports.

**Precedent: Micatro mods.**
- `micatro/js/mods/registry.js`:
  - `registerMod` (:280) tags every piece of content with `o.mod = id`.
  - `activateMods(ids, options)` (:367) runs per run and rebuilds the pools through `centerActive`.
  - Named `HOOKS` (:38) are called through `callHook`/`reduceHook`/`firstHook` (:391-418).
- `mods/index.js` lazy-`import()`s the `AVAILABLE` manifest.
- The switch is a **global preference** (`localStorage 'micatro_mods'`, `ui/screens.js:998-1008`),
  copied into each run's recipe (`engine/session.js:19`).
- Boards: modded scores go to **`micatro_modded`**. The server enforces it (mp.mjs:1671-1686):
  - a `micatro` score that carries mods is moved to the modded board;
  - a `micatro_modded` score without mods is refused.

  The DLC copies this pattern. The one difference is the save: Micatro keeps a single save slot;
  the DLC gets its own.

**MicaSurvivor facts that shape the design:**
- Classic `<script defer>` globals (`G.X = (()=>{…})()`, `index.html:606-700`), not ES modules.
- A variable time step (`game.js:706`, `dt = min(1/30, real)·speedK`).
- About 130 unseeded `Math.random` calls in the sim. The only seeded path is `G.Modes.seeded`
  (`modes.js:75-82`), and it wraps Daily's `setupRun` alone.
- The save, lobby, frame and replay formats carry **no content or version field** today.

#### 5.0.1 Where the switch lives and what it controls
- **A global preference**, like `micatro_mods`: "Expedition DLC: On/Off" in **Settings →
  Content**.
  - It is stored in the DLC's own blob, plus a `micasurvivor_dlc` localStorage mirror for the
    first paint. **It is not stored in the base save** (`save.*`), so toggling it can't change a
    base save byte.
  - Default **Off** until the owner flips it (Q1).
- **Off:** no DLC script is even loaded. The menu, mode select, Lexicon and Goals are exactly
  today's.
- **On:** the mode select gains an **Expedition** tab with Classic, Survival and League, plus DLC
  entries in the Lexicon and Goals.
- **Which runs are DLC runs:** the **mode** decides, not the switch. Expedition modes run the DLC
  ruleset. Every base mode stays base even with the switch on: Normal, Daily, Boss Rush, Tower,
  Rift TA, Type Survival, Party, Team and Co-op.
  - `G.Modes.plan()`/`begin()` (`modes.js:137/153`) gain a `ruleset` field: `'base'`, or
    `'x@<dlcVer>'` for the DLC.
  - The run carries it from `startRun` (`game.js:99`) to `endRun` (:324).
- **Later option (Q2):** a per-run "Expedition flavour" modifier in base modes, e.g. hop and
  slide in Normal. It would set `ruleset` and go to the DLC boards, never silently to base.

#### 5.0.2 How content plugs in without touching base behaviour
- **Code isolation:** all DLC code lives in `micasurvivor/js/dlc/*.js`, which defines `G.DLC.*`
  and is **lazy-loaded** by a small `G.DLCLoader`. The loader injects `<script>` tags in order,
  the classic-script version of Micatro's `import()`.
  - Only three things trigger a load: the switch turning on, a DLC replay or spectate being opened,
    or a DLC lobby being joined.
  - DLC files have no side effects at load. They only register.
- **Hooks with base defaults:** D0 adds `G.Hooks` (`core/hooks.js`), modelled on Micatro's
  `callHook`/`reduceHook`/`firstHook`. Named seams:

  | Seam | Base code it wraps |
  |---|---|
  | `world.gen` | `G.World.reset`/chunk gen |
  | `player.verbs` | The player update |
  | `levelup.offers` | `systems/levelup.js` |
  | `spawner.timeline` | `systems/spawner.js` |
  | `interact.kinds` | `systems/interact.js` |
  | `hud.extra` | — |
  | `net.frame`/`net.event` | `coop.js` `hostFrame` :201 / `applyHostEvent` :378 |
  | `snap.write`/`snap.read` | `spectate.js` `snap()` :50, `replay.js` |
  | `score.submit` | `account.js:94` |

  - The base code path moves behind each seam **unchanged**, as its default.
  - DLC overrides apply only when `run.ruleset !== 'base'`. They never read the global switch.
- **Data overlays:** DLC data lives in `js/dlc/data/*` and goes into **new** registries
  (`G.DLC.Items`, `G.DLC.Kits`, `G.DLC.Maps`), never into `G.Items`, `G.Moves` or `G.Upgrades`.
  - This matters because the replay header indexes `G.Items.BY` (`replay.js:61`), so base tables
    must keep their order.
- **The run loop:** `update()` (`game.js:733`) calls `G.DLC.update(dt)` only for DLC runs, as one
  `if` in a fixed spot. A base run never constructs a DLC object.
- **RNG:** DLC runs use their own seeded stream (`G.DLC.rng`, mulberry32 from the run seed). This
  keeps DLC terrain and timeline reproducible for co-op and replays.
  - Base runs keep their current `Math.random` use. D0 does **not** reseed the base game: that would
    change base behaviour.

#### 5.0.3 Saves
- **A separate DLC blob:** server row `micasurvivordlc:<user>`, through new actions
  `micasurvivor-dlc-save-get/-put` that copy the compare-and-set pattern of mp.mjs:2203-2207. The
  base `micasurvivor:<user>` row is never touched.
  - Guests use localStorage `micasurvivor_dlc_save.<key>`.
  - The blob has its own `VERSION`, `newSave`, `migrate`, `sanitize` and `merge`, mirroring
    `core/db.js` (:30, :69-128, :256). It plugs in as one more delegate, like `Tower.merge`/
    `LocalCoop.merge`, but **on its own blob**.
- **Contents:** the switch, League members, research, DLC currency, Lab levels, item unlocks, map
  and tier clears, medals, splits, DLC tasks and achievements.
- **No DLC code writes the base save.** Toggling writes only the DLC blob. The DLC reads base data
  (account name, shiny skins if Q5 allows) **read-only**.
- **Uninstall-safe:** switching off leaves the DLC blob untouched, and switching on resumes it.
- **Currency:** a separate "Expedition Stardust". No exchange with Pokémonedas in v1 (Q4).

#### 5.0.4 Regression strategy: "base unchanged"
**The constraint:** today a full-run "same seed → same outcome" test is impossible, because of the
variable `dt` and the ~130 `Math.random` calls.

**The fix:** D0 adds **test-only** determinism instead of reseeding the game.
- **A sim harness** (`G.Game.debugStep(n, dt)`, next to `debugTime`/`debugSpeed` at
  `game.js:1064`). It runs `update(fixedDt)` n times with no rAF.
- The puppeteer test swaps `Math.random` for a seeded PRNG for the whole page, before boot, and
  drives scripted input.
- Production behaviour is unchanged: the harness is a debug entry point, like the existing
  `debug*` hooks.

**Golden-run test (`micasurvivor_dlc_base_unchanged_test.mjs`):**
1. **D0a** lands the harness alone, with no DLC code, and records fixtures. For each of Normal,
   Daily, Boss Rush, Tower and Team, and a local-co-op run, it records ~120 s of sim: a per-second
   hash of the player, enemy, pickup and projectile state, the count of `Math.random` draws, the
   spawn log, the kill/xp/coin totals and the final save blob.
2. **D0b** adds the switch, hooks, loader and blob, and asserts the **same hashes and draw
   counts** in three states:
   - (a) switch Off, DLC scripts not loaded;
   - (b) switch Off with the scripts force-loaded;
   - (c) switch **On** with a base mode selected.

   The fixtures come from D0a, so moving base code behind `G.Hooks` is proven to be a pure
   refactor.
3. **Base table freeze:** deep-freeze `G.Moves`, `G.Items`, `G.Upgrades`, `G.Enemies`, `G.DEX` and
   the `G.Items.BY` order before the DLC loads. Any write throws.
4. **Saves:** load a fixture base save, toggle On/Off, play a DLC run, toggle again. The base blob
   (and the `micasurvivor:<user>` server row in the server-test harness) must be byte-equal.
5. **Replays:** a 12c base replay fixture plays to the same final frame hash with and without the
   DLC loaded.
6. **Co-op:** the `lobby_server` test proves a base lobby round-trips without the new fields.

Every later D-batch re-runs this test. It is part of `run-all.mjs --changed` whenever
`micasurvivor/**` or the msurv server actions change.

#### 5.0.5 Multiplayer (local co-op 12a, online co-op 12b)
**Lobby:**
- `msurv-lobby-create` (mp.mjs:2309) stores `rs` (ruleset) and `dv` (the DLC content version:
  semver plus a hash of the `js/dlc/data` build) on the `msurvlobby:<id>` row.
- `msurv-lobby-update` puts both into `start = {seed, at, host, members, rs, dv}`.
- `social.js` `memberInfo()` (:175) adds `{rs, dv}` per member.
- Base lobbies omit the fields, which means base. Old clients still work.
- Invites show a "DLC" badge.

**Joining:**
- `msurv-lobby-join` (:2318) refuses a join when `dv` mismatches. The client also checks `start`
  in `coop.js:252` / `social.js:206`.
- A member with the switch **Off** gets "Enable the Expedition DLC to join". It's one click: the
  scripts load and the base save is untouched.
- A **stale cache** (`dv` differs) gets "Refresh to update" with a reload button. Everyone is on the
  web, so a reload always fixes it.

**Host-authoritative frames** (`coop.js` `hostFrame` :201):
- A DLC run adds an **`x` extension object** with its own `xv` schema number. Base frames
  `{k:'f', t, lv, …, e:[…]}` stay byte-identical.
- **Terrain is never streamed:** clients already rebuild the world from `seed`. DLC terrain is
  rebuilt from `seed + zone` with `G.DLC.rng`.
- Per frame:
  - an extra column on each enemy row: z/layer + airborne;
  - player hop, slide and glide state;
  - interactables as `[id, kind, charge 0-255, used]`, sent only when changed;
  - boss phase, Ultimate charge and cast;
  - allies and Alphas;
  - capture state.
- **New reliable events** in `applyHostEvent` (:378): `xz` zone change/portal, `xe` evolution,
  `xc` capture result, `xu` Ultimate cast, `xi` interactable used.
- **Relay mode** (1 Hz): the per-frame `x` block shrinks to the players and bosses, and events stay
  reliable.
- **Rule:** each D-batch that adds DLC state must extend `x`, bump `xv`, and add a guest-render test
  to `micasurvivor_online_test`.

**Local co-op (12a):**
- The DLC adds an "Expedition co-op" variant on top of `G.LocalCoop` (`localcoop.js:137/187`):
  the mate gets hop and slide on the second pad.
- The AI mate pathfinds through the DLC layer graph via the `player.verbs` and pathing hooks.
- The base `'coop'` mode is unchanged.

#### 5.0.6 Replays and spectating (12c)
**Replays:**
- The header (`replay.js` `begin` :61, `h = {v:1, …}`) gains optional `rs`, `dv` and `map`/`tier`,
  plus an `xv` per frame stream. A header without `rs` is base, so every existing replay stays
  valid.
- Server changes: `cleanMsurvReplayMeta` (mp.mjs:176) is an **allow-list** and currently drops
  unknown meta, so it must accept `rs`/`dv`/`map`/`tier`. `micasurvivor-replay-put` (:2630) keeps
  `v===1` (the new fields are optional).
- **Playback** (`watch-ui.js`, which today rebuilds the world from `s.sd`/`s.b` at :50-51):
  - `rs` present → lazy-load the DLC renderer and rebuild terrain from seed + zone.
  - A DLC replay recorded on an **older** `dv` plays through versioned `snap.read` handlers keyed by
    `xv`. Readers keep the old schemas.
  - A replay from a **newer** `dv` than the viewer's cached build shows "Refresh to watch".
- **Size:** terrain costs nothing, since it comes from the seed. The `x` block adds ~5–10% per
  snapshot.
  - DLC replays must still fit 12c's **1.2 MB / 30k frames**, and live snapshots the **24 KB**
    `publish-micasurvivor` cap (mp.mjs:2546).
  - D11 measures a busy 30-min Expedition run and trims far-entity columns if needed.

**Spectating** (`spectate.js` `snap()` :50, `v:1`):
- Carries the same optional `rs`/`dv`/`x`, so spectators of a DLC run see ledges, pads, altars,
  bosses and captures.
- A viewer with the switch Off is offered the one-click enable, as for co-op.

#### 5.0.7 Leaderboards
- **A separate board family, like `micatro_modded`:** add `micasurvivor_dlc` to the run-score
  whitelist (mp.mjs:1671) with Micatro-style enforcement:
  - a `micasurvivor` score that carries `rs`/`dv` is refused;
  - a `micasurvivor_dlc` score without them is refused.

  The base `runboard:micasurvivor` stays pure.
- **D0** ships one board: `runboard:micasurvivor_dlc`, Expedition Classic, by score.
- **D9** adds sub-boards: `runboard:micasurvivor_dlc:<map>:<tier>:<ko|time>` and
  `…:survival:<map>`, plus optional per-species boards (Q8). The key is built server-side from
  validated fields, never sent by the client.
- **Side note** (pre-existing, outside the DLC): the base board's gate is
  `clean() && G.Modes.is('normal')` (`game.js:392`). It **doesn't exclude the 6 modifiers**, so
  modded Normal runs reach `runboard:micasurvivor` today. That is worth a one-line base fix, but it
  is the owner's call (Q14), because it changes base behaviour.

### 5.1 What to adapt (ranked)

| # | Element | Value | Effort | 2D translation |
|---|---|---|---|---|
| 1 | **Expedition run**: bounded map, 3 zones, guardian altar, portal, final swarm, legendary shrine, win state | ★★★ | M | A bounded tile map per zone (e.g. 120×120 tiles) instead of infinite chunks. The portal is a tile object, and zone transitions are a fade |
| 2 | **Terrain layers and movement verbs**: hop, slide, glide, climb, surf, bounce pads | ★★★ | L | §5.2 |
| 3 | **In-run evolution + Maturity** | ★★★ | M | PMD sheets for every stage are already hosted. Show a white-flash evolution cinematic in pixels |
| 4 | **League**: per-species kit, passive and challenge; catch-to-unlock | ★★★ | L | A DLC-only roster of ~80 Kanto families (§5.4) |
| 5 | **Signature Ultimates** with a charge meter | ★★☆ | L (content) | Reuse the 18 Z-move scripted effects as type Ultimates. Write signatures for starters, Pikachu, Eevee and legendaries first |
| 6 | **Rarity-rolled level-ups** + vitamins + Skip/Banish | ★★☆ | S–M | Card frame colours; luck-gated power |
| 7 | **₽ economy**: paid Poké Balls, Meowth shop with heat, Unown charge altars, risk altars, Ditto/Hypno | ★★☆ | M | Tile props + a minimap legend |
| 8 | **Alphas + Support Alphas + capture** | ★★☆ | M | A scaled-up sprite (×1.6) with a red aura; a Friend Ball throw arc in pixels |
| 9 | **Difficulty tiers + score + splits/medals + DLC boards** | ★★☆ | S–M | — |
| 10 | **Survival (endless)** with milestones, pacts and siege | ★★☆ | M | Reuse the Tower pacts UI |
| 11 | **Elemental reactions** and weather type boosts | ★☆☆ | S | Reaction pop-text + palette flashes |
| 12 | **Boss HP from your DPS** + exhaustion | ★☆☆ | S | — |
| 13 | **Learnset-driven move pool** (25 archetypes) | ★☆☆ | L (data) | Optional. Start with the hand-mapped kits of the League members (~320 moves) |

### 5.2 Verticality from 3D to 2D pixel art

MicaSurvivor is a top-down 3/4-view tile game, like the GBA Pokémon games, and that genre already
has a vertical language: **ledges you hop down, cliffs, stairs, ramps, Surf and Fly**. Use it.

| PokéBonk 3D | MicaSurvivor 2D (DLC) |
|---|---|
| Heightfield terraces, 4.6 m per level | A **per-tile height layer**, 0–3. A cliff face is drawn as a 1–2-tile wall strip along the south edge, the GBA look. The tile painter adds cliff-face, ledge-lip and stair/ramp tiles to each biome palette (drawn in code, like the current tiles) |
| Step-up 0.6 m / slopes ≤ 0.9 m | **Ramps/stairs** are the only walkable way up. A connectivity flood-fill at generation guarantees every plateau is reachable (as PokéBonk does) |
| Jump (apex 2 m) | **Hop**: a 0.45 s arc with the sprite lifted 0–12 px and the shadow left on the ground.<br>Airborne: you pass over ground enemies and hazards with no contact damage (i-frames from contact only, not projectiles). You can **hop down a ledge** (one-way, Pokémon style). You can't hop up a full layer |
| Extra jumps (Air Balloon…) | The **2nd hop** in the air may **climb one layer**: with an extra-jump item, hopping into a cliff face mid-air lands you on top |
| Slide (0.55 s, ×1.9, 0.9 s cd) | **Slide** with the same numbers (in tiles/s). A dust trail. Shed Shell-style i-frames come from an item |
| Glide (Flying) | **Glide**: hold Hop to stretch the airtime to 1.2 s and cross gaps of up to 3 tiles (water, lava, chasms) |
| Climb (Fighting/Bug/Ghost) | **Climb**: walk up cliff faces at 50% speed |
| Surf (Water ×1.35) | **Surf**: Water types cross deep liquid tiles at ×1.35; others are blocked by deep water or slowed in shallows. This extends MicaSurvivor's liquid tiles |
| Bounce mushroom (25 s cd, 0.85 s arc) | A **bounce pad** prop (a mushroom; a spring for the desert) that throws you along a set arc onto a higher layer, with squash/stretch on the sprite |
| Airborne +25% damage / landing shockwave | Kept as item and passive effects ("land from a ledge → shockwave") |
| Enemies path in 3D | Ground enemies path by layer through ramps (extend `systems/pathing.js` with a layer graph). Flying and Ghost enemies ignore layers, as MicaSurvivor already does |
| Projectiles | Fly over layers. Cliffs don't block shots (keeps it readable); walls still do |
| Camera | No change: top-down. Higher layers are not y-shifted; their height reads through the cliff faces and shadows |
| Anti-camping on plateaus | Survival's **Siege**, plus "Flock" fliers and ranged elites keep plateau camping honest |

The camera has no third dimension, so MicaSurvivor doesn't need PokéBonk's camera-relative manual
aim. Keep MicaSurvivor's auto-fire plus the existing move-select keys.

**New pad actions** (wired in `js/core/pad.js`, as M5 requires): Hop (A), Slide (RB), Interact (X)
and Ultimate (RT). They are only bound in DLC runs, so base bindings don't change.

### 5.3 Run structure and modes
- **Expedition · Classic:**
  - A map has 3 zones, plus a 4th shrine zone where the map has one. A bounded seeded map per
    zone; the portal advances.
  - Each zone has 10:00 before the **final swarm**, a timeline like §2.8 rescaled to
    MicaSurvivor's enemy cap, and a **guardian altar**.
  - Bosses: guardians (40/50/60 s DPS-tuned), then the legendary.
  - Normal, Hard and Nightmare tiers unlock in sequence per map.
- **Expedition · Survival:**
  - Endless, on one map per run.
  - A milestone boss every 5 min (a legendary every 3rd; an end-boss at 45:00 that doesn't end the
    run).
  - Phases at 12 and 24 min, wounds at 30, night at 45.
  - Pacts every milestone: 9 boon/bane pacts, reusing `tower-ui.js`.
  - Migration portal at 11:00. Hazards: mud, brambles, quicksand and burning ground. Siege.
- **Expedition · League:** a roster screen with challenges, kits and Ultimates, the Lab, research,
  tasks and boards.
- **Launch maps (3):**

  | Map | Types | Verticality | Legendary |
  |---|---|---|---|
  | **Viridian Forest** | grass/bug/normal/flying | Gentle terraces; ponds | Mew shrine |
  | **Mt. Moon** | rock/ground/fairy | Cave ledges; heavy verticality | Clefable as a "guardian" |
  | **Cerulean Cape** | water/electric/flying | Islands, surf and glide gaps | Zapdos |

  - Desert, Lavender Tower and Seafoam/Volcano are post-launch maps (D12+).
  - Map choice is Q6. Picking Magepunk-world locations (the cabinet is in Pewter) avoids mirroring PokéBonk's lineup.

### 5.4 Content scope (v1)
| Content | v1 target | Notes |
|---|---|---|
| League roster | ~80 Kanto families (starters + ~77) | Use MicaSurvivor's existing PMD sheets and its 54 abilities as the class-passive base. 4-move kit each |
| Signature Ultimates | ~16: 3 starter lines, Pikachu, Eevee, Snorlax, Gengar, Gyarados, Dragonite, Lapras, Mewtwo, Mew, the 3 birds, Ditto | The rest use the type Ultimate (the Z-move effect, rescaled) |
| Move archetypes | 15 existing + 8 new: lob, homing, barrage, smite, vortex, wave, spin, weather | The kit moves (~320) hand-mapped in `dlc/data/kits.js` |
| Items | ~60 in 5 rarities, plus 18 type boosters | New pixel icons where the Android item set lacks them |
| Vitamins | 21 | Pixel icons from items |
| Interactables | ~12 | Poké Ball (paid/free/cursed), Meowth, Unown altar ×4 tiers, challenge, cursed and greed altars, Ditto, Hypno, gold rock, berries, bounce pad, cage |
| Bosses | 9 guardians + 3 legendaries + totems/summoners per map | |
| Maps | 3 | Plus 1 shrine zone |
| Meta | DLC currency, ~15 Lab upgrades, ~25 item unlocks, research avatars, daily/weekly DLC tasks, ~30 DLC achievements | |
| Boards | Map × tier (KO/time), Survival per map; per-species optional | |

### 5.5 Batches and milestones

Each batch is sized like an M5 batch: **one major system per PR**, one new `js/dlc/*.js` system of
~300–1,200 lines plus UI. Each has:
- its own README section, in the M5 shape: rules table, input, saved and merged, deviations, not yet;
- a test file `overworld/tests/micasurvivor_dlc_<feature>_test.mjs`;
- the pad action wired;
- **the base-unchanged golden test (§5.0.4) passing**;
- its own extension of the net/replay snapshot schema.

| Batch | Scope | Depends on |
|---|---|---|
| **D0a. Determinism harness** (no gameplay change) — **BUILT 2026-10-19** (`overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs`, fixtures in `overworld/tests/fixtures/micasurvivor_golden/`, README "DLC D0a: base-unchanged harness") | `G.Game.debugStep(n, dt)` fixed-step entry; a puppeteer page-wide seeded `Math.random`; scripted input; per-second state hashes + draw counter; **golden fixtures recorded** for Normal, Daily, Boss Rush, Tower, Team and local co-op, plus a base replay fixture | — |
| **D0b. DLC toggle and plumbing** — **BUILT 2026-10-19 as "Expedition plumbing"** (no toggle; see the update below and `micasurvivor/README.md`, "DLC D0b: Expedition plumbing") | Settings → Content switch (in the DLC blob + a localStorage mirror); `ruleset`/`dv` through `Modes.plan/begin`; `core/hooks.js` seams with base code moved unchanged; `G.DLCLoader` (ordered script injection); `micasurvivordlc:<user>` blob + `micasurvivor-dlc-save-get/-put`; `micasurvivor_dlc` board with Micatro-style enforcement; `rs`/`dv` on the lobby, `start`, replay header/meta allow-list and spectate snapshots, with join/watch version gates; an empty Expedition tab; **the base-unchanged test against the D0a fixtures** + table freeze + save/replay/lobby round-trips | D0a |
| **D1. Terrain layers** — **BUILT 2026-10-20** (`js/expedition/terrain.js`, `overworld/tests/micasurvivor_expedition_terrain_test.mjs`, README "DLC D1: terrain layers") | Per-tile height 0–3, cliff/ledge/ramp tiles in the code tile painter; bounded seeded zone generator (`G.DLC.rng`) with a connectivity flood-fill; layer-aware collision and pathing (ramps); minimap shading; guest/replay/spectator terrain rebuilt from seed + zone (`x` block v1) | D0b |
| **D2. Movement verbs** — **BUILT 2026-10-21** (`js/expedition/verbs.js`, `overworld/tests/micasurvivor_expedition_movement_test.mjs`, README "DLC D2: movement verbs") | Hop (ledge-down, contact i-frames; revised: walk down a ledge, hop up one level, extra hop two), slide, glide, climb and surf by type, bounce pads; pad and touch buttons; per-frame z/airborne in snapshots | D1 |
| **D3. Expedition · Classic** — **BUILT 2026-10-21** (`js/expedition/classic.js`, `overworld/tests/micasurvivor_expedition_classic_test.mjs`, README "DLC D3: Expedition · Classic") | Zones, zone timeline (alphas, swarm, stampede, flock, rock slide, elite wave, totem, summoner), guardian altar, portal, final swarm, legendary shrine, victory screen, splits; boss HP from DPS + exhaustion; map 1 (Viridian Forest) | D2 |
| **D4. League roster and evolution** — **BUILT 2026-10-21** (78 of the 249: `js/expedition/league.js`, `league-data.js` generated by `tools/micasurvivor/gen_league.mjs`, `overworld/tests/micasurvivor_expedition_league_test.mjs`, README "DLC D4: League roster and evolution"; see the update below) | ~80 kits + passives, kit unlock levels 1/2/4/7, in-run evolution with branch choice (Eevee), Maturity at 24/44, stats from base stats; the 3 starters free | D3 |
| **D5. Level-ups and items** — **BUILT 2026-10-21** (`js/expedition/levelups.js`, `items.js`, `moves.js`, `overworld/tests/micasurvivor_expedition_levelups_test.mjs`, README "DLC D5: level-ups and items"; see the update below) | 5-rarity luck-gated cards, move levels to 8 with archetype stat rolls, 8 new archetypes, 21 vitamins + slots, Refresh/Skip/Banish; ~60 items with caps and additive same-stat stacking | D4 |
| **D6. Ultimates** — **BUILT 2026-10-22** (`js/expedition/ultimates.js`, `overworld/tests/micasurvivor_expedition_ultimates_test.mjs`, README "DLC D6: Ultimates"; see the update below) | Charge meter (95 s passive, kill bucket, elite/alpha/boss, hurt), cast i-frames, cut-in; type Ultimates from Z-move effects; 16 signature Ultimates by evolution tier; auto-Ultimate setting | D4 |
| **D7. Economy and interactables** — **BUILT 2026-10-22** (`js/expedition/economy.js`, `overworld/tests/micasurvivor_expedition_economy_test.mjs`, README "DLC D7: economy and interactables"; see the update below) | ₽ drops, paid/free/cursed Poké Balls, Meowth with market heat, Unown altars ×4 tiers + comet, challenge/cursed/greed altars, Ditto, Hypno, gold rocks, berries, cage; minimap legend, fog of war; first-run tips | D5 |
| **D8. Alphas, capture and shinies** — **BUILT 2026-10-22** (`js/expedition/capture.js`, `reactions.js`, `overworld/tests/micasurvivor_expedition_capture_test.mjs`, README "DLC D8: Alphas, capture and shinies"; see the update below) | Alphas, faint window, Friend Ball, Support Alphas (2/3 slots) with type perks; League encounters (challenge → appear → weaken → catch); shiny encounters; capture cinematic; elemental reactions + weather boosts | D7 |
| **D9. Tiers, score and boards** — **BUILT 2026-10-22** (`js/expedition/tiers.js`, `overworld/tests/micasurvivor_expedition_tiers_test.mjs`, README "DLC D9: tiers, score and boards"; see the update below) | Normal/Hard/Nightmare tables, tier unlocks per map, score formula, time-attack medals, DLC boards and the board UI; weekly season view (cosmetic prizes only) | D3 |
| **D10. League meta** — **BUILT 2026-10-22** (`js/expedition/meta.js`, `overworld/tests/micasurvivor_expedition_meta_test.mjs`, README "DLC D10: the League meta"; see the update below) | DLC currency, Lab (~15 upgrades), item unlocks by counter goals, Archive, research → avatars and frames, DLC daily/weekly tasks, ~30 achievements, shiny perks | D8 |
| **D11. Survival and MP hardening** — **BUILT 2026-10-25** (`js/expedition/survival.js`, `overworld/tests/micasurvivor_expedition_survival_test.mjs` and `micasurvivor_expedition_mp_test.mjs`, README "DLC D11: Survival and MP hardening"; see the update below) | Endless mode (milestones, phases, pacts, siege, night, migration, hazards); full online co-op pass on DLC state, relay budget check, replay size check against 1.2 MB, spectator rendering | D9, D10 |
| **D12. Maps 2–3** — **BUILT 2026-10-25** (`js/expedition/classic.js` MAPS, `terrain.js` LOOK, `overworld/tests/micasurvivor_expedition_maps_test.mjs`, README "DLC D12: maps 2-3, Mt. Moon and Cerulean Cape"; see the update below) | Mt. Moon, Cerulean Cape: biome palettes, residents, guardians, totems, summoners, legendaries, bounce-pad variants | D11 |
| **D13. League mode** — **BUILT 2026-10-26** (the whole League: 245 members; `js/expedition/league.js`, `meta.js`, `overworld/tests/micasurvivor_expedition_leaguemode_test.mjs`, README "DLC D13: League mode"; see the update below) | League mode as the League's own screen (roster by generation, kits, evolutions, Ultimates, records, challenges, Play), D4b / D4c / D4d built, the League board, a League task and 5 achievements | D12 |
| **D14. Mega Evolution** — **BUILT 2026-10-26** (`js/expedition/mega.js`, `mega-data.js`, `overworld/tests/micasurvivor_expedition_mega_test.mjs`, README "DLC D14: Mega Evolution"; see the update below) | 93 Megas of 87 species from Lv 40 as a level-up choice: real stats and types, the Ultimate a tier up, the overworld's Mega sprites or a composed look | D13 |
| **D15. Slot machine + Survival respawns** — **BUILT 2026-10-26** (`js/expedition/economy.js`, `overworld/tests/micasurvivor_expedition_slots_test.mjs`, README "DLC D15"; see the update below) | The slot machine (play money only; a bad roll spawns Voltorb / Electrode) and Survival's respawn of used interactables | D14 |
| D16+ (later) | More maps (desert, Lavender), more signature Ultimates, Mega Evolutions as a late-run power spike (Q10), per-species boards, clans (Q9) | — |

**Milestones:**
- **α** (D0–D3): a playable, winnable Expedition map with verticality, behind the switch, base
  proven unchanged.
- **β** (D4–D8): the full run loop with the League.
- **1.0** (D9–D12): boards, meta, Survival and 3 maps.
- **Launch:** owner playtest → flip the default (Q1).

### 5.6 What NOT to take
| Don't take | Why |
|---|---|
| Any PokéBonk code, models, textures, UI icons, portraits, music or its exact text | Our own reimplementation and art only; MicaSurvivor's 2D pixel style stays (owner) |
| The 3D camera, free-look, FOV, camera-relative manual aim, depth fog, bloom/vignette post-processing, day-phase skyboxes | 3D-only. A top-down camera doesn't need them |
| 1,000+ concurrent enemies | Canvas 2D and the co-op snapshot size can't afford them. Keep MicaSurvivor's cap family: raise to ~120–200 for the DLC only, measured with the perf tool |
| Passwordless guest accounts, name/password signup, account deletion | Magepunk accounts already exist |
| Anti-cheat auto-bans | Use the site's existing run validation; add plausibility checks per ruleset in D9. No auto-ban without owner review |
| Slot machine | It's gambling with in-run ₽ only, but it's an owner call (Q7). Default: leave it out |
| Paid anything, ads, donation prompts | MicaSurvivor licence rule (PolyForm NC + owner) |
| More UI languages | Owner dropped them (MicaSurvivor stays English + Spanish) |
| Replacing base systems (gacha, Z-moves, Dynamax, 966 roster) | The DLC is additive and toggleable; base stays as is |
| Copying PokéBonk's maps one-for-one, or its 79-member list and challenge numbers verbatim | Pick our own maps (Q6) and tune our own numbers; the cited numbers are a starting reference, not a spec |
| Mega Evolutions now | They're PokéBonk's unreleased Season 2; revisit after 1.0 (Q10) |

---

## 6. Open questions for the owner

1. **Default of the switch:** Off for everyone at launch (opt-in beta), or On once 1.0 ships?
2. **DLC-only modes, or also "DLC flavour" in base modes?** E.g. hop and slide in a Normal run.
   - Proposed: Expedition modes only in v1; a per-run "DLC modifier" later, on DLC boards.
3. **Roster:** a separate League roster (~80 Kanto, catch-to-unlock), or should DLC runs also
   allow the base gacha collection?
   - Proposed: League only, so challenges and captures matter.
4. **Currency:** a separate "Expedition Stardust", or share the base Pokémonedas?
   - Proposed: separate, with no exchange in v1.
5. **Cosmetics crossover:** may DLC research avatars and shinies show on the base trainer card, and
   base shiny skins in DLC runs (read-only)?
6. **Maps:** Viridian Forest / Mt. Moon / Cerulean Cape as the 3 launch maps, or mirror PokéBonk's
   Forest/Desert first?
7. **Slot machine and other gambling-flavoured interactables:** include (in-run ₽ only) or skip?
8. **Boards:** map × tier × (KO, time) + Survival per map is the default. Add per-species boards
   and weekly seasons with cosmetic prizes too?
9. **Clans:** a site-wide Magepunk feature (useful to Battlecards and Micatro too), a MicaSurvivor-only
   feature, or skip?
10. **Mega Evolution** as a late-run spike after 1.0: yes or no? (It isn't in PokéBonk yet either.)
11. **Enemy density:** may the DLC raise the concurrent-enemy cap (base 64 → ~150–200 in DLC runs),
    subject to the mobile perf check?
12. **Data sourcing:** hand-map ~320 kit moves (v1), or import PokeAPI moves + learnsets for the
    full archetype generator (bigger, enables "moves from other League members")?
13. **Online co-op in DLC runs at α**, or only from D11 (solo + local co-op first)?
14. **Base board side note:** today `game.js:392` lets Normal runs with the 6 modifiers onto
    `runboard:micasurvivor`.
    - Fix it in base (a behaviour change, so it is outside the DLC's "base unchanged" promise), or
      leave it?

## Owner decisions (2026-10-19)
| # | Question | Decision |
|---|---|---|
| 1 | Toggle default | **Off until 1.0**, then defaults On |
| 2 | Toggle scope | **New Expedition modes only**; base modes stay exactly as they are even with the DLC on |
| 3 | Roster | **League roster only** (earned via challenges + capture) |
| 4 | Currency | **Shared Pokémonedas** (DLC rewards balanced to match) |
| 5 | Cosmetics | **Shared both ways** (shinies, titles, skins) |
| 6 | Launch maps | **Viridian Forest, Mt. Moon, Cerulean Cape** |
| 7 | Slot machine | **Yes, play money only** (in-run ₽, never real money) |
| 8 | Boards | **Per map + difficulty** (no per-species, no weekly seasons for now) |
| 9 | Clans | **Skip for now** |
| 10 | Mega Evolution | **Include in 1.0** (add to the core batches) |
| 11 | Enemy cap | **Raise it, scaled by device** (up to ~200 on desktop, lower on phones; frame-rate measured) |
| 12 | Move kits | **Hand-picked** (~320 moves from our existing move set) |
| 13 | Online co-op | **From the first playable**; every DLC system syncs over co-op as it's built |
| 14 | Base board bug (modifier runs on the base board) | **Fix it** (separate base PR before the DLC) |
| — | Base spawn density (batch 9) | **Keep the web's** (0.24 / ×0.4) |
| — | Judgment ruins (batch 9) | **Tower floors and Rush starts skip it**, like the port (base PR) |
| — | Order | **Base fixes PR first**, then DLC D0a |

### Update (owner, 2026-10-19): no on/off switch
The DLC is now just new **Expedition modes** that don't touch any other mode, so it does **not** need a global
toggle. Players reach it by choosing an Expedition mode, like Tower or Boss Rush. That supersedes decision #1 and
the "toggle" parts of the DLC architecture and of D0b. Still kept:
- **Expedition boards:** separate leaderboards, per map and difficulty.
- **Multiplayer, replays, spectating:** the lobby, replays and spectating carry the mode plus an Expedition content
  version.
- **Saves:** DLC progress (League, unlocks) is stored in its own save section, and the base save is never rewritten.
- **D0a, lighter:** a test-only harness proving that existing modes are unchanged by the Expedition code (golden
  fixtures per base mode). No game-code changes.
- **D0b becomes "Expedition plumbing":**
  - the mode registry entry and lazy-loaded Expedition code;
  - the separate save section;
  - the `micasurvivor_expedition` boards;
  - the version fields.


### Update (owner, 2026-10-19): the League roster is every family that evolves twice
Not just Kanto: **every Pokémon family with three stages, across all 9 generations: 116 families** (from PokéAPI evolution chains).
Each family is one League member, starting at its first stage and evolving mid-run (branches such as Ralts, Wurmple and Applin get a branch choice).
**111 of 116** already have every stage in MicaSurvivor's sprite set.
The other 5 need sprites added first (marked *): Mime Jr. (Mr. Rime #866), Pidove (Tranquill #520), Pikipek (Trumbeak/Toucannon #732-733), Rolycoly (whole line #837-839), Smoliv (Dolliv #929).

| Gen | # | Families (* = sprites missing) |
|---|---|---|
| 1 | 22 | Bulbasaur, Charmander, Squirtle, Caterpie, Weedle, Pidgey, Nidoran F, Nidoran M, Zubat, Oddish, Mankey, Poliwag, Abra, Machop, Bellsprout, Geodude, Magnemite, Gastly, Rhyhorn, Horsea, Porygon, Dratini |
| 2 | 14 | Chikorita, Cyndaquil, Totodile, Pichu, Cleffa, Igglybuff, Togepi, Mareep, Hoppip, Teddiursa, Swinub, Elekid, Magby, Larvitar |
| 3 | 17 | Treecko, Torchic, Mudkip, Zigzagoon, Wurmple, Lotad, Seedot, Ralts, Slakoth, Whismur, Azurill, Aron, Trapinch, Duskull, Spheal, Bagon, Beldum |
| 4 | 9 | Turtwig, Chimchar, Piplup, Starly, Shinx, Budew, Mime Jr*, Happiny, Gible |
| 5 | 20 | Snivy, Tepig, Oshawott, Lillipup, Pidove*, Roggenrola, Timburr, Tympole, Sewaddle, Venipede, Sandile, Gothita, Solosis, Vanillite, Klink, Tynamo, Litwick, Axew, Pawniard, Deino |
| 6 | 8 | Chespin, Fennekin, Froakie, Fletchling, Scatterbug, Flabebe, Honedge, Goomy |
| 7 | 8 | Rowlet, Litten, Popplio, Pikipek*, Grubbin, Bounsweet, Jangmo O, Cosmog |
| 8 | 10 | Grookey, Scorbunny, Sobble, Rookidee, Blipbug, Rolycoly*, Applin, Hatenna, Impidimp, Dreepy |
| 9 | 8 | Sprigatito, Fuecoco, Quaxly, Pawmi, Smoliv*, Nacli, Tinkatink, Frigibax |

Notes:
- **Legendaries:** Cosmog's line is the only legendary that evolves twice (Cosmog > Cosmoem > Solgaleo/Lunala).
- **Rarities and challenges:** roughly by final-stage base-stat total, with the starter trios free, as in PokéBonk.
- **The plan's count changes:** ~80 Kanto families becomes **116 kits** (about 460 hand-picked moves), so D4 grows; split it into D4a (Gen 1-4) and D4b (Gen 5-9).

### Update (owner, 2026-10-19): legendaries, Megas, and all 1025 as enemies
**League roster = 249 entries.** Counts come from PokéAPI species data and evolution chains (`is_legendary`,
`is_mythical`, `-mega` varieties):
- **116** three-stage families (above).
- **+ every legendary and mythical: 71 + 23 = 94.** Most aren't three-stage, so this adds 90 entries (Cosmog's line
  is already in, and the 3 birds, Mewtwo, Mew, the Tapus, the Treasures of Ruin, the Paradox legendaries and so on
  are new).
- **+ everything that can Mega Evolve: 87 species,** including the Legends Z-A Megas (Raichu, Clefable,
  Victreebel, Starmie, Meganium, Feraligatr, Chimecho, Staraptor, Emboar, Excadrill, Scolipede, Scrafty,
  Eelektross, Chandelure, Golurk, Chesnaught, Delphox, Greninja, Pyroar, Floette, Meowstic, Malamar, Barbaracle,
  Dragalge, Hawlucha, Zygarde, Crabominable, Golisopod, Drampa, Magearna, Zeraora, Falinks, Scovillain, Glimmora,
  Tatsugiri, Baxcalibur, ...).
  - 34 of them are already inside a three-stage family.
  - 10 are legendary or mythical.
  - So **43 new entries**, each its whole family, with Mega at the capable stage: Slowbro, Kangaskhan, Starmie,
    Pinsir, Gyarados, Aerodactyl, Steelix, Scizor, Heracross, Skarmory, Houndoom, Sableye, Mawile, Medicham,
    Manectric, Sharpedo, Camerupt, Altaria, Banette, Chimecho, Absol, Glalie, Lopunny, Lucario, Abomasnow,
    Froslass, Excadrill, Audino, Scrafty, Golurk, Pyroar, Meowstic, Malamar, Barbaracle, Dragalge, Hawlucha,
    Crabominable, Golisopod, Drampa, Falinks, Scovillain, Glimmora, Tatsugiri.
- **Total: 116 + 90 + 43 = 249 League entries.** That is about 1,000 hand-picked kit moves, so D4 splits into
  **D4a** (three-stage Gen 1–4), **D4b** (three-stage Gen 5–9), **D4c** (Mega families) and **D4d** (legendaries
  and mythicals, each with a special challenge or encounter, PokéBonk-style).

**Enemies: all 1025 Pokémon, in BOTH Expedition and the base modes.** This is an owner decision that deliberately
changes the base game's enemy pool.
- MicaSurvivor's data has **966**. The **59 missing** need PMD-style sprite sheets:
  - Gen 5: Simisear, Simipour, Tranquill, Blitzle, Zebstrika, Throh, Crustle, Tirtouga, Carracosta, Amoonguss,
    Frillish, Jellicent, Shelmet, Stunfisk, Bouffalant.
  - Gen 6: Pyroar, Aromatisse.
  - Gen 7: Trumbeak, Toucannon, Gumshoos, Shiinotic, Oranguru.
  - Gen 8: Rolycoly, Carkol, Coalossal, Sirfetch'd, Mr. Rime, Falinks, Cufant, Copperajah, Zarude.
  - Gen 9: Dolliv, Squawkabilly, Maschiff, Mabosstiff, Shroodle, Grafaiai, Brambleghast, Toedscool, Toedscruel,
    Klawf, Rabsca, Espathra, Bombirdier, Flamigo, Brute Bonnet, Iron Treads, Iron Jugulis, Gimmighoul, Wo-Chien,
    Chien-Pao, Ting-Lu, Miraidon, Okidogi, Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown, Pecharunt.
- **Planned as a base-game batch, "B1: complete the Pokédex", before the DLC content.** It covers the 59 sprite
  sheets (SpriteCollab first, then a fallback pipeline for any missing), plus Pokédex data, enemy-pool and biome
  entries. The base-unchanged golden test is re-recorded once, on purpose, for this batch only.
- **B1 status (2026-10-19, built, not merged):** SpriteCollab has usable sheets for **17** of the 59 (5 with
  Idle + Walk, 8 with only a one-frame Idle, 4 only in an alternate-form folder), now in the game: **983**. The
  other **42** have no sheet at all and wait for the owner's call on a fallback (see `micasurvivor/README.md`,
  "Batch B1").
- **B1b status (2026-10-19, built, not merged):** the owner chose fallbacks from images we already have. The 24
  Gen 5–8 ones now use their overworld follower sprites (re-packed, scaled; `tools/micasurvivor/follow_sprites.py`):
  **1007**. The 18 Gen 9 ones were to use SpriteCollab portraits, transparent ones only; all their portraits have
  an opaque background, so they stay pending (`micasurvivor/README.md`, "Batch B1b").
- **B1c status (2026-10-19, built, not merged):** the owner chose the 18 Gen 9 ones' transparent battle sprites
  (front mirrored for facing, back for Up; `tools/micasurvivor/battle_sprites.py`): **1025**, nothing pending
  (`micasurvivor/README.md`, "Batch B1c").
- **Mega sprites:** the Legends Z-A Megas also need Mega sheets for the League (part of D4c).

### Update (2026-10-19): D0b built, "Expedition plumbing"
Built as the owner's "no on/off switch" version (`micasurvivor/README.md`, "DLC D0b: Expedition plumbing"). It replaces
the toggle-era names above:
- **No switch:** an "Expedition" group on "Choose a mode" (Classic, Survival, League), all "Coming soon" for now. The
  registry is `G.Expedition` (`js/systems/expedition.js`); a batch turns a mode on with `ENABLED.add(id)`.
- **The lazy code:** `js/expedition/*.js` (not `js/dlc/`), loaded by `G.Expedition.load()` only when an Expedition mode
  starts. The base tables are deep-frozen first.
- **Seams:** `G.Hooks` with only the four D0b needs (`run.start`, `run.end`, `replay.header`, `spectate.snap`).
  The other seams in 5.0.2 are added by the batch that first needs each.
- **The run's fields:** `{mode: 'exp-…', dv}` (no `ruleset` / `rs`: the mode says it's Expedition). `dv` is an integer
  (`G.Expedition.DV`, now 1).
- **Save:** `micasurvivorexp:<user>` through `micasurvivor-exp-save-get` / `-put` (not `micasurvivordlc`). It merges
  server-side too (max per counter, union per set), and there is no DLC currency: Pokémonedas are shared through the
  base save (`G.Expedition.wallet`).
- **Boards:** `runboard:micasurvivor_expedition:<map>:<diff>` (not `micasurvivor_dlc`), with micatro_modded-style
  enforcement both ways.
- **Base unchanged:** the D0a fixtures pass as recorded, also with the Expedition code force-loaded
  (`micasurvivor_expedition_forceload_test.mjs`).

### Update (2026-10-20): D1 built, "terrain layers"
Built as specified (`micasurvivor/README.md`, "DLC D1: terrain layers"). Notes for later batches:
- **The zone:** `G.ExpTerrain.generate({seed, map, zone})` gives a 120×120-tile zone with heights 0–3, cliffs, ramps,
  rock outcrops, ponds and props, from the world seed only (`G.DLC.rng`). A flood-fill guarantees every walkable tile is
  reachable from the spawn, with props counted as walls too. `G.Exp.enterZone(n)` builds zone n, which D3's portal can use.
- **Layers are bit masks:** one bit per level a tile joins (a ramp joins two). Collision and pathing only connect tiles
  that share a bit. Each walking entity carries `zMask` (its last good tile's layers) and `layer` (h, or h + 0.5 on a
  ramp). That is the per-entity z that D2 builds on.
- **For D2:** hop down a ledge = let an airborne entity land on a lower tile (set `zMask` to the landing tile's mask); the
  extra hop up = the same for one level up; climb = a type check before the cliff push in `collideZone`; glide and surf =
  liquid / gap tiles per type. The x block gains a per-enemy z / airborne column (bump `xv` to 2 and keep the v1 reader).
- **The `x` block v1** is `{xv, m, z, th}` on snapshots and host frames. Viewers and guests rebuild from seed + x
  (`G.Expedition.viewZone`) and check the hash. Terrain is never streamed.
- **`G.Expedition.DV` stays 1:** no Expedition run could exist before D1 (every mode is "Coming soon"). The first batch
  that ships a playable mode should bump it whenever content changes after that.
- **Base unchanged:** the D0a fixtures pass as recorded, with and without the Expedition code loaded.

### Update (2026-10-21): D2 built, "movement verbs"
Built as specified (`micasurvivor/README.md`, "DLC D2: movement verbs"), with these choices and notes for later batches:
- **The verbs:** `G.ExpVerbs` (`js/expedition/verbs.js`), numbers in `K`. Hop 0.45 s / 12 art px; airborne you drop off a
  ledge onto any lower level and take no contact damage from ground enemies (flyers and projectiles still hit). The extra
  hop reaches exactly one level above the take-off. Glide (Flying, hold hop) stretches the airtime to 1.2 s. Slide is
  0.55 s at ×1.9 with a 0.9 s cool-down. Climb (Fighting, Bug, Ghost) is one level at a time at half speed. Surf (Water)
  crosses deep water at ×1.35. Bounce pads throw you 2 tiles onto the plateau above (0.85 s arc).
- **Deviations:**
  - **Everyone has the extra hop for now** (`K.EXTRA_HOPS = 1`, `player.extraHops` per player). The study gives it to an
    item; D5 can set it to 0 and let the item raise it.
  - **Slide is on the pad's cancel (B), not RB.** RB stays "next move", as in every base run. Hop is confirm (A). Both
    follow a remap, and neither is a new remappable action, so the Controls screen and saved maps are unchanged.
  - **Pads have no long cool-down** (PokéBonk's is 25 s). A pad is a route up, so it re-arms 0.5 s after you land.
- **Deep water** (liquid on all 4 sides) blocks only the player. Enemies still wade it, as in D1, because pathing has no
  per-type water rule yet. D3 should make `systems/pathing.js` route ground enemies round deep water (or let Water
  enemies surf).
- **Pads** come from the generator's own stream after the D1 steps, so D1's grids are byte-identical. They are part of
  `zone.hash` (up to 8 per zone, 14 tiles apart, at the foot of a cliff with the landing one level up), and are painted
  in code (a mushroom; a spring where the liquid is lava). No image assets.
- **The `x` block v2** is `{xv: 2, m, z, th, a}`. `a.p` is the player's air row `[lift, verb, layer×2, phase cs, airtime
  cs, hops]`, `a.q` holds the co-op players' rows (by uid in host frames, by name in snapshots), and `a.e` lists leaping
  enemies `[id, lift, …]`.
  - Guests now send their own row to the host: the `net.frame` seam also runs on a guest's frame, with no mate.
  - The replay keeps `a` in frame field 7, not in its slow state.
  - The v1 reader is kept: a v1 block rebuilds terrain and shows everyone on the ground.
- **`G.Expedition.DV` stays 1**, because no Expedition mode is playable yet. D3 turns Classic on, and that batch should
  start bumping it.
- **For D3:**
  - `player.landed` (`{from, to, kind, splash}`) is set on every landing, ready for "land from a ledge → shockwave".
  - `player.air` (`{kind, t, dur, top, hops}`) is the airborne state for "+25% damage while airborne".
  - `G.ExpVerbs.verbsOf(types)` is the type table, ready for the League's kits.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so
  does the force-loaded run.
- **Ledges revised (owner playtest of Classic, 2026-10-21):** "you should be able to walk down a ledge but not up it".
  - **Walk down:** a tile exactly one level below no longer blocks (`G.World.ledgeDown`, in `collideZone`). The player
    drops: a 0.25 s fall (`K.DROP_T`; the sprite starts a cliff face, `K.DROP_H` = 6 art px, up), airborne as
    `air.kind 'drop'` (verb 7), carried just clear of the edge. **No contact i-frames for a drop** (it is free
    movement, not a hop: `combat.js`). Any other walker just steps down. Walking up a cliff stays blocked; ramps go both
    ways; climbers climb as before (their reach already joins the level below, so they never drop).
  - **Hops:** a single hop reaches one level up (`K.HOP_UP`); the extra hop one more (`K.EXTRA_UP`), two above the
    take-off, never more (`K.MAX_UP = 2`). The extra hop still adds airtime (a wider gap).
  - **Enemies:** `pathing.js`'s BFS and straight-line check treat a ledge as one-way: ground enemies walk down, and
    path round to a ramp to go up. Flyers, ghosts and bosses unchanged. Pure, so deterministic.
  - **Sync:** the air row gains an optional 7th field, a running drop count, so a viewer plays a fall it missed between
    two frames. Older rows (no 7th field) read as before; older readers ignore it, so the `x` block stays v3.
  - **`G.Expedition.DV` stays 2:** replays are recorded snapshots, not re-simulated inputs, so a Classic replay from
    before plays back exactly as recorded (tested). No Expedition co-op run can start yet, so the lobby gate has no
    mixed-rule case to catch.

### Update (2026-10-21): D3 built, "Expedition · Classic"
Built as specified (`micasurvivor/README.md`, "DLC D3: Expedition · Classic"): **Classic is playable and winnable** on
Viridian Forest; Survival and League still say "Coming soon". Choices and notes for later batches:
- **The run:** 3 seeded zones and a hand-made shrine (zone 4, `G.ExpClassic.build`). Each zone: a 10:00 clock, the
  timeline (alphas, swarm or stampede, swarm, stampede, flock, rock slide, elite waves, totems, summoner; later zones
  20 / 40 s earlier), a trickle that gains a species a minute, the guardian altar (stand 3 s), the portal (stand 0.8 s),
  the final swarm at 10:00 (spawns ×6, new enemies ×4 HP / ×2 damage per minute). The shrine: stand on the pedestal,
  Mew appears; beating it wins. The run-over screen shows the zone splits against your best.
- **Bosses:** HP = max(curve, DPS × target × 0.5 × (1 + 0.15 × tier)), targets 40 / 50 / 60 s (Mew 60 s); past the
  target, ×(1 + 0.15 per second) damage taken, capped at ×8. The 0.5 ("the share of your DPS a single target takes")
  is our own number, not PokéBonk's: our DPS meter counts every hit on every enemy. Tune it in `classic.js` `K`.
- **Determinism:** `plan(seed, map, zone, diff)` is pure (events, sizes, species, guardian, cards); the altar comes
  from the zone's grids; the trickle has its own stream. Loot rolls, enemy AI and combat stay `Math.random`, as in base.
- **The `x` block v3** adds `c` (zone start, phase, altar charge, final swarm, events fired, difficulty, special
  enemies, boss exhaustion); v1 / v2 still read. `G.Expedition.DV` is now 2 (dv-1 replays still play).
- **Enemies:** the map's types from all 1025 Pokémon, residents first, by base-stat band per zone (there's no
  evolution data in `G.DEX`, so "base / middle / final stage" is a BST band; D4's evolution data could replace it).
  Their stats follow the base spawner by run time, with a floor of 0 / 4 / 8 minutes per zone. The cap is 110
  (80 on touch), ×1.4 in the final swarm (owner #11).
- **Deviations:** no interact key (PokéBonk's E): the altar, portal and pedestal are stand-in circles (works the same on
  mouse, touch and pad). Alphas drop an item and a berry until D8 makes them recruitable. No boss phases / escorts
  yet. The Classic score (study 2.12) goes to the board now; D9 owns the boards' UI, tiers and medals. Pokémonedas
  are still not paid (D9 / D10).
- **For D4:**
  - a Classic run starts with the base partner (`G.Game.startRun` → `G.Modes.plan`); the League pick plugs in there,
    and level-ups are still the base `G.LevelUp`;
  - `G.ExpClassic.MAPS.viridian` holds the residents, guardians, legendary, stampede / flock / totem / summoner pools:
    the League's catchable families should come from the same tables;
  - `tickSpecials` (alpha down) is where D8's Friend Ball goes; `K.EARLY` and `bossHp({tier})` are ready for D9;
  - `player.landed` / `player.air` (D2) are still unused: the +25 % airborne damage and the landing shockwave are D5 / D6;
  - ground enemies still wade deep water (D2's note).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so
  does the force-loaded run.

### Update (2026-10-21): D4 built, "League roster and evolution"
Built (`micasurvivor/README.md`, "DLC D4: League roster and evolution"): a Classic run is played as a League member, with
its kit, its evolutions and Maturity, stats from its base stats. Choices and notes for later batches:
- **Which 78 of the 249:** D4a in full (the 62 three-stage Gen 1-4 families), the 11 Gen 1-2 Mega families (D4c's first
  part: two-stage lines and the first members that never evolve, so Maturity matters from Lv 24) and the 5 Kanto
  legendaries (D4d's first part: the launch maps' own legendaries). The other 170 are stubs `{dex, batch}` in
  `league-data.js`: D4b 54, D4c 31 (the owner's count lists Snorunt twice, as Glalie and Froslass: one family with a
  branch, so the League is 248 families), D4d 85.
- **Real data, not hand-typed:** evolutions from the overworld's `species_extra.json`, base stats from
  `species_battle.json`, kits scored on its learnsets; 7 newer evolutions the Gen 1-4 tables lack are added in the
  generator with their source (Obstagoon, Annihilape, Ursaluna, Mamoswine, Mr. Mime from Mime Jr., Mr. Rime, Kleavor).
  `G.DEX` is still untouched (frozen); the evolution data lives in the Expedition's own file. D3's "base / middle / final
  stage by BST band" for enemies could now use it.
- **Free:** all 12 Gen 1-4 starters (the owner's "starter trios free"; the plan row said "the 3 starters"). One line
  (`STARTERS` in the generator) if only Kanto's 3 should be.
- **Unlocks before D8:** a completed challenge goes to `league.met` and plays at once (`K.PLAY_MET`). D8's catch should add
  to `league.own`; if it turns `PLAY_MET` off, members met in D4 stay met (the merge never removes), so decide then whether
  they are grandfathered (keep playing) or must still be caught.
- **Balance (all in `G.ExpLeague.K`):** HP 70 + 0.45 HP; armor (6 Def + 3 Sp. Def) / 100, 1 % less damage taken per
  point (cap 20 %); speed 105 × (0.92 + 0.12 Spe); attack 1.1 × (0.82 + 0.2 Atk|Sp. Atk) by the move's real class; roles
  +0.6 HP/s / +8 % damage / -6 % damage taken / +6 % speed; Maturity ×1.12 damage and max HP; evolving heals to
  max(HP, 50 %) + 30 %. Stones / trades / friendship: Lv 18 (babies), 30 (two-stage), 36 (middle stage).
- **A branch** is that level-up's cards (one per form). In co-op every player makes their own at the shared level-up.
- **The `x` block v4** adds `l` (rows `[member, form, kit, Maturity, evolutions]`); v1-v3 still read. `G.Expedition.DV` is 3.
- **For D5:** a League run has `pl.xkit` (no new-move cards): D5's "moves the line learns / other members of your type"
  should offer them as extra cards without taking a kit slot (or raise `maxMoves`). The levels: Classic still uses the
  base XP curve, so check that a run reaches the late evolutions (Dragonite / Tyranitar at 55, Salamence 50) with the
  study's 8 + 5.5 L + L^1.8.
- **For D6:** the row's Maturity and evolution count are the Ultimate tier ("evolving / Maturity raises the Ultimate tier").
- **For D8:** `checkChallenges()` is where a met member should spawn its "wild X appeared!" encounter in the next run.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so
  does the force-loaded run.

### Update (2026-10-21): D5 built, "level-ups and items"
Built (`micasurvivor/README.md`, "DLC D5: level-ups and items"). Choices and notes for later batches:
- **The cards:** an Expedition level-up deals its own 3 cards (move level, new move, new vitamin, vitamin level; Training
  when nothing is left), a move card always first, each with its own rarity (the study's weights, luck and power gate).
  Weights and tools in `G.ExpLevel.K`; vitamin / item numbers in `G.ExpItems.K` and their tables; roll sizes in
  `G.ExpMoves.K`.
- **The kit and new moves (D4's note):** the kit keeps its 4 slots; a League run gets **2 more slots** (`K.EXTRA_SLOTS`)
  for "moves the line learns" (by the line's types: our 66 + the 18 new ones) and the kits of other playable League
  members of your type. Learnset-exact lines would need the generator to export learnsets (D4's `gen_league.mjs` reads
  them already).
- **The XP curve (D4's note):** 2 x (8 + 5.5 L + L^1.8). Measured: a spawn-limited Viridian run collects ~8.1k / 39.4k /
  114k XP by the end of zones 1 / 2 / 3 (24 min), Lv 23 / 44 / 66 on this curve (46 on the base curve); Lv 55 needs 69.2k,
  61 % of it. A Dratini run on that XP reaches Dragonite (tested). Re-measure if D7-D9 change the XP a run gives.
- **8 new archetypes, 18 moves:** outside the frozen `G.Moves`, through the combat.run / combat.ghost seams; damage x0.62
  of the study's table. The 21 vitamins and 60 items (18 boosters + 42) use the overworld's item pictures: no new art.
- **Items stack, no slots:** caps per item, same-stat bonuses add. They drop where base items drop (alphas, guardians),
  seeded, taken at once. D7's Poké Balls / Meowth / altars should call `G.ExpItems.rollItem(pl, rng)` with their own stream
  and `G.ExpLevel.itemTake(pl, 'x:' + id)`; Ditto can copy with `takeItem`, Hypno forget with `pl.xv` / a move.
- **Skip pays in-run Pokémonedas** (10 x zone) until D7's ₽.
- **Determinism:** deals and drops are seeded (no `Math.random`, tested); combat and procs stay `Math.random`, as in base.
  The `x` block is v5 (`u`: vitamins, items, move levels, Expedition moves, tools); v1-v4 still read. `G.Expedition.DV` is 4.
- **Saved:** counters only (`lv.*`), merged by max; no server change.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does
  the force-loaded run.

### Update (2026-10-22): D6 built, "Ultimates"
Built (`micasurvivor/README.md`, "DLC D6: Ultimates"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/ultimates.js` (`G.ExpUlt`, numbers in `K`). In an Expedition zone the Ultimate takes
  the Z-move's place: Z (and R), the pad's Z-move / Y / RT buttons and the Z button's HUD spot. The base Z-move steps aside
  only while `G.World.zone` is set, so base runs keep it (the D0a fixtures pass as recorded, 58/0, also force-loaded).
- **The charge (study 2.4 as given):** 95 s passive; a kill +0.004 from a 0.024 bucket refilling 0.008 / s; elite / summoner
  +0.03, alpha / totem +0.08, guardian / legendary / boss +0.2; damage taken x 0.35 of max HP. Nothing charges while casting.
  The bucket's refill rate (0.008 / s) is ours: the study only gives its size.
- **The cast:** 0.32 s hit-stop (a new `run.hold` seam), i-frames for the cast + 0.6 s (before the items' shield), a 1.1 s
  canvas cut-in with the member's own sprite. Damage 40 x (1 + 0.1 L) x (1 + 0.15 tier) x atk x 0.62 per unit of each
  hit's weight; the Z-move's 28 % boss cap per piece is kept.
- **Type Ultimates** are the 18 Z-move choreographies, built through a new `G.ZMoves.effect(pl, type)` export (no
  cinematic, cooldown or unlock), under the Z-moves' names. A member without a signature casts its form's first type's.
- **16 signatures by tier** (evolutions + Maturity, 0-4; the name by tier, the third from tier 2). **Deviation:** Eevee,
  Snorlax, Lapras and Ditto are not League entries (not three-stage, no Mega, not legendary), so Alakazam's, Machamp's,
  Tyranitar's and Garchomp's lines take their places; Mew's "Metronome" chains 1 / 2 / 3 seeded copies of the other 15.
  Our own names throughout.
- **Auto-Ultimate:** a setting in the Expedition save as two Lamport counters (`ult.auto.on` / `ult.auto.off`), so the
  save's max merge keeps the latest switch on every device. U, the AUTO chip under the button, or the pause screen's button
  (the pad's way to it). PokéBonk's Y stays a cast button here, as the base game's Y fires the Z-move.
- **Sync:** the `x` block v6 adds `w`, rows `[charge %, pieces cast, piece code, tier, flags, the cast's code]` (`p` / `q` like
  `a`, `l`, `u`). Viewers play the cut-in when the casting flag rises and each piece as a ghost (no damage) when the count
  goes up, so a missed frame is harmless and 1 Hz relay frames still catch a cast. No separate reliable host event: the
  count is idempotent. The replay keeps `w` in frame field 8 and records the plan's `xu` event. v1-v5 still read;
  `G.Expedition.DV` is 5 (dv-1 to dv-4 replays play without a notice).
- **Saved:** counters only (`ult.casts`, `ult.best`, `ult.sig`, the auto pair). No server change.
- **For D7:**
  - Soul Dew (x1.4) and Lunar Blessing (x1.3) are items: set `pl.xultCharge` (it multiplies every charge source); an
    Ultimate-damage item sets `pl.xultDmg`. Both default to 1.
  - Meowth / altars / Poké Balls rolling items should not refill the meter directly; if an interactable should (an "Ultimate
    shrine"), `G.ExpUlt.run.c` is the meter (0..1) and the row syncs it.
  - The kill bucket counts every kill the host's sim sees (`enemy.ko`, a new base seam): D7's ₽ drops can use the same seam.
  - The altar arrow (D3) now keeps clear of the right-hand button column on desktop too.
  - The run's damage breakdown still files Ultimate damage under the base "Z-move" row; a DmgLog row of its own needs a base
    change (its row list is fixed).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does
  the force-loaded run.

### Update (2026-10-22): D7 built, "economy and interactables"
Built (`micasurvivor/README.md`, "DLC D7: economy and interactables"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/economy.js` (`G.ExpEco`, numbers in `K`). ₽ is the run's own coins (`pl.coins`), which an
  Expedition run never pays into the base save: in-run play money only, never real money (owner rule).
- **The numbers:** ₽ 0.2 a KO x gold (study 2.7); elites 1, alphas 5, bosses 20 x zone (ours); rocks 6-14 x zone; Skip 10 x
  zone. Paid balls 18 x 1.22^(0.65 x bought), luck up to -25 %, pick 1 of 3. Cursed balls +5 % difficulty and 4 + 2 x zone ghosts.
  Meowth: 3 stalls, visits at ~0:50 for 70 s then every 2:30, 30 / 55 / 95 / 160 / 260 ₽ (+30 % a zone), heat x1.15 ... x2 per buy
  past 2 + ⌊balls / 3⌋. Unown 8 / 14 / 22 / 35 s, radii halved from the study (3-2.25 tiles), drain at half speed; offers 1 of 3,
  1 of 3 Uncommon+, 1 of 4 Rare+, 2 of 4 Epic+; hordes on Epic / Golden; Golden sealed 90 s. Comet 10 s, burns out 45 s after it
  lands. Challenge 10 + 4 x zone at x1.5 HP -> a Great Ball. Cursed altar +8 % difficulty +15 % spawns; greed +10 % / +15 % XP /
  +25 % ₽ / one more card. Cages 20 + 10 x zone ₽ -> +50 % of a level's XP.
- **Layout:** 42 per zone (zones 1-3), pure from the zone's grids and the seed (`layoutOf`), so every viewer places the same.
  Every roll has its own `G.DLC.rng` stream; no `Math.random` (tested).
- **The fog and the legend:** explored tiles within 14 of you (per zone); interactables show on the minimap (a new
  `minimap.draw` seam, only in a zone) once found. The zone map (M, a tap on the minimap, the pause button) has the legend.
- **Tips:** once per kind, `tip.<kind>` in the Expedition save (max merge). Meta counters `eco.*`. No server change.
- **Sync:** the `x` block v7 adds `o` (`{s, h, g, n, u, m}`, only the non-fresh interactables); the replay keeps it in frame
  field 9 and records the plan's `xi` event. v1-v6 still read; `G.Expedition.DV` is 6.
- **Deviations:** no interact key (stand-in circles, D3's rule); Snorlax, Magnemite, the slot machine and Survival's respawns are
  not in this batch; a freed cage's research waits for D10.
- **For D8:**
  - Alphas still drop an item and a berry (`classic.js` `tickSpecials`); D8's Friend Ball can reuse the economy's choice
    screen (`G.ExpEco.openPick`) and its seeded streams (`rollOffers`, `rngFor`).
  - The cages already hold a Pokémon of the map (`o.v`): a capture could start there.
  - `G.ExpEco.mods()` is the run's difficulty / spawns / XP / ₽ / loot: D9's tiers can add to it rather than to `classic.js`.
  - The `x` block's next field should be `p` or similar, bumping `xv` to 8 and keeping the v7 reader.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does
  the force-loaded run.

### Update (2026-10-22): D8 built, "alphas, capture and shinies"
Built (`micasurvivor/README.md`, "DLC D8: Alphas, capture and shinies"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/capture.js` (`G.ExpCap`: alphas, the faint window, the Friend Ball, Support Alphas, League
  encounters, shinies, the cinematic) and `js/expedition/reactions.js` (`G.ExpRx`: elemental reactions, weather boosts); numbers
  in their `K`.
- **The D4 unlock decision:** owner decision #3 ("League roster only, earned via challenges + capture") wins: a challenge completed
  from D8 on adds the member to `league.met` **and** `league.wild`, and it plays only once caught (`league.own`). Members met in D4
  (met, never wild) keep playing (`K.PLAY_MET`), so nothing leaves a save. No migration: the rule reads the sets as they are.
- **Alphas:** at 1 HP they faint (`hpFloor`); an 8 s window; stand in its circle (no interact key) and a Friend Ball goes. Left
  alone, D3's prize. 2 Support Alpha slots (+1 from the Lab: the counter `lab.support`); a full team asks whom to swap through
  D7's choice screen (`openPick` now takes cards of its own). Each follows you and shoots its type (9 x (1 + 0.06 x (level - 1)) x
  your attack every 1.25 s, to the "Partner / team" row) and gives a type perk added to D5's `total()` (Fire +15 % status, Rock +15
  HP, Fairy +8 luck, as the study; the other 15 ours).
- **League encounters:** up to 3 wild members a run, one a zone, 50-120 s in (seeded); HP an alpha's x9 x 0.8 / 1.2 / 1.6 / 5 by
  rank; a 12 s window; caught, `league.own` is saved at once; it flees after 150 s (legendaries 240 s) and comes back next run.
- **Shinies:** 8 % a zone + luck / 1,000, x1.5 with the Shiny Charm item; a zone card with a shiny sheet, x4 HP, roams and never
  attacks, flees after 120 s (150 s). Caught: `shiny.caught`, and `league.shiny` when it's a League family's (that member then
  plays shiny). Never the base save.
- **The cinematic:** 3.2 s (throw, absorb, drop, 3 shakes with pips, click) under `run.hold`, then 1 s of i-frames; a banner over the
  HUD clear of the move bar and the tip box. Every catch succeeds (no break-out roll).
- **Reactions** (through `combat.out`, 0.25 s cool-down per foe): Electrocuted x1.5 + chain (12, 9 m, para 60 %), Steam x1.4 +
  confuse / root, Inferno spreads burn, Wreckage x2.6, Poison Gas x1.3 + cloud, Psychic Meltdown x1.6, Dragon Rage x1.8; wet (4 s)
  and chill (3 stacks, 1 on wet: freeze 1.6 s). The study's metres halved (D7's rule). **Weather:** Sun boosts Grass and Fog
  boosts Dark x1.3 (the study's, missing from the base weather); a Pokémon the weather favours does +10 % on every hit.
- **Sync:** the `x` block v8 adds `p` (Support Alphas, encounters, fainted Pokémon, the capture under way with a seq, a capture
  count; `h` the host's uid in host frames). Viewers draw the allies in formation and play the cinematic on their own clock; the
  replay keeps `p` in its slow state and records `xc` events. v1-v7 still read; `G.Expedition.DV` is 7.
- **Saved:** sets `league.wild`, `league.own`, `shiny.caught`, `league.shiny`, `sa.types`; counters `cap.alpha`, `cap.league`,
  `cap.shiny`, `cap.fled`, `shiny.seen`, `sa.best`, `rx.<name>`, `rx.total`. No server change.
- **Assets:** none new (the overworld's ball pictures, the PMD and shiny sheets; the rest drawn in code).
- **For D9:**
  - the tiers can scale the encounters through `G.ExpEco.mods()` (they spawn through `G.ExpClassic.spawnFoe`, which applies it)
    or `G.ExpCap.K` (`LG_HP`, `SH_HP`, the windows); the score formula (study 2.12) has no capture term: a "+N per catch" would read
    `G.ExpCap.run.n` / `log`;
  - the board needs nothing new; the run-over lines already list the catches.
- **For D10:** the Lab's Support team raises `lab.support` (the third slot is read already); shiny perks can count `cap.shiny` /
  `shiny.caught` (and make the Shiny Charm a meta perk: `zonePlan`'s `charm`); Honey / Dawn Stone / Master Ball boosts go in
  `zonePlan`'s options (an extra alpha, a forced shiny) and a capture roll; tasks and achievements can read `cap.*` and `rx.*`.
- **For D11:** a co-op guest's own Support Alphas and captures (its run isn't an Expedition one yet); the allies' shots and the
  reactions' pop-ups aren't streamed to viewers (only the damage numbers).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does the
  force-loaded run.

### Update (2026-10-22): D9 built, "tiers, score and boards"
Built (`micasurvivor/README.md`, "DLC D9: tiers, score and boards"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/tiers.js` (`G.ExpTier`: the tier tables, unlocks, the pick, the score, medals, the season,
  the "Difficulty and leaderboards" panel), numbers in its `K`. Classic reads `G.ExpTier.of(diff)` (`classic.js` `tierOf`).
- **The tiers:** study 2.11's table as written (HP, damage, speed, amount, cap, elite share, event size, events earlier,
  telegraphs, escorts, XP, score); the Stardust column is kept as `pay` for D10. Normal is all x1 / 0 and draws nothing more, so it
  plays as before. Boss HP stays D3's `bossHp` (x(1 + 0.15 tier) of your DPS); boss damage takes the tier's. Escorts are elites of
  the zone. Unlocks in sequence per map (`tier.<map>`, plus D3's `wins.<map>.<diff>`).
- **The score:** study 2.12 + **400 a catch** (`G.ExpCap.run.n`), x(1 + 0.5 tier). Medals: study 2.13 (+3 min for the shrine,
  x(1 + 0.08 tier)), on the run's time; `medal.<map>.<diff>` max-merged.
- **Boards (owner #8, per map + difficulty):** Score (D0b's key), Time attack (`…:<diff>:time`, won runs, the medal and a replay
  id) and a **weekly Season** view (`msurvseason:<n>:<map>:<diff>`, Monday 2026-10-12 UTC weeks, swept after 6 weeks). Decision #8
  said "no weekly seasons for now": D9 adds the view with **cosmetic ribbons only** (claimed into the Expedition save when you look
  at last week's place; no currency, nothing paid). Drop the tab to hide it.
- **Server (the stack's only server change; needs the full gate):** `run-score` for `micasurvivor_expedition` takes the score's
  parts and recomputes the score (`msurvExpScore` = `G.ExpTier.score`), checks their plausibility (zone, a win at the shrine and
  >= 3:00, KOs / damage per second, bosses, catches), refuses a dv-8 score without parts (dv 1-7 still taken under a ceiling), and
  takes a replay id only if it is the player's own upload of this run (mode, map, tier, time, KOs). `run-leaderboard` takes
  `board: score | time | season` (+ `season`). Exact keys only (no `LIKE` scan; tested).
- **Sync:** nothing new is streamed: the tier is the `x` block's `c.d` (v3 on), so `xv` stays 8; `G.Expedition.DV` is 8.
- **Assets:** none new.
- **For D10:** pay the run with `of(diff).pay` (x1 / 1.75 / 2.5); achievements / tasks can read `medal.*`, `medals.<id>`,
  `tier.<map>`, `season.best`; the ribbons (`season.prize`) can become titles / frames on the trainer card (owner #5).
- **For D11:** Survival boards (`…:survival:<map>`) are not built; a co-op run is never on a board (`clean && !group`, as before).
- **For D12:** a new map is playable on the panel as soon as `G.ExpClassic.MAPS` has it; its medals assume a shrine (`K.SHRINE_S`).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded, and so does the
  force-loaded run; the base `micasurvivor` board path is untouched (tested through the handler).

### D6-D9 stack (2026-10-22)
`feat/micasurvivor-expedition-d6-d9`: D6 Ultimates (dv 5, `x.w`), D7 economy and interactables (dv 6, `x.o`), D8 alphas, capture
and shinies (dv 7, `x.p`), D9 tiers, score and boards (dv 8). One commit each; only D9 touches `server/mp.mjs`. Each batch's test
(`micasurvivor_expedition_{ultimates,economy,capture,tiers}_test.mjs`) and the earlier Expedition suites pass on the stack; the
whole branch needs the full gate before merging. Next: D10 (League meta), D11 (Survival + MP hardening), D12 (maps 2-3).

### Update (2026-10-22): D10 built, "League meta"
Built (`micasurvivor/README.md`, "DLC D10: the League meta"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/meta.js` (`G.ExpMeta`): Stardust, the Lab, item unlocks, the Archive, research, avatars /
  frames / titles, tasks, achievements, shiny perks, pre-run boosts and the "League HQ" panel (a third button on the Classic card).
  Numbers in its `K` and tables.
- **D11 change:** owner decision #4 is now applied: the Expedition pays and spends the base **Pokémonedas** (x3 the units below),
  through `G.Expedition.wallet` and the base save's per-device ledger; Stardust is gone (see the D11 update). D10 as built:
- **The currency:** **Stardust (★), the Expedition's own**, earned in play only (owner rule: nothing sold, no ads, no real money).
  The base save's Pokémonedas / stats / achievements are never touched (tested). Owner decision #4 ("shared Pokémonedas") is NOT
  what this batch did: the D10 brief asked for a DLC currency with the base currency untouched, so `G.Expedition.wallet` stays
  unused. One line in `record` switches the payout if the owner prefers decision #4.
- **Economy:** a run pays (10 + KOs / 40 + 25 (zone - 1) + 30 a boss + 120 won + 15 a catch) x the tier's pay (x1 / 1.75 / 2.5); a
  Normal clear ~405 ★. Lab: study 2.14's 19 upgrades and price formula, 84,355 ★ in all; 25 item unlocks (counter goal + 250-3,500 ★,
  29,050 in all); tasks 60 / 100 / 160 daily + 50 x streak, 300 / 450 / 700 weekly + 500 (~4,500 ★ a week); 33 achievements
  (13,850 ★).
- **Saves:** the Expedition save only, no server change. ★ earned is a G-counter per device (`st.<dev>`); **spending is derived**
  (Lab levels, `items.bought`), so a merge never pays twice; the Archive and the card are Lamport counters (latest choice wins);
  tasks are bounded counters carrying their period; research `rs.<family>`; avatars / achievements are sets.
- **Sync:** the run's row (Lab levels, shiny-perk tier, boost mask, shiny member) is fixed at its start; `x` v9 adds `k` (and the
  replay header `h.k`); every effect is `G.ExpMeta.effects(row)`, pure. `G.Expedition.DV` is 9; v1-v8 still read.
- **Not built:** season tasks (the season UI is hidden, owner #8); buying boosts; the Expedition card on the base trainer card
  (owner #5's crossover) — the card lives in League HQ.
- **For D11:** a co-op guest's own row (its run isn't an Expedition one yet; `k.q` already carries the host's); Survival's metrics
  for tasks (`record` builds them per run) and Survival achievements; the relay budget should count `k` (it never changes in a
  run, so it can go once and stay in the replay's slow state, as it does).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded, and so does the
  force-loaded run.

### Update (2026-10-25): D11 built, "Survival and MP hardening"
Built (`micasurvivor/README.md`, "DLC D11: Survival and MP hardening"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/survival.js` (`G.ExpSurv`, numbers in its `K`) on Classic's engine (`classic.js` with
  `S.surv`: the spawner, events, `makeBoss`, `setPhase`, `fireEvent`, migration through `nextZone`). Survival is enabled on
  "Choose a mode"; League stays "Coming soon".
- **Survival as specified:** a milestone boss every 5:00 (every 3rd a legendary: Mew, a bird; Mewtwo at 45:00, not ending the
  run), phases at 12:00 / 24:00, deep wounds from 30:00 (-4 % a minute to x0.2), Endless Night from 45:00 (+12 % HP, +6 % damage
  a minute on new foes, the screen darkens), 9 pacts after each milestone boss, siege (5:00, 20 s within 6 m: damage to x0.3,
  flocks), a migration portal every 11:00 (90 s open), hostile terrain (mud, brambles, quicksand, burning ground, waking with
  the phases; a hop clears them). Ours: the pacts, the hazards' numbers, the timeline per 5:00 segment.
- **Board (server change):** `runboard:micasurvivor_expedition:<map>:<diff>:survival`, its own parts (kills, dmg, bosses,
  legends, catches) and formula (study 2.12 + D9's catch term, x(1 + 0.5 tier)) recomputed by the server, implausible parts and
  dv < 10 refused; `run-leaderboard board: 'survival'`. Exact keys only (tested). A co-op run, online or with the local partner,
  is never on a board (`G.Exp.boardOk`).
- **Tasks / achievements** through D10's `record`: "Last N minutes in Survival", "Beat N milestone bosses"; 5 achievements
  (Mewtwo's title "Survival Legend").
- **Owner decision #4 applied: one currency.** D10's Stardust and its UI are gone; the Expedition pays and spends the base
  Pokémonedas through `G.Expedition.wallet` and the base save's per-device ledger (`core/db.js`); purchases / claims made on two
  devices while apart are undone once by `reconcile()` (`cur.spend` / `cur.earn` / `cur.fix`); loading never writes the base save;
  base runs pay exactly as before (D0a fixtures). **Scale x3** (`K.SCALE`), measured: a base Normal run pays 854 at 15:00 and
  1,190 at 19:00, the base upgrades cost 58,310 in all; a Normal Expedition clear (~4,000 KOs, ~23:00) pays ~1,270-1,365. Survival
  adds 4 units a minute (= the base run's time / 5). (The first draft's x8 paid ~3,400 a clear.)
- **Co-op:** a lobby carries the mode, map and tier; a guest's run is an Expedition run (terrain, verbs, Ultimates, its share of
  the interactables, its own catches and Support Alphas, tiers, its meta row, pacts and siege); the new seam `net.event` carries
  the personal rewards and catches. The local partner gets the verbs (player 2's pad, else its AI). Spectators and replays see the
  allies' shots and the reactions' pop-ups.
- **Sync:** `x` v10 adds `s` (Survival's host state), `v` (the Survival rows), `r` (pop-ups) and `p.g`; `G.Expedition.DV` is 10;
  v1-v9 still read.
- **Relay budget** (with `k`): the busiest host frame 9,400-10,200 chars (126 foes, `x` ~570) against 16,000 a message and 64,000 a
  row: no trimming needed. **Replay size:** Survival records a frame a second, `x.c` has its own frame field, an Expedition tape
  spaces its frames out as it grows and, over the cap, `finish()` merges every two frames exactly (`halve`). Measured: a 45-min
  Survival run to Mewtwo 0.91-1.02 MB, a full Classic clear 0.62-0.74 MB (cap 1.2 MB). Base tapes are untouched.
- **For D12:** a map is playable in Survival as soon as `G.ExpClassic.MAPS` has it; give it `G.ExpSurv.K.LEGENDS[map]` (its
  legendary milestones; Viridian's: Mew, then the birds) and, if wanted, hazard colours per biome; Survival's respawn of used
  interactables (study 2.7) isn't built (a migration gives fresh lands).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded, and so does the
  force-loaded run.

### Update (2026-10-25): D12 built, "maps 2-3"
Built (`micasurvivor/README.md`, "DLC D12: maps 2-3, Mt. Moon and Cerulean Cape"). Choices and notes for later batches:
- **Where it lives:** each map is an entry in `G.ExpClassic.MAPS` (residents by stage, BST bands, guardians, shrine boss,
  stampede / flock / totem / summoner pools and minions, the flock's banner) and in `G.ExpTerrain.PROFILES` / `LOOK` (the
  generator's numbers; the palette, height tint, minimap shading and bounce pad). Survival reads both, plus `K.LEGENDS[map]` and
  its hazard colours (`HAZ_PAL`).
- **Mt. Moon** (rock / ground / fairy): cave ledges (~44 % high ground vs Viridian's 32 %, all 4 levels in every zone, twice the
  rock, hardly any water, fewer ramps, 10 pads), the crystal cave's palette, moon-stone crystal pads; Zubat / Geodude / Clefairy
  families to Golem, Rhydon, Aerodactyl; the shrine boss is **Clefable** (5.3's "Clefable as a guardian"); Survival: Clefable,
  then a bird.
- **Cerulean Cape** (water / electric / flying): the sea (~18 % water vs 4 %), low ground, life-buoy pads, the rift's sea grotto
  palette; Poliwag / Tentacool / Magnemite families to Gyarados, Lapras, Raichu; the shrine (an island) boss is **Zapdos**;
  Survival: Zapdos, then Articuno / Moltres / Mew.
- **Unlock rule** (study 1: "each unlocks by beating the previous map"): Mt. Moon opens when Viridian Forest is won on any tier,
  Cerulean Cape when Mt. Moon is (`G.ExpTier.mapOpen`, reading D3's `wins.<map>.<diff>`). The panel's map tabs say "Clear X first"
  instead of "Coming soon"; the pick is clamped to an open map.
- **Existing art only:** base biome tiles for the palettes, pads / hazards / shrines in code, the existing sprites. No assets.
- **Sync:** the palette is set from the map on every zone (`enterZone` / `applyX`); the `x` block stays v10; `G.Expedition.DV` is
  11 (dv 1-10 still play). No server change (the map allow-list already had all three).
- **Fix found by the sweep:** `js/mica/social.js` `update()` ignores an answer that arrives after you left the lobby (D11's
  `refreshMember` after a join could bring a refused Expedition lobby back).
- **Not built:** per-map music; true islands (the generator keeps all land connected; water is crossed by surf or glide).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded, and so does the
  force-loaded run.

### D10-D12 stack (2026-10-25)
`feat/micasurvivor-expedition-d10-d12`: D10 the League meta (dv 9, `x.k`), D11 Survival, one currency and MP hardening (dv 10,
`x.s` / `x.v` / `x.r`, the stack's server change), D12 maps 2-3 (dv 11, no `x` change). Every Expedition suite
(`micasurvivor_expedition_*_test.mjs`, now with `_maps`) and the base-unchanged harness pass on the stack; the whole branch needs
the full gate before merging. With D12 the 1.0 milestone's content (D9-D12) is in. Left for Expedition: League mode itself (its
card says "Coming soon"), Mega Evolution (owner #10, "include in 1.0"), the slot machine (owner #7), Survival's interactable
respawns, the owner playtest and flipping the default (owner #1), then D13+ (more maps, signatures, per-species boards).

### Update (2026-10-26): D13 built, "League mode"
Built (`micasurvivor/README.md`, "DLC D13: League mode"): the whole League and League mode itself. Choices and notes for later
batches:
- **Where it lives:** `js/expedition/league-data.js` (regenerated by `tools/micasurvivor/gen_league.mjs`: D4b, D4c and D4d are
  members now, no stubs), `league.js` (the roster by generation, the hub card, two new challenge parts), `meta.js` (League mode's
  view of the D10 panel, its Leaderboard tab, a League task, 5 achievements) and `server/mp.mjs` (the League board).
- **245 members, not 248 (open in the study, ours):** a League member is a family from its first stage, so Silvally, Urshifu and
  Melmetal (separate entries in the owner's 249) are Type: Null's, Kubfu's and Meltan's evolutions. D4's 78 are byte-for-byte as
  they were (generated first, so their challenge rotation is the same). 6 more cited evolutions (Floette at 19, Tsareena,
  Pawmot, Hydrapple, Urshifu, Melmetal); 23 more hand-picked kits where the score chose a filler.
- **The legendaries' challenges (open: "each with a special challenge or encounter, PokéBonk-style"; ours, by base-stat total):**
  670+ (box legendaries) 60 League members + a map won on Hard or Nightmare; 600-669 (mythicals, Latias / Latios, Heatran, the
  Swords...) 1,500 KOs with a member of its type + 3 wins; under 600 (the trios, Tapus, Treasures of Ruin, Paradox...) the Kanto
  birds' 1,000 KOs + a win; Arceus 150 members + a Nightmare win. Mewtwo and Mew keep D4's. Their encounter is D8's League
  encounter (no Mewtwo-style invasion yet). The free members stay the 12 Gen 1-4 starters (owner).
- **League mode is a screen, not a run (the study's 5.3: "a roster screen with challenges, kits and Ultimates, the Lab, research,
  tasks and boards"):** `G.Expedition.hub('exp-league')`; its card opens the League view of the D10 panel: League (the roster,
  a card per member with its Ultimate by tier, records, research, challenge and Play Classic / Play Survival), D10's seven HQ
  tabs, and Leaderboard. `G.Modes.plan` never plans it as a run.
- **Its board (open: the study lists "boards"; owner #8 rules out per-species ones; ours):** League size,
  `runboard:micasurvivor_expedition:league`, **counted by the server** from the Expedition save it already holds and merges (the
  free starters + caught + D4-era met, never a wild one; `MSURV_EXP_LEAGUE` is the generated list, compared by the test), updated
  in `micasurvivor-exp-save-put` only when your count grows; `run-score` can't post to it; `run-leaderboard board: 'league'` reads
  it. Exact keys only (tested). This is D13's server change.
- **Tasks / achievements:** "Reach a final stage N times" joins the task pool from 2026-11-02 (`since`), because a bigger pool
  re-deals the tasks of the day and week already running; 5 achievements whose titles go after the season ribbons in the title
  list (the card saves the title's index).
- **Versions:** `G.Expedition.DV` is 12; the `x` block stays v10 (the League row already names the member and form). dv 1-11 still
  play. Replays and the relay are unchanged by D13 (no new streamed state; measured with D15, below).
- **Fix found by the batch:** the Expedition's canvas banners and run-over lines named Pokémon by the Pokédex's Spanish name
  (a wild Type: Null was "A wild Código Cero appeared!" in English); every Expedition `name()` helper now goes through
  `G.I18n.t` (regression test in `micasurvivor_expedition_leaguemode_test.mjs`, fails with the fix reverted). Two pacing
  overrides keep the League's latest evolution at Lv 55: Zweilous / Drakloak 49, Hydreigon / Dragapult 55 (real 50 / 64, 50 / 60).
- **For D14:** every Mega-capable species is in a League family now (tested), so Mega Evolution can attach to the member's
  capable stage; the hub card has a "Mega Evolution" line waiting for `G.ExpMega.textOf`.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does the
  force-loaded run.

### Update (2026-10-26): D14 built, "Mega Evolution"
Built (`micasurvivor/README.md`, "DLC D14: Mega Evolution"): owner decision #10 ("include in 1.0"). Choices and notes for later batches:
- **Where it lives:** `js/expedition/mega.js` (`G.ExpMega`: data access, the look, the card art), `mega-data.js` (generated by
  `tools/micasurvivor/gen_megas.mjs` from PokéAPI's `-mega` varieties, cached in `tools/micasurvivor/megas_pokeapi.json`), the choice
  and the effect in `league.js` (`megaCards`, `megaEvolve`), the tier in `ultimates.js`, the task and achievements in `meta.js`.
- **The Megas:** 93 of the owner's 87 species (PokéAPI's 97 varieties, colour / shape twins folded). Every species is in a League
  family since D13 (tested).
- **When (open in the study, which only says "a late-run power spike"; ours):** a form that can Mega Evolve, from Lv 40, gets the
  choice as a level-up's cards (one per Mega and "Not yet", which brings it back 5 levels later); once a run, for the rest of the run.
  No Mega Stone item, no reversion.
- **What:** the Mega's real base stats and types (from PokéAPI; the verbs follow the types), the Ultimate one tier up; the member's
  passive, kit and Maturity stay. The Mega's own ability is not used (the 54 abilities are the base game's).
- **Art (owner: existing art only, compose where missing, never placeholders):** the 48 Gen 6-7 Megas use the overworld battle
  system's own Mega sprites (`overworld/data/pokemon`, form 1 / 2 of each species, checked by eye); the 45 others (Legends Z-A, the Z
  forms) are composed from the member's own animated sheet. All carry a code-drawn Mega aura and the keystone's three-colour sign.
  No new asset files, nothing to deploy.
- **Sync:** the League row's optional 6th field (the Mega's id, only once it has Mega Evolved); `x` stays v10; `G.Expedition.DV` is 13.
- **Saved:** `lg.mega`, `mega.seen`; a weekly task (from 2026-11-02) and 3 achievements (late titles).
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does the
  force-loaded run.

### Update (2026-10-26): D15 built, "the slot machine and Survival's respawns"
Built (`micasurvivor/README.md`, "DLC D15: the slot machine and Survival's respawns"). Choices and notes:
- **The slot machine (owner #7: yes, play money only):** one a zone, after every D7 interactable (their places and indices kept). A
  spin is 10 + 5 x zone of the run's ₽ (never the base Pokémonedas, never real money; tested). Seeded reels; three of a kind pays
  (an item pick by ball, berries, the Nugget jackpot), a pair 2 spins back, two Voltorb a Voltorb ambush (Electrode in zone 3:
  the study's "a bad roll spawns Voltorb or Electrode"), three Voltorb Electrodes and a broken machine. The table and its odds
  (~5 % bad, ~0.9 of the stakes back) are ours.
- **Survival's respawns (study 2.7, "120-240 s depending on kind"; ours by kind):** rocks / berries 2:00, balls and the slot machine
  3:00, altars, Ditto, Hypno, cages 4:00; Meowth and the comet keep their schedules. Pure in the land's clock; viewers see it
  through the `o` block.
- **Sync:** `o.y` (the machines' last spins) is optional; `x` stays v10; `G.Expedition.DV` is 14 (dv 1-13 still play).
- **Sizes (D11's measurement, `micasurvivor_expedition_mp_test`):** busiest host frame 9,966 chars (126 foes, `x` 571) vs 16,000 a relay
  message; a 45-min Survival tape 890,835 chars, a full Classic clear 644,273 (cap 1.2 MB). No trimming needed.
- **Base unchanged:** `micasurvivor_dlc_base_unchanged_test` passes against the D0a fixtures as recorded (58/0), and so does the
  force-loaded run.

### D13-D15 stack (2026-10-26)
`feat/micasurvivor-expedition-d13-d15`: D13 League mode (dv 12, the stack's only server change: the League board), D14 Mega Evolution
(dv 13), D15 the slot machine and Survival's respawns (dv 14). With it every Expedition 1.0 item the owner decided is built. Left: the
owner playtest and flipping the default (owner #1), then D16+ (more maps, signatures, per-species boards, clans).

### 2026-10-26 owner request: all moves fire, 1 item + 4 moves, shared upgrades, all 1,025
The owner's request and the plan for it (batches D16-D21), as approved ("go with the defaults"), with the survey's findings.
Two owner changes came on the same day, while D16-D18 were being built; they REPLACE decisions 7 and the D17 batch below:
- **Decision 7 (bonds), changed:** keep fusion. A legendary's bond still fuses moves into ONE slot (`player.js` fuse, up to 4
  moves a group), as before; every slot fires, so every move in a fused slot fires on its own cooldown too. The 4-slot cap counts
  SLOTS, not moves, so the slot a bond frees can take another move from the level-ups (a fused build fires more than 4 moves). The
  HUD shows a fused slot's moves grouped in one slot. (The "+12 % damage / -6 % cooldown per bond" default is not built.) Expedition
  has no bonds, so nothing there changes.
- **D17 (one item slot), changed** (owner: "maybe we can keep the backpack/more items in expedition and just have 1 slot for an
  equipped held item in both modes"): Expedition KEEPS its stacking inventory (the ~60 items to their caps, vitamins, Poké Balls,
  Meowth, altars, Ditto) exactly as it is. Both modes have exactly ONE equipped HELD-item slot (base's held items, `data/items.js`,
  with base's replace screen). Base: Backpack and the Tower's Double baggage no longer add a 2nd slot (retired, refunded once).
  Expedition: the same single held slot, fed where held items naturally appear (see "D17 built"); where a stacking Expedition item
  duplicates a held item, the stacking one stays.

Owner request, 2026-10-26, verbatim:
"i want to increase coverage to the full 1025 for both enemies and playable characters in bother regular and expedition mode and i want both modes to respond to the same upgrades i can buy for the pokemon to improve their stats. in both modes i do not want to have to switch between moves. all of my moves should be firing at the same time on their own cooldowns and it should be 1 item slot and 4 move slots for both expedition and regular."

Owner: "go with the defaults". All the recommended defaults below are APPROVED.

#### Survey findings (read-only, from origin/main at ca8bfe98+; verify line numbers)

### Rosters
- **Base playable:**
  - All 1,025 species are obtainable: `G.DEX` (`js/data/pokedex.js`), gacha (`js/systems/gacha.js:45-48`, no legendary filter), rescue (`game.js:304-312`), wild shinies (`game.js:315-326`), 29 personality starters (`js/data/starters.js`).
  - Every species has a start move and a pool (`G.Moves.startFor` / `poolFor`).
- **Expedition playable:**
  - 245 League members (families, first stage) covering 519 species (`js/expedition/league-data.js` ← `tools/micasurvivor/gen_league.mjs`).
  - 12 are free. Unlock path: `league.met` → `wild` → `own` (`league.js:128-186`).
  - 1,025 species form 580 families (roots = species with no pre-evo in `overworld/data/species_extra.json`). Missing: 335 families / 506 species.
- **Base enemies:**
  - Effectively all 1,025 (`js/data/enemies.js:33-40, 73`; bosses `:206-211`; legendaries in rift / judgment / tower).
  - BUG: Wishiwashi #746 (BST 175) is below the lowest tier and only listed in the unused `beach` biome (`enemies.js:83`), so it never spawns.
- **Expedition enemies:**
  - About 665 species. `poolOf` filters by the map's types + the zone's BST band and skips legendaries and rarity 5 (`classic.js:148-152`; maps `classic.js:104-131`).
  - 292 off-type species never appear, nor do 20 rarity-5 non-legendaries.
- **Data:** `overworld/data/species_battle.json` has all 1,025 base stats. All 1,025 sprite folders exist in `micasurvivor/assets/pokemon/<dex>/`. No new art is needed.

### Upgrades
- **Base:**
  - 17 per-Pokémon upgrades (`js/data/upgrades.js:5-23`: hp, atk, spd, cd, def, regen, magnet, xp, coins, moves, crit, size, reroll, tm, ban, revive, bag), stored in `save.pupg[dex]`.
  - The shop (`js/ui/menu.js:270-323`) lists only base-owned Pokémon.
  - Applied at `game.js:105` → Player (`player.js:20-85`). Merge = max per level (`db.js:278-283`).
- **Expedition:**
  - It already loads the shop upgrades of the member's first-stage dex.
  - `moves` / `tm` do nothing (`league.begin` clears the moves, `league.js:258-263`). `bag` does nothing (items stack).
  - The Lab (`expedition/meta.js` ~180) is account-wide. Its 9 stat rows (Training, Stamina, Agility, Study, Trading, Fortune, Magnetism, Leftovers, Shell) overlap the shop. It also has a Move slot.

### Moves
- Both modes fire ONE slot: `G.Combat.tick` runs only `pl.activeGroup()` (`systems/combat.js:21-25`). Each move has its own cooldown `m.t` (`:51-70`).
- **Switching:**
  - keys 1-4, Q/E, Tab (`game.js:690-698`); pad LB/RB (`core/pad.js:628-629`); HUD tap (`ui/hud.js:385`);
  - a switch resets the cooldown to 35% and clears orbs (`player.js:177-190`);
  - Choice Band blocks switching (`player.js:180`, `data/items.js:31`).
- **Slots:**
  - Base: 4 moves (`player.js:37`); 1 item, or 2 with Backpack / the Tower's "Double baggage" pact (`player.js:72-73, 83-84, 392`).
  - Expedition: kit of 4 + 2 `EXTRA_SLOTS` + 1 Lab slot, up to 7 (`expedition/levelups.js:48, 104, 149`); 60 stacking items; vitamins 3 slots (+2 from the Lab).
  - Base bonds fuse moves into one slot (`player.js:197-229`, `levelup.js:3`; `rift.js:248`, `tower.js:45, 357`).
- **Things that depend on one active move:**
  - melee −25% damage taken (`player.js:283`);
  - HUD active slot, bond grid, tap-to-switch (`hud.js:358-470`);
  - the Shortcuts panel (`save.pbind`, `menu.js:333-351`, `db.js:147-157`);
  - co-op sends one move per frame (`net/coop.js:141-148`), partner orbs only for the active move (`combat.js:558-563`), `'c'` cast events (`coop.js:437-440`);
  - spectate `ac` (`mica/spectate.js:61`), replay keeps it (`mica/replay.js:185`), the viewer ghosts the active group (`ui/watch-ui.js:67-68, 238-256`);
  - level-up new-move cards (`systems/levelup.js:39, 105`; `expedition/levelups.js:149`);
  - hint text "1-4 / Q / E" (HUD, `lang-en.js`, pad glyphs);
  - tests: the pad suite, the D0a harness (Digit1 switches mid-run), items, dynamax, tower, league, levelups, mega, meta.

### Constraints
- **Golden fixtures** `overworld/tests/fixtures/micasurvivor_golden/*.json`:
  - Re-record ONCE on purpose: `node overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs --record` (in a worktree: `MAGEPUNK_ASSET_ROOT=<main checkout>`).
  - Explain the diff in the PR (README ~1327). The forceload test reuses them. The test profile has `moves:1`, `bag:1` (test line ~84).
- **SAVE TRAP:** `sanitize` deletes unknown upgrade ids (`db.js:188`). Retired ids MUST stay in `G.Upgrades.BY`, marked retired, or purchases (and the refund basis) vanish.
- **Refunds:**
  - The base coin ledger (`save.led`) merges by max, so a refund on two devices could pay twice. Reuse Expedition's `cur.spend` / `cur.earn` + `reconcile()` pattern.
  - Back up first (the `micasurvivor_backup.mp:<user>.<time>` pattern). Owner rule: never migrate a save without backup and rollback.
- **Expedition save cap:** 2,000 counters, on client (`expedition/save.js:24`) and server (`server/mp.mjs:428`). Per-family counters `lg.runs.*`, `lg.best.*`, `rs.*` would reach ~1,740 at 580 families. MUST fix before D19.
- **Versions:**
  - Expedition `DV` is 14 (`systems/expedition.js:68`); `x` v10.
  - Base replays `h.v:1` (`replay.js:69`), snapshots `v:1`, base lobbies carry no version.
  - New tapes need a flag (e.g. `h.af:1`) so old ones replay with one active move.
  - Base co-op needs a ruleset field on the lobby (server allow-list change).
- **Leaderboards:** the base board ranks survival time (`mp.mjs:2234-2257`); Expedition boards kills / seconds / damage. New board keys from the release; old ones readable as "Legacy". Server change.
- **Balance:** 4 moves firing ≈ 2.5–4× DPS. Base Normal has adaptive difficulty (`systems/adaptive.js:74`); Expedition boss HP follows DPS. Tune with the D11 fixed-step bot sim.
- **Phones:** no projectile cap (`entities/projectile.js`). Touch enemy cap 80 Expedition / 64 base. Measure at 844×390.
- **Relay:** busiest host frame 9,966 / 16,000 chars. Measure extra `'c'` events with `micasurvivor_expedition_mp_test`.

#### Batches
- **D16, every move fires (both modes):**
  - Loop over all slots in combat. Remove switching (keys, pad, HUD taps). The HUD shows all 4 slots with cooldown sweeps.
  - Bonds / Choice Band / melee per the decisions below.
  - Co-op sends a list of orbit moves; the reader accepts the old single move.
  - Replay `h.af`, snapshot `af`, base lobby ruleset field.
  - Expedition: `maxMoves` 4, `EXTRA_SLOTS` 0, Lab Move slot retired + refunded. DV 15.
  - Re-record D0a.
- **D17, one item slot (both modes):**
  - Base: retire Backpack + Double baggage (refund once, reconciled).
  - Expedition: the 60 items become one held item with base's replace screen. Adapt Poké Balls, Meowth, altars, Ditto. `x.u.i` stays readable. DV 16.
- **D18, shared Pokémon upgrades:**
  - Per family = the max over its stages' `pupg`, computed at read time (no save rewrite).
  - The shop lists base-owned plus League-playable.
  - `tm` swaps kit move 1. `moves` (Repertoire) unlocks kit move 2 at Lv 1.
  - Retire the Lab's 9 stat rows with a reconciled refund. Backup first.
- **D19, full League:**
  - Fix the counter cap first.
  - 580 families / 1,025 species; the first 245 members byte-identical.
  - Kits, ranks, roles, challenges; server `MSURV_EXP_LEAGUE` list; achievements / titles. DV 17.
- **D20, Expedition enemies, all 1,025:**
  - Off-type wanderers as a seeded share; rarity-5 species as zone-3 / Survival elites; roaming legendaries.
  - Fix Wishiwashi in base. DV 18.
  - Test: the union of plans over seeds covers 1,025.
- **D21, boards, balance, performance:**
  - New board keys (server; ships no later than the D16 release).
  - A sim-tuned damage factor (~1.6× today's total DPS), a phone projectile budget, relay / replay size measurements.

#### APPROVED decisions (owner: "go with the defaults")
1. **Unlocking:** base keeps gacha + rescue. In Expedition every family is a League member (challenge + catch, as now), and owning ANY stage in base also unlocks that family.
2. **Expedition starts at the first stage**; you reach every species by evolving.
3. **Refunds:** refund Backpack, the Lab Move slot and the Lab's 9 stat rows in full, once per account, after a backup. Keep every other upgrade.
4. **Upgrades are per family** (the best level among its stages, at read time).
5. **"1 item slot" = held items only.** Vitamins keep their 3 slots.
6. **When the 4 move slots are full:** base as today (upgrades / evolutions / stats only). Expedition offers rare "swap a move" cards so the 18 new moves stay reachable.
7. **Bonds (OWNER CHANGED 2026-10-26):** fusion stays — a bond fuses moves into ONE slot, freeing a slot the player may fill; every move in a fused slot fires on its own cooldown; the 4 cap counts slots, not moves.
8. **Choice Band:** +40% damage on the slot-1 move, −20% on the others.
9. **Melee:** −25% damage taken for 1.5 s after a melee move fires.
10. **Balance:** a global damage factor so total DPS ≈ 1.6× today's (bot sim).
11. **Leaderboards:** new boards from the release; old ones readable as "Legacy".
12. **Old replays / live views** keep the one-active-move look.
13. **Base co-op** between an old and a new client is refused.
14. **Freed keys / buttons** (1-4, Q/E, LB/RB) are unbound in a run. Team mode keeps Tab and R3.
15. **Expedition:** all 27 starter trios free; up to 5 wild members a run instead of 3.

### Update (2026-10-26): D16 built, "every move fires"
Built (`micasurvivor/README.md`, "DLC D16: every move fires"). Both modes; a deliberate base change. Choices and notes for later batches:
- **Where it lives:** `G.Combat.tick` fires every slot of an all-fire player (`pl.af`); `G.Combat.AF` holds the numbers (the damage
  factors, the Choice Band's +40 % / -20 %, the melee guard) and `afK` applies them in `land()`; `Player.setActive` / `cycle` are no-ops
  for an all-fire player (`active` stays 0, so `activeMove()` is slot 1: the aim's priority, the halo, the band's boosted move).
- **Decision 7 as the owner changed it:** bonds fuse as before; the freed slot is offered again by the base level-up (its rule was
  already "while slots < 4"); no per-bond bonus. Expedition has no bonds.
- **Balance (decision #10):** `AF.DMG` 0.8 (base), `AF.DMG_EXP` 1.1 (Expedition), from `tools/micasurvivor/dps_sim.mjs` (D11's bot sim
  + a dummy ring, 10 builds a mode). Today's best single slot -> shipped: base Normal 864 -> 1,148 DPS (**x1.58**), a fused base build
  **x1.73**, Expedition Normal 1,592 -> 2,563 (**x1.63**). "Today's" = the best slot, what a player kept active; against the MEAN slot
  all-fire is x3.9 / x3.6 at x1. D21 fine-tunes: a 45-min Survival run now KOs ~16,000 (was ~8,000-8,500), so Survival's pacing and
  boss HP (which follows DPS) want a look.
- **Expedition:** `K.MAX_MOVES` 4, `EXTRA_SLOTS` 0; swap cards (decision #6) with a fixed total weight (`K.W.swap` = 3), replacing the
  lowest-level move in its slot (`lv.swaps` counter). The Lab's Move slot retired (`retired: 'D16'` stays in `LAB`: the run row's
  order) and refunded once per account (`refundRetired`, `rf.lab.<id>.<level>:<device>` in `cur.earn`, reconciled like any double
  payment; backups of both saves first; `rollbackRefunds`). D18's 9 stat rows reuse the same path. Read-only D1 (2026-10-26): no
  Expedition save on the server owns a Lab level, so no live refund.
- **The board split (D21's, shipped now with the rule change):** server `MSURV_RULES` 2 / `MSURV_EXP_AF_DV` 15: base `rules: 2` ->
  `runboard:micasurvivor:r2`, Expedition dv >= 15 -> `...:r2:<map>:<diff>[:time|:survival]`, season `msurvseason:<n>:r2:...`; reads
  `{rules: 2}`, else Legacy. The UI's "Legacy" ("Reglas anteriores") tab / chip. An old cached client keeps writing the legacy boards.
- **Old tapes / views / co-op:** `h.af`, the slow fields' `af` / `sg`; co-op frame field 15 (every orbit move); a base lobby's `rules`
  (server allow-list: 1 or 2; a mismatched join 409; the start carries it). Old tapes, old snapshots and old co-op frames still read.
- **Measured:** the busiest relay frame 10,147 / 16,000 chars with the host's 4 moves (3.2 casts a second); phones 844x390: <= 15
  projectiles, p95 18 ms, the HUD fits; no projectile budget needed. Tapes: Survival 45 min 793,626 chars, a Classic clear 762,311.
- **Golden fixtures:** re-recorded once (every mode diverges from second 1: more casts, more draws). Normal, Daily and Tower now last
  the whole 120 s (they fell at 111.7 / 103.3 / 91.3 s); Boss Rush falls at 90.7 s instead of 117.3 s (its third boss is Mew instead of
  Registeel: the random stream shifted). Passes twice in a row; the force-loaded run passes.
- **Versions:** `G.Expedition.DV` 15, `x` v10.
