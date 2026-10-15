// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0819_skwovet.lua: Skwovet, Greedent.
import {
  G, localize, card_eval_status_text, create_card, defineNacho, type_tooltip, scaling_evo,
  get_probability_vars, pseudorandom_probability,
} from '../api.js';

const FILE = 'src/pokemon/0819_skwovet.lua';
const end_of_blind = (context) => context.end_of_round && !(context.game_over === true) && context.main_eval && !context.blueprint;

defineNacho({
  // Skwovet 819: +1 Mult per consumable used during a blind
  skwovet: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.mult, card.ability.extra.mult_mod] }; },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint) { card.ability.extra.in_blind = true; return undefined; }
      if (context.using_consumeable && card.ability.extra.in_blind && !context.blueprint) {
        card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        return { message: localize('k_upgrade_ex'), colour: 'RED' };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) return { mult: card.ability.extra.mult };
      if (end_of_blind(context)) card.ability.extra.in_blind = false;
      return scaling_evo(self, card, context, 'j_nacho_greedent', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Greedent 820: + a 1 in 8 chance of a Negative Leftovers per consumable used during a blind
  greedent: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const [num, den] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.den, 'greedent');
      return { vars: [card.ability.extra.mult, card.ability.extra.mult_mod, num, den] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && !context.blueprint) { card.ability.extra.in_blind = true; return {}; }
      if (context.using_consumeable && card.ability.extra.in_blind) {
        if (!context.blueprint) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        if (pseudorandom_probability(card, 'greedent', card.ability.extra.num, card.ability.extra.den, 'greedent') && !card.debuff
          && context.consumeable.config.center.key !== 'c_poke_leftovers') {
          const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_leftovers');
          _card.set_edition({ negative: true }, true);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_stuff_cheeks_ex'), colour: 'FILTER' });
        }
        return { message: localize('k_upgrade_ex'), colour: 'RED' };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult: card.ability.extra.mult };
      }
      if (end_of_blind(context)) card.ability.extra.in_blind = false;
      return undefined;
    },
  },
}, FILE);
