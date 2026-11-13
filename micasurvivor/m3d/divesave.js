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
// Not here yet: the 3D boards for a Dive, the Weekly Dive, the tasks' and the level-ups' counters.
// Pure: the page (main.js) hands in the run, its result and the save.
import { hasMember } from './expsave.js';

export const DSV = { OK: ['dive', 'route', 'floor', 'dex', 'debug'], SCALE: 3 /* the 2D game's meta.js K.SCALE (coinsOf); expedition.js XK.PAY.SCALE */ };

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
	if (!routeOpen(o.Sv, S.route, o.main)) return 'route';
	if (S.start > 1 && !starts(o.Sv, S.route).includes(S.start)) return 'start';
	return null;
}
/** A guardian fell: its stage and its route's Seal, kept at once. */
export function guardianOps(S) { return S.stage > 0 ? [['best', 'dive.' + S.route + '.stage', S.stage], ['add', 'dive.seal', S.route]] : []; }
/** What the Dive writes into the Expedition save at its end: [['bump' | 'best' | 'add', key, value]].
 *  res: dive.js result(S). o: { dev: this browser's id } */
export function recordOps(S, res, o) {
	const ops = [], bump = (k, n = 1) => { n = Math.floor(n); if (n > 0) ops.push(['bump', k, n]); }, best = (k, v) => { v = Math.floor(v); if (v > 0) ops.push(['best', k, v]); };
	const p = res.parts, k = 'dive.' + S.route;
	bump('dive.runs'); if (p.escaped) bump('dive.escapes');
	best(k + '.best', p.deepest);
	ops.push(...guardianOps(S));
	bump('dive.rescued', p.rescued);
	// 3D's own: one more 3D run from this browser, and its pay owed to it (the 2D game pays it into the wallet)
	bump('m3d.n.' + o.dev);
	const pay = coinsOf(p.divePay);
	if (pay > 0) { bump('pay3d.' + o.dev, pay); best('pay.best', pay); }
	return ops;
}
export const WHY = { practice: 'Practice run (a test parameter in the address): nothing is saved.', nosave: 'Your save could not be opened: nothing is saved.', unclean: 'This run could not be checked: nothing is saved.',
	member: 'You do not have this League member yet: nothing is saved.', route: 'This route is not open in your save yet: nothing is saved.', start: 'Your save has not reached this stage yet: nothing is saved.' };
