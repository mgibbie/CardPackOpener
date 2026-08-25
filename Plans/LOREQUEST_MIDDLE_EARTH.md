# Lorequest: Middle-earth — Design Plan

A LOTR/Hobbit-themed run mode for Battlecards. Sibling to **Lorequest** (see
`battlecards/lorequest.js` + memory `magepunk-lorequest`), but re-shaped into a **traditional
dungeon run**: you pick ONE good-guy hero and fight a gauntlet of Sauron's forces until **12 wins
or 3 losses**. Heroes and enemies are **disjoint** rosters (you never fight another hero), which is
the core departure from Duels/Lorequest (where the enemy pool = the same characters you could play).

All card NAMES + ART are sourced from real MTG Middle-earth sets on Scryfall — **FOUR** of them, all
with `art_crop` on every legendary:
- **LTR** — "The Lord of the Rings: Tales of Middle-earth" (85 legendary creatures)
- **LTC** — its Commander decks (43 legendary creatures)
- **HOB** — "The Hobbit" main set (verified 2026-08-24)
- **HOC** — "The Hobbit" Commander decks

HOB+HOC add **79 more legendary creatures** → **~207 named characters total**. This materially reshapes
the roster: the Hobbit sets supply a whole villain tier the LTR-only plan lacked — **Smaug** (4 versions;
*Smaug the Impenetrable* HOC/BR is commander-scale), **Azog, Moria's Ruin** (B), **Bolg of the North**
(BR), **The Great Goblin** (BR), **Tom, Bert, and William** (the three Trolls, BG), **The Chief Warg**
(BG) — plus new HERO candidates: **Bilbo** (several printings), **Thorin Oakenshield** (RW), **Bard the
Bowman** (UW), **Beorn** (G), and **Tom Bombadil** (HOC, a 5-color God — ideal secret hero). Mechanics
are ORIGINAL Magepunk designs (keywords/effects DSL), same as the whole pool-redesign initiative — we
reuse names + art only, never WOTC rules text.

---

## 1. Run structure (dungeon-run, not Duels)

| Rule | Value | Notes |
|---|---|---|
| Pick your hero | **1 of 10** (full choice, not 1-of-3) | All 10 offered; **Tom Bombadil** is a hidden 11th, unlocked by clearing a run (§2). |
| Hero starting deck | **10 cards** (1 copy each) | Deliberately small/weak — you grow it via loot. |
| Enemy deck | **15 cards × 2 copies = 30** | Enemies are full-strength; heroes start behind. |
| Win condition | **12 wins** | Clears the run (defeat Sauron as the 12th). |
| Loss condition | **3 losses** | Ends the run. |
| Enemy roster | **27 enemies, split into RUNGS** | Which enemies can appear is gated by your win count. |
| Growth (per win) | **Spoils draft + alternating reward** | See the loot sequence below. This is how a 10-card deck catches a 30-card deck. |

**Loot sequence — every win grants BOTH (decided with the user):**
1. **Spoils of war** — pick **1 of 3 cards drawn from the vanquished enemy's own 15-card deck**, OR
   take none. (Roguelike-deckbuilder flavor: you loot the fallen foe's arsenal — Uruk warbands, Nazgûl
   tricks, etc. Each added card is +1 copy to your growing deck.)
2. **Alternating aid — TREASURE / BUCKET, starting with a treasure:** win 1 → treasure, win 2 → bucket,
   win 3 → treasure, … (odd wins = treasure, even wins = class **bucket**). Buckets are drawn from the
   hero's **class** pool (§2). Reuse Duels/Lorequest `offerBuckets`/`rollBucket` + the DUELS treasure set.

**Enemies are STATIC (decided with the user):** the whole Duels/Lorequest **win-parity** system — where
the enemy gains buckets/treasures matched to your win count — is **removed for Middle-earth**. Each enemy
is just its fixed **15×2 = 30-card deck + its one unique signature hero power** (§2). Difficulty scales by
which RUNG you're facing, not by dynamic loot. (Simpler to build and to balance; the loot economy is
entirely player-side.)

**The dungeon-run curve:** hero deck starts at 10 and grows every win (spoils card + alternating
treasure/bucket) while enemies get tougher by rung — the classic "start weak, snowball" shape, distinct
from Duels' symmetric drafts.

