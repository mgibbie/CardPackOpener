// ai.js — Poketactica's enemy phase (stage 3a; smarter, owner 2026-11-21). Disgaea's patterns (research §8): a unit's `ai` is
//   'aggro'    moves and attacks every turn
//   'passive'  waits until a player figurine comes within its Move + 3 tiles, then turns aggro (pull them a few at a time)
//   'hold'     never moves (a boss on its throne); attacks what it can reach from where it stands
// Each enemy acts alone in its turn: it tries every tile it can reach x every equipped move it can pay for x every aim and
// reads each with the SAME forecast the player sees (battle.js forecast: hit chance, the damage range, KO or not, type,
// height, facing, held items), so it:
//   - finishes off what it can knock out, and focuses the hurt ones (a KO is worth most; a weakened target more than a fresh one)
//   - plays type matchups, height and facing (they are in the forecast's numbers) and never wastes a hit on an immune target
//   - keeps its own side out of its blasts (an ally caught in the area counts against)
//   - heals a hurt ally and buffs, when that beats attacking; puts statuses on foes that have none
//   - picks, among good attacks, the tile the player's figurines can reach least (danger: how many of them could strike it
//     next turn, the Disgaea enemy-range idea turned round), more so when it is hurt; a HEALER (a unit with a healing move)
//     stays out of reach whenever it can
// Out of SP for every attack (and the battle gives SP back for walking, battle.js SP_WALK), it takes the longest walk it
// can, out of reach where it can and not far from its prey, to come back next phase able to strike.
// With nothing worth doing it walks: a hurt unit toward its healer, a healer toward its hurt allies (or its side) out of reach, the rest
// toward the weakest figurine (HP left, then distance). Deterministic: no randomness (ties go to the first found).
import { manhattan, key, heightAt, shapeTiles } from './grid.js';
import { effectiveness } from '../../../overworld/rules/tables.js';
import { MOVE_FX } from '../../../overworld/rules/movefx.js';
import { STAT_MOVES } from '../../../overworld/rules/tables.js';

export const WAKE_EXTRA = 3;
// TUNE: what each thing is worth (an attack's score is about "percent of a foe's HP taken")
export const AI = Object.freeze({ KO_SURE: 90, KO_MAYBE: 40, HURT_FOCUS: 0.6, OWN_SIDE: 1.5, STATUS: 14, DROP: 8, BUFF: 10, HEAL: 1.3,
	DANGER: 7, DANGER_HEALER: 2.5, HEIGHT: 1.5, WALK_SP: 1, WALK_PREY: 0.25 });

const healOf = (mid) => (MOVE_FX[mid] && (MOVE_FX[mid].heal || MOVE_FX[mid].healTarget)) || 0;
const isHealMove = (mid) => healOf(mid) > 0;
export const isHealer = (u) => (u.fig.equipped || []).some(isHealMove);

/** The tiles the player's figurines could strike next turn: Map key -> how many could (the danger of standing there). */
const dangerCache = new WeakMap();
function dangerMap(S, data, api, side) {
	const foes = foesOf(S, side);
	const sig = side + '|' + S.turn + '|' + foes.map((p) => p.uid + ':' + p.x + ',' + p.y + ':' + p.sp).join(';');
	const c = dangerCache.get(S);
	if (c && c.sig === sig) return c.map;
	const map = new Map();
	for (const p of foes) {
		const t = api.threat(S, p, data);
		for (const [x, y] of t.attack) { const k = key(x, y); map.set(k, (map.get(k) || 0) + 1); }
	}
	dangerCache.set(S, { sig, map });
	return map;
}

