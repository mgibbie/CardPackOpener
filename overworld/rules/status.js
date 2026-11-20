// rules/status.js — Weather Ball / Natural Gift types, the AI's power guesses, status names and immunities.
// Moved VERBATIM out of overworld/battle.js (Poketactica stage 1, owner 2026-11-20): the overworld's battles and
// Poketactica read the SAME Pokémon rules from here. No DOM, no state, no randomness. battle.js imports them back.

// Weather Ball takes on the weather's element
export const WEATHERBALL_TYPE = { rain: 'Water', sun: 'Fire', sand: 'Rock', hail: 'Ice' };
// Natural Gift: the held berry sets the element (canonical types, gen-6 power 80)
export const NATURAL_GIFT = {
	cheriberry: 'Fire', chestoberry: 'Water', pechaberry: 'Electric', rawstberry: 'Grass',
	aspearberry: 'Ice', oranberry: 'Poison', persimberry: 'Ground', lumberry: 'Flying',
	sitrusberry: 'Psychic',
};
// expected powers so the trainer AI can weigh dynamic-power moves it would
// otherwise skip (`if (!mv.power) continue`); situational ones (Counter, Bide,
// Final Gambit, Fling ...) stay unlisted — random-pick only, like before
export const AI_EST_POWER = {
	seismictoss: 60, nightshade: 60, dragonrage: 45, sonicboom: 30, psywave: 50,
	superfang: 70, endeavor: 70, gyroball: 60, electroball: 70, flail: 50, reversal: 50,
	return: 102, frustration: 102, veeveevolley: 102, pikapapow: 102,
	wringout: 80, crushgrip: 80, hardpress: 70, magnitude: 71, beatup: 40, trumpcard: 40,
	lowkick: 60, grassknot: 60, heavyslam: 80, heatcrash: 80,
};

export const STATUS_NAMES = { brn: 'BRN', psn: 'PSN', par: 'PAR', slp: 'SLP', frz: 'FRZ' };
export const STATUS_APPLIED_MSG = {
	brn: 'was burned!', psn: 'was poisoned!', par: 'is paralyzed! It may be unable to move!',
	slp: 'fell asleep!', frz: 'was frozen solid!',
};
// type immunities to statuses (Gen3-ish)
export const STATUS_IMMUNE = {
	brn: ['Fire'], frz: ['Ice'], psn: ['Poison', 'Steel'], par: [], slp: [],
};
// ability immunities to statuses (shared by direct status moves and secondaries)
export const STATUS_IMMUNE_AB = {
	psn: ['immunity', 'pastelveil', 'purifyingsalt'],
	par: ['limber', 'purifyingsalt'],
	brn: ['waterveil', 'waterbubble', 'thermalexchange', 'purifyingsalt'],
	frz: ['magmaarmor', 'purifyingsalt'],
	slp: ['insomnia', 'vitalspirit', 'sweetveil', 'purifyingsalt'],
};
