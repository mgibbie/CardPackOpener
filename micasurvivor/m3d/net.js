// m3d/net.js — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): what a fight looks like to someone who is NOT
// running it — a spectator, a co-op guest watching the host's enemies, a replay. Pure: no DOM, no network; a transport
// (peer-to-peer, the relay through /api/mp, a tape) carries the strings this makes.
//
//   frame(world)            a FRAME: the fight at one instant, as small whole numbers (positions in centimetres, a
//                           facing in 256ths of a turn, HP in thousandths). Height and "in the air" are in it, which
//                           the 2D format never had. The camera is not: each screen has its own.
//   diff / patch            a frame as its difference from the one before (most enemies moved a little)
//   Viewer                  frames in, the fight at ANY moment out: between two frames a body on the ground is moved
//                           in a straight line, and a body in the air along the arc gravity gives it — so at ten frames
//                           a second, or one, a jump is a jump and a fall off a ledge is a fall, not a slide
//   Tape                    a recorded fight (v3): a header that rebuilds the level (seed, biome, size) and frames, a
//                           whole one every few seconds and differences between. play() gives a Viewer over it
//   bundle / unbundle       several frames in one message, for a transport that carries one message a second (the
//                           relay): you every frame, the enemies every few
//
// What a watcher needs that is not a position — a swing's arc, a beam, a blast, a damage number — rides in the frame as
// the fight's own events since the last frame.
import { K } from './sim.js';
import { AK } from './actors.js';
import { CK } from './combat.js';

export const NK = {
	HZ: 10,              // frames a second, live (a frame every 6 ticks)
	TAPE_HZ: 5,          // …and on a tape
	KEY_EVERY: 25,       // a tape holds a whole frame every this many (5 s); the rest are differences
	POS: 100, VEL: 10,   // 1 cm; 0.1 m/s
	DELAY: 0.15,         // s: a watcher shows the fight this far in the past, so it always has a frame on each side
	SITE_DELAY: 2.6,     // …and this far over the site's own lines (exprelay.js: a second's frames published, then polled)
	RELAY_DELAY: 1.15,   // …and this far when frames come a second's worth at a time
	RELAY_CAP: 16000,    // characters in one relay message (the server's)
	RELAY_ENEMY_EVERY: 5,   // in a bundle of ten frames the enemies are in every fifth: two a second
	EVENTS: ['melee', 'aura', 'beam', 'chain', 'blast', 'smite', 'bomb', 'heal', 'shield', 'summon', 'hazard', 'boom', 'hit', 'kill', 'hurt', 'dash', 'weather', 'boss', 'enrage', 'level', 'pickup', 'say', 'rx', 'rxchain', 'ult', 'secondchance', 'tele', 'slam', 'chest', 'landmark', 'plug'],   // (the last five: a Dive's red ground, its chests, landmark and secret pockets)
};
const q = (v, k) => Math.round(v * k);
const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
export const PICK = ['xp', 'xpBig', 'heal', 'magnet', 'bomb'];
const ti = (t) => Math.max(0, TYPES.indexOf(t));

