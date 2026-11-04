// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0704_goomy.lua: Goomy, Sliggoo, Goodra, Hisuian Sliggoo, Hisuian Goodra.
// 1.7.9: the Flush and its suit are read when the hand is played (press_play, PkmnDip.calc.get_flush_suit: 'Any' for an
// all-Wild Flush); every played or held card of that suit gains the perma bonus. Goodra's value is `Xmult_multi`. The Metal
// Coats come through pokermon.create_consumeable. POKE_EVO_OVERRIDES: Sliggoo's highest evo is Goodra and Hisuian Sliggoo's is
// Hisuian Goodra (../index.js adds the two lines to Pokermon's EVO_OVERRIDES).
import { G, localize, has_enhancement, get_flush, defineNacho, type_tooltip, scaling_evo, main_eval, create_consumeable } from '../api.js';
import { calc, con, utils } from '../dip.js';

const FILE = 'src/pokemon/0704_goomy.lua';

/** press_play: the played Flush (if any) and its suit; cleared after the hand. */
function read_flush(card, context) {
  const a = card.ability.extra;
  if (context.press_play) {
    a.scoring_flush = !!get_flush(G.hand.highlighted)[0];
    a.matching_suit = a.scoring_flush ? calc.get_flush_suit(G.hand.highlighted) : undefined;
  }
  if (context.after) { a.scoring_flush = undefined; a.matching_suit = undefined; }
}
const suit_ok = (a, c) => a.matching_suit === 'Any' || (a.matching_suit && c.is_suit(a.matching_suit));
const unique_ranks = (scoring_hand) => utils.count_unique(scoring_hand, (c) => c.get_id());
const upgrade = (card) => ({ extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, card });
const pluralise = (n, one, many) => (n === 1 ? one : many);

defineNacho({
  // Goomy 704: in a Flush, played + held cards of its suit gain +1 perma Mult (6 Flushes: Sliggoo; 1 Flush House: Hisuian Sliggoo)
  goomy: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt1 - card.ability.extra.flushes;
      return { vars: [card.ability.extra.mult_mod, Math.max(0, left), pluralise(left, 'Flush', 'Flushes')] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.press_play) read_flush(card, context);
      if (context.before && !context.blueprint) {
        if (context.scoring_name === 'Flush') a.flushes = a.flushes + 1;
        else if (context.scoring_name === 'Flush House') a.flush_houses = a.flush_houses + 1;
      }
      if (context.individual && con.played_or_held(context) && !context.end_of_round) {
        if (context.poker_hands && context.poker_hands.Flush && context.poker_hands.Flush.length && a.scoring_flush && suit_ok(a, context.other_card)) {
          context.other_card.ability.perma_mult = (context.other_card.ability.perma_mult || 0) + a.mult_mod;
          return upgrade(card);
        }
      }
      if (context.after) read_flush(card, context);
      return scaling_evo(self, card, context, 'j_nacho_hisuian_sliggoo', a.flush_houses, self.config.evo_rqmt2)
        || scaling_evo(self, card, context, 'j_nacho_sliggoo', a.flushes, self.config.evo_rqmt1);
    },
  },
  // Sliggoo 705: a Flush gives its suit's played + held cards +1 perma Mult per unique scoring rank (8 Flushes: Goodra)
  sliggoo: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt - card.ability.extra.flushes;
      return { vars: [card.ability.extra.mult_mod, Math.max(0, left), pluralise(left, 'Flush', 'Flushes')] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.press_play) read_flush(card, context);
      if (context.before && !context.blueprint && context.scoring_name === 'Flush') a.flushes = a.flushes + 1;
      if (context.individual && context.scoring_name === 'Flush' && a.scoring_flush && con.played_or_held(context) && !context.end_of_round && suit_ok(a, context.other_card)) {
        context.other_card.ability.perma_mult = (context.other_card.ability.perma_mult || 0) + a.mult_mod * unique_ranks(context.scoring_hand);
        return upgrade(card);
      }
      if (context.after) read_flush(card, context);
      return scaling_evo(self, card, context, 'j_nacho_goodra', a.flushes, self.config.evo_rqmt);
    },
  },
  // Goodra 706: a Flush gives its suit's played + held cards +X0.02 perma Mult per unique scoring rank
  goodra: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.press_play) read_flush(card, context);
      if (context.individual && context.scoring_name === 'Flush' && a.scoring_flush && con.played_or_held(context) && !context.end_of_round && suit_ok(a, context.other_card)) {
        context.other_card.ability.perma_x_mult = (context.other_card.ability.perma_x_mult || 0) + a.Xmult_multi * unique_ranks(context.scoring_hand);
        return upgrade(card);
      }
      if (context.after) read_flush(card, context);
      return undefined;
    },
  },
  // Hisuian Sliggoo 705-1: a Flush House makes a Metal Coat (two when its ranks are > 6 apart); 6 of them: Hisuian Goodra
  hisuian_sliggoo: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt - card.ability.extra.flush_houses;
      return { vars: [Math.max(0, left), pluralise(left, 'Flush House', 'Flush Houses')] };
    },
    calculate(self, card, context) {
      if (context.before && main_eval(context) && context.scoring_name === 'Flush House') {
        if (!context.blueprint) card.ability.extra.flush_houses = card.ability.extra.flush_houses + 1;
        create_consumeable('c_poke_metalcoat', true, card);
        const [first_rank, second_rank] = calc.get_full_house(context.scoring_hand, 'nominal');
        if (Math.abs(second_rank - first_rank) > 6) create_consumeable('c_poke_metalcoat', true, card);
      }
      return scaling_evo(self, card, context, 'j_nacho_hisuian_goodra', card.ability.extra.flush_houses, self.config.evo_rqmt);
    },
    in_pool() { return G.GAME.hands['Flush House'].played > 0; },
  },
  // Hisuian Goodra 706-1: a Flush House makes a Metal Coat; held Steel cards give X(rank gap / 3)
  hisuian_goodra: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.scoring_name === 'Flush House') {
        if (context.before && main_eval(context)) create_consumeable('c_poke_metalcoat', true, card);
        if (context.individual && context.cardarea === G.hand && !context.end_of_round) {
          const [first_rank, second_rank] = calc.get_full_house(context.scoring_hand, 'nominal');
          a.Xmult_steel = Math.abs(second_rank - first_rank) / 3;
          if (a.Xmult_steel > 1 && has_enhancement(context.other_card, 'm_steel')) return { xmult: a.Xmult_steel };
        }
      }
      return undefined;
    },
    in_pool() { return G.GAME.hands['Flush House'].played > 0; },
  },
}, FILE);
