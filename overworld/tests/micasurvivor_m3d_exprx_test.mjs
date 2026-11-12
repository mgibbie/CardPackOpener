// micasurvivor_m3d_exprx_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.47): the elemental
// reactions and the weather's boosts (micasurvivor/m3d/exprx.js), in node, with the 2D game's OWN numbers
// (js/expedition/reactions.js) read as they are.
//   * the marks: a Water hit wets for 4 s; three Ice hits (one on a wet foe) freeze for 1.6 s; stacks lapse
//   * the seven reactions, each with the 2D game's factor, reach and what it leaves; one a hit; 0.25 s apart per foe
//   * the weather: Sun boosts Grass, Fog boosts Dark; the weather that favours your type gives every hit + 10 %
//   * the run counts them, writes them with the run (rx.<kind>, rx.total) and leaves them for the tasks, which the 2D
//     game's claim counts
//   node overworld/tests/micasurvivor_m3d_exprx_test.mjs
import { dataFrom, addEnemy, land, setWeather, U } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, result } from '../../micasurvivor/m3d/expedition.js';
import { isWet, statuses, reactionOf, marksOf } from '../../micasurvivor/m3d/exprx.js';
import { recordOps, applyOps, deviceId } from '../../micasurvivor/m3d/expsave.js';
import { noMeta } from '../../micasurvivor/m3d/expmeta.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const store = new Map(), ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const G = loadG(['systems/expedition.js', 'expedition/save.js', 'expedition/meta.js', 'expedition/reactions.js'], { localStorage: ls });
await G.ExpSave.open();
// (the 2D game's wallet, as its claim needs it)
G.DB = { save: { coins: 100, stats: {}, owned: {} }, commit() { return true; } };
G.Expedition.wallet = { balance: () => G.DB.save.coins, earn(n) { n = Math.floor(+n); if (!(n > 0)) return false; G.DB.save.coins += n; return true; }, spend(n) { if (G.DB.save.coins < n) return false; G.DB.save.coins -= n; return true; } };
G.Unlocks = { add: (list) => list.length }; G.UI = { toast() { } };
const data = dataFrom(G), X = expFrom(G), RK = G.ExpRx.K;
A(!!X.R && X.R.K === RK && X.R.KINDS.join() === 'electro,steam,inferno,wreck,gas,melt,rage' && X.R.NAME.electro === 'Electrocuted!' && X.R.NAME.wreck === 'Wreckage!', 'the 3D run reads the 2D game\'s own reactions: its numbers, its seven kinds, their names');

/** A run with nothing in it but what a check puts there. */
const mk = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, meta: noMeta(), ...o }); S.plan.events = []; S.w.pl.crit = 0; return S; };
/** A Rattata that stands still, `dx` metres east of you (and `dz` south), with life to spare. */
const foe = (S, dx, dz = 0) => addEnemy(S.w, 19, S.w.pl.s.x + dx, S.w.pl.s.z + dz, { dummy: true, hp: 1e6 });
const hit = (S, e, type, dmg = 100) => land(S.w, e, dmg, 1, 0, 0, { mtype: type });
/** The same hit on a foe that carries nothing (far from every other, and gone afterwards): what to compare with. */
const plain = (S, type, dmg = 100) => { const e = foe(S, 300, 300), d = hit(S, e, type, dmg); e.dead = true; return d; };
const evs = (S, k) => S.w.events.filter((ev) => ev.k === k);

