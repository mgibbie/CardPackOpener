// Pokermon 3.9.1 — pokemon/pokejokers_09.lua (Pokédex 241-269: Miltank -> Dustox), 25 jokers + 5 new in 3.9.1.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req, megas) comes from data.js + data391.js. See ../PORTING.md.
// On Pokermon 3.9.1 behaviour since batch 7 (no holds in this file; see PORTING.md for the parts that wait).
// + the Wurmple line, new in 3.9.1 (new-jokers sub-batch 11): static data from data391.js new_jokers.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element, pseudoshuffle, ease_discard,
  ease_hands_played, ease_ante, create_card, copy_card, juice_card_until, playing_card_joker_effects, delay,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, ease_poke_dollars, find_pokemon_type,
  find_other_poke_or_energy_type, get_probability_vars, pseudorandom_probability, poke_get_rank, poke_total_chips,
  change_base, juice_flip_table, generate_pickup_item_key, get_poke_target_card_ranks, add_target_cards_to_vars,
  is_type, add_card, get_target_card_suit, level_up_hand,
} from '../api.js';

const FILE = 'pokemon/pokejokers_09.lua';

// ------------------------------------------------------------ shared bodies
const a_mult = (m) => localize({ type: 'variable', key: 'a_mult', vars: [m] });
const a_xmult = (x) => localize({ type: 'variable', key: 'a_xmult', vars: [x] });
const nature_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'nature', vars: ['rank'] }); };
/** set_ability(initial): roll the 3 "nature" target ranks. */
const nature_targets = (seed) => function set_ability(self, card, initial) {
  if (initial) card.ability.extra.targets = get_poke_target_card_ranks(seed, 3, card.ability.extra.targets);
};
const is_target = (card, other) => card.ability.extra.targets.some((t) => other.get_id() === t.id);

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
    // 3.9.1 pokermon.ease_hands_played(-hands): the same clamp (+ G.poke_hands_buffer, which nothing here sets).
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};

// Pokermon 3.9.1 (3.7.0 Gen-3 starter rework): every Basic / Stage 1 starter triggers on scored Nature cards and
// evolves after 16 triggers (Blueprint's triggers don't count); no more "other Grass / Fire / Water card" boosts.
const is_scored_nature = (card, context) => context.individual && !context.end_of_round && context.cardarea === G.play
  && !context.other_card.debuff && is_target(card, context.other_card);
const count_trigger = (card, context) => { if (!context.blueprint) card.ability.extra.triggers = card.ability.extra.triggers + 1; };
/** $ paid during scoring: G.GAME.dollar_buffer holds it until the event queue runs (Raichu-style readers see it). */
function buffered_dollars(card, seed, amount) {
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + amount;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return ease_poke_dollars(card, seed, amount, true);
}
const starter_vars = (self, card, mod, extra) => {
  const triggers_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.triggers);
  const card_vars = [mod, triggers_left, ...extra];
  add_target_cards_to_vars(card_vars, card.ability.extra.targets);
  return { vars: card_vars };
};

/** Treecko: $money_mod per scored Nature card. Grovyle: $money_mod or $money_mod + 1 (a coin flip, 'grovyle'). */
function treecko_calc(self, card, context, evo_key, coin) {
  if (is_scored_nature(card, context)) {
    const more = coin ? (pseudorandom('grovyle') < 0.50 ? 0 : 1) : 0;
    // (Lua seeds both with "grovyle".)
    const earned = buffered_dollars(card, 'grovyle', card.ability.extra.money_mod + more);
    count_trigger(card, context);
    return { dollars: earned, card };
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.triggers, self.config.evo_rqmt);
}

/** Torchic / Combusken: +mult_mod Mult per scored Nature card. */
function torchic_calc(self, card, context, evo_key) {
  if (is_scored_nature(card, context)) {
    count_trigger(card, context);
    return { mult: card.ability.extra.mult_mod, card };
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.triggers, self.config.evo_rqmt);
}

/** Mudkip / Marshtomp: +chip_mod Chips per scored Nature card. */
function mudkip_calc(self, card, context, evo_key) {
  if (is_scored_nature(card, context)) {
    count_trigger(card, context);
    return { chips: card.ability.extra.chip_mod, card };
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.triggers, self.config.evo_rqmt);
}

