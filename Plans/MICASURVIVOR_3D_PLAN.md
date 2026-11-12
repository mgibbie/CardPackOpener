# MicaSurvivor — 3D Expedition + Dive plan

Status: REVISED 2026-11-11 (second pass, same day). Nothing 3D is built. D0 and D1 (Dive, in today's 2D) are built.

Owner requirements:
1. Classic mode is great: it stays exactly as it is, on the 2D code.
2. **Expedition** and **Dive** become **actually 3D**, with 2D sprites in a 3D world. *Not* a 2D game drawn to look 3D
   (the first draft of this plan kept the 2D rules and added a 3D renderer; the owner rejected that on 2026-11-11).
3. Megabonk is the bar of quality: we are to match or beat it, not land beneath it. The owner named four areas:
   **level generation, jumping, how skills are upgraded, and how characters read in the 3D world**.
4. Dive needed to be harder and its stairs findable: D0 and D1 below, built.

This reverses `MICASURVIVOR_POKEBONK_DLC_STUDY.md` §3 / §5.6 ("The 3D look → No, by owner rule"). That study gets a note
pointing here.

What we take and what we do not: ideas and structure, built in our own code with our own content. No code, levels, art,
audio or names from another game go into the repo.

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

---

## 2. The bar: Megabonk, as studied (2026-11-11)

**What was readable.** The owner's installed copy is compiled (Unity, native code). Its mod loader's generated interface
assemblies list every class, field and method **name** (1,147 types); the code inside the methods and the tuning numbers
are not readable. Everything below is read from that structure, so it says *what systems exist and what they are
parameterised by*, not their exact numbers. Numbers have to come from playing it.

### 2.1 Level generation — two generators
- **Tile maps** (the main one). A maze is carved over a square grid as a **spanning tree** from a start cell (seeded),
  so every cell is reachable by exactly one route and there are no flat open fields. Each tree node then gets a
  **height**, walking out from the start: parameters are *volatility*, *slope strength*, a *centre-height target*, a
  *flat-map bias* and a choice of **bias curve (Gaussian or linear)**; there are two interchangeable height strategies.
- A cell is a **flat tile or a slope tile** (slopes join two heights). Where neighbours differ in height and are not
  joined, **wall and fill pieces** close the gap (flat walls, slope-to-flat, slope-to-slope, crosses), so the mesh is
  watertight. The map's rim is one of **island, walls or trees**.
- Flat tiles are drawn from a **set of hand-made tile prefabs per stage** with a *populate ratio*, so a generated layout
  is dressed with authored set pieces.
- **Scatter**: lists of random objects, each with a count, a clearance radius, a scale range, a **maximum slope angle**,
  and "align to the ground's normal". Shrines and other interactables are placed by the same pass. Then a spawn portal,
  a boss portal, grass in chunks, water, a minimap mesh.
- **Noise maps** (the second type): Perlin height field with a **falloff map** (an island), meshed with level of detail.
- A separate grid helper builds a **random path of a set length** out of a spanning tree (for things that follow a route).
- Stages: three themes (forest, desert, hell), each with its own events.

### 2.2 Jumping and movement — the heart of it
- A **physics-body controller**, not a kinematic one, stepped on its own fixed tick.
- **Air control is Quake / Source style**: the same "air accelerate toward the wished direction, up to an air cap"
  routine those engines use. That is what makes strafing in the air *gain* speed and makes the movement feel skilful.
- **Every surface is classified by its angle**: floor, slideable, surf, wall, roof. Each class has its own rules.
  A steep slope is **surfed**, not climbed; a moderate one can be **slid** down for speed.
- **Crouch-slide** with a slide force and a speed threshold; a jump out of a slide keeps the speed.
- **Aerial jumps** (a count that resets on landing), coyote time ("left ground at"), jump buffering counters.
- **Counter-movement**: friction applied against the velocity component you are not holding, per **surface type**
  (ice, mud …), per character.
- **Extra gravity** on top of the engine's, per character, so jumps are snappy rather than floaty.
- **Rails** to grind (splines; you can jump off after a short lockout), **wall climbing / wall running** (an unlockable
  passive), **bounce pads**, **rocket-jump pushes**, **water** with swim speed, **tornadoes**.
- **Landing**: fall speed drives a camera bob / shake and landing dust; fall damage unless you "break the fall" within an
  angle window (land on a slope or slide).
- **Enemies are physics bodies too**: grounded checks on an interval, knockback with a cap (lower for bosses), climbing,
  dashes, flyers with an offset. They can be knocked off ledges.
- **Camera**: third person behind the character, an offset that zooms out with speed, **objects between camera and
  character fade**, bob on landing, a death camera, FOV and zoom settings.

### 2.3 How skills are upgraded
- Two things level up: **weapons** and **tomes** (27 passive books: damage, agility, cooldown, quantity, size, luck …).
- A level-up offers a few choices. **Each offer rolls a rarity** (Common → Legendary) from weights shifted by **Luck**.
- An upgrade is **not a fixed next level**: it is a few **stat modifiers drawn from that weapon's own list**, scaled by
  the rarity's multiplier. Modifiers are additive, multiplicative or flat. So two copies of a weapon grow differently.
- The offer screen has **refresh, skip and banish**.
- Upgrades also come from the world: **charge shrines** (stand in them), **greed, cursed, challenge, magnet and balance
  shrines**, a Moai (a luck gamble), a shady merchant, a "microwave" (duplicate an item), and **three kinds of chest**.
  All of them reuse one offer window.
- Tomes have **synergies** shown in the UI.

### 2.4 How characters read in 3D
*Owner, 2026-11-11: in play, Megabonk's own character is a model and its enemies are 2D sprites in the 3D world. The
structure read here could not settle that either way (it shows mesh-frame animation classes and no sprite classes, but
not what the meshes are). The owner's eyes on the game are the authority. Our decision does not depend on it:
**2D sprites for the characters we play and for the enemies — think Doom, or Paper Mario.***

What the structure showed:
**Megabonk does not use 2D sprites.** The player is a rigged 3D model; enemies are 3D meshes animated by **swapping
whole pre-baked meshes at a low frame rate**, which is where its choppy, retro look comes from. Status effects tint the
material (freeze, stun, charm). Only small things turn to face the camera.

So "2D sprites in 3D like Megabonk" is two separate goals: Megabonk's **world, camera and movement**, with **our**
characters as sprites. That is our own look, closer to the "HD-2D" family, and it has problems Megabonk never had to
solve (2.5).

### 2.5 What it takes to make sprites hold up in that world
- **Eight directions, camera-relative.** Our sheets have 8 facing rows. The row is chosen from the character's facing
  *relative to the camera's yaw*, so walking around a Pokémon shows its side and back.
- **Upright billboards, not full billboards**: the quad turns around the vertical axis only, so feet stay on the ground
  when the camera pitches.
- **Grounding**: a soft blob shadow projected onto the terrain under every sprite, shrinking with height. Without it a
  sprite floats.
- **Depth**: sprites write depth with an alpha cut-off, so they sort correctly against terrain and each other.
- **Light**: sprites take the scene's light and fog as a flat tint (no normal maps), so a cave is dark and a lava floor
  glows on them too.
- **Scale by distance is real perspective now**, so a far enemy is small. Enemy silhouettes and a rim/outline keep them
  readable (Megabonk outlines too).
- **Low frame rate is an asset here**: PMD animations are a few frames each, which matches the mesh-swap look.

---

## 3. Where we must match it, and where we can beat it

| Area | Megabonk | Us today | The bar for the rebuild |
|---|---|---|---|
| Level generation | spanning-tree maze + height walk; slopes and walls; authored tile prefabs; scatter by slope | flat 120×120 zones with heights 0–3 as tags; Dive is one open cave | **Match**: tree-based layouts with real height, slopes, drops and set pieces. **Beat**: seeded and replayable (ours already are), four Dive biomes with their own generators' rules, and Pokémon-specific traversal built into the layout (surf channels, vines, bounce mushrooms) |
| Jumping | air-strafe physics, slide, surf, multi-jump, rails, wall-run, fall-break | hop / double hop / glide / slide / climb / surf as verbs on a flat plane | **Match** the physics model and the surface classes. **Beat**: each Pokémon's type changes its movement (a Flying type glides, a Water type surfs faster, a Ghost passes thin walls), which Megabonk only does per character in small ways |
| Skill upgrades | rarity-rolled stat modifiers per weapon; tomes; refresh / skip / banish; shrines | rarity level-ups and items exist (D5); moves are fixed upgrade ladders | **Match**: rolled, rarity-scaled modifiers per move, refresh / skip / banish. **Beat**: move **evolutions** and type reactions we already have, and tome-like held items with synergies |
| Characters in 3D | low-poly meshes, mesh-swap animation | 2D sprites, top-down | **Our own look**: 8-direction sprites in a real 3D world (2.5). The bar is that it never reads as paper cut-outs |

---

## 4. What "actually 3D" means for the code

The rules themselves move to three dimensions for these two modes. Classic keeps today's code untouched.

- **Position is (x, y, z).** Height is a real coordinate with gravity, not a tile tag with a sprite lift.
- **A new character controller** for players: velocity-based, fixed tick, the surface classes of 2.2, air acceleration,
  slide, multi-jump, coyote time and buffering. Written fresh; it does not call the 2D `verbs.js`.
- **Collision against a height field**, not a physics engine. Generated terrain is a grid of cells with a floor height
  (and optional ceiling), slopes between them and walls where they do not join. Ground height, slope normal and wall
  hits are computed directly from that grid: cheap enough for a phone and exactly reproducible, which a general physics
  engine would not be. Enemies use the same queries, on a slower interval, as Megabonk's do.
- **Enemies get height**: they fall, can be knocked off ledges, climb where their species can, and flyers hover.
- **Combat becomes 3D where it matters**: projectiles have height and arc; area attacks are cylinders or spheres;
  auto-aim prefers targets in view. Most of the move data (damage, cooldown, shape, size) carries over.
- **Rendering** is three.js (r165 is already vendored): terrain meshes from the generator, instanced upright billboards
  for every sprite, blob shadows, fog, and a third-person camera that fades what is in the way.
- **What carries over unchanged**: species, moves, items, the economy, capture, Megas, Ultimates, the meta progression,
  saves, boards.
- **What is rewritten**: terrain and floor generation, movement, enemy movement, the camera, all drawing, touch
  controls (a second stick or drag for the camera), the minimap (from the generated mesh).
- **Co-op, replays and spectating do not carry over.** They are their own section (4.1) and their own phase.

### 4.1 Multiplayer, replays and spectating (owner, 2026-11-11: "going true 3D will break these")

It will. Today's versions lean on things 3D removes:

| Today (2D) | Why it breaks | What 3D needs |
|---|---|---|
| Every entity is sent as (x, y) + a facing + an animation | no height, no vertical speed, no "in the air / sliding / on a rail" | (x, y, z), velocity, and a movement state per entity, or copies teleport and float |
| One shared top-down camera; a viewer sees what the host sees | each player and each viewer has their own third-person camera | the camera is local to each screen; a viewer picks whom to follow or flies free |
| The sprite's facing row is sent | the row now depends on *the viewer's* camera | send the facing as a world angle; each screen picks the row |
| Terrain is rebuilt from {seed, map, zone} by the 2D generator | a new generator | rebuild from {seed, generator version}; refuse a mismatch (as `DV` does today) |
| Guests draw copies of the host's enemies, updated a few times a second | 2D copies glide between updates and it looks fine | in 3D a copy must also fall, land and be knocked off ledges between updates: interpolate with gravity, snap on correction |
| A guest's own character is moved by the guest | still true, but a physics controller diverges fast | the guest stays authoritative for its own body (as now) and sends position + velocity + state at a higher rate; the host only checks it for nonsense |
| Relay messages are capped at 16,000 characters | every entity grows by a height and a state | a tighter packing (quantised integers), and send only entities near any player |
| Replays are position tapes (v2: per-entity differences, about 1.2 MB a run) | same idea, more per entity, and the camera is not recorded | tape v3 with height and state; the viewer's camera is free at playback. Size has to be re-measured and capped |
| Local co-op is 2–4 players on one top-down screen | a third-person camera cannot frame four people | either split screen, or a pulled-back shared camera for local co-op only: a design decision |
| Spectating draws from live snapshots with the 2D renderer | new renderer, new camera | a follow camera on the watched player, built on the same snapshot stream as co-op guests |

**Old recordings.** Shared replays expire from the server after 30 days and the local list keeps the last few, so 2D
Expedition / Dive tapes age out by themselves. Until then a tape made by the 2D version is refused with a clear
notice (the same check `DV` uses), unless we keep the 2D renderer just to play them back — see the decisions.

**Whether the transport holds.** Today co-op is peer-to-peer where it can be, with a polled relay through `/api/mp`
as the fallback, and spectating polls about once a second. That was enough for copies that glide. Third-person 3D is
less forgiving: at one update a second a watched player visibly teleports. Before building on it, measure what the
current paths deliver (rate, size, loss) with 3D-sized messages. If the polled relay cannot carry it, the options are
peer-to-peer only for 3D co-op, or new infrastructure (a Cloudflare Durable Object with WebSockets is the natural fit
for this stack). That is a backend decision with a cost, so it is measured first, not assumed.

## 5. Phases

| Phase | What | Proof before going on |
|---|---|---|
| **P0 feasibility** | One hand-built test room: three.js scene, a height-field floor with a slope, a ledge and a wall; the new controller with jump, air control and slide; one 8-direction sprite; 100 billboard enemies standing still. Behind `?m3d=1`, not linked from the menu. | **Phone profile holds 60 fps** with 100 billboards, and the jump feels right to the owner. If either fails, stop and rethink before building generators. |
| **P1 movement** | The full controller: surface classes, slide, multi-jump, coyote / buffer, fall-break, bounce pads, water. Keyboard, pad and touch. Type-based movement traits. | A movement test suite (deterministic: fixed tick, scripted inputs, asserted positions) and an owner feel pass. |
| **P2 generation** | The tree-and-height generator with slopes, walls, rims, set-piece tiles and scatter. Seeded. A minimap from the mesh. | Invariants test (every cell reachable on foot, no holes, spawn and exit apart, slope limits), 50 seeds hashed. |
| **P3 enemies and combat** | Enemies on the height field (ground checks, knockback off ledges, flyers); spawning around the player in 3D; moves, projectiles and areas in 3D; auto-aim. | Existing combat numbers reproduced on flat ground (a bot fight compared with 2D), then tests for height cases. |
| **P3n netcode** | The 3D entity format (position, velocity, state, world facing), interpolation with gravity for copies, the per-screen camera, tape v3, and a measurement of what today's peer-to-peer and relay paths can carry. Decide the transport. | Two browsers in a test room: a guest sees the host jump, slide and get knocked off a ledge correctly; a recorded run plays back; message and tape sizes are within the caps. |
| **P4 Expedition in 3D** | Classic and Survival Expedition on generated 3D maps: objectives, bosses, shrines, chests, the shop, capture. | The Expedition suites' state checks, ported; online co-op, spectate and replay working on P3n's format. |
| **P5 upgrades** | Rarity-rolled modifiers per move, refresh / skip / banish, shrine variety (2.3). Can ship in 2D first: it does not depend on 3D. | Balance bot before and after; owner playtest. |
| **P6 Dive in 3D** | Dive rebuilt as rooms and doors (the old D2) on the 3D generator: a combat room locks until cleared, then offers 2–3 doors; boss rooms; a camp between dives. D0's marker and D1's numbers carry over as design. | Dive suites ported; the difficulty bot re-run; co-op, spectate and replay for Dive. |
| **P7 polish to the bar** | Camera feel (speed zoom, landing bob), landing dust, outlines, fog and lighting per biome, sound. Then 3D becomes the default for both modes. | Side-by-side with the bar, by the owner. |

The 2D Expedition and Dive stay playable until P4 and P6 replace them, then are removed (Classic keeps the 2D engine).

## 5.1 P0: built (2026-11-11)

`/micasurvivor/m3d/` — a test room, not linked from the menu (`?n=` the crowd, `?dex=` who you play).

- **The rules** (`micasurvivor/m3d/sim.js`, pure: no browser needed): a height-field room; a velocity controller with
  ground friction and acceleration, air control with an air cap, a jump with a faster fall, a short hop on a tap, one air
  jump, coyote time, a jump buffer, steps walked up, walls slid along, floor slopes, a chute too steep to stand on, and a
  crouch-slide that a jump keeps the speed of. Deterministic to the last bit.
- **Drawing** (`render.js`): the terrain as one unlit mesh; sprites as upright billboards, one instanced batch per sheet,
  the facing row picked per sprite from the camera's side; blob shadows on the floor; fog; a third-person camera that
  pulls in rather than pass through terrain.
- **Input**: keyboard, controller, and touch (a left-thumb stick, a right-thumb camera drag, JUMP and SLIDE buttons).
- **One change from the bar, found by test**: pure Quake air control (an air cap about a tenth of the run speed) cannot
  get a standing jump on to a ledge it is pressed against. The air cap is 3 m/s here (run speed 7): a turn in the air
  still never costs speed and holding straight on still adds none, but a standing jump can be steered.

**Question 1, performance.** Measured in headless Chrome at a phone's viewport (844 × 390, pixel ratio capped at 1.5)
with the CPU slowed 4×, running, jumping and turning the camera throughout:

| Crowd | This PC's GPU (AMD integrated) | Software rendering (no GPU at all) |
|---|---|---|
| 100 sprites | 16.7 ms median, 17.0 p95 | 16.7 median, 16.8 p95 |
| 300 sprites | 16.7 median, 17.0 p95 | 16.7 median, 16.8 p95 |
| 1,000 sprites | 16.7 median, 17.1 p95 | 33.3 median, 50 p95 |

13 draw calls whatever the crowd (one per sprite sheet); the rules cost under 0.6 ms a frame. That is a pass on
everything that can be measured here. **It is not a phone**: a real device's GPU, fill rate and heat are untested, and
that check is the owner's — open the page on the iPhone and read the frame time in the corner.

**Question 2, the feel of the jump.** Only the owner can answer it. Every number is in `K` at the top of `sim.js`.

Not in P0: the object-in-the-way fade (the camera pulls in instead), outlines, rails, wall-running, surf, enemies that
move, combat, generation.

## 5.2 P1: built (2026-11-11)

The full controller, in the same test room (`/micasurvivor/m3d/`; `?dex=` picks who you play, `?types=` tries any types).

- **Surfaces.** Ice: slow to start, slow to stop, slow to turn. Mud: 60 % top speed, stops you quickly.
- **Bounce pads.** 4.8 m up, higher with jump held; they give your air jumps back.
- **Water.** Wade in the shallows (80 % speed); swim where the bottom is out of reach (55 %, floating at the surface);
  slide dives, jump rises, a jump at the surface leaps out; the shallows walk you back out.
- **Slopes.** A slide feels them: it runs away downhill and bleeds uphill. A fast slide up a ramp launches off its
  crest; a run does not; steps never do.
- **Landings.** A fall of about 3.4 m or more staggers you for 0.35 s (slowed, no jump) unless you break it: hold slide
  as you land (you come out sliding, faster), land on a slope (it carries you downhill), or land in water.
- **Type traits** (`TYPE_TRAITS` in `sim.js`, first guesses): Flying two air jumps and a glide · Dragon two air jumps ·
  Fairy a glide · Water swims at a run · Ice ignores ice · Ground ignores mud and never staggers · Rock and Steel never
  stagger, jump a little lower · Ghost floats down and never staggers · Electric runs faster · Fighting jumps higher ·
  Fire a bigger slide kick · Psychic steers more in the air · Bug and Grass climb a higher lip. A dual type gets both.
- **Camera.** Left alone for a moment it swings round behind the way you run, so one thumb can play; any camera input
  takes it back; `?follow=0` turns it off.

Found by the tests while building it: mud's first numbers gave a third of the intended top speed; a rounding error in
the height grid stopped you stepping out of the pool (heights are stored exactly now); a slide's own friction cancelled
the slope's pull, so sliding downhill gained nothing.

Not in P1 (decision 3, later): rails, wall-running, surfing a steep slope under control. Ceilings do not exist in a
height field, so there are no roofs to bump.

Tests: `micasurvivor_m3d_moves_test.mjs` (node, 53 checks), and the page test covers traits, the follow camera and the pool.

## 5.3 P2: built (2026-11-11)

Level generation (`micasurvivor/m3d/gen.js`), playable at `/micasurvivor/m3d/?gen=<seed>` (`&biome=meadow|peaks|marsh`,
`&size=3..8`). Seeded and pure: a seed and a biome always build the same level, so a replay, a co-op guest or a
spectator needs only those two values.

- **The plan.** A square of tiles (5 × 5 by default, 14 m each). A spanning tree from the start tile makes every tile
  reachable; a few extra links make loops. Walking out from the start, each tile keeps its parent's height level or
  moves one (1.5 m), pulled toward a target shape (a hill, or a cone).
- **Joins.** Linked tiles at one level are open floor; a level apart, a ramp three cells wide (20.6°). Unlinked tiles
  meet at a cliff (drop off it, do not climb it) or, at the same level, sometimes a ridge.
- **Set pieces**, one a tile: blocks one jump high (and some too tall to jump: double-jump or bounce), a pond with a
  deep middle, ice, mud, a bounce pad, a mound. Small decorations are scattered on plain floor.
- **Spawn and exit.** The exit is the tile farthest from the start along the links, never fewer than two tiles away.
  It is a column of light, and a ring on the minimap. Reaching it loads the next seed.
- **The check** (`validate`). Every level is checked before it is returned: every tile and the exit reachable on foot
  with no jump, nothing you can walk into that you cannot walk out of, no holes, no slope too steep to stand on. A
  level that fails loses its ridges, then its set pieces, until it passes. No level in 600 has needed that.
- **Biomes** (first guesses): meadow (three levels, a bit of everything), peaks (five levels, ice, bounce pads),
  marsh (two levels, ponds and mud).
- **The minimap** is drawn from the level's own cells, so it cannot disagree with it.

Found by the tests while building it: the farthest tile along a winding route could be right beside the start (the
exit must now be two tiles away as the crow flies); a pond's bank beside a ramp could not be climbed, because stepping
out of water onto a rising ramp is more than a step for a body with a radius (the check now measures a body, not a
point, and banks beside ramps stay dry).

Not in P2: enemies and pickups placed in a level (P3), art for the biomes beyond flat colours, levels bigger than
8 × 8 tiles, Dive's rooms-and-corridors layout (P5).

Tests: `micasurvivor_m3d_gen_test.mjs` (node, 35 checks: 50 pinned fingerprints, the invariants over 150 levels, the
real controller walking 60 levels spawn to exit without a jump), and the page test covers `?gen=`, the minimap and
the exit.

## 5.4 P3, first part: built (2026-11-11)

Enemies and combat on the height field (`micasurvivor/m3d/actors.js`, `combat.js`), playable at
`/micasurvivor/m3d/?gen=<seed>&fight=1` (`&moves=ember:3,tackle` picks moves as id:level; R restarts the level).
Pure and seeded like the rest; it reads the 2D game's own data (moves, type chart, enemy tiers, species, sprite sizes),
so there is one set of numbers.

- **The proof the plan asked for.** `micasurvivor_m3d_parity_test.mjs` plays the same fight twice in one page: by the
  2D game's own combat code and by the 3D rules on flat ground. Hits, damage and HP lost match to the point for a
  shot, a swing (shove included), a beam, an aura, a chain, a ring of shots, orbs, piercing through three types,
  poison, and an enemy's touch.
- **Enemy bodies.** Walkers cannot climb what you cannot walk up, go round by ramps, drop off ledges to reach you,
  float across ponds. Flyers (the 2D game's own list of who hovers) go straight over everything but the rim.
  Finding the way is one flow field from your cell, shared by every walker.
- **What height changes.** A shot is a ball at chest height, aimed up or down at its target, stopped by terrain. A
  swing, an aura and an enemy's touch reach about 1 m up or down: jump over a ground enemy and it cannot touch you;
  the ledge above is out of a Tackle's reach. A beam is cut where it meets the ground. The auto-aim takes the nearest
  enemy you can see before a nearer one behind a wall. Knockback is a real shove: off a ledge, the body falls.
- **Arrivals.** The 2D rate and cap (110), but placed 16-32 m from you on floor an enemy can walk to you from: the
  rules no longer read the camera.
- **Cost.** A tick with 110 enemies is about 0.1 ms in node.

Departures from 2D, on purpose: orbs circle in a true circle (2D flattens the orbit to 70 %; the parity test sets the
2D shape); your run speed is the 3D controller's, not the species' 2D speed.

What was left after this part is listed under 5.5.

Tests: `micasurvivor_m3d_parity_test.mjs` (Chrome, 22 checks), `micasurvivor_m3d_combat_test.mjs` (node, 35 checks),
and the page test covers `&fight=1`.

## 5.5 P3, second part: built (2026-11-11)

- **All 15 of the base game's move kinds.** Added: buff, boomerang, cone, mine, meteor, turret, dash, trail (and
  homing shots). In 3D: a dash stops a body's width short of a wall and carries you off a ledge; a mine, a patch and
  a meteor's blast only catch bodies on their own level; a turret shoots up or down at its target; a boomerang
  comes home to where you are now.
- **The four control states.** Freeze (1.8 s, +25 % damage taken, it stands still), sleep (4 s, +30 % and the hit
  wakes it), paralysis (3 s, 40 % speed, slower to touch, +35 % from Electric), confusion (3 s, it weaves into its
  neighbour and hits it). A move's own chance to cause one is rolled from the fight's seed.
- **Buffs.** Attack, speed (you run faster), defence and regeneration stack and run out as in 2D.
- **The comparison with 2D** now covers these too (37 checks). Where the 2D game rolls dice for a position or a
  speed (cones, a turret's spot, the spare meteor, mines) totals are compared within a margin; mines over thirty
  runs a side. Building it showed the 2D map itself changes a fight: rocks and grass round the player stop shots,
  differently every run. The comparison now empties the 2D world first.

**Still to do in P3:** Expedition's eight move kinds (lob, homing, barrage, smite, vortex, wave, spin, weather);
abilities and held items; enemy behaviours other than chase (chargers, ranged, bombers, healers …) and enemy shots;
bosses; XP and level-ups; damage numbers and hit effects. Move names on the test page are the data's ids.

Tests: parity 37 checks, combat 52 checks, the page test 57.

## 5.6 P3, third part: built (2026-11-11)

- **Enemy behaviours** from the 2D game's own table of who does what: chargers (stop 200 units out, aim 0.55 s,
  come through at 3.4 × speed), ranged enemies (walk into range, hold their distance, back off when you close in,
  shoot), fans of shots, beamers and zoners (a mark on the ground that goes off after a delay, through your moment
  of grace), bombers (a fuse, and they go with the blast), runners (they go where you are going). Healers,
  shielders, summoners and jumpers chase until they are ported.
- **What height changes.** A ranged enemy must see you to hold its ground and shoot; with a wall between you it
  comes round instead. Its shot stops at terrain and passes under you when you are high in a jump. A mark on the
  ground reaches about 1.2 m up: jump clear of it, or stand on the ledge above it. A charger only takes aim at you
  on its own level, and its charge can carry it off a ledge. A bomber on the ledge above does not light.
- **The comparison with 2D** covers them (46 checks): time to the first hit, HP lost and where the enemy ends up
  match for a charger, a ranged enemy, a fan, a beamer, a zoner and a bomber.
- **On the page:** enemy shots, warning marks that flash when they go off, and damage numbers over each hit
  (`&cast=58,43,32,63` picks who arrives).

One limit found: a 3D walker follows the level's cells beyond 14 m and only runs straight at you inside that, so
on open ground it arrives a little later than a 2D enemy from far away.

**Still to do in P3:** Expedition's eight move kinds; abilities and held items; healers, shielders, summoners,
jumpers; bosses; XP and level-ups (with P5's upgrade cards).

Tests: parity 46 checks, combat 64 checks, the page test 59.

## 5.7 P3, fourth part: built (2026-11-11)

- **The last four enemy behaviours**, so every behaviour in the 2D game's table is in the 3D rules: healers (7 % of
  a hurt neighbour's HP a cast), shielders (30 % of HP as a shield for the nearest five for 7 s, none again for
  14 s), summoners (four minions a cast, eight of their own at most, twenty on the map), jumpers (a crouch, an arc,
  and a marked landing where you were).
- **What height changes.** A jumper leaps UP onto the ledge you are standing on: the first enemy that does not need
  a ramp. Healers and summoners do their work without seeing you, but only stand off when they do. Minions never
  appear inside a wall.
- **The comparison with 2D** covers them (51 checks): the HP a healer restores, what a shield soaks up, a
  summoner's minions and their numbers, a jumper's landing.
- **Standing sprites** no longer float over their shadow (each standing frame is put on its own lowest pixel).

**Still to do in P3:** Expedition's eight move kinds; abilities and held items; bosses; XP and level-ups (with P5's
upgrade cards).

