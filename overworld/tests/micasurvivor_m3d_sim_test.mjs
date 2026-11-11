// micasurvivor_m3d_sim_test.mjs — MicaSurvivor 3D, P0 (Plans/MICASURVIVOR_3D_PLAN.md): the rules of moving in three
// dimensions (micasurvivor/m3d/sim.js) played in node, on P0's test room (micasurvivor/m3d/room.js). No browser.
//   * the height field: floor heights, slopes and their normals, what is floor and what is too steep
//   * running: up to the run speed, and friction stops you
//   * the jump: its apex is JUMP_V² / 2g; a tap is a short hop; one air jump, back on landing
//   * forgiveness: a jump just after walking off an edge still counts (coyote), a jump pressed just before landing fires
//     on landing (buffer)
//   * the air: holding a direction in the air steers; a turn in the air keeps speed (it never bleeds it), and the air
//     cap keeps a straight hold from adding any
//   * the world: a wall stops you and lets you slide along it; 0.3 m steps are walked up; a 1.5 m ledge is a wall on
//     foot and a jump away (from standing against it too); a 3.9 m tower needs the air jump; a floor ramp is walked up and down without leaving the ground; a chute throws you off
//   * the slide: crouch at speed; it keeps speed far longer than running friction; a jump out of it keeps the speed
//   * determinism: the same inputs give the same run to the last bit; 40,000 random ticks never put you under the
//     floor, inside a wall or outside the room
//   * sprites in 3D: which of a sheet's 8 facing rows the camera should see
//   node overworld/tests/micasurvivor_m3d_sim_test.mjs
import { K, CELL, step, newState, noInput, groundAt, normalAt, surfaceAt, stateName, facingRow } from '../../micasurvivor/m3d/sim.js';
import { buildRoom, SPOTS, ROOM_W, ROOM_H } from '../../micasurvivor/m3d/room.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 600) : '')); } };
const room = buildRoom();
const at = (spot, y) => { const s = newState(room); s.x = spot[0]; s.z = spot[1]; s.y = y === undefined ? groundAt(room, spot[0], spot[1]) : y; return s; };
const run = (s, n, input) => { for (let i = 0; i < n; i++) step(s, typeof input === 'function' ? input(i, s) : input, room); return s; };
const speed = s => Math.hypot(s.vx, s.vz);
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
const EAST = { mx: 1, mz: 0 }, WEST = { mx: -1, mz: 0 }, NORTH = { mx: 0, mz: -1 }, SOUTH = { mx: 0, mz: 1 };
const inp = (o) => ({ ...noInput(), ...o });
const T = K.TICK, secs = t => Math.round(t / T);

// ---------------------------------------------------------------- the height field
A(groundAt(room, ...SPOTS.open) === 0 && groundAt(room, ...SPOTS.deck) === 1.5 && groundAt(room, ...SPOTS.plateau) === 3 && groundAt(room, ...SPOTS.pit) === -2,
	'floor heights: the open floor 0, the deck 1.5, the plateau 3, the pit -2');
A(near(groundAt(room, 4 * CELL + 1, 11 * CELL), 0.375) && near(groundAt(room, 7 * CELL + 1, 11 * CELL), 2.625), 'the ramp rises 0.75 m a cell (halfway up its first cell: 0.375 m)', [groundAt(room, 4 * CELL + 1, 11 * CELL), groundAt(room, 7 * CELL + 1, 11 * CELL)]);
{ const n = normalAt(room, 5 * CELL, 11 * CELL), deg = Math.acos(n[1]) * 180 / Math.PI;
	A(near(deg, 20.56, 0.1) && n[0] < 0 && n[2] === 0 && surfaceAt(room, 5 * CELL, 11 * CELL) === 'floor', 'the ramp is a 20.6° floor, its normal leaning west (downhill)', [deg, n]); }
{ const n = normalAt(room, 12 * CELL + 1, 11 * CELL), deg = Math.acos(n[1]) * 180 / Math.PI;
	A(near(deg, 56.3, 0.1) && n[0] > 0 && surfaceAt(room, 12 * CELL + 1, 11 * CELL) === 'steep', 'the chute is 56.3°: too steep to stand on, its normal leaning east', [deg, n]); }
