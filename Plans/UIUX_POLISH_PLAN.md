# UI/UX Polish Plan — closing the gap to Hearthstone-class presentation

2026-08-27 visual audit. Method: headless screenshots of every Battlecards
surface (mid-game board, mulligan, start, packs, deck builder, gallery,
replays, home) compared against Hearthstone reference shots (board layout,
hero plates, mana crystals, mulligan ritual). The engine and content are
deep; the presentation is what gives the game away as homemade. Ranked by
player-visible impact.

The one-sentence diagnosis: **Hearthstone renders a warm, physical place
where a match happens; we render a debug scene** — dashed wireframe slots,
raw text panels, floating log lines, site navigation visible mid-match.

---

## Batch A — Battle immersion (board dressing) [biggest lever]

The battle screen is ~90% of play time and has the widest quality gap.

1. **Board surface.** The play area is a flat void with faint ellipse strokes.
   Give it a real tabletop: radial "magepunk brass + purple cloth" texture
   (canvas-generated or one self-hosted webp, tinted per run-mode — dungeon
   stone, heist vault, FF crystal…), soft vignette, the center ring made an
   etched brass sigil instead of a green stroke. All static — zero per-frame
   cost (`game.js` board build + scene background).
2. **Kill the dashed wireframes.** Empty creature slots read as debug overlay.
   Replace with subtle inset pads (rounded, ~8% white fill) that only
   brighten when a creature card is being dragged/placed; reserve/land slots
   likewise. The "RESERVE" placeholder boxes need the same treatment.
3. **Hide the site chrome during a match.** The top nav (modes / packs /
   deck builder / gallery / play the RPG) plus the class + player-count
   dropdowns stay visible mid-game — immersion break + misclick risk.
   Pre-game they're fine; once a game starts collapse to a small ☰ that
   expands on click. Concede/Log/sfx stay.
4. **Battle log discipline.** Raw text lines float top-right permanently.
   Show only the last 3 events, fading out after ~4s; the full history
   already lives behind 📜 Log.
5. **Emotes/chat tuck.** 12 emoji buttons + "Say something…" input are
   always on screen (even vs AI). Collapse behind one 💬 button; hide the
   chat input entirely in solo games.
6. **Turn ceremony.** No banner marks turn changes. Add a "YOUR TURN /
   ENEMY TURN" sweep (0.8s, reduced-motion aware), End Turn glows gold when
   you still have playable actions, greys during enemy turns (HS's single
   clearest at-a-glance signal).

## Batch B — Hero & creature presence

7. **Hero plates.** "40 / You — Neutral / Mana 1/1 · Deck 56" is a text box.
   Rebuild as portrait-first plates: character portrait disc
   (`drawHeroPortrait` in cardart.js already exists), life in a red gem
   bottom-right of the portrait, name ribbon, deck/hand as small icons with
   counts. Damage to the hero shakes the plate (shake exists — wire it).
8. **Mana crystals.** Replace the "MANA 1/1" pill with a row of crystal pips
   (filled / empty / locked) — mana at a glance is core card-game literacy.
   Keep the numeric readout as a tooltip.
9. **Damage splats.** On any hit, a rounded-star burst with the number
   (red = damage, green = heal) that pops and fades over ~0.6s, anchored to
   the struck token/plate. Pairs with the existing shake/recoil; this is the
   single biggest "game feel" item Hearthstone has that we don't.
10. **Creature token language.** Attack/health bubbles float detached below
    the art chip. Anchor them ON the chip (sword-gem left, blood-gem right),
    add state visuals: taunt = brass shield arc behind the chip, frozen =
    ice tint, stealth = smoke tint, can-attack = soft green breathing ring,
    buffed stat = green numeral (exists on cards — extend to tokens).
11. **Mulligan spotlight.** The flat purple box becomes a ritual: dim the
    board harder, cards larger and fanned, tap toggles a red ✕ overlay
    (instead of per-card "Keep" buttons), one confirm button. Same logic,
    pure presentation.

## Batch C — One visual identity (site chrome)

12. **Theme split.** start.html, replays.html, home, todo are LIGHT-themed;
    the game, packs, deck builder, gallery are DARK. Two different products.
    Unify on the dark purple/brass game identity for all Battlecards-facing
    pages (home can stay light — it's the portfolio shell).
13. **Start page as a game lobby.** Mode rows are grey list items with emoji
    icons. Make mode cards with real card-art thumbnails (cardart.js can
    render any card face to a canvas — pick a signature card per mode),
    dark theme, the run modes grouped visually (Climb / Lorequest saga /
    PvP), and per-mode progress chips (run record, unlocked characters —
    the data all exists in stats).
14. **Tour restyle** to match (dark, art-backed slides).

## Batch D — Pack-opening ritual

15. The pack is a flat rectangle; opening should be the dopamine peak.
    Foil-texture pack art with per-set tint, hover glow + wobble, click
    tears the top (two-piece split), 5 cards burst out face-down in an arc,
    each flips on click/tap with a rarity-colored flash (gold legendary
    burst + the existing legendary sfx), NEW badge on first-copy cards,
    duplicate cards show the dust value chip. All CSS/canvas — no new deps.
16. Kill the "[Z / click] open a pack — 100 gold" debug-style caption →
    a proper button and a gold-cost chip on the pack itself.

## Batch E — Deck builder depth cues

17. **Mana curve histogram** (live, 0–7+) above the deck panel — THE deck
    builder feature every quality client has.
18. **Deck list rows.** The right panel is blank white space below the name;
    added cards should stack as compact rows: cost gem · name · ×N, colored
    by class, click to remove. Type-count chips (creatures/spells/lands).
19. **Styled dropdowns.** Native `<select>`s (All types / keywords / sets /
    sort) look OS-default; restyle dark to match the filter pills.

## Batch F — Collection polish (small)

20. Rarity gem on every card frame in gallery/builder (common→legendary),
    crisper owned-count badge, a page-number jump control (642 pages!),
    craft-from-gallery on unowned hover (dust system already live).

---

Cross-cutting: every animation honors `REDUCED_MOTION`; everything stays
self-hosted (no CDN fonts/textures); phone layout re-verified via
`tools/perf-snap.cjs board --viewport=phone` after each batch.

Suggested order: **A → B → D → C → E → F.** A+B transform the surface where
players spend 90% of their time; D upgrades the reward loop; C/E/F are
finish work.