/** The fight now, as a frame. `events`: the fight's events since the last frame (the caller gathers them each tick). */
export function frame(w, events = null) {
	const pl = w.pl, s = pl.s, P = NK.POS, V = NK.VEL;
	const bits = (s.grounded ? 1 : 0) | (s.sliding ? 2 : 0) | (s.swimming ? 4 : 0) | (s.gliding ? 8 : 0) | (s.stagger > 0 ? 16 : 0) | (pl.dead ? 32 : 0) | (pl.invuln > 0 && pl.invuln < 1e8 ? 64 : 0) | (s.wall ? 128 : 0) | (s.rail >= 0 ? 256 : 0) | (s.surfing ? 512 : 0);   // (128: carried by a wall; 256: on a rail; 512: surfing a bank)
	const f = {
		t: w.tick,
		// you: where, how fast, which way, what you are doing; then the numbers the readout shows
		p: [q(s.x, P), q(s.y, P), q(s.z, P), q(s.vx, V), q(s.vy, V), q(s.vz, V), q(((s.facing % 6.2832) + 6.2832) % 6.2832 * 256 / 6.2832, 1) & 255, bits, Math.ceil(pl.hp), pl.maxHp, pl.level, Math.floor(pl.xp), pl.xpNext, w.stats.kills],
		// enemies: id, species, where, facing, HP in thousandths, flags (1 hit just now, 2 boss, 4 shielded, 8 in the air, 16 a flyer, 32 stunned, 64 a shiny), size in halves
		e: w.enemies.filter((e) => !e.dead).map((e) => [e.id, e.dex, q(e.a.x, P), q(e.a.y, P), q(e.a.z, P), q(((e.a.facing % 6.2832) + 6.2832) % 6.2832 * 256 / 6.2832, 1) & 255, Math.max(0, Math.round(e.hp / e.maxHp * 1000)),
			(e.flash > 0 ? 1 : 0) | (e.boss ? 2 : 0) | (e.shield > 0 ? 4 : 0) | (!e.fly && !e.a.grounded && !e.a.swimming ? 8 : 0) | (e.fly ? 16 : 0) | (e.frozenT > 0 || e.sleepT > 0 || e.confT > 0 ? 32 : 0) | (e.shiny ? 64 : 0), Math.round((e.scale || 1) * 2)]),
		// everything drawn as a ball: your shots and orbs (their type's colour), enemy shots (type 31), pickups (32 + kind)
		b: [...w.shots.map((p) => [p.id, q(p.x, P), q(p.y, P), q(p.z, P), q(Math.max(0.14, p.r), P), ti(p.mtype)]), ...w.orbs.map((p) => [p.id, q(p.x, P), q(p.y, P), q(p.z, P), q(Math.max(0.16, p.r), P), ti(p.mtype)]),
			...w.eshots.map((p) => [p.id, q(p.x, P), q(p.y, P), q(p.z, P), q(Math.max(0.2, p.r), P), 31]),
			// what lies in the world: mines, turrets, a meteor coming down, a lobbed bomb on its arc
			...w.fields.filter((o) => o.kind === 'mine' || o.kind === 'turret' || (o.kind === 'meteor' && o.t > 0)).map((o) => { const k = o.kind === 'meteor' ? Math.max(0, Math.min(1, o.t / o.fall)) : 1; return [o.id, q(o.x + (1 - k) * 2.5, P), q(o.y + (o.kind === 'mine' ? 0.18 : o.kind === 'turret' ? 1 : 0.3 + (1 - k) * 10), P), q(o.z, P), o.kind === 'mine' ? 20 : o.kind === 'turret' ? 34 : 45, ti(o.m.type)]; }),
			...w.effects.filter((o) => o.k === 'lob').map((o) => { const k = Math.min(1, o.t / o.dur); return [o.id, q(o.x0 + (o.x - o.x0) * k, P), q(o.y0 + (o.y - o.y0) * k + Math.sin(k * Math.PI) * CK.EXP.lobHigh / 16, P), q(o.z0 + (o.z - o.z0) * k, P), 30, ti(o.m.type)]; }), ...w.pickups.map((p) => [p.id, q(p.x, P), q(p.y + 0.3, P), q(p.z, P), p.kind === 'xp' ? 15 : 25, 32 + Math.max(0, PICK.indexOf(p.kind))])],
	};
	if (w.weather) f.w = [w.weather.kind, Math.ceil(w.weather.dur - w.weather.t)];
	// marks on the floor for what has been put down since the last frame (a patch, a whirl, where a meteor, a bomb or a
	// strike will land): { k: 'mark', x, y, z, r, type, life, inner }
	const seen = w.netSeen || (w.netSeen = new Set()), marks = [], r2 = (v) => Math.round(v * 100) / 100;
	const mark = (o, life, inner) => { if (seen.has(o.id)) return; seen.add(o.id); marks.push({ k: 'mark', x: r2(o.x), y: r2(o.y), z: r2(o.z), r: r2(o.r), type: ti(o.m.type), life: r2(life), inner }); };
	for (const o of w.fields) { if (o.kind === 'patch') mark(o, o.life - o.t, 0); else if (o.kind === 'meteor') mark(o, Math.max(0.05, o.fall - o.t), 0.9); }
	for (const o of w.effects) { if (o.k === 'lob' || o.k === 'smite') mark(o, Math.max(0.05, o.dur - o.t), 0.9); else if (o.k === 'vortex') mark(o, o.dur - o.t, 0.25); }
	if (seen.size > 4000) w.netSeen = new Set([...w.fields, ...w.effects].map((o) => o.id));
	const ev = marks.length ? [...(events || []), ...marks] : events;
	if (ev && ev.length) f.v = ev;
	return f;
}
/** Keep, of a tick's events, what a watcher draws (rounded, and no more than a frame can carry). */
export function keepEvents(into, events) {
	const P = NK.POS, r = (v) => (typeof v === 'number' ? Math.round(v * P) / P : v);
	for (const ev of events) {
		if (!NK.EVENTS.includes(ev.k) || into.length >= 60) continue;
		if (ev.k === 'hit') into.push({ k: 'hit', x: r(ev.x), y: r(ev.y), z: r(ev.z), d: Math.round(ev.d), crit: ev.crit ? 1 : 0, eff: ev.eff > 1.2 ? 2 : ev.eff < 0.9 ? 0 : 1 });
		else if (ev.k === 'hazard' || ev.k === 'boom') { const h = ev.h; into.push({ k: ev.k, h: { kind: h.kind, x: r(h.x), y: r(h.y), z: r(h.z), r: r(h.r || 0), angle: r(h.angle || 0), len: r(h.len || 0), w: r(h.w || 0), delay: h.delay, type: h.type, dmg: r(h.dmg || 0) } }); }
		else if (ev.k === 'beam' || ev.k === 'dash') into.push({ k: ev.k, id: ev.id, from: ev.from.map(r), dir: ev.dir.map((v) => Math.round(v * 1000) / 1000), len: r(ev.len), w: r(ev.w) });
		else if (ev.k === 'ult') { const o = { ...ev }; for (const key of ['x', 'y', 'z', 'r', 'len', 'w']) if (typeof o[key] === 'number') o[key] = r(o[key]); if (o.from) o.from = o.from.map(r); into.push(o); }
		else if (ev.k === 'rx') into.push({ k: 'rx', kind: ev.kind, x: r(ev.x), y: r(ev.y), z: r(ev.z), r: r(ev.r || 0) });
		else if (ev.k === 'rxchain') into.push({ k: 'rxchain', from: ev.from.map(r), links: ev.links.map((l) => l.map(r)) });
		else if (ev.k === 'chain') into.push({ k: 'chain', id: ev.id, links: ev.links.map((l) => l.map(r)) });
		else { const o = {}; for (const key in ev) o[key] = r(ev[key]); into.push(o); }
	}
	return into;
}

