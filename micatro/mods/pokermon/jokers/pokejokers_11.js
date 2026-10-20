// Pokermon 3.9.1 — pokemon/pokejokers_11.lua (Pokédex 301-330: Delcatty -> Spinda), 6 jokers + 15 new in 3.9.1.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, megas, enhancement_gate) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// The 15 jokers 3.9.1 added to this file are at the end (new-jokers sub-batch 12; static data: data391.js new_jokers).
import {
  G, P_CENTERS, localize, card_eval_status_text, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, has_enhancement,
  play_sound, math_random, pseudorandom_element, pseudoseed, all_cards, scale_card, calculate_effect, add_card, create_consumeable,
  find_card, find_pokemon_type, is_type, energize, ease_poke_dollars, poke_is_odd, find_playing_card, get_depleted, get_enhancements,
  get_target_card_enhancements, get_poke_target_card_ranks, add_target_cards_to_vars,
} from '../api.js';
import { blueprint_effect } from './pokejokers_08.js';

const FILE = 'pokemon/pokejokers_11.lua';

/**
 * Aron line: scoring cards of the eaten enhancements give +Xmult_mod each and are destroyed.
 * `eats` = enhancement keys, `flag` = the per-card target marker (aron_target / lairon_target / aggron_target).
 */
function aron_calc(self, card, context, eats, flag) {
  const edible = (v) => eats.some((k) => has_enhancement(v, k));
  if (context.cardarea === G.jokers && context.before && !context.blueprint) {
    for (const v of context.scoring_hand) {
      if (edible(v) && !v.debuff) {
        card.ability.extra.eaten = card.ability.extra.eaten + 1;
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        v[flag] = true;
        G.E_MANAGER.add_event(() => { v.juice_up(); });
      }
    }
  } else if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
  } else if (context.destroying_card) {
    return !context.blueprint && edible(context.destroying_card) && !!context.destroying_card[flag];
  }
  return undefined;
}

/** Numel / Camerupt: X Mult on the hand after `score_goal` cards were scored. */
function numel_calc(card, context, mult_cards_twice) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && card.ability.extra.active) card.ability.extra.cards_scored = 0;
    if (context.joker_main && card.ability.extra.active) {
      card.ability.extra.active = false;
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
    }
    if (context.after && card.ability.extra.cards_scored >= card.ability.extra.score_goal) {
      card.ability.extra.active = true;
      juice_card_until(card, (c) => c.ability.extra.active && !G.RESET_JIGGLES, true);
    }
  }
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.blueprint) {
    card.ability.extra.cards_scored = card.ability.extra.cards_scored + 1;
    if (mult_cards_twice && has_enhancement(context.other_card, 'm_mult')) card.ability.extra.cards_scored = card.ability.extra.cards_scored + 1;
  }
  return undefined;
}

defineJokers({
  // Aron 304
  aron: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_steel);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      // (Lua: the if/elseif chain returns from the destroying_card branch even when it's false.)
      if (context.destroying_card) return aron_calc(self, card, context, ['m_steel'], 'aron_target');
      const r = aron_calc(self, card, context, ['m_steel'], 'aron_target');
      if (r !== undefined) return r;
      return scaling_evo(self, card, context, 'j_poke_lairon', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  // Lairon 305
  lairon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_steel); info_queue.push(P_CENTERS.m_stone); }
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      if (context.destroying_card) return aron_calc(self, card, context, ['m_steel', 'm_stone'], 'lairon_target');
      const r = aron_calc(self, card, context, ['m_steel', 'm_stone'], 'lairon_target');
      if (r !== undefined) return r;
      return scaling_evo(self, card, context, 'j_poke_aggron', card.ability.extra.Xmult, self.config.evo_rqmt);
    },
  },
  // Aggron 306
  aggron: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_steel); info_queue.push(P_CENTERS.m_stone); info_queue.push(P_CENTERS.m_gold); }
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.eaten] };
    },
    calculate(self, card, context) {
      return aron_calc(self, card, context, ['m_steel', 'm_stone', 'm_gold'], 'aggron_target');
    },
  },
  // Numel 322
  numel: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.rounds, center.ability.extra.score_goal, Math.max(0, center.ability.extra.score_goal - center.ability.extra.cards_scored)] };
    },
    calculate(self, card, context) {
      const r = numel_calc(card, context, false);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_camerupt');
    },
  },
  // Camerupt 323
  camerupt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_mult);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.score_goal, Math.max(0, center.ability.extra.score_goal - center.ability.extra.cards_scored)] };
    },
    calculate(self, card, context) { return numel_calc(card, context, true); },
  },
  // Mega Camerupt 323-1
  mega_camerupt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_mult);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.blueprint && has_enhancement(context.other_card, 'm_mult')) {
        // Pokermon 3.9.1: the gain is Xmult_mod (was Xmult_multi).
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.Xmult = card.ability.extra.Xmult2;
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
}, FILE);

