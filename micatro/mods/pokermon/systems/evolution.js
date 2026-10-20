/**
 * Evolution — native rebuild of the evolution half of Pokermon's
 * functions/pokefunctions.lua: can_evolve, level_evo, item_evo, scaling_evo,
 * type_evo, deck_suit_evo, deck_enhance_evo, deck_seal_evo, copy_scaled_values,
 * poke_evolve / poke_backend_evolve, get_highest_evo, get_previous_from_mega,
 * get_previous_evo, get_family_keys, poke_get_family_list, plus the family table
 * (pokermon.family / extended_family, from the extracted data).
 *
 * Evolution is an IN-PLACE center swap (the card keeps its sort_id, edition, Tera
 * sticker, perishable/eternal/rental and money fractions — Steamodded's ability
 * persistence does that, see Card.set_ability). Scaled values carry over per
 * copy_scaled_values + the keep-list, energies are re-applied to the new base values,
 * a perishable's tally resets (unless it's a mega), and G.GAME.used_jokers is
 * rebuilt from the cards actually held (the SMODS PR #611 workaround in the Lua).
 *
 * UI: every evolution emits `poke_evolve` {card, from, to} (the renderer plays the
 * evolution flash) and then the "Evolved!" status text. Add-ons get the
 * `poke_evolved` context (Nacho's Pokermon Dip) for non-mega evolutions.
 */
import { G, P_CENTERS, emit, card_eval_status_text, localize, play_sound, pseudorandom_element, pseudoseed, find_joker } from '../../../js/engine/core.js';
import { juice_card_until } from '../../../js/engine/jokers.js';
import { calculate_context } from '../../../js/engine/run.js';
import DATA from '../data.js';
import { find_card, any, cfg } from './utils.js';
import { type_sticker_applied, wildcard_type } from './types.js';
import { energize, energy_increase } from './energy.js';
import { get_random_poke_key } from './pools.js';
import { precedence_key } from './precedence.js';

/** pokermon.family — each entry a list of names or {key, form} tables. Add-ons may push. */
export const family = DATA.globals['pokermon.family'].map((f) => f.slice());
export const extended_family = JSON.parse(JSON.stringify(DATA.globals.extended_family));
const fname = (y) => (y && typeof y === 'object' ? y.key : y);
/** pokermon.add_family */
export function add_family(f) {
  // An add-on family that shares a member with a 3.9.1 family (set_family): 3.9.1's pokermon.add_family
  // (= add_to_family, functions/pokefamily.lua) appends the missing members to that family instead of adding a second
  // one under the same names (Nacho's Ralts line, Pokermon+'s Nincada line). Other families: 3.2.1's push.
  const names = new Set(f.map(fname));
  const into = family.find((v) => FAMILY_391.has(v) && v.some((y) => names.has(fname(y))));
  if (!into) { family.push(f); return; }
  for (const y of f) if (!into.some((z) => fname(z) === fname(y))) into.push(y);
}
const FAMILY_391 = new Set();
/**
 * A Pokermon 3.9.1 family (data391.js families, the new-jokers stack): replaces the 3.2.1 family that shares a member
 * (3.9.1 may extend one: Budew / Roserade join Roselia), else is added.
 */
export function set_family(f) {
  const names = new Set(f.map(fname));
  const i = family.findIndex((v) => v.some((y) => names.has(fname(y))));
  const fam = f.slice();
  FAMILY_391.add(fam);
  if (i >= 0) family[i] = fam; else family.push(fam);
}

const isTable = (x) => x !== null && typeof x === 'object';
/** Lua truthiness: only nil/false are falsy (0 and '' are truthy). */
const lt = (x) => x !== undefined && x !== null && x !== false;
const nameOf = (card) => (!card.name && card.ability && card.ability.name) ? card.ability.name : (card.name || 'bulbasaur');

// -------------------------------------------------------------- triggers
export function can_evolve(self, card, context, forced_key, ignore_step, allow_level) {
  if (!P_CENTERS[forced_key]) return false;
  if (find_joker('everstone').length > 0 && !allow_level) return false;
  return !!(((!context.repetition && !context.individual && context.end_of_round) || ignore_step) && !context.blueprint && !card.gone);
}

