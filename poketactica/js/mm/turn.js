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
//   - FIGHTING is the battle engine's (mm/combat.js): a move costs PP and SP; the plain Attack costs nothing. An attack or
//     a move is one a normal turn however fast you are (the original's rule): extra speed is extra steps
//   - WILD Pokémon stand where the floor marked them (some asleep until you come close), from the floor's own list; a new
//     one walks in every 36 turns. They and your partners think for themselves (mm/ai.js)
//   - a fainted figurine is GONE (owner): it leaves the run at once and is listed in S.fallen for the page to bury. If it
//     led, the next partner leads; with nobody left the run is lost
//   - your party heals as it goes (a full heal in 200 turns); walking gives SP back; burns and poison bite every so often
//
// S (plain data, JSON-safe): { v, rev, seed, dungeon, floorNo, pre, rng, F, seen, units, leader, tick, turns, steps, n,
//                              spawnT, fallen, B, over, ev }
//   F: the floor { w, h, terrain[], room[], spawn[], stairs: [x, y], water, vis, mh, shop, keeper }
//   a unit: engine/battle.js makeUnit's, plus { dir 0..7, stage (speed), attacking, swapped, nap, regen, chip, tactic, goal }
//   B: the battle-shaped board the engine fights on (its units ARE S.units; its map is the floor)
// Node-tested (overworld/tests/poketactica_mm_turn_test.mjs).
import { generateFloor, MM_W, MM_H, T_WALL, T_FLOOR, T_IMPASSABLE, S_ENEMY, NO_ROOM } from './gen.js';
import { makeRng, floorSeedStep, preseedOf } from './rng.js';
import { DIR8, canStep8, cheb, sightTiles, dir8Toward, inFloor } from './shapes8.js';
import { makeUnit } from '../engine/battle.js';
import { makeFigurine } from '../figurine.js';
import { makeRng as figRng } from '../../../overworld/rules/rng.js';
import { newBoard, boardMap, mazeGeo, face, moveBlock, useMove, ATTACK_ID } from './combat.js';
import { aiTurn } from './ai.js';

