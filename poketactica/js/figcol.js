// figcol.js — a player's FIGURINE collection (Poketactica stage 5; owner, 2026-11-20). Pure: the page, the overworld and
// the server all read it. Kept on the device (figsave.js) and, signed in, on the account (server: `ptfig:<user>`, the
// same compare-and-set sync as Pocket Enhanced's collection: pocketenhanced/js/colsync.js createSync with FIGS below).
//
// { v: 1, figs: { <id>: figurine }, starters?: true (the three starters were picked), cleared?: [campaign map id] (campaign.js),
//   deep?: the deepest dungeon boss floor cleared (dungeon.js),
//   escrow?: { <holder>: { ids, at } },
//   items?: { <uid>: good id } (goods.js: held items not on a figurine, evolution items, Rare Candy; bought in the shop),
//   td?: { <Tower Defense map id>: the best wave cleared there } (td/rewards.js; the higher wins a merge),
//   mm?: Mystery Maze (mm/rewards.js): { clear: { <dungeon id>: times cleared }, best: { <dungeon id>: the deepest floor
//        reached }, store: { <uid>: item id } (the STORAGE: what was carried out, 200 at most; each its own uid, joined
//        as goods are) }; the higher count and floor win a merge,
//   gone?: [figurine id] (PERMANENT LOSS, owner 2026-11-23: "if something dies in battle it is gone": the ids of figurines
//          knocked out in a Story / Dungeon battle; a figurine whose id is here is never in `figs` again, on any device),
//   fallen?: [{ fig, at, where, by }] (the memorial: the newest FALLEN_MAX lost figurines, whole, each for FALLEN_DAYS;
//          the camp's "Fallen" list, and the backup a wrongly lost one is restored from: restoreFallen) }
// A figurine may also carry held: <HELD id> (the item it holds: it goes wherever the figurine goes) and evo: <n> (how many
// times it evolved, evolve.js).
//
// A figurine is a unique object (figurine.js makeFigurine), so two devices' copies are joined BY ID, not summed:
//   - a figurine only one side has: kept (found there) — unless the copy both last agreed on had it: then the other side
//     let it go (traded away, given up) and it stays gone
//   - one on both sides: whichever grew (more EXP; per move, more move XP; the pools joined), and the equipped four of
//     the side that changed them
//   - goods (`items`) are unique objects too (each its own uid), joined the same way: one used or put on a figurine on
//     one device stays gone
//   - an evolved copy beats an unevolved one (evo); the held item of the side that changed it
//   - `escrow` (held for a trade or a bet) is the account's alone, as Pocket's is: a device never brings a held one back
//   - `gone` is the union of both sides' (a figurine lost anywhere is lost everywhere, even for a device joining with no
//     agreed copy); `fallen` likewise, by figurine id, the newest kept
import { MAX_LEVEL, MOVE_MAX_LEVEL } from './figurine.js';
import { HELD, isGood } from './goods.js';
import { ITEMS as MM_ITEMS } from './mm/items.js';

export const MAX_FIGS = 5000, MAX_POOL = 400, MAX_ITEMS = 2000;
export const GONE_MAX = 2000, FALLEN_MAX = 50, FALLEN_DAYS = 30;
const ITEM_UID = /^[a-z0-9]{1,30}-[a-z0-9]{4,16}$/;
export const newFigs = () => ({ v: 1, figs: {} });

const ID = /^[a-z0-9_-]{3,60}$/;
/** One figurine read defensively, or null. */
export function cleanFig(f) {
	if (!f || typeof f !== 'object' || !ID.test(String(f.id || '')) || typeof f.species !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(f.species)) return null;
	const level = Math.max(1, Math.min(MAX_LEVEL, f.level | 0));
	const pool = [], seen = new Set();
	for (const p of Array.isArray(f.pool) ? f.pool.slice(0, MAX_POOL) : []) {
		if (!p || typeof p.id !== 'string' || !/^[a-z0-9]{1,40}$/.test(p.id) || seen.has(p.id)) continue;
		seen.add(p.id);
		pool.push({ id: p.id, lv: Math.max(1, Math.min(MOVE_MAX_LEVEL, p.lv | 0)), xp: Math.max(0, Math.floor(+p.xp || 0)) });
	}
	const equipped = (Array.isArray(f.equipped) ? f.equipped : []).filter((m) => seen.has(m)).slice(0, 4);
	return { v: 1, id: f.id, species: f.species, level, exp: Math.max(0, Math.floor(+f.exp || 0)), ability: typeof f.ability === 'string' && f.ability.length <= 40 ? f.ability : null,
		shiny: !!f.shiny, pool, equipped: [...new Set(equipped)], ...(typeof f.from === 'string' && f.from.length <= 24 ? { from: f.from } : {}),
		...(typeof f.held === 'string' && HELD[f.held] ? { held: f.held } : {}), ...(Number.isInteger(f.evo) && f.evo > 0 ? { evo: Math.min(f.evo, 9) } : {}) };
}

