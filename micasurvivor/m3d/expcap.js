// expcap.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): capture in an Expedition run, on top of
// expedition.js. An alpha does not fall: at 1 HP it FAINTS where it stands and a window opens (8 s). Stand beside it
// and your Friend Ball goes out (no odds: it always works); the world holds for the three shakes; then it is a
// SUPPORT ALPHA for the rest of the run: it follows you, shoots the nearest enemy, and its type gives you a perk. Two
// at most: with two, you choose which to swap, or keep your team and take its prize (an item and a berry), which is
// also what it leaves if the window runs out. A SHINY may wander into a zone: it never attacks, it flees after two
// minutes, and it can be caught the same way.
//
// The numbers, the perks, the zone's shiny roll and the cinematic's length are the 2D game's own
// (js/expedition/capture.js: K, perkOf, shinyChance, zonePlan, CINE_T).
//
// Not here yet: the League's wild encounters (they need the League and its save), keeping a caught shiny (the save),
// the Lab's third slot, the Master Ball.
import { CELL, groundAt } from './sim.js';
import { rng as makeRng } from './gen.js';
import { moveActor } from './actors.js';
import { CK, U, drop, shoot, attackOf } from './combat.js';
import { XK, spawn, free, say } from './expedition.js';
import { dropItem } from './explevel.js';
import { canEvolve } from './expleague.js';

function mix(...vals) {
	let h = 0x9E3779B9 | 0;
	for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
	return h >>> 0;
}
/** The 2D game's capture tables, as this module reads them. G: its global with expedition/capture.js loaded. */
export function capFrom(G) {
	const C = G.ExpCap;
	return { K: C.K, CINE_T: C.CINE_T, perkOf: C.perkOf, shinyChance: C.shinyChance, zonePlan: C.zonePlan, phase: C.phase, hasShiny: (dex) => G.Sprites.hasShiny(dex) };
}
/** Give a run its captures. */
export function setupCap(S) {
	S.cap = { sa: [], tg: new Map(), faint: [], cine: null, n: 0, last: 0, zone: 0, zplan: null, shDone: false, done: new Set(), log: { alpha: 0, shiny: [], seen: 0, fled: 0, prizes: 0, swaps: 0, best: 0 } };
	return S.cap;
}
const name = (S, dex) => { const m = S.data.mon(dex); return m ? m.name : '#' + dex; };
const typeOf = (S, dex) => ((S.data.mon(dex) || {}).types || ['normal'])[0] || 'normal';
/** How many Support Alphas you may have. */
export const slotsMax = (S) => S.X.C.K.SLOTS;
/** Mark an enemy as one that can be caught: it faints at 1 HP instead of falling. o: { flee (s) } */
export function mark(S, e, kind, o = {}) {
	if (!S.cap || !e) return e;
	e.hpFloor = 1; e.xcap = kind;
	S.cap.tg.set(e.id, Object.assign({ kind, e, t0: S.w.t, dex: e.dex }, o));
	return e;
}

// ---------------------------------------------------------------- a shiny in the zone
function spawnShiny(S, pick) {
	const w = S.w, C = S.X.C, K = C.K, s = w.pl.s, cards = S.plan.cards.filter((d) => C.hasShiny(d)); if (!cards.length) return null;
	const dex = cards[Math.min(cards.length - 1, Math.floor(pick * cards.length))], rng = makeRng(mix(S.seed, S.zone, 0x5417)), ang = rng() * 6.2832, fly = S.data.hovers(dex);
	let pt = null;
	for (const f of [1, 0.7, 1.3, 0.45]) { const d = K.SH_ROAM[1] * U * f, x = s.x + Math.cos(ang + f) * d, z = s.z + Math.sin(ang + f) * d; if (free(S, x, z, fly)) { pt = [x, z]; break; } }
	if (!pt) pt = [s.x + Math.cos(ang) * 120 * U, s.z + Math.sin(ang) * 120 * U];
	const e = spawn(S, dex, pt[0], pt[1], { hp: K.SH_HP, xp: K.SH_XP });
	e.xk = 'shiny'; e.shiny = true; e.dummy = true;   // (it never comes for you and never touches: it is moved by its own wandering below)
	e.roam = { rng: makeRng(mix(S.seed, S.zone, e.id, 0x40A)), t: 0, tx: pt[0], tz: pt[1] };
	const charm = !!(S.L && S.L.I.has(w.pl, 'shinycharm'));
	mark(S, e, 'shiny', { flee: charm ? K.SH_FLEE_CHARM : K.SH_FLEE });
	S.cap.log.seen++;
	say(S, `A shiny ${name(S, dex)} is near!`, 3.4);
	return e;
}
/** A shiny's wandering: to a point 14-30 m from you, then another. */
function roam(S, e, dt) {
	const K = S.X.C.K, r = e.roam, s = S.w.pl.s;
	if (e.frozenT > 0 || e.sleepT > 0) return;
	r.t -= dt;
	const dx = r.tx - e.a.x, dz = r.tz - e.a.z, d = Math.hypot(dx, dz);
	if (r.t <= 0 || d < 18 * U) { const a = r.rng() * 6.2832, dd = (K.SH_ROAM[0] + r.rng() * (K.SH_ROAM[1] - K.SH_ROAM[0])) * U; r.t = 2.4 + r.rng() * 2.2; r.tx = s.x + Math.cos(a) * dd; r.tz = s.z + Math.sin(a) * dd; return; }
	const st = e.a.speed * K.SH_SPD * (1 - (e.slow || 0)) * dt;
	moveActor(e.a, S.w.room, dx / d * st, dz / d * st); e.a.facing = Math.atan2(dx, dz);
}

