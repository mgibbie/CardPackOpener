// m3d/actors.js — MicaSurvivor 3D, P3 (Plans/MICASURVIVOR_3D_PLAN.md): bodies that are not the player. Pure rules, the
// same height field as sim.js. An ACTOR is an enemy's body: it walks the floor toward a target, cannot climb what the
// player cannot walk up, drops off ledges, falls with gravity, is shoved by knockback (off a ledge, if that is where
// the shove sends it), floats in deep water, and — a flyer — hovers over everything but the rim.
//
// Finding the way: enemies do not path one by one. A FLOW FIELD is built from the player's cell (one breadth-first
// pass over the level's on-foot graph, a few thousand cells: a fraction of a millisecond, redone only when the player
// changes cell); every walker then just steps to the neighbour cell that is nearer. With a clear run to the target a
// walker goes straight at it instead, so open ground does not look like a grid.
import { CELL, K, groundAt, waterAt, idx } from './sim.js';
import { footGraph } from './gen.js';

export const AK = {
	GRAVITY: 34,          // m/s² (bodies fall a little heavier than the player rises: knock-offs read as falls)
	KNOCK_DECAY: 0.0015,  // what is left of a shove after a second on the floor (the 2D game's number) …
	KNOCK_AIR: 0.5,       // … and in the air (a body knocked off a ledge keeps sailing)
	HOVER: 1.3,           // m above the floor (or the water) a flyer holds
	HOVER_RATE: 5,        // 1/s: how fast it settles to that height
	SWIM_SPEED: 0.55,     // as the player: deep water slows a walker
	CLEAR: 14,            // m: how far a walker looks for a straight run at its target
	KILL_Y: -30,
};

/** A body. o: { x, z, y?, r (radius, m), speed (m/s), fly } */
export function newActor(room, o) {
	const g = groundAt(room, o.x, o.z);
	return { x: o.x, z: o.z, y: o.y === undefined ? (o.fly ? g + (o.hover || AK.HOVER) : g) : o.y, vy: 0, kx: 0, kz: 0, r: o.r || 0.4, speed: o.speed === undefined ? 3 : o.speed, fly: !!o.fly, hover: o.hover || AK.HOVER,
		grounded: !o.fly && o.y === undefined, swimming: false, facing: 0, fell: 0, dropFrom: 0, gone: false };
}
/** Shove a body: an impulse in m/s on the ground plane (and, optionally, up). */
export function knock(a, vx, vz, up = 0) { a.kx += vx; a.kz += vz; if (up > 0 && !a.fly) { a.vy = Math.max(a.vy, up); if (a.grounded) { a.grounded = false; a.dropFrom = a.y; } } }

function moveBody(a, room, dx, dz) {
	const tryAxis = (mx, mz) => {
		if (!mx && !mz) return true;
		const nx = a.x + mx, nz = a.z + mz, px = nx + Math.sign(mx) * a.r, pz = nz + Math.sign(mz) * a.r;
		const ahead = Math.max(groundAt(room, px, pz), groundAt(room, nx, nz));
		const wall = a.fly ? ahead >= (room.rimH || 8) : ahead > a.y + K.STEP + 1e-6;
		if (wall) return false;
		a.x = nx; a.z = nz; return true;
	};
	if (!tryAxis(dx, 0)) a.kx = 0;
	if (!tryAxis(0, dz)) a.kz = 0;
}

/** One tick of a body. (wx, wz): the way it wants to go, a unit vector or (0, 0). `slow`: a speed factor (statuses). */
export function stepActor(a, room, wx, wz, dt = K.TICK, slow = 1) {
	if (a.gone) return a;
	a.fell = 0;
	const steer = a.fly || a.grounded || a.swimming;
	const sp = steer ? a.speed * slow * (a.swimming ? AK.SWIM_SPEED : 1) : 0;
	if (steer && (wx || wz)) a.facing = Math.atan2(wx, wz);
	moveBody(a, room, (wx * sp + a.kx) * dt, (wz * sp + a.kz) * dt);
	const kf = Math.pow(a.grounded || a.swimming || a.fly ? AK.KNOCK_DECAY : AK.KNOCK_AIR, dt);
	a.kx *= kf; a.kz *= kf;

	const g = groundAt(room, a.x, a.z), w = waterAt(room, a.x, a.z);
	if (a.fly) {
		const want = Math.max(g, w) + a.hover;
		a.y += (want - a.y) * Math.min(1, AK.HOVER_RATE * dt);
		if (a.y < g + 0.2) a.y = g + 0.2;
		return a;
	}
	const floatY = w - K.SWIM_DEPTH, deep = w - g > K.SWIM_DEPTH;
	if (deep && a.y <= floatY + 1e-6) {            // afloat
		if (!a.swimming && !a.grounded) a.fell = Math.max(0, a.dropFrom - a.y);
		a.swimming = true; a.grounded = false; a.vy = 0; a.y = floatY; return a;
	}
	if (a.swimming) { a.swimming = false; a.grounded = true; }   // (walked out: the shallows' floor is within a step)
	if (a.grounded) {
		if (g < a.y - K.STEP) { a.grounded = false; a.vy = 0; a.dropFrom = a.y; }   // off an edge
		else a.y = g;
	}
	if (!a.grounded) {
		a.vy -= AK.GRAVITY * dt; a.y += a.vy * dt;
		if (deep && a.y <= floatY) { a.fell = Math.max(0, a.dropFrom - floatY); a.swimming = true; a.vy = 0; a.y = floatY; }
		else if (a.y <= g && a.vy <= 0) { a.fell = Math.max(0, a.dropFrom - g); a.y = g; a.vy = 0; a.grounded = true; }
		if (a.y < AK.KILL_Y) a.gone = true;
	}
	return a;
}