// ---------------------------------------------------------------- a frame as a difference
// A row is [id, …fixed, x, y, z, …rest]: an enemy has one fixed column (its species), a ball none. A row whose id was in
// the frame before is sent as [-id, dx, dy, dz, …rest] (how far it moved; the fixed columns are known), or not at all if
// nothing about it changed. New ids are sent whole; ids that are gone are listed.
function laneDiff(a, b, fixed) {
	const old = new Map(a.map((r) => [r[0], r])), out = [], gone = [], X = 1 + fixed;
	for (const r of b) {
		const o = old.get(r[0]);
		if (!o) { out.push(r); continue; }
		old.delete(r[0]);
		const row = [-r[0], r[X] - o[X], r[X + 1] - o[X + 1], r[X + 2] - o[X + 2]]; let same = row[1] === 0 && row[2] === 0 && row[3] === 0;
		for (let i = X + 3; i < r.length; i++) { row.push(r[i]); if (r[i] !== o[i]) same = false; }
		if (!same) out.push(row);
	}
	for (const id of old.keys()) gone.push(id);
	return [out, gone];
}
function lanePatch(a, rows, gone, fixed) {
	const dead = new Set(gone || []), by = new Map(), order = [], X = 1 + fixed;
	for (const r of a) if (!dead.has(r[0])) { by.set(r[0], r); order.push(r[0]); }
	for (const r of rows || []) {
		if (r[0] > 0) { if (!by.has(r[0])) order.push(r[0]); by.set(r[0], r); continue; }
		const o = by.get(-r[0]); if (!o) continue;
		by.set(o[0], [...o.slice(0, X), o[X] + r[1], o[X + 1] + r[2], o[X + 2] + r[3], ...r.slice(4)]);
	}
	return order.map((id) => by.get(id));
}
/** `cur` as its difference from `prev`: enemies and balls that are in both are sent as how far they moved. (The order
 *  of rows is the order of the frame before, then the new ones: a frame's rows are a set, not a list.) */
