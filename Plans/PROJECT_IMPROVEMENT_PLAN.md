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
world**. FFA (3–4 player) games fall back to a one-line self-summary, and resumed /
spectated games (no turn 1 to seed the tally) degrade to just the result. Verified the
stat attribution (both seat perspectives), the FFA fallback, the button wiring, and all
three result titles by running the real functions headless.
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
