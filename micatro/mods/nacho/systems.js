/**
 * Nacho's Pokermon Dip — its systems and lovely patches, rebuilt as Pokermon add-on extension points (registered here, at
 * import; every handler checks the mod is ON for the run) and Micatro engine hooks (returned as `hooks` for registerMod).
 * 1.7.9 (batch 18 / 19) unless marked legacy:
 *
 *   Stellar Tera type (Terapagos init hooks + the stellar_sticker): counts as every type — type_sticker_applied / is_type /
 *     find_pokemon_type / energy_matches / type_evo / matching_energy (Pokermon EXTRA_TYPES) and the rainbow badge
 *     (SMODS.Gradient sgbadge); while Terapagos-Stellar is owned every Tera sticker becomes Stellar (TERA_OVERRIDES).
 *   Terapagos-Stellar's animated soul (1.7.9 atlas terapagos_stellar_soul: 13 frames of 110 x 147 at 12 fps over the Gen 9
 *     card {4,6}; Pokermon's ANIMATED `soul_only`).
 *   Audino (context.lua + its `evolution` re-fire): level_evo takes an extra step per Audino (LEVEL_EVO_EXTRA); poke_evolved:
 *     Pokermon's poke_backend_evolve fires it for non-Mega evolutions (systems/evolution.js).
 *   Dedenne (context.lua): the dedenne_trig context when a held Gold card triggers (held_card_evaluated: its end-of-round
 *     payout, or held scoring with chips / mult).
 *   Turtonator (its Card:set_debuff wrap + the SMODS debuff patch): any debuff while it is owned fires shell_trap (debuff_set).
 *   Dhelmise (its Card:get_chip_h_x_mult wrap): held Steel cards' X Mult + 5% per Energy on every Dhelmise (chip_h_x_mult).
 *   Mega Gallade: +Energy limit on a random joker per Item — the e_limit_up bonus (ENERGY_LIMIT_BONUS), kept through
 *     evolution (EVO_KEEP, as 3.9.1's get_values_to_keep does).
 *   Goomy line: POKE_EVO_OVERRIDES (Sliggoo -> Goodra, Hisuian Sliggoo -> Hisuian Goodra): Pokermon EVO_OVERRIDES.
 *   Turtwig line: Seed Money / Money Tree raise the interest cap by $25 / $50 instead of setting it (apply_to_run).
 *   Palafin (mod.lua calculate): a Palafin that vanished comes back at the end of the round as Palafin-Hero (a copy,
 *     transformed), then the reserved slots are released.
 *   Passimian receives instead of evolving (EVOLVE_INTERCEPTS), Energy scales the received card (ENERGIZE_BASE), find_card
 *     sees received keys (FIND_CARD_EXTRA), remove() fires joker_type_destroyed (BEFORE_REMOVE), the Megastone frees itself
 *     (MEGASTONE_RESET).
 *   Sinnoh Adventure (challenge.toml + mod.lua): the FIRST shop of the run stocks the three Sinnoh starters (1.7.9 clears the
 *     modifier after it; 1.6.4 stocked every fresh shop).
 *   functions.js set_debuff: Mega Gallade / Tsareena / 9s with Mega Altaria.
 *   (legacy) Gallade (1.6.4): Planet cards don't level hands while it's owned (level_up_hand).
 * 1.7.9 dropped: the Elite stake (Pokermon owns stake_poke_elite: ../index.js aliases), 1.6.4 Mega Gallade's hand-debuff and
 * highlight rules, the Oranguru Standard-pack card, the Cerulean Bell forced-selection flag (calc_boss_trigger is gone).
 */
import {
  G, P_CENTERS, any, find_card, calculate_context, isActive, smods_create_card, smods_copy_card, poke_evolve, localize,
  card_eval_status_text, has_enhancement,
  EXTRA_TYPES, TERA_OVERRIDES, TYPE_COLOURS, ENERGIZE_BASE, LEVEL_EVO_EXTRA, EVOLVE_INTERCEPTS, ENERGY_LIMIT_BONUS, EVO_KEEP,
  EVO_OVERRIDES, FIND_CARD_EXTRA, BEFORE_REMOVE, MEGASTONE_RESET,
  set_debuff, NACHO_ID,
} from './api.js';
import { received, receive_card, reset_passimian_center } from './pokemon/0766_passimian.js';
import { vanished } from './pokemon/0963_finizen.js';
import { total_ecount } from './pokemon/0781_dhelmise.js';
import { defer, release_reserved_slots } from './dip.js';
import { ANIMATED } from '../pokermon/systems/anim.js';

const on = () => isActive(NACHO_ID);

// ------------------------------------------------------------------ Stellar
/** SMODS.Gradient 'sgbadge' (G.C.RED, G.C.FILTER, then the rainbow), cycle 5s. */
export const STELLAR_GRADIENT = ['#FE5F55', '#FDA200', '#f5db43', '#54e456', '#39cde4', '#515fea', '#a951ea', '#e640b8'];
EXTRA_TYPES.push({ type: 'Stellar', sticker: 'stellar_sticker', wildcard: true, gradient: STELLAR_GRADIENT, cycle: 5, active: on, mod: NACHO_ID });
TYPE_COLOURS.stellar = TYPE_COLOURS.stellar || '#a951ea';
// Terapagos-Stellar: apply_type_sticker always applies Stellar while it's owned.
TERA_OVERRIDES.push(() => (on() && any(find_card('j_nacho_terapagos_stellar')) ? 'Stellar' : undefined));
// Its floating sprite: 1.7.9's animated soul (atlas nacho_terapagos_stellar_soul179 / _shiny: ../index.js), one row of 13.
ANIMATED.j_nacho_terapagos_stellar = { native: true, soul_only: true, atlas: 'nacho_terapagos_stellar_soul179', shiny_atlas: 'nacho_shiny_terapagos_stellar_soul179', frames_per_row: 13, frames: 13, fps: 12, soul: true };