export function diff(prev, cur) {
	const d = { t: cur.t, p: cur.p.map((v, i) => (i < 8 ? v : v - prev.p[i])), d: 1 };
	[d.e, d.eg] = laneDiff(prev.e, cur.e, 1); [d.b, d.bg] = laneDiff(prev.b, cur.b, 0);
	if (!d.eg.length) delete d.eg; if (!d.bg.length) delete d.bg;
	if (cur.w) d.w = cur.w; else if (prev.w) d.w = 0;
	if (cur.v) d.v = cur.v;
	for (const key of ['m', 'x', 'c']) if (cur[key]) d[key] = cur[key];   // (co-op's lanes: the other players, enemy shots, the party's state)
	if (cur.r && JSON.stringify(cur.r) !== JSON.stringify(prev.r || null)) d.r = cur.r;   // (an Expedition run's row, expnet.js: only when it has changed)
	return d;
}
/** The frame a difference stands for, given the frame before it. */
export function patch(prev, d) {
	if (!d.d) return d;
	const f = { t: d.t, p: d.p.map((v, i) => (i < 8 ? v : v + prev.p[i])) };
	f.e = lanePatch(prev.e, d.e, d.eg, 1); f.b = lanePatch(prev.b, d.b, d.bg, 0);
	if (d.w) f.w = d.w; else if (d.w === undefined && prev.w) f.w = prev.w;
	if (d.v) f.v = d.v;
	for (const key of ['m', 'x', 'c']) if (d[key]) f[key] = d[key];
	if (d.r) f.r = d.r; else if (prev.r) f.r = prev.r;   // (the run's row stays until a new one comes)
	return f;
}
/** Two frames hold the same fight (rows compared as sets, by id). */
export function sameFrame(a, b) {
	const norm = (f) => JSON.stringify({ t: f.t, p: f.p, e: f.e.slice().sort((x, y) => x[0] - y[0]), b: f.b.slice().sort((x, y) => x[0] - y[0]), w: f.w || null, v: f.v || null });
	return norm(a) === norm(b);
}

// ---------------------------------------------------------------- watching
const ang = (b) => b * 6.2832 / 256;
const lerpAng = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
/** A height between two frames: on the ground a straight line; in the air the arc that passes through both heights
 *  under gravity `g` (so a jump is a jump at any frame rate). dt: seconds between the frames; k: 0..1. */
export function arc(y0, y1, k, dt, g, air) { return y0 + (y1 - y0) * k + (air ? 0.5 * g * dt * dt * k * (1 - k) : 0); }
/** A value between two frames that also say how fast it was changing at each (a cubic through both): exact for a body
 *  moving under a constant pull, so your jump is drawn from your own speeds, not guessed. */
