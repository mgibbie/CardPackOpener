// sail_fix.js — Mr Briney's ferry, which the transpile could not express.
//
// Reported: "After 'Anchors aweigh!' the cutscene walks me down the beach and
// just ends - no boat, no warp to Dewford, var stuck at 1. Reproduced twice; a
// reload replays the same stuck cutscene." Hoenn is blocked at Dewford/Brawly.
//
// Traced live. The sail legs are the decomp's BOAT ANIMATION: the boat and the
// player hold still on screen while the camera scrolls the ocean past them. The
// transpile lowered that to literal per-tile walk steps — 194 of them — so the
// port walks the player physically off the map (observed at y=161, ~30 seconds
// of walking into void) instead of panning. That is the "walks me down the
// beach", and it is why nothing after it ever runs.
//
// The OUTBOUND leg has a second, independent fault: Route104.json contains no
// warp op anywhere, so the chain can never change maps. Its arrival script
// (Route104_EventScript_ArriveInDewford) shows LOCALID_DEWFORD_BRINEY, clears
// FLAG_HIDE_MR_BRINEY_DEWFORD_TOWN and so on — all Dewford Town objects, while
// still standing on Route 104. The three other legs DO carry a correct warp and
// set their flags before it, so they were only slow, not broken.
//
// NOT the cause, though it is a real observation: LOCALID_ROUTE104_BOAT is in
// the map data with its hide flag clear and absent from the live NPC list,
// because npcs.js skips OBJ_EVENT_GFX_MR_BRINEYS_BOAT as a prop. It has no
// sprite in gfx_map.json, so unfiltering it would draw a generic man on the
// water. A missing actor's move is SKIPPED by the interpreter, not stalled, so
// the boat's absence costs only the visual.
//
// THE MINIMAL FIX, as chosen: keep every line of dialogue and every flag the
// decomp sets, drop the animation the port cannot render, and make the outbound
// leg actually deliver you. You board, and you are in Dewford.
//
// Boarding walks (1-3 steps) are kept — those are real movement and they read
// correctly. Only the ocean-crossing animation is dropped.

// Labels are unprefixed in the script files, so one table covers both the Hoenn
// and Hoenn2 copies (Hoenn2_Route104.json keys are still Route104_EventScript_*).
export const SAIL_LABELS = new Set([
	'Route104_EventScript_SailToDewfordNoCall',
	'Route104_EventScript_SailToDewfordDadCalls',
	'DewfordTown_EventScript_SailToPetalburg',
	'DewfordTown_EventScript_SailToSlateport',
	'Route109_EventScript_DoSailToDewford',
]);

// An ocean crossing, in steps. The longest legitimate scripted walk in the game
// is 106 (a Battle Dome entrance); every sail leg is 97, 171, 173 or 194, and
// nothing else sits between. 90 separates them with room on both sides.
const OCEAN_STEPS = 90;

// Where the outbound leg puts you down: the Dewford dock, one tile south of
// LOCALID_DEWFORD_BRINEY (12,9) and his boat (12,8). findLanding nudges to the
// nearest standable tile, so this cannot drop the player into water.
const DEWFORD_DOCK = { map: 'MAP_DEWFORD_TOWN', x: 12, y: 10 };

// The flag work Route104_EventScript_ArriveInDewford would have done, minus the
// object staging that is meaningless off-map. The hide flags are global, so
// clearing them here means Briney and his boat are already placed when Dewford
// builds its object list on load.
const ARRIVE_IN_DEWFORD = [
	{ op: 'setflag', flag: 'FLAG_HIDE_ROUTE_104_MR_BRINEY_BOAT' },
	{ op: 'setflag', flag: 'FLAG_HIDE_ROUTE_104_MR_BRINEY' },
	{ op: 'clearflag', flag: 'FLAG_HIDE_MR_BRINEY_DEWFORD_TOWN' },
	{ op: 'clearflag', flag: 'FLAG_HIDE_MR_BRINEY_BOAT_DEWFORD_TOWN' },
	{ op: 'copyvar', dst: 'VAR_BRINEY_LOCATION', src: 'VAR_0x8008' },
	{ op: 'setvar', var: 'VAR_BOARD_BRINEY_BOAT_STATE', value: 0 },
	{ op: 'warpxy', map: DEWFORD_DOCK.map, x: DEWFORD_DOCK.x, y: DEWFORD_DOCK.y },
];

// Rewrite one sail label in place. Returns the new op list, or the original.
function patchSail(label, ops) {
	if (!Array.isArray(ops) || !SAIL_LABELS.has(label)) return ops;
	const out = [];
	for (const o of ops) {
		// drop the ocean crossing itself
		if (o && o.op === 'move' && Array.isArray(o.steps) && o.steps.length >= OCEAN_STEPS) continue;
		// the outbound leg's `goto ArriveInDewford` is the arrival that never
		// happened: replace it with the flags it would have set, plus the warp
		// Route104 has never had.
		if (o && o.op === 'goto' && /ArriveInDewford$/.test(String(o.label || ''))) {
			out.push(...ARRIVE_IN_DEWFORD);
			continue;
		}
		out.push(o);
	}
	return out;
}

// Apply to a whole map's script table (called once per map load).
export function applySailFix(scripts) {
	if (!scripts) return scripts;
	for (const label of Object.keys(scripts)) {
		if (!SAIL_LABELS.has(label)) continue;
		scripts[label] = patchSail(label, scripts[label]);
	}
	return scripts;
}
