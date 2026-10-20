// Pokermon 3.9.1 — pokemon/pokejokers_31.lua (Pokédex 901-930: Ursaluna -> Arboliva), 5 jokers + 3 new in 3.9.1 (Smoliv line: at the
// end, new-jokers sub-batch 15; static data: data391.js new_jokers),
// plus Hisuian Qwilfish / Overqwil, which the Lua writes (commented out) but never registers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8, Tarountula / Spidops (the Hazard layer) since batch 10.
import {
  G, P_CENTERS, localize, card_eval_status_text, create_card, juice_card_until, poll_edition, add_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, has_enhancement, find_pokemon_type,
  poke_add_hazards, poke_next_highest_rank, poke_lowest_rank, hazard_layer, hazard_level_tip,
  scale_card, is_type, poke_get_adjacent_jokers,
} from '../api.js';
import { poll_seal_guaranteed } from './pokejokers_05.js';

const FILE = 'pokemon/pokejokers_31.lua';

// ------------------------------------------------------------ shared bodies
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
/** Hisuian Qwilfish / Overqwil tooltip: hazards the ratio would add to the current deck. */
function qwil_vars(card) {
  const abbr = card.ability.extra;
  let to_add = Math.floor(52 / abbr.hazard_ratio);
  if (G.playing_cards) {
    let count = G.playing_cards.length;
    for (const v of G.playing_cards) if (has_enhancement(v, 'm_poke_hazard')) count = count - 1;
    to_add = Math.floor(count / abbr.hazard_ratio);
  }
  return to_add;
}
/** Hisuian Qwilfish / Overqwil: hazards on blind select, chips per Hazard drawn. */
function qwil_calc(card, context) {
  if (context.setting_blind) poke_add_hazards(card.ability.extra.hazard_ratio);
  if (context.hand_drawn) {
    let count = 0;
    for (const v of context.hand_drawn) if (has_enhancement(v, 'm_poke_hazard')) count = count + 1;
    if (count > 0) {
      card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod * count;
      return { message: localize('k_upgrade_ex'), colour: 'CHIPS' };
    }
  }
  return undefined;
}
/** Fidough / Dachsbun: +chips when the scoring hand holds the target rank, which then climbs. */
function dough_calc(card, context, bonus) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before) {
      let contains = false;
      for (let i = 0; i < context.scoring_hand.length; i++) {
        if (context.scoring_hand[i].get_id() === card.ability.extra.id) { contains = true; break; }
      }
      if (contains) {
        card.ability.extra.chips = card.ability.extra.chips + card.ability.extra.chip_mod + bonus();
        [card.ability.extra.id, card.ability.extra.rank] = poke_next_highest_rank(card.ability.extra.id, card.ability.extra.rank);
        return { message: localize('k_upgrade_ex'), colour: 'CHIPS', card };
      }
    }
    if (context.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
    }
  }
  return undefined;
}
function dough_set_ability(self, card, initial) {
  if (initial && G.playing_cards) [card.ability.extra.id, card.ability.extra.rank] = poke_lowest_rank(14, 'Ace');
}
const dough_vars = (center) => [center.ability.extra.chips, center.ability.extra.chip_mod, localize(center.ability.extra.rank || '2', 'ranks')];
/** Smoliv line (3.9.1, new-jokers sub-batch 15): SMODS.scale_card on a card's sell value (ability.extra_value) by the olive's
 *  money_mod (x factor), "Value Up!", then set_cost. */
function olive_value(target, olive, factor = 1) {
  scale_card(target, {
    ref_table: target.ability, ref_value: 'extra_value', scalar_table: olive.ability.extra, scalar_value: 'money_mod',
    scaling_message: { message: localize('k_val_up') },
    operation: (ref_table, ref_value, initial, change) => { ref_table[ref_value] = initial + (change * factor); },
  });
  target.set_cost();
}

