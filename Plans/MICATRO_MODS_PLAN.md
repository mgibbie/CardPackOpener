# Micatro mods — native rebuild plan

Owner ask (2026-10-15): rebuild the Balatro mods on this PC (Steam `Mods/` + `Desktop/mods off/`)
**from scratch** inside Micatro — no Steamodded compatibility layer — and let players turn
each mod **on/off**. Pokermon first. Where a mod shipped broken, rebuild it the way its author
evidently intended (documented per fix, each with a test).

## 0. What's there (inventories done 2026-10-15)

| Mod | Source (canonical) | Jokers | Other content | New systems | Size |
|---|---|---|---|---|---|
| **Pokermon 3.2.1** | `AppData/Roaming/Balatro/Mods/Pokermon-main` | 452 (+4 unregistered) | 66 consumables (Item, Energy types), 10 packs, 4 vouchers, 10 decks, 6 tags, 1 showdown boss, 2 enh, 2 seals, shiny edition, 12 Tera stickers, 7 challenges, 8 deck skins | types/Tera, evolution, energy, shiny, megas, safari/mega rarities, family pools, scry, Unown, ~57 lovely patches | ~50 MB art |
| Nacho's Pokermon Dip 1.6.4 | `mods off` | 43 (47 written) | 1 stake (Elite Four), 1 sticker, 4 challenges | Stellar type, `poke_evolved` event, Passimian | 0.4 MB |
| Pokermon+ 1.0.3 | `mods off` | 18 (**none load as shipped**) | Timer Ball, 5 decks, 1 stake, Weakened sticker, 4 challenges | negative energy, per-joker energy cap | 0.2 MB |
| Bunco 5.1 | `mods off` | 80 | 20 consumables (Polymino), 8 packs, 12 vouchers, 25 blinds, 16 tags, 5 hands, 2 suits, ... | exotic suits, linked cards, Blind/Virtual packs | 6 MB |
| MoreFluff 1.5.6 | `mods off` | 83 | Colour + Rotarot types (39), 16 packs, 15 blinds, 8 enh, 4 decks | charging Colour cards, Superboss endless | 18 MB (15 MB music) |
| TheAutumnCircus + AutumnMoodMechanics | `mods off` | 87 | ~103 consumables (60 Oddities), 14 vouchers, 19 decks, stamps, aspects | stamps, aspects, graveyard, suit levels | 2.8 MB |
| BETMMA | `mods off` | 11 | 82 vouchers, 2 editions, 3 voucher packs, 5 challenges | voucher rarity + fusion vouchers | 0.9 MB |
| Fortlatro 1.2.0 | `mods off` | 125 | 86 consumables (LTM), 25 vouchers, 15 enh, 8 seals, 8 blinds | Jewel random-boss mode | 20 MB — **see §6** |
| MikasBalatro 0.13.3 | `mods off` | 60 | 7 decks, 2 tarots, 1 spectral | perma-mult on cards | 0.3 MB |
| Milatro 1.1.0 | `mods off` | 30 | — | — | 0.2 MB |
| Reverie | `mods off` | 1 | 26 Cine/quest cards, 9 packs, 2 decks | Cine special shops, tags as cards | 0.2 MB |
| Risk of Jesters | `mods off` | 11 | 2 vouchers, 4 blinds | bigger packs | 0.1 MB |
| Ro-Balatro 1.2.1 | `mods off` | 10 | 14 Gear consumables | duplicate-allowed type | 0.8 MB (ripped Roblox audio) |
| SylvieSilly 0.11 | **old Micatro folder copy** (the `mods off` copy has a syntax error) | 0 | 4 decks, 6 blinds, 8 packs, 8 moons | suit-chip planets | 0.3 MB |

Not ported as mods (they fix the original game's UI/engine; Micatro gets native equivalents
where useful): Better_Vouchers_This_Run_UI, Deck Creator (→ the native deck editor: BUILT — `micatro/js/engine/customdeck.js` + `micatro/js/ui/deckeditor.js`),
InfiniteScore (→ native big-number scoring, §2.6), JokerDisplay compat, speed mods.
Also in the old `Projects/Programming/Micatro/Micatro` folder only: Olympus (6), Inscrybed (4),
TagTeam (1), Smirkeo (1), AltaVista (1), OmertaDeck (1 deck) — small; port with the S-tier batch if wanted.

