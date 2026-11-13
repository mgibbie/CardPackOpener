// expnet.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run as a watcher and a replay see it.
// net.js's frames carry the FIGHT (you, the enemies, the shots, the events). A run has more that a watcher must have:
// which zone it is in (the watcher builds that level itself, from the seed), the altar's phase and charge, the money,
// what the zone's things are doing, who has fainted, the ball in the air, your team, the stage you have evolved into.
// That is the run's ROW: small, made of whole numbers, and sent only when it changes (net.js keeps the last one).
//
// runRow(S) makes it on the playing side; rowView(row, X, keep) turns it back, on a page that has only the 2D game's
// tables and this row, into what there is to draw and say. Nothing here simulates anything.
import { CELL } from './sim.js';
import { zoneRoom } from './expedition.js';
import { hazardsOf } from './expsurv.js';
import { layoutOf, FRESH, USED, GONE, READY, ACTIVE } from './expeco.js';

const R = Math.round, KIND = { alpha: 1, shiny: 8 }, KIND_OF = { 1: 'alpha', 8: 'shiny' };
/** The run's row. */
export function runRow(S) {
	const w = S.w, X = S.X, row = { h: [S.seed, X.MAP_IDS.indexOf(S.map), X.DIFFS.indexOf(S.diff)], z: [S.zone, S.ph, R(S.charge * 100), S.fs ? 1 : 0, S.coins | 0, R(w.t - S.zs), S.ended ? (S.won ? 2 : 1) : 0] };
	if (S.boss) row.b = [S.boss.dex, R((S.boss.takenK || 0) * 10)];
	const Z = S.eco && S.eco.z;
	if (Z) { const o = []; for (const q of Z.lay.objs) if (Z.st[q.i] !== FRESH || Z.ch[q.i] > 0) o.push(q.i, Z.st[q.i], R(Z.ch[q.i] * 100)); row.o = o; if (Z.spot >= 0) row.sp = Z.spot; }
	const C = S.cap;
	if (C && (C.sa.length || C.faint.length || C.cine)) {
		row.c = { s: C.sa.map((a) => a.dex) };
		if (C.faint.length) row.c.f = C.faint.flatMap((f) => [KIND[f.kind] || 1, f.dex, R(f.x * 10), R(f.y * 10), R(f.z * 10)]);
		if (C.cine) row.c.k = [KIND[C.cine.kind] || 1, C.cine.dex, R(C.cine.x * 10), R(C.cine.y * 10), R(C.cine.z * 10), R(C.cine.t * 20)];
	}
	for (const m of w.mates) { if (m.inbox) for (let i = m.inbox.length - 1; i >= 0; i--) if (m.inbox[i][0] === 'xsa') { m.sa = String(m.inbox[i][1] || '').split(',').filter(Boolean).map(Number); m.inbox.splice(i, 1); } }
	const g = w.mates.filter((m) => m.sa && m.sa.length).map((m) => [m.id, ...m.sa]); if (g.length) row.g = g;   // (co-op: each guest's Support Alphas, for the other screens)
	if (S.lg) row.l = S.lg.shiny ? [S.lg.member, S.lg.form, S.lg.kit, S.lg.mat, S.lg.mega || 0, 1] : S.lg.mega ? [S.lg.member, S.lg.form, S.lg.kit, S.lg.mat, S.lg.mega] : [S.lg.member, S.lg.form, S.lg.kit, S.lg.mat];   // (the 5th: the Mega it has become, for its look)
	if (S.held) row.i = S.held;
	if (S.surv && S.sv) row.s = [S.sv.land, S.sv.miles, S.sv.downs, S.sv.legends, S.ph === 2 ? Math.max(0, Math.ceil(S.sv.portalUntil - w.t)) : 0, R(w.t), S.sv.siege.on || S.sv.siege.k < 1 ? R(S.sv.siege.k * 100) : 0, S.sv.pacts.length];   // (Survival: the land, the milestones, the portal, the run's clock, the siege)
	return row;
}
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** A row, read: { seed, map, diff, zone, ph, charge, fs, coins, zt, over ('' | 'lost' | 'won'), room (the zone's level,
 *  built here and kept in `keep` until the zone changes), boss, eco: [{ i, kind, x, y, z, st, ch }], sa: [dex],
 *  faint: [{ kind, dex, x, y, z }], cine, league: { member, form, kit, mat, mega, shiny } | null, held, hud(pos) -> the readout's line }.
 *  X: expFrom(G). keep: an object of the caller's, for the level. */
export function rowView(row, X, keep = {}) {
	const [seed, mi, di] = row.h, map = X.MAP_IDS[mi] || 'viridian', diff = X.DIFFS[di] || 'normal', [zone, ph, ch, fs, coins, zt, over] = row.z;
	const sv = row.s ? { land: row.s[0], miles: row.s[1], downs: row.s[2], legends: row.s[3], portal: row.s[4], t: row.s[5], siege: row.s[6] / 100, pacts: row.s[7] } : null;
	const key = seed + ':' + map + ':' + zone + ':' + (sv ? sv.land : 0);
	if (keep.key !== key) { keep.key = key; keep.room = zoneRoom(seed, map, zone, X, sv ? sv.land : 0); keep.lay = X.E ? layoutOf(keep.room, { seed, X, map, zone }) : null; }
	const room = keep.room, eco = [];
	if (keep.lay && row.o) {
		const st = new Map(); for (let k = 0; k < row.o.length; k += 3) st.set(row.o[k], [row.o[k + 1], row.o[k + 2] / 100]);
		for (const o of keep.lay.objs) {
			const [s, c] = st.get(o.i) || [FRESH, 0];
			if (s === USED || s === GONE || (o.kind === 'meowth' && row.sp !== o.i) || (o.kind === 'comet' && s !== READY && s !== ACTIVE)) continue;
			eco.push({ i: o.i, kind: o.kind === 'challenge' && s === READY ? 'great' : o.kind, x: o.x, y: o.y, z: o.z, st: s, ch: c });
		}
	}
	const c = row.c || {}, faint = [];
	for (let k = 0; c.f && k < c.f.length; k += 5) faint.push({ kind: KIND_OF[c.f[k]] || 'alpha', dex: c.f[k + 1], x: c.f[k + 2] / 10, y: c.f[k + 3] / 10, z: c.f[k + 4] / 10 });
	const cine = c.k ? { kind: KIND_OF[c.k[0]] || 'alpha', dex: c.k[1], x: c.k[2] / 10, y: c.k[3] / 10, z: c.k[4] / 10, t: c.k[5] / 20, phase: X.C ? X.C.phase(c.k[5] / 20) : { n: 'shake', u: 0, k: 0 } } : null;
	const boss = row.b ? { dex: row.b[0], exhausted: row.b[1] / 10 } : null;
	const V = X.V, hazards = sv && V ? hazardsOf(room, { seed, X }).filter((o) => o.phase <= V.phaseOf(sv.t)) : [];
	const survHud = () => {   // (Survival's line, as expsurv.js's own, from what the row says)
		const parts = ['SURVIVAL', `PHASE ${V.phaseOf(sv.t) + 1}`]; if (diff !== 'normal') parts.push(diff.toUpperCase());
		const m = V.milestone(sv.miles + 1, map, seed), left = mmss(m.at - sv.t);
		parts.push(m.mewtwo ? `MEWTWO IN ${left}` : m.legend ? `LEGENDARY IN ${left}` : `BOSS IN ${left}`);
		if (sv.portal > 0) parts.push(`PORTAL ${sv.portal} s`);
		const n = V.nightOf(sv.t), wk = V.woundK(sv.t);
		if (n.hp > 1) parts.push('NIGHT ×' + n.hp.toFixed(1)); else if (wk < 1) parts.push(`WOUNDS −${Math.round((1 - wk) * 100)}%`);
		if (sv.siege > 0) parts.push(`SIEGE · DAMAGE ${Math.round(sv.siege * 100)}%`);
		if (boss && boss.exhausted > 1) parts.push('EXHAUSTED ×' + boss.exhausted.toFixed(1));
		if (X.E) parts.push('₽ ' + coins);
		return parts.join(' · ');
	};
	const hud = (pos) => {
		if (sv && V) return survHud();
		const a = room.altar, m = pos ? Math.round(Math.hypot(pos.x - a[0], pos.z - a[2])) : 0, parts = [zone === 4 ? 'SHRINE' : `ZONE ${zone}/3`];
		if (diff !== 'normal') parts.push(diff.toUpperCase());
		if (zone <= 3 && ph < 2) parts.push(fs ? 'FINAL SWARM!' : 'FINAL SWARM IN ' + mmss(X.K.FINAL - zt));
		parts.push(ph === 0 ? `ALTAR ${m} m` : ph === 1 ? 'GUARDIAN' : ph === 2 ? `PORTAL ${m} m` : ph === 3 ? 'LEGENDARY' : 'COMPLETE!');
		if (boss && boss.exhausted > 1) parts.push('EXHAUSTED ×' + boss.exhausted.toFixed(1));
		if (X.E) parts.push('₽ ' + coins);
		return parts.join(' · ') + (ph === 0 ? ` · charge ${ch} %` : '');
	};
	return { seed, map, diff, zone, ph, charge: ch / 100, fs: !!fs, coins, zt, over: over === 2 ? 'won' : over === 1 ? 'lost' : '', room, boss, eco, sa: c.s || [], faint, cine,
		end: row.e ? { pay: row.e[0], kills: row.e[1], time: row.e[2], depth: row.e[3], won: !!row.e[4], board: row.e.length > 8 ? { score: row.e[5], dmg: row.e[6], bosses: row.e[7], catches: row.e[8], kills: row.e[9], time: row.e[10], zone: row.e[11] } : null, replay: row.e[12] } : null,   /* (the run's end, as its host kept it: a guest keeps the same) */
		league: row.l ? { member: row.l[0], form: row.l[1], kit: row.l[2], mat: row.l[3], mega: row.l[4] || 0, shiny: !!row.l[5] } : null, held: row.i || null, mateSa: new Map((row.g || []).map((r) => [r[0], r.slice(1)])), surv: sv, hazards, night: sv && V ? V.nightOf(sv.t).dark : 0, hud };
}
/** Where a watcher draws Support Alpha i of n: behind the player it sees, fanned out (the playing side's own are a
 *  little livelier: they lag and catch up; a watcher's stand in their places). */
export function teamSpot(pos, facing, i, n, d = 70 * CELL / 32) {
	const back = facing + Math.PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
	return [pos.x + Math.sin(back) * d, pos.z + Math.cos(back) * d];
}
