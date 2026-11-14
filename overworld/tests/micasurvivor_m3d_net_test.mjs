// micasurvivor_m3d_net_test.mjs — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): what a fight looks like
// to someone who is not running it (micasurvivor/m3d/net.js), in node.
//   * a frame holds the fight in whole numbers and comes back to within a centimetre; height and "in the air" are in it
//   * a frame sent as its difference from the last one rebuilds exactly, and is much smaller
//   * WATCHING: a Viewer fed ten frames a second shows a jump and a fall off a ledge within 15 cm of where you really
//     were at every tick between frames (the worst is the tenth of a second you take off or land in), and an enemy
//     shoved off a ledge within 25 cm. At ONE frame a second a jump is simply missing, which is why a relay message
//     carries you ten times a second
//   * a tape (v3) of a whole fight packs, unpacks and plays back the same fight; a 2D tape is refused by its version
//   * SIZES, measured: a frame with the cap's 110 enemies, a second of live frames, a relay message (ten frames of
//     you, two of the enemies) against the relay's 16,000-character cap, and a ten-minute tape gzipped against the
//     server's 1.2 MB cap for one tape segment
//   node overworld/tests/micasurvivor_m3d_net_test.mjs
import zlib from 'zlib';
import { K, CELL, makeRoom, setCell, groundAt } from '../../micasurvivor/m3d/sim.js';
import { generate } from '../../micasurvivor/m3d/gen.js';
import { newWorld, addEnemy, tick, dataFrom, CK } from '../../micasurvivor/m3d/combat.js';
import { knock } from '../../micasurvivor/m3d/actors.js';
import { frame, keepEvents, diff, patch, sameFrame, Viewer, Tape, bundle, unbundle, arc, hermite, NK, stBits, stOf } from '../../micasurvivor/m3d/net.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), RAT = 19, EVERY = Math.round(60 / NK.HZ);
const yard = () => { const r = makeRoom(30, 30, 0); for (let z = 10; z <= 20; z++) for (let x = 16; x <= 24; x++) setCell(r, x, z, 1.5); r.spawn = [12 * CELL + 1, 0, 15 * CELL + 1]; return r; };

