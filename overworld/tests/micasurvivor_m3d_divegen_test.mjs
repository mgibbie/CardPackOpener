// micasurvivor_m3d_divegen_test.mjs — MicaSurvivor 3D, Dive (Plans/MICASURVIVOR_3D_PLAN.md §5.53): a Dive floor in 3D
// (micasurvivor/m3d/divegen.js), in node, with the 2D game's OWN floor generator (js/expedition/dive-gen.js) read as it is.
//   * a floor is the 2D game's floor: the same {seed, route, floor} gives the same cave, with its spawn, stairs, lost
//     Pokémon, foe groups, chests, landmark and plugs at the same tiles (one tile = one 2 m cell)
//   * its ground: floor at 0, rock 6 m high, pools with a bed and water; tall grass as scatter
//   * every floor of every route can be walked: the stairs, the lost Pokémon and every foe group are reached on foot
//     from the spawn, with a DRY way to the stairs; a chest is in the open or in a secret pocket
//   * a secret pocket is sealed until its plug is opened, and then its chest is reached
//   * the rhythm (alpha every 5th floor, guardian every 25th, the Escape Rope) is the 2D game's
//   * your body in it: you stand at the spawn, walk on the floor, cannot jump the walls, wade the pools (slower) and
//     jump out of them
//   node overworld/tests/micasurvivor_m3d_divegen_test.mjs
import { diveFrom, floorRoom, diveRoom, checkFloor, at, DK } from '../../micasurvivor/m3d/divegen.js';
import { CELL, K, newState, step, noInput, groundAt, waterAt } from '../../micasurvivor/m3d/sim.js';
import { hashRoom } from '../../micasurvivor/m3d/gen.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['expedition/dive-gen.js']), X = diveFrom(G), D = G.DiveGen;
A(!!X && X.ROUTE_IDS.length === 9 && X.ROUTE_IDS.includes('forest') && X.K === D.K && CELL === 2, 'the 3D game reads the 2D game\'s own Dive floors: its nine routes, its numbers; one tile is one 2 m cell');

// ---------------------------------------------------------------- a floor is the 2D game's floor
{
	const L = X.layout(7, 'forest', 3), L2 = D.layout({ seed: 7, route: 'forest', floor: 3 }), room = floorRoom(X, L);
	A(JSON.stringify([L.spawn, L.stairs, L.rescue, L.groups, L.chests, L.shape]) === JSON.stringify([L2.spawn, L2.stairs, L2.rescue, L2.groups, L2.chests, L2.shape]) && L.kind.join('') === L2.kind.join(''), 'the layout is the 2D game\'s, the same every time it is asked for');
	A(room.w === 56 && room.h === 40 && room.dive === L && room.route === 'forest' && room.floor === 3, 'the room is the layout\'s grid: 56 x 40 cells (112 x 80 m)');
	const cellH = (p) => groundAt(room, (p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL);
	let floorOk = true, wallOk = true, poolOk = true, nf = 0, nw = 0, np = 0;
	for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) { const k = L.kind[z * L.w + x], h = cellH([x, z]), wtr = waterAt(room, (x + 0.5) * CELL, (z + 0.5) * CELL); if (k === X.FLOOR) { nf++; if (h !== 0 || wtr !== -Infinity) floorOk = false; } else if (k === X.WALL) { nw++; if (h !== DK.WALL_H) wallOk = false; } else { np++; if (!near(h, -DK.BED) || !near(wtr, -DK.WATER)) poolOk = false; } }
	A(floorOk && wallOk && poolOk && nf > 800 && nw > 400 && np > 20, `its ground: ${nf} floor cells at 0, ${nw} of rock ${DK.WALL_H} m high, ${np} of pool (bed ${DK.BED} m down, water just under the ground)`);
	A(JSON.stringify(room.spawn) === JSON.stringify(at(L.spawn)) && JSON.stringify(room.stairs) === JSON.stringify(at(L.stairs)) && room.exit === room.stairs && JSON.stringify(room.rescue) === JSON.stringify(at(L.rescue)), 'the spawn, the stairs (the room\'s exit) and the lost Pokémon stand at the layout\'s tiles');
	A(room.groups.length === L.groups.length && room.groups.every((g, i) => g.at[0] === (L.groups[i].at[0] + 0.5) * CELL && g.at[2] === (L.groups[i].at[1] + 0.5) * CELL && !!g.guard === !!L.groups[i].guard) && room.chests.length === L.chests.length, `so do its ${room.groups.length} foe groups (the path's guards marked) and its ${room.chests.length} chests`);
	const grass = L.prop ? [...L.prop].filter((p, i) => p === X.GRASS && L.kind[i] === X.FLOOR).length : 0;
	A(room.scatter.filter((s) => s.kind === 'grass').length === grass && grass > 0, `its ${grass} tufts of tall grass are scatter on the floor`);
	A(room.biome === 'meadow' && diveRoom(X, 7, 'canyon', 3).biome === 'mountain' && diveRoom(X, 7, 'reef', 3).biome === 'marsh' && room.rimH === DK.WALL_H, 'a route has its biome\'s look (forest: meadow; canyon: mountain; reef: marsh)');
	A(hashRoom(room) === hashRoom(diveRoom(X, 7, 'forest', 3)) && hashRoom(room) !== hashRoom(diveRoom(X, 7, 'forest', 4)) && hashRoom(room) !== hashRoom(diveRoom(X, 8, 'forest', 3)), 'the same seed, route and floor give the same room to the last cell; another floor or seed, another');
}

