// finalfantasy.js — Lorequest: Final Fantasy, a traditional dungeon run built from the
// MAGIC: THE GATHERING — FINAL FANTASY set art. You pick ONE FF hero (a 10-card singleton starter
// deck) and battle a gauntlet of FF villains — rung-gated enemies (each a static 15×2 = 30-card
// deck) — until 12 wins or 3 losses. Heroes and enemies are DISJOINT rosters. Like Middle-earth /
// Sword Coast there is NO win-parity: enemies are STATIC (fixed deck + one unique signature hero
// power each); difficulty scales by RUNG. Your deck grows every win via a spoils draft + an
// alternating treasure/class-bucket reward.
//
// Signature mechanics:
//   • SPIRITSUMMON — call a random Spirit (Ifrit/Shiva/Ramuh/Titan/Bahamut/Phoenix/Odin) via the
//     existing summon `options` (no engine change). ("Esper" is reserved for the Alara shards.)
//   • LIMIT BREAK — a payoff on the existing `self-damaged` trigger, plus named Limit Break spells.
// Card data lives in cards.json (tagged `ffDeck:<Character>` + `ffSide` + ids `ff_*`). Hero powers
// are UNIQUE per character, installed at createGame via each seat's `power`.

// ── rosters ──
export const HEROES = ['Cloud', 'Cecil', 'Tidus', 'Yuna', 'Terra', 'Vivi', 'Lightning', 'Zidane', 'Red XIII', 'Wakka'];
export const SECRET_HEROES = ['Gilgamesh']; // unlocked by clearing a run (12 wins)

export const ENEMY_RUNGS = {
	A: ['Reno and Rude', 'Rufus Shinra', 'Seifer Almasy', 'Black Waltz No. 3', 'Queen Brahne', 'Professor Hojo', 'Ultros, Obnoxious Octopus', 'Garland, Royal Kidnapper', 'Seymour Flux'],
	B: ['Gaius van Baelsar', 'Judge Magister Gabranth', 'Fandaniel, Telophoroi Ascian', 'Kuja, Genome Sorcerer', 'Golbez, Crystal Collector', 'The Emperor of Palamecia', 'Xande, Dark Mage', 'Edea, Possessed Sorceress', 'Zenos yae Galvus'],
	C: ['Kefka, Dancing Mad', 'Exdeath, Void Warlock', 'Ultimecia, Time Sorceress', 'Ardyn, the Usurper', 'Emet-Selch, Unsundered', 'Cloud of Darkness', 'Jenova, Ancient Calamity'],
	D: ['Sephiroth, One-Winged Angel', 'Chaos, the Endless'],
};
export const ENEMIES = [...ENEMY_RUNGS.A, ...ENEMY_RUNGS.B, ...ENEMY_RUNGS.C, ...ENEMY_RUNGS.D];
export const FIRST_ONLY = new Set(['Reno and Rude', 'Ultros, Obnoxious Octopus']);

// ── class map (hero → class drives loot buckets; enemy → class is flavor/wiki only) ──
export const CLASS_OF = {
	// heroes
	Cloud: 'warrior', Cecil: 'paladin', Tidus: 'hunter', Yuna: 'priest', Terra: 'mage', Vivi: 'mage',
	Lightning: 'demon_hunter', Zidane: 'rogue', 'Red XIII': 'druid', Wakka: 'shaman', Gilgamesh: 'warrior',
	// enemies
	'Reno and Rude': 'rogue', 'Rufus Shinra': 'warlock', 'Seifer Almasy': 'warrior', 'Black Waltz No. 3': 'mage',
	'Queen Brahne': 'warlock', 'Professor Hojo': 'warlock', 'Ultros, Obnoxious Octopus': 'rogue',
	'Garland, Royal Kidnapper': 'death_knight', 'Seymour Flux': 'warlock',
	'Gaius van Baelsar': 'warrior', 'Judge Magister Gabranth': 'death_knight', 'Fandaniel, Telophoroi Ascian': 'warlock',
	'Kuja, Genome Sorcerer': 'mage', 'Golbez, Crystal Collector': 'death_knight', 'The Emperor of Palamecia': 'warlock',
	'Xande, Dark Mage': 'mage', 'Edea, Possessed Sorceress': 'mage', 'Zenos yae Galvus': 'death_knight',
	'Kefka, Dancing Mad': 'warlock', 'Exdeath, Void Warlock': 'warlock', 'Ultimecia, Time Sorceress': 'mage',
	'Ardyn, the Usurper': 'death_knight', 'Emet-Selch, Unsundered': 'warlock', 'Cloud of Darkness': 'warlock',
	'Jenova, Ancient Calamity': 'warlock', 'Sephiroth, One-Winged Angel': 'warlock', 'Chaos, the Endless': 'warlock',
};
export const classOf = ch => CLASS_OF[ch] || 'neutral';
export const isEnemy = ch => ENEMIES.includes(ch);
export const isHero = ch => HEROES.includes(ch) || SECRET_HEROES.includes(ch);

