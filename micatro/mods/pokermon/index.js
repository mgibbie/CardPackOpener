/**
 * Pokermon (InertSteak & contributors), rebuilt natively for Micatro: the 3.2.1 port, moving to 3.9.1 in batches
 * (Plans/MICATRO_MODS_UPGRADES.md; PORTING.md "Pokermon 3.9.1 upgrade").
 *
 * No Steamodded layer: content is built from the mod's own static data (data.js, extracted
 * from its 3.2.1 Lua, + data391.js: the 3.9.1 static data taken so far, generated) merged with behaviour
 * ported to JS (jokers/, consumables/, boosters/, via defs.js), and Pokermon's rule changes are Micatro
 * engine hooks (systems/). Toggleable per run like every Micatro mod: off = gone.
 *
 *   systems/types.js      Pokémon types + Tera stickers, type badges/colours
 *   systems/evolution.js  level / scaling / item / type / deck evolutions, in-place swap, families
 *   systems/energy.js     Energy cards: energize, limits, Colorless half, precise rounding
 *   systems/shiny.js      e_poke_shiny edition (+1 shop booster slot while owned)
 *   systems/pools.js      family / gen / pokemon_only pool rules, random Pokémon
 *   systems/items.js      evolution items, Megastone, held items
 *   systems/rules.js      the lovely.toml patches as hooks (aliases, 3-card straights, Splash, ...)
 *   systems/scry.js       the scry view (top of deck scored like held cards)
 *   systems/anim.js       per-card view data (type, energy, evolution progress, animation)
 *   systems/utils.js      pokeutils.lua + the SMODS helpers the Lua uses
 *
 * Content that isn't ported yet is still registered (so the collection / wiki know it) but is
 * marked `unported: true` and never enters a pool, so a partially ported mod stays playable.
 */
import { registerMod } from '../../js/mods/registry.js';
import { POKE_ATTRIBUTES, pokemon_attributes } from './systems/attributes.js';
import { G } from '../../js/engine/core.js';
import DATA from './data.js';
import D391 from './data391.js';
import { DEFS, PORTED_FILES } from './defs.js';

// Behaviour (each file registers through defs.js on import).
import './jokers/pokejokers_01.js';
import './backs/backs1.js';
import './blinds/pokebossblind.js';
import './consumables/mart3.js';
import './consumables/martz.js';
import './consumables/mart391.js';
import './consumables/zberryjuice.js';
import './consumables/zmachine.js';
import './enhancements/enhancement1.js';
import './jokers/pokejokers_02.js';
import './jokers/pokejokers_03.js';
import './jokers/pokejokers_04.js';
import './jokers/pokejokers_05.js';
import './jokers/pokejokers_06.js';
import './jokers/pokejokers_07.js';
import './jokers/pokejokers_08.js';
import './jokers/pokejokers_09.js';
import './jokers/pokejokers_10.js';
import './jokers/pokejokers_11.js';
import './jokers/pokejokers_12.js';
import './jokers/pokejokers_13.js';
import './jokers/pokejokers_14.js';
import './jokers/pokejokers_15.js';
import './jokers/pokejokers_16.js';
import './jokers/pokejokers_17.js';
import './jokers/pokejokers_18.js';
import './jokers/pokejokers_19.js';
import './jokers/pokejokers_20.js';
import './jokers/pokejokers_21.js';
import './jokers/pokejokers_22.js';
import './jokers/pokejokers_23.js';
import './jokers/pokejokers_24.js';
import './jokers/pokejokers_25.js';
import './jokers/pokejokers_26.js';
import './jokers/pokejokers_28.js';
import './jokers/pokejokers_30.js';
import './jokers/pokejokers_31.js';
import './jokers/pokejokers_32.js';
import './jokers/pokejokers_33.js';
import './jokers/pokejokers_34.js';
import './jokers/zmissingno.js';
import './seals/seals1.js';
import './tags/tags1.js';
import './vouchers/pokevouchers.js';
import './jokers/zotherjokers.js';
import './consumables/mart1.js';
import './consumables/mart2.js';
import './boosters/packs1.js';

import { poke_set_type_badge, type_badge, type_tooltip, TYPE_COLOURS } from './systems/types.js';
import { pokemon_in_pool, pool_filter, init_game_object, evo_item_in_pool } from './systems/pools.js';
import { shiny_edition, shiny_hooks } from './systems/shiny.js';
import * as rules from './systems/rules.js';
import { install_scry, scoring_areas, scry_view, scry_visible } from './systems/scry.js';
import { view_card } from './systems/anim.js';
import { CHALLENGES } from './challenges.js';
import { SLEEVES } from './sleeves.js';
import { POKE_UI } from './ui.js';
import { cfg } from './systems/utils.js';
import { family_win_keys, set_family } from './systems/evolution.js';
import { runbadge_hooks as RB, runbadge_view } from './systems/runbadges.js';

/**
 * Where the mod's art lives: <base>/<path as in the mod's assets/2x folder>. Production
 * serves mod art from its own Pages project (plan §6); set globalThis.MICATRO_MOD_ART_BASE
 * (e.g. 'https://<mod-art host>/pokermon') before loading, else the local folder is used.
 */
const ART_BASE = (typeof globalThis !== 'undefined' && globalThis.MICATRO_MOD_ART_BASE) || '/micatro/mods/pokermon/assets/2x';
const art = (path) => ART_BASE + '/' + path.split('/').map(encodeURIComponent).join('/');