// ---------------------------------------------------------------- a frame
{
	const room = generate(7, 'meadow'), w = newWorld(room, data, { tune: { ...K, WALLRUN: false } /* (a scripted walk: the fight this check was written on, without the wall tech) */, dex: 25, moves: ['ember', 'fire-spin'], seed: 3, cast: [RAT, 41, 74], autoPick: 0, weather: false });
	for (let i = 0; i < 60 * 40; i++) tick(w, { mx: Math.sin(i / 90), mz: Math.cos(i / 130), jump: i % 200 < 8, crouch: false });
	const f = frame(w), s = w.pl.s, text = JSON.stringify(f);
	A(f.e.length === w.enemies.length && f.e.length > 5 && /^[\[\]{}",:\-0-9a-zA-Z]*$/.test(text) && !/\d\.\d/.test(text), `a frame of a fight 40 s in: you, ${f.e.length} enemies, ${f.b.length} balls, all whole numbers (${text.length} characters)`, text.slice(0, 200));
	A(Math.abs(f.p[0] / 100 - s.x) <= 0.005 && Math.abs(f.p[1] / 100 - s.y) <= 0.005 && Math.abs(f.p[2] / 100 - s.z) <= 0.005 && f.p[8] === Math.ceil(w.pl.hp) && f.p[10] === w.pl.level, 'you are in it to the centimetre, with your HP and level');
	const e0 = w.enemies[0], r0 = f.e.find((r) => r[0] === e0.id);
	A(r0 && r0[1] === e0.dex && Math.abs(r0[2] / 100 - e0.a.x) <= 0.005 && Math.abs(r0[3] / 100 - e0.a.y) <= 0.005 && r0[6] === Math.round(e0.hp / e0.maxHp * 1000), 'an enemy is in it by id: species, place (with its height), HP in thousandths');
	// the difference from the frame before
	const before = frame(w); for (let i = 0; i < EVERY; i++) tick(w, { mx: 1, mz: 0, jump: false, crouch: false });
	const after = frame(w), d = diff(before, after), back = patch(before, d);
	A(sameFrame(back, after) && back.e.length === after.e.length, 'a frame sent as its difference from the last one rebuilds exactly');
	A(JSON.stringify(d).length < JSON.stringify(after).length * 0.85, `...and is smaller (${JSON.stringify(d).length} characters against ${JSON.stringify(after).length})`, [JSON.stringify(d).length, JSON.stringify(after).length]);
	const gone = frame(w); gone.e = gone.e.slice(1); gone.b = gone.b.slice(0, 1); gone.t += 6; const d2 = diff(after, gone);
	A(sameFrame(patch(after, d2), gone) && d2.eg && d2.eg[0] === after.e[0][0], 'an enemy that is gone is named as gone, and the frame still rebuilds');
	const kept = keepEvents([], [{ k: 'hit', x: 1.23456, y: 2, z: 3, d: 17.6, crit: true, eff: 1.6 }, { k: 'fell', id: 3, h: 2 }, { k: 'beam', id: 'hydro-pump', from: [1, 2, 3], dir: [1, 0, 0], len: 5.5551, w: 1 }]);
	A(kept.length === 2 && kept[0].d === 18 && kept[0].x === 1.23 && kept[1].len === 5.56, 'a frame carries the fight\'s events a watcher draws (a hit, a beam), rounded; the rest are left out', kept);
}

// ---------------------------------------------------------------- watching: jumps and falls between frames
{
	/** Play `ticks` of a fight, a frame every `every` ticks into a Viewer; then compare the Viewer with the truth at every tick. */
	const watch = (setup, input, ticks, every, read) => {
		const w = newWorld(yard(), data, { dex: 25, moves: [], seed: 3, weather: false }); w.pl.invuln = 1e9; const ctx = setup(w) || {};
		const v = new Viewer(), truth = []; let prev = null;
		for (let i = 0; i <= ticks; i++) { if (i) tick(w, input(i, w, ctx)); truth.push(read(w, ctx)); if (i % every === 0) { const f = frame(w); v.push(prev ? diff(prev, f) : f); prev = f; } }
		let worst = 0, top = 0, topSeen = 0, floorSlide = 0;
		for (let i = 0; i <= ticks - every; i++) { const view = v.sample(i * K.TICK), got = read({ pl: view.pl, enemies: view.enemies }, ctx, true), tr = truth[i]; if (!got) continue; worst = Math.max(worst, Math.hypot(got[0] - tr[0], got[1] - tr[1], got[2] - tr[2])); top = Math.max(top, tr[1]); topSeen = Math.max(topSeen, got[1]); }
		return { worst, top, topSeen, frames: v.frames.length };
	};
	const me = (w) => [w.pl.s.x, w.pl.s.y, w.pl.s.z];
	const jump = watch(() => { }, (i) => ({ mx: 1, mz: 0, jump: i > 20 && i < 45, crouch: false }), 150, EVERY, me);
	A(jump.top > 1.5 && jump.worst < 0.15, `a running jump (${jump.top.toFixed(2)} m high), watched at ${NK.HZ} frames a second: at every tick between frames you are drawn within ${(jump.worst * 100).toFixed(1)} cm of where you were`, jump);
	const slow = watch(() => { }, (i) => ({ mx: 1, mz: 0, jump: i > 20 && i < 45, crouch: false }), 180, 60, me);
	A(slow.topSeen < 0.2 && slow.top > 1.5, `at ONE frame a second the same jump is simply missing: it happens between two frames that both have you on the floor (seen ${slow.topSeen.toFixed(2)} m up, really ${slow.top.toFixed(2)} m). This is why a relay message, one a second, carries you ten times`, slow);
	const off = watch((w) => { w.pl.s.x = 16 * CELL + 3; w.pl.s.z = 15 * CELL; w.pl.s.y = 1.5; }, () => ({ mx: -1, mz: 0, jump: false, crouch: false }), 120, EVERY, me);
	A(off.top === 1.5 && off.worst < 0.15, `running off the plateau and falling 1.5 m: within ${(off.worst * 100).toFixed(1)} cm at every tick`, off);
	const foe = watch((w) => { const e = addEnemy(w, RAT, 16 * CELL + 1, 15 * CELL, { dummy: true, hp: 1e5 }); w.pl.s.x = 16 * CELL + 6; w.pl.s.y = 1.5; return { id: e.id, e }; }, (i, w, c) => { if (i === 10) knock(c.e.a, -9, 0); return null; }, 120, EVERY,
		(w, c, seen) => { const e = w.enemies.find((q) => q.id === c.id); return e ? [e.a.x, e.a.y, e.a.z] : null; });
	A(foe.worst < 0.25, `an enemy shoved off the plateau: it is seen sliding, going over the edge and falling within ${(foe.worst * 100).toFixed(1)} cm of the truth`, foe);
	A(Math.abs(hermite(0, 10, 0, -10, 0.5, 1) - 2.5) < 1e-9 && Math.abs(arc(0, 0, 0.5, 1, 30, true) - 3.75) < 1e-9 && arc(0, 2, 0.5, 1, 30, false) === 1, 'the arc between two frames: under gravity in the air (30 m/s², 1 s apart, level: 3.75 m up at the middle), a straight line on the ground');
}

// ---------------------------------------------------------------- a tape, and sizes
{
	const fight = (secs, o = {}) => {
		const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, moves: ['ember', 'tackle', 'bug-buzz', 'fire-spin'], seed: 9, cast: [RAT, 41, 74, 43, 58, 133], autoPick: 0, weather: false, bosses: [143] });
		w.pl.invuln = 1e9; if (o.full) w.spawnAcc = 0;
		const tape = new Tape({ seed: 7, biome: 'meadow', dex: 25, moves: w.pl.moves.map((m) => m.id) }), live = [], every = Math.round(60 / NK.TAPE_HZ); let ev = [], evLive = [], peak = 0;
		for (let i = 0; i < secs * 60; i++) {
			tick(w, { mx: Math.sin(i / 90), mz: Math.cos(i / 130), jump: i % 200 < 8, crouch: false });
			keepEvents(ev, w.events); keepEvents(evLive, w.events); peak = Math.max(peak, w.enemies.length);
			if (i % every === 0) { tape.add(frame(w, ev)); ev = []; }
			if (i % EVERY === 0) { live.push(frame(w, evLive)); evLive = []; }
		}
		return { w, tape, live, peak };
	};
	const run = fight(120), text = run.tape.pack(), again = Tape.unpack(text), a = run.tape.play(), b = again.play();
	A(text.length > 1000 && a.viewer.frames.length === b.viewer.frames.length && a.viewer.frames.every((fr, i) => sameFrame(fr, b.viewer.frames[i])) && b.to > 119 && b.viewer.frames.length === 120 * NK.TAPE_HZ, `a two-minute fight on tape (v3): packed, unpacked, and the same ${b.viewer.frames.length} frames come back`, [text.length, b.to]);
	const mid = b.viewer.sample(60), end = b.viewer.sample(119.5);
	A(mid && mid.enemies.length > 0 && end.kills >= mid.kills && end.pl.level >= mid.pl.level && Number.isFinite(mid.pl.s.x + mid.pl.s.y), `played back: at 1:00 there are ${mid.enemies.length} enemies on screen and ${mid.kills} KOs; by the end, ${end.kills}`);
	let threw = ''; try { Tape.unpack(JSON.stringify({ v: 2, h: {}, f: [] })); } catch (e) { threw = e.message; }
	A(/not a 3D tape/.test(threw), 'a tape of another version (the 2D game\'s v2) is refused, by name', threw);
	A(run.tape.h.seed === 7 && run.tape.h.biome === 'meadow', 'the tape\'s header is what rebuilds the level: its seed and biome');

	// ---- sizes
	const gz = (s) => zlib.gzipSync(Buffer.from(s)).length;
	const room = generate(7, 'meadow'), w = newWorld(room, data, { dex: 25, moves: ['ember', 'fire-spin', 'heat-wave'], seed: 2, weather: false }); w.pl.invuln = 1e9;
	let placed = 0; while (placed < CK.CAP) { const t = room.tiles[placed % room.tiles.length]; addEnemy(w, placed % 3 ? RAT : 41, t.centre[0] + (placed % 7) - 3, t.centre[2] + (placed % 5) - 2, { hp: 50 }); placed++; }
	const frames = []; for (let i = 0; i < 60; i++) { tick(w, { mx: 1, mz: 0, jump: false, crouch: false }); if (i % EVERY === 0) frames.push(frame(w, keepEvents([], w.events))); }
	const whole = JSON.stringify(frames[frames.length - 1]).length, second = frames.reduce((s, f, i) => s + JSON.stringify(i ? diff(frames[i - 1], f) : f).length, 0), msg = bundle(frames);
	A(w.enemies.length >= 100 && whole < NK.RELAY_CAP * 0.5, `a whole frame with ${w.enemies.length} enemies and ${frames[frames.length - 1].b.length} balls: ${whole} characters`, whole);
	console.log(`     a second live (${NK.HZ} frames, the first whole, the rest differences): ${second} characters, ${(second / 1024).toFixed(1)} KB/s for peer-to-peer`);
	A(msg.length < NK.RELAY_CAP, `one relay message for that second (you in all ${frames.length} frames, the enemies in ${Math.ceil(frames.length / NK.RELAY_ENEMY_EVERY)}): ${msg.length} characters, under the relay's ${NK.RELAY_CAP}`, msg.length);
	const v = new Viewer(); for (const f of unbundle(msg)) v.push(f);
	const tm = (frames[7].t + frames[8].t) / 2 * K.TICK, sv = v.sample(tm), whole8 = frames.filter((fr, i) => i % NK.RELAY_ENEMY_EVERY === NK.RELAY_ENEMY_EVERY - 1 || i === frames.length - 1);
	A(v.frames.length === frames.length && v.frames.filter((fr) => fr.e).length === whole8.length && sv.enemies.length === whole8[whole8.length - 1].e.length && Math.abs(sv.pl.s.x - (frames[7].p[0] + frames[8].p[0]) / 200) < 0.05, `a watcher fed that one message has you at every tenth of a second and all ${sv.enemies.length} enemies drawn in between their ${whole8.length} frames`, [v.frames.length, sv.enemies.length]);
	// …and the jump a 1-a-second frame loses is there: the same second as a relay message
	{ const jw = newWorld(yard(), data, { dex: 25, moves: [], seed: 3, weather: false }), fr = []; let top = 0; for (let i = 0; i <= 60; i++) { if (i) tick(jw, { mx: 1, mz: 0, jump: i > 5 && i < 30, crouch: false }); top = Math.max(top, jw.pl.s.y); if (i % EVERY === 0) fr.push(frame(jw)); }
		const jv = new Viewer(); for (const q of unbundle(bundle(fr))) jv.push(q); let seen = 0; for (let i = 0; i <= 60; i++) seen = Math.max(seen, jv.sample(i * K.TICK).pl.s.y);
		A(top > 1.5 && seen > top - 0.1, `a jump inside one relay message is seen whole (${seen.toFixed(2)} m of ${top.toFixed(2)} m)`, [top, seen]); }
	const ten = fight(600), packed = ten.tape.pack(), zipped = gz(packed);
	console.log(`     a ten-minute fight on tape (${NK.TAPE_HZ} frames a second, up to ${ten.peak} enemies at once): ${(packed.length / 1e6).toFixed(2)} MB as text, ${(zipped / 1e6).toFixed(2)} MB gzipped`);
	A(zipped < 1200000 * 4, `ten minutes gzipped is ${(zipped / 1e6).toFixed(2)} MB: ${Math.ceil(zipped / 1200000)} segment(s) of the server's 1.2 MB`, zipped);
	const one = fight(60).tape.pack();
	console.log(`     (the first minute alone: ${(gz(one) / 1e3).toFixed(0)} KB gzipped)`);
}

