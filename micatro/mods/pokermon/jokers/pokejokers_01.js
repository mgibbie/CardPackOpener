// Pokermon 3.2.1 — pokemon/pokejokers_01.lua (Pokédex 001-030: Bulbasaur -> Nidorina), 36 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage,
// ptype, gen, item_req, megas) comes from data.js. This file is the reference port the
// other pokejokers_NN.js files copy — see ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, ease_discard, ease_hands_played,
  draw_card, create_card, copy_card, find_joker, juice_card_until, playing_card_joker_effects, delay,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars,
  has_enhancement, getMega_by_position, find_card, any, RANKS, RANK_ID,
} from '../api.js';

const FILE = 'pokemon/pokejokers_01.lua';
const SUITS4 = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];

// ------------------------------------------------------------ shared bodies
/** Bulbasaur line: $ for each held card of the round's rank (bulb1card). */
function bulba_held(card, context, seed, more_roll) {
  if (context.individual && context.cardarea === G.hand && context.other_card.get_id() === G.GAME.current_round.bulb1card.id) {
    if (!context.end_of_round && !context.before && !context.after) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      let more = 0;
      if (more_roll) more = pseudorandom('bulba') < 0.50 ? 0 : 1;
      let earned = 0;
      if (!context.blueprint) card.ability.extra.earned = card.ability.extra.earned + card.ability.extra.money_mod + more;
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
/** Spearow / Fearow: after card_threshold scored cards, level up the next hand. */
function spear_calc(card, context, fearow) {
  if (context.first_hand_drawn && !context.blueprint) juice_card_until(card, () => card.ability.extra.upgrade === true, true);
  if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
    if (context.before && card.ability.extra.upgrade) {
      if (!fearow || card.ability.extra.cards_scored >= card.ability.extra.card_threshold) {
        card.ability.extra.cards_scored = card.ability.extra.cards_scored - card.ability.extra.card_threshold;
      }
      card.ability.extra.upgrade = false;
      return { card, level_up: true, message: localize('k_level_up_ex') };
    }
    if (context.joker_main && !context.blueprint) {
      card.ability.extra.cards_scored = card.ability.extra.cards_scored + context.scoring_hand.length;
      if (card.ability.extra.cards_scored >= card.ability.extra.card_threshold && !card.ability.extra.upgrade) {
        card.ability.extra.upgrade = true;
        juice_card_until(card, () => card.ability.extra.upgrade === true, true);
      }
    }
  }
  return undefined;
}
/** Sandshrew line: copy the first `limit` shattered Glass cards each round into hand. */
function sand_calc(self, card, context, limit) {
  if (context.remove_playing_cards && card.ability.extra.glass_restored < limit && !context.blueprint) {
    for (const v of context.removed) {
      if (v.shattered && card.ability.extra.glass_restored < limit) {
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(v, null, null, G.playing_card);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          G.hand.emplace(copy);
          copy.start_materialize();
          playing_card_joker_effects([copy]);
        });
        card.ability.extra.glass_restored = card.ability.extra.glass_restored + 1;
      }
    }
    // (Lua: `card_to_copy` is never set, so no "Copied!" return here.)
  }
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra.chip_mod * card.ability.extra.sandshrew_tally] }), colour: 'CHIPS', chip_mod: card.ability.extra.chip_mod * card.ability.extra.sandshrew_tally };
  }
  if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
    if (card.ability.extra.glass_restored > 0) {
      card.ability.extra.glass_restored = 0;
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
    }
  }
  return level_evo(self, card, context, 'j_poke_sandslash');
}
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
    calculate(self, card, context) { return bulba_held(card, context, 'venu', false); },
    ...hand_size,
  },
  // Mega Venusaur 003-1
  mega_venusaur: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.h_size] }; },
    add_to_deck(self, card, from_debuff) {
      G.hand.change_size(card.ability.extra.h_size);
      if (!from_debuff && G.hand && G.hand.cards && G.hand.cards.length > 0) {
        const hand_space = Math.min(G.deck.cards.length, card.ability.extra.h_size - 1);
        delay(0.3);
        for (let i = 1; i <= hand_space; i++) draw_card(G.deck, G.hand, i * 100 / hand_space, 'up', true);
      }
    },
    remove_from_deck(self, card) { G.hand.change_size(-card.ability.extra.h_size); },
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
      // Lua hard-codes 2 per hand here (not chip_mod).
      const r = squirt_calc(card, context, 2);
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
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.hands] };
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
      return { vars: [ex.rounds, ex.card_threshold, Math.max(0, ex.card_threshold - ex.cards_scored), ex.upgrade ? '(' + localize('k_active_ex') + ')' : ''] };
    },
    calculate(self, card, context) { return spear_calc(card, context, false) || level_evo(self, card, context, 'j_poke_fearow'); },
  },
  // Fearow 022
  fearow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.card_threshold, Math.max(0, ex.card_threshold - ex.cards_scored), ex.upgrade ? '(' + localize('k_active_ex') + ')' : ''] };
    },
    calculate(self, card, context) { return spear_calc(card, context, true); },
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
  // Pikachu 025
  pikachu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_thunderstone);
      return { vars: [center.ability.extra.money] };
    },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'pikachu', Math.min(10, G.jokers.cards.length * card.ability.extra.money), true); },
    calculate(self, card, context) { return item_evo(self, card, context, 'j_poke_raichu'); },
  },
  // Raichu 026
  raichu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed() && !(center.edition && center.edition.negative)) info_queue.push(P_CENTERS.e_negative);
      const ex = center.ability.extra;
      return { vars: [ex.money, Math.max(ex.threshold, ex.threshold + (ex.threshold * (find_joker('raichu').length - 1))), ex.money_limit] };
    },
    calc_dollar_bonus(self, card) {
      const ex = card.ability.extra;
      const turn_neg = G.GAME.dollars >= ex.threshold + (ex.threshold * (find_joker('raichu').length - 1)) && !(card.edition && card.edition.negative);
      if (turn_neg) card.set_edition({ negative: true }, true);
      return ease_poke_dollars(card, 'raichu', Math.min(ex.money_limit, G.jokers.cards.length * ex.money), true);
    },
  },
  // Sandshrew 027
  sandshrew: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      const ex = center.ability.extra;
      return { vars: [ex.rounds, ex.chip_mod, ex.chip_mod * ex.sandshrew_tally], colours: [ex.glass_restored !== 0 ? 'UI.TEXT_INACTIVE' : undefined] };
    },
    calculate(self, card, context) { return sand_calc(self, card, context, 1); },
    update: sand_update,
  },
  // Sandslash 028
  sandslash: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      const ex = center.ability.extra;
      return { vars: [ex.chip_mod, ex.chip_mod * ex.sandshrew_tally, ex.glass_limit, ex.glass_limit - ex.glass_restored], colours: [ex.glass_restored >= ex.glass_limit ? 'UI.TEXT_INACTIVE' : undefined] };
    },
    // (Lua evolves Sandslash "into" itself via level_evo — a no-op without `rounds`.)
    calculate(self, card, context) { return sand_calc(self, card, context, card.ability.extra.glass_limit); },
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
