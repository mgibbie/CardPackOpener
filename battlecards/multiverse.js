// multiverse.js — Lorequest: Multiverse, a Marvel dungeon run with WIN-PARITY.
// You pick ONE hero (a 10-card singleton starter) and climb a gauntlet of villains to 12 wins
// or 3 losses. UNLIKE Middle-earth/Sword Coast/Final Fantasy (static 30-card foes), Multiverse
// RETURNS to the Duels/Lorequest parity rule: the enemy is regenerated each fight at your exact
// WIN-parity — its 10-card base deck PLUS one class bucket per win you hold PLUS a treasure per
// milestone you have reached — so it always fields the same bucket/treasure count as you. There is
// NO spoils draft; every win YOU pick a class bucket (+ a treasure at milestones), and the enemy
// matches. Heroes and villains are DISJOINT rosters. Data lives in cards.json (tagged
// `mvDeck:<Character>` + `mvSide:'hero'|'enemy'`, ids `mv_*`). Hero powers are UNIQUE per character
// (installed via each seat's `power`); class is retained to pick loot buckets + wiki mana badges.
import * as Duels from './duels.js';

// ── rosters ──
export const HEROES = ['Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Wolverine', 'Doctor Strange', 'Black Panther', 'Storm', 'Captain Marvel'];
export const SECRET_HEROES = ['Silver Surfer']; // unlocked by clearing a run (12 wins)

// 21 villains split into rungs. STREET (battles 1–8) → MASTERMIND (9–11) → COSMIC (final, 12th).
export const ENEMY_RUNGS = {
	STREET: ['Green Goblin', 'Venom', 'Carnage', 'Doctor Octopus', 'Mysterio', 'Electro', 'Rhino', 'Sandman', 'Vulture', 'Kraven', 'Scorpion', 'Shocker', 'Hobgoblin', 'Lizard', 'Kingpin'],
	MASTERMIND: ['Doctor Doom', 'Loki', 'Kang the Conqueror', 'Abomination'],
	COSMIC: ['Thanos', 'Galactus'],
};
export const ENEMIES = [...ENEMY_RUNGS.STREET, ...ENEMY_RUNGS.MASTERMIND, ...ENEMY_RUNGS.COSMIC];

// ── class map (hero → class drives loot buckets; enemy → its class rolls its parity buckets) ──
export const CLASS_OF = {
	// heroes
	'Spider-Man': 'rogue', 'Iron Man': 'mage', 'Captain America': 'paladin', 'Thor': 'shaman', 'Hulk': 'warrior',
	'Wolverine': 'demon_hunter', 'Doctor Strange': 'warlock', 'Black Panther': 'hunter', 'Storm': 'druid',
	'Captain Marvel': 'priest', 'Silver Surfer': 'mage',
	// villains
	'Green Goblin': 'warlock', 'Venom': 'warlock', 'Carnage': 'demon_hunter', 'Doctor Octopus': 'mage',
	'Mysterio': 'mage', 'Electro': 'shaman', 'Rhino': 'warrior', 'Sandman': 'warrior', 'Vulture': 'rogue',
	'Kraven': 'hunter', 'Scorpion': 'warrior', 'Shocker': 'mage', 'Hobgoblin': 'warlock', 'Lizard': 'druid',
	'Kingpin': 'rogue', 'Doctor Doom': 'warlock', 'Loki': 'mage', 'Kang the Conqueror': 'mage',
	'Abomination': 'warrior', 'Thanos': 'death_knight', 'Galactus': 'warrior',
};
export const classOf = ch => CLASS_OF[ch] || 'neutral';
export const isEnemy = ch => ENEMIES.includes(ch);
export const isHero = ch => HEROES.includes(ch) || SECRET_HEROES.includes(ch);

