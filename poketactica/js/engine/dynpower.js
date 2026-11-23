// dynpower.js — moves whose POWER is not a number in the tables (Pokémon works it out when the move is used). Until
// RULES_REV 4 these all failed ("no power"): found by the moves sweep (tools/poketactica/sweep_moves.mjs).
// Pure: the user, the target, a die. The move's own level still scales the result (as it does a listed power).
import { MOVE_MAX_LEVEL } from '../figurine.js';

const flat = (n) => () => n;
const lowHp = (u) => { const p = u.hp / u.maxHP; return p < 0.042 ? 200 : p < 0.104 ? 150 : p < 0.208 ? 100 : p < 0.354 ? 80 : p < 0.688 ? 40 : 20; };
const squeeze = (top) => (u, v) => Math.max(1, Math.floor(top * v.hp / v.maxHP));
// (no weights in this game's tables: Speed stands in for them in the four weight moves, as an "expected" power)
const POWER = {
	return: flat(102), frustration: flat(102), veeveevolley: flat(102), pikapapow: flat(102),   // (a figurine is always fond of its owner)
	gyroball: (u, v) => Math.max(1, Math.min(150, Math.floor(25 * v.stats.spe / Math.max(1, u.stats.spe)) + 1)),
	electroball: (u, v) => { const r = u.stats.spe / Math.max(1, v.stats.spe); return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; },
	flail: lowHp, reversal: lowHp,
	wringout: squeeze(120), crushgrip: squeeze(120), hardpress: squeeze(100),
	punishment: (u, v) => Math.min(200, 60 + 20 * Object.values(v.boosts || {}).reduce((a, n) => a + Math.max(0, n), 0)),
	trumpcard: (u) => { const pp = (u.pp && u.pp.trumpcard) ?? 5; return pp >= 4 ? 40 : pp === 3 ? 50 : pp === 2 ? 60 : pp === 1 ? 80 : 200; },
	lowkick: flat(60), grassknot: flat(60), heavyslam: flat(80), heatcrash: flat(80),
	magnitude: (u, v, r) => { const x = r(); return x < 0.05 ? 10 : x < 0.15 ? 30 : x < 0.35 ? 50 : x < 0.65 ? 70 : x < 0.85 ? 90 : x < 0.95 ? 110 : 150; },
	present: (u, v, r) => { const x = r(); return x < 0.6 ? 40 : x < 0.9 ? 80 : 120; },
	beatup: (u, v, r, allies) => Math.min(100, 10 + 15 * (allies || 0)),
};
export const DYN_POWER = new Set(Object.keys(POWER));
/** Moves that deal a worked-out AMOUNT (not a power). */
export const DYN_FIXED = new Set(['psywave', 'endeavor', 'finalgambit']);
export const isDynamic = (id) => DYN_POWER.has(id) || DYN_FIXED.has(id);

/** The power of a move with none listed. m: the move as used (its level and growth); allies: the user's allies on the board. -> power (0: not such a move) */
export function dynPower(m, u, v, rng, allies) {
	const f = POWER[m.id];
	if (!f) return 0;
	const g = (m.grow && m.grow.pow) || 1, lv = (Math.max(1, Math.min(MOVE_MAX_LEVEL, m.level || 1)) - 1) / (MOVE_MAX_LEVEL - 1);
	return Math.max(1, Math.round(f(u, v, rng, allies) * (1 + (g - 1) * lv)));
}
/** The damage of a worked-out-amount move. -> HP (0: it fails), or null (not such a move) */
export function dynFixed(id, u, v, rng) {
	if (id === 'psywave') return Math.max(1, Math.floor(u.level * (50 + Math.floor(rng() * 101)) / 100));
	if (id === 'endeavor') return Math.max(0, v.hp - u.hp);
	if (id === 'finalgambit') return u.hp;   // (the user faints: battle.js)
	return null;
}
