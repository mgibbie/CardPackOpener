// expedition.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): a Classic Expedition run on generated 3D maps.
// Pure and seeded, on top of combat.js: three generated zones and the shrine; in each zone you find the altar, stand
// on it to wake the guardian, beat it, and take the portal; the shrine's legendary ends the run.
//
// What a zone holds (its species, its guardian, its timeline of events) is the 2D game's own plan, read from
// js/expedition/classic.js (expFrom); the numbers are its K. What is this module's own is where things are: there is
// no camera in the rules, so arrivals come 16-32 m from you (as combat.js's do), and a site only counts you when you
// stand on its level.
//
// Here so far: the run's phases, zones and splits; the trickle with its cards, the per-zone floor and the final
// swarm; guardians and the legendary with HP from your damage and exhaustion; the difficulty tiers; the timeline's
// events (alpha, swarm, stampede, flock, rock slide, elite wave, totem, summoner, roaming legendary); the score.
// Level-ups are Expedition's own (explevel.js): move levels and rolls, vitamins, Training, the three tools.
// The run's money, its 60 items and what a zone holds to stand in are expeco.js's.
// Capture (an alpha faints and can join you; shinies) is expcap.js's.
// Still to come: the League, the run's pay.
import { K, CELL, makeRoom, setCell, groundAt, newState } from './sim.js';
import { generate, footGraph, rng as makeRng, LEVEL } from './gen.js';
import { CK, U, newWorld, tick, addEnemy, addBoss, drop, hazard, spawnRate, xpFor } from './combat.js';
import { levelFrom, setup as setupLevels, tickStats, curse, takeItem, dropItem } from './explevel.js';
import { ecoFrom, setupEco, tickEco, mods, pickTake, pickClose } from './expeco.js';
import { capFrom, setupCap, tickCap, holdCine, mark } from './expcap.js';