// ------------------------------------------- new in Pokermon 3.9.1 (new-jokers sub-batch 12): 15 jokers
// Delcatty, Sableye, Meditite / Medicham, Plusle, Minun, Volbeat, Illumise, Roselia, Carvanha / Sharpedo, Wailmer / Wailord,
// Torkoal, Spinda. Static data: data391.js new_jokers. Deferred (data391.js new_deferred): Roselia -> Roserade (Shiny Stone)
// and Budew -> Roselia, sub-batch 14: until Roserade exists Roselia has no item_req and its item_evo is inert (can_evolve
// needs the target center), so the call below needs no change when it lands. Minun's shop discount: systems/rules.js set_cost.

const isTable = (x) => x !== null && typeof x === 'object';
const skitty_type = () => G.GAME.current_round.cattype || 'Grass';
/** Plusle: SMODS.get_card_areas('jokers') = the joker row, the consumables and the vouchers; its Jokers and consumables. */
function jokers_and_consumables() {
  let count = 0;
  for (const area of [G.jokers, G.consumeables]) {
    if (area) count = count + area.cards.filter((v) => v.ability.set === 'Joker' || v.ability.consumeable).length;
  }
  return count;
}
/** Meditite / Medicham: mult_mod per empty consumable slot when exactly d_remaining discards are left. */
function meditite_total(card) {
  if (G.consumeables && G.GAME && G.GAME.current_round && G.GAME.current_round.discards_left === card.ability.extra.d_remaining) {
    return Math.max(0, G.consumeables.config.card_limit - G.consumeables.cards.length) * card.ability.extra.mult_mod;
  }
  return 0;
}
function meditite_main(card, context) {
  if (context.joker_main && G.GAME.current_round.discards_left === card.ability.extra.d_remaining) {
    const total = meditite_total(card);
    // (SMODS skips a 0 amount: no "+0" with every slot full)
    if (total !== 0) return { mult: total };
  }
  return undefined;
}
/** Carvanha / Sharpedo: when the Blind is selected, destroy the joker to the right (Ceremonial Dagger's slice). -> it or undefined. */
function shark_slice(card, context) {
  if (context.ending_shop) {
    card.ability.extra.selected = false;
    juice_card_until(card, () => !card.ability.extra.selected, true);
  }
  if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
    card.ability.extra.selected = true;
    const my_pos = G.jokers.cards.indexOf(card);
    const sliced_card = my_pos >= 0 ? G.jokers.cards[my_pos + 1] : undefined;
    if (sliced_card && !card.getting_sliced && !sliced_card.ability.eternal && !sliced_card.getting_sliced) {
      sliced_card.getting_sliced = true;
      G.GAME.joker_buffer = G.GAME.joker_buffer - 1;
      G.E_MANAGER.add_event(() => {
        G.GAME.joker_buffer = 0;
        card.juice_up(0.8, 0.8);
        sliced_card.start_dissolve();
        play_sound('slice1', 0.96 + math_random() * 0.08);
      });
      return sliced_card;
    }
  }
  return undefined;
}
/** Carvanha / Sharpedo: X Mult if the hand played was already played this round. */
function shark_main(card, context) {
  if (context.joker_main && G.GAME.hands[context.scoring_name] && G.GAME.hands[context.scoring_name].played_this_round > 1) {
    return { xmult: card.ability.extra.Xmult };
  }
  return undefined;
}
/** Wailmer / Wailord: +chip_mod Chips per card of the suit left in the deck. */
const suit_in_deck = (card) => (G.deck && G.deck.cards ? find_playing_card((v) => v.is_suit(card.ability.extra.suit)).length : 0);
function wailmer_main(card, context) {
  if (context.joker_main) {
    const clubs = find_playing_card((v) => v.is_suit(card.ability.extra.suit)).length;
    if (clubs > 0) return { chips: card.ability.extra.chip_mod * clubs };
  }
  return undefined;
}
/** Minun: re-price every card (its discount lives in the set_cost hook). */
const reprice = () => G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); });

