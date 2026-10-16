// Micatro — the native deck editor's engine side: custom decks.
//
// A rebuild of Nyoxide's Deck Creator mod (v1.2.2) as a Micatro feature. A custom deck is a plain
// JSON DEFINITION (see validateDeck): a name, card-back art, starting parameters (money, hands,
// discards, hand size, slots, interest, rates...), the starting playing cards, starting jokers /
// consumables / vouchers / tags, banned items, and Deck Creator's rule options ("static mods" and
// "dynamic mods", RULES below).
//
//   newRun({..., customDeck: def})   -> the run starts from the definition (run.js)
//
// The definition is part of the run RECIPE (session.js), so resume / replay / spectate rebuild the
// very same run. It plays as an internal mod (`customdeck`, never listed in the Mods panel and never
// in G.GAME.mods): its rules are ordinary engine HOOKS (mods/registry.js), active only in a run that
// has a custom deck — a run without one never touches this file. Every chance roll uses the run's
// seeded RNG (Deck Creator used math.random), so a custom-deck run is deterministic like any other.
//
// Fixes over Deck Creator 1.2.2 (each pinned by micatro/tests/customdeck_test.mjs):
//   * "Mult/Chips reduced by X percent" were commented out (no effect) — they work as labelled.
//   * "Chance to consider 7s / Stones as Lucky cards" permanently set the card's Mult to 20 (every
//     later play scored +20 Mult) — here the card only rolls like a Lucky card.
//   * "Chance to triple / disable money from Gold cards" changed the money of PLAYED Gold cards
//     (+$6 / -$3 when played) — here it changes what a held Gold card pays at the end of the round.
//   * Skip-disable chances rolled every time the blind-select UI was drawn — here once per blind.
//   * Celestial "never most played" rerolls freed their discarded planets (Lua leaked them as used).

import {
  G, P_CENTERS, P_CARDS, P_BLINDS, P_TAGS, P_SEALS, P_CENTER_POOLS, Card, create_card, create_playing_card, copy_card,
  add_joker, poll_edition, pseudoseed, pseudorandom, pseudorandom_element, pseudoshuffle, ease_dollars,
  level_up_hand, card_eval_status_text, localize, emit, P_CARDS_LIST, probability_roll, get_pack, play_sound,
} from './core.js';
import * as B from './bignum.js';
import { registerMod, centerActive } from '../mods/registry.js';
import { Tag, add_tag } from './tag.js';

export const CUSTOM_DECK_ID = 'customdeck';
export const CUSTOM_DECK_VERSION = 1;
/** The neutral engine back a custom deck plays on (no effects of its own); `def.back` is art only. */
export const CUSTOM_DECK_BACK = 'b_challenge';

// ------------------------------------------------------------------ schema
// [key, label, default, min, max, step]   (integers unless step < 1)
export const PARAM_GROUPS = [
  ['General', [
    ['joker_slots', 'Joker slots', 5, 0, 30],
    ['consumable_slots', 'Consumable slots', 2, 0, 20],
    ['ante_scaling', 'Ante scaling', 1, 1, 3],
    ['blind_scaling', 'Blind score multiplier', 1, 0.05, 100, 0.05],
    ['win_ante', 'Winning ante', 8, 1, 100],
  ]],
  ['Money', [
    ['dollars', 'Starting dollars', 4, -50, 9999],
    ['money_per_hand', 'Dollars per hand', 1, 0, 50],
    ['money_per_discard', 'Dollars per discard', 0, 0, 50],
    ['interest_amount', 'Interest amount', 1, 0, 50],
    ['interest_cap', 'Interest cap ($)', 5, 0, 200],
    ['discount_percent', 'Discount percent', 0, 0, 100],
    ['reroll_cost', 'Reroll cost', 5, 0, 50],
    ['discard_cost', 'Discard cost', 0, 0, 50],
  ]],
  ['Hands & Discards', [
    ['hands', 'Hands', 4, 1, 25],
    ['discards', 'Discards', 3, 0, 25],
    ['hand_size', 'Hand size', 8, 1, 25],
  ]],
  ['Appearance Rates', [
    ['joker_rate', 'Joker rate', 20, 0, 100],
    ['tarot_rate', 'Tarot rate', 4, 0, 100],
    ['planet_rate', 'Planet rate', 4, 0, 100],
    ['spectral_rate', 'Spectral rate', 0, 0, 100],
    ['playing_card_rate', 'Playing card rate', 0, 0, 100],
  ]],
];
export const PARAMS = PARAM_GROUPS.flatMap(([, list]) => list);

