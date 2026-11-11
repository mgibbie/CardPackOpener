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
import { newActor, stepActor, knock, flowField, steer, moveActor, clearRun } from './actors.js';
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
	// the control states (the 2D game's systems/status.js): how long each lasts, and what it does to damage
	CC: { freeze: 1.8, para: 3, sleep: 4, conf: 3 }, SLEEP_BONUS: 1.3, PARA_ELECTRIC: 1.35, FROZEN_TAKEN: 1.25, PARA_SLOW: 0.4,
	CONF_REACH: 380, CONF_CD: 0.6, CONF_KNOCK: 140,
	UNPORTED: [],   // base move kinds still to come (Expedition's eight are their own step)
	// experience (the 2D game's entities/pickup.js, player.js, systems/levelup.js)
	MAGNET: 78, COLLECT: 15, PULL: [240, 1400], BIG_XP: 20, DROP: { heal: 0.012, magnet: 0.020, bomb: 0.026 }, HEAL_ORB: 0.3, BOMB: { base: 60, level: 14, knock: 160, r: 480 }, MAX_MOVES: 4,
	// enemy behaviours (the 2D game's entities/enemy.js): the ones here; the rest chase until they are ported
	BEHAVIOURS: ['chase', 'tank', 'runner', 'charger', 'ranged', 'fan', 'beamer', 'zoner', 'bomber', 'healer', 'shielder', 'summoner', 'jumper'], LATER: [],
	// the supports (the 2D game's SUPPORT_CAPS) and the jumper
	HEAL: { r: 150, k: 0.07, powMax: 2.5, powExp: 0.35, many: 4, manyK: 0.9 }, SHIELD: { r: 160, k: 0.3, t: 7, lock: 14, max: 5, cd: 8 },
	SUMMON: { perCast: 4, perSummoner: 8, total: 20, capPad: 15, hp: 0.35, spd: 1.1, dmg: 0.6, xp: 0.25 }, LEAP: { near: 250, wait: 0.45, dur: 0.6, high: 46, r: 50, delay: 1.05, dmg: 1.2 },
	CHARGE: { near: 200, aim: 0.55, dash: 0.42, rest: 1.1, speed: 3.4 }, ESHOT: { speed: 190, r: 7, life: 2.4 },
	FUSE: { reach: 26, r: 62, delay: 1, dmg: 1.4 }, EBEAM: { len: 360, w: 22, delay: 1, dmg: 1.05 }, EZONE: { r: 44, delay: 1.2, dmg: 0.95 }, HAZARD_END: 0.3,
};
const TARGETED = ['melee', 'beam', 'projectile', 'boomerang', 'chain', 'meteor', 'dash', 'cone'];
const reach = (m) => (m.xreach ? m.xreach : m.kind === 'melee' ? m.radius + 30 : m.kind === 'beam' ? m.radius + 20 : m.kind === 'boomerang' ? m.radius + 40 : m.kind === 'chain' ? 280
	: m.kind === 'meteor' ? 340 : m.kind === 'dash' ? m.radius + 60 : m.kind === 'cone' ? m.speed * m.life + 30 : 520);

/** The 2D game's data, as this module reads it. G: the game's global, with util, pokedex, sprites-meta, sprites, moves,
 *  types and enemies loaded. */
export function dataFrom(G) {
	return {
		move: (id, lvl = 1) => { const m = G.Moves.instance(id, lvl); m.knock = G.Moves.knockOf(m); return m; },   // (a move's knockback is worked out from its level, as the 2D game does)
		typeMult: (t, types) => G.Types.mult(t, types), mon: (dex) => G.DEX_BY[dex],
		radius: (dex, scale = 1) => G.Sprites.bodyRadius(dex, scale) * U, hovers: (dex) => G.Sprites.hovers(dex),
		poolFor: (mon) => G.Moves.poolFor(mon), levelUp: (m) => { const ok = G.Moves.levelUp(m); m.knock = G.Moves.knockOf(m); return ok; }, nextUp: (m) => G.Moves.nextUpText(m), moveDef: (id) => G.Moves.BY_ID[id],
		tiers: G.Enemies.TIERS, defFor: (dex, ti) => G.Enemies.defFor(G.DEX_BY[dex], G.Enemies.TIERS[ti], ti),
		tierAt: (t) => { let ti = 0; G.Enemies.TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; }); return ti; },
	};
}

/** A fight. o: { dex (who you play), moves: [id | [id, lvl]], seed, tune (sim tuning), afDmg (the all-moves factor: 1.1 in
 *  Expedition), atkK / takenK (the ability's factors, 1 if none), crit, cast: [dex] (who spawns; none: nothing spawns),
 *  orbitSquash (0.7: the 2D game's flattened orbit; 1: a circle), autoPick (a level-up's card is chosen at once: 0-2, or
 *  a function (world, cards) -> index; without it the fight WAITS at a level-up until choose() is called) } */
export function newWorld(room, data, o = {}) {
	const mon = data.mon(o.dex || 25), s = newState(room, o.tune || K);
	const w = {
		room, data, t: 0, tick: 0, rand: makeRng((o.seed >>> 0) || 1), tune: o.tune || K, nextId: 1,
		pl: { s, mon, r: data.radius(mon.dex), maxHp: mon.hp, hp: mon.hp, baseAtk: mon.atk, atkMul: 1, atkK: o.atkK || 1, takenK: o.takenK || 1, cdMul: 1, crit: o.crit || 0, reduction: 0, regen: 0,
			invuln: 0, meleeT: 0, level: 1, xp: 0, xpNext: xpFor(1), xpMul: 1, spdMul: 1, magnet: CK.MAGNET * U, statsTaken: {}, pending: 0, choices: null, baseReduce: 0, baseRegen: 0, buffs: { atk: { n: 0, t: 0, amount: 0 }, spd: { n: 0, t: 0, amount: 0 }, def: { n: 0, t: 0, amount: 0 }, regen: { n: 0, t: 0, amount: 0 } }, afDmg: o.afDmg === undefined ? 1.1 : o.afDmg, target: null, aim: 0, dead: false,
			moves: (o.moves || []).map((m) => (Array.isArray(m) ? data.move(m[0], m[1]) : data.move(m))) },
		enemies: [], shots: [], orbs: [], fields: [], eshots: [], hazards: [], pickups: [], lastPatch: null, autoPick: o.autoPick, field: null, fieldCell: -2,
		cast: o.cast || null, spawnAcc: 0, cap: o.cap || CK.CAP, orbitSquash: o.orbitSquash || 1,
		stats: { gained: 0, collected: 0, levels: 0, dealt: 0, removed: 0, hits: 0, crits: 0, taken: 0, touched: 0, kills: 0, xp: 0, fired: 0, spawned: 0, fell: 0, blocked: 0 },
		events: [],   // this tick's: { k: 'hit' | 'kill' | 'hurt' | 'shot' | 'melee' | 'beam' | 'aura' | 'chain', … } for the page to draw
	};
	return w;
}
/** The XP a level needs (the 2D game's curve). */
export const xpFor = (level) => Math.floor((8 + level * 6 + Math.pow(level, 1.75) * 1.6) * 4);
const atk = (pl) => pl.baseAtk * pl.atkMul * (1 + pl.buffs.atk.n * pl.buffs.atk.amount) * pl.atkK;
const rnd = (w, a, b) => a + w.rand() * (b - a);

