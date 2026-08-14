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

### 5. Deck Builder search & filters — ✅ DONE (2026-08-14)
The builder already had CLASS/NEUTRAL tabs, text search, and a mana-cost row — but was
**owned-only** with no type/keyword filters. Added:
- a **card-type** dropdown and a **keyword** dropdown, both **built from the actual
  collectible pool** (no dead options — 39 keywords surfaced), title-cased;
- an **Owned / All** toggle (the builder was hard-filtered to owned cards) — All shows the
  whole class/neutral pool with unowned cards **dimmed + "Not owned"** and still non-addable;
- all filters **compose** with the existing tab/search/mana.
Verified with an extract test of the real `applyFilters`/`baseList` predicate (11 —
owned-vs-all, type, keyword, mana, search, and combinations) and a headless deck-builder
boot (7 — dropdowns populate, controls visible, the toggle re-filters and changes the pool,
a type filter re-runs and only narrows). (Collection + deckbuilder hover tooltips already
existed.)
- **Sort + set filter — ✅ DONE (2026-08-14):** a **Sort** dropdown (Cost / Rarity / Name) and a
  **Set** filter (built from the pool's `set` values — 57 sets, short codes upper-cased) now sit
  alongside the type/keyword/owned filters and compose with them. Verified with the extract-test of
  the real `applyFilters`/`sortCards` predicate (8 — cost/rarity/name sort, set filter, composition)
  and the deck-builder boot (dropdowns populate, no regression).
- Dropped the **"craftable/affordable" hint**: there's no crafting or targeted-buy economy — gold
  only buys *random* packs (and MP accounts use earned packs, not gold), so a craft hint would
  mislead. Cards come from packs + starter decks + the weekly Collect.

### 6. Match UX niceties — ✅ DONE (2026-08-14)
- **Scrollable game log** — the in-game log was a 7-line ephemeral strip (hidden on
  mobile). A **📜 Log** button now opens a scrollable drawer with the full match
  history (bounded to 500 lines), mobile-friendly; the inline strip still shows the
  last few lines.
- **Concede everywhere** — was runs-only; now works in Quick Match / AI / duels
  (engine `concede()` = 0 life + `checkGameOver`; 1v1 gives the opponent the win, FFA
  drops just the conceder). Guests relay a `{k:'concede'}` intent (host authoritative).
- **Mulligan** — an opening-hand mulligan at the start of your first turn: tap cards to
  swap, confirm; the picks shuffle back and replacements come off the top (the Coin
  can't be swapped). Engine `mulligan(state, pi, uids)` primitive; the client offers it
  to the human (modal), auto-mulligans AI seats (toss cost≥5), and the guest relays
  `{k:'mulligan',uids}`. Quick Match / AI / duels only — the PvE run modes keep their
  tuned openings. Deterministic (seeded rng), so a duel guest's swap matches the host.
- Verified: engine `mulligan_test` (12) + concede assertions in `ffa_duel_test` (31),
  client relay/AI extract tests, a headless Quick-Match boot that confirms the mulligan
  modal appears/marks/confirms/logs with no errors, and the full engine suite (190).
- Still open from here: clearer priority/end-turn affordances.

### 6b. FFA rematch lobby — ✅ DONE (2026-08-14)
The 1v1 rematch handshake generalized to an **N-player rematch lobby**. On a finished
match's overlay (1v1 or FFA) you tap **Rematch** to opt in; the server (`duel-rematch`)
collects joiners and, once **≥2 are in AND either everyone present has joined or a short
grace (~12s) elapses**, a deterministic minter (the lowest-original-seat joiner → the
new host) mints a fresh cardmatch **reusing each returning player's original seat + deck
and AI-backfilling anyone who didn't come back**. The mint is idempotent (`rematchMatchId`)
and minter-only, so concurrent polls can't double-mint. The client shows a live lobby
count (`joined/present`) and lets a late player join; 1v1 keeps its exact behavior (both
must join → mint) and "Accept X's rematch" phrasing. Verified with a server extract test
(19 — 1v1 preserved, FFA grace-mint + AI backfill, seat/deck reuse, minter-only,
idempotency, auth) and a client extract test (6 — join relays op:offer, mint navigates,
lobby relabel, seat-aware identity).

### 7. Collection completion goals — ✅ DONE (2026-08-12)
The collection page now has a **completion meter** ("N / 6,265 collected · X%"), a
per-class **breakdown** (each class's owned/total with a mini bar), and a
**Show: Owned / Missing / All** selector — Missing/All render the whole pool with
unowned cards dimmed and tagged "Not owned" (capped at 750 with a "narrow with the
filters" note for a fresh account's ~6k missing cards).
- Follow-up: group Missing by set, and a "cards you can craft/afford" hint.

### 8. Loading & perf polish — ✅ DONE (2026-08-14, partial)
- **Root `_headers`** (new): code + markup (`.html/.js/.mjs/.css`) revalidate via etag so a
  deploy is live immediately (names aren't content-hashed); JSON gets a 5-min cache (fast
  repeat loads, refreshes within minutes of an import); immutable media caches 7–30 days;
  plus site-wide `X-Content-Type-Options: nosniff` + `Referrer-Policy`. (A known Lighthouse
  "efficient cache policy" win.)
- **Offload art cache** — edited `battlecards/art/_headers` 1 day → 7 days (crops are effectively
  immutable). NOTE: `battlecards/art/` is **.gitignored** (it's the separate magepunk-cardart
  project's source), so this local edit only takes effect when that offload project is redeployed
  — it does NOT ship with the main repo's push.
- **Preconnect / dns-prefetch** to the offload domains (magepunk-cardart, magepunk-owdata) on
  the art-heavy pages (battlecards index/deck/packs/viewer/start, overworld) so the TLS
  connection is warm before the first image/data request.
- Verified the beacon/label + a headless boot (preconnect present on an art page).
- **Direct art URL — ✅ DONE (2026-08-14):** cardart.js used to request `/battlecards/art/*`
  (relative), which **302-redirects** to the offload project — so every card image paid a redirect
  hop on a cold cache. On a deployed host it now requests `magepunk-cardart.pages.dev` **directly**
  (local dev keeps the relative path for its own files), with a one-shot `onerror` fallback to the
  redirect path so the worst case is exactly the old behavior. `index.json` gets the same
  primary→fallback. Verified: base-URL selection (6 — prod/preview→direct, localhost/127/file:→relative),
  the offload serves art directly with `access-control-allow-origin: *`, a real-browser check that a
  cross-origin offload image loads AND draws to a canvas **untainted** (canvas readback works), and no
  regression in the local render path.
- **Follow-ups (deferred, deliberately):**
  - **Minify `cards.json`** (4.1 MB → 2.6 MB raw, −38% parse; −14% gzipped) — real, but the source
    is pretty-printed for the card-import tooling + reviewable diffs, so it needs a build step
    (this is a no-build static deploy) rather than an in-place minify that the importers revert.
  - A **slim index** doesn't help the heavy consumers (game/deck/collection all need full defs to
    render faces), so it was dropped.

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

### 10. Weekly featured content — ✅ DONE (2026-08-14, spotlight card)
**Card of the Week** on the Battlecards start screen — a curated legendary that rotates
**deterministically each week** (`pool[⌊now / 7d⌋ % len]`), so it changes on its own with no
cron/backend and is stable all week. Data-driven from a tiny curated **`featured.json`** (120
legendaries with real art + rules, class-diverse, ~32 KB / ~8 KB gz) generated by
`tools/gen_featured.mjs` — so the start screen never has to load the 4 MB `cards.json` (or THREE)
just to show one card. Renders an HTML/CSS spotlight: the art crop (from the **direct offload
URL**), mana badge, name, class/type/rarity + stats, the rules text via `keywords.js` `richHtml`
(keyword-highlighted), a keyword blurb, a "See it in the Card Gallery" CTA, and a **Collect
button** — one free copy of the week's card added to your collection. The claim is
**server-authoritative**: `claim-featured` derives THIS week's card from the deployed
`featured.json` (so a tampered client can't swap it for a chosen card) and grants it **once per
UTC-week** (`user.featuredClaims`, old keys pruned); `publicState.featuredClaimed` drives the
initial button state (logged-out → "Log in to collect", claimable → "Collect (free)", claimed →
"Collected this week"). Verified: weekly determinism, a headless render, the server claim (11 —
once/week, server-derived/un-spoofable, 503 on pool-load failure, prune), and the button states +
claim flow headless (7).
- **Return loop — ✅ DONE (2026-08-14):** turned the Card of the Week + Collect into a real
  retention loop, alongside the daily pack/quest/streak loops. **Nudge:** `pack-timer` (already
  polled by the top bar every 12s) now returns `featuredClaimed`; the inbox **bell badges** when
  this week's card is uncollected, the **Alerts** tab shows a "Free Card of the Week — Collect" row
  linking to the start screen, and it clears once collected. **View-only archive:** a **"Past weeks"**
  strip on the start screen shows the previous 8 weeks' cards (deterministic `pool[week%len]`, art +
  name + "Last week / N weeks ago"), no claim. Also made `gen_featured.mjs` **deterministically
  shuffle** the pool so consecutive weeks land on varied cards (not alphabetically adjacent) — server
  + client read the same file, so they always agree on the week's card. Verified: the badge logic
  (8 — claimable only when logged-in + uncollected, aggregates, poll-driven) and a headless boot (7 —
  archive renders 8 with relative labels + offload art, the bell badges, and the Alerts nudge appears).
- Follow-up: a **featured deck of the week** — deferred because it needs hand-curated decklists
  (the mechanism/JSON pattern is in place to add them). Re-run `gen_featured.mjs` after big card
  imports to fold new legendaries into the pool (optional — rotation works on the existing pool).

### 11. Lightweight, privacy-friendly analytics — ✅ DONE (2026-08-14)
Self-hosted, **cookieless, no-PII** page-open analytics on the existing `/api/mp` + D1 backend —
no third-party, no accounts, no IPs stored.
- `hit` + `stats` actions in `server/mp.mjs`, **before the token gate** so anonymous visitors
  count too; a daily rollup doc (`stat:<UTC-day>`) with a per-day key cap (400) so junk can't
  grow it, and slug-sanitised event labels (no injection reaches storage).
- A `sendBeacon` **page-open beacon** in the shared `site/topbar.js` that derives a coarse mode
  label from the URL (`home`, `bc:duel`, `bc:dungeon`, `bc:deck`, `overworld`, `ow:battle`, …).
- A minimal **`stats.html`** (noindex) that renders totals-over-window bars + a per-day breakdown.
- Verified: analytics logic (10 — hit rollup, sanitisation, key cap, stats window, label
  derivation across 15 URLs) + a headless boot (beacon fires with the right label; stats.html
  renders the summary + per-day).
- **Client error beacon — ✅ DONE (2026-08-14):** uncaught errors + unhandled promise rejections
  now surface instead of dying silently in a player's console. `site/topbar.js` installs
  `window` `error`/`unhandledrejection` handlers that `sendBeacon` `{msg, where, page, ua}` to a
  new **`err`** action (unauthenticated, before the token gate; **no PII** — message/location/
  browser only), which keeps a **daily rollup deduped by a hash of msg+where** (so an error LOOP
  can't flood) with a per-day key cap. The client also **dedups within the session and hard-caps
  at 12 sends**. A new **`errors.html`** (noindex) lists recent crashes by count — message,
  location, page, browser, last-seen. Verified: server rollup/dedup/cap/sanitise + client
  dedup/throttle (11) and a headless boot (an uncaught error AND a rejection beacon through with
  real messages; `errors.html` renders the rollup — 5). Note: same-origin app errors give full
  messages; cross-origin (CDN) scripts still mask to "Script error." per the browser.

- **Server input hardening — ✅ DONE (2026-08-14):** `/api/mp` (`server/mp.mjs`) is internet-facing —
  anyone can POST — and had solid per-field validation in spots but **no rate limiting** and several
  hot paths wrote verbatim client blobs to KV (worst: `card-act` writes each intent as its own row,
  seq clamped 0–999999 = up to 1M rows/seat a malicious guest could flood). Added defense-in-depth:
  (1) **body cap** — reject `content-length > 2MB` → 413 before parsing; the body must be a plain
  object. (2) **Rate limits** — `rateLimit()` is a coarse fixed-window counter keyed by identity, one
  overwritten `rl:<bucket>` key per identity×action (bounded keyspace; approximate under concurrency,
  which is fine for an abuse brake). An authenticated gate (after the token check, before the
  per-request maintenance writes) throttles the write/relay-heavy actions per account → 429
  (card-act/card-publish/publish-cardstate 120·10s, matchmake-join 30·60s, chat-post 40·10s, challenge
  20·60s); the two unauthenticated beacons (`hit`/`err`) bucket by client IP (cf-connecting-ip) and
  silently drop over-limit. (3) **Shape/size caps** — a relayed `card-act` intent must be a non-array
  object ≤ 4KB (bounds each KV row) else 400; presence/label free-text is length-capped in
  heartbeat / publish-cardstate / card-publish. Limits are 5–12× legit play so real traffic never
  trips. Verified: `tests/unit/server_hardening_test.mjs` extracts + exercises the limiter (window
  fill/block/reset, per-bucket isolation, bounded keyspace) + source guards (15, in run-all); the
  3-browser relay harness proves 413 / bad-intent / 429 END-TO-END and that legit multiplayer play is
  untouched (all assertions green). Full suite 191/191.

- **Guest desync self-heal — ✅ DONE (2026-08-14):** in the host-authoritative duel relay a guest
  applies its own move optimistically and trusts the next host snapshot. `fromSnapshot` already IS
  the authoritative rebuild on every ingest, so play self-heals — but if a gameplay field ever
  silently dropped or mangled on the wire (a nested card field, a non-JSON-safe type, a migration
  gap), two clients would **quietly diverge with no signal**. Now the host stamps
  `snap.digest = E.stateDigest(state)` into every wire snapshot and the guest recomputes it right
  after `fromSnapshot`; a mismatch reports through the throttled `window.reportErr` beacon (→
  `errors.html`) and bumps `duelDebug.desyncs`. **`stateDigest`** (engine/serialize.js) is FNV-1a
  over `JSON.stringify(normalize(state))` — `normalize` strips events/rng/cardsById and remaps uids,
  so the fingerprint is **stream- and uid-agnostic**: a faithful round-trip ALWAYS matches (zero
  false alarm) while any real divergence is caught. Effectively the snapshot-fidelity fuzz check,
  moved into the RUNTIME on real production games. `fromSnapshot` now drops the transport-only
  `digest`; `window.reportErr` exposed from topbar.js (reuses its dedup+cap). Verified: serialize
  test digest block (clean round-trip matches, stream-agnostic, and dropped-card / off-by-one-life /
  wrong-active-seat each caught — 32) + the 3-browser relay harness asserts **`desyncs===0` across
  all live clients** (no false positive on a healthy game).

---

## Tier 3 — Bigger bets (worth planning, not "easy")

### 12. Finish multiplayer  — social layer ✅ DONE (2026-08-12)
Built a shared **social inbox** into the top bar (`/site/topbar.js`), on the existing
`/api/mp` backend, so you can be social without opening the Overworld:
- **Challenges** — accept card duels right there (they launch `?cardpvp=<id>`); Pokémon
  challenges are **also sent and accepted standalone** now (see below), then open in
  the Overworld to render.
- **Friends** — presence + one-click **card** (deck-picker → challenge → launch) **and
  Pokémon** challenge, plus **Watch** (spectate a live friend) and "Message". You can
  now also **add a friend by username or friend code right here** (no Overworld needed):
  one input resolves either identifier (a 6-letter entry tries the code, falling back to
  a username, so a 6-letter name still works), and your own friend code is shown to share.
  The `add-friend` action gained a username path (accounts are keyed by lowercased name).
- **Messages** — per-friend DM threads over the `u:<name>` chat rooms.

**Overworld menu on desktop — ✅ DONE (2026-08-12):** the menu (Pokédex/Bag/Trainer
Card/Save/Friends/…) opens with **Enter/M** on desktop, but that was undiscoverable —
the on-screen **MENU/PARTY/BAG** buttons only showed on touch devices. They're now
visible on desktop too (a `@media (pointer:fine)` rule), sat below the corner topbar so
they don't collide with the home/inbox cluster; the d-pad and A/B stay keyboard-only.
The desktop hint bar also now spells out "Enter menu". Verified both the add-friend flow
(server 12/12 + client 10/10) and the desktop/touch button visibility (9/9) headless.

**Spectate from the inbox — ✅ DONE (2026-08-12):** the Friends tab reads each
friend's live presence `status` — `battling:<matchId>` (a Pokémon battle) or
`card:<mode>` (a card duel / dungeon / Heist / Tombs / Duels run) — tags them with a
pulsing **● LIVE** pill and a labelled sub ("in a card duel", "in a dungeon run", …),
and swaps the challenge buttons for a single **👁 Watch**. Watch routes to the existing
read-only spectator views: Pokémon → `/overworld/?mp=1&watch=<matchId>` (a new Overworld
boot param that calls `enterMatch(id, /*spectator*/true)`; the server already gates the
`match` fetch to friends of a participant), card → `/battlecards/?spectate=<user>&mp=1`
(polls `cardstate` snapshots). So you can now spectate a friend from anywhere, not only
by walking up to them in the Overworld. While the Friends tab is open it **re-polls
presence every 8s** and re-renders only when a status/online bit actually flips — so a
friend going live (or a battle ending) surfaces a Watch button without reopening the
panel, and the list never churns under the cursor; the poll stops when you leave the tab
or close the inbox. Verified the labels/pills, the button swap, both routes, and the
live auto-refresh (roaming→battling→roaming) headless.

**Standalone Pokémon challenges — ✅ DONE (2026-08-12):** the inbox now builds the
self-contained party snapshot the PvP engine needs directly from the team saved in
`localStorage` (`magepunk_party_v1`) — byte-for-byte the same shape the Overworld's
`pvpParty()` builds — enriching each move's power/type/category/acc/priority from the
battle move table (`/overworld/data/moves_battle.json`, served cross-origin with CORS).
So you can **send** a Pokémon challenge to a friend and **accept** an incoming one from
any page (Friends "⚔" button / Alerts "Accept"); on accept the server mints the match
and both players are redirected to `/overworld/?mp=1&battle=<id>`, which the Overworld
boot reads to **enter the battle directly** (no "rejoin?" prompt). Only the fainted-team
case falls back to "set up a team in the Overworld first." Verified the snapshot shape,
the fainted-mon drop, and the empty-team guard headless.

**Matchmaking — ✅ DONE (2026-08-12):** a **"Find Match"** on the Battlecards start
screen queues you against a real player; if no one's waiting after 12s you're handed
an **AI opponent** instead. The AI plays a real decklist — the pool is seeded with the
starter decks and **grows with every deck real players queue with** (harvested,
deduped, capped at 200), so the bots start on starters but are gradually replaced by
real players' decks. Backend: `matchmake-join` / `-poll` / `-leave` (pairs two waiters
into a host-authoritative `cardpvp` duel, or mints an `aimatch`) + `ai-match`. Engine:
`createGame` gained `opponentDeckIds` so player 1 can be dealt a specific deck. Game:
`?aimatch=<id>` boots a local match where the AI plays that deck. Verified the pairing,
AI-timeout fallback, deck harvesting, the engine deck-override, and the full UI flow.
- **Multiplayer free-for-all (2-8 players) — ✅ DONE (2026-08-14):** Find Match now has a
  **table-size selector (2-8)**. Matchmaking gathers other waiters who chose the SAME size
  (a deterministic oldest-waiter "minter" seats them, so no double-mint race) and **backfills
  empty seats with AI** on the same 12s timeout — so an 8-player table still starts promptly
  as humans + bots. The match record generalized from a `host`/`guest` pair to a `seats[]`
  array (2-player `host`/`guest` aliases kept so the rematch handshake is untouched). The
  relay generalized too: `card-act` stamps each intent with the sender's seat (server-side, un-spoofable),
  `card-drain` returns seat-tagged intents, per-seat aliveness lets the host **auto-pilot a
  dropped human's seat** (FFA) or end by abandonment (1v1). Client: the host deals all N seats
  (each its own deck/hand/coin, seeded via `duelSeed`), and a single `isAiSeat(seat)` predicate
  replaces the old `=== HUMAN` binary so the host runs `AI.step` + `resolveAI*` only for seats
  with no live human behind them; `applyGuestIntent` applies on `it.seat`; each guest learns its
  own seat (`HUMAN = seat`, was hardcoded 1). The deterministic-RNG work pays off here — every
  guest restores the host's rng stream, so N optimistic mirrors stay in lockstep. FFA win =
  last hero standing (already in the engine); rematch stays 1v1-only for now. Verified with new
  `ffa_duel_test` (27, engine N-seat deal + AI FFA to a winner + seat-2 guest ingest), extract-run
  seat-routing (11) and matchmaker minter/backfill (19) tests, plus the full engine suite (189).

**Post-game summary — ✅ DONE (2026-08-12):** Battlecards matches used to end on a
bare banner + a restart button. Now Quick Match, AI matchmaking matches, and PvP duels
show a proper end screen: the result (**VICTORY / DEFEAT / DRAW**) plus a compact stat
block accumulated from the match's own event stream — duration, turn count, and (in a
2-player game) a **You-vs-opponent table**: cards played, creatures summoned, damage to
the enemy hero (credited to the striking seat), and life remaining, with the leading
value highlighted. Quick Match / AI matches also get next-step buttons — **Play again**
(a fresh match or an in-place restart), **Find Match**, **Deck Builder**, and **View
final board** (dismisses the overlay to inspect the board); duels keep **Back to your
world**. Resumed / spectated games (no turn 1 to seed the tally) degrade to just the
result. Verified the stat attribution (both seat perspectives), the button wiring, and
all three result titles by running the real functions headless.
- **FFA standings — ✅ DONE (2026-08-14):** 3–8 player free-for-alls used to fall back to a
  one-line self-summary; now they show a full **standings table** — placement 1st→last
  (the survivor on top, then everyone else in REVERSE elimination order), each row with the
  result (**Survived** / **KO'd · turn N**), cards played, and creatures summoned, the human
  row highlighted and 1st in gold. Needed elimination-order tracking: `matchStats.elim`
  records `{seat, turn}` on each `eliminated` event, and the host publishes it in
  `duelStatsPayload` so a duel guest renders the same standings from its own final board.
  Verified with an extract test of the real `appendMatchSummary` (9 — placement order,
  per-row result/stats, human row, and that a 2-player match still uses the head-to-head
  table) plus a rendered screenshot.
- **Guest duel stats — ✅ DONE (2026-08-12):** in a PvP duel only the host runs the
  event stream, so the guest (who renders from relayed snapshots) had no tally. The host
  now publishes its seat-indexed stats (with the duration baked in, since the guest can't
  read the host's clock) inside the `card-publish` payload; the guest adopts them at
  game-over and renders the same You-vs-opponent table from its own seat (life still read
  from its own final board). An older host that doesn't send stats degrades to the plain
  result. Verified the payload shape and the guest-seat render headless.
- **Duel rematch — ✅ DONE (2026-08-12):** the duel-over overlay now has a **Rematch**
  button for both players. Either side offers; the moment the other offers (or clicks
  the **Accept _X_'s rematch** button the poll surfaces), the server mints a fresh
  `cardmatch` reusing both decks/classes and both clients jump straight into it
  (`?cardpvp=<newId>`). One server action (`duel-rematch` with `op:offer|poll`) handles
  it — a second offer from the other player completes the handshake, so the flow is
  race-safe (double-offer converges to one match) and idempotent; offers expire after
  120s, and abandoned duels (opponent left) show no rematch. Verified the server
  handshake (offer/poll/complete, deck reuse, race, staleness, auth — 18/18) and the
  client wiring (offer→navigate, incoming-offer→Accept→navigate, failure reset — 8/8)
  headless with the real extracted code.
- **Duel relay desync fixes — ✅ DONE (2026-08-13):** a friend playtest surfaced that
  the Swamp double-tap (conjure a black card) desynced for the guest — the card
  flickered in and vanished. Root cause: guest-reachable actions that mutated the
  engine directly instead of relaying an intent, so the host never ran them and its
  snapshot reverted the guest's optimistic result. Fixed the land-tap/sacrifice path,
  then swept for the rest and fixed 5 more (untargeted activate/walker, artifact tap
  incl. a stray-`play` in `commitPending`, token sacrifice, hero attack) — each now
  goes through a relay wrapper and the host applies it on seat 1.
- **Deterministic duel RNG — ✅ DONE (2026-08-13):** even with the relays fixed, a
  *random* effect could still flicker: the host ran unseeded `Math.random` and the
  guest's optimistic copy re-attached its own `Math.random`, so a conjure/discover/
  random-target briefly resolved to a different card before the host's snapshot
  corrected it. The engine already routes **all** randomness through `state.rng` (no
  raw `Math.random`) and ships a serializable seeded PRNG (`seededRng`/`restoreRng`,
  `rng.snapshot()→{seed,calls}`), it just wasn't wired into duels. Now: the host seeds
  its game from the shared match id (`seededRng(duelSeed(duel.id))`), `toSnapshot`
  carries the rng **position**, and `fromSnapshot` (given no explicit rng)
  reconstructs that exact stream — so the guest's rolls are byte-identical to the
  host's and its optimistic board matches. Duel-only: unseeded solo/AI/run games emit
  no rng field and still fall back to `Math.random` (digests stay rng-agnostic).
  Verified with a new `deterministic_duel_test` (16/16) plus the full engine suite
  (188/188, incl. the seeded fuzz determinism test).
- **Relay concurrency hardening — ✅ DONE (2026-08-14):** the backend is KV on D1 and
  `get→setJSON` is read-modify-write (NOT atomic), so a key written by different users at
  once can lose an update. The sharpest case was the **card-intent queue**: in an FFA, two
  guests relaying at the same instant both read the shared list, both append, last write
  wins → **a move silently vanished → desync**. Fixed by making **each intent its own row**
  (`cardintent:<id>:<seat>_<seq>`, append-safe — unique keys can't clobber), drained via a
  prefix `list()` + delete-exactly-what-was-drained (a row added meanwhile survives); the
  client sends a **monotonic seq** so a guest's moves apply in order even if the
  fire-and-forget relays arrive reordered. Added `store.list(prefix)` + `deleteKeys(keys)`.
  Also **rematch-join self-heal** (the client re-offers if a concurrent write dropped its
  join). Audited + documented the rest (a CONCURRENCY NOTE in `mp.mjs`): matchmaking
  self-heals via repeated polls + the deterministic minter; per-user collection is rarely
  concurrent (would need row CAS); analytics counters are approximate. Verified: an
  extract test proving concurrent relays lose no intents + order preserved (8) and the
  rematch client test still green (6).
- **Multi-client relay integration harness — ✅ DONE (2026-08-14):** closed the long-standing
  "can't verify N real browsers" gap. `battlecards/tests/integration/relay_harness.mjs` wires
  the **real `mp.mjs` handler** to an in-memory D1 shim (patching its attribute-less JSON
  imports for Node), **registers 3 accounts + matchmakes them into a size-3 FFA through the real
  backend**, then launches **3 headless browser clients** (each in an ISOLATED context — same-
  origin pages share `localStorage`, which would otherwise collapse them into one user) into the
  live duel and asserts the whole lifecycle via `window.__game.state`: all clients **converge on
  the host's authoritative board**, a host end-turn propagates to the guests, a **guest end-turn
  relays back through the host and re-converges** (the exact round-trip the per-intent race fix
  protects), then **concede → game over** (both guests concede, eliminations propagate, the host
  wins, conceders see the "You conceded" screen) and **rematch** (the host's over-screen offers it
  and the real handler mints a fresh match reusing all 3 humans + decks against the finished
  match). 19/19, stable across repeated runs. Standalone (needs headless Chrome), not in
  `run-all`; run with `node battlecards/tests/integration/relay_harness.mjs`. Bugs it caught while
  building: 3 clients sharing one token via shared `localStorage`, and WebGL contention on
  simultaneous boot (fixed by isolated contexts + host-first sequential boot).

- **Deeper engine fuzzing — ✅ DONE (2026-08-14):** ran `tests/fuzz/fuzz_test.mjs` far
  harder (`--games=150 --actions=600 --split`) and **extended it to fuzz 3–8 player FFA** (new
  `--players` arg: `0` = seed-derived random 2–8 per game via a dedicated stream so legacy 2-player
  seeds stay byte-identical; the action loop was already seat-generalized). Findings:
  - **FIXED — `damage.js` crash** (`Cannot read properties of null (reading 'healInsteadOnOwnTurn')`):
    Felstring Harp broke on the same hit it healed (`breakWeapon` nulls `p.weapon`, then line 163 read
    it) — now captures the heal amount before breaking. 2-player deep fuzz clean afterward (151/151).
  - **FIXED — FFA "current player is eliminated" invariant** (was ~23/120 FFA games): when the
    CURRENT player dies mid-turn in a 3+ player game (game not over), `state.current` was left on the
    eliminated seat → in live FFA, self-eliminating on your turn would **stall the game**. `checkGameOver`
    (called from `sweepDeaths` mid effect-resolution) can't safely re-enter `endTurn`, so it leaves the
    strand for a safe boundary to drain. Fix: new `engine/core.js` **`settleTurn(state)`** —
    `while (!over && current.eliminated) endTurn(state)` (loops for start-of-turn cascade deaths; a
    no-op when the active player is alive, so 1v1/solo determinism is byte-for-byte untouched). Drained
    at the two top-level boundaries: `dispatch` (engine/actionlog.js, after every action → covers the
    fuzzer + replay) and `pump()` (game.js, after the resolveAI* drain, before events flush → covers all
    authoritative play); the two ad-hoc concede handoffs collapsed into it. **FFA fuzz now 251/251**
    (was 118/33). Regression fixture in `tests/regression/ffa_duel_test.mjs`: active-seat self-concede →
    validator flags the stranded `current` → `settleTurn` advances to seat 1 and the state is clean;
    plus no-op-when-alive and no-op-once-over (1v1) assertions.
  Full engine suite still 190/190.

Still bigger bets: `Plans/MULTIPLAYER_FIX_PLAN.md` bugs. (Standalone Pokémon challenge
send/accept, inbox spectate, and the post-game summary — the old open items here — are
all done now; see the notes above.)

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

### 14. Accessibility pass — ✅ DONE (2026-08-12)
- **Keyboard + focus**: a site-wide `:focus-visible` ring (injected by the top bar,
  so it lands on every content page's links/buttons/inputs). The inbox is a proper
  `role="dialog"` (`aria-modal`) — opening it moves focus inside, Escape closes it and
  returns focus to the bell, and the tabs are a WAI-ARIA `tablist` with arrow/Home/End
  navigation and `aria-selected`. The bell has an `aria-label`; live regions announce
  the body/toast.
- **Reduced motion**: `prefers-reduced-motion` guards on the hub float, the matchmaking
  spinner, the inbox slide + all component transitions, and the collection meter (the
  earlier hub/start guards stand).
- **Screen readers**: `lang="en"` added to the game + Overworld pages.
- Follow-up (the one real gap): the in-game board uses red (`targetable`) vs green
  (`armed`) borders — a red-green colorblind risk. A colorblind toggle or an added
  shape/pattern cue on those states is the next step, but it lives deep in the 3D HUD.

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