defineJokers({
  // Delcatty 301: Skitty's copy of the joker to its right of the round's type, which it copies with +1 Energy.
  delcatty: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const cattype = skitty_type();
      const highlight_colour = cattype !== 'Lightning' ? 'WHITE' : 'BLACK';
      return { vars: [cattype, card.ability.extra.energy_buff], colours: [cattype.toLowerCase(), highlight_colour] };
    },
    calculate(self, card, context) {
      const found_pos = G.jokers.cards.indexOf(card);
      const other_joker = found_pos >= 0 ? G.jokers.cards[found_pos + 1] : undefined;
      if (other_joker && other_joker.config.center.blueprint_compat && !context.no_blueprint && is_type(other_joker, skitty_type())) {
        // The copy reads an energized stand-in of the joker's ability: reads fall through to the real one (Lua's
        // __index metatables), writes stay on the stand-in. `gone` keeps the copied joker from evolving meanwhile.
        const fake_card = { config: other_joker.config, ability: Object.create(other_joker.ability) };
        fake_card.ability.extra = other_joker.ability.extra;
        if (isTable(other_joker.ability.extra)) fake_card.ability.extra = Object.create(other_joker.ability.extra);
        // (3.9.1 energize(fake_card, nil, nil, true, energy_buff): ours takes one Energy a call)
        for (let i = 0; i < card.ability.extra.energy_buff; i++) energize(fake_card, undefined, undefined, true);
        const was_gone = other_joker.gone;
        other_joker.gone = true;
        const true_ability = other_joker.ability;
        other_joker.ability = fake_card.ability;
        let ret;
        try { ret = blueprint_effect(card, other_joker, context); } finally {
          other_joker.ability = true_ability;
          // (the Lua sets gone = nil; ours puts back what it was)
          other_joker.gone = was_gone;
        }
        if (ret) ret.colour = 'BLUE';
        return ret;
      }
      return undefined;
    },
    update(self, card) {
      // (the compatible / incompatible badge: pokermon.ui.blueprint_compat(is_type(other_joker, cattype) and other_joker))
      if (G.jokers && card.area === G.jokers) {
        const other_joker = G.jokers.cards[G.jokers.cards.indexOf(card) + 1];
        const ok = other_joker && is_type(other_joker, skitty_type()) && other_joker.config.center.blueprint_compat;
        card.ability.blueprint_compat = ok ? 'compatible' : 'incompatible';
      }
    },
  },
  // Sableye 302: +X0.5 each time a drawn card depletes an enhancement from the deck (once per enhancement); resets each round.
  sableye: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'deplete' });
      return { vars: [center.ability.extra.Xmult_mod, center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.joker_main && card.ability.extra.Xmult > 1) return { Xmult: card.ability.extra.Xmult };
      if (context.hand_drawn && !context.blueprint) {
        for (const drawnCard of context.hand_drawn) {
          if (drawnCard.config.center !== P_CENTERS.c_base) {
            for (const x of get_enhancements(drawnCard)) {
              if (!card.ability.extra.enhancements[x]) {
                if (get_depleted((deck_card) => has_enhancement(deck_card, x))) {
                  card.ability.extra.enhancements[x] = true;
                  scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_colour: 'XMULT' });
                }
              }
            }
          }
        }
      }
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult1;
        card.ability.extra.enhancements = {};
        return { message: localize('k_reset'), colour: 'RED' };
      }
      return undefined;
    },
  },
  // Meditite 307: +7 Mult per empty consumable slot with 0 discards left.
  meditite: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.rounds, center.ability.extra.d_remaining, meditite_total(center)] };
    },
    calculate(self, card, context) {
      return meditite_main(card, context) || level_evo(self, card, context, 'j_poke_medicham');
    },
  },
  // Medicham 308: +12 Mult per empty consumable slot with 0 discards left; Sixth Sense (a lone 6 as the first hand is
  // destroyed for a Spectral card).
  medicham: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.j_sixth_sense);
      // (#2# is Medicham's `rounds`, which it doesn't have: nil in the Lua too; the text doesn't show it)
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.rounds, center.ability.extra.d_remaining, meditite_total(center)] };
    },
    calculate(self, card, context) {
      const r = meditite_main(card, context);
      if (r) return r;
      if (context.destroy_card && !context.blueprint) {
        if (context.full_hand.length === 1 && context.destroy_card === context.full_hand[0] && context.full_hand[0].get_id() === 6 && G.GAME.current_round.hands_played === 0) {
          if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => {
              add_card({ set: 'Spectral' });
              G.GAME.consumeable_buffer = 0;
            });
            // (SMODS shows a destroy_card return's message on the joker; our destroy pass only reads `remove`)
            card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
            return { remove: true };
          }
          return { remove: true };
        }
      }
      return undefined;
    },
  },
  // Plusle 311: +2 Mult per Joker and consumable; each Minun gives X2.5.
  plusle: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.mult_mod * jokers_and_consumables(), center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { mult: card.ability.extra.mult_mod * jokers_and_consumables() };
      if (context.other_joker && context.other_joker.config.center.key === 'j_poke_minun') return { xmult: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Minun 312: everything in the shop $1 less (systems/rules.js set_cost); $10 at end of round per Plusle.
  minun: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money_minus, center.ability.extra.money] };
    },
    calc_dollar_bonus(self, card) {
      const plusles = find_card('j_poke_plusle').length;
      if (plusles > 0) return ease_poke_dollars(card, 'minun', card.ability.extra.money * plusles, true);
      return undefined;
    },
    add_to_deck() { reprice(); },
    remove_from_deck() { reprice(); },
  },
  // Volbeat 313: +6 Chips per Planet card used, or +X0.08 Mult instead with another Grass joker.
  volbeat: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { Xmult: card.ability.extra.Xmult, chips: card.ability.extra.chips };
      if (context.using_consumeable && !context.blueprint && context.consumeable.ability.set === 'Planet') {
        if (find_pokemon_type('Grass', card).length > 0) {
          scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_key: 'a_xmult', message_colour: 'XMULT' });
        } else {
          scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_key: 'a_chips', message_colour: 'CHIPS' });
        }
      }
      return undefined;
    },
  },
  // Illumise 314: a Planet card per Grass joker when the Blind is selected (must have room).
  illumise: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        const grass_count = find_pokemon_type('Grass').length;
        for (let i = 1; i <= grass_count; i++) {
          if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => {
              const planet = add_card({ set: 'Planet' });
              calculate_effect({ message: localize('k_plus_planet'), colour: 'Planet' }, planet);
              G.GAME.consumeable_buffer = 0;
            });
          }
        }
      }
      return undefined;
    },
  },
  // Roselia 315: the first scoring card of the round: Odd -> retriggered twice, else it becomes a Seed card.
  // (-> Roserade with a Shiny Stone: deferred, above.)
  roselia: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0
        && context.other_card === context.scoring_hand[0] && poke_is_odd(context.other_card)) {
        return { repetitions: card.ability.extra.retriggers };
      }
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        if (G.GAME.current_round.hands_played === 0 && !poke_is_odd(context.scoring_hand[0])) {
          const _card = context.scoring_hand[0];
          _card.set_ability(P_CENTERS.m_poke_seed, null, true);
          G.E_MANAGER.add_event(() => { _card.juice_up(); });
        }
      }
      return item_evo(self, card, context, 'j_poke_roserade');
    },
  },
  // Carvanha 318: slices the joker to its right at Blind select; X2 on a hand already played this round; evolves after 3.
  carvanha: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, Math.max(0, self.config.evo_rqmt - center.ability.extra.eaten)] };
    },
    calculate(self, card, context) {
      if (shark_slice(card, context)) card.ability.extra.eaten = card.ability.extra.eaten + 1;
      return shark_main(card, context) || scaling_evo(self, card, context, 'j_poke_sharpedo', card.ability.extra.eaten, self.config.evo_rqmt);
    },
  },
  // Sharpedo 319: slices the joker to its right at Blind select for a Spectral card (must have room); X3 on a repeated hand.
  sharpedo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (shark_slice(card, context)) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const spectral = add_card({ set: 'Spectral' });
          calculate_effect({ message: localize('k_plus_spectral') }, spectral);
        }
      }
      return shark_main(card, context);
    },
  },
  // Wailmer 320: +6 Chips per Club left in the deck.
  wailmer: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const abbr = center.ability.extra;
      return { vars: [abbr.chip_mod, abbr.chip_mod * suit_in_deck(center), abbr.rounds, localize(abbr.suit, 'suits_singular')] };
    },
    calculate(self, card, context) {
      return wailmer_main(card, context) || level_evo(self, card, context, 'j_poke_wailord');
    },
  },
  // Wailord 321: +10 Chips per Club left in the deck; Standard Pack cards become Clubs. (3.9.1 draws it 1.2x the size of a
  // card, display_size: not ported, the card frame is fixed.)
  wailord: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const abbr = center.ability.extra;
      return { vars: [abbr.chip_mod, abbr.chip_mod * suit_in_deck(center), localize(abbr.suit, 'suits_singular'), localize(abbr.suit, 'suits_plural')] };
    },
    calculate(self, card, context) {
      if (context.modify_booster_card && String(context.booster.ability.name).includes('Standard')) {
        context.card.change_suit(card.ability.extra.suit);
      }
      return wailmer_main(card, context);
    },
  },
  // Torkoal 324: each played Mult card retriggers once per discard left.
  torkoal: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_mult);
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && has_enhancement(context.other_card, 'm_mult')) {
        if (G.GAME.current_round.discards_left > 0) return { repetitions: G.GAME.current_round.discards_left };
      }
      return undefined;
    },
  },
  // Spinda 327: comes holding a Wheel of Fortune; scored cards of its 3 Nature ranks become one of its 3 Nature enhancements.
  spinda: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const card_vars = center.ability.extra.enhancements.map((e) => localize('poke_' + e));
      add_target_cards_to_vars(card_vars, center.ability.extra.targets);
      info_queue.push({ set: 'Other', key: 'holding', vars: ['Wheel of Fortune'] });
      info_queue.push({ set: 'Other', key: 'nature', vars: ['rank'] });
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint) {
        let natures = 0;
        for (const scored_card of context.scoring_hand) {
          for (const t of card.ability.extra.targets) {
            if (scored_card.get_id() === t.id) {
              natures = natures + 1;
              const [enhancement] = pseudorandom_element(card.ability.extra.enhancements, pseudoseed('spinda'));
              scored_card.set_ability(P_CENTERS[enhancement], null, true);
              G.E_MANAGER.add_event(() => { scored_card.juice_up(); });
            }
          }
        }
        if (natures > 0) return { message: localize('poke_teeter_dance_ex'), colour: 'colorless' };
      }
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) self.set_nature(self, card);
    },
    // 3.9.1 set_nature (the Nature: 3 enhancements, 3 ranks)
    set_nature(self, card) {
      card.ability.extra.enhancements = get_target_card_enhancements('spinda', 3, ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_lucky', 'm_poke_seed']);
      card.ability.extra.targets = get_poke_target_card_ranks('spinda', 3, card.ability.extra.targets);
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) create_consumeable('c_wheel_of_fortune');
    },
  },
}, FILE);
