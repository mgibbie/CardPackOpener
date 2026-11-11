// micasurvivor_m3d_moves_test.mjs — MicaSurvivor 3D, P1 (Plans/MICASURVIVOR_3D_PLAN.md): the full controller, played in
// node on the test room (micasurvivor/m3d/sim.js, room.js). P0's basics are in micasurvivor_m3d_sim_test.mjs.
//   * surfaces: ice (slow to start, slow to stop, slow to turn), mud (slow, stops dead)
//   * bounce pads: thrown 4.8 m up, higher with jump held, air jumps given back
//   * water: wade in the shallows, swim where the bottom is out of reach (floating at the surface, slower), dive with
//     slide, leap out with jump, and walk back out up the steps
//   * slopes: a slide gains speed down a ramp and loses it up one; a slide up a ramp launches off its crest, a run does not
//   * landings: a long fall staggers you (slowed, no jump) — unless you break it by holding slide (you come out sliding,
//     faster), by landing on a slope (it carries you downhill), or in water
//   * type traits: what each Pokémon type changes, and that each really plays differently (Flying glides and has a third
//     jump, Water swims at a run, Ice and Ground ignore ice and mud, Rock never staggers, Fighting jumps higher …)
//   * determinism and safety with traits on: bit-exact, and 40,000 random ticks stay in the world
//   node overworld/tests/micasurvivor_m3d_moves_test.mjs
import { K, CELL, step, newState, noInput, groundAt, matAt, waterAt, slopeAt, stateName, tuneFor, TYPE_TRAITS } from '../../micasurvivor/m3d/sim.js';
import { buildRoom, SPOTS } from '../../micasurvivor/m3d/room.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const room = buildRoom();
const T = K.TICK, secs = t => Math.round(t / T);
const at = (spot, tune = K, y) => { const s = newState(room, tune); s.x = spot[0]; s.z = spot[1]; s.y = y === undefined ? groundAt(room, spot[0], spot[1]) : y; if (y !== undefined) s.grounded = false; return s; };
const run = (s, n, input, tune = K) => { for (let i = 0; i < n; i++) step(s, typeof input === 'function' ? input(i, s) : input, room, T, tune); return s; };
const speed = s => Math.hypot(s.vx, s.vz);
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
const inp = o => ({ ...noInput(), ...o });
const EAST = { mx: 1, mz: 0 }, WEST = { mx: -1, mz: 0 }, NORTH = { mx: 0, mz: -1 }, SOUTH = { mx: 0, mz: 1 };

// ---------------------------------------------------------------- the room's new parts
A(matAt(room, ...SPOTS.ice) === 'ice' && matAt(room, ...SPOTS.mud) === 'mud' && matAt(room, ...SPOTS.bounce) === 'bounce' && matAt(room, ...SPOTS.open) === null, 'the room has an ice patch, a mud patch and a bounce pad');
A(waterAt(room, ...SPOTS.pool) === -0.2 && groundAt(room, ...SPOTS.pool) === -2.6 && groundAt(room, ...SPOTS.shallow) === -0.8 && waterAt(room, ...SPOTS.open) === -Infinity, 'and a pool: the surface 0.2 m below the floor, 2.4 m deep, with shallows on its west side');

// ---------------------------------------------------------------- ice and mud
{ const ice = run(at(SPOTS.ice), secs(0.3), inp(NORTH)), floor = run(at(SPOTS.open), secs(0.3), inp(NORTH));
	A(speed(ice) < speed(floor) * 0.45 && speed(ice) > 0.2, 'ice: you are slow to get going (after 0.3 s, under half the speed you would have on floor)', [speed(ice), speed(floor)]);
	const s = at(SPOTS.ice); s.vz = -6; run(s, secs(0.4), noInput());
	const f = at(SPOTS.open); f.vz = -6; run(f, secs(0.4), noInput());
	A(speed(s) > 3.5 && speed(f) === 0, '...and slow to stop: 0.4 s after letting go you are still sliding, where floor has stopped you', [speed(s), speed(f)]);
	const t = at(SPOTS.ice); t.vz = -6; run(t, secs(0.25), inp(EAST));
	A(t.vz < -4 && t.vx < 2.5, '...and slow to turn: holding east barely bends a northward slide', [t.vx, t.vz]);
	const it = tuneFor(['ice']), i2 = at(SPOTS.ice, it); i2.vz = -6; run(i2, secs(0.4), noInput(), it);
	A(speed(i2) === 0, 'an Ice type treats ice as ordinary floor'); }
{ const s = run(at(SPOTS.mud), secs(0.6), inp(NORTH));   // (0.6 s: still on the patch)
	A(near(speed(s), K.RUN * K.MUD.speed, 0.1), `mud: your top speed is ${K.MUD.speed * 100} % of a run`, speed(s));
	const m = at(SPOTS.mud); m.vx = 4; run(m, secs(0.15), noInput());
	const f = at(SPOTS.open); f.vx = 4; run(f, secs(0.15), noInput());
	A(speed(m) < speed(f), '...and it stops you faster than floor does', [speed(m), speed(f)]);
	const gt = tuneFor(['ground']), g = run(at(SPOTS.mud, gt), secs(0.6), inp(NORTH), gt);
	A(near(speed(g), K.RUN, 0.1) && g.z < s.z - 0.8, 'a Ground type runs through mud at full speed', [speed(g), g.z, s.z]); }