/** The campaign maps cleared: ids, unique, sorted. */
const CLEARED_ID = /^[a-z0-9-]{1,24}$/;
export const cleanCleared = (a) => [...new Set((Array.isArray(a) ? a : []).filter((id) => typeof id === 'string' && CLEARED_ID.test(id)))].sort().slice(0, 200);
export const markCleared = (col, id) => { const c = cleanCleared([...(col.cleared || []), id]); return { ...col, cleared: c }; };
/** The deepest dungeon boss floor cleared (dungeon.js: a checkpoint a run can start after): a whole number, or 0. */
export const cleanDeep = (n) => (Number.isInteger(n) && n > 0 ? Math.min(n, 1e6) : 0);
export const markDeep = (col, floor) => { const d = Math.max(cleanDeep(col.deep), cleanDeep(floor)); return d ? { ...col, deep: d } : col; };

/** Tower Defense records: { map id -> best wave }, whole numbers. */
export function cleanTd(x) {
	const out = {};
	if (!x || typeof x !== 'object') return out;
	for (const [id, n] of Object.entries(x)) if (CLEARED_ID.test(id) && Number.isInteger(n) && n > 0 && Object.keys(out).length < 100) out[id] = Math.min(n, 1e6);
	return out;
}
/** Mystery Maze's record: dungeons cleared, the deepest floors, and the storage (one entry an item). */
export const MM_STORE_MAX = 200;
const MM_UID = /^[a-z0-9]{1,24}-[a-z0-9]{4,16}$/;
export function cleanMm(x) {
	const out = { clear: {}, best: {}, store: {} };
	if (!x || typeof x !== 'object') return out;
	for (const k of ['clear', 'best']) for (const [id, n] of Object.entries(x[k] || {})) if (CLEARED_ID.test(id) && Number.isInteger(n) && n > 0 && Object.keys(out[k]).length < 100) out[k][id] = Math.min(n, 1e6);
	let n = 0;
	for (const [uid, id] of Object.entries(x.store || {})) { if (n >= MM_STORE_MAX) break; if (MM_UID.test(uid) && MM_ITEMS[id] && id !== 'stars' && uid.startsWith(id + '-')) { out.store[uid] = id; n++; } }
	return out;
}
const mmEmpty = (m) => !Object.keys(m.clear).length && !Object.keys(m.best).length && !Object.keys(m.store).length;
/** The lost figurines' ids: unique, the newest GONE_MAX (the end of the list is the newest). */
export const cleanGone = (a) => [...new Set((Array.isArray(a) ? a : []).filter((id) => typeof id === 'string' && ID.test(id)))].slice(-GONE_MAX);
/** The memorial: [{ fig, at, where, by }], one per figurine id, oldest first, the newest FALLEN_MAX. */
export function cleanFallen(a) {
	const seen = new Map();
	for (const e of Array.isArray(a) ? a : []) {
		const fig = e && cleanFig(e.fig);
		if (!fig) continue;
		const at = Number.isFinite(+e.at) && +e.at > 0 ? Math.floor(+e.at) : 0;
		const prev = seen.get(fig.id);
		if (!prev || at > prev.at) seen.set(fig.id, { fig, at, where: typeof e.where === 'string' ? e.where.slice(0, 48) : '', by: typeof e.by === 'string' ? e.by.slice(0, 40) : '' });
	}
	return [...seen.values()].sort((x, y) => x.at - y.at).slice(-FALLEN_MAX);
}

