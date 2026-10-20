// Steamodded APIs that Pokermon 3.9.1 uses and Micatro didn't have (the Pokermon 3.9.1 upgrade's batch 4,
// "engine seams"; plan: Plans/MICATRO_MODS_UPGRADES.md §3). Ported from Steamodded/smods 5b8a087
// (26.1018.0~dev-b; Pokermon 3.9.1 needs >= 26.829.0):
//   - opt-in calculate contexts (the new SMODS contexts below), dispatched by `calculate_seam`;
//   - SMODS.scale_card / SMODS.reset_card (+ the scaling_card / resetting_card contexts)      — src/utils.lua;
//   - SMODS.Attribute: get_attribute_pool / has_attribute / add_attribute                    — src/game_objects/attributes.lua;
//   - SMODS.poll_object (+ create_poll_pool, cull_pool, modify_weights, poll_object_type, create_shop_card) and the
//     `object_weights` optional feature's routes                                               — src/utils/weights.lua, lovely/weights.toml.
//
// ZERO behaviour change for content that doesn't use them: the new contexts reach only mods that opt in with
// `registerMod({smods_seams: true})` (mods ported before these seams — Bunco, MoreFluff, AutumnCircus — emulate some of
// them, e.g. stay_flipped / debuff_card, in their own way, and must not get them twice). Within an opted-in mod a
// context is only fired when its code reads it (`wanted(name)`: `.<name>` is read in a center's / blind's / seal's
// `calculate` or the mod's `hooks.calculate`, or the object lists it in `smods_contexts: [...] | '*'`), and then only
// to those listeners. Blind:calculate only runs for an opted-in mod's blind. The object_weights routes run only while an
// active mod declares `optional_features: {object_weights: true}`. With no mods on, every entry point returns at once.
// core.js imports this module (and this one core.js): nothing here may touch an import at load time.
import {
  G, P_CENTERS, P_TAGS, P_BLINDS, P_SEALS, P_STAKES, P_CARDS, pseudorandom, pseudoseed, localize,
  card_eval_status_text, get_current_pool, has_quantum_enhancement, level_up_hand, mod_effect_tail, find_joker,
  mod_card_calculate, set_poll_allow_duplicates, quantum_enhancements,
} from './core.js';
import { ACTIVE as ACTIVE_MODS, MODS, RARITIES, CONSUMABLE_TYPES, ATTRIBUTES, centerActive, feature, registryVersion, callHook, firstHook } from '../mods/registry.js';

/**
 * Run state the seams read (run.js fills STATES at load: core.js can't import run.js). ante_end: set while the beaten
 * boss's ease_ante(1) runs (SMODS.ante_end); money_from_cashout: set while cash_out pays (SMODS.money_from_cashout).
 */
export const SEAM_STATE = {
  STATES: null, ante_end: undefined, money_from_cashout: undefined,
  is(name) { return !!(this.STATES && G.STATE === this.STATES[name]); },
  /** G.STATE is the shop or an open booster (SMODS: SHOP / SMODS_BOOSTER_OPENED). */
  in_pack_or_shop() {
    const S = this.STATES;
    return !!S && [S.SHOP, S.TAROT_PACK, S.PLANET_PACK, S.SPECTRAL_PACK, S.STANDARD_PACK, S.BUFFOON_PACK, S.MOD_PACK, S.MOD_PACK_HAND].includes(G.STATE);
  },
};

// Lua `a or b` (only nil / false fall through; 0 and '' are truthy in Lua).
const lor = (a, b) => (a === undefined || a === null || a === false ? b : a);
const truthy = (v) => v !== undefined && v !== null && v !== false;

// ============================================================ opt-in calculate contexts
/**
 * The Steamodded contexts this module adds (Pokermon 3.9.1 uses them; 3.2.1 didn't). press_play, debuff_hand
 * (blind) and the vanilla contexts already fire everywhere; `debuff_hand` here is the SMODS joker context.
 */
export const SEAM_CONTEXTS = [
  'setting_ability', 'modify_scoring_hand', 'money_altered', 'ante_change', 'modify_ante', 'modify_booster_card',
  'drawing_cards', 'debuff_card', 'debuff_hand', 'stay_flipped', 'modify_hand', 'ending_booster',
  'modify_final_cashout', 'poker_hand_changed', 'playing_card_end_of_round', 'scaling_card', 'resetting_card',
  'modify_weights', 'create_shop_card', 'modify_shop_card', 'create_booster_card',
];
const FN_MENTIONS = new WeakMap(); // function -> Set of SEAM_CONTEXTS names its source mentions
function mentions(fn) {
  let s = FN_MENTIONS.get(fn);
  if (!s) {
    s = new Set();
    const src = String(fn);
    // a property read (`context.money_altered`, `ctx.drawing_cards`), not a call (`G.GAME.blind.debuff_card(card)`)
    for (const n of SEAM_CONTEXTS) if (src.includes(n) && new RegExp('\\.\\s*' + n + '\\b(?!\\s*\\()').test(src)) s.add(n);
    FN_MENTIONS.set(fn, s);
  }
  return s;
}
/** Has this mod opted in to the Steamodded seam contexts (`registerMod({smods_seams: true})`)? */
export const seam_mod = (id) => !!(id && MODS[id] && MODS[id].smods_seams);
/**
 * Does this object's `fn` (its calculate) listen to context `name`? Its mod must have opted in; then
 * `smods_contexts: [...]` (that list only) or `'*'` (every seam context) declares it outright, else its source is read.
 */