Tests: parity 51 checks, combat 74 checks, the page test 62.

## 5.8 P3, fifth part: built (2026-11-11)

- **Experience.** A fallen enemy leaves an orb where it stood (a big one for 20 XP or more), and now and then a
  berry (30 % of your HP), a magnet (calls every pickup to you) or a bomb (60 + 14 a level to everything within
  30 m). An orb within your reach (78 units, 4.9 m) flies to you. Reach is measured in space: an orb on top of a
  4 m wall is out of it from the floor beside the wall. The level curve is the 2D game's.
- **Level-ups.** The fight waits while three cards are on offer: a new move from your species' pool (while one of
  your four slots is free), the next level of a move you have, or a permanent upgrade (the 2D game's nine: Vigor,
  Power, Sprint, Reflexes, Armour, Synthesis, Magnet, Learning, Sitrus Berry, with their limits). Offers are drawn
  from the fight's seed. On the page: click or tap a card, or press 1 / 2 / 3; `&auto=0` takes the first one.
- **The comparison with 2D** (55 checks): the cost of each of the first 60 levels, your reach, how long an orb
  takes to reach you, what 2,000 XP makes of a level-1 player.

Not carried over yet: move evolutions, the Calibre (size) upgrade, tickets and coins, Expedition's own XP curve.
P5 replaces these cards with rarity-rolled ones and adds refresh / skip / banish.

