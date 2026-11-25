// mm/rewards.js — what a Mystery Maze run leaves behind (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md; owner: "if the party is
// wiped out, everything from the run is lost"; "a storage (200 items) filled by what you carry out").
//   CLEARED or ESCAPED (an Escape Marble): you keep everything: the stars in the purse, the bag (into the storage), the
//     recruits (they become real figurines), and a cleared dungeon pays its prize (more the first time) and opens the next
//   GAVE UP, or the PARTY FELL: the stars, the bag and the recruits are lost
//   either way: the figurines still standing keep the EXP and move XP they earned, and the fallen stay gone (they were
//     buried the moment they fell); the deepest floor reached is a record
// In a Lv 5 dungeon the EXP earned inside goes to the real figurine at its own level.
// Pure: node-tested (overworld/tests/poketactica_mm_dungeons_test.mjs).
import { gainExp, gainMoveXp } from '../figurine.js';
import { addFig, addGood, cleanMm, mmStoreAdd, mmStoreSize, MM_STORE_MAX } from '../figcol.js';
import { ATTACK_ID } from './combat.js';
import { ITEMS } from './items.js';

/** A finished run, read: { kept, won, escaped, floor, stars, items: [item id], recruits: [figurine], exp: { figurine id: n }, moveXp: { figurine id: { move: n } }, fallen: [figurine id], kills } */
export function mmOutcome(S) {
	const o = S.over || {}, kept = !!(o.won || o.escaped);
	const exp = {}, moveXp = {};
	for (const u of S.units) {
		if (u.side !== 'p' || u.hp <= 0 || !u.fig.id || S.recruits.some((r) => r.uid === u.uid)) continue;
		if (S.exp[u.uid]) exp[u.fig.id] = S.exp[u.uid];
		for (const [k, n] of Object.entries(S.B.xp || {})) { const [uid, move] = k.split(':'); if (uid === u.uid && move !== ATTACK_ID && n > 0) (moveXp[u.fig.id] = moveXp[u.fig.id] || {})[move] = n; }
	}
	// (a find, a held item of the camp's, goes to your items; everything else to the maze's storage)
	const items = [], goods = [];
	if (kept) for (const it of S.bag) if (!it.unpaid && ITEMS[it.id] && ITEMS[it.id].group !== 'key') for (let k = 0; k < (it.n || 1); k++) (ITEMS[it.id].group === 'good' ? goods : items).push(it.id);
	return { kept, goods, won: !!o.won, escaped: !!o.escaped, quit: !!o.quit, floor: S.floorNo, stars: kept ? S.stars : 0, carried: S.stars0 | 0, items, recruits: kept ? S.recruits.map((r) => r.fig) : [],
		exp, moveXp, fallen: S.fallen.map((f) => f.id).filter(Boolean), kills: S.kills | 0 };
}
/** The stars a cleared dungeon pays: its first-clear prize, or the smaller one after. */
export const clearPrize = (dungeon, timesCleared) => (!dungeon.reward ? 0 : timesCleared > 0 ? dungeon.reward.again | 0 : dungeon.reward.first | 0);

/**
 * Apply a run's outcome to the collection. tail: a fresh random string (the page's) for the new ids.
 * -> { col, report: { stars (to bank: the purse + the prize), prize, first, record, floor, stored, dropped, recruits:
 *      [figurine], units: [{ id, species, from, to, gained, newMoves, moves }] } }
 * (The stars carried in were paid out of the wallet when the run began: banking `stars` settles it.)
 */
export function applyMmRewards(col, out, dungeon, data, tail = '') {
	let c = { ...col, figs: { ...col.figs } };
	const units = [];
	for (const [id, n] of Object.entries({ ...Object.fromEntries(Object.keys(out.moveXp).map((k) => [k, 0])), ...out.exp })) {
		const a = col.figs[id];
		if (!a) continue;
		let b = a, newMoves = [];
		if (n > 0) { const g = gainExp(b, n, data); b = g.fig; newMoves = g.newMoves; }
		for (const [mid, x] of Object.entries(out.moveXp[id] || {})) b = gainMoveXp(b, mid, x);
		if (b === a) continue;
		c.figs[id] = b;
		units.push({ uid: id, id, species: b.species, from: a.level, to: b.level, expFrom: a.exp || 0, expTo: b.exp || 0, gained: Math.max(0, (b.exp || 0) - (a.exp || 0)), newMoves,
			moves: b.pool.map((p) => { const q = a.pool.find((x) => x.id === p.id); return q && p.xp > q.xp ? { id: p.id, xp: p.xp - q.xp, from: q.lv, to: p.lv } : null; }).filter(Boolean) });
	}
	const safe = String(tail || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'x';
	const recruits = [];
	out.recruits.forEach((f, i) => { const fig = { ...f, id: f.species + '-mm-' + safe + i, from: 'maze' }; const next = addFig(c, fig); if (next !== c) { c = next; recruits.push(next.figs[fig.id]); } });
	let stored = 0, dropped = 0;
	out.items.forEach((id, i) => { const next = mmStoreSize(c) < MM_STORE_MAX ? mmStoreAdd(c, id, safe + i.toString(36)) : c; if (next !== c) { c = next; stored++; } else dropped++; });
	const goods = [];
	(out.goods || []).forEach((id, i) => { const next = addGood(c, id, safe + 'g' + i.toString(36)); if (next !== c) { c = next; goods.push(id); } });
	const mm = cleanMm(c.mm), times = mm.clear[dungeon.id] || 0, best = mm.best[dungeon.id] || 0;
	const prize = out.won ? clearPrize(dungeon, times) : 0;
	const rec = { clear: { ...mm.clear }, best: { ...mm.best }, store: mm.store };
	// (a dive into an item, dungeons.js itemDungeon, keeps no record: its mark is the item's level)
	if (out.won && !dungeon.noRecord) rec.clear[dungeon.id] = times + 1;
	if (out.floor > best && !dungeon.noRecord) rec.best[dungeon.id] = out.floor;
	c = { ...c, mm: rec };
	return { col: c, report: { stars: out.stars + prize, prize, first: out.won && times === 0 && !dungeon.noRecord, record: out.floor > best && !dungeon.noRecord, floor: out.floor, stored, dropped, goods, recruits, units } };
}
