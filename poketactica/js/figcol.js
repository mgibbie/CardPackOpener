// figcol.js — a player's FIGURINE collection (Poketactica stage 5; owner, 2026-11-20). Pure: the page, the overworld and
// the server all read it. Kept on the device (figsave.js) and, signed in, on the account (server: `ptfig:<user>`, the
// same compare-and-set sync as Pocket Enhanced's collection: pocketenhanced/js/colsync.js createSync with FIGS below).
//
// { v: 1, figs: { <id>: figurine }, starters?: true (the three starters were picked), cleared?: [campaign map id] (campaign.js),
//   deep?: the deepest dungeon boss floor cleared (dungeon.js),
//   escrow?: { <holder>: { ids, at } },
//   items?: { <uid>: good id } (goods.js: held items not on a figurine, evolution items, Rare Polish; bought in the shop),
//   gear?: { <item uid>: { lv, gems } } (gear.js: a held item in the bag that has a level or plush gemstones; a held item ON a
//          figurine carries the same object as the figurine's own `gear`),
//   gems?: { <uid>: 'atk:12' } (the loose plush gemstones: each its own uid, joined as goods are),
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
import { cleanGear, gearOf, parseGem, gemStr, combineGems, slotsAt } from './gear.js';
import { cleanGoals, mergeGoals } from './goals.js';
import { ITEMS as MM_ITEMS } from './mm/items.js';