**Enemy tiering (the "some enemies only appear first" ask):** `enemyRosterFor(wins)` returns a
rung-filtered pool:
- **Rung A — Mooks (wins 0–3):** weak first-encounter fodder. A few are **first-encounter-only** (win 0).
- **Rung B — Lieutenants (wins 4–7):** captains and monsters.
- **Rung C — Captains/Wraiths (wins 8–11):** the named boss commanders.
- **Rung D — The Dark Lord (win 12):** Sauron himself, the run-ender.
Same "don't repeat the last enemy / don't fight yourself" guard as `generateEnemy` in lorequest.js.

---

## 2. The 10 Heroes (Free Peoples) + 1 secret — 10-card starter decks

Each hero = a **10-card singleton deck**: 1 legendary **signature** (the hero) + 9 themed support cards.
Color drives the Magepunk **class** (hero power + which loot buckets/treasures are offered), mirroring
`CLASS_OF` in lorequest.js. Art = the named Scryfall card.

| # | Hero (signature card / art) | Colors | Class | Deck identity (10 cards) |
|---|---|---|---|---|
| 1 | **Aragorn, Company Leader** | GW | paladin | Leadership anthems + Human/Ranger go-wide; a resilient midrange. |
| 2 | **Gandalf the Grey** | UR | mage | Spellslinger burn + card draw; "a wizard is never late." |
| 3 | **Legolas, Master Archer** | G | hunter | Ranged pings (rush/elusive archers) + Elf synergy. |
| 4 | **Gimli, Counter of Kills** | R | warrior | Aggressive Dwarf melee; grows as it trades (kill-counter). |
| 5 | **Frodo Baggins** | GW | rogue | Stealth/evasion + the Ring; survive-and-chip. |
| 6 | **Samwise Gamgee** | GW | priest | Lifegain + defensive Taunt; loyalty "don't you leave him". |
| 7 | **Éowyn, Shieldmaiden** | RW | `demon_hunter` | Anti-Wraith aggro; agile self-reliant striker — she slays the Witch-king ("I am no man"). |
| 8 | **Galadriel, Light of Valinor** | GU | `druid` | Elf tokens + ramp/control; Lothlórien value. |
| 9 | **Théoden, King of Rohan** | RW | `shaman` | Rohan go-wide rally (Knight tokens + the horns of the Rohirrim: "Ride now!"). |
| 10 | **Elrond, Master of Healing** | GU | `priest` | Healing + counters + card advantage; Rivendell control. |

**✅ LOCKED (2026-08-24).** Class strings are the engine's real values from `lorequest.js CLASS_OF`
(lowercase; `demon_hunter` underscored). The 10 heroes span **9 distinct classes** — `paladin, mage,
hunter, warrior, rogue, priest ×2 (Sam + Elrond, both healers), demon_hunter, druid, shaman`. The two
"dark" classes — **`warlock` and `death_knight` — are intentionally reserved for the enemy roster**
(Nazgûl, necromancers, Sauron), giving a clean Free-Peoples / Shadow class split.

**Secret 11th hero — Tom Bombadil (unlockable):**

| # | Hero (signature / art) | Colors | Class | Deck identity |
|---|---|---|---|---|
| 🔒 | **Tom Bombadil** (HOC) | WUBRG (5-color) | `druid` | "Old Tom Bombadil is a merry fellow" — a whimsical, Ring-immune toolbox that dips into every color. Elemental/Old-Forest nature value (Master of Wood, Water & Hill); the Ring simply doesn't touch him. |

- **Unlock:** hidden — not in the pick-1-of-10 lineup until earned (proposed: **clear one full run** (12 wins)
  with any hero → Tom is offered as an 11th choice thereafter). Flavor: you only "find" Bombadil once
  you've walked deep into Middle-earth.
- **Class = `druid`:** even though he's 5-color, his loot buckets draw from the **druid** pool (nature —
  Master of Wood, Water & Hill). That makes **two druids** (with Galadriel) — fine by design. Deck stays a
  10-card singleton like the others.