A(groundAt(room, -1, 5) > 100 && groundAt(room, 5, ROOM_H * CELL + 1) > 100, 'outside the room is a wall');

// ---------------------------------------------------------------- running
{ const s = run(at(SPOTS.open), secs(1.5), inp(EAST));
	A(near(speed(s), K.RUN, 0.05) && s.grounded && stateName(s) === 'running', `running reaches the run speed (${K.RUN} m/s) and stays there`, speed(s));
	const x0 = s.x; run(s, secs(0.6), noInput());
	A(speed(s) === 0 && s.x - x0 < 3 && stateName(s) === 'idle', 'letting go: friction stops you inside 3 m, at a dead stop (not a crawl)', [speed(s), s.x - x0]); }
{ const s = run(at(SPOTS.open), secs(1.5), inp({ mx: 0.5, mz: 0 }));
	A(near(speed(s), K.RUN * 0.5, 0.05), 'a half-pushed stick walks at half speed', speed(s)); }
{ const s = run(at(SPOTS.open), secs(1.5), inp({ mx: -1, mz: -1 }));
	A(near(speed(s), K.RUN, 0.05), 'a diagonal is not faster', speed(s)); }

// ---------------------------------------------------------------- the jump
const apexOf = (input, startTicks = 0) => { const s = at(SPOTS.open); let top = 0; for (let i = 0; i < secs(2); i++) { step(s, input(i), room); top = Math.max(top, s.y); if (i > 5 && s.grounded) break; } return { top, s }; };
{ const want = K.JUMP_V ** 2 / (2 * K.GRAVITY), { top, s } = apexOf(() => inp({ jump: true }));
	A(near(top, want, 0.09) && s.grounded && s.y === 0, `a held jump peaks at JUMP_V² / 2g = ${want.toFixed(2)} m and comes back to the floor`, top);
	const tap = apexOf(i => inp({ jump: i < 3 }));
	A(tap.top < top * 0.6 && tap.top > 0.2, 'a tap is a short hop (under 60 % of a held jump)', [tap.top, top]); }
{ // the fall is faster than the rise
	const s = at(SPOTS.open); let up = 0, down = 0;
	for (let i = 0; i < secs(2); i++) { step(s, inp({ jump: true }), room); if (!s.grounded) { if (s.vy > 0) up++; else down++; } else if (i > 5) break; }
	A(down < up, 'you fall faster than you rise (extra gravity on the way down): the jump is snappy, not floaty', [up, down]); }
{ // one air jump, back on landing
	const s = at(SPOTS.open); let top = 0, jumps = 0;
	for (let i = 0; i < secs(3); i++) { const j = (i % 20) < 10; step(s, inp({ jump: j }), room); if (s.jumped) jumps++; top = Math.max(top, s.y); if (i > 30 && s.grounded) break; }
	A(jumps === 2 && top > K.JUMP_V ** 2 / (2 * K.GRAVITY) * 1.3, 'in the air, a second press jumps again — once (a third does nothing)', [jumps, top]);
	A(s.grounded && s.airJumps === K.AIR_JUMPS, 'landing gives the air jump back'); }

