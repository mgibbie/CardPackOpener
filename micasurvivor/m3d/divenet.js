// divenet.js — MicaSurvivor 3D, Dive part 16 (Plans/MICASURVIVOR_3D_PLAN.md §5.69): a Dive as a watcher sees it.
// net.js's frames carry the FIGHT (you, the foes, the shots, the events). A Dive has more that a watcher must have:
// which floor it is on (the watcher builds that floor itself, from the seed and the route), which secret pockets are
// open, which chests, the landmark, the lost Pokémon, the loot, the stall and the bushes, your League member's stage.
// That is the Dive's ROW (as expnet.js's is an Expedition's): small, whole numbers, sent with the frames.
//
// diveRow(S) makes it on the playing side; diveView(row, R, X, keep) turns it back, on a page that has only the 2D
// game's tables and this row, into what there is to draw and say. Nothing here simulates anything.
import { CELL } from './sim.js';
import { diveRoom } from './divegen.js';
import { chestsOf, ecoLayout } from './dive.js';
import { FRESH, USED, GONE } from './expeco.js';

const R = Math.round;
/** The Dive's row. */
export function diveRow(S) {
	const w = S.w, RR = S.R, ids = RR.F.ROUTE_IDS, boss = S.boss ? (S.boss.xk === 'guardian' ? 2 : 1) : 0;
	const row = { h: [S.seed, ids.indexOf(S.route), S.weekly ? S.weekly.week : -1, S.weekly ? S.weekly.mod : ''],
		z: [S.floor, R(S.bank), R(S.stake), (S.sealed ? 1 : 0) | (S.lm && S.lm.used ? 2 : 0) | (S.lm ? 4 : 0), boss, R(S.ropeT * 10), S.coins | 0, S.ended ? (S.escaped ? 2 : 1) : 0, S.escaped ? S.rescued.length : S.rescuedBank | 0, S.combo.n | 0, R(S.obeliskT || 0)] };
	if (S.plugsOpen) row.p = S.plugsOpen;
	let cm = 0; S.chests.forEach((c, i) => { if (c.open) cm |= 1 << i; }); if (cm) row.c = cm;
	const lo = S.stray; if (lo) row.s = [lo.dex, R(lo.x * 10), R(lo.z * 10), (lo.follow ? 1 : 0) | (lo.done ? 2 : 0)];
	const Z = S.eco && S.eco.z;
	if (Z) { const o = []; for (const q of Z.lay.objs) if (Z.st[q.i] !== FRESH) o.push(q.i, Z.st[q.i]); if (o.length) row.o = o; if (Z.spot >= 0) row.sp = Z.spot; }
	if (S.lg) row.l = [S.lg.member, S.lg.form, S.lg.kit, S.lg.mat, S.lg.mega || 0, S.lg.shiny ? 1 : 0];
	if (S.stage > 0) row.g = S.stage;   // (a guardian has fallen: the stage it saved. A guest keeps it in its own save, plan 3b)
	return row;
}
/** A row, read. R: rulesFrom(G); X: expFrom(G); keep: an object of the caller's, for the floor.
 *  -> { dive: true, seed, route, floor, weekly, room (the floor, built here and kept until the floor or its open pockets
 *  change), chests: [{ x, z, open }], lm: { kind, x, z, used } | null, stray: { dex, x, y, z, follow, done } | null,
 *  eco: [{ i, kind, x, y, z, st, ch }], bank, stake, coins, sealed, boss ('' | 'alpha' | 'guardian'), over ('' | 'lost' |
 *  'won'), league, hud(pos) -> the chips' line; and an Expedition view's fields the page reads, empty } */
export function diveView(row, RR, X, keep = {}) {
	const [seed, ri, week, mod] = row.h, route = RR.F.ROUTE_IDS[ri] || 'forest';
	const [floor, bank, stake, fl, boss, rope, coins, over, rescued, combo, obelisk] = row.z, plugs = row.p | 0;
	const key = seed + ':' + route + ':' + floor + ':' + plugs;
	if (keep.key !== key) {
		const open = []; for (let i = 0; i < 31; i++) if (plugs & (1 << i)) open.push(i);
		keep.key = key; keep.room = diveRoom(RR.F, seed, route, floor, { open });
		keep.room.zone = Math.min(3, 1 + Math.floor((floor - 1) / 10));
		keep.chests = chestsOf(keep.room);
		keep.lay = X && X.E ? ecoLayout({ R: RR, seed, route }, keep.room) : null;
	}
	const room = keep.room, cm = row.c | 0, chests = keep.chests.map((c, i) => ({ x: c.x, z: c.z, open: !!(cm & (1 << i)) }));
	const lmk = room.landmark, lm = lmk && (fl & 4) ? { kind: lmk.kind, x: lmk.at[0], z: lmk.at[2], used: !!(fl & 2) } : null;
	const stray = row.s ? { dex: row.s[0], x: row.s[1] / 10, y: 0, z: row.s[2] / 10, follow: !!(row.s[3] & 1), done: !!(row.s[3] & 2) } : null;
	const eco = [];
	if (keep.lay) {
		const st = new Map(); for (let k = 0; row.o && k < row.o.length; k += 2) st.set(row.o[k], row.o[k + 1]);
		for (const o of keep.lay.objs) { const s = st.get(o.i) || FRESH; if (s === USED || s === GONE || (o.kind === 'meowth' && row.sp !== o.i)) continue; eco.push({ i: o.i, kind: o.kind, x: o.x, y: o.y, z: o.z, st: s, ch: 0, v: o.v }); }
	}
	const hud = (pos) => {
		const st = room.stairs, m = pos ? Math.round(Math.hypot(pos.x - st[0], pos.z - st[2])) : 0;
		const parts = [`FLOOR ${floor}`, `${bank} secured · ${stake} at stake`, boss === 2 ? 'GUARDIAN' : boss === 1 ? 'ALPHA' : `STAIRS ${m} m`];
		if (rope > 0) parts.push('ROPE ' + Math.max(0, RR.K.ROPE_T - rope / 10).toFixed(1) + ' s');
		if (combo >= 2) parts.push('COMBO x' + combo);
		if (obelisk > 0) parts.push('OBELISK ' + obelisk + ' s');
		if (X && X.E) parts.push('₽ ' + coins);
		return parts.join(' · ');
	};
	return { dive: true, seed, route, floor, weekly: week >= 0 ? { week, mod } : null, room, chests, lm, stray, eco, bank, stake, coins, rescued, sealed: !!(fl & 1), boss: boss === 2 ? 'guardian' : boss === 1 ? 'alpha' : '',
		stage: row.g | 0,
		end: row.e ? { pay: row.e[0], kills: row.e[1], time: row.e[2], depth: row.e[3], won: !!row.e[4] } : null,
		over: over === 2 ? 'won' : over === 1 ? 'lost' : '', league: row.l ? { member: row.l[0], form: row.l[1], kit: row.l[2], mat: row.l[3], mega: row.l[4] || 0, shiny: !!row.l[5] } : null,
		zone: floor, sa: [], faint: [], cine: null, held: null, mateSa: new Map(), surv: null, hazards: [], night: 0, hud };
}
export const tileOf = (p) => [Math.floor(p[0] / CELL), Math.floor(p[2] / CELL)];
