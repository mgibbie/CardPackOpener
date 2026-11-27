// editor.js — the MAP MAKER's model (owner, 2026-11-22: "Map editor"): a map (rows / geo / ground / seats / theme / name),
// the tools that change it, its checks, and the form it is saved and shared in. Made maps are VERSUS ARENAS ONLY (owner,
// 2026-11-22: "Maps made with Map Maker should only be usable in PVP"): no solo base, no solo play; the seats are where
// each side deploys (2-4), and its FOES are wild Pokémon that fight every side (owner, 2026-11-22: "4 players AND foes";
// battle.js wildPhase). Pure (node-tested: overworld/tests/poketactica_editor_test.mjs); the page is editmode.js.
import { GROUND_CHAR } from './campaign.js';
import { THEMES } from './themes.js';
import { reach } from './engine/grid.js';

export const MIN_W = 5, MAX_W = 32, MIN_H = 5, MAX_H = 32, MAX_LEVEL = 9, NAME_MAX = 24;   // (owner, 2026-11-22: bigger than 8 x 8, then than 20 x 20)
export const MAX_FOES = 24, FOE_LV_MAX = 100;
/** The sizes a new map can start at (Wider / Narrower / Taller / Shorter change it after, a tile at a time). */
export const NEW_SIZES = Object.freeze([[8, 8], [12, 12], [16, 16], [24, 24], [32, 32]]);
export const AI_KEYS = Object.freeze(['aggro', 'passive', 'hold']);
export const GROUND_KEYS = Object.freeze(['.', ...Object.keys(GROUND_CHAR)]);        // '.' = the theme's own
export const GEO_KEYS = Object.freeze(['.', 'r', 'b', 'p', 'o', 'c', 'y', 'g']);
export const THEME_KEYS = Object.freeze(Object.keys(THEMES));
/** The tools, in the order C steps through them. */
export const TOOLS = Object.freeze([
	{ id: 'raise', name: 'Raise', say: 'Z lifts the tile one level' },
	{ id: 'lower', name: 'Lower', say: 'Z lowers it one level (below 0: a gap)' },
	{ id: 'ground', name: 'Ground', say: 'Z paints the ground; C picks which' },
	{ id: 'geo', name: 'Geo', say: 'Z paints a Geo colour; C picks which' },
	{ id: 'foe', name: 'Foe', say: 'Z places / removes a wild foe (it fights every side); V its level, the menu its Pokémon' },
	{ id: 'seat', name: 'PvP seat', say: 'Z places the next Versus base (1-4) or removes one: 2+ make it an arena' },
]);
export const MAX_SEATS = 4, MIN_SEATS = 2;
/** Why this map can't be saved or shared (owner, 2026-11-22: made maps are PvP maps, so every saved one has at least 2
 *  base panels), or null. */
export const saveBlock = (m) => ((m.seats || []).length < MIN_SEATS ? `place at least ${MIN_SEATS} PvP bases to save (it has ${(m.seats || []).length})` : null);
/** How many can play on it: one player (or computer) per base panel, 2-4 (0: none, under 2 panels). */
export const maxPlayers = (m) => { const n = Math.min(MAX_SEATS, (m.seats || []).length); return n >= MIN_SEATS ? n : 0; };

const fill = (w, h, c) => Array.from({ length: h }, () => c.repeat(w));
const setCh = (row, x, c) => row.slice(0, x) + c + row.slice(x + 1);

/** A new map: flat ground, two seats in opposite corners (an arena for 2 at once). */
export function newMap(name = 'My map', w = 8, h = 8, theme = 'meadow') {
	w = Math.max(MIN_W, Math.min(MAX_W, w | 0 || 8)); h = Math.max(MIN_H, Math.min(MAX_H, h | 0 || 8));
	return { v: 1, name, theme, rows: fill(w, h, '.'), ground: fill(w, h, '.'), geo: fill(w, h, '.'), seats: [[0, h - 1], [w - 1, 0]], foes: [] };
}
const size = (m) => ({ w: m.rows[0].length, h: m.rows.length });
const heightCh = (c) => (c === '#' ? null : c === '.' ? 0 : Number(c));
const toCh = (h) => (h == null ? '#' : h === 0 ? '.' : String(h));
export const heightAtM = (m, x, y) => heightCh(m.rows[y][x]);

