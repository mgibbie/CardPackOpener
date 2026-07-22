// collection.js — card collection, gold, deck persistence, and pack rolls.
const GOLD_KEY = 'magepunk_cardgold_v1';
const COLLECTION_KEY = 'magepunk_cards_v1';
const DECK_KEY = 'magepunk_deck_v1';

export const PACK_PRICE = 100;
export const PACK_SIZE = 5;
export const DECK_SIZE = 40;
export const MAX_COPIES = 2;
export const MAX_LEGENDARY_COPIES = 1;
const STARTING_GOLD = 300;

export function getGold() {
	const v = parseInt(localStorage.getItem(GOLD_KEY), 10);
	if (isNaN(v)) {
		localStorage.setItem(GOLD_KEY, String(STARTING_GOLD));
		return STARTING_GOLD;
	}
	return v;
}
export function earnGold(n) {
	localStorage.setItem(GOLD_KEY, String(getGold() + n));
}
export function spendGold(n) {
	const g = getGold();
	if (g < n) return false;
	localStorage.setItem(GOLD_KEY, String(g - n));
	return true;
}

// collection: {cardId: count}; new players get 2x each common + 1x each uncommon.
// When new sets are added, existing collections are topped up with the new
// starter commons/uncommons they don't own yet (never overwriting counts).
// lands are bought in-game and colored cards are conjured by lands — neither
// is collectible, packable, or deck-legal
export function collectible(def) {
	return def.type !== 'land' && !(def.colors && def.colors.length) && !def.companion && !def.commander && !def.token;
}

export function getCollection(cards) {
	let c = null;
	try {
		const parsed = JSON.parse(localStorage.getItem(COLLECTION_KEY));
		if (parsed && typeof parsed === 'object') c = parsed;
	} catch (e) {}
	if (!c) c = {};
	let changed = false;
	for (const def of cards) {
		if (def.id in c || !collectible(def)) continue;
		if (def.rarity === 'common' || !def.rarity) { c[def.id] = 2; changed = true; }
		else if (def.rarity === 'uncommon') { c[def.id] = 1; changed = true; }
	}
	if (changed) localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
	return c;
}
export function addToCollection(ids) {
	const c = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '{}');
	for (const id of ids) c[id] = (c[id] || 0) + 1;
	localStorage.setItem(COLLECTION_KEY, JSON.stringify(c));
	return c;
}

// weighted rarity roll; the last card of each pack is guaranteed rare+
const WEIGHTS = [['common', 60], ['uncommon', 25], ['rare', 10], ['epic', 4], ['legendary', 1]];
const RARE_PLUS = [['rare', 75], ['epic', 20], ['legendary', 5]];

function rollRarity(table) {
	const total = table.reduce((s, [, w]) => s + w, 0);
	let r = Math.random() * total;
	for (const [rarity, w] of table) {
		r -= w;
		if (r <= 0) return rarity;
	}
	return table[0][0];
}

export function rollPack(cards) {
	const byRarity = {};
	for (const def of cards.filter(collectible)) {
		const r = def.rarity || 'common';
		(byRarity[r] = byRarity[r] || []).push(def);
	}
	const pull = table => {
		let rarity = rollRarity(table);
		while (!byRarity[rarity]?.length) {
			// fall back down the ladder if the set has no cards at this rarity
			const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
			rarity = order[Math.min(order.indexOf(rarity) + 1, order.length - 1)];
		}
		const pool = byRarity[rarity];
		return pool[Math.floor(Math.random() * pool.length)];
	};
	const out = [];
	for (let i = 0; i < PACK_SIZE - 1; i++) out.push(pull(WEIGHTS));
	out.push(pull(RARE_PLUS));
	return out;
}

// deck: array of card ids (may repeat up to copy limits)
export function loadDeck() {
	try {
		const d = JSON.parse(localStorage.getItem(DECK_KEY));
		if (Array.isArray(d)) return d;
	} catch (e) {}
	return [];
}
export function saveDeck(ids) {
	localStorage.setItem(DECK_KEY, JSON.stringify(ids));
}

// does a card fit a class identity? (neutrals always; duals count for both)
export function fitsClass(def, classId) {
	if (!classId) return true;
	const cc = def.cardClass || 'neutral';
	return cc === 'neutral' || cc === classId || cc.split('__').includes(classId);
}

// commander / companion: optional single cards that ride ALONGSIDE the 40-card
// deck in their own zones (they don't count toward the 40). A deck may bring one,
// both, or neither — 40 + 1 commander + 1 companion = 42 cards at most.
export const isCommander = def => !!(def && def.commander);
export const isCompanion = def => !!(def && def.companion);

export function validateDeck(ids, cardsById, collection, classId, commander, companion) {
	if (ids.length !== DECK_SIZE) return `Deck needs ${DECK_SIZE} cards (has ${ids.length}).`;
	const counts = {};
	for (const id of ids) {
		if (!cardsById[id]) return `Unknown card: ${id}`;
		if (!collectible(cardsById[id])) return `${cardsById[id].name} can't go in decks.`;
		if (!fitsClass(cardsById[id], classId)) return `${cardsById[id].name} isn't playable by your class.`;
		counts[id] = (counts[id] || 0) + 1;
		const limit = cardsById[id].rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
		if (counts[id] > limit) return `Too many copies of ${cardsById[id].name} (max ${limit}).`;
		if (counts[id] > (collection[id] || 0)) return `You don't own ${counts[id]}x ${cardsById[id].name}.`;
	}
	if (commander) {
		const c = cardsById[commander];
		if (!isCommander(c)) return `That commander isn't valid.`;
		if (!fitsClass(c, classId)) return `${c.name} isn't a ${classId} commander.`;
	}
	if (companion) {
		const c = cardsById[companion];
		if (!isCompanion(c)) return `That companion isn't valid.`;
		if (!fitsClass(c, classId)) return `${c.name} isn't a ${classId} companion.`;
	}
	return null; // valid
}
