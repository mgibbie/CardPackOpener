---
name: new-game
description: Use when making a NEW game or game mode for the site (a new folder/page in the Games switcher), or porting one in. Applies the owner's house rules — Balatro/Micatro UI + button sounds, keyboard/controller/touch via site/input.js and the Games switcher, stars as the only currency, live spectating + replays + clips + spectator bets — and the gate test that enforces them.
---

# Making a new game

The owner's rules for every game are in `Plans/NEW_GAME_RULES.md`. Read it first, in full. The reference
implementation is **Pair of Pears** (`pairofpears/`): open its `index.html`, `js/main.js` and `js/net.js` and mirror
how it wires each system rather than inventing a new way.

## Order of work
1. **Plan against the rules.** Before writing code, say how the game will meet each of the four rules (UI, controls,
   stars, watch/replay/bets): what a run's snapshot is (for spectating), what a replay is (seed + actions, or a
   tape), what `prog` / `res` mean for bets, and what the game pays in stars. If a rule seems not to fit the game,
   ask the owner — never skip it quietly.
2. **Engine first**: pure, deterministic from a seed, `view()` / `label()`, with node tests.
3. **Page**: the kit (`/site/ui/balatro.css` or `micatro/css/micatro.css`), sounds on every button, `startInput({
   pad: true })`, the top bar, touch in portrait and landscape.
4. **Register it everywhere** (the test lists each place it is missing):
   - `site/switcher.js` `ENTRIES`, `overworld/tests/switcher_games_lib.mjs` `PAGES`
   - `overworld/tests/game_rules.mjs` — its row (copy Pears', **no `waive`**)
   - `overworld/tests/select-changed.mjs` `LANES`
   - `server/mp.mjs` `SOLO_LIVE` (+ `SOLO_REPLAY_RE`, the rate-limit entries); `server/bets.mjs` `MARK`
   - `site/livewatch.js`, `watch/watch.js` `KIND_NAME` / `KIND_ICON`, `site/topbar.js` `friendActivity`
   - `site/replaylib.js` `GAME_NAME` / `GAME_ICON` / `replayHref` (+ `DEVICE_LISTS` or `REPLAY_LIB_GAMES`)
   - home page tile, `sitemap.xml`
5. **Tests**: `node overworld/tests/game_rules_test.mjs` passes; the game's own suites (engine, UI, guest, replays,
   spectate e2e) plus keyboard-only / controller-only / touch-only play like `controls_b7_test.mjs`.
6. Gate (`node overworld/tests/run-all.mjs --changed`), PR from `origin/main`, merge only when the owner says.

## Never
- Add a `waive` to a new game, or add a game to `WAIVABLE` in `game_rules_test.mjs`. That list is frozen to the games
  that predate the rules.
- A currency other than stars, a control scheme other than `site/input.js`'s, or music the owner didn't ask for.
