// AutumnMoodMechanics — the AMM API, rebuilt natively for Micatro (no Steamodded layer). Other mods import it
// (Þe Autumn Circus does) exactly like the Lua mods reach `AMM.*` / `AMM.api.*`:
//
//   suit levels      level_up_suit / ascend_suit, G.GAME.amm_data.suit_levels (amm.lua)
//   combining        combine_cards (amm.lua)
//   helpers          destroy_random_jokers, mod_blind (amm.lua)
//   graveyard        GRAVEYARD.* (api/Graveyard.lua: get/count/filter...), move_to_graveyard,
//                    move_from_graveyard, remove_from_game, should_graveyard
//   aspects          registerAspects, set_aspect / get_aspect / calculate_aspect (api/Aspect.lua)
//   stamps           joker "seals" of set 'Stamp' (api/Stamps.lua) — registered by a mod as content.seals
//                    with set:'Stamp'; their apply / unapply / deck_add / deck_remove / calculate run here
//   bottles          card.bottle: always on top of the deck after a shuffle (api/Bottle.lua)
//   petting          the amm_pet_card context (api/Petting.lua) — fired by the 'amm_pet' action
//   card qualities   QUALITIES.has / random / create / localize (api/CardQualities.lua)
//   unscored perma   perma_u_chips / perma_u_mult / perma_u_x_chips / perma_u_x_mult (amm.lua, lovely)
//
// Everything is a no-op while autumnmood isn't active for the run (hooks only run for active mods).
import * as BN from '../../js/engine/bignum.js'; // big-number scoring (modded runs past 1e308)
import { isActive, feature, MOD_SUITS, activeModSuits } from '../../js/mods/registry.js';
import {
  G, P_CENTERS, P_CARDS, P_SEALS, P_CENTER_POOLS, Card, CardArea, emit, card_eval_status_text, play_sound, juice_card,
  pseudorandom, pseudoseed, pseudorandom_element, pseudoshuffle, copy_card, create_playing_card, poll_edition,
  localize, number_format, quantum_enhancements,
} from '../../js/engine/core.js';
import { calculate_context, smods_effect } from '../../js/engine/run.js';
import { playing_card_joker_effects } from '../../js/engine/jokers.js';

export const MOD_ID = 'autumnmood';
export const ART = '/micatro/mods/autumnmood/assets/2x/';
export const on = () => isActive(MOD_ID);

// ------------------------------------------------------------------ SMODS helpers
/** SMODS.has_no_suit / has_no_rank / has_any_suit / has_enhancement. */
export const has_no_suit = (card) => !!(card.config.center.no_suit || card.ability.effect === 'Stone Card');
export const has_no_rank = (card) => !!(card.config.center.no_rank || card.ability.effect === 'Stone Card');
export const has_enhancement = (card, key) => card.config.center.key === key || (G.jokers ? quantum_enhancements(card).includes(key) : false);
export const has_any_suit = (card) => has_enhancement(card, 'm_wild') || !!card.config.center.any_suit;
/** SMODS.Suit.obj_buffer: Diamonds, Clubs, Hearts, Spades, then the active mod suits (registration order). */
export function suit_buffer() { return ['Diamonds', 'Clubs', 'Hearts', 'Spades', ...activeModSuits().map((s) => s.key)]; }
/** SMODS.multiplicative_stacking(base, perma): base (0 -> 1) times (1 + perma); 1 -> 0 (no effect). */
export function multiplicative_stacking(base, perma) {
  base = base !== 0 && base !== undefined ? base : 1;
  perma = perma ? perma + 1 : 1;
  const r = base * perma;
  return r === 1 ? 0 : r;
}
const say = (card, message, colour) => card_eval_status_text(card, 'extra', null, null, null, { message, colour });

// ===================================================================== config
/** AMM.config (amm.lua): a suit level is worth +5 Chips and +1 Mult. */
export const CONFIG = { suit_levels: { chips: 5, mult: 1, asc: 1 } };

