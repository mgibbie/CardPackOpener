// m3d/sim.js — MicaSurvivor 3D (Plans/MICASURVIVOR_3D_PLAN.md, P0 + P1): the RULES of moving in three dimensions.
// Pure: no DOM, no three.js, no clock. step(state, input, room, dt) is the whole of it, so the same inputs always give
// the same run (tests, replays and a co-op guest's copy all need that) and node can test it.
//
// The world is a HEIGHT FIELD: a grid of square cells, each with a floor height and optionally a slope across it, a
// surface (ice, mud, a bounce pad) and water standing in it. Ground height, slope and wall hits are read straight off
// the grid — no physics engine. It is what keeps a phone at 60 fps with a crowd, and it is exact.
//
// Units: metres and seconds. One cell is CELL metres. y is up; x and z are the ground plane.
// The controller is velocity-based, in the Quake / Source family: on the ground you accelerate toward the direction you
// hold and friction eats what you don't; in the air the same acceleration applies but only up to an "air cap" along the
// wished direction — which is what lets a turn in the air carry speed.

export const CELL = 2;

/** Tuning. Every number here is a first guess to be felt on a phone and against the bar (the plan, section 2.2).
 *  A character's own tuning is this with its type traits applied (tuneFor). */
export const K = {
	TICK: 1 / 60,
	GRAVITY: 30,          // m/s² going up
	FALL_GRAVITY: 42,     // m/s² coming down: snappy, not floaty ("extra gravity")
	JUMP_V: 10,           // m/s: an apex of JUMP_V² / (2 · GRAVITY) = 1.67 m
	JUMP_CUT: 0.45,       // letting go of jump on the way up keeps this much of the upward speed (a tap is a short hop)
	AIR_JUMPS: 1,         // jumps in the air, back on landing
	COYOTE: 0.1,          // s after walking off an edge in which a jump still counts as from the ground
	BUFFER: 0.12,         // s a jump pressed just before landing is remembered
	RUN: 7,               // m/s wished speed on the ground
	ACCEL: 11,            // ground acceleration (× wished speed, per second)
	FRICTION: 9,          // ground friction (per second, on the speed)
	STOP_SPEED: 2,        // below this, friction acts as if you moved this fast (so you actually stop)
	AIR_ACCEL: 5,         // air acceleration (× wished speed, per second)
	AIR_CAP: 3,           // m/s: the air acceleration only adds while your speed ALONG the wished direction is under this.
	                      // (Quake's is about a tenth of the run speed: a standing jump then barely drifts, and a jump from
	                      // against a ledge cannot get on to it. Nearly half the run speed keeps the rule — a turn in the air
	                      // never costs speed, holding straight on adds none — and makes a standing jump steerable.)
	MAX_SPEED: 16,        // m/s on the ground plane, whatever you chain together
	STEP: 0.4,            // m: a rise this small is walked up; more is a wall
	RADIUS: 0.45,         // m: how far ahead a wall is felt
	FLOOR_ANGLE: 40,      // degrees: a slope up to this is floor
	SLIDE_MIN: 4.5,       // m/s: crouching at this speed or more starts a slide
	SLIDE_BOOST: 2.5,     // m/s added once when a slide starts
	SLIDE_FRICTION: 1.1,  // a slide's friction (it is the ground's, cut down)
	SLIDE_END: 2.2,       // m/s: a slide ends below this
	SLIDE_GRAVITY: 1,     // how much of gravity's pull along a slope a slide feels (downhill gains, uphill bleeds)
	SLIDE_DOWNHILL: 0.25, // a slide going DOWN a slope has this much of a slide's friction: it runs away with you
	STEEP_PULL: 26,       // m/s² downhill on a slope too steep to stand on
	LAUNCH_VY: 3.4,       // m/s: going over a crest with at least this much upward speed carries you into the air (a run up a
	                      // gentle ramp does not; a slide up it does). Off an edge, any upward speed is kept.
	// --- P1: surfaces. Each cell's surface scales the ground's grip.
	ICE: { friction: 0.1, accel: 0.1, speed: 1 },       // you keep sliding, and you start and turn slowly
	MUD: { friction: 1.5, accel: 1.4, speed: 0.6 },     // a lower top speed, and you stop quickly (the grip is there: it is thick)
	ICE_GRIP: false,      // (a trait) ice is ordinary floor to you
	MUD_GRIP: false,      // (a trait) mud is ordinary floor to you
	BOUNCE_V: 17,         // m/s up off a bounce pad (an apex of 4.8 m); holding jump adds BOUNCE_HOLD
	BOUNCE_HOLD: 1.18,
	// --- P1: water. Swimming begins when the feet are SWIM_DEPTH below the surface and the bottom is out of reach.
	SWIM_DEPTH: 0.9,      // m: you float with your feet this far under the surface
	SWIM_SPEED: 0.55,     // of the run speed
	SWIM_DRAG: 4,         // friction in water
	SWIM_UP: 4,           // m/s rising while jump is held under water
	SWIM_SINK: 1.2,       // m/s sinking when it is not
	SWIM_LEAP: 0.82,      // of JUMP_V: a jump at the surface leaps out
	WADE_SPEED: 0.8,      // of the run speed, walking where the water is shallower than SWIM_DEPTH
	// --- P1: landings. A fall faster than HARD_LAND staggers you for STAGGER s (slowed, no jump) — unless you BREAK it:
	// hold slide as you land (you come out sliding, with the fall's speed), or land on a slope (it carries you downhill).
	HARD_LAND: 17,        // m/s (a drop of about 3.4 m)
	STAGGER: 0.35,        // s
	STAGGER_SPEED: 0.35,  // of the run speed while staggered
	BREAK_KEEP: 0.35,     // of the fall's speed a broken fall turns into forward speed
	// --- P1: traits (off by default; a type turns them on)
	GLIDE: false,         // holding jump while falling caps the fall at GLIDE_FALL
	GLIDE_FALL: 3,        // m/s
	KILL_Y: -30,          // m: below this you are put back at the room's spawn
	// --- the movement tech (owner, 2026-11-12: in the first version). WALL-RUNNING: in the air, beside a wall and moving
	// along it while you hold a direction that leans INTO it, the wall carries you: you keep your speed, you barely sink.
	// A jump from it kicks you off the wall and up, and costs no air jump. One wall holds you for WALLRUN_TIME; the same
	// wall will not take you again until you have touched the ground or another wall (two facing walls can be climbed).
	WALLRUN: true,
	WALL_MIN: 1,          // m: a wall is a rise of at least this above your feet…
	WALL_REACH: 0.25,     // m beyond your radius: …this close beside you
	WALLRUN_MIN: 4.5,     // m/s along the wall to be carried by it
	WALLRUN_TIME: 1.1,    // s one wall carries you
	WALLRUN_GRAVITY: 6,   // m/s² once you are coming down on the wall (against 42 in the air; going up it is the air's: a wall adds no height)
	WALLRUN_FALL: 1,      // m/s: the fastest you sink on it
	WALLRUN_ACCEL: 6,     // toward the run speed, along the wall
	WALLJUMP_OUT: 6.5,    // m/s away from the wall
	WALLJUMP_V: 9.5,      // m/s up
	WALL_COYOTE: 0.12,    // s after leaving a wall in which its jump still counts
	WALL_INTO: 0.2,       // how much of what you hold must point INTO the wall (a diagonal along it does; straight along it, or away, lets go: you never stick to a cliff you only fall past)
};

