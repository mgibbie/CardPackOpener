// decks.js — Pocket Enhanced's ready-made decks. Each is a legal 20-card deck (two of each name) built around one
// of Genetic Apex's or Mythical Island's lines; the deck builder starts from these, and computer players use them.
// A card is named, or given by its id where two sets print a card of that name and the deck wants a particular one.
import { CARDS } from './data/cards.js';
import { deckError } from './engine/engine.js';

const TWO = names => names.flatMap(n => [n, n]);
export const STARTERS = Object.freeze([
	{ id: 'charizard', name: 'Charizard', energy: ['Fire'], cards: TWO(['Charmander', 'Charmeleon', 'Charizard ex', 'Vulpix', 'Ninetales', 'Moltres ex', 'Potion', 'Poké Ball', "Professor's Research", 'Giovanni']) },
	{ id: 'blastoise', name: 'Blastoise', energy: ['Water'], cards: TWO(['Squirtle', 'Wartortle', 'Blastoise ex', 'Staryu', 'Starmie ex', 'Articuno ex', 'Misty', 'Potion', 'Poké Ball', "Professor's Research"]) },
	{ id: 'pikachu', name: 'Pikachu', energy: ['Lightning'], cards: TWO(['Pikachu', 'Pikachu ex', 'Zapdos ex', 'Magnemite', 'Magneton', 'Voltorb', 'Electrode', 'Poké Ball', "Professor's Research", 'Giovanni']) },
	{ id: 'mewtwo', name: 'Mewtwo', energy: ['Psychic'], cards: TWO(['Ralts', 'Kirlia', 'Gardevoir', 'Mewtwo ex', 'Mewtwo', 'Jynx', 'Potion', 'Poké Ball', "Professor's Research", 'Sabrina']) },
	{ id: 'venusaur', name: 'Venusaur', energy: ['Grass'], cards: TWO(['Bulbasaur', 'Ivysaur', 'Venusaur ex', 'Exeggcute', 'Exeggutor ex', 'Petilil', 'Lilligant', 'Erika', 'Poké Ball', "Professor's Research"]) },
	{ id: 'machamp', name: 'Machamp', energy: ['Fighting'], cards: TWO(['Machop', 'Machoke', 'Machamp ex', 'Cubone', 'Marowak ex', 'Hitmonlee', 'Potion', 'Poké Ball', "Professor's Research", 'Giovanni']) },
	{ id: 'nidos', name: 'Nidoking & Nidoqueen', energy: ['Darkness'], cards: TWO(['Nidoran♀', 'Nidorina', 'Nidoqueen', 'Nidoran♂', 'Nidorino', 'Nidoking', 'Koffing', 'Weezing', 'Poké Ball', "Professor's Research"]) },
	{ id: 'dragonite', name: 'Dragonite', energy: ['Water', 'Lightning'], cards: TWO(['Dratini', 'Dragonair', 'Dragonite', 'Pidgey', 'Pidgeotto', 'Pidgeot', 'Kangaskhan', 'Meowth', 'Poké Ball', "Professor's Research"]) },
	// Mythical Island
	{ id: 'celebi', name: 'Celebi & Serperior', energy: ['Grass'], cards: TWO(['Snivy', 'Servine', 'Serperior', 'Celebi ex', 'Dhelmise', 'Erika', 'Leaf', 'Potion', 'Poké Ball', "Professor's Research"]) },
	{ id: 'mew', name: 'Mew', energy: ['Psychic'], cards: TWO(['Mew ex', 'Mewtwo ex', 'Ralts', 'Kirlia', 'Gardevoir', 'Sigilyph', 'Mythical Slab', 'Budding Expeditioner', 'Poké Ball', "Professor's Research"]) },
	{ id: 'gyarados', name: 'Gyarados', energy: ['Water'], cards: TWO(['A1a-017', 'Gyarados ex', 'A1a-061', 'A1a-019', 'Finneon', 'Lumineon', 'Misty', 'Leaf', 'Poké Ball', "Professor's Research"]) },
	// Space-Time Smackdown
	{ id: 'dialga', name: 'Dialga', energy: ['Metal'], cards: TWO(['Dialga ex', 'Skarmory', 'Shieldon', 'Bastiodon', 'Armor Fossil', 'Heatran', 'Giant Cape', 'Rocky Helmet', 'Dawn', "Professor's Research"]) },
	{ id: 'palkia', name: 'Palkia', energy: ['Water'], cards: TWO(['Palkia ex', 'Manaphy', 'Piplup', 'Prinplup', 'Empoleon', 'Regice', 'Lum Berry', 'Cyrus', 'Poké Ball', "Professor's Research"]) },
	{ id: 'darkrai', name: 'Darkrai', energy: ['Darkness'], cards: TWO(['Darkrai ex', 'Croagunk', 'Toxicroak', 'Spiritomb', 'Glameow', 'Purugly', 'Team Galactic Grunt', 'Giant Cape', 'Poké Ball', "Professor's Research"]) },
]);
const byName = name => CARDS.find(c => c.id === name) || CARDS.find(c => c.name === name);
/** A starter as the engine takes it: { deck: [card ids], energy }. */
export function starterDeck(id) {
	const s = STARTERS.find(x => x.id === id) || STARTERS[0];
	return { deck: s.cards.map(n => byName(n).id), energy: s.energy.slice() };
}
/** Every starter is a legal deck (checked by the tests; a card renamed in the data would show here). */
export const starterErrors = () => STARTERS.map(s => { const missing = s.cards.filter(n => !byName(n)); if (missing.length) return `${s.id}: no card named ${missing[0]}`; const d = starterDeck(s.id); const e = deckError(d.deck, d.energy); return e ? `${s.id}: ${e}` : null; }).filter(Boolean);
