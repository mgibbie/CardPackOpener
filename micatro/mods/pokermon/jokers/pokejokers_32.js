// Pokermon 3.2.1 — pokemon/pokejokers_32.lua (Pokédex 931-960: Charcadet -> Wiglett), 7 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom_element, pseudoseed,
  defineJokers, type_tooltip, detailed, level_evo, item_evo, has_enhancement, pseudorandom_multi, poke_drain,
  smods_debuff_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_32.lua';

// ------------------------------------------------------------ shared bodies
/** Tinkatink line: debuff N non-Steel cards on blind select, +mult per played card, reset at round end. */
function tinka_calc(card, context, seed) {
  if (context.setting_blind) {
    const add = (v) => !has_enhancement(v, 'm_steel');
    const modify = (v) => smods_debuff_card(v, true, card);
    pseudorandom_multi({ array: G.playing_cards, amt: card.ability.extra.cards_debuffed, seed, add_con: add, mod_func: modify });
  }
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
    return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
function tinka_reset(card, context) {
  if (context.end_of_round && !context.individual && !context.repetition) {
    for (const v of G.playing_cards) smods_debuff_card(v, 'reset', card);
  }
}
const tinka_remove = {
  remove_from_deck(self, card, from_debuff) {
    if (!from_debuff || (from_debuff && card.ability.perishable && card.ability.perish_tally === 0)) {
      for (const v of G.playing_cards) smods_debuff_card(v, 'reset', card);
    }
  },
};
const tinka_vars = (center) => [center.ability.extra.mult, center.ability.extra.rounds, center.ability.extra.cards_debuffed];
const reset_xmult = (card, context) => {
  if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
    card.ability.extra.Xmult = card.ability.extra.Xmult2;
    return { message: localize('k_reset'), colour: 'RED' };
  }
  return undefined;
};
/** Wiglett / Wugtrio: chips if a 5/6/7 scores, mult (or Xmult) on a Three of a Kind. */
function dig_calc(card, context, xmult) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    let score_chips = false, score_mult = false;
    if (context.poker_hands['Three of a Kind'].length) score_mult = true;
    for (const v of context.scoring_hand) {
      if (v.get_id() === 5 || v.get_id() === 6 || v.get_id() === 7) { score_chips = true; break; }
    }
    const m = xmult ? { Xmult_mod: card.ability.extra.Xmult } : { mult_mod: card.ability.extra.mult };
    if (score_mult && score_chips) return { message: localize('poke_dig_ex'), colour: 'MULT', chip_mod: card.ability.extra.chips, ...m, card };
    if (score_chips) return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips, card };
    if (score_mult) {
      return xmult
        ? { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'MULT', Xmult_mod: card.ability.extra.Xmult, card }
        : { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult, card };
    }
  }
  return undefined;
}
export { dig_calc };

defineJokers({
  // Charcadet 935
  charcadet: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.c_poke_dawnstone);
        info_queue.push(P_CENTERS.c_poke_duskstone);
      }
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
        if (context.after && !context.blueprint) {
          card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          return { message: localize('k_upgrade_ex'), colour: 'MULT' };
        }
      }
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.mult = card.ability.extra.mult_original;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset'), colour: 'RED' });
      }
      return item_evo(self, card, context);
    },
  },
  // Armarouge 936
  armarouge: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
        if (context.after && !context.blueprint) {
          const starting_Xmult = card.ability.extra.Xmult;
          if (card.ability.extra.Xmult >= 2) card.ability.extra.Xmult = card.ability.extra.Xmult - card.ability.extra.Xmult_mod;
          else card.ability.extra.Xmult = 1;
          if (card.ability.extra.Xmult !== starting_Xmult) {
            return { message: localize({ type: 'variable', key: 'a_xmult_minus', vars: [card.ability.extra.Xmult_mod] }), colour: 'RED', card };
          }
        }
      }
      return reset_xmult(card, context);
    },
  },
  // Ceruledge 937
  ceruledge: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'poke_drain' });
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.money_minus] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
        if (context.after && !context.blueprint) {
          card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
          G.E_MANAGER.add_event(() => {
            const drain_jokers = [];
            for (let i = 0; i < G.jokers.cards.length; i++) {
              if (G.jokers.cards[i] !== card && G.jokers.cards[i].sell_cost > 1) drain_jokers.push(G.jokers.cards[i]);
            }
            // (SMODS's pseudorandom_element turns the string seed into pseudoseed('ceruledge').)
            if (drain_jokers.length > 0) poke_drain(card, pseudorandom_element(drain_jokers, pseudoseed('ceruledge'))[0], card.ability.extra.money_minus);
          });
          return { message: localize('k_upgrade_ex'), colour: 'MULT' };
        }
      }
      return reset_xmult(card, context);
    },
  },
  // Tinkatink 957
  tinkatink: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      return { vars: tinka_vars(center) };
    },
    calculate(self, card, context) {
      const r = tinka_calc(card, context, 'tinkatink');
      if (r) return r;
      tinka_reset(card, context);
      return level_evo(self, card, context, 'j_poke_tinkatuff');
    },
    ...tinka_remove,
  },
  // Tinkatuff 958
  tinkatuff: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      return { vars: tinka_vars(center) };
    },
    calculate(self, card, context) {
      const r = tinka_calc(card, context, 'tinkatuff');
      if (r) return r;
      tinka_reset(card, context);
      return level_evo(self, card, context, 'j_poke_tinkaton');
    },
    ...tinka_remove,
  },
  // Tinkaton 959
  tinkaton: {
    quantum_enhancements: true, // answers check_enhancement (core.js quantum_enhancements)
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.m_steel);
        info_queue.push(P_CENTERS.m_glass);
      }
      return { vars: tinka_vars(center) };
    },
    calculate(self, card, context) {
      const r = tinka_calc(card, context, 'tinkaton');
      if (r) return r;
      // Quantum enhancement (SMODS check_enhancement): Steel cards are also Glass cards.
      if (context.check_enhancement) {
        if (has_enhancement(context.other_card, 'm_steel')) return { m_glass: true };
      }
      tinka_reset(card, context);
      return undefined;
    },
    ...tinka_remove,
  },
  // Wiglett 960
  wiglett: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rounds, center.ability.extra.chips, center.ability.extra.mult] };
    },
    calculate(self, card, context) {
      const r = dig_calc(card, context, false);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_wugtrio');
    },
  },
}, FILE);
