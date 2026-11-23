// td/rewards.js — what a Tower Defense run pays (owner, 2026-11-23). Pure.
//   - stars for the waves cleared, at TD_STAR_RATE of the Dungeon's per-floor scale: a wave takes seconds where a Dungeon
//     floor takes minutes (and the game runs at up to 3×), so the same number per wave would pay many times a Dungeon's
//   - EXP and move XP to the figurines that earned them, at TD_EXP_RATE (owner: "a reduced rate": towers can't be lost)
//   - the map's best wave (the collection's `td` record); a cleared boss wave is a checkpoint new runs may start after
import { BOSS_EVERY, TD_EXP_RATE } from './sim.js';
import { gainExp, gainMoveXp } from '../figurine.js';
import { evolvesByLevelNow } from '../evolve.js';

export const TD_STAR_RATE = 0.25;   // TUNE (with the auto-player)
/** The waves a new run may start from: 1, and the wave after each boss wave cleared before. */
export const startWaves = (best) => { const out = [1]; for (let w = BOSS_EVERY; w <= (best | 0); w += BOSS_EVERY) out.push(w + 1); return out; };

/** A finished (or retired) run -> { wave, stars, exp: { figIdx: n }, moveXp: { figIdx: { moveId: n } } } */
export function tdRewards(S) {
	const exp = {}, moveXp = {};
	for (const [uid, n] of Object.entries(S.B.exp || {})) { const i = +String(uid).slice(1); const v = Math.floor(n * TD_EXP_RATE); if (v > 0) exp[i] = (exp[i] || 0) + v; }
	for (const [k, n] of Object.entries(S.B.xp || {})) { const [uid, mid] = k.split(':'), i = +uid.slice(1), v = Math.floor(n * TD_EXP_RATE); if (v > 0) (moveXp[i] = moveXp[i] || {})[mid] = v; }
	return { wave: S.cleared, stars: Math.floor(S.stars * TD_STAR_RATE), exp, moveXp };
}

/**
 * The rewards onto the collection. squadIds: the run's figurine ids, in squad order.
 * -> { col, report: { wave, best, record (a new best), stars, units (as the battle results' units: EXP bars, level-ups, new moves) } }
 */
export function applyTdRewards(col, squadIds, r, mapId, data) {
	const figs = { ...col.figs }, units = [];
	squadIds.forEach((id, i) => {
		const a = col.figs[id];
		if (!a) return;
		let b = a, newMoves = [];
		if (r.exp[i]) { const g = gainExp(b, r.exp[i], data); b = g.fig; newMoves = g.newMoves; }
		for (const [mid, n] of Object.entries(r.moveXp[i] || {})) b = gainMoveXp(b, mid, n);
		if (b === a) return;
		figs[id] = b;
		units.push({ uid: 't' + i, id, species: b.species, from: a.level, to: b.level, expFrom: a.exp || 0, expTo: b.exp || 0, gained: Math.max(0, (b.exp || 0) - (a.exp || 0)), newMoves, evolve: evolvesByLevelNow(b, data),
			moves: b.pool.map((p) => { const q = a.pool.find((x) => x.id === p.id); return q && p.xp > q.xp ? { id: p.id, xp: p.xp - q.xp, from: q.lv, to: p.lv } : null; }).filter(Boolean) });
	});
	const before = (col.td && col.td[mapId]) || 0, best = Math.max(before, r.wave | 0);
	const out = { ...col, figs };
	if (best > 0) out.td = { ...(col.td || {}), [mapId]: best };
	return { col: out, report: { wave: r.wave, best, record: best > before, stars: r.stars, units } };
}
