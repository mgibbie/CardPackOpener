// braille_puzzles.js — the sealed doors the decomps open from C, not from a script.
//
// Every one of these doors has a map script that READS its flag (an ON_LOAD that
// paints the cover back while the flag is unset) but no script that SETS it: on
// the cartridge the setter is C code inside a field move or the step counter.
// None of it was ported, so all of the doors stayed shut for good
// (bug:1792491766696, bug:1792491795239, bug:1792578554394; 2026-10-21, Instinct).
//
//   pokeemerald src/braille_puzzles.c
//     CheckRelicanthWailord       the Sealed Chamber's back wall (specialvar) ->
//                                 FLAG_REGI_DOORS_OPENED: Route 111 / Route 120 tombs
//     ShouldDoBrailleDigEffect    DIG under the outer room's braille -> FLAG_SYS_BRAILLE_DIG
//     ShouldDoBrailleRegirockEffect  ROCK SMASH in the Desert Ruins -> FLAG_SYS_REGIROCK_PUZZLE_COMPLETED
//     ShouldDoBrailleRegisteelEffect FLASH in the Ancient Tomb -> FLAG_SYS_REGISTEEL_PUZZLE_COMPLETED
//     ShouldDoBrailleRegicePuzzle the Island Cave lap (step counter) -> FLAG_SYS_BRAILLE_REGICE_COMPLETED
//   pokefirered src/field_specials.c
//     CutMoveRuinValleyCheck / CutMoveOpenDottedHoleDoor  CUT at Ruin Valley's door
//                                 -> FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE (the SAPPHIRE chain)
//
// Hoenn2_ maps run the same scripts on the same flags, so the Hoenn checks take
// either map id.
import * as Story from './events.js';
import { player, world } from './ow_core.js';
import { S } from './ow_state.js';
import { sfx } from './sound.js';

const mapIs = base => new RegExp('^MAP_(HOENN2_)?' + base + '$').test(world.current?.map?.id || '');
const at = (x, y) => player.tx === x && player.ty === y;

// pokeemerald CheckRelicanthWailord ("Emerald change: why did they flip it?"):
// the FIRST party slot holds WAILORD and the LAST holds RELICANTH. Species, not
// form or nickname; an egg never counts (MON_DATA_SPECIES_OR_EGG).
export function checkRelicanthWailord(party = S.party) {
	const p = (party || []).filter(Boolean);
	if (!p.length) return false;
	const sp = m => (m.isEgg || m.egg) ? 'egg' : m.speciesId;
	return sp(p[0]) === 'wailord' && sp(p[p.length - 1]) === 'relicanth';
}

// the three-wide "sealed chamber entrance" both the Regi tombs and the Sealed
// Chamber's outer room open into (DoBrailleDigEffect / DoBrailleRegi*Effect)
function openSealedEntrance(x0, y0) {
	const names = ['Left', 'Mid', 'Right'];
	for (let i = 0; i < 3; i++) {
		world.setMetatile(x0 + i, y0, 'METATILE_Cave_SealedChamberEntrance_Top' + names[i], true);
		world.setMetatile(x0 + i, y0 + 1, 'METATILE_Cave_SealedChamberEntrance_Bottom' + names[i], i !== 1);
	}
	sfx('hit_super');   // SE_BANG
}

// --- DIG in the Sealed Chamber's outer room: stand under the braille (9..11, 3) ---
export function shouldDoBrailleDigEffect() {
	return !Story.getFlag('FLAG_SYS_BRAILLE_DIG') && mapIs('SEALED_CHAMBER_OUTER_ROOM')
		&& player.ty === 3 && player.tx >= 9 && player.tx <= 11;
}
export function doBrailleDigEffect() {
	openSealedEntrance(9, 1);
	Story.setFlag('FLAG_SYS_BRAILLE_DIG');
}

