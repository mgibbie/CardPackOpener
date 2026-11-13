// micasurvivor_m3d_coopsave_test.mjs — MicaSurvivor 3D, co-op from the online lobby, third part (Plans/MICASURVIVOR_3D_PLAN.md
// §5.73): what a co-op run keeps (micasurvivor/m3d/expsave.js guestOps, LOBBY_OK), in node.
//   * a lobby's start adds parameters to a player's address: they are fair, and nothing else is
//   * a guest writes the run into its own save: the team's result and the host's pay, its own League member's counters;
//     no best time, medal, stage or Seal (those are the host's run's)
//   * the end travels in the run's row, for an Expedition and for a Dive
//   node overworld/tests/micasurvivor_m3d_coopsave_test.mjs
import { unfair, LOBBY_OK, guestOps, applyOps } from '../../micasurvivor/m3d/expsave.js';
import { unfairDive } from '../../micasurvivor/m3d/divesave.js';
import { diveView } from '../../micasurvivor/m3d/divenet.js';
import { rowView } from '../../micasurvivor/m3d/expnet.js';
import { rulesFrom } from '../../micasurvivor/m3d/dive.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']), X = expFrom(G), R = rulesFrom(G);
const save = () => { const c = {}, s = {}; return { c, s, get: (k) => c[k] || 0, has: (k, v) => !!(s[k] && s[k].includes(String(v))), bump: (k, n) => { c[k] = (c[k] || 0) + n; }, best: (k, v) => { c[k] = Math.max(c[k] || 0, v); }, add: (k, v) => { s[k] = s[k] || []; if (!s[k].includes(String(v))) s[k].push(String(v)); }, commit: () => {} }; };
const q = (s) => [...new URLSearchParams(s).entries()];

// ---- what is fair
A(unfair(q('exp=7&map=viridian&diff=normal&dex=4&host=aaaaaaaaaaaa&lobby=aaaaaaaaaaaa')) === 'host' && unfair(q('exp=7&map=viridian&diff=normal&dex=4&host=aaaaaaaaaaaa&lobby=aaaaaaaaaaaa'), LOBBY_OK.host) === null, "a lobby's host: its start's parameters are fair with the lobby, and a practice run's without");
A(unfair(q('exp=7&dex=4&host=a&lobby=a&weather=0'), LOBBY_OK.host) === 'weather' && unfairDive(q('dive=7&route=forest&dex=4&host=a&lobby=a'), LOBBY_OK.host) === null && unfairDive(q('dive=7&dex=4&host=a&lobby=a&auto=1'), LOBBY_OK.host) === 'auto' && unfairDive(q('dive=7&dex=4&host=a')) === 'host', 'a test parameter beside them still makes it a practice run (an Expedition, a Dive)');
const guestFair = (s) => unfair(q(s).filter(([k]) => !LOBBY_OK.guest.includes(k)));
A(guestFair('join=a&lobby=a&lh=alice&id=1&dex=4&gen=7&biome=meadow&dj=7&route=forest') === null && guestFair('join=a&lobby=a&lh=alice&id=1&dex=4&gen=7&biome=meadow&xj=7&map=viridian&diff=normal') === null && guestFair('join=a&lobby=a&lh=alice&id=1&dex=4&auto=1') === 'auto' && guestFair('join=a&lobby=a&moves=ember') === 'moves', "a guest's address from a lobby's start is fair; with a test parameter it is not");