// ================================================================= suit levels
/** Game:init_game_object: every suit starts at level 1 (+0 / +0). */
export function init_suit_levels(GAME) {
  GAME.amm_data = GAME.amm_data || { suit_levels: {} };
  for (const suit of suit_buffer()) GAME.amm_data.suit_levels[suit] = { level: 1, mult: 0, chips: 0, asc: 0 };
}
/** AMM.level_up_suit(card, suit, instant, amount): like level_up_hand, for a suit. */
export function level_up_suit(card, suit, instant, amount) {
  amount = amount === undefined ? 1 : amount;
  const sl = G.GAME.amm_data.suit_levels[suit];
  if (!sl) return;
  sl.level = Math.max(0, sl.level + amount);
  // (GrabBag's Eyes suit swaps chips and mult; no such suit in Micatro)
  sl.mult = Math.max(CONFIG.suit_levels.mult * (sl.level - 1), 0);
  sl.chips = Math.max(CONFIG.suit_levels.chips * (sl.level - 1), 0);
  emit('suit_level_up', { suit, name: localize_suit(suit), level: sl.level, chips: sl.chips, mult: sl.mult, card: card && card.sort_id, instant: !!instant });
  if (!instant) play_sound('tarot1');
}
/** AMM.ascend_suit: only Entropy reads ascension power, but the number is kept. */
export function ascend_suit(card, suit, instant, amount) {
  amount = amount === undefined ? 1 : amount;
  const sl = G.GAME.amm_data.suit_levels[suit];
  if (sl) sl.asc = Math.max(0, sl.asc + amount);
}
export function localize_suit(suit) {
  const m = { Spades: 'Spades', Hearts: 'Hearts', Clubs: 'Clubs', Diamonds: 'Diamonds' };
  return m[suit] || (MOD_SUITS[suit] && (MOD_SUITS[suit].name || MOD_SUITS[suit].key)) || suit;
}
/** count_deck_suits(): cards of each suit in the deck (Stone Cards don't count). */
export function count_deck_suits() {
  const t = {};
  for (const v of G.playing_cards) if (v.ability.name !== 'Stone Card') t[v.base.suit] = (t[v.base.suit] || 0) + 1;
  return t;
}
/** The Run Info "Suits" rows (create_UIBox_current_suits): suits with cards in the deck or above level 1. */
export function suit_rows() {
  const counts = count_deck_suits();
  const rows = [];
  const buf = suit_buffer();
  for (let i = buf.length - 1; i >= 0; i--) {
    const s = buf[i], sl = G.GAME.amm_data.suit_levels[s];
    if (!sl) continue;
    const count = counts[s] || 0;
    if (count > 0 || sl.level > 1) rows.push({ suit: s, name: localize_suit(s), level: sl.level, chips: sl.chips, mult: sl.mult, asc: sl.asc, count });
  }
  return rows;
}

// ================================================================ destroy etc.
/**
 * AMM.destroy_random_jokers(cards, amt): destroy `amt` random non-Eternal jokers, the debuffed / Perishable /
 * Rental ones first (they're shuffled to the end of the list, which is destroyed from the end).
 */
export function destroy_random_jokers(cards, amt) {
  const destroyable = [], priority = [];
  for (const v of cards) {
    if (v.ability.eternal) continue;
    if (v.ability.rental || v.ability.perishable || v.ability.perma_debuff) priority.push(v); else destroyable.push(v);
  }
  pseudoshuffle(destroyable, pseudoseed('AMM_drj'));
  pseudoshuffle(priority, pseudoseed('AMM_drj'));
  for (const n of priority) destroyable.push(n);
  if (!destroyable.length) return;
  const size = Math.max(destroyable.length - amt, 0) + 1;
  for (let i = destroyable.length; i >= size; i--) {
    const c = destroyable[i - 1];
    G.E_MANAGER.add_event(() => { c.start_dissolve(); });
  }
}
/**
 * AMM.mod_blind(val, silent, percent_val, allow_end): the blind's requirement becomes floor(chips * val)
 * (percent) or floor(chips + val); allow_end ends the round if the score already beats it.
 */
export function mod_blind(val, silent, percent_val, allow_end) {
  const b = G.GAME.blind;
  if (!b) return;
  b.chips = percent_val ? BN.floor(BN.mul(b.chips, val)) : BN.floor(BN.add(b.chips, val));
  b.chip_text = number_format(b.chips);
  emit('blind', { action: 'chips', key: b.config && b.config.blind && b.config.blind.key, chips: b.chips, chip_text: b.chip_text });
  emit('blind_juice', {});
  if (!silent) play_sound('chips2');
  if (allow_end && BN.beats(G.GAME.chips, b.chips)) { G.STATE = G.STATES.NEW_ROUND; G.STATE_COMPLETE = false; }
}