/** Larvitar / Pupitar: scored cards of a Full House gain permanent chips. */
function larvitar_calc(self, card, context, evo_key) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && context.scoring_name === 'Full House' && !context.blueprint) {
      card.ability.extra.full_houses = card.ability.extra.full_houses + 1;
    }
  }
  if (context.individual && context.cardarea === G.play && context.scoring_hand && context.scoring_name === 'Full House') {
    context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
    context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + card.ability.extra.chip_mod;
    return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.full_houses, self.config.evo_rqmt);
}

/** Zigzagoon / Linoone: a Pickup item. */
function pickup_ret(card, seed) {
  G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
  return {
    extra: {
      focus: card, message: localize('poke_plus_pokeitem'), colour: 'pink',
      func() {
        G.E_MANAGER.add_event(() => {
          const _card = create_card('Item', G.consumeables, null, null, null, null, generate_pickup_item_key(seed));
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          G.GAME.consumeable_buffer = 0;
        });
      },
    },
  };
}

/** Poochyena / Mightyena: +mult per destroyed playing card. */
function pooch_calc(card, context, step) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.mult > 0) {
    return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
  }
  if (context.remove_playing_cards && !context.blueprint) {
    for (const _ of context.removed) { // eslint-disable-line no-unused-vars
      card.ability.extra.mult = card.ability.extra.mult + step();
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' });
    }
  }
  return undefined;
}

