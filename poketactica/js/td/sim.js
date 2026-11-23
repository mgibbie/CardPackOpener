// td/sim.js — Poketactica TOWER DEFENSE, the simulation (owner, 2026-11-23; Plans/POKETACTICA_TOWER_DEFENSE_PLAN.md).
// Pure and exact: a run is its seed, its setup and the player's inputs stamped by tick, so it replays the same on any
// device (replays, live spectating, resume). No clocks, no Math.random; whole-number positions; one seeded RNG stream.
//
//   - figurines are TOWERS on any free tile off the path; enemies ONLY WALK the path to the base (towers have no HP)
//   - no turns: each of a tower's moves has a COOLDOWN (longer for costlier moves, shorter for faster Pokémon), costs SP
//     (which refills over time) and PP (refilled when a wave is cleared)
//   - damage and effects are the battles' own (engine/battle.js useMoveOn: the damage formula, type chart, abilities,
//     held items, move shapes and levels, height, terrain, Geo); statuses become timed (asleep = stopped, …)
//   - ENDLESS waves from the seed; slots open by wave; kills earn run-only energy; 20 lives
//
// The board is a battle-shaped state (S.B) so the battle rules apply unchanged; this file owns time.
import { newBattle, makeUnit, useMoveOn, moveOf, aimTiles, rngOf, fieldOn, RULES_REV } from '../engine/battle.js';
import { CALLS } from '../engine/statusfx2.js';
import { shapeTiles, isTile } from '../engine/grid.js';
import * as Geo from '../engine/geo.js';
import { makeFigurine, statsAt } from '../figurine.js';
import { pickSpecies } from '../dungeon.js';
import { buildMap } from '../campaign.js';
import { tdKind, healShare, weatherOf, terrainOf, buffHeld, isCall9 } from './effects.js';
import { makeRng } from '../../../overworld/rules/rng.js';
import { stageMult } from '../../../overworld/rules/tables.js';

export const TD_RULES_REV = 9;   // 9: status moves get a use on a tower (effects.js: boosts, changes to an enemy, Mean Look stops it, Gravity / Trick Room, Metronome); 8: the battle's RULES_REV 10; 7: the battle's RULES_REV 9; 6: the battle's RULES_REV 8; 5: the battle's RULES_REV 7; 4: the battle's RULES_REV 6; 2: moves with a worked-out power fire (the battle's RULES_REV 4); 3: the battle's RULES_REV 5
const BATTLE_REV = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10 };              // (the battle rules a run of an older revision was played by)
export const TPS = 20;                          // ticks a second
export const SUB = 256;                         // an enemy's place on the path: 1/256 of a tile
export const LIVES = 20, BOSS_LIVES = 5, BOSS_EVERY = 10;
export const SQUAD_MAX = 12, SLOTS_START = 3;
export const SLOT_WAVES = Object.freeze([3, 6, 10, 15, 20, 25, 30, 40, 50]);   // a slot opens when each is cleared (12 at most)
// TUNE (stage 5, with the auto-player)
export const CD_BASE = 1.0, CD_PER_SP = 0.4, CD_MIN = 0.5, CD_MAX = 2, GCD_TICKS = 8, SPE_REF_BASE = 80;
export const SP_REGEN_PCT = 4;                  // % of max SP a second
export const FIRST_WAVE_TICKS = 15 * TPS, INTERMISSION_TICKS = 6 * TPS;
export const RECALL_LOCK_TICKS = 10 * TPS, THROW_CD_TICKS = 10 * TPS, BUFF_TICKS = 20 * TPS, WEATHER_TICKS = 20 * TPS, OVERDRIVE_TICKS = 10 * TPS;
export const TRAP_TICKS = 2 * TPS;   // (Mean Look, Block, Spider Web ...: how long the enemy stands still)
export const STATUS_TICKS = Object.freeze({ slp: 3 * TPS, frz: 50, par: 6 * TPS, brn: 8 * TPS, psn: 8 * TPS, tox: 8 * TPS, confused: 50 });
export const DOT_EVERY = TPS, DOT_DIV = Object.freeze({ brn: 64, psn: 32, tox: 20 });   // every second, 1/64, 1/32, 1/20 of max HP
export const WALK_MIN = 0.6, WALK_MAX = 2.2;    // tiles a second
export const ENERGY = Object.freeze({ slot: 20, swap: 10, sp: 8, overdrive: 15 });
export const RULES = Object.freeze(['first', 'last', 'strong', 'weak', 'fast']);
// (owner, 2026-11-23: about half the Dungeon's EXP PER MINUTE, not per knockout. A wave is 15 to 40 knockouts, so at half
// per knockout a Lv 20 squad earned about 1,400 EXP a minute at 1×, several times a Dungeon floor's; measured with
// tools/poketactica/td_auto.mjs. At 0.04 it is about 110 a minute at 1×.)
export const TD_EXP_RATE = 0.04;

