// Pokermon 3.9.1 — pokemon/pokejokers_03.lua (Pokédex 061-090: Poliwhirl -> Shellder), 33 jokers + 1 new 3.9.1 Mega (Mega Victreebel, batch 16).
// Line-for-line port of the behaviour, on Pokermon 3.9.1 since batch 6 (PORTING.md "Pokermon 3.9.1 upgrade");
// static data comes from data.js + data391.js (this file's jokers take their whole 3.9.1 config).
// Mega Victreebel (3.9.1's new Mega): batch 16.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element,
  create_card, ease_discard, ease_hands_played, juice_card_until, playing_card_joker_effects, delay, play_sound,
  STATES, defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars,
  get_probability_vars, pseudorandom_probability, has_enhancement, poke_is_even, poke_get_adjacent_jokers,
  is_type, smods_create_card, add_card, poke_add_shop_card, remove, POKE_POOL_RULES,
} from '../api.js';
import { get_current_pool, P_SEALS } from '../../../js/engine/core.js';

const FILE = 'pokemon/pokejokers_03.lua';

// ------------------------------------------------------------ shared bodies
const SUITS_PLURAL = () => [localize('Spades', 'suits_plural'), localize('Hearts', 'suits_plural'), localize('Clubs', 'suits_plural'), localize('Diamonds', 'suits_plural')];
const poli_suit = () => (G.GAME && G.GAME.poke_poli_suit) || 'Spades';
/**
 * Poliwhirl / Poliwrath: `ret` is the bonus of a scored card of the Poli suit (debuffed cards never score). The suit
 * cycles after every scored hand in the mod-level calculate (3.9.1 pokermon.lua; systems/rules.js), not here.
 */
function poli_calc(card, context, ret) {
  if (context.individual && context.cardarea === G.play && context.other_card.is_suit(G.GAME.poke_poli_suit || 'Spades')) return ret();
  return undefined;
}
/**
 * Abra line: on a repeated hand type this round, maybe create an Item or a Tarot. `forced` gives
 * the [item key, tarot key] (Kadabra: Twisted Spoon / random Tarot; Alakazam: Twisted Spoon / The Fool).
 * Abra rolls the room check before the odds; Kadabra / Alakazam roll the odds first.
 */