/** Movement traits by Pokémon type: what each type changes in K. First guesses, one line each, for the owner to feel.
 *  A dual type gets both; where two set the same number the bigger change wins. */
export const TYPE_TRAITS = {
	flying: { AIR_JUMPS: 2, GLIDE: true },                         // a second air jump; hold jump to glide down
	dragon: { AIR_JUMPS: 2 },                                      // a second air jump
	water: { SWIM_SPEED: 1, SWIM_DRAG: 1.5, WADE_SPEED: 1 },       // swims as fast as it runs
	ice: { ICE_GRIP: true },                                       // ice is ordinary floor
	ground: { MUD_GRIP: true, HARD_LAND: 1e9 },                    // mud is ordinary floor; no fall staggers it
	rock: { HARD_LAND: 1e9, JUMP_V: 9.4 },                         // no fall staggers it; a slightly lower jump
	steel: { HARD_LAND: 1e9, JUMP_V: 9.4 },
	electric: { RUN: 7.9 },                                        // faster on its feet
	fighting: { JUMP_V: 11, WALLJUMP_V: 10.5 },                    // a higher jump (2.0 m), off a wall too
	fire: { SLIDE_BOOST: 3.6 },                                    // a bigger kick into a slide
	psychic: { AIR_CAP: 4.2 },                                     // steers more in the air
	ghost: { FALL_GRAVITY: 28, HARD_LAND: 1e9 },                   // floats down; no fall staggers it
	bug: { STEP: 0.65, WALLRUN_TIME: 2 },                         // climbs a higher lip; a wall carries it twice as long
	grass: { STEP: 0.65 },
	fairy: { GLIDE: true },                                        // hold jump to glide down
};
/** A character's tuning: K with its types' traits applied. */
export function tuneFor(types) {
	const t = { ...K, ICE: { ...K.ICE }, MUD: { ...K.MUD } };
	for (const ty of types || []) {
		const tr = TYPE_TRAITS[ty]; if (!tr) continue;
		for (const [k, v] of Object.entries(tr)) {
			if (typeof v === 'boolean') t[k] = t[k] || v;
			else t[k] = Math.abs(v - K[k]) >= Math.abs(t[k] - K[k]) ? v : t[k];
		}
	}
	return t;
}

