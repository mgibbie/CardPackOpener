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
Micatro-made art (not Pokermon's): `hisuian_qwilfish.png` / `hisuian_qwilfishShiny.png`.
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
87fb499, 2025-11-01) moving to 3.9.1 batch by batch: pinned `3.2.1+r1` until batch 5, `3.9.1+r2` for batch 5, `3.9.1+r3` for batch 6, **`3.9.1+r4`** since batch 7
(Plans/MICATRO_MODS_PLAN.md §9).

| batch | what | status |
|---|---|---|
| 0 | mod-version pin + key aliases | done (merged) |
| 1 | placeholder art from 3.9.1 sheets | done (see Art) |
| **4** | **engine seams** (below) | **done 2026-10-19** — no behaviour change, `contentRev` stays 1 |
| **5** | **data re-extract** (rarities, costs, configs, gates, `attributes`, cgoose -> iridescent_hacker), 39 changed + 21 new atlases (below) | **done 2026-10-19** — `3.9.1+r2` |
| **6** | **joker reworks, pokejokers_01–08** (Gen 1 + Gen 2: 255 jokers on 3.9.1, 8 held; below) | **done 2026-10-19** — `3.9.1+r3` |
| **7** | **joker reworks, pokejokers_09–17** (Gen 3 + Gen 4: 97 jokers on 3.9.1, none held; below) | **done 2026-10-19** — `3.9.1+r4` |
| 8–17 | reworks 18+, Hazard/Seed, new jokers, Megas, blinds/stake/challenges | after 7 |

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
  `data391.js` `skipped`; as of batch 7, which took everything for pokejokers_01-17 but its holds). Reworks wait for their
  batch (8–9 by file, 10 Hazard layer):

  - **mega_steelix** — rework: Stone cards held instead of Diamonds $ (held: quantum Hazard, batch 10) (pokejokers_07): blueprint_compat true → false; money 1 → -; stone_held - → 4; suit Diamonds → -
  - **qwilfish** — Hazard layer rework (batch 10): hazard_level replaces the per-joker hazard ratio (pokejokers_08): chip_mod 25 → 15; hazard_level - → 1; hazards 4 → -
  - **skarmory** — Hazard layer rework (batch 10), Mega Skarmory (pokejokers_08): Xmult_mod 0.5 → 0.4; hazard_level - → 1; hazard_max - → 1; hazards 4 → -
  - **roggenrola** — Hazard layer rework (batch 10) (pokejokers_18): evo_rqmt 25 → 10; hazard_level - → 1; hazards 4 → -; mult_mod 4 → 5
  - **boldore** — Hazard layer rework (batch 10) (pokejokers_18): hazard_level - → 1; hazards 4 → -; mult_mod 8 → 10
  - **gigalith** — Hazard layer rework (batch 10) (pokejokers_18): hazard_level - → 1; hazards 4 → -; mult_mod 6 → 7
  - **vanillite** — rework with the flag (scale_card / destroy rewrite; the line's Blueprint behaviour changes) (pokejokers_20): blueprint_compat false → true
  - **vanillish** — rework with the flag (Vanillite line) (pokejokers_20): blueprint_compat false → true
  - **vanilluxe** — rework with the flag (Vanillite line) (pokejokers_20): blueprint_compat false → true
  - **golurk** — Hazard layer rework (batch 10) (pokejokers_21): Xmult_multi 1.4 → 1.3; hazard_level - → 1; hazards 4 → -
  - **vikavolt** — rework: no self-count, the +Mult half was removed (pokejokers_25): Xmult 0.75 → 0.5; mult 12 → -
  - **ursaluna** — calculate changed (the Item's edition is a random aura edition, not Polychrome) (pokejokers_31): mult_mod 3 → 2
  - **tarountula** — Hazard layer rework (batch 10) (pokejokers_31): hazard_level - → 1; hazards 4 → -; rounds 3 → 4
  - **spidops** — rework: cards-added goal + Hazard layer (pokejokers_31): blueprint_compat true → false; card_goal - → 8; cards_added - → 0; h_max 8 → -; h_size 1 → 2; h_total 0 → -; hazard_level - → 1; hazards 4 → -
  - **rival** — rework (3.6.0 Rival): forms / money (zotherjokers): blueprint_compat true → false; Xmult 3 → -; form 0 → -; money - → 15; money_mod - → 10; mult 10 → -

  - *new key: only the 3.9.1 logic reads it* (8): garbodor (active); ferroseed (hazard_level); ferrothorn (hazard_level); golett (hazard_level); annihilape (chip_mod, mult_mod); gholdengo (Xmult1); everstone (Xmult_multi2)
  - *key dropped by 3.9.1: the ported 3.2.1 logic still reads it* (8): golett (hazards); mimikyu (disguise); dreepy (suit); annihilape (chips, mult); gimmighoul (previous_money); gholdengo (future_dollars, oXmult)
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
- Held on 3.2.1 sheets: **Unown** (3.9.1's card is the reworked one: another frame and badge); the add-ons (Nacho, Pokermon+:
  some of their cells changed in 3.9.1 — e.g. Hisuian Sliggoo / Goodra, Naclstack, Garganacl — so they move with their own
  upgrades); the batch-1 art (Rotom Dex, the Stadium / Mega decks and sleeves, the Jirachi wishes) is unchanged.
- Vendored but not mapped: the Series A sheets (the port shows Basic art), 3.9.1's re-laid animation strips (the Unown swarm —
  20880 px wide, past common GPU texture limits — and Bird Energy: the same frames in one row), `smeargle_logo`, and the new
  files no existing card names (TitleCard, GMaxClouds, capture_disc, elite_stake*, miror_budicolo, placeholder_blind,
  poke_logo_alt / _multi, shiny_*, the Series A Baltoy / Bellsprout / Claydol sheets).

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
