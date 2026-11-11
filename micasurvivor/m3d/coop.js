// m3d/coop.js — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): playing a fight together. Pure: it makes and
// reads the messages; a transport carries them. Who decides what is the 2D game's rule (js/net/coop.js), kept:
//   THE HOST      the enemies (arriving, moving, their HP, their going down), what lies on the floor, the team's
//                 experience and level, the weather, the clock.
//   EACH PLAYER   their own Pokémon: where it is, its HP, its moves, and what hits it. A guest's hits on enemies are
//                 SENT to the host, which applies them.
// A guest fights COPIES of the host's enemies, drawn a moment in the past between the host's frames (net.js), with its
// own body and moves real and immediate. The host has a PUPPET of each guest (a body its enemies can go for, moved by
// the guest's reports and carried on by its speed between them).
//
//   host:   hostAdd(world, id, dex) · hostStep(world, dt) before each tick · hostFrame(world, events) to send ·
//           hostApply(world, id, message) on a guest's message
//   guest:  guestWorld(room, data, options) · guestSync(world, dt) before each tick · guestMsg(world) to send ·
//           guestApply(world, frame) on the host's frame
import { K, groundAt } from './sim.js';
import { knock } from './actors.js';
import { newWorld, applyState, CK, U } from './combat.js';
import { frame, Viewer, NK } from './net.js';

const P = NK.POS, V = NK.VEL;
export const CO = { AWAY: 3, STALL: 2.5 };   // s: a guest unheard this long is away; a host unheard this long, and the guest's fight stands still
const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const ang = (b) => b * 6.2832 / 256;
/** A body from a player's row ([x, y, z, vx, vy, vz, facing, bits, hp, maxHp, …], whole numbers). */
function bodyFrom(s, p) {
	s.x = p[0] / P; s.y = p[1] / P; s.z = p[2] / P; s.vx = p[3] / V; s.vy = p[4] / V; s.vz = p[5] / V; s.facing = ang(p[6]);
	s.grounded = !!(p[7] & 1); s.sliding = !!(p[7] & 2); s.swimming = !!(p[7] & 4); s.gliding = !!(p[7] & 8); s.stagger = p[7] & 16 ? 0.1 : 0;
	return s;
}

// ---------------------------------------------------------------- the host
/** Another player joins the host's fight: a puppet its enemies can see. */
export function hostAdd(w, id, dex) {
	const mon = w.data.mon(dex), sp = w.room.spawn;
	const m = { id, dex, mon, r: w.data.radius(dex), magnet: CK.MAGNET * U, dead: false, hp: mon.hp, maxHp: mon.hp, lv: 1, gifts: [], heard: 0, field: null, fieldCell: -2,
		s: { x: sp[0], y: sp[1], z: sp[2], vx: 0, vy: 0, vz: 0, facing: 0, grounded: true, sliding: false, swimming: false, gliding: false, stagger: 0, t: 0, airJumps: 0 } };
	w.mates.push(m);
	return m;
}
export function hostRemove(w, id) { w.mates = w.mates.filter((m) => m.id !== id); }
/** Before each of the host's ticks: carry each puppet on by its last known speed (it is told where it really is ten
 *  times a second), and hold the fight while anyone still has a card to choose. */
export function hostStep(w, dt = K.TICK) {
	for (const m of w.mates) {
		m.heard += dt;
		if (m.heard < 0.5 && !m.dead) { const s = m.s; s.x += s.vx * dt; s.z += s.vz * dt; s.t += dt; if (!s.grounded && !s.swimming) { s.vy -= K.FALL_GRAVITY * dt; s.y = Math.max(groundAt(w.room, s.x, s.z), s.y + s.vy * dt); } }
	}
	// a guest not heard from for 3 s is AWAY: enemies stop going for it, and nobody waits for it to choose a card
	for (const m of w.mates) m.away = m.heard > CO.AWAY;
	w.waiting = w.mates.some((m) => !m.away && m.lv < w.pl.level);
	w.allDown = w.pl.dead && w.mates.every((m) => m.dead || m.away);
}
/** The host's frame for its guests: the fight (net.js), and what a guest needs beyond what a watcher does: what each
 *  enemy's touch does, every other player, enemy shots with their damage, and whether the fight is waiting. */