// ---------------------------------------------------------------- maps
/**
 * A Tower Defense map: { id, name, theme, rows, ground?, geo?, symbols?, base: [x, y], paths: [[[x, y], …], …] }
 * (rows / ground / geo as campaign.js's maps). Each path runs from a gate to the base, tile to adjacent tile.
 */
export function mapProblems(m, map) {
	const out = [];
	if (!m.paths || !m.paths.length) out.push('no path');
	for (const [i, p] of (m.paths || []).entries()) {
		if (p.length < 4) out.push(`path ${i + 1} is too short`);
		for (const [k, [x, y]] of p.entries()) {
			if (!isTile(map, x, y)) { out.push(`path ${i + 1} leaves the board at ${x},${y}`); break; }
			if (k && Math.abs(x - p[k - 1][0]) + Math.abs(y - p[k - 1][1]) !== 1) { out.push(`path ${i + 1} jumps at ${x},${y}`); break; }
		}
		const end = p[p.length - 1];
		if (end && (end[0] !== m.base[0] || end[1] !== m.base[1])) out.push(`path ${i + 1} does not end at the base`);
	}
	return out;
}

// ---------------------------------------------------------------- waves (from the seed alone)
/** Wave n's enemy level, the Dungeon's floor curve. */
export const waveLevel = (n, boss = false) => Math.min(999, Math.round(2.5 + 1.5 * n) + (boss ? 5 : 0));
export const isBossWave = (n) => n % BOSS_EVERY === 0;
/** How much more HP wave n's enemies have than their stat (TUNE). */
export const waveHpMult = (n) => 1 + n * 0.12;
export const BOSS_HP_MULT = 10;
/** Wave n: [{ sp, lv, boss, at (ticks after the wave starts), gate }], in spawn order. */
export function waveOf(seed, n, data, gates = 1) {
	const rng = makeRng(seed + ':td-wave' + n), boss = isBossWave(n), out = [];
	const kind = boss ? 'boss' : ['line', 'swarm', 'tanks', 'mixed'][Math.floor(rng() * 4)];
	const count = Math.min(40, kind === 'swarm' ? 8 + Math.floor(n * 0.9) : kind === 'tanks' ? 3 + Math.floor(n / 4) : 5 + Math.floor(n * 0.6));
	const gap = kind === 'swarm' ? Math.max(5, 14 - Math.floor(n / 6)) : kind === 'tanks' ? 40 : Math.max(8, 24 - Math.floor(n / 4));
	// a wave is one or two species (a mixed one: up to four), from the Dungeon's base-stat band for this depth
	const kinds = kind === 'mixed' ? 4 : kind === 'swarm' ? 1 : 2, pool = [];
	for (let i = 0; i < kinds; i++) pool.push(pickSpecies(rng, data, kind === 'tanks' ? n + 8 : kind === 'swarm' ? Math.max(1, n - 4) : n, false).id);
	let at = 0;
	if (boss) { out.push({ sp: pickSpecies(rng, data, n, true).id, lv: waveLevel(n, true), boss: true, at: 0, gate: Math.floor(rng() * gates) }); at = 60; }
	for (let i = 0; i < (boss ? Math.ceil(count / 2) : count); i++) {
		out.push({ sp: pool[Math.floor(rng() * pool.length)], lv: waveLevel(n), boss: false, at, gate: Math.floor(rng() * gates) });
		at += gap;
	}
	return out;
}
/** Slots open after `cleared` waves. */
export const slotsAfter = (cleared) => SLOTS_START + SLOT_WAVES.filter((w) => cleared >= w).length;
/** Stars for clearing wave n (the Dungeon's scale). */
export const waveStars = (n) => (10 + 2 * n) * (isBossWave(n) ? 3 : 1);

// ---------------------------------------------------------------- a run
/**
 * setup: { map (a Tower Defense map, see mapProblems), squad: [figurine] (up to SQUAD_MAX), startWave? (1, or a checkpoint) }
 */