/** Apply a tool at (x, y). opt: { ground, geo, foe: { sp, lv, ai } }. -> { map, why? } (a new map; why: nothing changed) */
export function apply(m0, tool, x, y, opt = {}) {
	const { w, h } = size(m0);
	if (x < 0 || y < 0 || x >= w || y >= h) return { map: m0, why: 'off the map' };
	const m = { ...m0, rows: [...m0.rows], ground: [...m0.ground], geo: [...m0.geo], seats: (m0.seats || []).map((b) => [...b]), foes: (m0.foes || []).map((f) => ({ ...f })) };
	const seatI = m.seats.findIndex(([sx, sy]) => sx === x && sy === y), foeI = m.foes.findIndex((f) => f.x === x && f.y === y);
	const hv = heightAtM(m, x, y);
	if (tool === 'raise') {
		if (hv != null && hv >= MAX_LEVEL) return { map: m0, why: 'as high as it goes' };
		m.rows[y] = setCh(m.rows[y], x, toCh(hv == null ? 0 : hv + 1));
	} else if (tool === 'lower') {
		if (hv == null) return { map: m0, why: 'already a gap' };
		if (hv === 0 && (seatI >= 0 || foeI >= 0)) return { map: m0, why: seatI >= 0 ? 'a base needs ground' : 'a foe stands there' };
		m.rows[y] = setCh(m.rows[y], x, toCh(hv === 0 ? null : hv - 1));
	} else if (tool === 'ground') {
		const g = GROUND_KEYS.includes(opt.ground) ? opt.ground : '.';
		if (hv == null) return { map: m0, why: 'a gap has no ground' };
		if (seatI >= 0 && ['w', 'l', 'i'].includes(g)) return { map: m0, why: 'not under a base' };
		m.ground[y] = setCh(m.ground[y], x, g);
	} else if (tool === 'geo') {
		const g = GEO_KEYS.includes(opt.geo) ? opt.geo : '.';
		if (hv == null) return { map: m0, why: 'a gap has no panel' };
		m.geo[y] = setCh(m.geo[y], x, g);
	} else if (tool === 'foe') {
		if (foeI >= 0) m.foes.splice(foeI, 1);
		else {
			if (hv == null) return { map: m0, why: 'a foe needs ground' };
			if (seatI >= 0) return { map: m0, why: 'not on a PvP seat' };
			if (m.foes.length >= MAX_FOES) return { map: m0, why: MAX_FOES + ' foes at most' };
			const f = opt.foe || {};
			m.foes.push({ sp: String(f.sp || 'rattata'), lv: clampLv(f.lv), x, y, ai: AI_KEYS.includes(f.ai) ? f.ai : 'aggro' });
		}
	} else if (tool === 'seat') {
		if (seatI >= 0) m.seats.splice(seatI, 1);
		else {
			if (hv == null) return { map: m0, why: 'a base needs ground' };
			if (foeI >= 0) return { map: m0, why: 'a foe stands there' };
			if (m.seats.length >= MAX_SEATS) return { map: m0, why: MAX_SEATS + ' seats at most' };
			m.seats.push([x, y]);
			if (['w', 'l', 'i'].includes(m.ground[y][x])) m.ground[y] = setCh(m.ground[y], x, '.');
		}
	} else return { map: m0, why: 'no such tool' };
	return { map: m };
}
const clampLv = (lv) => Math.max(1, Math.min(FOE_LV_MAX, Math.floor(+lv) || 5));

/** Grow or shrink the map (dw / dh: +1 / -1), keeping what fits; seats and foes that no longer fit are dropped. */
export function resize(m0, dw, dh) {
	const { w, h } = size(m0), W = Math.max(MIN_W, Math.min(MAX_W, w + dw)), H = Math.max(MIN_H, Math.min(MAX_H, h + dh));
	if (W === w && H === h) return { map: m0, why: 'that is the limit' };
	const cut = (rows, c) => Array.from({ length: H }, (_, y) => (y < h ? rows[y].slice(0, W) : '').padEnd(W, c));
	const m = { ...m0, rows: cut(m0.rows, '.'), ground: cut(m0.ground, '.'), geo: cut(m0.geo, '.'), seats: (m0.seats || []).filter(([x, y]) => x < W && y < H).map((b) => [...b]), foes: (m0.foes || []).filter((f) => f.x < W && f.y < H).map((f) => ({ ...f })) };
	return { map: m };
}

/** What stops a map being played (as a Versus arena for 2, the fewest): [] when it is ready. */
export function problems(m) {
	if (!m || !Array.isArray(m.rows) || !m.rows.length) return ['no map'];
	const { w, h } = size(m);
	if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H) return [`size ${w} x ${h}: ${MIN_W}-${MAX_W} by ${MIN_H}-${MAX_H}`];
	return arenaProblems(m, 2);
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

/**
 * A CHECK BEFORE SHARING, IN WORDS (Plans/POKETACTICA_MODES_PLAN.md item K2). A map with two bases could be shared
 * whatever else was wrong with it: a base on a gap, bases that cannot reach each other. What is wrong is said the way a
 * player would say it, by base number (base 1 is the first one placed).
 *   stops   the map cannot be played: it is not shared until these are mended
 *   warns   it can be played, but something on it will surprise: said, and the map may be shared anyway
 * names: (species id) -> its name, for the wild Pokémon (the id when not given).
 */
