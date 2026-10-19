// Micatro mod system — native content packs, toggled per run.
//
// A mod is a plain ES module that calls registerMod({...}). It contributes
// content (centers: jokers, consumables, boosters, vouchers, decks, ...; tags,
// blinds, seals, stakes, rarities, consumable types, ...) whose behaviour is
// ordinary JS functions, plus named engine HOOKS (see HOOKS below) for the
// places where a mod changes base-game rules.
//
// All mods' content is registered up front (so the wiki/news/describe can see
// it), but only the mods ACTIVE for the current run contribute to pools and
// hooks — "off" means gone. The active set is part of the run recipe, so
// saves, replays and spectators load exactly the same mods.

import {
  G, P_CENTERS, P_TAGS, P_BLINDS, P_SEALS, P_STAKES, P_CARDS, rebuildPools, reset_p_cards_list,
} from '../engine/core.js';
import { addAliases, resolveKey as resolveAlias, isRetired as isRetiredAlias } from './aliases.js';

/** Every registered mod, by id. */
export const MODS = {};
/** Ids active for the current run (in load order). */
export let ACTIVE = [];
const activeSet = new Set();

/** Extra consumable sets added by mods: {key, shop_rate, rate_key, default, primary_colour, ...}. */
export const CONSUMABLE_TYPES = {};
/** Extra joker rarities: {key, weight, badge_colour, name}. */
export const RARITIES = {};
/** Atlases: name -> {src, px, py, frames?} (px/py = 1x cell size; assets are 2x). */
export const ATLASES = {};
/** Mod localization: set -> key -> {name, text:[...]} merged from all mods. */
export const MOD_LOC = { descriptions: {}, misc: { dictionary: {}, labels: {} } };

/**
 * Hook names the engine calls. Each active mod may provide a function per hook;
 * see callHook / reduceHook for how results combine. Keep this list in sync
 * with the call sites (grep `callHook(` / `reduceHook(`).
 */
