// Pokermon+ 1.2.0 — src/pokemon/key_items_member_card.lua + key_items_mystery_box.lua: the Member Card and the Mystery Box
// (new "Other" jokers on Pokermon+'s own sheet; config key "key_items"). Sell one for a reward by how far you got (the
// rewards are not cumulative: only the highest reached is given).
// Member Card (in the pool while the Darkrai option is on): counts the different Energy cards you USE (one per type, plus
//   Double Rainbow). 3 -> an Obituary (Spectral), 6 -> +1 Energy limit, 12 -> Darkrai.
// Mystery Box (in the pool while the Meltan option is on): counts the Metal jokers you SELL. 5 -> a random Basic Metal
//   Pokémon, 10 -> a Negative one, 20 -> Meltan.
// Micatro shapes: Pokermon 3.9.1's G.GAME.poke_energy_plus is our energy_plus; pokermon.get_random_poke_key is Pokermon's.
import { G, localize, card_eval_status_text, is_type, get_random_poke_key, add_card, play_sound } from '../../../pokermon/api.js';
import { scfg, POKE_TYPES } from '../functions.js';

const energyKey = (ptype) => 'c_poke_' + ptype.toLowerCase() + (ptype === 'Dark' ? 'ness' : '') + '_energy';
const count_of = (o) => Object.keys(o || {}).length;

export default {
  member_card: {
    loc_vars(self, info_queue, card) {
      const info = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'rewards_member_card', vars: [info.quest1, info.quest2, info.quest3] });
      return { vars: [count_of(info.energy_used)] };
    },
    in_pool() { return scfg('darkrai') !== false && scfg('key_items') !== false; },
    calculate(self, card, context) {
      const info = card.ability.extra;
      const count = count_of(info.energy_used);
      if (context.using_consumeable && context.consumeable) {
        const k = context.consumeable.config.center.key;
        for (const ptype of POKE_TYPES) if (k === energyKey(ptype)) info.energy_used[ptype] = true;
        if (context.consumeable.ability.name === 'double_rainbow_energy' || k === 'c_poke_double_rainbow_energy') info.energy_used.rainbow = true;
      }
      if (context.selling_self && !context.blueprint) {
        if (count >= info.quest3) add_card({ set: 'Joker', key: 'j_sonfive_darkrai' });
        else if (count >= info.quest2) G.GAME.energy_plus = (G.GAME.energy_plus || 0) + 1;
        else if (count >= info.quest1) {
          if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
            G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
            G.E_MANAGER.add_event(() => { add_card({ set: 'Spectral', key: 'c_poke_obituary' }); G.GAME.consumeable_buffer = 0; });
            card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
          } else {
            card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: 'No Room!', colour: 'MULT' });
          }
        }
      }
      return undefined;
    },
  },

  mystery_box: {
    loc_vars(self, info_queue, card) {
      const info = card.ability.extra;
      info_queue.push({ set: 'Other', key: 'rewards_mystery_box', vars: [info.quest1, info.quest2, info.quest3] });
      return { vars: [info.count || 0] };
    },
    in_pool() { return scfg('meltan') !== false && scfg('key_items') !== false; },
    calculate(self, card, context) {
      const info = card.ability.extra;
      if (context.selling_card && context.card && context.card !== card && is_type(context.card, 'Metal')) info.count = info.count + 1;
      if (context.selling_self && !context.blueprint) {
        const negative = info.count >= info.quest2 && info.count < info.quest3;
        if (info.count >= info.quest3) add_card({ set: 'Joker', key: 'j_sonfive_meltan' });
        else if (info.count >= info.quest1) {
          if (G.jokers.cards.length + G.GAME.joker_buffer < G.jokers.config.card_limit) {
            G.GAME.joker_buffer = G.GAME.joker_buffer + 1;
            G.E_MANAGER.add_event(() => {
              G.GAME.joker_buffer = 0;
              play_sound('timpani');
              add_card({ set: 'Joker', key: get_random_poke_key('mystery_box', 'Basic', null, null, 'Metal'), ...(negative ? { edition: 'e_negative' } : {}) });
            });
            return { message: localize('k_plus_joker'), colour: 'BLUE' };
          }
        }
      }
      return undefined;
    },
  },
};