defineJokers({
  // Miltank 241
  miltank: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.money, center.ability.extra.money * find_pokemon_type('Colorless').length] };
    },
    calc_dollar_bonus(self, card) {
      const earned = card.ability.extra.money * find_pokemon_type('Colorless').length;
      if (earned > 0) return ease_poke_dollars(card, 'miltank', earned, true);
      return undefined;
    },
  },
  // Blissey 242
  blissey: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        info_queue.push(P_CENTERS.m_lucky);
        if (!center.edition || !center.edition.polychrome) info_queue.push(P_CENTERS.e_polychrome);
      }
      return { vars: [center.ability.extra.limit, center.ability.extra.triggers] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card.lucky_trigger && card.ability.extra.triggers < card.ability.extra.limit) {
        G.playing_card = (G.playing_card && G.playing_card + 1) || 1;
        const card_to_copy = context.other_card;
        const pc = G.playing_card;
        G.E_MANAGER.add_event(() => {
          const copy = copy_card(card_to_copy, null, null, pc);
          copy.add_to_deck();
          G.deck.config.card_limit = G.deck.config.card_limit + 1;
          G.playing_cards.push(copy);
          G.hand.emplace(copy);
          copy.start_materialize();
          copy.set_edition({ polychrome: true }, true);
          playing_card_joker_effects([copy]);
        });
        if (!context.blueprint) card.ability.extra.triggers = card.ability.extra.triggers + 1;
        return { message: localize('k_copied_ex'), colour: 'CHIPS', card, playing_cards_created: [true] };
      }
      if (!context.repetition && !context.individual && context.end_of_round) card.ability.extra.triggers = 0;
      return undefined;
    },
  },
  // Raikou 243
  raikou: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.money] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.cardarea === G.jokers && context.scoring_hand && !context.blueprint) {
        if (context.before && context.full_hand.length === 1 && G.GAME.current_round.hands_played === 0 && G.hand && G.hand.cards.length > 0) {
          const rank = poke_get_rank(context.scoring_hand[0]);
          const hand_cards = G.hand.cards.slice();
          const conv_cards = [];
          pseudoshuffle(hand_cards, pseudoseed('raikou'));
          const limit = Math.min(3, hand_cards.length);
          for (let i = 0; i < limit; i++) conv_cards.push(hand_cards[i]);
          juice_flip_table(card, conv_cards, false, limit);
          for (let i = 0; i < limit; i++) G.E_MANAGER.add_event(() => change_base(conv_cards[i], null, rank));
          juice_flip_table(card, conv_cards, true, limit);
          const earned = ease_poke_dollars(card, 'raikou', card.ability.extra.money, true);
          return { dollars: earned, card };
        }
      }
      return undefined;
    },
  },
  // Entei 244
  entei: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod] }; },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.discards_used === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.Xmult > 1) {
        return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      if (context.pre_discard && context.full_hand.length === 4 && G.GAME.current_round.discards_used === 0 && !context.blueprint) {
        const [target] = pseudorandom_element(context.full_hand, pseudoseed('entei'));
        target.entei_destroy = true;
        target.juice_up();
        delay(0.6);
      }
      if (context.discard && context.other_card && context.other_card.entei_destroy && !context.blueprint) {
        card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'XMULT' });
        return { remove: true };
      }
      return undefined;
    },
  },
  // Suicune 245
  suicune: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips_max] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.before) {
        for (const v of context.scoring_hand) {
          v.ability.perma_bonus = v.ability.perma_bonus || 0;
          v.ability.perma_bonus = v.ability.perma_bonus + Math.min(card.ability.extra.chips_max, poke_total_chips(v));
        }
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      return undefined;
    },
  },
  // Larvitar 246
  larvitar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chip_mod, Math.max(0, self.config.evo_rqmt - center.ability.extra.full_houses)] };
    },
    calculate(self, card, context) { return larvitar_calc(self, card, context, 'j_poke_pupitar'); },
  },
  // Pupitar 247
  pupitar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [center.ability.extra.chip_mod, Math.max(0, self.config.evo_rqmt - center.ability.extra.full_houses)] };
    },
    calculate(self, card, context) { return larvitar_calc(self, card, context, 'j_poke_tyranitar'); },
  },
  // Tyranitar 248
  tyranitar: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'mega_poke' });
      return { vars: [center.ability.extra.chip_mod_minus, center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.scoring_hand && context.scoring_name === 'Full House') {
        const oc = context.other_card;
        oc.ability.nominal_drain = oc.ability.nominal_drain || 0;
        let drained_vals = Math.min(card.ability.extra.chip_mod_minus, oc.base.nominal - oc.ability.nominal_drain - 1);
        if (drained_vals > 0) oc.ability.nominal_drain = oc.ability.nominal_drain + drained_vals;
        const drain_bonus = Math.min(oc.ability.bonus + oc.ability.perma_bonus, card.ability.extra.chip_mod_minus - drained_vals);
        if (drain_bonus > 0) {
          oc.ability.perma_bonus = oc.ability.perma_bonus - drain_bonus;
          drained_vals = drained_vals + drain_bonus;
        }
        if (drained_vals > 0) {
          card_eval_status_text(oc, 'extra', null, null, null, { message: localize('k_eroded_ex'), colour: 'CHIPS' });
          // Lua `perma_x_mult or 1`: Steamodded initialises perma_x_mult to 0 on every card, so the
          // fallback never applies there — the first erosion gives X1.1, not X2.1.
          oc.ability.perma_x_mult = oc.ability.perma_x_mult || 0;
          oc.ability.perma_x_mult = oc.ability.perma_x_mult + card.ability.extra.Xmult_multi;
          return { extra: { message: localize('k_upgrade_ex'), colour: 'XMULT' }, colour: 'CHIPS', card };
        }
      }
      return undefined;
    },
  },
  // Mega Tyranitar 248-1
  mega_tyranitar: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
    calculate(self, card, context) {
      // SMODS `context.main_eval` is set for every joker-area evaluation (Micatro: cardarea = G.jokers).
      if (context.before && context.cardarea === G.jokers && context.scoring_hand && context.scoring_name === 'Full House') {
        return { level_up: true, message: localize('k_level_up_ex') };
      }
      if (context.individual && context.cardarea === G.play && context.scoring_hand && context.scoring_name === 'Full House') {
        const level = G.GAME.hands[context.scoring_name].level;
        context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus || 0;
        context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + level;
        return { extra: { message: localize('k_upgrade_ex'), colour: 'CHIPS' }, colour: 'CHIPS', card };
      }
      return undefined;
    },
  },
  // Lugia 249
  lugia: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      return { vars: [ex.Xmult, ex.Xmult_mod, ex.to_draw, ex.to_draw - (ex.drawn % ex.to_draw)] };
    },
    calculate(self, card, context) {
      // SMODS.drawn_cards = the cards of this draw (Micatro passes them as context.hand_drawn).
      if (context.hand_drawn && !context.blueprint) {
        const ex = card.ability.extra;
        ex.drawn = ex.drawn + context.hand_drawn.length;
        if (ex.drawn >= ex.to_draw) {
          ex.Xmult = ex.Xmult + (ex.Xmult_mod * Math.floor(ex.drawn / ex.to_draw));
          ex.drawn = ex.drawn % ex.to_draw;
          return { message: localize('k_upgrade_ex'), colour: 'XMULT' };
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && card.ability.extra.Xmult > 1) {
        return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
  },
  // Ho-oh 250
  ho_oh: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed() && (!center.edition || !center.edition.polychrome)) info_queue.push(P_CENTERS.e_polychrome);
      return { vars: [center.ability.extra.limit, center.ability.extra.limit - center.ability.extra.used] };
    },
    calculate(self, card, context) {
      if (context.using_consumeable && card.ability.extra.used < card.ability.extra.limit && !context.consumeable.config.center.jirachi_item && !context.consumeable.config.center.helditem) {
        if (!context.blueprint) card.ability.extra.used = card.ability.extra.used + 1;
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          const used = context.consumeable;
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            // Pokermon 3.9.1: a used Bird Energy comes back as a Double Rainbow Energy. (Lua tests
            // consumeable.label == "bird_energy"; the intent is the Bird Energy card.)
            const copy = used.config.center.key === 'c_poke_bird_energy'
              ? create_card('Spectral', G.consumeables, null, null, null, null, 'c_poke_double_rainbow_energy')
              : copy_card(used);
            copy.set_edition({ polychrome: true });
            copy.add_to_deck();
            G.consumeables.emplace(copy);
            G.GAME.consumeable_buffer = 0;
          });
          card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
        }
      }
      if (context.setting_blind && !context.blueprint) card.ability.extra.used = 0;
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, (c) => c.ability.extra.used === 0 && !G.RESET_JIGGLES, true);
      }
      return undefined;
    },
  },
  // Celebi 251
  celebi: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const skips = (G.GAME && G.GAME.poke_celebi_skips) || 1;
      const round = (G.GAME && G.GAME.round) || 0;
      return { vars: [skips, card.ability.extra.reward, skips - card.ability.extra.skip_count, card.ability.extra.Xmult_mod, 1 + (round * card.ability.extra.Xmult_mod)] };
    },
    calculate(self, card, context) {
      // Pokermon 3.9.1: -1 Ante every N skips (N grows by 1 each time, run-wide G.GAME.poke_celebi_skips; Blueprint doesn't
      // count skips) and X(1 + rounds played x Xmult_mod) Mult.
      if (context.skip_blind && !context.blueprint) {
        card.juice_up(0.1);
        card.ability.extra.skip_count = card.ability.extra.skip_count + 1;
        if (card.ability.extra.skip_count >= (G.GAME.poke_celebi_skips || 1)) {
          ease_ante(-card.ability.extra.reward);
          G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante || G.GAME.round_resets.ante;
          G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante - card.ability.extra.reward;
          G.GAME.poke_celebi_skips = (G.GAME.poke_celebi_skips || 1) + 1;
          card.ability.extra.skip_count = 0;
        }
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const Xmult = 1 + (G.GAME.round * card.ability.extra.Xmult_mod);
        return { message: a_xmult(Xmult), colour: 'XMULT', Xmult_mod: Xmult };
      }
      return undefined;
    },
  },
  // Treecko 252
  treecko: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return starter_vars(self, card, card.ability.extra.money_mod, [card.ability.extra.h_size]); },
    calculate(self, card, context) { return treecko_calc(self, card, context, 'j_poke_grovyle', false); },
    ...hand_size,
    set_ability: nature_targets('treecko'),
  },
  // Grovyle 253
  grovyle: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card); nature_tip(info_queue);
      return starter_vars(self, card, card.ability.extra.money_mod, [card.ability.extra.h_size, card.ability.extra.money_mod + 1]);
    },
    calculate(self, card, context) { return treecko_calc(self, card, context, 'j_poke_sceptile', true); },
    ...hand_size,
    set_ability: nature_targets('grovyle'),
  },
  // Sceptile 254
  sceptile: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      nature_tip(info_queue);
      const ex = center.ability.extra;
      const card_vars = [ex.money_mod, ex.money_earned, ex.h_size, ex.money_mod + (find_pokemon_type('Grass', center).length * ex.money_increase), ex.money_increase];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      // Pokermon 3.9.1: + money_increase per OTHER Grass Joker (energy cards no longer count).
      if (is_scored_nature(card, context)) {
        const earned = buffered_dollars(card, 'sceptile', card.ability.extra.money_mod + (find_pokemon_type('Grass', card).length * card.ability.extra.money_increase));
        card.ability.extra.money_earned = card.ability.extra.money_earned + earned;
        return { dollars: earned, card };
      }
      return undefined;
    },
    ...hand_size,
    set_ability: nature_targets('sceptile'),
  },
  // Torchic 255
  torchic: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return starter_vars(self, card, card.ability.extra.mult_mod, [card.ability.extra.d_size]); },
    calculate(self, card, context) { return torchic_calc(self, card, context, 'j_poke_combusken'); },
    ...discards,
    set_ability: nature_targets('torchic'),
  },
  // Combusken 256
  combusken: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return starter_vars(self, card, card.ability.extra.mult_mod, [card.ability.extra.d_size]); },
    calculate(self, card, context) { return torchic_calc(self, card, context, 'j_poke_blaziken'); },
    ...discards,
    set_ability: nature_targets('combusken'),
  },
  // Blaziken 257
  blaziken: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      nature_tip(info_queue);
      const ex = center.ability.extra;
      const card_vars = [ex.mult_mod, ex.Xmult_multi, ex.d_size, ex.discard_target, Math.max(0, ex.discard_target - ex.cards_discarded)];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      // Pokermon 3.9.1: scored Nature cards +mult_mod Mult; after discard_target Nature cards discarded this round,
      // each Fire or Fighting Joker gives X Xmult_multi.
      if (is_scored_nature(card, context)) return { mult: card.ability.extra.mult_mod, card };
      if (context.discard && !context.other_card.debuff && !context.blueprint) {
        if (is_target(card, context.other_card)) {
          card.ability.extra.cards_discarded = card.ability.extra.cards_discarded + 1;
          if (card.ability.extra.cards_discarded >= card.ability.extra.discard_target && !card.ability.extra.juiced) {
            card.ability.extra.juiced = true;
            juice_card_until(card, (c) => c.ability.extra.cards_discarded >= c.ability.extra.discard_target && !G.RESET_JIGGLES, true);
          }
        }
      }
      if (context.other_joker && (is_type(context.other_joker, 'Fire') || is_type(context.other_joker, 'Fighting'))
        && card.ability.extra.cards_discarded >= card.ability.extra.discard_target) {
        return { message: a_xmult(card.ability.extra.Xmult_multi), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      if (context.end_of_round && !context.individual && !context.repetition) {
        card.ability.extra.cards_discarded = 0;
        card.juice_up();
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    ...discards,
    set_ability: nature_targets('blaziken'),
  },
  // Mudkip 258
  mudkip: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return starter_vars(self, card, card.ability.extra.chip_mod, [card.ability.extra.hands]); },
    calculate(self, card, context) { return mudkip_calc(self, card, context, 'j_poke_marshtomp'); },
    ...hands,
    set_ability: nature_targets('mudkip'),
  },
  // Marshtomp 259
  marshtomp: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return starter_vars(self, card, card.ability.extra.chip_mod, [card.ability.extra.hands]); },
    calculate(self, card, context) { return mudkip_calc(self, card, context, 'j_poke_swampert'); },
    ...hands,
    set_ability: nature_targets('marshtomp'),
  },
  // Swampert 260
  swampert: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      nature_tip(info_queue);
      const ex = center.ability.extra;
      const card_vars = [ex.chip_mod, ex.hands, ex.nature_target];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (is_scored_nature(card, context)) return { chips: card.ability.extra.chip_mod, card };
      // Pokermon 3.9.1: a hand with 5 scoring Nature cards creates a Tarot per 2 Water / Earth Jokers (itself included).
      if (context.joker_main) {
        let nature_count = 0;
        for (const c of context.scoring_hand) if (is_target(card, c)) nature_count = nature_count + 1;
        // (Lua compares with a literal 5, not nature_target.)
        if (nature_count >= 5) {
          const create_number = Math.floor((find_pokemon_type('Water').length + find_pokemon_type('Earth').length) / 2);
          if (create_number > 0) {
            return {
              extra: {
                focus: card, message: localize('k_plus_tarot'), colour: 'PURPLE',
                func() {
                  for (let i = 0; i < create_number; i++) {
                    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
                      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
                      G.E_MANAGER.add_event(() => {
                        add_card({ set: 'Tarot' });
                        G.GAME.consumeable_buffer = 0;
                      });
                    }
                  }
                },
              },
            };
          }
        }
      }
      return undefined;
    },
    ...hands,
    set_ability: nature_targets('swampert'),
  },
  // Poochyena 261
  poochyena: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      return pooch_calc(card, context, () => card.ability.extra.mult_mod) || level_evo(self, card, context, 'j_poke_mightyena');
    },
  },
  // Mightyena 262
  mightyena: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.mult, center.ability.extra.mult_mod, center.ability.extra.mult_scaling_mod] }; },
    calculate(self, card, context) {
      return pooch_calc(card, context, () => card.ability.extra.mult_mod + (card.ability.extra.mult_scaling_mod * find_pokemon_type('Dark').length));
    },
  },
  // Zigzagoon 263
  zigzagoon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'pickup' });
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'zigzagoon');
      return { vars: [num, dem, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        if (pseudorandom_probability(card, 'zigzagoon', card.ability.extra.num, card.ability.extra.dem, 'zigzagoon')) return pickup_ret(card, 'zigzag');
      }
      return level_evo(self, card, context, 'j_poke_linoone');
    },
  },
  // Linoone 264
  linoone: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'pickup' });
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'linoone');
      return { vars: [num, dem, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
        if (context.poker_hands.Straight.length || pseudorandom_probability(card, 'linoone', card.ability.extra.num, card.ability.extra.dem, 'linoone')) return pickup_ret(card, 'linoone');
      }
      return undefined;
    },
  },
}, FILE);
// ---------------------------------------------------- the Wurmple line (3.9.1: new-jokers sub-batch 11)
// Their Nature is a SUIT (pokermon.get_target_card_suit: a random deck card's suit among the allowed ones, set on
// creation; `targets` is carried through evolution). Wurmple evolves into Silcoon (Hearts / Diamonds) or Cascoon
// (Spades / Clubs) after scoring 5 Nature cards; Silcoon / Cascoon after 15.
const suit_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'nature', vars: ['suit'] }); };
const nature_suit = (seed, _default, suits) => function set_ability(self, card, initial) {
  if (initial) card.ability.extra.targets = get_target_card_suit(seed, true, _default, suits);
};
const target_suit = (card) => card.ability.extra.targets[0].suit;
/** individual + G.play: a scored card of the Nature suit (3.9.1 checks neither debuff nor, past Wurmple, Blueprint). */
const counts_nature = (card, context) => context.individual && !context.end_of_round && context.cardarea === G.play
  && context.other_card.is_suit(target_suit(card));
