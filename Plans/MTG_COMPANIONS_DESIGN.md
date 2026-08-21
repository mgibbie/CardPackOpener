# MTG Companions — Design Wave (parked, circle back later)

All **10** MTG companions (all from *Ikoria: Lair of Behemoths*, 2020 — the set is closed,
no others exist). **None are in Battlecards yet.** This doc captures each one's companion
condition + creature body + our-engine mapping so we can pick it up cold.

**Status:** design only — nothing built. The Companion *base* mechanic already exists and is
proven (Hex, Kellan's Shadow, paper wave 35): `companion:true` → `p.companion` zone, seated via
the deck loadout, played from the zone; deckbuilding tax via `companionReq`.

> ⚠️ Oracle text below is from memory — **verify exact wording (and mana cost) on Scryfall before
> building each card.** Our `cost` is our own call anyway; conditions + bodies are what matter.

---

## The one engine decision this wave hinges on

Our current `companionReq` is a **"≥ N cards match"** counter (Hex = *15* artifacts ≤3). Every MTG
companion is instead **universal**: *"**every** [card | nonland | permanent | creature] satisfies P."*

**Core build = extend `companionReq` with a universal mode**, e.g.:

```js
companionReq: {
  mode: 'all',                 // vs the existing default "count" mode
  scope: 'all'|'nonland'|'permanent'|'creature',
  // one or more predicates every in-scope card must satisfy:
  parity: 'even'|'odd',        // mana-value parity
  minCost: N, maxCost: N,      // mana-value threshold
  tribes: [...],               // creature is one of these tribes
  sharedType: true,            // all in-scope cards share ONE card type
  singleton: true,             // ≤1 copy of each card
  hasActivated: true,          // every permanent has an activated ability
  label: '...'                 // human-readable error string
}
```

`validateDeck` (collection.js) gains an `mode==='all'` branch that checks the predicate against
every in-scope deck card instead of counting matches. Lands = MV 0 (treat as even; usually
excluded via `scope:'nonland'`). This single extension cleanly unlocks tiers 1–2 (#1–#7).

Bodies then reuse existing effects (mill/reanimate, graveyard-recur, tribal anthem, cost-reduction,
blink) — most already in the engine.

---

## Tier 1 — clean (cost parity / threshold on all cards). **Do first — lands the engine.**

### 1. Gyruda, Doom of Depths — BB, 6/6 Legendary Kraken
- **Companion:** starting deck contains **only even** mana values (lands MV0 = even → all lands ok).
- **Body:** ETB — each player mills 4; put a creature card milled this way onto the battlefield
  under your control.
- **Map:** `companionReq {mode:'all', scope:'all', parity:'even'}`. Body: `mill` (both players) +
  a reanimate-from-milled effect (may need a small new handler that reanimates a creature from the
  cards just milled — otherwise adapt to "reanimate a random creature from either graveyard").

### 2. Obosh, the Preypiercer — B/R, 3/3 Legendary Hound Horror
- **Companion:** nonland cards are **only odd** mana values.
- **Body:** if a source you control with an **odd MV** would deal damage, it deals **double**.
- **Map:** `companionReq {mode:'all', scope:'nonland', parity:'odd'}`. Body = a damage-doubling
  static keyed on the source's parity — likely a new static/aura hook in damage.js
  (`if source.cost is odd → ×2`). Check whether an existing "double damage" aura can be reused.

### 3. Keruga, the Macrosage — GU, 5/4 Legendary Hippo Monster
- **Companion:** nonland cards are **MV ≥ 3**.
- **Body:** ETB — draw a card for each **other creature you control with MV ≥ 3**.
- **Map:** `companionReq {mode:'all', scope:'nonland', minCost:3}`. Body: `draw` with a
  count-by-board-predicate (per creature cost≥3) — extend a draw handler or reuse a "per-friendly"
  counter.

### 4. Lurrus of the Dream-Den — WB, 3/2 Legendary Cat Nightmare, **Lifelink**
- **Companion:** each **permanent** card is **MV ≤ 2**.
- **Body:** once per your turn, cast a permanent spell with MV ≤ 2 from your graveyard.
- **Map:** `companionReq {mode:'all', scope:'permanent', maxCost:2}`. Body: a once-per-turn
  cast-from-graveyard permission — check for an existing graveyard-cast mechanic (Sultai/necro
  cards?) to reuse; else new. Lifelink = existing keyword.

---

## Tier 2 — moderate (tribe-set / shared-type / singleton). All detectable from card data.

### 5. Kaheera, the Orphanguard — WW, 3/2 Legendary Cat Beast, **Vigilance**
- **Companion:** every creature is a **Cat, Elemental, Nightmare, Dinosaur, or Beast**.
- **Body:** other Cats/Elementals/Nightmares/Dinosaurs/Beasts you control get **+1/+1** (anthem).
- **Map:** `companionReq {mode:'all', scope:'creature', tribes:['Cat','Elemental','Nightmare',
  'Dinosaur','Beast']}`. Body = a multi-tribe anthem aura (existing anthem-aura shape, tribe-gated;
  may need OR-of-tribes support).

### 6. Umori, the Collector — BG, 4/5 Legendary Ooze Horror
- **Companion:** all **nonland** cards **share one card type**.
- **Body:** choose that card type as it enters; spells you cast of that type cost **{1} less**.
- **Map:** `companionReq {mode:'all', scope:'nonland', sharedType:true}` (validator finds the common
  type). Body = a cost reducer for a chosen/derived type — reuse `costReducePerTribe`-style pattern
  but keyed on card TYPE (may pick the type automatically = the deck's shared type).

### 7. Lutri, the Spellchaser — UR, 3/2 Legendary Elemental Otter, **Flash**
- **Companion:** **singleton** — no more than one of each nonbasic card. (Our format already caps
  copies at 2 / legendary 1, so this tightens to **max 1 of everything**.)
- **Body:** ETB (if cast) — copy target instant or sorcery spell you control.
- **Map:** `companionReq {mode:'all', singleton:true}`. Body = copy-a-spell — needs a spell on the
  stack to copy; likely adapt to "copy the last spell you cast this turn" or a stack-copy if the
  engine exposes one. Flash = existing.

---

## Tier 3 — awkward (need faithful adaptation)

### 8. Zirda, the Dawnwaker — RW, 3/3 Legendary Elemental Fox
- **Companion:** every **permanent** card has an **activated ability**.
- **Body:** abilities you activate cost **{2} less** (min 1). Own ability: {2},{T}: target creature
  gains "{T}: deal damage equal to its power to any target" until EOT.
- **Map:** `companionReq {mode:'all', scope:'permanent', hasActivated:true}` — need a detector for
  "has an activated ability" across permanent types (`tapAbility` / `abilities` / land taps / etc.).
  Body: an activated-cost reducer (do we track activation costs? tap abilities are mostly free here)
  — likely **simplify** the reduction or drop it; keep the grant-ability tap.

### 9. Yorion, Sky Nomad — WU, 4/5 Legendary Bird Serpent, **Flying**
- **Companion:** deck has **≥ 20 cards over the minimum** (MTG: 60→80).
- **Body:** ETB — exile any number of your other nonland permanents; return them at the next end
  step (mass blink).
- **Map:** ⚠️ **collides with our fixed 40-card format.** Options: (a) adapt to "deck of ≥ 50" and
  raise our deck cap for Yorion decks; (b) reskin the condition to something format-legal (e.g.
  "≥30 nonland cards"); (c) drop the size tax and keep the blink body. **Decide with user.**
  Body = mass-blink of your permanents (reuse existing blink/exile-return).

### 10. Jegantha, the Wellspring — R/G, 5/5 Legendary Elemental Elk
- **Companion:** **no card has more than one of the same colored mana symbol** in its cost.
- **Body:** {T}: add {W}{U}{B}{R}{G} (one of each color).
- **Map:** 🔴 **unmodelable as-is** — we don't store colored-pip strings, so the condition can't be
  checked. Options: (a) drop/relax the restriction (companion with no real tax, or a proxy tax like
  "no two cards share a color pair"); (b) skip Jegantha. Body = a five-color rainbow mana tap
  (reuse the coin/ramp mana pattern). **Decide with user.**

---

## Suggested build order
1. **Tier 1 first** — implement the universal `companionReq` engine + `validateDeck` branch, ship
   Gyruda/Obosh/Keruga/Lurrus, prove it with a `companions_mtg_wave*_test.mjs` (deck accept/reject
   per condition + each body).
2. **Tier 2** — Kaheera/Umori/Lutri (tribe-set, shared-type, singleton predicates + bodies).
3. **Tier 3** — resolve Yorion (deck size) + Jegantha (pips) adaptations with the user, then Zirda.

Art: all 10 have real Scryfall art (art_crop pipeline, host = magepunk-cardart.pages.dev).
Per-wave checklist unchanged: dedicated test + focused fuzz + full suite + art deploy + cache-busts
(gallery + designwiki) + commit/push + memory update.