export function shareCheck(m, names = (id) => id) {
	const stops = [], warns = [];
	if (!m || !Array.isArray(m.rows) || !m.rows.length) return { stops: ['There is no map.'], warns };
	const { w, h } = size(m), seats = m.seats || [], foes = m.foes || [];
	if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H) stops.push(`The map is ${w} by ${h}: it must be ${MIN_W} to ${MAX_W} wide and ${MIN_H} to ${MAX_H} tall.`);
	if (seats.length < MIN_SEATS) stops.push(`It has ${seats.length === 1 ? '1 base' : seats.length + ' bases'}: an arena needs at least ${MIN_SEATS}.`);
	const map = { w, h, height: m.rows.flatMap((r) => [...r].map(heightCh)) };
	const walks = seats.map(([x, y]) => (heightAtM(m, x, y) == null ? null : reach(map, x, y, 999, 2, () => null)));
	seats.forEach(([x, y], i) => { if (!walks[i]) stops.push(`Base ${i + 1} stands on a gap. Move it onto ground.`); });
	for (let i = 0; i < seats.length; i++) for (let k = i + 1; k < seats.length; k++) {
		if (!walks[i] || !walks[k]) continue;
		if (!walks[i].has(seats[k][0] + ',' + seats[k][1]) || !walks[k].has(seats[i][0] + ',' + seats[i][1])) stops.push(`Base ${i + 1} and base ${k + 1} cannot reach each other on foot: a gap, or a cliff more than 2 levels high, is in the way.`);
	}
	for (const f of foes) {
		const nm = names(f.sp), near = seats.findIndex(([x, y]) => Math.max(Math.abs(x - f.x), Math.abs(y - f.y)) <= 1);
		if (near >= 0) warns.push(`The wild ${nm} stands right next to base ${near + 1}: that side is attacked at once.`);
		if (heightAtM(m, f.x, f.y) == null) { warns.push(`The wild ${nm} stands on a gap.`); continue; }
		if (walks.some(Boolean) && !walks.some((wk) => wk && wk.has(f.x + ',' + f.y))) warns.push(`No base can walk to the wild ${nm} at ${f.x + 1}, ${f.y + 1}: it may never fight.`);
	}
	return { stops: [...new Set(stops)], warns: [...new Set(warns)] };
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
		// (a map made before made maps were Versus-only may carry a solo base: it is left behind)
		const seen = new Set();
		m.seats = (Array.isArray(x.seats) ? x.seats : []).filter((b) => Array.isArray(b) && Number.isInteger(b[0]) && Number.isInteger(b[1]) && b[0] >= 0 && b[1] >= 0 && b[0] < W && b[1] < H)
			.filter(([sx, sy]) => { const k = sx + ',' + sy; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, MAX_SEATS).map(([sx, sy]) => [sx, sy]);
		// wild foes: on the map, one to a tile, never on a seat; a species this page does not know is dropped
		m.foes = (Array.isArray(x.foes) ? x.foes : []).filter((f) => f && Number.isInteger(f.x) && Number.isInteger(f.y) && f.x >= 0 && f.y >= 0 && f.x < W && f.y < H && rows[f.y][f.x] !== '#' && typeof f.sp === 'string' && /^[a-z0-9-]{1,40}$/.test(f.sp) && (!knownSpecies || knownSpecies(f.sp)))
			.filter((f) => { const k = f.x + ',' + f.y; if (seen.has(k)) return false; seen.add(k); return true; })
			.slice(0, MAX_FOES).map((f) => ({ sp: f.sp, lv: clampLv(f.lv), x: f.x, y: f.y, ai: AI_KEYS.includes(f.ai) ? f.ai : 'aggro' }));
		return m;
	} catch { return null; }
}

/** The map as a Versus arena (arenas.js format: its seats are the bases, its foes wild). */
export const asArena = (m) => ({ id: 'custom', name: m.name, theme: m.theme, tip: 'A made arena: ' + m.name + '.' + ((m.foes || []).length ? ' Wild Pokémon fight every side.' : ''), rows: m.rows, ground: m.ground, geo: m.geo, symbols: [], bases: (m.seats || []).map((b) => [...b]), foes: (m.foes || []).map((f) => ({ ...f })) });

/** The map as a board for the editor to draw (campaign.js format, its foes standing on it; its 'base' only aims the camera). */
export function asBoard(m) {
	const s = (m.seats || [])[0] || [0, 0];
	return { id: 'custom', chapter: 0, name: m.name, theme: m.theme, rows: m.rows, ground: m.ground, geo: m.geo, base: [s[0], s[1]], symbols: [], foes: m.foes || [], custom: true, reward: { stars: 0 } };
}
/** A made-map SOLO battle saved on a device before made maps became Versus-only (its recipe carries the old map, foes and
 *  base): it can still be finished (EXP only), never started. */
export function asPlayable(m, id = 'custom') {
	return { id, chapter: 0, name: m.name, theme: m.theme, rows: m.rows, ground: m.ground, geo: m.geo, base: m.base || [0, 0], symbols: m.symbols || [], foes: m.foes || [],
		tip: 'A made map: ' + m.name + '. (No stars or Bonus Gauge here: EXP only.)', custom: true, reward: { stars: 0 } };
}
