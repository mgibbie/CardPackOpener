// Pokermon 3.9.1 — pokemon/pokejokers_28.lua (Pokédex 811-840: Nickit -> Boltund), 4 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds; 3.9.1 changed only text / refactors here).
import {
  G, localize, defineJokers, type_tooltip, level_evo, ease_poke_dollars,
} from '../api.js';

const FILE = 'pokemon/pokejokers_28.lua';

defineJokers({
  // Nickit 827
  nickit: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      return level_evo(self, card, context, 'j_poke_thievul');
    },
    calc_dollar_bonus(self, card) {
      return ease_poke_dollars(card, 'nickit', card.ability.extra.money, true);
    },
  },
  // Thievul 828
  thievul: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const first = G.jokers && G.jokers.cards && G.jokers.cards[0];
      return { vars: [(first && first !== center && Math.min(first.sell_cost * 2, 15)) || 0] };
    },
    calc_dollar_bonus(self, card) {
      if (G.jokers.cards.length > 1 && G.jokers.cards[0] !== card) {
        return ease_poke_dollars(card, 'thievul', Math.min(G.jokers.cards[0].sell_cost * 2, 15), true);
      }
      return undefined;
    },
  },
  // Yamper 835
  yamper: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.money, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.poker_hands.Straight.length) {
          ease_poke_dollars(card, 'yamper', card.ability.extra.money);
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return level_evo(self, card, context, 'j_poke_boltund');
    },
  },
  // Boltund 836
  boltund: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && context.poker_hands.Straight.length) {
          ease_poke_dollars(card, 'boltund', card.ability.extra.money);
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'MULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      return undefined;
    },
  },
}, FILE);