const a_chips = (c) => localize({ type: 'variable', key: 'a_chips', vars: [c] });

defineJokers({
  // Wurmple 265: +Mult or +Chips (a coin flip each hand).
  wurmple: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      suit_tip(info_queue);
      const ex = center.ability.extra;
      const unknown = ex.nature_scored <= 0;
      const suit_colours = unknown ? ['UI.TEXT_INACTIVE'] : [ex.targets[0].suit || 'Spades'];
      const suits_message = unknown ? '??? ' + localize('poke_suit') : localize(ex.targets[0].suit, 'suits_plural');
      return { vars: [ex.mult, ex.chips, Math.max(0, self.config.evo_rqmt - ex.nature_scored), suits_message], colours: suit_colours };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        if (pseudorandom('wurmple') < 0.50) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      if (counts_nature(card, context) && !context.blueprint) card.ability.extra.nature_scored = card.ability.extra.nature_scored + 1;
      const suit = target_suit(card);
      if (suit === 'Hearts' || suit === 'Diamonds') return scaling_evo(self, card, context, 'j_poke_silcoon', card.ability.extra.nature_scored, self.config.evo_rqmt);
      if (suit === 'Spades' || suit === 'Clubs') return scaling_evo(self, card, context, 'j_poke_cascoon', card.ability.extra.nature_scored, self.config.evo_rqmt);
      return undefined;
    },
    set_ability: nature_suit('wurmple', 'Spades', ['Spades', 'Hearts', 'Diamonds', 'Clubs']),
  },
  // Silcoon 266
  silcoon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      suit_tip(info_queue);
      const ex = center.ability.extra;
      return { vars: [ex.mult, localize(ex.targets[0].suit, 'suits_plural'), Math.max(0, self.config.evo_rqmt - ex.nature_scored)], colours: [ex.targets[0].suit || 'Hearts'] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      // (3.9.1 has no `not context.blueprint` here: a Blueprint copy counts too. Ported as is.)
      if (counts_nature(card, context)) card.ability.extra.nature_scored = card.ability.extra.nature_scored + 1;
      return scaling_evo(self, card, context, 'j_poke_beautifly', card.ability.extra.nature_scored, self.config.evo_rqmt);
    },
    set_ability: nature_suit('silcoon', 'Hearts', ['Hearts', 'Diamonds']),
  },
  // Beautifly 267: a scoring Nature card -> 1 in 3 to level up Flush (before scoring).
  beautifly: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      suit_tip(info_queue);
      const ex = center.ability.extra;
      const [num, dem] = get_probability_vars(center, ex.num, ex.dem, 'beautifly');
      return { vars: [ex.mult, localize(ex.targets[0].suit, 'suits_plural'), num, dem], colours: [ex.targets[0].suit || 'Hearts'] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before) {
          let has_nature = false;
          for (const v of context.scoring_hand) if (v.is_suit(target_suit(card))) has_nature = true;
          if (has_nature && pseudorandom_probability(card, 'beautifly', card.ability.extra.num, card.ability.extra.dem, 'beautifly')) {
            // SMODS.upgrade_poker_hands({hands = {'Flush'}, from = context.blueprint_card or card, instant = instant})
            const instant = context.scoring_name !== 'Flush';
            level_up_hand(context.blueprint_card || card, 'Flush', instant);
            if (instant) return { message: localize('k_upgrade_ex') };
          }
        }
        if (context.joker_main) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
      }
      return undefined;
    },
    set_ability: nature_suit('beautifly', 'Hearts', ['Hearts', 'Diamonds']),
  },
  // Cascoon 268
  cascoon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      suit_tip(info_queue);
      const ex = center.ability.extra;
      return { vars: [ex.chips, localize(ex.targets[0].suit, 'suits_plural'), Math.max(0, self.config.evo_rqmt - ex.nature_scored)], colours: [ex.targets[0].suit || 'Spades'] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
      }
      // (as Silcoon: a Blueprint copy counts too)
      if (counts_nature(card, context)) card.ability.extra.nature_scored = card.ability.extra.nature_scored + 1;
      return scaling_evo(self, card, context, 'j_poke_dustox', card.ability.extra.nature_scored, self.config.evo_rqmt);
    },
    set_ability: nature_suit('cascoon', 'Spades', ['Spades', 'Clubs']),
  },
  // Dustox 269: +Chips; X3 Mult too if every card held in hand is of the Nature suit.
  dustox: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      suit_tip(info_queue);
      const ex = center.ability.extra;
      return { vars: [ex.chips, localize(ex.targets[0].suit, 'suits_plural'), ex.Xmult], colours: [ex.targets[0].suit || 'Spades'] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        let all_nature = true;
        for (const v of G.hand.cards) if (!v.is_suit(target_suit(card))) all_nature = false;
        if (all_nature) return { message: localize('poke_bug_buzz_ex'), chip_mod: card.ability.extra.chips, Xmult_mod: card.ability.extra.Xmult, sound: 'multhit2' };
        return { chips: card.ability.extra.chips };
      }
      return undefined;
    },
    set_ability: nature_suit('dustox', 'Spades', ['Spades', 'Clubs']),
  },
}, FILE);