export const XK = {
	BIOME: { viridian: 'meadow', mtmoon: 'peaks', cerulean: 'marsh' },
	ZONE_TILES: 7,                 // a zone is 7 x 7 tiles (98 m a side); a Dive room is 5 x 5
	ALTAR_MIN: 26, ALTAR_MAX: 96,  // m from where you arrive (the 2D game: 26-48 tiles on a far bigger map)
	SITE_UP: CK.REACH_UP,          // m: a site counts you only on its own level (not from the ledge above it)
	TIER_RANGE: [[0, 2], [2, 4], [3, 5]],   // the 2D game's (classic.js): the enemy tiers a zone may use
	SWARM: [13, 4], SUMMONER: [11, 4],      // m: a swarm closes in from nearer than an arrival; a summoner too
	HERD_BACK: 20,                 // m behind you a stampede or a flock starts
	BOSS_NORTH: 70,                // units north of the altar the guardian appears (the 2D game's)
	ESCORT_R: 90, TOTEM_R: 40,     // units
	SHRINE: { w: 44, h: 44, ped: [0, -13], rim: 9 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mix(...vals) {
	let h = 0x9E3779B9 | 0;
	for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
	return h >>> 0;
}

/** The 2D game's Expedition tables, as this module reads them. G: the game's global with expedition/terrain.js (its
 *  seeded stream), tiers.js and classic.js loaded. */
export function expFrom(G) {
	const C = G.ExpClassic, T = G.ExpTier;
	return { K: C.K, MAPS: C.MAPS, MAP_IDS: C.MAP_IDS, DIFFS: C.DIFFS, plan: (seed, map, zone, diff) => C.plan(seed, map, zone, diff), tier: (d) => T.of(d),
		ESCORT: T.K.ESCORT, L: G.ExpLevel && G.ExpItems ? levelFrom(G) : null, E: G.ExpEco ? ecoFrom(G) : null, C: G.ExpCap ? capFrom(G) : null, score: (parts, diff) => T.score(parts, diff), medal: T.medal ? (s, diff, map) => T.medal(s, diff, map) : null, exhaustion: C.exhaustion };
}

// ---------------------------------------------------------------- the zones
/** Cells you can walk to from the spawn and back again (no jumps). */
export function walkable(room) {
	const g = footGraph(room), n = g.length, back = Array.from({ length: n }, () => []);
	for (let i = 0; i < n; i++) for (const b of g[i]) back[b].push(i);
	const flood = (edges) => { const seen = new Uint8Array(n), from = Math.floor(room.spawn[2] / CELL) * room.w + Math.floor(room.spawn[0] / CELL), q = [from]; seen[from] = 1; for (let k = 0; k < q.length; k++) for (const b of edges[q[k]]) if (!seen[b]) { seen[b] = 1; q.push(b); } return seen; };
	const a = flood(g), b = flood(back);
	for (let i = 0; i < n; i++) a[i] = a[i] && b[i] ? 1 : 0;
	return a;
}
export const flat3 = (room, cx, cz) => {
	const h = room.cells[cz * room.w + cx];
	for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const i = (cz + dz) * room.w + cx + dx; if (room.cells[i] !== h || room.slopes.has(i) || room.water.has(i) || room.mats.has(i)) return false; }
	return true;
};
/** Where a zone's altar stands: a seeded pick among the flat 3 x 3 places you can walk to, 26 m or more from where
 *  you arrive. -> [x, y, z] */
export function altarOf(room, seed) {
	const ok = walkable(room), cand = [], far = [];
	for (let cz = 2; cz < room.h - 2; cz++) for (let cx = 2; cx < room.w - 2; cx++) {
		const i = cz * room.w + cx; if (!ok[i] || room.cells[i] >= room.rimH || !flat3(room, cx, cz)) continue;
		const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL, d = Math.hypot(x - room.spawn[0], z - room.spawn[2]), p = [x, room.cells[i], z, d];
		far.push(p); if (d >= XK.ALTAR_MIN && d <= XK.ALTAR_MAX) cand.push(p);
	}
	const r = makeRng(mix(seed, 0xA1));
	if (cand.length) return cand[Math.min(cand.length - 1, Math.floor(r() * cand.length))].slice(0, 3);
	far.sort((a, b) => b[3] - a[3]);   // (a level with nowhere that far: the farthest flat place)
	return far.length ? far[0].slice(0, 3) : room.exit.slice();
}
/** The shrine (zone 4, hand-made, the 2D game's plan of it): a round grove inside a wall, two ponds, and to the north
 *  a raised dais with stairs up to the pedestal. */
export function shrineRoom(map = 'viridian') {
	const { w, h, ped, rim } = XK.SHRINE, cx = w >> 1, cz = h >> 1, room = makeRoom(w, h, 0);
	const d = (x, z) => Math.hypot(x - cx, (z - cz) * 1.1);
	const dais = (x, z) => Math.abs(x - cx) <= 4 && z - cz >= -16 && z - cz <= -10;
	const pond = (x, z) => Math.hypot(Math.abs(x - cx) - 11, z - cz - 4) < 2.6;
	for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
		if (d(x, z) > 19.5) setCell(room, x, z, rim);
		else if (dais(x, z)) setCell(room, x, z, LEVEL);
		else if (pond(x, z)) { setCell(room, x, z, -0.35); room.water.set(z * w + x, -0.05); }
	}
	// the stairs: two cells of slope up to the dais's south edge (each rises half a level towards the north)
	for (let x = cx - 1; x <= cx + 1; x++) { setCell(room, x, cz - 9, LEVEL, { ax: 'z', rise: -LEVEL / 2 }); setCell(room, x, cz - 8, LEVEL / 2, { ax: 'z', rise: -LEVEL / 2 }); }
	room.spawn = [(cx + 0.5) * CELL, 0, (cz + 0.5) * CELL];
	room.altar = [(cx + ped[0] + 0.5) * CELL, LEVEL, (cz + ped[1] + 0.5) * CELL]; room.exit = room.altar;
	room.scatter = []; room.rimH = rim; room.maxH = LEVEL; room.size = 0; room.biome = XK.BIOME[map] || 'meadow'; room.shrine = true;
	return room;
}
/** The room of (seed, map, zone): zones 1-3 from the generator, zone 4 the shrine. The same for the host and every
 *  viewer. It carries `altar` (the exit marker is the altar too), `map` and `zone`. */
export function zoneRoom(seed, map, zone, X) {
	const mi = X ? X.MAP_IDS.indexOf(map) + 1 : 1;
	let room;
	if (zone >= 4) room = shrineRoom(map);
	else {
		const s = mix(seed, mi, zone, 0x3D);
		room = generate(s, XK.BIOME[map] || 'meadow', { size: XK.ZONE_TILES });
		room.biome = XK.BIOME[map] || 'meadow'; room.seed = s;
		room.altar = altarOf(room, s); room.exit = room.altar;
	}
	room.map = map; room.zone = zone;
	return room;
}

