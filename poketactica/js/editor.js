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
	// (plan item K1) TOWER DEFENSE marks: gates the enemies come in by, and the base they walk to
	{ id: 'tdgate', name: 'TD gate', say: 'Z places / removes a Tower Defense gate (1-3): enemies come in here' },
	{ id: 'tdbase', name: 'TD base', say: 'Z sets the Tower Defense base: enemies walk to it. For a Road map, paint the road in Dirt (Ground)' },
]);
/**
 * MAZE BUILDER AND ROAD MAPS IN THE MAP MAKER (Plans/POKETACTICA_MODES_PLAN.md item K1). "It makes battle maps only."
 * A made map may carry Tower Defense marks, `td: { gates: [[x, y]] (1-3), base: [x, y] }`, beside its Versus seats:
 *   Maze Builder   the gates and the base on flat open ground, a way between them (asTdMaze)
 *   the Road       the same, and a ROAD painted in Dirt from every gate to the base (asTdRoad: the road is the
 *                  shortest walk over dirt tiles)
 * A made Tower Defense map is for practice: it pays no stars and no EXP and keeps no record (as a made battle did).
 */
export const MAX_GATES = 3;
const THEME_GROUND = { meadow: 'g', forest: 'g', ruins: 's', spire: 's', tower: 'f', islands: 'a' };
export const tdOf = (m) => ({ gates: ((m && m.td && m.td.gates) || []).map((g) => [g[0], g[1]]), base: m && m.td && Array.isArray(m.td.base) ? [m.td.base[0], m.td.base[1]] : null });
const flat = (m, x, y) => m.rows[y] && m.rows[y][x] === '.' && !['w', 'l', 'i'].includes(m.ground[y][x]);
/** The shortest walk from a to b over tiles `ok` allows (4 ways): -> [[x, y]] or null. */
function walkOver(m, a, b, ok) {
	const { w, h } = size(m), key = (x, y) => y * w + x, prev = new Map([[key(a[0], a[1]), -1]]), q = [a];
	while (q.length) {
		const [x, y] = q.shift();
		if (x === b[0] && y === b[1]) { const out = []; for (let k = key(x, y); k !== -1; k = prev.get(k)) out.unshift([k % w, Math.floor(k / w)]); return out; }
		for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || prev.has(key(nx, ny)) || !ok(nx, ny)) continue; prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]); }
	}
	return null;
}
/** Why this map cannot be played as Tower Defense of this kind ('maze' | 'road'), in words; [] when it can. */
export function tdProblems(m, kind = 'maze') {
	const { gates, base } = tdOf(m), out = [];
	if (!base) out.push('place the Tower Defense base');
	if (!gates.length) out.push('place at least one Tower Defense gate');
	if (out.length) return out;
	if (!flat(m, base[0], base[1])) out.push('the base must be on flat open ground');
	gates.forEach((g, i) => { if (!flat(m, g[0], g[1])) out.push(`gate ${i + 1} must be on flat open ground`); else if (Math.abs(g[0] - base[0]) + Math.abs(g[1] - base[1]) < 4) out.push(`gate ${i + 1} is too close to the base`); });
	if (out.length) return out;
	const dirt = (x, y) => flat(m, x, y) && (m.ground[y][x] === 'd' || (x === base[0] && y === base[1]) || gates.some((g) => g[0] === x && g[1] === y));
	gates.forEach((g, i) => { if (!walkOver(m, g, base, kind === 'road' ? dirt : (x, y) => flat(m, x, y))) out.push(kind === 'road' ? `no road of Dirt joins gate ${i + 1} to the base` : `gate ${i + 1} has no way to the base over flat ground`); });
	return out;
}
/** Can it be played as Tower Defense at all (either kind)? */
export const tdPlayable = (m) => tdProblems(m, 'maze').length === 0;
const tdGround = (m) => m.ground.map((row) => [...row].map((c) => (c === '.' ? THEME_GROUND[m.theme] || 'g' : c)).join(''));
/** The made map as a Maze Builder map (td/maps.js format), or null. */
export function asTdMaze(m) {
	if (tdProblems(m, 'maze').length) return null;
	const { gates, base } = tdOf(m);
	return { id: 'custom', custom: true, made: m, name: m.name, theme: m.theme, tip: 'A made Maze Builder map: ' + m.name + '. Practice: no stars, no EXP, no record.', rows: m.rows, ground: tdGround(m), gates, base };
}
/** The made map as a Road map (its road: the shortest walk over Dirt from each gate), or null. */
export function asTdRoad(m) {
	if (tdProblems(m, 'road').length) return null;
	const { gates, base } = tdOf(m), g2 = tdGround(m).map((r) => r.split(''));
	const dirt = (x, y) => flat(m, x, y) && (m.ground[y][x] === 'd' || (x === base[0] && y === base[1]) || gates.some((g) => g[0] === x && g[1] === y));
	const paths = gates.map((g) => walkOver(m, g, base, dirt));
	for (const p of paths) for (const [x, y] of p) g2[y][x] = 'd';
	return { id: 'custom', custom: true, made: m, road: true, name: m.name, theme: m.theme, tip: 'A made Road map: ' + m.name + '. Practice: no stars, no EXP, no record.', rows: m.rows, ground: g2.map((r) => r.join('')), paths, base };
}
/** A made map out of a run's recipe, as the Tower Defense map it was played as (td/replay.js): 'road' | 'maze'. */
export const tdFromMade = (made, kind) => { const m = cleanMap(made); return m ? (kind === 'road' ? asTdRoad(m) : asTdMaze(m)) : null; };
export const MAX_SEATS = 4, MIN_SEATS = 2;
/** Why this map can't be saved or shared (owner, 2026-11-22: made maps are PvP maps, so every saved one has at least 2
 *  base panels), or null. */