## 1. Principles
- **Native, not emulated.** Each mod is rebuilt as a Micatro content pack against Micatro's own
  API. Steamodded concepts get native equivalents only where the content needs them.
- **Faithful to the mod's design** (numbers, rules, text, art), except documented fixes.
- **Deterministic + spectatable.** Mods use the engine's seeded RNG and event log, so runs stay
  replayable and spectators see exactly what the player sees.
- **Off means gone.** A disabled mod contributes nothing: no pool entries, no hooks, no UI.

## 2. Mod framework (phase M0, engine) — `micatro/js/mods/`
1. **Registry** `registerMod({id, name, version, author, requires:[ids], optional:[ids], content, hooks, assets})`.
   Content keys are prefixed (`j_poke_bulbasaur`), so same-named items in two mods never collide.
2. **Content types**: jokers, consumable types (new sets: Item, Energy, Polymino, Colour, Rotarot,
   Oddity, LTM, Gear, Cine...), consumables, boosters, vouchers, decks, sleeves (as deck variants),
   tags, blinds, enhancements, seals, editions, stickers, stakes, challenges, poker hands, suits,
   rarities, deck skins. Each item carries behaviour as plain JS functions (`calculate`, `loc_vars`,
   `use`, `can_use`, `in_pool`, `add_to_deck`, `remove_from_deck`, `set_ability`, `update`).
3. **Engine hook points** replacing the mods' lovely patches with explicit, named seams:
   pool filtering, create_card (forced seals/stickers), set_cost, is_face/is_suit/get_id overrides,
   find_joker aliases (Pareidolia/Four Fingers/Smeared/Splash-style effects), poker-hand parts
   (3-card straights/flushes, Spectrum), debuff rules, new contexts (`post_discard`, `poke_evolved`,
   `hand_drawn`...), end-of-round, cash-out modifiers, pack size/choices, booster slots, extra
   card areas (scry, graveyard, cine quests). Each seam is one line in vanilla code and a no-op when
   no enabled mod uses it.
