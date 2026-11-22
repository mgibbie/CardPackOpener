// terrain.js — LIVING TERRAIN (owner, 2026-11-22): what a tile is made of, with Pokémon's rules. A map may carry
// `ground` (one kind per tile, campaign.js buildMap); the kinds that only change the look (grass, dirt, stone, sand, snow,
// wood) have no rule. The ones that do:
//   water      2 Move per tile, unless the figurine is a Water or Flying type; Water moves +20% from a water tile
//   ice        2 Move per tile, unless Ice or Flying; Ice moves +20% from ice
//   lava       burns: a figurine on lava at the end of its side's phase loses 1/8 of its max HP, unless Fire or Flying;
//              Fire moves +20% from lava
//   tallgrass  hides: attacks at a figurine in tall grass are 20% less likely to hit; Grass moves +20% from tall grass
// Pure, and only for battles on rules rev 3+ (battle.js RULES_REV): an older battle's map has no `ground` rules.
export const GROUND = Object.freeze(['grass', 'tallgrass', 'dirt', 'stone', 'sand', 'snow', 'ice', 'water', 'lava', 'wood']);
export const TERRAIN_RULES = Object.freeze({
	water: { slow: 'Water', boost: 'Water' },
	ice: { slow: 'Ice', boost: 'Ice' },
	lava: { burn: 'Fire', boost: 'Fire' },
	tallgrass: { hide: true, boost: 'Grass' },
});
export const SLOW_COST = 2, TERRAIN_BOOST = 1.2, HIDE_ACC = 0.8, LAVA_BURN = 1 / 8;

/** The kind of ground at (x, y) when the battle plays terrain rules, else null. */
export const groundAt = (S, x, y) => (S.terrain && S.map.ground && x != null ? S.map.ground[y * S.map.w + x] || null : null);
const is = (u, type) => (u.types || []).includes(type);
/** What stepping onto (x, y) costs this unit (1, or 2 on water / ice it isn't at home on). */
export function stepCost(S, u, x, y) {
	const r = TERRAIN_RULES[groundAt(S, x, y)];
	return r && r.slow && !is(u, r.slow) && !is(u, 'Flying') ? SLOW_COST : 1;
}
/** A move's damage from where its user stands: x1.2 for the ground's own type. */
export function terrainBoost(S, u, m) {
	const r = TERRAIN_RULES[groundAt(S, u.x, u.y)];
	return r && r.boost === m.type ? TERRAIN_BOOST : 1;
}
/** The hit chance against a unit hidden in tall grass. */
export const hideMult = (S, v) => (TERRAIN_RULES[groundAt(S, v.x, v.y)] || {}).hide ? HIDE_ACC : 1;
/** The burn a unit standing on lava takes at its phase's end (0 if it is at home there). */
export function lavaBurn(S, u) {
	const r = TERRAIN_RULES[groundAt(S, u.x, u.y)];
	return r && r.burn && !is(u, r.burn) && !is(u, 'Flying') ? Math.max(1, Math.floor(u.maxHP * LAVA_BURN)) : 0;
}
