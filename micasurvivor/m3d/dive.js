// dive.js — MicaSurvivor 3D, Dive (Plans/MICASURVIVOR_3D_PLAN.md §5.54): a Dive run, floor by floor.
//
// Owner, 2026-11-12: today's Dive in 3D. So the rules are the 2D game's own (js/expedition/dive.js), read through
// rulesFrom(G): its numbers (K), its species curve (pool), its guardians, its Mega and legendary draws, and its seeded
// streams, drawn in the same order, so the same {seed, route, floor} holds the same foes in both games. The floor is
// divegen.js's room (the 2D layout raised into 3D); the fight is combat.js's.
//
//   floors     walk to the STAIRS and stand on them K.STAIRS_T s: the next floor. Nothing of the old one comes along.
//   foes       the floor's groups SLEEP where the layout put them until you come within K.WAKE_R tiles or hit one; a
//              group wakes together, and wakes the groups within K.WAKE_CHAIN of it (one hop). From floor K.ELITE.from
//              a plain foe may be an elite (swift, tough or rage).
//   pressure   K.REIN.grace s after you arrive, packs keep arriving, awake, faster each time (little XP, no loot).
//   alpha      every 5th floor: a big foe by the stairs; the stairs are SEALED until it falls. To floor 25 its fall
//              SECURES your loot.
//   guardian   every 25th floor: the route's legendary; its fall banks everything and saves the stage.
//   Megas, legendaries   below floor K.MEGA.from a floor may hold a Mega; from K.LEGEND.from a legendary (with a pity).
//   rescue     reach the floor's lost Pokémon and it follows you; leave the floor with it near and it is rescued.
//   loot       at stake until an alpha (to floor 25) or a guardian banks it. Faint: the bank and a quarter of the stake.
//   the rope   on a rope floor, stand still K.ROPE_T s in the circle where you arrived (a hit cancels): you leave
//              with everything.
//   the kit    (part 4) three moves: the first fires by itself (the basic); the second and third are SPECIALS, fired when
//              pressed (pressSpecial), at your target, worth K.SPECIAL_K. A press up to K.BUFFER s before the cool-down
//              ends is kept; a press with no foe in reach is kept K.HOLD s.
//   the dodge  (part 4) slide = dodge: DODGE.T s the way you push (or face), nothing can hurt you, DODGE.CD s to cool.
//   the combo  (part 4) KOs within COMBO.WINDOW s chain: more XP a step, loot every COMBO.MILESTONE.
//   chests     (part 5) the floor's chests are free Poké Balls: stand by one OPEN_T s and it gives one item.
//   pockets    (part 5) a BOULDER breaks for a Rock / Ground / Fighting / Steel Pokémon, a THICKET burns for a Fire
//              type: stand against it PLUG.T s. Behind it, a pocket with a chest.
//   landmarks  (part 5) the route's own, on some floors: stand on it LM.T s, once (LANDMARKS below).
//   learning   (part 8) at levels 4, 10, 16… the level's cards are a new special: "learn X, forget special 1", "… special 2",
//              or train and keep your moves. X is your League member's next kit move, then a move of your types.
//   red ground (part 9) a brawler that reaches you winds up a SLAM (a red circle, TELE.slam s, then all inside are hit); an alpha
//              or a guardian slams wider and CHARGES (a red lane, then a dash along it). It holds still while winding up.
//              Dodge or step out.
//   the League (part 10) o.league: you dive as a League member: its stats and role, its kit's first three moves from the
//              start (PokéDive's: the basic and both specials), its evolutions at their levels, Maturity, its Mega.
//   the save   (part 6) divesave.js: the deepest floor, the stage, the Seal (o.seal: +10 % damage, -10 % taken), the pay.
// Not here yet (later parts): a new special at levels 4, 10, 16…, the League, the red ground, the stall, the bushes
// and the gold rocks, routes and stages in the save, the Weekly Dive, co-op.
// Pure and seeded: no DOM, no clock.
import { K as SK, CELL, groundAt, newState, setCell } from './sim.js';
import { CK, U, newWorld, tick, addEnemy, addBoss, gainXp, canFire, hurtPlayer } from './combat.js';
import { setup as setupLevels, tickStats, takeItem, newCard, moveCands, trainCards } from './explevel.js';
import { rollOffers } from './expeco.js';
import { setupRx, tickRx } from './exprx.js';
import { setupUlt, holdUlt, tickUlt } from './expult.js';
import { applyPerks, perkTools } from './expperks.js';
import { memberOf, setupLeague, learnKit, processLeague } from './expleague.js';
import { tickFog } from './expfog.js';
import { diveFrom, diveRoom } from './divegen.js';
import { walkable } from './expedition.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = 6.2832;
/** The dodge: the 2D game's (js/expedition/verbs.js DODGE_T, DODGE_CD, DODGE_TILES: tiles a second). */
export const DODGE = { T: 0.2, CD: 1.2, TILES: 15.6 };
const ROPE_STILL = 0.5;   // m/s: slower than this is standing still (the rope)

/** The 2D game's Dive rules, as the 3D game reads them (G with systems/expedition.js, expedition/dive-gen.js and
 *  expedition/dive.js loaded). -> { F (the floors: divegen.js), K, pool, target, guardianOf, megaRoll, legendRoll,
 *  rng(seed, route, floor, k) (the 2D game's own stream), nameOf(route) (English) } */
export function rulesFrom(G) {
	const E = G.ExpDive, F = diveFrom(G); if (!E || !F) return null;
	const en = (G.I18n && G.I18n.en) || {}, tr = (s) => en[s] || s;
	return { F, K: E.K, ESCORT: E.ESCORT, GUARDIANS: E.GUARDIANS, COMBO: E.COMBO, PLUG: E.PLUG, LM: E.LM, SEAL: E.SEAL, MAIN: E.MAIN.slice(), LEARN_AT: E.LEARN_AT, TELE: E.TELE, target: E.target, pool: (route, floor) => E.pool(route, floor), guardianOf: E.guardianOf,
		megaRoll: (seed, route, f) => E.megaRoll(seed, route, f), legendRoll: (seed, route, f) => E.legendRoll(seed, route, f),
		rng: (seed, route, floor, k) => G.DLC.rng(G.DiveGen.seedOf(seed | 0, route, floor, k)), nameOf: (route) => tr(E.NAME[route] || route),
		strays: (route, floor) => { const tg = E.target(floor) - 60, types = F.ROUTES[route].types; return G.DEX.filter((p) => !p.leg && Math.abs(p.bst - tg) < 70 && p.types.some((t) => types.includes(t))).map((p) => p.dex); } };
}
const draw = (P, r) => { const v = r() * P.sum; for (const [d, c] of P.list) if (c >= v) return d; return P.list[P.list.length - 1][0]; };
export const say = (S, text, s = 3) => { S.says.push({ text, s }); S.w.events.push({ k: 'say', text, s }); };
const name = (S, dex) => { const m = S.data.mon(dex); return m ? m.name : ''; };
const tiles = (n) => n * CELL;

