// Nacho's Pokermon Dip 1.6.4 — src/pokemon/0387_turtwig.lua: Turtwig, Grotle, Torterra.
// Leech Seed: each end of round raises the interest cap ($5 of interest_cap = $1 interest);
// `counter` remembers how much so selling gives it back. An evolution carries it through
// `money` (Pokermon keeps `money` across evolutions), and the new form's add_to_deck re-adds it.
import { G, localize, defineNacho, type_tooltip, level_evo, main_eval } from '../api.js';

const FILE = 'src/pokemon/0387_turtwig.lua';

/** Grotle / Torterra: hand size follows your money ($15 each, capped). */
function money_hand_size(card, cap) {
  const old_h_size = card.ability.extra.h_size;
  const want = Math.floor(((G.GAME.dollars || 0) + (G.GAME.dollar_buffer || 0)) / 15);
  if (card.ability.extra.h_size !== want) card.ability.extra.h_size = want;
  if (card.ability.extra.h_size > cap) card.ability.extra.h_size = cap;
  if (card.ability.extra.h_size === old_h_size) return;
  G.hand.change_size(card.ability.extra.h_size - old_h_size);
}
function leech_seed(card, steps) {
  card.ability.extra.counter = card.ability.extra.counter + steps;
  G.GAME.interest_cap = G.GAME.interest_cap + card.ability.extra.interest * steps;
  return { message: localize('poke_leech_seed_ex'), card };
}
const remove_seed = (self, card) => {
  G.hand.change_size(-card.ability.extra.h_size);
  G.GAME.interest_cap = G.GAME.interest_cap - card.ability.extra.counter * card.ability.extra.interest;
};
/** Grotle / Torterra add_to_deck: after the evolution restored `money`, re-apply the carried seed. */
const add_evolved = (self, card) => {
  G.hand.change_size(card.ability.extra.h_size);
  G.E_MANAGER.add_event(() => {
    card.ability.extra.counter = card.ability.extra.money;
    G.GAME.interest_cap = G.GAME.interest_cap + card.ability.extra.counter * card.ability.extra.interest;
  });
};
const loc = (self, info_queue, card, second) => { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.h_size, second, G.GAME.interest_cap / 5] }; };

defineNacho({
  // Turtwig 387
  turtwig: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.rounds); },
    calculate(self, card, context) {
      if (context.end_of_round && main_eval(context)) {
        const evolved = level_evo(self, card, context, 'j_nacho_grotle');
        if (evolved) { card.ability.extra.money = card.ability.extra.counter; return evolved; }
        return leech_seed(card, 1);
      }
      return undefined;
    },
    add_to_deck(self, card) { G.hand.change_size(card.ability.extra.h_size); },
    remove_from_deck: remove_seed,
  },
  // Grotle 388
  grotle: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.rounds); },
    calculate(self, card, context) {
      if (context.setting_blind || context.pre_discard) money_hand_size(card, 2);
      if (context.end_of_round && main_eval(context)) {
        const evolved = level_evo(self, card, context, 'j_nacho_torterra');
        if (evolved) { card.ability.extra.money = card.ability.extra.counter; return evolved; }
        return leech_seed(card, 2);
      }
      return undefined;
    },
    add_to_deck: add_evolved,
    remove_from_deck: remove_seed,
  },
  // Torterra 389
  torterra: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, card.ability.extra.mult); },
    calculate(self, card, context) {
      if (context.setting_blind || context.pre_discard) money_hand_size(card, 4);
      if (context.end_of_round && main_eval(context)) return leech_seed(card, 3);
      return undefined;
    },
    add_to_deck: add_evolved,
    remove_from_deck: remove_seed,
  },
}, FILE);
