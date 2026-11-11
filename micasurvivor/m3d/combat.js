// m3d/combat.js — MicaSurvivor 3D, P3 (Plans/MICASURVIVOR_3D_PLAN.md): enemies and combat on the height field. Pure and
// seeded: no DOM, no Math.random, a fixed tick. It reads the SAME data as the 2D game (G.Moves, G.Types, G.Enemies,
// G.DEX, the sprites' sizes) and keeps the 2D game's numbers: on flat ground a fight here is the fight there
// (micasurvivor_m3d_parity_test.mjs plays both and compares). What 3D adds is height:
//   * a shot is a ball that flies at chest height, aimed up or down at its target, and stops at terrain;
//   * a swing, an aura, a touch only reach a body about as high as you are (jump over a ground enemy and it cannot
//     touch you; an enemy on the ledge above is out of a Tackle's reach);
//   * a beam is a straight line in space, cut where it meets the ground;
//   * the target is the nearest enemy you can SEE, if there is one;
//   * a hit's knockback is a real shove: off a ledge, if that is where it sends the body (actors.js).
// Lengths in the data are the 2D game's world units (32 to a tile); here a tile is a 2 m cell, so 1 unit = 1/16 m.
import { CELL, K, step, newState, noInput, groundAt } from './sim.js';
import { newActor, stepActor, knock, flowField, steer, moveActor } from './actors.js';
import { rng as makeRng } from './gen.js';

export const U = CELL / 32;   // metres in one 2D world unit
export const CK = {
	MUZZLE: 0.8,        // m above the feet: where shots leave from and what they are aimed at
	REACH_UP: 1.2,      // m: a swing or an aura reaches bodies whose feet are within this of yours, up or down (a ramp's
	                    // worth, not the 1.5 m ledge above)
	TOUCH_UP: 1.0,      // m: an enemy's touch reaches you only this far up or down (a jump clears it)
	BODY_MIN: 1.2,      // m: the least height of a body as a shot sees it (a body is a cylinder 2 radii high)
	FLY_HOVER: 0.6,     // m: flyers hang low enough to touch you, high enough to be over a walker's head
	AIM: 520,           // units: how far the auto-aim looks (the 2D game's)
	INVULN: 0.45, TOUCH_CD: 0.55, TOUCH_KNOCK: 150, MELEE_GUARD: 1.5, MELEE_TAKEN: 0.75, CRIT: 1.5,
	KNOCK_DECAY: 0.0015,   // per second (the 2D game's): a shove is all but gone in a second
	HP_K: (t) => 3.3 + Math.min(1.7, t / 210), DMG_K: 2.4, XP_K: 5.6,
	CAP: 110, DENSITY: 0.24, SPAWN_MIN: 16, SPAWN_MAX: 32,   // m: enemies arrive this far from you (no camera in the rules)
	UNPORTED: ['buff', 'boomerang', 'mine', 'meteor', 'turret', 'dash', 'trail', 'cone'],   // kinds still to come
};
const TARGETED = ['melee', 'beam', 'projectile', 'boomerang', 'chain', 'meteor', 'dash', 'cone'];
const reach = (m) => (m.xreach ? m.xreach : m.kind === 'melee' ? m.radius + 30 : m.kind === 'beam' ? m.radius + 20 : m.kind === 'chain' ? 280 : 520);

/** The 2D game's data, as this module reads it. G: the game's global, with util, pokedex, sprites-meta, sprites, moves,
 *  types and enemies loaded. */
export function dataFrom(G) {
	return {
		move: (id, lvl = 1) => { const m = G.Moves.instance(id, lvl); m.knock = G.Moves.knockOf(m); return m; },   // (a move's knockback is worked out from its level, as the 2D game does)
		typeMult: (t, types) => G.Types.mult(t, types), mon: (dex) => G.DEX_BY[dex],
		radius: (dex, scale = 1) => G.Sprites.bodyRadius(dex, scale) * U, hovers: (dex) => G.Sprites.hovers(dex),
		tiers: G.Enemies.TIERS, defFor: (dex, ti) => G.Enemies.defFor(G.DEX_BY[dex], G.Enemies.TIERS[ti], ti),
		tierAt: (t) => { let ti = 0; G.Enemies.TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; }); return ti; },
	};
}

