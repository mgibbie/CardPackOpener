// Pokermon 3.9.1 (batch 6) — pokemon/pokejokers_06.lua (Pokédex 151-180: Mew -> Flaaffy), 30 jokers + 2 new 3.9.1 Megas (Mega Meganium / Feraligatr, batch 16).
// Line-for-line port of the 3.9.1 behaviour (reworked: Crobat, Natu, Xatu, Sentret / Furret's text; Mew and the
// baby Tarots via SMODS.add_card); static data (pos, config, rarity, cost, stage, ptype, gen, item_req,
// enhancement_gate) comes from data.js + data391.js (the 3.9.1 config). See ../PORTING.md.
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed, pseudorandom_element,
  ease_discard, ease_hands_played,
  defineJokers, type_tooltip, detailed, scaling_evo, level_evo, item_evo, ease_poke_dollars,
  get_probability_vars, pseudorandom_probability, poke_total_chips, find_pokemon_type, faint_baby_poke,
  add_card, P_CENTER_POOLS, is_type, create_consumeable, get_first_of_each_suit,
} from '../api.js';

const FILE = 'pokemon/pokejokers_06.lua';
const mega_tip = (info_queue) => { if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' }); };

// ------------------------------------------------------------ shared bodies
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
const scry = {
  add_to_deck(self, card) { G.GAME.scry_amount = (G.GAME.scry_amount || 0) + card.ability.extra.scry; },
  remove_from_deck(self, card) { G.GAME.scry_amount = Math.max(0, (G.GAME.scry_amount || 0) - card.ability.extra.scry); },
};
const a_mult = (n) => localize({ type: 'variable', key: 'a_mult', vars: [n] });
const a_chips = (n) => localize({ type: 'variable', key: 'a_chips', vars: [n] });
const a_xmult = (n) => localize({ type: 'variable', key: 'a_xmult', vars: [n] });

/** Chikorita line: $money for each card held at end of round past position `after` (1-based). */
function chiko_calc(card, context, after) {
  if (context.end_of_round && context.individual && context.cardarea === G.hand) {
    let beyond = false;
    for (let k = 1; k <= G.hand.cards.length; k++) {
      if (k > after && G.hand.cards[k - 1] === context.other_card) { beyond = true; break; }
    }
    if (beyond) {
      G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + card.ability.extra.money;
      G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
      const earned = ease_poke_dollars(card, 'chikorita', card.ability.extra.money, true);
      return { dollars: earned, card: context.other_card || card };
    }
  }
  return undefined;
}
/** Cyndaquil / Quilava: +mult per discard remaining. */
function cynda_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main && G.GAME.current_round.discards_left > 0) {
      const m = card.ability.extra.mult * G.GAME.current_round.discards_left;
      return { message: a_mult(m), colour: 'MULT', mult_mod: m };
    }
  }
  return undefined;
}
/** Totodile line: chips grow by chip_mod per card played; reset at end of round. */
function toto_score(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.before && !context.blueprint) {
      card.ability.extra.chips = card.ability.extra.chips + (card.ability.extra.chip_mod * context.full_hand.length);
      return { message: localize('k_upgrade_ex'), colour: 'CHIPS' };
    } else if (context.joker_main) {
      return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', chip_mod: card.ability.extra.chips };
    }
  }
  return undefined;
}
const eor_main = (context) => !context.repetition && !context.individual && context.end_of_round && !context.blueprint;
function toto_calc(self, card, context, evo_key) {
  const r = toto_score(card, context);
  if (r) return r;
  if (eor_main(context)) {
    card.ability.extra.chips = 0;
    const evolve = evo_key ? level_evo(self, card, context, evo_key) : undefined;
    if (evolve) return evolve;
    return { message: localize('k_reset'), colour: 'CHIPS' };
  }
  return undefined;
}
/** Sentret / Furret: +mult_mod Mult when the hand type differs from the last one played. */
function sentret_vars(center) {
  const abbr = center.ability.extra; // (3.9.1: the card's own last hand, not the run's)
  return { vars: [abbr.mult, abbr.mult_mod, abbr.last_hand ? localize(abbr.last_hand, 'poker_hands') : localize('poke_none')] };
}
/** Hoothoot / Noctowl: scry cards give their chips. */
function hoot_calc(card, context) {
  if (!context.end_of_round && context.scoring_hand) {
    if (context.individual && context.cardarea === G.scry_view && !context.other_card.debuff) {
      const chips = poke_total_chips(context.other_card);
      return { message: a_chips(chips), message_card: context.other_card, colour: 'CHIPS', chip_mod: chips, card };
    }
  }
  return undefined;
}
/** Ledyba / Ledian: +mult per `per` cards remaining in deck. */
const deck_mult = (card, context, per) => {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    const m = card.ability.extra.mult * Math.floor(G.deck.cards.length / per);
    return { message: a_mult(m), colour: 'MULT', mult_mod: m };
  }
  return undefined;
};
/** Spinarak / Ariados: chips, or chips2 on a 1 in 3. */
function spin_calc(card, context, seed) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    let chips = card.ability.extra.chips;
    if (pseudorandom_probability(card, seed, card.ability.extra.num, card.ability.extra.dem, seed)) chips = card.ability.extra.chips2;
    return { message: a_chips(chips), colour: 'CHIPS', chip_mod: chips };
  }
  return undefined;
}
/** Baby Pokémon: faint check + X0.75 Mult. */
function baby_calc(self, card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
    faint_baby_poke(self, card, context);
    return { message: a_xmult(card.ability.extra.Xmult_minus), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_minus };
  }
  return undefined;
}
/** Cleffa / Igglybuff: a Negative copy of `key` (Tarot) at the end of every round. */
function baby_tarot(card, context, key) {
  if (context.end_of_round && !context.individual && !context.repetition && !card.debuff) {
    G.E_MANAGER.add_event(() => { add_card({ set: 'Tarot', key, edition: 'e_negative' }); });
  }
}
function baby_tarot_vars(self, info_queue, center, key) {
  type_tooltip(self, info_queue, center);
  info_queue.push({ set: 'Other', key: 'baby' });
  if (detailed()) {
    info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
    info_queue.push(P_CENTERS[key]);
  }
  return { vars: [center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
}
/**
 * Natu / Xatu (3.9.1): when a Planet card levels a hand (Steamodded's poker_hand_changed), level it once more.
 * (3.2.1 kept a snapshot of every hand's level on the center and re-levelled whatever differed.) The callers read
 * context.poker_hand_changed themselves: the seam only calls a calculate whose own source names the context.
 */
function natu_calc(context) {
  if (context.card && context.card.ability && context.card.ability.set === 'Planet') {
    return { level_up: true, level_up_hand: context.scoring_name };
  }
  return undefined;
}
/** Mareep line: +Xmult_mod per card added to the deck, -Xmult_minus per card destroyed. */
function mareep_calc(card, context) {
  if (context.cardarea === G.jokers && context.scoring_hand) {
    if (context.joker_main && card.ability.extra.Xmult >= 0.01 && card.ability.extra.Xmult !== 1) {
      return { message: a_xmult(card.ability.extra.Xmult), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult };
    }
  }
  if (context.playing_card_added && !context.blueprint) {
    card.ability.extra.Xmult = card.ability.extra.Xmult + card.ability.extra.Xmult_mod;
    card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
  }
  if (context.remove_playing_cards && !context.blueprint) {
    card.ability.extra.Xmult = card.ability.extra.Xmult - card.ability.extra.Xmult_minus;
    card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_xmult_minus', vars: [card.ability.extra.Xmult_minus] }) });
  }
  return undefined;
}

defineJokers({
  // Mew 151
  mew: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) {
        if (!center.edition || (center.edition && !center.edition.negative)) info_queue.push(P_CENTERS.e_negative);
      }
      return { vars: [center.ability.extra.percent] };
    },
    calculate(self, card, context) {
      if (context.ending_shop) {
        if (pseudorandom('mew') < card.ability.extra.percent / 100) {
          // create random joker (3.9.1: SMODS.add_card, key_append 'mew')
          const joker = add_card({ set: 'Joker', edition: 'e_negative', key_append: 'mew' });
          card_eval_status_text(joker, 'extra', null, null, null, { message: localize('k_plus_joker'), colour: 'BLUE' });
        } else {
          // create random consumable and apply negative
          const sets = [
            { set: 'Tarot', message: localize('k_plus_tarot'), colour: 'PURPLE' },
            { set: 'Spectral', message: localize('k_plus_spectral'), colour: 'Spectral' },
            { set: 'Item', message: localize('poke_plus_pokeitem'), colour: 'pink' },
          ];
          const creation = pseudorandom_element(sets, pseudoseed('mewcreate'))[0];
          const consum = add_card({ set: creation.set, edition: 'e_negative', key_append: 'mew' });
          card_eval_status_text(consum, 'extra', null, null, null, { message: creation.message, colour: creation.colour });
        }
        card.juice_up();
      }
      return undefined;
    },
  },
  // Chikorita 152
  chikorita: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size, card.ability.extra.money, card.ability.extra.rounds] }; },
    calculate(self, card, context) { return chiko_calc(card, context, 4) || level_evo(self, card, context, 'j_poke_bayleef'); },
    ...hand_size,
  },
  // Bayleef 153
  bayleef: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size, card.ability.extra.money, card.ability.extra.rounds] }; },
    calculate(self, card, context) { return chiko_calc(card, context, 2) || level_evo(self, card, context, 'j_poke_meganium'); },
    ...hand_size,
  },
  // Meganium 154 (every held card pays)
  meganium: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); mega_tip(info_queue); return { vars: [card.ability.extra.h_size, card.ability.extra.money] }; },
    calculate(self, card, context) { return chiko_calc(card, context, 0); },
    ...hand_size,
  },
  // Mega Meganium 154-1 (3.9.1, batch 16): the first held card of each suit earns $2 and, if it did anything, is retriggered.
  mega_meganium: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.money_mod, card.ability.extra.retriggers] }; },
    calculate(self, card, context) {
      const first_of_suit = (c) => Object.values(get_first_of_each_suit(G.hand.cards)).includes(c);
      if (context.individual && context.cardarea === G.hand && !context.end_of_round && first_of_suit(context.other_card)) {
        const earned = ease_poke_dollars(card, 'mega meganium', card.ability.extra.money_mod, true);
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + earned;
        // (the Lua's `func` queues the buffer reset; the held-card loop reads no `func`, so it is queued here)
        G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
        return { dollars: earned };
      }
      if (context.repetition && context.cardarea === G.hand && context.card_effects
          && ((context.card_effects[0] && Object.keys(context.card_effects[0]).length > 0) || context.card_effects.length > 1)
          && first_of_suit(context.other_card)) {
        return { repetitions: card.ability.extra.retriggers };
      }
      return undefined;
    },
  },
  // Cyndaquil 155
  cyndaquil: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.d_size, card.ability.extra.mult, card.ability.extra.rounds, card.ability.extra.mult * G.GAME.current_round.discards_left] };
    },
    calculate(self, card, context) { return cynda_calc(card, context) || level_evo(self, card, context, 'j_poke_quilava'); },
    ...discards,
  },
  // Quilava 156
  quilava: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      return { vars: [card.ability.extra.d_size, card.ability.extra.mult, card.ability.extra.rounds, card.ability.extra.mult * G.GAME.current_round.discards_left] };
    },
    calculate(self, card, context) { return cynda_calc(card, context) || level_evo(self, card, context, 'j_poke_typhlosion'); },
    ...discards,
  },
  // Typhlosion 157
  typhlosion: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const ex = card.ability.extra, dl = G.GAME.current_round.discards_left;
      return { vars: [ex.d_size, ex.mult, ex.Xmult, ex.mult * dl, 1 + (ex.Xmult * dl)] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main && G.GAME.current_round.discards_left > 0) {
          return {
            message: localize('poke_fire_blast_ex'),
            colour: 'MULT',
            mult_mod: card.ability.extra.mult * G.GAME.current_round.discards_left,
            Xmult_mod: 1 + (card.ability.extra.Xmult * G.GAME.current_round.discards_left),
          };
        }
      }
      return undefined;
    },
    ...discards,
  },
  // Totodile 158
  totodile: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.hands, card.ability.extra.chip_mod, card.ability.extra.chips, card.ability.extra.rounds] }; },
    calculate(self, card, context) { return toto_calc(self, card, context, 'j_poke_croconaw') || level_evo(self, card, context, 'j_poke_croconaw'); },
    ...hands,
  },
  // Croconaw 159
  croconaw: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.hands, card.ability.extra.chip_mod, card.ability.extra.chips, card.ability.extra.rounds] }; },
    calculate(self, card, context) { return toto_calc(self, card, context, 'j_poke_feraligatr'); },
    ...hands,
  },
  // Feraligatr 160
  feraligatr: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); mega_tip(info_queue); return { vars: [card.ability.extra.hands, card.ability.extra.chip_mod, card.ability.extra.chips] }; },
    calculate(self, card, context) { return toto_calc(self, card, context, null); },
    ...hands,
  },
  // Mega Feraligatr 160-1 (3.9.1, batch 16): +15 Chips per played card (this round); each Dragon joker gives those Chips;
  // comes holding a Dragon Scale.
  mega_feraligatr: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) {
        info_queue.push({ set: 'Other', key: 'holding', vars: ['Dragon Scale'] });
        info_queue.push(P_CENTERS.c_poke_dragonscale);
      }
      return { vars: [card.ability.extra.chip_mod, card.ability.extra.chips] };
    },
    calculate(self, card, context) {
      if (context.before && !context.blueprint) {
        card.ability.extra.chips = card.ability.extra.chips + (card.ability.extra.chip_mod * context.full_hand.length);
        return { message: localize('k_upgrade_ex'), colour: 'CHIPS' };
      }
      if (context.other_joker && is_type(context.other_joker, 'Dragon') && card.ability.extra.chips > 0) {
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { chips: card.ability.extra.chips };
      }
      if (!context.repetition && !context.individual && context.end_of_round && !context.blueprint) {
        card.ability.extra.chips = 0;
        return { message: localize('k_reset'), colour: 'CHIPS' };
      }
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) create_consumeable('c_poke_dragonscale'); },
  },
  // Sentret 161
  sentret: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return sentret_vars(center); },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint) {
          if (card.ability.extra.last_hand !== context.scoring_name) {
            card.ability.extra.last_hand = G.GAME.last_hand_played;
            card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
            return { message: localize('k_upgrade_ex'), colour: 'MULT' };
          }
          card.ability.extra.mult = 0;
          return { message: localize('k_reset') };
        }
        if (context.joker_main) {
          if (card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return scaling_evo(self, card, context, 'j_poke_furret', card.ability.extra.mult, self.config.evo_rqmt);
    },
    add_to_deck(self, card) { card.ability.extra.last_hand = G.GAME.last_hand_played; },
  },
  // Furret 162 (never resets)
  furret: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return sentret_vars(center); },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.before && !context.blueprint && card.ability.extra.last_hand !== context.scoring_name) {
          card.ability.extra.last_hand = G.GAME.last_hand_played;
          card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
          return { message: localize('k_upgrade_ex'), colour: 'MULT' };
        }
        if (context.joker_main) {
          if (card.ability.extra.mult > 0) return { message: a_mult(card.ability.extra.mult), colour: 'MULT', mult_mod: card.ability.extra.mult };
        }
      }
      return undefined;
    },
    add_to_deck(self, card) { card.ability.extra.last_hand = G.GAME.last_hand_played; },
  },
  // Hoothoot 163
  hoothoot: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'scry_cards' });
      return { vars: [card.ability.extra.scry, card.ability.extra.rounds] };
    },
    calculate(self, card, context) { return hoot_calc(card, context) || level_evo(self, card, context, 'j_poke_noctowl'); },
    ...scry,
  },
  // Noctowl 164
  noctowl: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'scry_cards' });
      return { vars: [card.ability.extra.scry] };
    },
    calculate(self, card, context) { return hoot_calc(card, context); },
    ...scry,
  },
  // Ledyba 165
  ledyba: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const deck_count = G.deck && G.deck.cards ? G.deck.cards.length : 0;
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds, center.ability.extra.mult * Math.floor(deck_count / 5)] };
    },
    calculate(self, card, context) { return deck_mult(card, context, 5) || level_evo(self, card, context, 'j_poke_ledian'); },
  },
  // Ledian 166
  ledian: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const deck_count = G.deck && G.deck.cards ? G.deck.cards.length : 0;
      return { vars: [center.ability.extra.mult, center.ability.extra.mult * Math.floor(deck_count / 3)] };
    },
    calculate(self, card, context) { return deck_mult(card, context, 3); },
  },
  // Spinarak 167
  spinarak: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'spinarak');
      return { vars: [center.ability.extra.chips, num, dem, center.ability.extra.rounds, center.ability.extra.chips2] };
    },
    calculate(self, card, context) { return spin_calc(card, context, 'spinarak') || level_evo(self, card, context, 'j_poke_ariados'); },
  },
  // Ariados 168
  ariados: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const [num, dem] = get_probability_vars(center, center.ability.extra.num, center.ability.extra.dem, 'ariados');
      return { vars: [center.ability.extra.chips, num, dem, center.ability.extra.chips2] };
    },
    calculate(self, card, context) { return spin_calc(card, context, 'ariados'); },
  },
  // Crobat 169
  crobat: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'bat_leech' });
      const ex = center.ability.extra;
      return { vars: [ex.mult, ex.mult_mod, ex.chips, ex.chip_mod, ex.Xmult, ex.Xmult_mod, ex.money, ex.money_mod] };
    },
    calculate(self, card, context) {
      // 3.9.1: leech each scoring Enhancement (the card becomes a base card) and gain by its type:
      // Bonus / Stone Chips, Steel / Glass / Flower XMult, Gold payout, any other Mult. (3.2.1 re-rolled them.)
      if (context.cardarea === G.jokers && context.before && !context.blueprint) {
        let m_count = 0, c_count = 0, x_count = 0, d_count = 0;
        for (const v of context.scoring_hand) {
          if (v.config.center !== P_CENTERS.c_base && !v.debuff && !v.vampired) {
            v.vampired = true; // (one Crobat per card per hand)
            const enh = v.config.center.key;
            if (enh === 'm_bonus' || enh === 'm_stone') c_count = c_count + 1;
            else if (enh === 'm_steel' || enh === 'm_glass' || enh === 'm_poke_flower') x_count = x_count + 1;
            else if (enh === 'm_gold') d_count = d_count + 1;
            else m_count = m_count + 1;
            v.set_ability(P_CENTERS.c_base, null, true);
            G.E_MANAGER.add_event(() => { v.juice_up(); v.vampired = undefined; });
          }
        }
        const ex = card.ability.extra;
        if (m_count > 0) ex.mult = ex.mult + ex.mult_mod * m_count;
        if (c_count > 0) ex.chips = ex.chips + ex.chip_mod * c_count;
        if (x_count > 0) ex.Xmult = ex.Xmult + ex.Xmult_mod * x_count;
        if (d_count > 0) ex.money = ex.money + ex.money_mod * d_count;
        if (m_count > 0 || c_count > 0 || x_count > 0 || d_count > 0) return { message: localize('poke_leech_life_ex') };
      }
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        return { message: localize('poke_screech_ex'), colour: 'BLACK', mult_mod: card.ability.extra.mult, chip_mod: card.ability.extra.chips, Xmult_mod: card.ability.extra.Xmult };
      }
      return undefined;
    },
    calc_dollar_bonus(self, card) {
      if (card.ability.extra.money > 0) return ease_poke_dollars(card, 'crobat', card.ability.extra.money, true);
      return undefined;
    },
  },
  // Chinchou 170
  chinchou: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.chips, center.ability.extra.money, center.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Pair.length) {
        const earned = ease_poke_dollars(card, 'chinchou', card.ability.extra.money, true);
        return { message: a_chips(card.ability.extra.chips), colour: 'CHIPS', dollars: earned, chip_mod: card.ability.extra.chips };
      }
      return level_evo(self, card, context, 'j_poke_lanturn');
    },
  },
  // Lanturn 171
  lanturn: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      const ex = center.ability.extra;
      const Money = ex.money + (ex.money_mod * find_pokemon_type('Lightning').length);
      const Chips = ex.chips + (ex.chip_mod * find_pokemon_type('Water').length);
      return { vars: [ex.chips, ex.money, ex.chip_mod, ex.money_mod, Money, Chips] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main && context.poker_hands.Pair.length) {
        const ex = card.ability.extra;
        const Money = ex.money + (ex.money_mod * find_pokemon_type('Lightning').length);
        const earned = ease_poke_dollars(card, 'lanturn', Money, true);
        const Chips = ex.chips + (ex.chip_mod * find_pokemon_type('Water').length);
        return { message: a_chips(Chips), colour: 'CHIPS', dollars: earned, chip_mod: Chips };
      }
      return undefined;
    },
  },
  // Pichu 172
  pichu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.money, center.ability.extra.Xmult_minus, center.ability.extra.rounds] };
    },
    calculate(self, card, context) { return baby_calc(self, card, context) || level_evo(self, card, context, 'j_poke_pikachu'); },
    calc_dollar_bonus(self, card) { return ease_poke_dollars(card, 'pichu', card.ability.extra.money, true); },
  },
  // Cleffa 173
  cleffa: {
    loc_vars(self, info_queue, center) { return baby_tarot_vars(self, info_queue, center, 'c_moon'); },
    calculate(self, card, context) {
      const r = baby_calc(self, card, context);
      if (r) return r;
      baby_tarot(card, context, 'c_moon');
      return level_evo(self, card, context, 'j_poke_clefairy');
    },
  },
  // Igglybuff 174
  igglybuff: {
    loc_vars(self, info_queue, center) { return baby_tarot_vars(self, info_queue, center, 'c_world'); },
    calculate(self, card, context) {
      const r = baby_calc(self, card, context);
      if (r) return r;
      baby_tarot(card, context, 'c_world');
      return level_evo(self, card, context, 'j_poke_jigglypuff');
    },
  },
  // Togepi 175 (the Lua's generate_ui shows the X0.50-X1.50 range; loc vars = rounds)
  togepi: {
    loc_vars(self, info_queue, card) {
      info_queue.push({ set: 'Other', key: 'baby' });
      type_tooltip(self, info_queue, card);
      const r_mults = [];
      for (let i = card.ability.extra.Xmult1 * 20; i <= card.ability.extra.Xmult2 * 20; i++) r_mults.push((i / 20).toFixed(2));
      return { vars: [card.ability.extra.rounds], r_mults };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand && context.joker_main) {
        faint_baby_poke(self, card, context);
        let xmult = 20 * (card.ability.extra.Xmult1 + pseudorandom('togepi') * (card.ability.extra.Xmult2 - card.ability.extra.Xmult1));
        xmult = Math.floor(xmult + 0.5) / 20;
        return { message: a_xmult(xmult), colour: 'XMULT', Xmult_mod: xmult };
      }
      return level_evo(self, card, context, 'j_poke_togetic');
    },
  },
  // Togetic 176
  togetic: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      if (detailed()) info_queue.push(P_CENTERS.c_poke_shinystone);
      const [num, chip_dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.chip_dem, 'togetic_chips');
      const [, Xmult_dem] = get_probability_vars(card, card.ability.extra.num, card.ability.extra.Xmult_dem, 'togetic_Xmult');
      return { vars: [num, chip_dem, Xmult_dem, card.ability.extra.chips, card.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.other_card && context.other_card.ability.effect === 'Lucky Card') {
        // Lua returns chip_mod / Xmult_mod (+ the X part as `extra` when both hit); SMODS scores those
        // keys on a played card exactly like chips / x_mult, which is what Micatro's per-card pass reads.
        let ret;
        if (pseudorandom_probability(card, 'togetic', card.ability.extra.num, card.ability.extra.chip_dem, 'togetic_chips')) {
          ret = { chips: card.ability.extra.chips, card };
        }
        if (pseudorandom_probability(card, 'togetic', card.ability.extra.num, card.ability.extra.Xmult_dem, 'togetic_Xmult')) {
          ret = ret || { card };
          ret.x_mult = card.ability.extra.Xmult_multi;
        }
        return ret;
      }
      return item_evo(self, card, context, 'j_poke_togekiss');
    },
  },
  // Natu 177
  natu: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.rounds] }; },
    calculate(self, card, context) { return (context.poker_hand_changed && natu_calc(context)) || level_evo(self, card, context, 'j_poke_xatu'); },
  },
  // Xatu 178
  xatu: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      return { vars: [G.GAME && G.GAME.last_hand_played ? localize(G.GAME.last_hand_played, 'poker_hands') : localize('poke_none')] };
    },
    calculate(self, card, context) {
      if (context.poker_hand_changed) return natu_calc(context);
      // 3.9.1: opening a Celestial Pack creates the Planet of your last played hand (must have room).
      // (3.2.1: Celestial Packs held every Planet — that lovely patch is gone in 3.9.1.)
      const booster = context.open_booster && (context.booster || (context.card && context.card.config.center));
      if (booster && booster.kind === 'Celestial') {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
          G.E_MANAGER.add_event(() => {
            if (G.GAME.last_hand_played) {
              let _planet;
              for (const planet_center of P_CENTER_POOLS.Planet) if (planet_center.config.hand_type === G.GAME.last_hand_played) _planet = planet_center.key;
              if (_planet) add_card({ set: 'Planet', key: _planet });
            }
            G.GAME.consumeable_buffer = 0;
          });
        }
      }
      return undefined;
    },
  },
  // Mareep 179
  mareep: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.Xmult_minus, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return mareep_calc(card, context) || scaling_evo(self, card, context, 'j_poke_flaaffy', card.ability.extra.Xmult, self.config.evo_rqmt); },
  },
  // Flaaffy 180
  flaaffy: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult, center.ability.extra.Xmult_mod, center.ability.extra.Xmult_minus, self.config.evo_rqmt] }; },
    calculate(self, card, context) { return mareep_calc(card, context) || scaling_evo(self, card, context, 'j_poke_ampharos', card.ability.extra.Xmult, self.config.evo_rqmt); },
  },
}, FILE);
