// Micatro mod system — native content packs, toggled per run.
//
// A mod is a plain ES module that calls registerMod({...}). It contributes
// content (centers: jokers, consumables, boosters, vouchers, decks, ...; tags,
// blinds, seals, stakes, rarities, consumable types, ...) whose behaviour is
// ordinary JS functions, plus named engine HOOKS (see HOOKS below) for the
// places where a mod changes base-game rules.
//
// All mods' content is registered up front (so the wiki/news/describe can see
// it), but only the mods ACTIVE for the current run contribute to pools and
// hooks — "off" means gone. The active set is part of the run recipe, so
// saves, replays and spectators load exactly the same mods.

import {
  G, P_CENTERS, P_TAGS, P_BLINDS, P_SEALS, P_STAKES, rebuildPools,
} from '../engine/core.js';

/** Every registered mod, by id. */
export const MODS = {};
/** Ids active for the current run (in load order). */
export let ACTIVE = [];
const activeSet = new Set();

/** Extra consumable sets added by mods: {key, shop_rate, rate_key, default, primary_colour, ...}. */
export const CONSUMABLE_TYPES = {};
/** Extra joker rarities: {key, weight, badge_colour, name}. */
export const RARITIES = {};
/** Atlases: name -> {src, px, py, frames?} (px/py = 1x cell size; assets are 2x). */
export const ATLASES = {};
/** Mod localization: set -> key -> {name, text:[...]} merged from all mods. */
export const MOD_LOC = { descriptions: {}, misc: { dictionary: {}, labels: {} } };

/**
 * Hook names the engine calls. Each active mod may provide a function per hook;
 * see callHook / reduceHook for how results combine. Keep this list in sync
 * with the call sites (grep `callHook(` / `reduceHook(`).
 */
export const HOOKS = [
  'init_game_object',   // (GAME) after a fresh game object is built
  'start_run',          // () after the deck is built, before blind select
  'pool_filter',        // (center, _type, _append) -> false to exclude from a pool
  'create_card',        // (card, _type, area, key_append) after a card is created
  'set_cost',           // (card) after Card:set_cost
  'find_joker_alias',   // (name) -> [cards] extra cards that count as `name`
  'is_face',            // (card, base) -> true/false/undefined override
  'splash',             // (scoring_hand, full_hand) -> true if every played card scores
  // (card, should_debuff) Steamodded's mod.set_debuff: `true` debuffs, 'prevent_debuff'
  // forces the card undebuffed (even a spent Perishable), anything else = no opinion.
  // Runs before the vanilla rules, like SMODS.
  'set_debuff',
  'calculate',          // (context) mod-level calculate (fires alongside jokers in calculate_context)
  'end_round',          // () end of round, after the end_of_round joker pass, before round eval
  'evaluate_round',     // (rows) -> extra cash-out rows (rows so far are passed in)
  'cash_out',           // (dollars) -> dollars
  'new_round',          // () setting a blind
  'shop_start',         // () shop opened
  'booster_open',       // (card) a booster was opened
  'booster_limit',      // (n) -> n shop booster slots (n already includes G.GAME.modifiers.extra_boosters)
  'pack_choices',       // (card, n) -> n picks for this booster
  'pack_size',          // (card, n) -> n cards in this booster
  'level_up_hand',      // (card, hand, amount) -> false to block
  'debuff_hand',        // (cards, hand, handname) -> true/false/undefined
  'card_removed',       // (card) Card:remove is about to take the card out of the game (area still set)
  'add_to_deck',        // (card, from_debuff) Card:add_to_deck ran (after the center's own add_to_deck)
  'empty_pool_default', // (key, _type) -> fallback center key for an empty pool
  'straight_min',       // (n, hand) -> min cards for a straight (vanilla 5, Four Fingers 4)
  'flush_min',          // (n, hand) -> min cards for a flush
  'flush_suits',        // (suits, hand) -> suits a flush can be made of
  'reset_game_globals', // (initial) per-round resets (vanilla: idol/mail/ancient/castle cards)
  'set_edition',        // (card, edition_key) -> false to refuse an edition (e.g. no shiny playing cards)
  'edition_weight',     // (weight, type) -> weight of an edition in the weighted (mod-edition) poll
  'scoring_areas',      // () -> [area] extra card areas scored like held cards (Pokermon's scry view)
  'can_reserve',        // (card) -> true if a pack card may be saved to the consumable slots ('reserve' action)
  'describe',           // (card, desc) adjust a live card's description (badges/info) — vanilla cards too
  'view_card',          // (card, v) add mod fields to a card's view-model entry
  'view',               // (view) add mod fields to the run view (e.g. view.areas.scry)
  'boss_eligible',      // (eligible, blind, ante) -> true/false overrides whether a boss can be drawn (get_new_boss)
  'hand_highlighted',   // () the player's hand selection changed (CardArea:parse_highlighted)
  'pack_card',          // (booster, i) -> a Card to use as card i of a base-game booster (else the vanilla roll)
  'fill_shop_jokers',   // () -> true when the mod stocked a new shop's joker slots itself
  'forced_selection',   // (card) Cerulean Bell just forced this hand card into the selection
  'remove_from_deck',   // (card, from_debuff) Card:remove_from_deck is running (added_to_deck just cleared; before the center's own)
  'end_of_round_effect', // (card, ret) a held card's get_end_of_round_effect (not debuffed), before it returns ret
  'hand_scored',        // (hand_chips, mult, ctx) end of evaluate_play (also for a debuffed hand: 0, 0)
  'is_suit',            // (card, suit, bypass_debuff, flush_calc) -> true: the card also counts as `suit` (after the debuff/Stone/Wild checks, before Smeared)
  'poll_edition',       // (key, mod, no_neg, guaranteed) -> edition table or null: replaces poll_edition (undefined = no opinion)
  'calculate_joker',    // (card, context) -> an effect (or null = none) that REPLACES card:calculate_joker (runs before the debuff check, like a Lua wrap); undefined = no opinion
  'copy_card',          // (new_card, other) copy_card just built new_card from other
  'emplace',            // (area, card, location, stay_flipped) CardArea:emplace just placed the card
  'edition_nil',        // (card) Card:set_edition was called with nil (Lua `edition == nil`; copy_card passes {})
  'wheel_failed',       // (used_tarot) The Wheel of Fortune said "Nope!"
  'booster_loc_vars',   // (vars, center) -> [choose, size] shown in a booster's description
];

