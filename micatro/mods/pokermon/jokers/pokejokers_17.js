// Pokermon 3.2.1 — pokemon/pokejokers_17.lua (Pokédex 481-510: Shaymin), 2 jokers.
// Line-for-line port of the behaviour; static data (pos, config, rarity, cost, stage, ptype,
// gen) comes from data.js. See ../PORTING.md.
import {
  G, P_CENTERS, localize, juice_card_until,
  defineJokers, type_tooltip, detailed, scaling_evo, has_enhancement,
} from '../api.js';

const FILE = 'pokemon/pokejokers_17.lua';

defineJokers({
  // Shaymin 492
  shaymin: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push(P_CENTERS.m_poke_flower);
      return { vars: [Math.max(0, self.config.evo_rqmt - center.ability.extra.flowers_scored)] };
    },
    calculate(self, card, context) {
      if (context.first_hand_drawn && !context.blueprint) {
        juice_card_until(card, () => G.GAME.current_round.hands_played === 0 && !G.RESET_JIGGLES, true);
      }
      if (context.before && context.cardarea === G.jokers && !context.blueprint) {
        if (G.GAME.current_round.hands_played === 0) {
          // The last scoring card of the round's first hand becomes a Flower card.
          const last = context.scoring_hand[context.scoring_hand.length - 1];
          last.set_ability(P_CENTERS.m_poke_flower, null, true);
          G.E_MANAGER.add_event(() => { last.juice_up(); });
        }
      }
      if (context.individual && context.cardarea === G.play && !context.other_card.debuff && !context.end_of_round &&
          has_enhancement(context.other_card, 'm_poke_flower') && !context.blueprint) {
        card.ability.extra.flowers_scored = card.ability.extra.flowers_scored + 1;
      }
      return scaling_evo(self, card, context, 'j_poke_shaymin_sky', card.ability.extra.flowers_scored, self.config.evo_rqmt, localize('poke_transform_success'));
    },
  },
  shaymin_sky: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) { info_queue.push(P_CENTERS.m_wild); info_queue.push(P_CENTERS.m_poke_flower); }
      return { vars: [] };
    },
    calculate(self, card, context) {
      // Quantum enhancement: Flower cards are also Wild cards (Steamodded check_enhancement).
      if (context.check_enhancement) {
        if (has_enhancement(context.other_card, 'm_poke_flower')) return { m_wild: true };
      }
      if (context.using_consumeable && (context.consumeable.label || context.consumeable.ability.name) === 'Death') {
        card.ability.extra.death_used = card.ability.extra.death_used + 1;
      }
      return scaling_evo(self, card, context, 'j_poke_shaymin', card.ability.extra.death_used, 1, localize('poke_transform_success'));
    },
    in_pool() { return false; },
  },
}, FILE);
