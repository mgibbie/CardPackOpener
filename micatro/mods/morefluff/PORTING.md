# More Fluff — porting notes

**Mod:** More Fluff by **notmario and contributors** (github.com/notmario/MoreFluff; the manifest's author list is
"notmario, and more"; in-mod art credits name Multi for the Colour cards, and footlongdingledong, marigold, LFMoth, Ice
and Incognito for other art).

**Version in Micatro:** `1.9.9999` (tag `1.9.9999`, commit 8eb1e77, 2026-09-06), `contentRev` 2 — pin `1.9.9999+r2`
(`micatro/js/mods/pins.js`; batch A was `+r1`, batch B below is `+r2`). Earlier: 1.5.6+ (main at b32b916, 2025-09-17), the legacy pin `1.5.6`.

## Licence

- Up to 2026-03-06 the repository carried an MIT `LICENSE`. Commit `32701ac` ("Kill", 2026-03-06) deleted it; the
  1.9.9999 tree has no licence file.
- The mod's manifest (`MoreFluff.json`, still in 1.9.9999) says `"allow_redistribution": true`.
- Nothing in the 1.9.9999 tree (code, README, manifest, localization) forbids redistribution or porting.
- The owner chose to port the 1.9.9999 rewrite on 2026-10-19 with the licence-file removal flagged
  (Plans/MICATRO_MODS_PLAN.md §10).

## How the port is built

- `data.js` / `loc.js` are generated from the mod's own Lua by `tools/micatro/gen_morefluff_data.cjs` (it runs
  `tools/micatro/extract_mod_data.cjs` on exactly the files `src/jokers.lua` loads, on a checkout of the tag:
  `git -C MoreFluff archive 1.9.9999 | tar -x -C <dir>`). Never edit them by hand.
