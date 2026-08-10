# Multiplayer Test #1 — Findings & Fix Plan

Test: mgibbie + hikerbikerhorse, 2026-07. Three bugs observed:
1. Overworld: friend ghost "clipping all over the place", visible only every few frames.
2. Pokémon PvP: both players seemed to act simultaneously; no sense of turn order.
3. Card duel: loaded for the host (challenger), never loaded for the guest (accepter).

Priority: **Bug 3 first** (card MP completely broken for guests), then Bug 1 (most
visible jank), then Bug 2 (mechanics are right; presentation is confusing).

---

## Bug 3 — card duel never loads for the guest

### Code path (all in battlecards/game.js + server/mp.mjs)
- Guest accepts → redirected to `/battlecards/?cardpvp=<id>&mp=1` → `startDuel()`
  (game.js:2601) → role 'guest' → `startDuelGuest()` polls `card-poll` every
  300–850ms and builds the board when a snapshot arrives.
- Host learns via `my-match` poll (up to 2s), boots engine, publishes snapshot
  every 1s (`startDuelPublish`, game.js:2819).

### Why it can fail SILENTLY (all three are real holes)
- Host: `publishDuel()` ends in `.catch(() => {})` (game.js:2817) — if
  `card-publish` fails (payload size, blob write error, auth), the host plays
  happily solo and the guest waits forever. **Matches the observed symptom
  exactly**: host fine, guest stuck, host's turn-1 actions never reached anyone.
- Guest: in `startDuelGuest`'s `tick()`, only the fetch is try/caught
  (game.js:2740); everything after — state build, `buildPanels()`, `updateHud()`,
  `openDuelModals()` — is uncaught. One exception per ingest = permanent
  "Waiting for the board…" with zero feedback.
- Guest: fetch errors `catch (e) { return; }` — repeated network/auth failures
  are also invisible.

### Plan
1. **Repro harness** (tools/mp-duel-repro.cjs): mp-dev-server + two headless Edge
   instances (puppeteer-core + `--enable-unsafe-swiftshader`, same approach as the
   earlier dbg_r1.cjs script). Script: register 2 accounts → friend via code →
   card-challenge → accept → assert BOTH pages reach a rendered board (probe
   `window.state?.players?.length`) — and dump both consoles + all /api/mp
   request/response pairs on failure.
2. **Diagnostics regardless of root cause** (ship before next test):
   - Host: track consecutive `card-publish` failures; after 3, show a banner
     ("Connection lost — your opponent can't see the board") and retry.
   - Guest: wrap the whole ingest in try/catch; on error, `log()` the message
     on-screen and keep polling. Show elapsed wait + last-poll status under
     "Waiting for the board…" after 10s.
   - Both: `?debug=1` overlay — duel seq, last publish/poll age, last error.
3. Fix whatever the harness pinpoints (payload too big → slim `snapshotForDuel`
   e.g. deck ids already fine but hand/board card objects could be reduced to
   `{id, uid, deltas}` + rehydrate from cardsById on the guest).

---

## Bug 1 — overworld friend ghost clipping / flicker

### Code path (overworld/main.js)
- Mover heartbeats tile position every **450ms** co-located / 1.8s solo (:1305).
- Viewer polls `friends` every **400ms** co-located / 1.4s (:1306).
- Ghost = tile-snapped `(tx,ty)` eased `0.25/frame` toward target (:1217).
- A ghost is **deleted the instant one poll doesn't list it** on my map (:1203).

### Hypotheses (in likelihood order)
- H1 (teleporting): a running player covers 2–4 tiles per effective update
  (heartbeat 450ms + strong-consistency blob write + poll 400ms + per-friend
  sequential reads in the `friends` action ≈ 1s+ latency). Easing 0.25/frame
  snaps across multi-tile jumps → "moving faster than the game renders him".
- H2 (flicker → "glimpse every few frames"): delete/re-add churn. Any poll that
  sees him mid-warp (`f.map` briefly different), or a heartbeat gap (his client
  skipped beats while `loading`), instantly deletes the ghost; next poll re-adds
  it. Ghost visible only between churn events.
- H3: `friends` action does 2 sequential strong-consistency blob reads *per
  friend* (mp.mjs:271-287) — slow, and stretches the real update interval.

### Plan
1. Instrument first (cheap): console-count ghost add/delete/update + tiles-moved
   per update. Reproduce with the Bug-3 harness (two overworld pages, scripted
   movement) or a second local browser window.
2. Fixes:
   - **Waypoint interpolation**: queue reported positions; move the ghost at
     constant walk-speed along the queue (with walking animation + facing from
     travel direction) instead of easing-snap. Handles multi-tile updates.
   - **Grace period**: keep a ghost for ~3 missed polls (≈1.5s) before deleting;
     kills the flicker.
   - **Server**: batch the friends+presence reads (single "presence-all" blob or
     Promise.all instead of sequential awaits) to cut latency.
   - Optional polish: include `moving:true/false` in the heartbeat so idle
     ghosts don't slide.

---

## Bug 2 — Pokémon PvP "we both went at the same time"

### What's actually happening (battlecards/pvpbattle.js, overworld/pvp.js)
Mechanics are CORRECT Pokémon: both players choose, server resolves in
priority-then-speed order (pvpbattle.js:175-195). The problem is presentation:
the client ingests the fully-resolved match state at once — both HP bars snap
instantly (pvp.js:67-74) while the event strings scroll afterwards at 1s each.
So it *looks* simultaneous and turn order is invisible.

### Plan
1. **Structured events**: `resolveTurn` emits `{kind:'move'|'faint'|'switch'|'win',
   side, text, hp:[side0,side1]}` alongside text (additive — keep strings for
   spectators/old clients).
2. **Client sequencing**: keep the *previous* HP values on screen; apply each
   event's HP as its message displays, so damage lands visibly in order. Flash /
   bump the acting mon's sprite per move event.
3. **Turn-order clarity**: derive "X goes first!" from the first move event and
   show it as the first message of each round; show "Waiting for opponent…" state
   distinctly from "resolving turn".

---

## Cross-cutting for the next test
- `?debug=1` overlay on both overworld and battlecards: last heartbeat age, last
  poll age/status, duel seq, publish failure count — so live tests produce
  actionable data instead of "it never loaded".
- Test script for the session: overworld co-location (walk + run + warp), pokemon
  battle (check order messaging), card duel BOTH directions (each player hosts
  once — the guest path is the fragile one).