export const HOOKS = [
  'init_game_object',   // (GAME) after a fresh game object is built
  'start_run',          // () after the deck is built, before blind select
  'pool_filter',        // (center, _type, _append) -> false to exclude from a pool
  'create_card',        // (card, _type, area, key_append) after a card is created
  'set_cost',           // (card) after Card:set_cost
  'find_joker_alias',   // (name) -> [cards] extra cards that count as `name`
  'is_face',            // (card, base) -> true/false/undefined override
  'splash',             // (scoring_hand, full_hand) -> true if every played card scores
  // (card, should_debuff) Steamodded's mod.set_debuff: `true` debuffs, 'prevent_debuff'
  // forces the card undebuffed (even a spent Perishable), anything else = no opinion.
  // Runs before the vanilla rules, like SMODS.
  'set_debuff',
  'calculate',          // (context) mod-level calculate (fires alongside jokers in calculate_context)
  'end_round',          // () end of round, after the end_of_round joker pass, before round eval
  'evaluate_round',     // (rows) -> extra cash-out rows (rows so far are passed in)
  'cash_out',           // (dollars) -> dollars
  'new_round',          // () setting a blind
  'shop_start',         // () shop opened
  'booster_open',       // (card) a booster was opened
  'booster_limit',      // (n) -> n shop booster slots (n already includes G.GAME.modifiers.extra_boosters)
  'pack_choices',       // (card, n) -> n picks for this booster
  'pack_size',          // (card, n) -> n cards in this booster
  'level_up_hand',      // (card, hand, amount) -> false to block
  'debuff_hand',        // (cards, hand, handname) -> true/false/undefined
  'card_removed',       // (card) Card:remove is about to take the card out of the game (area still set)
  'add_to_deck',        // (card, from_debuff) Card:add_to_deck ran (after the center's own add_to_deck)
  'empty_pool_default', // (key, _type) -> fallback center key for an empty pool
  'straight_min',       // (n, hand) -> min cards for a straight (vanilla 5, Four Fingers 4)
  'flush_min',          // (n, hand) -> min cards for a flush
  'flush_suits',        // (suits, hand) -> suits a flush can be made of
  'reset_game_globals', // (initial) per-round resets (vanilla: idol/mail/ancient/castle cards)
  'set_edition',        // (card, edition_key) -> false to refuse an edition (e.g. no shiny playing cards)
  'edition_weight',     // (weight, type) -> weight of an edition in the weighted (mod-edition) poll
  'scoring_areas',      // () -> [area] extra card areas scored like held cards (Pokermon's scry view)
  'can_reserve',        // (card) -> true if a pack card may be saved to the consumable slots ('reserve' action)
  'describe',           // (card, desc) adjust a live card's description (badges/info) — vanilla cards too
  'view_card',          // (card, v) add mod fields to a card's view-model entry
  'view',               // (view) add mod fields to the run view (e.g. view.areas.scry)
  'boss_eligible',      // (eligible, blind, ante) -> true/false overrides whether a boss can be drawn (get_new_boss)
  'hand_highlighted',   // () the player's hand selection changed (CardArea:parse_highlighted)
  'pack_card',          // (booster, i) -> a Card to use as card i of a base-game booster (else the vanilla roll)
  'joker_win_keys',     // (card) -> [joker keys] that also earn this win (Pokermon: a winner's previous evolutions)
  'fill_shop_jokers',   // () -> true when the mod stocked a new shop's joker slots itself
  'forced_selection',   // (card) Cerulean Bell just forced this hand card into the selection
  'remove_from_deck',   // (card, from_debuff) Card:remove_from_deck is running (added_to_deck just cleared; before the center's own)
  'end_of_round_effect', // (card, ret) a held card's get_end_of_round_effect (not debuffed), before it returns ret
  'hand_scored',        // (hand_chips, mult, ctx) end of evaluate_play (also for a debuffed hand: 0, 0)
  'is_suit',            // (card, suit, bypass_debuff, flush_calc) -> true: the card also counts as `suit` (after the debuff/Stone/Wild checks, before Smeared)
  'poll_edition',       // (key, mod, no_neg, guaranteed) -> edition table or null: replaces poll_edition (undefined = no opinion)
  'calculate_joker',    // (card, context) -> an effect (or null = none) that REPLACES card:calculate_joker (runs before the debuff check, like a Lua wrap); undefined = no opinion
  'copy_card',          // (new_card, other) copy_card just built new_card from other
  'emplace',            // (area, card, location, stay_flipped) CardArea:emplace just placed the card
  'edition_nil',        // (card) Card:set_edition was called with nil (Lua `edition == nil`; copy_card passes {})
  'wheel_failed',       // (used_tarot) The Wheel of Fortune said "Nope!"
  'booster_loc_vars',   // (vars, center) -> [choose, size] shown in a booster's description
  'blind_slot',         // (blind) -> 'Small' | 'Big' | 'Boss': the slot this blind fills (only Boss wins / ends the ante)
  'new_boss_choice',    // () the ante's Boss choice was just (re)rolled (newRun, reset_blinds, reroll_boss)
  'end_round_start',    // () end_round() was called (before its queued end-of-round work)
  'draw_hand_space',    // (n, e) -> n cards to draw to hand (before The Serpent)
  'modify_scoring',     // ([chips, mult], step, ctx) -> [chips, mult]; step 'before_cards' | 'final_scoring_step'
  'seal_retriggers',    // (card, context) -> [{card, ret: {repetitions, message}}] extra Card:calculate_seal runs
  'voucher_add',        // (phase) shop stocked: 'before_tags' / 'after_tags' the Voucher Tag's voucher_add
  'buy_space',          // (card) -> true: this card fits even with full slots (shop buy / pack pick)
  'can_skip_blind',     // () -> false: the blind on deck can't be skipped now
  // ---- BETMMA (vouchers that bend base rules; each is a Lua wrap in the mod)
  'next_voucher_key',   // (from_tag) -> a voucher key: replaces get_next_voucher_key's pick (undefined = no opinion)
  'apply_to_run',       // (self, center) Card:apply_to_run is about to apply a voucher (any voucher, before its effect)
  'redeem',             // (card, layer) Card:redeem is starting -> a function to run after it (or undefined)
  'set_ability',        // (card, center, old_center, initial) Card:set_ability ran (after the center's own set_ability)
  'chip_bonus',         // (ret, card) -> Card:get_chip_bonus's value
  'chip_mult',          // (ret, card) -> Card:get_chip_mult's value
  'chip_x_mult',        // (ret, card) -> Card:get_chip_x_mult's value
  'p_dollars',          // (ret, card) -> Card:get_p_dollars's value
  'card_repetitions',   // (card, context) -> [{message, repetitions, card}] the card's own extra retriggers (like a Red Seal)
  'eval_card',          // (card, context, ret) eval_card scored a played (G.play) / held (G.hand) card; may add to ret
  'evaluate_poker_hand',// (results, hand) evaluate_poker_hand's result table, before it's returned (edit in place)
  'played_cards_scored',// () the played cards have scored, before the held-in-hand effects
  'draw_from_play_to_discard', // () played cards are about to go to the discard (the rest go in a following event)
  'calculate_rental',   // (card) -> false: no rental payment this time
  'start_dissolve',     // (card) Card:start_dissolve is destroying this card (not called for sold cards)
  'shatter',            // (card) -> true: Card:shatter leaves the card in play (it didn't break)
  'sell_card',          // (card) Card:sell_card is starting
  'ease_dollars',       // (mod, instant) -> mod: the amount ease_dollars will apply
  'dollars_eased',      // (mod, instant) ease_dollars(mod) was called (the original amount; its event may be queued)
  'ease_ante',          // (mod) ease_ante was called
  'hand_leveled',       // (card, hand, amount) level_up_hand leveled a hand
  'blind_amount',       // (amount, ante) -> get_blind_amount's value
  'mod_chips',          // (chips) -> chips (mod_chips, before the vanilla cap)
  'mod_mult',           // (mult) -> mult (mod_mult)
  'highlight_limit',    // (limit, area, card) -> how many cards may be selected in this hand-type area
  'selection_limit',    // (n, kind) -> how many selected cards may be played / discarded ('play' | 'discard')
  'can_discard',        // () -> true: a discard is allowed with no discards left
  'discard_card',       // (card, ctx) a card is being discarded (after its seal, before the jokers)
  'discarded',          // (hook) discard_cards_from_highlighted finished (hook = a forced discard)
  'pre_play',           // () the player pressed Play (before the cards move) -> false: don't play after all
  'round_counts',       // (when, where) 'before'/'after' the round's hands & discards are reset; where 'new_round'|'cash_out'
  'evaluate_round_pre', // () evaluate_round is starting -> a function that undoes the changes afterwards
  'shop_card_types',    // () -> [{type, val}] extra card types (and rates) a shop slot can roll
  'shop_stocked',       // () a new shop was stocked (after the shop_final_pass tags)
  'skip_blind',         // ('before' | 'after') skipping a blind
  'reroll_boss',        // (from_tag) the boss was rerolled
  'reroll_shop',        // () the shop was rerolled
  'buy_area',           // (card) -> the area a bought consumable goes to (default G.consumeables)
  'bought',             // (card, use) a shop card was bought (its move into place may still be queued)
  'use_card',           // (card) G.FUNCS.use_card is starting
  'used_consumeable',   // (card, area, copier) a consumable's use_consumeable ran (inside use_card)
  'reserve_area',       // (card) -> an area a reserved pack card goes to when the consumable slots are full
  'action',             // (a) -> true (done) / an error string, for mod action types the engine doesn't know
  'update',             // () after every action (Lua Card:update / Game:update per-frame checks)
  // ---- Reverie (special "Cine" shops, tags sold as cards, a quest card area)
  'create_card_key',    // (_type, area, key_append) -> a forced key for a soulable create_card, rolled before the vanilla Soul / Black Hole rolls (undefined = none)
  'create_card_for_shop', // (area) -> a Card that replaces create_card_for_shop's roll (undefined = the vanilla roll)
  'reroll_cost',        // (cost) -> G.GAME.current_round.reroll_cost after calculate_reroll_cost (also with free rerolls)
  'get_pack',           // (pack, _key, _type) -> the booster center get_pack returns
  'tag_apply',          // (tag, context) -> false: the tag ignores this apply_to_run context (no effect, not triggered)
  'shop_end',           // () the shop closed (toggle_shop's event, before the next blind select)
  'action_area',        // (card, kind) -> true: a card in a mod card area may be used / sold here (kind 'use' | 'sell')
  'pack_select',        // (card) -> true / false: overrides whether this pack card may be taken now (undefined = the vanilla check)
  'pack_take_area',     // (card) -> a CardArea: this pack consumable is TAKEN into that area (added to the deck), not used
  'use_other',          // (card, area) -> true: use_card handled a card of a set it doesn't know (e.g. a Tag sold as a card)
  'use_card_done',      // (card, area) G.FUNCS.use_card returned (a Lua use_card wrap's tail)
  'buy_place',          // (card, use) -> true: buy_from_shop: the mod placed the bought card itself (no add_to_deck / area)
  'negative_area',      // (card) -> the CardArea whose card_limit a Negative edition on this card raises (default consumables / jokers)
  // ---- Bunco (linked cards, exotic suits, Blind / Virtual packs, discard & play rule changes)
  'add_to_highlighted', // (area, card, silent) -> true: the mod highlighted the card(s) itself (its own calls take the vanilla path)
  'remove_from_highlighted', // (area, card, force) -> true: the mod un-highlighted the card(s) itself (its own calls take the vanilla path)
  'can_highlight',      // (area, card) -> false: the 'highlight' action may not select this card (CardArea:can_highlight)
  'use_targets',        // (card) the 'use' action is about to select this consumable's targets in hand
  'use_card_override',  // (card) -> true: G.FUNCS.use_card is handled by the mod (e.g. a Blind card's "Select")
  'draw_from_deck_to_hand', // (e) G.FUNCS.draw_from_deck_to_hand just queued its draws (a Lua wrap: linked cards follow)
  'flip',               // (card) -> false: Card:flip leaves this face-up card face up
  'card_removed_after', // (card) Card:remove finished (out of its area and G.playing_cards)
  'sell_card_keep',     // (card) -> true: Card:sell_card pays out but leaves the card in place (not removed)
  'can_sell',           // (card) -> false: this card can't be sold now
  'shop_joker_stickers',// (card, area) create_card: a shop / pack joker, before the vanilla eternal / perishable poll
  'block_eternal',      // (card) -> true: create_card's set_eternal(true) is skipped for this card
  'consumable_edition_scores', // (card) -> false: a consumable's edition doesn't score in the joker loop
  'rescore_cards',      // (scoring_hand, ctx, score_card) once the played cards scored: score_card(card) scores a played card again (Bunco's Copper)
  'chips_scored',       // (total, ctx) -> the amount the hand adds to G.GAME.chips (the stats keep the real total)
  'skip_shop',          // () -> true: cash_out goes straight to the blind select (no shop)
  'play_start',         // () G.FUNCS.play_cards_from_highlighted is starting (cards still highlighted in hand)
  'play_pressed',       // () just before the hand is counted (ease_hands_played), cards still highlighted in hand
  'consume_hand',       // () -> false: this play doesn't use up a hand
  'discard_begin',      // (hook) -> true: G.FUNCS.discard_cards_from_highlighted is taken over (stop here)
  'discard_cards',      // (cards, count, hook) the discarded cards, before their per-card loop
  'discard_destination',// (card) -> the area a discarded card goes to (default G.discard)
  'discard_counted',    // () the discard was counted (not for a hook discard) -> true: stop here (no draw-state change)
  'discard_end',        // (hook) the end of discard_cards_from_highlighted (also with nothing to discard) -> true: handled
  'pack_card_created',  // (booster, card, i) Card:open made pack card i
  'blind_press_play',   // (blind) Blind:press_play is starting (before its disabled check)
  'blind_stay_flipped', // (area, card, blind) -> true: drawn face down (Blind:stay_flipped's hand branch, before The Wheel)
  'apply_tag',          // (tag, context) -> a result that replaces Tag:apply_to_run (undefined = no opinion)
  'add_tag',            // (tag) -> a replacement Tag for add_tag
  'double_tag_copies',  // (tag) -> false: a Double Tag doesn't copy this new tag
  'status_text',        // (card, eval_type, amt, extra) card_eval_status_text showed a popup (e.g. 'debuff')
  'create_card_rarity', // (_rarity, _type, area, key_append) -> the rarity create_card rolls its pool with (non-forced cards)
  'reordered',          // (area, before) the 'reorder' action rearranged an area (before = the old card order)
  // ---- AutumnMoodMechanics (joker Stamps, card Aspects, graveyard, unscored cards, suit levels)
  'set_seal',           // (card, seal, prev) Card:set_seal just changed the seal / stamp (prev = the old one; SMODS seal apply / unapply)
  'joker_seal',         // (joker, context) -> a Steamodded effect table: the joker's seal (a Stamp) calculates in joker_main, before the joker
  'probability_vars',   // ([numerator, denominator], trigger_obj, identifier) -> [numerator, denominator] after the fix_probability pass
  'probability_pass',   // ([numerator, denominator], 'mod_probability' | 'fix_probability', ctx) -> [n, d]: the deck/blind/stake's turn in a probability pass
  'consumable_highlight_count', // (n, card) -> how many selected hand cards a max_highlighted consumable counts (vanilla: #G.hand.highlighted)
  'unscored_card',      // (card, ctx) -> [effects]: a played, NOT scoring card's own main scoring (SMODS cardarea 'unscored'; optional feature)
  'held_cards_scored',  // (ctx) the held-in-hand cards have scored (G.scoring.score_held / score_played may score more cards)
  'create_card_type',   // (_type, forced_key, area, key_append) -> [_type, forced_key]: what create_card makes, before any roll (undefined = as asked)
  'joker_retriggers',   // (n, joker, context) -> n extra evaluations of this joker's effect (SMODS.calculate_retriggers wrap: a Sock and Buskin Stamp)
  'shuffled',           // (area, seed) CardArea:shuffle just shuffled this area (a Lua CardArea:shuffle wrap; reorder area.cards in place)
  // ---- the native deck editor (engine/customdeck.js: Deck Creator's rule options)
  'drawn_to_hand',      // (card) CardArea:draw_card_from just drew this card from the deck into the hand
  'pool_duplicates',    // (_type) -> true: get_current_pool lets already-used centers back in (as if Showman were held)
  'pool_hidden',        // (center, _type) -> true: The Soul / Black Hole may sit in an ordinary pool
  'calculate_seal',     // (card, context) -> a result that REPLACES Card:calculate_seal (null = nothing); undefined = no opinion
  'blue_seal',          // (card) a Blue Seal triggers at the end of the round -> a Planet key it makes instead (undefined = the usual)
  'use_consumeable',    // (card, area, copier) -> true: the mod applied this consumable's effect itself (a Card:use_consumeable wrap)
  'booster_free',       // (card) -> true: opening this shop booster costs nothing
  'skip_booster',       // () a booster pack is being skipped (G.FUNCS.skip_booster)
  'blind_on_deck',      // (slot) the blind select put this blind ('Small' | 'Big' | 'Boss') on deck
  // ---- challenges (engine/challenge.js: a challenge's own rules, active only in its run)
  'blind_modify_hand',  // (blind, cards, poker_hands, text, mult, hand_chips) -> [mult, hand_chips, modded] replacing Blind:modify_hand (not called while disabled)
];

