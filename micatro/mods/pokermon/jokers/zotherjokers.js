// Pokermon 3.2.1 — pokemon/zotherjokers.lua (non-Pokédex jokers). PARTIAL: the two the
// core systems depend on are ported here (Everstone blocks evolution — see can_evolve;
// Pokédex lifts the one-per-family pool rule — see pokemon_in_pool). The rest
// (rotomdex, tall_grass, jelly_donut, treasure_eatery, mystery_egg, rival, ruins_of_alph,
// unown_swarm, professor, billion_lions) are still unported.
import { G, localize, defineJokers, type_tooltip } from '../api.js';

const FILE = 'pokemon/zotherjokers.lua';

defineJokers({
  // Pokédex: counts as Showman for Pokémon families (pokemon_in_pool / poke_family_present).
  pokedex: {
    loc_vars(self, info_queue, center) { type_tooltip(self, info_queue, center); return { vars: [] }; },
  },
  // Everstone: Basic/Baby jokers give xMult; no joker can evolve (except by level countdown, which still ticks).
  everstone: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      info_queue.push({ set: 'Other', key: 'basic' });
      info_queue.push({ set: 'Other', key: 'baby' });
      return { vars: [center.ability.extra.Xmult_multi] };
    },
    calculate(self, card, context) {
      if (context.other_joker && context.other_joker.config && (context.other_joker.config.center.stage === 'Basic' || context.other_joker.config.center.stage === 'Baby')) {
        G.E_MANAGER.add_event(() => context.other_joker.juice_up(0.5, 0.5));
        return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult_multi] }), colour: 'XMULT', Xmult_mod: card.ability.extra.Xmult_multi };
      }
      return undefined;
    },
  },
}, FILE);
