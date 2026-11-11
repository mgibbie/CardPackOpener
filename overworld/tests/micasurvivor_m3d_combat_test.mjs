// micasurvivor_m3d_combat_test.mjs — MicaSurvivor 3D, P3 (Plans/MICASURVIVOR_3D_PLAN.md): enemies and combat where
// HEIGHT matters, in node (micasurvivor/m3d/combat.js, actors.js) with the game's own data. Flat ground is compared
// with the 2D game itself in micasurvivor_m3d_parity_test.mjs; this is what 3D adds.
//   * enemy stats are the 2D game's formulas (HP, damage and speed by tier and by the run's clock)
//   * bodies: a walker cannot climb a wall, walks round by the ramp, drops off a ledge to reach you, floats in a
//     pond; a flyer goes straight over; nobody ends up inside the terrain
//   * a touch needs you within reach in height: jump and a ground enemy under you cannot hurt you
//   * a swing does not reach the ledge above; a shot is aimed up at it and does; a shot into a wall stops there; a
//     beam is cut by the ground
//   * the auto-aim takes the nearest enemy it can SEE before a nearer one behind a wall
//   * knockback is a real shove: a Tackle knocks an enemy off a ledge, and it falls
//   * arrivals: enemies appear 16-32 m away on floor they can walk to you from, never past the cap
//   * the fight is deterministic (same seed: the same fight to the last digit), stays in the world through 3 minutes
//     of random play on generated levels, and a tick with 110 enemies is cheap
//   node overworld/tests/micasurvivor_m3d_combat_test.mjs
import { K, CELL, makeRoom, setCell, groundAt, waterAt } from '../../micasurvivor/m3d/sim.js';
import { generate, rng } from '../../micasurvivor/m3d/gen.js';
import { newActor, stepActor, flowField, steer, knock } from '../../micasurvivor/m3d/actors.js';
import { newWorld, addEnemy, tick, dataFrom, hashWorld, clearLine, U, CK } from '../../micasurvivor/m3d/combat.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const run = (w, n, input = null) => { for (let i = 0; i < n; i++) tick(w, typeof input === 'function' ? input(i) : input); return w; };
const RAT = 19, ZUBAT = 41;   // a walker and a flyer
A(!data.hovers(RAT) && data.hovers(ZUBAT) && !data.hovers(16), 'Rattata walks and Zubat flies (the sprites\' own data: who hovers is the 2D game\'s list, and Pidgey is not on it)');

/** A test yard, 30 × 30 cells, floor 0: a plateau 1.5 m up in the east (x 16..24, z 10..20) with a ramp on its south
 *  side, and a wall 4 m high running north-south at x = 8 (z 5..25). The player starts in the middle, west of the plateau. */
function yard() {
	const r = makeRoom(30, 30, 0);
	for (let z = 10; z <= 20; z++) for (let x = 16; x <= 24; x++) setCell(r, x, z, 1.5);
	for (let x = 19; x <= 21; x++) { setCell(r, x, 21, 0.75, { ax: 'z', rise: -0.75 }); setCell(r, x, 22, 0, { ax: 'z', rise: -0.75 }); }
	for (let x = 19; x <= 21; x++) { setCell(r, x, 21, 1.5, { ax: 'z', rise: -0.75 }); setCell(r, x, 22, 0.75, { ax: 'z', rise: -0.75 }); }
	for (let z = 5; z <= 25; z++) setCell(r, 8, z, 4);
	r.spawn = [12 * CELL + 1, 0, 15 * CELL + 1];
	return r;
}
const at = (cx, cz) => [(cx + 0.5) * CELL, (cz + 0.5) * CELL];

