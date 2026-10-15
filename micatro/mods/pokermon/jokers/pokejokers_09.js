// Pokermon 3.2.1 — pokemon/pokejokers_09.lua (Pokédex 241-264: Miltank -> Linoone), 25 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen, item_req, megas) comes from data.js. See ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudoseed, pseudorandom_element, pseudoshuffle, ease_discard,
  ease_hands_played, ease_ante, create_card, copy_card, juice_card_until, playing_card_joker_effects, delay,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, ease_poke_dollars, find_pokemon_type,
  find_other_poke_or_energy_type, get_probability_vars, pseudorandom_probability, poke_get_rank, poke_total_chips,
  change_base, juice_flip_table, generate_pickup_item_key, get_poke_target_card_ranks, add_target_cards_to_vars,
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
    const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
    if (to_decrease > 0) ease_hands_played(-to_decrease);
  },
};

/** Treecko / Grovyle: $ per scored target rank (a coin flip, or always with another Grass). */
function treecko_calc(self, card, context, prob_seed, key, evo_key) {
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
    let earn = false;
    if (find_other_poke_or_energy_type(card, 'Grass') > 0) earn = true;
    if (pseudorandom_probability(card, prob_seed, card.ability.extra.num, card.ability.extra.dem, key) || earn) {
      for (const t of card.ability.extra.targets) {
        if (context.other_card.get_id() === t.id) {
          const earned = ease_poke_dollars(card, 'grovyle', card.ability.extra.money_mod, true);
          if (!context.blueprint) card.ability.extra.money_earned = card.ability.extra.money_earned + earned;
          return { dollars: earned, card };
        }
      }
    }
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.money_earned, self.config.evo_rqmt);
}
function treecko_vars(self, card, key) {
  const money_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.money_earned);
  const [num, dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.dem, key);
  const card_vars = [card.ability.extra.money_mod, money_left, card.ability.extra.h_size, num, dem];
  add_target_cards_to_vars(card_vars, card.ability.extra.targets);
  return { vars: card_vars };
}

/** Torchic / Combusken: +mult per discarded target rank this round (x2 with Fire/Fighting). */
function torchic_calc(self, card, context, evo_key, msg_plus) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    const mult = card.ability.extra.mult * card.ability.extra.cards_discarded;
    card.ability.extra.mult_earned = card.ability.extra.mult_earned + mult;
    return { message: a_mult(mult), colour: 'MULT', mult_mod: mult };
  }
  if (context.discard && !context.other_card.debuff && !context.blueprint) {
    if (is_target(card, context.other_card)) {
      let discard_plus = 1;
      if (find_other_poke_or_energy_type(card, 'Fire') > 0 || find_other_poke_or_energy_type(card, 'Fighting') > 0) discard_plus = 2;
      card.ability.extra.cards_discarded = card.ability.extra.cards_discarded + discard_plus;
      return { message: a_mult(msg_plus ? discard_plus : card.ability.extra.mult), colour: 'RED', delay: 0.45, card };
    }
  }
  if (context.end_of_round && !context.individual && !context.repetition) {
    card.ability.extra.cards_discarded = 0;
    card.juice_up();
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.mult_earned, self.config.evo_rqmt);
}
function torchic_vars(self, card) {
  const mult_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.mult_earned);
  const card_vars = [card.ability.extra.mult, mult_left, card.ability.extra.d_size, card.ability.extra.mult * card.ability.extra.cards_discarded];
  add_target_cards_to_vars(card_vars, card.ability.extra.targets);
  return { vars: card_vars };
}
const blaze_count = (card) => find_other_poke_or_energy_type(card, 'Fire', true) + find_other_poke_or_energy_type(card, 'Fighting', true);

