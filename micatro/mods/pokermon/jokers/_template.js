// TEMPLATE — copy to pokejokers_NN.js (one file per pokemon/pokejokers_NN.lua), then add an
// `import './jokers/pokejokers_NN.js';` line to ../index.js. Not imported itself.
//
// Port each joker in the Lua file in order. Static data (pos, config, rarity, cost, stage,
// ptype, gen, item_req, evo_list, megas, enhancement_gate, ...) already comes from data.js —
// only behaviour goes here, keyed by the Lua `name`. Keep the Lua's structure and names so the
// two diff by eye (see ../PORTING.md for the idiom table).
import {
  G, P_CENTERS, localize, card_eval_status_text, pseudorandom, pseudoseed,
  defineJokers, type_tooltip, detailed, level_evo, scaling_evo, item_evo, ease_poke_dollars,
} from '../api.js';

const FILE = 'pokemon/pokejokers_NN.lua';

defineJokers({
  // Examplemon 999
  examplemon: {
    loc_vars(self, info_queue, center) {
      type_tooltip(self, info_queue, center);
      if (detailed()) info_queue.push({ set: 'Other', key: 'mega_poke' });
      return { vars: [center.ability.extra.mult, center.ability.extra.rounds] };
    },
    calculate(self, card, context) {
      if (context.cardarea === G.jokers && context.scoring_hand) {
        if (context.joker_main) {
          return {
            message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }),
            colour: 'MULT',
            mult_mod: card.ability.extra.mult,
          };
        }
      }
      return level_evo(self, card, context, 'j_poke_examplemon2');
    },
    // add_to_deck(self, card, from_debuff) {}, remove_from_deck(self, card, from_debuff) {},
    // calc_dollar_bonus(self, card) {}, update(self, card) {}, set_ability(self, card, initial) {},
  },
}, FILE);