/** A fight. o: { dex (who you play), moves: [id | [id, lvl]], seed, tune (sim tuning), afDmg (the all-moves factor: 1.1 in
 *  Expedition), atkK / takenK (the ability's factors, 1 if none), crit, cast: [dex] (who spawns; none: nothing spawns),
 *  orbitSquash (0.7: the 2D game's flattened orbit; 1: a circle) } */
export function newWorld(room, data, o = {}) {
	const mon = data.mon(o.dex || 25), s = newState(room, o.tune || K);
	const w = {
		room, data, t: 0, tick: 0, rand: makeRng((o.seed >>> 0) || 1), tune: o.tune || K, nextId: 1,
		pl: { s, mon, r: data.radius(mon.dex), maxHp: mon.hp, hp: mon.hp, baseAtk: mon.atk, atkMul: 1, atkK: o.atkK || 1, takenK: o.takenK || 1, cdMul: 1, crit: o.crit || 0, reduction: 0, regen: 0,
			invuln: 0, meleeT: 0, level: 1, afDmg: o.afDmg === undefined ? 1.1 : o.afDmg, target: null, aim: 0, dead: false,
			moves: (o.moves || []).map((m) => (Array.isArray(m) ? data.move(m[0], m[1]) : data.move(m))) },
		enemies: [], shots: [], orbs: [], field: null, fieldCell: -2,
		cast: o.cast || null, spawnAcc: 0, cap: o.cap || CK.CAP, orbitSquash: o.orbitSquash || 1,
		stats: { dealt: 0, removed: 0, hits: 0, crits: 0, taken: 0, touched: 0, kills: 0, xp: 0, fired: 0, spawned: 0, fell: 0, blocked: 0 },
		events: [],   // this tick's: { k: 'hit' | 'kill' | 'hurt' | 'shot' | 'melee' | 'beam' | 'aura' | 'chain', … } for the page to draw
	};
	return w;
}
const atk = (pl) => pl.baseAtk * pl.atkMul * pl.atkK;
const rnd = (w, a, b) => a + w.rand() * (b - a);

/** Put an enemy in. o: { t (the run time its stats are scaled for; default now), ti (tier), hp, dmg, spd (factors),
 *  dummy (it does not chase and never touches; a shove still moves it), y } */
export function addEnemy(w, dex, x, z, o = {}) {
	const d = w.data, t = o.t === undefined ? w.t : o.t, ti = o.ti === undefined ? d.tierAt(t) : o.ti, def = d.defFor(dex, ti), mon = d.mon(dex);
	const fly = !!d.hovers(dex), cr = d.radius(dex);
	const maxHp = Math.round(def.hp * (1 + t / 95) * CK.HP_K(t) * (o.hp || 1));
	const a = newActor(w.room, { x, z, y: o.y, r: Math.min(0.45, cr), speed: def.spd * (1 + Math.min(0.35, t / 1400)) * (o.spd === undefined ? 1 : o.spd) * U, fly, hover: CK.FLY_HOVER });
	const e = { id: w.nextId++, a, dex, def, types: mon.types && mon.types.length ? mon.types : ['normal'], cr, fly, maxHp, hp: maxHp,
		dmg: def.dmg * (1 + t / 420) * CK.DMG_K * (o.dmg || 1), xp: Math.round(def.xp * CK.XP_K), touchCd: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0,
		dead: false, dummy: !!o.dummy, flash: 0 };
	e.atkType = e.types[0];
	w.enemies.push(e); w.stats.spawned++;
	return e;
}
const bodyH = (e) => Math.max(CK.BODY_MIN, e.cr * 2);

