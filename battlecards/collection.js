// collection.js — card collection, gold, deck persistence, and pack rolls.
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { STARTING_COLLECTION } from './starter-collection.js';
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
		safeSaveStr(GOLD_KEY, STARTING_GOLD);
		return STARTING_GOLD;
	}
	return v;
}
export function earnGold(n) {
	safeSaveStr(GOLD_KEY, getGold() + n);
}
export function spendGold(n) {
	const g = getGold();
	if (g < n) return false;
	safeSaveStr(GOLD_KEY, g - n);
	return true;
}

// collection: {cardId: count}. A new player starts with exactly the STARTING_COLLECTION
// (starter-collection.js): every card in the per-class starter decks + the
// dungeon/heist/tombs run starter decks — NOT the whole common/uncommon pool. When
// the starter set grows, existing collections are topped up with the new starter
// cards they don't own yet (never overwriting counts). lands are bought in-game and
// colored cards are conjured by lands — neither is collectible, packable, or deck-legal.
export function collectible(def) {
	return def.type !== 'land' && !(def.colors && def.colors.length) && !def.companion && !def.commander && !def.token;
}

export function getCollection(cards) {
	let c = safeLoad(COLLECTION_KEY, {});
	if (!c || typeof c !== 'object' || Array.isArray(c)) c = {}; // a valid-JSON-but-wrong-shape blob is unusable
	let changed = false;
	for (const [id, n] of Object.entries(STARTING_COLLECTION)) {
		if (id in c) continue; // never overwrite an existing count
		c[id] = n; changed = true;
	}
	if (changed) safeSave(COLLECTION_KEY, c);
	return c;
}
export function addToCollection(ids) {
	const loaded = safeLoad(COLLECTION_KEY, {}); // was a bare JSON.parse — a corrupt blob threw here
	const c = (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) ? loaded : {};
	for (const id of ids) c[id] = (c[id] || 0) + 1;
	safeSave(COLLECTION_KEY, c);
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
	const d = safeLoad(DECK_KEY, []);
	return Array.isArray(d) ? d : [];
}
export function saveDeck(ids) {
	safeSave(DECK_KEY, ids);
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
		// Companion deckbuilding constraint (e.g. Hex, Kellan's Shadow: "at least 15
		// artifacts that cost 3 or less"). req = { type?, maxCost?, minCost?, count, label? }.
		const req = c.companionReq;
		if (req) {
			const n = ids.filter(id => {
				const d = cardsById[id]; if (!d) return false;
				if (req.type && d.type !== req.type) return false;
				if (req.maxCost != null && (d.cost || 0) > req.maxCost) return false;
				if (req.minCost != null && (d.cost || 0) < req.minCost) return false;
				return true;
			}).length;
			if (n < (req.count || 0)) return `${c.name} needs ${req.count} ${req.label || 'qualifying cards'} in your deck (has ${n}).`;
		}
	}
	return null; // valid
}
