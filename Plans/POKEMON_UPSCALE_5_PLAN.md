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

## Batch 3 — Forms: the missing subsystem **[4/5 · L]**

No mid-battle form machinery exists (every form is a standalone species entry).
Castform never shifts with weather, Cherrim never blooms, Aegislash has no
Stance Change, Wishiwashi is stuck Solo, Minior's shield never breaks,
Darmanitan has no Zen, Zygarde never assembles, Eiscue/Morpeko/Palafin/
Cramorant inert, Arceus/Silvally can't change type — and **Illusion**
(Zoroark) is unhandled. Build one form-change subsystem (swap stats/types/
sprite on trigger; the form species entries already exist as data), then wire
the ~17 form abilities through it. Illusion is standalone and can lead.

## Batch 4 — Johto's voice: radio, roamer news, Unown **[3/5 · M]**

- **The radio does something**: every radio in Johto prints one flavor line.
  Channels worth building: Pokémon Music (BGM switch), **Buena's Password**
  (daily answer → points → prizes), Prof. Oak's talk w/ **roamer sightings**
  ("RAIKOU was spotted on Route 38!" — roamers already move; nothing reports
  them), and the Lucky Channel **Lottery** (daily draw vs trainer ID — needs a
  Trainer ID on the card, which the card currently lacks). ⚠ standing-call
  check for the daily pieces.
- **Unown properly**: 28 letter forms (one exists today) + the Unown Dex
  report at the Ruins research center (its scene flag exists, no UI behind it).

## Batch 5 — Battle sparkle: the small iconic beats **[4/5 · S]**

- Player send-out **ball throw + burst** (foe capture already has the full
  ball anim to mirror; the player's mon just slides in).
- **Low-HP beep** + red-bar pulse.
- **Victory jingle** on trainer/wild wins (fanfares exist for everything else).
- Move-select **speed-order hint** and damage-range estimate (PP/type/power/
  effectiveness already shown).

## Batch 6 — Completionist & discovery **[4/5 · M]**

- **A discovery layer**: contests, Frontier, apricorns, headbutt, dive,
  secret bases, async trades — all built, none surfaced. A "THINGS TO DO"
  page in the QUEST menu (region-aware checklist with where-to-start hints)
  turns dead content into destinations.
- **Dex UX**: type/region/caught filters (the PC's search UI is the template),
  and a living-dex view in the PC.
- **Trainer Card**: Trainer ID (also unlocks the lottery), real badge art
  instead of pips, Frontier symbols + BP, shiny count.
- **Share from the overworld**: trainer-card/dex-progress snapshot → image →
  share, mirroring battlecards' deck/replay sharing.
- **Round-2 rosters**: VS Seeker rematches scale levels only; post-Champion
  gym leaders + E4 deserve upgraded species/items/movesets (HGSS-style).

## Batch 7 — Rider sprites **[2/5 · S-M]**

`player.biking`/running change speed only, and Surf draws a generic blue
mount ellipse. The decomps carry the real bike/surf player sheets — wire
bike, running, and a proper surf-mount sprite (+ follower pace already
adapts). Pure authenticity, self-contained.

## Parked (needs design or the standing call)

- **Swarms/outbreaks** — the daily loop with the biggest pull, but explicitly
  skipped by prior user call. Revisit only on request.
- **Mystery Gift** — no mechanism exists; could ride the MP server like mail
  battles do. Needs a design for what it grants.
- **Title screen / intro cinematics** — functional today; cosmetic.
- **Fakemon follower art** — 389 Ransei species follow as bobbing battle-
  sprite minis (fallback works); dedicated 49-sheet follower art exists only
  for legendaries. Art-sourcing project, not code.

## Verification pattern

Per batch: the seeded battle harness for anything battle-side (new asserts per
move group), the passability/screenshot probes for anything field-side, boot
smoke + authenticity + portalpads, and a phone screenshot pass. Weather/
transitions get before/after screenshots reviewed by eye.
