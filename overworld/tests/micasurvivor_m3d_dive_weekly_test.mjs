// micasurvivor_m3d_dive_weekly_test.mjs — MicaSurvivor 3D, Dive part 15 (Plans/MICASURVIVOR_3D_PLAN.md §5.68): the Weekly
// Dive (micasurvivor/m3d/dive.js o.weekly, divesave.js), in node, with the 2D game's own week, modifiers and numbers.
//   * it starts on floor 1 with no Seal, whatever is asked; its first line names the route and the modifier
//   * glass: you hit and are hit x1.5; horde: +2 foes a group; swift: foes x1.25 speed; iron: foes x1.4 HP
//   * a guardian gives no stage; the save counts the run and pays it, and keeps no record, stage, Seal or rescued
//   * its mark is this week's (the body the 3D board takes)
//   node overworld/tests/micasurvivor_m3d_dive_weekly_test.mjs
import { rulesFrom, newDive, stepDive, result, WEEKLY_TXT } from '../../micasurvivor/m3d/dive.js';
import * as DS from '../../micasurvivor/m3d/divesave.js';
import { applyOps, SV } from '../../micasurvivor/m3d/expsave.js';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive, WK = G.Expedition.diveWeekly();
const run = (mod, o = {}) => newDive(data, X, R, { route: WK.route, seed: WK.seed, dex: 4, league: true, weekly: mod ? { week: WK.week, mod } : null, ...o });
const plain = run(null);

A(R.WEEKLY === E.WEEKLY && R.WEEKLY.GLASS === 1.5 && R.WEEKLY.SWIFT === 1.25 && R.WEEKLY.IRON === 1.4 && G.Expedition.DIVE_MODS.every((m) => !!WEEKLY_TXT[m] && R.modName(m) !== m), "the modifiers and their numbers are the 2D game's", [R.WEEKLY, G.Expedition.DIVE_MODS]);
A(Number.isInteger(WK.week) && WK.seed !== 0 && !!R.F.ROUTES[WK.route] && G.Expedition.DIVE_MODS.includes(WK.mod), `this week: week ${WK.week}, ${WK.route}, ${WK.mod}`, WK);

// from floor 1, no Seal
{
	const S = run('iron', { start: 26, seal: true });
	A(S.floor === 1 && S.start === 1 && S.seal === false && S.weekly.week === WK.week && S.weekly.mod === 'iron', 'the Weekly Dive starts on floor 1 with no Seal, whatever is asked');
	stepDive(S, noInput());
	A(result(S).parts.weekly === WK.week && result(plain).parts.weekly === null && /^Weekly Dive · /.test(result(S).lines[0]), 'its result is marked as this week\'s', result(S).lines[0]);
	const T = run('horde'); let first = null; for (const q of T.w.events) if (q.k === 'say' && !first) first = q.text;
	A(/^Weekly Dive · .+ · .+: \+2 foes a group$/.test(first || ''), 'its first line names the route and the modifier, and what it does', first);
}
// the modifiers
{
	const out = (S) => S.w.hooks.out(S.w, {}, { id: S.w.pl.moves[0].id }, 10), hurt = (S) => S.w.hooks.hurt(S.w, 100);
	const g = run('glass');
	A(near(out(g), out(plain) * 1.5) && near(hurt(g), hurt(plain) * 1.5), 'glass: you hit and are hit x1.5', [out(g), hurt(g)]);
	const h = run('horde'), n = (S) => S.groups.reduce((a, q) => a + q.list.length, 0);
	A(h.groups.length === plain.groups.length && n(h) === n(plain) + 2 * plain.groups.length, 'horde: +2 foes in every group', [n(h), n(plain), plain.groups.length]);
	const i = run('iron'), s = run('swift'), foes = (S) => S.groups.flatMap((q) => q.list);
	A(foes(i).length === foes(plain).length && foes(i).every((e, k) => e.maxHp === Math.round(foes(plain)[k].maxHp * 1.4) || e.xk === 'elite'), 'iron: foes x1.4 HP');
	A(foes(s).every((e, k) => near(e.a.speed, foes(plain)[k].a.speed * 1.25, 1e-6) || e.xk === 'elite'), 'swift: foes x1.25 speed');
	A(near(out(i), out(plain)) && near(hurt(s), hurt(plain)) && n(i) === n(plain), '…and each modifier only does its own');
}
// the save
{
	const save = () => { const c = {}, s = {}; return { c, s, get: (k) => c[k] || 0, has: (k, v) => !!(s[k] && s[k].includes(String(v))), bump: (k, n) => { c[k] = (c[k] || 0) + n; }, best: (k, v) => { c[k] = Math.max(c[k] || 0, v); }, add: (k, v) => { (s[k] = s[k] || []).push(String(v)); }, commit: () => {} }; };
	const S = run('iron'); S.bank = 40; S.deepest = 26; S.floor = 26; S.guardians = 1; S.stage = 0; S.rescued = [16]; S.rescuedBank = 1; S.ended = true; S.lost = true;
	const Sv = save(), res = result(S);
	applyOps(Sv, DS.recordOps(S, res, { dev: 'dv1' }));
	A(Sv.c['dive.runs'] === 1 && Sv.c['dive.weekly'] === 1 && !Sv.c['dive.' + WK.route + '.best'] && !Sv.c['dive.' + WK.route + '.stage'] && !Sv.s['dive.seal'] && !Sv.c['dive.rescued'], 'the save counts it, and keeps no record, stage, Seal or rescued', [Sv.c, Sv.s]);
	A(Sv.c['pay3d.dv1'] === DS.coinsOf(res.parts.divePay) && Sv.c['pay3d.dv1'] > 0, '…and it is paid like any Dive');
	S.stage = 26;
	A(DS.guardianOps(S).length === 0, 'a guardian beaten in it gives no stage and no Seal');
	const o = { L: { free: (m) => m === 4, FAM: {}, BY: { 4: {} } }, Sv: save(), base: null, main: R.MAIN, member: 4 };
	const origin = newDive(data, X, R, { route: 'origin', seed: 3, dex: 4, league: true, weekly: { week: WK.week, mod: 'iron' } });
	A(DS.missing(origin, o) === null && DS.missing(newDive(data, X, R, { route: 'origin', seed: 3, dex: 4, league: true }), o) === 'route', 'its route is open to everyone that week (even one your save has not opened)');
	A(DS.unfairDive([['dive', String(WK.seed)], ['weekly', String(WK.week)], ['dex', '4']]) === null, 'weekly is a fair parameter of the address');
	// its mark
	const b = DS.scoreBody(S, res, { dv: SV.DV, board: SV.BOARD });
	A(b.weekly === true && b.week === WK.week && b.start === 1 && b.d3 === true && b.floor === 26, "its mark is this week's (what the 3D board takes)", b);
	const ask = DS.boardAsk(WK.route, SV.BOARD, WK.week), ask2 = DS.boardAsk('forest', SV.BOARD);
	A(ask.weekly === true && ask.week === WK.week && ask.route === undefined && ask.d3 === true && ask2.route === 'forest' && ask2.weekly === undefined, "and its board is asked for by the week, a route's by the route");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
