// Pokermon 3.9.1 — pokemon/pokejokers_25.lua (Pokédex 721-750: Grubbin -> Lycanroc), 7 jokers.
// Line-for-line port of the behaviour; static data comes from data.js + data391.js (see ../PORTING.md).
// On Pokermon 3.9.1 behaviour since batch 8 (no holds in this file).
import {
  G, P_CENTERS, localize, ease_hands_played, ease_discard,
  defineJokers, type_tooltip, detailed, level_evo, item_evo, scaling_evo,
  find_pokemon_type, poke_is_even, poke_is_odd,
} from '../api.js';

const FILE = 'pokemon/pokejokers_25.lua';

const mult_ret = (m) => ({ message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), colour: 'MULT', mult_mod: m });

defineJokers({
  // Grubbin 736
  grubbin: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let card_mult = card.ability.extra.mult;
        if (find_pokemon_type('Lightning').length) card_mult = card_mult * 3;
        return mult_ret(card_mult);
      }
      return level_evo(self, card, context, 'j_poke_charjabug');
    },
  },
  // Charjabug 737
  charjabug: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_thunderstone);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult * find_pokemon_type('Lightning').length] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const count = find_pokemon_type('Lightning').length;
        if (count > 0) return mult_ret(card.ability.extra.mult * count);
      }
      return item_evo(self, card, context, 'j_poke_vikavolt');
    },
  },
  // Vikavolt 738
  vikavolt: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const count = find_pokemon_type('Lightning').length;
      return { vars: [center.ability.extra.Xmult, Math.max(1, 1 + center.ability.extra.Xmult * count)] };
    },
    // Pokermon 3.9.1: X(1 + Xmult x every Lightning Joker, itself included — 3.2.1 counted the others), no +Mult, and
    // nothing at X1. (The Lua popup has no colour: the default.)
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const xmult = 1 + card.ability.extra.Xmult * find_pokemon_type('Lightning').length;
        if (xmult > 1) return { message: localize('poke_thunder_ex'), Xmult_mod: xmult };
      }
      return undefined;
    },
  },
  // Rockruff 744
  rockruff: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.even_to_score, center.ability.extra.odd_to_score] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.is_face()) {
        // (Pokermon 3.9.1: Blueprint no longer counts toward the evolution.)
        if (poke_is_even(context.other_card) && card.ability.extra.even_to_score > 0 && !context.blueprint) card.ability.extra.even_to_score = card.ability.extra.even_to_score - 1;
        if (poke_is_odd(context.other_card) && card.ability.extra.odd_to_score > 0 && !context.blueprint) card.ability.extra.odd_to_score = card.ability.extra.odd_to_score - 1;
        return { mult: card.ability.extra.mult, card };
      }
      const ex = card.ability.extra, rq = self.config.evo_rqmt;
      let evo = scaling_evo(self, card, context, 'j_poke_lycanroc_dusk', (rq * 2) - ex.odd_to_score - ex.even_to_score, rq * 2);
      if (!evo) evo = scaling_evo(self, card, context, 'j_poke_lycanroc_day', rq - ex.even_to_score, rq);
      if (!evo) evo = scaling_evo(self, card, context, 'j_poke_lycanroc_night', rq - ex.odd_to_score, rq);
      if (evo) return evo;
      return undefined;
    },
  },
  // Lycanroc (Midday) 745
  lycanroc_day: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.chip_mod, center.ability.extra.hands] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (G.GAME.current_round.hands_played === 0 && context.full_hand.length === 1) {
          ease_hands_played(card.ability.extra.hands);
          if (poke_is_even(context.other_card)) return { mult: card.ability.extra.mult, chips: card.ability.extra.chip_mod, card };
          return { chips: card.ability.extra.chip_mod, card };
        }
        if (poke_is_even(context.other_card)) return { mult: card.ability.extra.mult, card };
      }
      return undefined;
    },
  },
  // Lycanroc (Midnight)
  lycanroc_night: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.hands, center.ability.extra.discards, center.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && context.blind && context.blind.boss) {
        ease_hands_played(card.ability.extra.hands);
        ease_discard(card.ability.extra.discards);
        G.hand.change_size(card.ability.extra.h_size);
        G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && poke_is_odd(context.other_card)) {
        return { mult: card.ability.extra.mult, card };
      }
      return undefined;
    },
  },
  // Lycanroc (Dusk)
  lycanroc_dusk: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult] }; },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.is_face()) {
        return { mult: card.ability.extra.mult, card };
      }
      if (context.repetition && context.cardarea === G.play) {
        let first_even = null, first_odd = null;
        for (const c of context.scoring_hand) {
          if (poke_is_even(c) && !first_even) first_even = c;
          if (poke_is_odd(c) && !first_odd) first_odd = c;
        }
        // Pokermon 3.9.1: every hand (it was once per round).
        if (context.other_card === first_even) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        if (context.other_card === first_odd) return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
}, FILE);
