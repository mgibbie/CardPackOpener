// battle.js — the Poketactica battle engine, core (stage 3a; Plans/POKETACTICA_PLAN.md). Pure and deterministic:
// newBattle(seed, setup, data) + the same actions -> the same battle, every time (replays, spectating, bets and resume
// are `seed + actions`). The Pokémon maths is overworld/rules/ (shared with the overworld's battles); the grid is
// grid.js; figurines are ../figurine.js; the enemy phase is ai.js.
//
// Turns are Disgaea's (owner, 2026-11-20): in the player phase each figurine moves (instant, undoable until it acts) and
// queues one action; EXECUTE resolves the queue IN THE ORDER IT WAS QUEUED, each hit after the first in one Execute
// getting the combo bonus; END PHASE executes what is left, then the enemy phase plays, then the next turn.
//
// data = { species, abilities, extra, moves (moves_battle.json), shapes (move_shapes.json) }
// setup = { map, player: [figurine...], enemy: [{ fig, x, y, ai? }...] }
//
// HELD ITEMS (owner, 2026-11-21): a figurine's `held` (goods.js HELD) is read here: u.held is the overworld's payload. The
// damage ones go through the shared rules (damageMods uItem, accuracyOf userAccBoost / targetEvade, critChanceOf), so the
// forecast and the hit agree; the rest are the hooks marked HELD below. Once-a-battle items set u.heldUsed.
import { makeRng } from '../../../overworld/rules/rng.js';
import { stageMult, STAT_MOVES } from '../../../overworld/rules/tables.js';
import { MOVE_FX } from '../../../overworld/rules/movefx.js';
import { baseDamage } from '../../../overworld/rules/damage.js';
import { accuracyOf, damageMods, critChanceOf, critMultOf, hitDamage } from '../../../overworld/rules/modifiers.js';
import { moveImmunity, statusBlock } from '../../../overworld/rules/immunity.js';
import { battleStats, moveAt, speedAccuracyMult, moveXpFromUse } from '../figurine.js';
import { reach, pathTo, shapeTiles, heightReach, heightAt, manhattan, dirToward, DIRS, AIM_BY_DIR, NO_AIM, key, isTile, canStep } from './grid.js';
import { enemyTurn } from './ai.js';
import * as Geo from './geo.js';
import * as Ab from './abilities.js';
import { heldOf } from '../goods.js';
import * as T from './terrain.js';

// PvP (owner 2026-11-22: up to 4 players on one map): the sides, in seat order; a match that runs this many rounds is
// decided by the HP each side has left
export const PVP_SIDES = Object.freeze(['a', 'b', 'c', 'd']);
export const PVP_ROUNDS = 30;
export const MAX_DEPLOYED = 6;
// SP FROM WALKING (owner, 2026-11-22: "SP should refill slowly from moving. each tile traversed can recover 2% SP rounded
// up"): a walk of n tiles gives back ceil(2% of max SP) per tile, never past the max; Undo takes it back. Every side walks
// by the same rule. RULES_REV: a battle made before a rule change (setup.rev missing / lower) replays by the old rules,
// so a saved battle resumes and an old replay plays exactly as it was played.
export const RULES_REV = 3;   // 2: SP from walking; 3: living terrain (engine/terrain.js)
export const SP_WALK = 0.02;
/** The SP a walk of `tiles` tiles gives back (0 for a battle from before the rule). */
export const spFromWalk = (S, u, tiles) => (S.spWalk && tiles > 0 ? Math.min(u.maxSP - u.sp, tiles * Math.ceil(u.maxSP * S.spWalk)) : 0);
function walkSp(S, u, path) {
	const n = spFromWalk(S, u, path.length - 1);
	if (n > 0) u.sp += n;
	return n;
}                 // owner: 6 on the map
export const COMBO_STEP = 0.1, COMBO_CAP = 2;  // +10% per earlier hit in one Execute, capped at x2
export const HEIGHT_STEP = 0.1, HEIGHT_CAP = 0.5;   // +-10% per level above / below the target, capped at +-50%
export const FACING_ACC = { front: 1, side: 1.25, back: 5 / 3 };   // Disgaea's facing accuracy
export const STATUS_CHIP = { brn: 1 / 16, psn: 1 / 8 };
export const TEAM_CHANCE = 0.3, TEAM_MAX = 3, TEAM_POWER = 0.5;   // team attacks (TUNE): each adjacent ally's chance, how many, at what power
export const CAPTURE_FAIL_BOOST = 1;
export const PAR_FAIL = 0.25, FRZ_THAW = 0.2, CONFUSE_SELF = 1 / 3;   // Pokémon's odds: fully paralysed, thawing, hurting itself in confusion                               // a foe that breaks free comes back angrier (+1 Attack)

/** A new battle. -> state (plain JSON: snapshot it with JSON) */
export function newBattle(seed, setup, data) {
	const S = { v: 1, seed: String(seed), rng: makeRng(seed).state(), map: setup.map, turn: 1, phase: 'player', units: [], rev: setup.rev || 1, spWalk: (setup.rev || 1) >= 2 ? SP_WALK : 0, terrain: (setup.rev || 1) >= 3 && !!(setup.map && setup.map.ground), queue: [], combo: 0,
		field: { weather: null }, log: [], over: null, xp: {}, exp: {} };
	Geo.setupGeo(S, setup.map);
	let n = 0;
	const mk = (fig, side, x, y, ai) => { S.units.push(makeUnit(fig, side + (n++), side, x, y, ai, data)); };
	if (setup.pvp) {
		// every seat deploys from its own base; a computer seat plays the enemy AI (aggro). No Bonus Gauge, EXP or capture.
		const seats = setup.pvp.seats.slice(0, PVP_SIDES.length);
		S.pvp = { sides: seats.map((_, i) => PVP_SIDES[i]), bases: {}, cpu: {}, cur: 0, out: [], winner: null };
		seats.forEach((st, i) => {
			const sd = PVP_SIDES[i];
			S.pvp.bases[sd] = { x: st.base.x, y: st.base.y };
			if (st.cpu) S.pvp.cpu[sd] = 1;
			const face = dirToward(st.base.x, st.base.y, (setup.map.w - 1) / 2, (setup.map.h - 1) / 2);
			for (const fig of (st.team || []).slice(0, MAX_DEPLOYED)) { mk(fig, sd, null, null, 'aggro'); S.units[S.units.length - 1].facing = face; }
		});
		// WILD foes (a made map's): side 'e', on the map from the start, no seat's; they fight every side (wildPhase)
		for (const e of setup.pvp.foes || []) mk(e.fig, 'e', e.x, e.y, e.ai);
	} else {
		for (const fig of setup.player) mk(fig, 'p', null, null);
		for (const e of setup.enemy) mk(e.fig, 'e', e.x, e.y, e.ai);
	}
	// GEO "Enemy Lv +N": foes standing on that colour at the start are N levels higher
	for (const u of S.units) {
		const lv = u.side === 'e' && u.x != null ? Geo.has(S, u.x, u.y, 'enemyLv') : null;
		if (lv) { const b = battleStats({ ...u.fig, level: Math.min(999, u.level + (lv.n || 0)) }, data); u.level = Math.min(999, u.level + (lv.n || 0)); u.stats = { atk: b.atk, def: b.def, spa: b.spa, spd: b.spd, spe: b.spe }; u.maxHP = u.hp = b.maxHP; heldStats(u, data); }
	}
	// the BONUS GAUGE's reward list, rolled from the seed
	const foeLv = S.units.filter((u) => u.side === 'e').reduce((a, u) => a + u.level, 0) / Math.max(1, S.units.filter((u) => u.side === 'e').length);
	S.bonus = S.pvp || setup.noBonus ? null : { points: 0, level: 0, rewards: Geo.rollBonus(rngOf(S), foeLv) };   // (noBonus: a made map pays no gauge)
	if (S.pvp && S.pvp.cpu.a) { Object.defineProperty(S, '_data', { value: data, enumerable: false, configurable: true }); cpuPhase(S, 'a', data); if (!S.over) pvpPass(S, data); }   // (a computer in the first seat plays its phase at once)
	for (const u of S.units) if (u.side === 'e' && u.x != null) Ab.onEnter(S, u, data, abHooks(S, data));
	return S;
}

/** A figurine as a unit on the board (a battle's, and the other modes' that use the battle's rules: Tower Defense). */
export function makeUnit(fig, uid, side, x, y, ai, data) {
	const b = battleStats(fig, data);
	const pp = {}; for (const m of fig.equipped) pp[m] = (data.moves[m] && data.moves[m].pp) || 10;
	const u = { uid, side, fig, species: fig.species, level: fig.level, ability: fig.ability, types: b.types,
		stats: { atk: b.atk, def: b.def, spa: b.spa, spd: b.spd, spe: b.spe }, maxHP: b.maxHP, hp: b.maxHP, maxSP: b.sp, sp: b.sp,
		move: b.move, jump: b.jump, lift: b.lift, throw: b.throw, pp, boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
		status: null, x, y, facing: side === 'p' ? 'n' : 's', moved: false, acted: false, origin: null, ai: ai || 'aggro', guard: false,
		held: heldOf(fig.held), heldId: heldOf(fig.held) ? fig.held : null, heldUsed: false, choiceLock: null };
	heldStats(u, data);
	return u;
}
/**
 * One use of a move OUTSIDE a turn-based battle (Tower Defense; Mystery Maze): the move's damage and effects on these
 * victims by the battle's own rules (strike: accuracy, the damage formula, type chart, abilities, held items, secondary
 * effects, team attacks, move XP). S is battle-shaped (newBattle's); the caller chose the victims (its own shapes and
 * timing). -> the events it added to S.log
 */
