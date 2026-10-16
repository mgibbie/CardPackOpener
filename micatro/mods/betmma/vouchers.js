// BETMMA Vouchers (Betmma_Vouchers.lua v3.0.2.3 + lovely/lovely.toml): 58 vouchers and 24 fusion
// vouchers, voucher rarity, and every rule they bend. Each Lua wrap becomes a function the mod's hooks
// call (index.js composes them in the Lua wrap order). Numbers, rules and text are the mod's.
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, quantum_enhancements, get_next_voucher_key,
  create_card, find_joker, ease_dollars, ease_discard, ease_hands_played, ease_ante,
  level_up_hand, poll_edition, pseudorandom, pseudoseed, pseudorandom_element, get_current_pool,
  get_next_tag_key, get_pack, calculate_reroll_cost, localize, emit, play_sound,
} from '../../js/engine/core.js';
import { reduceHook } from '../../js/mods/registry.js';
import {
  STATES, HANDLIST, change_booster_limit, use_card,
} from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import {
  VK, used, vcfg, o, say, dict, normalize_rarity, get_rarity, is_fusion, RARITY_VOUCHER_PROBABILITY,
  randomly_redeem_voucher, randomly_create_joker, randomly_create_spectral, randomly_create_tarot,
  randomly_create_planet, create_black_hole, pseudorandom_element_weighted, get_weight, rarity_on,
} from './common.js';
import { real_random_add_abilities_to_card } from './real_random.js';

// ---------------------------------------------------------------- data (SMODS.Voucher{...} as shipped)
// `rarity` lives in config (get_rarity reads card.config.rarity). Fusion vouchers (2 requirements) weigh
// 4 in the weighted voucher pick (SMODS.Center.inject wrap: config.weight = fusion_voucher_weight).
const R = (id) => VK(id);
export const VOUCHER_DATA = {
  oversupply: { name: 'Oversupply', cost: 10, config: {} },
  oversupply_plus: { name: 'Oversupply Plus', cost: 10, config: {}, requires: [R('oversupply')] },
  gold_coin: { name: 'Gold Coin', cost: 1, config: { extra: 11 } },
  gold_bar: { name: 'Gold Bar', cost: 1, config: { extra: 16 }, requires: [R('gold_coin')] },
  abstract_art: { name: 'Abstract Art', cost: 10, config: { extra: 1, rarity: 2 } },
  mondrian: { name: 'Mondrian', cost: 10, config: { extra: 1, rarity: 2 }, requires: [R('abstract_art')] },
  round_up: { name: 'Round Up', cost: 10, config: {} },
  round_up_plus: { name: 'Round Up Plus', cost: 10, config: { extra: 5 }, requires: [R('round_up')] },
  event_horizon: { name: 'Event Horizon', cost: 10, config: { extra: 4 } },
  engulfer: { name: 'Engulfer', cost: 10, config: { extra: 5, rarity: 2 }, requires: [R('event_horizon')] },
  target: { name: 'Target', cost: 10, config: { extra: 120 } },
  bulls_eye: { name: "Bull's Eye", cost: 10, config: { extra: 105 }, requires: [R('target')] },
  voucher_bundle: { name: 'Voucher Bundle', cost: 15, config: { extra: 2, rarity: 2 } },
  voucher_bulk: { name: 'Voucher Bulk', cost: 25, config: { extra: 4, rarity: 3 }, requires: [R('voucher_bundle')] },
  skip: { name: 'Skip', cost: 10, config: { extra: 6 } },
  skipper: { name: 'Skipper', cost: 10, config: {}, requires: [R('skip')] },
  scrawl: { name: 'Scrawl', cost: 10, config: { extra: 2 } },
  scribble: { name: 'Scribble', cost: 10, config: { extra: 3 }, requires: [R('scrawl')] },
  reserve_area: { name: 'Reserve Area', cost: 10, config: {} },
  reserve_area_plus: { name: 'Reserve Area Plus', cost: 10, config: {}, requires: [R('reserve_area')] },
  // FIX 2 (intended design): the Lua puts `rarity=2` beside config (SMODS.Voucher{..., rarity=2}), where
  // get_rarity never looks, so Overkill was silently common. It's meant to be uncommon like its tier.
  overkill: { name: 'Overkill', cost: 10, config: { extra: 300, rarity: 2 } },
  big_blast: { name: 'Big Blast', cost: 10, config: { extra: { multiplier: 5, increase: 2 }, rarity: 3 }, requires: [R('overkill')] },
  '3d_boosters': { name: '3D Boosters', cost: 10, config: {} },
  '4d_boosters': { name: '4D Boosters', cost: 10, config: { extra: 3, rarity: 2 }, requires: [R('3d_boosters')] },
  b1g50: { name: 'B1G50%', cost: 10, config: { extra: { chance: 50 } } },
  b1g1: { name: 'B1G1', cost: 10, config: { extra: 10, rarity: 2 }, requires: [R('b1g50')] },
  collector: { name: 'Collector', cost: 10, config: { extra: 4 } },
  connoisseur: { name: 'Connoisseur', cost: 10, config: { extra: { base: 400, multiplier: 5 }, rarity: 3 }, requires: [R('collector')] },
  flipped_card: { name: 'Flipped Card', cost: 10, config: { extra: 3, rarity: 2 } },
  double_flipped_card: { name: 'Double Flipped Card', cost: 10, config: { rarity: 2 }, requires: [R('flipped_card')] },
  prologue: { name: 'Prologue', cost: 10, config: {} },
  epilogue: { name: 'Epilogue', cost: 10, config: { extra: 2 }, requires: [R('prologue')] },
  bonus_plus: { name: 'Bonus+', cost: 10, config: { extra: 30 } },
  mult_plus: { name: 'Mult+', cost: 10, config: { extra: 8 }, requires: [R('bonus_plus')] },
  omnicard: { name: 'Omnicard', cost: 10, config: {} },
  bulletproof: { name: 'Bulletproof', cost: 10, config: { extra: { lose: 0.1, lower_bound: 1.5 }, rarity: 2 }, requires: [R('omnicard')] },
  cash_clutch: { name: 'Cash Clutch', cost: 10, config: { extra: 1 } },
  inflation: { name: 'Inflation', cost: 10, config: { extra: 1 }, requires: [R('cash_clutch')] },
  eternity: { name: 'Eternity', cost: 10, config: { extra: 2.5, rarity: 2 } },
  half_life: { name: 'Half-life', cost: 10, config: { extra: 0.5, rarity: 2 }, requires: [R('eternity')] },
  debt_burden: { name: 'Debt Burden', cost: 10, config: { extra: 10, rarity: 1 } },
  bobby_pin: { name: 'Bobby Pin', cost: 10, config: { rarity: 3 }, requires: [R('debt_burden')] },
  stow: { name: 'Stow', cost: 10, config: { extra: 1, rarity: 1 } },
  stash: { name: 'Stash', cost: 10, config: { extra: 1, rarity: 1 }, requires: [R('stow')] },
  undying: { name: 'Undying', cost: 10, config: { extra: 1, rarity: 2 } },
  reincarnate: { name: 'Reincarnate', cost: 10, config: { extra: 1, rarity: 2 }, requires: [R('undying')] },
  bargain_aisle: { name: 'Bargain Aisle', cost: 10, config: { rarity: 1 } },
  clearance_aisle: { name: 'Clearance Aisle', cost: 10, config: { rarity: 1 }, requires: [R('bargain_aisle')] },
  rich_boss: { name: 'Rich Boss', cost: 10, config: { rarity: 1, extra: 8 } },
  richer_boss: { name: 'Richer Boss', cost: 10, config: { rarity: 1, extra: 4 }, requires: [R('rich_boss')] },
  gravity_assist: { name: 'Gravity Assist', cost: 10, config: { rarity: 1, extra: 8 } },
  gravitational_wave: { name: 'Gravitational Wave', cost: 10, config: { rarity: 1, extra: 0.2 }, requires: [R('gravity_assist')] },
  garbage_bag: { name: 'Garbage Bag', cost: 10, config: { rarity: 1, extra: 3 } },
  handbag: { name: 'Handbag', cost: 10, config: { rarity: 2, extra: 3 }, requires: [R('garbage_bag')] },
  echo_wall: { name: 'Echo Wall', cost: 10, config: { rarity: 1, extra: 3 } },
  echo_chamber: { name: 'Echo Chamber', cost: 10, config: { rarity: 2, extra: 3 }, requires: [R('echo_wall')] },
  laminator: { name: 'Laminator', cost: 10, config: { rarity: 1, extra: 3 } },
  eliminator: { name: 'Eliminator', cost: 10, config: { rarity: 1, extra: 3 }, requires: [R('laminator')] },
  // ---- fusion vouchers
  gold_round_up: { name: 'Gold Round Up', cost: 10, config: { rarity: 2 }, requires: [R('round_up'), R('gold_coin')] },
  overshopping: { name: 'Overshopping', cost: 10, config: { rarity: 2 }, requires: ['v_overstock_norm', R('oversupply')] },
  reroll_cut: { name: 'Reroll Cut', cost: 10, config: {}, requires: ['v_directors_cut', 'v_reroll_surplus'] },
  vanish_magic: { name: 'Vanish Magic', cost: 10, config: { extra: 3 }, requires: ['v_magic_trick', 'v_blank'] },
  darkness: { name: 'Darkness', cost: 10, config: { extra: 4 }, requires: ['v_glow_up', 'v_antimatter'] },
  double_planet: { name: 'Double Planet', cost: 10, config: { rarity: 2 }, requires: ['v_planet_merchant', R('b1g50')] },
  trash_picker: { name: 'Trash Picker', cost: 10, config: { extra: 1 }, requires: ['v_grabber', 'v_wasteful'] },
  money_target: { name: 'Money Target', cost: 10, config: { extra: 2 }, requires: ['v_seed_money', R('target')] },
  art_gallery: { name: 'Art Gallery', cost: 10, config: { extra: 1 }, requires: ['v_hieroglyph', R('abstract_art')] },
  b1ginf: { name: 'B1Ginf', cost: 10, config: { rarity: 3 }, requires: [R('collector'), R('b1g1')] },
  slate: { name: 'Slate', cost: 10, config: { extra: 100 }, requires: ['v_petroglyph', R('bonus_plus')] },
  gilded_glider: { name: 'Gilded Glider', cost: 10, config: {}, requires: [R('gold_bar'), R('bonus_plus')] },
  mirror: { name: 'Mirror', cost: 10, config: { rarity: 2 }, requires: [R('flipped_card'), R('omnicard')] },
  real_random: { name: 'Real Random', cost: 10, config: { extra: { ability: 3 }, rarity: 4 }, requires: ['v_crystal_ball', R('omnicard')] },
  '4d_vouchers': { name: '4D Vouchers', cost: 10, config: { extra: 2, rarity: 3 }, requires: [R('4d_boosters'), R('oversupply')] },
  recycle_area: { name: 'Recycle Area', cost: 10, config: {}, requires: [R('reserve_area'), 'v_wasteful'] },
  chaos: { name: 'Chaos', cost: 10, config: { rarity: 4 }, requires: [R('collector'), R('abstract_art')] },
  heat_death: { name: 'Heat Death', cost: 10, config: { extra: 1, rarity: 3 }, requires: [R('eternity'), R('half_life')] },
  deep_roots: { name: 'Deep Roots', cost: 10, config: { rarity: 1 }, requires: ['v_seed_money', R('debt_burden')] },
  solar_system: { name: 'Solar System', cost: 10, config: { rarity: 3 }, requires: ['v_planet_merchant', R('event_horizon')] },
  forbidden_area: { name: 'Forbidden Area', cost: 10, config: { rarity: 3 }, requires: [R('reserve_area'), R('undying')] },
  voucher_tycoon: { name: 'Voucher Tycoon', cost: 10, config: { rarity: 1 }, requires: [R('oversupply'), 'v_planet_tycoon'] },
  cryptozoology: { name: 'Cryptozoology', cost: 10, config: { extra: 15, rarity: 4 }, requires: ['v_crystal_ball', R('undying')] },
  reroll_aisle: { name: 'Reroll Aisle', cost: 10, config: { rarity: 2 }, requires: ['v_reroll_surplus', R('clearance_aisle')] },
};
export const FUSION_VOUCHER_WEIGHT = 4;

