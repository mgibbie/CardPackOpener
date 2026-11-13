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

## 5.18 P4, second part: built (2026-11-11). Expedition's own level-ups.

`micasurvivor/m3d/explevel.js`. An Expedition run in 3D now levels as the 2D one does, not as the base game:

- **The curve** is Expedition's: 2 x (8 + 5.5 L + L^1.8).
- **A move has levels 1 to 8** (+8 % damage each), and each level-up card brings rolls (damage, cooldown, count,
  area, speed, duration, crit, status) sized by the card's rarity.
- **Rarity**: the 2D odds, with Rare and above gated by level, luck and zone.
- **Vitamins**: 21, three slots, ten levels. Every stat lands where it acts: damage by class and type, armour,
  HP, speed, cooldown, crit, regeneration, XP, reach, luck, projectiles, area, duration, status chance; in a
  fight, the dodge (never above 40 %), the shield (back 4 s after a hit), lifesteal, and the Cursed Incense.
- **The deal**: three cards from the run's own seeded stream, a move card always among them and first. With four
  moves, a rare swap card replaces your lowest-level move in place. With nothing left, Training.
- **The tools**: Refresh (2), Skip (2, pays 10 x zone of the run's money), Banish (1). On the page: F, G, B.

**The 2D game's functions are called as they are.** Card weights, rarity odds, the vitamins' table, how stats add
up and land on the player (`G.ExpItems.total` / `apply`), a move's levels and rolls (`G.ExpMoves.levelUp` /
`refresh`), which moves are physical (`G.ExpLeague.classOf`). Only the deal itself is written again, for this
module's player.

**One difference, until the League is here.** In 2D a run's four move slots are filled by the League member's
kit, so a new move only ever arrives as a swap. The 3D run has no League yet, so a free slot is offered a move of
your types (weight 6).

**A page bug fixed on the way**: with two level-ups waiting, taking the first card threw ("events is not
iterable") and the second set never came up. The page test now takes two levels at once; it fails with the fix
reverted.

**Not yet in P4**: the in-run economy and its interactables, the 60 items and their procs (they arrive with the
economy that hands them out), capture, the League's kits and evolutions, the run's pay and records, the other two
shrines' looks, Survival, and co-op, spectate and replay of a run.

Tests: `micasurvivor_m3d_explevel_test.mjs` (66 checks, node), the run suite 76, the page test 18 (was 14).

## 5.19 P4, third part: built (2026-11-11). The run's money, its items, and what a zone holds.

`micasurvivor/m3d/expeco.js` (the economy) and more of `explevel.js` (the items).

- **Money (₽)**: 0.2 a KO, 1 an elite or a summoner, 5 an alpha or a totem, 20 x zone a guardian; gold rocks; a
  Skip. The Nugget, the Amulet Coin and Gengar's greed multiply it. It is the run's own and is not kept.
- **What a zone holds** (the 2D list, 18 kinds): Poké Balls (paid, free, cursed), Meowth's stalls, the four Unown
  altars, the comet, the challenge altar, the cursed altar, Gengar's altar, Ditto, Hypno, cages, gold rocks,
  berry bushes, a slot machine. No button: you stand in a thing, as in 2D. A choice (a ball's items, Meowth's
  stall, Hypno) holds the fight.
- **The 60 items**: they stack to a cap and their stats add up with the vitamins'. The ones that do something
  do it: thorns, the Focus Band, Revive, Max Revive, the Revival Herb, Sitrus, the Weakness Policy, the Expert
  Belt, the Deep Sea Tooth, execute, flinch, the Relic Crown's time stop, and the four epic strikes (bolts, a
  solar strike, a ring of fire, a rift). An alpha and a roaming legendary leave one where they fall.
- **The curses**: a cursed ball, the cursed altar and Gengar's raise the enemies' HP and damage, the arrivals,
  the XP, the money and the cards in a ball, as in 2D.

**The 2D game's prices and tables are called as they are**: a ball's price, Meowth's list and the market's
heat, a cage's and a spin's cost, the reels and the pay table (`G.ExpEco`), the items' table and stats
(`G.ExpItems`).

**Where 3D had to decide.**
- A 3D zone is 98 m across, far smaller than a 2D one. Things stand 5 cells apart (3 for rocks and bushes; 2D: 8
  and 4), and a zone without room for all 43 gets as many as fit, the big ones first (42.8 of them on average over 180
  zones, never fewer than 37).
- A thing counts you only on its own level, as the altar does.
- An item's strike reaches what is near it on about its own level (2.4 m up or down).

**Not yet**: the comet's + 25 % Ultimate charge (no Ultimates yet); a guardian's base held item; Eviolite (it
needs the League); the fog of war, the zone map and the tips; Survival's respawns. And still of P4: capture,
the League, the run's pay and records, the other two shrines' looks, Survival, co-op, spectate and replay.

Tests: `micasurvivor_m3d_expeco_test.mjs` (109 checks, node), the page test 23 (was 18).

## 5.20 P4, fourth part: built (2026-11-11). Capture.

`micasurvivor/m3d/expcap.js`.

- **An alpha faints.** No hit takes it under 1 HP; at 1 HP it faints where it stands (its XP falls, the KO
  counts and pays) and an 8 s window opens. Left alone it comes round and leaves its prize (an item, a berry).
- **The throw.** Stand beside it 0.35 s, on its level: the Friend Ball goes out. No odds. The world holds for the
  cinematic (3.2 s: the throw, three shakes, the click).
- **Support Alphas.** It follows you for the rest of the run (through portals too), shoots the nearest enemy
  within 20 m every 1.25 s (9 x your attack, + 6 % a level; Fire burns, Poison poisons, Ice slows), and its first
  type gives a perk that adds up with your vitamins and items. Two at most: with two, you choose which to swap, or
  keep your team and take the prize.
- **Shinies.** The 2D odds (8 % a zone, more with luck and the Shiny Charm). It wanders 14-30 m from you, never
  attacks, flees after two minutes, and is caught the same way (a 10 s window). It does not join your team.
- A catch counts in the run's score (400).

The numbers, the perks, the shiny roll and the cinematic's phases are the 2D game's own (`G.ExpCap`).

**One line of the 2D game changed**: `G.ExpItems.total` now also adds a player's own `xperk` (stat -> value).
The 3D run puts its Support Alphas' perks there; a 2D player has no `xperk`, so 2D plays as before.

**3D's own**: a Support Alpha is not a body in the rules: it stands on whatever floor is under it and is never
blocked (as in 2D, where it ignores walls). Its shots are real shots: terrain stops them.

**Not yet**: the League's wild encounters (they need the League and its save), keeping a caught shiny in the
save, the Lab's third slot, the Master Ball. Still of P4: the League, the run's pay and records, the other two
shrines' looks, Survival, and co-op, spectate and replay of a run.

Tests: `micasurvivor_m3d_expcap_test.mjs` (43 checks, node), the page test 27 (was 23).

## 5.21 P4, fifth part: built (2026-11-11). The run's end, the other shrines, the held item.

- **Pay and medal.** A run's result now carries its pay in Pokémonedas (by KOs, zones, guardians, the win and
  catches, times the tier; nothing under a minute) and, for a won run, its medal (bronze for finishing; silver,
  gold, champion by the clock and the tier). The medal is the 2D function, called. The pay table is written out
  in `expedition.js`, because the 2D file it lives in (`meta.js`) brings the Lab and the save with it; a test
  loads that file apart and holds the 3D pay to the 2D function over 18 cases.
- **The other two shrines** have their own layouts, as in 2D: Mt. Moon's is a dry crater (rock pillars where the
  ponds were, crystals round it), Cerulean Cape's an island (a ring of sea round the grove). The dais, its stairs
  and the pedestal are the same on each.
- **A guardian's held item.** It leaves one of the 2D pool of seven base held items that your species can use
  and you do not hold. You hold one: the first is simply yours, a second asks whether to replace it.

**Nothing is saved.** Pay, medals, records and a caught shiny are worked out and shown, not written anywhere:
the test page has no account. Writing them belongs with putting the mode on the site.

**Still of P4**: the League (kits, evolutions, wild encounters), Survival, the fog of war and the zone map, and
co-op, spectate and replay of a run.

Tests: `micasurvivor_m3d_expend_test.mjs` (21 checks, node).

## 5.22 P4, sixth part: built (2026-11-11). The League.

`micasurvivor/m3d/expleague.js`. A 3D Expedition run can now be a League run, as every 2D one is (the page's
default: `?exp=1&dex=6` plays Charizard's family from Charmander; naming `&moves=` or `&league=0` gives the plain
run the earlier parts were tested with).

- **A member**: the species' family, from its first stage. That stage's HP, armour, attack and speed come from
  its real base stats; it has its role (healer, assault, defender, speedster) and its final stage's ability.
- **The kit**: one move to start, the others at Lv 2, 4 and 7. It owns the four slots: no new-move cards; a new
  move only comes as a rare swap, never a kit move. (This removes the difference noted in 5.18.)
