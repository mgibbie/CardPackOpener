// divesave.js — MicaSurvivor 3D, Dive part 6 (Plans/MICASURVIVOR_3D_PLAN.md §5.58): what a 3D Dive leaves behind.
// Owner, 2026-11-12: a 3D run pays into the SAME save as a 2D one. So a Dive writes the Expedition save with the 2D
// Dive's own keys (js/expedition/dive.js record, and its V7 rules):
//   dive.runs, dive.escapes, dive.rescued      counters
//   dive.<route>.best                          the deepest floor reached on the route
//   dive.<route>.stage                         the floor after its deepest guardian beaten (26, 51, …): a Dive may
//                                              start on floor 1 or on any stage reached
//   dive.seal (a set of routes)                the first guardian beaten on a route awakens its Seal: on that route,
//                                              +10 % damage and -10 % damage taken. All 8 open the Route of Origin.
// Its pay is OWED to this browser, as an Expedition's (expsave.js: `pay3d.<device>`; the 2D game pays it into the wallet
// the next time the Expedition opens here): the loot kept, in Pokémonedas by the 2D game's scale.
// A guardian's stage and Seal are kept the moment it falls (guardianOps), as the 2D game keeps them: closing the page
// after it does not lose them.
// A Dive is kept only if it is FAIR: no test parameters, as a League member you have, on a route that is open, and
// CLEAN (expsave.js clean). A start floor the save does not have becomes floor 1.
// THE REST (part 13), as an Expedition writes them: research (o.research), the level-ups', the reactions' and the Ultimates'
// counters, and the run's metrics for the daily and weekly tasks (the 2D game counts them: expsave.js).
// THE LEAGUE (part 10): a Dive as a member writes the League's counters and the forms it reached, as an Expedition does.
// THE BOARDS (part 7): a kept Dive of a signed-in player is posted to the 3D board of its route (the server's Dive
// boards with `d3: true`: the deepest floor, then the shorter time), and the end screen and the menu show it.
// THE WEEKLY DIVE (part 15): it keeps no record, stage, Seal or rescued (the 2D game's rule): the save counts it
// (dive.weekly) and pays it, and its mark goes to this week's 3D board.
// Pure: the page (main.js) hands in the run, its result and the save.
import { hasMember, hasForm } from './expsave.js';

export const DSV = { OK: ['dive', 'route', 'floor', 'dex', 'form', 'weekly', 'debug'], SCALE: 3 /* the 2D game's meta.js K.SCALE (coinsOf); expedition.js XK.PAY.SCALE */ };

/** The first parameter of the page's address that makes its Dive a practice run (null: none). params: [[key, value]]. */
export function unfairDive(params) { for (const [k] of params) if (!DSV.OK.includes(k)) return k; return null; }
/** Pokémonedas for n pay units (the 2D game's coinsOf). */
export const coinsOf = (n, scale = DSV.SCALE) => Math.max(0, Math.round(n * scale / 5) * 5);
export const stageOf = (Sv, route) => Sv.get('dive.' + route + '.stage') || 0;
export const bestOf = (Sv, route) => Sv.get('dive.' + route + '.best') || 0;
export const sealOf = (Sv, route) => !!Sv.has('dive.seal', route);
/** Is the route open? The Route of Origin needs every Seal of `main` (the 2D game's MAIN). */
export const routeOpen = (Sv, route, main) => route !== 'origin' || main.every((r) => sealOf(Sv, r));
/** The start floors open on a route: 1, then every stage reached (26, 51, …). */
export function starts(Sv, route) { const out = [1], st = stageOf(Sv, route); for (let f = 26; f <= st; f += 25) out.push(f); return out; }
/** The start a Dive really gets: the pick if the save has that stage, else 1. */
export const startOf = (Sv, route, want) => (starts(Sv, route).includes(want | 0) ? want | 0 : 1);

/** Why this Dive cannot be kept (null: it can). o: { L: G.ExpLeague, Sv: G.ExpSave, base, main, member } */
export function missing(S, o) {
	if (!o.member || !hasMember(o.member, o)) return 'member';
	if (S.lg && S.lg.start && !hasForm(S.lg.start, o)) return 'form';   // (it started as a later stage: one you have reached)
	if (S.weekly) return null;   // (the Weekly Dive: its own route, from floor 1, for everyone)
	if (!routeOpen(o.Sv, S.route, o.main)) return 'route';
	if (S.start > 1 && !starts(o.Sv, S.route).includes(S.start)) return 'start';
	return null;
}
/** A guardian fell: its stage and its route's Seal, kept at once. */
export function guardianOps(S) { return S.stage > 0 && !S.weekly ? [['best', 'dive.' + S.route + '.stage', S.stage], ['add', 'dive.seal', S.route]] : []; }
/** What the Dive writes into the Expedition save at its end: [['bump' | 'best' | 'add', key, value]].
 *  res: dive.js result(S). o: { dev: this browser's id, research: [[family, points]], seen: the 3D runs the 2D game has
 *  counted from this browser (m3d.seen.<dev>), final: the run ended at its line's last stage } */