// ---------------------------------------------------------------- every floor can be walked
{
	const bad = [], shapes = {}; let n = 0, pockets = 0, dryless = 0;
	for (const route of X.ROUTE_IDS) for (let seed = 1; seed <= 8; seed++) for (const floor of [1, 2, 3, 4, 5, 7, 10, 15, 25, 26, 40, 50]) {
		n++; const room = diveRoom(X, seed, route, floor), p = checkFloor(room);
		shapes[room.dive.shape] = (shapes[room.dive.shape] || 0) + 1; pockets += room.plugs.length;
		if (p.length) bad.push(`${route} seed ${seed} floor ${floor} (${room.dive.shape}): ${p.join('; ')}`);
	}
	A(bad.length === 0, `${n} floors over the nine routes (${Object.entries(shapes).map(([k, v]) => v + ' ' + k).join(', ')}): the stairs, the lost Pokémon and every foe group are reached on foot from the spawn, with a dry way to the stairs; every chest is in the open or in a pocket`, bad.slice(0, 6).join('\n      '));
	A(pockets > 100 && shapes.guardian > 0 && shapes.maze > 0 && shapes.islands > 0, `…among them ${pockets} secret pockets, and every shape of floor`, shapes);
}

// ---------------------------------------------------------------- a secret pocket
{
	let found = null;
	for (let seed = 1; seed <= 40 && !found; seed++) { const L = X.layout(seed, 'forest', 3); if (L.plugs.length) found = { seed, L }; }
	const { seed, L } = found, shut = floorRoom(X, L), open = floorRoom(X, L, { open: L.plugs.map((p, i) => i) }), pl = L.plugs[0];
	const h = (room, p) => groundAt(room, (p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL);
	A(h(shut, pl.at) === DK.WALL_H && h(open, pl.at) === 0 && (!pl.at2 || (h(shut, pl.at2) === DK.WALL_H && h(open, pl.at2) === 0)) && h(shut, pl.chest) === 0, `a plug (seed ${seed}: a ${pl.kind}) is rock until it is opened; the pocket behind it is floor all along`);
	A(shut.plugs[0].open === false && open.plugs[0].open === true && shut.plugs[0].kind === pl.kind && JSON.stringify(shut.plugs[0].chest) === JSON.stringify(at(pl.chest)), 'the room says which plugs are open, their kind and their chest');
	A(checkFloor(shut).length === 0 && checkFloor(open).length === 0, 'shut, its chest cannot be reached; open, it can (the floor passes its check both ways)');
	// the check is a real one: a plug's chest left in the open, or the stairs walled in, is caught
	const broken = floorRoom(X, L); for (const p of [pl.at, pl.at2]) if (p) broken.cells[p[1] * broken.w + p[0]] = 0;
	A(checkFloor(broken).some((q) => /can be reached with the plug shut/.test(q)), '(a pocket left open while its plug is said to be shut is caught)');
	const walled = floorRoom(X, L), sx = L.stairs[0], sz = L.stairs[1]; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) walled.cells[(sz + dz) * walled.w + sx + dx] = DK.WALL_H;
	A(checkFloor(walled).some((q) => /the stairs cannot be reached/.test(q)), '(stairs walled in are caught)');
}

// ---------------------------------------------------------------- the rhythm
{
	const c = (f) => X.cadence(f);
	A(c(5).arena && !c(5).guardian && !c(4).arena && c(25).guardian && c(25).arena && c(10).rope && c(20).rope && c(25).rope && !c(5).rope && !c(11).rope, 'the rhythm is the 2D game\'s: an alpha every 5th floor, a guardian every 25th, the Escape Rope on 10, 20 and every 25th');
	const g = diveRoom(X, 7, 'forest', 25), a5 = diveRoom(X, 7, 'forest', 5);
	A(g.dive.shape === 'guardian' && a5.dive.shape === 'clearing' && checkFloor(g).length === 0, 'floor 25 is the guardian\'s arena, floor 5 a clearing for the alpha');
}

