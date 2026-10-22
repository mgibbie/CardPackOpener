// Pokermon 3.9.1 — boosters/packs1.lua (the Pocket packs' contents since the leftovers batch; 3.2.1 before): the 8 Pocket packs (Energy + Items, hand drawn,
// cards can be saved — the 'reserve' action), the Wish Pack (Jirachi's wishes, from the Jirachi
// Tag), the Starter Pack (from the Starter Tag) and 3.9.1's Starter Pack...? (the knock-off starters, from the Starter Tag...?
// the Imposter Professor makes; batch 17). Wish / Starter / Starter...? have weight 0: never in a shop.
import {
  G, P_CENTERS, P_CENTER_POOLS, create_card, pseudorandom, pseudoseed, pseudorandom_element, defineBoosters,
  matching_energy, find_card, any, smods_create_card, poke_family_present, poll_evo_item,
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

/**
 * Other slots (3.9.1 packs1.lua create_item(seed), seed 'pocket'): 8% (pseudoseed(seed .. '_evo_item')) an evolution item
 * a joker you hold needs (pokermon.poll_evo_item('match'): not in play, not banned, in its pool), else a random soulable
 * Item (key_append = seed: a hidden Item, the Leftovers / Soul kind, can turn up). 3.2.1 rolled the evo item with 'match',
 * kept a per-pack list of keys already offered, and its random Item wasn't per-pack seeded.
 */
function create_item(seed) {
  if (pseudorandom(pseudoseed(seed + '_evo_item')) > 0.92) {
    const evo_item_key = poll_evo_item('match');
    if (evo_item_key) return smods_create_card({ key: evo_item_key, area: G.pack_cards, skip_materialize: true });
  }
  return smods_create_card({ set: 'Item', area: G.pack_cards, skip_materialize: true, soulable: true, key_append: seed });
}

function create_pocket_card(self, card, i) {
  // (3.9.1, batch 17: Safety First's poke_no_energy makes the Energy slot an Item)
  if (i === 1) return G.GAME.modifiers.poke_no_energy ? create_item('pocket') : create_energy(self, card);
  if (i === 2 && card.from_tag && G.GAME.round_resets.ante >= 5 && !any(find_card('c_poke_megastone'))) {
    if (pseudorandom(pseudoseed('pocket')) > 0.75) return create_card('Item', G.pack_cards, null, null, true, true, 'c_poke_megastone', null);
    return create_item('pocket');
  }
  return create_item('pocket');
}

// 3.9.1: every Pocket pack's create_card is create_pocket_card itself (3.2.1's c_keys bookkeeping is gone), and its text counts
// Steamodded's booster_choice_mod / booster_size_mod (the pack's "choose N of M").
const pocket = {
  create_card: create_pocket_card,
  loc_vars(self, info_queue, card) {
    const m = G.GAME.modifiers;
    return { vars: [card.config.center.config.choose + (m.booster_choice_mod || 0), card.ability.extra - 1 + (m.booster_size_mod || 0), 1] };
  },
};
const pocket_pack = (extra, choose) => ({ ...pocket, config: { extra, choose } });

/** Starter Pack candidates (no family already present): starters by type, Pikachu / Eevee, pseudo-legendaries. */
export function starter_lists() {
  const L = { grass: [], fire: [], water: [], pseudo: [], pika_eevee: [] };
  for (const v of P_CENTER_POOLS.Joker) {
    // (unported Pokémon are skipped while the port is partial — they would be inert)
    if (!v.mod || v.unported || poke_family_present(v)) continue;
    if (v.starter && v.ptype === 'Grass') L.grass.push(v.key);
    if (v.starter && v.ptype === 'Fire') L.fire.push(v.key);
    if (v.starter && v.ptype === 'Water') L.water.push(v.key);
    if (v.pseudol) L.pseudo.push(v.key);
    if (v.name === 'pikachu' || v.name === 'eevee') L.pika_eevee.push(v.key);
  }
  return L;
}

/**
 * Starter Pack...? candidates (3.9.1 packs1.lua starterq_pack; no family already present): the knock-off starters by type,
 * Bidoof / Yamper, the knock-off pseudo-legendaries (`knockoff_starter` / `knockoff_pseudol` on the centers).
 */
export function starterq_lists() {
  const L = { grass: [], fire: [], water: [], pseudo: [], bidoof_yamper: [] };
  for (const v of P_CENTER_POOLS.Joker) {
    if (!v.mod || v.unported || poke_family_present(v)) continue;
    if (v.knockoff_starter && v.ptype === 'Grass') L.grass.push(v.key);
    if (v.knockoff_starter && v.ptype === 'Fire') L.fire.push(v.key);
    if (v.knockoff_starter && v.ptype === 'Water') L.water.push(v.key);
    if (v.knockoff_pseudol) L.pseudo.push(v.key);
    if (v.name === 'bidoof' || v.name === 'yamper') L.bidoof_yamper.push(v.key);
  }
  return L;
}

// Pokermon 3.9.1 (batch 10b): the Master Ball wish left the pack (its card, c_poke_fake_masterball, still works).
const WISHES = ['c_poke_fake_banker', 'c_poke_fake_booster', 'c_poke_fake_power', 'c_poke_fake_copy', 'c_poke_fake_fixer'];

defineBoosters({
  // Wish Pack (Pokermon 3.9.1, batch 10b): 3 of Jirachi's 5 wishes, all different, choose 1. used_wishes is the pack's own
  // list (its config, copied onto the pack card): each slot rolls among the wishes this pack hasn't offered yet.
  pokepack_wish_pack: {
    config: { extra: 3, choose: 1, used_wishes: [] },
    create_card(self, card, i) {
      G.GAME.pack_choices = 1; // force pack_choices to 1
      if (!Array.isArray(card.ability.used_wishes)) card.ability.used_wishes = [];
      const possible_wishes = WISHES.filter((k) => !card.ability.used_wishes.includes(k));
      // (a pack bigger than 5 — a booster-size modifier — runs out: the Lua's nil key becomes The Judgement below)
      const seed = pseudoseed('jirachi' + i);
      const [random_wish] = possible_wishes.length ? pseudorandom_element(possible_wishes, seed) : [];
      if (random_wish) card.ability.used_wishes.push(random_wish);
      const temp_card = { area: G.pack_cards, key: random_wish, no_edition: true, skip_materialize: true };
      if (!P_CENTERS[temp_card.key]) temp_card.key = 'c_judgement';
      return smods_create_card(temp_card);
    },
    loc_vars(self, info_queue, card) { return { vars: [card.config.center.config.choose, card.ability.extra - 1, 1] }; },
    in_pool() { return false; },
  },
  // Starter Pack: a Grass, Fire and Water starter, Pikachu / Eevee (and a pseudo-legendary in slot 5).
  pokepack_starter_pack: {
    create_card(self, card, i) {
      const L = starter_lists();
      let pack_key;
      if (i === 1 && L.grass.length > 0) pack_key = pseudorandom_element(L.grass, pseudoseed('grass'))[0];
      else if (i === 2 && L.fire.length > 0) pack_key = pseudorandom_element(L.fire, pseudoseed('fire'))[0];
      else if (i === 3 && L.water.length > 0) pack_key = pseudorandom_element(L.water, pseudoseed('water'))[0];
      else if (i === 4 && L.pika_eevee.length > 0) pack_key = pseudorandom_element(L.pika_eevee, pseudoseed('pikaeevee'))[0];
      else if (i === 5 && L.pseudo.length > 0) pack_key = pseudorandom_element(L.pseudo, pseudoseed('pseudo'))[0];
      else pack_key = P_CENTERS.j_poke_caterpie ? 'j_poke_caterpie' : undefined;
      return smods_create_card({ set: 'Joker', area: G.pack_cards, key: pack_key, no_edition: true, skip_materialize: true });
    },
    loc_vars(self, info_queue, card) { return { vars: [card.config.center.config.choose, card.ability.extra] }; },
    in_pool() { return false; },
  },
  // Starter Pack...? (3.9.1, batch 17): a knock-off Grass, Fire and Water starter, Bidoof / Yamper and a knock-off pseudo-
  // legendary; never in a shop (only the Starter Tag...? opens it). 3.2.1's data.js has no such pack: its static data in full.
  pokepack_starterq_pack: {
    name: 'Starteq Pack', // (sic: 3.9.1's name field; the shown name is its loc entry, "Starter Pack...?")
    key: 'pokepack_starterq_pack',
    kind: 'Spectral',
    atlas: 'AtlasBoosterpacksBasic',
    pos: { x: 4, y: 1 },
    config: { extra: 4, choose: 1 },
    cost: 6,
    order: 5,
    weight: 0,
    no_collection: true,
    draw_hand: false,
    unlocked: true,
    discovered: true,
    group_key: 'k_poke_starterq_pack',
    poke_file: FILE,
    create_card(self, card, i) {
      const L = starterq_lists();
      let pack_key;
      if (i === 1 && L.grass.length > 0) pack_key = pseudorandom_element(L.grass, pseudoseed('grass'))[0];
      else if (i === 2 && L.fire.length > 0) pack_key = pseudorandom_element(L.fire, pseudoseed('fire'))[0];
      else if (i === 3 && L.water.length > 0) pack_key = pseudorandom_element(L.water, pseudoseed('water'))[0];
      else if (i === 4 && L.bidoof_yamper.length > 0) pack_key = pseudorandom_element(L.bidoof_yamper, pseudoseed('pikaeevee'))[0];
      else if (i === 5 && L.pseudo.length > 0) pack_key = pseudorandom_element(L.pseudo, pseudoseed('pseudo'))[0];
      else pack_key = P_CENTERS.j_poke_caterpie ? 'j_poke_caterpie' : undefined;
      return smods_create_card({ set: 'Joker', area: G.pack_cards, key: pack_key, no_edition: true, skip_materialize: true });
    },
    loc_vars(self, info_queue, card) { return { vars: [card.config.center.config.choose, card.ability.extra] }; },
    in_pool() { return false; },
  },
  // (3.9.1 configs: 3.2.1's c_keys list is gone)
  pokepack_normal_1: pocket_pack(4, 1), pokepack_normal_2: pocket_pack(4, 1), pokepack_jumbo_1: pocket_pack(6, 1), pokepack_mega_1: pocket_pack(6, 2),
  pokepack_normal_3: pocket_pack(4, 1), pokepack_normal_4: pocket_pack(4, 1), pokepack_jumbo_2: pocket_pack(6, 1), pokepack_mega_2: pocket_pack(6, 2),
}, FILE);