/** A room: { w, h (cells), cells: Float32Array floor heights, slopes: Map(i -> { ax: 'x' | 'z', rise }),
 *  mats: Map(i -> 'ice' | 'mud' | 'bounce'), water: Map(i -> the water's surface height), spawn: [x, y, z] }.
 *  A slope cell's floor runs from its height at the low edge to height + rise at the high edge along +ax (a negative
 *  rise slopes the other way). */
export function makeRoom(w, h, fill = 0) {
	return { w, h, cells: new Float64Array(w * h).fill(fill), slopes: new Map(), mats: new Map(), water: new Map(), spawn: [w * CELL / 2, fill, h * CELL / 2] };
}
export const idx = (room, cx, cz) => cz * room.w + cx;
export function setCell(room, cx, cz, height, slope) {
	if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h) return;
	const i = idx(room, cx, cz);
	room.cells[i] = height;
	if (slope) room.slopes.set(i, slope); else room.slopes.delete(i);
}
const cellOf = (room, x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= room.w || cz >= room.h ? -1 : idx(room, cx, cz); };

const OUT = 1e3;   // outside the room: a wall as high as anything
/** The floor's height at a point of the ground plane. */
export function groundAt(room, x, z) {
	const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
	if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h) return OUT;
	const i = idx(room, cx, cz), s = room.slopes.get(i), base = room.cells[i];
	if (!s) return base;
	const t = s.ax === 'x' ? x / CELL - cx : z / CELL - cz;
	return base + s.rise * t;
}
/** The floor's upward normal at a point: [nx, ny, nz]. Flat ground is [0, 1, 0]. */
export function normalAt(room, x, z) {
	const i = cellOf(room, x, z), s = i < 0 ? null : room.slopes.get(i);
	if (!s) return [0, 1, 0];
	const g = s.rise / CELL, n = 1 / Math.hypot(g, 1);
	return s.ax === 'x' ? [-g * n, n, 0] : [0, n, -g * n];
}
/** The floor's slope at a point, in degrees (0 is flat). */
export const slopeAt = (room, x, z) => Math.acos(Math.min(1, normalAt(room, x, z)[1])) * 180 / Math.PI;
/** What a point of floor is to walk on: 'floor' (you can stand) or 'steep' (you slide off it). */
export function surfaceAt(room, x, z, tune = K) {
	return slopeAt(room, x, z) <= tune.FLOOR_ANGLE + 1e-6 ? 'floor' : 'steep';
}
/** The floor's material at a point: 'ice', 'mud', 'bounce' or null. */
export const matAt = (room, x, z) => { const i = cellOf(room, x, z); return i < 0 ? null : room.mats.get(i) || null; };
/** The water's surface height at a point, or -Infinity where there is none. */
export const waterAt = (room, x, z) => { const i = cellOf(room, x, z); const w = i < 0 ? undefined : room.water.get(i); return w === undefined ? -Infinity : w; };