/**
 * Steamodded optional features (SMODS.current_mod.optional_features): a feature is on for a run when an
 * ACTIVE mod declares it (`optional_features: {unscored: true, ...}`). The engine reads 'unscored'
 * (played cards that don't score get the cardarea 'unscored' pass); mods may read their own.
 */
export function feature(name) {
  if (!ACTIVE.length) return false;
  for (const id of ACTIVE) { const f = MODS[id].optional_features; if (f && f[name]) return true; }
  return false;
}

/**
 * Stickers registered by mods (Pokermon's Tera type stickers): key -> {key, badge_colour,
 * atlas, pos, label?}. A sticker is an `ability[key]` flag on a card; the engine never
 * reads it — the owning mod's rules do — so this table is for badges and art only.
 */
export const STICKERS = {};
/**
 * Mod sounds (Steamodded SMODS.Sound): full key ('mf_gun') -> {src, mod, music?}. The engine plays
 * them by key through play_sound like the base set; the UI resolves the key here (ui/sound.js). A run
 * picks a mod music track through its view (`view.music`, set by a mod's `view` hook).
 */
export const SOUNDS = {};
/** Mod suits (SMODS.Suit), by suit key ('bunc_Fleurons'). Their playing cards are P_CARDS[`${card_key}_${rank}`]. */
export const MOD_SUITS = {};
/** Mod poker hands (SMODS.PokerHand), by hand key ('bunc_Spectrum'): {key, chips, mult, l_chips, l_mult, visible, above_hand?, order_offset?, evaluate(parts, hand), modify_display_text?}. */
export const MOD_POKER_HANDS = {};
/** Mod poker hand parts (SMODS.PokerHandPart), by part key ('bunc_spectrum'): {key, func(hand) -> [[cards]]}. */
export const MOD_HAND_PARTS = {};
const RANK_KEYS = [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['T', '10'], ['J', 'Jack'], ['Q', 'Queen'], ['K', 'King'], ['A', 'Ace']];
/**
 * SMODS.inject_p_card for mod suits: an ACTIVE mod's suits get their 13 P_CARDS entries
 * (`<card_key>_<rank>`: {name, value, suit, pos, atlas, mod}); an inactive mod's are removed, so a
 * vanilla run's P_CARDS is exactly the base table. No-op without mod suits.
 */
