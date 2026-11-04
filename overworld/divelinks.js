// divelinks.js — dive/emerge links that were dropped when the maps were ported.
// The map JSONs are served read-only from the owdata deployment, so these missing
// connections are restored in CODE (ow_fieldmoves.js reads them; the reachability
// test mirrors them). Node-safe (plain data, no DOM) so tests can import it.
//
// They come from the decomp itself: pokeemerald gives every room entered by DIVE
// its way back with `setdivewarp MAP, x, y` in the map's ON_RESUME / ON_DIVE_WARP
// script, which the transpile dropped. tools/gen_divewarps.mjs lifts all 16
// (+ the HOENN2 copies) into divewarp_data.js. On an underwater map the warp is
// where you SURFACE (emerge); anywhere else it is where you DIVE to.
//
// What they reopen: Wallace's gym (Sootopolis is reached only by diving), the
// Sealed Chamber's Braille chain (Route 134's dive and the chamber's surface),
// Team Aqua's hideout climax (Underwater_SeafloorCavern surfaced nowhere until
// 2026-10-07), Marine Cave, and the Abandoned Ship's hidden floor — both ways
// (its corridors had no way back out to the ship, 2026-10-07).
//
// Underwater_SealedChamber surfaces into the chamber only from (12,44), under it;
// anywhere else it comes up on Route 134 (getplayerxy in its ON_DIVE_WARP).
// Such an entry carries the positional targets as `cases`; the base is the
// default. The HOENN2 entries are inert until that region is opened up (no
// MAP_HOENN2_* id resolves today; it is the map editor's sandbox).
import { DIVE_WARPS } from './divewarp_data.js';

const underwater = stem => /(^|_)Underwater/.test(stem);
export const EXTRA_DIVE = {};
for (const [stem, list] of Object.entries(DIVE_WARPS)) {
	const base = list.find(w => !w.at) || list[list.length - 1];
	const cases = list.filter(w => w.at && w !== base);
	EXTRA_DIVE[stem] = { [underwater(stem) ? 'emerge' : 'dive']: { map: base.map, x: base.x, y: base.y, ...(cases.length ? { cases } : {}) } };
}
// the link for a player standing at (x,y): a positional case, else the base
export function diveLinkAt(link, x, y) {
	if (!link) return null;
	return (link.cases || []).find(c => c.at && c.at[0] === x && c.at[1] === y) || link;
}
