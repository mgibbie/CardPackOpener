// Pokermon 3.9.1 — pokemon/pokejokers_10.lua (Pokédex 271-300: Seedot -> Skitty), 4 jokers + 21 new in 3.9.1.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// The 21 jokers 3.9.1 added to this file are at the end (new-jokers sub-batch 11; static data: data391.js new_jokers).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, ease_discard, ease_hands_played, create_card,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, faint_baby_poke,
  pseudoseed, pseudorandom_element, math_random, play_sound, copy_card, has_enhancement, scale_card, change_base,
  ease_poke_dollars, find_pokemon_type, is_type, get_total_energy, get_consumeables, get_probability_vars,
  pseudorandom_probability, add_card, create_consumeable, destroy_joker, poke_evolve, poke_change_growth_level,
} from '../api.js';
import { blueprint_effect } from './pokejokers_08.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { activeConsumableTypes } from '../../../js/mods/registry.js';

const FILE = 'pokemon/pokejokers_10.lua';

/** Shroomish / Breloom: a random +hands / +discards / +hand size when the blind is selected. */
function shroom_blind(card, context) {
  if (context.setting_blind) {
    const bonus = pseudorandom('shroomish');
    const message_card = context.blueprint_card || card;
    if (bonus > 0.66) {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_hands', vars: [card.ability.extra.hands] }), colour: 'CHIPS' });
      ease_hands_played(card.ability.extra.hands);
    } else if (bonus > 0.33) {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'poke_discards', vars: [card.ability.extra.d_size] }), colour: 'MULT' });
      ease_discard(card.ability.extra.d_size);
    } else {
      card_eval_status_text(message_card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_handsize', vars: [card.ability.extra.h_size] }) });
      G.hand.change_size(card.ability.extra.h_size);
      G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + card.ability.extra.h_size;
    }
    card.juice_up();
  }
}

defineJokers({
  // Shroomish 285
  shroomish: {
    knockoff_starter: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.d_size, center.ability.extra.h_size, Math.max(0, self.config.evo_rqmt - center.ability.extra.boss_defeated)] };
    },
    calculate(self, card, context) {
      shroom_blind(card, context);
      if (context.end_of_round && !context.individual && !context.repetition && G.GAME.blind.boss) {
        card.ability.extra.boss_defeated = card.ability.extra.boss_defeated + 1;
      }
      return scaling_evo(self, card, context, 'j_poke_breloom', card.ability.extra.boss_defeated, self.config.evo_rqmt);
    },
  },
  // Breloom 286
  breloom: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.d_size, center.ability.extra.h_size] };
    },
    calculate(self, card, context) {
      shroom_blind(card, context);
      return undefined;
    },
  },
  // Azurill 298
  azurill: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'baby' });
        info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
        info_queue.push(P_CENTERS.c_heirophant);
      }
      return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          faint_baby_poke(self, card, context);
          return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_minus] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
        }
      }
      if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_heirophant');
        _card.set_edition({ negative: true }, true);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      return level_evo(self, card, context, 'j_poke_marill');
    },
  },
  // Nosepass 299
  nosepass: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play) {
        if (context.other_card === card.ability.extra.first) {
          return { x_mult: card.ability.extra.Xmult_multi, colour: 'XMULT', card };
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) {
          if (!card.ability.extra.first) {
            for (let i = 0; i < context.scoring_hand.length; i++) {
              if (context.scoring_hand[i].is_face()) {
                context.scoring_hand[i].set_ability(P_CENTERS.m_stone, null, true);
                card.ability.extra.first = context.scoring_hand[i];
                break;
              }
            }
          }
        }
        if (context.after) card.ability.extra.first = undefined;
      }
      return item_evo(self, card, context, 'j_poke_probopass');
    },
  },
}, FILE);
// ------------------------------------------- new in Pokermon 3.9.1 (new-jokers sub-batch 11): 21 jokers
// Seedot / Nuzleaf / Shiftry, Taillow / Swellow, Wingull / Pelipper, Ralts / Kirlia / Gardevoir, Surskit / Masquerain,
// Slakoth / Vigoroth / Slaking, Nincada / Ninjask / Shedinja, Makuhita / Hariyama, Skitty. Static data: data391.js
// new_jokers. Deferred (data391.js new_deferred): Kirlia -> Gallade (Dawn Stone, sub-batch 14) and Skitty -> Delcatty
// (Moon Stone, sub-batch 12): until those jokers exist, Kirlia / Skitty have no item_req and their item_evo is inert
// (can_evolve needs the target center), so the calls below need no change when they land.