function apply_mod_suits() {
  const keys = Object.keys(MOD_SUITS);
  if (!keys.length) return;
  for (const k of keys) {
    const s = MOD_SUITS[k];
    const on = activeSet.has(s.mod);
    RANK_KEYS.forEach(([rk, value], i) => {
      const ck = s.card_key + '_' + rk;
      if (on) P_CARDS[ck] = { key: ck, name: value + ' of ' + s.key, value, suit: s.key, pos: { x: i, y: (s.pos && s.pos.y) || 0 }, atlas: s.atlas, mod: s.mod };
      else delete P_CARDS[ck];
    });
  }
  reset_p_cards_list();
}
/** Active mod suits, in registration order. */
export function activeModSuits() {
  const out = [];
  for (const s of Object.values(MOD_SUITS)) if (activeSet.has(s.mod)) out.push(s);
  return out;
}
/** Active mod poker hands / parts. */
export function activeModHands() { return Object.values(MOD_POKER_HANDS).filter((h) => activeSet.has(h.mod)); }
export function activeModHandParts() { return Object.values(MOD_HAND_PARTS).filter((h) => activeSet.has(h.mod)); }

/**
 * Register a mod. Besides its content: `version` (upstream's) and optional `contentRev` (OUR behaviour
 * counter — bump it whenever we change how the mod plays) make its pin in every run recipe (mods/pins.js);
 * optional `aliases: {renamed: {old: new}, removed: [keys], names}` keep an upgrade's renamed / removed
 * keys loadable (mods/aliases.js).
 */