**Still to do in P3:** Expedition's eight move kinds; abilities and held items; bosses.

Tests: parity 55 checks, combat 98 checks, the page test 65.

## 5.9 P3, sixth part: built (2026-11-11)

- **Bosses.** The 2D game's five boss times (3:00 to 15:00) with its numbers: HP, damage and XP per slot, scaled
  by the clock, drawn up to twice as big with a body to match. Each boss has four attacks chosen from its species
  and types: a stomp, a charge or a leap, and two of rain, beams, a volley, a ring of shots. All are marked on the
  ground first. It alternates between closing in and fighting from a distance, and under half HP it is enraged:
  15 % faster, shorter waits, sometimes two attacks in a row.
- A hit does not shove a boss. A state wears off sooner on it (35-50 % of the time) and it is then immune for 4 s.
  Down, it bursts into 14 big orbs with a berry and a magnet. While one lives, other enemies arrive at a quarter
  of the rate.
- **In 3D.** A boss goes over any terrain, as a 2D boss ignores walls: one that does not hover by nature keeps its
  feet on whatever is under it. Its stomp and its marks reach about 1.2 m up, so a timed jump clears them.
- **The comparison with 2D** (64 checks): each of the seven attacks lands at the same moment for the same damage.
- **On the page:** `&boss=143` puts one in at the start; `&bosses=143,130` sets who arrives at 3:00, 6:00 …

