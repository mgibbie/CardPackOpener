// rules/rng.js — a small seeded random generator (mulberry32) for the games that must replay exactly from a seed
// (Poketactica: resume, replays, spectating and bets are all `seed + actions`). Same seed, same numbers, everywhere.
// Poketactica stage 1 (owner, 2026-11-20). The overworld's battles still use Math.random.

/** A seed string or number -> a 32-bit integer (FNV-1a over the string). */
export function seedOf(seed) {
	if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
	let h = 0x811c9dc5;
	for (const c of String(seed)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
	return h >>> 0;
}

/** -> a function returning floats in [0, 1), deterministic for the seed. `.state()` / `.at(n)` let a game save and resume it. */
export function makeRng(seed) {
	let a = seedOf(seed);
	const next = () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	next.state = () => a;
	next.at = (s) => { a = s >>> 0; return next; };
	next.int = (n) => Math.floor(next() * n);            // 0 .. n-1
	next.chance = (p) => next() < p;                     // true with probability p
	return next;
}
