// Every mod Micatro ships, loaded on demand (a mod's code and data only
// download when a run enables it). Order = default display order.
import { MODS, resolveMods } from './registry.js';

export const AVAILABLE = [
  // { id, name, by, requires: [ids], load: () => import('./<id>/index.js') }
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
