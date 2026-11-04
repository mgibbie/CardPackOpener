// region_sync.js — the saved region follows the map you're on.
//
// `magepunk_region` is the region the game treats you as being in: the
// objective line, the trainer card, the quest gates and the HM rules read it.
// Stepping through a PORTAL flips it (travelPortal), but FLYING to another
// region's town didn't — 2026-10-02, Instinct took a portal to Hoenn, then flew
// to Ecruteak, and the game still called them a Hoenn player in Johto.
//
// Now every map load (boot, Fly, warp, connection) checks the map against
// map_regions.json (tools/gen_map_regions.mjs) and, when it belongs to one of
// the three player regions and differs from the saved one, updates it — the
// same thing a portal does. JohKanto, the future-timeline Hoenn copy and the
// neutral maps are not player regions and leave it alone, and a save that has
// no region yet (before the new-game pick) is never given one here.
import { getJSON } from './engine.js';
import { safeSaveStr } from './safestore.js';

const PLAYER_REGIONS = { KANTO: 'kanto', JOHTO: 'johto', HOENN: 'hoenn' };
let byName = null;

export async function loadMapRegions() {
	if (byName) return byName;
	const m = new Map();
	try {
		const data = await getJSON('map_regions.json');
		for (const [region, maps] of Object.entries(data || {})) for (const e of maps || []) if (e && e.name) m.set(e.name, region);
	} catch (e) { /* no table: keep the saved region as it is */ }
	byName = m;
	return m;
}

// the player region a map belongs to, or null (JohKanto, Hoenn2, neutral, unknown)
export function playerRegionOfMap(name) {
	const r = byName && byName.get(name);
	return (r && PLAYER_REGIONS[r]) ? r : null;
}

// the map's raw region key from map_regions.json (KANTO, JOHTO, HOENN, HOENN2,
// JOHKANTO, OTHER), or null before the table loads / for an unknown map
export function mapRegionOf(name) {
	return (byName && byName.get(name)) || null;
}

// returns true when the saved region changed
export async function syncRegionToMap(name) {
	await loadMapRegions();
	const r = playerRegionOfMap(name);
	if (!r) return false;
	let saved = null;
	try { saved = localStorage.getItem('magepunk_region'); } catch (e) { return false; }
	if (!saved) return false;
	if (String(saved).toUpperCase() === r) return false;
	safeSaveStr('magepunk_region', PLAYER_REGIONS[r]);
	return true;
}
