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
	// Triumphant Light
	{ id: 'arceus', name: 'Arceus', energy: ['Fighting'], cards: TWO(['Arceus ex', 'Larvitar', 'Pupitar', 'Tyranitar', 'Carnivine', 'A2a-035', 'Shaymin', 'Giant Cape', 'Poké Ball', "Professor's Research"]) },
	{ id: 'leafeon', name: 'Leafeon & Glaceon', energy: ['Grass', 'Water'], cards: TWO(['A1a-061', 'Leafeon ex', 'Glaceon ex', 'Cherubi', 'A2a-008', 'Phione', 'Irida', 'Rocky Helmet', 'Poké Ball', "Professor's Research"]) },
	// Shining Revelry
	{ id: 'giratina', name: 'Giratina', energy: ['Psychic'], cards: TWO(['Giratina ex', 'Abra', 'Kadabra', 'Alakazam', 'Mr. Mime', 'Gimmighoul', 'Pokémon Center Lady', 'Red', 'Poké Ball', "Professor's Research"]) },
	{ id: 'tinkaton', name: 'Tinkaton', energy: ['Metal'], cards: TWO(['Tinkatink', 'Tinkatuff', 'Tinkaton ex', 'Varoom', 'Revavroom', 'A2b-036', 'Gholdengo', 'Giant Cape', 'Iono', 'Poké Ball']) },
	// Celestial Guardians
	{ id: 'solgaleo', name: 'Solgaleo', energy: ['Metal'], cards: TWO(['Cosmog', 'Cosmoem', 'Solgaleo ex', 'Magearna', 'Alolan Diglett', 'Alolan Dugtrio', 'Rare Candy', 'Lillie', 'Poké Ball', "Professor's Research"]) },
	{ id: 'lunala', name: 'Lunala', energy: ['Psychic'], cards: TWO(['Cosmog', 'Cosmoem', 'Lunala ex', 'Mimikyu', 'Comfey', 'Tapu Lele', 'Rare Candy', 'Acerola', 'Poké Ball', "Professor's Research"]) },
	{ id: 'decidueye', name: 'Decidueye', energy: ['Grass'], cards: TWO(['A3-009', 'Dartrix', 'Decidueye ex', 'Bounsweet', 'Steenee', 'Tsareena', 'Rare Candy', 'Leaf Cape', 'Poké Ball', "Professor's Research"]) },
	// Extradimensional Crisis
	{ id: 'ultrabeasts', name: 'Ultra Beasts', energy: ['Grass', 'Darkness'], cards: TWO(['Buzzwole ex', 'Pheromosa', 'Kartana', 'Nihilego', 'Poipole', 'Naganadel', 'Celesteela', 'Beastite', 'Lusamine', 'Poké Ball']) },
	{ id: 'tapukoko', name: 'Tapu Koko', energy: ['Lightning'], cards: TWO(['Tapu Koko ex', 'Zeraora', 'Shinx', 'Luxio', 'Luxray', 'Xurkitree', 'Electrical Cord', 'Repel', 'Poké Ball', "Professor's Research"]) },
	// Eevee Grove
	{ id: 'eevee', name: 'Eevee', energy: ['Fire', 'Psychic'], cards: TWO(['Eevee ex', 'A3b-055', 'Flareon ex', 'Sylveon ex', 'Espeon', 'Umbreon', 'Eevee Bag', 'Leftovers', 'Poké Ball', "Professor's Research"]) },
	{ id: 'sweets', name: 'Sweets Relay', energy: ['Psychic'], cards: TWO(['Milcery', 'Alcremie', 'Swirlix', 'Slurpuff', 'A3b-018', 'A3b-019', 'Snorlax ex', 'Leftovers', 'Poké Ball', "Professor's Research"]) },
	// Wisdom of Sea and Sky
	{ id: 'hooh', name: 'Ho-Oh', energy: ['Fire', 'Water', 'Lightning'], cards: TWO(['Ho-Oh ex', 'Lugia ex', 'Magby', 'Pichu', 'Entei', 'Suicune', 'Raikou', 'Elemental Switch', 'Poké Ball', "Professor's Research"]) },
	{ id: 'crobat', name: 'Crobat', energy: ['Darkness'], cards: TWO(['A4-107', 'A4-108', 'Crobat ex', 'Umbreon ex', 'A3b-055', 'Houndour', 'Houndoom', 'Dark Pendant', 'Poké Ball', "Professor's Research"]) },
	// Secluded Springs
	{ id: 'suicune', name: 'Suicune', energy: ['Water'], cards: TWO(['Suicune ex', 'Feebas', 'Milotic', 'Mantyke', 'A4a-015', 'Tentacruel', 'Cryogonal', 'Inflatable Boat', 'Poké Ball', "Professor's Research"]) },
	// Mega Rising
	{ id: 'megablaziken', name: 'Mega Blaziken', energy: ['Fire'], cards: TWO(['Torchic', 'Combusken', 'Mega Blaziken ex', 'B1-032', 'Heatmor', 'Flame Patch', 'Rare Candy', 'Sitrus Berry', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megagyarados', name: 'Mega Gyarados', energy: ['Water'], cards: TWO(['B1-050', 'B1-051', 'Mega Gyarados ex', 'Froakie', 'Frogadier', 'Greninja ex', 'Eiscue', 'Heavy Helmet', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megaaltaria', name: 'Mega Altaria', energy: ['Psychic'], cards: TWO(['B1-196', 'Mega Altaria ex', 'Indeedee ex', 'Jirachi', 'Sableye', 'Klefki', 'Lisia', 'Lucky Mittens', 'Poké Ball', "Professor's Research"]) },
	// Crimson Blaze
	{ id: 'megacharizardy', name: 'Mega Charizard Y', energy: ['Fire'], cards: TWO(['B1a-011', 'B1a-012', 'Mega Charizard Y ex', 'B1-032', 'Heatmor', 'Serena', 'Rare Candy', 'Flame Patch', 'Poké Ball', "Professor's Research"]) },
	// Fantastical Parade
	{ id: 'megagardevoir', name: 'Mega Gardevoir', energy: ['Psychic'], cards: TWO(['B2-064', 'B2-065', 'Mega Gardevoir ex', 'Meloetta', 'Mimikyu ex', 'Peculiar Plaza', 'Diantha', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	{ id: 'ogerpon', name: 'Ogerpon', energy: ['Grass'], cards: TWO(['Teal Mask Ogerpon ex', 'Hearthflame Mask Ogerpon', 'Wellspring Mask Ogerpon', 'Cornerstone Mask Ogerpon', 'Ledyba', 'Ledian', 'Starting Plains', 'Lucky Ice Pop', 'Poké Ball', "Professor's Research"]) },
	// Paldean Wonders
	{ id: 'paldea', name: 'Paldea', energy: ['Grass', 'Fire'], cards: TWO(['Sprigatito', 'Floragato', 'Meowscarada ex', 'Fuecoco', 'Crocalor', 'Skeledirge', 'Mesagoza', 'Arven', 'Rare Candy', "Professor's Research"]) },
	// Mega Shine
	{ id: 'megacharizardx', name: 'Mega Charizard X', energy: ['Fire'], cards: TWO(['B2b-007', 'B2b-008', 'Mega Charizard X ex', 'B2b-012', 'Magmortar', 'Paldean Tauros', 'Calem', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megagengar', name: 'Mega Gengar', energy: ['Darkness'], cards: TWO(['B2b-037', 'B2b-038', 'Mega Gengar ex', 'B2b-040', 'B2b-043', 'B2b-044', 'Nasty Notice', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	// Pulsing Aura
	{ id: 'megalucario', name: 'Mega Lucario', energy: ['Fighting'], cards: TWO(['B3-079', 'Mega Lucario ex', 'B3-089', 'B3-086', 'B3-077', 'Korrina', 'Arena of Antiquity', 'Cabbie', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megasceptile', name: 'Mega Sceptile', energy: ['Grass'], cards: TWO(['B3-005', 'B3-006', 'Mega Sceptile ex', 'B3-004', 'B3-011', 'B3-012', 'Fragrant Forest', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	// Paradox Drive
	{ id: 'koraidon', name: 'Koraidon', energy: ['Fighting'], cards: TWO(['Great Tusk', 'Sandy Shocks', 'Koraidon ex', 'Nacli', 'Naclstack', 'Garganacl', 'Ancient Booster Energy Capsule', 'Professor Sada', 'Rare Candy', "Professor's Research"]) },
	{ id: 'miraidon', name: 'Miraidon', energy: ['Lightning'], cards: TWO(['Iron Hands', 'Iron Thorns', 'Miraidon ex', 'Pawmi', 'Pawmo', 'Pawmot', 'Future Booster Energy Capsule', 'Professor Turo', 'Poké Ball', "Professor's Research"]) },
	// Everyday Wonders
	{ id: 'megadiancie', name: 'Mega Diancie', energy: ['Psychic'], cards: TWO(['B3b-031', 'Mega Diancie ex', 'B3b-033', 'B3b-035', 'B3b-026', 'B3b-027', 'B3b-028', 'B3b-029', 'Small Balloon', "Professor's Research"]) },
	{ id: 'puppies', name: 'Puppy Pile', energy: ['Fire'], cards: TWO(['B3b-010', 'B3b-025', 'B3b-034', 'B3b-038', 'B3-137', 'B3b-054', 'B3b-055', 'Puppy-Loving Girl', 'Poké Ball', "Professor's Research"]) },
	// Ruler of the Skies
	{ id: 'megarayquaza', name: 'Mega Rayquaza', energy: ['Fire', 'Lightning'], cards: TWO(['Mega Rayquaza ex', 'B4-119', 'B4-116', 'B4-117', 'B4-059', 'B4-020', 'B4-021', 'Wally', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megametagross', name: 'Mega Metagross', energy: ['Metal'], cards: TWO(['B4-106', 'B4-107', 'Mega Metagross ex', 'B4-114', 'B4-115', 'B4-111', 'Clear Veil', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	// Team Rocket's Ambition
	{ id: 'rocketbirds', name: "Team Rocket's Birds", energy: ['Fire', 'Lightning'], cards: TWO(["Team Rocket's Moltres ex", "Team Rocket's Zapdos ex", "Team Rocket's Magmar", "Team Rocket's Voltorb", "Team Rocket's Electrode", "Team Rocket's Meowth", "Team Rocket's Persian", "Team Rocket's Researcher", 'Poké Ball', "Professor's Research"]) },
	{ id: 'rocketpoison', name: "Team Rocket's Poison", energy: ['Darkness'], cards: TWO(["Team Rocket's Koffing", "Team Rocket's Weezing ex", "Team Rocket's Grimer", "Team Rocket's Muk", "Team Rocket's Ekans", "Team Rocket's Arbok", "Team Rocket's Sneasel", "Team Rocket's Master Plan", "Team Rocket's Researcher", "Professor's Research"]) },
	// Dual Fusion
	{ id: 'megamewtwox', name: 'Mega Mewtwo X', energy: ['Psychic'], cards: TWO(['Mega Mewtwo X ex', 'C1-057', 'C1-064', 'C1-065', 'C1-066', 'C1-062', 'Abandoned Station', 'Rare Candy', 'Poké Ball', "Professor's Research"]) },
	{ id: 'megagreninja', name: 'Mega Greninja', energy: ['Water'], cards: TWO(['C1-040', 'C1-041', 'Mega Greninja ex', 'C1-037', 'C1-032', 'C1-033', 'Lorelei', 'Super Potion', 'Poké Ball', "Professor's Research"]) },
]);
const byName = name => CARDS.find(c => c.id === name) || CARDS.find(c => c.name === name);
/** A starter as the engine takes it: { deck: [card ids], energy }. */
export function starterDeck(id) {
	const s = STARTERS.find(x => x.id === id) || STARTERS[0];
	return { deck: s.cards.map(n => byName(n).id), energy: s.energy.slice() };
}
/** Every starter is a legal deck (checked by the tests; a card renamed in the data would show here). */
export const starterErrors = () => STARTERS.map(s => { const missing = s.cards.filter(n => !byName(n)); if (missing.length) return `${s.id}: no card named ${missing[0]}`; const d = starterDeck(s.id); const e = deckError(d.deck, d.energy); return e ? `${s.id}: ${e}` : null; }).filter(Boolean);