/** Mudkip / Marshtomp: +chips per scored target rank (x2 with Water/Earth). */
function mudkip_calc(self, card, context, evo_key) {
  if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
    let chips = card.ability.extra.chips;
    if (find_other_poke_or_energy_type(card, 'Water') > 0 || find_other_poke_or_energy_type(card, 'Earth') > 0) chips = chips * 2;
    if (is_target(card, context.other_card)) {
      card.ability.extra.chips_earned = card.ability.extra.chips_earned + chips;
      return { chips, card };
    }
  }
  return scaling_evo(self, card, context, evo_key, card.ability.extra.chips_earned, self.config.evo_rqmt);
}
function mudkip_vars(self, card) {
  const chips_left = Math.max(0, self.config.evo_rqmt - card.ability.extra.chips_earned);
  const card_vars = [card.ability.extra.chips, chips_left, card.ability.extra.hands];
  add_target_cards_to_vars(card_vars, card.ability.extra.targets);
  return { vars: card_vars };
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
          G.E_MANAGER.add_event(() => {
            const copy = copy_card(used);
            copy.set_edition({ polychrome: true });
            copy.add_to_deck();
            G.consumeables.emplace(copy);
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
      const skips = (G.GAME && G.GAME.celebi_skips) || 1;
      return { vars: [skips, card.ability.extra.reward, skips - card.ability.extra.skip_count] };
    },
    calculate(self, card, context) {
      if (context.skip_blind) {
        card.juice_up(0.1);
        card.ability.extra.skip_count = card.ability.extra.skip_count + 1;
        if (card.ability.extra.skip_count >= G.GAME.celebi_skips) {
          ease_ante(-card.ability.extra.reward);
          G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante || G.GAME.round_resets.ante;
          G.GAME.round_resets.blind_ante = G.GAME.round_resets.blind_ante - card.ability.extra.reward;
          G.E_MANAGER.add_event(() => {
            if (!G.GAME.celebi_triggered) {
              G.GAME.celebi_skips = G.GAME.celebi_skips + 1;
              G.GAME.celebi_triggered = true;
            }
            card.ability.extra.skip_count = 0;
          });
        } else {
          G.GAME.celebi_triggered = false;
        }
      }
      return undefined;
    },
    set_ability(self, card) {
      if (!G.GAME) return;
      G.GAME.celebi_skips = G.GAME.celebi_skips || 1;
      G.GAME.celebi_triggered = false;
    },
  },
  // Treecko 252
  treecko: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return treecko_vars(self, card, 'treecko'); },
    calculate(self, card, context) { return treecko_calc(self, card, context, 'treecko', 'treecko', 'j_poke_grovyle'); },
    ...hand_size,
    set_ability: nature_targets('treecko'),
  },
  // Grovyle 253
  grovyle: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return treecko_vars(self, card, 'grovyle'); },
    calculate(self, card, context) { return treecko_calc(self, card, context, 'seed', 'grovyle', 'j_poke_sceptile'); },
    ...hand_size,
    set_ability: nature_targets('grovyle'),
  },
  // Sceptile 254
  sceptile: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      nature_tip(info_queue);
      const ex = center.ability.extra;
      const card_vars = [ex.money_mod, ex.money_earned, ex.h_size, ex.money_mod + (find_other_poke_or_energy_type(center, 'Grass') * ex.money_increase), ex.money_increase];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        if (is_target(card, context.other_card)) {
          const earned = ease_poke_dollars(card, 'sceptile', card.ability.extra.money_mod + (find_other_poke_or_energy_type(card, 'Grass') * card.ability.extra.money_increase), true);
          card.ability.extra.money_earned = card.ability.extra.money_earned + earned;
          return { dollars: earned, card };
        }
      }
      return undefined;
    },
    ...hand_size,
    set_ability: nature_targets('sceptile'),
  },
  // Torchic 255
  torchic: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return torchic_vars(self, card); },
    calculate(self, card, context) { return torchic_calc(self, card, context, 'j_poke_combusken', true); },
    ...discards,
    set_ability: nature_targets('torchic'),
  },
  // Combusken 256
  combusken: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return torchic_vars(self, card); },
    // (Lua: Combusken's discard popup shows its per-card mult, not the +1/+2 it actually adds.)
    calculate(self, card, context) { return torchic_calc(self, card, context, 'j_poke_blaziken', false); },
    ...discards,
    set_ability: nature_targets('combusken'),
  },
  // Blaziken 257
  blaziken: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      nature_tip(info_queue);
      const ex = center.ability.extra;
      const n = blaze_count(center);
      const mult = ex.mult * ex.cards_discarded * n;
      const Xmult = 1 + ex.Xmult * ex.cards_discarded * n;
      const card_vars = [ex.Xmult, ex.d_size, Xmult, ex.mult, mult];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        const n = blaze_count(card);
        const mult = card.ability.extra.mult * card.ability.extra.cards_discarded * n;
        const Xmult = 1 + card.ability.extra.Xmult * card.ability.extra.cards_discarded * n;
        return { message: localize('poke_blazekick_ex'), colour: 'MULT', Xmult_mod: Xmult, mult_mod: mult };
      }
      if (context.discard && !context.other_card.debuff && !context.blueprint) {
        if (is_target(card, context.other_card)) {
          card.ability.extra.cards_discarded = card.ability.extra.cards_discarded + 1;
          return { message: localize('k_upgrade_ex'), colour: 'RED', delay: 0.45, card };
        }
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
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return mudkip_vars(self, card); },
    calculate(self, card, context) { return mudkip_calc(self, card, context, 'j_poke_marshtomp'); },
    ...hands,
    set_ability: nature_targets('mudkip'),
  },
  // Marshtomp 259
  marshtomp: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); nature_tip(info_queue); return mudkip_vars(self, card); },
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
      const card_vars = [ex.chips, ex.chips_earned, ex.hands, ex.chips + ex.chip_mod * (find_other_poke_or_energy_type(center, 'Water') + find_other_poke_or_energy_type(center, 'Earth')), ex.chip_mod];
      add_target_cards_to_vars(card_vars, ex.targets);
      return { vars: card_vars };
    },
    calculate(self, card, context) {
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.other_card.debuff) {
        // (Lua tests the counts for truthiness — always true, 0 included — so this always applies.)
        const chips = card.ability.extra.chips + card.ability.extra.chip_mod * (find_other_poke_or_energy_type(card, 'Water') + find_other_poke_or_energy_type(card, 'Earth'));
        if (is_target(card, context.other_card)) {
          card.ability.extra.chips_earned = card.ability.extra.chips_earned + chips;
          return { chips, card };
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
