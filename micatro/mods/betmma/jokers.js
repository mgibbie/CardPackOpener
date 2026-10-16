// BETMMA Jokers (Betmma_Jokers.lua + localization/en-us.lua): 11 jokers. Their Lua wraps (Ascension's
// evaluate_poker_hand, Hasty's calculate_dollar_bonus, Piggy Bank's ease_dollars, Housing Choice's
// ease_ante, Balatro Mobile's update / buy_from_shop) are functions index.js's hooks call.
import {
  G, P_CENTERS, P_CARDS, create_card, find_joker, ease_dollars, localize, pseudorandom, pseudoseed,
  pseudorandom_element, get_current_pool, emit,
} from '../../js/engine/core.js';
import { STATES } from '../../js/engine/run.js';
import { JK, say, randomly_redeem_voucher } from './common.js';

const C = { CHIPS: 'CHIPS', MULT: 'MULT', RED: 'RED' };
/** betmma_inc_joker_value(card, multi): multiply every number on a joker (Gameplay Update). */
const POSSIBLE_KEYS = ['bonus', 'h_mult', 'mult', 't_mult', 'h_dollars', 'x_mult', 'extra_value', 'h_size', 'perma_bonus', 'p_dollars', 'h_x_mult', 't_chips', 'd_size'];
export { POSSIBLE_KEYS };
export function betmma_inc_joker_value(self, multi) {
  G.E_MANAGER.add_event(() => {
    const a = self.ability;
    for (const v of POSSIBLE_KEYS) {
      if (a[v] !== undefined && a[v] !== null && typeof a[v] === 'number' && a[v] !== (v === 'x_mult' ? 1 : 0)) a[v] = a[v] * multi;
    }
    if (a.extra !== undefined && a.extra !== null) {
      if (typeof a.extra === 'object') { for (const k of Object.keys(a.extra)) if (typeof a.extra[k] === 'number') a.extra[k] = a.extra[k] * multi; }
      else if (typeof a.extra === 'number') a.extra = a.extra * multi;
    }
    self.juice_up(0.8, 0.8);
    emit('card_changed', { card: self.sort_id });
  });
  say(self, localize('k_upgrade_ex'), C.RED);
}

/** G.localization.misc.contexts (Jimbow): context key -> text. */
export const CONTEXTS = {
  end_of_round: 'when round ends',
  discard: 'when you discard',
  debuffed_hand: 'when hand is debuffed',
  using_consumeable: 'when using consumable',
  remove_playing_cards: 'when removing playing cards',
  setting_blind: 'when setting blind',
  first_hand_drawn: 'when first hand drawn',
  playing_card_added: 'when playing card added',
  skipping_booster: 'when skipping booster',
  skip_blind: 'when skipping blind',
  ending_shop: 'when shop ends',
  reroll_shop: 'when rerolling shop',
  selling_card: 'when selling card',
  buying_card: 'when buying card',
  open_booster: 'when opening booster',
};
const new_context = () => pseudorandom_element(CONTEXTS, pseudoseed('jimbow'))[1];
/** SMODS.Ranks (key -> card_key), for ERRORR. */
const RANKS = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', Jack: 'J', Queen: 'Q', King: 'K', Ace: 'A' };
const SUIT_KEY = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };

