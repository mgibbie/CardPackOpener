# CardPackOpener — working notes for Claude

Magepunk site: the **Pokémon overworld** web game (`overworld/`), **Battlecards**
(`battlecards/`), and the accounts/multiplayer backend (`server/mp.mjs`, Cloudflare
Pages Functions + a D1 database `magepunk-users`, one table `mp_store(key, value,
updated_at)`). Cloudflare Pages deploys `main` automatically — merging IS shipping.

Two big asset folders are **gitignored** and deployed to their own Pages projects:
`overworld/data` → magepunk-owdata.pages.dev, `battlecards/art` → magepunk-cardart.pages.dev.
A fresh clone has neither (see Cloud sessions).

## Owner rules (always)
- Fix bugs with a **regression test**, and show it **fails with the fix reverted**.
- Run the gate, then **merge only when the owner says** ("merge it", "merge it when the gate passes").
- **Never wipe, reset or migrate a save** without a backup and rollback. Never edit a
  playtester's live save (`ow:<user>`) directly: repairs go to the player as an in-game
  offer (`repair-send`; they press Z, which runs `importSave` with its stale-revision guard).
- D1: reads of the playtest accounts (saves, presence, runs, the `err:<date>` rollup,
  `bug:`/`repair:` rows) are pre-approved for monitoring. Any **write** touches only exact
  keys, guarded (compare-and-delete), never a bulk wipe.
- **Never log credentials or secrets.**
- If the system kills a gate for memory, don't restart it unasked — report it.
- Worktrees: if `overworld/data` / `node_modules` are junctions/symlinks into the main
  checkout, remove the LINK first (non-recursive) and verify it is gone; never
  `git worktree remove --force` while a link remains — it deletes the target's contents.

## The gate
- Quick (per change): `node overworld/tests/run-all.mjs --changed` — the selected suites +
  a smoke set; touching core files widens it.
- Full (before big batches): `node overworld/tests/run-all.mjs` (~70 min, 198 suites).
  After an interruption: add `--resume`. Failures are retried alone at the end; "FLAKY
  (failed, then passed alone)" is a pass.
- Battlecards engine tests: `npm test` (`battlecards/tests/run-all.mjs`).
- Tests need `CHROME` (a Chrome/Chromium path) and `overworld/data`.

## "check on the testers"
`node tools/playtest-digest.mjs` (SELECT-only) diffs the playtest accounts (the default
`MP_BUG_REPORTERS` list in `server/mp.mjs`) against the last snapshot and writes
`Desktop/playtest-reports/<date>.md` (on a cloud session: just read its stdout).
Investigate its ⚠ items. Message a tester via their bell: the `chat:dm:<user>` row
(append `{from:'mgibbie', text≤140, emote:null, ts}` guarded on the row's length).

## "do the bug report review list"
1. Read: `npx wrangler d1 execute magepunk-users --remote --json --command "SELECT key, value FROM mp_store WHERE key LIKE 'bug:%'"`
2. Fix each (regression test, fails-reverted), gate, merge when told.
3. Mark done by **exact key**: `DELETE FROM mp_store WHERE key IN ('bug:<ts>-<user>', …)`.

## "do the internal to do list"
1. Read the owner's card notes: `SELECT length(value) AS n, value FROM mp_store WHERE key='owner_todo'`
   (entries `{ts, cardId, cardName, text}`).
2. Apply each to `battlecards/cards.json` (minified — edit with a node script by object
   reference; re-read the touched ids after writing). Add
   `battlecards/tests/regression/owner_todo_cards<N>_test.mjs` (next free N) that FIRES the
   changed effects; it must fail on the old cards.json.
3. `node tools/pull-live-tuning.mjs` (folds live art/tuning overrides; commit + `npm run deploy-art` if it pulled images).
4. Clear only what you applied: re-read `length(value)`, then
   `DELETE FROM mp_store WHERE key='owner_todo' AND length(value)=<n>` (a note filed meanwhile changes the length, so the delete no-ops).
Card text conventions: keywords alphabetical, `A, B & C.`; a spell's school is its `tribe`;
"Luck:" = coin flip `{type:'luck', effects}`; Red/Green/... card pools = `landSet` Mountain/Forest/....

## Cloud sessions (Claude Code on the web)
Environment settings:
- **Setup script:** `bash tools/cloud/setup.sh` (npm install, Chrome at `/opt/chrome/chrome`,
  `overworld/data` from live — ~3-4 min, so it caches).
- **Variables:** `CHROME=/opt/chrome/chrome`, `CLOUDFLARE_API_TOKEN=<D1-scoped token>`,
  `CLOUDFLARE_ACCOUNT_ID=<account id>`.
- **Network:** include api.cloudflare.com, magepunk-owdata.pages.dev, the npm registry,
  GitHub, and Chrome's download host (storage.googleapis.com).
Then `node tools/cloud/doctor.mjs` must print "all good". Commands time out at 30 min in
the background: run the full gate as `run-all.mjs` then `run-all.mjs --resume` until done.
After adding files to `overworld/data` locally (and deploying them to magepunk-owdata),
refresh the list with `node tools/cloud/fetch-owdata.mjs --write-manifest`.