defineJokers({
  // Ursaluna 901
  ursaluna: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || (center.edition && !center.edition.polychrome)) info_queue.push(P_CENTERS.e_polychrome);
        if (!center.edition || (center.edition && !center.edition.foil)) info_queue.push(P_CENTERS.e_foil);
        if (!center.edition || (center.edition && !center.edition.holo)) info_queue.push(P_CENTERS.e_holo);
      }
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.skipping_booster) {
        if (!context.blueprint) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
        // Pokermon 3.9.1: the Item gets a random Foil / Holographic / Polychrome edition (was always Polychrome).
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          add_card({ set: 'Item', key_append: 'luna', edition: poll_edition('aura', null, true, true) });
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.mult > 0) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult, card };
        }
      }
      return undefined;
    },
  },
  // Hisuian Qwilfish (Overqwil 904's pre-evolution). Not registered in 3.2.1 (the Lua is commented
  // out and missing from the file's list) — Intended-design fix: registered here, as written.
  hisuian_qwilfish: {
    // Its card is 3.9.1's (pokespriteload.lua: AtlasJokersBasicGen02 {2,5}; data391.js sprites, spec unregistered_sprites).
    // The Lua's own pos / atlas ('Regionals', a sheet Pokermon never shipped) are kept as written; the sprite replaces them.
    // (Until sub-batch 15 the port drew a Micatro-made card here: 3.2.1 had no Hisuian Qwilfish art.)
    pos: { x: 5, y: 4 },
    config: { extra: { hazard_ratio: 10, chip_mod: 5, chips: 0 }, evo_rqmt: 80 },
    rarity: 2,
    cost: 7,
    stage: 'Basic',
    ptype: 'Dark',
    atlas: 'Regionals',
    blueprint_compat: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [qwil_vars(card)] });
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [qwil_vars(card), abbr.hazard_ratio, abbr.chip_mod, abbr.chips, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      const r = qwil_calc(card, context);
      if (r) return r;
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_overqwil', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Overqwil 904. Not registered in 3.2.1 — Intended-design fix: registered here; its Lua `stage`
  // says "Basic", but it is Hisuian Qwilfish's evolution, so it is stage "One" (Everstone / pools).
  overqwil: {
    pos: { x: 7, y: 8 },
    config: { extra: { hazard_ratio: 5, chip_mod: 20, chips: 0 } },
    rarity: 'poke_safari',
    cost: 7,
    stage: 'One',
    ptype: 'Dark',
    atlas: 'Pokedex8',
    gen: 8,
    blueprint_compat: true,
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [qwil_vars(card)] });
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [qwil_vars(card), abbr.hazard_ratio, abbr.chip_mod, abbr.chips] };
    },
    calculate(self, card, context) {
      const r = qwil_calc(card, context);
      if (r) return r;
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          const chips = card.ability.extra.chips;
          card.ability.extra.chips = card.ability.extra.chips / 2;
          return {
            message: localize({ type: 'variable', key: 'a_chips', vars: [chips] }), colour: 'CHIPS', chip_mod: chips,
            extra: { message: localize('poke_reload_ex'), colour: 'CHIPS' },
          };
        }
      }
      return undefined;
    },
  },
  // Tarountula 917 (3.9.1): +1 Hazard layer, +1 hand size.
  tarountula: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push(hazard_level_tip());
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [abbr.hazard_level, abbr.rounds, abbr.h_size] };
    },
    calculate(self, card, context) {
      return level_evo(self, card, context, 'j_poke_spidops');
    },
    add_to_deck(self, card, from_debuff) { hand_size.add_to_deck(self, card); hazard_layer.add_to_deck(self, card, from_debuff); },
    remove_from_deck(self, card, from_debuff) { hand_size.remove_from_deck(self, card); hazard_layer.remove_from_deck(self, card, from_debuff); },
  },
  // Spidops 918 (3.9.1): +1 Hazard layer, +2 hand size; every 8th playing card added to the deck gets a random seal
  // ("Sticky Web!"; SMODS.poll_seal{guaranteed = true}). Not Blueprint-compatible.
  spidops: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push(hazard_level_tip());
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [abbr.hazard_level, abbr.h_size, abbr.card_goal, Math.max(0, abbr.card_goal - abbr.cards_added)] };
    },
    calculate(self, card, context) {
      if (context.playing_card_added && !card.getting_sliced && context.cards && !context.blueprint) {
        if (Array.isArray(context.cards) && context.cards.length > 0) {
          for (const v of context.cards) {
            card.ability.extra.cards_added = card.ability.extra.cards_added + 1;
            if (card.ability.extra.cards_added === card.ability.extra.card_goal) {
              card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_sticky_web_ex') });
              v.set_seal(poll_seal_guaranteed(), true);
              card.ability.extra.cards_added = 0;
            }
          }
        }
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { hand_size.add_to_deck(self, card); hazard_layer.add_to_deck(self, card, from_debuff); },
    remove_from_deck(self, card, from_debuff) { hand_size.remove_from_deck(self, card); hazard_layer.remove_from_deck(self, card, from_debuff); },
  },
  // Fidough 926
  fidough: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: dough_vars(center) }; },
    calculate(self, card, context) {
      const r = dough_calc(card, context, () => 0);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_dachsbun', find_pokemon_type('Fire').length, 1);
    },
    set_ability: dough_set_ability,
  },
  // Dachsbun 927
  dachsbun: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: dough_vars(center) }; },
    calculate(self, card, context) { return dough_calc(card, context, () => find_pokemon_type('Fire').length * 2); },
    set_ability: dough_set_ability,
  },
  // ---------------------------------------------------------------- new in 3.9.1 (new-jokers sub-batch 15)
  // Smoliv 928: +$2 sell value at end of round; evolves at $12 sell value.
  smoliv: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.money_mod, self.config.evo_rqmt, card.sell_cost] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && context.main_eval && !context.blueprint) olive_value(card, card);
      return scaling_evo(self, card, context, 'j_poke_dolliv', card.sell_cost, self.config.evo_rqmt);
    },
  },
  // Dolliv 929: +$2 sell value to itself and the adjacent Jokers at end of round; evolves at $22 sell value.
  dolliv: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra || self.config.extra;
      return { vars: [a.money_mod, self.config.evo_rqmt, card.sell_cost] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && context.main_eval && !context.blueprint) {
        olive_value(card, card);
        for (const adjacent of poke_get_adjacent_jokers(card)) olive_value(adjacent, card);
      }
      return scaling_evo(self, card, context, 'j_poke_arboliva', card.sell_cost, self.config.evo_rqmt);
    },
  },
  // Arboliva 930: +$2 sell value to every Joker and consumable at end of round, double to Grass jokers and Grass Energy.
  arboliva: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra || self.config.extra;
      return { vars: [a.money_mod] };
    },
    calculate(self, card, context) {
      if (context.end_of_round && context.main_eval && !context.blueprint) {
        for (const area of [G.jokers, G.consumeables]) {
          for (const other_card of area.cards.slice()) {
            // (the Lua's ability.name 'c_poke_grass_energy' is Steamodded's name = key; ours names the center 'grass_energy')
            const double = is_type(other_card, 'Grass') || other_card.config.center.key === 'c_poke_grass_energy';
            olive_value(other_card, card, double ? 2 : 1);
          }
        }
      }
      return undefined;
    },
  },
}, FILE);