// ----------------------------------------------------------------- loc_vars (as shipped)
const prob = () => '' + ((G.GAME && G.GAME.probabilities.normal) || 1);
const ex = (card, center) => (card && card.ability ? card.ability.extra : center.config.extra);
/** Big Blast: X{5 * 2^(n(n+1))} required score, then X{2^(2(n+1))} more (n = times it fired). */
export function big_blast_vars(center) {
  const e = center.config.extra;
  const count = (G.GAME && G.GAME.v_big_blast_count) || 0;
  return [e.multiplier * Math.pow(e.increase, count * (count + 1)), Math.pow(e.increase, 2 * (count + 1))];
}
/** Connoisseur: [$threshold base, $current threshold, X multiplier]. */
export function connoisseur_vars(center) {
  const e = center.config.extra;
  const count = (G.GAME && G.GAME.v_connoisseur_count) || 0;
  const redeemed = (G.GAME && G.GAME.vouchers_bought) || 0;
  return [e.base * Math.pow(e.multiplier, count), Math.ceil(e.base / (redeemed + 1) * Math.pow(e.multiplier, count)), e.multiplier];
}
const LOC_VARS = {
  gold_coin: (c, iq, card) => [ex(card, c)], gold_bar: (c, iq, card) => [ex(card, c)],
  abstract_art: (c, iq, card) => [ex(card, c)], mondrian: (c, iq, card) => [ex(card, c)],
  round_up_plus: (c, iq, card) => [ex(card, c)],
  event_horizon: (c, iq, card) => [prob(), ex(card, c)], engulfer: (c, iq, card) => [prob(), ex(card, c)],
  target: (c, iq, card) => [ex(card, c)], bulls_eye: (c, iq, card) => [ex(card, c)],
  voucher_bundle: (c, iq, card) => [ex(card, c)], voucher_bulk: (c, iq, card) => [ex(card, c)],
  skip: (c, iq, card) => [ex(card, c)], scrawl: (c, iq, card) => [ex(card, c)], scribble: (c, iq, card) => [ex(card, c)],
  overkill: (c, iq, card) => [ex(card, c)],
  big_blast: (c) => big_blast_vars(c),
  '4d_boosters': (c, iq, card) => [ex(card, c)],
  b1g50: (c, iq, card) => [ex(card, c).chance], b1g1: (c, iq, card) => [ex(card, c)],
  collector: (c, iq, card) => [ex(card, c)],
  connoisseur: (c) => connoisseur_vars(c),
  flipped_card: (c, iq, card) => [ex(card, c)], epilogue: (c, iq, card) => [ex(card, c)],
  bonus_plus: (c, iq, card) => [ex(card, c), ex(card, c) + 30], mult_plus: (c, iq, card) => [ex(card, c), ex(card, c) + 4],
  bulletproof: (c, iq, card) => [ex(card, c).lose, ex(card, c).lower_bound],
  cash_clutch: (c, iq, card) => [ex(card, c)], inflation: (c, iq, card) => [ex(card, c)],
  eternity: (c, iq, card) => { iq.push({ key: 'eternal', set: 'Other' }); return [100 / ex(card, c)]; },
  half_life: (c, iq, card) => { iq.push({ key: 'betmma_perishable_no_debuff', set: 'Other', vars: [G.GAME ? G.GAME.perishable_rounds : 5] }); return [ex(card, c)]; },
  debt_burden: (c, iq, card) => { iq.push({ key: 'rental', set: 'Other', vars: [(G.GAME && G.GAME.rental_rate) || 1] }); return [ex(card, c)]; },
  bobby_pin: (c, iq) => { iq.push({ key: 'pinned_left', set: 'Other' }); return []; },
  stow: (c, iq, card) => [ex(card, c)], stash: (c, iq, card) => [ex(card, c)],
  undying: (c, iq, card) => { iq.push({ key: 'e_betmma_phantom', set: 'Edition' }); return [ex(card, c)]; },
  reincarnate: (c, iq, card) => { iq.push({ key: 'e_betmma_phantom', set: 'Edition' }); return [ex(card, c)]; },
  rich_boss: (c, iq, card) => [ex(card, c)], richer_boss: (c, iq, card) => [ex(card, c)],
  gravity_assist: (c, iq, card) => [ex(card, c)], gravitational_wave: (c, iq, card) => [ex(card, c)],
  garbage_bag: (c, iq, card) => [ex(card, c)], handbag: (c, iq, card) => [ex(card, c)],
  echo_wall: (c, iq, card) => [ex(card, c)], echo_chamber: (c, iq, card) => [ex(card, c)],
  laminator: (c, iq, card) => [prob(), ex(card, c)], eliminator: (c, iq, card) => [ex(card, c)],
  vanish_magic: (c, iq, card) => [ex(card, c)], darkness: (c, iq, card) => [ex(card, c)],
  trash_picker: (c, iq, card) => [ex(card, c)], money_target: (c, iq, card) => [ex(card, c)],
  art_gallery: (c, iq, card) => [ex(card, c)], slate: (c, iq, card) => [ex(card, c)],
  '4d_vouchers': (c, iq, card) => [ex(card, c)],
  heat_death: (c, iq, card) => {
    iq.push({ key: 'eternal', set: 'Other' });
    iq.push({ key: 'betmma_perishable_no_debuff', set: 'Other', vars: [G.GAME ? G.GAME.perishable_rounds : 5] });
    return [ex(card, c)];
  },
  cryptozoology: (c, iq, card) => { iq.push({ key: 'e_betmma_tentacle', set: 'Edition' }); return [ex(card, c)]; },
};

