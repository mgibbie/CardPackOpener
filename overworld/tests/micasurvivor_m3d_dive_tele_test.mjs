// micasurvivor_m3d_dive_tele_test.mjs — MicaSurvivor 3D, Dive part 9 (Plans/MICASURVIVOR_3D_PLAN.md §5.61): the red
// ground (micasurvivor/m3d/dive.js teleTick), in node, with the 2D Dive's own numbers (TELE).
//   * a brawler in reach winds up a slam: it holds still, the page is told the circle, and after TELE.slam s everyone
//     inside is hit; stepping out, or dodging through the moment, takes nothing
//   * a foe that shoots, a sleeper and a frozen foe do not slam
//   * an alpha slams wider and, from afar, charges: a lane, then a dash along it that hits what it crosses, once;
//     a wall stops it
//   * the same run gives the same slams
//   node overworld/tests/micasurvivor_m3d_dive_tele_test.mjs
import { rulesFrom, newDive, stepDive, spawnFoe } from '../../micasurvivor/m3d/dive.js';
import { dataFrom, hashWorld } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { CELL, noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive, TE = R.TELE;
const run = (o = {}) => { const S = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: ['ember', 'water-gun', 'tackle'], autoPick: 0, kit: false, ...o }); S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; const pl = S.w.pl; pl.maxHp = pl.hp = 1e6; pl.moves.length = 0; return S; };
const step = (S, input) => { stepDive(S, input || noInput()); return S.w.events.slice(); };
/** Step until `until(events)` or `sec` s. -> every event */
const play = (S, sec, until, input) => { const all = []; for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) { const ev = step(S, typeof input === 'function' ? input() : input); all.push(...ev); if (until && until(ev, all)) break; } return all; };
/** A brawler (no shot) / a shooter of the game's data. */
const foe = (S, dex, dx, o = {}) => { const s = S.w.pl.s, e = spawnFoe(S, dex, s.x + dx, s.z, o); e.hp = e.maxHp = 1e9; e.a.speed = 0; e.touchCd = 1e9; return e; };
const pick = (want) => { for (let d = 1; d <= 151; d++) { const S = run(), e = spawnFoe(S, d, S.w.pl.s.x + 2, S.w.pl.s.z, {}); if (e && want(e)) return d; } return 0; };
const BRAWLER = pick((e) => !e.def.shotCd && e.behavior !== 'thief' && !e.fly), SHOOTER = pick((e) => !!e.def.shotCd);
const hp0 = 1e6;

A(TE === E.TELE && TE.slam === 0.8 && TE.slamR === 1.6 && TE.alphaR === 2.6 && TE.guardR === 3.4 && TE.charge === 0.9 && TE.chargeLen === 7 && TE.SLAM_DMG === 1.35 && TE.CHARGE_DMG === 1.6 && TE.REACH === 2.2, "the numbers are the 2D Dive's (TELE)", TE);
A(BRAWLER > 0 && SHOOTER > 0, `a brawler (dex ${BRAWLER}) and a foe that shoots (dex ${SHOOTER}) from the game's data`);

// ---------------------------------------------------------------- a slam
{
	const S = run(), pl = S.w.pl, e = foe(S, BRAWLER, 2);
	const ev = play(S, 4, (q) => q.some((x) => x.k === 'tele'));
	const te = ev.find((x) => x.k === 'tele');
	A(!!te && te.kind === 'slam' && near(te.r, TE.slamR * CELL) && te.T === TE.slam && near(te.x, e.a.x) && near(te.z, e.a.z), 'a brawler in reach winds up a slam: the page is told the red circle (1.6 tiles, 0.8 s)', te);
	A(e.dummy === true && !!e.xtele && S.tg.length === 1, 'it holds still while it winds up');
	play(S, TE.slam - 0.1);
	A(pl.hp === hp0 && S.tg.length === 1, 'nothing lands before the circle fills');
	const ev2 = play(S, 0.3, (q) => q.some((x) => x.k === 'slam'));
	A(ev2.some((x) => x.k === 'slam') && near(hp0 - pl.hp > 0 ? 1 : 0, 1) && ev2.some((x) => x.k === 'hurt'), 'then everyone inside is hit', hp0 - pl.hp);
	A(e.dummy === false && !e.xtele && S.tg.length === 0 && e.xtcd >= TE.CD[0] - 0.4 - TE.slam && e.xtcd <= TE.CD[1], 'the foe moves again, and waits 2.6 to 4.2 s for the next', e.xtcd);
}
{	// its damage: the foe's x SLAM_DMG (against the same foe's plain number, by the same road)
	const hit = (k) => { const S = run(), pl = S.w.pl, e = foe(S, BRAWLER, 2); e.dmg = 100 * k; play(S, 6, (q) => q.some((x) => x.k === 'slam')); return hp0 - pl.hp; };
	const a = hit(1), b = hit(2);
	A(a > 0 && near(b / a, 2, 1e-6), 'the slam hits for the foe\'s damage x1.35 (twice the foe, twice the slam)', [a, b]);
}
{	// stepping out
	const S = run(), pl = S.w.pl; foe(S, BRAWLER, 2);
	play(S, 4, (q) => q.some((x) => x.k === 'tele'));
	pl.s.x -= TE.slamR * CELL + 1;
	const ev = play(S, 1.2, (q) => q.some((x) => x.k === 'slam'));
	A(ev.some((x) => x.k === 'slam') && pl.hp === hp0, 'step out of the circle: it lands on nothing');
}
{	// dodging through it
	const S = run({ kit: true }), pl = S.w.pl; pl.moves.length = 0; foe(S, BRAWLER, 2);
	play(S, 4, (q) => q.some((x) => x.k === 'tele'));
	play(S, TE.slam - 0.1);
	S.dodge.t = 0.3;   // (in the dodge as it lands: the i-frames)
	const ev = play(S, 0.25, (q) => q.some((x) => x.k === 'slam'));
	A(ev.some((x) => x.k === 'slam') && pl.hp === hp0, 'in a dodge as it lands: nothing hurts you');
}
{	// who does not slam
	const S = run(), sh = foe(S, SHOOTER, 2); sh.shotCd = 1e9;
	const sl = foe(S, BRAWLER, -2); sl.asleep = true; sl.dummy = true;
	const fr = foe(S, BRAWLER, 0); fr.a.z += 3; fr.frozenT = 1e9;
	const ev = play(S, 6);
	A(!ev.some((x) => x.k === 'tele'), 'a foe that shoots, a sleeper and a frozen foe do not slam');
	const far = run(); foe(far, BRAWLER, (TE.REACH + 2) * CELL);
	A(!play(far, 5).some((x) => x.k === 'tele'), `a brawler farther than ${TE.REACH} tiles does not either`);
}
{	// a foe that faints mid wind-up
	const S = run(), pl = S.w.pl, e = foe(S, BRAWLER, 2);
	play(S, 4, (q) => q.some((x) => x.k === 'tele'));
	e.dead = true;
	const ev = play(S, 1.5);
	A(!ev.some((x) => x.k === 'slam') && S.tg.length === 0 && pl.hp === hp0, 'a foe that faints while winding up: no slam');
}