// ---------------------------------------------------------------- stats
{
	const w = newWorld(makeRoom(20, 20, 0), data, { dex: 25 });
	const e0 = addEnemy(w, RAT, 10, 10, { t: 0 }), e5 = addEnemy(w, RAT, 12, 10, { t: 300 });
	const d0 = G.Enemies.defFor(G.DEX_BY[RAT], G.Enemies.TIERS[0], 0), d5 = G.Enemies.defFor(G.DEX_BY[RAT], G.Enemies.TIERS[3], 3);
	A(e0.maxHp === Math.round(d0.hp * 3.3) && near(e0.dmg, d0.dmg * 2.4) && near(e0.a.speed, d0.spd * U), `a Rattata at the start of a run: ${e0.maxHp} HP, ${e0.dmg.toFixed(1)} a touch, ${(e0.a.speed).toFixed(2)} m/s (the 2D game's tier 0 × 3.3 HP, × 2.4 damage)`, [e0.maxHp, e0.dmg, d0]);
	A(e5.maxHp === Math.round(d5.hp * (1 + 300 / 95) * (3.3 + 300 / 210)) && near(e5.dmg, d5.dmg * (1 + 300 / 420) * 2.4) && near(e5.a.speed, d5.spd * (1 + 300 / 1400) * U), `...and five minutes in: ${e5.maxHp} HP, ${e5.dmg.toFixed(1)} a touch (tier 3, scaled by the clock)`, [e5.maxHp, e5.dmg]);
	A(near(e0.cr, G.Sprites.bodyRadius(RAT) * U) && near(w.pl.r, G.Sprites.bodyRadius(25) * U) && near(U, 1 / 16), 'bodies are the 2D game\'s sizes: 16 of its units to a metre', [e0.cr, w.pl.r]);
}

// ---------------------------------------------------------------- bodies on the height field
{
	const r = yard(), [px, pz] = at(20, 15);   // a target on the plateau
	const f = flowField(r, px, pz), wish = [0, 0];
	const go = (o, secs) => { const a = newActor(r, o); let n = 0, minY = 1e9, inside = 0; for (; n < secs * 60 && Math.hypot(a.x - px, a.z - pz) > 0.6; n++) { steer(r, f, a, wish); stepActor(a, r, wish[0], wish[1]); if (a.y < groundAt(r, a.x, a.z) - 1e-6) inside++; } return { a, t: n / 60, there: Math.hypot(a.x - px, a.z - pz) <= 0.6, inside }; };
	const [sx, sz] = at(13, 15);
	const walker = go({ x: sx, z: sz, speed: 4 }, 40), flyer = go({ x: sx, z: sz, speed: 4, fly: true, hover: 0.6 }, 40);
	const straight = Math.hypot(px - sx, pz - sz) / 4;
	A(walker.there && walker.t > straight * 1.8 && near(walker.a.y, 1.5), `a walker cannot climb the plateau's 1.5 m side: it goes round by the ramp (${walker.t.toFixed(1)} s; straight would be ${straight.toFixed(1)} s)`, [walker.t, walker.a]);
	A(flyer.there && flyer.t < straight * 1.25 && flyer.a.y > 1.9, `a flyer goes straight over (${flyer.t.toFixed(1)} s), hovering above the plateau`, [flyer.t, flyer.a.y]);
	A(walker.inside === 0 && flyer.inside === 0, 'neither is ever under the floor');
	// pushing straight at the side: stopped
	const push = newActor(r, { x: sx, z: sz, speed: 4 }); for (let i = 0; i < 240; i++) stepActor(push, r, 1, 0);
	A(push.x < 16 * CELL - 0.3 && push.y === 0, 'walking straight at the side, it is stopped at the wall', [push.x, push.y]);
	// down: from the plateau to a target on the low ground, it drops off the edge
	const f2 = flowField(r, sx, sz), top = newActor(r, { x: px, z: pz, speed: 4 }); let fell = 0, n = 0;
	for (; n < 600 && Math.hypot(top.x - sx, top.z - sz) > 0.6; n++) { steer(r, f2, top, wish); stepActor(top, r, wish[0], wish[1]); if (top.fell) fell = top.fell; }
	A(near(fell, 1.5, 0.01) && top.y === 0 && n / 60 < straight * 1.6, `going down it does not look for the ramp: it drops off the edge (a ${fell.toFixed(1)} m fall) and keeps coming`, [fell, n / 60, top]);
	// the wall: 4 m, no way over for a walker; the flow field sends it round the end
	const [wx, wz] = at(5, 15), fw = flowField(r, wx, wz), round = newActor(r, { x: sx, z: sz, speed: 4 }); let m = 0, maxZ = 0;
	for (; m < 60 * 60 && Math.hypot(round.x - wx, round.z - wz) > 0.6; m++) { steer(r, fw, round, wish); stepActor(round, r, wish[0], wish[1]); maxZ = Math.max(maxZ, Math.abs(round.z - 15.5 * CELL)); }
	A(Math.hypot(round.x - wx, round.z - wz) <= 0.6 && maxZ > 10 * CELL, 'a 4 m wall between you: the walker goes round its end', [m / 60, maxZ]);
	// water: a walker floats across a pond
	const pond = makeRoom(16, 8, 0); for (let x = 5; x <= 10; x++) for (let z = 1; z <= 6; z++) { setCell(pond, x, z, x === 5 || x === 10 ? -0.34 : x === 6 || x === 9 ? -0.68 : -2.2); pond.water.set(z * 16 + x, -0.1); }
	const sw = newActor(pond, { x: 3, z: 8, speed: 4 }); let swam = 0, low = 0;
	for (let i = 0; i < 60 * 20 && sw.x < 26; i++) { stepActor(sw, pond, 1, 0); if (sw.swimming) { swam++; low = Math.min(low, sw.y); } }
	A(sw.x >= 26 && swam > 60 && near(low, -0.1 - K.SWIM_DEPTH) && sw.y === 0, `a walker swims a pond (floating at ${low.toFixed(2)} m, slower) and walks out the far side`, [sw.x, swam, low, sw.y]);
}