// --- ROCK SMASH in the Desert Ruins (Regirock): from (5..7, 23) ---
export function shouldDoBrailleRegirockEffect() {
	return !Story.getFlag('FLAG_SYS_REGIROCK_PUZZLE_COMPLETED') && mapIs('DESERT_RUINS')
		&& player.ty === 23 && player.tx >= 5 && player.tx <= 7;
}
// --- FLASH in the Ancient Tomb (Registeel): from (8, 25) ---
export function shouldDoBrailleRegisteelEffect() {
	return !Story.getFlag('FLAG_SYS_REGISTEEL_PUZZLE_COMPLETED') && mapIs('ANCIENT_TOMB') && at(8, 25);
}
export function doBrailleRegiEffect(flag) {
	openSealedEntrance(7, 19);
	Story.setFlag(flag);
}

// --- the Island Cave lap (Regice) ---
// "RUN A LAP AROUND THE WALL": read the braille (FLAG_TEMP_REGICE_PUZZLE_STARTED),
// step on every one of these 36 squares and nothing else, then come back to
// (8,21) under the braille. One bit per square across VAR_REGICE_STEPS_1..3.
// A stray step fails the attempt (FLAG_TEMP_REGICE_PUZZLE_FAILED); reading the
// braille again clears it. Both temp flags and the vars reset on entering.
export const REGICE_PATH = [
	[4, 21], [5, 21], [6, 21], [7, 21], [8, 21], [9, 21], [10, 21], [11, 21], [12, 21],
	[12, 22], [12, 23], [13, 23], [13, 24], [13, 25], [13, 26], [13, 27], [12, 27], [12, 28],
	[4, 29], [5, 29], [6, 29], [7, 29], [8, 29], [9, 29], [10, 29], [11, 29], [12, 29],
	[4, 28], [4, 27], [3, 27], [3, 26], [3, 25], [3, 24], [3, 23], [4, 23], [4, 22],
];
// ShouldDoBrailleRegicePuzzle: true when the lap is done and you are back at (8,21).
// Run from the braille script (as a plain special) and after every step.
export function shouldDoBrailleRegicePuzzle() {
	if (!mapIs('ISLAND_CAVE')) return false;
	if (Story.getFlag('FLAG_SYS_BRAILLE_REGICE_COMPLETED')) return false;
	if (!Story.getFlag('FLAG_TEMP_REGICE_PUZZLE_STARTED')) return false;
	if (Story.getFlag('FLAG_TEMP_REGICE_PUZZLE_FAILED')) return false;
	const i = REGICE_PATH.findIndex(([x, y]) => at(x, y));
	if (i < 0) {
		Story.setFlag('FLAG_TEMP_REGICE_PUZZLE_FAILED');
		Story.clearFlag('FLAG_TEMP_REGICE_PUZZLE_STARTED');
		return false;
	}
	const v = i < 16 ? 'VAR_REGICE_STEPS_1' : i < 32 ? 'VAR_REGICE_STEPS_2' : 'VAR_REGICE_STEPS_3';
	Story.setVar(v, ((Story.getVar(v) | 0) | (1 << (i % 16))) & 0xFFFF);
	if ((Story.getVar('VAR_REGICE_STEPS_1') | 0) !== 0xFFFF || (Story.getVar('VAR_REGICE_STEPS_2') | 0) !== 0xFFFF
		|| (Story.getVar('VAR_REGICE_STEPS_3') | 0) !== 0xF) return false;
	return at(8, 21);
}

// --- CUT at the Dotted Hole (FireRed, Six Island Ruin Valley) ---
// CutMoveRuinValleyCheck: on (24,25) facing NORTH with the flag unset. Nothing
// else: no need to have read the door's braille first.
export function cutMoveRuinValleyCheck() {
	return !Story.getFlag('FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE') && world.current?.map?.id === 'MAP_SIX_ISLAND_RUIN_VALLEY'
		&& at(24, 25) && player.facing === 'up';
}
// CutMoveOpenDottedHoleDoor (the ON_LOAD repaints it on later visits)
export function cutMoveOpenDottedHoleDoor() {
	world.setMetatile(24, 24, 'METATILE_SeviiIslands67_DottedHoleDoor_Open', false);
	sfx('hit_super');   // SE_BANG
	Story.setFlag('FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE');
}