export const JOKER_DATA = {
  jjookkeerr: {
    name: 'JJookkeerr', config: { extra: 1.5 }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra] }),
    calculate(c, card, context) {
      const oj = context.other_joker;
      if (oj && oj !== card && !oj.debuff && oj.ability.name && String(oj.ability.name).includes('Joker')) {
        G.E_MANAGER.add_event(() => oj.juice_up(0.5, 0.5));
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra] }), Xmult_mod: card.ability.extra };
      }
      return undefined;
    },
  },
  ascension: { name: 'Ascension', config: {}, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true },
  hasty: {
    name: 'Hasty Joker', config: { extra: 8 }, rarity: 1, cost: 5, blueprint_compat: false, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra] }),
    calc_dollar_bonus: (c, card) => (G.GAME.current_round.hands_played === 1 ? card.ability.extra : undefined),
  },
  errorr: {
    name: 'ERRORR', config: { extra: { odds: 3 } }, rarity: 3, cost: 8, blueprint_compat: false, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: ['' + ((G.GAME && G.GAME.probabilities.normal) || 1), card.ability.extra.odds] }),
    calculate(c, card, context) {
      if (context.discard && context.other_card && !context.other_card.debuff &&
          pseudorandom('errorr') < G.GAME.probabilities.normal / card.ability.extra.odds) {
        const oc = context.other_card;
        const suit_prefix = SUIT_KEY[oc.base.suit];
        const [rank_suffix] = pseudorandom_element(RANKS, pseudoseed('rank'));
        if (suit_prefix && P_CARDS[suit_prefix + '_' + rank_suffix]) oc.set_base(P_CARDS[suit_prefix + '_' + rank_suffix]);
        return { message: localize('k_errorr'), card: oc, colour: C.CHIPS };
      }
      return undefined;
    },
  },
  piggy_bank: {
    name: ' Piggy Bank ', config: { extra: { mults: 0, mult_mod: 1 } }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.mults, card.ability.extra.mult_mod] }),
    calculate(c, card, context) {
      if (context.joker_main && card.ability.extra.mults > 0) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mults] }), mult_mod: card.ability.extra.mults, colour: C.MULT };
      }
      if (context.selling_self) card.selling_self = true;
      return undefined;
    },
  },
  housing_choice: {
    name: 'Housing Choice', config: { extra: { triggered: false } }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.triggered ? 'inactive' : 'active'] }),
    calculate(c, card, context) {
      if (context.cardarea === G.jokers && context.before && !context.blueprint && context.poker_hands &&
          context.poker_hands['Full House'] && context.poker_hands['Full House'].length && !card.ability.extra.triggered) {
        card.ability.extra.triggered = true;
        randomly_redeem_voucher();
      }
      return undefined;
    },
  },
  jimbow: {
    name: 'Jimbow', config: { extra: { chips: 0, chip_mod: 15 } }, rarity: 1, cost: 2, blueprint_compat: true, eternal_compat: true,
    // (The Lua rolls the first context lazily — on hover or first calculation. Rolled when the card is made
    // so looking at a card never touches the run's random numbers.)
    set_ability(c, card) { if (card.ability.extra && card.ability.extra.context == null) card.ability.extra.context = new_context(); },
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.chips, card.ability.extra.chip_mod, CONTEXTS[card.ability.extra.context] || CONTEXTS.end_of_round] }),
    calculate(c, card, context) {
      if (card.ability.extra.context == null) card.ability.extra.context = new_context();
      if (!context.repetition && context[card.ability.extra.context]) {
        card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
        card.ability.extra.context = new_context();
        say(context.blueprint_card || card, localize('k_upgrade_ex'), C.CHIPS);
      }
      if (!context.repetition && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), chip_mod: card.ability.extra.chips, colour: C.CHIPS };
      }
      return undefined;
    },
  },
  gameplay_update: {
    name: 'Gameplay Update', config: { extra: 2 }, rarity: 3, cost: 10, blueprint_compat: true, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra] }),
    calculate(c, card, context) {
      if (!context.joker_main) return undefined;
      const my_pos = G.jokers.cards.indexOf(card) + 1;
      if (my_pos <= 0 || my_pos >= G.jokers.cards.length) return undefined;
      const suits = { Diamonds: 0, Spades: 0, Hearts: 0, Clubs: 0 };
      const need = { Diamonds: 2, Spades: 0, Hearts: 2, Clubs: 5 };
      const wild = (sc) => sc.ability.name === 'Wild Card' || sc.config.center.any_suit;
      for (const sc of context.scoring_hand) if (!wild(sc)) for (const k of Object.keys(suits)) if (sc.is_suit(k)) suits[k]++;
      for (const sc of context.scoring_hand) if (wild(sc)) for (const k of Object.keys(suits)) if (sc.is_suit(k) && suits[k] < need[k]) suits[k]++;
      for (const k of Object.keys(suits)) if (suits[k] === need[k]) betmma_inc_joker_value(G.jokers.cards[my_pos], (100 + card.ability.extra) / 100);
      return undefined;
    },
  },
  flying_cards: {
    name: 'Flying Cards', config: { extra: { power: 2, add: 2 }, x_mult: 1 }, rarity: 2, cost: 8, blueprint_compat: true, eternal_compat: true,
    loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.power, card.ability.extra.add, card.ability.x_mult] }),
    calculate(c, card, context) {
      if (context.discard || (context.individual && context.cardarea === G.play)) {
        const n = G.deck.cards.length;
        card.ability.x_mult = card.ability.x_mult + Math.pow(n + card.ability.extra.add, -card.ability.extra.power);
        say(context.blueprint_card || card, localize('k_upgrade_ex'), C.MULT);
        return undefined;
      }
      // (vanilla Card:calculate_joker's generic joker_main X Mult, which the Lua joker falls through to)
      if (context.joker_main && card.ability.x_mult > 1) {
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.x_mult] }), colour: C.RED, Xmult_mod: card.ability.x_mult };
      }
      return undefined;
    },
  },
  friends_of_jimbo: {
    name: 'Friends of Jimbo', config: {}, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true,
    loc_vars: () => ({ vars: [] }),
    calculate(c, card, context) {
      if (context.individual && context.cardarea === G.play) {
        const oc = context.other_card;
        for (const v of [{ suit: 'Spades', rank: 13 }, { suit: 'Diamonds', rank: 12 }, { suit: 'Hearts', rank: 11 }, { suit: 'Clubs', rank: 13 }]) {
          if (oc.is_suit(v.suit) && oc.get_id() === v.rank) {
            G.E_MANAGER.add_event(() => {
              const createjoker = Math.min(1, G.jokers.config.card_limit - (G.jokers.cards.length + G.GAME.joker_buffer));
              G.GAME.joker_buffer = G.GAME.joker_buffer + createjoker;
              const card2 = create_card('Joker', G.jokers, null, null, null, null, 'j_joker');
              card2.add_to_deck();
              G.jokers.emplace(card2);
              G.GAME.joker_buffer = 0;
            });
          }
        }
      }
      return undefined;
    },
  },
  balatro_mobile: {
    name: 'Balatro Mobile',
    config: { extra: { value: 26, win_value: 26 * Math.pow(10, 24), ability_price: 6, cooldown_reduce: 2, shop_joker_min: 2, shop_joker_max: 6 }, h_x_mult: 2, h_mult: 6, mobile: true, no_rank: true },
    rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true,
    keep_on_use: () => true,
    loc_vars(c, iq, card) {
      let t1 = '', t2 = '';
      const a = card.ability, area = card.area;
      if (!G || !G.GAME || card.fake) { t1 = 'But not here'; t2 = ':)'; }
      else if (area === G.jokers) { t1 = 'If score is larger than ' + (a.extra.win_value / Math.pow(10, 24)) + ' septillion,'; t2 = 'win the blind and self destruct'; }
      else if (area === G.consumeables) { t1 = 'Choose 4 cards of 4 suits and ranks of Six, Eight,'; t2 = 'Person (face) and Ten, destroy them and gain $' + a.extra.value; }
      else if (area === G.hand) { t1 = 'If hold in hand,'; t2 = '+' + a.h_mult + ' Mult and X' + a.h_x_mult + ' Mult'; }
      else if (area === G.shop_jokers) { t1 = 'When bought, generate a joker'; t2 = 'whose price is between $' + a.extra.shop_joker_min + ' and $' + a.extra.shop_joker_max; }
      return { vars: [a.extra.value, t1, t2] };
    },
    can_use(c, card) {
      if (!(G && G.hand && G.hand.highlighted && G.hand.highlighted.length === 4)) return false;
      const suits = { Diamonds: 0, Spades: 0, Hearts: 0, Clubs: 0 };
      const ranks = { 6: 0, 8: 0, 10: 0 };
      let hasFace = false, wild = 0;
      for (const h of G.hand.highlighted) {
        if (h.ability.name !== 'Wild Card' && !h.config.center.any_suit) { for (const k of Object.keys(suits)) if (h.is_suit(k)) suits[k]++; }
        else wild++;
        for (const k of Object.keys(ranks)) if (h.get_id() === Number(k)) ranks[k]++;
        if (h.is_face()) hasFace = true;
      }
      for (let i = 0; i < wild; i++) for (const k of Object.keys(suits)) if (suits[k] < 1) { suits[k]++; break; }
      for (const v of Object.values(suits)) if (v < 1) return false;
      for (const v of Object.values(ranks)) if (v < 1) return false;
      return hasFace;
    },
    use(c, card) {
      const destroyed_cards = G.hand.highlighted.slice().reverse();
      G.E_MANAGER.add_event(() => ease_dollars(card.ability.extra.value));
      G.E_MANAGER.add_event(() => {
        for (const h of destroyed_cards) {
          if (h.removed) continue;
          if (h.ability.name === 'Glass Card') h.shatter(); else h.start_dissolve();
        }
      });
      for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: destroyed_cards });
    },
    calculate(c, card, context) {
      if (context.after && card.area === G.jokers && (G.GAME.chips + (G.GAME.last_hand_total || 0)) > card.ability.extra.win_value) {
        G.GAME.balatro_mobile_win = true;
        G.E_MANAGER.add_event(() => {
          card.start_dissolve();
          G.GAME.blind.disable();
          G.GAME.chips = G.GAME.blind.chips;
          emit('chips', { total: G.GAME.chips });
        });
      }
      return undefined;
    },
  },
};

