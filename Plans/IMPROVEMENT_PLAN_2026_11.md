# Improvement plan, November 2026

Owner, 2026-11-13: "make a plan to address everything and begin it". This is the list from that day's review, in the
order it will be done. Each item is one PR with its test; a flaky-test fix merges on green, everything else waits for
the owner's word. Items are ticked here as they land.

## 1. Verify what is live

Things that shipped without being checked the way a player uses them.

- [x] 1a. Gold buys packs: click the Buy button in a browser, signed in, against the real server code. Done:
      it works; pinned by battlecards_gold_packs_page_test.mjs (10 checks).
- [x] 1b. The Dive's red ground: look at the slam circle and the charge lane; fix what looks wrong. Done: both
      showed, but dull and with no sense of when they land. They are brighter and fill from the foe outward as they
      wind up (full: it lands), as the 2D game's do.
- [x] 1c. Watching a friend's 3D Dive over the site's own relay (two signed-in accounts, the real server code), not the
      test channel. Done: it works as built (floor, chests, stairs, the end; largest message 4,343 of 23,000
      characters); pinned by micasurvivor_m3d_dive_live_test.mjs (13 checks).
- [x] 1d. 3D co-op with three and four players (one machine, separate browser sessions). Done: a Dive of four and
      an Expedition of three work as built (all linked directly, each sees the others, all four keep the run with
      the same pay); pinned by micasurvivor_m3d_coop4_test.mjs (16 checks).
- [ ] 1e. OWNER: 3D co-op on two real machines on different networks. Cannot be done from here.

## 2. Reliability

- [x] 2a. Flaky: the Pears controller checks (`pairofpears_ui_test`, `controls_b7_test`). Done for
      `pairofpears_ui_test` (#1172): a press now lasts until the page has drawn frames with it. Likeliest cause, not
      reproduced. `controls_b7_test` has no failure on record, so it is untouched.
- [x] 2b. Flaky: the 2D Expedition economy test (`micasurvivor_expedition_economy_test`). Done (#1174): one cause
      was a real bug (on a phone the tip box pushed the minimap down the screen and followed it), the other a test
      assumption about the purse.
- [x] 2c. Flaky: the 2D Dive suite (`micasurvivor_dive_test`, two timing checks). Done (#1173): one check misread a
      foe winding up an attack as asleep; the other is the likeliest cause only (damage on the way down), and now
      reports what it found if it happens again.
- [x] 2d. Stacked PRs: a PR stacked on another is not set to merge by itself until the one below it has merged (a
      working rule, written into CLAUDE.md), so a later green gate cannot carry in earlier red work. Done.
- [x] 2e. Heist: the ended-runs list is kept per browser, so a fresh sign-in can resume an older state. Move it to the
      account, as gold was. Done (#1176), for all ten run modes: the server already kept an ended marker; the gap was
      the message that sets it not arriving. It is now sent so a closing tab still sends it, and a boot resends it.
      Not covered: the message is lost AND that browser never opens Battlecards again.
- [ ] 2f. Phone shape in page tests: each game's page test also runs its main screens at 390 x 700 (a phone browser
      with its bars), where the Pears shop broke.

## 3. Finish the 3D Dive and 3D co-op

- [x] 3a. A co-op guest gets what its save brings: its starting form, its family's upgrades, the Lab, the route's Seal.
      Done, for a lobby's guest in a Dive and in an Expedition. Not the Rare Candy's two levels (the level is the
      team's), and the other players do not see a guest's shiny look.
- [x] 3b. A co-op guest keeps the stage and the Seal when the party beats a guardian. Done: in its own save, the
      moment the guardian falls (never the Weekly Dive).
- [x] 3c. A controller button for the Ultimate in a Dive. Done: both shoulders together, L + R (Q + E on the keys);
      the chip says so. The host's and a solo Dive's only: a guest has no Ultimate in a Dive.
- [ ] 3d. The minimap marks chests and the landmark once seen.
- [ ] 3e. The crater's floor (the 3D game has no lava biome), and the 2D light map's lights: the landmark's glow, the
      lava's flicker, sun shafts.
- [ ] 3f. 3D co-op runs on a board of their own, and a replay. (Largest item here; last.)

## 4. Content and players

- [ ] 4a. The thirteen other cards whose rules are written into a token's name (found with BEEEES!!!). Each is read
      against its card text; a buff never lowers a mana cost.
- [x] 4b. (Done, #1177.) Field-move hints: a Cut tree, a Rock Smash rock and a Strength boulder say when you hold the HM and no
      Pokémon knows the move (two tester "blockers" on 2026-11-13 were this).

## Not planned

- Making 3D co-op cover Survival and the Weekly Dive: no request.
- Removing the archived 2D Expedition, Dive and co-op: they are what local play and the opt-out switches run.