export function newRun(seed, setup, data) {
	const m = setup.map, squad = (setup.squad || []).slice(0, SQUAD_MAX);
	const rev = setup.rev || TD_RULES_REV;   // (a replay of an older run plays by that run's rules)
	const B = newBattle(String(seed), { map: buildMap({ ...m, foes: [] }), player: [], enemy: [], noBonus: true, rev: BATTLE_REV[rev] || RULES_REV }, data);
	const onPath = {};
	for (const p of m.paths) for (const [x, y] of p) onPath[y * B.map.w + x] = 1;
	const start = Math.max(1, setup.startWave | 0 || 1);
	return {
		v: 1, rev, seed: String(seed), tick: 0, B, squad, paths: m.paths, onPath,
		wave: start - 1, cleared: start - 1, phase: 'wait', nextAt: FIRST_WAVE_TICKS, spawn: [], spawned: 0, leaked: false,
		lives: LIVES, energy: 0, bought: 0, locks: [], towers: [], enemies: [], n: 0,
		placed: {}, buffs: [], weatherUntil: 0, over: null, kills: 0, stars: 0, exp: {}, ev: [],
	};
}
export const slotsOf = (S) => Math.min(SQUAD_MAX, slotsAfter(S.cleared) + S.bought);
export const freeSlots = (S) => slotsOf(S) - S.towers.length - S.locks.filter((t) => t > S.tick).length;
const unitOf = (S, uid) => S.B.units.find((u) => u.uid === uid) || null;
const emit = (S, e) => { S.ev.push(e); };

/** A move's cooldown in ticks for this tower now (owner: "factor in the speed of the Pokémon using the move"). */
export function cooldownTicks(u, m) {
	const ref = statsAt({ spe: SPE_REF_BASE }, u.level).spe, spe = Math.max(1, u.stats.spe * stageMult(u.boosts.spe));
	const f = Math.max(CD_MIN, Math.min(CD_MAX, Math.sqrt(ref / spe)));
	const sec = (CD_BASE + CD_PER_SP * m.spCost) * f * (m.priority > 0 ? 0.5 : 1);
	return Math.max(4, Math.round(sec * TPS));
}

/** Why a figurine can't be placed there now, or null. */
export function placeBlock(S, figIdx, x, y) {
	const B = S.B;
	if (S.over) return 'the run is over';
	if (!S.squad[figIdx]) return 'no such figurine';
	if (S.placed[figIdx]) return 'already on the board';
	if (freeSlots(S) <= 0) return S.towers.length >= slotsOf(S) ? 'no free slot' : 'that slot is still resting';
	if (!isTile(B.map, x, y)) return 'not a tile';
	if (S.onPath[y * B.map.w + x]) return 'that is the path';
	if (B.map.base && B.map.base.x === x && B.map.base.y === y) return 'that is the base';
	if (S.towers.some((t) => t.x === x && t.y === y)) return 'a tower stands there';
	if (Geo.symbolAt(B, x, y)) return 'a Geo symbol stands there';
	return null;
}

// what a move can reach from a tower's tile never changes while it stands there: worked out once (per move level)
function reachOf(S, t, u, m) {
	const key = m.id + ':' + m.level;
	if (t.reach[key]) return t.reach[key];
	const B = S.B, W = B.map.w;
	// (Metronome and Nature Power have no shape of their own to aim by: they reach as a plain ranged move does, 1 to 3 tiles)
	const own = S.rev >= 9 && isCall9(m.id) ? { ...m, s: 'one', n: 0, r: [1, 3] } : m;
	const shape = own.s === 'dash' ? { ...own, s: 'line' } : own.s === 'leap' ? { ...own, s: 'one' } : own;
	const aims = [];
	for (const [ax, ay] of aimTiles(B, u, shape)) {
		const tiles = shapeTiles(B.map, shape, u.x, u.y, ax, ay).map(([x, y]) => y * W + x);
		if (tiles.length) aims.push({ x: ax, y: ay, tiles });
	}
	return (t.reach[key] = aims);
}
/** Every tile a tower's (switched-on, damaging or status) moves can cover from where it stands: [[x, y]]. */
export function towerReach(S, uid, data) {
	const t = S.towers.find((x) => x.uid === uid), u = t && unitOf(S, uid), W = S.B.map.w, seen = new Set();
	if (!u) return [];
	for (const mid of u.fig.equipped) {
		const m = moveOf(u, mid, data), k = m && tdKind(mid, m, S.B.rev, S.rev);
		if (!m || !(k === 'damage' || k === 'foe')) continue;
		for (const a of reachOf(S, t, u, m)) for (const i of a.tiles) seen.add(i);
	}
	return [...seen].map((i) => [i % W, Math.floor(i / W)]);
}

