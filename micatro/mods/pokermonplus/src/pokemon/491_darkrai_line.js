// Pokermon+ — src/pokemon/491_darkrai_line.lua: Darkrai.
//
// Every held Energy card counts as applied to each joker of its type (times the Darkrai held),
// without using up Energy count or the limit: Darkrai re-syncs the difference whenever it
// calculates and takes it all back when it leaves.
// Intended-design fixes:
//  - jokers whose `ability.extra` is a number (base-game jokers like Hiker) crashed the Lua
//    (it indexed `extra.darkrai_applied` on a number), and a nil `extra` was replaced by {} which
//    hid the joker's own mult/chips from energy_shift. The bookkeeping lives on `ability` for
//    those jokers now and their `extra` is left alone.
//  - remove_from_deck passed the lowercase Energy name ("colorless") as the type, so Colorless
//    energy was taken back at full value instead of the half it was given at; the type is passed.
import { G, P_CENTERS, localize, create_card, card_eval_status_text, find_joker, is_type, type_tooltip } from '../../../pokermon/api.js';
import { energy_shift } from '../functions.js';

const ENERGIES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'darkness', 'metal', 'fairy', 'dragon', 'earth'];
const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
const isTable = (x) => x !== null && typeof x === 'object';

/** Where a joker's Darkrai bookkeeping lives (extra for Pokémon-style jokers, ability otherwise). */
function applied_of(joker) {
  const holder = isTable(joker.ability.extra) ? joker.ability.extra : joker.ability;
  if (!holder.darkrai_applied) holder.darkrai_applied = {};
  return holder.darkrai_applied;
}

/** Nightmare after each Boss Blind (also the Void deck). */
export function nightmare_after_boss(context) {
  if (!context.repetition && !context.individual && context.end_of_round && G.GAME.last_blind && G.GAME.last_blind.boss) {
    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit && P_CENTERS.c_poke_nightmare) {
      const _card = create_card('Spectral', G.consumeables, null, null, null, null, 'c_poke_nightmare');
      _card.add_to_deck();
      G.consumeables.emplace(_card);
      card_eval_status_text(_card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
    }
  }
}

export default {
  darkrai: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      nightmare_after_boss(context);
      const a = card.ability.extra;
      if (!context.blueprint) {
        const darkrai_count = find_joker('darkrai').length;
        if (!a.darkrai_applied_energy) a.darkrai_applied_energy = {};
        // 1: the Energy each type should have from Darkrai.
        for (const ek of ENERGIES) {
          const desired = find_joker(ek + '_energy').length * darkrai_count;
          a[ek] = desired;
          a.darkrai_applied_energy[ek] = desired;
        }
        // 2: sync every joker to it.
        for (const joker of G.jokers.cards) {
          const applied = applied_of(joker);
          const tableExtra = isTable(joker.ability.extra);
          for (let i = 0; i < ENERGIES.length; i++) {
            const ek = ENERGIES[i], tk = TYPES[i];
            const desired = a.darkrai_applied_energy[ek] || 0;
            const last_applied = applied[ek] || 0;
            const current = tableExtra ? (joker.ability.extra[ek] || 0) : 0;
            if (is_type(joker, tk)) {
              if (desired !== last_applied) {
                const diff = desired - last_applied;
                if (tableExtra) joker.ability.extra[ek] = current + diff;
                energy_shift(joker, diff, tk, false, true, false);
                applied[ek] = desired;
              }
            } else if (last_applied > 0) {
              // No longer this type: take back what Darkrai gave.
              if (tableExtra) joker.ability.extra[ek] = current - last_applied;
              energy_shift(joker, -last_applied, tk, false, true, false);
              applied[ek] = 0;
            }
          }
        }
      }
      return undefined;
    },
    remove_from_deck(self, card) {
      const a = card.ability.extra;
      for (const joker of G.jokers.cards) {
        const applied = applied_of(joker);
        const tableExtra = isTable(joker.ability.extra);
        for (let i = 0; i < ENERGIES.length; i++) {
          const ek = ENERGIES[i];
          const last_applied = applied[ek] || 0;
          if (last_applied > 0) {
            if (tableExtra) joker.ability.extra[ek] = (joker.ability.extra[ek] || 0) - last_applied;
            energy_shift(joker, -last_applied, TYPES[i], false, true, false);
            applied[ek] = 0;
          }
        }
      }
      a.darkrai_applied_energy = {};
    },
  },
};
