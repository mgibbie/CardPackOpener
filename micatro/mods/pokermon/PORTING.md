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
declare it). Xatu's all-planets Celestial packs use the `pack_card` hook (systems/rules.js); the
previous-evolution win stickers are the `joker_win_keys` hook (systems/evolution.js family_win_keys).

### `card.ability`

- `card.ability.extra` is a deep copy of `center.config.extra` (Lua `self.config.extra`); with mods on,
  every other `config` key is copied onto `card.ability` too (SMODS).
- Ability fields persist through `set_ability` (evolution): Tera stickers (`<type>_sticker`),
  `money_frac`, `fainted`, perishable/eternal/rental, `extra_value`.
- Lua truthiness: `if card.ability.extra.rounds then` → `!== undefined`; a field that may be `0`
  is truthy in Lua.

### Per-round globals (reset each round by `reset_game_globals`)

`G.GAME.current_round.bulb1card {rank, id}`, `espeon_rank / espeon_id / espeon_suit`,
`gligar_suit`, `sneaselcard {rank, id}`; `G.GAME.poke_poli_suit` via `poke_change_poli_suit()`.

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
87fb499, 2025-11-01) moving to 3.9.1 batch by batch: pinned `3.2.1+r1` until batch 5, **`3.9.1+r2`** since
(Plans/MICATRO_MODS_PLAN.md §9).

