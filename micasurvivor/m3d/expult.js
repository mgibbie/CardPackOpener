// expult.js — MicaSurvivor 3D, Expedition: the Ultimates (the 2D game's DLC D6).
//
// The 2D game's own numbers and its sixteen signatures (js/expedition/ultimates.js: G.ExpUlt.K, SIGS), read through
// ultFrom(G). The eighteen type choreographies are the 2D game's Z-moves (js/systems/zmoves.js plan / cont), which are
// code there and so are written again here, beat for beat: the same times, reaches, weights and effects. Lengths there
// are 2D pixels: × U here, as every other length of the 2D game's. An Ultimate reaches every height.
//
//   charge   0 to 1. Passive: full in 95 s. A KO: + 0.004 from a bucket that holds 0.024 and refills 0.008 a second (a
//            swarm cannot fill it at once). An elite or a summoner + 0.03, an alpha or a totem + 0.08, a guardian, a
//            legendary or any boss + 0.2. Damage taken: + 0.35 × the damage / your max HP. Nothing charges while casting.
//   cast     a 0.32 s hit-stop (the world holds), then the choreography. You cannot be hurt for the whole cast and
//            0.6 s after it.
//   damage   40 × (1 + 0.1 level) × (1 + 0.15 tier) × attack × 0.62 for each unit of a hit's own weight; against a
//            boss no piece takes more than 28 % of its max HP.
//   tier     the evolutions this run + Maturity + 1 for a Mega (0 to 4). A signature's name is its tier's.
//   which    a League member with a signature casts it (its type's choreography and its own beats by tier); every
//            other, its form's first type's. Mew: 1 / 2 / 3 of the other fifteen, from the run's seeded stream.
//   auto     cast as soon as it is full with a foe within 480 px (30 m).
//
// Pure and seeded: no DOM, no clock. Chance is the fight's own stream.
import { U, land, applyState, attackOf } from './combat.js';
import { groundAt, CELL } from './sim.js';
import { moveActor } from './actors.js';
import { rng as seedRng } from './gen.js';

const TAU = Math.PI * 2;
const Z_EN = { normal: 'Starlight Dash', fire: 'Pyrotechnic Holocaust', water: 'Abyssal Hydro Vortex', electric: 'Gigavolt Storm', grass: 'Cataclysmic Bloom', ice: 'Absolute Zero', fighting: 'Total Crush', poison: 'Acid Deluge', ground: 'Tectonic Fury',
	flying: 'Supersonic Dive', psychic: 'Shattered Mind', bug: 'Devastating Plague', rock: 'Continental Avalanche', ghost: 'Eternal Nightmare', dragon: 'Draconic Cataclysm', dark: 'Abyssal Eclipse', steel: 'Metal Drill', fairy: 'Dreamy Flash' };

/** The 2D game's Ultimates, as the 3D run reads them. (EN: the English its scripts registered: the page's stand-in for
 *  the game's translation table keeps them.) */
export function ultFrom(G) {
	const X = G.ExpUlt, Z = G.ZMoves; if (!X || !Z) return null;
	const en = (G.I18n && G.I18n.en) || {};
	const SIGS = {}; for (const c of X.SIG_CODES) SIGS[c] = { ...X.SIGS[c], names: X.SIGS[c].names.map((n) => en[n] || n) };
	return { K: X.K, SIGS, SIG_CODES: X.SIG_CODES.slice(), ORDER: Z.ORDER.slice(), BOSS_CAP: Z.BOSS_CAP, codeFor: (member, form) => X.codeFor(member, form) };
}

// ---------------------------------------------------------------- codes, names, tiers
export const isType = (X, c) => c >= X.K.TYPE0 && c < X.K.TYPE0 + X.ORDER.length;
export const typeOfCode = (X, c) => (isType(X, c) ? X.ORDER[c - X.K.TYPE0] : X.SIGS[c] ? X.SIGS[c].type : 'normal');
export const typeCode = (X, t) => X.K.TYPE0 + Math.max(0, X.ORDER.indexOf(t));
/** An Ultimate's name at a tier. */
export function nameOf(X, code, tier) {
	if (X.SIGS[code]) return X.SIGS[code].names[Math.min(2, Math.max(0, tier | 0))];
	return Z_EN[typeOfCode(X, code)] || 'Ultimate';
}
/** This run's tier now: its evolutions + Maturity + 1 for a Mega. */
export const tierOf = (S) => (S.lg ? Math.min(S.X.Uu.K.TIER_MAX, (S.lg.evo | 0) + (S.lg.mat | 0) + (S.lg.mega ? 1 : 0)) : 0);
/** This run's Ultimate now: its League member's signature, or its form's first type's. */
export function codeOf(S) {
	const X = S.X.Uu, pl = S.w.pl;
	if (S.lg) return X.codeFor(S.lg.member, S.lg.form);
	return typeCode(X, (pl.mon.types && pl.mon.types[0]) || 'normal');
}
/** A hit's damage for each unit of its weight. */
export function dmgOf(S, tier) {
	const K = S.X.Uu.K, pl = S.w.pl;
	return K.DMG * (1 + K.DMG_LV * (pl.level || 1)) * (1 + K.DMG_TIER * (tier | 0)) * attackOf(pl) * K.DMG_K;
}

// ---------------------------------------------------------------- the run's state
/** Ultimates for this run. o.walk(room) -> the cells you can stand on and walk back from (a dive never leaves them);
 *  o.auto: the player's setting. */