// ----------------------------------------------------------------- wraps
const POKER_HAND_LIST = ['Flush Five', 'Flush House', 'Five of a Kind', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card'];
/** Ascension (evaluate_poker_hand wrap): the best hand also counts as the next one up, per Ascension. */
export function ascension(results) {
  const n = find_joker('Ascension').length;
  for (let i = 1; i <= n; i++) {
    if (results[POKER_HAND_LIST[0]] && results[POKER_HAND_LIST[0]].length) break;
    for (let idx = 1; idx < POKER_HAND_LIST.length; idx++) {
      if (results[POKER_HAND_LIST[idx]] && results[POKER_HAND_LIST[idx]].length) { results[POKER_HAND_LIST[idx - 1]] = results[POKER_HAND_LIST[idx]]; break; }
    }
  }
}
/** Piggy Bank (ease_dollars wrap): half of every gain goes into the pig as +1 Mult per $1. */
export function piggy_bank(mod) {
  if (!(mod > 0)) return;
  for (const card of find_joker(' Piggy Bank ')) {
    const half = Math.floor(mod / 2);
    if (half > 0 && !card.selling_self) {
      ease_dollars(-half, false);
      G.E_MANAGER.add_event(() => card.juice_up(0.5, 0.5));
      mod = mod - half;
      card.ability.extra.mults = card.ability.extra.mults + card.ability.extra.mult_mod * half;
      card.ability.extra_value = card.ability.extra_value + half;
      card.set_cost();
    }
  }
}
/** Housing Choice (ease_ante wrap): ready again each Ante. */
export function housing_choice_reset() {
  for (const j of find_joker('Housing Choice')) j.ability.extra.triggered = false;
}

// ----------------------------------------------------------------- Balatro Mobile
const is_mobile = (card) => !!(card && card.ability && card.ability.mobile);
/** Card:update's per-area state (it is a consumable everywhere but the shop, your hand and packs). */
export function mobile_area_state(card) {
  if (!is_mobile(card)) return;
  card.ability.mobile = true;
  if (card.area !== G.shop_jokers && card.area !== G.hand && card.area !== G.pack_cards) card.ability.consumeable = card.ability.consumeable || {};
  else delete card.ability.consumeable;
  card.base.value = 'Ace';
  card.base.suit = 'Jimbo';
  // (no rank: the Lua's Card:get_id wrap hands a nil rank a random negative id; this one is stable)
  card.base.id = -(100 + card.sort_id * 7919);
}
const MOBILE_TARGETS = { jokers: () => G.jokers, consumeables: () => G.consumeables, hand: () => G.hand, shop_jokers: () => G.shop_jokers };
/** Where Balatro Mobile can be dragged to now (the Lua's Card:update drag rules). */
export function mobile_moves(card) {
  if (!is_mobile(card) || !card.area) return [];
  const S = G.STATE;
  if (S === STATES.DRAW_TO_HAND || S === STATES.HAND_PLAYED || S === STATES.ROUND_EVAL || S === STATES.MENU || S === STATES.GAME_OVER) return [];
  if (card.area === G.discard || card.area === G.deck || card.area === G.play) return [];
  const out = [];
  for (const [k, get] of Object.entries(MOBILE_TARGETS)) {
    const a = get();
    if (a === card.area) continue;
    if (k === 'shop_jokers' && S !== STATES.SHOP) continue;
    if (k === 'hand' && !(S === STATES.SELECTING_HAND || S === STATES.SHOP || S === STATES.BLIND_SELECT || S === STATES.TAROT_PACK || S === STATES.SPECTRAL_PACK || S === STATES.PLANET_PACK || S === STATES.STANDARD_PACK || S === STATES.BUFFOON_PACK || S === STATES.MOD_PACK || S === STATES.MOD_PACK_HAND)) continue;
    out.push(k);
  }
  return out;
}
export function mobile_move(card, to) {
  const area = MOBILE_TARGETS[to] && MOBILE_TARGETS[to]();
  if (!area) return false;
  if (card.area) card.area.remove_card(card);
  area.emplace(card);
  mobile_area_state(card);
  return true;
}
/** Balatro Mobile (center.buy_from_shop, run by the buy_from_shop wrap): a $2-$6 joker comes along. */
export function mobile_bought(card) {
  if (!is_mobile(card)) return;
  if (!(G.jokers.cards.length < G.jokers.config.card_limit + (card.edition && card.edition.negative ? 1 : 0))) return;
  const [pool] = get_current_pool('Joker');
  let new_pool = [];
  for (const v of pool) {
    if (v === 'UNAVAILABLE') continue;
    const cost = P_CENTERS[v].cost;
    if (card.ability.extra.shop_joker_min <= cost && cost <= card.ability.extra.shop_joker_max) new_pool.push(v);
  }
  if (!new_pool.length) new_pool = ['j_joker'];
  const card2 = create_card('Joker', G.jokers, null, null, null, null, pseudorandom_element(new_pool, pseudoseed('std_mobile'))[0]);
  card2.add_to_deck();
  G.jokers.emplace(card2);
}

export function joker_centers(layout, atlas, mod_option) {
  let order = 1;
  return Object.entries(JOKER_DATA).map(([id, j]) => ({
    key: JK(id), set: 'Joker', pos: layout.jokers[id], atlas, perishable_compat: true, mod_option,
    ...j, order: 6000 + order++,
  }));
}