// ---------------------------------------------------------------- damage
function hurtEnemy(w, e, amount, kx, kz, knockU) {
	if (e.dead) return 0;
	const d = Math.max(1, Math.round(amount));
	e.hp -= d; e.flash = 0.12; w.stats.removed += d;
	if (knockU > 0) { const l = Math.hypot(kx, kz) || 1; knock(e.a, kx / l * knockU * U, kz / l * knockU * U); }
	if (e.hp <= 0) { e.dead = true; w.stats.kills++; w.stats.xp += e.xp; w.events.push({ k: 'kill', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, xp: e.xp }); }
	return d;
}
/** A move's hit lands (the 2D game's `land`): type chart, crit, the all-moves factor. src: the move or the shot. */
function land(w, e, dmg, kx, kz, knockU, src) {
	const pl = w.pl, type = src.mtype || src.type;
	let k = type ? w.data.typeMult(type, e.types) : 1;
	const c = pl.crit + (src.xcrit || 0), crit = c > 0 && w.rand() < c;
	if (crit) { k *= CK.CRIT; w.stats.crits++; }
	if (src.mid || src.id) k *= pl.afDmg;
	const d = dmg * k;
	hurtEnemy(w, e, d, kx, kz, knockU);
	w.stats.dealt += d; w.stats.hits++;
	w.events.push({ k: 'hit', id: e.id, x: e.a.x, y: e.a.y + bodyH(e) * 0.5, z: e.a.z, d, crit, type, eff: type ? w.data.typeMult(type, e.types) : 1 });
	if (src.burn) { e.burn = Math.min(8, e.burn + src.burn); e.burnT = 3; }
	if (src.poison) { e.poison = Math.min(8, e.poison + src.poison); e.poisonT = 4; }
	if (src.slow) { e.slow = Math.max(e.slow, src.slow); e.slowT = Math.max(e.slowT, 1.2); }
	return d;
}
function hurtPlayer(w, amount, type) {
	const pl = w.pl;
	if (pl.invuln > 0 || pl.dead) return 0;
	if (type) amount *= w.data.typeMult(type, pl.mon.types);
	amount *= pl.takenK;
	const d = Math.max(1, amount * (1 - pl.reduction) * (pl.meleeT > 0 ? CK.MELEE_TAKEN : 1));
	pl.hp -= d; pl.invuln = CK.INVULN; w.stats.taken += d;
	w.events.push({ k: 'hurt', d, type });
	if (pl.hp <= 0) { pl.hp = 0; pl.dead = true; }
	return d;
}

// ---------------------------------------------------------------- seeing and aiming
/** Is there a clear line between two points in space? (terrain only; sampled every metre) */
export function clearLine(room, ax, ay, az, bx, by, bz) {
	const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d);
	for (let i = 1; i < n; i++) { const f = i / n; if (groundAt(room, ax + (bx - ax) * f, az + (bz - az) * f) > ay + (by - ay) * f + 1e-6) return false; }
	return true;
}
const dist3 = (s, a) => Math.hypot(a.x - s.x, a.y - s.y, a.z - s.z);
function pickTarget(w) {
	const s = w.pl.s, max = CK.AIM * U;
	let seen = null, sd = max, any = null, ad = max;
	for (const e of w.enemies) {
		if (e.dead) continue;
		const d = dist3(s, e.a);
		if (d >= ad && d >= sd) continue;
		if (d < ad) { ad = d; any = e; }
		if (d < sd && clearLine(w.room, s.x, s.y + CK.MUZZLE, s.z, e.a.x, e.a.y + CK.MUZZLE, e.a.z)) { sd = d; seen = e; }
	}
	return seen || any;
}
/** The unit direction from the player's muzzle along `aim` (a ground-plane angle: (cos, sin) on (x, z)), tilted at the target. */
function aimDir(w, a) {
	const pl = w.pl, s = pl.s, t = pl.target;
	let pitch = 0;
	if (t && !t.dead) { const h = Math.hypot(t.a.x - s.x, t.a.z - s.z); pitch = Math.atan2(t.a.y - s.y, Math.max(h, 0.5)); }   // (muzzle to muzzle: level on flat ground)
	const c = Math.cos(pitch);
	return [Math.cos(a) * c, Math.sin(pitch), Math.sin(a) * c];
}