- **A move's class**: a physical move on a special attacker (or the other way) is scaled down to its own stat.
- **Evolution** at the real level: the new stage's body, types and stats; HP back up to at least half, then 30 %
  more. With two or more targets (Gloom, Eevee's eight), that level's cards are the choice.
- **Maturity** at Lv 24 and 44 for a stage that evolves no further: + 12 % damage and max HP.
- **Eviolite** now works: its 15 armour while your stage can still evolve.

The roster (553 members), the kits, the evolution levels, the stat formulas and the roles are the 2D game's own
(`league.js`, `league-data.js`), read as they are.

**3D's own.** A body here does not run at its species' speed (how it moves comes from its types), so a stage's
speed is a factor on the run speed: 1 at the League's baseline of 105. When an evolution changes your types, how
you move changes with them: a Charmeleon that becomes a Charizard can glide.

**Not yet**: Mega Evolution; other members' kit moves on your cards; the wild encounters; the TM and Repertoire
upgrades; which members you own (every member can be played on the test page); a shiny's look. Still of P4:
Survival, the fog of war and the zone map, and co-op, spectate and replay of a run.

Tests: `micasurvivor_m3d_expleague_test.mjs` (34 checks, node), the page test 31 (was 27).

## 5.23 P4, seventh part: built (2026-11-11). Watching and replaying a run.

`micasurvivor/m3d/expnet.js`. P3n's frames carry the fight. A run has more that a watcher must have, and it
now travels with them as the run's **row**: the seed, map and tier; the zone, the altar's phase and charge, the
money, the zone clock; the boss and its exhaustion; what each of the zone's things is doing; who has fainted, the
ball in the air, your team; your League stage; the held item; whether the run is over.

- **The watcher builds each zone's level itself**, from the seed, and where the zone's things stand too: only
  their states are sent. Through a portal it builds the next.
- **The row is sent only when it changes** and stays until a new one comes (net.js's diff and patch). It is
  under 400 characters with a dozen things changed; a quiet second sends none.
- **On tape** it is recorded the same way, so a replay goes through the run as it happened: altar, guardian,
  portal, the next zone, a capture, an evolution.
- **Banners** (the guardian wakes, the portal opens, an item) reach a watcher as events.
- **On the page**: a tab opened with `?watch=<name>` on a hosted run (`?exp=1&host=<name>`) is sent to the run's
  page and shows it: the level, the things, the fainted, the ball, the team behind the player, the player drawn
  as the stage it is, the run's readout line. `&tape=1` records; `playTape` replays.

**Two things the watcher's screen had wrong, fixed** (seen in a screenshot, then pinned by checks): the test
room's decorative crowd was wandering through a watched run, and where the player's species was also one of the
crowd's, the player was not drawn at all (the crowd had filled that sprite sheet).

**Not yet**: co-op in a run (a guest's own items, level-ups and captures, and the host's say over the zone:
the 2D game's D11 rules), and the lobby and the screens to find a run to watch. Still of P4 besides: Survival,
the fog of war and the zone map.

Tests: `micasurvivor_m3d_expnet_test.mjs` (21 checks, node) and `micasurvivor_m3d_expwatch_test.mjs` (14 checks:
three windows, a player, a watcher and a replay).

## 5.24 P4, eighth part: built (2026-11-11). Two players in one run.

`micasurvivor/m3d/expcoop.js`, on P3n's `coop.js`. Who decides what is the 2D game's rule:

- **The host** has the run: the zone and its level, the altar and the portal, the guardian, the timeline, the
  zone's things, the money (the team's), the captures.
- **A guest** has its own League member: its stats, its kit, its level-up cards (the level is the team's, the
  cards its own, dealt from its own stream), its evolutions. It is told the run by the run's row and builds each
  zone's level itself.

What works: a guest fights in the run (its KOs pay the team); a party's run is tougher (arrivals x 1.75,
enemies x 1.3, a guardian x 1.82); **anyone** standing on the altar or the portal counts, so a guest alone
wakes the guardian and either player takes the team through the portal, both arriving in the next zone; the
fight waits for both to choose a card; a guest that evolves is the new stage on the host's side; the run ends
only when everyone is down, and a teammate still gets you up.

On the page: `?join=<name>&dex=9` on a hosted run (`?exp=1&host=<name>`). The guest is sent to the run's page.

**Three bugs found and fixed on the way** (each pinned by a check that fails without the fix):
- A KO finished by a guest's hit paid the team nothing: the pay was read from the tick's events, and a
  guest's hit lands between ticks. KOs are now kept until the run has read them.
- A guest arrived kilometres away: its arrival offset was its player number, which on the page is a large random
  one.
- A guest standing on the altar had its page reloaded by the test room's old "reached the exit" rule.

**Not yet**: a guest opening the zone's things, buying, or catching (the 2D game sends the guest a seed and it
rolls its own offer: its D11 messages), a guest's Support Alphas, more than the test room's transport (the
site's lines: decision 8). Still of P4 besides: Survival, the fog of war and the zone map, the lobby.

Tests: `micasurvivor_m3d_expcoop_test.mjs` (25 checks, node) and `micasurvivor_m3d_expcoopplay_test.mjs` (9
checks, two windows).

## 5.25 P4, ninth part: built (2026-11-12). Survival.

`micasurvivor/m3d/expsurv.js`: Expedition's other mode, an endless run on one map, on the same spawner, events
and bosses as Classic. On the page: `?exp=1&mode=survival`.

- **Milestones**: a boss every 5:00, every third a legendary (the map's own first), Mewtwo at 45:00 (it does not
  end the run). Each one down leaves an item and a berry (two items for a legendary) and a pact to choose.
- **Pacts**: nine boon-for-a-price pacts, three offered, one taken or none. The boon and its price are your
  stats; some prices fall on every enemy instead (more damage, more HP, more of them, more elites, tougher
  milestone bosses).
- **Phases** at 12:00 and 24:00: the next band of enemies. **Each 5:00 segment** has its own timeline of events.
- **Pacing**: half as many arrivals as Classic, each with 1.8 times the HP and XP.
- **Migration**: at 11:00, and every 11:00 after, a portal opens on the land's altar for 90 s (not while a
  milestone boss is up). Through it: a new land.
- **Deep wounds** from 30:00 (a heal is worth 4 % less a minute, never under a fifth) and the **Endless Night**
  from 45:00 (each new enemy 12 % more HP and 6 % more damage a minute).
- **Siege**: from 5:00, 20 s within 6 m of one spot starts one: your damage falls toward 30 % and a flock of
  five fliers comes every 8 s. Move on and it lifts.
- **Its own curve** above Lv 40, **its score**, and no win: the run ends when you go down.

The milestones, each segment's plan, the pacts and their offer, the night, the wounds, the curve and the score
are the 2D game's own functions (`survival.js`), called as they are.

**3D's own.** A new land is new ground: the 2D game comes back to the same three zones, here the land's number
seeds the level, so land 4 is zone 1's kind of land but not land 1's ground. The siege's 6 m is measured on
the ground.

**Not yet**: the hostile terrain (mud, brambles, quicksand, burning ground), the night's darkness on screen,
Mega bosses, Survival for a watcher or in co-op (its lands are not in the run's row yet), its records. Still of
P4 besides: a co-op guest opening the zone's things or catching, the fog of war and the zone map, the lobby.

Tests: `micasurvivor_m3d_expsurv_test.mjs` (59 checks, node), the page test 35 (was 31).

## 5.26 P4, tenth part: built (2026-11-12). A guest and the zone's things; a guest's catch.

A co-op guest now uses everything a zone holds, and catches, by the 2D game's rule: **the host sees it standing
there (its puppet), keeps the thing's state and pays from the team's money; what is a player's own goes to the
guest as a seed, and the guest rolls it from its own pool on its side.**

- Gold rocks and cages pay or cost the team; a berry bush heals whoever is hurt and standing in it.
- The three Poké Balls, the Unown altars (they charge for whoever is nearest), the comet, the challenge altar
  and its Great Ball, the cursed altar, Ditto, Hypno, the slot machine: the guest gets its own items or its own
  choice. A cursed ball's ghosts come round the guest.
- Meowth: the stall opens on the guest's screen with the host's stock and prices; a buy is asked of the host,
  the team pays, the item comes back.
- **A catch**: a guest standing by a fainted alpha (or shiny) is handed it. Its Support Alpha is its own, fights
  from its side (its shots are a guest's hits like any other) and gives it its perk. With its team full it may
  keep it: the prize then falls on the host's floor.
- A host and a guest can each be at a thing of their own at the same moment: each has its own stand clocks.

**A choice does not hold a party's fight.** Alone, a ball's choice stops the world; in a party it stays up while
the fight goes on, for the host and the guest alike (the 2D rule).

**Fixed on the way** (pinned by a check that fails without it): an item on the floor picked up by a guest was
credited to the host. A pickup now says who took it.

**UI direction (owner, 2026-11-12)**: 3D Expedition and 3D Dive use Micatro-style UI wherever possible. The test
page's readout and plain card buttons are placeholders; the real screens (menu, League picker, level-up cards,
the choices, the HUD, run-over, lobby) are to be built from Micatro's.

**Not yet**: a guest's Support Alphas on the other screens; a held item for a guest; Survival in co-op. Still
of P4 besides: Survival's hostile terrain, the fog of war and the zone map, Mega Evolution, wild League
encounters, the lobby, and the real screens.

Tests: the co-op rules 56 checks (was 25), the two-window page test 11 (was 9).

## 5.27 P4, eleventh part: built (2026-11-12). Survival's leftovers.

- **Hostile ground.** Every Survival land has up to 16 patches, in turn mud (slows to 60 %), brambles (3 % of
  your HP a second while you move), quicksand (slows to half and draws you to its middle) and burning ground
  (5 % a second). Mud is awake from the start, brambles and quicksand from phase 2, burning ground from phase 3.
  Your feet must be on it: a jump clears it. It never finishes you. The numbers and the kinds are the 2D game's.
  In 3D a patch is 1.6 to 2.8 m across its radius (2D: twice that) and they stand 5 cells apart, because a land
  here is far smaller.
- **The Endless Night on screen**: the picture darkens from 45:00, as the 2D night does.
- **Survival pays**: the 2D rule (60 a legendary milestone, 4 a minute survived, with KOs, bosses and catches,
  times the tier), held to the 2D function by a test. It paid nothing before.
- **A Survival run can be watched and replayed.** The run's row carries the land, the milestones, the portal's
  seconds, the run's clock and the siege; the watcher builds each new land itself, with its hostile ground.
- The run's first land is now built the same by every viewer (it was seeded one way by the run and another by a
  rebuild; a check found it).

