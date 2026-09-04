# Pokémon overworld + battle — feel / graphical-presentation plan

2026-09-04. Method: fresh headless screenshots of the overworld (PalletTown walk)
and a wild battle (menu/moves/bag/switch, desktop + phone) via `tools/perf-snap.cjs`,
cross-read against the render code. Ranked by player-visible impact.

## What already exists (do NOT re-pitch — verified in code)
The overworld and battles are faithful GBA-style and already carry a real feel base:
- **Battle** (`overworld/battle.js` render ~4892–5324): idle sprite **bob** (:5064),
  **type-glow platform** ellipses (:5153), **screen shake** on hit (:5268), **hit-spark
  particles** (:5300), **floating combat text** (:5309), an **intro flash** (:5261), a
  **weather tint + label** (:5280), a **6-archetype attack system** (beam/slash/shot/
  burst/strike/boost — `animArchFor` :476, `drawMoveFx` :5084), ball send-out sparkle
  (:938), faint anim (:3436). Move menu already shows KO-prediction + "you move first".
- **Overworld** (`overworld/main.js`): `drawWeather` rain/sand/hail/ash (:7231, drawn
  :7374 "under the day-night mood"), a day-night mood tint, follower sprites.

The gap to "feel": the **battle stage is generic** (one flat sky gradient for every
location; weather is a color wash, not weather), **transitions/juice are minimal**
(2-frame intro strobe, instant HP bar, basic capture), and the **overworld lacks
ambient motion + dynamic lighting**. Everything below builds on the base above.

---

## Batch A — Battle stage identity [biggest lever]
The battle screen is a flat sky→green gradient (`battle.js:5270`) regardless of where
you are — every fight looks identical. This is the widest quality gap.
1. **Per-terrain battle backgrounds.** Pick a backdrop from the encounter's map
   (map_type / tileset / `mapWeatherNow`): grass field, forest, cave, water/surf, sand,
   city, gym interior, indoor. Canvas-generated layered scene (sky band → horizon →
   ground plane), tinted per terrain — cache like the current gradient (zero per-frame
   cost). Optional: a few self-hosted webp backdrops for hero terrains.
2. **Textured platform discs** per terrain (grass tuft / cave rock / sand / water
   ripple) replacing the plain type-glow ellipse (`:5153`); keep a subtle type glow on top.
3. **Time-of-day + route tint** on the stage (reuse `Clock.phase` + the route's weather)
   so a night cave and a noon meadow read differently.

## Batch B — Battle weather & atmosphere
Weather in battle is only a color tint + a text label (`battle.js:5280`).
4. **Real in-battle weather particles** — port `main.js drawWeather` into the battle
   render: rain streaks + splash, sandstorm gusts, hail, harsh-sun rays / heat shimmer,
   fog. Keep the label; drop the flat wash in favor of actual weather.
5. **Ambient stage particles** (drifting pollen / embers / dust / leaves per terrain)
   for depth and life behind the combatants.

## Batch C — Battle juice & feedback
6. **Animated HP drain** — lerp the displayed HP (currently updates instantly) with a
   green→yellow→red color shift and a low-HP pulse; animate the **EXP bar fill** on win.
7. **Battle-start transitions** — replace the 2-frame black/white strobe (`:5261`) with
   a small set (swirl, horizontal wipe, zoom-lines, trainer-VS flash) chosen by encounter
   type (wild / trainer / gym / legendary). Reduced-motion → simple fade.
8. **Hit-reaction polish** — struck-mon recoil + white flash, crit = bigger shake +
   flash, and **effectiveness emphasis**: "super effective" = screen tint + stronger
   shake, "not very effective" = muted. (Shake exists at `:5268` — extend it.)
9. **Faint + capture** — faint = slide-down + fade + desaturate; capture = ball arc →
   N wobbles with rising tension → click + **star burst** on success, break-out shake on
   fail (the current flow is message + fanfare only).

## Batch D — Attack-animation depth
10. **Enrich the 6 archetypes** (`drawMoveFx :5084`): type-colored beams with gradient +
    glow, projectile **arcs with trails** for shots, multi-streak slashes, impact rings,
    a screen-flash on heavy hits. Add self-buff **aura** + multi-hit flurry archetypes.
11. **Signature-move accents** — a small override table for the highest-profile moves
    (Hyper Beam, Solar Beam, Earthquake screen-quake, etc.) on top of the id heuristic.

## Batch E — Overworld ambiance & lighting
12. **Dynamic day/night lighting** — warm dawn/dusk gradients, cool night, **lamp /
    window / sign glows** after dark, smooth sunrise/sunset transitions (today it's a
    static "mood" tint at `main.js:7374`).
13. **Overworld weather polish** (`drawWeather :7231`) — rain puddles + ripples, layered
    fog, snow accumulation, an occasional **lightning flash + thunder**, wind-driven leaves.
14. **Water shimmer + reflections** (player / trees / buildings mirrored in water) and
    animated flowers / tall-grass sway.

## Batch F — Overworld motion & transitions
15. **Field juice** — tall-grass rustle + leaf particles on step, footstep dust, ledge-hop
    dust arc, run dust; **door/warp fade** transitions; an **area-name banner** when you
    enter a new town or route.
16. **Ambient life** — NPC idle sway, drifting bird/cloud shadows, light shafts through
    trees; an optional themed vignette/border to dress the widescreen letterbox.

---

Cross-cutting: honor `REDUCED_MOTION`; keep everything self-hosted / canvas-generated
where possible (no external asset host); **cache** backgrounds/platforms/gradients (the
battle already caches its gradient — keep per-frame cost flat); re-verify phone FPS with
`tools/perf-snap.cjs battle|overworld --viewport=phone` after each batch.

Suggested order: **A → B → C → D → E → F.** A+B rebuild the battle *stage* (where fights
happen and the identity gap is widest); C+D add battle *juice*; E+F polish the overworld.
Run batches on command, one PR each, screenshots before/after.
