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
//   * wild League members: a challenge done after a kept run makes its member wild; up to five wait for a run, in an
//     order of the run's seed; a catch is saved at once and is then yours (and joins the collection at the claim)
//   node overworld/tests/micasurvivor_m3d_expsave_test.mjs
import { dataFrom, gainXp } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, result } from '../../micasurvivor/m3d/expedition.js';
import { megaEvolve } from '../../micasurvivor/m3d/expleague.js';
import { SV, unfair, clean, deviceId, missing, runSum, recordOps, applyOps, scoreBody, WHY, hasMember, wildOf, catchOps, shinyOps, newlyMet, boardAsk, boardRows } from '../../micasurvivor/m3d/expsave.js';
import { rng as seedRng } from '../../micasurvivor/m3d/gen.js';
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

// ---------------------------------------------------------------- wild League members
{
	const q = game(), G2 = q.G, Sv2 = G2.ExpSave, L2 = G2.ExpLeague, M2 = G2.ExpMeta; await Sv2.open();
	const o = { L: L2, Sv: Sv2, base: null };
	A(wildOf(7, { ...o, max: 5, rng: seedRng }).length === 0 && newlyMet(o).length === 0 && Sv2.list('league.met').length === 0, 'a new save: no one is wild, and no challenge is done');
	// the counters of a few good runs: the challenges that read them are now complete
	Sv2.bump('runs', 60); Sv2.bump('kos', 60000); Sv2.best('zone.viridian.normal', 4); Sv2.bump('wins.viridian.normal', 5); Sv2.bump('guardians', 40); for (const ty of ['fire', 'water', 'grass', 'normal', 'bug', 'flying']) Sv2.bump('ko.t.' + ty, 20000);
	const want = L2.D.members.filter((m) => m.ch && !hasMember(m.dex, o) && L2.progress(m.ch).done).map((m) => m.dex);
	const met = newlyMet(o);
	A(want.length >= 6 && want.every((d) => met.includes(d)) && met.every((d) => Sv2.has('league.met', d) && Sv2.has('league.wild', d) && L2.wild(d)) && newlyMet(o).length === 0, `after those runs ${met.length} members' challenges are done: each is met, and wild until caught (the 2D game's own wild() says so); asked again, no one new`);
	const w7 = wildOf(7, { ...o, max: 5, rng: seedRng }), w7b = wildOf(7, { ...o, max: 5, rng: seedRng }), w8 = wildOf(8, { ...o, max: 5, rng: seedRng });
	A(w7.length === 5 && w7.every((d) => met.includes(d)) && new Set(w7).size === 5 && w7.join() === w7b.join() && w7.join() !== w8.join(), `five of them wait for a run, in an order of its seed (seed 7: ${w7.join(', ')})`);
	const c = w7[0], ops = catchOps(c);
	A(ops.length === 2 && ops[0].join() === 'add,league.own,' + c && ops[1].join() === 'bump,cap.league,1', 'a catch: the member is yours, in the 2D game\'s keys');
	applyOps(Sv2, ops);
	A(hasMember(c, o) && L2.own(c) && !L2.wild(c) && !wildOf(7, { ...o, max: 5, rng: seedRng }).includes(c) && !wildOf(8, { ...o, max: 99, rng: seedRng }).includes(c) && missing({ lg: { member: c }, map: 'viridian', diff: 'normal' }, { ...o, T: G2.ExpTier }) === null, 'saved: it is yours (the 2D game\'s own() says so), it is wild no more, and a run as it is kept');
	const inBase = met.find((d) => d !== c);
	A(!wildOf(7, { ...o, base: { owned: { [inBase]: { at: 1 } } }, max: 99, rng: seedRng }).includes(inBase), 'one that is in the base collection does not come as wild');
	// the collection: at the 2D game's claim
	const d2 = deviceId(q.ls, Sv2.who, globalThis.crypto); Sv2.bump('m3d.n.' + d2); M2.claim3d();
	A(q.unlocked.includes(c), 'at the 2D game\'s next claim the member caught joins the collection', q.unlocked);
}