- Behaviour is ported by hand, module by module (see `index.js`'s header).
- `legacy.js` holds what this version keeps from the 1.5.6 port on purpose (below).

## Batch A (this version, contentRev 1)

In: the 69 jokers 1.9.9999 keeps from our 1.5.6 set (with its reworks and number changes), the 11 it retires to the
hidden "Old Fluff" rarity (registered, weight 0: never offered, but old saves / replays / win stickers load them),
the Token "Oops! All 5s", the 16 Colour cards + Gold (now a hidden Spectral), 22 Rotarots + Rotarot Merchant / Tycoon,
8 enhancements, the Superboss rework (free Ticket, Superboss Pack and 15 tokens, unskippable pack, frozen ante),
6 stakes + Heavy / Potato / Suspended stickers, the exile zone + suspended cards, the Purple Deck, the 2 Modded packs
(weight 0 — Repack's).

Kept from 1.5.6 on purpose (`legacy.js`):
- the retired jokers' real art — 1.9.9999 draws its whole "Old Fluff" rarity as placeholder sketches;
- (until batch B) Tall Joker's and Triangle's 1.5.6 behaviour and text — their reworks read Steamodded attributes and
  `SMODS.scale_card`'s calc_scaling, the engine seams of the then-unmerged pkseams branch. Batch B ports the reworks;
- Fast-Growing Sapling's Jimbo art (1.5.6 had no atlas; 1.9.9999: a placeholder sketch). The 1.5.6 port pointed it
  at the magenta "missing texture" cell (Missing Joker's art): fixed;
- the pre-turned art of the Rotarot cards / packs and Cartomancer! (1.9.9999 turns upright sprites by pi/4 in the
  engine; Micatro has no turned sprites, the 1.5.6 sheets are the same art turned).

Engine seams added (no behaviour change without a mod using them): hooks `ease_ante_mod`, `can_skip_booster`,
`can_use_consumeable` (`js/mods/registry.js`), the board's `view.pack_no_skip`.

Port notes: Deep Blue / Red / Orange pick their card with an undefined `rng_seed` (math.random) upstream: seeded here.
Pink Stake's Standard Pack uses math.random(1, 4): the engine's seeded math_random. A Superboss Token's text names the
slot its pick fills next (upstream's `used or 0 + 1` reads the last one). The superboss backdrop, screen shaders,
art-credit popup and mod-page UI are visual only and not drawn.

## Retired keys (`micatro/js/mods/aliases.js`, `MOD_ALIASES.morefluff`)

| Key | Name | Why |
|---|---|---|
| j_mf_complexitycreep | Complexity Creep | deleted in 1.9.9999 |
| j_mf_lightningstrikesthrice | Lightning Strikes Thrice | deleted |
| b_mf_grosmichel / b_mf_blasphemy | Gros Michel / Blasphemous Deck | decks removed |
| sleeve_mf_grosmichel / _philosophical / _rainbow / _blasphemy | the 4 sleeves | CardSleeves support removed |
| p_mf_modded_jumbo_1 / p_mf_modded_mega_1 | Jumbo / Mega Modded Pack | packs removed |
| tag_mf_moddedpack / tag_mf_clutch | Modded / Clutch Tag | tags removed |
| c_mf_superboss_always | Better Balatro II | challenge removed |

Nothing was renamed. The 11 "Old Fluff" jokers are NOT retired keys: they are still registered.

## Art (assets are gitignored; deployed by `npm run deploy-micatro-mods`)

1.9.9999 ships 1x art only. The old 2x files were that same art doubled (checked cell by cell), so the 1.9.9999 sheets
are staged at 2x nearest-neighbour as new files under `assets/2x/1.9.9999/` (jokers, colours, packs, vouchers,
enhancers, tags, blinds, stakes, stake stickers), plus `assets/sounds/1.9.9999/buzzer.ogg` and
`assets/fonts/1.9.9999/NotoEmoji-Bold.ttf`. Unchanged sheets keep their 1.5.6 files (`mf_hyperjimbo`, `mf_mv`,
`watermark`, `mf_rotarots`, `mf_rotarotpacks`, `mf_rot_cartomancer`, `mf_jokers_refresh` for the retired jokers).

Batch B adds these new files, made by `tools/micatro/stage_morefluff_batch_b_art.mjs --src <MoreFluff at 1.9.9999>`
(reproducible, never overwrites):
- under `assets/2x/1.9.9999/`:
  - `mf_loyalty.png` (the loyalty counter, 2x);
  - `mf_letterjokers_b.png` (the Letter tiles centred in card cells);
  - `mf_purple.png` (2x);
  - `lettergem_destroy_b.png` / `lettergem_g_b.png` (the tooltip pictures, 5 frames each);
  - `mf_rot_jokers_b.png` / `mf_rot_soul_b.png` (pre-turned 45 degrees);
  - `mf_rot_spectrals_b.png` (the 7 composed Spectral cards);
- `assets/sounds/1.9.9999/g.ogg` (Lettergem G's riff), copied as is.

The B1 jokers draw from the already-staged 1.9.9999 `mf_jokers.png`.

## Batch B (contentRev 2, pin `1.9.9999+r2`)

The follow-up batches, stacked: the after-pkseams items, then B1, B2, B3. Everything is fired by
`micatro/tests/mods/morefluff_batch_b_test.mjs` (234 checks; on origin/main 11 pass and 46 fail). The seeded fingerprints
were re-recorded (`micatro/tests/fixtures/morefluff_1.9.9999+r2_fingerprints.json`). Their bot seeds were re-picked so each
run still gets a few antes in: object_weights re-rolls every shop.

### After the pkseams merge

- **object_weights is on** (1.9.9999 `src/misc.lua`: `FLUFF.optional_features = {retrigger_joker, post_trigger,
  quantum_enhancements, object_weights}`, all declared). Every More Fluff run's card keys, editions, tags, packs, bosses,
  vouchers and shop rolls now go through `SMODS.poll_object` (`js/engine/smods.js`). More Fluff's own `SMODS.poll_seal` /
  `poll_enhancement` (util.js: the Styled card, Seaweed) use the weighted versions while it is on.
  - **With Pokermon:** it is one Steamodded flag, so either mod turns it on. More Fluff + Pokermon plays exactly as with
    Pokermon alone. More Fluff's weight hooks (Rotarot Merchant / Tycoon's `get_weight`, Gentlemelon / Joker Reacts'
    `modify_weights`) then also weigh Pokermon's pools.
  - **Fixed:** More Fluff's local seal / enhancement polls ignored the flag when Pokermon turned it on.
- **`util.scale_card` is the engine's `scale_card`.** Its scaling_card listener pass comes with it.
  - More Fluff opts in to just the Steamodded contexts it reads: `registerMod({smods_seams: [...]})`, a new per-context
    form of the seam opt-in, for `scaling_card`, `modify_weights`, `modify_shop_card`, `modify_scoring_hand` and
    `setting_ability`. It still emulates stay_flipped / debuff_card itself.
  - Steamodded's deprecated center hook `calc_scaling` (lovely/center.toml) is supported: Triangle and Doubled Scale use it.
- **The base game's scaling jokers scale through `scale_card` too**, as Steamodded routes them (lovely/scaling.toml:
  Ceremonial Dagger, Flash Card, Red Card, Spare Trousers, Ride the Bus, Egg, Runner, Square, Castle, Wee, Ice Cream,
  Madness, Constellation, Campfire, Lucky Cat, Obelisk, Hit the Road, Green Joker, Vampire, Hologram, Rocket, Turtle
  Bean, Popcorn, Ramen, Yorick, Canio, Glass Joker).
  - This only happens while an active joker listens (`js/engine/jokers.js vscale`); otherwise the vanilla line runs,
    unchanged.
  - Deviation: the jokers keep their own vanilla popups. Steamodded's patch rewords a few of them.
- **Tall Joker (1.9.9999):** +44 Mult only while no other joker has the mult / xmult / emult / hypermult attribute
  (Steamodded's built-in pools, plus every center's own `attributes`). Its art is the base game's Jimbo, as 1.9.9999
  draws it. Its tall `display_size` isn't ported: Micatro's card frame is fixed.
- **Triangle (1.9.9999):** other jokers' scalings run at X its rate (an 'X' scaling uses scalar ^ rate). It starts at X1
  and gains +0.5 per Three of a Kind. Copies don't boost each other; with two of them, the `_lame` text shows.
- **More Fluff's SMODS.Attributes** are registered: colour, rotarot, exile, sliver, freaky, plus tetration's emult /
  hypermult / hyperchips. Every object keeps its 1.9.9999 `attributes`: the hand-built consumables, packs, vouchers,
  enhancements, tags and blinds get them in index.js.
- `legacy.js KEPT_156` is now empty.
- Of the "attribute-reading jokers that only lacked seams", these have real art and are ported: Tall Joker, Retrigger
  Joker and Joker Reacts. Joker with Set's Mechanic, the Slivers, Lone Wolf, Nemesis and Refrigerator are sketches.

### B1: 13 new jokers (real art; jokers_d.js, planeswalker.js)

| Joker | What it does |
|---|---|
| Dinner | Retriggers the joker to its right for 5 rounds (retrigger_joker_check), then it is eaten |
| Forge ("Joker Forge") | Every 2 Jokers sold create a random Joker. While another Forge comes first in the row, it makes a Forge Residue token instead; a sold Forge Residue doesn't count |
| Doubled Scale | Every `scale_card` scales twice as fast (an 'X' scaling squares its scalar) |
| Bouncer | On entering the shop, the joker to its right (else the first consumable) goes back to the shop. +3 Chips per $1 of that card's sell value. A returned Joker leaves a Fish token (+4 Chips, +4 Mult) |
| Jokes for Minecrafters | A joke each round (10 kinds); the first discarded card it names is destroyed |
| Apple Friends | Every +Chips / +Mult is doubled, per copy (SMODS.calculate_individual_effect wrap: the new `eval_card_result` hook, also on the per-card joker effects). It is destroyed when another Joker is sold |
| Gem Alert | Rare jokers X6.7 as common (G.GAME.rare_mod: the engine's rarity poll now weighs `<rarity>_mod`, as SMODS.poll_rarity). +X0.1 Mult for each Rare / Editioned Joker the shop rolls (modify_shop_card). Its diamond layer is a plain overlay: no polychrome shader |
| Gentlemelon | Duplicates may appear (SMODS.showman: the `pool_duplicates` hook). Owned cards' duplicates are X100 likelier (modify_weights). It dies after 4 purchases / packs opened |
| Joker Reacts To Broccoli | Food jokers X3 likelier and face down in the shop. Buying one: $2 and +1 Mult |
| Retrigger Joker | Retriggers every other joker with the "retrigger" attribute, and the 5th scoring card |
| Alchemy Joker (`digital_exclusive`, "A-Hit the Road") | Sold: a random "passive" Joker (SMODS.poll_object over the attribute) that perpetually gains A-Hit the Road. Discarded Jacks are then exiled until the end of the Ante, and it gives X(1 + 0.5 per exiled card). This is FLUFF.calculate_extra_effects, the `calculate_joker` hook |
| Jimbo, the Mind Sculptor | A Planeswalker (loyalty 3). +2: draw a card. 0: draw four, then the three leftmost go back and the deck is shuffled. -1: the whole hand into the deck. -12: destroy the deck |
| John Balatro? | A Planeswalker (loyalty 1). +1: exactly five selected cards with no Mult bonus get +4 Mult (perma_mult). -11: becomes John Balatro (^2 Mult before scoring: initial_scoring_step = the `modify_scoring` 'before_cards' step) |

**The Planeswalker system** (src/planeswalker.lua):
- Each cost is a button on the joker: view_card `mod_actions` -> the `mf_loyalty` action. Buttons are greyed out while
  they can't be used: board.js now honours `mod_actions[].disabled`.
- One use per round (`uses`, back to 1 when a Blind is set). An ability needs nothing in play, its cost payable, and its
  own `can_loyalty`.
- The loyalty is drawn from mf_loyalty.png as stickers (shield + digits).

Forge Residue's art is upstream's own scribbled "slop" token card (not a "Placeholder" sketch).

### B2: the hidden pools (real art; letters.js)

The 26 Letter jokers (rarity "Letter", mf_letterjokers.png) and the 3 Purple jokers (Aura Farm, crad shuffler, Purple
Economy Joker; rarity "Scrapped", mf_purple.png).
- **Where they come from:** in 1.9.9999 only `FLUFF.get_hidden_rarity()` rolls these rarities: the Old Deck (its
  Buffoon packs add two) and Bonus Sheet. Both stay out (below), so these jokers are registered with their behaviour and
  art but never offered. Lettergem F (a Letter joker itself) makes Letter jokers.
- **Letters:**
  - A: Aces +2 Mult, retriggered.
  - B: a $7 Buffoon Pack in each shop.
  - C: X5 per 100 chips' worth of scored cards.
  - D: destroys 2 random cards at the end of each round.
  - E: ^1.4 Mult.
  - F: a Letter joker each Blind.
  - G: "G", X1.01 per scored card, with its riff.
  - H: retriggers all scoring cards but the first.
  - I: Straights with 2 fewer cards (the `straight_min` hook); X2 on a five-card Straight.
  - J: retriggers the 2 jokers to its right, -$0.5 per trigger (the new `post_trigger` context, opt-in by the
    optional feature).
  - K: a Negative 1-in-2 Cavendish each Blind.
  - L: the first played card is also Lucky (quantum enhancement), its chances X3.
  - M: a Jolly Joker with +$3 sell value.
  - N: a Negative Joker on Boss Blinds.
  - O: every probability 1 in 2.
  - P: Blind size X0.9 per Ante (SMODS.mod_blind_size).
  - Q: cards held next to a held Queen X1.3.
  - R: +1 Round each Blind, +1 Mult per Round.
  - S: scored and held 6s / 7s +6 Chips +7 Mult.
  - T: draws another card for each Wild Card drawn (it chains).
  - U: cards don't score; +13 Mult per played card (modify_scoring_hand).
  - V: a Voucher Tag per purchase.
  - W: a 1-in-5 Wheel of Fortune each Blind.
  - X: every XMult trigger +X0.02 more, growing.
  - Y: $10 per 13 cards scored.
  - Z: prevents death and destroys 13 cards.
- **Purple:**
  - Aura Farm: held Tarots get a prepared Aura (prepared.js).
  - crad shuffler: the 3 bottom deck cards also score (lovely/adding_to_hand.toml: `G.scoring.score_played` at
    `held_cards_scored`); a discard shuffles the deck.
  - Purple Economy Joker: $2 whenever the deck is shuffled (the `shuffled` hook), and opening a hand-drawing pack
    "shuffles" (lovely/ourple.toml).
- **The Lettergem pictures:** D's, G's and Z's tooltips show their animated pictures (generate_ui, lettergem_destroy /
  lettergem_g: 5 frames). This is a new `desc.imgs` that board.js draws.
- **Port notes:**
  - The Letter tiles (71 x 78) are staged centred in card cells, not stretched.
  - N's text names an unlocalized `j_vremade_joker` upstream: it is shown as "Joker".
  - G's "G" popup shows as the default "X1.01" (Micatro's per-card popups ignore `remove_default_message`).
  - An Aura Farm Tarot whose `ability.extra` is a number keeps its prepared state in `ability.mf_aura_used` (upstream
    indexes a number there).
  - Letters had no `name`: every joker now gets name = key when the Lua gives none (SMODS.Center). Balatro marks
    `used_jokers` by name, so before this, all 26 counted as used at once.
- **The Old Deck stays out.** Of its 32 other Old Fluff jokers only the 3 Purple ones have art: the other 29 are sketches
  (Brainrot, Triangular Joker, Box of Hands, Glitter Bomb, Money Printer, Seal the Deal, particleaccelerator, Balatro
  Mods, 5D Joker, Whiteboard, Miner, Black Market, The Jester, Ace Up the Sleeve, Burner Phone, Big Shot, Mr. Loans,
  Monochrome Joker, Emeritus of Growth / Eternity, Stormscale, Steamflogger Boss, Marketable Plushie, Freaky Pizza,
  4rd Sanctuary, Triboulet!? / Chicot!? / Triangle!? / Marigold!?). Bonus Sheet is a sketch too.

### B3: the rot legendaries, their Spectral cards, The Soul! (rot.js, prepared.js)

**The 7 "45 Degree Rotated" Legendaries** (rarity "Legendary!", weight 0: only The Soul! makes them). Each starts
prepared. Its USE button casts its prepared Spectral; that unprepares it until its own condition comes round:

| Legendary | Prepared again when | Its Spectral |
|---|---|---|
| Canio! | a non-face card is destroyed | Doom Blade: destroy 1-3 selected face cards; each non-face card held gets -X0.05 Blind size per card destroyed (perma_x_blind_size, scored: the Blind's size X(1 + it)) |
| Triboulet! | a Pair is discarded | Royal Decree: until the end of the round, each hand adds a King and a Queen to the scoring hand (X3 Mult each, then destroyed). Uses the new `add_to_scoring_hand` / `destroy_card` hooks |
| Yorick! | every 23 discards | Windfall: every hand card gains X0.2 Chips (perma_x_chips), then the hand is discarded |
| Chicot! | a Blind is skipped | Negate: disable the Blind, its size ^0.8 |
| Perkeo! | a hand scoring 4 suits (at the end of the round) | Mirrorform: two Negative copies of random consumables |
| Triangle! | a Three of a Kind (at the end of the round) | Manamorphose: use five random Colour cards, one trigger each |
| Marigold! | a card's enhancement changes, not to Marigold (setting_ability) | Lotus Bloom: up to 1 selected card becomes Marigold, then every Marigold card in the deck / discard is drawn |

**Prepared cards** (src/prepared.lua):
- The `mf_use_prepared` action makes a copy of the prepared consumable in play and uses it, then fires
  context.mf_used_prepared.
- Whether it can be used is the consumable's own can_use on a stand-in (the Lua's get_dummy).
- The tooltip shows the prepared card's text and whether it is prepared.

**The Spectral cards** appear only while their legendary is held (`in_pool`). **The Soul!** is a hidden Spectral that rolls
in Rotarot packs (`soul_set`) and makes a rot legendary.

**Art:**
- Upstream draws the 7 Spectrals as "Placeholder!" sketches (mf_rot_legendary_consumables.png). They are composed by
  `tools/micatro/stage_morefluff_batch_b_art.mjs` in the style of More Fluff's own Spectral card, Gold: Gold's card and
  label strip, with the legendary's swirl and figure on the swatch and the name in More Fluff's label font (its glyphs
  are read off the Colour cards' labels).
- The legendaries and The Soul! (the base game's The Soul + its gem) are turned 45 degrees by that tool, as 1.9.9999
  turns them in the engine (`mf_rotate_by`). They sit in 112 x 112 cells like the 1.5.6 pre-turned Cartomancer!.

### Still out (placeholder sketches upstream)

**The 61 active jokers:** Triangle, Planeswalker ("wip"), Lone Wolf (tempname001, "TODO new art"), Joker With Set's
Mechanic, Nemesis (+ its pack / tag), Repack, Stifle, Stasis Chamber, Bonus Sheet, Bridge from Below, Cosmogoyf, Cryptic
Mod (+ the Cryptic edition), Diabolical Joker, Emeritus of Decay / Lore / Variety / Inevitability / Rebirth, the 15
Slivers (Muscle, Sinew, Homing, Astral, Fortunate, Gemhide, Might, Mindlash, Plasma, Sliver Jockey, Virulent, Quantum,
The First Sliver, Fury, Megantic), Ghostly Reflection, Hold Music, Ice Cube, Junkyard, Knuckleblaster, the 5 Pacts
(Intervention, Negation, the Titan, Slaughter, Summoner's), Ransom Note (+ its enhancement), Refrigerator, Saturn Burger,
Shopping Spree, Violent Outburst, A Heart of Cold, Apex Devastator, The Baseball Stream, Disintegration Loop, Mathemagics,
Overlord of the Plasmadeck, Phyrexian Banner, Riding the Dilu Horse, Space Elevator, Suspension of Disbelief, Sword of
Steven and Todd, Three Steps Ahead, Whiplash, Zhulodok.

**The rest:**
- The Disintegration Loop forms (This Heat, an Evil Heat; halt; the shattering circle; Event Horizon).
- The Old Deck (above) and the Spellchaser's Deck ("Lutri Placeholder"); Halt's Power enhancement.
- The Jen-only John Balatro. (Cross-mod.)

### Engine seams added in batch B (no behaviour change unless a mod uses them)

- **js/engine/smods.js:**
  - `smods_seams: [names]` (a per-context opt-in);
  - `calc_scaling` / `calc_resetting` center hooks.
- **js/engine/jokers.js:** `vscale`, the base game's scaling jokers through `scale_card`, only while a listener is active.
- **js/engine/core.js:**
  - the rarity poll weighs `G.GAME.<rarity>_mod`;
  - the `eval_card_result` hook.
- **js/engine/run.js:**
  - the `post_trigger` context (optional feature);
  - `eval_card_result` on the per-card joker effects;
  - the `add_to_scoring_hand` and `destroy_card` hooks.
- **js/ui/board.js:**
  - `mod_actions[].disabled` / `.cls`;
  - tooltip pictures (`desc.imgs`, animated strips).