/** Evolve after N rounds (ability.extra.rounds counts down at end of round). */
/**
 * Add-on extension point (additive; empty = Pokermon unchanged): fn(card) -> extra countdown steps
 * level_evo takes per round, each with its own "level" status (Nacho's Audino: +1 per
 * non-debuffed Audino — its lovely patch after every `rounds = rounds - 1` / status line).
 */
export const LEVEL_EVO_EXTRA = [];
const level_extra = (card) => { let n = 0; for (const f of LEVEL_EVO_EXTRA) n += f(card) || 0; return n; };

export function level_evo(self, card, context, forced_key) {
  if (card.ability.extra.rounds === undefined) return undefined;
  if (card.debuff) return undefined;
  let ret;
  const level_msg = () => card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('poke_evolve_level') });
  if (can_evolve(self, card, context, forced_key)) {
    if (card.ability.extra.rounds > 0) card.ability.extra.rounds = card.ability.extra.rounds - 1 - level_extra(card);
    if (card.ability.extra.rounds <= 0) ret = { message: poke_evolve(card, forced_key) };
    else { level_msg(); for (let i = level_extra(card); i > 0; i--) level_msg(); }
  } else if (can_evolve(self, card, context, forced_key, null, true)) {
    // Everstone: still counts down, never evolves.
    if (card.ability.extra.rounds > 0) {
      card.ability.extra.rounds = card.ability.extra.rounds - 1 - level_extra(card);
      level_msg(); for (let i = level_extra(card); i > 0; i--) level_msg();
    }
  }
  if (ret) return ret;
  if (can_evolve(self, card, context, forced_key, true) && card.ability.extra.rounds <= 1 && !card.ability.extra.juiced) {
    card.ability.extra.juiced = true;
    juice_card_until(card, (c) => c.ability.extra.rounds !== undefined && c.ability.extra.rounds <= 1 && !find_joker('everstone').length && c.ability.extra.juiced, true);
  }
  return undefined;
}

/** Evolve when an evolution item set ability.extra.evolve (true, or the item name for branching lines). */
export function item_evo(self, card, context, forced_key) {
  const ev = card.ability.extra.evolve;
  if (ev === true || typeof ev === 'string') {
    if (typeof ev === 'string') forced_key = card.ability.extra.evo_list && card.ability.extra.evo_list[ev];
    if (forced_key && can_evolve(self, card, context, forced_key)) {
      card.ability.extra.evolve = undefined;
      return { message: poke_evolve(card, forced_key) };
    }
    if (can_evolve(self, card, context, forced_key, true) && !card.ability.extra.juiced) {
      card.ability.extra.juiced = true;
      juice_card_until(card, (c) => c.ability.extra.evolve && !c.removed, true);
    }
  }
  return undefined;
}

/** Evolve at end of round once current >= target. */
export function scaling_evo(self, card, context, forced_key, current, target, evo_message) {
  if (can_evolve(self, card, context, forced_key) && current >= target) return { message: poke_evolve(card, forced_key, null, evo_message) };
  if (can_evolve(self, card, context, forced_key, true) && current >= target && !card.ability.extra.juiced) {
    card.ability.extra.juiced = true;
    juice_card_until(card, () => current >= target && !card.removed, true);
  }
  return undefined;
}

/** Evolve at end of round when the card carries the type_req Tera sticker. */
export function type_evo(self, card, context, forced_key, type_req) {
  // (wildcard_type: an add-on's every-type Tera sticker — Nacho's Stellar — satisfies any type_req.)
  if (can_evolve(self, card, context, forced_key) && (wildcard_type(card) || card.ability[type_req + '_sticker'])) return { message: poke_evolve(card, forced_key) };
  if (can_evolve(self, card, context, forced_key, true) && (wildcard_type(card) || card.ability[type_req + '_sticker']) && !card.ability.extra.juiced) {
    card.ability.extra.juiced = true;
    juice_card_until(card, (c) => (wildcard_type(c) || c.ability[type_req + '_sticker']) && !c.removed, true);
  }
  return undefined;
}

export function deck_suit_evo(self, card, context, forced_key, suit, percentage) {
  if (can_evolve(self, card, context, forced_key)) {
    let n = 0;
    for (const v of G.playing_cards) if (v.is_suit(suit)) n++;
    if (n / G.playing_cards.length >= percentage) return { message: poke_evolve(card, forced_key) };
  }
  return undefined;
}