// ---------------------------------------------------------------- bounce pads
{ const s = at(SPOTS.bounce); let top = 0, b = 0;
	for (let i = 0; i < secs(1.5); i++) { step(s, noInput(), room); if (s.landed) break; top = Math.max(top, s.y); b += s.bounced; }   // (up to the first landing: the pad throws you again)
	const want = K.BOUNCE_V ** 2 / (2 * K.GRAVITY);
	A(b === 1 && near(top, want, 0.2), `a bounce pad throws you ${want.toFixed(1)} m up`, [b, top]);
	const h = at(SPOTS.bounce); h.jumpHeld = true; let top2 = 0; for (let i = 0; i < secs(2); i++) { step(h, inp({ jump: true }), room); if (h.landed) break; top2 = Math.max(top2, h.y); }
	A(top2 > top * 1.25 && h.airJumps === K.AIR_JUMPS, '...higher with jump held (and holding it is not an air jump)', [top, top2, h.airJumps]);
	const a = at(SPOTS.bounce); a.airJumps = 0; step(a, noInput(), room);
	A(a.airJumps === K.AIR_JUMPS && !a.grounded, '...and gives your air jumps back');
	const r = at(SPOTS.bounce); step(r, noInput(), room); step(r, inp({ jump: true }), room); step(r, noInput(), room); const vy = r.vy;
	A(r.airJumps === K.AIR_JUMPS - 1 || vy > K.BOUNCE_V * 0.6, 'letting go of jump on the way up does not cut a bounce short', [vy, r.airJumps]); }

// ---------------------------------------------------------------- water
{ const s = at(SPOTS.poolEdge); let wadeSp = 0, sawWade = false;
	for (let i = 0; i < secs(4); i++) { step(s, inp(EAST), room); if (s.grounded && waterAt(room, s.x, s.z) - s.y > 0.3 && !s.swimming) { sawWade = true; wadeSp = Math.max(wadeSp, speed(s)); } if (s.swimming && i > 10 && s.x > SPOTS.pool[0]) break; }
	A(sawWade && wadeSp <= K.RUN * K.WADE_SPEED + 0.05, `the shallows are waded: on the bottom, at up to ${K.WADE_SPEED * 100} % of a run`, [sawWade, wadeSp]);
	A(s.swimming && stateName(s) === 'swimming' && near(s.y, -0.2 - K.SWIM_DEPTH, 0.05), `where the bottom is out of reach you swim, floating with your feet ${K.SWIM_DEPTH} m under the surface`, [s.swimming, s.y]);
	run(s, secs(0.6), noInput());   // (come to rest first)
	run(s, secs(0.3), inp(NORTH)); const sw = speed(s);   // (0.3 s: the pool is small)
	A(near(sw, K.RUN * K.SWIM_SPEED, 0.15), `swimming is ${Math.round(K.SWIM_SPEED * 100)} % of a run`, sw);
	run(s, secs(0.5), noInput());
	A(s.swimming && near(s.y, -0.2 - K.SWIM_DEPTH, 0.05) && speed(s) < 0.6, 'let go and you stop and float (you do not sink)', [s.y, speed(s)]);
	run(s, secs(1.5), inp({ crouch: true }));
	A(near(s.y, -2.6, 1e-6) && s.swimming, 'holding slide dives, down to the pool\'s floor', s.y);
	run(s, secs(1.2), inp({ jump: true }));
	A(near(s.y, -0.2 - K.SWIM_DEPTH, 0.05), 'holding jump swims back up to the surface', s.y);
	step(s, noInput(), room); step(s, inp({ jump: true }), room);
	A(!s.swimming && s.vy > 6 && s.jumped === 1, 'a jump at the surface leaps out of the water', [s.swimming, s.vy]);
	const w = at(SPOTS.pool, K, -0.2 - K.SWIM_DEPTH); w.swimming = true; let air = 0;
	for (let i = 0; i < secs(4); i++) { step(w, inp(WEST), room); if (!w.grounded && !w.swimming) air++; if (w.x < SPOTS.poolEdge[0]) break; }
	A(w.y === 0 && w.grounded && !w.swimming && air <= 3, 'swimming west walks you out up the shallows, with no jump', [w.x, w.y, air]);
	const wt = tuneFor(['water']), f = at(SPOTS.pool, wt, -0.2 - K.SWIM_DEPTH); f.swimming = true; run(f, secs(0.25), inp(NORTH), wt);
	A(near(speed(f), K.RUN, 0.2), 'a Water type swims as fast as it runs', speed(f)); }
{ // falling into the pool from high up: no stagger, you are swimming
	const s = at(SPOTS.pool, K, 5); let hard = 0; run(s, secs(1.5), i => { return noInput(); }); for (let i = 0; i < 5; i++) { step(s, noInput(), room); hard += s.hard; }
	A(s.swimming && hard === 0 && s.stagger === 0, 'a long fall into deep water: no stagger, you are swimming', [s.swimming, s.stagger]); }

