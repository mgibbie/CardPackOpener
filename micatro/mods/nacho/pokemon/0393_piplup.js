// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0393_piplup.lua: Piplup, Prinplup, Empoleon.
// 1.7.9: Prinplup +50 / Empoleon +80 Chips (1.6.4: 30 / 50), and their held cards give their rank (x1 / x2) as Chips; a
// rankless card gives nothing (1.6.4 repeated the last value).
import { G, ease_hands_played, defineNacho, type_tooltip, level_evo, has_no_rank } from '../api.js';

const FILE = 'src/pokemon/0393_piplup.lua';

const add_hands = (self, card, from_debuff) => {
  G.GAME.round_resets.hands = G.GAME.round_resets.hands + card.ability.extra.hands;
  if (!from_debuff) ease_hands_played(card.ability.extra.hands);
};
const remove_hands = (self, card) => {
  G.GAME.round_resets.hands = G.GAME.round_resets.hands - card.ability.extra.hands;
  const to_decrease = Math.min(G.GAME.current_round.hands_left - 1, card.ability.extra.hands);
  if (to_decrease > 0) ease_hands_played(-to_decrease);
};
/** Prinplup / Empoleon: each held card with a rank gives chips = its rank x mul. */
function held_chips(card, context, mul) {
  if (context.individual && !context.end_of_round && context.cardarea === G.hand && !has_no_rank(context.other_card)) {
    return { h_chips: context.other_card.base.nominal * mul, card };
  }
  return undefined;
}
const flat_chips = (card, context) => (context.joker_main ? { chips: card.ability.extra.chips } : undefined);

defineNacho({
  // Piplup 393: +80 Chips, -20 per scoring card
  piplup: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const e = card.ability.extra;
      return { vars: [e.hands, e.chips, e.chip_loss, e.rounds] };
    },
    calculate(self, card, context) {
      if (context.joker_main) {
        let chip_total = card.ability.extra.chips - card.ability.extra.chip_loss * context.scoring_hand.length;
        if (chip_total < 0) chip_total = 0;
        return { chips: chip_total };
      }
      return level_evo(self, card, context, 'j_nacho_prinplup');
    },
    add_to_deck: add_hands,
    remove_from_deck: remove_hands,
  },
  // Prinplup 394
  prinplup: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const e = card.ability.extra;
      return { vars: [e.hands, e.chips, e.rounds] };
    },
    calculate(self, card, context) {
      const h = held_chips(card, context, 1);
      if (h) return h;
      const f = flat_chips(card, context);
      if (f) return f;
      return level_evo(self, card, context, 'j_nacho_empoleon');
    },
    add_to_deck: add_hands,
    remove_from_deck: remove_hands,
  },
  // Empoleon 395
  empoleon: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const e = card.ability.extra;
      return { vars: [e.hands, e.chips] };
    },
    calculate(self, card, context) { return held_chips(card, context, 2) || flat_chips(card, context); },
    add_to_deck: add_hands,
    remove_from_deck: remove_hands,
  },
}, FILE);
