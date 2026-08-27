// swordcoast.js — Lorequest: Sword Coast, a traditional dungeon run built from D&D MTG art.
// You pick ONE Companion hero (a 10-card singleton starter deck) and delve a gauntlet of the
// Sword Coast's villains — rung-gated enemies (each a static 15×2 = 30-card deck) — until 12 wins
// or 3 losses. Heroes and enemies are DISJOINT rosters. Like Middle-earth there is NO win-parity:
// enemies are STATIC (fixed deck + one unique signature hero power each); difficulty scales by RUNG.
// Your deck grows every win via a spoils draft (1-of-3 from the fallen foe) + an alternating
// treasure/class-bucket reward.
//
// Signature mechanic = ADVANCE (Venture into the Dungeon) with a sprinkle of d20 rolls
// (roll-scry sides:20). Card data lives in cards.json (tagged `scDeck:<Character>` + `scSide` +
// ids `sc_*`). Hero powers are UNIQUE per character, installed at createGame via each seat's `power`.

// ── rosters ──
export const HEROES = ['Drizzt', 'Bruenor', 'Catti-brie', 'Wulfgar', 'Minsc', 'Jaheira', 'Halsin', 'Volo', 'Mazzy', 'Nadaar'];
export const SECRET_HEROES = ['Gale']; // unlocked by clearing a run (12 wins)

// 27 enemies, split into rungs. ★ FIRST_ONLY = only spawns as your very first fight (win 0).
export const ENEMY_RUNGS = {
	A: ['Gut, True Soul Zealot', 'Baeloth Barrityl, Entertainer', 'Burakos, Party Leader', 'Safana, Calimport Cutthroat', 'Nalia de\'Arnise', 'Kalain, Reclusive Painter', 'Grumgully, the Generous', 'Targ Nar, Demon-Fang Gnoll', 'Kazuul, Tyrant of the Cliffs'],
	B: ['Xanathar, Guild Kingpin', 'Karazikar, the Eye Tyrant', 'Captain N\'ghathrod', 'Zalto, Fire Giant Duke', 'Storvald, Frost Giant Jarl', 'Ebondeath, Dracolich', 'Old Gnawbone', 'Baba Lysaga, Night Witch', 'Jon Irenicus, Shattered One'],
	C: ['Bane, Lord of Darkness', 'Bhaal, Lord of Murder', 'Myrkul, Lord of Bones', 'Orcus, Prince of Undeath', 'Acererak the Archlich', 'Sarevok, Deathbringer', 'Raphael, Fiendish Savior'],
	D: ['Tiamat', 'Asmodeus the Archfiend'],
};
export const ENEMIES = [...ENEMY_RUNGS.A, ...ENEMY_RUNGS.B, ...ENEMY_RUNGS.C, ...ENEMY_RUNGS.D];
export const FIRST_ONLY = new Set(['Gut, True Soul Zealot', 'Baeloth Barrityl, Entertainer']);

// ── class map (hero → class drives loot buckets; enemy → class is flavor/wiki only) ──
export const CLASS_OF = {
	// heroes
	Drizzt: 'hunter', Bruenor: 'warrior', 'Catti-brie': 'mage', Wulfgar: 'demon_hunter', Minsc: 'druid',
	Jaheira: 'shaman', Halsin: 'druid', Volo: 'rogue', Mazzy: 'paladin', Nadaar: 'priest', Gale: 'mage',
	// enemies
	'Gut, True Soul Zealot': 'warrior', 'Baeloth Barrityl, Entertainer': 'warlock', 'Burakos, Party Leader': 'rogue',
	'Safana, Calimport Cutthroat': 'rogue', 'Nalia de\'Arnise': 'mage', 'Kalain, Reclusive Painter': 'warlock',
	'Grumgully, the Generous': 'shaman', 'Targ Nar, Demon-Fang Gnoll': 'hunter', 'Kazuul, Tyrant of the Cliffs': 'warrior',
	'Xanathar, Guild Kingpin': 'warlock', 'Karazikar, the Eye Tyrant': 'warlock', 'Captain N\'ghathrod': 'warlock',
	'Zalto, Fire Giant Duke': 'warrior', 'Storvald, Frost Giant Jarl': 'mage', 'Ebondeath, Dracolich': 'death_knight',
	'Old Gnawbone': 'warrior', 'Baba Lysaga, Night Witch': 'warlock', 'Jon Irenicus, Shattered One': 'mage',
	'Bane, Lord of Darkness': 'death_knight', 'Bhaal, Lord of Murder': 'death_knight', 'Myrkul, Lord of Bones': 'warlock',
	'Orcus, Prince of Undeath': 'death_knight', 'Acererak the Archlich': 'warlock', 'Sarevok, Deathbringer': 'death_knight',
	'Raphael, Fiendish Savior': 'warlock', Tiamat: 'warrior', 'Asmodeus the Archfiend': 'warlock',
};
export const classOf = ch => CLASS_OF[ch] || 'neutral';
export const isEnemy = ch => ENEMIES.includes(ch);
export const isHero = ch => HEROES.includes(ch) || SECRET_HEROES.includes(ch);

