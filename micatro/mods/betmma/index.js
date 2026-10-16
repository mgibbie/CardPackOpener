/**
 * BETMMA (Betmma's mods for Balatro, Steamodded 1.0 with an IN_SMOD1 shim), rebuilt natively for Micatro.
 * Sources (C:/Users/guide/Desktop/mods off/BETMMA-main):
 *   Betmma_Vouchers/       v3.0.2.3 — 58 vouchers + 24 fusion vouchers, voucher rarity, the Phantom and
 *                          Tentacle editions (phantom.lua, shaders/*.fs), lovely/lovely.toml + shader.toml
 *   Betmma_Voucher_Pack/   3 voucher packs (normal / uncommon / fusion)
 *   Betmma_Jokers/         11 jokers
 *   5_legendary_challenges/ 5 challenges (data only: CHALLENGES below; the challenge screen is a later phase)
 * Not ported as code: Better_Vouchers_This_Run_UI (Micatro's Run Info voucher list scrolls instead),
 * Cryptid.lua (optional Cryptid compat), jokerdisplay_integration.lua, and lovely/ability.toml +
 * lovely/spell.toml — orphans patching Betmma Abilities / Betmma Spells, which aren't in the bundle.
 * Balatro Mobile's "ability area" mode belongs to Betmma Abilities too, so it isn't there either.
 *
 * Keys are prefixed `betmma` (v_betmma_slate, j_betmma_jimbow, p_betmma_voucher_pack, e_betmma_phantom).
 * Options mirror the mod's config (BetmmaVouchers.jkr defaults): vouchers / voucher packs / jokers on,
 * voucher rarity on, and a toggle per voucher.
 *
 * The Lua wraps become hooks (micatro/js/mods/registry.js HOOKS); see vouchers.js / jokers.js /
 * editions.js / real_random.js for the wrap each function replaces.
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/betmma_test.mjs, failing with the fix reverted):
 *  1. Reincarnate: phantom.lua's Card:sell_card wrap never checked for the voucher, so selling ANY Phantom
 *     joker made a new joker; only with Reincarnate now (editions.js).
 *  2. Overkill's `rarity=2` sat beside its config (where get_rarity never looks), so it was common; it's
 *     uncommon (vouchers.js).
 *  3. The voucher rarity switch (enable_voucher_rarity) only turned the fusion weights off; it now turns the
 *     rarity roll off too (vouchers.js voucher_pool_filter).
 *  4. Real Random zeroed the Lucky Card's own Mult but forgot its 1 in 15 $20 (and the hidden rolls still
 *     counted as lucky triggers): the card's own effects are fully replaced (real_random.js).
 *  5. Real Random's "random Negative Joker" ability created times² jokers when it fired `times` times
 *     (nested loop); `times` jokers now (real_random.js).
 *  6. Scrawl / Reincarnate could push joker_buffer negative for the rest of the run when the joker row was
 *     over-full (min(1, slots left) < 0), breaking later "must have room" checks; clamped at 0.
 *  Engine fix (task): buying an EXTRA shop voucher (SMODS voucher slots) cleared the round's main voucher —
 *  Card:redeem nulled current_round.voucher for every voucher (consumables.js).
 */
import { registerMod, isActive, opt, reduceHook } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, Card, localize, emit as G_emit, copy_table as JSON_copy, get_next_voucher_key as G_next_voucher_key,
  ease_dollars as G_ease_dollars, card_eval_status_text,
} from '../../js/engine/core.js';
import { STATES, check_for_buy_space } from '../../js/engine/run.js';
import { MOD_ID, ART, ATLAS, VK, used, o, dict, get_rarity, is_fusion } from './common.js';
import { layout, VOUCHERS as LAYOUT_V } from './layout.js';
import * as V from './vouchers.js';
import * as J from './jokers.js';
import * as E from './editions.js';
import * as RR from './real_random.js';
import { LOC_VOUCHERS, LOC_JOKERS, LOC_REAL_RANDOM, LOC_PERISHABLE_NO_DEBUFF, LOC_DICTIONARY } from './loc.js';

const L = layout();
const vouchersOn = () => o('vouchers') !== false;
const jokersOn = () => o('jokers') !== false;