// ----------------------------------------------------------------- redeem effects (Card:apply_to_run wraps)
/** ease_ante_to_win(mod): +mod Ante to win (in an event, like the Lua). */
export function ease_ante_to_win(mod) {
  G.E_MANAGER.add_event(() => {
    mod = mod || 0;
    G.GAME.win_ante = G.GAME.win_ante + mod;
    emit('attention', { text: (mod < 0 ? '-' : '+') + Math.abs(mod), what: 'win_ante' });
    emit('win_ante', { total: G.GAME.win_ante });
    play_sound('highlight2', 0.685, 0.2);
    play_sound('generic1');
  });
}
const half_life_delta = () => {
  if (!G.jokers.cards || !used('half_life')) return 0;
  let ret = 0;
  for (const j of G.jokers.cards) if (j.ability.perishable && !j.debuff) ret += vcfg('half_life').extra;
  return ret;
};
const debt_burden_delta = () => {
  if (!G.jokers.cards || !used('debt_burden')) return 0;
  let ret = 0;
  for (const j of G.jokers.cards) if (j.ability.rental && !j.debuff) ret += vcfg('debt_burden').extra;
  return ret;
};
export function bargain_aisle_effect() {
  G.E_MANAGER.add_event(() => {
    const c = G.shop_jokers && G.shop_jokers.cards[0];
    if (c) { c.ability.couponed = true; c.set_cost(); emit('card_changed', { card: c.sort_id }); }
  });
}
export function clearance_aisle_effect() {
  G.E_MANAGER.add_event(() => {
    const c = G.shop_booster && G.shop_booster.cards[0];
    if (c) { c.ability.couponed = true; c.set_cost(); emit('card_changed', { card: c.sort_id }); }
  });
}
const shop_is_up = () => !!(G.shop_open && G.STATE !== STATES.BLIND_SELECT);
/** Base values the Bonus+ / Mult+ / Slate redeems raise (restored at every new run, like the Lua's start_run). */
const ENHANCED_PROTOTYPES = {
  m_bonus: P_CENTERS.m_bonus.config.bonus, m_mult: P_CENTERS.m_mult.config.mult, m_glass: P_CENTERS.m_glass.config.Xmult,
  m_steel: P_CENTERS.m_steel.config.h_x_mult, m_stone: P_CENTERS.m_stone.config.bonus, m_gold: P_CENTERS.m_gold.config.h_dollars,
};
export function restore_enhanced_prototypes() {
  P_CENTERS.m_bonus.config.bonus = ENHANCED_PROTOTYPES.m_bonus;
  P_CENTERS.m_mult.config.mult = ENHANCED_PROTOTYPES.m_mult;
  P_CENTERS.m_glass.config.Xmult = ENHANCED_PROTOTYPES.m_glass;
  P_CENTERS.m_steel.config.h_x_mult = ENHANCED_PROTOTYPES.m_steel;
  P_CENTERS.m_stone.config.bonus = ENHANCED_PROTOTYPES.m_stone;
  P_CENTERS.m_gold.config.h_dollars = ENHANCED_PROTOTYPES.m_gold;
}

const REDEEM = {
  gold_coin(c) { ease_dollars(c.config.extra); G.GAME.modifiers.no_blind_reward = G.GAME.modifiers.no_blind_reward || {}; G.GAME.modifiers.no_blind_reward.Small = true; },
  gold_bar(c) { ease_dollars(c.config.extra); G.GAME.modifiers.no_blind_reward = G.GAME.modifiers.no_blind_reward || {}; G.GAME.modifiers.no_blind_reward.Big = true; },
  abstract_art(c) {
    const e = c.config.extra;
    ease_ante_to_win(e);
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + e;
    ease_hands_played(e);
    G.GAME.round_resets.discards = G.GAME.round_resets.discards + e;
    ease_discard(e);
  },
  mondrian(c) {
    ease_ante_to_win(c.config.extra);
    G.E_MANAGER.add_event(() => { if (G.jokers) G.jokers.config.card_limit = G.jokers.config.card_limit + 1; });
  },
  event_horizon() {
    for (let i = 1; i <= 2; i++) {
      G.E_MANAGER.add_event(() => {
        play_sound('timpani');
        const card = create_card('Planet', G.consumeables, null, null, null, null, null, 'Event Horizon');
        card.set_edition({ negative: true }, true, false);
        card.add_to_deck();
        G.consumeables.emplace(card);
      });
    }
  },
  engulfer() { create_black_hole(); },
  voucher_bundle() { for (let i = 1; i <= vcfg('voucher_bundle').extra; i++) G.E_MANAGER.add_event(() => randomly_redeem_voucher()); },
  voucher_bulk() { for (let i = 1; i <= vcfg('voucher_bulk').extra; i++) G.E_MANAGER.add_event(() => randomly_redeem_voucher()); },
  scrawl() {
    ease_dollars(vcfg('scrawl').extra * G.jokers.cards.length);
    // FIX 6: the Lua passes min(ceil(slots left), 100) even when the row is over-full, which pushes
    // joker_buffer negative for the rest of the run (every later "must have room" check then over-counts
    // the room). Nothing is created when there's no room, as the text says.
    randomly_create_joker(Math.max(0, Math.min(Math.ceil(G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer)), 100)), null, null);
  },
  scribble() { for (let i = 1; i <= vcfg('scribble').extra; i++) randomly_create_spectral(null, null, { edition: { negative: true } }); },
  reserve_area_plus() { add_tag(new Tag('tag_ethereal')); },
  '3d_boosters'() { change_booster_limit(1); },
  epilogue() { G.consumeables.config.card_limit = G.consumeables.config.card_limit + 1; },
  bonus_plus() {
    const e = vcfg('bonus_plus').extra;
    P_CENTERS.m_bonus.config.bonus = P_CENTERS.m_bonus.config.bonus + e;
    for (const v of G.playing_cards) if (v.config.center_key === 'm_bonus') v.ability.bonus = v.ability.bonus + e;
  },
  mult_plus() {
    const e = vcfg('mult_plus').extra;
    P_CENTERS.m_mult.config.mult = P_CENTERS.m_mult.config.mult + e;
    for (const v of G.playing_cards) if (v.config.center_key === 'm_mult') v.ability.mult = v.ability.mult + e;
  },
  cash_clutch(c) { cash_clutch_effect(c.config.extra); },
  inflation(c) { cash_clutch_effect(c.config.extra); },
  eternity() { G.GAME.modifiers.enable_eternals_in_shop = true; },
  half_life() { G.GAME.modifiers.enable_perishables_in_shop = true; G.jokers.config.card_limit = G.jokers.config.card_limit + half_life_delta(); },
  debt_burden() { G.GAME.modifiers.enable_rentals_in_shop = true; G.GAME.bankrupt_at = G.GAME.bankrupt_at - debt_burden_delta(); },
  bobby_pin() { G.GAME.modifiers.cry_enable_pinned_in_shop = true; },
  stow() { G.E_MANAGER.add_event(() => { if (G.jokers) G.jokers.config.card_limit = G.jokers.config.card_limit + 1; }); },
  stash() { G.E_MANAGER.add_event(() => { if (G.jokers) G.jokers.config.card_limit = G.jokers.config.card_limit + 1; }); },
  bargain_aisle() { if (shop_is_up()) bargain_aisle_effect(); },
  clearance_aisle() { if (shop_is_up()) clearance_aisle_effect(); },
  garbage_bag(c) { ease_discard(c.config.extra); G.GAME.betmma_discards_left_ref = (G.GAME.betmma_discards_left_ref || 0) + c.config.extra; },
  handbag(c) { ease_hands_played(c.config.extra); G.GAME.betmma_hands_left_ref = (G.GAME.betmma_hands_left_ref || 0) + c.config.extra; },
  trash_picker(c) {
    const e = c.config.extra;
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + e;
    ease_hands_played(e);
    G.GAME.round_resets.discards = G.GAME.round_resets.discards + e;
    ease_discard(e);
    G.GAME.modifiers.money_per_discard = G.GAME.modifiers.money_per_hand || 1;
  },
  art_gallery(c) { ease_ante_to_win(c.config.extra); },
  slate() {
    const e = vcfg('slate').extra;
    P_CENTERS.m_stone.config.bonus = P_CENTERS.m_stone.config.bonus + e;
    for (const v of G.playing_cards) if (v.config.center_key === 'm_stone') v.ability.bonus = v.ability.bonus + e;
  },
  real_random() {
    for (const v of G.playing_cards) {
      if (v.config.center_key === 'm_lucky' && !(v.config && v.config.center && v.config.center.real_random_abilities)) real_random_add_abilities_to_card(v);
    }
  },
  heat_death() { G.GAME.modifiers.cry_eternal_perishable_compat = true; },
  voucher_tycoon() { G.GAME.voucher_rate = (G.GAME.voucher_rate || 0) + 2; },
  reroll_aisle() { if (shop_is_up()) { bargain_aisle_effect(); clearance_aisle_effect(); } },
};
function cash_clutch_effect(extra) {
  G.GAME.modifiers.money_per_hand = (G.GAME.modifiers.money_per_hand || 1) + extra;
  if (used('trash_picker')) G.GAME.modifiers.money_per_discard = (G.GAME.modifiers.money_per_discard || 0) + extra;
}