// each character's MTG colour identity (from the source Scryfall cards) — the DECK cards are
// colourless class cards, so this drives the wiki's mana-symbol badges (parallel to Middle-earth).
export const COLOR_IDENTITY = {
	// heroes
	Drizzt: ['G', 'W'], Bruenor: ['R', 'W'], 'Catti-brie': ['G', 'W'], Wulfgar: ['G', 'R'], Minsc: ['G', 'R', 'W'],
	Jaheira: ['G'], Halsin: ['G'], Volo: ['G', 'U'], Mazzy: ['G', 'R', 'W'], Nadaar: ['W'], Gale: ['U'],
	// enemies
	'Gut, True Soul Zealot': ['R'], 'Baeloth Barrityl, Entertainer': ['R'], 'Burakos, Party Leader': ['B'],
	'Safana, Calimport Cutthroat': ['B'], 'Nalia de\'Arnise': ['B', 'W'], 'Kalain, Reclusive Painter': ['B', 'R'],
	'Grumgully, the Generous': ['G', 'R'], 'Targ Nar, Demon-Fang Gnoll': ['G', 'R'], 'Kazuul, Tyrant of the Cliffs': ['R'],
	'Xanathar, Guild Kingpin': ['B', 'U'], 'Karazikar, the Eye Tyrant': ['B', 'R'], 'Captain N\'ghathrod': ['B', 'U'],
	'Zalto, Fire Giant Duke': ['R'], 'Storvald, Frost Giant Jarl': ['G', 'U', 'W'], 'Ebondeath, Dracolich': ['B'],
	'Old Gnawbone': ['G'], 'Baba Lysaga, Night Witch': ['B', 'G'], 'Jon Irenicus, Shattered One': ['B', 'U'],
	'Bane, Lord of Darkness': ['B', 'U', 'W'], 'Bhaal, Lord of Murder': ['B', 'G', 'R'], 'Myrkul, Lord of Bones': ['B', 'G', 'W'],
	'Orcus, Prince of Undeath': ['B'], 'Acererak the Archlich': ['B'], 'Sarevok, Deathbringer': ['B'],
	'Raphael, Fiendish Savior': ['B', 'R'], Tiamat: ['W', 'U', 'B', 'R', 'G'], 'Asmodeus the Archfiend': ['B'],
};
export const colorsOf = ch => COLOR_IDENTITY[ch] || [];