// ---------------------------------------------------------------- a touch needs you in reach
{
	const flat = makeRoom(30, 30, 0); flat.spawn = [30, 0, 30];
	const stand = newWorld(flat, data, { dex: 25, seed: 1 }); addEnemy(stand, RAT, 31, 30);
	run(stand, 120);
	A(stand.stats.touched >= 3 && near(stand.stats.taken, stand.stats.touched * stand.enemies[0].dmg * data.typeMult('normal', ['electric'])), `standing in a Rattata: it touches you every ${CK.TOUCH_CD} s (${stand.stats.touched} times in 2 s)`, stand.stats);
	// bouncing: hold jump, two air jumps' worth of height — count the touches while you are more than a metre up
	const hop = newWorld(flat, data, { dex: 25, seed: 1 }); addEnemy(hop, RAT, 31, 30);
	let high = 0, touchedHigh = 0, last = 0;
	for (let i = 0; i < 600; i++) { tick(hop, { mx: 0, mz: 0, jump: i % 20 < 10, crouch: false }); const up = hop.pl.s.y > CK.TOUCH_UP + 0.05; if (up) high++; if (hop.stats.touched > last) { if (up) touchedHigh++; last = hop.stats.touched; } }
	A(high > 100 && touchedHigh === 0 && hop.stats.touched < stand.stats.touched * 5, `jumping: in the ${high} ticks you are more than 1 m up, it cannot touch you (${hop.stats.touched} touches in 10 s, all near the ground)`, [high, touchedHigh, hop.stats]);
	// a flyer reaches a little higher, and a walker on the ledge above cannot touch you below
	const r = yard(), led = newWorld(r, data, { dex: 25, seed: 1 }); led.pl.s.x = 16 * CELL - 0.6; led.pl.s.z = 15 * CELL;
	const e = addEnemy(led, RAT, 16 * CELL + 0.5, 15 * CELL, { dummy: true }); e.dummy = false; e.a.speed = 0;
	run(led, 180);
	A(led.stats.touched === 0 && Math.hypot(e.a.x - led.pl.s.x, e.a.z - led.pl.s.z) < e.cr + led.pl.r, 'an enemy on the ledge 1.5 m above you, close enough to touch on a map: it cannot', [led.stats, e.a]);
}