/** Seedot line: a scored, undebuffed Seed card gives +chips. */
function seed_chips(card, context) {
  if (context.individual && context.cardarea === G.play && has_enhancement(context.other_card, 'm_poke_seed')) {
    if (!context.end_of_round && !context.before && !context.after && !context.other_card.debuff) return { chips: card.ability.extra.chips };
  }
  return undefined;
}
/** Nuzleaf / Shiftry: drawn Flower cards become Seed cards (level 0). */
function flowers_to_seeds(context) {
  if (context.hand_drawn && !context.blueprint) {
    for (const fscard of context.hand_drawn) {
      if (has_enhancement(fscard, 'm_poke_flower')) {
        fscard.set_ability(P_CENTERS.m_poke_seed, null, true);
        fscard.ability.extra.level = 0;
      }
    }
  }
}
/** Taillow / Swellow: +mult_mod Mult per Ace drawn during the Blind (SMODS.scale_card); Mult resets at end of round. */
function ace_draws(card, context, evo) {
  if (context.joker_main) {
    // (SMODS.calculate_individual_effect skips a 0 amount: no "+0" before the first Ace)
    if (card.ability.extra.mult !== 0) return { mult: card.ability.extra.mult };
    return undefined;
  }
  if (context.hand_drawn && !context.blueprint) {
    for (const c of context.hand_drawn) {
      if (c.get_id() === 14) scale_card(card, { ref_value: 'mult', scalar_value: 'mult_mod', message_colour: 'MULT' });
    }
  }
  if (context.end_of_round && !context.individual && !context.repetition && !context.blueprint) {
    card.ability.extra.mult = 0;
    // (Taillow: the Lua returns the "Reset" here; its level count runs in 3.9.1's later `evolution` context. Ours counts at
    // end of round — the batch-6 timing deviation — so the message is shown here and the count still runs, as Zorua.)
    if (evo) { card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset'), colour: 'CHIPS' }); return evo(); }
    return { message: localize('k_reset'), colour: 'CHIPS' };
  }
  return evo ? evo() : undefined;
}
const wingull_rank = () => localize((G.GAME.current_round.wingullcard && G.GAME.current_round.wingullcard.rank) || 'Ace', 'ranks');
/** Wingull / Pelipper: $ for each discarded card of the round's rank (G.GAME.current_round.wingullcard); dollar_buffer. */
function wingull_discard(card, context, extra) {
  if (context.discard && !context.other_card.debuff && context.other_card.get_id() === G.GAME.current_round.wingullcard.id) {
    const earned = ease_poke_dollars(card, 'wingull', card.ability.extra.money_mod, true) + extra();
    G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + earned;
    return { dollars: earned, func() { G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; }); } };
  }
  return undefined;
}
/** Ralts line: Energized jokers (+ held Planet cards for Ralts / Kirlia). */
function energized_jokers() {
  let energized = 0;
  if (G.jokers) for (const v of G.jokers.cards) if (get_total_energy(v) > 0) energized = energized + 1;
  return energized;
}
const ralts_total = (card) => card.ability.extra.mult_mod * (energized_jokers() + get_consumeables('Planet').length);
/** Gardevoir: X(1 + Xmult_mod x (Energized jokers + hands at level hand_level+)). */
function gardevoir_total(card) {
  let hands = 0;
  for (const v of Object.values(G.GAME.hands)) if (v.level >= card.ability.extra.hand_level) hands = hands + 1;
  return 1 + (card.ability.extra.Xmult_mod * (hands + energized_jokers()));
}
/** SMODS.ConsumableTypes (vanilla Tarot / Planet / Spectral + the active mods' types), by key (as pokejokers_16.js Rotom). */
function consumable_types() {
  const out = { Tarot: { key: 'Tarot' }, Planet: { key: 'Planet' }, Spectral: { key: 'Spectral' } };
  for (const t of activeConsumableTypes()) out[t.key] = t;
  return out;
}
const skitty_type = () => G.GAME.current_round.cattype || 'Grass';