// ---------------------------------------------------------------- the marks
{
	const S = mk(), w = S.w, e = foe(S, 2);
	A(!!S.rx && S.rx.n === 0 && !isWet(e, w.t) && statuses(e, w.t) === 0, 'a run starts with no reaction counted; a foe carries nothing');
	const d = hit(S, e, 'water');
	A(near(d, plain(S, 'water')) && isWet(e, w.t) && near(e.xwet - w.t, RK.WET_T) && RK.WET_T === 4 && statuses(e, w.t) === 1 && marksOf(e, w.t)[0] === true, 'a Water hit does its own damage and leaves the foe wet for 4 s');
	w.t += 3.99; A(isWet(e, w.t), '…still wet at 3.99 s'); w.t += 0.02; A(!isWet(e, w.t) && statuses(e, w.t) === 0, '…dry after 4 s');
	// chill
	const c = foe(S, 4);
	hit(S, c, 'ice'); hit(S, c, 'ice');
	A(c.xchill === 2 && !(c.frozenT > 0) && marksOf(c, w.t)[1] === 2 && statuses(c, w.t) === 1, 'two Ice hits: two chill stacks, not frozen yet');
	hit(S, c, 'ice');
	A(near(c.frozenT, RK.FREEZE_T) && RK.FREEZE_T === 1.6 && RK.CHILL_N === 3 && c.xchill === 0 && evs(S, 'rx').some((ev) => ev.kind === 'frozen' && ev.id === c.id), 'the third freezes it for 1.6 s (the stacks are spent)', c.frozenT);
	const c2 = foe(S, 6);
	hit(S, c2, 'ice'); w.t += RK.CHILL_T + 0.01; hit(S, c2, 'ice');
	A(c2.xchill === 1 && RK.CHILL_T === 3, 'a chill stack lapses after 3 s: the next Ice hit starts again at one');
	const c3 = foe(S, 8);
	hit(S, c3, 'water'); hit(S, c3, 'ice');
	A(near(c3.frozenT, 1.6) && !isWet(c3, w.t), 'one Ice hit on a wet foe freezes it at once (and it is no longer wet)');
}

// ---------------------------------------------------------------- Electrocuted
{
	const S = mk(), w = S.w, e = foe(S, 2), R = RK.ELECTRO.r * U;
	A(near(R, 9), 'the chain reaches 9 m', R);
	const wetNear = [foe(S, 2 + 3), foe(S, 2, 5), foe(S, 2 - 8.9)], dry = foe(S, 2, -4), far = foe(S, 2 + 9.5);
	for (const o of [e, ...wetNear, far]) hit(S, o, 'water');
	const hp0 = [...wetNear, dry, far].map((o) => o.hp), base = plain(S, 'electric');
	A(reactionOf(S, 'electric', e) === 'electro' && reactionOf(S, 'electric', dry) === null, 'Electric on a wet foe: Electrocuted (on a dry one: nothing)');
	const d = hit(S, e, 'electric');
	A(near(d, base * 1.5) && RK.ELECTRO.k === 1.5 && !isWet(e, w.t), 'the hit does × 1.5, and the foe is dry again', [d, base]);
	const lost = [...wetNear, dry, far].map((o, i) => hp0[i] - o.hp);
	A(lost.slice(0, 3).every((x) => x === Math.round(d * 0.5)) && lost[3] === 0 && lost[4] === 0 && wetNear.every((o) => !isWet(o, w.t)) && isWet(far, w.t), 'it chains to the wet foes within 9 m at half the hit each (not to a dry one, not beyond 9 m); they dry too', lost);
	A(S.rx.n === 1 && S.rx.by.electro === 1 && S.rx.chain === 3 && evs(S, 'rx').filter((ev) => ev.kind === 'electro' && ev.id === e.id).length === 1 && evs(S, 'rxchain')[0].links.length === 3, 'the run counts it, and tells the page (the reaction, its chain)');
	// the cool-down: the same reaction on the same foe, 0.25 s apart
	hit(S, e, 'water'); const d2 = hit(S, e, 'electric');
	A(near(d2, base) && S.rx.n === 1 && RK.CD === 0.25, 'the same reaction on the same foe again at once: not yet (0.25 s apart)');
	w.t += 0.26; const d3 = hit(S, e, 'electric');
	A(near(d3, base * 1.5) && S.rx.n === 2, '…and after 0.25 s it reacts again');
	// at most twelve
	const S2 = mk(), e2 = foe(S2, 2), many = []; for (let i = 0; i < 15; i++) many.push(foe(S2, 2 + Math.cos(i) * 3, Math.sin(i) * 3));
	for (const o of [e2, ...many]) hit(S2, o, 'water');
	hit(S2, e2, 'electric');
	A(S2.rx.chain === 12 && RK.ELECTRO.n === 12 && many.filter((o) => isWet(o, S2.w.t)).length === 3, 'the chain takes twelve at most (fifteen wet foes: three are left wet)');
	// paralysis: about 60 % of those it reaches
	let para = 0, n = 0;
	for (let k = 0; k < 20; k++) { const T = mk({ seed: 100 + k }), a = foe(T, 2), os = []; for (let i = 0; i < 10; i++) os.push(foe(T, 2 + Math.cos(i) * 3, Math.sin(i) * 3)); for (const o of [a, ...os]) hit(T, o, 'water'); hit(T, a, 'electric'); n += os.length; para += os.filter((o) => o.paraT > 0).length; }
	A(RK.ELECTRO.para === 0.6 && para / n > 0.5 && para / n < 0.7, `those it reaches are paralysed 60 % of the time (${para} of ${n})`);
}

