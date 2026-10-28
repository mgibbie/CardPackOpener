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
import { debris_hazard_card_limit } from './backs/backs1.js';
import { BLIND_HUD_VARS } from './blinds/pokebossblind.js';
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
import './jokers/zzzapril_fools.js';
import { DESIGN_FAMILIES, DESIGN_LOC, regi_chip_bonus, regi_h_x_mult, regi_enh_vars, slot_cost_removed, drifblim_destroyed } from './jokers/pokejokers_designs.js';

import { poke_set_type_badge, type_badge, type_tooltip, TYPE_COLOURS } from './systems/types.js';
import { pokemon_in_pool, pool_filter, init_game_object, evo_item_in_pool } from './systems/pools.js';
import { shiny_edition, shiny_hooks } from './systems/shiny.js';
import * as rules from './systems/rules.js';
import { install_scry, scoring_areas, scry_view, scry_visible } from './systems/scry.js';
import { view_card, SERIES_A_ANIM } from './systems/anim.js';
import { CHALLENGES } from './challenges.js';
import { SLEEVES } from './sleeves.js';
import { TYPE_SLEEVE_LOC } from './typesleeves.js';
import { POKE_UI } from './ui.js';
import { cfg, hazard_deal_tip } from './systems/utils.js';
import { family_win_keys, set_family } from './systems/evolution.js';
import { runbadge_hooks as RB, runbadge_view } from './systems/runbadges.js';
import { ELITE_STAKE, elite_boss_eligible } from './stakes.js';
import { capture_disc_action, APRIL_FOOLS } from './jokers/zzzapril_fools.js';

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
  // Batch 17 (3.9.1 pokesprites.lua / stakes.lua, vendored in batch 5): the April Fools Miror Budicolo (4-frame animation; the
  // Ludicolo card m_poke_ludicolo uses it too) and Capture Disc, and the Elite stake's chip and win sticker.
  miror_budicolo: ['miror_budicolo.png'],
  miror_budicolo_shiny: ['shiny_miror_budicolo.png'],
  capture_disc: ['capture_disc.png'],
  elite_stake: ['elite_stake.png', 29, 29],
  elite_stake_sticker: ['elite_stake_sticker.png'],
  // The Type Sleeves (typesleeves.js; contentRev 22): one row of 12 sleeve cells in POKETYPES order, composed by
  // tools/micatro/compose_pokermon_type_sleeves.mjs from the Trainer Sleeve's pocket and each type's Energy card (owner rule: no placeholders).
  type_sleeves: ['type_sleeves.png'],
  // Micatro-composed cards (owner rule: no placeholders; 3.9.1 draws placeholder_joker for both): Rage Candy Bar (data391.js
  // sprite_extra) and Repel (never registered upstream), by tools/micatro/compose_pokermon_joker_art.mjs from the Others sheet's
  // white JOKER card and the overworld item icons (PORTING.md "Batch 17").
  rage_candy_bar: ['rage_candy_bar.png'],
  repel: ['repel.png'],
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
/**
 * Pokermon 3.9.1's Series A sheets (the leftovers batch; vendored in batch 5): the alternate art the `series` option shows
 * (cosmetic: ui.js draws it, the engine never sees it). Registered as 'AtlasJokersSeriesA<g>[Shiny]391' like the Basic
 * twins: the three sheets 3.9.1 changed are '<name>-391.png' (Gen01, Gen02, Natdex), Gen03-09 are the same file in 3.2.1 and
 * 3.9.1 (saved once). 3.9.1 has no Series A Others sheet. The five animated alternates (pokesprites.lua ANIMATION_ATLAS:
 * frames / fps: systems/anim.js SERIES_A_ANIM; each a one-row strip, + its Shiny twin) are 'AtlasJokersSeriesA<Name>[Shiny]'.
 */