/** The goods: { uid -> good id }, unknown ids and bad uids dropped. */
export function cleanItems(x) {
	const out = {}; let n = 0;
	if (!x || typeof x !== 'object') return out;
	for (const [uid, id] of Object.entries(x)) { if (n >= MAX_ITEMS) break; if (ITEM_UID.test(uid) && isGood(id) && uid.startsWith(id + '-')) { out[uid] = id; n++; } }
	return out;
}
/** A collection read defensively, or null when it isn't one. */
export function cleanFigs(x) {
	if (!x || typeof x !== 'object' || x.v !== 1 || !x.figs || typeof x.figs !== 'object') return null;
	const figs = {};
	let n = 0;
	const gone = cleanGone(x.gone), lost = new Set(gone);
	for (const [id, f] of Object.entries(x.figs)) {
		if (n >= MAX_FIGS) break;
		if (lost.has(id)) continue;   // (a lost figurine never comes back)
		const c = cleanFig(f);
		if (c && c.id === id) { figs[id] = c; n++; }
	}
	const out = { v: 1, figs };
	if (gone.length) out.gone = gone;
	{ const fl = cleanFallen(x.fallen).filter((e) => lost.has(e.fig.id)); if (fl.length) out.fallen = fl; }
	if (x.starters) out.starters = true;
	{ const c = cleanCleared(x.cleared); if (c.length) out.cleared = c; }
	if (cleanDeep(x.deep)) out.deep = cleanDeep(x.deep);
	{ const it = cleanItems(x.items); if (Object.keys(it).length) out.items = it; }
	{ const td = cleanTd(x.td); if (Object.keys(td).length) out.td = td; }
	{ const mm = cleanMm(x.mm); if (!mmEmpty(mm)) out.mm = mm; }
	if (x.escrow && typeof x.escrow === 'object') {
		const esc = {};
		for (const [h, e] of Object.entries(x.escrow)) if (/^[A-Za-z0-9:_-]{1,80}$/.test(h) && e && Array.isArray(e.ids)) esc[h] = { ids: e.ids.filter((i) => ID.test(String(i))).slice(0, 60), at: +e.at || 0, ...(Array.isArray(e.figs) ? { figs: e.figs.map(cleanFig).filter(Boolean).slice(0, 60) } : {}) };
		if (Object.keys(esc).length) out.escrow = esc;
	}
	return out;
}

/** Two copies of one figurine, joined: the one that grew, pools joined (each move at its higher XP). */
function joinFig(base, a, b) {
	const pick = (x, y) => ((x.evo | 0) !== (y.evo | 0) ? ((x.evo | 0) > (y.evo | 0) ? x : y) : x.exp !== y.exp ? (x.exp > y.exp ? x : y) : x.level >= y.level ? x : y);
	const top = pick(a, b);
	const pool = new Map();
	for (const p of [...a.pool, ...b.pool]) { const q = pool.get(p.id); if (!q || p.xp > q.xp) pool.set(p.id, { ...p }); }
	// the equipped four: the side that changed them since the agreed copy (else the grown one's)
	const eqA = JSON.stringify(a.equipped), eqB = JSON.stringify(b.equipped), eqBase = base ? JSON.stringify(base.equipped) : null;
	const equipped = eqA === eqB ? a.equipped : eqBase === eqA ? b.equipped : eqBase === eqB ? a.equipped : top.equipped;
	// the held item: likewise, the side that changed it
	const hA = a.held || null, hB = b.held || null, hBase = base ? base.held || null : undefined;
	const held = hA === hB ? hA : hBase === hA ? hB : hBase === hB ? hA : top.held || null;
	const out = { ...top, level: Math.max(a.level, b.level), exp: Math.max(a.exp, b.exp), pool: [...pool.values()], equipped: [...equipped] };
	delete out.held; if (held) out.held = held;
	return out;
}

