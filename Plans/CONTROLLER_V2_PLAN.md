# Battlecards controller v2 — owner feedback (2026-10-01)

Follow-up to `CONTROLLER_SUPPORT_PLAN.md` (phases 0–5, #593–#598). The owner's notes:

1. Hero power should not need its own button.
2. End turn should not be on the menu button (hold Start).
3. The selector must be able to move onto End Turn.
4. The test bar (class picker + player count) must never be visible, with or without a controller. Remove it.
5. Select a card, look at it, and have it **in focus**.
6. The log must be usable, and card names in it must be clickable to see the card. This must work **with and without** a controller.

## What's there today

| Thing | Where | Today |
|---|---|---|
| Board focus | `battlecards/padboard.js` `stops()` | Covers hand, both boards, your panel, the die, and foe panels. It does **not** cover End Turn, the hero-power orb or the Log button. |
| Hero power | padboard `secondary` (top face) → `orbPos()` click | A dedicated button. |
| End turn | padboard hold `menu` (Start) for 0.6s | Fills a bar under `#end-turn`, then clicks it. |
| Test bar | `index.html` `#title` → `#class-select`, `#player-count`; `game.js` ~4997 / ~6394 | Hidden in a match behind ☰ (`body.in-match`), but visible before a match and when the ☰ menu is opened. |
| Inspect | `showInspect()` game.js ~4192 → `#inspect` | A 300px click-through panel pinned at the left edge. Opened by the pad's left face button, or by a click. Not centered or enlarged, and nothing dims behind it. |
| Log | `log(msg)` game.js ~1502 (138 call sites) | Plain strings. The inline `#log` is `pointer-events:none` and fades after 4s. The 📜 drawer `#log-full` holds plain text only and is unreachable from the pad. |

## Phase A: remove the test bar
- Delete `#class-select` and `#player-count` from `battlecards/index.html`, along with their CSS rules: the `body.in-match … select` lines and the 640px media rule.
- Delete their listeners and `.style.display` toggles in `game.js`: `player-count` change (~4997), `$('player-count').value` in `start()`, the class `<select>` build in `start()`, and the ~5419/~5587 hides.
- Keep the `classRegistry` fetch. It is still read by `classPowerOf`.
- Class comes from the deck, as it already does. `magepunk_class_v1` is written by the deck builder. `?players=N` stays as a URL parameter for tests and deep links, since nothing visible sets it any more.
- The deck builder's own `#class-select` (`deck.html`) is a different page and stays.
- **Test:** boot every mode (bare, `?players=4`, a run mode, duel) and assert that neither element exists in the DOM and that ☰ shows only links.

## Phase B: End Turn and hero power become places you can move to
- Add **HUD stops** to padboard `stops()`, all in the `mine` zone:
  - `#end-turn`
  - the hero-power orb (`orbPos()`)
  - `#coin-btn` and `#planeswalk-btn` when visible
  - `#log-btn`
- Confirm on them runs the same click a mouse makes. End Turn keeps its `done-glow`, and a disabled End Turn is skipped.
- The d-pad reaches them spatially: End Turn sits on the right edge, the orb on your panel. **LB/RB** zone-jumping gains a fourth stop, `hud` (End Turn first).
- **Remove** the top-face hero-power binding and the hold-Start end turn, including its fill bar. Using the hero power is now: move to the orb, then confirm.
- **Start** opens a small **match menu** (padnav modal) with Log, Auto-pass on/off, Sound, Concede, and Back. (Open question 1.)
- Update the hint bar text, and the wiki `#/controls` page.
- **Tests (padboard_test):**
  - End Turn and the orb are stops.
  - Confirm on End Turn passes the turn.
  - Confirm on the orb uses the hero power, and a targeted power enters targeting.
  - The top face does nothing.
  - Holding Start no longer ends the turn.
  - Start opens the menu, and every menu entry works.

## Phase C: card focus view (mouse and pad)
A centered, large look at one card, with the board dimmed behind it.
- **Layout:** a new `#card-focus` overlay at about 2× the current inspect size, centered on a dim backdrop. It reuses `showInspect`'s pieces: `drawCardFace`, keyword/modifier lines, the **Creates** list (each entry opens in the same view), action buttons (Play / Trade / Prepare / Forge / Use) and the "why can't I play it" hint.
- **Opening with a pad:** the inspect button (left face) on the focused card. It also opens on confirm when the focused card has no action (an enemy's card, or anything outside your turn) instead of doing nothing.
- **Opening with a mouse:** right-click a card, or long-press on touch. A plain click keeps today's behavior: play, arm an attack, tap. (Open question 2.)
- **Inside the view:**
  - ◄► steps to the neighbouring card in the same zone (your hand, a board row).
  - The action buttons are padnav-navigable.
  - Cancel, Esc or a backdrop click closes it.
- **Hidden info:** face-down or disguised enemy cards and the enemy hand never open. That's the same rule `showInspect` already uses.
- **Focus kept:** on close, board focus returns to the card you were looking at, so "select, look, act" is one flow.
- The small `#inspect` side panel stays as today's quick-glance on hover and click.
- **Tests:**
  - Right-click and the pad's inspect button both open the view on the right card.
  - ◄► cycles through the hand.
  - Play from the view works.
  - Cancel closes it with focus kept.
  - An enemy hand card and a disguised card never open.

## Phase D: a usable log with clickable card names
- **Structured entries:** `log(msg, refs?)` stores `{ text, links: [{ start, end, id, uid? }] }` in `logHistory`.
- **Links:**
  - Automatic: names of cards that are **public in this match** (in play, graveyard, exile, revealed, or already printed by an event) are linked longest-first on word boundaries. This covers all 138 call sites without editing them.
  - Explicit: sites whose event carries `ev.uid`/`ev.id` (plays, deaths, summons, counters, bounces) pass explicit refs, so two cards with the same name resolve correctly.
  - Hidden information is never linked: an unrevealed hand card, a secret or a face-down card.
- **Rendering:** links are `<button class="log-card">` in both the inline feed and the drawer.
  - The inline feed lets clicks through on the links only, and pauses its fade while hovered.
- **Clicking a name** opens the **card focus view** (Phase C) for the live card if it is still on the board, or for its definition otherwise.
- **Drawer upgrades:**
  - Wider and taller.
  - Grouped by turn ("Turn 5 — You").
  - Stays scrolled to the bottom unless you scroll up.
  - Readable text size on mobile.
- **With a controller:**
  - Reach the log from the Log stop or Start → Log.
  - The drawer is a padnav modal: up/down moves between linked names, the right stick scrolls, confirm opens the card, cancel closes.
- **Replays and spectate** use the same `log()`, so they get links for free. Check that a replay's links resolve against its own cards.
- **Tests (new `log_links_test`):**
  - A played card's name is a link, and clicking it opens the focus view on that card.
  - A dead card opens its definition.
  - Same-name copies resolve to the right uid.
  - A card in the opponent's hand that the log never named is not linked.
  - Pad: open the log, move to a name, confirm, view opens; cancel returns to the drawer.

## Phase E: polish and docs
- Hint bar, wiki `#/controls`, and the `controller_polish_test` labels.
- Run the full gate at the end, since this touches `game.js` broadly.

**Order:** A (small, independent) → B → C → D. D depends on C's view. Each phase is its own PR, with a regression test verified by reverting.

## Open questions (defaults in use until answered)
1. **What should Start do?** Default: the match menu (Log / Auto-pass / Sound / Concede / Back).
2. **How does a mouse open the focus view?** Default: right-click or long-press. A plain click keeps playing, attacking and tapping.
3. **Should End Turn ask "you still have plays — end turn?"** when you have playable cards and mana left? Default: no, same as the mouse button.
