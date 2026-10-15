// Pokermon+ — src/pokemon/932_nacli_line.lua: Nacli, Naclstack, Garganacl. None can be debuffed
// (functions.js set_debuff).
//
// Intended-design fix: Nacli was declared stage "One" although it is the first of the three
// (Nacli -> Naclstack "One" -> Garganacl "Two"; it is also the only one with a shop rarity, 3 —
// the other two are Safari, evolution-only). As "One" a Poké Ball (Basic) could never give it, a
// Great Ball (stage One) could, and Naclstack had no previous stage to devolve to (Pokermon's
// get_previous_evo looks for a Basic). It is staged "Basic" (set in index.js).
//
// The Lua wraps the removal in `Event({ remove(...) })`, which calls remove() immediately while
// building the table (and queues an empty event) — so the rightmost joker goes right away; same here.
import { G, localize, type_tooltip, scaling_evo, is_type, get_probability_vars, pseudorandom_probability, remove } from '../../../pokermon/api.js';

/** "Salt Cure": when a Blind is selected, maybe destroy the rightmost joker (guaranteed — or 2x
 *  likelier — when it's Water or Metal) and grow. -> the message table, or undefined. */
function salt_cure(self, card, context, seed, grow) {
  if (!context.setting_blind || context.blueprint) return undefined;
  const abbr = card.ability.extra;
  const rightmost = G.jokers.cards[G.jokers.cards.length - 1];
  if (!rightmost || rightmost === card || rightmost.ability.eternal) return undefined;
  const den = is_type(rightmost, 'Metal') || is_type(rightmost, 'Water') ? abbr.denominator / 2 : abbr.denominator;
  if (pseudorandom_probability(card, seed, abbr.numerator, den, seed)) {
    grow(abbr);
    remove(self, rightmost, context);
    return { message: localize('sonfive_saltcure_ex'), colour: '#A8F2FF' };
  }
  return undefined;
}
const xmult_main = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult }
  : undefined);
const prob = (card) => get_probability_vars(card, card.ability.extra.numerator, card.ability.extra.denominator, 'nacli');

export default {
  nacli: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [n, d] = prob(card);
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult, n, d] };
    },
    calculate(self, card, context) {
      const r = salt_cure(self, card, context, 'nacli', (a) => { a.Xmult = a.Xmult + a.Xmult_mod; });
      if (r) return r;
      const m = xmult_main(card, context);
      if (m) return m;
      return scaling_evo(self, card, context, 'j_sonfive_naclstack', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  naclstack: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [n, d] = prob(card);
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult, n, d, d / 2] };
    },
    calculate(self, card, context) {
      const r = salt_cure(self, card, context, 'naclstack', (a) => { a.Xmult = a.Xmult + a.Xmult_mod; });
      if (r) return r;
      const m = xmult_main(card, context);
      if (m) return m;
      return scaling_evo(self, card, context, 'j_sonfive_garganacl', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  garganacl: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [n, d] = prob(card);
      return { vars: [card.ability.extra.Xmult_multi, card.ability.extra.Xmult, n, d, d / 2] };
    },
    calculate(self, card, context) {
      const r = salt_cure(self, card, context, 'garganacl', (a) => { a.Xmult = a.Xmult * a.Xmult_multi; });
      if (r) return r;
      return xmult_main(card, context);
    },
  },
};