// ---------------------------------------------------------------- the moves
function payload(m) { return { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type, mkind: m.kind, mid: m.id, xcrit: m.xcrit || 0 }; }
function shoot(w, m, dir) {
	const s = w.pl.s;
	w.shots.push(Object.assign({ id: w.nextId++, x: s.x + dir[0] * 3 * U, y: s.y + CK.MUZZLE + dir[1] * 3 * U, z: s.z + dir[2] * 3 * U, vx: dir[0] * m.speed * U, vy: dir[1] * m.speed * U, vz: dir[2] * m.speed * U,
		dmg: m.dmg * atk(w.pl), r: m.size * U, life: m.life, t: 0, pierce: m.pierce | 0, hits: new Set(), px: null, py: 0, pz: 0 }, payload(m)));
	w.stats.fired++;
}
const KINDS = {
	projectile(w, m) {
		const n = Math.max(1, m.count | 0), spread = m.spread || 0;
		for (let i = 0; i < n; i++) shoot(w, m, aimDir(w, w.pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n) + rnd(w, -0.03, 0.03)));
		w.events.push({ k: 'shot', id: m.id, n });
	},
	nova(w, m) {
		const n = Math.max(3, m.count | 0);
		for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + rnd(w, -0.06, 0.06); shoot(w, m, [Math.cos(a), 0, Math.sin(a)]); }
		w.events.push({ k: 'shot', id: m.id, n });
	},
	melee(w, m) {
		const pl = w.pl, s = pl.s, half = Math.min(m.arc, 6.2832) / 2, R = m.radius * U, dmg = m.dmg * atk(pl);
		pl.meleeT = CK.MELEE_GUARD;
		for (const e of w.enemies) {
			if (e.dead || Math.abs(e.a.y - s.y) > CK.REACH_UP) continue;
			const dx = e.a.x - s.x, dz = e.a.z - s.z, rr = R + e.cr;
			if (dx * dx + dz * dz > rr * rr) continue;
			if (Math.abs(((Math.atan2(dz, dx) - pl.aim + Math.PI * 3) % 6.2832) - Math.PI) > half) continue;
			land(w, e, dmg, dx, dz, m.knock || 0, m);
		}
		w.events.push({ k: 'melee', id: m.id, aim: pl.aim, r: R, arc: m.arc });
	},
	beam(w, m) {
		const pl = w.pl, s = pl.s, dir = aimDir(w, pl.aim), W = m.width * U, ox = s.x, oy = s.y + CK.MUZZLE, oz = s.z, dmg = m.dmg * atk(pl);
		let len = m.radius * U;
		for (let d = 0.5; d < len; d += 0.5) if (groundAt(w.room, ox + dir[0] * d, oz + dir[2] * d) > oy + dir[1] * d + 1e-6) { len = d; break; }   // cut where it meets the ground
		for (const e of w.enemies) {
			if (e.dead) continue;
			const px = e.a.x - ox, py = e.a.y + CK.MUZZLE - oy, pz = e.a.z - oz, along = px * dir[0] + py * dir[1] + pz * dir[2];
			if (along < -e.cr || along > len + e.cr) continue;
			const qx = px - dir[0] * along, qy = py - dir[1] * along, qz = pz - dir[2] * along;
			if (Math.hypot(qx, qy, qz) <= W / 2 + e.cr) land(w, e, dmg, dir[0], dir[2], m.knock || 0, m);
		}
		w.events.push({ k: 'beam', id: m.id, from: [ox, oy, oz], dir, len, w: W });
	},
	aura(w, m) {
		const pl = w.pl, s = pl.s, R = m.radius * U, dmg = m.dmg * atk(pl);
		for (const e of w.enemies) {
			if (e.dead || Math.abs(e.a.y - s.y) > CK.REACH_UP) continue;
			const dx = e.a.x - s.x, dz = e.a.z - s.z, rr = R + e.cr;
			if (dx * dx + dz * dz <= rr * rr) land(w, e, dmg, dx, dz, m.knock || 0, m);
		}
		w.events.push({ k: 'aura', id: m.id, r: R });
	},
	chain(w, m) {
		const pl = w.pl, s = pl.s;
		let cur = pl.target && !pl.target.dead ? pl.target : null, k = 1, fx = s.x, fz = s.z;
		const done = new Set(), n = Math.max(1, m.count | 0), R = m.radius * U, links = [];
		for (let i = 0; i < n && cur; i++) {
			done.add(cur.id);
			const hex = m.hex && (cur.burn > 0 || cur.poison > 0 || cur.slow > 0) ? m.hex : 1;
			links.push([cur.a.x, cur.a.y + CK.MUZZLE, cur.a.z]);
			land(w, cur, m.dmg * atk(pl) * k * hex, cur.a.x - fx, cur.a.z - fz, 0, m);
			k *= 0.85; fx = cur.a.x; fz = cur.a.z;
			let best = null, bd = R;
			for (const e of w.enemies) { if (e.dead || done.has(e.id)) continue; const d = dist3(cur.a, e.a); if (d < bd) { bd = d; best = e; } }
			cur = best;
		}
		w.events.push({ k: 'chain', id: m.id, links });
	},
};
function orbit(w, m) {
	const pl = w.pl, want = Math.max(1, m.count | 0), mine = w.orbs.filter((p) => p.mid === m.id);
	const relayout = mine.length !== want, base = mine.length ? mine[0].oa : w.t * m.speed;
	if (mine.length > want) { const drop = new Set(mine.slice(want)); w.orbs = w.orbs.filter((p) => !drop.has(p)); }
	for (let i = mine.length; i < want; i++) w.orbs.push(Object.assign({ id: w.nextId++, oa: (i / want) * 6.2832, hitLog: new Map(), x: 0, y: 0, z: 0 }, payload(m), { mkind: 'orbit' }));
	const live = w.orbs.filter((p) => p.mid === m.id);
	live.forEach((p, i) => { p.dmg = m.dmg * atk(pl); p.orad = m.radius * U; p.ospeed = m.speed; p.r = m.size * U; p.rehit = Math.max(0.12, m.cd); p.knock = m.knock || 0; if (relayout) p.oa = base + (i / live.length) * 6.2832; });
}
function fireMoves(w, dt) {
	const pl = w.pl, s = pl.s;
	for (const m of pl.moves) {
		if (m.kind === 'orbit') { orbit(w, m); continue; }
		m.t -= dt;
		if (m.t > 0) continue;
		const run = KINDS[m.kind];
		if (!run) { m.t = 1; continue; }   // (a kind not ported yet: CK.UNPORTED)
		if (TARGETED.includes(m.kind) && !(pl.target && dist3(s, pl.target.a) <= reach(m) * U)) { m.t = 0.05; continue; }
		m.t = Math.max(0.05, m.cd * pl.cdMul);
		run(w, m);
	}
}

