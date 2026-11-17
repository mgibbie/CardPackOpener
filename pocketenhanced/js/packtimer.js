// packtimer.js — free packs that arrive with time, as Battlecards' pack inbox does (server/mp.mjs accruePacks): one
// every 12 hours into an inbox that holds up to 120. While the inbox is full the timer is paused; collecting it starts
// the timer again from then. Pure: the server keeps a signed-in player's inbox (server/pocket_collection.mjs), and a
// guest's is kept on the device with the same rules.
export const PACK_TIMER_MS = 12 * 60 * 60 * 1000, PACK_INBOX_CAP = 120;

/** Read whatever was stored: { base, inbox } (base: when the running 12 hours began), or null. */
export function cleanInbox(x) {
	if (!x || typeof x !== 'object' || !Number.isFinite(x.base) || x.base <= 0) return null;
	return { base: Math.floor(x.base), inbox: Number.isInteger(x.inbox) && x.inbox > 0 ? Math.min(x.inbox, PACK_INBOX_CAP) : 0 };
}
/** The inbox as it stands at `now`: packs that have arrived are in it. A player seen for the first time starts their timer. */
export function accrue(st, now) {
	const s = cleanInbox(st); if (!s) return { base: now, inbox: 0 };
	if (s.inbox >= PACK_INBOX_CAP || now - s.base < PACK_TIMER_MS) return s;
	const add = Math.min(Math.floor((now - s.base) / PACK_TIMER_MS), PACK_INBOX_CAP - s.inbox);
	return { base: s.base + add * PACK_TIMER_MS, inbox: s.inbox + add };   // (the part of 12 hours already waited counts toward the next)
}
/** Milliseconds until the next pack arrives, or null while the inbox is full (the timer is paused). */
export function etaMs(st, now) {
	const s = accrue(st, now); if (s.inbox >= PACK_INBOX_CAP) return null;
	return Math.max(0, PACK_TIMER_MS - (now - s.base));
}
/** Collect what has arrived -> { st, claimed }. */
export function claim(st, now) {
	const s = accrue(st, now), n = s.inbox;
	return { st: { base: n >= PACK_INBOX_CAP ? now : s.base, inbox: 0 }, claimed: n };
}
/** "5 h 12 min" for a wait. */
export function etaText(ms) {
	if (ms == null) return 'paused: the inbox is full';
	const m = Math.ceil(ms / 60000), h = Math.floor(m / 60);
	return h ? `${h} h ${m % 60} min` : `${Math.max(1, m)} min`;
}