Not carried over: the Dynamax den's Max Move, a boss's coins, item and ticket drops, shiny bosses.

**Still to do in P3:** Expedition's eight move kinds; abilities and held items.

Tests: parity 64 checks, combat 109 checks, the page test 66.

## 5.10 P3, seventh part: built (2026-11-11)

- **Expedition's own move kinds**, seven of its eight: lob (a bomb in an arc), homing shots, barrage (quick shots in
  a row), smite (a strike from the sky), vortex (a whirl that drags enemies in and grinds them), wave (a ring
  spreading from you), spin. All 14 of the moves that use them work (`&moves=mud-bomb,sky-attack,whirlpool,surf`).
- **In 3D.** A lob and a smite reach a target behind a wall, which no straight shot can: they are the answer to
  cover. A wave and a spin stay on your level. A vortex cannot drag a body through a wall.
- **The comparison with 2D** (75 checks): each kind's damage over 10 s matches, and a vortex's pull.

Not carried over: the eighth kind, weather (rain, sun, sand, snow), which needs a weather system here; and
Expedition's move levels 1 to 8 with their rolled stats, which belong with P5's upgrades.

**Still to do in P3:** abilities and held items; weather.

Tests: parity 75 checks, combat 114 checks, the page test 67.

## 5.11 P3, eighth part: built (2026-11-11)