// ---------------------------------------------------------------- slopes: a slide feels them
{ // down the ramp (west): a slide gains speed, a run does not
	const start = [SPOTS.plateau[0] - 1.2, SPOTS.plateau[1]];
	const s = at(start); run(s, secs(0.35), inp(WEST)); const v0 = speed(s); step(s, inp({ ...WEST, crouch: true }), room); const v1 = speed(s);
	let top = v1; for (let i = 0; i < secs(1.2); i++) { step(s, inp({ crouch: true }), room); if (slopeAt(room, s.x, s.z) > 5) top = Math.max(top, speed(s)); }
	A(top > v1 + 1.5, 'a slide down the ramp gains speed all the way down', [v0, v1, top]);
	const r = at(start); let rt = 0; for (let i = 0; i < secs(1.5); i++) { step(r, inp(WEST), room); rt = Math.max(rt, speed(r)); }
	A(rt <= K.RUN + 0.05, '...a run down it does not', rt); }
{ // up the ramp (east): a slide bleeds speed faster than on the flat
	const up = at(SPOTS.rampFoot); up.vx = 9; up.sliding = true; up.crouchHeld = true; run(up, secs(0.4), inp({ crouch: true }));
	const flat = at(SPOTS.open); flat.vx = 9; flat.sliding = true; flat.crouchHeld = true; run(flat, secs(0.4), inp({ crouch: true }));
	A(speed(up) < speed(flat) - 1, 'a slide up the ramp loses speed faster than a slide on the flat', [speed(up), speed(flat)]); }
{ // the crest: a fast slide up the ramp launches off its top; a run stays on the floor (P0's test too)
	const s = at([7.25 * CELL, 11 * CELL]); s.vx = 14; s.sliding = true; s.crouchHeld = true; let launched = 0, top = 0;   // (three quarters up, fast)
	for (let i = 0; i < secs(1.5); i++) { step(s, inp({ crouch: true }), room); if (!s.grounded && s.vy > 0 && !launched) launched = s.vy; top = Math.max(top, s.y); if (launched && s.grounded) break; }
	A(launched >= K.LAUNCH_VY && top > 3.1, 'sliding fast up the ramp throws you off its crest into the air', [launched, top]);
	const r = at(SPOTS.rampFoot); let air = 0; for (let i = 0; i < secs(1.8); i++) { step(r, inp(EAST), room); if (!r.grounded) air++; }
	A(air === 0, '...a run up it stays on the floor'); }
{ // steps give no launch
	const s = at(SPOTS.stairsFoot); let air = 0, maxVy = 0; for (let i = 0; i < secs(2.2); i++) { step(s, inp(EAST), room); if (!s.grounded) air++; maxVy = Math.max(maxVy, s.vy); }
	A(air === 0 && maxVy === 0, 'steps are not slopes: running up the stairs never launches you'); }

