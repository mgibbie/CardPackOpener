// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0761_bounsweet.lua: Bounsweet, Steenee, Tsareena (new in 1.7.9; designed for
// Barely Functioning Pokermon by One Punch Idiot — the Lua's "Dip+BFP" mod badge is cosmetic and not shown).
// Bounsweet: +3 Mult, tripled with another Grass joker (4 rounds to evolve). Steenee: +7 Mult per Grass joker (itself included;
// evolves with 3). Tsareena: +11 Mult per Grass joker, and can't be debuffed while every joker is Grass (../functions.js).
import { defineNacho, type_tooltip, level_evo, scaling_evo, find_pokemon_type, poke_is_in_collection } from '../api.js';

const FILE = 'src/pokemon/0761_bounsweet.lua';
const grass = () => find_pokemon_type('Grass').length;

defineNacho({
  // Bounsweet 761
  bounsweet: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [card.ability.extra.mult, card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      if (context.joker_main) {
        let mult = card.ability.extra.mult;
        if (find_pokemon_type('Grass', card).length > 0) mult = mult * 3;
        return { mult };
      }
      return level_evo(self, card, context, 'j_nacho_steenee');
    },
  },
  // Steenee 762
  steenee: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const n = poke_is_in_collection(card) ? 0 : grass();
      return { vars: [card.ability.extra.mult, card.ability.extra.mult * n] };
    },
    calculate(self, card, context) {
      const grass_count = grass();
      if (context.joker_main) return { mult: card.ability.extra.mult * grass_count };
      return scaling_evo(self, card, context, 'j_nacho_tsareena', grass_count, self.config.evo_rqmt);
    },
  },
  // Tsareena 763
  tsareena: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const n = poke_is_in_collection(card) ? 0 : grass();
      return { vars: [card.ability.extra.mult, card.ability.extra.mult * n] };
    },
    calculate(self, card, context) {
      if (context.joker_main) return { mult: card.ability.extra.mult * grass() };
      return undefined;
    },
  },
}, FILE);