export function newState(room, tune = K) {
	const [x, y, z] = room.spawn;
	return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, sliding: false, swimming: false, gliding: false, facing: 0, coyote: 0, buffer: 0,
		airJumps: tune.AIR_JUMPS, jumpHeld: false, crouchHeld: false, stagger: 0, gvy: 0, bouncing: false, t: 0, tick: 0,
		landed: 0, hard: 0, broke: '', jumped: 0, bounced: 0, respawns: 0,
		wall: 0, wallT: 0, wallLast: 0, wallCoyote: 0, wallNx: 0, wallNz: 0 };   // (the wall carrying you: 1 +x, 2 -x, 3 +z, 4 -z; 0 none)
}
/** No input. { mx, mz: the wished direction on the ground plane in WORLD axes (any length up to 1), jump, crouch: held } */
export const noInput = () => ({ mx: 0, mz: 0, jump: false, crouch: false });

/** Quake's accelerate: add speed along `wish`, never past `cap` in that direction. */
function accelerate(s, wx, wz, wishSpeed, accel, cap, dt) {
	const cur = s.vx * wx + s.vz * wz, add = Math.min(wishSpeed, cap) - cur;
	if (add <= 0) return;
	const a = Math.min(add, accel * wishSpeed * dt);
	s.vx += a * wx; s.vz += a * wz;
}
function friction(s, k, stop, dt) {
	const sp = Math.hypot(s.vx, s.vz);
	if (sp < 1e-4) { s.vx = s.vz = 0; return; }
	const drop = Math.max(sp, stop) * k * dt, f = Math.max(0, sp - drop) / sp;
	s.vx *= f; s.vz *= f;
}

/** Move on the ground plane, stopped by anything that rises more than a step above the feet. One axis at a time, so
 *  running into a wall at an angle slides along it. */
function moveXZ(s, room, T, dt) {
	const tryAxis = (dx, dz) => {
		if (!dx && !dz) return;
		const nx = s.x + dx, nz = s.z + dz;
		// feel ahead by the body's radius, in the direction of travel
		const px = nx + Math.sign(dx) * T.RADIUS, pz = nz + Math.sign(dz) * T.RADIUS;
		const ahead = Math.max(groundAt(room, px, pz), groundAt(room, nx, nz));
		if (ahead > s.y + T.STEP + 1e-6) { if (dx) s.vx = 0; else s.vz = 0; return; }   // a wall (a rise of exactly a step is walked)
		s.x = nx; s.z = nz;
	};
	tryAxis(s.vx * dt, 0);
	tryAxis(0, s.vz * dt);
}

const WALL_SIDES = [[1, 1, 0], [2, -1, 0], [3, 0, 1], [4, 0, -1]];   // [side, toward the wall x, z]
/** The wall beside a body in the air that could carry it: { side, nx, nz (the wall's normal, pointing off it), along
 *  (the speed along it), tx, tz (the way along it you are going) } or null. The room's edge is not a wall to run on. */
