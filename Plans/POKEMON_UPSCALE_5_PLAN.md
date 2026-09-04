# Pokemon Upscale 5 — the feel layer, the dropped move mechanics, and Johto's voice

2026-09-03, from a fresh 3-agent audit (battle-engine depth / overworld systems /
polish-and-retention), every claim verified in code — the port is deep enough now
that most remembered "gaps" turned out to be built (foe switch AI, egg
inheritance, gender ratios, PC boxes+release, bag pockets, all 10 Frontier
facilities, every status move, Ransei fakemon in night+rift encounters, async
PvP with a mail badge, streaming map connections, move deleter/relearner, name
rater, in-game trades). What follows is what is genuinely missing, ranked.
Run batches in order; PR-sized as usual.

> **Standing-call flag**: the dailies system (swarms/outbreaks) was deliberately
> skipped on a prior user call (`main.js` notes it). Batch 4 includes the daily
> Lottery and roamer news anyway because they came up in this audit — CONFIRM
> whether the standing call covers them before building.

## Batch 1 — Field feel: transitions, weather, ambient life **[5/5 · S-M]**

- **Warp + battle transitions**: warps hard-cut (`moveToMap`/`warpTo` play a
  door sfx and swap the map; the render loop has no fade layer) and the
  overworld→battle handoff is a hard cut too. One reusable fade-to-black on
  warp + the classic field-flash into battle = the biggest instant-feel win in
  the codebase. Door-open beat rides along.
- **Overworld weather rendering**: `MAP_WEATHER` feeds battle weather only —
  Route 119's rain is invisible until a fight starts, and only 4 maps carry
  weather at all. A light particle overlay (rain/sand/hail/fog) keyed off
  `mapWeatherNow()` + extend MAP_WEATHER to the canonical weather routes
  (Hoenn's rain belt, desert, Snowpoint-alikes; the tint plumbing to copy
  already exists in `drawDayNightTint`/`drawCaveDark`).
- **Grass rustle + footprints**: a one-shot rustle sprite on grass entry, sand
  footprints on desert/ash tiles. Static grass is the tell that this is a port.

## Batch 2 — Battle truth: the ~100 dropped move mechanics **[5/5 · M]**

All move effects live in three hand tables; anything absent does plain damage.
The audit found the canonical mechanics silently dropped on 100+ damaging
moves. Groups, cheapest first (each is a table-row sweep + a handful of
handlers):
- **Secondaries**: Scald's burn (161 learners), Waterfall's flinch (161), the
  para/poison/confuse/acc-drop set (nuzzle/gunkshot/nightdaze/…), self-boosts
  (flamecharge/chargebeam/poweruppunch/meteormash…).
- **Multi-hit**: tailslap/bonerush/dragondarts/scaleshot/tripleaxel + 8 more
  currently hit once.
- **Recoil/recharge**: woodhammer/volttackle/steelbeam/mindblown recoils;
  roaroftime/rockwrecker/eternabeam recharge — all currently pure upside.
- **Alt-stat damage**: bodypress (Def as Atk), foulplay, psyshock/psystrike —
  currently use the wrong stat.
- **Pivot moves**: u-turn (228 species!), voltswitch, flipturn — deal damage
  but never switch. Reuse the Baton Pass machinery — and unblock it for the
  FOE side (`battle.js` hard-fails Baton Pass/Parting Shot when `isFoe`), so
  the AI can pivot too.
- **Conditions & oddballs**: suckerpunch/firstimpression/pursuit fire
  unconditionally; freeze-dry isn't SE vs Water; brickbreak (350 species)
  doesn't break screens; highjumpkick has no crash; the bind-trap set
  (anchorshot/spiritshackle/…), item-eaters (pluck/bugbite/incinerate),
  clearsmog/spectralthief.
Split into 2 PRs if needed: (a) table-only groups, (b) pivots + alt-stat +
foe-pivot + conditions. Extend the seeded battle-test suite per group.

## Batch 3 — Forms: the missing subsystem **[4/5 · L]** — DONE (PR #247)

No mid-battle form machinery exists (every form is a standalone species entry).
Castform never shifts with weather, Cherrim never blooms, Aegislash has no
Stance Change, Wishiwashi is stuck Solo, Minior's shield never breaks,
Darmanitan has no Zen, Zygarde never assembles, Eiscue/Morpeko/Palafin/
Cramorant inert, Arceus/Silvally can't change type — and **Illusion**
(Zoroark) is unhandled. Build one form-change subsystem (swap stats/types/
sprite on trigger; the form species entries already exist as data), then wire
the ~17 form abilities through it. Illusion is standalone and can lead.

