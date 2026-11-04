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
import { replaced_by } from './precedence.js';
import { rulesRev } from '../../../js/mods/pins.js';

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
// Add-on dedupe (precedence.js): an add-on duplicate of a Pokermon joker is never picked (the random-Pokémon picks call
// pokemon_in_pool directly, not the center's in_pool).
POKE_POOL_RULES.push((self) => (self && replaced_by(self) ? false : undefined));

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

// ------------------------------------------------------------------------------------------------ the generation filter
/**
 * r79 (the owner's bug, 2026-11-03: "the gen 4 starters come up even when gen 4 is off"): the Gen N toggles now hold for every
 * Pokémon from every source. Before r79 a joker with no `gen` passed every filter (all 22 of Nacho's species, 8 of Pokermon+'s,
 * Pokermon's Hisuian Qwilfish), three had the wrong one (Mega Skarmory 1, Nacho's Mega Gallade 3, Pokermon+'s Archaludon 8), the
 * Starter Packs (Pokémon + knock-off) never asked, and the attribute pools (SMODS.poll_object with attributes: the Mystery Egg's
 * hatch, Tall Grass, Corsola, Nacho's Ancient Pack) skipped the filter. The rule: a joker's `gen` is the National Dex generation
 * of its SPECIES; a regional form or a Mega belongs to its base species' generation (Galarian Meowth 1, Mega Lucario 4), as
 * upstream Pokermon numbers every one of its own. Evolving / devolving / Mega-evolving a joker you hold is never filtered (it is
 * that joker's own line), nor a challenge's fixed jokers (Sinnoh Adventure's starters, Imposter Syndrome's Dittos).
 * Gated by rulesRev (GEN_FILTER_REV): a run recorded before r79 replays on the old filter, so its packs and shops stay as recorded.
 */
export const GEN_FILTER_REV = 79;
export const gen_filter_fixed = () => rulesRev('pokermon') >= GEN_FILTER_REV;
/** The corrected generations (key -> gen); the value a center had before is kept as poke_gen_before for the pre-r79 replays. */
export const GEN_FIXES = {
  j_poke_mega_skarmory: 2, j_poke_hisuian_qwilfish: 2,
  j_nacho_turtwig: 4, j_nacho_grotle: 4, j_nacho_torterra: 4, j_nacho_chimchar: 4, j_nacho_monferno: 4, j_nacho_infernape: 4,
  j_nacho_piplup: 4, j_nacho_prinplup: 4, j_nacho_empoleon: 4, j_nacho_victini: 5, j_nacho_clauncher: 6, j_nacho_clawitzer: 6,
  j_nacho_dedenne: 6, j_nacho_oranguru: 7, j_nacho_passimian: 7, j_nacho_turtonator: 7, j_nacho_dhelmise: 7, j_nacho_perrserker: 8,
  j_nacho_bagon: 3, j_nacho_shelgon: 3, j_nacho_salamence: 3, j_poke_mega_gallade: 4,
  j_sonfive_nincada: 3, j_sonfive_ninjask: 3, j_sonfive_shedinja: 3, j_sonfive_croagunk: 4, j_sonfive_toxicroak: 4, j_sonfive_archaludon: 9,
};
/** Non-Pokémon jokers whose whole point is one Pokémon: out of the pools (r79) while that Pokémon's generation is off. */
export const GEN_SOURCES = { j_poke_ruins_of_alph: 'j_poke_unown', j_sonfive_member_card: 'j_sonfive_darkrai', j_sonfive_mystery_box: 'j_sonfive_meltan' };
const GEN_OPTION = { 1: 'gen_oneb', 2: 'gen_two', 3: 'gen_three', 4: 'gen_four', 5: 'gen_five', 6: 'gen_six', 7: 'gen_seven', 8: 'gen_eight', 9: 'gen_nine' };
const is_pokemon = (c) => !!(c && c.set === 'Joker' && c.stage && c.stage !== 'Other');