/** Collector's counter + Connoisseur's Antimatter (the apply_to_run wrap that sees EVERY voucher). */
export function count_voucher(self, center) {
  const name = center ? center.name : (self ? self.ability.name : undefined);
  G.GAME.vouchers_bought = (G.GAME.vouchers_bought || 0) + 1;
  if (name !== 'Antimatter' && used('connoisseur') && G.GAME.dollars >= connoisseur_vars(P_CENTERS[VK('connoisseur')])[1]) {
    G.GAME.v_connoisseur_count = (G.GAME.v_connoisseur_count || 0) + 1;
    G.E_MANAGER.add_event(() => randomly_redeem_voucher('v_antimatter'));
  }
}

// ----------------------------------------------------------------- voucher rarity + the weighted pick
let bypass_rarity = 0;
let pack_mode = null;   // G.GAME.voucher_pack_name while a voucher pack rolls its cards
export const set_pack_mode = (name) => { pack_mode = name; };
/** get_current_pool's rarity check: a rarity-r voucher joins with chance 1/RARITY_VOUCHER_PROBABILITY[r]. */
export function voucher_pool_filter(v, _type) {
  if (_type !== 'Voucher' || bypass_rarity) return undefined;
  // FIX 3 (intended design): the config switch is called enable_voucher_rarity, but the shipped code only
  // used it to turn the fusion weights off; it now switches the rarity roll off too (default: on).
  if (!rarity_on()) return undefined;
  const r = normalize_rarity(v.config && v.config.rarity);
  if (!(pseudorandom('std_' + v.key) < 1 / RARITY_VOUCHER_PROBABILITY[r - 1])) return false;
  return undefined;
}
function raw_voucher_pool(append) {
  bypass_rarity++;
  try { return get_current_pool('Voucher', undefined, undefined, append); } finally { bypass_rarity--; }
}
/** get_specific_rarity_vouchers_pool(rarity): no rarity roll (requirements still apply). */
function specific_rarity_pool(rarity) {
  const [pool, pool_key] = raw_voucher_pool();
  const out = pool.filter((v) => v !== 'UNAVAILABLE' && get_rarity(v) === rarity);
  if (!out.length) return get_current_pool('Voucher', undefined, undefined, 'lol');
  return [out, pool_key];
}
/** get_voucher_pool_with_filter_and_reqs(func) */
function filtered_pool(func) {
  const [pool, pool_key] = raw_voucher_pool();
  const out = pool.filter((v) => v !== 'UNAVAILABLE' && func(P_CENTERS[v]));
  if (!out.length) return get_current_pool('Voucher', undefined, undefined, 'lol');
  return [out, pool_key];
}
/** Betmma's get_next_voucher_key: rarity-filtered pool (or a voucher pack's own pool), weighted pick. */
export function next_voucher_key(_from_tag) {
  let pool, pool_key;
  if (pack_mode && pack_mode.includes('Uncommon')) [pool, pool_key] = specific_rarity_pool(2);
  else if (pack_mode === 'Fusion Voucher Pack') [pool, pool_key] = filtered_pool((c) => is_fusion(c));
  // (the Lua's get_current_pool wrap sets _append = 'lol' for vouchers — kept for the seed keys)
  else [pool, pool_key] = get_current_pool('Voucher', undefined, undefined, 'lol');
  if (_from_tag) pool_key = 'Voucher_fromtag';
  const entries = pool.map((v, i) => [i + 1, v]);
  let [center] = pseudorandom_element_weighted(entries, pseudoseed(pool_key), get_weight);
  let it = 1;
  while (center === 'UNAVAILABLE') {
    it++;
    [center] = pseudorandom_element_weighted(entries, pseudoseed(pool_key + '_resample' + it), get_weight);
  }
  return center;
}

// ----------------------------------------------------------------- B1G50% / B1G1 / B1Ginf (Card:redeem wrap)
let block_b1g1 = false;
/** Called before a voucher is redeemed; returns the follow-up (extra redeems) to run after it, if any. */
export function b1g_before_redeem(card, layer) {
  if (!((!block_b1g1 && ((used('b1g50') && pseudorandom('b1g1') * 100 < vcfg('b1g50').extra.chance) || used('b1g1'))) ||
      (used('b1ginf') && !(typeof layer === 'number' && layer > 250)))) return undefined;
  const lose_percent = used('b1g1') ? 100 : 50;
  const name = card.ability.name;
  const to_get = [];
  for (const v of P_CENTER_POOLS.Voucher || []) {
    const unredeemed = [];
    if (v.requires && !G.GAME.used_vouchers[v.key]) for (const vv of v.requires) if (!G.GAME.used_vouchers[vv]) unredeemed.push(vv);
    const only_need = P_CENTERS[unredeemed[0]];
    if (unredeemed.length === 1 && only_need && only_need.name === name && get_rarity(v.key) !== 4) {
      to_get.push(v);
      if (!used('b1ginf')) break;
    }
  }
  if (!to_get.length) return undefined;
  return () => {
    for (const v of to_get) {
      const extra = new Card(P_CARDS.empty, v, { bypass_discovery_center: true, bypass_discovery_ui: true });
      emit('betmma_voucher', { center: v.key, name: localize({ type: 'name_text', set: 'Voucher', key: v.key }) });
      extra.cost = Math.ceil(extra.cost * lose_percent / 100);
      extra.shop_voucher = false;
      const current_round_voucher = G.GAME.current_round.voucher;
      if (!used('b1ginf')) block_b1g1 = true; // only 1 extra
      try { extra.redeem((layer || 0) + 1); } finally { block_b1g1 = false; }
      G.GAME.current_round.voucher = current_round_voucher;
      G.E_MANAGER.add_event(() => extra.start_dissolve());
    }
  };
}