/** A Dive run. o: { route, seed, start (the floor to begin on), and combat.js's newWorld options (dex, moves [id or
 *  [id, level]], ability, items, autoPick, …); levels: false keeps the base game's level-ups; perks; rx / ult: false
 *  leave the reactions / the Ultimates out }.
 *  -> the run: { w (the fight), route, seed, floor, bank, stake, rescued, groups, boss, sealed, stray (the lost
 *  Pokémon), ended, escaped, lost (you fainted), says } */
export function newDive(data, X, R, o = {}) {
	const route = R.F.ROUTES[o.route] ? o.route : 'forest', seed = (o.seed | 0) || 1, f0 = Math.max(1, o.start | 0);
	const room = diveRoom(R.F, seed, route, f0);
	const own = !!(X && X.L) && o.levels !== false, league = own && !!X.G && !!o.league && o.kit !== false, member = league ? memberOf(X.G, o.dex || 25) : 0;
	const lv = league ? [] : (o.moves || []).map((m) => (Array.isArray(m) ? m : [m, 1]));
	const w = newWorld(room, data, { ...o, dex: league ? member : o.dex, moves: own ? lv.map((m) => m[0]) : o.moves, seed: seed >>> 0, cast: null, bosses: null,
		ability: league && o.ability === undefined ? X.G.abilityOf(X.G.finalsOf(X.G.BY[member])[0]) : o.ability });   // (a member has its final stage's ability all run)
	const S = { w, X, R, data, dive: true, route, map: 'dive:' + route, seed, floor: 0, zone: f0, start: f0, bank: 0, stake: 0, rescued: [], rescuedBank: 0, kills: 0, alphas: 0, guardians: 0,
		deepest: 0, ended: false, escaped: false, lost: false, won: false, groups: [], boss: null, sealed: false, stray: null, tags: new Map(), says: [], legPity: 0, stage: 0, meta: null };
	if (o.perks) applyPerks(S, o.perks);
	if (own) setupLevels(S, X.L, lv);
	if (S.up) perkTools(S);
	if (league) { S.maxMoves = R.K.SLOTS; setupLeague(S, member, 0); for (let i = 1; i < R.K.SLOTS; i++) learnKit(S, i); }   // (part 10: the basic and both specials from the start)
	if (X && X.R && o.rx !== false) setupRx(S);
	if (X && X.Uu && o.ult !== false) setupUlt(S, { walk: walkable, auto: !!o.ultAuto });
	// the kit, the dodge, the combo
	S.kit = o.kit !== false; S.dodge = { t: 0, cd: 0, dx: 0, dz: 0, n: 0, held: false }; S.combo = { n: 0, t: 0, best: 0, k: 1 }; S.spare = [];
	{ const hooks = w.hooks || (w.hooks = {}), hurt0 = hooks.hurt, out0 = hooks.out;
		hooks.hurt = (ww, d) => (S.dodge.t > 0 ? 0 : (hurt0 ? hurt0(ww, d) : d) * (S.seal ? 1 - R.SEAL.TAKEN : 1));
		hooks.out = (ww, e, src, dmg) => { const k0 = out0 ? out0(ww, e, src, dmg) : 1, id = src && (src.mid || src.id); return k0 * (S.kit && id && isSpecial(S, id) ? R.K.SPECIAL_K : 1) * (S.obeliskT > 0 ? 1 + R.LM.OBELISK : 1) * (S.seal ? 1 + R.SEAL.DMG : 1); }; }
	S.seal = !!o.seal;   // (part 6: the route's Seal, from your save)
	S.opened = 0; S.secrets = 0; S.marks = 0; S.obeliskT = 0; S.plugTip = false;
	roles(S);
	if (S.kit && S.lv && w.offerCards) { const offer0 = w.offerCards; S.learnAt = {}; w.offerCards = () => { if (S.lg) { processLeague(S); if (S.lg.pending) return offer0(); } return learnCards(S) || offer0(); }; }   // (a League run: the level's evolution first; a branch to choose is the level's cards)   // (part 8)
	startFloor(S, f0, 0);
	return S;
}

/** The kit's roles, by slot: the first move fires by itself, the next are specials (pressed). More than K.SLOTS moves: the rest are put away. */
function roles(S) {
	const mv = S.w.pl.moves; if (!S.kit) return;
	while (mv.length > S.R.K.SLOTS) S.spare.push(mv.pop());
	mv.forEach((m, i) => { m.xman = i > 0; if (!m.xman) m.xreq = 0; });
}
/** (part 8) The new special of levels 4, 10, 16…: the level's cards, or null on any other level (or with nothing to learn).
 *  X: your League member's kit beyond the first K.SLOTS moves, then a move of your types (the level-ups' own candidates). */