export function setupUlt(S, o = {}) {
	const w = S.w; if (!S.X.Uu || w.guest) return null;
	const K = S.X.Uu.K;
	S.ult = { c: 0, bucket: K.BUCKET, n: 0, casts: 0, sigs: 0, cast: null, iT: 0, ready: false, code: 0, head: 0, tier: 0, auto: !!o.auto, want: false, hidden: false,
		src: { passive: 0, kill: 0, elite: 0, alpha: 0, boss: 0, hurt: 0 }, names: [], walk: o.walk || null, walkRoom: null, walkMask: null };
	sync(S);
	// you cannot be hurt while casting, nor for a moment after (before a dodge or a shield is asked)
	const hooks = w.hooks || (w.hooks = {}), prev = hooks.hurt;
	hooks.hurt = (ww, d) => (S.ult.cast || S.ult.iT > 0 ? 0 : prev ? prev(ww, d) : d);
	return S.ult;
}
function sync(S) {
	const Q = S.ult, c = codeOf(S);
	Q.tier = tierOf(S);
	if (!Q.cast) { Q.code = c; Q.head = c; }
	return c;
}
function gain(S, v, src) {
	const Q = S.ult;
	if (Q.cast || !(v > 0)) return 0;
	Q.src[src] = (Q.src[src] || 0) + v;
	Q.c = Math.min(1, Q.c + v);
	return v;
}
export const ultReady = (S) => !!S.ult && S.ult.c >= 0.9999 && !S.ult.cast;
/** A press (a key, a button): cast on the next step. */
export const pressUlt = (S) => { if (S.ult) S.ult.want = true; };
/** For tests and the page's debug: set the charge (0 to 1). */
export const setCharge = (S, v) => { if (S.ult) { S.ult.c = Math.max(0, Math.min(1, v)); if (S.ult.c < 0.9999) S.ult.ready = false; } };   // (full: the next step says it is ready, as when it fills by itself)
/** Mew's copies: `n` of the other signatures, from the run's seeded stream (the seed and the cast count). */
export function copiesOf(S, n) {
	const X = S.X.Uu, r = seedRng(((S.seed >>> 0) ^ Math.imul(S.ult.casts + 1, 0x9E3779B1) ^ 0x3E7) >>> 0);
	const pool = X.SIG_CODES.filter((c) => c !== 151), out = [];
	for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
	return out;
}
/** Cast now, if it is full. -> did it? */
export function tryCast(S) {
	const Q = S.ult, w = S.w, pl = w.pl, X = S.X.Uu;
	if (!Q || pl.dead || S.ended || !ultReady(S)) return false;
	const head = sync(S), tier = Q.tier;
	const queue = X.SIGS[head] && X.SIGS[head].copies ? copiesOf(S, 1 + Math.min(2, tier)) : [head];
	Q.cast = { t: 0, hold: X.K.HITSTOP, head, tier, queue, fx: null };
	Q.c = 0; Q.ready = false; Q.casts++; Q.head = head;
	if (X.SIGS[head]) Q.sigs++;
	const name = nameOf(X, head, tier);
	Q.names.push(name);
	pl.invuln = Math.max(pl.invuln, 1);
	w.events.push({ k: 'ult', sub: 'cast', code: head, tier, name, type: typeOfCode(X, head), x: pl.s.x, y: pl.s.y, z: pl.s.z });
	return true;
}
/** The cast's hit-stop: the world holds. -> is it holding? */
export function holdUlt(S, dt) {
	const Q = S.ult;
	if (!Q || !Q.cast || !(Q.cast.hold > 0)) return false;
	if (S.w.mates.length) { Q.cast.hold = 0; return false; }   // (a party does not stop for one player's cast)
	Q.cast.hold -= dt; Q.cast.t += dt;
	S.w.pl.invuln = Math.max(S.w.pl.invuln, 0.5);
	return true;
}
function endCast(S) {
	const Q = S.ult, pl = S.w.pl;
	Q.cast = null; Q.iT = S.X.Uu.K.AFTER; Q.hidden = false;
	pl.invuln = Math.max(pl.invuln, S.X.Uu.K.AFTER);
	sync(S);
	S.w.events.push({ k: 'ult', sub: 'end' });
}
function stepCast(S, dt) {
	const Q = S.ult, c = Q.cast, pl = S.w.pl;
	if (pl.dead) { endCast(S); return; }
	c.t += dt;
	pl.invuln = Math.max(pl.invuln, 0.3);
	if (!c.fx) {
		const code = c.queue.shift();
		c.fx = makeFx(S, code, c.tier);
		Q.code = code; Q.n++;
		if (code !== c.head) S.w.events.push({ k: 'ult', sub: 'piece', code, name: nameOf(S.X.Uu, code, c.tier), type: typeOfCode(S.X.Uu, code) });
		return;
	}
	c.fx.tick(dt);
	if (c.fx.done) {
		Q.hidden = false;
		if (c.queue.length) c.fx = null;   // (Mew: the next copy, on the next step)
		else endCast(S);
	}
}
function foeNear(S) {
	const s = S.w.pl.s, r = S.X.Uu.K.AUTO_R * U;
	return S.w.enemies.some((e) => !e.dead && Math.hypot(e.a.x - s.x, e.a.z - s.z) < r);
}
/** Each step of the run, after the fight's: the charge (time, this step's KOs and hits taken), the press, auto, the cast. */
export function tickUlt(S, dt) {
	const Q = S.ult, w = S.w, pl = w.pl; if (!Q) return;
	const K = S.X.Uu.K;
	if (Q.iT > 0) Q.iT -= dt;
	if (Q.cast) { stepCast(S, dt); Q.want = false; return; }
	sync(S);
	gain(S, dt / K.PASSIVE_T, 'passive');
	Q.bucket = Math.min(K.BUCKET, Q.bucket + K.BUCKET_RATE * dt);
	for (const ev of w.events) {
		if (ev.k === 'kill') {
			if (ev.boss || ev.xk === 'guardian' || ev.xk === 'legend') gain(S, K.BOSS, 'boss');
			else if (ev.xk === 'alpha' || ev.xk === 'totem') gain(S, K.ALPHA, 'alpha');
			else if (ev.xk === 'elite' || ev.xk === 'summoner') gain(S, K.ELITE, 'elite');
			else { const take = Math.min(Q.bucket, K.KILL); Q.bucket -= take; gain(S, take, 'kill'); }
		} else if (ev.k === 'hurt' && ev.d > 0 && pl.maxHp > 0) gain(S, K.HURT * ev.d / pl.maxHp, 'hurt');
	}
	const want = Q.want; Q.want = false;
	if (ultReady(S) && !Q.ready) { Q.ready = true; w.events.push({ k: 'ult', sub: 'ready' }); }
	if (pl.dead) return;
	if (want) { if (!tryCast(S)) w.events.push({ k: 'ult', sub: 'no' }); }
	else if (Q.auto && ultReady(S) && foeNear(S)) tryCast(S);
}
/** What the screen shows of it: { pct, ready, casting, name, type, tier, auto }. */
export function ultView(S) {
	const Q = S.ult; if (!Q) return null;
	const X = S.X.Uu, code = Q.cast ? Q.cast.head : Q.head, tier = Q.cast ? Q.cast.tier : Q.tier;
	return { pct: Math.floor(Q.c * 100 + 1e-6), ready: ultReady(S), casting: !!Q.cast, name: nameOf(X, code, tier), type: typeOfCode(X, code), tier, auto: Q.auto, sig: !!X.SIGS[code] };
}

