// types.js — Pocket Enhanced's two type systems, and the flat effectiveness that replaces Pocket's Weakness.
//
// CARD TYPE is the card's own class (what Energy and Trainer effects read). COMBAT TYPE is the species' / the move's
// type in the mainline games, and is the only thing type effectiveness reads. They are never derived from each other.
//
// Effectiveness is the mainline chart turned into flat numbers (the owner's rule):
//   super effective  +20      not very effective  -20      neutral  0      "immune" in the mainline games  0
// and a defender with two Combat Types adds its two results (Electric into Water/Flying is +40; Fighting into
// Normal/Flying is +20 -20 = 0). There is no multiplier and nothing is ever immune.
export const CARD_TYPES = Object.freeze(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless']);
// the eight an Energy Zone can make (Dragon and Colorless are card types, not Energy)
export const ENERGY_TYPES = Object.freeze(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal']);
export const COMBAT_TYPES = Object.freeze(['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']);

// attacker -> the defending types it is super effective against (the mainline chart, Gen 6 on)
const SUPER = {
	Normal: [], Fire: ['Grass', 'Ice', 'Bug', 'Steel'], Water: ['Fire', 'Ground', 'Rock'], Electric: ['Water', 'Flying'], Grass: ['Water', 'Ground', 'Rock'],
	Ice: ['Grass', 'Ground', 'Flying', 'Dragon'], Fighting: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'], Poison: ['Grass', 'Fairy'], Ground: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'],
	Flying: ['Grass', 'Fighting', 'Bug'], Psychic: ['Fighting', 'Poison'], Bug: ['Grass', 'Psychic', 'Dark'], Rock: ['Fire', 'Ice', 'Flying', 'Bug'], Ghost: ['Psychic', 'Ghost'],
	Dragon: ['Dragon'], Dark: ['Psychic', 'Ghost'], Steel: ['Ice', 'Rock', 'Fairy'], Fairy: ['Fighting', 'Dragon', 'Dark'],
};
// attacker -> the defending types that resist it
const RESIST = {
	Normal: ['Rock', 'Steel'], Fire: ['Fire', 'Water', 'Rock', 'Dragon'], Water: ['Water', 'Grass', 'Dragon'], Electric: ['Electric', 'Grass', 'Dragon'],
	Grass: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'], Ice: ['Fire', 'Water', 'Ice', 'Steel'], Fighting: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'],
	Poison: ['Poison', 'Ground', 'Rock', 'Ghost'], Ground: ['Grass', 'Bug'], Flying: ['Electric', 'Rock', 'Steel'], Psychic: ['Psychic', 'Steel'],
	Bug: ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'], Rock: ['Fighting', 'Ground', 'Steel'], Ghost: ['Dark'], Dragon: ['Steel'],
	Dark: ['Fighting', 'Dark', 'Fairy'], Steel: ['Fire', 'Water', 'Electric', 'Steel'], Fairy: ['Fire', 'Poison', 'Steel'],
};
// attacker -> the defending types the mainline games make immune. Kept for the record and for the log: here they
// are NEUTRAL (0), never a block.
export const MAINLINE_IMMUNE = Object.freeze({ Normal: ['Ghost'], Electric: ['Ground'], Fighting: ['Ghost'], Poison: ['Steel'], Ground: ['Flying'], Psychic: ['Dark'], Ghost: ['Normal'], Dragon: ['Fairy'] });

export const SUPER_EFFECTIVE = 20, NOT_VERY_EFFECTIVE = -20;

/** One attacking type into one defending type: +20, -20 or 0. */
export function matchup(attackType, defendType) {
	if ((SUPER[attackType] || []).includes(defendType)) return SUPER_EFFECTIVE;
	if ((RESIST[attackType] || []).includes(defendType)) return NOT_VERY_EFFECTIVE;
	return 0;
}
/** An attack's Combat Type into a defender's one or two Combat Types: the sum, and each part (for the log). */
export function effectiveness(attackType, defendTypes) {
	const parts = (defendTypes || []).map(t => ({ type: t, mod: matchup(attackType, t), immune: (MAINLINE_IMMUNE[attackType] || []).includes(t) }));
	return { total: parts.reduce((a, p) => a + p.mod, 0), parts };
}
