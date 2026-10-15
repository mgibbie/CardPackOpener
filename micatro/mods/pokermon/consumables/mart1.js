// Pokermon 3.2.1 — consumables/mart1.lua. PARTIAL: Poké Balls, the 12 basic Energies,
// Double Rainbow Energy, Transformation and the Megastone (the cards the core systems
// need). Still unported: bird_energy (never in a pool in 3.2.1), obituary, nightmare,
// revenant, emergy (Cryptid-only, not registered).
import {
  G, localize, play_sound, delay, defineConsumables, cfg, set_spoon_item,
  create_random_poke_joker, energy_can_use, highlighted_energy_can_use, energy_use, highlighted_energy_use,
  energy_max, energy_increase, type_sticker_applied, get_highest_evo, poke_evolve,
  megastone_can_use, megastone_use, megastone_remove_from_deck, megastone_in_pool, card_eval_status_text,
} from '../api.js';

const FILE = 'consumables/mart1.lua';

// ----------------------------------------------------------- Poké Balls
function ball(stage, spoon) {
  return {
    can_use(self, card) { return G.jokers.cards.length < G.jokers.config.card_limit; },
    use(self, card) {
      if (spoon) set_spoon_item(card);
      G.E_MANAGER.add_event(() => {
        play_sound('timpani');
        const _card = create_random_poke_joker(self.name, stage);
        _card.add_to_deck();
        G.jokers.emplace(_card);
      });
      delay(0.6);
    },
  };
}

// --------------------------------------------------------------- Energy
const energy_card = {
  loc_vars(self, info_queue, center) {
    info_queue.push({ set: 'Other', key: 'energize' });
    return { vars: [cfg('unlimited_energy') ? localize('poke_unlimited_energy') : energy_max + (G.GAME.energy_plus || 0)] };
  },
  can_use(self, card) {
    if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return energy_can_use(self, card);
    return highlighted_energy_can_use(self, card);
  },
  use(self, card, area, copier) {
    if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return energy_use(self, card, area, copier);
    return highlighted_energy_use(self, card, area, copier);
  },
};
const ENERGIES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'darkness', 'metal', 'fairy', 'dragon', 'earth'];

const defs = {
  pokeball: { loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'basic' }); }, ...ball('Basic', true) },
  greatball: { loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'stage1' }); }, ...ball('One', true) },
  ultraball: { loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'stage2' }); }, ...ball('Two', false) },
  masterball: { ...ball('Legendary', false) },

  double_rainbow_energy: {
    ...energy_card,
    use(self, card, area, copier) {
      for (let i = 1; i <= 2; i++) {
        if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) energy_use(self, card, area, copier);
        else highlighted_energy_use(self, card, area, copier);
      }
      if (!G.GAME.modifiers.no_interest) {
        G.GAME.modifiers.reset_no_interest = true;
        G.GAME.modifiers.no_interest = true;
      }
    },
  },

  transformation: {
    loc_vars: energy_card.loc_vars,
    can_use(self, card) {
      let choice;
      if (G.jokers.highlighted && G.jokers.highlighted.length === 1) choice = G.jokers.highlighted[0];
      else if (G.jokers.cards && G.jokers.cards.length > 0) choice = G.jokers.cards[0];
      else return false;
      const ex = choice.ability && choice.ability.extra;
      return !!(ex && typeof ex === 'object' && ex.ptype && !choice.config.center.aux_poke);
    },
    use(self, card) {
      const choice = G.jokers.highlighted && G.jokers.highlighted.length === 1 ? G.jokers.highlighted[0] : G.jokers.cards[0];
      if (choice.config && choice.config.center.stage && !type_sticker_applied(choice)) energy_increase(choice, choice.ability.extra.ptype);
      else if (type_sticker_applied(choice)) energy_increase(choice, type_sticker_applied(choice));
      const highest = get_highest_evo(choice);
      if (highest && typeof highest === 'string') {
        const prefix = choice.config.center.poke_custom_prefix || 'poke';
        poke_evolve(choice, 'j_' + prefix + '_' + highest);
      }
    },
  },

  megastone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'endless' });
      info_queue.push({ set: 'Other', key: 'mega_rule' });
      if (center && center.ability && center.ability.extra.used_on) {
        info_queue.push({ set: 'Other', key: 'mega_used_on', vars: [localize({ type: 'name_text', set: 'Joker', key: center.ability.extra.used_on })] });
      }
      return { vars: [] };
    },
    can_use(self, card) { return megastone_can_use(card); },
    use(self, card) { megastone_use(card); },
    calculate(self, card, context) {
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return megastone_in_pool(); },
    add_to_deck(self, card) { card.ability.extra.used_on = undefined; card.ability.extra.usable = true; },
    remove_from_deck(self, card) { megastone_remove_from_deck(card); },
  },
};
for (const e of ENERGIES) defs[e + '_energy'] = { ...energy_card };

defineConsumables(defs, FILE);