// ---------------------------------------------------------------- what a watcher and a co-op guest need to draw the effects
{
	const w = newWorld(yard(), data, { dex: 25, moves: [], seed: 3, weather: false }), s = w.pl.s;
	const a = addEnemy(w, RAT, s.x + 3, s.z, { dummy: true }), b = addEnemy(w, RAT, s.x - 3, s.z, { dummy: true }), c = addEnemy(w, RAT, s.x, s.z + 3, { dummy: true });
	a.burn = 2; a.poison = 1; a.slow = 0.3; b.frozenT = 1; b.paraT = 1; c.sleepT = 2; c.confT = 1;
	const v = new Viewer(), f = frame(w); v.push(f); v.push(frame(w));
	const view = v.sample(0), st = (e) => stOf(view.enemies.find((q) => q.id === e.id).st << 7);
	A(JSON.stringify(st(a)) === JSON.stringify({ burn: true, poison: true, frozen: false, para: false, sleep: false, conf: false, slow: true }) && st(b).frozen && st(b).para && !st(b).burn && st(c).sleep && st(c).conf,
		'an enemy\'s states ride in its flags: a watcher knows it is burned, poisoned, slowed, frozen, paralysed, asleep, confused', [st(a), st(b), st(c)]);
	const r = f.e.find((q) => q[0] === b.id);
	A((r[7] & 32) && r.length === 9, '…above the old flags (32 still says stunned), in the same nine columns: an old tape reads as before', r);
	const kept = keepEvents([], [{ k: 'aura', id: 'discharge', r: 3.2, x: 1.234, y: 0, z: 5.678 }, { k: 'melee', id: 'tackle', aim: 1, r: 2, arc: 1, x: 2, y: 0, z: 3 }, { k: 'chain', id: 'thunderbolt', links: [[1, 2, 3]], from: [4.004, 5, 6] }]);
	A(kept[0].x === 1.23 && kept[0].z === 5.68 && kept[1].x === 2 && kept[2].from.join() === '4,5,6', 'a swing, an aura and a chain say where they were cast: a guest draws the host\'s round the host, not round itself', kept);
	A(stBits({ burn: 1 }) === 128 && stBits({}) === 0, 'stBits: nothing suffered, nothing set');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
