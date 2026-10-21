// Pokermon+ 1.2.0 — src/functions/functions.lua (+ the lovely patches that work with it): the Void deck's negative Energy,
// the per-joker Energy limit (`e_limit_up`, Pokermon 3.9.1's own field), Energy with an amount (pokermon.energy.modify /
// energize), the Weakened sticker's compat pass (reset_game_globals), Grafaiai's pokermon.is_type wrap, the tag_triggered
// context + G.GAME.last_tag, Stonjourner's "Played Hands" tooltip, sonfive_base_evo_name and the mod's set_debuff.
// The 1.0.3 helpers only the legacy jokers still use (energy_shift: the legacy Ninjask's Speed Boost) are kept at the end.
//
// Intended-design fixes / Micatro shapes in this file (each tested in micatro/tests/mods/pokermonplus_120_test.mjs):
//  - Void deck: 1.2.0's pokermon.energy.can_apply_energy wrap answers TRUE for ANY joker within its limit + 1 while a
//    Negative Energy is being used (it ignores the type and energizable checks cae_ref failed on), so a Negative Energy
//    went on the leftmost joker of any type, a non-energizable one included (and crashed on a number `extra`). Ours keeps
//    the type / energizable checks and only lifts the limit by one: "Negative Energy cards give +1 Energy Limit".
//  - A base-game joker has no table `extra` to keep `e_limit_up` in (the Lua crashes indexing it): it lives in
//    `ability.sonfive_e_limit_up` there (Pokermon ENERGY_LIMIT_BONUS reads both).
//  - Grafaiai: a debuffed Grafaiai merges no types (SMODS.find_card skips debuffed cards; the Lua's loop did not).
import {
  G, P_CENTERS, localize, card_eval_status_text, find_joker, energy_values, round_energy_value, set_frac,
  energy_matches, increment_energy, set_spoon_item, poke_get_family_list, get_total_energy, energize, get_type, play_sound,
  energy_max, calculate_context,
} from '../../pokermon/api.js';
import { opt, isActive } from '../../../js/mods/registry.js';
import { Tag } from '../../../js/engine/tag.js';

export const MOD_ID = 'pokermonplus';
/** sonfive_config.<key> for the current run. */
export const scfg = (key) => opt(MOD_ID, key);
const isTable = (x) => x !== null && typeof x === 'object';
const ENERGY_FIELDS = Object.keys(energy_values);
const has_enhancement = (c, key) => !!(c && c.config && c.config.center && c.config.center.key === key);
export const POKE_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];

// ------------------------------------------------------------------ the per-joker Energy limit
/** card.ability.extra.e_limit_up (3.9.1), or ability.sonfive_e_limit_up for a base-game joker (see the header). */
export function e_limit_up_of(card) {
  if (!card || !card.ability) return 0;
  const ex = card.ability.extra;
  return (isTable(ex) ? ex.e_limit_up : card.ability.sonfive_e_limit_up) || 0;
}
export function add_e_limit_up(card, n) {
  const ex = card.ability.extra;
  if (isTable(ex)) ex.e_limit_up = (ex.e_limit_up || 0) + n;
  else card.ability.sonfive_e_limit_up = (card.ability.sonfive_e_limit_up || 0) + n;
}
/** The joker's whole Energy limit (pokermon.energy.max + G.GAME.poke_energy_plus + e_limit_up). */
export const energy_limit_of = (card) => energy_max + (G.GAME.energy_plus || 0) + e_limit_up_of(card);

/** pokermon.energy.is_energizable (3.9.1): the card has an Energy-scaled value. */
export function is_energizable(card) {
  const ex = card.ability.extra;
  if (isTable(ex)) return ENERGY_FIELDS.some((n) => typeof ex[n] === 'number');
  if (typeof ex === 'number') return true;
  const a = card.ability;
  return (a.mult > 0) || (a.t_mult > 0) || (a.t_chips > 0) || (a.x_mult > 1);
}