/** Put an enemy in. o: { t (the run time its stats are scaled for; default now), ti (tier), hp, dmg, spd (factors),
 *  dummy (it does not chase and never touches; a shove still moves it), behavior (instead of the species' own), y,
 *  def (a ready definition instead of the species' own for the tier), minion (a summoner's: its damage and XP are
 *  not multiplied up as an arrival's are) } */
export function addEnemy(w, dex, x, z, o = {}) {
	const d = w.data, t = o.t === undefined ? w.t : o.t, ti = o.ti === undefined ? d.tierAt(t) : o.ti, def = o.def || d.defFor(dex, ti), mon = d.mon(dex);
	const fly = !!d.hovers(dex), cr = d.radius(dex);
	const maxHp = Math.round(def.hp * (1 + t / 95) * CK.HP_K(t) * (o.hp || 1));
	const a = newActor(w.room, { x, z, y: o.y, r: Math.min(0.45, cr), speed: def.spd * (1 + Math.min(0.35, t / 1400)) * (o.spd === undefined ? 1 : o.spd) * U, fly, hover: CK.FLY_HOVER });
	const e = { id: w.nextId++, a, dex, def, types: mon.types && mon.types.length ? mon.types : ['normal'], cr, fly, maxHp, hp: maxHp,
		dmg: def.dmg * (1 + t / 420) * (o.minion ? 1 : CK.DMG_K) * (o.dmg || 1), xp: o.minion ? def.xp : Math.round(def.xp * CK.XP_K), t0: t, ti, minion: !!o.minion, minions: [], shield: 0, shieldT: 0, shieldLock: 0, skillCd: 0, jump: null, touchCd: 0, frozenT: 0, paraT: 0, sleepT: 0, confT: 0, confCd: 0, zig: 0, slow: 0, slowT: 0, burn: 0, burnT: 0, burnTick: 0, poison: 0, poisonT: 0, poisonTick: 0,
		dead: false, dummy: !!o.dummy, flash: 0, phase: 'walk', pt: 0, dx: 0, dz: 0, shotCd: 0 };
	e.atkType = e.types[0];
	e.behavior = o.behavior || (CK.BEHAVIOURS.includes(def.behavior) ? def.behavior : 'chase');
	if (KEEPS.includes(e.behavior) && def.shotCd) e.shotCd = rnd(w, 0.3, def.shotCd);
	if (e.behavior === 'shielder' || e.behavior === 'jumper') e.skillCd = rnd(w, 1, 4);
	w.enemies.push(e); w.stats.spawned++;
	return e;
}
const bodyH = (e) => Math.max(CK.BODY_MIN, e.cr * 2);
const KEEPS = ['ranged', 'fan', 'beamer', 'zoner', 'healer', 'summoner'];   // they hold their distance and act from it
const SUPPORT = ['healer', 'summoner'];   // …and these two do not need to see you to do their work

// ---------------------------------------------------------------- damage
function hurtEnemy(w, e, amount, kx, kz, knockU) {
	if (e.dead) return 0;
	if (e.frozenT > 0) amount *= CK.FROZEN_TAKEN;
	let d = Math.max(1, Math.round(amount));
	if (e.shield > 0) { const a = Math.min(e.shield, d); e.shield -= a; if (a >= d) { e.flash = 0.06; w.events.push({ k: 'absorbed', id: e.id }); return 0; } d = Math.max(1, Math.round(d - a)); }   // a shielder's shield takes it first
	e.hp -= d; e.flash = 0.12; w.stats.removed += d;
	if (knockU > 0) { const l = Math.hypot(kx, kz) || 1; knock(e.a, kx / l * knockU * U, kz / l * knockU * U); }
	if (e.hp <= 0) kill(w, e);
	return d;
}
/** An enemy is down: it leaves its experience where it stood (and now and then a berry, a magnet or a bomb). */
function kill(w, e) {
	if (e.dead) return;
	e.dead = true; e.hp = Math.min(e.hp, 0); w.stats.kills++; w.stats.xp += e.xp;
	w.events.push({ k: 'kill', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, xp: e.xp });
	const y = groundAt(w.room, e.a.x, e.a.z);
	drop(w, e.xp >= CK.BIG_XP ? 'xpBig' : 'xp', e.a.x, y, e.a.z, e.xp);
	const r = w.rand();
	if (r < CK.DROP.heal) drop(w, 'heal', e.a.x + rnd(w, -8, 8) * U, y, e.a.z, 0); else if (r < CK.DROP.magnet) drop(w, 'magnet', e.a.x, y, e.a.z, 0); else if (r < CK.DROP.bomb) drop(w, 'bomb', e.a.x, y, e.a.z, 0);
}
/** Put a pickup in the world: 'xp' | 'xpBig' | 'heal' | 'magnet' | 'bomb'. It rolls a little way and stops. */
export function drop(w, kind, x, y, z, value = 0) {
	const a = w.rand() * 6.2832, p = { id: w.nextId++, kind, x, y, z, value, vx: Math.cos(a) * rnd(w, 10, 46) * U, vy: 0, vz: Math.sin(a) * rnd(w, 10, 46) * U, t: 0, pulled: false };
	w.pickups.push(p); return p;
}
/** A move's hit lands (the 2D game's `land`): type chart, crit, the all-moves factor. src: the move or the shot. */
function land(w, e, dmg, kx, kz, knockU, src) {
	const pl = w.pl, type = src.mtype || src.type;
	const asleep = e.sleepT > 0 && src.cc !== 'sleep';
	let k = type ? w.data.typeMult(type, e.types) : 1;
	if (asleep) k *= CK.SLEEP_BONUS;
	if (type === 'electric' && e.paraT > 0) k *= CK.PARA_ELECTRIC;
	const c = pl.crit + (src.xcrit || 0), crit = c > 0 && w.rand() < c;
	if (crit) { k *= CK.CRIT; w.stats.crits++; }
	if (src.mid || src.id) k *= pl.afDmg;
	const d = dmg * k;
	hurtEnemy(w, e, d, kx, kz, knockU);
	w.stats.dealt += d; w.stats.hits++;
	w.events.push({ k: 'hit', id: e.id, x: e.a.x, y: e.a.y + bodyH(e) * 0.5, z: e.a.z, d, crit, type, eff: type ? w.data.typeMult(type, e.types) : 1 });
	if (!e.dead) { if (asleep) e.sleepT = 0; if (src.cc && src.ccp > 0 && w.rand() < src.ccp) applyState(w, e, src.cc); }
	if (src.burn) { e.burn = Math.min(8, e.burn + src.burn); e.burnT = 3; }
	if (src.poison) { e.poison = Math.min(8, e.poison + src.poison); e.poisonT = 4; }
	if (src.slow) { e.slow = Math.max(e.slow, src.slow); e.slowT = Math.max(e.slowT, 1.2); }
	return d;
}
/** Freeze, paralyse, put to sleep or confuse an enemy. Frozen and asleep it does not move or touch; asleep it takes
 *  30 % more and wakes when hit; frozen it takes 25 % more; paralysed it is at 40 % speed and takes 35 % more from
 *  Electric; confused it wanders into other enemies and hits them. */