// ------------------------------------------------------------------ centers
const voucherOption = (id) => (opt(MOD_ID, 'vouchers') === false ? 'vouchers' : 'v_' + id);
const centers = [
  ...V.voucher_centers(L, ATLAS, voucherOption),
  ...J.joker_centers(L, ATLAS, 'jokers'),
];
for (const e of E.EDITIONS) { Object.defineProperty(e, 'mod_option', { enumerable: true, configurable: true, get: () => 'vouchers' }); centers.push(e); }

// Voucher packs (Betmma_Voucher_Pack.lua addBooster): opened like a Celestial Pack (no hand), 1 of 3.
const PACKS = [
  { id: 'voucher_pack', name: 'Voucher Pack', weight: 1.4, cost: 12, what: 'Vouchers' },
  { id: 'uncommon_voucher_pack', name: 'Uncommon Voucher Pack', weight: 0.6, cost: 12, what: 'Uncommon Vouchers' },
  { id: 'fusion_voucher_pack', name: 'Fusion Voucher Pack', weight: 0.3, cost: 18, what: 'Fusion Vouchers' },
];
const packOption = () => (opt(MOD_ID, 'vouchers') === false ? 'vouchers' : 'voucher_packs');
let packOrder = 1;
for (const p of PACKS) {
  const c = {
    key: 'p_betmma_' + p.id, set: 'Booster', name: p.name, kind: p.name, weight: p.weight, cost: p.cost, order: 7000 + packOrder++,
    config: { extra: 3, choose: 1 }, pos: L.packs[p.id], atlas: ATLAS, draw_hand: false,
    loc_vars: (center, iq, card) => ({ vars: reduceHook('booster_loc_vars', [center.config.choose, center.config.extra], center) }),
    create_card(center, booster) {
      // G.GAME.voucher_pack_name tells Betmma's get_next_voucher_key which pool this pack draws from
      V.set_pack_mode(booster.ability.name);
      let key;
      try { key = G_next_voucher_key(true); } finally { V.set_pack_mode(null); }
      const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
      card.from_voucher_pack_flag = true;
      card.cost = 0;
      return card;
    },
  };
  Object.defineProperty(c, 'mod_option', { enumerable: true, configurable: true, get: packOption });
  centers.push(c);
}

// ------------------------------------------------------------------ challenges (5_legendary_challenges.lua; data only)
const STONE_DECK = [];
for (const s of ['D', 'C', 'H', 'S']) for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']) STONE_DECK.push({ s, r, e: 'm_stone' });
export const CHALLENGES = [
  {
    key: 'c_betmma_destroyer', name: 'Destroyer',
    rules: { custom: [], modifiers: [{ id: 'joker_slots', value: 4 }] },
    jokers: [{ id: 'j_caino', eternal: true }, { id: 'j_pareidolia', eternal: true }, { id: 'j_sixth_sense', eternal: true }],
    consumeables: [], vouchers: [{ id: 'v_directors_cut' }], deck: { type: 'Challenge Deck' },
    restrictions: { banned_cards: [{ id: 'j_trading' }, { id: 'c_hanged_man' }, { id: 'c_familiar' }, { id: 'c_grim' }, { id: 'c_incantation' }, { id: 'c_immolate' }], banned_tags: [], banned_other: [] },
  },
  {
    key: 'c_betmma_gottagofast', name: 'Gotta Go Fast',
    rules: { custom: [{ id: 'faster_scaling' }], modifiers: [{ id: 'dollars', value: 10 }] },
    jokers: [{ id: 'j_triboulet' }], consumeables: [], vouchers: [], deck: { type: 'Challenge Deck' },
    restrictions: { banned_cards: [], banned_tags: [], banned_other: [] },
  },
  {
    key: 'c_betmma_bankrupt', name: 'Bankrupt',
    rules: { custom: [{ id: 'discard_cost', value: 10 }], modifiers: [{ id: 'dollars', value: 100 }] },
    jokers: [{ id: 'j_yorick', eternal: true }], consumeables: [], vouchers: [], deck: { type: 'Challenge Deck' },
    restrictions: { banned_cards: [], banned_tags: [], banned_other: [] },
  },
  {
    key: 'c_betmma_antimedusa', name: 'Anti-Medusa',
    rules: { custom: [], modifiers: [{ id: 'consumable_slots', value: 0 }] },
    jokers: [{ id: 'j_perkeo', eternal: true }], consumeables: [{ id: 'c_empress' }], vouchers: [],
    deck: { type: 'Challenge Deck', cards: STONE_DECK },
    restrictions: { banned_cards: [{ id: 'c_fool' }, { id: 'c_high_priestess' }, { id: 'c_emperor' }], banned_tags: [], banned_other: [] },
  },
  {
    key: 'c_betmma_overpoweredboss', name: 'Overpowered Boss',
    rules: { custom: [{ id: 'all_bosses_have_flint_ability' }, { id: 'no_reward' }, { id: 'no_extra_hand_money' }, { id: 'no_interest' }], modifiers: [{ id: 'dollars', value: 20 }] },
    jokers: [{ id: 'j_matador', edition: 'negative', eternal: true }], consumeables: [{ id: 'c_soul', edition: 'negative' }], vouchers: [],
    deck: { type: 'Challenge Deck' },
    restrictions: {
      banned_cards: ['j_caino', 'j_triboulet', 'j_yorick', 'j_perkeo', 'v_seed_money', 'v_money_tree', 'j_to_the_moon', 'j_rocket', 'j_golden', 'j_satellite'].map((id) => ({ id })),
      banned_tags: ['tag_investment', 'tag_handy', 'tag_garbage', 'tag_economy', 'tag_skip'].map((id) => ({ id })),
      banned_other: [],
    },
  },
];
for (const c of CHALLENGES) { c.mod = MOD_ID; c.button_colour = '#ED40BF'; }
/** The challenges' custom rules (shown by the challenge screen). Their engine effects come with it. */
const CHALLENGE_RULES = {
  ch_c_faster_scaling: ['Required score scales extremely faster for each {C:attention}Ante'],
  ch_c_all_bosses_have_flint_ability: ['All {C:attention}Boss Blinds{} halve your {C:blue}base chips{} and {C:red}multi{}'],
};

