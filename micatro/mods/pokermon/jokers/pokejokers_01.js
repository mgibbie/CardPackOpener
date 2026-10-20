// Pokermon 3.9.1 — pokemon/pokejokers_01.lua (Pokédex 001-030: Bulbasaur -> Nidorina), 36 jokers + 2 new 3.9.1 Megas (Mega Raichu X / Y, batch 16).
// Line-for-line port of the behaviour, on 3.9.1 since batch 6 (PORTING.md "Pokermon 3.9.1 upgrade"); static
// data (pos, config, rarity, cost, stage, ptype, gen, item_req, megas) comes from data.js + data391.js
// (config_all: the whole 3.9.1 config). This file is the reference port the other pokejokers_NN.js files copy.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, ease_discard, ease_hands_played,
  create_card, juice_card_until, defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo,
  ease_poke_dollars, has_enhancement, getMega_by_position, find_card, any, RANKS, RANK_ID,
  get_probability_vars, pseudorandom_probability, poke_convert_cards_to,
} from '../api.js';

const FILE = 'pokemon/pokejokers_01.lua';
const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];

// ------------------------------------------------------------ shared bodies
/** Bulbasaur line: $ for each held card of the round's rank (bulb1card). */
function bulba_held(card, context, seed, more_roll, tally = true) {
  if (context.individual && context.cardarea === G.hand && context.other_card.get_id() === G.GAME.current_round.bulb1card.id) {
    if (!context.end_of_round && !context.before && !context.after) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      let more = 0;
      if (more_roll) more = pseudorandom('bulba') < 0.50 ? 0 : 1;
      let earned = 0;
      if (tally && !context.blueprint) card.ability.extra.earned = card.ability.extra.earned + card.ability.extra.money_mod + more;
      earned = earned + card.ability.extra.money_mod + more;
      earned = ease_poke_dollars(card, seed, earned);
      return { message: localize('$') + earned, colour: 'MONEY', card };
    }
  }
  return undefined;
}
const hand_size = {
  add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
  remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
};
const discards = {
  add_to_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards + card.ability.extra.d_size; ease_discard(card.ability.extra.d_size); },
  remove_from_deck(self, card) { G.GAME.round_resets.discards = G.GAME.round_resets.discards - card.ability.extra.d_size; ease_discard(-card.ability.extra.d_size); },
};
const hands = {
  add_to_deck(self, card, from_debuff) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
    if (!from_debuff) ease_hands_played(card.ability.extra.hands);
  },
  remove_from_deck(self, card) {
    G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};
/** Charmander line: +mult_mod Mult per hand played with exactly d_remaining discards left. */
function charm_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint) {
      if (G.GAME.current_round.discards_left === card.ability.extra.d_remaining) {
        card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
        return { message: localize('k_upgrade_ex'), colour: 'MULT' };
      }
    } else if (context.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
    }
  }
  return undefined;
}
/** Squirtle line: chips grow by step * hands left each hand. */
function squirt_calc(card, context, step) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint) {
      card.ability.extra.chips = card.ability.extra.chips + (step * G.GAME.current_round.hands_left);
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
    }
    if (context.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
    }
  }
  return undefined;
}
const flat_mult = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult } : undefined);
const flat_chips = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chips] }), colour: 'CHIPS', chip_mod: card.ability.extra.chips } : undefined);
/** Pidgey line: distinct suits + distinct ranks in the scoring hand. */
function ranks_plus_suits(scoring_hand) {
  let ranks = 0, suits = 0;
  for (const s of SUITS4) for (const y of scoring_hand) if (y.is_suit(s)) { suits++; break; }
  for (const r of RANKS) for (const y of scoring_hand) if (RANK_ID[r] === y.get_id()) { ranks++; break; }
  return ranks + suits;
}
function pidgey_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    const n = ranks_plus_suits(context.scoring_hand);
    if (n > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult_mod * n] }), colour: 'MULT', mult_mod: card.ability.extra.mult_mod * n };
  }
  return undefined;
}
/**
 * Spearow / Fearow (3.9.1): every card_threshold cards drawn during Blinds (Steamodded hand_drawn) arms the
 * joker; the next played hand levels up (Blueprint copies the level up). Spearow evolves after evo_rqmt triggers.
 */
