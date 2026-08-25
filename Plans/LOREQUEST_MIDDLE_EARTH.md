# Lorequest: Middle-earth — Design Plan

A LOTR/Hobbit-themed run mode for Battlecards. Sibling to **Lorequest** (see
`battlecards/lorequest.js` + memory `magepunk-lorequest`), but re-shaped into a **traditional
dungeon run**: you pick ONE good-guy hero and fight a gauntlet of Sauron's forces until **12 wins
or 3 losses**. Heroes and enemies are **disjoint** rosters (you never fight another hero), which is
the core departure from Duels/Lorequest (where the enemy pool = the same characters you could play).

All card NAMES + ART are sourced from the real MTG set **"The Lord of the Rings: Tales of
Middle-earth"** (`set:ltr`, 85 legendary creatures) and its Commander decks (`set:ltc`, 43 legendary
creatures) on Scryfall — 128 named characters total, every one with an `art_crop`. Mechanics are
ORIGINAL Magepunk designs (keywords/effects DSL), same as the whole pool-redesign initiative — we
reuse names + art only, never WOTC rules text.

---

## 1. Run structure (dungeon-run, not Duels)

| Rule | Value | Notes |
|---|---|---|
| Pick your hero | **1 of 10** (full choice, not 1-of-3) | The 10 heroes are always all offered. |
| Hero starting deck | **10 cards** (1 copy each) | Deliberately small/weak — you grow it via loot. |
| Enemy deck | **15 cards × 2 copies = 30** | Enemies are full-strength; heroes start behind. |
| Win condition | **12 wins** | Clears the run (defeat Sauron as the 12th). |
| Loss condition | **3 losses** | Ends the run. |
| Enemy roster | **~21 enemies, split into RUNGS** | Which enemies can appear is gated by your win count. |
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

## 2. The 10 Heroes (Free Peoples) — 10-card starter decks

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
| 7 | **Éowyn, Shieldmaiden** | RW | warrior | Anti-Wraith aggro; first-strike + charge cavalry. |
| 8 | **Galadriel, Light of Valinor** | GU | druid | Elf tokens + ramp/control; Lothlórien value. |
| 9 | **Théoden, King of Rohan** | RW | warrior | Rohan go-wide cavalry (Knight tokens + anthem: "Ride now!"). |
| 10 | **Elrond, Master of Healing** | GU | priest | Healing + counters + card advantage; Rivendell control. |

*(Two RW warriors, Éowyn & Théoden, differentiate as anti-wraith tempo vs. cavalry go-wide. Frodo/Sam
share GW but split rogue-evasion vs. priest-lifegain.)*

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

**Enemy hero powers — EVERY one of the 21 enemies gets its OWN unique signature power** (decided with the
user; no class-defaults). These are the enemy's whole "loot advantage" — since enemies are otherwise
**STATIC** (see §1: no win-parity buckets/treasures), the signature power is what gives each foe teeth and
personality. Examples: Balrog **Flame of Udûn** — Deal 2 to all enemy creatures; Witch-king **Morgul
Blade** — a creature you damage this turn can't be healed; Shelob **Ensnare** — Freeze a creature and
give it −1/−0; Saruman **Voice of Isengard** — Summon a 1/1 Uruk; Gríma **Poison Words** — an opponent
discards a random card; Sauron **The Eye** — Draw a card, then each opponent discards one. **All 31 powers
(10 heroes + 21 enemies) enumerated in Phase A.**

---

## 3. The 21 Enemies — split into RUNGS (15 cards each → 2× = 30-deck)

Each enemy = a **15-card set** (1 legendary signature + 14 support) run as **2 copies each = 30**.
Art = the named Scryfall card. Signatures are CREATURE commanders (per the world rule; no planeswalkers
for bosses). Colors follow the character's Scryfall identity.

### Rung A — Mooks / first encounters (wins 0–3) — 7 enemies
Weak, aggressive fodder. **★ = first-encounter-only (only spawns at win 0).**
1. **Bill Ferny, Bree Swindler** (U) ★ — a con-man opener; steal/discard chip.
2. **Lotho, Corrupt Shirriff** (BW) ★ — Shire ruffians go-wide.
3. **Gríma Wormtongue** (B) — discard/weaken; whispers.
4. **Grishnákh, Brash Instigator** (R) — reckless Orc aggro.
5. **Gorbag of Minas Morgul** (B) — Orc aristocrat sac.
6. **Shagrat, Loot Bearer** (BR) — Orc + Treasure/steal.
7. **Old Man Willow** (BG) — a slow strangling wall (deathtouch/root).

### Rung B — Lieutenants (wins 4–7) — 7 enemies
8. **Uglúk of the White Hand** (BR) — Uruk-hai go-wide warband.
9. **Mauhúr, Uruk-hai Captain** (BR) — Uruk reinforcements/rush.
10. **Gothmog, Morgul Lieutenant** (B) — Morgul horde + reach.
11. **The Watcher in the Water** (U) — tentacle control (freeze/bounce big body).
12. **The Mouth of Sauron** (BU) — parley/discard control herald.
13. **King of the Oathbreakers** (BW) — the Dead Men; Wraith tokens + deathtouch.
14. **Shelob, Child of Ungoliant** (BG) — deathtouch Spider + poison.

