// Pokermon+ 1.2.0 — src/pokemon/874_stonjourner_line.lua: Stonjourner (1.2.0: can't be Perishable).
// Adjacent jokers each give X(Xmult_multi); after 8 different (visible) poker hands it gains
// +X0.25 and the list starts over.
import { G, localize, juice_card } from '../../../pokermon/api.js';
import { unique_hand_tooltip, HAND_ORDER } from '../functions.js';

export default {
  stonjourner: {
    loc_vars(self, info_queue, card) {
      unique_hand_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.Xmult_multi, a.Xmult_mod, a.count || 0] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.scoring_hand && !context.individual && !context.repetition && !context.blueprint) {
        const visible_hands = HAND_ORDER.filter((h) => G.GAME.hands[h] && G.GAME.hands[h].visible);
        if (context.before && context.cardarea === G.jokers) {
          if (!a.played_hands) a.played_hands = {};
          let played_hand;
          for (let i = visible_hands.length - 1; i >= 0; i--) {
            const h = visible_hands[i];
            if (context.poker_hands[h] && context.poker_hands[h].length) { played_hand = h; break; }
          }
          if (played_hand) {
            // (A repeated hand changes nothing — the Lua's "repeat resets" branch is commented out.)
            if (!a.played_hands[played_hand]) {
              a.played_hands[played_hand] = true;
              a.count = a.count - 1;
            }
            if (a.count <= 0) {
              a.played_hands = {};
              a.count = a.reset;
              a.Xmult_multi = a.Xmult_multi + a.Xmult_mod;
            }
          }
        }
      }
      if (context.other_joker && !context.blueprint) {
        const pos = G.jokers.cards.indexOf(card);
        if (pos >= 0 && (context.other_joker === G.jokers.cards[pos - 1] || context.other_joker === G.jokers.cards[pos + 1])) {
          G.E_MANAGER.add_event(() => juice_card(context.other_joker));
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [a.Xmult_multi] }), colour: 'XMULT', Xmult_mod: a.Xmult_multi };
        }
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) { card.ability.extra.count = card.ability.extra.reset; card.ability.extra.played_hands = {}; }
    },
  },
};
