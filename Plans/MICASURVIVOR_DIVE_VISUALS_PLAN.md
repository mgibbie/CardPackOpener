# MicaSurvivor Dive — visuals pass ("look like PokéDive")

Status: PLAN (2026-11-03). Visual-only. No gameplay, layout, collision or hash changes.
Update (2026-11-03, owner): D1 changed: the code-drawn painter is the PRIMARY renderer (no tilesets; they are optional, small decorations only). DV1 + DV2 shipped that way on feat/micasurvivor-dive-visuals: `js/expedition/dive-art.js`, test `micasurvivor_dive_visuals_test.mjs`.
Progress (2026-11-11): DV1–DV5 are built (covered by `overworld/tests/micasurvivor_dive_visuals_test.mjs`) and merged to main at the owner's word. DV6 (perf tuning) is not done and is superseded by `Plans/MICASURVIVOR_3D_PLAN.md`, where this painter becomes the 3D terrain texture.
Rule: no PokéDive files in the repo or the deploy. We use our own shipped decomp tilesets (`overworld/data/tilesets`) and redraw PokéDive's *style* in our own code.

## 1. What PokéDive does (read from its client + 8 route screenshots, 2026-11-03)
- **All terrain art is procedural.** Its art worker paints every floor pixel by pixel. No official tileset is used, so there is nothing to source. Pokémon are PMD SpriteCollab sheets, which we already use.
  - 16 px grid. The wall mass is upsampled to a smooth per-pixel mask, so walls have organic, rounded outlines instead of tile stairs.
  - Every 7-step palette ramp is blended with ordered dithering.
- **Walls by biome.**
  - **Forest, swamp, shroom:** the wall mass IS canopy. It is leaf-noise-shaded, and a staggered tree grid (every 21×12 px) is stamped over it. Trunks show only on the south rim.
  - **Other biomes:** a rock top plus a **16 px south cliff face** with a light lip and a dark base. A 4 px side bevel is added where a face turns a corner.
- **Ground.** Low-frequency 2-tone noise patches, sparse grass tufts and flower specks. A dirt trail is painted along the spawn→stairs path. Debris pebbles sit at the foot of the cliffs. Water has a shore-distance gradient (light rim, dark deep) and an outlined rim.
- **Layers / draw order.**
  1. base canvas (ground, walls, water)
  2. flat-props canvas
  3. per-16px-row **depth bands** of tall props, each at depth = row y
  4. actors (y-sorted)
  5. an "over" atmosphere layer
- **Occlusion and lighting.**
  - **Occlusion map:** a Uint16 per pixel. When an actor stands behind canopy, its **silhouette** is drawn on top, tinted (you: gold `#FFE27A`; others: pale blue `#BFE6FF`) at α 0.5.
  - **Light map:** a darkness overlay in a per-biome colour and alpha (lava `[44,16,34,.74]`, swamp `.5`, shroom `.6`, sea `.38`, ice `.24`, ruins `.12`, forest/desert none). Radial "holes" are cut for the player lamp and prop lights (crystals, lava every 24 px, flicker). An additive coloured glow sits on top.
  - **Ambience:** drifting sun shafts in forest/desert/sea/ruins; caustics on the sea floor.
  - **Vignette:** soft radial, `rgba(10,20,30,.32)` (lava `.55`). A red pulse at low HP.
- **Camera.** Zoom 3 (2 on low quality), about 240 world px tall (≈15 tiles), round pixels, follow lerp 0.15.
- **Fog of war.** Only the minimap has it; the world itself is fully drawn.
- **HUD.** A white rounded card for HP/XP with the partner portrait. A red "Floor N" pill with 25 pips. A dark rounded minimap. The 4 skill buttons are big circles, bottom-centre. Rubik font.

Best comparison: `scratchpad/dive-style/pd_run0.png` (Mossy Woods) vs `ours_forest_1.png`.

## 2. Ours today
- **The painter:** `terrain.js paint()` over `tiles.js paintChunk`. Flat 1-tile walls, grid-stepped edges, a 6 px face, and only 3 biome palettes for 8 routes.
- **Routes look wrong.** Canyon, crater and ruins all reuse `mtmoon`, which is purple, so the crater and canyon render as violet caves. Reef and grotto reuse `cerulean`.
- **No canopy, no occlusion.** Trees are y-sorted prop sprites with no overlap or silhouette.
- **Lighting:** one generic vignette, no biome light map. A 768 px view (≈24 tiles) at 2× art.
- **Nothing ties the floor together:** no path trail, no shore gradient.

