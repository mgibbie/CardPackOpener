// Pokermon 3.9.1 — pokemon/pokejokers_31.lua (Pokédex 901-930: Ursaluna -> Dachsbun), 5 jokers,
// plus Hisuian Qwilfish / Overqwil, which the Lua writes (commented out) but never registers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8, Tarountula / Spidops (the Hazard layer) since batch 10.
import {
  G, P_CENTERS, localize, card_eval_status_text, create_card, juice_card_until, poll_edition, add_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, has_enhancement, find_pokemon_type,
  poke_add_hazards, poke_next_highest_rank, poke_lowest_rank, hazard_layer, hazard_level_tip,
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
    // Pokermon has no Hisuian Qwilfish art ('Regionals' never shipped): Micatro's own card — the real
    // Hisuian sprite grafted into Pokermon's Dark-type Basic frame and Qwilfish's underwater scene.
    pos: { x: 0, y: 0 },
    config: { extra: { hazard_ratio: 10, chip_mod: 5, chips: 0 }, evo_rqmt: 80 },
    rarity: 2,
    cost: 7,
    stage: 'Basic',
    ptype: 'Dark',
    atlas: 'hisuian_qwilfish',
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
}, FILE);
