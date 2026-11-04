// Bunco — decks (Bunco.lua ~7005-7070):
//   Fairy    the Exotic System starts on; after each Boss Blind, 4 random Exotic cards join the deck
//   Digital  Polymino cards appear in the shop (rate 2); starts with The I
import { G, P_CARDS, create_playing_card, pseudorandom_element, pseudoseed } from '../../js/engine/core.js';
import { playing_card_joker_effects } from '../../js/engine/jokers.js';
import { data_of, enable_exotics, RANK_LIST, SEED, localize } from './util.js';

const deck = (key, def) => ({ ...data_of('decks', key), set: 'Back', name: key, unlocked: true, ...def });
export const centers = [
  deck('b_bunc_fairy', {
    loc_vars: (s) => ({ vars: [s.config.amount, localize({ type: 'name_text', set: 'Other', key: 'bunc_exotic_cards' })] }),
    apply() { enable_exotics(); },
    calculate(self, back, ctx) {
      if (!ctx.round_eval || !(G.GAME.last_blind && G.GAME.last_blind.boss)) return;
      G.E_MANAGER.add_event(() => {
        const numbers = RANK_LIST.map((r) => r.card_key);
        const suits = ['bunc_FLEURON', 'bunc_HALBERD'];
        const cards = [];
        for (let i = 0; i < self.config.amount; i++) {
          const rank = pseudorandom_element(numbers, pseudoseed('fairy' + SEED()))[0];
          const suit = pseudorandom_element(suits, pseudoseed('fairy' + SEED()))[0];
          cards.push(create_playing_card({ front: P_CARDS[suit + '_' + rank] }, G.deck));
        }
        playing_card_joker_effects(cards);
      });
    },
  }),
  deck('b_bunc_digital', {
    loc_vars: () => ({ vars: [] }),
    apply(self) { G.GAME.polymino_rate = self.config.polymino_rate; },
  }),
];
export const hooks = {};
