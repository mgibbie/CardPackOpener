// BETMMA — shared helpers (Betmma_Vouchers.lua's "randomly create card function series",
// used_voucher / get_voucher, and the voucher rarity tables).
import {
  G, P_CENTERS, P_CARDS, Card, create_card, card_eval_status_text, emit, localize, pseudorandom, pseudoseed,
  get_next_voucher_key,
} from '../../js/engine/core.js';
import { opt } from '../../js/mods/registry.js';

export const MOD_ID = 'betmma';
export const ART = '/micatro/mods/betmma/assets/2x/';
export const ATLAS = 'betmma';
export const VK = (id) => 'v_betmma_' + id;
export const JK = (id) => 'j_betmma_' + id;
/** used_voucher(raw_key) */
export const used = (id) => !!(G.GAME && G.GAME.used_vouchers && G.GAME.used_vouchers[VK(id)]);
/** get_voucher(raw_key).config */
export const vcfg = (id) => P_CENTERS[VK(id)].config;
export const o = (key) => opt(MOD_ID, key);

/** RARITY_VOUCHER_PROBABILITY: a voucher of rarity r joins a pool with chance 1/P[r]. */
export const RARITY_VOUCHER_PROBABILITY = [1, 2, 4, 20];
export function normalize_rarity(rarity) {
  if (!rarity) return 1;
  return Math.max(1, Math.min(Math.ceil(rarity), RARITY_VOUCHER_PROBABILITY.length));
}
/** get_rarity(key) / get_rarity_card(center): vanilla and other mods' vouchers are common. */
export const get_rarity = (key) => { const c = P_CENTERS[key]; return c && c.config ? normalize_rarity(c.config.rarity) : 1; };
export const is_fusion = (c) => !!(c && c.requires && c.requires.length > 1);

/** The rarity system (enable_voucher_rarity in the Lua config; default on). */
export const rarity_on = () => o('voucher_rarity') !== false;
/** get_weight(v): a voucher key / center / Real Random entry -> its pick weight (1 unless it has one). */
export function get_weight(v) {
  if (typeof v === 'string' && P_CENTERS[v]) v = P_CENTERS[v];
  if (!v || typeof v !== 'object') return 1;
  if (rarity_on()) {
    if (v.weight) return v.weight;
    if (v.config && v.config.weight) return v.config.weight;
  }
  return 1;
}

/** Pop-up text helper (card_eval_status_text with a message). */
export const say = (card, message, colour, type = 'extra') => card_eval_status_text(card, type, null, null, null, { message, colour });
export const dict = (k) => localize(k);

/**
 * randomly_redeem_voucher(no_random_please): redeem a random (or the given) voucher for free, keeping the
 * round's shop voucher (the Lua saves/restores current_round.voucher around Card:redeem; with the
 * engine's SMODS voucher slots a non-shop redeem leaves it alone anyway). The card never sits in an
 * area (Lua: G.play, or a scratch area while a hand is being scored) — it dissolves right away.
 */
export function randomly_redeem_voucher(no_random_please) {
  const voucher_key = no_random_please || get_next_voucher_key(true);
  const center = P_CENTERS[voucher_key];
  if (!center) return null;
  const card = new Card(P_CARDS.empty, center, { bypass_discovery_center: true, bypass_discovery_ui: true });
  emit('betmma_voucher', { center: voucher_key, name: localize({ type: 'name_text', set: 'Voucher', key: voucher_key }) });
  card.cost = 0;
  card.shop_voucher = false;
  const current_round_voucher = G.GAME.current_round.voucher;
  card.redeem();
  G.GAME.current_round.voucher = current_round_voucher;
  G.E_MANAGER.add_event(() => card.start_dissolve());
  return card;
}

/** randomly_create_joker(n, tag, message, extra) */
export function randomly_create_joker(jokers_to_create, tag, message, extra) {
  extra = extra || {};
  G.GAME.joker_buffer = G.GAME.joker_buffer + jokers_to_create;
  G.E_MANAGER.add_event(() => {
    for (let i = 1; i <= jokers_to_create; i++) {
      const card = create_card('Joker', G.jokers, null, 0, null, null, null, tag);
      card.add_to_deck();
      if (extra.edition !== undefined) card.set_edition(extra.edition, true, false);
      G.jokers.emplace(card);
      G.GAME.joker_buffer = 0;
      if (message !== undefined && message !== null) card_eval_status_text(card, 'jokers', null, null, null, { message });
    }
  });
}

/** randomly_create_consumable(type, tag, message, extra): needs room unless the card will be Negative. */
export function randomly_create_consumable(card_type, tag, message, extra) {
  extra = extra || {};
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit || (extra && extra.edition && extra.edition.negative)) {
    G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
    G.E_MANAGER.add_event(() => {
      const card = create_card(card_type, G.consumeables, null, null, null, null, extra.forced_key || null, tag);
      card.add_to_deck();
      if (extra.edition !== undefined) card.set_edition(extra.edition, true, false);
      if (extra.eternal !== undefined) card.ability.eternal = extra.eternal;
      if (extra.extra_ability !== undefined) card.ability[extra.extra_ability] = true;
      card.ability.BetmmaVouchers = true;
      G.consumeables.emplace(card);
      G.GAME.consumeable_buffer = 0;
      if (message !== undefined && message !== null) card_eval_status_text(card, 'extra', null, null, null, { message });
    });
    return true;
  }
  return false;
}
export const randomly_create_spectral = (tag, message, extra) => randomly_create_consumable('Spectral', tag, message, extra);
export const randomly_create_tarot = (tag, message, extra) => randomly_create_consumable('Tarot', tag, message, extra);
export const randomly_create_planet = (tag, message, extra) => randomly_create_consumable('Planet', tag, message, extra);

/** create_black_hole(message): Event Horizon / Engulfer (must have room). */
export function create_black_hole(message) {
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit) return;
  G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
  G.E_MANAGER.add_event(() => {
    const card = create_card('Planet', G.consumeables, null, null, null, null, 'c_black_hole', 'v_event_horizon_or_v_engulfer');
    card.add_to_deck();
    G.consumeables.emplace(card);
    G.GAME.consumeable_buffer = 0;
    if (message !== undefined && message !== null) card_eval_status_text(card, 'extra', null, null, null, { message });
  });
}

/**
 * pseudorandom_element_weighted(t, seed): Betmma's weighted pick (fusion vouchers weigh 4). The Lua
 * re-seeds its poll with pseudoseed(<seed number>..ante); `weight_of(v)` is get_weight.
 */
export function pseudorandom_element_weighted(entries, seed, weight_of) {
  let cume = 0;
  for (const [, v] of entries) if (typeof v !== 'object' || !G.GAME.banned_keys[v.key]) cume += weight_of(v);
  const poll = pseudorandom(pseudoseed(String(seed) + G.GAME.round_resets.ante)) * cume;
  let it = 0;
  for (const [k, v] of entries) {
    if (typeof v !== 'object' || !G.GAME.banned_keys[v.key]) {
      const w = weight_of(v);
      it += w;
      if (it >= poll && it - w <= poll) return [v, k];
    }
  }
  return entries.length ? [entries[entries.length - 1][1], entries[entries.length - 1][0]] : [undefined, undefined];
}

/** The joker to the right of `card` in the joker row (or undefined). */
export function right_of(card) {
  const i = G.jokers.cards.indexOf(card);
  return i >= 0 ? G.jokers.cards[i + 1] : undefined;
}
