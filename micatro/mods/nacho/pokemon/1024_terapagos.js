// Nacho's Pokermon Dip 1.6.4 — src/pokemon/1024_terapagos.lua: Terapagos, Terapagos-Terastal,
// Terapagos-Stellar. A Tera Orb used on Terapagos (highlighted, or leftmost with nothing
// highlighted) transforms it; Terastal shares its type with every joker and, at 6+ Energy, becomes
// Stellar — whose Tera type counts as every type (../systems.js) and which turns every Tera sticker
// Stellar while owned (Pokermon's TERA_OVERRIDES). Stellar's animated art: NachosAnimatedPokemon
// (../index.js ANIMATED).
import {
  G, localize, card_eval_status_text, create_card, defineNacho, type_tooltip, poke_evolve, energy_increase,
  get_total_energy, find_pokemon_type, apply_type_sticker, type_sticker_applied, is_type, poke_is_in_collection,
} from '../api.js';

const FILE = 'src/pokemon/1024_terapagos.lua';

/** The Tera Orb was used on this card: it's the one highlighted joker, or the leftmost with none highlighted. */
const orb_target = (card) => (G.jokers.highlighted[0] === card && G.jokers.highlighted.length === 1) || (G.jokers.cards[0] === card && G.jokers.highlighted.length === 0);
const used_orb = (context) => context.using_consumeable && context.consumeable && context.consumeable.ability && context.consumeable.ability.name === 'teraorb';
function negative_orb() {
  const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_teraorb');
  _card.set_edition({ negative: true }, true);
  _card.add_to_deck();
  G.consumeables.emplace(_card);
  card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'item' });
}

defineNacho({
  // Terapagos 1024
  terapagos: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && orb_target(card)) poke_evolve(card, 'j_nacho_terapagos_terastal');
      // (Lua: `and not from_debuff` — an undefined global there, so always true.)
      if (context.end_of_round && !context.individual && context.main_eval) negative_orb();
      return undefined;
    },
    add_to_deck(self, card, from_debuff) { if (!from_debuff) negative_orb(); },
  },
  // Terapagos-Terastal 1024-1
  terapagos_terastal: {
    loc_vars(self, info_queue, card) {
      const count = find_pokemon_type(card.ability.extra.ptype).length - 1;
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [card.ability.extra.Xmult_mod, Math.max(1, 1 + card.ability.extra.Xmult_mod * count)] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && orb_target(card)) {
        if (context.consumeable.ability.extra.change_to_type !== card.ability.extra.changedtype) {
          energy_increase(card, type_sticker_applied(card));
          card.ability.extra.changedtype = card.ability.extra.ptype;
        }
        for (const j of G.jokers.cards) if (j !== card) apply_type_sticker(j, card.ability.extra.ptype);
        if (get_total_energy(card) >= 6) poke_evolve(card, 'j_nacho_terapagos_stellar');
      }
      if (context.joker_main) {
        const count = find_pokemon_type(card.ability.extra.ptype).length - 1;
        return { xmult: 1 + card.ability.extra.Xmult_mod * count };
      }
      return undefined;
    },
    in_pool() { return false; },
    add_to_deck(self, card, from_debuff) {
      if (!from_debuff) {
        G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 3;
        for (const j of G.jokers.cards) apply_type_sticker(j, type_sticker_applied(card));
      }
    },
    remove_from_deck() { G.GAME.energy_plus = (G.GAME.energy_plus || 0) - 3; },
  },
  // Terapagos-Stellar 1024-2
  terapagos_stellar: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push({ set: 'Other', key: 'energize' });
      info_queue.push({ set: 'Other', key: 'stellar_type' });
      return { vars: [card.ability.extra.Xmult_mod, card.ability.extra.Xmult] };
    },
    calculate(self, card, context) {
      if (used_orb(context) && orb_target(card)) {
        for (const j of G.jokers.cards) {
          // Intended-design fix: the Lua reads `j.ability.extra.ptype` on every joker — a Lua error for
          // base-game jokers whose `extra` is a number or absent; those simply get no typed Energy.
          const ex = j.ability.extra;
          energy_increase(j, ex && typeof ex === 'object' ? ex.ptype : undefined);
          apply_type_sticker(j, 'Stellar');
        }
      }
      // Each Stellar joker gives X(1 + 0.1 x its Energy)
      if (context.other_joker && is_type(context.other_joker, 'Stellar')) {
        const xmult = 1 + card.ability.extra.Xmult_mod * get_total_energy(context.other_joker);
        G.E_MANAGER.add_event(() => { context.other_joker.juice_up(0.5, 0.5); });
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [xmult] }), colour: 'XMULT', Xmult_mod: xmult };
      }
      return undefined;
    },
    in_pool() { return false; },
    add_to_deck(self, card, from_debuff) {
      G.E_MANAGER.add_event(() => { apply_type_sticker(card, 'Stellar'); });
      G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 5;
      if (!from_debuff) for (const j of G.jokers.cards) apply_type_sticker(j, 'Stellar');
    },
    remove_from_deck() { G.GAME.energy_plus = (G.GAME.energy_plus || 0) - 5; },
    update(self, card) { if (poke_is_in_collection(card) && !type_sticker_applied(card)) apply_type_sticker(card, 'Stellar'); },
  },
}, FILE);
