/**
 * Pokermon 3.2.1 (InertSteak & contributors), rebuilt natively for Micatro.
 *
 * No Steamodded layer: content is built from the mod's own static data (data.js, extracted
 * from its Lua) merged with behaviour ported to JS (jokers/, consumables/, boosters/, via
 * defs.js), and Pokermon's rule changes are Micatro engine hooks (systems/). Toggleable per
 * run like every Micatro mod: off = gone.
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
import { G } from '../../js/engine/core.js';
import DATA from './data.js';
import { DEFS, PORTED_FILES } from './defs.js';

// Behaviour (each file registers through defs.js on import).
import './jokers/pokejokers_01.js';
import './backs/backs1.js';
import './blinds/pokebossblind.js';
import './consumables/mart3.js';
import './consumables/martz.js';
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
import { cfg } from './systems/utils.js';

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
  unergy: ['unergy.png'],
  unitem: ['unitem.png'],
  j_poke_unown_swarm: ['j_poke_unown_swarm.png', 290, 285],
  j_poke_unown_swarm_shiny: ['j_poke_unown_swarm_shiny.png', 290, 285],
  j_poke_unown_swarm_soul: ['j_poke_unown_swarm_soul.png', 290, 285],
  j_poke_unown_swarm_shiny_soul: ['j_poke_unown_swarm_shiny_soul.png', 290, 285],
};
for (const g of ['Gen01', 'Gen02', 'Gen03', 'Gen04', 'Gen05', 'Gen06', 'Gen07', 'Gen08', 'Gen09', 'Natdex', 'Others']) {
  ATLAS_FILES['AtlasJokersBasic' + g] = ['Basic Series/AtlasJokersBasic' + g + '.png'];
  ATLAS_FILES['AtlasJokersBasic' + g + 'Shiny'] = ['Basic Series/AtlasJokersBasic' + g + 'Shiny.png'];
}
const atlases = {};
for (const [name, [path, px = 71, py = 95, frames]] of Object.entries(ATLAS_FILES)) {
  atlases['poke_' + name] = { src: art(path), px, py, ...(frames ? { frames } : {}) };
}
/** A data atlas name -> the registered (prefixed) atlas, or a placeholder. */
const atlasName = (a, fallback = 'placeholder_joker') => ('poke_' + (ATLAS_FILES[a] ? a : fallback));

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
const behaviourOf = (def) => {
  const out = {};
  for (const [k, v] of Object.entries(def || {})) if (k !== 'poke_file') out[k] = v;
  return out;
};
const SPRITES = DATA.globals.PokemonSprites;

/** pokespriteload.lua poke_load_atlas + poke_load_sprites (Basic sheet, base art). */
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

