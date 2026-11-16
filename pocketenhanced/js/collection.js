// collection.js — the cards a player owns, the packs that give them, and what a deck may be built from.
// Pure rules (no storage, no page): save.js keeps the collection on the device, main.js draws it.
//
// A collection is { v, prints: { printingId: copies }, packs, points, opened }. A pack gives PRINTINGS (the base
// card, a full art, a rainbow, an immersive, a crown: data/packs.js); for play every printing counts as its card.
// Odds: Pocket's own slot table for a regular Genetic Apex pack (cards 1-3 are one-diamond; card 4 and card 5
// roll a rarity, then a printing of that rarity in the chosen booster, each equally likely).
import { CARDS, card } from './data/cards.js';
import { PRINTS } from './data/packs.js';

export const COLLECTION_VERSION = 1;
export const BOOSTERS = Object.freeze([
	Object.freeze({ id: 'C', name: 'Charizard', dex: 6, type: 'Fire', set: 'Genetic Apex' }),
	Object.freeze({ id: 'M', name: 'Mewtwo', dex: 150, type: 'Psychic', set: 'Genetic Apex' }),
	Object.freeze({ id: 'P', name: 'Pikachu', dex: 25, type: 'Lightning', set: 'Genetic Apex' }),
	Object.freeze({ id: 'W', name: 'Mew', dex: 151, type: 'Grass', set: 'Mythical Island' }),
	Object.freeze({ id: 'D', name: 'Dialga', dex: 483, type: 'Metal', set: 'Space-Time Smackdown' }),
	Object.freeze({ id: 'K', name: 'Palkia', dex: 484, type: 'Water', set: 'Space-Time Smackdown' }),
	Object.freeze({ id: 'A', name: 'Arceus', dex: 493, type: 'Colorless', set: 'Triumphant Light' }),
	Object.freeze({ id: 'S', name: 'Shining', dex: 487, type: 'Psychic', set: 'Shining Revelry' }),
]);
export const RARITY = Object.freeze({ '1D': '◆', '2D': '◆◆', '3D': '◆◆◆', '4D': '◆◆◆◆', '1S': '★', '2S': '★★', '3S': '★★★', '1H': '✦', '2H': '✦✦', CR: '♛', N: 'Promo' });
export const RARITY_ORDER = Object.freeze(['N', '1D', '2D', '3D', '4D', '1S', '2S', '3S', '1H', '2H', 'CR']);   // (1H, 2H: the shiny rarities, from Shining Revelry on)
/** Per-slot odds, in percent (each row sums to 100). */
export const SLOT_ODDS = Object.freeze({
	4: Object.freeze({ '2D': 90, '3D': 5, '4D': 1.666, '1S': 2.572, '2S': 0.5, '3S': 0.222, CR: 0.04 }),
	5: Object.freeze({ '2D': 60, '3D': 20, '4D': 6.664, '1S': 10.288, '2S': 2, '3S': 0.888, CR: 0.16 }),
});
/** A booster that holds shiny printings rolls them too (Shining Revelry's table). */
export const SHINY_SLOT_ODDS = Object.freeze({
	4: Object.freeze({ '2D': 89, '3D': 4.952, '4D': 1.666, '1S': 2.572, '2S': 0.5, '3S': 0.222, '1H': 0.714, '2H': 0.333, CR: 0.041 }),
	5: Object.freeze({ '2D': 56, '3D': 19.81, '4D': 6.664, '1S': 10.288, '2S': 2, '3S': 0.888, '1H': 2.857, '2H': 1.333, CR: 0.16 }),
});
/** The slot odds a booster uses. */
export const oddsOf = booster => (PRINTS.some(p => p[3].includes(booster) && (p[2] === '1H' || p[2] === '2H')) ? SHINY_SLOT_ODDS : SLOT_ODDS);
/** What one card costs in pack points (Pocket's exchange prices), by the rarity of its base printing. */
export const EXCHANGE = Object.freeze({ '1D': 35, '2D': 70, '3D': 150, '4D': 500 });
export const POINTS_PER_PACK = 5, START_PACKS = 10, PACK_FOR_MATCH = 1, PACK_FOR_WIN = 2, MAX_PACKS = 999, MAX_COPIES = 99;
export const PACK_SIZE = 5;

