// collection.js — the cards a player owns, the packs that give them, and what a deck may be built from.
// Pure rules (no storage, no page): save.js keeps the collection on the device, main.js draws it.
//
// A collection is { v, prints: { printingId: copies }, packs, points, opened }. A pack gives PRINTINGS (the base
// card, a full art, a rainbow, an immersive, a crown: data/packs.js); for play every printing counts as its card.
// Odds: Pocket's own slot table for a regular Genetic Apex pack (cards 1-3 are one-diamond; card 4 and card 5
// roll a rarity, then a printing of that rarity in the chosen booster, each equally likely).
import { CARDS, card } from './data/cards.js';
import { PRINTS } from './data/packs.js';
import { starterDeck } from './decks.js';

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
	Object.freeze({ id: 'O', name: 'Solgaleo', dex: 791, type: 'Metal', set: 'Celestial Guardians' }),
	Object.freeze({ id: 'U', name: 'Lunala', dex: 792, type: 'Psychic', set: 'Celestial Guardians' }),
	Object.freeze({ id: 'X', name: 'Buzzwole', dex: 794, type: 'Grass', set: 'Extradimensional Crisis' }),
	Object.freeze({ id: 'E', name: 'Eevee', dex: 133, type: 'Colorless', set: 'Eevee Grove' }),
	Object.freeze({ id: 'L', name: 'Lugia', dex: 249, type: 'Colorless', set: 'Wisdom of Sea and Sky' }),
	Object.freeze({ id: 'H', name: 'Ho-Oh', dex: 250, type: 'Fire', set: 'Wisdom of Sea and Sky' }),
	Object.freeze({ id: 'G', name: 'Suicune', dex: 245, type: 'Water', set: 'Secluded Springs' }),
	Object.freeze({ id: 'Q', name: 'Deluxe', dex: 150, type: 'Psychic', set: 'Deluxe Pack ex' }),
	Object.freeze({ id: 'Y', name: 'Mega Gyarados', dex: 130, type: 'Water', set: 'Mega Rising' }),
	Object.freeze({ id: 'B', name: 'Mega Blaziken', dex: 257, type: 'Fire', set: 'Mega Rising' }),
	Object.freeze({ id: 'T', name: 'Mega Altaria', dex: 334, type: 'Psychic', set: 'Mega Rising' }),
	Object.freeze({ id: 'R', name: 'Mega Charizard Y', dex: 6, type: 'Fire', set: 'Crimson Blaze' }),
	Object.freeze({ id: 'F', name: 'Mega Gardevoir', dex: 282, type: 'Psychic', set: 'Fantastical Parade' }),
	Object.freeze({ id: 'N', name: 'Paldea', dex: 908, type: 'Grass', set: 'Paldean Wonders' }),
	Object.freeze({ id: 'I', name: 'Mega Charizard X', dex: 6, type: 'Fire', set: 'Mega Shine' }),
	Object.freeze({ id: 'V', name: 'Mega Lucario', dex: 448, type: 'Fighting', set: 'Pulsing Aura' }),
	Object.freeze({ id: 'Z', name: 'Koraidon', dex: 1007, type: 'Fighting', set: 'Paradox Drive' }),
	Object.freeze({ id: 'J', name: 'Mega Diancie', dex: 719, type: 'Psychic', set: 'Everyday Wonders' }),
	Object.freeze({ id: '1', name: 'Mega Rayquaza', dex: 384, type: 'Dragon', set: 'Ruler of the Skies' }),
	Object.freeze({ id: '2', name: 'Team Rocket', dex: 52, type: 'Darkness', set: "Team Rocket's Ambition" }),
	Object.freeze({ id: '3', name: 'Deluxe Mega', dex: 384, type: 'Dragon', set: 'Deluxe Pack: Mega' }),
	Object.freeze({ id: '4', name: 'Mega Mewtwo X', dex: 150, type: 'Psychic', set: 'Dual Fusion' }),
	Object.freeze({ id: '5', name: 'Pikachu', dex: 25, type: 'Lightning', set: 'Dual Fusion' }),
	Object.freeze({ id: '6', name: 'First Partners', dex: 151, type: 'Psychic', set: 'Special Pack: First Partners' }),
	Object.freeze({ id: '7', name: 'Promo A', dex: 52, type: 'Colorless', set: 'Promo-A' }),
	Object.freeze({ id: '8', name: 'Promo B', dex: 718, type: 'Fighting', set: 'Promo-B' }),
	Object.freeze({ id: '9', name: 'Promo C', dex: 150, type: 'Psychic', set: 'Promo-C' }),
]);
export const RARITY = Object.freeze({ '1D': '◆', '2D': '◆◆', '3D': '◆◆◆', '1F': '◇', '2F': '◇◇', '3F': '◇◇◇', '4D': '◆◆◆◆', '1S': '★', '2S': '★★', '3S': '★★★', '1H': '✦', '2H': '✦✦', CR: '♛', N: 'Promo' });
export const RARITY_ORDER = Object.freeze(['N', '1D', '2D', '3D', '1F', '2F', '3F', '4D', '1S', '2S', '3S', '1H', '2H', 'CR']);   // (1H, 2H: the shiny rarities, from Shining Revelry on)
/** Per-slot odds, in percent (each row sums to 100). */
export const SLOT_ODDS = Object.freeze({
	4: Object.freeze({ '2D': 90, '3D': 5, '4D': 1.666, '1S': 2.572, '2S': 0.5, '3S': 0.222, CR: 0.04 }),
	5: Object.freeze({ '2D': 60, '3D': 20, '4D': 6.664, '1S': 10.288, '2S': 2, '3S': 0.888, CR: 0.16 }),
});
/** A booster that holds shiny printings rolls them too (Shining Revelry's table). */
export const SHINY_SLOT_ODDS = Object.freeze({
	4: Object.freeze({ '2D': 89, '3D': 4.952, '4D': 1.666, '1S': 2.572, '2S': 0.5, '3S': 0.222, '1H': 0.714, '2H': 0.333, CR: 0.04 }),
	5: Object.freeze({ '2D': 56, '3D': 19.81, '4D': 6.664, '1S': 10.288, '2S': 2, '3S': 0.888, '1H': 2.857, '2H': 1.333, CR: 0.16 }),
});
/** One pack in 2,000 is a rare pack: all five cards are rolled from the star rarities up (each a printing of that rarity
 *  in the booster, equally likely). */
