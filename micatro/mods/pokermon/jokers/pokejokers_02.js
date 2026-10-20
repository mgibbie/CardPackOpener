// Pokermon 3.9.1 — pokemon/pokejokers_02.lua (Pokédex 031-060: Nidoqueen -> Poliwag), 30 jokers.
// Line-for-line port of the behaviour, on 3.9.1 since batch 6; static data (pos, config, rarity, cost, stage,
// ptype, gen, item_req, evo_list) comes from data.js + data391.js. See ../PORTING.md and pokejokers_01.js.
// (3.9.1's mega_clefable is new content: not here yet.)
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, create_card, scale_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars,
  get_probability_vars, pseudorandom_probability, poke_is_odd, poke_total_chips,
} from '../api.js';

const FILE = 'pokemon/pokejokers_02.lua';

// ------------------------------------------------------------ shared bodies
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** Nidoqueen: each Queen held gives +chips. */
function held_queen_chips(card, context) {
  if (context.individual && context.cardarea === G.hand && context.other_card.get_id() === 12) {
    if (!context.end_of_round && !context.before && !context.after) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      return { h_chips: card.ability.extra.chips, card };
    }
  }
  return undefined;
}
/** Nidoran-M line: each King held gives +mult. */
function held_king_mult(card, context) {
  if (context.individual && !context.end_of_round && context.cardarea === G.hand && context.other_card.get_id() === 13) {
    if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
    return { h_mult: card.ability.extra.mult, card };
  }
  return undefined;
}
/** Vulpix / Ninetales: scored 9s may make a Tarot. */
function nine_tarot(card, context, seed) {
  if (context.individual && context.cardarea === G.play) {
    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      if (context.other_card.get_id() === 9 && !context.other_card.debuff && pseudorandom_probability(card, seed, card.ability.extra.num, card.ability.extra.dem, seed)) {
        G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
        return {
          extra: {
            focus: card, message: localize('k_plus_tarot'), colour: 'PURPLE',
            func() {
              G.E_MANAGER.add_event(() => {
                const _card = create_card('Tarot', G.consumeables, null, null, null, null, null, 'sup');
                _card.add_to_deck();
                G.consumeables.emplace(_card);
                G.GAME.consumeable_buffer = 0;
              });
            },
          },
        };
      }
    }
  }
  return undefined;
}
/** Oddish / Gloom: scored odd cards give mult, mult1 or mult2 (a third each, 3.9.1). */
function odd_mult(card, context, seed) {
  if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
    if (poke_is_odd(context.other_card)) {
      let value;
      const random = pseudorandom(seed);
      if (random < 1 / 3) value = card.ability.extra.mult;
      else if (random < 2 / 3) value = card.ability.extra.mult1;
      else value = card.ability.extra.mult2;
      return { mult: value, card };
    }
  }
  return undefined;
}
/** Zubat line: strip a scoring card's Enhancement (vampired: once per hand). */
function eat_enhancement(v) {
  v.vampired = true;
  v.set_ability(P_CENTERS.c_base, null, true);
  G.E_MANAGER.add_event(() => { v.juice_up(); v.vampired = undefined; });
}
/** Venonat / Venomoth: +plus_odds to every listed probability's numerator. */
function plus_odds(card, context) {
  if (context.mod_probability && !context.blueprint) return { numerator: context.numerator + card.ability.extra.plus_odds };
  return undefined;
}
/** Diglett / Dugtrio: Three of a Kind -> chips; a 2, 3 or 4 scored -> mult (or Xmult). */
function dig_calc(card, context, xmult) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    let score_chips = false;
    let score_mult = false;
    if (context.poker_hands['Three of a Kind'].length) score_chips = true;
    for (const v of context.scoring_hand) {
      if (v.get_id() === 2 || v.get_id() === 3 || v.get_id() === 4) { score_mult = true; break; }
    }
    if (score_mult && score_chips) {
      return xmult
        ? { message: localize('poke_dig_ex'), colour: 'MULT', chip_mod: card.ability.extra.chips, Xmult_mod: card.ability.extra.Xmult, card }
        : { message: localize('poke_dig_ex'), colour: 'MULT', chip_mod: card.ability.extra.chips, mult_mod: card.ability.extra.mult, card };
    } else if (score_chips) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips, card };
    } else if (score_mult) {
      return xmult
        ? { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'MULT', Xmult_mod: card.ability.extra.Xmult, card }
        : { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult, card };
    }
  }
  return undefined;
}
/** Meowth / Persian: the first Lucky trigger each round raises the cash-out. */
function lucky_money(card, context) {
  if (context.individual && context.cardarea === G.play && context.other_card.lucky_trigger && card.ability.extra.triggers < card.ability.extra.limit && !context.blueprint) {
    card.ability.extra.triggers = card.ability.extra.triggers + 1;
    scale_card(card, { ref_value: 'money', scalar_value: 'money_mod', message_colour: 'MONEY' });
  }
  if (!context.repetition && !context.individual && context.end_of_round) card.ability.extra.triggers = 0;
}
/** Psyduck / Golduck: the played hand is exactly one face card. */
const lone_face = (context) => context.cardarea === G.jokers && context.scoring_hand && context.full_hand && context.full_hand.length === 1 && context.scoring_hand[0] && context.scoring_hand[0].is_face();
/** Mankey / Primeape: scored prime ranks (2, 3, 5, 7). */
const is_prime = (c) => c.get_id() === 2 || c.get_id() === 3 || c.get_id() === 5 || c.get_id() === 7;
const SUITS_PLURAL = () => [localize('Spades', 'suits_plural'), localize('Hearts', 'suits_plural'), localize('Clubs', 'suits_plural'), localize('Diamonds', 'suits_plural')];
const poli_suit = () => (G.GAME && G.GAME.poke_poli_suit) || 'Spades';

