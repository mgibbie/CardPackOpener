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
//   - ITEMS lie where the floor marked them (mm/items.js); the leader picks up what it walks over into a bag of 20, and
//     may use one or throw one: each a turn. Stars go straight to the run's purse.
//   - BELLY: the leader's every action costs 0.1 of 100; at 0 it loses 1 HP an action and stops healing
//   - a MONSTER HOUSE looks like any room: the first of your party to step in brings 8 to 11 wild Pokémon down round it
//   - a SHOP is a carpet of goods with its keeper beside it. { t: 'take' } picks up what you stand on and you owe its
//     price; { t: 'pay' } settles in stars; { t: 'putback' } returns it. Step off the carpet owing and you are a thief:
//     the keeper, far stronger than anything on the floor, comes for you, and more keepers keep arriving. Hit it and it
//     turns on you too.
//   - RECRUITING: a wild Pokémon the leader knocks out from right beside it may ask to join (its catch rate, plus the
//     original's bonus for the leader's level). It joins the party if there is room, else waits outside; either way it is
//     in S.recruits, and becomes a real figurine only if you get out.
//   - EXP: when one of yours knocks a wild Pokémon out, everyone in the party gets the EXP, and LEVELS UP on the spot
//     (stats, HP, new moves into its pool). S.exp keeps each one's total for the way out.
//   - a Lv 5 dungeon: everyone goes in as a Lv 5 copy of itself (its first moves, an empty bag, no stars)
//   - a BOSS floor: the boss stands on the stairs, and they stay shut while it stands
//   - the endless dungeon makes floor n from n alone (mm/dungeons.js endlessFloor)
//   - TRAPS (mm/traps.js) are hidden where the floor marked them: the leader springs what it steps on, a partner only
//     one that is showing, wild Pokémon none. The plain Attack shows a trap on the tile in front.
//
// S (plain data, JSON-safe): { v, rev, seed, dungeon, floorNo, pre, rng, F, seen, units, leader, tick, turns, steps, n,
//                              spawnT, fallen, B, bag, stars, belly, items, traps, lit, house, owed, thief, recruits, exp, kills, stars0, over, ev }
//   bag: [{ id, n?, sticky? }]   items: [{ x, y, id, n?, sticky? }]   traps: [{ x, y, kind, seen }]
//   F: the floor { w, h, terrain[], room[], spawn[], stairs: [x, y], water, vis, mh, shop, keeper }
//   a unit: engine/battle.js makeUnit's, plus { dir 0..7, stage (speed), attacking, swapped, nap, regen, chip, tactic, goal }
//   B: the battle-shaped board the engine fights on (its units ARE S.units; its map is the floor)
// Node-tested (overworld/tests/poketactica_mm_turn_test.mjs).
import { generateFloor, MM_W, MM_H, T_WALL, T_FLOOR, T_IMPASSABLE, T_SHOP, T_MONSTER_HOUSE, S_ENEMY, S_ITEM, S_TRAP, NO_ROOM } from './gen.js';
import { makeRng, floorSeedStep, preseedOf } from './rng.js';
import { DIR8, canStep8, cheb, sightTiles, dir8Toward, inFloor } from './shapes8.js';
import { makeUnit, inflict, shift, upkeepUnit, abilityUpkeep, turnStart } from '../engine/battle.js';
import { PHASE_ABILITIES } from '../engine/abilities2.js';
import { PHASE_ABILITIES as PHASE_ABILITIES8 } from '../engine/abilities3.js';
import { makeFigurine, gainExp, battleStats, expForLevel, stretchedLearnset } from '../figurine.js';
import { endlessFloor } from './dungeons.js';
import { makeRng as figRng } from '../../../overworld/rules/rng.js';
import { newBoard, boardMap, mazeGeo, face, moveBlock, useMove, ATTACK_ID } from './combat.js';
import { aiTurn } from './ai.js';
import { ITEMS, BAG_MAX, BELLY_MAX, BELLY_STEP, rollItem, useItem, throwItem, throwBlock, usable, priceOf } from './items.js';
import { TRAPS, rollTrap, springTrap } from './traps.js';