export function useMoveOn(S, u, moveId, victims, data) {
	const m = moveOf(u, moveId, data);
	if (!m) return [];
	const n0 = S.log.length;
	strike(S, u, m, MOVE_FX[moveId] || {}, STAT_MOVES[moveId], victims.filter((v) => v && v.hp > 0), data, rngOf(S));
	return S.log.slice(n0);
}
/** HELD: the items that change a unit's numbers (Choice Scarf: Speed x1.5 and +1 Move; Assault Vest: Sp. Def x1.5;
 *  Eviolite: Defense and Sp. Def x1.5 while the species can still evolve). */
function heldStats(u, data) {
	const h = u.held;
	if (!h) return;
	if (h.choice === 'spe') { u.stats.spe = Math.floor(u.stats.spe * 1.5); u.move += 1; }
	if (h.assaultVest) u.stats.spd = Math.floor(u.stats.spd * 1.5);
	if (h.eviolite && ((data.extra && data.extra[u.species] && data.extra[u.species].evos) || []).length) { u.stats.def = Math.floor(u.stats.def * 1.5); u.stats.spd = Math.floor(u.stats.spd * 1.5); }
}
/** Why a unit can't use a move because of its held item (a Choice item's lock, an Assault Vest's ban on status moves), or null. */
export function heldBlock(u, moveId, data) {
	if (!u.held) return null;
	if (u.held.choice && u.choiceLock && u.choiceLock !== moveId) return 'locked into ' + ((data.moves[u.choiceLock] || {}).name || u.choiceLock) + ' (Choice item)';
	if (u.held.assaultVest && (data.moves[moveId] || {}).category === 'Status') return 'no status moves (Assault Vest)';
	return null;
}
const heldEv = (S, u, what) => ev(S, { t: 'held', uid: u.uid, item: u.heldId, what });

// ---------- reading the state
export const unitAt = (S, x, y) => S.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
export const unit = (S, uid) => S.units.find((u) => u.uid === uid) || null;
export const onMap = (S, side) => S.units.filter((u) => u.side === side && u.hp > 0 && u.x != null);
/** Whose phase it is: the player's ('p') or, in PvP, the side of the seat that is playing. */
export const curSide = (S) => (S.pvp ? S.pvp.sides[S.pvp.cur] : 'p');
/** Where a side deploys from. */
export const baseOf = (S, side) => (S.pvp && S.pvp.bases[side]) || S.map.base;
// every draw reads and advances the battle's ONE saved position (two live generators would repeat each other's numbers)
export const rngOf = (S) => () => { const r = makeRng(0).at(S.rng); const v = r(); S.rng = r.state(); return v; };
const ev = (S, e) => { S.log.push(e); return e; };

/** Where a unit can move now. -> Map key -> tile */
export function moveTiles(S, u) {
	if (u.x == null) return new Map();
	const occ = (x, y) => { if (Geo.symbolAt(S, x, y)) return 'foe'; const o = unitAt(S, x, y); return !o || o === u ? null : o.side === u.side ? 'ally' : 'foe'; };   // (a Geo Symbol blocks the tile)
	return reach(S.map, u.x, u.y, moveNow(S, u), u.jump, occ, S.terrain ? (x, y) => T.stepCost(S, u, x, y) : undefined);
}

/** The Move a unit has right now: -1 while paralysed, 1 inside a foe's Arena Trap / Shadow Tag / Magnet Pull. */
export const moveNow = (S, u) => Math.min(Math.max(1, u.move - (u.status === 'par' ? 1 : 0)), Ab.trappedMove(S, u, S._data || {}) ?? Infinity);

/** A move at the figurine's move level, from the data. */
export function moveOf(u, moveId, data) {
	const shape = data.shapes[moveId], mv = data.moves[moveId];
	if (!shape || !mv) return null;
	const lv = ((u.fig.pool || []).find((p) => p.id === moveId) || {}).lv || 1;
	return { ...moveAt(shape, mv.power || 0, mv.acc, lv), id: moveId, name: mv.name, type: mv.type, category: mv.category, priority: mv.priority || 0 };
}

/** Where a unit could aim a move from where it stands. -> [[x, y], ...] (aim tiles; for a direction shape, the 4 neighbours) */
export function aimTiles(S, u, m) {
	if (NO_AIM.has(m.s)) return [[u.x, u.y]];
	if (AIM_BY_DIR.has(m.s)) return Object.values(DIRS).map(([dx, dy]) => [u.x + dx, u.y + dy]).filter(([x, y]) => isTile(S.map, x, y));
	// (only the box the move can reach, in the same row-by-row order as the whole map: big maps cost what small ones do)
	const out = [], r1 = m.r[1], y0 = Math.max(0, u.y - r1), y1 = Math.min(S.map.h - 1, u.y + r1), x0 = Math.max(0, u.x - r1), x1 = Math.min(S.map.w - 1, u.x + r1);
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
		const d = manhattan(u.x, u.y, x, y);
		if (d < m.r[0] || d > m.r[1] || !isTile(S.map, x, y)) continue;
		if (m.s !== 'leap' && !heightReach(S.map, m.h, u.x, u.y, x, y)) continue;
		out.push([x, y]);
	}
	return out;
}

// ---------- the player's actions
/** Apply one action. -> { ok, why?, events } (the state is changed in place; refused actions change nothing) */
export function act(S, a, data) {
	if (S.over) return { ok: false, why: 'over', events: [] };
	const before = S.log.length;
	const done = (ok, why) => ({ ok, why, events: S.log.slice(before) });
	Object.defineProperty(S, '_data', { value: data, enumerable: false, configurable: true });   // (not saved: the hooks need it)
	if (S.pvp) {
		// a player leaves (or the server concedes for one who went away): their figurines are out, at any time
		if (a.t === 'concede') {
			if (!S.pvp.sides.includes(a.by) || S.pvp.out.includes(a.by)) return done(false, 'not in the match');
			const wasCur = curSide(S) === a.by;
			for (const u of S.units) if (u.side === a.by && u.hp > 0) { u.hp = 0; u.x = null; u.y = null; }
			S.queue = S.queue.filter((q) => (unit(S, q.uid) || {}).side !== a.by);
			ev(S, { t: 'concede', side: a.by });
			checkOver(S);
			if (!S.over && wasCur) pvpPass(S, data, true);
			return done(true);
		}
		// the server's clock: the seat whose phase it is took too long; its phase ends (what it queued still lands)
		if (a.t === 'idle') { ev(S, { t: 'idle', side: curSide(S) }); endPlayerPhase(S, data); return done(true); }
		if (a.by !== curSide(S)) return done(false, 'not your turn');
	}
	if (a.t === 'execute') { execute(S, data); return done(true); }
	if (a.t === 'end') { if (S.phase !== 'player') return done(false, 'not your phase'); endPlayerPhase(S, data); return done(true); }
	// the Execute list's order (Disgaea: the queue resolves in order, and the order makes the combos): a.uids is the queue's
	// units in their new order (every one of them, once)
	if (a.t === 'order') {
		if (S.phase !== 'player') return done(false, 'not your phase');
		const ids = Array.isArray(a.uids) ? a.uids : [];
		if (ids.length !== S.queue.length || new Set(ids).size !== ids.length || !ids.every((id) => S.queue.some((q) => q.uid === id))) return done(false, 'not the queue');
		S.queue = ids.map((id) => S.queue.find((q) => q.uid === id));
		ev(S, { t: 'order', uids: [...ids] });
		return done(true);
	}
	const u = unit(S, a.uid);
	if (!u || u.hp <= 0) return done(false, 'no unit');
	if (S.phase !== 'player' || u.side !== curSide(S)) return done(false, 'not your unit');
	if (a.t === 'deploy') {
		if (u.x != null) return done(false, 'already deployed');
		if (onMap(S, u.side).length >= MAX_DEPLOYED) return done(false, 'six on the map');
		const { x, y } = baseOf(S, u.side);
		if (unitAt(S, x, y) || Geo.symbolAt(S, x, y)) return done(false, 'the base tile is taken');
		u.x = x; u.y = y; u.moved = false; u.acted = false; u.origin = null;
		ev(S, { t: 'deploy', uid: u.uid, x, y });
		Ab.onEnter(S, u, data, abHooks(S, data));
		return done(true);
	}
	if (u.x == null) return done(false, 'not deployed');
	if (a.t === 'move') {
		if (u.acted) return done(false, 'already acted');
		if (u.moved && !u.pivot) return done(false, 'already moved');
		const tiles = u.pivot ? reach(S.map, u.x, u.y, u.pivot, u.jump, (x, y) => { const o = unitAt(S, x, y); return !o || o === u ? null : o.side === u.side ? 'ally' : 'foe'; }) : moveTiles(S, u);
		if (!tiles.has(key(a.x, a.y))) return done(false, 'out of reach');
		const path = pathTo(tiles, a.x, a.y);
		if (!u.pivot) u.origin = { x: u.x, y: u.y, facing: u.facing, sp: u.sp };
		if (path.length > 1) { const [px, py] = path[path.length - 2]; u.facing = dirToward(px, py, a.x, a.y); }
		u.x = a.x; u.y = a.y; u.moved = true; u.pivot = 0;
		const sp = walkSp(S, u, path);
		ev(S, { t: 'move', uid: u.uid, path, ...(sp ? { sp } : {}) });
		return done(true);
	}
	if (a.t === 'undo') {
		if (!u.moved || u.acted || !u.origin) return done(false, 'nothing to undo');
		{ const o = unitAt(S, u.origin.x, u.origin.y); if (o && o !== u) return done(false, 'its starting tile is taken'); }   // (e.g. another was deployed on the base)
		u.x = u.origin.x; u.y = u.origin.y; u.facing = u.origin.facing; u.moved = false;
		if (u.origin.sp != null && u.sp > u.origin.sp) u.sp = u.origin.sp;   // (the SP the walk gave back goes with it)
		u.origin = null;
		ev(S, { t: 'undo', uid: u.uid });
		return done(true);
	}
	if (a.t === 'throw') {
		const why = throwUnit(S, u, a, data);
		return why ? done(false, why) : done(true);
	}
	// a queued attack taken back before Execute: its PP and SP come back, and the unit can act (or move, if it hasn't) again
	if (a.t === 'unqueue') {
		const i = S.queue.findIndex((q) => q.uid === u.uid);
		if (i < 0) return done(false, 'nothing queued');
		const q = S.queue[i];
		S.queue.splice(i, 1);
		u.pp[q.move] = (u.pp[q.move] || 0) + 1;
		u.sp = Math.min(u.maxSP, u.sp + (q.sp ?? ((moveOf(u, q.move, data) || {}).spCost || 0)));
		u.acted = false;
		ev(S, { t: 'unqueue', uid: u.uid, move: q.move });
		return done(true);
	}
	if (a.t === 'wait') { if (u.acted) return done(false, 'already acted'); u.acted = true; ev(S, { t: 'wait', uid: u.uid }); return done(true); }
	if (a.t === 'attack') {
		if (u.acted) return done(false, 'already acted');
		const why = queueAttack(S, u, a, data);
		return why ? done(false, why) : done(true);
	}
	return done(false, 'unknown action');
}

