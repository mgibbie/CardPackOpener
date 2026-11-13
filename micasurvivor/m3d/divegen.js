// divegen.js — MicaSurvivor 3D, Dive (Plans/MICASURVIVOR_3D_PLAN.md §5.53): a Dive floor, in 3D.
//
// Owner, 2026-11-12: 3D Dive is today's Dive in 3D (open floors, find the stairs), not a redesign. So a floor here is
// the 2D game's OWN floor: js/expedition/dive-gen.js lays it out (the same {seed, route, floor} gives the same cave,
// spawn, stairs, lost Pokémon, foe groups, chests, landmark and secret pockets), read through diveFrom(G), and this
// module raises that plan into a room the 3D game can walk:
//   a floor tile   ground at 0
//   a wall tile    rock DK.WALL_H high (three and a half jumps: a wall, not a step), a plug the same until it is opened
//   a liquid tile  a pool: its bed DK.BED below, water to just under the ground. Shallow: you wade it, slowed, and a
//                  jump takes you out (the 2D layout never puts a pool across the way from the spawn to the stairs)
//   tall grass     scatter, as the 2D floor's tufts
// One 2D tile is one cell (32 px = 2 m), so every point of the layout is a cell of the room, and every distance of the
// 2D Dive's rules is the same distance here.
// Pure and seeded: no DOM, no clock.
import { CELL, makeRoom, setCell } from './sim.js';
import { footGraph } from './gen.js';

export const DK = {
	WALL_H: 6,        // a wall's height, metres (a jump clears 1.67)
	BED: 0.6,         // a pool's bed below the ground (shallower than the sim's swimming depth: you wade)
	WATER: 0.1,       // the water's surface below the ground
	BIOME: { viridian: 'meadow', mtmoon: 'mountain', cerulean: 'marsh' },   // the 2D routes' biomes, as the 3D game's
};

/** The 2D game's Dive floors, as the 3D game reads them. */
export function diveFrom(G) {
	const D = G.DiveGen; if (!D) return null;
	return { K: D.K, ROUTES: D.ROUTES, ROUTE_IDS: D.ROUTE_IDS.slice(), FLOOR: D.FLOOR, WALL: D.WALL, LIQUID: D.LIQUID, GRASS: D.GRASS,
		layout: (seed, route, floor) => D.layout({ seed, route, floor }), cadence: (floor) => D.cadence(floor) };
}
/** The centre of a layout tile, on the ground: [x, y, z] in metres. */
export const at = (p, y = 0) => [(p[0] + 0.5) * CELL, y, (p[1] + 0.5) * CELL];
const cellI = (L, p) => p[1] * L.w + p[0];

/** A layout L (the 2D game's) as a room. o.open: the plugs already opened, by index (their pockets are floor).
 *  The room carries `dive` (the layout), `stairs`, `rescue`, `groups`, `chests`, `landmark`, `plugs` in metres, and
 *  `exit` = the stairs (the minimap's and the arrow's goal). */
export function floorRoom(X, L, o = {}) {
	const room = makeRoom(L.w, L.h, DK.WALL_H), opened = new Set(o.open || []);
	// a plug (a boulder or a thicket: its one or two tiles, `at` and `at2`) is rock in the layout until it is opened
	const unplugged = new Set();
	(L.plugs || []).forEach((pl, i) => { if (opened.has(i)) for (const c of [pl.at, pl.at2]) if (c) unplugged.add(cellI(L, c)); });
	room.scatter = [];
	for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) {
		const i = z * L.w + x, k = L.kind[i];
		if (k === X.WALL && !unplugged.has(i)) continue;   // (rock: the room is filled with it)
		if (k === X.LIQUID) { setCell(room, x, z, -DK.BED); room.water.set(i, -DK.WATER); continue; }
		setCell(room, x, z, 0);
		if (k !== X.WALL && L.prop && L.prop[i] === X.GRASS) room.scatter.push({ kind: 'grass', x: (x + 0.5) * CELL, z: (z + 0.5) * CELL, y: 0, s: 1 });
	}
	const R = X.ROUTES[L.route] || {};
	room.biome = DK.BIOME[R.biome] || 'meadow';
	room.rimH = DK.WALL_H; room.maxH = 0; room.tiles = []; room.rails = []; room.size = 0;
	room.seed = (L.seed >>> 0) || 1;
	room.spawn = at(L.spawn);
	room.stairs = at(L.stairs); room.exit = room.stairs;
	room.rescue = L.rescue ? at(L.rescue) : null;
	room.groups = (L.groups || []).map((g) => ({ ...g, at: at(g.at) }));
	room.chests = (L.chests || []).map((c) => at(Array.isArray(c) ? c : c.at));
	room.landmark = L.landmark ? { ...(Array.isArray(L.landmark) ? {} : L.landmark), at: at(Array.isArray(L.landmark) ? L.landmark : L.landmark.at) } : null;
	room.plugs = (L.plugs || []).map((pl, i) => ({ kind: pl.kind, at: at(pl.at), at2: pl.at2 ? at(pl.at2) : null, open: opened.has(i), chest: pl.chest ? at(pl.chest) : null, faces: [] }));
	// (a shut plug is rock: what shows it stands against its face, on the side the spawn reaches)
	{ const n = L.w * L.h, seen = new Uint8Array(n), q = [cellI(L, L.spawn)]; seen[q[0]] = 1;
		for (let k = 0; k < q.length; k++) { const i = q[k], x = i % L.w, z = (i - x) / L.w; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue; const j = nz * L.w + nx; if (!seen[j] && room.cells[j] < DK.WALL_H) { seen[j] = 1; q.push(j); } } }
		(L.plugs || []).forEach((pl, pi) => { for (const c of [pl.at, pl.at2]) { if (!c) continue; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c[0] + dx, nz = c[1] + dz; if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h || !seen[nz * L.w + nx]) continue; room.plugs[pi].faces.push([(c[0] + 0.5 + dx * 0.62) * CELL, 0, (c[1] + 0.5 + dz * 0.62) * CELL]); break; } } }); }
	// (a chest behind a plug is its pocket's: it is listed with the plug, and with the floor's chests too)
	const pocket = new Set(room.plugs.filter((pl) => pl.chest).map((pl) => pl.chest[0] + ',' + pl.chest[2]));
	room.pocketChest = (c) => pocket.has(c[0] + ',' + c[2]);
	room.dive = L; room.route = L.route; room.floor = L.floor;
	return room;
}
/** Floor `floor` of route `route` for a run's seed, as a room. */
export const diveRoom = (X, seed, route, floor, o) => floorRoom(X, X.layout(seed, route, floor), o);