export const MAX_FIGS = 5000, MAX_POOL = 400, MAX_ITEMS = 2000, MAX_GEMS = 3000;
const GEM_UID = /^gem-[a-z0-9]{4,20}$/;
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
		...(typeof f.held === 'string' && HELD[f.held] ? { held: f.held, ...(gearOf(f) ? { gear: gearOf(f) } : {}) } : {}), ...(Number.isInteger(f.evo) && f.evo > 0 ? { evo: Math.min(f.evo, 9) } : {}), ...(f.fav === true ? { fav: true } : {}) };   // (fav: a favourite cannot be released)
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
	for (const [uid, id] of Object.entries(x.store || {})) { if (n >= MM_STORE_MAX) break; if (MM_UID.test(uid) && MM_ITEMS[id] && id !== 'stars' && MM_ITEMS[id].group !== 'good' && MM_ITEMS[id].group !== 'key' && uid.startsWith(id + '-')) { out.store[uid] = id; n++; } }
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
/** The state of the held items in the bag: only for an item that is there, is a held item, and has something to say. */
export function cleanGearMap(x, items) {
	const out = {};
	if (!x || typeof x !== 'object') return out;
	for (const [uid, g] of Object.entries(x)) { const c = items[uid] && HELD[items[uid]] ? cleanGear(g) : null; if (c) out[uid] = c; }
	return out;
}
/** The loose plush gemstones. */
export function cleanGems(x) {
	const out = {}; let n = 0;
	if (!x || typeof x !== 'object') return out;
	for (const [uid, s] of Object.entries(x)) { if (n >= MAX_GEMS) break; const g = GEM_UID.test(uid) ? parseGem(s) : null; if (g) { out[uid] = gemStr(g.s, g.lv); n++; } }
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
	{ const it = cleanItems(x.items); if (Object.keys(it).length) out.items = it; const gr = cleanGearMap(x.gear, it); if (Object.keys(gr).length) out.gear = gr; }
	{ const gm = cleanGems(x.gems); if (Object.keys(gm).length) out.gems = gm; }
	{ const td = cleanTd(x.td); if (Object.keys(td).length) out.td = td; }
	{ const mm = cleanMm(x.mm); if (!mmEmpty(mm)) out.mm = mm; }
	{ const g = cleanGoals(x.goals); if (g) out.goals = g; }   // (goals.js: the milestones claimed, today's tasks paid)
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
	// a favourite: the side that changed it since the agreed copy; with no agreed copy, a favourite on either side stays one
	{ const fA = !!a.fav, fB = !!b.fav, fBase = base ? !!base.fav : null, fav = fA === fB ? fA : fBase === fA ? fB : fBase === fB ? fA : true; delete out.fav; if (fav) out.fav = true; }
	delete out.held; delete out.gear;
	if (held) {
		out.held = held;
		// (the item's level and gemstones: of the side whose item this is; both the same item: the higher level, then the fuller)
		const gA = a.held === held ? gearOf(a) : null, gB = b.held === held ? gearOf(b) : null;
		const g = gA && gB ? (gA.lv !== gB.lv ? (gA.lv > gB.lv ? gA : gB) : hA === hB && base && JSON.stringify(gearOf(base)) === JSON.stringify(gA) ? gB : gA) : gA || gB;
		if (g) out.gear = g;
	}
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
		// (an item's state goes with the item: the side that has it; both: the higher level, else the side that changed it)
		const Mg = mine.gear || {}, Tg = theirs.gear || {}, Bg = (base && base.gear) || {}, gear = {};
		for (const uid of Object.keys(items)) {
			const a = Mi[uid] ? cleanGear(Mg[uid]) : null, b = Ti[uid] ? cleanGear(Tg[uid]) : null;
			const g = Mi[uid] && Ti[uid] ? ((a ? a.lv : 1) !== (b ? b.lv : 1) ? ((a ? a.lv : 1) > (b ? b.lv : 1) ? a : b) : JSON.stringify(a) === JSON.stringify(cleanGear(Bg[uid])) ? b : a) : Mi[uid] ? a : b;
			if (g && HELD[items[uid]]) gear[uid] = g;
		}
		if (Object.keys(gear).length) out.gear = gear;
	}
	{   // plush gemstones: by uid, as goods (one set in a slot or combined away since the agreed copy stays gone)
		const Bm = (base && base.gems) || {}, Mm = cleanGems(mine.gems), Tm = cleanGems(theirs.gems), gems = {};
		for (const uid of new Set([...Object.keys(Mm), ...Object.keys(Tm)])) { if (Object.keys(gems).length >= MAX_GEMS) break; if ((Mm[uid] && Tm[uid]) || !Bm[uid]) gems[uid] = Mm[uid] || Tm[uid]; }
		if (Object.keys(gems).length) out.gems = gems;
	}
	{ const g = mergeGoals(mine.goals, theirs.goals); if (g) out.goals = g; }   // (claimed anywhere is claimed)
	if (theirs.escrow) out.escrow = theirs.escrow;   // (the server's alone)
	return out;
}
/** A device signing in for the first time: everything found on it joins the account's. */
export const linkFigs = (mine, theirs) => merge3Figs(null, mine, theirs);
const canon = (c) => JSON.stringify({ figs: Object.keys(c.figs).sort().map((k) => c.figs[k]), starters: !!c.starters, cleared: c.cleared || [], deep: cleanDeep(c.deep), items: Object.keys(c.items || {}).sort().map((k) => k + '=' + c.items[k]), gear: Object.keys(c.gear || {}).sort().map((k) => k + '=' + JSON.stringify(c.gear[k])), gems: Object.keys(c.gems || {}).sort().map((k) => k + '=' + c.gems[k]), escrow: c.escrow || null, td: Object.keys(c.td || {}).sort().map((k) => k + '=' + c.td[k]),
	mm: ((m) => [Object.keys(m.clear).sort().map((k) => k + '=' + m.clear[k]), Object.keys(m.best).sort().map((k) => k + '=' + m.best[k]), Object.keys(m.store).sort()])(cleanMm(c.mm)), gone: [...(c.gone || [])].sort(), fallen: (c.fallen || []).map((e) => e.fig.id + '@' + e.at).sort(),
	goals: ((g) => (g ? [[...g.done].sort(), g.daily ? [g.daily.day, [...g.daily.paid].sort()] : null] : null))(cleanGoals(c.goals)) });
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
/** A figurine marked (or unmarked) as a favourite: it cannot be released. -> col */
export function setFav(col, id, on) {
	const f = col.figs[id];
	if (!f || !!f.fav === !!on) return col;
	const g = { ...f }; if (on) g.fav = true; else delete g.fav;
	return { ...col, figs: { ...col.figs, [id]: g } };
}
/** Why a figurine cannot be released, or null. */
export function releaseBlock(col, id) {
	const f = col.figs[id];
	if (!f) return 'no such figurine';
	if (f.fav) return 'it is a favourite';
	return Object.keys(col.figs).length <= 1 ? 'it is your last figurine' : null;
}
/**
 * RELEASE (improvement plan, 2026-11-25: duplicates had no use, against a cap of 5,000): the figurine leaves the
 * collection for good, as a lost one does (its id goes onto the `gone` list, so another device's stale copy cannot
 * bring it back), but it is no loss: nothing goes to the memorial, and what it held comes back to the bag first.
 * tail: a fresh random string. -> col, or null when it may not be released (or the bag has no room for its item)
 */