export function hermite(p0, v0, p1, v1, k, dt) { const k2 = k * k, k3 = k2 * k; return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * dt * v0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * dt * v1; }

/** Frames in, the fight at any moment out. */
export class Viewer {
	constructor() { this.frames = []; this.events = []; this.last = null; }
	/** A frame (whole, or a difference from the last one pushed). */
	push(f) { if (f.d && !this.last) return null;   // (joined part-way: nothing to build a difference on until a whole frame comes)
		const whole = f.d ? patch(this.last, f) : f; if (!whole || whole.d) return null; if (whole.e) this.last = whole; this.frames.push(whole); if (this.frames.length > 400) this.frames.splice(0, this.frames.length - 400); return whole; }
	get newest() { return this.frames.length ? this.frames[this.frames.length - 1].t * K.TICK : 0; }
	/** The fight at time `t` (seconds on the fight's own clock). Objects shaped like the live fight's, for the page:
	 *  { pl: { s, hp, maxHp, level, xp, xpNext, dead }, enemies: [{ id, dex, a: { x, y, z, facing }, flash, boss, shield, scale, hp }],
	 *    balls: [[x, y, z, r, kind]], weather, kills, t, events: the events of the frames passed since the last sample }. */
	sample(t) {
		const F = this.frames; if (!F.length) return null;
		let i = F.length - 1; while (i > 0 && F[i].t * K.TICK > t) i--;
		const a = F[i], b = F[Math.min(F.length - 1, i + 1)], ta = a.t * K.TICK, tb = b.t * K.TICK, dt = Math.max(1e-6, tb - ta), k = b === a ? 0 : Math.max(0, Math.min(1, (t - ta) / dt)), P = NK.POS, V = NK.VEL;
		// you: drawn from where you were AND how fast you were going at both frames (a jump's arc, a slide's slowing).
		// Frames too far apart for that to mean anything (over a third of a second) are joined by a straight line.
		const pa = a.p, pb = b.p, cur = k < 0.5 ? pa : pb, H = dt <= 0.34 && !(pa[7] & 1 && pb[7] & 1);
		const at = (c) => (H ? hermite(pa[c] / P, pa[c + 3] / V, pb[c] / P, pb[c + 3] / V, k, dt) : (pa[c] + (pb[c] - pa[c]) * k) / P);
		const s = { x: at(0), y: at(1), z: at(2), vx: (pa[3] + (pb[3] - pa[3]) * k) / V, vy: (pa[4] + (pb[4] - pa[4]) * k) / V, vz: (pa[5] + (pb[5] - pa[5]) * k) / V,
			facing: lerpAng(ang(pa[6]), ang(pb[6]), k), grounded: !!(cur[7] & 1), sliding: !!(cur[7] & 2), swimming: !!(cur[7] & 4), gliding: !!(cur[7] & 8), stagger: cur[7] & 16 ? 0.1 : 0, wall: cur[7] & 128 ? 1 : 0, rail: cur[7] & 256 ? 0 : -1, surfing: !!(cur[7] & 512), t, airJumps: 0 };
		const view = { t, fa: a, fb: b, k, pl: { s, hp: cur[8], maxHp: cur[9], level: cur[10], xp: cur[11], xpNext: cur[12], dead: !!(cur[7] & 32), hurt: !!(cur[7] & 64) }, kills: cur[13], enemies: [], balls: [], weather: cur === pa ? a.w || null : b.w || null, events: [] };
		// enemies and balls: between the two nearest frames that carry them (a relay's thin frames carry only you)
		let ia = i; while (ia > 0 && !F[ia].e) ia--; let ib = Math.min(F.length - 1, i + 1); while (ib < F.length - 1 && !F[ib].e) ib++;
		const EA = F[ia].e ? F[ia] : F[ib], EB = F[ib].e ? F[ib] : EA;
		if (!EA.e) return view;
		const tA = EA.t * K.TICK, dE = Math.max(1e-6, EB.t * K.TICK - tA), kE = EA === EB ? 0 : Math.max(0, Math.min(1, (t - tA) / dE));
		const old = new Map(EA.e.map((r) => [r[0], r]));
		for (const r of EB.e) {
			const o = old.get(r[0]) || r, inAir = !!(o[7] & 8) || !!(r[7] & 8);   // (in the air at either frame: an arc, not a line)
			view.enemies.push({ id: r[0], dex: r[1], a: { x: (o[2] + (r[2] - o[2]) * kE) / P, y: arc(o[3] / P, r[3] / P, kE, dE, AK.GRAVITY, inAir), z: (o[4] + (r[4] - o[4]) * kE) / P, facing: lerpAng(ang(o[5]), ang(r[5]), kE), hover: CK.FLY_HOVER },
				hp: r[6] / 1000, flash: (kE < 0.5 ? o[7] : r[7]) & 1 ? 0.1 : 0, boss: !!(r[7] & 2), shield: r[7] & 4 ? 1 : 0, fly: !!(r[7] & 16), shiny: !!(r[7] & 64), scale: r[8] / 2 });
		}
		const oldB = new Map(EA.b.map((r) => [r[0], r]));
		for (const r of EB.b) { const o = oldB.get(r[0]) || r; view.balls.push([(o[1] + (r[1] - o[1]) * kE) / P, (o[2] + (r[2] - o[2]) * kE) / P, (o[3] + (r[3] - o[3]) * kE) / P, r[4] / P, r[5]]); }
		// the events of every frame the clock has passed since the last sample (each once)
		for (const f of F) { if (f.t <= (this.seen || -1) || f.t * K.TICK > t) continue; if (f.v) for (const ev of f.v) view.events.push(ev); this.seen = f.t; }
		return view;
	}
}
export const typeName = (i) => TYPES[i];
export const ballColour = (kind, typeColour, pickColour) => (kind === 31 ? '#ff5f8f' : kind >= 32 ? pickColour[PICK[kind - 32]] : typeColour[TYPES[kind]]);

