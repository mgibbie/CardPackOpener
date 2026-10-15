// Pokermon+ — src/pokemon/974_cetoddle_line.lua: Cetoddle (evolves with an Ice Stone), Cetitan.
// Both grow like Glass Joker (shattered Glass Cards; The Hanged Man destroying Glass); Cetitan
// scores double under "hail" (every card held in hand is Glass).
import { G, localize, card_eval_status_text, has_enhancement, type_tooltip, item_evo } from '../../../pokermon/api.js';
import { hail } from '../functions.js';

/** Glass Joker's two growth paths, shared by both. -> a message table or undefined. */
function glass_growth(card, context) {
  const a = card.ability.extra;
  if (context.remove_playing_cards && !context.blueprint) {
    const glass_cards = context.removed.filter((c) => c.shattered).length;
    if (glass_cards > 0) {
      G.E_MANAGER.add_event(() => {
        G.E_MANAGER.add_event(() => { a.Xmult = a.Xmult + a.Xmult_mod * glass_cards; });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult', vars: [a.Xmult + a.Xmult_mod * glass_cards] }) });
      });
    }
    return undefined;
  }
  // Glass Joker updates on Hanged Man and no other destroy consumable.
  if (context.using_consumeable && !context.blueprint && context.consumeable.config.center.key === 'c_hanged_man') {
    const glass_cards = G.hand.highlighted.filter((c) => has_enhancement(c, 'm_glass')).length;
    if (glass_cards > 0) {
      a.Xmult = a.Xmult + a.Xmult_mod * glass_cards;
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [a.Xmult] }) };
    }
  }
  return undefined;
}

export default {
  cetoddle: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      const g = glass_growth(card, context);
      if (g) return g;
      if (context.joker_main) return { xmult: card.ability.extra.Xmult };
      return item_evo(self, card, context, 'j_sonfive_cetitan');
    },
  },
  cetitan: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      const g = glass_growth(card, context);
      if (g) return g;
      if (context.joker_main) return { xmult: hail() ? card.ability.extra.Xmult * 2 : card.ability.extra.Xmult };
      return undefined;
    },
  },
};
