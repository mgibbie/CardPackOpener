// micasurvivor_m3d_expsave_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.34): what a
// 3D run leaves behind (micasurvivor/m3d/expsave.js), in node, against the 2D game's OWN save code: js/expedition/
// save.js, tiers.js and meta.js run as they are.
//   * a run is kept only if it is fair (no test parameter) and clean (the 2D game's checks)
//   * the save must have the member, the map and the tier
//   * a won Classic run writes the 2D game's keys: the 2D game's own functions then read the medal, the next tier
//     and the next map from them
//   * a Survival run writes Survival's records; a League run the League's counters and forms
//   * the pay is OWED to this browser, never paid here: the 2D game's claim3d() pays it into the wallet once, and
//     the forms a run evolved into join the collection
//   * no profile yet: nothing is paid and nothing is lost (it waits)
//   * the mark for the 3D boards
//   node overworld/tests/micasurvivor_m3d_expsave_test.mjs
import { dataFrom, gainXp } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, result } from '../../micasurvivor/m3d/expedition.js';
import { megaEvolve } from '../../micasurvivor/m3d/expleague.js';
import { SV, unfair, clean, deviceId, missing, runSum, recordOps, applyOps, scoreBody, WHY } from '../../micasurvivor/m3d/expsave.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
/** The 2D game with its save code, over a store of this test's; a wallet as js/systems/expedition.js has it. */
function game(profile = true) {
	const store = new Map(), ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
	const unlocked = [];
	const G = loadG(['systems/expedition.js', 'expedition/save.js', 'expedition/meta.js'], { localStorage: ls, pre: (G) => { G.U = G.U || {}; } });
	G.DB = { save: profile ? { coins: 100, stats: {}, owned: {} } : null, commits: 0, commit() { this.commits++; return true; } };
	G.Expedition.wallet = { balance: () => (G.DB.save ? G.DB.save.coins : 0), earn(n) { n = Math.floor(+n); const s = G.DB.save; if (!s || !(n > 0)) return false; s.coins += n; G.DB.commit(true); return true; }, spend(n) { const s = G.DB.save; if (!s || s.coins < n) return false; s.coins -= n; return true; } };
	G.Unlocks = { add: (list) => { unlocked.push(...list); return list.length; } };
	G.UI = { toast() { } };
	return { G, store, ls, unlocked };
}
const { G, ls, unlocked } = game();
const data = dataFrom(G), X = expFrom(G), Sv = G.ExpSave, T = G.ExpTier, L = G.ExpLeague, M = G.ExpMeta;
await Sv.open();
const mk = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, ...o }); S.plan.events = []; S.acc = -1e9; stepRun(S, null); return S; };
const ops2 = (ops) => Object.fromEntries(ops.map(([op, k, v]) => [op + ' ' + k + (op === 'add' ? ':' + v : ''), v]));