/**
 * pokermon.energy.energize(card, etype, nil, silent, amount) without touching the Energy counts: `amount` Energies' worth of
 * scaling (negative takes it away). A table `extra` follows 3.9.1's formula; a base-game joker takes Pokermon's energize step
 * `amount` times (our Pokermon port's energize has no amount).
 */
export function energize_amount(card, etype, amount, silent = true) {
  if (!amount) return;
  const ex = card.ability.extra;
  if (isTable(ex)) {
    const base = (card.config.center.config && card.config.center.config.extra) || {};
    const c_penalty = etype === 'Colorless' && get_type(card) !== 'Colorless' && !(G.GAME.modifiers && G.GAME.modifiers.poke_disable_colorless_penalty) ? 2 : 1;
    for (const name of ENERGY_FIELDS) {
      const data = ex[name];
      if (typeof data !== 'number' || typeof base[name] !== 'number') continue;
      const previous_mod = (name === 'mult_mod' || name === 'chip_mod') ? ex[name] : undefined;
      ex[name] = data + (base[name] * energy_values[name] / c_penalty) * (ex.escale || 1) * amount;
      const updated = ex[name];
      const [rounded, frac] = round_energy_value(ex[name], name);
      ex[name] = rounded;
      if (frac !== undefined) set_frac(card, frac, name, rounded > 0, previous_mod ? updated / previous_mod : undefined);
    }
  } else if (is_energizable(card)) {
    const before = JSON.parse(JSON.stringify(card.ability));
    energize(card, etype, false, true);
    for (const [k, v] of Object.entries(card.ability)) {
      if (typeof v === 'number' && typeof before[k] === 'number' && k !== 'energy_count' && k !== 'c_energy_count') card.ability[k] = before[k] + (v - before[k]) * amount; // (a number `extra` included)
    }
  }
  if (!silent) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_energized_ex'), colour: 'pink' });
}

/** pokermon.energy.modify(card, etype, amount, silent) (3.9.1): move the Energy count by `amount` and energize by it. */
export function modify_energy(card, etype, amount = 1, silent) {
  const ex = card.ability.extra;
  const holder = isTable(ex) ? ex : card.ability;
  if (!isTable(ex) && !is_energizable(card)) return;
  // (3.9.1: an Energy that doesn't match the type counts as a Colorless one — c_energy_count)
  if (etype && energy_matches(card, etype, false)) holder.energy_count = (holder.energy_count || 0) + amount;
  else holder.c_energy_count = (holder.c_energy_count || 0) + amount;
  energize_amount(card, etype, amount, silent);
}

/** The Weakened sticker / Pearlescent deck step: -1 Energy and -1 Energy limit (both lovely / sticker apply()). */
export function deenergize_one(card) {
  if (!card || !card.ability) return;
  if (!isTable(card.ability.extra) && !is_energizable(card)) return; // (nothing to de-energize: the Lua crashed here)
  modify_energy(card, get_type(card), -1, true);
  add_e_limit_up(card, -1);
}

// --------------------------------------------------------- negative Energy (Void deck, 1.2.0)
/** A joker a Negative Energy of this type can go on: matching, energizable, at most AT its limit (+1 over is allowed). */
function negative_target(v, etype) {
  if (!energy_matches(v, etype, true) || !is_energizable(v)) return false;
  return get_total_energy(v) <= energy_limit_of(v);
}
const highlighted_one = () => (G.jokers.highlighted && G.jokers.highlighted.length === 1 ? G.jokers.highlighted[0] : null);
/** pokermon.find_leftmost_or_highlighted(can_apply_energy). */
function negative_choice(etype) {
  const h = highlighted_one();
  if (h) return negative_target(h, etype) ? h : false;
  for (const v of G.jokers.cards) if (negative_target(v, etype)) return v;
  return false;
}
/** Using one: e_limit_up + 1 on the target, then the ordinary Energy. */
function negative_use(self, card) {
  G.GAME.energies_used = (G.GAME.energies_used || 0) + 1;
  play_sound('poke_energy_use', 1, 0.5);
  set_spoon_item(card);
  const choice = negative_choice(self.etype);
  if (!choice) return;
  add_e_limit_up(choice, 1);
  increment_energy(choice, self.etype);
}
/** Pokermon ENERGY_OVERRIDES: a Negative Energy card in a Void run. */
export function void_energy_override(kind, self, card) {
  if (!isActive(MOD_ID) || !G.GAME || !G.GAME.modifiers.void || !card || !card.edition || !card.edition.negative) return undefined;
  if (kind === 'energy_can_use' || kind === 'highlighted_energy_can_use') return { value: negative_choice(self.etype) };
  if (kind === 'energy_use' || kind === 'highlighted_energy_use') return { value: negative_use(self, card) };
  return undefined;
}

