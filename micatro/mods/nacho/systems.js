/**
 * Nacho's Pokermon Dip — its systems and lovely patches, rebuilt as Pokermon add-on extension
 * points (registered here, at import; every handler checks the mod is ON for the run) and
 * Micatro engine hooks (returned as `hooks` for registerMod):
 *
 *   Stellar Tera type (stellar_type_functionality.toml + the stellar_sticker): counts as every
 *     type — type_sticker_applied / is_type / find_pokemon_type / energy_matches / type_evo /
 *     matching_energy (Pokermon EXTRA_TYPES) and the rainbow badge (SMODS.Gradient sgbadge);
 *     while Terapagos-Stellar is owned every Tera sticker becomes Stellar (TERA_OVERRIDES).
 *   joker_functionality.toml:
 *     Gallade blocks Planet level-ups (level_up_hand hook); Mega Gallade: no hand debuffs
 *     (debuff_hand hook) + the parse_highlighted rule (hand_highlighted hook, ./functions.js);
 *     Audino: level_evo takes an extra step per Audino (LEVEL_EVO_EXTRA);
 *     poke_evolved: Pokermon's poke_backend_evolve already fires it (systems/evolution.js);
 *     Turtonator / Cerulean Bell: the pokermon_forced_selection flag (forced_selection hook);
 *     Passimian receives instead of evolving (EVOLVE_INTERCEPTS), Energy scales the received
 *     card (ENERGIZE_BASE), find_card sees received keys (FIND_CARD_EXTRA), remove() fires
 *     joker_type_destroyed (BEFORE_REMOVE), the Megastone frees itself (MEGASTONE_RESET).
 *     (Smeargle's patch only kept its Lua tooltip from crashing on a Passimian copy: Micatro's
 *     Smeargle copies through calculate_joker, which already reaches the received ability.)
 *   stake_functionality.toml: the Elite stake's showdown antes (boss_eligible hook).
 *   challenge_functionality.toml: Sinnoh Adventure's starter shop (fill_shop_jokers hook).
 *   nacho_functions.lua: set_debuff (Mega Gallade / Altaria's 9s), Oranguru's Standard packs
 *     (pack_card hook).
 */
import {
  G, P_STAKES, any, find_card, calculate_context, isActive, smods_create_card,
  EXTRA_TYPES, TERA_OVERRIDES, TYPE_COLOURS, ENERGIZE_BASE, LEVEL_EVO_EXTRA, EVOLVE_INTERCEPTS,
  FIND_CARD_EXTRA, BEFORE_REMOVE, MEGASTONE_RESET,
  set_debuff, parse_highlighted, standard_pack_card, NACHO_ID,
} from './api.js';
import { received, receive_card, reset_passimian_center } from './pokemon/0766_passimian.js';
import { ANIMATED } from '../pokermon/systems/anim.js';

const on = () => isActive(NACHO_ID);

// ------------------------------------------------------------------ Stellar
/** SMODS.Gradient 'sgbadge' (G.C.RED, G.C.FILTER, then the rainbow), cycle 5s. */
export const STELLAR_GRADIENT = ['#FE5F55', '#FDA200', '#f5db43', '#54e456', '#39cde4', '#515fea', '#a951ea', '#e640b8'];
EXTRA_TYPES.push({ type: 'Stellar', sticker: 'stellar_sticker', wildcard: true, gradient: STELLAR_GRADIENT, cycle: 5, active: on, mod: NACHO_ID });
TYPE_COLOURS.stellar = TYPE_COLOURS.stellar || '#a951ea';
// Terapagos-Stellar: apply_type_sticker always applies Stellar while it's owned.
TERA_OVERRIDES.push(() => (on() && any(find_card('j_nacho_terapagos_stellar')) ? 'Stellar' : undefined));

// ------------------------------------------------------------------ Audino
LEVEL_EVO_EXTRA.push(() => {
  if (!on() || !G.jokers) return 0;
  let n = 0;
  for (const v of G.jokers.cards) if (v.config.center_key === 'j_nacho_audino' && !v.debuff) n = n + 1;
  return n;
});