function queueAttack(S, u, a, data) {
	if (!u.fig.equipped.includes(a.move)) return 'not equipped';
	const m = moveOf(u, a.move, data);
	if (!m) return 'no such move';
	if ((u.pp[a.move] || 0) < 1) return 'no PP left';
	{ const hb = heldBlock(u, a.move, data); if (hb) return hb; }
	const spCost = m.spCost + Ab.pressureExtra(S, u, data);
	if (u.sp < spCost) return 'not enough SP';
	if (m.category === 'Status' && Geo.has(S, u.x, u.y, 'silence')) return 'silenced (Geo)';
	if (!aimTiles(S, u, m).some(([x, y]) => x === a.x && y === a.y)) return 'out of reach';
	u.pp[a.move]--; u.sp -= spCost; u.acted = true;
	if (u.pp[a.move] === 0 && u.held && u.held.ppRestore && !u.heldUsed) { u.pp[a.move] += u.held.ppRestore; u.heldUsed = true; heldEv(S, u, 'pp'); }   // HELD: Leppa Berry
	S.queue.push({ uid: u.uid, move: a.move, x: a.x, y: a.y, sp: spCost });
	ev(S, { t: 'queue', uid: u.uid, move: a.move, x: a.x, y: a.y });
	return null;
}

// ---------- Execute: the queue resolves in order
export function execute(S, data) {
	const q = S.queue; S.queue = [];
	S.combo = 0;
	ev(S, { t: 'execute', n: q.length });
	for (const it of q) {
		const u = unit(S, it.uid);
		if (!u || u.hp <= 0 || S.over) continue;
		resolve(S, u, it, data);
		checkOver(S);
	}
	S.combo = 0;
}

/**
 * The battles' geometry, as resolve() asks for it. Another mode with the battle's rules passes its own (Mystery Maze:
 * 8 directions and walls, mm/combat.js):
 *   face(u, x, y) -> the facing a user takes to aim there      vec(u, x, y) -> [dx, dy], the way a dash runs
 *   open(S, x, y) -> is there ground        step(S, u, x0, y0, x1, y1) -> can it go from one tile to the next
 *   around(S, u, x, y) -> the tiles beside one (where a leap lands)      tiles(S, m, u, x, y) -> what the shape covers
 */
const GRID = {
	face: (u, x, y) => dirToward(u.x, u.y, x, y),
	vec: (u, x, y) => DIRS[dirToward(u.x, u.y, x, y)],
	open: (S, x, y) => isTile(S.map, x, y),
	step: (S, u, x0, y0, x1, y1) => canStep(S.map, x0, y0, x1, y1, u.jump),
	around: (S, u, x, y) => Object.values(DIRS).map(([dx, dy]) => [x + dx, y + dy]),
	tiles: (S, m, u, x, y) => shapeTiles(S.map, m, u.x, u.y, x, y),
};
/**
 * A move with no PP, SP or data entry of its own (Mystery Maze's plain Attack): a move object carrying its own numbers
 * as `mv`, resolved like any other. { id, name, type, category, power, acc, s, n, r, t, h, mv: { power, acc, ... } }
 */
const moveFor = (u, it, data) => it.custom || moveOf(u, it.move, data);
/**
 * One use of a move by the battle's rules with the caller's own geometry and timing (Mystery Maze): the user's status
 * first, then its dash / leap / swap, weather, the shape's victims, damage and effects. PP and SP are the caller's to
 * charge. a: { move, x, y } or { custom: a move object, x, y }. -> the events it added to S.log
 */
