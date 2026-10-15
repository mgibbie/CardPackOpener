// Pokermon+ 1.0.3 — src/functions/functions.lua: energy_shift, the Void deck's negative Energy,
// the weather helpers (sandstorm / hail / rain / sunny), unique_hand_tooltip,
// sonfive_base_evo_name and the mod's set_debuff (the Nacli line can't be debuffed).
//
// Intended-design fixes in this file (each tested in tests/mods/pokermonplus_test.mjs):
//  - sandstorm() checked the enhancement 'm_count', which doesn't exist (it was always false
//    unless the hand was empty). The file shows a find-and-replace accident "Stone" -> "count":
//    energy_shift's vanilla name list reads "count Joker", "Evercount", "Bloodcount" where the
//    identical list in negative_energize reads "Stone Joker", "Everstone", "Bloodstone". In the
//    games Sandstorm is the Rock-type weather, and its siblings map one enhancement each
//    (hail = Glass, rain = Bonus, sunny = Mult). So sandstorm = every held card is a Stone Card
//    ('m_stone'), and the three joker names are restored in energy_shift's list too.
//  - energy_shift's `j_marcpoke_toxtricity_amped` bonus (a joker from another, unreleased mod)
//    can never be present in Micatro: the branch is dropped (it always added 0 without that mod).
//  - Negative Energy on a base-game joker (number / no `extra`) crashed in the Lua
//    (`choice.ability.extra.energy_plus` indexes a number); the +1 limit is stored on
//    `card.ability.energy_plus` there instead, and the limit check reads both.
//  - negative energy *can_use* returned true/false where Pokermon's energy_can_use returns the
//    joker (Bird Energy uses that joker); it returns the joker now.
import {
  G, P_CENTERS, localize, card_eval_status_text, find_joker, energy_values, round_energy_value, set_frac,
  energy_matches, increment_energy, set_spoon_item, poke_get_family_list,
} from '../../pokermon/api.js';
import { opt, isActive } from '../../../js/mods/registry.js';

export const MOD_ID = 'pokermonplus';
/** sonfive_config.<key> for the current run. */
export const scfg = (key) => opt(MOD_ID, key);
const isTable = (x) => x !== null && typeof x === 'object';
const ENERGY_FIELDS = Object.keys(energy_values);
const has_enhancement = (c, key) => !!(c && c.config && c.config.center && c.config.center.key === key);

// energy_shift's base-game lists (number `extra`). Intended-design fix: "count Joker" /
// "Evercount" / "Bloodcount" restored to Stone Joker / Everstone / Bloodstone (see header).
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
 * energy_shift(card, energy_delta, etype, evolving, silent, increment): add (or, negative, take
 * away) `energy_delta` Energies' worth of scaling WITHOUT the Energy limit — Ninjask's Speed
 * Boost, Darkrai's shared Energy, the Weakened sticker (-2). `increment` also moves energy_count.
 */
