# Pool Card Redesign — Design Research & Working Guide

Goal: go **pool by pool** through the Lorequest decks and the advanced-land pools and make the
cards **more interesting/impactful, using a wider variety of keywords and card types.** Keep every
**name and art** exactly as-is — only the mechanics change.

This doc is the research foundation + the reference we author against. It distills a full audit of
the live card pool (9,575 cards) and the engine's real capabilities.

---

## 1. The problem, quantified

The 2,249 target cards (555 Lorequest + 1,694 land-pool) draw from a tiny slice of the game:

| | Target pools | Full collectible pool |
|---|---|---|
| Card **types** used | 5 (creature, sorcery, instant, weapon, enchantment) | **15** (adds artifact, location, secret, trap, quest, planeswalker, land, plane, heropower…) |
| **Keywords** used | 16 | **41** |
| **Effect** types leaned on | ~7 (damage/draw/buff/summon/gain-mana/heal/scry) | hundreds |
| **0-keyword** cards | **48%** | — |
| 3+ keywords | 1.6% (0 have 4+) | many |
| near-vanilla (≤1 kw, no effect) | **26%** | — |

**Zero** artifacts, locations, secrets, traps, quests, or planeswalkers exist in the target set. The
entire "flashy" half of the game is unused here. The redesign is essentially: **pull these cards out
of the vanilla 5% and into the interesting 95%,** leaning each pool into its color/theme identity.

---

## 2. What makes a card good here (design philosophy)

From the cards that already work, "interesting" comes from six levers. A strong pool uses a spread of
them rather than repeating "Battlecry: deal/draw/buff/summon."

1. **A persistent engine** — an `ongoing`/`aura`/`static` that changes every turn, not a one-shot.
2. **A decision** — Choose One, Discover, Adapt, a conditional floor-vs-reward, a mana-sink.
3. **A build-around** — a tribe / spell-school / go-wide / deaths / lands / counters payoff that a
   whole pool can support, so the 15 cards synergize *as a set*.
4. **Removal-resistance** — deathrattle, reborn, split Battlecry+Deathrattle, value stored in
   hand/deck. Sticky cards trade up.
5. **Keyword interaction** — bundles whose whole exceeds the parts (windfury+lifesteal, rush+
   poisonous, divine_shield+taunt, first_strike+deathtouch).
6. **A card that isn't a creature** — a secret, a location you tap for value, a planeswalker threat,
   an artifact engine, a quest. Variety of *type* is half the brief.

---

## 3. Stat-tuning baseline (measured)

Vanilla creature stats fit **`attack + health ≈ 1.5 × cost + 2`**:

| cost | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| vanilla total stats | 3.5 | 5 | 6.5 | 8 | 9.5 | 11 | 12.5 | 14 |

**Every keyword / trigger / effect is paid for by pushing stats BELOW this line.** A snowball engine
(Mana Wyrm 1-cost 1/3) sits under-curve on the axis it doesn't need. A 4-keyword bundle (Al'Akir,
8-cost 3/5 = 8 total vs 14 vanilla) pays ~6 stat-points for the bundle. Legendaries/signatures can
run ~1–2 points hot. Tokens don't follow the curve (they're free value).

---

## 4. The palette

### 4a. Card TYPES menu (deploy a wider variety — this is half the brief)

Full authoring shapes are in the reports; the essentials:

| Type | Shape (key fields) | Use it for |
|---|---|---|
| **creature + `adventure`** | `adventure:{name,cost,type:'instant'\|'sorcery',effects}` → casts as a cheap spell, returns to hand as a body | flexible two-for-one; smooths curve; fires `adventure-cast` |
| **artifact** | `tapAbility:{effects,text,condition?}` (targets!) + optional `ongoing`/`static` | a repeatable engine you install once and tap each turn |
| **location** | `type:'location'`, `durability:N`, `taps:[{text,effects}]` | slow board value with a built-in clock; can be attacked away |
| **secret** | `secret:{trigger,condition?,effects}` | hidden reactive gotcha (U/Mage/Hunter/Rogue) |
| **trap** | `trap:{trigger,condition?,effects}` (same pipeline as secret) | telegraphed reactive punish (Bounty-Hunter flavor) |
| **quest** | `quest:{goal:{type,count,tribe?,cost?},reward:[effects]}` | archetype payoff you build toward |
| **planeswalker** | `loyalty:N`, `abilities:[{cost:±N,text,effects}]`, emblem ult | sticky must-answer threat with +/− kit |
| **enchantment** | `ongoing` / `aura` / `static`/`statics` / `costMod` | permanent that rewrites your deck's rules each turn |
| **weapon** | `attack`,`durability` + optional `ongoing` (`hero-attacks`…) | persistent hero pressure; add a trigger so each swing does extra |