export function registerMod(mod) {
  if (!mod || !mod.id) throw new Error('registerMod: missing id');
  const prefix = mod.prefix || mod.id;
  mod.prefix = prefix;
  mod.requires = mod.requires || [];
  mod.optional = mod.optional || [];
  mod.hooks = mod.hooks || {};
  mod.options = mod.options || {};
  mod.content = mod.content || {};
  const C = mod.content;
  const own = (o) => { o.mod = mod.id; return o; };
  // Centers: jokers/consumables/boosters/vouchers/backs/enhancements/editions/...
  for (const c of C.centers || []) {
    if (!c.key) throw new Error(`${mod.id}: center without key`);
    if (P_CENTERS[c.key] && !P_CENTERS[c.key].mod) throw new Error(`${mod.id}: ${c.key} collides with a base center`);
    own(c);
    c.config = c.config || {};
    c.unlocked = true; c.discovered = true;
    if (c.order === undefined) c.order = 10000 + Object.keys(P_CENTERS).length;
    P_CENTERS[c.key] = c;
  }
  // (SMODS.Tag sets set = 'Tag' itself: the describe / tooltip text is looked up by it — Bunco's tags don't name it)
  for (const t of C.tags || []) { own(t); t.set = t.set || 'Tag'; t.order = t.order ?? 1000 + Object.keys(P_TAGS).length; P_TAGS[t.key] = t; }
  for (const b of C.blinds || []) { own(b); b.order = b.order ?? 1000 + Object.keys(P_BLINDS).length; P_BLINDS[b.key] = b; }
  for (const s of C.seals || []) { own(s); s.order = s.order ?? 100 + Object.keys(P_SEALS).length; P_SEALS[s.key] = s; }
  for (const s of C.stakes || []) { own(s); P_STAKES[s.key] = s; }
  for (const t of C.consumable_types || []) {
    own(t);
    t.rate_key = t.rate_key || t.key.toLowerCase() + '_rate';
    CONSUMABLE_TYPES[t.key] = t;
  }
  for (const r of C.rarities || []) { own(r); RARITIES[r.key] = r; }
  // Mod suits (SMODS.Suit): {key, card_key, pos:{y}, ui_pos, atlas, colour, nominal?, in_pool(args)}; their
  // P_CARDS entries exist only while the mod is on (activateMods).
  for (const s of C.suits || []) { own(s); MOD_SUITS[s.key] = s; }
  // Mod poker hands (SMODS.PokerHand / PokerHandPart): see run.js rebuild_handlist / evaluate_poker_hand.
  for (const h of C.poker_hands || []) { own(h); MOD_POKER_HANDS[h.key] = h; }
  for (const p of C.poker_hand_parts || []) { own(p); MOD_HAND_PARTS[p.key] = p; }
  for (const s of C.stickers || []) { own(s); STICKERS[s.key] = s; }
  for (const [key, snd] of Object.entries(C.sounds || {})) SOUNDS[key] = { ...snd, mod: mod.id };
  for (const [name, a] of Object.entries(C.atlases || {})) ATLASES[name] = { ...a, mod: mod.id };
  if (C.loc) {
    for (const [set, entries] of Object.entries(C.loc.descriptions || {})) {
      MOD_LOC.descriptions[set] = MOD_LOC.descriptions[set] || {};
      Object.assign(MOD_LOC.descriptions[set], entries);
    }
    for (const [k, v] of Object.entries((C.loc.misc || {}))) {
      MOD_LOC.misc[k] = MOD_LOC.misc[k] || {};
      Object.assign(MOD_LOC.misc[k], v);
    }
  }
  // key aliases for a mod upgrade's renamed / removed keys (mods/aliases.js)
  if (mod.aliases) addAliases(mod.id, mod.aliases);
  MODS[mod.id] = mod;
  return mod;
}