// ---------------------------------------------------------------- the faint window
/** A target is down to 1 HP: it faints in place (its XP falls, the KO counts), and the window opens. */
function faint(S, e, g) {
	const C = S.cap, K = S.X.C.K, w = S.w;
	C.tg.delete(e.id);
	if (C.done.has(e.id) || C.faint.some((f) => f.eid === e.id)) return null;
	const win = g.kind === 'alpha' ? K.FAINT_T : K.SH_WINDOW, y = groundAt(w.room, e.a.x, e.a.z);
	const f = { eid: e.id, kind: g.kind, dex: e.dex, x: e.a.x, y, z: e.a.z, scale: e.scale || 1, shiny: g.kind === 'shiny', t0: w.t, end: w.t + win, stand: 0, latch: false };
	if (!e.dead) {
		drop(w, e.xp >= CK.BIG_XP ? 'xpBig' : 'xp', e.a.x, y, e.a.z, e.xp);
		e.dead = true; e.hp = 0; w.stats.kills++; w.stats.xp += e.xp;
		w.events.push({ k: 'kill', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, xp: e.xp, boss: false, xk: e.xk || null, faint: true });
		if (w.kos) w.kos.push({ boss: false, xk: e.xk || null });
	}
	C.faint.push(f);
	say(S, g.kind === 'alpha' ? `The alpha ${name(S, e.dex)} faints! Stand beside it to throw a Friend Ball` : `${name(S, e.dex)} faints! Stand beside it to throw a Poké Ball`, 3);
	return f;
}
/** An alpha's prize: an item and a berry. */
function prize(S, f) {
	const w = S.w;
	drop(w, 'item', f.x - 20 * U, f.y, f.z, S.lv ? dropItem(S) : 'leftovers'); drop(w, 'heal', f.x + 20 * U, f.y, f.z, 0);
	S.cap.log.prizes++;
}
function expire(S, f) {
	S.cap.done.add(f.eid);
	if (f.kind === 'alpha') { prize(S, f); say(S, `${name(S, f.dex)} comes round and leaves its prize`, 2.6); }
	else { S.cap.log.fled++; say(S, `The shiny ${name(S, f.dex)} got away!`, 3); }
}
const out = (C, f) => { const i = C.faint.indexOf(f); if (i >= 0) C.faint.splice(i, 1); };
function startCine(S, f, slot) {
	const C = S.cap; out(C, f); C.done.add(f.eid);
	C.cine = { kind: f.kind, dex: f.dex, x: f.x, y: f.y, z: f.z, scale: f.scale, shiny: f.shiny, slot, t: 0 };
	S.w.events.push({ k: 'cine', kind: f.kind, dex: f.dex });
	return C.cine;
}
/** The throw. With your team full an alpha asks which one to swap (or you keep your team and take its prize). */
function throwAt(S, f) {
	const C = S.cap; f.latch = true;
	if (f.kind === 'alpha' && C.sa.length >= slotsMax(S)) {
		const [st, v] = S.X.C.perkOf(typeOf(S, f.dex));
		S.pick = { kind: 'friend', title: 'Your team is full', sub: `Who do you swap for ${name(S, f.dex)}?`, picks: 1, taken: [], ids: [], dex: f.dex,
			cards: C.sa.map((a) => ({ title: `Swap ${name(S, a.dex)} for ${name(S, f.dex)}`, tag: 'Support Alpha', desc: S.L ? S.L.I.statText(st, v) : '' })), cancel: 'Keep my team',
			onTake: (i) => { if (!C.sa[i]) return false; startCine(S, f, i); return true; },
			onClose: () => { out(C, f); C.done.add(f.eid); prize(S, f); say(S, 'Its prize falls to the ground.', 2.2); return true; } };
		S.w.events.push({ k: 'pick', kind: 'friend' });
		return;
	}
	startCine(S, f, null);
}
function finish(S, c) {
	const C = S.cap, pl = S.w.pl;
	C.cine = null; pl.invuln = Math.max(pl.invuln, S.X.C.K.AFTER); C.n++; C.last = c.dex;
	if (c.kind === 'alpha') { recruit(S, c.dex, c.slot, c); const [st, v] = S.X.C.perkOf(typeOf(S, c.dex)); say(S, `Gotcha! ${name(S, c.dex)} joins your team` + (S.L ? ' · ' + S.L.I.statText(st, v) : ''), 3.4); }
	else { C.log.shiny.push(c.dex); say(S, `Gotcha! The shiny ${name(S, c.dex)} is caught!`, 4); }
	S.w.events.push({ k: 'caught', kind: c.kind, dex: c.dex });
}
/** While the ball shakes the world holds. -> true while it does */
export function holdCine(S, dt) {
	const C = S.cap; if (!C || !C.cine) return false;
	C.cine.t += dt; S.w.pl.invuln = Math.max(S.w.pl.invuln, 0.5);
	if (C.cine.t >= S.X.C.CINE_T) finish(S, C.cine);
	return true;
}