// ------------------------------------------------------------------ the Weakened sticker's compat (reset_game_globals)
/** 3.9.1 is_energizable on a CENTER (Pokermon+'s is_center_energizable). */
function center_energizable(center) {
  const ex = center.config && center.config.extra;
  if (isTable(ex)) return ENERGY_FIELDS.some((n) => typeof ex[n] === 'number');
  if (typeof ex === 'number') return true;
  const c = center.config || {};
  return ENERGY_FIELDS.some((k) => typeof c[k] === 'number' && c[k] > 0) || c.mult > 0 || c.t_mult > 0 || c.t_chips > 0 || c.Xmult > 1;
}
/** A joker can be Weakened when it, or any of its family, is energizable (run start, with the Lilac stake's flag). */
const COMPAT = new Map();
export function weakened_compat(center) {
  if (!center || center.set !== 'Joker') return false;
  if (center.sonfive_weakened_compat !== undefined) return !!center.sonfive_weakened_compat;
  if (COMPAT.has(center.key)) return COMPAT.get(center.key);
  const fam = poke_get_family_list(center.name);
  let keys = [center.key];
  if (fam.length > 1) {
    const prefix = center.poke_custom_prefix || 'poke';
    keys = fam.map((v) => 'j_' + prefix + '_' + (isTable(v) ? v.key : v)).filter((k) => P_CENTERS[k]);
  }
  const r = keys.some((k) => center_energizable(P_CENTERS[k]));
  COMPAT.set(center.key, r);
  return r;
}

// ------------------------------------------------------------------ Grafaiai (pokermon.is_type wrap)
/** Pokermon IS_TYPE_RULES: a joker whose type is in a Grafaiai's Nature also counts as the Nature's other types. */
export function grafaiai_is_type(card, target_type) {
  if (!isActive(MOD_ID) || !G.jokers || !card || !card.ability) return false;
  const card_type = get_type(card);
  if (!card_type || card_type === target_type) return false;
  const groups = [];
  for (const g of G.jokers.cards) {
    if (g.debuff || !g.ability || g.ability.name !== 'grafaiai' || g.config.center.mod !== MOD_ID) continue;
    const s = new Set(((g.ability.extra && g.ability.extra.targets) || []).map((t) => t.type));
    if (s.size) groups.push(s);
  }
  if (!groups.length) return false;
  // overlapping Natures merge (the Lua's "merge overlapping groups")
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = groups.length - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        if ([...groups[i]].some((k) => groups[j].has(k))) { for (const k of groups[i]) groups[j].add(k); groups.splice(i, 1); changed = true; break outer; }
      }
    }
  }
  return groups.some((g) => g.has(target_type) && g.has(card_type));
}

// ------------------------------------------------------------------ tag_triggered (Steamodded) + G.GAME.last_tag
/**
 * Steamodded's Tag:apply_to_run wrap: once a tag triggers, calculate_context({tag_triggered = tag}) (Shroodle counts it) and
 * the mod's own calculate records G.GAME.last_tag (Grafaiai). Only while Pokermon+ is active: other runs never see it.
 */