// ---------------------------------------------------------------- a tape
/** A recorded fight. header: what rebuilds the level and names who played ({ seed, biome, size, dex, moves, … }). */
export class Tape {
	constructor(header) { this.v = 3; this.h = header || {}; this.f = []; this.prev = null; this.n = 0; }
	/** Record a frame (the caller decides how often: NK.TAPE_HZ). */
	add(fr) { const key = this.n % NK.KEY_EVERY === 0 || !this.prev; this.f.push(key ? fr : diff(this.prev, fr)); this.prev = fr; this.n++; }
	/** The tape as text. */
	pack() { return JSON.stringify({ v: 3, h: this.h, f: this.f }); }
	static unpack(text) { const o = JSON.parse(text); if (!o || o.v !== 3) throw new Error('not a 3D tape (v3): ' + (o && o.v)); const t = new Tape(o.h); t.f = o.f; t.n = o.f.length; return t; }
	/** A Viewer holding the whole tape, and how long it runs (seconds). */
	play() { const v = new Viewer(); v.frames = []; let prev = null; for (const fr of this.f) { prev = prev ? patch(prev, fr) : fr; v.frames.push(prev); } v.last = prev; return { viewer: v, from: v.frames.length ? v.frames[0].t * K.TICK : 0, to: v.newest }; }
}

// ---------------------------------------------------------------- one message a second
/** Several frames as one message: you in every frame, the enemies and balls in every `every`-th. */
export function bundle(frames, every = NK.RELAY_ENEMY_EVERY) {
	return JSON.stringify(frames.map((f, i) => (i % every === every - 1 || i === frames.length - 1 ? f : (f.v ? { t: f.t, p: f.p, v: f.v } : { t: f.t, p: f.p }))));
}
/** …and back: the frames, to push into a Viewer in order (a thin one has no `e`: the Viewer draws the enemies between
 *  the whole frames on either side of it). */
export const unbundle = (text) => JSON.parse(text);
