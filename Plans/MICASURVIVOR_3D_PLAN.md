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