// ---------------------------------------------------------------- forgiveness: coyote time and the jump buffer
{ // walk south off the plateau's edge (3 m down: long enough that a late press is not caught by the landing's buffer)
	const walkOff = (wait) => { const s = at(SPOTS.plateau); s.airJumps = 0; let left = -1, jumped = 0; for (let i = 0; i < secs(3); i++) { const off = !s.grounded && left < 0; if (off) left = i; const press = left >= 0 && i === left + wait; step(s, inp({ ...SOUTH, jump: press }), room); if (s.jumped) jumped = s.jumped; if (left >= 0 && i > left + wait + 2) break; } return jumped; };
	A(walkOff(secs(0.06)) === 1, 'coyote time: a jump 0.06 s after walking off an edge still counts as a ground jump (no air jump needed)');
	A(walkOff(secs(0.2)) === 0, '...but 0.2 s after, with no air jump left, it does not'); }
{ // press jump 0.08 s before landing from a fall: it fires on landing
	const s = at(SPOTS.open, 3); s.grounded = false; s.airJumps = 0;
	let landedAt = -1, jumpedAt = -1, pressAt = -1;
	// find the landing tick first
	const probe = at(SPOTS.open, 3); probe.grounded = false; probe.airJumps = 0; let land = 0; while (!probe.grounded && land < 600) { step(probe, noInput(), room); land++; }
	pressAt = land - secs(0.08);
	for (let i = 0; i < land + 10; i++) { step(s, inp({ jump: i >= pressAt && i < pressAt + 2 }), room); if (s.landed && landedAt < 0) landedAt = i; if (s.jumped && jumpedAt < 0) jumpedAt = i; }
	A(landedAt >= 0 && jumpedAt >= landedAt && jumpedAt <= landedAt + 1, 'jump buffer: a jump pressed 0.08 s before landing fires as you land', [pressAt, landedAt, jumpedAt]);
	const late = at(SPOTS.open, 3); late.grounded = false; late.airJumps = 0; let j2 = 0;
	for (let i = 0; i < land + 10; i++) { step(late, inp({ jump: i >= land - secs(0.3) && i < land - secs(0.3) + 2 }), room); if (late.jumped) j2++; }
	A(j2 === 0, '...a press 0.3 s before landing is forgotten'); }

// ---------------------------------------------------------------- the air
{ // steer in the air: jump while running east, hold north
	const s = run(at(SPOTS.open), secs(1), inp(EAST)); const v0 = speed(s);
	step(s, inp({ ...EAST, jump: true }), room);
	let minSp = 1e9; while (!s.grounded) { step(s, inp({ ...NORTH, jump: true }), room); minSp = Math.min(minSp, speed(s)); }
	A(s.vz < -K.AIR_CAP * 0.9 && near(s.vx, v0, 1e-6), 'holding north in the air bends your path north and leaves your eastward speed alone', [s.vx, s.vz]);
	A(minSp >= v0 - 1e-6, 'a turn in the air never bleeds speed', [minSp, v0]); }
{ // holding straight ahead in the air adds nothing: the air cap
	const s = run(at(SPOTS.open), secs(1), inp(EAST)); const v0 = speed(s);
	step(s, inp({ ...EAST, jump: true }), room); while (!s.grounded) step(s, inp({ ...EAST, jump: true }), room);
	A(near(speed(s), v0, 1e-6) || speed(s) < v0, 'holding straight ahead in the air adds no speed (the air cap)', [speed(s), v0]); }
{ // from a standstill, the air gives only a little
	const s = at(SPOTS.open); step(s, inp({ jump: true }), room); while (!s.grounded) step(s, inp({ ...EAST, jump: true }), room);
	A(speed(s) > K.AIR_CAP * 0.9 && speed(s) <= K.AIR_CAP + 1e-6, `a standing jump can be steered, up to the air cap (${K.AIR_CAP} m/s)`, speed(s)); }