export function hostFrame(w, events) {
	const f = frame(w, events), by = new Map(w.enemies.map((e) => [e.id, e]));
	for (const r of f.e) { const e = by.get(r[0]); r.push(Math.round(e.dmg * 10), e.tg || 0); }
	f.m = w.mates.map((m) => { const s = m.s; return [m.id, m.dex, Math.round(s.x * P), Math.round(s.y * P), Math.round(s.z * P), Math.round(((s.facing % 6.2832) + 6.2832) % 6.2832 * 256 / 6.2832) & 255,
		(s.grounded ? 1 : 0) | (s.sliding ? 2 : 0) | (s.swimming ? 4 : 0) | (m.dead ? 32 : 0), Math.ceil(m.hp), m.maxHp]; });
	f.x = w.eshots.map((p) => [p.id, Math.round(p.x * P), Math.round(p.y * P), Math.round(p.z * P), Math.round(p.vx * V), Math.round(p.vy * V), Math.round(p.vz * V), Math.round(p.dmg * 10), Math.max(0, TYPES.indexOf(p.mtype)), Math.round((p.life - p.t) * 100)]);
	f.c = { wait: w.waiting || w.pl.pending > 0 ? 1 : 0, host: w.pl.mon.dex }; if (w.allDown) f.c.over = 1;
	const gifts = {}; for (const m of w.mates) if (m.gifts.length) gifts[m.id] = m.gifts.splice(0); if (Object.keys(gifts).length) f.c.gifts = gifts;
	return f;
}
/** A guest's message arrives: where it is, what its moves hit, which enemies touched it, the level it has chosen through. */
export function hostApply(w, id, msg) {
	const m = w.mates.find((q) => q.id === id); if (!m || !msg) return false;
	m.heard = 0;
	if (msg.p) { bodyFrom(m.s, msg.p); m.dead = !!(msg.p[7] & 32); m.hp = msg.p[8]; m.maxHp = msg.p[9]; }
	if (msg.lv) m.lv = Math.max(m.lv, msg.lv);
	for (const h of msg.h || []) {
		const e = w.enemies.find((q) => q.id === h.id); if (!e || e.dead) continue;
		w.hit(e, h.d, h.kx, h.kz, h.kn);
		w.stats.dealt += h.d; w.stats.hits++;
		w.events.push({ k: 'hit', id: e.id, x: e.a.x, y: e.a.y + 1, z: e.a.z, d: h.d, crit: false, eff: 1, by: id });
		if (e.dead) continue;
		if (h.wake) e.sleepT = 0;
		if (h.burn) { e.burn = Math.min(8, e.burn + h.burn); e.burnT = 3; }
		if (h.poison) { e.poison = Math.min(8, e.poison + h.poison); e.poisonT = 4; }
		if (h.slow) { e.slow = Math.max(e.slow, h.slow); e.slowT = Math.max(e.slowT, 1.2); }
		if (h.cc) applyState(w, e, h.cc);
	}
	for (const eid of msg.tc || []) {   // it touched the guest: it pauses and is shoved back, as when it touches you
		const e = w.enemies.find((q) => q.id === eid); if (!e || e.dead) continue;
		e.touchCd = CK.TOUCH_CD;
		const dx = e.a.x - m.s.x, dz = e.a.z - m.s.z, l = Math.hypot(dx, dz) || 1; knock(e.a, dx / l * CK.TOUCH_KNOCK * U, dz / l * CK.TOUCH_KNOCK * U);
	}
	return true;
}

// ---------------------------------------------------------------- a guest
/** A guest's side of the fight: its own body and moves; the enemies are copies (kept by guestSync). `id`: its number in
 *  the party (the host is 0). */
export function guestWorld(room, data, o = {}) {
	const w = newWorld(room, data, { ...o, guest: true, weather: false, cast: null, bosses: null });
	w.co = { id: o.id || 1, viewer: new Viewer(), hostT: -1, known: new Map(), shots: new Set(), queue: [], mates: [], hostDex: 0, seenEv: -1, silent: 0, stalled: false, over: false };
	w.partners = () => w.co.mates;
	return w;
}
/** The host's frame arrives. */
export function guestApply(w, f) {
	const co = w.co, whole = co.viewer.push(f); if (!whole) return false;
	co.silent = 0; co.stalled = false; co.over = !!(whole.c && whole.c.over);
	const at = whole.t * K.TICK, pl = w.pl;
	// the team's level is the host's: a level you have not chosen a card for yet is yours to choose
	while (pl.level < whole.p[10]) { pl.level++; pl.pending++; w.stats.levels++; }
	pl.xp = whole.p[11]; pl.xpNext = whole.p[12];
	w.waiting = !!(whole.c && whole.c.wait) && pl.pending === 0;
	if (whole.c) { co.hostDex = whole.c.host; for (const g of (whole.c.gifts && whole.c.gifts[co.id]) || []) if (g.k === 'heal') pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * g.v); }
	// what will hurt you: enemy shots and marks on the ground, each released when the fight you see reaches its moment
	for (const r of whole.x || []) { if (co.shots.has(r[0])) continue; co.shots.add(r[0]); co.queue.push({ at, shot: r }); }
	if (co.shots.size > 3000) co.shots = new Set((whole.x || []).map((r) => r[0]));
	for (const ev of whole.v || []) if (ev.k === 'hazard') co.queue.push({ at, hazard: ev.h });
	return true;
}
/** Before each of the guest's ticks: move the clock of the fight it sees, bring the copies up to it, and let in the
 *  shots and marks whose moment has come. -> the view (net.js), for the page to draw the rest from. */
