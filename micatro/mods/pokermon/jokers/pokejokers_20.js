// Pokermon 3.9.1 — pokemon/pokejokers_20.lua (Pokédex 571-600: Zoroark -> Ferrothorn), 11 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8, except Ferroseed / Ferrothorn (held on 3.2.1: the Hazard layer, batch 10).
// The Gothita line's Planet / Celestial discounts live in systems/rules.js (set_cost hook).
// Ferroseed / Ferrothorn use Steamodded's quantum enhancements (check_enhancement context,
// core.js quantum_enhancements + has_enhancement in systems/utils.js).
import {
  G, P_CENTERS, localize, play_sound, all_cards,
  defineJokers, type_tooltip, detailed, level_evo, scaling_evo, ease_poke_dollars, scale_card, destroy_joker,
  volatile_active, has_enhancement, get_random_poke_key_options,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { illusion_copy, illusion_update, illusion_set_ability, illusion_add_to_deck } from './pokejokers_19.js';

const FILE = 'pokemon/pokejokers_20.lua';

// ------------------------------------------------------------ shared bodies
/** Gothita line: re-run set_cost on every card (planet discounts change). */
const goth_costs = {
  add_to_deck() { G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); }); },
  remove_from_deck() { G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); }); },
};
/**
 * Vanillite line (3.9.1): +chips while leftmost (volatile; Vanilluxe has no side, so always), -chips_minus after each
 * triggered hand (SMODS.scale_card '-'); at 0 it melts (SMODS.destroy_cards: an Eternal one stays) and `on_melt` runs.
 * Blueprint-compatible now: a copy scores the chips (the triggered flag and the melt stay the original's).
 */
function vanilla_calc(self, card, context, on_melt) {
  if (context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
    card.ability.extra.triggered = true;
    return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
  }
  if (context.after && card.ability.extra.triggered && !context.blueprint) {
    card.ability.extra.triggered = false;
    if (card.ability.extra.chips - card.ability.extra.chips_minus <= 0) {
      destroy_joker(card);
      if (on_melt) on_melt();
      return { message: localize('k_melted_ex'), colour: 'CHIPS' };
    }
    scale_card(card, { ref_value: 'chips', scalar_value: 'chips_minus', operation: '-', message_key: 'a_chips_minus', message_colour: 'CHIPS' });
  }
  return undefined;
}
function vanilla_vars(self, info_queue, center) {
  type_tooltip(self, info_queue, center);
  if (detailed()) info_queue.push({ set: 'Other', key: 'poke_volatile_' + center.ability.extra.volatile });
  return { vars: [center.ability.extra.chips, center.ability.extra.rounds, center.ability.extra.chips_minus] };
}
/** Ferroseed / Ferrothorn: Wild and Hazard cards are also Steel cards (quantum enhancement). */
function ferro_check(context) {
  if (context.check_enhancement) {
    if (has_enhancement(context.other_card, 'm_wild') || has_enhancement(context.other_card, 'm_poke_hazard')) return { m_steel: true };
  }
  return undefined;
}
function ferro_tips(info_queue) {
  if (detailed()) {
    info_queue.push(P_CENTERS.m_wild);
    info_queue.push(P_CENTERS.m_steel);
    info_queue.push(P_CENTERS.m_poke_hazard);
  }
}
/**
 * Frillish line (3.9.1: SMODS.scale_card; Jellicent doubles the gain for a King or Queen). SMODS gives the discard context
 * cardarea = G.jokers; Micatro's discard context has no cardarea, so the discard branch is checked outside the cardarea test.
 */
function frill_discard(card, context, by_rank) {
  if (context.discard && !context.blueprint && context.other_card.is_face()) {
    const card_id = context.other_card.get_id();
    scale_card(card, {
      ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS', message_delay: 0.45,
      operation: (t, k, initial, modifier) => { t[k] = initial + modifier * (by_rank && (card_id === 12 || card_id === 13) ? 2 : 1); },
    });
    return true;
  }
  return false;
}

defineJokers({
  // Zoroark 571
  zoroark: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) { return illusion_copy(card, context); },
    set_ability(self, card) { illusion_set_ability(self, card, () => get_random_poke_key_options({ key_append: 'zoroark', rarity: 'poke_safari', exclude_types: 'Dark' })); },
    add_to_deck: illusion_add_to_deck,
    update(self, card) { illusion_update(card); },
  },
  // Gothita 574
  gothita: {
    knockoff_pseudol: true,
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_gothorita'); },
    ...goth_costs,
  },
  // Gothorita 575
  gothorita: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) { return level_evo(self, card, context, 'j_poke_gothitelle'); },
    ...goth_costs,
  },
  // Gothitelle 576
  gothitelle: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.money] }; },
    calculate(self, card, context) {
      if (context.using_consumeable && context.consumeable.ability.set === 'Planet') ease_poke_dollars(card, 'gothitelle', card.ability.extra.money);
      return undefined;
    },
    ...goth_costs,
  },
  // Vanillite 582
  vanillite: {
    loc_vars: vanilla_vars,
    calculate(self, card, context) { return vanilla_calc(self, card, context) || level_evo(self, card, context, 'j_poke_vanillish'); },
  },
  // Vanillish 583
  vanillish: {
    loc_vars: vanilla_vars,
    calculate(self, card, context) { return vanilla_calc(self, card, context) || level_evo(self, card, context, 'j_poke_vanilluxe'); },
  },
  // Vanilluxe 584
  vanilluxe: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chips_minus, center.ability.extra.tags] };
    },
    calculate(self, card, context) {
      return vanilla_calc(self, card, context, () => G.E_MANAGER.add_event(() => {
        for (let i = 1; i <= card.ability.extra.tags; i++) add_tag(new Tag('tag_double'));
        play_sound('generic1');
        play_sound('holo1');
      }));
    },
  },
  // Frillish 592
  frillish: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (frill_discard(card, context, false)) return undefined;
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.chips > 0) {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      return scaling_evo(self, card, context, 'j_poke_jellicent', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Jellicent 593
  jellicent: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod] }; },
    calculate(self, card, context) {
      if (frill_discard(card, context, true)) return undefined;
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      return undefined;
    },
  },
  // Ferroseed 597
  ferroseed: {
    quantum_enhancements: true, // answers check_enhancement (core.js quantum_enhancements)
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); ferro_tips(info_queue); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) { return ferro_check(context) || level_evo(self, card, context, 'j_poke_ferrothorn'); },
  },
  // Ferrothorn 598
  ferrothorn: {
    quantum_enhancements: true,
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); ferro_tips(info_queue); return { vars: [] }; },
    calculate(self, card, context) {
      const q = ferro_check(context);
      if (q) return q;
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && context.poker_hands.Flush.length) card.ability.extra.retrigger_hand = true;
        if (context.after && card.ability.extra.retrigger_hand) card.ability.extra.retrigger_hand = undefined;
      }
      if (context.repetition && context.cardarea === G.hand && context.card_effects
        && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length) || context.card_effects.length > 1)
        && card.ability.extra.retrigger_hand && has_enhancement(context.other_card, 'm_steel')) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
}, FILE);
