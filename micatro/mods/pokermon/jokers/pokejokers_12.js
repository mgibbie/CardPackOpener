// Pokermon 3.9.1 — pokemon/pokejokers_12.lua (Pokédex 331-360: Feebas -> Wynaut), 6 jokers + 19 new in 3.9.1.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// The 19 jokers 3.9.1 added to this file are at the end (new-jokers sub-batch 13; static data: data391.js new_jokers).
import {
  G, P_CENTERS, localize, card_eval_status_text, create_card,
  defineJokers, type_tooltip, detailed, level_evo, item_evo, faint_baby_poke, poke_same_suit, add_card,
  scaling_evo, has_enhancement, scale_card, calculate_effect, ease_poke_dollars, hazard_layer, hazard_level_tip, pseudorandom,
  pseudorandom_element, pseudoseed, pseudoshuffle, draw_card, get_probability_vars, pseudorandom_probability, find_pokemon_type,
  get_type, is_type, apply_type_sticker, get_poke_target_card_ranks, add_target_cards_to_vars, poke_remove_card, add_playing_card,
  ease_hands_played, juice_card_until, play_sound, copy_card, playing_card_joker_effects, all_cards,
} from '../api.js';

const FILE = 'pokemon/pokejokers_12.lua';

/** Duskull / Dusclops: retrigger the first 4 scoring cards of the final hand. */
function dusk_retrigger(card, context) {
  if (context.repetition && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_left === 0) {
    const sh = context.scoring_hand;
    if (context.other_card === sh[0] || context.other_card === sh[1] || context.other_card === sh[2] || context.other_card === sh[3]) {
      return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
    }
  }
  return undefined;
}
/** Baby Pokémon: X Mult below 1 (faints unless only Babies are to its right). */
function baby_xmult(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main) {
      faint_baby_poke(self, card, context);
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
    }
  }
  return undefined;
}

defineJokers({
  // Feebas 349
  feebas: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Joker', key: 'j_splash', config: {} });
      return { vars: [center.ability.extra.mult] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return item_evo(self, card, context, 'j_poke_milotic');
    },
  },
  // Milotic 350
  milotic: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return undefined; // (Lua returns nothing)
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && poke_same_suit(context.scoring_hand)) card.ability.extra.active = true;
        if (context.after && card.ability.extra.active) card.ability.extra.active = false;
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && card.ability.extra.active) {
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
  // Duskull 355
  duskull: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = dusk_retrigger(card, context);
      if (r) return r;
      return level_evo(self, card, context, 'j_poke_dusclops');
    },
  },
  // Dusclops 356
  dusclops: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.retriggers] };
    },
    calculate(self, card, context) {
      const r = dusk_retrigger(card, context);
      if (r) return r;
      // Pokermon 3.9.1: the single unscored card of the final hand is destroyed in the destroy_card pass (cardarea
      // 'unscored', so the destroy is seen by remove_playing_cards listeners) and the Spectral needs consumable room.
      if (context.destroy_card && context.cardarea === 'unscored' && !context.blueprint
        && G.GAME.current_round.hands_left === 0 && (context.full_hand.length - context.scoring_hand.length) === 1) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            const spectral = add_card({ set: 'Spectral' });
            card_eval_status_text(spectral, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
            G.GAME.consumeable_buffer = 0;
          });
        }
        return { remove: true };
      }
      return item_evo(self, card, context, 'j_poke_dusknoir');
    },
  },
  // Absol 359
  absol: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.scry] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
        }
      }
      // Every listed probability (SMODS.get_probability_vars) is fixed to 0.
      if (context.fix_probability && !context.blueprint) return { numerator: 0 };
      return undefined;
    },
  },
  // Wynaut 360
  wynaut: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_fool);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      const r = baby_xmult(self, card, context);
      if (r) return r;
      if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_wobbuffet');
    },
  },
}, FILE);

// ------------------------------------------- new in Pokermon 3.9.1 (new-jokers sub-batch 13): 19 jokers
// Cacnea / Cacturne, Swablu / Altaria, Zangoose, Seviper, Corphish / Crawdaunt, Baltoy / Claydol, Lileep / Cradily,
// Anorith / Armaldo, Kecleon, Shuppet / Banette, Tropius, Chimecho. Static data: data391.js new_jokers. Zangoose's cards
// stay out of the poker hand through the poker_hand_cards hook and Chimecho's free Vouchers are in systems/rules.js;
// Kecleon's per-type card is drawn by ui.js (systems/anim.js KECLEON_SPRITES).

