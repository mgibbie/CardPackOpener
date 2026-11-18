// setrewards.js — set completion rewards (owner's second improvement list, 2026-11-18, "yes to all": "Finishing a pack's
// Pokédex pays stars once, with a reward for each step along the way"). Pure. A set's Pokédex is its regular cards: the
// printings of the ◆ rarities (secret ★/✦/crown printings are extras, not part of it; the promo sets, P-A and on, come
// from rewards, not packs, and have no set reward). Owning a printing of each counts. Milestones pay packs (each worth a pack's stars), once per account: the paid
// ones are noted in the solo progress as 's:<set>:<percent>' (solo.js SET_MILESTONES), which syncs and merges like a
// deck mission, and solo.js paidTwice counts a milestone paid on two devices at once.
import { PRINTS } from './data/packs.js';
import { SET_MILESTONES, cleanProgress } from './solo.js';

const REGULAR = new Set(['1D', '2D', '3D', '4D']);
const setOf = printId => printId.slice(0, printId.lastIndexOf('-'));
/** set -> the print ids of its Pokédex, in the order the data lists them (the set's own order). */
export const SET_DEX = (() => {
	const m = new Map();
	for (const [p, , r] of PRINTS) if (REGULAR.has(r)) { const s = setOf(p); if (s.startsWith('P-')) continue; if (!m.has(s)) m.set(s, []); m.get(s).push(p); }
	return m;
})();

/** Where each set stands: [{ set, have, total, pct, reached: [percents], due: [percents reached and not yet paid] }]. */
export function setState(col, progress) {
	const paid = cleanProgress(progress).paid, out = [];
	for (const [set, dex] of SET_DEX) {
		const have = dex.filter(p => (col.prints[p] || 0) > 0).length, total = dex.length, pct = total ? have / total * 100 : 0;
		const reached = SET_MILESTONES.filter(([at]) => pct >= at).map(([at]) => at);
		out.push({ set, have, total, pct, reached, due: reached.filter(at => !paid[`s:${set}:${at}`]) });
	}
	return out;
}
/** How many packs a milestone pays. */
export const packsFor = at => (SET_MILESTONES.find(([a]) => a === at) || [0, 0])[1];
/** Claim every milestone reached and not yet paid -> { progress, packs, claimed: ['A1:25', …] }. */
export function claimSets(progress, states) {
	const p = cleanProgress(progress); let packs = 0; const claimed = [];
	for (const s of states) for (const at of s.due) { const k = `s:${s.set}:${at}`; if (p.paid[k]) continue; p.paid[k] = 1; packs += packsFor(at); claimed.push(`${s.set}:${at}`); }
	return { progress: p, packs, claimed };
}
/** Packs waiting to be claimed. */
export const setsDue = states => states.reduce((n, s) => n + s.due.reduce((m, at) => m + packsFor(at), 0), 0);
