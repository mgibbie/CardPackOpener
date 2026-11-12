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
// WILD LEAGUE MEMBERS read and write this save too: the ones met and not caught wait for a run (wildOf), a catch is
// saved at once (catchOps), and after a kept run the challenges now complete make new ones wild (newlyMet).
//
// Pure: the page (main.js) hands in the run, its result and the saves. The level-ups', the economy's and the capture's
// counters are kept too (the 2D game's keys: its achievements and its Lab's goals read them), and its RESEARCH.
//
// The daily and weekly TASKS pay Pokémonedas, so they are the 2D game's to count (as a run's pay is its to pay): a 3D run
// leaves its metrics in the save for this browser (`m3d.t.<device>.<metric>` summed; `m3d.x.<device>.<metric>` for the two
// that are a single run's best), and the 2D game's claim3d counts them into the tasks of the day and week it is then.

export const SV = { RULES: 2 /* the rules the boards are filed under (js/entities/player.js RULES; the server's MSURV_RULES) */, DV: 20 /* the Expedition's content version (js/systems/expedition.js DV: the boards file a score by it) */, INV: 1e9, BOARD: 'micasurvivor_expedition', OK: ['exp', 'map', 'diff', 'mode', 'dex', 'form', 'debug'], MAX_HP: 50000, MAX_ATK: 2000, MAX_SPD: 25 };

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
/** Does the save have League member `m`? (A starter, one caught, or any stage of its family in the base collection.) */
export function hasMember(m, o) {
	const { L, Sv, base } = o;
	if (L.free(m) || Sv.has('league.own', String(m))) return true;
	return !!(base && base.owned) && Object.keys(L.FAM).some((d) => L.FAM[d] === m && base.owned[d]) || !!(base && base.owned && base.owned[m]);
}
function mixS(...vals) { let h = 0x9E3779B9 | 0; for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; } return h >>> 0; }
/** The League members waiting to be caught in a run of this seed: met, wild and not had, in a seeded order, five at most
 *  (the 2D game's rule: js/expedition/capture.js pendingOf). o: { L, Sv, base, max, rng: (seed) -> () => 0..1 }. */
export function wildOf(seed, o) {
	const list = o.Sv.list('league.wild').map(Number).filter((d) => o.L.BY[d] && !hasMember(d, o)).sort((a, b) => a - b), rng = o.rng(mixS(seed | 0, 0x1EA6));
	for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
	return list.slice(0, o.max || 5);
}
/** Caught in a run: a member of your League from this moment (the 2D game's keys; its species joins the collection when
 *  the 2D game next claims: meta.js claim3d). */
export function catchOps(member) { return [['add', 'league.own', String(member)], ['bump', 'cap.league', 1]]; }
/** A shiny caught in a run: kept at once, as the 2D game keeps it (its species, the count, and its family's shiny for the
 *  League). fam: its League family's first stage, or 0. */
export function shinyOps(dex, fam) { return [['add', 'shiny.caught', String(dex)], ['bump', 'cap.shiny', 1]].concat(fam ? [['add', 'league.shiny', String(fam)]] : []); }
/** After a run: every member whose challenge is now complete is MET, and wild until caught (the 2D game's rule:
 *  js/expedition/league.js checkChallenges, with `hasMember` for what you have). -> the newly met */
export function newlyMet(o) {
	const { L, Sv } = o, out = [];
	for (let pass = 0; pass < 2; pass++) for (const m of L.D.members) {
		if (!m.ch || L.met(m.dex) || hasMember(m.dex, o)) continue;
		if (L.progress(m.ch).done && Sv.add('league.met', m.dex)) { out.push(m.dex); if (L.K.CATCH) Sv.add('league.wild', m.dex); }
	}
	if (out.length) Sv.commit();
	return out;
}
/** May a run START as this later stage of its family? One you own in the base collection, or a run has evolved into. */
export const hasForm = (form, o) => o.Sv.has('league.form', String(form)) || !!(o.base && o.base.owned && o.base.owned[form]);
/** Does the save have this member, this map and this tier? o: { L: G.ExpLeague, T: G.ExpTier, Sv: G.ExpSave, base: the
 *  base save as read (never written) from this browser, or null }. -> null, or what is missing. */