// ================================================================== aspects
/** Registered aspects (AMM.Aspects), by key ('thac_heart'). Each carries `mod` (its owner). */
export const ASPECTS = {};
/** AMM.Aspect{...}: a mod registers aspects (keys already prefixed: 'thac_heart'). */
export function registerAspects(mod, list) {
  for (const a of list) { a.mod = mod; a.set = 'Aspect'; ASPECTS[a.key] = a; }
}
/** The active aspects (G.P_CENTER_POOLS.Aspect), in registration order. */
export const active_aspects = () => Object.values(ASPECTS).filter((a) => isActive(a.mod));
/** Card:set_aspect(_aspect, silent, immediate) */
export function set_aspect(card, aspect, silent) {
  card.aspect = aspect || undefined;
  if (aspect && !silent) { juice_card(card); play_sound('gold_seal', 0.612, 0.413); }
  emit('card_changed', { card: card.sort_id });
  card.set_cost();
}
/** Card:get_aspect(bypass_debuff) */
export const get_aspect = (card, bypass_debuff) => ((card.debuff && !bypass_debuff) ? undefined : card.aspect);
/** Card:calculate_aspect(context) -> the aspect's effect ({card = self} filled in) or undefined. */
export function calculate_aspect(card, context) {
  const obj = card.aspect && ASPECTS[card.aspect];
  if (!obj || !obj.calculate || !isActive(obj.mod)) return undefined;
  const o = obj.calculate(obj, card, context);
  if (o) { if (!o.card) o.card = card; return o; }
  return undefined;
}
/** SMODS: a debuffed playing card doesn't calculate (can_calculate). */
const can_calc = (card) => !card.debuff;
/** Every playing card in play / in hand gets an SMODS context (calculate_context's playing-card areas). */
function aspects_in_context(context, opts = {}) {
  if (!G.play || !G.hand) return;
  const sh = context.scoring_hand || [];
  const unscored_on = feature('unscored');
  for (const area of [G.play, G.hand]) {
    for (const c of area.cards.slice()) {
      if (!c.aspect || !can_calc(c)) continue;
      const cardarea = area === G.play ? (sh.includes(c) || !unscored_on ? G.play : 'unscored') : area;
      const eff = calculate_aspect(c, { ...context, cardarea });
      if (eff) smods_effect(eff, c);
    }
  }
  void opts;
}

// =================================================================== stamps
/** A seal / stamp object (G.P_SEALS[key]) of an ACTIVE mod. */
const seal_obj = (key) => { const s = key && P_SEALS[key]; return s && s.mod && isActive(s.mod) ? s : null; };
export const is_stamp = (key) => { const s = seal_obj(key); return !!(s && s.set === 'Stamp'); };
/** The active stamps (G.P_CENTER_POOLS.Stamp). */
export const active_stamps = () => (P_CENTER_POOLS.Stamp || []).slice();
/** A joker's stamp calculating in `context` (debuffed jokers don't). -> effect or undefined. */
export function calculate_stamp(joker, context) {
  if (joker.debuff) return undefined;
  const s = seal_obj(joker.seal);
  if (!s || s.set !== 'Stamp' || !s.calculate) return undefined;
  const o = s.calculate(s, joker, context);
  if (o && !o.card) o.card = joker;
  return o || undefined;
}
/** Stamps on jokers (and consumables) in a non-scoring SMODS context: evaluate + resolve each effect. */
export function stamps_in_context(context) {
  for (const area of [G.jokers, G.consumeables]) {
    if (!area) continue;
    for (const j of area.cards.slice()) {
      if (!j.seal) continue;
      const eff = calculate_stamp(j, { ...context, cardarea: area });
      if (eff) smods_effect(eff, j);
    }
  }
}

