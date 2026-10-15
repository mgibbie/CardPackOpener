// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0702_dedenne.lua (Dedenne) and 0703_carbink.lua (Carbink).
import { G, P_CENTERS, localize, card_eval_status_text, create_card, pseudorandom, next, has_enhancement, has_no_rank, defineNacho, type_tooltip } from '../api.js';

defineNacho({
  // Dedenne 702: a Gold card held in hand has a 1 in 4 chance to make an Item when it triggers
  dedenne: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_gold);
      return { vars: [card.ability.extra.odds] };
    },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.hand) {
        if ((next(context.card_effects[0] || {}) || context.card_effects.length > 1) && has_enhancement(context.other_card, 'm_gold')
          && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          if (pseudorandom('dedenne') < G.GAME.probabilities.normal / card.ability.extra.odds) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => {
              const _card = create_card('Item', G.consumeables, null, null, null, null);
              _card.add_to_deck();
              G.consumeables.emplace(_card);
              card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'item' });
              G.GAME.consumeable_buffer = 0;
            });
            return { repetitions: 0, card };
          }
        }
      }
      return undefined;
    },
  },
}, 'src/pokemon/0702_dedenne.lua');

defineNacho({
  // Carbink 703: cards with no rank (Stone, Hazard) also count as Gold cards (a quantum enhancement)
  carbink: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_gold);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.check_enhancement && !context.blueprint) {
        if (has_no_rank(context.other_card)) return { m_gold: true };
      }
      return undefined;
    },
    in_pool() {
      for (const v of G.playing_cards || []) if (has_no_rank(v)) return true;
      return false;
    },
  },
}, 'src/pokemon/0703_carbink.lua');
