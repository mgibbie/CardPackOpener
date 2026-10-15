// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0390_chimchar.lua: Chimchar, Monferno, Infernape.
import { G, localize, ease_discard, defineNacho, type_tooltip, scaling_evo } from '../api.js';

const FILE = 'src/pokemon/0390_chimchar.lua';

const add_discards = (self, card) => {
  G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size;
  ease_discard(card.ability.extra.d_size);
};
const remove_discards = (self, card) => {
  G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size;
  ease_discard(-card.ability.extra.d_size);
};
const last_discarded = (context) => context.other_card === context.full_hand[context.full_hand.length - 1];
const reset = () => ({ message: localize('k_reset'), colour: 'RED' });

defineNacho({
  // Chimchar 390: Mult = the highest rank discarded this round
  chimchar: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.d_size, card.ability.extra.mult, Math.max(0, self.config.evo_rqmt - card.ability.extra.max_scored)] };
    },
    calculate(self, card, context) {
      if (context.discard && !context.blueprint && !context.other_card.debuff) {
        const prev_mult = card.ability.extra.mult;
        if (card.ability.extra.mult < context.other_card.base.nominal) card.ability.extra.mult = context.other_card.base.nominal;
        if (last_discarded(context) && card.ability.extra.mult > prev_mult) return { message: localize('k_upgrade_ex'), colour: 'RED' };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return { mult: card.ability.extra.mult };
      if (context.end_of_round && context.game_over === false && !context.blueprint && !context.repetition && !context.individual) {
        if (card.ability.extra.mult >= 11) card.ability.extra.max_scored = card.ability.extra.max_scored + 1;
        card.ability.extra.mult = 0;
        return scaling_evo(self, card, context, 'j_nacho_monferno', card.ability.extra.max_scored, self.config.evo_rqmt) || reset();
      }
      return undefined;
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
  // Monferno 391: gains the highest rank of each discard; resets each round
  monferno: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.d_size, card.ability.extra.mult, Math.max(0, self.config.evo_rqmt - card.ability.extra.max_scored)] };
    },
    calculate(self, card, context) {
      if (context.discard && !context.blueprint && !context.other_card.debuff) {
        if (card.ability.extra.highest_rank < context.other_card.base.nominal) card.ability.extra.highest_rank = context.other_card.base.nominal;
        if (last_discarded(context)) {
          card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.highest_rank;
          card.ability.extra.highest_rank = 0;
          return { message: localize('k_upgrade_ex'), colour: 'RED' };
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return { mult: card.ability.extra.mult };
      if (context.end_of_round && context.game_over === false && !context.blueprint && !context.repetition && !context.individual) {
        if (card.ability.extra.mult >= 30) card.ability.extra.max_scored = card.ability.extra.max_scored + 1;
        card.ability.extra.mult = 0;
        return scaling_evo(self, card, context, 'j_nacho_infernape', card.ability.extra.max_scored, self.config.evo_rqmt) || reset();
      }
      return undefined;
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
  // Infernape 392: +30 Mult, X0.3 per discarded face card / Ace this round
  infernape: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.d_size, card.ability.extra.mult, card.ability.extra.Xmult_mod, card.ability.extra.Ymult] };
    },
    calculate(self, card, context) {
      if (context.discard && !context.blueprint && !context.other_card.debuff) {
        if (context.other_card.is_face() || context.other_card.get_id() === 14) {
          card.ability.extra.Ymult = card.ability.extra.Ymult + card.ability.extra.Xmult_mod;
          return { message: localize('k_upgrade_ex'), colour: 'RED' };
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize('poke_close_combat_ex'), colour: 'XMULT', mult_mod: card.ability.extra.mult, Xmult_mod: card.ability.extra.Ymult };
      }
      if (context.end_of_round && context.game_over === false && context.main_eval && !context.blueprint) {
        card.ability.extra.Ymult = 1.0;
        return reset();
      }
      return undefined;
    },
    add_to_deck: add_discards,
    remove_from_deck: remove_discards,
  },
}, FILE);