// ================================================================== graveyard
export const GY = { active: true };
/** api/Graveyard.lua should_graveyard: not removed for good, not temporary. */
export function should_graveyard(card) {
  return !(card.no_graveyard || (card.edition && card.edition.gb_temporary) || card.ability.akyrs_self_destructs ||
    card.ability.crv_haunted || card.ability.temporary || card.ability.mf_temporary);
}
/** The graveyard area + list (Game:start_run). */
export function init_graveyard() {
  G.graveyard = [];
  G.graveyard_area = new CardArea('graveyard', { card_limit: 50000, type: 'graveyard' });
}
const renumber = (list) => list.forEach((v, k) => { v.playing_card = k + 1; });
/** Card:add_to_graveyard / remove_from_graveyard: the center's own callback (Soulbound). */
const center_cb = (card, name) => { const o = card.config.center; if (o && typeof o[name] === 'function') o[name](o, card); };
/** The Card:remove patch: a destroyed playing card leaves a copy in the graveyard (context amm_buried_card). */
export function on_card_removed(card) {
  if (!G.graveyard || !G.graveyard_area || !GY.active || !card.playing_card || !G.GAME || card.back === 'viewed_back') { card.no_graveyard = undefined; return; }
  if (!should_graveyard(card)) { card.no_graveyard = undefined; return; }
  if (!card.graveyard) {
    const _card = copy_card(card, null, null, G.playing_card);
    _card.graveyard = true;
    G.graveyard.push(_card);
    G.graveyard_area.emplace(_card);
    _card.playing_card = G.graveyard.length;
    emit('materialize', { card: _card.sort_id });
    center_cb(_card, 'add_to_graveyard');
    calculate_context({ amm_buried_card: true, other_card: _card });
  } else {
    const i = G.graveyard.indexOf(card);
    if (i >= 0) G.graveyard.splice(i, 1);
    renumber(G.graveyard);
  }
  card.no_graveyard = undefined;
}
/** Card:move_to_graveyard(): out of the deck and into the graveyard without being destroyed. */
export function move_to_graveyard(card) {
  const i = G.playing_cards.indexOf(card);
  if (i >= 0) G.playing_cards.splice(i, 1);
  renumber(G.playing_cards);
  if (card.area) card.area.remove_card(card);
  card.graveyard = true;
  G.graveyard.push(card);
  card.playing_card = G.graveyard.length;
  G.graveyard_area.emplace(card);
  center_cb(card, 'add_to_graveyard');
  calculate_context({ amm_buried_card: true, other_card: card });
}
/** Card:move_from_graveyard(specific_area): back into play (G.hand by default — the Lua's always_to_deck is never set). */
export function move_from_graveyard(card, specific_area) {
  if (!card.graveyard) return;
  G.graveyard_area.remove_card(card);
  const i = G.graveyard.indexOf(card);
  if (i >= 0) G.graveyard.splice(i, 1);
  renumber(G.graveyard);
  card.graveyard = false;
  G.deck.config.card_limit += 1;
  (specific_area || G.hand || G.deck).emplace(card);
  center_cb(card, 'remove_from_graveyard');
  G.playing_cards.push(card);
  card.playing_card = G.playing_cards.length;
}
/** Card:remove_from_game(): destroyed for good (no graveyard copy; a graveyard card leaves the graveyard). */
export function remove_from_game(card) {
  if (card.graveyard) {
    G.graveyard_area.remove_card(card);
    const i = G.graveyard.indexOf(card);
    if (i >= 0) G.graveyard.splice(i, 1);
    renumber(G.graveyard);
    card.graveyard = false;
    center_cb(card, 'remove_from_graveyard');
  }
  card.no_graveyard = true;
  card.start_dissolve();
}
/** AMM.api.graveyard (the read API). */
export const GRAVEYARD = {
  get_cards: () => (G.GAME && G.graveyard ? G.graveyard : []),
  count_cards: () => GRAVEYARD.get_cards().length,
  filter_cards: (f) => (typeof f === 'function' ? GRAVEYARD.get_cards().filter(f) : []),
  filter_count: (f) => GRAVEYARD.filter_cards(f).length,
  get_suit: (suit) => GRAVEYARD.get_cards().filter((v) => v.is_suit(suit, true)),
  count_suit: (suit) => GRAVEYARD.get_suit(suit).length,
  count_different_suits() {
    const SUITS = {};
    let suitcount = 0, wilds = 0;
    for (const v of GRAVEYARD.get_cards()) {
      if (has_no_suit(v)) continue;
      if (has_any_suit(v)) wilds++;
      else if (!SUITS[v.base.suit]) { SUITS[v.base.suit] = true; suitcount++; }
    }
    const all = suit_buffer();
    if (wilds > 0 && suitcount < all.length) {
      let hidden = 0;
      for (const k of all) { const ms = MOD_SUITS[k]; if (!SUITS[k] && ms && ms.in_pool && !ms.in_pool(ms, { rank: '' })) hidden++; }
      suitcount = Math.min(all.length - hidden, suitcount + wilds);
    }
    return suitcount;
  },
  get_rank: (rank) => GRAVEYARD.get_cards().filter((v) => v.base.value === rank && !has_no_rank(v)),
  count_rank: (rank) => GRAVEYARD.get_rank(rank).length,
  count_different_ranks() {
    const R = {};
    let n = 0;
    for (const v of GRAVEYARD.get_cards()) if (!has_no_rank(v) && !R[v.base.value]) { R[v.base.value] = true; n++; }
    return n;
  },
  get_faces: () => GRAVEYARD.get_cards().filter((v) => v.is_face()),
  count_faces: () => GRAVEYARD.get_faces().length,
  get_center: (center) => GRAVEYARD.get_cards().filter((v) => v.config.center === center || v.config.center.key === center),
  count_center: (center) => GRAVEYARD.get_center(center).length,
  get_suitless: () => GRAVEYARD.get_cards().filter(has_no_suit),
  count_suitless: () => GRAVEYARD.get_suitless().length,
  get_rankless: () => GRAVEYARD.get_cards().filter(has_no_rank),
  count_rankless: () => GRAVEYARD.get_rankless().length,
  should_graveyard,
};

