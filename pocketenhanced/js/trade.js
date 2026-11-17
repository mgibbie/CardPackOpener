// trade.js — the Pocket Enhanced side of the site's one trading system (server/trade.mjs): how cards and packs leave
// a collection for a trade and come back or are swapped. Pure.
//
// What a player offers is HELD: taken out of `prints` / `packs` and kept in the same collection's `escrow` under the
// trade's id, in one write. From there it goes exactly one way, again in one write: swapped for what the other player
// gave (received), or back (released). So at every moment each card is in exactly one place, whatever fails between.
import { printInfo, MAX_COPIES, MAX_PACKS } from './collection.js';
import { card } from './data/cards.js';

export const TRADE_ID = /^[A-Za-z0-9:]{6,40}$/;
const clean = b => {
	const prints = {}; for (const [id, n] of Object.entries((b && b.prints) || {})) if (printInfo(id) && Number.isInteger(n) && n > 0) prints[id] = Math.min(n, MAX_COPIES);
	return { prints, packs: Number.isInteger(b && b.packs) && b.packs > 0 ? Math.min(b.packs, MAX_PACKS) : 0 };
};
/** Why this collection cannot give this bundle ({ prints: { id: n }, packs }), or null. */
export function whyNotGive(col, bundle) {
	const b = clean(bundle);
	for (const id of Object.keys((bundle && bundle.prints) || {})) if (!printInfo(id)) return 'there is no such card';
	for (const [id, n] of Object.entries(b.prints)) if (!((col.prints || {})[id] >= n)) return `you do not have ${n > 1 ? n + ' of ' : ''}${printName(id)}`;
	if ((col.packs || 0) < b.packs) return 'you do not have that many packs';
	return null;
}
/** Take a bundle out of the collection and hold it for a trade -> the collection, or null. (An empty bundle is held
 *  too: a player who gives nothing of this kind still receives through their hold.) */
export function holdBundle(col, tid, bundle, now) {
	if (!TRADE_ID.test(String(tid)) || (col.escrow || {})[tid] || whyNotGive(col, bundle)) return null;
	const b = clean(bundle), prints = { ...col.prints };
	for (const [id, n] of Object.entries(b.prints)) { prints[id] -= n; if (!(prints[id] > 0)) delete prints[id]; }
	return { ...col, prints, packs: (col.packs || 0) - b.packs, escrow: { ...(col.escrow || {}), [tid]: { prints: b.prints, packs: b.packs, at: now } } };
}
const out = (col, tid, add) => {
	const held = (col.escrow || {})[tid]; if (!held) return null;
	const escrow = { ...col.escrow }; delete escrow[tid];
	const b = clean(add || held), prints = { ...col.prints };
	for (const [id, n] of Object.entries(b.prints)) prints[id] = Math.min(MAX_COPIES, (prints[id] || 0) + n);
	const next = { ...col, prints, packs: Math.min(MAX_PACKS, (col.packs || 0) + b.packs) };
	if (Object.keys(escrow).length) next.escrow = escrow; else delete next.escrow;
	return next;
};
/** What was held comes back (the trade did not happen) -> the collection, or null if nothing is held for it. */
export const releaseBundle = (col, tid) => out(col, tid, null);
/** The trade happened: what was held is gone and the other player's bundle arrives -> the collection, or null. */
export const receiveBundle = (col, tid, bundle) => out(col, tid, bundle || { prints: {}, packs: 0 });
/** A card's name for a message. */
export const printName = printId => { const p = printInfo(printId); return p ? card(p.card).name : 'a card'; };
/** Everything a collection holds, held cards included: { id: n } (for checking that nothing was made or lost). */
export function everything(col) {
	const m = { ...col.prints, '(packs)': col.packs || 0 };
	for (const h of Object.values(col.escrow || {})) { for (const [id, n] of Object.entries(h.prints || {})) m[id] = (m[id] || 0) + n; m['(packs)'] += h.packs || 0; }
	return m;
}
