// rules/stats.js — the stat formula, natures and a species' stats at a level.
// Moved VERBATIM out of overworld/battle.js (Poketactica stage 1, owner 2026-11-20): the overworld's battles and
// Poketactica read the SAME Pokémon rules from here. No DOM, no state, no randomness. battle.js imports them back.

// ---------- mon construction (pokemonBuilder.lua port) ----------
export function calcStat(base, iv, ev, level, isHP) {
	if (isHP) return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
	return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
}

// the 25 natures: +10% / −10% (the five up===dn ones are neutral)
export const NATURES = {
	hardy: ['atk', 'atk'], lonely: ['atk', 'def'], brave: ['atk', 'spe'], adamant: ['atk', 'spa'], naughty: ['atk', 'spd'],
	bold: ['def', 'atk'], docile: ['def', 'def'], relaxed: ['def', 'spe'], impish: ['def', 'spa'], lax: ['def', 'spd'],
	timid: ['spe', 'atk'], hasty: ['spe', 'def'], serious: ['spe', 'spe'], jolly: ['spe', 'spa'], naive: ['spe', 'spd'],
	modest: ['spa', 'atk'], mild: ['spa', 'def'], quiet: ['spa', 'spe'], bashful: ['spa', 'spa'], rash: ['spa', 'spd'],
	calm: ['spd', 'atk'], gentle: ['spd', 'def'], sassy: ['spd', 'spe'], careful: ['spd', 'spa'], quirky: ['spd', 'spd'],
};
export const NATURE_NAMES = Object.keys(NATURES);

// opts (optional) carries the mon's { nature, evs } — absent keeps the old math
export function statsFor(sp, ivs, level, opts) {
	const b = sp.baseStats;
	const evs = opts?.evs || {};
	const st = {
		hp: calcStat(b.hp || 50, ivs.hp, evs.hp || 0, level, true),
		atk: calcStat(b.atk || 50, ivs.atk, evs.atk || 0, level, false),
		def: calcStat(b.def || 50, ivs.def, evs.def || 0, level, false),
		spa: calcStat(b.spa || 50, ivs.spa, evs.spa || 0, level, false),
		spd: calcStat(b.spd || 50, ivs.spd, evs.spd || 0, level, false),
		spe: calcStat(b.spe || 50, ivs.spe, evs.spe || 0, level, false),
	};
	const nat = NATURES[opts?.nature];
	if (nat && nat[0] !== nat[1]) {
		st[nat[0]] = Math.floor(st[nat[0]] * 1.1);
		st[nat[1]] = Math.floor(st[nat[1]] * 0.9);
	}
	return st;
}