// ---------------------------------------------------------------- inputs
/** Apply one input now. -> null (done) or why not (nothing changed). */
export function applyInput(S, a, data) {
	if (!a || S.over) return 'the run is over';
	const B = S.B;
	if (a.t === 'place') {
		const why = placeBlock(S, a.fig, a.x, a.y);
		if (why) return why;
		const u = makeUnit(S.squad[a.fig], 't' + a.fig, 'p', a.x, a.y, 'hold', data);
		// (a figurine that comes back keeps the SP and PP it left with)
		const keep = S.bench && S.bench[a.fig];
		if (keep) { u.sp = keep.sp; u.pp = { ...keep.pp }; }
		B.units.push(u);
		S.towers.push({ uid: u.uid, fig: a.fig, x: a.x, y: a.y, rule: 'first', off: {}, cd: {}, gcd: 0, spFrac: 0, throwCd: 0, overdrive: 0, reach: {} });
		S.placed[a.fig] = 1;
		emit(S, { t: 'place', uid: u.uid, x: a.x, y: a.y });
		return null;
	}
	const t = a.uid != null ? S.towers.find((x) => x.uid === a.uid) : null;
	if (a.t === 'recall') {
		if (!t) return 'no such tower';
		recall(S, t, !!a.swap);
		return null;
	}
	if (a.t === 'rule') { if (!t || !RULES.includes(a.rule)) return 'no such rule'; t.rule = a.rule; return null; }
	if (a.t === 'toggle') { const u = t && unitOf(S, t.uid); if (!u || !u.fig.equipped.includes(a.move)) return 'no such move'; if (t.off[a.move]) delete t.off[a.move]; else t.off[a.move] = 1; return null; }
	if (a.t === 'spend') {
		const cost = a.kind === 'slot' ? ENERGY.slot * (S.bought + 1) : ENERGY[a.kind];
		if (!cost) return 'no such thing';
		if (S.energy < cost) return 'not enough energy';
		if (a.kind === 'slot') { if (slotsOf(S) >= SQUAD_MAX) return 'every slot is open'; S.bought++; }
		else if (a.kind === 'swap') { if (!t) return 'no such tower'; recall(S, t, true); }
		else if (a.kind === 'sp') { const u = t && unitOf(S, t.uid); if (!u) return 'no such tower'; if (u.sp >= u.maxSP) return 'its SP is full'; u.sp = u.maxSP; }
		else if (a.kind === 'overdrive') { if (!t) return 'no such tower'; t.overdrive = S.tick + OVERDRIVE_TICKS; }
		S.energy -= cost;
		emit(S, { t: 'spend', kind: a.kind, uid: t ? t.uid : null });
		return null;
	}
	if (a.t === 'throw') {
		const u = t && unitOf(S, t.uid), e = S.enemies.find((x) => x.uid === a.target), v = e && unitOf(S, e.uid);
		if (!u || !u.lift) return 'it can\'t lift';
		if (t.throwCd > S.tick) return 'not ready';
		if (!v || e.boss) return e && e.boss ? 'too heavy' : 'no such enemy';
		if (Math.abs(v.x - u.x) + Math.abs(v.y - u.y) !== 1) return 'not next to it';
		e.d = Math.max(0, e.d - u.throw * 2 * SUB);
		t.throwCd = S.tick + THROW_CD_TICKS;
		place(S, e, v);
		emit(S, { t: 'throw', uid: u.uid, target: v.uid, x: v.x, y: v.y });
		return null;
	}
	if (a.t === 'call') {
		if (S.phase !== 'wait') return 'a wave is under way';
		const early = Math.max(0, S.nextAt - S.tick);
		S.energy += Math.floor(early / TPS / 2);
		S.nextAt = S.tick;
		return null;
	}
	if (a.t === 'retire') { end(S, 'retired'); return null; }
	return 'no such order';
}
function recall(S, t, swap) {
	const u = unitOf(S, t.uid);
	(S.bench = S.bench || {})[t.fig] = { sp: u.sp, pp: { ...u.pp } };
	S.B.units = S.B.units.filter((x) => x !== u);
	S.towers = S.towers.filter((x) => x !== t);
	S.buffs = S.buffs.filter((b) => b.uid !== t.uid);
	delete S.placed[t.fig];
	if (!swap) S.locks.push(S.tick + RECALL_LOCK_TICKS);
	emit(S, { t: 'recall', uid: t.uid });
}
function end(S, why) {
	if (S.over) return;
	S.over = why;
	// stars for the waves cleared this run; EXP at the Tower Defense rate, to the figurines that earned it
	for (const [uid, n] of Object.entries(S.B.exp || {})) { const idx = +uid.slice(1); S.exp[idx] = Math.floor(n * TD_EXP_RATE); }
	emit(S, { t: 'over', why, wave: S.cleared });
}

// ---------------------------------------------------------------- a tick
const pathOf = (S, e) => S.paths[e.gate] || S.paths[0];
function place(S, e, v) { const p = pathOf(S, e), i = Math.min(p.length - 1, Math.floor(e.d / SUB)); v.x = p[i][0]; v.y = p[i][1]; }
/** An enemy's walk, 1/256 tile a tick, from its Speed stat (with its stage). */
function walkSpeed(v) {
	const ref = statsAt({ spe: SPE_REF_BASE }, v.level).spe, spe = Math.max(1, v.stats.spe * stageMult(v.boosts.spe));
	const tps = Math.max(WALK_MIN, Math.min(WALK_MAX, 1.2 * Math.sqrt(spe / ref)));
	return Math.round(tps * SUB / TPS);
}

