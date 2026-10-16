// Mod UI seam: a loaded mod may ship a `ui` object (registerMod({..., ui})) that the renderer asks,
// card by card, for the mod's own visuals. Everything is optional and draws ONLY from view data, so
// spectators and replays look the same as the player. A mod without `ui` (or no mods) costs nothing.
//
//   install()                      once, the first time the renderer meets the mod (e.g. set an edition's shader)
//   face(d, ctx) -> d'             what the card face shows instead of `d` (Zorua's disguise, an animation frame
//                                  source...); ctx = {jokers: [joker views, left to right], area}
//   anim(d) -> {fps, frames, fpr, atlas?, soulAtlas?}   an animated sprite sheet (frames left-to-right, top-down)
//   decorate(d) -> {key, html}     small DOM decorations over the card (type pill, energy pips)
//   fx(d, sprite, now) -> [{key, fs, src?, u}]          extra GL passes over the card (gl.js CardFX opts.extra)
//   onEvent(ev, board) -> seconds  a UI event the mod animates (Pokermon's poke_evolve); the delay it needs
//   cardActions(d) -> [{label, cls, run(api)}]         client-only buttons on a selected card (Pokédex)
//   runInfoTabs(view) -> [{key, label, render(body, api)}]  extra Run Info tabs
//   cardContext(d, api) -> true    right-click / double-click on a card (Pokermon: open its Pokédex)
import { MODREG, drawModCell } from './assets.js';

const installed = new Set();
let cache = null, cacheFor = null, cacheN = -1;
/** The `ui` objects of the registered mods (installed on first use). */
export function modUIs() {
  const mods = MODREG.mods || {};
  const n = Object.keys(mods).length;
  if (cache && cacheFor === mods && cacheN === n) return cache;
  const out = [];
  for (const [id, m] of Object.entries(MODREG.mods || {})) {
    const u = m && m.ui;
    if (!u) continue;
    if (!installed.has(id)) { installed.add(id); try { if (u.bind) u.bind({ drawModCell }); if (u.install) u.install(); } catch (e) { console.warn('micatro: mod ui install failed', id, e); } }
    out.push(u);
  }
  cache = out; cacheFor = mods; cacheN = n;
  return out;
}
/** First non-null answer of `name` across the mods' ui objects. */
export function first(name, ...args) {
  for (const u of modUIs()) {
    if (typeof u[name] !== 'function') continue;
    try { const r = u[name](...args); if (r != null) return r; } catch (e) { console.warn('micatro: mod ui ' + name, e); }
  }
  return null;
}
/** Every answer of `name` (arrays are flattened). */
export function all(name, ...args) {
  const out = [];
  for (const u of modUIs()) {
    if (typeof u[name] !== 'function') continue;
    try { const r = u[name](...args); if (r != null) out.push(...[].concat(r)); } catch (e) { console.warn('micatro: mod ui ' + name, e); }
  }
  return out;
}
export const hasModUI = () => modUIs().length > 0;