export function learnCards(S) {
	const R = S.R, pl = S.w.pl, X = S.X;
	if (!S.kit || !S.lv || !R.LEARN_AT || !R.LEARN_AT(pl.level) || S.learnAt[pl.level] || pl.moves.length < 2) return null;
	S.learnAt[pl.level] = 1;
	const r = R.rng(S.seed, S.route, pl.level, 0x1EA), has = (id) => pl.moves.some((m) => m.id === id);
	const LG = X && X.G, dex = pl.mon.dex, member = LG ? (LG.BY[dex] ? LG.BY[dex] : LG.BY[LG.FAM[dex]]) : null, kit = member && member.kit ? member.kit : [];
	let id = kit.slice(R.K.SLOTS).find((k) => { const d = k && X.L.def(k); return !!d && canFire(d.kind) && !has(k); }) || null;
	if (!id) { const cs = moveCands(S).filter((c) => !has(c)); if (cs.length) id = cs[Math.floor(r() * cs.length)]; }
	if (!id) return null;
	const cards = [];
	for (let i = 1; i < pl.moves.length; i++) cards.push(newCard(S, id, 0, r, pl.moves[i]));
	const keep = trainCards(S)[0];
	if (keep) cards.push(keep);
	return cards;
}
const isSpecial = (S, id) => S.w.pl.moves.some((m, i) => i > 0 && m.id === id);
/** Special i (1 or 2) pressed: kept if its cool-down is over or nearly. -> true when it will fire */
export function pressSpecial(S, i) {
	const pl = S.w.pl, m = S.kit && !S.ended && !pl.dead && i > 0 ? pl.moves[i] : null;
	if (!m || !m.xman || m.t > S.R.K.BUFFER) return false;
	m.xreq = S.R.K.HOLD + Math.max(0, m.t); return true;
}
/** The specials, for the screen: [{ id, cd (s left), cdMax, queued }] */
export const specials = (S) => (S.kit ? S.w.pl.moves.slice(1).map((m) => ({ id: m.id, cd: Math.max(0, m.t), cdMax: Math.max(0.05, m.cd * S.w.pl.cdMul), queued: m.xreq > 0 })) : []);
/** The dodge, before the fight's tick: slide pressed starts one (the way you push, or face); while it lasts you are carried. -> the input the fight gets */
function dodgeInput(S, input, dt) {
	const D = S.dodge, s = S.w.pl.s, inp = input || { mx: 0, mz: 0, jump: false, crouch: false }, press = !!inp.crouch && !D.held;
	D.held = !!inp.crouch;
	if (D.cd > 0) D.cd = Math.max(0, D.cd - dt);
	if (press && D.t <= 0 && D.cd <= 0 && !S.w.pl.dead) {
		const l = Math.hypot(inp.mx || 0, inp.mz || 0);
		D.dx = l > 0.2 ? inp.mx / l : Math.sin(s.facing); D.dz = l > 0.2 ? inp.mz / l : Math.cos(s.facing);
		D.t = DODGE.T; D.n++; S.w.events.push({ k: 'dodge' }); S.dodgeEv = true;
		// (faster than a body may otherwise go: the speed cap is lifted while it lasts)
		D.tune = S.w.tune; S.w.tune = { ...S.w.tune, MAX_SPEED: Math.max(S.w.tune.MAX_SPEED, DODGE.TILES * CELL) }; S.w.fastK = undefined;
	}
	if (D.t > 0) {
		const v = DODGE.TILES * CELL; s.vx = D.dx * v; s.vz = D.dz * v;
		D.t -= dt; if (D.t <= 1e-6) { D.t = 0; D.cd = DODGE.CD; s.vx = D.dx * SK.RUN; s.vz = D.dz * SK.RUN; S.w.tune = D.tune; D.tune = null; S.w.fastK = undefined; }
		return { ...inp, mx: D.dx, mz: D.dz, crouch: false };
	}
	return { ...inp, crouch: false };   // (no slide in a Dive: the button is the dodge)
}
/** A KO chains the combo: every COMBO.MILESTONE, loot. */
function comboKo(S) {
	const C = S.R.COMBO, c = S.combo; if (!C) return;
	c.n++; c.t = C.WINDOW; c.best = Math.max(c.best, c.n);
	if (c.n % C.MILESTONE === 0) { loot(S, C.COINS_PER * c.n / C.MILESTONE); say(S, `Combo x${c.n}!`, 1.6); S.w.events.push({ k: 'combo', n: c.n }); }
}
/** The combo's window runs out; its XP (on the player's XP factor, the last combo's divided out). */
function comboTick(S, dt) {
	const C = S.R.COMBO, c = S.combo, pl = S.w.pl; if (!C) return;
	if (c.n > 0) { c.t -= dt; if (c.t <= 0) { c.n = 0; c.t = 0; } }
	const k = 1 + Math.min(C.XP_CAP, C.XP_PER * c.n);
	pl.xpMul = pl.xpMul / c.k * k; c.k = k;
}

/** A foe of this floor at (x, z) metres. o: { alpha, boss (a guardian), legend, rein (a reinforcement), er (the
 *  floor's elite stream) } */
