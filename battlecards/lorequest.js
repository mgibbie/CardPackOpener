// lorequest.js — single-player Lorequest run (a Duels variant).
// You pick 1 of 3 planeswalker 30-card STARTER decks (no draft). You then climb to
// 12 wins or 3 losses: battles 1-8 are vs other planeswalkers, 9+ vs the Eldrazi &
// legendary "boss" commanders. Each WIN loots a bucket (+ a treasure at milestones);
// the generated enemy is kept at exact WIN-parity (same bucket/treasure picks you hold).
// Deck data lives in cards.json (cards tagged `loreDeck:<Character>`, 15 each -> 2 copies);
// buckets/treasures/hero-powers reuse the Duels + class systems.
import * as Duels from './duels.js';

export const PLANESWALKERS = ['Ajani', 'Chandra', 'Daretti', 'Elspeth', 'Garruk', 'Gideon', 'Jace', 'Karn', 'Liliana', 'Lukka', 'Nissa', 'Ob Nixilis', 'Sorin', 'Teferi', 'Tezzeret', 'Vivian'];
export const BOSSES = ['Drana', 'Drivnod', 'Edgar Markov', 'Elesh Norn', 'Emrakul', 'Gix', 'Kozilek', 'Lolth', 'Mishra', 'Mondrak', 'Nicol Bolas', 'Sheoldred', 'Solphim', 'Tekuthal', 'Ulamog', 'Urabrask', 'Urza', 'Vorinclex', 'Yawgmoth', 'Zhulodok', 'Zopandrel'];

// each character's class drives its hero power + which buckets/treasures it is offered
export const CLASS_OF = {
	Ajani: 'paladin', Chandra: 'mage', Daretti: 'warrior', Elspeth: 'paladin', Garruk: 'hunter', Gideon: 'warrior',
	Jace: 'mage', Karn: 'warrior', Liliana: 'warlock', Lukka: 'demon_hunter', Nissa: 'shaman', 'Ob Nixilis': 'warlock',
	Sorin: 'death_knight', Teferi: 'priest', Tezzeret: 'rogue', Vivian: 'druid',
	Drana: 'death_knight', Drivnod: 'warlock', 'Edgar Markov': 'death_knight', 'Elesh Norn': 'paladin', Emrakul: 'mage',
	Gix: 'rogue', Kozilek: 'warrior', Lolth: 'warlock', Mishra: 'warrior', Mondrak: 'paladin', 'Nicol Bolas': 'mage',
	Sheoldred: 'warlock', Solphim: 'mage', Tekuthal: 'priest', Ulamog: 'warrior', Urabrask: 'demon_hunter', Urza: 'mage',
	Vorinclex: 'druid', Yawgmoth: 'warlock', Zhulodok: 'warrior', Zopandrel: 'hunter',
};
export const classOf = ch => CLASS_OF[ch] || 'neutral';
export const isBoss = ch => BOSSES.includes(ch);

export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;
export const PW_BATTLES = 8;               // first 8 battles vs planeswalkers, then bosses
export const TREASURE_WINS = [2, 5, 8, 11]; // wins at which a treasure is granted (and matched by the enemy)

// a character's color identity = the union of its 15 deck cards' colors (Karn's
// colorless artifacts carry none). In a run, BASICS are restricted to it — you
// play the character, you build the character's mana (shared impl in duels.js).
export const allowedBasics = (cardsById, character) => Duels.allowedBasicsFor(cardsById, 'loreDeck', character);

// the 30-card base deck for a character = 2 copies of each of its 15 loreDeck cards
export function deckOf(cardsById, character) {
	const ids = Object.values(cardsById).filter(d => d.loreDeck === character && !d.token).map(d => d.id).sort();
	const deck = [];
	for (const id of ids) deck.push(id, id);
	return deck;
}

// ---------- character progression ----------
// You start with 3 planeswalkers; one more core unlocks per COMPLETED run
// (win or lose), in a themed easy->hard order. The 21 bosses become playable
// only after every planeswalker is unlocked, each via a hard character feat:
// consecutive cleared runs (12 wins) as the thematically-linked planeswalker.
export const STARTERS = ['Chandra', 'Ajani', 'Garruk'];
export const CORE_UNLOCK_ORDER = ['Jace', 'Gideon', 'Liliana', 'Nissa', 'Sorin', 'Teferi', 'Elspeth',
	'Vivian', 'Daretti', 'Lukka', 'Ob Nixilis', 'Tezzeret', 'Karn'];
