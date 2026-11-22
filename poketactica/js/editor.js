// editor.js — the MAP MAKER's model (owner, 2026-11-22: "Map editor"): a map in the campaign's own format (campaign.js:
// rows / geo / ground / base / foes / symbols / theme / name), the tools that change it, its checks, and the form it is
// saved and shared in. Pure (node-tested: overworld/tests/poketactica_editor_test.mjs); the page is editmode.js.
import { GROUND_CHAR } from './campaign.js';
import { THEMES } from './themes.js';
import { reach } from './engine/grid.js';

export const MIN_W = 5, MAX_W = 14, MIN_H = 5, MAX_H = 14, MAX_LEVEL = 9, MAX_FOES = 10, FOE_LV_MAX = 100, NAME_MAX = 24;
export const GROUND_KEYS = Object.freeze(['.', ...Object.keys(GROUND_CHAR)]);        // '.' = the theme's own
export const GEO_KEYS = Object.freeze(['.', 'r', 'b', 'p', 'o', 'c', 'y', 'g']);
export const THEME_KEYS = Object.freeze(Object.keys(THEMES));
export const AI_KEYS = Object.freeze(['aggro', 'passive', 'hold']);
/** The tools, in the order Q / E step through them. */
export const TOOLS = Object.freeze([
	{ id: 'raise', name: 'Raise', say: 'Z lifts the tile one level' },
	{ id: 'lower', name: 'Lower', say: 'Z lowers it one level (below 0: a gap)' },
	{ id: 'ground', name: 'Ground', say: 'Z paints the ground; C picks which' },
	{ id: 'geo', name: 'Geo', say: 'Z paints a Geo colour; C picks which' },
	{ id: 'foe', name: 'Foe', say: 'Z places / removes a foe; C picks the Pokémon, V its level' },
	{ id: 'base', name: 'Base', say: 'Z puts your base here' },
	{ id: 'seat', name: 'PvP seat', say: 'Z places the next Versus base (1-4) or removes one: 2+ make it an arena' },
]);
export const MAX_SEATS = 4;

const fill = (w, h, c) => Array.from({ length: h }, () => c.repeat(w));
const setCh = (row, x, c) => row.slice(0, x) + c + row.slice(x + 1);

/** A new map: flat ground, the base in a corner, one foe across from it. */
export function newMap(name = 'My map', w = 8, h = 8, theme = 'meadow') {
	return { v: 1, name, theme, rows: fill(w, h, '.'), ground: fill(w, h, '.'), geo: fill(w, h, '.'), base: [0, h - 1], foes: [{ sp: 'rattata', lv: 5, x: w - 1, y: 0, ai: 'aggro' }], symbols: [], seats: [] };
}
const size = (m) => ({ w: m.rows[0].length, h: m.rows.length });
const heightCh = (c) => (c === '#' ? null : c === '.' ? 0 : Number(c));
const toCh = (h) => (h == null ? '#' : h === 0 ? '.' : String(h));
export const heightAtM = (m, x, y) => heightCh(m.rows[y][x]);