function abra_calc(card, context, seed, item_seed, forced, room_first) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main && G.GAME.hands[context.scoring_name] && G.GAME.hands[context.scoring_name].played_this_round > 1) {
      const room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;
      if (room_first && !room()) return undefined;
      if (pseudorandom_probability(card, seed, card.ability.extra.num, card.ability.extra.dem, seed)) {
        if (!room_first && !room()) return undefined;
        let set, message, colour, conname;
        if (pseudorandom(item_seed) < 0.50) {
          set = 'Item'; message = 'poke_plus_pokeitem'; colour = 'item'; conname = forced[0];
        } else {
          set = 'Tarot'; message = 'k_plus_tarot'; colour = 'PURPLE'; conname = forced[1];
        }
        const _card = create_card(set, G.consumeables, null, null, null, null, conname);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize(message), colour });
      }
    }
  }
  return undefined;
}
const consumable_slot = {
  add_to_deck(self, card) { const limit = card.ability.extra.card_limit; G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit + limit; }); },
  remove_from_deck(self, card) { const limit = card.ability.extra.card_limit; G.E_MANAGER.add_event(() => { G.consumeables.config.card_limit = G.consumeables.config.card_limit - limit; }); },
};
/** pokermon.create_consumeable(key) (3.9.1 pokefunctions.lua): a consumable if there is room, "+1 ..." on it. */
export function create_consumeable(key) {
  if (!(G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit)) return undefined;
  const set = P_CENTERS[key] && P_CENTERS[key].set;
  const _card = create_card(set, G.consumeables, null, null, null, null, key);
  _card.add_to_deck();
  G.consumeables.emplace(_card);
  const msg = { Tarot: 'k_plus_tarot', Planet: 'k_plus_planet', Spectral: 'k_plus_spectral', Item: 'poke_plus_pokeitem', Energy: 'poke_plus_pokeitem' }[set];
  card_eval_status_text(_card, 'extra', null, null, null, { message: msg ? localize(msg) : '+1 ' + set, colour: set === 'Item' ? 'item' : set });
  return _card;
}
/** Machop line: +hands, -discards. */
const hands_for_discards = {
  add_to_deck(self, card, from_debuff) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
    G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.discards;
    if (!from_debuff) ease_hands_played(card.ability.extra.hands);
    ease_discard(-card.ability.extra.discards);
  },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
    G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.discards;
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
    ease_discard(card.ability.extra.discards);
  },
};
/** Geodude line: -h_size hand size. */
const minus_hand_size = {
  add_to_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
};
const flat_mult = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult } : undefined);
const flat_chips = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips } : undefined);
/** Bellsprout line: scored even cards give +chips. */
function even_chips(card, context) {
  if (context.individual && context.cardarea === G.play && !context.other_card.debuff && poke_is_even(context.other_card)) {
    return { chips: card.ability.extra.chips, card };
  }
  return undefined;
}
/** Tentacool line: scored 10s give +mult. */
function ten_mult(card, context) {
  if (context.individual && context.cardarea === G.play && !context.other_card.debuff && context.other_card.get_id() === 10) {
    return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
/** Ponyta / Rapidash: chips grow on each Straight. */
function pony_calc(card, context, rapidash) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint && context.cardarea === G.jokers && context.poker_hands.Straight.length) {
      card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
      if (rapidash) card.ability.extra.chip_mod = card.ability.extra.chip_mod + 1;
      return { message: localize('k_upgrade_ex'), colour: 'CHIPS', card };
    }
    if (context.joker_main && card.ability.extra.chips > 0) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
    }
  }
  return undefined;
}
/** Doduo / Dodrio: the first n scored face cards give +mult. */
function first_faces_mult(card, context, n) {
  if (context.individual && !context.end_of_round && context.cardarea === G.play) {
    const faces = [];
    for (const c of context.scoring_hand) {
      if (c.is_face()) { faces.push(c); if (faces.length >= n) break; }
    }
    if (faces.includes(context.other_card)) return { mult: card.ability.extra.mult, colour: 'RED', card };
  }
  return undefined;
}
/**
 * SMODS.poll_seal(args): the weighted seal poll (2% base rate unless `guaranteed`). Local copy —
 * options = the current Seal pool (vanilla seals + any ported mod seals).
 */
function poll_seal(args) {
  args = args || {};
  let key = args.key || 'stdseal';
  const mod = args.mod || 1;
  const guaranteed = args.guaranteed || false;
  const options = args.options || get_current_pool('Seal')[0];
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const available_seals = [];
  let total_weight = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const seal_option = typeof v === 'string' ? { key: v, weight: P_SEALS[v].weight ?? 5 } : { key: v.key, weight: v.weight };
    if (seal_option.weight > 0) { available_seals.push(seal_option); total_weight = total_weight + seal_option.weight; }
  }
  total_weight = total_weight + (total_weight / 2 * 98);
  let type_weight = 0;
  for (const v of available_seals) {
    v.weight = P_SEALS[v.key].get_weight ? P_SEALS[v.key].get_weight(P_SEALS[v.key]) : v.weight;
    type_weight = type_weight + v.weight;
  }
  const seal_poll = pseudorandom(pseudoseed(key));
  if (seal_poll > 1 - (type_weight * mod / total_weight) || guaranteed) {
    const seal_type_poll = pseudorandom(pseudoseed(type_key));
    let weight_i = 0;
    for (const v of available_seals) {
      weight_i = weight_i + v.weight;
      if (seal_type_poll > 1 - (weight_i / type_weight)) return v.key;
    }
  }
  return undefined;
}
/** Seel / Dewgong: the first hand of the round seals its first scoring card. */
function seal_first(card, context, roll) {
  if (context.before && context.cardarea === G.jokers && G.GAME.current_round.hands_played === 0 && !context.blueprint) {
    if (!roll || pseudorandom_probability(card, 'seel', card.ability.extra.num, card.ability.extra.dem, 'seel')) {
      const _card = context.scoring_hand[0];
      const seal_type = poll_seal({ guaranteed: true });
      _card.set_seal(seal_type, true);
    }
  }
  if (context.first_hand_drawn && !context.blueprint) {
    const evalf = () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES;
    juice_card_until(card, evalf, true);
  }
}
const muk_mult = (card) => card.ability.extra.mult_mod * (G.playing_cards.length - G.GAME.starting_deck_size);