export function applyState(w, e, kind) {
	const dur = CK.CC[kind];
	if (!e || e.dead || !dur) return 0;
	const stunned = e.frozenT > 0 || e.sleepT > 0;
	if (stunned && (kind === 'conf' || kind === 'para')) return 0;
	const key = kind === 'freeze' ? 'frozenT' : kind + 'T';
	if (!(e[key] > 0)) w.events.push({ k: 'state', id: e.id, state: kind });
	e[key] = Math.max(e[key] || 0, dur);
	if (kind === 'freeze') { e.sleepT = 0; e.confT = 0; } else if (kind === 'sleep') e.confT = 0;
	return dur;
}
function hurtPlayer(w, amount, type, through = false) {
	const pl = w.pl;
	if (through && pl.invuln < 1e8) pl.invuln = 0;   // (a telegraphed attack: the moment of grace after a hit does not save you)
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
function payload(m) { return { burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, cc: m.cc || '', ccp: m.ccp || 0, mtype: m.type, mkind: m.kind, mid: m.id, xcrit: m.xcrit || 0 }; }
/** A shot leaves. o: { off (how far in front it starts, units), speed, life, from: [x, y, z] (not the player: a turret), pierce, size, dmg, extra } */
function shoot(w, m, dir, o = {}) {
	const s = w.pl.s, off = (o.off === undefined ? 3 : o.off) * U, sp = (o.speed || m.speed) * U, f = o.from || [s.x, s.y + CK.MUZZLE, s.z];
	const p = Object.assign({ id: w.nextId++, x: f[0] + dir[0] * off, y: f[1] + dir[1] * off, z: f[2] + dir[2] * off, vx: dir[0] * sp, vy: dir[1] * sp, vz: dir[2] * sp,
		dmg: o.dmg === undefined ? m.dmg * atk(w.pl) : o.dmg, r: (o.size || m.size) * U, life: o.life || m.life, t: 0, pierce: o.pierce === undefined ? m.pierce | 0 : o.pierce, homing: m.homing || 0, hits: new Set(), px: null, py: 0, pz: 0 }, payload(m), o.extra || null);
	w.shots.push(p); w.stats.fired++;
	return p;
}
const floorAt = (w, x, z) => groundAt(w.room, x, z);
/** Everything a field (a mine, a meteor, a patch) hits: bodies within its radius, about its own height. */
function blast(w, f, k = 1) {
	for (const e of w.enemies) {
		if (e.dead || Math.abs(e.a.y - f.y) > CK.REACH_UP) continue;
		const dx = e.a.x - f.x, dz = e.a.z - f.z, rr = f.r + e.cr;
		if (dx * dx + dz * dz <= rr * rr) land(w, e, f.dmg * k, dx, dz, f.m.knock || 0, f.m);
	}
	w.events.push({ k: 'blast', id: f.m.id, x: f.x, y: f.y, z: f.z, r: f.r });
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
	buff(w, m) { const b = w.pl.buffs[m.stat]; if (!b) return; b.amount = m.amount; b.n = Math.min(m.stacks | 0, b.n + 1); b.t = m.dur; w.events.push({ k: 'buff', id: m.id, stat: m.stat, n: b.n }); },
	boomerang(w, m) {
		const n = Math.max(1, m.count | 0), spread = m.spread || 0.5, out = m.radius / m.speed;
		for (let i = 0; i < n; i++) shoot(w, m, aimDir(w, w.pl.aim + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * Math.min(n, 3))), { off: 0, life: out * 4 + 1.5, pierce: 999, extra: { boom: out, bsp: m.speed * 1.1 * U, back: false } });
		w.events.push({ k: 'shot', id: m.id, n });
	},
	cone(w, m) {
		const n = Math.max(2, m.count | 0), arc = m.arc || 0.9;
		for (let i = 0; i < n; i++) { const a = w.pl.aim + (i / (n - 1) - 0.5) * arc + rnd(w, -0.05, 0.05), sp = m.speed * rnd(w, 0.85, 1.1); shoot(w, m, aimDir(w, a), { off: 4, speed: sp, life: m.life * rnd(w, 0.85, 1.05) }); }
		w.events.push({ k: 'shot', id: m.id, n });
	},
	mine(w, m) {
		const s = w.pl.s, n = Math.max(1, m.count | 0);
		for (let i = 0; i < n; i++) { const a = w.rand() * 6.2832, d = n === 1 ? 0 : rnd(w, 18, 46) * U, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d * 0.8;
			w.fields.push({ kind: 'mine', id: w.nextId++, m, x, z, y: floorAt(w, x, z), t: 0, arm: 0.35, life: m.dur || 7, r: m.radius * U, dmg: m.dmg * atk(w.pl) }); }
		const mine = w.fields.filter((f) => f.kind === 'mine'); for (const f of mine.slice(0, Math.max(0, mine.length - (4 + n * 2)))) f.gone = true;   // a few at most: the oldest go
	},
	meteor(w, m) {
		const s = w.pl.s, n = Math.max(1, m.count | 0), R = reach(m) * U;
		const nearby = w.enemies.filter((e) => !e.dead && Math.hypot(e.a.x - s.x, e.a.z - s.z) <= R + e.cr);
		for (let i = nearby.length - 1; i > 0; i--) { const j = Math.floor(w.rand() * (i + 1)); const t = nearby[i]; nearby[i] = nearby[j]; nearby[j] = t; }
		for (let i = 0; i < n; i++) { const e = nearby[i], x = e ? e.a.x + rnd(w, -8, 8) * U : s.x + rnd(w, -140, 140) * U, z = e ? e.a.z + rnd(w, -6, 6) * U : s.z + rnd(w, -110, 110) * U;
			w.fields.push({ kind: 'meteor', id: w.nextId++, m, x, z, y: e ? e.a.y : floorAt(w, x, z), t: -i * 0.09, fall: 0.5, r: m.radius * U, dmg: m.dmg * atk(w.pl) }); }
	},
	turret(w, m) {
		const s = w.pl.s, a = w.pl.aim + Math.PI + rnd(w, -0.6, 0.6), x = s.x + Math.cos(a) * 26 * U, z = s.z + Math.sin(a) * 20 * U;
		w.fields.push({ kind: 'turret', id: w.nextId++, m, x, z, y: Math.max(s.y, floorAt(w, x, z)), t: 0, life: m.dur || 6, shotT: 0.3, dmg: m.dmg * atk(w.pl) });
		const mine = w.fields.filter((f) => f.kind === 'turret' && !f.gone); for (const f of mine.slice(0, Math.max(0, mine.length - Math.max(1, m.count | 0)))) f.gone = true;
	},
	dash(w, m) {
		const pl = w.pl, s = pl.s, ca = Math.cos(pl.aim), sa = Math.sin(pl.aim), sx = s.x, sz = s.z, y0 = s.y, W = (m.width || 34) * U, dmg = m.dmg * atk(pl);
		// as far as the way is clear: nothing more than a step above where you are now (a ledge down is fine: you fly off it)
		let len = 0, floor = y0;
		for (let d = 0.5; d <= m.radius * U + 1e-9; d += 0.5) { const g = floorAt(w, sx + ca * d, sz + sa * d), ahead = floorAt(w, sx + ca * (d + K.RADIUS), sz + sa * (d + K.RADIUS));   // (your body has a width: stop that short of a wall)
			if (Math.max(g, ahead) > Math.max(floor, y0) + K.STEP + 1e-6) break; floor = g; len = d; }
		s.x = sx + ca * len; s.z = sz + sa * len; s.y = Math.max(y0, floorAt(w, s.x, s.z)); if (s.y > floorAt(w, s.x, s.z) + 1e-6) s.grounded = false;
		s.facing = Math.atan2(ca, sa); pl.invuln = Math.max(pl.invuln, 0.3);
		for (const e of w.enemies) {
			if (e.dead || Math.abs(e.a.y - y0) > CK.REACH_UP) continue;
			const rr = W / 2 + e.cr; if (segDist2(sx, sz, s.x, s.z, e.a.x, e.a.z)[0] <= rr * rr) land(w, e, dmg, ca, sa, m.knock || 0, m);
		}
		w.events.push({ k: 'dash', id: m.id, from: [sx, y0 + CK.MUZZLE, sz], dir: [ca, 0, sa], len, w: W });
	},
	trail(w, m) {
		const s = w.pl.s, last = w.lastPatch, R = m.radius * U;
		if (last && Math.hypot(last.x - s.x, last.z - s.z) < R * 0.9 && last.t < 1) return;   // standing still: not one on top of the last
		const f = { kind: 'patch', id: w.nextId++, m, x: s.x, z: s.z, y: floorAt(w, s.x, s.z), t: 0, life: m.dur || 3, r: R, tick: 0, dmg: m.dmg * atk(w.pl) };
		w.fields.push(f); w.lastPatch = f;
		const mine = w.fields.filter((o) => o.kind === 'patch' && !o.gone); for (const o of mine.slice(0, Math.max(0, mine.length - 18))) o.gone = true;
	},
};
/** Mines wait and go off, meteors land, turrets shoot, patches tick. */
function updateFields(w, dt) {
	for (let i = w.fields.length - 1; i >= 0; i--) {
		const f = w.fields[i];
		f.t += dt;
		if (f.gone || (f.life && f.t >= f.life && f.kind !== 'mine')) { w.fields.splice(i, 1); continue; }
		if (f.kind === 'mine') {
			const trig = f.t >= f.arm && w.enemies.some((e) => !e.dead && Math.abs(e.a.y - f.y) <= CK.REACH_UP && Math.hypot(e.a.x - f.x, e.a.z - f.z) <= 14 * U + e.cr);
			if (trig || f.t >= f.life) { blast(w, f, trig ? 1 : 0.5); w.fields.splice(i, 1); }
		} else if (f.kind === 'meteor') {
			if (f.t >= f.fall) { blast(w, f); w.fields.splice(i, 1); }
		} else if (f.kind === 'turret') {
			f.shotT -= dt;
			if (f.shotT <= 0) {
				const m = f.m, R = (m.range || 300) * U; let tg = null, bd = R;
				for (const e of w.enemies) { if (e.dead) continue; const d = Math.hypot(e.a.x - f.x, e.a.y - f.y, e.a.z - f.z); if (d < bd) { bd = d; tg = e; } }
				f.shotT = tg ? m.rate || 0.6 : 0.15;
				if (tg) { const dx = tg.a.x - f.x, dy = tg.a.y - f.y, dz = tg.a.z - f.z, l = Math.hypot(dx, dy, dz) || 1; shoot(w, m, [dx / l, dy / l, dz / l], { from: [f.x, f.y + CK.MUZZLE, f.z], off: 0, speed: m.speed || 300, size: m.size || 6, life: 1.4, dmg: f.dmg }); }
			}
		} else if (f.kind === 'patch') {
			f.tick -= dt;
			if (f.tick <= 0) { f.tick = 0.5; blast(w, f); }
		}
	}
}
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
		if (!run) { m.t = 1; continue; }   // (a kind this module does not know: Expedition's eight are still to come)
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
		if (p.boom) {   // a boomerang: after `boom` seconds it turns back (and can hit the same bodies again); home, it is gone
			if (!p.back && p.t >= p.boom) { p.back = true; p.hits = new Set(); }
			if (p.back) {
				const dx = s.x - p.x, dy = s.y + CK.MUZZLE - p.y, dz = s.z - p.z, l = Math.hypot(dx, dy, dz) || 1, f = Math.exp(-7 * dt);
				p.vx = dx / l * p.bsp + (p.vx - dx / l * p.bsp) * f; p.vy = dy / l * p.bsp + (p.vy - dy / l * p.bsp) * f; p.vz = dz / l * p.bsp + (p.vz - dz / l * p.bsp) * f;
				if (l < pl.r + 8 * U) { w.shots.splice(i, 1); continue; }
			}
		}
		if (p.homing > 0) {   // it curves toward the nearest enemy, keeping its speed
			let tg = null, bd = 340 * U;
			for (const e of w.enemies) { if (e.dead) continue; const d = Math.hypot(e.a.x - p.x, e.a.y + CK.MUZZLE - p.y, e.a.z - p.z); if (d < bd) { bd = d; tg = e; } }
			if (tg) { const dx = tg.a.x - p.x, dy = tg.a.y + CK.MUZZLE - p.y, dz = tg.a.z - p.z, l = Math.hypot(dx, dy, dz) || 1, sp = Math.hypot(p.vx, p.vy, p.vz), f = Math.exp(-p.homing * dt);
				p.vx = dx / l * sp + (p.vx - dx / l * sp) * f; p.vy = dy / l * sp + (p.vy - dy / l * sp) * f; p.vz = dz / l * sp + (p.vz - dz / l * sp) * f; }
		}
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
		if (e.dead || e.dummy || e.touchCd > 0 || e.frozenT > 0 || e.sleepT > 0 || e.confT > 0) continue;
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
const shotDmg = (e) => (e.def.shotDmg || 10) * (e.dmg / e.def.dmg);
/** An enemy's shot (or a fan of them): a ball aimed at your chest, up or down. */
function enemyShoot(w, e, spread = 0, n = 1, k = 1) {
	const s = w.pl.s, oy = e.a.y + CK.MUZZLE, dx = s.x - e.a.x, dz = s.z - e.a.z, h = Math.hypot(dx, dz) || 1, pitch = Math.atan2(s.y + CK.MUZZLE - oy, h), base = Math.atan2(dz, dx), sp = CK.ESHOT.speed * U, c = Math.cos(pitch);
	for (let i = 0; i < n; i++) { const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
		w.eshots.push({ id: w.nextId++, x: e.a.x, y: oy, z: e.a.z, vx: Math.cos(a) * c * sp, vy: Math.sin(pitch) * sp, vz: Math.sin(a) * c * sp, dmg: shotDmg(e) * k, r: CK.ESHOT.r * U, life: CK.ESHOT.life, t: 0, mtype: e.atkType }); }
	w.events.push({ k: 'eshot', id: e.id, n });
}
/** A telegraphed attack: a mark on the ground that goes off after `delay`. kind 'zone' (a circle) or 'beam' (a bar). */
function hazard(w, h) { const o = Object.assign({ id: w.nextId++, t: 0, hit: false }, h); w.hazards.push(o); w.events.push({ k: 'hazard', h: o }); return o; }
function special(w, e) {
	const s = w.pl.s, d = e.def;
	if (e.behavior === 'fan') { const n = d.fanN || 5; enemyShoot(w, e, n === 3 ? 0.6 : 0.9, n, 0.65); }
	else if (e.behavior === 'beamer') hazard(w, { kind: 'beam', x: e.a.x, y: e.a.y, z: e.a.z, angle: Math.atan2(s.z - e.a.z, s.x - e.a.x), len: CK.EBEAM.len * U, w: CK.EBEAM.w * U, delay: CK.EBEAM.delay, dmg: shotDmg(e) * CK.EBEAM.dmg, type: e.atkType });
	else if (e.behavior === 'zoner') { const n = Math.floor(1 + w.rand() * (d.zones || 3));
		for (let i = 0; i < n; i++) { const x = s.x + (i ? rnd(w, -70, 70) * U : 0), z = s.z + (i ? rnd(w, -55, 55) * U : 0); hazard(w, { kind: 'zone', x, z, y: i ? groundAt(w.room, x, z) : s.grounded ? s.y : groundAt(w.room, x, z), r: CK.EZONE.r * U, delay: CK.EZONE.delay, dmg: shotDmg(e) * CK.EZONE.dmg, type: e.atkType }); } }
	else if (e.behavior === 'healer') {   // 7 % of each hurt neighbour's HP (more against a strong attacker, less when there are many healers)
		const H = CK.HEAL, pl = w.pl, pow = Math.max(1, atk(pl) / pl.baseAtk); let k = H.k * Math.min(H.powMax, Math.pow(pow, H.powExp)), healers = 0, n = 0;
		for (const o of w.enemies) if (!o.dead && o.behavior === 'healer') healers++;
		if (healers > H.many) k *= H.manyK;
		for (const o of w.enemies) { if (o.dead || o.hp >= o.maxHp || Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z) > H.r * U + o.cr) continue; o.hp = Math.min(o.maxHp, o.hp + o.maxHp * k); n++; }
		w.events.push({ k: 'heal', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, r: H.r * U, n });
	}
	else if (e.behavior === 'summoner') {   // four of its kind at a time: at most 8 of its own alive, 20 on the map
		const M = CK.SUMMON; e.minions = e.minions.filter((m) => !m.dead);
		let total = 0; for (const o of w.enemies) if (o.minion && !o.dead) total++;
		if (e.minions.length >= M.perSummoner || total >= M.total || w.enemies.length > w.cap + M.capPad) return;
		const dex = d.minion || e.dex, def = { dex, name: '', hp: Math.round(d.hp * M.hp), spd: Math.round(d.spd * M.spd), dmg: Math.round(d.dmg * M.dmg), xp: Math.max(1, Math.round(d.xp * M.xp)), behavior: 'chase' };
		for (let i = 0, n = Math.min(M.perCast, M.total - total); i < n; i++) {
			const a = w.rand() * 6.2832; let x = e.a.x + Math.cos(a) * 30 * U, z = e.a.z + Math.sin(a) * 22 * U;
			if (groundAt(w.room, x, z) > e.a.y + K.STEP) { x = e.a.x; z = e.a.z; }   // (not inside a wall: beside its summoner then)
			const m = addEnemy(w, dex, x, z, { def, t: e.t0, ti: e.ti, minion: true, behavior: 'chase' }); e.minions.push(m);
		}
		w.events.push({ k: 'summon', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z });
	}
	else enemyShoot(w, e);
}
/** What an enemy that is free to act does this tick: where it wants to go (WISH) and at what speed factor. */
function behave(w, e, dt) {
	const pl = w.pl, s = pl.s, dx = s.x - e.a.x, dz = s.z - e.a.z, dist = Math.hypot(dx, dz) || 1e-9, ux = dx / dist, uz = dz / dist, level = Math.abs(s.y - e.a.y) <= CK.REACH_UP || e.fly;
	steer(w.room, w.field, e.a, WISH);
	const b = e.behavior;
	if (b === 'shielder' || b === 'jumper') {
		e.skillCd -= dt;
		if (e.skillCd <= 0) {
			if (b === 'shielder') {   // a shield of 30 % of their HP for the nearest five (itself among them) for 7 s; none again for 14 s
				const S = CK.SHIELD; e.skillCd = S.cd;
				const nearby = w.enemies.filter((o) => !o.dead && Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z) <= S.r * U + o.cr).sort((p, q) => Math.hypot(p.a.x - e.a.x, p.a.z - e.a.z) - Math.hypot(q.a.x - e.a.x, q.a.z - e.a.z));
				let given = 0; for (const o of nearby) { if (given >= S.max) break; if (o.shield > 0 || o.shieldLock > 0) continue; o.shield = o.maxHp * S.k; o.shieldT = S.t; o.shieldLock = S.lock; given++; }
				w.events.push({ k: 'shield', id: e.id, x: e.a.x, y: e.a.y, z: e.a.z, r: S.r * U, n: given });
			} else if (dist < CK.LEAP.near * U) {   // a leap: it crouches, flies in an arc and lands where you WERE (the spot is marked)
				const L = CK.LEAP, ty = s.grounded ? s.y : groundAt(w.room, s.x, s.z); e.skillCd = rnd(w, 5, 7);
				e.jump = { sx: e.a.x, sy: e.a.y, sz: e.a.z, tx: s.x, ty, tz: s.z, t: -L.wait };
				hazard(w, { kind: 'zone', x: s.x, y: ty, z: s.z, r: L.r * U, delay: L.delay, dmg: e.dmg * L.dmg, type: e.atkType });
				w.events.push({ k: 'leap', id: e.id });
			} else e.skillCd = 0.5;
		}
		return 1;
	}
	if (b === 'runner') {   // it goes where you are GOING
		const lead = Math.max(0, Math.min(1.4, dist / Math.max(60 * U, e.a.speed))), tx = s.x + s.vx * lead, tz = s.z + s.vz * lead;
		if (e.fly || clearRun(w.room, e.a.x, e.a.z, e.a.y, tx, tz)) { const l = Math.hypot(tx - e.a.x, tz - e.a.z) || 1; WISH[0] = (tx - e.a.x) / l; WISH[1] = (tz - e.a.z) / l; }
		return 1;
	}
	if (b === 'bomber') {
		if (e.phase === 'fuse') { WISH[0] = WISH[1] = 0; e.pt -= dt; e.flash = Math.floor(e.pt * 10) % 2 ? 0.05 : 0; if (e.pt <= 0) { e.hp = 0; kill(w, e); } return 1; }
		if (dist < e.cr + pl.r + CK.FUSE.reach * U && level) { e.phase = 'fuse'; e.pt = CK.FUSE.delay; WISH[0] = WISH[1] = 0; hazard(w, { kind: 'zone', x: e.a.x, y: e.a.y, z: e.a.z, r: CK.FUSE.r * U, delay: CK.FUSE.delay, dmg: e.dmg * CK.FUSE.dmg, type: e.atkType }); }
		return 1;
	}
	if (b === 'charger') {   // it stops, takes aim, and comes straight through where you were
		e.pt -= dt;
		if (e.phase === 'walk') { if (dist < CK.CHARGE.near * U && e.pt <= 0 && level) { e.phase = 'aim'; e.pt = CK.CHARGE.aim; w.events.push({ k: 'aim', id: e.id }); } return 1; }
		if (e.phase === 'aim') { WISH[0] = WISH[1] = 0; if (e.pt <= 0) { e.phase = 'dash'; e.pt = CK.CHARGE.dash; e.dx = ux; e.dz = uz; } return 1; }
		WISH[0] = e.dx; WISH[1] = e.dz; if (e.pt <= 0) { e.phase = 'walk'; e.pt = CK.CHARGE.rest; }
		return CK.CHARGE.speed;
	}
	if (KEEPS.includes(b)) {
		const range = (e.def.range || 200) * U, keep = range * 0.82;
		// (3D: it must SEE you to hold its ground and attack; with a wall between you it comes round like anyone else)
		const sees = dist < range && clearLine(w.room, e.a.x, e.a.y + CK.MUZZLE, e.a.z, s.x, s.y + CK.MUZZLE, s.z);
		e.shotCd -= dt * (e.paraT > 0 ? CK.PARA_SLOW : 1);
		if (SUPPORT.includes(b) && e.shotCd <= 0 && dist < range) { e.shotCd = e.def.shotCd || 2; special(w, e); }
		if (!sees) return 1;
		let k = 1;
		if (dist < keep * 0.75) { WISH[0] = -ux; WISH[1] = -uz; k = 0.8; } else if (dist < keep) { WISH[0] = ux; WISH[1] = uz; k = 0.1; }
		if (e.shotCd <= 0) { e.shotCd = e.def.shotCd || 2; special(w, e); }
		return k;
	}
	return 1;
}
/** Enemy shots fly and hit; marks on the ground go off. */
function enemyAttacks(w, dt) {
	const pl = w.pl, s = pl.s, high = Math.max(CK.BODY_MIN, pl.r * 2);
	for (let i = w.eshots.length - 1; i >= 0; i--) {
		const p = w.eshots[i];
		p.t += dt; if (p.t >= p.life) { w.eshots.splice(i, 1); continue; }
		p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
		if (groundAt(w.room, p.x, p.z) > p.y) { w.eshots.splice(i, 1); continue; }   // cover: terrain stops it
		const dx = p.x - s.x, dz = p.z - s.z, rr = p.r + pl.r;
		if (dx * dx + dz * dz < rr * rr && p.y > s.y - p.r && p.y < s.y + high + p.r) { if (!pl.dead) hurtPlayer(w, p.dmg, p.mtype); w.eshots.splice(i, 1); }   // (it is spent even if it did not hurt)
	}
	for (let i = w.hazards.length - 1; i >= 0; i--) {
		const h = w.hazards[i];
		h.t += dt;
		if (!h.hit && h.t >= h.delay) {
			h.hit = true; w.events.push({ k: 'boom', h });
			let inside = !pl.dead && Math.abs(s.y - h.y) <= CK.REACH_UP;   // (3D: a mark on the ground reaches about a metre up: jump clear of it)
			if (inside && h.kind === 'zone') { const rr = h.r + pl.r * 0.6; inside = (s.x - h.x) ** 2 + (s.z - h.z) ** 2 < rr * rr; }
			else if (inside) { const ca = Math.cos(h.angle), sa = Math.sin(h.angle), px = s.x - h.x, pz = s.z - h.z, along = px * ca + pz * sa; inside = along >= -pl.r && along <= h.len + pl.r && Math.abs(-px * sa + pz * ca) <= h.w / 2 + pl.r * 0.6; }
			if (inside) hurtPlayer(w, h.dmg, h.type, true);
		}
		if (h.hit && h.t >= h.delay + CK.HAZARD_END) w.hazards.splice(i, 1);
	}
}
/** A confused enemy: it weaves toward the nearest other enemy and hits it (1.8 × its damage + 3 % of the other's HP). */
function confused(w, e, dt) {
	let tgt = null, best = CK.CONF_REACH * U;
	for (const o of w.enemies) { if (o === e || o.dead) continue; const d = Math.hypot(o.a.x - e.a.x, o.a.z - e.a.z); if (d < best + o.cr && d < best) { best = d; tgt = o; } }
	e.zig += dt;
	const ang = tgt ? Math.atan2(tgt.a.z - e.a.z, tgt.a.x - e.a.x) + Math.sin(e.zig * 5) * 0.5 : e.zig * 1.3 + e.id;
	WISH[0] = Math.cos(ang); WISH[1] = Math.sin(ang);
	if (tgt && e.confCd <= 0 && best <= e.cr + tgt.cr + 6 * U && Math.abs(tgt.a.y - e.a.y) <= CK.REACH_UP) {
		e.confCd = CK.CONF_CD;
		hurtEnemy(w, tgt, e.dmg * 1.8 + tgt.maxHp * 0.03, tgt.a.x - e.a.x, tgt.a.z - e.a.z, CK.CONF_KNOCK);
		if (!tgt.dead) tgt.sleepT = 0;
		w.events.push({ k: 'confhit', id: e.id, on: tgt.id });
	}
}
function updateEnemies(w, dt) {
	const pl = w.pl, s = pl.s;
	// the way to the player: rebuilt when the player's cell changes (and only while standing on something walkable)
	const cell = Math.floor(s.z / CELL) * w.room.w + Math.floor(s.x / CELL);
	if (!w.field || (cell !== w.fieldCell && (s.grounded || s.swimming))) { w.field = flowField(w.room, s.x, s.z, w.field); w.fieldCell = cell; }
	w.field.x = s.x; w.field.z = s.z;
	for (const e of w.enemies) {
		if (e.dead) continue;
		if (e.flash > 0) e.flash -= dt;
		if (e.touchCd > 0) e.touchCd -= dt * (e.paraT > 0 ? CK.PARA_SLOW : 1);
		if (e.shieldLock > 0) e.shieldLock -= dt;
		if (e.shieldT > 0 && (e.shieldT -= dt) <= 0) e.shield = 0;
		if (e.frozenT > 0) e.frozenT = Math.max(0, e.frozenT - dt); if (e.sleepT > 0) e.sleepT = Math.max(0, e.sleepT - dt);
		if (e.paraT > 0) e.paraT = Math.max(0, e.paraT - dt); if (e.confT > 0) e.confT = Math.max(0, e.confT - dt); if (e.confCd > 0) e.confCd -= dt;
		if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
		if (e.burn > 0) { e.burnT -= dt; e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.5; hurtEnemy(w, e, 1.6 * e.burn * (1 + pl.level * 0.06), 0, 0, 0); } if (e.burnT <= 0) e.burn = 0; }
		if (e.poison > 0) { e.poisonT -= dt; e.poisonTick -= dt; if (e.poisonTick <= 0) { e.poisonTick = 0.6; hurtEnemy(w, e, e.maxHp * 0.012 * e.poison + 1, 0, 0, 0); } if (e.poisonT <= 0) e.poison = 0; }
		if (e.dead) continue;
		if (e.jump) {   // in a leap nothing else happens to it: it is carried along its arc and lands
			const j = e.jump, L = CK.LEAP; j.t += dt;
			if (j.t >= 0) { const f = Math.min(1, j.t / L.dur); e.a.x = j.sx + (j.tx - j.sx) * f; e.a.z = j.sz + (j.tz - j.sz) * f; e.a.y = j.sy + (j.ty - j.sy) * f + Math.sin(f * Math.PI) * L.high * U; e.a.grounded = false; e.a.facing = Math.atan2(j.tx - j.sx, j.tz - j.sz);
				if (f >= 1) { e.jump = null; const g = groundAt(w.room, e.a.x, e.a.z); e.a.y = e.fly ? g + e.a.hover : g; e.a.grounded = !e.fly; e.a.vy = 0; } }
			continue;
		}
		let k = 1 - e.slow;
		if (e.dummy || e.frozenT > 0 || e.sleepT > 0) WISH[0] = WISH[1] = 0;   // (only a shove moves it)
		else if (e.confT > 0) { k *= 0.9; confused(w, e, dt); }
		else { k *= behave(w, e, dt); if (e.dead) continue; if (e.paraT > 0) k *= CK.PARA_SLOW; }
		stepActor(e.a, w.room, WISH[0], WISH[1], dt, k);
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

// ---------------------------------------------------------------- experience and level-ups
function gainXp(w, amount) {
	const pl = w.pl; pl.xp += amount * pl.xpMul; w.stats.gained += amount * pl.xpMul;
	while (pl.xp >= pl.xpNext) { pl.xp -= pl.xpNext; pl.level++; pl.xpNext = xpFor(pl.level); pl.pending++; w.stats.levels++; w.events.push({ k: 'level', level: pl.level }); }
}
/** Pickups: inside your reach (or once a magnet has called them) they fly to you, in space; touched, they are yours. */
function updatePickups(w, dt) {
	const pl = w.pl, s = pl.s, cy = s.y + 0.5;
	for (let i = w.pickups.length - 1; i >= 0; i--) {
		const p = w.pickups[i]; p.t += dt * 4;
		const dx = s.x - p.x, dy = cy - p.y, dz = s.z - p.z, d = Math.hypot(dx, dy, dz) || 1e-6;
		if (p.pulled || d < pl.magnet) {
			p.pulled = true;
			const pull = (CK.PULL[0] + CK.PULL[1] / (d / U)) * U, f = Math.exp(-7 * dt);
			p.vx = dx / d * pull + (p.vx - dx / d * pull) * f; p.vy = dy / d * pull + (p.vy - dy / d * pull) * f; p.vz = dz / d * pull + (p.vz - dz / d * pull) * f;
		} else { const f = Math.pow(0.02, dt); p.vx *= f; p.vz *= f; p.vy = 0; }
		p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
		if (!p.pulled) { const g = groundAt(w.room, p.x, p.z); if (g > p.y + K.STEP) { p.x -= p.vx * dt; p.z -= p.vz * dt; p.vx = p.vz = 0; } else p.y = g; }   // it rolls on the floor, and stops at a wall
		if (d < CK.COLLECT * U) { w.pickups.splice(i, 1); collect(w, p); }
	}
}
function collect(w, p) {
	const pl = w.pl, s = pl.s; w.stats.collected++;
	w.events.push({ k: 'pickup', kind: p.kind, value: p.value });
	if (p.kind === 'xp' || p.kind === 'xpBig') gainXp(w, p.value);
	else if (p.kind === 'heal') pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * CK.HEAL_ORB);
	else if (p.kind === 'magnet') for (const o of w.pickups) o.pulled = true;
	else if (p.kind === 'bomb') { const B = CK.BOMB; for (const e of [...w.enemies]) { if (e.dead || Math.hypot(e.a.x - s.x, e.a.y - s.y, e.a.z - s.z) > B.r * U) continue; hurtEnemy(w, e, B.base + pl.level * B.level, e.a.x - s.x, e.a.z - s.z, B.knock); } w.events.push({ k: 'bomb', x: s.x, y: s.y, z: s.z, r: B.r * U }); }
}
/** The permanent upgrades a level can offer (the 2D game's; `max`: how many times each can be taken). */
export const STATS = [
	{ id: 'hp', title: 'Vigor', desc: '+20 max HP (and heals it).', apply: (pl) => { pl.maxHp += 20; pl.hp += 20; } },
	{ id: 'atk', title: 'Power', desc: '+10% damage with every move.', max: 40, apply: (pl) => { pl.atkMul *= 1.10; } },
	{ id: 'spd', title: 'Sprint', desc: '+7% movement speed.', max: 8, apply: (pl) => { pl.spdMul *= 1.07; } },
	{ id: 'cd', title: 'Reflexes', desc: '-8% cooldown on every move.', max: 10, apply: (pl) => { pl.cdMul *= 0.92; } },
	{ id: 'def', title: 'Armour', desc: '+6% damage reduction.', max: 12, apply: (pl) => { pl.baseReduce = Math.min(0.7, pl.baseReduce + 0.06); } },
	{ id: 'rgn', title: 'Synthesis', desc: '+0.9 HP regenerated a second.', apply: (pl) => { pl.baseRegen += 0.9; } },
	{ id: 'mag', title: 'Magnet', desc: '+30% pickup radius.', max: 6, apply: (pl) => { pl.magnet *= 1.30; } },
	{ id: 'xp', title: 'Learning', desc: '+12% experience gained.', max: 8, apply: (pl) => { pl.xpMul *= 1.12; } },
	{ id: 'heal', title: 'Sitrus Berry', desc: 'Restores 45% of your HP now.', apply: (pl) => { pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.45); } },
];
/** Three different cards for a level-up, drawn by weight from: a new move (while you have a free slot of the four), the
 *  next level of a move you have, a permanent upgrade. (Move evolutions and the Calibre card are still to come.) */
