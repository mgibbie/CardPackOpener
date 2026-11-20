// figurine.js — a Poketactica FIGURINE: the item that is a tactics fighter (owner, 2026-11-20; Plans/POKETACTICA_PLAN.md
// stage 2). Pure: no DOM, no storage, no Math.random (the caller passes a seeded rng from overworld/rules/rng.js).
//
// The owner's rules for a figurine:
//   - a species, a level 1–999 (no reincarnation), NO EVs, IVs or natures: stats come from species and level only
//   - 1 ability (one of its species' real abilities, rolled when it is found) and 4 equipped moves
//   - a MOVE POOL: every move it has ever learned stays in it; the 4 are swapped from the pool between battles only
//   - moves are the species' real level-up learnset, stretched over 1–999 (a move learned at Pokémon level l arrives at
//     figurine level ⌈l × 9.99⌉; level-1 moves at 1)
//   - each move has its own level 1–99 per figurine, from move XP: damage dealt with it, or per target affected for a
//     status move; what a level does is the move's grow track in poketactica/data/move_shapes.json
//   - PP per move AND a shared SP pool: a move needs both
//   - Speed gives Move range and evasion; Jump comes from type
//
// Numbers the owner's decisions don't fix are the named constants below (to tune in stage 3 with a balance sim).
import { calcStat } from '../../overworld/rules/stats.js';

export const MAX_LEVEL = 999;
export const MOVE_MAX_LEVEL = 99;
export const STRETCH = 9.99;                 // Pokémon level -> figurine level (100 -> 999)

// ---------- stats: the Pokémon formula with IV = EV = 0 and no nature
export function statsAt(baseStats, level) {
	const b = baseStats || {}, L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
	return {
		hp: calcStat(b.hp || 50, 0, 0, L, true), atk: calcStat(b.atk || 50, 0, 0, L, false), def: calcStat(b.def || 50, 0, 0, L, false),
		spa: calcStat(b.spa || 50, 0, 0, L, false), spd: calcStat(b.spd || 50, 0, 0, L, false), spe: calcStat(b.spe || 50, 0, 0, L, false),
	};
}

// ---------- levels: EXP to reach a level (TUNE: a cubic curve to 999; the overworld's is level³ to 100)
export const EXP_K = 0.8;
export const expForLevel = (L) => (L <= 1 ? 0 : Math.floor(EXP_K * L * L * L));
export function levelForExp(exp) {
	let lo = 1, hi = MAX_LEVEL;
	while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (expForLevel(mid) <= exp) lo = mid; else hi = mid - 1; }
	return lo;
}

// ---------- learning moves: the real learnset, stretched
export const learnLevel = (pokemonLevel) => (pokemonLevel <= 1 ? 1 : Math.min(MAX_LEVEL, Math.ceil(pokemonLevel * STRETCH)));
/** The species' level-up moves as [figurineLevel, moveId], in order, deduplicated (first time it is learned). */
export function stretchedLearnset(species) {
	const seen = new Set(), out = [];
	for (const [l, id] of (species && species.learnset) || []) if (!seen.has(id)) { seen.add(id); out.push([learnLevel(l), id]); }
	return out.sort((a, b) => a[0] - b[0]);
}
/** Moves learned between two levels (exclusive from, inclusive to). */
export const movesLearned = (species, fromLv, toLv) => stretchedLearnset(species).filter(([l]) => l > fromLv && l <= toLv).map(([, id]) => id);

// ---------- move levels: move XP to reach a move level (TUNE)
export const MOVE_XP_K = 40;
export const moveXpFor = (lv) => (lv <= 1 ? 0 : Math.floor(MOVE_XP_K * (lv - 1) ** 2));
export function moveLevelForXp(xp) {
	let lv = 1;
	while (lv < MOVE_MAX_LEVEL && moveXpFor(lv + 1) <= xp) lv++;
	return lv;
}
/** Move XP from one use: the damage it dealt, or (a status move) a flat amount per target it affected (owner's rule). */
export const STATUS_XP_PER_TARGET = 30;
export const moveXpFromUse = ({ damage = 0, statusTargets = 0 } = {}) => Math.max(0, Math.floor(damage)) + statusTargets * STATUS_XP_PER_TARGET;

/** A move at a move level: its shape from move_shapes.json with the level's growth applied (power ×, accuracy +, SP ×, milestones). */
export function moveAt(shape, power, acc, lv) {
	const g = shape.grow, f = (Math.max(1, Math.min(MOVE_MAX_LEVEL, lv)) - 1) / (MOVE_MAX_LEVEL - 1), o = { ...shape };
	for (const [l, ch] of g.at || []) if (lv >= l) Object.assign(o, ch);
	o.power = power ? Math.round(power * (1 + (g.pow - 1) * f)) : 0;
	o.acc = acc === true || !acc ? acc : Math.min(100, acc + Math.round(g.acc * f));
	o.spCost = Math.max(1, Math.round(shape.sp * (1 - (1 - g.sp) * f)));
	o.level = lv;
	return o;
}

// ---------- SP: the shared pool (TUNE), refilled at the start of each battle
export const SP_BASE = 20, SP_PER_LEVELS = 5;
export const spMax = (level) => SP_BASE + Math.floor(level / SP_PER_LEVELS);