// ---------------------------------------------------------------- finding the way
const GRAPHS = new WeakMap();
function graphs(room) {
	let o = GRAPHS.get(room);
	if (!o) { const out = footGraph(room), back = out.map(() => []); for (let i = 0; i < out.length; i++) for (const n of out[i]) back[n].push(i); GRAPHS.set(room, o = { out, back }); }
	return o;
}
const cellAt = (room, x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= room.w || cz >= room.h ? -1 : idx(room, cx, cz); };

/** The flow field to a point: for every cell, how many steps on foot (drops allowed, no jumps) to the target's cell;
 *  -1 where there is no way. Reuse `into` (same room) to avoid a new array each time. */
export function flowField(room, x, z, into = null) {
	const { back } = graphs(room), n = room.w * room.h, dist = into && into.dist.length === n ? into.dist : new Int32Array(n);
	dist.fill(-1);
	const goal = cellAt(room, x, z), q = into && into.q.length === n ? into.q : new Int32Array(n);
	const f = { dist, q, goal, x, z };
	if (goal < 0) return f;
	let head = 0, tail = 0; q[tail++] = goal; dist[goal] = 0;
	while (head < tail) { const c = q[head++]; for (const p of back[c]) if (dist[p] < 0) { dist[p] = dist[c] + 1; q[tail++] = p; } }
	return f;
}
/** Is there a straight run on foot from (x, z) to (tx, tz)? Sampled every metre: no rise of more than a step. */
export function clearRun(room, x, z, y, tx, tz) {
	const d = Math.hypot(tx - x, tz - z);
	if (d > AK.CLEAR) return false;
	let prev = y;
	for (let s = 1; s <= d; s += 1) { const g = groundAt(room, x + (tx - x) * s / d, z + (tz - z) * s / d); if (g > prev + K.STEP + 1e-6) return false; prev = g; }
	return groundAt(room, tx, tz) <= prev + K.STEP + 1e-6;
}
/** Which way a body should go to reach the field's target: a unit vector [wx, wz] ((0, 0) when it is there). */
export function steer(room, field, a, out = [0, 0]) {
	const dx = field.x - a.x, dz = field.z - a.z, d = Math.hypot(dx, dz);
	out[0] = out[1] = 0;
	if (d < 1e-3) return out;
	const direct = () => { out[0] = dx / d; out[1] = dz / d; return out; };
	if (a.fly || !a.grounded && !a.swimming) return direct();
	const c = cellAt(room, a.x, a.z);
	if (c < 0 || c === field.goal || field.dist[c] < 0) return direct();   // (no way on foot: crowd toward it)
	if (clearRun(room, a.x, a.z, a.y, field.x, field.z)) return direct();
	const { out: edges } = graphs(room);
	let best = -1, bd = field.dist[c];
	for (const n of edges[c]) if (field.dist[n] >= 0 && field.dist[n] < bd) { bd = field.dist[n]; best = n; }
	if (best < 0) return direct();
	const bx = (best % room.w + 0.5) * CELL - a.x, bz = (Math.floor(best / room.w) + 0.5) * CELL - a.z, bl = Math.hypot(bx, bz) || 1;
	out[0] = bx / bl; out[1] = bz / bl;
	return out;
}

/** Keep bodies from standing in each other: push each overlapping pair apart on the ground plane (a soft shove, half
 *  each), flyers only against flyers. A grid keeps it cheap for hundreds. Deterministic: the list's order decides. */
export function separate(actors, strength = 1) {
	const SZ = 1.6, grid = new Map(), key = (gx, gz) => gx * 4096 + gz;
	for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a.gone) continue; const k = key(Math.floor(a.x / SZ), Math.floor(a.z / SZ)); const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
	const push = new Float64Array(actors.length * 2);
	for (let i = 0; i < actors.length; i++) {
		const a = actors[i]; if (a.gone) continue;
		const gx = Math.floor(a.x / SZ), gz = Math.floor(a.z / SZ);
		for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
			const l = grid.get(key(gx + ox, gz + oz)); if (!l) continue;
			for (const j of l) {
				if (j <= i) continue;
				const b = actors[j]; if (a.fly !== b.fly || Math.abs(a.y - b.y) > 1.5) continue;
				let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz), min = a.r + b.r;
				if (d >= min) continue;
				if (d < 1e-6) { dx = ((i * 7 + j * 13) % 11) - 5 || 1; dz = ((i * 5 + j * 3) % 7) - 3 || 1; const l2 = Math.hypot(dx, dz); dx /= l2; dz /= l2; } else { dx /= d; dz /= d; }
				const p = (min - d) * 0.5 * strength;
				push[i * 2] -= dx * p; push[i * 2 + 1] -= dz * p; push[j * 2] += dx * p; push[j * 2 + 1] += dz * p;
			}
		}
	}
	return push;   // (apply with moveActor, so a shove never puts a body in a wall)
}
/** Move a body by a small offset on the ground plane, with the same walls as walking. */
export function moveActor(a, room, dx, dz) {
	const kx = a.kx, kz = a.kz; moveBody(a, room, dx, dz); a.kx = kx; a.kz = kz;
	// (pushed up a slope or onto a low step: stay on the floor, not under it)
	if (!a.fly && a.grounded) { const g = groundAt(room, a.x, a.z); if (g > a.y) a.y = g; }
}