// ---------------------------------------------------------------- swings, shots, beams and the terrain
{
	const r = yard();
	const mk = (moves, ex, ez, o = {}) => { const w = newWorld(r, data, { dex: 25, moves, seed: 5 }); if (o.px !== undefined) { w.pl.s.x = o.px; w.pl.s.z = o.pz; } const e = addEnemy(w, o.dex || RAT, ex, ez, { dummy: true, hp: 1000 }); return { w, e }; };
	// you below the plateau's west side, the target up on its edge: 1.5 m above, 1.6 m away
	const below = { px: 16 * CELL - 1, pz: 15 * CELL };
	const sw = mk(['tackle'], 16 * CELL + 0.6, 15 * CELL, below); sw.e.a.y = 1.5; run(sw.w, 180);
	const flatSw = newWorld(makeRoom(30, 30, 0), data, { dex: 25, moves: ['tackle'], seed: 5 }); flatSw.pl.s.x = 20; flatSw.pl.s.z = 20; flatSw.pl.s.y = 0; addEnemy(flatSw, RAT, 21.6, 20, { dummy: true, hp: 1000 }); run(flatSw, 30);
	A(flatSw.stats.hits >= 1 && sw.w.stats.hits === 0 && sw.w.stats.removed === 0, 'Tackle reaches a target 1.6 m away on your level, and not the same target on the ledge 1.5 m above', [flatSw.stats.hits, sw.w.stats]);
	const sh = mk(['ember'], 16 * CELL + 2.5, 15 * CELL, { px: 16 * CELL - 5, pz: 15 * CELL }); run(sh.w, 180);
	A(sh.w.stats.hits >= 4 && sh.w.stats.blocked === 0, `Ember is aimed up at a target on the plateau and hits it (${sh.w.stats.hits} hits in 3 s, none into the cliff)`, sh.w.stats);
	const lvl = mk(['ember'], 16 * CELL + 2.5, 15 * CELL, { px: 16 * CELL - 5, pz: 15 * CELL }); let first = null; for (let i = 0; i < 10 && !first; i++) { tick(lvl.w, null); first = lvl.w.shots[0] ? { ...lvl.w.shots[0] } : null; }
	A(first && first.vy > 0.5 && first.vx > 5, 'the shot leaves climbing (its velocity has an upward part)', first);
	// behind the wall: you at x 13, the target at x 5, the 4 m wall at x 8
	const [bx, bz] = at(5, 15);
	const wl = mk(['ember'], bx, bz); run(wl.w, 240);
	A(wl.w.stats.fired >= 6 && wl.w.stats.hits === 0 && wl.w.stats.blocked === wl.w.stats.fired - wl.w.shots.length, `a target behind a 4 m wall: every Ember stops at the wall (${wl.w.stats.blocked} of ${wl.w.stats.fired})`, wl.w.stats);
	const bm = mk(['hydro-pump'], bx, bz); let cut = null; for (let i = 0; i < 240; i++) { tick(bm.w, null); const ev = bm.w.events.find((q) => q.k === 'beam'); if (ev) cut = ev; }
	const full = G.Moves.BY_ID['hydro-pump'].radius * U;
	A(cut && cut.len < full - 2 && near(bm.w.pl.s.x - cut.len, 9 * CELL, 0.6) && bm.w.stats.hits === 0, `Hydro Pump is cut where it meets the wall (${cut && cut.len.toFixed(1)} m of ${full.toFixed(1)} m) and does not hit behind it`, [cut, bm.w.stats]);
	const open = mk(['hydro-pump'], 13 * CELL + 1, 20 * CELL); run(open.w, 240);
	A(open.w.stats.hits >= 2, 'with nothing in the way the same beam hits', open.w.stats);
	A(clearLine(r, 25, 0.8, 31, 40, 0.8, 31) === false && clearLine(r, 25, 0.8, 31, 25, 0.8, 45) === true && clearLine(r, 25, 0.8, 31, 5, 0.8, 31) === false && clearLine(r, 25, 4.5, 31, 5, 4.5, 31) === true, 'a clear line: blocked by the plateau and the wall, free along the open floor and over the wall\'s top');
}

