// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0387_turtwig.lua: Turtwig, Grotle, Torterra.
// Leech Seed: each end of round raises the interest cap ($5 of interest_cap = $1 interest) by 1 / 2 / 3 steps; `interest`
// counts them (kept through evolution: poke_custom_values_to_keep), so selling gives them back and the next form re-adds them.
// Grotle / Torterra: hand size = $15 held each, capped at 2 / 3 (1.6.4: 2 / 4), checked whenever cards are drawn.
// 1.7.9 also makes Seed Money / Money Tree RAISE the cap (+$25 / +$50) instead of setting it: ../systems.js apply_to_run.
import { G, localize, card_eval_status_text, defineNacho, type_tooltip, level_evo, main_eval } from '../api.js';

const FILE = 'src/pokemon/0387_turtwig.lua';

/** Grotle / Torterra: hand size follows your money ($15 each, clamped 0..cap). */
function money_hand_size(card, context, cap) {
  if (!(context.hand_drawn || context.other_drawn)) return;
  const initial = card.ability.extra.h_size;
  const dollars = (G.GAME.dollars || 0) + (G.GAME.dollar_buffer || 0);
  card.ability.extra.h_size = Math.min(Math.max(Math.floor(dollars / 15), 0), cap);
  G.hand.change_size(card.ability.extra.h_size - initial);
}
const leech_seed = (card, steps) => {
  card.ability.extra.interest = card.ability.extra.interest + steps;
  G.GAME.interest_cap = G.GAME.interest_cap + 5 * steps;
};
const remove_seed = (self, card) => {
  G.hand.change_size(-card.ability.extra.h_size);
  G.GAME.interest_cap = G.GAME.interest_cap - card.ability.extra.interest * 5;
};
/** Grotle / Torterra add_to_deck: the kept `interest` (an evolution) goes back on the cap after the evolution lands. */
const add_seeded = (self, card) => {
  G.hand.change_size(card.ability.extra.h_size);
  G.E_MANAGER.add_event(() => { G.GAME.interest_cap = G.GAME.interest_cap + card.ability.extra.interest * 5; });
};
const loc = (self, info_queue, card, second) => { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size, second, G.GAME.interest_cap / 5] }; };
const end_main = (context) => context.end_of_round && main_eval(context) && !context.individual && !context.repetition;

defineNacho({
  // Turtwig 387: +1 hand size; Leech Seed +$1 interest cap per round (4 rounds to evolve)
  turtwig: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.rounds); },
    calculate(self, card, context) {
      if (end_main(context)) {
        leech_seed(card, 1);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_leech_seed_ex') });
      }
      return level_evo(self, card, context, 'j_nacho_grotle');
    },
    add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
    remove_from_deck: remove_seed,
  },
  // Grotle 388: hand size = $15 held each (max 2); +$2 interest cap per round (5 rounds to evolve)
  grotle: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.rounds); },
    calculate(self, card, context) {
      money_hand_size(card, context, 2);
      if (end_main(context)) {
        leech_seed(card, 2);
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_leech_seed_ex') });
      }
      return level_evo(self, card, context, 'j_nacho_torterra');
    },
    add_to_deck: add_seeded,
    remove_from_deck: remove_seed,
  },
  // Torterra 389: hand size = $15 held each (max 3); +$3 interest cap per round
  torterra: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.mult); },
    calculate(self, card, context) {
      money_hand_size(card, context, 3);
      if (end_main(context)) {
        leech_seed(card, 3);
        return { message: localize('poke_leech_seed_ex'), card };
      }
      return undefined;
    },
    add_to_deck: add_seeded,
    remove_from_deck: remove_seed,
  },
}, FILE);