export const MM_RULES_REV = 11;   // 11: the battle's RULES_REV 10; 10: a move learned inside a run fills an empty move slot at once (it could never be used); 9: the battle's RULES_REV 9 (Protect comes down at its user's next turn: here it never did); 8: Leftovers and Black Sludge at the maze's pace, once-a-battle items once a FLOOR; 7: the battle's RULES_REV 8; 6: end-of-turn abilities and Magic Guard in the maze's own upkeep; 5: the battle's RULES_REV 7; 4: the battle's RULES_REV 6; 2: moves with a worked-out power (the battle's RULES_REV 4); 3: the battle's RULES_REV 5
const BATTLE_REV = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 7, 7: 8, 8: 8, 9: 9, 10: 9 };              // (the battle rules a run of an older revision was played by)
export const REGEN_TURNS = 200;                 // a full heal for a party member takes this many of its turns
export const SP_STEP = 0.02;                    // of max SP back per tile walked
export const NAP_CHANCE = 8;                    // % of wild Pokémon that start asleep
export const SPAWN_EVERY = 36, WILD_MAX = 10, WILD_MAX_HOUSE = 4, SPAWN_AWAY = 6;
export const UPKEEP_EVERY = 10;   // a mark's "turn" (a screen's 5, Leech Seed's drain) is this many of a unit's turns in the maze
export const CHIP = Object.freeze({ brn: [20, 16], psn: [10, 16], tox: [5, 16] });   // a status bites every N of its turns, for 1/Nth of max HP
export const FRZ_THAW = 20;                     // % a turn
export const SLEEP_TURNS = [3, 7];              // (the original's; the top is not included)
export const HOUSE_MONS = [8, 12], HOUSE_REACH = 4;   // a Monster House drops 8 to 11, within 4 tiles of whoever set it off
export const KEEPER = 'kecleon', KEEPER_LEVEL = 90, THIEF_SPAWN_EVERY = 5;
/** The original's bonus to recruiting for the leader's level, in tenths of a percent (nothing below 30). */
export const recruitBonus = (lv) => (lv < 30 ? 0 : lv < 40 ? 50 : lv < 50 ? 75 : lv < 60 ? 100 : lv < 70 ? 125 : lv < 80 ? 150 : lv < 90 ? 175 : 240);
/** A species' chance to ask to join, in tenths of a percent, before the level bonus: from its catch rate (255 -> 12%, 45 -> 2.1%, never under 0.5%). */
export const recruitRate = (species, data) => Math.max(5, Math.round((((data.extra && data.extra[species] && data.extra[species].catch) || 45) / 255) * 120));
export const MM_EXP_RATE = 2;                   // (times the battle's EXP for a knockout; everyone in the party gets it. TUNED with tools/poketactica/mm_explore.mjs)
export const LV5 = 5;
// A wild Pokémon is weaker than a figurine of its level: less HP and a softer hit (bosses and shopkeepers are at full
// strength). With permanent loss an even fight at every turn is a lost party. TUNED with tools/poketactica/mm_explore.mjs.
export const BOSS_ATK = 0.6;   // (a boss keeps all its HP: a long fight, not a sudden one)
export const WILD_HP = 0.6, WILD_ATK = 0.6;
export const HUNGRY_AT = Object.freeze([200, 100, 0]);   // the belly warns at 20, 10 and empty
export const TACTICS = Object.freeze(['follow', 'hunt', 'away', 'wait']);
export const MM_PARTY_MAX = 6;
export const MOVE_SLOTS = 4;   // (a figurine's equipped moves: figurine.js)
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
export const floorOf = (dungeon, n) => (dungeon.endless ? endlessFloor(n) : dungeon.floors[Math.min(n, dungeon.floors.length) - 1]);
/** How many floors a dungeon has (the endless one: no end). */
export const lastFloor = (dungeon) => (dungeon.endless ? Infinity : dungeon.floors.length);
/** A figurine as it enters a Lv 5 dungeon: itself at Lv 5, knowing what its kind knows by then. */
export function atLevel(fig, lv, data) {
	const ids = [...new Set(stretchedLearnset(data.species[fig.species]).filter(([l]) => l <= lv).map(([, id]) => id))];
	if (!ids.length) ids.push(fig.pool[0].id);
	return { ...fig, level: lv, exp: expForLevel(lv), pool: ids.map((id) => ({ id, lv: 1, xp: 0 })), equipped: ids.slice(-4) };
}

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
	const S = { v: 1, rev: setup.rev || MM_RULES_REV, seed: String(seed), dungeon: setup.dungeon, floorNo: 0, pre: preseedOf(hash32(String(seed))), rng: 1, F: null, seen: [], units: [], leader: 'p0', tick: 0, turns: 0, steps: 0, n: 0, spawnT: 0, fallen: [], B: null,
		bag: (setup.bag || []).slice(0, BAG_MAX).map((it) => ({ ...it })), stars: 0, belly: BELLY_MAX, items: [], traps: [], lit: false, pit: false, house: false, owed: 0, thief: false, recruits: [],
		over: null, ev: [] };
	S.stars = Math.max(0, setup.stars | 0);   // (the stars brought in, to spend in shops; all of them are at risk)
	const lv5 = !!setup.dungeon.lv5;
	if (lv5) { S.bag = []; S.stars = 0; }
	Object.assign(S, { exp: {}, expSeen: 0, kills: 0, stars0: S.stars });
	setup.party.slice(0, size).forEach((fig, i) => { S.units.push(mmUnit(makeUnit(lv5 ? atLevel(fig, LV5, data) : fig, 'p' + i, 'p', 0, 0, null, data), { tactic: 'follow' })); });
	enterFloor(S, 1, data);
	return S;
}
const mmUnit = (u, more) => { Object.assign(u, { jump: 0, dir: 4, stage: NORMAL_STAGE, attacking: false, swapped: false, nap: false, stone: false, regen: 0, chip: 0, goal: null, haste: 0, slow: 0, sealed: null }, more); u.facing = 's'; return u; };
/** The board follows the floor: made once, its map and units re-pointed whenever they are replaced (a new floor, a restore). */
function link(S, data) {
	Object.defineProperty(S, '_data', { value: data, enumerable: false, configurable: true, writable: true });   // (the game's tables, for what happens mid-step)
	if (!S.B) S.B = newBoard(S.seed, S.F, data, BATTLE_REV[S.rev]);   // (a replay of an older run fights by that run's rules)
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
	for (const u of S.units) { u.status = null; u.confused = 0; u.chip = 0; u.goal = null; u.haste = 0; u.slow = 0; u.stage = NORMAL_STAGE; u.sealed = null; for (const k of Object.keys(u.boosts)) u.boosts[k] = 0; }
	// (rev 8) a floor is a battle to a held item: a berry, a Focus Sash, a Weakness Policy work once on each; a Choice item lets go
	if (S.rev >= 8) for (const u of S.units) { u.heldUsed = false; u.choiceLock = null; }
	S.items = []; S.traps = []; S.lit = false; S.pit = false; S.house = false; S.owed = 0; S.thief = false;
	for (const it of S.bag) delete it.unpaid;
	link(S, data);
	S.B.field.weather = null; delete S.B.field.fx;   // (and no Gravity or Trick Room follows you down)
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
	// a boss stands on the stairs (or as near as it can), awake, and keeps to its post
	if (fl.boss) {
		const dist = walkMap(S.F, { types: [], ability: null }, S.F.stairs[0], S.F.stairs[1]);
		let at = -1;
		for (let i = 0; i < dist.length; i++) if (dist[i] >= 0 && (at < 0 || dist[i] < dist[at]) && !unitAt(S, i % MM_W, (i / MM_W) | 0)) at = i;
		if (at >= 0) {
			const b = Object.assign(addWild(S, fl.boss.species, fl.boss.level, at % MM_W, (at / MM_W) | 0, data), { boss: true, post: [at % MM_W, (at / MM_W) | 0] });
			b.stats.atk = Math.max(1, Math.round(b.stats.atk * BOSS_ATK)); b.stats.spa = Math.max(1, Math.round(b.stats.spa * BOSS_ATK));
		}
	}
	// items and traps on the floor's marks (an item buried in a wall is nobody's to reach: left out)
	const T = kit(S);
	const marked = (flag, each) => { for (let x = 0; x < MM_W; x++) for (let y = 0; y < MM_H; y++) { const i = y * MM_W + x; if ((S.F.spawn[i] & flag) && (S.F.terrain[i] & 3) === T_FLOOR) each(x, y); } };
	if (fl.items && fl.items.length) marked(S_ITEM, (x, y) => S.items.push({ x, y, ...rollItem(fl.items, T, n, fl.sticky | 0) }));
	if (fl.traps && fl.traps.length) marked(S_TRAP, (x, y) => { const kind = rollTrap(fl.traps, T); S.traps.push({ x, y, kind, seen: !!TRAPS[kind].shown }); });
	// a shop: what lies on its carpet is for sale, and its keeper stands by
	for (const o of S.items) if (S.F.terrain[o.y * MM_W + o.x] & T_SHOP) { if (o.id === 'stars') o.id = 'apple'; delete o.sticky; o.shop = true; o.price = priceOf(o); }
	if (S.F.keeper && S.items.some((o) => o.shop) && !unitAt(S, S.F.keeper[0], S.F.keeper[1])) Object.assign(addWild(S, KEEPER, fl.keeper || KEEPER_LEVEL, S.F.keeper[0], S.F.keeper[1], data), { keeper: true, hostile: false });
	ev(S, { t: 'floor', n });
	reveal(S);
	if (S.F.terrain[L.y * MM_W + L.x] & T_MONSTER_HOUSE) monsterHouse(S, L);
	untilLeader(S, data);
}
/** What items and traps are given to work with (mm/items.js, mm/traps.js), bound to this run. */
function kit(S) {
	const data = S._data;
	const drain = () => { for (const e of S.B.log) ev(S, e); S.B.log.length = 0; };
	return {
		roll: (n) => roll(S, n), ev: (e) => ev(S, e),
		unitAt: (x, y) => unitAt(S, x, y), canEnter: (u, x, y) => canEnter(S.F, u, x, y),
		hurt: (u, n, why) => hurt(S, u, n, why),
		heal: (u, n) => { const h = Math.min(u.maxHP - u.hp, n); if (h > 0) { u.hp += h; ev(S, { t: 'heal', uid: u.uid, n: h }); } },
		status: (u, st) => { const ok = inflict(S.B, u, u, st); drain(); if (ok && st === 'slp') longSleep(S, u); return ok; },
		boost: (u, changes) => { shift(S.B, u, changes); drain(); },
		speed: (u, d, turns) => { if (d > 0) u.haste = turns; else u.slow = turns; restage(u); ev(S, { t: 'speed', uid: u.uid, stage: u.stage }); },
		warp: (u) => warp(S, u),
		place: (u, x, y) => { u.x = x; u.y = y; ev(S, { t: 'moved', uid: u.uid, x, y }); if (u.uid === S.leader) reveal(S); },
		maxPP: (id) => (data.moves[id] && data.moves[id].pp) || 10,
		spawn: (x, y) => { const u = spawnWild(S, x, y, data); if (u) { u.nap = false; ev(S, { t: 'spawn', uid: u.uid, x, y }); } return u; },
		fall: () => { S.pit = true; },
	};
}
const restage = (u) => { u.stage = Math.max(0, Math.min(MAX_STAGE, NORMAL_STAGE + (u.haste > 0 ? 1 : 0) - (u.slow > 0 ? 1 : 0))); };
/** Sleep in the maze lasts the original's 3 to 6 turns (a battle's is shorter). */
function longSleep(S, u) { u.sleepTurns = SLEEP_TURNS[0] + roll(S, SLEEP_TURNS[1] - SLEEP_TURNS[0]) + 1; }
/** Somewhere else on the floor: a free room tile it can stand on. */
function warp(S, u) {
	const F = S.F, spots = [];
	for (let x = 0; x < F.w; x++) for (let y = 0; y < F.h; y++) if (F.room[y * F.w + x] !== NO_ROOM && canEnter(F, u, x, y) && !unitAt(S, x, y)) spots.push([x, y]);
	if (!spots.length) return;
	const [x, y] = spots[roll(S, spots.length)];
	u.x = x; u.y = y; u.goal = null;
	ev(S, { t: 'warp', uid: u.uid, x, y });
	if (u.uid === S.leader) reveal(S);
}
/** The Monster House wakes: 8 to 11 wild Pokémon drop onto its free tiles within 4 of whoever stepped in. Once a floor. */
function monsterHouse(S, u) {
	if (S.house || !(floorOf(S.dungeon, S.floorNo).wild || []).length) return;
	S.house = true;
	const F = S.F, spots = [];
	for (let x = u.x - HOUSE_REACH; x <= u.x + HOUSE_REACH; x++) for (let y = u.y - HOUSE_REACH; y <= u.y + HOUSE_REACH; y++) {
		if (!inFloor(F, x, y)) continue;
		const t = F.terrain[y * F.w + x];
		if ((t & T_MONSTER_HOUSE) && (t & 3) === T_FLOOR && !unitAt(S, x, y)) spots.push([x, y]);
	}
	ev(S, { t: 'house', uid: u.uid });
	for (let n = Math.min(spots.length, HOUSE_MONS[0] + roll(S, HOUSE_MONS[1] - HOUSE_MONS[0])); n > 0; n--) {
		const [x, y] = spots.splice(roll(S, spots.length), 1)[0], w = spawnWild(S, x, y, S._data);
		if (w) { w.nap = false; ev(S, { t: 'spawn', uid: w.uid, x, y }); }
	}
}
/** You are a thief now: nothing is for sale any more, what you hold is yours, and the keeper comes. */
function theft(S) {
	S.thief = true; S.owed = 0; S.spawnT = 0;
	for (const o of S.items) { delete o.shop; delete o.price; }
	for (const it of S.bag) delete it.unpaid;
	ev(S, { t: 'thief' });
	for (const k of S.units) if (k.keeper && k.hp > 0) anger(S, k);
}
function anger(S, k) {
	if (k.hostile) return;
	k.hostile = true; k.nap = false; k.stage = NORMAL_STAGE + 1;
	ev(S, { t: 'angry', uid: k.uid });
}
/** The leader has knocked out a wild Pokémon from beside it: it may ask to join. */
function recruit(S, v) {
	const L = leaderOf(S), fl = floorOf(S.dungeon, S.floorNo);
	if (!L || fl.noRecruit || v.keeper || v.boss || v.side === 'p' || cheb(L.x, L.y, v.x, v.y) > 1) return;
	if (roll(S, 1000) >= recruitRate(v.species, S._data) + recruitBonus(L.level)) return;
	const room = partyOf(S).length < Math.max(1, Math.min(MM_PARTY_MAX, S.dungeon.party || 4));
	S.recruits.push({ uid: v.uid, fig: v.fig, floor: S.floorNo });
	ev(S, { t: 'recruit', uid: v.uid, species: v.species, joined: room });
	if (!room) return;
	Object.assign(v, { side: 'p', hp: v.maxHP, sp: v.maxSP, status: null, confused: 0, nap: false, stone: false, goal: null, tactic: 'follow', attacking: true, chip: 0 });
	for (const k of Object.keys(v.boosts)) v.boosts[k] = 0;
}
/** A party member has arrived on a tile: the leader picks up what lies there and springs any trap; a partner only a trap that is showing. */
function landed(S, u) {
	const lead = u.uid === S.leader;
	if (lead) {
		const i = S.items.findIndex((o) => o.x === u.x && o.y === u.y && !o.shop);
		if (i >= 0) {
			const o = S.items[i], it = { id: o.id, ...(o.n ? { n: o.n } : {}), ...(o.sticky ? { sticky: true } : {}) };
			if (o.id === 'stars') { S.stars += o.n || 1; S.items.splice(i, 1); ev(S, { t: 'pickup', id: 'stars', n: o.n || 1 }); }
			else if (stow(S, it)) { S.items.splice(i, 1); ev(S, { t: 'pickup', id: it.id, n: it.n || 1 }); }
			else ev(S, { t: 'bagfull', id: it.id });
		}
	}
	const here = S.F.terrain[u.y * S.F.w + u.x];
	if (lead && S.owed > 0 && !(here & T_SHOP)) theft(S);
	if (here & T_MONSTER_HOUSE) monsterHouse(S, u);
	const tr = S.traps.find((t) => t.x === u.x && t.y === u.y);
	if (tr && (lead || (tr.seen && tr.kind !== 'pitfall'))) springTrap(S, u, tr, kit(S));
}
/** Into the bag: onto a pile of the same thing, or a new slot if there is one. -> did it fit */
export function stow(S, it) {
	const pile = ITEMS[it.id] && ITEMS[it.id].stack && !it.sticky && !it.unpaid ? S.bag.find((b) => b.id === it.id && !b.sticky && !b.unpaid) : null;
	if (pile) { pile.n = (pile.n || 1) + (it.n || 1); return true; }
	if (S.bag.length >= BAG_MAX) return false;
	S.bag.push(it);
	return true;
}
/** One of the thing in a bag slot, taken out. */
function take(S, slot) {
	const b = S.bag[slot], one = { id: b.id, ...(b.sticky ? { sticky: true } : {}) };   // (an unpaid one used or thrown is still owed for)
	if ((b.n || 1) > 1) b.n--; else S.bag.splice(slot, 1);
	return one;
}
/** The leader's belly: every action costs a little; empty, it costs HP instead. */
function hunger(S) {
	const L = leaderOf(S);
	if (!L) return;
	if (S.belly > 0) {
		const was = S.belly;
		S.belly = Math.max(0, S.belly - BELLY_STEP);
		for (const at of HUNGRY_AT) if (was > at && S.belly <= at) ev(S, { t: 'hungry', n: at / 10 });
	} else hurt(S, L, 1, 'hunger');
}
/** A wild Pokémon from the floor's list ({ species, level, w }: w its weight), on this tile; some start asleep. */
function spawnWild(S, x, y, data) {
	const list = floorOf(S.dungeon, S.floorNo).wild || [];
	const total = list.reduce((a, e) => a + (e.w || 1), 0);
	if (!total) return null;
	let r = roll(S, total), pick = list[0];
	for (const e of list) { r -= e.w || 1; if (r < 0) { pick = e; break; } }
	const u = addWild(S, pick.species, pick.level, x, y, data);
	u.maxHP = u.hp = Math.max(1, Math.round(u.maxHP * WILD_HP));
	u.stats.atk = Math.max(1, Math.round(u.stats.atk * WILD_ATK)); u.stats.spa = Math.max(1, Math.round(u.stats.spa * WILD_ATK));
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
	if (!S.thief && !(floorOf(S.dungeon, S.floorNo).wild || []).length) return;
	if (++S.spawnT < (S.thief ? THIEF_SPAWN_EVERY : SPAWN_EVERY)) return;
	S.spawnT = 0;
	if (!S.thief && wildOf(S).length >= (S.F.mh !== NO_ROOM ? WILD_MAX_HOUSE : WILD_MAX)) return;   // (after a theft: no limit)
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
		const i = spots[roll(S, spots.length)];
		const u = S.thief ? Object.assign(addWild(S, KEEPER, floorOf(S.dungeon, S.floorNo).keeper || KEEPER_LEVEL, i % F.w, (i / F.w) | 0, data), { keeper: true, hostile: true, stage: NORMAL_STAGE + 1 }) : spawnWild(S, i % F.w, (i / F.w) | 0, data);
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
 *   { t: 'use', slot }  eat, drink or break the item in a bag slot
 *   { t: 'throw', slot, x?, y? }   throw one: straight the way the leader faces, or (a lobbed one) at a tile
 *   { t: 'take' }       pick up the shop's item underfoot: you owe its price (free)
 *   { t: 'pay' }        pay what you owe, in stars (free)
 *   { t: 'putback', slot }   put an unpaid item back on the carpet (free)
 *   { t: 'quit' }       give up: the run ends, lost
 */
export function actBlock(S, a, data) {
	if (S.over) return 'the run is over';
	const L = leaderOf(S), F = S.F;
	if (!a || typeof a.t !== 'string') return 'not an action';
	if (a.t === 'pass' || a.t === 'attack' || a.t === 'quit') return null;
	if (a.t === 'move') return moveBlock(S.B, F, L, a.id, a.x, a.y, data);
	if (a.t === 'take') {
		if (!S.items.some((o) => o.shop && o.x === L.x && o.y === L.y)) return 'nothing for sale here';
		return S.bag.length < BAG_MAX ? null : 'the bag is full';
	}
	if (a.t === 'pay') return S.owed <= 0 ? 'nothing to pay' : S.stars < S.owed ? 'not enough stars' : null;
	if (a.t === 'putback') {
		const it = Number.isInteger(a.slot) ? S.bag[a.slot] : null;
		if (!it || !it.unpaid) return 'not an unpaid item';
		if (!(F.terrain[L.y * F.w + L.x] & T_SHOP)) return 'not on the shop\'s carpet';
		return S.items.some((o) => o.x === L.x && o.y === L.y) ? 'something lies here already' : null;
	}
	if (a.t === 'use' || a.t === 'throw') {
		const it = Number.isInteger(a.slot) ? S.bag[a.slot] : null;
		if (!it) return 'no such item';
		if (it.sticky) return 'it is sticky';
		if (a.t === 'use') return usable(it.id) ? null : 'not something to use';
		return throwBlock(S, L, it, a.x, a.y);
	}
	if (a.t === 'tactic') { const u = unit(S, a.uid); return u && u.side === 'p' && u.hp > 0 && u !== L && TACTICS.includes(a.tactic) ? null : 'not a tactic for a partner'; }
	if (a.t === 'stairs') return L.x !== F.stairs[0] || L.y !== F.stairs[1] ? 'not on the stairs' : S.units.some((u) => u.boss && u.hp > 0) ? 'the boss bars the way' : null;
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
	if (a.t === 'quit') { S.over = { won: false, quit: true, floor: S.floorNo }; ev(S, { t: 'over', won: false, quit: true }); return S.ev; }
	if (a.t === 'tactic') { unit(S, a.uid).tactic = a.tactic; ev(S, { t: 'tactic', uid: a.uid, tactic: a.tactic }); return S.ev; }
	if (a.t === 'take') {
		const i = S.items.findIndex((o) => o.shop && o.x === L.x && o.y === L.y), o = S.items[i];
		S.items.splice(i, 1);
		S.bag.push({ id: o.id, ...(o.n ? { n: o.n } : {}), unpaid: o.price });
		S.owed += o.price;
		ev(S, { t: 'take', id: o.id, price: o.price, owed: S.owed });
		return S.ev;
	}
	if (a.t === 'pay') {
		S.stars -= S.owed;
		ev(S, { t: 'paid', n: S.owed, stars: S.stars });
		S.owed = 0;
		for (const it of S.bag) delete it.unpaid;
		return S.ev;
	}
	if (a.t === 'putback') {
		const it = S.bag.splice(a.slot, 1)[0];
		S.items.push({ x: L.x, y: L.y, id: it.id, ...(it.n ? { n: it.n } : {}), shop: true, price: it.unpaid });
		S.owed -= it.unpaid;
		ev(S, { t: 'putback', id: it.id, owed: S.owed });
		return S.ev;
	}
	if (a.t === 'stairs') {
		ev(S, { t: 'stairs', n: S.floorNo });
		if (S.floorNo >= lastFloor(S.dungeon)) { S.over = { won: true, floor: S.floorNo }; ev(S, { t: 'over', won: true }); } else enterFloor(S, S.floorNo + 1, data);
		return S.ev;
	}
	if (a.t === 'step') {
		// confused: its feet pick the way (a turn is spent even if they pick a wall)
		const d = L.confused > 0 ? roll(S, 8) : a.d;
		if (L.confused > 0 && actBlock(S, { t: 'step', d }, data)) ev(S, { t: 'stumble', uid: L.uid });
		else {
			const x = L.x + DIR8[d][0], y = L.y + DIR8[d][1], o = unitAt(S, x, y);
			if (o) { o.x = L.x; o.y = L.y; setDir(o, (d + 4) % 8); o.swapped = true; ev(S, { t: 'step', uid: o.uid, x: o.x, y: o.y, d: o.dir, swap: true }); }
			stepTo(S, L, x, y, d);
			S.steps++;
		}
	} else if (a.t === 'attack') {
		const x = L.x + DIR8[L.dir][0], y = L.y + DIR8[L.dir][1], tr = S.traps.find((t) => t.x === x && t.y === y && !t.seen);
		if (tr) { tr.seen = true; ev(S, { t: 'trapseen', kind: tr.kind, x, y }); }
		strikeAt(S, L, ATTACK_ID, x, y, data);
	} else if (a.t === 'move') strikeAt(S, L, a.id, a.x, a.y, data);
	else if (a.t === 'use') { useItem(S, L, take(S, a.slot), kit(S)); bury(S); }
	else if (a.t === 'throw') { throwItem(S, L, take(S, a.slot), a.x, a.y, kit(S)); bury(S); }
	else ev(S, { t: 'pass', uid: L.uid });
	if (S.over) { if (S.over.escaped) S.bag = S.bag.filter((it) => !it.unpaid); return S.ev; }   // (what was not paid for stays in the shop)
	S.turns++;
	hunger(S);
	if (S.over) return S.ev;
	if (S.pit) {   // (a pitfall: the party lands on the next floor; on the last floor there is nothing below)
		S.pit = false;
		if (S.floorNo < lastFloor(S.dungeon)) { ev(S, { t: 'fell', n: S.floorNo }); enterFloor(S, S.floorNo + 1, data); return S.ev; }
	}
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
	if (u.side === 'p') landed(S, u);
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
		if (e.t === 'hit' || e.t === 'hurt') { const v = unit(S, e.t === 'hit' ? e.target : e.uid); if (v && v.nap) { v.nap = false; v.stone = false; ev(S, { t: 'woke', uid: v.uid }); } }
		if (e.t === 'status' && e.st === 'slp') { const v = unit(S, e.uid); if (v) longSleep(S, v); }
		if ((e.t === 'hit' || e.t === 'status' || e.t === 'boost') && u.side === 'p') { const v = unit(S, e.t === 'hit' ? e.target : e.uid); if (v && v.keeper) anger(S, v); }
		if (e.t === 'ko' && e.by === S.leader) { const v = unit(S, e.uid); if (v && v.hp <= 0) recruit(S, v); }
		if (e.t === 'ko' && e.by && u.side === 'p') { const v = unit(S, e.uid); if (v && v.side !== 'p') { S.kills++; if (v.boss) ev(S, { t: 'bossdown', uid: v.uid, species: v.species }); } }
	}
	bury(S);
	// the EXP of a knockout goes to everyone in the party, and they grow at once
	const total = Object.values(S.B.exp).reduce((a, b) => a + b, 0);
	if (total > S.expSeen) {
		const got = Math.floor((total - S.expSeen) * MM_EXP_RATE);
		S.expSeen = total;
		if (got > 0) for (const p of partyOf(S)) grow(S, p, got, data);
	}
	return true;
}
/** EXP for one of the party: its total for the way out, and its level, stats and moves now. */
function grow(S, u, n, data) {
	S.exp[u.uid] = (S.exp[u.uid] || 0) + n;
	const g = gainExp(u.fig, n, data);
	u.fig = g.fig;
	if (!g.gained) return;
	// (rev 10) a move it learns goes into an empty slot at once, with its PP: a figurine that came in at Lv 5 with two moves
	// "learned" the rest and could never use one of them
	if (S.rev >= 10) for (const id of g.newMoves) {
		if (u.fig.equipped.length >= MOVE_SLOTS || u.fig.equipped.includes(id) || !data.moves[id]) continue;
		u.fig = { ...u.fig, equipped: [...u.fig.equipped, id] };
		u.pp[id] = data.moves[id].pp || 10;
	}
	const b = battleStats(g.fig, data), more = b.maxHP - u.maxHP;
	Object.assign(u, { level: g.fig.level, stats: { atk: b.atk, def: b.def, spa: b.spa, spd: b.spd, spe: b.spe }, maxHP: b.maxHP, maxSP: b.sp });
	u.hp = Math.min(u.maxHP, u.hp + Math.max(0, more));
	ev(S, { t: 'level', uid: u.uid, level: u.level, moves: g.newMoves });
}
/** Damage from outside a move (a status, hunger, a trap). */
export function hurt(S, u, n, why) {
	if (u.hp <= 0) return;
	const d = Math.min(u.hp, Math.max(1, n | 0));
	u.hp -= d;
	ev(S, { t: 'hurt', uid: u.uid, n: d, why });
	if (u.nap && u.hp > 0) { u.nap = false; u.stone = false; ev(S, { t: 'woke', uid: u.uid }); }
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
		const r = S.recruits.findIndex((x) => x.uid === u.uid);
		if (r >= 0) { S.recruits.splice(r, 1); ev(S, { t: 'lost', uid: u.uid, species: u.species, recruit: true }); }   // (a recruit that falls was never yours to lose)
		else { S.fallen.push({ id: u.fig.id || null, uid: u.uid, species: u.species, level: u.level, floor: S.floorNo }); ev(S, { t: 'lost', uid: u.uid, species: u.species }); }
		if (u.uid !== S.leader) continue;   // (a recruit may be leading by now: whoever led, the next one leads)
		const next = partyOf(S)[0];
		if (next) { S.leader = next.uid; next.swapped = false; ev(S, { t: 'leader', uid: next.uid }); reveal(S); }
		else { S.over = { won: false, floor: S.floorNo }; ev(S, { t: 'over', won: false }); }
	}
}
/** Before a Pokémon's turn: your party heals a little; sleep, ice and a wild Pokémon's nap may cost the turn. -> can it act */
function before(S, u) {
	turnStart(S.B, u);   // (rev 9: the Protect it put up last turn comes down)
	if (u.side === 'p' && u.hp < u.maxHP && u.status !== 'psn' && u.status !== 'tox' && !(u.uid === S.leader && S.belly <= 0)) {
		u.regen += u.maxHP;
		const n = Math.floor(u.regen / REGEN_TURNS);
		if (n > 0) { u.regen -= n * REGEN_TURNS; u.hp = Math.min(u.maxHP, u.hp + n); }
	}
	if (u.nap) {
		if (u.stone || !S.units.some((o) => o.hp > 0 && o.side !== u.side && cheb(o.x, o.y, u.x, u.y) <= 1)) return false;
		u.nap = false; ev(S, { t: 'woke', uid: u.uid });
	}
	if (u.status === 'slp') { if (--u.sleepTurns > 0) { ev(S, { t: 'asleep', uid: u.uid }); return false; } u.status = null; ev(S, { t: 'woke', uid: u.uid }); }
	if (u.status === 'frz') { if (roll(S, 100) >= FRZ_THAW) { ev(S, { t: 'frozen', uid: u.uid }); return false; } u.status = null; ev(S, { t: 'thawed', uid: u.uid }); }
	return true;
}
/** After a Pokémon's turn: a Quick Seed or a Slow Trap wears off, confusion clears, a burn or poison bites every so many turns. */
function after(S, u) {
	if (u.haste > 0 && --u.haste === 0) { restage(u); ev(S, { t: 'speed', uid: u.uid, stage: u.stage }); }
	if (u.slow > 0 && --u.slow === 0) { restage(u); ev(S, { t: 'speed', uid: u.uid, stage: u.stage }); }
	if (u.confused > 0) u.confused--;
	if ((u.fx || u.seed) && u.hp > 0 && (u.upk = (u.upk || 0) + 1) >= UPKEEP_EVERY) {   // (Leech Seed, Aqua Ring, the marks counting down: the battle's rule)
		u.upk = 0; upkeepUnit(S.B, u, S._data);
		for (const e of S.B.log) ev(S, e); S.B.log.length = 0;
	}
	// (rev 6) the abilities of the end of a turn, at the maze's pace: Speed Boost, Shed Skin, Regenerator, Poison Heal ...
	if (S.rev >= 6 && u.hp > 0 && (PHASE_ABILITIES.has(u.ability) || (S.rev >= 7 && PHASE_ABILITIES8.has(u.ability))) && (u.abk = (u.abk || 0) + 1) >= UPKEEP_EVERY) {
		u.abk = 0; abilityUpkeep(S.B, u);
		for (const e of S.B.log) ev(S, e); S.B.log.length = 0;
	}
	// (rev 8) Leftovers and Black Sludge, which a battle gives at the end of each phase: every 10th turn here, like the marks
	if (S.rev >= 8 && u.hp > 0 && u.held && (u.held.endHealFrac || u.held.sludge) && (u.hlk = (u.hlk || 0) + 1) >= UPKEEP_EVERY) {
		u.hlk = 0;
		const mend = (n) => { const h = Math.min(u.maxHP - u.hp, Math.max(1, n)); if (h > 0) { u.hp += h; ev(S, { t: 'heal', uid: u.uid, n: h }); } };
		if (u.held.endHealFrac) mend(Math.floor(u.maxHP * u.held.endHealFrac));
		else if (u.types.includes('Poison')) mend(Math.floor(u.maxHP / 16));
		else if (u.ability !== 'magicguard') hurt(S, u, Math.max(1, Math.floor(u.maxHP / 8)), 'blacksludge');
	}
	// (Magic Guard is not bitten by a burn or poison; Poison Heal mends instead)
	const spared = S.rev >= 6 && (u.ability === 'magicguard' || (u.ability === 'poisonheal' && (u.status === 'psn' || u.status === 'tox')));
	const c = u.hp > 0 && !spared && CHIP[u.status];
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
		if (u.hp <= 0 || !actsOn(u.stage, S.tick) || u.attacking || (u.keeper && !u.hostile)) continue;   // (a shopkeeper minds its shop)
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
	const core = JSON.stringify([S.floorNo, S.pre, S.rng, S.B.rng, S.tick, S.turns, S.steps, S.n, S.spawnT, S.over, S.leader, S.fallen, S.B.exp, S.F.terrain, S.F.spawn, S.seen, S.bag, S.stars, S.belly, S.items, S.traps, S.lit, S.house, S.owed, S.thief, S.recruits.map((r) => r.uid), S.exp, S.kills,
		S.units.map((u) => [u.uid, u.species, u.x, u.y, u.dir, u.hp, u.sp, u.pp, u.stage, u.attacking, u.swapped, u.status, u.boosts, u.nap, u.regen, u.chip, u.tactic, u.goal, u.stone, u.haste, u.slow, u.sealed, u.confused || 0, u.sleepTurns || 0, u.side, !!u.keeper, !!u.hostile, u.level, !!u.boss])]);
	return hash32(core).toString(16).padStart(8, '0');
}
/**
 * What the player sees, which is all a spectator gets: the ground they have explored (-1 where they have not been), the
 * stairs once seen, and the Pokémon in sight. No seed, nothing behind the fog.
 */
