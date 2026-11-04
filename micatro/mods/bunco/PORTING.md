# Bunco — porting notes

Bunco (Firch, RENREN, Peas, minichibis, J.D., Guwahavel, Ciirulean & ejwu; no licence file) is rebuilt natively for
Micatro (`registerMod` id `bunco`, prefix `bunc`). How the port is laid out: the header of `index.js`.

## 5.4.8b fork catch-up (batches 2 and 21 of Plans/MICATRO_MODS_UPGRADES.md, 2026-10-21)

- **Sources.** Ours was Firch's final **5.1** (github.com/Firch/Bunco `016e4cd`, 2025-03-20). The community fork
  github.com/jumbocarrot0/Bunco, tag **v5.4.8b-JumboFork** = **9643e85326f2ba796ae2b0e043e2e45ec5d0e953** (2026-02-20,
  Bunco.json `5.4.8b~JumboFork`; 275 commits on top of 016e4cd). No new content: fixes, balance / timing changes, text, art.
  (The fork's later `v5.5.0-Beta1` is not used.)
- **Pin: `5.4.8b-JumboFork+r1`** (`version: '5.4.8b-JumboFork'`, `contentRev: 1`). `LEGACY_MOD_VERSIONS` untouched (bunco `5.1`).
  A Bunco run or replay recorded on 5.1 shows the "Mod updated" prompt / banner (js/mods/pins.js `pinDiff`). contentRev 1 counts
  what is OURS on top of the fork: our own fixes it lacks, the fork bugs not copied, and the perishable_compat default below.
- **Gating decision: the version pin only, no mod option.** The pin already gates resumes (prompt) and replays (banner), and the
  plan's "(gated)" (§2.5 "PR B: behind the version pin") asks for nothing more; an option would split Bunco into two rule sets that
  every Bunco test and the fuzz would have to cover, for changes the fork itself ships unconditionally. Nobody asked for one.
- **Extractor.** `tools/micatro/extract_mod_data.cjs` stubs `SMODS.find_mod = () => {}` (Lua: `function() return {} end`, so
  `next(SMODS.find_mod('x'))` is nil: no other mod loaded). The fork calls it at load time (`malverk`, `paperback`, `allinjest`).
  With it, the fork extracts (spec `tools/micatro/specs/bunco.json`, same prelude as 5.1). `data.js` was NOT regenerated: the
  extraction of both versions was diffed instead, and the fork's static changes are tiny and applied by hand —
  Glitter `extra_cost` 3 / Fluorescent 1 (editions.js), The Deal `above_hand` `bunc_Spectrum Five` + `no_collection` (systems.js),
  `perishable = true` on 70 jokers (= Steamodded's default, see below), Games Collector's `drawn_this_round`, Bounty Hunter's
  `being_sold` (unused), Registration Plate's `combination` as a list (not taken: our text keeps the one-var line), the modicon size,
  the Resprites consumables sheet split three ways (pixel-identical cells) and the collab / Paperback skins (not ported).

### Batch 2 — the fork's pure fixes (taken)

| Fix | Where |
|---|---|
| Spectrum with 6+ cards: up to #hand - 5 cards may repeat a suit or have none | systems.js `spectrum_part` |
| The Flame / Indigo Tower never debuff consumables (The Flame: Enhanced cards only) | blinds.js |
| Rankless / suitless guards (SMODS.has_no_rank / has_no_suit / has_any_suit, util.js): Crop Circles (suit and rank parts apart), Prehistoric, Dogs Playing Poker, Zero Shapiro, Pawn, Protester, Stylophone; The Tine, Chartreuse Crown (debuff + in_pool); Filigree Tag's Wild check | jokers_a/b/c.js, blinds.js, tags.js |
| Eternal Tag: never on a Scattering / Hindered joker or one with `eternal_compat` false; Perishable Tag: never on `perishable_compat` false — the tag waits for the next shop joker | tags.js |
| Breaking Tag: also applies on `immediate`; the reworked Luchador runs the immediate tags when sold, so a Breaking Tag gained during a Boss disables it at once; the disable is queued | tags.js, reworks.js |
| Registration Plate: a debuff cycle (`add_to_deck(from_debuff)`) no longer re-rolls its ranks | jokers_a.js |
| The Deal: 5+ cards, every card one of the Plate's ranks, at least the Plate's count of each (6-card plays can be a Deal); only non-debuffed Plates | systems.js `deal_part` |
| Bounty Hunter sell: nothing to port — 5.4.8b's fix is for its own rebuilt version (no "+Mult" popup on the card being sold); ours still robs $1 of its own sale, as both versions do | — |

Not copied — **fork bugs**:
- **The Mask's `in_pool`** compares `most_played_poker_hand ~= most_played_poker_hand` (always false: The Mask never appears).
  Ours keeps 5.1's pool rule. (The fork's nil guard on the most / least played hand is moot: init_game_object sets both.)
- **The Deal's early return**: `if not match then return {} end` leaves the whole part on the first Plate that doesn't match, so a
  second Registration Plate is never checked. Ours moves on to the next Plate.

Kept **ours** (the fork did not fix them): Sledgehammer (fix 1), Dread (fix 2), Knight (fix 4) — jokers_a.js; Juggalo (fix 2) —
jokers_b.js. Fixed by both, differently:
- **Loan Shark**: the same fix (`from_debuff` ignored) — kept ours.
- **Pawn**: the fork names the rank by the lowest card's `base.value`, ours by its id (RANK_KEY) — same text for every vanilla rank;
  kept ours, plus the fork's has_no_rank guard.
- **Protester**: ours checks the discarded card for Stone; the fork checks it for any rankless card AND skips a debuffed one. The
  fork's is clearly better (vanilla discard jokers skip debuffed cards), so it is adopted.

### Batch 21 — the fork's balance / timing changes (taken, behind the pin)

| Change | 5.1 | 5.4.8b (now) |
|---|---|---|
| Gameplan | +40 Mult at its own slot | +20 Mult per adjacent joker, at THAT joker's turn (`other_joker` context) |
| Conquest | re-rolls `math.random` until it misses itself; target kept on Conquest | ONE `math.random(#jokers - 1)` skipping its slot, in an event; the target is marked (`ability.bunc_conquest_chosen`), cleared at the next blind / when Conquest leaves |
| Fingerprints | the last hand's scoring cards | only the hand that beats the blind; debuffed cards skipped; "Upgrade!" then |
| Games Collector | +10 per group in hand on every linked pull | +10 once per group per round, whenever a group reaches the hand |
| Puzzle Board | rolls on every Tarot | rolls only when cards are selected |
| Dogs Playing Poker | Stone cards skipped | every scored card must be a 2-5; a rankless card (Stone too) breaks it |
| Vandalism | lovely Blind:stay_flipped patch, before The Wheel, first success wins, no Blueprint | Steamodded's `stay_flipped` context (after the blind's own rule), Blueprint / Brainstorm copies roll their own 1 in 4 (`smods_seams: ['stay_flipped']`) |
| Domino | takes any neighbour | only a consumable / playing card / joker; juices only when it took one |
| Prehistoric | keeps the scored CARDS (a later change to a card changes the list) | keeps `{rank, suit, has_any_suit}` as scored; rankless / suitless never kept |
| The Prince | disabled when `hands_played > 0` | a `press_play` flag (same result in Micatro, whose hands_played rises before the redraw) |
| Shop-only stickers | — | already so in the port (create_card's shop / pack branch); 5.4.8b re-fixed its own regression. Its Steamodded-native rolls (`shopssj..key..ante`) are NOT taken: same odds, a different seed for no gain |
| Glitter / Fluorescent | +$0 | +$3 / +$1 shop cost |
| The Deal `above_hand` | Flush Five | Spectrum Five (a Deal that is also a Spectrum Five scores as the Deal) |

Not taken:
- **Fiendish and Bounty Hunter "rebuilt"** (a `bunc_pre_money_change` context). For one copy it plays as 5.1 / ours. With several,
  each copy answers from the ORIGINAL amount and Steamodded SUMS the numeric answers (`ret[k] = ret[k] + v`; without Talisman):
  two Bounty Hunters on a $5 gain pay $8, Fiendish + Bounty Hunter $14; with Talisman (big numbers) the last answer wins. That is
  a bug, so ours keeps the one walk over the jokers in order (jokers_c.js `ease_dollars`).
- Fork changes outside §2.5's list (candidates for a later batch): Ghost Print takes the last hand played when bought; Neon only
  for cards enhanced in hand; The Knoll's cap at the hand size; The Wind's once-per-round flag; Reactive allowed with Eternal
  (its "revamped sticker logic"); Trigger Finger's STOP_USE guard; Copper's `after` guard; Cellphone's active flag;
  `exotic_in_pool` true once a Spectrum hand was played; the volume sliders, Mousetrap's snapped sprite, the collection-only
  consumable editions, the collab / Paperback deck skins. (Cassette's `card_flipped` check is already ours: the flip hook asks
  only the flipped Cassette.)

**Port fix found on the way — perishable_compat.** Steamodded's `SMODS.Joker` defaults `perishable_compat = true`; 5.1 left the
field nil (= the default), 5.4.8b writes it out. data.js had no field, so the port treated every Bunco joker as never Perishable.
`util.js joker()` now applies the default (an explicit false stays: X-Ray, Shepherd, Knight, Bounty Hunter, Rubber Band Ball,
Games Collector, Jumper, Robot, Hardtack, Pica, Magic Wand, Rigoletto). Pinned (rev 1): Black Stake and up can now offer Perishable Bunco jokers.

### Text and art (optional parts)

- **Text**: 29 of the fork's 37 changed descriptions are taken (loc.js; `node` + a merge of the fork's extracted loc): those whose
  `#n#` placeholders are unchanged and whose text is non-empty. Not taken: Registration Plate (`#1#..#5#`, ours keeps one var), the
  three stakes (`(#1#)` filled from the sticker text by a loc_vars we don't have), the four planets (empty). Unlock texts: n/a.
- **Art**: of the fork's "101 touch-ups", every sheet is pixel-identical to 5.1's (re-compressed) except two, vendored under NEW
  names (index.js `ART_548B`): `assets/2x/Jokers/Jokers-548b.png` (new cells 71-76, 150, 160: the exotic-suit Cassette A/B,
  Crop Circles and Slothful variants shown once exotics are on — their `get_pos`; 75/76 are Paperback's, 160 Mousetrap's snapped
  frame: unused) and `assets/2x/Enhancements/Enhancements-548b.png` (the lighter Cracker Card). Gitignored: deploy before merging.

### Tests

`micatro/tests/mods/mod_catchups_test.mjs` fires every fix and change above (and the Reverie / Inscrybed parts of batch 3).
Updated for 5.4.8b: `bunco_test` (hand order: The Deal first), `bunco_jokers_a_test` (Dogs: a Stone card breaks it).