// (its foes: every other side on the map; PvP has up to four)
const foesOf = (S, side) => S.units.filter((u) => u.side !== side && u.hp > 0 && u.x != null);
export function enemyTurn(S, e, data, api) {
	const { moveTiles, moveOf, aimTiles, unitAt, heldBlock, forecast } = api;
	const targets = foesOf(S, e.side);
	if (!targets.length) return;
	if (e.ai === 'passive') {
		const near = targets.some((t) => manhattan(t.x, t.y, e.x, e.y) <= e.move + WAKE_EXTRA);
		if (!near) return;
		e.ai = 'aggro';
	}
	const danger = api.threat ? dangerMap(S, data, api, e.side) : new Map();
	const healer = isHealer(e), hurtShare = 1 - e.hp / e.maxHP;
	const spotCost = (sx, sy) => {
		const d = danger.get(key(sx, sy)) || 0;
		return d * AI.DANGER * (1 + hurtShare) * (healer ? AI.DANGER_HEALER : 1) - (heightAt(S.map, sx, sy) || 0) * AI.HEIGHT;
	};
	const origin = { x: e.x, y: e.y };
	// (who stands where, but e itself, which tries each spot: an aim covering nobody scores 0 without a forecast)
	const occ = new Set(S.units.filter((u) => u !== e && u.hp > 0 && u.x != null).map((u) => u.y * S.map.w + u.x));
	const hitsSomeone = (m, ax, ay) => m.s === 'self' || m.s === 'dash' || m.s === 'leap' || m.s === 'swap'
		|| shapeTiles(S.map, m, e.x, e.y, ax, ay).some(([x, y]) => (x === e.x && y === e.y) || occ.has(y * S.map.w + x));
	const reachMap = e.ai === 'hold' ? null : moveTiles(S, e);
	const spots = e.ai === 'hold' ? [[e.x, e.y]] : [...reachMap.values()].map((t) => [t.x, t.y]);
	let best = null;
	for (const [sx, sy] of spots) {
		e.x = sx; e.y = sy;   // (try the spot; restored below)
		const cost = spotCost(sx, sy);
		for (const mid of e.fig.equipped) {
			const m = moveOf(e, mid, data);
			if (!m || (e.pp[mid] || 0) < 1 || e.sp < m.spCost || (heldBlock && heldBlock(e, mid, data))) continue;
			for (const [ax, ay] of aimTiles(S, e, m)) {
				if (!hitsSomeone(m, ax, ay)) continue;
				const score = scoreAim(S, e, m, mid, ax, ay, data, forecast, unitAt);
				if (score <= 0) continue;
				const total = score - cost;
				if (!best || total > best.total) best = { total, sx, sy, mid, ax, ay };
			}
		}
	}
	e.x = origin.x; e.y = origin.y;
	const doMove = (x, y) => api.act(S, e, { t: 'move', x, y }, data);
	if (best) {
		if (best.sx !== e.x || best.sy !== e.y) doMove(best.sx, best.sy);
		api.act(S, e, { t: 'attack', move: best.mid, x: best.ax, y: best.ay }, data);
		return;
	}
	if (e.ai === 'hold') return;
	// nothing worth doing from anywhere it can reach: walk
	const dry = S.spWalk && !e.fig.equipped.some((mid) => { const m = moveOf(e, mid, data); return m && m.category !== 'Status' && (e.pp[mid] || 0) > 0 && e.sp >= m.spCost; });
	if (dry && e.sp < e.maxSP) {
		let far = null;
		const preyD = (sx, sy) => Math.min(...targets.map((t) => manhattan(t.x, t.y, sx, sy)));
		for (const t of reachMap.values()) {
			const v = t.d * AI.WALK_SP - spotCost(t.x, t.y) / AI.DANGER - preyD(t.x, t.y) * AI.WALK_PREY;
			if (t.d > 0 && (!far || v > far.v)) far = { v, x: t.x, y: t.y };
		}
		if (far) { doMove(far.x, far.y); return; }
	}
	const allies = S.units.filter((a) => a.side === e.side && a.hp > 0 && a.x != null && a !== e);
	const medic = hurtShare > 0.5 ? allies.find(isHealer) : null;
	const hurtAllies = healer ? allies.filter((a) => a.hp < a.maxHP * 0.7) : [];
	// the weakest figurine first (least HP left), then the nearest
	const prey = (sx, sy) => Math.min(...targets.map((t) => manhattan(t.x, t.y, sx, sy) + 4 * (t.hp / t.maxHP)));
	let go = null;
	for (const [sx, sy] of spots) {
		let d;
		if (medic) d = manhattan(medic.x, medic.y, sx, sy) + spotCost(sx, sy) / AI.DANGER;
		else if (hurtAllies.length) d = Math.min(...hurtAllies.map((a) => manhattan(a.x, a.y, sx, sy))) + spotCost(sx, sy) / AI.DANGER;
		else if (healer && allies.length) d = Math.min(...allies.map((a) => manhattan(a.x, a.y, sx, sy))) / 2 + spotCost(sx, sy) / AI.DANGER;   // (a healer with no one to heal keeps near its side, out of reach)
		else d = prey(sx, sy) + (hurtShare > 0.5 ? spotCost(sx, sy) / AI.DANGER : 0);
		if (!go || d < go.d) go = { d, sx, sy };
	}
	if (go && (go.sx !== e.x || go.sy !== e.y)) doMove(go.sx, go.sy);
}