**Wired quest goals** (safe): `summon, land, spell, play, draw, death, hero-attack, hero-power,
discover, turn, quickdraw, damage-taken`. **Secret/trap triggers:** `enemy-attack,
enemy-minion-played, enemy-spell-cast, enemy-card-played, hero-power-used, enemy-turn-end,
enemy-card-drawn, hero-takes-damage, friendly-minion-died`.

### 4b. KEYWORD menu, by color (evergreen = dressing; flashy = the underused priority)

- **W** — *evergreen:* taunt, divine_shield, lifesteal, reborn, defender, pacifist. *flashy:* Immune,
  Ward, Overheal, Inspire (`on:'hero-power-used'`), Blink, Avenge N, Honorable Kill, Silence,
  Constellation, Joust.
- **U** — *evergreen:* elusive, first_strike(+R). *flashy:* Stealth(+B), Freeze/Freezer, Secret,
  Discover, Scry/Ponder/Gaze, **Prowess** (spell→+1/+1, almost unused), Echo, Miracle, Spellburst,
  Spell Damage (`static`), Mill/Dredge, Proliferate(+G).
- **B** — *evergreen:* deathtouch, deathrattle. *flashy:* Venomous, Poisonous, **Sanguine** (blood
  tokens on attack AND defend), Morbid N, Corrupt, Dormant, Outcast, Stealth.
- **R** — *evergreen:* rush, charge, trample(+G), windfury, cleave. *flashy:* **Impulsive** (must
  attack), **Firebreathing** (mana-sink pump), **Overkill**, Piercing, Slashing, Combo(+B), Frenzy
  (`self-damaged` + `survives:true`), Quickdraw, Enrich, Forgetful, Static (paralyze).
- **G** — *evergreen:* (few; green is bodies). *flashy:* **Colossal +N**, **Adapt**, **Landfall**
  (`on:'landfall'`), Emerge, **Chromatic**, Cook, Alliance, deathtouch(+B), big Trample.
- **Colorless/system:** Battlecry, Quest, Finale, Manathirst N, Tradeable, Connect, Swing; plus the
  planar/mech/treasure engines where thematically apt.

### 4c. PATTERN menu (the ~20 templates — copy-paste starting points)

**A. Ongoing engines** (`ongoing:{on,if?,effects}`, or `ongoings:[]`). Real event names:
`turn-end, turn-start, spell-played, creature-played, summoned, friendly-creature-died,
creature-died, hero-attacks, hero-power-used, healed, card-drawn, self-damaged, self-attacks,
self-kills-creature, self-hit-player, token-sacrificed, landfall, enemy-spell-played,
enemy-creature-played, die-rolled, ponder`, + many more.
- **A1 grow:** `{on:<event>, effects:[{type:'buff-self',attack,health}]}` — snowball clock.
- **A2 faucet:** `{on:<event>, effects:[{type:'draw'|'summon'|'damage'…}]}` — resource engine.
- **A3 gated:** add `if:{tribe|school|maxCost|keyword|enemy|…}` — narrow to a payoff type.
- **A4 counter:** add `once:true` / `need:N` (Avenge) / `every:N` (Morbid) — delayed payoff.
- **A5 multi:** `ongoings:[…]` — one card = a whole engine.

**B. Conditional** `{type:'conditional', if, then, else?}` (~110 `if` predicates). High-value:
`controlTribe, holdingTribe, party:N, finale, manathirst:N, enemyMaxHealth (execute), handEmpty,
maxHealthSelf, hasArmor, noDuplicates (highlander), deckAllEven/Odd`.
- **B1 kicker:** floor in `else`, reward in `then` (Kill Command).
- **B2 gated battlecry:** cheap body, engine in the right deck (`then` only).

**C. Tribal / per-X scaling.**
- **C1 `per:`** snapshot on play: `{type:'buff-self',per:'friendly-tribe',tribe:'X',attack,health}`
  (also `hand-cards, other-friendly, cards-played, spells-this-turn`…).
- **C2 `selfScale`** live lord: `{selfScale:{attack:1,tribe:'X'}}` — floats with the board.
- **C3 `aura`** anthem: `{aura:{attack:1,health:1,others:true}}` (+`adjacent`/`tribe`/`global`).
- **C4 zone-wide:** `{type:'buff-all-tribe',tribe:'X',…}` / `buff-deck-minions` — dodges wipes.

**D. Choice.** `{type:'discover', landSet|tribe|cardType|school|cost}` (D1);
`choices:[{text,effects},…]` Choose One (D2); `{type:'adapt',…}` (D3).

**E. Tokens / death / combo.** `{type:'summon',count,attack,health,name,tribe,keywords:[…]}` (E1,
keyworded tokens feed C-lords); `deathrattle:[…]` (E2); `combo:[…]` (E3); split
Battlecry+Deathrattle same effect (E4, sticky).

