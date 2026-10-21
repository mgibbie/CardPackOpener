// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0819_skwovet.lua: Skwovet, Greedent.
// 1.7.9: scales through SMODS.scale_card while a blind is being played (G.GAME.blind.in_blind: Micatro's facing_blind);
// Skwovet evolves at 12 Mult (scaling_evo); Greedent's 1 in 8 Negative Leftovers ("Stuff Cheeks!") skips a used Leftovers.
// Both: no Perishable.
import { G, localize, card_eval_status_text, defineNacho, type_tooltip, scaling_evo, scale_card, get_probability_vars, pseudorandom_probability, add_card } from '../api.js';
import { defer, in_blind } from '../dip.js';

const FILE = 'src/pokemon/0819_skwovet.lua';
const grow = (card) => scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });

defineNacho({
  // Skwovet 819: +1 Mult per consumable used in a blind
  skwovet: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.mult, card.ability.extra.mult_mod] }; },
    calculate(self, card, context) {
      if (context.using_consumeable && in_blind() && !context.blueprint) grow(card);
      if (context.joker_main) return { mult: card.ability.extra.mult };
      return scaling_evo(self, card, context, 'j_nacho_greedent', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Greedent 820: as Skwovet, and a 1 in 8 chance per consumable used in a blind to make a Negative Leftovers
  greedent: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, den] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.den, 'greedent');
      return { vars: [card.ability.extra.mult, card.ability.extra.mult_mod, num, den] };
    },
    calculate(self, card, context) {
      if (context.using_consumeable && in_blind()) {
        if (!context.blueprint) grow(card);
        if (pseudorandom_probability(card, 'greedent', card.ability.extra.num, card.ability.extra.den, 'greedent') && !card.debuff
          && context.consumeable && context.consumeable.config.center.key !== 'c_poke_leftovers') {
          defer(() => { add_card({ set: 'Item', area: G.consumeables, edition: 'e_negative', key: 'c_poke_leftovers' }); });
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_stuff_cheeks_ex'), colour: 'item' });
        }
      }
      if (context.joker_main) return { mult: card.ability.extra.mult };
      return undefined;
    },
  },
}, FILE);