/** Gen filter: gen 1 follows gen_oneb (the shipped config's gen-1 toggle), 2..9 their own. (Pre-r79 replays: the old gens.) */
export function get_gen_allowed(card) {
  const gen = card && !gen_filter_fixed() && Object.prototype.hasOwnProperty.call(card, 'poke_gen_before') ? card.poke_gen_before : card.gen;
  if (!gen) return true;
  const key = GEN_OPTION[gen];
  return !!(key && cfg(key));
}
/** r79: false keeps a Pokémon of a disabled generation (or a GEN_SOURCES joker) out of a pool; undefined = no say. */
export function gen_pool_rule(self) {
  if (!self || !gen_filter_fixed()) return undefined;
  const src = GEN_SOURCES[self.key];
  if (src) return P_CENTERS[src] && !get_gen_allowed(P_CENTERS[src]) ? false : undefined;
  return is_pokemon(self) && !get_gen_allowed(self) ? false : undefined;
}
/**
 * Every run (the mod's reset_run, after every add-on registered): the GEN_FIXES, and every Pokémon center's in_pool asks
 * gen_pool_rule first — so the attribute pools (SMODS.cull_pool reads only in_pool, not the pool_filter hook) and the jokers
 * with their own in_pool (custom_pool_func: Ditto, ...) obey the filter too. Idempotent.
 */
export function install_gen_filter() {
  for (const [k, g] of Object.entries(GEN_FIXES)) {
    const c = P_CENTERS[k];
    if (!c || c.gen === g) continue;
    if (!Object.prototype.hasOwnProperty.call(c, 'poke_gen_before')) c.poke_gen_before = c.gen;
    c.gen = g;
  }
  for (const c of Object.values(P_CENTERS)) {
    if (!c || c.poke_gen_guard || !(is_pokemon(c) || GEN_SOURCES[c.key])) continue;
    const own = c.in_pool;
    c.in_pool = function (self, args) {
      if (gen_pool_rule(self || c) === false) return false;
      return typeof own === 'function' ? own.call(this, self, args) : true;
    };
    c.poke_gen_guard = true;
  }
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
    // (the owner's Paradox rarity, Gen 9 batch 3: only the Paradox Ball / the Ancient and Future Packs ask for it — a Poké Ball, a
    // Transformation, an illusion never rolls a Paradox; they were never in these pools before r78, so older runs replay as recorded)
    if (v.rarity === 'poke_paradox' && pokerarity !== 'poke_paradox') continue;
    if (!get_gen_allowed(v) || (poketype && poketype !== v.ptype) || !pokemon_in_pool(v) || v.aux_poke || v.rarity === 'poke_mega') continue;
    if (exclude_keys[v.key] || G.GAME.banned_keys[v.key] || ex_types[v.ptype]) continue;
    // r79: the joke content (Spiclops, Billion Lions, ...) only with its option, as in every other pool (index.js APRIL_FOOLS)
    if (v.poke_aprilfools && !cfg('pokemon_aprilfools') && gen_filter_fixed()) continue;
    let no_dup = true;
    if (G.jokers && G.jokers.cards && !find_joker('Showman').length) for (const m of G.jokers.cards) if (v.key === m.config.center_key) no_dup = false;
    if (no_dup) poke_keys.push(v.key);
  }
  if (poke_keys.length) return pseudorandom_element(poke_keys, pseudoseed(pseed))[0];
  // r79: nothing fits and Caterpie's generation is off — any allowed Pokémon instead (no stage / rarity / type asked).
  if (gen_filter_fixed() && (stage || pokerarity || poketype) && P_CENTERS.j_poke_caterpie && !get_gen_allowed(P_CENTERS.j_poke_caterpie)) {
    return get_random_poke_key(pseed, null, null, area, null, exclude_keys, exclude_types);
  }
  return 'j_poke_caterpie';
}
/** A pack slot's fallback (the Lua's Caterpie); r79: an allowed Basic when Caterpie's generation is off. */
export function fallback_poke_key(pseed) {
  if (!P_CENTERS.j_poke_caterpie) return undefined;
  if (gen_filter_fixed() && !get_gen_allowed(P_CENTERS.j_poke_caterpie)) return get_random_poke_key(pseed, 'Basic');
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