// ----------------------------------------------------------------- end of round (end_round wraps, Lua order)
export function end_round_effects() {
  const chips = G.GAME.chips, need = G.GAME.blind.chips;
  // Laminator / Eliminator
  if (used('laminator')) {
    G.E_MANAGER.add_event(() => {
      const card = G.jokers.cards[0];
      if (card && (card.ability.eternal || card.ability.perishable || card.ability.rental || card.pinned || card.ability.banana) &&
          pseudorandom('laminator') < G.GAME.probabilities.normal / vcfg('laminator').extra) {
        const edition = poll_edition('wheel_of_fortune', null, true, true);
        card.set_edition(edition, true);
        say(card, dict('k_laminator'), null, 'jokers');
        if (used('eliminator')) {
          card.set_eternal(false);
          card.ability.perishable = false;
          card.set_rental(false);
          card.pinned = false;
          card.ability.banana = false;
          emit('card_changed', { card: card.sort_id });
        }
      }
    });
  }
  // Epilogue: the last Epilogue card goes, a new one comes
  for (const c of G.consumeables.cards.slice()) if (c.ability.v_epilogue) c.start_dissolve();
  if (used('epilogue')) G.E_MANAGER.add_event(() => randomly_create_spectral('v_epilogue', null, { eternal: true, extra_ability: 'v_epilogue' }));
  // Overkill / Big Blast
  if (used('overkill') && chips - need >= 0 && chips * 100 - need * vcfg('overkill').extra >= 0) {
    const temp_pool = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !v.edition);
    if (temp_pool.length) {
      G.E_MANAGER.add_event(() => {
        const [eligible] = pseudorandom_element(temp_pool, pseudoseed('v_overkill'));
        const edition = poll_edition('wheel_of_fortune', null, true, true);
        eligible.set_edition(edition, true);
        say(eligible, dict('k_overkill_edition'), null, 'jokers');
      });
    }
  }
  if (used('big_blast') && chips - need >= 0 && chips - need * big_blast_vars(P_CENTERS[VK('big_blast')])[0] >= 0) {
    G.E_MANAGER.add_event(() => {
      const temp_pool = G.jokers.cards.filter((v) => v.ability.set === 'Joker' && !(v.edition && v.edition.negative));
      if (temp_pool.length) {
        const [eligible] = pseudorandom_element(temp_pool, pseudoseed('v_big_blast'));
        eligible.set_edition({ negative: true }, true);
        say(eligible, dict('k_big_blast_edition'), null, 'jokers');
      }
    });
    G.GAME.v_big_blast_count = (G.GAME.v_big_blast_count || 0) + 1;
  }
  // Target / Bull's Eye
  if (used('target') && chips - need >= 0 && chips * 100 - need * vcfg('target').extra <= 0) {
    if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
      const n = Math.min(1, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer));
      randomly_create_joker(n, 'target', dict('k_target_generate'));
    }
  }
  if (used('bulls_eye') && chips - need >= 0 && chips * 100 - need * vcfg('bulls_eye').extra <= 0) {
    randomly_create_joker(1, 'target', dict('k_bulls_eye_generate'), { edition: { negative: true } });
  }
  // Oversupply / Oversupply Plus
  if ((used('oversupply') && G.GAME.blind.get_type() === 'Boss') || used('oversupply_plus')) add_tag(new Tag('tag_voucher'));
  // Art Gallery (after the vanilla end_round in the Lua; its effects queue behind it the same way)
  if (used('art_gallery') && G.GAME.blind.get_type() === 'Boss') {
    const r = pseudorandom('v_art_gallery');
    const value = vcfg('art_gallery').extra;
    if (r < 1 / 3) { G.GAME.round_resets.hands = G.GAME.round_resets.hands + value; ease_hands_played(value); }
    else if (r < 2 / 3) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + value; ease_discard(value); }
    else {
      ease_ante(-value);
      G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante ?? G.GAME.round_resets.ante;
      G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante - value;
    }
  }
}

// ----------------------------------------------------------------- new round (new_round wraps)
export function new_round_effects() {
  if (used('real_random')) G.E_MANAGER.add_event(() => randomly_create_tarot('v_prologue', null, { forced_key: 'c_magician', edition: { negative: true } }));
  if (used('prologue')) {
    for (const c of G.consumeables.cards.slice()) if (c.ability.v_prologue) c.start_dissolve();
    G.E_MANAGER.add_event(() => randomly_create_tarot('v_prologue', null, { eternal: true, extra_ability: 'v_prologue' }));
  }
  G.GAME.current_round.flips_left = 1;
}

// ----------------------------------------------------------------- skip / shop / reroll
export function before_skip_blind() {
  if (used('skip')) ease_dollars(vcfg('skip').extra);
  if (used('skipper')) add_tag(new Tag('tag_double'));
}
/** Overshopping: after a skip, go shopping (the Lua's G.FUNCS.skip_blind wrap). */
export function after_skip_blind() {
  if (!used('overshopping')) return;
  G.STATE = STATES.SHOP;
  G.GAME.shop_free = null;
  G.GAME.shop_d6ed = null;
  G.STATE_COMPLETE = false;
  G.GAME.current_round.reroll_cost_increase = 0;
  G.GAME.current_round.used_packs = {};
  G.GAME.current_round.free_rerolls = find_joker('Chaos the Clown').length;
  calculate_reroll_cost(true);
}
/** Reroll Cut: rerolling the boss also rerolls the tags and gives a random tag. */
export function after_reroll_boss() {
  if (!used('reroll_cut')) return;
  // Port note: the Lua returns from the whole reroll (Boss Tag too) outside the blind select screen
  // with the mod installed; here only Reroll Cut's extras need the blind select screen.
  if (G.STATE !== STATES.BLIND_SELECT) return;
  const rr = G.GAME.round_resets;
  if (rr.blind_states.Small !== 'Defeated') rr.blind_tags.Small = get_next_tag_key();
  if (rr.blind_states.Big !== 'Defeated') rr.blind_tags.Big = get_next_tag_key();
  let random_tag_key = get_next_tag_key();
  while (random_tag_key === 'tag_boss') random_tag_key = get_next_tag_key();
  // (the Lua's `orbital_choices[ante][type]` indexes with the builtin `type`, so it always re-rolls Small's)
  const ante = rr.ante;
  G.GAME.orbital_choices = G.GAME.orbital_choices || {};
  G.GAME.orbital_choices[ante] = G.GAME.orbital_choices[ante] || {};
  const hands = HANDLIST.filter((k) => G.GAME.hands[k].visible);
  G.GAME.orbital_choices[ante].Small = pseudorandom_element(hands, pseudoseed('orbital'))[0];
  const random_tag = new Tag(random_tag_key, false, 'Small');
  G.STATE_COMPLETE = false;
  emit('blind_tags', { Small: rr.blind_tags.Small, Big: rr.blind_tags.Big });
  G.E_MANAGER.add_event(() => add_tag(random_tag));
}
const booster_slots = () => reduceHook('booster_limit', 2 + (G.GAME.modifiers.extra_boosters || 0));
/** 4D Boosters (my_reroll_shop): reroll the packs too, each $3 dearer. */
function reroll_boosters(num, price_mod) {
  G.E_MANAGER.add_event(() => {
    if (!(G.GAME.current_round && G.GAME.current_round.used_packs && G.shop_booster && G.shop_booster.cards)) return;
    for (const c of G.shop_booster.cards.slice().reverse()) { G.shop_booster.remove_card(c); c.remove(); }
    play_sound('coin2');
    play_sound('other1');
    const n = num - G.shop_booster.cards.length; // (a Lua for-limit is evaluated once)
    for (let i = 1; i <= n; i++) {
      G.GAME.current_round.used_packs = G.GAME.current_round.used_packs || {};
      G.GAME.current_round.used_packs[i] = get_pack('shop_pack').key;
      const card = new Card(P_CARDS.empty, P_CENTERS[G.GAME.current_round.used_packs[i]], { bypass_discovery_center: true, bypass_discovery_ui: true });
      card.cost = card.cost + price_mod;
      card.ability.booster_pos = i;
      G.shop_booster.emplace(card);
    }
  });
}
/** 4D Vouchers (my_reroll_shop_voucher): reroll the shop's vouchers too, each $2 dearer. */
function reroll_vouchers(price_mod) {
  G.E_MANAGER.add_event(() => {
    if (!(G.shop_vouchers && G.shop_vouchers.cards)) return;
    for (const c of G.shop_vouchers.cards.slice().reverse()) { G.shop_vouchers.remove_card(c); c.remove(); }
    play_sound('coin2');
    play_sound('other1');
    // SMODS.get_next_vouchers(): the round's voucher plus one per extra voucher slot.
    const n = 1 + Math.max(0, G.GAME.modifiers.extra_vouchers || 0);
    const keys = [];
    for (let i = 0; i < n; i++) {
      const key = get_next_voucher_key();
      keys.push(key);
      if (key && P_CENTERS[key]) {
        const card = new Card(P_CARDS.empty, P_CENTERS[key], { bypass_discovery_center: true, bypass_discovery_ui: true });
        card.shop_voucher = true;
        if (i > 0) card.extra_voucher = true;
        card.cost = card.cost + price_mod;
        G.shop_vouchers.emplace(card);
      }
    }
    G.GAME.current_round.voucher = keys[0];
    G.GAME.current_round.extra_vouchers = keys.slice(1);
    G.shop_vouchers.config.card_limit = Math.max(1, G.shop_vouchers.cards.length);
  });
}
export function after_reroll_shop() {
  if (used('4d_boosters')) reroll_boosters(booster_slots(), vcfg('4d_boosters').extra);
  if (used('4d_vouchers')) reroll_vouchers(vcfg('4d_vouchers').extra);
  if (used('reroll_aisle')) G.E_MANAGER.add_event(() => { bargain_aisle_effect(); clearance_aisle_effect(); });
}
/** Bargain / Clearance Aisle (lovely: after the shop's shop_final_pass tags). */
export function shop_stocked() {
  if (used('bargain_aisle')) bargain_aisle_effect();
  if (used('clearance_aisle')) clearance_aisle_effect();
}