// ------------------------------------------------------------------ hooks
const busy = new Set(); // cards whose own calculation is running inside the calculate_joker wrap
function calculate_joker(card, context) {
  if (busy.has(card)) return undefined;
  const ed = card.edition;
  const phantom = !!(ed && ed.betmma_phantom), tentacle = !!(ed && ed.betmma_tentacle);
  const pinned = !!(card.pinned && used('bobby_pin'));
  if (!phantom && !tentacle && !pinned) return undefined;
  // Cryptozoology's wrap (outermost) -> Bobby Pin's -> Phantom's -> the card's own calculation
  if (tentacle) E.tentacle(card, context);
  let ret;
  if (!E.phantom_skips(card)) { busy.add(card); try { ret = card.calculate_joker(context); } finally { busy.delete(card); } }
  if (pinned && card.ability.set === 'Joker' && !card.debuff && ret === undefined) {
    const other = J_right(card);
    if (other && other !== card) {
      context.blueprint = context.blueprint ? context.blueprint + 1 : 1;
      context.blueprint_card = context.blueprint_card || card;
      if (context.blueprint > G.jokers.cards.length + 1) return null;
      const oret = other.calculate_joker(context);
      if (oret) { oret.card = context.blueprint_card || card; oret.colour = 'BLUE'; return oret; }
    }
  }
  return ret === undefined ? null : ret;
}
const J_right = (card) => { const i = G.jokers.cards.indexOf(card); return i >= 0 ? G.jokers.cards[i + 1] : undefined; };

const ability_names = ['mult', 'h_mult', 'h_x_mult', 'h_dollars', 'p_dollars', 't_mult', 't_chips', 'h_size', 'd_size', 'bonus'];
/** load_ability_to_center: a stacked card keeps its values on (a copy of) its center. */
function load_ability_to_center(card) {
  card.config.center = JSON_copy(card.config.center);
  for (const v of ability_names) card.config.center.config[v] = card.ability[v] || 0;
  card.config.center.config.Xmult = card.ability.x_mult;
  if (used('real_random')) card.config.center.real_random_abilities = card.ability.real_random_abilities;
}
function load_center_to_ability(card) {
  card.config.center = JSON_copy(card.config.center);
  for (const v of ability_names) card.ability[v] = card.config.center.config[v] || 0;
  card.ability.x_mult = card.config.center.config.Xmult;
  if (used('real_random')) card.ability.real_random_abilities = card.config.center.real_random_abilities;
}
/** Chaos (Card:set_ability wrap): the same Enhancement again stacks onto the card. */
function chaos_stack(card, center, old_center) {
  if (!(used('chaos') && old_center && old_center.name === center.name && card.ability.set === 'Enhanced')) return false;
  for (const v of ability_names) {
    if (v === 'h_x_mult') {
      let nv = (card.ability[v] || 1) * (old_center.config[v] || 1);
      if (nv === 1) nv = 0;
      card.ability[v] = nv;
    } else card.ability[v] = (card.ability[v] || 0) + (old_center.config[v] || 0);
  }
  card.ability.x_mult = (card.ability.x_mult || 1) * (old_center.config.Xmult || 1) || 1;
  if (used('real_random') && old_center.real_random_abilities) card.ability.real_random_abilities = RR.real_random_merge_two_abilities(card.ability.real_random_abilities, old_center.real_random_abilities);
  load_ability_to_center(card);
  return true;
}