export function recordOps(S, res, o) {
	const ops = [], bump = (k, n = 1) => { n = Math.floor(n); if (n > 0) ops.push(['bump', k, n]); }, best = (k, v) => { v = Math.floor(v); if (v > 0) ops.push(['best', k, v]); };
	const p = res.parts, k = 'dive.' + S.route;
	bump('dive.runs'); if (p.escaped) bump('dive.escapes');
	if (S.weekly) bump('dive.weekly');   // (it keeps no record, stage, Seal or rescued)
	else { best(k + '.best', p.deepest); ops.push(...guardianOps(S)); bump('dive.rescued', p.rescued); }
	// the League's (as an Expedition's, expsave.js): the forms reached are yours from now on
	if (S.lg) {
		const G = S.lg, add = (set, id) => ops.push(['add', set, String(id)]);
		bump('lg.evo', G.evo); best('lg.mat', G.mat); best('lg.lv', S.w.pl.level);
		bump('lg.runs.' + G.member); best('lg.best.' + G.member, S.w.pl.level);
		add('league.played', G.member); add('league.form', G.form);
		for (const e of G.log) if (e[1] === 'evo') add('league.form', e[2]);
		if (G.mega) { bump('lg.mega'); add('mega.seen', G.mega); }
	}
	// the level-ups' counters (js/expedition/levelups.js record; as expsave.js)
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
		if (pl.xi) best('lv.stacks', Object.values(pl.xi).reduce((a, n) => a + n, 0));
	}
	// the economy's (js/expedition/economy.js record)
	if (S.eco) { bump('eco.earned', S.eco.earned); best('eco.best', S.eco.earned); bump('eco.spent', S.eco.spent); for (const key of ['shop', 'rocks', 'berries']) bump('eco.' + key, S.eco.log[key] || 0); }
	for (const [fam, pts] of o.research || []) bump('rs.' + fam, pts);   // (research: each family's points)
	if (S.rx) { for (const key of Object.keys(S.rx.by)) bump('rx.' + key, S.rx.by[key]); bump('rx.total', S.rx.n); }
	if (S.ult) { bump('ult.casts', S.ult.casts); best('ult.best', S.ult.casts); bump('ult.sig', S.ult.sigs); }
	// the tasks' metrics of this run, for the 2D game to count (meta.js claim3d -> taskRun; a 2D Dive counts these too)
	{
		const T3 = 'm3d.t.' + o.dev + '.', X3 = 'm3d.x.' + o.dev + '.', gen = (o.seen | 0) + 1;
		bump(T3 + 'runs'); bump(T3 + 'kos', p.kills); bump(T3 + 'secs', p.time);
		if (S.lg) { bump(T3 + 'evos', S.lg.evo); bump(T3 + 'megas', S.lg.mega ? 1 : 0); bump(T3 + 'finals', o.final ? 1 : 0); }
		if (S.rx) bump(T3 + 'reactions', S.rx.n);
		if (S.ult) bump(T3 + 'casts', S.ult.casts);
		best(X3 + 'zone', gen * 1e6 + Math.min(4, p.zone | 0));   // (a single run's best, since the 2D game last counted)
	}
	// 3D's own: one more 3D run from this browser, and its pay owed to it (the 2D game pays it into the wallet)
	bump('m3d.n.' + o.dev);
	const pay = coinsOf(p.divePay);
	if (pay > 0) { bump('pay3d.' + o.dev, pay); best('pay.best', pay); }
	return ops;
}
/** The Dive as its 3D board takes it (server/mp.mjs, the Dive boards). o: { dv, board } */
export function scoreBody(S, res, o) {
	const p = res.parts, pl = S.w.pl;
	return { mode: o.board, d3: true, expMode: 'exp-dive', dv: o.dv, route: p.route, floor: p.deepest, start: p.start || 1, time: Math.floor(p.time || 0), escaped: !!p.escaped, kills: Math.floor(p.kills || 0), level: Math.floor(pl.level || 1), dex: pl.mon.dex | 0, shiny: false, ...(p.weekly != null ? { weekly: true, week: p.weekly, start: 1 } : {}) };
}
/** What to ask the server for a route's 3D Dive board. */
export const boardAsk = (route, board, week = null) => Object.assign({ mode: board, d3: true, expMode: 'exp-dive', board: 'dive' }, week != null ? { weekly: true, week } : { route });
/** The server's rows, for the screen: ten, and yours. body: { top, you }; nameOf(dex); me: your name. */
export function boardRows(body, nameOf, me) {
	const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, row = (e, rank) => ({ rank, name: e.name || '?', who: nameOf(e.dex) + (e.level ? ' Lv ' + e.level : ''), time: mmss(e.time || 0), score: 'Floor ' + Math.floor(e.floor || 0) + (e.escaped ? ' ↑' : ''), me: e.name === me });
	const rows = (body.top || []).slice(0, 10).map((e, i) => row(e, i + 1));
	if (body.you && body.you.rank > 10) rows.push(row({ ...body.you, name: me }, body.you.rank));
	return rows;
}
export const WHY = { practice: 'Practice run (a test parameter in the address): nothing is saved.', nosave: 'Your save could not be opened: nothing is saved.', unclean: 'This run could not be checked: nothing is saved.',
	member: 'You do not have this League member yet: nothing is saved.', form: 'You have not reached this form yet: nothing is saved.', route: 'This route is not open in your save yet: nothing is saved.', start: 'Your save has not reached this stage yet: nothing is saved.' };