// ------------------------------------------------------------------ atlases
const ATLAS_FILES = {
  AtlasBoosterpacksBasic: ['Basic Series/AtlasBoosterpacksBasic.png'],
  AtlasConsumablesBasic: ['Basic Series/AtlasConsumablesBasic.png'],
  AtlasConsumablesBirdEnergy: ['Basic Series/AtlasConsumablesBirdEnergy.png'],
  AtlasDecksBasic: ['Basic Series/AtlasDecksBasic.png'],
  AtlasEnhancementsBasic: ['Basic Series/AtlasEnhancementsBasic.png'],
  AtlasStickersBasic: ['Basic Series/AtlasStickersBasic.png'],
  AtlasVouchersBasic: ['Basic Series/AtlasVouchersBasic.png'],
  AtlasJokersVanillaShiny: ['AtlasJokersVanillaShiny.png'],
  AtlasBossblinds: ['AtlasBossblinds.png', 34, 34, 21],
  AtlasTags: ['AtlasTags.png', 34, 34],
  placeholder_joker: ['placeholder_joker.png'],
  placeholder_jokerShiny: ['placeholder_jokerShiny.png'],
  placeholder_deck: ['placeholder_deck.png'],
  placeholder_item: ['placeholder_item.png'],
  placeholder_sleeve: ['placeholder_sleeve.png'],
  // (Hisuian Qwilfish draws 3.9.1's card since new-jokers sub-batch 15: AtlasJokersBasicGen02 {2,5}; the Micatro-made card is retired)
  unergy: ['unergy.png'],
  unitem: ['unitem.png'],
  // (the Unown Swarm's strips: SWARM_STRIPS below, tiled)
  // martz.lua's Jirachi wish cards (c_poke_fake_*) name this Series A sheet; it ships with 3.2.1 but wasn't registered.
  AtlasJokersSeriesAGen03: ['Series A/AtlasJokersSeriesAGen03.png'],
  // Pokermon 3.9.1's boss blind sheet (21 frames per row, like the 3.2.1 one; the renamed Iridescent Hacker is row 25).
  AtlasBossblinds391: ['AtlasBossblinds-391.png', 34, 34, 21],
};
for (const g of ['Gen01', 'Gen02', 'Gen03', 'Gen04', 'Gen05', 'Gen06', 'Gen07', 'Gen08', 'Gen09', 'Natdex', 'Others']) {
  ATLAS_FILES['AtlasJokersBasic' + g] = ['Basic Series/AtlasJokersBasic' + g + '.png'];
  ATLAS_FILES['AtlasJokersBasic' + g + 'Shiny'] = ['Basic Series/AtlasJokersBasic' + g + 'Shiny.png'];
}
/**
 * Pokermon 3.9.1's sheets (InertSteak/Pokermon tag 3.9.1, assets/2x/Basic Series), saved unchanged beside the 3.2.1 ones
 * as '<name>-391.png' and registered as '<name>391' (batch 1 already used two of them: AtlasJokersBasicOthers391 for
 * Rotom Dex, AtlasDecksBasic391 for the Stadium / Mega decks — LATER_ART). Pokermon's OWN cards draw from them (to391
 * below): 3.9.1 re-laid some sheets, so jokers take their cell from data391.js sprites (3.9.1 pokespriteload.lua), every
 * other card keeps its cell (3.9.1 kept those). The 3.2.1 sheets stay registered: the add-ons (Nacho, Pokermon+) still
 * draw their cells from them until their own upgrades, and so do the held cards (TO391_HOLD). Checked crop by crop:
 * micatro/tests/mods/pokermon_391_data_test.mjs. (3.9.1's re-laid Bird Energy strip and its Series A sheets are vendored
 * but not used: the same frames, or art the port doesn't show. The Unown Swarm draws 3.9.1's strips since batch 10b: below.)
 */
const SHEETS_391 = ['AtlasConsumablesBasic', 'AtlasDecksBasic', 'AtlasEnhancementsBasic', 'AtlasStickersBasic'];
for (const g of ['Gen01', 'Gen02', 'Gen03', 'Gen04', 'Gen05', 'Gen06', 'Gen07', 'Gen08', 'Gen09', 'Natdex', 'Others']) SHEETS_391.push('AtlasJokersBasic' + g, 'AtlasJokersBasic' + g + 'Shiny');
for (const n of SHEETS_391) ATLAS_FILES[n + '391'] = ['Basic Series/' + n + '-391.png'];
SHEETS_391.push('AtlasBossblinds');
/** Cards that keep their 3.2.1 sheet (data391.js sprite_hold; empty since batch 10b, when Unown took its 3.9.1 card). */
const TO391_HOLD = new Set(D391.sprite_hold.map(([name]) => 'j_poke_' + name));
/** A Pokermon card's 3.2.1 sheet -> its 3.9.1 twin. */
const to391 = (c) => {
  const m = /^poke_(.+)$/.exec(c.atlas || '');
  if (m && SHEETS_391.includes(m[1]) && !TO391_HOLD.has(c.key)) c.atlas = 'poke_' + m[1] + '391';
  return c;
};
const atlases = {};
for (const [name, [path, px = 71, py = 95, frames]] of Object.entries(ATLAS_FILES)) {
  atlases['poke_' + name] = { src: art(path), px, py, ...(frames ? { frames } : {}) };
}
/**
 * The Unown Swarm (batch 10b): Pokermon 3.9.1's animation strips (pokesprites.lua: 290 x 285 cells, 36 frames in ONE row,
 * 20880 px wide at 2x, past the 16384 px texture limit of many GPUs) split into tiles of SWARM_TILE_COLS frames (8120 px)
 * by tools/micatro/split_pokermon_unown_swarm.mjs: '<strip>-391-t<n>.png', registered as 'poke_<strip>_t<n>'. The strip's
 * own atlas has no src: its `tiles` + `tile_cols` make the sprite lookup (js/ui/assets.js modCellRect) pick the tile, and
 * its `crop` draws only the card — the Lua's display_size 290/3 x 285/3 with set_alignment x = (37 / 3) / 71: the card is
 * the 213 x 285 px at x 37 of each cell (3x a 71 x 95 card). The flying Unown outside the card are cut off.
 * (3.2.1's 12 x 3 sheets hold the same 36 frames, pixel for pixel; they stay vendored, unused.)
 */
