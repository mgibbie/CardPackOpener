// Pokermon+ — src/pokemon/629_vullaby_line.lua: Vullaby, Mandibuzz.
//
// Vullaby shipped switched OFF (config.lua vullaby = false). Its code is complete and works as
// its text says (nothing is stubbed or commented out, unlike the Croagunk line), so the only
// reason visible for it being off is that it's harsh: the first card of the first hand scores,
// then every scoring card of that hand is debuffed for good (SMODS.debuff_card with Vullaby as
// the source — the rest of that hand no longer scores). It's on by default like every line;
// its toggle stays in the options.
import { G, localize, type_tooltip, scaling_evo, juice_card_until, smods_debuff_card, ease_poke_dollars } from '../../../pokermon/api.js';

const debuffed_in_deck = () => {
  let count = 0;
  for (const v of G.playing_cards || []) if (v.debuff) count++;
  return count;
};

export default {
  vullaby: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] };
    },
    calculate(self, card, context) {
      const abbr = card.ability.extra;
      if (context.first_hand_drawn) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      }
      if (context.individual && context.cardarea === G.play && context.scoring_hand && G.GAME.current_round.hands_played === 0) {
        for (const c of context.scoring_hand) {
          smods_debuff_card(c, true, card.config.center.key);
          abbr.chips = abbr.chips + abbr.chip_mod;
        }
      } else if (context.joker_main) {
        // Evolves after a scoring hand of 5 debuffed cards.
        if (context.scoring_hand.length === 5 && context.scoring_hand.every((c) => c.debuff)) abbr.flush = 1;
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [abbr.chips] }), colour: 'CHIPS', chip_mod: abbr.chips };
      }
      return scaling_evo(self, card, context, 'j_sonfive_mandibuzz', abbr.flush, abbr.evo_rqmt);
    },
  },

  mandibuzz: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const money = center.ability.extra.money || 0;
      const payout = Math.floor(debuffed_in_deck() / 4) * money;
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.money, payout] };
    },
    calc_dollar_bonus(self, card) {
      const money = card.ability.extra.money || 0;
      const payout = Math.floor(debuffed_in_deck() / 4) * money;
      return ease_poke_dollars(card, 'mandibuzz', payout, true);
    },
    calculate(self, card, context) {
      const abbr = card.ability.extra;
      if (context.joker_main && context.scoring_hand) {
        const count = context.scoring_hand.filter((c) => c.debuff).length;
        if (count > 0) abbr.chips = abbr.chips + abbr.chip_mod * count;
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [abbr.chips] }), colour: 'CHIPS', chip_mod: abbr.chips };
      }
      return undefined;
    },
  },
};
