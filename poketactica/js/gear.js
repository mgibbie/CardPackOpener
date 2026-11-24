// gear.js — a held item's LEVEL, its SLOTS and the PLUSH GEMSTONES in them (owner, 2026-11-24;
// Plans/POKETACTICA_ITEM_WORLD_PLAN.md). Pure: the engine, the collection, the camp and the server all read it.
//
//   level     1 to 100, raised only in the Item World (a level a floor). It multiplies the item's own BONUS by
//             k = 1 + 2 × (level − 1) / 99: 1 at level 1, 3 at level 100 (a Charcoal Stick's +20% becomes +60%).
//             An item with no number of its own (a curing bead, Focus Thread, White Moss, Scope Sight) gains only slots.
//   slots     4, and one more at levels 25, 50, 75 and 100: 8 at the top.
//   gemstone  one stat (hp, atk, def, spa, spd, spe) and a level 1 to 100, written 'atk:12'. In a slot it gives the
//             figurine holding the item +0.5% of that stat a level; the same stat adds up. It levels only by being
//             COMBINED: two of one stat become one of their levels added (100 at most), for one Stitching Kit.
//
// Where it lives: a figurine holding an item carries `gear: { lv, gems: ['atk:12', ...] }` beside `held` (only when
// there is something to say: a level over 1, or a gemstone); in the bag the same object is the collection's
// `gear[<item uid>]` (figcol.js). A figurine with no `gear` plays exactly as it always did.
import { HELD } from './goods.js';