export function useMoveAt(S, u, a, data, G) {
	const n0 = S.log.length;
	S.combo = 0;
	resolve(S, u, { move: a.custom ? a.custom.id : a.move, x: a.x, y: a.y, custom: a.custom }, data, G);
	return S.log.slice(n0);
}
function resolve(S, u, it0, data, G = GRID) {
	let it = it0;
	const m = moveFor(u, it, data), fx = MOVE_FX[it.move] || {}, sm = STAT_MOVES[it.move];
	const rng = rngOf(S);
	// the user's status first (Pokémon's rules): asleep, frozen, fully paralysed, hurting itself in confusion
	if (u.status === 'slp') { if (--u.sleepTurns > 0) { ev(S, { t: 'asleep', uid: u.uid }); return; } u.status = null; ev(S, { t: 'woke', uid: u.uid }); }
	if (u.status === 'frz') { if (rng() >= FRZ_THAW && m.type !== 'Fire') { ev(S, { t: 'frozen', uid: u.uid }); return; } u.status = null; ev(S, { t: 'thawed', uid: u.uid }); }
	if (u.status === 'par' && rng() < PAR_FAIL) { ev(S, { t: 'paralysed', uid: u.uid }); return; }
	if (u.confused > 0) {
		u.confused--;
		if (rng() < CONFUSE_SELF) { const self = Math.max(1, Math.floor(baseDamage(u.level, 40, u.stats.atk, u.stats.def) * (0.85 + rng() * 0.15))); ev(S, { t: 'confused-hit', uid: u.uid }); hurt(S, u, self, 'confusion', data); return; }
	}
	if (fx.selfKO && Ab.dampNear(S, u, data)) { ev(S, { t: 'blocked', uid: u.uid, by: 'damp' }); return; }
	// Lightning Rod / Storm Drain pull a matching single-target move aimed near them
	const puller = Ab.pullTarget(S, u, m, it.x, it.y, data);
	if (puller) { ev(S, { t: 'pulled', uid: puller.uid, ab: puller.ability, move: it.move }); it = { ...it, x: puller.x, y: puller.y }; }
	u.facing = it.x === u.x && it.y === u.y ? u.facing : G.face(u, it.x, it.y);
	ev(S, { t: 'use', uid: u.uid, move: it.move, x: it.x, y: it.y });
	if (u.held && u.held.choice && !u.choiceLock) u.choiceLock = it.move;   // HELD: a Choice item locks it into this move
	// the user's own movement moves (dash / leap / swap) first
	if (m.s === 'dash') {
		const d = G.vec(u, it.x, it.y);
		let tx = u.x, ty = u.y, hit = null;
		for (let i = 1; i <= m.n; i++) {
			const nx = u.x + d[0] * i, ny = u.y + d[1] * i;
			if (!G.open(S, nx, ny)) break;
			const o = unitAt(S, nx, ny);
			if (o) { hit = o; break; }
			if (Geo.symbolAt(S, nx, ny)) break;   // a Geo Symbol stops the dash
			if (!G.step(S, u, tx, ty, nx, ny)) break;
			tx = nx; ty = ny;
		}
		if (tx !== u.x || ty !== u.y) { u.x = tx; u.y = ty; ev(S, { t: 'dash', uid: u.uid, x: tx, y: ty }); }
		if (!hit) { ev(S, { t: 'miss', uid: u.uid, why: 'nothing in the way' }); return; }
		strike(S, u, m, fx, sm, [hit], data, rng);
		return;
	}
	if (m.s === 'leap') {
		const spot = G.around(S, u, it.x, it.y).find(([x, y]) => G.open(S, x, y) && !Geo.symbolAt(S, x, y) && (!unitAt(S, x, y) || unitAt(S, x, y) === u));
		if (!spot) { ev(S, { t: 'miss', uid: u.uid, why: 'nowhere to land' }); return; }
		u.x = spot[0]; u.y = spot[1]; u.facing = G.face(u, it.x, it.y);
		ev(S, { t: 'leap', uid: u.uid, x: u.x, y: u.y });
	}
	if (m.s === 'swap') {
		const o = unitAt(S, it.x, it.y);
		if (!o) { ev(S, { t: 'miss', uid: u.uid, why: 'no one to swap with' }); return; }
		[u.x, u.y, o.x, o.y] = [o.x, o.y, u.x, u.y];
		ev(S, { t: 'swap', uid: u.uid, with: o.uid });
		return;
	}
	// the field moves
	if (fx.weather) { S.field.weather = { kind: fx.weather, turns: 5 }; ev(S, { t: 'weather', kind: fx.weather }); return; }
	if (fx.terrain) {
		// terrain moves paint Geo colours (owner): permanent, and they chain like any colour
		const tiles = G.tiles(S, m, u, it.x, it.y).filter(([x, y]) => !Geo.symbolAt(S, x, y));
		Geo.paint(S, tiles, fx.terrain);
		ev(S, { t: 'terrain', kind: fx.terrain, color: Geo.TERRAIN_COLOR[fx.terrain], tiles });
		return;
	}
	const tiles = G.tiles(S, m, u, it.x, it.y);
	const victims = victimsOf(S, u, m, tiles);
	const syms = m.category !== 'Status' ? tiles.map(([x, y]) => Geo.symbolAt(S, x, y)).filter(Boolean) : [];
	if (!victims.length && !syms.length) { ev(S, { t: 'miss', uid: u.uid, why: 'no one there' }); return; }
	if (victims.length) strike(S, u, m, fx, sm, victims, data, rng);
	// a damaging move breaks the Geo Symbols it covers: the chain
	for (const g of syms) if (S.symbols.includes(g)) Geo.breakSymbol(S, g, geoHooks(S, data, u.side));
}
/** Who a move's tiles hit: its own side only for ally / aura moves, foes only unless friendly fire (no RNG: the forecast reads it too). */
function victimsOf(S, u, m, tiles) {
	let victims = tiles.map(([x, y]) => unitAt(S, x, y)).filter(Boolean);
	if (m.s === 'self') victims = [u];
	else if (m.t === 'ally' || (m.s === 'aura' && m.t !== 'foe')) victims = victims.filter((v) => v.side === u.side);
	else if (!m.ff && m.t !== 'any' && m.s !== 'aura' && !Geo.has(S, u.x, u.y, 'allyDamage')) victims = victims.filter((v) => v.side !== u.side);
	if (m.s === 'burst' || m.s === 'aura') victims = m.s === 'burst' ? victims.filter((v) => v !== u) : victims;
	return victims;
}
const abHooks = (S, data) => ({ ev: (e) => ev(S, e), boost: (v, ch) => boost(S, v, { stats: ch }), setWeather: (k) => { S.field.weather = { kind: k, turns: 5 }; }, paint: (tiles, kind) => Geo.paint(S, tiles.filter(([x, y]) => isTile(S.map, x, y) && !Geo.symbolAt(S, x, y)), kind) });
const geoHooks = (S, data, by) => ({ unitAt: (x, y) => unitAt(S, x, y), hurt: (v, n, why) => hurt(S, v, n, why, data), ev: (e) => ev(S, e), foes: () => S.units.filter((x) => (S.pvp ? x.side !== by : x.side === 'e') && x.hp > 0 && x.x != null) });

/** Apply a move to its victims: damage (with Pokémon's rules + the grid's height / facing / combo), then effects. */
function strike(S, u, m, fx, sm, victims, data, rng) {
	const mv = m.mv || data.moves[m.id];
	let xp = 0, statusTargets = 0;
	if (m.category === 'Status') {
		for (const v of victims) if (statusEffect(S, u, v, m, fx, sm, rng)) statusTargets++;
		if (fx.protect) { u.guard = true; ev(S, { t: 'guard', uid: u.uid }); statusTargets = Math.max(statusTargets, 1); }
		addXp(S, u, m.id, moveXpFromUse({ statusTargets }));
		return;
	}
	const spread = victims.length > 1;
	for (const v of victims) {
		if (v.hp <= 0) continue;
		const dealt = damageOne(S, u, v, m, mv, fx, spread, data, rng);
		if (dealt == null) continue;
		xp += dealt;
		if (dealt > 0) secondary(S, u, v, fx, rng, dealt, m.type);
		if (dealt != null && v.hp > 0) Ab.onContact(S, u, v, m.h === 'melee' && m.category === 'Physical', rng, { setStatus: (t, st) => setStatus(S, v, t, st), hurt: (t, n, why) => hurt(S, t, n, why, data), ev: (e) => ev(S, e) });
		if (dealt != null && v.held && v.held.helmet && m.h === 'melee' && m.category === 'Physical' && u.hp > 0) { heldEv(S, v, 'helmet'); hurt(S, u, Math.max(1, Math.floor(u.maxHP / 6)), 'rockyhelmet', data); }   // HELD: Rocky Helmet
		if (v.hp <= 0) ko(S, u, v, data);
	}
	// TEAM ATTACK (Disgaea): a single-target melee hit draws in the attacker's adjacent allies, each by chance
	if (victims.length === 1 && m.s === 'one' && m.h === 'melee' && victims[0].hp > 0) teamAttack(S, u, victims[0], data, rng);
	if (xp > 0 && u.hp > 0 && u.held) {   // HELD: Shell Bell heals a share of what it dealt; Life Orb costs a tenth of its HP
		if (u.held.shellBell && u.hp < u.maxHP) { heldEv(S, u, 'heal'); heal(S, u, Math.max(1, Math.floor(xp / 8))); }
		if (u.held.lifeOrb) hurt(S, u, Math.max(1, Math.floor(u.maxHP / 10)), 'lifeorb', data);
	}
	if (sm && sm.foe !== true && (sm.stat || sm.stats)) boost(S, u, sm);   // damaging moves with a self boost
	addXp(S, u, m.id, moveXpFromUse({ damage: xp }));
}

/** Who would join a team attack on v, and how likely: allies next to the ATTACKER (Disgaea's rule: they join wherever v is). -> [{ uid, chance, move }] */
export function teamChance(S, u, v, data) {
	const out = [];
	for (const al of S.units) {
		if (al === u || al.side !== u.side || al.hp <= 0 || al.x == null || manhattan(al.x, al.y, u.x, u.y) !== 1) continue;
		const mid = teamMove(S, al, v, data);
		if (mid) out.push({ uid: al.uid, chance: TEAM_CHANCE, move: mid });
		if (out.length >= TEAM_MAX) break;
	}
	return out;
}
/** A joiner's strike: its strongest equipped single-target damaging move (it joins the attack, so range doesn't apply). */
function teamMove(S, al, v, data) {
	let best = null;
	for (const mid of al.fig.equipped) {
		const m = moveOf(al, mid, data);
		if (!m || m.category === 'Status' || !m.power || m.s !== 'one') continue;
		if (!best || m.power > best.power) best = m;
	}
	return best && best.id;
}
function teamAttack(S, u, v, data, rng) {
	for (const j of teamChance(S, u, v, data)) {
		if (v.hp <= 0) break;
		if (rng() >= j.chance) continue;
		const al = unit(S, j.uid), m = moveOf(al, j.move, data);
		ev(S, { t: 'team', uid: al.uid, with: u.uid, target: v.uid, move: j.move });
		if (al.side === 'p') Geo.addBonus(S, Geo.BONUS_TEAM, 'team');
		al.facing = dirToward(al.x, al.y, v.x, v.y);
		const dealt = damageOne(S, al, v, m, data.moves[j.move], MOVE_FX[j.move] || {}, false, data, rng, { powerScale: TEAM_POWER });
		if (dealt) addXp(S, al, j.move, moveXpFromUse({ damage: dealt }));
		if (v.hp <= 0) ko(S, al, v, data);
	}
}

/** Catch odds for a foe thrown onto the base tile: Pokémon's formula with a plain ball, (3M - 2H) * rate / 3M / 255. */
export function captureOdds(v, data) {
	const rate = (data.extra && data.extra[v.species] && data.extra[v.species].catch) || 45;
	return Math.max(0, Math.min(1, ((3 * v.maxHP - 2 * v.hp) * rate) / (3 * v.maxHP) / 255));
}

/**
 * LIFT & THROW (Disgaea): a figurine that can lift picks up the unit on an adjacent tile (a.from) and throws it to a tile
 * within its throw range (a.x, a.y), over any height. It is the lifter's action. A thrown ally can still act; a foe
 * thrown onto the player's base tile is a CAPTURE attempt (captureOdds). -> null or why not
 */
