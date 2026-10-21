// icefall_ice.js — FireRed's Icefall Cave 1F cracked ice (pokefirered
// src/field_tasks.c IcefallCaveIcePerStepCallback + SetIcefallCaveCrackedIceMetatiles).
//
// Nine squares of THIN ice (MB_THIN_ICE) sit across the cave's 1F. Step on one and
// it CRACKS behind you (METATILE_SeafoamIslands_CrackedIce, MB_CRACKED_ICE); step
// on a cracked one and it BREAKS into a hole (METATILE_SeafoamIslands_IceHole):
// VAR_TEMP_1 = 1, and the map's ON_FRAME drops you through to B1F at the same x, y
// (FourIsland_IcefallCave_1F_EventScript_FallDownHole: warphole). Each cracked
// square is remembered in a temp flag (FLAG_TEMP_1..9, by its index here), which
// the ON_LOAD re-applies when the map reloads without a warp (a battle) and which a
// warp clears, so the ice is whole again when you come back.
//
// None of it was ported: the step callback (`setstepcallback STEP_CB_ICE`) was
// dropped and the ON_LOAD special had no handler, so the ice never cracked and the
// cave's way down to B1F never opened.
//
// The GBA swaps the tile four frames into the step; here it happens as the step
// lands, which is what you see either way.
export const ICEFALL_ICE_COORDS = [[8, 3], [10, 5], [15, 5], [8, 9], [9, 9], [16, 9], [8, 10], [9, 10], [8, 14]];
export const MB_THIN_ICE = 0x26, MB_CRACKED_ICE = 0x27;
export const METATILE_THIN_ICE = 0x359, METATILE_CRACKED_ICE = 0x35A, METATILE_ICE_HOLE = 0x35B;   // METATILE_SeafoamIslands_*

export const isIcefallCave1F = name => name === 'FourIsland_IcefallCave_1F';

// SetIcefallCaveCrackedIceMetatiles (the map's ON_LOAD). The GBA runs it on a map
// it has just re-read from ROM, every square thin again; the port keeps a map's
// edited tiles across visits (World's rendered-bundle cache), so each square is put
// back first: thin, or cracked where its temp flag says you stepped. A warp clears
// those flags, so coming back in finds the ice whole, holes and all.
export function setIcefallCaveCrackedIceMetatiles(world, getFlag) {
	ICEFALL_ICE_COORDS.forEach(([x, y], i) => {
		world.setMetatile(x, y, getFlag('FLAG_TEMP_' + (i + 1)) ? METATILE_CRACKED_ICE : METATILE_THIN_ICE, false);
	});
}

// After each finished step on 1F. Returns 'crack' / 'break' / null.
export function icefallIceStep(world, x, y, story) {
	if (!isIcefallCave1F(world.current?.name)) return null;
	const b = world.behaviorAt(x, y);
	if (b === MB_THIN_ICE) {
		const i = ICEFALL_ICE_COORDS.findIndex(([ix, iy]) => ix === x && iy === y);
		if (i >= 0) story.setFlag('FLAG_TEMP_' + (i + 1));   // MarkIcePuzzleCoordVisited
		world.setMetatile(x, y, METATILE_CRACKED_ICE, false);
		return 'crack';
	}
	// the break: the caller drops you through at once (holes.js's fall). The decomp
	// sets VAR_TEMP_1 for the map's ON_FRAME to run FallDownHole, but its `warphole`
	// (same x, y below) came through the transpile as `warp B1F, 0`, B1F's door:
	// the fall is done natively instead, as for every other floor hole here.
	if (b === MB_CRACKED_ICE) {
		world.setMetatile(x, y, METATILE_ICE_HOLE, false);
		return 'break';
	}
	return null;
}