// ==================================================================== bottles
/** api/Bottle.lua CardArea:shuffle: bottled cards end up on top (the end of the list is drawn first). */
export function bottle_after_shuffle(area) {
  if (!area.cards.some((c) => c.bottle)) return;
  const bottled = area.cards.filter((c) => c.bottle), other = area.cards.filter((c) => !c.bottle);
  area.cards.length = 0;
  area.cards.push(...other, ...bottled);
}

// ================================================================= combining
const PERMA_KEYS = ['perma_bonus', 'perma_mult', 'perma_x_chips', 'perma_x_mult', 'perma_h_chips', 'perma_h_mult', 'perma_h_x_chips', 'perma_h_x_mult',
  'perma_u_chips', 'perma_u_mult', 'perma_u_x_chips', 'perma_u_x_mult', 'perma_p_dollars', 'perma_h_dollars', 'akyrs_perma_score', 'akyrs_perma_h_score',
  'perma_repetitions', 'perma_e_chips', 'perma_e_mult', 'perma_h_e_chips', 'perma_h_e_mult', 'perma_balance'];
const SUIT_CODE = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
const RANK_CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
/** The P_CARDS entry for a suit + rank (mod suits too). */
export function front_of(suit, rank) {
  const sc = SUIT_CODE[suit] || (MOD_SUITS[suit] && MOD_SUITS[suit].card_key);
  return P_CARDS[sc + '_' + RANK_CODE[rank]];
}
/**
 * AMM.combine_cards(cards, pseed, area): one new playing card whose suit, rank, enhancement, seal, edition,
 * aspect and bottle are each picked from the combined cards, and whose permanent bonuses are their sum (each
 * card's rank chips too, minus the new card's own); the combined cards are REMOVED FROM GAME (no graveyard).
 * With an area the card joins the deck there (playing_card_joker_effects).
 */
export function combine_cards(cards, pseed, area) {
  const suits = [], ranks = [], enhancements = [], seals = [], editions = [], aspects = [], bottles = [];
  const perma = Object.fromEntries(PERMA_KEYS.map((k) => [k, 0]));
  for (const v of cards) {
    suits.push(v.base.suit);
    ranks.push(v.base.value);
    if (v.config.center.set === 'Enhanced') enhancements.push(v.config.center.key);
    if (v.get_seal(true)) seals.push(v.get_seal(true));
    if (v.edition) editions.push(v.edition);
    if (get_aspect(v, true)) aspects.push(get_aspect(v, true));
    if (v.bottle) bottles.push(v.bottle);
    for (const key of PERMA_KEYS) {
      if (key === 'perma_bonus') perma[key] += v.base.nominal;
      if (v.ability[key]) perma[key] += v.ability[key];
    }
  }
  const pick = (t) => (t.length ? pseudorandom_element(t, pseudoseed(pseed))[0] : undefined);
  const suit = pick(suits), rank = pick(ranks);
  const enh = pick(enhancements) || 'c_base';
  const target = area || (G.hand.cards.length > 0 ? G.hand : G.deck);
  // SMODS.create_card{set = 'Playing Card', area, suit, rank, enhancement, seal, edition}
  const new_card = new Card(front_of(suit, rank) || P_CARDS.S_A, P_CENTERS[enh], { playing_card: G.playing_card });
  const seal = pick(seals); if (seal) new_card.set_seal(seal, true);
  const ed = pick(editions); if (ed) new_card.set_edition({ [ed.type]: true }, true, true);
  const asp = pick(aspects); if (asp) set_aspect(new_card, asp, true);
  new_card.bottle = pick(bottles);
  for (const [k, v] of Object.entries(perma)) {
    new_card.ability[k] = v;
    if (k === 'perma_bonus') new_card.ability[k] = new_card.ability[k] - new_card.base.nominal;
  }
  for (let i = cards.length - 1; i >= 0; i--) remove_from_game(cards[i]);
  if (area) {
    new_card.add_to_deck();
    G.deck.config.card_limit += 1;
    G.playing_card = (G.playing_card || 0) + 1;
    new_card.playing_card = G.playing_card;
    area.emplace(new_card);
    G.playing_cards.push(new_card);
    playing_card_joker_effects([true]);
  } else void target;
  return new_card;
}

