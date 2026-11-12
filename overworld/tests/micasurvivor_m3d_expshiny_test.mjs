// micasurvivor_m3d_expshiny_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.50): shinies, as
// the run and a watcher know them (how they are drawn: micasurvivor_m3d_shiny_page_test).
//   * a wild shiny is marked as one, and a watcher's frame says so (another enemy's does not)
//   * a run told its League member is shiny keeps it (its look only: the fight is the same to the last number), and a
//     watcher is told, with or without a Mega
//   node overworld/tests/micasurvivor_m3d_expshiny_test.mjs
import { dataFrom, addEnemy, hashWorld } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun } from '../../micasurvivor/m3d/expedition.js';
import { frame, Viewer } from '../../micasurvivor/m3d/net.js';
import { runRow, rowView } from '../../micasurvivor/m3d/expnet.js';
import { K } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), XW = expFrom(loadG());
const mk = (o = {}) => { const S = newRun(data, X, { seed: 21, dex: 4, league: true, weather: false, autoPick: 0, ...o }); S.plan.events = []; S.acc = -1e9; S.w.pl.maxHp = S.w.pl.hp = 1e6; stepRun(S, null); return S; };
const step = (S, n = 1) => { for (let i = 0; i < n; i++) { S.acc = -1e9; stepRun(S, null); } };
const over = (S) => rowView(JSON.parse(JSON.stringify(runRow(S))), XW, {});

// ---------------------------------------------------------------- a wild shiny, in a watcher's frame
{
	const S = mk(), w = S.w, s = w.pl.s;
	const plain = addEnemy(w, 19, s.x + 4, s.z, { dummy: true, hp: 1e5 }), sh = addEnemy(w, 16, s.x - 4, s.z, { dummy: true, hp: 1e5 }); sh.shiny = true; sh.xk = 'shiny';
	const f = JSON.parse(JSON.stringify(frame(w, []))), rp = f.e.find((r) => r[0] === plain.id), rs = f.e.find((r) => r[0] === sh.id);
	A(rp && rs && !(rp[7] & 64) && !!(rs[7] & 64), 'a frame marks a shiny enemy as one (and no other)', [rp && rp[7], rs && rs[7]]);
	const V = new Viewer(); V.push(f); step(S, 6); const f2 = JSON.parse(JSON.stringify(frame(w, []))); V.push(f2);
	const view = V.sample(f2.t * K.TICK), vp = view.enemies.find((e) => e.id === plain.id), vs = view.enemies.find((e) => e.id === sh.id);
	A(vp && vs && vs.shiny === true && vp.shiny === false && vs.dex === 16, 'a watcher has it as a shiny (to draw it in its own colours)', [vp && vp.shiny, vs && vs.shiny]);
}

// ---------------------------------------------------------------- your shiny League member
{
	const a = mk(), b = mk({ shiny: true });
	A(a.lg.shiny === false && b.lg.shiny === true, 'a run told its member is shiny keeps it; by default it is not');
	step(a, 240); step(b, 240);
	A(hashWorld(a.w) === hashWorld(b.w), 'it is a look only: the fight is the same to the last number');
	const va = over(a), vb = over(b);
	A(va.league && va.league.shiny === false && vb.league && vb.league.shiny === true && vb.league.member === 4 && vb.league.mega === 0, 'a watcher is told (the run\'s row carries it)', [va.league, vb.league]);
	const c = mk({ dex: 6 }); c.lg.mega = 10034; const vc = over(c);
	const d = mk({ dex: 6, shiny: true }); d.lg.mega = 10034; const vd = over(d);
	A(vc.league.mega === 10034 && vc.league.shiny === false && vd.league.mega === 10034 && vd.league.shiny === true, '…with a Mega too, and a Mega alone is not a shiny', [vc.league, vd.league]);
	const g = newRun(data, X, { seed: 21, dex: 16, league: false, moves: ['tackle'], weather: false, shiny: true });
	A(!g.lg, 'a run outside the League has no member to be shiny (nothing breaks)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