export function deck_enhance_evo(self, card, context, forced_key, enhancement, percentage, flat) {
  if (can_evolve(self, card, context, forced_key)) {
    let n = 0;
    for (const v of G.playing_cards) if (v.ability.name === enhancement + ' Card') n++;
    if (percentage && n / G.playing_cards.length >= percentage) return { message: poke_evolve(card, forced_key) };
    if (flat && n >= flat) return { message: poke_evolve(card, forced_key) };
  }
  return undefined;
}

export function deck_seal_evo(self, card, context, forced_key, seal, percentage, flat) {
  if (can_evolve(self, card, context, forced_key)) {
    let n = 0;
    for (const v of G.playing_cards) {
      if (seal && v.seal === seal) n++;
      else if (!seal && v.seal) n++;
    }
    if (percentage && n / G.playing_cards.length >= percentage) return { message: poke_evolve(card, forced_key) };
    if (flat && n >= flat) return { message: poke_evolve(card, forced_key) };
  }
  return undefined;
}

// --------------------------------------------------------------- the swap
/** Which scaled extra values survive an evolution (mult/chips/Xmult/Xmult_multi/money with a *_mod, or copy_scaled). */
export function copy_scaled_values(card) {
  // (Pokermon 3.9.1 adds Xmult_multi: Munna's X Mult carries over to Musharna; new-jokers sub-batch 15)
  const values = { mult: 0, chips: 0, Xmult: 0, Xmult_multi: 0, money: 0 };
  const ex = card.ability && card.ability.extra;
  if (isTable(ex)) {
    for (const l of Object.keys(values)) {
      if ((lt(ex[l]) && (lt(ex[l + '_mod']) || lt(ex[l.slice(0, -1) + '_mod']))) || card.config.center.copy_scaled) {
        values[l] = ex[l];
      }
    }
  }
  return values;
}

/**
 * poke_evolve(card, to_key, immediate, evolve_message, transformation). Returns undefined
 * (the Lua returns nil — calculate() wraps it as {message = nil}). Randomizer challenge:
 * G.GAME.modifiers.apply_randomizer swaps the target for a random Pokémon.
 */
/**
 * pokermon.evolve(card, to_key, immediate, evolve_message, transformation, energize_amount): energize_amount (3.9.1,
 * batch 8: the Mystery Egg hatches through it) adds that many Energy (type 'Trans') after the swap.
 */
export function poke_evolve(card, to_key, immediate, evolve_message, transformation, energize_amount) {
  if (G.GAME.modifiers.apply_randomizer && !transformation) to_key = get_random_poke_key('randomizer');
  // Add-on dedupe (precedence.js): an evolution into an add-on duplicate of a Pokermon joker gives Pokermon's.
  to_key = precedence_key(to_key);
  for (const f of EVOLVE_INTERCEPTS) if (f.immediate && f.immediate(card, to_key)) immediate = true;
  if (immediate) { poke_backend_evolve(card, to_key, energize_amount); return undefined; }
  G.E_MANAGER.add_event(() => {
    if (card.evolution_timer || P_CENTERS[to_key] === card.config.center || card.removed) return;
    card.evolution_timer = 0;
    const from = card.config.center.key;
    emit('poke_evolve', { card: card.sort_id, from, to: to_key });
    poke_backend_evolve(card, to_key, energize_amount);
    card.evolution_timer = undefined;
    play_sound('tarot1');
    card_eval_status_text(card, 'extra', null, null, null, { message: evolve_message || localize('poke_evolve_success'), colour: 'FILTER', instant: true });
  });
  return undefined;
}

// (+ cards_drawn: 3.9.1 pokermon.get_values_to_keep — the Spearow line counts cards drawn.)
const NAMES_TO_KEEP = ['targets', 'rank', 'id', 'cards_scored', 'cards_drawn', 'upgrade', 'hazards_drawn', 'energy_count', 'c_energy_count', 'form', 'jack_target', 'jacks_discarded'];

/**
 * Add-on extension points (additive; empty = Pokermon unchanged), mirroring the lovely patches
 * add-ons put on poke_backend_evolve:
 *   EVO_KEEP      extra ability.extra names carried through every evolution, restored even when
 *                 the new center doesn't have them (like energy_count). Pokermon+: 'energy_plus'.
 *   POST_EVOLVE   fn(card, from_key, to_key) after the kept / custom values are restored (the
 *                 spot before `if new_card.soul_pos`). Pokermon+: re-apply the Weakened sticker.
 */