export function listens(obj, fn, name, modId) {
  if (typeof fn !== 'function' || !seam_mod(modId || (obj && obj.mod))) return false;
  const d = obj && obj.smods_contexts;
  if (d === '*') return true;
  if (Array.isArray(d)) return d.includes(name);
  return mentions(fn).has(name);
}
let wantFor = null, wantVer = -1, want = new Set();
/** True when some active mod listens to the seam context `name` (false with no mods on: the caller skips all work). */
export function wanted(name) {
  if (!ACTIVE_MODS.length) return false;
  if (wantFor !== ACTIVE_MODS || wantVer !== registryVersion()) {
    want = new Set();
    const add = (obj, fn) => {
      if (typeof fn !== 'function') return;
      const d = obj && obj.smods_contexts;
      if (d === '*') for (const n of SEAM_CONTEXTS) want.add(n);
      else if (Array.isArray(d)) for (const n of d) want.add(n);
      else for (const n of mentions(fn)) want.add(n);
    };
    for (const t of [P_CENTERS, P_BLINDS, P_SEALS]) for (const o of Object.values(t)) if (o.mod && o.calculate && seam_mod(o.mod) && centerActive(o)) add(o, o.calculate);
    for (const id of ACTIVE_MODS) { const m = MODS[id]; if (m.smods_seams && m.hooks && m.hooks.calculate) add(m, m.hooks.calculate); }
    wantFor = ACTIVE_MODS; wantVer = registryVersion();
  }
  return want.has(name);
}

/** SMODS.calculate_effect's display for an effect table outside the scoring loops: popup, level_up, func, extra, dollars. */
export function calculate_effect(eff, card, context) {
  if (!eff || typeof eff !== 'object') return;
  if (card) {
    if (eff.message) card_eval_status_text(eff.message_card || card, 'extra', null, null, null, eff);
    if (eff.level_up) {
      const h = eff.level_up_hand || (context && context.scoring_name);
      if (h && G.GAME.hands[h]) level_up_hand(eff.card || card, h, null, eff.level_up === true ? 1 : eff.level_up);
    }
    if (!eff._mod) Object.defineProperty(eff, '_mod', { value: true, enumerable: false, configurable: true });
    mod_effect_tail(card, eff, { dollars: true });
  } else if (typeof eff.func === 'function') eff.func();
}

// Effect keys Steamodded returns as flags (SMODS.calculate_individual_effect's key / amount return flags).
const FLAG_KEYS = ['debuff', 'debuff_text', 'prevent_debuff', 'add_to_hand', 'remove_from_hand', 'return_to_hand',
  'stay_flipped', 'prevent_stay_flipped', 'prevent_trigger', 'cards_to_draw', 'modify', 'override', 'shop_create_flags',
  'booster_create_flags', 'override_value', 'override_scalar_value', 'override_scalar', 'override_reset_value',
  'override_message', 'post', 'remove', 'no_destroy'];

/** SMODS.update_context_flags (+ _scaling_resetting): a listener's flags feed the next listener's context. */
function update_context_flags(context, flags, src) {
  if (flags.cards_to_draw) context.amount = flags.cards_to_draw;
  if (truthy(flags.modify)) {
    if (context.modify_ante !== undefined) context.modify_ante = flags.modify;
    if (context.drawing_cards) context.amount = Math.max(flags.modify, 0);
    if (context.modify_final_cashout) {
      // (Lua: amount = modify + (not override and amount)); each `modify` also pays its own cash-out row
      (flags.cashout_rows = flags.cashout_rows || []).push({ dollars: flags.modify, card: src });
      context.amount = flags.modify + (flags.override ? 0 : context.amount);
      flags.modify = undefined;
    }
  }
  if (context.scaling_card || context.resetting_card) {
    const bo = context.block_overrides || {};
    if (context.scaling_card) {
      if (!bo.value && truthy(flags.override_value)) {
        if (typeof flags.override_value === 'object') { context.value = lor(flags.override_value.value, context.value); calculate_effect(flags.override_value, src); }
        else context.value = flags.override_value;
      }
      const os = lor(flags.override_scalar_value, flags.override_scalar);
      if (!bo.scalar && truthy(os)) {
        if (typeof os === 'object') { context.scalar = lor(os.value, context.scalar); calculate_effect(os, src); }
        else context.scalar = os;
      }
      if (!bo.message && truthy(flags.override_message)) context.scaling_message = merge_defaults(flags.override_message, context.scaling_message);
    }
    if (context.resetting_card) {
      const ov = lor(flags.override_value, flags.override_reset_value);
      if (!bo.value && truthy(ov)) {
        if (typeof ov === 'object') { context.reset_value = ov.value; calculate_effect(ov, src); }
        else context.reset_value = ov;
      }
      if (!bo.message && truthy(flags.override_message)) context.reset_message = merge_defaults(flags.override_message, context.reset_message);
    }
    if (truthy(flags.post)) { flags.post.source = src; (flags.post_effects = flags.post_effects || []).push(flags.post); }
    flags.override_value = flags.override_scalar = flags.override_scalar_value = flags.override_reset_value = flags.override_message = flags.post = undefined;
  }
}

/**
 * SMODS.calculate_context for a seam context: the active jokers and consumables whose center listens to `name`
 * (a debuffed one only when `context.ignore_debuff`), the blind on deck if its prototype's `calculate` listens,
 * then every active mod's `hooks.calculate` that listens. Each effect shows like SMODS.calculate_effect; the
 * flags (debuff / prevent_debuff / add_to_hand / modify / cards_to_draw / override_* / ...) merge last-wins and
 * update the context between listeners, like Steamodded. `opts.cards` = the cards to ask instead of the joker
 * and consumable rows; `opts.self_card` = also evaluate this playing card's mod enhancement / seal (Blind:stay_flipped).
 * Returns the flags (with `.effects`: [[card|blind|null, effect]...]).
 */