// ---------------------------------------------------------------- an alpha
{
	const S = run(), e = foe(S, BRAWLER, 2, { alpha: true });
	S.w.rand = () => 0.99;   // (close by, and the dice say no charge)
	const te = play(S, 5, (q) => q.some((x) => x.k === 'tele')).find((x) => x.k === 'tele');
	A(e.xk === 'alpha' && !!te && te.kind === 'slam' && near(te.r, TE.alphaR * CELL), 'an alpha close by slams wider (2.6 tiles)', te);
}
{
	const S = run(), pl = S.w.pl, s = pl.s, e = foe(S, BRAWLER, 5 * CELL, { alpha: true });
	const x0 = e.a.x;
	const te = play(S, 5, (q) => q.some((x) => x.k === 'tele')).find((x) => x.k === 'tele');
	A(!!te && te.kind === 'charge' && near(te.len, TE.chargeLen * CELL) && near(te.w, TE.chargeW * CELL) && te.T === TE.charge && Math.abs(Math.cos(te.a) + 1) < 1e-6, 'an alpha 5 tiles away charges: the page is told the red lane toward you (7 tiles long, 0.9 s)', te);
	play(S, TE.charge - 0.1);
	A(near(e.a.x, x0) && pl.hp === hp0, 'it holds still while the lane fills');
	const ev = play(S, TE.chargeT + 0.4, (q, all) => S.tg.length === 0 && all.some((x) => x.k === 'charge'));
	A(ev.some((x) => x.k === 'charge') && x0 - e.a.x > 3 * CELL && e.a.x < s.x + 1, 'then it dashes along it, past where you stood', [x0, e.a.x, s.x]);
	A(ev.filter((x) => x.k === 'hurt').length === 1 && pl.hp < hp0, 'what it crosses is hit, once', ev.filter((x) => x.k === 'hurt').length);
	A(e.dummy === false && !e.xtele, 'and it fights on');
	// a wall stops the dash
	const room = S.w.room, cz = Math.floor(e.a.z / CELL), cx = Math.floor(e.a.x / CELL);
	A(room.cells[cz * room.w + cx] < room.rimH, 'it never ends inside rock');
}
{	// out of the lane
	const S = run(), pl = S.w.pl; foe(S, BRAWLER, 5 * CELL, { alpha: true });
	play(S, 5, (q) => q.some((x) => x.k === 'tele'));
	pl.s.z += TE.chargeW * CELL + 1.5;
	play(S, TE.charge + TE.chargeT + 0.3);
	A(pl.hp === hp0, 'step out of the lane: the charge misses');
}

// ---------------------------------------------------------------- the same run gives the same
{
	const one = () => { const S = run({ seed: 11 }); foe(S, BRAWLER, 2); foe(S, BRAWLER, 5 * CELL, { alpha: true }); const ev = play(S, 8); return [hashWorld(S.w), ev.filter((x) => x.k === 'tele' || x.k === 'slam' || x.k === 'charge').map((x) => x.k + (x.kind || '')).join()]; };
	const a = one(), b = one();
	A(a[0] === b[0] && a[1] === b[1] && a[1].includes('teleslam') && a[1].includes('telecharge'), 'the same run gives the same slams and charges', [a[1], b[1]]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