// ---------------------------------------------------------------- Support Alphas
/** The Support Alphas' perks, summed by stat (the 2D game's stats add them like any other bonus). */
function perks(S) { const out = {}; for (const a of S.cap.sa) { const [st, v] = S.X.C.perkOf(a.type); out[st] = (out[st] || 0) + v; } return out; }
/** The run's own extra stats, kept on the player for the 2D game's sum: the Support Alphas' perks, and Eviolite's
 *  armour while your stage can still evolve. */
export function syncPerks(S) {
	const pl = S.w.pl, out = S.cap ? perks(S) : {};
	if (S.L && S.L.I.has(pl, 'eviolite') && canEvolve(S)) out.armor = (out.armor || 0) + S.L.I.IT.eviolite.stats.eviolite;
	pl.xperk = out;
	if (S.L) S.L.I.apply(pl);
}
export function recruit(S, dex, slot, at) {
	const C = S.cap, w = S.w, s = w.pl.s, types = ((S.data.mon(dex) || {}).types || ['normal']).slice();
	const a = { dex, type: types[0] || 'normal', types, x: at ? at.x : s.x, y: at ? at.y : s.y, z: at ? at.z : s.z, cd: 0.6, aim: 0, facing: 0, shots: 0, moving: false };
	if (slot != null && C.sa[slot]) { C.sa[slot] = a; C.log.swaps++; } else C.sa.push(a);
	C.log.alpha++; C.log.best = Math.max(C.log.best, C.sa.length);
	syncPerks(S);
	return a;
}
/** Where Support Alpha i of n stands: behind you, fanned out. */
function slotSpot(S, i, n) {
	const K = S.X.C.K, s = S.w.pl.s, back = s.facing + Math.PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
	return [s.x + Math.sin(back) * K.SA_FOLLOW * U, s.z + Math.cos(back) * K.SA_FOLLOW * U];
}
function tickSupport(S, dt) {
	const C = S.cap, K = S.X.C.K, w = S.w, pl = w.pl, n = C.sa.length;
	C.sa.forEach((a, i) => {
		const [tx, tz] = slotSpot(S, i, n), dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
		if (d > K.SA_LEASH * U) { a.x = tx; a.z = tz; }   // (left far behind: it is beside you again)
		else if (d > 6 * U) { const sp = Math.min(d / dt, Math.max(120 * U, Math.hypot(pl.s.vx, pl.s.vz) * 1.25 + d * 1.5)); a.x += dx / d * sp * dt; a.z += dz / d * sp * dt; }
		a.moving = d > 10 * U;
		// (3D: it is not a body in the rules; it stands on whatever floor is under it, but never on the rim)
		const g = groundAt(w.room, a.x, a.z); a.y = g >= (w.room.rimH || 8) ? pl.s.y : g;
		let tg = null, bd = K.SA_REACH * U;
		for (const e of w.enemies) { if (e.dead) continue; const q = Math.hypot(e.a.x - a.x, e.a.y - a.y, e.a.z - a.z); if (q <= bd) { bd = q; tg = e; } }
		if (tg) { a.aim = Math.atan2(tg.a.z - a.z, tg.a.x - a.x); a.facing = Math.atan2(tg.a.x - a.x, tg.a.z - a.z); } else if (a.moving) a.facing = Math.atan2(dx, dz);
		a.cd -= dt;
		if (a.cd <= 0 && tg && !pl.dead) {
			a.cd = K.SA_CD;
			const from = [a.x, a.y + CK.MUZZLE, a.z], ex = tg.a.x - from[0], ey = tg.a.y + CK.MUZZLE - from[1], ez = tg.a.z - from[2], l = Math.hypot(ex, ey, ez) || 1;
			const m = { id: 'xsa', type: a.type, kind: 'bolt', speed: K.SA_SPEED, size: K.SA_SIZE, life: 1.1, pierce: 0, knock: 40, burn: a.type === 'fire' ? 1 : 0, poison: a.type === 'poison' ? 1 : 0, slow: a.type === 'ice' ? 0.3 : 0 };
			shoot(w, m, [ex / l, ey / l, ez / l], { from, off: 4, dmg: K.SA_DMG * (1 + K.SA_LV * Math.max(0, pl.level - 1)) * attackOf(pl) });
			a.shots++;
		}
	});
}

