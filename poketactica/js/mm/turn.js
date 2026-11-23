// mm/turn.js — Mystery Maze, the run: time, walking, floors (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "A turn"; the
// original's order from Plans/PMD_SYSTEMS_SPEC.md section 1). Pure and exact: a run is its seed, its dungeon, its party
// and the leader's actions, so it re-runs the same anywhere (replays, spectating, resume). No clocks, no Math.random.
//
//   - "everything only moves when I move": the run always stands on the LEADER's turn. act() takes the leader's action,
//     then gives everyone else their turns until the leader is up again.
//   - time is in ticks, 24 to a cycle; a normal Pokémon acts on every 4th. Speed stages (0 half .. 4 four times) decide
//     which ticks are yours, by the original's table. Each tick: the leader, then partners in party order, then wild
//     Pokémon in the order they appeared.
//   - 8 directions; no diagonal step round a wall's corner; walking into a partner swaps places
//   - liquid: water is crossed by Water types and fliers, lava by Fire types and fliers; nobody else steps in
//   - partners follow the leader by the shortest way they can walk
//   - a floor is the generator's (mm/gen.js), each from the next seed of the original's per-floor chain; the stairs lead
//     down; the last floor's stairs clear the dungeon
//   - what you have seen: your room and its doorways, or the tiles round you in a corridor, stays on the map
//
// S (plain data, JSON-safe): { v, rev, seed, dungeon, floorNo, pre, rng, F, seen, units, leader, tick, turns, steps, over, ev }
//   F: the floor { w, h, terrain[], room[], spawn[], stairs: [x, y], water, vis, mh, shop, keeper }
//   a unit: engine/battle.js makeUnit's, plus { dir 0..7, stage (speed), attacking, swapped }
// Node-tested (overworld/tests/poketactica_mm_turn_test.mjs).
import { generateFloor, MM_W, MM_H, T_WALL, T_FLOOR, T_IMPASSABLE, NO_ROOM } from './gen.js';
import { makeRng, floorSeedStep, preseedOf } from './rng.js';
import { DIR8, canStep8, cheb, sightTiles, dir8Toward, inFloor } from './shapes8.js';
import { makeUnit } from '../engine/battle.js';

export const MM_RULES_REV = 1;
export const MM_PARTY_MAX = 6;
export const TICKS = 24, NORMAL_STAGE = 1, MAX_STAGE = 4;
/** Does a Pokémon at this speed stage get a turn on this tick? (the original's table: 3, 6, 12, 18 or 24 turns a cycle) */
export const actsOn = (stage, tick) => (stage <= 0 ? tick % 8 === 7 : stage === 1 ? tick % 4 === 3 : stage === 2 ? tick % 2 === 1 : stage === 3 ? tick % 4 !== 0 : true);

const hash32 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ev = (S, e) => { S.ev.push(e); };
export const unit = (S, uid) => S.units.find((u) => u.uid === uid) || null;
export const leaderOf = (S) => unit(S, S.leader);
export const unitAt = (S, x, y) => S.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
export const partyOf = (S) => S.units.filter((u) => u.side === 'p' && u.hp > 0);
/** A dungeon's floor n (1-based): { props (the generator's settings), water, vis }. Past the list, the last one repeats. */
export const floorOf = (dungeon, n) => dungeon.floors[Math.min(n, dungeon.floors.length) - 1];

// ---------------------------------------------------------------- who can stand where
const kindAt = (F, x, y) => (inFloor(F, x, y) ? F.terrain[y * F.w + x] & 3 : T_WALL);
export const isLiquid = (F, x, y) => kindAt(F, x, y) >= 2;
/** Fliers cross any liquid; Water types cross water; Fire types cross lava. */
export function crossesLiquid(F, u) {
	const t = u.types || [];
	return t.includes('Flying') || u.ability === 'levitate' || t.includes(F.water ? 'Water' : 'Fire');
}
/** Can this unit stand on a tile (walls and liquid; who else is there is not asked)? */
export function canEnter(F, u, x, y) {
	const k = kindAt(F, x, y);
	if (k === T_WALL) return false;
	return k === T_FLOOR || crossesLiquid(F, u);
}
/** Can this unit step in direction d (the corner rule, and the ground it steps onto)? */
export const canWalk = (F, u, d) => canStep8(F, u.x, u.y, d) && canEnter(F, u, u.x + DIR8[d][0], u.y + DIR8[d][1]);