// ---------------------------------------------------------------- the world
{ const s = run(at(SPOTS.wallWest), secs(2), inp(EAST));
	A(s.x < 5 * CELL - K.RADIUS + 0.01 && s.vx === 0 && s.grounded, 'a wall stops you a body\'s radius short of it', [s.x, 5 * CELL]);
	const z0 = s.z; run(s, secs(1), inp({ mx: 1, mz: 1 }));
	A(s.z > z0 + 3 && s.x < 5 * CELL, 'pushing into a wall at an angle slides you along it', [s.z - z0, s.x]); }
{ const s = run(at(SPOTS.stairsFoot), secs(2.2), inp(EAST));
	A(near(s.y, 1.5, 1e-6) && s.grounded && s.x > 8 * CELL, 'five 0.3 m steps are walked straight up on to the 1.5 m deck', [s.x, s.y]);
	let air = 0; const t = at(SPOTS.stairsFoot); for (let i = 0; i < secs(2.2); i++) { step(t, inp(EAST), room); if (!t.grounded) air++; }
	A(air === 0, '...without ever leaving the ground'); }
{ const s = run(at(SPOTS.ledgeFront), secs(1.5), inp(NORTH));
	A(s.y === 0 && s.z > 6 * CELL - 0.01, 'a 1.5 m ledge is a wall on foot', [s.z, s.y]);
	const j = at(SPOTS.ledgeFront); run(j, secs(0.5), inp(NORTH)); let on = false;
	for (let i = 0; i < secs(1.5); i++) { step(j, inp({ ...NORTH, jump: i < 20 }), room); if (j.grounded && near(j.y, 1.5, 1e-6)) { on = true; break; } }
	A(on, '...and one jump gets you on to it'); }
{ // the tower (3.9 m) from the ledge (1.5 m): a jump is 1.67 m and a lip within a step's height (0.4 m) is climbed, so one
	// jump reaches 3.57 m — short; the air jump makes it
	// (a run-up along the ledge, a held jump near its end, let go at the top, then — with the air jump — press again)
	const tryIt = (useAir) => { const s = at([14 * CELL + 0.6, SPOTS.ledge[1]]); let phase = 0, rel = 0;
		for (let i = 0; i < secs(4); i++) {
			let jump = false;
			if (phase === 0 && s.x > 32.6) phase = 1;
			if (phase === 1) { jump = true; if (!s.grounded && s.vy <= 0.5) { phase = 2; rel = 0; } }
			else if (phase === 2) { if (++rel >= 2) phase = useAir ? 3 : 4; }
			else if (phase === 3) jump = true;
			step(s, inp({ ...EAST, jump }), room);
			if (s.grounded && near(s.y, 3.9, 1e-6)) return true;
		}
		return false; };
	A(!tryIt(false) && tryIt(true), 'the 3.9 m tower from the 1.5 m ledge: one jump falls short, a jump and an air jump make it'); }
{ // the ramp: up and down without leaving the ground
	const s = at(SPOTS.rampFoot); let air = 0, top = 0;
	for (let i = 0; i < secs(1.8); i++) { step(s, inp(EAST), room); if (!s.grounded) air++; top = Math.max(top, s.y); }
	A(near(top, 3, 1e-6) && air === 0 && s.grounded, 'the ramp is walked up to the 3 m plateau, feet on the floor all the way', [top, air]);
	const d = at(SPOTS.plateau); let air2 = 0; for (let i = 0; i < secs(1.8); i++) { step(d, inp(WEST), room); if (!d.grounded) air2++; }
	A(d.y === 0 && air2 === 0, '...and back down it the same way (no skipping off the slope)', [d.y, air2]); }
{ // the chute: stand at its top and do nothing — you are thrown off
	const s = at([12 * CELL + 0.3, 11 * CELL + 1]); s.y = groundAt(room, s.x, s.z); run(s, secs(1.2), noInput());
	A(s.x > 13 * CELL && s.y === 0 && s.vx >= 0, 'a slope too steep to stand on throws you down it, with no input', [s.x, s.y]);
	const j = at([12 * CELL + 0.6, 11 * CELL + 1]); j.y = groundAt(room, j.x, j.z); step(j, inp({ jump: true }), room);
	A(j.jumped !== 1, '...and you cannot jump off it as if it were floor (only an air jump)', j.jumped); }
{ // a drop: walk off the deck, land on the floor, landing reports how hard
	const s = at(SPOTS.deck); let hit = 0; for (let i = 0; i < secs(2); i++) { step(s, inp(EAST), room); if (s.landed) hit = s.landed; }
	A(hit > 8 && s.y === 0 && s.grounded, 'walking off the 1.5 m deck: you fall, land, and the landing reports its speed (for dust and camera)', hit); }
{ // out of the pit by its ramp
	const s = run(at(SPOTS.pit), secs(2.5), inp(WEST));
	A(s.y === 0 && s.x < 15 * CELL, 'the pit\'s ramp walks you back out', [s.x, s.y]); }

