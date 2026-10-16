// Pokermon 3.2.1 — pokemon/pokejokers_31.lua (Pokédex 901-930: Ursaluna -> Dachsbun), 5 jokers,
// plus Hisuian Qwilfish / Overqwil, which the Lua writes (commented out) but never registers.
// Line-for-line port of the behaviour; static data comes from data.js (see ../PORTING.md).
import {
  G, P_CENTERS, localize, card_eval_status_text, create_card, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, has_enhancement, find_pokemon_type,
  poke_add_hazards, poke_set_hazards, poke_next_highest_rank, poke_lowest_rank,
} from '../api.js';

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
      }
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.skipping_booster) {
        if (!context.blueprint) card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const _card = create_card('Item', G.consumeables, null, null, null, null, null);
          _card.set_edition({ polychrome: true }, true);
          _card.add_to_deck();
          G.consumeables.emplace(_card);
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
  // Tarountula 917
  tarountula: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [abbr.hazards] });
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [abbr.hazards, abbr.rounds, abbr.h_size] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      return level_evo(self, card, context, 'j_poke_spidops');
    },
    ...hand_size,
  },
  // Spidops 918
  spidops: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const abbr = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'poke_hazards', vars: [abbr.hazards] });
      info_queue.push(P_CENTERS.m_poke_hazard);
      return { vars: [abbr.hazards, abbr.h_size, abbr.h_max, abbr.h_total] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) poke_set_hazards(card.ability.extra.hazards);
      if (context.joker_main && context.cardarea === G.jokers && G.GAME.current_round.hands_played === 0 && !context.blueprint) {
        let all_hazards = true;
        for (const v of context.full_hand) if (!has_enhancement(v, 'm_poke_hazard')) all_hazards = false;
        if (all_hazards) {
          const size_up = card.ability.extra.h_size * context.scoring_hand.length;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [size_up] }) });
          G.hand.change_size(size_up);
          G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + size_up;
        }
      }
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      return undefined;
    },
    ...hand_size,
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