// ------------------------------------------------------------------ Audino
LEVEL_EVO_EXTRA.push(() => {
  if (!on() || !G.jokers) return 0;
  let n = 0;
  for (const v of G.jokers.cards) if (v.config.center_key === 'j_nacho_audino' && !v.debuff) n = n + 1;
  return n;
});

// ------------------------------------------------------------------ Mega Gallade's Energy limit bonus
ENERGY_LIMIT_BONUS.push((card) => {
  if (!on() || !card || !card.ability) return 0;
  const ex = card.ability.extra;
  return (ex !== null && typeof ex === 'object' ? ex.e_limit_up : card.ability.nacho_e_limit_up) || 0;
});
if (!EVO_KEEP.includes('e_limit_up')) EVO_KEEP.push('e_limit_up');

// ------------------------------------------------------------------ Goomy line (POKE_EVO_OVERRIDES)
EVO_OVERRIDES.push(['sliggoo', ['goodra']], ['hisuian_sliggoo', ['hisuian_goodra']]);

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
  const u = stone.ability.extra.used_on;
  for (const v of G.jokers.cards) if (v.ability && v.ability.received_key && (v.ability.received_key === u || v.unique_val === u)) stone.ability.extra.used_on = undefined;
});

// ------------------------------------------------------------------ hooks
/** Sinnoh Adventure (challenge rule sinnoh_adv): the first shop stocks the three Sinnoh starters (then the rule is spent). */
function fill_shop_jokers() {
  if (!G.GAME.modifiers.sinnoh_adv) return undefined;
  calculate_context({ starting_shop: true });
  for (const key of ['j_nacho_turtwig', 'j_nacho_chimchar', 'j_nacho_piplup']) G.shop_jokers.emplace(smods_create_card({ set: 'Joker', key, area: G.shop_jokers }));
  G.GAME.modifiers.sinnoh_adv = undefined;
  return true;
}

/** Palafin's return (mod.lua calculate, end_of_round): each vanished Palafin comes back as a Palafin-Hero copy. */
function palafin_return() {
  const m = vanished();
  if (!m.size) return;
  for (const c of m.values()) {
    defer(() => {
      const new_card = smods_copy_card(c, { area: G.jokers });
      poke_evolve(new_card, 'j_nacho_palafin_hero', true);
      card_eval_status_text(new_card, 'extra', null, null, null, { message: localize('poke_transform_success'), colour: 'CHIPS' });
    });
  }
  defer(() => release_reserved_slots());
  m.clear();
}

/** A held Gold card triggered (Dedenne's dedenne_trig, its lovely context patches). */
function held_card_evaluated(hc, effects, phase) {
  if (!on() || !has_enhancement(hc, 'm_gold') || !effects || !effects[0]) return;
  const own = effects[0];
  const triggered = phase === 'end_of_round' ? (own.h_dollars > 0) : !!(own.h_chips || own.h_mult || own.x_chips || own.x_mult);
  if (triggered && any(find_card('j_nacho_dedenne'))) calculate_context({ dedenne_trig: true });
}

export const hooks = {
  start_run() { reset_passimian_center(); vanished().clear(); },
  set_debuff,
  // (legacy) Nacho's 1.6.4 Gallade: Planet cards don't level hands while it's owned (it levels your most played hand instead).
  level_up_hand(card) {
    if (any(find_card('j_nacho_gallade')) && card && card.ability && card.ability.set === 'Planet') return false;
    return undefined;
  },
  fill_shop_jokers,
  // Seed Money / Money Tree (Turtwig's init): +$25 / +$50 interest cap on top of what it is (the vanilla effect sets 50 / 100).
  apply_to_run(self, center) {
    if (!on() || !center || (center.name !== 'Seed Money' && center.name !== 'Money Tree')) return;
    const inc = center.name === 'Seed Money' ? 25 : 50;
    G.E_MANAGER.add_event(() => {
      const before = G.GAME.interest_cap;
      G.E_MANAGER.add_event(() => { G.GAME.interest_cap = before + inc; });
    });
  },
  // Turtonator: a debuff (a joker or a playing card) while it is owned arms Shell Trap.
  debuff_set(card, should_debuff) {
    if (!on() || !G.jokers) return;
    if ((card.debuff || should_debuff) && (card.area === G.jokers || card.playing_card) && any(find_card('j_nacho_turtonator'))) calculate_context({ shell_trap: true });
  },
  held_card_evaluated,
  // Dhelmise: held Steel cards' X Mult + 5% per Energy on every Dhelmise.
  chip_h_x_mult(v, card) {
    if (!on() || !v || !has_enhancement(card, 'm_steel') || !any(find_card('j_nacho_dhelmise'))) return undefined;
    return v + v * 0.05 * total_ecount();
  },
  // the mod's own calculate (opted in through smods_seams): Palafin's return at the end of the round
  calculate(context) {
    if (context.end_of_round && on()) palafin_return();
    return undefined;
  },
};

export { P_CENTERS };