/** Pinned jokers keep to the left (vanilla CardArea:align_cards; Bobby Pin is what pins them here). */
function align_pinned() {
  if (!G.jokers || !G.jokers.cards.some((c) => c.pinned)) return;
  const pinned = G.jokers.cards.filter((c) => c.pinned).sort((a, b) => b.sort_id - a.sort_id);
  const rest = G.jokers.cards.filter((c) => !c.pinned);
  const next = [...pinned, ...rest];
  if (next.every((c, i) => c === G.jokers.cards[i])) return;
  G.jokers.cards.length = 0;
  G.jokers.cards.push(...next);
  G.jokers.set_ranks();
  G_emit('sorted', { area: 'jokers', ids: G.jokers.cards.map((c) => c.sort_id) });
}

const ACTIONS = {
  /** Flipped Card: flip up to 3 selected cards, once before each hand. */
  betmma_flip(a) {
    if (!V.flip_allowed()) return 'cannot flip now';
    V.do_flip();
    G_emit('highlight', { ids: G.hand.highlighted.map((c) => c.sort_id) });
    return true;
  },
  /** Recycle Area: discard your hand once while in an Arcana / Spectral pack. */
  betmma_discard_booster() {
    if (!V.recycle_allowed()) return 'cannot discard now';
    V.discard_booster();
    return true;
  },
  /** Vanish Magic: make a playing card in the shop vanish for $3. */
  betmma_vanish(a) {
    const c = find_card(a.id);
    if (!c || !V.vanish_allowed(c)) return 'cannot vanish that';
    V.vanish(c);
    return true;
  },
  /** Balatro Mobile: drag it to another area. */
  betmma_mobile_move(a) {
    const c = find_card(a.id);
    if (!c || !J.mobile_moves(c).includes(a.to)) return 'cannot move that there';
    J.mobile_move(c, a.to);
    return true;
  },
};
function find_card(id) {
  for (const ar of G.areas) for (const c of ar.cards) if (c.sort_id === id) return c;
  return null;
}