const PRINT_BY_ID = new Map(PRINTS.map(p => [p[0], p]));
export const printInfo = id => { const p = PRINT_BY_ID.get(id); return p ? { id: p[0], card: p[1], rarity: p[2], boosters: p[3] } : null; };
const pool = (booster, rarity) => PRINTS.filter(p => p[3].includes(booster) && p[2] === rarity);
const baseRarity = c => (PRINT_BY_ID.get(c.id) || [])[2] || 'N';

/** Roll one pack: 5 printing ids. `rand` returns a number in [0, 1). */
export function rollPack(booster, rand) {
	if (!BOOSTERS.some(b => b.id === booster)) throw new Error('no such booster');
	const one = list => list[Math.min(list.length - 1, Math.floor(rand() * list.length))][0];
	const out = [];
	for (let i = 0; i < 3; i++) out.push(one(pool(booster, '1D')));
	for (const slot of [4, 5]) {
		let r = rand() * 100, pick = '2D';
		for (const [rar, pct] of Object.entries(oddsOf(booster)[slot])) { if (r < pct) { pick = rar; break; } r -= pct; }
		out.push(one(pool(booster, pick)));
	}
	return out;
}

/** A new player's collection: the Promo-A starter Trainers (two of each, as Pocket hands them out) and packs to open. */
export function newCollection() {
	const prints = {};
	for (const p of PRINTS) if (p[2] === 'N' && !p[3]) prints[p[0]] = 2;
	return { v: COLLECTION_VERSION, prints, packs: START_PACKS, points: 0, opened: 0 };
}
/** Read whatever was stored: a usable collection, or null (so the caller starts a new one and never overwrites a newer format). */
export function cleanCollection(x) {
	if (!x || typeof x !== 'object' || x.v !== COLLECTION_VERSION || !x.prints || typeof x.prints !== 'object') return null;
	const prints = {};
	for (const [id, n] of Object.entries(x.prints)) if (PRINT_BY_ID.has(id) && Number.isInteger(n) && n > 0) prints[id] = Math.min(n, MAX_COPIES);
	const int = (v, max) => (Number.isInteger(v) && v > 0 ? Math.min(v, max) : 0);
	return { v: COLLECTION_VERSION, prints, packs: int(x.packs, MAX_PACKS), points: int(x.points, 999999), opened: int(x.opened, 9999999) };
}

/** Copies owned of a card (all its printings together). */
export function owned(col, cardId) { const c = card(cardId); return c ? c.printings.reduce((n, p) => n + (col.prints[p] || 0), 0) : 0; }
/** The best printing owned of a card (for showing it off), or null. */
export function bestPrint(col, cardId) {
	const c = card(cardId); let best = null;
	for (const p of c ? c.printings : []) if (col.prints[p] && (!best || RARITY_ORDER.indexOf(PRINT_BY_ID.get(p)[2]) > RARITY_ORDER.indexOf(PRINT_BY_ID.get(best)[2]))) best = p;
	return best;
}
export const uniqueOwned = col => CARDS.filter(c => owned(col, c.id) > 0).length;

/** Open one pack of a booster: -> { col (the new collection), pulls: [{ id, card, rarity, isNew }] }, or null with no pack to open. */
export function openPack(col, booster, rand) {
	if (!(col.packs > 0)) return null;
	const ids = rollPack(booster, rand), prints = { ...col.prints }, pulls = [];
	for (const id of ids) {
		const info = printInfo(id);
		pulls.push({ ...info, isNew: owned({ prints }, info.card) === 0 });
		prints[id] = Math.min(MAX_COPIES, (prints[id] || 0) + 1);
	}
	return { col: { ...col, prints, packs: col.packs - 1, points: col.points + POINTS_PER_PACK, opened: col.opened + 1 }, pulls };
}
export function addPacks(col, n) { return { ...col, packs: Math.min(MAX_PACKS, col.packs + Math.max(0, n | 0)) }; }