**F. Statics / cost / statlines.** `static:{type:'spell-damage',value}` (F1);
`costMod:{cardType,amount,scope,tribe?}` / `costReducePerTribe` / `selfCostIf` (F2); multi-keyword
below-curve bundle (F3); "rest of deck/hand" payoff (F4).

---

## 5. Color & theme identity map (lean each pool into this)

| Color | Lean into | Signature types |
|---|---|---|
| **W** | go-wide tokens + anthem auras (C3/E1), Divine Shield/Taunt walls, lifegain payoffs, sticky Battlecry+Deathrattle (E4), Reborn | enchantment anthems, quest (go-wide), planeswalker (soldiers) |
| **U** | spell-matters (A1/A3 on `spell-played`, Prowess), Discover (D1), bounce/freeze tempo, cost-reduced spell chains (F2), draw engines | **secret**, artifact (card engines), instant `adventure` |
| **B** | deathrattle value (E2), sacrifice/token loops, `creature-died` faucets (A2), lifedrain, Poison/Deathtouch removal, self-damage payoffs | enchantment (drain), quest (deaths) |
| **R** | aggressive multi-keyword bodies (F3), Combo (E3), burn with conditional kicker (B1), Finale/Manathirst, Firebreathing mana-sinks, weapons | **weapon** (+`ongoing`), planeswalker (burn ult) |
| **G** | tribal lords + per-tribe scaling (C1–C3), ramp (`gain-mana`), Landfall, big bodies + `fight`, +1/+1 counters, Adapt/Colossal | **location** (repeatable ramp/tokens), enchantment (anthems), quest (ramp) |

**Theme families** (advanced-land pools) — reinforce the flavor:
- **Guilds (Azorius…Simic):** the two-color intersection of the table above.
- **Shards/Wedges (Bant, Esper, Grixis, Jund, Naya, Mardu, Sultai, Temur, Jeskai, Abzan):** blend all
  three colors' identities; these pools (24–28 cards) have room for a real archetype.
- **Gods (Theros/Amonkhet: Heliod, Erebos, Bontu, Hazoret…):** legendary "God" bodies + a devotion/
  tribute feel — high-impact enchantment-creatures and indestructible-flavored threats.
- **Colleges (Strixhaven):** each is a 2-color "and" — spell-matters (Prismari), tokens/lifegain
  (Silverquill), +1/+1 & draw (Quandrix), death/drain (Witherbloom), artifacts/order (Lorehold).
- **Kaldheim realms & Tarkir clans:** tribal (Elves, Giants, Dragons, Warriors) → C-series lords.
- **Basic-color pools (Forest/Island/Mountain/Plains/Swamp/Wastes, 70 each):** the mono-color
  generic set — the clearest canvas for a broad spread of that color's whole kit + all card types.

**Lorequest characters** — each pool = that character's identity:
- Planeswalkers: **Ajani** W cats/lifegain · **Chandra** R burn · **Nissa** G lands/ramp/elementals ·
  **Sorin/Drana/Edgar Markov** B vampires/lifedrain · **Liliana** B zombies/sacrifice · **Jace/Teferi**
  U control/bounce/mill/tap · **Gideon/Elspeth** W soldiers/indestructible · **Garruk/Vivien** G beasts ·
  **Lolth** B spiders · **Ob Nixilis** B demons · **Lukka** R/monsters.
- Artificers: **Urza/Mishra/Tezzeret/Daretti/Karn** — artifacts, Constructs, colorless engines.
- Phyrexian praetors: **Elesh Norn** W, **Urabrask** R, **Vorinclex** G, **Sheoldred** B, **Jin-Gitaxias**
  U, **Yawgmoth/Gix** B — proliferate, toxic/poison, doubling `statics`, "corrupt" flavor.
- Eldrazi: **Emrakul/Kozilek/Ulamog/Zhulodok/Zopandrel** — colorless, Colossal, big-mana, cast-triggers,
  annihilator-style disruption, Eldrazi tribe.
- Others: **Nicol Bolas** UBR control-tyrant · **Mondrak/Drivnod/Solphim/Tekuthal** — token/counter/
  damage *doublers* (great `static`/`aura` build-arounds).

---

## 6. Per-pool complexity rubric (target for each 15-card pool)

A pool is "done well" when the 15 cards, as a set, hit roughly:

- **Card-type spread:** at least **3–4 non-vanilla-creature cards** — e.g. ≥1 of {secret/quest/
  location/artifact/planeswalker} + a weapon or an adventure-creature. Not 15 creatures.
- **Keyword spread:** **≥6 distinct keywords**, including **≥2 flashy/build-around** ones from the
  color's list. No more than ~1/3 of cards keyword-less.