// ----------------------------------------------------------------- money / scoring rules
/** Round Up / Round Up Plus (mod_chips / mod_mult wraps). */
export const round_up_chips = (c) => (used('round_up') ? Math.ceil(c / 10) * 10 : undefined);
export const round_up_mult = (m) => (used('round_up_plus') ? Math.ceil(m / 10) * 10 : undefined);
/** Gold Round Up (ease_dollars wrap): your money always lands on an even number. */
export function gold_round_up(mod) {
  if (!used('gold_round_up') || !mod) return undefined;
  const original = G.GAME.dollars + mod;
  let nw = Math.ceil(original);
  if (((nw % 2) + 2) % 2 === 1) nw = nw + 1;
  return mod + (nw - original);
}
/** Collector (get_blind_amount wrap): -4% Blind requirement per voucher redeemed (multiplicative). */
export function collector_amount(amount) {
  if (!used('collector')) return undefined;
  return amount * Math.pow(1 - vcfg('collector').extra / 100, G.GAME.vouchers_bought || 0);
}
/** Rich Boss / Richer Boss: the boss blind's extra reward ($8, + $4 per ante). */
export function rich_boss_bonus(ante_mod) {
  let ans = 0;
  if (used('rich_boss')) ans += vcfg('rich_boss').extra;
  if (used('richer_boss')) ans += vcfg('richer_boss').extra * (G.GAME.round_resets.ante + (ante_mod || 0));
  return ans;
}
/** G.FUNCS.evaluate_round wraps (Lua order: Deep Roots, Money Target, Rich Boss); returns the undo. */
export function evaluate_round_pre() {
  const undo = [];
  // Deep Roots: interest on the absolute value of your money
  if (used('deep_roots') && G.GAME.dollars < 0) {
    G.GAME.dollars = -G.GAME.dollars;
    undo.push(() => { G.GAME.dollars = -G.GAME.dollars; });
  }
  // Money Target: double interest when your money is a multiple of 5 (restored at cash out, with any
  // change jokers made meanwhile — here the round is evaluated synchronously, so right after)
  G.GAME.interest_amount_ref = G.GAME.interest_amount;
  G.GAME.v_money_target_triggered = false;
  if (used('money_target') && G.GAME.dollars % 5 === 0) {
    G.GAME.v_money_target_triggered = true;
    G.GAME.interest_amount = G.GAME.interest_amount * vcfg('money_target').extra;
    undo.push(() => {
      const delta = G.GAME.interest_amount - G.GAME.interest_amount_ref * vcfg('money_target').extra;
      G.GAME.interest_amount = G.GAME.interest_amount_ref + delta;
    });
  }
  // Rich / Richer Boss
  if (G.GAME.blind && G.GAME.blind.get_type() === 'Boss') {
    const bonus = rich_boss_bonus(-1); // (the ante has already gone up)
    if (bonus) { G.GAME.blind.dollars = G.GAME.blind.dollars + bonus; undo.push(() => { G.GAME.blind.dollars = G.GAME.blind.dollars - bonus; }); }
  }
  return undo.length ? () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); } : undefined;
}
/** Garbage Bag / Handbag: unused discards / hands carry over (lovely patches on cash_out / new_round). */
export function round_counts(when, where) {
  const cr = G.GAME.current_round;
  if (where === 'cash_out' && when === 'before') {
    if (used('garbage_bag')) G.GAME.betmma_discards_left_ref = cr.discards_left || 0;
    if (used('handbag')) G.GAME.betmma_hands_left_ref = cr.hands_left || 0;
  } else if (when === 'after') {
    if (used('garbage_bag')) cr.discards_left = cr.discards_left + (G.GAME.betmma_discards_left_ref || 0);
    if (used('handbag')) cr.hands_left = cr.hands_left + (G.GAME.betmma_hands_left_ref || 0);
  }
}
/** Gravity Assist / Gravitational Wave (level_up_hand wrap). */
let gravity_rep = false;
export function gravity_after_level_up(card, hand, amount) {
  if (!(used('gravity_assist') || used('gravitational_wave')) || gravity_rep) return;
  gravity_rep = true;
  try {
    let last = null, nxt = null, find = false;
    for (const k of HANDLIST) {
      const v = G.GAME.hands[k];
      if (find && v.visible) { nxt = k; break; }
      if (k === hand) find = true;
      if (!find && v.visible) last = k;
    }
    if (used('gravity_assist')) {
      if (last !== null) level_up_hand(card, last, true, amount);
      if (nxt !== null) level_up_hand(card, nxt, true, amount);
    }
    if (used('gravitational_wave')) {
      for (const k of HANDLIST) {
        if (k !== hand && k !== last && k !== nxt && G.GAME.hands[k]) level_up_hand(card, k, true, (amount ?? 1) * vcfg('gravitational_wave').extra);
      }
    }
  } finally { gravity_rep = false; }
  const h = G.GAME.hands[hand];
  emit('hand_text', { handname: localize(hand, 'poker_hands'), chips: h.chips, mult: h.mult, level: h.level });
}

