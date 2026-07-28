// engine/rng.js — randomness helpers over the injected `state.rng`.
//
// Two things live here (see docs/engine-hardening/05-target-architecture.md §3
// and 07-state-and-persistence.md "RNG state"):
//
// 1. makeRand(rng) — named helpers replacing the raw idioms scattered through
//    engine.js (`pool[Math.floor(state.rng() * pool.length)]` etc.). Call sites
//    migrate LAZILY, so every helper is guaranteed to consume EXACTLY the same
//    number of rng() calls as the idiom it replaces — a migrated call site must
//    never shift the random stream of a seeded game (risk register row
//    "Randomness change breaking seeded tests"). In particular pick() on an
//    empty array still consumes one rng() call, exactly like the idiom does.
//
// 2. seededRng(seed) / restoreRng(snap) — a serializable counter-based PRNG
//    (mulberry32) for tests and replays. `rng.snapshot()` captures {seed,
//    calls}; restoreRng fast-forwards a fresh stream to that point, so a
//    replay can resume mid-stream. The mulberry32 core is byte-identical to
//    the one the fuzz driver has used since PR 3 — recorded fuzz seeds
//    (420484, 9419695, …) reproduce the same games through this module.
//
// Pure module: no engine imports, no state mutation beyond the array passed
// to shuffle/take (in-place by design, matching the engine's deck shuffle).

export function makeRand(rng) {
	return {
		rng, // the raw source, for the rare site that needs it directly
		// `Math.floor(rng() * n)` — uniform integer in [0, n)
		int: n => Math.floor(rng() * n),
		// `arr[Math.floor(rng() * arr.length)]` — undefined on empty, but the
		// rng() call is ALWAYS consumed (idiom parity; see header)
		pick: arr => arr[Math.floor(rng() * arr.length)],
		// `arr.splice(Math.floor(rng() * arr.length), 1)[0]` — remove and
		// return a random element (undefined on empty, call still consumed)
		take: arr => arr.splice(Math.floor(rng() * arr.length), 1)[0],
		// `rng() < p` — biased coin
		chance: p => rng() < p,
		// in-place Fisher-Yates, identical to createGame's deck shuffle:
		// exactly arr.length - 1 calls (zero for empty/singleton arrays)
		shuffle: arr => {
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(rng() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			return arr;
		},
	};
}

// mulberry32 — tiny, fast, 32-bit state. Not cryptographic; plenty for games.
function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// A drop-in `rng` (call it like Math.random) that knows where it is in its
// stream. Pass to createGame for deterministic games; snapshot()/restoreRng
// give replay-resume. `calls` fast-forwards on creation (O(n), ~10M calls/sec
// — trivial at game scale: a full fuzz game consumes a few thousand calls).
export function seededRng(seed, calls = 0) {
	const core = mulberry32(seed);
	const fn = () => { fn.calls++; return core(); };
	fn.seed = seed >>> 0;
	fn.calls = 0;
	fn.snapshot = () => ({ seed: fn.seed, calls: fn.calls });
	while (fn.calls < calls) fn();
	return fn;
}

export function restoreRng(snap) {
	return seededRng(snap.seed, snap.calls);
}
