# Porting Pokermon jokers to Micatro

Pokermon 3.2.1 is rebuilt **natively** (no Steamodded layer). Phase M1 built the systems and
ported `pokejokers_01.lua` as the reference. This file is the guide for porting the rest:
one agent per Lua file, each producing `jokers/pokejokers_NN.js` + `tests/mods/pokejokers_NN_test.mjs`.

Read first: `micatro/js/engine/PORTING.md` (general Lua → JS rules — Lua truthiness, 1-based
indexes, synchronous events, seeded RNG only) and `jokers/pokejokers_01.js` (the worked example).

Lua source: `C:\Users\guide\AppData\Roaming\Balatro\Mods\Pokermon-main\pokemon\pokejokers_NN.lua`.

## Layout

```
micatro/mods/pokermon/
  index.js          registerMod: builds every center from data.js + behaviour from defs.js
  data.js           GENERATED static data (names, pos, config, rarity, cost, stage, ptype, gen, item_req,
                    megas, ...; functions appear as "__fn" markers) — never edit, never retype numbers
  defs.js           defineJokers / defineConsumables / defineBoosters / ... (the behaviour registry)
  api.js            ONE import for ports: engine globals + every Pokermon helper under its Lua name
  systems/          types, evolution, energy, shiny, pools, items (megas / held), rules (lovely patches),
                    scry, anim (view data), utils (pokeutils.lua + SMODS shims)
  jokers/           pokejokers_NN.js (one per Lua file), zotherjokers.js, _template.js
  consumables/      mart1.js, mart2.js (per Lua file)
  boosters/         packs1.js
```

To add a file: create `jokers/pokejokers_NN.js` from `_template.js`, add
`import './jokers/pokejokers_NN.js';` to `index.js` (with the others), write the test.

## The API

```js
import { G, localize, defineJokers, type_tooltip, level_evo, ... } from '../api.js';

defineJokers({
  bulbasaur: {                                     // key = the Lua `name`
    loc_vars(self, info_queue, card) { return { vars: [...] }; },
    calculate(self, card, context) { ... },        // return the Lua table (or undefined)
    add_to_deck(self, card, from_debuff) {},
    remove_from_deck(self, card, from_debuff) {},
    calc_dollar_bonus(self, card) {},              // cash-out $
    update(self, card) {},                         // Lua update(): runs before every calculate
    set_ability(self, card, initial) {},
    in_pool(self) {},                              // only used when the data item has custom_pool_func
    getMega(self, card) {},                        // branching megas (see getMega_by_position)
  },
}, 'pokemon/pokejokers_NN.lua');
```

- `self` is the **center** (`self.config.evo_rqmt` reads the Lua config), `card` the Card — the same
  order as the Lua `function(self, card, context)`.
- Everything static is already on the center from data.js (and `config.extra.ptype / item_req /
  evo_list` are filled in like `pokermon.load_pokemon`). Port only the functions. Shared bodies may
  be factored into local helpers (see `bulba_held`, `charm_calc` in pokejokers_01.js).
- A name with no definition is registered `unported: true` (inert, `in_pool` → false). Defining it
  is what makes it live — define **every** joker of your file, even ones with nothing but `loc_vars`.
- In-pool: Pokémon use `pokemon_in_pool` automatically (one per family, no duplicates,
  enhancement_gate). Don't re-implement it.
- Jokers the Lua writes but never returns from its file (Jirachi copy/negging, Hisuian
  Qwilfish/Overqwil — plan "intended-design fixes") are not in data.js: define them **in full**
  (static fields + functions; `stage` and `rarity` are required) and index.js registers them.

## SMODS → Micatro idioms

| Lua (Pokermon / SMODS) | Micatro port |
|---|---|
| `G.C.MULT`, `G.C.XMULT`, `G.C.CHIPS`, `G.C.MONEY`, `G.C.RED`... | strings `'MULT'`, `'XMULT'`, `'CHIPS'`, `'MONEY'`, `'RED'`, `'GREEN'`, `'FILTER'`, `'PURPLE'` |
| `G.ARGS.LOC_COLOURS.pink / item / metal / fire ...` | `'pink'`, `'item'`, `'metal'`, `'fire'` (renderer maps; hexes in `TYPE_COLOURS`) |
| `next(SMODS.find_card('j_poke_x'))` | `any(find_card('j_poke_x'))` — by **center key**, jokers + consumables |
| `next(find_joker('name'))` / `#find_joker(...)` | `find_joker('name').length` — by **ability name** (Pokémon names are lowercase) |
| `SMODS.has_enhancement(c, 'm_glass')` | `has_enhancement(c, 'm_glass')` |
| `SMODS.has_no_rank / has_no_suit / has_any_suit` | `has_no_rank(c)` / `has_no_suit(c)` / `has_any_suit(c)` |
| `SMODS.in_scoring(c, scoring_hand)` | `scoring_hand.includes(c)` |
| `SMODS.pseudorandom_probability(card, seed, n, d)` | `pseudorandom_probability(card, seed, n, d)` |
| `SMODS.get_probability_vars(card, n, d)` | `const [num, dem] = get_probability_vars(card, n, d)` |
| `SMODS.create_card{...}` / `SMODS.add_card{...}` | `smods_create_card({...})` / `add_card({...})` |
| `SMODS.change_base(c, suit, rank)` | `change_base(c, suit, rank)` |
| `SMODS.Ranks[r].next / .prev`, rank ids | `rank_next(r)` / `rank_prev(r)` (arrays), `RANKS`, `RANK_ID` |
| `SMODS.calculate_context({...})` | `calculate_context({...})` (mod cards + mods' `calculate` hook) |
| `SMODS.change_booster_limit(n)` | `change_booster_limit(n)` |
| `pseudorandom_element(t, seed)` | `pseudorandom_element(t, seed)[0]` (returns `[value, key]`) |
| `math.random(...)` | `math_random(...)` (never `Math.random`) |
| `G.E_MANAGER:add_event(Event({trigger='after', delay=…, func=function() … return true end}))` | `G.E_MANAGER.add_event(() => { … })` — keep it an event if it changes state |
| `delay(x)`, `juice_flip(...)`, `card:juice_up()`, sounds | keep the calls (no-ops / UI events) |
| `card.REMOVED`, `card.getting_sliced` | `card.removed`, `card.getting_sliced` |
| `localize('poke_...')`, `localize{type='variable', key='a_mult', vars={x}}` | same — Pokermon's loc is merged (MOD_LOC fallback) |
| `localize(rank, 'ranks')` | `localize(rank, 'ranks')` (returns the rank) |
| `pokermon_config.x` | `cfg('x')` (per-run mod option) |
| `info_queue[#info_queue+1] = G.P_CENTERS.c_poke_moonstone` | `info_queue.push(P_CENTERS.c_poke_moonstone)` |
| `if pokermon_config.detailed_tooltips then` | `if (detailed())` |
| `G.jokers.highlighted` (items/energy "selected joker") | same — set by the `use` action's `joker_targets` |
| `G.scry_view` | `G.scry_view` (cards = the real top-of-deck cards; see systems/scry.js) |
| `SMODS.scale_card(card, {ref_value, scalar_value, operation, message_key, message_colour, ...})` | `scale_card(card, {...})` -> `[new value, change]` (Lua's first return is `[0]`); `G.C.MULT` -> `'MULT'` |
| `SMODS.reset_card(card, {ref_value, reset_value, ...})` | `reset_card(card, {...})` |
| `SMODS.poll_object{type, attributes, union, rarity, filter, key_append, ...}` | `poll_object({...})` (same args; returns the key) |
| `SMODS.add_card{set = 'Joker', attributes = {'stage_basic'}, rarity = false}` | `add_card({...})` / `smods_create_card({...})` (`attributes` + no key -> `poll_object`) |
| `SMODS.get_attribute_pool(a)`, `SMODS.has_attribute(obj, a)`, `card:has_attribute(a)`, `SMODS.add_attribute` | `get_attribute_pool(a)`, `has_attribute(center, a)`, `card_has_attribute(card, a)`, `add_attribute` |
| `attributes = {"mult", "round_evo"}` on a joker | the same field (an array) on the definition / data item; `<type>_type`, `stage_<stage>`, `pokemon` are added for you |
| set `'poke_energy'` / `'poke_item'` (3.9.1 names) | either name works: `create_card('poke_item', ...)`, `P_CENTER_POOLS.poke_item`; compare sets with `is_set(card, 'poke_item')`, not `===` |
| the globals `mult` / `hand_chips` in a `context.modify_hand` handler | `context.mult` / `context.hand_chips` (read back after the handlers) |
| `SMODS.calculate_effect(effect, card)` | `calculate_effect(effect, card)` |

### Contexts

Micatro fires the vanilla contexts plus these Steamodded ones (mod cards only where marked *):

| context | when | notes |
|---|---|---|
| `joker_main` (`cardarea = G.jokers`, `scoring_hand`, `poker_hands`, `scoring_name`) | scoring | return `mult_mod / chip_mod / Xmult_mod` (or short `mult / chips / xmult`) + `message`, `colour`; `extra = {message, func}` and `func` run; `dollars` pays |
| `before` / `after` (cardarea G.jokers) | around scoring | `level_up = true` levels the hand; `dollars` / `extra` / `func` honoured for mod jokers |
| `individual` + `cardarea = G.play` | per scoring card | `chips`, `mult`, `x_mult` (or `xmult`/`Xmult`), `dollars`, `extra`, `message` |
| `individual` + `cardarea = G.hand` (not `end_of_round`) | per held card | `h_mult`, `h_chips`, `x_mult`, `dollars`, `message` |
| `individual` + `cardarea = G.scry_view` | per scry card | `chips`/`chip_mod`/`h_chips`, `mult`/`mult_mod`, `x_mult`/`Xmult_mod`, `dollars`, `message`, `message_card` |
| `repetition` + `cardarea = G.play / G.hand / G.scry_view` | per card | `{repetitions, message, card}` |
| `end_of_round` (+ `game_over`, `main_eval`, `beat_boss`) | round won | evolutions happen here (`level_evo` etc.); `saved` (Mr. Bones style, sets `G.GAME.saved_by`) |
| `end_of_round` + `individual` + `cardarea = G.hand` | per held card | |
| `setting_blind`, `first_hand_drawn`, `pre_discard`, `discard` (+`other_card`), `remove_playing_cards` (+`removed`), `using_consumeable` (+`consumeable`), `selling_self`, `selling_card`, `buying_card`, `open_booster`, `skipping_booster`, `skip_blind`, `reroll_shop`, `ending_shop`, `playing_card_added` (+`cards`), `other_joker`, `debuffed_hand` | vanilla | |
| `destroying_card` / `destroy_card`* (`cardarea = G.play`) | after scoring | return `true` or `{remove: true}` to destroy (scoring cards) |
| `post_discard`* | after a discard (not hooks) | |
| `hand_drawn`* (array of drawn cards) | after each draw while facing a blind | `poke_draw_one()` re-fires it |
| `poke_evolved`* (+`card`, `from`, `to`) | after a non-mega evolution | for add-ons (Nacho) |

**Steamodded contexts added for 3.9.1** (batch 4, `js/engine/smods.js`). They reach only mods that opt in with
`registerMod({smods_seams: true})` — Pokermon does — and only the objects whose `calculate` reads them
(`context.<name>`; or list them in `smods_contexts: [...]` / `'*'` on the definition, e.g. for a helper that reads
the context). Answers merge like Steamodded's flags (last one wins) and feed the next listener's context.

| context | when | answer |
|---|---|---|
| `setting_ability` (+`old`, `new` center keys, `other_card`, `unchanged`) | a card's set_ability (not initial; not in the shop / a booster unless a consumable is being used) | — |
| `money_altered` (+`amount`, `initial`, `from_shop`, `from_consumeable`, `from_scoring`, `from_cashout`) | every ease_dollars | — |
| `modify_ante` (= the step, +`ante_end`) then `ante_change` (= the step, +`ante_end`) | every ease_ante; `ante_end` when the boss was beaten | `{modify = n}` changes the step |
| `drawing_cards` (+`amount`) | before a draw to hand (after The Serpent) | `{cards_to_draw = n}` / `{modify = n}` |
| `debuff_card` (= the card; `ignore_debuff`) | Blind:debuff_card | `{debuff = true}` / `{prevent_debuff = true}` |
| `debuff_hand` (+`full_hand`, `scoring_hand`, `poker_hands`, `scoring_name`, `check`) | Blind:debuff_hand, after the blind | `{debuff = true, debuff_text}` / `{prevent_debuff = true}` |
| `modify_scoring_hand` (+`other_card`, `full_hand`, `scoring_hand`, `in_scoring`) | per played card, before scoring (and in debuff_hand) | `{add_to_hand = true}` / `{remove_from_hand = true}` |
| `stay_flipped` (+`to_area`, `from_area`, `other_card`) | every draw_card (Blind:stay_flipped) | `{stay_flipped}` / `{prevent_stay_flipped}` / `{modify = {to_area}}` (the card goes there instead) |
| `modify_hand` (+`poker_hands`, `scoring_name`, `scoring_hand`, `full_hand`, `mult`, `hand_chips`) | after the blind's modify_hand | change `context.mult` / `context.hand_chips` |
| `modify_booster_card` (+`booster`, `card`, `index`) / `create_booster_card` (+`booster`, `index`) | each card of an opened pack | create: `{booster_create_flags = {set, key, ...}}` |
| `ending_booster` (+`booster` = the pack's center) | a pack closes (picked out or skipped) | — |
| `modify_final_cashout` (+`amount`) | the cash-out total | `{modify = n}`: +n, on its own row |
| `poker_hand_changed` (+`card` = the source, `scoring_name`, `old_level`/`new_level`, `old_parameters`/`new_parameters`) | every level_up_hand | `{level_up = true, level_up_hand}` |
| `playing_card_end_of_round` (a flag on the held-card end_of_round pass) | end of round, held cards' mod enhancement / seal | — |
| `scaling_card` / `resetting_card` (the scale_card / reset_card args) | SMODS.scale_card / reset_card | `{override_value}`, `{override_scalar}`, `{override_message}`, `{post}` |
| `modify_weights` (+`pool`, `pool_types`, `args`) | every SMODS.poll_object | set `context.pool[key].weight` (0 = never) |
| `create_shop_card` / `modify_shop_card` | the object_weights shop roll | `{shop_create_flags = {...}}` |

**Blind:calculate**: a mod blind's `calculate(self, blind, context)` (SMODS.Blind) runs for setting_blind,
first_hand_drawn, press_play (and every `calculate_context` context), before, pre_discard, end_of_round (main) and the
contexts above — even while disabled, like Steamodded (the blind checks `blind.disabled`). Not yet for the per-card
scoring contexts (individual / repetition): add them when a blind needs them.

Not available yet (add a **generic** engine seam + registry HOOKS entry when a joker needs one, and
list it in your report): `mod_probability` /
`fix_probability`, `main_scoring`, `final_scoring_step` for jokers, `post_trigger`,
`other_consumeable`, `round_eval`, `other_drawn` outside poke_draw_one,
`poke_load` (resume is a replay — no load hook needed), sprite/UI functions (`set_sprites`, `generate_ui`, `draw`: UI's job;
expose data through `systems/anim.js` instead).

`check_enhancement` (Steamodded quantum enhancements) IS available: answer it from `calculate` with
`{m_steel: true}` and put `quantum_enhancements: true` on the definition (core.js only asks centers that
declare it). (3.2.1 Xatu's all-planets Celestial packs used the engine's `pack_card` hook; 3.9.1 dropped that, so
Pokermon no longer registers it.) The previous-evolution win stickers are the `joker_win_keys` hook (systems/evolution.js family_win_keys).

### `card.ability`

- `card.ability.extra` is a deep copy of `center.config.extra` (Lua `self.config.extra`); with mods on,
  every other `config` key is copied onto `card.ability` too (SMODS).
- Ability fields persist through `set_ability` (evolution): Tera stickers (`<type>_sticker`),
  `money_frac`, `fainted`, perishable/eternal/rental, `extra_value`.
- Lua truthiness: `if card.ability.extra.rounds then` → `!== undefined`; a field that may be `0`
  is truthy in Lua.

### Per-round globals (reset each round by `reset_game_globals`)

`G.GAME.current_round.bulb1card {rank, id}`, `espeon_rank / espeon_id / espeon_suit`,
`gligar_suit`, `sneaselcard {rank, id}`. `G.GAME.poke_poli_suit` is not per-round: 3.9.1 cycles it after every scored hand
(`poke_change_poli_suit()` from the mod-level calculate, systems/rules.js).

## Systems you call

- **Types**: `type_tooltip(self, info_queue, card)` first in every `loc_vars`; `get_type`, `is_type`,
  `has_type`, `type_sticker_applied`, `apply_type_sticker(card, type?)`, `find_pokemon_type`,
  `find_other_poke_or_energy_type(card, type, count_self)`.
- **Evolution** (return the result: `return level_evo(self, card, context, 'j_poke_x')`):
  `level_evo` (rounds countdown), `scaling_evo(self, card, context, key, current, target, msg?)`,
  `item_evo` (Thunder Stone etc. set `extra.evolve`), `type_evo(..., 'water')`,
  `deck_suit_evo(..., suit, pct)`, `deck_enhance_evo(..., 'Glass', pct, flat)`,
  `deck_seal_evo(..., seal, pct, flat)`; all return `{message: undefined}` when they evolve
  (the Lua `{message = poke_evolve(...)}`), else `undefined`. `poke_evolve(card, key, immediate?, msg?)`,
  `can_evolve`, `get_previous_evo`, `get_highest_evo`, `get_family_keys`. Everstone (`find_joker('everstone')`)
  blocks all but the level countdown. Scaled values (mult/chips/Xmult/money with a `_mod`, or
  `copy_scaled`) and the keep-list carry over; `poke_custom_values_to_keep` on the center adds more.
- **Energy**: `energize`, `increment_energy`, `energy_increase(card, type)`, `can_increase_energy`,
  `get_total_energy`, `energy_matches`, `matching_energy(card)`, `ease_poke_dollars(card, seed, amt, calc_only)`
  (use it for every Pokémon payout — it adds the energy money fractions).
- **Items / megas**: `evo_item_use_total`, `highlighted_evo_item`, `is_evo_item_for`,
  `generate_pickup_item_key(seed)`, `create_holding_item(key, edition, has_evolved)`,
  `poke_create_treasure(card, seed, megastone)`, `getMega_by_position`.
- **Pools**: `get_random_poke_key(seed, stage, rarity, area, ptype, exclude)`, `create_random_poke_joker`,
  `pokemon_in_pool`, `evo_item_in_pool`.
- **Rules**: `faint_baby_poke(self, card, context)` (Baby Pokémon), `volatile_active(self, card, 'left'|'right')`.
- **Utils**: `poke_add_card`, `poke_remove_card`, `poke_vary_rank`, `poke_convert_cards_to`,
  `poke_get_adjacent_jokers`, `poke_drain`, `poke_total_chips`, `poke_next_highest_rank`, `poke_lowest_rank`,
  `pseudorandom_multi`, `poke_same_suit`, `poke_suit_check`, `poke_is_even/odd`, `poke_get_rank`,
  `poke_add_hazards`, `poke_set_hazards`, `set_spoon_item`, `poke_unhighlight_cards`, `poke_draw_one`, `remove`.

Faithfulness: port the Lua as written (numbers, order, RNG seeds, quirks). Only fix what the plan
lists under "intended-design fixes" or an outright display bug, and note every deviation in a
comment (`// Intended-design fix: ...`).

## Tests (one per file)

`micatro/tests/mods/pokejokers_NN_test.mjs`, plain node, copied from `pokejokers_01_test.mjs`:

```js
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
const { ok, done } = T();
start('SEED');                         // Pokermon run, blind selected, empty hand, harmless boss
const j = add('j_poke_x');             // joker in the row (add_to_deck applied)
const r = play(hand(['S_A', 'H_A']));  // r.total = {chips, mult, total}; never wins by accident
winRound(); nextRound();               // end_of_round (evolutions), then the next blind
done();
```

Fire **every** joker of the file through real plays (`act`) and every evolution it has; assert
exact numbers. Run: `node micatro/tests/mods/pokejokers_NN_test.mjs`, then
`node overworld/tests/micatro_engine_test.mjs` (all engine + mod suites + a Pokermon fuzz).

## Art

The art is Pokermon's own (gitignored `assets/2x`, deployed to the magepunk-micatromods Pages project with
`npm run deploy-micatro-mods`). No card is left on a placeholder sheet (`micatro/tests/mods/no_placeholder_art_test.mjs`).
Cards Pokermon 3.2.1 shipped on `placeholder_*` and where their art comes from:

- **Rotom Dex** (`j_poke_rotomdex`): Pokermon 3.9.1, `assets/2x/Basic Series/AtlasJokersBasicOthers.png` cell {0,4}
  (artists InertSteak, Catzzadilla), saved unchanged as `Basic Series/AtlasJokersBasicOthers-391.png` (atlas `AtlasJokersBasicOthers391`).
- **Stadium Deck / Mega Deck** and **Stadium Sleeve / Mega Sleeve**: Pokermon 3.9.1, `assets/2x/Basic Series/AtlasDecksBasic.png`
  cells {8,0} {9,0} / {8,1} {9,1}, saved unchanged as `Basic Series/AtlasDecksBasic-391.png` (atlas `AtlasDecksBasic391`).
- **The Jirachi wish cards** (`c_poke_fake_banker` / `_booster` / `_power` / `_negging` / `_copy` / `_fixer`): already shipped in 3.2.1:
  martz.lua names `AtlasJokersSeriesAGen03` (Series A, artist PrincessRoxie), which the port hadn't registered.

Source: https://github.com/InertSteak/Pokermon (tag 3.9.1); the files' git blob SHAs match the tag's.
Micatro-made art (not Pokermon's): `hisuian_qwilfish.png` / `hisuian_qwilfishShiny.png`, retired in new-jokers sub-batch 15 (3.9.1 ships the
card: see that section).
Since batch 5 Pokermon's own cards draw from the 3.9.1 sheets (`<name>-391.png`): see "3.9.1 art (batch 5)" below.

## Status

**Complete (2026-10-15)** — every Pokermon 3.2.1 content file is ported and tested:
all 37 joker files (452 jokers + the 4 written-but-unregistered ones: jirachi_copy, jirachi_negging,
hisuian_qwilfish, overqwil), all 66 consumables (mart1/2/3, martz, berry juices, Rotom machines),
10 boosters, 4 vouchers, 10 decks, 6 tags, the showdown boss, 2 enhancements, 2 seals, 12 type
stickers and the shiny edition. One test file per source file in `micatro/tests/mods/`.

Not yet: challenges, sleeves, deck skins (plan step 8), and `emergy` (Cryptid-only in the Lua).
Intended-design fixes are noted in comments at each site (search "intended").

## Pokermon 3.9.1 upgrade (plan: Plans/MICATRO_MODS_UPGRADES.md §2.1, §3)

Upstream: InertSteak/Pokermon tag **3.9.1** (2026-09-18; needs Steamodded >= 26.829.0). The port is 3.2.1 (really commit
87fb499, 2025-11-01) moving to 3.9.1 batch by batch: pinned `3.2.1+r1` until batch 5, `3.9.1+r2` for batch 5, `3.9.1+r3` for batch 6, `3.9.1+r4` for batch 7, `3.9.1+r5` for batch 8, `3.9.1+r6` for batch 10, `3.9.1+r7` for batch 10b, `3.9.1+r8` … `3.9.1+r13` for new-jokers sub-batches 11–15b, `3.9.1+r14` for batch 16 (the Megas), `3.9.1+r15` for batch 17 (the last: the
upgrade is complete, see "Pokermon 3.9.1 upgrade: complete"), `3.9.1+r16` / `3.9.1+r17` for the seals fix / the leftovers batch ("The 3.9.1 leftovers" below), `3.9.1+r18` for the Hazard
follow-ups ("The Hazard audit" below: held-Hazard retriggers), **`3.9.1+r19`** since the owner's 25 new jokers ("The owner's 25 new jokers" below), `3.9.1+r20` for the owner's
Sprigatito line ("The owner's Sprigatito line" below), `3.9.1+r21` for the owner's Whismur line ("The owner's Whismur line" below), `3.9.1+r22`
for the owner's Type Sleeves, `3.9.1+r23` for the owner's Sprigatito rework ("The Sprigatito rework" below), `3.9.1+r24` for the owner's
Gulpin line ("The owner's Gulpin line" below), `3.9.1+r25` for the owner's Trapinch line ("The owner's Trapinch line" below), `3.9.1+r26` for the owner's Spoink line ("The owner's Spoink
line" below), `3.9.1+r27` for the owner's Castform ("The owner's Castform" below), `3.9.1+r28` for the owner's Barboach line ("The owner's
Barboach line" below), `3.9.1+r29` for the owner's Lunatone + Solrock ("The owner's Lunatone + Solrock" below), `3.9.1+r30` for the owner's types following their card art ("Types from the card art" below), `3.9.1+r31` for the owner's Regi trio ("The owner's Regi trio" below), `3.9.1+r32` for the owner's Starly line ("The owner's Starly line" below), `3.9.1+r33` for the owner's Gen 3 Legendaries ("The owner's Gen 3 Legendaries" below), `3.9.1+r34` for the owner's Chatot + Pachirisu ("The owner's Chatot + Pachirisu" below), `3.9.1+r35` for the owner's Glameow line ("The owner's Glameow line" below), `3.9.1+r36` for the owner's Drifloon line ("The owner's Drifloon line" below), `3.9.1+r37` for the owner's Burmy line ("The owner's Burmy line" below), `3.9.1+r38` for the owner's Combee line ("The owner's Combee line" below), `3.9.1+r39` for the owner's Cherubi line ("The owner's Cherubi line" below), `3.9.1+r40` for the owner's Shellos line ("The owner's Shellos line" below), `3.9.1+r41` for the owner's Burmy three-pile cloak ruling ("The owner's Burmy line" below), `3.9.1+r42` for the owner's Stunky line ("The owner's Stunky line" below), `3.9.1+r43` for the owner's Gible line ("The owner's Gible line" below), `3.9.1+r44` for the owner's last Gen 4 regulars ("The owner's last Gen 4 regulars" below), `3.9.1+r45` for the owner's creation trio, Regigigas and Arceus ("The owner's creation trio, Regigigas and Arceus" below), `3.9.1+r46` for the owner's Lake trio, Cresselia, Manaphy and Phione ("The owner's Lake trio, Cresselia, Manaphy and Phione" below), `3.9.1+r47` for the owner's Regigigas trio wake ("The owner's creation trio, Regigigas and Arceus" below: the full trio wakes it after 1 round), `3.9.1+r48` for the Gen 7 starters ("The Gen 7 starters" below), `3.9.1+r49` for the Gen 8 starters, the Scorbunny and Sobble lines ("The Gen 8 starters" below), `3.9.1+r50` for the Gen 5 starters ("The Gen 5 starters" below), `3.9.1+r51` for the owner's Gen 9 starters ("The owner's Gen 9 starters" below), **`3.9.1+r52` for the Gen 6 starters ("The Gen 6 starters" below), `3.9.1+r53` for Gen 5 batch 1 ("Gen 5, batch 1" below), `3.9.1+r54` for Gen 5 batch 2 ("Gen 5, batch 2" below), **`3.9.1+r55`** since Gen 5 batch 4, the Gen 5 Legendaries ("Gen 5, batch 4" below)
(Plans/MICATRO_MODS_PLAN.md §9).

| batch | what | status |
|---|---|---|
| 0 | mod-version pin + key aliases | done (merged) |
| 1 | placeholder art from 3.9.1 sheets | done (see Art) |
| **4** | **engine seams** (below) | **done 2026-10-19** — no behaviour change, `contentRev` stays 1 |
| **5** | **data re-extract** (rarities, costs, configs, gates, `attributes`, cgoose -> iridescent_hacker), 39 changed + 21 new atlases (below) | **done 2026-10-19** — `3.9.1+r2` |
| **6** | **joker reworks, pokejokers_01–08** (Gen 1 + Gen 2: 255 jokers on 3.9.1, 8 held; below) | **done 2026-10-19** — `3.9.1+r3` |
| **7** | **joker reworks, pokejokers_09–17** (Gen 3 + Gen 4: 97 jokers on 3.9.1, none held; below) | **done 2026-10-19** — `3.9.1+r4` |
| **8** | **joker reworks, pokejokers_18–34 + zotherjokers / zmissingno** (Gen 5–9 and the non-Pokédex jokers: 83 on 3.9.1, 10 held; below) | **done 2026-10-19** — `3.9.1+r5` |
| **10** | **the Hazard layer, Seed / Miracle Seed / Heavy-Duty Boots, Flower X2, the Debris deck + sleeve; 16 jokers off hold** (below) | **done 2026-10-20** — `3.9.1+r6` |
| **10b** | **the Unown rework (Unown, Unown Swarm, Ruins of Alph's Unown, 3.9.1 Unown art, tiled swarm strips) + the Wish Pack (3 unused wishes, change_form)** (below) | **done 2026-10-20** — `3.9.1+r7` |
| **11** | **new jokers, sub-batch 11: the 26 of 3.9.1's pokejokers_09 / 10 (Wurmple, Seedot, Taillow, Wingull, Ralts, Surskit, Slakoth, Nincada, Makuhita lines, Skitty)** (below) | **done 2026-10-20** — `3.9.1+r8` |
| 12–15b | new jokers (sub-batches 12–15, 15b; below) | **done 2026-10-20** — `3.9.1+r9` … `3.9.1+r13` |
| **16** | **the Megas: 11 new Megas, the Mega Stone's 3.9.1 rules (`unique_val`), the Mega Berry Juice, the Mega Deck / Sleeve (below)** | **done 2026-10-20** — `3.9.1+r14` |
| **17** | **the non-Pokédex jokers (Rival chain, Oologist, Imposter Professor + Starter Pack...?), April Fools (option-gated), the 5 boss blinds + 3.9.1's Iridescent Hacker, the Elite stake, the 12 challenges, the Obituary / Revenant sleeve alts (Pink Seal 1 in 3), object_weights (below)** | **done 2026-10-20** — `3.9.1+r15`; **upgrade complete** |
| **leftovers** | **the Pocket Packs' 3.9.1 contents, the Debris Sleeve's alt (a playing-card `card_limit` engine seam), the Series A art option (cosmetic)** ("The 3.9.1 leftovers" below) | **done 2026-10-21** — `3.9.1+r16` |

### Steamodded seams for 3.9.1 (batch 4)
Engine: `js/engine/smods.js` (ported from Steamodded/smods 5b8a087, 26.1018.0~dev-b), wired into core.js / run.js /
blind.js / consumables.js; registry: `ATTRIBUTES`, `SET_ALIASES` / `resolve_set` / `is_set`, `registryVersion`.
Pokermon: `smods_seams: true`, `set_aliases`, `attributes` (systems/attributes.js), api.js exports. Tests:
`micatro/tests/mods/smods_seams_test.mjs` (synthetic mods fire each seam through the real engine flow).

- **SMODS.scale_card / reset_card** (smods src/utils.lua): the scaling_card / resetting_card contexts, the operation
  (`+` / `X` / `-` / a function), the message (default "Upgrade!" / "Reset"), `post` effects. 116 calls in 3.9.1.
- **Attributes** (src/game_objects/attributes.lua; Pokermon functions/pokeconstants.lua + apifunctions.lua):
  Steamodded's 80 built-in attributes are vendored (`js/engine/smods_attributes.js`, generated by
  `tools/micatro/gen_smods_attributes.cjs`); mods add theirs with `content.attributes`; objects declare theirs with
  `attributes: [...]`. Every Pokémon center now carries `<type>_type`, `stage_<stage>`, `pokemon` (load_pokemon).
  Pools hold this run's objects only. 3.9.1's `chance_mod` (on one joker) is registered nowhere upstream either: ignored.
- **SMODS.poll_object** (src/utils/weights.lua): pools by type / attributes (intersection, or `union`) / an explicit
  pool, rarity poll for attribute pools, `filter`, object weights (`weight`, `get_weight(self, w, args)`, boosters
  x10, the vanilla editions' Steamodded weights), `modify_weights`, the base-rate chance (Seal 2%, Edition 4%, Enhanced
  40%). One deviation: a pool whose every entry is UNAVAILABLE returns undefined after 1000 tries (Lua spins forever).
- **object_weights optional feature** (lovely/weights.toml + overrides): with an active mod's
  `optional_features: {object_weights: true}`, create_card's key, poll_edition, get_next_tag_key, get_pack,
  get_new_boss, get_next_voucher_key and the shop roll (`SMODS.create_shop_card` + `poll_object_type`) go through
  poll_object. **Pokermon 3.9.1 turns this on** (pokermon.lua line 9): doing so is a behaviour change for every
  Pokermon run (bump `contentRev`), so it is NOT on yet. `poll_seal_weighted` / `poll_enhancement_weighted` are the
  object_weights SMODS.poll_seal / poll_enhancement (our local copies in mart2.js / zberryjuice.js / pokejokers_03.js
  are the pre-weights ones).
- **New contexts** (src/overrides.lua, lovely/better_calc.toml, booster.toml, blind.toml, utils.lua): the table under
  Contexts above, plus Blind:calculate.
- **Set aliases** `poke_energy` -> `Energy`, `poke_item` -> `Item`: the old names stay canonical (no change to
  rate keys `energy_rate` / `item_rate`, loc sets, views or saves); 3.9.1 code and data using the new names work.
- Already there before batch 4: quantum enhancements (`check_enhancement`, Onix line), `joker_type_destroyed`,
  `press_play` for jokers, `SMODS.debuff_card`.

### 3.9.1 static data for the existing jokers (batch 5)
Pinned **`3.9.1+r2`** since this batch (`version: '3.9.1'`, `contentRev: 2`; `LEGACY_MOD_VERSIONS` untouched, so a run or
replay from before reads as `3.2.1+r1`: the resume prompt / the replay banner). The content is still the 3.2.1 port:
`data.js` (3.2.1) is untouched, and `data391.js` is an overlay on it that `index.js` applies before building the centers
(data.js item -> data391 changes -> the definition's own static fields).

- **How it's made** (never hand-edit `data391.js`):
  1. `NODE_PATH=<fengari> node tools/micatro/extract_mod_data.cjs <Pokermon 3.9.1> <tmp>/pokermon391.js tools/micatro/specs/pokermon_391.json`
     (the same extractor as data.js; the spec's new `prelude` stubs 3.9.1's `pokermon.*` namespaces; 0 errors)
  2. `node tools/micatro/gen_pokermon_391_overlay.mjs <tmp>/pokermon391.js` -> `data391.js`. The decisions are in
     `tools/micatro/specs/pokermon_391_overlay.json`: `take_always` (fields taken for every joker), `take` (per-joker config
     paths / flags), `reasons` (why the rest waits), `sprite_hold`. The generator fails on any value change of a config key
     both versions have, or any blueprint_compat flip, that has no decision.
- **Taken** (for the 452 data.js jokers; counts in `data391.js` `counts`):
  - rarities: **41** (mostly to Safari: Raticate, Fearow, Sandslash, Nidorina/o, Golduck, Primeape, Poliwhirl, Kadabra, Machoke,
    Graveler, Rapidash, Muk, Electrode, Weezing, Seadra, Noctowl, Ledian, Ariados, Skiploom, Forretress, Granbull, Houndoom,
    Lairon, Boldore, Gothorita, Charjabug, Spidops, Dachsbun; and Golbat / Lucario Safari -> Rare, Meowth / Farfetch'd /
    Koffing / Rhyhorn / Tangela / Numel -> Common, Ditto -> Rare, Horsea / Charcadet / Rotom Dex -> Uncommon);
  - costs: **7** (Fearow 6, Sandshrew 4, Horsea 6, Houndour 4, Houndoom 7, Dachsbun 7, Rival 5);
  - enhancement gates: **7** (Vaporeon Bonus, Jolteon Gold, Flareon Mult, Leafeon Lucky, Glaceon Glass, Probopass Stone,
    Gholdengo Gold) — pool only (pools.js pokemon_in_pool);
  - Perishable / Eternal eligibility: 49 perishable_compat, 1 eternal_compat (Mega Gengar);
  - the Steamodded `attributes` 3.9.1 jokers declare (inert: nothing in the port draws from attribute pools yet);
  - config numbers: **9**, the ones whose 3.9.1 calculate is a refactor of the 3.2.1 one (same meaning): Voltorb Xmult 2 -> 1.75,
    Electrode Xmult 2.5 -> 2.25, Primeape evo_rqmt 25 -> 29, Ursaring mult_mod 3 -> 2, Larvitar chip_mod 8 -> 10, Pupitar
    chip_mod 12 -> 15, Kricketot money 5 -> 4, Grubbin rounds 3 -> 4, Charjabug mult 9 -> 7;
  - blueprint_compat: **4** (Mega Pidgeot on; Pokédex, Professor, Treasure Eatery off — 3.9.1 added the matching guard).
- **The renamed boss**: 3.9.1's `bl_poke_iridescent_hacker` ("Iridescent Hacker", colour #505860, AtlasBossblinds {0,25}) is
  registered with OUR Chartreuse Chamber behaviour (`blinds/pokebossblind.js`, kept fix: per-fight state); `bl_poke_cgoose` is
  no longer registered and resolves through `js/mods/aliases.js` (the seeded rename is now active: recipes, stickers, decks).
  Nacho's Turtonator boss-trigger check (calc_boss_trigger) knows the new key. 3.9.1's own rewrite (debuff_card context, pick_random_types) is for the
  blinds batch.
- **Kept** (re-checked against the overlay): Deino / Zweilous "contains a Three of a Kind"; leftmost-valid Transformation and
  Berry Juice Energy; every "intended-design" fix (the overlay touches no behaviour). The 3.2.1 loc text stays (189 3.9.1 text
  changes belong to the reworks); only the renamed boss takes its 3.9.1 name.
- **Not taken, by design**
  - Hazard card chance 1 in 6 -> 1 in 3 (enhancement1.lua `dem`): tuned for 3.6.0's Hazard layer (up to 3 hazards dealt into
    the hand per round by `poke_hazard_level`); on 3.2.1's 1-per-4-cards deck hazards it would be a different card. Batch 10.
  - Wish Pack 6 -> 3 offers (packs1.lua `extra`): part of the Jirachi / wish rework (3 random unused wishes; ours shows the 6
    fixed wishes). Jirachi rework batch.
  - Pink Seal "1 in 3": it is a new challenge modifier (`poke_pink_seal_selfdestruct`: the seal may fall off), not a change to the
    seal. Challenges batch (17).
  - object_weights (3.9.1 `optional_features.object_weights`, "Soul items use object weights"): not self-contained — it needs
    the 3.9.1 per-item `weight`s (Great Ball 3, Leftovers 3, ...), the hidden-item weight path replacing `soul_rate`,
    `pokermon.modify_pool` and the Safari / Mega `get_weight`s, and it re-rolls every shop and pack of every Pokermon run (also
    with other mods on). Later, with the items batch.
- **Skipped static data** (each 3.9.1 change to an existing joker that is not taken, with the reason; generated from
  `data391.js` `skipped`; as of batch 8, which took everything for pokejokers_01-34, zotherjokers and zmissingno but its
  holds). The holds wait for batch 10 (the Hazard layer):

  - **mega_steelix** — rework: Stone cards held instead of Diamonds $ (held: quantum Hazard, batch 10) (pokejokers_07): blueprint_compat true → false; money 1 → -; stone_held - → 4; suit Diamonds → -
  - **qwilfish** — Hazard layer rework (batch 10): hazard_level replaces the per-joker hazard ratio (pokejokers_08): chip_mod 25 → 15; hazard_level - → 1; hazards 4 → -
  - **skarmory** — Hazard layer rework (batch 10), Mega Skarmory (pokejokers_08): Xmult_mod 0.5 → 0.4; hazard_level - → 1; hazard_max - → 1; hazards 4 → -
  - **roggenrola** — Hazard layer rework (batch 10) (pokejokers_18): evo_rqmt 25 → 10; hazard_level - → 1; hazards 4 → -; mult_mod 4 → 5
  - **boldore** — Hazard layer rework (batch 10) (pokejokers_18): hazard_level - → 1; hazards 4 → -; mult_mod 8 → 10
  - **gigalith** — Hazard layer rework (batch 10) (pokejokers_18): hazard_level - → 1; hazards 4 → -; mult_mod 6 → 7
  - **golurk** — Hazard layer rework (batch 10) (pokejokers_21): Xmult_multi 1.4 → 1.3; hazard_level - → 1; hazards 4 → -
  - **tarountula** — Hazard layer rework (batch 10) (pokejokers_31): hazard_level - → 1; hazards 4 → -; rounds 3 → 4
  - **spidops** — rework: cards-added goal + Hazard layer (pokejokers_31): blueprint_compat true → false; card_goal - → 8; cards_added - → 0; h_max 8 → -; h_size 1 → 2; h_total 0 → -; hazard_level - → 1; hazards 4 → -

  - *new key: only the 3.9.1 logic reads it* (3): ferroseed (hazard_level); ferrothorn (hazard_level); golett (hazard_level)
  - *key dropped by 3.9.1: the ported 3.2.1 logic still reads it* (1): golett (hazards)
  - *format only (a string id became a number): no change* (1): unown (targets)

### Joker reworks, pokejokers_01–08 (batch 6)
Pinned **`3.9.1+r3`** (`contentRev: 3`). Every existing joker of `pokemon/pokejokers_01.lua`–`08.lua` (263: Bulbasaur ->
Magby) is on its **3.9.1 behaviour** (jokers/pokejokers_01–08.js, ported from the 3.9.1 Lua against our 87fb499 baseline)
except the holds, and takes **all** its 3.9.1 static data.

- **How** (spec `tools/micatro/specs/pokermon_391_overlay.json`, regenerate `data391.js` as in batch 5):
  - `rework_files` names the reworked files. Each of their jokers takes its whole 3.9.1 config, every compat flag that changed, and
    its 3.9.1 Joker loc entry. In `data391.js` that is `config_all` plus `loc.Joker`, and `reworked` lists them. `take` / `reasons`
    no longer apply to them. `index.js` `with391` replaces data.js's config with `config_all`.
  - `rework_hold` keeps a joker of those files on 3.2.1 behaviour and data, with the reason.
  - `loc_extra` pulls other 3.9.1 loc entries the reworks show (`Other.bat_leech`, `dictionary.poke_leech_life_ex`).
  - Counts: 44 whole configs, 139 texts, 14 blueprint flags.
- **Holds (8)**:
  - Qwilfish and Skarmory: the Hazard layer, batch 10.
  - Unown: the Unown rework.
  - Mega Steelix: 3.9.1 makes Stone cards also Steel and **Hazard** (quantum). A quantum enhancement's own `calculate` (Hazard's
    end-of-round destroy) is never run; core.js scores only a quantum enhancement's config. That is a core-scoring change:
    batch 10.
  - Bellossom and the Hoppip line: their 3.9.1 text and logic need the Seed enhancement (`m_poke_seed`), batch 10.
- **Reworked** (behaviour, by file; the rest of each file changed only text / numbers, or nothing):
  - **01**
    - Spearow / Fearow: count cards drawn during Blinds (`hand_drawn`); every 30 arms a level-up of the next hand; Spearow evolves
      after 3 triggers; Fearow +1 discard; Blueprint copies.
    - Pikachu: +10 Mult at $25+, $2 at Blind select below $25.
    - Raichu: +4 Mult per $10, interest at Blind select; no Negative.
    - Sandshrew: no Glass restore; 4 rounds.
    - Sandslash: a discarded Enhanced card has a 1 in 3 chance to become Glass.
    - Mega Venusaur: no extra draw of its own.
  - **02**
    - Zubat: strips the first scoring Enhanced card, +2 Mult.
    - Golbat: +2 Mult per Enhancement eaten, evolves at 16.
    - Oddish / Gloom / Vileplume: three outcomes.
    - Parasect: its Mult floors at 0.
    - Golduck: $3 whenever a card becomes Gold (`setting_ability`).
    - Mankey / Primeape: renamed keys.
    - Arcanine: Blueprint converts no second card.
  - **03**
    - Poliwhirl / Poliwrath: the suit cycle moved out of the jokers; see Shared.
    - Victreebel: +24 chips; only the first 4 even cards of a round are retriggered.
    - Alakazam: its slot comes back at once.
    - Slowpoke: its Shell is couponed.
    - Shell: never in a pool.
    - Mega Slowbro: counts at `before`, resets on a beaten Boss.
    - Muk: `mult_mod` 2.
    - Farfetch'd, Hypno, Cubone: `create_consumeable`.
  - **04**
    - Onix: a destroyed non-Stone playing card adds a Stone card to the deck; Blueprint-compatible. Quantum Steel was already
      there; nothing new needed.
    - Koffing / Weezing: Volatile Left +12 / +18 Mult then faint; Koffing evolves in 2 rounds; no Boss-halving on sell.
    - Gastly / Haunter / Gengar: lick at cash-out.
    - Kangaskhan: no interest-cap drawback.
    - Mega Kangaskhan: Blueprint copies the retriggers, not the count.
    - Staryu: `dollar_buffer`.
  - **05**
    - Magmar: no once-per-round flag.
    - Lapras: the skip shop resets free rerolls.
    - Ditto: in the pool with Showman.
    - Eevee: +4 Mult per Joker that can still evolve.
    - Vaporeon: a scoring Bonus card gives every hand card +`chip_mod` permanent Chips.
    - Flareon: the last 2 scoring Mult cards X2.
    - Jolteon: a debuffed Gold card pays nothing.
    - Aerodactyl: resets to `Xmult1`.
    - Snorlax: counts Leftovers by key.
    - Mewtwo: skips a joker already being destroyed.
    - Jynx: its copies are announced as added cards.
    - Tauros (Herd): never in a pool.
  - **06**
    - Crobat: leeches each scoring Enhancement (the card becomes base): Bonus/Stone -> Chips, Steel/Glass/Flower -> XMult,
      Gold -> $, others -> Mult; "Leech!".
    - Natu / Xatu: a Planet levels its hand once more (`poker_hand_changed`).
    - Xatu: opening a Celestial Pack makes the last hand's Planet.
    - Sentret / Furret: text.
    - Mew and the baby Tarots: `add_card`.
  - **07**
    - Politoed: retriggers the first scoring card of the suit, `retriggers` + 1 per Water joker.
    - Espeon: +2 Foresight; X2.5 if the deck's top card is the round's suit.
    - Umbreon: a lone first discard is destroyed and levels the last played hand.
    - Slowking: resets to `Xmult_multi1`.
    - Steelix: a destroyed non-Stone card adds a Stone card; Stone cards are also Steel (quantum).
    - Yanma: renamed keys.
  - **08**
    - Slugma / Magcargo: count hands like Loyalty Card.
    - Corsola: at Blind select +1 Mult per Water joker, then a Basic Water joker.
    - Houndour / Houndoom / Mega Houndoom: +1 / +3 / +3 discard selection limit instead of extra discards.
    - Smeargle: `get_copy` sketches the Blueprint-compatible joker to its right at Blind select and copies it wherever it
      moves; Blueprint-compatible.
    - Tyrogue: copies at `before`; a first 5-card discard destroys one marked card.
    - Ursaring / Scizor / Kingdra: small fixes.
- **Shared changes**
  - **Poli suit**: 3.9.1 cycles `G.GAME.poke_poli_suit` after every scored hand in its mod-level calculate (`context.after`), with or
    without a Poli joker. Ours is in `systems/rules.js` `calculate`; the Poli jokers no longer cycle it.
    - This needed a **new engine seam**: `js/engine/smods.js` `mod_calculate(context, name)`, called by `run.js` after the
      jokers' `after`. SMODS hands `current_mod.calculate` every context; ours gave `hooks.calculate` only the SMODS-only
      contexts.
    - It reaches an opted-in (`smods_seams`) mod whose hook reads `.after` (`MOD_VANILLA_CONTEXTS = ['after']`).
    - Tested in `smods_seams_test.mjs` section 7.
  - **Xatu**: 3.9.1 removed the lovely patch that made Celestial packs hold every Planet, so `rules.pack_size`'s Xatu branch and the
    `pack_card` hook are gone.
  - **Smeargle** is no longer a Smeared Joker (`rules.js` aliases). Its family (`evolution.js`) includes its sketch via `get_copy`.
  - **Evolution**: `cards_drawn` is carried through an evolution (3.9.1 names_to_keep; Spearow -> Fearow). The 3.2.1 Spearow
    "15 scored arms Fearow" carry-over is gone.
  - **Pools**: 3.9.1's per-joker `in_pool = false` (Shell, Tauros Herd) is a `POKE_POOL_RULES` rule in the jokers file; `index.js`
    only takes a def's `in_pool` with `custom_pool_func`.
  - **Seam contexts now read by shipped content**: `setting_ability` (Golduck), `poker_hand_changed` (Natu / Xatu).
- **Kept** (house rules and fixes over upstream):
  - Arbok's +Mult popup text (the Lua printed a_chips).
  - Scyther's popup shows the new Mult total.
  - Zubat / Parasect show no "+0".
  - Every "intended-design" comment in 01–08.
  - The leftmost-valid Energy / Transformation rules and Deino / Zweilous "contains" live outside these files: untouched.
- **Deviations / later**
  - Gastly, Haunter and Gengar lick in `calc_dollar_bonus`, because there is no joker `round_eval` context. It is the same
    cash-out moment.
  - Eevee's "can still evolve" check draws no RNG (3.9.1's get_highest_evo rolls a branch).
  - Natu / Xatu's extra level is not copied by Blueprint, because Blueprint isn't routed through the seam contexts.
  - 3.9.1's `context.evolution` timing is not ported: evolutions stay at end of round (systems/evolution.js).
  - 3.9.1 renamed some cross-file state with a `poke_` prefix (`energy_plus`, `lapras_skip`, `scry_amount`); ours keeps the old
    names.
  - `knockoff_starter` is declared, but nothing reads it yet.
  - Shuckle's 3.9.1 Mega Stone -> `c_poke_berry_juice_mega` waits for that consumable.
  - 3.9.1 text colours `{C:poke_pink}`, `{X:poke_<type>}` render in the default colour, like 3.2.1's `{C:pink}` / `{X:<type>}` already
    did (ui/markup.js has no Pokermon type colours). `{C:poke_item}` / `{C:poke_energy}` resolve through the set alias.
- **Tests**:
  - `pokejokers_01`–`08_test.mjs` fire the reworks, marked "(Pokermon 3.9.1)".
  - `pokermon_391_reworks_a_test.mjs` covers the overlay sets, one or more fired reworks per file, the shared changes, the holds
    and the kept rules. It also checks that every reworked joker's loc_vars fills each `#n#` of its 3.9.1 text.
  - `smods_seams_test.mjs` section 7 covers the `after` seam.


### Joker reworks, pokejokers_09–17 (batch 7)
Pinned **`3.9.1+r4`** (`contentRev: 4`). Every existing joker of `pokemon/pokejokers_09.lua`–`17.lua` (97: Miltank -> Shaymin
Sky) is on its **3.9.1 behaviour** (jokers/pokejokers_09–17.js, ported from the 3.9.1 Lua against our 87fb499 baseline) and
takes **all** its 3.9.1 static data. **No joker of the range is held**: none needs the Hazard layer, the Seed card or a quantum
enhancement's own effects.

- **How**: as batch 6 — `rework_files` now lists 01–17 (spec `tools/micatro/specs/pokermon_391_overlay.json`), `data391.js`
  regenerated. Counts (01–17): 66 whole configs, 204 texts, 19 blueprint flags; 352 reworked jokers. The spec's stale `take` /
  `reasons` for the 09–17 jokers are gone; `loc_extra` adds `dictionary.poke_wish_ex` ("Wish!").
- **`rework_deferred`** (new spec key, copied to `data391.js`; inert): a reworked joker ported without one 3.9.1 part that belongs
  to other content not ported yet. The generator checks each name is a reworked 3.2.1 joker.
  - Lucario: 3.9.1's `megas = {mega_lucario}` — Mega Lucario is a new 3.9.1 joker (new-jokers batch).
  - Shaymin / Shaymin Sky: their 3.9.1 text says Flower cards give X3 "instead of X2". That X2 / X3 rule (and Roserade's 3-suit
    Flush) is in the Flower **enhancement**, which waits for batch 10 with the Seed card. Our Flower is X3 always, so with a
    Shaymin the effect is the same.
  - Jirachi: the 3.9.1 Wish Pack (3 random unused wishes) and `change_form` wishes wait for the boosters batch. The wish
    forms themselves are on 3.9.1.
  - Porygon-Z: 3.9.1 counts `G.GAME.consumeable_usage_total.poke_energy`; ours keeps `G.GAME.energies_used` (every Energy
    used), like batch 6 kept `energy_plus` / `scry_amount`.
- **Reworked** (behaviour, by file; the rest changed only text / numbers / flags, or nothing):
  - **09**
    - Treecko / Torchic / Mudkip and Stage 1s (the 3.7.0 Gen-3 starter rework): each scored Nature card gives $1 (Grovyle $1
      or $2, a coin flip) / +5 (+8) Mult / +30 (+50) Chips. They evolve after 16 triggers (Blueprint's don't count). The
      "other Grass / Fire / Water card" boosts are gone. Perishable is allowed now.
    - Sceptile: +$1 per **other Grass Joker** (`find_pokemon_type('Grass', card)`); Energy cards no longer count.
    - Blaziken: scored Nature cards +10 Mult. After 5 Nature cards discarded in a round, each Fire / Fighting Joker gives X1.5
      (`other_joker`; itself included).
    - Swampert: scored Nature cards +60 Chips. A hand with 5 scoring Nature cards makes a Tarot per 2 Water / Earth Jokers.
    - Celebi: `G.GAME.poke_celebi_skips` (was `celebi_skips`); Blueprint doesn't count skips; new X(1 + 0.05 x rounds) Mult.
    - Ho-oh: a used Bird Energy comes back as a Polychrome Double Rainbow Energy (the Lua tests `label == "bird_energy"`; we
      test the center key); the copy reserves `consumeable_buffer`.
    - `dollar_buffer` around the starters' scoring $ (Raichu-style readers see it).
  - **10 / 11**
    - Shroomish, Numel: `knockoff_starter`.
    - Camerupt / Mega Camerupt: the Mult-card tooltip; Mega Camerupt's gain is `Xmult_mod` (was `Xmult_multi`).
  - **12**
    - Dusclops: the lone unscored card of the last hand is destroyed in the **destroy_card pass** (`cardarea 'unscored'`, so
      Poochyena and other `remove_playing_cards` listeners see it), and the Spectral needs room.
    - Feebas / Luvdisc: 3.9.1's `modify_scoring_hand` add_to_hand is our rules.js `splash` (as batch 6 kept Magikarp's).
  - **13** (the 3.8.0 Jirachi forms)
    - Banker: X3 cash-out through `modify_final_cashout` (`{modify = amount * 2}`). 3.9.1 dropped the lovely "Jirachi
      Double Payout" patch, so `rules.evaluate_round` no longer doubles.
    - Booster: +1 card per pack; no extra Booster slot; the first 3 rerolls of each shop add a Booster to the shop ("Wish!").
    - Power: Loyalty-Card count from when it took the form, every 3rd hand (every 2).
    - Invis ("copy" wish): Blueprint of the Joker to its right while 3+ Jokers hold Energy. It no longer copies-and-leaves
      at Blind select. The badge is the right joker's compatibility under that condition.
    - Fixer: a 1-card first discard is destroyed and makes a Death, Cryptid or Metal Coat (with room). The popup says "+1
      Tarot" whatever it makes, as in the Lua. No more edition on a 1-card first hand.
  - **14**: Kricketune's Tarot needs room (the $ is still paid).
  - **15**
    - Lucario: only in the pool while some playing card has an edition (a `POKE_POOL_RULES` rule).
    - Lopunny / Mega Lopunny: the Foresight tooltip.
  - **16**
    - Leafeon (Eevee line): no hand size. Once a Lucky card has successfully triggered this round, it triples every listed
      probability's numerator (`mod_probability`).
      - The run-wide `G.GAME.poke_lucky_triggers` is counted in Pokermon's mod-level calculate (rules.js), as in 3.9.1's
        pokermon.lua, and reset at end of round.
    - Glaceon (Eevee line): retriggers every played Glass card. No more Glass copies in the shop.
    - Magmortar: Blueprint-compatible; no once-per-round flag; scores only once it has gained something.
    - Yanmega: `mult_mod` / `chip_mod`.
    - Mamoswine: `dollar_buffer`.
    - Porygon-Z: the Bird Energy roll is 1 in 256 and its key is then unused (the Lua adds a random `poke_energy`). So it always
      makes a random Energy; the roll still draws from `'porygonz'`. Blueprint shows the popup on itself.
    - The Rotom forms are never in a pool (`POKE_POOL_RULES`).
  - **17**: Shaymin / Shaymin Sky: 3.9.1 text (the Flower part is deferred, above).
- **New engine seams** (js/engine):
  - **`mod_calculate` on `individual` and `end_of_round`** (smods.js `MOD_VANILLA_CONTEXTS = ['after', 'individual',
    'end_of_round']`).
    - run.js calls it for each scored card, after the jokers' individual effects (once per repetition; `lucky_trigger` still
      set), and in the main end_of_round pass after the jokers / consumables / blind.
    - SMODS gives `current_mod.calculate` every context; an opted-in mod hears these only when its hook reads them.
    - Pokermon's reads them for Leafeon's counter.
  - **Unscored destroys for seam mods**: `SMODS.calculate_destroying_cards` asks every joker about every played card,
    `'unscored'` feature or not. run.js now does that for an opted-in (`smods_seams`) mod's jokers even without the
    feature; other mods are as before.
  - **`add_booster_to_shop(key?)`** (run.js, SMODS.add_booster_to_shop); `change_booster_limit` uses it.
  - Tested in `smods_seams_test.mjs` section 8.
- **Shared changes**
  - `find_pokemon_type(type, exclude_card, exclude_name)` (types.js): 3.9.1's "other <type> Jokers".
  - `blueprint_effect` is exported from pokejokers_08.js (Jirachi Invis uses it).
- **Kept** (house rules and fixes over upstream): every "intended-design" comment in 09–17 (Jirachi Copy / Negging stay
  defined); the leftmost-valid Energy / Transformation rules and Deino / Zweilous "contains" (outside these files).
- **Deviations / later**
  - Old state names stay: `extra_pocket_picks` (3.9.1 `poke_extra_picks`), `scry_amount`, `energy_plus`,
    `negative_edition_rate`.
  - The starters' 3.9.1 `set_nature` hook is folded into our `set_ability` (nothing else calls it).
  - Blaziken's 3.9.1 `juiced` flag is never reset, so it juices once per card life; ported as is.
- **Tests**:
  - `pokejokers_09`–`17_test.mjs` fire the reworks, marked "(Pokermon 3.9.1)".
  - `pokermon_391_reworks_b_test.mjs` covers the overlay (97 reworked, no holds, the deferred list), the loc_vars of every
    reworked joker, one or more fired reworks per file, the shared changes, the deferred parts and kept rules. It gives 16
    passed / 28 failed on origin/main and 44 / 0 here.
  - `smods_seams_test.mjs` section 8 covers the new seams.
  - `pokermon_391_reworks_a_test.mjs` / `pokermon_391_data_test.mjs` / `pokermon_systems_test.mjs` follow the new rev, the Jirachi
    X3 and the jokers that left the "still 3.2.1" lists.
  - `micatro_resume_win_badges` and `micatro_runsync` (both replay a 3.2.1 fixture) are served pokejokers_09-17 as of the
    batch-6 merge (e295b8b7). The runsync fixture's opening Poke Ball otherwise rolls another Basic: the Rotom forms left the pool.

### Joker reworks, pokejokers_18–34 + zotherjokers / zmissingno (batch 8)
Pinned **`3.9.1+r5`** (`contentRev: 5`). Every existing joker of `pokemon/pokejokers_18.lua`–`34.lua` (27, 29 and 35 hold no 3.2.1
joker), `zotherjokers.lua` and `zmissingno.lua` (93: Pansage -> Gholdengo, the non-Pokédex jokers, MissingNo.) is on its
**3.9.1 behaviour** (jokers/pokejokers_18–34.js, zotherjokers.js, zmissingno.js, ported from the 3.9.1 Lua against our 87fb499
baseline) and takes **all** its 3.9.1 static data, except the 10 holds. With it every existing Pokermon joker file is reworked
(435 jokers on 3.9.1, 18 held).

- **How**: as batches 6 / 7 — `rework_files` now lists 01–34 + zotherjokers + zmissingno, `data391.js` regenerated. Counts
  (whole overlay): 78 whole configs, 254 texts, 23 blueprint flags; batch 8 added 12 / 50 / 4. The spec's stale `take` (Grubbin,
  Charjabug, Pokédex, Professor, Treasure Eatery) and `reasons` (the Vanillite line, Vikavolt, Ursaluna, Rival) are gone.
  - Generator: Pumpkaboo / Gourgeist have no Joker loc entry of their own (`loc_vars` always names a size); a reworked joker
    without one now takes its forms' entries (`j_poke_<name>_<form>`, minus other jokers' keys).
  - A Billion Lions moved to 3.9.1's `zzzapril_fools.lua` (only registered on April 1) with the same behaviour: it takes its
    3.9.1 text; ours stays behind the `pokemon_aprilfools` option.
- **Holds (10)**, each with its reason in the spec:
  - The Hazard jokers — Roggenrola / Boldore / Gigalith, Golett / Golurk, Ferroseed / Ferrothorn, Tarountula / Spidops: 3.9.1
    drops the per-joker Hazard ratio (`setting_blind` `poke_set_hazards`) for the run-wide `hazard_level` (add_to_deck /
    remove_from_deck `change_hazard_level`) — the Hazard layer, batch 10. Ferroseed / Ferrothorn's only 3.9.1 change is that
    `hazard_level`; Spidops' 3.9.1 rule (every 8th playing card added gets a random Seal; +2 hand size) comes with it.
  - Unown Swarm: the Unown rework (with Unown, held since batch 6): 3.9.1 redraws it (a glued playing-card front, its own soul
    atlas, `display_size`) and takes it out of the pool.
- **`rework_deferred`** (new this batch):
  - Rival: a beaten Rival opens Bitter Rival, then Champion — new 3.9.1 jokers (batch 17). Until then a beaten Rival just
    leaves the pool.
  - Mystery Egg: the hatch speed-ups (a held Fire Energy, a Flame Body / Magma Armor neighbour) need the Oologist, a new 3.9.1
    joker (batch 17). Until it is ported they never apply (the egg checks `find_card('j_poke_oologist')`, as the Lua).
  - Ruins of Alph: 3.9.1 makes its three Negative Unown by `SMODS.add_card` and no longer zeroes their cost / sell value. Ours
    keeps them free with no sell value until the Unown rework, so each blind's three Unown can't be sold for $2 apiece.
    (Batch 10b: done, and the guard was not needed: an Unown always sells for $0, below.)
- **Reworked** (behaviour, by file; the rest changed only text / numbers / flags / refactors, or nothing):
  - **18**
    - Simisear: a first hand containing a Straight or Flush makes The Empress at `before` (with room). Its unscored cards are
      destroyed in the **destroy_card pass** (`cardarea 'unscored'`): remove_playing_cards listeners (Hydreigon, Pawniard)
      see them.
    - Pansage / Pansear / Panpour: `knockoff_starter`.
  - **19**
    - Trubbish: the Chips gain and the trigger count move from the cash-out to end of round; it evolves through
      `scaling_evo`. The cash-out only pays the $.
    - Garbodor: a Boss beaten with no discard used this ante arms `active`; the Garbage Tag comes with the cash-out
      (`calc_dollar_bonus`).
    - Zorua / Zoroark: `SMODS.blueprint_effect` (only a Blueprint-compatible, undebuffed rightmost joker; 3.2.1 copied anything).
      - The Illusion is picked only outside the joker row (`get_random_poke_key_options`: Common / Safari, `exclude_types`
        Dark) and dropped in `add_to_deck`; the Dark sticker likewise only outside the row.
      - Zorua: what the copied joker does at `after` is not returned (it is revealed instead); it resets only once revealed, in
        the main end-of-round pass of a won round.
  - **20**
    - Vanillite / Vanillish / Vanilluxe: Blueprint-compatible (a copy scores the chips; the melt count is the original's).
      `scale_card` '-', and the melt is `SMODS.destroy_cards` (an Eternal one stays). Vanillish's unused `level_up` flag is gone.
    - Frillish / Jellicent: `scale_card` (Jellicent's King / Queen doubling as its operation).
    - Gothita: `knockoff_pseudol` (declared; nothing reads it yet, like `knockoff_starter`).
  - **21**
    - Beheeyem: Blueprint no longer counts the Boosters.
    - Chandelure: any joker worth less than $2 (no `post_trigger` / set checks).
    - Pawniard / Bisharp: `scale_card`. Bisharp destroys the lone face card of a first hand straight from the destroy_card pass
      (no `final_scoring_step` marker).
  - **22**
    - Deino / Zweilous: the hand is counted at `before` (not Blueprint), the XMult comes at `joker_main`. The **house rule
      stays**: any hand *containing* a Three of a Kind (3.9.1's text "if poker hand is a Three of a Kind" is rewritten to
      "contains" by index.js, as before).
    - Hydreigon: a Three of a Kind's unscored cards are destroyed in the destroy_card pass; `scale_card` per destroyed card.
  - **24**
    - Sylveon (Eevee line): when the round begins, a Foil / Holographic / Polychrome copy of a random deck card joins the hand
      (`SMODS.copy_card` into G.hand). Blueprint-compatible. (3.2.1: a lone unenhanced first-hand card got the edition.)
    - Pumpkaboo / Gourgeist: at `pre_discard` every undebuffed Jack counts; the one that reaches the target is marked
      (per joker, `unique_val`) and makes a Spectral as it is discarded (`create_consumeable`). Pumpkaboo carries
      `jack_target` / `jacks_discarded` into Gourgeist (`poke_custom_values_to_keep`).
    - Gourgeist: pays its config $6 at every size. 3.2.1's $2 / $5 / $8 / $11 by size is gone from set_ability **and** from
      `poke_backend_evolve`.
  - **25**
    - Vikavolt: X(1 + 0.5 x every Lightning Joker, itself included), no +Mult, nothing at X1.
    - Rockruff: Blueprint doesn't count toward the evolution.
    - Lycanroc Dusk: retriggers its first even / odd card on every hand (was once per round).
  - **26**: Mimikyu: `disguise_broken` (was `disguise = false`; a 3.2.1 card's `disguise === false` still reads as broken, and
    systems/anim.js shows broke_pos for either).
  - **30**
    - Dreepy / Dreepy Dart: sold, the hand takes the suit of the leftmost held card (not Spades), unless it has no suit.
    - Dreepy Dart: never in a pool (`POKE_POOL_RULES`).
    - Wyrdeer: add_to_deck / remove_from_deck also move the Foresight it gained this round (`scry_added`).
  - **31**: Ursaluna: the Item gets a random Foil / Holo / Polychrome edition (`poll_edition('aura')`, key_append 'luna').
  - **32**: Tinkatink line: debuff source `'<name>' .. unique_val`, and the reset clears only that source (3.2.1's `'reset'`
    wiped every source on every playing card: another Tinka's, a Boss's).
  - **33**
    - Kingambit: the deck's only King must be **held** in hand (was: in the played hand); its text shows the half XMult.
    - Annihilape: `chip_mod` / `mult_mod` (renamed keys).
    - Farigiraf: `create_consumeable('c_cryptid')`.
  - **34**
    - Gimmighoul: counts every money change through Steamodded's `money_altered` context (3.2.1 diffed `G.GAME.dollars` in
      `update()`; `previous_money` is gone). Its Gold-card $ goes into `dollar_buffer`. The Roaming form comes Negative and
      couponed (free) and is never in a pool.
    - Gholdengo: a scored Gold card pays $3 for XX1.5 while `dollars + dollar_buffer` covers it (3.2.1 kept a `future_dollars`
      copy from `before`); nothing at X1; resets to `Xmult1`; `enhancement_gate` Gold.
  - **zotherjokers**
    - Everstone: Basic Pokémon X1.5 (`Xmult_multi2`), Baby X1.75.
    - Tall Grass: has_enhancement Wild (quantum too); the joker is `SMODS.add_card` from the `pokemon` attribute pool, Common.
    - Jelly Donut: Blueprint makes an Energy but eats no round; the Energy holds a `consumeable_buffer` slot; `destroy_cards`.
    - Treasure Eatery: not Blueprint-compatible; `get_type`; `destroy_cards`.
    - Mystery Egg: its Pokémon is `SMODS.poll_object` over the `stage_baby` / `stage_basic` attribute pools (union, any rarity,
      seed 'egg', Common–Rare kept). It hatches **in place** through `poke_evolve(card, key, nil, "CRACK!", true, 1)` (slot,
      edition, stickers kept; 1 Energy). Not Perishable / Rental.
    - Rival (the 3.6.0 rework): no Mult and no forms. Each skipped Blind raises the payout by $10 (`skip_blind`,
      `scale_card`); a beaten Boss pays it ($15+), "Smell Ya Later!", self-destructs and sets `G.GAME.poke_rival_defeated`
      (out of the pool for good). Not Blueprint-compatible; $5.
    - Ruins of Alph: `scale_card`; selling with 10+ merged says "Duplicated!" first, then copies; 5+ merged is
      `SMODS.add_card` of a random Safari joker from the Joker pool. (The Unown spawn: deferred, above; done in batch 10b.)
    - Pokédex / Professor: their 3.9.1 Blueprint flags (taken since batch 5).
  - **zmissingno**: MissingNo.'s tags are `SMODS.poll_object` picks from the Tag pool (in_pool / min_ante rules) minus the
    Boss Tag, in the main end-of-round pass. An Orbital Tag with no blind's hand picks a visible hand (seed 'orbital', as
    Steamodded's tag.toml). The "Bird" tooltip is gone.
- **New engine seams** (js/engine/run.js): the mod jokers' destroy_card contexts — scored (`cardarea G.play`) and unscored —
  now carry `scoring_name` / `poker_hands` (`base_ctx()`), as `SMODS.calculate_destroying_cards` passes them (Simisear,
  Hydreigon read them).
- **Shared changes** (Pokermon systems):
  - utils.js: `destroy_joker` (SMODS.destroy_cards on a joker: Eternal kept, `getting_sliced`, pinched out), `create_consumeable`
    (3.9.1 `pokermon.create_consumeable`), `smods_copy_card` / `smods_add_to_deck` (SMODS.copy_card / add_to_deck), and
    `poke_add_shop_card(add, card, is_free)` (couponed).
  - pools.js: `get_random_poke_key(..., exclude_types)` and `get_random_poke_key_options`. The rest of the pool is the 3.2.1 one.
  - evolution.js: `poke_evolve` / `poke_backend_evolve` take `energize_amount` (Energy of type 'Trans' after the swap).
    - A kept value the old card lacks no longer deletes the new card's own: Lua's `pairs` never yields a nil. The fuzz found
      an egg-hatched Treecko losing its Nature targets.
    - The Gourgeist payout-by-size override is gone (above).
  - systems/anim.js: Mimikyu's `disguise_broken`.
- **Kept** (house rules and fixes over upstream):
  - Deino / Zweilous "contains a Three of a Kind" (behaviour in pokejokers_22.js, text in index.js).
  - No "+0" / "X1" popups where the port had a guard (Trubbish / Garbodor / Frillish / Ursaluna / Ruins of Alph chips or Mult > 0,
    Armarouge / Ceruledge Xmult > 1), as batch 6 kept Zubat's / Parasect's.
  - Every "intended-design" comment in 18–34 / zotherjokers (Hisuian Qwilfish / Overqwil stay registered).
- **Deviations / later**
  - Zorua's "Reset" is shown with `card_eval_status_text` and its level count still runs that round. The Lua returns early,
    but 3.9.1 counts levels in its later `evolution` context; ours counts at end of round (the batch-6 timing deviation).
  - Old state names stay: `rotom_discount` (3.9.1 `poke_rotom_discount`), `scry_amount` (`poke_scry_amount`).
  - Mimikyu's "Saved by Mimikyu" line is the engine's (`G.GAME.saved_by`); 3.9.1's `poke_saved_by` string is not taken.
  - Kleavor's Stone card keeps `create_playing_card` (3.9.1 `SMODS.add_card` Enhanced: the same card, another front draw).
- **Tests**:
  - `pokejokers_18`–`34_test.mjs`, `zotherjokers_test.mjs` and `zmissingno_test.mjs` fire the reworks, marked "(Pokermon 3.9.1)".
  - `pokermon_391_reworks_c_test.mjs` covers the overlay (83 reworked, 10 held, the deferred list), the loc_vars of every
    reworked joker, one or more fired reworks per file, the new seams, the egg-into-Treecko regression, the holds and the
    house rule. It gives 20 passed / 28 failed on origin/main and 50 / 0 here.
  - `pokermon_391_data_test.mjs`, `pokermon_391_reworks_a` / `_b_test.mjs`, `pokermon_systems_test.mjs` and `smods_seams_test.mjs`
    follow the new rev, Everstone's X1.5 and Gimmighoul's `money_altered`.
  - `micatro_resume_win_badges` (replays a 3.2.1 fixture) is also served pokejokers_18-34 / zotherjokers / zmissingno as of
    the batch-7 merge (a7b29c1b); `micatro_runsync`, `micatro_mod_version_pin`, `micatro_replay` and `micatro_nuzlocke` pass as they are.

### The Hazard layer, Seed and Flower (batch 10)
Pinned **`3.9.1+r6`** (`contentRev: 6`). Pokermon 3.6.0's Hazard rework, the Seed card and its items, 3.8.0's Flower X2, the 3.6.1
Debris deck / sleeve, and the 16 jokers that waited for them, all ported from the 3.9.1 Lua.

- **The Hazard layer** (3.9.1 pokeutils.lua / pokermon.lua; systems/utils.js, systems/rules.js):
  - `G.GAME.poke_hazard_level` (run-wide, default 0) and `G.GAME.poke_hazard_max` (default 3): `poke_change_hazard_level`,
    `poke_change_hazard_max`, `poke_get_hazard_level_vars` (+ `hazard_level_tip()`, the "Hazard Layer" tooltip: current / max),
    `poke_change_growth_level`. `hazard_layer` is the shared add_to_deck / remove_from_deck of every Hazard joker (`hazard_level`,
    + `hazard_max` for Skarmory), so a debuff, a sale or an evolution moves the layer as SMODS does.
  - When the first hand of a round is drawn, Pokermon's mod-level calculate deals min(max, level) Hazard cards **into the hand**
    (`poke_add_hazards(nil, n, G.hand)`: new playing cards, so the deck grows; `playing_card_added` fires). Engine seam:
    `first_hand_drawn` joins `MOD_VANILLA_CONTEXTS` (below).
  - `poke_add_hazards(ratio, flat, area)` takes 3.9.1's area and its front seed `'hazards'` (3.2.1 rolled `'qwilfish'`; Hisuian
    Qwilfish / Overqwil, which still add ratio Hazards to the deck, follow). `poke_set_hazards` (3.2.1's per-joker Hazards) stays
    exported; no content calls it any more.
  - `hazards_on = false` keeps every joker with the 3.9.1 `hazards` attribute out of the pools (3.9.1 `remove_from_pool`; 3.2.1's
    `hazard_poke` flag still counts, for add-ons). Ferroseed / Ferrothorn / Mega Steelix newly count.
- **Enhancements** (enhancements/enhancement1.js, now 3.9.1):
  - Hazard: 1 in 3 (was 1 in 6), destroyed when held at end of round (`playing_card_end_of_round`).
  - Seed (new; AtlasEnhancementsBasic {1,0}, art MyDude_YT; in the Enhanced pool, weight 5): +1 level (+ the growth level) each time
    it scores ("Upgrade!"); at 5 it becomes a Flower card and pays $15. Its art follows the level (`get_pos`: cells 2-6, as the Lua's
    set_sprites).
  - Flower: `Xmult_flower` 2 when the scoring hand has 4 suits (3 with Roserade, a new 3.9.1 joker not ported yet); +1 with Shaymin or
    Shaymin Sky. A 3.2.1 Flower card (`extra.Xmult` 3) reads the center's 2.
- **Items** (consumables/mart391.js; 3.2.1's data.js has neither, so their definitions carry the whole static data and index.js
  builds them after data.js's — the same for the Seed card and the Debris deck):
  - Miracle Seed (03_mart_items.lua): 1 selected card becomes a Seed card.
  - Heavy-Duty Boots (04_mart_rare.lua; reusable, once per round): until end of round every Hazard probability is 0 (answers
    `fix_probability` for identifier `'hazard'`; the reset is queued, so this round's held Hazards roll at 0).
    Deviation (retired in batch 17, when object_weights came on: now an Item of weight 2): 3.9.1 spawns it through object weights (weight 2 in the Item pool), which is not on in our port (batch 5). Ours is a
    hidden Item like Leftovers (soul_set Item) at 2/3 of Leftovers' soul_rate (weight 2 vs 3), and only while the Hazard layer is up
    (3.9.1 in_pool). Hiding its floating sprite while used is cosmetic, not ported.
  - Up-Grade (mart2.js): the Seed card joins its options (3.9.1).
  - Loc: `loc_extra` pulls the 3.9.1 entries; 3.9.1's `poke_item` set merges into our canonical `Item` (index.js).
- **The Debris deck and sleeve** (3.9.1 keys `diceydeck` / `diceysleeve`, shown as "Debris": the plan's "Dicey" and "Debris" are the
  same deck). AtlasDecksBasic (3.9.1, vendored in batch 5) {10,0} / {10,1}. +1 Hazard layer and limit, +1 hand size, no interest, and
  $1 per Hazard card in the full deck at cash-out (3.9.1's lovely "Enhance bonus" row: `G.GAME.modifiers.poke_money_per_enhancement`,
  rules.js evaluate_round; ours is the last row, the Lua's comes after the discards row: same total).
  - The sleeve's alt on the Debris deck (3.9.1 `poke_negative_hazards`: every Hazard card has `card_limit` +1, i.e. +1 hand size
    while held): deferred here, **done in the leftovers batch** (the playing-card `card_limit` seam; "The 3.9.1 leftovers" below).
- **Off hold** (spec `rework_hold` is now only Unown / Unown Swarm; `data391.js` regenerated: 90 whole configs, 270 texts, 25 flags):
  - Qwilfish: +1 Hazard layer; +15 Chips (`scale_card`) per enhanced card destroyed.
  - Skarmory: +1 Hazard layer and limit; X0.4 per held Hazard / Steel card. `rework_deferred`: Mega Skarmory (batch 16).
  - Roggenrola (+5 Mult per held no-rank card, evolves after 10) / Boldore (+10) / Gigalith (+7, retriggered): +1 layer each.
  - Golett (X1.2) / Golurk (X1.3) per held Hazard (or a 1 in 4 / 1 in 3 roll): +1 layer each.
  - Ferroseed / Ferrothorn: Wild and Hazard cards are also Steel (unchanged); +1 layer each.
  - Tarountula (+1 hand size) / Spidops (+2 hand size; every 8th playing card added gets a random seal, "Sticky Web!";
    `poll_seal_guaranteed` is now exported from pokejokers_05.js; not Blueprint-compatible): +1 layer each.
  - Mega Steelix: Stone cards are also Steel **and Hazard** (quantum, `check_enhancement`); held cards retrigger once per 4 no-rank
    cards held. The 3.2.1 Diamonds / $ rule is gone. Its Hazard part's end-of-round destroy needed the new seam below.
  - Bellossom: an odd card (coin flip) that is base becomes Wild **or Seed**; one already enhanced gets Foil / Holo / Polychrome
    (seed 'wildorseed'). (The Lua's info_queue names `m_seed`, a typo: ours shows the Seed card.)
  - Hoppip / Skiploom / Jumpluff: the discarded cards become **Seed** cards (were Wild).
  - Shaymin / Shaymin Sky: their deferred Flower part is the Flower enhancement above (`rework_deferred` no longer lists them).
- **New engine seams** (js/engine; opted-in mods only):
  - `first_hand_drawn` at mod level (`MOD_VANILLA_CONTEXTS` + run.js, after the jokers' and the blind's).
  - **Quantum enhancements' own effects**: `smods.js quantum_mod_calculate(card, context)`, called on the held-card end_of_round pass
    (run.js end_round) after the card's own enhancement. Each quantum enhancement that is a MOD center with a `calculate`, of a mod
    that opted in (`smods_seams`), runs that calculate (context + `extra_enhancement`), as SMODS.calculate_quantum_enhancements does.
    It returns at once unless an opted-in mod is active. Only this pass: a quantum mod enhancement's main-scoring effects are not
    run (nothing needs them; core.js still scores a quantum enhancement's config numbers).
  - Fuzz proof (the seam-only diff, before any content change), identical to origin/main: vanilla 40 runs / 5937 actions / max ante 13
    / 10 wins; Pokermon 24 / 3824 / 13 / 6; all mods 16 / 3065 / 13 / 7 (same mod activity); More Fluff fingerprints 7/7.
    `smods_seams_test.mjs` section 9 fires both seams with synthetic mods (a non-opted-in mod's quantum enhancement never runs).
- **Add-ons**: Nacho's Carbink (no-rank cards are also Gold) works with dealt Hazards as before; no Nacho / Pokermon+ joker used the
  per-joker Hazards. Pokermon+'s loc has a "Hazardous Deck" entry, but its data registers no such deck: nothing to adapt.
- **Not ported**: 3.9.1's April Fools Ludicolo card (`m_poke_ludicolo`, only with pokemon_aprilfools) and the April Fools Spidops form
  (zzzapril_fools.lua).
- **Tests**: `pokermon_391_hazard_test.mjs` (new; 9 passed / 49 failed on origin/main, 70 / 0 here) fires the layer (dealt into the
  hand, capped by the limit, raised / lowered by owning / selling, the tooltip), Hazard 1 in 3 and its destroy, the Boots, the quantum
  Hazard (Mega Steelix), Seed growth / Flower / $15, the growth level, Miracle Seed, Flower X2 / X3, every un-held joker, the Debris
  deck (cash-out row) and sleeve, and `hazards_on`. `pokejokers_07/08/18/21/31_test.mjs`, `pokermon_391_data` / `_reworks_a` / `_b` /
  `_c`, `pokermon_content_test.mjs` and `challenges_test.mjs` follow the 3.9.1 behaviour.

### The Unown rework and the Wish Pack (batch 10b)
Pinned **`3.9.1+r7`** (`contentRev: 7`). The last two holds (Unown, Unown Swarm) and two deferred parts (Ruins of Alph's Unown
spawn, Jirachi's Wish Pack) are on 3.9.1: spec `rework_hold` and `sprite_hold` are empty, `rework_deferred` lost Ruins of Alph and
Jirachi; `data391.js` regenerated (91 whole configs, 271 texts, 25 flags, 452 sprites, nothing skipped).

- **Unown** (jokers/pokejokers_07.js; 3.9.1 pokejokers_07.lua):
  - Never in a pool (3.9.1 `in_pool` false, even with Showman; `POKE_POOL_RULES`, since our load_pokemon replaces a joker's own
    `in_pool`). 3.2.1 let it into the Safari shop pool.
  - Self-destructs through `SMODS.destroy_cards` (`destroy_joker`) after it triggers with Ruins of Alph (Ruins' `after` still finds
    it that hand and merges it) and at end of round, returning "Fled!".
  - `set_nature` (the Nature rank) split out of `set_ability`; the 3.9.1 config (numeric target id), text ("self destructs") and
    attributes. The collection's Negative Unown is not ported (the collection draws centers, not cards).
- **Ruins of Alph** (jokers/zotherjokers.js): the three Negative Unown each Blind are `SMODS.add_card({key = 'j_poke_unown',
  edition = 'e_negative'})`, as 3.9.1. Their cost is no longer zeroed by hand.
  - **The "$2 per blind" exploit is moot, so no house rule.** Batch 8 kept the Unown at $0 cost and $0 sell value by hand so each
    blind's three Unown could not be sold. But both 3.2.1 and 3.9.1 patch `Card:set_cost` so an Unown always sells for **$0**
    (3.9.1 lovely/poke_utils.toml `if self.ability.name == "unown" then self.sell_cost = 0 end`; ours rules.js `set_cost`, which
    every `set_cost` / `set_edition` runs). `pokermon_391_unown_wish_test.mjs` sells one: it pays nothing. Only `cost` now follows
    3.9.1 (5 + Negative), and nothing buys an Unown (never in a pool).
- **Unown Swarm** (zotherjokers.js): never in a pool (3.9.1 `in_pool` false; `POKE_POOL_RULES`). Its effect is unchanged (each
  Legendary joker gives +28 Mult and X2.8). 3.9.1's `sound = 'multhit2'` is carried but the engine plays no per-effect sound, so
  the XMULT colour stays.
  - Not ported (cosmetic): the glued playing-card front 3.9.1 draws beside the swarm. Its `draw` makes a random Base card with
    `SMODS.create_card` inside the renderer, a pseudorandom draw that a deterministic replay can't have. The stickers drawn on
    that front (pokedraw.lua `unown_stickers`) go with it.
- **The art**:
  - Unown takes its 3.9.1 card: AtlasJokersBasicGen02 391 {0,0}, a redrawn frame and badge (the crop check lists it as the third
    on-purpose redraw). Its form letter (3.9.1 `set_sprites`: A..I {1..9,0}, J..S {0..9,1}, T..Z, !, ? {0..8,2}) is the soul layer:
    ui.js `face()` reads the view's `poke.form` (also for a Zorua copying an Unown). 3.2.1's port always showed "A".
  - Unown Swarm: 3.9.1's strips (36 frames of 290 x 285 in one row, 20880 px wide at 2x, past the 16384 px texture limit of many
    GPUs) are split by **`tools/micatro/split_pokermon_unown_swarm.mjs`** into tiles of 14 frames (8120 / 8120 / 4640 px):
    `j_poke_unown_swarm[_shiny][_soul]-391-t0..t2.png` (12 files, gitignored, beside the strips; the script never overwrites a tile
    that differs). index.js registers each tile (`poke_<strip>_t<n>`) and the strip's atlas as `{tiles, tile_cols: 14, crop}`.
    `js/ui/assets.js` `modCellRect` (new) maps a frame to its tile and column; `drawModCell` uses it, and a tiled atlas's load state
    / load listeners follow its tiles. `crop` {37, 0, 213, 285} draws only the card (3.9.1's `display_size` 290/3 x 285/3 with
    `set_alignment` x 37/3/71), so the swarm no longer draws squashed into the card. The flying Unown outside the card are cut off.
    `ANIMATED.j_poke_unown_swarm.frames_per_row` is 36. The 3.2.1 12 x 3 sheets hold the same 36 frames pixel for pixel; they stay
    vendored, unused.
- **The Wish Pack** (boosters/packs1.js; 3.9.1 packs1.lua): `config {extra = 3, choose = 1, used_wishes = {}}`. Each slot rolls
  (`pseudoseed('jirachi' .. i)`) among the wishes this pack hasn't offered yet: 3 different wishes of banker / booster / power /
  copy / fixer. The Master Ball wish left the pack. Its card, `c_poke_fake_masterball`, still works if made otherwise.
- **Jirachi's wishes** (consumables/martz.js; 3.9.1 07_mart_jirachi.lua): a wish is `pokermon.change_form` ("Transformed!", no
  randomizer swap; 3.2.1 called `poke_evolve` as a transformation: "Evolved!"). Each card names the form it grants in its tooltip
  (3.9.1 info_queue; the Master Ball wish names the Master Ball). Jirachi's `rework_deferred` entry is gone.
- **Tests**:
  - `pokermon_391_unown_wish_test.mjs` (new) gives 26 passed / 35 failed on origin/main (ecb39fd3) and 61 / 0 here. It fires the
    overlay and pin, the pool rule (Showman too), Unown's trigger / destroy / "Fled!", the Ruins spawn (Negative, distinct forms,
    $0 sale, merge + destroy, the next blind skipping merged forms), the Swarm's effect, Unown's form cells, the swarm tiles
    (frame -> tile / column / crop; the shiny + soul strips), and the Wish Pack (3 distinct of 5 over 6 seeds, seeded, change_form,
    tooltips, the Master Ball card).
  - Updated for rev 7 and the empty holds: `modpin_test.mjs`, `pokermon_391_data` (Unown on its 3.9.1 card, redrawn on purpose;
    nothing skipped), `_hazard`, `_reworks_a` / `_b` / `_c` and `pokermon_content_test.mjs` (3 wishes; the pick maps to its form).
  - Browser: `micatro_mod_version_pin` follows rev 7. `micatro_resume_win_badges` (its fixture is served the pre-rework
    pokejokers_07 / zotherjokers already), `micatro_runsync`, `micatro_replay`, `micatro_mod_assets` and `micatro_challenges_ui` pass as
    they are. A screenshot showed Unown A / K / ? / ! (one Shiny) and a plain + Shiny Unown Swarm animating from all 12 tiles.

### New jokers, sub-batch 11 (pokejokers_09 / 10)
Pinned **`3.9.1+r8`** (`contentRev: 8`). The first sub-batch of the new-jokers stack (Plans/MICATRO_MODS_UPGRADES.md batches 11–15):
the **26 jokers 3.9.1 added** to `pokemon/pokejokers_09.lua` (the Wurmple line) and `pokejokers_10.lua` (the Seedot, Taillow, Wingull,
Ralts, Surskit, Slakoth, Nincada and Makuhita lines, and Skitty), ported from the 3.9.1 Lua. Each is in the pools by its rarity like
every Pokermon joker (pokemon_in_pool, one per family, the Gen 3 option, enhancement gates).

- **How new jokers come in** (the recipe for sub-batches 12–15):
  - Static data is generated, never retyped. Spec `tools/micatro/specs/pokermon_391_overlay.json`, `new_jokers: {"11": [names]}`.
    The generator copies each joker's whole 3.9.1 item into `data391.js new_jokers`: config, rarity, cost, stage, ptype, gen,
    item_req, compat flags, attributes, enhancement_gate, designer. Each entry also gets `file` and `after` (the joker before it
    in 3.9.1's file order). Its sprite goes to `sprites` (3.9.1's PokemonSprites) and its 3.9.1 Joker entry to `loc`.
  - `index.js` builds them like data.js's jokers (`jokerCenter`; the definition supplies the behaviour). Each is inserted after
    `after`, so the collection and the Joker pool follow 3.9.1's order.
  - **Families**: 3.9.1 keeps its family list local (functions/pokefamily.lua). The extractor spec reads it through
    `pokermon.get_family_list` into a new `family` global. The extractor's `globals` take `{name, expr}` for that.
    - The generator emits the families that hold a new joker as `data391.js families`, minus names the port doesn't have yet.
      That is why the Ralts line has no Gallade for now.
    - `systems/evolution.js set_family` replaces the 3.2.1 family sharing a member, else adds the family.
    - An add-on's `add_family` that overlaps a 3.9.1 family joins it, as 3.9.1's `add_family` (= `add_to_family`) does. So
      Nacho's own Ralts line (with Mega Gardevoir, Gallade, Mega Gallade) and Pokermon+'s Nincada line make one family each, not a
      second family under the same names. Other add-on families are still pushed, as 3.2.1 did.
  - **`new_deferred`** (spec + data391.js) marks a new joker ported without one part that belongs to a later sub-batch.
    `drop` removes those static fields and `text_drop` the text lines naming the part. Both come back when the spec entry goes.
  - Count-pinning tests updated: `pokejokers_09` / `_10_test` (30 / 25 defs), `pokermon_391_data_test`, `modpin_test` (rev 8),
    `pokermon_391_unown_wish_test` (rev 7+), and `smods_seams_test` (`drawing_cards` is now read, by Swellow).
    `pokermon_391_data_test`'s 3.2.1-vs-3.9.1 crop check skips the new jokers: they have no 3.2.1 cell. Its PNG crop reader moved
    to `micatro/tests/mods/poke_art_helpers.mjs`.
- **The jokers** (jokers/pokejokers_09.js, pokejokers_10.js; numbers from data391.js):
  - **Wurmple line** (Nature = a suit: new `get_target_card_suit`, utils.js; `targets` is carried through evolution):
    - Wurmple: +3 Mult or +20 Chips, a coin flip each hand. After 5 scored Nature cards it evolves into Silcoon
      (Hearts / Diamonds) or Cascoon (Spades / Clubs).
    - Silcoon: +8 Mult. Cascoon: +60 Chips. Each evolves after 15 Nature cards.
    - Beautifly: +8 Mult. A scoring Nature card gives 1 in 3 to level up Flush before scoring. "Upgrade!" shows unless the hand is
      a Flush, which then scores at its new level.
    - Dustox: +60 Chips, and X3 ("Bug Buzz!") if every card held in hand is of the Nature suit.
  - **Seedot line**: scored Seed cards +40 / +50 / +60 Chips. Seedot needs a Seed card in the deck (enhancement_gate) and evolves
    in 5 rounds. Nuzleaf evolves with a Leaf Stone. Nuzleaf and Shiftry turn drawn Flower cards into Seed cards (level 0).
    Shiftry gives +1 growth level.
  - **Taillow / Swellow**: +4 / +6 Mult per Ace drawn during the Blind (`scale_card`), reset at end of round. When a Boss Blind is
    selected, Swellow makes the top 2 deck cards Aces in the `drawing_cards` context, before the first hand is drawn.
  - **Wingull / Pelipper**: $4 per discarded card of the round's rank (`G.GAME.current_round.wingullcard`, `dollar_buffer`).
    Pelipper adds $1 per Water joker.
  - **Ralts line**:
    - Ralts: +5 Mult per Energized joker and held Planet card.
    - Kirlia: +8 Mult per Energized joker and held Planet card; evolves into Gardevoir after 15 Planets used.
    - Gardevoir: comes holding a Black Hole (`create_consumeable`, also when Kirlia evolves into it). X(1 + 0.3 per Energized joker
      and per hand at level 5+).
  - **Surskit / Masquerain**: Straights may hold duplicate ranks (below). Surskit evolves after 8 Straights. Masquerain gives +4
    Foresight (`scry_amount`).
  - **Slakoth line**:
    - Slakoth: +15 Mult and -1 hand per hand played.
    - Vigoroth: X(1 + 0.5 per hand left). Its round countdown runs only in rounds without a discard.
    - Slaking: X4 and -1 hand.
  - **Nincada line**:
    - Nincada: a hand with a 9 or Jack costs it 5 Chips and gives 1 in 2 for a random consumable (any consumable type, seed
      'adacnin').
    - At 0 Chips Nincada evolves into Ninjask. With a free joker slot, a copy of it becomes **Shedinja** as well (Multi
      Evolution). This is ported **without a new seam**: the copy is made in an event after the evolution's
      (`copy_card` + `add_to_deck` + `emplace`, then `poke_evolve(copy, 'j_poke_shedinja', true)`). It holds `joker_buffer`, as the
      Lua does.
    - Ninjask: 1 in 2 for a Speed Tag (`tag_skip`) at Blind select. Each 9 / Jack of the first hand gives +13 Mult.
    - Shedinja: prevents death on a non-Boss Blind (`saved`) and gains +X0.5 each time. It self-destructs at the end of the shop
      beside a Fire, Earth, Dark or Psychic joker; other Shedinjas don't count ("Skree!").
  - **Makuhita / Hariyama**: +1 hand at Blind select, Hariyama +1 per Fighting joker.
  - **Skitty**: Blueprint of the joker to its right when that joker is of the round's type (`G.GAME.current_round.cattype`). The
    badge shows that condition.
- **Shared changes**:
  - `systems/rules.js`:
    - `reset_game_globals` adds 3.9.1's `reset_rank('wingullcard')` and `reset_type('cattype', {'skitty', 'delcatty'})` (the type of
      a random typed joker). Both have their own seeds, so no other stream moves.
    - `straight_min` ports 3.9.1's `_straight` hand part: with Surskit or Masquerain, each pair lowers the length needed by 1,
      three of a kind by 2, four by 3, five by 4 (never below 2), then the minimum with Four Fingers. So 10 9 9 8 7 and 9 9 8 8 7
      are Straights.
  - `systems/utils.js`: `get_target_card_suit`, `get_consumeables` (3.9.1 pokefunctions / pokeutils).
- **Deferred** (`new_deferred`):
  - Kirlia -> **Gallade** (Dawn Stone): Gallade is in upstream pokejokers_16, sub-batch 14.
  - Skitty -> **Delcatty** (Moon Stone): Delcatty is in pokejokers_11, sub-batch 12. **Done there** (below).
  - Until then Kirlia and Skitty have no `item_req` and no stone line in their text. A stone doesn't target them, and their
    `item_evo` calls are inert (`can_evolve` needs the target center). The code needs no change when those jokers land: drop the
    spec entries and regenerate.
- **Deviations / kept quirks**:
  - Taillow returns "Reset" at end of round before its `level_evo`. 3.9.1 counts rounds in its later `evolution` context; ours
    evolves at end of round (the batch-6 timing deviation). So Taillow shows the "Reset" and still counts down, as Zorua does.
  - Taillow / Swellow / Ralts / Kirlia show no "+0" (SMODS skips a 0 amount).
  - Ninjask's first-hand $: the Lua passes `money_mod`, which Ninjask's config doesn't have. That pays nothing, and the text names
    no money. Ported as is.
  - Silcoon / Cascoon count a Blueprint copy's Nature cards too (the Lua has no `not context.blueprint` there). Ported as is.
  - Pelipper's `level_evo` into itself is inert (it has no `rounds`). Ported as is.
  - 3.9.1's `G.GAME.poke_scry_amount` stays `scry_amount` (Masquerain), as batch 6.
  - Shedinja's "Saved by Shedinja" line is the engine's `G.GAME.saved_by`, as Mimikyu's.
  - Nincada's random consumable type follows our canonical set names (Energy / Item), as Rotom's.
- **Add-ons**:
  - Nacho 1.6.4 ships its own `j_nacho_ralts` / `kirlia` / `gardevoir` / `gallade`. Pokermon+ ships `j_pokeplus_nincada` /
    `ninjask` / `shedinja`.
  - They stay separate jokers (other keys) and share the 3.9.1 family (above). (Since the add-on dedupe, below: they are out of play,
    Pokermon's win.)
  - Nacho 1.7.9's deprecation of jokers now in base is batch 18; Pokermon+ 1.2.0's dropped jokers are batch 20.
- **Art**: every new joker draws its 3.9.1 card from `AtlasJokersBasicNatdex-391.png` (and `...NatdexShiny-391.png`), vendored in batch 5.
  No new art files. The test checks each crop and its Shiny twin hold a real picture.
  In play a Shiny one draws its normal card under the Shiny shader, like every Pokermon joker. A browser screenshot showed 12 of them
  (a Shiny Shedinja and Skitty) on their 3.9.1 cards.
- **Design wiki** regenerated (`node tools/micatro/gen_designwiki.mjs`: `designwiki/data/micatro_mods*.json`).
  - (Fixed in sub-batch 12, below.) `designwiki_micatro_mods_test` still failed one check: "every card's sprite cell matches its atlas pos" for the Unown Swarm. That
    comes from batch 10b, not this sub-batch: its tiled atlas has no `src`, so the wiki generator draws no art for it.
  - On origin/main the same check fails on Unown: the wiki was not regenerated after 10b.
- **Tests**: `micatro/tests/mods/pokermon_391_new_11_test.mjs` gives 5 passed / 45 failed on origin/main (9a00cd8f) and 176 / 0 here.
  - It fires every joker through real plays, and each evolution: Wurmple -> Silcoon / Cascoon, Silcoon -> Beautifly,
    Cascoon -> Dustox, Seedot -> Nuzleaf -> Shiftry, Taillow -> Swellow, Wingull -> Pelipper, Ralts -> Kirlia -> Gardevoir,
    Surskit -> Masquerain, Slakoth -> Vigoroth -> Slaking, Nincada -> Ninjask + Shedinja (and Ninjask only with a full row),
    Makuhita -> Hariyama.
  - It also checks the overlay, the order, the pools (`pokemon_in_pool`, `pool_filter`, and the shop's rarity pools: 4 Common, 7
    Uncommon, Skitty Rare), the families (with Nacho / Pokermon+), the deferred parts, the per-round rank and type, and the art.
  - Re-run and passing: every Pokermon / Nacho / Pokermon+ Node suite, the 391 suites, `modpin`, `challenges`, `replay`, and
    `micatro_engine_test` (92 suites; fuzz: vanilla 40 runs / 5937 actions, Pokermon 24 / 3269, all mods 16 / 3375).
  - Re-run and passing, browser: `micatro_mod_version_pin` (rev 8), `micatro_resume_win_badges` and `micatro_runsync`. Their 3.2.1
    fixtures are served the pre-batch-10 index.js and the old joker files, so the new jokers never enter them; no shim change.
    `micatro_mod_assets` and `micatro_replay` pass too.

### New jokers, sub-batch 12 (pokejokers_11)
Pinned **`3.9.1+r9`** (`contentRev: 9`). The **15 jokers 3.9.1 added** to `pokemon/pokejokers_11.lua`, built with the sub-batch 11 pipeline
(spec `new_jokers` "12", `node tools/micatro/gen_pokermon_391_overlay.mjs <extract>`; the extract is unchanged). Each is in the pools by its
rarity: Common Meditite, Plusle, Minun, Illumise, Wailmer; Uncommon Volbeat, Roselia, Carvanha, Spinda; Rare Sableye, Torkoal (only with a
Mult card in the deck: `enhancement_gate`); Safari Delcatty, Medicham, Sharpedo, Wailord.

- **The jokers** (jokers/pokejokers_11.js; numbers from data391.js):
  - **Delcatty** (Skitty's Moon Stone evolution): copies the joker to its right when that joker is of the round's type (`cattype`), with
    +1 Energy. The copy runs on a stand-in of the joker's ability: reads fall through to the real one (the Lua's `__index` metatables), the
    stand-in is energized (`energize`, silent), writes stay on it. `gone` is set meanwhile, as in the Lua, so the copied joker can't evolve.
    The badge is Skitty's.
  - **Sableye**: +X0.5 when a drawn card depletes an enhancement from the deck (none of it left), once per enhancement a round; resets at
    end of round. Quantum enhancements count (`get_enhancements`).
  - **Meditite / Medicham**: +7 / +12 Mult per empty consumable slot with 0 discards left. Meditite evolves in 5 rounds. Medicham also
    applies Sixth Sense: a lone 6 as the first hand is destroyed in the `destroy_card` pass for a Spectral card (must have room).
  - **Plusle**: +2 Mult per Joker and consumable (SMODS `get_card_areas('jokers')` = jokers + consumables); each Minun gives X2.5
    (`other_joker`).
  - **Minun**: every Joker, Booster and consumable costs $1 less per Minun (3.9.1's lovely cost patch, here `systems/rules.js set_cost`;
    Minun reprices every card when it comes and goes). $10 at end of round per Plusle (`calc_dollar_bonus`).
  - **Volbeat**: +6 Chips per Planet card used, or +X0.08 Mult instead with another Grass joker. **Illumise**: a Planet card per Grass joker
    (itself included) when the Blind is selected, as room allows.
  - **Roselia**: the round's first scoring card is retriggered twice if Odd, else it becomes a Seed card.
  - **Carvanha / Sharpedo**: slice the joker to their right at Blind select (Ceremonial Dagger's rules: not Eternal). X2 / X3 on a poker hand
    already played this round. Carvanha evolves after 3 jokers. Sharpedo makes a Spectral card per slice (must have room).
  - **Wailmer / Wailord**: +6 / +10 Chips per Club left in the deck; Wailmer evolves in 5 rounds. Wailord turns Standard Pack cards into Clubs
    (`modify_booster_card`).
  - **Torkoal**: each played Mult card retriggers once per discard left.
  - **Spinda**: comes holding a Wheel of Fortune. Its Nature (set on creation): 3 ranks and 3 enhancements. A scored card of a Nature rank
    becomes a random Nature enhancement before scoring ("Teeter Dance!").
- **Evolutions**: Skitty -> Delcatty with a Moon Stone (sub-batch 11's deferral is dropped: Skitty has its `item_req` and Moon Stone line
  again; its `item_evo` call needed no change). Meditite -> Medicham, Carvanha -> Sharpedo, Wailmer -> Wailord. Families from 3.9.1:
  Skitty / Delcatty, Meditite / Medicham, Carvanha / Sharpedo, Wailmer / Wailord, Roselia.
- **Deferred** (`new_deferred`): Roselia -> **Roserade** (Shiny Stone) and Budew -> Roselia. Budew and Roserade are in upstream
  pokejokers_14 (sub-batch 14). Until then Roselia has no `item_req` and no Shiny Stone line, its family is Roselia alone, and its
  `item_evo` call is inert. Nothing to change when they land: drop the spec entry and regenerate.
- **Shared changes**:
  - `systems/utils.js`: 3.9.1's `get_target_card_enhancements`, `find_playing_card`, `get_depleted`, and SMODS `get_enhancements`.
  - `systems/rules.js set_cost`: Minun.
  - The spec's `loc_extra` adds Other.deplete, poke_teeter_dance_ex and the poke_m_* enhancement names (Spinda's text).
  - `smods_seams_test`: `modify_booster_card` is now read (by Wailord).
- **Deviations / kept quirks**:
  - Wailord's `display_size` (1.2x a card) is not ported: the card frame is fixed. Its art is its normal cell.
  - Medicham's "+1 Spectral" pops through `card_eval_status_text`. SMODS shows a `destroy_card` return's message, but our destroy pass
    reads only `remove`.
  - Medicham's text vars hold its (missing) `rounds` at #2#, as the Lua's do; the text never shows #2#.
  - Delcatty energizes the stand-in once per `energy_buff` (ours takes one Energy a call; 3.9.1 passes the amount). With 1 it's the same.
  - Delcatty puts back the copied joker's `gone` as it was (the Lua sets nil).
  - Our copies never evolve anyway: `can_evolve` refuses a Blueprint context.
  - Spinda's Nature tooltip is our 3.2.1 "Nature" entry (vars 'rank'), as the other Nature jokers.
- **Add-ons**: Nacho / Pokermon+ ship none of these 15 jokers.
- **Art**: every new joker draws its 3.9.1 card from `AtlasJokersBasicNatdex-391.png` (and its Shiny twin), vendored in batch 5. No new
  art files. The test checks each crop and its Shiny twin hold a real picture; a browser screenshot showed them in the joker row.
- **Design wiki**: `designwiki_micatro_mods_test`'s sprite-cell check failed on the Unown Swarm since batch 10b. Its tiled atlas has no
  `src`, so the generator drew no art.
  - Fixed: `tools/micatro/gen_designwiki_mods.mjs` emits the tiled atlas (tiles, tile_cols, cell, crop, the card it fills), and gives
    each tile its size from the strip when the PNG isn't on disk. The Swarm's soul layer is its `_soul` strip, as the game's animation
    draws it.
  - `designwiki/app.js mcSprite` resolves a tiled cell as `modCellRect` does: the tile `floor(x / tile_cols)`, `x - t * tile_cols`, and
    the crop scaled to fill the card.
  - Regenerated (`node tools/micatro/gen_designwiki.mjs`); `index.html` cache-bust `?v=20261020pk12`.
- **Tests**: `micatro/tests/mods/pokermon_391_new_12_test.mjs` gives 0 passed / 30 failed on origin/main (9a00cd8f) and on sub-batch 11
  (0 / 33), and 119 / 0 here.
  - It fires every joker through real plays and each evolution: Skitty -> Delcatty (a real Moon Stone), Meditite -> Medicham,
    Carvanha -> Sharpedo, Wailmer -> Wailord, and the inert Roselia -> Roserade.
  - It also checks the overlay, the order, the pools (shop rarity pools, the Mult gate, one per family, the Gen 3 option), the families,
    the deferred part, Minun's prices and payout, Wailord's Standard Pack and the art.
  - Count pins updated: `pokejokers_11_test` (21 defs), `pokermon_391_new_11_test` (rev 8+, its own 26, Skitty's deferral gone),
    `pokermon_391_data_test` / `modpin_test` / `micatro_mod_version_pin_test` (rev 9), `smods_seams_test`.

### New jokers, sub-batch 13 (pokejokers_12)
Pinned **`3.9.1+r10`** (`contentRev: 10`). The **19 jokers 3.9.1 added** to `pokemon/pokejokers_12.lua`, built with the sub-batch 11 pipeline
(spec `new_jokers` "13", `node tools/micatro/gen_pokermon_391_overlay.mjs <extract>`; the extract is unchanged). Each is in the pools by its
rarity: Common Swablu, Corphish, Baltoy; Uncommon Cacnea, Lileep, Anorith, Kecleon, Shuppet, Tropius; Rare Zangoose, Seviper; Safari
Cacturne, Altaria, Crawdaunt, Claydol, Cradily, Armaldo, Banette, Chimecho (only with a Glass card in the deck: `enhancement_gate`).
They follow 3.9.1's `list` order: Kecleon after Milotic, Shuppet / Banette / Tropius / Chimecho after Dusclops.

- **The jokers** (jokers/pokejokers_12.js; numbers from data391.js):
  - **Cacnea / Cacturne**: +1 Hazard layer (`hazard_layer`); $3 / $5 for each destroyed playing card (`remove_playing_cards`). Cacnea evolves
    in 5 rounds. Cacturne destroys the Hazard cards of the round's first hand after scoring (`destroying_card`).
  - **Swablu / Altaria**: +2 / +3 Chips per 9 drawn during the Blind (`hand_drawn` = SMODS.drawn_cards). Swablu evolves at +36. Altaria pays
    $1 per 9 at 1 in 3, sure with another Dragon joker (`dollar_buffer`).
  - **Zangoose**: when a hand is played (`press_play`), 2 random held cards join it ("Crush Claw!") and score (`modify_scoring_hand`
    add_to_hand); they never change the poker hand (below).
  - **Seviper**: a played or discarded hand of exactly 3 cards gives +1 hand size this round (`temp_handsize`).
  - **Corphish / Crawdaunt**: a Nature of 3 ranks (set on creation; Crawdaunt rolls with Corphish's seed, as the Lua). Corphish: +1 Mult once
    when the played hand holds an unscored Nature card, evolves at +10. Crawdaunt: +1 per unscored Nature card.
  - **Baltoy / Claydol**: +1 Hazard layer; +1-6 / +1-8 Chips (seed 'baltoy') per discarded Hazard card. Baltoy evolves at +40. Claydol:
    1 in 3 for a discarded Hazard card to come back to hand (marked in `pre_discard`, sent back by the `stay_flipped` context's
    `modify.to_area`). The Lua's DynaText `main_start` ("+1 Hazard Layer", "+1-6 Chips for each") is two static `main_start` lines.
  - **Lileep / Cradily** (Ancient 8s): 1+ +1 hand size this round; 2+ +$1 / $2 sell value to itself and every consumable; 3+ each held card
    +10 / +20 Chips (`h_chips`). Lileep evolves after 5 3+ hands. Cradily 4+: $ equal to the highest consumable sell value.
  - **Anorith / Armaldo** (Ancient 7s): 1+ +7 / +11 Mult; 2+ 1 in 4 to add a 7 (Armaldo: an Enhanced 7) to the deck; 3+ destroy a random
    deck card above 7 (seed 'anorith', `poke_remove_card`). Anorith evolves after 5. Armaldo 4+: X(1 + 0.1 per Enhanced 7 in the full deck)
    ("X Scissor!").
  - **Kecleon**: takes the type of the joker to its right (Colorless with none) as a type sticker; X2 Mult with 3+ jokers of its type
    (itself included). Its Lua `update` runs every frame; ours runs before every calculate (as every mod joker's) and also when the joker
    row changes (index.js hooks `emplace`, `reordered`, `card_removed`).
  - **Shuppet / Banette**: +3 Mult when a Joker is sold during the Blind. Shuppet evolves at +18. Banette: +1 Joker slot, -1 hand.
  - **Tropius**: a Gros Michel (Cavendish at `cavendish_chance`) at end of round once per ante, must have room; ready again when the ante
    ends (`ante_change` + `ante_end`). +X0.5 Mult per Joker destroyed (`joker_type_destroyed`); a destroyed Gros Michel adds 20% Cavendish chance.
  - **Chimecho**: Vouchers in the shop are free (3.9.1's lovely cost patch: `systems/rules.js set_cost`; it reprices every card when it comes
    and goes). The first 2 Glass cards destroyed each round come back to hand as copies (to the deck when removed at end of round).
- **Evolutions**: Cacnea -> Cacturne, Swablu -> Altaria, Corphish -> Crawdaunt, Baltoy -> Claydol, Lileep -> Cradily, Anorith -> Armaldo,
  Shuppet -> Banette. Families from 3.9.1: those 7 lines, and Chimecho alone until Chingling lands (pokejokers_15, sub-batch 14: Chingling
  evolves into Chimecho by rounds; nothing to defer on Chimecho's side).
- **Fossils**: 3.9.1 has no fossil item or pack for Lileep / Anorith. They are plain Uncommon pool jokers, as Omanyte / Kabuto are.
  Nothing to port.
- **Seams / shared changes**:
  - Engine `run.js get_poker_hand_info`: a new `poker_hand_cards` hook (registry.js). Pokermon's (`rules.js poker_hand_cards`) is 3.9.1's
    `G.FUNCS.get_poker_hand_info` wrap: it leaves the cards Zangoose added (`poke_zangoose_card`) out of the poker hand.
  - Engine `jokers.js food_remove`: Steamodded (better_calc.toml) sends the food jokers' removal (Gros Michel, Cavendish, Ice Cream, Popcorn,
    Ramen, Seltzer, Turtle Bean) through `SMODS.destroy_cards`. With mods on, the joker is now `getting_sliced` and `joker_type_destroyed`
    fires first; a `{no_destroy}` answer keeps it. Vanilla runs: no change. (Tropius counts an extinct Gros Michel.)
  - `systems/utils.js`: `add_playing_card` (3.9.1 pokeutils), and `smods_create_card` takes a playing card's `rank` / `suit`.
  - `systems/rules.js set_cost`: Chimecho's free Vouchers.
  - `ui.js face()`: Kecleon's card (below).
  - The spec's `loc_extra` adds poke_baltoy_text, k_poke_chips and poke_crush_claw_ex.
- **Deviations / kept quirks**:
  - Altaria's Dragon bonus adds `chip_mod_extra`, which its config doesn't have: + 0, as in the Lua.
  - Chimecho's "Copied!" return waits on a `card_to_copy` the Lua never sets: no message, as in the Lua.
  - Zangoose's added cards land after the played ones in G.play, as in the Lua (our `press_play` fires before the played cards move; the
    draws are queued one event later).
  - Banette's `remove_from_deck` gives the hand back even when debuffed (no `from_debuff` check), as in the Lua.
  - Kecleon's `SMODS.recalc_debuff` is `card.set_debuff()`.
- **Add-ons**: Nacho / Pokermon+ ship none of these 19 jokers.
- **Art**: every new joker draws its 3.9.1 card from `AtlasJokersBasicNatdex-391.png` (and its Shiny twin), vendored in batch 5. No new
  art files. The test checks each crop and its Shiny twin hold a real picture.
  - **Kecleon** (3.9.1 `set_sprites`, pokespriteload `lookup_gen_atlas = 3`): its type cards are on the Gen 3 sheet
    (`AtlasJokersBasicGen03-391.png`: Dark {6,0} ... Water {2,2}). `ui.js face()` draws the card of the type it holds (the table: `systems/anim.js KECLEON_SPRITES`, not the joker file, which the 3.2.1 fixtures of `micatro_resume_win_badges` / `micatro_runsync` serve old); Colorless is its own
    Natdex card. A Shiny one draws it under the Shiny shader, as every Shiny. The test checks all 11 cells are real, distinct pictures.
  - **Baltoy / Claydol, Series A**: 3.9.1 lists `AtlasJokersSeriesABaltoy` / `Claydol` (32-frame animations, + Shiny) as their **Series A
    alternate** (`alts.AtlasJokersSeriesA.anim_atlas`), not their base art. 3.9.1 picks the series per profile
    (`pokemon_spritesheet_atlas`, default "SeriesA"; the collection can toggle it per card). Wired in the leftovers batch: the
    cosmetic `series` option (Basic by default) draws every Series A alt, Baltoy / Claydol animated ("The 3.9.1 leftovers" below).
    The `...Future` sheets are not named by 3.9.1.
- **Tests**: `micatro/tests/mods/pokermon_391_new_13_test.mjs` gives 0 passed / 31 failed on origin/main (9a00cd8f) and on sub-batch 12
  (91e0fb70), and 138 / 0 here.
  - It fires every joker through real plays and each evolution (above), Zangoose's unchanged poker hand, Claydol's return to hand, Kecleon's
    type through add / sell / reorder and its card, Tropius with an extinct Gros Michel and a Ceremonial Dagger slice, Chimecho's prices.
  - It also checks the overlay, the order, the pools (shop rarity pools, the Glass gate, one per family, the Gen 3 option), the families,
    the text and the art.
  - Count pins updated: `pokejokers_12_test` (25 defs), `pokermon_391_data_test` / `modpin_test` / `micatro_mod_version_pin_test` (rev 10),
    `smods_seams_test` (`modify_scoring_hand`, `ante_change` and `stay_flipped` are now read: Zangoose, Tropius, Claydol).
  - Re-run and passing: every `micatro/tests` Node suite (all mods), `micatro_engine_test` (94 suites; fuzz Pokermon 24 runs / 3932 actions,
    all mods 16 / 3346), and in the browser `micatro_mod_version_pin`, `micatro_resume_win_badges`, `micatro_runsync`,
    `designwiki_micatro_mods` (295 / 0; wiki data regenerated). `micatro_runsync` serves the pre-batch-7 joker files with the current
    `index.js` / `ui.js`, so neither may import from a joker file (Kecleon's table is in `systems/anim.js`; index.js reaches its update
    through the center). No fixture shim change.
  - A browser screenshot showed all 19 in the joker row on their 3.9.1 cards (Shiny Altaria / Claydol / Chimecho), Kecleon on its Fire card.

### New jokers, sub-batch 14 (pokejokers_13 / 14 / 15 / 16)
Pinned **`3.9.1+r11`** (`contentRev: 11`). The **14 jokers 3.9.1 added** to `pokemon/pokejokers_13.lua` (Clamperl, Huntail, Gorebyss,
Relicanth, Bagon, Shelgon, Salamence, Deoxys), `pokejokers_14.lua` (Budew, Roserade), `pokejokers_15.lua` (Chingling, Bronzor, Bronzong) and
`pokejokers_16.lua` (Gallade), built with the sub-batch 11 pipeline (spec `new_jokers` "14", `node tools/micatro/gen_pokermon_391_overlay.mjs
<extract>`; the extract is unchanged). Each is in the pools by its rarity: Common Budew; Uncommon Bagon; Rare Clamperl, Relicanth, Chingling,
Bronzor; Legendary Deoxys (The Soul); Safari Huntail, Gorebyss, Shelgon, Salamence, Roserade, Bronzong, Gallade.

- **The jokers** (numbers from data391.js):
  - **Clamperl / Huntail / Gorebyss** (jokers/pokejokers_13.js): +4 hand size while a Booster pack is open (`open_booster` to `ending_booster`;
    given back if the joker leaves mid-pack). Clamperl comes with an Ethereal Tag. Huntail: a Tarot or Item **sold** in a pack gives +X0.1 Mult
    and destroys a random held card. Gorebyss: a Tarot or Item **used** in a pack gives +X0.15 Mult.
    - "In a pack": 3.9.1 lists the vanilla pack states and SMODS_BOOSTER_OPENED, which Steamodded uses for every pack. Ours checks every pack
      state (Buffoon packs included).
  - **Relicanth** (Ancient 4s): 1+ the rightmost scoring card +40 Chips; 2+ and $4 (`dollar_buffer`); 3+ the bottom deck card that isn't a 4
    becomes Stone; 4+ X(1 + 0.75 per depleted rank). The ranks are our 13 (3.9.1 walks SMODS.Ranks; no mod adds a rank to Pokermon runs).
  - **Bagon / Shelgon / Salamence**: +3 / +3 / +5 Mult per Straight played this run. Bagon -1 and Shelgon -2 hand size. Bagon evolves after 5
    scored Straights; a scored Straight takes a round off Shelgon's 8. Salamence: +1 hand size this round per 5 Straights played, at Blind select.
  - **Deoxys** (Legendary): the first discard of a round, if exactly 1 card, gets a **DNA Seal**. Its forme (`extra.form`: 1 Attack,
    2 Defense, 3 Speed, 4 Normal) comes from the **Meteorite** (below); the formes have their own 3.9.1 texts (`loc_vars` `key`).
  - **Budew** (Baby; jokers/pokejokers_14.js): X0.75 Mult, a Negative Miracle Seed at end of round, evolves into Roselia in 2 rounds.
  - **Roserade**: the first scoring card of every hand, if Odd, is retriggered twice. With a Roserade the **Flower** card scores with 3 suits
    instead of 4 (batch 10's rule in enhancements/enhancement1.js, dormant until now; the test fires it).
  - **Chingling** (Baby; jokers/pokejokers_15.js): X0.75 Mult, a Negative Justice at end of round, evolves into Chimecho in 2 rounds.
  - **Bronzor / Bronzong**: scored cards of the round's suit give X1.3. Bronzor evolves after 10 scored cards of the round's rank; Bronzong
    retriggers them once. The round's card: `systems/rules.js reset_bronzo_card` (3.9.1 pokefunctions.lua: a random playing card with a rank
    and a suit, seed 'bronzo' .. ante; Ace of Spades without one), run from `reset_game_globals`.
  - **Gallade** (jokers/pokejokers_16.js): X(1 + 0.5 per Joker with 2+ Energy, itself included); comes holding a Double Rainbow Energy (also
    when Kirlia evolves into it).
- **Evolutions**: Clamperl -> Gorebyss (Link Cable, `item_req`) or Huntail (a Link Cable sold), Bagon -> Shelgon -> Salamence, Budew ->
  Roselia, Chingling -> Chimecho, Bronzor -> Bronzong. Families from 3.9.1: those lines, and Deoxys with its formes (`{key, form}` entries).
- **The deferred evolutions are on** (spec `new_deferred` is empty): Kirlia -> **Gallade** with a Dawn Stone (sub-batch 11) and Roselia ->
  **Roserade** with a Shiny Stone (sub-batch 12) have their `item_req` and stone text back; their `item_evo` calls needed no change. The
  test uses the real stones. Budew -> Roselia and Chingling -> Chimecho complete those families (Chimecho was alone since sub-batch 13).
  - **Nacho's Ralts line**: Nacho's `add_family` joins the 3.9.1 family, now `ralts, kirlia, gardevoir, gallade, mega_gardevoir, mega_gallade`.
    `get_highest_evo` (the Rare Candy / Master Ball path) skips the Megas and needs the last name as a registered joker. For a Pokermon
    Ralts with Nacho on, that was `j_poke_gallade`, missing until now, so it resolved to nothing. Now Gallade or Gardevoir, as for Nacho's own
    Ralts (`j_nacho_gallade` / `j_nacho_gardevoir`).
- **Ported here, not in batch 17** (both small and self-contained):
  - **The DNA Seal** (seals/seals1.js, 3.9.1 seals1.lua; index.js now builds new seals after data.js's): a played hand of exactly 1 card with
    it makes a Sealless copy of that card in hand ("Copied!", `playing_card_added`). Each Deoxys in a forme adds to the copy, permanently:
    Attack +X0.25 Mult (`perma_x_mult`), Defense +$2 held at end of round (`perma_h_dollars`), Speed +40 Chips (`perma_bonus`). Never in a pool.
  - **The Meteorite** (consumables/mart391.js, 3.9.1 05_mart_specific.lua): a reusable Spectral held item. Using it destroys 1 random card
    left in the deck (seed 'meteor') and turns the selected (else the leftmost) Deoxys into its forme. The forme cycles Attack -> Defense ->
    Speed -> Normal on every shop reroll, and it is usable again at the end of the round. It is a hidden Planet soul card (`soul_rate` 0.2)
    while you have a Deoxys (3.9.1 `in_pool`), and a pack lets you keep it (`saveable`).
  - Deoxys's forme floats over its card (3.9.1 `set_sprites`: the Gen 3 sheet's {5,3} / {7,3} / {9,3}; Normal is its own {3,3}).
    `ui.js face()` draws it from `systems/anim.js DEOXYS_SOULS`, not from the joker file: the 3.2.1 fixtures serve an old one.
- **Jirachi's Copy / Negging forms**: both were already in the port. The original 3.2.1 port defined `jirachi_copy` and `jirachi_negging` in full (an
  intended-design fix: the owner wants them live). 3.9.1 still writes both and never registers them: they are not in pokejokers_13's `list`
  nor in its Jirachi family. Checked against 3.9.1: the same config and behaviour (3.9.1's `poke_negative_edition_rate` is our
  `negative_edition_rate`), and they now take 3.9.1's text (spec `loc_extra`).
  - **The Wish Pack is unchanged**, because 3.9.1's doesn't offer them either. Its 5 wishes are banker / booster / power / copy / fixer.
    3.9.1's "copy" wish (`c_poke_fake_copy`) grants **Jirachi Invis**, not `jirachi_copy`. `c_poke_fake_negging` is registered but not in the
    pack's list; in 3.9.1 its `change_form` targets the unregistered `jirachi_negging`, so it does nothing there. Ours works, because the port
    registers the form. The test fires both forms and checks the pack offers neither.
- **Seams / shared changes**:
  - Engine `run.js reroll_shop`: with mods on, mod consumables see `reroll_shop` too, as Steamodded's calculate_context does (the Meteorite).
    Base-game consumables don't calculate, so vanilla runs are unchanged.
  - Engine `core.js`: Steamodded's `perma_h_dollars`. It is added to a held card's end-of-round dollars (`get_h_dollars`) and kept through
    `set_ability` like `perma_x_mult`. Only a mod sets it, so vanilla is unchanged.
  - `systems/rules.js`: `reset_bronzo_card`; `can_reserve` keeps a `saveable` consumable from a pack (3.9.1 `can_save_consumable`). That
    covers the Meteorite; the Megastone already had its own name check.
  - Generator (`tools/micatro/gen_pokermon_391_overlay.mjs`) and index.js: `loc_extra` can name `labels` entries (the DNA Seal's badge).
  - The spec's `loc_extra` adds the Deoxys forme texts, the Jirachi Copy / Negging texts, Other.poke_dna_seal_seal, Other.holding_other,
    Spectral.c_poke_meteorite, the four `poke_*_forme` words and labels.poke_dna_seal_seal.
- **Deviations / kept quirks**:
  - Shelgon's rounds count down at end of round and on scored Straights (`level_evo`), as the Lua; ours evolves at end of round (batch 6
    timing).
  - Clamperl's Ethereal Tag fires at the next `new_blind_choice`: the end of a pack, or the next Blind select. That is the engine's Tag
    timing, the same as an Ethereal Tag from a skipped Blind.
  - The Meteorite's floating sprite hiding while used, the DNA Seal's shader draw and `do_evolution_anim` are cosmetic: a "Transformed!"
    status shows instead. Relicanth's `fossil_generate_ui` layout is not ported, as Lileep's (plain text lines).
  - The DNA Seal adds `perma_x_mult` / `perma_h_dollars` from 0: Steamodded starts every card at 0, so the Lua's `or 1` never applies (as
    Spinarak's perma_x_mult, batch 7).
- **Add-ons**: Nacho ships its own Gallade line (see above). Neither Nacho nor Pokermon+ ships the others.
- **Art**: no new art files.
  - Every new joker draws its 3.9.1 card from the batch-5 sheets: `AtlasJokersBasicNatdex-391.png` and its Shiny twin, and Deoxys
    `AtlasJokersBasicGen03-391.png` {2,3} with soul {3,3}.
  - The Meteorite uses `AtlasConsumablesBasic-391.png` {5,7} with soul {6,7}; its 3.2.1 cell is empty, so `pokermon_391_data_test` skips it.
  - The DNA Seal uses `AtlasStickersBasic-391.png` {6,1}.
  - The test checks each joker crop and its Shiny twin, Deoxys's 4 forme souls (distinct), the Meteorite and the DNA Seal.
- **Tests**: `micatro/tests/mods/pokermon_391_new_14_test.mjs` gives 6 passed / 41 failed on origin/main (9a00cd8f), 7 / 46 on sub-batch 13
  (dfadc6d6), and 145 / 0 here.
  - It fires every joker through real plays (packs opened and skipped, Tarots sold / used in packs, Straights, Blind select, discards), and
    every evolution with the real items (Link Cable, Dawn Stone, Shiny Stone).
  - It also fires the Flower + Roserade rule, the DNA Seal's copy and each forme's bonus, the Meteorite (reroll, use, reset, its tooltip
    and sprite), Bronzor's card of the round, Jirachi Copy / Negging and the Wish Pack, and Nacho's Ralts `get_highest_evo`.
  - It checks the overlay, the order, the pools (shop rarity pools, Legendary, one per family, the Gen 3 option), the families, the text and
    the art.
  - Updated for rev 11 and the dropped deferrals:
    - `pokermon_391_new_11_test` (Kirlia's Dawn Stone is back, Gallade is in the family, Nacho's family order) and `pokermon_391_new_12_test`
      (Roselia's Shiny Stone, Budew / Roserade in the family).
    - `pokermon_391_new_13_test` (Chingling / Chimecho), `pokejokers_13` / `14` / `15` / `16_test` (22 / 8 / 15 / 25 defs).
    - `pokermon_content_test` (3 seals), `pokermon_391_data_test` (rev 11; the Meteorite has no 3.2.1 cell), `modpin_test` and
      `micatro_mod_version_pin_test` (rev 11).

### New jokers, sub-batch 15 (pokejokers_18 / 20 / 21 / 22 / 26 / 31 / 32)
Pinned **`3.9.1+r12`** (`contentRev: 12`). The **18 jokers 3.9.1 added** to `pokemon/pokejokers_18.lua` (Munna, Musharna), `_20` (Klink, Klang),
`_21` (Klinklang, Axew, Fraxure, Haxorus), `_22` (Bunnelby, Diggersby), `_26` (Drampa), `_31` (Smoliv, Dolliv, Arboliva) and `_32` (Bramblin,
Brambleghast, Rellor, Rabsca), built with the sub-batch 11 pipeline (spec `new_jokers` "15", `node tools/micatro/gen_pokermon_391_overlay.mjs
<extract>`; the extract is unchanged). Each is in the pools by its rarity: Common Klink, Bunnelby, Smoliv, Bramblin, Rellor; Uncommon Axew;
Rare Munna, Drampa; Safari the rest. The plan's 20 counted Hisuian Qwilfish and Overqwil too: both were already in the port (below).

- **The jokers** (numbers from data391.js):
  - **Munna** (jokers/pokejokers_18.js): +2 Foresight. When a hand is played (`before`), each Enhanced Foreseen card loses its
    enhancement and Munna gains +X0.05 Mult for it; X Mult at `joker_main`. Evolves with a Moon Stone. The Lua strips the scry view's
    copy and the real deck card; our scry view is the deck cards, so one `set_ability`.
  - **Musharna**: when the Blind is selected, +2 Foresight this round per Psychic joker (itself included; taken back at end of round
    or when sold); each Enhanced Foreseen card gives X Mult (Munna's, kept by `copy_scaled`).
  - **Klink / Klang** (pokejokers_20.js): $1 for every 12 / 10 cards drawn during the Blind (`hand_drawn`); evolve after earning
    $8 / $10. **Klinklang** (pokejokers_21.js): $1 and +X0.4 Mult for every 8 cards drawn; the X Mult resets at end of round.
  - **Axew / Fraxure / Haxorus**: a Nature of 2 visible poker hands (set on creation; carried through evolution as `targets`).
    In the `modify_hand` context their base Chips and Mult are doubled (Axew: the first Nature hand of the round; Fraxure: every one)
    or tripled (Haxorus). Axew / Fraxure evolve after 7 Nature hands each. Haxorus's config `rounds` is read by nothing.
  - **Bunnelby / Diggersby** (pokejokers_22.js): each drawn card whose rank is now gone from the deck (`find_playing_card`) gives
    1 in 3 for a Tarot card (must have room), "Nope!" when the roll fails (`poke_nope`, 3.9.1 `pokermon.nope`). Bunnelby evolves after
    4 Tarots. Diggersby also gains +2 Mult per hit, room or not; it rolls with Bunnelby's seed, as the Lua.
  - **Drampa** (pokejokers_26.js): +1 Booster Pack in the shop (`change_booster_limit`). When it comes, the shop's packs become Jumbo
    (`upgrade_all_shop_packs`). New shop packs roll Jumbo or better: 3.9.1's `get_pack` wrap is `systems/rules.js get_pack` (the
    engine's `get_pack` hook). `get_upgraded_pack_center` never downgrades and keeps the art number when it can (else half, else 1).
  - **Smoliv / Dolliv / Arboliva** (pokejokers_31.js): at end of round, +$2 sell value (`scale_card` on `ability.extra_value`, "Value Up!").
    Smoliv: to itself. Dolliv: to itself and the adjacent Jokers. Arboliva: to every Joker and consumable, doubled for Grass jokers and
    Grass Energy. Smoliv / Dolliv evolve at $12 / $22 sell value.
  - **Bramblin / Brambleghast** (pokejokers_32.js): the second scoring card of the round's rank (`G.GAME.current_round.bramblincard`)
    becomes a Seed card (Brambleghast's at level 0); once a round. Bramblin evolves after drawing 160 cards during Blinds. Brambleghast:
    +1 growth level, +2 Chips per $1 you have.
  - **Rellor / Rabsca**: +1 Mult per Item card used this run. Rellor evolves after using 5 Items. Rabsca: each Item used gives 1 in 4
    for a Tarot card (must have room).
- **Evolutions**: Munna -> Musharna (Moon Stone), Klink -> Klang -> Klinklang, Axew -> Fraxure -> Haxorus, Bunnelby -> Diggersby, Smoliv ->
  Dolliv -> Arboliva, Bramblin -> Brambleghast, Rellor -> Rabsca. Families from 3.9.1: those 7 lines, and Drampa alone.
- **Deferred** (`new_deferred`): Drampa's `megas = {mega_drampa}`. Mega Drampa is a 3.9.1 Mega (batch 16).
  - Until then Drampa has no `megas`, so a Mega Stone doesn't target it. Its text names no Mega.
  - `get_pack` already checks for a Mega Drampa; that check is inert until Mega Drampa exists.
- **Hisuian Qwilfish / Overqwil**: 3.9.1 still writes both (commented out) and never registers them. The port has defined both in full
  since 3.2.1, an intended-design deviation.
  - **Art**: the plan said Hisuian Qwilfish had no upstream art. 3.9.1 has it: `pokespriteload.lua` puts it on the Gen 2 sheet
    (`AtlasJokersBasicGen02-391.png` {2,5}, and its Shiny twin), vendored in batch 5.
    - The port drew a Micatro-made card until now. It now draws 3.9.1's.
    - The spec's new `unregistered_sprites` gives jokers that 3.9.1 writes but never registers their 3.9.1 sprite (`data391.js sprites`).
    - The `poke_hisuian_qwilfish` atlases are unregistered. Overqwil already drew its 3.9.1 cell (Natdex {6,60}).
  - Their 3.9.1 text and family are the same as 3.2.1's, and the behaviour matches the 3.9.1 code. Overqwil stays stage "One" (the Lua
    says "Basic").
  - **Reachable**: Hisuian Qwilfish is an Uncommon pool joker. It evolves into Overqwil at +80 Chips (`scaling_evo`).
  - **Qwilfish does not evolve in 3.9.1**, so no Qwilfish -> Hisuian Qwilfish evolution is wired (it would be our own design):
    - pokejokers_08.lua gives Qwilfish no `item_req` / `evo_list`;
    - pokefamily.lua keeps `{hisuian_qwilfish, overqwil}` apart from it;
    - `dex_order.lua` only lists the two in one Pokédex slot (a regional form).
- **Seams / shared changes**:
  - Engine `core.js set_consumeable_usage`: Steamodded's "tracking custom consumable usage".
    - Every set other than Tarot / Planet / Spectral counts under `G.GAME.consumeable_usage_total[set:lower()]`.
    - 3.9.1 reads `poke_item` (its set key); our canonical Item set counts as `item` (Rellor / Rabsca).
    - Base-game consumables are only the three vanilla sets, so vanilla is unchanged.
  - `systems/evolution.js copy_scaled_values`: 3.9.1 adds `Xmult_multi` to the scaled values an evolution keeps (Munna -> Musharna).
  - `systems/utils.js`: `poke_nope`, `get_upgraded_pack_center`, `upgrade_shop_pack`, `upgrade_all_shop_packs` (3.9.1 pokeutils.lua).
  - `systems/rules.js`: `get_pack` (Drampa); `reset_game_globals` adds `reset_rank('bramblincard')`, before Wingull's as in 3.9.1.
    It has its own seed, so no other stream moves.
  - Generator: `unregistered_sprites` (above).
- **Deviations / kept quirks**:
  - Axew's Nature: the Lua shuffles a `pairs()` list of `G.GAME.hands`, whose order is unspecified. Ours takes `G.GAME.hands` order, so the
    pick is deterministic.
  - Arboliva's Grass Energy check: the Lua compares `ability.name` to `"c_poke_grass_energy"` (Steamodded's name = key). Ours names the
    center `grass_energy`, so it checks the center key.
  - Drampa: the engine returns the run's first-shop Buffoon pack before the `get_pack` hook, so that one pack is not upgraded.
    - This only matters with a Drampa already owned at the first shop. The Lua wraps all of `get_pack`.
  - Klink / Klang / Klinklang's `ease_poke_dollars` pays at once (no `dollar_buffer`), as in the Lua.
  - Bramblin's count of the round's rank goes past 2 in a hand with 3+ of it, and the third card is not a Seed. As in the Lua.
- **Fix found by the all-mods fuzz** (Zangoose, sub-batch 13): with The Hook, `micatro_engine_test`'s all-mods fuzz left a card in two
  areas. The new jokers changed the pools, so the fuzz reached the case. Zangoose picks 2 held cards at `press_play`; The Hook's event,
  queued between that and Zangoose's draws, can discard the same cards. The Lua draws them anyway: the card ends up in G.play and
  G.discard at once. Now each card is checked when it would move, and a card The Hook took (highlighted, or no longer in hand) stays
  out. The test pins it: it fails without the fix.
- **Add-ons**: neither Nacho 1.6.4 nor Pokermon+ ships any of these 20. Nacho 1.7.9's own Smoliv line is deprecated there in favour of
  base (batch 18), so there is no family to unify.
- **Art**: no new art files.
  - Every new joker draws its 3.9.1 card from `AtlasJokersBasicNatdex-391.png` (and its Shiny twin), vendored in batch 5. Hisuian
    Qwilfish draws `AtlasJokersBasicGen02-391.png` {2,5}.
  - The test checks that each crop and its Shiny twin hold real, distinct pictures (Hisuian Qwilfish and Overqwil too).
  - The retired Micatro-made `hisuian_qwilfish.png` / `hisuian_qwilfishShiny.png` stay in the gitignored assets; nothing names them.
- **Tests**: `micatro/tests/mods/pokermon_391_new_15_test.mjs` gives 4 passed / 36 failed on origin/main (9a00cd8f), 5 / 36 on sub-batch 14
  (04e5cfdd), and 136 / 0 here (135 / 1 with Zangoose's Hook fix reverted).
  - It fires every joker through real plays and each evolution (above): Munna's Foreseen cards and Moon Stone, Musharna's Foresight
    per Psychic joker, the Klink line's draws and payouts, the Axew line's doubled / tripled hands, Bunnelby / Diggersby's depleted draws
    ("Nope!" too), Drampa in the shop (upgraded packs, the next shop's rolls, the extra slot, sold), the Smoliv line's sell values,
    Bramblin's Seed card and rank of the round, Rellor / Rabsca with real Poke Balls (and a Tarot that doesn't count as an Item), and
    Zangoose against The Hook.
  - It also checks the overlay, the order, the pools (shop rarity pools, one per family, the Gen 5 option), the families, the deferred
    Mega, the text, Hisuian Qwilfish's 3.9.1 card and its evolution, Qwilfish's lack of one, and the art.
  - Count pins updated: `pokejokers_18` / `20` / `21` / `22` / `26` / `31` / `32_test` (13 / 13 / 13 / 5 / 2 / 10 / 11 defs),
    `pokermon_391_data_test` / `modpin_test` / `micatro_mod_version_pin_test` (rev 12), `pokermon_391_new_14_test` (`new_deferred` holds
    Drampa now), `smods_seams_test` (`modify_hand`), `engine_polish_test` (Hisuian Qwilfish's card).
  - Re-run and passing: every `micatro/tests` Node suite (all mods) and `micatro_engine_test` (96 suites; fuzz vanilla 40 runs / 5937
    actions, Pokermon 24 / 3646, all mods 16 / 3366).

### New jokers, sub-batch 15b (upstream main, after 3.9.1)
Pinned **`3.9.1+r13`** (`contentRev: 13`). The last sub-batch of the new-jokers stack: the **9 jokers upstream added on its `main` branch after
the 3.9.1 release**. They are Lotad / Lombre / Ludicolo, Mawile, Electrike / Manectric, Cryogonal and Greavard / Houndstone. The source is
InertSteak/Pokermon (GPL-3.0) **main @ `af0b656cb1d871d541b643b85d97d40caaf0c4b7`** (2026-10-19, "Added Solrock/Lunatone";
`Pokermon.json` version **"3.9.1-1016a"**). That is the newest main commit, and all 9 are in it. Their code is the same as at the plan's
2042690 (2026-10-17): the only later commit adds Solrock / Lunatone. Each is in the pools by its rarity:
- Common: Lotad, and Electrike (only with a Gold card in the deck: `enhancement_gate`).
- Uncommon: Mawile, Greavard.
- Rare: Cryogonal.
- Safari: Lombre, Ludicolo, Manectric, Houndstone.

- **How they come in** (the sub-batch 11 pipeline, plus a second extract):
  - Extract the main tree with the same extractor and spec:
    `NODE_PATH=<fengari> node tools/micatro/extract_mod_data.cjs <Pokermon main @ af0b656> <tmp>/pokermon_main.js tools/micatro/specs/pokermon_391.json`.
  - Then `node tools/micatro/gen_pokermon_391_overlay.mjs <tmp>/pokermon391.js <tmp>/pokermon_main.js`.
  - The spec's new **`upstream_main`** `{repo, commit, version, date, new_jokers {"15b": [names]}}` names the jokers to take.
  - From main the generator reads **only those jokers**: the whole static item, the Joker loc entry, the pokespriteload.lua sprite, the
    family and the file order (`after`). They join `data391.js new_jokers` marked `upstream: 'main'`, and `data391.js upstream_main` records
    the pin.
  - The generator refuses a name that 3.9.1 already has, one missing from main, and one listed twice.
  - Everything else still comes from the 3.9.1 extract.
- **The version**: `version` stays **'3.9.1'**, and `contentRev` 13 counts the 9 jokers. Why:
  - The pin is `version + '+r' + contentRev`, and `pinLabel` shows "3.9.1 (rev 13)".
  - Moving to "3.9.1-1016a" would claim all of main, but we take 9 jokers and none of main's other changes (below).
  - The prompt would also read "Pokermon 3.9.1 (rev 12) → 3.9.1-1016a (rev 13)", which suggests two different releases.
  - Bumping contentRev alone still changes the pin, so the "Mod updated" prompt and the replay banner fire for every run or replay
    recorded at rev ≤ 12, as with every other sub-batch. Their wording stays readable: "Pokermon 3.9.1 (rev 12) → 3.9.1 (rev 13)".
  - The upstream commit is in data391.js (`upstream_main`), its `source` line, and here. `LEGACY_MOD_VERSIONS` is untouched.
- **The jokers** (numbers from data391.js; behaviour line for line from main):
  - **Lotad / Lombre / Ludicolo** (jokers/pokejokers_09.js, _10.js), "the beat":
    - The jokers pay when the played hand has exactly `G.GAME.poke_beat` cards (unset = 2). Main's `pokermon.change_beat` swaps the beat
      2 <-> 4 after every scored hand, from the mod's own calculate (`after`, next to the Poli suit): `systems/utils.js poke_change_beat`,
      called by `systems/rules.js calculate`.
    - Lotad: $1 or $2 (a coin flip, seed 'lotad'); evolves into Lombre in 4 rounds.
    - Lombre: $2 (its money fractions roll with Lotad's seed, as the Lua); evolves into Ludicolo with a Water Stone.
    - Ludicolo: +1 Energy Limit (main's `poke_energy_plus` is our `energy_plus`), and an Energy card (must have room).
    - Lotad / Lombre pay through `dollar_buffer`, as Wingull does.
  - **Mawile** (pokejokers_11.js): a first hand of the round of exactly 1 card puts a Steel copy of it in hand (`before`, `poke_add_card`)
    and destroys the played card after scoring (`final_scoring_step` marks it, `destroy_card` removes it). It jiggles until the round's
    first hand.
  - **Electrike / Manectric**:
    - Electrike: each scored Gold card earns $3; evolves after scoring 15 Gold cards.
    - Manectric: each scored Gold card earns $4. The first Gold card of the scoring hand comes back to hand after scoring (`before` marks it;
      the `stay_flipped` context's `modify.to_area`, as Claydol's).
  - **Cryogonal** (pokejokers_21.js): scoring face cards become Glass cards before scoring.
  - **Greavard / Houndstone** (pokejokers_33.js): a played card whose rank is depleted (none left in the deck: `get_depleted`) or that has
    no rank is retriggered once. Greavard evolves in 5 rounds. Houndstone: +2 discard selection limit (`change_discard_limit`; it unhighlights
    the hand when it leaves, as the Houndour line's limit does).
- **Evolutions**: Lotad -> Lombre -> Ludicolo (Water Stone), Electrike -> Manectric, Greavard -> Houndstone. Families from main's
  pokefamily.lua: those 3 lines. Mawile and Cryogonal stand alone.
- **Megas**: there is nothing to defer. Upstream main has **no** Mega Mawile or Mega Manectric joker: only their pokespriteload.lua
  sprites (`AtlasJokersBasicGen03` {10,4} / {4,5}, with souls) and dex_order entries. Mawile and Manectric have no `megas` field.
  - Unlike Drampa's, nothing is dropped (`new_deferred` holds only Drampa).
  - When upstream writes those Megas, they belong with batch 16. The Gen 3 sheet cells are already vendored (batch 5).
- **Seams / shared changes** (only the small shared code these jokers need):
  - `systems/utils.js poke_change_beat`, and `systems/rules.js calculate` calls it.
  - `systems/attributes.js`: main's new `deplete` attribute (Greavard / Houndstone). Main's other new key, `draw`, waits for its jokers.
  - The spec's `loc_extra` adds `Other.depleted`, the Greavard / Houndstone tooltip. It also fixes Relicanth's (sub-batch 14), which named the
    key with no text behind it.
  - Generator: `upstream_main` and the second extract (above).
- **Deviations / kept quirks**:
  - **Cryogonal's message** is `localize('Gem_glass')`, a key in no upstream localization file. Balatro shows "ERROR"; our localize returns
    the key ("Gem_glass"). It is kept as in the Lua, as an upstream bug. A fix (e.g. "Glass!") would be our own text.
  - **Mawile** fires a second `playing_card_added` with `cards = { card_copied }`, a name the Lua never sets, so the list is empty.
    `poke_add_card` has already told the jokers about the copy. So a joker that counts every `playing_card_added` (without reading `cards`)
    counts the copy twice, as in the Lua. Ours goes through `calculate_context`, which reaches mod jokers; vanilla Hologram reads `cards[1]`,
    so it is unaffected either way.
  - Mawile sets `to_be_removed_by = nil` on the card it destroys, as in the Lua. Ludicolo's inline `loc_txt` matches its en-us entry, which is
    the one used.
  - Electrike's text counts down with `max(0, 15 - scored)`. A Blueprint copy of Electrike pays but does not count, as in the Lua.
- **Add-ons**: no overlap.
  - Neither our Nacho 1.6.4 nor our Pokermon+ 1.0.3 ships any of these 9 (or a Mega of them).
  - Neither does upstream's newest: NachosPokermonDip main @ 904ae39 ("1.7.9-5", 2026-10-19), PokermonPlus main @ 52c7416 ("1.2.0-261018a").
  - No family to unify, nothing for the dedupe step.
- **Art**: **no new art files**.
  - Main changed no asset since 3.9.1 (`git diff --stat 3.9.1 af0b656 -- assets` is empty). The 9 cards were already drawn on the 3.9.1
    sheets vendored in batch 5: `AtlasJokersBasicNatdex-391.png` and `AtlasJokersBasicNatdexShiny-391.png`.
  - Cells: Lotad {28,17}, Lombre {0,18}, Ludicolo {2,18}, Mawile {4,20}, Electrike {16,20}, Manectric {18,20}, Cryogonal {28,40},
    Greavard {20,64}, Houndstone {22,64}.
  - The test checks that each crop and its Shiny twin are real, distinct pictures. A crop sheet showed all 18 as finished upstream cards.
  - `tools/micatro/compose_pokermon_joker_art.mjs` (new) applies the owner's rule for a joker with **no** upstream art. None of these 9
    needs it, so it is not wired in.
    - **How it builds a card:**
      - Frame and scene: the per-pixel majority of sibling cells with the same frame and scene. It skips cells whose dot pattern is offset,
        and pulls in extra votes from same-scene cards on the sheet.
      - Name: drawn in upstream's own banner font, extracted from 822 cards.
      - Pokémon: the site's battle sprite (`overworld/data/pokemon/<species_index sprite>`), trimmed and scaled by a whole number
        (nearest-neighbour). It is placed by measurements from 65 real cards and given a 1 px dark outline (`--no-outline` turns it off).
      - Shiny: the Shiny sheet's frame, with the sprite through battle.js's `hue-rotate(150deg) saturate(1.3)`.
    - **Output:** `<name>.png` / `<name>Shiny.png` (142x190). It never overwrites a file without `--force` and refuses the asset folders.
    - **Proof:** Lotad, with its own cell excluded from the inputs. The frame and name match upstream; the Pokémon reads softer than a
      hand-pixelled sprite, and the Shiny colours are the battle filter's, not upstream's. Always look at the result before shipping one.
- **Known upstream drift** (main 3.9.1..af0b656, **not taken**; for a future rebase onto a main release):
  - **New jokers**: Solrock / Lunatone (af0b656).
  - **Fixes / tweaks to jokers we have**:
    - Togetic's Lucky gate (83b332f), Crobat's scoring sound (5277b5f), Espeon's suit check (da5d801).
    - Bidoof blueprint-incompatible (81cad63), Mega Blastoise's hands (3b3b9da).
    - Magmortar's scaling off The Hook (3acb8e9), Porygon-Z's Bird Energy (d21827a).
    - Beheeyem / Sharpedo (5272470), Zangoose (7cb74ce), the Bunnelby line refactor (39c33f5), Pumpkaboo line sanity check (60b1981).
    - Attributes on the remaining jokers (374b0bc), e.g. Surskit / Masquerain.
  - **Systems**:
    - The Silver Seal refactor (7ba51bb) and its `pokermon.draw_cards` / `discard_cards` helpers + lovely patch (2ce6bc7).
    - The Seed card refactor and its pack visual fix (cda94e9, ca769c6), Minor Item update (c9b80b0), Leftovers not hidden (ef4cb61).
    - Drain fixes: `nominal_drain` in `total_chips`, no drain on Stone cards (33ba3aa).
    - `create_consumeable`: no consumable buffer for a Negative.
    - `backend_evolve` floating sprite / memory leak (807b731) and evo-item jiggle eval (2042690), the `draw` attribute.
  - **Text and other files**: en-us text size standardisation (58d2f88), the Vanillite line banned from Nuzlocke (a37379f), the Series A
    alt-art music checks (68b18e2), Thunderstore files (fbb5ef5).
- **Tests**: `micatro/tests/mods/pokermon_391_new_15b_test.mjs` gives **3 passed / 25 failed** on origin/main (9a00cd8f) and on sub-batch 15
  (8baee622), and **92 / 0** here.
  - It fires every joker through real plays:
    - the beat swapping after every hand; Lotad / Lombre paying on and off the beat; Ludicolo's Energy (with and without room) and its
      Energy Limit;
    - Mawile's Steel copy and the destroyed original (first hand only, 1 card only);
    - Electrike's $3 pops; Manectric's $4 and the Gold card back in hand;
    - Cryogonal's Glass faces (scoring only);
    - Greavard's retriggers (depleted rank, Stone card); Houndstone's 7-card discard and limit.
  - It fires every evolution: Lotad -> Lombre, Lombre -> Ludicolo with a real Water Stone, Electrike -> Manectric, Greavard -> Houndstone.
  - It also checks the overlay and pin, the version label, the order, the pools (shop rarity pools, the Gold gate, one per family,
    the Gen 9 option), the families, the absent Megas, the text and the art.
  - Count pins updated:
    - `pokejokers_09` / `10` / `11` / `21` / `33_test` (31 / 27 / 24 / 14 / 7 defs); `pokermon_391_new_11` / `12` / `15_test` (their defs).
    - `pokermon_391_new_11`–`15_test`'s 3.9.1 order checks skip the main jokers between two 3.9.1 neighbours. For example, the Lotad line now
      sits between Dustox and Seedot, and Electrike / Manectric between Medicham and Plusle.
    - `pokermon_391_data_test`, `modpin_test` and `micatro_mod_version_pin_test` (rev 13).
  - **Fixture shim**: `micatro_runsync_test`'s Pokermon fixture diverged at move 58 ("nothing to cash out"), because Cryogonal (Rare) and
    Greavard (Uncommon) changed its shop rolls. The test now also serves `pokejokers_21.js` / `_33.js` as of 9a00cd8f (the merge before
    the stack), so those jokers stay unported for the fixture, as the 09-17 ones already were. With that it passes 81 / 0 (it was 76 / 5).
    `micatro_resume_win_badges` needed nothing.
  - Re-run and passing:
    - every `micatro/tests` Node suite;
    - `micatro_engine_test` (97 suites; fuzz: vanilla 40 runs / 5937 actions, Pokermon 24 / 4248, all mods 16 / 3076);
    - `micatro_runsync_server`;
    - in the browser, one at a time: `designwiki_micatro_mods` (295 / 0, wiki data regenerated), `micatro_mod_version_pin` (47 / 0),
      `micatro_resume_win_badges` (28 / 0) and `micatro_runsync` (81 / 0).
  - A browser screenshot showed all 9 in the joker row on their upstream cards (Shiny Ludicolo / Manectric / Houndstone).

### Add-on dedupe (Pokermon precedence)
Owner rule (2026-10-20): **base Pokermon wins any conflict** with Nacho's Pokermon Dip or Pokermon+. The last step before checkpoint 1.
Pins: **Nacho `1.6.4+r1`**, **Pokermon+ `1.0.3-251101e+r1`** (both declare `contentRev: 1` now; `LEGACY_MOD_VERSIONS` untouched).
Pokermon stays `3.9.1+r13`: alone, it plays exactly as before. Every change shows only with an add-on on, and that add-on's pin moves.

- **The duplicates** (a script check of every registered joker of the three mods, by `name` and by display name; the test keeps it):
  exactly 12.
  - Nacho: `j_nacho_ralts`, `kirlia`, `gardevoir`, `gallade`, `swablu`, `altaria`, `bagon`, `shelgon`, `salamence`.
  - Pokermon+: `j_sonfive_nincada`, `ninjask`, `shedinja`.
  - Nothing else: Nacho and Pokermon+ share no joker.
  - Distinct forms stay, with nothing to dedupe: Nacho's Galarian Meowth, Hisuian Sneasel / Zorua / Zoroark / Sliggoo / Goodra.
  - Nacho's Megas stay too (Mega Gardevoir / Gallade / Altaria / Salamence / Audino): base Pokermon has none of them.
- **The rule** (`systems/precedence.js`): an add-on joker is a duplicate when Pokermon registers a ported joker of the same `name`
  (`replaced_by`). It is detected, not listed, so batch 16 (Megas) and batch 18 (Nacho 1.7.9) keep applying the rule with no new
  table. If Pokermon gets its own `mega_gardevoir`, Nacho's becomes a duplicate too.
- **Out of play**:
  - `mark_precedence(centers)`: each add-on calls it on its centers before `registerMod`. It stamps `poke_replaced_by` (static, so
    the wiki generator and the deck editor read it without importing Pokermon). It wraps `in_pool` to false, so the engine's pools
    never offer a duplicate: shops, Buffoon packs, rarity Tags, create_card.
  - `pools.js` puts a `POKE_POOL_RULES` entry first: the random-Pokémon picks call `pokemon_in_pool` directly (Poké Balls, Zorua,
    Transformation, the randomizer...).
  - A Showman / Pokédex held doesn't lift it (the rules run before those).
  - Why not `centerActive` / `mod_option` (Nacho's line toggles)? They would turn an OWNED duplicate off mid-run. The duplicates stay
    active centers: an owned one keeps scoring as it did.
- **Evolutions retarget** (`precedence_key`):
  - `poke_evolve` and `poke_backend_evolve` (the funnel for level / item / scaling / deck evolutions, the Rare Candy's highest evo,
    devolution) swap a duplicate target for Pokermon's key. So a legacy `j_nacho_ralts` evolves into `j_poke_kirlia`, a Kirlia with a
    Dawn Stone into `j_poke_gallade`, Bagon into `j_poke_shelgon`, and Pokermon+'s Nincada into `j_poke_ninjask`.
  - Pokermon+'s Nincada leaves Pokermon's Shedinja (its `smods_create_card` key goes through `precedence_key`).
  - Nacho's Passimian receives the evolved ability, now Pokermon's (`EVOLVE_INTERCEPTS` sees the retargeted key).
  - `family_win_keys` maps its keys the same way, so the earlier-stage win stickers a legacy card earns go to Pokermon's jokers.
  - The family lists were already unified (sub-batch 11: the add-on `add_family` joins the 3.9.1 family). They are unchanged.
- **Megas carry over** (`addon_megas`, items.js): a Pokermon joker that replaced an add-on joker gets that joker's active Megas.
  - So a Mega Stone on Pokermon's Gardevoir / Gallade / Altaria / Salamence gives `j_nacho_mega_*`, exactly as from Nacho's.
  - The Mega Stone pool, the target pick and `used_on` read it (`hasMegas`).
  - Two such Megas would pick at random with seed `megastone_<name>`, as `mega_for` does.
  - Nacho's Ralts / Swablu / Bagon line toggles still gate their Megas.
  - The Mega devolves through `get_previous_evo` (`j_nacho_gardevoir`), retargeted to Pokermon's Gardevoir.
- **Kept registered (legacy definitions, not aliases)**:
  - `mods/aliases.js` `renamed` only acts once the old key is NOT registered. `removed` greys the key out as a "retired card". Neither
    fits a key that still loads and plays, so no alias entry.
  - A save, replay, custom deck or challenge that holds the key re-simulates with it (the test replays a custom-deck recipe with
    `j_nacho_ralts` and fires it).
  - A win sticker on it still shows its own name, text and art (and counts toward Pokermon's twin: follow-up 4 below).
  - Pokermon+'s Wonder Guard challenge still starts with its eternal `j_sonfive_shedinja` (its rule is built around that card).
  - When Nacho 1.7.9 (batch 18) deletes the keys upstream, that batch decides between `renamed` aliases and keeping these legacy
    definitions. **Decided in batch 18: keep the legacy definitions** (micatro/mods/nacho/PORTING.md "Retired keys"): an alias
    would swap an owned card's 1.6.4 behaviour for Pokermon's mid-save and drop the sticker merge's static table; the legacy
    keys stay registered, out of every pool. Only the keys 1.7.9 RE-KEYED (Nacho's three Megas, its Elite stake) are aliases.
- **Nacho 1.7.9 (batch 18)**: no 1.7.9 joker is a Pokermon joker (a script check by name, in `nacho_179_test`), so the duplicate
  set stays 12. Nacho's Mega Gardevoir / Altaria / Gallade are re-keyed into Pokermon's namespace (`j_poke_mega_*`, registered by
  Nacho) and attached to Pokermon's Gardevoir / Altaria / Gallade with `attach_mega` (below): `addon_megas` lists them while they
  are active. 1.7.9 dropped Mega Salamence: Pokermon's Salamence has no Mega any more (the legacy `j_nacho_mega_salamence` stays
  registered for old saves).
- **Collection / Pokédex / wiki / editor**:
  - The Pokédex family view shows Pokermon's card for a duplicate and, for a Mega only the add-on has, the add-on's card (Pokermon's
    Ralts line shows Nacho's Mega Gardevoir / Mega Gallade). The card you opened it on is always itself (`family_display_key`).
  - The design wiki lists no duplicate (`ownCenters` and rarity art skip `poke_replaced_by`). The Nacho / Pokermon+ feature lines
    and descriptions name what Pokermon took over. The data is regenerated; `designwiki_micatro_mods_test` skips them in its
    registered set and checks that none is listed.
  - The deck editor's joker pickers skip them. A deck that already holds one still loads.
- **Follow-ups (owner calls, 2026-10-20)**:
  1. An owned legacy duplicate evolves into Pokermon's card (as above). Kept.
  2. The Wonder Guard challenge keeps Pokermon+'s own Shedinja (as above). Kept.
  3. **Pokermon+'s "Nincada line" option is hidden.** It only gated Pokermon+'s Nincada / Ninjask / Shedinja, which are out of
     every pool anyway, so it did nothing. The option is declared `hidden: () => <the three are replaced_by>` (always true:
     Pokermon+ requires Pokermon). `modOptionList` (js/mods/index.js, with `optionHidden`) leaves a hidden option out, so the
     Mods panel, the "Active mods" box and the design wiki (regenerated) don't list it. The value is still declared, filled
     with its default by `activateMods` and read by `opt()`: a saved selection or recipe with `nincada: false` loads as before.
  4. **Win stickers merge at read time.** A sticker stored on a legacy key counts toward its Pokermon twin: a Nacho Ralts win
     is a Ralts win.
     - The map is `micatro/js/mods/superseded.js` (`SUPERSEDED`, `supersededBy`, `supersededFrom`): a static table GENERATED
       from the same detection (`node tools/micatro/gen_superseded.mjs`, which loads every shipped mod and keeps each key
       `replaced_by` returns). Static because `stickers.js` runs where no mod loads (the design wiki, a spectator before the
       mods arrive) and has no engine imports. `addon_sticker_merge_test` fails when the table drifts (`--check` too).
     - `stickers.js` `recordOf` (behind `winRecord`, `winLevel`, `winStickerInfo`: the joker in game, the collection / Pokédex)
       max-merges, per category, the legacy keys' records into the twin's (the renamed-alias merge already
       worked this way). Only one way: the legacy key keeps showing its own record.
     - Nothing stored changes: no migration, no row rewritten, the account's max-merge untouched.
     - **Revocations still win**: a category revoked on the twin (the account's `revoked`) is never filled from a legacy
       key, whatever the legacy key holds. The legacy key's own (unrevoked) sticker stays.
     - **Spectate / replays**: `stickerMap` sends each key's MERGED record (so a player holding Pokermon's Ralts shows their
       old Nacho Ralts win). `stickerRevokedMap` adds the revocations of the twins on the table (`view.win_stickers_revoked`,
       `recipe.win_stickers_revoked`, nearly always absent), and `setStickerSource(map, revoked)` respects them when the
       viewer merges a legacy card on the same table. An older snapshot / replay (raw records) is merged on the viewer.
     - **Recording: on both keys** (`recordWin`). A win holding `j_nacho_kirlia` raises `j_nacho_kirlia` and `j_poke_kirlia`.
       Why both, not "map to the twin only": the legacy card keeps its own history (it still names, draws and wears its
       sticker), and the twin's own record gets the win WITH its earn time, so the re-earn rule works unchanged (a win
       after a revocation's `at` is stamped on the twin, pushed with `earned`, and the server accepts it). Mapping only
       would leave the legacy card you won with bare. The read-time merge alone can't do the re-earn (it skips revoked
       categories), and a merge read-only would never reach the account row.
     - Server: nothing changes. No server code reads the sticker rows to decide anything (the badges come from the run,
       not from stickers); `micatro-stickers-get / -put` store and merge raw keys as before.
     - The design wiki branch (`feat/designwiki-win-stickers`) draws the signed-in player's stickers via
       `setStickerSource(withoutRevoked(row.wins, row.revoked, row.earned))`: it gets the merge with no change. To keep a
       revoked twin category from coming back on a page that also shows the legacy card, it should pass the revocations:
       `setStickerSource(map, row.revoked)`. `withoutRevoked` / `revokeFrom` touch `applyRevoked`, which this change
       doesn't: no textual conflict expected (both edit the header comment and the section around `setStickerSource` /
       `stickerMap` only on this side).
- **Kept Nacho behaviour fixed**: Nacho's Altaria rule ("9s can't be debuffed") used `find_joker('altaria')`, which matches by name and
  so also fired for Pokermon's Altaria. It is Nacho's Altaria only now (key check). On main there is no Pokermon Altaria: no change
  there.
- **Tests**: `micatro/tests/mods/addon_dedupe_test.mjs` gives **55 passed / 34 failed** on the branch before this step (371428ce, sub-batch
  15b), and **121 / 0** here.
  - The inventory.
  - 24 seeded runs × every rarity × create_card / get_current_pool / get_random_poke_key (stages × types, with Showman / Pokédex
    held), plus real shops rerolled: no duplicate ever, and at least 8 of their Pokermon twins seen.
  - Every legacy line's evolution, the Shedinja, the evolve funnel and the unified families.
  - The Mega Stone on each of the 4 (and back), with Nacho off, and with Nacho's Ralts line off.
  - A custom-deck recipe with `j_nacho_ralts` + `j_sonfive_shedinja` replayed and fired, and the Wonder Guard challenge.
  - Names, text, art, aliases and stickers of every duplicate.
  - The Pokédex view and the pins.
  - Updated for the new behaviour:
    - `nacho_test`: the lines evolve into Pokermon's, and each legacy stage is swapped in to keep firing it. Audino / Passimian receive
      Pokermon's Kirlia.
    - `pokermonplus_test`: Nincada -> Pokermon's Ninjask + Shedinja; the line is out of the pools.
    - `modpin_test`: Nacho `1.6.4+r1`.
    - `designwiki_micatro_mods_test`.
  - **Follow-ups 3 + 4**: `micatro/tests/mods/addon_sticker_merge_test.mjs` gives **10 passed / 19 failed** on 54bdebde (this
    section's checkpoint) and **38 / 0** here: the static table = the detection; a legacy Nacho Ralts win shows on Pokermon's
    Ralts (in game and in the collection); max per category; the legacy key keeps its own record; nothing stored is
    rewritten; `stickerMap`; a new legacy win recorded on both keys with the twin's earn time; revocations (a category, a
    whole key, one with `at`, and the re-earn by a new legacy win, pushed); a watched player's map with and without their
    revocations; the hidden Nincada option (its value still read).

### The Megas (batch 16)
Pinned **`3.9.1+r14`** (`contentRev: 14`). The **11 Megas 3.9.1 adds**, with the Mega Stone's 3.9.1 rules, the Mega Berry Juice and the Mega
Deck / Sleeve changes. The plan's "12 Megas" counted Mega Steelix, which the port has had since 3.2.1 (on 3.9.1 since batch 10).

- **How they come in** (the sub-batch 11 pipeline):
  - The spec's `new_jokers` "16" lists the 11 Megas. The 3.9.1 extract is unchanged:
    `node tools/micatro/gen_pokermon_391_overlay.mjs <3.9.1 extract> <main extract>`.
  - Each Mega takes its whole 3.9.1 static data, sprite and text, and is inserted after its base (3.9.1's file order).
  - **The Mega links**: the generator now takes a reworked joker's 3.9.1 `megas` list (`data391.js jokers[name].megas`; 9 of them: Raichu,
    Clefable, Victreebel, Starmie, Dragonite, Meganium, Feraligatr, Skarmory, Lucario). Drampa's comes back with its whole item now that
    `new_deferred` is empty.
    - The generator fails when a `megas` entry names a joker the port doesn't register.
    - Lucario and Skarmory left `rework_deferred`.
- **The Megas** (rarity `poke_mega`: never in a pool; reached with a Mega Stone or the Mega Berry Juice; numbers from data391.js):
  - **Mega Raichu X** (jokers/pokejokers_01.js): +$25 interest cap while held. Each hand earns the interest you would get now (`dollars`).
  - **Mega Raichu Y**: +1 Mult per $1 you have.
  - **Raichu's X / Y choice**: Charizard's and Mewtwo's rule (`getMega_by_position`): the leftmost Raichu becomes X, the rightmost Y, one in
    between picks at random. Raichu shows the "XY Mega" tooltip while a Mega Stone is held.
  - **Mega Clefable** (_02): +X0.03 per Club drawn this round (`scale_card` on the `hand_drawn` cards). Each scoring Club gives X(1 + that).
    Resets at end of round.
  - **Mega Victreebel** (_03): every played even card is retriggered, and every Purple Seal card (both: twice). Comes holding a Medium.
  - **Mega Starmie** (_05): in a 2-card hand, each scoring Diamond gives X2.5 and $5 (`dollar_buffer`).
  - **Mega Dragonite**: +55 Mult. A 1-card final hand is retriggered once per card held in hand.
  - **Mega Meganium** (_06): the first held card of each suit earns $2, and is retriggered if it did anything (so it pays twice).
    `systems/utils.js get_first_of_each_suit` ports 3.9.1's suit matching (a Wild card gives way to a plain card of its suit).
  - **Mega Feraligatr**: +15 Chips per played card this round (`before`). Each Dragon joker gives those Chips (`other_joker`). Resets at
    end of round. Comes holding a Dragon Scale.
  - **Mega Skarmory** (_08): +1 Hazard layer and limit (as Skarmory). Each scoring Hazard card gives X(1 + 1 per held Steel or Gold card).
  - **Mega Lucario** (_15): with 3+ different editions among the cards held in hand, every held card gives X1.6.
  - **Mega Drampa** (_26): +1 Booster Pack in the shop and +1 choice in every pack; shop packs are always Mega (the `get_pack` hook already
    checked for it). It changes `extra_boosters` directly, so mega evolving from Drampa doesn't stock an extra pack.
- **The Mega Stone, 3.9.1** (`systems/items.js`, consumables/mart1.js):
  - **`used_on` is the Mega's card**: its `unique_val`, not its center key. So two Mega Clefables are told apart, and selling a stone reverts
    its own Mega, never the twin.
  - **A used stone targets only its own Mega** (3.9.1 `get_mega_target`), to revert it. Before, it could Mega Evolve a second joker.
  - **At every end of round a stone whose Mega is gone forgets it** (sold, destroyed, reverted another way) and is free again.
  - Reverting says "Reverted" (3.9.1 `pokermon.devolve`). The tooltip names the Mega the stone made.
  - Kept: the house rule "the highlighted joker if it qualifies, else the leftmost that does" (3.9.1 stops at a highlighted joker that
    doesn't); the pack / shop checks; Nacho's `addon_megas`.
  - **Old saves**: nothing stores a stone's ability (a resume or replay re-simulates its recorded actions under the current rules), so no
    save holds a `used_on`. A `used_on` in the 3.2.1 shape (a center key, a string: an add-on's or a test's) is **migrated at read time**:
    `megastone_made` / `megastone_mega` match it as "the first Mega of that key". Nothing rewrites it.
  - **`poke_infinite_megastone`**: the Mega Sleeve on the Mega Deck (its 3.9.1 alt). Every joker with a Mega and every Mega is a target; the
    stone remembers nothing (`used_on = false`); no "Restriction" tooltip.
- **The Mega Berry Juice** (consumables/zberryjuice.js, 3.9.1 06_mart_berry.lua; `AtlasConsumablesBasic-391` {7,7}):
  - Shuckle slicing a Mega Stone gives it (the other consumables still give their flavour). It Mega Evolves the highlighted (else the
    leftmost) joker that has a Mega, for good: no stone remembers it. Never in a pool.
  - The Lua's `can_use` calls `get_mega`, which rolls the X / Y seed for a joker in the middle of the row. Ours only checks that a target
    exists, so the seed is rolled once, on use.
- **The Mega Deck / Sleeve** (backs/backs1.js, sleeves.js): 3.9.1 adds the **Crystal Ball** to both, with the 3.9.1 texts. The sleeve's alt
  on the Mega Deck (no vouchers, stone or shop slot) sets `poke_infinite_megastone` (engine `sleeve.js` `alt`).
- **Base forms**: Raichu, Clefable, Victreebel, Starmie, Dragonite, Meganium, Feraligatr, Skarmory, Lucario and Drampa show the "Mega
  Evolution" tooltip (3.9.1 `add_mega_evolution_tooltip`, with detailed tooltips on).
- **Upstream main Megas**: re-checked at the pinned af0b656. `pokespriteload.lua` has Mega Mawile / Mega Manectric sprites
  (`AtlasJokersBasicGen03` {10,4} / {4,5}) and `dex_order.lua` lists them. No joker defines them, so they are left out. Mawile and Manectric
  have no `megas`.
- **Precedence**: no add-on ships one of these 11 Megas. The dedupe step's script check (every Nacho / Pokermon+ joker by `name` and by
  display name) finds none, and `replaced_by` marks none of them, nor any add-on Mega. The duplicate set stays the same 12. Nacho's Megas
  (Gardevoir, Gallade, Altaria, Salamence, Audino) are other species. Had Nacho shipped one, `replaced_by` would have taken it out of play
  and the Mega Stone on Pokermon's base would give Pokermon's (`megas` comes before `addon_megas`).
- **Add-ons**: Nacho's Passimian reset hook (`MEGASTONE_RESET`, mods/nacho/systems.js) also matches the card's `unique_val`. 3.9.1's own
  end-of-round check frees that stone anyway: a Passimian is not a `poke_mega` card.
- **Art**: **no new art files**. Every Mega draws its 3.9.1 card from the Gen sheets vendored in batch 5 (`AtlasJokersBasicGen01/02/04/07-391.png`,
  with a soul layer, and their Shiny twins).
  - Cells: Raichu X {2,9}, Y {4,9}, Clefable {6,9}, Victreebel {8,9}, Starmie {10,9}, Dragonite {12,9} (Gen 1); Meganium {0,6}, Feraligatr
    {2,6}, Skarmory {4,6} (Gen 2); Lucario {6,6} (Gen 4); Drampa {2,6} (Gen 7). Each soul is the cell to its right.
  - The test checks each card, soul and Shiny crop, and the juice. A browser screenshot showed them in the joker row.
- **Deviations / kept quirks**:
  - Mega Raichu X adds and removes a flat $25 of interest cap, not its config's `interest_cap` (as the Lua).
  - Mega Skarmory has `gen = 1` in 3.9.1. Its sprite names the Gen 2 sheet, so only the Pokédex-generation option reads it: it is a Mega,
    never in a pool.
  - Mega Meganium's `func` (the `dollar_buffer` reset) is queued from `calculate`; the held-card loop reads no `func`.
  - `get_first_of_each_suit` walks the 4 suits in Steamodded's order (the Lua: `pairs(SMODS.Suits)`, no fixed order).
- **Tests**: `micatro/tests/mods/pokermon_391_megas_test.mjs` gives **10 passed / 55 failed** on origin/main (2acf967b) and ****108 / 0**** here.
  - It fires every Mega through a real Mega Stone: Raichu X / Y by position, the interest cap and its revert, Clefable's Club scaling and
    reset, Victreebel's even / Purple Seal retriggers, Starmie's 2-card Diamonds, Dragonite's last-hand retriggers, Meganium's held $,
    Feraligatr's Dragon Chips and Dragon Scale, Skarmory's Hazard X Mult and its revert, Lucario's 3 editions, Drampa's shop and packs.
  - The Mega Stone: `used_on` = `unique_val`, two Mega Clefables, selling a stone, a Mega sold, a legacy `used_on`, and the infinite
    modifier on the Mega Deck + Sleeve. Also the Mega Berry Juice from Shuckle, the Crystal Ball, the overlay, the order, the text, the pools,
    precedence with Nacho + Pokermon+, and the art.
  - Updated for the `unique_val`: `addon_dedupe_test` and `nacho_test` (Passimian). Count pins: `pokejokers_01` / `02` / `03` /
    `05` / `06` / `08` / `15` / `26_test` (38 / 31 / 34 / 38 / 32 / 34 / 16 / 3 defs), `pokermon_391_new_14` / `_15_test` (defs; Drampa's Mega no longer
    deferred), `pokermon_391_reworks_b` / `_c` and `_hazard_test` (`rework_deferred`), `pokermon_systems_test`, `pokermon_391_data_test` (rev 14;
    the juice has no 3.2.1 cell), `modpin_test` and `micatro_mod_version_pin_test` (rev 14).
  - Re-run and passing: every `micatro/tests` Node suite (all mods), `micatro_engine_test` (100 suites; fuzz: vanilla 40 runs / 5937 actions,
    Pokermon 24 / 4387, all mods 16 / 3172), and in the browser, one at a time: `micatro_resume_win_badges` (28 / 0), `micatro_runsync`
    (81 / 0; no fixture shim needed: Megas never enter a pool), `micatro_mod_version_pin` (47 / 0) and `designwiki_micatro_mods` (296 / 0, wiki
    data regenerated).

### Batch 17: the non-Pokédex jokers, April Fools, blinds, Elite, challenges, object_weights
Pinned **`3.9.1+r15`** (`contentRev: 15`). The last batch of the upgrade: everything 3.9.1 adds that is not a Pokémon joker, the
deferred Rival chain and Oologist, and Steamodded's `object_weights`. The 3.9.1 extract is unchanged; `data391.js` regenerated (new
spec keys `new_jokers` "17", `sprite_extra`; new outputs `consumable_spawn`, `challenges`; reworked jokers also take 3.9.1's
`knockoff_starter` / `knockoff_pseudol` flags; `loc_extra` reads `v_text` / `challenge_names` too).

- **The non-Pokédex jokers** (jokers/zotherjokers.js; 3.9.1 zotherjokers.lua):
  - **Rage Candy Bar** (Uncommon, $6): the first hand of each round destroys the top 2 cards of the deck (SMODS.destroy_cards); eaten
    after 3 such hands. 3.9.1 draws it with `placeholder_joker`: ours is a **composed** card (below).
  - **Bitter Rival** (Common, $5; Others {2,2}): the Rival's twin, $25 + $20 per skipped Blind; offered once the Rival is beaten
    (`poke_rival_defeated`), until it is beaten too (`poke_bitter_rival_defeated`).
  - **Champion** (Common, $5; Others {4,2}): X(1 + 0.2 per Blind skipped this run); a Speed Tag (`tag_skip`) per Boss beaten. Offered
    once Bitter Rival is beaten. **The Rival chain** is done: 3.9.1's family `rival, bitter_rival, champion` (data391.js families),
    the in_pool rules are `POKE_POOL_RULES` (the family rule still keeps a member out while one is owned / seen, as 3.9.1's
    family_present; a destroyed Rival clears `used_jokers`).
  - **Imposter Professor** (Uncommon, $5; Others {6,1}, unmasked {8,1} once owned: `form` 1, ui.js face()): after 2 rounds, selling it
    makes a **rental** Pokédex and a **Starter Tag...?**. Offered only while every Starter Pack...? slot has a candidate (3.9.1
    in_pool). **The Professor's own 3.9.1 / 3.2.1 in_pool** (every Starter Pack slot has a candidate) was never ported: added with it.
  - **Oologist** (Uncommon, $7; Others {4,4}): after 3 rounds, selling it makes a Negative Mystery Egg, one more per 3 more rounds.
    **The Mystery Egg's hatch speed-ups** (a held Fire Energy / a Flame Body neighbour: an extra round on a roll, and adjacent / 4)
    now apply while an Oologist is owned (the egg already checked for it).
  - **Daycare** (Rare, $8; Others {2,4}): sold between 2 breedable Pokémon (not Baby, line not Legendary), a Mystery Egg (3 rounds) of
    one neighbour's lowest stage (`get_lowest_evo`). Intended-design fix: a parent whose lowest-stage key isn't registered (a
    non-Pokémon picked as the parent) makes no egg (the Lua's egg would hatch into a missing key). An add-on duplicate's line hatches
    Pokermon's joker (`precedence_key`). Its `update` only labels the Blueprint box in the Lua's UI: not ported.
  - **Repel**: sold, it disables the current Boss Blind (Luchador's check) and makes a D6 Tag. **3.9.1 writes it but never registers
    it** (not in zotherjokers.lua's `jlist`): ours is registered in full (collection, wiki) and **never offered** (`in_pool` false),
    as upstream. Composed card too.
- **The April Fools jokers** (jokers/zzzapril_fools.js; 3.9.1 zzzapril_fools.lua) — **the gate is an OPTION, not a date**: 3.9.1
  registers the file's list only with `pokermon_config.pokemon_aprilfools` (default off); nothing in 3.9.1 reads the clock for them.
  Ours are always registered and offered only with the same option (`pokemon_aprilfools`, "Joke content": the centers' in_pool and
  `POKE_POOL_RULES`, so no random Pokémon pick rolls them either — that also closes the gap for A Billion Lions).
  - **Spiclops** (Uncommon, $10, "Legendary" badge; Others {6,4}): +1 Hazard layer, +4 hand size; a random Seal on every 8th playing
    card added; at Blind select + hand size equal to the Hazard level and -1 discard; a first hand of only Hazard cards + hand size
    per card; a Blue Seal on every third Hazard held at end of round; a Planet of your most played hand per 2 Hazards drawn.
  - **Miror Budicolo** ("Ludicolo", a Water Basic, $1): added, it becomes a **Ludicolo playing card** in the deck and leaves the joker
    row. The card (`m_poke_ludicolo`, enhancements/enhancement1.js): no rank or suit, replaces the base card, always scores,
    "Ludicolo!". Art: miror_budicolo.png's 4-frame animation (8 fps; its Shiny strip for a Shiny one). Its music track is not ported.
  - **Capture Disc** ($4): +1 Mult each time it is **shaken**, reset at end of round. The Lua counts the card's drag distance on
    every drag frame (25 game units x its current Mult per point). That is the player's input, so here it is an **action**: the board
    (js/ui/board.js) records the drag's per-move distances in Balatro units (a card = G.CARD_W = 2.4 x 35 / 41 wide) and sends
    `{type: 'poke_capture_disc_drag', id, segs}` when the drag ends (the view's `drag_tracked`); the mod's `action` hook applies them
    frame by frame as the Lua's card.drag. Recorded in the recipe, so replays / resumes / spectators rebuild it exactly.
  - (A Billion Lions: unchanged, jokers/zotherjokers.js.)
- **The Starter Pack...? and Tag...?** (boosters/packs1.js, tags/tags1.js): a knock-off Grass / Fire / Water starter, Bidoof / Yamper and
  a knock-off pseudo-legendary (3.9.1's `knockoff_starter` / `knockoff_pseudol` flags, now taken for every reworked joker: Bellsprout,
  Ponyta, Slowpoke, Mareep, Hoppip, Sunkern, Wooper, Slugma were missing). Never in a shop / pool; only the Imposter Professor's tag
  opens it. Art: AtlasBoosterpacksBasic {4,1} (as the Starter Pack), AtlasTags {4,0}.
- **The five boss blinds** (blinds/pokebossblind.js, all on SMODS.Blind `calculate`; AtlasBossblinds-391 rows 1-4 and 24):
  The Mirror (ante 3+: the rightmost joker becomes Ditto when the first hand is drawn; an Eternal one loses Eternal), The Rocket
  (ante 2+: with $25+ every card is drawn face down — `stay_flipped`), The Star (ante 3+: one random type per hand, its jokers
  debuffed — `debuff_card` + the `drawing_cards` re-check), Gray Godfather (showdown: -$5 per hand / discard; in debt, a random
  non-Eternal joker is destroyed), White Executive (showdown: as many random cards debuffed as your jokers' + consumables' total sell
  value, source 'white_executive', lifted at end of round / disable). 3.9.1's order (before the Hacker). Their `#1#` HUD numbers are
  live getters (`BLIND_HUD_VARS`). 3.9.1 also writes The Magma and The Aqua but never registers them: not ported.
- **3.9.1's own Iridescent Hacker**: batch 5 kept 3.2.1's Chartreuse Chamber logic under the new key; now 3.9.1's — `debuff_card`,
  `pick_random_types`, `blind.effect.ptypes`, Pokermon `is_type` (a Tera sticker / wildcard counts; 3.2.1 read the base ptype first).
- **The Elite stake** (stakes.js; 3.9.1 stakes/stakes.lua + pokermon.lua's SMODS.is_showdown_ante): applies every stake up to Gold, +2
  win ante, `poke_elite4`: antes > 0 with `ante % win_ante >= win_ante - 3` (7, 8, 9 and 10; 17-20 ...) draw showdown bosses (the
  `boss_eligible` hook; ordinary bosses keep their `min`). Art: elite_stake.png (the chip) / elite_stake_sticker.png. It is a **mod
  stake**, not a 9th level: the engine plays it at Gold's level 8 plus its modifiers (run.js mod_stake_chain) and records its key in
  the recipe (`stake: 'stake_poke_elite'`), so the leaderboard, replays and run badges see it like Nacho's Elite / Pokermon+'s Lilac /
  MoreFluff's stakes. **Win stickers: the ELITE sticker, level 9** (owner-approved follow-up, branch `feat/micatro-elite-sticker`;
  first shipped as Gold): the stake declares `sticker_level: 9` (Nacho's Elite too, while its customStakes option is on), the engine's
  `win` event carries `sticker_level` (run.js `win_sticker_level`: the highest a stake in the run's chain declares, else the stake
  level), and stickers.js records it (levels 1..9; `STICKER_NAMES[8] = 'Elite'`, colour #ba8514 = 3.9.1's Elite stake colour for the
  Pikachu / Aipom / Ambipom / Arceus rings). The plain level-9 sticker is 3.9.1's own art (elite_stake_sticker.png cell 0, copied
  to the git-tracked `micatro/assets/textures/winstickers/elite.png`; `drawOwnSticker`: in game, decks, spectate, replays, the
  wiki), its tooltip 3.9.1's `poke_elite_sticker` text. Note an Elite win always has Pokermon on, so its jokers show the Pikachu
  sticker in the Elite ring; the plain art shows where no special category beats it. Server: `stickerLevel` 1..9, max-merge /
  revocation / re-earn unchanged; an OLD client (no `maxLevel: 9` in its get / put) is answered with 9 shown as 8 (Gold), so it
  neither loses the sticker nor push-loops. Elite wins from before this were recorded as Gold and can't be told apart: no backfill.
  Mod stakes that declare nothing (Lilac, MoreFluff's) still record Gold. **Precedence**: Nacho 1.6.4 ships the same Elite stake (`stake_nacho_elite_stake`;
  Nacho 1.7.9 re-keys to Pokermon's, batch 18); ours wins: Nacho's has `superseded_by` and leaves the New Run picker
  (js/mods/index.js modStakes) but stays registered, so a recipe naming it still plays.
- **The challenges** (challenges.js; data391.js `challenges`, the whole 3.9.1 list): the 7 old ones take 3.9.1's changes (The Mirror
  banned from all but Randomizer; Good As Gold also bans Verdant Leaf; colours; Randomizer's rule renamed `poke_apply_randomizer` —
  systems/evolution.js reads both names), plus:
  - **Delibird Dilemma**: an Eternal Delibird; no blind reward, extra-hand money or interest; Seed Money / Money Tree / To the Moon /
    Rocket / Satellite banned.
  - **Safety First**: an all-Hazard Challenge Deck; Eternal Mudkip, Roggenrola, Bronzor; no shop jokers; **no Energy**
    (`poke_no_energy`: the shop's energy_rate 0 at run start — rules.js reset_game_globals; a Pocket Pack's Energy slot holds an
    Item; the Dragon Scale makes Items only); +3 joker slots; a long ban list.
  - **Mystery Dungeon** (the daily): a random Pokermon deck's effect (3.9.1's 9 non-legacy decks; the Vending deck's through
    `poke_vending`, rules.js evaluate_round) and an Eternal random joker. **Determinism**: 3.9.1 sets the run's seed to "poke_" +
    today's UTC date (lovely/daily_challenge.toml, `os.date("!%d%m%Y")`) and picks the deck with it. Here the **engine never reads the
    clock**: the UI passes today's UTC date at the start (`daily`, js/ui/main.js utcDayStamp), newRun turns it into the run's seed
    `POKE_DDMMYYYY` (challenge.js `daily_seed`; not a player seed), the recipe records that seed, and the deck pick reads the date
    back from the seed. A resume, replay or spectator rebuilds that day's run on any day; no recipe / server field was added.
    The rule text "Resets at <time>" shows the viewer's local time of UTC midnight (3.9.1 froze the loader's). The deck's back
    drawn over the Challenge Deck (pokedraw.lua) is cosmetic: `G.GAME.poke_mystery_dungeon_deck_key` is recorded, not drawn.
  - **Imposter Syndrome**: a Ditto; every non-Colorless joker debuffed (`poke_noncolorless`: the mod-level `debuff_card`); a Ditto
    per Boss beaten, with room (`poke_add_ditto`); The Star / Iridescent Hacker banned.
  - **Mean Look**: +7 Foresight (`scry_amount`), 4 discards; a hand the Foreseen cards also make is debuffed, "<hand> is Foreseen"
    (`poke_unforeseen_hand`: the mod-level `debuff_hand`, `get_poker_hand_info` of the scry view).
  - Two rule texts keep their 3.2.1 keys in 3.9.1's loc (ch_c_no_energy, ch_c_apply_randomizer): aliased for the renamed ids.
- **The Pink Seal 1 in 3**: not a challenge rule — 3.9.1's **Obituary Sleeve alt** on the Obituary Deck (legacy content,
  `pokemon_legacy`): Pink Seals have a 1 in 3 chance to fall off after triggering (`poke_pink_seal_selfdestruct`,
  seals/seals1.js) and a joker sold or destroyed makes a Negative Energy of its type (`poke_obituary_alt`: rules.js
  joker_type_destroyed + index.js sell_card). The **Revenant Sleeve alt** on the Revenant Deck: +3 consumable slots and no Pocket Packs
  (`poke_no_pocket_packs`: their pool weight is 0; 3.9.1's override also returns 1 for every Pocket Pack, the Megas' 0.25 included,
  until a restart — that quirk is not kept). The Pink and Silver Seals themselves move to 3.9.1 (the consumable slot is claimed when
  the seal triggers, `consumeable_buffer`; SMODS.add_card).
- **object_weights is on** (3.9.1 pokermon.lua `optional_features = {quantum_enhancements, object_weights}`): create_card's key, the
  shop roll, tags, packs, bosses and vouchers go through SMODS.poll_object (js/engine/smods.js, batch 4), **and Pokermon's own
  SMODS.poll_seal / poll_enhancement copies** (mart2, zberryjuice, pokejokers_03 / 05 / 15) become poll_object over the Seal / Enhanced
  set, as Steamodded's do with the feature on.
  - **The Soul items' weights** (data391.js `consumable_spawn`, from the extract): Great Ball weight 3 (no longer a hidden Tarot soul),
    Tera Orb 5, Thick Club 1 (no longer hidden), Leek 1, Heavy-Duty Boots 2 (**batch 10's deviation is retired**: an ordinary Item, only
    with a Hazard layer), every other Item 10 (Steamodded's default); Ultra Ball soul 0.008 (was 0.01), Mega Stone 0.006 (0.005).
    **Leftovers stays `hidden` in 3.9.1** with its soul fields removed, so it is a Spectral soul card at Steamodded's default 0.003 and
    never in the Item pool — faithful, though it looks like an upstream slip (the changelog says the Soul items use weights).
  - Jirachi's `negative_edition_rate` on the Edition poll: pokermon.lua's e_negative / e_polychrome get_weight overrides, as a
    `modify_weights` listener in the mod-level calculate (+3 per step to Negative, the same off Polychrome down to 3).
  - `pokermon.modify_pool` (weight 0 for what `remove_from_pool` rules out: the family / gen / hazards rules) is pools.js `pool_filter`,
    which already keeps those out of `get_current_pool`, the pool poll_object draws from: the same picks.
- **The Trainer Deck** is no longer gated by the `pokeballs` option (3.9.1 backs1.lua registers it always).
- **Engine seams** (generic, no-ops for vanilla / other mods):
  - challenge.js `daily_seed` + run.js / session.js `daily` (a daily challenge's date -> its seed; the UI passes it).
  - js/mods/index.js modStakes: a stake's `superseded_by` (another mod's stake took it over) keeps it off the picker.
  - js/ui/board.js: a card view's `drag_tracked` makes the board send that action with the drag's per-move distances.
  - **Mod blind chips** (js/engine/view.js + js/ui/board.js): the blind-select columns and the HUD drew every blind's chip from the base
    sheet at its row (a mod blind showed a vanilla chip: the renamed Hacker's row 25 was Crimson Heart's) and showed a mod blind's
    `name`, which is its key as in Steamodded. The view now carries a mod blind's `atlas` (and `label`, its loc name): its own chip
    animates from that atlas (21-frame rows, as SMODS), and the board shows the loc name. Fixes Bunco's / AutumnCircus' blinds too.
  - js/engine/challenge.js challengeInfo: a banned mod blind is listed by its loc name (not its key).
  - tools/micatro/compose_pokermon_joker_art.mjs: `--sprite` (any sprite file: an overworld item icon), `--label ""` (no banner),
    `--base Sheet:x,y --clear x0,y0,x1,y1` (one card with its picture box cleared: the Others sheet's white JOKER cards),
    `--key-corner` (an icon saved without alpha), and 1 / 2 / 4-bit palette PNGs.
- **Art**:
  - Vendored in batch 5 and now used: `AtlasJokersBasicOthers-391.png` (Bitter Rival {2,2}, Champion {4,2}, Imposter Professor {6,1} /
    {8,1}, Daycare {2,4}, Oologist {4,4}, Spiclops {6,4}), `miror_budicolo.png` / `shiny_miror_budicolo.png` (4 frames), `capture_disc.png`,
    `AtlasBossblinds-391.png` (rows 1-4, 24), `elite_stake.png`, `elite_stake_sticker.png`. (`shiny_capture_disc.png` is not needed:
    a Shiny joker is the Shiny shader over its card.)
  - **Composed** (owner rule: no placeholders; 3.9.1 has none), by `tools/micatro/compose_pokermon_joker_art.mjs`, new files in the main
    checkout's gitignored `micatro/mods/pokermon/assets/2x/`: **`rage_candy_bar.png`** and **`repel.png`** — the Others sheet's white JOKER
    card (Others {8,0} with its rock cleared, box 15,18 - 56,78) + the overworld's GBA item icon (`overworld/item_icons/rage_candy_bar.png`
    with `--key-corner`, `repel.png`), x2 nearest-neighbour, centred and bottom-anchored like upstream:
    `node tools/micatro/compose_pokermon_joker_art.mjs --name rage_candy_bar --sprite overworld/item_icons/rage_candy_bar.png --key-corner --label "" --base Others:8,0 --clear 15,18,56,78 --no-outline`
    (Repel: the same without `--key-corner`). Deploy with `npm run deploy-micatro-mods` before merging.
- **Deviations / kept quirks**: Spiclops' "Legendary" badge is its stage badge (no set_card_type_badge); Capture Disc counts the board's
  pointer moves (the Lua counts frames: both depend on the input's sampling); the Ludicolo card's Miror B. music and cry, the Daycare's
  Blueprint label and the Mystery Dungeon back are cosmetic and not ported; Gray Godfather's debt check uses `dollars + dollar_buffer -
  5` like the Lua (ease_dollars is queued, as there).
- **Add-ons**: Nacho's Elite stake is superseded (above); no Nacho / Pokermon+ joker duplicates a batch-17 joker (precedence.js finds none).
  Other mods' own SMODS.poll_seal / poll_enhancement copies (Bunco, MoreFluff, Nacho, AutumnCircus) keep their pre-weights path when
  they share a run with Pokermon (Steamodded's feature is global: theirs would switch too) — left for their own upgrades.
- **Tests**: `micatro/tests/mods/pokermon_391_batch17_test.mjs` gives **8 passed / 56 failed** on origin/main (2acf967b) and
  **150 / 0** here. It fires every new joker (Rage Candy Bar's top-of-deck destroy and "Eaten!", the Rival -> Bitter Rival -> Champion
  chain through real skips and Boss wins, Champion's X Mult and Speed Tag, the Imposter Professor's rental Pokédex + Starter Tag...?
  opening its pack, the Oologist's eggs and the egg speed-ups with / without it, Daycare, Repel on a Boss, Spiclops, Miror Budicolo's
  Ludicolo card, Capture Disc's drag action), every blind (The Mirror, The Rocket face down / up, The Star and the Hacker re-picks, Gray
  Godfather's -$5 and the debt destroy, White Executive's debuffs), the Elite stake (Gold rules, win ante 10, the showdown antes, the
  picker with / without Nacho, the recipe key), each challenge's setup and rules (Mystery Dungeon: the daily seed from a passed date, the
  same day = the same run, a replay from the recipe), object_weights (the weights, Leftovers, the Item pool with / without a Hazard
  layer, the Edition weights, the Revenant alt), the Obituary alt's Pink Seal and Energy, the overlay and the art.
  - Updated: `pokermon_391_data_test` (rev 15; the Hacker's `blind.effect`; the new blinds have no 3.2.1 cell),
    `pokermon_content_test` (packs 11, tags 7, blinds 6, enhancements 4; the Trainer Deck's gate; the Hacker), `pokermon_391_hazard_test`
    (the Boots' weight), `pokermon_391_reworks_c_test` (`rework_deferred`), `zotherjokers_test` (19 defs), `smods_seams_test` (+ debuff_card,
    debuff_hand, modify_weights wanted), `zmissingno_test` (skips a tag's pack: object_weights rolls other tags), `challenges_test`
    (12 Pokermon challenges, `poke_apply_randomizer`), `modpin_test` / `micatro_mod_version_pin_test` (rev 15), `micatro_challenges_ui_test` (37 challenges with
    Pokermon + BETMMA). `micatro_runsync_test` replays its 3.2.1 fixture: object_weights and the new pool content change its shops, so
    every Pokermon file batch 17 changed is served to it as of batch 16 (commit 8a94bcfe, like its earlier shims).
  - Re-run and passing: every Pokermon / Nacho / Pokermon+ / addon Node suite, `micatro_engine_test` (101 suites; fuzz vanilla 40 runs /
    5937 actions, Pokermon 24 / 3869, all mods 16 / 2587), and in the browser, one at a time: `micatro_resume_win_badges` (28 / 0),
    `micatro_runsync` (81 / 0), `micatro_mod_version_pin` (47 / 0), `micatro_challenges_ui` (55 / 0), `micatro_winstickers` (12 / 0) and
    `micatro_winstickers_categories` (33 / 0), `designwiki_micatro_mods` (296 / 0, wiki data regenerated). No `server/` change.

### Pokermon 3.9.1 upgrade: complete
With batch 17 every 3.9.1 content file is ported: 435 reworked jokers and 121 new ones (data391.js `new_jokers`: 112 from 3.9.1 — 92 in
sub-batches 11-15, 11 Megas, 9 in batch 17 — and 9 from upstream main in sub-batch 15b) plus Repel; the Megas, the Hazard layer / Seed / Flower, the Unown
rework, the Wish Pack, every item, seal, enhancement, deck, sleeve, tag, pack, blind, the Elite stake, the 12 challenges and object_weights.
`rework_hold`, `sprite_hold`, `new_deferred` and `skipped` are empty; `rework_deferred` holds only Porygon-Z (by design). Pinned `3.9.1+r15`.

What remains intentionally different from upstream 3.9.1:
- **House rules / intended-design fixes** (owner): Deino / Zweilous "contains a Three of a Kind"; Energy + Transformation targeting
  (leftmost valid / the highlighted joker); Nuzlocke / Monotype run badges; Jirachi Copy / Negging and Hisuian Qwilfish / Overqwil
  registered (3.9.1 writes them but doesn't register them) — and now Repel (registered, never offered); every "intended-design" comment
  (search "intended"), e.g. the Starter Tag's in_pool, the Daycare's missing-key guard.
- **Kept by design**: Porygon-Z's `energies_used` counter and the old state names (`energy_plus`, `scry_amount`, `extra_pocket_picks`,
  `negative_edition_rate`, `rotom_discount`).
- **Engine shape**: the timing deviations of batch 6 (evolutions at end of round, not 3.9.1's later `evolution` context); `modify_pool`
  as `pool_filter` (same picks); bosses picked by the lovely-path eligibility (showdowns ignore `min`) rather than create_blind_pool's
  min / max (which would keep vanilla's showdowns, min 10, out of ante 8); the soul roll is the engine's per-card one.
- **Not ported yet / left**: (the Pocket Packs' 3.9.1 contents, the Debris Sleeve's alt and the Series A art: done in the
  leftovers batch, "The 3.9.1 leftovers" below); other mods' poll_seal copies under Pokermon's object_weights (above); the Mega Mawile / Mega Manectric sprites
  upstream main has without jokers; upstream main's drift after af0b656 (sub-batch 15b: Solrock / Lunatone ...).
- **Win stickers on Elite**: DONE as a follow-up: the 9th level, Elite (see "The Elite stake" above). Earlier Elite wins stay Gold.
- **Cosmetic only**: animations (`do_evolution_anim`, set_sprites tricks), music / cries (Miror B., Ludicolo, Voltorb Flip), the
  Mystery Dungeon back, the Unown Swarm's glued playing-card front, floating sprites hiding while an item is used, joker displays.

### The 3.9.1 leftovers (2026-10-21, branch `feat/micatro-pokermon-leftovers`)
Pinned **`3.9.1+r16`** (`contentRev: 16`; `LEGACY_MOD_VERSIONS` untouched). The three things the "complete" summary left, from
the 3.9.1 Lua (upstream main af0b656 has the same packs1.lua / sleeve.lua / pokespriteload.lua parts).

- **The Pocket Packs' contents** (boosters/packs1.js; 3.9.1 boosters/packs1.lua): every Pocket pack's `create_card` is
  `create_pocket_card` itself. The Energy slot is unchanged (10% Double Rainbow, else 50% an Energy matching a held joker).
  The other slots are `create_item('pocket')`:
  - 8% (`pseudoseed('pocket_evo_item')` > 0.92) an evolution item from `pokermon.poll_evo_item('match')` (new, systems/items.js):
    the items the held jokers need (a list requirement rolls one), each once, that exist, aren't in play (`used_jokers`) or banned,
    and whose in_pool says yes; one at random. (Lua walks a hash set with pairs(): the port keeps first-seen order.)
  - Else `SMODS.create_card{set = poke_item, soulable = true, key_append = 'pocket'}`: the random Item is seeded per pack and
    can be a hidden (soul) Item.
  - 3.2.1's per-pack `c_keys` list is gone (its configs too: 3.9.1's `{extra, choose}`), and the text counts Steamodded's
    `booster_choice_mod` / `booster_size_mod`.
  - The Mega Stone slot (tag packs, ante 5+) and Safety First's Item-for-Energy slot are as before.
  - Not changed: `generate_pickup_item_key` (Pickup / Treasure jokers) keeps its own evo-item roll; 3.9.1 sends it through
    poll_evo_item too, which would also skip items in play — a separate behaviour change, left for a later batch.
- **The Debris Sleeve's alt on the Debris Deck** (sleeves.js `alt`; 3.9.1 sleeve.lua diceysleeve + pokermon.lua Card:set_ability
  wrap): the sleeve sets only `G.GAME.modifiers.poke_negative_hazards`; the deck's own effect still applies (one Hazard layer, +1
  hand size). With it, a card that becomes a Hazard gets `ability.card_limit` +1 and gives it back when it stops being one
  (backs/backs1.js `debris_hazard_card_limit`, Pokermon's `set_ability` hook). Its alt text is 3.9.1's `sleeve_poke_diceysleeve_alt`
  ("All Hazards give +1 hand size"; spec `loc_extra`). A playing card with a card_limit shows Steamodded's "+N hand size" tooltip
  (`generic_card_limit_pc`, index.js `describe` hook).
  - **Engine seam** (opt-in, the `smods_seams` pattern): `js/engine/smods.js held_card_limit(area)` = the sum of the area's cards'
    `ability.card_limit`, 0 unless an active mod opted in (`smods_seams: true`, or a list naming `'card_limit'`). run.js
    `draw_from_deck_to_hand` counts it into the hand space, and when a drawn card carries card_limit it draws that many more
    straight after (Steamodded lovely/card_limit.toml's draw: the extra slots go to the next cards on the deck); not for a counted
    draw (`e`) or while The Serpent holds the draw to 3. view.js `hand_limit` shows it. Only the slots such cards add are drawn, so
    a run where no playing card has a card_limit is untouched.
  - Fuzz proof (seam-only diff, before any content change), identical to origin/main: vanilla 40 runs / 5937 actions / max ante 13
    / 10 wins; Pokermon 24 / 3869 / 13 / 6; all mods 16 / 2890 / 13 / 5 (same mod activity).
  - Deviation: SMODS also raises the hand's `card_limit` itself (every reader sees it); ours adds it where the hand is filled and
    shown (the draw, the view), so jokers that read the hand size (none in Pokermon) see the base size.
- **The Series A art option** (cosmetic; no rev): 3.9.1's `pokemon_spritesheet_atlas` (a per-profile setting, Basic / Series A)
  as the mod option **`series`** ("Joker art": Basic | Series A, **Basic by default**).
  - `cosmetic: true` options (js/mods/registry.js) never become run options: `activateMods` drops them, so the engine, the recipe's
    `modOptions`, replays and checksums never carry them. The UI reads the VIEWER's own saved value (js/ui/modui.js `cosmetic()`,
    from the saved mod options; bound into mod UIs), so a player, a spectator and a replay viewer each see their own choice — the
    per-profile semantics. The run's "Active mods" box leaves it out.
  - data391.js `series_a` (generated from 3.9.1's PokemonSprites alts: 136 names): the Series A twin sheet of the joker's Basic
    sheet + its base cell (the sheets mirror each other), the alt floating sprite (Gengar, Haunter, Mr. Mime, Noctowl, Mega
    Tyranitar, Chingling, Spiritomb) else the base one, and the 5 animated strips (Bellsprout 24 frames 10 fps, Voltorb 11/11,
    Electrode 13/13, Baltoy / Claydol 32/50). index.js registers `AtlasJokersSeriesA<Gen01-09|Natdex>[Shiny]391` (the -391 files
    for Gen01 / Gen02 / Natdex, the shared files for Gen03-09) and the strips (systems/anim.js `SERIES_A_ANIM`).
  - ui.js `seriesA()`: `face()` (the board), `still()` (collections, the Pokédex, deck editor thumbnails: screens.js `stillData`)
    and `anim()` draw it. Shiny draws the Series A Shiny twin (3.9.1 e_poke_shiny `on_load`: atlas .. 'Shiny'). Zorua's disguise /
    illusion copies the Series A face. Only a joker drawn from its own cell of a Pokermon Basic joker sheet switches: Pokermon's,
    and the add-ons' on Pokermon's sheets — Nacho's (Chimchar, Carbink, Bounsweet, Flapple, legacy Gardevoir) and Pokermon+'s
    (Lechonk, Cetoddle, legacy Croagunk), as 3.9.1's `load_atlas` runs for them; an add-on's own sheet never.
  - Not ported: the per-card override (3.9.1's collection right-click, `pokemon_spritesheet_overrides`), Series B (3.9.1's option
    lists it, its only sheet is Natdex), the artist credits per series, and the alt soul's `apply_edition` (the floating sprite
    takes the edition shader).
  - **Shiny on the Basic series** (follow-up, cosmetic; no rev): a Shiny joker draws the same cell of its sheet's Shiny twin, as 3.9.1's
    e_poke_shiny `on_load` does (`atlas .. 'Shiny'` when that atlas exists; the edition keeps `shader = "shiny"`, so the shader still
    draws on top). ui.js `basicShiny()`, applied last in `face()` and `still()`: the board, spectate / replays, collections, the Pokédex,
    deck editor thumbnails; Kecleon's type card, Unown's letter, Deoxys' forme and Mega souls come off the Shiny sheet too. Zorua's
    illusion follows Zorua's edition, its in-row disguise the copied joker's (copy_joker_sprites). On Series A, a joker with no Series A
    cell gets its Basic Shiny card. Add-ons: Nacho / Pokermon+ jokers on Pokermon's 3.9.1 or 3.2.1 sheets, and on_load's
    `poke_custom_prefix` branch (`<prefix>_shiny_<rest>`): Nacho's Excavator -> `nacho_shiny_excavator179` (vendored, unused till now).
    Every one of the 681 Basic-sheet jokers has a real, recoloured Shiny cell (checked crop by crop). No Shiny twin, so today's card +
    the shader: Rage Candy Bar, Capture Disc, Repel (single-card art), Pokermon+'s `sonfive_other` sheet (Mega Darkrai, Member Card,
    Mystery Box, Canari Plush). Already Shiny through their animation: the Unown Swarm, Miror Budicolo, Terapagos-Stellar's soul.
    Not changed: vanilla jokers made Shiny (3.9.1 swaps them to `AtlasJokersVanillaShiny`; registered here, still unused).
  - Art: nothing new — the 30 Series A files were vendored in batch 5 and are already live on magepunk-micatromods.
- **Tests**: `micatro/tests/mods/pokermon_leftovers_test.mjs` (new; **12 passed / 38 failed on origin/main d3827c0c, 77 / 0 here**)
  fires the packs' slots (the RNG-exact Item draw, the evo item, poll_evo_item's rules, a pack bought and opened), the alt through
  real draws (the dealt Hazard, a draw after a play: 9 + 3 Hazards = 12), the tooltip, the picker text, the opt-in rule, and the
  series option (faces, Shiny, animation, add-ons, stills, the recipe / checksum unchanged, the viewer's saved choice, the art
  crops). Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_391_batch17_test` (the pin).

### The Hazard audit (2026-10-26, branch `fix/micatro-pokermon-hazards`)
Tester reports said Hazards weren't working as intended. Line-by-line against 3.9.1 (enhancement1.lua, pokeutils.lua
add_hazards / change_hazard_*, pokermon.lua's first_hand_drawn deal and set_ability wrap, backs1.lua / sleeve.lua, 04_mart_rare.lua,
every hazard joker in pokejokers_07/08/12/18/20/21/31 + zzzapril_fools) and Steamodded 26.1002 (draw / first_hand_drawn,
calculate_end_of_round_effects, quantum enhancements, card_limit): the GAMEPLAY matches but for one retrigger rule (below, fixed in the
follow-ups: `3.9.1+r18`).
- **Fixed (cosmetic): Pokermon's text colours.** 3.9.1 pokesprites.lua's `pokermon.colours` + its `loc_colour` hook colour every
  `{C:poke_<name>}` / `{X:poke_<name>}`: the "+1 hazard layer" of every Hazard joker / the Debris deck is the hazard bronze
  `#BA7333`, the Pink Seal pink, the types' `{X:poke_grass}` boxes their type colour. Ours knew none of them: `{C:poke_*}` drew the
  default text grey and `{X:poke_*}` a red box. A mod may now register `content.loc_colours` (js/mods/registry.js `LOC_COLOURS`,
  bound into the UI's MODREG; js/ui/markup.js reads it after the base colours); Pokermon registers the 20 of pokermon.colours.
- **Working as 3.9.1 intends** (likely what testers hit; player-facing explanations):
  - Dealt Hazards are NEW cards: they stay in the deck for good and come back in later draws. Only one HELD in hand at the end of
    a round can go (1 in 3); a played or discarded Hazard is never destroyed. "Hold Hazards to the end of the round to clear them
    out; playing or discarding them keeps them in your deck."
  - They take hand slots: 3 dealt = 11/8, and after a play the hand only refills to 8. "Hazards fill your hand; discard them to draw
    real cards."
  - The deal is once per round (the first hand) and capped by the limit (3; +1 Skarmory, +1 Debris).
  - The `hazards_on` option only keeps the hazard jokers (and, with no layer, the Boots) out of the pools: a hazard joker you still
    get (Poké Ball, evolution) and the Debris deck still deal. "Hazards Allowed: whether Pokémon with Hazards appear in the shop."
  - A debuffed Hazard card doesn't roll its destroy (Steamodded skips a debuffed card's calculate); a debuffed hazard joker gives no
    layer while debuffed.
- **Intentional difference (owner ruling, 2026-10-26)**: 3.9.1's Debris Sleeve on a non-Debris deck overrides CardSleeves' `apply`
  without calling it, so its `no_interest` config never applies (it earns interest though its text says "Earn no Interest"). Ours
  applies the sleeve's config like a deck: **no interest, as the text says**. The owner keeps it that way; don't "fix" it to 3.9.1.
- **Follow-ups (owner-approved; pin `3.9.1+r18`)**:
  - **Held-Hazard retriggers, as 3.9.1 + Steamodded.** SMODS.calculate_end_of_round_effects (src/utils.lua) evaluates a held card once
    per pass — its own, then one per retrigger (Mime, Red Seal, a mod joker's `repetitions`: Gigalith, Mega Steelix) — and each pass is
    the WHOLE eval_card, so the Hazard's `calculate` (and any quantum enhancement's) runs again. The next pass only runs while the
    last one calculated something: `j = j + (flags.calculated and 1 or #reps)`. Hazard's destroy roll returns nothing, so a plain held
    Hazard rolls ONCE whatever its retriggers; with another end-of-round effect on it — Gold via Nacho's Carbink ($3), a Blue Seal
    making a Planet — every reached pass rolls again (Mime + Gold: 2 rolls; Mime + Red Seal + Gold: 3; 2 Mimes + Blue Seal with one free
    consumable slot: 2, the second pass makes nothing so the third never runs). Ours rolled once.
  - The engine seam (opt-in, the `smods_seams` pattern): js/engine/smods.js `eor_retrigger_seam()` — on while an active mod opts in
    (`smods_seams: true`, or a list naming `'held_retrigger'`) — + `eor_seam_center` / `eor_calculated`. run.js end_round: with it
    on, an opted-in mod's enhancement / seal end-of-round `calculate` (and `quantum_mod_calculate`) moves from the up-front pass over the
    hand into the per-card retrigger loop, card by card as Steamodded (Hazard A, A again, then B), and re-runs on each pass while the
    one before calculated (`eor_calculated`: the pass's h_dollars / Blue Seal `effect` / joker returns / the mod return). Vanilla
    enhancements, seals and jokers and non-opted-in mods' centers (Bunco, MoreFluff, ...) run exactly as before; with no opted-in mod
    the seam is off (core.js `mod_card_calculate` gained an optional center filter). One difference that comes with it: the opted-in
    pass now runs after the game-over check, as in Steamodded (a lost round no longer rolls its held Hazards).
  - Fuzz proof on the seam-only diff (engine files only, against eb1381ec): identical — vanilla 40 runs / 5937 actions / max ante 13 /
    10 wins; Pokermon 24 / 3909 / 13 / 6; all mods 16 / 2897 / 13 / 5 (same mod activity).
  - **House tooltips (text only)**: how Hazards work, as extra info boxes beside 3.9.1's own text (nothing upstream rewritten).
    The Hazard card (enhancement1.js loc_vars -> systems/utils.js `hazard_rules_tip`), descriptions.Other.`poke_hazard_rules` "Hazards":
    "Stay in your deck until / destroyed while {C:attention}held{} / {C:inactive}(playing or discarding / {C:inactive}one keeps it) /
    Take up {C:attention}hand{} slots: / {C:attention}discard{} them to draw". Every card showing the Hazard Layer tooltip (the hazard
    jokers, Nacho's Carbink) gets `poke_hazard_deal` "Hazards" LAST (index.js describe hook, so it never pushes one of 3.9.1's own
    boxes out — the board shows three): "At most {C:attention}N{} a round / {C:inactive}(the {C:poke_hazard}hazard limit{C:inactive}) /
    Stay in your deck / until destroyed / while {C:attention}held{} / Take up {C:attention}hand{} slots: / {C:attention}discard{} to draw"
    (N = the live limit). The option reads "Hazard Pokémon in shop" (was "Hazards allowed": it only filters the shop pools).
    UI plumbing: a mod enhancement's info boxes now reach the in-hand tooltip (engine/view.js `enh.info` -> ui/markup.js
    describePlaying), and a tooltip wider than the board wraps its boxes onto another row (ui/board.js renderTip; on a phone the card
    + three boxes ran off the right edge). Screenshots (desktop + phone): scratchpad `hazards/tip_*.png`.
- **Tester evidence** (SELECT-only, 222 `mreplay:` rows, all Pokermon): 6 runs ever had a Hazard layer or Hazard cards (Cacnea, Golett,
  Skarmory, Tarountula, Baltoy, Hisuian Qwilfish / Overqwil); re-simulated, the r17 one replays to its checksum and the older ones
  behave as above up to where their pins diverge. No bug row and no `chat:dm:mgibbie` row mention Hazards.
- **Tests**: `micatro/tests/mods/pokermon_hazards_test.mjs` (new; 62 passed / 4 failed on origin/main, 66 / 0 at eb1381ec) plays it all
  through real actions: the deal over several rounds and the limit (Skarmory), the hand slots, the Hazard card (no rank / suit / chips,
  the destroy only when held, ~1 in 3 over 120 rolls, not when debuffed), every hazard joker in play, the Boots, the Debris deck's
  cash-out over 3 rounds and the sleeve alt, the option, and the colours. The follow-ups add its `retriggers` section (real end of
  round with Mime / Red Seal / both / 2 Mimes, plain, Gold via Carbink and Blue Seal Hazards: the number of destroy rolls, the
  card-by-card order, a sure destroy rolled twice) and the tooltip checks: 70 passed / 10 failed with the follow-ups' sources
  reverted, 87 / 0 with them. `smods_seams_test` section 10 fires the seam with synthetic mods (an opted-in enhancement re-runs on a
  pass that calculated, not on one that didn't; a not-opted-in one runs once; no opted-in mod, seam off): 117 / 1 reverted, 118 / 0.
  `overworld/tests/micatro_tooltip_test.mjs`: a three-info-box tooltip stays on a phone screen (fails reverted: right edge 460 > 390).
  Re-run and passing: every Pokermon / Nacho / Pokermon+ Node suite, `micatro_engine_test` (109 suites), `micatro_mod_version_pin`,
  `micatro_resume_win_badges`, `micatro_runsync` (fixtures unchanged: no recording held a retriggered Hazard), `micatro_ui`,
  `micatro_mods_ui`, `micatro_custom_enhancement`.

### The owner's 25 new jokers (2026-10-27, branch `feat/pokermon-25-new-jokers`)
Pinned **`3.9.1+r19`** (`contentRev: 19`; `version` stays '3.9.1'; `LEGACY_MOD_VERSIONS` untouched). The 25 designs of the owner's
`Desktop/Pokermon_Joker_Design_Guide.txt` section 5 ("25 DESIGN RECOMMENDATIONS"): species no mod had a joker for (the design wiki's
"not in the game yet" list, now 445 -> 420). They are Micatro's own designs, not upstream code, so there is no Lua behind them:
`jokers/pokejokers_designs.js` (status file `micatro/pokejokers_designs`, 26 defs) defines each in FULL (static data + behaviour, the
Repel / Jirachi-forms route), and index.js inserts each after the joker its `poke_after` names (Pokédex order). Text: `DESIGN_LOC`
(Pokermon loc style, `{br:2}` box breaks), families: `DESIGN_FAMILIES` (`set_family`). Base Pokermon owns these species: neither our
Nacho nor our Pokermon+ has any of them, so there is nothing to dedupe.

- **The jokers** (numbers as designed; rarity / cost: Basic U $6 or C $5, Stage 1 Safari $8, Stage 2 Safari $10):
  - **Shinx -> Luxio -> Luxray** (Lightning): +1 / +2 / +3 Foresight; a scored card sharing a rank with a Foreseen card earns $1 (Luxio:
    and +6 Mult; Luxray: and X1.4). 4 rounds, then 5. Money through `dollar_buffer` (Electrike).
  - **Honedge -> Doublade -> Aegislash** (Metal): +1 / +2 Mult per Steel card held when a hand is played (`scale_card` x count);
    Honedge evolves at +20, Doublade with a **Dusk Stone** (`item_req`). Doublade retriggers the first 2 scoring (not debuffed) held Steel
    cards. Aegislash: +20 Mult (kept), Stance Change — Shield Forme (each round's start, and after a discard: `pre_discard`) retriggers
    every held Steel card, Blade Forme (after a played hand: `after`) gives X2.5; `extra.form`.
  - **Spheal -> Sealeo -> Walrein** (Water): Rollout +10 / +20 / +40 Chips doubled per consecutive same poker hand (max 4 doublings;
    resets when the hand changes and at end of round); Sealeo / Walrein +1 hand (the Squirtle pair); Walrein's Sheer Cold X3 at full power.
    5 rounds each. (Energy raises the base Chips, so the doubled value — and Sheer Cold's `Xmult` — as designed.)
  - **Grookey -> Thwackey -> Rillaboom** (Grass starter: `starter: true`, so the Starter Pack's Grass list; U **$5**): +1 hand size; every
    4th / 3rd / 2nd card scored this round is retriggered (the round's count in `beat`, the hand's beats picked in `before` so Blueprint
    copies them); evolves after 12 / 16 beats (`scaling_evo` on `beats`); Rillaboom's Drum Beating: a beat card gives +3 Mult each time
    it scores.
  - **Kubfu -> Urshifu** (Fighting Legendary; Kubfu **$10**, Urshifu $20): Kubfu gains X0.1 on a hand of exactly 1 or 5 scoring cards
    (counting each school); after 10 trainings it becomes the school it trained more — `urshifu_single` (more 1-card hands) or
    `urshifu_rapid` (more 5-card hands). Both keep the X Mult (`Xmult` + `Xmult_mod` carry over; their own base is X2) and keep training.
    Single Strike: Unseen Fist (playing cards can't be debuffed) and Wicked Blow (a 1-card hand's card also gives the X Mult). Rapid
    Strike: Surging Strikes (the first 3 scored cards are retriggered). Kubfu and both Urshifu can't be debuffed: `systems/rules.js
    set_debuff` (the Gholdengo / Tentacruel hook).
  - **Xerneas** (Fairy Legendary, $20): Geomancy — after the round's first hand, scored cards give X1.25; the first playing card destroyed
    each round comes back as a copy (`remove_playing_cards`, Chansey's copy).
  - **Tandemaus -> Maushold** (Colorless): a scored card sharing a rank with another scored card gives +3 Mult (5 rounds). Maushold's
    Population Bomb: the first scored card is retriggered, then 1 in 2 per further retrigger, up to 4 (Family of Four); 1 in 100
    (`pseudorandom('maushold_family')` on creation) is the Family of Three: up to 3, each retrigger earns $1 (its own text key).
  - **Darumaka -> Darmanitan** (Fire): +15 Mult with Hustle's 1 in 4 to give nothing (probability jokers make it miss MORE; 4 rounds);
    Darmanitan +30 Mult, and on the round's final hand Zen Mode: X3 instead, and a Psychic Tera sticker until end of round (then its own
    type back, or the Tera it wore).
  - **Scraggy -> Scrafty** (Dark): +4 Mult; Moxie +3 when a Blind falls to the round's first hand (end of round, `hands_played === 1`;
    4 rounds). Scrafty: Moxie +3, +1 per other Dark Joker; X1.5 on the round's first hand.
  - **Spiritomb** (Psychic, R $7): a spirit per playing card destroyed and per Joker sold; X0.02 per spirit; at 108, The Soul (once, when a
    consumable slot is free — it waits for room).
  - **Tatsugiri** (Dragon, R $7): a Nature rolled on creation (Curly / Droopy / Stretchy, its own text key); Commander: the leftmost
    Water Joker (never itself) gives X1.75 / +100 Chips / +20 Mult (`other_joker`).
  - **Mudbray -> Mudsdale** (Earth): +20 Chips, Stamina +6 per hand that isn't the round's first (5 rounds); Mudsdale Stamina +10 and Mud
    Spit: the first unscored card of each played hand becomes a Stone card.
- **Pools**: Common Tandemaus / Darumaka / Scraggy / Mudbray, Uncommon Shinx / Honedge / Spheal / Grookey, Rare Spiritomb / Tatsugiri,
  Legendary (The Soul) Kubfu / Xerneas; the Safari stages never; the Gen options apply. Urshifu is only reached through Kubfu
  (`in_pool` false), as the training decides the school.
- **Art: upstream's own, no new files.** Pokermon 3.9.1's pokespriteload.lua already draws all 25 (no upstream joker uses them yet), on the
  3.9.1 sheets vendored in batch 5, each with its Shiny twin, the Legendaries with their floating souls — and both Urshifu formes. So by
  the owner's art rule (a composed card only where upstream has none) every joker takes its 3.9.1 cell: `poke_sprite391` on the
  definition, read by index.js `jokerSprite391` like data391.js `sprites` (Natdex; Aegislash / Xerneas Gen 6, Darmanitan Gen 5, Urshifu
  Gen 8, Maushold / Tatsugiri Gen 9). Spiritomb and Mudbray also have Series A alternates (data391.js `series_a`). The design wiki's
  composed cards for these species are no longer used (the wiki list drops them). Nothing to deploy for the mod.
- **Deviations / choices** (where the design left room):
  - Kubfu's tie (5 / 5): the school of its last training. Urshifu's base X is X2 (Kubfu's at evolution; the larger value is kept).
  - Urshifu was the design's Fighting; upstream's two cards carry its secondary-type icons (Dark / Water). Since contentRev 30 (owner rule:
    the card's type wins) Single Strike is Dark and Rapid Strike Water ("Types from the card art" below).
  - Xerneas: a card destroyed outside a Blind (the shop) comes back into the deck, not the hand.
  - Spiritomb at 108 with full consumable slots: The Soul waits (the next spirit, or the end of a round, with room).
  - Aegislash's Blade Forme and Darmanitan's Zen Mode keep their one card (upstream draws no other forme); `extra.form` tracks them.
  - Text: small status lines the designs implied were added (Aegislash's forme, Kubfu's school counts, Xerneas "Charging..." /
    "Active!", Sealeo / Walrein's current Chips, Urshifu's training line).
- **Fuzz** (micatro_engine_test's runs, per-run state traces): the seam-only diff (the code with the 26 definitions emptied) is identical
  to origin/main on every run (vanilla 40 / 5937 / 13 / 10, Pokermon 24 / 3909 / 13 / 6, all mods 16 / 2897 / 13 / 5). With the jokers:
  vanilla identical; Pokermon 23/24 and all mods 15/16 runs diverge, each at a shop / pack / Poké Ball roll that now draws from the
  longer pools (Pokermon 24 / 3419 / 13 / 6, all mods 16 / 2907 / 13 / 5).
- **Tests**: `micatro/tests/mods/pokermon_new_jokers_test.mjs` (**59 passed / 25 failed on origin/main, 293 / 0 here**) fires every ability
  through real plays with exact numbers and every evolution (rounds, +20 Mult, a real Dusk Stone, 12 / 16 beats, both Urshifu schools and
  the tie), the carried Mult / Chips / X Mult / Energy, the debuff rules, pools, gens, the Starter Pack, the text and the art cells.
  Re-recorded: `modpin_test`, `pokermon_391_data_test` (+ its 3.2.1-vs-3.9.1 art compare skips the new jokers), `micatro_mod_version_pin`;
  `pokermon_391_new_14` / `15b`'s order checks skip the designs between two neighbours; `pokermon_391_new_15`'s Rabsca section removes
  the Poké Ball's random joker (the pools changed which one it makes). `micatro_runsync` / `micatro_resume_win_badges` needed nothing.
- **Wiki**: `node tools/micatro/gen_designwiki_pokermon_jokers.mjs` (420 missing; its 50 cards deleted, and ~80 other species' composed
  cards shift a few pixels because their frames are the mode of the registered cards) and `gen_designwiki.mjs` (the mods' joker data).
  The wiki art: `npx wrangler pages deploy designwiki/sprites --project-name=magepunk-sprites --branch=cloudflare-migration --commit-dirty=true`.

### The owner's Sprigatito line (2026-10-27, branch `feat/pokermon-sprigatito-line`)
(Reworked in contentRev 23: "The Sprigatito rework" below — evolution by Lucky triggers, a Negative The Magician per evolution,
Meowscarada's permanent X Mult. This section is the r20 design.)
Pinned **`3.9.1+r20`** (`contentRev: 20`; `LEGACY_MOD_VERSIONS` untouched). The owner's wiki design ("do the joker design list") for
Sprigatito (906) -> Floragato (907) -> Meowscarada (908), defined with the 25 in `jokers/pokejokers_designs.js` (LINE F2; 29 defs now),
after Ursaluna in Pokédex order. Neither Nacho nor Pokermon+ has these species.
- **Sprigatito** (Grass starter, U **$5**, `starter: true`: the Starter Pack's Grass list): Hiker for Lucky cards. When a scored Lucky card
  triggers (`lucky_trigger`: its 1 in 5 Mult or 1 in 15 money; once per scoring even when both hit, as Lucky Cat), the card permanently
  gains +1 Mult and +$1 when scored: Steamodded's `perma_mult` / `perma_p_dollars` on the card. They score every time after (the growth
  lands after the card scored, as Hiker's chips), survive evolving and selling the joker and a change of enhancement, and show on the
  card's tooltip ("+N extra Mult", "+$N when scored": index.js `perma_lines`, in `describe` and the board's `view_card` mod_lines). Blueprint copies it (Hiker is blueprint-compatible). 5 rounds.
- **Floragato** (Safari $8): the same, +2 Mult and +$2. 5 rounds (the starter pace: Chikorita / Totodile 5 and 5).
- **Meowscarada** (Safari $10): no growth (cards keep what they have); a Lucky card held in hand gives X1.25 Mult, as a Steel card (Baron's
  shape: the joker's individual G.hand return, so Mime / a Red Seal retrigger it like Steel; nothing while debuffed; a played Lucky card
  gets nothing). Not counted as Steel: `has_enhancement(c, 'm_steel')` stays false, Steel Joker / Honedge don't count them (the tooltip
  says so). Enhancements are exclusive, so it is Lucky cards only.
- **Energy**: the Mult step is `mult_mod` (+20% of its base per Energy: Sprigatito +1.2 / +1.4 / +1.6, Floragato +2.4 / +2.8 / +3.2), the
  money step `dollars` (in no `energy_values`: always $1 / $2). A card keeps the step it was given: later Energy never re-grows it
  (Houndour's `perma_mult` precedent). Meowscarada's X is `Xmult_multi` (per-card X, +5% of its base: X1.3125 / X1.375 / X1.4375).
- **perma_p_dollars** is now base Pokermon's `p_dollars` hook (index.js `perma_p_dollars`); it was Pokermon+'s (Heatran's forged cards).
  Pokermon+ requires Pokermon, so it is the same rule, scored once.
- **Art: upstream's own.** 3.9.1's pokespriteload.lua draws all three on the vendored Natdex sheet ({10,60}, {12,60}, {14,60}, Shiny twins):
  `poke_sprite391`. Nothing to deploy for the mod. The wiki drops them (417 missing).
- **Tests**: `micatro/tests/mods/pokermon_sprigatito_test.mjs` (2 passed / 10 failed on origin/main, 56 / 0 here) fires the growth, the scoring without
  a trigger, Energy, evolution at 5 + 5 rounds, selling, Meowscarada's held X (with Energy, a Red Seal, Steel Joker) and the text.
  Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 29 defs), `micatro_mod_version_pin`.
- **Fuzz**: vanilla identical (40 / 5937 / 13 / 10). The seam-only diff (the 3 definitions removed, the hook move and tooltip lines kept)
  is identical to origin/main (Pokermon 24 / 3419 / 13 / 6, all mods 16 / 2907 / 13 / 5); with the jokers the Pokermon runs diverge at
  pool rolls (Pokermon 24 / 3203 / 13 / 6, all mods 16 / 3130 / 13 / 6).

### The owner's Whismur line (2026-10-27, branch `feat/pokermon-whismur-line`)
Pinned **`3.9.1+r21`** (`contentRev: 21`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Whismur (293) -> Loudred (294) ->
Exploud (295), Colorless, in `jokers/pokejokers_designs.js` (LINE F3; 32 defs now), after Shedinja in Pokédex order. Neither Nacho nor
Pokermon+ has these species.
- **The trigger**: a Glass card breaking by its 1 in 4 shatter: Glass Joker's own count (`remove_playing_cards`, the `removed` cards with
  `shattered`), once per broken card (3 in one hand count 3). Not Blueprint (it scales). The growth lands after the hand, as Glass Joker's.
- **Whismur** (U **$6**): +30 Chips; +20 Chips per break. 4 rounds.
- **Loudred** (Safari $8): Whismur's Chips (all of them, the starting 30 included; +30 when found fresh) and +4 Mult; +3 Mult per break. 5 rounds.
- **Exploud** (Safari $10): the Chips and the Mult (+30 / +4 fresh) and X1.5 Mult; +X0.2 per break. One joker_main return: chips, then
  Mult, then X Mult.
- **Fields**: the totals `glass_chips` / `glass_mult` / `glass_Xmult` are in no `energy_values`, so Energy never touches the starting
  values or a banked gain (not retroactive); the gain is `chip_mod` / `mult_mod` / `Xmult_mod` (+20% of its base per Energy: +4 / +0.6 /
  +X0.04). The totals carry over with `poke_custom_values_to_keep`; the Energy (energy_count) is re-applied to the new form's base gain.
  The tooltip shows every carried total and the energized gain.
- **Negative Justice**: each evolution (Whismur -> Loudred, Loudred -> Exploud) creates one Negative Justice (Chingling's `add_card`; Negative,
  so full consumable slots don't matter): the new form's `poke_evolved` context from the previous form. Two over the line.
- **Art: upstream's own.** 3.9.1's pokespriteload.lua draws all three on the Natdex sheet ({14,19}, {16,19}, {18,19}, Shiny twins):
  `poke_sprite391`. Nothing to deploy for the mod. The wiki drops them (414 missing).
- **Grookey / Thwackey** (same contentRev): their on-beat (retriggered) cards also give +1 / +2 Mult each time they score, the lead-in to
  Rillaboom's Drum Beating (+3, unchanged): the `mult` field, as Rillaboom's, so Energy (which did nothing on them: hand size, beats and
  retriggers aren't energized) scales it by `energy_values.mult` (0.4 of its base per Energy: +1.4 / +2.8 with one) and the evolving energize carries
  it into Thwackey / Rillaboom. Audit (`pokermon_new_jokers_test` "design energy audit"): every owner-designed joker has a numeric
  `config.extra` key in `energy_values`, or `poke_no_energy_field: true` on purpose (none today).
- **Tests**: `micatro/tests/mods/pokermon_whismur_test.mjs` (2 passed / 13 failed on origin/main, 54 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 32 defs), `pokermon_sprigatito_test` (its pin check), `micatro_mod_version_pin`.

### The owner's Type Sleeves (2026-10-27, branch `feat/pokermon-type-sleeves`)
Pinned **`3.9.1+r22`** (`contentRev: 22`; `LEGACY_MOD_VERSIONS` untouched). Twelve Micatro-made sleeves (not upstream), one per type of
`systems/types.js` POKETYPES (the Energy system's 12: Grass, Fire, Water, Lightning, Psychic, Fighting, Colorless, Dark, Metal, Fairy,
Dragon, Earth), in `typesleeves.js`, appended to sleeves.js `SLEEVES` (keys `sleeve_poke_<energy>sleeve`; Dark's Energy is "Darkness
Energy", so its sleeve is the **Darkness Sleeve**, `sleeve_poke_darknesssleeve`).
- **Text**: "Start with a Negative <Type> Energy card / The first 2 shops each / start with a <Type> Joker" (the type in its
  `{X:poke_<type>}` box).
- **The Energy**: the sleeve's `apply` adds it in an event, as Whismur's Negative Justice (`add_card({set: 'Energy', key, edition:
  'e_negative'})`): +1 consumable slot with it, so it never takes one.
- **The guarantee** (sleeve `hooks`, run by the engine's internal sleeve mod): `shop_start` counts each NEW shop (not a re-open after a
  pack); for visits 1 and 2 the initial stock's LAST joker slot (`create_card_for_shop`) is a Joker of the type; `shop_stocked` ends it
  (a 0-slot shop or a mod that stocks the shop itself uses the visit up). Shop size unchanged; a Rare / Uncommon Tag still makes the
  first slot. **Rerolls restock normally** (the owner's default: the guarantee is the initial stock's only), and a reroll does not use
  a visit up.
- **The pick** (`pick_type_joker`): `get_current_pool('Joker', <rarity>, false, 'sho')` for Common / Uncommon / Rare (+ an active mod
  rarity with weight > 0; no Legendary: the shop never rolls one) — so in_pool, every mod's pool_filter (Pokémon only, the Gen options,
  Hazards allowed), the add-on precedence, no duplicates unless Showman, banned keys, gates — cut to the type (`config.extra.ptype`),
  then the normal rarity odds (0.7 / 0.25 / 0.05 times `G.GAME.<rarity>_mod`) over the rarities still holding one. Seeded on the
  shop's streams ('rarity' + ante + 'sho', then the pool key 'Joker' + rarity + 'sho' + ante), so a replay, a resume (the recipe
  re-simulates) and a spectator stock the same Joker. `G.GAME.poke_type_sleeve_last` records the pick (null = the fallback).
- **The fallback**: no Joker of the type can come up (e.g. Metal with only Gen 1 on) -> the slot rolls as normal, drawing nothing
  from the RNG first (the stock is exactly a run's without the guarantee).
- **Decks**: any deck, no alternate effect (no deck pairs naturally). One deck touch: on the Luminous Deck (a random Tera type on every
  Joker) the guaranteed Joker's Tera sticker is the sleeve's type, so it stays a Joker of that type.
- **Unlocks**: Micatro's sleeves have none; the 12 carry `unlocked: true`.
- **Art**: `assets/2x/type_sleeves.png` (`poke_type_sleeves`, one row of 12 cells in POKETYPES order), composed by
  `node tools/micatro/compose_pokermon_type_sleeves.mjs` (`--check` compares): the Trainer Sleeve's pocket with its navy recoloured to
  the type colour (TYPE_COLOURS, at the Trainer tones' lightness), the type's Energy card inside, and the type's Tera sticker icon in the
  tab. Gitignored mod art: deployed with `npm run deploy-micatro-mods` (listed in `tools/cloud/micatromods_manifest.txt`).
- **Tests**: `micatro/tests/mods/pokermon_type_sleeves_test.mjs` (133 passed / 94 failed on origin/main, 296 / 0 here): every type's
  Negative Energy and shops 1 / 2 / 3, rerolls, Hazards off / on, duplicates, the add-on precedence, the fallback (and its RNG), the first
  slot, the Luminous Deck, and determinism (same seed; resume mid-shop 1 and 2, after a buy and a reroll). Re-recorded: `modpin_test`,
  `challenges_test` (23 Pokermon sleeves), `pokermon_391_data_test`, `pokermon_new_jokers_test`, `pokermon_whismur_test` /
  `pokermon_sprigatito_test` (their pin checks), `micatro_mod_version_pin`; the wiki data regenerated.
- **Fuzz**: identical to origin/main (vanilla 40 / 5937 / 13 / 10; Pokermon 24 / 3414 / 13 / 6; all mods 24 / 4707 / 13 / 9): the fuzz
  plays no sleeve.

### The Sprigatito rework (2026-10-27, branch `feat/pokermon-meowscarada-rework`)
Pinned **`3.9.1+r23`** (`contentRev: 23`; `LEGACY_MOD_VERSIONS` untouched). The owner's changes to the Sprigatito line (LINE F2):
- **Meowscarada**: the held-Steel X1.25 is gone. When a scored Lucky card triggers, that card permanently gains **X0.5 Mult**
  (Steamodded's `perma_x_mult`; the engine's `get_chip_x_mult` scores `x_mult * (1 + perma_x_mult)` every time the card scores, so
  X1.5 after one trigger, X2 after two; the gain lands after the card scored, Hiker-style). Once per scoring, even when both rolls hit.
  No more +Mult / +$: cards keep what Sprigatito / Floragato gave them. Blueprint copies it (as the earlier stages). Pokermon+'s Heatran
  perma fields stack with it (one engine path; its hooks add only `perma_h_x_mult` / `perma_repetitions`), so nothing double-counts.
- **Energy**: the gain is `Xmult_mod` (`energy_values` 0.2: +X0.1 per Energy, X0.6 / X0.7 / X0.8; Colorless +X0.05). Not
  retroactive: a card's banked `perma_x_mult` is on the card, never re-scaled. The tooltip shows the energized gain.
- **Evolution by Lucky triggers** (`scaling_evo` on `ability.extra.lucky_triggers`, at end of round as Grookey's beats): Sprigatito
  after **8**, Floragato after **12** more (the count is not carried: each form's config starts at 0). Every roll that hits counts: the
  engine now counts them per card (`lucky_procs`, set beside `lucky_trigger` by the Lucky Mult / money rolls — core.js, the quantum
  Lucky rolls, the custom deck's lucky 7s / Stones — and cleared with it per scoring), so a card hitting both counts 2 (its growth
  is still once). Blueprint's copy grows the card but doesn't count. Text: "(Evolves after N Lucky triggers)" with N left, and
  "(Lucky triggers: k/8)".
- **A Negative The Magician** on each evolution (Sprigatito -> Floragato, Floragato -> Meowscarada; two over the line): Whismur's
  Negative Justice code, generalised (`evolved_tarot`, the new form's `poke_evolved` context; Negative, so full slots don't matter).
- **Card tooltip**: a playing card's `perma_x_mult` now shows ("X1.5 Mult", index.js `perma_lines`, Steamodded's
  localize_perma_bonuses) beside its +Mult / +$ (also on Tyranitar's / the Speed seal's cards; Heatran-forged cards keep their box).
- **Old runs**: a saved run is its recipe, re-simulated on resume (session.js), so after the r22 -> r23 prompt ("Continue anyway")
  the line re-plays on the new rules: a Sprigatito / Floragato counts the replayed Lucky triggers from 0 (rounds don't map to triggers;
  the old `rounds` counter is gone), a Meowscarada takes the new ability, and every card keeps what it banked. Where the new scores
  make a later move impossible (a round now won sooner or later) the rebuild stops there with the usual "rebuilt up to move N" toast;
  the joker is never lost. A pre-r23 `ability.extra` met directly (`lucky_legacy`) is normalised too: no counter -> 0, `rounds`
  dropped, Meowscarada's `Xmult_multi` -> `Xmult_mod` from its base with the Energy it has. Fixture:
  `micatro/tests/fixtures/pokermon_sprigatito_r22_recipe.json` (recorded on origin/main e2ad0022: a Lucky deck + Sprigatito, saves
  at rounds 7 and 12).
- **Tests**: `micatro/tests/mods/pokermon_sprigatito_test.mjs` (43 passed / 55 failed on origin/main, 98 / 0 here): the growth, the
  double-proc count, Blueprint, Energy, evolution at exactly 8 and 12 (7 / 11 don't), one Negative Magician per evolution with full
  slots, Meowscarada's X0.5 (X1.5 / X2, scored later without a trigger, Energy X0.6 / X0.7 / X0.8 not retroactive, the evolved Energy
  X0.7, no held effect, Pokermon+ once), old `extra` tables and the r22 recipe. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test`, `pokermon_type_sleeves_test` (its pin check), `micatro_mod_version_pin`; the wiki data regenerated.
- **Fuzz**: identical to origin/main (vanilla 60 / 9722 / 13 / 17; Pokermon 24 / 3414 / 13 / 6, all ok): no fuzz run held the line's
  Lucky-trigger path to a different result, and the engine's new lucky_procs is bookkeeping only.

### The owner's Gulpin line (2026-10-27, branch `feat/pokermon-gulpin-line`)
Pinned **`3.9.1+r24`** (`contentRev: 24`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Gulpin (316) -> Swalot (317), Dark (Poison
is Dark in Pokermon), in `jokers/pokejokers_designs.js` (LINE F4; 34 defs now), after Roselia in Pokédex order. Neither Nacho nor Pokermon+
has these species.
- **Stockpile** (both): at the end of each round (the joker pass; not a lost round, not Blueprint, not a joker retrigger) it swallows the
  LEFTMOST Hazard card held in hand, else the leftmost Diamond card held in hand (`is_suit`: a Wild card counts, a debuffed card doesn't),
  and gains 1 Stockpile up to max. The swallow is Pokermon's `poke_remove_card` — the Hazard plumbing every Hazard destroy uses (sound,
  dissolve, `remove_playing_cards` to every joker: Qwilfish, Spiritomb, ... count it like any destroyed card; a Glass Diamond shatters).
  The swallowed Hazard is marked `poke_swallowed`, and the Hazard's own 1 in 3 roll (enhancement1.js; also a quantum Hazard's) skips
  it, so one card is never destroyed (or counted) twice. Heavy-Duty Boots only zero the Hazards' own roll: Gulpin still swallows.
- **Gulpin** (U **$6**): scored Diamonds give +2 Mult per Stockpile. At max it swallows only Hazards (a Diamond would be eaten for
  nothing). Evolves at exactly **3** Stockpile (`stockpile_evo`, fixed: with Energy's higher max it still evolves at 3; at 3 / 3 it
  evolves the same end of round), keeping the Stockpile (`poke_custom_values_to_keep`).
- **Swalot** (Safari **$8**): the same +2 Mult per Stockpile; a swallowed Diamond also earns its rank in $ (`get_id`, as Balatro numbers
  ranks: 2-10, J 11, Q 12, K 13, A 14), even at max (then no Stockpile); X0.1 Mult per card the full deck is below the run's starting
  size (Erosion's `G.GAME.starting_deck_size - #G.playing_cards`; so the Abandoned deck etc. measure from their own start), never
  below X1. Its swallows shrink the deck too.
- **Energy**: max Stockpile is the house energy field `stockpile_max` (systems/energy.js: `energy_values.stockpile_max = 1/3` of its
  base 3 = exactly +1 per Energy: 3 -> 4 -> 5 -> 6 at 3 Energy; a mismatched Colorless Energy counts half, +0.5, and the joker floors
  it, so two Colorless make +1). Energize needed no new hook: a numeric field in `energy_values` is what makes a joker take Energy
  (and Transformation / Berry Juice), and only a card with `stockpile_max` has it. The +2 Mult per Stockpile (`stockpile_mult`) and the
  Stockpile are not energy fields; the money is no field (fixed). Swalot's per-card X is `Xmult_mod` (energy_values 0.2 of its base:
  +X0.02 per Darkness Energy — X0.12 / X0.14 / X0.16 per card; +X0.01 per Colorless). Evolving re-applies the Energy to Swalot's base
  (max and X).
- **Art: upstream's own.** 3.9.1's pokespriteload.lua draws both on the Natdex sheet ({0,21}, {2,21}, Shiny twins): `poke_sprite391`.
  Nothing to deploy for the mod. The wiki drops them (412 missing).
- **Tests**: `micatro/tests/mods/pokermon_gulpin_test.mjs` (2 passed / 18 failed on origin/main, 59 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 34 defs), `micatro_mod_version_pin`.
- **Fuzz**: vanilla identical (60 / 9722 / 13 / 17); Pokermon diverges at pool rolls, all ok (24 / 3414 -> 3714 / 13 / 6 -> 7); all mods 16 / 2966 / 13 / 5, all ok.

### The owner's Trapinch line (2026-10-27, branch `feat/pokermon-trapinch-line`)
Pinned **`3.9.1+r25`** (`contentRev: 25`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Trapinch (328) -> Vibrava (329) -> Flygon
(330), Earth (Ground is Earth in Pokermon), in `jokers/pokejokers_designs.js` (LINE F5; 37 defs now), after Spinda in Pokédex order. Neither
Nacho nor Pokermon+ has these species.
- **Sand Pit** (Trapinch, U **$6**; Vibrava's "Supersonic"): every card the PLAYER discards permanently banks Chips on the joker (`sand_chips`):
  +2 per card (Vibrava +3; `chip_mod`). A discard of N cards banks and counts N. Counted on `pre_discard` without `hook`: a discard an effect
  makes for you (The Hook, Pokermon's seals, the Bunco / MoreFluff blinds — all `discard_cards_from_highlighted(true)`) banks and counts
  nothing. Not Blueprint (it scales); a Blueprint copies the banked Chips. The joker gives the bank every hand.
- **Evolution**: by discarded cards (`sand_cards`, scaling_evo at end of round): Trapinch at **40**, Vibrava after **60 more** (its count
  starts over). The bank carries through both (`poke_custom_values_to_keep: ['sand_chips']`).
- **Vibrava** (Safari **$8**): **+1 discard each round** while held (`d_size` in extra; the Charmander line's add_to_deck / remove_from_deck
  pair: on gain +1 to `round_resets.discards` and +1 now; off on sale, destruction or evolution — set_ability runs the old center's
  remove_from_deck across the swap). Fixed: `d_size` is never energized.
- **Flygon** (Safari **$10**): keeps the whole bank and **banks no more** (the owner's default: its new power is the X Mult). Sandstorm
  (`{C:poke_sand}`, the reserved weather colour's first use): **X(1 + 0.25 x discards used this round)** — `G.GAME.current_round.discards_used`,
  so a discard use counts once however many cards, an effect discard never counts, and it is 0 again each round. No +1 discard.
- **Energy**: the gains only. `chip_mod` +20% of its base per Energy: Trapinch +2.4 / +2.8 / +3.2 per card, Vibrava +3.6 / +4.2 / +4.8
  (a Colorless counts half: +0.2 / +0.3); Flygon's `Xmult_mod` +20%: X0.3 / X0.35 / X0.4 per discard (+0.025 a Colorless). The bank
  (`sand_chips`) is in no energy field, so Energy is never retroactive (a banked Chip keeps what it was worth when earned). Energy carries
  through the evolutions (energy_count, re-applied to the new base gain).
- **Art: upstream's own.** 3.9.1's pokespriteload.lua draws all three on the Natdex sheet ({24,21}, {26,21}, {28,21}, Shiny twins):
  `poke_sprite391`. Nothing to deploy for the mod. The wiki drops them (409 missing).
- **Tests**: `micatro/tests/mods/pokermon_trapinch_test.mjs` (2 passed / 16 failed on origin/main, 75 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 37 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (855 jokers).

### The owner's Spoink line (2026-10-27, branch `feat/pokermon-spoink-line`)
Pinned **`3.9.1+r26`** (`contentRev: 26`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Spoink (325) -> Grumpig (326), Psychic, in
`jokers/pokejokers_designs.js` (LINE F6; 39 defs now), after Torkoal in Pokédex order. Neither Nacho nor Pokermon+ has these species.
- **Pearl** (both): at the end of each round a random card held in hand with **no seal** gains a **Pink Seal** (`pseudorandom_element`,
  seed `poke_spoink_pearl`; none unsealed: nothing). Once a round: not Blueprint, not a joker retrigger, not on a game over.
- **Counting a trigger**: `seals/seals1.js` `pink_triggered` calls each owned (undebuffed) joker's center hook `poke_pink_trigger(self, joker,
  seal_card, overflow)` whenever the Pink Seal's scoring effect fires — with or without room for its Energy (`overflow` = no room); each
  retrigger of the card is one more. A Blueprint has no hook: it copies the X Mult and never counts.
- **Spoink** (Common **$5**): **X0.1** banked per trigger (`pink_Xmult`, in no energy field; `Xmult_mod` the gain), given every hand.
  **Evolves after 8 triggers** (`pink_triggers`, scaling_evo at end of round), "(Pink Seal triggers: k/8)". The bank carries
  (`poke_custom_values_to_keep`).
- **Grumpig** (Safari **$8**): Spoink's bank and Pearl. **Spoink Dance**: Pink Seals trigger on **every hand** while it is held — the seal's
  `hands_played === 0` check gained `|| find_card('j_poke_grumpig').length > 0` (a debuffed Grumpig doesn't count); without one nothing
  changes (vanilla, other mods, the Obituary Deck). Each trigger still rolls the Obituary fall-off and drops the seal for a Bird Energy.
  **X0.15** for each hand a Pink Seal triggers in (once per hand, not per seal; `G.GAME.hands_played` names the hand). **Black Pearl**:
  a trigger with no consumable room makes that hand's gain **X0.3** instead (= 2 x `Xmult_mod`): still once per hand, the overflow gain
  replacing the normal one (one roomy + one overflowed seal: X0.3 total).
- **Energy**: the gains only, `Xmult_mod` +20% of its base per Energy: Spoink X0.12 / X0.14 / X0.16 (Colorless +0.01); Grumpig X0.18 /
  X0.21 / X0.24, Black Pearl X0.36 / X0.42 / X0.48. The bank is never retroactive; Energy carries through the evolution (re-applied to
  Grumpig's base). Adding the seal is fixed.
- **Art: upstream's own.** 3.9.1 draws both on the Natdex sheet ({18,21}, {20,21}, Shiny twins): `poke_sprite391`. Nothing to deploy for
  the mod. The wiki drops them (407 missing).
- **Tests**: `micatro/tests/mods/pokermon_spoink_test.mjs` (4 passed / 16 failed on origin/main; 38 / 29 with only seals1.js reverted; 67 / 0
  here). Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 39 defs), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (857 jokers).

### The owner's Castform (2026-10-27, branch `feat/pokermon-castform`)
Pinned **`3.9.1+r27`** (`contentRev: 27`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Castform (351), single-stage, **Rare $7**, starting
**Colorless**, in `jokers/pokejokers_designs.js` (40 defs now), after Milotic in Pokédex order. Neither Nacho nor Pokermon+ has it.
- **Forecast**: on the round's **first deal** (Steamodded `hand_drawn` in `DRAW_TO_HAND` with nothing played or discarded, once per `G.GAME.round`;
  `first_hand_drawn` runs before the deal's draw events land, so the hand is empty there) Castform counts the cards held: **red** (Hearts or
  Diamonds, counted together) vs **Clubs** vs **Spades**, through `is_suit`: a **Wild** card counts once for each of the three; a **debuffed**
  card, a Stone card or a Hazard counts for none (with Smeared Joker, Clubs and Spades count as each other, so a black lead is a tie). The
  single highest count picks the form; a **tie for the top** (or no suited card) is **Normal**. Not Blueprint.
- **Forms** (`ability.extra.form`, for the whole round; later draws never re-read it): **Sunny** (Fire) scored Hearts / Diamonds **+4 Mult**
  (`mult1`); **Rainy** (Water) scored Clubs **+30 Chips** (`chips1`) and the **first scored Club retriggers** once (`retriggers`, fixed; its
  retrigger scores the +30 again); **Snowy** (Water: Ice maps to Water) each Spade **held in hand X1.1** (`Xmult_multi`); **Normal** (Colorless)
  **+10 Mult** (`mult2`). A Blueprint copies the current form's effect.
- **Out of rounds**: Normal / Colorless again after each round (queued in the end_of_round pass, so the other jokers' end-of-round effects
  still see the form); the shop sees a Colorless Castform.
- **Type**: the form changes its own `ability.extra.ptype` (what `is_type`, `find_pokemon_type`, `get_type` and `energy_matches` read), then
  `set_debuff()` and a Kecleon re-sync (Kecleon copies the joker to its right) — Kecleon's set_type, without the Tera sticker, so a player's
  Tera still overrides the weather's type as on any joker.
- **Energy** (energize's usual shares, every form's field at once): mult1 / mult2 +40%, chips1 +30%, Xmult_multi +5% of base — one Energy
  +5.6 / +39 / X1.155 / +14, three +8.8 / +57 / X1.265 / +22. Its current form's type Energy matches while it is in that form (Fire when
  Sunny, Water when Rainy or Snowy); Colorless Energy always matches — full strength while Normal, half otherwise (+0.8 / +4.5 / ...), the
  usual rule for a non-Colorless ptype.
- **Monotype** (owner's choice): its weather type never counts. The center's `poke_mono_exempt: true` makes `systems/runbadges.js` leave it
  out of every Monotype check (never breaks, never locks the type, no shop warning). The Nuzlocke reads it as usual (a Colorless gain).
  The card says so: "(Normal again after the round; its type never breaks Monotype)".
- **Text**: `j_poke_castform` (Normal, and the collection: the four forms' chart, "(Currently Normal)"), `j_poke_castform_sunny / _rainy /
  _snowy` (the form's effect), chosen by loc_vars `key`. `{C:poke_sun}` / `{C:poke_rain}` / `{C:poke_snow}` are used for the first time.
- **Art: upstream's own.** Normal is its Natdex card ({10,23}); the three weather cards are on the 3.9.1 Gen 3 sheet at {0,0} / {2,0} /
  {4,0} (unlisted in pokespriteload.lua; left of Kecleon's type cards) with Shiny twins: `systems/anim.js` `CASTFORM_SPRITES`, drawn by
  `ui.js` ownFace from the view's form. Nothing to deploy for the mod. The wiki drops it (406 missing).
- **Tests**: `micatro/tests/mods/pokermon_castform_test.mjs` (2 passed / 18 failed on origin/main; 100 / 5 with only runbadges.js reverted — the Monotype checks; 105 / 0 here).
  Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 40 defs), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (858 jokers).

### The owner's Barboach line (2026-10-28, branch `feat/pokermon-barboach-line`)
Pinned **`3.9.1+r28`** (`contentRev: 28`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Barboach (339) -> Whiscash (340), both
**Water**, in `jokers/pokejokers_designs.js` (42 defs now), after Seviper in Pokédex order (after Solrock since contentRev 29, when Lunatone / Solrock came in). Neither Nacho nor
Pokermon+ has the line.
- **Barboach** (Basic, **Common $5**), Muddy Water: **+12 Chips for each Water or Earth Joker** you have, itself included. Evolves after **5 rounds**.
- **Whiscash** (Stage 1, **Safari $8**), Muddy Water **+20 Chips** per Water or Earth Joker, itself included; **Earthquake**: with at least **2 OTHER**
  Water or Earth Jokers, the round's **first hand** (`hands_played === 0`) **retriggers every scored card** once (it jiggles on the first deal
  while armed, as Remoraid).
- **Counting** (`muddy_count`): `is_type(j, 'Water') || is_type(j, 'Earth')`, once per joker (a joker that is both, e.g. through an add-on's
  `IS_TYPE_RULES`, counts once); Tera stickers count (they replace the type); Castform counts while Rainy / Snowy (Water), not Sunny / Normal.
  **Debuffed jokers don't count** — unlike Corsola / Pelipper / Politoed, whose `find_pokemon_type` counts them. Itself always counts (+1), so the
  shop card shows its bought value.
- **Energy**: the per-joker `chips` (+30% of base each): Barboach 12 -> 15.6 / 19.2 / 22.8, Whiscash 20 -> 26 / 32 / 38 (re-applied on evolution).
  `retriggers` (1) and `quake_req` (2) are not energy fields.
- **Blueprint** copies both: Barboach's Chips again; Whiscash's Chips again and a second retrigger (each card scores 3 times), as on Remoraid / Octillery.
- **Text**: Whiscash's tooltip shows the count, the Chips and Earthquake's state: "(Active!)", "(Used this round)", "(Inactive: k/2 others)".
- **Art: upstream's own** (Natdex {16,22} / {18,22}). Nothing to deploy for the mod. The wiki drops them (404 missing).
- **Tests**: `micatro/tests/mods/pokermon_barboach_test.mjs` (3 passed / 12 failed on origin/main; 60 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 42 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (860 jokers).

### The owner's Lunatone + Solrock (2026-10-28, branch `feat/pokermon-solrock-lunatone`)
Pinned **`3.9.1+r29`** (`contentRev: 29`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Lunatone (337) and Solrock (338), a pair like
Plusle / Minun, in `jokers/pokejokers_designs.js` (44 defs now), after Seviper in Pokédex order (before the Barboach line). Both **Earth** (Rock maps to Earth), single-stage,
**Uncommon $6** (below the single-stage Rare $7: each alone works half the time). Neither Nacho nor Pokermon+ has them.
- **Day / night**: within each round the 1st, 3rd and 5th hands are **day**, the 2nd and 4th **night**: `G.GAME.current_round.hands_played`
  before the hand, even = day (during scoring it is still the pre-hand count: `run.js` adds 1 after `evaluate_play`). It restarts each round
  (`new_round`); discards don't move it.
- **Solrock, Sunlight**: **+100 Chips** on day hands (`chips`). **Lunatone, Moonlight**: **X2 Mult** on night hands (`Xmult`). Both `joker_main`.
- **Cosmic Power**: holding BOTH (each checks `find_card(partner)`, which skips debuffed cards: a debuffed partner breaks it; a Blueprint copy is
  not the partner): Solrock also gives **+50 Chips** on night hands, Lunatone **X1.5** on day hands, so every hand gets both. Each copy acts on
  its own (two Solrocks + a Lunatone: +200 by day, +100 by night). A Blueprint copies whichever half the copied one gives.
- **Energy**: `chips` +30% and `Xmult` +20% of base; the half values are DERIVED (`chips / 2`, `1 + (Xmult - 1) / 2`), so they stay exactly half.
  Earth Energy: one +130 / +65 Chips, X2.4 / X1.7; two +160 / +80, X2.8 / X1.9; three +190 / +95, X3.2 / X2.1. Colorless Energy (half): one
  +115 / +57.5, X2.2 / X1.6.
- **Tooltips**: "(Next hand: Day / Night)" (out of a round, `facing_blind` unset, it is the next round's first: Day) and "(Cosmic Power: active /
  needs Lunatone)" ("needs Solrock" on Lunatone).
- **Upstream**: Pokermon's unreleased `main` (af0b656, "Added Solrock/Lunatone"; not taken, see sub-batch 15b's drift) has its own, different
  Lunatone / Solrock (chance-based held Clubs / Stone money, scored Hearts / Stone X1.4). These are the owner's design instead; a future rebase onto
  an upstream release that ships them must keep the owner's (or ask).
- **Art: upstream's own.** 3.9.1's Natdex cells {12,22} / {14,22} (with Shiny twins), `poke_sprite391`. Nothing to deploy for the mod. The wiki
  drops them (402 missing).
- **Tests**: `micatro/tests/mods/pokermon_solrock_lunatone_test.mjs` (2 passed / 16 failed on origin/main; 61 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 44 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (862 jokers).
### Types from the card art (2026-10-28, branch `fix/pokermon-types-from-card-art`)
Pinned **`3.9.1+r30`** (`contentRev: 30`; `LEGACY_MOD_VERSIONS` untouched). Owner rule: **the type shown on the card is always the right one**
when a joker's listed type and its card disagree. Upstream draws the type icon in each card's bottom-left corner.
- **The reader**: `tools/micatro/pokermon_art_type.mjs` matches a card's type icon against per-type templates built from the jokers upstream
  registers (552 cards: the mode of each type's pixels, over the pixels every type agrees on 90%+, i.e. the icon disc; a channel tolerance of 32
  for upstream's re-tinted frames, e.g. the Trapinch line's orange). Leave-one-out on those 552: **100%**, the best type ahead by 0.40+ of the
  mask. Left out of training: Sudowoodo's "Tree...?" card (draws its Grass disguise, registered Earth), Unown (blank card), MissingNo ("Bird").
  No upstream data records a ptype for the species it draws without a joker (pokespriteload.lua has cells only; upstream main has no joker for
  them, except Lunatone / Solrock, Earth, which their cards agree with).
- **In game**: of the owner's 44 designs (Lunatone / Solrock included: Earth, as their cards), only **Urshifu** conflicted: Single Strike **Fighting -> Dark**, Rapid Strike **Fighting -> Water**
  (Kubfu stays Fighting; it changes type on evolving, as Pupitar does). Castform's forms already matched (Normal Colorless, Sunny Fire, Rainy
  / Snowy Water, on their own Gen 3 cells). Effects: Darkness / Water Energy now raises their X Mult (Fighting Energy no longer does), and Water
  / Dark synergies count them (Barboach's Muddy Water counts Rapid Strike).
- **The wiki**: every card takes its art's type (`type_source: 'art'`; the mapping only where there is no upstream card, `'mapping'`;
  `mapped_ptype` keeps the mapping's guess). 66 of 402 changed. The card page says "as its card shows".
- **Tests**: `micatro/tests/mods/pokermon_art_types_test.mjs` (the reader's validation, every design's ptype = its card's, Castform's forms, and
  Urshifu's new types PLAYED: evolution, is_type, Energy, Barboach's count; 6 passed / 10 failed with the old ptypes);
  `designwiki_pokermon_jokers_test` (validation + every wiki card's type = its art's). Re-recorded: the pins (`modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test`, `micatro_mod_version_pin`).

### The owner's Regi trio (2026-10-28, branch `feat/pokermon-regi-trio`)
Pinned **`3.9.1+r31`** (`contentRev: 31`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Regirock (377), Regice (378) and Registeel (379):
three **Legendary $20** single jokers (no family) in `jokers/pokejokers_designs.js` (47 defs now), after Metagross in Pokédex order. They reach a run
like Pokermon's other Legendaries: The Soul / the Legendary pool. Types from the card art (the type icon on each 3.9.1 cell): **Regirock Earth,
Regice Water, Registeel Metal**. Neither Nacho nor Pokermon+ has them.
- **Regirock**, Stone Body: **Stone cards give +100 Chips instead of +50** (hook `chip_bonus`, a Card:get_chip_bonus wrap: real Stone cards, their
  `perma_bonus` on top; the best undebuffed Regirock's value) and **permanently gain +10 Chips each time they score** (`perma_bonus`, as Rhyhorn /
  Hiker; a retrigger scores and grows again; Blueprint copies the growth).
- **Regice**, Ice Body: **Glass cards never shatter**: its `fix_probability` fixes the identifier-`'glass'` roll (the Glass card's 1 in 4, and a
  quantum Glass's) to 0, as Absol fixes every roll. Nothing is destroyed, so `remove_playing_cards` never fires: Glass Joker and the Whismur line
  count no break. Deliberate destruction (Hanged Man, a destroying joker) is not the roll and still destroys.
- **Registeel**, Iron Body: **Steel cards held in hand give X2 instead of X1.5** (hook `chip_h_x_mult`, the Steel card's own held effect, so a Red
  Seal / Mime retrigger repeats it; scaled as a ratio, so Nacho's Dhelmise and Pokermon+'s perma_h_x_mult still multiply on top).
- **Regi Trio**: when a Blind is selected each converts **1 + (OTHER Regi species you have)** random cards of the full deck to its enhancement (Stone /
  Glass / Steel): all three = 3 each. **Distinct species, undebuffed**: a twin of the same Regi (Showman) never counts, two Regirocks count once for a
  Regice, a debuffed Regi neither counts nor converts. Picks: the run's seeded `pseudorandom_element` over `G.playing_cards`, **unenhanced cards
  first**; once none is left, any card not already that enhancement (**it overwrites** the other enhancement, keeping seal and edition); never a card
  that already has it. Blueprint copies the conversion (Marble Joker's moment).
- **Energy**: Regirock `chips1` +30% (100 -> 130 / 160 / 190) and `chip_mod` +20% (10 -> 12 / 14 / 16); Registeel `Xmult_multi` +5% (X2 -> X2.1 /
  X2.2 / X2.3); Regice `glass_convert`, a new house energy field (systems/energy.js, coefficient 1 = its whole base): **+1 Glass card per Blind per
  Energy** (1 -> 2 / 3 / 4, before the trio's +1 per other Regi; a mismatched Colorless +0.5, floored).
- **Text**: the convert count on each tooltip ("{C:attention}N{} random card(s)"), "(+1 for each other Regi)"; Regice "(Each Energy: +1 card)". The
  Stone / Steel cards' own tooltips show the live value (follow-up, branch `feat/pokermon-gen3-legendaries`): +100 Chips (+ the card's banked
  `perma_bonus`, energized 130 / 160 / 190) with Regirock, X2 (X2.1 / X2.2 / X2.3) with Registeel. The engine's `enh_live_vars` (describe.js; the
  board's in-hand tooltip through cardView `enh_vars` -> markup.js describePlaying) asks the pure hook `enh_loc_vars`, which Pokermon answers with
  the same `regi_chip_bonus` / `regi_h_x_mult` its scoring hooks use (`pokermon_regi_tooltips_test`).
- **Art: upstream's own** (Natdex {2,25} / {4,25} / {6,25}, each with its floating soul {3,25} / {5,25} / {7,25}). Nothing to deploy for the mod.
  The wiki drops them.
- **Tests**: `micatro/tests/mods/pokermon_regis_test.mjs` (8 passed / 13 failed on origin/main; 75 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 47 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (865 jokers).

### The owner's Starly line (2026-10-28, branch `feat/pokermon-starly-line`)
Pinned **`3.9.1+r32`** (`contentRev: 32`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Starly (396) -> Staravia (397) -> Staraptor (398),
all **Colorless** (upstream's cells show the white Colorless frame and star), in `jokers/pokejokers_designs.js` (50 defs now), after Deoxys in
Pokédex order (Pokermon has no joker for 387-395). Neither Nacho nor Pokermon+ has the line.
- **Starly** (Basic, **Uncommon $6**), Flock: **+2 Mult for each Colorless Joker** you have, itself included. Evolves after **4 rounds**.
- **Staravia** (Stage 1, **Safari $8**), Flock: **+4 Mult** per Colorless Joker, itself included. Evolves after **5 rounds**.
- **Staraptor** (Stage 2, **Safari $10**), Brave Bird: **X(1 + 0.5 per Colorless Joker)**, itself included; **Recoil**: each hand played
  loses **$1** (`ease_dollars`, in `before`), only while the money stays at or above the run's debt limit (`bankrupt_at`: $0, -$20 with Credit
  Card), so it never pushes past what the shop allows. Not copied by Blueprint (which copies the X Mult); a debuffed Staraptor pays nothing.
- **Counting** (`flock_count`): `is_type(j, 'Colorless')` and not debuffed, +1 for itself; Tera stickers count (and a non-Colorless sticker takes
  a joker out); Castform counts only while Normal. Miltank's `find_pokemon_type` (debuffed too) is unchanged.
- **Energy**: Starly / Staravia's per-joker `mult` (+40% of base: 2 -> 2.8 / 3.6 / 4.4, 4 -> 5.6 / 7.2 / 8.8), Staraptor's per-joker
  `Xmult_mod` (+20%: 0.5 -> 0.6 / 0.7 / 0.8), re-applied on each evolution. The $1 `recoil` is fixed.
- **Text**: the tooltips show the count and the current Mult / X ("(Currently 3: +6 Mult)", "(Currently 3: X2.5 Mult)").
- **Art: upstream's own** (Natdex {10,26} / {12,26} / {14,26}). Nothing to deploy for the mod. The wiki drops them (396 missing).
- **Tests**: `micatro/tests/mods/pokermon_starly_test.mjs` (3 passed / 14 failed on origin/main; 70 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 50 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (868 jokers).

### The owner's Gen 3 Legendaries (2026-10-28, branch `feat/pokermon-gen3-legendaries`)
Pinned **`3.9.1+r33`** (`contentRev: 33`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Latias (380), Latios (381), Kyogre (382), Groudon
(383) and Rayquaza (384): five **Legendary $20** single jokers in `jokers/pokejokers_designs.js` (55 defs now), after Registeel in Pokédex order
(Jirachi 385 next). They reach a run like Pokermon's other Legendaries: The Soul / the Legendary pool. Types from the card art: **Latias and Latios
Psychic, Kyogre Water, Groudon Earth, Rayquaza Dragon** (`tools/micatro/pokermon_art_type.mjs`). Neither Nacho nor Pokermon+ has any of them.
- **Kyogre**, Primordial Sea: **+1 hand each round** (round_resets, added / removed like the Squirtle line); **every scored Club retriggers once**;
  **Castform is locked Rainy**. Energy-inert by design (`poke_no_energy_field`: the hand and the retrigger are fixed; Kyogre has no number).
- **Groudon**, Desolate Land: **+1 discard each round**; **scored Hearts and Diamonds each give X1.25 Mult** (`Xmult_multi`); **Castform is
  locked Sunny**.
- **Primal Clash** (both held undebuffed, no undebuffed Rayquaza): the round's weather is read ONCE on the round's first deal (Castform's moment,
  `primal_read`, cached in `G.GAME.poke_primal` so whichever of Kyogre / Groudon / Castform reads first decides for all): Clubs held vs Hearts +
  Diamonds held (Castform's counting: Wild both; debuffed / Stone / Hazard neither; Spades nothing). More Clubs: **Kyogre's round**; more red:
  **Groudon's round**. **Tie: the one with more Energy (its best copy's); still tied, Kyogre.** The other does nothing that round: no effect, and
  its +1 hand / +1 discard is taken back at the read (never below 1 hand / 0 discards; `primal_taken` keeps selling it from taking it twice; one
  gained mid-round as the loser gives nothing until the next round). The decision holds for the whole round; Castform follows the winner's weather.
- **Rayquaza**, Delta Stream: while held, **Kyogre and Groudon both work every round** (no clash). **Castform then reads its normal forecast**
  (the weather is calmed, not doubly locked). Dragon Ascent: **permanently gains X0.2 Mult each time a played hand contains a Straight or a Flush**
  (`poker_hands.Straight` / `.Flush`, in `before`; a Straight Flush grows once). Banked in `ascent_Xmult`; Blueprint copies the X, not the growth.
- **Latias**, Mist Ball: **X0.15 Mult each time you use a Tarot**; **Latios**, Luster Purge: **X0.15 per Planet**. **Soul Dew**: holding both
  (`find_card`: a debuffed partner breaks it), every Tarot OR Planet grows both. Banked in `eon_Xmult`; Blueprint copies the X, never grows.
- **Castform** (`castform_lock`): Kyogre -> Rainy, Groudon -> Sunny, both -> the clash winner's, Rayquaza -> no lock. Its effect and type follow
  the locked form; it is Normal again after the round, as before. Its tooltip adds "Kyogre / Groudon lock its weather".
- **Energy** (the standard shares): Groudon `Xmult_multi` +5% (X1.25 -> **X1.3125 / X1.375 / X1.4375**); Rayquaza's gain `Xmult_mod` +20% (0.2 ->
  **0.24 / 0.28 / 0.32**); Latias / Latios `Xmult_mod` +20% (0.15 -> **0.18 / 0.21 / 0.24**). The banks are in no energy field (never raised by
  Energy). Fixed: Kyogre's +1 hand and retrigger, Groudon's +1 discard.
- **Art: upstream's own** (Natdex {8,25} / {10,25} / {12,25} / {14,25} / {16,25}, each with its floating soul one cell right). Nothing to deploy for
  the mod. The wiki drops them.
- **Tests**: `micatro/tests/mods/pokermon_gen3_legendaries_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 55 defs), `pokermon_regis_test` (Pokédex order), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (873 jokers).
### The owner's Chatot + Pachirisu (2026-10-28, branch `feat/pokermon-chatot-pachirisu`)
Pinned **`3.9.1+r34`** (`contentRev: 34`; `LEGACY_MOD_VERSIONS` untouched). Two single-stage **Rare $7** Basics in `jokers/pokejokers_designs.js`
(57 defs now), typed by their card art: **Chatot (441) Colorless**, after Happiny; **Pachirisu (417) Lightning**, after Roserade (after Vespiquen since the Combee line). Neither Nacho
nor Pokermon+ has either.
- **Chatot**, Vocabulary: **+4 Mult for each different poker hand type played this run** (`G.GAME.hands[h].played > 0`: the run's own
  records, which never reset during a run, so a late Chatot counts hands played before it was bought; secret hands count; the hand being
  played counts at once). New Word: in `before`, a hand whose run count just became 1 creates **that hand's Planet** with consumable room
  (the Blue Seal's buffer check). Only while Chatot is held (a type first played without it never grants later); each Chatot records what it
  granted (`new_words`), so it never grants twice for a type. Blueprint copies the Mult, not New Word. A debuffed hand has no `before`.
- **Pachirisu**, Quick Spark: the **first hand of each round** (`current_round.hands_played === 0`) gives **X2**; Nuzzle: **+X0.25 for each
  OTHER Lightning Joker** (`is_type`, Tera stickers count, debuffed don't). Cheek Pouch: at end of round **$1 for each Lightning Joker, itself
  included** (`calc_dollar_bonus`, a cash-out row). Blueprint copies the first-hand X (Blueprint isn't Lightning), never the Cheek Pouch.
- **Energy**: Chatot's per-type `mult` (+40%: 4 -> 5.6 / 7.2 / 8.8; the Planets fixed); Pachirisu's `Xmult` (+20%: 2 -> 2.4 / 2.8 / 3.2) and
  `Xmult_mod` (+20%: 0.25 -> 0.3 / 0.35 / 0.4); the $1 `pouch` is fixed.
- **Text**: Chatot "(Currently 5: +20 Mult)"; Pachirisu "(Currently X2.5, Active!)" / "Used this round" and "(Currently $3)".
- **Art: upstream's own** (Natdex {10,29} / {22,27}). Nothing to deploy for the mod. The wiki drops them.
- **Tests**: `micatro/tests/mods/pokermon_chatot_pachirisu_test.mjs` (4 passed / 13 failed on origin/main; 73 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 57 defs, Happiny > Chatot > Spiritomb), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (875 jokers).
### The owner's Glameow line (2026-10-28, branch `feat/pokermon-glameow-line`)
Pinned **`3.9.1+r35`** (`contentRev: 35`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Glameow (431) -> Purugly (432), both
**Colorless** (upstream's cells show the white Colorless frame), in `jokers/pokejokers_designs.js` (59 defs now), after Honchkrow in Pokédex
order. Neither Nacho nor Pokermon+ has the line.
- **Glameow** (Basic, **Common $5**), Fickle: a **favourite suit**, picked when first obtained (`add_to_deck`) and again at **each end of round**
  (Ancient Joker's pick: the run's seeded `pseudorandom_element` over the suits minus the current one, `'fickle' + ante`), so never the same
  suit twice running; held on `card.ability.fav_suit` (kept through the evolution's `set_ability`). Never picked on creation: a shop /
  collection card would draw from the run's seed outside the recipe ("Favourite: picked when obtained"). **Scored cards of its favourite
  suit each give +5 Mult** (`is_suit`: Wild cards, Smeared Joker). Evolves after **5 rounds**, **only with a free Joker slot**.
- **Purugly** (Stage 1, **Safari $8**), Thick Fat: **-1 Joker slot** while held (`G.jokers.config.card_limit`, paid in `add_to_deck`,
  refunded in `remove_from_deck`: sold, destroyed, or turned into another joker). A debuff KEEPS the cost (as vanilla keeps a Negative's
  slot, `queue_negative_removal`: `ability.poke_slot_queued`), so lifting a debuff never puts the jokers over the limit; a debuffed Purugly
  that leaves is refunded by index.js's `card_removed` hook (`slot_cost_removed`). A **Negative** Purugly nets 0. Fickle as Glameow's:
  **scored cards of its favourite suit each give X1.25 Mult**.
- **Evolution with full slots** (owner-approved): Glameow evolves only if a slot is free now (`cards + joker_buffer < card_limit`), so after
  the -1 every joker still fits. Otherwise it stays at 0 rounds ("Needs a slot!") and evolves at the first end of round with a free slot.
  Never pushes a joker out. Committing reserves the slot in `G.GAME.joker_buffer` (as Riff-raff) until the queued evolution lands, so two
  Glameows ready in one round never both take the last slot. The footer says "(Needs a free Joker slot to evolve)".
- **Energy** (the standard shares): Glameow's per-card `mult` +40% (5 -> **7 / 9 / 11**), Purugly's per-card `Xmult_multi` +5% (X1.25 ->
  **X1.3125 / X1.375 / X1.4375**), re-applied on evolution. The slot cost (`slot_cost`) is fixed.
- **Art: upstream's own** (Natdex {20,28} / {22,28}). Nothing to deploy for the mod. The wiki drops them (389 missing).
- **Tests**: `micatro/tests/mods/pokermon_glameow_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 59 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (877 jokers).

### The owner's Drifloon line (2026-10-28, branch `feat/pokermon-drifloon-line`)
Pinned **`3.9.1+r36`** (`contentRev: 36`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Drifloon (425) -> Drifblim (426), both
**Psychic** (Ghost/Flying; upstream's cells draw the Psychic frame), in `jokers/pokejokers_designs.js` (61 defs now), after Ambipom in Pokédex
order. Neither Nacho nor Pokermon+ has the line.
- **Stockpile** (Gulpin's counter and `stockpile_max` energy field, reused through `stock_max`): each PLAYER discard action gains **1 Stockpile**
  up to max — **once per discard, not per card**; an effect's discard (`hook`: The Hook, seals) gains nothing. The Stockpile is kept between
  rounds; only a Spit Up empties it.
- **Spit Up**: on the round's **final hand** (`hands_left === 0` in joker_main, Acrobat's check) **X(1 + 0.5 per Stockpile)**, then the
  Stockpile resets to 0. 0 Stockpile: nothing, and it doesn't count. The joker marks the Spit Up in joker_main and resets / counts it in
  `after`, so a Blueprint (scored before) and a Brainstorm (scored after) both copy the full X; neither adds or resets.
- **Drifloon** (Basic, **Common $5**): max **3**; evolves after **4 Spit Ups** ("Spit Ups: k/4"). Stockpile and Energy carry into Drifblim.
- **Drifblim** (Stage 1, **Safari $8**): max **5** (`stockpile_max` 3 + a fixed `stockpile_bonus` 2, so Energy still adds exactly +1);
  **Aftermath**: when **sold** (`selling_self`) or **destroyed** (`hooks.start_dissolve` -> `drifblim_destroyed`: Ceremonial Dagger, Madness,
  Hex, Ankh, Pokermon eaters) it creates a **Negative Spectral card** (random, the seeded create_card roll, key_append `drifblim`; Negative, so
  it works with full slots). Not when it evolves or transforms (set_ability: no dissolve), not from a Blueprint copy, not while debuffed.
- **Energy**: +1 max Stockpile each (Drifloon 3 -> 4 / 5 / 6, Drifblim 5 -> 6 / 7 / 8), a mismatched Colorless +0.5 (floored: one adds
  nothing, two add 1). The X0.5 per Stockpile (`spit_Xmult`) is fixed.
- **Art: upstream's own** (Natdex {8,28} / {10,28}). Nothing to deploy for the mod. The wiki drops them (385 missing).
- **Tests**: `micatro/tests/mods/pokermon_drifloon_test.mjs` (2 passed / 18 failed on origin/main; 62 / 0 here). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 61 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (879 jokers).

### The owner's Burmy line (2026-10-28, branch `feat/pokermon-burmy-line`)
Pinned **`3.9.1+r37`** (`contentRev: 37`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Burmy (412) -> Wormadam (413, Female) /
Mothim (414, Male), in `jokers/pokejokers_designs.js` (64 defs now), after Roserade in Pokédex order (Pokermon has no joker for 408-411).
Neither Nacho nor Pokermon+ has the line.
- **Burmy** (Basic, **Common $5**, Grass to start). **Cloak**: at the end of each round (the main `end_of_round` pass, not Blueprint) it wears the
  cloak of the **biggest of three piles in the full deck** (`cloak_of_deck`, each card by its own enhancement: **Stone** cards -> **Sandy**'s pile,
  **Steel** cards -> **Trash**'s, **every other card** (unenhanced, Glass, Gold, Lucky, Bonus, Mult, Wild, Seed, Flower, Hazard, any mod's) ->
  **Plant**'s). A **tie** between the biggest piles **keeps the cloak**. **`3.9.1+r41`** (the owner's ruling, branch `feat/pokermon-burmy-plant-count`):
  "any other enhancement counts as Plant" means those cards add to Plant's count, so 20 unenhanced + 10 Glass (Plant 30) beat 22 Stone; r37-r40
  counted each enhancement as its own kind (22 Stone won). Re-recorded: `pokermon_burmy_test`, `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test`, `micatro_mod_version_pin`. Starts as Plant. **Plant** (Grass): **+5 Mult** (`mult1`); **Sandy** (Earth): **+40 Chips** (`chips1`); **Trash** (Metal): **$1** at end
  of round (`calc_dollar_bonus`, `trash_money`, fixed; the cloak is re-read before the cash-out, so it pays the round it turns Trash).
  Its type is its cloak's (`ability.extra.ptype`, as Castform; a Tera sticker still owns the type), its card the cloak's.
- **Gender**: rolled once when the card is created (`set_ability` initial: shop, pack, Pokéball, starting joker), with the run's seeded
  `pseudorandom('burmy_gender')`: Female or Male, on `ability.extra.gender` (saved with the card; a resume replays the recipe and rolls the same).
  The tooltip says ♀ / ♂: m6x11plus draws both signs (tools/micatro/add_gender_glyphs.py; until then it said "Female" / "Male",
  as upstream writes "Nidoran F" — ours is Nidoran♀ / Nidoran♂ now, keys unchanged).
- **Evolves after 4 rounds**: Female -> **Wormadam**, keeping its cloak (`form` is one of the values every evolution keeps; a POST_EVOLVE hook
  re-applies the cloak's type), Male -> **Mothim**.
- **Wormadam** (Stage 1, **Safari $8**), **Cloaked**: the cloak is locked. Plant (Grass): each scored **unenhanced** card **+3 Mult** (`mult1`);
  Sandy (Earth): each scored **Stone** card **X1.5** (`Xmult_multi`); Trash (Metal): each **Steel** card held in hand at end of round earns **$1**
  (`steel_money`, fixed; Mime / a Red Seal repeat it, as a Gold card's).
- **Mothim** (Stage 1, **Safari $8**, Grass: its card), **Free Flight**: **X(1 + 0.25 per different enhancement in the full deck)**, of the 8
  vanilla enhancements + Pokermon's Seed and Flower (not Hazard, not the April Fools Ludicolo): up to X3.5.
- **Energy** (the standard shares, every cloak's at once): Burmy `mult1` +40% (5 -> **7 / 9 / 11**), `chips1` +30% (40 -> **52 / 64 / 76**);
  Wormadam `mult1` (3 -> **4.2 / 5.4 / 6.6**), `Xmult_multi` +5% (1.5 -> **1.575 / 1.65 / 1.725**); Mothim `Xmult_mod` +20% (0.25 -> **0.3 / 0.35 /
  0.4**). The $ are fixed. Energy carries through evolution (re-applied to the new base).
- **Monotype**: Burmy is `poke_mono_exempt` (its cloak type never counts, as Castform). Wormadam's locked type and Mothim are checked like any joker:
  a Sandy (Earth) Wormadam, gained as a Grass Burmy, breaks a Fire run.
- **Art: upstream's own**: the Gen 4 sheet's row 0 has all six cloak cards (Burmy Plant / Sandy / Trash {0,0} / {2,0} / {4,0}, Wormadam {6,0} / {8,0}
  / {10,0}, with Shiny twins; pokespriteload.lua lists only the Plant cells), drawn per cloak by `systems/anim.js` BURMY_SPRITES + `ui.js` ownFace;
  Mothim Natdex {16,27}. `pokermon_art_type` reads Plant Grass, Sandy Earth, Trash Metal, Mothim Grass. Nothing to deploy for the mod. The wiki
  drops them (388 missing).
- **Tests**: `micatro/tests/mods/pokermon_burmy_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 64 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (882 jokers); `pokermon_art_types_test` checks the cloak cells.

### The owner's Combee line (2026-10-28, branch `feat/pokermon-combee-line`)
Pinned **`3.9.1+r38`** (`contentRev: 38`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Combee (415) -> Vespiquen (416), both **Grass**
(upstream's cells show the green Grass frame; `pokermon_art_types_test` agrees), in `jokers/pokejokers_designs.js` (66 defs now), after Mothim in
Pokédex order (Pachirisu 417 now comes after Vespiquen). Neither Nacho nor Pokermon+ has the line. Every Combee evolves (the female-only rule is not used).
- **Combee** (Basic, **Common $5**), Honey Gather: **at end of round, the Jokers directly left and right each gain +$1 sell value** (`honey`;
  `ability.extra_value` + `set_cost`, the Smoliv line's field; `poke_get_adjacent_jokers`, Magneton's / Dolliv's neighbours). Nothing on an
  empty side; never itself; a debuffed Combee gives nothing (a debuffed neighbour still gains). Evolves after **5 rounds**. Not Blueprint-compatible.
- **Vespiquen** (Stage 1, **Safari $8**), Honey Gather **+$2**; Attack Order: **X(1 + 0.1 per $ of the two neighbours' current sell value)**
  (`card.sell_cost`), **max X3** (`Xmult_cap`). The tooltip shows the cap and "(Currently $N: X… Mult)".
- **Energy**: the per-$ `Xmult_mod` (+20% of base: 0.1 -> **0.12 / 0.14 / 0.16**; a mismatched Colorless 0.11). The honey (+$1 / +$2) and the
  X3 cap are fixed. Combee carries the same `Xmult_mod` (unused by Combee) so it can take Energy, which evolution re-applies to Vespiquen's base.
- **Blueprint** copies Attack Order's X (computed from Vespiquen's own neighbours) and never the honey (`!context.blueprint`): no double feed.
- **Art: upstream's own** (Natdex {18,27} / {20,27}). Nothing to deploy for the mod. The wiki drops them (380 missing).
- **Tests**: `micatro/tests/mods/pokermon_combee_test.mjs` (4 passed / 14 failed on origin/main; 65 / 0 here). Re-recorded: `modpin_test`, `pokermon_chatot_pachirisu_test` (Pachirisu now after Vespiquen),
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 66 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (884 jokers).
  `runbadges_test`'s two Riff-raff checks now ban the Grass Commons from its roll (the fixed seed rolled Combee, a legal Grass Common, where
  they need an off-type one).

### The owner's Cherubi line (2026-10-28, branch `feat/pokermon-cherubi-line`)
Pinned **`3.9.1+r39`** (`contentRev: 39`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Cherubi (420) -> Cherrim (421), both **Grass**
(their upstream cards' icon), in `jokers/pokejokers_designs.js` (68 defs now), after Floatzel in Pokédex order. Neither Nacho nor Pokermon+ has them.
- **Cherubi** (Common $5), **Sweet Seeds**: when a Blind is selected, **1 random unenhanced card of the full deck becomes a Seed card** (seeded
  `pseudorandom_element`; none unenhanced, nothing — it never overwrites; Blueprint copies it); **+1 growth level** while owned (Shiftry's
  `growth` -> `G.GAME.poke_growth_level`, which the Seed card reads: it grows 2 a score and blooms on its **3rd** score instead of its 5th; off
  while debuffed; copies and Shiftry / Brambleghast stack). **Evolves after 2 of your Seeds bloom into Flowers** while it is held: the Seed card's
  bloom calls every owned undebuffed joker's `poke_seed_bloom` hook (`enhancements/enhancement1.js`), "(Bloomed: k/2)".
- **Cherrim** (Safari $8): Sweet Seeds; **Flower Gift**: Flower cards need only **3+ suits** (Roserade's rule: with both it is still 3, a minimum,
  never 2); **Sunshine Form**: while it's sunny, Flower cards give **X2.5 instead of X2** (Shaymin's +1 still on top: X3.5). The Flower card asks
  every owned undebuffed joker's `poke_flower_rule` -> {suits, x}: the fewest suits and the best X win.
- **Sunny** (`cherrim_sunny`): (a) the round's FIRST deal holds Hearts + Diamonds most, read by **Castform's own `forecast()`** (same counting:
  Wild all three, debuffed / Stone / Hazard none; a tie is not sunny), for the whole round; or (b) **Groudon held and working** (Desolate Land:
  undebuffed and not the loser of this round's Primal Clash, `primal_on`; live, so a Groudon gained or sold mid-round changes it at once).
  **Rayquaza doesn't remove Groudon's sun**: Delta Stream keeps Groudon working (it only un-locks Castform). Otherwise **Overcast**. In the shop
  only (b) counts. Tested against the real Groudon (on main since #859).
- **Energy**: the Sunshine X is `Xmult_multi` (the per-card X, +5% of base: **X2.625 / X2.75 / X2.875**; Colorless half: X2.5625). Cherubi carries
  the same field (it has no X of its own) so Energy used on it shows on its card and carries to Cherrim. Fixed: the conversion, the growth, the 3 suits.
- **Art: upstream's own**: Cherubi Natdex {28,27}; Cherrim's Overcast card Gen 4 {0,1} and its **Sunshine card Gen 4 {2,1}** (beside it on the 3.9.1
  sheet, unlisted in pokespriteload.lua; `systems/anim.js` CHERRIM_SPRITES, drawn by `ui.js` ownFace from the view's form, which the center's
  `poke_view_form` hook reads live). Shiny twins on the Gen 4 Shiny sheet. Nothing to deploy for the mod. The wiki drops both.
- **Tests**: `micatro/tests/mods/pokermon_cherubi_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 68 defs), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (886 jokers).

### The owner's Shellos line (2026-10-28, branch `feat/pokermon-shellos-line`)
Pinned **`3.9.1+r40`** (`contentRev: 40`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Shellos (422) -> Gastrodon (423), both **Water**
(both sea cards show the Water icon), in `jokers/pokejokers_designs.js` (70 defs now), after Cherrim in Pokédex order (Ambipom 424 next).
Neither Nacho nor Pokermon+ has the line.
- **The sea**: each card is **West or East**, rolled ONCE when it is created (`set_ability` initial, the run's seeded `pseudorandom('shellos_sea')`
  / `'gastrodon_sea'`), kept in `ability.extra.form` (copies, rounds, evolution: `NAMES_TO_KEEP`; save / resume rebuild the run from its recipe,
  so the same seed rolls the same sea).
- **Shellos** (Basic, **Common $5**), Tide Pool: West, the **leftmost** scored card gives **+40 Chips**; East, the **rightmost**. Evolves after
  **5 rounds**, keeping its sea. The end is by position: a debuffed card there scores nothing (the end never moves inward).
- **Gastrodon** (Stage 1, **Safari $8**), Tide: its sea's end card **retriggers once** and gives **+40 Chips each time it scores** (+80 with the
  retrigger). Storm Drain: each **Energy card used** (the Energy set: the 12 type Energies and Bird Energy, on any joker; not Double Rainbow, a
  Spectral, nor Berry Juice Energy, an Item) permanently gains **X0.1 Mult**, **X0.2 for Water Energy**. Banked in `drain_Xmult`; Blueprint copies
  the retrigger, the Chips and the X, never the growth. An Energy that energizes Gastrodon itself counts at its new gain (use() runs first).
- **Two Seas**: holding a West AND an East Shellos / Gastrodon (any mix, undebuffed; a Blueprint is not one), **every one works on both end
  cards**. A 1-card hand's card is both ends: once (one +40 per joker, one retrigger).
- **Energy**: the end card's `chips` +30% of base (40 -> **52 / 64 / 76**); Storm Drain's gain `Xmult_mod` +20% (0.1 -> **0.12 / 0.14 / 0.16**,
  Water twice that). The retrigger is fixed. Carried through evolution (energy_count re-applied to Gastrodon's base); never retroactive.
- **Art: upstream's own, per sea** (pokespriteload.lua lists two `base.pos` each on the Gen 4 sheet): **East Sea** (blue) = the first cell,
  each center's own card: Shellos {4,1}, Gastrodon {8,1}; **West Sea** (pink) = the second: Shellos {6,1}, Gastrodon {10,1} (`systems/anim.js`
  `SEA_SPRITES`, `ui.js` ownFace; the Shiny sheet's twins at the same cells). The Pokédex modal shows the family in the card's sea. Nothing to
  deploy for the mod. The wiki drops them (376 missing); the mods wiki shows one cell per joker (its East card).
- **Tests**: `micatro/tests/mods/pokermon_shellos_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 70 defs), `pokermon_art_types_test` (both seas Water), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (888 jokers).

### The owner's Stunky line (2026-10-28, branch `feat/pokermon-stunky-line`)
Pinned **`3.9.1+r42`** (`contentRev: 42`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Stunky (434) -> Skuntank (435), both **Dark**
(both cards show the Dark icon), in `jokers/pokejokers_designs.js` (`poison_gas`; 72 defs now), after Chingling in Pokédex order (Bronzor 436
next). Neither Nacho nor Pokermon+ has the line. They poison the BLIND: its score requirement drops between hands.
- **Stunky** (Basic, **Common $5**), Poison Gas: after each hand you play, the Blind's requirement drops by **4% of its starting requirement**.
  Evolves after **5 rounds**.
- **Skuntank** (Stage 1, **Safari $8**), Toxic: after the **nth** hand of the round, **n x 4%** (4, 8, 12, 16%: -40% after 4 drops).
- **The record**: one per Blind, shared by every copy, in `G.GAME.poke_poison` (`{round, base, cut}`, keyed by `G.GAME.round`, so it resets
  each Blind): `base` is the starting requirement, captured on the round's first deal (`first_hand_drawn`: after every `setting_blind` effect,
  so The Wall's x4 / Violet Vessel's x6 and a Chicot-disabled Wall's half are the base), or by the first drop (a Stunky that arrived mid-round).
- **Rules**: all copies together take off at most **75%** of the start (`POISON_CAP`), and the requirement never goes below **1 chip**. Copies
  stack additively; **Blueprint copies the drop** (its own "-4%"). Debuffed: nothing.
- **When**: in `context.after`, queued: it runs after the hand's chips are added (and `hands_played` counts it), before the engine's post-hand
  check (`STATES.HAND_PLAYED`). It does that check first: a hand that already beat the Blind, and the round's **final hand**, get no drop, so it
  never wins the hand that scored. If the lowered requirement is then at or below the chips already scored, **the Blind is won right there**,
  by the engine's check that follows, before the next draw (as a Blind that Chicot / Luchador disables is), with the remaining hands paid.
- **HUD**: the drop sets `blind.chips` / `chip_text` and emits `blind {action: 'chips'}`; `js/ui/board.js` now draws that event on the HUD's
  "Score at least" at that moment (Mika's Grudgeful emitted it before, unused). The view reads `blind.chips`. **Resume / replay**: the record
  lives in `G.GAME` and the run is rebuilt from its recipe, so a resume mid-Blind comes back with the same lowered requirement.
- **Energy**: `poison_pct` +20% of base per Energy (`systems/energy.js`, house: the gain rate): **4 -> 4.8 / 5.6 / 6.4%** (Skuntank's steps
  n x that), a mismatched Colorless +0.4; carried through evolution. The cap is a constant.
- **Art**: upstream 3.9.1's own (Natdex {26,28} / {28,28}); nothing to deploy. The wiki drops them (374 missing).
- **Tests**: `micatro/tests/mods/pokermon_stunky_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 72 defs), `pokermon_art_types_test` (both Dark), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (890 jokers).

### The owner's Gible line (2026-10-28, branch `feat/pokermon-gible-line`)
Pinned **`3.9.1+r43`** (`contentRev: 43`; `LEGACY_MOD_VERSIONS` untouched). The owner's design for Gible (443) -> Gabite (444) -> Garchomp
(445), all **Dragon** (all three cards show the Dragon icon), in `jokers/pokejokers_designs.js` (`bite` / `treasure_nest` / `dragon_rush_x`;
75 defs now), after Spiritomb in Pokédex order (Munchlax 446 next). Neither Nacho nor Pokermon+ has the line. Bite -> hoard -> cash in. No Mega
Garchomp here.
- **Gible** (Basic, **Uncommon $6**), Bite: when a hand **containing a Pair** scores (`poker_hands['Pair']` non-empty: Pair, Two Pair, Three /
  Four / Five of a Kind, Full House, Flush House, Flush Five), it permanently gains **+1 Mult for each scored card** (the scoring hand's
  undebuffed cards: a Pair +2, Two Pair +4, Full House +5, Four of a Kind +4), gained in `before` so that hand already gets it. It gives the
  bank every hand. Evolves at **+25** banked Mult (Dratini's `scaling_evo`; "(Evolves at +k / +25 Mult)").
- **Gabite** (Stage 1, **Safari $8**): keeps biting (+1 a scored card), and **Treasure Nest**: when a hand containing a **Full House** scores,
  **one** of its scored cards becomes a **Gold** card, in `context.after` (the card scores as what it was; Midas Mask's `set_ability`). The
  pick: seeded `pseudorandom_element` ('gabite_nest') over the scored cards that aren't debuffed, already Gold, or being destroyed (a
  shattered Glass card); **unenhanced first**, and only when none is left any other non-Gold card (overwritten, seal and edition kept).
  Evolves at end of round with **6 Gold cards in the full deck** (`G.playing_cards`, any Gold card, not only Gabite's; "(Gold cards: k/6)").
- **Garchomp** (Stage 2, **Safari $10**): the bank (it banks no more) and **Dragon Rush**: **X(1 + 0.5 per Gold card held in hand)**; a
  debuffed Gold card doesn't count. (3 held: X2.5, 5 held: X3.5.)
- **Energy**: the bank `bite_mult` is in no energy field (never retroactive; kept by `poke_custom_values_to_keep`); `mult_mod` +20%
  (**1 -> 1.2 / 1.4 / 1.6** a card, Colorless 1.1), Garchomp's `Xmult_mod` +20% (**0.5 -> 0.6 / 0.7 / 0.8** a Gold card). The conversion (one
  card) is fixed. Energy carries through both evolutions (re-applied to the new base).
- **Blueprint** copies the banked Mult and Garchomp's X; never the bank's growth or the Gold conversion.
- **Art**: upstream 3.9.1's own (Natdex {14,29} / {16,29} / {18,29}); nothing to deploy. The wiki drops them (371 missing).
- **Tests**: `micatro/tests/mods/pokermon_gible_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 75 defs), `pokermon_art_types_test` (all three Dragon), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (893 jokers).

### The owner's last Gen 4 regulars (2026-10-28, branch `feat/pokermon-gen4-regulars`)
Pinned **`3.9.1+r44`** (`contentRev: 44`; `LEGACY_MOD_VERSIONS` untouched). PR A of the owner-approved "last 18 Gen 4 jokers": Hippopotas (449)
-> Hippowdon (450), Skorupi (451) -> Drapion (452), Carnivine (455), Finneon (456) -> Lumineon (457), in `jokers/pokejokers_designs.js`
(`sand_stream` / `sand_stone` / `sniper` / `flytrap` / `luminous`; 82 defs now), after Mega Lucario in Pokédex order (Mantyke 458 next;
Croagunk / Toxicroak are Pokermon+'s). Types from their cards: Earth, Earth, Dark, Dark, Grass, Water, Water. Neither Nacho nor Pokermon+
has any of them.
- **Hippopotas** (Basic, **Common $5**, 5 rounds), Sand Stream: scored **Stone** cards give **+30 extra Chips** (a joker per-card effect on
  top of the Stone card's own +50, so it stacks with Regirock's +100: 5 + 100 + 30; Blueprint and retriggers repeat it).
- **Hippowdon** (Stage 1, **Safari $8**): **+60 extra**; and on **each round's first deal** (Castform's `first_deal`, its own `sand_round`:
  later draws never convert) **1 random unenhanced card held in hand becomes Stone** (seeded `'hippowdon_sand'`; none unenhanced: nothing,
  it never overwrites). CHOICE: the first deal, not end of round, so the new Stone card is playable that round. Fixed; not Blueprint.
- **Skorupi** (Basic, **Common $5**, 5 rounds), Sniper: each scored card has a **1 in 5** chance to crit for **X1.25**
  (`pseudorandom_probability` / `get_probability_vars`: Oops! All 6s 2 in 5, Absol 0). **Drapion** (Stage 1, **Safari $8**): **1 in 3** for
  **X1.5**; **Lucky cards always crit** (no roll, so Absol never stops them). Each retrigger rolls again; Blueprint rolls its own.
- **Carnivine** (Basic, single-stage, **Rare $7**), Flytrap: the round's **first player discard** (not an effect's `hook` discard;
  `discards_used` 0; once a round) devours its **leftmost card**: the discard pass returns `{ remove: true }`, so the engine destroys it
  (Trading Card / Entei / Magmar) and every joker's `remove_playing_cards` runs (Canio, Hydreigon...). Each devour banks **+4 Mult**
  (`devour_mult`), given every hand.
- **Finneon** (Basic, **Common $5**, 5 rounds): **+40 Chips on night hands** (each round's 2nd and 4th: Lunatone / Solrock's `is_day`).
  **Lumineon** (Stage 1, **Safari $8**): on night hands **each scored card +15 Chips**; with **Lunatone** (owned, undebuffed: `cosmic`) on
  day hands too.
- **Energy**: Hippopotas `chips` 30 -> 39 / 48 / 57, Hippowdon 60 -> 78 / 96 / 114; Skorupi `Xmult_multi` 1.25 -> 1.3125 / 1.375 / 1.4375,
  Drapion 1.5 -> 1.575 / 1.65 / 1.725 (the odds never); Carnivine `mult_mod` 4 -> 4.8 / 5.6 / 6.4 (the bank never retroactive); Finneon
  `chips` 40 -> 52 / 64 / 76, Lumineon 15 -> 19.5 / 24 / 28.5. Fixed: Hippowdon's conversion. Carried through evolution.
- **Art**: upstream 3.9.1's own Natdex cells ({26,29} / {28,29}, {0,30} / {2,30}, {8,30}, {10,30} / {12,30}); nothing to deploy. The wiki
  drops them (364 missing).
- **Tests**: `micatro/tests/mods/pokermon_gen4_regulars_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 82 defs), `pokermon_art_types_test`, `micatro_mod_version_pin`, `micatro_deckeditor_pages` (900 jokers).
### The owner's creation trio, Regigigas and Arceus (2026-10-28, branch `feat/pokermon-gen4-creation`)
Pinned **`3.9.1+r45`** (`contentRev: 45`; `LEGACY_MOD_VERSIONS` untouched). Batch C of the owner's "last 18 Gen 4 jokers": Dialga (483),
Palkia (484), Regigigas (486), Giratina (487) and Arceus (493), all **Legendary $20** (The Soul / the Legendary pool), in
`jokers/pokejokers_designs.js` (87 defs now). Pokédex order: Rotom's forms (479), Dialga, Palkia, Regigigas, Giratina, Shaymin (492);
Shaymin Sky, Arceus, Pansage. Types from the card art: Dialga **Metal**, Palkia **Water**, Giratina **Psychic** (Altered and Origin cards
both), Regigigas and Arceus **Colorless**. Neither Nacho nor Pokermon+ has any of them.
- **Dialga**, Roar of Time: the **first hand of each round is scored twice**: every scored card retriggers once (a `repetition` for each card
  of `G.play` while `hands_played === 0`; a discard first doesn't use it up). The cards' chips / mult / enhancements / seals and the per-card
  joker effects happen twice; the jokers' own hand effects (joker_main, after) and the hand's base run once, as for one hand. Blueprint copies
  it (a third scoring), as on Whiscash. Energy-inert (`poke_no_energy_field`).
- **Palkia**, Spacial Rend: **+1 Joker slot and +1 hand size** while held, given in `add_to_deck` and taken in `remove_from_deck`,
  **debuffs included** (a debuff takes both, lifting it gives both back). Nobody is ever pushed out: a debuff on a full row leaves it one Joker
  over the limit until one leaves (nothing can join meanwhile). Sold or destroyed it takes its own slot along (never over); a debuffed one
  leaving gives nothing back twice. A Negative Palkia: +2 slots (debuffed, the Negative's +1 stays, as vanilla). Energy-inert.
- **Regigigas**, Slow Start: gives nothing until its countdown `slow_start` (**5** when obtained) reaches **0**, then **X4 Mult** for the rest
  of the run. At each end of round (main pass; not Blueprint; a debuffed Regigigas waits) the countdown drops by **1 + the distinct Regis held**
  (Regirock / Regice / Registeel, undebuffed; two of one count once): none **5 rounds**, one 3, two 2; with **all three** the countdown goes
  straight to 0 (`giga_drop`), so it wakes after **1 round** (5, 0), and a trio assembled partway through the wait wakes it at the next end of
  round (the owner, contentRev **47**: "full trio can make it 1 round"; it was 2 rounds, 5, 1, 0, in r45-r46). The text adds "(With all three
  Regis: wakes after 1 round)"; the tooltip reads "Asleep: k left, wakes at end of round" with the trio. Awake, with all
  three Regis held, **each Regi converts 1 extra card per Blind** (`giga_trio_bonus` in `regi_converts`; once, however many Regigigas; the
  Regis' tooltips show it). Energy: `Xmult` **X4 -> X4.8 / X5.6 / X6.4**; the wait is fixed.
- **Giratina**, Shadow Force: permanently gains **X0.25 Mult for each playing card destroyed**, any cause (`remove_playing_cards`:
  Glass shattering, Hanged Man, the eaters...), banked in `shadow_Xmult` (not retroactive). **Origin Forme**: while an undebuffed Dialga or
  Palkia is held, the gain is **X0.5** and it shows the Origin card (Gen 4 **{10,3}** with its soul **{11,3}**: `systems/anim.js`
  `GIRATINA_ORIGIN`, `ui.js` ownFace, from the live `poke_view_form`). Energy: `Xmult_mod` **0.25 -> 0.3 / 0.35 / 0.4** (Origin 0.6 / 0.7 / 0.8).
  Blueprint copies the X, never the growth.
- **Arceus**, Multitype: **counts as every Pokermon type** (`center.poke_multitype`; `systems/types.js` `multitype`, read by `is_type`,
  `find_pokemon_type` and `energy.js` `energy_matches`): Barboach's Water / Earth Jokers (once), Starly's flock, Pachirisu's Lightning Jokers,
  the `find_pokemon_type` counters, and **every type's Energy energizes it at full strength**. Its own ptype stays Colorless; a Tera sticker
  gives it that one type instead. **Monotype: exempt** (`poke_mono_exempt`, Castform's flag; the Nuzlocke reads it as a Colorless gain).
  Judgment: **X(1 + 0.25 per different type among your Jokers)**: other undebuffed jokers by their shown type, an every-type joker (another
  Arceus, a Stellar Tera) as one type of its own, itself as one, at most 12 (X4). Energy: `Xmult_mod` **0.25 -> 0.3 / 0.35 / 0.4**.
- **Art**: upstream 3.9.1's own cells with their souls (Gen 4 Dialga {10,2}, Palkia {4,3}, Giratina {8,3} / Origin {10,3}, Arceus {4,4};
  Natdex Regigigas {10,32}); nothing to deploy. The wiki drops them (359 missing).
- **Tests**: `micatro/tests/mods/pokermon_gen4_creation_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 87 defs), `pokermon_art_types_test` (the five types + the Origin card), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (905 jokers).

### The owner's Lake trio, Cresselia, Manaphy and Phione (2026-10-28, branch `feat/pokermon-gen4-lake-trio`)
Pinned **`3.9.1+r46`** (`contentRev: 46`; `LEGACY_MOD_VERSIONS` untouched). Batch B of the owner's "last 18 Gen 4 jokers": six Legendaries,
all **Legendary $20** (The Soul / the Legendary pool), in `jokers/pokejokers_designs.js` (`lake_others` / `lunar_refresh` / `manaphy_egg`;
93 defs now). Pokédex order: Uxie, Mesprit, Azelf after Rotom (479, its last form), then (after the creation trio, Regigigas and Giratina: Dialga now follows Azelf) Cresselia, Phione,
Manaphy before Shaymin (492). Neither Nacho nor Pokermon+ has any of them.
- **Uxie** (480, **Psychic**), Knowledge: **+2 Foresight** (the Shinx line's `scry` add/remove); **each Foreseen card gives X1.3 Mult**. The
  choice: "a scored card that was Foreseen" is Pokermon's own Foresight scoring — the Foreseen cards (the top of the deck, `G.scry_view`)
  are scored like held cards (`context.individual` with `cardarea === G.scry_view`, Hoothoot's), so each one gives the X; a debuffed one
  gives nothing; any other joker's Foresight adds more cards (X1.3 each).
- **Mesprit** (481, **Psychic**), Emotion: **X1.5 Mult, or X2.5** when the hand's poker hand **hasn't been played yet this round**
  (`G.GAME.hands[scoring_name].played_this_round <= 1`: run.js counts the play before the jokers score, Abra's reading; it resets each round).
- **Azelf** (482, **Psychic**), Willpower: **X2.5 Mult on the final hand** of each round (`hands_left === 0` while it scores: Drifloon's /
  Acrobat's check).
- **Lake Guardians** (all three): **+X0.25** to the guardian's X values for each **other** guardian species held, undebuffed (`lake_others`,
  the Regi Trio's distinct count: a twin never counts, two Mesprits count once). One / two / three: Uxie **X1.3 / 1.55 / 1.8** a Foreseen
  card, Mesprit **X1.5 / 1.75 / 2** and **X2.5 / 2.75 / 3**, Azelf **X2.5 / 2.75 / 3**.
- **Cresselia** (488, **Psychic**), Lunar Blessing: while you have it (undebuffed), **playing cards can't be debuffed** — by a Boss Blind
  (The Goad, Head, Club, Window, Plant, Pillar, Verdant Leaf...) or anything else (a mod's `debuff_card`, an `SMODS.debuff_card` source).
  `systems/rules.js set_debuff` answers `'prevent_debuff'` for a playing card (Urshifu's Unseen Fist rule), which `Card:set_debuff` lets win
  outright. Gaining, losing or being debuffed queues the Blind's debuff pass over every playing card (`lunar_refresh`), so a Cresselia gained
  mid-Blind lifts the Boss's debuffs at once and one sold / destroyed / debuffed gives them back. Jokers can still be debuffed (Crimson Heart),
  Cresselia too. Also **X1.5 Mult**. **With Pokermon+'s Darkrai**: no rule between them (the choice). Darkrai never debuffs playing cards (a
  Nightmare when it joins, and held Energy lent to the jokers of its type), so the blessing has nothing to block; a held Psychic Energy
  energizes Cresselia through Darkrai like any Psychic joker (X1.5 -> X1.8), never the blessing.
- **Phione** (489, **Water**): **each Water Joker (itself included) gives +6 Mult**.
- **Manaphy** (490, **Water**), Sea Guardian: **each Water Joker (itself included) gives X1.2 Mult**; **Egg**: at the end of each shop
  (`ending_shop`), if there is a **free Joker slot** (Glameow's `slot_room`: cards + `joker_buffer` < limit; no slot, no roll), a **1 in 4**
  chance (`pseudorandom_probability`, seed `'manaphy_egg'`: the run's seeded stream; Oops! All 6s raises it) to create a **Phione**
  (`add_card`, key `j_poke_phione`), at the right end of the row. Created at once, so a second Manaphy sees the slot taken; Blueprint copies
  the X, never the Egg.
- Phione / Manaphy count Water Jokers in the **other_joker** context (Baseball Card's: each Water Joker shows its own bonus): `is_type`, so a
  Tera sticker counts (it replaces the type) and a debuffed joker gives nothing. Not a family (Phione never evolves).
- **Energy**: Uxie `Xmult_multi` +5% (**1.3 -> 1.365 / 1.43 / 1.495**), Mesprit `Xmult` / `Xmult2` +20% (**1.5 -> 1.8 / 2.1 / 2.4**,
  **2.5 -> 3 / 3.5 / 4**), Azelf `Xmult` +20% (**2.5 -> 3 / 3.5 / 4**), Cresselia `Xmult` +20% (**1.5 -> 1.8 / 2.1 / 2.4**), Phione `mult`
  +40% (**6 -> 8.4 / 10.8 / 13.2**), Manaphy `Xmult_multi` +5% (**1.2 -> 1.26 / 1.32 / 1.38**). Fixed: the +0.25 per guardian (`lake_mod`),
  Uxie's Foresight, Cresselia's blessing, the Egg's 1 in 4.
- **Art**: upstream 3.9.1's own cells with their floating souls (Natdex {28,31}, {0,32}, {2,32}, {14,32}, {16,32}, {18,32}); nothing to
  deploy. The wiki drops them (353 missing).
- **Tests**: `micatro/tests/mods/pokermon_gen4_lake_trio_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 93 defs), `pokermon_art_types_test` (four Psychic, two Water), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (911 jokers), `pokermon_gen4_creation_test` (Dialga now follows Azelf, Giratina is followed by Cresselia).

### The Gen 7 starters (2026-10-28, branch `feat/pokermon-starters-gen7`)
Pinned **`3.9.1+r48`** (`contentRev: 48`; `LEGACY_MOD_VERSIONS` untouched). The owner's "build" of the Gen 5-9 starters spec, Gen 7: the
Rowlet, Litten and Popplio lines, nine jokers in `jokers/pokejokers_designs.js` ("the Gen 7 starters": `shackle_calc` / `hands_before` /
`aria_calc`; 102 defs now). Pokédex order: after Xerneas (716), Rowlet ... Primarina (722-730), then Grubbin (736). Neither Nacho nor
Pokermon+ has these lines. Pokermon's starter rules:
- **Type perk at every stage** (fixed, never Energy): Grass **+1 hand size** (`h_size`, Bulbasaur's add/remove), Fire **+1 discard**
  (`d_size`, Charmander's), Water **+1 hand** (`hands`, Squirtle's). Across an evolution the old stage's perk is taken back and the new
  one's given, so it stays exactly +1 (tested).
- **Rarity / price**: the Basics **Uncommon $5** with `starter: true` and the `'starter'` attribute (the **Starter Pack**'s Grass / Fire /
  Water slots: `boosters/packs1.js starter_lists`); Stage 1 **Safari $8**, Stage 2 **Safari $10** (`'starter'` attribute, not Starter Pack
  candidates). Families: owning any stage keeps the line out of the pools.
- **Evolution**: by rounds, **5 then 5** (`level_evo`; the choice: the spec's "5 then 5", within Nacho's Turtwig 4 / 5 and Piplup 4 / 4).
- **Rowlet** (722, **Grass**): **the rightmost scored card retriggers once**. **Dartrix** (723): **twice**. **Decidueye** (724), Spirit
  Shackle: **twice, and it gives X1.3 Mult each time it scores** (the choice: a per-card X on the shackled card, so X1.3^3 = **X2.197** with
  both retriggers; a Blueprint copies both). "Rightmost" is by position in the scoring hand (the Shellos line's East Sea): a 1-card hand's
  card is it, a High Card's rightmost SCORED card is its one scoring card, and a debuffed card there gets nothing (the end never shifts).
- **Litten** (725, **Fire**): **+2 Mult per hand already played this round**; **Torracat** (726) **+4**; **Incineroar** (727) **X(1 + 0.25
  per hand)**. The choice: "already played" = the hands BEFORE this one (`current_round.hands_played`, still the pre-hand count while a hand
  scores), so the round's first hand gives nothing: Litten +0 / +2 / +4 / +6 on hands 1-4, Incineroar X1 / X1.25 / X1.5 / X1.75. Per round
  (it resets each round); discards don't count.
- **Popplio** (728, **Water**): **scored Hearts give +3 Mult**; **Brionne** (729) **+5**; **Primarina** (730), Sparkling Aria: **X1.2** per
  scored Heart (`is_suit`: Wild cards and Smeared Joker count; a retriggered Heart scores again).
- **Energy** (the standard shares): Rowlet line `Xmult_multi` +5% (**X1.3 -> 1.365 / 1.43 / 1.495**; Rowlet and Dartrix carry the field
  for Decidueye, the Combee pattern: their tooltip says "Energy carries to Decidueye"), Litten `mult` +40% (**2 -> 2.8 / 3.6 / 4.4**),
  Torracat (**4 -> 5.6 / 7.2 / 8.8**), Incineroar `Xmult_mod` +20% (**0.25 -> 0.3 / 0.35 / 0.4**), Popplio `mult` (**3 -> 4.2 / 5.4 / 6.6**),
  Brionne (**5 -> 7 / 9 / 11**), Primarina `Xmult_multi` +5% (**1.2 -> 1.26 / 1.32 / 1.38**). Fixed: the perks, the retrigger counts, the
  rounds. Energy carries through evolution (re-applied to the new stage's base). No banked values in these lines.
- **Art**: upstream 3.9.1's own cells (Natdex row 48: {2,48} Rowlet ... {18,48} Primarina); nothing to deploy. Types from the card art:
  Grass / Fire / Water (`pokermon_art_types_test`). The wiki drops them (344 missing).
- **Tests**: `micatro/tests/mods/pokermon_starters_gen7_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 102 defs), `pokermon_art_types_test`, `micatro_mod_version_pin`, `micatro_deckeditor_pages` (920 jokers).

### The Gen 8 starters (2026-10-28, branch `feat/pokermon-starters-gen8`)
Pinned **`3.9.1+r49`** (`contentRev: 49`; `LEGACY_MOD_VERSIONS` untouched). The owner's "build" of the missing Gen 5-9 starters, Gen 8's PR:
the Scorbunny and Sobble lines (the Grookey line is #830's), in `jokers/pokejokers_designs.js` (`libero_mult` / `libero_x` / `unscored_chips`
/ `snipe_target`; 108 defs now). Pokédex order: right after Rillaboom (812), Scorbunny ... Inteleon (813-818), then Nickit (827). Neither
Nacho nor Pokermon+ has either line.
- **Starter conventions**: the type perk at every stage (Fire **+1 discard**, the `discards` pair; Water **+1 hand**, the `hands` pair;
  an evolution keeps it at +1), **Scorbunny / Sobble Uncommon $5** with `starter: true` and the `'starter'` attribute (the Starter Pack's
  Fire / Water slot; their evolutions keep the attribute but not `starter`, as Thwackey), Stage 1 **Safari $8**, Stage 2 **Safari $10**;
  evolution **after 5 rounds, then 5** (`level_evo`; the Johto starters' timers, Cyndaquil / Totodile). Types are the card art's (Fire /
  Water, confirmed by `pokermon_art_types_test`).
- **Scorbunny** (813, Fire): **+3 Mult for each discard left**. **Raboot** (814): **+5**. **Cinderace** (815), Libero: **X(1 + 0.5 for each
  discard left)**. Read at `joker_main` (Cyndaquil's `cynda_calc`), so the joker's own unused discard counts; 0 left, nothing (X1).
- **Sobble** (816, Water): **each played card that doesn't score gives +20 Chips**. **Drizzile** (817): **+35**. The choice: "doesn't score"
  = in `full_hand` but not in `scoring_hand`, summed at `joker_main`. A debuffed card outside the scoring hand counts, a debuffed card in it
  doesn't (it is part of the scoring hand); Splash makes every card score (nothing); Stone cards always score.
- **Inteleon** (818, Water), Snipe Shot: **the highest-ranked scored card gives X2 Mult**. The choices: a tie goes to the **leftmost** (the
  first to score); the target is picked among scored cards that can score (a debuffed card or a rankless Stone card is never the target, so
  the X isn't lost to them); Ace high; re-read on each scoring, so a retrigger of the target (Red Seal, Blueprint) gives X2 again and a
  retrigger of another card doesn't.
- **Energy** (the main number only): Scorbunny `mult` **3 -> 4.2 / 5.4 / 6.6**, Raboot **5 -> 7 / 9 / 11**, Cinderace `Xmult_mod` **0.5 -> 0.6
  / 0.7 / 0.8**, Sobble `chips` **20 -> 26 / 32 / 38**, Drizzile **35 -> 45.5 / 56 / 66.5**, Inteleon `Xmult_multi` (a per-card X) **2 -> 2.1 /
  2.2 / 2.3**. Fixed: `d_size`, `hands`, `rounds`. Carried through evolution (re-applied to the new base).
- **Art**: upstream 3.9.1's own cells (Natdex {4..14, 54}); nothing to deploy. The wiki drops them (338 missing).
- **Tests**: `micatro/tests/mods/pokermon_starters_gen8_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 108 defs, Rillaboom > Scorbunny ... Inteleon > Nickit), `pokermon_art_types_test` (three Fire, three
  Water), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (926 jokers).

### The Gen 5 starters (2026-10-28, branch `feat/pokermon-starters-gen5`)
Pinned **`3.9.1+r50`** (`contentRev: 50`; `LEGACY_MOD_VERSIONS` untouched). The owner said "build" to the missing Gen 5-9 starters (one PR
per generation); this is Gen 5: the Snivy, Tepig and Oshawott lines, nine jokers in `jokers/pokejokers_designs.js` (`contrary_held` /
`contrary_lifts` / `flame_charge` / `razor_shell` / `shell_blade`; 117 defs now). Pokédex order: Snivy ... Samurott (495-503) right after
Arceus (493), before Pansage (511). Neither Nacho nor Pokermon+ has any of them.
- **Starter rules** (Pokermon's): the type's perk at **every stage** (Grass **+1 hand size**, the `hand_size` pair; Fire **+1 discard**, the
  `discards` pair; Water **+1 hand**, the `hands` pair; never doubled across an evolution), **Basic Uncommon $5** with `starter: true` (the
  Starter Pack's Grass / Fire / Water slots), **Stage 1 Safari $8**, **Stage 2 Safari $10**, all with the `starter` attribute; `level_evo`
  **5 rounds, then 5** (Chikorita's / Cyndaquil's / Totodile's timers). Types from their cards: **Grass**, **Fire** (Pignite / Emboar are
  Fire/Fighting; their cards show Fire), **Water**.
- **Snivy** (495) / **Servine** (496), Contrary: **each debuffed card held in hand gives +4 / +8 Mult** (`h_mult` in the held pass; any
  debuff: a Boss Blind's, a mod's; Mime and held retriggers repeat it; Blueprint copies it).
- **Serperior** (497), Contrary: **debuffed scored cards score as if not debuffed, and each gives X1.25 Mult**. The hook: a new engine seam,
  run.js `score_played_card` asks the mods' `score_debuffed` hook (Pokermon's `contrary_lifts`: a playing card while an undebuffed Serperior
  is owned) before giving up on a debuffed card; a yes lifts the debuff for that card's own scoring only (`debuff_lifted` set, restored in a
  `finally`), so it is still debuffed in hand, for the Glass break check and after the hand, and doesn't trigger the Boss Blind. Vanilla
  never asks (no mod active). The choices: Serperior drops the held +Mult (its Contrary is the payoff the line built to); held debuffed cards
  give it nothing. **Cresselia**: anti-synergy (no card can be debuffed, so Snivy / Servine count nothing and Serperior lifts nothing).
  **Boss Blinds**: The Goad / Head / Club / Window / Plant / Pillar and Verdant Leaf feed the line (held +Mult; scored with Serperior, the
  full score and X1.25).
- **Tepig** (498) / **Pignite** (499) / **Emboar** (500), Flame Charge: **+4 / +6 Mult, then X1 + X0.25, for each hand in a row of the same
  poker hand this round**. The choices: **within the round** (reset at end of round; `streak_round`), **this hand included** (the first
  hand of a type is 1 in a row: Tepig +4, Emboar X1.25), a new poker hand resets it to 1, a discard doesn't break it, a debuffed hand
  (The Eye, The Psychic) still counts (its `debuffed_hand` context) and scores nothing. Blueprint copies the payoff, never the count.
- **Oshawott** (501) / **Dewott** (502) / **Samurott** (503), Razor Shell: **the first 1 / 2 / 3 scored cards retrigger once** (by position,
  Urshifu Rapid Strike's rule; a debuffed one there isn't replaced); Samurott's Shell Blade: **scored Aces give X1.5 Mult** (each scoring:
  a retriggered Ace gives it twice). Oshawott / Dewott carry Samurott's `Xmult_multi` 1.5 unused ("Energy carries to Samurott": Combee's
  Energy for later), so Energy can be used on them and lands on Samurott's Aces.
- **Energy**: Snivy / Tepig `mult` +40% (**4 -> 5.6 / 7.2 / 8.8**), Servine (**8 -> 11.2 / 14.4 / 17.6**), Pignite (**6 -> 8.4 / 10.8 /
  13.2**), Serperior `Xmult_multi` +5% (**1.25 -> 1.3125 / 1.375 / 1.4375**), Emboar `Xmult_mod` +20% (**0.25 -> 0.3 / 0.35 / 0.4**), the
  Oshawott line `Xmult_multi` +5% (**1.5 -> 1.575 / 1.65 / 1.725**); re-applied to the new base at each evolution. Fixed: the perks, the
  retriggers / strikes, the timers, the streak.
- **Art**: upstream 3.9.1's own cells (Natdex {28,32}, then {0,33} ... {14,33}); nothing to deploy. The wiki drops them (329 missing, with the Gen 7 and Gen 8 lines).
- **Tests**: `micatro/tests/mods/pokermon_starters_gen5_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 117 defs), `pokermon_art_types_test` (the nine types), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (935 jokers), `pokermon_gen4_creation_test` (Arceus is now followed by Snivy).

### The owner's Gen 9 starters (2026-10-28, branch `feat/pokermon-starters-gen9`)
Pinned **`3.9.1+r51`** (`contentRev: 51`; `LEGACY_MOD_VERSIONS` untouched). The Fire and Water Gen 9 starter lines (Sprigatito's line was
already in), in `jokers/pokejokers_designs.js` (`bank` / `torch_song` / `moxie_bank` / `starter9_main`; 123 defs now). Pokédex order: after
Meowscarada (908), before Tarountula (917). Neither Nacho nor Pokermon+ has any of them. The starter conventions: the type perk at **every**
stage (fixed: Energy never touches `d_size` / `hands`), Basic **Uncommon $5** with `starter: true` + the `'starter'` attribute (the Starter
Pack's Fire / Water slot; its evolutions are not starters), Stage 1 **Safari $8**, Stage 2 **Safari $10**, `level_evo` **5 rounds, then 5**
(Cyndaquil's / Totodile's timers).
- **Fuecoco** (909, **Fire**), Torch Song: **+1 discard**; **permanently gains +1 Mult per hand played**. The choice: the gain is in `before`,
  so the hand being played counts itself (the first hand gives +1). Banked in `torch_mult` (no energy field); the gain `mult_mod`.
- **Crocalor** (910, **Fire**): +1 discard; Fuecoco's bank, **+2 Mult** per hand.
- **Skeledirge** (911, **Fire**): +1 discard; gives the banked Mult (it banks no more) and **permanently gains X0.05 Mult per hand played**
  (`torch_Xmult` from X1, gain `Xmult_mod`; the same `before` timing).
- **Quaxly** (912, **Water**), Moxie: **+1 hand**; **when you beat a Blind, permanently gains +4 Chips per unused hand**. The choice: "unused"
  = `G.GAME.current_round.hands_left` in the main end_of_round pass, i.e. the hands left after the winning hand; not on a game over; 0 left
  banks nothing. The gain runs before `level_evo` in the same pass, so the round it evolves still banks at Quaxly's rate. Banked in
  `moxie_chips`; the gain `chip_mod`.
- **Quaxwell** (913, **Water**): +1 hand; Quaxly's bank, **+6 Chips** per unused hand.
- **Quaquaval** (914, **Water**): +1 hand; gives the banked Chips (it banks no more) and **gains X0.2 Mult per unused hand** when you beat a
  Blind (`moxie_Xmult` from X1, gain `Xmult_mod`).
- **Banks** carry through both evolutions (`poke_custom_values_to_keep` on the stage evolving away) and are never raised by Energy (not
  retroactive). Blueprint copies what is given, never the growth.
- **Energy** (+20% of the gain's base each; the Energy count carries through evolution and is re-applied to the new base): Fuecoco
  `mult_mod` **1 -> 1.2 / 1.4 / 1.6**, Crocalor **2 -> 2.4 / 2.8 / 3.2**, Skeledirge `Xmult_mod` **0.05 -> 0.06 / 0.07 / 0.08**; Quaxly
  `chip_mod` **4 -> 4.8 / 5.6 / 6.4**, Quaxwell **6 -> 7.2 / 8.4 / 9.6**, Quaquaval `Xmult_mod` **0.2 -> 0.24 / 0.28 / 0.32**. Fixed: the
  perks, the timers.
- **Art**: upstream 3.9.1's own cells (Natdex 16 / 18 / 20 / 22 / 24 / 26, row 60), whose icons are Fire x3 and Water x3; nothing to deploy.
  The wiki drops them (323 missing).
- **Tests**: `micatro/tests/mods/pokermon_starters_gen9_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 123 defs), `pokermon_art_types_test` (three Fire, three Water), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (941 jokers).

### The Gen 6 starters (2026-10-28, branch `feat/pokermon-starters-gen6`)
Pinned **`3.9.1+r52`** (`contentRev: 52`; `LEGACY_MOD_VERSIONS` untouched). The owner's "build" of the missing Gen 5-9 starters, the Gen 6
PR: Chespin, Fennekin and Froakie's lines (9 jokers) in `jokers/pokejokers_designs.js` (`discards_scry` / `spiky_on` / `braixen_tarot` /
`mystical_fire` / `froak_count` / `protean_pick`; 132 defs now). Pokédex order: after Hydreigon (635), before Bunnelby (659). Neither Nacho nor
Pokermon+ has any of them.
- **Starter conventions** (Bulbasaur / Charmander / Squirtle, Chikorita / Cyndaquil / Totodile, Grookey / Sprigatito): a type perk at every
  stage, fixed (never energized) and taken back when the joker goes: Grass **+1 hand size** (`h_size`), Fire **+1 discard** (`d_size`), Water
  **+1 hand** (`hands`); an evolution swaps the perk, never doubles it. Basic **Uncommon $5** with `starter: true` (the Starter Pack's Grass /
  Fire / Water slots), Stage 1 **Safari $8**, Stage 2 **Safari $10**, every stage with the `starter` attribute. Evolution **5 rounds, then 5**
  (`level_evo`: Chikorita / Cyndaquil / Totodile's timers). Types = the cards' (Grass / Fire / Water; `pokermon_art_types_test`).
- **Chespin** (650) **+40 Chips**, **Quilladin** (651) **+80**, **Chesnaught** (652) **+150** and **Spiky Shield: X1.5 Mult while you have 2
  or more hands left**. The choice: counted BEFORE the hand is played, this hand included (run.js takes the hand before the jokers score, so
  while scoring it is `hands_left + 1 >= 2`): every hand but a round's last; in a 1-hand round never. The 2 (`hands_req`) is fixed.
- **Fennekin** (653) **+1 Foresight**; **Braixen** (654) +1 Foresight and the first time each round you discard a **Foreseen card**, create a
  **Tarot** (must have room). The choice: a Foreseen card is the top of the deck, which can't be discarded, so "discard a Foreseen card" reads
  as the house meaning of "a Foreseen card" (the Shinx line's `foreseen`): a discarded card that **shares a rank** with a Foreseen card. A
  player discard only (pre_discard with no `hook`: The Hook and the seals don't count); a debuffed card doesn't count. The Tarot is random
  from the seeded stream (`create_card('Tarot', ..., 'braixen')`). With no room nothing is made and the round's Tarot is NOT used up (a later
  Foreseen discard with room makes it); once made, not again that round (`tarot_round`). Not Blueprint (blueprint_compat false).
  **Delphox** (655) +1 Foresight; **Mystical Fire: permanently gains X0.2 Mult for each Tarot card used** (any Tarot, while held; the
  Latias shape: banked in `fire_Xmult`, Blueprint copies the X, never the gain). The Foresight and the discard are one combined add/remove
  pair (`discards_scry`).
- **Froakie** (656) **+30 Chips**, **Frogadier** (657) **+50** for each **Water Joker, itself included** (`froak_count`: the Barboach count with
  one type: `is_type`, so a Tera sticker, Castform's form and Arceus count; a debuffed joker doesn't; itself always +1).
  **Greninja** (658), Protean: **when a Blind is selected** it becomes the type most common among your other undebuffed Jokers (`protean_pick`:
  each of the 12 types counted with `is_type`, so Arceus / a Stellar Tera count for every type). **A tie for the most, or no typed joker:
  it keeps its current type** (not Water: whatever it is). It keeps that type through the shop until the next Blind. Its type is its
  `ability.extra.ptype` (Castform's rule: a Tera sticker still overrides; `set_debuff` and Kecleon re-synced). **X(1.5 + 0.5 for each
  OTHER Joker of its current type)** (`get_type`, undebuffed). **Monotype-exempt** (`poke_mono_exempt`, Castform's exemption: its type
  changes on its own). Blueprint copies the X, never Protean.
- **Energy**: Chespin / Quilladin / Chesnaught `chips` +30% (**40 -> 52 / 64 / 76**, **80 -> 104 / 128 / 152**, **150 -> 195 / 240 / 285**),
  Chesnaught `Xmult` +20% (**1.5 -> 1.8 / 2.1 / 2.4**); Delphox `Xmult_mod` +20% (**0.2 -> 0.24 / 0.28 / 0.32**), carried by Fennekin and
  Braixen ("Energy carries to Delphox": Combee's Energy for later); Froakie / Frogadier `chips` +30% (**30 -> 39 / 48 / 57**, **50 -> 65 / 80
  / 95**); Greninja `Xmult` and `Xmult_mod` +20% (**1.5 -> 1.8 / 2.1 / 2.4**, **0.5 -> 0.6 / 0.7 / 0.8**), its CURRENT type's Energy matching
  (Castform's rule). Fixed: the perks, the Foresight, the 2 hands, the Tarot. The bank (`fire_Xmult`) is never raised by Energy; Energy is
  re-applied to each new base on evolution.
- **Art**: upstream 3.9.1's own cells (Natdex 8, 10 ... 24, 43); nothing to deploy. The wiki drops them (314 missing).
- **Tests**: `micatro/tests/mods/pokermon_starters_gen6_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`,
  `pokermon_new_jokers_test` (the pin, 132 defs), `pokermon_art_types_test` (three Grass, three Fire, three Water), `micatro_mod_version_pin`,
  `micatro_deckeditor_pages` (950 jokers).

### Gen 5, batch 1 (2026-10-28, branch `feat/pokermon-gen5-batch1`)
Pinned **`3.9.1+r53`** (`contentRev: 53`; `LEGACY_MOD_VERSIONS` untouched). The owner's "Build it": 22 jokers, #504-539, in
`jokers/pokejokers_designs.js` (`lookout` / `pickup` / `pickpocket` / `super_luck` / `motor_count` / `heart_stamp` / `pillars` /
`swift_swim_raining` / `toss_target` / `dojo`; 154 defs now). Pokédex order: after Samurott (503), Musharna (518), Gigalith (526) and
Excadrill (530); Darumaka (554) follows Sawk. Neither Nacho nor Pokermon+ has any of them. Prices by the DESIGN_GUIDE slots (3-stage U $6 /
S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7); evolution by rounds (4 for an early evolver: Patrat, Lillipup, Purrloin, Pidove; 5
otherwise). Types = the cards' (`pokermon_art_types_test`). Art: upstream 3.9.1 cells (Natdex {16..28,33}, {16..24,34}, {2..26,35};
Unfezant Gen05 {0,0}, the first of its two); nothing to deploy. Energy at the standard share on each joker's main number; odds, Foresight,
money and retriggers are fixed; a stage whose own number is fixed carries its evolution's field ("Energy carries to ...").
- **Patrat** (C $5, 4 rounds) **+1 Foresight**, Lookout: **each Foreseen card gives +6 Mult**; **Watchog** (S $8) +2 Foresight, **+10**. The
  choice: "scored Foreseen cards" are Uxie's (the Foreseen cards are scored like held cards, `G.scry_view`), not the Shinx line's matching
  played cards; a debuffed Foreseen card gives nothing. Energy `mult` (6 -> 8.4 / 10.8 / 13.2; 10 -> 14 / 18 / 22).
- **Lillipup** (U $6, 4) Pickup: **1 in 4** at end of round, a random **Tarot**; **Herdier** (S $8, 5) **1 in 3** a Tarot or a Planet (a
  seeded coin); **Stoutland** (S $10) **1 in 2**, and **+3 Mult for each consumable held** (Negative ones too). With **no consumable room there
  is no roll** (the stream never moves; Manaphy's rule); `pseudorandom_probability` with each joker's own seed. Not Blueprint for the find.
  Energy: Stoutland `mult` 3 -> 4.2 / 5.4 / 6.6, carried by Lillipup and Herdier.
- **Purrloin** (C $5, 4) Pickpocket: **$2** at end of round (calc_dollar_bonus); **Liepard** (S $8) **$4**. The Joker **directly to its
  right** loses **$1 of sell value** (Pokermon's Drain one way, `poke_drain`: **never below $1**). The choice: **nothing on its right** (the
  right end, alone) means **no loss, and the money is still earned**; a debuffed neighbour still loses it; a debuffed Purrloin does nothing.
  Energy-inert (`poke_no_energy_field`: money and drain fixed).
- **Pidove** (U $6, 4) / **Tranquill** (S $8, 5) / **Unfezant** (S $10), Super Luck: **Lucky cards' odds +1** — the `mod_probability` pass
  (Venonat's) on the identifiers `lucky_mult` / `lucky_money` only. The choice, with Oops! All 6s: the +1 is added **before** Oops! doubles
  the numerator, so one Pidove + Oops! is **(1 + 1) x 2 = 4 in 5** (and 4 in 15); Venonat and other copies add +1 each; Absol fixes it at 0.
  Tranquill: a Lucky card that triggers **also gives +5 Mult**; Unfezant: **X1.5** instead (the + becomes X; it doesn't keep the +5). All
  three are Colorless: Starly's flock counts them. Energy: Tranquill `mult` 5 -> 7 / 9 / 11 (carried by Pidove), Unfezant `Xmult_multi`
  1.5 -> 1.575 / 1.65 / 1.725.
- **Blitzle** (C $5, 5) Motor Drive: **+4 Mult for each hand played this round before any discard, this one included**. The counting: while no
  player discard has been used this round, it is (hands already played + 1): the 1st hand +4, the 2nd +8, the 3rd +12; after your first
  discard, **+0 for the rest of the round** (a discard before the first hand: +0 all round); The Hook's forced discards don't count; a new
  round starts again at +4. **Zebstrika** (S $8) **X1.5 if you haven't discarded this round**. Energy `mult` 4 -> 5.6 / 7.2 / 8.8, `Xmult`
  1.5 -> 1.8 / 2.1 / 2.4.
- **Woobat** (C $5, 5) Heart Stamp: **each scored Heart earns $1** (Rough Gem's; Wild cards count, debuffed cards don't); **Swoobat** (S $8)
  **$1 and X1.1** each. The $ is fixed; Energy `Xmult_multi` 1.1 -> 1.155 / 1.21 / 1.265, carried by Woobat.
- **Timburr** (U $6, 5) / **Gurdurr** (S $8, 5) / **Conkeldurr** (S $10): **scored Stone cards each give +4 / +8 Mult / +8 Mult and X1.5** —
  a joker effect on top of the Stone card's own Chips, so it stacks with Regirock (+100 instead of +50) and Hippowdon (+60 extra). Energy
  `mult` 4 -> 5.6 / 7.2 / 8.8, 8 -> 11.2 / 14.4 / 17.6; Conkeldurr keeps `mult` energized (so Gurdurr's Energy never shrinks on evolving)
  and `Xmult_multi` 1.5 -> 1.575 / 1.65 / 1.725.
- **Tympole** (U $6, 5) / **Palpitoad** (S $8, 5) / **Seismitoad** (S $10), Swift Swim: **+30 / +50 / +50 Chips, doubled while it's raining**;
  Seismitoad: in rain **every scored Club also retriggers once** (with Kyogre's own: twice). **Raining** = the round's first deal reads
  **Rainy** by Castform's `forecast()` (Clubs held most; a tie is not), remembered for the round, **or** a **working Kyogre** (held,
  undebuffed, not the loser of this round's Primal Clash: `primal_on`, live). So on Groudon's clash round it isn't raining (and the forecast
  can't be Rainy then); a tie Groudon wins on Energy: no rain; Rayquaza's calm keeps Kyogre, so rain. The choices: Groudon **alone** doesn't
  stop a Clubs forecast (Cherrim's sun the other way round); in the shop only Kyogre counts; a Tympole bought after the first deal has no
  forecast that round. Energy `chips` 30 -> 39 / 48 / 57, 50 -> 65 / 80 / 95 (then doubled); the retrigger is fixed.
- **Throh** (R $7) Seismic Toss: **the lowest-ranked scored card gives X2**; **Sawk** (R $7) Karate Chop: **the highest-ranked scored card
  gives +30 Mult**. Both: a tie goes to the **leftmost**, Stone and debuffed cards are skipped, **Aces are high** (for Throh too: an Ace is its
  target only when every candidate is an Ace); the target is re-read each time a card scores, so its retriggers hit again. **Dojo Rivals**:
  holding both (undebuffed; a Blueprint isn't one) **X2.5** / **+45** (fixed +X0.5 / +15). Energy `Xmult_multi` 2 -> 2.1 / 2.2 / 2.3, `mult`
  30 -> 42 / 54 / 66; the rival bonus stays.
- **Wiki**: regenerated (292 missing); the wiki sprites of the 22 are gone from `designwiki/sprites/pokermon_jokers/` (redeploy the sprites).
- **Tests**: `micatro/tests/mods/pokermon_gen5_batch1_test.mjs` (fails on main: 2 passed, 66 failed). Re-recorded: `modpin_test`,
  `pokermon_391_data_test`, `pokermon_new_jokers_test` (the pin, 154 defs, Darumaka after Sawk), `pokermon_art_types_test`,
  `micatro_mod_version_pin`, `micatro_deckeditor_pages` (972 jokers); the order checks of `pokermon_starters_gen5_test` (Patrat
  after Samurott) and `pokermon_391_new_15_test` (Roggenrola after Zebstrika); `designwiki_pokermon_jokers_test` spot-checks the Sewaddle line
  (Lillipup / Herdier / Stoutland have jokers now).

### Gen 5, batch 2 (2026-10-28, branch `feat/pokermon-gen5-batch2`)
Pinned **`3.9.1+r54`** (`contentRev: 54`; `LEGACY_MOD_VERSIONS` untouched). The owner's "Yes": 26 jokers, #540-573, in
`jokers/pokejokers_designs.js` (`tailor` / `leaf_blade` / `poison_point` / `prank_draw` / `flower_money` / `stripe_chips` / `blind_moxie` /
`hazard_held_mult` / `stone_shell` / `sigil_pair` / `grudge_sell` / `mummy_sell` / `ancient_nines` / `ancient_tens` / `tidy_up` / `skill_link`;
180 defs now). Pokédex order: Sewaddle ... Krookodile (540-553) after Sawk (539), before Darumaka (554); Maractus, Dwebble, Crustle (556-558)
after Darmanitan, before Scraggy; Sigilyph ... Archeops (561-567) after Scrafty, before Trubbish; Minccino, Cinccino (572-573) after Zoroark,
before Gothita. Neither Nacho nor Pokermon+ has any of them. Prices by the DESIGN_GUIDE slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8,
single-stage R $7: the fossils are Common $5 by that slot, where Pokermon's own fossils are Uncommon $5). Evolution by rounds (4 for an early
evolver: Sewaddle, Venipede; 5 otherwise); the fossils by the Ancient convention (their 3+ tier fired 5 times). Types = the cards'
(`pokermon_art_types_test`: Venipede and Sandile lines Dark, Dwebble line Earth). Art: upstream 3.9.1 cells (Natdex {28,35}, {0..24,36},
{0..22,37}, {2,38} / {4,38}; Basculin Gen 5 {4,0} Red / {6,0} Blue); nothing to deploy. A run.js seam: **`sell_instead`** (Mummy).
- **Sewaddle** (U $6, 4 rounds) / **Swadloon** (S $8, 5) / **Leavanny** (S $10), the tailor: when a Blind is selected, **1 random unenhanced
  card of the full deck** (seeded) becomes a **Bonus** card / a **Bonus or Mult** card / a **Bonus, Mult or Lucky** card (the cloth a second
  seeded pick; Cherubi's rule: none unenhanced, nothing, never an overwrite; Blueprint copies it). Leavanny: **each scored enhanced card +3
  Mult** (Stone and Hazard count). Energy `mult` 3 -> 4.2 / 5.4 / 6.6, carried by Sewaddle / Swadloon ("Energy carries to Leavanny").
- **Venipede** (U $6, 4) / **Whirlipede** (S $8, 5) / **Scolipede** (S $10), Poison Point: **each card you discard** (player discards only)
  permanently **-2 / -3 / -3 Chips** (`perma_bonus`) and **+3 / +5 / +5 Mult** (`perma_mult`); Scolipede: an **unenhanced** one also becomes a
  **Mult card**. The floor: perma_bonus never goes below minus the card's own Chips without it (rank + enhancement bonus), so a card's Chips
  stop at **0** (a 2 at -2, a Stone card at -50, a Hazard card loses nothing) and the Mult keeps growing. Blueprint copies it (Hiker's). Energy
  `mult_mod` 3 -> 3.6 / 4.2 / 4.8, 5 -> 6 / 7 / 8; `chip_loss` fixed.
- **Cottonee** (C $5, 5): **+1 hand size**; Prankster: **the round's first hand drawn draws 1 extra card**. The mechanism: +1 temporary hand size
  from the Blind's selection (the hand is empty then) until the first deal (`first_hand_drawn`), so that deal is one card over the hand size
  and later refills reach the normal size. **Whimsicott** (S $8): **+2 hand size**, fixed (never energized: the hand-size pitfall). Both
  Energy-inert.
- **Petilil** (C $5, 5): **each scored Flower card earns $1**; **Lilligant** (S $8): **$2**, and **Flower cards need only 3+ suits** (Cherrim's
  `poke_flower_rule`: the fewest suits asked wins, with Roserade / Cherrim it stays 3). Money fixed: Energy-inert.
- **Basculin** (R $7): its **stripe**, Red or Blue, **rolled once when created** (seeded 'basculin_stripe'; `extra.form`, so copies, saves and
  resumes keep it: Shellos's sea). **Red: scored Hearts and Diamonds +20 Chips each; Blue: Clubs and Spades** (a Wild card once). Upstream
  draws both (and a White-Striped one, unused) on the Gen 5 sheet: Red {4,0} is its own card, Blue {6,0} drawn by `ui.js` ownFace
  (`BASCULIN_SPRITES`, Shiny twins). Energy `chips` 20 -> 26 / 32 / 38.
- **Sandile** (U $6, 5) / **Krokorok** (S $8, 5) / **Krookodile** (S $10), Moxie: **when you beat a Blind**, permanently **+2 / +4 Mult**
  (`moxie_mult`), Krookodile **+X0.15** (`moxie_Xmult`) and it **still gives the banked Mult**. Gain first, then the countdown; never on a game
  over; not Blueprint (it copies the Mult / X); the bank is carried through both evolutions (`poke_custom_values_to_keep`). Energy `mult_mod`
  2 -> 2.4 / 2.8 / 3.2, 4 -> 4.8 / 5.6 / 6.4; `Xmult_mod` 0.15 -> 0.18 / 0.21 / 0.24 (never retroactive).
- **Maractus** (R $7): **each Hazard card held in hand +8 Mult** (`m_poke_hazard`, h_mult; a debuffed one nothing; Mime repeats it). Energy
  `mult` 8 -> 11.2 / 14.4 / 17.6.
- **Dwebble** (C $5, 5) / **Crustle** (S $8): **+5 / +10 Chips for each Stone card in your full deck**. Energy `chips` 5 -> 6.5 / 8 / 9.5,
  10 -> 13 / 16 / 19.
- **Sigilyph** (R $7): **+2 Foresight**; **using a Planet card for Pair (Mercury)** levels Pair **1 more time** (`using_consumeable`, any
  Planet whose `hand_type` is Pair, after its own level). Not Blueprint; Energy-inert.
- **Yamask** (C $5, 5) / **Cofagrigus** (S $8): **X0.1 / X0.2 for each other Joker you sell** (`grudge_Xmult`, banked; carried). Cofagrigus,
  **Mummy**: the **first Joker you sell each round** (the Blind and the shop after it; one Mummy for the whole row) **is not sold**: it stays,
  becomes **Negative** (its own +1 slot), and **no money** is paid. The choices: it **still counts as a sale for the X** (Yamask's and
  Cofagrigus's), but for no other joker (no `selling_card`: nothing was sold); **a Negative Joker sells as usual and uses the round's Mummy
  up**; never Cofagrigus itself, never a consumable; a debuffed Cofagrigus catches nothing; **Blueprint can't copy it** (the `sell_instead`
  hook finds the real one). Energy `Xmult_mod` 0.1 -> 0.12 / 0.14 / 0.16, 0.2 -> 0.24 / 0.28 / 0.32.
- **Tirtouga** (C $5) / **Carracosta** (S $8), Ancient 9s (Kabuto's tiers): **1+ +30 Chips; 2+ each scored 9 permanently +5 Chips; 3+ +50
  Chips**; Carracosta the same numbers (the spec's "the same"; Kabutops raises its own) and **4+ retriggers every scored 9**. Evolves after
  its **3+ tier fires 5 times** (`third_times`; never counted from a Blueprint). Energy `chips1` / `chips2` / `chips3` +30% (39 / 48 / 57,
  6.5 / 8 / 9.5, 65 / 80 / 95).
- **Archen** (C $5) / **Archeops** (S $8), Ancient 10s: **1+ +4 Mult; 2+ X1.25; 3+ earn $3** (once a hand); Archeops **4+ X2** too.
  **Defeatist** (Archeops): on the round's **final hand** all of its numbers are **halved**: Mult / 2, **an X keeps half its bonus** (X2 ->
  X1.5, X1.25 -> X1.125), **money rounds down** ($3 -> $1). Evolves after its 3+ tier fires 5 times. Energy `mult` 4 -> 5.6 / 7.2 / 8.8,
  `Xmult` 1.25 -> 1.5 / 1.75 / 2, `Xmult2` 2 -> 2.4 / 2.8 / 3.2; `ancient_money` fixed.
- **Minccino** (C $5, 5), Tidy Up: **each discard draws 1 extra card** — the mechanism: **+1 hand size until your next hand is played** (per
  discard, given at `pre_discard`, taken back at `press_play`). **Cinccino** (S $8), Skill Link: **the first scored card retriggers once per
  discard used this round, capped at 5**. Both Energy-inert.
- **Wiki**: regenerated (266 missing); the wiki sprites of the 26 are gone from `designwiki/sprites/pokermon_jokers/` (sprites redeployed).
- **Tests**: `micatro/tests/mods/pokermon_gen5_batch2_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 180 defs, the order chains), `pokermon_art_types_test`, `micatro_mod_version_pin`, `micatro_deckeditor_pages` (998 jokers);
  `pokermon_gen5_batch1_test` (Sewaddle after Sawk); `designwiki_pokermon_jokers_test` spot-checks the Pikipek line and Tyrunt / Phantump /
  Cutiefly (the Sewaddle line, Dwebble, Venipede and Sandile have jokers now).

### Gen 5, batch 4: the Gen 5 Legendaries (2026-10-29, branch `feat/pokermon-gen5-legendaries`)
Pinned **`3.9.1+r55`** (`contentRev: 55`; `LEGACY_MOD_VERSIONS` untouched). The owner's "Build as pitched": the 12 Gen 5 Legendaries, #638-649, in
`jokers/pokejokers_designs.js` (`sacred_sword` / `sword_others` / `therian` / `wild_charge` / `sand_force` / `tao_boost` / `kyurem_borrow` /
`relic_song` / `techno_count`; 192 defs now), Legendary $20 each (The Soul / the Legendary pool). Pokédex order: Cobalion ... Genesect after
Hydreigon (635; Pokermon has no Larvesta / Volcarona), before Chespin (650; its `poke_after` is now `genesect`). Neither Nacho nor Pokermon+ has any.
Types = the cards' (`pokermon_art_types_test`, every form cell checked: the Therian, Black / White and Resolute cells show the base type,
Meloetta's Pirouette Fighting). Art: upstream 3.9.1 cells with their souls (Natdex {14,42} / {16,42} / {18,42}; Gen 5 sheet {6,3} ... {8,6}); the
forms (`systems/anim.js` GEN5_LEGEND_FORMS: Tornadus {8,3}, Thundurus {0,4}, Landorus {0,5}, Kyurem Black {4,5} / White {8,5}, Keldeo Resolute
{2,6}, Meloetta Pirouette {6,6}, each with its soul) drawn by `ui.js` ownFace from each center's live `poke_view_form`; nothing to deploy.
- **The Swords of Justice**, **Cobalion** (Metal) / **Terrakion** (Earth) / **Virizion** (Grass) / **Keldeo** (Fighting): each scored **Spade /
  Diamond / Club / Heart** gives **X1.25** (Wild cards count), **+X0.1 for each OTHER sword species held** (undebuffed; a twin doesn't count; Keldeo
  counts): X1.25 / 1.35 / 1.45 / 1.55. **Keldeo's Resolute Form**: with Cobalion, Terrakion AND Virizion all held, its Resolute card shows and a
  Heart gives **X2** instead, the bonus on top (**X2.3**). Energy `Xmult_multi` 1.25 -> 1.3125 / 1.375 / 1.4375; Keldeo's `Xmult_multi2` 2 -> 2.1 /
  2.2 / 2.3 (energized Resolute X2.6); `sword_mod` fixed.
- **The Forces of Nature**, formes live with the card (the type never changes): **Tornadus** (Colorless) **+1 hand each round**; Therian (an
  undebuffed Landorus held) **also +3 Mult per hand left**, read when it scores (the scored hand already taken: the final hand +0). **Thundurus**
  (Lightning): each scored card **1 in 4** to earn **$1**; Therian **1 in 2**, and a card that pays also gives **X1.1**. **Landorus** (Earth): each
  **Stone card held in hand +40 Chips**; Therian (Tornadus AND Thundurus held) each **scored Stone card X1.5** instead. Energy: Tornadus `mult` 3 ->
  4.2 / 5.4 / 6.6; Thundurus `Xmult_multi` 1.1 -> 1.155 / 1.21 / 1.265; Landorus `chips` 40 -> 52 / 64 / 76 and `Xmult_multi` 1.5 -> 1.575 / 1.65 /
  1.725. Fixed: the hand, the odds (`dem` / `dem2`, through get_probability_vars: Oops! / Absol apply), the $1 (`storm_money`).
- **The Tao trio**: **Reshiram** (Fire, Turboblaze) / **Zekrom** (Lightning, Teravolt): **each Fire / Lightning Joker, itself included, gives X1.25**
  (the other_joker pass: is_type, so Arceus and a Tera count, a debuffed joker doesn't). **Truth vs Ideals**: both held, each one's X is
  **+0.25** (X1.5 a joker; `tao_mod`, fixed). **Kyurem** (Water): **X1.5**; with Reshiram **White Kyurem** (art), with Zekrom **Black Kyurem**: each
  joker of the partner's type ALSO gives Kyurem **the partner's own current X per joker** (its Energy and Truth vs Ideals included) — a **second,
  separate multiplier** on top of the partner's (Reshiram X1.25, then Kyurem X1.25: X1.5625 a Fire Joker). **Both held: the LEFTMOST** of the two
  in the row picks it. Nothing is consumed. Energy: `Xmult_multi` 1.25 -> 1.3125 / 1.375 / 1.4375 (Reshiram / Zekrom; Kyurem borrows the
  energized number), Kyurem `Xmult` 1.5 -> 1.8 / 2.1 / 2.4.
- **Meloetta** (Psychic), Relic Song: switches forme **after every hand played** (the `after` pass, a debuffed hand too; not Blueprint). **It resets
  to Aria every round** (never carries over; a Pirouette left from an earlier round reads Aria). **Aria** (Psychic): **X2**; **Pirouette** (Fighting):
  **the first scored card retriggers 3 times**. Type (ability.extra.ptype; a Tera still owns it) and art follow the forme; **Monotype-exempt**
  (`poke_mono_exempt`); the forme's Energy matches. Save / resume replay the hands, so the forme comes back exactly. Energy `Xmult` 2 -> 2.4 /
  2.8 / 3.2; the 3 retriggers fixed.
- **Genesect** (Grass), Techno Blast: **X(1.5 + 0.5 per Water, Lightning or Fire Joker)** (one is_type test per joker: Arceus or a two-type joker
  once; undebuffed; itself if it has such a Tera). Energy `Xmult` 1.5 -> 1.8 / 2.1 / 2.4, `Xmult_mod` 0.5 -> 0.6 / 0.7 / 0.8.
- **Wiki**: regenerated (254 missing); the wiki sprites of the 12 are gone from `designwiki/sprites/pokermon_jokers/` (sprites redeployed).
- **Tests**: `micatro/tests/mods/pokermon_gen5_legendaries_test.mjs`. Re-recorded: `modpin_test`, `pokermon_391_data_test`, `pokermon_new_jokers_test`
  (the pin, 192 defs), `pokermon_art_types_test` (the 12 and every form cell), `micatro_mod_version_pin`, `micatro_deckeditor_pages` (1010 jokers);
  `designwiki_pokermon_jokers_test` spot-checks Chien-Pao / Iron Thorns / Bewear (Kyurem and Keldeo have jokers now), and its generation /
  type filter checks now use the generation with the most species still missing (Gen 5 empties as its batches land).

### Pending from the 3.9.1 joker rework (after batch 10b)
Every existing joker is on 3.9.1: `rework_hold` (still on 3.2.1) is empty. What waits, by the batch it waits on (`rework_deferred` =
on 3.9.1 but one part):
- **Batch 10**: done (above). The Debris sleeve's alt came in the leftovers batch (the playing-card `card_limit` seam).
- **Batch 10b**: done (above). Nothing waits.
- **New jokers** (sub-batches 11–15, 15b): all done (above): 101 jokers (26 + 15 + 19 + 14 + 18 from 3.9.1, 9 from upstream main in 15b).
  `new_deferred` is empty since batch 16 (Drampa's Mega; Kirlia -> Gallade, Roselia -> Roserade and Budew -> Roselia came in with sub-batch 14).
  Still to add from 3.9.1: none (batch 17 added the 6 non-Pokémon + 3 April Fools jokers and Repel; the 11 Megas came in batch 16); only whatever a later rebase onto upstream main brings (sub-batch 15b
  lists the drift: Solrock / Lunatone so far). (The 2 Jirachi wish forms and Hisuian Qwilfish / Overqwil the old tally counted were already
  in the port: sub-batches 14 / 15.)
- **Batch 16** (Megas): done ("The Megas (batch 16)" above): Mega Lucario, Mega Skarmory, Mega Drampa and Shuckle's Mega Berry Juice. Mega
  Mawile / Mega Manectric: upstream main (af0b656) has their sprites but no jokers; they come when upstream writes them.
- **Batch 17**: done ("Batch 17" above): Rival (Bitter Rival, Champion) and Mystery Egg (the Oologist) are complete. (The DNA Seal and the
  Meteorite came with Deoxys in sub-batch 14.) Nothing of 3.9.1 waits any more: see "Pokermon 3.9.1 upgrade: complete".
- **Kept by design** (no batch): Porygon-Z's `energies_used` counter, and the old state names (`energy_plus`, `scry_amount`,
  `extra_pocket_picks`, `negative_edition_rate`, `rotom_discount`).

### 3.9.1 art (batch 5)
- Vendored into the gitignored `assets/2x` (deployed with `npm run deploy-micatro-mods`): the **39** sheets 3.9.1 changed,
  saved beside the 3.2.1 ones as `<name>-391.png` (two were already there from batch 1), and the **21** files 3.9.1 added,
  under their own names. The 3.2.1 sheets stay (the add-ons and live builds still use them).
- Registered and used: every Basic joker sheet + Shiny (`AtlasJokersBasic<Gen01..09|Natdex|Others>[Shiny]391`),
  `AtlasConsumablesBasic391`, `AtlasDecksBasic391` (decks + sleeves), `AtlasEnhancementsBasic391`, `AtlasStickersBasic391`,
  `AtlasBossblinds391`. Pokermon's own cards move to them (`index.js` `to391`); jokers take their cell from 3.9.1's
  PokemonSprites (`data391.js` `sprites`: 3.9.1 moved 70 existing Pokémon, e.g. the Natdex legendaries and form Pokémon into
  the Gen sheets), every other card keeps its cell.
- Checked crop by crop (`micatro/tests/mods/pokermon_391_data_test.mjs`, streaming both PNGs): of 520 cards, 496 show the
  identical picture, 22 a 3.9.1 touch-up (mean |diff| <= 3: Bibarel, Master Ball, the Berry Juices, ...), and 2 were redrawn on
  purpose (the Flower enhancement, and the renamed boss's new chip).
- Held on 3.2.1 sheets until batch 10b: **Unown** (3.9.1's card is the reworked one: another frame and badge; on its 3.9.1 card since
  batch 10b). Still on 3.2.1 sheets: the add-ons (Nacho, Pokermon+:
  some of their cells changed in 3.9.1 — e.g. Hisuian Sliggoo / Goodra, Naclstack, Garganacl — so they move with their own
  upgrades); the batch-1 art (Rotom Dex, the Stadium / Mega decks and sleeves, the Jirachi wishes) is unchanged.
- Vendored, mapped in the leftovers batch: the Series A joker sheets + the 5 animated strips (the cosmetic `series` option).
- Vendored but not mapped: the other Series A sheets (consumables, decks, boosters, stickers, vouchers: 3.9.1 names them nowhere), 3.9.1's re-laid Bird Energy strip (the same frames in
  one row; the Unown swarm's 20880 px strips are drawn since batch 10b, split into tiles), `smeargle_logo`, and the new
  files no existing card names (TitleCard, GMaxClouds, capture_disc, elite_stake*, miror_budicolo, placeholder_blind,
  poke_logo_alt / _multi, shiny_*).

## Add-on extension points (for Pokermon add-ons: Nacho's Pokermon Dip, Pokermon+)

Add-ons build ON Pokermon instead of patching it. All are additive (empty = Pokermon unchanged)
and every registered handler must check that its own mod is active for the run.

- `addon_pokemon_center(item, def, {prefix, file, sprites, atlas})` (index.js) — `pokermon.Pokemon`:
  a Pokémon center with `poke_custom_prefix`, sprites, type badges and pool rules; the add-on
  registers it in its own `registerMod` content. `add_family(list)` (systems/evolution.js).
- types.js: `EXTRA_TYPES` (extra Tera types; `wildcard` = counts as every type), `TERA_OVERRIDES`,
  `wildcard_type(card)`, `ENERGY_LIMIT_BONUS`.
- energy.js: `ENERGIZE_BASE` (base values energize scales), `ENERGY_OVERRIDES`.
- evolution.js: `LEVEL_EVO_EXTRA` (extra level_evo steps), `EVOLVE_INTERCEPTS` (immediate / handle
  an evolution yourself), `EVO_KEEP`, `POST_EVOLVE`; `poke_evolved` context for every non-mega evolution.
- pools.js: `POKE_POOL_RULES`. utils.js: `FIND_CARD_EXTRA`, `BEFORE_REMOVE`. items.js: `MEGASTONE_RESET`.
- precedence.js ("Add-on dedupe (Pokermon precedence)" above): `mark_precedence(centers)` before `registerMod` (Pokermon wins:
  a same-name add-on joker is out of play but stays registered), `replaced_by`, `precedence_key` (use it for any add-on key you
  create or evolve into), `addon_megas`, `family_display_key`, `attach_mega(base_key, mega_key)` (batch 18: an add-on Mega on a
  Pokermon joker — Nacho 1.7.9's take_ownership `megas`; per run, only while the Mega is active).
- evolution.js (batch 18): `EVO_OVERRIDES` (3.9.1 POKE_EVO_OVERRIDES lines an add-on appends: a branch's own highest / previous
  evo inside a shared family — Nacho's Goomy line). Pokermon's own four lines are not seeded (unchanged behaviour).
- items.js (batch 18): `generate_pickup_item_key`'s evolution item is `c_<the joker's poke_custom_prefix>_<item>` for a non-native
  item (3.9.1 poll_evo_item; Nacho's apples). Pokermon's jokers only hold native items: unchanged.
- anim.js / ui.js (batch 18): an `ANIMATED` entry may be `soul_only` with full atlas names (`atlas`, `shiny_atlas`): only the
  floating sprite animates (Nacho 1.7.9's Terapagos-Stellar); a center's `soul_atlas` draws its soul from another atlas
  (js/engine/view.js, js/ui/cardsprite.js).
