// micasurvivor_m3d_expnet_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run as a
// watcher and a replay see it (micasurvivor/m3d/expnet.js), in node. The playing side makes the run's ROW; a second
// side, which has only the 2D game's tables and what came over the line as text, reads it back.
//   * the row holds the run: zone, phase, charge, money, the boss, the zone's things, the fainted, the ball, your
//     team, your stage; read back, it gives the same level (built from the seed), the same things in the same states
//     and the same readout line as the playing side
//   * it rides in net.js's frames only when it has changed, and stays until a new one comes
//   * a run on tape: recorded, packed, unpacked, played: the same rows at the same times, through a portal and all
//   * it is small
//   node overworld/tests/micasurvivor_m3d_expnet_test.mjs
import { dataFrom, gainXp } from '../../micasurvivor/m3d/combat.js';
import { frame, diff, patch, Tape, keepEvents, NK } from '../../micasurvivor/m3d/net.js';
import { hashRoom } from '../../micasurvivor/m3d/gen.js';
import { expFrom, newRun, stepRun, hudLine, fire, setZoneTime } from '../../micasurvivor/m3d/expedition.js';
import { layoutOf, ecoView, pickTake } from '../../micasurvivor/m3d/expeco.js';
import { capView } from '../../micasurvivor/m3d/expcap.js';
import { runRow, rowView, teamSpot } from '../../micasurvivor/m3d/expnet.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G);
// (the watcher's side: its own copy of the 2D game's tables, as another page would have)
const XW = expFrom(loadG());
const run = (o = {}) => { const S = newRun(data, X, { seed: 21, dex: 6, league: true, weather: false, autoPick: 0, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; stepRun(S, null); return S; };
const steps = (S, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { S.acc = -1e9; for (const e of S.w.enemies) if (e !== S.boss && !e.keep) e.dummy = true; stepRun(S, null); } return S; };
const put = (S, p) => { const s = S.w.pl.s; s.x = p[0] !== undefined && p.x === undefined ? p[0] : p.x; s.y = p.y === undefined ? p[1] : p.y; s.z = p.z === undefined ? p[2] : p.z; s.vx = s.vy = s.vz = 0; s.grounded = true; };
/** What a watcher has of a run: the row, as text and back. */
const over = (S, keep) => rowView(JSON.parse(JSON.stringify(runRow(S))), XW, keep);

// ---------------------------------------------------------------- the row, read back
{
	const S = run(), keep = {};
	let v = over(S, keep);
	A(v.seed === 21 && v.map === 'viridian' && v.diff === 'normal' && v.zone === 1 && v.ph === 0 && v.coins === 0 && v.over === '' && hashRoom(v.room) === hashRoom(S.w.room) && v.room.altar.join() === S.w.room.altar.join(), 'a watcher is told the seed, the map and the zone, and builds the same level with the same altar');
	A(v.hud(S.w.pl.s) === hudLine(S) + ' · charge 0 %' && v.league && v.league.member === 4 && v.league.form === 4 && v.league.kit === 1, 'its readout line is the playing side\'s; it knows the member and the stage (' + v.hud(S.w.pl.s) + ')');
	const mine = ecoView(S).map((o) => o.i + o.kind + o.st).join(), theirs = v.eco.map((o) => o.i + o.kind + o.st).join();
	A(mine === theirs && v.eco.length > 20 && v.eco.every((o, k) => { const q = ecoView(S)[k]; return o.x === q.x && o.z === q.z && o.y === q.y; }), `the zone's things: the same ${v.eco.length}, in the same places`);
	// things change
	const lay = layoutOf(S.w.room, S), rock = lay.objs.find((o) => o.kind === 'rock'), u1 = lay.objs.find((o) => o.kind === 'unown1');
	put(S, rock); steps(S, 0.1); put(S, u1); steps(S, 3);
	v = over(S, keep);
	const mu = v.eco.find((o) => o.i === u1.i);
	A(!v.eco.some((o) => o.i === rock.i) && v.coins === S.coins && S.coins > 0 && mu && Math.abs(mu.ch - S.eco.z.ch[u1.i]) < 0.01 && mu.ch > 0.3 && ecoView(S).map((o) => o.i + o.kind + o.st).join() === v.eco.map((o) => o.i + o.kind + o.st).join(), `a rock broken, an altar ${Math.round(mu.ch * 100)} % charged, ${v.coins} ₽: the watcher has it all`);
	setZoneTime(S, lay.visits[0].at + 1); steps(S, 0.1); v = over(S, keep);
	A(v.eco.filter((o) => o.kind === 'meowth').length === 1 && v.eco.find((o) => o.kind === 'meowth').i === lay.visits[0].spot, 'Meowth\'s stall, when he is in');
	// the altar, the guardian
	put(S, S.w.room.altar); steps(S, 1.5); v = over(S, keep);
	A(Math.abs(v.charge - S.charge) < 0.011 && /charge 5\d %/.test(v.hud(S.w.pl.s)), 'the altar\'s charge');
	steps(S, 1.7); v = over(S, keep);
	A(v.ph === 1 && v.boss && v.boss.dex === S.plan.guardian && /GUARDIAN/.test(v.hud(S.w.pl.s)), 'the guardian, by species');
	S.boss.xborn = S.w.t - 60; steps(S, 0.05); v = over(S, keep);
	A(v.boss.exhausted > 1 && v.hud(S.w.pl.s) === hudLine(S), 'its exhaustion (' + v.hud(S.w.pl.s) + ')');
	// capture
	for (let k = 1; k < 40 && !S.w.enemies.some((e) => e.xk === 'alpha'); k++) fire(S, { at: 0, kind: 'alpha', n: 1, dex: [74], seed: k });
	const al = S.w.enemies.find((e) => e.xk === 'alpha'); al.dummy = true; S.w.hit(al, 1e12, 0, 0, 0); steps(S, 0.05); v = over(S, keep);
	const f = S.cap.faint[0];
	A(v.faint.length === 1 && v.faint[0].kind === 'alpha' && v.faint[0].dex === 74 && Math.abs(v.faint[0].x - f.x) < 0.06 && Math.abs(v.faint[0].z - f.z) < 0.06, 'a fainted alpha, where it lies');
	put(S, { x: f.x + 1, y: f.y, z: f.z }); steps(S, 0.4 + 1.5); v = over(S, keep);
	A(v.cine && v.cine.dex === 74 && v.cine.phase.n === capView(S).cine.phase.n && v.faint.length === 0, `the ball in the air (${v.cine && v.cine.phase.n})`);
	steps(S, 2.5); v = over(S, keep);
	A(!v.cine && v.sa.join() === '74' && teamSpot(S.w.pl.s, 0, 0, 1).every(Number.isFinite), 'and then your team: a Geodude');
	// the portal: another level
	S.w.hit(S.boss, 1e12, 0, 0, 0); steps(S, 0.1); put(S, S.w.room.altar); steps(S, 1);
	const h1 = hashRoom(v.room); v = over(S, keep);
	A(S.zone === 2 && v.zone === 2 && hashRoom(v.room) === hashRoom(S.w.room) && hashRoom(v.room) !== h1 && v.sa.join() === '74' && v.held === S.held && !!S.held, 'through the portal: the watcher builds zone 2\'s level; the team and the held item came along');
	// an evolution
	const pl = S.w.pl; let g = 0; while (pl.level < 16 && g++ < 200) { gainXp(S.w, (pl.xpNext - pl.xp + 0.5) / pl.xpMul); steps(S, 0.05); }
	v = over(S, keep);
	A(v.league.form === 5 && v.league.kit === 4, 'you evolve: the watcher is told the stage (Charmeleon)');
	S.w.pl.hp = 0; S.w.pl.dead = true; steps(S, 0.05);
	A(over(S, keep).over === 'lost', 'and when the run is over');
}

// ---------------------------------------------------------------- in the frames, on tape
{
	const S = run(), ev = [];
	const fr = () => { const f = frame(S.w, keepEvents(ev.splice(0), S.w.events)); f.r = runRow(S); return f; };
	const a = fr(); steps(S, 0.1); const b = fr(), d1 = diff(a, b);
	A(a.r && b.r && d1.r === undefined && JSON.stringify(patch(a, d1).r) === JSON.stringify(b.r), 'nothing of the run changed in a tenth of a second: the row is not sent again, and the watcher still has it');
	put(S, S.w.room.altar); steps(S, 0.5); const c = fr(), d2 = diff(b, c);
	A(d2.r && JSON.stringify(patch(b, d2).r) === JSON.stringify(c.r), 'the altar is charging: now it is');
	const row = JSON.stringify(runRow(S));
	A(row.length < 400, `a row is small (${row.length} characters with ${JSON.parse(row).o.length / 3} things changed)`);
	// a tape of a run through a portal
	const T = run({ seed: 33 }), tape = new Tape({ exp: { seed: 33, map: 'viridian', diff: 'normal' }, dex: 6 }), rows = [];
	const rec = (sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { T.acc = -1e9; stepRun(T, null); if (T.w.tick % Math.round(60 / NK.TAPE_HZ) === 0) { const f = frame(T.w, []); f.r = runRow(T); tape.add(f); rows.push([f.t, JSON.stringify(f.r)]); } } };
	rec(1); put(T, T.w.room.altar); rec(3.3); T.w.hit(T.boss, 1e12, 0, 0, 0); rec(0.2); put(T, T.w.room.altar); rec(1.2); rec(2);
	const text = tape.pack(), back = Tape.unpack(text), p = back.play(), F = p.viewer.frames;
	A(T.zone === 2 && F.length === rows.length && F.every((f, k) => f.t === rows[k][0] && JSON.stringify(f.r) === rows[k][1]), `a run taped through a portal (${F.length} frames, ${(text.length / 1024).toFixed(1)} KB): played back, every frame has the row it was recorded with`);
	const keep = {}, zones = F.map((f) => rowView(f.r, XW, keep).zone), phs = [...new Set(F.map((f) => f.r.z[1] + ':' + f.r.z[0]))];
	A(zones[0] === 1 && zones[zones.length - 1] === 2 && phs.join() === '0:1,1:1,2:1,0:2' && back.h.exp.seed === 33, 'the replay goes altar, guardian, portal, zone 2, as the run did', phs);
	const sent = tape.f.filter((f) => f.r).length;
	A(sent < F.length * 0.75, `and the row is on the tape only where it changed (${sent} of ${F.length} frames)`);
	const said = []; keepEvents(said, [{ k: 'say', text: 'The portal opens!', s: 3 }]);
	A(said.length === 1 && said[0].text === 'The portal opens!', 'the run\'s banners go to a watcher too');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