export function wallBeside(s, room, T = K) {
	let best = null;
	for (const [side, wx, wz] of WALL_SIDES) {
		const h = groundAt(room, s.x + wx * (T.RADIUS + T.WALL_REACH), s.z + wz * (T.RADIUS + T.WALL_REACH));
		if (h < s.y + T.WALL_MIN || h >= OUT) continue;
		const al = wx ? s.vz : s.vx, along = Math.abs(al);   // (a wall on the x side runs along z, and the other way round)
		if (!best || along > best.along) best = { side, nx: -wx, nz: -wz, along, tx: wx ? 0 : Math.sign(al) || 1, tz: wx ? Math.sign(al) || 1 : 0 };
	}
	return best;
}

/** One tick. Mutates and returns `s`. `tune`: the character's tuning (tuneFor(types)); K if none. */
export function step(s, input, room, dt = K.TICK, tune = K) {
	const T = tune, inp = input || noInput();
	s.landed = 0; s.hard = 0; s.broke = ''; s.jumped = 0; s.bounced = 0;
	// what you hold
	const wl0 = Math.hypot(inp.mx || 0, inp.mz || 0), wl = Math.min(1, wl0);
	const wishing = wl0 > 0.05;
	const dx = wishing ? (inp.mx || 0) / wl0 : 0, dz = wishing ? (inp.mz || 0) / wl0 : 0;   // the unit wished direction
	if (wishing) s.facing = Math.atan2(dx, dz);

	// timers
	s.coyote = s.grounded ? T.COYOTE : Math.max(0, s.coyote - dt);
	const pressed = inp.jump && !s.jumpHeld;
	s.buffer = pressed ? T.BUFFER : Math.max(0, s.buffer - dt);
	const released = !inp.jump && s.jumpHeld;
	s.jumpHeld = !!inp.jump;
	s.stagger = Math.max(0, s.stagger - dt);

	// where you are
	const water = waterAt(room, s.x, s.z), floor0 = groundAt(room, s.x, s.z);
	const depth = water - s.y;                                  // how far the feet are under the surface (negative: above it)
	const canSwim = water - floor0 > T.SWIM_DEPTH;              // the bottom is out of reach here
	if (!s.swimming && canSwim && depth >= T.SWIM_DEPTH - 1e-6) s.swimming = true;
	if (s.swimming && (!canSwim || depth < T.SWIM_DEPTH - 0.35)) s.swimming = false;

	if (s.swimming) return swim(s, inp, room, T, dt, { wishing, dx, dz, wl, pressed, water });

	const surface = s.grounded ? surfaceAt(room, s.x, s.z, T) : 'air';
	let mat = s.grounded ? matAt(room, s.x, s.z) : null;
	if ((mat === 'ice' && T.ICE_GRIP) || (mat === 'mud' && T.MUD_GRIP)) mat = null;
	const grip = mat === 'ice' ? T.ICE : mat === 'mud' ? T.MUD : null;
	const wade = s.grounded && depth > 0.15 ? T.WADE_SPEED : 1;
	const wishSpeed = T.RUN * wl * (grip ? grip.speed : 1) * wade * (s.stagger > 0 ? T.STAGGER_SPEED : 1);

	// a slide: crouch while moving fast on the floor
	if (s.grounded && surface === 'floor' && inp.crouch && !s.crouchHeld && !s.sliding && Math.hypot(s.vx, s.vz) >= T.SLIDE_MIN) {
		s.sliding = true;
		const sp = Math.hypot(s.vx, s.vz); s.vx += s.vx / sp * T.SLIDE_BOOST; s.vz += s.vz / sp * T.SLIDE_BOOST;
	}
	if (s.sliding && (!inp.crouch || !s.grounded || Math.hypot(s.vx, s.vz) < T.SLIDE_END)) s.sliding = false;
	s.crouchHeld = !!inp.crouch;

	// a wall: in the air, beside one and going along it while what you hold leans into it
	if (s.grounded) { s.wall = 0; s.wallLast = 0; s.wallCoyote = 0; }
	else {
		const wb = T.WALLRUN ? wallBeside(s, room, T) : null;
		const holds = !!wb && wishing && dx * wb.nx + dz * wb.nz <= -T.WALL_INTO && wb.along >= T.WALLRUN_MIN;
		if (holds && s.wall !== wb.side && wb.side !== s.wallLast) { s.wall = wb.side; s.wallT = T.WALLRUN_TIME; }   // a new wall takes you
		if (s.wall && (!holds || wb.side !== s.wall || s.wallT <= 0)) { s.wallLast = s.wall; s.wall = 0; s.wallCoyote = T.WALL_COYOTE; }   // it lets go
		else if (!s.wall) s.wallCoyote = Math.max(0, s.wallCoyote - dt);
		if (s.wall) { s.wallNx = wb.nx; s.wallNz = wb.nz; s.wallT -= dt; }
	}
	// the jump: from the ground (or within the coyote time), off a wall, else an air jump
	if (s.buffer > 0 && s.stagger <= 0) {
		const fromGround = (s.grounded || s.coyote > 0) && surface !== 'steep';
		if (!fromGround && (s.wall || s.wallCoyote > 0)) {
			// off the wall: away from it and up, keeping the speed along it; it costs no air jump
			const into = s.vx * s.wallNx + s.vz * s.wallNz;
			s.vx += s.wallNx * (T.WALLJUMP_OUT - Math.min(0, into)); s.vz += s.wallNz * (T.WALLJUMP_OUT - Math.min(0, into));
			s.vy = T.WALLJUMP_V; s.buffer = 0; s.jumped = 3; s.facing = Math.atan2(s.vx, s.vz);
			if (s.wall) s.wallLast = s.wall; s.wall = 0; s.wallCoyote = 0;
		} else if (fromGround || s.airJumps > 0) {
			if (!fromGround) s.airJumps--;
			s.vy = T.JUMP_V; s.grounded = false; s.coyote = 0; s.buffer = 0; s.jumped = fromGround ? 1 : 2;
			// (a jump out of a slide keeps the slide's speed: the velocity is untouched)
			s.sliding = false;
		}
	}
	if (released && s.vy > 0 && !s.grounded && !s.bouncing) s.vy *= T.JUMP_CUT;   // a tap is a short hop (not off a bounce pad)

	// horizontal: ground or air
	if (s.grounded) {
		const n = normalAt(room, s.x, s.z), hl = Math.hypot(n[0], n[2]);
		if (surface === 'steep') {
			// too steep to stand: pulled downhill, no grip
			s.vx += n[0] / hl * T.STEEP_PULL * dt; s.vz += n[2] / hl * T.STEEP_PULL * dt;
		} else if (s.sliding) {
			// a slide feels the slope: down it you gain (and the floor barely holds you back), up it you bleed
			const downhill = hl > 1e-6 && s.vx * n[0] + s.vz * n[2] > 0;
			friction(s, T.SLIDE_FRICTION * (grip ? grip.friction : 1) * (downhill ? T.SLIDE_DOWNHILL : 1), T.STOP_SPEED, dt);
			if (hl > 1e-6) { const a = T.GRAVITY * hl * T.SLIDE_GRAVITY; s.vx += n[0] / hl * a * dt; s.vz += n[2] / hl * a * dt; }   // g · sin θ along the fall line
		} else {
			friction(s, T.FRICTION * (grip ? grip.friction : 1), T.STOP_SPEED, dt);
			if (wishing) accelerate(s, dx, dz, wishSpeed, T.ACCEL * (grip ? grip.accel : 1), wishSpeed, dt);
		}
	} else if (s.wall) {
		// carried by the wall: along it, toward the run speed (never losing what you came with)
		const wb = wallBeside(s, room, T);
		if (wb) accelerate(s, wb.tx, wb.tz, Math.max(T.RUN, wb.along), T.WALLRUN_ACCEL, Math.max(T.RUN, wb.along), dt);
	} else if (wishing) {
		accelerate(s, dx, dz, T.RUN * wl, T.AIR_ACCEL, T.AIR_CAP, dt);
	}
	{ const sp = Math.hypot(s.vx, s.vz); if (sp > T.MAX_SPEED) { s.vx *= T.MAX_SPEED / sp; s.vz *= T.MAX_SPEED / sp; } }

	const y0 = s.y;
	moveXZ(s, room, T, dt);

	// vertical
	const g = groundAt(room, s.x, s.z);
	if (s.grounded) {
		const carried = s.gvy;                                   // the upward speed the floor was giving you
		if (g < s.y - T.STEP || (carried >= T.LAUNCH_VY && g < y0 + carried * dt - 0.03)) {
			// walked off an edge, or ran over a crest fast enough: into the air, keeping any upward speed
			s.grounded = false; s.vy = Math.max(0, carried); s.gvy = 0;
		} else {
			// follow the floor: slopes and steps. The upward speed the SLOPE gives you (a step up is not a slope: it gives none)
			const n = normalAt(room, s.x, s.z);
			s.y = g; s.vy = 0; s.gvy = -(n[0] * s.vx + n[2] * s.vz) / n[1];
		}
	}
	if (!s.grounded) {
		s.gliding = !!(T.GLIDE && inp.jump && s.vy < 0) && !s.wall;
		s.vy -= (s.vy > 0 ? T.GRAVITY : s.wall ? T.WALLRUN_GRAVITY : T.FALL_GRAVITY) * dt;
		if (s.wall && s.vy < -T.WALLRUN_FALL) s.vy = -T.WALLRUN_FALL;   // (the wall holds you up)
		if (s.gliding && s.vy < -T.GLIDE_FALL) s.vy = -T.GLIDE_FALL;
		s.y += s.vy * dt;
		if (s.vy <= 0) s.bouncing = false;
		if (s.y <= g && s.vy <= 0) land(s, inp, room, T, g);
	} else s.gliding = false;

	// a bounce pad under your feet throws you up
	if (s.grounded && matAt(room, s.x, s.z) === 'bounce') {
		s.vy = T.BOUNCE_V * (inp.jump ? T.BOUNCE_HOLD : 1); s.grounded = false; s.bouncing = true; s.bounced = 1; s.sliding = false;
		s.airJumps = T.AIR_JUMPS; s.coyote = 0; s.buffer = 0; s.stagger = 0;
	}
	if (s.y < T.KILL_Y) { const r = newState(room, T); Object.assign(s, r, { respawns: s.respawns + 1, t: s.t, tick: s.tick }); }
	s.t += dt; s.tick++;
	return s;
}

