# Porting Balatro Lua → Micatro engine JS

Reference source (read-only, decompiled Balatro 1.0.x):
`C:\Users\guide\Desktop\Love2D Experiment\reference projects\balatro_extracted\`
(`card.lua`, `blind.lua`, `tag.lua`, `back.lua`, `functions/*.lua`, `localization/en-us.lua`).

The engine is a **line-for-line port** of Balatro's *logic*. Keep function names,
field names, ability names and ordering identical to the Lua so the two can be
diffed by eye. Drop everything purely visual (sprites, juice, particles, UIBox,
alignment, sounds — sounds/visuals become `emit`/`play_sound` calls).

## Runtime (micatro/js/engine/core.js)
- `G` is the global game object, exactly like Lua's `G`: `G.GAME`, `G.jokers`,
  `G.consumeables`, `G.hand`, `G.play`, `G.deck`, `G.discard`, `G.shop_jokers`,
  `G.shop_vouchers`, `G.shop_booster`, `G.pack_cards`, `G.playing_cards`,
  `G.STATE`, `G.STATES`, `G.STATE_COMPLETE`, `G.handlist`.
- `G.P_CENTERS` etc. are NOT on G — import `P_CENTERS`, `P_CARDS`, `P_BLINDS`,
  `P_TAGS`, `P_CENTER_POOLS`, `P_JOKER_RARITY_POOLS` from core.js.
- Areas are `CardArea` (`cards`, `highlighted`, `config.card_limit`,
  `emplace`, `remove_card`, `change_size`, `shuffle`, `sort`, ...).
- `Card` has the non-joker methods ported already (set_ability, set_base,
  set_edition, set_seal, add_to_deck, remove_from_deck, get_id, is_face,
  is_suit, get_chip_bonus, ..., sell_card, calculate_seal, calculate_dollar_bonus,
  start_dissolve, shatter, remove). Each sibling module attaches more methods to
  `Card.prototype`.
- **Events**: `G.E_MANAGER:add_event(Event({func = function() ... end}))` →
  `G.E_MANAGER.add_event(() => { ... })`. It's a synchronous FIFO flushed after
  each player action; ordering is preserved, so keep every state-changing event
  as an event (don't inline it) — e.g. buffers like `G.GAME.dollar_buffer`,
  `G.GAME.joker_buffer`, `G.GAME.consumeable_buffer` depend on it. Purely
  visual events (juice, delays, attention text) are dropped. Events whose Lua
  func polls (`return false` until ready) must be rewritten as a plain event.
  `delay(x)` is a no-op.
- `card_eval_status_text(card, type, amt, percent, dir, extra)`, `juice_card`,
  `play_sound`, `attention_text`, `emit(type, data)` exist for UI feedback; keep
  the Lua calls (they drive the animation log the renderer & spectators replay).
- RNG: `pseudorandom(seed_or_key, min, max)`, `pseudoseed(key)`,
  `pseudorandom_element(t, seed)` → returns `[value, key]` (arrays: 1-based key),
  `pseudoshuffle(list, seed)`. Bare Lua `math.random(...)` → `math_random(...)`
  (deterministic). Never use `Math.random()` in engine code.
- Helpers in core.js: `find_joker(name)` (returns array — Lua `next(find_joker(x))`
  → `find_joker(x).length > 0`), `ease_dollars`, `ease_discard`,
  `ease_hands_played`, `ease_ante`, `ease_round`, `ease_chips`, `draw_card`,
  `level_up_hand`, `eval_card`, `create_card`, `create_playing_card`,
  `copy_card`, `poll_edition`, `get_current_pool`, `add_joker`, `localize`,
  `calculate_reroll_cost`, `get_new_boss`, `get_next_tag_key`,
  `get_next_voucher_key`, `get_blind_amount`, `set_consumeable_usage`,
  `copy_table`, `next` (Lua table non-empty test), `SUITS`, `math_random`.
- run.js has `STATES`, `HANDLIST`, `draw_from_deck_to_hand`, `draw_from_hand_to_deck`,
  `draw_from_play_to_hand`, `change_shop_size`, `create_card_for_shop`,
  `use_card`, `end_consumeable`, `reroll_boss`, `get_poker_hand_info`,
  `evaluate_poker_hand`. Import from './run.js' lazily-safe (only call at runtime;
  ES module cycles are fine as long as nothing is used at import time).

## Lua → JS gotchas (these bite)
- Lua truthiness: only `nil`/`false` are falsy. `0` and `''` are TRUTHY in Lua.
  `if self.ability.extra then` where extra may be 0 → use `!== undefined`.
- 1-based indexing: `t[1]` → `t[0]`, `#t` → `t.length`, `for i=1,#t` → `i=0..len-1`
  (watch places where `i` itself is used in a value or seed string — keep the
  1-based number in the string: `'xyz'..i` → `'xyz' + (i + 1)`).
- `table.remove(t, i)` / `table.insert(t, 1, x)` → splice/unshift.
- `a and b or c` → `a ? b : c` ONLY when b can't be falsy; otherwise keep Lua semantics.
- `math.floor`, `math.max`, `math.min`, `math.abs` → `Math.*`. Integer division doesn't exist.
- `string.format('%d', x)` etc. — keep numbers as numbers.
- `pairs(t)` iteration order is undefined in Lua; where it matters for RNG
  determinism, iterate sorted keys or arrays.
- Removing items while iterating `G.jokers.cards` — iterate a `.slice()` copy.
- `self.ability.extra` is a deep copy of `center.config.extra` (may be a number or object).
- Ability names (`self.ability.name == 'Blueprint'`) are compared by NAME, as in Lua.

## Return values
Return the exact Lua tables (`{message, mult_mod, chip_mod, Xmult_mod,
repetitions, card, level_up, saved, remove, ...}`) as JS objects. Return
`undefined` (not `{}`) where Lua returns nil.

## Tests
Engine tests live in `micatro/tests/*_test.mjs` and run with plain node
(`node micatro/tests/<name>_test.mjs`). Use `newRun({seed:'TEST', back:'b_red'})`
from run.js to build a state, then construct jokers with
`add_joker('j_xxx')`, set `G.hand`/`G.play` cards with `create_playing_card(
{front: P_CARDS.H_A, center: P_CENTERS.c_base}, G.hand)`, and drive play with
`act({type:'highlight', ids:[...]})` + `act({type:'play'})`.