**Still of P4**: Survival in co-op, the fog of war and the zone map, Mega Evolution, wild League encounters, a
guest's Support Alphas on the other screens, then the shipping path (the real, Micatro-style screens; saving).

Tests: Survival 74 checks (was 59), the row 26 (was 21), the run's end 23 (was 21), the page test 37 (was 35).

## 5.28 P4, twelfth part: built (2026-11-12). Survival together; a guest's team on every screen.

- **Survival in co-op**, by the 2D rule. The host has the clock, the milestone bosses, the timeline, the portal
  and the flocks. Each player has, on its own side: its pacts (offered from its own seeded draw), its siege
  (its own damage; the host sends the flock to whoever is under one), its wounds and the hostile ground under
  its feet. The team pays the price of everyone's pacts. Either player takes the team through the migration
  portal.
- **A guest's Support Alphas** are told to the host and ride in the run's row, so the host, the other guests,
  a watcher and a replay draw them behind that guest.

**Still of P4**: the fog of war and the zone map, Mega Evolution, wild League encounters. Then the shipping
path (the real, Micatro-style screens; saving).

Tests: the co-op rules 66 checks (was 56).

## 5.29 P4, thirteenth part: built (2026-11-12). The fog of war and the zone map.

`micasurvivor/m3d/expfog.js`. The 2D game's rule and numbers: the cells within 14 of where you have stood are
explored and stay explored; a thing of the zone (or a patch of hostile ground, or an enemy's dot) shows on the
map once its cell is explored, or while you are within 9 cells of it. A new zone starts dark.

- Each screen has its own fog: yours, a co-op guest's own, and a watcher's (it follows the player from when the
  watching began).
- On the page the minimap is all but black where you have not been, and **M** (or a tap on the minimap) opens
  the zone map: the same map, large, with a legend of what you have found and how much is explored.
- The altar's ring is always on the map, as the 2D game always points you to it.

A 3D zone is 49 cells across, so the 14-cell sight uncovers it faster than a 2D zone (15 % from where you
arrive). The numbers are kept as the 2D game's; the real map screen is to be built Micatro-style on the
shipping path.

**Still of P4**: Mega Evolution, and wild League encounters (they read which members your save says you have
met, so they come with saving). Then the shipping path.

Tests: `micasurvivor_m3d_expfog_test.mjs` (15 checks, node), the page test 41 (was 37).

## 5.30 P4, fourteenth part: built (2026-11-12). Mega Evolution.

In `micasurvivor/m3d/expleague.js`, with the 2D game's own data and numbers (`js/data/mega-data.js`,
`js/expedition/mega.js`): from Lv 40 a League member whose form has a Mega is offered it. That level's cards are
its Megas (Charizard: X or Y) and "Not yet" (asked again 5 levels on), and the fight waits for the choice.

- Once a run, for the rest of the run: the Mega's real base stats and types. The kit, the role, the ability and
  Maturity stay the member's. It cannot be hurt for 1.2 s.
- 3D's own: how a body moves comes from its types, so a Mega that changes type moves differently (Mega
  Charizard X is Fire / Dragon: it no longer glides as the Fire / Flying Charizard did).
- The order of a level's cards: a branch evolution, then the Megas, then the usual cards.
- The run's row tells a watcher (and a co-op guest) which Mega the player is.
- On the page: a Mega has no walking sheet, so it is drawn as its one battle sprite (the 2D game's art for it),
  cut to what is drawn, mirrored when it faces right, 1.12x the form's height.

Fixed on the way: what a card picked by hand says (an evolution, a Mega) was cleared by the run's next step
before the screen showed it.

Not covered: Megas as enemies (zone 3's and Survival's Mega elites), the Mega look of a co-op mate (a mate is
still drawn as its species), the 2D game's aura and emblem.

**Still of P4**: wild League encounters (they read which members your save says you have met, so they come
with saving). Then the shipping path.

Tests: `micasurvivor_m3d_expleague_test.mjs` 51 checks (was 34), the page test 44 (was 41).

## 5.31 The shipping path, first part: built (2026-11-12). A run's own screen.

P4's rules are built; what is left before a player can be sent to 3D Expedition is the path to the live site.
Its parts, in the order planned:

1. **A run's own screen** (this part).
2. The rest of the screens in the same look: a run's choices with their art, the zone map, the co-op party's
   bars, watching, a pause menu, touch controls.
3. The site's controls (`/site/` input, gamepad, the Games switcher) on the 3D page.
4. The way in: an opt-in "3D" choice in MicaSurvivor's Play flow (the member, the map, the tier, the mode).
5. What a run leaves behind: pay, records, medals and the League's progress in the save; wild League
   encounters come with it. A 3D score must be told from a 2D one on the server.
6. Live co-op and watching over the site's lines (decisions 7 and 8).

**This part.** `micasurvivor/m3d/runui.js` + `runui.css`: while a run is on the page (or one is watched), the
test room's readout gives way to a screen in Micatro's look (the palette, the m6x11 font, slate panels with a
lip and buttons that press down are the ones `css/mx.css` ported):

- who you are, HP (with a shield) and XP as bars, the clock and the KOs;
- the run's line as chips (the zone lit, money gold, a danger orange);
- what the run says as a banner; a boss's name and HP as a bar;
- the bag (vitamins, items, the held item, the team) and the four move slots in their types' colours;
- the level-up cards and the run's choices in the same look (the same buttons and keys);
- the run's end as a panel: the result, "Play again" (the next seed) and "Leave".

runui.js only draws: the page hands it a plain view of the run a few times a second. The readout is still
filled (tests read it) and `?debug=1` shows it. One size (`--u`) scales the whole screen, so a phone held
upright fits. The test room without a run is untouched.

Not yet: art on the cards and the moves, move names written for a player in the run's own texts, the party's
bars in co-op, a pause menu.

Tests: `micasurvivor_m3d_runui_test.mjs` (18 checks, a real browser): new.

## 5.32 The shipping path, second part: built (2026-11-12). The menu, the cards' art, names for a player.

- **The menu** (Esc, P, or its button under the minimap): Resume, Restart the run, Leave. Alone in your own run
  the fight waits while it is up; a guest's or a watcher's fight is someone else's and goes on. With the zone
  map, a choice or a level's cards open, Esc closes those first.
- **A card's art**: a move's type, a vitamin's or an item's picture (the overworld's own, as the 2D game shows
  them), a Mega's sprite.
- **Names for a player**: a move is "Flame Wheel" on its card, in "Replaces …" and in "Kit move: …" (as the 2D
  game writes it), not its id.

**The owner's decisions (2026-11-12)**, which set the rest of the path (see §7): the old 2D modes stay until
the 3D ones are complete; a 3D run pays into the same save; 3D scores have their own boards; no local co-op;
over the site's lines only watching ships (no new transport: live co-op stays on the test page); the 2D modes
are archived, not deleted, when their 3D counterparts go live; old 2D tapes are refused; rails, wall-running
and surfing are in the first version; upgrades (P5) come before Dive in 3D (P6).

So the order from here: the site's controls on the 3D page, the way in, the save (with wild League
encounters and the 3D boards), live watching over the site's lines, the movement tech, P5, P6, P7.

Tests: `micasurvivor_m3d_runui_test.mjs` 23 checks (was 18).

## 5.33 The shipping path, third part: built (2026-11-12). The site's controls.

The 3D page now speaks the site's one vocabulary (`site/input.js` + `site/gamepad.js`, the owner's scheme), from
the keyboard and a controller alike:

