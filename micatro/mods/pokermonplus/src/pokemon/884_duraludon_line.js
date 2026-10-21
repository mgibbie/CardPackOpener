// Pokermon+ 1.2.0 — src/pokemon/884_duraludon_line.lua: Duraludon (evolves with a Metal Tera sticker), Archaludon (new).
// Duraludon: X2 Mult every 2nd hand played ("Recharging.." on the others).
// Archaludon: on the charging hands it gains X0.5 Mult plus X0.5 per Lightning joker you have; on the others it scores the
// X Mult it built up. Back to X1 at end of round.
// (1.2.0 lists G-Max Duraludon only with Agarmons, commented out: not ported.)
import { G, localize, type_evo, find_pokemon_type } from '../../../pokermon/api.js';

const state = (a) => (a.hands_played % 2 === 0 ? '1 remaining' : 'Active!');
const xm = (x) => ({ message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }), colour: 'XMULT', Xmult_mod: x });

export default {
  duraludon: {
    loc_vars(self, info_queue, card) { return { vars: [card.ability.extra.Xmult, state(card.ability.extra)] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.joker_main && !context.repetition) {
        const odd = a.hands_played % 2 === 1;
        a.hands_played = a.hands_played + 1;
        return odd ? xm(a.Xmult) : { message: 'Recharging..' };
      }
      return type_evo(self, card, context, 'j_sonfive_archaludon', 'metal');
    },
  },
  archaludon: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      return { vars: [a.Xmult_mod, a.Xmult, state(a), a.hands_played % 2 === 1 ? '1 remaining' : 'Active!'] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const count = 1 + find_pokemon_type('Lightning').length;
      if (context.joker_main && !context.repetition) {
        const odd = a.hands_played % 2 === 1;
        a.hands_played = a.hands_played + 1;
        if (odd) return xm(a.Xmult);
        a.Xmult = a.Xmult + count * a.Xmult_mod;
        return { message: 'Absorbing..' };
      }
      if (context.end_of_round && !context.repetition && !context.individual && !context.blueprint) {
        a.Xmult = a.Xmult1;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
};
