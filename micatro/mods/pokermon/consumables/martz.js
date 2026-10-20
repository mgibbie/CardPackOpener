// Pokermon 3.9.1 — consumables/07_mart_jirachi.lua (3.2.1's martz.lua): Jirachi's wish cards (the Wish Pack's contents).
// Each transforms your first Jirachi into one of its wish forms; the Master Ball wish turns it into a random Legendary.
// Never in a pool. Batch 10b: a wish is pokermon.change_form ("Transformed!"; 3.2.1 called poke_evolve as a
// transformation: "Evolved!"), and each card names the form it grants (3.9.1 info_queue). The Wish Pack offers 3 of
// banker / booster / power / copy / fixer (boosters/packs1.js); negging and Master Ball are no longer offered.
import { G, P_CENTERS, defineConsumables, poke_evolve, get_random_poke_key, localize } from '../api.js';

const FILE = 'consumables/martz.lua';

/**
 * pokermon.change_form(card, to_key, immediate, transform_message) (3.9.1 pokefunctions.lua): the backend evolve with the
 * "Transformed!" message and no randomizer swap — poke_evolve as a transformation.
 */
const change_form = (card, to_key, immediate, transform_message) =>
  poke_evolve(card, to_key, immediate, transform_message || localize('poke_transform_success'), true);

/** The first joker named 'jirachi' becomes `key`. `shows`: what the card's tooltip names (3.9.1 info_queue). */
function wish(key, shows) {
  return {
    loc_vars(self, info_queue) {
      if (shows && P_CENTERS[shows]) info_queue.push(P_CENTERS[shows]);
      return { vars: [] };
    },
    can_use() { return true; },
    use(self, card, area, copier) {
      for (const jirachi of G.jokers.cards) {
        if ((jirachi.name || jirachi.ability.name) === 'jirachi') {
          const to = typeof key === 'function' ? key() : key;
          // (a form that isn't registered — jirachi_negging until pokejokers_13 defines it — fizzles)
          if (P_CENTERS[to]) change_form(jirachi, to, null, null);
          return;
        }
      }
    },
    in_pool() { return false; },
  };
}

defineConsumables({
  fake_banker: wish('j_poke_jirachi_banker', 'j_poke_jirachi_banker'),
  fake_booster: wish('j_poke_jirachi_booster', 'j_poke_jirachi_booster'),
  fake_power: wish('j_poke_jirachi_power', 'j_poke_jirachi_power'),
  // j_poke_jirachi_negging is written but never registered (pokejokers_13 plan); the card isn't in the Wish Pack either
  // (3.9.1 gives it no info_queue entry).
  fake_negging: wish('j_poke_jirachi_negging'),
  fake_copy: wish('j_poke_jirachi_invis', 'j_poke_jirachi_invis'),
  fake_fixer: wish('j_poke_jirachi_fixer', 'j_poke_jirachi_fixer'),
  fake_masterball: wish(() => get_random_poke_key('masterball', 'Legendary', null, null, null, { j_poke_jirachi: true }), 'c_poke_masterball'),
}, FILE);
