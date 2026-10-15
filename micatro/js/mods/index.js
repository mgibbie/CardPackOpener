// Every mod Micatro ships, loaded on demand (a mod's code and data only
// download when a run enables it). Order = default display order.
import { MODS, ATLASES, CONSUMABLE_TYPES, RARITIES, resolveMods } from './registry.js';
import { P_CENTERS } from '../engine/core.js';

export const AVAILABLE = [
  // { id, name, by, requires: [ids], description?, size?, load: () => import('./<id>/index.js') }
  {
    id: 'pokermon', name: 'Pokermon', preview: true, size: '~30 MB art', by: 'InertSteak & contributors (rebuilt for Micatro)', requires: [],
    description: 'Pokémon jokers that evolve, Energy and Item cards, Tera types, Megas and shinies. PREVIEW: Pokémon are being added in batches; only finished ones appear in runs.',
    load: () => import('../../mods/pokermon/index.js'),
  },
];

/** Load (register) the given mods and everything they require. */
export async function loadMods(ids) {
  const want = new Set();
  const add = (id) => {
    const m = AVAILABLE.find((x) => x.id === id);
    if (!m || want.has(id)) return;
    want.add(id);
    for (const r of m.requires || []) add(r);
  };
  for (const id of ids || []) add(id);
  for (const m of AVAILABLE) if (want.has(m.id) && !MODS[m.id]) await m.load();
  return resolveMods([...want]);
}

// ------------------------------------------------------------------------
// UI-facing helpers (the Mods panel, card art, badges). Read-only views of
// the registry plus dependency bookkeeping over AVAILABLE (which is known
// before any mod module has downloaded).

export { MODS, ATLASES, CONSUMABLE_TYPES, RARITIES };

/** A registered center (mod or base) by key — e.g. a mod deck's art. */
export const centerByKey = (key) => P_CENTERS[key] || null;

/** The manifest entry for a mod id (or null). */
export const manifest = (id) => AVAILABLE.find((m) => m.id === id) || null;

/** Display name of a mod id: registered name, manifest name, or the id itself. */
export function modName(id) {
  return (MODS[id] && MODS[id].name) || (manifest(id) && manifest(id).name) || String(id);
}

/** `ids` plus everything they (transitively) require — manifest order. Unknown ids are dropped. */
export function withRequirements(ids) {
  const want = new Set();
  const add = (id) => {
    const m = manifest(id);
    if (!m || want.has(id)) return;
    want.add(id);
    for (const r of m.requires || []) add(r);
  };
  for (const id of ids || []) add(id);
  return AVAILABLE.filter((m) => want.has(m.id)).map((m) => m.id);
}

/** Mods (among `ids`) that need `id`, directly or through another mod. */
export function dependentsOf(id, ids) {
  const out = [];
  for (const other of ids || []) {
    if (other === id) continue;
    if (withRequirements([other]).includes(id)) out.push(other);
  }
  return out;
}

/** Declared options of a REGISTERED mod: [{key, default, label, type, choices}]. */
export function modOptionList(id) {
  const m = MODS[id];
  if (!m || !m.options) return [];
  return Object.entries(m.options).map(([key, o]) => {
    o = o || {};
    const type = o.type || (Array.isArray(o.choices) ? 'choice' : typeof o.default === 'boolean' ? 'bool' : 'value');
    return { key, default: o.default, label: o.label || key.replace(/_/g, ' '), type, choices: Array.isArray(o.choices) ? o.choices : null };
  });
}
