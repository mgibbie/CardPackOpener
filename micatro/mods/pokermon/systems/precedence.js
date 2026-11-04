/**
 * Add-on dedupe (Pokermon precedence) — PORTING.md "Add-on dedupe (Pokermon precedence)".
 *
 * Owner rule: base Pokermon wins any conflict with an add-on (Nacho's Pokermon Dip, Pokermon+). An add-on joker that is
 * the same Pokémon as a Pokermon joker (same `name`: j_nacho_ralts = j_poke_ralts, j_sonfive_nincada = j_poke_nincada; a
 * regional form or a Mega has its own name, so it is a distinct card) is OUT OF PLAY:
 *   - never in a pool: shops, packs, tags, random joker creation (the engine's in_pool) and every random-Pokémon pick
 *     (get_random_poke_key: Poké Balls, Zorua, Transformation, the randomizer...) — mark_precedence + the POKE_POOL_RULES
 *     entry in pools.js;
 *   - never an evolution result: poke_evolve / poke_backend_evolve retarget to Pokermon's key (precedence_key), so an
 *     add-on line that evolved INTO a duplicate now evolves into Pokermon's;
 *   - its Megas carry over: a Mega the replaced add-on joker could become is reached from Pokermon's joker with a Mega
 *     Stone (addon_megas, systems/items.js), and devolves back to it (get_previous_evo -> precedence_key); an add-on may
 *     also attach a Mega to a Pokermon joker outright (attach_mega: Nacho 1.7.9's re-keyed j_poke_mega_gardevoir /
 *     _altaria / _gallade on Pokermon's Gardevoir / Altaria / Gallade);
 *   - hidden from the Pokédex family view, the design wiki and the deck editor's pickers.
 * Its key stays REGISTERED (a legacy definition, unchanged): a save, replay, custom deck, challenge or win sticker that
 * holds it still loads, names it and draws it, and an owned one keeps working as it did until it evolves.
 */
import { P_CENTERS } from '../../../js/engine/core.js';
import { centerActive } from '../../../js/mods/registry.js';

const POKERMON = 'pokermon';
const isTable = (x) => x !== null && typeof x === 'object';
const centerOf = (x) => (typeof x === 'string' ? P_CENTERS[x] : isTable(x) ? (x.config && x.config.center && x.config.center.key ? x.config.center : x) : undefined);

/** The Pokermon key an add-on joker center (or key / card) is a duplicate of, else undefined. */
export function replaced_by(x) {
  const c = centerOf(x);
  if (!c || c.set !== 'Joker' || !c.stage || !c.name) return undefined;
  // An add-on's center: its mod (once registered), or before registerMod (mark_precedence) its add-on prefix.
  if (c.mod ? c.mod === POKERMON : !(c.poke_custom_prefix && c.poke_custom_prefix !== 'poke')) return undefined;
  const k = 'j_poke_' + c.name;
  const p = P_CENTERS[k];
  return p && p.mod === POKERMON && !p.unported && p !== c ? k : undefined;
}
/** A key -> the key to use for a NEW card (an evolution, a created card): Pokermon's for a replaced duplicate. */
export const precedence_key = (key) => replaced_by(key) || key;

/**
 * Called by an add-on on its centers before registerMod: stamps `poke_replaced_by` (static, so generic code — the wiki
 * generator, the deck editor — can read it without importing Pokermon) and keeps a replaced one out of every pool,
 * whatever its own in_pool says. Returns the replaced keys.
 */
export function mark_precedence(centers) {
  const out = [];
  for (const c of centers || []) {
    const to = replaced_by(c);
    if (!to) continue;
    c.poke_replaced_by = to;
    const base = c.in_pool;
    c.in_pool = (self, args) => (replaced_by(c) ? false : base ? base(self, args) : true);
    out.push(c.key);
  }
  return out;
}

/**
 * The Megas an add-on adds to a Pokémon Pokermon now owns: for a Pokermon joker, the active Megas of the add-on
 * jokers it replaced (full keys), unless Pokermon has that Mega itself (then the add-on Mega is a duplicate too).
 */
let MEGA_INDEX = null, MEGA_INDEX_N = -1;
function megaIndex() {
  const n = Object.keys(P_CENTERS).length;
  if (MEGA_INDEX && MEGA_INDEX_N === n) return MEGA_INDEX;
  MEGA_INDEX = new Map(); MEGA_INDEX_N = n;
  for (const c of Object.values(P_CENTERS)) {
    const to = replaced_by(c);
    if (!to || !Array.isArray(c.megas)) continue;
    const list = MEGA_INDEX.get(to) || [];
    for (const m of c.megas) {
      const k = 'j_' + (c.poke_custom_prefix || 'poke') + '_' + m;
      if (P_CENTERS[k] && !replaced_by(k) && !list.includes(k)) list.push(k);
    }
    if (list.length) MEGA_INDEX.set(to, list);
  }
  return MEGA_INDEX;
}
export function addon_megas(x) {
  const c = centerOf(x);
  if (!c) return [];
  const out = [];
  // An add-on's Megas attached to this joker (attach_mega: Nacho 1.7.9's take_ownership `megas` on Pokermon's Gardevoir).
  for (const k of ATTACHED.get(c.key) || []) if (P_CENTERS[k] && !replaced_by(k) && centerActive(P_CENTERS[k]) && !out.includes(k)) out.push(k);
  if (c.mod === POKERMON && !c.megas) {
    const list = megaIndex().get(c.key);
    if (list) for (const k of list) if (centerActive(P_CENTERS[k]) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * An add-on Mega attached to another mod's joker — Nacho 1.7.9's PkmnDip.attach_mega: SMODS.Joker:take_ownership(base,
 * {megas = {mega}}) + pokermon.add_to_family. Micatro mods are per run, so the base center is never rewritten: the Mega is
 * listed here and reached through addon_megas (a Mega Stone, the Mega Berry Juice), only while it is active (its mod and
 * option on). Additive; with nothing attached Pokermon is unchanged.
 */
const ATTACHED = new Map();
export function attach_mega(base_key, mega_key) {
  const list = ATTACHED.get(base_key) || [];
  if (!list.includes(mega_key)) list.push(mega_key);
  ATTACHED.set(base_key, list);
}
/** The attached Megas of a base key (for docs and tests). */
export const attached_megas = (base_key) => (ATTACHED.get(base_key) || []).slice();

/**
 * A family member's key for DISPLAY (the Pokédex): a replaced add-on key shows Pokermon's; a Pokermon key Pokermon
 * doesn't register (j_poke_mega_gardevoir) shows the active add-on joker of that name that isn't replaced (Nacho's).
 */
export function family_display_key(key) {
  if (typeof key !== 'string') return key;
  if (P_CENTERS[key]) return precedence_key(key);
  const m = /^j_poke_(.+)$/.exec(key);
  if (!m) return key;
  for (const c of Object.values(P_CENTERS)) {
    if (c.set === 'Joker' && c.name === m[1] && c.mod && c.mod !== POKERMON && !replaced_by(c) && centerActive(c)) return c.key;
  }
  return key;
}
