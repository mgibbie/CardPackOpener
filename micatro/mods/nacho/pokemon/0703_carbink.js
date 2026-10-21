// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0703_carbink.lua: Carbink.
// 1.7.9 rework (Pokermon 3.9's Hazard layer): +1 Hazard level while owned, and Hazard cards also count as Gold cards (a
// quantum enhancement). Rare, $7, not Blueprint-compatible, needs a Hazard card in the deck (enhancement_gate). 1.6.4: Stone /
// rankless cards counted as Gold.
import { G, P_CENTERS, defineNacho, type_tooltip, hazard_level_tip, poke_change_hazard_level } from '../api.js';

const FILE = 'src/pokemon/0703_carbink.lua';

defineNacho({
  carbink: {
    quantum_enhancements: true, // answers check_enhancement (core.js quantum_enhancements)
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      info_queue.push(hazard_level_tip());
      if (P_CENTERS.m_poke_hazard) info_queue.push(P_CENTERS.m_poke_hazard);
      info_queue.push(P_CENTERS.m_gold);
      return { vars: [card.ability.extra.hazard_level] };
    },
    calculate(self, card, context) {
      if (context.check_enhancement && context.other_card.config.center.key === 'm_poke_hazard') return { m_gold: true };
      return undefined;
    },
    add_to_deck(self, card) { poke_change_hazard_level(card.ability.extra.hazard_level); },
    remove_from_deck(self, card) { poke_change_hazard_level(-card.ability.extra.hazard_level); },
  },
}, FILE);
