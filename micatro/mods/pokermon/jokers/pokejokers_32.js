// Pokermon 3.9.1 — pokemon/pokejokers_32.lua (Pokédex 931-960: Charcadet -> Wiglett), 7 jokers + 4 new in 3.9.1
// (Bramblin / Brambleghast, Rellor / Rabsca: at the end, new-jokers sub-batch 15; static data: data391.js new_jokers).
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom_element, pseudoseed,
  defineJokers, type_tooltip, detailed, level_evo, item_evo, has_enhancement, pseudorandom_multi, poke_drain,
  smods_debuff_card,
  scaling_evo, poke_change_growth_level, add_card, get_probability_vars, pseudorandom_probability,
} from '../api.js';

const FILE = 'pokemon/pokejokers_32.lua';
// Bramblin / Brambleghast, Rellor / Rabsca (3.9.1, new-jokers sub-batch 15)
/** The round's Bramblin rank (G.GAME.current_round.bramblincard, systems/rules.js reset_game_globals), localized. */
const bramblin_rank = () => localize((G.GAME.current_round.bramblincard && G.GAME.current_round.bramblincard.rank) || 'Ace', 'ranks');
/** `before`: the second scoring card of the round's rank (counted across the round's hands) becomes a Seed card. */
function bramble_seed(card, context, level0) {
  for (let i = 0; i < context.scoring_hand.length; i++) {
    const sc = context.scoring_hand[i];
    if (sc.get_id() === G.GAME.current_round.bramblincard.id) {
      card.ability.extra.rank_scored = card.ability.extra.rank_scored + 1;
      if (card.ability.extra.rank_scored === 2) {
        sc.set_ability(P_CENTERS.m_poke_seed, null, true);
        if (level0) sc.ability.extra.level = 0;
        G.E_MANAGER.add_event(() => { sc.juice_up(); });
        card.ability.extra.seed_added = card.ability.extra.seed_added + 1;
        break;
      }
    }
  }
}
/** Item cards used this run: Steamodded counts every consumable set in G.GAME.consumeable_usage_total[set:lower()]; 3.9.1
 *  reads `poke_item` (its set key), our canonical Item set counts as `item`. */
const items_used_run = () => (G.GAME.consumeable_usage_total && G.GAME.consumeable_usage_total.item) || 0;

// ------------------------------------------------------------ shared bodies
/**
 * Tinkatink line: debuff N non-Steel cards on blind select, +mult per played card, lift them at round end.
 * Pokermon 3.9.1: the debuff source is '<name><unique_val>' and the lift clears only that source (3.2.1's 'reset' wiped
 * every source on every playing card — another Tinka's, a Boss's).
 */
const tinka_src = (card) => card.config.center.name + card.unique_val;
function tinka_calc(card, context, seed) {
  if (context.setting_blind) {
    const add = (v) => !has_enhancement(v, 'm_steel');
    const modify = (v) => smods_debuff_card(v, true, seed + card.unique_val);
    pseudorandom_multi({ array: G.playing_cards, amt: card.ability.extra.cards_debuffed, seed, add_con: add, mod_func: modify });
  }
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
    return { mult: card.ability.extra.mult, card };
  }
  return undefined;
}
function tinka_reset(card, context) {
  if (context.end_of_round && !context.individual && !context.repetition) {
    for (const v of G.playing_cards) smods_debuff_card(v, false, tinka_src(card));
  }
}
const tinka_remove = {
  remove_from_deck(self, card, from_debuff) {
    if (!from_debuff || (from_debuff && card.ability.perishable && card.ability.perish_tally === 0)) {
      for (const v of G.playing_cards) smods_debuff_card(v, false, tinka_src(card));
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
    knockoff_pseudol: true,
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
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 15)
  // Bramblin 946: the second scoring card of the round's rank (bramblincard) becomes a Seed card; evolves after drawing
  // 160 cards during Blinds.
  bramblin: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      return { vars: [bramblin_rank(), Math.max(0, self.config.evo_rqmt - center.ability.extra.cards_drawn)] };
    },
    calculate(self, card, context) {
      // (SMODS.drawn_cards = Micatro's context.hand_drawn, during the Blind)
      if (context.hand_drawn && !context.blueprint) card.ability.extra.cards_drawn = card.ability.extra.cards_drawn + context.hand_drawn.length;
      if (context.before && !context.blueprint && card.ability.extra.seed_added <= 0) bramble_seed(card, context, false);
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        card.ability.extra.rank_scored = 0;
        card.ability.extra.seed_added = 0;
      }
      return scaling_evo(self, card, context, 'j_poke_brambleghast', card.ability.extra.cards_drawn, self.config.evo_rqmt);
    },
  },
  // Brambleghast 947: +1 growth level; +2 Chips per $1 you have; the second scoring card of the round's rank becomes a
  // Seed card (level 0).
  brambleghast: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      info_queue.push({ set: 'Other', key: 'growth_level' });
      return { vars: [center.ability.extra.chip_mod, center.ability.extra.chip_mod * Math.max(0, (G.GAME.dollars || 0) + (G.GAME.dollar_buffer || 0)),
        bramblin_rank(), center.ability.extra.growth] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        return { chips: card.ability.extra.chip_mod * Math.max(0, G.GAME.dollars + (G.GAME.dollar_buffer || 0)) };
      }
      if (context.before && !context.blueprint && card.ability.extra.seed_added <= 0) bramble_seed(card, context, true);
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        card.ability.extra.rank_scored = 0;
        card.ability.extra.seed_added = 0;
      }
      return undefined;
    },
    add_to_deck(self, card) { poke_change_growth_level(card.ability.extra.growth); },
    remove_from_deck(self, card) { poke_change_growth_level(-card.ability.extra.growth); },
  },
  // Rellor 953: +1 Mult per Item card used this run; evolves after using 5 Items.
  rellor: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.mult_mod, items_used_run() * card.ability.extra.mult_mod, Math.max(self.config.evo_rqmt - card.ability.extra.items_used, 0)] };
    },
    calculate(self, card, context) {
      if (context.joker_main && items_used_run() > 0) return { mult: items_used_run() * card.ability.extra.mult_mod };
      if (context.using_consumeable && !context.blueprint && context.consumeable.ability.set === 'Item') {
        card.ability.extra.items_used = card.ability.extra.items_used + 1;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' } };
      }
      return scaling_evo(self, card, context, 'j_poke_rabsca', card.ability.extra.items_used, self.config.evo_rqmt);
    },
  },
  // Rabsca 954: +1 Mult per Item card used this run; using an Item gives 1 in 4 for a Tarot card (must have room).
  rabsca: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'rabsca');
      return { vars: [card.ability.extra.mult_mod, items_used_run() * card.ability.extra.mult_mod, num, dem] };
    },
    calculate(self, card, context) {
      if (context.joker_main && items_used_run() > 0) return { mult: items_used_run() * card.ability.extra.mult_mod };
      if (context.using_consumeable && context.consumeable.ability.set === 'Item') {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          if (pseudorandom_probability(card, 'rabsca', card.ability.extra.num, card.ability.extra.dem, 'rabsca')) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot' }); G.GAME.consumeable_buffer = 0; });
            card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_tarot'), colour: 'PURPLE' });
          }
        }
        return { extra: { message: localize('k_upgrade_ex'), colour: 'MULT' } };
      }
      return undefined;
    },
  },
}, FILE);