/** Hazard-layer jokers' tooltips (3.9.1): the Hazard Layer (current / max) and the Hazard card. */
const hazard_tip = (info_queue) => {
  info_queue.push(hazard_level_tip());
  info_queue.push(P_CENTERS.m_poke_hazard);
};
/** Cacnea / Cacturne: $money_mod for each destroyed playing card. */
function cacnea_money(card, context) {
  if (context.remove_playing_cards) {
    for (let i = 0; i < context.removed.length; i++) {
      const earned = ease_poke_dollars(card, 'cacnea', card.ability.extra.money_mod);
      card_eval_status_text(card, 'extra', null, null, null, { message: '$' + earned, colour: 'MONEY' });
    }
  }
}
/** Swablu / Altaria: the 9s of this draw (SMODS.drawn_cards = Micatro's context.hand_drawn, during the Blind). */
const drawn_nines = (context) => (context.hand_drawn ? context.hand_drawn.filter((c) => c.get_id() === 9) : []);
/** Corphish / Crawdaunt: unscored cards of the Nature ranks in the played hand (a card counts once per matching target). */
function unscored_natures(card, context) {
  let natures = 0;
  for (const v of context.full_hand) {
    if (!context.scoring_hand.includes(v)) {
      for (const t of card.ability.extra.targets) if (v.get_id() === t.id) natures = natures + 1;
    }
  }
  return natures;
}
const corphish_vars = (card, vars) => {
  add_target_cards_to_vars(vars, card.ability.extra.targets);
  return { vars };
};
/** Baltoy / Claydol: the "+1 Hazard Layer / +min-max Chips for each" lines the Lua draws as its main_start. */
const baltoy_start = (card) => [
  '{C:poke_hazard}+' + card.ability.extra.hazard_level + '{} ' + localize('k_poke_hazard_layer'),
  '{C:chips}+' + card.ability.extra.chip_mod + '-' + card.ability.extra.chip_mod1 + '{} ' + localize('k_poke_chips') + ' ' + localize('poke_baltoy_text'),
];
/** Baltoy / Claydol: +chip_mod..chip_mod1 Chips (rolled, seed 'baltoy') per discarded Hazard card. */
function baltoy_discard(card, context) {
  if (context.discard && has_enhancement(context.other_card, 'm_poke_hazard') && !context.blueprint) {
    const chip_gain = pseudorandom('baltoy', card.ability.extra.chip_mod, card.ability.extra.chip_mod1);
    scale_card(card, {
      ref_value: 'chips', scalar_table: { chip_mod: chip_gain }, scalar_value: 'chip_mod',
      operation: (ref_table, ref_value, initial) => { ref_table[ref_value] = initial + chip_gain; },
      message_key: 'a_chips', message_colour: 'CHIPS',
    });
  }
}
const ancient_tip = (info_queue, rank) => info_queue.push({ set: 'Other', key: 'ancient', vars: [localize(rank, 'ranks')] });
/** pokermon.get_ancient_amount(hand, id, append_to_card): the cards of rank `id`, stored as extra.ancient_count. */
function get_ancient_amount(hand, id, append_to_card) {
  let count = 0;
  for (const c of hand) if (c.get_id() === id) count = count + 1;
  if (append_to_card) append_to_card.ability.extra.ancient_count = count;
  return count;
}
/** Lileep / Cradily: 1+ = +h_size hand size this round; 2+ = +$money_mod sell value to itself and every consumable. */
function lileep_main(card, context) {
  card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [card.ability.extra.h_size] }) });
  G.hand.change_size(card.ability.extra.h_size);
  G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
  if (card.ability.extra.ancient_count > 1) {
    card.ability.extra_value = (card.ability.extra_value || 0) + card.ability.extra.money_mod;
    card.set_cost();
    card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_val_up') });
    for (const v of G.consumeables.cards) {
      v.ability.extra_value = (v.ability.extra_value || 0) + card.ability.extra.money_mod;
      v.set_cost();
      card_eval_status_text(v, 'extra', null, null, null, { message: localize('k_val_up') });
    }
  }
}
/** Lileep / Cradily 3+: each card held in hand gives +chip_mod Chips. */
function lileep_held(card, context) {
  if (context.individual && context.cardarea === G.hand && card.ability.extra.ancient_count > 2) {
    if (!context.end_of_round && !context.before && !context.after) {
      if (context.other_card.debuff) return { message: localize('k_debuffed'), colour: 'RED', card };
      return { h_chips: card.ability.extra.chip_mod, card };
    }
  }
  return undefined;
}
/** Anorith / Armaldo 3+: destroy a random deck card ranked above 7 (seed 'anorith'). */
function anorith_destroy(card) {
  const targets = G.deck.cards.filter((v) => v.get_id() > 7);
  if (targets.length > 0) {
    const [target] = pseudorandom_element(targets, pseudoseed('anorith'));
    poke_remove_card(target, card);
  }
}
/** Armaldo: 1 + Xmult_multi per Enhanced 7 in the full deck. */
function armaldo_xmult(card) {
  if (!G.playing_cards) return 1;
  let enhanced_sevens = 0;
  for (const v of G.playing_cards) if (v.get_id() === 7 && v.config.center !== P_CENTERS.c_base) enhanced_sevens = enhanced_sevens + 1;
  return 1 + enhanced_sevens * card.ability.extra.Xmult_multi;
}
// (Kecleon's card per type: systems/anim.js KECLEON_SPRITES, drawn by ui.js face())
/** Kecleon's set_type: the type sticker (also its ptype), and its debuff re-evaluated (SMODS.recalc_debuff). */
function kecleon_set_type(card, ptype) {
  apply_type_sticker(card, ptype);
  card.set_debuff();
}
/** Kecleon's update: it takes the type of the joker to its right (Colorless with none). */
function kecleon_update(card) {
  if (!(card.area && card.area === G.jokers)) return;
  const other_joker = G.jokers.cards[G.jokers.cards.indexOf(card) + 1];
  if (other_joker) {
    const other_type = get_type(other_joker) || 'Colorless';
    if (get_type(card) !== other_type) kecleon_set_type(card, other_type);
  } else if (!is_type(card, 'Colorless')) {
    kecleon_set_type(card, 'Colorless');
  }
}
/** Shuppet / Banette: +mult_mod Mult each time a Joker is sold during the Blind. */
function shuppet_calc(card, context) {
  if (context.joker_main && card.ability.extra.mult > 0) return { mult: card.ability.extra.mult };
  if (context.selling_card && context.card.ability.set === 'Joker' && G.GAME.facing_blind && !context.blueprint) {
    scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });
  }
  return undefined;
}
/** Chimecho: re-price every card (its free Vouchers live in the set_cost hook). */
const reprice = () => G.E_MANAGER.add_event(() => { for (const v of all_cards()) if (v.set_cost) v.set_cost(); });

