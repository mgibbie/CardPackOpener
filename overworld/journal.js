// journal.js — the adventure journal: a rolling log of the moments worth
// remembering (badges, catches, evolutions, hatches, championships), shown on
// the TRAINER CARD's second page. Newest first, capped so the save stays small.
import { safeLoad, safeSave } from './safestore.js';

const KEY = 'magepunk_journal_v1';
const CAP = 60;
let entries = null;
function load() { if (!entries) entries = safeLoad(KEY, []); return entries; }

export const Journal = {
	add(text) {
		const list = load();
		list.unshift({ t: Date.now(), text: String(text).slice(0, 90) });
		if (list.length > CAP) list.length = CAP;
		safeSave(KEY, list);
	},
	list() { return load(); },
	// "Sep 2" style stamp for the card
	when(e) { try { return new Date(e.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (err) { return ''; } },
};