// ---------------------------------------------------------------- the run
/** A Classic run. o: { map, diff, seed, touch (a phone: the lower cap), and combat.js's newWorld options (dex, moves,
 *  ability, items, autoPick, …); a move given as [id, n] starts at Expedition level n; levels: false keeps the
 *  base game's level-ups instead of Expedition's (and then no economy either); eco: false leaves the economy out; cap: false leaves capture out }. -> the run: { w (the fight), map, diff, seed, zone, ph, charge, portalT, fs, boss,
 *  splits, bosses, log, won, lost, ended, says: [this step's banners] } */
export function newRun(data, X, o = {}) {
	const map = X.MAPS[o.map] ? o.map : 'viridian', diff = X.DIFFS.includes(o.diff) ? o.diff : 'normal', seed = (o.seed >>> 0) || 1;
	const room = zoneRoom(seed, map, 1, X);
	const own = !!X.L && o.levels !== false, lv = (o.moves || []).map((m) => (Array.isArray(m) ? m : [m, 1]));
	const w = newWorld(room, data, { ...o, moves: own ? lv.map((m) => m[0]) : o.moves, seed, cast: null, bosses: null });
	const S = { w, X, data, map, diff, seed, touch: !!o.touch, zone: 0, zs: 0, splits: [], log: [], bosses: [], won: false, lost: false, ended: false, dps: [], says: [], wonT: 0 };
	zoneStart(S, 1, 0);
	if (own) setupLevels(S, X.L, lv);
	if (own && X.E && o.eco !== false) setupEco(S);
	if (own && X.C && o.cap !== false) setupCap(S);
	return S;
}
const zIdx = (S) => Math.min(3, S.zone) - 1;
const diffIdx = (S) => Math.max(0, S.X.DIFFS.indexOf(S.diff));
export const say = (S, text, s = 3) => { S.says.push({ text, s }); S.w.events.push({ k: 'say', text, s }); };
const name = (S, dex) => { const m = S.data.mon(dex); return m ? m.name : ''; };
/** How many enemies there may be at once. */
export const capNow = (S) => Math.round((S.touch ? S.X.K.CAP_TOUCH : S.X.K.CAP) * (S.fs ? S.X.K.FINAL_CAP : 1) * S.X.tier(S.diff).cap);

function zoneStart(S, z, t) {
	const p = S.X.plan(S.seed, S.map, z, S.diff);
	Object.assign(S, { zone: z, zs: t, plan: p, n: 0, ph: 0, charge: 0, portalT: 0, fs: false, boss: null, exhSaid: false, acc: 0, trick: makeRng(mix(S.seed, S.X.MAP_IDS.indexOf(S.map) + 1, z, 0xC4)), specials: new Map() });
	say(S, z === 4 ? `— Shrine of ${name(S, p.legend)} —` : `— Zone ${z} · ${S.X.MAPS[S.map].name} —`, 3.2);
	S.w.events.push({ k: 'zone', zone: z });
}
/** Put the fight in another room: nothing of the old one comes along but you. */
function enterRoom(S, room) {
	const w = S.w;
	for (const k of ['enemies', 'shots', 'orbs', 'fields', 'effects', 'eshots', 'hazards', 'pickups']) w[k].length = 0;
	w.room = room; Object.assign(w.pl.s, newState(room, w.tune));
	w.field = null; w.fieldCell = -2; w.pl.target = null;
}

/** Your damage per second over the last 30 s (0 before 5 s of it). */
export function dps(S) {
	const L = S.dps; if (L.length < 2) return 0;
	const a = L[0], b = L[L.length - 1], span = b[0] - a[0];
	return span >= S.X.K.DPS_MIN ? Math.max(0, (b[1] - a[1]) / span) : 0;
}
function dpsSample(S, t) {
	const L = S.dps; if (L.length && t - L[L.length - 1][0] < 1) return;
	L.push([t, S.w.stats.dealt]);
	while (L.length > 2 && t - L[1][0] >= S.X.K.DPS_WIN) L.shift();
}
/** A guardian's or the legendary's HP: the greater of its curve and what your damage would take `target` seconds to
 *  halve (the 2D game's rule). */
export function bossHp(XKK, { zone, dps: d = 0, tier = 0, t = 0, legend = false, players = 1 }) {
	const zi = Math.min(3, zone) - 1;
	const curve = (legend ? XKK.LEGEND_HP : XKK.GUARD_HP[zi]) * (1 + t / 600) * (1 + CK.COOP.hp * Math.max(0, players - 1)) * (players > 1 ? 1.4 : 1);
	const target = legend ? XKK.LEGEND_TARGET : XKK.TARGET[zi], fromDps = d * target * XKK.SINGLE * (1 + XKK.TIER_K * tier);
	return { hp: Math.round(Math.max(curve, fromDps)), curve: Math.round(curve), fromDps: Math.round(fromDps), target };
}