/** Touching down. A fall faster than HARD_LAND staggers you, unless it is broken: by holding slide (you come out
 *  sliding), by a slope (it carries you down it), by water, or by a bounce pad. */
function land(s, inp, room, T, g) {
	const fall = -s.vy;
	s.landed = fall; s.y = g; s.vy = 0; s.grounded = true; s.airJumps = T.AIR_JUMPS; s.gliding = false; s.gvy = 0; s.wall = 0; s.wallLast = 0; s.wallCoyote = 0;
	if (fall <= T.HARD_LAND) return;
	if (matAt(room, s.x, s.z) === 'bounce') return;
	if (waterAt(room, s.x, s.z) - g > 0.3) { s.broke = 'water'; return; }
	const n = normalAt(room, s.x, s.z), hl = Math.hypot(n[0], n[2]);
	if (hl > 0.2) {                                             // a slope of about 12° or more
		s.broke = 'slope'; s.vx += n[0] / hl * fall * T.BREAK_KEEP; s.vz += n[2] / hl * fall * T.BREAK_KEEP; return;
	}
	if (inp.crouch) {
		// a slide out of the fall: along the way you were going (or the way you face, from a straight drop)
		let sp = Math.hypot(s.vx, s.vz), ux = sp > 0.5 ? s.vx / sp : Math.sin(s.facing), uz = sp > 0.5 ? s.vz / sp : Math.cos(s.facing);
		sp = Math.max(sp, T.SLIDE_MIN) + fall * T.BREAK_KEEP;
		s.vx = ux * sp; s.vz = uz * sp; s.sliding = true; s.crouchHeld = true; s.broke = 'slide'; return;
	}
	s.hard = fall; s.stagger = T.STAGGER; s.vx *= 0.3; s.vz *= 0.3;
}