export const ITEM_MAX_LEVEL = 100, GEM_MAX_LEVEL = 100, SLOTS_START = 4, SLOTS_MAX = 8;
export const SLOT_LEVELS = Object.freeze([25, 50, 75, 100]);
/** A gemstone's bonus to its stat, in percent a level. */
export const GEM_PCT = 0.5;
export const GEM_STATS = Object.freeze(['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
export const GEMS = Object.freeze({
	hp: { name: 'Plush Emerald', stat: 'HP', stars: 60 }, atk: { name: 'Plush Ruby', stat: 'Attack', stars: 60 }, def: { name: 'Plush Garnet', stat: 'Defense', stars: 60 },
	spa: { name: 'Plush Sapphire', stat: 'Sp. Atk', stars: 60 }, spd: { name: 'Plush Amethyst', stat: 'Sp. Def', stars: 60 }, spe: { name: 'Plush Topaz', stat: 'Speed', stars: 60 },
});

const clampLv = (lv, max) => Math.max(1, Math.min(max, Math.floor(+lv) || 1));
/** What a level multiplies an item's bonus by: 1 (level 1) to 3 (level 100). */
export const kOf = (lv) => 1 + 2 * (clampLv(lv, ITEM_MAX_LEVEL) - 1) / (ITEM_MAX_LEVEL - 1);
/** The slots an item of this level has. */
export const slotsAt = (lv) => SLOTS_START + SLOT_LEVELS.filter((l) => clampLv(lv, ITEM_MAX_LEVEL) >= l).length;

// ---------- gemstones
export const gemStr = (stat, lv) => stat + ':' + clampLv(lv, GEM_MAX_LEVEL);
/** 'atk:12' -> { s: 'atk', lv: 12 }, or null when it is not a gemstone. */
export function parseGem(str) {
	const m = typeof str === 'string' && /^([a-z]{2,3}):(\d{1,3})$/.exec(str);
	if (!m || !GEMS[m[1]]) return null;
	const lv = +m[2];
	return lv >= 1 && lv <= GEM_MAX_LEVEL ? { s: m[1], lv } : null;
}
export const gemName = (str) => { const g = parseGem(str); return g ? GEMS[g.s].name + ' Lv ' + g.lv : String(str); };
/** What it gives, said: '+6% Attack'. */
export const gemSay = (str) => { const g = parseGem(str); return g ? '+' + +(g.lv * GEM_PCT).toFixed(1) + '% ' + GEMS[g.s].stat : ''; };
/** Two gemstones as one: the same stat, their levels added (100 at most). null when they are not of one stat. */
export function combineGems(a, b) {
	const x = parseGem(a), y = parseGem(b);
	return x && y && x.s === y.s ? gemStr(x.s, Math.min(GEM_MAX_LEVEL, x.lv + y.lv)) : null;
}

// ---------- an item's state
/** { lv, gems } read defensively: the level 1 to 100, no more gemstones than its slots. null when there is nothing to say. */
export function cleanGear(g) {
	if (!g || typeof g !== 'object') return null;
	const lv = clampLv(g.lv, ITEM_MAX_LEVEL), gems = (Array.isArray(g.gems) ? g.gems : []).filter((s) => parseGem(s)).slice(0, slotsAt(lv));
	return lv > 1 || gems.length ? { lv, gems } : null;
}
/** The state of the item a figurine holds (null: a plain level 1 item, or nothing held). */
export const gearOf = (fig) => (fig && fig.held && HELD[fig.held] ? cleanGear(fig.gear) : null);
/** What a set of gemstones multiplies each stat by: { hp, atk, def, spa, spd, spe }. */
export function gemMults(gear) {
	const pct = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
	for (const s of (gear && gear.gems) || []) { const g = parseGem(s); if (g) pct[g.s] += g.lv * GEM_PCT; }
	const out = {}; for (const k of GEM_STATS) out[k] = 1 + pct[k] / 100;
	return out;
}
/** A figurine's stats with its gemstones counted (st: figurine.js statsAt's; a new object only when something changed). */
export function withGems(st, fig) {
	const g = gearOf(fig);
	if (!g || !g.gems.length) return st;
	const m = gemMults(g), out = { ...st };
	for (const k of GEM_STATS) if (m[k] !== 1 && out[k] != null) out[k] = Math.floor(out[k] * m[k]);
	return out;
}

// ---------- an item's payload at a level
const cache = new Map();
/**
 * What the engine reads for a held item of this level (goods.js `held`, its numbers grown). Level 1 is the very object
 * goods.js holds, so a plain item plays exactly as before. `k` rides along for the bonuses the engine itself multiplies
 * (damage boosts, Rocky Cap, Shell Chime, Focus Knot, the Choice Bandana's Speed ...): they read `held.k || 1`.
 */
export function heldAt(id, lv) {
	const h = id && HELD[id] ? HELD[id].held : null;
	if (!h) return null;
	const L = clampLv(lv, ITEM_MAX_LEVEL);
	if (L <= 1) return h;
	const key = id + ':' + L;
	if (cache.has(key)) return cache.get(key);
	const k = kOf(L), o = { ...h, k, lv: L };
	if (h.endHealFrac) o.endHealFrac = h.endHealFrac * k;
	if (h.berryHeal) o.berryHeal = Math.round(h.berryHeal * k);
	if (h.berryHealFrac) o.berryHealFrac = Math.min(1, h.berryHealFrac * k);
	if (h.ppRestore) o.ppRestore = Math.round(h.ppRestore * k);
	if (h.evade) o.evade = 1 - (1 - h.evade) * k;
	if (h.accBoost) o.accBoost = 1 + (h.accBoost - 1) * k;
	if (h.expBoost) o.expBoost = 1 + (h.expBoost - 1) * k;
	Object.freeze(o); cache.set(key, o);
	return o;
}
/** The held items whose level changes no number (they gain slots only). */
export const LEVEL_PLAIN = Object.freeze(Object.keys(HELD).filter((id) => { const h = HELD[id].held; return !!(h.cure || h.sash || h.whiteHerb || h.critBoost); }));
/** The payload of what a figurine holds, at its level. */
export const heldOfFig = (fig) => { const g = gearOf(fig); return fig && fig.held ? heldAt(fig.held, g ? g.lv : 1) : null; };
