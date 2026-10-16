// Micatro — card sleeves (Larswijn's CardSleeves, as used by Pokermon, Pokermon+ and MoreFluff):
// a sleeve is a second deck effect put on top of the chosen deck — a deck VARIANT.
//
//   newRun({..., back: 'b_red', sleeve: 'sleeve_poke_futuresleeve'})   -> run.js
//
// Mods register their sleeves on the mod (`registerMod({..., sleeves: [...]})`):
//   {key, name, atlas, pos, config, apply?(sleeve, back), calculate?(sleeve, back, context),
//    alt?: {deck: 'b_...', config?, apply?, calculate?}, mod_option?}
// `alt` is CardSleeves' get_current_deck_key() pairing: with that deck the sleeve plays its
// alternate effect (its `_alt` text). A sleeve applies right after the deck (CardSleeves wraps
// Back.apply_to_run), through the same config handling as a deck (vouchers, consumables, hands,
// hand size, ...). The sleeve key is part of the run RECIPE (session.js), so resume / replay /
// spectate rebuild the same run; a run without a sleeve never touches this file's internal mod.

import { G } from './core.js';
import { Back } from './back.js';
import { registerMod, MODS, MOD_LOC, centerActive, opt } from '../mods/registry.js';

export const SLEEVE_ID = 'sleeve';

/** Every registered sleeve (mod order), each tagged with its mod id. */
export function allSleeves() {
  const out = [];
  for (const m of Object.values(MODS)) {
    if (m.hidden || !Array.isArray(m.sleeves)) continue;
    for (const s of m.sleeves) if (s && s.key) out.push(s.mod ? s : Object.assign(s, { mod: m.id }));
  }
  return out;
}
export function findSleeve(key) {
  if (!key || typeof key !== 'string') return null;
  return allSleeves().find((s) => s.key === key) || null;
}
/** Is the sleeve playable with these mods / options on (its mod active, its mod option set)? */
export function sleeveAvailable(s, isOn = centerActive) {
  if (!s) return false;
  if (!isOn({ mod: s.mod })) return false;
  if (s.mod_option && !opt(s.mod, s.mod_option)) return false;
  return true;
}
/** The effect a sleeve plays with this deck: its alt with the paired deck, else its own. */
export function sleeveFor(s, backKey) {
  if (!s) return null;
  return s.alt && s.alt.deck === backKey ? { ...s, ...s.alt, alt_active: true } : { ...s, alt_active: false };
}

/** The New Run picker's view of a sleeve with this deck: name, text lines (#n# filled), art, alt or not. */
export function sleeveInfo(s, backKey) {
  const e = sleeveFor(s, backKey);
  const L = MOD_LOC.descriptions.Sleeve || {};
  const d = (e.alt_active && L[s.key + '_alt']) || L[s.key] || { name: s.name, text: [] };
  let vars = [];
  try { vars = (e.loc_vars && (e.loc_vars(e) || {}).vars) || []; } catch (err) { vars = []; }
  const lines = (d.text || []).filter((l) => !/^\{br:/.test(l)).map((l) => String(l).replace(/#(\d+)#/g, (m, i) => (vars[i - 1] != null ? String(vars[i - 1]) : '')));
  return { key: s.key, name: d.name || s.name, lines, atlas: s.atlas, pos: s.pos, mod: s.mod, alt: !!e.alt_active };
}

let current = null; // the sleeve effect of the run being built / played
/** Set up the internal mod for this run (call before activateMods). */
export function prepareSleeve(s) { current = s || null; MODS[SLEEVE_ID].hooks = s ? { ...(s.hooks || {}), ...HOOKS } : {}; }

/** After the deck's apply_to_run (run.js newRun): the sleeve applies like a second back. */
export function apply_sleeve(s) {
  G.GAME.selected_sleeve = s.key;
  const center = {
    key: s.key, name: s.name, set: 'Back', mod: s.mod, pos: s.pos, atlas: s.atlas,
    config: JSON.parse(JSON.stringify(s.config || {})),
    apply: s.apply ? (mc, back) => s.apply(s, back) : undefined,
  };
  const back = new Back(center);
  G.GAME.sleeve_back = back;
  back.apply_to_run();
}

const HOOKS = {
  /** CardSleeves calls the sleeve's calculate with the round_eval context at the cash out. */
  evaluate_round() {
    if (current && current.calculate && G.GAME.sleeve_back) current.calculate(current, G.GAME.sleeve_back, { round_eval: true });
  },
  view(view) {
    if (!current) return;
    view.sleeve = { key: current.key, name: current.name, mod: current.mod, atlas: current.atlas, pos: current.pos, alt: !!current.alt_active };
  },
};

registerMod({
  id: SLEEVE_ID,
  name: 'Sleeve',
  hidden: true, // engine-internal: never listed, never in G.GAME.mods
  hooks: {},
});