- **Engines:** **≥3 cards** with an `ongoing`/`aura`/`static` (persistent), not just battlecries.
- **A decision:** **≥2 cards** with Choose One / Discover / conditional kicker / Adapt / mana-sink.
- **An archetype:** the pool shares **one build-around** (a tribe, a spell-school, go-wide, deaths,
  counters, artifacts…) so the cards synergize and Discover-into-pool feels themed.
- **Stat discipline:** bodies priced by §3; richness paid for by going under-curve.
- **Rarity texture:** commons can be 1-keyword-with-a-twist; the legendary/signature is the payoff.

(For the 70-card basic pools and 24–29-card shard pools, scale the counts up proportionally and
allow 2–3 mini-archetypes.)

---

## 7. Workflow per pool

1. **Read** the 15 cards (`node -e` filter on `loreDeck`/`landSet`), noting name + current design.
2. **Pick the archetype** for the pool from §5 (its color/character identity).
3. **Redesign** each card keeping `id`/`name`/`cost`(mostly)/`rarity`/art, rewriting
   `type`/`keywords`/`effects`/`ongoing`/etc. to hit the §6 rubric. Reuse only engine-supported
   effect types + wired triggers/goals (§4).
4. **Write** via a scratchpad script that replaces those cards in `cards.json` (match by id).
5. **Test:** a per-pool regression test (each card plays without throwing + `validateGameState`
   clean; assert the key new mechanics), a focused fuzz, then the **full suite** (watch for
   seed-drift when adding low-cost/tribed cards to random pools — clear random hands in affected
   tests), and `effect_registry_test` if any new `register()` was added.
6. **Ship:** regenerate news + designwiki, bump cache-busts, commit/push, update memory. (No art step
   — names/art unchanged.)

**Suggested order:** start with a **single 15-card pool** to calibrate the bar and the workflow —
a color-clear character is ideal (e.g. **Chandra** R-burn or **Ajani** W-tokens). Then sweep by
family. The 6 basic-color pools (70 each) are the biggest lift; do them once the pattern is proven.

---

## 8. Pool inventory (114 pools, 2,249 cards)

**Lorequest (37 × 15):** Ajani, Chandra, Daretti, Drana, Drivnod, Edgar Markov, Elesh Norn, Elspeth,
Emrakul, Garruk, Gideon, Gix, Jace, Karn, Kozilek, Liliana, Lolth, Lukka, Mishra, Mondrak, Nicol
Bolas, Nissa, Ob Nixilis, Sheoldred, Solphim, Sorin, Teferi, Tekuthal, Tezzeret, Ulamog, Urabrask,
Urza, Vivian, Vorinclex, Yawgmoth, Zhulodok, Zopandrel.

**Advanced lands (77):**
- *Basics (70 ea):* Forest, Island, Mountain, Plains, Swamp, Wastes.
- *Guilds (15 ea):* Azorius, Boros, Dimir, Golgari, Gruul, Izzet, Orzhov, Rakdos, Selesnya, Simic.
- *Shards/Wedges (24–28):* Bant, Esper, Grixis, Jund, Naya (shards); Abzan, Jeskai, Mardu, Sultai,
  Temur (wedges).
- *Theros gods (15):* Heliod, Erebos, Thassa, Nylea, Purphoros, Athreos, Ephara, Iroas, Karametra,
  Keranos, Klothys, Kruphix, Mogis, Pharika, Phenax, Xenagos.
- *Amonkhet gods (15):* Bontu, Hazoret, Kefnet, Oketra, Rhonas.
- *Strixhaven (15):* Lorehold, Prismari, Quandrix, Silverquill, Witherbloom.
- *New Capenna (15):* Brokers, Obscura, Maestros, Riveteers, Cabaretti.
- *Ikoria triomes (15):* Indatha, Ketria, Raugrin, Savai, Zagoth.
- *Tarkir (15):* Atarka, Dromoka, Kolaghan, Ojutai, Silumgar.
- *Kaldheim realms (23–29):* Axgard, Bretagard, Gnottvold, Immersturm, Istfell, Karfell, Littjara,
  Skemfar, Starnheim, Surtland.

---

## 9. Key engine references

- Keyword defs/rendering: `battlecards/keywords.js`; combat flags `engine/core.js` (KW table).
- Triggers/secrets/traps/ongoing + `if` gates: `engine/triggers.js`.
- Auras & statics: `engine/auras.js`. Conditional `if` vocab: `engine/effects/handlers-misc.js` (~2078).
- Cost mods: `engine/cost.js`. Effect-type registry: `engine/effects/*.js` (`register('...')`).
- Type dispatch on play + instantiation defaults: `engine/core.js` (~240–390, ~2230–2360).
- Color/class pie: `Plans/KEYWORD_COLOR_PIE.md`.
</content>
</invoke>