// ---------------------------------------------------------------- fair and clean
{
	A(unfair([]) === null && unfair([['exp', '7'], ['map', 'mtmoon'], ['diff', 'hard'], ['dex', '6'], ['mode', 'survival'], ['debug', '1']]) === null, 'a run from the page\'s own address is fair (the seed, the map, the tier, the member, Survival)');
	A(unfair([['exp', '7'], ['moves', 'ember:3']]) === 'moves' && unfair([['exp', '7'], ['auto', '0']]) === 'auto' && unfair([['league', '0']]) === 'league' && unfair([['host', 'me']]) === 'host' && unfair([['mode', 'x']]) === 'mode', 'any test parameter makes it a practice run (moves, auto, league=0, a co-op host)');
	const S = mk();
	A(clean(S, 5) && SV.DV === G.Expedition.DV, 'a fresh run is clean; the content version sent with a score is the 2D game\'s');
	S.w.t = 100; const fast = clean(S, 20); S.w.t = 0;
	S.w.pl.maxHp = 1e9; S.w.pl.hp = 1e9; const fat = clean(S, 5); S.w.pl.maxHp = S.w.pl.hp = 88;
	S.w.pl.level = 60; const high = clean(S, 5);
	A(!fast && !fat && !high, 'a clock ahead of the real one, HP beyond what a run can reach, a level too high for its time: not clean');
}
// ---------------------------------------------------------------- the member, the map, the tier
{
	const o = { L, T, Sv, base: null };
	A(L.free(4) && missing(mk(), o) === null, 'Charmander on Viridian at Normal: a starter, the first map, the first tier');
	A(!L.free(149) && missing(mk({ dex: 149 }), o) === 'member' && missing(mk({ dex: 149 }), { ...o, base: { owned: { 148: { at: 1 } } } }) === null, 'a member the save does not have: not kept; owned in the base save (any stage of its family): kept');
	A(missing(mk({ map: 'mtmoon' }), o) === 'map' && missing(mk({ diff: 'hard' }), o) === 'tier' && missing(mk({ league: false, moves: ['ember'] }), o) === 'league', 'a map not open yet, a tier not open yet, a run that is not a League run: not kept');
	A(Object.keys(WHY).every((k) => /nothing is saved|host's save/.test(WHY[k])), 'each reason has its line for the run\'s end');
}
// ---------------------------------------------------------------- a won Classic run
const dev = deviceId(ls, Sv.who, globalThis.crypto);
{
	A(/^[a-z0-9]{4,12}$/.test(dev) && dev === M.dev() && deviceId(ls, Sv.who, globalThis.crypto) === dev, `this browser's id is the one the 2D game makes and keeps (${dev})`);
	const S = mk(); const pl = S.w.pl;
	let g = 0; while (pl.level < 40 && g++ < 400) { gainXp(S.w, (pl.xpNext - pl.xp + 0.5) / pl.xpMul); S.acc = -1e9; stepRun(S, null); stepRun(S, null); }
	megaEvolve(S, 10034) || 0;
	S.w.t = 1500; S.w.stats.kills = 900; S.w.stats.dealt = 400000; S.zone = 4; S.won = true; S.ended = true; S.splits = [300, 700, 1100, 1500];
	S.bosses = [{ zone: 1, down: 290 }, { zone: 2, down: 690 }, { zone: 3, down: 1090 }, { zone: 4, down: 1500 }];
	const res = result(S), ops = recordOps(S, res, { T, dev }), o = ops2(ops), mi = T.medalOf(1500, 'normal', 'viridian');
	A(res.won && res.pay.pay > 0 && o['bump runs'] === 1 && o['bump runs.exp-classic'] === 1 && o['best best.time.viridian.normal'] === 1500 && o['best zone.viridian.normal'] === 4 && o['bump wins.viridian.normal'] === 1 && o['best clear.viridian.normal'] === 1e9 - 15000 && o['best split.viridian.normal.z1'] === 1e9 - 3000 && o['best split.viridian.normal.z4'] === 1e9 - 15000, 'a won Classic run: the run, its time, its zone, its win, its clear and its four splits, in the 2D game\'s keys', o);
	A(o['best medal.viridian.normal'] === mi && o['bump medals.' + T.MEDAL[mi]] === 1 && o['best tier.viridian'] === 1, `its medal (${T.MEDAL[mi]}) and the next tier`);
	A(o['bump kos'] === 900 && o['bump ko.t.fire'] === 900 && o['bump ko.t.flying'] === 900 && !('bump ko.t.dragon' in o) && o['bump guardians'] === 3 && o['bump lg.evo'] === 2 && o['best lg.lv'] === pl.level && o['bump lg.runs.4'] === 1 && o['best lg.best.4'] === pl.level && o['add league.played:4'] === '4' && o['add league.form:5'] === '5' && o['add league.form:6'] === '6' && o['bump lg.mega'] === 1 && o['add mega.seen:10034'] === '10034', 'the League\'s counters: KOs (by the types of its species, as the 2D game counts them: not of its Mega), guardians, evolutions, its level, the forms it reached, its Mega', o);
	A(o['bump m3d.n.' + dev] === 1 && o['bump pay3d.' + dev] === res.pay.pay && o['best pay.best'] === res.pay.pay && !ops.some((q) => /coins|pay\.total|pay3d\.claimed/.test(q[1])), `its pay (₽ ${res.pay.pay}) is owed to this browser, not paid here`);
	const before = { tier: T.unlocked('viridian'), next: T.mapOpen('mtmoon'), medal: T.medal('viridian', 'normal'), coins: G.DB.save.coins, commits: G.DB.commits };
	applyOps(Sv, ops);
	A(before.tier === 0 && !before.next && !before.medal && T.unlocked('viridian') === 1 && T.mapOpen('mtmoon') && T.medal('viridian', 'normal') === mi && Sv.get('runs') === 1 && Sv.has('league.form', '6'), 'written: the 2D game\'s own code now reads the medal, Hard open on Viridian and Mt. Moon open');
	A(G.DB.save.coins === before.coins && G.DB.commits === before.commits && missing(mk({ map: 'mtmoon' }), { L, T, Sv, base: null }) === null && missing(mk({ diff: 'hard' }), { L, T, Sv, base: null }) === null, 'the base save was not touched; and the next run may be on Mt. Moon or at Hard');
	const body = scoreBody(runSum(S, res, SV.DV));
	A(body.mode === 'micasurvivor_expedition' && body.d3 === true && body.expMode === 'exp-classic' && body.dv === 20 && body.map === 'viridian' && body.diff === 'normal' && body.score === res.score && body.time === 1500 && body.zone === 4 && body.won === true && body.kills === 900 && body.dex === 6 && body.bosses === res.parts.bosses && !('replay' in body) && body.score === T.score(res.parts, 'normal'), 'its mark for the 3D boards: d3, the parts the server recomputes the score from, no replay', body);

	// ---- the 2D game pays what is owed, once
	const paid = M.claim3d();
	A(paid === res.pay.pay && G.DB.save.coins === before.coins + res.pay.pay && Sv.get('pay3d.claimed.' + dev) === res.pay.pay && Sv.get('pay.total') === res.pay.pay && Sv.get('pay.coins') === res.pay.pay && Sv.get('m3d.seen.' + dev) === 1, `the 2D game's claim3d(): ₽ ${paid} into the wallet`);
	A([5, 6].every((d) => unlocked.includes(d)), 'and the forms the run evolved into join the collection', unlocked);
	const again = M.claim3d(), n0 = unlocked.length;
	A(again === 0 && G.DB.save.coins === before.coins + res.pay.pay && unlocked.length === n0, 'claimed again: nothing more (never twice)');
	// a second run, lost
	const S2 = mk(); S2.w.t = 200; S2.w.stats.kills = 300; S2.ended = true; S2.lost = true;
	const r2 = result(S2), ops2b = recordOps(S2, r2, { T, dev });
	applyOps(Sv, ops2b);
	A(!r2.won && !ops2b.some((q) => /^(wins|clear|medal|tier)/.test(q[1])) && Sv.get('runs') === 2 && Sv.get('pay3d.' + dev) === res.pay.pay + r2.pay.pay && M.claim3d() === r2.pay.pay && G.DB.save.coins === before.coins + res.pay.pay + r2.pay.pay && M.claim3d() === 0, `a lost run: no win, no medal; its pay (₽ ${r2.pay.pay}) is owed and then paid, once`);
	const S3 = mk(); S3.w.t = 30; S3.ended = true; const r3 = result(S3), ops3 = recordOps(S3, r3, { T, dev });
	A(r3.pay.pay === 0 && !ops3.some((q) => /^pay/.test(q[1])) && ops3.some((q) => q[1] === 'm3d.n.' + dev), 'under a minute: a run, but no pay owed');
}
// ---------------------------------------------------------------- Survival
{
	const S = mk({ mode: 'survival' });
	S.w.t = 1260; S.w.stats.kills = 700; S.sv.downs = 4; S.sv.legends = 1; S.sv.pacts = Object.keys(X.V.PACT_BY).slice(0, 2); S.sv.land = 3; S.ended = true;
	const res = result(S), o = ops2(recordOps(S, res, { T, dev }));
	A(res.survival && o['bump runs.exp-survival'] === 1 && o['best surv.best.viridian.normal'] === 1260 && o['best surv.best'] === 1260 && o['bump surv.runs'] === 1 && o['bump surv.miles'] === 4 && o['bump surv.legends'] === 1 && o['bump surv.pacts'] === 2 && o['bump surv.lands'] === 2 && !Object.keys(o).some((k) => /split|wins|zone\./.test(k)), 'a Survival run: its time, its milestone bosses, its legendaries, its pacts and its lands, in Survival\'s keys', o);
	const body = scoreBody(runSum(S, res, SV.DV));
	A(body.expMode === 'exp-survival' && body.d3 === true && body.legends === res.parts.legends && body.bosses === 4 && !('zone' in body) && !('won' in body), 'its mark: Survival\'s parts');
}
// ---------------------------------------------------------------- no profile yet
{
	const q = game(false), Sv2 = q.G.ExpSave, M2 = q.G.ExpMeta; await Sv2.open();
	const d2 = deviceId(q.ls, Sv2.who, globalThis.crypto), X2 = expFrom(q.G), S = newRun(dataFrom(q.G), X2, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0 });
	S.w.t = 200; S.ended = true; const res = result(S);
	applyOps(Sv2, recordOps(S, res, { T: q.G.ExpTier, dev: d2 }));
	const none = M2.claim3d();
	q.G.DB.save = { coins: 0, stats: {}, owned: {} };
	const later = M2.claim3d();
	A(none === 0 && Sv2.get('pay3d.' + d2) === res.pay.pay && later === res.pay.pay && q.G.DB.save.coins === res.pay.pay && M2.claim3d() === 0, 'no profile on this browser yet: nothing is paid and nothing is lost; with one, it is paid (once)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
