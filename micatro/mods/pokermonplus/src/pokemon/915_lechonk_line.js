// Pokermon+ — src/pokemon/915_lechonk_line.lua: Lechonk, Oinkologne.
// "Volatile Right": when a Blind is selected (and it's the rightmost non-volatile joker), all your
// money goes into its sell value at 75% (Oinkologne 150%).
// Intended-design fix: both are described as "Volatile Right" (and show Pokermon's
// poke_volatile_right tooltip) but only carried `volatile` inside config.extra; Pokermon's
// volatile rule reads the center's `volatile` flag, so other volatile jokers treated them as
// ordinary jokers. The centers carry `volatile: true` (set in index.js).
import { G, type_tooltip, scaling_evo, volatile_active, detailed } from '../../../pokermon/api.js';

function piggy_bank(self, card, context, count) {
  const a = card.ability.extra;
  if (G.GAME.dollars > 0 && context.setting_blind && !context.blueprint && volatile_active(self, card, a.volatile)) {
    if (count) a.triggers = a.triggers + 1;
    const earned = G.GAME.dollars;
    card.ability.extra_value = (card.ability.extra_value || 0) + (a.percentage / 100 * earned);
    card.set_cost();
    return { dollars: a.reset - earned, card };
  }
  return undefined;
}
function loc(self, info_queue, card) {
  type_tooltip(self, info_queue, card);
  if (detailed()) info_queue.push({ set: 'Other', key: 'poke_volatile_' + card.ability.extra.volatile });
}

export default {
  lechonk: {
    loc_vars(self, info_queue, card) {
      loc(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.percentage, a.reset, a.evo_rqmt - a.triggers] };
    },
    calculate(self, card, context) {
      const r = piggy_bank(self, card, context, true);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_sonfive_oinkologne', card.ability.extra.triggers, card.ability.extra.evo_rqmt);
    },
  },
  oinkologne: {
    loc_vars(self, info_queue, card) {
      loc(self, info_queue, card);
      return { vars: [card.ability.extra.percentage, card.ability.extra.reset] };
    },
    calculate(self, card, context) { return piggy_bank(self, card, context, false); },
  },
};
