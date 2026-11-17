// ow_pocketcard.js — a Pokémon caught in the overworld has a 1 in 10 chance of also giving that Pokémon's card for
// Pocket Enhanced (owner, 2026-11-17): a random printing, if there are several. A Pokémon with no card gives nothing.
//
// It touches nothing of the overworld's own: the card goes into Pocket Enhanced's collection on this device (the same
// one that game reads and keeps on the account), a line goes in the Journal, and a note is left for Pocket Enhanced to
// show the next time it is opened. Pocket's card list is only loaded when the 1 in 10 comes up. Never throws.
import { Journal } from './journal.js';

export const CATCH_CARD_CHANCE = 0.1;
export const FOUND_KEY = 'magepunk_pocket_found_v1';   // card ids found on the journey that Pocket Enhanced has not yet shown

/** -> the card found ({ id, card, rarity, isNew, name }), or null. `rand` is for tests. */
export async function pocketCatch(mon, rand = Math.random) {
	try {
		if (!mon || !(mon.num > 0) || rand() >= CATCH_CARD_CHANCE) return null;
		const [C, SV, D] = await Promise.all([import('../pocketenhanced/js/collection.js'), import('../pocketenhanced/js/save.js'), import('../pocketenhanced/js/data/cards.js')]);
		const r = C.catchCard(SV.collection(), mon.num, rand);
		if (!r) return null;
		SV.setCollection(r.col);
		const name = D.card(r.got.card).name;
		try { const l = JSON.parse(localStorage.getItem(FOUND_KEY) || '[]'); localStorage.setItem(FOUND_KEY, JSON.stringify([...(Array.isArray(l) ? l : []), r.got.id].slice(-30))); } catch (e) { /* the card is in the collection either way */ }
		try { Journal.add(`Found a Pocket Enhanced card with ${mon.name}: ${name}${r.got.isNew ? ' (new)' : ''}`); } catch (e) { /* the journal is optional */ }
		return { ...r.got, name };
	} catch (e) { return null; }
}