// ----------------------------------------------------------------- cards
/** Omnicard (lovely): Wild Cards retrigger once. Mirror / Real Random: queued temp retriggers. */
export const OVER_RETRIGGER_LIMIT = 50;
const is_wild = (card) => card.ability.name === 'Wild Card' || quantum_enhancements(card).includes('m_wild');
export function own_repetitions(card) {
  const out = [];
  if (used('omnicard') && is_wild(card)) out.push({ message: localize('k_again_ex'), repetitions: 1, card });
  card.ability.over_retriggered_ratio = 1;
  if (card.ability.temp_repetition && card.ability.temp_repetition > 0) {
    const tr = { message: localize('k_again_ex'), repetitions: card.ability.temp_repetition, card };
    if (tr.repetitions > OVER_RETRIGGER_LIMIT) {
      card.ability.over_retriggered_ratio = tr.repetitions / OVER_RETRIGGER_LIMIT;
      tr.repetitions = OVER_RETRIGGER_LIMIT;
      say(card, dict('over_retriggered') + String(card.ability.over_retriggered_ratio));
    }
    card.ability.temp_repetition = 0;
    out.push(tr);
  }
  return out.length ? out : undefined;
}
/** Mirror (lovely: main scoring on played cards): a scoring Steel Card retriggers the card to its right. */
export function mirror_main_scoring(card) {
  if (!used('mirror')) return;
  if (!(card.ability.name === 'Steel Card' || quantum_enhancements(card).includes('m_steel'))) return;
  const index = G.play.cards.indexOf(card);
  if (index >= 0 && index < G.play.cards.length - 1) {
    const right = G.play.cards[index + 1];
    right.ability.temp_repetition = (right.ability.temp_repetition || 0) + 1;
  }
}
/** Echo Wall / Echo Chamber: a card's end-of-round effect (Gold Card money, Blue Seal planet) fires. */
export function end_of_round_money(card) {
  const eor = card.get_end_of_round_effect();
  return eor && eor.h_dollars ? eor.h_dollars : 0;
}
/** Bulletproof (Card:shatter wrap): a breaking Glass Card loses X0.1 instead, until it would reach X1.5. */
export function bulletproof_saves(card) {
  if (!used('bulletproof') || card.ability.name !== 'Glass Card') return false;
  const e = vcfg('bulletproof').extra;
  if (!(card.ability.x_mult - e.lose > e.lower_bound)) return false;
  card.ability.breaking_count = (card.ability.breaking_count || 0) + 1;
  card.ability.x_mult = Math.round((card.ability.x_mult - e.lose) * 1e9) / 1e9;
  card.shattered = false;
  card.destroyed = false;
  say(card, dict('k_bulletproof'));
  say(card, localize({ type: 'variable', key: 'a_xmult_minus', vars: [e.lose] }), 'RED');
  emit('juice', { card: card.sort_id });
  return true;
}
/** Gilded Glider (get_end_of_round_effect wrap): a paying Gold Card passes its enhancement right. */
export function gilded_glider(card) {
  if (!used('gilded_glider') || card.config.center_key !== 'm_gold') return;
  const index = G.hand.cards.indexOf(card);
  if (index >= 0 && index < G.hand.cards.length - 1) {
    const right = G.hand.cards[index + 1];
    if (right.config.center_key === 'c_base') {
      card.set_ability(P_CENTERS.c_base, null, true);
      right.set_ability(P_CENTERS.m_gold, null, true);
    }
  }
}
/** Darkness (poll_edition wrap): Negative 4X more often — a first poll at X3, then the normal one. */
let darkness_busy = false;
export function darkness_poll(_key, _mod, _no_neg, _guaranteed) {
  if (!used('darkness') || darkness_busy) return undefined;
  _mod = _mod || 1;
  darkness_busy = true;
  try {
    const first = poll_edition(_key, _mod * (vcfg('darkness').extra - 1), _no_neg, _guaranteed);
    if (first && first.negative) return first;
    return poll_edition(_key, _mod, _no_neg, _guaranteed);
  } finally { darkness_busy = false; }
}
/** Eternity / Bobby Pin / Heat Death (create_card wraps, Lua order). */
export function shop_joker_stickers(card, _type, area, key_append) {
  if (_type !== 'Joker' || !(area === G.shop_jokers || area === G.pack_cards)) return;
  if (used('eternity') && card.ability.eternal && pseudorandom('eternity') < 1 / vcfg('eternity').extra) card.set_edition({ negative: true });
  if (G.GAME.modifiers.cry_enable_pinned_in_shop && pseudorandom('cry_pin' + (key_append || '') + G.GAME.round_resets.ante) > 0.7) card.pinned = true;
  if (G.GAME.modifiers.cry_eternal_perishable_compat) {
    if (card.ability.eternal && !card.ability.perishable && pseudorandom('cry_per' + (key_append || '') + G.GAME.round_resets.ante) > 0.7) {
      card.ability.perishable = true;
      card.ability.perish_tally = G.GAME.perishable_rounds;
    }
    if (!card.ability.eternal && card.ability.perishable && pseudorandom('cry_per' + (key_append || '') + G.GAME.round_resets.ante) > 0.7) card.ability.eternal = true;
  }
}
/** Heat Death (Card:set_debuff wrap): an Eternal joker perishing gives +1 Joker slot (once). */
export function heat_death_check(card) {
  if (card.ability.perishable && (card.ability.perish_tally ?? 1) <= 0 && card.ability.eternal && used('heat_death') && !card.ability.heat_deathed) {
    card.ability.heat_deathed = true;
    say(card, dict('k_heat_death'), 'FILTER');
    G.jokers.config.card_limit = G.jokers.config.card_limit + vcfg('heat_death').extra;
  }
}
/** Stow / Stash: leftmost (rows full) / rightmost (<=1 empty slot) joker is debuffed. */
export function is_hidden(joker) {
  if (!(G && G.jokers && G.jokers.cards)) return false;
  const index = G.jokers.cards.indexOf(joker) + 1;
  if (index <= 0) return false;
  return (index === 1 && used('stow') && G.jokers.cards.length >= G.jokers.config.card_limit) ||
    (index === G.jokers.cards.length && used('stash') && G.jokers.cards.length + 1 >= G.jokers.config.card_limit);
}
/** Card:update's re-check (per frame in Lua; here after every action and joker-row change). */
export function refresh_hidden() {
  if (!(used('stow') || used('stash')) || !G.jokers || !G.GAME.blind) return;
  for (const j of G.jokers.cards.slice()) if (!j.debuff !== !is_hidden(j)) G.GAME.blind.debuff_card(j);
}
/** Half-life / Debt Burden (Card:add_to_deck / remove_from_deck wraps). */
export function deck_change(card, sign) {
  if (card.ability.consumeable) return;
  if (card.ability.perishable && used('half_life')) G.jokers.config.card_limit = G.jokers.config.card_limit + sign * vcfg('half_life').extra;
  if (card.ability.rental && used('debt_burden')) G.GAME.bankrupt_at = G.GAME.bankrupt_at - sign * vcfg('debt_burden').extra;
}

// ----------------------------------------------------------------- shop purchases
/** Double Planet / Cryptozoology (G.FUNCS.buy_from_shop wraps). */
export function after_buy(c1, use, check_for_buy_space) {
  if (c1.ability.consumeable && c1.config.center.set === 'Planet' && used('double_planet') &&
      G.consumeables.cards.length + G.GAME.consumeable_buffer + (use ? 0 : 1) < G.consumeables.config.card_limit) {
    randomly_create_planet('v_double_planet', 'Double Planet!', null);
  }
  if (c1.ability.set === 'Joker' && check_for_buy_space(c1) && used('cryptozoology') && pseudorandom('cryptozoology') * 100 < vcfg('cryptozoology').extra) {
    c1.set_edition('e_betmma_tentacle');
  }
}
/** Engulfer (G.FUNCS.use_card wrap): using a Planet may make a Black Hole. */
export function before_use_card(card) {
  if (card.ability.consumeable && card.ability.set === 'Planet' && used('engulfer') && pseudorandom('engulfer') < G.GAME.probabilities.normal / vcfg('engulfer').extra) {
    create_black_hole(dict('k_engulfer_generate'));
  }
}
/** Event Horizon (Card:open wrap): opening a Celestial Pack may make a Black Hole. */
export function on_open_booster(booster) {
  if (booster.ability.set === 'Booster' && String(booster.ability.name).includes('Celestial') && used('event_horizon') &&
      pseudorandom('event_horizon') < G.GAME.probabilities.normal / vcfg('event_horizon').extra) {
    create_black_hole(dict('k_event_horizon_generate'));
  }
}
/** Solar System (Card:use_consumeable wrap): a used Planet triggers again once, +1 per Planet held. */
export function solar_system(card, area, copier) {
  if (!used('solar_system') || !(card.ability && card.ability.set === 'Planet') || card.solar_system_retriggered) return;
  G.betmma_solar_system_times = 1;
  card.solar_system_retriggered = true;
  try {
    say(card, dict('k_solar_system'));
    card.use_consumeable(area, copier); // the extra one for "including the one being used"
    for (const c of G.consumeables.cards.slice()) {
      if (c.ability && c.ability.set === 'Planet') {
        G.betmma_solar_system_times = G.betmma_solar_system_times + 1;
        say(c, dict('k_solar_system'));
        card.use_consumeable(area, copier);
      }
    }
  } finally {
    card.solar_system_retriggered = false;
    G.betmma_solar_system_times = null;
  }
}

