// micasurvivor_m3d_expfog_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): the fog of war of an
// Expedition zone (micasurvivor/m3d/expfog.js), in node. The 2D game's rule and numbers:
//   * the cells within 14 of where you stand are explored, and stay explored
//   * a thing shows once its cell is explored, or while you are within 9 cells of it
//   * a run keeps its zone's fog as you walk; a new zone starts dark
//   * a co-op guest's fog is its own
//   node overworld/tests/micasurvivor_m3d_expfog_test.mjs
import { CELL } from '../../micasurvivor/m3d/sim.js';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun } from '../../micasurvivor/m3d/expedition.js';
import { layoutOf } from '../../micasurvivor/m3d/expeco.js';
import { FK, newFog, reveal, explored, found, fogOf, share } from '../../micasurvivor/m3d/expfog.js';
import { guestRun, stepGuest } from '../../micasurvivor/m3d/expcoop.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G);
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: [], weather: false, autoPick: 0, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e9; stepRun(S, null); return S; };
const put = (S, x, z) => { const s = S.w.pl.s; s.x = x; s.z = z; s.vx = s.vz = 0; };

{
	A(FK.SIGHT === G.ExpEco.K.SIGHT && FK.RADAR === G.ExpEco.K.RADAR && FK.SIGHT === 14 && FK.RADAR === 9, 'the sight (14) and the radar (9) are the 2D game\'s');
	const S = run(), room = S.w.room, f = newFog(room), cx = 25, cz = 25, x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
	A(f.n === 0 && !explored(f, cx, cz) && share(f) === 0, 'a zone starts dark');
	A(reveal(f, x, z) === true && explored(f, cx, cz) && explored(f, cx + 14, cz) && explored(f, cx, cz - 14) && explored(f, cx + 9, cz + 10) && !explored(f, cx + 15, cz) && !explored(f, cx + 10, cz + 10), 'standing somewhere explores the cells within 14 of you (a circle), no further');
	const n = f.n; let want = 0; for (let dz = -14; dz <= 14; dz++) for (let dx = -14; dx <= 14; dx++) if (dx * dx + dz * dz <= 196) want++;
	A(n === want && reveal(f, x + 0.4, z - 0.3) === false && f.n === n, `that is ${n} cells; standing on the same cell again changes nothing`);
	A(reveal(f, x + CELL, z) === true && f.n > n && explored(f, cx + 15, cz) && explored(f, cx - 14, cz), 'one cell on: one more column, and what was explored stays explored');
	A(!explored(f, -1, 0) && !explored(f, 0, room.h) && reveal(f, 1, 1) === true && explored(f, 0, 0), 'the edge of the level is the edge of the map');
	// found
	const g = newFog(room), o = { x: 80, z: 40 }, far = { x: 20, z: 90 };
	A(!found(g, o, null) && !found(g, o, { x: 80 + 9 * CELL + 1, z: 40 }) && found(g, o, { x: 80 + 9 * CELL - 1, z: 40 }), 'a thing in the dark shows while you are within 9 cells of it');
	reveal(g, 80, 40);
	A(found(g, o, far) && found(g, o, null) && !found(g, far, null), 'once its cell is explored it shows from anywhere; one in the dark does not');
}
{
	// a run
	const S = run(), room = S.w.room, sp = room.spawn, fog = fogOf(S), lay = layoutOf(room, S);
	A(fog.room === room && fog.n > 300 && explored(fog, Math.floor(sp[0] / CELL), Math.floor(sp[2] / CELL)) && share(fog) > 0.1 && share(fog) < 0.75, `a run begins with what is round where you arrive explored (${Math.round(share(fog) * 100)} % of the zone's floor)`);
	const near = lay.objs.filter((o) => found(fog, o, S.w.pl.s)), dark = lay.objs.filter((o) => !found(fog, o, S.w.pl.s));
	A(near.length > 0 && dark.length > 0 && near.every((o) => Math.hypot(o.x - sp[0], o.z - sp[2]) <= 14 * CELL + CELL), `${near.length} of the zone's ${lay.objs.length} things are found from the start; ${dark.length} are still in the dark`);
	const t = dark[0], n0 = fog.n; put(S, t.x, t.z); S.w.pl.s.y = t.y; stepRun(S, null);
	A(fog.n > n0 && found(fog, t, S.w.pl.s) && fogOf(S) === fog, 'walk to one: its ground is explored, and it is found');
	put(S, sp[0], sp[2]); stepRun(S, null);
	A(found(fog, t, S.w.pl.s), 'and stays found when you walk away');
	// a new zone
	const a = room.altar; put(S, a[0], a[2]); S.w.pl.s.y = a[1]; for (let i = 0; i < 200; i++) { S.acc = -1e9; stepRun(S, null); }
	S.w.hit(S.boss, 1e12, 0, 0, 0); for (let i = 0; i < 80; i++) { S.acc = -1e9; put(S, a[0], a[2]); stepRun(S, null); }
	const f2 = fogOf(S);
	A(S.zone === 2 && f2 !== fog && f2.room === S.w.room && f2.n > 0 && f2.n < fog.n && share(f2) < share(fog), 'through the portal: the new zone starts dark, but for where you arrive');
	// a guest's own
	const Gs = guestRun(data, X, { seed: 7, id: 1, dex: 9 }); stepGuest(Gs, null);
	const gf = fogOf(Gs);
	A(gf !== fogOf(S) && gf.n > 0 && explored(gf, Math.floor(Gs.w.pl.s.x / CELL), Math.floor(Gs.w.pl.s.z / CELL)), 'a co-op guest has a fog of its own: where IT has been');
	const P = newRun(data, X, { seed: 7, dex: 6, moves: [], eco: false }); stepRun(P, null);
	A(fogOf(P).n > 0, 'a run without an economy has its fog all the same');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
