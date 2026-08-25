# State Persistence, Deterministic Resume & Sprite Fixes — Plan

Fixes three reported problems + sensible hardening, based on a full read of the code (Aug 2026):
1. **Resuming a run re-deals a different hand** (mid-fight state is lost).
2. **Stale localStorage across devices/browsers** — old starter/region/run data because state lives only in
   the browser cache, not on our server.
3. **Paused games must restore both players' exact hands + deck order** (to maintain state + replays).
4. **Pokémon overworld sprites render ~2× too big and misaligned.**

---

## What the code actually does today (verified)

**Backend is Cloudflare Pages + D1** (not Netlify — the memory was wrong). One authenticated endpoint
`/api/mp` (`server/mp.mjs`) is already a per-user JSON KV store on D1; the account system is authoritative
for collection/decks/packs when a login token exists. Client layer = `battlecards/mpmode.js` (`MPX.call`).
Existing blob-save precedents to copy: **`overworld-sync`** (`server/mp.mjs:1754`), **`save-deck`** (1723),
**`replay-put`** (771).

**Run state is metadata-only + localStorage-only.** Keys `magepunk_dungeon_v1 … magepunk_middleearth_v1`
(`game.js:63-77`) via `loadRun/saveRun/clearRun` (`game.js:112-132`). A saved run is just
`{active, characterId/classId, deck, wins, losses, enemy, …}` — **no hands, board, deck order, mana, or
turn.** Runs save only between fights; advancing calls `location.reload()`.

**Every resume re-deals.** `bootEncounter/bootLorequestEncounter/bootMiddleEarthEncounter`
(`game.js:4886/6231/6378`) call `E.createGame(cardsById, Math.random, [...run.deck], …)`, which reshuffles
(`core.js:530`) and deals a fresh opening hand (`core.js:696`). **`Math.random` is unseeded**, so the hand
differs every boot. No in-fight snapshot is ever loaded in single-player.

**The engine already has a complete, proven snapshot.** `engine/serialize.js` `toSnapshot`/`fromSnapshot`
capture *everything* the user listed — both players' hands (with `uid`s), **deck order** (ordered id
array), board, graveyard, mana, secrets, weapon, enchantments, artifacts, ring/ringBearer, dungeon
progress, turn/current, and all queues. The **only** excluded gameplay field is the RNG position, which is
carried as `{seed, calls}` *iff the game used a seeded rng*. This exact restore path is already live for
**multiplayer duel resume** (`game.js:4220`) and the **replay recorder** (`replayrec.js`, a tape of
`toSnapshot` frames). Single-player just never uses it.

**Determinism gap:** only Duels seed (`E.seededRng(duelSeed(duel.id))`, `game.js:4229`). All ~7
single-player `createGame` sites pass `Math.random` (`game.js:4871,4893,5485,5784,6061,6383,6519`), so their
randomness position can't be captured or restored.

**Starter + region are localStorage-only.** Starter = the party array `magepunk_party_v1`
(`overworld/party.js`); region = raw string `magepunk_region` (`overworld/main.js:168/2708/1247`); position
= `magepunk_pos_v1`. `overworld-sync` (`server/mp.mjs:1754`) persists only a *summary* (badges/champion/dex/
BP/streak) — not the party, region, or position.

**Sprite bug root cause:** the overworld upscales once (240×160 → 3×, `main.js:3028`) — no double scale. But
`data/pokemon_ow/*.png` (legendaries, awakenings, walk-up blockers) are **40 px tall** and drawn **raw, with
no normalization**, at 3 sites: `overworld/blockers.js:252`, `overworld/main.js:2107` (drawLegendary),
`overworld/main.js:2186` (drawAwakening). Every *other* actor is size-controlled (humans 16×32; the party
follower downscales its 32-px frame to 26). At 40 px on a 16-px grid these read ~2× too big, and the
bottom-center anchor then makes them overhang neighbours = "misaligned." (Battle screen and `/monsters/`
page are already normalized — not the culprit.)

