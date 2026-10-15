// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0863_perrserker.lua: Galarian Meowth, Perrserker.
// Perrserker's "retriggers if all Jokers are Metal" is a Steamodded joker retrigger
// (retrigger_joker_check; the engine's joker_retriggers seam).
import { G, P_CENTERS, localize, next, has_enhancement, defineNacho, type_tooltip, scaling_evo, is_type, poke_get_adjacent_jokers } from '../api.js';

const FILE = 'src/pokemon/0863_perrserker.lua';
const card_did_something = (context) => next(context.card_effects[0] || {}) || context.card_effects.length > 1;

defineNacho({
  // Galarian Meowth 52-2: retrigger the first two held Steel cards; evolves with Metal on both sides
  galarian_meowth: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      return { vars: [card.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
        card.ability.extra.counter = 0;
        return {};
      }
      if (context.repetition && context.cardarea === G.hand && context.card_effects && card_did_something(context)
        && has_enhancement(context.other_card, 'm_steel') && card.ability.extra.counter < 2) {
        if (!context.blueprint && !context.retrigger_joker) card.ability.extra.counter = card.ability.extra.counter + 1;
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return scaling_evo(self, card, context, 'j_nacho_perrserker', card.ability.extra.metals, self.config.evo_rqmt);
    },
    update(self, card) {
      if (card.area === G.jokers) {
        let metals = 0;
        for (const j of poke_get_adjacent_jokers(card)) if (is_type(j, 'Metal')) metals = metals + 1;
        card.ability.extra.metals = metals;
      }
    },
  },
  // Perrserker 863
  perrserker: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(P_CENTERS.m_steel);
      return { vars: [card.ability.extra.Ymult] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint && !context.retrigger_joker) {
        card.ability.extra.counter = 0;
        return {};
      }
      if (context.repetition && context.cardarea === G.hand && context.card_effects && card_did_something(context) && has_enhancement(context.other_card, 'm_steel')) {
        if (!context.blueprint && !context.retrigger_joker) card.ability.extra.counter = card.ability.extra.counter + 1;
        if (card.ability.extra.counter > 3) return undefined;
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      if (context.other_joker && is_type(context.other_joker, 'Metal')) {
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Ymult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Ymult, message_card: context.other_joker };
      }
      if (context.retrigger_joker_check && !context.retrigger_joker) {
        let metals = 0;
        for (const v of G.jokers.cards) if (is_type(v, 'Metal')) metals = metals + 1;
        if (metals === G.jokers.cards.length && context.other_card.ability && context.other_card === card) {
          return { message: localize('k_again_ex'), colour: 'BLACK', repetitions: 1, card };
        }
      }
      return undefined;
    },
  },
}, FILE);