// ---- a Dive's guest
{
	const S = { dive: true, route: 'forest', weekly: null, w: { pl: { level: 9 } }, lg: { member: 4, form: 5, evo: 1, mat: 0, mega: 0, log: [[16, 'evo', 5]] } };
	const Sv = save(), ops = guestOps(S, { pay: 195, kills: 40, time: 300, depth: 7, won: false }, { dev: 'gd' });
	applyOps(Sv, ops);
	A(Sv.c['dive.runs'] === 1 && !Sv.c['dive.escapes'] && Sv.c['dive.forest.best'] === 7 && Sv.c['pay3d.gd'] === 195 && Sv.c['pay.best'] === 195 && Sv.c['m3d.n.gd'] === 1, "a guest of a Dive that ended on floor 7: the Dive, the route's best, the host's pay owed to the guest's own browser", Sv.c);
	A(Sv.c['lg.runs.4'] === 1 && Sv.c['lg.evo'] === 1 && Sv.c['lg.best.4'] === 9 && Sv.s['league.played'].join() === '4' && Sv.s['league.form'].join() === '5', "its own League member's run, and the form it reached", [Sv.c, Sv.s]);
	A(Sv.c['m3d.t.gd.runs'] === 1 && Sv.c['m3d.t.gd.kos'] === 40 && Sv.c['m3d.t.gd.secs'] === 300 && !Sv.c['m3d.t.gd.wins'], "the tasks' metrics, for the 2D game to count");
	A(!Sv.c['dive.forest.stage'] && !Sv.s['dive.seal'] && !Sv.c['dive.rescued'], "no stage, Seal or rescued: those are the host's run's");
	const E = save(); applyOps(E, guestOps(S, { pay: 60, kills: 5, time: 90, depth: 3, won: true }, { dev: 'gd' }));
	A(E.c['dive.escapes'] === 1 && E.c['dive.forest.best'] === 3, 'an escape counts as one');
	const W = save(); applyOps(W, guestOps({ ...S, weekly: { week: 44, mod: 'iron' } }, { pay: 60, kills: 5, time: 90, depth: 9, won: false }, { dev: 'gd' }));
	A(W.c['dive.weekly'] === 1 && !W.c['dive.forest.best'], 'a Weekly Dive keeps no best for a guest either');
	const Z = save(); applyOps(Z, guestOps(S, { pay: 0, kills: 0, time: 5, depth: 1, won: false }, { dev: 'gd' }));
	A(Z.c['dive.runs'] === 1 && !Z.c['pay3d.gd'], 'a run that paid nothing owes nothing');
}
// ---- an Expedition's guest
{
	const S = { map: 'viridian', diff: 'hard', w: { pl: { level: 20 } }, lg: { member: 7, form: 7, evo: 0, mat: 0, mega: 0, log: [] } }, T = { idx: (d) => ['normal', 'hard', 'master'].indexOf(d) };
	const Sv = save(); applyOps(Sv, guestOps(S, { pay: 450, kills: 900, time: 800, depth: 4, won: true }, { dev: 'ge', T }));
	A(Sv.c.runs === 1 && Sv.c['runs.exp-classic'] === 1 && Sv.c['zone.viridian.hard'] === 4 && Sv.c['wins.viridian.hard'] === 1 && Sv.c['tier.viridian'] === 2 && Sv.c['pay3d.ge'] === 450 && Sv.c['m3d.t.ge.wins'] === 1, "a guest of a won Expedition on Hard: the run, the win, the next tier open, the host's pay", Sv.c);
	A(!Sv.c['best.time.viridian.hard'] && !Sv.c['medal.viridian.hard'], 'no best time or medal for a guest');
	const L = save(); applyOps(L, guestOps(S, { pay: 30, kills: 20, time: 100, depth: 1, won: false }, { dev: 'ge', T }));
	A(L.c.runs === 1 && !L.c['wins.viridian.hard'] && !L.c['tier.viridian'], 'a lost one: the run, no win, no tier');
}
// ---- the end travels in the row
{
	const dv = diveView({ h: [3, 0, -1, ''], z: [2, 10, 20, 0, 0, 0, 5, 1, 0, 0, 0], e: [195, 40, 300, 7, 0] }, R, X, {});
	A(dv.end && dv.end.pay === 195 && dv.end.kills === 40 && dv.end.time === 300 && dv.end.depth === 7 && dv.end.won === false && diveView({ h: [3, 0, -1, ''], z: [2, 10, 20, 0, 0, 0, 5, 0, 0, 0, 0] }, R, X, {}).end === null, "a Dive's row carries the end once it is over, and nothing before");
	const xv = rowView({ h: [7, 0, 0], z: [1, 0, 0, 0, 0, 0, 2], e: [450, 900, 800, 4, 1] }, X, {});
	A(xv.end && xv.end.pay === 450 && xv.end.won === true && xv.end.depth === 4, "an Expedition's row too");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