// Deck Creator's rule options: [key, label, kind, default, min, max]. kind: 'bool' | 'pct' (0-100 %) | 'int' | 'num'.
const pct = (key, label) => [key, label, 'pct', 0, 0, 100];
const BOSS_TAGS = [
  ['uncommon_tag_percent', 'tag_uncommon', 'Uncommon'], ['rare_tag_percent', 'tag_rare', 'Rare'], ['foil_tag_percent', 'tag_foil', 'Foil'],
  ['negative_tag_percent', 'tag_negative', 'Negative'], ['holographic_tag_percent', 'tag_holo', 'Holographic'],
  ['polychrome_tag_percent', 'tag_polychrome', 'Polychrome'], ['investment_tag_percent', 'tag_investment', 'Investment'],
  ['voucher_tag_percent', 'tag_voucher', 'Voucher'], ['boss_tag_percent', 'tag_boss', 'Boss'], ['mega_standard_tag_percent', 'tag_standard', 'Standard'],
  ['charm_tag_percent', 'tag_charm', 'Charm'], ['meteor_tag_percent', 'tag_meteor', 'Meteor'], ['buffoon_tag_percent', 'tag_buffoon', 'Buffoon'],
  ['handy_tag_percent', 'tag_handy', 'Handy'], ['garbage_tag_percent', 'tag_garbage', 'Garbage'], ['ethereal_tag_percent', 'tag_ethereal', 'Ethereal'],
  ['coupon_tag_percent', 'tag_coupon', 'Coupon'], ['double_tag_percent', 'tag_double', 'Double'], ['juggle_tag_percent', 'tag_juggle', 'Juggle'],
  ['d6_tag_percent', 'tag_d_six', 'D6'], ['top_up_tag_percent', 'tag_top_up', 'Top-up'], ['skip_tag_percent', 'tag_skip', 'Skip'],
  ['orbital_tag_percent', 'tag_orbital', 'Orbital'], ['economy_tag_percent', 'tag_economy', 'Economy'],
];
export const RULE_GROUPS = [
  ['Gameplay', [
    ['aces_are_faces', 'Aces are considered Face cards', 'bool', false],
    ['sevens_are_faces', '7s are considered Face cards', 'bool', false],
    ['stones_are_faces', 'Stone cards are considered Face cards', 'bool', false],
    ['chips_dollar_cap', 'Chips cannot exceed current $', 'bool', false],
    ['minus_hand_size_per_X_dollar', 'Hold -1 cards in hand per $5', 'bool', false],
    ['debuff_played_cards', 'All played cards become debuffed after scoring', 'bool', false],
    ['death_targets_random_card', 'Death cards transform a random card in hand instead', 'bool', false],
    ['spectral_cards_cannot_destroy_jokers', 'Ankh and Hex cannot destroy Jokers', 'bool', false],
    ['ectoplasm_cannot_change_hand_size', 'Ectoplasm cannot reduce your hand size', 'bool', false],
    ['ouija_cannot_change_hand_size', 'Ouija cannot reduce your hand size', 'bool', false],
    ['wraith_cannot_set_money_to_zero', 'Wraith cannot modify your money', 'bool', false],
    ['spectral_seals_add_additional', 'Spectral cards add 1 additional Seal', 'bool', false],
    ['no_spectral_destroy_cards', 'Spectral cards cannot destroy cards in your hand', 'bool', false],
    pct('balance_percent', 'Chance to Balance Chips and Mult'),
    ['flipped_cards', '1 in X cards are drawn face down (0 = off)', 'int', 0, 0, 100],
    ['draw_to_hand_size', 'Cards to draw on play or discard (0 = refill)', 'int', 0, 0, 50],
    ['extra_hand_level_upgrades', 'Gain X extra levels whenever a hand is upgraded', 'int', 0, 0, 20],
    pct('chance_to_increase_discard_cards_rank', 'Chance to increase rank of discarded cards by 1'),
    pct('chance_to_increase_drawn_cards_rank', 'Chance to increase rank of drawn cards by 1'),
    pct('mult_reduction_percent', 'Mult reduced by X percent'),
    pct('chip_reduction_percent', 'Chips reduced by X percent'),
    ['multiply_probabilities', 'Multiply all probabilities by X', 'int', 1, 1, 100],
    ['divide_probabilities', 'Divide all probabilities by X', 'int', 1, 1, 100],
    ['edition_rate', 'Edition rate', 'int', 1, 0, 100],
    pct('destroy_random_joker_after_ante_four', 'Chance to destroy a random Joker at the end of Ante 4'),
  ]],
  ['Money', [
    ['full_price_jokers', 'Jokers sell for full price', 'bool', false],
    ['full_price_consumables', 'Consumables sell for full price', 'bool', false],
    ['inflation', 'Raise prices by $1 on every purchase', 'bool', false],
    ['negative_fifty_dollars_allowed', 'Allow funds to drop to -$50', 'bool', false],
    ['booster_ante_scaling', 'Boosters cost $X more per Ante', 'int', 0, 0, 50],
    ['negative_joker_money', 'Gain $X per round for each Negative Joker', 'int', 0, -300, 300],
    ['enhanced_dollars_per_round', 'Gain $X per round for each Enhanced card', 'int', 0, -300, 300],
    ['gain_dollars_when_skip_booster', 'Gain $X when any Booster Pack is skipped', 'int', 0, -300, 300],
    ['random_sell_value_increase', 'Add $X Sell Value to a random Joker each round', 'int', 0, 0, 100],
    ['random_sell_value_decrease', 'Remove $X Sell Value from a random Joker each round', 'int', 0, 0, 100],
  ]],
  ['Shop', [
    ['reroll_boosters', 'Reroll also replaces Booster Packs', 'bool', false],
    ['allow_legendary_jokers_everywhere', 'Allow Legendary Jokers to appear', 'bool', false],
    ['enable_eternals_in_shop', 'Eternal Jokers appear in shop', 'bool', false],
    ['enable_perishables_in_shop', 'Perishable Jokers appear in shop', 'bool', false],
    ['enable_rentals_in_shop', 'Rental Jokers appear in shop', 'bool', false],
    ['all_eternal', 'All Jokers are Eternal', 'bool', false],
    ['allow_soul', 'Allow The Soul to appear', 'bool', false],
    ['allow_black_hole', 'Allow Black Hole to appear', 'bool', false],
    ['allow_duplicate_jokers', 'Allow duplicate items to appear', 'bool', false],
    ['one_free_card_in_shop', 'One random card in initial shop is free', 'bool', false],
    ['voucher_is_free', 'Voucher is always free', 'bool', false],
    ['one_free_booster_in_shop', 'One random Booster Pack in initial shop is free', 'bool', false],
    ['one_free_item_in_shop', 'One random item in initial shop is free', 'bool', false],
    ['shop_slots', 'Joker slots in the shop', 'int', 2, 0, 5],
    ['booster_pack_slots', 'Booster Pack slots', 'int', 2, 0, 10],
    ['voucher_slots', 'Voucher slots', 'int', 1, 0, 5],
    ['eternal_rate', 'Eternal rate', 'pct', 30, 0, 100],
    ['perishable_rate', 'Perishable rate', 'pct', 30, 0, 100],
    ['rental_rate', 'Rental rate', 'pct', 30, 0, 100],
  ]],
  ['Booster Packs', [
    ['always_telescoping', 'Celestial Packs always contain most played hand', 'bool', false],
    ['never_telescoping', 'Celestial Packs never contain most played hand', 'bool', false],
    ['spectral_cards_in_arcana', 'Allow Spectral cards to appear in Arcana Packs', 'bool', false],
    ['planet_cards_in_arcana', 'Allow Planet cards to appear in Arcana Packs', 'bool', false],
    ['tarot_cards_in_spectral', 'Allow Tarot cards to appear in Spectral Packs', 'bool', false],
    ['planet_cards_in_spectral', 'Allow Planet cards to appear in Spectral Packs', 'bool', false],
    ['tarot_cards_in_celestial', 'Allow Tarot cards to appear in Celestial Packs', 'bool', false],
    ['spectral_cards_in_celestial', 'Allow Spectral cards to appear in Celestial Packs', 'bool', false],
    ['standard_pack_enhancement_rate', 'Standard Pack enhancement rate', 'pct', 40, 0, 100],
    ['standard_pack_edition_rate', 'Standard Pack edition rate', 'int', 2, 0, 300],
    ['standard_pack_seal_rate', 'Standard Pack seal rate', 'pct', 20, 0, 100],
    ['extra_booster_pack_choices', 'Extra Booster Pack choices', 'int', 0, 0, 10],
    ['extra_arcana_pack_cards', 'Extra cards in Arcana Packs', 'int', 0, 0, 5],
    ['extra_celestial_pack_cards', 'Extra cards in Celestial Packs', 'int', 0, 0, 5],
    ['extra_spectral_pack_cards', 'Extra cards in Spectral Packs', 'int', 0, 0, 5],
    ['extra_standard_pack_cards', 'Extra cards in Standard Packs', 'int', 0, 0, 5],
    ['extra_buffoon_pack_cards', 'Extra cards in Buffoon Packs', 'int', 0, 0, 5],
    pct('chance_for_free_booster', 'Chance to spend $0 when purchasing Booster Packs'),
  ]],
  ['Blind', [
    pct('skip_shop_chance_small_blind', 'Chance to autoskip the shop after the Small Blind'),
    pct('skip_shop_chance_big_blind', 'Chance to autoskip the shop after the Big Blind'),
    pct('skip_shop_chance_boss', 'Chance to autoskip the shop after the Boss'),
    pct('skip_shop_chance_any', 'Chance to autoskip the shop after every Blind'),
    pct('chance_for_random_negative_joker_on_shop_skip', 'Chance to gain a random Negative Joker if the shop is skipped'),
    pct('chance_for_twenty_dollars_on_shop_skip', 'Chance to gain $20 if the shop is skipped'),
    pct('skip_blind_disabled_chance_small_blind', 'Chance to disable Skip on the Small Blind'),
    pct('skip_blind_disabled_chance_big_blind', 'Chance to disable Skip on the Big Blind'),
    pct('skip_blind_disabled_chance_any', 'Chance to disable Skip on every Blind'),
    pct('chance_for_five_dollars_on_skip_disable', 'Chance to gain $5 if Skip is disabled'),
    pct('chance_for_fifteen_dollars_on_skip_disable', 'Chance to gain $15 if Skip is disabled'),
    pct('chance_for_negative_joker_on_skip_disable', 'Chance to gain a random Negative Joker if Skip is disabled'),
  ]],
  ['Seals', [
    ['blue_seal_switch_trigger', 'On Blue Seal trigger, switch to another random Seal', 'bool', false],
    ['blue_seal_always_most_played', 'Blue Seals always make the Planet of your most played hand', 'bool', false],
    ['purple_seal_switch_trigger', 'On Purple Seal trigger, switch to another random Seal', 'bool', false],
    ['red_seal_silly_messages', "Replace Red Seal 'Again!' with silly messages", 'bool', false],
    ['extra_red_seal_repetitions', 'Extra Red Seal repetitions', 'int', 0, 0, 10],
    pct('chance_to_double_gold_seal', 'Chance to double Gold Seal money'),
    pct('chance_for_two_purple_tarots', 'Chance to receive a second Tarot on Purple Seal discard'),
    pct('chance_to_disable_red_seal_retriggers', 'Chance to disable retriggers on Red Seal cards'),
    pct('chance_purple_seal_rolls_spectral', 'Chance for Purple Seals to create Spectrals instead'),
    pct('chance_for_negative_joker_on_blue_seal_trigger', 'Chance to receive a random Negative Joker when a Blue Seal triggers'),
  ]],
  ['Enhancements', [
    pct('make_sevens_lucky', 'Chance to consider 7s as Lucky cards'),
    pct('make_stones_lucky', 'Chance to consider Stones as Lucky cards'),
    pct('triple_mult_cards_chance', 'Chance to triple Mult from Mult cards'),
    pct('disable_mult_cards_chance', 'Chance to disable Mult from Mult cards'),
    pct('chance_to_triple_gold_money', 'Chance to triple money from Gold cards'),
    pct('chance_to_disable_gold_money', 'Chance to disable money from Gold cards'),
  ]],
  ['Glass Break', [
    ['broken_glass_money', 'Gain $X on Glass break', 'int', 0, -300, 300],
    pct('gain_ten_dollars_glass_break_chance', 'Chance to gain $10 on Glass break'),
    pct('replace_broken_glass_with_stones_chance', 'Chance to replace broken Glass with Stones'),
    pct('replace_broken_glass_with_random_cards_chance', 'Chance to replace broken Glass with random cards'),
    pct('negative_joker_for_broken_glass', 'Chance to receive a random Negative Joker on Glass break'),
    pct('destroy_joker_on_broken_glass', 'Chance to destroy a random Joker on Glass break'),
  ]],
  ['Boss Win Tags', BOSS_TAGS.map(([k, , n]) => pct(k, `Chance to gain a ${n} Tag on Boss win`))],
  ['Starting Deck', [
    ['remove_faces', 'No Face cards', 'bool', false],
    ['no_aces', 'No Aces', 'bool', false],
    ['no_numbered_cards', 'No numbered cards', 'bool', false],
    ['randomize_ranks', 'Randomize ranks', 'bool', false],
    ['randomize_suits', 'Randomize suits', 'bool', false],
    ['one_random_voucher', 'Start with 1 random Voucher', 'bool', false],
    ['random_starting_jokers', 'Start with X random Jokers', 'int', 0, 0, 10],
    ['randomize_money_configurable', 'Increase starting money by $0 - $X', 'int', 0, 0, 999],
    ...[['polychrome', 'Polychrome'], ['holographic', 'Holographic'], ['foil', 'Foil'], ['edition', 'a random Edition'],
      ['bonus', 'Bonus'], ['glass', 'Glass'], ['lucky', 'Lucky'], ['steel', 'Steel'], ['stone', 'Stone'], ['wild', 'Wild'],
      ['mult', 'Mult'], ['gold', 'Gold'], ['enhancement', 'a random Enhancement']]
      .map(([k, n]) => [`random_${k}_cards`, `X random cards become ${n}`, 'int', 0, 0, 500]),
  ]],
];
export const RULES = RULE_GROUPS.flatMap(([, list]) => list.map(([key, label, kind, def, min, max]) => ({
  key, label, kind, default: def, min: min ?? (kind === 'bool' ? 0 : 0), max: max ?? (kind === 'pct' ? 100 : 1),
})));
const RULE_BY_KEY = Object.fromEntries(RULES.map((r) => [r.key, r]));

