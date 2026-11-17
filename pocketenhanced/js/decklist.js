// decklist.js — a player's saved decks as a list, and how two copies of that list combine (colsync.js keeps it on
// the account, as it does the collection). Pure rules: no storage, no page.
//
// A list is [{ name, deck: [20 card ids], energy: [types] }], newest first, names unique, only legal decks, 20 at most.
import { deckError, cleanPrints } from './engine/engine.js';

export const MAX_DECKS = 20, MAX_NAME = 24;
const legal = d => { try { return !deckError(d.deck, d.energy); } catch (e) { return false; } };
const samePrints = (a, b) => { const x = Object.entries(a || {}).sort(), y = Object.entries(b || {}).sort(); return x.length === y.length && x.every((e, i) => e[0] === y[i][0] && e[1] === y[i][1]); };
const sameDeck = (a, b) => a.name === b.name && a.deck.length === b.deck.length && a.deck.every((x, i) => x === b.deck[i]) && a.energy.length === b.energy.length && a.energy.every((x, i) => x === b.energy[i]) && samePrints(a.prints, b.prints);

/** Read whatever was stored or sent: a usable list (illegal, unnamed and repeated decks dropped), or null if it is not a list at all. */
export function cleanDecks(x) {
	if (!Array.isArray(x)) return null;
	const out = [], seen = new Set();
	for (const d of x) {
		if (!d || typeof d.name !== 'string' || !d.name || d.name.length > MAX_NAME || seen.has(d.name) || !Array.isArray(d.deck) || !Array.isArray(d.energy)) continue;
		const deck = d.deck.map(String), energy = d.energy.map(String);
		if (!legal({ deck, energy })) continue;
		const prints = cleanPrints(d.prints, deck);   // (the printing chosen for a card: how it is drawn in a match)
		seen.add(d.name); out.push({ name: d.name, deck, energy, ...(Object.keys(prints).length ? { prints } : {}) });
		if (out.length >= MAX_DECKS) break;
	}
	return out;
}
/** The same decks (the order they are listed in does not matter). */
export function sameDecks(a, b) { return a.length === b.length && a.every(d => { const o = b.find(x => x.name === d.name); return !!o && sameDeck(d, o); }); }

/** `theirs` with what this device did since `base` applied on top: decks it saved or changed are kept as it has them,
 *  decks it deleted are deleted, everything else is as the other copy has it. This device's decks are listed first. */
export function mergeDecks3(base, mine, theirs) {
	const B = new Map(base.map(d => [d.name, d])), M = new Map(mine.map(d => [d.name, d])), out = [];
	for (const d of mine) { const b = B.get(d.name), t = theirs.find(x => x.name === d.name); if (!b || !sameDeck(b, d)) out.push(d); else if (t) out.push(t); }   // (unchanged here and gone there: deleted there)
	for (const t of theirs) { if (M.has(t.name)) continue; if (B.has(t.name)) continue; out.push(t); }   // (in base, not here: deleted here)
	return out.slice(0, MAX_DECKS);
}
/** A device meeting an account that already has decks: the account's, plus the device's own. A device deck whose name is
 *  taken by a different deck is kept under a new name, never dropped. */
export function linkDecks(mine, theirs) {
	const out = theirs.slice(), names = new Set(theirs.map(d => d.name));
	for (const d of mine) {
		const t = theirs.find(x => x.name === d.name);
		if (t && sameDeck(t, d)) continue;
		let name = d.name;
		for (let n = 2; names.has(name) && n < 99; n++) name = `${d.name.slice(0, MAX_NAME - 3)} ${n}`;
		if (names.has(name)) continue;
		names.add(name); out.push({ ...d, name });
	}
	return out.slice(0, MAX_DECKS);
}

/** A deck as one short line a player can pass on: "PE1:Fire,Water:A1-036x2,A1-033,..." (its Energy types, then its
 *  cards by id, a count after an x). */
export function deckCode(d) {
	const n = new Map(); for (const id of d.deck) n.set(id, (n.get(id) || 0) + 1);
	return `PE1:${d.energy.join(',')}:${[...n].map(([id, k]) => (k > 1 ? `${id}x${k}` : id)).join(',')}`;
}
/** Read such a line (found anywhere in the text given) -> { deck, energy }, or { error } saying why it is not a deck. */
export function readDeckCode(text) {
	const m = /PE1:([A-Za-z,]*):([A-Za-z0-9,\-]+)/.exec(String(text || '').replace(/\s+/g, ''));
	if (!m) return { error: 'that is not a deck code' };
	const energy = m[1] ? m[1].split(',').filter(Boolean) : [], deck = [];
	for (const part of m[2].split(',')) { const q = /^([A-Za-z0-9\-]+?)(?:x(\d{1,2}))?$/.exec(part); if (!q) return { error: 'that is not a deck code' }; for (let k = 0; k < +(q[2] || 1) && deck.length <= 60; k++) deck.push(q[1]); }
	let err; try { err = deckError(deck, energy); } catch (e) { err = 'it names a card this game does not have'; }
	return err ? { error: err } : { deck, energy };
}