export const MM_RULES_REV = 1;
export const REGEN_TURNS = 200;                 // a full heal for a party member takes this many of its turns
export const SP_STEP = 0.02;                    // of max SP back per tile walked
export const NAP_CHANCE = 8;                    // % of wild Pokémon that start asleep
export const SPAWN_EVERY = 36, WILD_MAX = 10, WILD_MAX_HOUSE = 4, SPAWN_AWAY = 6;
export const CHIP = Object.freeze({ brn: [20, 16], psn: [10, 16], tox: [5, 16] });   // a status bites every N of its turns, for 1/Nth of max HP
export const FRZ_THAW = 20;                     // % a turn
export const TACTICS = Object.freeze(['follow', 'hunt', 'away', 'wait']);
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
export const wildOf = (S) => S.units.filter((u) => u.side !== 'p' && u.hp > 0);
/** A roll on the floor's own stream (the original's generator, carried on from making the floor): 0 .. n-1. */
export function roll(S, n) { const r = makeRng(0); r.state = S.rng; const v = r.int(n); S.rng = r.state; return v; }
const setDir = face;
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
	const S = { v: 1, rev: MM_RULES_REV, seed: String(seed), dungeon: setup.dungeon, floorNo: 0, pre: preseedOf(hash32(String(seed))), rng: 1, F: null, seen: [], units: [], leader: 'p0', tick: 0, turns: 0, steps: 0, n: 0, spawnT: 0, fallen: [], B: null, over: null, ev: [] };
	setup.party.slice(0, size).forEach((fig, i) => { S.units.push(mmUnit(makeUnit(fig, 'p' + i, 'p', 0, 0, null, data), { tactic: 'follow' })); });
	enterFloor(S, 1, data);
	return S;
}
const mmUnit = (u, more) => { Object.assign(u, { jump: 0, dir: 4, stage: NORMAL_STAGE, attacking: false, swapped: false, nap: false, regen: 0, chip: 0, goal: null }, more); u.facing = 's'; return u; };
/** The board follows the floor: made once, its map and units re-pointed whenever they are replaced (a new floor, a restore). */
function link(S, data) {
	if (!S.B) S.B = newBoard(S.seed, S.F, data);
	S.B.map = boardMap(S.F);
	S.B.units = S.units;
	return S;
}
const geoOf = (S) => mazeGeo(S.F, (u, x, y) => canEnter(S.F, u, x, y));
function enterFloor(S, n, data) {
	const fl = floorOf(S.dungeon, n);
	const [seed, pre] = floorSeedStep(S.pre);
	S.pre = pre;
	const rng = makeRng(seed), f = generateFloor(rng, fl.props, { water: !!fl.water });
	S.rng = rng.state;   // (the floor's one stream goes on into play, as the original's)
	S.F = { w: MM_W, h: MM_H, terrain: Array.from(f.terrain), room: Array.from(f.room), spawn: Array.from(f.spawn), stairs: f.stairs, water: !!fl.water, vis: fl.vis | 0, mh: f.mh, shop: f.shop, keeper: f.shopKeeper };
	S.seen = new Array(MM_W * MM_H).fill(0);
	S.floorNo = n; S.tick = 0; S.turns = 0; S.spawnT = 0;
	// the last floor's wild Pokémon are left behind; statuses do not follow you down the stairs
	for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p' || S.units[i].hp <= 0) S.units.splice(i, 1);
	for (const u of S.units) { u.status = null; u.confused = 0; u.chip = 0; u.goal = null; for (const k of Object.keys(u.boosts)) u.boosts[k] = 0; }
	link(S, data);
	S.B.field.weather = null;
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
		u.x = best % MM_W; u.y = (best / MM_W) | 0; setDir(u, L.dir);
	}
	// wild Pokémon where the floor marked them
	if (fl.wild && fl.wild.length) for (let x = 0; x < MM_W; x++) for (let y = 0; y < MM_H; y++) if ((S.F.spawn[y * MM_W + x] & S_ENEMY) && !unitAt(S, x, y)) spawnWild(S, x, y, data);
	ev(S, { t: 'floor', n });
	reveal(S);
	untilLeader(S, data);
}
/** A wild Pokémon from the floor's list ({ species, level, w }: w its weight), on this tile; some start asleep. */
function spawnWild(S, x, y, data) {
	const list = floorOf(S.dungeon, S.floorNo).wild || [];
	const total = list.reduce((a, e) => a + (e.w || 1), 0);
	if (!total) return null;
	let r = roll(S, total), pick = list[0];
	for (const e of list) { r -= e.w || 1; if (r < 0) { pick = e; break; } }
	const u = addWild(S, pick.species, pick.level, x, y, data);
	u.nap = roll(S, 100) < NAP_CHANCE;
	return u;
}
/** Put a wild Pokémon on a tile, awake (a spawn, a Monster House, a trap). */
export function addWild(S, species, level, x, y, data) {
	const uid = 'w' + S.n++;
	const fig = makeFigurine(species, level, figRng(S.seed + ':' + S.floorNo + ':' + uid), data, { id: uid, shinyRate: 0 });
	const u = mmUnit(makeUnit(fig, uid, 'e', x, y, null, data), {});
	setDir(u, roll(S, 8));
	S.units.push(u);
	return u;
}
/** Every 36 turns another wild Pokémon walks in: in a room, 6 tiles or more from the leader if there is such a place. */
function respawn(S, data) {
	if (!(floorOf(S.dungeon, S.floorNo).wild || []).length) return;
	if (++S.spawnT < SPAWN_EVERY) return;
	S.spawnT = 0;
	if (wildOf(S).length >= (S.F.mh !== NO_ROOM ? WILD_MAX_HOUSE : WILD_MAX)) return;
	const L = leaderOf(S), F = S.F;
	for (const pass of [0, 1, 2]) {
		const spots = [];
		for (let x = 0; x < F.w; x++) for (let y = 0; y < F.h; y++) {
			const i = y * F.w + x;
			if ((F.terrain[i] & 3) !== T_FLOOR || unitAt(S, x, y)) continue;
			if (pass < 2 && F.room[i] === NO_ROOM) continue;
			if (pass < 1 && Math.abs(x - L.x) < SPAWN_AWAY && Math.abs(y - L.y) < SPAWN_AWAY) continue;
			spots.push(i);
		}
		if (!spots.length) continue;
		const i = spots[roll(S, spots.length)], u = spawnWild(S, i % F.w, (i / F.w) | 0, data);
		if (u) ev(S, { t: 'spawn', uid: u.uid, x: u.x, y: u.y });
		return;
	}
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
 *   { t: 'attack' }     the plain Attack at the tile in front (free: no PP, no SP)
 *   { t: 'move', id, x, y }   use an equipped move aimed at a tile
 *   { t: 'tactic', uid, tactic }   tell a partner how to behave (free): follow, hunt, away, wait
 */
export function actBlock(S, a, data) {
	if (S.over) return 'the run is over';
	const L = leaderOf(S), F = S.F;
	if (!a || typeof a.t !== 'string') return 'not an action';
	if (a.t === 'pass' || a.t === 'attack') return null;
	if (a.t === 'move') return moveBlock(S.B, F, L, a.id, a.x, a.y, data);
	if (a.t === 'tactic') { const u = unit(S, a.uid); return u && u.side === 'p' && u.hp > 0 && u !== L && TACTICS.includes(a.tactic) ? null : 'not a tactic for a partner'; }
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
export function act(S, a, data) {
	S.ev = [];
	const why = actBlock(S, a, data);
	if (why) { ev(S, { t: 'no', why }); return S.ev; }
	const L = leaderOf(S);
	if (a.t === 'face') { setDir(L, a.d); ev(S, { t: 'face', uid: L.uid, d: a.d }); return S.ev; }
	if (a.t === 'tactic') { unit(S, a.uid).tactic = a.tactic; ev(S, { t: 'tactic', uid: a.uid, tactic: a.tactic }); return S.ev; }
	if (a.t === 'stairs') {
		ev(S, { t: 'stairs', n: S.floorNo });
		if (S.floorNo >= S.dungeon.floors.length) { S.over = { won: true, floor: S.floorNo }; ev(S, { t: 'over', won: true }); } else enterFloor(S, S.floorNo + 1, data);
		return S.ev;
	}
	if (a.t === 'step') {
		const x = L.x + DIR8[a.d][0], y = L.y + DIR8[a.d][1], o = unitAt(S, x, y);
		if (o) { o.x = L.x; o.y = L.y; setDir(o, (a.d + 4) % 8); o.swapped = true; ev(S, { t: 'step', uid: o.uid, x: o.x, y: o.y, d: o.dir, swap: true }); }
		stepTo(S, L, x, y, a.d);
		S.steps++;
	} else if (a.t === 'attack') strikeAt(S, L, ATTACK_ID, L.x + DIR8[L.dir][0], L.y + DIR8[L.dir][1], data);
	else if (a.t === 'move') strikeAt(S, L, a.id, a.x, a.y, data);
	else ev(S, { t: 'pass', uid: L.uid });
	S.turns++;
	after(S, L);
	others(S, data);
	S.tick = (S.tick + 1) % TICKS;
	untilLeader(S, data);
	return S.ev;
}

// ---------------------------------------------------------------- what any Pokémon's turn is made of
/** A step onto a free tile (the caller checked it): the move, the facing, SP back, the leader's sight. */
export function stepTo(S, u, x, y, d) {
	u.x = x; u.y = y; setDir(u, d);
	if (u.sp < u.maxSP) u.sp = Math.min(u.maxSP, u.sp + Math.ceil(u.maxSP * SP_STEP));
	ev(S, { t: 'step', uid: u.uid, x, y, d });
	if (u.uid === S.leader) reveal(S);
}
/**
 * An attack or a move aimed at a tile, by the battle's rules. The plain Attack may be swung at nothing (a turn all the
 * same). Whoever faints is dealt with here. -> did anything get resolved
 */
export function strikeAt(S, u, id, x, y, data) {
	u.attacking = true;
	if (moveBlock(S.B, S.F, u, id, x, y, data)) { ev(S, { t: 'use', uid: u.uid, move: id, x, y }); ev(S, { t: 'miss', uid: u.uid, why: 'no one there' }); return false; }
	const log = useMove(S.B, geoOf(S), u, id, x, y, data);
	S.B.log.length = 0;
	for (const e of log) {
		ev(S, e);
		if (e.t === 'hit' || e.t === 'hurt') { const v = unit(S, e.t === 'hit' ? e.target : e.uid); if (v && v.nap) { v.nap = false; ev(S, { t: 'woke', uid: v.uid }); } }
	}
	bury(S);
	return true;
}
/** Damage from outside a move (a status, hunger, a trap). */
export function hurt(S, u, n, why) {
	if (u.hp <= 0) return;
	const d = Math.min(u.hp, Math.max(1, n | 0));
	u.hp -= d;
	ev(S, { t: 'hurt', uid: u.uid, n: d, why });
	if (u.hp <= 0) { ev(S, { t: 'ko', uid: u.uid, by: null }); bury(S); }
}
/**
 * Whoever is at 0 HP leaves the run. A figurine of yours is GONE (owner: listed in S.fallen); if it led, the next in the
 * party leads; nobody left: the run is lost.
 */
function bury(S) {
	for (let i = S.units.length - 1; i >= 0; i--) {
		const u = S.units[i];
		if (u.hp > 0) continue;
		S.units.splice(i, 1);
		if (u.side !== 'p') continue;
		S.fallen.push({ id: u.fig.id || null, uid: u.uid, species: u.species, level: u.level, floor: S.floorNo });
		ev(S, { t: 'lost', uid: u.uid, species: u.species });
		if (u.uid !== S.leader) continue;
		const next = partyOf(S)[0];
		if (next) { S.leader = next.uid; next.swapped = false; ev(S, { t: 'leader', uid: next.uid }); reveal(S); }
		else { S.over = { won: false, floor: S.floorNo }; ev(S, { t: 'over', won: false }); }
	}
}
/** Before a Pokémon's turn: your party heals a little; sleep, ice and a wild Pokémon's nap may cost the turn. -> can it act */
function before(S, u) {
	if (u.side === 'p' && u.hp < u.maxHP && u.status !== 'psn' && u.status !== 'tox') {
		u.regen += u.maxHP;
		const n = Math.floor(u.regen / REGEN_TURNS);
		if (n > 0) { u.regen -= n * REGEN_TURNS; u.hp = Math.min(u.maxHP, u.hp + n); }
	}
	if (u.nap) {
		if (!S.units.some((o) => o.hp > 0 && o.side !== u.side && cheb(o.x, o.y, u.x, u.y) <= 1)) return false;
		u.nap = false; ev(S, { t: 'woke', uid: u.uid });
	}
	if (u.status === 'slp') { if (--u.sleepTurns > 0) { ev(S, { t: 'asleep', uid: u.uid }); return false; } u.status = null; ev(S, { t: 'woke', uid: u.uid }); }
	if (u.status === 'frz') { if (roll(S, 100) >= FRZ_THAW) { ev(S, { t: 'frozen', uid: u.uid }); return false; } u.status = null; ev(S, { t: 'thawed', uid: u.uid }); }
	return true;
}
/** After a Pokémon's turn: a burn or poison bites every so many turns. */
function after(S, u) {
	const c = u.hp > 0 && CHIP[u.status];
	if (!c) { u.chip = 0; return; }
	if (++u.chip >= c[0]) { u.chip = 0; hurt(S, u, Math.floor(u.maxHP / c[1]), u.status); }
}

// ---------------------------------------------------------------- everyone else
/** Ticks go by until one is the leader's. */
function untilLeader(S, data) {
	for (let guard = 0; guard < TICKS * 40 && !S.over; guard++) {
		if (actsOn(NORMAL_STAGE, S.tick)) { for (const u of S.units) u.attacking = false; respawn(S, data); }   // (once a normal turn, before anyone acts)
		const L = leaderOf(S);
		if (actsOn(L.stage, S.tick) && !L.attacking) {
			if (before(S, L)) return;
			after(S, L);   // (asleep or frozen: the leader's turn goes by)
			if (S.over) return;
		}
		others(S, data);
		S.tick = (S.tick + 1) % TICKS;
	}
}
/**
 * The rest of a tick, after the leader: partners in party order (those an ally blocked get up to 3 more goes, nearest the
 * leader first), then wild Pokémon in the order they appeared.
 */
function others(S, data) {
	if (S.over) return;
	const leader = S.leader;
	let waiting = [];
	for (const u of partyOf(S)) {
		if (S.over) return;
		if (u.uid === S.leader || u.uid === leader || u.hp <= 0) continue;
		if (u.swapped) { u.swapped = false; continue; }   // (it was walked into: that was its move)
		if (!actsOn(u.stage, S.tick) || u.attacking) continue;
		if (!before(S, u)) { after(S, u); continue; }
		if (aiTurn(S, u, data, AI) === 'blocked') waiting.push(u); else after(S, u);
	}
	for (let pass = 0; pass < 3 && waiting.length && !S.over; pass++) {
		waiting = waiting.filter((u) => u.hp > 0).map((u, i) => { const L = leaderOf(S); return [Math.min(2, Math.max(0, cheb(u.x, u.y, L.x, L.y) - 1)), i, u]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]).filter((u) => !follow(S, u));
	}
	for (const u of wildOf(S)) {
		if (S.over) return;
		if (u.hp <= 0 || !actsOn(u.stage, S.tick) || u.attacking) continue;
		if (before(S, u)) aiTurn(S, u, data, AI);
		after(S, u);
	}
}
/** A partner's turn: stay beside the leader, or take the next step of the shortest walk to them. -> false when only an ally is in the way */
export function follow(S, u) {
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
		stepTo(S, u, x, y, d);
		return true;
	}
	return !blocked;
}
/** What mm/ai.js is given to act with. */
const AI = { unitAt, canWalk, canEnter, walkMap, stepTo, strikeAt, follow, roll, leaderOf, setDir };

// ---------------------------------------------------------------- saving, comparing, showing
export const toSnapshot = (S) => JSON.parse(JSON.stringify({ ...S, ev: [], B: { ...S.B, units: null, map: null, log: [] } }));
/** A run from a snapshot (data: the game's tables, to re-point the board). */
export const fromSnapshot = (o, data) => { const S = JSON.parse(JSON.stringify(o)); S.ev = []; return link(S, data); };
export function hashOf(S) {
	const core = JSON.stringify([S.floorNo, S.pre, S.rng, S.B.rng, S.tick, S.turns, S.steps, S.n, S.spawnT, S.over, S.leader, S.fallen, S.B.exp, S.F.terrain, S.F.spawn, S.seen,
		S.units.map((u) => [u.uid, u.species, u.x, u.y, u.dir, u.hp, u.sp, u.pp, u.stage, u.attacking, u.swapped, u.status, u.boosts, u.nap, u.regen, u.chip, u.tactic, u.goal])]);
	return hash32(core).toString(16).padStart(8, '0');
}
/**
 * What the player sees, which is all a spectator gets: the ground they have explored (-1 where they have not been), the
 * stairs once seen, and the Pokémon in sight. No seed, nothing behind the fog.
 */
export function view(S) {
	const F = S.F, now = new Set(sightNow(S)), si = F.stairs[1] * F.w + F.stairs[0];
	return { floor: S.floorNo, floors: S.dungeon.floors.length, dungeon: S.dungeon.name || S.dungeon.id, w: F.w, h: F.h, water: F.water, leader: S.leader, turns: S.turns, over: S.over,
		tiles: F.terrain.map((t, i) => (S.seen[i] ? t & 3 : -1)), stairs: S.seen[si] ? F.stairs : null, fallen: S.fallen.length,
		units: S.units.filter((u) => u.hp > 0 && (u.side === 'p' || now.has(u.y * F.w + u.x))).map((u) => ({ uid: u.uid, side: u.side, species: u.species, level: u.level, x: u.x, y: u.y, dir: u.dir, hp: u.hp, maxHP: u.maxHP, sp: u.sp, maxSP: u.maxSP, status: u.status, nap: !!u.nap, tactic: u.tactic || null, shiny: !!(u.fig && u.fig.shiny) })) };
}
