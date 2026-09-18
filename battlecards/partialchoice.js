// partialchoice.js — persist the HALF-MADE part of a pending choice.
//
// The engine snapshot restores *that a choice is pending* (discardQueue et al are
// serialized), and resumePendingChoices reopens its modal. But the cards you had
// already ticked inside that modal lived only in a DOM-local Set, so a reopen put
// you back at zero ticks. Resume is supposed to be frame-exact, so the ticks are
// persisted too.
//
// Scoping is deliberately strict: a saved selection is only reused when it is the
// SAME pending decision over the SAME hand. The hand signature (ordered uids) is
// the fingerprint — draw, discard, or a new fight all change it, so a stale
// selection can never leak into a different choice. Pure functions; the storage
// read/write stays in the caller.

export const PARTIAL_DISCARD_KEY = 'magepunk_partial_discard_v1';

// fingerprint of the hand the selection was made against
export const handSig = handUids => (handUids || []).join(',');

// what to persist as the player ticks
export function makePartial(pend, handUids, chosenUids) {
	return {
		player: pend.player,
		count: pend.count,
		cleanup: !!pend.cleanup,
		sig: handSig(handUids),
		uids: [...chosenUids],
	};
}

// the ticks to restore for `pend`, or [] when the saved blob doesn't belong to it.
// Also drops any uid no longer in hand and never returns more than `count` picks.
export function matchPartial(saved, pend, handUids) {
	if (!saved || !pend) return [];
	if (saved.player !== pend.player) return [];
	if (saved.count !== pend.count) return [];
	if (!!saved.cleanup !== !!pend.cleanup) return [];
	if (saved.sig !== handSig(handUids)) return [];
	const inHand = new Set(handUids || []);
	const out = [];
	for (const u of saved.uids || []) if (inHand.has(u) && !out.includes(u)) out.push(u);
	return out.slice(0, pend.count);
}