export const RARE_PACK_CHANCE = 0.0005;
export const RARE_PACK_ODDS = Object.freeze({ '1S': 40, '2S': 50, '3S': 5, CR: 5 });
export const SHINY_RARE_PACK_ODDS = Object.freeze({ '1S': 38, '2S': 47, '3S': 5, '1H': 5, '2H': 2, CR: 3 });
/** A booster with a pack of its own shape. Deluxe Pack ex: four cards, the last always a ◆◆◆◆ (a Pokémon ex), the third
 *  from a table that includes foil versions of the diamond cards (◇). Published rates, from the set's source file. */
export const SPECIAL_PACKS = Object.freeze({
	Q: Object.freeze({
		slots: Object.freeze([Object.freeze({ '1D': 100 }), Object.freeze({ '2D': 82.27, '1D': 17.73 }),
			Object.freeze({ '3D': 31.666, '1F': 23.021, '2F': 17.985, '1S': 12.858, '3F': 8.993, '2S': 2.5, '2H': 1.667, '3S': 1.111, CR: 0.198 }), Object.freeze({ '4D': 100 })]),
		rare: Object.freeze({ '2S': 61.538, '1S': 23.076, '2H': 7.692, '3S': 3.846, CR: 3.846 }),
	}),
	// Deluxe Pack: Mega: the same shape; its fourth card is now and then a star card, a rare pack's fourth card has its own
	// table, and 1 pack in 60 (1.666%) holds a fifth card, a shiny one.
	'3': Object.freeze({
		slots: Object.freeze([Object.freeze({ '1D': 100 }), Object.freeze({ '2D': 82.27, '1D': 17.73 }),
			Object.freeze({ '3D': 33.97, '1F': 21.385, '2F': 19.578, '1S': 12.858, '3F': 9.036, '2S': 2.125, '3S': 0.889, CR: 0.158 }), Object.freeze({ '4D': 99.363, '2S': 0.375, '3S': 0.222, CR: 0.04 })]),
		rare: Object.freeze({ '2S': 64, '1S': 24, CR: 8, '3S': 4 }),
		rareLast: Object.freeze({ '2S': 80, CR: 13.333, '3S': 6.667 }),
		plus: Object.freeze({ chance: 0.01666, slot: Object.freeze({ '2H': 100 }) }),
	}),
	// One card a pack, any printing of the booster as likely as any other: Special Pack: First Partners (its published
	// pack: one star card) and the three promo series (in Pocket a promo pack gives one card; here one booster holds a series).
	'6': Object.freeze({ any: true, slots: Object.freeze([Object.freeze({ '1S': 100 })]) }),
	'7': Object.freeze({ any: true, slots: Object.freeze([Object.freeze({ '1D': 100 })]) }),
	'8': Object.freeze({ any: true, slots: Object.freeze([Object.freeze({ '1D': 100 })]) }),
	'9': Object.freeze({ any: true, slots: Object.freeze([Object.freeze({ '1D': 100 })]) }),
});
/** How many cards a booster's pack holds. */
export const packSize = booster => (SPECIAL_PACKS[booster] ? SPECIAL_PACKS[booster].slots.length : PACK_SIZE);
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

