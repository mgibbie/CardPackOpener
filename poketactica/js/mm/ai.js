// mm/ai.js — Mystery Maze: what wild Pokémon and your partners do with a turn (the original's order, Plans/
// PMD_SYSTEMS_SPEC.md section 4): ATTACK if something is in reach, otherwise MOVE.
//   - choosing an attack: one roll over its usable moves (20 each) and the plain Attack (weighted by how many moves it
//     has: 100 with none, then 20 / 30 / 40 / 50). A move with no target is NOT re-rolled: the plain Attack if a foe is
//     next to it, else it moves.
//   - sight: its room and the ring round it, or 2 tiles in a corridor
//   - a wild Pokémon chases the nearest foe it sees, greedily (straight at it, sidestepping 45 then 90 degrees; no path
//     finding), goes to where it last saw one, and otherwise patrols: a random exit of its room, then along the corridor
//   - a partner follows its tactic: follow (stay with the leader), hunt (go for foes it sees), away (keep clear of them),
//     wait (stand still). All of them attack what comes into reach.
// aiTurn(S, u, data, T) -> 'acted' | 'idle' | 'blocked' (a partner with only an ally in its way: it gets another go).
// T is the run's toolkit (mm/turn.js AI). Pure: node-tested (overworld/tests/poketactica_mm_combat_test.mjs).
import { DIR8, cheb, dir8Toward, sightTiles, hitTiles8 } from './shapes8.js';
import { T_JUNCTION, NO_ROOM } from './gen.js';
import { moveFor, aimsOf, ATTACK_ID } from './combat.js';
import { heldBlock } from '../engine/battle.js';
import { effectiveness } from '../../../overworld/rules/tables.js';

export const AI_MOVE_WEIGHT = 20, AI_ATTACK_WEIGHTS = Object.freeze([100, 20, 30, 40, 50]);
export const AI_HELP_CHANCE = 25;   // % that a move on itself or an ally is worth the turn when its roll comes up
const SIDESTEPS = [0, -1, 1, -2, 2];

/** Is o someone u would fight? The other side, alive; a shopkeeper only once it has turned on you. */
export const isFoe = (u, o) => o.hp > 0 && o.side !== u.side && !(o.keeper && !o.hostile);
/** The foes this unit sees from where it stands. */
export function foesInSight(S, u) {
	const F = S.F, see = new Set(sightTiles(F, u.x, u.y, 2).map(([x, y]) => y * F.w + x));
	return S.units.filter((o) => isFoe(u, o) && see.has(o.y * F.w + o.x));
}
const helps = (m) => m.t === 'ally' || m.t === 'self' || m.s === 'self' || (m.s === 'aura' && m.t !== 'foe');
/** The aim tiles from which this move would reach a foe (a dash: the first Pokémon in its way must be one). */
export function aimsAtFoes(S, u, m) {
	const F = S.F, out = [];
	for (const [ax, ay] of aimsOf(F, u, m)) {
		const tiles = hitTiles8(F, m, u.x, u.y, ax, ay);
		const hit = m.s === 'dash' ? tiles.map(([x, y]) => S.units.find((o) => o.hp > 0 && o.x === x && o.y === y)).find(Boolean) : null;
		if (m.s === 'dash' ? hit && isFoe(u, hit) : tiles.some(([x, y]) => S.units.some((o) => isFoe(u, o) && o.x === x && o.y === y))) out.push([ax, ay]);
	}
	return out;
}

/**
 * PARTNERS THAT THINK (rules 17; improvement plan, 2026-11-25). A partner used to pick its move by one plain roll, as a
 * wild Pokémon does, so it spent its strongest move on a foe with a sliver of HP left and its PP ran dry. Now:
 *   - a foe next to it that is NEARLY BEATEN (a quarter of its HP or less) gets the plain Attack: free, and enough
 *   - otherwise the move worth most against what it would hit: power x type matchup, summed over the foes in its area,
 *     never one its target is immune to; a tie goes to the move listed first
 *   - its ORDER for moves (u.plan): 'any' as above; 'save' keeps PP for when the plain Attack cannot reach, or for a boss;
 *     'attack' uses the plain Attack only. A move switched off (u.off) is never chosen.
 *   - a move on itself or an ally keeps its old odds (a quarter of the turns it could)
 * Only that last roll is chance. Wild Pokémon choose as they always did.
 */
