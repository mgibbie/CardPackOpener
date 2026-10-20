/**
 * Pools — native rebuild of Pokermon's pool rules:
 *   - pokemon_in_pool (pokefunctions.lua): one Pokémon per family on the joker row, no
 *     duplicates, enhancement_gate, Dreepy/Ruins special cases; Showman / Pokédex lift it.
 *   - the lovely patch on get_current_pool (lovely.toml "Pokemon only functionality"):
 *     pokemon_only hides base jokers, the gen filter (get_gen_allowed), hazards_on, and
 *     poke_family_present (a family member already seen this run blocks the family).
 *   - get_random_poke_key / create_random_poke_joker (Poké Balls, Transformation, ...).
 *   - evo_item_in_pool, energy pack matching (boosters), joker_rate + 8 (pokeutils.lua
 *     Game:init_game_object hook).
 *
 * Unported content (a joker/consumable whose behaviour isn't rebuilt yet) never enters a
 * pool: its center gets in_pool -> false at registration (see index.js).
 *
 * Intended-design fix: create_random_poke_joker passed an undefined `pokearea` (a local
 * of another function) to SMODS.create_card; the `area` argument is used now.
 */
import { G, P_CENTERS, find_joker, pseudorandom_element, pseudoseed } from '../../../js/engine/core.js';
import { cfg, smods_create_card } from './utils.js';
import { centerActive } from '../../../js/mods/registry.js';
import { family } from './evolution.js';

const fname = (y) => (y && typeof y === 'object' ? y.key : y);
const nameOf = (c) => (!c.name && c.ability && c.ability.name) ? c.ability.name : (c.name || 'bulbasaur');

/** Names of the (non-debuffed) jokers + consumables held — what find_joker(name) looks at. */
function held_names() {
  const out = new Set();
  for (const area of [G.jokers, G.consumeables]) if (area) for (const v of area.cards) if (!v.debuff) out.add(v.ability.name);
  return out;
}

/**
 * Add-on extension point (additive; empty = Pokermon unchanged): fn(center) -> false to keep a
 * Pokémon out of every pool (shop, packs AND get_random_poke_key: Poké Balls, Timer Ball, ...),
 * checked before the Showman / family rules like the wrapper add-ons put around pokemon_in_pool.
 * A rule must only answer for its own mod's centers (Pokermon+'s per-line toggles do).
 */
export const POKE_POOL_RULES = [];

/** Steamodded / Pokermon pool rule for a Pokémon center. */
export function pokemon_in_pool(self) {
  for (const rule of POKE_POOL_RULES) if (rule(self) === false) return false;
  if (find_joker('Showman').length || find_joker('pokedex').length) return true;
  const name = nameOf(self);
  if ((name === 'dreepy' || name === 'drakloak' || name === 'dragapult') && !P_CENTERS.j_poke_dreepy_dart) return false;
  if (name === 'ruins_of_alph' && !P_CENTERS.j_poke_unown) return false;
  const held = held_names(); // (find_joker per name in the Lua; one pass here, same answer)
  for (const v of family) {
    let found_other = false, in_family = false;
    for (const p of v) {
      const cur = fname(p);
      if (cur !== name && held.has(cur)) found_other = true;
      else if (cur === name) in_family = true;
    }
    if (in_family && found_other) return false;
  }
  if (held.has(name)) return false;
  if (self.enhancement_gate && G.playing_cards) {
    for (const v of G.playing_cards) if (v.config.center.key === self.enhancement_gate) return true;
    return false;
  }
  return true;
}

export function poke_family_present(center) {
  if (find_joker('Showman').length || find_joker('pokedex').length) return false;
  for (const fam of family_list_of(center.name)) {
    if (G.GAME.used_jokers['j_poke_' + fname(fam)]) return true;
  }
  return false;
}
function family_list_of(name) {
  for (const v of family) for (const y of v) if (fname(y) === name) return v;
  return [];
}

/** Gen filter: gen 1 follows gen_oneb (the shipped config's gen-1 toggle), 2..9 their own. */
export function get_gen_allowed(card) {
  if (!card.gen) return true;
  const key = { 1: 'gen_oneb', 2: 'gen_two', 3: 'gen_three', 4: 'gen_four', 5: 'gen_five', 6: 'gen_six', 7: 'gen_seven', 8: 'gen_eight', 9: 'gen_nine' }[card.gen];
  return !!(key && cfg(key));
}

