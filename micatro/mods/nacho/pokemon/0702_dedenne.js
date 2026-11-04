// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0702_dedenne.lua: Dedenne.
// 1.7.9 rework: a held Gold card that triggers (Nacho's dedenne_trig context, ../systems.js held_card_evaluated: its end-of-round
// payout, or held-card scoring) has a 1 in 4 chance to make a Pickup Item (pokermon.generate_pickup_item_key; 1.6.4: any Item).
import { G, P_CENTERS, defineNacho, type_tooltip, get_probability_vars, pseudorandom_probability, generate_pickup_item_key, create_consumeable } from '../api.js';

const FILE = 'src/pokemon/0702_dedenne.lua';

defineNacho({
  dedenne: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_gold);
      info_queue.push({ set: 'Other', key: 'pickup' });
      const a = card.ability.extra;
      const [num, den] = get_probability_vars(card, a.num, a.den, 'dedenne');
      return { vars: [num, den] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.dedenne_trig && pseudorandom_probability(card, 'dedenne', a.num, a.den)) {
        const key = generate_pickup_item_key('dedenne');
        return { remove_default_message: true, func: () => { if (key) create_consumeable({ set: 'Item', key }, true, card); } };
      }
      return undefined;
    },
  },
}, FILE);