export const saveBlock = (m) => ((m.seats || []).length < MIN_SEATS && !tdPlayable(m) ? `place at least ${MIN_SEATS} PvP bases, or a Tower Defense base and a gate, to save` : null);   // (plan item K1: a Tower Defense map is a map to keep too)
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
	const m = { ...m0, rows: [...m0.rows], ground: [...m0.ground], geo: [...m0.geo], seats: (m0.seats || []).map((b) => [...b]), foes: (m0.foes || []).map((f) => ({ ...f })), ...(m0.td ? { td: tdOf(m0) } : {}) };
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
	} else if (tool === 'tdgate' || tool === 'tdbase') {
		const td = tdOf(m), gi = td.gates.findIndex((g) => g[0] === x && g[1] === y), isBase = td.base && td.base[0] === x && td.base[1] === y;
		if (tool === 'tdgate') {
			if (gi >= 0) td.gates.splice(gi, 1);
			else { if (hv !== 0) return { map: m0, why: 'a gate needs flat ground' }; if (isBase) return { map: m0, why: 'the base is there' }; if (td.gates.length >= MAX_GATES) return { map: m0, why: MAX_GATES + ' gates at most' }; td.gates.push([x, y]); }
		} else if (isBase) td.base = null;
		else { if (hv !== 0) return { map: m0, why: 'the base needs flat ground' }; if (gi >= 0) return { map: m0, why: 'a gate is there' }; td.base = [x, y]; }
		if (td.gates.length || td.base) m.td = { gates: td.gates, ...(td.base ? { base: td.base } : {}) }; else delete m.td;
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
		// (plan item K1) Tower Defense marks: gates and a base on the map, on ground
		if (x.td && typeof x.td === 'object') {
			const on = (b) => Array.isArray(b) && Number.isInteger(b[0]) && Number.isInteger(b[1]) && b[0] >= 0 && b[1] >= 0 && b[0] < W && b[1] < H && rows[b[1]][b[0]] !== '#';
			const gs = new Set(), gates = (Array.isArray(x.td.gates) ? x.td.gates : []).filter(on).filter(([gx, gy]) => { const k = gx + ',' + gy; if (gs.has(k)) return false; gs.add(k); return true; }).slice(0, MAX_GATES).map(([gx, gy]) => [gx, gy]);
			const base = on(x.td.base) && !gs.has(x.td.base[0] + ',' + x.td.base[1]) ? [x.td.base[0], x.td.base[1]] : null;
			if (gates.length || base) m.td = { gates, ...(base ? { base } : {}) };
		}
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