function throwUnit(S, u, a, data) {
	if (u.acted) return 'already acted';
	if (!u.lift) return 'can\'t lift';
	const from = a.from || {};
	if (Geo.has(S, u.x, u.y, 'noLift')) return 'can\'t lift here (Geo)';
	const gsym = !unitAt(S, from.x, from.y) && Geo.symbolAt(S, from.x, from.y);
	if (gsym) {
		// a Geo Symbol is an object: lift and throw it like a unit (it moves its effect to another colour)
		if (manhattan(u.x, u.y, from.x, from.y) !== 1) return 'nothing to lift there';
		if (manhattan(u.x, u.y, a.x, a.y) > u.throw || !isTile(S.map, a.x, a.y) || unitAt(S, a.x, a.y) || Geo.symbolAt(S, a.x, a.y)) return 'can\'t throw it there';
		u.acted = true; gsym.x = a.x; gsym.y = a.y;
		ev(S, { t: 'throw-geo', uid: u.uid, id: gsym.id, x: a.x, y: a.y });
		return null;
	}
	const v = unitAt(S, from.x, from.y);
	if (v && Geo.has(S, v.x, v.y, 'noLift')) return 'can\'t lift it here (Geo)';
	if (!v || v === u || manhattan(u.x, u.y, v.x, v.y) !== 1) return 'nothing to lift there';
	if (manhattan(u.x, u.y, a.x, a.y) > u.throw || !isTile(S.map, a.x, a.y)) return 'out of throw range';
	const base = baseOf(S, u.side), ontoBase = a.x === base.x && a.y === base.y;
	if (unitAt(S, a.x, a.y) || Geo.symbolAt(S, a.x, a.y)) return 'that tile is taken';
	u.acted = true;
	u.facing = dirToward(u.x, u.y, a.x, a.y);
	if (v.side !== u.side && u.side === 'p' && !S.pvp && ontoBase) {
		const p = captureOdds(v, data), rng = rngOf(S), roll = rng();
		ev(S, { t: 'capture', uid: u.uid, target: v.uid, odds: p, ok: roll < p });
		if (roll < p) {
			v.hp = 0; v.x = null; v.y = null; v.captured = true;
			(S.captured = S.captured || []).push({ uid: v.uid, fig: v.fig });
			checkOver(S);
			return null;
		}
		// broke free: it lands next to the base, angrier
		const spot = Object.values(DIRS).map(([dx, dy]) => [base.x + dx, base.y + dy]).find(([x, y]) => isTile(S.map, x, y) && !unitAt(S, x, y) && !Geo.symbolAt(S, x, y));
		if (spot) { v.x = spot[0]; v.y = spot[1]; } else { v.x = a.x; v.y = a.y; }
		v.boosts.atk = Math.min(6, v.boosts.atk + CAPTURE_FAIL_BOOST);
		ev(S, { t: 'broke-free', uid: v.uid, x: v.x, y: v.y });
		return null;
	}
	v.x = a.x; v.y = a.y;
	ev(S, { t: 'throw', uid: u.uid, target: v.uid, x: a.x, y: a.y });
	return null;
}

function damageOne(S, u, v, m, mv, fx, spread, data, rng, opt = {}) {
	if (v.guard && v !== u) { ev(S, { t: 'blocked', uid: v.uid, by: 'protect' }); return null; }
	const phys = m.category === 'Physical';
	// accuracy: Pokémon's + the grid's Speed evasion and facing
	const a = accuracyOf({ moveId: m.id, acc: m.acc, category: m.category, type: m.type, userTypes: u.types, accStage: u.boosts.acc, evaStage: v.boosts.eva,
		gravity: 0, userAb: u.ability, targetAb: v.ability, weather: S.field.weather && S.field.weather.kind, targetConfused: false, ...heldAcc(u, v) });
	const face = facingOf(u, v);
	const hitChance = Geo.has(S, u.x, u.y, 'noMiss') ? 999 : a.hitChance * speedAccuracyMult(u.stats.spe, v.stats.spe) * FACING_ACC[face] * Ab.accuracyAura(S, u, data) * T.hideMult(S, v);
	if (!a.neverMiss && rng() * 100 > hitChance) { ev(S, { t: 'miss', uid: u.uid, target: v.uid }); return null; }
	const imm = moveImmunity({ moveId: m.id, type: m.type, targetAb: v.ability, userAb: u.ability, targetTypes: v.types, fx, primal: null, weatherOn: !!S.field.weather, foresight: false });
	if (imm.block) { ev(S, { t: 'immune', uid: v.uid, why: imm.block }); return null; }
	const gImm = Geo.effectsAt(S, v.x, v.y).find((e) => e.k === 'immune' && e.type === m.type);
	if (gImm) { ev(S, { t: 'immune', uid: v.uid, why: 'geo' }); return null; }
	if (Geo.has(S, v.x, v.y, 'invincible')) { ev(S, { t: 'immune', uid: v.uid, why: 'invincible' }); return null; }
	const eff = imm.eff;
	let Pw = opt.powerScale ? Math.max(1, Math.round(m.power * opt.powerScale)) : m.power;
	if (fx.fixed) {
		const fixed = fx.fixed === 'level' ? u.level : fx.fixed === 'half' ? Math.max(1, Math.floor(v.hp / 2)) : typeof fx.fixed === 'number' ? fx.fixed : 0;
		if (!fixed) { ev(S, { t: 'fail', uid: u.uid }); return null; }
		return applyDamage(S, u, v, fixed, { eff: 1, crit: false });
	}
	if (fx.ohko) return applyDamage(S, u, v, v.level > u.level ? 0 : v.hp, { ohko: true });
	if (!Pw) { ev(S, { t: 'fail', uid: u.uid, why: 'no power' }); return null; }
	let A = Math.floor((phys ? u.stats.atk : u.stats.spa) * stageMult(phys ? u.boosts.atk : u.boosts.spa));
	let D = Math.floor((phys ? v.stats.def : v.stats.spd) * stageMult(phys ? v.boosts.def : v.boosts.spd));
	for (const e of Geo.effectsAt(S, u.x, u.y)) if (e.k === 'stat' && e.stat === (phys ? 'atk' : 'spa')) A = Math.floor(A * (e.mult || Geo.GEO_STAT));
	for (const e of Geo.effectsAt(S, v.x, v.y)) if (e.k === 'stat' && e.stat === (phys ? 'def' : 'spd')) D = Math.floor(D * (e.mult || Geo.GEO_STAT));
	if (phys && u.status === 'brn' && u.ability !== 'guts') A = Math.floor(A / 2);
	const dm = damageMods({ moveId: m.id, type: m.type, category: m.category, priority: m.priority, Pw, phys, fx, eff, spread, uItem: u.held,
		user: { ab: u.ability, types: u.types, curHP: u.hp, maxHP: u.maxHP, status: u.status }, target: { ab: v.ability, curHP: v.hp, maxHP: v.maxHP },
		weatherRaw: geoWeather(S, u), weather: geoWeather(S, u), terrain: Geo.terrainAt(S, u.x, u.y) });
	const typeBoost = (Geo.effectsAt(S, u.x, u.y).some((e) => e.k === 'typeBoost' && e.type === m.type) ? Geo.GEO_TYPE : 1) * T.terrainBoost(S, u, m);
	// the grid's own: height and the combo
	const dh = (heightAt(S.map, u.x, u.y) || 0) - (heightAt(S.map, v.x, v.y) || 0);
	const heightMult = 1 + Math.max(-HEIGHT_CAP, Math.min(HEIGHT_CAP, dh * HEIGHT_STEP));
	const comboMult = Math.min(COMBO_CAP, 1 + COMBO_STEP * S.combo);
	const envMult = dm.mult * heightMult * comboMult * typeBoost * Ab.allyGuard(S, v, data);
	const crit = rng() < critChanceOf({ userAb: u.ability, targetStatus: v.status, moveId: m.id, critBoostItem: !!(u.held && u.held.critBoost) });
	const hits = fx.hits ? fx.hits[0] + Math.floor(rng() * (fx.hits[1] - fx.hits[0] + 1)) : 1;
	let total = 0;
	for (let h = 0; h < hits; h++) total += hitDamage(baseDamage(u.level, Pw, A, D), { crit, critMult: critMultOf(u.ability), stab: u.types.includes(m.type) ? 1.5 : 1, eff, screened: 1, envMult, roll: 0.85 + rng() * 0.15 });
	const dealt = applyDamage(S, u, v, total, { eff, crit, face, combo: S.combo, height: dh, hits });
	if (eff > 1 && v.hp > 0 && v.held && v.held.weakPolicy && !v.heldUsed) { v.heldUsed = true; heldEv(S, v, 'boost'); boost(S, v, { stats: { atk: 2, spa: 2 } }); }   // HELD: Weakness Policy
	return dealt;
}
/** HELD: Wide Lens / BrightPowder, as the shared accuracy rule reads them. */
const heldAcc = (u, v) => ({ userAccBoost: (u.held && u.held.accBoost) || 0, targetEvade: (v.held && v.held.evade) || 0 });

const geoWeather = (S, u) => { const w = Geo.has(S, u.x, u.y, 'weather'); return w ? w.kind : S.field.weather && S.field.weather.kind; };