/** Is this pack's content a rare pack's (five cards, none below one star)? */
export const isRarePack = ids => ids.length >= 4 && ids.every(id => !/[DF]$|^N$/.test((PRINT_BY_ID.get(id) || [])[2] || 'N'));
/** Roll one pack: 5 printing ids. `rand` returns a number in [0, 1). */
export function rollPack(booster, rand) {
	if (!BOOSTERS.some(b => b.id === booster)) throw new Error('no such booster');
	const one = list => list[Math.min(list.length - 1, Math.floor(rand() * list.length))][0];
	const roll = table => { let r = rand() * 100, pick = Object.keys(table)[0]; for (const [rar, pct] of Object.entries(table)) { if (r < pct) { pick = rar; break; } r -= pct; } return pick; };
	const out = [];
	const sp = SPECIAL_PACKS[booster];
	if (sp && sp.any) return [one(PRINTS.filter(p => p[3].includes(booster)))];
	if (sp) {
		const rare = rand() < RARE_PACK_CHANCE;
		sp.slots.forEach((slot, i) => { const want = roll(rare ? (sp.rareLast && i === sp.slots.length - 1 ? sp.rareLast : sp.rare) : slot), got = pool(booster, want); out.push(one(got.length ? got : pool(booster, rare ? '1S' : Object.keys(slot)[0]))); });
		if (!rare && sp.plus && rand() < sp.plus.chance) { const got = pool(booster, roll(sp.plus.slot)); if (got.length) out.push(one(got)); }   // (a pack with one more card)
		return out;
	}
	if (rand() < RARE_PACK_CHANCE) {
		const table = oddsOf(booster) === SHINY_SLOT_ODDS ? SHINY_RARE_PACK_ODDS : RARE_PACK_ODDS;
		for (let i = 0; i < PACK_SIZE; i++) { const got = pool(booster, roll(table)); out.push(one(got.length ? got : pool(booster, '1S'))); }
		return out;
	}
	for (let i = 0; i < 3; i++) out.push(one(pool(booster, '1D')));
	for (const slot of [4, 5]) {
		let r = rand() * 100, pick = '2D';
		for (const [rar, pct] of Object.entries(oddsOf(booster)[slot])) { if (r < pct) { pick = rar; break; } r -= pct; }
		out.push(one(pool(booster, pick)));
	}
	return out;
}

/** A new player starts with four ready-made decks (owner, 2026-11-17): every card of the Charizard, Blastoise, Venusaur
 *  and Pikachu decks; and with five packs of each kind (owner, the same day). Those are packs OF A BOOSTER (`own`: they
 *  open as that booster only); after them, packs are bought with stars (site/stars.js). */
export const START_DECKS = Object.freeze(['charizard', 'blastoise', 'venusaur', 'pikachu']), START = 2, START_OF_EACH = 5;
/** Packs held of one booster. */
export const packsOf = (col, booster) => (col.own && col.own[booster]) || 0;
/** Packs held of every booster together. */
export const ownPacks = col => Object.values(col.own || {}).reduce((a, b) => a + b, 0);
const cleanOwn = o => { if (!o || typeof o !== 'object') return null; const out = {}; for (const b of BOOSTERS) { const n = o[b.id]; if (Number.isInteger(n) && n > 0) out[b.id] = Math.min(n, MAX_PACKS); } return Object.keys(out).length ? out : null; };
export function newCollection() {
	const prints = {};
	for (const id of START_DECKS) for (const c of starterDeck(id).deck) if (PRINT_BY_ID.has(c)) prints[c] = Math.min(MAX_COPIES, (prints[c] || 0) + 1);
	return { v: COLLECTION_VERSION, prints, packs: 0, points: 0, opened: 0, st: START, own: Object.fromEntries(BOOSTERS.map(b => [b.id, START_OF_EACH])) };
}
/** What a new player was given before that: the Promo-A starter Trainers (two of each) and ten packs. Collections made
 *  then are kept as they are (no `st` on them); this is only how such a device's own grant is told from what it earned. */