/**
 * Deck Creator options NOT ported, and why (shown in the editor's About box and the report):
 * the rest of Deck Creator's ~120 rule options are all above.
 */
export const SKIPPED_OPTIONS = [
  ['copy_deck_config', "commented out in Deck Creator 1.2.2 (no UI, no effect)"],
  ['double_tag / balance_chips', 'legacy switches Deck Creator folds into the Double Tag / Balance chance options'],
  ['all_polychrome, all_holo, all_foil, all_bonus, all_mult, all_wild, all_glass, all_steel, all_stone, all_gold, all_lucky', 'not in its UI; the card editor\'s "apply to all" tools do the same'],
  ['randomize_hands_discards, randomize_money_settings, randomize_money_small, randomize_appearance_rates, random_starting_items, randomly_enable_gameplay_settings', 'disabled (commented out) in Deck Creator 1.2.2\'s UI'],
  ['randomize_rank_suit, edition, edition_count', 'not in its UI (Erratic-style randomization is covered by Randomize ranks + suits)'],
  ['blind_scaling 2/3 as a stake scaling tier', 'a Deck Creator quirk; the Blind score multiplier is ported as a plain multiplier'],
  ['invert_back', 'cosmetic Lua sprite flag (the back art is shown as is)'],
];

export const RED_SEAL_MESSAGES = ["Mama Liz's Chili Oil", 'GOGOGOGOGOGOGO', 'GO! AGAIN!', 'Bruh', 'One More Time!', 'America!', 'Praise Thunk'];

// --------------------------------------------------------------- limits
export const LIMITS = { name: 32, desc: 200, cards: 500, cardEntries: 500, jokers: 50, consumables: 50, vouchers: 100, tags: 30, bans: 2000, mods: 16, json: 65536 };
const KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
const SUITS = ['S', 'H', 'C', 'D'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const BASE_EDITIONS = ['foil', 'holo', 'polychrome', 'negative'];
const SEALS = ['Red', 'Blue', 'Gold', 'Purple'];
const BASE_ENH = ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_stone', 'm_gold', 'm_lucky'];

const clampNum = (v, min, max, def, step) => {
  let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  n = Math.min(max, Math.max(min, n));
  if (!step || step >= 1) return Math.round(n);
  return Math.round(n * 100) / 100;
};
const cleanStr = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const cleanKey = (k) => (typeof k === 'string' && KEY_RE.test(k) ? k : null);
const cleanEdition = (e) => {
  if (!e || e === 'none' || e === 'None') return null;
  const s = String(e).toLowerCase();
  if (s === 'holographic') return 'holo';
  if (BASE_EDITIONS.includes(s) || s === 'random') return s;
  return /^e_[a-z0-9_]{1,40}$/.test(s) ? s : null; // a mod edition key ('e_poke_shiny')
};
const cleanSeal = (s) => (typeof s === 'string' && (SEALS.includes(s) || /^[A-Za-z0-9_]{1,40}$/.test(s)) && s !== 'None' && s !== 'none' ? s : null);
const count = (n, max) => clampNum(n, 1, max, 1);

/**
 * Validate + clamp a definition into its canonical form. Never throws: anything malformed becomes
 * its default, oversized lists are cut to LIMITS, unknown keys are dropped. Keys of content that
 * isn't registered (a mod that's off) are kept here and skipped when a run starts.
 */
export function validateDeck(raw) {
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = { v: CUSTOM_DECK_VERSION };
  out.name = cleanStr(d.name, LIMITS.name) || 'Custom Deck';
  out.desc = cleanStr(d.desc, LIMITS.desc);
  out.back = cleanKey(d.back) && /^b_/.test(d.back) ? d.back : 'b_red';
  out.mods = [...new Set((Array.isArray(d.mods) ? d.mods : []).filter((m) => typeof m === 'string' && /^[a-z0-9_-]{1,32}$/.test(m) && m !== CUSTOM_DECK_ID))].slice(0, LIMITS.mods);
  const p = d.params && typeof d.params === 'object' ? d.params : {};
  out.params = {};
  for (const [key, , def, min, max, step] of PARAMS) out.params[key] = clampNum(p[key], min, max, def, step);
  // cards: null = the standard 52; else [[front, enhancement|0, edition|0, seal|0, count], ...]
  if (Array.isArray(d.cards)) {
    out.cards = [];
    let total = 0;
    for (const e of d.cards) {
      if (out.cards.length >= LIMITS.cardEntries || total >= LIMITS.cards) break;
      const a = Array.isArray(e) ? e : (e && typeof e === 'object' ? [e.front || e.key, e.enh || e.enhancement, e.edition, e.seal, e.n || e.copies] : null);
      if (!a) continue;
      const front = cleanKey(a[0]);
      if (!front || !front.includes('_')) continue;
      const enh = cleanKey(a[1]) && /^m_/.test(a[1]) ? a[1] : 0;
      const ed = cleanEdition(a[2]);
      const seal = cleanSeal(a[3]);
      const n = Math.min(count(a[4], LIMITS.cards), LIMITS.cards - total);
      total += n;
      out.cards.push([front, enh || 0, ed && ed !== 'random' ? ed : 0, seal || 0, n]);
    }
  } else out.cards = null;
  const items = (list, max, f) => {
    const res = [];
    let total = 0;
    for (const e of Array.isArray(list) ? list : []) {
      if (total >= max) break;
      const it = f(e);
      if (!it) continue;
      it.n = Math.min(count(it.n, max), max - total);
      total += it.n;
      res.push(it);
    }
    return res;
  };
  out.jokers = items(d.jokers, LIMITS.jokers, (e) => {
    const key = cleanKey(e && typeof e === 'object' ? (e.key || e.id) : e);
    if (!key) return null;
    const it = { key, n: e.n ?? e.copies };
    const ed = cleanEdition(e.edition); if (ed) it.edition = ed;
    for (const f of ['eternal', 'perishable', 'rental', 'pinned']) if (e[f] === true) it[f] = true;
    if (it.eternal && it.perishable) delete it.perishable; // (Balatro: never both)
    return it;
  });
  out.consumables = items(d.consumables, LIMITS.consumables, (e) => {
    const key = cleanKey(e && typeof e === 'object' ? (e.key || e.id) : e);
    if (!key) return null;
    const it = { key, n: e.n ?? e.copies };
    const ed = cleanEdition(e.edition); if (ed === 'negative' || ed === 'random') it.edition = ed;
    return it;
  });
  out.vouchers = [...new Set((Array.isArray(d.vouchers) ? d.vouchers : []).map(cleanKey).filter(Boolean))].slice(0, LIMITS.vouchers);
  out.tags = items(d.tags, LIMITS.tags, (e) => {
    const key = cleanKey(e && typeof e === 'object' ? e.key : e);
    return key ? { key, n: e.n ?? e.copies } : null;
  });
  const bans = d.bans && typeof d.bans === 'object' ? d.bans : {};
  out.bans = {};
  let nb = 0;
  for (const k of ['jokers', 'consumables', 'vouchers', 'tags', 'blinds', 'boosters']) {
    const list = [...new Set((Array.isArray(bans[k]) ? bans[k] : []).map(cleanKey).filter(Boolean))];
    out.bans[k] = list.slice(0, Math.max(0, LIMITS.bans - nb));
    nb += out.bans[k].length;
  }
  // rules: only the options that differ from Deck Creator's defaults are kept
  const r = d.rules && typeof d.rules === 'object' ? d.rules : {};
  out.rules = {};
  for (const o of RULES) {
    if (r[o.key] === undefined) continue;
    const v = o.kind === 'bool' ? r[o.key] === true : clampNum(r[o.key], o.min, o.max, o.default);
    if (v !== o.default) out.rules[o.key] = v;
  }
  return out;
}

/** The rule's value in a (validated) definition. */
export const ruleOf = (def, key) => (def && def.rules && def.rules[key] !== undefined ? def.rules[key] : RULE_BY_KEY[key].default);

// --------------------------------------------------------------- presets
const allFronts = () => { const out = []; for (const s of SUITS) for (const r of RANKS) out.push(s + '_' + r); return out; };
export const CARD_PRESETS = [
  { id: 'standard', name: 'Standard 52', cards: () => null },
  { id: 'no_faces', name: 'No face cards (40)', cards: () => allFronts().filter((k) => !'JQK'.includes(k[2])).map((k) => [k, 0, 0, 0, 1]) },
  { id: 'checkered', name: 'Checkered (Spades & Hearts)', cards: () => allFronts().map((k) => [(k[0] === 'C' ? 'S' : k[0] === 'D' ? 'H' : k[0]) + k.slice(1), 0, 0, 0, 1]) },
  { id: 'faces_aces', name: 'Faces & Aces only (16)', cards: () => allFronts().filter((k) => 'JQKA'.includes(k[2])).map((k) => [k, 0, 0, 0, 1]) },
  { id: 'numbers', name: 'Numbers only (36)', cards: () => allFronts().filter((k) => !'JQKA'.includes(k[2])).map((k) => [k, 0, 0, 0, 1]) },
  { id: 'empty', name: 'Empty', cards: () => [] },
];
/** The standard 52 as an explicit card list (the editor shows / edits this). */
export const standardCards = () => allFronts().map((k) => [k, 0, 0, 0, 1]);

/** Built-in example decks (shown in every player's editor). */
export const EXAMPLE_DECKS = [
  {
    // The owner's own Deck Creator deck (Custom Decks/CustomDecks.txt, "Goth Deck", 10/26/2025):
    // vanilla numbers, the standard 52, three Eternal Negative Pokémon and four vouchers.
    id: 'goth', by: 'mgibbie',
    def: {
      v: 1, name: 'Goth Deck', desc: 'Custom Deck created at 10/26/2025 10:26 PM', back: 'b_red', mods: ['pokermon'],
      params: {}, cards: null,
      jokers: [
        { key: 'j_poke_gothitelle', edition: 'negative', eternal: true, n: 1 },
        { key: 'j_poke_xatu', edition: 'negative', eternal: true, n: 1 },
        { key: 'j_poke_arcanine', edition: 'negative', eternal: true, n: 1 },
      ],
      consumables: [], vouchers: ['v_planet_merchant', 'v_planet_tycoon', 'v_paint_brush', 'v_palette'], tags: [],
      bans: {}, rules: {},
    },
  },
];

// ------------------------------------------------------------ share codes
const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (str) => { const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
async function gz(bytes, mode) {
  const s = mode === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const w = s.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const r = s.readable.getReader(); const chunks = []; let len = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); len += value.length; if (len > LIMITS.json * 4) throw new Error('too big'); }
  const out = new Uint8Array(len); let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
/** A deck as a share code: 'MCD1.' + base64url(gzip(json)) (or 'MCDR1.' + raw when there is no CompressionStream). */
export async function encodeDeck(def) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateDeck(def)));
  if (typeof CompressionStream !== 'undefined') { try { return 'MCD1.' + b64url(await gz(bytes, 'gzip')); } catch (e) { /* fall through */ } }
  return 'MCDR1.' + b64url(bytes);
}
/** A share code back to a validated definition (null when it isn't one). */
export async function decodeDeck(code) {
  try {
    code = String(code || '').trim().replace(/\s+/g, '');
    if (code.length > LIMITS.json * 2) return null;
    let json;
    if (code.startsWith('MCD1.')) json = new TextDecoder().decode(await gz(unb64url(code.slice(5)), 'gunzip'));
    else if (code.startsWith('MCDR1.')) json = new TextDecoder().decode(unb64url(code.slice(6)));
    else return null;
    if (json.length > LIMITS.json) return null;
    const raw = JSON.parse(json);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? validateDeck(raw) : null;
  } catch (e) { return null; }
}

