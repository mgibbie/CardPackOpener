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

## Status

**Complete (2026-10-15)** — every Pokermon 3.2.1 content file is ported and tested:
all 37 joker files (452 jokers + the 4 written-but-unregistered ones: jirachi_copy, jirachi_negging,
hisuian_qwilfish, overqwil), all 66 consumables (mart1/2/3, martz, berry juices, Rotom machines),
10 boosters, 4 vouchers, 10 decks, 6 tags, the showdown boss, 2 enhancements, 2 seals, 12 type
stickers and the shiny edition. One test file per source file in `micatro/tests/mods/`.

Not yet: challenges, sleeves, deck skins (plan step 8), and `emergy` (Cryptid-only in the Lua).
Intended-design fixes are noted in comments at each site (search "intended").

## Pokermon 3.9.1 upgrade (plan: Plans/MICATRO_MODS_UPGRADES.md §2.1, §3)

Upstream: InertSteak/Pokermon tag **3.9.1** (2026-09-18; needs Steamodded >= 26.829.0). Ours is 3.2.1 (really commit
87fb499, 2025-11-01), pinned `3.2.1+r1` (Plans/MICATRO_MODS_PLAN.md §9).

| batch | what | status |
|---|---|---|
| 0 | mod-version pin + key aliases | done (merged) |
| 1 | placeholder art from 3.9.1 sheets | done (see Art) |
| **4** | **engine seams** (below) | **done 2026-10-19** — no behaviour change, `contentRev` stays 1 |
| 5 | data re-extract (rarities, costs, configs, gates, `attributes`, cgoose -> iridescent_hacker), 39 changed + 21 new atlases | next |
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
