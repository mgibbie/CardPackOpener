# MicaSurvivor: full type chart, and 3D attacks that look finished

Owner, 2026-11-13: "I want all 3 games to use the full typing system of effectiveness from the full Pokemon game. For
the 3D modes I would like to graphically upgrade the attacks/effects. I give you permission to download art assets to
use. I think the worst part of those 3d modes is how unpolished the attacks look."

The three games: 2D MicaSurvivor, 3D Expedition, 3D Dive.

## Where things stand (read from the code, 2026-11-13)

**Types.** `micasurvivor/js/data/types.js` already holds the real 18-type chart (gen 6 on, the same rows as
`overworld/battle.js`). What is not the real game is the numbers it turns them into:

| | the Pokémon games | MicaSurvivor today |
|---|---|---|
| super effective | ×2 | ×1.6 |
| not very effective | ×0.5 | ×0.6 |
| immune | ×0 | ×0.3 |
| two types | multiply: ×4, ×0.25 | multiply, then capped to ×0.3 – ×2.4 |

All three games read this one function: the 3D modes take it through `dataFrom(G)` in `m3d/combat.js`
(`typeMult`, `typeLabel`). It is used both ways: your moves on enemies, and enemies' hits on you (an enemy attacks
with its first type). So the rule change is one small edit; the work is in what it does to balance and to the screen.

**3D attacks.** Every attack in the 3D modes is drawn from three primitives in `m3d/render.js`:
- a shot, an orb, a mine, a meteor, an enemy's shot: a plain flat-coloured sphere (`Shots`);
- a swing, an aura, a blast, a warning: a flat ring or arc on the floor (`Flashes.arc`);
- a beam, a chain's links, a dash: a flat-coloured box (`Flashes.bar`).

A hit is a number and a few square sparks. The 2D game, by contrast, has `js/entities/vfx.js`: a pixel-art shape for
every move (flame, drop, leaf, bolt …) in an 18-type palette, with frames. The 3D modes use none of it.

**Replays** (2D and 3D) record what was seen, not inputs, so a rule change does not break an old replay.

## Part A — the full type chart (all three games)

**A1. The rule.** `types.js`: ×2, ×0.5, ×0, multiplied over both types, no cap. Labels become four: `super`
(> 1), `weak` (< 1), `immune` (0), none. One file; the 3D modes follow by themselves.

**A2. What reads a label or a number, fixed in the same change.**
- Hit numbers: 2D `combat.js` and 3D `main.js` (which today tests `eff > 1.2` / `< 0.9`, and `=== 2` / `=== 0` when
  watching). An immune hit shows "Immune" in grey, deals 0, and does not flash, shove, burn, poison or freeze.
- A ×4 hit gets its own bigger number; ×0.25 a smaller one.
- `hurtEnemy` rounds every hit up to at least 1: an immune hit must skip that.
- Items and abilities that key on the label (Expert Belt, Tinted Lens, Weakness Policy, the super-effective perks):
  checked one by one; Tinted Lens also counts a ×0.25.
- The co-op message and the watcher's frame carry `eff`: checked for the new values.
- Help text, the lexicon and the changelog say the new numbers (Spanish source + `lang-en.js`).

**A3. The player is told before it hurts.** With real immunities a bad matchup is no longer "slower", it is "nothing
happens", so the game has to show it:
- an enemy your whole moveset cannot hurt wears a small grey shield mark;
- the level-up card for a move shows what it is strong and weak against in this zone / floor;
- the character select and the Dive floor card show the zone's main types against yours.

**A4. No dead ends.** All four of your moves fire and a species' pool usually has a second type, but some pairings
have none (a pure-Normal moveset in a Ghost zone, Electric into Ground). Rule: a run never offers you only moves that
every enemy type in the zone is immune to; if your moveset has no answer, the next level-up always includes one that
does (every species gets a typeless fallback, Struggle-like, weak but never resisted). A test plays the worst pairings.

**A5. Balance pass.** Swings are bigger both ways (×4 kills in one hit; a ×4 against you can too).
- Run the existing headless fights (`micasurvivor_m3d_parity_test` plays 2D and 3D side by side) before and after,
  for a spread of species × zones, and record time-to-kill and damage taken.
- Tune only if the spread is unplayable, and only with enemy HP / damage constants, never by softening the chart again.
- Boss and guardian fights get a floor so a ×0 or ×0.25 matchup is long, not impossible (A4 covers the ×0 case).

**A6. Boards.** Scores made under the old numbers stay on the boards. The run row already carries a version; add the
rules revision so a later split is possible. No board is wiped.