const SERIES_A_391 = new Set(['Gen01', 'Gen02', 'Natdex']);
for (const g of ['Gen01', 'Gen02', 'Gen03', 'Gen04', 'Gen05', 'Gen06', 'Gen07', 'Gen08', 'Gen09', 'Natdex']) {
  for (const sh of ['', 'Shiny']) ATLAS_FILES['AtlasJokersSeriesA' + g + sh + '391'] = ['Series A/AtlasJokersSeriesA' + g + sh + (SERIES_A_391.has(g) ? '-391' : '') + '.png'];
}
for (const [n, a] of Object.entries(SERIES_A_ANIM)) for (const sh of ['', 'Shiny']) ATLAS_FILES[n + sh] = ['Series A/' + n + sh + '.png', 71, 95, a.frames];
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
  // (the owner's designs carry their 3.9.1 cell themselves: jokers/pokejokers_designs.js poke_sprite391)
  const s = D391.sprites[item.name] || item.poke_sprite391;
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
  // Joke content (zzzapril_fools.lua: Billion Lions, and since batch 17 Spiclops, Miror Budicolo, Capture Disc) only with
  // pokemon_aprilfools: 3.9.1 registers them only then; ours stay registered (collection, saves) and are offered only then.
  if (APRIL_FOOLS.has(item.name)) { const p = c.in_pool; c.in_pool = (self) => !!cfg('pokemon_aprilfools') && (!p || p(self)); c.poke_aprilfools = true; }
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
function consumableCenter(data_item0, file) {
  // Pokermon 3.9.1's spawn fields (batch 17, object_weights: data391.js consumable_spawn): the Soul items' pool weights (Great
  // Ball 3, Leftovers 3, Tera Orb 5, Leek / Thick Club 1); Great Ball and Thick Club no longer hidden; Ultra Ball / Mega Stone soul
  // rates. null = the field is gone (a still-hidden card then takes Steamodded's soul defaults below: Leftovers).
  const sp = D391.consumable_spawn && D391.consumable_spawn[data_item0.name];
  const data_item = sp ? { ...data_item0 } : data_item0;
  if (sp) for (const [k, v] of Object.entries(sp)) { if (v === null) delete data_item[k]; else data_item[k] = v; }
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
  // The Revenant Sleeve's alt (3.9.1, batch 17): Pocket Packs (kind poke_energy = our 'Energy') weigh 0 under object_weights.
  if (c.kind === 'Energy' && !c.get_weight) c.get_weight = (self, w) => ((G.GAME && G.GAME.modifiers && G.GAME.modifiers.poke_no_pocket_packs) ? 0 : w);
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
// A definition with `poke_after` (the owner's designs: jokers/pokejokers_designs.js) goes right after that joker (Pokédex order), else last.
for (const [name, def] of Object.entries(DEFS.jokers)) {
  if (dataJokerNames.has(name)) continue;
  if (!def.stage || def.rarity === undefined) throw new Error(`pokermon: joker '${name}' is not in data.js and its definition has no static data (stage/rarity/pos/config)`);
  const c = jokerCenter({ name }, def.poke_file);
  if (def.poke_after) {
    const at = centers.findIndex((x) => x.key === 'j_poke_' + def.poke_after);
    if (at < 0) throw new Error(`pokermon: joker '${name}' comes after '${def.poke_after}', which isn't registered`);
    centers.splice(at + 1, 0, c);
  } else centers.push(c);
}
for (const f of DESIGN_FAMILIES) set_family(f);
for (const f of DATA.groups.consumables) for (const item of listOf(f)) centers.push(consumableCenter(item, f.file));
// Content 3.9.1 adds that data.js (3.2.1) doesn't have (batch 10: Miracle Seed, Heavy-Duty Boots, the Seed card, the Debris
// deck): its definition carries the whole static data (key, pos, atlas, config, ...) and is built like data.js's, after it.
const dataKeys = (g) => new Set(DATA.groups[g].flatMap((f) => listOf(f).map((it) => it.key || it.name)));
const newDefs = (kind, g) => { const have = dataKeys(g); return Object.entries(DEFS[kind]).filter(([k]) => !have.has(k)).map(([k, def]) => ({ item: { key: def.key || k, name: def.name || k }, file: def.poke_file })); };
for (const { item, file } of newDefs('consumables', 'consumables')) centers.push(consumableCenter(item, file));
for (const f of DATA.groups.boosters) for (const item of listOf(f)) centers.push(boosterCenter(item, f.file));
// (3.9.1's Starter Pack...?: batch 17; boosters/packs1.js carries its static data)
for (const { item, file } of newDefs('boosters', 'boosters')) centers.push(boosterCenter(item, file));
for (const f of DATA.groups.vouchers) for (const item of listOf(f)) centers.push(simpleCenter('vouchers', 'v_poke_', 'Voucher', item, f.file));
for (const f of DATA.groups.backs) {
  for (const item of listOf(f)) {
    const c = simpleCenter('backs', 'b_poke_', 'Back', item, f.file);
    if (c.name === 'revenanteck') c.name = 'revenantdeck'; // intended-design fix: the Lua's typo
    // backs1.lua registers these only with an option on (3.9.1: the legacy decks; the Trainer Deck's pokeballs gate is gone, batch 17).
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
// (3.9.1's Starter Tag...?: batch 17; tags/tags1.js carries its static data)
for (const { item, file } of newDefs('tags', 'tags')) { const c = simpleCenter('tags', 'tag_poke_', 'Tag', item, file); c.name = item.name || c.key; tags.push(c); }
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
// The owner's designs' text (jokers/pokejokers_designs.js DESIGN_LOC)
for (const [set, d] of Object.entries(DESIGN_LOC)) Object.assign(DATA.loc.descriptions[set] = DATA.loc.descriptions[set] || {}, d);
// Nidoran's real names: Pokermon writes "Nidoran F" / "Nidoran M" (Balatro's m6x11 has no gender signs); ours draws ♀ / ♂
// (micatro/assets/fonts/m6x11plus.ttf, tools/micatro/add_gender_glyphs.py). Display text only: the keys stay j_poke_nidoranf / m.
export const GENDER_SIGN_NAMES = { j_poke_nidoranf: 'Nidoran♀', j_poke_nidoranm: 'Nidoran♂' };
for (const [k, name] of Object.entries(GENDER_SIGN_NAMES)) if (DATA.loc.descriptions.Joker[k]) DATA.loc.descriptions.Joker[k] = { ...DATA.loc.descriptions.Joker[k], name };
// The Type Sleeves' text (typesleeves.js: Micatro's own sleeves)
Object.assign(DATA.loc.descriptions.Sleeve = DATA.loc.descriptions.Sleeve || {}, TYPE_SLEEVE_LOC);
for (const k of ['dictionary', 'v_dictionary', 'labels', 'v_text', 'challenge_names']) if (D391.loc[k]) { DATA.loc.misc = DATA.loc.misc || {}; DATA.loc.misc[k] = Object.assign(DATA.loc.misc[k] || {}, D391.loc[k]); }
// The challenges' rule texts (batch 17): 3.9.1 renamed two rule ids but kept their texts' old keys (Safety First's poke_no_energy,
// Randomizer's poke_apply_randomizer); Mystery Dungeon's "Resets at <time>" is the viewer's local time of UTC midnight (3.9.1
// prints os.date("%I:%M %p", 0) when the mod loads; the extract froze the extractor's).
{
  const VT = DATA.loc.misc.v_text = DATA.loc.misc.v_text || {};
  if (VT.ch_c_no_energy && !VT.ch_c_poke_no_energy) VT.ch_c_poke_no_energy = VT.ch_c_no_energy;
  if (VT.ch_c_apply_randomizer && !VT.ch_c_poke_apply_randomizer) VT.ch_c_poke_apply_randomizer = VT.ch_c_apply_randomizer;
  if (VT.ch_c_poke_mystery_dungeon3) {
    let t = null;
    try { t = new Date(0).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch (e) { t = null; }
    if (t) VT.ch_c_poke_mystery_dungeon3 = VT.ch_c_poke_mystery_dungeon3.map((l) => l.replace(/\{C:attention\}[^{]*\{\}/, '{C:attention}' + t + '{}'));
  }
}
for (const f of DATA.groups.blinds) for (const item0 of listOf(f)) {
  const ren = D391.blinds[item0.key];
  const item = ren ? { ...item0, ...ren } : item0;
  const c = simpleCenter('blinds', 'bl_poke_', 'Blind', item, f.file);
  c.name = item.name || c.key;
  blinds.push(c);
}
// 3.9.1's five new boss blinds (batch 17: The Mirror, The Rocket, The Star, Gray Godfather, White Executive): blinds/pokebossblind.js
// carries their static data (3.9.1's order: before the Iridescent Hacker). The renamed boss is not new.
{
  const renamed = new Set(Object.values(D391.blinds).map((r) => r.key));
  const fresh = newDefs('blinds', 'blinds').filter(({ item }) => !renamed.has(item.key));
  const at = blinds.findIndex((b) => b.key === 'bl_poke_iridescent_hacker');
  // (their `name` is the full key, as Steamodded names a mod blind — like the Hacker's; the loc entry has the shown name)
  const made = fresh.map(({ item, file }) => { const c = simpleCenter('blinds', 'bl_poke_', 'Blind', item, file); c.name = c.key; return c; });
  blinds.splice(at < 0 ? blinds.length : at, 0, ...made);
  for (const c of made) if (BLIND_HUD_VARS[c.key]) Object.defineProperty(c, 'vars', { get: () => BLIND_HUD_VARS[c.key](c), enumerable: false });
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
  // House tooltips: how Hazards work (tester reports, 2026-10-26: "Hazards aren't working as intended" — they were; the rules
  // were just never said). Extra info_queue entries beside 3.9.1's own text (systems/utils.js hazard_rules_tip / hazard_deal_tip).
  OTHER.poke_hazard_rules = { name: 'Hazards', text: [
    'Stay in your deck until',
    'destroyed while {C:attention}held{}',
    '{C:inactive}(playing or discarding',
    '{C:inactive}one keeps it)',
    'Take up {C:attention}hand{} slots:',
    '{C:attention}discard{} them to draw',
  ] };
  OTHER.poke_hazard_deal = { name: 'Hazards', text: [
    'At most {C:attention}#1#{} a round',
    '{C:inactive}(the {C:poke_hazard}hazard limit{C:inactive})',
    'Stay in your deck',
    'until destroyed',
    'while {C:attention}held{}',
    'Take up {C:attention}hand{} slots:',
    '{C:attention}discard{} to draw',
  ] };
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
/** Steamodded's localize_perma_bonuses on a playing card: its permanent +Mult, X Mult (contentRev 23: Meowscarada's Lucky cards, Tyranitar)
 *  and "+$N when scored" (Sprigatito / Floragato's Lucky cards, Houndour's discards). Not on Pokermon+'s Heatran-forged cards (their Forged box lists them) nor while debuffed. */
function perma_lines(card) {
  const a = card && card.ability;
  if (!a || !card.base || !card.base.suit || (a.set !== 'Default' && a.set !== 'Enhanced') || card.debuff || a.sonfive_heatran) return [];
  const out = [];
  if (a.perma_mult) out.push('{C:mult}+' + Math.round(a.perma_mult * 1000) / 1000 + '{} extra Mult');
  if (a.perma_x_mult) out.push('{X:mult,C:white}X' + Math.round((1 + a.perma_x_mult) * 1000) / 1000 + '{} Mult');
  if (a.perma_p_dollars) out.push('{C:money}+$' + a.perma_p_dollars + '{} when scored');
  return out;
}
/** Card:get_p_dollars + ability.perma_p_dollars (hook p_dollars; Steamodded's permanent "+$N when scored"). */
export function perma_p_dollars(v, card) {
  const p = card && card.ability && card.ability.perma_p_dollars;
  if (!p || card.debuff) return undefined;
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer || 0) + p;
  G.E_MANAGER.add_event(() => { G.GAME.dollar_buffer = 0; });
  return (v || 0) + p;
}
/** Kecleon's update for every Kecleon in the joker row (its type follows the joker to its right). */
// (through its center: the 3.2.1 test fixtures serve an older joker file)
const sync_kecleon = () => { if (G.jokers) for (const c of G.jokers.cards.slice()) { const mc = c.config.center; if (mc.key === 'j_poke_kecleon' && mc.update) mc.update(mc, c); } };
const hooks = {
  init_game_object(GAME) { init_game_object(GAME); RB.init_game_object(GAME); },
  // The Elite stake's showdown antes (3.9.1 pokermon.lua SMODS.is_showdown_ante: the last 4 antes before the raised win ante).
  boss_eligible: elite_boss_eligible,
  // Capture Disc (3.9.1 April Fools): the board turns a drag of it into this action (its shake distance), so replays hold it.
  action: capture_disc_action,
  start_run() { install_scry(); },
  // (Nuzlocke / Monotype run badges: systems/runbadges.js)
  blind_on_deck: RB.blind_on_deck,
  new_round: RB.new_round,
  draw_from_deck_to_hand: RB.round_begin, // (the round's first deal: the Monotype check, after every blind-select effect)
  shop_start: RB.shop_start,
  // (Kecleon takes the type of the joker to its right: its Lua update runs every frame; ours also when the joker row changes)
  emplace(area, card, ...rest) { const r = RB.emplace(area, card, ...rest); if (area === G.jokers) sync_kecleon(); return r; },
  reordered(area) { if (area === G.jokers) { sync_kecleon(); RB.reordered(); } },
  sell_card(card, ...rest) {
    const r = RB.sell_card(card, ...rest);
    // (the Obituary Sleeve's alt, batch 17: a sold joker makes a Negative Energy of its type; systems/rules.js)
    if (G.GAME && G.GAME.modifiers && G.GAME.modifiers.poke_obituary_alt) rules.obituary_energy(card);
    return r;
  },
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
  // (+ the owner's Purugly: a debuffed one leaving gives its Joker slot back — jokers/pokejokers_designs.js slot_cost_removed)
  card_removed(card) { slot_cost_removed(card); const r = shiny_hooks.card_removed(card); if (card.area === G.jokers) G.E_MANAGER.add_event(sync_kecleon); return r; },
  set_edition: shiny_hooks.set_edition,
  // (the Debris Sleeve's alt on the Debris Deck: a Hazard card holds card_limit +1 — backs/backs1.js)
  set_ability: debris_hazard_card_limit,
  end_round: shiny_hooks.end_round,
  // (the owner's Drifblim, Aftermath: an owned Drifblim being destroyed makes a Negative Spectral — jokers/pokejokers_designs.js)
  start_dissolve: drifblim_destroyed,
  edition_weight(w, type) {
    // pokermon.lua: Jirachi's negative_edition_rate raises Negative and takes it back from Polychrome.
    const r = (G.GAME.negative_edition_rate || 1) - 1;
    if (!r) return undefined;
    if (type === 'negative') return w + r * 3;
    if (type === 'polychrome') return Math.max(3, w - r * 3);
    return undefined;
  },
  scoring_areas,
  // Steamodded's perma_p_dollars (Card:get_p_dollars: + ability.perma_p_dollars; the engine scores perma_mult itself): Sprigatito /
  // Floragato's Lucky cards (jokers/pokejokers_designs.js), Pokermon+'s Heatran-forged cards. (Pokermon+ requires Pokermon: it was
  // that mod's hook until contentRev 20.)
  p_dollars: perma_p_dollars,
  // The owner's Regi trio (jokers/pokejokers_designs.js): Regirock's Stone cards give +100 Chips instead of +50 (a Card:get_chip_bonus
  // wrap); Registeel's held Steel cards X2 instead of X1.5 (Card:get_chip_h_x_mult, so Mime / Red Seal retriggers repeat it). Both only
  // while an undebuffed one is owned: no Regi, no change.
  chip_bonus: regi_chip_bonus,
  chip_h_x_mult: regi_h_x_mult,
  // ... and the Stone / Steel card's own tooltip shows it (+100 Chips / X2, energized too): the same two functions (describe.js enh_live_vars).
  enh_loc_vars: regi_enh_vars,
  /** Base-game jokers with a Tera sticker show the type badge + energy tooltip (Lua: take_ownership). */
  describe(card, desc) {
    // (Steamodded's card_limit tooltip on a playing card: generic_card_limit_pc — the Debris Sleeve alt's Hazard cards)
    const cl = card.ability && card.ability.card_limit;
    if (desc && typeof cl === 'number' && cl !== 0 && (card.ability.set === 'Default' || card.ability.set === 'Enhanced')) {
      (desc.info = desc.info || []).push({ key: 'generic_card_limit_pc', name: 'Hand Size', lines: [(cl > 0 ? '+' : '-') + Math.abs(cl) + ' hand size'] });
    }
    // House: a card showing 3.9.1's Hazard Layer tooltip (every hazard joker, Nacho's Carbink) also gets "Hazards" (how they
    // work, systems/utils.js hazard_deal_tip) — LAST, after 3.9.1's own entries, so it never pushes one of them out of the
    // tooltip (the board shows three; with more it is the one left out).
    if (desc && Array.isArray(desc.info) && desc.info.some((i) => i && i.key === 'hazard_level') && !desc.info.some((i) => i && i.key === 'poke_hazard_deal')) {
      const t = hazard_deal_tip(), d = DATA.loc.descriptions.Other[t.key];
      if (d) desc.info.push({ key: t.key, name: d.name, lines: d.text.map((l) => l.replace(/#(\d+)#/g, (m, n) => String(t.vars[n - 1] ?? ''))) });
    }
    // Steamodded's localize_perma_bonuses on a playing card (perma_lines)
    const pl = perma_lines(card);
    if (desc && Array.isArray(desc.lines) && pl.length) desc.lines.push(...pl);
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
  view_card(card, v) {
    // (the board's playing-card tooltip, ui/markup.js describePlaying: the permanent bonuses as mod_lines)
    const pl = perma_lines(card);
    if (pl.length) v.mod_lines = (v.mod_lines || []).concat(pl);
    return view_card(card, v);
  },
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
  // (Sub-batch 15b took 9 jokers from upstream main, "3.9.1-1016a", but nothing else from it: the version stays the 3.9.1 tag and
  // contentRev counts them. The pin reads "3.9.1 (rev 13)"; PORTING.md "New jokers, sub-batch 15b".)
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
  // 13 = new-jokers sub-batch 15b: 9 jokers upstream added on main after 3.9.1 (InertSteak/Pokermon main @ af0b656, "3.9.1-1016a":
  // Lotad / Lombre / Ludicolo, Mawile, Electrike / Manectric, Cryogonal, Greavard / Houndstone) join the pools; the Lotad line's
  // beat (G.GAME.poke_beat 2 <-> 4 after every hand). `version` stays '3.9.1': only those 9 jokers come from main (PORTING.md).
  // 14 = batch 16, the Megas: 3.9.1's 11 new Megas (Raichu X / Y, Clefable, Victreebel, Starmie, Dragonite, Meganium, Feraligatr,
  // Skarmory, Lucario, Drampa) and their bases' Mega links; the Mega Stone remembers its Mega's card (unique_val) and frees itself
  // when that Mega is gone; Shuckle's Mega Berry Juice; the Mega Deck / Sleeve's Crystal Ball and the sleeve's Mega Deck alt
  // (poke_infinite_megastone).
  // 15 = batch 17, the last of the 3.9.1 upgrade: the non-Pokédex jokers (Rage Candy Bar, Bitter Rival / Champion after the Rival,
  // the Imposter Professor + Starter Pack...? / Tag...?, Daycare, Oologist + the Mystery Egg's hatch speed-ups, Repel), the April
  // Fools jokers behind pokemon_aprilfools (Spiclops, Miror Budicolo + the Ludicolo card, Capture Disc), the 5 boss blinds +
  // 3.9.1's own Iridescent Hacker, the Elite stake, the 5 challenges (+ 3.9.1's changes to the 7 old ones), the Obituary / Revenant
  // sleeves' alts (Pink Seal 1 in 3), the Professors' 3.9.1 pool rule, and Steamodded object_weights on (3.9.1's
  // optional_features: the Soul items' weights, pokermon.modify_pool, the Shiny / Negative weights).
  // 16 = the seals fix (tester Jack: "the Pink and Silver Seals don't work"): Standard Pack cards and Certificate roll their seal
  // from the whole Seal pool like Steamodded's SMODS.poll_seal (the Pink / Silver Seals come up there), and the Silver Seal is on
  // upstream main's refactor ("+1 Item", pokermon.discard_cards: the discard jokers' effects land — Jolteon, Wingull).
  // 17 = the leftovers batch: the Pocket Packs' 3.9.1 contents (create_item(seed): the 'pocket_evo_item' roll, poll_evo_item,
  // soulable Items with key_append 'pocket'; no c_keys) and the Debris Sleeve's alt on the Debris Deck (poke_negative_hazards:
  // every Hazard card is +1 hand size while held). (The Series A art option is cosmetic: no rev.)
  // 18 = the Hazard follow-ups: a Mime / Red Seal retrigger of a held Hazard rolls its destroy again when that card also did
  // something at end of round (Gold via Nacho's Carbink, a Blue Seal's Planet), as Steamodded's calculate_end_of_round_effects
  // (js/engine/smods.js eor_retrigger_seam); + the Hazard tooltips (text only).
  // 19 = the owner's 25 new jokers (Desktop/Pokermon_Joker_Design_Guide.txt section 5; jokers/pokejokers_designs.js): the Shinx,
  // Honedge, Spheal, Grookey (a Grass starter), Kubfu / Urshifu, Tandemaus, Darumaka, Scraggy and Mudbray lines, Xerneas, Spiritomb
  // and Tatsugiri join the pools; Kubfu / Urshifu can't be debuffed, and Single Strike Urshifu keeps playing cards from being debuffed.
  // 20 = the owner's Sprigatito line (Sprigatito -> Floragato -> Meowscarada; jokers/pokejokers_designs.js): a Lucky trigger grows the
  // card (+Mult / +$ when scored, Hiker-style), then held Lucky cards give X Mult like Steel; Sprigatito joins the Grass starters
  // (the Starter Pack); perma_p_dollars is scored by Pokermon's hook (was Pokermon+'s).
  // 21 = the owner's Whismur line (Whismur -> Loudred -> Exploud; jokers/pokejokers_designs.js): each broken Glass card grows its
  // Chips, then Mult, then X Mult (every form keeps the last's), and each evolution creates a Negative Justice; Grookey / Thwackey's
  // on-beat cards give +1 / +2 Mult (Energy now scales them).
  // 22 = the owner's 12 Type Sleeves (typesleeves.js): a Negative Energy of the sleeve's type at the start, and the first 2 shops'
  // initial stock each holds a Joker of that type (the last joker slot; rerolls restock normally).
  // 23 = the owner's Sprigatito rework: Sprigatito / Floragato evolve after 8 / 12 Lucky triggers (each roll that hits counts; the
  // engine's per-card lucky_procs) instead of 5 + 5 rounds, each evolution creates a Negative The Magician, and Meowscarada's Lucky
  // cards permanently gain X0.5 Mult when they trigger (perma_x_mult) instead of the held-Steel X1.25; a card's perma X Mult shows on
  // its tooltip.
  // 24 = the owner's Gulpin line (Gulpin -> Swalot; jokers/pokejokers_designs.js): at end of round each swallows (destroys) a held
  // Hazard, else a held Diamond, for Stockpile (max 3, +1 per Energy: the house energy field `stockpile_max`); scored Diamonds give
  // +2 Mult per Stockpile; Gulpin evolves at 3; Swalot's swallowed Diamond pays its rank in $ and it gives X0.1 Mult per card the
  // deck is below its starting size. A Hazard swallowed this way doesn't roll its own destroy too (enhancement1.js).
  // 25 = the owner's Trapinch line (Trapinch -> Vibrava -> Flygon; jokers/pokejokers_designs.js): Sand Pit — every card the player
  // discards banks +2 (Vibrava +3) Chips on the joker, evolving after 40 then 60 more discarded cards; Vibrava +1 discard; Flygon
  // keeps the bank and gives X1 + 0.25 per discard used this round (Sandstorm).
  // 26 = the owner's Spoink line (Spoink -> Grumpig; jokers/pokejokers_designs.js): Pearl — at end of round a random unsealed held
  // card gains a Pink Seal; Spoink banks X0.1 per Pink Seal trigger, evolving after 8; Grumpig makes Pink Seals trigger on every hand
  // (seals/seals1.js) and banks X0.15 per hand one triggers in (Black Pearl: X0.3 when one had no room for its Energy).
  // 27 = the owner's Castform (jokers/pokejokers_designs.js): Forecast — on the round's first deal the suit held most picks Sunny (Fire;
  // scored Hearts / Diamonds +4 Mult), Rainy (Water; scored Clubs +30 Chips, the first retriggers), Snowy (Water; held Spades X1.1) or,
  // on a tie, Normal (Colorless; +10 Mult) for the round; Monotype leaves it out (systems/runbadges.js poke_mono_exempt).
  // 28 = the owner's Barboach line (Barboach -> Whiscash; jokers/pokejokers_designs.js): Muddy Water — +12 / +20 Chips for each Water or
  // Earth Joker, itself included (is_type: Tera stickers and Castform's form count; a dual-type joker once; debuffed ones don't);
  // Whiscash's Earthquake: with 2+ OTHER Water / Earth Jokers, the round's first hand retriggers every scored card.
  // 29 = the owner's Lunatone + Solrock (jokers/pokejokers_designs.js), a pair: day hands (each round's 1st / 3rd / 5th) and night
  // hands (2nd / 4th); Solrock +100 Chips by day, Lunatone X2 by night; Cosmic Power (holding both, undebuffed): each covers the other
  // half at half strength (+50 Chips by night, X1.5 by day).
  // 30 = the owner's types follow their card art (owner rule: the type shown on the card wins; tools/micatro/pokermon_art_type.mjs):
  // Urshifu Single Strike Fighting -> Dark, Rapid Strike Fighting -> Water (upstream 3.9.1's two Urshifu cards draw those icons).
  // 31 = the owner's Regi trio (Regirock / Regice / Registeel, Legendary; jokers/pokejokers_designs.js): Stone cards +100 Chips instead
  // of +50 and +10 permanent Chips per score; Glass cards never shatter; held Steel X2 instead of X1.5 (hooks chip_bonus / chip_h_x_mult);
  // each converts 1 + (other Regi species held) random deck cards to its enhancement when a Blind is selected.
  // 32 = the owner's Starly line (Starly -> Staravia -> Staraptor; jokers/pokejokers_designs.js): Flock — +2 / +4 Mult for each Colorless
  // Joker, itself included (is_type: Tera stickers and Castform's Normal form count; debuffed ones don't); Staraptor's Brave Bird
  // X(1 + 0.5 per Colorless Joker) with Recoil: each hand played loses $1 (never past the debt limit).
  // 33 = the owner's Gen 3 Legendaries (jokers/pokejokers_designs.js): Kyogre (+1 hand, scored Clubs retrigger, Castform Rainy), Groudon
  // (+1 discard, scored Hearts / Diamonds X1.25, Castform Sunny) and their Primal Clash (both held, no Rayquaza: the suits held on the
  // first deal pick one for the round); Rayquaza (Delta Stream: both work; Dragon Ascent X0.2 per Straight / Flush); Latias / Latios
  // (X0.15 per Tarot / Planet used; Soul Dew: both held, either grows both).
  // 34 = the owner's Chatot + Pachirisu (jokers/pokejokers_designs.js): Chatot's Vocabulary, +4 Mult per different poker hand played
  // this run, and New Word, a Planet for each hand type's first play this run while held; Pachirisu's Quick Spark, X2 (+X0.25 per other
  // Lightning Joker) on each round's first hand, and Cheek Pouch, $1 per Lightning Joker at end of round.
  // 35 = the owner's Glameow line (Glameow -> Purugly; jokers/pokejokers_designs.js): Fickle — a favourite suit picked when obtained and
  // each end of round (seeded, never the same twice running); scored cards of it +5 Mult / X1.25 each; Purugly's Thick Fat: -1 Joker
  // slot while held (refunded when sold / destroyed; a Negative nets 0); Glameow waits to evolve until a Joker slot is free.
  // 36 = the owner's Drifloon line (Drifloon -> Drifblim; jokers/pokejokers_designs.js): Stockpile — +1 per player discard action, max 3
  // (Drifblim 5; +1 per Energy: Gulpin's `stockpile_max`); Spit Up — the round's final hand X(1 + 0.5 per Stockpile), then it resets;
  // Drifloon evolves after 4 Spit Ups; Drifblim's Aftermath: sold or destroyed (hooks.start_dissolve), a Negative Spectral card.
  // 37 = the owner's Burmy line (Burmy -> Wormadam (Female) / Mothim (Male); jokers/pokejokers_designs.js): Cloak — at end of round
  // Burmy wears the cloak of the deck's most common enhancement (Plant / Sandy / Trash: Grass +5 Mult / Earth +40 Chips / Metal $1),
  // its type and card following; a seeded gender; Wormadam keeps the cloak for good, Mothim X(1 + 0.25 per different enhancement).
  // 38 = the owner's Combee line (Combee -> Vespiquen; jokers/pokejokers_designs.js): Honey Gather — at end of round the Jokers directly
  // left and right gain +$1 / +$2 sell value; Vespiquen's Attack Order X(1 + 0.1 per $ of those two Jokers' sell value), max X3.
  // 39 = the owner's Cherubi line (Cherubi -> Cherrim; jokers/pokejokers_designs.js): Sweet Seeds — a random unenhanced deck card becomes
  // a Seed when a Blind is selected, +1 growth level (Seeds bloom in 3 scores); Cherubi evolves after 2 blooms; Cherrim's Flower Gift
  // (Flowers need 3+ suits) and Sunshine Form (Flowers X2.5 instead of X2 while sunny: a red first deal, or Groudon held).
  // 40 = the owner's Shellos line (Shellos -> Gastrodon; jokers/pokejokers_designs.js): a sea (West / East) rolled once per card,
  // its art following; Tide Pool +40 Chips on the sea's end scored card (leftmost / rightmost); Gastrodon's Tide retriggers it, Storm
  // Drain X0.1 per Energy card used (X0.2 Water); Two Seas: a West and an East held, every one works on both ends.
  contentRev: 40,
  // Pokermon 3.9.1 pokermon.lua: SMODS.current_mod.optional_features = {quantum_enhancements = true, object_weights = true}.
  // object_weights sends create_card's key, the shop roll, tags, packs, bosses and vouchers through SMODS.poll_object
  // (js/engine/smods.js; batch 17). quantum_enhancements is the engine's check_enhancement, always on.
  optional_features: { object_weights: true },
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
    hazards_on: OPT(true, 'Hazard Pokémon in shop'), // (3.9.1's "Hazards allowed": only a pool filter — owned ones still deal)
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
    // 3.9.1's sprite series (config.lua pokemon_spritesheet_atlas, a per-profile setting): Series A = the alternate art, animated
    // where upstream animates it (ui.js). COSMETIC: each viewer's own choice (their saved mod options), never part of a run —
    // the engine, the recipe, replays and checksums don't see it (js/mods/registry.js). Basic by default: nothing changes.
    series: { default: 'basic', label: 'Joker art', type: 'choice', cosmetic: true, choices: [{ value: 'basic', label: 'Basic' }, { value: 'seriesa', label: 'Series A' }] },
  },
  content: {
    centers,
    tags,
    blinds,
    stakes: [ELITE_STAKE],
    seals,
    stickers,
    consumable_types,
    // Pokermon 3.9.1 renamed its sets Energy -> poke_energy, Item -> poke_item: the old names stay canonical and the new
    // ones resolve to them (create_card, pools, CONSUMABLE_TYPES, loc, and 3.9.1 data whose set is the new name).
    set_aliases: { poke_energy: 'Energy', poke_item: 'Item' },
    attributes: POKE_ATTRIBUTES, // (pokeconstants.lua's SMODS.Attribute list; systems/attributes.js)
    // 3.9.1 pokesprites.lua pokermon.colours + its loc_colour hook: {C:poke_<name>} / {X:poke_<name>} in the text are these
    // colours (the Hazard layer's bronze {C:poke_hazard}, the Pink Seal's {C:poke_pink}, the types' {X:poke_grass}...). Cosmetic.
    loc_colours: {
      poke_dark: '#0086a5', poke_lightning: '#f8f800', poke_fire: '#f81020', poke_water: '#38b8f8', poke_earth: '#e97333',
      poke_fairy: '#ff3db6', poke_fighting: '#b85838', poke_colorless: '#c8c0f8', poke_psychic: '#c135ff', poke_metal: '#888080',
      poke_grass: '#289830', poke_dragon: '#c8a800', poke_bird: '#f7b58c', poke_pink: '#ff7abf', poke_pocket: '#e8c069',
      poke_hazard: '#ba7333', poke_sun: '#f48e62', poke_rain: '#6169ff', poke_sand: '#e1c019', poke_snow: '#82c8e8',
    },
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
