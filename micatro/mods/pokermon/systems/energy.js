/**
 * Energy — native rebuild of Pokermon's functions/energyfunctions.lua.
 *
 * Using an Energy card on a joker of the matching type "energizes" it: every numeric
 * scoring field in `ability.extra` listed in `energy_values` grows by
 * `center.config.extra[field] * coefficient` (Colorless energy on a non-Colorless joker
 * counts half). Base-game jokers can be energized too when they carry a Tera sticker
 * (the per-name lists in energize()). A joker holds at most energy_max (3) +
 * G.GAME.energy_plus energies unless the run's `unlimited_energy` option is on.
 *
 * precise_energy (default ON in the shipped 3.2.0 config) keeps fractional values;
 * when OFF, values round (mult/chips up, money / *_mod fields keep their fractional
 * part in ability.<field>_frac, paid out by ease_poke_dollars / set_frac).
 *
 * Field iteration order: Lua iterates energy_values with pairs() (hash order). The
 * order only matters when precise_energy is OFF (set_frac can feed `mult`/`chips`), so
 * Micatro uses the table's key order from the extracted data (alphabetical).
 */
import { G, card_eval_status_text, localize, play_sound, pseudorandom, pseudoseed, ease_dollars } from '../../../js/engine/core.js';
import DATA from '../data.js';
import { cfg, set_spoon_item } from './utils.js';
import { has_type, type_sticker_applied, set_energy_max, energy_limit_bonus, wildcard_type } from './types.js';

export const energy_values = DATA.globals.energy_values;
export const energy_max = DATA.globals.energy_max;
set_energy_max(energy_max);
const ENERGY_FIELDS = Object.keys(energy_values);

const isTable = (x) => x !== null && typeof x === 'object';
const plainScoring = (a) => (a.mult && a.mult > 0) || (a.t_mult && a.t_mult > 0) || (a.t_chips && a.t_chips > 0) || (a.x_mult && a.x_mult > 1);
const hasEnergyField = (ex) => ENERGY_FIELDS.some((name) => typeof ex[name] === 'number');

export function energy_matches(card, etype, include_colorless) {
  const a = card.ability;
  if (a && isTable(a.extra)) {
    if (has_type(card) && (etype === 'Trans' || etype === 'Bird')) return true;
    if (wildcard_type(card)) return true; // add-on wildcard Tera type (Nacho's Stellar) matches every Energy
    if ((a.extra.ptype && etype && a.extra.ptype === etype && !type_sticker_applied(card)) || a[String(etype).toLowerCase() + '_sticker']) return true;
    if (etype === 'Colorless' && (a.extra.ptype || type_sticker_applied(card)) && include_colorless) return true;
  } else if (a && (typeof a.extra === 'number' || plainScoring(a))) {
    if (a[String(etype).toLowerCase() + '_sticker']) return true;
    if (etype === 'Colorless' && type_sticker_applied(card) && include_colorless) return true;
  }
  return false;
}

export function get_total_energy(card) {
  if (isTable(card.ability.extra)) return (card.ability.extra.energy_count || 0) + (card.ability.extra.c_energy_count || 0);
  return (card.ability.energy_count || 0) + (card.ability.c_energy_count || 0);
}

export function can_increase_energy(card, etype) {
  if (cfg('unlimited_energy') || card.config.center.no_energy_limit || etype === 'Bird') return true;
  return get_total_energy(card) < energy_max + (G.GAME.energy_plus || 0) + energy_limit_bonus(card);
}

/** -> [rounded, frac] (frac undefined when nothing to carry). */
export function round_energy_value(value, field) {
  if (cfg('precise_energy')) return [value, undefined];
  if (['mult', 'mult2', 'chips', 'chips1', 'chips2', 'chips3'].includes(field)) return [Math.ceil(value), undefined];
  if (['money', 'money1', 'money2', 'mult_mod', 'mult_mod2', 'chip_mod', 'money_mod'].includes(field)) {
    const int = value < 0 ? Math.ceil(value) : Math.floor(value); // math.modf
    return [int, value - int];
  }
  return [value, undefined];
}