function spear_calc(card, context, spearow) {
  const ex = card.ability.extra;
  if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => card.ability.extra.upgrade === true, true);
  if (context.before && ex.upgrade) {
    if (!context.blueprint) {
      G.E_MANAGER.add_event(() => {
        card.ability.extra.upgrade = false;
        if (spearow) card.ability.extra.triggers = card.ability.extra.triggers + 1;
      });
    }
    return { card, level_up: true, message: localize('k_level_up_ex') };
  }
  if (context.hand_drawn && !context.blueprint) {
    ex.cards_drawn = ex.cards_drawn + context.hand_drawn.length;
    if (ex.cards_drawn >= ex.card_threshold) {
      ex.upgrade = true;
      juice_card_until(card, () => card.ability.extra.upgrade === true, true);
      ex.cards_drawn = ex.cards_drawn % ex.card_threshold;
    }
  }
  return undefined;
}
/** Sandshrew line: +chips per Glass card in the full deck (3.9.1: the shattered-Glass copy is gone). */
const sand_chips = (card, context) => (context.cardarea === G.jokers && context.scoring_hand && context.joker_main
  ? { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chip_mod * card.ability.extra.sandshrew_tally] }), colour: 'CHIPS', chip_mod: card.ability.extra.chip_mod * card.ability.extra.sandshrew_tally }
  : undefined);
function sand_update(self, card) {
  card.ability.extra.sandshrew_tally = 0;
  for (const v of G.playing_cards) if (has_enhancement(v, 'm_glass')) card.ability.extra.sandshrew_tally = card.ability.extra.sandshrew_tally + 1;
}
/** Nidoran-F line: each Queen held gives +chips. */
function nido_queen(card, context) {
  if (context.individual && context.cardarea === G.hand && context.other_card.get_id() === 12) {
    if (!context.end_of_round && !context.before && !context.after) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      return { h_chips: card.ability.extra.chips, card };
    }
  }
  return undefined;
}
/** Raichu: mult_mod per money_count dollars (incl. money still being paid out: G.GAME.dollar_buffer). */
const raichu_mult = (ex) => ex.mult_mod * Math.floor((((G.GAME && G.GAME.dollars) || 0) + ((G.GAME && G.GAME.dollar_buffer) || 0)) / ex.money_count);
const bulb_rank = () => localize((G.GAME && G.GAME.current_round.bulb1card && G.GAME.current_round.bulb1card.rank) || 'Ace', 'ranks');
const mega_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' }); };

