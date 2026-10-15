// Pokermon 3.2.1 — pokemon/pokejokers_18.lua (Pokédex 511-530: Pansage -> Excadrill), 11 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// The Pansage / Pansear / Panpour lines' Shortcut / Four Fingers / Pareidolia effects are
// find_joker aliases in systems/rules.js (find_joker_alias).
import {
  G, P_CENTERS, localize, card_eval_status_text, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, item_evo,
  has_enhancement, has_no_rank, pseudorandom_probability, get_probability_vars,
  poke_set_hazards, poke_remove_card, poke_create_treasure, create_card,
} from '../api.js';

const FILE = 'pokemon/pokejokers_18.lua';

// ------------------------------------------------------------ shared bodies
/** Roggenrola line: each held no-rank card (Stone / Hazard) gives +mult_mod Mult. */
function rock_held(card, context, count) {
  if (context.individual && !context.end_of_round && context.cardarea === G.hand && has_no_rank(context.other_card)) {
    if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
    if (count && !context.blueprint) card.ability.extra.hazard_triggered = card.ability.extra.hazard_triggered + 1;
    return { h_mult: card.ability.extra.mult_mod, card };
  }
  return undefined;
}
function hazard_tips(info_queue, abbr) {
  info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [abbr.hazards] });
  info_queue.push(P_CENTERS.m_poke_hazard);
}

defineJokers({
  // Pansage 511
  pansage: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_shortcut', config: {} });
      info_queue.push(P_CENTERS.c_poke_leafstone);
      return { vars: [] };
    },
    calculate(self, card, context) { return item_evo(self, card, context, 'j_poke_simisage'); },
  },
  // Simisage 512
  simisage: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_shortcut', config: {} });
      info_queue.push(P_CENTERS.m_lucky);
      const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, 'simisage');
      return { vars: [num, dem] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        let stall_for_effects = false;
        for (const v of context.full_hand) {
          if (v.config.center === P_CENTERS.c_base) {
            if (pseudorandom_probability(card, 'simisage', card.ability.extra.num, card.ability.extra.dem, 'simisage')) {
              stall_for_effects = true;
              v.set_ability(P_CENTERS.m_lucky, null, true);
              G.E_MANAGER.add_event(() => v.juice_up());
            }
          }
        }
        if (stall_for_effects) return { message: localize('k_upgrade_ex'), colour: 'GREEN' };
      }
      return undefined;
    },
  },
  // Pansear 513
  pansear: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_four_fingers', config: {} });
      info_queue.push(P_CENTERS.c_poke_firestone);
      return { vars: [] };
    },
    calculate(self, card, context) { return item_evo(self, card, context, 'j_poke_simisear'); },
  },
  // Simisear 514
  simisear: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_four_fingers', config: {} });
      info_queue.push(P_CENTERS.c_empress);
      const active = G.GAME && G.GAME.current_round && G.GAME.current_round.hands_played === 0;
      return { vars: [active ? '(' + localize('k_active_ex') + ')' : ''] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn) juice_card_until(card, () => G.GAME.current_round.hands_played === 0, true);
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && (context.poker_hands.Straight.length || context.poker_hands.Flush.length) && G.GAME.current_round.hands_played === 0) {
          card.ability.extra.destroy = true;
          if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            return {
              extra: {
                focus: card, message: localize('k_plus_tarot'), colour: 'PURPLE',
                func() {
                  G.E_MANAGER.add_event(() => {
                    const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_empress');
                    _card.add_to_deck();
                    G.consumeables.emplace(_card);
                    G.GAME.consumeable_buffer = 0;
                  });
                },
              },
            };
          }
        }
        if (context.after && card.ability.extra.destroy && !context.blueprint) {
          card.ability.extra.destroy = undefined;
          for (const v of context.full_hand) {
            if (!context.scoring_hand.includes(v)) poke_remove_card(v, card);
          }
        }
      }
      return undefined;
    },
  },
  // Panpour 515
  panpour: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_pareidolia', config: {} });
      info_queue.push(P_CENTERS.c_poke_waterstone);
      return { vars: [] };
    },
    calculate(self, card, context) { return item_evo(self, card, context, 'j_poke_simipour'); },
  },
  // Simipour 516
  simipour: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Joker', key: 'j_pareidolia', config: {} });
      info_queue.push(P_CENTERS.m_bonus);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        let lowest_card = null;
        for (const v of context.full_hand) {
          if (v.config.center === P_CENTERS.c_base) {
            if (!lowest_card) lowest_card = v;
            else if (v.base.nominal < lowest_card.base.nominal) lowest_card = v;
          }
        }
        if (lowest_card) {
          lowest_card.set_ability(P_CENTERS.m_bonus, null, true);
          G.E_MANAGER.add_event(() => lowest_card.juice_up());
        }
      }
      return undefined;
    },
  },
  // Roggenrola 524
  roggenrola: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      hazard_tips(info_queue, abbr);
      return { vars: [abbr.hazards, abbr.mult_mod, Math.max(0, self.config.evo_rqmt - abbr.hazard_triggered)] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      const r = rock_held(card, context, true);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_boldore', card.ability.extra.hazard_triggered, self.config.evo_rqmt);
    },
  },
  // Boldore 525
  boldore: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      hazard_tips(info_queue, abbr);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_linkcable);
      return { vars: [abbr.hazards, abbr.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      const r = rock_held(card, context, false);
      if (r) return r;
      return item_evo(self, card, context, 'j_poke_gigalith');
    },
  },
  // Gigalith 526
  gigalith: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      hazard_tips(info_queue, abbr);
      return { vars: [abbr.hazards, abbr.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      const r = rock_held(card, context, false);
      if (r) return r;
      if (context.repetition && context.cardarea === G.hand && context.card_effects
        && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1) && has_no_rank(context.other_card)) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Drilbur 529
  drilbur: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'dril_treasure' });
      return { vars: [Math.max(0, self.config.evo_rqmt - center.ability.extra.stones_destroyed)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, (c) => c.ability.extra.active, true);
      if (context.destroying_card) {
        if (!context.blueprint && has_enhancement(context.destroying_card, 'm_stone') && card.ability.extra.active) {
          card.ability.extra.active = false;
          card.ability.extra.stones_destroyed = card.ability.extra.stones_destroyed + 1;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_drill_ex'), colour: 'earth' });
          poke_create_treasure(card, 'drilbur');
          return true;
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) card.ability.extra.active = true;
      return scaling_evo(self, card, context, 'j_poke_excadrill', card.ability.extra.stones_destroyed, self.config.evo_rqmt);
    },
  },
  // Excadrill 530
  excadrill: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'exdril_treasure' });
      return { vars: [center.ability.extra.mult_mod, G.GAME.starting_deck_size,
        Math.max(0, center.ability.extra.mult_mod * (G.playing_cards ? (G.GAME.starting_deck_size - G.playing_cards.length) : 0))] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Mult = Math.max(0, card.ability.extra.mult_mod * (G.GAME.starting_deck_size - G.playing_cards.length));
        if (Mult > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [Mult] }), colour: 'MULT', mult_mod: Mult };
      }
      if (context.destroying_card) {
        if (!context.blueprint && has_enhancement(context.destroying_card, 'm_stone')) {
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_drill_ex'), colour: 'earth' });
          poke_create_treasure(card, 'excadril', true);
          return true;
        }
      }
      return undefined;
    },
  },
}, FILE);