// ----------------------------------------------------------------- Forbidden Area
/** G.FUNCS.check_for_buy_space wrap: a consumable with no consumable slot left goes to the joker row. */
export function forbidden_buy_space(card) {
  if (!used('forbidden_area') || !card.ability.consumeable) return undefined;
  const neg = card.edition && card.edition.negative ? 1 : 0;
  if (!(G.consumeables.cards.length < G.consumeables.config.card_limit + neg) && G.jokers.cards.length < G.jokers.config.card_limit + neg) {
    card.betmma_forbidden_area_bought = true;
    return true;
  }
  return undefined;
}
/** Where a bought consumable lands (lovely patch on buy_from_shop's G.consumeables:emplace). */
export function forbidden_buy_area(card) {
  if (!card.ability.consumeable || !card.betmma_forbidden_area_bought) return undefined;
  const neg = card.edition && card.edition.negative ? 1 : 0;
  return !(G.consumeables.cards.length < G.consumeables.config.card_limit + neg) ? G.jokers : undefined;
}
/** Before a hand is played, every consumable in the joker row is used on it (and kept). */
export function forbidden_area_pre_play() {
  if (!used('forbidden_area')) return true;
  const marked = G.hand.highlighted.slice();
  for (let i = 0; i < G.jokers.cards.length; i++) {
    const self = G.jokers.cards[i];
    if (!self || !self.ability.consumeable || self.debuff) continue;
    const cons = self.ability.consumeable;
    const max_highlighted = cons.max_highlighted, mod_num = cons.mod_num;
    if (max_highlighted) { cons.max_highlighted = G.hand.config.card_limit; cons.mod_num = G.hand.config.card_limit; }
    let usedIt = false;
    try {
      if (self.can_use_consumeable(null, true)) {
        self.keep_on_use = true;
        try { use_card(self); G.E_MANAGER.flush(); } finally { delete self.keep_on_use; }
        usedIt = true;
      }
    } finally { cons.max_highlighted = max_highlighted; cons.mod_num = mod_num; }
    // restore_highlighted_cards: re-select the marked cards that are still in hand
    let count = 1;
    if (usedIt) {
      count = 0;
      for (const c of G.hand.cards) {
        if (marked.includes(c) && !c.highlighted) G.hand.add_to_highlighted(c);
        if (c.highlighted) count++;
      }
    }
    if (count <= 0) return false; // nothing left to play (the Lua stops here too)
  }
  return true;
}

// ----------------------------------------------------------------- Flipped Card / Double Flipped Card
export function flip_allowed() {
  return (used('flipped_card') || used('double_flipped_card')) && G.STATE === STATES.SELECTING_HAND &&
    G.hand.highlighted.length > 0 && G.hand.highlighted.length <= vcfg('flipped_card').extra &&
    (G.GAME.current_round.flips_left ?? 1) > 0;
}
export function do_flip() {
  for (const c of G.hand.highlighted) c.flip();
  G.GAME.current_round.flips_left = (G.GAME.current_round.flips_left ?? 1) - 1;
}
/** G.FUNCS.play_cards_from_highlighted wrap: remember which played cards were face down. */
export function flipped_pre_play() {
  for (const c of G.hand.highlighted) c.facing_ref = c.facing;
  G.GAME.current_round.flips_left = 1;
}
/** Flipped Card (G.FUNCS.draw_from_play_to_discard wrap): flipped cards go back to your hand. */
export function flipped_return_to_hand() {
  if (!(used('flipped_card') && !used('double_flipped_card'))) return;
  for (const v of G.play.cards.slice()) {
    if (v.facing_ref === 'back' && !v.shattered && !v.destroyed && !v.debuff) {
      G.play.remove_card(v);
      G.hand.emplace(v);
      v.facing_ref = v.facing;
    }
  }
}
/** Double Flipped Card (lovely, after the played cards score): flipped cards are held in hand at once. */
export function double_flipped_after_play_scoring() {
  if (!used('double_flipped_card')) return;
  for (const card of G.play.cards.slice()) {
    if ((card.ability.set === 'Default' || card.ability.set === 'Enhanced') && card.facing_ref === 'back' && !card.shattered && !card.destroyed) {
      G.play.remove_card(card);
      G.hand.emplace(card);
      card.facing_ref = card.facing;
    }
  }
}

// ----------------------------------------------------------------- Trash Picker / Slate / Recycle Area / Vanish Magic
export const trash_picker_can_discard = () => (used('trash_picker') && G.GAME.current_round.discards_left <= 0 && G.hand.highlighted.length > 0 && G.GAME.current_round.hands_left > 1) || undefined;
export function trash_picker_after_discard(hook) {
  // (ease_discard(-1) is queued, so this still reads the discards left before this discard)
  if (!hook && used('trash_picker') && G.GAME.current_round.discards_left <= 0) ease_hands_played(-1);
}
const stones_highlighted = (area) => area.highlighted.filter((c) => c.ability.name === 'Stone Card').length;
/** Slate: Stone Cards don't count toward the 5 selected / played cards. */
export function slate_highlight_limit(limit, area, card) {
  if (!used('slate') || ['shop', 'joker', 'consumeable'].includes(area.config.type)) return undefined;
  if (card && card.ability.name === 'Stone Card') return Infinity;
  return limit + stones_highlighted(area);
}
export function slate_selection_limit(n) {
  if (!used('slate')) return undefined;
  return Math.max(n, 5 + stones_highlighted(G.hand));
}
export function recycle_allowed() {
  return used('recycle_area') && (G.STATE === STATES.TAROT_PACK || G.STATE === STATES.SPECTRAL_PACK) &&
    !G.GAME.betmma_recycled && G.hand.cards.length > 0 && G.deck.cards.length > 0;
}
/** G.FUNCS.discard_booster: discard your hand and draw a new one (once per pack). */
export function discard_booster() {
  G.GAME.betmma_recycled = true;
  G.E_MANAGER.add_event(() => { for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.discard.emplace(c); } });
  G.E_MANAGER.add_event(() => {
    const hand_space = Math.min(G.deck.cards.length, G.hand.config.card_limit);
    for (let i = 1; i <= hand_space; i++) G.hand.draw_card_from(G.deck);
    G.hand.sort();
  });
  G.E_MANAGER.add_event(() => { const n = G.discard.cards.length; for (let i = 0; i < n; i++) G.deck.draw_card_from(G.discard); });
}
export const vanish_allowed = (card) => used('vanish_magic') && G.STATE === STATES.SHOP && card.area === G.shop_jokers && (card.ability.set === 'Default' || card.ability.set === 'Enhanced');
export function vanish(card) {
  card.start_dissolve();
  ease_dollars(vcfg('vanish_magic').extra);
}
/** Reserve Area / Reserve Area Plus: which opened packs let you keep a card instead of using it. */
export function can_reserve(card) {
  const pc = G.GAME.pack_center && P_CENTERS[G.GAME.pack_center];
  const name = pc ? String(pc.name) : '';
  if (!card.ability.consumeable) return undefined;
  if ((name.includes('Arcana') && used('reserve_area')) || (name.includes('Spectral') && used('reserve_area_plus'))) return true;
  return undefined;
}
/** Forbidden Area: with no consumable slot left, a reserved card goes to the joker row. */
export function reserve_overflow() {
  if (used('forbidden_area') && G.jokers.cards.length < G.jokers.config.card_limit) return G.jokers;
  return undefined;
}

// ----------------------------------------------------------------- centers
export function voucher_centers(layout, atlas, mod_option_for) {
  const out = [];
  let order = 1;
  for (const [id, d] of Object.entries(VOUCHER_DATA)) {
    const config = JSON.parse(JSON.stringify(d.config));
    if (d.requires && d.requires.length > 1 && !config.weight) config.weight = FUSION_VOUCHER_WEIGHT;
    const lv = LOC_VARS[id];
    const c = {
      key: VK(id), set: 'Voucher', name: d.name, order: 5000 + order++, cost: d.cost, config, available: true,
      atlas, pos: layout.vouchers[id],
      loc_vars: (center, iq, card) => ({ vars: lv ? lv(center, iq, card) : [] }),
    };
    if (d.requires) c.requires = d.requires.slice();
    if (REDEEM[id]) c.redeem = (center, card) => REDEEM[id](center, card);
    else c.redeem = () => {};
    Object.defineProperty(c, 'mod_option', { enumerable: true, configurable: true, get: () => mod_option_for(id) });
    out.push(c);
  }
  return out;
}
export const VOUCHER_IDS = Object.keys(VOUCHER_DATA);
