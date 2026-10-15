/**
 * Pokémon types and Tera type stickers — native rebuild of the type half of
 * Pokermon's functions/pokefunctions.lua (type_sticker_applied, find_pokemon_type,
 * is_type, get_type, has_type, apply_type_sticker, poke_set_type_badge,
 * type_tooltip, find_other_poke_or_energy_type) and stickers/stickers.lua.
 *
 * A Pokémon joker's type lives in `card.ability.extra.ptype` (copied from the
 * center's `ptype` at registration, like pokermon.load_pokemon). A Tera sticker is
 * the ability flag `<type>_sticker` (grass_sticker, ...); it overrides the type and
 * can sit on ANY joker (base-game jokers too). Steamodded's ability persistence
 * keeps the flag through evolution.
 *
 * Badges: Pokermon used SMODS take_ownership to give base jokers a type badge
 * and the energy tooltip; Micatro does that through the engine's `describe` hook.
 */
import { G, pseudorandom_element, pseudoseed, localize } from '../../../js/engine/core.js';
import { cfg } from './utils.js';

export const POKETYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];

/** Type colours (pokesprites.lua loc_colour) — also used by the badges / sticker art. */
export const TYPE_COLOURS = {
  dark: '#0086a5', lightning: '#f8f800', fire: '#f81020', water: '#38b8f8', earth: '#e97333', fairy: '#ff3db6',
  fighting: '#b85838', colorless: '#c8c0f8', psychic: '#c135ff', metal: '#888080', grass: '#289830', dragon: '#c8a800',
  bird: '#F7B58C', pink: '#FF7ABF', item: '#9AA4B7', safari: '#F2C74E', pocket: '#E8C069',
};

const STICKER_ORDER = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth'];

/** -> 'Grass' | ... | false : the Tera sticker on a card. */
export function type_sticker_applied(card) {
  if (!card || !card.ability) return false;
  for (const t of STICKER_ORDER) if (card.ability[t + '_sticker']) return POKETYPES[STICKER_ORDER.indexOf(t)];
  return false;
}

const extraTable = (card) => card && card.ability && card.ability.extra && typeof card.ability.extra === 'object' ? card.ability.extra : null;

/** Jokers of a type (by ptype or Tera sticker). */
export function find_pokemon_type(target_type) {
  const found = [];
  if (G.jokers && G.jokers.cards) {
    for (const v of G.jokers.cards) {
      const ex = extraTable(v);
      if (v.ability && ((ex && target_type === ex.ptype) || v.ability[String(target_type).toLowerCase() + '_sticker'])) found.push(v);
    }
  }
  return found;
}

export function is_type(card, target_type) {
  const ex = extraTable(card);
  return !!(card.ability && ((ex && target_type === ex.ptype) || card.ability[String(target_type).toLowerCase() + '_sticker']));
}

export function get_type(card) {
  if (card.ability) {
    const sticker = type_sticker_applied(card);
    if (sticker) return sticker;
    const ex = extraTable(card);
    if (ex && ex.ptype) return ex.ptype;
  }
  return undefined;
}

/** Truthy when the card has a type (its ptype or a Tera sticker). */
export function has_type(card) {
  const ex = extraTable(card);
  return (ex && ex.ptype) || type_sticker_applied(card);
}

/** Put a Tera sticker on a card (random type when none given), clearing the others. */
export function apply_type_sticker(card, sticker_type) {
  let apply_type;
  if (sticker_type) apply_type = sticker_type;
  else apply_type = pseudorandom_element(POKETYPES, pseudoseed('tera'))[0];
  card.ability[apply_type.toLowerCase() + '_sticker'] = true;
  for (const v of POKETYPES) if (v.toLowerCase() !== apply_type.toLowerCase()) card.ability[v.toLowerCase() + '_sticker'] = false;
  const ex = extraTable(card);
  if (ex && ex.ptype) ex.ptype = apply_type;
  return apply_type;
}

/** Type-change helper used by items like Tera Orb / Metal Coat (sticker swap). */
export function remove_type_stickers(card) {
  for (const v of POKETYPES) card.ability[v.toLowerCase() + '_sticker'] = false;
}

/** Type badge (poke_set_type_badge): {key, label, colour, text_colour}. */
export function type_badge(card) {
  let ptype = get_type(card);
  if (!ptype) return undefined;
  const lower = ptype.toLowerCase();
  let label = localize('poke_' + lower + '_badge');
  if (type_sticker_applied(card)) label = label + ' ' + localize('poke_tera');
  // (Lua: a Bird badge flickers away 1 frame in 6 via math.random — a renderer effect; the
  // description must not consume run RNG, so the view marks it and the UI may flicker it.)
  return { key: 'poke_type', type: ptype, label, colour: TYPE_COLOURS[lower], text_colour: ptype === 'Lightning' ? '#000000' : '#FFFFFF', flicker: lower === 'bird' || undefined };
}
/** center.set_badges for Pokémon jokers. */
export function poke_set_type_badge(self, card, badges) {
  const b = type_badge(card);
  if (b) badges.push(b);
}

/** Energy / money-fraction tooltips (type_tooltip) pushed onto a loc_vars info_queue. */
export function type_tooltip(self, info_queue, center) {
  if (!center || !center.ability) return;
  const a = center.ability;
  const ex = extraTable(center);
  const max = G.GAME ? (G.GAME.energy_plus || 0) + ENERGY_MAX() : ENERGY_MAX();
  const pct = (f) => Math.round(Number(f.toFixed(3)) * 100 * 1000) / 1000;
  if (ex && ((ex.energy_count || 0) + (ex.c_energy_count || 0) > 0)) {
    info_queue.push({ set: 'Other', key: 'energy', vars: [(ex.energy_count || 0) + (ex.c_energy_count || 0), max] });
    for (const [f, key] of [['money_frac', 'money_chance'], ['money1_frac', 'money_chance'], ['money2_frac', 'money_chance'], ['money_mod_frac', 'money_progress'], ['mult_mod_frac', 'mult_progress'], ['chip_mod_frac', 'chip_progress']]) {
      if (a[f] && a[f] > 0) { const p = pct(a[f]); if (p !== 100 && p !== 0) info_queue.push({ set: 'Other', key, vars: [p] }); }
    }
  } else if ((a.energy_count || 0) + (a.c_energy_count || 0) > 0) {
    info_queue.push({ set: 'Other', key: 'energy', vars: [(a.energy_count || 0) + (a.c_energy_count || 0), max] });
    if (a.money_frac) { const p = pct(a.money_frac); if (p !== 100 && p !== 0) info_queue.push({ set: 'Other', key: 'money_chance', vars: [p] }); }
  }
}
let _emax = 3;
export const ENERGY_MAX = () => _emax;
export function set_energy_max(n) { _emax = n; }

/** Count other jokers of a type plus matching Energy cards held. */
export function find_other_poke_or_energy_type(card, poke_type, count_self) {
  const energy = poke_type.toLowerCase() === 'dark' ? 'darkness_energy' : poke_type.toLowerCase() + '_energy';
  let type_count = find_pokemon_type(poke_type).length;
  if (is_type(card, poke_type) && !count_self) type_count = type_count - 1;
  const energies = G.consumeables ? G.consumeables.cards.filter((v) => v.ability.name === energy && !v.debuff).length +
    G.jokers.cards.filter((v) => v.ability.name === energy && !v.debuff).length : 0;
  if (type_count > 0 || energies > 0) return type_count + energies;
  return 0;
}

/** Whether detailed tooltips are on (pokermon_config.detailed_tooltips). */
export const detailed = () => cfg('detailed_tooltips') !== false;