export function calculate_seam(context, name, opts = {}) {
  const flags = { effects: [] };
  if (!wanted(name)) return flags;
  const take = (src, eff, card) => {
    if (!eff || typeof eff !== 'object') return;
    flags.effects.push([src, eff]);
    for (const k of FLAG_KEYS) if (truthy(eff[k])) flags[k] = eff[k];
    if (truthy(eff.debuff)) flags.debuff_source = card || src;
    calculate_effect(eff, card, context);
    update_context_flags(context, flags, card || src);
  };
  const cards = opts.cards || [...((G.jokers && G.jokers.cards) || []), ...((G.consumeables && G.consumeables.cards) || [])];
  for (const c of cards.slice()) {
    const mc = c.config.center;
    if (!mc.mod || !listens(mc, mc.calculate, name)) continue;
    let eff;
    if (c.debuff) {
      if (!context.ignore_debuff) continue;
      if (mc.update) mc.update(mc, c);
      eff = mc.calculate(mc, c, context);
    } else eff = c.calculate_joker(context);
    take(c, eff, c);
  }
  if (opts.self_card) {
    const sc = opts.self_card;
    const ec = sc.config.center, sl = sc.seal && P_SEALS[sc.seal];
    if ((ec.mod && listens(ec, ec.calculate, name)) || (sl && sl.mod && listens(sl, sl.calculate, name))) {
      const r = mod_card_calculate(sc, context);
      if (r) { take(sc, r.enhancement, sc); take(sc, r.seal, sc); }
    }
  }
  const b = G.GAME && G.GAME.blind;
  const bp = b && b.config && b.config.blind;
  if (bp && bp.mod && centerActive(bp) && listens(bp, bp.calculate, name)) take(b, bp.calculate(bp, b, context), null);
  for (const id of ACTIVE_MODS) {
    const m = MODS[id];
    const f = m.hooks && m.hooks.calculate;
    if (f && listens(m, f, name, id)) take(null, f(context), null);
  }
  return flags;
}

/**
 * Steamodded's mod-level calculate (SMODS.current_mod.calculate) for a VANILLA context: SMODS calls it in every
 * calculate_context, after the cards. The engine's hooks.calculate only gets the SMODS-only contexts (run.js
 * calculate_context), so a vanilla context listed here reaches an opted-in mod's hooks.calculate only when its source reads
 * `.<name>` (Pokermon 3.9.1 cycles the Poliwag line's suit at `context.after`). Effects show like calculate_effect.
 */
// (individual: each scored card in play, after the jokers' individual effects, once per repetition; end_of_round: the
// main end_of_round pass, after the jokers / consumables / blind - Pokermon 3.9.1's Leafeon Lucky-trigger counter;
// first_hand_drawn: after the jokers' and the blind's - Pokermon 3.9.1's Hazard layer deals its Hazard cards then.)
export const MOD_VANILLA_CONTEXTS = ['after', 'individual', 'end_of_round', 'first_hand_drawn'];
const MOD_READS = new WeakMap();
export function mod_calculate(context, name) {
  if (!ACTIVE_MODS.length) return;
  for (const id of ACTIVE_MODS) {
    const m = MODS[id];
    const f = m.smods_seams && m.hooks && m.hooks.calculate;
    if (typeof f !== 'function') continue;
    let r = MOD_READS.get(f);
    if (!r) { const src = String(f); r = new Set(MOD_VANILLA_CONTEXTS.filter((n) => new RegExp('\\.\\s*' + n + '\\b(?!\\s*\\()').test(src))); MOD_READS.set(f, r); }
    if (!r.has(name)) continue;
    const eff = f(context);
    if (eff && typeof eff === 'object') calculate_effect(eff, null, context);
  }
}

/**
 * Steamodded's quantum enhancements calculate AS those enhancements (SMODS.calculate_quantum_enhancements: the card is
 * evaluated once more per extra enhancement). core.js already scores a quantum enhancement's config numbers; this runs a
 * quantum MOD enhancement's own `calculate` on the held-card end_of_round pass (run.js end_round) — Pokermon 3.9.1's Mega
 * Steelix makes Stone cards also Hazard cards, so a held Stone card rolls Hazard's 1 in 3 end-of-round destroy.
 * Only an enhancement of a mod that opted in (`smods_seams`) is run, and only while such a mod is active: with no
 * opted-in mod (vanilla, Bunco, MoreFluff, ...) this returns before asking anything. The context gains
 * `extra_enhancement` (the key), as SMODS sets it. The card's own enhancement is never its own quantum (core.js).
 */
export function quantum_mod_calculate(card, context) {
  if (!ACTIVE_MODS.length || !card || card.debuff || card.removed || !ACTIVE_MODS.some((id) => seam_mod(id))) return;
  for (const k of quantum_enhancements(card)) {
    const qc = P_CENTERS[k];
    if (!qc || !qc.mod || typeof qc.calculate !== 'function' || !seam_mod(qc.mod) || !centerActive(qc)) continue;
    qc.calculate(qc, card, { ...context, extra_enhancement: k });
  }
}

/**
 * Steamodded Blind:calculate for the vanilla contexts: the blind on deck's prototype `calculate(self, blind, context)`
 * (SMODS.Blind calculate — Pokermon 3.9.1's boss blinds), called even while disabled (the blind checks
 * blind.disabled itself), like SMODS. -> its effect (shown like calculate_effect, no card), or undefined.
 * A no-op unless the blind is a mod blind with a calculate.
 */
export function blind_calculate(context) {
  const b = G.GAME && G.GAME.blind;
  const bp = b && b.config && b.config.blind;
  if (!bp || !bp.mod || typeof bp.calculate !== 'function' || !seam_mod(bp.mod) || !centerActive(bp)) return undefined;
  const eff = bp.calculate(bp, b, context);
  if (eff && typeof eff === 'object') calculate_effect(eff, null, context);
  return eff;
}

/**
 * Steamodded's modify_scoring_hand pass (evaluate_play and Blind:debuff_hand): every played card is asked as
 * `other_card`; an add_to_hand answer makes it score, remove_from_hand stops it. `scoring` = the cards that score
 * already (Splash / Stone / always_scores included). -> the final scoring hand, in `cards` order.
 */