// boss -> [linked planeswalker, consecutive run WINS required]
export const BOSS_UNLOCKS = {
	'Elesh Norn': ['Ajani', 2], Urabrask: ['Chandra', 2], Vorinclex: ['Nissa', 2],
	Emrakul: ['Jace', 2], Tekuthal: ['Jace', 3],
	Urza: ['Teferi', 2],
	Sheoldred: ['Liliana', 2], Yawgmoth: ['Liliana', 3],
	Gix: ['Ob Nixilis', 2], Lolth: ['Ob Nixilis', 3],
	'Edgar Markov': ['Sorin', 2], Drana: ['Sorin', 3],
	Kozilek: ['Karn', 2], Ulamog: ['Karn', 3],
	Mishra: ['Daretti', 2], 'Nicol Bolas': ['Tezzeret', 2], Mondrak: ['Gideon', 2],
	Zopandrel: ['Garruk', 2], Solphim: ['Lukka', 2], Drivnod: ['Vivian', 2], Zhulodok: ['Elspeth', 2],
};
// which characters this account may play. stats = the server user.stats (modes +
// chars records); null (free play, no account) = the full roster.
export function unlockedCharacters(stats) {
	if (!stats) return [...PLANESWALKERS, ...BOSSES];
	const runs = stats.modes?.lorequest?.runs || 0;
	const cores = [...STARTERS, ...CORE_UNLOCK_ORDER.slice(0, Math.max(0, runs))];
	const out = [...cores];
	if (cores.length >= PLANESWALKERS.length) {
		const chars = stats.chars || {};
		for (const [boss, [pw, need]] of Object.entries(BOSS_UNLOCKS)) {
			if ((chars['lorequest|' + pw]?.best || 0) >= need) out.push(boss);
		}
	}
	return out;
}

// N distinct random characters from a pool (the run-start offer). `pinned`
// entries (characters with a live win streak) are always included, ahead of
// the random fill — a streak must always be continuable.
export function offerFrom(pool, rng, count = 3, pinned = []) {
	const out = [];
	for (const c of pinned) if (pool.includes(c) && !out.includes(c) && out.length < count) out.push(c);
	const bag = pool.filter(c => !out.includes(c));
	while (out.length < count && bag.length) out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
	return out;
}

// characters in `pool` with a live win streak in this mode (server resets a
// character's streak only when THAT character loses a run). Hottest first.
export function streakPins(pool, stats, modeKey) {
	const chars = stats?.chars || {};
	const s = c => chars[modeKey + '|' + c]?.streak || 0;
	return pool.filter(c => s(c) >= 1).sort((a, b) => s(b) - s(a));
}

// three distinct planeswalkers to offer as starter decks (free-play path)
export function starterChoices(rng, count = 3) {
	return offerFrom(PLANESWALKERS, rng, count);
}

// which roster the next enemy (at `games` = wins+losses played) is drawn from
export function enemyRosterFor(games) { return games < PW_BATTLES ? PLANESWALKERS : BOSSES; }

// pick a random enemy character from the appropriate roster (no immediate repeat, and — for
// the planeswalker stretch — never your own deck's character)
export function randomEnemy(games, rng, avoidId, selfId) {
	let roster = enemyRosterFor(games).filter(c => c !== avoidId && c !== selfId);
	if (!roster.length) roster = enemyRosterFor(games);
	return roster[Math.floor(rng() * roster.length)];
}

// win-parity loot budget: one bucket per win, plus a treasure per milestone reached
export function enemyLoot(wins) {
	const w = Math.max(0, wins);
	return { buckets: w, treasures: TREASURE_WINS.filter(x => x <= w).length };
}

// build an enemy character's deck at the player's exact WIN-parity
export function generateEnemy(cardsById, character, wins, rng) {
	const deck = deckOf(cardsById, character);
	const cls = classOf(character);
	const loot = enemyLoot(wins);
	for (let b = 0; b < loot.buckets; b++) {
		const bk = Duels.offerBuckets(cardsById, [cls], rng, 1)[0];
		if (bk) deck.push(...Duels.rollBucket(cardsById, [cls], bk, rng, 3));
	}
	const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
	for (let t = 0; t < loot.treasures && treasurePool.length; t++) deck.push(treasurePool[Math.floor(rng() * treasurePool.length)].id);
	return { id: character, name: character, cls, deck, loot };
}