// ---------------------------------------------------------------- landings
const drop = (spot, height, input, tune = K, before) => { const s = at(spot, tune, groundAt(room, spot[0], spot[1]) + height); if (before) before(s); let out = { hard: 0, broke: '', landed: 0 }; for (let i = 0; i < secs(2); i++) { step(s, typeof input === 'function' ? input(i, s) : input, room, T, tune); if (s.landed && !out.landed) { out = { hard: s.hard, broke: s.broke, landed: s.landed, sliding: s.sliding, stagger: s.stagger, sp: speed(s), vx: s.vx, vz: s.vz }; break; } } return { s, out }; };
{ const low = drop(SPOTS.open, 2.5, noInput()), high = drop(SPOTS.open, 4.5, noInput());
	A(low.out.landed > 0 && low.out.landed <= K.HARD_LAND && !low.out.hard && low.s.stagger === 0, 'a 2.5 m drop is an ordinary landing', low.out);
	A(high.out.hard > K.HARD_LAND && near(high.out.stagger, K.STAGGER, 1e-6) && stateName(high.s) === 'staggered', `a 4.5 m drop is a hard landing: you are staggered for ${K.STAGGER} s`, high.out);
	const s = high.s; step(s, inp({ ...EAST, jump: true }), room);
	A(s.grounded && !s.jumped, '...you cannot jump while staggered');
	run(s, secs(0.2), inp(EAST));
	A(speed(s) <= K.RUN * K.STAGGER_SPEED + 0.05, `...and you move at ${K.STAGGER_SPEED * 100} % of a run`, speed(s));
	run(s, secs(0.6), inp(EAST));
	A(s.stagger === 0 && speed(s) > K.RUN * 0.9, '...then it passes', [s.stagger, speed(s)]); }
{ const r = drop(SPOTS.open, 4.5, inp({ crouch: true }), K, s => { s.vx = -5; });
	A(r.out.broke === 'slide' && !r.out.hard && r.out.sliding && r.out.sp > 5 + K.HARD_LAND * K.BREAK_KEEP * 0.8 && r.s.stagger === 0, 'holding slide as you land breaks the fall: you come out sliding, faster than you went in', r.out);
	const st = drop(SPOTS.open, 4.5, inp({ crouch: true }));
	A(st.out.broke === 'slide' && st.out.sp >= K.SLIDE_MIN, '...even from a straight drop (you slide the way you face)', st.out); }
{ const spot = [6 * CELL, 11 * CELL];   // on the ramp
	const r = drop(spot, 4.5, noInput());
	A(r.out.broke === 'slope' && !r.out.hard && r.out.vx < -3 && r.s.stagger === 0, 'landing on a slope breaks the fall: it carries you downhill', r.out); }
{ const rt = tuneFor(['rock']), r = drop(SPOTS.open, 6, noInput(), rt);
	A(!r.out.hard && r.s.stagger === 0 && r.out.landed > K.HARD_LAND, 'a Rock type is never staggered by a fall', r.out); }

