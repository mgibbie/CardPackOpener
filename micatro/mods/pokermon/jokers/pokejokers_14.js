// Pokermon 3.9.1 — pokemon/pokejokers_14.lua (Pokédex 391-420: Bidoof -> Floatzel), 6 jokers + 2 new in 3.9.1.
// The 2 jokers 3.9.1 added to this file (Budew, Roserade) are at the end (new-jokers sub-batch 14; static data: data391.js
// new_jokers). Roserade also lets the Flower card score with 3 suits (enhancements/enhancement1.js).
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
import {
  G, P_CENTERS, localize, create_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, ease_poke_dollars, poke_suit_check,
  get_probability_vars, pseudorandom_probability, faint_baby_poke, add_card, poke_is_odd,
} from '../api.js';
import { calculate_reroll_cost } from '../../../js/engine/core.js';

const FILE = 'pokemon/pokejokers_14.lua';

/**
 * SMODS.change_free_rerolls(mod): free rerolls every shop (round_resets.free_rerolls is added
 * back each round by run.js new_round, like Steamodded) and right now.
 */
function change_free_rerolls(mod) {
  G.GAME.round_resets.free_rerolls = (G.GAME.round_resets.free_rerolls || 0) + mod;
  G.GAME.current_round.free_rerolls = G.GAME.current_round.free_rerolls + mod;
  calculate_reroll_cost(true);
}
const free_rerolls = {
  add_to_deck(self, card) { change_free_rerolls(card.ability.extra.rerolls); },
  remove_from_deck(self, card) { change_free_rerolls(-card.ability.extra.rerolls); },
};
/** Buizel / Floatzel: +chips for each unscored card played. */
function buizel_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.full_hand) {
    if (context.joker_main) {
      const chips = card.ability.extra.chips * Math.abs(context.scoring_hand.length - context.full_hand.length);
      if (chips > 0) return { message: localize({ type: 'variable', key: 'a_chips', vars: [chips] }), colour: 'CHIPS', chip_mod: chips };
    }
  }
  return undefined;
}

defineJokers({
  // Bidoof 399
  bidoof: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rerolls, center.ability.extra.rerolls_to_evolve] };
    },
    calculate(self, card, context) {
      if (context.reroll_shop && !context.blueprint && card.ability.extra.rerolls_to_evolve > 0) {
        card.ability.extra.rerolls_to_evolve = card.ability.extra.rerolls_to_evolve - 1;
      }
      return scaling_evo(self, card, context, 'j_poke_bibarel', self.config.evo_rqmt - card.ability.extra.rerolls_to_evolve, self.config.evo_rqmt);
    },
    ...free_rerolls,
  },
  // Bibarel 400
  bibarel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.rerolls, center.ability.extra.increase, center.ability.extra.rerolls > 1 ? localize('poke_reroll_plural') : localize('poke_reroll_singular')] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && context.game_over === false && context.main_eval && context.beat_boss && !card.debuff) {
        card.ability.extra.rerolls = card.ability.extra.rerolls + card.ability.extra.increase;
        change_free_rerolls(card.ability.extra.increase);
        return { message: localize('k_upgrade_ex'), colour: 'GREEN' };
      }
      return undefined;
    },
    ...free_rerolls,
  },
  // Kricketot 401
  kricketot: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.full_hand.length === 4) {
          if (poke_suit_check(context.full_hand, 4)) {
            const earned = ease_poke_dollars(card, 'kriketot', card.ability.extra.money);
            return { message: '$' + earned, colour: 'MONEY' };
          }
        }
      }
      return level_evo(self, card, context, 'j_poke_kricketune');
    },
  },
  // Kricketune 402
  kricketune: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'kricketune');
      return { vars: [center.ability.extra.money, num, dem] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.full_hand.length === 4) {
          if (poke_suit_check(context.full_hand, 4)) {
            const earned = ease_poke_dollars(card, 'kriketune', card.ability.extra.money);
            // Pokermon 3.9.1: the Tarot needs consumable room (a full row still pays the $).
            if (pseudorandom_probability(card, 'kriketune', card.ability.extra.num, card.ability.extra.dem, 'kriketune')
              && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
              G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
              return {
                message: '$' + earned,
                colour: 'MONEY',
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
            return { message: '$' + earned, colour: 'MONEY' };
          }
        }
      }
      return undefined;
    },
  },
  // Buizel 418
  buizel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = buizel_calc(card, context);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_floatzel');
    },
  },
  // Floatzel 419
  floatzel: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) { return buizel_calc(card, context); },
  },
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 14)
  // Budew 406 (Baby): X0.75 Mult (faints unless only Babies are to its right); a Negative Miracle Seed at end of round;
  // evolves into Roselia in 2 rounds.
  budew: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'baby' });
      if (detailed()) {
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_poke_miracleseed);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        faint_baby_poke(self, card, context);
        return { Xmult: card.ability.extra.Xmult_minus };
      }
      if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
        G.E_MANAGER.add_event(() => { add_card({ set: 'Item', key: 'c_poke_miracleseed', edition: 'e_negative' }); });
      }
      return level_evo(self, card, context, 'j_poke_roselia');
    },
  },
  // Roserade 407 (Roselia's Shiny Stone evolution): the first scoring card of every hand, if Odd, is retriggered twice.
  roserade: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_flower);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card === context.scoring_hand[0] && poke_is_odd(context.other_card)) {
        return { repetitions: card.ability.extra.retriggers };
      }
      return undefined;
    },
  },
}, FILE);