export const EVO_KEEP = [];
export const POST_EVOLVE = [];
/**
 * Add-on extension point (additive; empty = Pokermon unchanged): {immediate(card, to_key),
 * backend(card, to_key)} — `immediate` true makes poke_evolve swap at once (no event);
 * `backend` true means the add-on handled the "evolution" itself and the swap is skipped.
 * Nacho's Passimian RECEIVES the evolved ability instead of evolving (its lovely patches on
 * poke_evolve / poke_backend_evolve).
 */
export const EVOLVE_INTERCEPTS = [];

export function poke_backend_evolve(card, to_key, energize_amount) {
  to_key = precedence_key(to_key); // (add-on dedupe, as poke_evolve)
  for (const f of EVOLVE_INTERCEPTS) if (f.backend && f.backend(card, to_key)) return;
  const custom_values_to_keep = {};
  let has_custom = false;
  const new_card = P_CENTERS[to_key];
  if (!new_card || card.config.center === new_card) return;
  const old_key = card.config.center.key;
  // turn off multisprite on evolution
  if (card.config.center.poke_multi_sprite && isTable(card.ability.extra)) {
    card.ability.extra.loaded_pos = undefined;
    card.ability.extra.loaded_sprite = undefined;
  }
  // not a mega and still has rounds left: reset the perish tally
  if (card.ability.perishable && card.config.center.rarity !== 'poke_mega') {
    card.ability.perish_tally = G.GAME.perishable_rounds;
    card.debuff = false;
  }
  const names = NAMES_TO_KEEP.concat(EVO_KEEP);
  if (type_sticker_applied(card)) names.push('ptype');
  const values_to_keep = copy_scaled_values(card);
  if (isTable(card.ability.extra)) for (const k of names) values_to_keep[k] = card.ability.extra[k];
  if (lt(values_to_keep.hazards_drawn)) values_to_keep.hazards_drawn = values_to_keep.hazards_drawn % 2;
  // (3.2.1's Spearow carry-over — 15+ cards scored arms Fearow — is gone: 3.9.1's Spearow line counts cards drawn.)
  if (card.config.center.poke_custom_values_to_keep) {
    for (const v of card.config.center.poke_custom_values_to_keep) custom_values_to_keep[v] = card.ability.extra[v];
    has_custom = true;
  }

  card.set_ability(new_card, true);
  card.set_cost();
  // Nacho's Pokermon Dip adds this context right here (lovely patch on pokefunctions.lua).
  if (new_card.rarity !== 'poke_mega' && P_CENTERS[old_key].rarity !== 'poke_mega') calculate_context({ poke_evolved: true, card, from: old_key, to: to_key });

  const ex = card.ability.extra;
  if (isTable(ex)) {
    for (const [k, v] of Object.entries(values_to_keep)) {
      // (Lua pairs() never yields a nil value: a kept name the old card lacks — the Mystery Egg hatching in place has no
      // `targets` — leaves the new card's own value alone. Batch 8: 3.2.1's JS port deleted it.)
      if (v === undefined || v === null) continue;
      if (lt(ex[k]) || k === 'energy_count' || k === 'c_energy_count' || EVO_KEEP.includes(k)) {
        if (typeof ex[k] !== 'number' || (typeof v === 'number' && v > ex[k]) || k === 'form' || k === 'jack_target') {
          ex[k] = v;
        }
      }
    }
    // (3.2.1 set Gourgeist's payout from its size here — $2 / $5 / $8 / $11; 3.9.1 dropped it: config money at every size.)
    if (lt(ex.energy_count) || lt(ex.c_energy_count)) energize(card, null, true, true);
  }
  if (has_custom) for (const [k, v] of Object.entries(custom_values_to_keep)) card.ability.extra[k] = v;
  for (const f of POST_EVOLVE) f(card, old_key, to_key);
  if (energize_amount) for (let i = 0; i < energize_amount; i++) energy_increase(card, 'Trans');
  if (card.edition && card.edition.poke_shiny) play_sound('poke_e_shiny', 1, 0.2);
  card.juice_up();
  // SMODS PR #611 workaround: forget used_jokers keys no card holds any more.
  for (const k of Object.keys(G.GAME.used_jokers)) if (!any(find_card(k, true))) delete G.GAME.used_jokers[k];
  emit('card_changed', { card: card.sort_id });
}

