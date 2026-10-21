// Pokermon+ 1.2.0 — src/pokemon/915_lechonk_line.lua: Lechonk, Oinkologne (reworked in 1.2.0; now by Emma, Lechonk Uncommon).
// At the end of each round the interest you would earn goes into the joker's sell value (Oinkologne: double), and while
// either is held you earn no interest (the lovely patch on the cash out's interest row: index.js `no_interest` hook).
// Lechonk evolves after 5 rounds (level_evo).
// 1.0.3's "Volatile Right" piggy bank (all your money into the sell value when a Blind is selected) is gone.
// (Talisman's to_number is not needed: Micatro's money is a plain number.)
// Intended-design fix: the Lua returns from the banking step before level_evo, so a round that banked interest never counted
// toward the evolution — Lechonk only evolved after 5 rounds with less than $5 ("Evolves after triggering 5 times" says the
// opposite). Ours banks and counts the round.
import { G, level_evo } from '../../../pokermon/api.js';

/** G.GAME.interest_amount * min(floor($ / 5), cap / 5): what the cash out would pay as interest. */
export const interest_now = () => G.GAME.interest_amount * Math.min(Math.floor(G.GAME.dollars / 5), G.GAME.interest_cap / 5);

function bank(card, context, mul) {
  if (context.end_of_round && context.main_eval && !context.blueprint) {
    const earned = interest_now();
    if (earned > 0) {
      card.ability.extra_value = (card.ability.extra_value || 0) + mul * earned;
      card.set_cost();
      return { card };
    }
  }
  return undefined;
}

export default {
  lechonk: {
    loc_vars(self, info_queue, card) { return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      const r = bank(card, context, 1);
      return level_evo(self, card, context, 'j_sonfive_oinkologne') || r;
    },
  },
  oinkologne: {
    loc_vars() { return { vars: [] }; },
    calculate(self, card, context) { return bank(card, context, 2); },
  },
};