export function view(S) {
	const F = S.F, now = new Set(sightNow(S)), si = F.stairs[1] * F.w + F.stairs[0];
	return { floor: S.floorNo, floors: S.dungeon.endless ? 0 : S.dungeon.floors.length, kills: S.kills, dungeon: S.dungeon.name || S.dungeon.id, theme: S.dungeon.theme || 'cave', w: F.w, h: F.h, water: F.water, leader: S.leader, turns: S.turns, over: S.over,
		tiles: F.terrain.map((t, i) => (S.seen[i] ? t & 3 : -1)), stairs: S.seen[si] ? F.stairs : null, fallen: S.fallen.length,
		bag: S.bag.map((it) => ({ ...it })), stars: S.stars, belly: Math.ceil(S.belly / 10), owed: S.owed, thief: S.thief, recruits: S.recruits.map((r) => r.fig.species),
		items: S.items.filter((o) => S.seen[o.y * F.w + o.x]).map((o) => ({ x: o.x, y: o.y, id: o.id, ...(o.shop ? { price: o.price } : {}) })), traps: S.traps.filter((t) => t.seen).map((t) => ({ x: t.x, y: t.y, kind: t.kind })),
		units: S.units.filter((u) => u.hp > 0 && (u.side === 'p' || now.has(u.y * F.w + u.x))).map((u) => ({ uid: u.uid, side: u.side, species: u.species, level: u.level, x: u.x, y: u.y, dir: u.dir, hp: u.hp, maxHP: u.maxHP, sp: u.sp, maxSP: u.maxSP, status: u.status, nap: !!u.nap, tactic: u.tactic || null, keeper: !!u.keeper, hostile: !!u.hostile, boss: !!u.boss, shiny: !!(u.fig && u.fig.shiny) })) };
}
