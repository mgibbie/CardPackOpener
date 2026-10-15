// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0704_goomy.lua: Goomy, Sliggoo, Goodra, Hisuian Sliggoo,
// Hisuian Goodra.
import {
  G, localize, card_eval_status_text, create_card, next, has_enhancement, get_flush,
  defineNacho, type_tooltip, scaling_evo, main_eval,
} from '../api.js';

const FILE = 'src/pokemon/0704_goomy.lua';

/** -> the Flush's suit (undefined when every flush card is Wild) and whether all are Wild. */
function flush_suit(scoring_hand) {
  const scoring_flush = get_flush(scoring_hand)[0];
  if (!scoring_flush) return null;
  let wildcount = 0, matching_suit;
  for (const c of scoring_flush) {
    if (has_enhancement(c, 'm_wild')) wildcount = wildcount + 1;
    else matching_suit = c.base.suit;
  }
  return { all_wild: wildcount === scoring_flush.length, suit: matching_suit };
}
const unique_ranks = (scoring_hand) => new Set(scoring_hand.map((c) => c.get_id())).size;
const upgrade = (card) => ({ extra: { message: localize('k_upgrade_ex'), colour: 'MULT' }, colour: 'MULT', card });
/** first / second rank of a Flush House (the first two distinct ids among the scoring cards). */
function fh_ranks(scoring_hand) {
  let first_rank_id, first_rank, second_rank;
  for (const sc of scoring_hand) {
    if (first_rank === undefined && sc.get_id() > 0) { first_rank_id = sc.get_id(); first_rank = sc.base.nominal; }
    else if (second_rank === undefined && sc.get_id() > 0 && sc.get_id() !== first_rank_id) second_rank = sc.base.nominal;
  }
  return [first_rank, second_rank];
}
function metal_coat() {
  if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
    const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_metalcoat');
    _card.add_to_deck();
    G.consumeables.emplace(_card);
    card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
  }
}
const pluralise = (n, one, many) => (n === 1 ? one : many);

defineNacho({
  // Goomy 704: a Flush gives played + held cards of its suit +1 perma Mult
  goomy: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt1 - card.ability.extra.flushes;
      return { vars: [card.ability.extra.mult_mod, Math.max(0, left), pluralise(left, 'Flush', 'Flushes')] };
    },
    calculate(self, card, context) {
      if (context.before && main_eval(context)) {
        if (context.scoring_name === 'Flush') { card.ability.extra.flushes = card.ability.extra.flushes + 1; return undefined; }
        if (context.scoring_name === 'Flush House') { card.ability.extra.flush_houses = card.ability.extra.flush_houses + 1; return undefined; }
      }
      if (context.individual && (context.cardarea === G.hand || context.cardarea === G.play) && !context.end_of_round) {
        if (next(context.poker_hands.Flush)) {
          const f = flush_suit(context.scoring_hand);
          if (f && (f.all_wild || context.other_card.is_suit(f.suit))) {
            context.other_card.ability.perma_mult = (context.other_card.ability.perma_mult || 0) + card.ability.extra.mult_mod;
            return upgrade(card);
          }
        }
      }
      return scaling_evo(self, card, context, 'j_nacho_hisuian_sliggoo', card.ability.extra.flush_houses, self.config.evo_rqmt2)
        || scaling_evo(self, card, context, 'j_nacho_sliggoo', card.ability.extra.flushes, self.config.evo_rqmt1);
    },
  },
  // Sliggoo 705: a Flush gives +1 perma Mult per unique scoring rank
  sliggoo: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt - card.ability.extra.flushes;
      return { vars: [card.ability.extra.mult_mod, Math.max(0, left), pluralise(left, 'Flush', 'Flushes')] };
    },
    calculate(self, card, context) {
      if (context.before && main_eval(context) && context.scoring_name === 'Flush') { card.ability.extra.flushes = card.ability.extra.flushes + 1; return undefined; }
      if (context.individual && (context.cardarea === G.hand || context.cardarea === G.play) && !context.end_of_round && context.scoring_name === 'Flush') {
        const f = flush_suit(context.scoring_hand);
        if (f && (f.all_wild || context.other_card.is_suit(f.suit))) {
          context.other_card.ability.perma_mult = (context.other_card.ability.perma_mult || 0) + card.ability.extra.mult_mod * unique_ranks(context.scoring_hand);
          return upgrade(card);
        }
      }
      return scaling_evo(self, card, context, 'j_nacho_goodra', card.ability.extra.flushes, self.config.evo_rqmt);
    },
  },
  // Goodra 706: a Flush gives X0.02 perma Mult per unique scoring rank
  goodra: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) {
      // Intended-design fix: the Lua tests `context.cardarea == G.hand or G.play` — always true, so
      // the perma XMult also reached Pokermon's scry cards; the author meant played + held cards
      // (as Goomy / Sliggoo and the card text say).
      if (context.individual && (context.cardarea === G.hand || context.cardarea === G.play) && !context.end_of_round && context.scoring_name === 'Flush') {
        const f = flush_suit(context.scoring_hand);
        if (f && (f.all_wild || context.other_card.is_suit(f.suit))) {
          context.other_card.ability.perma_x_mult = (context.other_card.ability.perma_x_mult || 0) + card.ability.extra.Xmult_mod * unique_ranks(context.scoring_hand);
          return upgrade(card);
        }
      }
      return undefined;
    },
  },
  // Hisuian Sliggoo 705-1: a Flush House makes a Metal Coat (two when its ranks are > 6 apart)
  hisuian_sliggoo: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const left = self.config.evo_rqmt - card.ability.extra.flush_houses;
      return { vars: [Math.max(0, left), pluralise(left, 'Flush House', 'Flush Houses')] };
    },
    calculate(self, card, context) {
      if (context.before && main_eval(context) && context.scoring_name === 'Flush House') { card.ability.extra.flush_houses = card.ability.extra.flush_houses + 1; return undefined; }
      if (context.joker_main && context.scoring_name === 'Flush House') {
        const [first_rank, second_rank] = fh_ranks(context.scoring_hand);
        metal_coat();
        if (Math.abs(second_rank - first_rank) > 6) metal_coat();
      }
      return scaling_evo(self, card, context, 'j_nacho_hisuian_goodra', card.ability.extra.flush_houses, self.config.evo_rqmt);
    },
  },
  // Hisuian Goodra 706-1: a Flush House makes a Metal Coat; held Steel cards give X(rank gap / 3)
  hisuian_goodra: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      if (context.before && main_eval(context) && context.scoring_name === 'Flush House') metal_coat();
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && context.scoring_name === 'Flush House') {
        const [first_rank, second_rank] = fh_ranks(context.scoring_hand);
        card.ability.extra.Xmult = Math.abs(second_rank - first_rank) / 3;
        if (has_enhancement(context.other_card, 'm_steel') && card.ability.extra.Xmult > 1) return { xmult: card.ability.extra.Xmult, card };
      }
      return undefined;
    },
  },
}, FILE);
