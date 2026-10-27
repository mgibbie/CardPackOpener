// engine/effects/followups.js — "act on the card the previous effect produced".
//
// A spell like "Discover a card. Spend 5 Corpses to copy it." or "Draw 2 cards.
// Creatures drawn cost (2) less." needs a LATER effect in the same list to see
// what an EARLIER one made. The producing handlers (discover, draw,
// summon-from-hand) note their results on the resolving source card here; the
// acting handlers (handlers-followup.js) read them back.
//
// A WeakMap keyed by the source card instance: nothing is written onto the card
// or the state, so snapshots/replays never carry it, and it dies with the card.
// It only has to live for one synchronous execEffects pass — anything that
// outlives that (an unresolved Discover pick) is stored on the pick itself.
const LAST = new WeakMap();

export function noteResult(source, kind, value) {
	if (!source || typeof source !== 'object') return;
	let m = LAST.get(source);
	if (!m) { m = {}; LAST.set(source, m); }
	m[kind] = value;
}

export function lastResult(source, kind) {
	if (!source || typeof source !== 'object') return null;
	const m = LAST.get(source);
	return m && m[kind] != null ? m[kind] : null;
}