export function guestSync(w, dt = K.TICK) {
	const co = w.co, v = co.viewer; if (!v.frames.length) return null;
	// the host has gone quiet (its tab is hidden, its line is down): the fight stands still here until it is heard again
	co.silent += dt; if (co.silent > CO.STALL) { co.stalled = true; w.waiting = true; }
	const newest = v.newest, want = newest - NK.DELAY;
	if (!w.waiting && !(w.pl.pending > 0)) co.hostT = co.hostT < 0 || Math.abs(want - co.hostT) > 0.6 ? want : Math.min(newest, co.hostT + dt * (want - co.hostT > 0.05 ? 1.08 : want - co.hostT < -0.05 ? 0.92 : 1));
	const view = v.sample(co.hostT); if (!view) return null;
	// the copies
	const rows = new Map(); for (const fr of [view.fb, view.fa]) if (fr && fr.e) for (const r of fr.e) if (!rows.has(r[0])) rows.set(r[0], r);
	const alive = new Set();
	for (const e of view.enemies) {
		alive.add(e.id);
		let c = co.known.get(e.id);
		if (!c) { const mon = w.data.mon(e.dex), row = rows.get(e.id) || []; c = { id: e.id, dex: e.dex, copy: true, types: mon.types && mon.types.length ? mon.types : ['normal'], cr: w.data.radius(e.dex, e.scale), a: { x: 0, y: 0, z: 0, facing: 0, hover: CK.FLY_HOVER, grounded: true },
			maxHp: 1000, hp: 1000, touchCd: 0, frozenT: 0, sleepT: 0, paraT: 0, confT: 0, slow: 0, burn: 0, poison: 0, dead: false, dummy: false, flash: 0, shield: 0, dmg: (row[9] || 0) / 10, def: {} };
			c.atkType = c.types[0]; co.known.set(e.id, c); }
		const row = rows.get(e.id);
		c.a.x = e.a.x; c.a.y = e.a.y; c.a.z = e.a.z; c.a.facing = e.a.facing; c.hp = e.hp * 1000; c.boss = e.boss; c.fly = e.fly; c.scale = e.scale; c.shield = e.shield; if (e.flash) c.flash = Math.max(c.flash, 0.1);
		if (row) { c.dmg = (row[9] || 0) / 10; c.tg = row[10] || 0; c.frozenT = row[7] & 32 ? 1 : 0; }
	}
	for (const id of [...co.known.keys()]) if (!alive.has(id)) co.known.delete(id);
	w.enemies = [...co.known.values()];
	// the other players, to draw: the host, and every mate that is not you
	co.mates = [{ id: 0, dex: co.hostDex, s: { ...view.pl.s }, hp: view.pl.hp, maxHp: view.pl.maxHp, dead: view.pl.dead }];
	const fa = view.fa && view.fa.m ? view.fa : view.fb, fb = view.fb && view.fb.m ? view.fb : fa;
	if (fb && fb.m) { const old = new Map((fa.m || []).map((r) => [r[0], r])), k = fa === fb ? 0 : view.k; for (const r of fb.m) { if (r[0] === co.id) continue; const o = old.get(r[0]) || r;
		co.mates.push({ id: r[0], dex: r[1], s: { x: (o[2] + (r[2] - o[2]) * k) / P, y: (o[3] + (r[3] - o[3]) * k) / P, z: (o[4] + (r[4] - o[4]) * k) / P, vx: 0, vy: 0, vz: 0, facing: ang(r[5]), grounded: !!(r[6] & 1), sliding: !!(r[6] & 2), swimming: !!(r[6] & 4), stagger: 0, t: view.t }, hp: r[7], maxHp: r[8], dead: !!(r[6] & 32) }); } }
	// what has come due
	for (let i = co.queue.length - 1; i >= 0; i--) {
		const q = co.queue[i]; if (q.at > co.hostT) continue;
		co.queue.splice(i, 1);
		const late = Math.max(0, co.hostT - q.at);
		if (q.shot) { const r = q.shot, vx = r[4] / V, vy = r[5] / V, vz = r[6] / V; w.eshots.push({ id: -r[0], x: r[1] / P + vx * late, y: r[2] / P + vy * late, z: r[3] / P + vz * late, vx, vy, vz, dmg: r[7] / 10, r: CK.ESHOT.r * U, life: Math.max(0.05, r[9] / 100 - late), t: 0, mtype: TYPES[r[8]] }); }
		else { const h = q.hazard; w.hazards.push({ id: -(w.nextId++), t: late, hit: false, kind: h.kind, x: h.x, y: h.y, z: h.z, r: h.r, angle: h.angle, len: h.len, w: h.w, delay: h.delay, dmg: h.dmg || 0, type: h.type, quiet: true }); }
	}
	view.mates = co.mates;
	return view;
}
/** What a guest tells the host: where it is, what its moves hit since the last message, which enemies touched it, and
 *  the level it has chosen cards through. */
export function guestMsg(w) {
	return { p: frame(w).p.slice(0, 10), h: w.out.splice(0), tc: w.touches.splice(0), lv: w.pl.level - w.pl.pending };
}