export const NEARLY_BEATEN = 0.25;
export const MOVE_PLANS = Object.freeze(['any', 'save', 'attack']);
function partnerAttack(S, u, data, T) {
	const F = S.F, plan = MOVE_PLANS.includes(u.plan) ? u.plan : 'any', off = u.off || [];
	const foeAt = (x, y) => S.units.find((o) => isFoe(u, o) && o.x === x && o.y === y) || null;
	const worth = (m, v) => (m.power || 40) * effectiveness(m.type, v.types || []);
	const basic = moveFor(u, ATTACK_ID, data), near = aimsAtFoes(S, u, basic).map(([x, y]) => foeAt(x, y)).filter(Boolean);
	const hitBasic = (v) => { T.setDir(u, dir8Toward(u.x, u.y, v.x, v.y)); T.strikeAt(S, u, ATTACK_ID, v.x, v.y, data); return true; };
	const weakest = (list) => list.reduce((a, b) => (b.hp < a.hp ? b : a));
	// one that is nearly beaten, right beside it: the free Attack finishes it
	const low = near.filter((v) => v.hp <= v.maxHP * NEARLY_BEATEN);
	if (low.length) return hitBasic(weakest(low));
	const usable = plan === 'attack' ? [] : u.fig.equipped.filter((id) => { const m = moveFor(u, id, data); return m && !off.includes(id) && (u.pp[id] || 0) > 0 && u.sp >= m.spCost && !(u.sealed || []).includes(id) && !heldBlock(u, id, data); });
	// a move on itself or an ally: a quarter of the turns it could (as before)
	const help = usable.filter((id) => helps(moveFor(u, id, data)));
	if (help.length && T.roll(S, 100) < AI_HELP_CHANCE) {
		const id = help[0], m = moveFor(u, id, data), self = aimsOf(F, u, m).find(([x, y]) => x === u.x && y === u.y);
		if (self) { T.strikeAt(S, u, id, self[0], self[1], data); return true; }
	}
	// the attacking move worth most against what it would hit
	let best = null;
	for (const id of usable) {
		const m = moveFor(u, id, data);
		if (helps(m)) continue;
		for (const [ax, ay] of aimsAtFoes(S, u, m)) {
			const tiles = hitTiles8(F, m, u.x, u.y, ax, ay);
			const hit = m.s === 'dash' ? [tiles.map(([x, y]) => S.units.find((o) => o.hp > 0 && o.x === x && o.y === y)).find(Boolean)].filter((o) => o && isFoe(u, o)) : tiles.map(([x, y]) => foeAt(x, y)).filter(Boolean);
			const score = hit.reduce((a, v) => a + worth(m, v), 0), boss = hit.some((v) => v.boss);
			if (score > 0 && (!best || score > best.score)) best = { id, ax, ay, score, boss };
		}
	}
	// saving PP: the plain Attack while a foe is in its reach, unless a boss is in the move's
	if (best && plan === 'save' && near.length && !best.boss) best = null;
	if (best) { T.strikeAt(S, u, best.id, best.ax, best.ay, data); return true; }
	return near.length ? hitBasic(weakest(near)) : false;
}
/** A tile a thinking partner would rather not step on: a trap that is showing. */
const shuns = (S, u, x, y, T) => u.side === 'p' && !!T.trapSeen && T.trapSeen(S, x, y);

export function aiTurn(S, u, data, T) {
	const foes = foesInSight(S, u);
	if (foes.length && (u.side === 'p' && S.rev >= 17 ? partnerAttack(S, u, data, T) : attack(S, u, data, T))) return 'acted';
	if (u.side === 'p') {
		if (u.tactic === 'wait') return 'idle';
		if (foes.length && u.tactic === 'away') return keepAway(S, u, nearest(u, foes), T) ? 'acted' : 'idle';
		if (foes.length && u.tactic === 'hunt') { const f = nearest(u, foes); return chase(S, u, f.x, f.y, T) ? 'acted' : 'idle'; }
		return T.follow(S, u) ? 'acted' : 'blocked';
	}
	return wildMove(S, u, foes, T) ? 'acted' : 'idle';
}
const nearest = (u, list) => list.reduce((a, b) => (cheb(u.x, u.y, b.x, b.y) < cheb(u.x, u.y, a.x, a.y) ? b : a));