export function set_frac(card, frac, field, increased, ratio) {
  const frac_name = field + '_frac';
  let bonus_amt = Math.ceil(card.ability.extra[field] / (increased ? 2 : 1));
  card.ability[frac_name] = (card.ability[frac_name] || 0) + frac;
  if (card.ability[frac_name] >= 1) {
    const int = Math.floor(card.ability[frac_name]);
    card.ability.extra[field] = card.ability.extra[field] + int;
    card.ability[frac_name] = card.ability[frac_name] - int;
    if (!increased) bonus_amt = bonus_amt / 2;
  }
  if (field === 'mult_mod' && card.ability.extra.mult !== undefined) {
    if (ratio) card.ability.extra.mult = Math.ceil(card.ability.extra.mult * ratio);
    card.ability.extra.mult = card.ability.extra.mult + bonus_amt;
  }
  if (field === 'chip_mod' && card.ability.extra.chips !== undefined) {
    if (ratio) card.ability.extra.chips = Math.ceil(card.ability.extra.chips * ratio);
    card.ability.extra.chips = card.ability.extra.chips + bonus_amt;
  }
  if (field === 'money_mod' && card.ability.extra.money !== undefined) {
    card.ability.extra.money = card.ability.extra.money + bonus_amt;
  }
}

// Base-game jokers that can be energized, by the ability.extra field they scale (energize()).
const VANILLA = {
  mult: ['Joker', 'Jolly Joker', 'Zany Joker', 'Mad Joker', 'Crazy Joker', 'Droll Joker', 'Half Joker', 'Mystic Summit', 'Gros Michel', 'Popcorn'],
  mult_mod: ['Greedy Joker', 'Lusty Joker', 'Wrathful Joker', 'Gluttonous Joker', 'Fibonacci', 'Abstract Joker', 'Even Steven', 'Ride the Bus', 'Green Joker', 'Red Card', 'Erosion',
    'Fortune Teller', 'Pokedex', 'Flash Card', 'Spare Trousers', 'Smiley Face', 'Onyx Agate', 'Shoot the Moon', 'Bootstraps'],
  chips: ['Sly Joker', 'Wily Joker', 'Clever Joker', 'Devious Joker', 'Crafty Joker', 'Stuntman'],
  chip_mod: ['Banner', 'Scary Face', 'Odd Todd', 'Runner', 'Blue Joker', 'Hiker', 'Square Joker', 'Stone Joker', 'Bull', 'Castle', 'Arrowhead', 'Wee Joker'],
  Xmult: ['Loyalty Card', 'Blackboard', 'Cavendish', 'Card Sharp', 'Ramen', 'Acrobat', 'Flower Pot', 'Seeing Double', "Driver's License"],
  Xmult_mod: ['Steel Joker', 'Constellation', 'Madness', 'Vampire', 'Hologram', 'Baron', 'Obelisk', 'Photograph', 'Lucky Cat', 'Baseball Card', 'Everstone', 'Ancient Joker',
    'Campfire', 'Throwback', 'Bloodstone', 'Glass Joker', 'The Idol', 'Hit the Road', 'Canio', 'Triboulet', 'Yorick'],
  money: ['Delayed Gratification', 'Egg', 'Cloud 9', 'Rocket', 'Gift Card', 'Reserved Parking', 'Mail-In Rebate', 'To the Moon', 'Golden Joker', 'Trading Card', 'Golden Ticket', 'Rough Gem',
    'Satellite', 'Matador'],
};

/**
 * energize(card, etype, evolving, silent): apply the card's energy to its scoring fields.
 * evolving=true re-applies ALL stored energy to a freshly evolved center's base values.
 */
/**
 * Add-on extension point (additive; empty = Pokermon unchanged): fn(card) -> the config.extra
 * table energize scales from instead of the center's own, or undefined (Nacho's Passimian
 * scales its RECEIVED card's base values — its lovely patch on energize()).
 */
export const ENERGIZE_BASE = [];