// ---------------------------------------------------------------- the auto-aim sees
{
	const r = yard(), w = newWorld(r, data, { dex: 25, moves: ['ember'], seed: 5 });
	w.pl.s.x = 10 * CELL; w.pl.s.z = 15 * CELL;                                   // 1 m east of the wall's cell edge
	const hidden = addEnemy(w, RAT, 7 * CELL, 15 * CELL, { dummy: true, hp: 1000 });   // 6 m away, behind the wall
	const seen = addEnemy(w, RAT, 10 * CELL, 21 * CELL, { dummy: true, hp: 1000 });     // 12 m away, in the open
	run(w, 200);
	A(w.pl.target === seen && seen.hp < seen.maxHp && hidden.hp === hidden.maxHp && w.stats.blocked === 0, 'two targets, the nearer one behind the wall: you aim at the one you can see, and no shot is wasted on the wall', [w.stats, hidden.hp, seen.hp]);
	seen.dead = true; run(w, 2);
	A(w.pl.target === hidden, '...and with no one in sight, at the nearest anyway (it may come round)');
}

// ---------------------------------------------------------------- knocked off a ledge
{
	const r = yard(), w = newWorld(r, data, { dex: 25, moves: [['tackle', 1]], seed: 5 });
	// both on the plateau: you 2.6 m from its west edge, a Rattata between you and the edge
	w.pl.s.x = 16 * CELL + 2.6; w.pl.s.z = 15 * CELL; w.pl.s.y = 1.5;
	const e = addEnemy(w, RAT, 16 * CELL + 0.9, 15 * CELL, { dummy: true, hp: 1000 });
	let fell = 0; for (let i = 0; i < 90; i++) { tick(w, null); const ev = w.events.find((q) => q.k === 'fell'); if (ev) fell = ev.h; }
	A(w.stats.hits >= 1 && near(fell, 1.5, 0.01) && e.a.y === 0 && e.a.x < 16 * CELL, `Tackle's shove sends a Rattata over the plateau's edge: it falls ${fell.toFixed(1)} m to the floor below`, [w.stats, e.a, fell]);
	const a = newActor(r, { x: 20 * CELL, z: 15 * CELL }); knock(a, 0, 0, 8); let top = a.y; for (let i = 0; i < 60; i++) { stepActor(a, r, 0, 0); top = Math.max(top, a.y); }
	A(top > 2.2 && near(a.y, 1.5) && a.grounded, 'a shove upward throws a body into the air and it comes back down', [top, a.y]);
}

// ---------------------------------------------------------------- arrivals
{
	const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, seed: 11, cast: [RAT, ZUBAT, 10, 41] });
	w.pl.invuln = 1e9;
	const bad = []; let seen = 0, walkers = 0;
	const known = new Set();
	for (let i = 0; i < 60 * 90; i++) {
		tick(w, null);
		for (const e of w.enemies) { if (known.has(e.id)) continue; known.add(e.id); seen++;
			const d = Math.hypot(e.a.x - w.pl.s.x, e.a.z - w.pl.s.z), ci = Math.floor(e.a.z / CELL) * room.w + Math.floor(e.a.x / CELL);
			if (d < CK.SPAWN_MIN - 0.5 || d > CK.SPAWN_MAX + 0.5) bad.push(['distance', d]);
			if (room.cells[ci] >= room.rimH) bad.push(['in the rim']);
			if (!e.fly) { walkers++; if (w.field.dist[ci] < 0) bad.push(['cannot walk to you']); if (room.water.has(ci)) bad.push(['in water']); } }
	}
	const want = (() => { let a = 0; for (let t = 0; t < 90; t += 1 / 60) a += (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * 0.24 / 60; return a; })();
	A(bad.length === 0 && seen > 30 && walkers > 10 && seen > walkers, `90 s on a generated level: ${seen} enemies arrive, each 16-32 m from you, on floor it can walk to you from (flyers anywhere inside the rim)`, bad.slice(0, 4));
	A(Math.abs(seen - want) <= 3, `at the 2D game's rate (${seen} arrived; the formula gives ${want.toFixed(1)})`, [seen, want]);
	const capped = newWorld(room, data, { dex: 25, seed: 11, cast: [RAT], cap: 12 }); capped.pl.invuln = 1e9; let peak = 0;
	for (let i = 0; i < 60 * 120; i++) { tick(capped, null); peak = Math.max(peak, capped.enemies.length); }
	A(peak === 12, 'never more than the cap at once (a cap of 12 here)', peak);
	const none = newWorld(room, data, { dex: 25, seed: 11 }); run(none, 600);
	A(none.enemies.length === 0, 'with no cast nothing arrives');
}