defineJokers({
  // Seedot 273
  seedot: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      return { vars: [center.ability.extra.chips, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      return seed_chips(card, context) || level_evo(self, card, context, 'j_poke_nuzleaf');
    },
  },
  // Nuzleaf 274
  nuzleaf: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      return { vars: [center.ability.extra.chips] };
    },
    calculate(self, card, context) {
      flowers_to_seeds(context);
      return seed_chips(card, context) || item_evo(self, card, context, 'j_poke_shiftry');
    },
  },
  // Shiftry 275: +1 growth level while owned.
  shiftry: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push(P_CENTERS.m_poke_seed);
      info_queue.push({ set: 'Other', key: 'growth_level' });
      return { vars: [center.ability.extra.chips, center.ability.extra.growth] };
    },
    calculate(self, card, context) {
      flowers_to_seeds(context);
      return seed_chips(card, context);
    },
    add_to_deck(self, card, from_debuff) { poke_change_growth_level(card.ability.extra.growth); },
    remove_from_deck(self, card, from_debuff) { poke_change_growth_level(-card.ability.extra.growth); },
  },
  // Taillow 276
  taillow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      return ace_draws(card, context, () => level_evo(self, card, context, 'j_poke_swellow'));
    },
  },
  // Swellow 277: when a Boss Blind is selected, the top 2 deck cards become Aces (as the first hand is drawn).
  swellow: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && context.blind.boss) card.ability.extra.active = true;
      if (context.drawing_cards && !context.blueprint && card.ability.extra.active) {
        for (let i = 1; i <= 2; i++) {
          const top = G.deck.cards[G.deck.cards.length - i];
          if (top) change_base(top, null, 'Ace');
        }
        card.ability.extra.active = undefined;
      }
      return ace_draws(card, context);
    },
  },
  // Wingull 278
  wingull: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money_mod, center.ability.extra.rounds, wingull_rank()] };
    },
    calculate(self, card, context) {
      return wingull_discard(card, context, () => 0) || level_evo(self, card, context, 'j_poke_pelipper');
    },
  },
  // Pelipper 279: + $1 more per Water joker.
  pelipper: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money_mod, center.ability.extra.water_money, wingull_rank()] };
    },
    calculate(self, card, context) {
      // (3.9.1 adds the Water joker COUNT, not water_money x count: water_money is 1, so the same. Its level_evo into
      // itself is inert: Pelipper has no `rounds`.)
      return wingull_discard(card, context, () => find_pokemon_type('Water').length) || level_evo(self, card, context, 'j_poke_pelipper');
    },
  },
  // Ralts 280
  ralts: {
    knockoff_pseudol: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, center.ability.extra.rounds, ralts_total(center)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const total = ralts_total(card);
        // (SMODS skips a 0 amount)
        if (total !== 0) return { mult: total };
        return undefined;
      }
      return level_evo(self, card, context, 'j_poke_kirlia');
    },
  },
  // Kirlia 281: evolves into Gardevoir after 15 Planet cards used (into Gallade with a Dawn Stone: deferred, above).
  kirlia: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult_mod, ralts_total(center), Math.max(0, self.config.evo_rqmt - center.ability.extra.planets_used)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        const total = ralts_total(card);
        if (total !== 0) return { mult: total };
        return undefined;
      }
      if (context.using_consumeable && context.consumeable.ability.set === 'Planet' && !context.blueprint) {
        card.ability.extra.planets_used = card.ability.extra.planets_used + 1;
      }
      const evo = item_evo(self, card, context, 'j_poke_gallade');
      if (!evo) return scaling_evo(self, card, context, 'j_poke_gardevoir', card.ability.extra.planets_used, self.config.evo_rqmt);
      return undefined;
    },
  },
  // Gardevoir 282: comes holding a Black Hole.
  gardevoir: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.c_black_hole);
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Black Hole'] });
      }
      return { vars: [center.ability.extra.Xmult_mod, gardevoir_total(center), center.ability.extra.hand_level] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { Xmult: gardevoir_total(card) };
      return undefined;
    },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) create_consumeable('c_black_hole');
    },
  },
  // Surskit 283: Straights may hold duplicate ranks (systems/rules.js straight_min); evolves after 8 Straights.
  surskit: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [Math.max(0, self.config.evo_rqmt - center.ability.extra.straights_played)] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        if (context.scoring_hand && context.scoring_name === 'Straight' && !context.blueprint) {
          card.ability.extra.straights_played = card.ability.extra.straights_played + 1;
        }
      }
      return scaling_evo(self, card, context, 'j_poke_masquerain', card.ability.extra.straights_played, self.config.evo_rqmt);
    },
  },
  // Masquerain 284: +4 Foresight; duplicate-rank Straights (rules.js).
  masquerain: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'scry_cards' });
      return { vars: [center.ability.extra.scry, center.ability.extra.money] };
    },
    // (3.9.1 G.GAME.poke_scry_amount; ours keeps scry_amount, as batch 6)
    add_to_deck(self, card, from_debuff) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
    remove_from_deck(self, card, from_debuff) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
  },
  // Slakoth 287: +Mult, -1 hand when a hand is played.
  slakoth: {
    knockoff_pseudol: true,
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds, center.ability.extra.hands, center.ability.extra.money] };
    },
    calculate(self, card, context) {
      if (context.before) ease_hands_played(-card.ability.extra.hands);
      if (context.joker_main) return { mult: card.ability.extra.mult };
      return level_evo(self, card, context, 'j_poke_vigoroth');
    },
  },
  // Vigoroth 288: X(1 + 0.5 per hand left); its round countdown only runs in rounds without a discard.
  vigoroth: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const hands_left = (G.GAME.current_round && G.GAME.current_round.hands_left) || 0;
      return { vars: [center.ability.extra.Xmult_mod, 1 + Math.max(0, center.ability.extra.Xmult_mod * hands_left), center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { Xmult: 1 + (card.ability.extra.Xmult_mod * G.GAME.current_round.hands_left) };
      if (G.GAME.current_round.discards_used <= 0) return level_evo(self, card, context, 'j_poke_slaking');
      return undefined;
    },
  },
  // Slaking 289: X4, -1 hand when a hand is played.
  slaking: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.hands] };
    },
    calculate(self, card, context) {
      if (context.before) ease_hands_played(-card.ability.extra.hands);
      if (context.joker_main) return { Xmult: card.ability.extra.Xmult };
      return undefined;
    },
  },
  // Nincada 290: a hand with a 9 or Jack: -5 Chips and 1 in 2 for a random consumable. At 0 Chips it evolves into
  // Ninjask AND (with a free joker slot) a copy of it becomes Shedinja (Multi Evolution).
  nincada: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'multi_evolution' });
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'nincada');
      return { vars: [center.ability.extra.chips, center.ability.extra.chips_minus, num, dem] };
    },
    calculate(self, card, context) {
      if (context.before) {
        let has_nine_or_jack = false;
        for (const v of context.scoring_hand) if (v.get_id() === 9 || v.get_id() === 11) { has_nine_or_jack = true; break; }
        if (has_nine_or_jack) {
          if (!context.blueprint && card.ability.extra.chips > 0) {
            scale_card(card, {
              ref_value: 'chips', scalar_value: 'chips_minus',
              operation: (ref_table, ref_value, initial, modifier) => { ref_table[ref_value] = Math.max(0, initial - modifier); },
              message_key: 'a_chips_minus', message_colour: 'CHIPS',
            });
          }
          if (pseudorandom_probability(card, 'nincada', card.ability.extra.num, card.ability.extra.dem, 'nincada')
            && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            const set = pseudorandom_element(consumable_types(), pseudoseed('adacnin'))[0];
            add_card({ set: set.key });
          }
        }
      }
      if (context.joker_main) return { chips: card.ability.extra.chips };
      const evo = scaling_evo(self, card, context, 'j_poke_ninjask', card.ability.extra.chips <= 0 ? 1 : 0, 1);
      if (evo && typeof evo === 'object') {
        // Multi Evolution: the evolution swap is queued first, so the copy is of the Ninjask; it then becomes Shedinja at
        // once (pokermon.evolve(copy, 'j_poke_shedinja', true)).
        if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
          G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
          G.E_MANAGER.add_event(() => {
            const copy = copy_card(card);
            copy.add_to_deck();
            G.jokers.emplace(copy);
            poke_evolve(copy, 'j_poke_shedinja', true);
            G.GAME.joker_buffer = 0;
          });
        }
      }
      return evo;
    },
  },
  // Ninjask 291: 1 in 2 for a Speed Tag (tag_skip) at Blind select; each 9 / Jack of the first hand +13 Mult.
  ninjask: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ key: 'tag_skip', set: 'Tag', specific_vars: [5, 5 * (G.GAME.skips || 0)] });
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'ninjask');
      return { vars: [center.ability.extra.mult_mod, num, dem] };
    },
    calculate(self, card, context) {
      if (context.setting_blind && pseudorandom_probability(card, 'ninjask', card.ability.extra.num, card.ability.extra.dem, 'ninjask')) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_skip'));
          play_sound('generic1', 0.9 + math_random() * 0.1, 0.8);
          play_sound('holo1', 1.2 + math_random() * 0.1, 0.4);
        });
      }
      if (context.individual && !context.end_of_round && context.cardarea === G.play && G.GAME.current_round.hands_played === 0) {
        if (context.other_card.get_id() === 9 || context.other_card.get_id() === 11) {
          // 3.9.1 passes card.ability.extra.money_mod, which Ninjask's config doesn't have: `earned` is nil and no $ is
          // paid (the text names none). Ported as is; a NaN (an energized money fraction on top of nil) pays nothing either.
          const earned = ease_poke_dollars(card, 'ninjask', card.ability.extra.money_mod, true);
          const ret = { mult: card.ability.extra.mult_mod, card };
          if (typeof earned === 'number' && !Number.isNaN(earned)) ret.dollars = earned;
          return ret;
        }
      }
      return undefined;
    },
  },
  // Shedinja 292: prevents death on non-Boss Blinds (+X0.5 each time); self-destructs at end of shop beside a Fire,
  // Earth, Dark or Psychic joker (other Shedinjas excluded).
  shedinja: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] };
    },
    calculate(self, card, context) {
      if ((context.end_of_round && !G.GAME.blind.boss) && context.game_over && G.GAME.current_round.hands_left <= 0 && !context.blueprint) {
        G.E_MANAGER.add_event(() => { play_sound('tarot1'); });
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        // (3.9.1's "Saved by Shedinja" string: the engine's G.GAME.saved_by line, as Mimikyu)
        return { message: localize('k_saved_ex'), saved: true, colour: 'RED' };
      }
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && card.ability.extra.Xmult > 1) return { Xmult: card.ability.extra.Xmult };
      }
      if (context.ending_shop && !context.blueprint) {
        const fire_count = find_pokemon_type('Fire', null, 'shedinja').length;
        const earth_count = find_pokemon_type('Earth', null, 'shedinja').length;
        const dark_count = find_pokemon_type('Dark', null, 'shedinja').length;
        const psychic_count = find_pokemon_type('Psychic', null, 'shedinja').length;
        if (fire_count > 0 || earth_count > 0 || dark_count > 0 || psychic_count > 0) {
          G.E_MANAGER.add_event(() => { destroy_joker(card); });
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_screech_ex') });
        }
      }
      return undefined;
    },
  },
  // Makuhita 296: +1 hand at Blind select.
  makuhita: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        ease_hands_played(card.ability.extra.hands);
        card.juice_up();
      }
      return level_evo(self, card, context, 'j_poke_hariyama');
    },
  },
  // Hariyama 297: +1 hand per Fighting joker at Blind select.
  hariyama: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.hands] };
    },
    calculate(self, card, context) {
      if (context.setting_blind) {
        ease_hands_played(card.ability.extra.hands * find_pokemon_type('Fighting').length);
        card.juice_up();
      }
      return undefined;
    },
  },
  // Skitty 300: Blueprint of the joker to its right if that joker is of the round's type (G.GAME.current_round.cattype,
  // reset each round from the jokers' types: systems/rules.js reset_type). (Moon Stone -> Delcatty: deferred, above.)
  skitty: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const cattype = skitty_type();
      const highlight_colour = cattype !== 'Lightning' ? 'WHITE' : 'BLACK';
      return { vars: [cattype], colours: [cattype.toLowerCase(), highlight_colour] };
    },
    calculate(self, card, context) {
      const evo = item_evo(self, card, context, 'j_poke_delcatty');
      if (evo) return evo;
      const found_pos = G.jokers.cards.indexOf(card);
      if (found_pos >= 0) {
        const other_joker = G.jokers.cards[found_pos + 1];
        if (other_joker && is_type(other_joker, skitty_type())) {
          const ret = blueprint_effect(card, other_joker, context);
          if (ret) ret.colour = 'BLUE';
          return ret;
        }
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
}, FILE);
