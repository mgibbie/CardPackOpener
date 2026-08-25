// middleearth.js — Lorequest: Middle-earth, a traditional dungeon run.
// You pick ONE good-guy hero (a 10-card singleton starter deck) and fight a gauntlet of Sauron's
// forces — rung-gated enemies (each a static 15×2 = 30-card deck) — until 12 wins or 3 losses.
// Heroes and enemies are DISJOINT rosters (you never fight another hero). Unlike Lorequest/Duels
// there is NO win-parity: enemies are STATIC (fixed deck + one unique signature hero power each);
// difficulty scales purely by RUNG. Your deck grows every win via a spoils draft (1-of-3 from the
// fallen foe) + an alternating treasure/class-bucket reward.
//
// Card data lives in cards.json (tagged `meDeck:<Character>` + `meSide:'hero'|'enemy'`, ids `me_*`).
// Hero powers are UNIQUE per character (not class defaults) — installed at createGame via each seat's
// `power` object (see HERO_POWERS). Class is retained only to pick which loot BUCKETS a hero drafts.
import * as Duels from './duels.js';

// ── rosters ──
export const HEROES = ['Aragorn', 'Gandalf', 'Legolas', 'Gimli', 'Frodo', 'Samwise', 'Éowyn', 'Galadriel', 'Théoden', 'Elrond'];
export const SECRET_HEROES = ['Tom Bombadil']; // unlocked by clearing a run (12 wins)

// 27 enemies, split into rungs. ★ FIRST_ONLY = only spawns as your very first fight (win 0).
export const ENEMY_RUNGS = {
	A: ['Bill Ferny', 'Lotho', 'Gríma Wormtongue', 'Grishnákh', 'Gorbag', 'Shagrat', 'Old Man Willow', 'Tom, Bert & William', 'The Chief Warg'],
	B: ['Uglúk', 'Mauhúr', 'Gothmog', 'The Watcher in the Water', 'The Mouth of Sauron', 'King of the Oathbreakers', 'Shelob', 'The Great Goblin', 'Bolg'],
	C: ['Saruman', 'The Balrog', 'Witch-king of Angmar', 'Sauron the Necromancer', 'Gollum', 'Smaug', 'Azog'],
	D: ['Sauron the Dark Lord', 'Sauron the Lidless Eye'],
};
export const ENEMIES = [...ENEMY_RUNGS.A, ...ENEMY_RUNGS.B, ...ENEMY_RUNGS.C, ...ENEMY_RUNGS.D];
export const FIRST_ONLY = new Set(['Bill Ferny', 'Lotho']);

// ── class map (hero → class drives loot buckets; enemy → class is flavor/wiki only) ──
export const CLASS_OF = {
	// heroes
	Aragorn: 'paladin', Gandalf: 'mage', Legolas: 'hunter', Gimli: 'warrior', Frodo: 'rogue',
	Samwise: 'priest', 'Éowyn': 'demon_hunter', Galadriel: 'druid', 'Théoden': 'shaman', Elrond: 'priest',
	'Tom Bombadil': 'druid',
	// enemies (villains lean warlock/death_knight/warrior)
	'Bill Ferny': 'rogue', Lotho: 'warlock', 'Gríma Wormtongue': 'warlock', 'Grishnákh': 'warrior',
	Gorbag: 'warlock', Shagrat: 'rogue', 'Old Man Willow': 'druid', 'Tom, Bert & William': 'warrior',
	'The Chief Warg': 'hunter', 'Uglúk': 'warrior', 'Mauhúr': 'warrior', Gothmog: 'death_knight',
	'The Watcher in the Water': 'mage', 'The Mouth of Sauron': 'warlock', 'King of the Oathbreakers': 'death_knight',
	Shelob: 'hunter', 'The Great Goblin': 'warlock', Bolg: 'death_knight', Saruman: 'mage',
	'The Balrog': 'warlock', 'Witch-king of Angmar': 'death_knight', 'Sauron the Necromancer': 'death_knight',
	Gollum: 'rogue', Smaug: 'warrior', Azog: 'warrior',
	'Sauron the Dark Lord': 'warlock', 'Sauron the Lidless Eye': 'warlock',
};
export const classOf = ch => CLASS_OF[ch] || 'neutral';
export const isEnemy = ch => ENEMIES.includes(ch);
export const isHero = ch => HEROES.includes(ch) || SECRET_HEROES.includes(ch);