defineJokers({
  // Poliwhirl 061
  poliwhirl: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_waterstone, P_CENTERS.c_poke_kingsrock);
      return { vars: [center.ability.extra.mult, localize(poli_suit(), 'suits_singular'), ...SUITS_PLURAL()], colours: ['SUITS.' + poli_suit()] };
    },
    calculate(self, card, context) {
      return poli_calc(card, context, () => ({ mult: card.ability.extra.mult })) || item_evo(self, card, context);
    },
  },
  // Poliwrath 062
  poliwrath: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi, localize(poli_suit(), 'suits_singular'), ...SUITS_PLURAL(), center.ability.extra.mult], colours: ['SUITS.' + poli_suit()] };
    },
    calculate(self, card, context) {
      return poli_calc(card, context, () => ({ x_mult: card.ability.extra.Xmult_multi, mult: card.ability.extra.mult, card }));
    },
  },
  // Abra 063
  abra: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'abra');
      return { vars: [num, dem, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      return abra_calc(card, context, 'abra', 'abraitem', [undefined, undefined], true) || level_evo(self, card, context, 'j_poke_kadabra');
    },
  },
  // Kadabra 064
  kadabra: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Item', key: 'c_poke_twisted_spoon', poke_add_desc: true });
        info_queue.push(P_CENTERS.c_poke_linkcable);
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'kadabra');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      return abra_calc(card, context, 'kadabra', 'kadabraitem', ['c_poke_twisted_spoon', undefined], false) || item_evo(self, card, context, 'j_poke_alakazam');
    },
  },
  // Alakazam 065
  alakazam: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Tarot', key: 'c_fool' });
        info_queue.push({ set: 'Item', key: 'c_poke_twisted_spoon', poke_add_desc: true });
        info_queue.push({ set: 'Other', key: 'mega_poke' });
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'alakazam');
      return { vars: [num, dem, center.ability.extra.card_limit] };
    },
    // (Lua reuses the 'alakazam' seed for both the odds and the Item/Tarot flip.)
    calculate(self, card, context) { return abra_calc(card, context, 'alakazam', 'alakazam', ['c_poke_twisted_spoon', 'c_fool'], false); },
    add_to_deck: consumable_slot.add_to_deck,
    // (3.9.1: Alakazam gives the slot back at once, not in an event)
    remove_from_deck(self, card) { G.consumeables.config.card_limit = G.consumeables.config.card_limit - card.ability.extra.card_limit; },
  },
  // Mega Alakazam 065-1 (other_consumeable: the engine names consumables in the joker-on-card loop)
  mega_alakazam: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Item', key: 'c_poke_twisted_spoon', poke_add_desc: true });
      return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.Xmult_multi2, center.ability.extra.card_limit] };
    },
    calculate(self, card, context) {
      if (context.other_consumeable) {
        let Xmult;
        if (context.other_consumeable.ability.name === 'twisted_spoon') Xmult = card.ability.extra.Xmult_multi2;
        else Xmult = card.ability.extra.Xmult_multi;
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [Xmult] }), colour: 'XMULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
    ...consumable_slot,
  },
  // Machop 066
  machop: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.hands, ex.discards, ex.rounds, ex.mult] };
    },
    calculate(self, card, context) { return flat_mult(card, context) || level_evo(self, card, context, 'j_poke_machoke'); },
    ...hands_for_discards,
  },
  // Machoke 067
  machoke: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [center.ability.extra.hands, center.ability.extra.discards, center.ability.extra.mult] };
    },
    calculate(self, card, context) { return flat_mult(card, context) || item_evo(self, card, context, 'j_poke_machamp'); },
    ...hands_for_discards,
  },
  // Machamp 068
  machamp: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.discards, center.ability.extra.mult] };
    },
    calculate(self, card, context) { return flat_mult(card, context); },
    ...hands_for_discards,
  },
  // Bellsprout 069
  bellsprout: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return even_chips(card, context) || level_evo(self, card, context, 'j_poke_weepinbell'); },
  },
  // Weepinbell 070
  weepinbell: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_leafstone);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) { return even_chips(card, context) || item_evo(self, card, context, 'j_poke_victreebel'); },
  },
  // Victreebel 071 (3.9.1: only the first retrigger_max even cards each round are retriggered)
  victreebel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' });
      const ex = center.ability.extra;
      return { vars: [ex.chips, ex.retrigger_max, Math.max(0, ex.retrigger_max - ex.round_retriggers)] };
    },
    calculate(self, card, context) {
      const r = even_chips(card, context);
      if (r) return r;
      if (context.repetition && context.cardarea === G.play && !context.other_card.debuff && card.ability.extra.round_retriggers < card.ability.extra.retrigger_max) {
        if (poke_is_even(context.other_card)) {
          if (!context.blueprint) card.ability.extra.round_retriggers = card.ability.extra.round_retriggers + 1;
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) card.ability.extra.round_retriggers = 0;
      return undefined;
    },
  },
  // Mega Victreebel 071-1 (3.9.1, batch 16): retriggers every played even card, and every Purple Seal card (both: twice);
  // comes holding a Medium.
  mega_victreebel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Medium'] });
        info_queue.push({ set: 'Spectral', key: 'c_medium' });
        info_queue.push({ key: 'purple_seal', set: 'Other' });
      }
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && !context.other_card.debuff) {
        let retriggers = 0;
        if (poke_is_even(context.other_card)) retriggers = retriggers + card.ability.extra.retriggers;
        if (context.other_card.seal && context.other_card.seal === 'Purple') retriggers = retriggers + card.ability.extra.retriggers;
        if (retriggers > 0) return { message: localize('k_again_ex'), repetitions: retriggers, card };
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) create_consumeable('c_medium'); },
  },
  // Tentacool 072
  tentacool: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return ten_mult(card, context) || level_evo(self, card, context, 'j_poke_tentacruel'); },
  },
  // Tentacruel 073
  tentacruel: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult] }; },
    calculate(self, card, context) { return ten_mult(card, context); },
  },
  // Geodude 074
  geodude: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.h_size, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return flat_chips(card, context) || level_evo(self, card, context, 'j_poke_graveler'); },
    ...minus_hand_size,
  },
  // Graveler 075
  graveler: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [center.ability.extra.chips, center.ability.extra.h_size] };
    },
    calculate(self, card, context) { return flat_chips(card, context) || item_evo(self, card, context, 'j_poke_golem'); },
    ...minus_hand_size,
  },
  // Golem 076
  golem: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.h_size] }; },
    calculate(self, card, context) { return flat_chips(card, context); },
    ...minus_hand_size,
  },
  // Ponyta 077
  ponyta: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) {
      return pony_calc(card, context, false) || scaling_evo(self, card, context, 'j_poke_rapidash', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Rapidash 078
  rapidash: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) { return pony_calc(card, context, true); },
  },
  // Slowpoke 079
  slowpoke: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const triggers_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.last_counter);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'tauros');
      return { vars: [card.ability.extra.Xmult, triggers_left, num, dem] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && G.GAME.current_round.hands_left === 0) {
          if (!context.blueprint) card.ability.extra.last_counter = card.ability.extra.last_counter + 1;
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      if (context.reroll_shop && !context.blueprint) {
        if (pseudorandom_probability(card, 'slowpoke', card.ability.extra.num, card.ability.extra.dem, 'slowpoke')) {
          const temp_card = { set: 'Joker', area: G.shop_jokers, key: 'j_poke_shell' };
          const _add_card = smods_create_card(temp_card);
          _add_card.ability.couponed = true; // (3.9.1 pokermon.add_shop_card(add_card, card, is_free))
          poke_add_shop_card(_add_card, card);
        }
      }
      let evo = item_evo(self, card, context, 'j_poke_slowking');
      if (!evo) evo = scaling_evo(self, card, context, 'j_poke_slowbro', card.ability.extra.last_counter, self.config.evo_rqmt);
      if (!evo) evo = scaling_evo(self, card, context, 'j_poke_slowbro', card.ability.extra.shell_used, 1);
      return evo;
    },
  },
  // Slowbro 080
  slowbro: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' });
      let xmult_total = center.ability.extra.Xmult;
      if (G.STATE === STATES.SELECTING_HAND || G.STATE === STATES.HAND_PLAYED || G.STATE === STATES.DRAW_TO_HAND || G.STATE === STATES.PLAY_TAROT) {
        xmult_total = xmult_total + G.GAME.current_round.hands_played * center.ability.extra.Xmult_mod;
      }
      return { vars: [center.ability.extra.Xmult_mod, xmult_total] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const xmult_total = card.ability.extra.Xmult + (1 + G.GAME.current_round.hands_played) * card.ability.extra.Xmult_mod;
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [xmult_total] }), colour: 'XMULT', Xmult_mod: xmult_total };
        }
      } else if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Mega Slowbro 080-1
  mega_slowbro: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const xmult_total = center.ability.extra.Xmult + center.ability.extra.hands_played * center.ability.extra.Xmult_mod;
      return { vars: [center.ability.extra.Xmult_mod, xmult_total] };
    },
    // (3.9.1: the count goes up in `before` — no Blueprint guard, as upstream — and resets when a Boss Blind is beaten.)
    calculate(self, card, context) {
      if (context.before) card.ability.extra.hands_played = card.ability.extra.hands_played + 1;
      if (context.joker_main) {
        const xmult_total = card.ability.extra.Xmult + card.ability.extra.hands_played * card.ability.extra.Xmult_mod;
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [xmult_total] }), colour: 'XMULT', Xmult_mod: xmult_total };
      }
      if (context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss && !context.blueprint) {
        card.ability.extra.hands_played = 0;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Shellder...? (Slowpoke's shop shell): evolves the leftmost Slowpoke, then self-destructs.
  shell: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    add_to_deck(self, card) {
      for (const v of G.jokers.cards) {
        if (v.config.center.key === 'j_poke_slowpoke' && v.ability.extra.shell_used !== 1) {
          v.ability.extra.shell_used = 1;
          play_sound('poke_shellchomp', 1, 0.5);
          break;
        }
      }
      remove(self, card, {});
    },
    set_ability(self, card, initial) {
      if (initial) card.set_edition({ negative: true }, true, true);
    },
    // (3.9.1 in_pool -> false: only Slowpoke's shop roll makes one; the pool rule is at the end of this file)
  },
  // Magnemite 081
  magnemite: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      return { vars: [center.ability.extra.Xmult_multi, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.play && context.individual && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_steel')) {
        return { x_mult: card.ability.extra.Xmult_multi };
      }
      return level_evo(self, card, context, 'j_poke_magneton');
    },
  },
  // Magneton 082
  magneton: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel, P_CENTERS.c_poke_thunderstone);
      let adjacent = 0;
      if (G.jokers && G.jokers.cards.includes(center)) {
        for (const j of poke_get_adjacent_jokers(center)) if (is_type(j, 'Metal')) adjacent = adjacent + 1;
      }
      const ex = center.ability.extra;
      return { vars: [ex.Xmult_multi, ex.Xmult_multi2, ex.Xmult_multi + (adjacent * ex.Xmult_multi2)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.play && context.individual && !context.other_card.debuff && !context.end_of_round && has_enhancement(context.other_card, 'm_steel')) {
        let adjacent = 0;
        for (const j of poke_get_adjacent_jokers(card)) if (is_type(j, 'Metal')) adjacent = adjacent + 1;
        return { x_mult: card.ability.extra.Xmult_multi + (adjacent * card.ability.extra.Xmult_multi2) };
      }
      return item_evo(self, card, context, 'j_poke_magnezone');
    },
  },
  // Farfetch'd 083
  farfetchd: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.c_poke_leek);
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Leek'] });
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num ?? 1, center.ability.extra.dem, 'farfetchd');
      return { vars: [center.ability.extra.money, num, dem] };
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) create_consumeable('c_poke_leek'); },
    calculate(self, card, context) {
      if (context.using_consumeable) {
        // (Lua order: the roll happens first, so a Leek still consumes the 'farfetchd' seed.)
        if (pseudorandom_probability(card, 'farfetchd', card.ability.extra.num, card.ability.extra.dem, 'farfetchd') || context.consumeable.ability.name === 'leek') {
          card.juice_up();
          ease_poke_dollars(card, 'farfet', card.ability.extra.money);
        }
      }
      return undefined;
    },
  },
  // Doduo 084
  doduo: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return first_faces_mult(card, context, 2) || level_evo(self, card, context, 'j_poke_dodrio'); },
  },
  // Dodrio 085
  dodrio: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.h_size] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.scoring_hand.length === 3) {
          let faces = 0;
          for (const v of context.scoring_hand) if (v.is_face()) faces = faces + 1;
          if (faces === 3) {
            G.hand.change_size(card.ability.extra.h_size);
            G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
          }
        }
      }
      return first_faces_mult(card, context, 3);
    },
  },
  // Seel 086
  seel: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'seel');
      return { vars: [num, dem, card.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      seal_first(card, context, true);
      return level_evo(self, card, context, 'j_poke_dewgong');
    },
  },
  // Dewgong 087
  dewgong: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return undefined; },
    calculate(self, card, context) { seal_first(card, context, false); return undefined; },
  },
  // Grimer 088
  grimer: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds, G.GAME.starting_deck_size] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && G.playing_cards.length > G.GAME.starting_deck_size) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        const added_card = add_card({ set: 'Base', no_edition: true });
        playing_card_joker_effects([added_card]);
        card.juice_up();
      }
      return level_evo(self, card, context, 'j_poke_muk');
    },
  },
  // Muk 089
  muk: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, G.GAME.starting_deck_size, Math.max(0, (G.playing_cards ? (G.playing_cards.length - G.GAME.starting_deck_size) : 0) * center.ability.extra.mult_mod)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && G.playing_cards.length > G.GAME.starting_deck_size) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [muk_mult(card)] }), colour: 'MULT', mult_mod: muk_mult(card), card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        const cards = [];
        for (let i = 1; i <= 2; i++) cards.push(add_card({ set: 'Base', no_edition: true }));
        playing_card_joker_effects(cards);
        const target = pseudorandom_element(G.playing_cards, pseudoseed('muk'))[0];
        G.E_MANAGER.add_event(() => {
          if (target.ability.name === 'Glass Card') target.shatter();
          else target.start_dissolve();
        });
        delay(0.3);
        for (const j of G.jokers.cards.slice()) j.calculate_joker({ remove_playing_cards: true, removed: [target], poke_removed_at_end: true });
        card.juice_up();
      }
      return undefined;
    },
  },
  // Shellder 090
  shellder: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_waterstone);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'shellder');
      return { vars: [num, dem, center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play && context.scoring_hand.length === 5) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          if (pseudorandom_probability(card, 'shellder', card.ability.extra.num, card.ability.extra.dem, 'shellder')) {
            return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
          }
        }
      }
      return item_evo(self, card, context, 'j_poke_cloyster');
    },
  },
}, FILE);

// Shell (3.9.1 in_pool = false): never in a pool (shop, packs, Poke Balls); Slowpoke puts it in the shop itself.
POKE_POOL_RULES.push((self) => (self && self.key === 'j_poke_shell' ? false : undefined));