// ---------------------------------------------------------------- a whole fight: deterministic, safe, cheap
{
	const fight = (seed, levelSeed = 7, biome = 'meadow', secs = 60) => {
		const room = generate(levelSeed, biome), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed, cast: [RAT, ZUBAT, 10, 41, 74] });
		const r = rng(seed * 31 + 5); let inp = { mx: 0, mz: 0, jump: false, crouch: false }, bad = '';
		for (let i = 0; i < secs * 60; i++) {
			if (i % 20 === 0) inp = { mx: r() * 2 - 1, mz: r() * 2 - 1, jump: r() < 0.3, crouch: r() < 0.15 };
			tick(w, inp);
			if (i % 30 === 0) for (const e of w.enemies) { const g = groundAt(room, e.a.x, e.a.z), wl = waterAt(room, e.a.x, e.a.z);
				if (!Number.isFinite(e.a.x + e.a.y + e.a.z + e.hp)) bad = 'not a number'; else if (e.a.x < 0 || e.a.z < 0 || e.a.x > room.w * CELL || e.a.z > room.h * CELL) bad = 'outside';
				else if (e.a.y < Math.min(g, wl > g ? wl - K.SWIM_DEPTH : g) - 1e-6) bad = 'under the floor'; else if (g >= room.rimH) bad = 'in the rim'; }
			if (!Number.isFinite(w.pl.hp + w.stats.dealt)) bad = 'stats not a number';
		}
		return { w, bad };
	};
	const a = fight(3), b = fight(3), c = fight(4);
	A(hashWorld(a.w) === hashWorld(b.w) && JSON.stringify(a.w.stats) === JSON.stringify(b.w.stats), `the same seed is the same fight to the last digit (60 s, ${a.w.stats.spawned} enemies, ${a.w.stats.hits} hits, ${a.w.stats.kills} kills)`, [hashWorld(a.w), hashWorld(b.w)]);
	A(hashWorld(a.w) !== hashWorld(c.w), 'another seed is another fight');
	A(a.w.stats.kills > 5 && a.w.stats.hits > 40 && a.w.stats.fell > 0, 'it is a real fight: kills, hits, and enemies dropping off ledges after you', a.w.stats);
	const meek = newWorld(generate(7, 'meadow'), data, { dex: 25, moves: [], seed: 3, cast: [RAT, ZUBAT] }); run(meek, 60 * 60);
	A(meek.stats.touched >= 3 && meek.pl.hp < meek.pl.maxHp, `stand still with no moves and they reach you and hurt you (${meek.stats.touched} touches in a minute${meek.pl.dead ? ', and you are down' : ''})`, meek.stats);
	const safe = [[5, 2, 'peaks'], [6, 9, 'marsh'], [7, 23, 'meadow']].map(([s, l, bi]) => { const f = fight(s, l, bi, 60); return f.bad ? `${bi} ${l}: ${f.bad}` : ''; }).filter(Boolean);
	A(!a.bad && safe.length === 0, 'three more minutes of random play on a peaks, a marsh and a meadow level: every enemy stays in the world, on or above the floor, out of the rim', [a.bad, ...safe]);
	// the cost of a tick with the cap's worth of enemies
	const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed: 2 }); w.pl.invuln = 1e9;
	const r = rng(99); let placed = 0;
	while (placed < CK.CAP) { const t = room.tiles[Math.floor(r() * room.tiles.length)]; const e = addEnemy(w, placed % 3 ? RAT : ZUBAT, t.centre[0] + r() * 6 - 3, t.centre[2] + r() * 6 - 3, { hp: 50 }); placed++; }
	run(w, 30);
	const t0 = performance.now(); run(w, 600, (i) => ({ mx: Math.sin(i / 50), mz: Math.cos(i / 70), jump: false, crouch: false })); const ms = (performance.now() - t0) / 600;
	A(ms < 2, `a tick with ${CK.CAP} enemies costs ${ms.toFixed(2)} ms here (a frame is 16.7 ms)`, ms);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