/**
 * What an aim is worth to the enemy, from the forecast. Damage: the expected share of each victim's HP left (hit chance x
 * the mean of the damage range), a sure KO worth KO_SURE more and a possible one KO_MAYBE (both x the hit chance), a hurt
 * foe worth up to HURT_FOCUS more; its own side counts OWN_SIDE times against. Status moves: a status on a foe that has
 * none, a stat drop on a foe, a heal on a hurt ally (the HP it would restore), a buff on an unbuffed ally or itself.
 */
function scoreAim(S, e, m, mid, ax, ay, data, forecast, unitAt) {
	const f = forecast(S, e, mid, ax, ay, data);
	if (f && !f.targets.length && (m.s === 'dash' || m.s === 'leap')) return roughScore(S, e, m, ax, ay, unitAt);   // (the forecast doesn't follow a dash / leap)
	if (!f || !f.targets.length) return 0;
	const fx = MOVE_FX[mid] || {}, sm = STAT_MOVES[mid];
	let score = 0;
	for (const t of f.targets) {
		const v = S.units.find((x) => x.uid === t.uid);
		if (!v || t.immune) continue;
		const p = t.hit / 100, own = v.side === e.side;
		if (t.status) {
			if (own) {
				if (healOf(mid) && v.hp < v.maxHP) score += AI.HEAL * 100 * Math.min(v.maxHP - v.hp, Math.floor(v.maxHP * healOf(mid))) / v.maxHP;
				else if (sm && !sm.foe && Object.values(v.boosts).every((b) => b <= 0)) score += AI.BUFF;
			} else {
				if ((fx.status && !v.status) || (fx.confuse && !v.confused)) score += AI.STATUS * p;
				else if (sm && sm.foe) score += AI.DROP * p;
			}
			continue;
		}
		const mean = (t.min + t.max) / 2;
		let val = p * 100 * Math.min(1, mean / Math.max(1, v.hp)) * (1 + AI.HURT_FOCUS * (1 - v.hp / v.maxHP));
		if (t.ko === 'yes') val += AI.KO_SURE * p; else if (t.ko === 'maybe') val += AI.KO_MAYBE * p;
		score += own ? -AI.OWN_SIDE * val : val;
	}
	return score;
}

/** A dash / leap's rough worth (it moves before it strikes, so the forecast leaves it out): the old estimate on its tiles. */
function roughScore(S, e, m, ax, ay, unitAt) {
	let score = 0;
	for (const [x, y] of shapeTiles(S.map, m, e.x, e.y, ax, ay)) {
		const v = unitAt(S, x, y);
		if (!v || v === e || m.category === 'Status') continue;
		const phys = m.category === 'Physical';
		const A = phys ? e.stats.atk : e.stats.spa, D = phys ? v.stats.def : v.stats.spd;
		const est = (Math.floor((2 * e.level / 5 + 2) * (m.power || 40) * A / D / 50) + 2) * effectiveness(m.type, v.types) * (e.types.includes(m.type) ? 1.5 : 1);
		const val = 100 * Math.min(1, est / Math.max(1, v.hp)) * (est >= v.hp ? 2 : 1);
		score += v.side === e.side ? -AI.OWN_SIDE * val : val;
	}
	return score * 0.8;
}
