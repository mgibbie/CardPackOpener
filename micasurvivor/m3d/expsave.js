// expsave.js — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.34): what a 3D run leaves behind.
// Owner, 2026-11-12: a 3D run pays into the SAME save as a 2D one; its scores have their OWN boards.
//
// There are two saves. The EXPEDITION save (js/expedition/save.js: counters that merge by the largest, sets by union) is
// safe to write from any page, and a 3D run writes it here with the 2D game's own keys: runs, best times, splits, wins,
// medals and tiers, Survival's records, the League's counters and forms. The BASE save (your Pokémonedas, your
// collection) is merged by the whole game (its Tower, its modes, its co-op), so the 3D page never opens it. Instead a
// run's pay is written into the Expedition save as OWED to this browser (`pay3d.<device>`), and the 2D game pays it
// into the wallet the next time the Expedition opens on this browser (js/expedition/meta.js claim3d: `pay3d.claimed.
// <device>`); the forms a run evolved into join the collection there too. Both counters are written by one browser
// only, so merging by the largest can never pay twice or lose a payment.
//
// A run is kept only if it is FAIR: a League run as the page's player would start it (no test parameters), as a
// member, on a map and at a tier the save has, and CLEAN (the 2D game's own checks: the run's clock no faster than
// the real one, stats within what a run can reach).
//
// Pure: the page (main.js) hands in the run, its result and the saves. Not kept yet: the economy's, the capture's and
// the level-ups' counters, the tasks, the achievements (they are checked by the 2D game from the counters there are).

export const SV = { DV: 20 /* the Expedition's content version (js/systems/expedition.js DV: the boards file a score by it) */, INV: 1e9, BOARD: 'micasurvivor_expedition', OK: ['exp', 'map', 'diff', 'mode', 'dex', 'debug'], MAX_HP: 50000, MAX_ATK: 2000, MAX_SPD: 25 };

/** The first parameter of the page's address that makes its run a practice run (null: none). params: [[key, value]]. */
export function unfair(params) { for (const [k, v] of params) if (!SV.OK.includes(k) || (k === 'mode' && v !== 'survival')) return k; return null; }
/** Is the run within what a run can be? realSec: the real seconds since it began. */
export function clean(S, realSec) {
	const pl = S.w.pl, t = S.w.t;
	return t <= realSec + 10 && Number.isFinite(pl.hp) && Number.isFinite(pl.maxHp) && pl.maxHp <= SV.MAX_HP && pl.hp <= pl.maxHp + 1 && pl.atkMul <= SV.MAX_ATK && pl.spdMul <= SV.MAX_SPD && pl.level <= 20 + t / 3;
}
/** This browser's id in the Expedition save, as js/expedition/meta.js dev() makes and keeps it. store: localStorage. */
export function deviceId(store, who, cryptoObj) {
	const k = 'micasurvivorexp_dev.' + (who || 'guest');
	let d = null;
	try { d = store.getItem(k); } catch (e) { /* no storage: the fixed id */ }
	if (!d || !/^[a-z0-9]{4,12}$/.test(d)) {
		d = 'local';
		try { const a = new Uint32Array(2); cryptoObj.getRandomValues(a); d = (a[0].toString(36) + a[1].toString(36)).slice(0, 10).padEnd(6, '0'); store.setItem(k, d); } catch (e) { /* the fixed id */ }
	}
	return d;
}
/** Does the save have this member, this map and this tier? o: { L: G.ExpLeague, T: G.ExpTier, Sv: G.ExpSave, base: the
 *  base save as read (never written) from this browser, or null }. -> null, or what is missing. */
export function missing(S, o) {
	const { L, T, Sv, base } = o;
	if (!S.lg) return 'league';
	const m = S.lg.member, fam = Object.keys(L.FAM).filter((d) => L.FAM[d] === m).map(Number).concat(m);
	const has = L.free(m) || Sv.has('league.own', String(m)) || !!(base && base.owned && fam.some((d) => base.owned[d]));
	if (!has) return 'member';
	if (!T.mapOpen(S.map)) return 'map';
	if (T.unlocked(S.map) < T.idx(S.diff)) return 'tier';
	return null;
}
/** The run as the boards and the save name it. res: expedition.js result(S). dv: the Expedition's content version. */
export function runSum(S, res, dv) {
	return { mode: S.surv ? 'exp-survival' : 'exp-classic', dv, map: S.map, diff: S.diff, time: Math.floor(S.w.t), level: S.w.pl.level, kills: S.w.stats.kills, dex: S.lg ? S.lg.form : S.w.pl.mon.dex, shiny: false, score: res.score, parts: res.parts, won: !!res.won };
}
/** What the run writes into the Expedition save, with the 2D game's keys: [['bump' | 'best' | 'add', key, value]].
 *  o: { T: G.ExpTier, dev: this browser's id }. */