| | keyboard | controller |
|---|---|---|
| move | arrows / WASD | stick |
| jump (confirm) | Z, Space | A (the player's layout: the right face button by default) |
| slide (cancel) | X, C, Shift | B |
| camera | Q / E, drag | L / R, right stick |
| menu | Enter, Esc, P | Start |
| zone map | Backspace, M | Select |

- While a screen is up (the run's end, the menu, a level's cards, a choice) the same actions move a focus ring
  over its buttons and press them (`site/focusnav.js`): a run can be played start to end with no mouse.
- The Games switcher (` / hold Esc / Start + Select) is on the page: the fight waits under it, and leaving a run
  asks first (`mpLeaveGuard`). The switcher holds an Esc tap back and replays it; one press is one Esc here.
- The menu lists the controls.

A controller's face buttons used to be read raw (bottom = jump); they now follow the player's saved layout and
remapping, as everywhere on the site.

Tests: `micasurvivor_m3d_controls_test.mjs` (15 checks, a real browser, with site/gamepad.js's test controller): new.

## 5.34 The shipping path, fourth part: built (2026-11-12). What a run leaves behind.

Owner: a 3D run pays into the same save as a 2D one; 3D scores have their own boards. `micasurvivor/m3d/expsave.js`.

**Two saves, and only one is written from the 3D page.**

- The **Expedition save** (`js/expedition/save.js`: counters merged by the largest, sets by union) is safe to write
  from any page. A 3D run writes it with the 2D game's own keys: the run, its best time, its splits, its zone, a
  win with its clear, medal and next tier, Survival's records, the League's counters and forms, a Mega seen.
  The 2D game's own code then reads the medal, the next tier and the next map from them.
- The **base save** (Pokémonedas, the collection) is merged by the whole game (its Tower, its modes, its co-op
  each merge their part). A page without those would drop their part on a conflict, so the 3D page never opens
  it. A run's pay is written into the Expedition save as **owed to this browser** (`pay3d.<device>`), and the 2D
  game pays it into the wallet the next time the Expedition opens there (`meta.js claim3d`, `pay3d.claimed.
  <device>`); the forms a run evolved into join the collection there too. Both counters are written by one
  browser only, so merging by the largest neither pays twice nor loses a payment. No profile yet: it waits.

**A run is kept only if** it is fair (the page's own address: the seed, the map, the tier, the member, Survival;
any test parameter makes it a practice run), it is a League run as a member the save has, on a map and at a tier
the save has open, and it is clean (the 2D game's checks: the run's clock no faster than the real one, stats
within what a run can reach). The run's end says what happened: "Saved. ₽ N will be in your wallet when you
next open the Expedition.", or why nothing was saved.

**The 3D boards.** `run-score` with `d3: true` files a score under `:3d` in every key (the score, time, Survival
and season boards and the player's bests): `runboard:micasurvivor_expedition:r2:3d:<map>:<diff>`. The parts and
the plausibility checks are the 2D boards'; a 3D score carries no replay. Signed in and alone, a kept run posts
its mark and the run's end shows the rank.

Not kept yet: the economy's, the capture's and the level-ups' counters, the tasks; achievements are checked by
the 2D game from the counters there are. Pay owed to a browser whose storage was cleared before the 2D game
opened there stays owed (it is in the save, under that browser's id). Next: wild League encounters, which read
this save; a screen for the 3D boards; live watching over the site's lines.

Tests: `micasurvivor_m3d_expsave_test.mjs` (24 checks, node, against the 2D game's own save.js / tiers.js /
meta.js), `micasurvivor_m3d_save_page_test.mjs` (9 checks, a real browser, a 65 s run), `micasurvivor_server_test
.mjs` 161 checks (was 150: the 3D boards).

## 5.35 The shipping path, fifth part: built (2026-11-12). Wild League members. P4's rules are complete.

The last of P4's rules, which had to wait for the save. The 2D game's rule and numbers
(`js/expedition/capture.js`, `league.js`):

- **Becoming wild.** After a kept run, every member whose challenge is now complete is met, and wild until
  caught (`expsave.js newlyMet`). The run's end names them ("New in the wild: …").
- **Coming into a run.** Up to five of the save's wild members wait for a run, in an order of its seed
  (`wildOf`; the page opens the save before it makes the run). Zones 1 to 3 bring the first three at 50-120 s;
  zones 1 and 2 bring the other two at 150-230 s. "A wild X appeared!": bigger, 9 times the HP of its kind
  times its rank (a legendary: 5 times that), and it fights back.
- **Catching.** It flees after 150 s (a legendary: 240 s). Beaten, it faints with a 12 s window; a Poké Ball
  as for a shiny. Caught, it is a member of your League from that moment: saved at once, whatever the run's
  end (`league.own`, `cap.league`), and its species joins the collection at the 2D game's next claim.
- What you have counts the base collection too (read, never written), as in 2D: a member there is not wild.

Fixed on the way: what the ball says as its shakes end ("caught") was wiped by the hold of that very step, so
the page never heard of a catch (the alpha's and the shiny's were drawn from the cinematic instead). The new
node check of the catch's event fails without the fix.

Not here: the Master Ball, a co-op guest catching the host's wild member, keeping a caught shiny.

Tests: `micasurvivor_m3d_expcap_test.mjs` 54 checks (was 43), `micasurvivor_m3d_expsave_test.mjs` 31 (was 24),
`micasurvivor_m3d_save_page_test.mjs` 13 (was 9: a wild member comes, is caught, is saved at once, and is not
wild in the next run).

## 5.36 The shipping path, sixth part: built (2026-11-12). A screen for the 3D boards.

"3D boards" in the menu and on the run's end opens the boards of the run's map and tier: the server's top ten
and your own mark (lit; under the ten when it is further down), with tabs for Score, Time attack and
Survival. Asked for with `d3` (`expsave.js boardAsk`, read by `boardRows`). Logged out, a line says to log in
and nothing is asked. Esc / X / B closes it, back to where it was opened from; it is walked with the arrows
like the other screens.

Tests: `micasurvivor_m3d_runui_test.mjs` 28 checks (was 23), `micasurvivor_m3d_expsave_test.mjs` 33 (was 31).

## 5.37 The shipping path, seventh part: built (2026-11-12). Watching a 3D run live.

Owner: "just keep spectating": no new transport. `micasurvivor/m3d/exprelay.js` is the 2D game's spectating as
it already is on the server (`publish-micasurvivor` / `micasurvivor-state`): no sockets, the player's page
publishes and a friend's page polls. **No server change.**

- **The player.** Logged in, a run asks every 10 s, with no snapshot, whether a friend is watching (the server
  only reads then, and keeps the beacon that puts you in your friends' "live now" lists). While one is, it
  sends a second of frames a second, as P3n's relay bundles them (you in all ten, the enemies in two, the
  run's row): 6-9 KB against the server's 24. At the end, once more with `over`. The screen says "N watching".
- **A friend.** `/micasurvivor/m3d/?live=<name>` polls once a second and hands each snapshot to the page as the
  test room's relay would, so the watching code is the one P3n and P4 built. It is shown 2.6 s in the past (a
  publish and a poll each take up to a second). Friends only, both ways; eight at most (the server's rules).
  Each state has its line: waiting, over, not in a run, in the 2D game, not a friend, full, logged out.
- **Finding it.** The beacon's mode is `exp-threed`. The 2D game's watcher (`js/mica/spectate.js`, one line)
  sends anyone watching such a friend to the 3D page, so every "live now" list on the site already leads here.

**The owner's order (2026-11-12): 3D Expedition is complete and live on the site before 3D Dive is even
started.** So from here: the movement tech (rails, wall-running, surfing: in the first version), what is still
missing of a run's polish, the way in from the Play flow, going live (the 2D Expedition archived), and only
then P5 (upgrades) and P6 (Dive in 3D).

Tests: `micasurvivor_m3d_exprelay_test.mjs` (18 checks, node, the REAL server handler and a real run's frames;
the 2D game's spectate.js run as it is), `micasurvivor_m3d_live_page_test.mjs` (8 checks, two real browsers).
## 5.38 The movement tech, first part: built (2026-11-12). Wall-running.

Owner, 2026-11-12: rails, wall-running and surfing are in the first version. This is the first of the three,
in `sim.js` (pure, fixed tick, as all of the movement): every wall of every level is already one to run on.

- **The wall carries you.** In the air, beside a wall (a rise of 1 m or more above your feet), going along it at
  4.5 m/s or more and holding a direction that leans INTO it: you keep your speed (toward the run speed) and
  barely sink (1 m/s at most). A wall adds no height: going up, gravity is the air's.
- **You must lean in.** Holding straight along a wall, or away from it, lets go: you never stick to a cliff you
  only fall past. (First built without this: a walk off a ledge stuck to its own cliff.)
- **The wall jump.** A jump on a wall (or within 0.12 s of leaving it) kicks you 6.5 m/s off it and 9.5 m/s up,
  keeps your speed along it, and costs no air jump. A tap is a short hop, as any jump.
- **One wall, once.** A wall holds you 1.1 s, and the same wall will not take you again until you have touched
  the ground or another wall. So one wall cannot be climbed, and two facing walls can, kick by kick.
- **Types.** A Bug type is carried twice as long; a Fighting type jumps higher off a wall. The room's edge is
  not a wall to run on.
- Watchers see it (a bit in the frame); the menu's controls line says how.

Two scripted fights in the tests (a walk with no jumps, four minutes) took another course with the tech on;
they now run with it off, on the path they were written for.

Next: rails (splines to grind, placed by the level generator), then surfing a steep slope under control.

Tests: `micasurvivor_m3d_sim_test.mjs` 65 checks (was 50).

## 5.39 The movement tech, second part: built (2026-11-12). Rails.

- **Grinding** (`sim.js`). A room may have rails (`room.rails`: lines through the air). Come down on one (within
  0.75 m of it, not while still going up fast) and it carries you along it the way you were going: at least
  8 m/s, up to 11 m/s by itself, faster downhill (19 m/s at most), slower uphill. A jump leaps off it with the
  speed it gave you; a slide drops off it; at its end you fly off the way it points. Your air jumps are back
  on a rail. A rail will not take you back for 0.35 s after you leave one.
- **In every level** (`gen.js railsFor`). Each generated level gets rails (three on a 7 x 7-tile zone): from high
  ground to lower (one to four levels down), 20 to 62 m long, each end half a metre over the floor, arched over
  whatever is in the way (clearance checked every 20 cm). They come from a stream of their own, so the levels
  themselves (their 50 pinned fingerprints) are as they were, and a watcher builds the same rails.
- **Seen**: a steel bar with a post under each end; pale lines on the minimap. The test room has one, from the
  plateau down to the floor.

Not yet: enemies do not use rails; a rail has no sparks or sound.

Next: surfing a steep slope under control.

Tests: `micasurvivor_m3d_sim_test.mjs` 78 checks (was 65), `micasurvivor_m3d_gen_test.mjs` 38 (was 35: every
rail of 30 levels is ridden from its top to the ground beyond its foot, never under the floor).

## 5.40 The movement tech, third part: built (2026-11-12). Surfing. The three are in.

- **The surf** (`sim.js`). A slope too steep to stand on was only a chute: it threw you down it. It still does if
  you let it. But what you hold ACROSS it now carries you along it (up to 13 m/s), and holding INTO it while you
  are fast across (5 m/s or more) takes 95 % of its pull away: a fast line across a bank holds its height. Up to
  20 m/s on a bank. A jump leaves it, up and off the slope, with your speed; only while you are surfing (from a
  standstill you cannot hop up a bank).
- **Banks in the levels** (`gen.js`). Where two tiles that are not linked stand two levels or more apart, the
  cliff between them may be a bank: the five middle cells of the higher tile's edge, 56 degrees for a two-level
  drop and steeper for more. About three on a meadow zone of 7 x 7 tiles, five or six on a mountain one, none
  in a marsh (it is too flat). They are laid over the level from a stream of their own: no other cell moves
  (the 50 pinned fingerprints are the level without its banks, unchanged), and the level's check knows a bank
  for what it is: one-way on foot, down.
- A level whose banks fail its check is built without them (none of 180 tried needed it).

With wall-running (5.38) and rails (5.39) the movement tech the owner asked for in the first version is in.
All of its numbers are first guesses, at the top of `sim.js`, for the owner to feel on a phone and tune.

What is left before 3D Expedition can go live (the owner's order: before 3D Dive is started): the way in from
the Play flow; the counters a 3D run does not keep yet (the economy's, the capture's, the level-ups', the
tasks); the Master Ball and the Lab's effects on a run; sound; the owner's tuning pass; then going live, with
the 2D Expedition archived.

Tests: `micasurvivor_m3d_sim_test.mjs` 87 checks (was 78), `micasurvivor_m3d_gen_test.mjs` 41 (was 38: every
bank of 20 levels surfed along and slid down).

## 5.41 Going live, first part: built (2026-11-12). The counters a 3D run did not keep; a caught shiny.

The first of what is left before 3D Expedition can go live (§5.40).

- A kept 3D run now writes the level-ups', the economy's and the capture's counters too, with the 2D game's keys
  (`lv.*`, `eco.*`, `cap.alpha`, `sa.best`, `sa.types`, `shiny.seen`, `cap.fled`): the 2D game's achievements and
  the goals that reveal items in the Lab read them, so a 3D run now counts toward both.
- A shiny caught in a 3D run is kept at once, as a wild League member is (`shiny.caught`, `cap.shiny`, and its
  family's shiny for the League).
- Fixed: a wild League member coming into a run was counted as a shiny seen.

Still not kept: the tasks (daily and weekly). Next: the Lab's effects on a 3D run (what it adds to a run, the
items not bought yet staying out of the pool, the boosts and the Master Ball), then sound and the way in.

Tests: `micasurvivor_m3d_expsave_test.mjs` 37 checks (was 33).

## 5.42 Going live, second part: built (2026-11-12). The Lab in a 3D run.

In the 2D game a run starts with a row read from your save: your Lab's levels, your shiny perks, the boosts you
armed. A 3D run did not, so it was not the same game: every item dropped whether you had bought it or not, and
nothing you had paid for in the Lab was there. `micasurvivor/m3d/expmeta.js`: a 3D run that can be kept now
starts with the same row, read by the 2D game's own code (`meta.js rowNow / effects`, loaded on the page).

- **The Lab**: + uses of Refresh / Skip / Banish; + vitamin slots; a fourth card at each level; a Max Revive to
  start with; a third Support Alpha slot; your Archive. A retired row does nothing, as in 2D.
- **The items**: the 25 the Lab sells stay out of a run's pool (level-up items, balls, the stall) until bought.
- **Shiny perks**: + 3 luck, + 4 % XP, a Shiny Charm every run, + 3 % damage, and + 20 % as your League's
  shiny member.
- **Boosts**: the ones you armed and still have are spent when the run starts, once, with the 2D game's keys:
  Rare Candy (two levels), Lucky Egg, Amulet Coin, Honey (an extra alpha in each zone), Dawn Stone (a shiny in
  zone 1), Master Ball (your first wild League member or shiny faints at once).
- Only a run that can be kept has a row (your member, a map and a tier you have open): a practice run has
  nothing of the Lab and spends nothing.

Not here: research (the points a run's KOs give a family); the tasks; the row on a watcher's screen.

Tests: `micasurvivor_m3d_expmeta_test.mjs` (24 checks, node, against the 2D game's own meta.js and save.js):
new. `micasurvivor_m3d_save_page_test.mjs` 16 checks (was 13).

## 5.43 Going live, third part: built (2026-11-12). Sound.

The 2D game makes all of its sound as it plays (`js/core/audio.js`: a synthesizer, no files) and names each
effect. `micasurvivor/m3d/runsound.js` says which of those names a 3D run's events are, and the page hands
them to the 2D game's own `G.Audio` (now loaded on the page, with its themes):

- a shot in its move's voice, a hit, a faint, a boss down, a hurt, a level, a pickup of each kind, an item,
  a choice opening, the ball and the catch, a wild League member, an evolution or a Mega, a new zone, the
  run's end;
- how you move: a landing, a hard one, a bounce pad, a rail caught, a jump off a wall, a rail or a bank;
- the map's theme (Viridian: forest, Mt. Moon: cave, Cerulean: volcano), the boss's while one is on the
  field, none at the end or while the fight waits under the menu;
- the menu has "Sound: on / off". The volumes are the 2D game's own setting (this browser's), so muting in
  one is muted in the other.

Tests: `micasurvivor_m3d_runui_test.mjs` 35 checks (was 29).

## 5.44 Going live, fourth part: built (2026-11-12). The way in, behind a switch.

Owner: the 2D Expedition stays what players get until the 3D one is complete. So the way in from the Play flow is
built, and off:

- `/micasurvivor/?exp3d=1` turns a switch on **for that browser only** (`?exp3d=0` turns it off). Nothing in the
  game shows it; a player who has not been given the address is not affected.
- With it on, START on Expedition · Classic or Survival, playing alone, opens the 3D page with the same choices: your League
  member, the map, the tier, a fresh seed. That run can be kept (it has no test parameter), so it has the Lab's
  row, its pay is owed, and its mark goes to the 3D boards.
- Local and online play, and every other mode, start the 2D run as always.
- "Leave" on the 3D page comes back to MicaSurvivor, where opening the Expedition pays what the run earned.

This is how the owner's tuning pass is meant to be played: the real flow, a real save. Going live is then one
change: the switch's default, the 2D Expedition archived, the test room's `noindex` and title.

Survival goes the same way when it is the variant chosen (`&mode=survival`). Not yet: starting as a later form
of the member (a 3D run starts at the family's first stage).

Tests: `micasurvivor_playflow_test.mjs` 168 checks (was 162): off by default, on by the address, the 3D page's
address for the setup, START opening a 3D run of it, local play staying 2D, off again.

## 5.45 Going live, fifth part: built (2026-11-12). The starting form.

The 2D game lets a run START as a later stage of its family, one you own in the base collection or a run has
evolved into ("how come I can't play Expedition as Annihilape"). A 3D run always started at the first stage.
Now `&form=<dex>` starts it as that stage: its body, types and stats from the first moment, at Lv 1 with the
kit's first move, quietly (it is not an evolution of this run); what is left of its line still comes at its
level. A run started as a form the save has not reached is not kept. The Play flow's switch (5.44) sends the
form you chose.

Tests: `micasurvivor_m3d_expleague_test.mjs` 57 checks (was 51), `micasurvivor_m3d_expsave_test.mjs` 38 (was 37).

## 5.46 Going live, sixth part: built (2026-11-12). Research; the daily and weekly tasks.

The last of what a 2D run leaves behind that a 3D run did not.

- **Research.** Each KO gives its Pokémon's family points (1; an elite 2, a summoner 4, an alpha 5, a boss 10), a
  freed cage 25; the Lab's "Research" adds 25 % a level. Written with the run (`rs.<family>`); a family
  researched to its need gives its avatar. The 2D game's numbers.
- **The tasks.** A task pays Pokémonedas, so it is the 2D game's to count, as a run's pay is its to pay. A 3D run
  leaves its metrics in the save for its browser (runs, KOs, time, wins, guardians, balls, altars, cages, alphas,
  catches, evolutions, Megas, final stages, Survival's milestone bosses; and a single run's best zone and
  Survival time). The 2D game's `claim3d` counts them into the tasks of the day and the week it is then, pays the
  ones they finish, and never counts a run twice.

Two tasks a 3D run cannot move: "cast N ultimates" and "cause N reactions". Ultimates and reactions are not in
the 3D game. Before going live either they are built, or those two tasks leave the pool: the owner's call.

Tests: `micasurvivor_m3d_expsave_test.mjs` 47 checks (was 38), against the 2D game's own meta.js.

## 5.47 Going live, seventh part: built (2026-11-12). Ultimates and elemental reactions.

The owner's call on §5.46's open question: build them. Both read the 2D game's own numbers
(`js/expedition/reactions.js`, `js/expedition/ultimates.js`, `js/systems/zmoves.js`), which the 3D page now loads.

- **Reactions** (`m3d/exprx.js`). The marks: a Water hit wets a foe for 4 s; three Ice hits (one on a wet foe)
  freeze it for 1.6 s. The seven reactions, one a hit, 0.25 s apart per foe: Electrocuted (× 1.5, chains to 12 wet
  foes within 9 m at half the hit, paralysis 60 %), Steam (× 1.4, confuses and roots within 6 m), Inferno (the burn
  spreads 7 m), Wreckage (× 2.6 on a frozen foe), Poison Gas (× 1.3, poisons within 6 m), Psychic Meltdown
  (× 1.6), Dragon Rage (× 1.8 on two statuses). The weather: Sun boosts Grass and Fog boosts Dark (× 1.3), and
  the weather that favours your type gives every hit + 10 %. On screen: the reaction's name over the foe, a ring
  as wide as it reaches, the chain's bolts; a wet foe has a blue ring under it, a chilled one a pale ring a stack.
- **Ultimates** (`m3d/expult.js`). The charge (95 s by itself; KOs from a bucket; elites, alphas, bosses; damage
  taken), the cast (a 0.32 s hit-stop, no damage taken during it nor 0.6 s after), the damage formula, the 28 %
  cap a piece against a boss, the tier (evolutions + Maturity + Mega), the sixteen signatures with their beats by
  tier, Mew's copies (seeded), and auto. The eighteen type choreographies are the 2D game's Z-moves, written again
  beat for beat (they are code there, not a table): same times, reaches, weights and effects. An Ultimate reaches
  every height. A dive or a dash never puts you where you could not walk back from.
  - Cast with **V** (a controller's Y), or press the meter (a tap on a phone). **U**, or the menu's button,
    switches Auto-Ultimate; the setting is the 2D game's own (`ult.auto.on` / `.off` in the Expedition save).
  - The screen: a meter above the four moves (its name, how full, READY), and a cut-in with the name when cast.
  - The comet shard now gives its + 25 % Ultimate charge (§5.19 had left it waiting).
- **The save and the tasks.** A run writes `rx.<kind>`, `rx.total`, `ult.casts`, `ult.best`, `ult.sig` with the 2D
  game's keys, and leaves `reactions` and `casts` for the tasks; the 2D game's `claim3d` counts them. So every
  task in the pool can now be moved by a 3D run.
- **Watching.** The reactions' and the Ultimate's events ride the frames: a watcher sees the names, the rings and
  the cut-in. The meter itself is not sent.

Not built: the caster's sprite in the cut-in (the 2D game draws it; here the banner has the name and the tier),
and the particles of each choreography (rings, beams and strikes in the type's colour stand in for them).

Tests: `micasurvivor_m3d_exprx_test.mjs` 45 checks, `micasurvivor_m3d_expult_test.mjs` 62, both against the 2D
game's own scripts; `micasurvivor_m3d_ult_page_test.mjs` 16 in a browser; `micasurvivor_m3d_expeco_test.mjs` 110
(was 109).

## 5.48 Going live, eighth part: built (2026-11-12). Regional formes, Megas as enemies, and a sprite bug.

Found by reading what the 2D Expedition loads that the 3D page did not: `js/data/forms.js` and
`js/systems/forms.js` (the 2D game's U3). Without them a 3D run had no regional formes in the League and no Mega
ever came as an enemy. The 3D page now loads both, before the League reads its data.

- **Megas as enemies.** Zone 3's plan has its one Mega elite (8 x the life, 1.4 x the damage, 1.3 x the size),
  and the run brings it. Survival: from 15:00 every 5:00 segment has a Mega elite, and a milestone boss that is
  no legendary is a Mega 30 % of the time. All of it is the 2D game's own plan; the run only had to act on it.
- **Regional formes in the League.** A run can start as a forme (Alolan Vulpix), evolves along the forme's own
  line, and a line with a forme at its end offers the choice on the cards (Pikachu: Raichu or Alolan Raichu).
  A forme's Ultimate is its own first type's.
- **Names.** Formes and Megas are named in Spanish in the 2D game's data; the 3D screen is English, so on the 3D
  side they take the English the 2D game registers for them ("Alolan Vulpix", "Mega Chandelure").
- **A bug fixed: species that were never drawn.** 42 species have no eight-way sheet of their own: 24 use a
  follower sprite and 18 a battle sprite, each in a folder of its own, with fewer rows (and the battle ones
  mirrored when they face the other side). The 3D page asked for the wrong file, so such an enemy fought but was
  never drawn. The Megas and some formes are the same kind. The page now loads the right file and draws it as
  the 2D game does (which row is each direction's, mirrored where it says, the follower ones 1.2 x).

Tests: `micasurvivor_m3d_expformes_test.mjs` 17 checks in node; `micasurvivor_m3d_formes_page_test.mjs` 10 in a
browser (it fails with the sheet fix reverted: the sheet never loads).

## 5.49 Going live, ninth part: built (2026-11-12). The upgrades bought for your Pokémon.

The menu's "Upgrades" screen sells upgrades for a Pokémon, shared by its family, and a 2D Expedition run starts
with them. A 3D run did not: a player's Charizard would have been weaker in 3D than in 2D. Now it starts with them
too (`m3d/expperks.js`).

- **Where they come from.** The base save, which the 3D page reads and never writes. The levels that count are
  the family's: the best of each among its stages. They become the 2D game's own perks (`js/data/upgrades.js`),
  so a hand-edited level gives no more than the upgrade's max. A practice run has none, as it has no Lab.
- **The stats.** Vitality, Strength, Stride, Reflexes, Shell, Synthesis, Magnet, Wisdom, Critical Hit, Calibre.
- **The cards.** Card change adds Refreshes and Veto adds Banishes (never above six of each, with the Lab's); the
  moves you vetoed never come on the cards.
- **Second chance.** When you fall you are back at full HP, 2.5 s unhurt, and what is within 260 px is thrown
  back; a heart a level. It is asked after every item that could have saved you. The screen shows it.
- **The TM and Repertoire.** The TM puts the move you picked in place of the League kit's first; Repertoire gives
  the kit's second from level 1. The 2D game's rule for a League run.
- **Fortune** (+ 8 % Pokémonedas a level) does nothing in an Expedition run, in 2D either: its pay is the
  Expedition's own.

Tests: `micasurvivor_m3d_expperks_test.mjs` 36 checks in node, against the 2D game's own table and families;
`micasurvivor_m3d_perks_page_test.mjs` 7 in a browser.

## 5.50 Going live, tenth part: built (2026-11-12). Shinies look like shinies.

A wild shiny was a shiny by its rules (it wanders, it flees, it can be caught) but was drawn in its plain colours,
and your own shiny League member was drawn plain too.

- **A wild shiny** is drawn from its shiny sheet (the 2D game's own art, for every species that has one), with
  three sparkles circling it. While its sheet loads it is drawn plain; so is a species with no shiny sheet.
  Fainted and waiting for its ball, it keeps its colours.
- **Your League member** plays shiny when a shiny of its family is yours: caught in an Expedition (the 2D game's
  rule), or the shiny one you chose to play as in the 2D game. It stays shiny through its evolutions. Its look
  only: the fight is the same to the last number. A practice run is never shiny.
- **Watching.** A frame marks a shiny enemy, and the run's row says whether the player is shiny: a watcher sees
  both.

Not drawn shiny: a Mega (it is one battle sprite; the 2D game has no shiny art for most).

Tests: `micasurvivor_m3d_expshiny_test.mjs` 7 checks in node; `micasurvivor_m3d_shiny_page_test.mjs` 10 in a
browser (the shiny sheet is another picture than the plain one, and each is used for the right enemy).

## 5.51 Go-live: live (2026-11-12). Merged on the owner's word, without a tuning pass: "we will tune as we go".

The swap itself. It is small because everything before it was built behind the switch.

- **START gives the 3D run.** In the Play flow, Expedition (Classic or Survival), playing alone, opens the 3D
  page with your League member, map and tier. No switch is asked for: nothing stored means 3D.
- **The 2D Expedition is archived, not deleted.** All of its code stays. `/micasurvivor/?exp3d=0` goes back to
  it on that browser (`?exp3d=1` returns to 3D).
- **What still runs in 2D**: local play (2 to 4 on one device) and online lobbies of Expedition, because the 3D
  one has neither; and Dive, which is not built in 3D yet. A browser that cannot draw the 3D page (no WebGL 2)
  keeps the 2D run without being asked.
- **The 3D page is the game's page now**: its own title ("MicaSurvivor · Expedition"), no longer hidden from
  search, and it names `/micasurvivor/` as the page to find it by.

Open for the owner (none blocks the swap):
- Local and online Expedition stay 2D. Leave them so, or take Expedition out of those two until 3D has them?
- The 2D game's ranking screen still shows the 2D Expedition boards; the 3D boards are in the 3D page's menu.
  Point the 2D screen at the 3D boards, or show both?
- Old 2D Expedition replays still play in the 2D game (its code is all there). The decision was to refuse
  them once 3D is live: say the word and the 2D game turns them away.

Tests: `micasurvivor_playflow_test.mjs` 171 checks (was 168): 3D by default, local play 2D, `?exp3d=0` and back,
no WebGL 2, the page's title and tags. Its sections that pin the 2D runs use the archive switch.

## 5.52 Polish: built (2026-11-12). Art on the cards and tiles, the cut-in's picture, sparks, the rail's sound.

The list left as optional before the swap. Looks and sounds only: no rule changes, and the fight does not know
any of it.

- **A move's emblem** (the 2D game's own pixel icon, `js/ui/icons.js`, now loaded by the 3D page) is on its tile
  at the bottom and on its level-up card, beside the type. A training card has its picture (fist, heart, berry).
- **An evolution's card** shows who you would become: the form's own still (shiny if you play shiny). Items,
  vitamins and Megas already had theirs.
- **The Ultimate's cut-in** shows your Pokémon standing on the banner (your Mega's battle sprite if you are one).
- **Sparks.** Small balls in the type's colour that fly out and fade: an Ultimate's rings, beams and strikes, a
  reaction, a Second chance, and a trail under you while you grind a rail. Never more than 420 at once, drawn
  after the shots so they cannot take a shot's place.
- **A rail hisses** while you grind it (catching it and leaving it already had their sounds).

Not done, because the art does not exist: a shiny Mega (a Mega is one battle sprite, and the game has no shiny
one for it). The choreographies' sparks are generic, not the 2D game's per-type particle sprites.

Tests: `micasurvivor_m3d_polish_page_test.mjs` 10 checks in a browser.

## 5.53 3D Dive, first part: built (2026-11-12). A Dive floor you can stand in.

Owner, 2026-11-12: 3D Dive is **today's Dive in 3D**: open floors, sleeping groups, find the stairs, an alpha
every 5 floors, a guardian every 25, loot at stake, the Escape Rope. Not the rooms-and-doors redesign of P6.

P5 (upgrades) needs no part of its own: the 3D Expedition already carries the 2D game's level-ups, family
perks, TMs, formes, Megas, reactions and Ultimates (5.4x to 5.5x), and Dive reads the same tables.

`m3d/divegen.js` does not invent floors. It asks the 2D game's own `js/expedition/dive-gen.js` for the layout
of `{seed, route, floor}` and raises it into a room the 3D game walks, one 2D tile to one 2 m cell, so every
distance in the Dive's rules stays the same distance:

- a floor tile is ground; a wall tile is rock 6 m high (a jump clears 1.67 m: a wall, not a step);
- a liquid tile is a pool 0.6 m deep. You wade it, slower than you run, and a jump takes you out. It is
  deeper than a step, so you do not walk out of it;
- tall grass is scatter; a secret pocket's plug (boulder or thicket) is rock until it is opened;
- the spawn, the stairs, the lost Pokémon, the foe groups, the chests and the landmark sit on the same tiles
  as in 2D, so a seed gives the same floor in both games.

`checkFloor(room)` says what is wrong with a floor: everything must be reachable on foot from the spawn, a
pocket's chest only once its plug is open, and the stairs by a dry way. All 486 floors tried (9 routes, floors
1 to 54) pass.

Nothing on the page yet: no floor is drawn and nothing in a run uses this. Next parts: walking a floor and
taking the stairs down; sleeping groups; alphas and guardians; the rescue; loot at stake, the bank and the
Escape Rope; routes, stages and seals; saving, tasks and boards; the Micatro-style UI.

Tests: `micasurvivor_m3d_divegen_test.mjs` 24 checks in node.

## 5.54 3D Dive, second part: built (2026-11-12). The run's rules, floor by floor.

`m3d/dive.js`: a Dive run on top of the 3D fight, with the 2D game's own rules (`js/expedition/dive.js`) read
through `rulesFrom(G)`: its numbers, its species curve, its guardians, its Mega and legendary draws, and its
seeded streams drawn in the same order. So a `{seed, route, floor}` holds the same species, the same elites
and the same lost Pokémon in both games, with the 2D game's HP, damage and XP.

- **Floors.** Stand on the stairs half a second: the next floor. Nothing of the old one comes along.
- **Sleeping groups.** They hold still and do not touch you until you come within 11 tiles or hit one. A
  waking group wakes the groups within 9 tiles of it, one hop.
- **Elites** from floor 6 (swift, tough or rage). **Pressure**: 45 s after you arrive, packs keep arriving,
  awake, worth little XP and no loot. Not on a guardian's floor.
- **Alpha** every 5th floor: the stairs are sealed until it falls; to floor 25 its fall secures the loot.
- **Guardian** every 25th floor: the route's legendary, a boss. Its fall banks everything and sets the stage.
- **Megas** below floor 30 and **legendaries** from floor 26 (never more than 3 floors apart), awake.
- **The lost Pokémon** follows you once reached and is rescued when you leave the floor with it near.
- **Loot** is at stake until secured. A faint keeps the bank and a quarter of the stake. **The Escape Rope**
  (floors 10, 20 and every 25th): stand still 3 s where you arrived and you leave with everything.
- Your Pokémon levels up as in an Expedition (the same cards), with reactions and Ultimates.

Different from 2D, on purpose:
- "Standing still" for the rope is moving slower than 0.5 m/s. The 2D check (under 2 px a frame) let a slow
  walk count.
- Reinforcements arrive 11 to 20 tiles away; the 2D game also asks that the spot is off screen, and the
  rules here have no camera.
- A pool blocks walking foes, as liquid does in 2D. A walker shoved into one cannot climb out (0.6 m is more
  than a step). Known, left for the tuning.

Still not on the page: no run uses this yet. Next: the page (start a Dive, draw the floor, the stairs, the
sleepers, the HUD), then the kit (basic + two specials) and the dodge, the combo, the red ground, landmarks,
pockets and chests, the save (bests, stages, Seals), the Weekly Dive, co-op.

Tests: `micasurvivor_m3d_dive_test.mjs` 53 checks in node.

## 5.55 3D Dive, third part: built (2026-11-12). A Dive on the page (a preview).

`/micasurvivor/m3d/?dive=<seed>&route=forest&floor=1&dex=4` plays a Dive run in the 3D page. Not linked from
any menu, and nothing is saved: the address is the only way in.

- The floor is drawn from the Dive room; the stairs are the column of light and the ring on the minimap.
- Sleeping foes hold still, dimmed, with a pale bead over them. An elite has a bead in its affix's colour
  (swift yellow, tough blue, rage red).
- The lost Pokémon stands with a green bead over it until reached, then walks behind you.
- The chips: FLOOR, loot secured and at stake, STAIRS n m (or ALPHA / GUARDIAN), the rope's countdown.
- An alpha or a guardian has the boss bar. Sealed stairs have a red ring; a rope floor has a gold ring where
  you arrived.
- The end screen: floor, time, KOs, level, loot kept, rescued, alphas, guardians. It says nothing is saved.
  Play again is the next seed.
- Level-ups, reactions, the Ultimate, the menu, the map and the fog are the 3D Expedition's.

A Dive page loads three more of the 2D game's scripts (`systems/expedition.js`, `expedition/dive-gen.js`,
`expedition/dive.js`), itself, and only on `?dive=`. (Loaded on every page they broke Expedition pages: the 2D
game's own Expedition object changes what the save and the run screen do. The gate caught it.)

Fixed on the way: a Dive room's grass had no size, so it would not have been drawn.

Still to do: the kit (basic + two specials) and the dodge, the combo, the red ground, landmarks, pockets and
chests, the save (bests, stages, Seals, pay), the Weekly Dive, co-op, watching, a way in from the menu.

Tests: `micasurvivor_m3d_dive_page_test.mjs` 23 checks in a browser.

## 5.56 3D Dive, fourth part: built (2026-11-12). The kit, the dodge, the combo.

The 2D Dive's own numbers (`K.SLOTS`, `SPECIAL_K`, `BUFFER`, `HOLD`, `COMBO`, the dodge's from `verbs.js`).

- **The kit.** Three moves. The first fires by itself. The second and third are specials: they fire when
  pressed, at your target, and hit 25 % harder. A press just before the cool-down ends is kept; a press with
  no foe in reach waits 0.6 s. A fourth move is put away. On the page the kit is your League member's first
  three moves.
- **The dodge.** Slide is the dodge in a Dive: 0.2 s the way you push (or face), about 3 tiles, nothing can
  hurt you while it lasts, 1.2 s to cool. There is no slide in a Dive. Jump stays (pools).
- **The combo.** KOs within 3 s chain: +2 % XP a step (to +30 %), a little loot every 10. The chips show it;
  the end screen has the best.

Controls: specials on 1 / 2 (or J / K, or C / V, the pad's X / Y, or a tap on the move's chip); the Ultimate on
3 (or L, or its button); dodge on X / Shift, the pad's B, the DODGE button. A special's chip shows its key, then
its cool-down.

`combat.js`: a move marked `xman` fires only while a press (`xreq`) is kept. No other mode marks one.

Known, for later: a controller has no button for the Ultimate in a Dive yet (the 2D game uses LB, which turns
the 3D camera); a special of a kind that is always on (a trail, an orbit) is an odd special; the new special
at levels 4, 10, 16… and the League (evolutions) are not in.

Tests: `micasurvivor_m3d_dive_kit_test.mjs` 41 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 30.

## 5.57 3D Dive, fifth part: built (2026-11-13). Chests, secret pockets, landmarks.

What a floor holds besides foes. The 2D layout already placed all of it; this part makes it work. Numbers are
the 2D Dive's (`PLUG`, `LM`) and the 2D economy's (`OPEN_T`).

- **Chests.** A Poké Ball that bobs. Stand by it 0.45 s: one item, of a rarity by your level, luck and the
  floor's zone (a zone every 10 floors). Once each. A run with no room for an item gets a little loot
  (3 + the floor): that rule is the 3D game's own.
- **Secret pockets.** A boulder breaks for a Rock, Ground, Fighting or Steel Pokémon; a thicket burns for a
  Fire type. Stand against it 0.6 s. Another type gets one tip. The rock becomes ground, the page builds the
  floor again, and the pocket's chest can be reached.
- **Landmarks.** The route's own, on some floors; stand on it 1 s, once a floor. Shrine: half your HP.
  Obelisk: +30 % damage for 60 s (the chips count it). Altar: 30 % of your HP for loot. Shipwreck: loot.
  Ice spire: foes within 6 tiles freeze 4 s. Totem / Monolith: 35 % / 60 % of a level in XP. Fairy ring: full
  heal. It names itself when you come within 5 tiles.

On the page: a boulder or a thicket is drawn against the rock on the side you come from; a landmark is a
standing stone in its colour, with a bead over it until used. The end screen counts Poké Balls and secrets.
An item's name now shows on a Dive's screen (it was said to the fight only).

Known, for later: the minimap does not mark chests or landmarks; item drops from alphas still roll with the
floor number as the zone (richer than the 2D Dive from floor 3); the 2D floor's stall, berry bushes and gold
rocks are not in.

Tests: `micasurvivor_m3d_dive_things_test.mjs` 53 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 35.

## 5.58 3D Dive, sixth part: built (2026-11-13). The save.

A 3D Dive is kept in the same save as a 2D one (`m3d/divesave.js`), under the 2D Dive's own keys. It is no
longer a preview.

- **What is written.** The run, an escape, the route's deepest floor, who was rescued. The pay (the loot kept,
  in Pokémonedas by the 2D game's scale) is owed to this browser, as an Expedition's: the 2D game puts it in
  the wallet the next time the Expedition opens here.
- **Stages and Seals.** A guardian beaten gives the route its next stage (26, 51, …) and its Seal. Both are
  written the moment it falls. A Dive may start on floor 1 or on a stage the save has; another floor asked for
  becomes floor 1. With the Seal: +10 % damage, -10 % damage taken on that route. The Route of Origin needs
  the 8 Seals.
- **Which Dives are kept.** No test parameter in the address (only `dive`, `route`, `floor`, `dex`), a League
  member you have, an open route, and a run that passes the Expedition's own checks. Anything else ends with
  a line saying why nothing is saved.

Not in yet: the 3D boards for a Dive, the Weekly Dive, the tasks' and the level-ups' counters for a Dive, a
"new record" line on the 2D side.

Tests: `micasurvivor_m3d_dive_save_test.mjs` 29 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 44.

## 5.59 3D Dive, seventh part: built (2026-11-13). Its own boards.

Same save, separate boards. A kept Dive of a signed-in player is posted to the 3D board of its route: the
deepest floor, then the shorter time. The 2D board of the route does not see it, and a 2D score does not
reach the 3D board.

- **Server** (`server/mp.mjs`, the Dive boards): `d3: true` puts `:3d` in the board's key and in the player's
  best. Everything else (the checks on floor, start and time) is the 2D Dive board's own.
- **Page:** the end screen says your place ("New best on the 3D board: #2"); the end screen and the menu have
  the **3D boards** button, which shows the route's top ten and your row (floor, an arrow for an escape, time).

Not in yet: the Weekly Dive and its board.

Tests: `micasurvivor_m3d_dive_boards_test.mjs` 13 checks against the real server handler;
`micasurvivor_m3d_dive_page_test.mjs` now 45.

## 5.60 3D Dive, eighth part: built (2026-11-13). A new special at levels 4, 10, 16…

The 2D Dive's rule (`LEARN_AT`). On those levels the level's cards are:

1. learn X, forget special 1
2. learn X, forget special 2
3. train, and keep your moves

X is your League member's next kit move (Charmander: Wing Attack at level 4), then a move of your types, picked
by the run's seed. The learned move takes the forgotten special's slot and key. The basic is never offered up.
Other levels deal the usual cards.

Not in yet: the League in a Dive (evolutions, the member's stage factor on its moves).

Tests: `micasurvivor_m3d_dive_learn_test.mjs` 19 checks in node.

## 5.61 3D Dive, ninth part: built (2026-11-13). The red ground.

The 2D Dive's telegraphs, with its numbers (`TELE`).

- **Slam.** A brawler (a foe with no shot) within 2.2 tiles winds up: it holds still, a red circle of 1.6
  tiles shows round it for 0.8 s, then everyone inside is hit for its damage x1.35. Then it waits 2.6 to
  4.2 s.
- **Alphas and guardians** slam wider (2.6 / 3.4 tiles) and, from farther than 2 tiles (or by the dice
  up close), **charge**: a red lane 7 tiles long toward you for 0.9 s, then a dash along it in 0.35 s that
  hits what it crosses once, for x1.6. A wall stops the dash.
- Step out, or dodge through the moment it lands: the dodge takes nothing. A foe that shoots, a sleeper and
  a frozen foe do not slam. A foe that faints while winding up does nothing.

The dice are the fight's own seeded ones, so the same run gives the same slams.

Tests: `micasurvivor_m3d_dive_tele_test.mjs` 22 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 47.

## 5.62 3D Dive, tenth part: built (2026-11-13). The League.

A Dive on the page is now a League member's, as a 3D Expedition is (`expleague.js`, unchanged in what it does).

- **The start.** The member's first stage, with the League's HP, attack, role and ability, and its kit's first
  three moves: the basic and both specials (PokéDive's start; an Expedition starts with one). A Dive never
  holds a fourth move: the kit's fourth comes as the new special of level 4.
- **The levels.** It evolves at its level (also on a level that offers a new special: the evolution comes
  first), reaches Maturity, and Mega Evolves, by the League's own rules. Its moves are re-scaled to each stage.
- **The save.** A kept Dive writes the League's counters and the forms it reached, so a form first reached in
  a Dive is yours.

`?moves=` (or `league=0`) gives the Dive of before: the moves you name, no League. Both make it a practice run.

Not in yet: starting a Dive as a later form you own (`?form=`), the family's bought upgrades and the Lab's
boosts in a Dive.

Tests: `micasurvivor_m3d_dive_league_test.mjs` 17 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 49.

## 5.63 3D Dive, eleventh part: built (2026-11-13). A way in from the menu, by opt-in. NOT live.

`/micasurvivor/?dive3d=1` opts this browser in (`?dive3d=0` goes back). Then START on Dive, playing alone,
opens the 3D page with the same League member, route and start floor, as a Dive that can be kept.

Everyone who has not opted in keeps the 2D Dive. So do the Weekly Dive, local play and online play, opted in
or not. A browser with no WebGL 2 keeps the 2D Dive.

**Going live is the owner's word**, and then one line: the default of `dive3d()` in `js/ui/play-ui.js` (as
`exp3d()` is for the Expedition). What the 3D Dive still lacks next to the 2D one: the Weekly Dive, co-op,
starting as a later form you own, the family's bought upgrades and the Lab's boosts, the stall / berry bushes /
gold rocks, the dark floors' lighting, the tasks' counters.

Tests: `micasurvivor_playflow_test.mjs` grows by 5 checks (176).

## 5.64 3D Dive is LIVE (2026-11-13). Owner: "go live with 3D Dive".

START on Dive, playing alone, opens the 3D page (the default of `dive3d()` in `js/ui/play-ui.js`).

- The Weekly Dive, local play and online play keep the 2D Dive: the 3D one has none of them.
- The 2D Dive is archived, not deleted. A browser goes back to it with `/micasurvivor/?dive3d=0` (that browser
  only); `?dive3d=1` returns to 3D.
- A browser with no WebGL 2 keeps the 2D Dive without being asked.

Gaps next to the 2D Dive when it went live, to close next: starting as a later form you own, the family's
bought upgrades, the Lab's boosts. Then: the stall / berry bushes / gold rocks, the dark floors' lighting, the
tasks' counters.

## 5.65 3D Dive, twelfth part: built (2026-11-13). What your save brings: the form, the upgrades, the Lab.

Owner: "upgrades lab boosts and starting form all need to be done". A Dive that can be kept now gets what an
Expedition gets, by the same code:

- **The starting form.** The menu sends the form you chose (`&form=`); the Dive starts as that stage, with its
  stats and the kit of three. A form the save has not reached plays, but the Dive is not kept and says so.
- **The family's upgrades** bought for that Pokémon: HP, attack, speed, cool-down, armour, regeneration, XP,
  crit, the rerolls and bans, the vetoed moves, the second chance.
- **The Lab:** its stats, its extra rerolls / skips / banishes, a Max Revive to start with, the Rare Candy's two
  levels, and the items you have not unlocked are left out of levels and chests. Armed boosts are spent only
  when the Dive can be kept.
- Your shiny plays shiny.

Not in a Dive: research points for KOs (the Expedition earns them through its economy, which a Dive has not).

Tests: `micasurvivor_m3d_dive_yours_test.mjs` 20 checks in node; `micasurvivor_m3d_dive_page_test.mjs` now 52.

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
3. ~~How far to take movement tech.~~ **Decided 2026-11-12: rails, wall-running and surfing are in the first version.**
4. ~~Upgrades (P5) first?~~ **Decided 2026-11-12: yes, P5 before Dive in 3D (P6).**
5. ~~Old 2D Expedition and Dive.~~ **Decided 2026-11-12: they stay until the 3D ones are complete; when a 3D
   counterpart goes live the 2D mode is removed from the game but its code is kept, archived, not deleted.**
6. ~~Old replays.~~ **Decided 2026-11-12: refuse 2D Expedition / Dive tapes once the modes are 3D, with a notice.**
7. ~~Local co-op in third person.~~ **Decided 2026-11-12: dropped for these two modes.**
8. ~~Transport.~~ **Decided 2026-11-12: "just keep spectating": no peer-to-peer and no new backend; watching over the
   site's relay ships, live co-op does not (it stays on the test page).** Also decided: a 3D run pays into the same
   save as a 2D one, and 3D scores have their own boards. The question as it stood: if the relay is not enough: peer-to-peer only for 3D co-op (no new
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