// each character's MTG colour identity (from the Marvel Scryfall cards) — the DECK cards are
// colourless class cards, so this only drives the wiki's mana-symbol badges.
export const COLOR_IDENTITY = {
	// heroes
	'Spider-Man': ['W'], 'Iron Man': ['U'], 'Captain America': ['W'], 'Thor': ['R'], 'Hulk': ['G'],
	'Wolverine': ['G'], 'Doctor Strange': ['W'], 'Black Panther': ['W'], 'Storm': ['G', 'W'], 'Captain Marvel': ['W'],
	'Silver Surfer': ['U'],
	// villains
	'Green Goblin': ['B', 'R'], 'Venom': ['B'], 'Carnage': ['B', 'R'], 'Doctor Octopus': ['B', 'U'],
	'Mysterio': ['U'], 'Electro': ['R'], 'Rhino': ['G', 'R'], 'Sandman': ['G'], 'Vulture': ['B', 'U'],
	'Kraven': ['B', 'G'], 'Scorpion': ['B'], 'Shocker': ['R'], 'Hobgoblin': ['R'], 'Lizard': ['G'],
	'Kingpin': ['B'], 'Doctor Doom': ['B', 'R', 'U'], 'Loki': ['U'], 'Kang the Conqueror': ['U'],
	'Abomination': ['R'], 'Thanos': ['B', 'G', 'R', 'U', 'W'], 'Galactus': [],
};
export const colorsOf = ch => COLOR_IDENTITY[ch] || [];

