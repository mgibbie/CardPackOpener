# Advanced-Land Pool Power & Differentiation Plan

Goal: make every advanced-land Discover pool **worth the upgrade** — strictly stronger than the
basic pools, with 3-color pools stronger still — and make the pools **meaningfully different**, so
choosing which land to upgrade into is a real strategic decision.

Grounded in a full audit of all 77 lands + 67 non-basic pools (2026-09-09). Companion docs:
`POOL_CARD_REDESIGN_GUIDE.md` (authoring palette), `KEYWORD_COLOR_PIE.md` (color lanes),
`forest pool design notes.txt` (the basic-pool bar).

---

## 1. The value ladder (what a player pays and gets)

Every land action costs the same **3 mana + every opponent gets a Coin** (develop basic = upgrade
advanced). Advanced lands additionally require **color identity** (all the land's colors already in
your held lands' union) and are **globally unique** — one copy per table, first claim locks it out.

| Tier | Tap suite | Card access | Prerequisite |
|---|---|---|---|
| Basic (70-card pool) | 1 mana / 1 boost / **Conjure = RANDOM of 70** | random, fair-rate staples | none |
| Mono temple (15) | **2 mana** / 1 boost / **Discover = pick 1 of 3** | selected, themed | 1 color held |
| 2-color (15 or 30) | 2 mana / 2 boosts / Discover | selected, archetype | both colors held |
| 3-color (15 or 30) | **3 mana** / 3 boosts / Discover | selected, bombs | all three colors + you won the race |

So the chassis already ladders (mana + selection). The **card quality must ladder the same way** —
and today it does not.

## 2. The problem, measured

Metric: **avgEffPower** = for each creature, `(attack+health) − (1.5·cost+2)` + count of real
mechanics (keywords beyond battlecry/deathrattle + effect fields). Averaged per pool. It's a proxy —
spells aren't scored — but it compares pools honestly. Audit script: `tools/pool_power_audit.mjs`.

| Category | Pools | avg stat delta | **avgEffPower** |
|---|---|---|---|
| Basics (post-2026-09-09 pass) | 6 | −1.36 | **+0.46** (Forest +1.23) |
| Mono temples | 10 | −0.60 | **+1.47** ✓ above basics |
| 2-color | 41 | −0.88 | **+0.95** ✗ barely above; 8 pools BELOW Forest |
| 3-color | 20 | −1.20 | **+0.48** ✗✗ equal to BASICS — fully inverted |

Worst offenders: Skemfar −0.50, Cabaretti −0.13, Mardu −0.08, Jeskai −0.02, Bretagard +0.04,
Esper +0.05, Grixis +0.15, Karfell +0.22, Istfell +0.28, Bant +0.29.

**Structural gap:** the five Alara shards (Bant/Esper/Grixis/Jund/Naya, 30 cards each) predate the
≥6-type rubric — they have only **2–3 card types and zero trigger mechanics** (no ongoing/secret/
quest/location/artifact at all). They need the full redesign, not just a power pass.

## 3. Power bands (the design decision)

| Tier | Target avgEffPower | Authoring rule of thumb |
|---|---|---|
| Basic | ~+0.5–1.0 | fair Hearthstone-rate staples (owner is hand-tuning; don't touch) |
| Mono temple | **+1.5–2.0** | Forest-quality + a visible temple theme; no filler |
| 2-color | **+2.0–2.5** | "gold card" feel: on-curve stats AND two mechanics, or +1–2 stats over curve with one; every pool has 2–3 archetype ENGINES + 1–2 finishers |
| 3-color | **+3.0–3.5** | every card reads rare+: 2+ mechanics or over-curve + 1; 3+ build-around bombs per pool; premium removal; zero vanilla |

Rate conversions when pushing an existing card (pick one, keep the identity):
- **+1/+1 to +2/+2 stats** (≈ +2 eff) — cheapest, use for beaters
- **−1 cost** (≈ +1.5 eff) — use for engines you want online earlier
- **add a second mechanic layer** (trigger/keyword/activated, ≈ +1–2 eff) — best for differentiation
- **upgrade effect numbers** (draw 1→2, damage 2→3, summon 1→2 tokens) — for spells (the metric
  doesn't see it, but the player does; spells in T3 pools should be ~1 mana over-rate)

Guardrails: pool ceilings scale too — a T3 pool's top end may exceed Ghalta/Pelakka (basics'
ceiling). Discover-only cards never enter constructed decks (`collectible:false`), so pushed rates
are contained by land scarcity + the 3-mana tap economy. Don't push interaction-denial (mass
freeze/discard) as hard as stats — push fun, not frustration.

## 4. Differentiation: the choice architecture

Four levers already exist — the pools just have to honor them:
1. **Tier** (hold basics vs race to a triome) — solved by the power bands above.
2. **Within-region identity** — see the matrix below. RULE: *no two pools sharing a color may lead
   with the same signature mechanic.* Each pool owns 1–2 mechanics its neighbors may only cameo.
3. **Pool size** — 15-card pools are CONSISTENT (you'll see your engine), 30-card pools are
   TOOLBOXES (more answers, less redundancy). Keep sizes as-is; it's a real choice axis.
4. **Scarcity race** — unique lands mean the sharpest pools get contested. Spice, don't flatten.

### Identity matrix (signature mechanic ownership; ✗ = collision to fix)

**Mono temples (T1):** Heliod = healing/Medic (weak, push) · Thassa = scry/top-deck · Erebos =
drain/reborn · Purphoros = on-summon burn · Nylea = trample/overkill · Oketra = token order ·
Kefnet = draw-matters · Bontu = sacrifice · Hazoret = hero-attacks aggro · Rhonas = fat/fight.

**2-color regions:**
- **UW**: Azorius = LAW (freeze/bounce/counter tempo) · Ephara = ALLIANCE-draw (creature-played
  engines) · Istfell = SPIRIT go-wide evasion · Ojutai = dragon PROWESS/scry. ✗ today all four lead
  "Elusive + draw" — re-lead each with its signature.
- **UB**: Dimir = MILL (owns it) · Phenax = ✗ also mill → re-lead HAND-ATTACK (discard + punish) ·
  Karfell = UNDEAD deathrattles · Silumgar = deathtouch CONTROL/steal.
- **UR**: Izzet = SPELL-TRIGGERS (prowess/cascade) · Keranos = TOP-DECK burn (scry/miracle) ·
  Prismari = BIG SPELLS (cost 5+ payoffs) · Surtland = GIANTS.
- **UG**: Simic = +1/+1 COUNTERS (grow/proliferate, owns it) · Quandrix = TOKEN MATH (fractals,
  copy/double) · Kruphix = BIG MANA (ramp-to-X) · Littjara = SHAPESHIFTERS (copy effects).
- **WB**: Athreos = death-DRAIN (aristocrat trade) · Orzhov = ✗ drain too → re-lead TAXES +
  LIFESTEAL WALLS (attackTax/ward/exile) · Silverquill = evasive WORDS (flyer buffs/debuffs) ·
  Starnheim = ANGELS (reborn valkyries).
- **WR**: Boros = BATTALION (attack-together buffs) · Iroas = hero-attack HONOR (Swift/HK) ·
  Lorehold = GRAVEYARD RECURSION (resurrect) · Axgard = DWARF EQUIPMENT/weapons.
- **WG**: Selesnya = TOKEN CONVOKE (go-wide) · Dromoka = COUNTER lifegain dragons (bolster) ·
  Karametra = RAMP temples (land/summon engines) · Bretagard = HUMAN anthem.
- **BR**: Rakdos = SACRIFICE-burn (owns sac) · Mogis = ✗ minotaur sac → re-lead PUNISH (opponent
  pays/hurts) · Kolaghan = DASH haste dragons · Immersturm = DEMON/valkyrie combat-damage.
- **BG**: Golgari = GRAVEYARD (dredge/resurrect, owns it) · Pharika = DEATHTOUCH/poison snakes ·
  Witherbloom = LIFEGAIN-drain engine (pest tokens) · Skemfar = ELF tribal.
- **RG**: Gruul = FIGHT/stomp · Atarka = DRAGON ferocity · Klothys = burn-RAMP destiny ·
  Xenagos = PARTY haste (grant-charge) · Gnottvold = TROLL reborn/regenerate.

**3-color (T3) — each is a STRATEGY, not a color pile:**
- Shards: Bant = EXALTED (attack-alone/blink value) · Esper = ARTIFACT CONTROL (thopters, tap
  engines) · Grixis = SPELL-RECURSION drain (cast from graveyard) · Jund = DEVOUR/lands-sac midrange
  (treasure-into-dragons) · Naya = 5-POWER-MATTERS (big battlecries).
- Wedges: Abzan = OUTLAST resilience (counters + reborn) · Jeskai = MONK prowess tempo · Sultai =
  DELVE value (graveyard-to-hand) · Mardu = WARRIOR raid swarm · Temur = FEROCIOUS ramp-aggro.
- Ikoria: Indatha = NIGHTMARE lifegain-mutate · Ketria = ELEMENTAL magic (spell+ramp) · Raugrin =
  DINOSAUR cycling-tempo · Savai = CAT weapons/aristocrats · Zagoth = mutate-VALUE engines.
- Capenna: Brokers = SHIELD counters (ward/protection) · Obscura = CONNIVE (loot + intel) ·
  Maestros = CASUALTY (sac-to-copy) · Riveteers = BLITZ (ephemeral haste payoff) · Cabaretti =
  ALLIANCE party-wide (tokens + crescendo).

Mechanics with NO owner yet (great T3 differentiators): joust, plunder, quickdraw, echo, miracle,
corrupt, dormant, colossal, emerge, magnetic, assemble/contraptions, planeshift, time-travel
locations, adventures, traps. Deploy at most 1–2 per pool so each stays legible.

## 5. Implementation batches (each = 1 PR: power push + identity sharpening + test updates + full suite)

- **A — Shards full redesign** (Bant/Esper/Grixis/Jund/Naya, 150 cards): rubric (≥6 types incl.
  location/artifact + engines) AND T3 band. Biggest gap first. Add `tools/pool_power_audit.mjs`
  with per-tier band assertions wired into a regression test so power can't silently regress.
- **B — Wedges to T3** (Jeskai/Mardu/Sultai/Temur 30s + Abzan 15): power push + signature-mechanic
  re-lead per matrix.
- **C — Capenna + Ikoria to T3** (10 × 15): same treatment; these are closest to done mechanically,
  furthest on power (Cabaretti −0.13 → +3.0).
- **D — Kaldheim realms + weak guilds/colleges to T2** (10 realms ×30 + Silverquill/Silumgar/Izzet/
  Simic/Azorius/Dimir…): push the sub-+1.0 tail, fix the UW/UB/WB collision re-leads.
- **E — 2-color gods to T2 + temple touch-ups** (Athreos/Ephara/Karametra/Klothys/Mogis/Pharika/
  Phenax/Xenagos/Kruphix/Keranos + Heliod/Oketra/Kefnet): finish the ladder.

Order rationale: worst inversion first (a 3-color land must never Discover worse cards than a
basic), then breadth. Names/art unchanged throughout; identities sharpened, never replaced.

## 6. Worked examples (the delta, concretely)

**T2 push (Istfell, UW spirits — today +0.28):** "Istfell Shepherd 3-mana 2/3 Elusive." →
"Istfell Shepherd 3-mana 2/3. Elusive.\nDeathrattle: Summon a 1/1 Spirit with Elusive." — same
card, now an engine piece in the pool's go-wide-evasion promise.

**T3 push (Jeskai monk — today −0.02):** "Jeskai Elder 2-mana 2/2 Elusive." → "Jeskai Elder
2-mana 2/3. Elusive & Prowess.\nConnect: Scry 2." — a 3-color Discover should hand you a card
that snowballs, not a bear.

**Shard redesign (Bant — today 2 card types, no triggers):** "Bant Knight 4-mana 3/4
Divine Shield." → "Bant Battlemage 4-mana 3/4. Divine Shield & Ward (1).\nSwing: Give another
friendly creature +1/+1." (exalted-as-Swing) — plus the pool gains a location (Seaside Citadel
taps for a 2/2 Knight), an artifact engine, a secret, and a blink package.

## 7. Verification

- `tools/pool_power_audit.mjs` prints the table in §2; `--check` exits 1 if any pool is below its
  tier band (bands encoded per landSet). New regression test runs `--check`.
- Each touched pool's `pool_<x>_test.mjs` gains fired assertions for its signature mechanic
  (the "owns it" cell in the matrix), so differentiation is enforced, not aspirational.
- Full suite green before each PR merges.