/** One tick in deep water: you float with your feet SWIM_DEPTH under the surface, sink a little when you let go, rise
 *  while jump is held, and leap out with a jump at the surface. */
function swim(s, inp, room, T, dt, w) {
	s.grounded = false; s.sliding = false; s.gliding = false; s.coyote = 0; s.gvy = 0; s.airJumps = T.AIR_JUMPS; s.stagger = 0; s.wall = 0; s.wallLast = 0; s.wallCoyote = 0;
	friction(s, T.SWIM_DRAG, 0.5, dt);
	if (w.wishing) accelerate(s, w.dx, w.dz, T.RUN * T.SWIM_SPEED * w.wl, T.ACCEL, T.RUN * T.SWIM_SPEED * w.wl, dt);
	moveXZ(s, room, T, dt);
	const floatY = w.water - T.SWIM_DEPTH, floor = groundAt(room, s.x, s.z), atTop = s.y >= floatY - 0.05;
	if (inp.jump && atTop && w.pressed) {
		s.vy = T.JUMP_V * T.SWIM_LEAP; s.swimming = false; s.jumped = 1; s.y = Math.max(s.y, floatY);
	} else {
		s.vy = inp.jump ? T.SWIM_UP : inp.crouch ? -T.SWIM_UP : (atTop ? 0 : (s.y < floatY - 0.3 ? T.SWIM_UP * 0.5 : 0));   // you bob back up to the float line; crouch dives
		if (!inp.jump && !inp.crouch && atTop) s.vy = 0;
		s.y += s.vy * dt;
		if (s.y > floatY) { s.y = floatY; s.vy = 0; }
		if (s.y < floor) { s.y = floor; s.vy = 0; }
	}
	s.crouchHeld = !!inp.crouch;
	s.t += dt; s.tick++;
	return s;
}