// ---------------------------------------------------------------- arrivals
/** An enemy of the zone at (x, z). o: { ti (tiers above the clock's), hp, dmg, xp, spd (factors), scale, behavior,
 *  minion, kind ('alpha' | 'elite' | 'totem' | 'summoner' | 'roam') } */
export function spawn(S, dex, x, z, o = {}) {
	const w = S.w, XKK = S.X.K, t = w.t, zi = zIdx(S), teff = Math.max(t, XKK.ZMIN[zi]), [lo, hi] = XK.TIER_RANGE[zi], TR = S.X.tier(S.diff);
	const ti = clamp(S.data.tierAt(teff) + (o.ti || 0), lo, Math.min(5, hi + (o.ti || 0)));
	const m = S.fs ? Math.max(0, (t - S.zs - XKK.FINAL) / 60) : 0, party = 1 + w.mates.length;
	let def = S.data.defFor(dex, ti);
	if (o.behavior === 'summoner') def = { ...def, behavior: 'summoner', minion: o.minion, shotCd: 5, range: 420 };
	const e = addEnemy(w, dex, x, z, { t: teff, ti, def, behavior: o.behavior,
		hp: (1 + CK.COOP.hp * (party - 1)) * Math.pow(XKK.FINAL_HP, m) * (o.hp || 1) * TR.hp, dmg: Math.pow(XKK.FINAL_DMG, m) * (o.dmg || 1) * TR.dmg, spd: (o.spd === undefined ? 1 : o.spd) * TR.spd });
	e.xp = Math.round(def.xp * XKK.XP_K * (o.xp || 1) * TR.xp);
	const cu = curse(S); if (cu > 0) { e.maxHp = e.hp = Math.round(e.maxHp * (1 + cu)); e.dmg *= 1 + cu; }   // (the Cursed Incense: + 12 % a level)
	const xm = mods(S);   // (the cursed balls and altars: + difficulty; Gengar's greed: + XP)
	if (xm.diff > 0) { e.maxHp = e.hp = Math.round(e.maxHp * (1 + xm.diff)); e.dmg *= 1 + xm.diff; }
	if (xm.xp > 0) e.xp = Math.round(e.xp * (1 + xm.xp));
	if (o.scale) { e.scale = o.scale; e.cr = S.data.radius(dex, o.scale); }
	if (o.kind === 'alpha') mark(S, e, 'alpha');   // (it faints at 1 HP: the Friend Ball's window)
	if (o.kind) { e.xk = o.kind; S.specials.set(e.id, { kind: o.kind, e, t0: t, next: XKK.TOTEM.every, rng: makeRng(mix(S.seed, e.id, 0x70)) }); }
	return e;
}
const inRoom = (room, x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx >= 1 && cz >= 1 && cx < room.w - 1 && cz < room.h - 1 && room.cells[cz * room.w + cx] < (room.rimH || 8) ? cz * room.w + cx : -1; };
/** Can a body of this kind arrive at (x, z)? A walker needs floor it can walk to you from. */
export function free(S, x, z, fly) {
	const w = S.w, i = inRoom(w.room, x, z); if (i < 0) return false;
	return fly || !(w.room.water.has(i) || (w.field && w.field.dist[i] < 0));
}
/** A place for an arrival: round you at angle `ang`, `ring[0]` m away or up to `ring[1]` more. */
function spot(S, rng, ang, fly, ring = [CK.SPAWN_MIN, CK.SPAWN_MAX - CK.SPAWN_MIN]) {
	const s = S.w.pl.s;
	for (let i = 0; i < 10; i++) {
		const a = ang + (i ? (rng() - 0.5) * 1.8 : 0), d = ring[0] + rng() * ring[1], x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
		if (free(S, x, z, fly)) return [x, z];
	}
	return null;
}
/** The steady trickle: the zone's cards (four to start, one more species a minute; the newest weighs 1.4, older ones
 *  0.85 each), and now and then a wanderer. */
