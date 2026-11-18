// trainers.js — the overworld's Gym Leaders as Pocket Enhanced opponents (owner's improvement list, 2026-11-18:
// "card-playing trainers in the overworld: Gym Leaders and trainers could challenge you to a Pocket match and pay stars.
// This ties the two games together", "yes to all").
//
// The overworld's CARDS menu lists the current region's Gym Leaders whose badge the player has earned; one is chosen and
// this game opens with ?trainer=<REGION>:<badge id>. Each leader plays a deck of their type: Pocket's own deck in their
// name where Pocket has one (Brock, Lt. Surge, Koga, Blaine), otherwise a ready-made deck of their Energy type, the same
// one every time. A win pays TRAINER_STARS, once a day per leader.
import { THEME_DECKS } from './data/theme_decks.js';

export const TRAINER_STARS = 150;
// [region, badge id, leader, Pocket Energy type]. The type is the leader's speciality in Pocket's terms: Rock and Ground
// play as Fighting, Poison as Darkness, Bug as Grass, Ghost as Psychic, Ice as Water, Steel as Metal. Pocket has no
// one-type deck for Flying, Normal or Dragon, so those leaders take the nearest in spirit (my choice): Falkner
// Lightning, Whitney Psychic, Clair Fire, Norman Metal, Winona Grass.
export const TRAINERS = Object.freeze([
	['KANTO', 'boulder', 'Brock', 'Fighting'], ['KANTO', 'cascade', 'Misty', 'Water'], ['KANTO', 'thunder', 'Lt. Surge', 'Lightning'], ['KANTO', 'rainbow', 'Erika', 'Grass'],
	['KANTO', 'soul', 'Koga', 'Darkness'], ['KANTO', 'marsh', 'Sabrina', 'Psychic'], ['KANTO', 'volcano', 'Blaine', 'Fire'], ['KANTO', 'earth', 'Giovanni', 'Fighting'],
	['JOHTO', 'zephyr', 'Falkner', 'Lightning'], ['JOHTO', 'hive', 'Bugsy', 'Grass'], ['JOHTO', 'plain', 'Whitney', 'Psychic'], ['JOHTO', 'fog', 'Morty', 'Psychic'],
	['JOHTO', 'storm', 'Chuck', 'Fighting'], ['JOHTO', 'mineral', 'Jasmine', 'Metal'], ['JOHTO', 'glacier', 'Pryce', 'Water'], ['JOHTO', 'rising', 'Clair', 'Fire'],
	['HOENN', 'stone', 'Roxanne', 'Fighting'], ['HOENN', 'knuckle', 'Brawly', 'Fighting'], ['HOENN', 'dynamo', 'Wattson', 'Lightning'], ['HOENN', 'heat', 'Flannery', 'Fire'],
	['HOENN', 'balance', 'Norman', 'Metal'], ['HOENN', 'feather', 'Winona', 'Grass'], ['HOENN', 'mind', 'Tate & Liza', 'Psychic'], ['HOENN', 'rain', 'Juan', 'Water'],
].map(([region, badge, name, type]) => Object.freeze({ key: region + ':' + badge, region, badge, name, type })));
// Route trainers (owner's third improvement list, 2026-11-18, "yes to all": "Some beaten trainers on routes (Cooltrainers,
// Gamers, Super Nerds) offer a card match with a deck of their type, for smaller once-a-day stars than a Gym Leader").
// The overworld names them in the key: route:<Energy type>:<their name, as the game shows it>.
export const ROUTE_STARS = 50;
const ROUTE_TYPES = new Set(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless']);
export function routeTrainer(key) {
	const m = /^route:([A-Za-z]+):([A-Za-z0-9 .'&é-]{1,40})$/.exec(String(key || ''));
	if (!m || !ROUTE_TYPES.has(m[1])) return null;
	return Object.freeze({ key: m[0], name: m[2].trim(), type: m[1], route: true, stars: ROUTE_STARS });
}
/** A Gym Leader (or, with `route` keys allowed, a route trainer) by its key. */
export const trainerByKey = (key, routes = false) => TRAINERS.find(t => t.key === String(key || '')) || (routes ? routeTrainer(key) : null);

/** The leader's deck: Pocket's deck in their name, else one of their type (the same one every time). */
export function trainerDeck(t) {
	const own = !t.route && THEME_DECKS.find(d => d.name.toLowerCase().startsWith(t.name.toLowerCase() + ' deck'));
	if (own) return own;
	const typed = THEME_DECKS.filter(d => d.energy.length === 1 && d.energy[0] === t.type);
	let x = 0; for (const ch of t.key) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
	return typed.length ? typed[x % typed.length] : THEME_DECKS[x % THEME_DECKS.length];
}
/** A win's stars: paid once a day per leader. paid = { key: 'YYYY-MM-DD' } (kept in this game's preferences). */
export const dayOf = now => new Date(now).toISOString().slice(0, 10);
export const winPays = (paid, key, now) => !(paid && paid[key] === dayOf(now));