// ----------------------------------------------------------------- engine
const D = () => (G.GAME && G.GAME.custom_deck) || null;
const R = (key) => ruleOf(D(), key);
/** Deck Creator's `chance >= math.random(1, 100)`, on the run's seeded RNG. */
function roll(pct, key) {
  if (!(pct > 0)) return false;
  if (pct >= 100) return true;
  return pseudorandom(pseudoseed('cdeck_' + key)) * 100 < pct;
}
const pick = (list, key) => (list.length ? pseudorandom_element(list, pseudoseed('cdeck_' + key))[0] : undefined);
const active = (key) => !!(P_CENTERS[key] && centerActive(P_CENTERS[key]));
const isStone = (c) => c.ability.effect === 'Stone Card' && !c.vampired;
const editionless = () => G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
const toEdition = (ed, key) => {
  if (!ed) return null;
  if (ed === 'random') return poll_edition('cdeck_ed_' + key, null, false, true);
  if (BASE_EDITIONS.includes(ed)) return { [ed]: true };
  return P_CENTERS[ed] && P_CENTERS[ed].set === 'Edition' && centerActive(P_CENTERS[ed]) ? ed : null;
};
function rank_up(card) {
  const key = card.config.card && card.config.card.key;
  if (!key || !card.base.id) return;
  const prefix = key.slice(0, key.lastIndexOf('_') + 1);
  const id = card.base.id === 14 ? 2 : Math.min(card.base.id + 1, 14);
  const suffix = id < 10 ? String(id) : ({ 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[id];
  if (P_CARDS[prefix + suffix]) card.set_base(P_CARDS[prefix + suffix]);
}
/** CardUtils.receiveRandomNegativeJoker */
function negative_joker() {
  G.GAME.joker_buffer = (G.GAME.joker_buffer || 0) + 1;
  G.E_MANAGER.add_event(() => {
    const card = create_card('Joker', G.jokers, null, null, null, null, null, 'rif');
    card.set_edition({ negative: true }, true, true);
    card.add_to_deck();
    G.jokers.emplace(card);
    G.GAME.joker_buffer = 0;
  });
}
/** CardUtils.destroyRandomJoker (never an Eternal one). */
function destroy_joker() {
  const chosen = pick(G.jokers.cards.filter((v) => !v.ability.eternal), 'destroy_joker');
  if (chosen) G.E_MANAGER.add_event(() => { if (chosen.area === G.jokers) chosen.start_dissolve(); });
}
function most_played_planet() {
  let hand = null, tally = 0;
  for (const v of G.handlist) if (G.GAME.hands[v] && G.GAME.hands[v].visible && G.GAME.hands[v].played > tally) { hand = v; tally = G.GAME.hands[v].played; }
  if (!hand) return null;
  let planet = null;
  for (const v of P_CENTER_POOLS.Planet) if (v.config.hand_type === hand) planet = v.key;
  return planet;
}
const base_pack = (card) => {
  if (!card || card.config.center.mod || card.ability.set !== 'Booster') return null;
  const n = card.ability.name || '';
  return n.includes('Arcana') ? 'arcana' : n.includes('Celestial') ? 'celestial' : n.includes('Spectral') ? 'spectral' : n.includes('Standard') ? 'standard' : n.includes('Buffoon') ? 'buffoon' : null;
};

/** The definition's starting deck as protos {front, e, d, g} (before the dynamic mods). */
function deck_protos(def) {
  const out = [];
  if (!def.cards) {
    for (const k of allFronts()) out.push({ front: k });
    return out;
  }
  for (const [front, e, d, g, n] of def.cards) {
    if (!P_CARDS[front] || P_CARDS[front] === P_CARDS.empty) continue;
    for (let i = 0; i < n; i++) out.push({ front, e: e && active(e) && P_CENTERS[e].set === 'Enhanced' ? e : null, d: d || null, g: g && (SEALS.includes(g) || (P_SEALS[g] && centerActive(P_SEALS[g]))) ? g : null });
  }
  return out;
}
const DYNAMIC_KEYS = ['remove_faces', 'no_aces', 'no_numbered_cards', 'randomize_ranks', 'randomize_suits',
  ...['polychrome', 'holographic', 'foil', 'edition', 'bonus', 'glass', 'lucky', 'steel', 'stone', 'wild', 'mult', 'gold', 'enhancement'].map((k) => `random_${k}_cards`)];

/** CardUtils.initializeCustomCardList: rank/suit randomizing + filters, then random editions / enhancements. */
function apply_dynamic(protos) {
  const out = [];
  for (const p of protos) {
    const i = p.front.lastIndexOf('_');
    let s = p.front.slice(0, i), r = p.front.slice(i + 1);
    if (R('randomize_ranks')) r = pick(RANKS, 'rank');
    if (R('randomize_suits')) s = pick(SUITS, 'suit');
    if (R('remove_faces') && 'JQK'.includes(r)) continue;
    if (R('no_aces') && r === 'A') continue;
    if (R('no_numbered_cards') && '23456789T'.includes(r)) continue;
    const front = P_CARDS[s + '_' + r] ? s + '_' + r : p.front;
    out.push({ ...p, front });
  }
  const abilities = [
    ['polychrome', R('random_polychrome_cards'), true], ['holo', R('random_holographic_cards'), true], ['foil', R('random_foil_cards'), true],
    ['m_bonus', R('random_bonus_cards'), false], ['m_mult', R('random_mult_cards'), false], ['m_wild', R('random_wild_cards'), false],
    ['m_glass', R('random_glass_cards'), false], ['m_steel', R('random_steel_cards'), false], ['m_stone', R('random_stone_cards'), false],
    ['m_gold', R('random_gold_cards'), false], ['m_lucky', R('random_lucky_cards'), false],
    ['random_edition', R('random_edition_cards'), true, ['polychrome', 'holo', 'foil']],
    ['random_enhancement', R('random_enhancement_cards'), false, BASE_ENH],
  ].map(([name, n, isEdition, pool]) => ({ name, n, isEdition, pool }));
  // Deck Creator: pick a random ability that still has uses, give it to a random card that has no
  // edition (or no enhancement) yet; stop when that ability finds no card.
  for (let guard = 0; guard < 20000; guard++) {
    const avail = abilities.filter((a) => a.n > 0);
    if (!avail.length) break;
    const a = pick(avail, 'ability');
    const free = out.filter((c) => (a.isEdition ? !c.d : !c.e));
    if (!free.length) break;
    const c = pick(free, 'ability_card');
    const val = a.pool ? pick(a.pool, 'ability_pool') : a.name;
    if (a.isEdition) c.d = val; else c.e = val;
    a.n -= 1;
  }
  return out;
}

function rebuild_deck(def) {
  const dyn = DYNAMIC_KEYS.some((k) => R(k));
  if (!def.cards && !dyn) return; // the standard 52 the run already built
  let protos = deck_protos(def);
  if (dyn) protos = apply_dynamic(protos);
  // Like newRun: sorted by Balatro's proto key before the deck is shuffled.
  const pk = (a) => a.front + (a.e || '') + (a.d || '') + (a.g || '');
  protos.sort((a, b) => (pk(a) < pk(b) ? -1 : pk(a) > pk(b) ? 1 : 0));
  for (const c of G.playing_cards.slice()) { if (c.area) c.area.remove_card(c); }
  G.playing_cards.length = 0;
  G.playing_card = 0;
  for (const v of protos) {
    G.playing_card += 1;
    const c = new Card(P_CARDS[v.front], P_CENTERS[v.e || 'c_base'], { playing_card: G.playing_card });
    c.playing_card = G.playing_card;
    const ed = toEdition(v.d, 'deck');
    if (ed) c.set_edition(ed, true, true);
    if (v.g) c.set_seal(v.g, true);
    G.deck.emplace(c);
    G.playing_cards.push(c);
  }
  G.GAME.starting_deck_size = G.playing_cards.length;
  G.deck.config.card_limit = Math.max(52, G.playing_cards.length);
}

function start_items(def) {
  // vouchers first (Back:apply_to_run), Deck Creator's "1 random voucher" among them
  const vouchers = def.vouchers.filter((v) => active(v) && P_CENTERS[v].set === 'Voucher');
  if (R('one_random_voucher')) {
    const pool = P_CENTER_POOLS.Voucher.filter((v) => !vouchers.includes(v.key));
    const v = pick(pool, 'random_voucher');
    if (v) vouchers.push(v.key);
  }
  for (const v of vouchers) {
    if (G.GAME.used_vouchers[v]) continue;
    G.GAME.used_vouchers[v] = true;
    G.GAME.starting_voucher_count = (G.GAME.starting_voucher_count || 0) + 1;
    Card.apply_to_run(null, P_CENTERS[v]);
  }
  // jokers (a challenge's starting jokers: edition + stickers)
  for (const j of def.jokers) {
    if (!active(j.key) || P_CENTERS[j.key].set !== 'Joker') continue;
    for (let i = 0; i < j.n; i++) {
      const card = new Card(P_CARDS.empty, P_CENTERS[j.key], { discover: true });
      card.add_to_deck();
      const ed = toEdition(j.edition, 'joker');
      if (ed) card.set_edition(ed, true, true);
      if (j.eternal) card.set_eternal(true);
      if (j.perishable) card.set_perishable(true);
      if (j.rental) card.set_rental(true);
      if (j.pinned) card.pinned = true;
      G.jokers.emplace(card);
    }
  }
  for (let i = 0; i < R('random_starting_jokers'); i++) {
    const card = create_card('Joker', G.jokers, null, null, null, null, null, 'rif');
    card.add_to_deck();
    G.jokers.emplace(card);
  }
  for (const c of def.consumables) {
    if (!active(c.key) || !P_CENTERS[c.key].consumeable) continue;
    for (let i = 0; i < c.n; i++) {
      const card = add_joker(c.key, null, true);
      const ed = toEdition(c.edition, 'consumable');
      if (ed) card.set_edition(ed, true, true);
    }
  }
  for (const t of def.tags) {
    if (!P_TAGS[t.key] || !centerActive(P_TAGS[t.key])) continue;
    for (let i = 0; i < t.n; i++) add_tag(new Tag(t.key));
  }
  const extra = R('randomize_money_configurable');
  if (extra > 0) {
    const m = Math.floor(pseudorandom(pseudoseed('cdeck_money')) * (extra + 1));
    G.GAME.dollars += m;
  }
}

/** Bans -> G.GAME.banned_keys, never banning every boss / showdown boss / booster (the run needs one). */
function apply_bans(GAME, def) {
  const b = def.bans;
  for (const k of [...b.jokers, ...b.consumables, ...b.vouchers, ...b.tags]) GAME.banned_keys[k] = true;
  const bosses = Object.values(P_BLINDS).filter((v) => v.boss && centerActive(v));
  const left = (f) => bosses.some((v) => f(v) && !b.blinds.includes(v.key));
  if (left((v) => !v.boss.showdown && (v.boss.min || 1) <= 1) && left((v) => v.boss.showdown)) for (const k of b.blinds) GAME.banned_keys[k] = true;
  const packs = P_CENTER_POOLS.Booster || [];
  if (packs.some((v) => !b.boosters.includes(v.key))) for (const k of b.boosters) GAME.banned_keys[k] = true;
}

let leveling = false; // (extra_hand_level_upgrades: the re-entrant level_up_hand call levels normally)
const hooks = {
  init_game_object(GAME) {
    const def = GAME.custom_deck;
    if (!def) return;
    const p = def.params, sp = GAME.starting_params;
    sp.dollars = p.dollars; sp.hands = p.hands; sp.discards = p.discards; sp.hand_size = p.hand_size;
    sp.joker_slots = p.joker_slots; sp.consumable_slots = p.consumable_slots; sp.reroll_cost = p.reroll_cost;
    sp.ante_scaling = p.ante_scaling;
    GAME.base_reroll_cost = p.reroll_cost;
    GAME.interest_amount = p.interest_amount;
    GAME.interest_cap = 5 * p.interest_cap;
    GAME.discount_percent = p.discount_percent;
    if (p.money_per_hand === 0) GAME.modifiers.no_extra_hand_money = true; else GAME.modifiers.money_per_hand = p.money_per_hand;
    if (p.money_per_discard) GAME.modifiers.money_per_discard = p.money_per_discard;
    if (p.discard_cost) GAME.modifiers.discard_cost = p.discard_cost;
    GAME.win_ante = p.win_ante;
    GAME.joker_rate = p.joker_rate; GAME.tarot_rate = p.tarot_rate; GAME.planet_rate = p.planet_rate;
    GAME.spectral_rate = p.spectral_rate; GAME.playing_card_rate = p.playing_card_rate;
    const r = (k) => ruleOf(def, k);
    GAME.shop.joker_max = r('shop_slots');
    GAME.edition_rate = r('edition_rate');
    if (r('voucher_slots') > 1) GAME.modifiers.extra_vouchers = r('voucher_slots') - 1;
    if (r('inflation')) GAME.modifiers.inflation = true;
    if (r('chips_dollar_cap')) GAME.modifiers.chips_dollar_cap = true;
    if (r('all_eternal')) GAME.modifiers.all_eternal = true;
    if (r('debuff_played_cards')) GAME.modifiers.debuff_played_cards = true;
    if (r('flipped_cards') > 0) GAME.modifiers.flipped_cards = r('flipped_cards');
    if (r('minus_hand_size_per_X_dollar')) GAME.modifiers.minus_hand_size_per_X_dollar = 5;
    if (r('enable_eternals_in_shop')) GAME.modifiers.enable_eternals_in_shop = true;
    if (r('enable_perishables_in_shop')) GAME.modifiers.enable_perishables_in_shop = true;
    if (r('enable_rentals_in_shop')) GAME.modifiers.enable_rentals_in_shop = true;
    if (r('negative_fifty_dollars_allowed')) GAME.bankrupt_at = -50;
    apply_bans(GAME, def);
  },
  start_run() {
    const def = D();
    if (!def) return;
    // Deck Creator: with every appearance rate at 0 one of Joker/Tarot/Planet/Spectral becomes 100.
    const g = G.GAME;
    if (!g.joker_rate && !g.tarot_rate && !g.planet_rate && !g.spectral_rate && !g.playing_card_rate) g[pick(['joker_rate', 'tarot_rate', 'planet_rate', 'spectral_rate'], 'rates')] = 100;
    rebuild_deck(def);
    start_items(def);
    const mul = R('multiply_probabilities'), div = R('divide_probabilities');
    for (const k of Object.keys(g.probabilities)) g.probabilities[k] = g.probabilities[k] * mul / div;
    hooks.update();
  },
  // ---- Gameplay
  is_face(card) {
    const id = card.get_id();
    if ((id === 14 && R('aces_are_faces')) || (id === 7 && R('sevens_are_faces')) || (R('stones_are_faces') && isStone(card))) return true;
    return undefined;
  },
  update() {
    // Balatro's minus_hand_size_per_X_dollar (Game:update): -1 hand size per $X held.
    const x = G.GAME.modifiers.minus_hand_size_per_X_dollar;
    if (!x || !G.hand) return;
    const want = -Math.floor(Math.max(0, B.toNumber(G.GAME.dollars)) / x);
    const had = G.GAME.cdeck_hspxd || 0;
    if (want !== had) { G.hand.change_size(want - had); G.GAME.cdeck_hspxd = want; }
  },
  use_consumeable(card, area, copier) {
    if (card.config.center.mod) return undefined;
    const n = card.ability.name, used = copier || card;
    if (n === 'Death' && R('death_targets_random_card')) {
      // the rightmost selected card copies onto a random OTHER card in hand (not the two selected)
      const hl = G.hand.highlighted.slice();
      const idx = (c) => G.hand.cards.indexOf(c);
      let left = hl[0], right = hl[0];
      for (const c of hl) { if (idx(c) < idx(left)) left = c; else if (idx(c) > idx(right)) right = c; }
      const target = pick(G.hand.cards.filter((c) => c !== left && c !== right), 'death');
      if (target) G.E_MANAGER.add_event(() => copy_card(right, target));
      G.E_MANAGER.add_event(() => G.hand.unhighlight_all());
      return true;
    }
    if ((n === 'Ankh' || n === 'Hex') && R('spectral_cards_cannot_destroy_jokers')) {
      if (n === 'Ankh') {
        const [chosen] = pseudorandom_element(G.jokers.cards, pseudoseed('ankh_choice'));
        if (chosen) G.E_MANAGER.add_event(() => {
          const c = copy_card(chosen, undefined, undefined, undefined, chosen.edition && chosen.edition.negative);
          c.add_to_deck();
          if (c.edition && c.edition.negative) c.set_edition(null, true);
          G.jokers.emplace(c);
        });
      } else {
        const pool = editionless();
        G.E_MANAGER.add_event(() => { const [c] = pseudorandom_element(pool, pseudoseed('hex')); if (c) c.set_edition({ polychrome: true }, true); });
      }
      return true;
    }
    if (n === 'Ectoplasm' && R('ectoplasm_cannot_change_hand_size')) {
      const pool = editionless();
      G.E_MANAGER.add_event(() => { const [c] = pseudorandom_element(pool, pseudoseed('ectoplasm')); if (c) c.set_edition({ negative: true }, true); });
      return true;
    }
    if (n === 'Ouija' && R('ouija_cannot_change_hand_size')) {
      const [rank] = pseudorandom_element(RANKS, pseudoseed('ouija'));
      for (let i = 0; i < G.hand.cards.length; i++) {
        G.E_MANAGER.add_event(() => { const c = G.hand.cards[i]; if (c && P_CARDS[c.base.suit[0] + '_' + rank]) c.set_base(P_CARDS[c.base.suit[0] + '_' + rank]); });
      }
      return true;
    }
    if (n === 'Wraith' && R('wraith_cannot_set_money_to_zero')) {
      G.E_MANAGER.add_event(() => {
        const c = create_card('Joker', G.jokers, null, 0.99, null, null, null, 'wra');
        c.add_to_deck();
        G.jokers.emplace(c);
      });
      return true;
    }
    if (['Familiar', 'Grim', 'Incantation', 'Immolate'].includes(n) && R('no_spectral_destroy_cards')) {
      if (n === 'Immolate') { ease_dollars(card.ability.extra.dollars); return true; }
      G.E_MANAGER.add_event(() => {
        const cards = [];
        const cen_pool = P_CENTER_POOLS.Enhanced.filter((v) => v.key !== 'm_stone');
        for (let i = 1; i <= card.ability.extra; i++) {
          let s, r;
          if (n === 'Familiar') { [r] = pseudorandom_element(['J', 'Q', 'K'], pseudoseed('familiar_create')); [s] = pseudorandom_element(SUITS, pseudoseed('familiar_create')); }
          else if (n === 'Grim') { r = 'A'; [s] = pseudorandom_element(SUITS, pseudoseed('grim_create')); }
          else { [r] = pseudorandom_element(RANKS.slice(0, 9), pseudoseed('incantation_create')); [s] = pseudorandom_element(SUITS, pseudoseed('incantation_create')); }
          cards.push(create_playing_card({ front: P_CARDS[(s || 'S') + '_' + (r || 'A')], center: pseudorandom_element(cen_pool, pseudoseed('spe_card'))[0] }, G.hand));
        }
        for (const j of G.jokers.cards.slice()) j.calculate_joker({ playing_card_added: true, cards });
      });
      return true;
    }
    if (['Talisman', 'Deja Vu', 'Trance', 'Medium'].includes(n) && R('spectral_seals_add_additional')) {
      const conv = G.hand.highlighted[0];
      const extra = pick(G.hand.cards.filter((c) => c !== conv && !c.seal), 'seal_extra');
      G.E_MANAGER.add_event(() => { if (conv) conv.set_seal(card.ability.extra, undefined, true); });
      G.E_MANAGER.add_event(() => G.hand.unhighlight_all());
      if (extra) G.E_MANAGER.add_event(() => extra.set_seal(card.ability.extra, undefined, true));
      return true;
    }
    return undefined;
  },
  modify_scoring(pair, step) {
    if (step !== 'final_scoring_step') return pair;
    let [chips, mult] = pair;
    const cr = R('chip_reduction_percent'), mr = R('mult_reduction_percent');
    if (cr > 0) chips = B.mul(chips, (100 - cr) / 100);
    if (mr > 0) mult = B.mul(mult, (100 - mr) / 100);
    if ((cr > 0 || mr > 0)) emit('hand_text', { chips, mult });
    if (roll(R('balance_percent'), 'balance')) {
      const tot = B.add(chips, mult);
      chips = B.floor(B.div(tot, 2)); mult = B.floor(B.div(tot, 2));
      emit('hand_text', { chips, mult, balanced: true });
      G.E_MANAGER.add_event(() => { play_sound('gong', 0.94, 0.3); emit('balanced', { chips, mult }); });
    }
    return [chips, mult];
  },
  draw_hand_space(n) {
    const want = R('draw_to_hand_size');
    if (!want) return n;
    const S = G.STATES;
    if ([S.TAROT_PACK, S.SPECTRAL_PACK, S.PLANET_PACK, S.STANDARD_PACK, S.BUFFOON_PACK, S.MOD_PACK, S.MOD_PACK_HAND].includes(G.STATE)) return n;
    if (!(G.GAME.current_round.hands_played > 0 || G.GAME.current_round.discards_used > 0)) return n;
    return Math.min(G.deck.cards.length, want);
  },
  drawn_to_hand(card) {
    if (roll(R('chance_to_increase_drawn_cards_rank'), 'draw_rank')) G.E_MANAGER.add_event(() => rank_up(card));
  },
  discard_card(card) {
    if (roll(R('chance_to_increase_discard_cards_rank'), 'discard_rank')) G.E_MANAGER.add_event(() => { if (!card.removed) rank_up(card); });
  },
  level_up_hand(card, hand, amount) {
    const extra = R('extra_hand_level_upgrades');
    if (!(extra > 0) || !(amount >= 0) || leveling) return undefined;
    leveling = true;
    try { level_up_hand(card, hand, false, amount + extra); } finally { leveling = false; }
    return false;
  },
  blind_amount(amount) {
    const s = D() && D().params.blind_scaling;
    return s && s !== 1 ? B.floor(B.mul(amount, s)) : amount;
  },
  end_round() {
    const def = D();
    if (!def || !G.jokers.cards.length) return;
    if (G.GAME.blind && G.GAME.blind.get_type() === 'Boss' && G.GAME.round_resets.ante === 4 && roll(R('destroy_random_joker_after_ante_four'), 'ante4')) destroy_joker();
    const up = R('random_sell_value_increase'), down = R('random_sell_value_decrease');
    if (up > 0) {
      const j = pick(G.jokers.cards, 'sell_up');
      G.E_MANAGER.add_event(() => { if (j && j.area) { j.ability.extra_value = (j.ability.extra_value || 0) + up; j.set_cost(); } });
    }
    if (down > 0) {
      const withValue = G.jokers.cards.filter((v) => (v.ability.extra_value || 0) > 0);
      const j = pick(withValue.length ? withValue : G.jokers.cards, 'sell_down');
      G.E_MANAGER.add_event(() => { if (j && j.area) { j.ability.extra_value = Math.max(0, (j.ability.extra_value || 0) - down); j.set_cost(); } });
    }
  },
  // ---- Money
  set_cost(card) {
    if (!D()) return;
    const set = card.ability.set;
    if ((set === 'Joker' && R('full_price_jokers')) || ((set === 'Planet' || set === 'Tarot' || set === 'Spectral') && R('full_price_consumables'))) {
      card.sell_cost = Math.max(1, Math.floor(card.cost)) + (card.ability.extra_value || 0);
    }
    const bs = R('booster_ante_scaling');
    if (set === 'Booster' && bs > 0 && !(card.ability.couponed && card.cost === 0)) card.cost += (G.GAME.round_resets.ante - 1) * bs;
    if (card.cdeck_free && card.area === G.shop_vouchers) card.cost = 0;
  },
  evaluate_round() {
    const def = D();
    if (!def) return undefined;
    G.GAME.cdeck_cleared = G.GAME.blind && G.GAME.blind.get_type ? G.GAME.blind.get_type() : null;
    // Boss Win Tags (Deck Creator's Back:trigger_effect 'eval' after a boss)
    if (G.GAME.blind && G.GAME.blind.boss) {
      for (const [k, tag] of BOSS_TAGS) {
        if (P_TAGS[tag] && roll(R(k), 'bosstag_' + tag)) G.E_MANAGER.add_event(() => { add_tag(new Tag(tag)); play_sound('generic1', 0.9, 0.8); });
      }
    }
    const rows = [];
    const ed = R('enhanced_dollars_per_round');
    if (ed) {
      const n = G.playing_cards.filter((v) => v.config.center !== P_CENTERS.c_base).length;
      if (n) rows.push({ name: `Enhanced cards ×${n}`, dollars: n * ed, bonus: true, custom_deck: true });
    }
    const nj = R('negative_joker_money');
    if (nj) {
      const n = G.jokers.cards.filter((v) => v.edition && v.edition.negative).length;
      if (n) rows.push({ name: `Negative Jokers ×${n}`, dollars: n * nj, bonus: true, custom_deck: true });
    }
    return rows.length ? rows : undefined;
  },
  skip_booster() {
    const v = R('gain_dollars_when_skip_booster');
    if (v) ease_dollars(v);
  },
  // ---- Shop
  pool_duplicates() { return R('allow_duplicate_jokers') ? true : undefined; },
  pool_hidden(v) { return (v.name === 'The Soul' && R('allow_soul')) || (v.name === 'Black Hole' && R('allow_black_hole')) ? true : undefined; },
  create_card_rarity(_rarity, _type) {
    if (_type !== 'Joker' || _rarity != null || !R('allow_legendary_jokers_everywhere')) return _rarity;
    const r = pseudorandom('rarity' + G.GAME.round_resets.ante + 'cdeck');
    // (a float rarity is read as a roll by get_current_pool; '4' picks the Legendary pool)
    return r > 0.97 ? '4' : r > 0.92 ? 0.96 : r > 0.69 ? 0.8 : 0.1;
  },
  create_card(card, _type, area) {
    if (_type !== 'Joker' || !(area === G.shop_jokers || area === G.pack_cards)) return;
    const er = R('eternal_rate'), pr = R('perishable_rate'), rr = R('rental_rate');
    if (er === 30 && pr === 30 && rr === 30) return;
    // Deck Creator's own sticker polls replace the vanilla 30% ones
    card.ability.eternal = undefined; card.ability.perishable = undefined; card.ability.perish_tally = undefined;
    if (card.ability.rental) card.set_rental(false);
    if (G.GAME.modifiers.all_eternal) card.set_eternal(true);
    const ante = G.GAME.round_resets.ante;
    let eternal = false;
    if (G.GAME.modifiers.enable_eternals_in_shop && 100 * pseudorandom('cdeck_et' + ante) <= er) { card.set_eternal(true); eternal = true; }
    if (!eternal && G.GAME.modifiers.enable_perishables_in_shop && 100 * pseudorandom('cdeck_pe' + ante) <= pr) card.set_perishable(true);
    if (G.GAME.modifiers.enable_rentals_in_shop && 100 * pseudorandom('cdeck_re' + ante) <= rr) card.set_rental(true);
  },
  booster_limit(n) { const s = R('booster_pack_slots'); return s === 2 ? n : Math.max(0, n - 2 + s); },
  voucher_add(phase) {
    if (phase !== 'before_tags' || R('voucher_slots') !== 0) return;
    for (const c of G.shop_vouchers.cards.slice()) if (c.shop_voucher && !c.extra_voucher) c.remove();
  },
  shop_stocked() {
    if (!D()) return;
    const free = (c) => { if (!c) return; c.ability.couponed = true; c.set_cost(); };
    if (R('one_free_card_in_shop')) free(pick(G.shop_jokers.cards, 'free_card'));
    let item = null;
    if (R('one_free_item_in_shop')) item = pick(['card', 'booster', 'voucher'], 'free_item');
    if (item === 'card') free(pick(G.shop_jokers.cards.filter((c) => !c.ability.couponed), 'free_item_card'));
    if (R('one_free_booster_in_shop') || item === 'booster') free(G.shop_booster.cards[0]);
    if (R('voucher_is_free') || item === 'voucher') {
      const v = G.shop_vouchers.cards.find((c) => c.shop_voucher && !c.extra_voucher) || G.shop_vouchers.cards[0];
      if (v) { v.ability.couponed = true; v.cdeck_free = true; v.set_cost(); }
    }
  },
  reroll_shop() {
    if (!R('reroll_boosters')) return;
    G.E_MANAGER.add_event(() => {
      for (const c of G.shop_booster.cards.slice()) c.remove();
      const slots = R('booster_pack_slots') + (G.GAME.modifiers.extra_boosters || 0);
      G.GAME.current_round.used_packs = {};
      for (let i = 1; i <= slots; i++) {
        const pack = get_pack('shop_pack');
        if (!pack) break;
        G.GAME.current_round.used_packs[i] = pack.key;
        const card = new Card(P_CARDS.empty, pack);
        card.ability.booster_pos = i;
        G.shop_booster.emplace(card);
      }
    });
  },
  // ---- Booster packs
  booster_free(card) { return roll(R('chance_for_free_booster'), 'free_booster') ? true : undefined; },
  pack_size(n, card) {
    const k = base_pack(card);
    return k ? n + R(`extra_${k}_pack_cards`) : n;
  },
  pack_choices(n, card) {
    const x = R('extra_booster_pack_choices');
    if (!x || !base_pack(card)) return n;
    return Math.min(n + x, G.GAME.pack_size);
  },
  pack_card(booster, i) {
    const k = base_pack(booster);
    if (!k) return undefined;
    const ante = G.GAME.round_resets.ante;
    const omen = () => pseudorandom('omen_globe') > 0.8;
    if (k === 'arcana' && (R('spectral_cards_in_arcana') || R('planet_cards_in_arcana'))) {
      if ((G.GAME.used_vouchers.v_omen_globe || R('spectral_cards_in_arcana')) && omen()) return create_card('Spectral', G.pack_cards, null, null, true, true, null, 'ar2');
      if (R('planet_cards_in_arcana') && omen()) return create_card('Planet', G.pack_cards, null, null, true, true, null, 'pl1');
      return create_card('Tarot', G.pack_cards, null, null, true, true, null, 'ar1');
    }
    if (k === 'celestial' && (R('always_telescoping') || R('never_telescoping') || R('tarot_cards_in_celestial') || R('spectral_cards_in_celestial'))) {
      const mixed = () => {
        if (R('tarot_cards_in_celestial') && omen()) return create_card('Tarot', G.pack_cards, null, null, true, true, null, 'ar1');
        if (R('spectral_cards_in_celestial') && omen()) return create_card('Spectral', G.pack_cards, null, null, true, true, null, 'ar2');
        return create_card('Planet', G.pack_cards, null, null, true, true, null, 'pl1');
      };
      if ((G.GAME.used_vouchers.v_telescope || R('always_telescoping')) && i === 1) return create_card('Planet', G.pack_cards, null, null, true, true, most_played_planet(), 'pl1');
      if (R('never_telescoping')) {
        let best = 0; const most = new Set();
        for (const h of G.handlist) { const p = G.GAME.hands[h].played; if (p > best) { best = p; most.clear(); } if (p > 0 && p === best) most.add(h); }
        let card;
        for (let t = 0; t < 30; t++) {
          card = mixed();
          const ht = card.config.center.config && card.config.center.config.hand_type;
          if (card.ability.set !== 'Planet' || !ht || !most.has(ht)) break;
          if (t < 29) card.remove();
        }
        return card;
      }
      return mixed();
    }
    if (k === 'spectral' && (R('tarot_cards_in_spectral') || R('planet_cards_in_spectral'))) {
      if (R('tarot_cards_in_spectral') && omen()) return create_card('Tarot', G.pack_cards, null, null, true, true, null, 'ar1');
      if (R('planet_cards_in_spectral') && omen()) return create_card('Planet', G.pack_cards, null, null, true, true, null, 'pl1');
      return create_card('Spectral', G.pack_cards, null, null, true, true, null, 'spe');
    }
    const er = R('standard_pack_enhancement_rate'), dr = R('standard_pack_edition_rate'), sr = R('standard_pack_seal_rate');
    if (k === 'standard' && (er !== 40 || dr !== 2 || sr !== 20)) {
      const card = create_card(er / 100 >= pseudorandom(pseudoseed('stdset' + ante)) ? 'Enhanced' : 'Base', G.pack_cards, null, null, null, true, null, 'sta');
      if (dr > 0) card.set_edition(poll_edition('standard_edition' + ante, dr, true)); // (Lua: a 0 rate is 0, not "1")
      if (sr / 100 >= pseudorandom(pseudoseed('stdseal' + ante))) {
        const t = pseudorandom(pseudoseed('stdsealtype' + ante));
        card.set_seal(t > 0.75 ? 'Red' : t > 0.5 ? 'Blue' : t > 0.25 ? 'Gold' : 'Purple');
      }
      return card;
    }
    return undefined;
  },
  // ---- Blind
  blind_on_deck(slot) {
    if (slot !== 'Small' && slot !== 'Big') return;
    const key = G.GAME.round_resets.ante + slot;
    const memo = G.GAME.cdeck_skip = G.GAME.cdeck_skip || {};
    if (memo[key] !== undefined) return;
    let off = false;
    if (slot === 'Big' && R('skip_blind_disabled_chance_big_blind') > 0) off = roll(R('skip_blind_disabled_chance_big_blind'), 'noskip_big');
    else if (slot === 'Small' && R('skip_blind_disabled_chance_small_blind') > 0) off = roll(R('skip_blind_disabled_chance_small_blind'), 'noskip_small');
    if (!off && R('skip_blind_disabled_chance_any') > 0) off = roll(R('skip_blind_disabled_chance_any'), 'noskip_any');
    memo[key] = off;
    if (!off) return;
    emit('skip_disabled', { slot });
    if (roll(R('chance_for_five_dollars_on_skip_disable'), 'noskip_5')) ease_dollars(5);
    if (roll(R('chance_for_fifteen_dollars_on_skip_disable'), 'noskip_15')) ease_dollars(15);
    if (roll(R('chance_for_negative_joker_on_skip_disable'), 'noskip_neg')) negative_joker();
  },
  // skipping the Small Blind puts the Big one on deck without a new blind select
  skip_blind(phase) { if (phase === 'after') hooks.blind_on_deck(G.GAME.blind_on_deck); },
  can_skip_blind() {
    const memo = G.GAME.cdeck_skip;
    return memo && memo[G.GAME.round_resets.ante + G.GAME.blind_on_deck] ? false : undefined;
  },
  skip_shop() {
    if (!D()) return undefined;
    const t = G.GAME.cdeck_cleared;
    let skip = false;
    if (t === 'Boss' && R('skip_shop_chance_boss') > 0) skip = roll(R('skip_shop_chance_boss'), 'skipshop_boss');
    else if (t === 'Big' && R('skip_shop_chance_big_blind') > 0) skip = roll(R('skip_shop_chance_big_blind'), 'skipshop_big');
    else if (t === 'Small' && R('skip_shop_chance_small_blind') > 0) skip = roll(R('skip_shop_chance_small_blind'), 'skipshop_small');
    if (!skip && R('skip_shop_chance_any') > 0) skip = roll(R('skip_shop_chance_any'), 'skipshop_any');
    if (!skip) return undefined;
    emit('shop_skipped', {});
    if (roll(R('chance_for_random_negative_joker_on_shop_skip'), 'skipshop_neg')) negative_joker();
    if (roll(R('chance_for_twenty_dollars_on_shop_skip'), 'skipshop_20')) ease_dollars(20);
    return true;
  },
  // ---- Seals
  calculate_seal(card, context) {
    if (context.repetition && card.seal === 'Red') {
      const silly = R('red_seal_silly_messages'), extra = R('extra_red_seal_repetitions'), dis = R('chance_to_disable_red_seal_retriggers');
      if (!silly && !extra && !dis) return undefined;
      const message = silly ? pick(RED_SEAL_MESSAGES, 'red_msg') : localize('k_again_ex');
      const reps = roll(dis, 'red_off') ? 0 : 1 + extra;
      return { message, repetitions: reps, card };
    }
    if (context.discard && card.seal === 'Purple') {
      const two = R('chance_for_two_purple_tarots'), spec = R('chance_purple_seal_rolls_spectral'), sw = R('purple_seal_switch_trigger');
      if (!two && !spec && !sw) return undefined;
      let amount = 1, extra = 0;
      if (roll(two, 'purple_two')) { amount = 2; extra = 1; }
      if (G.consumeables.cards.length + G.GAME.consumeable_buffer + extra < G.consumeables.config.card_limit) {
        G.GAME.consumeable_buffer += amount;
        const kinds = [];
        for (let i = 0; i < amount; i++) kinds.push(roll(spec, 'purple_spectral') ? 'Spectral' : 'Tarot');
        G.E_MANAGER.add_event(() => {
          for (const k of kinds) {
            const c = k === 'Spectral' ? create_card('Spectral', G.consumeables, null, null, true, true, null, 'ar2') : create_card('Tarot', G.consumeables, null, null, null, null, null, '8ba');
            c.add_to_deck();
            G.consumeables.emplace(c);
          }
          G.GAME.consumeable_buffer = 0;
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_tarot') });
        if (sw) {
          const t = pseudorandom(pseudoseed('stdsealtype' + G.GAME.round_resets.ante));
          card.set_seal(t > 0.66 ? 'Red' : t > 0.33 ? 'Gold' : 'Blue');
        }
      }
      return null;
    }
    return undefined;
  },
  blue_seal(card) {
    const forced = R('blue_seal_always_most_played') ? most_played_planet() : null;
    if (R('blue_seal_switch_trigger')) {
      const t = pseudorandom(pseudoseed('stdsealtype' + G.GAME.round_resets.ante));
      card.set_seal(t > 0.66 ? 'Red' : t > 0.33 ? 'Gold' : 'Purple');
    }
    if (roll(R('chance_for_negative_joker_on_blue_seal_trigger'), 'blue_neg')) negative_joker();
    return forced || undefined;
  },
  p_dollars(ret, card) {
    if (card.debuff || card.ability.set === 'Joker') return ret;
    let add = 0;
    if (card.seal === 'Gold' && roll(R('chance_to_double_gold_seal'), 'gold_seal')) add += 3;
    const lucky7 = card.get_id() === 7 && R('make_sevens_lucky'), luckyS = isStone(card) && R('make_stones_lucky');
    if (card.ability.effect !== 'Lucky Card' && (lucky7 || luckyS) && roll(lucky7 || luckyS, 'lucky_money_as')) {
      if (probability_roll(card, 'lucky_money', 1, 15)) { card.lucky_trigger = true; add += 20; }
    }
    if (!add) return ret;
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + add;
    G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
    return ret + add;
  },
  chip_mult(ret, card) {
    if (card.debuff || card.ability.set === 'Joker') return ret;
    const lucky7 = card.get_id() === 7 && R('make_sevens_lucky'), luckyS = isStone(card) && R('make_stones_lucky');
    if (card.ability.effect !== 'Lucky Card' && (lucky7 || luckyS) && roll(lucky7 || luckyS, 'lucky_mult_as')) {
      if (probability_roll(card, 'lucky_mult', 1, 5)) { card.lucky_trigger = true; return ret + 20; }
      return ret;
    }
    if (card.ability.effect === 'Mult Card') {
      if (roll(R('triple_mult_cards_chance'), 'mult_triple')) return ret + 2 * card.ability.mult;
      if (roll(R('disable_mult_cards_chance'), 'mult_off')) return ret - card.ability.mult;
    }
    return ret;
  },
  end_of_round_effect(card, ret) {
    if (card.ability.name !== 'Gold Card' || !ret.h_dollars) return;
    const base = card.ability.h_dollars;
    let tripled = false;
    if (roll(R('chance_to_triple_gold_money'), 'gold_triple')) { ret.h_dollars += 2 * base; tripled = true; }
    if (roll(R('chance_to_disable_gold_money'), 'gold_off')) ret.h_dollars -= tripled ? 3 * base : base;
    if (ret.h_dollars <= 0) delete ret.h_dollars;
  },
  // ---- Glass break
  shatter(card) {
    if (!D() || card.ability.name !== 'Glass Card') return undefined;
    let total = R('broken_glass_money');
    if (roll(R('gain_ten_dollars_glass_break_chance'), 'glass_10')) total += 10;
    if (total) ease_dollars(total, true);
    if (roll(R('destroy_joker_on_broken_glass'), 'glass_destroy')) destroy_joker();
    if (roll(R('negative_joker_for_broken_glass'), 'glass_neg')) negative_joker();
    if (roll(R('replace_broken_glass_with_random_cards_chance'), 'glass_random')) {
      const front = P_CARDS[pick(SUITS, 'glass_suit') + '_' + pick(RANKS, 'glass_rank')];
      const enh = roll(20, 'glass_enh') ? pick(BASE_ENH, 'glass_enh_k') : 'c_base';
      const ed = roll(10, 'glass_ed') ? pick(['foil', 'holo', 'polychrome'], 'glass_ed_k') : null;
      const seal = roll(30, 'glass_seal') ? pick(SEALS, 'glass_seal_k') : null;
      G.E_MANAGER.add_event(() => {
        const c = create_playing_card({ front, center: P_CENTERS[enh] }, G.deck);
        if (ed) c.set_edition({ [ed]: true }, true, true);
        if (seal) c.set_seal(seal, true);
        G.deck.config.card_limit += 1;
      });
    }
    if (roll(R('replace_broken_glass_with_stones_chance'), 'glass_stone')) {
      G.E_MANAGER.add_event(() => {
        const [front] = pseudorandom_element(P_CARDS_LIST(), pseudoseed('marb_fr'));
        create_playing_card({ front, center: P_CENTERS.m_stone }, G.deck);
        G.deck.config.card_limit += 1;
      });
    }
    return undefined;
  },
  // ---- view
  view(view) {
    const def = D();
    if (!def) return;
    view.custom_deck = { name: def.name, desc: def.desc, back: def.back };
    view.back = def.back;
  },
};

registerMod({
  id: CUSTOM_DECK_ID,
  name: 'Custom deck',
  hidden: true, // engine-internal: never listed, never in G.GAME.mods
  hooks,
});