export function releaseFig(col, id, tail) {
	if (releaseBlock(col, id)) return null;
	let c = col;
	if (c.figs[id].held && HELD[c.figs[id].held]) { const off = unholdItem(c, id, tail); if (!off) return null; c = off.col; }
	const figs = { ...c.figs }; delete figs[id];
	return { ...c, figs, gone: cleanGone([...(c.gone || []), id]) };
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
	if (!MM_ITEMS[id] || id === 'stars' || MM_ITEMS[id].group === 'good' || MM_ITEMS[id].group === 'key' || mm.store[uid] || Object.keys(mm.store).length >= MM_STORE_MAX) return col;
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
	// (a plain one first: an item with a level or gemstones is given up only by name, takeItem)
	const mine = Object.keys(col.items || {}).filter((k) => col.items[k] === id), uid = mine.find((k) => !(col.gear || {})[k]) || mine[0];
	if (!uid) return null;
	const items = { ...col.items }; delete items[uid];
	const out = { ...col, items }; if (!Object.keys(items).length) delete out.items;
	if (out.gear && out.gear[uid]) { const gear = { ...out.gear }; delete gear[uid]; out.gear = gear; if (!Object.keys(gear).length) delete out.gear; }
	return out;
}

// ---------- held items with a level, and plush gemstones (owner, 2026-11-24; gear.js, Plans/POKETACTICA_ITEM_WORLD_PLAN.md)
const tailOf = (tail) => String(tail || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16).padEnd(4, '0');
const withMap = (col, key, map) => { const out = { ...col, [key]: map }; if (!Object.keys(map).length) delete out[key]; return out; };
/** The state of an item in the bag ({ lv, gems }), or null: a plain level 1 item. */
export const itemGear = (col, uid) => ((col.items || {})[uid] && HELD[col.items[uid]] ? cleanGear((col.gear || {})[uid]) : null);
/** Set it (null: back to plain). Only a held item in the bag has one. */
export function setItemGear(col, uid, g) {
	if (!(col.items || {})[uid] || !HELD[col.items[uid]]) return col;
	const gear = { ...(col.gear || {}) }, c = cleanGear(g);
	if (c) gear[uid] = c; else delete gear[uid];
	return withMap(col, 'gear', gear);
}
/** THIS item out of the bag, with its state. -> { col, id, gear } or null */
export function takeItem(col, uid) {
	const id = (col.items || {})[uid];
	if (!id) return null;
	const gear = itemGear(col, uid), items = { ...col.items }, gmap = { ...(col.gear || {}) };
	delete items[uid]; delete gmap[uid];
	return { col: withMap(withMap(col, 'items', items), 'gear', gmap), id, gear };
}
/** An item into the bag with a state. -> { col, uid } or null (the bag is full) */
export function addItem(col, id, tail, gear) {
	const next = addGood(col, id, tail), uid = id + '-' + tailOf(tail);
	if (next === col || !(next.items || {})[uid]) return null;
	return { col: gear ? setItemGear(next, uid, gear) : next, uid };
}
/** A figurine takes hold of THIS bag item; what it held goes back into the bag, each with its level and gemstones. -> col or null */
export function holdItem(col, figId, uid, tail) {
	const f = col.figs[figId], t = f && HELD[(col.items || {})[uid]] ? takeItem(col, uid) : null;
	if (!t) return null;
	let c = t.col;
	if (f.held && HELD[f.held]) { const back = addItem(c, f.held, tail, gearOf(f)); if (!back) return null; c = back.col; }
	const g = { ...f, held: t.id }; delete g.gear; if (t.gear) g.gear = t.gear;
	return { ...c, figs: { ...c.figs, [figId]: g } };
}
/** A figurine's held item back into the bag, with its level and gemstones. -> { col, uid } or null */
export function unholdItem(col, figId, tail) {
	const f = col.figs[figId];
	if (!f || !f.held || !HELD[f.held]) return null;
	const back = addItem(col, f.held, tail, gearOf(f));
	if (!back) return null;
	const g = { ...f }; delete g.held; delete g.gear;
	return { col: { ...back.col, figs: { ...back.col.figs, [figId]: g } }, uid: back.uid };
}
/** The loose plush gemstones, as a list: [{ uid, gem: 'atk:12' }]. */
export const gemList = (col) => Object.entries(cleanGems(col && col.gems)).map(([uid, gem]) => ({ uid, gem }));
/** One more loose gemstone. tail: a fresh random string. -> col (unchanged when it cannot be added) */
export function addGem(col, stat, lv, tail) {
	const s = gemStr(stat, lv), uid = 'gem-' + tailOf(tail), gems = col.gems || {};
	if (!parseGem(s) || gems[uid] || Object.keys(gems).length >= MAX_GEMS) return col;
	return { ...col, gems: { ...gems, [uid]: s } };
}
const dropGem = (col, uid) => { const gems = { ...(col.gems || {}) }; delete gems[uid]; return withMap(col, 'gems', gems); };
/** Where an item's state is read and written: { uid } an item in the bag, { fig } the one a figurine holds. */
const gearAt = (col, where) => (where.fig ? (col.figs[where.fig] && col.figs[where.fig].held ? gearOf(col.figs[where.fig]) || { lv: 1, gems: [] } : null) : (col.items || {})[where.uid] && HELD[col.items[where.uid]] ? itemGear(col, where.uid) || { lv: 1, gems: [] } : null);
function putGear(col, where, g) {
	if (!where.fig) return setItemGear(col, where.uid, g);
	const f = { ...col.figs[where.fig] }, c = cleanGear(g); delete f.gear; if (c) f.gear = c;
	return { ...col, figs: { ...col.figs, [where.fig]: f } };
}
/** The item's level, slots and gemstones, read for a screen: { lv, slots, gems } or null (no such held item). */
export const gearView = (col, where) => { const g = gearAt(col, where); return g ? { lv: g.lv, slots: slotsAt(g.lv), gems: [...g.gems] } : null; };
/** A loose gemstone into a free slot of an item. -> col, or null (no such gemstone, no such item, no free slot) */
export function socketGem(col, where, gemUid) {
	const gem = cleanGems(col.gems)[gemUid], g = gem ? gearAt(col, where) : null;
	if (!g || g.gems.length >= slotsAt(g.lv)) return null;
	return putGear(dropGem(col, gemUid), where, { lv: g.lv, gems: [...g.gems, gem] });
}
/** The gemstone in slot i back out, loose again. -> col or null */
export function unsocketGem(col, where, i, tail) {
	const g = gearAt(col, where), gem = g && g.gems[i], p = gem && parseGem(gem);
	if (!p) return null;
	const next = addGem(col, p.s, p.lv, tail);
	if (next === col) return null;
	return putGear(next, where, { lv: g.lv, gems: g.gems.filter((_, k) => k !== i) });
}
/** Two loose gemstones of one stat joined into one (their levels added), for one Stitching Kit. -> col or null */
export function combineLoose(col, uidA, uidB, tail) {
	const gems = cleanGems(col.gems), made = uidA !== uidB && gems[uidA] && gems[uidB] ? combineGems(gems[uidA], gems[uidB]) : null;
	const paid = made ? takeGood(col, 'stitchingkit') : null;
	if (!paid) return null;
	const p = parseGem(made), next = addGem(dropGem(dropGem(paid, uidA), uidB), p.s, p.lv, tail);
	return (next.gems || {})['gem-' + tailOf(tail)] === made ? next : null;
}
/** Every loose gemstone of one stat joined as gear.js joinPlan says, a Stitching Kit a join, for as many kits as there are.
 *  tail(): a fresh random string a call. -> { col, joins, top: 'atk:34' | null } (joins 0: nothing could be joined) */