// ---------------------------------------------------------------- the level-ups', the economy's and the capture's counters
{
	const S = mk({ eco: true }), pl = S.w.pl;
	S.lv.log.push([2, 'up', 'ember', 0], [3, 'vit', 'protein', 2], [4, 'new', 'x', 1], [5, 'swap', 'a>b', 3], [6, 'item', 'leftovers', 0], [7, 'item', 'quickclaw', 1], [8, 'skip', 'skip', 0], [9, 'train', 'dmg', 0]);
	pl.xv = [{ id: 'protein', lvl: 3 }, { id: 'zinc', lvl: 5 }]; pl.xi = { leftovers: 2, quickclaw: 1 }; pl.moves[0].xlv = S.L.MK.MAX_LV;
	S.eco.earned = 140; S.eco.spent = 60; Object.assign(S.eco.log, { balls: 3, shop: 2, altars: 1, spins: 4, slotWins: 1 });
	S.cap.log.alpha = 2; S.cap.log.best = 2; S.cap.log.seen = 1; S.cap.log.fled = 1; S.cap.sa = [{ dex: 19, type: 'normal' }, { dex: 74, type: 'rock' }];
	S.w.t = 300; S.ended = true;
	const o = ops2(recordOps(S, result(S), { T, dev }));
	A(o['bump lv.cards'] === 4 && o['bump lv.rar.1'] === 1 && o['bump lv.rar.3'] === 1 && o['bump lv.rar.2'] === 1 && o['bump lv.rar.4'] === 1 && o['bump lv.swaps'] === 1 && o['bump lv.items'] === 2 && o['bump lv.skips'] === 1 && o['best lv.vitmax'] === 5 && o['best lv.move8'] === 1 && o['best lv.stacks'] === 3, 'the level-ups\' counters: the cards taken by rarity, swaps, items, skips, the best vitamin, moves at their top level, the items held', o);
	A(o['bump eco.earned'] === 140 && o['best eco.best'] === 140 && o['bump eco.spent'] === 60 && o['bump eco.balls'] === 3 && o['bump eco.shop'] === 2 && o['bump eco.altars'] === 1 && o['bump eco.spins'] === 4 && o['bump eco.slotWins'] === 1 && !('bump eco.freed' in o), 'the economy\'s: earned, spent, and what was opened, bought, used and spun');
	A(o['bump cap.alpha'] === 2 && o['best sa.best'] === 2 && o['add sa.types:normal'] === 'normal' && o['add sa.types:rock'] === 'rock' && o['bump shiny.seen'] === 1 && o['bump cap.fled'] === 1, 'the capture\'s: alphas recruited, the largest team, its types, shinies seen, the ones that fled');
	const sh = shinyOps(25, 172), sh2 = shinyOps(999999, 0);
	A(sh.map((q) => q.join()).join('|') === 'add,shiny.caught,25|bump,cap.shiny,1|add,league.shiny,172' && sh2.length === 2, 'a shiny caught is kept at once: its species, the count, and its family\'s shiny for the League');
}

// ---------------------------------------------------------------- the 3D boards, asked for and read
{
	const a = boardAsk('mtmoon', 'hard', 'score'), t = boardAsk('mtmoon', 'hard', 'time');
	A(JSON.stringify(a) === JSON.stringify({ mode: 'micasurvivor_expedition', d3: true, map: 'mtmoon', diff: 'hard', rules: 2 }) && t.board === 'time' && t.d3 === true && boardAsk('viridian', 'normal', 'survival').board === 'survival', 'a 3D board is asked for with d3 (and the rules the boards are filed under); its view when it is not the score\'s');
	const top = Array.from({ length: 14 }, (_, i) => ({ name: 'p' + i, score: 5000 - i * 100, time: 600 + i, level: 20, dex: 6 }));
	const rows = boardRows({ top, you: { name: 'p12', score: 3800, time: 612, level: 20, dex: 6, rank: 13 } }, (d) => (G.DEX_BY[d] || {}).name, 'p12');
	A(rows.length === 11 && rows[0].rank === 1 && rows[0].score === '5,000' && rows[0].time === '10:00' && rows[0].who === 'Charizard Lv 20' && rows[10].rank === 13 && rows[10].me && !rows[0].me && boardRows({ top: top.slice(0, 3), you: { ...top[1], rank: 2 } }, () => 'x', 'p1').filter((r) => r.me).length === 1 && boardRows({}, () => '', 'a').length === 0, 'read: the top ten, and yours under them when it is further down');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