// ---------------------------------------------------------------- your body in it
{
	const room = diveRoom(X, 7, 'forest', 3), s = newState(room);
	A(near(s.x, room.spawn[0]) && near(s.z, room.spawn[2]) && s.y === 0 && s.grounded, 'you stand at the spawn, on the floor');
	// run at the nearest wall and jump at it: you do not get on top
	const L = room.dive; let wall = null;
	for (let r = 1; r < 30 && !wall; r++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = L.spawn[0] + dx * r, z = L.spawn[1] + dz * r; if (x > 0 && z > 0 && x < L.w && z < L.h && L.kind[z * L.w + x] === X.WALL && !wall) { let clear = true; for (let q = 1; q < r; q++) if (L.kind[(L.spawn[1] + dz * q) * L.w + L.spawn[0] + dx * q] !== X.FLOOR) clear = false; if (clear) wall = { dx, dz, r }; } }
	let top = 0;
	for (let i = 0; i < 60 * 12; i++) { step(s, { mx: wall.dx, mz: wall.dz, jump: i % 20 < 10, crouch: false }, room); top = Math.max(top, s.y); }
	A(wall && top < DK.WALL_H - 1 && groundAt(room, s.x, s.z) < DK.WALL_H, `running and jumping at a wall for 12 s: you never get on top of it (highest ${top.toFixed(2)} m of ${DK.WALL_H})`, wall);
	// a pool: you go in and swim, and come out again
	let pool = null; for (let i = 0; i < L.kind.length && !pool; i++) if (L.kind[i] === X.LIQUID) { const x = i % L.w, z = (i - x) / L.w; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => L.kind[(z + dz) * L.w + x + dx] === X.LIQUID)) pool = [x, z]; }
	const w = newState(room); w.x = (pool[0] + 0.5) * CELL; w.z = (pool[1] + 0.5) * CELL; w.y = 0.5; w.grounded = false;
	for (let i = 0; i < 90; i++) step(w, noInput(), room);
	A(pool && w.grounded && !w.swimming && near(w.y, -DK.BED, 1e-3) && DK.BED - DK.WATER < K.SWIM_DEPTH, 'dropped into a pool you stand on its bed, in water to the waist (shallower than swimming depth)', [w.y, w.swimming, w.grounded]);
	// wading is slower than running on the floor
	const topSpeed = (st, n) => { let v = 0; for (let i = 0; i < n; i++) { step(st, { mx: 1, mz: 0, jump: false, crouch: false }, room); v = Math.max(v, Math.hypot(st.vx, st.vz)); } return v; };
	const wide = (() => { for (let z = 1; z < L.h - 1; z++) { let n = 0; for (let x = 1; x < L.w - 1; x++) { n = L.kind[z * L.w + x] === X.LIQUID ? n + 1 : 0; if (n >= 5) return [x - 4, z]; } } return null; })();
	if (wide) { const p = newState(room); p.x = (wide[0] + 0.5) * CELL; p.z = (wide[1] + 0.5) * CELL; p.y = -DK.BED; const vw = topSpeed(p, 40), vd = topSpeed(newState(room), 40); A(vw < vd * 0.9 && vw > vd * 0.5, `wading is slower than running (${vw.toFixed(1)} against ${vd.toFixed(1)} m/s)`, [vw, vd]); }
	else A(true, '(no pool five cells wide on this floor to time a wade in)');
	// a jump takes you out
	let edge = null;
	for (let i = 0; i < L.kind.length && !edge; i++) if (L.kind[i] === X.LIQUID) { const x = i % L.w, z = (i - x) / L.w; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (L.kind[(z + dz) * L.w + x + dx] === X.FLOOR) edge = { x, z, dx, dz }; }
	const j = newState(room); j.x = (edge.x + 0.5) * CELL; j.z = (edge.z + 0.5) * CELL; j.y = -DK.BED;
	for (let i = 0; i < 90; i++) { const out = j.grounded && j.y > -0.01; step(j, out ? noInput() : { mx: edge.dx, mz: edge.dz, jump: i > 5 && i < 25, crouch: false }, room); }
	A(near(j.y, 0, 1e-3) && j.grounded && groundAt(room, j.x, j.z) === 0, 'a jump towards the bank takes you out of a pool, back on the floor', [j.x / CELL, j.z / CELL, j.y, edge]);
	A(DK.BED > K.STEP, '(a pool\'s edge is more than a step: you jump out, you do not walk out)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