---

## Phase 0 — Sprite fix (quick, independent) ✅ ship first

Normalize the three `pokemon_ow` draws to a grid-appropriate height and re-seat them, via one shared helper.

- Add `drawOwPokemon(ctx, img, cx, by, camX, camY, dh = 26)` (e.g. in `overworld/engine.js` or `main.js`):
  `const dw = Math.round(img.width * dh / img.height);
   ctx.drawImage(img, Math.round(cx - dw/2 - camX), Math.round(by - dh - camY), dw, dh);`
  (bottom-center anchor kept; height ~24–26 to match the follower's 26).
- Replace the raw `drawImage` at `blockers.js:252`, `main.js:2107`, `main.js:2186` with the helper.
- **Verify** by launching the overworld (per the `run` skill) and walking up to a blocker legendary
  (Snorlax/Sudowoodo) — it should sit one tile tall, feet on its tile, not overhanging.

Low risk, no data/engine changes. Could go in its own PR today.

---

## Phase 1 — Deterministic mid-fight resume (client-only; fixes "different hand")

Make single-player runs snapshot the live fight and restore it exactly on resume — the same mechanism the
MP duel resume already uses.

**1a. Seed single-player runs.** At the ~7 single-player `createGame` sites, replace `Math.random` with
`E.seededRng(fightSeed)`. Generate a per-run base seed at run creation (store `run.seed`), and derive a
per-fight seed `fightSeed = (run.seed ^ ((run.wins+run.losses) * 0x9e3779b1)) >>> 0` (deterministic, no
`Math.random`). The snapshot then carries `{seed, calls}` automatically (`serialize.js:101`). This alone
makes shuffles/deals reproducible and post-resume randomness identical.

**1b. Persist the snapshot into the run.** Add a `snapshotRun()` that does
`saveRun({ ...run, snapshot: JSON.parse(JSON.stringify(E.toSnapshot(state))) })` (deep-copy required —
`toSnapshot` shares `players` by reference, `serialize.js:81`). Call it at each settled frame (reuse the
`maybeRecordFrame` tail hook, `game.js:6642`) and on page `visibilitychange`/`beforeunload`, so quitting
mid-fight is captured. Cap size (skip if serialized > ~256 KB, like `replay-put`'s guard).

**1c. Rehydrate on resume instead of re-dealing.** In each boot fn (`bootEncounter` and the lorequest/ME/
heist/tombs/arena analogues): if `run.snapshot` exists and its `schemaVersion` is current, do
`state = E.fromSnapshot(run.snapshot, cardsById); E.ensureUidsAbove(E.maxSnapshotUid(run.snapshot));` then
rebuild the view (`buildPanels/buildSlotMarkers/updateHud`) — mirroring `game.js:4208-4246`. Otherwise fall
back to the current fresh `createGame` (new fight). Clear `run.snapshot` when a fight resolves (win/loss →
next fight is fresh).

**1d. Safety:** version-guard the snapshot (`migrate` handles v0/v1; if incompatible, drop it and boot
fresh rather than crash). Always `ensureUidsAbove` after restore (prevents uid collisions —
`serialize.js:142`).

**Result:** leaving and resuming any single-player fight restores both players' exact hands, deck order,
board, mana, secrets, ring/dungeon progress, and turn — and continues deterministically. No server needed.

**Test:** headless `resume_test.mjs` — seed a game, play N actions, `toSnapshot` → `fromSnapshot`, assert
both hands (uids), both decks (order), board, mana, turn are identical; then a few more seeded actions
match a control run.

---

## Phase 2 — Server as source of truth (fixes stale cross-device data)

Move run + overworld state to D1 so a logged-in player gets the same, current state on any device/browser;
localStorage becomes a cache/offline fallback.

**2a. Server actions** (in `server/mp.mjs`, copying the `overworld-sync`/`save-deck` shape):
- `run-save { key, run }` → validate (size cap, allowed key ∈ the 7 run keys), store under
  `user.runs[key]` with `updated_at`; returned in `publicState`. `run-load`/`state` reads it back;
  `run-clear { key }` deletes it. Store on the durable `user` row (never GC'd, `server/mp.mjs:60`).
- Extend overworld persistence: `overworld-save { party, region, pos, box, rival, name, money }` (a
  bounded, validated superset of today's `overworld-sync`) → `user.overworld`. Keep the existing
  `overworld-sync` summary for leaderboards.

**2b. Client write-through + async hydrate** (the one real design consideration — `loadRun/saveRun` are
sync, `MPX.call` is async):
- On run boot, `await MPX.call('run-load')` (when `MPX.mpMode()`), hydrate an in-memory `run` cache, and
  keep the existing **sync** `loadRun()` reading that cache (falling back to localStorage when logged out /
  offline). This mirrors how the account `state` is already cached client-side (`mpmode.js:40`).
- `saveRun` writes localStorage immediately (instant, offline-safe) **and** fires an async
  `MPX.call('run-save', …)` write-through. `clearRun` also calls `run-clear`.
- **Conflict rule:** on load, if the server copy's `updated_at` is newer than localStorage, the server wins
  (kills stale-cache resurrection); if offline/logged-out, use localStorage.
- Overworld: at boot, hydrate party/region/pos from `user.overworld` when logged in (server wins on
  newer `updated_at`); write-through on change (`saveParty`, `beginNewGame`, `travelPortal`,
  position autosave). This directly fixes "old data about which starter I picked and which region I'm on."

**2c. Migration:** first login on a device with existing localStorage → push it up once (if the server has
no copy yet), so nobody loses an in-progress run.

---

## Phase 3 — Hardening & sensible extras

- **Snapshot schema version bump discipline:** any change to player fields must go through `serialize.js`
  `SCHEMA_VERSION` + `migrate` so old saved snapshots resume or degrade gracefully.
- **Corruption/size guards:** cap snapshot + overworld blob sizes server-side (like `REPLAY_MAX_BYTES`);
  on parse failure, drop and boot fresh.
- **"Abandon run" clears server too** (already have `clearRun` seam).
- **Run-fight replays now work** (Phase 1a seeding makes run fights re-simulable via the existing
  action-log path, not just the state-tape) — optional nice-to-have.
- **Audit for other un-normalized draws** while in the sprite code (any remaining raw `pokemon_ow` blits).
- **Offline resilience:** everything degrades to localStorage when logged out or the server is unreachable;
  the account path is additive, never blocking.

---

## Sequencing & risk

| Phase | Scope | Risk | Value |
|---|---|---|---|
| 0 — Sprites | 3 draw sites + 1 helper (overworld) | very low | visible polish |
| 1 — Deterministic resume | client `game.js` + engine seed swap + 1 test | **medium** (touches boot paths; well-precedented by duel-resume) | **fixes the core "different hand" bug** |
| 2 — Server state | `server/mp.mjs` actions + client write-through/hydrate | medium (async seam) | **fixes stale cross-device data** |
| 3 — Hardening | versioning, caps, migration, tests | low | robustness |

Recommended order: **0 → 1 → 2 → 3.** Phase 0 is a standalone quick win; Phase 1 fixes the reported bug
without any backend work; Phase 2 makes it authoritative across devices. Each phase ships independently and
keeps the full test suite (433/433) green, with a headless resume test added in Phase 1.

**Key files:** `battlecards/game.js` (boot/resume, `loadRun/saveRun`), `battlecards/engine/serialize.js`
(snapshot), `battlecards/engine/rng.js` (seed), `battlecards/mpmode.js` (`MPX.call`), `server/mp.mjs`
(D1 actions), `overworld/main.js` + `overworld/blockers.js` + `overworld/party.js` (sprites + overworld
state).