/** Three-way join: the account's copy (theirs) + what this device did since they last agreed (base -> mine). */
export function merge3Figs(base, mine, theirs) {
	const B = (base && base.figs) || {}, M = mine.figs, T = theirs.figs, figs = {};
	// (lost on either side: lost. The order kept: theirs', then what this device added.)
	const gone = cleanGone([...(theirs.gone || []), ...(mine.gone || [])]), lost = new Set(gone);
	for (const id of new Set([...Object.keys(M), ...Object.keys(T)])) {
		if (lost.has(id)) continue;
		const m = M[id], t = T[id], b = B[id];
		if (m && t) figs[id] = joinFig(b, m, t);
		else if (m && !t) { if (!b) figs[id] = m; }   // (theirs let it go since: it stays gone)
		else if (t && !m) { if (!b) figs[id] = t; }   // (mine let it go since: it stays gone)
	}
	const out = { v: 1, figs };
	if (gone.length) out.gone = gone;
	{ const fl = cleanFallen([...(theirs.fallen || []), ...(mine.fallen || [])]).filter((e) => lost.has(e.fig.id)); if (fl.length) out.fallen = fl; }
	if (mine.starters || theirs.starters) out.starters = true;
	{ const c = cleanCleared([...(mine.cleared || []), ...(theirs.cleared || [])]); if (c.length) out.cleared = c; }   // (a map cleared anywhere stays cleared)
	{ const d = Math.max(cleanDeep(mine.deep), cleanDeep(theirs.deep)); if (d) out.deep = d; }   // (the deeper checkpoint wins)
	{ const a = cleanTd(mine.td), b = cleanTd(theirs.td), td = { ...b }; for (const [id, n] of Object.entries(a)) td[id] = Math.max(td[id] || 0, n); if (Object.keys(td).length) out.td = td; }   // (the better record wins)
	{   // Mystery Maze: the higher count and floor win; the storage by uid, as goods (one taken into a dungeon since the agreed copy stays out)
		const a = cleanMm(mine.mm), b = cleanMm(theirs.mm), Bs = cleanMm(base && base.mm).store, mm = { clear: { ...b.clear }, best: { ...b.best }, store: {} };
		for (const k of ['clear', 'best']) for (const [id, n] of Object.entries(a[k])) mm[k][id] = Math.max(mm[k][id] || 0, n);
		for (const uid of new Set([...Object.keys(a.store), ...Object.keys(b.store)])) { if (Object.keys(mm.store).length >= MM_STORE_MAX) break; if ((a.store[uid] && b.store[uid]) || !Bs[uid]) mm.store[uid] = a.store[uid] || b.store[uid]; }
		if (!mmEmpty(mm)) out.mm = mm;
	}
	{   // goods: by uid, as the figurines (one used / put on since the agreed copy stays gone)
		const Bi = (base && base.items) || {}, Mi = mine.items || {}, Ti = theirs.items || {}, items = {};
		for (const uid of new Set([...Object.keys(Mi), ...Object.keys(Ti)])) { const id = Mi[uid] || Ti[uid]; if ((Mi[uid] && Ti[uid]) || !Bi[uid]) items[uid] = id; }
		if (Object.keys(items).length) out.items = items;
	}
	if (theirs.escrow) out.escrow = theirs.escrow;   // (the server's alone)
	return out;
}
/** A device signing in for the first time: everything found on it joins the account's. */
export const linkFigs = (mine, theirs) => merge3Figs(null, mine, theirs);
const canon = (c) => JSON.stringify({ figs: Object.keys(c.figs).sort().map((k) => c.figs[k]), starters: !!c.starters, cleared: c.cleared || [], deep: cleanDeep(c.deep), items: Object.keys(c.items || {}).sort().map((k) => k + '=' + c.items[k]), escrow: c.escrow || null, td: Object.keys(c.td || {}).sort().map((k) => k + '=' + c.td[k]),
	mm: ((m) => [Object.keys(m.clear).sort().map((k) => k + '=' + m.clear[k]), Object.keys(m.best).sort().map((k) => k + '=' + m.best[k]), Object.keys(m.store).sort()])(cleanMm(c.mm)), gone: [...(c.gone || [])].sort(), fallen: (c.fallen || []).map((e) => e.fig.id + '@' + e.at).sort() });
export const sameFigs = (a, b) => canon(a) === canon(b);

/** What the account's sync carries (pocketenhanced/js/colsync.js createSync's `kind`). */
export const FIGS = Object.freeze({ get: 'ptfig-get', put: 'ptfig-put', field: 'figs', key: 'magepunk_poketactica_figs_sync_v1', merge3: merge3Figs, link: linkFigs, same: sameFigs, clean: cleanFigs });

// ---------- changing a collection (each returns a new one)
export const addFig = (col, fig) => { const c = cleanFig(fig); return c ? { ...col, figs: { ...col.figs, [c.id]: c } } : col; };
export const putFig = addFig;   // (replace a figurine with its grown copy after a battle)

// ---------- permanent loss (owner, 2026-11-23)
/** A figurine is knocked out in a deadly battle: out of the collection for good, with what it held; its id onto `gone`,
 *  the whole figurine onto the memorial. info: { at (ms), where, by }. A figurine that isn't there: the collection as it was. */