// ---------------------------------------------------------- family lookups
export function poke_get_family_list(name) {
  for (const v of family) for (const y of v) if (fname(y) === name) return v;
  return [];
}

/** Highest stage of the card's line (ignoring megas / aux forms); random among branches. */
export function get_highest_evo(card) {
  const evos = highest_evo_options(card);
  if (!evos) return false;
  if (evos.length === 1) return evos[0];
  return pseudorandom_element(evos, pseudoseed('highest'))[0];
}

/** Whether get_highest_evo would evolve this card (no RNG drawn: safe inside a can_use). */
export function can_evolve_to_highest(card) { return !!highest_evo_options(card); }

/** get_highest_evo's candidates (the highest-stage forms of the line), or false when there are none. */
function highest_evo_options(card) {
  const name = nameOf(card);
  const prefix = 'j_' + (card.config.center.poke_custom_prefix || 'poke') + '_';
  let found_family = null;
  for (const v of family) for (const y of v) if (fname(y) === name) found_family = v;
  if (!found_family) return false;
  let max = found_family.length;
  let max_evo_name = fname(found_family[max - 1]);
  while (max > 0 && (max_evo_name.slice(0, 5) === 'mega_' || (P_CENTERS[prefix + max_evo_name] && P_CENTERS[prefix + max_evo_name].aux_poke))) {
    max = max - 1;
    max_evo_name = fname(found_family[max - 1]);
  }
  if (!P_CENTERS[prefix + max_evo_name]) return false;
  const max_stage = P_CENTERS[prefix + max_evo_name].stage;
  if (P_CENTERS[prefix + name] && P_CENTERS[prefix + name].stage === max_stage) return false;
  const evos = [max_evo_name];
  max = max - 1;
  while (max > 0) {
    const evo_name = fname(found_family[max - 1]);
    if (P_CENTERS[prefix + evo_name] && max_stage === P_CENTERS[prefix + evo_name].stage) { evos.push(evo_name); max = max - 1; } else break;
  }
  return evos;
}

export function get_previous_from_mega(name, prefix, full_key) {
  let prev = name.slice(5);
  if (prev.slice(-2) === '_x' || prev.slice(-2) === '_y') prev = prev.slice(0, -2);
  const k = 'j_' + prefix + '_' + prev;
  if (full_key) return P_CENTERS[k] ? k : undefined;
  return P_CENTERS[k] ? prev : undefined;
}

const STAGES = ['Baby', 'Basic', 'One', 'Two', 'Legendary', 'Mega'];
/** The previous stage in the card's line (megas devolve to their base form). */
export function get_previous_evo(card, full_key) {
  const prefix = card.config.center.poke_custom_prefix || 'poke';
  const name = nameOf(card);
  let prev;
  if (name.slice(0, 5) === 'mega_') { const mega = get_previous_from_mega(name, prefix, full_key); if (mega) return mega; }
  let found = false;
  for (const v of family) {
    for (let x = 0; x < v.length; x++) {
      const cur_name = fname(v[x]);
      if (cur_name !== name) continue;
      found = true;
      const cur_stage = card.config.center.stage;
      let prev_stage;
      for (let i = 0; i < STAGES.length; i++) {
        if (cur_stage && cur_stage === STAGES[i] && i !== 0) prev_stage = cur_stage === 'Legendary' ? 'Legendary' : STAGES[i - 1];
      }
      if (cur_name === 'lunala' || cur_name === 'solgaleo') { prev = 'cosmoem'; break; }
      if (cur_name === 'urshifu_single_strike' || cur_name === 'urshifu_rapid_strike') { prev = 'kubfu'; break; }
      let xi = x;
      while (xi > 0) {
        xi = xi - 1;
        const prev_name = fname(v[xi]);
        const pc = P_CENTERS['j_' + prefix + '_' + prev_name];
        if (pc && pc.stage === prev_stage && !(pc.aux_poke === true)) { prev = prev_name; break; }
      }
      if (prev === undefined) return undefined;
      break;
    }
    if (found) break;
  }
  if (full_key && prev) prev = 'j_' + prefix + '_' + prev;
  return prev;
}

