// Pokermon+ — src/pokemon/808_meltan_line.lua: Meltan, Melmetal.
import {
  G, localize, create_card, card_eval_status_text, find_joker, next, has_enhancement, find_pokemon_type,
  type_tooltip, scaling_evo,
} from '../../../pokermon/api.js';

/** SMODS: a held card's repetition only counts when the card did something (card_effects). */
const had_effect = (context) => !!context.card_effects && (next(context.card_effects[0]) || context.card_effects.length > 1);
const melmetal_retriggers = () => find_joker('metal_energy').length + find_pokemon_type('Metal').length;

export default {
  meltan: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.count, card.ability.extra.evo_rqmt, card.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      const abbr = card.ability.extra;
      abbr.odds = 1 / (find_joker('metalcoat').length + 1); // (computed by the Lua, never read)
      if (context.individual && !context.end_of_round && context.cardarea === G.hand) {
        if (has_enhancement(context.other_card, 'm_steel')) abbr.count = abbr.count + 1;
      }
      if (context.repetition && context.cardarea === G.hand && had_effect(context) && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: abbr.retriggers, card };
      }
      return scaling_evo(self, card, context, 'j_sonfive_melmetal', abbr.count, abbr.evo_rqmt);
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) {
        const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_metalcoat');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
        card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'FILTER' });
      }
    },
  },

  melmetal: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [G.jokers ? melmetal_retriggers() : 0] };
    },
    in_pool() { return false; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.hand && had_effect(context) && has_enhancement(context.other_card, 'm_steel')) {
        const retriggers = melmetal_retriggers();
        if (retriggers > 0) return { message: localize('k_again_ex'), repetitions: retriggers, card };
      }
      return undefined;
    },
  },
};