// ============================================================ unscored perma
/** Card:get_chip_u_mult / u_x_mult / u_bonus / u_x_bonus (amm.lua): bonuses a card gives when played but NOT scoring. */
export function unscored_effect(card) {
  if (card.debuff) return null;
  const a = card.ability, eff = {};
  const u_mult = (a.u_mult || 0) + (a.perma_u_mult || 0);
  if (u_mult !== 0) eff.mult = u_mult;
  const u_x_mult = multiplicative_stacking(a.u_x_mult || 1, a.perma_u_x_mult || 0);
  if (u_x_mult > 0) eff.x_mult = u_x_mult;
  const u_chips = (a.u_chips || 0) + (a.perma_u_chips || 0);
  if (u_chips !== 0) eff.chips = u_chips;
  const u_x_chips = multiplicative_stacking(a.u_x_chips || 1, a.perma_u_x_chips || 0);
  if (u_x_chips > 0) eff.x_chips = u_x_chips;
  return Object.keys(eff).length ? eff : null;
}

// ================================================================== petting
/** Petting.lua: circling the cursor 1.75 turns over a card fires the amm_pet_card context (Micatro: the 'amm_pet' action). */
const PET_STATES = ['SELECTING_HAND', 'SHOP', 'ROUND_EVAL', 'BLIND_SELECT', 'TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'BUFFOON_PACK', 'STANDARD_PACK', 'MOD_PACK', 'MOD_PACK_HAND'];
export function can_pet() { return PET_STATES.some((s) => G.STATE === G.STATES[s]); }
export function pet_card(card, direction, time) {
  juice_card(card);
  calculate_context({ amm_pet_card: card, amm_pet_time: time, amm_pet_direction: direction === 'counter-clockwise' ? 'counter-clockwise' : 'clockwise' });
}

// ============================================================ card qualities
const is_prime = (n) => [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281].includes(n);
/** The material lists (CardQualities.lua), with the cross-mod entries of mods Micatro ships (when active). */
function materials() {
  const rocks = ['m_stone'], metals = ['m_steel', 'm_gold'], mats = ['m_glass', 'm_stone', 'm_steel', 'm_gold'];
  if (isActive('morefluff')) { rocks.push('m_mf_gemstone'); metals.push('m_mf_brass'); mats.push('m_mf_brass', 'm_mf_teal', 'm_mf_gemstone', 'm_mf_marigold'); }
  if (isActive('pokermon')) { rocks.push('m_poke_hazard'); metals.push('m_poke_hazard'); mats.push('m_poke_hazard'); }
  if (isActive('autumncircus')) { rocks.push('m_thac_jewel'); mats.push('m_thac_bone', 'm_thac_jewel'); }
  const ok = (k) => !!P_CENTERS[k];
  return { rocks: rocks.filter(ok), metals: metals.filter(ok), materials: mats.filter(ok) };
}
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace'];
const NOMINAL = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, Jack: 10, Queen: 10, King: 10, Ace: 11 };
const FACE = (r) => r === 'Jack' || r === 'Queen' || r === 'King';
const rank_pick = (f, pseed) => ({ rank: pseudorandom_element(RANKS.filter(f), pseudoseed(pseed))[0] });
const in_list = (list, card) => list.includes(card.config.center_key);
/** AMM.qualities: has(card), value_mod(value), create(area, pseed) -> SMODS.add_card args, in_pool(). */
export const QUALITIES = {
  order: ['face', 'nonface', 'numbered', 'odd', 'even', 'prime', 'suitless', 'rankless', 'unenhanced', 'enhanced', 'rock', 'metal', 'materialenh',
    'nonmaterialenh', 'unsealed', 'sealed', 'baseedition', 'editioned', 'hexed', 'unhexed', 'clipped', 'unclipped', 'cursed', 'uncursed', 'vowel', 'consonant'],
  face: { has: (c) => c.is_face(), value_mod: (v) => v * 0.9, create: (a, p) => rank_pick(FACE, p) },
  nonface: { has: (c) => !c.is_face(), value_mod: (v) => v ** 0.9, create: (a, p) => rank_pick((r) => !FACE(r), p) },
  numbered: {
    has: (c) => !has_no_rank(c) && !(c.is_face() || c.base.value === 'Ace'), value_mod: (v) => (v - Math.min(v / 2, 1)) * 0.85,
    create: (a, p) => rank_pick((r) => r !== 'Ace' && !FACE(r), p),
  },
  odd: {
    has: (c) => !has_no_rank(c) && (c.base.value === 'Ace' || (!c.is_face() && c.get_id() <= 10 && c.get_id() > 0 && c.get_id() % 2 === 1)),
    value_mod: (v) => v - Math.min(v / 2, 1), create: (a, p) => rank_pick((r) => !FACE(r) && NOMINAL[r] % 2 === 1, p),
  },
  even: {
    has: (c) => !has_no_rank(c) && !(c.is_face() || c.base.value === 'Ace') && c.get_id() <= 10 && c.get_id() > 0 && c.get_id() % 2 === 0,
    value_mod: (v) => v - Math.min(v / 2, 1), create: (a, p) => rank_pick((r) => !FACE(r) && NOMINAL[r] % 2 === 0, p),
  },
  prime: {
    has: (c) => !has_no_rank(c) && !c.is_face() && (c.base.value === 'Ace' || is_prime(c.get_id())),
    value_mod: (v) => (v - Math.min(v / 2, 1)) * 1.618, create: (a, p) => rank_pick((r) => !FACE(r) && is_prime(NOMINAL[r]), p),
  },
  suitless: {
    has: has_no_suit, value_mod: (v) => v,
    create: (a, p) => ({ key: pseudorandom_element((P_CENTER_POOLS.Enhanced || []).filter((v) => v.no_suit || v.key === 'm_stone').map((v) => v.key), pseudoseed(p))[0], set: 'Enhanced' }),
  },
  rankless: {
    has: has_no_rank, value_mod: (v) => v,
    create: (a, p) => ({ key: pseudorandom_element((P_CENTER_POOLS.Enhanced || []).filter((v) => v.no_rank || v.key === 'm_stone').map((v) => v.key), pseudoseed(p))[0], set: 'Enhanced' }),
  },
  unenhanced: { has: (c) => c.config.center.set === 'Default', value_mod: (v) => v * 0.8 },
  enhanced: { has: (c) => c.config.center.set === 'Enhanced', value_mod: (v) => v * 1.25, create: () => ({ set: 'Enhanced' }) },
  rock: { has: (c) => in_list(materials().rocks, c), value_mod: (v) => (v + 1.5) * 0.7, create: (a, p) => ({ key: pseudorandom_element(materials().rocks, pseudoseed(p))[0], set: 'Enhanced' }) },
  metal: { has: (c) => in_list(materials().metals, c), value_mod: (v) => (v + 0.5) ** 1.11, create: (a, p) => ({ key: pseudorandom_element(materials().metals, pseudoseed(p))[0], set: 'Enhanced' }) },
  materialenh: { has: (c) => in_list(materials().materials, c), value_mod: (v) => (v + 0.1) * 1.25, create: (a, p) => ({ key: pseudorandom_element(materials().materials, pseudoseed(p))[0], set: 'Enhanced' }) },
  nonmaterialenh: {
    has: (c) => !in_list(materials().materials, c), value_mod: (v) => (v + 0.5) ** 0.89,
    create: (a, p) => { const m = materials().materials; return { key: pseudorandom_element((P_CENTER_POOLS.Enhanced || []).map((v) => v.key).filter((k) => !m.includes(k)), pseudoseed(p))[0], set: 'Enhanced' }; },
  },
  unsealed: { has: (c) => c.get_seal() == null, value_mod: (v) => v ** (v < 1 ? 1 / 0.85 : 0.85) },
  sealed: { has: (c) => c.get_seal() != null, value_mod: (v) => v ** (v < 1 ? 1 / 1.15 : 1.15), create: (a, p) => ({ seal: poll_seal_guaranteed(p) }) },
  baseedition: { has: (c) => c.edition == null, value_mod: (v) => v ** (v < 1 ? 1 / 0.75 : 0.75) },
  editioned: { has: (c) => c.edition != null, value_mod: (v) => v ** (v < 1 ? 1 / 1.23 : 1.23), create: (a, p) => ({ edition: poll_edition(p, null, true, true) }) },
  // (GrabBag hexes / Paperback paperclips / Ortalab curses / Aikoyori letters: those mods aren't in Micatro, so never in the pool)
  hexed: { has: () => false, value_mod: (v) => (v / 1.3) ** 1.3, in_pool: () => false },
  unhexed: { has: () => true, value_mod: (v) => v * 0.9, in_pool: () => false },
  clipped: { has: () => false, value_mod: (v) => (v + 0.4) * 0.99, in_pool: () => false },
  unclipped: { has: () => true, value_mod: (v) => Math.max(0.01, (v / 1.3) - 2), in_pool: () => false },
  cursed: { has: (c) => !!c.ability.curse, value_mod: (v) => (v ** (v < 1 ? 1 / 2 : 2)) * 0.75, in_pool: () => false },
  uncursed: { has: (c) => !c.ability.curse, value_mod: (v) => (v ** (v < 1 ? 1 / 0.5 : 0.5)) * 1.3, in_pool: () => false },
  vowel: { has: () => false, value_mod: (v) => v ** 1.02, in_pool: () => false },
  consonant: { has: () => false, value_mod: (v) => v ** 0.98, in_pool: () => false },
};
/** SMODS.poll_seal{key, guaranteed = true}: weighted over the Seal pool (weight 5 each unless set). */
function poll_seal_guaranteed(key) {
  const options = (P_CENTER_POOLS.Seal || []).filter((s) => !(s.in_pool && !s.in_pool(s)));
  let total = 0;
  const avail = options.map((s) => { const w = (P_SEALS[s.key] && P_SEALS[s.key].weight) || 5; total += w; return { key: s.key, weight: w }; });
  const poll = pseudorandom(pseudoseed(key + 'type' + G.GAME.round_resets.ante));
  let wi = 0;
  for (const v of avail) { wi += v.weight; if (poll > 1 - wi / total) return v.key; }
  return null;
}
const DEFAULT_CREATE_KEY = 'amm_cardquality_create';
export const CARD_QUALITIES = {
  has: (card, q) => (QUALITIES[q] ? QUALITIES[q].has(card) : undefined),
  random: (pseed) => pseudorandom_element(QUALITIES.order.filter((k) => !QUALITIES[k].in_pool || QUALITIES[k].in_pool()), pseudoseed(pseed))[0],
  /** create(quality, amt, area, pseed) -> the new cards (SMODS.add_card each), or undefined. */
  create(quality, amt = 1, area, pseed = DEFAULT_CREATE_KEY) {
    area = area || G.deck;
    const Q = QUALITIES[quality];
    if (!Q) return undefined;
    const ret = [];
    for (let i = 0; i < amt; i++) {
      const struc = (Q.create && Q.create(area, pseed)) || {};
      ret.push(add_playing_card(struc, area, pseed));
    }
    return ret.length ? ret : undefined;
  },
  localize: (q, mode) => localize((mode === 1 ? 'Cq_' : 'cq_') + q),
};
/** SMODS.add_card for a playing card: {set 'Base' | 'Enhanced', key, rank, suit, seal, edition} into `area`. */
export function add_playing_card(struc, area, pseed) {
  let center = P_CENTERS.c_base;
  if (struc.key && P_CENTERS[struc.key]) center = P_CENTERS[struc.key];
  else if (struc.set === 'Enhanced') center = pseudorandom_element((P_CENTER_POOLS.Enhanced || []).filter((c) => !c.in_pool || c.in_pool(c)), pseudoseed(pseed || 'add_card'))[0] || P_CENTERS.m_bonus;
  const suit = struc.suit || pseudorandom_element(['Spades', 'Hearts', 'Clubs', 'Diamonds'], pseudoseed((pseed || 'add_card') + '_suit'))[0];
  const rank = struc.rank || pseudorandom_element(RANKS, pseudoseed((pseed || 'add_card') + '_rank'))[0];
  const card = create_playing_card({ front: front_of(suit, rank), center }, area);
  if (struc.seal) card.set_seal(struc.seal, true);
  if (struc.edition) card.set_edition(struc.edition, true, true);
  card.add_to_deck();
  if (area === G.deck) G.deck.config.card_limit += 1;
  playing_card_joker_effects([card]);
  return card;
}