// ---------- grid stats
/** Move range from the Speed BASE stat (tiers), +2 with Haste (the owner's design). TUNE. */
export const MOVE_TIERS = [[50, 3], [80, 4], [110, 5], [Infinity, 6]];
export function moveRange(baseSpe, ability) {
	let m = MOVE_TIERS.find(([lim]) => baseSpe < lim)[1];
	if (ability === 'haste') m += 2;
	return m;
}
/** Jump: height levels it can climb or drop in one step; Infinity = ignores height (Flying, Levitate). From type only. */
export function jumpOf(types, ability) {
	if ((types || []).includes('Flying') || ability === 'levitate') return Infinity;
	if ((types || []).some((t) => t === 'Ground' || t === 'Rock' || t === 'Fighting')) return 3;
	return 2;
}
/** Evasion: a hit's accuracy × this, from the attacker's Speed against the defender's, capped both ways. TUNE. */
export const EVADE_MIN = 0.7, EVADE_MAX = 1.3;
export const speedAccuracyMult = (atkSpe, defSpe) => Math.max(EVADE_MIN, Math.min(EVADE_MAX, Math.sqrt(Math.max(1, atkSpe) / Math.max(1, defSpe))));
/** Who can lift and throw: Fighting types, Strength learners, and strong Psychics (base Sp. Atk 100+). */
export function canLift(species, extra) {
	const t = (species && species.types) || [];
	if (t.includes('Fighting')) return true;
	if (((species && species.learnset) || []).some(([, id]) => id === 'strength') || ((extra && extra.learn) || []).includes('strength')) return true;
	return t.includes('Psychic') && ((species && species.baseStats && species.baseStats.spa) || 0) >= 100;
}
/** Throw range in tiles from the base Attack (TUNE): 2 / 3 / 4. */
export const throwRange = (baseAtk) => (baseAtk >= 110 ? 4 : baseAtk >= 80 ? 3 : 2);

// ---------- making one
/**
 * A new figurine. data = { species: species_battle.json, abilities: species_abilities.json }.
 * The ability is rolled from the species' own (owner's rule), shiny at `shinyRate`; the pool holds every move learned up to
 * its level and the last 4 learned are equipped (as a wild Pokémon's moves are).
 */
export function makeFigurine(speciesId, level, rng, data, { id = null, shinyRate = 1 / 512 } = {}) {
	const sp = data.species[speciesId];
	if (!sp) throw new Error('no species ' + speciesId);
	const L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
	const abs = (data.abilities && data.abilities[speciesId] || []).filter((a) => typeof a === 'string');
	const ability = abs.length ? abs[Math.floor(rng() * abs.length)] : null;
	const learned = stretchedLearnset(sp).filter(([l]) => l <= L).map(([, mid]) => mid);
	const pool = learned.map((mid) => ({ id: mid, lv: 1, xp: 0 }));
	const equipped = learned.slice(-4);
	return { v: 1, id: id || `${speciesId}-${Math.floor(rng() * 36 ** 6).toString(36)}`, species: speciesId, level: L, exp: expForLevel(L), ability, shiny: rng() < shinyRate, pool, equipped };
}

/** Its battle numbers right now (stats, SP, Move, Jump, lift / throw). */
export function battleStats(fig, data) {
	const sp = data.species[fig.species], extra = data.extra && data.extra[fig.species];
	const st = statsAt(sp.baseStats, fig.level);
	return { ...st, maxHP: st.hp, sp: spMax(fig.level), move: moveRange(sp.baseStats.spe || 50, fig.ability), jump: jumpOf(sp.types, fig.ability),
		lift: canLift(sp, extra), throw: throwRange(sp.baseStats.atk || 50), types: [...sp.types] };
}

/** Grant EXP: levels up and adds newly learned moves to the pool (never removes one). -> { fig, gained, newMoves } (a new object) */
export function gainExp(fig, amount, data) {
	const sp = data.species[fig.species];
	const exp = Math.min(expForLevel(MAX_LEVEL), fig.exp + Math.max(0, Math.floor(amount)));
	const level = Math.max(fig.level, levelForExp(exp));
	const newMoves = movesLearned(sp, fig.level, level).filter((mid) => !fig.pool.some((p) => p.id === mid));
	return { fig: { ...fig, exp, level, pool: [...fig.pool, ...newMoves.map((mid) => ({ id: mid, lv: 1, xp: 0 }))] }, gained: level - fig.level, newMoves };
}

/** Grant move XP to one pool move (it levels up to 99). -> a new figurine */
export function gainMoveXp(fig, moveId, xp) {
	return { ...fig, pool: fig.pool.map((p) => {
		if (p.id !== moveId) return p;
		const nx = Math.min(moveXpFor(MOVE_MAX_LEVEL), p.xp + Math.max(0, Math.floor(xp)));
		return { ...p, xp: nx, lv: moveLevelForXp(nx) };
	}) };
}

/** Equip 4 moves from the pool (between battles only: the engine refuses during one). -> a new figurine, or throws */
export function equip(fig, moveIds) {
	const ids = [...new Set(moveIds)];
	if (!ids.length || ids.length > 4) throw new Error('equip 1 to 4 moves');
	for (const mid of ids) if (!fig.pool.some((p) => p.id === mid)) throw new Error('not in the pool: ' + mid);
	return { ...fig, equipped: ids };
}