- **Weather** (sun, rain, sand, snow, fog) with the 2D game's numbers: it fades in and out over 3 s, strengthens
  and weakens types (rain: Water × 1.5, Fire × 0.5 …), snow slows whoever is not Ice by a tenth, and sand and snow
  wear down whoever is not of a safe type every 2 s: 2 % + 1 of an enemy's HP (never a boss), 1.2 % of yours (never
  to nothing). From 2:00 a check every minute has an 18 % chance to start one for 55-75 s, weighted by biome.
- **Expedition's eighth kind**, weather moves (Rain Dance, Sunny Day, Sandstorm, Snowscape): all eight are in now.
- **The comparison with 2D** (78 checks): Water Gun in the rain with the fade-in, a sandstorm on a Rattata, a
  Geodude and you, Rain Dance.
- **On the page:** the weather's tint over the screen and its time left on the readout (`&weather=0`: none).

Not carried over: weather particles (rain streaks, snow), and the abilities that make you immune to sand or snow.

**Still to do in P3:** abilities and held items.

Tests: parity 78 checks, combat 124 checks, the page test 68.

## 5.12 P3, ninth part: built (2026-11-11)

- **Abilities.** One passive for each species, read from the 2D game's table (57 abilities). 30 kinds of effect are
  in the 3D rules: damage (flat, by type, by kind of move, with your own type, under 40 % HP, on a boss, on a
  resisted hit, Moxie's steps, Defiant's 4 s), damage taken (flat, by type, super-effective, the first hit every
  25 s halved, Sturdy), what touching you costs (Rough Skin; a chance to burn, poison, paralyse, confuse, put to
  sleep), speed (flat, and in your weather), cooldown, reach, XP, crit, regeneration, immunity to sand and snow.