/** Steps from (x, y) to every tile this unit could walk to (-1: it can't), other Pokémon not counted. */
export function walkMap(F, u, x, y) {
	const dist = new Int16Array(F.w * F.h).fill(-1), q = [y * F.w + x], me = { ...u };
	dist[q[0]] = 0;
	for (let h = 0; h < q.length; h++) {
		const i = q[h];
		me.x = i % F.w; me.y = (i / F.w) | 0;
		for (let d = 0; d < 8; d++) {
			if (!canWalk(F, me, d)) continue;
			const j = (me.y + DIR8[d][1]) * F.w + me.x + DIR8[d][0];
			if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); }
		}
	}
	return dist;
}

// ---------------------------------------------------------------- a run, a floor
/**
 * setup: { dungeon: { id, name, party (how many may enter, 1..6), floors: [{ props, water, vis }] }, party: [figurine] }
 * (the first figurine leads)
 */
export function newRun(seed, setup, data) {
	const size = Math.max(1, Math.min(MM_PARTY_MAX, setup.dungeon.party || 4));
	const S = { v: 1, rev: MM_RULES_REV, seed: String(seed), dungeon: setup.dungeon, floorNo: 0, pre: preseedOf(hash32(String(seed))), rng: 1, F: null, seen: [], units: [], leader: 'p0', tick: 0, turns: 0, steps: 0, over: null, ev: [] };
	setup.party.slice(0, size).forEach((fig, i) => {
		const u = makeUnit(fig, 'p' + i, 'p', 0, 0, null, data);
		Object.assign(u, { jump: 0, dir: 4, stage: NORMAL_STAGE, attacking: false, swapped: false });
		S.units.push(u);
	});
	enterFloor(S, 1);
	return S;
}
function enterFloor(S, n) {
	const fl = floorOf(S.dungeon, n);
	const [seed, pre] = floorSeedStep(S.pre);
	S.pre = pre;
	const rng = makeRng(seed), f = generateFloor(rng, fl.props, { water: !!fl.water });
	S.rng = rng.state;   // (the floor's one stream goes on into play, as the original's)
	S.F = { w: MM_W, h: MM_H, terrain: Array.from(f.terrain), room: Array.from(f.room), spawn: Array.from(f.spawn), stairs: f.stairs, water: !!fl.water, vis: fl.vis | 0, mh: f.mh, shop: f.shop, keeper: f.shopKeeper };
	S.seen = new Array(MM_W * MM_H).fill(0);
	S.floorNo = n; S.tick = 0; S.turns = 0;
	// the leader on the floor's start; partners on the nearest tiles they can stand on, in party order
	const L = leaderOf(S), party = partyOf(S);
	for (const u of party) { u.x = -1; u.y = -1; u.attacking = false; u.swapped = false; }
	L.x = f.player[0]; L.y = f.player[1];
	for (const u of party) {
		if (u === L) continue;
		const dist = walkMap(S.F, u, L.x, L.y);
		let best = -1;
		for (let i = 0; i < dist.length; i++) if (dist[i] > 0 && (best < 0 || dist[i] < dist[best]) && !unitAt(S, i % MM_W, (i / MM_W) | 0)) best = i;
		if (best < 0) for (let i = 0; i < dist.length && best < 0; i++) if (S.F.room[i] !== NO_ROOM && canEnter(S.F, u, i % MM_W, (i / MM_W) | 0) && !unitAt(S, i % MM_W, (i / MM_W) | 0)) best = i;   // (cut off by liquid: any room tile)
		u.x = best % MM_W; u.y = (best / MM_W) | 0; u.dir = L.dir;
	}
	ev(S, { t: 'floor', n });
	reveal(S);
	untilLeader(S);
}
/** How far the leader sees in a corridor: 2, or the floor's own darkness (1 on the darkest). */
export const sightRange = (F) => (F.vis === 1 ? 1 : 2);
/** The tiles the leader sees right now, as indexes. */
export function sightNow(S) {
	const L = leaderOf(S);
	return sightTiles(S.F, L.x, L.y, sightRange(S.F)).map(([x, y]) => y * S.F.w + x);
}
function reveal(S) { for (const i of sightNow(S)) S.seen[i] = 1; }