/**
 * Stickers registered by mods (Pokermon's Tera type stickers): key -> {key, badge_colour,
 * atlas, pos, label?}. A sticker is an `ability[key]` flag on a card; the engine never
 * reads it — the owning mod's rules do — so this table is for badges and art only.
 */
export const STICKERS = {};

export function registerMod(mod) {
  if (!mod || !mod.id) throw new Error('registerMod: missing id');
  const prefix = mod.prefix || mod.id;
  mod.prefix = prefix;
  mod.requires = mod.requires || [];
  mod.optional = mod.optional || [];
  mod.hooks = mod.hooks || {};
  mod.options = mod.options || {};
  mod.content = mod.content || {};
  const C = mod.content;
  const own = (o) => { o.mod = mod.id; return o; };
  // Centers: jokers/consumables/boosters/vouchers/backs/enhancements/editions/...
  for (const c of C.centers || []) {
    if (!c.key) throw new Error(`${mod.id}: center without key`);
    if (P_CENTERS[c.key] && !P_CENTERS[c.key].mod) throw new Error(`${mod.id}: ${c.key} collides with a base center`);
    own(c);
    c.config = c.config || {};
    c.unlocked = true; c.discovered = true;
    if (c.order === undefined) c.order = 10000 + Object.keys(P_CENTERS).length;
    P_CENTERS[c.key] = c;
  }
  for (const t of C.tags || []) { own(t); t.order = t.order ?? 1000 + Object.keys(P_TAGS).length; P_TAGS[t.key] = t; }
  for (const b of C.blinds || []) { own(b); b.order = b.order ?? 1000 + Object.keys(P_BLINDS).length; P_BLINDS[b.key] = b; }
  for (const s of C.seals || []) { own(s); s.order = s.order ?? 100 + Object.keys(P_SEALS).length; P_SEALS[s.key] = s; }
  for (const s of C.stakes || []) { own(s); P_STAKES[s.key] = s; }
  for (const t of C.consumable_types || []) {
    own(t);
    t.rate_key = t.rate_key || t.key.toLowerCase() + '_rate';
    CONSUMABLE_TYPES[t.key] = t;
  }
  for (const r of C.rarities || []) { own(r); RARITIES[r.key] = r; }
  for (const s of C.stickers || []) { own(s); STICKERS[s.key] = s; }
  for (const [name, a] of Object.entries(C.atlases || {})) ATLASES[name] = { ...a, mod: mod.id };
  if (C.loc) {
    for (const [set, entries] of Object.entries(C.loc.descriptions || {})) {
      MOD_LOC.descriptions[set] = MOD_LOC.descriptions[set] || {};
      Object.assign(MOD_LOC.descriptions[set], entries);
    }
    for (const [k, v] of Object.entries((C.loc.misc || {}))) {
      MOD_LOC.misc[k] = MOD_LOC.misc[k] || {};
      Object.assign(MOD_LOC.misc[k], v);
    }
  }
  MODS[mod.id] = mod;
  return mod;
}