**Built the subsystem** — `changeForm(mon, formId, side, msg)` recomputes stats
from the form's `baseStats` (same level/IVs/EVs/nature), swaps types + sprite,
and carries HP across a max-HP change (Zygarde-Complete keeps the gain). Six
iconic triggers wired through it: **Stance Change** (Aegislash, inline in
`useMove` — any attack → Blade, King's Shield → Shield), **Zen Mode**
(Darmanitan ≤50%), **Schooling** (Wishiwashi >25% & Lv20+), **Power Construct**
(Zygarde ≤50%, one-way), **Forecast** (Castform matches sun/rain/hail), and
**Hunger Switch** (Morpeko flips each end of turn). HP-threshold and weather
rules live in `checkFormTriggers()`, called from `checkFaints()` (post-damage)
and `endOfTurn()`. 24-assertion `formchange_test.mjs`. Deferred to a follow-up:
Ice Face, Palafin Zero to Hero, Minior shield-break, Cherrim Flower Gift,
Arceus/Silvally type-change, and Zoroark's Illusion (standalone).

## Batch 4 — Johto's voice: radio, roamer news, Unown **[3/5 · M]**

- **The radio does something** — DONE (PR #248). Every std radio object now opens
  a tune-in menu instead of the one static march line: **POKéMON MUSIC** (swaps
  the BGM to a station track until you leave the room), **OAK'S PKMN TALK** (reads
  the live roamer state and reports "RAIKOU near ROUTE 38!" — roamers already
  moved, nothing announced them), **BUENA'S PASSWORD** (a daily Blue-Point draw
  with a one-time prize ladder) and the **LUCKY CHANNEL** (a daily lottery whose
  trailing digits are matched against a new stable 5-digit **Trainer ID**, now
  shown on the Trainer Card). Daily pieces use the Bug-Contest `toDateString()`
  guard; new keys registered in `owreset.js`. 17-assertion `radio_test.mjs`.
