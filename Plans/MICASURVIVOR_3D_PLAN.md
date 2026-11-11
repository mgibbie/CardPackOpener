# MicaSurvivor — 3D Expedition + Dive overhaul plan

Status: DRAFT for the owner (2026-11-11). Nothing here is built. Five decisions are open (section 7).

Owner requirements (2026-11-11):
1. Classic mode is great: leave it alone.
2. **Expedition** and **Dive** get a big visual upgrade: real 3D, "2D sprites moving in a 3D space".
3. Both move closer to their inspirations: Expedition to a 3D arena-survivor, Dive to a room-based action roguelike.
4. **Dive needs a significant rehaul**: it is too easy, the enemies are not strong enough, and looking for the stairs is
   frustrating — show them on a minimap or similar.

This reverses an earlier decision. `MICASURVIVOR_POKEBONK_DLC_STUDY.md` lists "the 3D camera, free-look … camera-relative
manual aim" under *What NOT to take* (§5.6) and "The 3D look → No, by owner rule" (§3). When this plan is accepted, that
study gets a note pointing here.

Scope of "inspiration": we take genre ideas (billboarded sprites over 3D terrain, a room-and-door dungeon, a camp between
runs) and build them in our own code with our own content. No other game's code, levels, art or names go into the repo.
This plan was written from our own codebase and the two modes as they play today; it does not draw on any other game's
source.

---

## 1. What exists today (verified in code, 2026-11-11)

**Rendering.** One `<canvas id="game">`, plain Canvas 2D, no WebGL. `render()` (`micasurvivor/js/game.js:930-995`) draws
ground chunks, ground effects, a y-sorted entity pass, projectiles and effects, then screen-space layers and the HUD. The
camera is 2D pan + scale only (`js/core/camera.js`). Every entity has its own `draw(ctx)`; Expedition adds about 25 more
canvas draw functions.

**Sprites.** PMD SpriteCollab sheets: columns are frames, rows are **8 directions**. Scale is 2 world units per art pixel;
a tile is 32 units. Facing is picked from the screen angle (`core/sprites.js:143`).

**Height already exists in the rules.** Expedition zones are 120×120 tiles with heights 0–3, ramps, deep water and bounce
pads (`expedition/terrain.js`). Collision and enemy pathing read them. Hop, double hop, glide, slide, climb, surf and
ledge drops are real verbs (`expedition/verbs.js`). On screen all of it is flat: height is a tint and a painted cliff
face, and a jump is a sprite lifted off its shadow. **The 3D world is already simulated; it is just not drawn.**

**The rules read the camera.** Spawn rings, off-screen projectile removal, enemy despawn and the bomb pickup all use the
camera's view rectangle (`spawner.js:40,48`, `classic.js:561,619`, `survival.js:335,417`, `projectile.js:91`,
`enemy.js:261,1054`, `game.js:645`).

**What does not depend on drawing.** Replays and spectating record positions, not inputs. Co-op guests draw copies of the
host's entities. Terrain is rebuilt from `{seed, map, zone}`.

**Performance today.** Phone (844×390), 85 enemies: 16.6 ms median frame, 17.9 ms p95. Enemy cap 110 (80 on touch).
The study skipped "1,000+ enemies" because "Canvas 2D and the co-op snapshot size can't afford them".

**Tests.** About 23 expedition suites plus the dive suites. Nearly all assert game state. Four read pixels
(`terrain`, `maps`, `mega`, `economy`); the unmerged dive-visuals branch adds golden pixel hashes.

**3D library.** three.js r165 is already vendored (`battlecards/vendor/three.module.min.js`). MicaSurvivor uses plain
deferred scripts on a global `G`, so the 3D renderer would load three with a dynamic `import()`.

**Dive today** (`expedition/dive.js`, `dive-gen.js`):
- A floor is one open 56×40 cave (cellular automaton), not rooms. Stairs are placed at ≥90% of the longest walk from
  spawn, preferably out of sight.
- **The stairs are already on the minimap, always, ignoring fog** (`dive.js:1151-1161`). They are a 6 px gold square.
  Gold rocks (3 per floor, ~9 px, near-identical gold), Meowth and the player's own ring use the same colour, and the
  stairs are usually beyond the minimap's 24-tile radius, so the marker sits on the rim with the others. The full map
  (M key) does not show the stairs at all.
- Enemy numbers: HP factor 2.8 (Classic 3.3), damage factor 1.68 (Classic 2.4) — Dive foes have ×0.85 the HP and ×0.7
  the damage of Classic's. Tier is capped at 4. Dive skips Classic's difficulty tier and curse modifiers.
- Groups sleep until you are within 7 tiles; nothing spawns over time; there is no clock. Open caves let you walk
  around most fights.
- Healing: 2 berry bushes a floor at 50% each (respawn after 120 s), full heals at shrines and fairy rings, a 40% "rest"
  level-up card.