export function combineAll(col, stat, tail) {
	let c = col, joins = 0;
	for (;;) {
		const mine = gemList(c).map((g) => ({ uid: g.uid, lv: parseGem(g.gem).lv, s: parseGem(g.gem).s })).filter((g) => g.s === stat).sort((a, b) => b.lv - a.lv || (a.uid < b.uid ? -1 : 1));
		if (mine.length < 2 || mine[0].lv >= 100) break;
		const other = mine.find((g, i) => i > 0 && mine[0].lv + g.lv <= 100);
		if (!other) break;
		const next = combineLoose(c, mine[0].uid, other.uid, tail());
		if (!next) break;   // (no kit left)
		c = next; joins++;
	}
	const best = gemList(c).map((g) => parseGem(g.gem)).filter((p) => p.s === stat).sort((a, b) => b.lv - a.lv)[0];
	return { col: c, joins, top: best ? gemStr(best.s, best.lv) : null };
}
/** Every free slot of an item filled from the loose gemstones, the strongest first. -> { col, n } */
export function socketAll(col, where) {
	let c = col, n = 0;
	for (;;) {
		const g = gearAt(c, where);
		if (!g || g.gems.length >= slotsAt(g.lv)) break;
		const best = gemList(c).map((x) => ({ uid: x.uid, lv: parseGem(x.gem).lv })).sort((a, b) => b.lv - a.lv || (a.uid < b.uid ? -1 : 1))[0];
		const next = best ? socketGem(c, where, best.uid) : null;
		if (!next) break;
		c = next; n++;
	}
	return { col: c, n };
}
/** Every gemstone of an item taken out, loose again. tail(): a fresh random string a call. -> { col, n } */
export function unsocketAll(col, where, tail) {
	let c = col, n = 0;
	for (;;) {
		const g = gearAt(c, where);
		if (!g || !g.gems.length) break;
		const next = unsocketGem(c, where, g.gems.length - 1, tail());
		if (!next) break;   // (no room for more loose gemstones)
		c = next; n++;
	}
	return { col: c, n };
}
/** An item taken off its figurine for a dive goes back on: if that figurine is still there and holds nothing, and the
 *  item is still in the bag. -> col (the same one when it could not) */
export function reholdItem(col, figId, uid, tail) {
	const f = figId && col.figs[figId];
	if (!f || f.held || !HELD[(col.items || {})[uid]]) return col;
	return holdItem(col, figId, uid, tail) || col;
}
/** The Item World banks levels on an item in the bag (100 at most). -> col */
export function levelItem(col, uid, levels) {
	if (!(col.items || {})[uid] || !HELD[col.items[uid]] || !(levels > 0)) return col;
	const g = itemGear(col, uid) || { lv: 1, gems: [] };
	return setItemGear(col, uid, { lv: Math.min(100, g.lv + Math.floor(levels)), gems: g.gems });
}
/** An item in the bag set TO a level (1 to 100): the Item World's bank (itemworld.js). -> col */
export function setItemLevel(col, uid, lv) {
	if (!(col.items || {})[uid] || !HELD[col.items[uid]]) return col;
	const g = itemGear(col, uid) || { lv: 1, gems: [] };
	return setItemGear(col, uid, { lv: Math.max(1, Math.min(100, Math.floor(+lv) || 1)), gems: g.gems });
}