defineJokers({
  // Nidoqueen 031
  nidoqueen: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.h_size] }; },
    calculate(self, card, context) { return held_queen_chips(card, context); },
    ...hand_size,
  },
  // Nidoran-M 032
  nidoranm: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return held_king_mult(card, context) || level_evo(self, card, context, 'j_poke_nidorino'); },
  },
  // Nidorino 033
  nidorino: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_moonstone);
      return { vars: [center.ability.extra.mult] };
    },
    calculate(self, card, context) { return held_king_mult(card, context) || item_evo(self, card, context, 'j_poke_nidoking'); },
  },
  // Nidoking 034
  nidoking: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.h_size] }; },
    calculate(self, card, context) { return held_king_mult(card, context); },
    ...hand_size,
  },
  // Clefairy 035
  clefairy: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_moonstone);
      return { vars: [center.ability.extra.mult, localize(center.ability.extra.suit, 'suits_singular')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          return { mult: card.ability.extra.mult, card };
        }
      }
      return item_evo(self, card, context, 'j_poke_clefable');
    },
  },
  // Clefable 036
  clefable: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.mult_mod, localize(ex.suit, 'suits_singular'), ex.mult_mod * ex.clubs_scored, 5 * ex.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          let club_count = 0;
          for (const v of context.scoring_hand) if (v.is_suit(card.ability.extra.suit)) club_count = club_count + 1;
          card.ability.extra.clubs_scored = card.ability.extra.clubs_scored + club_count;
        }
      }
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          return { mult: card.ability.extra.mult_mod * card.ability.extra.clubs_scored, card };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        if (card.ability.extra.clubs_scored > 0) {
          card.ability.extra.clubs_scored = 0;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
        }
      }
      return undefined;
    },
  },
  // Vulpix 037
  vulpix: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_firestone);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'vulpix');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) { return nine_tarot(card, context, 'vulpix') || item_evo(self, card, context, 'j_poke_ninetales'); },
  },
  // Ninetales 038
  ninetales: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Medium'] });
        info_queue.push({ set: 'Spectral', key: 'c_medium' });
        info_queue.push({ key: 'purple_seal', set: 'Other' });
      }
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'ninetales');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) { return nine_tarot(card, context, 'ninetales'); },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) {
        const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_medium');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
      }
    },
  },
  // Jigglypuff 039
  jigglypuff: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_moonstone);
      return { vars: [center.ability.extra.mult, localize(center.ability.extra.suit, 'suits_singular'), center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          return { message: 'Puff!', colour: 'MULT', mult: card.ability.extra.mult, chips: card.ability.extra.chips, card };
        }
      }
      return item_evo(self, card, context, 'j_poke_wigglytuff');
    },
  },
  // Wigglytuff 040
  wigglytuff: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.chips, localize(center.ability.extra.suit, 'suits_singular')] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.is_suit(card.ability.extra.suit)) {
        if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) {
          const total_chips = poke_total_chips(context.other_card);
          return { message: 'Tuff!', colour: 'MULT', mult: card.ability.extra.mult, chips: card.ability.extra.chips + total_chips, card };
        }
      }
      return undefined;
    },
  },
  // Zubat 041 (3.9.1: eats the Enhancement of the first scoring Enhanced card, +mult_mod Mult when it does)
  zubat: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint) {
        const v = context.scoring_hand.find((c) => c.config.center !== P_CENTERS.c_base);
        if (v && !v.debuff && !v.vampired) {
          eat_enhancement(v);
          scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_key: 'a_mult', message_colour: 'MULT' });
        }
      }
      if (context.joker_main && card.ability.extra.mult > 0) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return scaling_evo(self, card, context, 'j_poke_golbat', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Golbat 042 (3.9.1: +mult_mod Mult per Enhancement eaten; the chips / XMult / money halves are gone)
  golbat: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra;
      return { vars: [ex.mult, ex.mult_mod, Math.max(0, self.config.evo_rqmt - ex.eaten)] };
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint) {
        let m_count = 0;
        for (const v of context.scoring_hand) {
          if (v.config.center !== P_CENTERS.c_base && !v.debuff && !v.vampired) {
            m_count = m_count + 1;
            eat_enhancement(v);
            card.ability.extra.eaten = card.ability.extra.eaten + 1;
          }
        }
        if (m_count > 0) {
          scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT',
            operation: (t, k, initial, change) => { t[k] = initial + change * m_count; } });
        }
      }
      if (context.joker_main && card.ability.extra.mult > 0) {
        return { message: localize('poke_screech_ex'), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return scaling_evo(self, card, context, 'j_poke_crobat', card.ability.extra.eaten, self.config.evo_rqmt);
    },
  },
  // Oddish 043
  oddish: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); const ex = center.ability.extra; return { vars: [ex.mult, ex.mult2, ex.rounds, ex.mult1] }; },
    calculate(self, card, context) { return odd_mult(card, context, 'oddish') || level_evo(self, card, context, 'j_poke_gloom'); },
  },
  // Gloom 044
  gloom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_leafstone, P_CENTERS.c_poke_sunstone);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult2, center.ability.extra.mult1] };
    },
    calculate(self, card, context) { return odd_mult(card, context, 'gloom') || item_evo(self, card, context); },
  },
  // Vileplume 045
  vileplume: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); const ex = center.ability.extra; return { vars: [ex.Xmult_multi, ex.mult, ex.Xmult_multi2] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff) {
        if (poke_is_odd(context.other_card)) {
          // 3.9.1: +mult, X(Xmult_multi2) or X(Xmult_multi), a third each.
          const random = pseudorandom('vileplume');
          if (random < 1 / 3) return { mult: card.ability.extra.mult, card };
          if (random < 2 / 3) return { x_mult: card.ability.extra.Xmult_multi2, card };
          return { x_mult: card.ability.extra.Xmult_multi, card };
        }
      }
      return undefined;
    },
  },
  // Paras 046
  paras: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint && context.poker_hands['Two Pair'].length) {
          card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          return { message: localize('k_upgrade_ex'), colour: 'MULT' };
        }
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_parasect', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Parasect 047
  parasect: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.mult_mod2] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (!context.blueprint) {
          if (context.before && context.poker_hands['Two Pair'].length) {
            card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
            return { message: localize('k_upgrade_ex'), colour: 'MULT' };
          } else if (context.before && card.ability.extra.mult > 0) {
            card.ability.extra.mult = Math.max(0, card.ability.extra.mult - card.ability.extra.mult_mod2); // (3.9.1: floors at 0)
            return { message: localize({ type: 'variable', key: 'a_mult_minus', vars: [card.ability.extra.mult_mod2] }), colour: 'RED', card };
          }
        }
        if (context.joker_main && card.ability.extra.mult > 0) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return undefined;
    },
  },
  // Venonat 048 (mod_probability: the engine's probability_vars seam)
  venonat: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.plus_odds, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return plus_odds(card, context) || level_evo(self, card, context, 'j_poke_venomoth'); },
  },
  // Venomoth 049
  venomoth: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.plus_odds] }; },
    calculate(self, card, context) { return plus_odds(card, context); },
  },
  // Diglett 050
  diglett: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds, center.ability.extra.chips, center.ability.extra.mult] }; },
    calculate(self, card, context) { return dig_calc(card, context, false) || level_evo(self, card, context, 'j_poke_dugtrio'); },
  },
  // Dugtrio 051
  dugtrio: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.chips] }; },
    calculate(self, card, context) { return dig_calc(card, context, true); },
  },
  // Meowth 052
  meowth: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.money, center.ability.extra.money_mod, self.config.evo_rqmt] }; },
    calculate(self, card, context) {
      lucky_money(card, context);
      return scaling_evo(self, card, context, 'j_poke_persian', card.ability.extra.money, self.config.evo_rqmt);
    },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'meowth', card.ability.extra.money, true); },
  },
  // Persian 053
  persian: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'persian');
      return { vars: [center.ability.extra.money, center.ability.extra.money_mod, num, dem] };
    },
    calculate(self, card, context) { lucky_money(card, context); return undefined; },
    calc_dollar_bonus(self, card) {
      let payout = card.ability.extra.money;
      if (pseudorandom_probability(card, 'persian', card.ability.extra.num, card.ability.extra.dem, 'persian')) payout = payout * 2;
      return ease_poke_dollars(card, 'persian', payout, true);
    },
  },
  // Psyduck 054
  psyduck: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.money, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main && lone_face(context)) {
        const earned = ease_poke_dollars(card, 'psyduck', card.ability.extra.money);
        return { message: '$' + earned, colour: 'MONEY' };
      }
      return level_evo(self, card, context, 'j_poke_golduck');
    },
  },
  // Golduck 055
  golduck: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.money] }; },
    calculate(self, card, context) {
      // 3.9.1: earn $money whenever any card becomes Gold (Steamodded setting_ability), the lone face included.
      if (context.setting_ability && !context.unchanged && context.new === 'm_gold') {
        const earned = ease_poke_dollars(card, 'golduck', card.ability.extra.money);
        return { message: '$' + earned, colour: 'MONEY' };
      }
      if (context.before && lone_face(context)) {
        const face = context.scoring_hand[0];
        face.set_ability(P_CENTERS.m_gold, null, true);
        G.E_MANAGER.add_event(() => { face.juice_up(); });
        return { message: localize('k_gold'), colour: 'MONEY', card };
      }
      return undefined;
    },
  },
  // Mankey 056
  mankey: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult_mod, center.ability.extra.chip_mod, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && is_prime(context.other_card)) {
        return { chips: card.ability.extra.chip_mod, mult: card.ability.extra.mult_mod, card };
      }
      return level_evo(self, card, context, 'j_poke_primeape');
    },
  },
  // Primeape 057
  primeape: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const primes_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.primes_played);
      return { vars: [card.ability.extra.mult_mod, card.ability.extra.chip_mod, primes_left] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && is_prime(context.other_card)) {
        card.ability.extra.primes_played = card.ability.extra.primes_played + 1;
        return { chips: card.ability.extra.chip_mod, mult: card.ability.extra.mult_mod, card };
      }
      return scaling_evo(self, card, context, 'j_poke_annihilape', card.ability.extra.primes_played, self.config.evo_rqmt);
    },
  },
  // Growlithe 058
  growlithe: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_firestone);
      return { vars: [center.ability.extra.mult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Flush.length) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return item_evo(self, card, context, 'j_poke_arcanine');
    },
  },
  // Arcanine 059
  arcanine: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_mult);
      return { vars: [center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.poker_hands && !context.poker_hands.Flush.length) return undefined;
      // 3.9.1: the first unenhanced scoring card becomes Mult (no longer copied by Blueprint).
      if (context.before && !context.blueprint) {
        const v = context.scoring_hand.find((c) => c.config.center_key === 'c_base');
        if (v) {
          v.set_ability(P_CENTERS.m_mult, null, true);
          G.E_MANAGER.add_event(() => { v.juice_up(); });
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'MULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Poliwag 060
  poliwag: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds, localize(poli_suit(), 'suits_singular'), ...SUITS_PLURAL()], colours: ['SUITS.' + poli_suit()] };
    },
    calculate(self, card, context) {
      // (3.9.1: the suit cycles after every scored hand in the mod-level calculate — systems/rules.js — not here.)
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && context.other_card.is_suit(poli_suit())) {
        return { mult: card.ability.extra.mult, card };
      }
      return level_evo(self, card, context, 'j_poke_poliwhirl');
    },
  },
}, FILE);