const hooks = {
  // ---- voucher pools
  pool_filter: (v, _type) => (vouchersOn() ? V.voucher_pool_filter(v, _type) : undefined),
  next_voucher_key: (from_tag) => (vouchersOn() ? V.next_voucher_key(from_tag) : undefined),
  apply_to_run: (self, center) => { if (vouchersOn()) V.count_voucher(self, center); },
  redeem: (card, layer) => (vouchersOn() ? V.b1g_before_redeem(card, layer) : undefined),
  // ---- rounds
  end_round_start() { if (vouchersOn()) V.end_round_effects(); },
  new_round() { if (vouchersOn()) V.new_round_effects(); },
  round_counts: (when, where) => V.round_counts(when, where),
  evaluate_round_pre: () => V.evaluate_round_pre(),
  skip_blind(when) { if (when === 'before') V.before_skip_blind(); else V.after_skip_blind(); },
  reroll_boss: () => V.after_reroll_boss(),
  reroll_shop: () => V.after_reroll_shop(),
  shop_stocked: () => V.shop_stocked(),
  shop_card_types: () => ((G.GAME.voucher_rate || 0) > 0 ? [{ type: 'Voucher', val: G.GAME.voucher_rate }] : undefined),
  // ---- money / scoring
  mod_chips: (c) => V.round_up_chips(c),
  mod_mult: (m) => V.round_up_mult(m),
  ease_dollars: (mod) => V.gold_round_up(mod),
  dollars_eased: (mod) => { if (jokersOn()) J.piggy_bank(mod); },
  ease_ante: () => { if (jokersOn()) J.housing_choice_reset(); },
  blind_amount: (amount) => V.collector_amount(amount),
  hand_leveled: (card, hand, amount) => V.gravity_after_level_up(card, hand, amount),
  poll_edition: (k, m, nn, g) => V.darkness_poll(k, m, nn, g),
  evaluate_poker_hand: (results) => { if (jokersOn()) J.ascension(results); },
  // ---- cards
  card_repetitions: (card) => V.own_repetitions(card),
  eval_card(card, context, ret) {
    if (context.cardarea === G.play) { V.mirror_main_scoring(card); RR.main_scoring(card); }
    else if (context.cardarea === G.hand && used('echo_chamber')) {
      const d = V.end_of_round_money(card);
      if (d) ret.dollars = (ret.dollars || 0) + d;
    }
  },
  played_cards_scored: () => V.double_flipped_after_play_scoring(),
  draw_from_play_to_discard: () => V.flipped_return_to_hand(),
  shatter: (card) => (V.bulletproof_saves(card) ? true : undefined),
  end_of_round_effect: (card) => V.gilded_glider(card),
  create_card: (card, _type, area, key_append) => V.shop_joker_stickers(card, _type, area, key_append),
  set_debuff(card) {
    V.heat_death_check(card);
    if (used('omnicard') && card.config.center_key === 'm_wild') return 'prevent_debuff';
    if (card.area === G.jokers && V.is_hidden(card)) return true;
    return undefined;
  },
  calculate_rental: () => (used('debt_burden') && G.GAME.dollars < 0 ? false : undefined),
  add_to_deck(card, from_debuff) { V.deck_change(card, +1); E.phantom_added(card, from_debuff); },
  remove_from_deck(card, from_debuff) { V.deck_change(card, -1); E.phantom_removed(card, from_debuff); },
  start_dissolve: (card) => E.undying(card),
  sell_card: (card) => E.reincarnate(card),
  calculate_joker,
  set_ability(card, center, old_center, initial) {
    // Real Random: a new Lucky Card gets its abilities (then Chaos may stack the old ones onto it)
    if (used('real_random') && center === P_CENTERS.m_lucky && !card.config.center.real_random_abilities) RR.real_random_add_abilities_to_card(card);
    if (!initial) chaos_stack(card, center, old_center);
  },
  copy_card(new_card) { if (used('chaos') && new_card.ability.set === 'Enhanced') load_center_to_ability(new_card); },
  chip_bonus: (ret, card) => RR.chip_bonus(ret, card),
  chip_mult: (ret, card) => RR.chip_mult(ret, card),
  chip_x_mult: (ret, card) => RR.chip_x_mult(ret, card),
  p_dollars: (ret, card) => RR.p_dollars(ret, card),
  // ---- shop / packs / consumables
  buy_space: (card) => V.forbidden_buy_space(card),
  buy_area: (card) => V.forbidden_buy_area(card),
  bought(c1, use) { V.after_buy(c1, use, check_for_buy_space); if (jokersOn()) J.mobile_bought(c1); },
  use_card: (card) => V.before_use_card(card),
  used_consumeable: (card, area, copier) => V.solar_system(card, area, copier),
  booster_open(card) { G.GAME.betmma_recycled = false; V.on_open_booster(card); },
  can_reserve: (card) => V.can_reserve(card),
  reserve_area: () => V.reserve_overflow(),
  // ---- the hand
  pre_play() {
    V.refresh_hidden();
    const ok = V.forbidden_area_pre_play();
    V.flipped_pre_play();
    return ok === false ? false : undefined;
  },
  discard_card(card) {
    if (!used('echo_wall')) return;
    const d = V.end_of_round_money(card);
    if (d) { G_ease_dollars(d); G_status(card, 'dollars', d); }
  },
  can_discard: () => V.trash_picker_can_discard(),
  discarded: (hook) => V.trash_picker_after_discard(hook),
  highlight_limit: (limit, area, card) => V.slate_highlight_limit(limit, area, card),
  selection_limit: (n) => V.slate_selection_limit(n),
  action(a) { const f = ACTIONS[a.type]; return f ? f(a) : undefined; },
  // ---- Card:update stand-ins (after every action, and when the joker row changes)
  update() {
    align_pinned();
    V.refresh_hidden();
    for (const c of G.jokers.cards) if (c.ability.mobile) J.mobile_area_state(c);
    // Overshopping + a skip tag's pack: the shop is stocked once the pack closes (Lua: update_shop next frame)
    if (used('overshopping') && G.STATE === STATES.SHOP && !G.shop_populated && G.STATE_COMPLETE) G.STATE_COMPLETE = false;
  },
  emplace(area, card) {
    if (card.ability && card.ability.mobile) J.mobile_area_state(card);
    if (area === G.jokers) { align_pinned(); V.refresh_hidden(); }
  },
  card_removed(card) { if (card.area === G.jokers) G.E_MANAGER.add_event(() => V.refresh_hidden()); },
  // ---- description / view
  describe(card, desc) {
    if (!desc) return;
    RR.describe(card, desc);
    // voucher rarity badge (+ Fusion Voucher badge for the mod's fusions), as the Lua's card_h_popup wrap
    if (vouchersOn() && card.ability && card.ability.set === 'Voucher' && Array.isArray(desc.badges)) {
      const c = card.config.center;
      const r = get_rarity(c.key);
      const R = [null, ['common', 'Common', '#009dff'], ['uncommon', 'Uncommon', '#4BC292'], ['rare', 'Rare', '#fe5f55'], ['legendary', 'Legendary', '#b26cbb']][r];
      if (c.mod === MOD_ID && is_fusion(c)) {
        const i = desc.badges.findIndex((b) => b.key === 'voucher');
        const fusion = { key: 'betmma_fusion', label: dict('k_fusion_voucher'), colour: '#F7D762' };
        if (i >= 0) desc.badges[i] = fusion; else desc.badges.unshift(fusion);
      }
      desc.badges.splice(Math.min(1, desc.badges.length), 0, { key: 'betmma_rarity_' + R[0], label: R[1], colour: R[2] });
    }
  },
  view_card(card, v) {
    const acts = [];
    if (V.vanish_allowed(card)) acts.push({ label: 'Vanish +$' + P_CENTERS[VK('vanish_magic')].config.extra, action: { type: 'betmma_vanish', id: card.sort_id } });
    // Reserve Area: the pack's own Save button (RESERVE)
    if (card.area === G.pack_cards && card.ability.consumeable && V.can_reserve(card)) { v.reserve = true; v.reserve_label = dict('b_reserve'); }
    // a consumable in the joker row (Forbidden Area, Balatro Mobile) can still be used, like in the Lua
    if (card.area === G.jokers && card.ability.consumeable) acts.push({ label: localize('b_use') === 'b_use' ? 'Use' : localize('b_use'), action: { type: 'use', id: card.sort_id } });
    for (const to of J.mobile_moves(card)) acts.push({ label: 'Move to ' + ({ jokers: 'Jokers', consumeables: 'Consumables', hand: 'Hand', shop_jokers: 'Shop' })[to], action: { type: 'betmma_mobile_move', id: card.sort_id, to } });
    if (acts.length) v.mod_actions = acts;
  },
  view(view) {
    const buttons = [];
    if (used('flipped_card') || used('double_flipped_card')) {
      if (G.STATE === STATES.SELECTING_HAND) buttons.push({ where: 'hand', label: dict('b_flip_hand'), colour: '#8867a5', colour_d: '#6b4f85', enabled: V.flip_allowed(), action: { type: 'betmma_flip' } });
    }
    if (used('recycle_area') && (G.STATE === STATES.TAROT_PACK || G.STATE === STATES.SPECTRAL_PACK)) {
      buttons.push({ where: 'pack', label: localize('b_discard') === 'b_discard' ? 'Discard' : localize('b_discard'), colour: 'red', enabled: V.recycle_allowed(), action: { type: 'betmma_discard_booster' } });
    }
    if (buttons.length) view.mod_buttons = buttons;
    if (view.legal && G.STATE === STATES.SELECTING_HAND) {
      const sel = G.hand.highlighted.length;
      if (used('slate') && sel > 0 && sel <= V.slate_selection_limit(5) && !G.GAME.blind.block_play) view.legal.can_play = true;
      if (sel > 0 && V.trash_picker_can_discard()) view.legal.can_discard = true;
    }
    // Rich / Richer Boss: the boss blind shows its bigger reward
    const bonus = V.rich_boss_bonus();
    if (bonus) {
      if (view.choices && view.choices.Boss) view.choices.Boss.dollars = (view.choices.Boss.dollars || 0) + bonus;
      if (view.blind && view.blind.boss && G.GAME.blind && G.GAME.blind.boss) view.blind.dollars = (view.blind.dollars || 0) + bonus;
    }
  },
};
const G_status = (card, type, amt) => card_eval_status_text(card, type, amt);