// ---------------------------------------------------------------- the choreography
/** One piece: the code's type choreography with its damage, and a signature's own beats by tier. */
export function makeFx(S, code, tier) {
	const X = S.X.Uu, fx = new Fx(S, typeOfCode(X, code));
	fx.dmg = dmgOf(S, tier); fx.code = code; fx.tier = tier;
	const sig = X.SIGS[code];
	if (sig) for (const [min, beat, a] of sig.x) if ((tier | 0) >= min && BEATS[beat]) { BEATS[beat](fx, a); fx.dur = Math.max(fx.dur, a.t + (a.d || 0) + 0.14 * (a.n || 0) + 0.6); }
	return fx;
}
const norm = (x, z) => { const l = Math.hypot(x, z); return l > 1e-9 ? [x / l, z / l] : [0, 0]; };
function segDist(px, pz, ax, az, bx, bz) {
	const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
	return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
class Fx {
	constructor(S, type) {
		const s = S.w.pl.s;
		this.S = S; this.w = S.w; this.pl = S.w.pl; this.type = type;
		this.cx = s.x; this.cz = s.z;
		this.t = 0; this.dur = 3; this.ev = []; this.done = false; this.acc = 0; this.acc2 = 0; this.st = { bs: {} }; this.xcont = [];
		this.dmg = 0;
		this.plan();
	}
	at(time, f) { this.ev.push({ time, f, fired: false }); }
	tick(dt) {
		this.t += dt;
		this.pl.invuln = Math.max(this.pl.invuln, 0.3);
		for (let i = 0; i < this.ev.length; i++) { const e = this.ev[i]; if (!e.fired && this.t >= e.time) { e.fired = true; e.f(); } }
		this.cont(dt);
		for (const f of this.xcont) f(dt);
		if (this.t >= this.dur) { this.done = true; this.S.ult.hidden = false; }
	}
	// ---- where things are
	live() { return this.w.enemies.filter((e) => !e.dead); }
	dist(e, x, z) { return Math.hypot(e.a.x - x, e.a.z - z); }
	/** The foes within `r` pixels of a point, the nearest first. */
	near(x, z, r) { const R = r * U; return this.live().filter((e) => this.dist(e, x, z) <= R).sort((a, b) => this.dist(a, x, z) - this.dist(b, x, z) || a.id - b.id); }
	gy(x, z) { const g = groundAt(this.w.room, x, z); return g > 500 ? this.pl.s.y : g; }
	rpos(rmax, rmin = 40) { const a = this.w.rand() * TAU, d = (rmin + this.w.rand() * (rmax - rmin)) * U; return [this.cx + Math.cos(a) * d, this.cz + Math.sin(a) * d]; }
	/** A foe near where the cast began (one of the ten nearest, at random), or a point at random. */
	tpos(rmax = 460) {
		const l = this.near(this.cx, this.cz, rmax);
		if (!l.length) return this.rpos(rmax * 0.7);
		const e = l[Math.floor(this.w.rand() * Math.min(l.length, 10))];
		return [e.a.x, e.a.z];
	}
	/** Where the most foes stand together (within 160 px of one another). */
	densest(rmax = 520) {
		const l = this.near(this.cx, this.cz, rmax);
		if (!l.length) { const a = this.w.rand() * TAU; return [this.cx + Math.cos(a) * 220 * U, this.cz + Math.sin(a) * 220 * U]; }
		let best = [l[0].a.x, l[0].a.z], bn = -1; const R = 160 * U;
		for (const e of l) { let n = 0; for (const o of l) if (Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z) < R) n++; if (n > bn) { bn = n; best = [e.a.x, e.a.z]; } }
		return best;
	}
	chainFrom(first, used, maxn, reach) {
		const out = []; let cur = first;
		while (cur && out.length < maxn) {
			out.push(cur); used.add(cur.id);
			let best = null, bd = reach * U;
			for (const e of this.live()) { if (used.has(e.id)) continue; const d = Math.hypot(e.a.x - cur.a.x, e.a.z - cur.a.z); if (d < bd) { bd = d; best = e; } }
			cur = best;
		}
		return out;
	}
	// ---- hits
	/** One hit of the Ultimate. Against a boss, a piece's total stops at 28 % of its max HP. */
	zhit(e, amount, dx, dz, knock = 0, poison = 0, slow = 0, cc = '') {
		if (!e || e.dead) return 0;
		const w = this.w, src = { mtype: this.type, cc, ccp: cc ? 1 : 0, poison, slow, mkind: 'zmove' };
		if (!e.boss) return land(w, e, amount, dx, dz, knock, src);
		const spent = this.st.bs[e.id] || 0, room = Math.max(0, this.S.X.Uu.BOSS_CAP * e.maxHp - spent), before = e.hp, own = e.hpFloor;
		const floor = Math.max(own || 0, before - room);   // (the cap counts after every factor: its HP cannot go under this; no floor at all when the cap's room would finish it)
		if (floor > 0) e.hpFloor = floor;
		try { land(w, e, amount, dx, dz, knock, src); } finally { if (own === undefined) delete e.hpFloor; else e.hpFloor = own; }
		const lost = Math.max(0, Math.min(room, before - e.hp));
		this.st.bs[e.id] = spent + lost;
		return lost;
	}
	/** Everything within `r` pixels of a point. */
	hit(x, z, r, k = 1, knock = 0, cc = '', poison = 0, slow = 0) {
		const R = r * U; let n = 0;
		for (const e of this.live()) if (this.dist(e, x, z) <= R + e.cr * 0.5) { const [dx, dz] = norm(e.a.x - x, e.a.z - z); this.zhit(e, this.dmg * k, dx, dz, knock, poison, slow, cc); n++; }
		return n;
	}
	hitOne(e, k, knock = 0, cc = '', poison = 0, slow = 0, from = null) {
		if (!e || e.dead) return;
		let [dx, dz] = norm(e.a.x - (from ? from[0] : this.cx), e.a.z - (from ? from[1] : this.cz));
		if (!dx && !dz) dx = 1;
		this.zhit(e, this.dmg * k, dx, dz, knock, poison, slow, cc);
	}
	/** Everything a segment touches (`w` pixels wide; once a foe while it is in `seen`). */
	hitSeg(ax, az, bx, bz, w, k, knock = 0, cc = '', seen = new Set(), poison = 0, slow = 0) {
		let n = 0;
		for (const e of this.live()) { if (seen.has(e.id)) continue; if (segDist(e.a.x, e.a.z, ax, az, bx, bz) <= w * U + e.cr * 0.5) { seen.add(e.id); this.hitOne(e, k, knock, cc, poison, slow, [ax, az]); n++; } }
		return n;
	}
	state(e, kind, k = 1) { const was = e[kind === 'freeze' ? 'frozenT' : kind + 'T'] > 0, d = applyState(this.w, e, kind); if (d > 0 && !was) e[kind === 'freeze' ? 'frozenT' : kind + 'T'] = d * k; return d; }
	slow(e, f, t) { e.slow = Math.max(e.slow, f); e.slowT = Math.max(e.slowT, t); }
	pullTo(e, x, z, speed, dt, side = 0) {
		if (e.boss) return;
		const [nx, nz] = norm(x - e.a.x, z - e.a.z);
		moveActor(e.a, this.w.room, (nx * speed - nz * side) * U * dt, (nz * speed + nx * side) * U * dt);
	}
	heal(frac) { const pl = this.pl, h = pl.maxHp * frac; pl.hp = Math.min(pl.maxHp, pl.hp + h); return h; }
	healText(total) { this.w.events.push({ k: 'ult', sub: 'heal', amount: Math.round(this.pl.maxHp * total), x: this.pl.s.x, y: this.pl.s.y, z: this.pl.s.z }); }
	// ---- you
	/** Put you at a point, if you can stand there and walk back; if not, as far towards it as you can. */
	moveTo(x, z) {
		const Q = this.S.ult, room = this.w.room, s = this.pl.s;
		if (Q.walk && Q.walkRoom !== room) { Q.walkRoom = room; Q.walkMask = Q.walk(room); }
		const ok = (px, pz) => { const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL); if (cx < 0 || cz < 0 || cx >= room.w || cz >= room.h) return false; return Q.walkMask ? !!Q.walkMask[cz * room.w + cx] : groundAt(room, px, pz) < 500; };
		const d = Math.hypot(x - s.x, z - s.z), n = Math.max(1, Math.ceil(d / 0.25));
		let tx = s.x, tz = s.z, found = false;
		for (let i = n; i >= 1; i--) { const f = i / n, px = s.x + (x - s.x) * f, pz = s.z + (z - s.z) * f; if (ok(px, pz)) { tx = px; tz = pz; found = true; break; } }
		if (!found) return false;
		s.x = tx; s.z = tz; s.y = groundAt(room, tx, tz); s.vx = s.vy = s.vz = 0; s.grounded = true; s.sliding = false; s.gliding = false; s.surfing = false; s.wall = 0; s.rail = -1;
		return true;
	}
	startDash(len, speed, tx, tz) {
		const s = this.pl.s; let [dx, dz] = norm(tx - s.x, tz - s.z);
		if (!dx && !dz) dx = 1;
		this.st.dash = { ax: s.x, az: s.z, bx: s.x + dx * len * U, bz: s.z + dz * len * U, u: 0, sp: speed / len, seen: new Set() };
	}
	// ---- what the page draws
	ring(x, z, r, life = 0.4) { this.w.events.push({ k: 'ult', sub: 'ring', x, y: this.gy(x, z), z, r: r * U, type: this.type, life }); }
	bar(ax, az, bx, bz, w, life = 0.25) { const y = this.gy(ax, az) + 0.8, l = Math.hypot(bx - ax, bz - az) || 1; this.w.events.push({ k: 'ult', sub: 'bar', from: [ax, y, az], dir: [(bx - ax) / l, 0, (bz - az) / l], len: l, w: w * U, type: this.type, life }); }
	strike(x, z, r) { this.w.events.push({ k: 'ult', sub: 'strike', x, y: this.gy(x, z), z, r: r * U, type: this.type }); }

	// ---------------- the eighteen choreographies (js/systems/zmoves.js plan)
	plan() {
		const St = this.st, s = this.pl.s, R = () => this.w.rand();
		switch (this.type) {
			case 'normal':
				this.dur = 2.9;
				for (let i = 0; i < 3; i++) this.at(0.15 + i * 0.8, () => { const [x, z] = this.tpos(520); this.startDash(470, 1250, x, z); });
				this.at(2.5, () => { this.ring(s.x, s.z, 260); this.hit(s.x, s.z, 260, 1.4, 450); });
				break;
			case 'fire':
				this.dur = 4.2;
				for (let i = 0; i < 24; i++) {
					const t0 = 0.08 + i * 0.05;
					this.at(t0, () => { const [px, pz] = this.tpos(); this.at(this.t + 1.5 + i * 0.09 - t0, () => { this.strike(px, pz, 100); this.hit(px, pz, 100, 1.15, 160); }); });
				}
				break;
			case 'water':
				this.dur = 3.6;
				this.at(0.1, () => { St.vortex = true; this.ring(this.cx, this.cz, 520, 0.7); });
				this.at(2.9, () => { St.vortex = false; this.ring(this.cx, this.cz, 400); this.hit(this.cx, this.cz, 400, 2.2, 700); });
				break;
			case 'electric': {
				this.dur = 3.6;
				const used = new Set();
				for (let ci = 0; ci < 3; ci++) {
					this.at(0.2 + ci * 0.25, () => {
						const pool = this.near(this.cx, this.cz, 560).filter((e) => !used.has(e.id));
						if (!pool.length) return;
						const chain = this.chainFrom(pool[Math.min(ci * 3, pool.length - 1)], used, 14, 300);
						chain.forEach((e, j) => {
							this.at(this.t + j * 0.1, () => {
								if (e.dead) return;
								const prev = j > 0 ? chain[j - 1] : null, from = prev ? [prev.a.x, prev.a.z] : [e.a.x, e.a.z];
								if (prev) this.bar(prev.a.x, prev.a.z, e.a.x, e.a.z, 8, 0.2); else this.strike(e.a.x, e.a.z, 30);
								this.hitOne(e, 1.1 + 0.1 * j, 150, 'para', 0, 0, from);
							});
						});
					});
				}
				break;
			}
			case 'grass':
				this.dur = 3.6;
				this.at(0.2, () => { St.roots = this.near(this.cx, this.cz, 600); this.ring(this.cx, this.cz, 600, 0.6); });
				for (let k = 0; k < 3; k++) this.at(0.9 + k * 0.6, () => { for (const e of St.roots || []) if (!e.dead) this.hitOne(e, 0.5, 0); });
				this.at(2.9, () => {
					let n = 0;
					for (const e of St.roots || []) { if (e.dead) continue; n++; this.hitOne(e, 1.8, 120); }
					const h = Math.min(0.25, 0.02 * n);
					this.heal(h); this.healText(h); this.ring(this.cx, this.cz, 300);
				});
				break;
			case 'ice':
				this.dur = 3.8;
				this.at(0.2, () => { for (const e of this.near(this.cx, this.cz, 760)) this.state(e, 'freeze', 2.4); this.ring(this.cx, this.cz, 760, 0.6); });
				this.at(2.9, () => {
					for (const e of this.near(this.cx, this.cz, 800)) { if (!(e.frozenT > 0)) continue; e.frozenT = 0; this.hitOne(e, 2.6, 120); }
					this.ring(this.cx, this.cz, 800);
				});
				break;
			case 'fighting':
				this.dur = 3.2;
				this.at(0.05, () => {
					let best = null, bh = -1;
					for (const e of this.near(this.cx, this.cz, 560)) { const sc = e.maxHp * (e.boss ? 10 : 1); if (sc > bh) { bh = sc; best = e; } }
					St.tgt = best;
					if (best) this.ring(best.a.x, best.a.z, 200);
				});
				for (let i = 0; i < 22; i++) {
					this.at(0.35 + i * 0.085, () => {
						let e = St.tgt;
						if (!e || e.dead) { e = this.near(s.x, s.z, 400)[0] || null; St.tgt = e; }
						if (e) this.hitOne(e, 0.4, 40, '', 0, 0, [s.x, s.z]);
					});
				}
				this.at(2.5, () => {
					const e = St.tgt, ok = e && !e.dead, px = ok ? e.a.x : s.x, pz = ok ? e.a.z : s.z;
					if (e) this.hitOne(e, 4.0, 650, '', 0, 0, [s.x, s.z]);
					this.ring(px, pz, 190); this.hit(px, pz, 190, 1.0, 500);
				});
				break;
			case 'poison':
				this.dur = 4.2; St.pools = [];
				for (let i = 0; i < 9; i++) this.at(0.2 + i * 0.28, () => { const [px, pz] = this.tpos(520); St.pools.push({ x: px, z: pz, end: this.t + 2.5, next: 0 }); this.ring(px, pz, 110, 2.5); });
				break;
			case 'ground':
				this.dur = 3.4;
				for (let wv = 0; wv < 3; wv++) {
					this.at(0.2 + wv * 0.85, () => {
						const base = R() * TAU, seen = new Set();
						for (let j = 0; j < 5; j++) { const a = base + TAU * j / 5, bx = this.cx + Math.cos(a) * 600 * U, bz = this.cz + Math.sin(a) * 600 * U; this.bar(this.cx, this.cz, bx, bz, 60, 0.4); this.hitSeg(this.cx, this.cz, bx, bz, 60, 2.6, 0, '', seen, 0, 0.6); }
					});
				}
				break;
			case 'flying':
				this.dur = 2.8;
				this.at(0.1, () => { this.S.ult.hidden = true; St.air = true; St.tp = this.densest(560); this.ring(St.tp[0], St.tp[1], 150, 1.4); });
				this.at(1.5, () => { St.air = false; this.moveTo(St.tp[0], St.tp[1]); this.S.ult.hidden = false; this.ring(s.x, s.z, 320); this.hit(s.x, s.z, 320, 4.2, 760); });
				break;
			case 'psychic':
				this.dur = 3.6;
				for (let k = 0; k < 6; k++) this.at(0.2 + k * 0.4, () => { for (const e of this.near(this.cx, this.cz, 560)) { this.state(e, 'conf', 1.6); this.hitOne(e, 0.28, 0); } this.ring(this.cx, this.cz, 560, 0.3); });
				this.at(2.9, () => { for (const e of this.near(this.cx, this.cz, 560)) this.hitOne(e, 0.9, 0, 'conf'); this.ring(this.cx, this.cz, 560); });
				break;
			case 'bug':
				this.dur = 3.9; St.bugs = [];
				this.at(0.2, () => { for (let j = 0; j < 16; j++) { const a = TAU * j / 16; St.bugs.push({ x: this.cx + Math.cos(a) * 40 * U, z: this.cz + Math.sin(a) * 40 * U, tgt: null, ang: a, seed: R() * 10 }); } this.ring(this.cx, this.cz, 120); });
				break;
			case 'rock':
				this.dur = 4.0; St.rolls = [];
				for (let r = 0; r < 2; r++) {
					this.at(0.2 + r * 1.9, () => {
						const [tx, tz] = this.densest(560);
						let [dx, dz] = norm(tx - this.cx, tz - this.cz);
						if (!dx && !dz) dx = 1;
						if (r === 1 && St.dir0) { dx = -St.dir0[0]; dz = -St.dir0[1]; }
						St.dir0 = [dx, dz];
						St.rolls.push({ dx, dz, px: -dz, pz: dx, sx: this.cx - dx * 520 * U, sz: this.cz - dz * 520 * U, t0: this.t, seen: new Map(), shown: 0 });
					});
				}
				break;
			case 'ghost':
				this.dur = 3.8; St.heal = 0;
				for (let k = 0; k < 8; k++) {
					this.at(0.3 + k * 0.35, () => {
						for (const e of this.near(this.cx, this.cz, 560)) {
							const [dx, dz] = norm(s.x - e.a.x, s.z - e.a.z);
							this.zhit(e, this.dmg * 0.22 + e.hp * 0.07, dx, dz, 0);
							if (St.heal < 0.18) { St.heal += 0.006; this.heal(0.006); }
						}
						this.ring(this.cx, this.cz, 560, 0.3);
					});
				}
				this.at(3.2, () => { this.healText(St.heal); this.ring(this.cx, this.cz, 560); this.hit(this.cx, this.cz, 560, 1.1, 0); });
				break;
			case 'dragon': this.dur = 3.8; break;
			case 'dark':
				this.dur = 3.6;
				this.at(0.2, () => { St.ring = 580; });
				this.at(2.8, () => { St.ring = -1; this.ring(s.x, s.z, 330); this.hit(s.x, s.z, 330, 3.0, 450); });
				break;
			case 'steel':
				this.dur = 3.0;
				this.at(0.2, () => { const [x, z] = this.densest(560); this.startDash(900, 640, x, z); });
				this.at(2.2, () => { this.ring(s.x, s.z, 260); this.hit(s.x, s.z, 260, 2.4, 520); });
				break;
			case 'fairy':
				this.dur = 3.6; St.heal = 0;
				this.at(0.2, () => { for (const e of this.near(this.cx, this.cz, 620)) this.state(e, 'sleep', 1.5); this.ring(this.cx, this.cz, 620, 0.6); });
				this.at(2.9, () => {
					let n = 0;
					for (const e of this.near(this.cx, this.cz, 640)) { if (!(e.sleepT > 0)) continue; n++; this.hitOne(e, 2.0, 80); }
					const h = Math.min(0.2, 0.012 * n);
					this.heal(h); this.healText(h); this.ring(this.cx, this.cz, 640);
				});
				break;
		}
	}
	// ---------------- what runs all through a piece (js/systems/zmoves.js cont)
	cont(dt) {
		this.acc += dt; this.acc2 += dt;
		const St = this.st, s = this.pl.s, t = this.t, cx = this.cx, cz = this.cz;
		switch (this.type) {
			case 'normal': case 'steel': {
				const d = St.dash; if (!d) break;
				d.u += dt * d.sp;
				const u = Math.min(d.u, 1), ox = s.x, oz = s.z;
				this.moveTo(d.ax + (d.bx - d.ax) * u, d.az + (d.bz - d.az) * u);
				if (this.type === 'steel') {
					if (this.acc >= 0.12) { this.acc = 0; d.seen.clear(); this.bar(ox, oz, s.x + (d.bx - d.ax) * 0.02, s.z + (d.bz - d.az) * 0.02, 62, 0.15); }
					this.hitSeg(ox, oz, s.x, s.z, 62, (0.7 + 1.3 * u) * 0.5, 160, '', d.seen);
				} else this.hitSeg(ox, oz, s.x, s.z, 78, 1.5, 280, '', d.seen);
				if (u >= 1) { if (this.type === 'normal') this.bar(d.ax, d.az, s.x, s.z, 78, 0.25); delete St.dash; }
				break;
			}
			case 'water':
				if (!St.vortex) break;
				for (const e of this.near(cx, cz, 540)) this.pullTo(e, cx, cz, 210, dt, 90);
				if (this.acc2 >= 0.22) { this.acc2 = 0; this.ring(cx, cz, 140, 0.2); this.hit(cx, cz, 140, 0.38, 0); }
				break;
			case 'grass':
				if (t > 0.2 && t < 2.9) for (const e of St.roots || []) if (!e.dead) this.slow(e, 0.97, 0.25);
				break;
			case 'fighting': {
				const e = St.tgt;
				if (e && !e.dead && t > 0.1 && t < 2.9) { this.moveTo(e.a.x - 48 * U, e.a.z + 8 * U); e.a.kx *= 0.5; e.a.kz *= 0.5; }
				break;
			}
			case 'poison':
				for (const p of St.pools || []) { if (t > p.end) continue; p.next -= dt; if (p.next <= 0) { p.next = 0.35; this.hit(p.x, p.z, 110, 0.38, 0, '', 2, 0.3); } }
				break;
			case 'bug':
				if (t >= 3.5) break;
				for (const b of St.bugs || []) {
					let tg = b.tgt;
					if (!tg || tg.dead) {
						const l = this.near(b.x, b.z, 800);
						if (!l.length) { b.tgt = null; b.ang += 3 * dt; b.x += Math.cos(b.ang) * 200 * U * dt; b.z += Math.sin(b.ang) * 200 * U * dt; continue; }
						tg = l[Math.floor(this.w.rand() * Math.min(3, l.length))]; b.tgt = tg;
					}
					const bx = b.x, bz = b.z, dvx = tg.a.x - bx, dvz = tg.a.z - bz, d = Math.hypot(dvx, dvz), [nx, nz] = norm(dvx, dvz), wob = Math.sin(t * 18 + b.seed) * 120;
					b.x = bx + (nx * 600 - nz * wob) * U * dt; b.z = bz + (nz * 600 + nx * wob) * U * dt;
					if (d < 34 * U + tg.cr * 0.5) { this.strike(tg.a.x, tg.a.z, 20); this.hitOne(tg, 0.7, 90, '', 1, 0.4, [bx, bz]); b.tgt = null; }
				}
				break;
			case 'rock':
				for (const ro of St.rolls || []) {
					const u = (t - ro.t0) / 1.7; if (u < 0 || u > 1) continue;
					const fx0 = ro.sx + ro.dx * 1040 * U * u, fz0 = ro.sz + ro.dz * 1040 * U * u;
					if (t - ro.shown >= 0.15) { ro.shown = t; this.bar(fx0 - ro.px * 430 * U, fz0 - ro.pz * 430 * U, fx0 + ro.px * 430 * U, fz0 + ro.pz * 430 * U, 80, 0.15); }
					for (let i = -5; i <= 5; i++) {
						const bx = fx0 + (ro.px * i * 78 + ro.dx * Math.sin(i * 1.7) * 18) * U, bz = fz0 + (ro.pz * i * 78 + ro.dz * Math.sin(i * 1.7) * 18) * U;
						for (const e of this.near(bx, bz, 80)) if (t - (ro.seen.has(e.id) ? ro.seen.get(e.id) : -9) > 0.45) { ro.seen.set(e.id, t); this.hitOne(e, 1.3, 380, '', 0, 0, [bx - ro.dx * 60 * U, bz - ro.dz * 60 * U]); }
					}
				}
				break;
			case 'dragon':
				if (t < 3.6 && this.acc2 >= 0.1) {
					this.acc2 = 0; const seen = new Set();
					for (let j = 0; j < 4; j++) { const a = t * 3.4 + j * Math.PI / 2, bx = s.x + Math.cos(a) * 540 * U, bz = s.z + Math.sin(a) * 540 * U; this.bar(s.x, s.z, bx, bz, 46, 0.1); this.hitSeg(s.x, s.z, bx, bz, 46, 0.75, 140, '', seen); }
				}
				break;
			case 'dark': {
				if (!(St.ring > 0)) break;
				const k = Math.max(0, Math.min(1, (t - 0.2) / 2.6)), Rr = 580 + (90 - 580) * k;
				St.R = Rr;
				for (const e of this.near(cx, cz, Rr + 80)) if (this.dist(e, cx, cz) > (Rr - 60) * U) { this.pullTo(e, cx, cz, 230, dt); this.slow(e, 0.5, 0.3); }
				if (this.acc2 >= 0.3) { this.acc2 = 0; this.ring(cx, cz, Rr, 0.3); for (const e of this.near(cx, cz, Rr + 70)) if (this.dist(e, cx, cz) > (Rr - 70) * U) this.hitOne(e, 0.5, 0); }
				break;
			}
			case 'fairy':
				if (t > 0.3 && t < 2.8 && this.acc2 >= 0.25) { this.acc2 = 0; this.heal(0.012); St.heal = (St.heal || 0) + 0.012; }
				break;
		}
	}
}