/** Is this key registered (a center, tag, blind, seal or stake — base or any mod's)? */
export const keyKnown = (k) => typeof k === 'string' && !!(P_CENTERS[k] || P_TAGS[k] || P_BLINDS[k] || P_SEALS[k] || P_STAKES[k]);
/** A stored card key -> the key to use now (a renamed key that is no longer registered -> its new key). */
export const resolveCardKey = (k) => resolveAlias(k, keyKnown);
/** A removed ("retired") card key that is no longer registered. */
export const isRetiredKey = (k) => isRetiredAlias(k, keyKnown);

/** Ids plus everything they require, in dependency order. Unknown ids are dropped. */
export function resolveMods(ids) {
  const out = [];
  const visit = (id, stack = []) => {
    const m = MODS[id];
    if (!m || out.includes(id) || stack.includes(id)) return;
    for (const r of m.requires) visit(r, [...stack, id]);
    out.push(id);
  };
  for (const id of ids || []) visit(id);
  return out;
}

export function isActive(id) { return activeSet.has(id); }
export function activeMods() { return ACTIVE.map((id) => MODS[id]); }

/** Is this center/tag/blind/... available in the current run? Base content always is. */
export function centerActive(c) {
  if (!c || !c.mod) return true;
  if (!activeSet.has(c.mod)) return false;
  // A center may need one of its mod's options (`mod_option`, e.g. Nacho's per-line toggles):
  // off = gone, exactly like an inactive mod.
  if (c.mod_option && !(modOptions[c.mod] && modOptions[c.mod][c.mod_option])) return false;
  // Steamodded `dependencies` on an item: a cross-mod card exists only while every mod it needs is on too.
  if (c.dependencies && !c.dependencies.every((d) => activeSet.has(d))) return false;
  return true;
}