- Planned but never built: elite affixes (swift / tough / rage), the camp after each alpha, the haven/town hub.
- The balance was tuned to a bot that rushes past fights (`MICASURVIVOR_DIVE_MODE_PLAN.md` L357-362).

**Unmerged work.** `feat/micasurvivor-dive-visuals` holds DV1–DV5 (the code-drawn floor painter, canopy, light, a 640-wide
view, the dive HUD, a rounded minimap). Only DV6 (perf tuning) is left. It does not fix the stairs marker, and its
narrower view shows less of the floor.

---

## 2. Approach: one new renderer, the rules untouched

Build a second renderer and keep the simulation. The 2D renderer stays as a setting ("Flat view") — for low-end phones,
for the tests that read pixels, and as the fallback when WebGL is unavailable. Classic mode keeps the 2D renderer.

```
update loop (unchanged)  ->  entity / terrain state  ->  render2d  (today's code)
                                                     ->  render3d  (new: three.js scene)
                                                     ->  HUD (today's 2D canvas, drawn on a transparent overlay)
```

Three seams have to be cut first, all in 2D, all behaviour-neutral:

- **A view rectangle the rules own.** Spawn rings and culling stop reading the camera and read `G.View.rect` — the same
  768×420-unit rectangle around the player they see today. The 3D camera can then tilt and rotate without changing where
  enemies spawn. (In 3D the rectangle becomes a circle of the same area; that is a rules change and is called out in R3.)
- **A draw list.** `drawScene()` builds a list of `{kind, x, y, lift, sheet, frame, row, scale, tint, …}` and the 2D
  renderer draws from it. Entities stop painting themselves. This is the bulk of the refactor (about 25 draw functions
  in Expedition plus the base entities) and is where most of the risk is.
- **The HUD on its own canvas.** It is already drawn last in screen space; it moves to an overlay canvas so the game
  canvas can be WebGL.

## 3. The 3D renderer

- **Terrain.** A mesh per zone chunk built from the height layer the rules already use: flat tops at heights 0–3, real
  cliff walls, ramps as slopes, water as a lowered animated plane. The existing chunk paint (and Dive's `dive-art.js`
  painter) becomes the top texture, so the look carries over and nothing is repainted by hand.
- **Sprites.** One instanced billboard batch per sprite sheet. The 8-direction rows make camera rotation cheap: the row
  is picked from the entity's facing relative to the camera's yaw. Fallback sheets (4 rows + mirror) work the same way.
  A blob shadow sits on the terrain under each sprite; a hop is real height above it.
- **Ground effects** (auras, fields, hazards, telegraphs) are painted into a ground-decal canvas that is projected onto
  the terrain. They keep their current 2D drawing code.
- **Air effects** (projectiles, hits, Z-moves) become billboards or simple meshes, type by type. Until a type is ported it
  falls back to a camera-facing quad of its current 2D drawing.
- **Camera.** Tilted third-person follow, behind and above the lead. Yaw rotates (right stick, drag, Q/E); pitch has a
  small range. Movement becomes camera-relative. Local co-op (2–4 on one screen) keeps a wider, fixed-yaw framing.
- **Occlusion.** A cliff between the camera and the lead fades (the dive-visuals branch already has the silhouette idea).
- **Budget.** Hold today's phone number (median ≤16.7 ms at 85 enemies) before raising any cap. Instancing should allow
  more enemies on screen, but the co-op relay limit (16,000 characters a message) caps enemy counts independently of the
  renderer, so a higher cap is a separate decision.

## 4. Expedition: phases

| Phase | What | Proof |
|---|---|---|
| **R0 spike** | One map (Viridian), read-only: terrain mesh + billboards for player and enemies, no effects, behind `?view3d=1`. | Runs on the phone profile at ≤16.7 ms median with 85 enemies. If it cannot, stop here. |
| **R1 seams** | `G.View.rect`, the draw list, HUD overlay — in 2D only. | Full gate green with no test changed; `base_unchanged` passes. |
| **R2 renderer** | Terrain, billboards, shadows, ground decals, camera, occlusion. Air effects by fallback quads. | New suite: every entity in the draw list has a 3D node at the projected position; screenshots for review. |
| **R3 play in 3D** | Camera-relative controls on keyboard, pad and touch; jump / glide / climb read as real height; spawn ring becomes a circle; aim assist checked against the tilted view. | Existing expedition suites pass in both views; a bot run compares time-to-kill and deaths between views. |
| **R4 effects** | Port air effects type by type; Ultimates' cut-in and hit-stop; weather and fog as real depth fog. | Per-effect checks; perf re-measured. |
| **R5 closer to an arena-survivor** | Maps that use height on purpose (high ground, drops, bounce routes), denser hordes if the budget allows, interactables you can see from a distance. Design pass with the owner before building. | Owner playtest. |
| **R6 default** | 3D becomes the default for Expedition; "Flat view" stays in settings. Spectate, replays, local and online co-op verified. | Spectate / replay / co-op suites in both views. |

## 5. Dive: phases