export function firstCollection() {
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
	const out = { v: COLLECTION_VERSION, prints, packs: int(x.packs, MAX_PACKS), points: int(x.points, 999999), opened: int(x.opened, 9999999) };
	// (two things kept beside the counts, only when there is something to keep: today's Wonder Picks, and cards held for a trade)
	const w = cleanWonder(x.wonder); if (w) out.wonder = w;
	const e = cleanEscrow(x.escrow); if (e) out.escrow = e;
	if (x.st === START) out.st = START;
	const own = cleanOwn(x.own); if (own) out.own = own;
	return out;
}
const cleanWonder = w => (w && typeof w === 'object' && /^\d{4}-\d\d-\d\d$/.test(String(w.day)) && Array.isArray(w.used) ? (u => (u.length ? { day: String(w.day), used: u } : null))([...new Set(w.used.filter(i => Number.isInteger(i) && i >= 0 && i < 8))].sort()) : null);
const cleanEscrow = e => {
	if (!e || typeof e !== 'object') return null;
	const out = {}; let n = 0;
	for (const [tid, h] of Object.entries(e)) {
		if (n >= 12 || !/^[A-Za-z0-9:]{6,40}$/.test(tid) || !h || typeof h !== 'object') continue;
		const prints = {}; for (const [id, k] of Object.entries(h.prints || {})) if (PRINT_BY_ID.has(id) && Number.isInteger(k) && k > 0) prints[id] = Math.min(k, MAX_COPIES);
		out[tid] = { prints, packs: Number.isInteger(h.packs) && h.packs > 0 ? Math.min(h.packs, MAX_PACKS) : 0, at: Number.isFinite(h.at) ? Math.floor(h.at) : 0 }; n++;
	}
	return n ? out : null;
};
/** Two copies' Wonder Pick marks: the later day's, or both days' picks when it is the same day. */
const joinWonder = (a, b) => (!a ? b || null : !b ? a : a.day === b.day ? cleanWonder({ day: a.day, used: [...a.used, ...b.used] }) : a.day > b.day ? a : b);

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
	const mine = packsOf(col, booster);   // (a pack of this booster is opened before a pack that can be any booster)
	if (!(mine > 0) && !(col.packs > 0)) return null;
	if (mine > 0) { const own = { ...col.own }; if (mine > 1) own[booster] = mine - 1; else delete own[booster]; const { own: _, ...rest } = col; col = { ...rest, ...(Object.keys(own).length ? { own } : {}), packs: col.packs + 1 }; }   // (it becomes the pack that is opened just below)
	const ids = rollPack(booster, rand), prints = { ...col.prints }, pulls = [];
	for (const id of ids) {
		const info = printInfo(id);
		pulls.push({ ...info, isNew: owned({ prints }, info.card) === 0 });
		prints[id] = Math.min(MAX_COPIES, (prints[id] || 0) + 1);
	}
	return { col: { ...col, prints, packs: col.packs - 1, points: col.points + POINTS_PER_PACK, opened: col.opened + 1 }, pulls, rare: isRarePack(ids) };
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
	const out = { v: COLLECTION_VERSION, prints, packs: sum3(base.packs, mine.packs, theirs.packs, MAX_PACKS), points: sum3(base.points, mine.points, theirs.points, 999999), opened: sum3(base.opened, mine.opened, theirs.opened, 9999999) };
	const w = joinWonder(mine.wonder, theirs.wonder); if (w) out.wonder = w;
	if (theirs.escrow) out.escrow = theirs.escrow;   // (cards held for a trade are the account's to say: only the server moves them)
	if (theirs.st === START) out.st = START;         // (which start the collection began from is the account's to say too)
	{ const own = {}; for (const b of BOOSTERS) { const n = sum3(packsOf(base, b.id), packsOf(mine, b.id), packsOf(theirs, b.id), MAX_PACKS); if (n > 0) own[b.id] = n; } if (Object.keys(own).length) out.own = own; }
	return out;
}
/** A device meeting an account that already has a collection: what was pulled and earned on the device is added to the
 *  account's. The device's own new-player grant (the starter Trainers, the 10 packs) is not given twice, and packs it
 *  already opened are not taken back out of the account's. */
