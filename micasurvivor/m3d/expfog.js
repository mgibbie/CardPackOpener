// expfog.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): the fog of war of an Expedition zone. The minimap
// and the zone map only show what you have found: the cells within 14 of where you have stood are EXPLORED, and a
// thing of the zone shows once its cell is explored (or while you are within 9 cells of it). The 2D game's rule and
// numbers (js/expedition/economy.js: SIGHT, RADAR); a cell here is a 2D tile (2 m).
//
// Each screen has its own fog: yours is where YOU have been (a co-op guest's is its own; a watcher's follows the
// player it watches from when it began to watch). A new zone starts dark.
import { CELL } from './sim.js';

export const FK = { SIGHT: 14, RADAR: 9 };
/** A zone's fog: nothing explored yet. */
export const newFog = (room) => ({ room, w: room.w, h: room.h, a: new Uint8Array(room.w * room.h), n: 0, last: -1 });
/** You stand at (x, z): the cells within `sight` are explored. -> whether anything new was (it is worked out once for
 *  each cell you stand on). */
export function reveal(fog, x, z, sight = FK.SIGHT) {
	const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), at = cz * fog.w + cx;
	if (at === fog.last) return false;
	fog.last = at;
	const n0 = fog.n;
	for (let dz = -sight; dz <= sight; dz++) for (let dx = -sight; dx <= sight; dx++) {
		if (dx * dx + dz * dz > sight * sight) continue;
		const qx = cx + dx, qz = cz + dz; if (qx < 0 || qz < 0 || qx >= fog.w || qz >= fog.h) continue;
		const i = qz * fog.w + qx; if (!fog.a[i]) { fog.a[i] = 1; fog.n++; }
	}
	return fog.n !== n0;
}
export const explored = (fog, cx, cz) => !!fog && cx >= 0 && cz >= 0 && cx < fog.w && cz < fog.h && !!fog.a[cz * fog.w + cx];
/** Has a thing at world (o.x, o.z) been found? Its cell explored, or within `radar` cells of where you are now. */
export const found = (fog, o, pos, radar = FK.RADAR) => explored(fog, Math.floor(o.x / CELL), Math.floor(o.z / CELL)) || (!!pos && Math.hypot(pos.x - o.x, pos.z - o.z) < radar * CELL);
/** The run's fog for the zone it is in now (a new zone: a new, dark one). */
export function fogOf(S) { if (!S.fog || S.fog.room !== S.w.room) S.fog = newFog(S.w.room); return S.fog; }
/** Every tick of a run: where you stand is explored. */
export function tickFog(S) { const s = S.w.pl.s, K = (S.X.E && S.X.E.K) || FK; return reveal(fogOf(S), s.x, s.z, K.SIGHT || FK.SIGHT); }
/** How much of the zone's floor (not its rim) you have explored, 0 to 1. */
export function share(fog) { const r = fog.room; let all = 0, seen = 0; for (let i = 0; i < r.cells.length; i++) if (r.cells[i] < (r.rimH || 8)) { all++; if (fog.a[i]) seen++; } return all ? seen / all : 0; }