defineJokers({
  // Bulbasaur 001
  bulbasaur: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const money_left = Math.max(0, self.config.evo_rqmt - center.ability.extra.earned);
      return { vars: [center.ability.extra.money_mod, money_left, bulb_rank(), center.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      const r = bulba_held(card, context, 'bulba', false);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_ivysaur', card.ability.extra.earned, self.config.evo_rqmt);
    },
    ...hand_size,
  },
  // Ivysaur 002
  ivysaur: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const money_left = Math.max(0, self.config.evo_rqmt - center.ability.extra.earned);
      return { vars: [center.ability.extra.money_mod, money_left, center.ability.extra.h_size, bulb_rank(), center.ability.extra.money_mod + 1] };
    },
    calculate(self, card, context) {
      const r = bulba_held(card, context, 'ivy', true);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_venusaur', card.ability.extra.earned, self.config.evo_rqmt);
    },
    ...hand_size,
  },
  // Venusaur 003
  venusaur: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      return { vars: [center.ability.extra.money_mod, center.ability.extra.earned, center.ability.extra.h_size, bulb_rank()] };
    },
    calculate(self, card, context) { return bulba_held(card, context, 'venu', false, false); },
    ...hand_size,
  },
  // Mega Venusaur 003-1
  mega_venusaur: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.h_size] }; },
    ...hand_size, // (3.9.1 no longer draws the extra cards at once)
  },
  // Charmander 004
  charmander: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.d_remaining, center.ability.extra.d_size] };
    },
    calculate(self, card, context) {
      const r = charm_calc(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_charmeleon', card.ability.extra.mult, self.config.evo_rqmt);
    },
    ...discards,
  },
  // Charmeleon 005
  charmeleon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.d_remaining, center.ability.extra.d_size] };
    },
    calculate(self, card, context) {
      const r = charm_calc(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_charizard', card.ability.extra.mult, self.config.evo_rqmt);
    },
    ...discards,
  },
  // Charizard 006
  charizard: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      if (detailed() && any(find_card('c_poke_megastone'))) info_queue.push({ set: 'Other', key: 'split_mega', vars: ['Mega Charizard X', 'Mega Charizard Y'] });
      return { vars: [center.ability.extra.mult, center.ability.extra.Xmult, center.ability.extra.d_remaining, center.ability.extra.d_size] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        if (G.GAME.current_round.discards_left === card.ability.extra.d_remaining) {
          return { message: 'Fire Blast!', colour: 'XMULT', mult_mod: card.ability.extra.mult, Xmult_mod: card.ability.extra.Xmult };
        }
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return undefined;
    },
    ...discards,
    getMega: getMega_by_position,
  },
  // Mega Charizard X 006-1
  mega_charizard_x: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.d_remaining] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && G.GAME.current_round.discards_left === card.ability.extra.d_remaining) {
        return { message: 'Fire Blast!', colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Mega Charizard Y 006-2
  mega_charizard_y: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.d_size] }; },
    ...discards,
  },
  // Squirtle 007
  squirtle: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.hands, self.config.evo_rqmt, center.ability.extra.chip_mod] };
    },
    calculate(self, card, context) {
      const r = squirt_calc(card, context, card.ability.extra.chip_mod);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_wartortle', card.ability.extra.chips, self.config.evo_rqmt);
    },
    ...hands,
  },
  // Wartortle 008
  wartortle: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.hands, self.config.evo_rqmt, center.ability.extra.chip_mod] };
    },
    calculate(self, card, context) {
      const r = squirt_calc(card, context, card.ability.extra.chip_mod);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_blastoise', card.ability.extra.chips, self.config.evo_rqmt);
    },
    ...hands,
  },
  // Blastoise 009
  blastoise: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      const ex = center.ability.extra;
      return { vars: [ex.chips, ex.chip_mod, ex.hands, ex.chips + (ex.chip_mod * ((G.GAME && G.GAME.current_round && G.GAME.current_round.hands_left) || 0))] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const c = card.ability.extra.chips + (card.ability.extra.chip_mod * G.GAME.current_round.hands_left);
        return { message: localize({ type: 'variable', key: 'a_chips', vars: [c] }), colour: 'CHIPS', chip_mod: c };
      }
      return undefined;
    },
    ...hands,
  },
  // Mega Blastoise 009-1 (only the extra hands — the Lua defines no calculate)
  mega_blastoise: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chip_mod, center.ability.extra.hands] }; },
    ...hands,
  },
  // Caterpie 010
  caterpie: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return flat_mult(card, context) || level_evo(self, card, context, 'j_poke_metapod'); },
  },
  // Metapod 011
  metapod: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return flat_mult(card, context) || level_evo(self, card, context, 'j_poke_butterfree'); },
  },
  // Butterfree 012
  butterfree: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult] }; },
    calculate(self, card, context) { return flat_mult(card, context); },
  },
  // Weedle 013
  weedle: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return flat_chips(card, context) || level_evo(self, card, context, 'j_poke_kakuna'); },
  },
  // Kakuna 014
  kakuna: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return flat_chips(card, context) || level_evo(self, card, context, 'j_poke_beedrill'); },
  },
  // Beedrill 015
  beedrill: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.chips] }; },
    calculate(self, card, context) { return flat_chips(card, context); },
  },
  // Mega Beedrill 015-1
  mega_beedrill: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips] }; },
    calculate(self, card, context) { return flat_chips(card, context); },
  },
  // Pidgey 016
  pidgey: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds, center.ability.extra.mult_mod] }; },
    calculate(self, card, context) { return pidgey_calc(card, context) || level_evo(self, card, context, 'j_poke_pidgeotto'); },
  },
  // Pidgeotto 017
  pidgeotto: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds, center.ability.extra.mult_mod] }; },
    calculate(self, card, context) { return pidgey_calc(card, context) || level_evo(self, card, context, 'j_poke_pidgeot'); },
  },
  // Pidgeot 018
  pidgeot: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); mega_tip(info_queue); return { vars: [center.ability.extra.mult_mod] }; },
    calculate(self, card, context) { return pidgey_calc(card, context); },
  },
  // Mega Pidgeot 018-1
  mega_pidgeot: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult_multi] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const n = ranks_plus_suits(context.scoring_hand);
        if (n > 0) {
          const x = 1 + card.ability.extra.Xmult_multi * n;
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [x] }), colour: 'XMULT', Xmult_mod: x };
        }
      }
      return undefined;
    },
  },
  // Rattata 019
  rattata: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.retriggers, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play) {
        if (context.other_card === context.scoring_hand[0] || context.other_card === context.scoring_hand[1]) {
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      return level_evo(self, card, context, 'j_poke_raticate');
    },
  },
  // Raticate 020
  raticate: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      if (context.repetition && context.cardarea === G.play) {
        if (context.other_card === context.scoring_hand[0] || context.other_card === context.scoring_hand[1] || context.other_card === context.scoring_hand[2]) {
          return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
        }
      }
      return undefined;
    },
  },
  // Spearow 021
  spearow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [Math.max(0, self.config.evo_rqmt - ex.triggers), ex.card_threshold, Math.max(0, ex.card_threshold - ex.cards_drawn), ex.upgrade ? '(' + localize('k_active_ex') + ')' : ''] };
    },
    poke_custom_values_to_keep: ['upgrade'],
    calculate(self, card, context) { return spear_calc(card, context, true) || scaling_evo(self, card, context, 'j_poke_fearow', card.ability.extra.triggers, self.config.evo_rqmt); },
  },
  // Fearow 022
  fearow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.card_threshold, Math.max(0, ex.card_threshold - ex.cards_drawn), ex.upgrade ? '(' + localize('k_active_ex') + ')' : '', ex.d_size] };
    },
    calculate(self, card, context) { return spear_calc(card, context, false); },
    ...discards,
  },
  // Ekans 023
  ekans: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Straight.length) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return level_evo(self, card, context, 'j_poke_arbok');
    },
  },
  // Arbok 024
  arbok: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Straight.length) {
        let aces = 0;
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          for (const c of context.scoring_hand) if (c.get_id() === 14) aces = aces + 1;
        }
        if (aces > 0) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          return {
            message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }),
            colour: 'MULT',
            extra: {
              focus: card, message: localize('k_plus_tarot'), colour: 'PURPLE',
              func() {
                G.E_MANAGER.add_event(() => {
                  const _card = create_card('Tarot', G.consumeables, null, null, null, null, null, 'sup');
                  _card.add_to_deck();
                  G.consumeables.emplace(_card);
                  G.GAME.consumeable_buffer = 0;
                });
              },
            },
            mult_mod: card.ability.extra.mult,
          };
        }
        // Intended-design fix: the Lua shows the a_chips text ("+15 Chips") for this Mult bonus.
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return undefined;
    },
  },
  // Pikachu 025 (3.9.1: +Mult at $25+, $2 when a Blind is selected below it; no cash-out $)
  pikachu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_thunderstone);
      const ex = center.ability.extra;
      return { vars: [ex.mult, ex.money, ex.money_threshold] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && G.GAME.dollars < card.ability.extra.money_threshold) {
        card.juice_up();
        ease_poke_dollars(card, 'pikachu', card.ability.extra.money);
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && G.GAME.dollars >= card.ability.extra.money_threshold) {
        return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return item_evo(self, card, context, 'j_poke_raichu');
    },
  },
  // Raichu 026 (3.9.1: +mult_mod Mult per $money_count, earns interest when a Blind is selected)
  raichu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      mega_tip(info_queue);
      if (detailed() && any(find_card('c_poke_megastone'))) info_queue.push({ set: 'Other', key: 'split_mega', vars: ['Mega Raichu X', 'Mega Raichu Y'] });
      const ex = center.ability.extra;
      return { vars: [ex.mult_mod, ex.money_count, raichu_mult(ex), ex.money_threshold] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        card.juice_up();
        ease_poke_dollars(card, 'raichu', G.GAME.interest_amount * Math.min(Math.floor(G.GAME.dollars / 5), G.GAME.interest_cap / 5));
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const m = raichu_mult(card.ability.extra);
        if (m > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), colour: 'MULT', mult_mod: m };
      }
      return undefined;
    },
    // 3.9.1 megas = {mega_raichu_x, mega_raichu_y} (batch 16): the X / Y pick is Charizard's (leftmost X, rightmost Y, else random).
    getMega: getMega_by_position,
  },
  // Mega Raichu X 026-1 (3.9.1, batch 16): +$25 interest cap while held; each hand earns the interest you'd get now.
  mega_raichu_x: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.interest_cap / 5] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        const earned = ease_poke_dollars(card, 'raichu', G.GAME.interest_amount * Math.min(Math.floor(G.GAME.dollars / 5), G.GAME.interest_cap / 5), true);
        return { card, dollars: earned };
      }
      return undefined;
    },
    // (the Lua adds / removes a flat 25, not the config's interest_cap)
    add_to_deck() { G.GAME.interest_cap = G.GAME.interest_cap + 25; },
    remove_from_deck() { G.GAME.interest_cap = G.GAME.interest_cap - 25; },
  },
  // Mega Raichu Y 026-2 (3.9.1, batch 16): +mult_mod Mult per $money_count you have (Raichu's, per $1).
  mega_raichu_y: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.mult_mod, ex.money_count, raichu_mult(ex)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const m = raichu_mult(card.ability.extra);
        if (m > 0) return { message: localize({ type: 'variable', key: 'a_mult', vars: [m] }), colour: 'MULT', mult_mod: m };
      }
      return undefined;
    },
  },
  // Sandshrew 027
  sandshrew: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      const ex = center.ability.extra;
      return { vars: [ex.rounds, ex.chip_mod, ex.chip_mod * ex.sandshrew_tally] };
    },
    calculate(self, card, context) { return sand_chips(card, context) || level_evo(self, card, context, 'j_poke_sandslash'); },
    update: sand_update,
  },
  // Sandslash 028 (3.9.1: each discarded Enhanced card has a 1 in 3 chance to become Glass)
  sandslash: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      const ex = center.ability.extra;
      const [num, dem] = get_probability_vars(center, ex.num, ex.dem, 'sandslash');
      return { vars: [ex.chip_mod, ex.chip_mod * ex.sandshrew_tally, num, dem] };
    },
    calculate(self, card, context) {
      const r = sand_chips(card, context);
      if (r) return r;
      if (context.discard && context.other_card.config.center !== P_CENTERS.c_base && !context.blueprint) {
        if (pseudorandom_probability(card, 'sandslash', card.ability.extra.num, card.ability.extra.dem, 'sandslash')) {
          poke_convert_cards_to([context.other_card], { mod_conv: 'm_glass' });
        }
      }
      return undefined;
    },
    update: sand_update,
  },
  // Nidoran-F 029
  nidoranf: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.rounds] }; },
    calculate(self, card, context) { return nido_queen(card, context) || level_evo(self, card, context, 'j_poke_nidorina'); },
  },
  // Nidorina 030
  nidorina: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_moonstone);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) { return nido_queen(card, context) || item_evo(self, card, context, 'j_poke_nidoqueen'); },
  },
}, FILE);