export function modify_scoring_hand(cards, scoring, in_scoring) {
  const out = [];
  for (const c of cards) {
    let splashed = scoring.includes(c), unsplashed = false;
    const flags = calculate_seam({ modify_scoring_hand: true, other_card: c, full_hand: cards, scoring_hand: scoring, in_scoring: in_scoring || undefined, ignore_other_debuff: true }, 'modify_scoring_hand');
    if (flags.add_to_hand) splashed = true;
    if (flags.remove_from_hand) unsplashed = true;
    if (splashed && !unsplashed) out.push(c);
  }
  return out;
}

/** SMODS.merge_defaults(t, defaults): t's missing keys from defaults (t may be undefined). */
export function merge_defaults(t, defaults) {
  if (t === false || defaults === false) return false;
  if (defaults === undefined || defaults === null) return t;
  if (t === undefined || t === null) t = {};
  for (const [k, v] of Object.entries(defaults)) if (t[k] === undefined || t[k] === null) t[k] = v;
  return t;
}

// ============================================================ SMODS.scale_card / SMODS.reset_card
export function additive_scaling(ref_table, ref_value, initial, modifier) { ref_table[ref_value] = initial + modifier; }
export function multiplicative_scaling(ref_table, ref_value, initial, modifier) { ref_table[ref_value] = initial * modifier; }

/**
 * SMODS.scale_card(card, {ref_table?, ref_value, scalar_table?, scalar_value?, scalar_factor?, operation?: '+'|'X'|'-'|fn,
 * block_overrides?, scaling_message?, message_key?, message_colour?, message_delay?, no_message?}) -> [new value, change].
 * Tells listeners (context.scaling_card: override_value / override_scalar / override_message / post) the card is
 * scaling, applies the operation, then shows the message (default "Upgrade!" in FILTER; message_key 'a_xmult' shows
 * the new value, other keys the change). As in Steamodded, a missing scalar_value writes `SMODS_scalar_<ref_value> = 1`
 * into the scalar table. Lua returns two values: here an array (`scale_card(...)[0]` is Lua's first).
 */
export function scale_card(card, args) {
  if (!G.deck) return undefined;
  if (!args.operation) args.operation = '+';
  args.block_overrides = args.block_overrides || {};
  args.ref_table = args.ref_table || card.ability.extra;
  args.scalar_table = args.scalar_table || args.ref_table;
  if (!args.scalar_value) {
    args.scalar_value = 'SMODS_scalar_' + args.ref_value;
    args.scalar_table[args.scalar_value] = 1;
  }
  args.scalar_factor = lor(args.scalar_factor, 1);
  args.scaling_card = true;
  args.card = card;
  args.value = args.ref_table[args.ref_value];
  args.scalar = args.scalar_table[args.scalar_value];
  if (args.operation === '-' && args.scalar < 0) args.scalar = -args.scalar;

  const flags = calculate_seam(args, 'scaling_card');
  const value = args.value, change = args.scalar * args.scalar_factor;

  if (typeof args.operation === 'function') args.operation(args.ref_table, args.ref_value, value, change);
  else if (args.operation === 'X') multiplicative_scaling(args.ref_table, args.ref_value, value, change);
  else if (args.operation === '-') additive_scaling(args.ref_table, args.ref_value, value, -change);
  else additive_scaling(args.ref_table, args.ref_value, value, change);

  args.scaling_message = merge_defaults(args.scaling_message, {
    message: localize(args.message_key ? { type: 'variable', key: args.message_key, vars: [args.message_key === 'a_xmult' ? args.ref_table[args.ref_value] : change] } : 'k_upgrade_ex'),
    colour: args.message_colour || 'FILTER',
    delay: args.message_delay,
  });
  if (args.scaling_message && Object.keys(args.scaling_message).length && !args.no_message) calculate_effect(args.scaling_message, card);
  for (const ret of flags.post_effects || []) calculate_effect(ret, ret.source);
  return [args.ref_table[args.ref_value], change];
}

/**
 * SMODS.reset_card(card, {ref_table?, ref_value, reset_value = 0, operation?: fn, block_overrides?, reset_message?,
 * message_key?, message_colour?, message_delay?, no_message?}): the resetting_card context, then the reset and its
 * message (default "Reset" in FILTER).
 */
export function reset_card(card, args) {
  if (!G.deck) return;
  args.block_overrides = args.block_overrides || {};
  args.ref_table = args.ref_table || card.ability.extra;
  args.initial_value = args.ref_table[args.ref_value];
  args.reset_value = lor(args.reset_value, 0);
  args.resetting_card = true;
  args.card = card;
  const flags = calculate_seam(args, 'resetting_card');
  if (typeof args.operation === 'function') args.operation(args.ref_table, args.ref_value, args.initial_value, args.reset_value);
  else args.ref_table[args.ref_value] = args.reset_value;
  args.reset_message = merge_defaults(args.reset_message, {
    message: localize(args.message_key || 'k_reset'),
    colour: args.message_colour || 'FILTER',
    delay: args.message_delay,
  });
  if (args.reset_message && Object.keys(args.reset_message).length && !args.no_message) calculate_effect(args.reset_message, card);
  for (const ret of flags.post_effects || []) calculate_effect(ret, ret.source);
}

