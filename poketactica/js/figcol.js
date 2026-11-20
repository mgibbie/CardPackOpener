// figcol.js — a player's FIGURINE collection (Poketactica stage 5; owner, 2026-11-20). Pure: the page, the overworld and
// the server all read it. Kept on the device (figsave.js) and, signed in, on the account (server: `ptfig:<user>`, the
// same compare-and-set sync as Pocket Enhanced's collection: pocketenhanced/js/colsync.js createSync with FIGS below).
//
// { v: 1, figs: { <id>: figurine }, starters?: true (the three starters were picked), escrow?: { <holder>: { ids, at } } }
//
// A figurine is a unique object (figurine.js makeFigurine), so two devices' copies are joined BY ID, not summed:
//   - a figurine only one side has: kept (found there) — unless the copy both last agreed on had it: then the other side
//     let it go (traded away, given up) and it stays gone
//   - one on both sides: whichever grew (more EXP; per move, more move XP; the pools joined), and the equipped four of
//     the side that changed them
//   - `escrow` (held for a trade or a bet) is the account's alone, as Pocket's is: a device never brings a held one back
import { MAX_LEVEL, MOVE_MAX_LEVEL } from './figurine.js';

export const MAX_FIGS = 5000, MAX_POOL = 400;
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
		shiny: !!f.shiny, pool, equipped: [...new Set(equipped)], ...(typeof f.from === 'string' && f.from.length <= 24 ? { from: f.from } : {}) };
}

/** A collection read defensively, or null when it isn't one. */
export function cleanFigs(x) {
	if (!x || typeof x !== 'object' || x.v !== 1 || !x.figs || typeof x.figs !== 'object') return null;
	const figs = {};
	let n = 0;
	for (const [id, f] of Object.entries(x.figs)) {
		if (n >= MAX_FIGS) break;
		const c = cleanFig(f);
		if (c && c.id === id) { figs[id] = c; n++; }
	}
	const out = { v: 1, figs };
	if (x.starters) out.starters = true;
	if (x.escrow && typeof x.escrow === 'object') {
		const esc = {};
		for (const [h, e] of Object.entries(x.escrow)) if (/^[A-Za-z0-9:_-]{1,80}$/.test(h) && e && Array.isArray(e.ids)) esc[h] = { ids: e.ids.filter((i) => ID.test(String(i))).slice(0, 60), at: +e.at || 0, ...(Array.isArray(e.figs) ? { figs: e.figs.map(cleanFig).filter(Boolean).slice(0, 60) } : {}) };
		if (Object.keys(esc).length) out.escrow = esc;
	}
	return out;
}

/** Two copies of one figurine, joined: the one that grew, pools joined (each move at its higher XP). */
function joinFig(base, a, b) {
	const pick = (x, y) => (x.exp !== y.exp ? (x.exp > y.exp ? x : y) : x.level >= y.level ? x : y);
	const top = pick(a, b);
	const pool = new Map();
	for (const p of [...a.pool, ...b.pool]) { const q = pool.get(p.id); if (!q || p.xp > q.xp) pool.set(p.id, { ...p }); }
	// the equipped four: the side that changed them since the agreed copy (else the grown one's)
	const eqA = JSON.stringify(a.equipped), eqB = JSON.stringify(b.equipped), eqBase = base ? JSON.stringify(base.equipped) : null;
	const equipped = eqA === eqB ? a.equipped : eqBase === eqA ? b.equipped : eqBase === eqB ? a.equipped : top.equipped;
	return { ...top, level: Math.max(a.level, b.level), exp: Math.max(a.exp, b.exp), pool: [...pool.values()], equipped: [...equipped] };
}

/** Three-way join: the account's copy (theirs) + what this device did since they last agreed (base -> mine). */
export function merge3Figs(base, mine, theirs) {
	const B = (base && base.figs) || {}, M = mine.figs, T = theirs.figs, figs = {};
	for (const id of new Set([...Object.keys(M), ...Object.keys(T)])) {
		const m = M[id], t = T[id], b = B[id];
		if (m && t) figs[id] = joinFig(b, m, t);
		else if (m && !t) { if (!b) figs[id] = m; }   // (theirs let it go since: it stays gone)
		else if (t && !m) { if (!b) figs[id] = t; }   // (mine let it go since: it stays gone)
	}
	const out = { v: 1, figs };
	if (mine.starters || theirs.starters) out.starters = true;
	if (theirs.escrow) out.escrow = theirs.escrow;   // (the server's alone)
	return out;
}
/** A device signing in for the first time: everything found on it joins the account's. */
export const linkFigs = (mine, theirs) => merge3Figs(null, mine, theirs);
const canon = (c) => JSON.stringify({ figs: Object.keys(c.figs).sort().map((k) => c.figs[k]), starters: !!c.starters, escrow: c.escrow || null });
export const sameFigs = (a, b) => canon(a) === canon(b);

/** What the account's sync carries (pocketenhanced/js/colsync.js createSync's `kind`). */
export const FIGS = Object.freeze({ get: 'ptfig-get', put: 'ptfig-put', field: 'figs', key: 'magepunk_poketactica_figs_sync_v1', merge3: merge3Figs, link: linkFigs, same: sameFigs, clean: cleanFigs });

// ---------- changing a collection (each returns a new one)
export const addFig = (col, fig) => { const c = cleanFig(fig); return c ? { ...col, figs: { ...col.figs, [c.id]: c } } : col; };
export const putFig = addFig;   // (replace a figurine with its grown copy after a battle)
export const list = (col) => Object.values(col.figs).sort((a, b) => b.level - a.level || a.species.localeCompare(b.species));
/** The species a collection holds (MicaSurvivor unlocks every one of them: owner, 2026-11-20). */
export const speciesOf = (col) => [...new Set(Object.values((col && col.figs) || {}).map((f) => f.species))];

/** The 27 starter trios' first stages (the new-player pick: three of them at level 5). */
export const STARTERS = ['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup',
	'snivy', 'tepig', 'oshawott', 'chespin', 'fennekin', 'froakie', 'rowlet', 'litten', 'popplio', 'grookey', 'scorbunny', 'sobble', 'sprigatito', 'fuecoco', 'quaxly'];
export const STARTER_PICK = 3, STARTER_LEVEL = 5;