/** What is wrong with a Dive room (none: []): the stairs, the lost Pokémon, every foe group and every chest outside a
 *  pocket must be reachable on foot from the spawn, on dry ground or through a pool; nothing may stand in rock. */
export function checkFloor(room) {
	const problems = [], W = room.w, n = room.w * room.h, cellOf = (p) => Math.floor(p[2] / CELL) * W + Math.floor(p[0] / CELL);
	// on foot, wading allowed: every cell that is not rock. `plugs`: the cells of the shut plugs count as open too
	const plugCells = new Set(); for (const pl of room.plugs) if (!pl.open) for (const p of [pl.at, pl.at2]) if (p) plugCells.add(cellOf(p));
	const flood = (withPlugs) => { const open = (i) => room.cells[i] < room.rimH || (withPlugs && plugCells.has(i)), seen = new Uint8Array(n), q = [cellOf(room.spawn)]; seen[q[0]] = 1;
		for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, z = (i - x) / W; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= room.w || nz >= room.h) continue; const j = nz * W + nx; if (!seen[j] && open(j)) { seen[j] = 1; q.push(j); } } }
		return seen; };
	const seen = flood(false), behind = flood(true), rock = (i) => room.cells[i] >= room.rimH;
	if (rock(cellOf(room.spawn))) problems.push('the spawn is in rock');
	const need = (what, p) => { if (!p) return; const i = cellOf(p); if (rock(i)) problems.push(what + ' is in rock'); else if (!seen[i]) problems.push(what + ' cannot be reached from the spawn'); };
	need('the stairs', room.stairs); need('the lost Pokémon', room.rescue);
	room.groups.forEach((g, i) => need('foe group ' + i, g.at));
	if (room.landmark) need('the landmark', room.landmark.at);
	// a chest is in the open, or in a secret pocket: then it is reached once the pocket's plug is opened, and not before
	room.chests.forEach((c, i) => { const j = cellOf(c); if (rock(j)) problems.push('chest ' + i + ' is in rock'); else if (!seen[j] && !behind[j]) problems.push('chest ' + i + ' cannot be reached, even with every plug open'); });
	room.plugs.forEach((pl, i) => { if (!pl.chest) return; const j = cellOf(pl.chest); if (rock(j)) problems.push('plug ' + i + "'s chest is in rock"); else if (!pl.open && seen[j]) problems.push('plug ' + i + "'s chest can be reached with the plug shut"); else if (!behind[j]) problems.push('plug ' + i + "'s chest cannot be reached with the plug open"); });
	// the way to the stairs on DRY ground (the 2D layout promises it: pools never cover the path)
	{
		const g = footGraph(room), dry = new Uint8Array(n), dq = [cellOf(room.spawn)]; dry[dq[0]] = 1;
		for (let k = 0; k < dq.length; k++) for (const j of g[dq[k]] || []) if (!dry[j] && !room.water.has(j)) { dry[j] = 1; dq.push(j); }
		if (room.stairs && !dry[cellOf(room.stairs)]) problems.push('no dry way from the spawn to the stairs');
	}
	return problems;
}