// ---------- the FORECAST (Disgaea's): what an attack aimed now would do, read without rolling anything
/**
 * -> null (no such move) or { move, targets: [{ uid, side, hp, hit, min, max, ko, eff, face, immune?, status?, team? }], note? }
 *   hit: the chance to land, 0-100 (the same accuracy as a real hit: the move's, Speed's evasion, facing, Geo, abilities)
 *   min / max: the damage roll 85-100% and a multi-hit move's fewest / most hits, no critical hit, never above its HP;
 *     the combo counts every attack already queued as one hit (the bonus they give if they land first)
 *   ko: 'yes' (even the low roll knocks it out), 'maybe' (the high one does), 'no'
 *   team: single-target melee: the allies next to the attacker who may join (each by chance)
 * Dash / leap / swap move the user first, and weather / terrain moves hit no one: those get a note instead of targets.
 * The user's own status (asleep, frozen, paralysed, confused) is a note: it may not act at all.
 */
export function forecast(S, u, moveId, x, y, data) {
	const m = moveOf(u, moveId, data);
	if (!m || u.x == null) return null;
	const fx = MOVE_FX[moveId] || {}, mv = data.moves[moveId];
	const out = { move: moveId, targets: [] };
	const why = u.status === 'slp' ? 'asleep: it may not act' : u.status === 'frz' ? 'frozen: it may not act' : u.status === 'par' ? 'paralysed: it may not act' : u.confused > 0 ? 'confused: it may hurt itself' : '';
	if (why) out.note = why;
	if (m.s === 'dash' || m.s === 'leap' || m.s === 'swap') { out.note = (out.note ? out.note + '; ' : '') + (m.s === 'swap' ? 'swaps places' : m.s === 'leap' ? 'leaps, then strikes' : 'dashes until it hits someone'); return out; }
	if (fx.weather || fx.terrain) { out.note = (out.note ? out.note + '; ' : '') + (fx.weather ? 'changes the weather' : 'paints the ground'); return out; }
	const me = { ...u, facing: x === u.x && y === u.y ? u.facing : dirToward(u.x, u.y, x, y) };
	const victims = victimsOf(S, me, m, shapeTiles(S.map, m, u.x, u.y, x, y));
	const combo = S.queue.filter((q) => q.uid !== u.uid).length;
	for (const v of victims) out.targets.push(previewOne(S, me, v, m, mv, fx, victims.length > 1, combo, data));
	if (victims.length === 1 && m.s === 'one' && m.h === 'melee' && m.category !== 'Status') {
		const t = teamChance(S, u, victims[0], data);
		if (t.length) out.targets[0].team = t.map((j) => ({ uid: j.uid, chance: j.chance }));
	}
	return out;
}
function previewOne(S, u, v, m, mv, fx, spread, combo, data) {
	const o = { uid: v.uid, side: v.side, hp: v.hp, hit: 100, min: 0, max: 0, ko: 'no', eff: 1, face: facingOf(u, v) };
	if (T.hideMult(S, v) < 1) o.hidden = true;   // (living terrain: in tall grass)
	if (m.category !== 'Status' && T.terrainBoost(S, u, m) > 1) o.ground = T.groundAt(S, u.x, u.y);
	if (v.guard && v !== u) return { ...o, hit: 0, immune: 'protect' };
	const phys = m.category === 'Physical';
	const a = accuracyOf({ moveId: m.id, acc: m.acc, category: m.category, type: m.type, userTypes: u.types, accStage: u.boosts.acc, evaStage: v.boosts.eva,
		gravity: 0, userAb: u.ability, targetAb: v.ability, weather: S.field.weather && S.field.weather.kind, targetConfused: false, ...heldAcc(u, v) });
	o.hit = a.neverMiss || Geo.has(S, u.x, u.y, 'noMiss') ? 100 : Math.max(0, Math.min(100, Math.round(a.hitChance * speedAccuracyMult(u.stats.spe, v.stats.spe) * FACING_ACC[o.face] * Ab.accuracyAura(S, u, data) * T.hideMult(S, v))));
	if (m.category === 'Status') return { ...o, status: true };
	const imm = moveImmunity({ moveId: m.id, type: m.type, targetAb: v.ability, userAb: u.ability, targetTypes: v.types, fx, primal: null, weatherOn: !!S.field.weather, foresight: false });
	if (imm.block) return { ...o, hit: 0, immune: imm.block };
	if (Geo.effectsAt(S, v.x, v.y).some((e) => e.k === 'immune' && e.type === m.type)) return { ...o, hit: 0, immune: 'geo' };
	if (Geo.has(S, v.x, v.y, 'invincible')) return { ...o, hit: 0, immune: 'invincible' };
	o.eff = imm.eff;
	const sash = v.held && v.held.sash && !v.heldUsed && v.hp === v.maxHP && v.hp > 1;   // (HELD: Focus Sash leaves it on 1 HP)
	const cap = sash ? v.hp - 1 : v.hp;
	if (sash) o.sash = true;
	const done = (lo, hi) => { o.min = Math.min(cap, Math.max(0, lo)); o.max = Math.min(cap, Math.max(0, hi)); o.ko = o.min >= v.hp ? 'yes' : o.max >= v.hp ? 'maybe' : 'no'; return o; };
	if (fx.fixed) { const f = fx.fixed === 'level' ? u.level : fx.fixed === 'half' ? Math.max(1, Math.floor(v.hp / 2)) : typeof fx.fixed === 'number' ? fx.fixed : 0; return done(f, f); }
	if (fx.ohko) { const k = v.level > u.level ? 0 : v.hp; return done(k, k); }
	if (!m.power) return done(0, 0);
	let A = Math.floor((phys ? u.stats.atk : u.stats.spa) * stageMult(phys ? u.boosts.atk : u.boosts.spa));
	let D = Math.floor((phys ? v.stats.def : v.stats.spd) * stageMult(phys ? v.boosts.def : v.boosts.spd));
	for (const e of Geo.effectsAt(S, u.x, u.y)) if (e.k === 'stat' && e.stat === (phys ? 'atk' : 'spa')) A = Math.floor(A * (e.mult || Geo.GEO_STAT));
	for (const e of Geo.effectsAt(S, v.x, v.y)) if (e.k === 'stat' && e.stat === (phys ? 'def' : 'spd')) D = Math.floor(D * (e.mult || Geo.GEO_STAT));
	if (phys && u.status === 'brn' && u.ability !== 'guts') A = Math.floor(A / 2);
	const dm = damageMods({ moveId: m.id, type: m.type, category: m.category, priority: m.priority, Pw: m.power, phys, fx, eff: o.eff, spread, uItem: u.held,
		user: { ab: u.ability, types: u.types, curHP: u.hp, maxHP: u.maxHP, status: u.status }, target: { ab: v.ability, curHP: v.hp, maxHP: v.maxHP },
		weatherRaw: geoWeather(S, u), weather: geoWeather(S, u), terrain: Geo.terrainAt(S, u.x, u.y) });
	const typeBoost = (Geo.effectsAt(S, u.x, u.y).some((e) => e.k === 'typeBoost' && e.type === m.type) ? Geo.GEO_TYPE : 1) * T.terrainBoost(S, u, m);
	const dh = (heightAt(S.map, u.x, u.y) || 0) - (heightAt(S.map, v.x, v.y) || 0);
	const envMult = dm.mult * (1 + Math.max(-HEIGHT_CAP, Math.min(HEIGHT_CAP, dh * HEIGHT_STEP))) * Math.min(COMBO_CAP, 1 + COMBO_STEP * combo) * typeBoost * Ab.allyGuard(S, v, data);
	const one = (roll) => hitDamage(baseDamage(u.level, m.power, A, D), { crit: false, critMult: critMultOf(u.ability), stab: u.types.includes(m.type) ? 1.5 : 1, eff: o.eff, screened: 1, envMult, roll });
	const [lo, hi] = fx.hits ? fx.hits : [1, 1];
	return done(lo * one(0.85), hi * one(1));
}

/** Where a foe could strike this enemy phase (Disgaea's enemy range): every tile it can reach, and every tile a move it can
 *  pay for could cover from one of them. -> { move: [[x, y]], attack: [[x, y]], passive } ('hold' foes don't move) */
export function threat(S, e, data) {
	if (!e || e.hp <= 0 || e.x == null) return { move: [], attack: [], passive: false };
	const spots = e.ai === 'hold' ? [[e.x, e.y]] : [...moveTiles(S, e).values()].map((t) => [t.x, t.y]);
	const hit = new Set();
	const moves = e.fig.equipped.map((mid) => moveOf(e, mid, data)).filter((m) => m && (e.pp[m.id] || 0) >= 1 && e.sp >= m.spCost && m.category !== 'Status' && m.s !== 'self' && !heldBlock(e, m.id, data));
	// (big maps: a shape aimed at a tile, not by its user's place, covers the same tiles from every spot: once per aim tile)
	const seen = moves.map(() => new Set());
	for (const [sx, sy] of spots) {
		const at = { ...e, x: sx, y: sy };
		moves.forEach((m, i) => {
			const fixed = AIM_FIXED.has(m.s);
			for (const [ax, ay] of aimTiles(S, at, m)) {
				if (fixed) { const k = ay * S.map.w + ax; if (seen[i].has(k)) continue; seen[i].add(k); }
				for (const [x, y] of shapeTiles(S.map, m, sx, sy, ax, ay)) if (isTile(S.map, x, y)) hit.add(key(x, y));
			}
		});
	}
	const unkey = (k) => k.split(',').map(Number);
	return { move: spots, attack: [...hit].map(unkey), passive: e.ai === 'passive' };
}

