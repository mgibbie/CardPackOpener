// ai.js — Poketactica's enemy phase (stage 3a). Disgaea's patterns (research §8): a unit's `ai` is
//   'aggro'    moves and attacks every turn
//   'passive'  waits until a player figurine comes within its Move + 3 tiles, then turns aggro (pull them a few at a time)
//   'hold'     never moves (a boss on its throne); attacks what it can reach from where it stands
// Each enemy acts alone in its turn: it tries every tile it can reach x every equipped move it can pay for x every aim,
// scores the expected damage to the player's figurines (the overworld's AI idea: damage as a share of HP, a KO is worth
// most, hitting its own side costs), and takes the best. With nothing to hit it walks toward the nearest figurine.
// Deterministic: no randomness (ties go to the first found).
import { shapeTiles, manhattan, key } from './grid.js';
import { effectiveness } from '../../../overworld/rules/tables.js';

export const WAKE_EXTRA = 3;

export function enemyTurn(S, e, data, api) {
	// avoid a circular import: battle.js passes its own helpers in
	const { moveTiles, moveOf, aimTiles, unitAt, onMap } = api;
	const { enemyAct } = api.battle || {};
	const targets = onMap(S, 'p');
	if (!targets.length) return;
	if (e.ai === 'passive') {
		const near = targets.some((t) => manhattan(t.x, t.y, e.x, e.y) <= e.move + WAKE_EXTRA);
		if (!near) return;
		e.ai = 'aggro';
	}
	const origin = { x: e.x, y: e.y };
	const spots = e.ai === 'hold' ? [[e.x, e.y]] : [...moveTiles(S, e).values()].map((t) => [t.x, t.y]);
	let best = null;
	for (const [sx, sy] of spots) {
		e.x = sx; e.y = sy;   // (try the spot; restored below)
		for (const mid of e.fig.equipped) {
			const m = moveOf(e, mid, data);
			if (!m || (e.pp[mid] || 0) < 1 || e.sp < m.spCost) continue;
			for (const [ax, ay] of aimTiles(S, e, m)) {
				const score = scoreAim(S, e, m, sx, sy, ax, ay, unitAt);
				if (score > 0 && (!best || score > best.score)) best = { score, sx, sy, mid, ax, ay };
			}
		}
	}
	e.x = origin.x; e.y = origin.y;
	const doMove = (x, y) => api.act(S, e, { t: 'move', x, y }, data);
	if (best) {
		if (best.sx !== e.x || best.sy !== e.y) doMove(best.sx, best.sy);
		api.act(S, e, { t: 'attack', move: best.mid, x: best.ax, y: best.ay }, data);
		return;
	}
	if (e.ai === 'hold') return;
	// nothing to hit: walk toward the nearest figurine
	let go = null;
	for (const [sx, sy] of spots) {
		const d = Math.min(...targets.map((t) => manhattan(t.x, t.y, sx, sy)));
		if (!go || d < go.d) go = { d, sx, sy };
	}
	if (go && (go.sx !== e.x || go.sy !== e.y)) doMove(go.sx, go.sy);
}

/** Expected value of an aim: each victim's share of HP the hit would take (a KO counts double), the own side's counted against. */
function scoreAim(S, e, m, sx, sy, ax, ay, unitAt) {
	const tiles = shapeTiles(S.map, m, sx, sy, ax, ay);
	let score = 0;
	for (const [x, y] of tiles) {
		const v = unitAt(S, x, y);
		if (!v || v === e) continue;
		if (m.category === 'Status') { if (v.side !== e.side && !v.status) score += 10; continue; }
		const eff = effectiveness(m.type, v.types);
		const phys = m.category === 'Physical';
		const A = phys ? e.stats.atk : e.stats.spa, D = phys ? v.stats.def : v.stats.spd;
		const est = (Math.floor((2 * e.level / 5 + 2) * (m.power || 40) * A / D / 50) + 2) * eff * (e.types.includes(m.type) ? 1.5 : 1);
		const share = Math.min(1, est / Math.max(1, v.hp));
		const val = 100 * share * (est >= v.hp ? 2 : 1);
		score += v.side === e.side ? -1.5 * val : val;
	}
	return score;
}