function trickle(S, dt, t, zt) {
	const w = S.w, XKK = S.X.K;
	if (S.zone === 4 && S.ph !== 3) return;   // (the shrine is quiet until the legendary is up)
	const cap = capNow(S);
	if (w.enemies.length >= cap) { S.acc = 0; return; }
	const zi = zIdx(S), teff = Math.max(t, XKK.ZMIN[zi]), TR = S.X.tier(S.diff), party = 1 + w.mates.length;
	const k = TR.amount * (1 + CK.COOP.rate * (party - 1)) * (S.boss ? XKK.BOSS_RATE : 1) * (S.fs ? XKK.FINAL_SPAWN : 1) * (S.zone === 4 ? XKK.SHRINE_RATE : 1) * (1 + XKK.ZONE_RATE * zi) * (1 + mods(S).rate);
	S.acc = Math.min(8, S.acc + spawnRate(teff) * k * dt);
	const cards = S.plan.cards, nC = Math.min(cards.length, XKK.CARDS0 + Math.floor(Math.max(0, zt) / XKK.CARD_EVERY));
	while (S.acc >= 1 && w.enemies.length < cap) {
		S.acc -= 1;
		const rng = S.trick, wt = []; let tot = 0;
		for (let i = 0; i < nC; i++) { const v = i === nC - 1 && nC > XKK.CARDS0 ? 1.4 : Math.pow(0.85, nC - 1 - Math.max(i, XKK.CARDS0 - 1)); wt.push(v); tot += v; }
		let r = rng() * tot, ci = 0;
		while (ci < nC - 1 && (r -= wt[ci]) > 0) ci++;
		let dex = cards[ci];
		const wd = S.plan.wander;
		if (wd && wd.length && rng() < XKK.WANDER) dex = wd[Math.floor(rng() * wd.length) % wd.length];
		const pt = spot(S, rng, rng() * 6.2832, S.data.hovers(dex));
		if (pt) spawn(S, dex, pt[0], pt[1], TR.elite > 0 && rng() < TR.elite ? { ...XKK.ELITE, kind: 'elite' } : undefined);
	}
}