/** Shapes whose tiles depend only on the aim tile, not on where the user stands (grid.js shapeTiles). */
export const AIM_FIXED = new Set(['one', 'swap', 'leap', 'cross', 'dia', 'trap', 'paint', 'map']);

function applyDamage(S, u, v, amount, info) {
	let dealt = Math.min(v.hp, Math.max(0, amount));
	if (dealt >= v.hp && v.hp > 1 && v.held) {   // HELD: Focus Sash (once, from full HP) / Focus Band (1 in 10) hang on with 1 HP
		if (v.held.sash && !v.heldUsed && v.hp === v.maxHP) { dealt = v.hp - 1; v.heldUsed = true; heldEv(S, v, 'endure'); }
		else if (v.held.focusBand && rngOf(S)() < 0.1) { dealt = v.hp - 1; heldEv(S, v, 'endure'); }
	}
	v.hp -= dealt;
	if (S.combo > 0 && u.side === 'p') Geo.addBonus(S, Geo.BONUS_COMBO, 'combo');
	S.combo++;
	ev(S, { t: 'hit', uid: u.uid, target: v.uid, dmg: dealt, hp: v.hp, ...info });
	berry(S, v);
	return dealt;
}
/** HELD: a healing berry, once, when its HP falls to half. */
function berry(S, v) {
	const h = v.held;
	if (!h || v.heldUsed || v.hp <= 0 || v.hp > v.maxHP / 2 || !(h.berryHeal || h.berryHealFrac)) return;
	v.heldUsed = true; heldEv(S, v, 'heal');
	heal(S, v, h.berryHeal || Math.floor(v.maxHP * h.berryHealFrac));
}
/** HELD: a curing berry, once, right after it gets the status (or confusion) it cures. */
function cureBerry(S, v) {
	const c = v.held && v.held.cure;
	if (!c || v.heldUsed || v.hp <= 0) return;
	if (v.status && (c === 'any' || c === v.status)) { v.heldUsed = true; heldEv(S, v, 'cure'); ev(S, { t: 'cured', uid: v.uid, st: v.status }); v.status = null; v.sleepTurns = 0; }
	else if (v.confused > 0 && (c === 'any' || c === 'confusion')) { v.heldUsed = true; heldEv(S, v, 'cure'); ev(S, { t: 'cured', uid: v.uid, st: 'confusion' }); v.confused = 0; }
}

function secondary(S, u, v, fx, rng, dealt, type) {
	// drain and recoil are shares of the damage dealt (Pokémon's rule)
	if (v.status === 'frz' && fx.thawsTarget !== false && type === 'Fire') { v.status = null; ev(S, { t: 'thawed', uid: v.uid }); }
	if (fx.drain) heal(S, u, Math.max(1, Math.floor(dealt * fx.drain)));
	if (fx.recoil && u.hp > 0) hurt(S, u, Math.max(1, Math.floor(dealt * fx.recoil)), 'recoil');
	if (v.hp <= 0) return;
	const sec = fx.sec;
	if (sec && rng() * 100 < (sec.ch || 0)) {
		if (sec.status) setStatus(S, u, v, sec.status);
		if (sec.confuse && v.hp > 0 && !v.confused && v.ability !== 'owntempo' && v.ability !== 'strongmind') { v.confused = 2 + Math.floor(rng() * 4); ev(S, { t: 'confused', uid: v.uid }); cureBerry(S, v); }
		if (sec.flinch) { /* flinch has no turn order to cancel in phases: no effect on the grid (the owner's turn system) */ }
	}
}

function statusEffect(S, u, v, m, fx, sm, rng) {
	let did = false;
	if (fx.status) did = setStatus(S, u, v, fx.status) || did;
	if (fx.confuse && !v.confused && v.ability !== 'owntempo' && v.ability !== 'strongmind') { v.confused = 2 + Math.floor(rng() * 4); ev(S, { t: 'confused', uid: v.uid }); cureBerry(S, v); did = true; }
	{ const h = fx.heal || fx.healTarget; if (h && v.hp < v.maxHP) { heal(S, v, Math.floor(v.maxHP * h)); did = true; } }   // (healTarget: Heal Pulse, Floral Healing heal the one aimed at)
	if (sm) { if (sm.foe ? v.side !== u.side : true) { boost(S, v, sm); did = true; } }
	if (!did && !fx.protect) ev(S, { t: 'noeffect', uid: u.uid, target: v.uid, move: m.id });
	return did;
}

function setStatus(S, u, v, st) {
	const why = statusBlock({ st, has: !!v.status, targetTypes: v.types, sourceAb: u.ability, targetAb: v.ability, guardAbs: [v.ability], weather: S.field.weather && S.field.weather.kind });
	if (why) { ev(S, { t: 'status-blocked', uid: v.uid, st, why }); return false; }
	v.status = st;
	if (st === 'slp') v.sleepTurns = 1 + Math.floor(rngOf(S)() * 3);
	ev(S, { t: 'status', uid: v.uid, st });
	cureBerry(S, v);
	return true;
}

function boost(S, v, sm) {
	const ch = sm.stats || { [sm.stat]: sm.d };
	for (const [k, d] of Object.entries(ch)) v.boosts[k] = Math.max(-6, Math.min(6, (v.boosts[k] || 0) + d));
	ev(S, { t: 'boost', uid: v.uid, changes: ch });
	if (v.held && v.held.whiteHerb && !v.heldUsed && Object.values(v.boosts).some((b) => b < 0)) {   // HELD: White Herb
		v.heldUsed = true; heldEv(S, v, 'reset');
		for (const k of Object.keys(v.boosts)) if (v.boosts[k] < 0) v.boosts[k] = 0;
	}
}

const heal = (S, v, n) => { const h = Math.min(v.maxHP - v.hp, Math.max(0, n)); if (h > 0) { v.hp += h; ev(S, { t: 'heal', uid: v.uid, n: h }); } };
function hurt(S, v, n, why, data) { if (v.hp <= 0) return; const d = Math.min(v.hp, Math.max(1, n)); v.hp -= d; ev(S, { t: 'hurt', uid: v.uid, n: d, why }); if (v.hp <= 0) ko(S, null, v, data); else berry(S, v); }

const DIAGONALS = { ne: [1, -1], se: [1, 1], sw: [-1, 1], nw: [-1, -1] };
function facingOf(u, v) {
	// where the attacker stands relative to the way the target faces: front, side or back
	const f = DIRS[v.facing] || DIAGONALS[v.facing], dx = u.x - v.x, dy = u.y - v.y;
	const dot = dx * f[0] + dy * f[1];
	if (dot > 0) return 'front';
	if (dot < 0 && Math.abs(dot) >= Math.abs(dx * f[1] - dy * f[0])) return 'back';
	return 'side';
}

function ko(S, by, v, data) {
	ev(S, { t: 'ko', uid: v.uid, by: by && by.uid });
	v.hp = 0;
	if (by && by.side === 'p' && v.side === 'e' && data) {
		const base = (data.extra && data.extra[v.species] && data.extra[v.species].exp) || 60;
		S.exp[by.uid] = (S.exp[by.uid] || 0) + Math.floor(base * v.level / 7 * (by.x != null && Geo.has(S, by.x, by.y, 'exp') ? Geo.GEO_EXP : 1) * ((by.held && by.held.expBoost) || 1));   // (HELD: Lucky Egg)
		Geo.addBonus(S, Geo.BONUS_KO, 'ko');
	}
}

function addXp(S, u, moveId, n) {
	if (!n || u.side !== 'p') return;
	const k = u.uid + ':' + moveId;
	S.xp[k] = (S.xp[k] || 0) + n;
}

function checkOver(S) {
	if (S.over) return;
	if (S.pvp) {
		const P = S.pvp;
		for (const sd of P.sides) if (!P.out.includes(sd) && !S.units.some((u) => u.side === sd && u.hp > 0)) { P.out.push(sd); ev(S, { t: 'out', side: sd }); }
		const alive = P.sides.filter((sd) => !P.out.includes(sd));
		// the last side standing wins; with only computer seats left (every player gone), or past the round limit, the side
		// with the most HP left (as a share of its figurines' max HP) wins
		if (alive.length <= 1) return pvpOver(S, alive[0] || null);
		if (alive.every((sd) => P.cpu[sd]) || S.turn > PVP_ROUNDS) return pvpOver(S, hpLead(S, alive));
		return;
	}
	const foes = S.units.filter((x) => x.side === 'e' && x.hp > 0);
	const mine = S.units.filter((x) => x.side === 'p' && x.hp > 0);
	if (!foes.length) { S.over = 'won'; S.phase = 'won'; ev(S, { t: 'over', result: 'won' }); }
	else if (!mine.length) { S.over = 'lost'; S.phase = 'lost'; ev(S, { t: 'over', result: 'lost' }); }
}