// ---------------------------------------------------------------- shots
function segDist2(ax, az, bx, bz, cx, cz) {
	const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
	let t = l2 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
	const qx = ax + dx * t - cx, qz = az + dz * t - cz;
	return [qx * qx + qz * qz, t];
}
function moveShots(w, dt) {
	const pl = w.pl, s = pl.s;
	for (const p of w.orbs) { p.oa += p.ospeed * dt; p.x = s.x + Math.cos(p.oa) * p.orad; p.z = s.z + Math.sin(p.oa) * p.orad * w.orbitSquash; p.y = s.y + CK.MUZZLE; }
	for (let i = w.shots.length - 1; i >= 0; i--) {
		const p = w.shots[i];
		p.t += dt;
		if (p.t >= p.life) { w.shots.splice(i, 1); continue; }
		p.px = p.x; p.py = p.y; p.pz = p.z;
		p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
	}
}
function resolve(w) {
	const pl = w.pl, s = pl.s;
	for (let i = w.shots.length - 1; i >= 0; i--) {
		const p = w.shots[i];
		if (groundAt(w.room, p.x, p.z) > p.y) { w.shots.splice(i, 1); w.stats.blocked++; w.events.push({ k: 'thud', x: p.x, y: p.y, z: p.z }); continue; }   // into a wall, a rise, the ground
		const sx = p.px === null ? p.x : p.px, sy = p.px === null ? p.y : p.py, sz = p.px === null ? p.z : p.pz;
		for (const e of w.enemies) {
			if (e.dead || p.hits.has(e.id)) continue;
			const rr = p.r + e.cr, [d2, f] = segDist2(sx, sz, p.x, p.z, e.a.x, e.a.z);
			if (d2 > rr * rr) continue;
			const y = sy + (p.y - sy) * f;                       // the shot's height where it passes the body
			if (y < e.a.y - p.r || y > e.a.y + bodyH(e) + p.r) continue;   // over its head, or under its feet
			p.hits.add(e.id);
			land(w, e, p.dmg, p.vx, p.vz, p.knock, p);
			if (p.pierce > 0) p.pierce--; else { w.shots.splice(i, 1); break; }
		}
	}
	for (const p of w.orbs) {
		for (const e of w.enemies) {
			if (e.dead || Math.abs(e.a.y - s.y) > CK.REACH_UP) continue;
			const rr = p.r + e.cr, dx = e.a.x - p.x, dz = e.a.z - p.z;
			if (dx * dx + dz * dz > rr * rr) continue;
			if (w.t - (p.hitLog.get(e.id) || -99) < p.rehit) continue;
			p.hitLog.set(e.id, w.t);
			if (p.hitLog.size > 300) for (const [k, t] of p.hitLog) if (w.t - t > p.rehit) p.hitLog.delete(k);
			land(w, e, p.dmg, dx, dz, p.knock, p);
		}
	}
	// an enemy's touch
	if (pl.dead) return;
	for (const e of w.enemies) {
		if (e.dead || e.dummy || e.touchCd > 0) continue;
		const dx = e.a.x - s.x, dz = e.a.z - s.z, rr = e.cr + pl.r;
		if (dx * dx + dz * dz > rr * rr) continue;
		if (Math.abs((e.fly ? e.a.y - CK.FLY_HOVER : e.a.y) - s.y) > CK.TOUCH_UP) continue;   // (jump over it; it is on the ledge above; …)
		e.touchCd = CK.TOUCH_CD; w.stats.touched++;
		hurtPlayer(w, e.dmg, e.atkType);
		const l = Math.hypot(dx, dz) || 1; knock(e.a, dx / l * CK.TOUCH_KNOCK * U, dz / l * CK.TOUCH_KNOCK * U);
	}
}

