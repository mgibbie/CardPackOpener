// Pokermon+ — src/pokemon/290_nincada_line.lua: Nincada, Ninjask, Shedinja.
import {
  G, localize, pseudorandom, type_tooltip, level_evo, smods_create_card, ease_poke_dollars,
  get_poke_target_card_ranks, add_target_cards_to_vars, remove, STATES,
} from '../../../pokermon/api.js';
import { energy_shift } from '../functions.js';

export default {
  nincada: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.chips, card.ability.extra.mult, card.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        if (pseudorandom('nincada') <= 0.5) {
          return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
        }
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      const evo = level_evo(self, card, context, 'j_sonfive_ninjask');
      // Shedinja appears in the empty shell when Nincada evolves (if there's room).
      if (evo && typeof evo === 'object' && G.jokers && G.jokers.cards.length < G.jokers.config.card_limit && !context.blueprint) {
        G.E_MANAGER.add_event(() => {
          const new_card = smods_create_card({ set: 'Joker', area: G.jokers, key: 'j_sonfive_shedinja', no_edition: true });
          new_card.add_to_deck();
          G.jokers.emplace(new_card);
        });
      }
      return evo;
    },
  },

  ninjask: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.chips, card.ability.extra.mult, 7 - card.ability.extra.speedboost] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { chips: card.ability.extra.chips, mult: card.ability.extra.mult };
      }
      // Speed Boost: +1 Energy's worth (no limit, not counted) per Boss Blind beaten, 6 times.
      if (!context.individual && context.end_of_round && card.ability.extra.speedboost < 7 && !context.repetition && G.GAME.last_blind && G.GAME.last_blind.boss) {
        energy_shift(card, 1, card.ability.extra.ptype, false, true);
        card.ability.extra.speedboost = card.ability.extra.speedboost + 1;
        return { message: localize('sonfive_speedboost'), colour: '#A8F2FF' };
      }
      return undefined;
    },
  },

  shedinja: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      const vars = [abbr.money_mod, abbr.earned, abbr.threshold];
      add_target_cards_to_vars(vars, abbr.targets);
      return { vars };
    },
    calc_dollar_bonus(self, card) {
      card.ability.extra.earned = card.ability.extra.earned + card.ability.extra.money;
      return ease_poke_dollars(card, 'shedinja', card.ability.extra.money, true);
    },
    in_pool() { return false; },
    calculate(self, card, context) {
      if (context.end_of_round && !context.blueprint) {
        card.ability.extra.targets = get_poke_target_card_ranks('shedinja', 3, card.ability.extra.targets, true);
      }
      // Money for the cash-out = $2 per unique rank held in hand (as of the last hand played).
      if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
        const unique_ranks = [];
        if (G.hand && G.hand.cards && G.hand.cards.length > 0) {
          for (const c of G.hand.cards) if (!unique_ranks.includes(c.get_id())) unique_ranks.push(c.get_id());
        }
        card.ability.extra.money = card.ability.extra.money_mod * unique_ranks.length;
      }
      // Wonder Guard: holding one of the 3 target ranks while scoring and it faints.
      if (context.individual && !context.end_of_round && context.cardarea === G.hand && !context.other_card.debuff && !context.blueprint) {
        for (const t of card.ability.extra.targets) {
          // (The shipped default targets hold string ids "14"/"13"/"12" — a number never equals
          //  them in Lua; ranks rolled in a run are numbers. Compared as numbers here.)
          if (context.other_card.get_id() === Number(t.id) && !card.gone) {
            remove(self, card, {});
            if (G.GAME.modifiers.sonfive_wonderguard) {
              // "Guard the Wonder" challenge: losing Shedinja loses the run.
              G.E_MANAGER.add_event(() => { G.STATE = STATES.GAME_OVER; G.STATE_COMPLETE = false; });
            }
          }
        }
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.targets = get_poke_target_card_ranks('shedinja', 3, card.ability.extra.targets, true);
    },
  },
};