/** Pack points for one copy of a card, or null when it cannot be exchanged for (a promo, or a card only found in no booster). */
export function exchangeCost(cardId) { const c = card(cardId); return c ? EXCHANGE[baseRarity(c)] || null : null; }
/** Spend pack points on one copy: -> the new collection, or a string saying why not. */
export function exchange(col, cardId) {
	const c = card(cardId), cost = exchangeCost(cardId);
	if (!c || !cost) return 'that card cannot be exchanged for';
	if (col.points < cost) return `that takes ${cost} pack points (you have ${col.points})`;
	if (owned(col, cardId) >= MAX_COPIES) return 'you have as many as you can hold';
	return { ...col, prints: { ...col.prints, [c.id]: (col.prints[c.id] || 0) + 1 }, points: col.points - cost };
}

/** The cards of a deck the collection is short of: [{ name, need, have }] (by name, as the deck's two-copy rule counts). */
export function missingFor(col, deck) {
	const need = new Map(), have = new Map();
	for (const id of deck) { const c = card(id); if (c) need.set(c.name, (need.get(c.name) || 0) + 1); }
	for (const c of CARDS) if (need.has(c.name)) have.set(c.name, (have.get(c.name) || 0) + owned(col, c.id));
	return [...need].filter(([name, n]) => (have.get(name) || 0) < n).map(([name, n]) => ({ name, need: n, have: have.get(name) || 0 }));
}
/** Copies owned of every card with this card's name (a deck counts copies by name). */
export function ownedByName(col, cardId) { const c = card(cardId); return c ? CARDS.filter(x => x.name === c.name).reduce((n, x) => n + owned(col, x.id), 0) : 0; }

/** Mew (the set's secret card, in no booster) comes to whoever owns every Pokémon numbered 1 to 150, as in Pocket. -> the collection, with Mew if it is due. */
export const SECRET = 'A1-283';
export function claimSecrets(col) {
	if (!card(SECRET) || owned(col, SECRET)) return col;
	const have = new Set(CARDS.filter(c => c.dex >= 1 && c.dex <= 150 && owned(col, c.id) > 0).map(c => c.dex));
	const all = new Set(CARDS.filter(c => c.dex >= 1 && c.dex <= 150).map(c => c.dex));
	return have.size === all.size ? { ...col, prints: { ...col.prints, [SECRET]: 1 } } : col;
}

// ---- one collection on several devices (colsync.js). Every number in a collection is a count, so two copies that
// both moved on from a common `base` combine exactly: the other copy, plus what changed here.
const sum3 = (base, mine, theirs, max) => Math.max(0, Math.min(max, theirs + mine - base));
/** `theirs` with this device's changes since `base` applied on top. */
export function merge3(base, mine, theirs) {
	const prints = {};
	for (const id of new Set([...Object.keys(base.prints), ...Object.keys(mine.prints), ...Object.keys(theirs.prints)])) {
		const n = sum3(base.prints[id] || 0, mine.prints[id] || 0, theirs.prints[id] || 0, MAX_COPIES);
		if (n > 0) prints[id] = n;
	}
	return { v: COLLECTION_VERSION, prints, packs: sum3(base.packs, mine.packs, theirs.packs, MAX_PACKS), points: sum3(base.points, mine.points, theirs.points, 999999), opened: sum3(base.opened, mine.opened, theirs.opened, 9999999) };
}
/** A device meeting an account that already has a collection: what was pulled and earned on the device is added to the
 *  account's. The device's own new-player grant (the starter Trainers, the 10 packs) is not given twice, and packs it
 *  already opened are not taken back out of the account's. */
export function linkFirst(mine, theirs) {
	const fresh = newCollection(), m = merge3(fresh, mine, theirs);
	return { ...m, packs: Math.min(MAX_PACKS, theirs.packs + Math.max(0, mine.packs - fresh.packs)) };
}
export function sameCollection(a, b) {
	if (a.packs !== b.packs || a.points !== b.points || a.opened !== b.opened) return false;
	const ka = Object.keys(a.prints), kb = Object.keys(b.prints);
	return ka.length === kb.length && ka.every(k => a.prints[k] === b.prints[k]);
}