// ============================================================ SMODS.Attribute
// The attribute table lives in the registry (ATTRIBUTES: Steamodded's built-ins + mods' content.attributes).
// Objects get attributes two ways, as in Steamodded: the attribute lists them (`keys`), or the object lists the
// attribute (`attributes: [...]` on a center / tag / blind / seal / stake). Aliases work both ways (SMODS
// post_inject_class). Pools only hold objects that exist in this run (base content + active mods).
const TABLES = () => [P_CENTERS, P_TAGS, P_BLINDS, P_SEALS, P_STAKES];
const objectOf = (key) => { for (const t of TABLES()) if (t[key]) return t[key]; return undefined; };
/** SMODS.merge_lists: the union of lists (first occurrence order). */
export function merge_lists(lists) {
  const out = [], seen = new Set();
  for (const li of lists) for (const v of li || []) if (!seen.has(v)) { seen.add(v); out.push(v); }
  return out;
}
/** SMODS.intersect_lists (as written: only the last adjacent pair counts for more than two lists). */
export function intersect_lists(lists) {
  const find = (l1, l2) => {
    const seen = new Map(), ret = [];
    for (const v of l1) seen.set(v, (seen.get(v) || 0) + 1);
    for (const v of l2) if (seen.get(v) > 0) { ret.push(v); seen.set(v, seen.get(v) - 1); }
    return ret;
  };
  let output = [];
  for (let i = 0; i < lists.length - 1; i++) output = find(lists[i], lists[i + 1]);
  return output;
}
function aliasesOf(key) {
  const a = ATTRIBUTES[key];
  if (!a) return [];
  const out = [...(a.alias || [])];
  for (const o of Object.values(ATTRIBUTES)) if (o.alias && o.alias.includes(key) && !out.includes(o.key) && ATTRIBUTES[o.key]) out.push(o.key);
  return out.filter((k) => ATTRIBUTES[k]);
}
let poolCache = new Map(), poolFor = null, poolVer = -1;
/** The object keys that carry this attribute directly (declared by the attribute, then by the objects; this run's content). */
function ownKeys(attribute) {
  if (poolFor !== ACTIVE_MODS || poolVer !== registryVersion()) { poolCache = new Map(); poolFor = ACTIVE_MODS; poolVer = registryVersion(); }
  let out = poolCache.get(attribute);
  if (out) return out;
  const a = ATTRIBUTES[attribute];
  out = [];
  if (a) {
    const seen = new Set();
    const push = (k) => { if (seen.has(k)) return; const o = objectOf(k); if (o && !centerActive(o)) return; seen.add(k); out.push(k); };
    for (const k of a.keys || []) push(k);
    for (const t of TABLES()) for (const [k, o] of Object.entries(t)) if (Array.isArray(o.attributes) && o.attributes.includes(attribute)) push(k);
  }
  poolCache.set(attribute, out);
  return out;
}
/** SMODS.get_attribute_pool(attribute): the keys with this attribute or one of its aliases (recursively). */
export function get_attribute_pool(attribute, seen) {
  const att = ATTRIBUTES[attribute];
  let out = ownKeys(attribute);
  seen = seen || new Set();
  const al = att ? aliasesOf(attribute) : [];
  if (!seen.has(attribute) && al.length) {
    seen.add(attribute);
    for (const alias of al) out = merge_lists([out, get_attribute_pool(alias, seen)]);
  }
  return out.slice();
}
/** SMODS.add_attribute(attribute_key, object_keys). */
export function add_attribute(attribute_key, object_keys) {
  const a = ATTRIBUTES[attribute_key];
  if (!a) throw new Error('SMODS.add_attribute called with invalid attribute_key ' + attribute_key);
  a.keys = merge_lists([a.keys || [], object_keys]);
  poolVer = -1;
}
const objHas = (obj, a) => (Array.isArray(obj.attributes) && obj.attributes.includes(a)) || (ATTRIBUTES[a] && (ATTRIBUTES[a].keys || []).includes(obj.key));
/** SMODS.has_attribute(obj, attribute): obj (a center / tag / blind / seal prototype) has it or one of its aliases. */
export function has_attribute(obj, attribute) {
  if (!obj || !ATTRIBUTES[attribute]) return false;
  if (objHas(obj, attribute)) return true;
  for (const al of aliasesOf(attribute)) if (objHas(obj, al)) return true;
  return false;
}
/** Card:has_attribute / Blind:has_attribute / Tag:has_attribute. */
export function card_has_attribute(thing, attribute) {
  if (!thing) return false;
  if (thing.config && thing.config.center) return has_attribute(thing.config.center, attribute);
  if (thing.config && thing.config.blind) return has_attribute(thing.config.blind, attribute);
  if (thing.key && P_TAGS[thing.key]) return has_attribute(P_TAGS[thing.key], attribute);
  return has_attribute(thing, attribute);
}

// ============================================================ SMODS.poll_object
export const BASE_RATE_PERCENTAGE = { Enhanced: 0.40, Seal: 0.02, Edition: 0.04 };
export const NO_REPOLL = { Edition: true };
export const GAME_TABLE_FROM_TYPE = { 1: 'P_CENTERS', Seal: 'P_SEALS', Tag: 'P_TAGS', Blind: 'P_BLINDS', Card: 'P_CARDS', Stake: 'P_STAKES' };
const GAME_TABLES = () => ({ P_CENTERS, P_SEALS, P_TAGS, P_BLINDS, P_CARDS, P_STAKES });
export const POLL_KEYS = { Edition: { str: 'edition_generic', block_infill: true }, Seal: { str: 'stdseal', ante: true }, Enhanced: { str: 'Enhanced', ante: true } };
/** SMODS.get_poll_key(type, infill). */
export function get_poll_key(type, infill) {
  const t = POLL_KEYS[type] || { str: 'std_smods_poll', ante: true };
  return t.str + (t.block_infill ? '' : lor(infill, '')) + (t.ante ? G.GAME.round_resets.ante : '');
}
// Steamodded's take_ownership weights for the vanilla editions (the only vanilla objects with get_weight).
const VANILLA_EDITION_WEIGHTS = {
  e_foil: { weight: 20, get: (w) => G.GAME.edition_rate * w },
  e_holo: { weight: 14, get: (w) => G.GAME.edition_rate * w },
  e_polychrome: { weight: 3, get: (w) => (G.GAME.edition_rate - 1) * 3 + G.GAME.edition_rate * w },
  e_negative: { weight: 3, get: (w) => w },
};
/** SMODS.get_weight_of_object(obj, opt_weight, args) -> [weight, modified weight]; boosters x10. Mod objects' get_weight(self, w, args). */
export function get_weight_of_object(obj, opt_weight, args) {
  if (!obj) return [10, 10];
  const ve = !obj.mod && VANILLA_EDITION_WEIGHTS[obj.key];
  let w = lor(opt_weight, lor(obj.weight, ve ? ve.weight : 10));
  let m;
  if (!truthy(opt_weight) && ve) m = ve.get(w);
  else if (!truthy(opt_weight) && typeof obj.get_weight === 'function') m = lor(obj.get_weight(obj, w, args), w);
  else m = w;
  if (obj.set === 'Booster') { w = w * 10; m = m * 10; }
  return [w, m];
}
/** SMODS.select_by_weight(pool, poll, low, high) — 1-based indexes, like the Lua. */
export function select_by_weight(pool, poll, low, high) {
  while (high - low > 1) {
    const check = Math.floor((low + high) / 2);
    if (poll < pool[check - 1].mod_weight) high = check; else low = check;
  }
  return high;
}
/** SMODS.size_of_pool(pool): entries that aren't 'UNAVAILABLE'. */
export const size_of_pool = (pool) => pool.filter((v) => v !== 'UNAVAILABLE').length;