- **The comparison with 2D** (92 checks): fourteen abilities set on both sides, by damage dealt, HP lost and what
  is left of the enemy.
- **On the page** a fight uses your species' own ability (`&ability=0`: none; `&ability=hugepower`: that one).

Not carried over: coin bonuses, trap immunity and immunity to states (nothing in the 3D rules puts a state on you
or sets a trap yet).

**Still to do in P3:** held items.

Tests: parity 92 checks, combat 147 checks, the page test 68.

## 5.13 P3, tenth part: built (2026-11-11). P3 is complete.

- **Held items.** The 2D game's 26. What an item changes for good (damage, cooldown, speed, armour, crit, XP,
  regeneration) is applied by the 2D game's own code for it. The rest act where they should: Choice Band (your
  first move + 40 %, the others - 20 %), Life Orb's cost, Shell Bell, Expert Belt, a type gem, Light Ball, Thick
  Club, Silver Powder, Wide Lens, Big Orb, Rocky Helmet, Eternal Ice, Sitrus Berry, Focus Sash, Weakness Policy,
  Safety Goggles, Pure Incense.
- **Calibre**, the upgrade that makes your shots, orbs and areas 12 % bigger a step, is in, with the level-up card.
- **The comparison with 2D** (108 checks): sixteen items held on both sides, by damage dealt, HP lost and gained,
  and what is left of the enemy.
- **On the page:** `&items=lifeorb` (any number; the 2D game holds one).

