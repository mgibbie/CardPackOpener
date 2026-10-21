// LEGACY definition (batch 18, Nacho 1.7.9; ../../PORTING.md "Legacy definitions"): 1.7.9 retired this line (deprecated/,
// can_load = false) because base Pokermon owns it. Its 1.6.4 behaviour stays registered for saves, replays, custom decks and
// win stickers: out of every pool, evolving into Pokermon's jokers (Pokermon precedence).
// (1.7.9 also DROPPED Mega Salamence: legacy too, no longer reached by a Mega Stone — ../../index.js.)
// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0371_bagon.lua: Bagon, Shelgon, Salamence, Mega Salamence.
import {
  G, localize, play_sound, delay, defineNachoLegacy, type_tooltip, deck_rank_evo, change_base, rank_next,
} from '../../api.js';

const FILE = 'src/pokemon/0371_bagon.lua';

const deck_data = (num, den) => {
  if (!G.playing_cards) return '';
  let high_count = 0;
  for (const v of G.playing_cards) if (v.base.nominal >= 9) high_count = high_count + 1;
  return ' [' + high_count + '/' + Math.ceil(G.playing_cards.length * num / den) + ']';
};

/** SMODS.modify_rank(card, amount) for amount 0 / 1 (the Strength-tarot flip around it is visual). */
function modify_rank(v, amount) {
  if (amount > 0) change_base(v, null, rank_next(v.base.value)[0]);
  return true;
}
/** Raise the rank of `cards` (held in hand) by 1 after scoring — the Lua queues it as events. */
function raise_ranks(card, cards) {
  for (const v of cards) {
    G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.juice_up(0.3, 0.5); });
    G.E_MANAGER.add_event(() => { v.flip(); play_sound('card1'); v.juice_up(0.3, 0.3); });
    delay(0.2);
    G.E_MANAGER.add_event(() => { modify_rank(v, Math.min(14 - v.get_id(), 1)); });
    G.E_MANAGER.add_event(() => { v.flip(); play_sound('tarot2'); v.juice_up(0.3, 0.3); });
    delay(0.5);
  }
}

/** Bagon / Shelgon shared body: `held` = how many rightmost held cards rise, `div` = the rank divisor. */
function bagon_calc(self, card, context, held, div, forced_key, pct) {
  if (context.before && context.scoring_name === 'Two Pair') {
    const n = G.hand.cards.length;
    const targets = G.hand.cards.filter((v, i) => i >= n - held);
    raise_ranks(card, targets);
  }
  // Scoring effect
  if (context.individual && context.cardarea === G.play && context.scoring_name === 'Two Pair') {
    return { mult: context.other_card.base.nominal / div, card: context.other_card || card };
  }
  if (context.cardarea === G.jokers && context.scoring_hand && context.scoring_name === 'Two Pair' && context.joker_main && !context.blueprint) {
    let high_count = 0;
    for (const v of G.playing_cards) if (v.base.nominal > 9) high_count = high_count + 1;
    card.ability.extra.high_ranks = high_count;
  }
  return deck_rank_evo(self, card, context, forced_key, 9, pct);
}

defineNachoLegacy({
  // Bagon 371
  bagon: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [deck_data(9, 16)] }; },
    calculate(self, card, context) { return bagon_calc(self, card, context, 1, 3, 'j_nacho_shelgon', 0.57); },
  },
  // Shelgon 372
  shelgon: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [deck_data(3, 4)] }; },
    calculate(self, card, context) { return bagon_calc(self, card, context, 2, 2, 'j_nacho_salamence', 0.75); },
  },
  // Salamence 373: Two Pair scoring cards give X(1 + average deck nominal x 0.1)
  salamence: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.scoring_name === 'Two Pair') {
        let avg_rank = 0;
        for (const v of G.playing_cards) avg_rank = v.base.nominal + avg_rank;
        avg_rank = avg_rank / G.playing_cards.length;
        return { Xmult: 1 + avg_rank * card.ability.extra.Xmult, card: context.other_card || card };
      }
      return undefined;
    },
  },
  // Mega Salamence 373-1
  mega_salamence: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [center.ability.extra.Xmult] }; },
    calculate(self, card, context) {
      if (context.individual && context.cardarea === G.play && context.scoring_name === 'Two Pair') {
        return { xmult: card.ability.extra.Xmult, card: context.other_card || card };
      }
      if (context.repetition && !context.end_of_round && context.cardarea === G.play && context.other_card.get_id() > 9) {
        card.ability.extra.retriggers = Math.max(context.other_card.base.nominal - 9, 0);
        return { message: localize('k_again_ex'), repetitions: card.ability.extra.retriggers, card };
      }
      return undefined;
    },
  },
}, FILE);
