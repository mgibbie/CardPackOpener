// mm/combat.js — Mystery Maze's bridge to the battle engine (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "The battle system
// is Poketactica's"). A hit in the maze IS a battle's hit: engine/battle.js resolves it (the user's status, accuracy with
// Speed and facing, the damage formula, the type chart, STAB, abilities, held items, weather, move levels, team attacks,
// secondary effects), given the maze's own geometry: 8 directions, walls, the corner rule (mm/shapes8.js).
//   - the board B is a battle-shaped state whose map is the floor (walls are no tile; every floor tile is level)
//   - a move costs PP and SP as in a battle; both must be there
//   - the plain ATTACK: weak, typeless, the tile in front, costs nothing: you are never helpless
// Pure: node-tested (overworld/tests/poketactica_mm_combat_test.mjs).
import { newBattle, useMoveAt, moveOf, heldBlock, RULES_REV } from '../engine/battle.js';
import { DIR8, DIR8_KEYS, dir8Toward, canStep8, isWall, hitTiles8, aimTiles8 } from './shapes8.js';

export const ATTACK_ID = 'attack';
/** The plain Attack (the original's "regular attack"): no type (neutral to everything, no STAB), the tile in front. */
export const ATTACK = Object.freeze({ id: ATTACK_ID, name: 'Attack', type: '???', category: 'Physical', power: 20, acc: 100, priority: 0, spCost: 0, s: 'one', n: 0, r: [1, 1], t: 'foe', h: 'melee',
	mv: Object.freeze({ name: 'Attack', type: '???', category: 'Physical', power: 20, acc: 100, pp: 0 }) });

/** The floor as a battle's map: a level tile wherever there is no wall. */
export const boardMap = (F) => ({ w: F.w, h: F.h, height: Array.from({ length: F.w * F.h }, (_, i) => ((F.terrain[i] & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } });
/** A battle-shaped state with no one on it yet (the run puts its units in). */
export function newBoard(seed, F, data) {
	return newBattle(String(seed), { map: boardMap(F), player: [], enemy: [], noBonus: true, rev: RULES_REV }, data);
}
/** Turn a unit to one of the 8 facings (the battle's `facing` follows: a hit from behind or the side lands more often). */
export function face(u, d) { u.dir = d; u.facing = DIR8_KEYS[d]; }

/** The maze's geometry for the battle's move resolution (engine/battle.js GRID's counterpart). canEnter(u, x, y): the run's ground rule. */
export function mazeGeo(F, canEnter) {
	return {
		face: (u, x, y) => { face(u, dir8Toward(u.x, u.y, x, y)); return u.facing; },
		vec: (u, x, y) => DIR8[dir8Toward(u.x, u.y, x, y)],
		open: (S, x, y) => !isWall(F, x, y),
		step: (S, u, x0, y0, x1, y1) => { const d = DIR8.findIndex(([dx, dy]) => dx === x1 - x0 && dy === y1 - y0); return d >= 0 && canStep8(F, x0, y0, d) && canEnter(u, x1, y1); },
		around: (S, u, x, y) => DIR8.map(([dx, dy]) => [x + dx, y + dy]).filter(([ax, ay]) => canEnter(u, ax, ay)),
		tiles: (S, m, u, x, y) => hitTiles8(F, m, u.x, u.y, x, y),
	};
}

/** A unit's move as the battle sees it (its shape at the move's level), or the plain Attack. */
export const moveFor = (u, id, data) => (id === ATTACK_ID ? ATTACK : moveOf(u, id, data));
/** Where this unit could aim a move from where it stands. -> [[x, y], ...] */
export const aimsOf = (F, u, m) => aimTiles8(F, m, u.x, u.y);
/** Why a unit can't use this move at this tile now, or null. */
export function moveBlock(B, F, u, id, x, y, data) {
	const m = moveFor(u, id, data);
	if (!m) return 'no such move';
	if (id !== ATTACK_ID) {
		if (!u.fig.equipped.includes(id)) return 'not equipped';
		if ((u.pp[id] || 0) < 1) return 'no PP left';
		const hb = heldBlock(u, id, data);
		if (hb) return hb;
		if (u.sp < m.spCost) return 'not enough SP';
	}
	if (!aimsOf(F, u, m).some(([ax, ay]) => ax === x && ay === y)) return 'out of reach';
	return null;
}
/**
 * Use a move (already allowed: moveBlock). Charges its PP and SP, resolves it by the battle's rules on the maze's
 * geometry. -> the battle's events (use, hit, miss, ko, status, boost, ...)
 */
export function useMove(B, G, u, id, x, y, data) {
	if (id === ATTACK_ID) return useMoveAt(B, u, { custom: ATTACK, x, y }, data, G);
	const m = moveOf(u, id, data);
	u.pp[id]--; u.sp -= m.spCost;
	if (u.pp[id] === 0 && u.held && u.held.ppRestore && !u.heldUsed) { u.pp[id] += u.held.ppRestore; u.heldUsed = true; }   // (a Leppa Berry, as in a battle)
	return useMoveAt(B, u, { move: id, x, y }, data, G);
}
