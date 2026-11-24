// geo.js — Geo Panels, Geo Symbols, chains and the Bonus Gauge (stage 3c; owner, 2026-11-20, from a Disgaea screenshot).
// Pure; battle.js calls it. The owner's rules:
//   - tiles painted in Geo colours; a SYMBOL (a pyramid, an object on a tile) gives its effect to EVERY unit on EVERY tile
//     of the colour it sits on, both sides
//   - effects: Disgaea's classics AND Pokémon ones (GEO_EFFECTS below)
//   - terrain moves paint Geo colours (TERRAIN_COLOR); a terrain colour chains like any other
//   - destroying a symbol repaints its panel colour's tiles to the SYMBOL's colour, one tile at a time spiralling out from
//     it; every unit on a changing tile takes damage, the player's own included; a symbol caught in the repaint is destroyed
//     and repaints in turn; clearing every coloured tile is a map-wide blast on the enemy side
//   - the BONUS GAUGE (levels 0-9, its reward list rolled at the start) fills from KOs, combos, team attacks and chains,
//     and pays every reward up to its level at the end: stars, figurines (rarer higher up), EXP + move XP, overworld items,
//     and packs of both card games
import { key } from './grid.js';

// the base Geo colours (Disgaea's), and the terrain colours (Pokémon's terrains, painted by moves and abilities)
export const GEO_COLORS = ['red', 'blue', 'purple', 'orange', 'cyan'];
export const TERRAIN_COLOR = { electric: 'yellow', grassy: 'green', psychic: 'pink', misty: 'white' };
export const COLOR_TERRAIN = Object.fromEntries(Object.entries(TERRAIN_COLOR).map(([k, v]) => [v, k]));

/**
 * The symbol effects. A symbol is { id, x, y, color (its own: what it repaints to; 'clear' removes colour), effect }.
 * effect = { k, ... }:
 *   Disgaea   stat (k:'stat', stat, mult)  invincible  hurt (20% max HP each phase)  heal (20% each phase)  exp (x1.5)
 *             enemyLv (n: foes on the colour start N levels higher)  noLift  allyDamage (attacks also hit allies)  silence
 *             (no status moves)
 *   Pokémon   typeBoost (type, x1.5)  weather (kind: attacks from the colour count as in that weather)  status (st each
 *             phase)  noMiss  immune (type)
 */
export const GEO_EFFECTS = ['stat', 'invincible', 'hurt', 'heal', 'exp', 'enemyLv', 'noLift', 'allyDamage', 'silence', 'typeBoost', 'weather', 'status', 'noMiss', 'immune'];
export const GEO_HURT = 0.2, GEO_HEAL = 0.2, GEO_EXP = 1.5, GEO_STAT = 1.5, GEO_TYPE = 1.5;
export const CHAIN_HURT = 0.1, CHAIN_STEP = 0.1;   // a repaint hurts 10% max HP, +10% per earlier tile in the chain (TUNE)
export const BLAST_HURT = 0.2;                     // the map-wide blast when every coloured tile is cleared

export function setupGeo(S, map) {
	S.geo = (map.geo || Array(map.w * map.h).fill(null)).slice();
	S.symbols = (map.symbols || []).map((s, i) => ({ id: s.id || 'g' + i, x: s.x, y: s.y, color: s.color, effect: { ...s.effect } }));
	S.geoHadColor = S.geo.some(Boolean);
}
export const colorAt = (S, x, y) => (x >= 0 && y >= 0 && x < S.map.w && y < S.map.h ? S.geo[y * S.map.w + x] : null);
export const symbolAt = (S, x, y) => S.symbols.find((g) => g.x === x && g.y === y) || null;

/**
 * The effects on a tile: every symbol whose own tile's colour matches this tile's colour. (A symbol with a `panel` is
 * off the board and powers that colour wherever it is laid: Tower Defense's Maze Builder, td/sim.js. No battle map has one.)
 */
export function effectsAt(S, x, y) {
	const c = colorAt(S, x, y);
	if (!c) return [];
	return S.symbols.filter((g) => (g.panel || colorAt(S, g.x, g.y)) === c).map((g) => g.effect);
}
export const has = (S, x, y, k) => effectsAt(S, x, y).find((e) => e.k === k) || null;
/** The terrain a tile counts as (a terrain colour). */
export const terrainAt = (S, x, y) => COLOR_TERRAIN[colorAt(S, x, y)] || null;