export function energy_shift(card, energy_delta, etype, evolving, silent, increment) {
  const ex = card.ability.extra;
  if (isTable(ex)) {
    const base = (card.config.center.config && card.config.center.config.extra) || {};
    for (const name of ENERGY_FIELDS) {
      const data = ex[name];
      if (typeof data !== 'number') continue;
      const addition = energy_values[name] * energy_delta;
      // (Lua: + addition/2 per j_marcpoke_toxtricity_amped held — another mod's joker; dropped.)
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

// --------------------------------------------------------- negative Energy (Void deck)
const plainScoring = (a) => (a.mult && a.mult > 0) || (a.t_mult && a.t_mult > 0) || (a.t_chips && a.t_chips > 0) || (a.x_mult && a.x_mult > 1);
const hasEnergyField = (ex) => ENERGY_FIELDS.some((n) => typeof ex[n] === 'number');
/** A joker a negative Energy of this type could go on (no Energy-limit check: it raises the limit). */
function negative_viable(v, etype) {
  if (!energy_matches(v, etype, true) && etype !== 'Trans') return false;
  if (isTable(v.ability.extra)) return hasEnergyField(v.ability.extra);
  return typeof v.ability.extra === 'number' || plainScoring(v.ability);
}
/** The per-joker +1 limit a negative Energy grants (Lua: extra.energy_plus). */
export function add_energy_plus(card) {
  if (isTable(card.ability.extra)) card.ability.extra.energy_plus = (card.ability.extra.energy_plus || 0) + 1;
  else card.ability.energy_plus = (card.ability.energy_plus || 0) + 1; // intended-design fix (see header)
}
export function energy_plus_of(card) {
  if (!card || !card.ability) return 0;
  const ex = card.ability.extra;
  return (isTable(ex) ? ex.energy_plus : card.ability.energy_plus) || 0;
}
/** increment_negative_energy: a normal Energy + 1 to this joker's own limit. */
export function increment_negative_energy(card, etype) {
  increment_energy(card, etype);
  add_energy_plus(card);
}
export function negative_energy_can_use(self) {
  for (const v of G.jokers.cards) if (negative_viable(v, self.etype)) return v;
  return false;
}
export function highlighted_negative_energy_can_use(self) {
  if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return false;
  const choice = G.jokers.highlighted[0];
  if (!energy_matches(choice, self.etype, true)) return false;
  if (isTable(choice.ability.extra)) return hasEnergyField(choice.ability.extra) ? choice : false;
  if (typeof choice.ability.extra === 'number') return choice;
  // (Lua: this plain-scoring branch sat outside the type check, so a non-matching base joker was
  // "usable" and the Energy was then spent for nothing; it follows Pokermon's rule now.)
  return plainScoring(choice.ability) ? choice : false;
}
export function negative_energy_use(self, card) {
  G.GAME.energies_used = (G.GAME.energies_used || 0) + 1;
  set_spoon_item(card);
  for (const v of G.jokers.cards) {
    if (negative_viable(v, self.etype)) { increment_negative_energy(v, self.etype); return; }
  }
}
export function highlighted_negative_energy_use(self, card) {
  if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return false;
  const choice = G.jokers.highlighted[0];
  G.GAME.energies_used = (G.GAME.energies_used || 0) + 1;
  set_spoon_item(card);
  if (!(energy_matches(choice, self.etype, true) || self.etype === 'Trans')) return undefined;
  let viable = false;
  if (isTable(choice.ability.extra)) viable = hasEnergyField(choice.ability.extra);
  else viable = typeof choice.ability.extra === 'number' || plainScoring(choice.ability);
  if (viable) increment_negative_energy(choice, self.etype);
  return undefined;
}

/** The lovely patches at the top of Pokermon's four energy functions (Pokermon ENERGY_OVERRIDES). */
export function void_energy_override(kind, self, card) {
  if (!isActive(MOD_ID) || !G.GAME || !G.GAME.modifiers.void || !card || !card.edition || !card.edition.negative) return undefined;
  if (kind === 'energy_can_use') return { value: negative_energy_can_use(self, card) };
  if (kind === 'highlighted_energy_can_use') return { value: highlighted_negative_energy_can_use(self, card) };
  if (kind === 'energy_use') return { value: negative_energy_use(self, card) };
  if (kind === 'highlighted_energy_use') return { value: highlighted_negative_energy_use(self, card) };
  return undefined;
}

// ------------------------------------------------------------------ weather
const all_held = (key) => {
  let count = 0;
  for (const c of G.hand.cards) if (has_enhancement(c, key)) count++;
  return count === G.hand.cards.length;
};
/** Intended-design fix: 'm_count' (nonexistent) -> 'm_stone' (see header). */
export const sandstorm = () => all_held('m_stone');
export const hail = () => all_held('m_glass');
export const rain = () => all_held('m_bonus');
export const sunny = () => all_held('m_mult');

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
  if (n === 'nacli' || n === 'naclstack' || n === 'garganacl') return 'prevent_debuff';
  return undefined;
}

export { find_joker, P_CENTERS };
