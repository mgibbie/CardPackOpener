// trade.js — trading one card for one card of the same rarity, as rules. Pure: the server (server/pocket_trade.mjs)
// applies them to the two players' collections; the page uses them to say what can be offered.
//
// A card on offer is HELD: taken out of its owner's `prints` and kept in their collection's `escrow` under the trade's
// id, in one write. From there it goes exactly one way, again in one write: to the other player (received) or back
// (released). So at every moment each card is in exactly one place, whatever fails in between.
import { printInfo, MAX_COPIES } from './collection.js';
import { card } from './data/cards.js';

/** The rarities that can be traded (Pocket's: one to four diamonds and one star; not promos, not the rarest). */
export const TRADE_RARITIES = Object.freeze(['1D', '2D', '3D', '4D', '1S']);
export const MAX_TRADES = 3;                 // trades one player may have going at once
export const TRADE_ID = /^[a-z0-9]{10,24}$/;
/** A printing's rarity if it can be traded, or null. */
export function tradeRarity(printId) { const p = printInfo(printId); return p && TRADE_RARITIES.includes(p.rarity) ? p.rarity : null; }
/** Why this player cannot offer this printing, or null. */
export function whyNotGive(col, printId) {
	const p = printInfo(printId); if (!p) return 'there is no such card';
	if (!tradeRarity(printId)) return 'a card of that rarity cannot be traded';
	if (!((col.prints || {})[printId] > 0)) return 'you do not have that card';
	if (Object.keys(col.escrow || {}).length >= MAX_TRADES) return `you can have ${MAX_TRADES} trades going at once`;
	return null;
}
/** Take a card out of the collection and hold it for a trade -> the collection, or null. */
export function hold(col, tid, printId, now) {
	if (!TRADE_ID.test(tid) || whyNotGive(col, printId) || (col.escrow || {})[tid]) return null;
	const prints = { ...col.prints }; if (prints[printId] > 1) prints[printId]--; else delete prints[printId];
	return { ...col, prints, escrow: { ...(col.escrow || {}), [tid]: { p: printId, at: now } } };
}
const out = (col, tid, add) => {
	const held = (col.escrow || {})[tid]; if (!held) return null;
	const escrow = { ...col.escrow }; delete escrow[tid];
	const prints = { ...col.prints }; prints[add || held.p] = Math.min(MAX_COPIES, (prints[add || held.p] || 0) + 1);
	const next = { ...col, prints }; if (Object.keys(escrow).length) next.escrow = escrow; else delete next.escrow;
	return next;
};
/** The held card comes back (the trade did not happen) -> the collection, or null if nothing is held for it. */
export const release = (col, tid) => out(col, tid, null);
/** The trade happened: the held card is gone and the other player's card arrives -> the collection, or null. */
export const receive = (col, tid, printId) => (printInfo(printId) ? out(col, tid, printId) : null);
/** A card's name and rarity for a message. */
export const printName = printId => { const p = printInfo(printId); return p ? card(p.card).name : 'a card'; };
