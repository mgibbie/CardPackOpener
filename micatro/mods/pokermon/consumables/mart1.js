// Pokermon 3.2.1 — consumables/mart1.lua: Poké Balls, the 12 basic Energies, Bird Energy
// (never in a pool), Double Rainbow Energy, Transformation, the Megastone and the Spectrals
// Obituary / Revenant (seals) and Nightmare. Not registered: emergy (Cryptid-only in the Lua).
import {
  G, localize, play_sound, delay, defineConsumables, cfg, set_spoon_item,
  create_random_poke_joker, energy_can_use, highlighted_energy_can_use, energy_use, highlighted_energy_use,
  energy_max, energy_increase, type_sticker_applied, get_highest_evo, poke_evolve,
  megastone_can_use, megastone_use, megastone_remove_from_deck, megastone_in_pool, card_eval_status_text,
  increment_energy, matching_energy, has_type, remove, create_card, poke_unhighlight_cards, MEGASTONE_RESET,
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
        for (const f of MEGASTONE_RESET) f(card);
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

// Bird Energy: fills the joker's whole Energy limit at once (ignores the limit). Never in a pool.
defs.bird_energy = {
  loc_vars(self, info_queue) {
    info_queue.push({ set: 'Other', key: 'energize' });
    return { vars: [energy_max + (G.GAME.energy_plus || 0)] };
  },
  can_use: energy_card.can_use,
  use(self, card) {
    const choice = !G.jokers.highlighted || G.jokers.highlighted.length !== 1 ? energy_can_use(self, card) : highlighted_energy_can_use(self, card);
    if (choice) {
      const max = energy_max + (G.GAME.energy_plus || 0);
      for (let i = 1; i <= max; i++) increment_energy(choice, self.etype);
    }
    G.GAME.energies_used = G.GAME.energies_used ? G.GAME.energies_used + 1 : 1;
  },
  in_pool() { return false; },
};

// Obituary / Revenant: put a Pink / Silver seal on 1 selected card (vanilla max_highlighted rule).
const seal_spectral = (seal, info) => ({
  loc_vars(self, info_queue) { info_queue.push({ key: info, set: 'Other' }); },
  use(self, card) {
    const conv_card = G.hand.highlighted[0];
    G.E_MANAGER.add_event(() => play_sound('tarot1'));
    G.E_MANAGER.add_event(() => conv_card.set_seal(seal, null, true));
    delay(0.5);
    poke_unhighlight_cards();
  },
});
defs.obituary = seal_spectral('poke_pink_seal', 'poke_pink_seal_seal');
defs.revenant = seal_spectral('poke_silver', 'poke_silver');

// Nightmare: destroy the selected typed joker, create 2 Negative Energies of its type.
defs.nightmare = {
  loc_vars(self, info_queue) { info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } }); },
  use(self, card) {
    const selected = G.jokers.highlighted[0];
    const energy = matching_energy(selected);
    remove(self, selected, {});
    for (let i = 1; i <= 2; i++) {
      const _card = create_card('Energy', G.pack_cards, null, null, true, true, energy, null);
      _card.set_edition({ negative: true }, true);
      _card.add_to_deck();
      G.consumeables.emplace(_card);
    }
  },
  can_use() {
    return !!(G.jokers.highlighted && G.jokers.highlighted.length === 1 && has_type(G.jokers.highlighted[0]) && !G.jokers.highlighted[0].ability.eternal);
  },
};

defineConsumables(defs, FILE);