// ---------------------------------------------------------------- the timeline's events
/** One of the plan's events, now, round you. -> the log's entry ({ kind, n, dex, zt, spawned }) */
export function fire(S, ev) {
	const w = S.w, XKK = S.X.K, t = w.t, s = w.pl.s, rng = makeRng(ev.seed), zi = zIdx(S);
	const entry = { at: ev.at, kind: ev.kind, n: ev.n, dex: ev.dex.slice(), zt: Math.round((t - S.zs) * 10) / 10, spawned: 0 };
	S.log.push(entry);
	const add = (e) => { if (e) entry.spawned++; return e; };
	const one = (dex, o, ring) => { const pt = spot(S, rng, rng() * 6.2832, S.data.hovers(dex) || o.behavior === 'summoner', ring); return pt ? add(spawn(S, dex, pt[0], pt[1], o)) : null; };
	if (ev.kind === 'alpha') { one(ev.dex[0], { ti: 1, ...XKK.ALPHA, spd: 0.9, kind: 'alpha' }); say(S, `An alpha ${name(S, ev.dex[0])} appears!`); }
	else if (ev.kind === 'swarm' || (ev.kind === 'elite' && !ev.mega)) {
		const a0 = rng() * 6.2832, el = ev.kind === 'elite';
		for (let i = 0; i < ev.n; i++) { const dex = ev.dex[i % ev.dex.length], pt = spot(S, rng, a0 + i / ev.n * 6.2832, S.data.hovers(dex), el ? undefined : XK.SWARM); if (pt) add(spawn(S, dex, pt[0], pt[1], el ? { ...XKK.ELITE, kind: 'elite' } : undefined)); }
		say(S, el ? 'Elite wave!' : 'Swarm! They surround you', 2.6);
	} else if (ev.kind === 'stampede' || ev.kind === 'flock') {
		// a herd seven abreast that crosses in a straight line, from behind you (a wall ends a runner's charge; a flock goes over)
		const fly = ev.kind === 'flock', a = rng() * 6.2832, dx = Math.cos(a), dz = Math.sin(a), spd = (fly ? XKK.FLOCK_SPD : XKK.STAMPEDE_SPD) * U, back = XK.HERD_BACK;
		for (let i = 0; i < ev.n; i++) {
			const lane0 = ((i % 7 - 3) * 44 + (rng() - 0.5) * 20) * U, row0 = (Math.floor(i / 7) * 46 + rng() * 16) * U;
			for (const [dl, dr] of [[0, 0], [0, 50], [0, -50], [30, 100], [-30, 100], [0, 160], [0, -110], [50, 220]]) {
				const lane = lane0 + dl * U, row = row0 + dr * U, x = s.x - dx * (back + row) - dz * lane, z = s.z - dz * (back + row) + dx * lane;
				if (!free(S, x, z, fly)) continue;
				const e = add(spawn(S, ev.dex[0], x, z, { spd: fly ? 1 : 0.9 }));
				if (fly && !e.fly) { e.fly = true; e.a.fly = true; e.a.grounded = false; e.a.hover = CK.FLY_HOVER; e.a.y = groundAt(w.room, x, z) + CK.FLY_HOVER; }
				e.run = { dx, dz, spd, t: (2 * back + row) / spd };
				break;
			}
		}
		say(S, fly ? 'A flock crosses the zone!' : `${name(S, ev.dex[0])} stampede!`, 2.6);
	} else if (ev.kind === 'rockslide') {
		const ti = S.data.tierAt(Math.max(t, XKK.ZMIN[zi])), dmg = S.data.tiers[ti].dmg * 1.6 * (1 + t / 420) * XKK.DMG_K, tele = S.X.tier(S.diff).tele;
		for (let i = 0; i < ev.n; i++) {
			const a = rng() * 6.2832, d = (i < 4 ? rng() * 60 : 70 + rng() * 190) * U, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
			if (inRoom(w.room, x, z) < 0) continue;
			hazard(w, { kind: 'zone', x, y: groundAt(w.room, x, z), z, r: XKK.ROCK_R * U, delay: (1.1 + i / ev.n * 1.6) * tele, dmg: Math.round(dmg), type: 'rock' });
			entry.spawned++;
		}
		say(S, 'Rock slide! Get out of the circles', 2.6);
	} else if (ev.kind === 'elite') { one(ev.dex[0], { ti: 1, ...XKK.MEGA, kind: 'elite' }); say(S, `A wild ${name(S, ev.dex[0])} appears!`, 3.2); }
	else if (ev.kind === 'totem') { one(ev.dex[0], { ti: 1, ...XKK.TOTEM, kind: 'totem' }); say(S, `A dominant ${name(S, ev.dex[0])} calls its own!`); }
	else if (ev.kind === 'roam') { one(ev.dex[0], { ti: 1, ...XKK.ROAM, kind: 'roam' }); say(S, `A legendary ${name(S, ev.dex[0])} roams the zone!`, 3.2); }
	else if (ev.kind === 'summoner') { one(ev.dex[0], { ti: 1, ...XKK.SUMMONER, spd: 0, behavior: 'summoner', minion: S.X.MAPS[S.map].minion[ev.dex[0]] || ev.dex[0], kind: 'summoner' }, XK.SUMMONER); say(S, `${name(S, ev.dex[0])}, a summoner!`); }
	return entry;
}
/** Totems call allies; a summoner and a roaming legendary leave after their time; the big ones leave a berry. */
function tickSpecials(S, dt, t) {
	const w = S.w, XKK = S.X.K;
	for (const [id, sp] of S.specials) {
		const e = sp.e;
		if (e.dead) {
			const g = groundAt(w.room, e.a.x, e.a.z);
			if (sp.kind === 'alpha' && S.cap) { S.specials.delete(id); continue; }   // (capture owns a fainted alpha: its prize only if you leave it)
			if (!sp.left) drop(w, 'heal', e.a.x + (S.lv ? 20 * U : 0), g, e.a.z, 0);
			if (!sp.left && S.lv && (sp.kind === 'alpha' || sp.kind === 'roam')) drop(w, 'item', e.a.x - 20 * U, g, e.a.z, dropItem(S));   // an alpha and a roamer leave an item too
			S.specials.delete(id); continue;
		}
		if (sp.kind === 'totem' && (sp.next -= dt) <= 0) {
			sp.next = XKK.TOTEM.every;
			if (w.enemies.length < capNow(S) + 10) for (let i = 0; i < XKK.TOTEM.calls; i++) {
				const dex = S.plan.cards[Math.floor(sp.rng() * Math.min(S.plan.cards.length, 6))], a = sp.rng() * 6.2832, d = e.cr + XK.TOTEM_R * U;
				const x = e.a.x + Math.cos(a) * d, z = e.a.z + Math.sin(a) * d;
				if (inRoom(w.room, x, z) >= 0 && (S.data.hovers(dex) || Math.abs(groundAt(w.room, x, z) - e.a.y) <= K.STEP)) spawn(S, dex, x, z);
			}
			w.events.push({ k: 'call', id: e.id });
		} else if ((sp.kind === 'summoner' && t - sp.t0 > XKK.SUMMONER.life) || (sp.kind === 'roam' && t - sp.t0 > XKK.ROAM.life)) {
			sp.left = true; e.dead = true;   // (it got away: gone, and it leaves nothing)
			if (sp.kind === 'roam') say(S, `${name(S, e.dex)} has left!`, 2.6);
			S.specials.delete(id);
		}
	}
}