export function loseFig(col, id, info = {}) {
	const f = col.figs[id];
	if (!f) return col;
	const figs = { ...col.figs }; delete figs[id];
	const at = Number.isFinite(+info.at) ? Math.floor(+info.at) : 0;
	const cutoff = at - FALLEN_DAYS * 86400000;
	const fallen = cleanFallen([...(col.fallen || []).filter((e) => !(at > 0 && e.at > 0 && e.at < cutoff)), { fig: f, at, where: info.where || '', by: info.by || '' }]);
	return { ...col, figs, gone: cleanGone([...(col.gone || []), id]), fallen };
}
/** The memorial's figurines, newest first. */
export const fallenList = (col) => [...((col && col.fallen) || [])].sort((a, b) => b.at - a.at);
/** Put a wrongly lost figurine back from the memorial (a repair, never a game action): into `figs`, off `gone` and the
 *  memorial. -> the collection, or null when the memorial doesn't hold it. */
export function restoreFallen(col, id) {
	const e = (col.fallen || []).find((x) => x.fig.id === id);
	if (!e) return null;
	const out = { ...col, figs: { ...col.figs, [id]: e.fig }, gone: (col.gone || []).filter((g) => g !== id), fallen: (col.fallen || []).filter((x) => x.fig.id !== id) };
	if (!out.gone.length) delete out.gone;
	if (!out.fallen.length) delete out.fallen;
	return out;
}
export const list = (col) => Object.values(col.figs).sort((a, b) => b.level - a.level || a.species.localeCompare(b.species));
/** The species a collection holds (MicaSurvivor unlocks every one of them: owner, 2026-11-20). */
export const speciesOf = (col) => [...new Set(Object.values((col && col.figs) || {}).map((f) => f.species))];

/** The 27 starter trios' first stages (the new-player pick: three of them at level 5). */
export const STARTERS = ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup',
	'snivy', 'tepig', 'oshawott', 'chespin', 'fennekin', 'froakie', 'rowlet', 'litten', 'popplio', 'grookey', 'scorbunny', 'sobble', 'sprigatito', 'fuecoco', 'quaxly'];
export const STARTER_PICK = 3, STARTER_LEVEL = 5;

// ---------- goods (goods.js): each one its own uid, so two devices join them as they join figurines
/** How many of each good: { id -> n }. */
export const goodsCount = (col) => { const n = {}; for (const id of Object.values((col && col.items) || {})) n[id] = (n[id] || 0) + 1; return n; };
export const haveGood = (col, id) => goodsCount(col)[id] || 0;
/** Mystery Maze's storage: how many of each item. */
export const mmStoreCount = (col) => { const n = {}; for (const id of Object.values(cleanMm(col && col.mm).store)) n[id] = (n[id] || 0) + 1; return n; };
export const mmStoreSize = (col) => Object.keys(cleanMm(col && col.mm).store).length;
/** One more item into the storage (tail: a fresh random string, the caller's). -> the collection, unchanged when it is full */
export function mmStoreAdd(col, id, tail) {
	const mm = cleanMm(col.mm), uid = id + '-' + String(tail || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16).padEnd(4, '0');
	if (!MM_ITEMS[id] || id === 'stars' || mm.store[uid] || Object.keys(mm.store).length >= MM_STORE_MAX) return col;
	return { ...col, mm: { ...mm, store: { ...mm.store, [uid]: id } } };
}
/** One fewer of an item, or null when there is none. */
export function mmStoreTake(col, id) {
	const mm = cleanMm(col.mm), uid = Object.keys(mm.store).find((k) => mm.store[k] === id);
	if (!uid) return null;
	const store = { ...mm.store }; delete store[uid];
	return { ...col, mm: { ...mm, store } };
}
/** One more of a good. uid: a fresh random tail (the caller's; the page uses Math.random). */
export function addGood(col, id, tail) {
	if (!isGood(id)) return col;
	const uid = id + '-' + String(tail || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16).padEnd(4, '0');
	if ((col.items || {})[uid] || Object.keys(col.items || {}).length >= MAX_ITEMS) return col;
	return { ...col, items: { ...(col.items || {}), [uid]: id } };
}
/** One fewer of a good, or null when there is none. */
export function takeGood(col, id) {
	const uid = Object.keys(col.items || {}).find((k) => col.items[k] === id);
	if (!uid) return null;
	const items = { ...col.items }; delete items[uid];
	const out = { ...col, items }; if (!Object.keys(items).length) delete out.items;
	return out;
}