function attack(S, u, data, T) {
	const usable = u.fig.equipped.filter((id) => { const m = moveFor(u, id, data); return m && (u.pp[id] || 0) > 0 && u.sp >= m.spCost && !(u.sealed || []).includes(id) && !heldBlock(u, id, data); });
	const slots = usable.map((id) => [id, AI_MOVE_WEIGHT]);
	slots.push([ATTACK_ID, AI_ATTACK_WEIGHTS[Math.min(4, usable.length)]]);
	const r = T.roll(S, slots.reduce((a, s) => a + s[1], 0));
	let run = 0, pick = ATTACK_ID;
	for (const [id, w] of slots) { run += w; if (run >= r) { pick = id; break; } }
	if (pick !== ATTACK_ID) {
		const m = moveFor(u, pick, data);
		const aims = helps(m) ? (T.roll(S, 100) < AI_HELP_CHANCE ? aimsOf(S.F, u, m).filter(([x, y]) => x === u.x && y === u.y) : []) : aimsAtFoes(S, u, m);
		if (aims.length) { const a = aims[T.roll(S, aims.length)]; T.strikeAt(S, u, pick, a[0], a[1], data); return true; }
	}
	const near = aimsAtFoes(S, u, moveFor(u, ATTACK_ID, data));
	if (!near.length) return false;
	const a = near[T.roll(S, near.length)];
	T.setDir(u, dir8Toward(u.x, u.y, a[0], a[1]));
	T.strikeAt(S, u, ATTACK_ID, a[0], a[1], data);
	return true;
}

/** One greedy step toward a tile: straight at it, else 45 degrees to either side, else 90. -> did it step */
function chase(S, u, tx, ty, T) {
	if (u.x === tx && u.y === ty) return false;
	const d0 = dir8Toward(u.x, u.y, tx, ty);
	// (a thinking partner goes round a trap that is showing; across it only when there is no other step)
	for (const pass of [0, 1]) for (const turn of SIDESTEPS) {
		const d = (d0 + turn + 8) % 8, x = u.x + DIR8[d][0], y = u.y + DIR8[d][1];
		if (!T.canWalk(S.F, u, d) || T.unitAt(S, x, y)) continue;
		if (pass === 0 && shuns(S, u, x, y, T)) continue;
		T.stepTo(S, u, x, y, d);
		return true;
	}
	return false;
}
/** One step that puts the most ground between it and a foe. */
function keepAway(S, u, f, T) {
	let best = -1, far = cheb(u.x, u.y, f.x, f.y) * 10 + Math.abs(u.x - f.x) + Math.abs(u.y - f.y);
	for (let d = 0; d < 8; d++) {
		const x = u.x + DIR8[d][0], y = u.y + DIR8[d][1];
		if (!T.canWalk(S.F, u, d) || T.unitAt(S, x, y) || shuns(S, u, x, y, T)) continue;
		const v = cheb(x, y, f.x, f.y) * 10 + Math.abs(x - f.x) + Math.abs(y - f.y);
		if (v > far) { far = v; best = d; }
	}
	if (best < 0) return false;
	T.stepTo(S, u, u.x + DIR8[best][0], u.y + DIR8[best][1], best);
	return true;
}

function wildMove(S, u, foes, T) {
	const F = S.F;
	if (foes.length) { const f = nearest(u, foes); u.goal = [f.x, f.y]; return chase(S, u, f.x, f.y, T); }
	if (u.post) { u.goal = null; return chase(S, u, u.post[0], u.post[1], T); }   // (a boss: back to the stairs it guards)
	if (u.goal) {
		if ((u.goal[0] !== u.x || u.goal[1] !== u.y) && chase(S, u, u.goal[0], u.goal[1], T)) return true;
		u.goal = null;
	}
	const here = u.y * F.w + u.x, room = F.room[here];
	const forward = () => {   // (along a corridor: ahead if it can, turning as little as it must, back only from a dead end)
		for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
			const d = (u.dir + turn + 8) % 8, x = u.x + DIR8[d][0], y = u.y + DIR8[d][1];
			if (!T.canWalk(F, u, d) || T.unitAt(S, x, y)) continue;
			T.stepTo(S, u, x, y, d);
			return true;
		}
		return false;
	};
	if (room === NO_ROOM) return forward();
	if (F.terrain[here] & T_JUNCTION) {   // (on a doorway: out into the corridor)
		for (const d of [0, 2, 4, 6]) {
			const x = u.x + DIR8[d][0], y = u.y + DIR8[d][1];
			if (F.room[y * F.w + x] !== NO_ROOM || !T.canWalk(F, u, d) || T.unitAt(S, x, y)) continue;
			T.stepTo(S, u, x, y, d);
			return true;
		}
	}
	const exits = [];
	for (let i = 0; i < F.room.length; i++) if (F.room[i] === room && (F.terrain[i] & T_JUNCTION) && i !== here) exits.push(i);
	if (!exits.length) { const d = T.roll(S, 8), x = u.x + DIR8[d][0], y = u.y + DIR8[d][1]; if (T.canWalk(F, u, d) && !T.unitAt(S, x, y)) { T.stepTo(S, u, x, y, d); return true; } return false; }
	const e = exits[T.roll(S, exits.length)];
	u.goal = [e % F.w, (e / F.w) | 0];
	return chase(S, u, u.goal[0], u.goal[1], T);
}