export function spawnFoe(S, dex, x, z, o = {}) {
	const w = S.w, K = S.R.K, f = S.floor, teff = f * K.T_PER_FLOOR, deep = Math.max(0, f - K.DEEP.from), party = 1 + w.mates.length;
	const ti = clamp(Math.floor((S.R.target(f) - 260) / K.TIER_BST) + (f >= K.DEEP.tierAt ? 1 : 0), 0, 5);
	const Xk = o.boss ? K.GUARD : o.legend ? K.LEGEND : o.alpha ? K.ALPHA : null;
	// the 2D numbers: the base curve at this floor's "run time", x the Dive's own HP / damage, x the big ones', x the depth
	const hpK = (K.HP_K + Math.min(1.7, teff / 210)) / CK.HP_K(teff) * (Xk ? Xk.hp : 1) * (1 + K.DEEP.hp * deep) * (1 + CK.COOP.hp * (party - 1));
	const dmgK = K.DMG_K / CK.DMG_K * (Xk ? Xk.dmg : 1) * (1 + K.DEEP.dmg * deep);
	const base = data0(S, dex, ti); if (!base) return null;
	let e;
	if (o.boss) {
		const hp = Math.round(base.hp * (1 + teff / 95) * CK.HP_K(teff) * hpK), dmg = base.dmg * (1 + teff / 420) * CK.DMG_K * dmgK, sp = S.data.baseSpd(dex), b = S.data.behaviorOf(dex);
		const def = { dex, boss: true, hp, spd: Math.round(clamp(40 + sp * 0.5, 40, 100)), dmg: Math.round(dmg), xp: Math.round(base.xp * K.XP_K * Xk.xp), behavior: b === 'ranged' ? 'ranged' : sp > 90 ? 'charger' : 'chase', shotDmg: Math.round(dmg * 0.55), shotCd: 1.1, range: 260 };
		e = addBoss(w, dex, x, z, { def, t: 0 });
		e.xk = 'guardian';
	} else {
		e = addEnemy(w, dex, x, z, { t: teff, ti, def: base, hp: hpK, dmg: dmgK });
		e.xp = Math.round(base.xp * K.XP_K * (Xk ? Xk.xp : 1));
		if (Xk) { e.scale = Xk.scale; e.cr = S.data.radius(dex, Xk.scale); e.xk = o.legend ? 'legend' : 'alpha'; }
	}
	// an elite: one affix, from the floor's own elite stream (the same floor, the same elites)
	if (!Xk && o.er && f >= K.ELITE.from && o.er() < Math.min(K.ELITE.max, K.ELITE.p0 + K.ELITE.per * (f - K.ELITE.from))) {
		const aff = ['swift', 'tough', 'rage'][Math.floor(o.er() * 3)];
		e.xaff = aff; e.xk = 'elite';
		if (aff === 'swift') e.a.speed *= K.ELITE.swift; else if (aff === 'tough') e.maxHp = e.hp = Math.round(e.maxHp * K.ELITE.tough); else e.dmg *= K.ELITE.rage;
		e.xp = Math.round(e.xp * K.ELITE.xp);
		e.scale = K.ELITE.scale; e.cr = S.data.radius(dex, K.ELITE.scale);
	}
	if (o.rein) { e.xrein = true; e.xp = Math.max(1, Math.round(e.xp * K.REIN.xp)); S.tags.set(e.id, 'rein'); }
	return e;
}
const data0 = (S, dex, ti) => (S.data.mon(dex) ? S.data.defFor(dex, ti) : null);
/** A place on the floor for a body near (x, z): there if it is not rock (a walker: nor a pool), else the centre. */
function place(S, x, z, cx, cz, fly) {
	const room = S.w.room, i = Math.floor(z / CELL) * room.w + Math.floor(x / CELL);
	const ok = x > 0 && z > 0 && x < room.w * CELL && z < room.h * CELL && room.cells[i] < room.rimH && (fly || !room.water.has(i));
	return ok ? [x, z] : [cx, cz];
}

