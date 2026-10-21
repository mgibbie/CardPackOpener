// Nacho's Pokermon Dip 1.7.9 — src/pokemon/1024_terapagos.lua: Terapagos, Terapagos-Terastal, Terapagos-Stellar.
// A Tera Orb used on Terapagos (pokermon.find_leftmost_or_highlighted: the one highlighted joker, else the leftmost) transforms
// it; Terastal gains Energy of its type and gives every joker its type on each Orb, and at 6+ Energy becomes Stellar — whose Tera
// type counts as every type (../systems.js) and which turns every Tera sticker Stellar while owned (Pokermon's TERA_OVERRIDES).
// 1.7.9: Terastal's X Mult counts the OTHER jokers of its type (find_pokemon_type with itself excluded), Stellar's X Mult goes
// on each Stellar joker (1 + 0.1 x its Energy), and Stellar's card is Pokermon 3.9.1's Gen 9 cell {4,6} under 1.7.9's animated
// soul (../index.js / ../systems.js; 1.6.4 shipped its own animated card).
import {
  G, defineNacho, type_tooltip, poke_evolve, energy_increase, get_total_energy, find_pokemon_type, apply_type_sticker,
  type_sticker_applied, is_type, get_type, poke_is_in_collection, create_consumeable,
} from '../api.js';
import { defer } from '../dip.js';

const FILE = 'src/pokemon/1024_terapagos.lua';

/** pokermon.find_leftmost_or_highlighted(): the one highlighted joker, else the leftmost. */
const leftmost_or_highlighted = () => (G.jokers.highlighted.length === 1 ? G.jokers.highlighted[0] : G.jokers.cards[0]);
const used_orb = (context) => context.using_consumeable && context.consumeable && context.consumeable.ability && context.consumeable.ability.name === 'teraorb';
const negative_orb = () => create_consumeable({ key: 'c_poke_teraorb', edition: 'e_negative' });

defineNacho({
  // Terapagos 1024
  terapagos: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'holding', vars: ['Tera Orb'] });
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && card === leftmost_or_highlighted()) poke_evolve(card, 'j_nacho_terapagos_terastal');
      if (context.end_of_round && context.main_eval && !context.individual && !context.repetition) negative_orb();
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) negative_orb(); },
  },
  // Terapagos-Terastal 1024-1
  terapagos_terastal: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const count = !poke_is_in_collection(card) ? find_pokemon_type(card.ability.extra.ptype, card).length : 0;
      info_queue.push({ set: 'Other', key: 'tera_shell' });
      return { vars: [card.ability.extra.Xmult_mod, Math.max(1, 1 + card.ability.extra.Xmult_mod * count)] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && card === leftmost_or_highlighted()) {
        energy_increase(card, get_type(card));
        for (const j of G.jokers.cards) apply_type_sticker(j, card.ability.extra.ptype);
        if (get_total_energy(card) >= 6) poke_evolve(card, 'j_nacho_terapagos_stellar');
      }
      if (context.joker_main) return { xmult: 1 + card.ability.extra.Xmult_mod * find_pokemon_type(card.ability.extra.ptype, card).length };
      return undefined;
    },
    in_pool() { return false; },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) {
        G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 3;
        for (const j of G.jokers.cards) apply_type_sticker(j, get_type(card));
      }
    },
    remove_from_deck() { G.GAME.energy_plus = G.GAME.energy_plus ? G.GAME.energy_plus - 3 : 0; },
  },
  // Terapagos-Stellar 1024-2
  terapagos_stellar: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'teraform_zero' });
      info_queue.push({ set: 'Other', key: 'stellar_type' });
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && card === leftmost_or_highlighted()) {
        for (const j of G.jokers.cards) {
          energy_increase(j, get_type(j));
          apply_type_sticker(j, 'Stellar');
        }
      }
      // each Stellar joker gives X(1 + 0.1 x its Energy)
      if (context.other_joker && is_type(context.other_joker, 'Stellar')) {
        const xmult = 1 + card.ability.extra.Xmult_mod * get_total_energy(context.other_joker);
        if (xmult > 1) return { Xmult: xmult, card: context.other_joker };
      }
      return undefined;
    },
    in_pool() { return false; },
    add_to_deck(self, card, from_debuff) {
      defer(() => { apply_type_sticker(card, 'Stellar'); });
      G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 5;
      if (!from_debuff) for (const j of G.jokers.cards) apply_type_sticker(j, 'Stellar');
    },
    remove_from_deck() { G.GAME.energy_plus = G.GAME.energy_plus ? G.GAME.energy_plus - 5 : 0; },
    update(self, card) { if (poke_is_in_collection(card) && !type_sticker_applied(card)) apply_type_sticker(card, 'Stellar'); },
  },
}, FILE);