/** What the character is doing, for the animation and the HUD. */
export function stateName(s) {
	if (s.swimming) return 'swimming';
	if (!s.grounded) return s.wall ? 'wallrunning' : s.gliding ? 'gliding' : s.vy > 0 ? 'rising' : 'falling';
	if (s.stagger > 0) return 'staggered';
	if (s.sliding) return 'sliding';
	return Math.hypot(s.vx, s.vz) > 0.6 ? 'running' : 'idle';
}

// ---------------------------------------------------------------- sprites in 3D
/** Which of a sheet's 8 facing rows to show: the character's facing as the CAMERA sees it.
 *  facing: the character's heading (radians, atan2(x, z)); camYaw: the camera's heading (it looks along
 *  [sin(camYaw), cos(camYaw)]). Rows are PMD's: 0 Down (toward the viewer), then clockwise as seen on screen:
 *  1 DownRight · 2 Right · 3 UpRight · 4 Up (away) · 5 UpLeft · 6 Left · 7 DownLeft. */
export function facingRow(facing, camYaw) {
	// the heading relative to "toward the camera"; +90° is the viewer's right
	const fx = Math.sin(facing), fz = Math.cos(facing), cx = Math.sin(camYaw), cz = Math.cos(camYaw);
	const toward = -(fx * cx + fz * cz);          // 1: facing the camera
	const right = fz * cx - fx * cz;              // 1: facing the viewer's right (the camera's right is forward × up = [-cz, cx])
	const a = Math.atan2(right, toward);          // 0 Down, +π/2 Right, π Up, -π/2 Left
	return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