// ── 32 unique hero powers ({ name, cost, text, effects }) — installed via each seat's `power` ──
const P = (name, cost, text, effects) => ({ name, cost, text, effects });
export const HERO_POWERS = {
	// heroes
	'Spider-Man': P('Web Snare', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Iron Man': P('Repulsor Blast', 2, 'Deal 1 damage to any target.', [{ type: 'damage', value: 1, target: 'any' }]),
	'Captain America': P('Shield Throw', 2, 'Give a friendly creature +1/+1.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }]),
	'Thor': P('Call the Storm', 2, 'Deal 1 damage to all enemy creatures.', [{ type: 'damage', value: 1, target: 'enemy-creatures' }]),
	'Hulk': P('Smash', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	'Wolverine': P('Snikt!', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Doctor Strange': P('Eye of Agamotto', 2, 'Draw a card; deal 1 damage to your hero.', [{ type: 'draw', value: 1 }, { type: 'damage', value: 1, target: 'own-hero' }]),
	'Black Panther': P('Kinetic Blast', 2, 'Deal 2 damage to any target.', [{ type: 'damage', value: 2, target: 'any' }]),
	'Storm': P('Lightning Squall', 2, 'Deal 1 damage to an enemy creature and freeze it.', [{ type: 'damage', value: 1, target: 'enemy-creature' }, { type: 'freeze', target: 'enemy-creatures' }]),
	'Captain Marvel': P('Binary Light', 2, 'Gain 3 life.', [{ type: 'heal', value: 3, target: 'self' }]),
	'Silver Surfer': P('Cosmic Awareness', 2, 'Deal 1 damage to any target and Scry 1.', [{ type: 'damage', value: 1, target: 'any' }, { type: 'scry', value: 1 }]),
	// villains — Street-level
	'Green Goblin': P('Pumpkin Bomb', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Venom': P('Symbiote Feast', 2, 'Give a friendly creature +1/+0 and Lifesteal.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creature' }, { type: 'grant', keyword: 'lifesteal', target: 'friendly-creature' }]),
	'Carnage': P('Bloodlust', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	'Doctor Octopus': P('Tentacle Barrage', 2, 'Deal 2 damage split among random enemies.', [{ type: 'random-damage', value: 2, pool: 'enemies', count: 2 }]),
	'Mysterio': P('Smoke and Mirrors', 2, 'Summon a 2/1 Illusion with Elusive.', [{ type: 'summon', count: 1, attack: 2, health: 1, name: 'Illusion', tribe: 'Illusion', keywords: ['elusive'] }]),
	'Electro': P('Static Surge', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Rhino': P('Charge', 2, 'Give a friendly creature +2/+0 and Rush.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }, { type: 'grant', keyword: 'rush', target: 'friendly-creature' }]),
	'Sandman': P('Sand Wall', 2, 'Summon a 0/3 with Taunt.', [{ type: 'summon', count: 1, attack: 0, health: 3, name: 'Sand Wall', tribe: 'Elemental', keywords: ['taunt'] }]),
	'Vulture': P('Salvage', 2, 'Draw a card and gain a Coin.', [{ type: 'draw', value: 1 }, { type: 'gain-coin', value: 1 }]),
	'Kraven': P('The Hunt', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Scorpion': P('Venom Strike', 2, 'Give a friendly creature Poisonous.', [{ type: 'grant', keyword: 'poisonous', target: 'friendly-creature' }]),
	'Shocker': P('Shock Blast', 2, 'Deal 1 damage to any target and freeze an enemy creature.', [{ type: 'damage', value: 1, target: 'any' }, { type: 'freeze', target: 'enemy-creatures' }]),
	'Hobgoblin': P('Firebomb', 2, 'Deal 1 damage to all enemy creatures.', [{ type: 'damage', value: 1, target: 'enemy-creatures' }]),
	'Lizard': P('Savage Growth', 2, 'Give a friendly creature +1/+1.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }]),
	'Kingpin': P('Extort', 2, 'Gain two Coins.', [{ type: 'gain-coin', value: 2 }]),
	// villains — Masterminds
	'Doctor Doom': P('Doombot Legion', 2, 'Summon a 2/2 Doombot.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Doombot', tribe: 'Robot' }]),
	'Loki': P('Deceive', 2, 'Summon a 2/2 Illusion with Elusive.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: "Loki's Illusion", tribe: 'Illusion', keywords: ['elusive'] }]),
	'Kang the Conqueror': P('Time Stop', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Abomination': P('Gamma Rage', 2, 'Give a friendly creature +2/+1.', [{ type: 'buff', attack: 2, health: 1, target: 'friendly-creature' }]),
	// villains — Cosmic (final bosses)
	'Thanos': P('The Snap', 2, 'Deal 3 damage to a random enemy.', [{ type: 'random-damage', value: 3, pool: 'enemies', count: 1 }]),
	'Galactus': P('World Hunger', 2, 'Deal 2 damage to all enemy creatures.', [{ type: 'damage', value: 2, target: 'enemy-creatures' }]),
};
export const powerOf = ch => HERO_POWERS[ch] || null;

// a seat def: class id (for buckets/wiki), the character's display name, and its UNIQUE hero power.
export function seatOf(character) {
	return { id: classOf(character), name: character, power: powerOf(character) };
}

// ── run constants ──
export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;
export const TREASURE_WINS = [2, 5, 8, 11]; // wins at which YOU gain a treasure (and the enemy matches)

// ── decks ──
// EVERY character (hero or villain) has a 10-card singleton base deck. Parity loot (buckets +
// treasures) is layered on top of the enemy's base at generateEnemy time.
export function deckOf(cardsById, character) {
	return Object.values(cardsById).filter(d => d.mvDeck === character && !d.token).map(d => d.id).sort();
}

// which villains the next fight (at the current WIN count) may draw from.
// STREET wins 0–7 (battles 1–8), MASTERMIND wins 8–10 (battles 9–11), COSMIC win 11 (the 12th fight).
export function enemyRosterFor(wins) {
	const w = Math.max(0, wins | 0);
	if (w <= 7) return ENEMY_RUNGS.STREET.slice();
	if (w <= 10) return ENEMY_RUNGS.MASTERMIND.slice();
	return ENEMY_RUNGS.COSMIC.slice();
}
export const rungFor = wins => (wins <= 7 ? 'STREET' : wins <= 10 ? 'MASTERMIND' : 'COSMIC');
export const rungLabel = wins => ({ STREET: 'Rogues’ Gallery', MASTERMIND: 'Mastermind', COSMIC: 'Cosmic Threat' }[rungFor(wins)]);

// pick the next villain from the rung for `wins`, avoiding an immediate repeat.
export function randomEnemy(wins, rng, avoidId) {
	let roster = enemyRosterFor(wins).filter(c => c !== avoidId);
	if (!roster.length) roster = enemyRosterFor(wins);
	return roster[Math.floor(rng() * roster.length)];
}

// win-parity loot budget: one bucket per win, plus a treasure per milestone reached.
export function enemyLoot(wins) {
	const w = Math.max(0, wins);
	return { buckets: w, treasures: TREASURE_WINS.filter(x => x <= w).length };
}

// build a villain's deck at the player's exact WIN-parity: 10-card base + matched buckets + treasures.
export function generateEnemy(cardsById, character, wins, rng) {
	const cls = classOf(character);
	const deck = deckOf(cardsById, character);
	const loot = enemyLoot(wins);
	for (let b = 0; b < loot.buckets; b++) {
		const bk = Duels.offerBuckets(cardsById, [cls], rng, 1)[0];
		if (bk) deck.push(...Duels.rollBucket(cardsById, [cls], bk, rng, 3));
	}
	const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
	for (let t = 0; t < loot.treasures && treasurePool.length; t++) deck.push(treasurePool[Math.floor(rng() * treasurePool.length)].id);
	return { id: character, name: character, cls, deck, loot, rung: rungFor(wins) };
}

// the treasure pool for YOUR milestone rewards — the shared DUELS treasures (same pool the enemy draws).
export function treasurePool(cardsById) {
	return Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
}
