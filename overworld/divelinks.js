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
	// These two entries close that hole so the clone matches Hoenn structurally.
	//
	// They are INERT today, and deliberately so: HOENN2 is the map editor's sandbox
	// (?mapedit=1) and is unreachable on purpose — no region-picker entry, nothing in
	// badges.js, and no Hoenn2 map in data/map_index.json, so the engine cannot even
	// resolve a MAP_HOENN2_* id. Nothing outside Hoenn2 warps or connects into it
	// (0 of the 1,170 edges that point at it come from elsewhere).
	//
	// An earlier version of this comment justified the entries with "without it
	// Badges.count('HOENN2') could never reach 8". That was never true — HOENN2 has
	// no badge set, so that count is structurally 0 — and it read as though the
	// region were live. The entries are here for when the editor opens it up, not
	// because anything counts badges there now.
	Hoenn2_Underwater_SootopolisCity: { emerge: { map: 'MAP_HOENN2_SOOTOPOLIS_CITY', x: 30, y: 40 } },
	Hoenn2_SootopolisCity: { dive: { map: 'MAP_HOENN2_UNDERWATER_SOOTOPOLIS_CITY', x: 10, y: 5 } },

	// SEALED CHAMBER — the Braille chain that unseals the REGI trio. Every room
	// exists and they link to each other, but the chain had no way in: Route 134
	// was the one sea route with no dive connection, and nothing surfaced from
	// Underwater_SealedChamber into the chamber itself.
	Route134: { dive: { map: 'MAP_UNDERWATER_ROUTE134', x: 9, y: 5 } },
	Underwater_Route134: { emerge: { map: 'MAP_ROUTE134', x: 40, y: 20 } },
	Underwater_SealedChamber: { emerge: { map: 'MAP_SEALED_CHAMBER_OUTER_ROOM', x: 10, y: 20 } },

	// ABANDONED SHIP hidden floor — the Deep Sea Tooth / Deep Sea Scale rooms.
	// Both underwater maps and both hidden-floor maps shipped, wired to each
	// other and to nothing else, so the entire wing was sealed.
	AbandonedShip_Rooms_B1F: { dive: { map: 'MAP_ABANDONED_SHIP_UNDERWATER1', x: 4, y: 4 } },
	AbandonedShip_Underwater1: { emerge: { map: 'MAP_ABANDONED_SHIP_ROOMS_B1F', x: 13, y: 4 } },
	AbandonedShip_Underwater2: { emerge: { map: 'MAP_ABANDONED_SHIP_HIDDEN_FLOOR_CORRIDORS', x: 6, y: 9 } },
};