// ---------------------------------------------------------------- guardians
function wake(S, t) {
	const w = S.w, XKK = S.X.K, legend = S.zone === 4, dex = legend ? S.plan.legend : S.plan.guardian, zi = zIdx(S), TR = S.X.tier(S.diff);
	const d0 = dps(S), hp = bossHp(XKK, { zone: S.zone, dps: d0, tier: diffIdx(S), t, legend, players: 1 + w.mates.length });
	const dmg = (legend ? XKK.LEGEND_DMG : XKK.GUARD_DMG[zi]) * TR.dmg, sp = S.data.baseSpd(dex), b = S.data.behaviorOf(dex);
	const def = { dex, boss: true, hp: hp.hp, spd: Math.round(clamp(40 + sp * 0.5, 40, 100)), dmg: Math.round(dmg * 1.2), xp: (w.xpNeed || xpFor)(w.pl.level) * (legend ? XKK.LEGEND_XP : XKK.GUARD_XP[zi]),
		behavior: b === 'ranged' || legend ? 'ranged' : sp > 90 ? 'charger' : 'chase', shotDmg: Math.round(dmg * 0.55), shotCd: 1.1, range: 260 };
	const [ax, , az] = w.room.altar, bz = az - XK.BOSS_NORTH * U;
	const e = addBoss(w, dex, ax, bz, { def, t });
	e.maxHp = e.hp = hp.hp;   // (its HP is already the curve's: only its damage grows with the clock)
	e.xk = legend ? 'legend' : 'guardian'; e.xborn = t; e.xtarget = hp.target;
	S.bosses.push({ zone: S.zone, dex, hp: e.maxHp, curve: hp.curve, fromDps: hp.fromDps, dps: Math.round(d0), target: hp.target, at: t, down: null });
	S.boss = e; S.ph = legend ? 3 : 1; S.charge = 1; S.exhSaid = false;
	// Hard brings one escort, Nightmare two: elites of the zone's first cards
	const rng = makeRng(mix(S.seed, S.zone, S.X.MAP_IDS.indexOf(S.map) + 1, 0xE5C));
	for (let i = 0; i < TR.escorts; i++) {
		const ed = S.plan.cards[Math.floor(rng() * Math.min(S.plan.cards.length, 6))], a = (i + 0.5) / TR.escorts * 6.2832 + rng() * 0.6;
		let x = ax + Math.cos(a) * XK.ESCORT_R * U, z = bz + Math.sin(a) * XK.ESCORT_R * U;
		if (!free(S, x, z, S.data.hovers(ed))) { x = ax; z = az; }
		spawn(S, ed, x, z, { ...S.X.ESCORT, kind: 'elite' }).xescort = 1;
	}
	say(S, legend ? `${name(S, dex)} appears at the shrine!` : `${name(S, dex)}, the guardian, awakens!`, 3.4);
	return e;
}
function tickBoss(S, t) {
	const e = S.boss; if (!e) return;
	if (e.dead) {
		S.boss = null;
		const b = S.bosses[S.bosses.length - 1]; if (b) b.down = Math.round((t - b.at) * 10) / 10;
		if (e.xk === 'legend') { S.ph = 4; S.won = true; S.wonT = 0; S.splits[3] = t; say(S, 'EXPEDITION COMPLETE!', S.X.K.WIN_T + 1); }
		else { S.ph = 2; S.portalT = 0; for (const p of S.w.pickups) p.pulled = true; say(S, 'The portal opens! Step into it', 3.4); }
		return;
	}
	const k = S.X.exhaustion(t - e.xborn, e.xtarget);
	e.takenK = k > 1 ? k : 0;
	if (k > 1 && !S.exhSaid) { S.exhSaid = true; say(S, `${name(S, e.dex)} is exhausted!`, 2.6); }
}
function nextZone(S, t) {
	const z = S.zone + 1;
	S.splits[S.zone - 1] = t;
	enterRoom(S, zoneRoom(S.seed, S.map, z, S.X));
	zoneStart(S, z, t);
}