// ---------------------------------------------------------------- Steam, Inferno, Poison Gas
{
	const S = mk(), w = S.w, e = foe(S, 2), inR = foe(S, 2 + 5.9), out = foe(S, 2 + 6.2);
	e.burn = 3; e.burnT = 3;
	const base = plain(S, 'water'), d = hit(S, e, 'water');
	A(near(d, base * 1.4) && e.burn === 0 && !isWet(e, w.t), 'Steam (Water on a burning foe): × 1.4, the burn goes out, and it is not left wet', [d, base]);
	A(e.confT > 0 && inR.confT > 0 && near(inR.slow, RK.STEAM.root) && near(inR.slowT, RK.STEAM.rootT) && !(out.confT > 0) && out.slow === 0 && near(RK.STEAM.r * U, 6), '…it confuses and roots the foes within 6 m (itself too), not one at 6.2 m');
}
{
	const S = mk(), e = foe(S, 2), inR = foe(S, 2 + 6.9), out = foe(S, 2 + 7.2);
	e.burn = 1; e.burnT = 3;
	const d = hit(S, e, 'grass'), base = plain(S, 'grass');
	A(near(d, base) && inR.burn === RK.INFERNO.burn && inR.burnT === 3 && out.burn === 0 && e.burn === 1 && S.rx.by.inferno === 1, 'Inferno (Grass on a burning foe): the burn spreads to the foes within 7 m (two stacks), not one at 7.2 m');
	const f = foe(S, -3); f.burn = 1; f.burnT = 3; hit(S, f, 'flying');
	A(S.rx.by.inferno === 2, '…Flying sets it off too');
}
{
	const S = mk(), e = foe(S, 2), inR = foe(S, 2 + 5.9), out = foe(S, 2 + 6.2);
	e.poison = 1; e.poisonT = 4;
	const base = plain(S, 'fire'), d = hit(S, e, 'fire');
	A(near(d, base * 1.3) && inR.poison === RK.GAS.poison && inR.poisonT === 4 && out.poison === 0, 'Poison Gas (Fire on a poisoned foe): × 1.3, and the foes within 6 m are poisoned (two stacks)', [d, base]);
}

// ---------------------------------------------------------------- Wreckage, Psychic Meltdown, Dragon Rage
{
	const S = mk(), w = S.w;
	for (const ty of ['rock', 'fighting', 'steel']) {
		const e = foe(S, 2); e.frozenT = 1.5;
		const base = plain(S, ty), d = hit(S, e, ty);
		A(near(d, base * 2.6) && e.frozenT <= 0.01, `Wreckage (${ty} on a frozen foe): × 2.6, and the ice shatters`, [d, base]);
		e.dead = true;
	}
	const m = foe(S, 2); m.confT = 2;
	A(near(hit(S, m, 'psychic'), plain(S, 'psychic') * 1.6), 'Psychic Meltdown (Psychic on a confused foe): × 1.6');
	const sl = foe(S, 4); sl.sleepT = 2;
	A(reactionOf(S, 'psychic', sl) === 'melt', '…and on a sleeping one');
	const r1 = foe(S, 6); r1.burn = 1;
	A(reactionOf(S, 'dragon', r1) === null && near(hit(S, r1, 'dragon'), plain(S, 'dragon')), 'Dragon on a foe with one status: nothing');
	const r2 = foe(S, 8); r2.burn = 1; r2.poison = 1;
	A(near(hit(S, r2, 'dragon'), plain(S, 'dragon') * 1.8) && RK.RAGE.n === 2, 'Dragon Rage (Dragon on a foe with two statuses): × 1.8');
	const r3 = foe(S, 10); hit(S, r3, 'water'); hit(S, r3, 'ice');   /* wet + a chill stack would freeze: wet then slow instead */
	const r4 = foe(S, 12); hit(S, r4, 'water'); r4.slow = 0.3; r4.slowT = 1;
	A(statuses(r4, w.t) === 2 && reactionOf(S, 'dragon', r4) === 'rage', '…wet counts as a status (wet and slowed: two)');
	// one reaction a hit
	const both = foe(S, 14); both.burn = 1; both.burnT = 3; const n0 = S.rx.n; hit(S, both, 'water');
	A(S.rx.n === n0 + 1 && S.rx.log[S.rx.log.length - 1] === 'steam', 'a hit sets off one reaction at most');
	// a hit with no type, and a co-op guest's side: nothing
	const nt = foe(S, 16); nt.burn = 1; const n1 = S.rx.n;
	land(w, nt, 100, 1, 0, 0, { kind: 'item' });
	A(S.rx.n === n1, 'a hit with no type (an item\'s) sets nothing off');
}

