// evolve.js — a figurine EVOLVES (owner, 2026-11-21). Pure. The evolutions are the overworld's own (species_extra.json
// `evos`):
//   level        at its species' real evolution level (Charmander -> Charmeleon at Lv 16), the same "real levels" rule as
//                learning moves (figurine.js)
//   friendship   figurines have no friendship: these are ready from FRIEND_LEVEL (Golbat -> Crobat, Pichu -> Pikachu,
//                Eevee -> Espeon / Umbreon; the day / night split is the player's pick)
//   item         a stone or a trade item (Linking String for the trade evolutions) from the player's goods: used up
// Evolving is never forced: the camp offers it and the player can always say "Not now". The figurine keeps its id, level,
// EXP, move pool (the new species' moves it has already passed are added, as learnedTo does), equipped moves, shininess
// and held item; its ability takes the same slot in the new species' list (the first if that slot is missing). `evo`
// counts its evolutions (figcol.js joins two copies of one figurine by it: the evolved copy wins).
import { learnedTo } from './figurine.js';

export const FRIEND_LEVEL = 20;

/** Every evolution the species has that this game can do: [{ target, how: 'level'|'friendship'|'item', level?, item? }]
 *  (targets missing from the species data are left out). */
export function evolutionsOf(speciesId, data) {
	const ex = data.extra && data.extra[speciesId];
	const out = [];
	for (const e of (ex && ex.evos) || []) {
		if (!e || !data.species[e.target]) continue;
		if (e.type === 'level') out.push({ target: e.target, how: 'level', level: Math.max(1, e.param | 0) });
		else if (e.type === 'friendship') out.push({ target: e.target, how: 'friendship', level: FRIEND_LEVEL });
		else if (e.type === 'item' && typeof e.param === 'string') out.push({ target: e.target, how: 'item', item: e.param });
	}
	// (one target listed twice, e.g. by day and by night: once)
	return out.filter((o, i) => out.findIndex((p) => p.target === o.target && p.how === o.how && p.item === o.item) === i);
}
export const canEverEvolve = (speciesId, data) => evolutionsOf(speciesId, data).length > 0;

/** The evolutions open to this figurine now. have: (itemId) -> how many the player owns. -> [{ ...evolution, ready, why? }] */
export function evoOptions(fig, data, have = () => 0) {
	return evolutionsOf(fig.species, data).map((o) => {
		if (o.how === 'item') return have(o.item) > 0 ? { ...o, ready: true } : { ...o, ready: false, why: 'needs ' + o.item };
		return fig.level >= o.level ? { ...o, ready: true } : { ...o, ready: false, why: 'Lv ' + o.level };
	});
}
/** Can it evolve right now by level / friendship (what the results and the squad flag; item ones wait for the item)? */
export const evolvesByLevelNow = (fig, data) => evoOptions(fig, data).some((o) => o.ready && o.how !== 'item');

/** The evolved figurine (a new object), or throws when `target` isn't one of its evolutions. */
export function evolve(fig, target, data) {
	const opt = evolutionsOf(fig.species, data).find((o) => o.target === target);
	if (!opt) throw new Error(fig.species + ' does not evolve into ' + target);
	const oldAbs = ((data.abilities && data.abilities[fig.species]) || []).filter((a) => typeof a === 'string');
	const newAbs = ((data.abilities && data.abilities[target]) || []).filter((a) => typeof a === 'string');
	const slot = Math.max(0, oldAbs.indexOf(fig.ability));
	const ability = newAbs.length ? newAbs[slot] || newAbs[0] : fig.ability;
	return learnedTo({ ...fig, species: target, ability, evo: (fig.evo | 0) + 1 }, data);
}
