// m3d/room.js — P0's one hand-built test room (Plans/MICASURVIVOR_3D_PLAN.md, phase P0). Not a generator: a fixed set
// of things to jump on, so the controller can be felt and tested. 24 × 24 cells of 2 m.
//
//   north (z small)
//   ┌───────────────────────────────────────────┐
//   │  STAIRS (0.3 m steps) up to a 1.5 m DECK   │   walk up the steps, drop off the deck
//   │                                            │
//   │  LEDGE  1.5 m      (jump on to it)         │
//   │  TOWER  3.9 m      (from the ledge: a jump and an air jump)
//   │                                            │
//   │  RAMP   a floor slope up to a 3 m PLATEAU  │   run up it; slide down it
//   │  CHUTE  a slope too steep to stand on      │   you slide off it
//   │  PIT    2 m down, with a ramp out          │
//   │  WALL   a 6 m block                        │
//   │  P1: an ICE patch, a MUD patch, two BOUNCE pads, a POOL with a shallow way in
//   │  A RAIL from the plateau's south edge down to the floor (jump on to it)
//   └───────────────────────────────────────────┘
import { CELL, makeRoom, setCell, idx } from './sim.js';

export const ROOM_W = 24, ROOM_H = 24;
export const SPOTS = {};   // named places (world x, z), for tests and for placing the crowd

export function buildRoom() {
	const r = makeRoom(ROOM_W, ROOM_H, 0);
	const box = (x0, z0, x1, z1, h) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) setCell(r, x, z, h); };
	const at = (cx, cz) => [(cx + 0.5) * CELL, (cz + 0.5) * CELL];

	// the rim: a wall all round
	for (let i = 0; i < ROOM_W; i++) { setCell(r, i, 0, 8); setCell(r, i, ROOM_H - 1, 8); }
	for (let i = 0; i < ROOM_H; i++) { setCell(r, 0, i, 8); setCell(r, ROOM_W - 1, i, 8); }

	// stairs: five 0.3 m steps going east, then a deck
	for (let i = 0; i < 5; i++) box(3 + i, 3, 3 + i, 4, 0.3 * (i + 1));
	box(8, 3, 10, 4, 1.5);
	SPOTS.stairsFoot = at(2, 3); SPOTS.deck = at(9, 3);

	// a ledge to jump on to, and a tower beside it
	box(14, 3, 16, 5, 1.5);
	box(17, 3, 18, 5, 3.9);
	SPOTS.ledgeFront = at(15, 7); SPOTS.ledge = at(15, 4); SPOTS.tower = at(17, 4);

	// a ramp (a floor slope: 3 m over 4 cells = 20.6°) up to a plateau
	for (let i = 0; i < 4; i++) for (let z = 10; z <= 12; z++) setCell(r, 4 + i, z, 0.75 * i, { ax: 'x', rise: 0.75 });
	box(8, 10, 11, 12, 3);
	SPOTS.rampFoot = at(3, 11); SPOTS.plateau = at(9, 11);

	// a chute off the plateau's east side: 3 m over one cell = 56°, too steep to stand on
	for (let z = 10; z <= 12; z++) setCell(r, 12, z, 3, { ax: 'x', rise: -3 });
	SPOTS.chuteTop = at(11, 11); SPOTS.chuteFoot = at(14, 11);

	// a pit, 2 m down, with a ramp out on its west side
	box(16, 15, 20, 19, -2);
	for (let z = 15; z <= 19; z++) { setCell(r, 15, z, 0, { ax: 'x', rise: -1 }); setCell(r, 16, z, -1, { ax: 'x', rise: -1 }); }
	SPOTS.pit = at(18, 17); SPOTS.pitRim = at(13, 17);

	// a wall
	box(5, 16, 6, 20, 6);
	SPOTS.wallWest = at(3, 18);

	// a rail: from just over the plateau's south edge, 18 m south and down to half a metre over the floor
	{ const [x, z0] = at(10, 12), z1 = at(10, 21)[1], n = 6; r.rails = [{ pts: Array.from({ length: n + 1 }, (_, k) => [x, 3.5 - 3 * k / n, z0 + (z1 - z0) * k / n]) }]; SPOTS.railTop = [x, z0]; SPOTS.railFoot = [x, z1]; }

	// ---- P1
	const mat = (x0, z0, x1, z1, m) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) r.mats.set(idx(r, x, z), m); };
	mat(8, 17, 10, 19, 'ice'); SPOTS.ice = at(9, 18); SPOTS.iceWest = at(7, 18);
	mat(1, 13, 3, 15, 'mud'); SPOTS.mud = at(2, 14);
	mat(2, 8, 2, 8, 'bounce'); SPOTS.bounce = at(2, 8);
	mat(21, 13, 21, 13, 'bounce');
	// a pool: two wading steps down from the west (-0.4, -0.8), then deep water; the surface is 0.2 m below the floor
	for (let z = 7; z <= 9; z++) { setCell(r, 17, z, -0.4); setCell(r, 18, z, -0.8); for (let x = 19; x <= 22; x++) setCell(r, x, z, -2.6); for (let x = 17; x <= 22; x++) r.water.set(idx(r, x, z), -0.2); }
	SPOTS.poolEdge = at(16, 8); SPOTS.shallow = at(18, 8); SPOTS.pool = at(20, 8);

	// the open floor along the south side (clear for 10 m east and west)
	SPOTS.open = at(12, 21);
	// where you start: mid-room, with 10 m of clear floor behind you for the camera
	SPOTS.start = at(13, 15);
	r.spawn = [SPOTS.start[0], 0, SPOTS.start[1]];
	return r;
}