/** Floor f begins: its room is already the fight's. The groups (asleep), the lost Pokémon, the alpha or the guardian. */
function startFloor(S, f, t) {
	const w = S.w, R = S.R, K = R.K, room = w.room, L = room.dive;
	Object.assign(S, { floor: f, zone: f, ft: t, groups: [], boss: null, sealed: false, bossFell: false, stairsT: 0, ropeT: 0, ropeSaid: false, sealSaid: false, stray: null, reinT: null, reinN: 0, cadence: L.cadence, tg: [] });
	// (part 5) the chests (the floor's, and each pocket's), the landmark
	{ const seen = new Set(), list = []; for (const c of [...room.chests, ...room.plugs.map((pg) => pg.chest)]) { if (!c) continue; const key = c[0] + ',' + c[2]; if (seen.has(key)) continue; seen.add(key); list.push({ x: c[0], z: c[2], t: 0, open: false, pocket: room.pocketChest(c) }); }
		S.chests = list; S.lm = room.landmark && LANDMARKS[room.landmark.kind] ? { kind: room.landmark.kind, x: room.landmark.at[0], z: room.landmark.at[2], t: 0, used: false, seen: false } : null; }
	S.deepest = Math.max(S.deepest, f); S.tags.clear();
	const r = R.rng(S.seed, S.route, f, 0xD1), P = R.pool(S.route, f), er = R.rng(S.seed, S.route, f, 0xE17E);
	const n = Math.min(K.GROUP[1], K.GROUP[0] + Math.floor(f / 8));
	room.groups.forEach((g, gi) => {
		const k = Math.max(1, n + (g.guard ? K.GUARD_PLUS : 0) + Math.floor(r() * 3) - 1), list = [], cx = g.at[0], cz = g.at[2];
		for (let i = 0; i < k; i++) {
			const a = r() * TAU, d = (i ? 18 + r() * 22 : 0) * U, dex = draw(P, r);
			const [x, z] = place(S, cx + Math.cos(a) * d, cz + Math.sin(a) * d, cx, cz, S.data.hovers(dex));
			const e = spawnFoe(S, dex, x, z, { er });
			if (e) { e.xdive = gi; e.dummy = true; e.asleep = true; list.push(e); }   // (asleep: it neither moves nor touches until its group wakes)
		}
		S.groups.push({ awake: false, list, at: [cx, cz] });
	});
	// the lost Pokémon: a gentle species of the route
	if (room.rescue) {
		const lr = R.rng(S.seed, S.route, f, 0x105), cand = R.strays(S.route, f);
		S.stray = { dex: cand.length ? cand[Math.floor(lr() * cand.length)] : 25, x: room.rescue[0], y: 0, z: room.rescue[2], follow: false, done: false };
	}
	let said = false;
	if (L.cadence.guardian) {
		const dex = R.guardianOf(S.route, f), x = (40 + 0.5) * CELL, z = (L.h / 2 + 0.5) * CELL;
		const e = spawnFoe(S, dex, x, z, { boss: true });
		if (e) { S.boss = e; S.sealed = true; said = true; say(S, `${name(S, dex)}, the route's guardian!`, 3.6); }
	} else if (L.cadence.arena) {
		const ar = R.rng(S.seed, S.route, f, 0xA1), p = L.path[Math.max(0, L.path.length - 5)], x = (p[0] + 0.5) * CELL, z = (p[1] + 0.5) * CELL;
		let dex = draw(R.pool(S.route, f + 4), ar);
		const mg = f > K.MEGA.from ? R.megaRoll(S.seed, S.route, f) : null;
		if (mg && mg.arena && S.data.mon(mg.dex)) dex = mg.dex;
		const e = spawnFoe(S, dex, x, z, { alpha: true });
		if (e) { S.boss = e; S.sealed = true; said = true; say(S, 'An alpha! Beat it to open the stairs', 3.4); }
	}
	if (!L.cadence.guardian) said = u3Floor(S, f) || said;
	if (!said) say(S, `— Floor ${f} · ${R.nameOf(S.route)} —`, 2.8);
	w.events.push({ k: 'floor', floor: f });
}
/** Floor f's Mega (below floor K.MEGA.from) and legendary (from K.LEGEND.from, with the pity): awake, alpha-sized. */
function u3Floor(S, f) {
	const R = S.R, K = R.K, room = S.w.room, L = room.dive; let said = false;
	const spot = (salt) => { const r = R.rng(S.seed, S.route, f, salt), g = room.groups.length ? room.groups[Math.floor(r() * room.groups.length)] : null, p = L.path[Math.floor(L.path.length / 2)] || [L.w / 2, L.h / 2];
		return g ? [g.at[0], g.at[2]] : [(p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL]; };
	if (f > K.MEGA.from && !L.cadence.arena) {
		const mg = R.megaRoll(S.seed, S.route, f);
		if (mg.elite && S.data.mon(mg.dex)) { const [x, z] = spot(0x3E6B), e = spawnFoe(S, mg.dex, x, z, { alpha: true }); if (e) { S.tags.set(e.id, 'mega'); said = true; say(S, `A wild ${name(S, mg.dex)} appears!`, 3.2); } }
	}
	if (f >= K.LEGEND.from) {
		const lr = R.legendRoll(S.seed, S.route, f);
		if (lr.dex && S.data.mon(lr.dex) && (lr.hit || S.legPity >= K.LEGEND.pity)) {
			S.legPity = 0;
			const [x, z] = spot(0x1EA), e = spawnFoe(S, lr.dex, x, z, { legend: true });
			if (e) { S.tags.set(e.id, 'legend'); said = true; say(S, `A legendary ${name(S, lr.dex)} appears!`, 3.4); }
		} else S.legPity++;
	}
	return said;
}
/** A group wakes, and (hop) the groups within K.WAKE_CHAIN tiles of it. */
export function wake(S, g, hop = true) {
	if (g.awake) return;
	g.awake = true; for (const e of g.list) if (!e.dead) { e.dummy = false; e.asleep = false; }
	S.w.events.push({ k: 'wake', n: g.list.length, x: g.at[0], z: g.at[1] });
	if (hop) { const r = tiles(S.R.K.WAKE_CHAIN); for (const o of S.groups) if (!o.awake && Math.hypot(o.at[0] - g.at[0], o.at[1] - g.at[1]) < r) wake(S, o, false); }
}
/** Pressure: a pack arrives K.REIN.near..far tiles from you, awake. -> how many */
export function reinforce(S) {
	const w = S.w, R = S.R, K = R.K, room = w.room, L = room.dive, f = S.floor, s = w.pl.s;
	if (w.enemies.filter((e) => !e.dead).length >= K.REIN.cap) return 0;
	const cands = [L.spawn, ...(L.path || []), ...(L.groups || []).map((g) => g.at)].map((p) => [(p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL]);
	let at = null, best = Infinity, fallback = null, fb = -1;
	for (const c of cands) { const d = Math.hypot(c[0] - s.x, c[1] - s.z) / CELL; if (d >= K.REIN.near && d <= K.REIN.far && d < best) { best = d; at = c; } if (d <= K.REIN.far && d > fb) { fb = d; fallback = c; } }
	at = at || fallback || [room.spawn[0], room.spawn[2]];
	const rr = R.rng(S.seed, S.route, f, 0x8E1F + S.reinN), P = R.pool(S.route, f), n = Math.min(K.REIN.max, K.REIN.n + Math.floor(f / K.REIN.perFloors));
	let made = 0;
	for (let i = 0; i < n; i++) { const a = rr() * TAU, d = (10 + rr() * 22) * U, dex = draw(P, rr), [x, z] = place(S, at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d, at[0], at[1], S.data.hovers(dex)); if (spawnFoe(S, dex, x, z, { rein: true })) made++; }
	if (made && !S.reinN) say(S, 'Something stirs: reinforcements are coming', 3);
	return made;
}

export const loot = (S, n) => { if (n > 0) S.stake += n; };
/** An item is yours, and the page is told which (what explevel.js says of it is one of the run's lines too). */
function give(S, id) { const ev = S.w.events, n0 = ev.length, n = takeItem(S, id); for (let i = n0; i < ev.length; i++) if (ev[i].k === 'say') S.says.push({ text: ev[i].text, s: ev[i].s }); return n; }

// ---------------------------------------------------------------- (part 5) chests, secret pockets, landmarks
/** The landmarks (the 2D game's LM numbers): [name, what it says, colour]. */
export const LANDMARKS = { shrine: ['Shrine', 'you recover half your HP', '#9fffc8'], obelisk: ['Obelisk', '+30 % damage for 60 s', '#ffb347'], altar: ['Altar', 'you pay HP for loot', '#ff6b7a'],
	shipwreck: ['Shipwreck', "the wreck's loot", '#ffd23f'], spire: ['Ice spire', 'the foes near it freeze', '#9fe8ff'], totem: ['Totem', 'experience', '#c9a6ff'],
	monolith: ['Monolith', 'a lot of experience', '#e0e0ff'], fairy: ['Fairy ring', 'you are fully healed', '#ff9ed8'] };
export const CHEST = { R: 1.15, T: 0.45, SEE: 5 };   // (tiles to open from, the 2D economy's; its OPEN_T is read when it is there; SEE: a landmark names itself from here)
const typesOf = (S) => ((S.w.pl.mon && S.w.pl.mon.types) || []).map((t) => String(t).toLowerCase());
/** Can your Pokémon open this kind of plug ('boulder' | 'thicket')? */
export const canOpen = (S, kind) => typesOf(S).some((t) => (S.R.PLUG.TYPES[kind] || []).includes(t));
/** Plug i of the floor opens: its tiles become ground. -> whether it did */
export function openPlug(S, i) {
	const room = S.w.room, pg = room.plugs[i]; if (!pg || pg.open) return false;
	for (const p of [pg.at, pg.at2]) if (p) setCell(room, Math.floor(p[0] / CELL), Math.floor(p[2] / CELL), 0);
	pg.open = true; S.secrets++; S.plugsOpen = (S.plugsOpen | 0) | (1 << i);
	say(S, pg.kind === 'boulder' ? 'The boulder breaks! Something is behind it' : 'The thicket burns! Something is behind it', 2.6);
	S.w.events.push({ k: 'plug', i, kind: pg.kind, x: pg.at[0], z: pg.at[2] });
	return true;
}
/** The landmark is used: once a floor. */
function useLandmark(S, lm) {
	const w = S.w, pl = w.pl, LM = S.R.LM, k = lm.kind, f = S.floor;
	lm.used = true; S.marks++;
	if (k === 'shrine') pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * LM.SHRINE_HP);
	else if (k === 'obelisk') S.obeliskT = LM.OBELISK_T;
	else if (k === 'altar') { pl.hp = Math.max(1, pl.hp - pl.maxHp * LM.ALTAR_HP); loot(S, 20 + 3 * f); }
	else if (k === 'shipwreck') loot(S, 15 + 2 * f);
	else if (k === 'spire') { for (const e of w.enemies) if (!e.dead && !e.boss && Math.hypot(e.a.x - lm.x, e.a.z - lm.z) < tiles(LM.SPIRE_R)) e.frozenT = Math.max(e.frozenT || 0, LM.SPIRE_T); }
	else if (k === 'totem' || k === 'monolith') gainXp(w, Math.round((pl.xpNext || 20) * (k === 'monolith' ? 0.6 : 0.35) / (pl.xpMul || 1)));
	else if (k === 'fairy') pl.hp = pl.maxHp;
	say(S, `${LANDMARKS[k][0]}: ${LANDMARKS[k][1]}`, 3);
	w.events.push({ k: 'landmark', kind: k, x: lm.x, z: lm.z });
}
// ---------------------------------------------------------------- (part 9) the red ground: slams and charges
const release = (e) => { e.dummy = false; e.xtele = null; };
const openAt = (room, x, z) => x > 0 && z > 0 && x < room.w * CELL && z < room.h * CELL && room.cells[Math.floor(z / CELL) * room.w + Math.floor(x / CELL)] < room.rimH;
/** One tick of the telegraphs (the 2D game's teleTick, with the fight's own seeded dice). S.tg: what is on the ground:
 *  { k: 'slam' | 'charge' | 'dash', e, x, z, r | (a, len, w), t, T }. */
function teleTick(S, dt) {
	const w = S.w, TE = S.R.TELE, pl = w.pl, s = pl.s, room = w.room; if (!TE) return;
	for (const e of w.enemies) {
		if (e.dead || e.asleep || e.xtele || e.minion) continue;
		const big = e.xk === 'alpha' || e.xk === 'guardian';
		if (!big && (e.def.shotCd || e.behavior === 'thief' || e.dummy)) continue;   // (a brawler: a foe with no shot)
		if (e.frozenT > 0 || e.sleepT > 0) continue;
		e.xtcd = (e.xtcd == null ? 1 + w.rand() * 1.5 : e.xtcd) - dt;
		if (e.xtcd > 0) continue;
		const d = Math.hypot(s.x - e.a.x, s.z - e.a.z), reach = tiles(big ? TE.chargeLen : TE.REACH);
		if (d > reach) { e.xtcd = 0.3; continue; }
		const cd = e.xk === 'guardian' ? TE.GUARD_CD : big ? TE.ALPHA_CD : TE.CD;
		e.xtcd = cd[0] + w.rand() * (cd[1] - cd[0]);
		const charge = big && (d > tiles(2) || w.rand() < (e.xk === 'guardian' ? 0.45 : 0.35));
		const t = charge ? { k: 'charge', e, x: e.a.x, z: e.a.z, a: Math.atan2(s.z - e.a.z, s.x - e.a.x), len: tiles(TE.chargeLen), w: tiles(TE.chargeW), t: 0, T: TE.charge }
			: { k: 'slam', e, x: e.a.x, z: e.a.z, r: tiles(e.xk === 'guardian' ? TE.guardR : big ? TE.alphaR : TE.slamR), t: 0, T: TE.slam };
		e.xtele = t; e.dummy = true;   // (it holds still while winding up)
		S.tg.push(t);
		w.events.push(charge ? { k: 'tele', kind: 'charge', x: t.x, z: t.z, a: t.a, len: t.len, w: t.w, T: t.T } : { k: 'tele', kind: 'slam', x: t.x, z: t.z, r: t.r, T: t.T });
	}
	for (let i = S.tg.length - 1; i >= 0; i--) {
		const t = S.tg[i], e = t.e;
		if (e.dead) { S.tg.splice(i, 1); continue; }
		t.t += dt;
		if (t.k === 'dash') {
			const u = Math.min(1, t.t / TE.chargeT), px = t.x + Math.cos(t.a) * t.len * u, pz = t.z + Math.sin(t.a) * t.len * u, wall = !openAt(room, px, pz);
			if (!wall) { e.a.x = px; e.a.z = pz; }
			if (!t.hit && !pl.dead && Math.hypot(s.x - e.a.x, s.z - e.a.z) < t.w * 0.6 + 0.35) { t.hit = true; hurtPlayer(w, e.dmg * TE.CHARGE_DMG, 'normal', true); }
			if (u >= 1 || wall) { S.tg.splice(i, 1); release(e); }
			continue;
		}
		if (t.t < t.T) continue;
		if (t.k === 'slam') {
			if (!pl.dead && Math.hypot(s.x - t.x, s.z - t.z) < t.r) hurtPlayer(w, e.dmg * TE.SLAM_DMG, 'normal', true);
			w.events.push({ k: 'slam', x: t.x, z: t.z, r: t.r, big: !!e.xk });
			S.tg.splice(i, 1); release(e);
		} else { t.k = 'dash'; t.t = 0; t.hit = false; w.events.push({ k: 'charge', x: t.x, z: t.z, a: t.a, len: t.len }); }   // (the charge's wind-up is over)
	}
}
/** One tick of the floor's things. */
function thingsTick(S, dt) {
	const w = S.w, R = S.R, s = w.pl.s, room = w.room, f = S.floor;
	if (S.obeliskT > 0) S.obeliskT = Math.max(0, S.obeliskT - dt);
	if (R.PLUG) room.plugs.forEach((pg, i) => {
		if (pg.open) return;
		const mx = pg.at2 ? (pg.at[0] + pg.at2[0]) / 2 : pg.at[0], mz = pg.at2 ? (pg.at[2] + pg.at2[2]) / 2 : pg.at[2];
		const by = Math.hypot(s.x - mx, s.z - mz) < tiles(R.PLUG.R + (pg.at2 ? 0.5 : 0)), ok = by && canOpen(S, pg.kind);
		pg.t = ok ? (pg.t || 0) + dt : 0;
		if (by && !ok && !S.plugTip) { S.plugTip = true; say(S, pg.kind === 'boulder' ? 'A boulder: a Rock, Ground, Fighting or Steel Pokémon breaks it' : 'A thicket: a Fire Pokémon burns it', 3.2); }
		if (pg.t >= R.PLUG.T) openPlug(S, i);
	});
	const OT = (S.X && S.X.E && S.X.E.K && S.X.E.K.OPEN_T) || CHEST.T;
	S.chests.forEach((c, i) => {
		if (c.open) return;
		c.t = Math.hypot(s.x - c.x, s.z - c.z) < tiles(CHEST.R) ? c.t + dt : 0;
		if (c.t < OT) return;
		c.open = true; S.opened++;
		// one item, of a rarity by your level, your luck and the floor's zone (a zone every 10 floors, as the 2D Dive's)
		let id = null;
		if (S.lv) { const z0 = S.zone; S.zone = Math.min(3, 1 + Math.floor((f - 1) / 10)); id = rollOffers(S, R.rng(S.seed, S.route, f, 0xC4E5 + i), 1, 0)[0] || null; S.zone = z0; }
		if (id) give(S, id); else { loot(S, 3 + f); say(S, 'A Poké Ball: a little loot', 2.2); }   // (no room for an item, or no items in this run)
		w.events.push({ k: 'chest', i, x: c.x, z: c.z, item: id, pocket: c.pocket });
	});
	const lm = S.lm;
	if (lm && !lm.used && R.LM) {
		const d = Math.hypot(s.x - lm.x, s.z - lm.z);
		if (!lm.seen && d < tiles(CHEST.SEE)) { lm.seen = true; say(S, `${LANDMARKS[lm.kind][0]}: stand on it (${LANDMARKS[lm.kind][1]})`, 3); }
		lm.t = d < tiles(R.LM.R) ? lm.t + dt : 0;
		if (lm.t >= R.LM.T) useLandmark(S, lm);
	}
}
const secure = (S) => { S.bank += S.stake; S.stake = 0; S.rescuedBank = S.rescued.length; };
function bossDown(S) {
	const K = S.R.K, e = S.boss, guard = e.xk === 'guardian';
	S.boss = null; S.sealed = false; S.bossFell = true;
	if (guard) { S.guardians++; loot(S, K.LOOT.guard + K.LOOT.guardPer * S.floor); secure(S); S.stage = S.floor + 1; say(S, 'Guardian defeated! Stage saved', 3.4); }
	else { S.alphas++; loot(S, K.LOOT.alpha + K.LOOT.alphaPer * S.floor); if (S.floor <= 25) { secure(S); say(S, 'Alpha defeated! Loot secured', 3); } else say(S, 'Alpha defeated! The stairs are clear', 3); }
	S.w.events.push({ k: 'bossdown', guardian: guard });
}
/** On the way out (the stairs, the rope): the lost Pokémon, if it follows you and is near, is rescued. */
function escortOut(S) {
	const lo = S.stray, s = S.w.pl.s, K = S.R.K;
	if (!lo || !lo.follow || lo.done || Math.hypot(s.x - lo.x, s.z - lo.z) >= tiles(S.R.ESCORT.R)) return;
	lo.done = true; S.rescued.push(lo.dex); loot(S, K.LOOT.rescue + K.LOOT.rescuePer * S.floor);
	say(S, `${name(S, lo.dex)} rescued!`, 2.4); S.w.events.push({ k: 'rescued', dex: lo.dex });
}
function escortTick(S, dt) {
	const lo = S.stray, s = S.w.pl.s;
	if (!lo || !lo.follow || lo.done) return;
	const want = tiles(1.6), d = Math.hypot(s.x - lo.x, s.z - lo.z);
	if (d > want) { const v = Math.min(d - want, SK.RUN * S.R.ESCORT.SPEED * dt); lo.x += (s.x - lo.x) / d * v; lo.z += (s.z - lo.z) / d * v; }
	if (d > tiles(14)) { lo.x = s.x - 1.2; lo.z = s.z; }   // (never left behind)
	lo.y = Math.max(0, groundAt(S.w.room, lo.x, lo.z));
}
/** Put the fight on floor f: nothing of the old floor comes along but you. */
function enterFloor(S, f) {
	const w = S.w, room = diveRoom(S.R.F, S.seed, S.route, f);
	for (const k of ['enemies', 'shots', 'orbs', 'fields', 'effects', 'eshots', 'hazards', 'pickups']) w[k].length = 0;
	w.room = room; Object.assign(w.pl.s, newState(room, w.tune));
	w.field = null; w.fieldCell = -2; w.pl.target = null;
}
function nextFloor(S, t) {
	escortOut(S);
	loot(S, S.R.K.LOOT.floor + S.R.K.LOOT.floorPer * S.floor);
	enterFloor(S, S.floor + 1);
	startFloor(S, S.floor + 1, t);
}
function end(S, escaped) { S.ended = true; S.escaped = escaped; S.won = escaped; S.lost = !escaped; S.w.events.push({ k: 'runover', won: escaped }); }

/** One tick of the run: the fight's tick, then the Dive's rules. */
export function stepDive(S, input, dt = SK.TICK) {
	const w = S.w, K = S.R.K;
	S.says.length = 0;
	if (S.ended) return S;
	if (S.ult && holdUlt(S, dt)) { w.events.length = 0; return S; }
	const t0 = w.t;
	w.cap = K.REIN.cap + 60;
	if (S.kit) { roles(S); input = w.pl.choices ? input : dodgeInput(S, input, dt); }
	tick(w, input, dt);
	if (S.dodgeEv) { S.dodgeEv = false; if (w.t !== t0) w.events.push({ k: 'dodge' }); }   // (the tick clears the events: said again, for the page)
	if (w.t === t0) return S;   // (a level-up card is up: nothing moves)
	const t = w.t, s = w.pl.s, room = w.room;
	if (S.rx) tickRx(S);
	if (S.ult) tickUlt(S, dt);
	tickFog(S);
	if (w.pl.dead) { end(S, false); return S; }
	if (S.lv) { tickStats(S, dt); for (const ev of w.events) if (ev.k === 'pickup' && ev.kind === 'item') give(S, ev.value); }
	let hurt = false;
	for (const ev of w.events) {
		if (ev.k === 'hurt') hurt = true;
		else if (ev.k === 'kill') { S.kills++; comboKo(S); const tag = S.tags.get(ev.id);
			if (tag !== 'rein') loot(S, K.LOOT.ko + K.LOOT.koPer * S.floor);
			if (tag === 'mega') loot(S, K.LOOT.alpha + K.LOOT.alphaPer * S.floor); else if (tag === 'legend') loot(S, K.LEGEND.loot + K.LEGEND.lootPer * S.floor); }
	}
	comboTick(S, dt);
	// the groups: one wakes when you come close, or when one of it is hit
	const wr = tiles(K.WAKE_R);
	for (const g of S.groups) if (!g.awake && (Math.hypot(s.x - g.at[0], s.z - g.at[1]) < wr || g.list.some((e) => !e.dead ? e.hp < e.maxHp : true))) wake(S, g);
	// pressure
	if (!S.cadence.guardian && t - S.ft >= K.REIN.grace) {
		S.reinT = (S.reinT == null ? 0 : S.reinT) - dt;
		if (S.reinT <= 0) { reinforce(S); S.reinT = Math.max(K.REIN.min, K.REIN.every - K.REIN.faster * S.reinN); S.reinN++; }
	}
	// the lost Pokémon
	const lo = S.stray;
	if (lo && !lo.done && !lo.follow && Math.hypot(s.x - lo.x, s.z - lo.z) < tiles(K.RESCUE_R)) { lo.follow = true; say(S, `${name(S, lo.dex)} follows you! Take it to the stairs`, 2.6); w.events.push({ k: 'follow', dex: lo.dex }); }
	escortTick(S, dt);
	thingsTick(S, dt);
	teleTick(S, dt);
	if (S.boss && S.boss.dead) bossDown(S);
	// the rope: stand still in the circle where you arrived
	if (S.cadence.rope) {
		const inR = Math.hypot(s.x - room.spawn[0], s.z - room.spawn[2]) < tiles(K.ROPE_R), still = Math.hypot(s.vx, s.vz) < ROPE_STILL && s.grounded;
		if (inR && still && !hurt) {
			if (!S.ropeSaid) { S.ropeSaid = true; say(S, 'Escape Rope: hold still…', K.ROPE_T); }
			S.ropeT += dt;
			if (S.ropeT >= K.ROPE_T) { escortOut(S); say(S, 'You escape with everything!', 3); end(S, true); return S; }
		} else { S.ropeT = 0; S.ropeSaid = false; }
	}
	// the stairs
	const onS = Math.hypot(s.x - room.stairs[0], s.z - room.stairs[2]) < tiles(K.STAIRS_R);
	if (onS && S.sealed) { if (!S.sealSaid) { S.sealSaid = true; say(S, 'The stairs are sealed', 2); } } else if (!onS) S.sealSaid = false;
	S.stairsT = onS && !S.sealed ? S.stairsT + dt : 0;
	if (S.stairsT >= K.STAIRS_T) nextFloor(S, t);
	return S;
}

/** The run's pay, in the Expedition's pay units: the bank, plus the stake on an escape or a quarter of it on a faint. */
export const payOf = (S) => Math.floor(S.bank + (S.escaped ? S.stake : S.stake * S.R.K.FAINT_KEEP));
const rescuedOf = (S) => (S.escaped ? S.rescued.length : S.rescuedBank);
/** The HUD's line. */
export function hudLine(S) {
	const s = S.w.pl.s, st = S.w.room.stairs, m = Math.round(Math.hypot(s.x - st[0], s.z - st[2]));
	const parts = [`FLOOR ${S.floor}`, `${Math.floor(S.bank)} secured · ${Math.floor(S.stake)} at stake`];
	parts.push(S.boss ? (S.boss.xk === 'guardian' ? 'GUARDIAN' : 'ALPHA') : `STAIRS ${m} m`);
	if (S.ropeT > 0) parts.push('ROPE ' + Math.max(0, S.R.K.ROPE_T - S.ropeT).toFixed(1) + ' s');
	if (S.combo.n >= 2) parts.push('COMBO x' + S.combo.n);
	if (S.obeliskT > 0) parts.push('OBELISK ' + Math.ceil(S.obeliskT) + ' s');
	return parts.join(' · ');
}
/** The end screen's parts and lines (the 2D game's scoreParts and result). */
export function result(S) {
	const w = S.w;
	const parts = { floor: S.floor, deepest: S.deepest, route: S.route, kills: S.kills, time: Math.floor(w.t), alphas: S.alphas, guardians: S.guardians, rescued: rescuedOf(S), combo: S.combo.best, form: S.lg ? S.lg.form : S.w.pl.mon.dex, evos: S.lg ? S.lg.evo : 0, chests: S.opened, secrets: S.secrets, landmarks: S.marks, escaped: S.escaped, divePay: payOf(S), zone: Math.min(4, 1 + Math.floor(S.floor / 10)), start: S.start, weekly: null };
	return { won: S.escaped, title: S.escaped ? 'You escape with everything!' : 'RUN OVER', parts, stage: S.stage,
		lines: [`Dive · ${S.R.nameOf(S.route)}: floor ${S.floor}`, `Loot secured: ${Math.floor(S.bank)} · at stake: ${Math.floor(S.stake)}`,
			S.escaped ? 'You escaped: you keep all the loot' : 'You fell: you keep what was secured and a quarter of the rest', `Rescued: ${rescuedOf(S)}`, `Alphas: ${S.alphas} · Guardians: ${S.guardians}`, `Best combo: ${S.combo.best}`, `Poké Balls opened: ${S.opened} · Secret pockets: ${S.secrets}`] };
}