### Rung C — Named commanders (wins 8–11) — 5 enemies
15. **Saruman the White** (U) — Isengard control + Uruk factory.
16. **The Balrog, Durin's Bane** (BR) — Flame of Udûn; big burn finisher.
17. **Witch-king of Angmar** (B) — Lord of the Nazgûl; "no man can kill me" (first-strike/fear).
18. **Sauron, the Necromancer** (B) — Dol Guldur; reanimation/aristocrats.
19. **Sméagol, Helpful Guide / Gollum, Patient Plotter** (BG) — the Ring's pull; steal/copy tricks.

### Rung D — The Dark Lord (win 12) — 2 enemies (final-boss pool)
20. **Sauron, the Dark Lord** (BRU) — the 12th-win boss; the One Ring's master, an all-threats finisher.
21. **Sauron, the Lidless Eye** (BR) — alternate final boss (rotates with #20 for replay variety).

**Rung math:** A=7, B=7, C=5, D=2 → 21. `enemyRosterFor(wins)`: `wins===0` → the ★ first-encounter subset
(+ rest of A); `wins 1–3` → A; `4–7` → B; `8–11` → C; `12` → D (pick one Sauron).

---

## 4. Card build spec

- **Total new cards:** 10 heroes × 10 + 21 enemies × 15 = **100 + 315 = 415 cards** in `cards.json`.
- **Tag:** `meDeck: "<Character>"` (Middle-earth analog of `loreDeck`), `collectible:false`,
  `cardClass:'magepunk'`, `set:'paper'`. Colors per character's Scryfall identity.
- **Signature:** each deck has one legendary-rarity signature (the character); `id` ends `_sig`
  (matches the wiki + deck-test convention: "has a legendary signature").
- **Hero deck = 10 distinct cards** (singleton). **Enemy deck = 15 distinct → deckOf doubles to 30.**
- **Design bar** (same rubric as the pool initiative): each deck spans **6+ card types** and **6+
  keywords**, cohesive to the character's theme. Use the full DSL (creature/sorcery/instant/enchantment/
  artifact/location/weapon/quest + the signature).
- **Art:** real Scryfall LTR/LTC `art_crop` per named card; support cards named after real LTR cards
  in-theme (e.g. Aragorn deck pulls "Andúril, Flame of the West", "Rangers of Ithilien", "Gondor
  gate"…). Fetch + deploy via the proven pipeline (§7).

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
- `HEROES` (10) / `ENEMIES` (21) / `ENEMY_RUNGS` (A/B/C/D arrays + `FIRST_ONLY` set) / `CLASS_OF`
  (hero→class, drives buckets) / `HERO_POWER` (all 31 characters → their unique power id) /
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
   writes `battlecards/art/<id>.jpg` + appends id to `art/index.json`. For 415 cards, prefer the
   **`/cards/collection` batch resolver** (`lq_prime.py` style, 75/call) over per-name to dodge 429s.
3. Deploy: `npx wrangler pages deploy art --project-name=magepunk-cardart --commit-dirty=true`
   (already OAuth'd). Verify `https://magepunk-cardart.pages.dev/<id>.jpg` → 200.

---

## 8. Build phases

- **Phase A — Cards + art:** author 415 cards (10 heroes ×10 + 21 enemies ×15) into cards.json with
  `meDeck` tags + signatures; source + deploy all art. Test `middleearth_decks_test.mjs` (10 heroes =10,
  21 enemies =15, legendary sig, plays-clean, 6+ types/deck).
- **Phase B — Run module:** `middleearth.js` + game.js hooks + `?middleearth=1` + boot/run blocks +
  loot growth. Test `middleearth_run_test.mjs` (rung gating, 12W/3L, enemy-gen, engine-boot).
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
3. ✅ **Hero powers are unique per character** — all **31** (10 heroes + 21 enemies) get their OWN
   signature power (no class-defaults). Class is retained only to pick which loot BUCKETS a hero drafts.
   See §2 table (10 heroes enumerated; 21 enemy powers enumerated in Phase A).
4. ✅ **Final boss** — **rotate two Saurons** (#20/#21) for replay variety. (In roster §4.)
5. ✅ **The One Ring mechanic** — **deferred to v2** (Phase D stretch goal; base run doesn't block on it).

**STILL OPEN (confirm before Phase A):**
6. **Roster swaps** — any must-have characters missing (Bilbo; Tom Bombadil as a secret hero? no MTG
   Smaug exists), or any of the 31 listed you want cut/replaced?
7. **Class assignments** — the hero→class map in §2 (drives which loot buckets each hero drafts) — happy
   with it, or re-theme any?