const base_apply = Tag.prototype.apply_to_run;
Tag.prototype.apply_to_run = function (ctx) {
  const res = base_apply.call(this, ctx);
  if (this.triggered && !this.triggered_calc && isActive(MOD_ID) && G.GAME) {
    this.triggered_calc = true;
    G.GAME.last_tag = this.key;
    calculate_context({ tag_triggered: this });
  }
  return res;
};

// -------------------------------------------------------------- tooltips etc.
export const HAND_ORDER = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
  'Five of a Kind', 'Flush House', 'Flush Five'];
/** Stonjourner's "Played Hands" tooltip (ston_hands<N>). */
export function unique_hand_tooltip(self, info_queue, center) {
  const a = center && center.ability && isTable(center.ability.extra) ? center.ability.extra : null;
  if (!a || !a.played_hands) return;
  const played = HAND_ORDER.filter((h) => a.played_hands[h]);
  if (played.length > 0) info_queue.push({ set: 'Other', key: 'ston_hands' + played.length, vars: played });
}

/** The first name of a Pokémon's family (its line's toggle key in the options). */
export function sonfive_base_evo_name(center) {
  const fam = poke_get_family_list(center.name);
  if (fam.length > 0) return typeof fam[0] === 'object' ? fam[0].key : fam[0];
  return center.name;
}

/** SMODS.current_mod.set_debuff: the Nacli line can't be debuffed. (The fainted-baby rule it also
 *  copied is Pokermon's own and already runs through Pokermon's hook.) */
export function set_debuff(card) {
  const n = card && card.ability && card.ability.name;
  if (card && card.config && card.config.center && card.config.center.mod === MOD_ID && (n === 'nacli' || n === 'naclstack' || n === 'garganacl')) return 'prevent_debuff';
  return undefined;
}

/** A held card of this enhancement everywhere in hand (1.0.3's weather helpers; Cetitan's "hail" is inline in 1.2.0). */
export const all_held = (key) => G.hand.cards.every((c) => has_enhancement(c, key));

// ============================================================ 1.0.3 (legacy jokers only)
// energy_shift's base-game lists (number `extra`). 1.0.3 intended-design fix: "count Joker" / "Evercount" / "Bloodcount"
// restored to Stone Joker / Everstone / Bloodstone.
const SHIFT_VANILLA = {
  mult: ['Joker', 'Jolly Joker', 'Zany Joker', 'Mad Joker', 'Crazy Joker', 'Droll Joker', 'Half Joker', 'Mystic Summit', 'Gros Michel', 'Popcorn'],
  mult_mod: ['Greedy Joker', 'Lusty Joker', 'Wrathful Joker', 'Gluttonous Joker', 'Fibonacci', 'Abstract Joker', 'Even Steven', 'Ride the Bus', 'Green Joker', 'Red Card', 'Erosion',
    'Fortune Teller', 'Pokedex', 'Flash Card', 'Spare Trousers', 'Smiley Face', 'Onyx Agate', 'Shoot the Moon', 'Bootstraps'],
  chips: ['Sly Joker', 'Wily Joker', 'Clever Joker', 'Devious Joker', 'Crafty Joker', 'Stuntman'],
  chip_mod: ['Banner', 'Scary Face', 'Odd Todd', 'Runner', 'Blue Joker', 'Hiker', 'Square Joker', 'Stone Joker', 'Bull', 'Castle', 'Arrowhead', 'Wee Joker'],
  Xmult: ['Loyalty Card', 'Blackboard', 'Cavendish', 'Card Sharp', 'Ramen', 'Acrobat', 'Flower Pot', 'Seeing Double', 'The Duo', 'The Trio', 'The Family', 'The Order', 'The Tribe',
    "Driver's License"],
  Xmult_mod: ['Joker Stencil', 'Steel Joker', 'Constellation', 'Madness', 'Vampire', 'Hologram', 'Baron', 'Obelisk', 'Photograph', 'Lucky Cat', 'Baseball Card', 'Everstone', 'Ancient Joker',
    'Campfire', 'Throwback', 'Bloodstone', 'Glass Joker', 'The Idol', 'Hit the Road', 'Canio', 'Triboulet', 'Yorick'],
  money: ['Delayed Gratification', 'Egg', 'Cloud 9', 'Rocket', 'Gift Card', 'Reserved Parking', 'Mail-In Rebate', 'To the Moon', 'Golden Joker', 'Trading Card', 'Golden Ticket', 'Rough Gem',
    'Satellite', 'Matador'],
};

