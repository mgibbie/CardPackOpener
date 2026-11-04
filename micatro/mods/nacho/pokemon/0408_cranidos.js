// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0408_cranidos.lua: Cranidos, Rampardos (new in 1.7.9; Ancient 5s, the fossils'
// "ancient" attribute: the Fossil Excavator's Ancient Pack offers them).
// Ancient 5s, counted in the played hand: 1+ the first played 5 gives +5 Mult (Rampardos: x the number of 5s played); 2+ the
// first unscored card is destroyed; 3+ it also gives X1.1 (Rampardos: X(1 + 0.1 x the 5s)); Rampardos 4+: every other 5 leaves
// the scoring hand and the first 5 is retriggered once per Ancient 5 less one. Cranidos evolves after 5 hands of 3+.
// The first 5 is remembered by sort_id (abilities stay plain data; the Lua keeps the card).
import { G, localize, defineNacho, type_tooltip, scaling_evo } from '../api.js';
import { con, calc, defer_after_play, get_ancient_amount, in_scoring } from '../dip.js';

const FILE = 'src/pokemon/0408_cranidos.lua';

const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [rank] });
const first_five_of = (cards) => { for (const v of cards) if (v.get_id() === 5) return v.sort_id; return undefined; };
const is_first_five = (a, c) => a.first_five !== undefined && c.sort_id === a.first_five;
/** 2: the first played card that doesn't score is destroyed */
function destroy_first_unscored(a, context) {
  if (context.destroy_card && !context.blueprint && context.cardarea === 'unscored' && a.ancient_count >= 2) {
    const first = calc.find_playing_card((c) => !in_scoring(c, context.scoring_hand), context.full_hand, 1);
    if (context.destroy_card === first) return { remove: true };
  }
  return undefined;
}

defineNacho({
  // Cranidos 408
  cranidos: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      const rank = localize(a.rank, 'ranks');
      ancient_tip(info_queue, rank);
      return { vars: [rank, a.mult, a.Xmult_multi, Math.max(self.config.evo_rqmt - a.third_times, 0)] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.press_play && !context.blueprint) {
        get_ancient_amount(G.hand.highlighted, 5, card);
        a.first_five = first_five_of(G.hand.highlighted);
      }
      if (context.individual && context.cardarea === G.play && context.other_card.get_id() === 5 && is_first_five(a, context.other_card)) {
        const eff = { card: context.other_card };
        if (a.ancient_count >= 1) eff.mult = a.mult;
        if (a.ancient_count >= 3) eff.xmult = a.Xmult_multi;
        return eff;
      }
      const d = destroy_first_unscored(a, context);
      if (d) return d;
      if (context.after) {
        if (a.ancient_count >= 3) a.third_times = a.third_times + 1;
        a.first_five = undefined;
        a.ancient_count = 0;
      }
      return scaling_evo(self, card, context, 'j_nacho_rampardos', a.third_times, self.config.evo_rqmt);
    },
  },
  // Rampardos 409
  rampardos: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      const rank = localize(a.rank, 'ranks');
      ancient_tip(info_queue, rank);
      return { vars: [rank, a.mult, a.Xmult_mod, a.retriggers] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.press_play && !context.blueprint) {
        defer_after_play(() => {
          get_ancient_amount(G.play.cards, 5, card);
          a.first_five = first_five_of(G.play.cards);
        });
      }
      if (context.individual && context.cardarea === G.play && context.other_card.get_id() === 5 && is_first_five(a, context.other_card)) {
        const fives = context.full_hand.filter((c) => c.get_id() === 5).length;
        const eff = { card: context.other_card };
        if (a.ancient_count >= 1) eff.mult = a.mult * fives;
        if (a.ancient_count >= 3) eff.xmult = 1 + a.Xmult_mod * fives;
        return eff;
      }
      const d = destroy_first_unscored(a, context);
      if (d) return d;
      // 4: every 5 but the first leaves the scoring hand; the first is retriggered once per Ancient 5 less one
      if (context.modify_scoring_hand && context.in_scoring && !is_first_five(a, context.other_card)) {
        if (context.other_card.get_id() === 5 && a.ancient_count >= 4) return { remove_from_hand: true };
      }
      if (con.has_repeat_effect(context) && context.cardarea === G.play && context.other_card.get_id() === 5 && a.ancient_count >= 4) {
        return { repetitions: a.retriggers * a.ancient_count - 1 };
      }
      if (context.after) {
        a.first_five = undefined;
        a.ancient_count = 0;
      }
      return undefined;
    },
  },
}, FILE);
