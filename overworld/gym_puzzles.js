// gym_puzzles.js — native ports of the gym-puzzle `special`s the decomp scripts
// call. Each was a silent no-op (runSpecial's default), which made two gyms
// unwinnable:
//
//   VERMILION (FireRed)  SetVermilionTrashCans picks which two cans hold the
//                        switches. Unported, both "switch" vars stayed 0, so every
//                        can said "Nope! There's only trash here." — Lt. Surge was
//                        unreachable.
//   MAUVILLE (Emerald)   MauvilleGymPressSwitch / SetDefaultBarriers /
//                        DeactivatePuzzle swap the barrier metatiles. Unported,
//                        stepping on a floor switch changed nothing and Wattson sat
//                        behind a closed beam forever.
//
// Ported line-for-line from pokefirered / pokeemerald src/field_specials.c.
// Coordinates here are map-local (the decomp adds MAP_OFFSET for its border).
//
// `w` is a small adapter: { get(x, y) -> metatile id, set(x, y, id, impassable),
// getVar(name), setVar(name, v), rng() -> [0,1) }.

// ---------- Vermilion Gym (FireRed) ----------
// Fifteen cans in a 5x3 grid, numbered 1..15 row-major. The first switch is a
// random can; the second is a random ORTHOGONAL neighbour of it. The decomp spells
// the neighbours out per can; that table is exactly "±1 within the row, ±5 within
// the grid", which is what this computes.
export function setVermilionTrashCans(w) {
	const first = 1 + Math.floor(w.rng() * 15);
	const col = (first - 1) % 5;
	const next = [];
	if (col > 0) next.push(first - 1);
	if (col < 4) next.push(first + 1);
	if (first - 5 >= 1) next.push(first - 5);
	if (first + 5 <= 15) next.push(first + 5);
	const second = next[Math.floor(w.rng() * next.length)];
	w.setVar('VAR_0x8004', first);
	w.setVar('VAR_0x8005', second);
	return [first, second];
}

// ---------- Mauville Gym (Emerald) ----------
export const MG = {
	FloorTile: 0x21A,
	GreenBeamH1_Off: 0x230, GreenBeamH1_On: 0x220, GreenBeamH2_Off: 0x231, GreenBeamH2_On: 0x221,
	GreenBeamH3_Off: 0x238, GreenBeamH3_On: 0x228, GreenBeamH4_Off: 0x239, GreenBeamH4_On: 0x229,
	GreenBeamV1_On: 0x240, GreenBeamV2_On: 0x248,
	PoleBottom_Off: 0x243, PoleBottom_On: 0x242, PoleTop_Off: 0x251, PoleTop_On: 0x250,
	PressedSwitch: 0x206, RaisedSwitch: 0x205,
	RedBeamH1_Off: 0x232, RedBeamH1_On: 0x222, RedBeamH2_Off: 0x233, RedBeamH2_On: 0x223,
	RedBeamH3_Off: 0x23A, RedBeamH3_On: 0x22A, RedBeamH4_Off: 0x23B, RedBeamH4_On: 0x22B,
	RedBeamV1_On: 0x241, RedBeamV2_On: 0x249,
};
export const MAUVILLE_SWITCHES = [[0, 15], [4, 12], [3, 9], [8, 9]];

// Presses the stepped-on switch (VAR_0x8004 = its index) and raises the rest.
export function mauvilleGymPressSwitch(w) {
	const pressed = w.getVar('VAR_0x8004');
	MAUVILLE_SWITCHES.forEach(([x, y], i) => w.set(x, y, i === pressed ? MG.PressedSwitch : MG.RaisedSwitch, false));
}