// ---------------------------------------------------------------- the leader's action
/**
 * Why the leader can't do this now, or null. Actions:
 *   { t: 'step', d }    walk one tile (d 0..7, clockwise from north); into a partner: swap places
 *   { t: 'face', d }    turn on the spot (free: no time passes)
 *   { t: 'pass' }       let a turn go by
 *   { t: 'stairs' }     go down (standing on the stairs)
 */
export function actBlock(S, a) {
	if (S.over) return 'the run is over';
	const L = leaderOf(S), F = S.F;
	if (!a || typeof a.t !== 'string') return 'not an action';
	if (a.t === 'pass') return null;
	if (a.t === 'stairs') return L.x === F.stairs[0] && L.y === F.stairs[1] ? null : 'not on the stairs';
	if (a.t !== 'step' && a.t !== 'face') return 'not an action';
	if (!Number.isInteger(a.d) || a.d < 0 || a.d > 7) return 'not a direction';
	if (a.t === 'face') return null;
	const x = L.x + DIR8[a.d][0], y = L.y + DIR8[a.d][1];
	if (F.terrain[y * F.w + x] & T_IMPASSABLE || !inFloor(F, x, y)) return 'a wall';
	if (!canStep8(F, L.x, L.y, a.d)) return kindAt(F, x, y) === T_WALL ? 'a wall' : 'a corner in the way';
	if (!canEnter(F, L, x, y)) return F.water ? 'deep water' : 'lava';
	const o = unitAt(S, x, y);
	if (o && o.side !== 'p') return 'a Pokémon in the way';
	if (o && !canEnter(F, o, L.x, L.y)) return 'your partner cannot stand here';
	return null;
}
/** The leader acts, then everyone else until the leader is up again. -> the events (S.ev); a refused action is [{ t: 'no', why }] and no time passes. */
export function act(S, a) {
	S.ev = [];
	const why = actBlock(S, a);
	if (why) { ev(S, { t: 'no', why }); return S.ev; }
	const L = leaderOf(S);
	if (a.t === 'face') { L.dir = a.d; ev(S, { t: 'face', uid: L.uid, d: a.d }); return S.ev; }
	if (a.t === 'stairs') {
		ev(S, { t: 'stairs', n: S.floorNo });
		if (S.floorNo >= S.dungeon.floors.length) { S.over = { won: true, floor: S.floorNo }; ev(S, { t: 'over', won: true }); } else enterFloor(S, S.floorNo + 1);
		return S.ev;
	}
	if (a.t === 'step') {
		const x = L.x + DIR8[a.d][0], y = L.y + DIR8[a.d][1], o = unitAt(S, x, y);
		if (o) { o.x = L.x; o.y = L.y; o.dir = (a.d + 4) % 8; o.swapped = true; ev(S, { t: 'step', uid: o.uid, x: o.x, y: o.y, d: o.dir, swap: true }); }
		L.x = x; L.y = y; L.dir = a.d; S.steps++;
		ev(S, { t: 'step', uid: L.uid, x, y, d: a.d });
		reveal(S);
	} else ev(S, { t: 'pass', uid: L.uid });
	S.turns++;
	others(S);
	S.tick = (S.tick + 1) % TICKS;
	untilLeader(S);
	return S.ev;
}

