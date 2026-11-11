// m3d/sim.js — MicaSurvivor 3D, P0 (Plans/MICASURVIVOR_3D_PLAN.md): the RULES of moving in three dimensions.
// Pure: no DOM, no three.js, no clock. step(state, input, room, dt) is the whole of it, so the same inputs always give
// the same run (tests, replays and a co-op guest's copy all need that) and node can test it.
//
// The world is a HEIGHT FIELD: a grid of square cells, each with a floor height and optionally a slope across it.
// Ground height, slope and wall hits are read straight off the grid — no physics engine. It is what keeps a phone at
// 60 fps with a crowd, and it is exact.
//
// Units: metres and seconds. One cell is CELL metres. y is up; x and z are the ground plane.
// The controller is velocity-based, in the Quake / Source family: on the ground you accelerate toward the direction you
// hold and friction eats what you don't; in the air the same acceleration applies but only up to a small "air cap" along
// the wished direction — which is what lets a turn in the air carry (and even gain) speed.

export const CELL = 2;

/** Tuning. Every number here is a first guess to be felt on a phone and against the bar (the plan, section 2.2). */
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
	STEEP_PULL: 26,       // m/s² downhill on a slope too steep to stand on
	KILL_Y: -30,          // m: below this you are put back at the room's spawn
};

/** A room: { w, h (cells), cells: Float32Array heights, slopes: Map(index -> { ax: 'x' | 'z', rise }), spawn: [x, y, z] }.
 *  A slope cell's floor runs from its height at the low edge to height + rise at the high edge along +ax (a negative
 *  rise slopes the other way). */
export function makeRoom(w, h, fill = 0) {
	return { w, h, cells: new Float32Array(w * h).fill(fill), slopes: new Map(), spawn: [w * CELL / 2, fill, h * CELL / 2] };
}
export const idx = (room, cx, cz) => cz * room.w + cx;
export function setCell(room, cx, cz, height, slope) {
	if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h) return;
	const i = idx(room, cx, cz);
	room.cells[i] = height;
	if (slope) room.slopes.set(i, slope); else room.slopes.delete(i);
}

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
	const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
	if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h) return [0, 1, 0];
	const s = room.slopes.get(idx(room, cx, cz));
	if (!s) return [0, 1, 0];
	const g = s.rise / CELL, n = 1 / Math.hypot(g, 1);
	return s.ax === 'x' ? [-g * n, n, 0] : [0, n, -g * n];
}
/** What a point of floor is to walk on: 'floor' (you can stand) or 'steep' (you slide off it). */
export function surfaceAt(room, x, z) {
	const ny = normalAt(room, x, z)[1];
	return Math.acos(Math.min(1, ny)) * 180 / Math.PI <= K.FLOOR_ANGLE + 1e-6 ? 'floor' : 'steep';
}

