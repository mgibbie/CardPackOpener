// evo_pick.js — which evolution a mon takes when MORE THAN ONE entry matches.
//
// species_extra evos are a list, and both evolution paths (level/friendship in
// evolution.js, items from the bag in ow_menukeys.js) used to take the FIRST
// entry whose condition held. The list order is whatever the exporter wrote, so
// a species with two targets behind the same condition always got the first:
// Pikachu + THUNDERSTONE was always Alolan Raichu (raichu_alola is listed before
// raichu), Tyrogue was always Hitmonlee, Wurmple always Silcoon, Burmy always
// Wormadam, Cosmoem always Solgaleo — the other branches were unreachable.
//
// pickEvolution resolves a tie the canonical way:
//   1. a species-specific rule, where the real games decide by something the mon
//      carries (Tyrogue: Attack vs Defense; Wurmple: its personality, here a hash
//      of its IVs; Burmy / Lechonk: gender; Cosmoem: the Sun/Moon split, here
//      day/night like Rockruff);
//   2. otherwise the BASE-FORM target beats a regional one (_alola/_galar/_hisui/
//      _paldea). Regional evolutions (Alolan Raichu, Alolan Exeggutor, Hisuian
//      Typhlosion, ...) are region-gated in canon, which has no equivalent here
//      yet; until it does they are reached wild / via the RIFT PRISM, never by a
//      tie that the list order happened to break;
//   3. otherwise the first listed.
// Pure (no DOM, no engine imports) so node tests can drive it directly.

export const REGIONAL_FORM = /_(alola|galar|hisui|paldea)(_|$)/;

// a stable per-mon number standing in for the personality value
function personality(mon) {
	const iv = mon?.ivs || {};
	let h = 0x811c9dc5;
	for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) h = Math.imul(h ^ ((iv[k] ?? 15) | 0), 0x01000193) >>> 0;
	return h >>> 16; // the high half, like the games' upper-personality checks
}

// species-specific tie-breaks: (mon, candidate targets, ctx) -> a target id or null
const RULES = {
	// Attack > Defense: Hitmonlee; Attack < Defense: Hitmonchan; equal: Hitmontop
	tyrogue(mon, ids) {
		const a = mon?.stats?.atk ?? 0, d = mon?.stats?.def ?? 0;
		const want = a > d ? 'hitmonlee' : a < d ? 'hitmonchan' : 'hitmontop';
		return ids.includes(want) ? want : null;
	},
	// a 50/50 fixed at birth by the personality value
	wurmple(mon, ids) {
		const want = personality(mon) % 2 === 0 ? 'silcoon' : 'cascoon';
		return ids.includes(want) ? want : null;
	},
	// females become Wormadam (Plant Cloak), males become Mothim
	burmy(mon, ids) {
		if (mon?.gender === 'M') return ids.includes('mothim') ? 'mothim' : null;
		if (mon?.gender === 'F') return ids.includes('wormadam') ? 'wormadam' : null;
		return null;
	},
	lechonk(mon, ids) {
		const want = mon?.gender === 'F' ? 'oinkologne_f' : 'oinkologne';
		return ids.includes(want) ? want : null;
	},
	// Sun -> Solgaleo, Moon -> Lunala; the day/night clock stands in for the version
	cosmoem(mon, ids, ctx) {
		if (ctx?.isNight == null) return null;
		const want = ctx.isNight ? 'lunala' : 'solgaleo';
		return ids.includes(want) ? want : null;
	},
};

// mon: the evolving mon; matches: the evo entries whose condition already holds
// (and whose target exists); ctx: { isNight } for the clock-decided branches.
// Returns the chosen entry, or null when nothing matched.
export function pickEvolution(mon, matches, ctx = {}) {
	if (!matches?.length) return null;
	if (matches.length === 1) return matches[0];
	const ids = matches.map(e => e.target);
	const rule = RULES[mon?.speciesId];
	const ruled = rule ? rule(mon, ids, ctx) : null;
	if (ruled) return matches.find(e => e.target === ruled);
	return matches.find(e => !REGIONAL_FORM.test(e.target)) || matches[0];
}