/** SMODS.add_to_pool(prototype, args): its in_pool (true when it has none). */
const add_to_pool = (v, args) => (typeof v.in_pool === 'function' ? v.in_pool(v, args) : true);
const enhancement_gate_ok = (gate) => (G.playing_cards || []).some((vv) => vv.config.center.key === gate || has_quantum_enhancement(vv, gate));

/** SMODS.cull_pool(pool, args): keys that may spawn now (others -> 'UNAVAILABLE'; unknown keys dropped). */
export function cull_pool(pool, args) {
  const final_pool = [];
  const _rarity = args.rarity && args.rarity !== true ? args.rarity : false;
  let typeset = null;
  if (args.types) { typeset = {}; for (const v of args.types) typeset[v] = true; }
  const showman = find_joker('Showman').length > 0 || (ACTIVE_MODS.length > 0 && callHook('pool_duplicates', args.type).includes(true));
  for (const key of pool) {
    let add;
    let v = P_CENTERS[key];
    if (v) {
      if (v.mod && !centerActive(v)) { final_pool.push('UNAVAILABLE'); continue; }
      const in_pool = add_to_pool(v, { source: args.append });
      if (!(G.GAME.used_jokers[v.key] && !showman && !args.allow_duplicates) && (v.unlocked !== false || v.rarity === 4) && (v.rarity !== 4 || args.allow_legendaries) && (!_rarity || !v.rarity || _rarity === v.rarity)) {
        add = v.enhancement_gate ? enhancement_gate_ok(v.enhancement_gate) : true;
      }
      if (typeset && !typeset[v.set] && !(typeset.Consumeables && CONSUMABLE_TYPES_OR_BASE(v.set))) add = undefined;
      if (typeset && v.pools) for (const k of Object.keys(v.pools)) if (typeset[k]) { add = true; break; }
      if (v.no_pool_flag && G.GAME.pool_flags[v.no_pool_flag]) add = undefined;
      if (v.yes_pool_flag && !G.GAME.pool_flags[v.yes_pool_flag]) add = undefined;
      if (args.no_replace && v.set === 'Enhanced' && v.replace_base_card) add = undefined;
      add = in_pool && add;
      final_pool.push(add && !G.GAME.banned_keys[v.key] ? v.key : 'UNAVAILABLE');
    } else {
      for (const t of [P_SEALS, P_TAGS, P_BLINDS, P_CARDS, P_STAKES]) { if (t[key]) { v = t[key]; add = true; break; } }
      if (v) {
        if (v.mod && !centerActive(v)) add = undefined;
        if (typeset && !typeset[v.set]) add = undefined;
        final_pool.push(add && !G.GAME.banned_keys[v.key] ? v.key : 'UNAVAILABLE');
      }
    }
  }
  return final_pool;
}
const VANILLA_CONSUMABLE_SETS = { Tarot: true, Planet: true, Spectral: true };
const CONSUMABLE_TYPES_OR_BASE = (set) => !!(VANILLA_CONSUMABLE_SETS[set] || CONSUMABLE_TYPES[set]);

/** SMODS.ObjectTypes[type].rarities for the attribute rarity poll: Joker = the vanilla four + mod rarities; a mod consumable type's own. */
function type_rarities(type) {
  if ((type || 'Joker') === 'Joker') {
    const out = [{ key: 'Common', weight: 0.7 }, { key: 'Uncommon', weight: 0.25 }, { key: 'Rare', weight: 0.05 }, { key: 'Legendary', weight: 0 }];
    for (const r of Object.values(RARITIES)) if (centerActive(r) && (!r.pools || r.pools.Joker)) out.push({ key: r.key, weight: lor(r.weight, lor(r.default_weight, 0)) });
    return out;
  }
  const T = CONSUMABLE_TYPES[type];
  return T && T.rarities ? T.rarities.map((r) => ({ key: r.key, weight: r.weight })) : null;
}
const VANILLA_RARITY = { Common: 1, Uncommon: 2, Rare: 3, Legendary: 4 };
/** SMODS_WEIGHTS_poll_rarity: a rarity for an attribute poll, among the rarities the pool actually has. */
function poll_rarity_for_pool(pool, args) {
  const rarity_poll = pseudorandom(pseudoseed(lor(args.seed, 'smods_cull_rarity') + '_cull'));
  const avail = type_rarities(args.type || 'Joker');
  if (!avail) return undefined;
  const final = [];
  for (const v of avail) {
    const want = lor(VANILLA_RARITY[v.key], v.key);
    if (pool.some((k) => P_CENTERS[k] && P_CENTERS[k].rarity === want)) final.push({ ...v });
  }
  let total = 0;
  for (const v of final) {
    v.mod = lor(G.GAME[String(v.key).toLowerCase() + '_mod'], 1);
    const R = RARITIES[v.key];
    if (R && typeof R.get_weight === 'function') v.weight = R.get_weight(R, v.weight, args.type || 'Joker');
    v.weight = v.weight * v.mod;
    total += v.weight;
  }
  for (const v of final) v.weight = v.weight / total;
  let wi = 0;
  for (const v of final) { wi += v.weight; if (rarity_poll < wi) return lor(VANILLA_RARITY[v.key], v.key); }
  return undefined;
}