| batch | what | status |
|---|---|---|
| 0 | mod-version pin + key aliases | done (merged) |
| 1 | placeholder art from 3.9.1 sheets | done (see Art) |
| **4** | **engine seams** (below) | **done 2026-10-19** — no behaviour change, `contentRev` stays 1 |
| **5** | **data re-extract** (rarities, costs, configs, gates, `attributes`, cgoose -> iridescent_hacker), 39 changed + 21 new atlases (below) | **done 2026-10-19** — `3.9.1+r2` |
| 6–17 | reworks, Hazard/Seed, new jokers, Megas, blinds/stake/challenges | after 5 |

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
  `data391.js` `skipped`). Reworks wait for their batch (6–9 by file, 10 Hazard layer, Jirachi / wish):

  - **spearow** — rework (3.6.0 Spearow line): counts cards drawn instead of scored, new evo_rqmt / triggers (pokejokers_01): blueprint_compat false → true; evo_rqmt - → 3; card_threshold 20 → 30; cards_drawn - → 0; cards_scored 0 → -; rounds 4 → -; triggers - → 0
  - **fearow** — rework (Spearow line): cards drawn + a discard, add/remove_from_deck (pokejokers_01): blueprint_compat false → true; card_threshold 15 → 30; cards_drawn - → 0; cards_scored 0 → -; d_size - → 1
  - **pikachu** — rework: money threshold + Mult, no cash-out $ (pokejokers_01): blueprint_compat false → true; money 1 → 2; money_threshold - → 25; mult - → 10
  - **raichu** — rework: money count / threshold + Mult (and Megas X / Y) (pokejokers_01): blueprint_compat false → true; money 2 → -; money_count - → 10; money_limit 16 → -; money_threshold - → 50; mult_mod - → 4; plus_slot false → -; threshold 120 → -
  - **sandshrew** — rework: the Glass-restore half was removed (pokejokers_01): glass_restored 0 → -; rounds 5 → 4
  - **sandslash** — rework: Glass limit / restore replaced by a 1 in 3 (pokejokers_01): dem - → 3; glass_limit 2 → -; glass_restored 0 → -; num - → 1
  - **zubat** — rework (Zubat line) (pokejokers_02): mult_mod 1 → 2
  - **golbat** — rework (Zubat line): new Golbat effect, evo_rqmt 20 -> 16 (pokejokers_02): evo_rqmt 20 → 16; Xmult 1 → -; Xmult_mod 0.1 → -; chip_mod 15 → -; chips 0 → -; money 0 → -; money_mod 1 → -
  - **oddish** — rework: three outcomes (mult1) instead of two (pokejokers_02): mult1 - → 3; rounds 5 → 4
  - **victreebel** — rework: round retriggers (retrigger_max) with the chip change (pokejokers_03): chips 16 → 24; retrigger_max - → 4; round_retriggers - → 0
  - **onix** — rework (3.8.0 Onix line, quantum enhancements) (pokejokers_04): blueprint_compat false → true
  - **koffing** — rework: Volatile Left + Mult, evolves in 2 rounds (pokejokers_04): blueprint_compat false → true; mult - → 12; rounds 4 → 2; volatile - → left
  - **weezing** — rework: Volatile Left + Mult (pokejokers_04): blueprint_compat false → true; mult - → 18; volatile - → left
  - **mega_kangaskhan** — 3.9.1 adds a not-context.blueprint guard with the flag: our port has no guard (Blueprint would copy the consumable effect) (pokejokers_04): blueprint_compat false → true
  - **magmar** — rework: the once-per-round remove_triggered flag is gone (scales every first single discard) (pokejokers_05): blueprint_compat false → true
  - **flareon** — rework (3.8.0 Eevee line) (pokejokers_05): Xmult_multi 3 → 2
  - **mega_steelix** — rework: Stone cards held instead of Diamonds $ (pokejokers_07): blueprint_compat true → false; money 1 → -; stone_held - → 4; suit Diamonds → -
  - **qwilfish** — Hazard layer rework (batch 10): hazard_level replaces the per-joker hazard ratio (pokejokers_08): chip_mod 25 → 15; hazard_level - → 1; hazards 4 → -
  - **corsola** — rework: tally replaced by scaling Mult (pokejokers_08): corsola_tally 0 → -; mult - → 0; mult_mod 3 → 1
  - **skarmory** — Hazard layer rework (batch 10), Mega Skarmory (pokejokers_08): Xmult_mod 0.5 → 0.4; hazard_level - → 1; hazard_max - → 1; hazards 4 → -
  - **houndour** — rework: discard limit + add/remove_from_deck (pokejokers_08): active false → -; discards 2 → -; limit - → 1; mult_mod 1 → 2; rounds 5 → 4
  - **houndoom** — rework (Houndour line) (pokejokers_08): active false → -; limit - → 3; rounds 5 → -
  - **smeargle** — rework: get_copy replaces the copy_pos machinery (pokejokers_08): blueprint_compat false → true; copy_pos 0 → -
  - **grovyle** — rework (3.7.0 Gen-3 starters): natures, evo_rqmt 32 -> 16 (pokejokers_09): evo_rqmt 32 → 16; dem 2 → -; money_earned 0 → -; money_mod 2 → 1; num 1 → -; triggers - → 0
  - **torchic** — rework (Gen-3 starters) (pokejokers_09): evo_rqmt 60 → 16; cards_discarded 0 → -; mult 1 → -; mult_earned 0 → -; mult_mod - → 5; triggers - → 0
  - **combusken** — rework (Gen-3 starters) (pokejokers_09): evo_rqmt 150 → 16; cards_discarded 0 → -; mult 2 → -; mult_earned 0 → -; mult_mod - → 8; triggers - → 0
  - **mudkip** — rework (Gen-3 starters) (pokejokers_09): evo_rqmt 400 → 16; chip_mod - → 30; chips 20 → -; chips_earned 0 → -; triggers - → 0
  - **marshtomp** — rework (Gen-3 starters) (pokejokers_09): evo_rqmt 960 → 16; chip_mod - → 50; chips 30 → -; chips_earned 0 → -; triggers - → 0
  - **swampert** — rework (Gen-3 starters) (pokejokers_09): chip_mod 20 → 60; chips 40 → -; chips_earned 0 → -; nature_target - → 5
  - **jirachi_booster** — Jirachi / wish rework (3.8.0) (pokejokers_13): blueprint_compat false → true; bonus_packs 1 → -; reroll_max - → 3; rerolls - → 0
  - **jirachi_power** — Jirachi / wish rework (3.8.0) (pokejokers_13): every 3 → 2
  - **jirachi_invis** — Jirachi / wish rework (3.8.0) (pokejokers_13): blueprint_compat false → true; energy_target - → 3
  - **kricketune** — calculate changed (a consumable-room check gates the Item) (pokejokers_14): money 5 → 4
  - **magmortar** — rework with the flag (calculate changed) (pokejokers_16): blueprint_compat false → true
  - **leafeon** — rework (Eevee line): no more hand size (pokejokers_16): blueprint_compat false → true; h_mod 1 → -; h_size 7 → -; h_size_limit 7 → -
  - **glaceon** — rework (Eevee line): retriggers instead of the 1 in 4 (pokejokers_16): blueprint_compat false → true; dem 4 → -; num 1 → -; retriggers - → 1
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

  - *new key: only the 3.9.1 logic reads it* (47): mega_charizard_x (mult); mega_charizard_y (mult); gloom (mult1); vileplume (Xmult_multi2); mankey (chip_mod, mult_mod); primeape (chip_mod, mult_mod); muk (mult_mod); eevee (mult_mod); vaporeon (chip_mod); aerodactyl (Xmult1); politoed (retriggers); yanma (chip_mod, chip_mod2, mult_mod, mult_mod2); espeon (Xmult, scry); slowking (Xmult_multi1); mega_scizor (mult, mult_mod, scizor_Xmult, scizor_chips); slugma (every, loyalty_remaining); magcargo (every, loyalty_remaining); mega_houndoom (Xmult1, limit); celebi (Xmult_mod); treecko (triggers); blaziken (Xmult_multi, discard_target, mult_mod); mega_camerupt (Xmult_mod); jirachi_banker (multiply); yanmega (chip_mod, mult_mod); garbodor (active); ferroseed (hazard_level); ferrothorn (hazard_level); golett (hazard_level); annihilape (chip_mod, mult_mod); gholdengo (Xmult1); everstone (Xmult_multi2)
  - *key dropped by 3.9.1: the ported 3.2.1 logic still reads it* (46): mankey (chips, mult); primeape (chips, mult); muk (mult); mega_gengar (mega_gengar_tally, rounds, xmult); kangaskhan (interest_cap); eevee (Xmult); vaporeon (chips); aerodactyl (Xmult_original); sentret (last_hand); furret (last_hand); natu (level_amt); xatu (level_amt); politoed (mult); yanma (chips, chips2, mult, mult2); espeon (Xmult_multi, retriggers); slowking (oXmult); slugma (hand_reset, hands); magcargo (hand_reset, hands); mega_houndoom (oXmult); treecko (dem, money_earned, num); blaziken (Xmult, mult); mega_camerupt (Xmult_multi); jirachi_banker (retriggers); yanmega (chips, mult); golett (hazards); mimikyu (disguise); dreepy (suit); annihilape (chips, mult); gimmighoul (previous_money); gholdengo (future_dollars, oXmult)
  - *format only (a string id became a number): no change* (10): unown (targets); treecko (targets); grovyle (targets); sceptile (targets); torchic (targets); combusken (targets); blaziken (targets); mudkip (targets); marshtomp (targets); swampert (targets)

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
