# Magepunk — Project Improvement Plan

_Practical, mostly-easy ways to make the project better, ranked by impact vs. effort.
Written 2026-08-12, after the main-page redesign._

The content is enormous and deep (7,491 Battlecards, four run modes, a web RPG, a
design wiki, accounts). The biggest gaps are **not content** — they're
**discoverability, onboarding, and retention**. Most of the wins below are hours,
not weeks.

---

## Tier 0 — Highest leverage, low effort (do these first)

### 1. A Battlecards "start screen" / mode picker  ⭐ biggest win — ✅ DONE (2026-08-12)
Run modes used to exist only via URL params (`?heist=1`, `?tombs=1`, `?dungeon=1`,
`?duels=1`), so almost nobody found them. Built `battlecards/start.html`:
- **Quick Match**, **Dungeon**, **Heist**, **Tombs**, **Duels**, plus **Deck Builder**,
  **Packs**, **Gallery**, and **How to Play** — each with a one-line description/icon.
- Run tiles show a green **"▸ Resume"** badge when a saved run exists in localStorage.
- Reuses the hub's tile style; the main-page flagship link and the in-game title bar
  ("modes") both point here.
- Follow-ups: split "New run" vs "Continue" explicitly; a starter-deck picker for Duels;
  boss-select for one-off encounters (`?boss=<id>`).

