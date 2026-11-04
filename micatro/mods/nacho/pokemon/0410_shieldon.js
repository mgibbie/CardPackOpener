// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0410_shieldon.lua: Shieldon, Bastiodon (new in 1.7.9; Ancient 6s).
// Ancient 6s, counted in the scoring hand: 1+ scoring 6s give +12 Chips (Bastiodon +24) per Ancient 6; 2+ the first scoring
// card becomes Steel; 3+ held Steel cards give the same Chips; Bastiodon 4+: held cards below 6 become Steel. Shieldon evolves
// after 5 hands of 3+.
import { G, localize, has_enhancement, P_CENTERS, defineNacho, type_tooltip, scaling_evo } from '../api.js';
import { defer, get_ancient_amount } from '../dip.js';

const FILE = 'src/pokemon/0410_shieldon.lua';

const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [rank] });
const steel = (c) => { c.set_ability(P_CENTERS.m_steel, null, true); defer(() => c.juice_up()); };
function fossil_six(card, context) {
  const a = card.ability.extra;
  if (context.before && !context.blueprint) get_ancient_amount(context.scoring_hand, 6, card);
  if (context.individual && !context.end_of_round && context.cardarea === G.play && a.ancient_count > 0 && context.other_card.get_id() === 6) {
    return { chips: a.chips * a.ancient_count, card: context.other_card };
  }
  if (context.before && a.ancient_count > 1 && context.scoring_hand[0]) steel(context.scoring_hand[0]);
  if (context.individual && !context.end_of_round && context.cardarea === G.hand && a.ancient_count > 2 && has_enhancement(context.other_card, 'm_steel')) {
    return { h_chips: a.chips * a.ancient_count, card: context.other_card };
  }
  return undefined;
}

defineNacho({
  // Shieldon 410
  shieldon: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      ancient_tip(info_queue, localize(a.rank, 'ranks'));
      return { vars: [localize(a.rank, 'ranks'), a.chips, Math.max(self.config.evo_rqmt - a.third_times, 0)] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const r = fossil_six(card, context);
      if (r) return r;
      if (context.after) {
        if (a.ancient_count > 2) a.third_times = a.third_times + 1;
        a.ancient_count = 0;
      }
      return scaling_evo(self, card, context, 'j_nacho_bastiodon', a.third_times, self.config.evo_rqmt);
    },
  },
  // Bastiodon 411
  bastiodon: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      ancient_tip(info_queue, localize(a.rank, 'ranks'));
      return { vars: [localize(a.rank, 'ranks'), a.chips] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const r = fossil_six(card, context);
      if (r) return r;
      if (context.before && a.ancient_count > 3) for (const v of G.hand.cards) if (v.get_id() < 6) steel(v);
      if (context.after) a.ancient_count = 0;
      return undefined;
    },
  },
}, FILE);
