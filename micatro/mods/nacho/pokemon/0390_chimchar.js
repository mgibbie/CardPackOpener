// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0390_chimchar.lua: Chimchar, Monferno, Infernape.
// 1.7.9 rework: Chimchar / Monferno evolve after 4 rounds (1.6.4: by scoring rounds of 11+ / 30+ Mult), and their Mult comes
// from each discard's highest card (Chimchar: the best one this round; Monferno: the sum). Infernape scales by SMODS.scale_card.
import { G, localize, card_eval_status_text, ease_discard, defineNacho, type_tooltip, level_evo, scale_card, main_eval } from '../api.js';

const FILE = 'src/pokemon/0390_chimchar.lua';

const add_discards = (self, card) => {
  G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size;
  ease_discard(card.ability.extra.d_size);
};
const remove_discards = (self, card) => {
  G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size;
  ease_discard(-card.ability.extra.d_size);
};
/** get_highest(full_hand)[1][1].base.nominal: the discard's highest card (by get_nominal), its rank value. */
function highest_rank(hand) {
  let highest = null;
  for (const v of hand) if (!highest || v.get_nominal() > highest.get_nominal()) highest = v;
  return highest ? highest.base.nominal : 0;
}
const reset = (card) => card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
const loc = (self, info_queue, card) => {
  type_tooltip(self, info_queue, card);
  const e = card.ability.extra;
  return { vars: [e.d_size, e.mult, e.rounds] };
};

defineNacho({
  // Chimchar 390: +1 discard; Mult = the highest rank discarded this round (4 rounds to evolve)
  chimchar: {
    loc_vars: loc,
    calculate(self, card, context) {
      const e = card.ability.extra;
      if (context.pre_discard && !context.blueprint) {
        const r = highest_rank(context.full_hand);
        if (e.mult < r) {
          e.mult = r;
          return { message: localize('k_upgrade_ex'), colour: 'RED' };
        }
      }
      if (context.joker_main) return { mult: e.mult };
      if (context.end_of_round && main_eval(context) && !context.individual && !context.repetition && !context.blueprint) {
        e.mult = 0;
        reset(card);
      }
      return level_evo(self, card, context, 'j_nacho_monferno');
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
  // Monferno 391: +1 discard; gains each discard's highest rank as Mult, resets each round (4 rounds to evolve)
  monferno: {
    loc_vars: loc,
    calculate(self, card, context) {
      const e = card.ability.extra;
      if (context.pre_discard && !context.blueprint) {
        e.mult = e.mult + highest_rank(context.full_hand);
        return { message: localize('k_upgrade_ex'), colour: 'RED' };
      }
      if (context.joker_main) return { mult: e.mult };
      if (context.end_of_round && context.game_over === false && main_eval(context) && !context.individual && !context.repetition && !context.blueprint) {
        e.mult = 0;
        reset(card);
      }
      return level_evo(self, card, context, 'j_nacho_infernape');
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
  // Infernape 392: +1 discard; +30 Mult and X Mult (+X0.3 per discarded face card / Ace), resets each round
  infernape: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const e = card.ability.extra;
      return { vars: [e.d_size, e.mult, e.Xmult_mod, e.Xmult] };
    },
    calculate(self, card, context) {
      const e = card.ability.extra;
      if (context.discard && !context.blueprint && !context.other_card.debuff) {
        if (context.other_card.is_face() || context.other_card.get_id() === 14) {
          scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
        }
      }
      if (context.joker_main) {
        return { message: localize('poke_close_combat_ex'), colour: 'XMULT', mult_mod: e.mult, Xmult_mod: e.Xmult };
      }
      if (context.end_of_round && main_eval(context) && !context.individual && !context.repetition && !context.blueprint) {
        e.Xmult = e.Xmult1;
        reset(card);
      }
      return undefined;
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
}, FILE);
