// holes.js — pokeemerald's cracked floors (src/field_tasks.c CrackedFloorPerStepCallback
// + data/scripts/cave_hole.inc). On a map whose scripts `setholewarp MAP_X` (Sky
// Pillar 2F/4F, Granite Cave B1F, Mirage Tower 2F/3F, Mt. Pyre 2F —
// holewarp_data.js, tools/gen_holewarps.mjs):
//   - stepping onto a CRACKED FLOOR without the bike's speed, or onto a HOLE, drops
//     you through to MAP_X at the same x, y (EventScript_FallDownHole: warphole);
//   - riding across a cracked floor breaks it behind you into a hole (up to two at
//     a time, the callback's tFloor1 / tFloor2), which you can then drop through.
// Sky Pillar needs it: 3F's middle pocket, and with it the stairs back up to 4F's
// upper hall and on to 5F and Rayquaza, is reached ONLY by falling through 4F.
//
// The GBA breaks the floor 3 frames into the step and re-reads your tile every
// frame; here it runs once per finished step: the floor you biked onto gives way
// as you leave it.
import { HOLE_WARPS } from './holewarp_data.js';

export const MB_CRACKED_FLOOR = 0xD2;
export const MB_CRACKED_FLOOR_HOLE = 0x66;
// SetCrackedFloorHoleMetatile: the cave's crack has its own hole, every other
// tileset with the callback (Sky Pillar, Mirage Tower) uses the Pacifidlog one
const METATILE_Cave_CrackedFloor = 0x22F, METATILE_Cave_CrackedFloor_Hole = 0x206;
const METATILE_Pacifidlog_SkyPillar_CrackedFloor_Hole = 0x237;
const METATILE_MASK = 0x3FF;

const st = { map: null, behind: [] };

export const holeWarpFor = name => HOLE_WARPS[name] || null;

function breakFloor(world, x, y) {
	const v = world.current?.layout?.map?.[y]?.[x];
	if (v == null) return;
	const hole = (v & METATILE_MASK) === METATILE_Cave_CrackedFloor ? METATILE_Cave_CrackedFloor_Hole : METATILE_Pacifidlog_SkyPillar_CrackedFloor_Hole;
	world.setMetatile(x, y, hole, null);
}

// After each finished step. Returns the map to fall to, or null.
export function crackedFloorStep(world, player) {
	const name = world.current?.name;
	const dest = holeWarpFor(name);
	if (!dest) { st.map = null; st.behind = []; return null; }
	if (st.map !== name) { st.map = name; st.behind = []; }
	// the floor you crossed gives way once you are off it
	for (const b of st.behind) if (b.x !== player.tx || b.y !== player.ty) { breakFloor(world, b.x, b.y); b.done = true; }
	st.behind = st.behind.filter(b => !b.done);
	const beh = world.behaviorAt(player.tx, player.ty);
	if (beh === MB_CRACKED_FLOOR_HOLE) return dest;
	if (beh === MB_CRACKED_FLOOR) {
		// only the bike's speed carries you (GetPlayerSpeed() == PLAYER_SPEED_FASTEST)
		if (!player.biking) return dest;
		if (st.behind.length < 2) st.behind.push({ x: player.tx, y: player.ty });
	}
	return null;
}

export function resetHoles() { st.map = null; st.behind = []; }
