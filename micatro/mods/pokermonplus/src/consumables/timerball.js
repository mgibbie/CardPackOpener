// Pokermon+ — src/consumables/timerball.lua: the Timer Ball (an Item). It counts the Blinds
// selected while you hold it; using it creates a random Pokémon whose rarity grows with that
// count: Common from 1 round, Uncommon from 3, Rare from 7, a Legendary from 15.
import { G, localize, play_sound, delay, set_spoon_item, create_random_poke_joker } from '../../../pokermon/api.js';
import { scfg } from '../functions.js';

const held = (card) => card.ability.extra.count - card.ability.extra.round_on_add;

export default {
  timerball: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'timer' });
      const e = center.ability.extra;
      const rarities = [localize('k_common'), localize('k_uncommon'), localize('k_rare'), localize('k_legendary')];
      const colours = ['BLUE', 'GREEN', 'RED', 'PURPLE'];
      let rarity = rarities[0], colour = colours[0], key;
      let round = held(center);
      if (round >= e.legendary) { round = 999; rarity = rarities[3]; colour = colours[3]; key = self.key + '_max'; }
      else if (round >= e.rare) { round = e.legendary - round; rarity = rarities[2]; colour = colours[2]; }
      else if (round >= e.uncommon) { round = e.rare - round; rarity = rarities[1]; colour = colours[1]; }
      else if (round >= e.common) { round = e.uncommon - round; }
      else if (round < e.common && round > 0) { round = e.common - round; key = self.key + '_start'; }
      else key = self.key + '_deck';
      return { vars: [rarity, round], colours: [colour], key };
    },
    can_use(self, card) {
      return G.jokers.cards.length < G.jokers.config.card_limit && held(card) >= 1;
    },
    in_pool() { return !!scfg('timerball'); },
    calculate(self, card, context) {
      if (context.setting_blind) card.ability.extra.count = card.ability.extra.count + 1;
      return undefined;
    },
    use(self, card) {
      set_spoon_item(card);
      const c = self.config.extra;
      G.E_MANAGER.add_event(() => {
        play_sound('timpani');
        const difference = held(card);
        let _card;
        if (difference < c.uncommon) _card = create_random_poke_joker('timerball', null, 'common');
        else if (difference < c.rare) _card = create_random_poke_joker('timerball', null, 'uncommon');
        else if (difference < c.legendary) _card = create_random_poke_joker('timerball', null, 'rare');
        else _card = create_random_poke_joker('timerball', 'Legendary');
        _card.add_to_deck();
        G.jokers.emplace(_card);
      });
      delay(0.6);
    },
    set_ability(self, card, initial) {
      if (initial) card.ability.extra.round_on_add = 1;
    },
    /** update(): the ball's sprite shows its tier (view only). */
    get_pos(self, card) {
      const d = held(card), c = self.config.extra;
      if (c.common <= d && d < c.uncommon) return { x: 0, y: 1 };
      if (c.uncommon <= d && d < c.rare) return { x: 0, y: 2 };
      if (c.rare <= d && d < c.legendary) return { x: 0, y: 3 };
      if (c.legendary <= d) return { x: 0, y: 4 };
      return { x: 0, y: 0 };
    },
  },
};