## 3. Assets we can blit
- **Source:** `overworld/data/tilesets`. It is gitignored and deployed as `magepunk-owdata` at `/overworld/data/` (CORS `*`), the same way `mega.js` loads `/overworld/data/pokemon/`.
- **Draw recipe:** the recipe in `overworld/engine.js` already handles this:
  - `loadTilesetsFor` :263, palette repaint `applySharedPalettes` / `repaintBands` :319–353, `metatileOf` :355, `drawMetatileTo` :400.
  - Sheets are 128 px wide, with 16 palette bands. A metatile is 8 u16 values (4 bottom + 4 top). Each value encodes `idx&0x3FF`, flipX `0x400`, flipY `0x800`, and `pal>>12`.
  - Secondary ids start at 640 (FRLG) or 512 (Emerald). Always load the primary+secondary **pair**, then repaint the shared palette bands.
- **Ids per route.** FG = FRLG General; EG = Emerald General.

| Route | Pair | Floor | Wall / edge | Decor |
|---|---|---|---|---|
| forest | FRLG General + Viridian Forest | grass FG 1/8/9/16/17, path 9-slice FG 208–226 | canopy 664–666 / 656–658, overlap 672–674, trunk row 675–677 | tall grass FG 13, flowers FG 4, small tree FG 14/15/30/31 |
| marsh | Emerald General + Fortree | EG 1 (darkened), puddles 628–666 | jungle fill EG 199, base EG 23, big canopy 727/735/743 over 624–626 | long grass EG 21 |
| fungal | as forest, magenta/teal palette swap | — | canopy as forest | mushrooms: none in tilesets, so code-drawn (see D3) |
| canyon | Emerald General + Mauville (Route 111) | deep sand 9-slice 584–602 | FRLG cave plateau 648–666, warm-recoloured | rock piles |
| crater | FRLG Mt Ember (General + Cave layout) | ash 813/814, Emerald Fiery Path 776 | wall 708 + face 785, Emerald lava shores 864–882 | crater 725/726/733/734 |
| reef | Emerald General + Underwater | sand 656–681 | seafloor rock 512–620 | seaweed 513/641 |
| grotto | FRLG Seafoam + Emerald Shoal Cave | snowy floor 721–735, ice 896–911 | ice rock 883–890 | ice boulders 642/835/880–884 |
| ruins | FRLG Building + Tanoby | slabs 672–735 | brick walls 641–647 | pillars 649–653; Sky Pillar cracked floor 565/566 |
| origin | Emerald General + Pacifidlog (Sky Pillar) | 563/564 | as ruins | — |

- **Gaps:** no mushroom, swamp or Strength-boulder art exists. Crystal `cr_*` sheets are GBC 4-colour (Ice Path floor 69 renders green), so don't use them.
- **2-tile wall face:** only FRLG cave north wall 708 (top) + 785 (face) has one. All other faces are 1 tile, so we stack a top piece over a face piece.
- **Atlases:** labelled atlases, layout renders and a Python port of the draw path are in `scratchpad/tiles/` (`atlas.py`, `maprender.py`). They are scratch-only.

