// Pokermon 3.9.1 — pokemon/pokejokers_23.lua (Pokédex 661-690: Litleo -> Pyroar), 2 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds; 3.9.1 changed only text / refactors here).
import {
  G, localize, create_card,
  defineJokers, type_tooltip, level_evo,
} from '../api.js';

const FILE = 'pokemon/pokejokers_23.lua';

const chips_ret = (card) => ({ message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips });

defineJokers({
  // Litleo 667
  litleo: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Flush.length) return chips_ret(card);
      return level_evo(self, card, context, 'j_poke_pyroar');
    },
  },
  // Pyroar 668
  pyroar: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Flush.length) {
        let kingqueens = 0;
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          for (const c of context.scoring_hand) if (c.get_id() === 13 || c.get_id() === 12) kingqueens = kingqueens + 1;
        }
        if (kingqueens > 0) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          return {
            ...chips_ret(card),
            extra: {
              focus: card, message: localize('poke_plus_energy'), colour: 'pink',
              func() {
                G.E_MANAGER.add_event(() => {
                  const _card = create_card('Energy', G.consumeables, null, null, null, null, null, 'sup');
                  _card.add_to_deck();
                  G.consumeables.emplace(_card);
                  G.GAME.consumeable_buffer = 0;
                });
              },
            },
          };
        }
        return chips_ret(card);
      }
      return undefined;
    },
  },
}, FILE);