/**
 * Activate a set of mods for a new run (called by newRun before anything
 * else touches pools). Rebuilds the center pools so inactive mods vanish.
 */
export function activateMods(ids, options = {}) {
  ACTIVE = resolveMods(ids);
  activeSet.clear();
  for (const id of ACTIVE) activeSet.add(id);
  modOptions = {};
  for (const id of ACTIVE) {
    const m = MODS[id];
    const defaults = {};
    for (const [k, o] of Object.entries(m.options)) defaults[k] = o.default;
    modOptions[id] = { ...defaults, ...(options[id] || {}) };
  }
  // A registered mod may undo run-wide changes to shared tables at every new run, on or off
  // (`reset_run`; BETMMA's Bonus+ / Mult+ / Slate raise the shared enhancement values like the Lua).
  for (const m of Object.values(MODS)) if (typeof m.reset_run === 'function') m.reset_run();
  apply_mod_suits();
  rebuildPools(centerActive);
  return ACTIVE;
}
let modOptions = {};
/** Option value for an active mod (its declared default if unset). */
export function opt(modId, key) { return modOptions[modId] ? modOptions[modId][key] : undefined; }
export function allOptions() { return JSON.parse(JSON.stringify(modOptions)); }

/** Call `name` on every active mod; returns the array of non-undefined results. */
export function callHook(name, ...args) {
  if (!ACTIVE.length) return [];
  const out = [];
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(...args); if (r !== undefined) out.push(r); }
  }
  return out;
}
/** Thread a value through every active mod's `name` hook: v = hook(v, ...args) ?? v. */
export function reduceHook(name, value, ...args) {
  if (!ACTIVE.length) return value;
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(value, ...args); if (r !== undefined) value = r; }
  }
  return value;
}
/** First non-undefined answer from an active mod's `name` hook (overrides). */
export function firstHook(name, ...args) {
  if (!ACTIVE.length) return undefined;
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(...args); if (r !== undefined) return r; }
  }
  return undefined;
}

/** Active consumable types (for shop rates / pools). */
export function activeConsumableTypes() {
  return Object.values(CONSUMABLE_TYPES).filter((t) => activeSet.has(t.mod));
}

/** True when any active mod defines `name` (lets the engine skip work for vanilla runs). */
export function hasHook(name) {
  for (const id of ACTIVE) if (MODS[id].hooks[name]) return true;
  return false;
}

/** Mod editions (centers with set 'Edition' from an active mod), in registration order. */
let _edCache = null, _edFor = null;
export function activeModEditions() {
  if (!ACTIVE.length) return [];
  if (_edFor !== ACTIVE) {
    _edCache = [];
    for (const c of Object.values(P_CENTERS)) if (c.set === 'Edition' && c.mod && activeSet.has(c.mod)) _edCache.push(c);
    _edFor = ACTIVE;
  }
  return _edCache;
}

/** Manifest of every mod the site ships (id -> loader), see ./index.js. */
export { G };