// ------------------------------------------------------------------ Passimian
const is_passimian = (card) => on() && card && card.config && card.config.center.key === 'j_nacho_passimian';
ENERGIZE_BASE.push((card) => (is_passimian(card) && received(card) ? (received(card).config.extra || {}) : undefined));
EVOLVE_INTERCEPTS.push({
  immediate: (card) => is_passimian(card),
  backend: (card, to_key) => { if (!is_passimian(card)) return false; receive_card(card.config.center, card, to_key); return true; },
});
FIND_CARD_EXTRA.push((key, count_debuffed) => {
  if (!on() || !G.jokers) return [];
  return G.jokers.cards.filter((v) => v.ability && v.ability.received_key === key && (count_debuffed || !v.debuff));
});
BEFORE_REMOVE.push((card, skip) => {
  if (!on() || skip) return undefined;
  card.getting_sliced = true;
  const flags = calculate_context({ joker_type_destroyed: true, card });
  if (flags.some(([, e]) => e && e.no_destroy)) { card.getting_sliced = undefined; return 'no_destroy'; }
  return undefined;
});
MEGASTONE_RESET.push((stone) => {
  if (!on()) return;
  // (Pokermon 3.9.1, batch 16: used_on is the Mega's unique_val, so the Passimian that received the Mega is the card it
  // names; a 3.2.1-shaped used_on, a center key, still matches the received key. 3.9.1's own end-of-round check frees the
  // stone too: a Passimian is no poke_mega card.)
  const u = stone.ability.extra.used_on;
  for (const v of G.jokers.cards) if (v.ability && v.ability.received_key && (v.ability.received_key === u || v.unique_val === u)) stone.ability.extra.used_on = undefined;
});

// ------------------------------------------------------- NachosAnimatedPokemon
ANIMATED.j_nacho_terapagos_stellar = { native: true, frames_per_row: 7, frames: 13, fps: 24, soul: true, soul_size: { x: 108, y: 145 } };

// ------------------------------------------------------------------ hooks
/** The Elite stake (stake_functionality.toml): the last 4 antes before the (raised) win ante draw showdown bosses. */
function boss_eligible(ok, v, ante) {
  if (!G.GAME.modifiers.elite4) return undefined;
  if (v.mod && v.in_pool) return undefined; // (SMODS's in_pool branch comes first in the Lua chain)
  const w = G.GAME.win_ante;
  if (v.boss.showdown) {
    const m = ante % w;
    if (ante >= 2 && (m === w - 3 || m === w - 2 || m === w - 1 || m === 0)) return true;
    return false;
  }
  const a1 = Math.max(1, ante), m1 = a1 % w;
  return v.boss.min <= a1 && ((m1 !== 0 && m1 !== w - 1 && m1 !== w - 2 && m1 !== w - 3) || ante < 2);
}

/** Sinnoh Adventure (challenge rule sinnoh_adv): a fresh shop stocks the three Sinnoh starters. */
function fill_shop_jokers() {
  if (!G.GAME.modifiers.sinnoh_adv) return undefined;
  calculate_context({ starting_shop: true });
  for (const key of ['j_nacho_turtwig', 'j_nacho_chimchar', 'j_nacho_piplup']) G.shop_jokers.emplace(smods_create_card({ set: 'Joker', key, area: G.shop_jokers }));
  return true;
}

export const hooks = {
  start_run() { reset_passimian_center(); },
  set_debuff,
  // Gallade: Planet cards don't level hands while it's owned (it levels your most played hand instead).
  level_up_hand(card) {
    if (any(find_card('j_nacho_gallade')) && card && card.ability && card.ability.set === 'Planet') return false;
    return undefined;
  },
  // Mega Gallade: the blind can't debuff your hand.
  debuff_hand() { return any(find_card('j_nacho_mega_gallade')) ? false : undefined; },
  hand_highlighted: parse_highlighted,
  // Turtonator / Cerulean Bell (blind.lua patch): tag the forced card with a flag that survives the
  // forced_selection reset at play, so press_play can still see the Bell fired.
  forced_selection(card) { card.ability.pokermon_forced_selection = true; },
  pack_card: standard_pack_card,
  boss_eligible,
  fill_shop_jokers,
};

export { P_STAKES };