// each character's MTG colour identity (from the source FINAL FANTASY cards) — deck cards are
// colourless class cards, so this drives the wiki's mana-symbol badges.
export const COLOR_IDENTITY = {
	// heroes
	Cloud: ['G', 'R', 'W'], Cecil: ['B', 'W'], Tidus: ['G', 'U', 'W'], Yuna: ['G', 'U', 'W'], Terra: ['B', 'R', 'W'],
	Vivi: ['R', 'U'], Lightning: ['R', 'W'], Zidane: ['R', 'W'], 'Red XIII': ['G', 'R'], Wakka: ['G', 'W'], Gilgamesh: ['R'],
	// enemies
	'Reno and Rude': ['B'], 'Rufus Shinra': ['B', 'W'], 'Seifer Almasy': ['R'], 'Black Waltz No. 3': ['B', 'R'],
	'Queen Brahne': ['R'], 'Professor Hojo': ['G'], 'Ultros, Obnoxious Octopus': ['U'],
	'Garland, Royal Kidnapper': ['B', 'U'], 'Seymour Flux': ['B'],
	'Gaius van Baelsar': ['B'], 'Judge Magister Gabranth': ['B', 'W'], 'Fandaniel, Telophoroi Ascian': ['B'],
	'Kuja, Genome Sorcerer': ['B', 'R'], 'Golbez, Crystal Collector': ['B', 'U'], 'The Emperor of Palamecia': ['R', 'U'],
	'Xande, Dark Mage': ['B', 'U'], 'Edea, Possessed Sorceress': ['B', 'R', 'U'], 'Zenos yae Galvus': ['B'],
	'Kefka, Dancing Mad': ['B', 'R'], 'Exdeath, Void Warlock': ['B', 'G'], 'Ultimecia, Time Sorceress': ['B', 'U'],
	'Ardyn, the Usurper': ['B'], 'Emet-Selch, Unsundered': ['B', 'U'], 'Cloud of Darkness': ['B', 'G'],
	'Jenova, Ancient Calamity': ['B', 'G'], 'Sephiroth, One-Winged Angel': ['B'], 'Chaos, the Endless': ['B', 'R'],
};
export const colorsOf = ch => COLOR_IDENTITY[ch] || [];

// ── the Spirit pool (SPIRITSUMMON — a random Spirit, via summon options) ──
export const SPIRITS = [
	{ name: 'Ifrit', attack: 3, health: 2, tribe: 'Spirit', keywords: ['rush'] },
	{ name: 'Shiva', attack: 3, health: 3, tribe: 'Spirit', keywords: ['elusive'] },
	{ name: 'Ramuh', attack: 4, health: 2, tribe: 'Spirit' },
	{ name: 'Titan', attack: 2, health: 5, tribe: 'Spirit', keywords: ['taunt'] },
	{ name: 'Bahamut', attack: 5, health: 5, tribe: 'Spirit', keywords: ['trample'] },
	{ name: 'Phoenix', attack: 3, health: 3, tribe: 'Spirit', keywords: ['reborn'] },
	{ name: 'Odin', attack: 4, health: 3, tribe: 'Spirit', keywords: ['deathtouch'] },
];
const spiritSummon = { type: 'summon', count: 1, options: SPIRITS };