// ---------------------------------------------------------------- the slide
{ const s = run(at(SPOTS.open), secs(1), inp(WEST)); const v0 = speed(s);
	step(s, inp({ ...WEST, crouch: true }), room);
	A(s.sliding && speed(s) > v0 + K.SLIDE_BOOST * 0.8 && stateName(s) === 'sliding', 'crouching at a run starts a slide, with a kick of speed', [v0, speed(s)]);
	run(s, secs(0.5), inp({ crouch: true }));
	const slid = speed(s);
	const r = run(at(SPOTS.open), secs(1), inp(WEST)); run(r, secs(0.5), noInput());
	A(slid > 4 && speed(r) === 0, 'half a second on: the slide still carries speed, where running friction would have stopped you dead', [slid, speed(r)]);
	const before = speed(s); step(s, inp({ crouch: true, jump: true }), room);
	A(!s.grounded && !s.sliding && near(speed(s), before, 0.2), 'a jump out of a slide keeps the slide\'s speed', [before, speed(s)]); }
{ const s = at(SPOTS.open); step(s, inp({ crouch: true }), room);
	A(!s.sliding, 'crouching at a standstill is not a slide'); }
{ const s = run(at(SPOTS.open), secs(1), inp(WEST)); step(s, inp({ ...WEST, crouch: true }), room); run(s, secs(4), inp({ crouch: true }));
	A(!s.sliding && speed(s) < K.SLIDE_END, 'a slide runs out by itself'); }

// ---------------------------------------------------------------- determinism and safety
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const script = (seed, n) => { const r = rng(seed), out = []; let cur = noInput(), hold = 0; for (let i = 0; i < n; i++) { if (hold-- <= 0) { const a = r() * 6.2832, m = r() < 0.15 ? 0 : 1; cur = { mx: Math.sin(a) * m, mz: Math.cos(a) * m, jump: r() < 0.45, crouch: r() < 0.25 }; hold = Math.floor(r() * 40); } out.push(cur); } return out; };
{ const ins = script(7, 6000), a = newState(room), b = newState(room);
	for (const i of ins) step(a, i, room); for (const i of ins) step(b, i, room);
	A(JSON.stringify(a) === JSON.stringify(b), 'the same inputs give the same run, to the last bit (6,000 ticks)'); }
{ let worst = 0, inWall = 0, out = 0, respawns = 0, maxSp = 0, n = 0;
	for (const seed of [1, 2, 3, 4]) {
		const s = newState(room);
		for (const i of script(seed * 101, 10000)) {
			step(s, i, room); n++;
			const g = groundAt(room, s.x, s.z);
			if (g > 100) out++;
			else { worst = Math.max(worst, g - s.y); if (s.grounded && g - s.y > 1e-6) inWall++; }
			maxSp = Math.max(maxSp, speed(s)); respawns = s.respawns;
		}
	}
	A(out === 0, `${n} random ticks: never outside the room`, out);
	A(worst <= K.STEP + 1e-6 && inWall === 0, '...never under the floor or inside a wall (at most a step\'s height below a lip, in the air)', [worst, inWall]);
	A(respawns === 0, '...never fell out of the world');
	A(maxSp < 40, `...and speed stays sane (top ${maxSp.toFixed(1)} m/s)`, maxSp); }

// ---------------------------------------------------------------- sprites in 3D: the facing row
{ const D = Math.PI / 180, rows = [];
	// the camera looks north-ish along +z (yaw 0). A character facing -z faces the camera: row 0 (Down).
	const f = (dx, dz) => Math.atan2(dx, dz);
	A(facingRow(f(0, -1), 0) === 0 && facingRow(f(0, 1), 0) === 4, 'camera looking along +z: a character facing -z faces the viewer (row 0, Down); facing +z shows its back (row 4, Up)');
	// the camera's right is forward × up = (-1, 0, 0) here: a character facing -x faces the viewer's right
	A(facingRow(f(-1, 0), 0) === 2 && facingRow(f(1, 0), 0) === 6, '...facing -x it faces the viewer\'s right (row 2), facing +x the viewer\'s left (row 6)');
	A(facingRow(f(-1, -1), 0) === 1 && facingRow(f(-1, 1), 0) === 3 && facingRow(f(1, 1), 0) === 5 && facingRow(f(1, -1), 0) === 7, '...and the four diagonals are rows 1, 3, 5, 7');
	// walk the camera once round a character that does not turn: all 8 rows, in order
	for (let i = 0; i < 8; i++) rows.push(facingRow(f(0, -1), i * 45 * D));
	A(rows.join('') === '07654321' || rows.join('') === '01234567', 'orbiting the camera once round a still character shows all 8 rows in turn', rows.join(''));
	A(facingRow(f(0.3, -1), 0) === 0 && facingRow(f(0, -1), 20 * D) === 0, 'a small turn (under 22.5°) keeps the row'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