export function offer(w, n = 3) {
	const pl = w.pl, d = w.data, pool = [];
	const pickN = (arr, k) => { const c = arr.slice(), out = []; while (out.length < k && c.length) out.push(c.splice(Math.floor(w.rand() * c.length), 1)[0]); return out; };
	const free = pl.moves.length < CK.MAX_MOVES;
	if (free) {
		const buffs = pl.moves.filter((m) => m.kind === 'buff').length;   // (two buffs at most: they do no damage)
		const ids = d.poolFor(pl.mon).filter((id) => !pl.moves.some((m) => m.id === id) && !(buffs >= 2 && d.moveDef(id).kind === 'buff') && (KINDS[d.moveDef(id).kind] || d.moveDef(id).kind === 'orbit'));
		for (const id of pickN(ids, 6)) { const md = d.moveDef(id); pool.push({ w: 10, type: 'new', key: 'new:' + id, id, title: id, tag: md.type + ' · ' + md.kind, mtype: md.type, apply: () => { pl.moves.push(d.move(id)); } }); }
	}
	for (const m of pl.moves) { const txt = d.nextUp(m); if (txt) pool.push({ w: 8, type: 'up', key: 'up:' + m.id, id: m.id, title: m.id, tag: 'Lv ' + m.lvl + ' > ' + (m.lvl + 1), desc: txt, mtype: m.type, apply: () => { d.levelUp(m); } }); }
	for (const st of pickN(STATS.filter((q) => !q.max || (pl.statsTaken[q.id] || 0) < q.max), 5)) pool.push({ w: free ? 4 : 7, type: 'stat', key: 'stat:' + st.id, id: st.id, title: st.title, tag: 'Upgrade', desc: st.desc, apply: () => { st.apply(pl); pl.statsTaken[st.id] = (pl.statsTaken[st.id] || 0) + 1; } });
	const picked = [];
	while (picked.length < n && pool.length) { const total = pool.reduce((a, c) => a + c.w, 0); let r = w.rand() * total, idx = 0; for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break; } } picked.push(pool.splice(idx, 1)[0]); }
	return picked;
}
/** Take one of the cards on offer (pl.choices). The fight goes on when no level-up is left waiting. */
export function choose(w, i) {
	const pl = w.pl, c = pl.choices && pl.choices[i];
	if (!c) return false;
	c.apply(); pl.choices = null; pl.pending--; w.events.push({ k: 'chose', key: c.key });
	return true;
}