Not carried over: Amulet Coin (no coins here), Heavy Boots (no traps), Rare Candy (an instant pickup), and how an
item is FOUND (a boss's drop, a chest): that is P4's.

**P3 is done.** Everything the 2D game's combat does is in the 3D rules, checked against the 2D game itself, except
what belongs to later phases: move evolutions and Expedition's move levels (P5), coins, tickets and item drops
(P4), Megas, Z-moves, Dynamax and Ultimates (P4 / P6), co-op and replays (P3n).

Tests: parity 108 checks, combat 168 checks, the page test 69.

## 5.14 P3n, first part: built (2026-11-11). Watching and replays.

What a fight looks like to someone who is not running it (`micasurvivor/m3d/net.js`), and a test room to prove it:
one tab hosts (`?gen=7&fight=1&host=me`), another watches (`?watch=me`), a third plays a tape.

- **The frame.** The fight at one instant as whole numbers: you (place in centimetres, speed, a world facing, what
  you are doing, HP, level), every enemy (id, species, place WITH height, facing, HP, in the air or not, size),
  everything drawn as a ball (shots, orbs, pickups, mines, turrets, bombs), the weather, and the fight's own events
  since the last frame (a swing's arc, a beam, a blast, a warning mark, a damage number). The camera is not in
  it: each screen has its own. Frames go out ten a second, a whole one each second and differences between.
- **Watching.** The watcher draws the fight a moment in the past (about 0.2 s), between two frames. You are drawn
  from where you were AND how fast you were going at both frames, so a jump is your own arc; an enemy in the air
  at either frame is drawn on the arc gravity gives it. Measured against the truth at every tick: you within 15 cm
  through a jump and a fall off a ledge (the worst is the tenth of a second you take off or land in), an enemy
  shoved off a ledge within 25 cm.
- **A tape (v3).** A header that rebuilds the level (seed, biome, size, who played) and five frames a second, a
  whole one every five seconds. A 2D tape (v2) is refused by its version. A page plays it with a free camera.
- **The watcher** simulates nothing, learns the level from the host's first whole frame and loads it, and loads
  the sprites of whatever species walks into view.

**Sizes, measured** (node, the cap's 110 enemies on screen):

| What | Size | Against |
|---|---|---|
| one whole frame | about 4,000 characters | the relay's 16,000 a message |
| a second live (10 frames) | about 34,000 characters (33 KB/s) | peer-to-peer: no cap; fine |
| one relay message a second (you in all 10 frames, the enemies in 2) | about 9,500 characters | under 16,000 |
| a ten-minute tape, gzipped | about 2.8 MB (27 KB for its quiet first minute) | 3 segments of the server's 1.2 MB |

**What that says about the transport.** A jump that happens between two frames a second apart is simply missing
(measured: seen 0 m, really 1.58 m). So the relay, which carries one message a second, cannot send one frame a
message; but it CAN carry a second's worth in one message, with you ten times and the enemies twice, and a
watcher fed that sees the jump whole. Spectating over the existing relay is therefore possible, a second or so
behind. That is fine for watching. It is not fine for playing together: a co-op guest needs the host's enemies
within a few hundred milliseconds, which is peer-to-peer or a new backend (decision 8 stands, now with numbers).

**Still to do in P3n:** co-op itself (a fight with more than one player in it, each moving their own body); the
real carriers (peer-to-peer and the relay through `/api/mp`) in place of the test room's; joining the site's
spectate and replay screens; the local-co-op camera (decision 7).

Tests: `micasurvivor_m3d_net_test.mjs` (node, 21 checks), `micasurvivor_m3d_watch_test.mjs` (Chrome, three windows,
21 checks).

## 5.15 P3n, second part: built (2026-11-11). Playing together.

Co-op in the rules (`micasurvivor/m3d/coop.js`) and in the test room: one tab hosts (`?gen=7&fight=1&host=me`),
another joins (`?join=me&dex=4`) and plays in it.

- **Who decides what** is the 2D game's rule, kept. The host: the enemies (arriving, moving, their HP, their going
  down), what lies on the floor, the team's experience and level, the weather, the clock. Each player: their own
  Pokémon — where it is, its HP, its moves, and what hits it. A guest's hits on enemies are sent to the host,
  which applies them.
- **A guest** fights copies of the host's enemies, drawn a moment in the past between the host's frames, with its
  own body and moves real and immediate. Enemy shots and marks on the ground are made on the host and fly / go
  off on the guest's side. **The host** has a puppet of each guest: a body its enemies can go for, moved by the
  guest's reports ten times a second and carried on by its speed between them.
- An enemy goes for the nearest player standing. Pickups go to whoever is nearest; the experience is the team's.
  A level-up puts three cards up for every player (each their own), and the fight waits until all have chosen.
- With two players 75 % more enemies arrive and each has 30 % more HP (the 2D game's numbers), per extra player.
- A guest only needs the room's name: it learns the level from the host and loads it as its own Pokémon.

**Measured** (two players, a full fight): the host's messages average about 1,800 characters, a guest's about 65;
18 KB a second both ways. It still plays with 300 ms of delay each way (a guest still finishes what it shoots at
and is still hurt by what reaches it).

Not carried over yet: a downed player being revived, three and four players on the page (the rules take them),
the 2D game's "the host is away: everything stops" rule, and telling a guest it has lost the host.

**Still to do in P3n:** the real carriers (peer-to-peer and the relay through `/api/mp`) in place of the test
room's; joining the site's lobby, spectate and replay screens; the local-co-op camera (decision 7); and the
transport decision (decision 8).

Tests: `micasurvivor_m3d_coop_test.mjs` (node, 26 checks: a host and a guest through a delayed line),
`micasurvivor_m3d_coopplay_test.mjs` (Chrome, two windows, 15 checks).

## 5.16 P3n, third part: built (2026-11-11). Down and up, going quiet, three players, the relay's pace.

- **Down in a party.** A teammate standing beside you (56 units, about your own height) gets you up in 3 s at half
  HP, safe for 2 s; if they walk off, what they had done drains away at half the pace. Each player decides their
  own getting-up, as in 2D. With everyone down the host says so.
- **Going quiet.** A guest not heard from for 3 s is away: enemies stop going for it and nobody waits for it to
  choose a card. A host not heard from for 2.5 s stops the guest's fight ("waiting for the host") until it is
  heard again.
- **Three players** (a host and two guests) in the rules: each guest has the other two.
- **The relay's pace, on the page.** `&relay=1` makes a host send as the site's relay would carry it: one message
  a second holding that second's frames. A watcher of it sees a jump whole (1.57 m of 1.58 m) and runs between
  one and two and a half seconds behind; the biggest message in the test is far under the 16,000-character cap.

**What is left of P3n needs the site, and two decisions.** Everything that can be proved in the test room is
proved. Left: carrying these messages over the real lines (peer-to-peer signalling and the relay are actions of
`server/mp.mjs`, the live backend); the lobby, spectate and replay screens, which belong with P4 when Expedition
itself runs on these rules; decision 7 (local co-op on one screen) and decision 8 (peer-to-peer only, or a new
backend, for co-op).

Tests: co-op rules 38 checks, the watch test 25 (three windows, then two more at the relay's pace), the co-op
page test 15.

## 5.17 P4, first part: built (2026-11-11). A Classic Expedition run, start to finish.

`micasurvivor/m3d/expedition.js`: the run, pure and seeded, on top of `combat.js`. On the page:
`/micasurvivor/m3d/?exp=<seed>&map=viridian|mtmoon|cerulean&diff=normal|hard|nightmare`.

- **What a zone holds is the 2D game's own plan.** The module reads `G.ExpClassic.plan` (species, guardian,
  timeline), its `K` and the tier table: nothing is copied but the tier ranges. Change a number in 2D and 3D
  follows.
- **The run.** Three generated zones (7 x 7 tiles, 98 m a side; Viridian is meadow, Mt. Moon peaks, Cerulean Cape
  marsh) and the hand-made shrine (a walled grove, two ponds, stairs up to the pedestal). In each zone: find the
  altar, stand on it 3 s, beat the guardian, stand in the portal 0.8 s. The legendary at the shrine ends the run;
  so does going down alone. Splits, the result lines and the 2D game's score.
- **The altar** is a seeded pick among flat 3 x 3 places you can walk to, 26 m or more from where you arrive.
- **Pacing.** The trickle (four species, one more a minute), the per-zone floor on enemy strength, the cap, the
  final swarm at 10:00, guardians with HP from your damage and exhaustion, escorts on Hard and Nightmare.
- **The timeline's events**: alpha, swarm, stampede, flock, rock slide, elite wave, totem, summoner, roaming
  legendary.

**Where 3D had to decide.**
- There is no camera in the rules, so "just off screen" is a distance: arrivals 16-32 m away, a swarm 13-17 m, a
  herd starts 20 m behind you. The 2D game's flattened ovals are circles.
- A site counts you only on its own level (within 1.2 m of its floor): not from the ledge above, not mid-jump.
- A stampede runner is stopped by a wall or a ledge it cannot climb; a flock goes over everything.
- A rock slide's marks lie on the ground where they fall: jump and one misses you, as any mark does.
- Enemies that reach you shove you off an altar or a portal, as they shove you anywhere. Clear a space first.

**Not yet in P4**: the in-run economy and its interactables (balls, Meowth, Unown, altars, slots), capture (an
alpha still simply falls, leaving a berry), Expedition's own level-up cards and XP curve, the run's pay and
records, the Mt. Moon and Cerulean shrines' own looks, Survival, and co-op, spectate and replay of a run.

Tests: `micasurvivor_m3d_expedition_test.mjs` (76 checks, node: the Classic suite's state checks made of the 3D
run) and `micasurvivor_m3d_expedition_page_test.mjs` (14 checks: a whole run on the page).

## 6. Dive in 2D: built

**D0 — find the stairs (small; can ship first, on its own).** *Built 2026-11-11 (`overworld/tests/micasurvivor_dive_stairs_test.mjs`). As built: the stairs took their own orange mark, so the rocks and Meowth keep their gold; the HUD arrow comes up after 25 s on a floor, or at once when its boss falls.*
- The stairs get their own marker: a distinct shape and colour used by nothing else, larger, pulsing, drawn last so
  nothing covers it, with a rim arrow when off the minimap.
- Gold rocks and Meowth stop sharing the stairs' colour.
- The full map (M) shows the stairs and lists them in its legend.
- A HUD arrow at the screen edge points to the stairs once they are unsealed and most of the floor's foes are down
  (so it ends the wandering without replacing the exploring).
- Test: the marker is recorded on every floor, distinct from every other icon; the full map has it.

**D1 — make it bite (numbers and behaviour; no generator change).** *Built 2026-11-11 (`overworld/tests/micasurvivor_dive_difficulty_test.mjs`). As built:*
- *Numbers: HP x3.3 and damage x2.4 (Classic's); past floor 25 +3 % HP and +1.5 % damage a floor; one more stats tier from floor 40.*
- *Waking: 11 tiles, and a waking group wakes the groups within 9 tiles of it (one hop).*
- *Elites from floor 6: 8 % of plain foes, +0.8 % a floor up to 30 %; swift x1.4 speed, tough x2.4 HP or rage x1.55 damage; x2.5 XP; a ring in the affix's colour.*
- *Pressure: after 45 s on a floor a pack of 2-4 arrives 11-20 tiles from the nearest player, out of sight, every 14 s and 1.5 s faster each time (6 s at least; 40 foes at most). x0.3 XP, no loot. Not at the far entrance as first planned: the base game recycles a foe more than 1400 px from the players, so those packs never arrived.*
- *Healing: a berry bush heals a quarter (Classic keeps its half); a shrine heals half.*
- *The balance bot (it still runs for the stairs, 4 seeds): fresh profile floor 7.5 (was 9), half-upgraded 14.3 (was 19), maxed 20 (was 20-25). The alpha floors (5, 10, 15, 20) are where it falls.*
- *Not done: the group mix by AI type (ranged / charger / bomber by depth) is unchanged. `G.Expedition.DV` was not raised: replays are position tapes and co-op is host-run, so nothing replays old numbers. An elite's ring is drawn on the host's screen only; a co-op guest sees its size and feels its numbers.*
- *Still to do by hand: an owner playtest. The bot cannot tell whether fighting through a floor feels fair, only how far a rusher gets.*

*The plan as written:*
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

**D2 and D3 of the first draft** (rooms and doors; Dive in 3D) are now P6 above.

## 7. Decisions for the owner

1. ~~Sprites or models?~~ **Decided 2026-11-11: 2D sprites for the characters we play and for the enemies** (Doom, Paper
   Mario).
2. **Collision: our own height-field, or a physics engine?** Recommended: our own. It is what keeps a phone at 60 fps and
   keeps runs reproducible. The cost is that free-form geometry (overhangs, loops) is limited to what the grid can
   describe.
3. **How far to take movement tech.** Slide, multi-jump and air control are in P1. Rails, wall-running and surfing are
   each a real piece of work: in the first version, or later?
4. **Upgrades (P5) first?** It needs no 3D and would improve both modes now.
5. **Old 2D Expedition and Dive: remove once replaced, or keep as an option?** Recommended: remove. Two versions of two
   modes would double the testing.
6. **Old replays.** Refuse 2D Expedition / Dive tapes once the modes are 3D (they expire within 30 days anyway), or
   keep the 2D renderer only to play them back? Recommended: refuse, with a notice.
7. **Local co-op in third person.** Split screen, a pulled-back shared camera, or drop local co-op for these two modes?
8. **Transport.** If the measurement in P3n says the polled relay is not enough: peer-to-peer only for 3D co-op (no new
   backend, but it fails behind some networks), or a WebSocket backend (works everywhere, new infrastructure and a
   running cost)? No recommendation until it is measured.

## 8. Risks

- **Phone performance.** Real 3D with a hundred-plus billboards, fog and shadows on a phone browser. P0 exists to answer
  this first.
- **Feel.** Megabonk's movement is its identity and its numbers are not readable; ours has to be tuned by hand against
  the real game. This is the item most likely to land beneath the bar.
- **Scope.** This is a rebuild of two modes' moment-to-moment play, not a visual upgrade: months, not weeks.
- **Readability of sprites in 3D** (2.5): the paper-cut-out problem. Shadows, outlines and lighting are in from P0.
- **Touch controls.** A third-person camera needs a second input; the current touch layout has no room for it as is.
- **Multiplayer, replays and spectating are a rebuild, not a port** (4.1). The transport may not be enough for
  third-person 3D; that is unknown until P3n measures it, and the answer may be new backend infrastructure.
- **Dive's D0 and D1 code is replaced** by P6; the design carries over, the code does not.
