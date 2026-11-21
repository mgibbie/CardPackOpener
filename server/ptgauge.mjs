// ptgauge.mjs — Poketactica's Bonus Gauge paying Battlecards packs (poketactica/js/gauge.js). Battlecards packs live on
// the account, so the server pays them into the pack inbox (as a quest does), up to PACK_INBOX_CAP.
// The battle is played on the device, so the server cannot see it was won: what stops farming is that a battle's seed
// pays once (the last SEEDS_KEPT are kept) and the account gets at most PACKS_PER_DAY such packs a UTC day.
// The note lives on the account record: user.ptg = { day, n, seeds: [seed] }.
// Every final answer says `done` (paid, already paid, the day's limit), so the device crosses the claim off; anything
// else (not signed in, a bad seed) leaves it to ask again.

export const PACKS_PER_DAY = 3, PACKS_PER_BATTLE = 3, SEEDS_KEPT = 60;
const DAY_MS = 86_400_000;
const SEED = /^[a-z0-9:_-]{4,80}$/i;

/** -> the answer; `user` is changed in place and `save` called only when it was. */
export async function ptgaugeClaim({ user, body, now, inboxCap, accruePacks, save }) {
	const seed = String((body && body.seed) || '');
	if (!SEED.test(seed)) return { error: 'bad battle' };
	const want = Math.max(0, Math.min(PACKS_PER_BATTLE, Math.floor(+body.n) || 0));
	if (!want) return { error: 'bad battle' };
	const day = Math.floor(now / DAY_MS);
	const g = user.ptg && typeof user.ptg === 'object' ? user.ptg : {};
	const seeds = Array.isArray(g.seeds) ? g.seeds.filter((s) => typeof s === 'string') : [];
	const n = g.day === day ? Math.max(0, g.n | 0) : 0;
	if (seeds.includes(seed)) return { done: true, already: true, packs: 0, packInbox: user.packInbox || 0 };
	accruePacks(user, now);
	const left = Math.max(0, PACKS_PER_DAY - n), room = Math.max(0, inboxCap - (user.packInbox || 0));
	const add = Math.min(want, left, room);
	user.packInbox = (user.packInbox || 0) + add;
	user.ptg = { day, n: n + add, seeds: [...seeds, seed].slice(-SEEDS_KEPT) };
	await save(user);
	return { done: true, packs: add, ...(add < want ? { capped: left < want ? 'day' : 'inbox' } : {}), packInbox: user.packInbox, leftToday: left - add };
}