const SWARM_STRIPS = ['j_poke_unown_swarm', 'j_poke_unown_swarm_shiny', 'j_poke_unown_swarm_soul', 'j_poke_unown_swarm_shiny_soul'];
export const SWARM_TILE_COLS = 14;
for (const strip of SWARM_STRIPS) {
  const tiles = [];
  for (let t = 0; t * SWARM_TILE_COLS < 36; t++) {
    atlases['poke_' + strip + '_t' + t] = { src: art(strip + '-391-t' + t + '.png'), px: 290, py: 285 };
    tiles.push('poke_' + strip + '_t' + t);
  }
  atlases['poke_' + strip] = { px: 290, py: 285, frames: 36, tiles, tile_cols: SWARM_TILE_COLS, crop: { x: 37, y: 0, w: 213, h: 285 } };
}
/**
 * Centers 3.2.1 drew with a placeholder sheet whose art a later Pokermon release added (3.9.1: zotherjokers.lua
 * rotomdex pos {0,4} atlas "others"; backs1.lua stadiumdeck / megadeck AtlasDecksBasic {8,0} / {9,0}). Applied
 * after the 3.2.1 atlas is resolved; the sleeves' twins are in sleeves.js.
 */
const LATER_ART = {
  j_poke_rotomdex: { atlas: 'poke_AtlasJokersBasicOthers391', pos: { x: 0, y: 4 } },
  b_poke_stadiumdeck: { atlas: 'poke_AtlasDecksBasic391', pos: { x: 8, y: 0 } },
  b_poke_megadeck: { atlas: 'poke_AtlasDecksBasic391', pos: { x: 9, y: 0 } },
};
const laterArt = (c) => { const a = LATER_ART[c.key]; if (a) { c.atlas = a.atlas; c.pos = { ...a.pos }; } };
/** A data atlas name -> the registered (prefixed) atlas, or a placeholder. */
const atlasName = (a, fallback = 'placeholder_joker') => ('poke_' + (ATLAS_FILES[a] || SWARM_STRIPS.includes(a) ? a : fallback));

// ------------------------------------------------------------------ helpers
const FN = '__fn';
const isTable = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/** Deep copy of extracted data minus the "__fn" markers. */
function stripFns(o) {
  if (Array.isArray(o)) return o.map(stripFns);
  if (!isTable(o)) return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== FN) r[k] = stripFns(v);
  return r;
}
const listOf = (f) => (f && f.ret && Array.isArray(f.ret.list) ? f.ret.list : []);
/**
 * Every center is built the same way: static data first, behaviour after. A definition's own static (non-function)
 * fields — overrides of data.js, or the whole static data of an object data.js doesn't have — are merged into the
 * data item (deep-copied) BEFORE the center is built, so they go through the same processing as data.js's (atlas
 * names, ptype / item_req / evo_list into config.extra, sprites, ...); only the functions are assigned afterwards.
 */
const staticOf = (def) => {
  const out = {};
  for (const [k, v] of Object.entries(def || {})) if (k !== 'poke_file' && typeof v !== 'function') out[k] = stripFns(v);
  return out;
};
const behaviourOf = (def) => {
  const out = {};
  for (const [k, v] of Object.entries(def || {})) if (typeof v === 'function') out[k] = v;
  return out;
};
/** The data item with the definition's static fields merged in. */
const withStatic = (item, def) => (def ? { ...item, ...staticOf(def) } : item);
const SPRITES = DATA.globals.PokemonSprites;

/**
 * Pokermon's own jokers: 3.9.1's sprite (data391.js: the sheet + cell of pokespriteload.lua 3.9.1, resolved; the
 * sheet becomes its 391 twin in to391). A list of positions = a multi-sprite Pokémon: Micatro shows the first.
 */
function jokerSprite391(item, c) {
  const s = D391.sprites[item.name];
  if (!s) return false;
  c.atlas = 'poke_' + s.atlas;
  c.pos = { ...s.pos };
  if (s.soul_pos) c.soul_pos = { ...s.soul_pos };
  if (s.multi) c.poke_multi_sprite = true;
  return true;
}

/** pokespriteload.lua poke_load_atlas + poke_load_sprites (Basic sheet, base art; 3.2.1 — the add-ons' path). */
function jokerSprite(item, c, extra_sprites) {
  const info = (extra_sprites && extra_sprites[item.name]) || SPRITES[item.name];
  if (!info) { c.atlas = atlasName(item.atlas); return; }
  let atlas;
  if (info.gen_atlas && item.gen) atlas = 'AtlasJokersBasicGen' + (item.gen < 10 ? '0' + item.gen : item.gen);
  else if (info.others_atlas) atlas = 'AtlasJokersBasicOthers';
  else atlas = 'AtlasJokersBasicNatdex';
  c.atlas = 'poke_' + atlas;
  const base = info.base || {};
  // A list of positions = a multi-sprite Pokémon (Lua picks one with math.random); Micatro shows the first.
  const pos = base.pos && base.pos.x !== undefined ? base.pos : Array.isArray(base.pos) ? base.pos[0] : undefined;
  if (pos) c.pos = { x: pos.x, y: pos.y };
  if (Array.isArray(base.pos)) c.poke_multi_sprite = true;
  if (base.soul_pos) c.soul_pos = { ...base.soul_pos };
}

const UNPORTED_POOL = () => false;
const PORTED = { jokers: [], consumables: [], boosters: [] };
const UNPORTED = { jokers: [], consumables: [], boosters: [], vouchers: [], backs: [], tags: [], blinds: [], seals: [], enhancements: [] };

// ------------------------------------------------------------ 3.9.1 static data
/** data.js item + the 3.9.1 changes taken for it (data391.js jokers: rarity, cost, compat flags, gates, config paths, or
 * the whole config for a reworked joker). */