// Flips every beam to its other state. NB: this reads the grid LIVE while it
// writes it — the FloorTile case looks at the tile above, which this same pass
// may already have changed — so it must scan in the decomp's order (rows, then
// columns) exactly as written.
export function mauvilleGymSetDefaultBarriers(w) {
	for (let y = 5; y < 17; y++) {
		for (let x = 0; x < 9; x++) {
			const t = w.get(x, y);
			switch (t) {
				case MG.GreenBeamH1_On: w.set(x, y, MG.GreenBeamH1_Off, false); break;
				case MG.GreenBeamH2_On: w.set(x, y, MG.GreenBeamH2_Off, false); break;
				case MG.GreenBeamH3_On: w.set(x, y, MG.GreenBeamH3_Off, false); break;
				case MG.GreenBeamH4_On: w.set(x, y, MG.GreenBeamH4_Off, false); break;
				case MG.GreenBeamH1_Off: w.set(x, y, MG.GreenBeamH1_On, false); break;
				case MG.GreenBeamH2_Off: w.set(x, y, MG.GreenBeamH2_On, false); break;
				case MG.GreenBeamH3_Off: w.set(x, y, MG.GreenBeamH3_On, true); break;
				case MG.GreenBeamH4_Off: w.set(x, y, MG.GreenBeamH4_On, true); break;
				case MG.RedBeamH1_On: w.set(x, y, MG.RedBeamH1_Off, false); break;
				case MG.RedBeamH2_On: w.set(x, y, MG.RedBeamH2_Off, false); break;
				case MG.RedBeamH3_On: w.set(x, y, MG.RedBeamH3_Off, false); break;
				case MG.RedBeamH4_On: w.set(x, y, MG.RedBeamH4_Off, false); break;
				case MG.RedBeamH1_Off: w.set(x, y, MG.RedBeamH1_On, false); break;
				case MG.RedBeamH2_Off: w.set(x, y, MG.RedBeamH2_On, false); break;
				case MG.RedBeamH3_Off: w.set(x, y, MG.RedBeamH3_On, true); break;
				case MG.RedBeamH4_Off: w.set(x, y, MG.RedBeamH4_On, true); break;
				case MG.GreenBeamV1_On: w.set(x, y, MG.PoleBottom_On, true); break;
				case MG.GreenBeamV2_On: w.set(x, y, MG.FloorTile, false); break;
				case MG.RedBeamV1_On: w.set(x, y, MG.PoleBottom_Off, true); break;
				case MG.RedBeamV2_On: w.set(x, y, MG.FloorTile, false); break;
				case MG.PoleBottom_On: w.set(x, y, MG.GreenBeamV1_On, true); break;
				case MG.FloorTile:
					if (w.get(x, y - 1) === MG.GreenBeamV1_On) w.set(x, y, MG.GreenBeamV2_On, true);
					else w.set(x, y, MG.RedBeamV2_On, true);
					break;
				case MG.PoleBottom_Off: w.set(x, y, MG.RedBeamV1_On, true); break;
				case MG.PoleTop_Off: w.set(x, y, MG.PoleTop_On, true); break;
				case MG.PoleTop_On: w.set(x, y, MG.PoleTop_Off, false); break;
			}
		}
	}
}

// Presses every switch and turns every beam off (Wattson beaten).
export function mauvilleGymDeactivatePuzzle(w) {
	for (const [x, y] of MAUVILLE_SWITCHES) w.set(x, y, MG.PressedSwitch, false);
	for (let y = 5; y < 17; y++) {
		for (let x = 0; x < 9; x++) {
			switch (w.get(x, y)) {
				case MG.GreenBeamH1_On: w.set(x, y, MG.GreenBeamH1_Off, false); break;
				case MG.GreenBeamH2_On: w.set(x, y, MG.GreenBeamH2_Off, false); break;
				case MG.GreenBeamH3_On: w.set(x, y, MG.GreenBeamH3_Off, false); break;
				case MG.GreenBeamH4_On: w.set(x, y, MG.GreenBeamH4_Off, false); break;
				case MG.RedBeamH1_On: w.set(x, y, MG.RedBeamH1_Off, false); break;
				case MG.RedBeamH2_On: w.set(x, y, MG.RedBeamH2_Off, false); break;
				case MG.RedBeamH3_On: w.set(x, y, MG.RedBeamH3_Off, false); break;
				case MG.RedBeamH4_On: w.set(x, y, MG.RedBeamH4_Off, false); break;
				case MG.GreenBeamV1_On: w.set(x, y, MG.PoleBottom_On, true); break;
				case MG.RedBeamV1_On: w.set(x, y, MG.PoleBottom_Off, true); break;
				case MG.GreenBeamV2_On: case MG.RedBeamV2_On: w.set(x, y, MG.FloorTile, false); break;
				case MG.PoleTop_On: w.set(x, y, MG.PoleTop_Off, false); break;
			}
		}
	}
}

// the maps whose ON_LOAD script lays out one of the puzzles above. main.js only
// runs ON_LOAD for these: game-wide it is 124 maps / 506 setmetatile ops that
// have never executed, some of which raise walls whose unlock is not ported.
export const ONLOAD_MAPS = new Set(['VermilionCity_Gym', 'MauvilleCity_Gym', 'Hoenn2_MauvilleCity_Gym']);