defineJokers({
  // Cacnea 331: +1 Hazard layer; $3 when a card is destroyed.
  cacnea: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      hazard_tip(info_queue);
      const abbr = card.ability.extra;
      return { vars: [abbr.hazard_level, abbr.money_mod, abbr.rounds] };
    },
    calculate(self, card, context) {
      cacnea_money(card, context);
      return level_evo(self, card, context, 'j_poke_cacturne');
    },
    ...hazard_layer,
  },
  // Cacturne 332: +1 Hazard layer; $5 when a card is destroyed; Hazard cards of the first hand are destroyed after scoring.
  cacturne: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      hazard_tip(info_queue);
      const abbr = card.ability.extra;
      return { vars: [abbr.hazard_level, abbr.money_mod] };
    },
    calculate(self, card, context) {
      cacnea_money(card, context);
      if (context.destroying_card) {
        return !context.blueprint && has_enhancement(context.destroying_card, 'm_poke_hazard') && G.GAME.current_round.hands_played === 0;
      }
      return undefined;
    },
    ...hazard_layer,
  },
  // Swablu 333: +2 Chips per 9 drawn during the Blind; evolves at +36.
  swablu: {
    knockoff_pseudol: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      if (context.hand_drawn && !context.blueprint) {
        for (let i = drawn_nines(context).length; i > 0; i--) scale_card(card, { ref_value: 'chips', scalar_value: 'chip_mod', message_colour: 'CHIPS' });
      }
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return scaling_evo(self, card, context, 'j_poke_altaria', card.ability.extra.chips, self.config.evo_rqmt);
    },
  },
  // Altaria 334: +3 Chips per 9 drawn during the Blind, and 1 in 3 for $1 (sure with another Dragon joker).
  altaria: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'altaria');
      return { vars: [center.ability.extra.chips, center.ability.extra.chip_mod, center.ability.extra.money_mod, num, dem] };
    },
    calculate(self, card, context) {
      if (context.hand_drawn) {
        for (let i = drawn_nines(context).length; i > 0; i--) {
          if (!context.blueprint) {
            // (3.9.1 adds chip_mod_extra with another Dragon joker; Altaria's config has none: + 0, ported as is)
            scale_card(card, {
              ref_value: 'chips', scalar_value: 'chip_mod',
              operation: (ref_table, ref_value, initial, change) => {
                ref_table[ref_value] = initial + change + (find_pokemon_type('Dragon', card).length > 0 ? (card.ability.extra.chip_mod_extra || 0) : 0);
              },
              message_colour: 'CHIPS',
            });
          }
          if (pseudorandom_probability(card, 'altaria', card.ability.extra.num, card.ability.extra.dem, 'altaria') || find_pokemon_type('Dragon', card).length > 0) {
            const earned = ease_poke_dollars(card, 'altaria', card.ability.extra.money_mod);
            G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + earned;
            G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
          }
        }
      }
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return undefined;
    },
  },
  // Zangoose 335: when a hand is played, 2 random held cards join it and score (the poker hand doesn't change).
  zangoose: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.amount] };
    },
    calculate(self, card, context) {
      if (context.press_play) {
        // (filtered: or a Blueprint copy would add the same cards again)
        const hand_cards = G.hand.cards.filter((c) => !c.poke_zangoose_card && !G.hand.highlighted.includes(c));
        pseudoshuffle(hand_cards, pseudoseed('zangoose'));
        const amount_to_add = Math.min(card.ability.extra.amount, hand_cards.length);
        if (amount_to_add > 0) calculate_effect({ message: localize('poke_crush_claw_ex') }, card);
        const added = hand_cards.slice(0, amount_to_add);
        for (const other_card of added) other_card.poke_zangoose_card = true;
        // The Lua's draws queue after the played cards' (press_play runs after Blind:press_play there; ours fires before
        // the played cards move): one event later, so they land after them in G.play.
        if (added.length) G.E_MANAGER.add_event(() => { for (const other_card of added) draw_card(G.hand, G.play, 100, 'up', null, other_card); });
      }
      if (context.modify_scoring_hand && context.other_card.poke_zangoose_card) {
        context.other_card.poke_zangoose_card = undefined;
        return { add_to_hand: true };
      }
      return undefined;
    },
  },
  // Seviper 336: a played or discarded hand of exactly 3 cards gives +1 hand size this round.
  seviper: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.req_size, center.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      if ((context.pre_discard || context.before) && context.full_hand && context.full_hand.length === card.ability.extra.req_size) {
        card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [card.ability.extra.h_size] }) });
        G.hand.change_size(card.ability.extra.h_size);
        G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
      }
      return undefined;
    },
  },
  // Corphish 341: +1 Mult when the played hand holds an unscored Nature card; evolves at +10.
  corphish: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'nature', vars: ['rank'] });
      return corphish_vars(card, [card.ability.extra.mult, card.ability.extra.mult_mod, self.config.evo_rqmt]);
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint && unscored_natures(card, context) > 0) {
        scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });
      }
      if (context.joker_main) return { mult: card.ability.extra.mult };
      return scaling_evo(self, card, context, 'j_poke_crawdaunt', card.ability.extra.mult, self.config.evo_rqmt);
    },
    set_ability(self, card, initial) {
      if (initial) self.set_nature(self, card);
    },
    set_nature(self, card) {
      card.ability.extra.targets = get_poke_target_card_ranks('corphish', 3, card.ability.extra.targets);
    },
  },
  // Crawdaunt 342: +1 Mult per unscored Nature card in the played hand.
  crawdaunt: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push({ set: 'Other', key: 'nature', vars: ['rank'] });
      return corphish_vars(card, [card.ability.extra.mult, card.ability.extra.mult_mod]);
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint) {
        const natures = unscored_natures(card, context);
        if (natures > 0) {
          scale_card(card, {
            ref_value: 'mult', scalar_value: 'mult_mod',
            operation: (ref_table, ref_value, initial, modifier) => { ref_table[ref_value] = initial + (natures * modifier); },
            message_colour: 'MULT',
          });
        }
      }
      if (context.joker_main) return { mult: card.ability.extra.mult };
      return undefined;
    },
    set_ability(self, card, initial) {
      if (initial) self.set_nature(self, card);
    },
    // (3.9.1 rolls Crawdaunt's Nature with Corphish's seed)
    set_nature(self, card) {
      card.ability.extra.targets = get_poke_target_card_ranks('corphish', 3, card.ability.extra.targets);
    },
  },
  // Baltoy 343: +1 Hazard layer; +1-6 Chips per discarded Hazard card; evolves at +40.
  baltoy: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      hazard_tip(info_queue);
      return { main_start: baltoy_start(center), vars: [center.ability.extra.chips, center.ability.extra.hazard_level, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      baltoy_discard(card, context);
      if (context.joker_main) return { chips: card.ability.extra.chips };
      return scaling_evo(self, card, context, 'j_poke_claydol', card.ability.extra.chips, self.config.evo_rqmt);
    },
    ...hazard_layer,
  },
  // Claydol 344: +1 Hazard layer; +1-8 Chips per discarded Hazard card; 1 in 3 for a discarded Hazard card to come back to hand.
  claydol: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      hazard_tip(info_queue);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'claydol');
      return { main_start: baltoy_start(center), vars: [center.ability.extra.chips, center.ability.extra.hazard_level, num, dem] };
    },
    calculate(self, card, context) {
      if (context.pre_discard && !context.blueprint) {
        for (const c of G.hand.highlighted) {
          if (has_enhancement(c, 'm_poke_hazard') && pseudorandom_probability(card, 'claydol', card.ability.extra.num, card.ability.extra.dem, 'claydol')) {
            c.claydoll_discard = true;
          }
        }
      }
      baltoy_discard(card, context);
      // (the stay_flipped context's modify.to_area: the discard draw lands in the hand instead)
      if (context.stay_flipped && context.from_area === G.hand && context.to_area === G.discard && context.other_card.claydoll_discard) {
        context.other_card.claydoll_discard = undefined;
        return { modify: { to_area: G.hand } };
      }
      if (context.joker_main) return { chips: card.ability.extra.chips };
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        for (const v of G.deck.cards) if (v.claydoll_discard) v.claydoll_discard = undefined;
      }
      return undefined;
    },
    ...hazard_layer,
  },
  // Lileep 345: Ancient 8s: 1+ +1 hand size this round; 2+ +$1 sell value to itself and every consumable; 3+ held cards
  // give +10 Chips (5 times to evolve).
  lileep: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      const third_left = Math.max(0, self.config.evo_rqmt - center.ability.extra.third_times);
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.chip_mod, center.ability.extra.money_mod, center.ability.extra.h_size,
        center.ability.extra.money_minus, third_left] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) get_ancient_amount(context.scoring_hand, 8, card);
        if (context.joker_main && card.ability.extra.ancient_count > 0) {
          lileep_main(card, context);
          if (card.ability.extra.ancient_count > 2 && !context.blueprint) card.ability.extra.third_times = card.ability.extra.third_times + 1;
        }
        if (context.after) card.ability.extra.ancient_count = 0;
      }
      const r = lileep_held(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_cradily', card.ability.extra.third_times, self.config.evo_rqmt);
    },
  },
  // Cradily 346: Lileep's 1+ / 2+ ($2) / 3+ (+20 Chips); 4+ earn $ equal to the highest consumable sell value.
  cradily: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.chip_mod, center.ability.extra.money_mod, center.ability.extra.h_size,
        center.ability.extra.money_minus, center.ability.extra.money_minus2] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) get_ancient_amount(context.scoring_hand, 8, card);
        if (context.joker_main && card.ability.extra.ancient_count > 0) {
          lileep_main(card, context);
          if (card.ability.extra.ancient_count > 3) {
            let highest = 0;
            for (const v of G.consumeables.cards) if (v.sell_cost > highest) highest = v.sell_cost;
            if (highest > 0) {
              card.juice_up();
              ease_poke_dollars(card, 'cradily', highest);
            }
          }
        }
        if (context.after) card.ability.extra.ancient_count = 0;
      }
      return lileep_held(card, context);
    },
  },
  // Anorith 347: Ancient 7s: 1+ +7 Mult; 2+ 1 in 4 to add a 7 to the deck; 3+ destroy a deck card above 7 (5 times to evolve).
  anorith: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'anorith');
      const third_left = Math.max(0, self.config.evo_rqmt - center.ability.extra.third_times);
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.mult, num, dem, third_left] };
    },
    calculate(self, card, context) {
      if (context.before) get_ancient_amount(context.scoring_hand, 7, card);
      if (context.joker_main && card.ability.extra.ancient_count > 0) {
        if (card.ability.extra.ancient_count > 2 && G.deck.cards.length > 0) {
          anorith_destroy(card);
          if (!context.blueprint) card.ability.extra.third_times = card.ability.extra.third_times + 1;
        }
        if (card.ability.extra.ancient_count > 1) {
          if (pseudorandom_probability(card, 'anorith', card.ability.extra.num, card.ability.extra.dem, 'anorith')) {
            add_playing_card({ set: 'Base', rank: card.ability.extra.rank, area: G.deck });
          }
        }
        return { mult: card.ability.extra.mult };
      }
      if (context.after) card.ability.extra.ancient_count = 0;
      return scaling_evo(self, card, context, 'j_poke_armaldo', card.ability.extra.third_times, self.config.evo_rqmt);
    },
  },
  // Armaldo 348: Anorith's 1+ (+11) / 2+ (an Enhanced 7) / 3+; 4+ X0.1 Mult per Enhanced 7 in the full deck ("X Scissor!").
  armaldo: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      ancient_tip(info_queue, center.ability.extra.rank);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'armaldo');
      return { vars: [localize(center.ability.extra.rank, 'ranks'), center.ability.extra.mult, num, dem, center.ability.extra.Xmult_multi, armaldo_xmult(center)] };
    },
    calculate(self, card, context) {
      if (context.before) get_ancient_amount(context.scoring_hand, 7, card);
      if (context.joker_main && card.ability.extra.ancient_count > 0) {
        if (card.ability.extra.ancient_count > 2) anorith_destroy(card);
        if (card.ability.extra.ancient_count > 1) {
          if (pseudorandom_probability(card, 'armaldo', card.ability.extra.num, card.ability.extra.dem, 'armaldo')) {
            add_playing_card({ set: 'Enhanced', rank: card.ability.extra.rank, area: G.deck });
          }
        }
        if (card.ability.extra.ancient_count > 3) {
          const total_xmult = armaldo_xmult(card);
          return { message: localize('poke_x_scissor_ex'), mult_mod: card.ability.extra.mult, Xmult_mod: total_xmult, sound: total_xmult > 1 ? 'multhit2' : undefined };
        }
        return { mult: card.ability.extra.mult };
      }
      if (context.after) card.ability.extra.ancient_count = 0;
      return undefined;
    },
  },
  // Kecleon 352: takes the type of the joker to its right; X2 Mult with 3+ jokers of its type.
  kecleon: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ptype = get_type(card) || 'Colorless';
      const text_colour = ptype !== 'Lightning' ? 'WHITE' : 'BLACK';
      return { vars: [card.ability.extra.Xmult, ptype], colours: [ptype.toLowerCase(), text_colour] };
    },
    calculate(self, card, context) {
      if (context.joker_main && find_pokemon_type(get_type(card)).length >= 3) return { Xmult: card.ability.extra.Xmult };
      return undefined;
    },
    update(self, card) { kecleon_update(card); },
  },
  // Shuppet 353: +3 Mult when a Joker is sold during the Blind; evolves at +18.
  shuppet: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, self.config.evo_rqmt] };
    },
    calculate(self, card, context) {
      const r = shuppet_calc(card, context);
      if (r) return r;
      return scaling_evo(self, card, context, 'j_poke_banette', card.ability.extra.mult, self.config.evo_rqmt);
    },
  },
  // Banette 354: +1 Joker slot, -1 hand; +3 Mult when a Joker is sold during the Blind.
  banette: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.card_limit, center.ability.extra.hand_minus] };
    },
    calculate(self, card, context) { return shuppet_calc(card, context); },
    add_to_deck(self, card, from_debuff) {
      G.jokers.config.card_limit = G.jokers.config.card_limit + card.ability.extra.card_limit;
      G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hand_minus;
      if (!from_debuff) ease_hands_played(-card.ability.extra.hand_minus);
    },
    remove_from_deck(self, card) {
      G.jokers.config.card_limit = G.jokers.config.card_limit - card.ability.extra.card_limit;
      G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hand_minus;
      // (3.9.1 pokermon.ease_hands_played: a positive amount is plain ease_hands_played)
      ease_hands_played(card.ability.extra.hand_minus);
    },
  },
  // Tropius 357: a Banana joker at end of round once per ante (must have room); +X0.5 Mult when a Joker is destroyed.
  tropius: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.j_gros_michel);
      info_queue.push(P_CENTERS.j_cavendish);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, (c) => c.ability.extra.active && !G.RESET_JIGGLES, true);
      }
      if (context.joker_main && card.ability.extra.Xmult > 1) return { xmult: card.ability.extra.Xmult };
      if (context.joker_type_destroyed && context.card.config.center.set === 'Joker' && !context.blueprint) {
        if (context.card.config.center.key === 'j_gros_michel') {
          card.ability.extra.cavendish_chance = card.ability.extra.cavendish_chance + card.ability.extra.chance_increase;
        }
        scale_card(card, { ref_value: 'Xmult', scalar_value: 'Xmult_mod', message_colour: 'MULT' });
      }
      if (context.end_of_round && context.main_eval && card.ability.extra.active) {
        card.ability.extra.active = false;
        if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
          G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
          const banana = pseudorandom('tropius');
          const banana_key = banana > card.ability.extra.cavendish_chance ? 'j_gros_michel' : 'j_cavendish';
          G.E_MANAGER.add_event(() => {
            G.GAME.joker_buffer = 0;
            play_sound('timpani');
            add_card({ set: 'Joker', key: banana_key });
          });
        }
      }
      if (context.ante_change && context.ante_end && !context.blueprint) card.ability.extra.active = true;
      return undefined;
    },
  },
  // Chimecho 358: Vouchers in the shop are free (systems/rules.js set_cost); the first 2 Glass cards destroyed each round
  // come back to hand as copies.
  chimecho: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_glass);
      const ex = center.ability.extra;
      return { vars: [ex.glass_limit, ex.glass_limit - ex.glass_restored], colours: [ex.glass_restored >= ex.glass_limit ? 'inactive' : undefined] };
    },
    calculate(self, card, context) {
      if (context.remove_playing_cards && card.ability.extra.glass_restored < card.ability.extra.glass_limit && !context.blueprint) {
        for (const v of context.removed) {
          if ((has_enhancement(v, 'm_glass') || v.glass_trigger) && card.ability.extra.glass_restored < card.ability.extra.glass_limit) {
            const area = context.poke_removed_at_end ? G.deck : G.hand;
            G.E_MANAGER.add_event(() => {
              const copy = copy_card(v, null, null, G.playing_card);
              copy.add_to_deck();
              G.deck.config.card_limit = G.deck.config.card_limit + 1;
              G.playing_cards.push(copy);
              area.emplace(copy);
              copy.start_materialize();
              playing_card_joker_effects([copy]);
            });
            card.ability.extra.glass_restored = card.ability.extra.glass_restored + 1;
          }
        }
        // (the Lua's "Copied!" return waits on a card_to_copy it never sets: no message, ported as is)
      }
      if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
        if (card.ability.extra.glass_restored > 0) {
          card.ability.extra.glass_restored = 0;
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
        }
      }
      return undefined;
    },
    add_to_deck() { reprice(); },
    remove_from_deck() { reprice(); },
  },
}, FILE);