function with391(data_item) {
  const o = D391.jokers[data_item.name];
  if (!o) return data_item;
  const item = { ...data_item };
  for (const [k, v] of Object.entries(o)) {
    if (k === 'config' || k === 'config_all') continue;
    if (v === null) delete item[k]; else item[k] = v;
  }
  // A reworked joker (batch 6+: its file is on 3.9.1) takes its whole 3.9.1 config.
  if (o.config_all) item.config = JSON.parse(JSON.stringify(o.config_all));
  if (o.config) {
    item.config = JSON.parse(JSON.stringify(item.config || {}));
    for (const [p, v] of Object.entries(o.config)) {
      const ks = p.split('.');
      let t = item.config;
      for (const k of ks.slice(0, -1)) t = isTable(t[k]) ? t[k] : (t[k] = {});
      t[ks[ks.length - 1]] = v;
    }
  }
  return item;
}

// -------------------------------------------------------------------- jokers
function jokerCenter(data_item0, file) {
  const data_item = with391(data_item0);
  const def = DEFS.jokers[data_item.name];
  const item = withStatic(data_item, def);
  const c = stripFns(item);
  c.key = 'j_poke_' + (item.key || item.name);
  c.set = 'Joker';
  c.poke_file = file;
  c.rarity = c.rarity ?? 1;
  c.cost = c.cost ?? 3;
  c.blueprint_compat = !!c.blueprint_compat;
  c.perishable_compat = c.perishable_compat !== false;
  c.eternal_compat = c.eternal_compat !== false;
  c.config = c.config || {};
  // pokermon.load_pokemon: ptype / item_req / evo_list live in config.extra.
  if (c.ptype) { if (isTable(c.config.extra)) c.config.extra.ptype = c.ptype; else c.config.extra = { ptype: c.ptype }; }
  if (c.item_req) { if (isTable(c.config.extra)) c.config.extra.item_req = c.item_req; else c.config.extra = { item_req: c.item_req }; }
  if (c.evo_list) { if (isTable(c.config.extra)) c.config.extra.evo_list = c.evo_list; else c.config.extra = { evo_list: c.evo_list }; }
  c.attributes = pokemon_attributes(c); // (load_pokemon: <type>_type, stage_<stage>, pokemon — Steamodded attribute pools)
  if (TO391_HOLD.has(c.key) || !jokerSprite391(item, c)) jokerSprite(item, c);
  laterArt(c);
  to391(c);
  c.set_badges = poke_set_type_badge;
  if (def) {
    Object.assign(c, behaviourOf(def));
    PORTED.jokers.push(c.key);
  } else {
    c.unported = true;
    UNPORTED.jokers.push(c.key);
  }
  // load_pokemon: in_pool = pokemon_in_pool unless the item brings its own (custom_pool_func).
  const own_pool = item.custom_pool_func ? (def && def.in_pool) : undefined;
  if (c.unported) c.in_pool = UNPORTED_POOL;
  else if (item.custom_pool_func) c.in_pool = own_pool;
  else c.in_pool = (self) => pokemon_in_pool(self);
  // Joke content (Billion Lions) only with pokemon_aprilfools.
  if (item.name === 'billion_lions') { const p = c.in_pool; c.in_pool = (self) => !!cfg('pokemon_aprilfools') && (!p || p(self)); }
  return c;
}

/**
 * Add-on API (additive): `pokermon.Pokemon(item, custom_prefix, custom_atlas)` for add-on mods
 * (Nacho's Pokermon Dip, ...). Builds a Pokémon joker center exactly like Pokermon's own —
 * key `j_<prefix>_<name>`, `poke_custom_prefix` (family / evolution / mega keys resolve to the
 * add-on's prefix), ptype / item_req / evo_list in config.extra, type badges, pokemon_in_pool
 * unless custom_pool_func — with the Basic-sheet sprite from PokemonSprites, where the add-on's
 * own `sprites` entries win (its Lua assigns into the shared table). `atlas` (an atlas name the
 * add-on registers) = a custom-atlas Pokémon. `def` is the behaviour (functions + overrides).
 * The add-on registers the returned centers in its own registerMod content (so they carry its
 * mod id: off = gone) and adds its families with `add_family` (systems/evolution.js).
 */
export function addon_pokemon_center(data_item, def, { prefix, file, sprites, atlas } = {}) {
  if (!prefix) throw new Error('addon_pokemon_center: prefix required');
  const item = withStatic(data_item, def);
  const c = stripFns(item);
  c.key = 'j_' + prefix + '_' + (item.key || item.name);
  c.set = 'Joker';
  c.poke_file = file;
  c.poke_custom_prefix = prefix;
  c.rarity = c.rarity ?? 1;
  c.cost = c.cost ?? 3;
  c.blueprint_compat = !!c.blueprint_compat;
  c.perishable_compat = c.perishable_compat !== false;
  c.eternal_compat = c.eternal_compat !== false;
  c.config = c.config || {};
  if (c.ptype) { if (isTable(c.config.extra)) c.config.extra.ptype = c.ptype; else c.config.extra = { ptype: c.ptype }; }
  if (c.item_req) { if (isTable(c.config.extra)) c.config.extra.item_req = c.item_req; else c.config.extra = { item_req: c.item_req }; }
  if (c.evo_list) { if (isTable(c.config.extra)) c.config.extra.evo_list = c.evo_list; else c.config.extra = { evo_list: c.evo_list }; }
  c.attributes = pokemon_attributes(c);
  if (atlas) { c.atlas = atlas; c.poke_custom_atlas = true; } else { jokerSprite(item, c, sprites); c.poke_no_custom_atlas = true; }
  c.set_badges = poke_set_type_badge;
  if (def) Object.assign(c, behaviourOf(def));
  else c.unported = true;
  if (c.unported) c.in_pool = UNPORTED_POOL;
  else if (item.custom_pool_func) c.in_pool = def && def.in_pool;
  else c.in_pool = (self) => pokemon_in_pool(self);
  return c;
}