/** Ids plus everything they require, in dependency order. Unknown ids are dropped. */
export function resolveMods(ids) {
  const out = [];
  const visit = (id, stack = []) => {
    const m = MODS[id];
    if (!m || out.includes(id) || stack.includes(id)) return;
    for (const r of m.requires) visit(r, [...stack, id]);
    out.push(id);
  };
  for (const id of ids || []) visit(id);
  return out;
}

export function isActive(id) { return activeSet.has(id); }
export function activeMods() { return ACTIVE.map((id) => MODS[id]); }

/** Is this center/tag/blind/... available in the current run? Base content always is. */
export function centerActive(c) {
  if (!c || !c.mod) return true;
  if (!activeSet.has(c.mod)) return false;
  // A center may need one of its mod's options (`mod_option`, e.g. Nacho's per-line toggles):
  // off = gone, exactly like an inactive mod.
  if (c.mod_option && !(modOptions[c.mod] && modOptions[c.mod][c.mod_option])) return false;
  return true;
}

/**
 * Activate a set of mods for a new run (called by newRun before anything
 * else touches pools). Rebuilds the center pools so inactive mods vanish.
 */
export function activateMods(ids, options = {}) {
  ACTIVE = resolveMods(ids);
  activeSet.clear();
  for (const id of ACTIVE) activeSet.add(id);
  modOptions = {};
  for (const id of ACTIVE) {
    const m = MODS[id];
    const defaults = {};
    for (const [k, o] of Object.entries(m.options)) defaults[k] = o.default;
    modOptions[id] = { ...defaults, ...(options[id] || {}) };
  }
  rebuildPools(centerActive);
  return ACTIVE;
}
let modOptions = {};
/** Option value for an active mod (its declared default if unset). */
export function opt(modId, key) { return modOptions[modId] ? modOptions[modId][key] : undefined; }
export function allOptions() { return JSON.parse(JSON.stringify(modOptions)); }

/** Call `name` on every active mod; returns the array of non-undefined results. */
export function callHook(name, ...args) {
  if (!ACTIVE.length) return [];
  const out = [];
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(...args); if (r !== undefined) out.push(r); }
  }
  return out;
}
/** Thread a value through every active mod's `name` hook: v = hook(v, ...args) ?? v. */
export function reduceHook(name, value, ...args) {
  if (!ACTIVE.length) return value;
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(value, ...args); if (r !== undefined) value = r; }
  }
  return value;
}
/** First non-undefined answer from an active mod's `name` hook (overrides). */
export function firstHook(name, ...args) {
  if (!ACTIVE.length) return undefined;
  for (const id of ACTIVE) {
    const f = MODS[id].hooks[name];
    if (f) { const r = f(...args); if (r !== undefined) return r; }
  }
  return undefined;
}

/** Active consumable types (for shop rates / pools). */
export function activeConsumableTypes() {
  return Object.values(CONSUMABLE_TYPES).filter((t) => activeSet.has(t.mod));
}

/** True when any active mod defines `name` (lets the engine skip work for vanilla runs). */
export function hasHook(name) {
  for (const id of ACTIVE) if (MODS[id].hooks[name]) return true;
  return false;
}

/** Mod editions (centers with set 'Edition' from an active mod), in registration order. */
let _edCache = null, _edFor = null;
export function activeModEditions() {
  if (!ACTIVE.length) return [];
  if (_edFor !== ACTIVE) {
    _edCache = [];
    for (const c of Object.values(P_CENTERS)) if (c.set === 'Edition' && c.mod && activeSet.has(c.mod)) _edCache.push(c);
    _edFor = ACTIVE;
  }
  return _edCache;
}

/** Manifest of every mod the site ships (id -> loader), see ./index.js. */
export { G };