export function energize(card, etype, evolving, silent) {
  const ex = card.ability.extra;
  if (isTable(ex)) {
    let base = card.config.center.config.extra || {};
    for (const f of ENERGIZE_BASE) { const b = f(card); if (b !== undefined) { base = b || {}; break; } }
    for (const name of ENERGY_FIELDS) {
      const data = ex[name];
      if (typeof data !== 'number') continue;
      let addition = energy_values[name];
      let previous_mod;
      if (name === 'mult_mod' || name === 'chip_mod') previous_mod = ex[name];
      const baseVal = typeof base[name] === 'number' ? base[name] : 0;
      if (evolving) {
        if (ex.ptype !== 'Colorless' && !card.ability.colorless_sticker) addition = addition * (ex.energy_count || 0) + addition / 2 * (ex.c_energy_count || 0);
        else addition = addition * ((ex.energy_count || 0) + (ex.c_energy_count || 0));
        ex[name] = data + (baseVal * addition) * (ex.escale || 1);
      } else if ((ex.ptype !== 'Colorless' && !card.ability.colorless_sticker) && etype === 'Colorless') {
        ex[name] = data + (baseVal * addition / 2) * (ex.escale || 1);
      } else {
        ex[name] = data + (baseVal * addition) * (ex.escale || 1);
      }
      const updated_mod = ex[name];
      const [rounded, frac] = round_energy_value(ex[name], name);
      ex[name] = rounded;
      if (frac !== undefined) {
        if (name === 'mult_mod' || name === 'chip_mod') set_frac(card, frac, name, rounded > 0, previous_mod ? updated_mod / previous_mod : undefined);
        else set_frac(card, frac, name, rounded > 0);
      }
    }
  } else if (typeof ex === 'number') {
    for (const [k, names] of Object.entries(VANILLA)) {
      if (names.includes(card.ability.name)) {
        let increase = energy_values[k];
        if (!card.ability.colorless_sticker && etype === 'Colorless') increase = increase / 2;
        card.ability.extra = card.ability.extra + (card.config.center.config.extra * increase);
      }
    }
  } else {
    const a = card.ability;
    const cc = card.config.center.config || {};
    let increase;
    if ((a.mult && a.mult > 0) || (a.t_mult && a.t_mult > 0)) increase = energy_values.mult;
    else if (a.t_chips && a.t_chips > 0) increase = energy_values.chips;
    else if (a.x_mult && a.x_mult > 1) increase = energy_values.Xmult;
    if (increase) {
      if (!a.colorless_sticker && etype === 'Colorless') increase = increase / 2;
      if (a.mult && a.mult > 0 && cc.mult) a.mult = a.mult + cc.mult * increase;
      if (a.t_mult && a.t_mult > 0 && cc.t_mult) a.t_mult = a.t_mult + cc.t_mult * increase;
      if (a.t_chips && a.t_chips > 0 && cc.t_chips) a.t_chips = a.t_chips + cc.t_chips * increase;
      // Lua reads center.config.x_mult (the base-game config key is Xmult), so this never fires.
      if (a.x_mult && a.x_mult > 1 && cc.x_mult) a.x_mult = a.x_mult + cc.x_mult * increase;
    }
  }
  if (!silent) card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_energized_ex'), colour: 'pink' });
}

export function increment_energy(card, etype) {
  const a = card.ability;
  if (isTable(a.extra)) {
    if (energy_matches(card, etype, false)) { a.extra.energy_count = (a.extra.energy_count || 0) + 1; energize(card, false); }
    else if (etype === 'Colorless') { a.extra.c_energy_count = (a.extra.c_energy_count || 0) + 1; energize(card, etype, false); }
  } else if (typeof a.extra === 'number' || plainScoring(a)) {
    if (energy_matches(card, etype, false)) { a.energy_count = (a.energy_count || 0) + 1; energize(card, false); }
    else if (etype === 'Colorless') { a.c_energy_count = (a.c_energy_count || 0) + 1; energize(card, etype, false); }
  }
}

export function energy_increase(card, etype) {
  if (can_increase_energy(card)) increment_energy(card, etype);
}

/**
 * Add-on extension point (additive; empty = Pokermon unchanged), mirroring the lovely patches
 * Pokermon+ puts at the top of the four energy functions: each entry is
 * fn(kind, self, card, area, copier) -> undefined (no opinion) or {value} (replace the function's
 * result). kind = 'energy_can_use' | 'highlighted_energy_can_use' | 'energy_use' | 'highlighted_energy_use'.
 * Pokermon+'s Void deck routes negative Energy cards through its own versions this way.
 */
export const ENERGY_OVERRIDES = [];
function energy_override(kind, self, card, area, copier) {
  for (const f of ENERGY_OVERRIDES) { const r = f(kind, self, card, area, copier); if (r !== undefined) return r; }
  return undefined;
}