// ---------------------------------------------------------------- type traits
{ const base = tuneFor(['normal']);
	A(JSON.stringify(base) === JSON.stringify({ ...K, ICE: { ...K.ICE }, MUD: { ...K.MUD } }), 'a type with no trait moves by the book');
	A(Object.keys(TYPE_TRAITS).every(t => Object.keys(TYPE_TRAITS[t]).every(k => k in K)), 'every trait changes a number the controller really has');
	const ch = tuneFor(['fire', 'flying']);
	A(ch.AIR_JUMPS === 2 && ch.GLIDE && ch.SLIDE_BOOST === 3.6, 'a dual type gets both types\' traits (Fire / Flying: the slide kick, the glide and the extra air jump)', [ch.AIR_JUMPS, ch.GLIDE, ch.SLIDE_BOOST]);
	A(K.AIR_JUMPS === 1 && K.GLIDE === false && K.SLIDE_BOOST === 2.5, '...and K itself is untouched'); }
{ const ft = tuneFor(['flying']), s = at(SPOTS.open, ft); let jumps = 0;
	for (let i = 0; i < secs(3); i++) { step(s, inp({ jump: (i % 16) < 8 }), room, T, ft); if (s.jumped) jumps++; if (i > 40 && s.grounded) break; }
	A(jumps === 3, 'a Flying type has a third jump (two in the air)', jumps);
	const held = (s) => { s.jumpHeld = true; s.airJumps = 0; return s; };   // (jump already held, no air jump to spend: this is about the fall)
	const g = held(at(SPOTS.open, ft, 6)), n = held(at(SPOTS.open, K, 6)); let tg = 0, tn = 0, glid = false;
	while (!g.grounded && tg < 2000) { step(g, inp({ jump: true }), room, T, ft); tg++; if (g.gliding) glid = true; }
	while (!n.grounded && tn < 2000) { step(n, inp({ jump: true }), room); tn++; }
	A(glid && tg > tn * 2.5 && g.landed <= ft.GLIDE_FALL + 0.01, `...and glides: holding jump, a 6 m fall takes ${(tg * T).toFixed(1)} s, not ${(tn * T).toFixed(1)}, and lands softly`, [tg, tn, g.landed]);
	const d = at(SPOTS.open, ft, 6); let td = 0; while (!d.grounded && td < 2000) { step(d, noInput(), room, T, ft); td++; }
	A(td === tn, '...let go of jump and it falls like anything else', [td, tn]); }
{ const apex = tune => { const s = at(SPOTS.open, tune); let top = 0; for (let i = 0; i < secs(2); i++) { step(s, inp({ jump: true }), room, T, tune); top = Math.max(top, s.y); if (i > 5 && s.grounded) break; } return top; };
	const fight = apex(tuneFor(['fighting'])), norm = apex(K), rock = apex(tuneFor(['rock']));
	A(fight > norm + 0.25 && rock < norm - 0.1, 'a Fighting type jumps higher; a Rock type a little lower', [fight, norm, rock]);
	const el = tuneFor(['electric']), e = run(at(SPOTS.open, el), secs(1.5), inp(WEST), el);
	A(near(speed(e), 7.9, 0.05), 'an Electric type runs faster', speed(e));
	const gh = tuneFor(['ghost']); let tgh = 0, tn = 0; const a = at(SPOTS.open, gh, 5), b = at(SPOTS.open, K, 5);
	while (!a.grounded && tgh < 2000) { step(a, noInput(), room, T, gh); tgh++; } while (!b.grounded && tn < 2000) { step(b, noInput(), room); tn++; }
	A(tgh > tn && a.stagger === 0, 'a Ghost type floats down more slowly and is never staggered', [tgh, tn]);
	const ps = tuneFor(['psychic']), p = at(SPOTS.open, ps); step(p, inp({ jump: true }), room, T, ps); while (!p.grounded) step(p, inp({ ...WEST, jump: true }), room, T, ps);
	A(speed(p) > K.AIR_CAP + 0.5, 'a Psychic type steers more in the air', speed(p)); }

// ---------------------------------------------------------------- determinism and safety, traits on
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const script = (seed, n) => { const r = rng(seed), out = []; let cur = noInput(), hold = 0; for (let i = 0; i < n; i++) { if (hold-- <= 0) { const a = r() * 6.2832, m = r() < 0.15 ? 0 : 1; cur = { mx: Math.sin(a) * m, mz: Math.cos(a) * m, jump: r() < 0.45, crouch: r() < 0.3 }; hold = Math.floor(r() * 40); } out.push(cur); } return out; };
{ const tune = tuneFor(['water', 'flying']), ins = script(11, 6000), a = newState(room, tune), b = newState(room, tune);
	for (const i of ins) step(a, i, room, T, tune); for (const i of ins) step(b, i, room, T, tune);
	A(JSON.stringify(a) === JSON.stringify(b), 'the same inputs give the same run to the last bit, with traits on (6,000 ticks)'); }
{ let worst = 0, inWall = 0, out = 0, respawns = 0, n = 0; const seen = new Set();
	for (const [seed, types] of [[1, []], [2, ['flying']], [3, ['water', 'ice']], [4, ['rock', 'ground']]]) {
		const tune = tuneFor(types), s = newState(room, tune);
		for (const i of script(seed * 977, 10000)) {
			step(s, i, room, T, tune); n++; seen.add(stateName(s)); if (s.bounced) seen.add('bounced'); if (s.broke) seen.add('broke:' + s.broke); if (s.hard) seen.add('hard');
			const g = groundAt(room, s.x, s.z);
			if (g > 100) out++; else { worst = Math.max(worst, g - s.y); if (s.grounded && g - s.y > 1e-6) inWall++; }
			if (!Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz)) out++;
			respawns += 0; if (s.respawns) respawns = s.respawns;
		}
	}
	A(out === 0 && respawns === 0, `${n} random ticks across four type mixes: never outside the room, never out of the world, never a bad number`, [out, respawns]);
	A(worst <= 0.65 + 1e-6 && inWall === 0, '...never under the floor or inside a wall', [worst, inWall]);
	A(['swimming', 'sliding', 'running', 'idle', 'rising', 'falling'].every(k => seen.has(k)), '...and the random play really went everywhere: it ran, slid, jumped, fell and swam', [...seen].join(', ')); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