export function recordOps(S, res, o) {
	const ops = [], bump = (k, n = 1) => { n = Math.floor(n); if (n > 0) ops.push(['bump', k, n]); }, best = (k, v) => { v = Math.floor(v); if (v > 0) ops.push(['best', k, v]); }, add = (set, id) => ops.push(['add', set, String(id)]);
	const sum = runSum(S, res, 0), md = S.map + '.' + S.diff, t = sum.time, T = o.T;
	bump('runs'); bump('runs.' + sum.mode); best('best.time.' + md, t);
	if (S.surv && S.sv) {
		const sv = S.sv;
		best('surv.best.' + md, t); best('surv.best', t); bump('surv.runs');
		bump('surv.miles', sv.downs); bump('surv.legends', sv.legends); bump('surv.mewtwo', +sv.mewtwo || 0); bump('surv.pacts', sv.pacts.length); bump('surv.lands', sv.land - 1);
	} else {
		for (let z = 1; z <= 4; z++) if (S.splits[z - 1] != null) best('split.' + md + '.z' + z, SV.INV - Math.round(S.splits[z - 1] * 10));
		best('zone.' + md, S.zone);
		if (S.won) {
			bump('wins.' + md); best('clear.' + md, SV.INV - Math.round(S.splits[3] * 10));
			const mi = T.medalOf(t, S.diff, S.map);
			best('medal.' + md, mi); bump('medals.' + T.MEDAL[mi]); best('tier.' + S.map, Math.min(2, T.idx(S.diff) + 1));
		}
	}
	if (S.lg) {
		const G = S.lg, types = new Set((S.data.mon(G.member).types || []).concat(S.data.mon(G.form).types || []));
		bump('kos', sum.kills); for (const ty of types) bump('ko.t.' + ty, sum.kills);
		bump('guardians', S.bosses.filter((b) => b.zone <= 3 && b.down != null).length);
		bump('lg.evo', G.evo); best('lg.mat', G.mat); best('lg.lv', sum.level);
		bump('lg.runs.' + G.member); best('lg.best.' + G.member, sum.level);
		add('league.played', G.member); add('league.form', G.form);
		for (const e of G.log) if (e[1] === 'evo') add('league.form', e[2]);
		if (G.mega) { bump('lg.mega'); add('mega.seen', G.mega); }
	}
	// 3D's own: one more 3D run from this browser, and its pay owed to it (the 2D game pays it into the wallet)
	bump('m3d.n.' + o.dev);
	if (res.pay && res.pay.pay > 0) { bump('pay3d.' + o.dev, res.pay.pay); best('pay.best', res.pay.pay); }
	return ops;
}
/** Write them. Sv: G.ExpSave (opened). */
export function applyOps(Sv, ops) { for (const [op, k, v] of ops) { if (op === 'bump') Sv.bump(k, v); else if (op === 'best') Sv.best(k, v); else Sv.add(k, v); } Sv.commit(); return ops.length; }
/** The run's mark for the 3D boards (server/mp.mjs run-score: `d3` files it apart from the 2D boards). */
export function scoreBody(sum) {
	const p = sum.parts, surv = sum.mode === 'exp-survival';
	return Object.assign({ mode: SV.BOARD, d3: true, expMode: sum.mode, dv: sum.dv, map: sum.map, diff: sum.diff, score: Math.floor(sum.score), time: sum.time, kills: Math.floor(sum.kills || 0), level: Math.floor(sum.level || 1), dex: sum.dex | 0, shiny: false },
		surv ? { dmg: p.dmg, bosses: p.bosses, legends: p.legends, catches: p.catches } : { zone: p.zone, won: p.won, dmg: p.dmg, bosses: p.bosses, catches: p.catches });
}
/** Why a run was not kept, for the run's end. */
export const WHY = { league: 'Practice run (not a League run): nothing is saved.', member: 'You do not have this League member yet: nothing is saved.', map: 'This map is not open in your save yet: nothing is saved.', tier: 'This tier is not open in your save yet: nothing is saved.',
	unclean: 'This run could not be verified: nothing is saved.', nosave: 'Your save could not be opened: nothing is saved.', practice: 'Practice run (a test setting is on): nothing is saved.', guest: 'You were a guest in this run: the host\'s save keeps it.' };
