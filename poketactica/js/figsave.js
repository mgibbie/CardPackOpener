// figsave.js — the figurine collection on this device (localStorage), and a short note of figurines found elsewhere (the
// overworld) that Poketactica has not shown yet. Signed in, the page also keeps it on the account (figcol.js FIGS, the
// same sync as Pocket Enhanced's collection). A copy that can't be read is set aside once (`<key>_bak`), never overwritten
// in place.
import { cleanFigs, newFigs, addFig } from './figcol.js';

export const FIGS_KEY = 'magepunk_poketactica_figs_v1';
export const FOUND_KEY = 'magepunk_poketactica_found_v1';   // ids found outside Poketactica, not shown yet (the overworld)

export function figs(LS = globalThis.localStorage) {
	let raw = null;
	try { raw = LS.getItem(FIGS_KEY); } catch (e) { return newFigs(); }
	if (!raw) return newFigs();
	try { const c = cleanFigs(JSON.parse(raw)); if (c) return c; } catch (e) { /* below */ }
	try { if (!LS.getItem(FIGS_KEY + '_bak')) LS.setItem(FIGS_KEY + '_bak', raw); } catch (e) { /* no room */ }
	return newFigs();
}
export function setFigs(col, LS = globalThis.localStorage) { try { LS.setItem(FIGS_KEY, JSON.stringify(col)); return true; } catch (e) { return false; } }

/** Add a figurine found outside Poketactica (the overworld): into the collection, and onto the "found" note. */
export function addFound(fig, LS = globalThis.localStorage) {
	setFigs(addFig(figs(LS), fig), LS);
	try { const l = JSON.parse(LS.getItem(FOUND_KEY) || '[]'); LS.setItem(FOUND_KEY, JSON.stringify([...(Array.isArray(l) ? l : []), fig.id].slice(-30))); } catch (e) { /* the figurine is in either way */ }
}
/** The found note, emptied (Poketactica shows them once). */
export function takeFound(LS = globalThis.localStorage) {
	try { const l = JSON.parse(LS.getItem(FOUND_KEY) || '[]'); LS.removeItem(FOUND_KEY); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