// ---------------------------------------------------------------- enemies
const WISH = [0, 0];
function updateEnemies(w, dt) {
	const pl = w.pl, s = pl.s;
	// the way to the player: rebuilt when the player's cell changes (and only while standing on something walkable)
	const cell = Math.floor(s.z / CELL) * w.room.w + Math.floor(s.x / CELL);
	if (!w.field || (cell !== w.fieldCell && (s.grounded || s.swimming))) { w.field = flowField(w.room, s.x, s.z, w.field); w.fieldCell = cell; }
	w.field.x = s.x; w.field.z = s.z;
	for (const e of w.enemies) {
		if (e.dead) continue;
		if (e.flash > 0) e.flash -= dt;
		if (e.touchCd > 0) e.touchCd -= dt;
		if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
		if (e.burn > 0) { e.burnT -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.5; hurtEnemy(w, e, 1.6 * e.burn * (1 + pl.level * 0.06), 0, 0, 0); } if (e.burnT <= 0) e.burn = 0; }
		if (e.poison > 0) { e.poisonT -= dt; e.poisonTick -= dt; if (e.poisonTick <= 0) { e.poisonTick = 0.6; hurtEnemy(w, e, e.maxHp * 0.012 * e.poison + 1, 0, 0, 0); } if (e.poisonT <= 0) e.poison = 0; }
		if (e.dead) continue;
		if (e.dummy) WISH[0] = WISH[1] = 0; else steer(w.room, w.field, e.a, WISH);
		stepActor(e.a, w.room, WISH[0], WISH[1], dt, 1 - e.slow);
		if (e.a.fell > 1) { w.stats.fell++; w.events.push({ k: 'fell', id: e.id, h: e.a.fell }); }
		if (e.a.gone) { e.dead = true; }
	}
	// keep them out of each other (the 2D game's rule: 82 % of the two radii, a push of 42 units a second)
	const L = w.enemies;
	for (let i = 0; i < L.length; i++) {
		const e = L[i]; if (e.dead || e.dummy) continue;
		let px = 0, pz = 0, n = 0;
		for (let j = 0; j < L.length && n <= 6; j++) {
			const o = L[j]; if (j === i || o.dead || o.fly !== e.fly) continue;
			const dx = e.a.x - o.a.x, dz = e.a.z - o.a.z, min = (e.cr + o.cr) * 0.82, d2 = dx * dx + dz * dz;
			if (d2 >= min * min || d2 < 1e-12 || Math.abs(e.a.y - o.a.y) > CK.REACH_UP) continue;
			const d = Math.sqrt(d2), f = (min - d) / min; px += dx / d * f; pz += dz / d * f; n++;
		}
		if (n) moveActor(e.a, w.room, px * 42 * U * dt, pz * 42 * U * dt);
	}
	for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
}