/** The lovely "Pokemon only" patch on get_current_pool, as the pool_filter hook. */
export function pool_filter(v /* center */, _type) {
  if (v.set !== 'Joker') return undefined;
  if (!v.stage && cfg('pokemon_only')) return false;
  if (v.stage && !get_gen_allowed(v)) return false;
  // (3.9.1 pokermon.remove_from_pool: the 'hazards' attribute; 3.2.1's hazard_poke flag still counts for add-ons)
  if (v.stage && cfg('hazards_on') === false && (v.hazard_poke || (Array.isArray(v.attributes) && v.attributes.includes('hazards')))) return false;
  if (v.stage && poke_family_present(v)) return false;
  return undefined;
}

/**
 * get_random_poke_key(pseed, stage, pokerarity, area, poketype, exclude_keys, exclude_types): a random
 * Pokémon key obeying the pool rules (never megas / aux forms / banned / held). exclude_types (a type, a list
 * or a set) is 3.9.1's (batch 8: Zorua / Zoroark's illusions skip Dark); the rest is the 3.2.1 pool.
 */
export function get_random_poke_key(pseed, stage, pokerarity, area, poketype, exclude_keys, exclude_types) {
  const poke_keys = [];
  exclude_keys = exclude_keys || {};
  const ex_types = to_set(exclude_types);
  if (typeof pokerarity === 'string') {
    const r = pokerarity.toLowerCase();
    if (r === 'common') pokerarity = 1; else if (r === 'uncommon') pokerarity = 2; else if (r === 'rare') pokerarity = 3;
  }
  // Lua iterates G.P_CENTERS with pairs(); Micatro uses the registration order (deterministic).
  for (const v of Object.values(P_CENTERS)) {
    if (!v.stage || v.stage === 'Other' || !v.mod || v.unported) continue;
    // Registered-but-inactive add-ons (loaded earlier this session, off for this run) are out.
    if (!centerActive(v)) continue;
    if (stage && v.stage !== stage) continue;
    if (pokerarity && v.rarity !== pokerarity) continue;
    if (!get_gen_allowed(v) || (poketype && poketype !== v.ptype) || !pokemon_in_pool(v) || v.aux_poke || v.rarity === 'poke_mega') continue;
    if (exclude_keys[v.key] || G.GAME.banned_keys[v.key] || ex_types[v.ptype]) continue;
    let no_dup = true;
    if (G.jokers && G.jokers.cards && !find_joker('Showman').length) for (const m of G.jokers.cards) if (v.key === m.config.center_key) no_dup = false;
    if (no_dup) poke_keys.push(v.key);
  }
  if (poke_keys.length) return pseudorandom_element(poke_keys, pseudoseed(pseed))[0];
  return 'j_poke_caterpie';
}

/** pokermon.convert_to_set: a value, a list or a set -> a set ({} for nothing). */
function to_set(x) {
  if (!x) return {};
  if (typeof x === 'string') return { [x]: true };
  if (Array.isArray(x)) return Object.fromEntries(x.map((v) => [v, true]));
  return x;
}
/** pokermon.get_random_poke_key_options({key_append | seed, stage, rarity, type, exclude_keys, exclude_types}) (3.9.1). */
export function get_random_poke_key_options(options) {
  const pseed = options.seed || options.pseed || options.key_append;
  return get_random_poke_key(pseed, options.stage || options.pokestage, options.rarity || options.pokerarity, null,
    options.type || options.poketype, to_set(options.exclude_keys), options.exclude_types);
}

export function create_random_poke_joker(pseed, stage, pokerarity, area, poketype) {
  return smods_create_card({ set: 'Joker', area: area || G.jokers, key: get_random_poke_key(pseed, stage, pokerarity, area, poketype) });
}

/** In pool while some held joker needs this item to evolve. */
export function evo_item_in_pool(self) {
  if (G.jokers) {
    for (const v of G.jokers.cards) {
      const ex = v.ability && v.ability.extra;
      if (!ex || typeof ex !== 'object') continue;
      if (!Array.isArray(ex.item_req) && ex.item_req === self.name) return true;
      // (Lua checks v.ability.item_req here — always nil — so list requirements never count.)
    }
  }
  return false;
}

/** pokeutils.lua: Pokermon raises the shop's joker rate by 8. */
export function init_game_object(GAME) {
  GAME.joker_rate = GAME.joker_rate + 8;
}