export function missing(S, o) {
	const { L, T, Sv, base } = o;
	if (!S.lg) return 'league';
	if (!hasMember(S.lg.member, o)) return 'member';
	if (S.lg.start && !hasForm(S.lg.start, o)) return 'form';
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
	// the level-ups' counters (js/expedition/levelups.js record)
	if (S.lv) {
		const pl = S.w.pl; let picks = 0, items = 0;
		for (const [, kind, , ti] of S.lv.log) {
			if (kind === 'up' || kind === 'new' || kind === 'vit' || kind === 'swap') { picks++; bump('lv.rar.' + ((ti | 0) + 1)); }
			if (kind === 'swap') bump('lv.swaps');
			if (kind === 'item') items++;
			if (kind === 'skip') bump('lv.skips');
		}
		bump('lv.cards', picks); bump('lv.items', items);
		if (pl.xv) best('lv.vitmax', pl.xv.reduce((a, x) => Math.max(a, x.lvl), 0));
		if (S.L) best('lv.move8', pl.moves.filter((m) => (m.xlv || 1) >= S.L.MK.MAX_LV).length);
		if (pl.xi) best('lv.stacks', Object.values(pl.xi).reduce((a, n) => a + n, 0));
	}
	// the economy's (js/expedition/economy.js record)
	if (S.eco) {
		bump('eco.earned', S.eco.earned); best('eco.best', S.eco.earned); bump('eco.spent', S.eco.spent);
		for (const k of ['balls', 'shop', 'altars', 'freed', 'rocks', 'berries', 'ditto', 'hypno', 'spins', 'slotWins', 'ambush', 'respawns']) bump('eco.' + k, S.eco.log[k] || 0);
	}
	// the capture's (js/expedition/capture.js record)
	if (S.cap) {
		const L = S.cap.log;
		bump('cap.alpha', L.alpha); best('sa.best', L.best); for (const a of S.cap.sa) add('sa.types', a.type);
		bump('shiny.seen', L.seen); bump('cap.fled', L.fled);
	}
	// research (js/expedition/meta.js record): each family's points
	for (const [fam, pts] of o.research || []) bump('rs.' + fam, pts);
	// the tasks' metrics of this run, for the 2D game to count (meta.js claim3d -> taskRun)
	{
		const T3 = 'm3d.t.' + o.dev + '.', X3 = 'm3d.x.' + o.dev + '.', gen = (o.seen | 0) + 1, cap = S.cap ? S.cap.log : null, eco = S.eco ? S.eco.log : null;
		bump(T3 + 'runs'); bump(T3 + 'kos', sum.kills); bump(T3 + 'secs', t); bump(T3 + 'wins', S.won ? 1 : 0);
		if (!S.surv) bump(T3 + 'guardians', S.bosses.filter((b) => b.zone <= 3 && b.down != null).length);
		if (eco) { bump(T3 + 'balls', eco.balls); bump(T3 + 'altars', eco.altars); bump(T3 + 'freed', eco.freed); }
		if (cap) { bump(T3 + 'alphas', cap.alpha); bump(T3 + 'catches', S.cap.n); }
		if (S.lg) { bump(T3 + 'evos', S.lg.evo); bump(T3 + 'megas', S.lg.mega ? 1 : 0); bump(T3 + 'finals', o.final ? 1 : 0); }
		if (S.surv && S.sv) { bump(T3 + 'miles', S.sv.downs); best(X3 + 'ssecs', gen * 1e6 + Math.min(999999, t)); }
		else best(X3 + 'zone', gen * 1e6 + Math.min(4, S.zone));   // (a single run's best, since the 2D game last counted: its count is in the number)
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
/** What to ask the server for a 3D board. view: 'score' | 'time' | 'survival'. */
export function boardAsk(map, diff, view) { return Object.assign({ mode: SV.BOARD, d3: true, map, diff, rules: SV.RULES }, view && view !== 'score' ? { board: view } : {}); }
/** The server's rows, for the screen: ten, and yours. body: { top, you }; nameOf(dex); me: your name. */
export function boardRows(body, nameOf, me) {
	const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, row = (e, rank) => ({ rank, name: e.name || '?', who: nameOf(e.dex) + (e.level ? ' Lv ' + e.level : ''), time: mmss(e.time || 0), score: Math.floor(e.score != null ? e.score : e.time || 0).toLocaleString('en-US'), me: e.name === me });
	const rows = (body.top || []).slice(0, 10).map((e, i) => row(e, i + 1));
	if (body.you && body.you.rank > 10) rows.push(row({ ...body.you, name: me }, body.you.rank));
	return rows;
}
/** Why a run was not kept, for the run's end. */
export const WHY = { league: 'Practice run (not a League run): nothing is saved.', member: 'You do not have this League member yet: nothing is saved.', form: 'You have not reached this form yet: nothing is saved.', map: 'This map is not open in your save yet: nothing is saved.', tier: 'This tier is not open in your save yet: nothing is saved.',
	unclean: 'This run could not be verified: nothing is saved.', nosave: 'Your save could not be opened: nothing is saved.', practice: 'Practice run (a test setting is on): nothing is saved.', guest: 'You were a guest in this run: the host\'s save keeps it.' };