// ---------------------------------------------------------------- arrivals
const spawnRate = (t) => (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * CK.DENSITY;
function spawnTick(w, dt) {
	if (!w.cast || !w.cast.length) return;
	if (w.enemies.length >= w.cap) return;
	w.spawnAcc = Math.min(8, w.spawnAcc + spawnRate(w.t) * dt);
	while (w.spawnAcc >= 1 && w.enemies.length < w.cap) {
		w.spawnAcc -= 1;
		const dex = w.cast[Math.floor(w.rand() * w.cast.length)], fly = !!w.data.hovers(dex), s = w.pl.s, room = w.room;
		for (let k = 0; k < 12; k++) {
			const a = w.rand() * 6.2832, d = rnd(w, CK.SPAWN_MIN, CK.SPAWN_MAX), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
			const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
			if (cx < 1 || cz < 1 || cx >= room.w - 1 || cz >= room.h - 1) continue;
			const i = cz * room.w + cx;
			if (room.cells[i] >= (room.rimH || 8)) continue;
			if (!fly && (w.field.dist[i] < 0 || room.water.has(i))) continue;   // a walker arrives where it can walk to you from
			addEnemy(w, dex, x, z);
			break;
		}
	}
}

// ---------------------------------------------------------------- one tick
/** Advance the fight one tick. input: sim.js's ({ mx, mz, jump, crouch }). The order is the 2D game's: you, arrivals,
 *  enemies, your moves, shots, hits and touches. */
export function tick(w, input, dt = K.TICK) {
	const pl = w.pl, s = pl.s;
	w.events.length = 0;
	w.t += dt; w.tick++;
	if (!pl.dead) {
		step(s, input || noInput(), w.room, dt, w.tune);
		if (pl.invuln > 0) pl.invuln -= dt;
		if (pl.meleeT > 0) pl.meleeT -= dt;
		if (pl.regen > 0) pl.hp = Math.min(pl.maxHp, pl.hp + pl.regen * dt);
		const t = pl.target = pickTarget(w);
		if (t) pl.aim = Math.atan2(t.a.z - s.z, t.a.x - s.x); else if (Math.hypot(s.vx, s.vz) > 0.5) pl.aim = Math.atan2(s.vz, s.vx);
	}
	if (!w.field) { w.field = flowField(w.room, s.x, s.z); w.fieldCell = Math.floor(s.z / CELL) * w.room.w + Math.floor(s.x / CELL); }
	spawnTick(w, dt);
	updateEnemies(w, dt);
	if (!pl.dead) fireMoves(w, dt);
	moveShots(w, dt);
	resolve(w);
	return w;
}

/** A fight's fingerprint: every number that matters, rounded to a tenth of a millimetre. */
export function hashWorld(w) {
	let h = 0x811c9dc5;
	const add = (v) => { const n = Math.round(v * 1e4) | 0; for (let k = 0; k < 4; k++) { h ^= (n >>> (k * 8)) & 255; h = Math.imul(h, 0x01000193) >>> 0; } };
	const s = w.pl.s; for (const v of [s.x, s.y, s.z, w.pl.hp, w.t, w.stats.dealt, w.stats.taken, w.stats.kills, w.enemies.length, w.shots.length]) add(v);
	for (const e of w.enemies) { add(e.id); add(e.a.x); add(e.a.y); add(e.a.z); add(e.hp); }
	for (const p of w.shots) { add(p.x); add(p.y); add(p.z); }
	return h.toString(16).padStart(8, '0');
}