/** All keys in the card's family (+ extended family, smeargle copy, item requirements). */
export function get_family_keys(cardname, custom_prefix, card) {
  const keys = [];
  const initial_custom_prefix = custom_prefix;
  let pre = custom_prefix ? 'j_' + custom_prefix + '_' : 'j_poke_';
  if (card && card.config.center.poke_multi_item) pre = initial_custom_prefix ? 'c_' + initial_custom_prefix + '_' : 'c_poke_';
  let line = null;
  for (const v of family) { for (const y of v) if (y === cardname || (isTable(y) && y.key === cardname)) { line = v; break; } if (line) break; }
  if (line) {
    for (const y of line) {
      if (isTable(y)) { const t = { key: pre + y.key }; for (const [k, v] of Object.entries(y)) if (k !== 'key') t[k] = v; keys.push(t); }
      else keys.push(pre + y);
    }
  } else keys.push(pre + cardname);
  for (const [k, v] of Object.entries(extended_family)) {
    if (k !== cardname) continue;
    for (const y of v) {
      if (isTable(y)) keys.push(y.item ? (y.custom_prefix || 'c_poke_') + y.name : pre + y.name);
      else keys.push(pre + y);
    }
  }
  // 3.9.1: Smeargle's family includes the joker it copies (center:get_copy).
  if (cardname === 'smeargle' && card && card.config.center.get_copy) {
    const copy = card.config.center.get_copy(card.config.center, card);
    if (copy) keys.push(copy.config.center.key);
  }
  if (cardname === 'ruins_of_alph' && card) for (const v of Object.values(card.ability.extra.forms || {})) keys.push({ key: 'j_poke_unown', form: v });
  const req = card && card.config && card.config.center && card.config.center.item_req;
  if (req) {
    const NATIVE = ['firestone', 'waterstone', 'leafstone', 'thunderstone', 'dawnstone', 'shinystone', 'moonstone', 'duskstone',
      'sunstone', 'icestone', 'prismscale', 'upgrade', 'dubious_disc', 'linkcable', 'kingsrock', 'dragonscale', 'hardstone'];
    for (const r of Array.isArray(req) ? req : [req]) keys.push('c_' + (NATIVE.includes(r) ? 'poke' : initial_custom_prefix) + '_' + r);
  }
  return keys;
}

/**
 * pokeutils.lua set_joker_family_win(card), run for every joker when a run is won (lovely.toml "Pokermon Family
 * Stake Sticker Logic", after vanilla's set_joker_win bookkeeping): with the previous_evo_stickers option on, a
 * winning Pokémon also earns the win (stake sticker) for its earlier stages — not for later evolutions, not for
 * the other branches of a split line — plus same-stage forms (aux_poke) and auto_sticker entries.
 * Returns the extra joker keys (the card's own key is vanilla's); the engine reports them in the 'win' event.
 */
export function family_win_keys(card) {
  if (!cfg('previous_evo_stickers')) return [];
  const c = card.config.center;
  if (!c || c.set !== 'Joker' || !c.stage || !c.name) return [];
  const keys = get_family_keys(c.name, c.poke_custom_prefix, card);
  const out = [];
  if (keys.length <= 1) return out;
  const prev = get_previous_evo(card, true);
  const prev_stage = prev && P_CENTERS[prev] ? P_CENTERS[prev].stage : undefined;
  let index;
  for (let k = 0; k < keys.length; k++) {
    let v = keys[k];
    if (isTable(v)) v = v.key;
    if (v === c.key) index = k;
    const P = P_CENTERS[v];
    if (!P) continue;
    // Excludes higher evolutions
    if (index !== undefined && k > index && (P.stage !== c.stage || P.stage === 'Legendary') && P.auto_sticker !== true) break;
    if ((P.set === 'Joker' && P.stage !== c.stage && // excludes the same-stage mons in an evo line
          !((c.stage === 'One' || c.stage === 'Two' || c.stage === 'Mega') && prev_stage !== undefined && P.stage === prev_stage && v !== prev)) || // branching evos in previous stages
        (c.stage === 'Legendary' && prev && P.stage === prev_stage) || // (i.e. Meltan, Cosmog, Terapagos)
        (P.set === 'Joker' && P.aux_poke === true && P.stage === c.stage) || // forms (same stage: Jirachi, Rotom)
        (P.set === 'Joker' && P.auto_sticker === true)) {
      // (add-on dedupe: a replaced add-on key's win goes to Pokermon's joker — precedence.js)
      const w = precedence_key(v);
      if (w !== c.key && !out.includes(w)) out.push(w);
    }
  }
  return out;
}