/**
 * 1.0.3 energy_shift(card, energy_delta, etype, evolving, silent, increment): add (or, negative, take away) `energy_delta`
 * Energies' worth of scaling WITHOUT the Energy limit — the legacy Ninjask's Speed Boost. `increment` also moves energy_count.
 */
export function energy_shift(card, energy_delta, etype, evolving, silent, increment) {
  const ex = card.ability.extra;
  if (isTable(ex)) {
    const base = (card.config.center.config && card.config.center.config.extra) || {};
    for (const name of ENERGY_FIELDS) {
      const data = ex[name];
      if (typeof data !== 'number') continue;
      const addition = energy_values[name] * energy_delta;
      let previous_mod;
      if (name === 'mult_mod' || name === 'chip_mod') previous_mod = ex[name];
      const baseVal = typeof base[name] === 'number' ? base[name] : 0;
      if ((ex.ptype !== 'Colorless' && !card.ability.colorless_sticker) && etype === 'Colorless') ex[name] = data + (baseVal * addition / 2) * (ex.escale || 1);
      else ex[name] = data + (baseVal * addition) * (ex.escale || 1);
      const updated_mod = ex[name];
      const [rounded, frac] = round_energy_value(ex[name], name);
      ex[name] = rounded;
      if (frac !== undefined) {
        if (name === 'mult_mod' || name === 'chip_mod') set_frac(card, frac, name, rounded > 0, previous_mod ? updated_mod / previous_mod : undefined);
        else set_frac(card, frac, name, rounded > 0);
      }
    }
  } else if (typeof ex === 'number') {
    for (const [k, names] of Object.entries(SHIFT_VANILLA)) {
      if (!names.includes(card.ability.name)) continue;
      let increase = energy_values[k] * energy_delta;
      if (!card.ability.colorless_sticker && etype === 'Colorless') increase = increase / 2;
      card.ability.extra = card.ability.extra + (card.config.center.config.extra * increase);
    }
  } else {
    const a = card.ability, cc = card.config.center.config || {};
    let increase;
    if ((a.mult && a.mult > 0) || (a.t_mult && a.t_mult > 0)) increase = energy_values.mult * energy_delta;
    else if (a.t_chips && a.t_chips > 0) increase = energy_values.chips * energy_delta;
    if (increase) {
      if (!a.colorless_sticker && etype === 'Colorless') increase = increase / 2;
      if (a.mult && a.mult > 0) a.mult = a.mult + (cc.mult || 0) * increase;
      if (a.t_mult && a.t_mult > 0) a.t_mult = a.t_mult + (cc.t_mult || 0) * increase;
      if (a.t_chips && a.t_chips > 0) a.t_chips = a.t_chips + (cc.t_chips || 0) * increase;
    }
  }
  if (increment) {
    const holder = isTable(card.ability.extra) ? card.ability.extra : null;
    if (holder && (holder.energy_count !== undefined || holder.c_energy_count !== undefined)) holder.energy_count = (holder.energy_count || 0) + energy_delta;
  }
  if (!silent) {
    if (energy_delta > 0) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_energized_ex'), colour: 'CHIPS' });
    else if (energy_delta < 0) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_deenergized_ex'), colour: 'CHIPS' });
  }
}

export { find_joker, P_CENTERS };
