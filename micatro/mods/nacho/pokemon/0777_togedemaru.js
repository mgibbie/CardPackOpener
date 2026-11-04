// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0777_togedemaru.lua: Togedemaru (new in 1.7.9; a BFP design by One Punch Idiot).
// Each Lightning joker gives X1.3 Mult; at the end of each won round every Metal joker earns $3.
import { G, defineNacho, type_tooltip, ease_poke_dollars, calculate_effect, main_eval } from '../api.js';
import { con } from '../dip.js';

const FILE = 'src/pokemon/0777_togedemaru.lua';

defineNacho({
  togedemaru: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_multi, card.ability.extra.money_mod] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.other_joker && con.is_lightning(context.other_joker)) return { Xmult: a.Xmult_multi, card: context.other_joker };
      if (context.end_of_round && main_eval(context) && !context.individual && !context.repetition && !context.game_over) {
        for (const v of G.jokers.cards.filter((j) => con.is_metal(j))) {
          const earned = ease_poke_dollars(v, 'togedemaru', a.money_mod, true);
          calculate_effect({ dollars: earned }, v);
        }
      }
      return undefined;
    },
  },
}, FILE);