// -------------------------------------------------------------------- jokers
function jokerCenter(item, file) {
  const def = DEFS.jokers[item.name];
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
  jokerSprite(item, c);
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
export function addon_pokemon_center(item, def, { prefix, file, sprites, atlas } = {}) {
  if (!prefix) throw new Error('addon_pokemon_center: prefix required');
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
function consumableCenter(item, file) {
  const def = DEFS.consumables[item.name];
  const c = stripFns(item);
  c.key = 'c_poke_' + (item.key || item.name);
  c.consumeable = true;
  c.poke_file = file;
  c.cost = c.cost ?? 3;
  c.config = c.config || {};
  c.atlas = atlasName(item.atlas, 'placeholder_item');
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

function boosterCenter(item, file) {
  const def = DEFS.boosters[item.key];
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

function simpleCenter(kind, prefix, set, item, file) {
  const def = DEFS[kind][item.key];
  const c = stripFns(item);
  c.key = prefix + item.key;
  c.set = set;
  c.poke_file = file;
  c.config = c.config || {};
  if (item.atlas) c.atlas = atlasName(item.atlas, set === 'Back' ? 'placeholder_deck' : 'placeholder_item');
  if (def) Object.assign(c, behaviourOf(def));
  else { c.unported = true; c.in_pool = UNPORTED_POOL; if (set === 'Enhanced') c.skip_pool = true; UNPORTED[kind].push(c.key); }
  return c;
}

// ----------------------------------------------------------------- assemble
const centers = [];
const dataJokerNames = new Set();
for (const f of DATA.groups.jokers) for (const item of listOf(f)) { dataJokerNames.add(item.name); centers.push(jokerCenter(item, f.file)); }
// Jokers the 3.2.1 Lua writes but never returns from its file (e.g. Jirachi's copy / negging forms,
// Hisuian Qwilfish / Overqwil) aren't in data.js: a port may define them in full — static fields
// (name, pos, config, rarity, cost, stage, ptype, gen, atlas, ...) plus behaviour.
for (const [name, def] of Object.entries(DEFS.jokers)) {
  if (dataJokerNames.has(name)) continue;
  if (!def.stage || def.rarity === undefined) throw new Error(`pokermon: joker '${name}' is not in data.js and its definition has no static data (stage/rarity/pos/config)`);
  const item = { name, ...Object.fromEntries(Object.entries(def).filter(([, v]) => typeof v !== 'function')) };
  item.config = item.config ? JSON.parse(JSON.stringify(item.config)) : {};
  centers.push(jokerCenter(item, def.poke_file));
}
for (const f of DATA.groups.consumables) for (const item of listOf(f)) centers.push(consumableCenter(item, f.file));
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
for (const f of DATA.groups.enhancements) for (const item of listOf(f)) centers.push(simpleCenter('enhancements', 'm_poke_', 'Enhanced', item, f.file));
// The Shiny edition (behaviour in systems/shiny.js).
{
  const item = listOf(DATA.groups.editions[0])[0];
  centers.push({ ...stripFns(item), ...shiny_edition, atlas: 'poke_AtlasJokersBasicNatdexShiny', poke_file: DATA.groups.editions[0].file });
}

const tags = [];
for (const f of DATA.groups.tags) for (const item of listOf(f)) {
  const c = simpleCenter('tags', 'tag_poke_', 'Tag', item, f.file);
  c.name = item.name || c.key;
  tags.push(c);
}
const blinds = [];
for (const f of DATA.groups.blinds) for (const item of listOf(f)) {
  const c = simpleCenter('blinds', 'bl_poke_', 'Blind', item, f.file);
  c.name = item.name || c.key;
  blinds.push(c);
}
const seals = [];
for (const f of DATA.groups.seals) for (const item of listOf(f)) {
  const c = simpleCenter('seals', 'poke_', 'Seal', item, f.file);
  seals.push(c);
}

const stickers = [];
for (const f of DATA.groups.stickers) for (const item of listOf(f)) {
  stickers.push({ ...stripFns(item), atlas: 'poke_AtlasStickersBasic', label: 'Tera', type: item.key.replace('_sticker', '') });
}

const consumable_types = [];
for (const f of DATA.groups.consumable_types) for (const item of listOf(f)) {
  const t = stripFns(item);
  consumable_types.push({ ...t, name: (t.loc_txt && t.loc_txt.name) || t.key, collection: t.loc_txt && t.loc_txt.collection });
}

// --------------------------------------------------------------------- hooks
const hooks = {
  init_game_object,
  start_run() { install_scry(); },
  pool_filter,
  create_card: rules.create_card,
  set_cost: rules.set_cost,
  find_joker_alias: rules.find_joker_alias,
  straight_min: rules.straight_min,
  flush_min: rules.flush_min,
  splash: rules.splash,
  is_face: rules.is_face,
  set_debuff: rules.set_debuff,
  evaluate_round: rules.evaluate_round,
  reset_game_globals: rules.reset_game_globals,
  pack_size: rules.pack_size,
  can_reserve: rules.can_reserve,
  calculate: rules.calculate,
  add_to_deck: shiny_hooks.add_to_deck,
  card_removed: shiny_hooks.card_removed,
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
    if (G.scry_view && scry_visible()) view.areas.scry = scry_view.cards.map((c) => cardView(c));
    view.poke = { scry_amount: G.GAME.scry_amount || 0, energies_used: G.GAME.energies_used || 0 };
  },
};

// ------------------------------------------------------------------- options
const OPT = (def, label) => ({ default: def, label });
export const POKERMON = registerMod({
  id: 'pokermon',
  name: 'Pokermon',
  prefix: 'poke',
  version: '3.2.1',
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
    rarities: [
      { key: 'poke_safari', name: 'Safari', weight: 0, badge_colour: '#F2C74E' },
      { key: 'poke_mega', name: 'Mega', weight: 0, badge_colour: '#E8578E' },
    ],
    atlases,
    loc: DATA.loc,
  },
  hooks,
});

/** Port status (for tests, the wiki and PORTING.md). */
export const STATUS = { PORTED, UNPORTED, PORTED_FILES, TYPE_COLOURS };
export { evo_item_in_pool };