/** One tick: the inputs for this tick (in order), then time moves on. `data` = the battle data. */
export function step(S, inputs, data) {
	S.ev = [];
	if (S.over) return S;
	const B = S.B;
	B.log.length = 0;
	for (const a of inputs || []) applyInput(S, a, data);
	if (S.over) return S;
	S.tick++;
	const tick = S.tick, W = B.map.w;
	if (S.locks.length) S.locks = S.locks.filter((t) => t > tick);

	// ---- the wave
	if (S.phase === 'wait' && tick >= S.nextAt) {
		S.wave++; S.phase = 'wave'; S.spawned = 0; S.leaked = false; S.waveStart = tick;
		S.spawn = waveOf(S.seed, S.wave, data, S.paths.length);
		emit(S, { t: 'wave', n: S.wave, boss: isBossWave(S.wave) });
	}
	if (S.phase === 'wave') {
		while (S.spawned < S.spawn.length && S.spawn[S.spawned].at <= tick - S.waveStart) {
			const w = S.spawn[S.spawned++];
			const fig = makeFigurine(w.sp, w.lv, makeRng(S.seed + ':td-foe' + S.wave + ':' + S.spawned), data, { id: 'foe', shinyRate: 0 });
			const p0 = S.paths[w.gate] || S.paths[0];
			const v = makeUnit(fig, 'e' + (S.n++), 'e', p0[0][0], p0[0][1], 'aggro', data);
			v.maxHP = Math.max(1, Math.floor(v.maxHP * waveHpMult(S.wave) * (w.boss ? BOSS_HP_MULT : 1))); v.hp = v.maxHP;
			B.units.push(v);
			S.enemies.push({ uid: v.uid, d: 0, gate: w.gate, boss: !!w.boss, stop: 0, slow: 0, back: 0, dot: 0, dotKind: null, by: null });
			emit(S, { t: 'spawn', uid: v.uid, boss: !!w.boss });
		}
	}

	// ---- enemies walk
	const gone = [];
	for (const e of S.enemies) {
		const v = unitOf(S, e.uid);
		if (!v || v.hp <= 0) { gone.push(e); continue; }
		// a status the battle rules just set: start its clock (bosses shake things off in half the time)
		if (v.status && e.dotKind !== v.status && !e.stat) {
			const k = v.status, dur = Math.ceil((STATUS_TICKS[k] || 0) / (e.boss ? 2 : 1));
			e.stat = tick + dur;
			if (k === 'slp' || k === 'frz') e.stop = Math.max(e.stop, tick + dur);
			else if (k === 'par') e.slow = Math.max(e.slow, tick + dur);
			else if (DOT_DIV[k]) { e.dotKind = k; e.dot = tick + DOT_EVERY; }
		}
		if (e.stat && tick >= e.stat) { v.status = null; e.stat = 0; e.dotKind = null; }
		if (v.confused > 0) { e.back = Math.max(e.back, tick + Math.ceil(STATUS_TICKS.confused / (e.boss ? 2 : 1))); v.confused = 0; }
		if (e.dotKind && tick >= e.dot) {
			e.dot = tick + DOT_EVERY;
			const n = Math.max(1, Math.floor(v.maxHP / DOT_DIV[e.dotKind]));
			v.hp = Math.max(0, v.hp - n);
			emit(S, { t: 'hurt', uid: v.uid, n, why: e.dotKind });
			if (v.hp <= 0) { fell(S, e, v, null); gone.push(e); continue; }
		}
		if (tick < e.stop) continue;
		let sp = walkSpeed(v);
		if (tick < e.slow) sp = Math.max(1, sp >> 1);
		const p = pathOf(S, e), endD = (p.length - 1) * SUB;
		e.d = tick < e.back ? Math.max(0, e.d - sp) : e.d + sp;
		if (e.d >= endD) {
			S.lives -= e.boss ? BOSS_LIVES : 1; S.leaked = true;
			v.hp = 0; gone.push(e);
			emit(S, { t: 'leak', uid: v.uid, lives: Math.max(0, S.lives) });
			continue;
		}
		place(S, e, v);
		v.facing = facingOn(p, Math.floor(e.d / SUB));
	}
	if (gone.length) { const ids = new Set(gone.map((e) => e.uid)); S.enemies = S.enemies.filter((e) => !ids.has(e.uid)); B.units = B.units.filter((u) => !ids.has(u.uid)); }
	if (S.lives <= 0) { S.lives = 0; end(S, 'lost'); return S; }

	// ---- timed things run out
	if (S.buffs.length) {
		const keep = [];
		for (const b of S.buffs) {
			if (tick < b.until) { keep.push(b); continue; }
			const u = unitOf(S, b.uid);
			if (u) for (const [k, d] of Object.entries(b.changes)) u.boosts[k] = Math.max(-6, Math.min(6, (u.boosts[k] || 0) - d));
		}
		S.buffs = keep;
	}
	if (B.field.weather && !S.weatherUntil) S.weatherUntil = tick + WEATHER_TICKS;
	if (S.weatherUntil && tick >= S.weatherUntil) { B.field.weather = null; S.weatherUntil = 0; emit(S, { t: 'weather', kind: null }); }
	if (S.fieldUntil) for (const k of Object.keys(S.fieldUntil)) if (tick >= S.fieldUntil[k]) { delete S.fieldUntil[k]; if (B.field.fx) delete B.field.fx[k]; emit(S, { t: 'field', what: k, on: false }); }

	// ---- towers act
	// who stands where (enemies share tiles): tile index -> [enemy]
	const occ = new Map();
	for (const e of S.enemies) { const v = unitOf(S, e.uid); const k = v.y * W + v.x; if (!occ.has(k)) occ.set(k, []); occ.get(k).push({ e, v }); }
	for (const t of S.towers) {
		const u = unitOf(S, t.uid);
		// SP comes back over time (owner): SP_REGEN_PCT % of max a second, in whole points
		if (u.sp < u.maxSP) { t.spFrac += u.maxSP * SP_REGEN_PCT; const per = 100 * TPS; while (t.spFrac >= per && u.sp < u.maxSP) { u.sp++; t.spFrac -= per; } } else t.spFrac = 0;
		if (t.gcd > 0) { t.gcd--; continue; }
		for (const mid of u.fig.equipped) {
			if (t.off[mid] || (t.cd[mid] || 0) > tick) continue;
			const m = moveOf(u, mid, data);
			if (!m || u.sp < m.spCost || (u.pp[mid] || 0) < 1) continue;
			if (fire(S, t, u, m, occ, data)) break;
		}
	}
	// (anything the battle rules knocked out this tick)
	{
		const dead = S.enemies.filter((e) => { const v = unitOf(S, e.uid); return !v || v.hp <= 0; });
		for (const e of dead) fell(S, e, unitOf(S, e.uid), e.by);
		if (dead.length) { const ids = new Set(dead.map((e) => e.uid)); S.enemies = S.enemies.filter((e) => !ids.has(e.uid)); B.units = B.units.filter((u) => !ids.has(u.uid)); }
	}

	// ---- the wave is cleared
	if (S.phase === 'wave' && S.spawned >= S.spawn.length && !S.enemies.length) {
		S.cleared = S.wave; S.phase = 'wait'; S.nextAt = tick + INTERMISSION_TICKS;
		S.stars += waveStars(S.wave);
		if (!S.leaked) S.energy += 5;
		// PP refills every wave (owner)
		for (const t of S.towers) { const u = unitOf(S, t.uid); for (const mid of u.fig.equipped) u.pp[mid] = (data.moves[mid] && data.moves[mid].pp) || 10; }
		if (S.bench) for (const b of Object.values(S.bench)) for (const mid of Object.keys(b.pp)) b.pp[mid] = (data.moves[mid] && data.moves[mid].pp) || 10;
		emit(S, { t: 'clear', n: S.wave, slots: slotsOf(S) });
	}
	return S;
}
const facingOn = (p, i) => { const a = p[Math.min(i, p.length - 2)], b = p[Math.min(i + 1, p.length - 1)]; return b[0] > a[0] ? 'e' : b[0] < a[0] ? 'w' : b[1] > a[1] ? 's' : 'n'; };
function fell(S, e, v, by) {
	S.kills++;
	S.energy += 1 + Math.floor((v ? v.level : 1) / 20) + (e.boss ? 10 : 0);
	emit(S, { t: 'fell', uid: e.uid, by: by || null, boss: e.boss });
}