- **Hero power — "Ho! Merry Dol!"** (loot: draw a card, then discard one). Deliberately **modest** — a
  card-neutral smoother that helps a 5-color deck hit its colors, NOT a bomb. (Earlier "draw +
  face-immunity" was too strong.)

**Unique hero powers (decided with the user — each hero gets its OWN, not a class-default; the class
still keys which loot BUCKETS are offered).** ~2-mana, once/turn, slot-0:

| Hero | Hero power (name — effect) |
|---|---|
| Aragorn | **Elessar** — Give a friendly creature +1/+1. |
| Gandalf the Grey | **You Shall Not Pass!** — Freeze an enemy creature. |
| Legolas | **Elf-shot** — Deal 1 damage to any target. |
| Gimli | **And My Axe!** — Give a friendly creature +2/+0. |
| Frodo | **Slip Away** — Give a friendly creature Elusive. |
| Samwise | **Don't You Leave Him** — Restore 3 health to a creature or your hero. |
| Éowyn | **I Am No Man** — Deal 2 damage to an enemy creature. |
| Galadriel | **Gift of Lórien** — Summon a 1/1 Elf with Elusive. |
| Théoden | **Forth Eorlingas!** — Give your creatures +1/+0 this turn. |
| Elrond | **Rivendell's Grace** — Restore 2 health and scry 1. |
| Tom Bombadil 🔒 | **Ho! Merry Dol!** — Draw a card, then discard a card (loot). |

**Enemy hero powers — EVERY one of the 27 enemies gets its OWN unique signature power** (decided with the
user; no class-defaults). These are the enemy's whole "loot advantage" — since enemies are otherwise
**STATIC** (see §1: no win-parity buckets/treasures), the signature power is what gives each foe teeth and
personality. Examples: Balrog **Flame of Udûn** — Deal 2 to all enemy creatures; Witch-king **Morgul
Blade** — a creature you damage this turn can't be healed; Shelob **Ensnare** — Freeze a creature and
give it −1/−0; Saruman **Voice of Isengard** — Summon a 1/1 Uruk; Gríma **Poison Words** — an opponent
discards a random card; Sauron **The Eye** — Draw a card, then each opponent discards one; Smaug
**Dragonfire** — Deal 3 to a creature and gain a Treasure; Azog **The Defiler** — whenever a creature
dies, deal 1 to the enemy hero; Great Goblin **Goblin-town** — Summon two 1/1 Goblins; the Trolls
**Sackful of Trolls** — a random friendly creature gains +2/+2 but can't attack next turn; Chief Warg
**Warg-call** — Summon a 2/2 Wolf; Bolg **Gundabad Horde** — return a Goblin that died this game to hand.
**All 38 powers (11 heroes + 27 enemies) enumerated in Phase A.**

---

## 3. The 27 Enemies — split into RUNGS (15 cards each → 2× = 30-deck)

Each enemy = a **15-card set** (1 legendary signature + 14 support) run as **2 copies each = 30**.
Art = the named Scryfall card. Signatures are CREATURE commanders (per the world rule; no planeswalkers
for bosses). Colors follow the character's Scryfall identity.

### Rung A — Mooks / first encounters (wins 0–3) — 9 enemies
Weak, aggressive fodder. **★ = first-encounter-only (only spawns at win 0).** **✚ = Hobbit-set (HOB/HOC).**
1. **Bill Ferny, Bree Swindler** (U) ★ — a con-man opener; steal/discard chip.
2. **Lotho, Corrupt Shirriff** (BW) ★ — Shire ruffians go-wide.
3. **Gríma Wormtongue** (B) — discard/weaken; whispers.
4. **Grishnákh, Brash Instigator** (R) — reckless Orc aggro.
5. **Gorbag of Minas Morgul** (B) — Orc aristocrat sac.
6. **Shagrat, Loot Bearer** (BR) — Orc + Treasure/steal.
7. **Old Man Willow** (BG) — a slow strangling wall (deathtouch/root).
8. **Tom, Bert, and William** (HOB, BG) ✚ — the three cave-Trolls; one big clumsy body + go-wide, turns
   to stone at dawn (a self-petrify downside the AI plays around). Hobbit ch. "Roast Mutton".
9. **The Chief Warg** (HOB, BG) ✚ — Warg-pack leader; summons Wolf tokens and rushes. Hobbit "Out of the
   Frying-Pan".

### Rung B — Lieutenants (wins 4–7) — 9 enemies
10. **Uglúk of the White Hand** (BR) — Uruk-hai go-wide warband.
11. **Mauhúr, Uruk-hai Captain** (BR) — Uruk reinforcements/rush.
12. **Gothmog, Morgul Lieutenant** (B) — Morgul horde + reach.
13. **The Watcher in the Water** (U) — tentacle control (freeze/bounce big body).
14. **The Mouth of Sauron** (BU) — parley/discard control herald.
15. **King of the Oathbreakers** (BW) — the Dead Men; Wraith tokens + deathtouch.
16. **Shelob, Child of Ungoliant** (BG) — deathtouch Spider + poison.
17. **The Great Goblin** (HOB, BR) ✚ — Goblin-town king; a swarm engine that floods 1/1 Goblins and
    ambushes from tunnels. Hobbit "Over Hill and Under Hill".
18. **Bolg of the North** (HOB, BR) ✚ — Gundabad goblin commander; endless reinforcements at the Battle
    of Five Armies (recur/summon on death).

### Rung C — Named commanders (wins 8–11) — 7 enemies
19. **Saruman the White** (U) — Isengard control + Uruk factory.
20. **The Balrog, Durin's Bane** (BR) — Flame of Udûn; big burn finisher.
21. **Witch-king of Angmar** (B) — Lord of the Nazgûl; "no man can kill me" (first-strike/fear).
22. **Sauron, the Necromancer** (B) — Dol Guldur; reanimation/aristocrats.
23. **Sméagol, Helpful Guide / Gollum, Patient Plotter** (BG) — the Ring's pull; steal/copy tricks.
24. **Smaug the Impenetrable** (HOC, BR) ✚ — the Hobbit-era marquee boss; a giant Dragon that hoards
    Treasure and torches the board.
25. **Azog, Moria's Ruin** (HOB, B) ✚ — the Pale Orc / Defiler; the Hobbit trilogy's arch-hunter, a
    relentless boss that grows off every kill and hunts the hero down.

### Rung D — The Dark Lord (win 12) — 2 enemies (final-boss pool)
26. **Sauron, the Dark Lord** (BRU) — the 12th-win boss; the One Ring's master, an all-threats finisher.
27. **Sauron, the Lidless Eye** (BR) — alternate final boss (rotates with #26 for replay variety).

**Rung math:** A=9, B=9, C=7, D=2 → **27** enemies. Each 12-win run draws 3 from A, 4 from B, 4 from C, 1
from D = 12 fights, so the larger pools mean **no repeats within a run + varied rosters across runs**
(great for a dungeon-run). `enemyRosterFor(wins)`: `wins===0` → the ★ first-encounter subset (+ rest of
A); `wins 1–3` → A; `4–7` → B; `8–11` → C; `12` → D (pick one Sauron). Same "don't repeat last / don't
fight yourself" guard as `generateEnemy`.

---

## 4. Card build spec

- **Total new cards:** 11 heroes × 10 + 27 enemies × 15 = **110 + 405 = 515 cards** in `cards.json`
  (10 base heroes + secret Tom Bombadil; 27 enemies).
- **Tag:** `meDeck: "<Character>"` (Middle-earth analog of `loreDeck`), `collectible:false`,
  `cardClass:'magepunk'`, `set:'paper'`. Colors per character's Scryfall identity.
- **Signature:** each deck has one legendary-rarity signature (the character); `id` ends `_sig`
  (matches the wiki + deck-test convention: "has a legendary signature").
- **Hero deck = 10 distinct cards** (singleton). **Enemy deck = 15 distinct → deckOf doubles to 30.**
- **Design bar** (same rubric as the pool initiative): each deck spans **6+ card types** and **6+
  keywords**, cohesive to the character's theme. Use the full DSL (creature/sorcery/instant/enchantment/
  artifact/location/weapon/quest + the signature).
- **Art:** real Scryfall **LTR / LTC / HOB / HOC** `art_crop` per named card; support cards named after
  real in-set cards in-theme (e.g. Aragorn deck pulls "Andúril, Flame of the West", "Rangers of Ithilien";
  Smaug deck pulls "Desolation of Smaug", "Smaug's Fury"…). Fetch + deploy via the proven pipeline (§7).

---

## 5. The One Ring (optional signature dungeon mechanic)

LTR's flavor hook worth stealing for the dungeon-run: **"The Ring tempts you."** Proposed as a run-wide
treasure/curse rather than per-card:
- On certain wins the run offers **the One Ring** as a treasure: a powerful passive (e.g. your hero
  gains Stealth/Elusive + a draw each turn) that also **accrues corruption** (a small escalating
  downside — Sauron's decks get +1 card quality per corruption, or the Nazgûl appear a rung early).
- Frodo/Sam heroes interact with it (bear it safely longer); most heroes are tempted.
- **Status: OPTIONAL / v2.** Ships as a stretch goal so the base run doesn't block on it.

---

## 6. Implementation mapping (mirror `lorequest.js`)

lorequest.js is a 76-line data+helper module; Middle-earth mirrors it as **`battlecards/middleearth.js`**:
- `HEROES` (10 base + `SECRET_HEROES`=[Tom Bombadil], gated by a run-cleared flag) / `ENEMIES` (27) /
  `ENEMY_RUNGS` (A/B/C/D arrays + `FIRST_ONLY` set) / `CLASS_OF` (hero→class, drives buckets; Tom =
  `druid`, a 2nd druid) / `HERO_POWER` (all 38 characters → their unique power id) /
  `heroChoices()` (returns all 10) / `deckOf(cardsById, ch)` (hero → 10 singleton; enemy → 2×15) /
  `enemyRosterFor(wins)` (rung-gated) / `generateEnemy(rng, wins, avoidId)` / `WINS_TO_CLEAR=12` /
  `LOSSES_TO_END=3`.
- **NO parity:** drop Lorequest's `TREASURE_WINS`/`enemyLoot`/parity budget entirely — enemies are static.
  Player rewards each win: `spoilsChoices(rng, defeatedEnemy)` (3 from the fallen deck) + an alternating
  `treasure`(odd win)/`bucket`(even win) via `rewardForWin(wins)`. Buckets come from the hero's class.
- **game.js** wiring at ALL run hooks (the Lorequest block ~game.js 5751-6008 is the template):
  `?middleearth=1` route + menu button, `MIDDLEEARTH_KEY='magepunk_middleearth_v1'`,
  `middleearthRunMode` flag (added LAST in the exclusion chain), load/save/clear, hero-power slot-0,
  mulligan gate, game-over hook, concede, boot block (pick-1-of-10 hero overlay), run block
  (`bootMiddleEarthEncounter`/`afterMiddleEarthGame`/`middleEarthLoot`/`advanceMiddleEarth`/
  `middleEarthRunComplete`/`middleEarthRunOver`).
- **TWO menu surfaces** (per lorequest lesson): in-game `mainMenu()` button + homepage
  `battlecards/start.html` "Run Modes" tile (`data-run=magepunk_middleearth_v1`, glyph 💍).
- **Spectate parity** (mode-agnostic pipeline): add `middleearth` to every LABEL/ICON map —
  game.js publish `mode`/`label` + `deriveReplayMeta`; site/topbar.js `CARD_MODE_LABEL` + `bc:<mode>`;
  battlecards/profile.js `CARD_MODE`; battlecards/replays.js `MODE_ICON`/`MODE_NAME`; start.html
  `CARD_MODE`/`MODE_ICON`. Test `friends_activity_test.mjs` asserts each mode is live+labeled.
- **Wiki:** designwiki `#/middle-earth` section (parallel to `#/lore-decks`) grouping 10 Heroes + 21
  Enemies (by rung) → deck detail; reads cards.json (`meDeck` tag) live.

---

## 7. Art pipeline (proven)

Same flow used for the 13 pool expansions (see memory `magepunk-pool-redesign`):
1. Map `{id: "Real LTR Card Name"}`.
2. `scratchpad/fetch_pool_art.mjs <map.json>` — Scryfall `art_crop` (User-Agent header + ~180ms delay),
   writes `battlecards/art/<id>.jpg` + appends id to `art/index.json`. For ~515 cards, prefer the
   **`/cards/collection` batch resolver** (`lq_prime.py` style, 75/call) over per-name to dodge 429s.
3. Deploy: `npx wrangler pages deploy art --project-name=magepunk-cardart --commit-dirty=true`
   (already OAuth'd). Verify `https://magepunk-cardart.pages.dev/<id>.jpg` → 200.

---

## 8. Build phases

- **Phase A — Cards + art:** author ~515 cards (11 heroes ×10 + 27 enemies ×15) into cards.json with
  `meDeck` tags + signatures; source + deploy all art. Test `middleearth_decks_test.mjs` (11 heroes =10,
  27 enemies =15, legendary sig, plays-clean, 6+ types/deck).
  - ✅ **Deck cards DONE (2026-08-25):** 10 hero decks (100 cards, colorless class cards, commit b3ed9358)
    + **27 enemy decks (405 cards, commit 627f020c)** = **505 cards** in cards.json, all colorless
    non-collectible CLASS cards (`meDeck` + `meSide`), all art deployed to magepunk-cardart.pages.dev.
    Tests `pool_middleearth_heroes_test.mjs` (278) + `pool_middleearth_enemies_test.mjs` (1012); suite
    431/431 green. Enemy→class map locked (warlock 8 / warrior 6 / death_knight 5 / rogue 3 / hunter 2 /
    mage 2 / druid 1).
  - ✅ **38 hero powers DONE (as data, not cards):** the engine installs a hero power from each seat's
    inline `power` object at `createGame` — so the 38 UNIQUE powers (11 heroes + 27 enemies) live in
    `middleearth.js` `HERO_POWERS`, NOT as `heropower` cards in cards.json. Simpler + engine-native.
  - ✅ **Tom Bombadil (secret 11th hero) DONE:** 10-card druid deck in cards.json (`me_tom_*`, art
    deployed), unlocked by clearing a run. Heroes now 11 / 110 cards.
- **Phase B — Run module:** ✅ **DONE (2026-08-25, commit 5b02143b).** `middleearth.js` (rosters, rung
  gating, static enemies, deckOf, reward alternation, spoils draft, seatOf, HERO_POWERS) + full game.js
  `?middleearth=1` wiring (mirrors the lorequest block: key/flag/load-save-clear, slot-0 power, mulligan
  gate, game-over hook, mode/label/replay-meta, menu tile, pick-hero overlay, boot, spoils+alternating
  loot, advance, run-complete/over + Tom unlock). Test `middleearth_run_test.mjs` (209 checks: rung
  gating, 12W/3L, static enemy-gen, all 38 powers install+fire via the engine). Suite 432/432. A
  44-encounter node boot sanity (every hero × 4 rung enemies) is clean.
- **Phase C — Surfaces:** in-game + start.html menus, spectate maps, designwiki section, news regen,
  cache-busts. Ship.
- **Phase D (optional) — The One Ring** corruption mechanic.

---

## 9. Decisions

**RESOLVED with the user (2026-08-24):**
1. ✅ **Hero deck growth** — every win grants BOTH: (a) **spoils draft** — pick 1 of 3 cards drawn from
   the vanquished enemy's own 15-card deck (or take none), and (b) **alternating aid** — TREASURE on odd
   wins / class **BUCKET** on even wins, starting with a treasure (win 1). See §1 loot sequence.
2. ✅ **Enemies are STATIC** — the Duels/Lorequest **win-parity** budget (enemy matches your buckets/
   treasures) is **removed**. Each enemy = fixed 30-card deck + one unique signature hero power; difficulty
   scales by RUNG only. See §1 + §2.
3. ✅ **Hero powers are unique per character** — all **38** (11 heroes + 27 enemies) get their OWN
   signature power (no class-defaults). Class is retained only to pick which loot BUCKETS a hero drafts.
   See §2 table (11 heroes enumerated; 27 enemy powers enumerated in Phase A).
4. ✅ **Final boss** — **rotate two Saurons** (#26/#27) for replay variety. (In roster §3.)
5. ✅ **The One Ring mechanic** — **deferred to v2** (Phase D stretch goal; base run doesn't block on it).
6. ✅ **Source correction (2026-08-24):** the Hobbit sets **HOB + HOC** exist (79 more legends). **Smaug
   DOES exist** in MTG (4 versions) — added as Rung C boss #24 (*Smaug the Impenetrable*, HOC/BR).
7. ✅ **Hobbit villains + secret hero added (2026-08-24):** roster grew **22 → 27 enemies** — added the
   three Trolls (**Tom, Bert & William**) + **The Chief Warg** to Rung A, **The Great Goblin** + **Bolg
   of the North** to Rung B, **Azog, Moria's Ruin** to Rung C. **Tom Bombadil** added as the hidden 11th
   (secret) hero, unlocked by clearing a run; class `druid` (a 2nd druid). See §2 + §3.

8. ✅ **Class assignments LOCKED (2026-08-24):** hero→class map finalized in §2 — Aragorn `paladin`,
   Gandalf `mage`, Legolas `hunter`, Gimli `warrior`, Frodo `rogue`, Samwise `priest`, Éowyn
   `demon_hunter`, Galadriel `druid`, Théoden `shaman`, Elrond `priest`, Tom Bombadil `druid` (2nd druid,
   OK). Real engine class strings; `warlock`/`death_knight` reserved for villains.

**→ ALL DECISIONS RESOLVED. Plan is ready for Phase A (card authoring) on your go.**