/** Apply a tool at (x, y). opt: { ground, geo, foe: { sp, lv, ai } }. -> { map, why? } (a new map; why: nothing changed) */
export function apply(m0, tool, x, y, opt = {}) {
	const { w, h } = size(m0);
	if (x < 0 || y < 0 || x >= w || y >= h) return { map: m0, why: 'off the map' };
	const m = { ...m0, rows: [...m0.rows], ground: [...m0.ground], geo: [...m0.geo], foes: m0.foes.map((f) => ({ ...f })), symbols: (m0.symbols || []).map((s) => ({ ...s })), seats: (m0.seats || []).map((b) => [...b]) };
	const seatI = m.seats.findIndex(([sx, sy]) => sx === x && sy === y);
	const hv = heightAtM(m, x, y), isBase = m.base[0] === x && m.base[1] === y, foeI = m.foes.findIndex((f) => f.x === x && f.y === y);
	if (tool === 'raise') {
		if (hv != null && hv >= MAX_LEVEL) return { map: m0, why: 'as high as it goes' };
		m.rows[y] = setCh(m.rows[y], x, toCh(hv == null ? 0 : hv + 1));
	} else if (tool === 'lower') {
		if (hv == null) return { map: m0, why: 'already a gap' };
		if (hv === 0 && (isBase || foeI >= 0 || seatI >= 0)) return { map: m0, why: isBase || seatI >= 0 ? 'a base needs ground' : 'a foe stands there' };
		m.rows[y] = setCh(m.rows[y], x, toCh(hv === 0 ? null : hv - 1));
	} else if (tool === 'ground') {
		const g = GROUND_KEYS.includes(opt.ground) ? opt.ground : '.';
		if (hv == null) return { map: m0, why: 'a gap has no ground' };
		if ((isBase || seatI >= 0) && ['w', 'l', 'i'].includes(g)) return { map: m0, why: 'not under a base' };
		m.ground[y] = setCh(m.ground[y], x, g);
	} else if (tool === 'geo') {
		const g = GEO_KEYS.includes(opt.geo) ? opt.geo : '.';
		if (hv == null) return { map: m0, why: 'a gap has no panel' };
		m.geo[y] = setCh(m.geo[y], x, g);
	} else if (tool === 'foe') {
		if (foeI >= 0) m.foes.splice(foeI, 1);
		else {
			if (hv == null) return { map: m0, why: 'a foe needs ground' };
			if (isBase) return { map: m0, why: 'not on your base' };
			if (m.foes.length >= MAX_FOES) return { map: m0, why: MAX_FOES + ' foes at most' };
			const f = opt.foe || {};
			m.foes.push({ sp: String(f.sp || 'rattata'), lv: clampLv(f.lv), x, y, ai: AI_KEYS.includes(f.ai) ? f.ai : 'aggro' });
		}
	} else if (tool === 'base') {
		if (hv == null) return { map: m0, why: 'the base needs ground' };
		if (foeI >= 0) return { map: m0, why: 'a foe stands there' };
		m.base = [x, y];
		if (['w', 'l', 'i'].includes(m.ground[y][x])) m.ground[y] = setCh(m.ground[y], x, '.');
	} else if (tool === 'seat') {
		if (seatI >= 0) m.seats.splice(seatI, 1);
		else {
			if (hv == null) return { map: m0, why: 'a base needs ground' };
			if (m.seats.length >= MAX_SEATS) return { map: m0, why: MAX_SEATS + ' seats at most' };
			m.seats.push([x, y]);
			if (['w', 'l', 'i'].includes(m.ground[y][x])) m.ground[y] = setCh(m.ground[y], x, '.');
		}
	} else return { map: m0, why: 'no such tool' };
	return { map: m };
}
const clampLv = (lv) => Math.max(1, Math.min(FOE_LV_MAX, Math.floor(+lv) || 5));

/** Grow or shrink the map (dw / dh: +1 / -1), keeping what fits; the base and foes come along or are dropped. */
export function resize(m0, dw, dh) {
	const { w, h } = size(m0), W = Math.max(MIN_W, Math.min(MAX_W, w + dw)), H = Math.max(MIN_H, Math.min(MAX_H, h + dh));
	if (W === w && H === h) return { map: m0, why: 'that is the limit' };
	const cut = (rows, c) => Array.from({ length: H }, (_, y) => (y < h ? rows[y].slice(0, W) : '').padEnd(W, c));
	const m = { ...m0, rows: cut(m0.rows, '.'), ground: cut(m0.ground, '.'), geo: cut(m0.geo, '.'), foes: m0.foes.filter((f) => f.x < W && f.y < H).map((f) => ({ ...f })), symbols: (m0.symbols || []).filter((s) => s.x < W && s.y < H), seats: (m0.seats || []).filter(([x, y]) => x < W && y < H).map((b) => [...b]) };
	if (m0.base[0] >= W || m0.base[1] >= H) m.base = [Math.min(m0.base[0], W - 1), Math.min(m0.base[1], H - 1)];
	if (heightAtM(m, m.base[0], m.base[1]) == null) m.rows[m.base[1]] = setCh(m.rows[m.base[1]], m.base[0], '.');
	m.foes = m.foes.filter((f) => !(f.x === m.base[0] && f.y === m.base[1]));
	return { map: m };
}

/** What stops a map being played: [] when it is ready. */
export function problems(m) {
	const out = [];
	if (!m || !Array.isArray(m.rows) || !m.rows.length) return ['no map'];
	const { w, h } = size(m);
	if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H) out.push(`size ${w} x ${h}: ${MIN_W}-${MAX_W} by ${MIN_H}-${MAX_H}`);
	if (!m.foes.length) out.push('no foes: place at least one');
	const [bx, by] = m.base;
	if (heightAtM(m, bx, by) == null) out.push('the base is on a gap');
	// every foe can be reached: a figurine (Jump 2) can walk from the base to a tile next to it
	const map = { w, h, height: m.rows.flatMap((r) => [...r].map(heightCh)) };
	const walk = reach(map, bx, by, 999, 2, () => null);
	for (const f of m.foes) {
		if (heightAtM(m, f.x, f.y) == null) { out.push(`a foe at ${f.x},${f.y} stands on a gap`); continue; }
		const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => walk.has((f.x + dx) + ',' + (f.y + dy)));
		if (!near) out.push(`no way to reach the foe at ${f.x},${f.y} from the base (a figurine climbs 2 levels a step)`);
	}
	return out;
}