- **Unown properly** — DONE (PR #249, stacked on #248). The one `unown` entry
  became 28 real species (A + B..Z + ! + ?) via `tools/gen_unown.mjs` — identical
  to A but for name + sprite (the 28 letter sprites already shipped on disk). A
  wild Ruins Unown now rolls a specific letter (`rollUnownLetter`, remapped in
  `startWildBattle`); ! and ? stay hidden until all four Ruins puzzles are solved.
  A per-letter **UNOWN DEX** (`pokedex.js`) records each letter but folds them to
  #201 so the National dex isn't inflated. The inert research-center flow is now
  live: `NUM_UNOWN`=28 in SCRIPT_CONSTANTS, `VAR_UNOWNCOUNT` synced each script
  run, `UnownPrinter` special implemented, and the scientists open a drawn
  28-cell dex report. 15-assertion `unown_test.mjs`. ⚠ needs the `overworld/data`
  offload deploy (27 new species entries).

## Batch 5 — Battle sparkle: the small iconic beats **[4/5 · S]** — DONE (PR #251)

- **Send-out ball throw + burst** — the player mon starts hidden (`meHidden` at
  init + `applyRestore` un-hides on resume); `queueSendOut` throws a ball that
  arcs from the trainer's corner, bursts open (cry + reveal), then the mon slides
  in via the existing `enter` fx. New `sendthrow`/`sendburst` fx drawn in
  `drawSide` for the me side. Wired at every player send-out (wild + trainer start,
  after-faint, manual switch).
- **Low-HP beep + red-bar pulse** — a `lowhp` beep re-fired on a 0.6s timer in
  `update()` while the lead sits ≤20%, silenced on recovery; the HP bar pulses
  toward white via a new `opts.pulse` + `mix()` in `battleui.js`.
- **Victory jingle** — `fanfare_victory` played in `finish('victory')` (covers
  wild + trainer, one hook).
- **Move-select hints** — `dmgHint(mv)` (a % range / "KO?" from the AI's real
  damage core) on each move's sub line, and `speedOrder(mv)` → a "You/Foe move
  first" line (honours priority, paralysis, Trick Room), in both bar layouts.
- Two new synthesized sounds via `gen_sfx.mjs` (`lowhp`, `fanfare_victory`).
  13-assertion `battlesparkle_test.mjs`. ⚠ needs the `overworld/data` sfx offload
  deploy.

## Batch 6 — Completionist & discovery **[4/5 · M]** — CORE DONE (PR #252)

- **A discovery layer** — DONE. The QUEST menu grew a second page (◄ ►): THINGS
  TO DO, a 15-activity checklist (contests, the Ruins, secret bases, the Frontier,
  apricorns, Dive, headbutt, radio...) with where-to-start hints and live
  `[x]/[>]/[ ]` state from real predicates (`todoRows`). 12-assertion
  `discovery_test.mjs`.
- **Dex UX** — filters DONE. `T/R/F` cycle type (18+ALL) / region
  (Kanto/Johto/Hoenn/Other) / caught (ALL/OWNED/SEEN/MISSING); compose; empty
  state; header shows the active filter + count. `dexList` rebuilt around a cached
  `dexAll` + live filter. 12-assertion `dexfilter_test.mjs`. (Living-dex PC view
  deferred with the follow-up.)
- **Trainer Card** — DONE. Trainer ID already on it (Batch 4); added SHINIES
  (party + boxes, `shinyOwnedCount`) and FRONTIER (BP + symbols). Real per-badge
  art deferred (needs 24 sourced sprites — pips stay). 5-assertion
  `trainercard_test.mjs`.
- **Follow-up PR (#253)** shipped the deferred items:
  - **Round-2 rosters** — a re-armed BOSS rematch modernises movesets (skips the
    fixed low-level roster moves when `bump>0` → higher-level learnset) and pads
    the squad toward six from the class pool. Ordinary trainers untouched.
    `round2_test.mjs` (7).
  - **Living-dex grid** — `G` in the Pokédex toggles a completion wall (icon grid,
    owned bright / seen dim / missing silhouette; honours the T/R/F filters).
    `livingdex_test.mjs` (9).
  - **Share the Trainer Card** — `S` snapshots the frame → PNG → Web Share, else a
    named download. `cardshare_test.mjs` (5).
  - Still deferred: **real per-badge art** (needs 24 sourced badge sprites — the
    tier tracker stays as pips).

## Batch 7 — Rider sprites **[2/5 · S-M]** — DONE (PR #254)

Biking changed speed only and Surf drew a generic blue ellipse. The real decomp
bike/surf player sheets were already sitting in `data/people` (red_bike.png /
red_surf.png, 18-frame, same 9-frame walk layout the NPCs use) — just unwired.
`Player.init` now loads them and `Player.rideImg()` selects the surf-mount /
bike / walk sheet in `draw()` (surf outranks bike); the blue ellipse survives
only as a fallback when the surf sheet is missing. Running keeps the walk sheet
(faster) — Crystal has no separate run body sheet. Code-only (the sheets already
ship in owdata). 9-assertion `ridersprites_test.mjs`; boot/stepfx/dive/warpfade
green. **ROUND 5 COMPLETE** (batches 1-7 + the Batch-6 follow-up; only real
per-badge art remains deferred as an art-sourcing task).

## Parked (needs design or the standing call)

- **Swarms/outbreaks** — the daily loop with the biggest pull, but explicitly
  skipped by prior user call. Revisit only on request.
- **Mystery Gift** — no mechanism exists; could ride the MP server like mail
  battles do. Needs a design for what it grants.
- **Title screen / intro cinematics** — functional today; cosmetic.
- **Fakemon follower art** — RESOLVED (not via AI). Explored AI generation of
  128×128 4-direction follower sheets from each front battle sprite (a Retro
  Diffusion batch harness + owner preview tool). Tested `rd_animation__four_angle_
  walking` on 7 fakemon: it preserves colour but bipedalizes creatures and faces
  wrong — because true top-down back/side views can't be derived from a single
  front sprite (any generic model hallucinates). **Decision: keep the battle-sprite
  mini fallback for all fakemon.** `followSheet()` hard-routes negative-dex species
  to the mini (cache-proof), and the mini mirrors when walking right. The RD
  generation harness (`tools/gen_followers.mjs`) + its indexes were REMOVED; the
  owner Follower Test previewer (`?followtest=1`, blank grass arena, reads the live
  species catalog) was KEPT.

## Verification pattern

Per batch: the seeded battle harness for anything battle-side (new asserts per
move group), the passability/screenshot probes for anything field-side, boot
smoke + authenticity + portalpads, and a phone screenshot pass. Weather/
transitions get before/after screenshots reviewed by eye.
