# Battlecards Upscale — targeting feel, the thin classes, and the content frontiers

2026-09-03, from the targeting-bug investigation plus a sweep of every open
Battlecards item across the prior audits (2026-08-26 site audit, 2026-08-27
3-agent game audit, UIUX_POLISH_PLAN, SPELL_IMPORT_PLAN, and the run-mode
memories). The Pokemon side has had three upscale rounds; this is the card
game's turn. Run batches in order; PR-sized as usual.

**Shipped with this plan (the targeting fix, same PR):**
- A card dropped on the field awaiting its target now STAYS STAGED at the drop
  point instead of snapping back into the hand — the hand sits behind the hero
  panel, so the targeting arrow's tail looked like "a red line drawn from my
  hero" instead of from the card being aimed (game.js hand layout + `dropX`/
  `dropY` on pending).
- Two-step fight spells (Prey Upon) anchor the arrow at the picked FIGHTER in
  step 2, not at the spell in hand (`targetSourcePos`).
- Creatures whose press opens the ability/unmask menu now honor drag-to-attack:
  a real drag closes the menu and arms the attack (`menuDragCandidate`).
- Pressing your own creature while a HERO weapon attack is armed re-arms to the
  creature instead of killing the gesture.
- A press on the hero panel's top band within a thumb's reach of an
  attack-ready creature arms the creature, not a weapon swing
  (`pickAttackReadyCreatureNear` — the creature row hugs the panel on phones).
- A creature armed with a missing entity no longer draws the arrow from the
  table center.

Verified by headless gesture harnesses (scratchpad arrow_repro*.cjs): real
pointer/touch drags across laptop + phone portrait/landscape + FFA4, pixel
sampling of the arrow overlay, full 452-suite pass + replay smoke.

---

## Batch A — Finish the input feel **[5/5 · S]**

- **Colorblind-safe board states**: the in-scene red (targetable) vs green
  (armed) borders are a red-green risk flagged in the accessibility pass and
  never fixed. Add a shape cue — targetable gets the pulsing socket/reticle,
  armed gets a solid double-ring — so hue is never the only signal. Applies to
  creature rings, hero-panel border, and the foe-panel DOM borders.
- **Commit-side fat-finger guard**: the press side now prefers a nearby ready
  creature over the hero panel; do the same for the RELEASE — dropping the
  arrow on the seam between an enemy creature and the enemy hero panel should
  prefer whichever legal target's token is nearest the release point on touch.
- **Armed-state visibility for click-then-click**: after arming by click, the
  arrow is suppressed until the cursor is 30px out (`dist < 30` in
  drawTargetArrow) — pulse the armed creature's socket immediately so the armed
  state reads before the drag starts.
- **Tap-target audit on phones**: hand cards, land slots, and the orb at
  390px width — measure with the perf-snap geometry pattern, widen what's
  under ~44px.

## Batch B — Close out UIUX_POLISH batches C–F **[4/5 · M]**

A + B (battle immersion, hero/creature presence) shipped. Remaining, verify
each against today's code first — pack ritual partially shipped via the
pack-opening PRs:
- **C — one visual identity**: unify site chrome (topbar, buttons, cards,
  fonts) across start/deck/collection/packs/replays/boards pages.
- **D — pack-opening ritual**: confirm drag-to-slot + rarity glow + shockwave
  cover the plan's intent; close the gap if any (e.g. legendary reveal beat).
- **E — deck builder depth cues**: mana-curve bar, class/color identity strip,
  keyword chips on hover, "why is this card illegal here" affordance.
- **F — collection polish**: set completion meters per expansion bucket,
  recently-acquired shimmer, dust preview on duplicates.

## Batch C — The thin classes and phantom archetypes **[4/5 · M]**

The engine supports keywords that barely exist as collectibles, and five
classes ship nearly no class cards. Design waves guided by
Plans/KEYWORD_COLOR_PIE.md; wire through the standard card-data shapes
(dice/enchantment patterns memory has the conventions):
- **Phantom-archetype waves**: Proliferate (0 collectible), Coven (0),
  Landfall (0 beyond lands' own), Counterspell (1), Time Travel (2),
  Contraption (2), Morbid/Medic (4 each) — 8–12 cards per wave so each
  archetype is draftable/buildable.
- **Class-card floors**: bard / wizard / sorcerer / barbarian / ranger sit at
  0–6 class cards — bring each to ~15 so class-first deckbuilding means
  something for them.
- **Regen pool-rarity + gallery listings** after each wave (gallery cache-bust
  `?v=` bump in the 4 spots).

## Batch D — Systems finishers **[3/5 · M]**

- **Seasons / ranked resets**: Elo exists (K=32, pvp:board) but never resets;
  add seasons with end-of-season rewards (packs/dust by peak rank) and a
  season badge on the profile.
- **Boss decklist accuracy**: the protobuf extraction tooling for the frozen
  HS scenario files is ready — extract the real dungeon/heist/tombs boss
  decklists and replace the approximations where they differ.
- **Browsable live boards**: boards.html exists; surface a "watch a live
  match" hub entry fed by the presence/spectate plumbing.
- **Lorequest Urza variety pass**: the one under-built deck (3 card types) of
  the 37 — bring it to the 6–7-type bar the others meet.

## Batch E — Content frontiers (the big imports, workflow-sized) **[3/5 · L]**

Each of these has a plan or pipeline already; they are token-heavy, not
design-heavy — good workflow/fan-out candidates:
- **HS spell import**: 1,351 missing spells, ~60% template-simple
  (Plans/SPELL_IMPORT_PLAN.md). Run in waves like the minion import.
- **Duels completion**: ~580 treasure/pool cards + the run module
  (tools/data/duels_pool.json is extracted; batch 1 of actives landed).
- **MTG Companions**: the parked 10-companion wave
  (Plans/MTG_COMPANIONS_DESIGN.md) — needs the universal
  `companionReq {mode:'all'}` extension first.
- **Advanced-land pools**: 67 of 72 lands still Discover from nothing —
  15-card themed pools each, KEYWORD_COLOR_PIE-guided
  (magepunk-advanced-lands conventions).
- **Pool card redesign**: 2,249 bland Lorequest/pool cards, pool by pool
  (Plans/POOL_CARD_REDESIGN_GUIDE.md) — already started, fold into this
  cadence.

## Batch F — Engine hardening at FFA scale **[2/5 · S]**

- **Deeper FFA fuzzing**: the FFA duel fuzz is green (251/251) — extend the
  adversarial relay fuzz to 3–8 seats with mid-game concedes/eliminations and
  targeted-effect cross-seat assertions (the in-progress item from the
  2026-08 hardening pass).
- **Phone FFA perf budget**: 8-player boards on a DPR3 phone — texture count
  and face-cache ceiling via perf-snap board scenario; regress-guard the
  numbers in CI like the import-graph lint.

---

## Verification pattern

Every batch: full `battlecards/tests/run-all.mjs` (452 suites) + the gesture
harnesses for anything input-facing (the arrow_repro pattern: real
pointer/touch events + arrow-canvas pixel sampling + `__game.targeting`),
`perf-snap board` before/after for anything visual, and a phone
portrait/landscape screenshot pass.