// ---------------------------------------------------------------- the weather
{
	const S = mk(), w = S.w, full = (kind) => { setWeather(w, kind, 120); w.weather.t = 60; };
	const dry = { grass: plain(S, 'grass'), dark: plain(S, 'dark'), normal: plain(S, 'normal'), fire: plain(S, 'fire') };
	full('sun');   // (you are Charmander: Fire, which the sun favours)
	A(near(plain(S, 'normal'), dry.normal * 1.1) && RK.WX_SELF === 0.1, 'the sun favours your Fire type: every hit of yours + 10 %');
	A(near(plain(S, 'grass'), dry.grass * 1.3 * 1.1), 'Sun boosts Grass × 1.3 (on top)');
	A(near(plain(S, 'fire'), dry.fire * 1.5 * 1.1), '…and the fight\'s own boost to Fire stands (× 1.5)');
	full('fog');
	A(near(plain(S, 'dark'), dry.dark * 1.3) && near(plain(S, 'normal'), dry.normal), 'Fog boosts Dark × 1.3; it does not favour Fire: no + 10 %');
	w.weather.t = 0.0001;
	A(plain(S, 'dark') < dry.dark * 1.01, 'a weather just starting has hardly any of it (it fades in)');
	// the banner, once a weather
	const S2 = mk(); S2.acc = -1e9; stepRun(S2, null);
	setWeather(S2.w, 'sun', 120); stepRun(S2, null);
	const said = S2.says.filter((q) => /boosts your Charmander: \+10% damage/.test(q.text)).length;
	stepRun(S2, null);
	A(said === 1 && !S2.says.some((q) => /boosts your/.test(q.text)), 'when the weather favours your Pokémon the run says so, once', S2.says);
	const S3 = mk(); stepRun(S3, null); setWeather(S3.w, 'rain', 120); stepRun(S3, null);
	A(!S3.says.some((q) => /boosts your/.test(q.text)), 'a weather that does not favour it: no banner');
}

// ---------------------------------------------------------------- the run's record, and the tasks
{
	const Sv = G.ExpSave, M = G.ExpMeta, dev = deviceId(ls, Sv.who, globalThis.crypto);
	const S = mk(), w = S.w;
	for (let i = 0; i < 3; i++) { const e = foe(S, 2 + i * 20); hit(S, e, 'water'); hit(S, e, 'electric'); }
	{ const e = foe(S, -30); e.frozenT = 1; hit(S, e, 'rock'); }
	w.t = 120; S.ended = true;
	const res = result(S), ops = recordOps(S, res, { T: G.ExpTier, dev, research: [], seen: Sv.get('m3d.seen.' + dev), final: false });
	const o = Object.fromEntries(ops.map((p) => [p[0] + ' ' + p[1], p[2]]));
	A(o['bump rx.electro'] === 3 && o['bump rx.wreck'] === 1 && o['bump rx.total'] === 4 && o['bump rx.steam'] === undefined, 'the run\'s reactions are written with it, in the 2D game\'s keys (rx.<kind>, rx.total)', o);
	A(o['bump m3d.t.' + dev + '.reactions'] === 4, '…and left for the tasks');
	applyOps(Sv, ops);
	const NOW = Date.UTC(2026, 10, 12, 12); M.clock = () => NOW;
	M.claim3d();
	A(Sv.get('m3d.tc.' + dev + '.reactions') === 4 && Sv.get('rx.total') === 4, 'the 2D game\'s claim counts them into the tasks (once)');
	M.claim3d();
	A(Sv.get('m3d.tc.' + dev + '.reactions') === 4, '…claimed again: nothing more');
	// a run with none writes none
	const S0 = mk(); S0.w.t = 60; S0.ended = true;
	const o0 = Object.fromEntries(recordOps(S0, result(S0), { T: G.ExpTier, dev, research: [], seen: 1, final: false }).map((p) => [p[0] + ' ' + p[1], p[2]]));
	A(o0['bump rx.total'] === undefined && o0['bump m3d.t.' + dev + '.reactions'] === undefined, 'a run with no reaction writes none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
