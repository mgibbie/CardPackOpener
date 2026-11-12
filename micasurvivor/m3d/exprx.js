// exprx.js — MicaSurvivor 3D, Expedition: the elemental reactions and the weather's boosts (the 2D game's DLC D8).
//
// The 2D game's own numbers (js/expedition/reactions.js, G.ExpRx.K), read through rxFrom(G). Its radii are 2D pixels
// (16 a study metre): × U here, as every other length of the 2D game's.
//
//   marks      a Water hit leaves a foe WET for 4 s; an Ice hit adds a CHILL stack (3 stacks, or 1 on a wet foe, freeze
//              it for 1.6 s). Burn, poison, freeze, paralysis, sleep and confusion are the fight's own (combat.js).
//   reactions  one a hit, each with a 0.25 s cool-down per foe:
//                Electrocuted      Electric on a wet foe: × 1.5, and it chains to up to 12 other wet foes within 9 m
//                                  (half the hit each, paralysis 60 %)
//                Steam             Water on a burning foe: × 1.4, confuses and roots the foes within 6 m (the burn goes out)
//                Inferno           Grass or Flying on a burning foe: the burn spreads to the foes within 7 m
//                Wreckage          Fighting, Rock or Steel on a frozen foe: × 2.6 (the ice shatters)
//                Poison Gas        Fire on a poisoned foe: × 1.3, and the foes within 6 m are poisoned
//                Psychic Meltdown  Psychic on a confused or sleeping foe: × 1.6
//                Dragon Rage       Dragon on a foe with 2 or more statuses (wet and chill count): × 1.8
//   weather    on top of the fight's own weather: Sun boosts Grass and Fog boosts Dark (× 1.3), and while the weather
//              favours one of your Pokémon's types all its hits do + 10 % (× the weather's fade in and out).
//
// All through the fight's `out` seam (combat.js land: a factor on the hit before it lands), so the hit's type, crit,
// ability and items stay the fight's. Chance (the chain's paralysis) is the fight's own seeded stream.
// Pure and seeded: no DOM, no clock.
import { U, CK, applyState, wxLevel } from './combat.js';

const WX_NAME = { sun: 'Harsh sun', rain: 'Rain', sand: 'Sandstorm', snow: 'Snow', fog: 'Fog' };

/** The 2D game's reactions, as the 3D run reads them: its numbers, the kinds in its order, their names and colours. */
export function rxFrom(G) {
	const R = G.ExpRx; if (!R) return null;
	const en = G.ExpEN || {};
	return { K: R.K, KINDS: R.KINDS.slice(), COL: R.COL, NAME: Object.fromEntries(R.KINDS.map((k) => [k, en[R.NAME[k]] || R.NAME[k]])) };
}

// ---------------------------------------------------------------- marks
export const isWet = (e, t) => (e.xwet || 0) > t;
const chilled = (e, t) => ((e.xchillT || 0) > t ? e.xchill | 0 : 0);
/** How many statuses a foe has (Dragon Rage): burn, poison, freeze, paralysis, sleep, confusion, slow, wet, chill. */
export function statuses(e, t) {
	return (e.burn > 0) + (e.poison > 0) + (e.frozenT > 0) + (e.paraT > 0) + (e.sleepT > 0) + (e.confT > 0) + (e.slow > 0) + isWet(e, t) + (chilled(e, t) > 0);
}
function freeze(S, e) {
	const K = S.X.R.K, was = e.frozenT > 0;
	e.xchill = 0; e.xchillT = 0; e.xwet = 0;
	const d = applyState(S.w, e, 'freeze');
	if (d > 0 && !was) e.frozenT = d * K.FREEZE_T / CK.CC.freeze;   // (the fight's freeze is longer: this one is the cold's 1.6 s; a boss's is shorter still, as every state of its)
	if (d > 0) S.w.events.push({ k: 'rx', kind: 'frozen', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z });
	return d > 0;
}
/** An Ice hit: one more chill stack (a wet foe freezes at once). -> did it freeze? */
export function chill(S, e, t = S.w.t) {
	const K = S.X.R.K;
	if (isWet(e, t)) return freeze(S, e);
	e.xchill = chilled(e, t) + 1; e.xchillT = t + K.CHILL_T;
	return e.xchill >= K.CHILL_N ? freeze(S, e) : false;
}

// ---------------------------------------------------------------- the weather
/** The types a weather favours: the fight's own (a factor above 1) and the two it lacks. */
export function favoured(S, kind) {
	const W = S.data.weatherKinds[kind]; if (!W) return [];
	return Object.keys(W.mult || {}).filter((t) => W.mult[t] > 1).concat(Object.keys(S.X.R.K.WX_EXTRA[kind] || {}));
}
/** The weather's factor on a hit of type `t` by a Pokémon of types `who`, on top of the fight's own. -> { k, extra, self } */
export function wxK(S, t, who) {
	const w = S.w, K = S.X.R.K, lv = wxLevel(w);
	if (!w.weather || !(lv > 0)) return { k: 1, extra: 1, self: 1 };
	const X = K.WX_EXTRA[w.weather.kind], extra = X && X[t] ? 1 + (X[t] - 1) * lv : 1;
	const fav = favoured(S, w.weather.kind), self = (who || []).some((x) => fav.includes(x)) ? 1 + K.WX_SELF * lv : 1;
	return { k: extra * self, extra, self };
}