## 4. Design
- **New `js/expedition/dive-art.js`** (lazy, Dive-only). `G.DiveArt.build(L, route)` returns `{base, over, bands, occ, lights}`, made from the layout `L` alone and seeded by `seedOf(seed, route, floor, 'art')`. It never touches the gameplay rng, so viewers and replays get identical art without a new block or a `zone.hash` change.
  1. **Tileset mode (default).** A route→`{pair, floor[], wallTop, wallFace, canopy[], decor[]}` table (the §3 ids). Steps:
     - Classify each tile with a 4-neighbour mask (top / face / inner and outer corners / rim) and pick a metatile.
     - Floors vary by a hash of the tile coordinates.
     - The 2-row south face draws on the wall tile above any floor.
     - Walls in lush routes get canopy metatiles in 3-wide stamps, overlapping 1 row onto the floor.
     - The path trail is a 9-slice along `L.path`. Water uses the pond 9-slice.
  2. **Procedural fallback** (art not loaded, or the owner picks it, see D1): today's painter plus the PokéDive treatments (smooth mask, 16 px face, dither ramps). This keeps tests and offline play working.
  3. **Bake:** one `base` canvas of 56×40×16 px (896×640, about 2.3 MB). Canopy/tall props go into row bands, as PokéDive does. Also bake `occ` (Uint16 per art px, holding the band's y).
- **Hooks (small):**
  - `world.chunkImage` uses `zone.art` when present (crop from `base`).
  - `game.drawScene` draws the Dive bands in the y-sort as pseudo-props, then calls `G.ExpDive.drawSilhouettes(ctx)` after the entities. For each actor with `occ[foot-10 px] > y`, it draws a tinted silhouette using a cached tinted sprite canvas.
- **Style pass:**
  - **Light map:** an offscreen ¼-resolution canvas filled with the biome colour. Cut holes for the player (r ≈ 90 px), crystals, lava and the landmark, using `destination-out`. Composite every frame, with an additive glow pass.
  - **Biome vignette:** replace `World.drawVignette` in Dive.
  - **Ambience:** sun shafts in forest/canyon/reef/ruins, dust/snow/spores particles via existing `G.Weather` hooks. All of it is gated by `G.Settings.fx`, and `calm` disables flicker.
  - **Camera (D2):** Dive-only `Display.viewW` ≈ 640 world px (≈20 tiles; PokéDive is ≈26 wide at 1280). The follow damp goes from 9 to 6.
  - **HUD (D4):** restyle in Dive only:
    - an HP/XP card with a portrait
    - a red floor pill with the 25 existing pips
    - a rounded minimap that keeps its fog of war
- **Mobile budget:**
  - The bake runs once per floor at under 40 ms on mid phones. It is chunked over 2–3 frames behind the existing floor fade, then cached by `seed|route|floor`, keeping 2 entries.
  - Memory per floor: base 2.3 MB + bands about 1.5 MB + occ 1.1 MB.
  - Per frame: crop blits only, plus a ≤480×270 light canvas refreshed at 30 Hz (15 Hz on low).
  - Low quality skips bands/occlusion (canopy goes into base) and the light map.
  - Verify with `tools/perf-snap.cjs`.

## 5. Batches (each one: gate `run-all.mjs --changed` + the listed test, with screenshots via `SHOTS=`)
1. **DV1 Loader.** `dive-art.js` with the tileset pair loader and repaint (a port of engine.js :263–400 into a small shared module, not a re-export), plus the procedural fallback. Test `micasurvivor_dive_art_test.mjs`:
   - the same floor gives byte-identical `base` across 2 pages
   - no Math.random
   - `zone.hash` is unchanged from today for 50 seeds
   - the fallback is used when `/overworld/data` 404s
2. **DV2 Autotile + routes.** Per-route tables, 4-neighbour classification, 2-row faces, path trail, pond 9-slice. Test:
   - every route bakes
   - no wall tile left unclassified
   - golden pixel hashes for 3 seeds per route
   - screenshots of 8 routes
3. **DV3 Canopy + occlusion.** Bands, the `occ` map and silhouettes. Test:
   - an actor placed behind canopy gets a silhouette, one in the open doesn't
   - y-sort is unchanged for non-Dive modes
4. **DV4 Light/vignette/ambience.** Test:
   - per-biome alpha and colour
   - `fx=0` skips the light map
   - `calm` stops flicker
   - the render stays deterministic for replays (time-driven only, no rng)
5. **DV5 Camera + HUD.** Test:
   - the Dive view width
   - phone 844×390 fits
   - the HUD line text is unchanged (`micasurvivor_dive_test` still passes)
6. **DV6 Perf.** `perf-snap` on low/mid, then tune the bake split and cache size. Test: bake time and memory caps.

## 6. Open decisions (recommended default in bold)
- **D1 Art source:** **GBA tilesets (FRLG/Emerald) blitted**, with a PokéDive-style procedural painter as fallback. Alternative: fully procedural (closer to PokéDive's soft painted look, more code, no asset dependency).
- **D2 Camera:** **~20 tiles wide (zoom-in from 24)**, alternatively match PokéDive (~26 at desktop, 15 tall).
- **D3 Fungal / marsh art:** no mushroom or swamp tiles exist. **Recolour the Viridian/Fortree canopy (magenta/teal; murky green) and draw giant mushrooms in code**. Or ask for new art.
- **D4 HUD restyle:** **Dive-only** restyle (white cards, red floor pill). Or leave the shared MicaSurvivor HUD as is.
- **D5 World fog of war:** **none** (PokéDive has none; minimap fog stays). Or darken unexplored tiles.
- **D6 Palette fidelity:** **keep GBA palettes, apply the route light map/tint over them**. Or remap tiles onto PokéDive-like 7-step ramps (more "PokéDive", less "GBA").