export function newState(room) {
	const [x, y, z] = room.spawn;
	return { x, y, z, vx: 0, vy: 0, vz: 0, grounded: true, sliding: false, facing: 0, coyote: 0, buffer: 0, airJumps: K.AIR_JUMPS,
		jumpHeld: false, crouchHeld: false, t: 0, tick: 0, landed: 0, jumped: 0, respawns: 0 };
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
function friction(s, k, dt) {
	const sp = Math.hypot(s.vx, s.vz);
	if (sp < 1e-4) { s.vx = s.vz = 0; return; }
	const drop = Math.max(sp, K.STOP_SPEED) * k * dt, f = Math.max(0, sp - drop) / sp;
	s.vx *= f; s.vz *= f;
}

/** Move on the ground plane, stopped by anything that rises more than a step above the feet. One axis at a time, so
 *  running into a wall at an angle slides along it. */
function moveXZ(s, room, dt) {
	const tryAxis = (dx, dz) => {
		if (!dx && !dz) return;
		const nx = s.x + dx, nz = s.z + dz;
		// feel ahead by the body's radius, in the direction of travel
		const px = nx + Math.sign(dx) * K.RADIUS, pz = nz + Math.sign(dz) * K.RADIUS;
		const ahead = Math.max(groundAt(room, px, pz), groundAt(room, nx, nz));
		if (ahead > s.y + K.STEP) { if (dx) s.vx = 0; else s.vz = 0; return; }   // a wall
		s.x = nx; s.z = nz;
	};
	tryAxis(s.vx * dt, 0);
	tryAxis(0, s.vz * dt);
}

/** One tick. Mutates and returns `s`. */
export function step(s, input, room, dt = K.TICK) {
	const inp = input || noInput();
	s.landed = 0; s.jumped = 0;
	// what you hold
	let wx = inp.mx || 0, wz = inp.mz || 0;
	const wl = Math.hypot(wx, wz);
	if (wl > 1) { wx /= wl; wz /= wl; }
	const wishing = wl > 0.05, wishSpeed = K.RUN * Math.min(1, wl);   // (a half-pushed stick walks)
	const dx = wishing ? (inp.mx || 0) / wl : 0, dz = wishing ? (inp.mz || 0) / wl : 0;   // the unit wished direction
	if (wishing) s.facing = Math.atan2(dx, dz);

	// timers
	s.coyote = s.grounded ? K.COYOTE : Math.max(0, s.coyote - dt);
	const pressed = inp.jump && !s.jumpHeld;
	s.buffer = pressed ? K.BUFFER : Math.max(0, s.buffer - dt);
	const released = !inp.jump && s.jumpHeld;
	s.jumpHeld = !!inp.jump;

	const surface = s.grounded ? surfaceAt(room, s.x, s.z) : 'air';

	// a slide: crouch while moving fast on the floor
	if (s.grounded && surface === 'floor' && inp.crouch && !s.crouchHeld && !s.sliding && Math.hypot(s.vx, s.vz) >= K.SLIDE_MIN) {
		s.sliding = true;
		const sp = Math.hypot(s.vx, s.vz); s.vx += s.vx / sp * K.SLIDE_BOOST; s.vz += s.vz / sp * K.SLIDE_BOOST;
	}
	if (s.sliding && (!inp.crouch || !s.grounded || Math.hypot(s.vx, s.vz) < K.SLIDE_END)) s.sliding = false;
	s.crouchHeld = !!inp.crouch;

	// the jump: from the ground (or within the coyote time), else an air jump
	if (s.buffer > 0) {
		const fromGround = (s.grounded || s.coyote > 0) && surface !== 'steep';
		if (fromGround || s.airJumps > 0) {
			if (!fromGround) s.airJumps--;
			s.vy = K.JUMP_V; s.grounded = false; s.coyote = 0; s.buffer = 0; s.jumped = fromGround ? 1 : 2;
			// (a jump out of a slide keeps the slide's speed: nothing to do, the velocity is untouched)
			s.sliding = false;
		}
	}
	if (released && s.vy > 0 && !s.grounded) s.vy *= K.JUMP_CUT;   // a tap is a short hop

	// horizontal: ground or air
	if (s.grounded) {
		if (surface === 'steep') {
			// too steep to stand: pulled downhill, no grip
			const n = normalAt(room, s.x, s.z), hl = Math.hypot(n[0], n[2]) || 1;
			s.vx += n[0] / hl * K.STEEP_PULL * dt; s.vz += n[2] / hl * K.STEEP_PULL * dt;
		} else if (s.sliding) {
			friction(s, K.SLIDE_FRICTION, dt);
		} else {
			friction(s, K.FRICTION, dt);
			if (wishing) accelerate(s, dx, dz, wishSpeed, K.ACCEL, wishSpeed, dt);
		}
	} else if (wishing) {
		accelerate(s, dx, dz, wishSpeed, K.AIR_ACCEL, K.AIR_CAP, dt);
	}

	{ const sp = Math.hypot(s.vx, s.vz); if (sp > K.MAX_SPEED) { s.vx *= K.MAX_SPEED / sp; s.vz *= K.MAX_SPEED / sp; } }
	moveXZ(s, room, dt);

	// vertical
	const g = groundAt(room, s.x, s.z);
	if (s.grounded) {
		if (g < s.y - K.STEP) { s.grounded = false; }          // walked off an edge: falling (the coyote time is running)
		else { s.y = g; s.vy = 0; }                              // follow the floor: slopes and steps
	}
	if (!s.grounded) {
		s.vy -= (s.vy > 0 ? K.GRAVITY : K.FALL_GRAVITY) * dt;
		s.y += s.vy * dt;
		if (s.y <= g && s.vy <= 0) {
			s.landed = -s.vy; s.y = g; s.vy = 0; s.grounded = true; s.airJumps = K.AIR_JUMPS;
		}
	}
	if (s.y < K.KILL_Y) { const r = newState(room); Object.assign(s, r, { respawns: s.respawns + 1, t: s.t, tick: s.tick }); }
	s.t += dt; s.tick++;
	return s;
}

/** What the character is doing, for the animation and the HUD. */
export function stateName(s) {
	if (!s.grounded) return s.vy > 0 ? 'rising' : 'falling';
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