// ---------------------------------------------------------------- everyone else
/** Ticks go by until one is the leader's. */
function untilLeader(S) {
	for (let guard = 0; guard < TICKS * 4 && !S.over; guard++) {
		if (actsOn(NORMAL_STAGE, S.tick)) for (const u of S.units) u.attacking = false;   // (once a normal turn, before anyone acts)
		const L = leaderOf(S);
		if (actsOn(L.stage, S.tick) && !L.attacking) return;
		others(S);
		S.tick = (S.tick + 1) % TICKS;
	}
}
/** The rest of a tick, after the leader: partners in party order (those an ally blocked get up to 3 more goes, nearest the leader first). */
function others(S) {
	const L = leaderOf(S);
	let waiting = [];
	for (const u of partyOf(S)) {
		if (u === L) continue;
		if (u.swapped) { u.swapped = false; continue; }   // (it was walked into: that was its move)
		if (!actsOn(u.stage, S.tick) || u.attacking) continue;
		if (!follow(S, u)) waiting.push(u);
	}
	for (let pass = 0; pass < 3 && waiting.length; pass++) {
		waiting = waiting.map((u, i) => [Math.min(2, Math.max(0, cheb(u.x, u.y, L.x, L.y) - 1)), i, u]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]).filter((u) => !follow(S, u));
	}
}
/** A partner's turn: stay beside the leader, or take the next step of the shortest walk to them. -> false when only an ally is in the way */
function follow(S, u) {
	const L = leaderOf(S), F = S.F;
	if (cheb(u.x, u.y, L.x, L.y) <= 1) return true;
	const dist = walkMap(F, u, L.x, L.y), here = dist[u.y * F.w + u.x];
	if (here < 0) return true;   // (no way across: it waits where it is)
	const toward = dir8Toward(u.x, u.y, L.x, L.y);
	let blocked = false;
	for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
		const d = (toward + turn + 8) % 8;
		if (!canWalk(F, u, d)) continue;
		const x = u.x + DIR8[d][0], y = u.y + DIR8[d][1], n = dist[y * F.w + x];
		if (n < 0 || n >= here) continue;
		const o = unitAt(S, x, y);
		if (o) { if (o.side === 'p') blocked = true; continue; }
		u.x = x; u.y = y; u.dir = d;
		ev(S, { t: 'step', uid: u.uid, x, y, d });
		return true;
	}
	return !blocked;
}

// ---------------------------------------------------------------- saving, comparing, showing
export const toSnapshot = (S) => JSON.parse(JSON.stringify({ ...S, ev: [] }));
export const fromSnapshot = (o) => { const S = JSON.parse(JSON.stringify(o)); S.ev = []; return S; };
export function hashOf(S) {
	const core = JSON.stringify([S.floorNo, S.pre, S.rng, S.tick, S.turns, S.steps, S.over, S.leader, S.F.terrain, S.F.spawn, S.seen, S.units.map((u) => [u.uid, u.x, u.y, u.dir, u.hp, u.sp, u.pp, u.stage, u.attacking, u.swapped, u.status, u.boosts])]);
	return hash32(core).toString(16).padStart(8, '0');
}
/**
 * What the player sees, which is all a spectator gets: the ground they have explored (-1 where they have not been), the
 * stairs once seen, and the Pokémon in sight. No seed, nothing behind the fog.
 */
export function view(S) {
	const F = S.F, now = new Set(sightNow(S)), si = F.stairs[1] * F.w + F.stairs[0];
	return { floor: S.floorNo, floors: S.dungeon.floors.length, dungeon: S.dungeon.name || S.dungeon.id, w: F.w, h: F.h, water: F.water, leader: S.leader, turns: S.turns, over: S.over,
		tiles: F.terrain.map((t, i) => (S.seen[i] ? t & 3 : -1)), stairs: S.seen[si] ? F.stairs : null,
		units: S.units.filter((u) => u.hp > 0 && (u.side === 'p' || now.has(u.y * F.w + u.x))).map((u) => ({ uid: u.uid, side: u.side, species: u.species, level: u.level, x: u.x, y: u.y, dir: u.dir, hp: u.hp, maxHP: u.maxHP, sp: u.sp, maxSP: u.maxSP, status: u.status, shiny: !!(u.fig && u.fig.shiny) })) };
}
