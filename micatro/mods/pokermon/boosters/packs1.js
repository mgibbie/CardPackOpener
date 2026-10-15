// Pokermon 3.2.1 — boosters/packs1.lua: the 8 Pocket packs (Energy + Items, hand drawn,
// cards can be saved — the 'reserve' action). Still unported: Wish Pack and Starter Pack
// (weight 0: only tags / Jirachi open them).
import {
  G, create_card, pseudorandom, pseudoseed, pseudorandom_element, defineBoosters, matching_energy, find_card, any,
} from '../api.js';

const FILE = 'boosters/packs1.lua';

/** Slot 1 of a Pocket pack: 10% Double Rainbow, else 50% an Energy matching a joker you hold. */
function create_energy(self, card) {
  if (pseudoseed('rainbow') < 0.10) return create_card('Spectral', G.pack_cards, null, null, true, true, 'c_poke_double_rainbow_energy', null);
  const match_type = pseudorandom(pseudoseed('match'));
  if (match_type > 0.50 && G.jokers.cards.length > 0) {
    const energy_types = [];
    for (const v of G.jokers.cards) {
      const match = matching_energy(v);
      if (match && !any(find_card(match))) energy_types.push(match);
    }
    if (energy_types.length > 0) {
      const energy = pseudorandom_element(energy_types, pseudoseed('match'))[0];
      return create_card('Energy', G.pack_cards, null, null, true, true, energy, null);
    }
  }
  return create_card('Energy', G.pack_cards, null, null, true, true, null, null);
}

/** Other slots: 8% an evolution item one of your jokers needs (not already offered), else a random Item. */
function create_item(self, card) {
  const c_keys = pocket_keys(self);
  const chance = pseudorandom(pseudoseed('match'));
  if (chance > 0.92) {
    const evo_item_keys = [];
    for (const v of G.jokers.cards) {
      const req = v.config.center.item_req;
      if (!req) continue;
      const item_key = 'c_poke_' + (Array.isArray(req) ? pseudorandom_element(req, pseudoseed('match'))[0] : req);
      if (!any(find_card(item_key)) && !c_keys.includes(item_key)) evo_item_keys.push(item_key);
    }
    if (evo_item_keys.length > 0) return create_card('Item', G.pack_cards, null, null, true, true, pseudorandom_element(evo_item_keys, pseudoseed('match'))[0], null);
    return create_card('Item', G.pack_cards, null, null, true, true, null, null);
  }
  return create_card('Item', G.pack_cards, null, null, true, true, null, null);
}

function create_pocket_card(self, card, i) {
  if (i === 1) return create_energy(self, card);
  if (i === 2 && card.from_tag && G.GAME.round_resets.ante >= 5 && !any(find_card('c_poke_megastone'))) {
    if (pseudorandom(pseudoseed('pocket')) > 0.75) return create_card('Item', G.pack_cards, null, null, true, true, 'c_poke_megastone', null);
    return create_item(self, card);
  }
  return create_item(self, card);
}

/** self.config.c_keys in the Lua (a list on the shared center); kept per run here. */
function pocket_keys(self) {
  G.GAME.poke_pocket_c_keys = G.GAME.poke_pocket_c_keys || {};
  return (G.GAME.poke_pocket_c_keys[self.key] = G.GAME.poke_pocket_c_keys[self.key] || []);
}

const pocket = {
  create_card(self, card, i) {
    const created = create_pocket_card(self, card, i);
    const c_keys = pocket_keys(self);
    c_keys.push(created.config.center_key);
    if (i === self.config.extra + (G.GAME.extra_pocket_picks || 0)) c_keys.length = 0;
    return created;
  },
  loc_vars(self, info_queue, card) { return { vars: [self.config.choose, card.ability.extra - 1, 1] }; },
};

defineBoosters({
  pokepack_normal_1: pocket, pokepack_normal_2: pocket, pokepack_jumbo_1: pocket, pokepack_mega_1: pocket,
  pokepack_normal_3: pocket, pokepack_normal_4: pocket, pokepack_jumbo_2: pocket, pokepack_mega_2: pocket,
}, FILE);
