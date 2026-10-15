// Pokermon 3.2.1 — enhancements/enhancement1.lua: Hazard (no rank or suit, no chips, always
// scores; 1 in 6 to be destroyed when held at end of round) and Flower (X3 Mult when the scoring
// hand has 4 suits). Neither is ever in a pool. no_rank / no_suit / replace_base_card /
// always_scores and enhancement `calculate` are engine seams (core.js get_id / is_suit /
// get_chip_bonus / mod_card_calculate, run.js scoring + end_of_round).
import { G, defineEnhancements, pseudorandom_probability, get_probability_vars, poke_remove_card, poke_suit_check } from '../api.js';

const FILE = 'enhancements/enhancement1.lua';

defineEnhancements({
  hazard: {
    loc_vars(self, info_queue, center) {
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'hazard');
      return { vars: [num, dem] };
    },
    in_pool() { return false; },
    calculate(self, card, context) {
      if (context.end_of_round && !context.individual && !context.repetition && context.cardarea === G.hand) {
        if (pseudorandom_probability(card, 'hazard', self.config.num, self.config.dem, 'hazard')) poke_remove_card(card, card);
      }
      return undefined;
    },
  },
  flower: {
    loc_vars(self, info_queue, center) { return { vars: [((center && center.ability && center.ability.extra) || self.config.extra).Xmult] }; },
    in_pool() { return false; },
    calculate(self, card, context) {
      if (context.main_scoring && context.cardarea === G.play) {
        if (poke_suit_check(context.scoring_hand, 4)) return { x_mult: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
}, FILE);
