// Pokermon+ 1.2.0 — src/pokemon/694_helioptile_line.lua: Helioptile (evolves with a Sun Stone), Heliolisk (new).
// Helioptile: a scored Wild card earns $1, 1 in 4 for $2 instead.
// Heliolisk: a scored Wild card earns $money_mod (from $2), and 1 in 4 raises it by $1 (after paying); back to $2 at end of round.
// Both pay through pokermon.ease_poke_dollars (Energy money fractions) and are pool-gated on a Wild card in the deck.
import { G, get_probability_vars, pseudorandom_probability, ease_poke_dollars, item_evo, has_enhancement } from '../../../pokermon/api.js';

const wild_scored = (context) => context.individual && context.cardarea === G.play && context.other_card
  && has_enhancement(context.other_card, 'm_wild') && !context.end_of_round && !context.before && !context.after && !context.other_card.debuff;
function buffer(n) {
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + n;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
}

export default {
  helioptile: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      const [num, dem] = get_probability_vars(card, a.numerator, a.denominator, 'helioptile');
      return { vars: [a.money_mod, a.money_mod * 2, card.sell_cost, num, dem] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (wild_scored(context)) {
        const bonus = pseudorandom_probability(card, 'helioptile', a.numerator, a.denominator, 'helioptile') ? a.money_mod * 2 : a.money_mod;
        buffer(bonus);
        return { dollars: ease_poke_dollars(card, 'helioptile', bonus, true), card };
      }
      return item_evo(self, card, context, 'j_sonfive_heliolisk');
    },
  },
  heliolisk: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      const [num, dem] = get_probability_vars(card, a.numerator, a.denominator, 'helioptile');
      return { vars: [a.money_mod, a.money_mod * 2, card.sell_cost, num, dem, a.money_mod1] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (wild_scored(context)) {
        const total = a.money_mod;
        if (pseudorandom_probability(card, 'heliolisk', a.numerator, a.denominator, 'heliolisk')) a.money_mod = a.money_mod + a.money_mod1;
        buffer(total);
        const earned = ease_poke_dollars(card, 'heliolisk', total, true);
        if (earned && earned > 0) return { dollars: earned, card };
      }
      if (context.end_of_round) a.money_mod = a.money_mod2;
      return undefined;
    },
  },
};
