# Magepunk Battlecards — Keyword Color Pie & Class Reference

A design reference for two jobs:
1. **Advanced‑land pools** — an advanced land is a colour (or colour combo). Its 15‑card
   Discover pool should draw on the keyword palette of *those* colours. Use Part 1.
2. **Class card design** — each class has a keyword identity worth reinforcing. Use Part 2.

Every keyword below is a *currently‑implemented* engine mechanic (from `battlecards/keywords.js`,
96 entries). Colour assignments follow MTG colour‑pie philosophy; many mechanics are shared across
two colours (noted in `(+X)`), exactly as in the real pie.

---

## Part 1 — Keywords by the Colour Pie

### ⚪ White (W) — protection, order, healing, going wide
Defensive walls, small creatures made resilient, life, and rules of "order."

| Keyword | Note |
|---|---|
| Taunt | must be attacked first — the wall colour |
| Divine Shield | ignore the first hit |
| Ward | attackers/removal pay a tax |
| Defender / Pacifist | can't attack — pure defense |
| Immune | untouchable |
| Reborn `(+B)` | comes back once — W resurrection / B undeath |
| Lifesteal `(+B)` | W lifegain / B drain |
| Overheal / Medic | healing payoffs |
| Inspire | hero‑power (order/ritual) synergy |
| Constellation | enchantment‑matters |
| Honorable Kill | reward for *exact* lethal (order) |
| Avenge `(+B)` | triggers after your creatures die |
| Blink `(+U)` | flicker (protection / value) |
| Silence `(+U)` | strip abilities — W/U answer |
| Bushido `(+R)` | combat pump when it blocks/attacks |
| Joust `(+G)` | reveal the biggest creature |

### 🔵 Blue (U) — card advantage, tempo, evasion, spell‑matters
Draw, dig, counter, bounce, freeze, and "spells care."

| Keyword | Note |
|---|---|
| Discover | selective card advantage (universal, but blue at heart) |
| Scry / Ponder / Gaze | dig / smooth draws |
| Counter target spell | the counterspell |
| Elusive | evasion (hard to block/target) |
| Freeze / Paralyzed | tempo — deny attacks/untaps |
| Spell Damage | spell payoff |
| Spellburst / Prowess `(+R)` / Echo `(+R)` | cast‑a‑spell triggers |
| Miracle | reward for top‑decking |
| Mill `(+B)` | deck destruction |
| Ephemeral | temporary / exile‑later |
| Secret | held trap that answers on a trigger |
| Time Travel | shift a location through eras |
| Investigate | Clue token → draw |

### ⚫ Black (B) — death, sacrifice, drain, disease, recursion
Payoffs for creatures dying, graveyard value, poison, and self‑cost.

| Keyword | Note |
|---|---|
| Deathrattle | death trigger (universal, black‑flavoured) |
| Deathtouch `(+G)` | any damage kills |
| Venomous / Poisonous / Poisoned | poison (B primary, `(+G)`) |
| Sanguine | banks Blood on combat |
| Morbid | payoff once N creatures have died |
| Dredge | pull from the bottom / graveyard |
| Corrupt | upgrades in hand as you spend big |
| Dormant | imprisoned, wakes with a payoff (demonic) |
| Outcast | edge‑of‑hand reward (Demon Hunter) |
| Stealth `(+U)` | evasion / assassin |
| Regenerate `(+G)` | shrug off death |

### 🔴 Red (R) — damage, haste, aggression, chaos, temporary
Burn, speed, one‑turn value, treasure, and randomness.

| Keyword | Note |
|---|---|
| Charge / Rush | attack the turn it lands |
| Impulsive | exile‑and‑play‑now aggression |
| Firebreathing | pay to pump attack |
| Cleave / Piercing | splash / carry‑over damage |
| Trample `(+G)` | excess damage to the hero |
| Windfury | attack twice |
| Overload | pay next turn for power now (Shaman) |
| Combo `(+B)` | reward for the 2nd+ card each turn (Rogue) |
| Frenzy `(+G)` | one‑time payoff for surviving damage |
| Overkill | reward for excess damage to a minion |
| Quickdraw / Plunder | gunslinger / treasure aggression |
| Enrich | Treasure token → mana (ramp‑via‑aggro) |
| First Strike `(+W)` | strikes before it can be struck |
| Luck | random payoffs |

### 🟢 Green (G) — big creatures, ramp, counters, beasts, nature
Fat bodies, lands, +1/+1 counters, and adaptation.