/** Paint a diamond with a terrain's colour (terrain moves and abilities). */
export function paint(S, tiles, terrainKind) {
	const c = TERRAIN_COLOR[terrainKind];
	if (!c) return 0;
	for (const [x, y] of tiles) S.geo[y * S.map.w + x] = c;
	return tiles.length;
}

/** The spiral order of a repaint: nearest first (Manhattan), then clockwise from north. */
function spiral(sx, sy, tiles) {
	const ang = ([x, y]) => (Math.atan2(x - sx, -(y - sy)) + 2 * Math.PI) % (2 * Math.PI);
	return tiles.sort((a, b) => (Math.abs(a[0] - sx) + Math.abs(a[1] - sy)) - (Math.abs(b[0] - sx) + Math.abs(b[1] - sy)) || ang(a) - ang(b));
}

/**
 * Break a symbol and run the chain. hooks = { unitAt(x, y), hurt(unit, n, why), ev(e), foes(side) } -> the chain count
 */
export function breakSymbol(S, sym, hooks) {
	let count = 0;
	const queue = [sym];
	while (queue.length) {
		const g = queue.shift();
		const i = S.symbols.indexOf(g);
		if (i < 0) continue;
		S.symbols.splice(i, 1);
		const old = colorAt(S, g.x, g.y), neu = g.color === 'clear' ? null : g.color;
		hooks.ev({ t: 'geo-break', id: g.id, x: g.x, y: g.y, color: g.color });
		if (!old || old === neu) continue;
		const tiles = [];
		for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) if (colorAt(S, x, y) === old) tiles.push([x, y]);
		for (const [x, y] of spiral(g.x, g.y, tiles)) {
			S.geo[y * S.map.w + x] = neu;
			count++;
			hooks.ev({ t: 'repaint', x, y, color: neu, n: count });
			const u = hooks.unitAt(x, y);
			if (u) hooks.hurt(u, Math.max(1, Math.floor(u.maxHP * CHAIN_HURT * (1 + CHAIN_STEP * (count - 1)))), 'geo');
			const other = symbolAt(S, x, y);
			if (other && !queue.includes(other)) queue.push(other);
		}
	}
	addBonus(S, count * 10, 'chain');
	if (S.geoHadColor && !S.geo.some(Boolean) && !S.geoBlasted) {
		S.geoBlasted = true;
		hooks.ev({ t: 'geo-clear' });
		for (const u of hooks.foes()) hooks.hurt(u, Math.max(1, Math.floor(u.maxHP * BLAST_HURT)), 'geo-blast');
		addBonus(S, 200, 'clear');
	}
	return count;
}

// ---------- the Bonus Gauge
export const BONUS_PER_LEVEL = 100, BONUS_MAX_LEVEL = 9;
export const BONUS_KO = 50, BONUS_COMBO = 10, BONUS_TEAM = 20;
/** The reward list for levels 1-9, rolled from the battle's seed at the start (the owner's kinds). */
export function rollBonus(rng, mapLevel) {
	const L = Math.max(1, mapLevel | 0), out = [];
	for (let lv = 1; lv <= BONUS_MAX_LEVEL; lv++) {
		const r = rng(), hi = lv >= 7, mid = lv >= 4;
		let it;
		if (r < 0.28) it = { kind: 'stars', n: Math.round((10 + lv * 8) * (1 + L / 200)) };
		else if (r < 0.46) it = { kind: 'exp', n: Math.round(L * 40 * lv) };
		else if (r < 0.60) it = { kind: 'moveXp', n: 100 * lv };
		else if (r < 0.74) it = { kind: 'item', tier: hi ? 'rare' : mid ? 'uncommon' : 'common' };
		else if (r < 0.88) it = { kind: 'pack', game: rng() < 0.5 ? 'battlecards' : 'pocket' };
		else it = { kind: 'figurine', rarity: hi ? 'rare' : mid ? 'uncommon' : 'common' };
		out.push({ level: lv, ...it });
	}
	return out;
}
export function addBonus(S, n, why) {
	if (!S.bonus || !n) return;
	S.bonus.points += n;
	const lv = Math.min(BONUS_MAX_LEVEL, Math.floor(S.bonus.points / BONUS_PER_LEVEL));
	if (lv > S.bonus.level) { S.bonus.level = lv; S.log.push({ t: 'bonus-level', level: lv }); }
	S.bonus.last = why;
}
/** What the gauge pays at the end: every reward up to its level (only for a win). */
export const bonusPayout = (S) => (S.over === 'won' && S.bonus ? S.bonus.rewards.filter((r) => r.level <= S.bonus.level) : []);
export const geoKey = key;