// ---------------------------------------------------------------- consumables
function consumableCenter(data_item, file) {
  const def = DEFS.consumables[data_item.name];
  const item = withStatic(data_item, def);
  const c = stripFns(item);
  c.key = 'c_poke_' + (item.key || item.name);
  c.consumeable = true;
  c.poke_file = file;
  c.cost = c.cost ?? 3;
  c.config = c.config || {};
  c.atlas = atlasName(item.atlas, 'placeholder_item');
  to391(c);
  if (c.hidden) { c.soul_set = c.soul_set || 'Spectral'; c.soul_rate = c.soul_rate ?? 0.003; }
  if (def) { Object.assign(c, behaviourOf(def)); PORTED.consumables.push(c.key); }
  else { c.unported = true; UNPORTED.consumables.push(c.key); }
  const base_pool = c.unported ? UNPORTED_POOL : c.in_pool;
  // Pokeballs are only registered when the pokeballs option is on (pokermon.lua).
  if (item.pokeball) c.in_pool = (self, a) => !!cfg('pokeballs') && (!base_pool || base_pool(self, a));
  else c.in_pool = base_pool;
  if (c.evo_item && !def) c.in_pool = UNPORTED_POOL;
  return c;
}

function boosterCenter(data_item, file) {
  const def = DEFS.boosters[data_item.key];
  const item = withStatic(data_item, def);
  const c = stripFns(item);
  c.key = 'p_poke_' + item.key;
  c.set = 'Booster';
  c.poke_file = file;
  c.atlas = atlasName(item.atlas, 'placeholder_item');
  c.config = c.config || {};
  if (def) { Object.assign(c, behaviourOf(def)); PORTED.boosters.push(c.key); }
  else { c.unported = true; c.skip_pool = true; UNPORTED.boosters.push(c.key); }
  return c;
}

function simpleCenter(kind, prefix, set, data_item, file) {
  const def = DEFS[kind][data_item.key];
  const item = withStatic(data_item, def);
  const c = stripFns(item);
  c.key = prefix + item.key;
  c.set = set;
  c.poke_file = file;
  c.config = c.config || {};
  if (item.atlas) c.atlas = atlasName(item.atlas, set === 'Back' ? 'placeholder_deck' : 'placeholder_item');
  laterArt(c);
  to391(c);
  if (def) Object.assign(c, behaviourOf(def));
  else { c.unported = true; c.in_pool = UNPORTED_POOL; if (set === 'Enhanced') c.skip_pool = true; UNPORTED[kind].push(c.key); }
  return c;
}

// ----------------------------------------------------------------- assemble
const centers = [];
const dataJokerNames = new Set();
for (const f of DATA.groups.jokers) for (const item of listOf(f)) { dataJokerNames.add(item.name); centers.push(jokerCenter(item, f.file)); }
// Jokers Pokermon 3.9.1 adds (the new-jokers stack, sub-batch 11+: data391.js new_jokers): built from their whole 3.9.1
// static data + the definition in jokers/<file>.js, each inserted after the joker before it in 3.9.1's file order (so
// the pools and the collection follow 3.9.1's order); their 3.9.1 families replace / join the 3.2.1 family table.
for (const [name, { item, file, after }] of Object.entries(D391.new_jokers || {})) {
  dataJokerNames.add(name);
  const c = jokerCenter(item, file);
  const at = centers.findIndex((x) => x.key === 'j_poke_' + after);
  if (at < 0) throw new Error(`pokermon: new joker '${name}' comes after '${after}', which isn't registered`);
  centers.splice(at + 1, 0, c);
}
for (const f of D391.families || []) set_family(f);
// Jokers the 3.2.1 Lua writes but never returns from its file (e.g. Jirachi's copy / negging forms,
// Hisuian Qwilfish / Overqwil) aren't in data.js: a port defines them in full — static fields (pos, config,
// rarity, cost, stage, ptype, gen, atlas as the Lua names it, ...) plus behaviour — and jokerCenter builds
// them exactly like data.js's (withStatic), so their atlas / sprite / config.extra.ptype come out the same way.
for (const [name, def] of Object.entries(DEFS.jokers)) {
  if (dataJokerNames.has(name)) continue;
  if (!def.stage || def.rarity === undefined) throw new Error(`pokermon: joker '${name}' is not in data.js and its definition has no static data (stage/rarity/pos/config)`);
  centers.push(jokerCenter({ name }, def.poke_file));
}
for (const f of DATA.groups.consumables) for (const item of listOf(f)) centers.push(consumableCenter(item, f.file));
// Content 3.9.1 adds that data.js (3.2.1) doesn't have (batch 10: Miracle Seed, Heavy-Duty Boots, the Seed card, the Debris
// deck): its definition carries the whole static data (key, pos, atlas, config, ...) and is built like data.js's, after it.
const dataKeys = (g) => new Set(DATA.groups[g].flatMap((f) => listOf(f).map((it) => it.key || it.name)));
const newDefs = (kind, g) => { const have = dataKeys(g); return Object.entries(DEFS[kind]).filter(([k]) => !have.has(k)).map(([k, def]) => ({ item: { key: def.key || k, name: def.name || k }, file: def.poke_file })); };
for (const { item, file } of newDefs('consumables', 'consumables')) centers.push(consumableCenter(item, file));
for (const f of DATA.groups.boosters) for (const item of listOf(f)) centers.push(boosterCenter(item, f.file));
for (const f of DATA.groups.vouchers) for (const item of listOf(f)) centers.push(simpleCenter('vouchers', 'v_poke_', 'Voucher', item, f.file));
for (const f of DATA.groups.backs) {
  for (const item of listOf(f)) {
    const c = simpleCenter('backs', 'b_poke_', 'Back', item, f.file);
    if (c.name === 'revenanteck') c.name = 'revenantdeck'; // intended-design fix: the Lua's typo
    // backs1.lua registers these only with an option on.
    if (item.key === 'pokemondeck') c.poke_option = 'pokeballs';
    if (item.key === 'obituarydeck' || item.key === 'revenantdeck') c.poke_option = 'pokemon_legacy';
    centers.push(c);
  }
}
for (const { item, file } of newDefs('backs', 'backs')) centers.push(simpleCenter('backs', 'b_poke_', 'Back', item, file));
for (const f of DATA.groups.enhancements) for (const item of listOf(f)) centers.push(simpleCenter('enhancements', 'm_poke_', 'Enhanced', item, f.file));
for (const { item, file } of newDefs('enhancements', 'enhancements')) centers.push(simpleCenter('enhancements', 'm_poke_', 'Enhanced', item, file));
// The Shiny edition (behaviour in systems/shiny.js).
{
  const item = listOf(DATA.groups.editions[0])[0];
  centers.push({ ...stripFns(item), ...shiny_edition, atlas: 'poke_AtlasJokersBasicNatdexShiny391', poke_file: DATA.groups.editions[0].file });
}