// ---------------------------------------------------------------- every tick
/** Every tick of the run (after the fight's, before the economy's): the zone's shiny, the targets, the windows, your team. */
export function tickCap(S, dt) {
	const C = S.cap, w = S.w, pl = w.pl, X = S.X.C, K = X.K; if (!C) return;
	if (C.zone !== S.zone) {
		C.zone = S.zone; C.shDone = false; C.faint.length = 0; C.tg.clear();
		C.zplan = X.zonePlan(S.seed, S.map, S.zone, { luck: pl.xluck || 0, charm: !!(S.L && S.L.I.has(pl, 'shinycharm')), force: !!S.forceShiny });
		for (const a of C.sa) { a.x = pl.s.x; a.z = pl.s.z; a.y = pl.s.y; }   // (your team comes through the portal with you)
	}
	const zt = w.t - S.zs, P = C.zplan;
	if (P && P.shiny && !C.shDone && zt >= P.shiny.at) { C.shDone = true; spawnShiny(S, P.shiny.pick); }
	for (const [id, g] of C.tg) {
		const e = g.e;
		if (e.dead || e.hp <= 1) { faint(S, e, g); continue; }
		if (!w.enemies.includes(e)) { C.tg.delete(id); continue; }
		if (e.roam) roam(S, e, dt);
		if (g.flee && w.t - g.t0 >= g.flee) { C.tg.delete(id); e.dead = true; C.log.fled++; say(S, `The shiny ${name(S, e.dex)} got away!`, 3); }
	}
	for (let k = C.faint.length - 1; k >= 0; k--) {
		const f = C.faint[k];
		if (w.t >= f.end) { C.faint.splice(k, 1); expire(S, f); continue; }
		if (pl.dead || C.cine || S.pick) continue;
		const s = pl.s, d = Math.hypot(s.x - f.x, s.z - f.z);
		if (d < K.THROW_R * CELL + pl.r && Math.abs(s.y - f.y) <= XK.SITE_UP) { if (f.latch) continue; f.stand += dt; if (f.stand >= K.THROW_T) throwAt(S, f); }
		else { f.stand = Math.max(0, f.stand - dt * 2); f.latch = false; }
	}
	tickSupport(S, dt);
}
/** What there is to see: the fainted, the ball in the air, your team. */
export function capView(S) {
	const C = S.cap; if (!C) return { faint: [], cine: null, sa: [] };
	return { faint: C.faint.map((f) => ({ kind: f.kind, dex: f.dex, x: f.x, y: f.y, z: f.z, left: Math.max(0, f.end - S.w.t), shiny: f.shiny })),
		cine: C.cine ? { ...C.cine, phase: S.X.C.phase(C.cine.t) } : null, sa: C.sa.map((a) => ({ dex: a.dex, x: a.x, y: a.y, z: a.z, facing: a.facing, moving: a.moving })) };
}