| Keyword | Note |
|---|---|
| Colossal | enters with Appendage tokens — huge |
| Adapt | roll upgrades onto a creature (evolve) |
| Landfall | lands‑matter |
| Emerge | discount for a big creature |
| Proliferate `(+U)` | add to counters |
| Chromatic | multicolour / all‑five |
| Cook `(+W)` | Food token → heal (nourishment) |
| Alliance `(+W)` | go‑wide synergy |

### ⟡ Colorless & System keywords (artifacts, tokens, planar, universal)
Not colour‑owned — usable by any land pool or class, or belonging to a shared subsystem.

- **Universal:** Battlecry, Quest, Finale, Manathirst, Tradeable, Connect, Swing.
- **Artifacts / machines:** Magnetic (Mechs), Contraption, Assemble (the Sprocket).
- **Dungeon system:** Advance.
- **Treasure dig:** Excavate.
- **Combat rider:** Static (Paralyze‑on‑combat).
- **Planar (shared arena):** Planeshift, Spark, Planeswalk, Arrival, Departure, Chaos.

---

## Part 2 — Keywords by Class (data‑driven)

Signature keywords by how many of that class's cards actually use them (from `cards.json`),
with the colour‑pie lean each class points at. Use this to keep new class cards on‑identity.

| Class | Signature keywords (usage) | Colour lean |
|---|---|---|
| **Paladin** | Divine Shield (100), Taunt (63), Lifesteal (32), Reborn | **W** |
| **Priest** | Lifesteal (25), Silence (16), Overheal (7), Corrupt (5) | **W/B** |
| **Mage** | Secret (45), Spell Damage (28), Freeze (23), Spellburst | **U** |
| **Rogue** | Combo (68), Stealth (42), Secret (23), Poisonous (12) | **U/B** |
| **Warlock** | Lifesteal (22), Taunt, Deathrattle (55) + self‑cost | **B** |
| **Death Knight** | Deathrattle (16), Lifesteal (12), Reborn (11), Freeze, Sanguine | **B** (Blood) |
| **Hunter** | Secret (40), Poisonous (12), Deathrattle (74), Beasts | **B/G** |
| **Demon Hunter** | Rush (21), Outcast (10), Lifesteal, Immune, Dormant | **R/B** |
| **Warrior** | Taunt (68), Rush (48), Charge, Frenzy (5), Tradeable | **R/W** |
| **Shaman** | Overload (72), Windfury (18), Freeze (22), Spell Damage | **R/U** |
| **Druid** | Taunt (104), big Battlecries, ramp | **G/W** |

**Custom classes** (sparse pools so far — greenfield for identity):
- **Bounty Hunter** — Quickdraw, Quest, Rush/Stealth → aggressive **R** bounty theme.
- **Barbarian** — Sanguine, Frenzy → **R/B** rage/blood.
- **Ranger** — Adapt, Scry, Chromatic, Inspire → flexible **G/U** so far.
- **Bard / Sorcerer / Wizard / Centurion** — only a handful of cards; mostly vanilla Battlecry/Taunt.
  Open canvas — pick a colour‑pie lane and build to it.

---

## Part 3 — How to use this

### Advanced‑land pools
An advanced land is a colour identity (mono temple, two‑colour guild, three‑colour wedge/shard).
Build its 15‑card Discover pool from the **union of its colours' keyword palettes** above, so the
land *plays* like its colours:

- **Mono** (e.g. a Blue Temple): lean hard on that colour's list — Discover, Freeze, Spell Damage, Scry…
- **Two‑colour** (e.g. Simic = U/G): blend the two palettes — card advantage + big bodies/counters
  (Discover, Proliferate, Adapt, Colossal, Landfall).
- **Three‑colour** (e.g. Abzan = W/B/G): the wedge's shared identity — resilience + attrition + size
  (Taunt, Lifesteal, Deathrattle, Deathtouch, Colossal, Reborn). Abzan is the built template.

Shared `(+X)` keywords are the glue between adjacent colours — great picks for two‑colour pools.

### Class cards
Reinforce each class's signature column. When a class needs a *new* mechanic, prefer one from the
colour(s) it already leans toward (Part 2), so the class stays coherent. The custom classes are the
best place to introduce under‑used keywords (Joust, Emerge, Miracle, Echo, Gaze, Manathirst…) that
have almost no cards yet.

### Under‑used keywords worth deploying
Low card counts across the pool — ripe for new advanced‑land pools or class kits:
Gaze, Ponder, Joust, Emerge, Alliance, Constellation, Miracle, Echo, Manathirst, Firebreathing,
Bushido, Regenerate, Ephemeral, Luck, Quickdraw, Plunder.