**A7. Tests.** A chart test (all 324 pairs against `overworld/battle.js`'s table, plus ×4, ×0.25, ×0 cases), an
immune-hit test in 2D and in 3D, the no-dead-end test, the parity test still passing.

*Not in this part unless you say so:* ability immunities (Levitate, Flash Fire, Volt Absorb …) and STAB ×1.5.
MicaSurvivor has its own ability table and its own same-type bonuses; see "Your calls".

## Part B — 3D attacks

The aim: every move reads as its type and its kind at a glance, hits feel like hits, and it still runs on a phone.

**B1. The effects layer (the foundation).** A new `m3d/fx.js`: one instanced, camera-facing, textured particle batch
with normal and additive blending, soft edges, per-particle colour, size, spin and frame animation, a fixed budget and
oldest-first dropping. It replaces `Shots`, the `sparks` list and most of `Flashes`. Rules stay untouched: it draws
from the events and lists the fight already publishes (`shot`, `melee`, `beam`, `chain`, `blast`, `hit`, …).

**B2. The 2D game's own art, in 3D.** Bake `G.VFX`'s shapes (every move's projectile, in its type palette, all frames)
into one atlas at load and draw shots as those sprites, turned to face their direction of travel. No download, and
the 3D modes at once match the 2D game. This alone removes every "coloured ball".

**B3. Downloaded sheets, for what the 2D shapes do not cover.** Pixel-art, frame-animated: impacts and hit sparks,
explosions and smoke, slashes and claw arcs, lightning, fire and ice bursts, water splashes, ground cracks and dust,
shockwave rings, glows and flares for additive light.
- Only art whose licence allows it. First choice CC0 (Kenney's particle and smoke packs, CC0 packs on OpenGameArt
  and itch.io); CC-BY where the pack is clearly better, with the credit. Nothing ripped from a commercial game.
- Each pack goes in `micasurvivor/assets/fx/` (gitignored, deployed with `npm run deploy-micasurvivor`, manifest
  refreshed), with its source, author and licence written into `micasurvivor/CREDITS.md` in the same change.
- Sheets are repacked into one or two atlases and recoloured per type with the 2D palettes, so 18 types share a few
  shapes and still look their own.

**B4. Each kind of move, redone** (15 base kinds, 7 Expedition kinds, 66 + moves):

| Kind | Today | After |
|---|---|---|
| projectile, nova, cone, boomerang | sphere | the move's sprite, a short trail, a muzzle puff, an impact burst where it lands or meets ground |
| beam | box | a scrolling textured beam with a bright core, a flare at the mouth, sparks along the ground where it is cut |
| melee | floor arc | a slash sheet swept through the arc at body height, by type (claw, punch, bite, blade, vine) |
| aura, wave | floor ring | an expanding shockwave ring with type particles thrown up from the floor |
| chain | boxes | a jagged bolt, redrawn each frame while it lives, a spark on each link |
| meteor, lob, smite | sphere + ring | a falling body with a trail, a ground marker that tightens, a crater burst, dust, a short shake |
| mine, turret, trail, vortex | sphere / ring | a small animated object, a lit patch on the floor |
| orbit | sphere | the move's sprite with a ribbon trail |
| dash, spin | box | speed streaks and an after-image of your own sprite |
| buff | nothing | a rising aura in the stat's colour |

Enemy attacks get the same care: shots in the enemy's type (not one pink), warnings that fill in, boss attacks with
their own bursts. Dive Ultimates and Expedition Ultimates reuse the same pieces, larger.

**B5. Hits.** A type-coloured impact sprite on every hit; a bigger one with a ring for super-effective, a dull puff
for resisted, a grey shield flick for immune (ties Part A to the screen). Crits and KOs get a few frames of hit-stop
and a small camera kick (both can be turned off; off by default for anyone with reduced motion set). Enemies flash
white and pop a little when struck; a KO is a burst, not a vanish.

**B6. Status and weather.** Burn, poison, freeze, sleep, paralysis and confusion shown on the enemy (small looping
marks, an ice block for frozen). Rain, sand, snow and fog as particles in the air, not only a screen tint.

**B7. Performance and settings.** One or two draw calls for all effects; budget set from a frame-time measure on a
mid phone (`tools/perf-snap.cjs`); an Effects setting (Full / Reduced) and Reduced chosen by itself when frames drop.
A watcher and a replay draw the same effects from the same events.

**B8. Tests.** Page tests per kind: fire the move, assert the effects layer drew particles of the right atlas cell
and type; a budget test (a 110-enemy fight stays under the cap); the existing 3D suites unchanged, since rules are
not touched. A gallery page (`?fxlab=1`) that plays every move's effect in a row, for your eye and for screenshots.

## Order

1. **A1 + A2 + A7** — the chart itself, numbers, tests. Small.
2. **A3 + A4** — the warnings and the no-dead-end rule. Ships with 1, or right behind it.
3. **A5 + A6** — measure, tune if needed, rules revision on runs.
4. **B1 + B2** — the effects layer and the 2D art in 3D. The biggest single visual jump.
5. **B3 + B4** — downloaded sheets and the kind-by-kind pass, a few kinds per change, with the gallery page first.
6. **B5** — hits. **B6** — status and weather. **B7** runs through 4–6.

Each step is its own PR with tests, merged when you say.

## Your calls

1. **Immunities are real ×0** (your Electric moves do nothing to a Ground enemy; a Ghost takes nothing from a Normal
   enemy's touch). This is what "the full system" means and the plan assumes it, with A3 and A4 to keep runs playable.
   The alternative is ×0.25 in place of ×0.
2. **Ability immunities and STAB**: leave them out (plan as written), or add them as a later step?
3. **Art sources**: free-licence packs only, as written. If you want the real games' attack animations instead, that
   is a different decision and I would want it from you in words.
4. **Hit-stop and camera kick**: on by default, or opt-in?