// ── 38 unique hero powers ({ name, cost, text, effects }) — installed via each seat's `power` ──
const P = (name, cost, text, effects) => ({ name, cost, text, effects });
export const HERO_POWERS = {
	// heroes
	Cloud: P('Cross-Slash', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	Cecil: P('Cover', 2, 'Gain 3 life.', [{ type: 'heal', value: 3, target: 'self' }]),
	Tidus: P('Blitz Ace', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	Yuna: P('Grand Summon', 2, 'Spiritsummon a random Spirit.', [spiritSummon]),
	Terra: P('Riot Blade', 2, 'Spiritsummon a random Spirit.', [spiritSummon]),
	Vivi: P('Focus', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	Lightning: P('Army of One', 2, 'Give a friendly creature +1/+1 and Rush.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }, { type: 'grant', keyword: 'rush', target: 'friendly-creature' }]),
	Zidane: P('Thievery', 2, 'Gain a Coin.', [{ type: 'gain-coin', value: 1 }]),
	'Red XIII': P('Lunatic High', 2, 'Give your creatures +1/+0.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }]),
	Wakka: P('Aurochs Rally', 2, 'Summon a 2/2 Aurochs with Taunt.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Besaid Aurochs', tribe: 'Human', keywords: ['taunt'] }]),
	Gilgamesh: P('Excalipoor', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	// enemies (Rung A)
	'Reno and Rude': P('Neo Turk Tactics', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Rufus Shinra': P('Shinra Command', 2, 'Summon a 2/2 Trooper.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Shinra Guard', tribe: 'Soldier' }]),
	'Seifer Almasy': P('Fire Cross', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	'Black Waltz No. 3': P('Thundara', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Queen Brahne': P('Extract Eidolon', 2, 'Spiritsummon a random Spirit.', [spiritSummon]),
	'Professor Hojo': P('Specimen Injection', 2, 'Summon a 2/2 Specimen.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Mako Specimen', tribe: 'Beast' }]),
	'Ultros, Obnoxious Octopus': P('Tentacle', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Garland, Royal Kidnapper': P('Soul of Chaos', 2, 'Give a friendly creature +1/+1.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }]),
	'Seymour Flux': P('Anima\'s Pain', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	// enemies (Rung B)
	'Gaius van Baelsar': P('Meteor Cannon', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Judge Magister Gabranth': P('Judgment', 2, 'Give a friendly creature +1/+1 and Divine Shield.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }, { type: 'grant', keyword: 'divine_shield', target: 'friendly-creature' }]),
	'Fandaniel, Telophoroi Ascian': P('Spread Despair', 2, 'Deal 1 damage to all enemy creatures.', [{ type: 'damage', value: 1, target: 'enemy-creatures' }]),
	'Kuja, Genome Sorcerer': P('Flare Star', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
	'Golbez, Crystal Collector': P('Shadow Dragon', 2, 'Summon a 2/2 with Deathtouch.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Shadow Dragon', tribe: 'Dragon', keywords: ['deathtouch'] }]),
	'The Emperor of Palamecia': P('Cyclone', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Xande, Dark Mage': P('Stop Spell', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Edea, Possessed Sorceress': P('Ice Strike', 2, 'Freeze an enemy creature and deal 1 damage to it.', [{ type: 'freeze', target: 'enemy-creature' }, { type: 'damage', value: 1, target: 'enemy-creature' }]),
	'Zenos yae Galvus': P('Unfettered', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	// enemies (Rung C)
	'Kefka, Dancing Mad': P('Light of Judgment', 2, 'Deal 2 damage to all enemy creatures.', [{ type: 'damage', value: 2, target: 'enemy-creatures' }]),
	'Exdeath, Void Warlock': P('Void Grip', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
	'Ultimecia, Time Sorceress': P('Hell\'s Judgment', 2, 'Freeze an enemy creature and draw a card.', [{ type: 'freeze', target: 'enemy-creature' }, { type: 'draw', value: 1 }]),
	'Ardyn, the Usurper': P('Daemonify', 2, 'Summon a 2/2 Daemon with Lifesteal.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Daemon', tribe: 'Demon', keywords: ['lifesteal'] }]),
	'Emet-Selch, Unsundered': P('Ascian\'s Grip', 2, 'Spiritsummon a random Spirit.', [spiritSummon]),
	'Cloud of Darkness': P('Particle Beam', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Jenova, Ancient Calamity': P('Reunion', 2, 'Summon a 2/2 with Reborn.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Jenova Cell', tribe: 'Alien', keywords: ['reborn'] }]),
	// enemies (Rung D — final bosses)
	'Sephiroth, One-Winged Angel': P('Supernova', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
	'Chaos, the Endless': P('Inferno', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
};
export const powerOf = ch => HERO_POWERS[ch] || null;

export function seatOf(character) {
	return { id: classOf(character), name: character, power: powerOf(character) };
}

// ── run constants ──
export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;

// ── decks ──
export function deckOf(cardsById, character) {
	const ids = Object.values(cardsById).filter(d => d.ffDeck === character && !d.token).map(d => d.id).sort();
	if (isEnemy(character)) { const deck = []; for (const id of ids) deck.push(id, id); return deck; }
	return ids; // heroes: 1 copy each
}

// Rung windows: A wins 0–2 (★ first-only only at win 0), B 3–6, C 7–10, D at win 11.
export function enemyRosterFor(wins) {
	const w = Math.max(0, wins | 0);
	if (w <= 2) return w === 0 ? ENEMY_RUNGS.A.slice() : ENEMY_RUNGS.A.filter(e => !FIRST_ONLY.has(e));
	if (w <= 6) return ENEMY_RUNGS.B.slice();
	if (w <= 10) return ENEMY_RUNGS.C.slice();
	return ENEMY_RUNGS.D.slice();
}
export const rungFor = wins => (wins <= 2 ? 'A' : wins <= 6 ? 'B' : wins <= 10 ? 'C' : 'D');
export const rungLabel = wins => ({ A: 'Henchman', B: 'Lieutenant', C: 'Archvillain', D: 'Final Boss' }[rungFor(wins)]);

export function randomEnemy(wins, rng, avoidId) {
	let roster = enemyRosterFor(wins).filter(c => c !== avoidId);
	if (!roster.length) roster = enemyRosterFor(wins);
	return roster[Math.floor(rng() * roster.length)];
}

export function generateEnemy(cardsById, character) {
	return { id: character, name: character, cls: classOf(character), deck: deckOf(cardsById, character), rung: null };
}

// ── loot ──
export const rewardForWin = wins => (wins % 2 === 1 ? 'treasure' : 'bucket');

export function spoilsChoices(cardsById, defeatedEnemyName, rng, count = 3) {
	const pool = Object.values(cardsById).filter(d => d.ffDeck === defeatedEnemyName && d.ffSide === 'enemy' && !d.token).map(d => d.id);
	const out = [];
	for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
	return out;
}

export function treasurePool(cardsById) {
	return Object.values(cardsById).filter(d => (d.treasure && d.set === 'DUELS') || d.ffTreasure);
}