/**
 * SMODS.create_blind_pool(blind_type): the boss blinds get_new_boss may draw now (least-used first), sorted.
 * Micatro has only boss blinds in pools; `skip_cull` keeps every eligible one.
 */
export function create_blind_pool(blind_type = 'boss', skip_cull) {
  const ante = G.GAME.round_resets.ante;
  const eligible = boss_eligible_map(ante);
  if (skip_cull) return Object.keys(eligible).sort();
  let min_use = 100;
  for (const [k, v] of Object.entries(G.GAME.bosses_used)) if (eligible[k]) { eligible[k] = v; if (v <= min_use) min_use = v; }
  for (const k of Object.keys(eligible)) if (eligible[k] > min_use && !(P_BLINDS[k].boss && P_BLINDS[k].boss.allow_duplicates)) delete eligible[k];
  return Object.keys(eligible).sort();
}
/** The boss blinds get_new_boss could draw this ante (before the least-used cull): key -> true. */
export function boss_eligible_map(ante) {
  const eligible = {};
  const a1 = Math.max(1, ante);
  for (const [k, v] of Object.entries(P_BLINDS)) {
    if (!v.boss) continue;
    if (v.mod && (!centerActive(v) || (v.in_pool && !v.in_pool(v)))) continue;
    let ok = false;
    if (!v.boss.showdown && v.boss.min <= a1 && (a1 % G.GAME.win_ante !== 0 || ante < 2)) ok = true;
    else if (v.boss.showdown && ante % G.GAME.win_ante === 0 && ante >= 2) ok = true;
    if (ACTIVE_MODS.length) { const o = firstHook('boss_eligible', ok, v, ante); if (o !== undefined) ok = !!o; }
    if (ok) eligible[k] = true;
  }
  for (const k of Object.keys(G.GAME.banned_keys)) delete eligible[k];
  return eligible;
}

/** SMODS.create_poll_pool(labels, args) -> [[{key, type}], labels_used]. Labels are object types or attribute keys. */
export function create_poll_pool(labels, args) {
  const labels_used = {};
  const pool = {};
  let final_pool = [];
  const join_lists = (l) => { const l1 = l[0] || []; for (const v of l[1] || []) l1.push(v); return l1; };
  const pool_exists = (p) => p.some((v) => v !== 'UNAVAILABLE');
  const sets = [];
  for (const label of labels) {
    if (!ATTRIBUTES[label]) sets.push(label);
    labels_used[label] = true;
    let temp_pool = [];
    const join_func = (args.attributes && !args.union) ? intersect_lists : join_lists;
    for (let i = 0; i < (args.rarities ? args.rarities.length : 1); i++) {
      if (label === 'Booster') set_poll_allow_duplicates(true);
      if (args.rarities && args.rarities[i] === 'Legendary') args.allow_legendaries = true;
      const rar = args.rarities ? lor(VANILLA_RARITY[args.rarities[i]], args.rarities[i]) : undefined;
      let _p;
      try {
        _p = label === 'Blind' ? create_blind_pool(lor(args.blind_type, 'boss'))
          : ATTRIBUTES[label] ? get_attribute_pool(label)
          : get_current_pool(label, rar, rar === 4, args.append)[0];
      } finally { set_poll_allow_duplicates(false); }
      if (ATTRIBUTES[label]) _p = cull_pool(_p, args);
      if (label === 'Edition') {
        const _options = [];
        for (const ed of _p) {
          if (P_CENTERS[ed] && !P_CENTERS[ed].mod) _options.unshift(ed);
          else if (P_CENTERS[ed]) _options.push(ed);
        }
        _p = _options;
      }
      temp_pool = join_lists([temp_pool, _p]);
    }
    for (const v of temp_pool) pool[v] = { key: v, type: label };
    const temp = pool_exists(final_pool) ? join_func([final_pool, temp_pool]) : temp_pool;
    final_pool = (args.closest_match && !pool_exists(temp)) ? final_pool : temp;
  }
  if (args.type === false) args.types = undefined;
  else if (!args.types) args.types = sets.length ? sets.slice() : ['Joker'];

  if (args.attributes && !args.rarity && args.rarity !== false) {
    args.rarity = poll_rarity_for_pool(final_pool, args);
    final_pool = cull_pool(final_pool, args);
  } else if (args.types && args.type !== 'Blind') {
    final_pool = cull_pool(final_pool, args);
  }

  let ret_pool = [];
  let exists = false;
  for (const k of final_pool) {
    if (!exists && k !== 'UNAVAILABLE') exists = true;
    if (pool[k] !== undefined) ret_pool.push(pool[k]); // (Lua table.insert(t, nil) is a no-op)
  }
  if (!exists) {
    const set = args.types ? args.types[0] : 'Joker';
    let def;
    const T = CONSUMABLE_TYPES[set];
    if (T && T.default && P_CENTERS[T.default]) def = T.default;
    else if (set === 'Tarot' || set === 'Tarot_Planet') def = 'c_strength';
    else if (set === 'Planet') def = 'c_pluto';
    else if (set === 'Spectral') def = 'c_incantation';
    else if (set === 'Voucher') def = 'v_blank';
    else if (set === 'Tag') def = 'tag_handy';
    else if (set === 'Edition' || set === 'Seal') def = undefined;
    else if (set === 'Enhanced') def = 'c_base';
    else if (set === 'Blind') def = { small: 'bl_small', big: 'bl_big', boss: 'bl_hook' }[args.blind_type] || 'bl_hook';
    else def = 'j_joker';
    ret_pool = def ? [{ key: def, type: set }] : [];
  }
  return [ret_pool, labels_used];
}