export function linkFirst(mine, theirs) {
	const fresh = mine.st === START ? newCollection() : firstCollection(), m = merge3(fresh, mine, theirs);
	// (the same for the packs of each booster: the device's own five of each are not given again, nor taken back out)
	const own = {}; for (const b of BOOSTERS) { const n = Math.min(MAX_PACKS, packsOf(theirs, b.id) + Math.max(0, packsOf(mine, b.id) - packsOf(fresh, b.id))); if (n > 0) own[b.id] = n; }
	const { own: _, ...rest } = m;
	return { ...rest, packs: Math.min(MAX_PACKS, theirs.packs + Math.max(0, mine.packs - fresh.packs)), ...(Object.keys(own).length ? { own } : {}) };
}
export function sameCollection(a, b) {
	if (a.packs !== b.packs || a.points !== b.points || a.opened !== b.opened) return false;
	if (BOOSTERS.some(x => packsOf(a, x.id) !== packsOf(b, x.id))) return false;
	if (JSON.stringify(cleanWonder(a.wonder)) !== JSON.stringify(cleanWonder(b.wonder))) return false;
	{ const ea = cleanEscrow(a.escrow) || {}, eb = cleanEscrow(b.escrow) || {}, ks = Object.keys(ea); if (ks.length !== Object.keys(eb).length || ks.some(k => !eb[k] || eb[k].packs !== ea[k].packs || JSON.stringify(Object.entries(eb[k].prints).sort()) !== JSON.stringify(Object.entries(ea[k].prints).sort()))) return false; }
	const ka = Object.keys(a.prints), kb = Object.keys(b.prints);
	return ka.length === kb.length && ka.every(k => a.prints[k] === b.prints[k]);
}

// ---- Wonder Pick: five cards from a pack someone else opened are shown, then turned over and shuffled; one pack buys
// one of them, chosen blind. The day's packs are the same for everyone (rolled from the date), so nothing is gained by
// reloading; which of the five a pick gets is the page's own randomness, decided when the pack is paid.
export const WONDER_PACKS = 4, WONDER_COST = 1;
export const wonderDay = now => new Date(now).toISOString().slice(0, 10);
/** The day's packs to pick from: [{ booster, ids: 5 printing ids }]. */
export function wonderBoard(day) {
	let a = 0x9e3779b9; for (const ch of 'wonder:' + day) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
	const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const pool = BOOSTERS.filter(b => !SPECIAL_PACKS[b.id]), out = [];
	for (let guard = 0; out.length < WONDER_PACKS && guard < 200; guard++) {
		const b = pool[Math.floor(rand() * pool.length)]; if (out.some(o => o.booster === b.id)) continue;
		const ids = rollPack(b.id, rand); if (ids.length === PACK_SIZE) out.push({ booster: b.id, ids });
	}
	return out;
}
/** Pay one pack for one of five cards -> { col, got: { id, card, rarity, isNew }, index }, or null (no pack, or not five cards). */
/** Which of `day`'s packs this collection has already picked from. */
export const wonderUsed = (col, day) => (col.wonder && col.wonder.day === day ? col.wonder.used.slice() : []);
export function wonderPick(col, ids, rand, day, which) {
	if (day != null && wonderUsed(col, day).includes(which)) return null;   // (each of the day's packs once)
	if (!(col.packs >= WONDER_COST) || !Array.isArray(ids) || ids.length !== PACK_SIZE || ids.some(id => !printInfo(id))) return null;
	const index = Math.min(PACK_SIZE - 1, Math.floor(rand() * PACK_SIZE)), info = printInfo(ids[index]), prints = { ...col.prints };
	const isNew = owned(col, info.card) === 0;
	prints[info.id] = Math.min(MAX_COPIES, (prints[info.id] || 0) + 1);
	return { col: { ...col, prints, packs: col.packs - WONDER_COST, ...(day != null ? { wonder: { day, used: [...wonderUsed(col, day), which].sort() } } : {}) }, got: { ...info, isNew }, index };
}
/** Take packs back out (a reward that turned out to have been paid on another device too): never below none. */
export function takePacks(col, n) { return { ...col, packs: Math.max(0, col.packs - Math.max(0, n | 0)) }; }

// ---- a card found on the journey: catching a Pokémon in the overworld can give that Pokémon's card (overworld/ow_pocketcard.js)
/** Every printing of every card of the Pokémon with this Pokédex number. */
export const printsOfDex = dex => CARDS.filter(c => c.kind === 'pokemon' && c.dex === dex).flatMap(c => c.printings).filter(id => PRINT_BY_ID.has(id));
/** One of them, at random, added to the collection -> { col, got: { id, card, rarity, isNew } }, or null if that Pokémon has no card. */
export function catchCard(col, dex, rand) {
	const all = printsOfDex(dex); if (!all.length) return null;
	const id = all[Math.min(all.length - 1, Math.floor(rand() * all.length))], info = printInfo(id), prints = { ...col.prints };
	const isNew = owned(col, info.card) === 0;
	prints[id] = Math.min(MAX_COPIES, (prints[id] || 0) + 1);
	return { col: { ...col, prints }, got: { ...info, isNew } };
}