// ---------------------------------------------------------------- the signatures' beats (js/expedition/ultimates.js BEATS)
const BEATS = {
	/** a shock ring round you */
	ring(fx, a) { fx.at(a.t, () => { const s = fx.pl.s; fx.ring(s.x, s.z, a.r); fx.hit(s.x, s.z, a.r, a.k, 240, a.cc || ''); }); },
	/** n beams from you, the first at the densest group */
	beams(fx, a) {
		fx.at(a.t, () => {
			const s = fx.pl.s, [tx, tz] = fx.densest(620), a0 = Math.atan2(tz - s.z, tx - s.x) || 0, seen = new Set(), wd = a.w || 30;
			for (let j = 0; j < a.n; j++) { const g = a0 + TAU * j / a.n, bx = s.x + Math.cos(g) * a.len * U, bz = s.z + Math.sin(g) * a.len * U; fx.bar(s.x, s.z, bx, bz, wd, 0.3); fx.hitSeg(s.x, s.z, bx, bz, wd + 16, a.k, 200, a.cc || '', seen); }
		});
	},
	/** n strikes from the sky on foes near you */
	smite(fx, a) { for (let i = 0; i < a.n; i++) fx.at(a.t + i * 0.09, () => { const [x, z] = fx.tpos(540); fx.strike(x, z, 85); fx.hit(x, z, 85, a.k, 120, a.cc || 'para'); }); },
	/** you dive onto the densest group */
	dive(fx, a) { fx.at(a.t, () => { const [x, z] = fx.densest(560); fx.moveTo(x, z); const s = fx.pl.s; fx.ring(s.x, s.z, a.r); fx.hit(s.x, s.z, a.r, a.k, 600, a.cc || ''); }); },
	/** n meteors on foes, each landing 0.2 s after it shows */
	meteors(fx, a) { for (let i = 0; i < a.n; i++) fx.at(a.t + i * 0.14, () => { const [x, z] = fx.tpos(560), r = a.r || 100; fx.ring(x, z, r, 0.2); fx.at(fx.t + 0.2, () => { fx.strike(x, z, r); fx.hit(x, z, r, a.k, 200, a.cc || ''); }); }); },
	/** a nova from you: the ring closes in, then bursts */
	nova(fx, a) { fx.at(a.t - 0.3, () => { const s = fx.pl.s; fx.ring(s.x, s.z, a.r, 0.3); }); fx.at(a.t, () => { const s = fx.pl.s; fx.ring(s.x, s.z, a.r * 1.1, 0.5); fx.hit(s.x, s.z, a.r, a.k, 700, a.cc || ''); }); },
	/** foes within r are pulled to you for d seconds */
	pull(fx, a) { fx.xcont.push((dt) => { if (fx.t < a.t || fx.t > a.t + a.d) return; const s = fx.pl.s; for (const e of fx.near(s.x, s.z, a.r)) fx.pullTo(e, s.x, s.z, 240, dt); }); },
	/** foes near lose a share of their life (not a boss); you heal a little for each */
	drain(fx, a) {
		fx.at(a.t, () => {
			const s = fx.pl.s; let n = 0;
			for (const e of fx.near(s.x, s.z, 560)) { n++; const [dx, dz] = norm(s.x - e.a.x, s.z - e.a.z); fx.zhit(e, (e.boss ? 0 : e.hp * a.p) + fx.dmg * 0.4, dx, dz, 0); }
			const h = Math.min(0.1, 0.004 * n);
			fx.heal(h); fx.healText(h); fx.ring(s.x, s.z, 300);
		});
	},
	heal(fx, a) { fx.at(a.t, () => { fx.heal(a.f); fx.healText(a.f); fx.ring(fx.pl.s.x, fx.pl.s.z, 90); }); },
};
export const BEAT_NAMES = Object.keys(BEATS);