/**
 * SMODS.poll_object(args) -> a key (or undefined: the poll failed / an empty pool that allows none).
 * args: type|set, types|sets, attributes (+ union), pool ([keys] or [{name, weight}]), filter(pool) -> pool, seed|key,
 * type_key, append, guaranteed, chance, mod, rarity (false = any), rarities, allow_legendaries, allow_duplicates,
 * blind_type, no_negative, no_replace, closest_match. Weights: the object's `weight` (default 10; boosters x10), its
 * get_weight(self, weight, args), then every listener of context.modify_weights ({pool, pool_types, args}: `pool` is
 * the weight table list, also keyed by object key — set `.weight` to change one; 0 = never).
 */
export function poll_object(args) {
  if (!args) throw new Error('SMODS.poll_object called with no args.');
  args.type = lor(args.type, args.set);
  args.types = lor(args.types, args.sets);
  if (!(args.type || Array.isArray(args.types) || Array.isArray(args.attributes) || Array.isArray(args.pool))) throw new Error('SMODS.poll_object called without a pool source.');
  if (args.type === 'Base') return 'INTERNAL_PLAYING_CARD';
  if (!args.seed && args.key) args.seed = args.key;

  let pool = lor(args.pool, []);
  if (args.type) args.types = [args.type];
  if (args.types) args.type = args.types[0];
  const types = lor(args.attributes, args.types);
  let types_used = {};
  if (!args.pool) {
    [pool, types_used] = create_poll_pool(types, args);
    if (pool.length === 0) return undefined;
  }
  if (args.filter) pool = args.filter(pool);
  if (!pool.length) throw new Error('SMODS.poll_object called with an empty pool.');

  let total_weight = 0;
  const weight_pool = [];
  for (const key of pool) {
    let wt, w, m_w;
    if (key && typeof key === 'object' && truthy(key.weight)) {
      key.key = key.name;
      w = m_w = key.weight;
      wt = { key: key.name, weight: key.weight };
    } else {
      const k = typeof key === 'object' ? lor(key.key, key) : key;
      const ot = typeof key === 'object' ? GAME_TABLE_FROM_TYPE[key.type] : undefined;
      const obj_pool = ot ? GAME_TABLES()[ot] : P_CENTERS;
      [w, m_w] = get_weight_of_object(obj_pool[k], typeof key === 'object' ? key.weight : undefined, args);
      wt = { key: k, weight: m_w };
    }
    total_weight += w;
    weight_pool.push(wt);
    weight_pool[wt.key] = wt;
  }
  // Allow calculate functions to modify the pool table
  calculate_seam({ modify_weights: true, pool: weight_pool, pool_types: types_used, args }, 'modify_weights');
  let modded_weight = 0;
  const final_pool = [];
  for (const wt of weight_pool) {
    modded_weight += weight_pool[wt.key].weight;
    wt.mod_weight = modded_weight;
    final_pool.push(wt);
  }
  const base = lor(args.chance, BASE_RATE_PERCENTAGE[args.type]);
  let chance = (args.guaranteed || !truthy(base)) ? 1 : (lor(base, 1) * lor(args.mod, 1) * (modded_weight / total_weight));

  let output_key = 'UNAVAILABLE', guard = 0;
  while (output_key === 'UNAVAILABLE') {
    // (a safety cap the Lua lacks: a pool whose every entry is UNAVAILABLE would spin forever)
    if (++guard > 1000) return undefined;
    let poll_key = pseudorandom(pseudoseed(lor(args.seed, get_poll_key(args.type))));
    if (poll_key < 1 - chance) return undefined;
    if (!NO_REPOLL[args.type]) {
      poll_key = pseudorandom(pseudoseed(lor(args.type_key, get_poll_key(args.type, lor(args.append, 'type')))));
      chance = 1;
    }
    const poll_weight = modded_weight - (poll_key - (1 - chance)) / chance * modded_weight;
    if (poll_weight > final_pool[0].mod_weight) output_key = final_pool[select_by_weight(final_pool, poll_weight, 1, final_pool.length) - 1].key;
    else output_key = final_pool[0].key;
  }
  if (args.no_negative && output_key === 'e_negative') return 'e_polychrome';
  return output_key;
}

/** SMODS.poll_object_type({types?, seed?}): which kind of card a shop slot rolls (by the G.GAME `<type>_rate`s). */
export function poll_object_type(args = {}) {
  if (!args.types) {
    args.types = ['Joker', 'playing_card', 'Tarot', 'Planet', 'Spectral'];
    for (const t of Object.values(CONSUMABLE_TYPES)) if (centerActive(t)) args.types.push(t.key);
  } else if (!Array.isArray(args.types)) throw new Error('SMODS.poll_object_type called with invalid types table.');
  let total_rate = 0;
  const table = [];
  for (const type of args.types) {
    const rk = CONSUMABLE_TYPES[type] ? CONSUMABLE_TYPES[type].rate_key : type.toLowerCase() + '_rate';
    const rate = G.GAME[rk] || 0;
    total_rate += rate;
    const entry = { type, rate, mod_weight: total_rate };
    if (type === 'playing_card') entry.type = (G.GAME.used_vouchers.v_illusion && pseudorandom(pseudoseed('illusion')) > 0.6) ? 'Enhanced' : 'Base';
    table.push(entry);
  }
  const poll_weight = pseudorandom(lor(args.seed, 'smods_poll_object_type')) * total_rate;
  let ind = 1;
  if (poll_weight > table[0].mod_weight) ind = select_by_weight(table, poll_weight, 1, table.length);
  return table[ind - 1].type;
}

/** SMODS.poll_seal / SMODS.poll_enhancement under object_weights: poll_object over the Seal / Enhanced set (`options` = the pool). */
export function poll_seal_weighted(args = {}) { args.type = 'Seal'; args.pool = args.options || undefined; return poll_object(args); }
export function poll_enhancement_weighted(args = {}) { args.type = 'Enhanced'; args.pool = args.options || undefined; return poll_object(args); }

/** True while an active mod turns on Steamodded's object_weights optional feature (every route below checks it). */
export const object_weights = () => ACTIVE_MODS.length > 0 && feature('object_weights');
