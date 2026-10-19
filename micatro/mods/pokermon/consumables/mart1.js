// Pokermon 3.2.1 — consumables/mart1.lua: Poké Balls, the 12 basic Energies, Bird Energy
// (never in a pool), Double Rainbow Energy, Transformation, the Megastone and the Spectrals
// Obituary / Revenant (seals) and Nightmare. Not registered: emergy (Cryptid-only in the Lua).
import {
  G, localize, play_sound, delay, defineConsumables, cfg, set_spoon_item,
  create_random_poke_joker, energy_can_use, highlighted_energy_can_use, energy_use, highlighted_energy_use,
  energy_max, energy_increase, type_sticker_applied, get_highest_evo, can_evolve_to_highest, poke_evolve,
  megastone_can_use, megastone_use, megastone_remove_from_deck, megastone_in_pool, card_eval_status_text,
  increment_energy, matching_energy, has_type, remove, create_card, poke_unhighlight_cards, MEGASTONE_RESET,
  can_increase_energy, energy_values,
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
// (Transformation's targeting: the OWNER HOUSE RULE at its definition below)
const ENERGY_FIELDS = Object.keys(energy_values);
/** Transformation's use would energize it: a stage or a Tera sticker, a field energize() grows, under its limit. */
const transformation_can_energize = (c) => {
  const ex = c.ability.extra;
  if (!(c.config.center.stage || type_sticker_applied(c))) return false;
  return ENERGY_FIELDS.some((f) => typeof ex[f] === 'number') && can_increase_energy(c);
};
const transformation_ok = (c) => {
  const ex = c && c.ability && c.ability.extra;
  if (!(ex && typeof ex === 'object' && ex.ptype && !c.config.center.aux_poke)) return false;
  return can_evolve_to_highest(c) || transformation_can_energize(c);
};
function transformation_target() {
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1) return transformation_ok(G.jokers.highlighted[0]) ? G.jokers.highlighted[0] : undefined;
  return (G.jokers.cards || []).find(transformation_ok);
}
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

  // OWNER HOUSE RULE (not the Lua): Transformation targets like the Energy cards — the picked
  // joker if it can act on it (a picked one it can't act on refuses the card), else the LEFTMOST
  // joker it can act on, in row order; none -> refused (nothing consumed or charged). "Can act on"
  // = a Pokémon (ptype, not an aux form) that EITHER can still evolve to a higher stage
  // (get_highest_evo) OR can take Energy (energizable and under its Energy limit) — so a fully
  // evolved, uncapped Pokémon is a target for the Energy alone, and only a fully evolved AND
  // capped Pokémon, or a non-Pokémon joker, is skipped / refused. The Lua (mart1.lua) takes the
  // plain leftmost joker and only checks it is a Pokémon, so a non-Pokémon leftmost joker blocked
  // it and a capped, fully evolved one wasted it.
  transformation: {
    loc_vars: energy_card.loc_vars,
    can_use(self, card) { return !!transformation_target(); },
    use(self, card) {
      const choice = transformation_target();
      if (!choice) return;
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
defs.revenant = seal_spectral('poke_silver', 'poke_silver_seal');

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
