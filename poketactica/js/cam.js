// cam.js — THE CAMERA EASES WHEREVER IT FOLLOWS (Plans/POKETACTICA_MODES_PLAN.md item A7, "feel"). Mystery Maze's view
// glided to its leader; everywhere else the view CUT to the cursor the moment it left the middle of the screen (a
// battle, Tower Defense, the Map Maker, zoomed in). The same glide, as one small sum, for all of them.
// Pure: no page. main.js holds the view's centre (P.pan) and where it is going (P.panTo), and steps it each frame.

export const CAM_RATE = 16;      // (per second: the view covers ~63% of what is left every 1/16 s; Mystery Maze's rate)
export const CAM_CUT = 6;        // (tiles: further than this the view cuts: a new board, the far end of a big map)
export const CAM_NEAR = 0.01;    // (tiles: nearer than this it has arrived)
/** How fast animations play: the battle's `dt` is multiplied by this (Settings, "Animation speed"). */
export const ANIM_SPEEDS = Object.freeze({ slow: 0.7, quick: 1.5 });
export const animSpeed = (v) => ANIM_SPEEDS[v] || 1;

/**
 * One frame of the glide: the view's centre `pan` ({ x, z }, world units) moved toward `to` over `dt` seconds.
 * cell: a tile's size in world units. -> { pan, done } (done: it has arrived, or it cut)
 */
export function easePan(pan, to, dt, cell = 1, rate = CAM_RATE) {
	const dx = to.x - pan.x, dz = to.z - pan.z, far = Math.hypot(dx, dz) / cell;
	if (far > CAM_CUT || far < CAM_NEAR || !(dt > 0)) return far > CAM_CUT || far < CAM_NEAR ? { pan: { x: to.x, z: to.z }, done: true } : { pan: { x: pan.x, z: pan.z }, done: false };
	const q = 1 - Math.exp(-Math.min(0.1, dt) * rate);
	return { pan: { x: pan.x + dx * q, z: pan.z + dz * q }, done: false };
}