// ── 38 unique hero powers ({ name, cost, text, effects }) — installed via each seat's `power` ──
// Effects use the standard engine DSL; targeted powers are resolved by the UI (human) or ai.js.
// The Sword Coast signature: Advance (venture) + a d20 Scry (roll-scry sides:20) appear on powers.
const P = (name, cost, text, effects) => ({ name, cost, text, effects });
export const HERO_POWERS = {
	// heroes
	Drizzt: P('Flashing Scimitars', 2, 'Deal 1 damage to any target.', [{ type: 'damage', value: 1, target: 'any' }]),
	Bruenor: P('Dwarven Resolve', 2, 'Gain 4 Armor.', [{ type: 'armor', value: 4 }]),
	'Catti-brie': P('Heartseeker', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	Wulfgar: P('Rage of Tempus', 2, 'Give a friendly creature +2/+0.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }]),
	Minsc: P('Go for the Eyes, Boo!', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	Jaheira: P('Harper Ritual', 2, 'Gain a Mana Crystal this turn.', [{ type: 'gain-mana', value: 1 }]),
	Halsin: P('Wild Shape', 2, 'Summon a 2/2 Beast.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Wild Shape', tribe: 'Beast' }]),
	Volo: P('Field Research', 2, 'Advance (venture into the dungeon).', [{ type: 'advance' }]),
	Mazzy: P('Truesword', 2, 'Give a friendly creature +1/+1 and Divine Shield.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }, { type: 'grant', keyword: 'divine_shield', target: 'friendly-creature' }]),
	Nadaar: P('Selfless Guard', 2, 'Gain 3 life.', [{ type: 'heal', value: 3, target: 'self' }]),
	Gale: P('Weave the Arcana', 2, 'Roll a d20 and Scry that many.', [{ type: 'roll-scry', sides: 20 }]),
	// enemies (Rung A)
	'Gut, True Soul Zealot': P('Zealous Charge', 2, 'Summon a 2/1 Cultist with Rush.', [{ type: 'summon', count: 1, attack: 2, health: 1, name: 'Bhaal Cultist', tribe: 'Goblin', keywords: ['rush'] }]),
	'Baeloth Barrityl, Entertainer': P('Cruel Spectacle', 2, 'Deal 2 damage to a random enemy.', [{ type: 'random-damage', value: 2, pool: 'enemies', count: 1 }]),
	'Burakos, Party Leader': P('Split the Loot', 2, 'Gain a Coin.', [{ type: 'gain-coin', value: 1 }]),
	'Safana, Calimport Cutthroat': P('Backstab', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Nalia de\'Arnise': P('Fortify the Keep', 2, 'Summon a 1/2 Guard with Taunt.', [{ type: 'summon', count: 1, attack: 1, health: 2, name: 'Keep Guard', tribe: 'Human', keywords: ['taunt'] }]),
	'Kalain, Reclusive Painter': P('Crimson Muse', 2, 'Gain a Coin and draw a card.', [{ type: 'gain-coin', value: 1 }, { type: 'draw', value: 1 }]),
	'Grumgully, the Generous': P('Generous Gift', 2, 'Give a friendly creature +1/+1.', [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }]),
	'Targ Nar, Demon-Fang Gnoll': P('Gnoll Pack', 2, 'Summon a 1/1 Gnoll with Rush.', [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Gnoll Pack-Runner', tribe: 'Gnoll', keywords: ['rush'] }]),
	'Kazuul, Tyrant of the Cliffs': P('Toll of the Cliffs', 2, 'Summon a 2/2 Ogre with Taunt.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Cliff Ogre', tribe: 'Ogre', keywords: ['taunt'] }]),
	// enemies (Rung B)
	'Xanathar, Guild Kingpin': P('Eye Rays', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Karazikar, the Eye Tyrant': P('Disintegration Ray', 2, 'Deal 3 damage to an enemy creature.', [{ type: 'damage', value: 3, target: 'enemy-creature' }]),
	'Captain N\'ghathrod': P('Dredge the Deep', 2, 'Each opponent discards a card.', [{ type: 'enemy-discard', count: 1 }]),
	'Zalto, Fire Giant Duke': P('Forge-Hammer', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Storvald, Frost Giant Jarl': P('Frost Breath', 2, 'Freeze an enemy creature.', [{ type: 'freeze', target: 'enemy-creature' }]),
	'Ebondeath, Dracolich': P('Undying Flight', 2, 'Summon a 2/2 Wraith with Reborn.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Dracolich Wraith', tribe: 'Wraith', keywords: ['reborn'] }]),
	'Old Gnawbone': P('Hoard-Greed', 2, 'Gain two Coins.', [{ type: 'gain-coin', value: 2 }]),
	'Baba Lysaga, Night Witch': P('Night Hexes', 2, 'Deal 1 damage to all enemy creatures.', [{ type: 'damage', value: 1, target: 'enemy-creatures' }]),
	'Jon Irenicus, Shattered One': P('Shatter the Mind', 2, 'Freeze an enemy creature and deal 1 damage to it.', [{ type: 'freeze', target: 'enemy-creature' }, { type: 'damage', value: 1, target: 'enemy-creature' }]),
	// enemies (Rung C — the Dead Three + archfiends)
	'Bane, Lord of Darkness': P('Iron Tyranny', 2, 'Give your creatures +1/+0.', [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }]),
	'Bhaal, Lord of Murder': P('Murder', 2, 'Deal 2 damage to an enemy creature.', [{ type: 'damage', value: 2, target: 'enemy-creature' }]),
	'Myrkul, Lord of Bones': P('Call of Bones', 2, 'Summon a 2/2 Skeleton with Deathtouch.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Myrkul Skeleton', tribe: 'Skeleton', keywords: ['deathtouch'] }]),
	'Orcus, Prince of Undeath': P('Wand of Orcus', 2, 'Summon a 2/2 Undead.', [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Risen Undead', tribe: 'Zombie' }]),
	'Acererak the Archlich': P('Delve the Tomb', 2, 'Advance (venture into the dungeon).', [{ type: 'advance' }]),
	'Sarevok, Deathbringer': P('Deathbringer', 2, 'Give a friendly creature +2/+0 and Deathtouch.', [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creature' }, { type: 'grant', keyword: 'deathtouch', target: 'friendly-creature' }]),
	'Raphael, Fiendish Savior': P('Infernal Bargain', 2, 'Deal 1 damage to your hero and draw a card.', [{ type: 'damage', value: 1, target: 'own-hero' }, { type: 'draw', value: 1 }]),
	// enemies (Rung D — final bosses)
	Tiamat: P('Five Heads Roar', 2, 'Deal 1 damage to all enemy creatures.', [{ type: 'damage', value: 1, target: 'enemy-creatures' }]),
	'Asmodeus the Archfiend': P('Ruler of the Nine Hells', 2, 'Each opponent discards a card; draw a card.', [{ type: 'enemy-discard', count: 1 }, { type: 'draw', value: 1 }]),
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
	const ids = Object.values(cardsById).filter(d => d.scDeck === character && !d.token).map(d => d.id).sort();
	if (isEnemy(character)) { const deck = []; for (const id of ids) deck.push(id, id); return deck; }
	return ids; // heroes: 1 copy each
}

// which enemies the next fight (at the current WIN count) may draw from.
// Rung windows: A wins 0–2 (★ first-only appear ONLY at win 0), B 3–6, C 7–10, D at win 11.
export function enemyRosterFor(wins) {
	const w = Math.max(0, wins | 0);
	if (w <= 2) return w === 0 ? ENEMY_RUNGS.A.slice() : ENEMY_RUNGS.A.filter(e => !FIRST_ONLY.has(e));
	if (w <= 6) return ENEMY_RUNGS.B.slice();
	if (w <= 10) return ENEMY_RUNGS.C.slice();
	return ENEMY_RUNGS.D.slice();
}
export const rungFor = wins => (wins <= 2 ? 'A' : wins <= 6 ? 'B' : wins <= 10 ? 'C' : 'D');
export const rungLabel = wins => ({ A: 'Henchman', B: 'Lieutenant', C: 'Commander', D: 'Archfiend' }[rungFor(wins)]);

// pick the next enemy from the rung for `wins`, avoiding an immediate repeat.
export function randomEnemy(wins, rng, avoidId) {
	let roster = enemyRosterFor(wins).filter(c => c !== avoidId);
	if (!roster.length) roster = enemyRosterFor(wins);
	return roster[Math.floor(rng() * roster.length)];
}

// build a STATIC enemy (no win-parity loot — same departure from Duels as Middle-earth).
export function generateEnemy(cardsById, character) {
	return { id: character, name: character, cls: classOf(character), deck: deckOf(cardsById, character), rung: null };
}

// ── loot ──
// every win: (1) a spoils draft (pick 1 of 3 from the vanquished foe's deck, or none), then
// (2) an alternating aid — a treasure on odd wins, a class bucket on even wins (win 1 = treasure).
export const rewardForWin = wins => (wins % 2 === 1 ? 'treasure' : 'bucket');

// three distinct spoils cards drawn from the vanquished enemy's own card pool (its 15 uniques).
export function spoilsChoices(cardsById, defeatedEnemyName, rng, count = 3) {
	const pool = Object.values(cardsById).filter(d => d.scDeck === defeatedEnemyName && d.scSide === 'enemy' && !d.token).map(d => d.id);
	const out = [];
	for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
	return out;
}

// the treasure pool for the alternating treasure reward — the DUELS treasures.
export function treasurePool(cardsById) {
	return Object.values(cardsById).filter(d => (d.treasure && d.set === 'DUELS') || d.scTreasure);
}

// ---------- character progression ----------
// 3 starters; one more core hero unlocks per COMPLETED run (win or lose).
// Enemies become playable only after every core hero is unlocked, each via a
// hard feat: consecutive CLEARED runs (12 wins) as the linked hero. Secret
// heroes keep their own unlock mechanics and join the pool once earned.
export const STARTERS = ["Drizzt","Bruenor","Catti-brie"];
export const CORE_UNLOCK_ORDER = ["Wulfgar","Minsc","Jaheira","Halsin","Mazzy","Nadaar","Volo"];
// enemy -> [linked hero, consecutive run WINS required]
export const ENEMY_UNLOCKS = {
	"Targ Nar, Demon-Fang Gnoll": ["Drizzt", 2],
	"Orcus, Prince of Undeath": ["Drizzt", 3],
	"Tiamat": ["Drizzt", 4],
	"Kazuul, Tyrant of the Cliffs": ["Bruenor", 2],
	"Zalto, Fire Giant Duke": ["Bruenor", 2],
	"Storvald, Frost Giant Jarl": ["Bruenor", 3],
	"Grumgully, the Generous": ["Catti-brie", 2],
	"Old Gnawbone": ["Catti-brie", 3],
	"Myrkul, Lord of Bones": ["Catti-brie", 3],
	"Burakos, Party Leader": ["Wulfgar", 2],
	"Captain N'ghathrod": ["Wulfgar", 3],
	"Sarevok, Deathbringer": ["Minsc", 3],
	"Bhaal, Lord of Murder": ["Minsc", 3],
	"Asmodeus the Archfiend": ["Minsc", 4],
	"Nalia de'Arnise": ["Jaheira", 2],
	"Jon Irenicus, Shattered One": ["Jaheira", 3],
	"Gut, True Soul Zealot": ["Halsin", 2],
	"Baba Lysaga, Night Witch": ["Halsin", 2],
	"Raphael, Fiendish Savior": ["Halsin", 3],
	"Safana, Calimport Cutthroat": ["Mazzy", 2],
	"Karazikar, the Eye Tyrant": ["Mazzy", 3],
	"Acererak the Archlich": ["Mazzy", 3],
	"Ebondeath, Dracolich": ["Nadaar", 3],
	"Bane, Lord of Darkness": ["Nadaar", 3],
	"Baeloth Barrityl, Entertainer": ["Volo", 2],
	"Kalain, Reclusive Painter": ["Volo", 2],
	"Xanathar, Guild Kingpin": ["Volo", 3],
};
// which characters this account may play; stats = the server user.stats.
// null (free play, no account) = the full roster.
export function unlockedCharacters(stats) {
	if (!stats) return [...HEROES, ...ENEMIES];
	const runs = stats.modes?.swordcoast?.runs || 0;
	const cores = [...STARTERS, ...CORE_UNLOCK_ORDER.slice(0, Math.max(0, runs))];
	const out = [...cores];
	if (cores.length >= HEROES.length) {
		const chars = stats.chars || {};
		for (const [en, [hero, need]] of Object.entries(ENEMY_UNLOCKS)) {
			if ((chars['swordcoast|' + hero]?.best || 0) >= need) out.push(en);
		}
	}
	return out;
}