const hpShare = (S, sd) => { let hp = 0, max = 0; for (const u of S.units) if (u.side === sd) { hp += Math.max(0, u.hp); max += u.maxHP; } return max ? hp / max : 0; };
const hpLead = (S, sides) => sides.reduce((best, sd) => (best == null || hpShare(S, sd) > hpShare(S, best) ? sd : best), null);
function pvpOver(S, winner) {
	S.pvp.winner = winner; S.over = 'done'; S.phase = 'over';
	ev(S, { t: 'over', result: 'done', winner });
}

// ---------- phases
function endOfPhase(S, side) {
	for (const u of S.units) {
		if (u.side !== side || u.hp <= 0 || u.x == null) continue;
		u.guard = false;
		if (u.status && STATUS_CHIP[u.status]) hurt(S, u, Math.floor(u.maxHP * STATUS_CHIP[u.status]), u.status);
		if (u.hp > 0 && u.held && u.held.endHealFrac && u.hp < u.maxHP) { heldEv(S, u, 'heal'); heal(S, u, Math.max(1, Math.floor(u.maxHP * u.held.endHealFrac))); }   // HELD: Leftovers
		if (u.hp > 0 && u.held && u.held.sludge) {   // HELD: Black Sludge
			if (u.types.includes('Poison')) { if (u.hp < u.maxHP) { heldEv(S, u, 'heal'); heal(S, u, Math.max(1, Math.floor(u.maxHP / 16))); } }
			else { heldEv(S, u, 'hurt'); hurt(S, u, Math.max(1, Math.floor(u.maxHP / 8)), 'blacksludge'); }
		}
		{ const burn = T.lavaBurn(S, u); if (burn && u.hp > 0) hurt(S, u, burn, 'lava'); }   // (living terrain: lava)
		for (const e of Geo.effectsAt(S, u.x, u.y)) {
			if (u.hp <= 0) break;
			if (e.k === 'hurt') hurt(S, u, Math.floor(u.maxHP * Geo.GEO_HURT), 'geo');
			else if (e.k === 'heal') heal(S, u, Math.floor(u.maxHP * Geo.GEO_HEAL));
			else if (e.k === 'status' && !u.status) setStatus(S, u, u, e.st);
		}
	}
	checkOver(S);
}

export function endPlayerPhase(S, data) {
	execute(S, data);
	if (S.over) return;
	if (S.pvp) return pvpPass(S, data);
	endOfPhase(S, 'p');
	if (S.over) return;
	S.phase = 'enemy';
	ev(S, { t: 'phase', phase: 'enemy', turn: S.turn });
	for (const e of S.units.filter((x) => x.side === 'e' && x.hp > 0 && x.x != null)) {
		if (S.over) break;
		e.acted = false; e.moved = false;
		enemyTurn(S, e, data, AI_API);
		execute(S, data);
	}
	if (S.over) return;
	endOfPhase(S, 'e');
	if (S.over) return;
	if (S.field.weather && --S.field.weather.turns <= 0) { ev(S, { t: 'weather-ends', kind: S.field.weather.kind }); S.field.weather = null; }
	S.turn++;
	S.phase = 'player';
	for (const u of S.units) if (u.side === 'p') { u.moved = false; u.acted = false; u.origin = null; u.pivot = 0; }
	ev(S, { t: 'phase', phase: 'player', turn: S.turn });
}

/** PvP: the seat whose phase it is passes; the next seat still in plays (a computer seat at once). A round ends when the
 *  play comes back round to the first seat: weather ticks and the turn counts up. `skipEnd`: the seat just conceded. */
function pvpPass(S, data, skipEnd) {
	const P = S.pvp, n = P.sides.length;
	for (let guard = 0; guard <= n * 2 && !S.over; guard++) {
		if (!(skipEnd && guard === 0)) { endOfPhase(S, curSide(S)); if (S.over) return; }
		let i = P.cur;
		for (let k = 0; k < n; k++) {
			i = (i + 1) % n;
			if (i === 0) {
				wildPhase(S, data); if (S.over) return;
				if (S.field.weather && --S.field.weather.turns <= 0) { ev(S, { t: 'weather-ends', kind: S.field.weather.kind }); S.field.weather = null; }
				S.turn++;
				checkOver(S); if (S.over) return;
			}
			if (!P.out.includes(P.sides[i])) break;
		}
		P.cur = i;
		const sd = P.sides[i];
		for (const u of S.units) if (u.side === sd) { u.moved = false; u.acted = false; u.origin = null; u.pivot = 0; }
		ev(S, { t: 'phase', phase: 'player', side: sd, turn: S.turn });
		if (!P.cpu[sd]) return;
		cpuPhase(S, sd, data);
	}
}
/** PvP's WILD foes (owner, 2026-11-22: "4 players AND foes"): once a round, after the last seat, each wild foe on the map
 *  takes the enemy AI's turn against whichever side it likes best (every side is its foe; the seats' figurines and
 *  computers fight it too). It is no side of the match: it never wins, and the match ends without it. */
function wildPhase(S, data) {
	const wild = S.units.filter((x) => x.side === 'e' && x.hp > 0 && x.x != null);
	if (!wild.length) return;
	ev(S, { t: 'phase', phase: 'wild', turn: S.turn });
	for (const e of wild) {
		if (S.over) return;
		if (e.hp <= 0 || e.x == null) continue;
		e.acted = false; e.moved = false;
		enemyTurn(S, e, data, AI_API);
		execute(S, data);
	}
	if (!S.over) endOfPhase(S, 'e');
}
/** A computer seat's phase: it deploys onto its base (one at a time, each stepping off before the next) and every one of
 *  its figurines on the map takes the enemy AI's turn. Deterministic, so every device plays it the same. */
function cpuPhase(S, sd, data) {
	const done = new Set();
	const turn = (e) => { done.add(e.uid); e.acted = false; e.moved = false; enemyTurn(S, e, data, AI_API); execute(S, data); };
	for (const e of S.units.filter((x) => x.side === sd && x.hp > 0 && x.x != null)) { if (S.over) return; if (e.hp > 0 && e.x != null) turn(e); }
	for (const u of S.units.filter((x) => x.side === sd && x.hp > 0 && x.x == null)) {
		if (S.over) return;
		const b = baseOf(S, sd);
		if (unitAt(S, b.x, b.y) || Geo.symbolAt(S, b.x, b.y) || onMap(S, sd).length >= MAX_DEPLOYED) break;
		u.x = b.x; u.y = b.y;
		ev(S, { t: 'deploy', uid: u.uid, x: b.x, y: b.y });
		Ab.onEnter(S, u, data, abHooks(S, data));
		turn(u);
	}
}

/** The enemy AI queues through this (the same checks as the player's). */
export function enemyAct(S, e, a, data) {
	if (a.t === 'move') {
		const tiles = moveTiles(S, e);
		if (!tiles.has(key(a.x, a.y))) return false;
		const path = pathTo(tiles, a.x, a.y);
		if (path.length > 1) { const [px, py] = path[path.length - 2]; e.facing = dirToward(px, py, a.x, a.y); }
		e.x = a.x; e.y = a.y; e.moved = true;
		const sp = walkSp(S, e, path);
		ev(S, { t: 'move', uid: e.uid, path, ...(sp ? { sp } : {}) });
		return true;
	}
	if (a.t === 'attack') return !queueAttack(S, e, a, data);
	return false;
}

export const AI_API = { moveTiles, moveOf, aimTiles, unitAt, onMap, act: enemyAct, heldBlock, forecast, threat };

// ---------- results and the view
/** What the battle gives the player's figurines: EXP per unit, move XP per unit + move. */
export const results = (S) => ({ over: S.over, winner: S.pvp ? S.pvp.winner : null, exp: { ...S.exp }, moveXp: { ...S.xp }, captured: (S.captured || []).map((c) => c.fig), bonus: Geo.bonusPayout(S), bonusLevel: S.bonus ? S.bonus.level : 0 });

/** A plain snapshot for the page, spectators and replays. */
export function view(S) {
	return { turn: S.turn, phase: S.phase, over: S.over, pvp: S.pvp ? { sides: S.pvp.sides.slice(), cur: S.pvp.cur, out: S.pvp.out.slice(), winner: S.pvp.winner, bases: { ...S.pvp.bases }, cpu: { ...S.pvp.cpu } } : null, map: { w: S.map.w, h: S.map.h, height: S.map.height, base: S.map.base },
		field: S.field, combo: S.combo, geo: S.geo.slice(), symbols: S.symbols.map((g) => ({ ...g })), bonus: S.bonus ? { points: S.bonus.points, level: S.bonus.level, rewards: S.bonus.rewards } : null, queue: S.queue.map((q) => ({ ...q })),
		ground: S.terrain ? S.map.ground : null, units: S.units.map((u) => ({ uid: u.uid, side: u.side, species: u.species, level: u.level, hp: u.hp, maxHP: u.maxHP, sp: u.sp, maxSP: u.maxSP, x: u.x, y: u.y,
			facing: u.facing, status: u.status, moved: u.moved, acted: u.acted, boosts: { ...u.boosts }, held: u.heldId, heldUsed: !!u.heldUsed, moves: u.fig.equipped.map((m) => ({ id: m, pp: u.pp[m] })) })) };
}

/** Replay: a battle from its seed and setup, with these actions applied in order. */
export function replay(seed, setup, actions, data) {
	const S = newBattle(seed, setup, data);
	for (const a of actions) act(S, a, data);
	return S;
}