// ---------------------------------------------------------------- the seam
const within = (w, e, r, self) => w.enemies.filter((o) => !o.dead && (self || o !== e) && Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z) <= r);
/** Reaction `rx` on foe `e` (`d`: the hit before the reaction's own factor). -> that factor */
export function react(S, rx, e, d) {
	const w = S.w, K = S.X.R.K, t = w.t;
	let k = 1;
	if (rx === 'electro') {
		const P = K.ELECTRO, D = (o) => Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z);
		k = P.k; e.xwet = 0;
		const others = within(w, e, P.r * U).filter((o) => isWet(o, t)).sort((a, b) => D(a) - D(b) || a.id - b.id).slice(0, P.n);
		const links = [];
		for (const o of others) {
			o.xwet = 0; links.push([o.a.x, o.a.y, o.a.z]);
			const dd = w.hit(o, d * k * P.share, 0, 0, 0);
			if (dd > 0) w.events.push({ k: 'hit', id: o.id, x: o.a.x, y: o.a.y + 0.5, z: o.a.z, d: dd, crit: false, type: 'electric', eff: 1 });
			const para = w.rand() < P.para;   // (drawn whether it lives or not: the stream does not depend on who fell)
			if (para && !o.dead) applyState(w, o, 'para');
		}
		S.rx.chain = others.length;
		if (links.length) w.events.push({ k: 'rxchain', from: [e.a.x, e.a.y, e.a.z], links });
	} else if (rx === 'steam') {
		const P = K.STEAM;
		k = P.k; e.burn = 0; e.burnT = 0;
		for (const o of within(w, e, P.r * U, true)) { applyState(w, o, 'conf'); o.slow = Math.max(o.slow, P.root); o.slowT = Math.max(o.slowT, P.rootT); }
	} else if (rx === 'inferno') {
		const P = K.INFERNO;
		k = P.k;
		for (const o of within(w, e, P.r * U)) { o.burn = Math.min(8, o.burn + P.burn); o.burnT = 3; }
	} else if (rx === 'wreck') {
		k = K.WRECK.k; e.frozenT = Math.min(e.frozenT, 0.01);
	} else if (rx === 'gas') {
		const P = K.GAS;
		k = P.k;
		for (const o of within(w, e, P.r * U)) { o.poison = Math.min(8, o.poison + P.poison); o.poisonT = 4; }
	} else if (rx === 'melt') k = K.MELT.k;
	else if (rx === 'rage') k = K.RAGE.k;
	const A = { electro: 'ELECTRO', steam: 'STEAM', inferno: 'INFERNO', gas: 'GAS' }[rx];
	S.rx.by[rx] = (S.rx.by[rx] || 0) + 1; S.rx.n++; S.rx.log.push(rx); if (S.rx.log.length > 40) S.rx.log.shift();
	w.events.push({ k: 'rx', kind: rx, id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, r: A ? K[A].r * U : 0 });
	return k;
}
/** Which reaction a hit of type `t` sets off on foe `e` now (null: none). */
export function reactionOf(S, t, e, tm = S.w.t) {
	const K = S.X.R.K;
	if (t === 'electric' && isWet(e, tm)) return 'electro';
	if (t === 'water' && e.burn > 0) return 'steam';
	if ((t === 'grass' || t === 'flying') && e.burn > 0) return 'inferno';
	if ((t === 'fighting' || t === 'rock' || t === 'steel') && e.frozenT > 0) return 'wreck';
	if (t === 'fire' && e.poison > 0) return 'gas';
	if (t === 'psychic' && (e.confT > 0 || e.sleepT > 0)) return 'melt';
	if (t === 'dragon' && statuses(e, tm) >= K.RAGE.n) return 'rage';
	return null;
}
/** The fight's `out` seam: the factor on a hit of yours on foe `e` from `src`; `dmg` is the hit so far. The weather, at
 *  most one reaction, then the hit's own marks (wet, chill). */
export function rxOut(S, e, src, dmg) {
	const w = S.w, K = S.X.R.K;
	if (w.guest || !e || e.dead || !src) return 1;
	const t = src.mtype || src.type; if (!t) return 1;
	const tm = w.t;
	let k = wxK(S, t, src.xsa || w.pl.mon.types).k;
	const rx = reactionOf(S, t, e, tm);
	if (rx) {
		const cd = e.xrxT || (e.xrxT = {});
		if (!(cd[rx] > tm)) { cd[rx] = tm + K.CD; k *= react(S, rx, e, dmg * k); }
	}
	if (t === 'water' && rx !== 'steam') e.xwet = tm + K.WET_T;
	if (t === 'ice') chill(S, e, tm);
	return k;
}

// ---------------------------------------------------------------- the run
/** Reactions for this run: chained after whatever already stands at the fight's `out` seam. */
export function setupRx(S) {
	const w = S.w; if (!S.X.R) return null;
	S.rx = { n: 0, by: {}, log: [], chain: 0, wx: null };
	const hooks = w.hooks || (w.hooks = {}), prev = hooks.out;
	hooks.out = (ww, e, src, dmg) => { const k0 = prev ? prev(ww, e, src, dmg) : 1; return k0 * rxOut(S, e, src, dmg * k0); };
	return S.rx;
}
/** Each step: the weather boost's banner (once a weather, when it favours your Pokémon). */
export function tickRx(S) {
	const w = S.w, R = S.rx; if (!R) return;
	if (!w.weather) { R.wx = null; return; }
	if (R.wx === w.weather.kind) return;
	const fav = favoured(S, w.weather.kind);
	if (!(w.pl.mon.types || []).some((x) => fav.includes(x))) return;
	R.wx = w.weather.kind;
	const text = `${WX_NAME[R.wx] || R.wx} boosts your ${w.pl.mon.name}: +${Math.round(S.X.R.K.WX_SELF * 100)}% damage`;
	S.says.push({ text, s: 3 }); w.events.push({ k: 'say', text, s: 3 });
}
/** What a foe carries, for the page to draw: [is it wet?, its chill stacks]. */
export const marksOf = (e, t) => [isWet(e, t), chilled(e, t)];
