// Pokermon 3.9.1 — pokemon/pokejokers_14.lua (Pokédex 391-420: Bidoof -> Floatzel), 6 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
import {
  G, localize, create_card,
  defineJokers, type_tooltip, scaling_evo, level_evo, ease_poke_dollars, poke_suit_check,
  get_probability_vars, pseudorandom_probability,
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
}, FILE);