/** A tower uses a move if it has something to use it on. -> did it */
function fire(S, t, u, m, occ, data) {
	const B = S.B, kind = tdKind(m.id, m, B.rev, S.rev), tick = S.tick;
	let victims = null, aim = null;
	if (kind === 'damage' || kind === 'foe' || kind === 'paint') {
		// the best aim by this tower's rule: the aim whose best victim ranks highest, then the one covering more
		let best = null;
		for (const a of reachOf(S, t, u, m)) {
			let top = -Infinity, n = 0, list = null;
			for (const i of a.tiles) { const here = occ.get(i); if (!here) continue; for (const o of here) { if (o.v.hp <= 0) continue; n++; (list = list || []).push(o); const r = rank(t.rule, o); if (r > top) top = r; } }
			if (!n) continue;
			if (!best || top > best.top || (top === best.top && n > best.n)) best = { top, n, a, list };
		}
		if (!best) return false;
		aim = best.a; victims = best.list;
	} else if (kind === 'buff') {
		if (S.phase !== 'wave' || !S.enemies.length || S.buffs.some((b) => b.uid === u.uid && b.move === m.id) || buffHeld(m.id, u)) return false;
		victims = [];   // (the battle rule picks: the user, and its neighbours at move level 99)
	} else if (kind === 'sp') {
		// a healing move gives SP back (owner): to the towers its shape covers, or to the user
		const share = healShare(m.id);
		const who = m.s === 'self' ? [u] : towersIn(S, t, u, m).filter((x) => x.sp < x.maxSP);
		const need = who.filter((x) => x.sp < x.maxSP - (m.s === 'self' ? m.spCost : 0));
		if (!need.length) return false;
		pay(S, t, u, m);
		for (const x of need) { const n = Math.min(x.maxSP - x.sp, Math.max(1, Math.floor(x.maxSP * share))); x.sp += n; emit(S, { t: 'sp', uid: x.uid, n, by: u.uid }); }
		emit(S, { t: 'use', uid: u.uid, move: m.id, x: u.x, y: u.y });
		return true;
	} else if (kind === 'weather') {
		const w = weatherOf(m.id);
		if (S.phase !== 'wave' || !S.enemies.length || (B.field.weather && B.field.weather.kind === w)) return false;
		pay(S, t, u, m);
		B.field.weather = { kind: w, turns: 5 }; S.weatherUntil = tick + WEATHER_TICKS;
		emit(S, { t: 'use', uid: u.uid, move: m.id, x: u.x, y: u.y }); emit(S, { t: 'weather', kind: w });
		return true;
	} else if (kind === 'field') {
		// Gravity / Trick Room: on for as long as a weather lasts
		if (S.phase !== 'wave' || !S.enemies.length || fieldOn(B, m.id)) return false;
		pay(S, t, u, m);
		B.field.fx = { ...(B.field.fx || {}), [m.id]: 99 }; S.fieldUntil = { ...(S.fieldUntil || {}), [m.id]: tick + WEATHER_TICKS };
		emit(S, { t: 'use', uid: u.uid, move: m.id, x: u.x, y: u.y }); emit(S, { t: 'field', what: m.id, on: true });
		return true;
	} else return false;

	pay(S, t, u, m);
	if (kind === 'paint') {
		// a terrain move paints its tiles' Geo colour, as in a battle (it lasts)
		const W = B.map.w, tiles = aim.tiles.map((i) => [i % W, Math.floor(i / W)]).filter(([x, y]) => !Geo.symbolAt(B, x, y));
		Geo.paint(B, tiles, terrainOf(m.id));
		emit(S, { t: 'use', uid: u.uid, move: m.id, x: aim.x, y: aim.y }); emit(S, { t: 'terrain', kind: terrainOf(m.id), tiles });
		return true;
	}
	if (aim && (aim.x !== u.x || aim.y !== u.y)) { const dx = aim.x - u.x, dy = aim.y - u.y; u.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'); }
	emit(S, { t: 'use', uid: u.uid, move: m.id, x: aim ? aim.x : u.x, y: aim ? aim.y : u.y });
	const targets = kind === 'buff' ? [u, ...(m.s === 'aura' ? towersIn(S, t, u, m) : [])].filter((x, i, arr) => arr.indexOf(x) === i) : victims.map((o) => o.v);
	const n0 = B.log.length;
	// (Metronome, Nature Power: the move they turn into is what lands on the ones in reach)
	const called = kind === 'damage' && isCall9(m.id) ? CALLS[m.id]({ data, rng: rngOf(B), user: u, target: null, allies: [], lastMove: null, terrain: Geo.terrainAt(B, u.x, u.y) }) : null;
	if (called) emit(S, { t: 'calls', uid: u.uid, move: called });
	useMoveOn(B, u, called || m.id, targets, data);
	for (let i = n0; i < B.log.length; i++) {
		const e = B.log[i];
		if (e.t === 'use') continue;
		emit(S, e);
		// a tower's own boosts are timed (a foe's drops stay on that foe)
		if (e.t === 'boost' && e.uid[0] === 't' && kind === 'buff') S.buffs.push({ uid: e.uid, move: m.id, changes: { ...e.changes }, until: tick + BUFF_TICKS });
	}
	// towers have no HP and take no status: recoil, a Life Orb, Rough Skin or a Poison Point leave no mark
	for (const x of S.towers) { const w = unitOf(S, x.uid); w.hp = w.maxHP; w.status = null; w.confused = 0; }
	if (victims) {
		for (const o of victims) {
			if (o.v.hp <= 0) { o.e.by = u.uid; continue; }
			// (Mean Look and its kin: it stops walking for 2 seconds, and cannot be stopped that way again for 6; a boss walks on)
			if (o.v.fx && o.v.fx.trapped) {
				delete o.v.fx.trapped; delete o.v.fx.octolock;
				if (!o.e.boss && tick >= (o.e.trapFree || 0)) { o.e.stop = Math.max(o.e.stop || 0, tick + TRAP_TICKS); o.e.trapFree = tick + 3 * TRAP_TICKS; emit(S, { t: 'stopped', uid: o.e.uid, ticks: TRAP_TICKS }); }
			}
			// knockback (Whirlwind, Roar…): back along the path
			if (m.kb && !o.e.boss) { o.e.d = Math.max(0, o.e.d - m.kb * SUB); place(S, o.e, o.v); }
		}
	}
	return true;
}
function pay(S, t, u, m) {
	u.sp -= m.spCost; u.pp[m.id]--;
	const cd = cooldownTicks(u, m);
	t.cd[m.id] = S.tick + (t.overdrive > S.tick ? Math.max(2, cd >> 1) : cd);
	t.gcd = GCD_TICKS;
}
const towersIn = (S, t, u, m) => { const W = S.B.map.w, set = new Set(); for (const a of reachOf(S, t, u, m)) for (const i of a.tiles) set.add(i); return S.towers.filter((x) => set.has(x.y * W + x.x)).map((x) => unitOf(S, x.uid)); };
/** A target's rank under a tower's rule (higher = preferred). */
function rank(rule, o) {
	if (rule === 'last') return -o.e.d;
	if (rule === 'strong') return o.v.hp;
	if (rule === 'weak') return -o.v.hp;
	if (rule === 'fast') return o.v.stats.spe * 1000 + o.e.d / 1e6;
	return o.e.d;
}

// ---------------------------------------------------------------- snapshots and hashes
/** The whole run as plain data (a resume, a late spectator, a replay viewer's jump back). */
export const toSnapshot = (S) => JSON.parse(JSON.stringify({ ...S, ev: [] }));
export const fromSnapshot = (o) => { const S = JSON.parse(JSON.stringify(o)); S.ev = []; for (const t of S.towers) t.reach = {}; return S; };
/** A short fingerprint of everything that matters (two devices running the same run agree on it). */
export function hashOf(S) {
	const core = JSON.stringify([S.tick, S.wave, S.cleared, S.phase, S.lives, S.energy, S.bought, S.kills, S.over, S.B.rng,
		S.towers.map((t) => [t.uid, t.x, t.y, t.rule, t.gcd, t.cd]), S.enemies.map((e) => [e.uid, e.d, e.stop, e.slow, e.back]),
		S.B.units.map((u) => [u.uid, u.hp, u.sp, u.pp, u.boosts, u.status])]);
	let h = 2166136261;
	for (let i = 0; i < core.length; i++) { h ^= core.charCodeAt(i); h = Math.imul(h, 16777619); }
	return (h >>> 0).toString(16).padStart(8, '0');
}
/** What the page draws and a spectator's HUD shows. */
export function view(S) {
	return { tick: S.tick, wave: S.wave, cleared: S.cleared, phase: S.phase, nextIn: S.phase === 'wait' ? Math.max(0, S.nextAt - S.tick) : 0, lives: S.lives, energy: S.energy,
		slots: slotsOf(S), free: freeSlots(S), over: S.over, kills: S.kills, stars: S.stars, left: S.spawn.length - S.spawned + S.enemies.length,
		weather: S.B.field.weather ? S.B.field.weather.kind : null,
		towers: S.towers.map((t) => { const u = unitOf(S, t.uid); return { uid: t.uid, fig: t.fig, species: u.species, level: u.level, x: t.x, y: t.y, facing: u.facing, rule: t.rule, sp: u.sp, maxSP: u.maxSP, pp: { ...u.pp }, off: { ...t.off }, cd: Object.fromEntries(Object.entries(t.cd).map(([k, v]) => [k, Math.max(0, v - S.tick)])), lift: !!u.lift, throwIn: Math.max(0, t.throwCd - S.tick), overdrive: Math.max(0, t.overdrive - S.tick) }; }),
		enemies: S.enemies.map((e) => { const u = unitOf(S, e.uid), p = pathOf(S, e); return { uid: e.uid, species: u.species, level: u.level, hp: u.hp, maxHP: u.maxHP, boss: e.boss, d: e.d, gate: e.gate, x: u.x, y: u.y, facing: u.facing, status: u.status, stopped: S.tick < e.stop, back: S.tick < e.back, at: Math.min(p.length - 1, e.d / SUB) }; }) };
}