/** What stops a map being a Versus arena for `n` players: [] when it can be. Its seats must be on ground, and each able to walk to
 *  every other (so no side starts walled in). */
export function arenaProblems(m, n = 2) {
	const out = [], seats = m.seats || [];
	if (seats.length < n) out.push(`${n} players need ${n} PvP seats (it has ${seats.length})`);
	const { w, h } = size(m), map = { w, h, height: m.rows.flatMap((r) => [...r].map(heightCh)) };
	for (const [x, y] of seats) {
		if (heightAtM(m, x, y) == null) { out.push(`the seat at ${x},${y} is on a gap`); continue; }
		const walk = reach(map, x, y, 999, 2, () => null);
		if (!seats.every(([a, b]) => walk.has(a + ',' + b))) out.push(`the seat at ${x},${y} can't walk to every other seat`);
	}
	return [...new Set(out)];
}

/** A map read defensively (from storage, a share code, another player): the same shape, or null. */
export function cleanMap(x, knownSpecies) {
	try {
		if (!x || typeof x !== 'object' || !Array.isArray(x.rows)) return null;
		const H = x.rows.length, W = String(x.rows[0] || '').length;
		if (W < MIN_W || W > MAX_W || H < MIN_H || H > MAX_H) return null;
		const grid = (rows, ok, def) => Array.from({ length: H }, (_, y) => [...String((rows || [])[y] || '').padEnd(W, def).slice(0, W)].map((c) => (ok(c) ? c : def)).join(''));
		const rows = grid(x.rows, (c) => c === '#' || c === '.' || /^[1-9]$/.test(c), '.');
		const m = { v: 1, name: String(x.name || 'Untitled').replace(/[<>]/g, '').slice(0, NAME_MAX) || 'Untitled', theme: THEME_KEYS.includes(x.theme) ? x.theme : 'meadow',
			rows, ground: grid(x.ground, (c) => GROUND_KEYS.includes(c), '.'), geo: grid(x.geo, (c) => GEO_KEYS.includes(c), '.'), symbols: [] };
		const bx = Math.max(0, Math.min(W - 1, (x.base || [])[0] | 0)), by = Math.max(0, Math.min(H - 1, (x.base || [])[1] | 0));
		m.base = [bx, by];
		const seen = new Set([bx + ',' + by]);
		m.foes = (Array.isArray(x.foes) ? x.foes : []).filter((f) => f && Number.isInteger(f.x) && Number.isInteger(f.y) && f.x >= 0 && f.y >= 0 && f.x < W && f.y < H && typeof f.sp === 'string' && /^[a-z0-9-]{1,40}$/.test(f.sp) && (!knownSpecies || knownSpecies(f.sp)))
			.filter((f) => { const k = f.x + ',' + f.y; if (seen.has(k)) return false; seen.add(k); return true; })
			.slice(0, MAX_FOES).map((f) => ({ sp: f.sp, lv: clampLv(f.lv), x: f.x, y: f.y, ai: AI_KEYS.includes(f.ai) ? f.ai : 'aggro' }));
		m.seats = (Array.isArray(x.seats) ? x.seats : []).filter((b) => Array.isArray(b) && Number.isInteger(b[0]) && Number.isInteger(b[1]) && b[0] >= 0 && b[1] >= 0 && b[0] < W && b[1] < H)
			.filter(([sx, sy]) => { const k = 's' + sx + ',' + sy; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_SEATS).map(([sx, sy]) => [sx, sy]);
		return m;
	} catch { return null; }
}

/** The map as a Versus arena (arenas.js format: its seats are the bases). */
export const asArena = (m) => ({ id: 'custom', name: m.name, theme: m.theme, tip: 'A made arena: ' + m.name + '.', rows: m.rows, ground: m.ground, geo: m.geo, symbols: [], bases: (m.seats || []).map((b) => [...b]) });

/** The map as a campaign.js map (buildMap / campaignSetup read it): no reward, a made-up chapter, the tip. */
export function asPlayable(m, id = 'custom') {
	return { id, chapter: 0, name: m.name, theme: m.theme, rows: m.rows, ground: m.ground, geo: m.geo, base: m.base, symbols: m.symbols || [], foes: m.foes,
		tip: 'A made map: ' + m.name + '. Beat every foe. (No stars or Bonus Gauge here: EXP only.)', custom: true, reward: { stars: 0 } };
}
