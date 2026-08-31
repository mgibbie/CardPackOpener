// divelinks.js — dive/emerge links that were dropped when the maps were ported.
// The map JSONs are served read-only from the owdata deployment, so these missing
// connections are restored in CODE (main.js reads them; the reachability test
// mirrors them). Node-safe (plain data, no DOM) so tests can import it.
//
// SOOTOPOLIS: the port left SootopolisCity + Underwater_SootopolisCity with no
// connections, so Wallace's gym (Hoenn's 8th) was unreachable and Hoenn couldn't
// be completed. The entry chain otherwise exists: Route126 --dive--> Underwater_
// Route126 --warp(45,65)--> Underwater_SootopolisCity. We add the final hop:
// using DIVE in the underwater room EMERGES up into the Sootopolis lake, and the
// city DIVES back down. The two maps differ in size (20x10 vs 60x60), so the
// landing tile is given explicitly and snapped to a valid surf/land tile at
// runtime (diveTo). DIVE itself is badge-gated (Hoenn needs 7 badges), so this
// naturally gates Sootopolis behind gym 7, matching the quest corridor.
export const EXTRA_DIVE = {
	Underwater_SootopolisCity: { emerge: { map: 'MAP_SOOTOPOLIS_CITY', x: 30, y: 40 } },
	SootopolisCity: { dive: { map: 'MAP_UNDERWATER_SOOTOPOLIS_CITY', x: 10, y: 5 } },
	// HOENN2 had the underwater room but no city: SOOTOPOLIS was the one gym town
	// the region clone missed, because clone_region walks the map graph and
	// Sootopolis has no connections and no inbound warps — you arrive by DIVE.
	// Without it Badges.count('HOENN2') could never reach 8.
	Hoenn2_Underwater_SootopolisCity: { emerge: { map: 'MAP_HOENN2_SOOTOPOLIS_CITY', x: 30, y: 40 } },
	Hoenn2_SootopolisCity: { dive: { map: 'MAP_HOENN2_UNDERWATER_SOOTOPOLIS_CITY', x: 10, y: 5 } },
};