// ---------------------------------------------------------------- one tick
/** Advance the fight one tick. input: sim.js's ({ mx, mz, jump, crouch }). The order is the 2D game's: you, arrivals,
 *  enemies, your moves, shots, hits and touches. */
export function tick(w, input, dt = K.TICK) {
	const pl = w.pl, s = pl.s;
	w.events.length = 0;
	// a level-up: the fight waits for a card to be chosen (or takes one at once, if it was told how)
	while (pl.pending > 0 && !pl.dead) {
		if (!pl.choices) { pl.choices = offer(w); if (!pl.choices.length) { pl.choices = null; pl.pending--; continue; } w.events.push({ k: 'levelup', level: pl.level }); }
		if (w.autoPick === undefined || w.autoPick === null) return w;
		choose(w, Math.min(pl.choices.length - 1, typeof w.autoPick === 'function' ? w.autoPick(w, pl.choices) | 0 : w.autoPick | 0));
	}
	w.t += dt; w.tick++;
	if (!pl.dead) {
		const B = pl.buffs;
		for (const k in B) if (B[k].n > 0) { B[k].t -= dt; if (B[k].t <= 0) B[k].n = 0; }
		pl.reduction = Math.min(0.8, pl.baseReduce + B.def.n * B.def.amount); pl.regen = pl.baseRegen + B.regen.n * B.regen.amount;
		const fast = (1 + B.spd.n * B.spd.amount) * pl.spdMul;   // a speed buff or the Sprint upgrade: you run that much faster
		if (fast !== w.fastK) { w.fastK = fast; w.fastTune = fast === 1 ? w.tune : { ...w.tune, RUN: w.tune.RUN * fast }; }
		step(s, input || noInput(), w.room, dt, w.fastTune || w.tune);
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
	if (!pl.dead) updateFields(w, dt);
	enemyAttacks(w, dt);
	if (!pl.dead) updatePickups(w, dt);
	return w;
}

/** A fight's fingerprint: every number that matters, rounded to a tenth of a millimetre. */
export function hashWorld(w) {
	let h = 0x811c9dc5;
	const add = (v) => { const n = Math.round(v * 1e4) | 0; for (let k = 0; k < 4; k++) { h ^= (n >>> (k * 8)) & 255; h = Math.imul(h, 0x01000193) >>> 0; } };
	const s = w.pl.s; for (const v of [s.x, s.y, s.z, w.pl.hp, w.t, w.stats.dealt, w.stats.taken, w.stats.kills, w.enemies.length, w.shots.length]) add(v);
	for (const e of w.enemies) { add(e.id); add(e.a.x); add(e.a.y); add(e.a.z); add(e.hp); }
	for (const p of w.shots) { add(p.x); add(p.y); add(p.z); }
	for (const f of w.fields) { add(f.x); add(f.z); add(f.t); }
	for (const p of w.eshots) { add(p.x); add(p.y); add(p.z); }
	for (const h of w.hazards) { add(h.x); add(h.z); add(h.t); }
	for (const p of w.pickups) { add(p.x); add(p.y); add(p.z); }
	add(w.pl.level); add(w.pl.xp);
	return h.toString(16).padStart(8, '0');
}
