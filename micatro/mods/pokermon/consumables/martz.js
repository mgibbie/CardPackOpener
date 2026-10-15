// Pokermon 3.2.1 — consumables/martz.lua: Jirachi's wish cards (the Wish Pack's contents). Each
// transforms your first Jirachi into one of its wish forms; the Master Ball wish turns it into a
// random Legendary. Never in a pool.
import { G, P_CENTERS, defineConsumables, poke_evolve, get_random_poke_key } from '../api.js';

const FILE = 'consumables/martz.lua';

/** The first joker named 'jirachi' becomes `key` (a transformation, not an evolution). */
function wish(key) {
  return {
    loc_vars() { return { vars: [] }; },
    can_use() { return true; },
    use(self, card, area, copier) {
      for (const jirachi of G.jokers.cards) {
        if ((jirachi.name || jirachi.ability.name) === 'jirachi') {
          const to = typeof key === 'function' ? key() : key;
          // (a form that isn't registered — jirachi_negging until pokejokers_13 defines it — fizzles)
          if (P_CENTERS[to]) poke_evolve(jirachi, to, null, null, true);
          return;
        }
      }
    },
    in_pool() { return false; },
  };
}

defineConsumables({
  fake_banker: wish('j_poke_jirachi_banker'),
  fake_booster: wish('j_poke_jirachi_booster'),
  fake_power: wish('j_poke_jirachi_power'),
  // j_poke_jirachi_negging is written but never registered by 3.2.1 (pokejokers_13 plan); the
  // card isn't in the Wish Pack either.
  fake_negging: wish('j_poke_jirachi_negging'),
  fake_copy: wish('j_poke_jirachi_invis'),
  fake_fixer: wish('j_poke_jirachi_fixer'),
  fake_masterball: wish(() => get_random_poke_key('masterball', 'Legendary', null, null, null, { j_poke_jirachi: true })),
}, FILE);
