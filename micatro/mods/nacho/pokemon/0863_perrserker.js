// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0863_perrserker.lua: Galarian Meowth, Perrserker.
// 1.7.9 rework: a played hand with a Steel card gives every other Metal joker +1 / +2 Energy (pokermon.energy.modify, silent:
// ../dip.js modify_energy) — taken back at end of round (Meowth) / after the hand (Perrserker). Galarian Meowth evolves after
// 15 scored Steel cards (scaling_evo). Common $5 / Safari $10; both need a Steel card in the deck (enhancement_gate). 1.6.4
// retriggered held Steel cards and gave Metal jokers X Mult.
import { G, P_CENTERS, localize, defineNacho, type_tooltip, scaling_evo, find_pokemon_type, get_type, main_eval } from '../api.js';
import { con, modify_energy, is_energizable } from '../dip.js';

const FILE = 'src/pokemon/0863_perrserker.lua';

/** +amount Energy (of its own type) on every other energizable Metal joker. */
function charge_metals(card, amount) {
  for (const j of find_pokemon_type('Metal', card)) if (is_energizable(j)) modify_energy(j, get_type(j), amount, true);
}
const loc = (self, info_queue, card, extra) => {
  type_tooltip(self, info_queue, card);
  info_queue.push({ set: 'Other', key: 'energize' });
  info_queue.push(P_CENTERS.m_steel);
  return { vars: extra };
};
function steel_hand(card, context) {
  if (context.before && context.scoring_hand && context.scoring_hand.some((c) => con.is_steel(c))) {
    charge_metals(card, card.ability.extra.e_amount);
    card.ability.extra.raised = card.ability.extra.raised + 1;
    return { message: localize('poke_energized_ex'), colour: 'metal' };
  }
  return undefined;
}
function take_back(card) {
  charge_metals(card, -card.ability.extra.e_amount * card.ability.extra.raised);
  card.ability.extra.raised = 0;
  return { message: localize('k_reset'), colour: 'metal' };
}

defineNacho({
  // Galarian Meowth 52-2
  galarian_meowth: {
    loc_vars(self, info_queue, card) {
      const ex = card.ability.extra;
      return loc(self, info_queue, card, [ex.e_amount, Math.max(0, self.config.evo_rqmt - ex.steel_scored)]);
    },
    calculate(self, card, context) {
      const ex = card.ability.extra;
      const r = steel_hand(card, context);
      if (r) return r;
      if (context.individual && !context.end_of_round && context.cardarea === G.play && !context.blueprint && con.is_steel(context.other_card)) ex.steel_scored = ex.steel_scored + 1;
      if (context.end_of_round && main_eval(context) && !context.individual && !context.repetition && ex.raised > 0) return take_back(card);
      return scaling_evo(self, card, context, 'j_nacho_perrserker', ex.steel_scored, self.config.evo_rqmt);
    },
  },
  // Perrserker 863
  perrserker: {
    loc_vars(self, info_queue, card) { return loc(self, info_queue, card, [card.ability.extra.e_amount]); },
    calculate(self, card, context) {
      const r = steel_hand(card, context);
      if (r) return r;
      if (context.after && main_eval(context) && card.ability.extra.raised > 0) return take_back(card);
      return undefined;
    },
  },
}, FILE);