**D0 — find the stairs (small; can ship first, on its own).** *Built 2026-11-11 (`overworld/tests/micasurvivor_dive_stairs_test.mjs`). As built: the stairs took their own orange mark, so the rocks and Meowth keep their gold; the HUD arrow comes up after 25 s on a floor, or at once when its boss falls.*
- The stairs get their own marker: a distinct shape and colour used by nothing else, larger, pulsing, drawn last so
  nothing covers it, with a rim arrow when off the minimap.
- Gold rocks and Meowth stop sharing the stairs' colour.
- The full map (M) shows the stairs and lists them in its legend.
- A HUD arrow at the screen edge points to the stairs once they are unsealed and most of the floor's foes are down
  (so it ends the wandering without replacing the exploring).
- Test: the marker is recorded on every floor, distinct from every other icon; the full map has it.

**D1 — make it bite (numbers and behaviour; no generator change).**
- Bring HP and damage factors to at least Classic's (2.8 → 3.3, 1.68 → 2.4), let the tier reach 5, and keep scaling
  past floor 25.
- Groups wake from farther (7 → about 11 tiles) and wake their neighbours, so a pull is a fight.
- Pressure: after a per-floor grace period, reinforcements arrive from the far side at a rising rate. Lingering costs.
- Build the planned elite affixes (swift / tough / rage) and use them from floor 6.
- Use more of the AI types the base game already has (ranged, charger, bomber, summoner) in the group mix by depth.
- Healing down: berry bushes 50% → 25% and no respawn; shrine heals to 50%.
- Retune with the existing balance bot, changed to fight instead of rush, then by owner playtest. Target (to confirm):
  a fresh profile dies around floor 6–8, a maxed one around floor 20.
- The tuning pin in `micasurvivor_dive_test.mjs:819` changes, and `G.Expedition.DV` goes up so old replays keep their
  numbers.

**D2 — rooms and doors (the rehaul; a generator rewrite).**
- A floor becomes a short chain of rooms instead of one cave. A combat room locks until it is cleared, then opens 2–3
  doors, each showing what is behind it (fight, elite, shop, rest, treasure, event). The last room holds the way down.
- This removes the stairs hunt by design: the exit is always a visible door.
- Alphas and guardians become boss rooms. The shop and berry bushes become room types.
- Build the camp the first plan skipped: a small hub between dives where meta upgrades are bought and the next dive is
  chosen.
- Cost: the floor generator, its invariants test, the dive-visuals pixel fixture and the replay version all change.
  The open-cave generator stays available for old replays.

**D3 — Dive in 3D.** The same renderer as Expedition. Rooms are small, bounded 3D spaces, which suits it better than
open caves. Depends on R2.

## 6. Order and dependencies

1. **D0** now. It is independent of everything else and fixes the loudest complaint.
2. **R0 spike.** It decides whether 3D on the phone is real. Everything visual waits on it.
3. **D1** in parallel with R1 (different files).
4. **R1 → R2 → R3**, then **D2**, then **D3** and **R4–R6**.

D2 before D3: there is no point building 3D for caves that are about to be replaced by rooms.

## 7. Decisions for the owner

1. **The dive-visuals branch (DV1–DV5, unmerged).** Merge it now, or drop it? Recommended: merge it. Its floor painter
   becomes the 3D terrain texture, so the work carries over, and D0 has to touch the same minimap file either way.
   Skip DV6.
2. **Camera.** Free yaw rotation behind the lead (closest to the genre; needs camera-relative controls on touch), or a
   fixed tilted angle (simpler, no new controls)? Recommended: free yaw, with a fixed-yaw option in settings.
3. **Keep "Flat view" forever, or retire it after R6?** Recommended: keep it. It is the fallback for weak phones and the
   pixel-reading tests, and Classic needs the 2D renderer anyway.
4. **Dive structure.** Rooms and doors (D2), or keep open caves and only fix signposting and difficulty (D0 + D1)?
   Recommended: D0 and D1 first, play it, then decide on D2 — it is the largest single item here.
5. **Enemy caps.** Hold 110 / 80, or raise them once 3D is measured? This is limited by co-op message size as much as by
   drawing. Recommended: hold until R4, then measure.

## 8. Risks

- **The draw-list refactor (R1)** touches every entity. It is done in 2D first, with no visual change, so the existing
  gate is the safety net.
- **Phone performance.** WebGL texture memory for up to 200 sprite sheets, and overdraw from many billboards. R0 exists
  to find this out before anything else is built.
- **Readability.** A tilted, rotating camera hides enemies behind cliffs and makes ground telegraphs harder to read than
  top-down. Occlusion fade and decal contrast are part of R2, not polish.
- **Co-op and spectate.** Guests and viewers must render the same scene from positions only. This works today because
  drawing is separate from the rules; R6 re-verifies it.
- **Balance drift.** Camera-relative controls and a circular spawn ring change how hard Expedition is. R3 measures it
  with a bot in both views.
- **Dive replays.** D1 and D2 change numbers and floors. The `DV` version keeps old tapes on old rules.