// ------------------------------------------------------------------ localization
const LOC_EDITIONS = {
  e_betmma_phantom: { name: 'Phantom', text: ['{C:dark_edition}+1{} Joker Slot', '{C:red}50% chance to trigger'] },
  e_betmma_tentacle: { name: 'Tentacle', text: ['When {C:attention}Blind{} is selected,', 'destroy Joker to the', 'right and add its value', "to this joker's value"] },
};
const LOC_PACKS = {};
for (const p of PACKS) LOC_PACKS['p_betmma_' + p.id] = { name: p.name, text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2#{} ' + p.what, 'to be redeemed'] };
const BETMMA_LOC = {
  descriptions: {
    Voucher: LOC_VOUCHERS,
    Joker: LOC_JOKERS,
    Edition: LOC_EDITIONS,
    Booster: LOC_PACKS,
    Enhanced: LOC_REAL_RANDOM,
    Other: { betmma_perishable_no_debuff: LOC_PERISHABLE_NO_DEBUFF },
  },
  misc: {
    dictionary: { ...LOC_DICTIONARY, k_errorr: 'Rank Changed!', k_voucher_pack: 'Voucher Pack', k_betmma_fusion: 'Fusion Voucher' },
    labels: { betmma_phantom: 'Phantom', betmma_tentacle: 'Tentacle', betmma_fusion: 'Fusion Voucher' },
    challenge_names: Object.fromEntries(CHALLENGES.map((c) => [c.key, c.name])),
    v_text: CHALLENGE_RULES,
    v_dictionary: { a_xmult_minus: '-X#1#' },
  },
};

// ------------------------------------------------------------------ options (BetmmaVouchers.jkr defaults)
const options = {
  vouchers: { default: true, label: 'Vouchers (58 + 24 fusion)' },
  voucher_packs: { default: true, label: 'Voucher packs' },
  jokers: { default: true, label: 'Jokers (11)' },
  voucher_rarity: { default: true, label: 'Voucher rarity (Uncommon 1/2, Rare 1/4, Legendary 1/20; fusions weigh 4)' },
};
for (const id of V.VOUCHER_IDS) options['v_' + id] = { default: true, label: V.VOUCHER_DATA[id].name };

export const BETMMA = registerMod({
  id: MOD_ID,
  name: 'Betmma Vouchers',
  prefix: 'betmma',
  version: '3.0.2.3',
  by: 'Betmma (rebuilt for Micatro)',
  badge_colour: '#ED40BF',
  description: '58 new vouchers and 24 fusion vouchers (with voucher rarities), voucher packs, 11 jokers, 2 editions and 5 challenges.',
  options,
  content: {
    centers,
    atlases: { [ATLAS]: { src: ART + 'betmma.png', px: 71, py: 95 } },
    loc: BETMMA_LOC,
  },
  hooks,
  // Lua Game.start_run / delete_run: Bonus+ / Mult+ / Slate raise the shared enhancement values; every new
  // run (with or without this mod) starts from the base ones again.
  reset_run: () => V.restore_enhanced_prototypes(),
  challenges: CHALLENGES,
});

export const STATUS = {
  vouchers: centers.filter((c) => c.set === 'Voucher').map((c) => c.key),
  fusions: centers.filter((c) => c.set === 'Voucher' && is_fusion(c)).map((c) => c.key),
  jokers: centers.filter((c) => c.set === 'Joker').map((c) => c.key),
  boosters: centers.filter((c) => c.set === 'Booster').map((c) => c.key),
  editions: centers.filter((c) => c.set === 'Edition').map((c) => c.key),
  challenges: CHALLENGES.map((c) => c.key),
  active: () => isActive(MOD_ID),
};
// (layout sanity: every voucher has art)
for (const id of LAYOUT_V) if (!V.VOUCHER_DATA[id]) throw new Error('betmma: layout voucher without data: ' + id);
export { V as VOUCHERS_MODULE, J as JOKERS_MODULE, E as EDITIONS_MODULE, RR as REAL_RANDOM_MODULE, BETMMA_LOC };