4. **Per-run mod set**: chosen on the New Run screen (Mods panel with dependency auto-enable and
   per-mod options like Pokermon's `pokemon_only`, gens, hazards, unlimited energy). Stored in the run
   recipe → save/resume/replay/spectate all load the same mods. Spectator view lists active mods.
5. **Assets**: per-mod atlases under `micatro/mods/<id>/`. Big ones (Pokermon ~50 MB, MoreFluff
   music) go to a separate Cloudflare Pages project like `battlecards/art` (20,000-file limit) —
   see §6.
6. **Big-number scoring** (native, replaces InfiniteScore/Talisman): chips/mult/score as a Decimal
   type once any enabled mod can exceed 1e308; vanilla runs keep plain numbers.
   **DONE** (`micatro/js/engine/bignum.js`): BUILT INTO THE BASE GAME (owner, 2026-10-16) — every run,
   vanilla included, goes past 1e308 up to 9.99e999; 1e1000 and above is Infinity, shown as "naneinf"
   (`MAX_EXP`), and ranks above every big score. Hybrid: a value stays a JS number while it fits and
   becomes a Decimal (m in [1,10), 308 <= e < 1000) only on overflow, so runs below 1e308 are
   bit-identical to before (the vanilla fuzz is unchanged).
   Engine accumulators/blind amounts/`G.GAME.chips`/best hand go through `B.add/mul/pow/beats...`;
   a Decimal's valueOf() is inf so un-ported mod arithmetic degrades instead of throwing. JSON/view
   form is the string "1.234e450"; the leaderboard stores `big` + sortable `exp`/`man`.
7. **Leaderboard**: modded runs are tagged with their mod set; the default board shows vanilla
   runs, with a "Modded" tab.
8. **Wiki + news**: each mod gets a design-wiki section (generated from its registry entry); the news
   generator also diffs `micatro/mods/*/` so new mod cards appear as releases (e.g. "Pokermon: 12 new
   cards").

## 3. Pokermon (phases M1–M3)
- **M1 systems** (native): types + Tera stickers, evolution (level/scaling/item/type/deck evo,
  in-place swap carrying scaled values, Everstone), energy (energize coefficients, limits, Colorless,
  Double Rainbow, Bird), shiny edition (+1 booster slot, alt art), megas (Megastone), safari/mega
  rarities + family-aware pools + gen filter + pokemon-only option, held items, Unown/swarm, scry
  area, faint (Baby) and volatile rules, animated jokers, evolution/shiny/zorua shaders, the
  Pokédex family viewer. Plus the ~57 vanilla-behaviour patches as hook-point uses.
- **M2 content**: 452 jokers in ~15 batches by Pokédex file (parallel agents, one file range each),
  each batch with tests that fire every joker's effect and evolution; then consumables/packs/
  vouchers/decks/tags/boss/enhancements/seals/stickers/challenges/deck skins.
- **M3 add-ons**: Nacho's Pokermon Dip (Stellar type, Elite Four stake, `poke_evolved`) and Pokermon+.
- **Intended-design fixes** (each documented + tested):
  - Pokermon+: jokers actually load; per-line toggles scoped to its own jokers (shipped version
    leaked into Pokermon's pool); `sandstorm` checks the intended enhancement (not `m_count`);
    Nacli staged as a base form; cross-mod Toxtricity reference resolved or removed.
  - Pokermon: finish/enable the 4 written-but-unregistered jokers where complete (Jirachi copy/negging,
    Hisuian Qwilfish/Overqwil); `create_random_poke_joker` area bug; `revenanteck` typo; `fake_negging`
    offered in the Wish pack as intended; hazard-poke & rainbow-roll bugs.
  - Nacho: `deck_rank_evo` `_count` bug.
  - Config: use the shipped DEFAULTS (Pokermon 3.2.0's config), not this PC's saved settings.

## 4. The rest (phases M4–M8), by value per effort
- **M4 (S)**: Risk of Jesters, SylvieSilly (clean copy), Milatro, MikasBalatro (skip its 9 dev tarots).
- **M5 (L)**: MoreFluff (Colour/Rotarot types, Superboss), BETMMA (voucher rarity + fusions; drop the
  orphan Abilities/Spells patches).
- **M6 (L/XL)**: Bunco (exotic suits, linked cards, Spectrum hands, Blind/Virtual packs),
  Reverie (Cine shops).
- **M7 (XL)**: TheAutumnCircus + AutumnMoodMechanics (stamps, aspects, graveyard, suit levels,
  Oddities); cross-mod items load only when the partner mod is on.
- **M8**: old-folder-only mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista, OmertaDeck); native deck editor. (Fortlatro and Ro-Balatro skipped.)
- Each mod: its own wiki section, news entry, tests (every item fired), fuzz runs with the mod on.

## 5. Testing
Per mod: unit tests firing every item; fuzz runs (existing harness) with the mod alone and with all
mods on; determinism/replay check; spectate snapshot size check; a browser smoke test of the Mods
panel. Gate wrapper `overworld/tests/micatro_engine_test.mjs` picks up `micatro/tests/mods/*`.

## 6. Owner decisions (2026-10-15)
1. **Fortlatro: SKIP.** (real IP, real-person jokers, ripped/profane audio)
2. **Ro-Balatro: SKIP.**
3. **Assets: separate Cloudflare Pages project** for mod art/music (like `battlecards/art` → magepunk-cardart).
4. **In scope extras:** the old-folder-only mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista,
   OmertaDeck); a **native deck editor** (Deck Creator's builder — built: New Run → Custom deck; decks saved per player in `micatrodecks:<user>`, MCD1. share codes, custom-deck runs rank as modded); **big-number scoring**.
5. **Leaderboard:** vanilla board by default + a **Modded** tab (runs tagged with their mod set).
6. Broken mods are rebuilt **as their authors intended** (Pokermon+ especially), each fix documented + tested.

## 7. Execution order (owner, 2026-10-15)
Each step: gate → merge when it passes → next.
1. M0 framework + M1 Pokermon systems + Mods UI → merge (Pokermon listed as **Preview** until all jokers land).
2. Pokermon joker batches (parallel agents, one range of `pokejokers_NN` files each), then the rest of
   Pokermon's content (consumables, packs, vouchers, decks, tags, boss, challenges).
3. Nacho's Pokermon Dip + Pokermon+ (in parallel; Pokermon+ fixed as intended).
4. Small mods batch: Risk of Jesters, SylvieSilly (clean copy), Milatro, MikasBalatro, + the old-folder
   mods (Olympus, Inscrybed, TagTeam, Smirkeo, AltaVista, OmertaDeck).
5. MoreFluff + BETMMA (in parallel).
6. Bunco + Reverie (in parallel).
7. Then: TheAutumnCircus + AutumnMoodMechanics, big-number scoring, native deck editor.
8. Then the rest of the plan (owner, 2026-10-15): everything left over from the steps above —
   mod-specific UI polish (Pokédex family viewer, evolution/shiny/zorua shader animations, type
   badges, energy pips, animated jokers like Unown swarm), deck skins (Pokermon RBY/GSC, Bunco),
   challenges for every mod (one Challenges screen), sleeves as deck variants, Pokermon's open
   seams (Xatu all-planets packs, previous-evo win stickers), per-mod design-wiki sections + news
   for any mod that lacks them, and a final all-mods-on fuzz/perf pass (load time, snapshot size,
   spectator bandwidth) before calling the rebuild done.
   **Step 8 UI (2026-10-16):** one **Challenges** screen (main menu): Balatro's 20 (`micatro/data/challenges.js`,
   played by `engine/challenge.js`) + every enabled mod's (Pokermon 7, Nacho 4, Pokermon+ 4, BETMMA 5 (MoreFluff 1.9.9999 dropped its one) —
   rules in each mod's `challenges.js`); a challenge is a normal run at stake 1 on the Challenge Deck, recorded by id in
   the recipe (`challenge`), posts no high score, earns no win stickers. **Sleeves** as deck variants
   (`engine/sleeve.js`; Pokermon 10, Pokermon+ 5 in each mod's `sleeves.js`, deck pairings as `alt`): New
   Run's sleeve row, recipe `sleeve`. **Deck skins** (cosmetic, `ui/skins.js`; Pokermon RBY/GSC, Bunco in each mod's
   `skins.js`): Options > Card skins, per player. **Pokermon UI** (`mods/pokermon/ui.js` through the mod UI seam
   `ui/modui.js`): type pills + Energy pips, the Pokédex (right-click / double-click / Dex / P / Run Info tab),
   shiny / evolution / Zorua shaders, Zorua's disguise, the Unown swarm animation. **Win stickers** per joker
   (`ui/stickers.js`, from the engine's `win` event; saved on the account in `micatro_stickers:<user>`, merged by max,
   localStorage as the offline cache; guests keep them in the browser). Tests: `micatro/tests/challenges_test.mjs`,
   `overworld/tests/micatro_challenges_ui_test.mjs`, `overworld/tests/micatro_winstickers_test.mjs`.

## 8. Run replays (2026-10-16)
A replay is always a **whole run** (first blind to game over / the win / the end of Endless), never one
round: the run's recipe `{v, seed, back, stake, mods, modOptions, customDeck?, actions}` re-simulated
by the engine (it is deterministic), so it costs a few KB and plays back exactly like live play.
- **Recording** (`ui/main.js` recordReplay): at the game over, and at the win (a win that goes on into
  Endless is recorded again at its game over under the SAME local id and server id, so the board link
  always shows the whole run). Kept locally (`micatro_replays_v1`, last 10, oldest evicted when storage
  is full — never the live run save) by `js/replays.js`, which also packs the share code (`G1.` gzip,
  the Battlecards tape format) and builds the meta (score as big-number text, ante, round, won/endless,
  deck, mods, seed, action count, final `viewChecksum`, engine version).
- **Server** (`server/mp.mjs`): `micatro-replay-put` (signed in, rate-limited, packed <= 300 KB,
  unpacked under a 4 MB cap, a `{v, seed, actions[{type}] <= 20000}` recipe; `id` extends YOUR
  replay in place) writes exactly `mreplay:<8 hex>` = {code, meta (allow-listed), by, when}, GC'd
  after 30 days; `micatro-replay-get` is public (above the auth gate, IP-limited like replay-get).
  Signed in, the replay is uploaded first and `run-score` carries its id (`replay`, stored on the
  board row only if it is the scorer's own upload) -> a ▶ on the leaderboard row. The final
  `publish-micatro` carries it too, so a friend spectating the finished run gets "▶ Watch the full run".
- **Viewer** (`ui/replayview.js`, MODE 'replay'): `/micatro/?replay=<id>` (`/mr/<id>` short link)
  or `?replay=local:<id>`; the engine + the run's mods load, `Session.stepper(recipe)` (engine
  `ReplayStepper`) steps the actions into `player.push(view, events)`; selections run instantly;
  seeking rebuilds from the start (~0.3 ms an action). Bar: first / step back / play-pause / step
  forward / last, 1-2-4x, scrubber with blind ticks + ante marks + the win star, Ante chips, counter,
  Exit; keys Space / arrows / Home / End; controller LB/RB step, Y play-pause, bar buttons are pad
  stops. It tucks away while playing. At the end the rebuild is checked against the meta checksum: a
  different end, or an action the engine now rejects, shows "This replay was recorded on an older
  version and may play out differently" (and stops there). Entry points: game-over / win modal
  (Watch replay, Copy replay link when signed in), leaderboard ▶, main menu **Replays** list
  (watch / copy link / delete).
- Tests: `micatro/tests/replay_test.mjs` (engine), `overworld/tests/micatro_server_test.mjs`
  (section 5), `overworld/tests/micatro_replay_test.mjs` (browser).

## 9. Mod version pins + key aliases (2026-10-19)
Saved runs and replays are recipes that re-simulate from their actions, so a change to how a mod plays would
silently change every old run that is resumed or watched. Each recipe now records the versions it was played on.
- **The pin** (`js/mods/pins.js`): `recipe.modVersions = {modId: pin}` for every active mod (requirements
  included) and `recipe.engineRev = ENGINE_CONTENT_REV`, stamped by `Session.start`. A pin is the mod's
  registered `version`, plus `+r<contentRev>` when the mod declares `contentRev` (`'3.2.1+r1'`). The replay
  meta (`js/replays.js` buildMeta) copies them; `server/mp.mjs` keeps `modVersions` (<= 32 entries, id
  `[A-Za-z0-9_-]{1,40}`, pin `[A-Za-z0-9 ._+()-]{1,40}`, bad entries dropped), `engineRev` (int) and
  `pinAssumed` in the allow-listed meta, and refuses a recipe whose own pins are malformed.
  `recipe.v` (`ENGINE_VERSION`) stays the recipe FORMAT version: never bump it for a rules change (a saved
  run with another `v` is not offered at all).
- **Old recipes** (no pins) are read as `LEGACY_MOD_VERSIONS` / `LEGACY_ENGINE_REV` (the versions shipped on
  `PIN_DATE`, 2026-10-19), and `Session.fromRecipe` writes that assumption in (`pinAssumed: 'legacy:2026-10-19'`).
  The legacy table is frozen: never edit it.
- **Resume** (`ui/main.js` continueRun): when `pinDiff(recipe)` is non-empty the player gets a prompt naming each
  changed mod and both versions: **Continue anyway** (the run is rebuilt on the new rules and re-pinned to them;
  the old pins go to `recipe.repinned`; a move the new rules reject ends the rebuild there, with a toast) or
  **Abandon run** (pressed twice). Both keep a copy of the save first (`micatro_run_backup_v1`); Back keeps it
  untouched. A run that can't be rebuilt at all is never wiped silently either: it gets the same prompt.
- **Replay** (`ui/replayview.js`): a mismatch shows a banner up front ("Recorded with Pokermon 3.2.1; current
  3.9.1. Playback may differ.") and still plays; a move the engine rejects stops playback there with a message
  naming the change.
- **Key aliases** (`js/mods/aliases.js`, no imports): per mod `{renamed: {old: new}, removed: [keys], names}`,
  in `MOD_ALIASES` or a mod's `registerMod({aliases})`. Resolved when READ, never by rewriting what is stored:
  a recipe's back / stake / sleeve (`newRun`), a custom deck's keys (`validateDeck`), the win stickers (a
  sticker under the old key counts for the new one). A rename only applies once the old key is no longer
  registered, so it can be seeded before the upgrade lands (`bl_poke_cgoose` -> `bl_poke_iridescent_hacker` is,
  dormant). A removed key keeps its stickers and records, is skipped in play, and is listed greyed out as a
  "retired card" (Achievements > Record for stickers, the deck editor's items and bans). The Nuzlocke record
  holds no card keys (counts per type only), and there is no stored Pokédex seen-list.
- **Not pinned:** the spectate state (spectators receive the runner's rendered views, they never re-simulate)
  and Super-replay playlists (Battlecards tapes only; a Micatro replay is already the whole run).

**In every mod upgrade (or any change to how a mod plays):**
1. An upstream upgrade: set the mod's `version`. Any behaviour change of ours (a port fix, a house rule,
   re-extracted data, a pool weight, an RNG seed key): bump its `contentRev` in `registerMod` (it only ever goes
   up). Base-game behaviour: bump `ENGINE_CONTENT_REV` in `js/mods/pins.js`. Never edit `LEGACY_MOD_VERSIONS`.
2. Every key that was renamed: `renamed: {old: new}` under the mod in `js/mods/aliases.js` (or the mod's
   `aliases`). Every key that is gone: `removed: [key]` (+ `names: {key: 'Display Name'}`). Never reuse a
   removed key for a different card.
3. Re-record the seeded mod tests and fuzz baselines in the same PR, naming the version in the fixture.
4. Tests: `micatro/tests/modpin_test.mjs` (engine), `overworld/tests/micatro_mod_version_pin_test.mjs`
   (browser + server); add the upgrade's own renamed / removed keys to its mod test.

## 10. More Fluff 1.9.9999 — batch A (2026-10-19)
The owner's call: port the 1.9.9999 rewrite (its LICENSE file was deleted upstream on 2026-03-06; the manifest still
says `allow_redistribution: true`; nothing in the tree forbids porting). Pin `1.9.9999+r1`. Details, the retired-key
table, art provenance and the follow-up batches: `micatro/mods/morefluff/PORTING.md`.
- In: its 69 returning jokers (reworked), the 11 it retires to a hidden "Old Fluff" rarity (registered, never offered),
  Colours (Gold now a Spectral), Rotarots + Merchant / Tycoon, the Superboss rework (pick your DX boss), 6 stakes +
  3 stickers, the exile zone, the Purple Deck. Deleted keys (2 jokers, 2 decks, 4 sleeves, 2 packs, 2 tags, 1 challenge)
  are retired keys in `js/mods/aliases.js`.
- Kept at 1.5.6 until the pkseams merge: Tall Joker, Triangle (their reworks need attributes / scale_card).
- Follow-ups: about 20 of the 81 new jokers have real art upstream (batch B1 + the Letter / Purple / rot pools); the
  other ~61 are placeholder sketches and wait for art. Each batch bumps contentRev and re-records
  `micatro/tests/fixtures/morefluff_<pin>_fingerprints.json` (`morefluff_fingerprint_test.mjs --record`).

## 11. What follows the player between devices (2026-10-19)

Signed in, these are saved on the Magepunk account (D1, `server/mp.mjs`) as well as in the browser, so they
follow the player between PC and phone. Guests keep everything in this browser; the first account that signs in
there takes the guest's data once (merged, never deleted).

| Data | Where | How it syncs |
|---|---|---|
| **Run in progress** | `micatro_run:<user>` (one active run) + `micatro_run_v1` | `ui/runsync.js`: pushed at round checkpoints / once a minute / on hide (~45-55 writes for an 8-ante run). Compare-and-set on `rev`; a behind or different run never overwrites; cleared on win / loss / abandon (that run only, tombstoned). Two different runs: the player picks, the other is backed up to `micatro_run_backup_v1`. |
| **Completed challenges** | `micatro_challenges:<user>` + `micatro_challenges_v1:<user>` | `ui/challengesync.js`: union, earliest time kept |
| Win (stake) stickers | `micatro_stickers:<user>` | max per joker and category |
| Nuzlocke / Monotype record + achievements | `micatro_progress:<user>` | counts max, union |
| Custom decks | `micatrodecks:<user>` | CAS on `rev`, merge on conflict |
| Leaderboard rows, uploaded replays | `runboard:*`, `mreplay:*` | server-side |

**Device-local only:** options (speed, sound, stake stickers on/off), deck skins, the New Run screen's last
picks and mod selection, the Replays list (this device's last 10 runs; a shared one lives on the server), the
one run backup slot (`micatro_run_backup_v1`), the device id (`micatro_device_v1`).

Tests: `overworld/tests/micatro_runsync_server_test.mjs` (server), `overworld/tests/micatro_runsync_test.mjs`
(two browser contexts as two devices on one account).