// ── 38 unique hero powers ({ name, cost, text, effects }) — installed via each seat's `power` ──
// Effects use the standard engine DSL; targeted powers (enemy-creature/friendly-creature/any) are
// resolved by the UI (human) or ai.js (enemy), exactly like class-default powers.
const P = (name, cost, text, effects) => ({ name, cost, text, effects });
export const HERO_POWERS = {
	// heroes
	Aragorn: P('Elessar', 2, 'Give a friendly creature +1/+1.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }]),
	Gandalf: P('You Shall Not Pass!', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	Legolas: P('Elf-shot', 2, 'Deal 1 damage to any target.', [{ type: 'damage', value: 1, target: 'any' }]),
	Gimli: P('And My Axe!', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	Frodo: P('Slip Away', 2, 'Give a friendly creature Elusive.', [{ type: 'grant', keyword: 'elusive', target: 'friendly-creature' }]),
	Samwise: P("Don't You Leave Him", 2, 'Restore 3 Health to your hero.', [{ type: 'heal', value: 3, target: 'self' }]),
	'Éowyn': P('I Am No Man', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	Galadriel: P('Gift of Lórien', 2, 'Summon a 1/1 Elf with Elusive.', [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Elf of Lórien', tribe: 'Elf', keywords: ['elusive'] }]),
	'Théoden': P('Forth Eorlingas!', 2, 'Give your creatures +1/+0.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }]),
	Elrond: P("Rivendell's Grace", 2, 'Restore 2 Health to your hero and Scry 1.', [{ type: 'heal', value: 2, target: 'self' }, { type: 'scry', value: 1 }]),
	'Tom Bombadil': P('Ho! Merry Dol!', 2, 'Draw a card, then discard a card.', [{ type: 'draw', value: 1 }, { type: 'discard-random', count: 1 }]),
	// enemies (Rung A)
	'Bill Ferny': P('Con the Traveller', 2, 'Each opponent discards a random card.', [{ type: 'enemy-discard', count: 1 }]),
	Lotho: P('Rally the Ruffians', 2, 'Summon a 1/1 Ruffian with Taunt.', [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Shire Ruffian', tribe: 'Halfling', keywords: ['taunt'] }]),
	'Gríma Wormtongue': P('Poison Words', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Grishnákh': P('Brash Charge', 2, 'Summon a 2/1 Orc with Rush.', [{ type: 'summon', count: 1, attack: 2, health: 1, name: 'Orc Raider', tribe: 'Orc', keywords: ['rush'] }]),
	Gorbag: P('Cruel Bargain', 2, 'Deal 1 damage to your hero and draw a card.', [{ type: 'damage', value: 1, target: 'self' }, { type: 'draw', value: 1 }]),
	Shagrat: P('Loot the Fallen', 2, 'Gain a Coin.', [{ type: 'gain-coin', value: 1 }]),
	'Old Man Willow': P('Snapping Bough', 2, 'Deal 1 damage to an enemy creature.', [{ type: 'damage', value: 1, target: 'enemy-creature' }]),
	'Tom, Bert & William': P('Hurl a Boulder', 2, 'Deal 2 damage to a random enemy.', [{ type: 'random-damage', value: 2, pool: 'enemies', count: 1 }]),
	'The Chief Warg': P('Warg-call', 2, 'Summon a 2/2 Wolf.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Warg', tribe: 'Wolf' }]),
	// enemies (Rung B)
	'Uglúk': P('Whip Them On', 2, 'Give your creatures +1/+0.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }]),
	'Mauhúr': P('Reinforce', 2, 'Summon a 2/2 Uruk-hai with Rush.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Uruk-hai', tribe: 'Orc', keywords: ['rush'] }]),
	Gothmog: P('Morgul Reserves', 2, 'Summon a 2/2 Morgul Orc.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Morgul Orc', tribe: 'Orc' }]),
	'The Watcher in the Water': P('Drag Under', 2, 'Return an enemy creature to its owner’s hand.', [{ type: 'bounce', target: 'enemy-creature' }]),
	'The Mouth of Sauron': P('Parley', 2, 'Each opponent discards a card; draw a card.', [{ type: 'enemy-discard', count: 1 }, { type: 'draw', value: 1 }]),
	'King of the Oathbreakers': P('Summon the Dead', 2, 'Summon a 2/2 Shade with Deathtouch.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Oathbreaker Shade', tribe: 'Spirit', keywords: ['deathtouch'] }]),
	Shelob: P('Ensnare', 2, 'Freeze an enemy creature and deal 1 damage to it.', [{ type: 'freeze', target: 'enemy-creature' }, { type: 'damage', value: 1, target: 'enemy-creature' }]),
	'The Great Goblin': P('Goblin-town', 2, 'Summon two 1/1 Goblins.', [{ type: 'summon', count: 2, attack: 1, health: 1, name: 'Goblin-town Goblin', tribe: 'Goblin' }]),
	Bolg: P('Gundabad Horde', 2, 'Summon a 2/2 Goblin.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Gundabad Goblin', tribe: 'Goblin' }]),
	// enemies (Rung C)
	Saruman: P('Voice of Isengard', 2, 'Summon a 2/2 Uruk-hai.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Uruk-hai', tribe: 'Orc' }]),
	'The Balrog': P('Flame of Udûn', 2, 'Deal 2 damage to all enemy creatures.', [{ type: 'damage', value: 2, target: 'enemy-creatures' }]),
	'Witch-king of Angmar': P('Morgul-blade', 2, 'Give a friendly creature +1/+0 and Deathtouch.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creature' }, { type: 'grant', keyword: 'deathtouch', target: 'friendly-creature' }]),
	'Sauron the Necromancer': P('Raise Dead', 2, 'Summon a 3/3 Wraith with Deathtouch.', [{ type: 'summon', count: 1, attack: 3, health: 3, name: 'Dol Guldur Wraith', tribe: 'Wraith', keywords: ['deathtouch'] }]),
	Gollum: P('Sneak and Filch', 2, 'Give a friendly creature Stealth.', [{ type: 'grant', keyword: 'stealth', target: 'friendly-creature' }]),
	Smaug: P('Dragonfire', 2, 'Deal 3 damage to an enemy creature and gain a Coin.', [{ type: 'damage', value: 3, target: 'enemy-creature' }, { type: 'gain-coin', value: 1 }]),
	Azog: P('The Defiler', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	// enemies (Rung D — final bosses)
	'Sauron the Dark Lord': P('The Eye Searches', 2, 'Draw a card, then each opponent discards one.', [{ type: 'draw', value: 1 }, { type: 'enemy-discard', count: 1 }]),
	'Sauron the Lidless Eye': P('Lidless Gaze', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
};
export const powerOf = ch => HERO_POWERS[ch] || null;

// a seat def for createGame's classPicks: class id (for buckets), the character's display name,
// and its UNIQUE hero power (installed by the engine at createGame).
export function seatOf(character) {
	return { id: classOf(character), name: character, power: powerOf(character) };
}

// ── run constants ──
export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;

// ── decks ──
// hero deck = 10 singleton cards; enemy deck = 2 copies of each of its 15 cards (= 30).
export function deckOf(cardsById, character) {
	const ids = Object.values(cardsById).filter(d => d.meDeck === character && !d.token).map(d => d.id).sort();
	if (isEnemy(character)) { const deck = []; for (const id of ids) deck.push(id, id); return deck; }
	return ids; // heroes: 1 copy each
}

// which enemies the next fight (at the current WIN count) may draw from.
// Rung windows: A wins 0–2 (★ first-only enemies appear ONLY at win 0), B 3–6, C 7–10, D at win 11
// (the 12th and final fight). 3 A + 4 B + 4 C + 1 D = 12 fights.
export function enemyRosterFor(wins) {
	const w = Math.max(0, wins | 0);
	if (w <= 2) return w === 0 ? ENEMY_RUNGS.A.slice() : ENEMY_RUNGS.A.filter(e => !FIRST_ONLY.has(e));
	if (w <= 6) return ENEMY_RUNGS.B.slice();
	if (w <= 10) return ENEMY_RUNGS.C.slice();
	return ENEMY_RUNGS.D.slice();
}
export const rungFor = wins => (wins <= 2 ? 'A' : wins <= 6 ? 'B' : wins <= 10 ? 'C' : 'D');
export const rungLabel = wins => ({ A: 'Mook', B: 'Lieutenant', C: 'Commander', D: 'The Dark Lord' }[rungFor(wins)]);

// pick the next enemy from the rung for `wins`, avoiding an immediate repeat.
export function randomEnemy(wins, rng, avoidId) {
	let roster = enemyRosterFor(wins).filter(c => c !== avoidId);
	if (!roster.length) roster = enemyRosterFor(wins);
	return roster[Math.floor(rng() * roster.length)];
}

// build a STATIC enemy (no win-parity loot — the whole point of Middle-earth's departure from Duels).
export function generateEnemy(cardsById, character) {
	return { id: character, name: character, cls: classOf(character), deck: deckOf(cardsById, character), rung: null };
}

// ── loot ──
// every win: (1) a spoils draft (pick 1 of 3 from the vanquished foe's deck, or none), then
// (2) an alternating aid — a treasure on odd wins, a class bucket on even wins (win 1 = treasure).
export const rewardForWin = wins => (wins % 2 === 1 ? 'treasure' : 'bucket');

// three distinct spoils cards drawn from the vanquished enemy's own card pool (its 15 uniques).
export function spoilsChoices(cardsById, defeatedEnemyName, rng, count = 3) {
	const pool = Object.values(cardsById).filter(d => d.meDeck === defeatedEnemyName && d.meSide === 'enemy' && !d.token).map(d => d.id);
	const out = [];
	for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
	return out;
}

// the DUELS treasure pool (reused for the alternating treasure reward).
export function treasurePool(cardsById) {
	return Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
}