/** Are you on a site? Within `r` cells of it on the ground, and on its level. */
export function onSite(S, r) {
	const s = S.w.pl.s, a = S.w.room.altar;
	return !S.w.pl.dead && Math.hypot(s.x - a[0], s.z - a[2]) < r * CELL && Math.abs(s.y - a[1]) <= XK.SITE_UP;
}
/** One tick of the run: the fight's tick, then the run's own rules. While you choose a level-up card nothing moves. */
export function stepRun(S, input, dt = K.TICK) {
	const w = S.w, XKK = S.X.K;
	S.says.length = 0;
	if (S.ended) return S;
	if (holdCine(S, dt)) { w.events.length = 0; return S; }   // (a ball is shaking: the world holds)
	if (S.pick) {   // a choice is up (a ball's items, Meowth's stall, Hypno): the fight holds until it is made
		w.events.length = 0;
		if (w.autoPick === undefined || w.autoPick === null) return S;
		if (S.pick.onTake) pickTake(S, 0); else if (S.pick.kind === 'shop' || S.pick.kind === 'hypno') pickClose(S); else for (let i = 0; S.pick && i < S.pick.ids.length; i++) pickTake(S, i);
		S.pick = null;
	}
	const t0 = w.t;
	w.cap = capNow(S);
	tick(w, input, dt);
	if (w.t === t0) return S;
	const t = w.t;
	if (w.pl.dead && !w.mates.length && !w.guest) { S.ended = true; S.lost = true; w.events.push({ k: 'runover', won: false }); return S; }
	if (S.lv) { tickStats(S, dt); for (const ev of w.events) if (ev.k === 'pickup' && ev.kind === 'item') takeItem(S, ev.value); }
	if (S.cap) tickCap(S, dt);
	if (S.eco) tickEco(S, dt);
	dpsSample(S, t);
	tickSpecials(S, dt, t);
	tickBoss(S, t);
	if (S.ph === 0) {
		S.charge = clamp(S.charge + (onSite(S, XKK.ALTAR_R) ? dt / XKK.ALTAR_T : -dt / XKK.ALTAR_T * 0.5), 0, 1);
		if (S.charge >= 1) wake(S, t);
	} else if (S.ph === 2) {
		S.portalT = onSite(S, XKK.PORTAL_R) ? S.portalT + dt : Math.max(0, S.portalT - dt);
		if (S.portalT >= XKK.PORTAL_T) { nextZone(S, t); return S; }
	} else if (S.ph === 4) {
		S.wonT += dt;
		if (S.wonT >= XKK.WIN_T) { S.ended = true; w.events.push({ k: 'runover', won: true }); return S; }
	}
	const zt = t - S.zs;
	if (S.zone <= 3) {
		while (S.n < S.plan.events.length && zt >= S.plan.events[S.n].at) fire(S, S.plan.events[S.n++]);
		if (!S.fs && zt >= XKK.FINAL) { S.fs = true; say(S, 'FINAL SWARM! Wake the guardian', 4); }
	}
	if (S.ph !== 4) trickle(S, dt, t, zt);
	return S;
}

// ---------------------------------------------------------------- what the screen says
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** The HUD's line: the zone, the tier, the final swarm's countdown, and the objective with its distance. */
export function hudLine(S) {
	const w = S.w, XKK = S.X.K, s = w.pl.s, a = w.room.altar, m = Math.round(Math.hypot(s.x - a[0], s.z - a[2])), parts = [S.zone === 4 ? 'SHRINE' : `ZONE ${S.zone}/3`];
	if (S.diff !== 'normal') parts.push(S.diff.toUpperCase());
	if (S.zone <= 3 && S.ph < 2) parts.push(S.fs ? 'FINAL SWARM!' : 'FINAL SWARM IN ' + mmss(XKK.FINAL - (w.t - S.zs)));
	parts.push(S.ph === 0 ? `ALTAR ${m} m` : S.ph === 1 ? 'GUARDIAN' : S.ph === 2 ? `PORTAL ${m} m` : S.ph === 3 ? 'LEGENDARY' : 'COMPLETE!');
	if (S.boss && S.boss.takenK > 1) parts.push('EXHAUSTED ×' + S.boss.takenK.toFixed(1));
	if (S.eco) parts.push('₽ ' + S.coins);
	return parts.join(' · ');
}
/** The run's parts for the score, the score itself, and the end screen's lines. */
export function result(S) {
	const w = S.w, parts = { kills: w.stats.kills, time: Math.floor(w.t), dmg: Math.round(w.stats.dealt), zone: S.zone, bosses: S.bosses.filter((b) => b.down !== null).length, won: S.won, catches: S.cap ? S.cap.n : 0 };
	return { won: S.won, title: S.won ? 'EXPEDITION COMPLETE!' : 'RUN OVER', line: S.won ? 'Map complete!' : S.zone === 4 ? 'Reached the shrine' : `Reached zone ${S.zone}`, parts, score: S.X.score(parts, S.diff), splits: S.splits.slice(), bosses: S.bosses.map((b) => ({ ...b })) };
}
/** For tests and the page: put the zone's clock at `sec` (events between fire on the next step, in order). */
export const setZoneTime = (S, sec) => { S.zs = S.w.t - sec; };