/** The first joker (left to right) this Energy can go on, or false. */
export function energy_can_use(self, card) {
  const ov = ENERGY_OVERRIDES.length ? energy_override('energy_can_use', self, card) : undefined;
  if (ov) return ov.value;
  for (const v of G.jokers.cards) {
    if (!energy_matches(v, self.etype, true)) continue;
    if (isTable(v.ability.extra)) { if (can_increase_energy(v, self.etype) && hasEnergyField(v.ability.extra)) return v; }
    else if (typeof v.ability.extra === 'number') { if (can_increase_energy(v, self.etype)) return v; }
    else if (plainScoring(v.ability)) { if (can_increase_energy(v, self.etype)) return v; }
  }
  return false;
}

export function highlighted_energy_can_use(self, card) {
  const ov = ENERGY_OVERRIDES.length ? energy_override('highlighted_energy_can_use', self, card) : undefined;
  if (ov) return ov.value;
  if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return false;
  const choice = G.jokers.highlighted[0];
  if (energy_matches(choice, self.etype, true)) {
    if (isTable(choice.ability.extra)) { if (can_increase_energy(choice, self.etype) && hasEnergyField(choice.ability.extra)) return choice; }
    else if (typeof choice.ability.extra === 'number') { if (can_increase_energy(choice, self.etype)) return choice; }
    else if (plainScoring(choice.ability)) { if (can_increase_energy(choice, self.etype)) return choice; }
  }
  return false;
}

function count_energy_used() { G.GAME.energies_used = (G.GAME.energies_used || 0) + 1; }

/** Use: energize the first matching joker. */
export function energy_use(self, card, area, copier) {
  const ov = ENERGY_OVERRIDES.length ? energy_override('energy_use', self, card, area, copier) : undefined;
  if (ov) return ov.value;
  let applied = false;
  count_energy_used();
  play_sound('poke_energy_use', 1, 0.5);
  set_spoon_item(card);
  for (const v of G.jokers.cards) {
    let viable = false;
    if (applied || !energy_matches(v, self.etype, true)) continue;
    if (isTable(v.ability.extra)) { if (can_increase_energy(v, self.etype) && hasEnergyField(v.ability.extra)) viable = true; }
    else if (typeof v.ability.extra === 'number' || plainScoring(v.ability)) { if (can_increase_energy(v, self.etype)) viable = true; }
    if (viable) { increment_energy(v, self.etype); applied = true; }
  }
}

/** Use on the one highlighted joker. */
export function highlighted_energy_use(self, card, area, copier) {
  const ov = ENERGY_OVERRIDES.length ? energy_override('highlighted_energy_use', self, card, area, copier) : undefined;
  if (ov) return ov.value;
  if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return false;
  const choice = G.jokers.highlighted[0];
  count_energy_used();
  play_sound('poke_energy_use', 1, 0.5);
  set_spoon_item(card);
  if (!energy_matches(choice, self.etype, true)) return;
  let viable = false;
  if (isTable(choice.ability.extra)) { if (can_increase_energy(choice, self.etype) && hasEnergyField(choice.ability.extra)) viable = true; }
  else if (typeof choice.ability.extra === 'number' || plainScoring(choice.ability)) { if (can_increase_energy(choice, self.etype)) viable = true; }
  if (viable) increment_energy(choice, self.etype);
}

/** The Energy card key matching a joker's type (Tera sticker wins). */
export function matching_energy(card, allow_bird) {
  if (wildcard_type(card)) return undefined; // add-on wildcard type (Nacho's Stellar): no "Stellar Energy"
  const ex = card.ability.extra;
  if (isTable(ex) && ex.ptype && (ex.ptype !== 'Bird' || allow_bird) && !type_sticker_applied(card)) {
    const t = ex.ptype.toLowerCase();
    return 'c_poke_' + (t === 'dark' ? 'darkness' : t) + '_energy';
  }
  for (const v of ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth', 'bird']) {
    if (card.ability[v + '_sticker']) return 'c_poke_' + (v === 'dark' ? 'darkness' : v) + '_energy';
  }
  return undefined;
}

/** Pay `amt` (+1 per stored money fraction that hits). calc_only: just return the amount. */
export function ease_poke_dollars(card, seed, amt, calc_only) {
  let earned = amt;
  if (isTable(card.ability.extra)) {
    for (const f of ['money_frac', 'money1_frac', 'money2_frac']) {
      if (card.ability[f] !== undefined && card.ability[f] > pseudorandom(pseudoseed(seed))) earned = earned + 1;
    }
  }
  if (!calc_only) ease_dollars(earned);
  return earned;
}
