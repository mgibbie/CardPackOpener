// crystal_callbacks.js — which pokecrystal map callbacks run on each Crystal map.
//
// pokecrystal runs a map's `callback MAPCALLBACK_*` scripts as it loads (NEWMAP:
// flags on entry; TILES: changeblock; OBJECTS: appear/disappear by day, time and
// story flags). tools/gen_crystal_callbacks.mjs lists them per map, in run order,
// minus a deny-list (callbacks that would fight a native system — the daycare,
// the Bug-Catching Contest, the legendaries — or need an unimplemented mechanism);
// their dropped changeblocks come back through crystal_scriptvar_data.json.
let TABLE = {};
export async function loadCrystalCallbacks(getJSON) {
	TABLE = ((await getJSON('crystal_callbacks.json').catch(() => null)) || {}).callbacks || {};
}
// [[kind, label], ...] for a map (its file stem), already in run order
export function crystalCallbacksFor(stem) { return TABLE[stem] || []; }