### 2. First-run onboarding for Battlecards — ✅ DONE (2026-08-12)
Built a first-run tour on `battlecards/start.html`: a 3-slide overlay (welcome →
how a turn works, linking to the full rules → "you're ready, you have a Mage Starter
deck") that shows once (localStorage flag) and is replayable via a "Take the tour"
footer link. New accounts already receive a 40-card **Mage Starter** deck + welcome
packs from the backend, and own the card pool for the other classes' starters.
- Added two more valid 40-card starters (**Warrior** aggro, **Hunter** beasts); new
  accounts now get all three (Mage/Warrior/Hunter) and existing accounts receive the
  new cards + deck slots via a one-time V3 baseline top-up.
- Follow-up: starters for the remaining classes + a one-click "claim starter" in the
  deck builder, and a scripted tutorial match for the true first game.

### 3. Cross-link the site consistently — ✅ DONE (2026-08-12)
Built `/site/topbar.js` — one shared bar (⚙️ Magepunk wordmark → home + account +
inbox bell) now on the hub, Battlecards start, collection, profile, learn, news, and
og pages. See also the social inbox below (#12). The Overworld and the in-game Battlecards
screen opt into a **compact floating variant** (a small home + inbox-bell cluster
in the corner) via `<meta name="mp-topbar" content="compact">`, so the bar reaches
every screen without covering gameplay — verified the Overworld's `typingInChat()`
guard already stops the inbox composer from driving the game.

### 4. SEO & link-sharing basics — ✅ DONE (2026-08-12)
- Per-page `<title>` + `<meta name="description">` across the public pages.
- **Open Graph + Twitter card** tags on the hub, Battlecards, Learn, News, OG, and
  Collection pages, with a rendered **1200×630 share image** (`/og-image.png`) so
  links unfurl in Discord/social.
- `sitemap.xml` (9 URLs) + `robots.txt` at the root (disallowing `/api`, `/server`,
  and the logged-in pages).
- Follow-up: a Battlecards-specific share image, and a canonical `<link>` per page.

---

## Tier 1 — Easy quality-of-life

### 5. Deck Builder search & filters
Verify/upgrade the deckbuilder to have: text search, filter by class/cost/type/keyword,
and "cards you own vs. all." With 7,491 cards this is essential for it to feel usable.
(Collection + deckbuilder already have hover tooltips — good.)

### 6. Match UX niceties
- A visible **game log** panel (what happened, whose turn) — huge for a deep card game.
- **Concede / rematch** buttons on the match screen.
- A "mulligan" confirmation and clearer priority/end-turn affordances.
- Effort: a day, incremental.

### 7. Collection completion goals — ✅ DONE (2026-08-12)
The collection page now has a **completion meter** ("N / 6,265 collected · X%"), a
per-class **breakdown** (each class's owned/total with a mini bar), and a
**Show: Owned / Missing / All** selector — Missing/All render the whole pool with
unowned cards dimmed and tagged "Not owned" (capped at 750 with a "narrow with the
filters" note for a fresh account's ~6k missing cards).
- Follow-up: group Missing by set, and a "cards you can craft/afford" hint.

### 8. Loading & perf polish
- `cards.json` is large (7,491 entries). For pages that only need names/costs, ship a
  **slim index** (id, name, cost, class, rarity) and lazy-load full defs on demand.
- Add long-cache headers for static assets (Cloudflare `_headers`), and confirm the
  art/data offload domains cache aggressively.
- Run **Lighthouse** on the main page + Battlecards; fix the top 3 findings.
- Effort: half a day. Impact: faster first paint, less bandwidth.

---

## Tier 2 — Retention & cadence (medium effort, compounding value)

### 9. Daily pack loop — ✅ DONE (2026-08-12)
A twice-daily "come back" loop: a free pack accrues **every 12 hours** into a
special **pack inbox** that holds up to **120**. Backend (`server/mp.mjs`) does
lazy accrual (`accruePacks`) — no cron needed — pausing the timer while the inbox
is full; new `pack-timer` (cheap poll) and `claim-packs` actions; the fields ride
`publicState`. The inbox's new **Packs tab** (`/site/topbar.js`) shows a live
progress bar + `HH:MM:SS` countdown to the next pack, `N / 120` waiting, and a
**Collect** button (moves them to your stash to open on the Packs screen); the bell
badge nudges when packs are waiting.
- **Daily quests — ✅ DONE (2026-08-12):** four fresh quests each UTC day, seeded
  deterministically per account so a refresh never rerolls them. A varied pool —
  play N cards / creatures / spells, N cards of a **class**, with a **keyword**
  (Taunt/Rush/Lifesteal/…), at a **mana cost** (≤ / ≥ / exactly), or **win N
  matches** — with the first quest always completable by any deck. Progress comes
  from the game reporting each card you play (class/type/cost/keywords) and wins
  via a batched `quest-event`; a finished quest's reward **packs drop into the 12h
  pack inbox**. New **Quests tab** in the inbox with progress bars, reward icons,
  a countdown to the daily reset, and Claim buttons; the bell badge nudges when a
  quest is claimable.
- **Daily streak — ✅ DONE (2026-08-12):** a once-per-day reward whose size grows
  with your consecutive-day streak (a milestone every 7th day gives a bigger pack
  bundle); miss a day and it resets. Rewards drop into the pack inbox. Shown as a
  🔥 banner atop the Quests tab with a 7-day dot track and a Claim button.

### 10. Weekly featured content
You have the whole import + wiki pipeline. Rotate:
- A **featured deck of the week** on the main page / Battlecards start screen.
- A **spotlight card** with its wiki blurb.
- Effort: small once templated; can even be data-driven from a JSON.

### 11. Lightweight, privacy-friendly analytics
You can't improve what you can't see. Add a self-hosted counter (or Cloudflare Web
Analytics — no cookies) to learn which games/modes people actually open. Effort: 30 min.

---

## Tier 3 — Bigger bets (worth planning, not "easy")

### 12. Finish multiplayer  — social layer ✅ DONE (2026-08-12)
Built a shared **social inbox** into the top bar (`/site/topbar.js`), on the existing
`/api/mp` backend, so you can be social without opening the Overworld:
- **Challenges** — accept card duels right there (they launch `?cardpvp=<id>`); Pokémon
  routes to the Overworld where the party/renderer live.
- **Friends** — presence + one-click "Card battle" (deck-picker → challenge → launch)
  and "Message".
- **Messages** — per-friend DM threads over the `u:<name>` chat rooms.

Still bigger bets: `Plans/MULTIPLAYER_FIX_PLAN.md` bugs, a real **lobby / matchmaking**
(quick-match queue), **spectate**, and a post-game summary. Also worth doing: let the
inbox **send** Pokémon challenges standalone (needs the team snapshot, which currently
only the Overworld builds).

### 13. Mobile match layout — ✅ DONE (2026-08-12)
The Battlecards board already re-frames its camera for portrait/landscape (pulls
back on narrow aspect) and taps work (Pointer Events), and there was already a
`@media (max-width: 760px)` compaction pass. Added on top:
- **Safe-area insets** (`env(safe-area-inset-*)`) on the corner controls (title,
  concede, end-turn, auto-pass, mana readout) and the compact top bar, so nothing
  hides under a notch or the home indicator.
- **Decluttered the title nav on phones** — the compact top bar covers navigation,
  so only the wordmark (→ mode picker) shows.
- A dismissible **"Rotate to landscape"** hint on portrait phones (remembered in
  localStorage), since the board is wide. Verified the display states headless.
- Follow-up: a true portrait-first board (stacked lanes) rather than a rotated
  landscape board, and bigger tap targets for the in-scene cards.

### 14. Accessibility pass
- Colorblind-safe class/keyword colors (or a toggle).
- Keyboard navigation for menus and the deckbuilder.
- Respect `prefers-reduced-motion` (the main page float animation should honor it).

---

## Suggested order of attack
1. Battlecards **start screen / mode picker** (Tier 0 #1) — unlocks hidden content today.
2. **Cross-site top bar + back-links** (#3) and **SEO/OG** (#4) — cheap, site-wide polish.
3. **Onboarding + starter decks** (#2) — fixes the new-player cliff.
4. **Daily quest/pack** (#9) — turns visitors into returners.
5. Then pick from Tier 1 by whatever annoys you most while playing.

## Quick-win checklist (each < ~2 hours)
- [ ] `prefers-reduced-motion` guard on the main-page card float
- [ ] OG/Twitter meta + one share image
- [ ] `sitemap.xml` + `robots.txt`
- [ ] "◀ Magepunk" back-link on every sub-page
- [ ] Collection completion meter
- [ ] Cloudflare Web Analytics snippet
- [ ] Audit every page's `<title>`/`<meta description>`
