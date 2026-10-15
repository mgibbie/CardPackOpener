// Pokermon 3.2.1 — consumables/zmachine.lua: Rotom's appliances. Each turns the selected Rotom
// (or the first Rotom not already in that form) into its appliance form, with a bonus:
// Oven +1 discard, Washing Machine +1 hand, Lawn Mower +1 hand size (in a blind), Fridge 2 random
// consumables, Fan 2 Common jokers. In a pool only while you have a Rotom.
import {
  G, localize, delay, draw_card, ease_discard, ease_hands_played, card_eval_status_text, create_card,
  pseudorandom_element, pseudoseed, defineConsumables, set_spoon_item, poke_evolve, find_card, any, add_card,
} from '../api.js';
import { activeConsumableTypes } from '../../../js/mods/registry.js';

const FILE = 'consumables/zmachine.lua';
const ROTOMS = ['rotom', 'rotomh', 'rotomw', 'rotomf', 'rotomfan', 'rotomm'];
const MACHINE_DICT = { oven: 'j_poke_rotomh', washing_machine: 'j_poke_rotomw', fridge: 'j_poke_rotomf', fan: 'j_poke_rotomfan', lawn_mower: 'j_poke_rotomm' };

const have_rotom = () => ROTOMS.some((r) => any(find_card('j_poke_' + r)));
const is_rotom = (key) => ROTOMS.some((r) => key === 'j_poke_' + r);
/** SMODS sets G.GAME.blind.in_blind while a blind is being played; Micatro's flag is facing_blind. */
const in_blind = () => !!G.GAME.facing_blind;

function machine_transform(self, card, area, copier, machine) {
  set_spoon_item(card);
  if (!machine) machine = 'oven';
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1) {
    poke_evolve(G.jokers.highlighted[0], MACHINE_DICT[machine], null, null, true);
  } else {
    for (const v of G.jokers.cards) {
      if (is_rotom(v.config.center_key) && v.config.center_key !== MACHINE_DICT[machine]) {
        poke_evolve(v, MACHINE_DICT[machine], null, null, true);
        break;
      }
    }
  }
}

function machine_can_use(self, card, machine) {
  if (!machine) machine = 'oven';
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1) {
    const key = G.jokers.highlighted[0].config.center_key;
    if (!is_rotom(key) || key === MACHINE_DICT[machine]) return false;
  }
  return true;
}

const machine = (def) => ({
  can_use(self, card) { return machine_can_use(self, card, self.name); },
  in_pool() { return have_rotom(); },
  ...def,
});

defineConsumables({
  oven: machine({
    loc_vars(self) { return { vars: [self.config.d_plus] }; },
    use(self, card, area, copier) {
      machine_transform(self, card, area, copier, self.name);
      if (in_blind()) ease_discard(self.config.d_plus);
    },
  }),

  washing_machine: machine({
    loc_vars(self) { return { vars: [self.config.hand_plus] }; },
    use(self, card, area, copier) {
      machine_transform(self, card, area, copier, self.name);
      if (in_blind()) ease_hands_played(self.config.hand_plus);
    },
  }),

  fridge: machine({
    loc_vars(self) { return { vars: [self.config.hand_plus] }; },
    use(self, card, area, copier) {
      machine_transform(self, card, area, copier, self.name);
      for (let i = 1; i <= 2; i++) {
        if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
          // pseudorandom_element(SMODS.ConsumableTypes): a keyed table, so picked in key order.
          const types = { Tarot: true, Planet: true, Spectral: true };
          for (const t of activeConsumableTypes()) types[t.key] = true;
          const [, set] = pseudorandom_element(types, pseudoseed('rotomf'));
          const _card = create_card(set, G.consumeables, null, null, null, null, null, 'rotomf');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
          card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_consumable'), colour: 'FILTER' });
        }
      }
    },
  }),

  fan: machine({
    loc_vars(self) { return { vars: [self.config.hand_plus] }; },
    use(self, card, area, copier) {
      machine_transform(self, card, area, copier, self.name);
      for (let i = 1; i <= 2; i++) {
        // SMODS rarity 'Common' = the common pool (a roll of 0 in Micatro's create_card).
        if (G.jokers && G.jokers.cards.length < G.jokers.config.card_limit) add_card({ set: 'Joker', rarity: 0 });
      }
    },
  }),

  lawn_mower: machine({
    loc_vars(self) { return { vars: [self.config.hand_size_plus] }; },
    use(self, card, area, copier) {
      machine_transform(self, card, area, copier, self.name);
      if (in_blind()) {
        G.hand.change_size(self.config.hand_size_plus);
        G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize || 0) + self.config.hand_size_plus;
        const hand_space = Math.min(G.deck.cards.length, self.config.hand_size_plus);
        delay(0.3);
        for (let i = 1; i <= hand_space; i++) draw_card(G.deck, G.hand, i * 100 / hand_space, 'up', true);
      }
    },
  }),
}, FILE);
