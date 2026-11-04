// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0494_victini.lua: Victini (new in 1.7.9; Legendary).
// Triples every listed probability (Steamodded's mod_probability: numerator x 3) and gains X0.05 Mult each time one is rolled
// (`from_roll`: the code scales on every roll; the card text says "when a listed probability succeeds" — the code is ported).
import { defineNacho, type_tooltip, scale_card } from '../api.js';

const FILE = 'src/pokemon/0494_victini.lua';

defineNacho({
  victini: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult, card.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.mod_probability && !context.blueprint) {
        if (context.from_roll) scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', no_message: true });
        return { numerator: context.numerator * 3 };
      }
      if (context.joker_main) return { Xmult: card.ability.extra.Xmult };
      return undefined;
    },
  },
}, FILE);
