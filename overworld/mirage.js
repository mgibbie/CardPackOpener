// mirage.js — pokeemerald's MIRAGE TOWER (Route 111), from src/mirage_tower.c.
//
// Route 111's ON_TRANSITION runs `special SetMirageTowerVisibility` and swaps in
// LAYOUT_ROUTE111_NO_MIRAGE_TOWER while FLAG_MIRAGE_TOWER_VISIBLE is clear. The
// special had no handler, so the flag was never set: the tower never stood on the
// route at all — yet its door warp at (19,58) still fired from the bare sand, since
// the port takes a warp by position, not by the tile's door behavior.
//
// The decomp, ported:
//   SetMirageTowerVisibility   tower event done (VAR_MIRAGE_TOWER_STATE != 0): hidden.
//                              Else a coin flip on every entry, forced visible once
//                              you have been inside (FLAG_FORCE_MIRAGE_TOWER_VISIBLE,
//                              set by 1F, cleared by Mauville City).
//   the 4F fossils             take one -> the ceiling crumbles, you land on Route
//                              111 (state 1), the tower shakes apart, the other
//                              fossil falls into the Desert Underpass (state 2), and
//                              from then on the route has no tower (state 3).
// The camera shakes / crumble / disintegration are a screen shake here (the GBA's
// sprite effects are cosmetic); the tile change the disintegration makes is real.
import * as Story from './events.js';

export const isRoute111 = name => /^(Hoenn2_)?Route111$/.test(name || '');

export function setMirageTowerVisibility(rng = Math.random) {
	if (Story.getVar('VAR_MIRAGE_TOWER_STATE')) { Story.clearFlag('FLAG_MIRAGE_TOWER_VISIBLE'); return false; }
	let visible = (Math.floor(rng() * 0x10000) & 1) === 1;
	if (Story.getFlag('FLAG_FORCE_MIRAGE_TOWER_VISIBLE')) visible = true;
	if (visible) Story.setFlag('FLAG_MIRAGE_TOWER_VISIBLE');
	else Story.clearFlag('FLAG_MIRAGE_TOWER_VISIBLE');
	return visible;
}

// the tower's door on Route 111 is no door while the tower is not there
export function mirageTowerDoorClosed(mapName, warp) {
	return !!warp && isRoute111(mapName) && /MIRAGE_TOWER_1F$/.test(warp.dest_map || '')
		&& !Story.getFlag('FLAG_MIRAGE_TOWER_VISIBLE');
}

// SetInvisibleMirageTowerMetatiles: what the disintegration leaves behind
export const INVISIBLE_TOWER_METATILES = (() => {
	const out = [];
	for (let y = 53; y <= 58; y++) for (let x = 18; x <= 20; x++) {
		out.push([x, y, y <= 56 ? 0x251 : y === 57 ? 0x259 : 0x121]);   // Mauville_DeepSand_Center / _BottomMid / General_SandPit_Center
	}
	return out;
})();
export function setInvisibleMirageTowerMetatiles(world) {
	for (const [x, y, t] of INVISIBLE_TOWER_METATILES) world.setMetatile(x, y, t, false);   // MapGridSetMetatileIdAt: no collision bit
}