const tags = [];
for (const f of DATA.groups.tags) for (const item of listOf(f)) {
  const c = simpleCenter('tags', 'tag_poke_', 'Tag', item, f.file);
  c.name = item.name || c.key;
  tags.push(c);
}
const blinds = [];
// Pokermon 3.9.1 renamed the showdown boss bl_poke_cgoose (Chartreuse Chamber) -> bl_poke_iridescent_hacker (Iridescent
// Hacker, new art + colour; data391.js blinds). Our behaviour (blinds/pokebossblind.js) moves to the new key; the old key
// still resolves (js/mods/aliases.js renamed: stored recipes, stickers and decks read it as the new one).
// (3.9.1 names its consumable sets poke_item / poke_energy: their entries go to our canonical Item / Energy sets)
const LOC_SET = { poke_item: 'Item', poke_energy: 'Energy' };
for (const [k, d] of Object.entries(D391.loc)) {
  if (k === 'dictionary' || k === 'v_dictionary' || k === 'labels') continue;
  const set = LOC_SET[k] || k;
  Object.assign(DATA.loc.descriptions[set] = DATA.loc.descriptions[set] || {}, d);
}
for (const k of ['dictionary', 'v_dictionary', 'labels']) if (D391.loc[k]) { DATA.loc.misc = DATA.loc.misc || {}; DATA.loc.misc[k] = Object.assign(DATA.loc.misc[k] || {}, D391.loc[k]); }
for (const f of DATA.groups.blinds) for (const item0 of listOf(f)) {
  const ren = D391.blinds[item0.key];
  const item = ren ? { ...item0, ...ren } : item0;
  const c = simpleCenter('blinds', 'bl_poke_', 'Blind', item, f.file);
  c.name = item.name || c.key;
  blinds.push(c);
}
const seals = [];
for (const f of DATA.groups.seals) for (const item of listOf(f)) {
  const c = simpleCenter('seals', 'poke_', 'Seal', item, f.file);
  seals.push(c);
}
// (3.9.1's DNA Seal, Deoxys's: new-jokers sub-batch 14; seals/seals1.js carries its static data)
for (const { item, file } of newDefs('seals', 'seals')) seals.push(simpleCenter('seals', 'poke_', 'Seal', item, file));

const stickers = [];
for (const f of DATA.groups.stickers) for (const item of listOf(f)) {
  stickers.push({ ...stripFns(item), atlas: 'poke_AtlasStickersBasic391', label: 'Tera', type: item.key.replace('_sticker', '') });
}
// The Tera stickers' own text: en-us.lua has it commented out (so they showed none); the author's entries were
// {name = "Type", text = {"{X:grass,C:white}Grass{}"}} — restored here, plus the type's tooltip below it.
{
  const OTHER = DATA.loc.descriptions.Other;
  for (const s of stickers) {
    if (OTHER[s.key]) continue;
    const T = s.type[0].toUpperCase() + s.type.slice(1);
    OTHER[s.key] = { name: 'Type', text: ['{X:' + s.type + ',C:white}' + T + '{}'] };
  }
  // The Jirachi tag (tags1.lua: no_collection, no loc entry — it showed its raw key while on the HUD).
  const TAG = (DATA.loc.descriptions.Tag = DATA.loc.descriptions.Tag || {});
  if (!TAG.tag_poke_jirachi_tag) TAG.tag_poke_jirachi_tag = { name: 'Jirachi Tag', text: ["Jirachi grants a wish:", 'opens a free {C:attention}Wish Pack{}', 'when the next Blind is chosen'] };
  // House rule (owner, 2026-10-18): Deino / Zweilous trigger on any hand that CONTAINS a Three of a Kind
  // (Full House, Four / Five of a Kind…), not only an exact one. The behaviour is in pokejokers_22.js deino_calc.
  const JOKER = DATA.loc.descriptions.Joker;
  for (const k of ['j_poke_deino', 'j_poke_zweilous']) {
    const t = JOKER[k] && JOKER[k].text;
    if (t && t[1] === 'is a {C:attention}Three of a Kind{}') t[1] = 'contains a {C:attention}Three of a Kind{}';
  }
}

const consumable_types = [];
for (const f of DATA.groups.consumable_types) for (const item of listOf(f)) {
  const t = stripFns(item);
  consumable_types.push({ ...t, name: (t.loc_txt && t.loc_txt.name) || t.key, collection: t.loc_txt && t.loc_txt.collection });
}

