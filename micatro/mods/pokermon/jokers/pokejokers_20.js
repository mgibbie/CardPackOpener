// Pokermon 3.2.1 — pokemon/pokejokers_20.lua (Pokédex 571-600: Zoroark -> Ferrothorn), 11 jokers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
// The Gothita line's Planet / Celestial discounts live in systems/rules.js (set_cost hook).
// Ferroseed / Ferrothorn use Steamodded's quantum enhancements (check_enhancement context,
// core.js quantum_enhancements + has_enhancement in systems/utils.js).
import {
  G, P_CENTERS, localize, emit, play_sound, all_cards,
  defineJokers, type_tooltip, detailed, level_evo, scaling_evo, ease_poke_dollars,
  volatile_active, has_enhancement, get_random_poke_key,
} from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { illusion_copy, illusion_update, illusion_set_ability } from './pokejokers_19.js';

const FILE = 'pokemon/pokejokers_20.lua';

// ------------------------------------------------------------ shared bodies
/** Gothita line: re-run set_cost on every card (planet discounts change). */
const goth_costs = {
  add_to_deck() { G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); }); },
  remove_from_deck() { G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); }); },
};
/** The melt animation + removal (Lua removes `self` — the center — from G.jokers; the card is meant). */
function melt(card) {
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    card.juice_up(0.3, 0.4);
    G.E_MANAGER.add_event(() => {
      emit('dissolve', { card: card.sort_id, reason: 'eaten' });
      G.jokers.remove_card(card);
      card.remove();
    });
  });
}
/** Vanillite / Vanillish: +chips while leftmost (volatile), -chips_minus after each triggered hand. */
function vanilla_calc(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
    if (context.joker_main && volatile_active(self, card, card.ability.extra.volatile)) {
      card.ability.extra.triggered = true;
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
    }
    if (card.ability.extra.triggered && context.after && !context.blueprint) {
      card.ability.extra.triggered = false;
      if (card.ability.extra.chips - card.ability.extra.chips_minus <= 0) {
        melt(card);
        return { message: localize('k_melted_ex'), colour: 'CHIPS' };
      }
      card.ability.extra.chips = card.ability.extra.chips - card.ability.extra.chips_minus;
      return { message: localize({ type: 'variable', key: 'a_chips_minus', vars: [card.ability.extra.chips_minus] }), colour: 'CHIPS' };
    }
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
 * Frillish line. SMODS gives the discard context cardarea = G.jokers; Micatro's discard
 * context has no cardarea, so the discard branch is checked outside the cardarea test.
 */
function frill_discard(card, context, by_rank) {
  if (context.discard && !context.blueprint && context.other_card.is_face()) {
    const card_id = context.other_card.get_id();
    if (by_rank && (card_id === 12 || card_id === 13)) card.ability.extra.chips = card.ability.extra.chips + (card.ability.extra.chip_mod * 2);
    else card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod;
    return { message: localize('k_upgrade_ex'), colour: 'CHIPS', delay: 0.45 };
  }
  return undefined;
}

defineJokers({
  // Zoroark 571
  zoroark: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) {
      const c = illusion_copy(card, context);
      if (c && c.ret) return c.ret;
      return undefined;
    },
    set_ability(self, card) { illusion_set_ability(self, card, () => get_random_poke_key('zoroark', null, 'poke_safari', null, null, { j_poke_zoroark: true })); },
    update(self, card) { illusion_update(card); },
  },
  // Gothita 574
  gothita: {
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
    calculate(self, card, context) {
      if (context.first_hand_drawn) card.ability.extra.level_up = true;
      return vanilla_calc(self, card, context) || level_evo(self, card, context, 'j_poke_vanilluxe');
    },
  },
  // Vanilluxe 584
  vanilluxe: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chips_minus, center.ability.extra.tags] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
        }
        if (context.after && !context.blueprint) {
          if (card.ability.extra.chips - card.ability.extra.chips_minus <= 0) {
            melt(card);
            G.E_MANAGER.add_event(() => { play_sound('generic1'); play_sound('holo1'); });
            for (let i = 1; i <= card.ability.extra.tags; i++) G.E_MANAGER.add_event(() => add_tag(new Tag('tag_double')));
            return { message: localize('k_melted_ex'), colour: 'CHIPS' };
          }
          card.ability.extra.chips = card.ability.extra.chips - card.ability.extra.chips_minus;
          return { message: localize({ type: 'variable', key: 'a_chips_minus', vars: [card.ability.extra.chips_minus] }), colour: 'CHIPS' };
        }
      }
      return undefined;
    },
  },
  // Frillish 592
  frillish: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      const d = frill_discard(card, context, false);
      if (d) return d;
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
      const d = frill_discard(card, context, true);
      if (d) return d;
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