// --------------------------------------------------------------------- hooks
/** Kecleon's update for every Kecleon in the joker row (its type follows the joker to its right). */
// (through its center: the 3.2.1 test fixtures serve an older joker file)
const sync_kecleon = () => { if (G.jokers) for (const c of G.jokers.cards.slice()) { const mc = c.config.center; if (mc.key === 'j_poke_kecleon' && mc.update) mc.update(mc, c); } };
const hooks = {
  init_game_object(GAME) { init_game_object(GAME); RB.init_game_object(GAME); },
  start_run() { install_scry(); },
  // (Nuzlocke / Monotype run badges: systems/runbadges.js)
  blind_on_deck: RB.blind_on_deck,
  new_round: RB.new_round,
  shop_start: RB.shop_start,
  // (Kecleon takes the type of the joker to its right: its Lua update runs every frame; ours also when the joker row changes)
  emplace(area, card, ...rest) { const r = RB.emplace(area, card, ...rest); if (area === G.jokers) sync_kecleon(); return r; },
  reordered(area) { if (area === G.jokers) sync_kecleon(); },
  sell_card: RB.sell_card,
  pool_filter,
  create_card: rules.create_card,
  set_cost: rules.set_cost,
  get_pack: rules.get_pack, // (Drampa: shop packs Jumbo or better)
  find_joker_alias: rules.find_joker_alias,
  straight_min: rules.straight_min,
  poker_hand_cards: rules.poker_hand_cards,
  flush_min: rules.flush_min,
  splash: rules.splash,
  is_face: rules.is_face,
  set_debuff: rules.set_debuff,
  evaluate_round: rules.evaluate_round,
  reset_game_globals: rules.reset_game_globals,
  pack_size: rules.pack_size,
  joker_win_keys: family_win_keys,
  can_reserve: rules.can_reserve,
  calculate: rules.calculate,
  add_to_deck: shiny_hooks.add_to_deck,
  card_removed(card) { const r = shiny_hooks.card_removed(card); if (card.area === G.jokers) G.E_MANAGER.add_event(sync_kecleon); return r; },
  set_edition: shiny_hooks.set_edition,
  end_round: shiny_hooks.end_round,
  edition_weight(w, type) {
    // pokermon.lua: Jirachi's negative_edition_rate raises Negative and takes it back from Polychrome.
    const r = (G.GAME.negative_edition_rate || 1) - 1;
    if (!r) return undefined;
    if (type === 'negative') return w + r * 3;
    if (type === 'polychrome') return Math.max(3, w - r * 3);
    return undefined;
  },
  scoring_areas,
  /** Base-game jokers with a Tera sticker show the type badge + energy tooltip (Lua: take_ownership). */
  describe(card, desc) {
    if (card.config.center.mod || !card.ability || card.ability.set !== 'Joker' || !desc) return;
    const b = type_badge(card);
    if (b && Array.isArray(desc.badges)) desc.badges.push(b);
    // ... and the energy tooltip (type_tooltip), from Pokermon's loc.
    const iq = [];
    type_tooltip(null, iq, card);
    for (const q of iq) {
      const d = DATA.loc.descriptions.Other[q.key];
      if (!d) continue;
      const lines = d.text.map((l) => l.replace(/#(\d+)#/g, (m, n) => String((q.vars || [])[n - 1] ?? '')));
      (desc.info = desc.info || []).push({ key: q.key, name: d.name, lines });
    }
  },
  view_card,
  view(view, cardView) {
    // (face up, as the Lua's copies are: copy_card makes a fresh front-facing card)
    if (G.scry_view && scry_visible()) view.areas.scry = scry_view.cards.map((c) => { const v = cardView(c); delete v.facing; delete v.hl; return v; });
    view.poke = { scry_amount: G.GAME.scry_amount || 0, energies_used: G.GAME.energies_used || 0 };
    view.run_badges = runbadge_view();
  },
};

// ------------------------------------------------------------------- options
const OPT = (def, label) => ({ default: def, label });
export const POKERMON = registerMod({
  id: 'pokermon',
  name: 'Pokermon',
  prefix: 'poke',
  // Pokermon 3.9.1 in batches (PORTING.md "Pokermon 3.9.1 upgrade"): the content is still the 3.2.1 port plus the
  // 3.9.1 static data taken so far (data391.js) + the reworked files (batch 6: pokejokers_01-08) — the other reworks
  // and the new content come in the later batches.
  version: '3.9.1',
  // Our behaviour counter (mods/pins.js): bump it with every change to how Pokermon plays — saved runs and replays
  // recorded on the old rules then warn before they re-simulate. 1 = the 2026-10-18/19 house rules (Deino /
  // Zweilous "contains", Energy + Transformation targeting, Nuzlocke / Monotype). 2 = batch 5, the 3.9.1 data
  // (rarities, costs, compat flags, enhancement gates, 9 config numbers, the cgoose -> iridescent_hacker rename).
  // 3 = batch 6, pokejokers_01-08 on their 3.9.1 behaviour (data391.js reworked: whole config, flags, loc text).
  // 4 = batch 7, pokejokers_09-17 on their 3.9.1 behaviour (Gen-3 starters, Celebi, Jirachi forms, Leafeon / Glaceon...).
  // 5 = batch 8, pokejokers_18-34 + zotherjokers / zmissingno on their 3.9.1 behaviour (Vanillite line, Zorua, Sylveon,
  // Pumpkaboo, Kingambit, Gimmighoul / Gholdengo, Rival, Mystery Egg...; Hazard jokers and Unown Swarm held then).
  // 6 = batch 10, the Hazard layer (run-wide hazard_level, Hazard 1 in 3), the Seed card, Flower X2 (X3 with Shaymin),
  // Miracle Seed, Heavy-Duty Boots, the Debris deck / sleeve; the 16 Hazard / Seed / quantum jokers off hold.
  // 7 = batch 10b, the Unown rework (Unown / Unown Swarm never in a pool, SMODS.destroy_cards, Ruins of Alph's Unown by
  // SMODS.add_card, Unown's 3.9.1 card) and the Wish Pack (3 random unused wishes, no Master Ball; change_form wishes).
  // 8 = new-jokers sub-batch 11: the 26 jokers of 3.9.1's pokejokers_09 / 10 (Wurmple, Seedot, Taillow, Wingull, Ralts, Surskit,
  // Slakoth, Nincada, Makuhita lines, Skitty) join the pools; Wingull's rank / Skitty's type per round; duplicate-rank Straights.
  // 9 = new-jokers sub-batch 12: the 15 jokers of 3.9.1's pokejokers_11 (Delcatty, Sableye, Meditite / Medicham, Plusle, Minun,
  // Volbeat, Illumise, Roselia, Carvanha / Sharpedo, Wailmer / Wailord, Torkoal, Spinda) join the pools; Skitty -> Delcatty (Moon
  // Stone); Minun's $1 shop discount.
  // 10 = new-jokers sub-batch 13: the 19 jokers of 3.9.1's pokejokers_12 (Cacnea / Cacturne, Swablu / Altaria, Zangoose,
  // Seviper, Corphish / Crawdaunt, Baltoy / Claydol, Lileep / Cradily, Anorith / Armaldo, Kecleon, Shuppet / Banette, Tropius,
  // Chimecho) join the pools; Chimecho's free Vouchers; an extinct food joker fires joker_type_destroyed (SMODS.destroy_cards).
  // 11 = new-jokers sub-batch 14: the 14 jokers of 3.9.1's pokejokers_13-16 (Clamperl / Huntail / Gorebyss, Relicanth,
  // Bagon / Shelgon / Salamence, Deoxys, Budew, Roserade, Chingling, Bronzor / Bronzong, Gallade) join the pools; Kirlia -> Gallade
  // (Dawn Stone), Budew -> Roselia -> Roserade (Shiny Stone), Chingling -> Chimecho; the DNA Seal and the Meteorite; Bronzor's
  // card of the round.
  // 12 = new-jokers sub-batch 15: the 18 jokers of 3.9.1's pokejokers_18-32 (Munna / Musharna, the Klink and Axew lines,
  // Bunnelby / Diggersby, Drampa, the Smoliv line, Bramblin / Brambleghast, Rellor / Rabsca) join the pools; Drampa's Jumbo packs;
  // Hisuian Qwilfish draws 3.9.1's card; Steamodded counts every consumable set's usage (Rellor).
  contentRev: 12,
  // Pokermon 3.9.1's Steamodded contexts (setting_ability, money_altered, drawing_cards, scaling_card, ...) and
  // Blind:calculate reach this mod's content (js/engine/smods.js). 3.2.1 content reads none of them: no change.
  smods_seams: true,
  by: 'InertSteak & contributors (rebuilt for Micatro)',
  badge_colour: '#ED533A',
  description: 'Pokémon jokers that evolve, Energy and Item cards, Tera types, Megas and shinies.',
  // Shipped defaults: Pokermon 3.2.0's config.lua (+ previous_evo_stickers, new in 3.2.1).
  options: {
    pokemon_only: OPT(true, 'Pokémon only (no base jokers)'),
    pokeballs: OPT(true, 'Allow Poké Balls'),
    unlimited_energy: OPT(false, 'Unlimited Energy'),
    precise_energy: OPT(true, 'Precise Energy scaling'),
    shiny_playing_cards: OPT(false, 'Shiny on playing cards'),
    hazards_on: OPT(true, 'Hazards allowed'),
    detailed_tooltips: OPT(true, 'Detailed tooltips'),
    previous_evo_stickers: OPT(true, 'Previous-evo stake stickers'),
    gen_oneb: OPT(true, 'Gen 1'),
    gen_two: OPT(true, 'Gen 2'),
    gen_three: OPT(true, 'Gen 3'),
    gen_four: OPT(true, 'Gen 4'),
    gen_five: OPT(true, 'Gen 5'),
    gen_six: OPT(true, 'Gen 6'),
    gen_seven: OPT(true, 'Gen 7'),
    gen_eight: OPT(true, 'Gen 8'),
    gen_nine: OPT(true, 'Gen 9'),
    pokemon_legacy: OPT(false, 'Legacy content'),
    pokemon_aprilfools: OPT(false, 'Joke content'),
  },
  content: {
    centers,
    tags,
    blinds,
    seals,
    stickers,
    consumable_types,
    // Pokermon 3.9.1 renamed its sets Energy -> poke_energy, Item -> poke_item: the old names stay canonical and the new
    // ones resolve to them (create_card, pools, CONSUMABLE_TYPES, loc, and 3.9.1 data whose set is the new name).
    set_aliases: { poke_energy: 'Energy', poke_item: 'Item' },
    attributes: POKE_ATTRIBUTES, // (pokeconstants.lua's SMODS.Attribute list; systems/attributes.js)
    rarities: [
      { key: 'poke_safari', name: 'Safari', weight: 0, badge_colour: '#F2C74E' },
      { key: 'poke_mega', name: 'Mega', weight: 0, badge_colour: '#E8578E' },
    ],
    atlases,
    loc: DATA.loc,
  },
  hooks,
  challenges: CHALLENGES, // (challenges.js: engine/challenge.js plays them)
  sleeves: SLEEVES, // (sleeves.js: deck variants, engine/sleeve.js)
  ui: POKE_UI, // (ui.js: type pills, energy pips, the Pokédex, shaders, animations — micatro/js/ui/modui.js)
});

/** Port status (for tests, the wiki and PORTING.md). */
export const STATUS = { PORTED, UNPORTED, PORTED_FILES, TYPE_COLOURS };
export { evo_item_in_pool };
