// mm/rng.js — Mystery Maze's random numbers: the original Mystery Dungeon generator's own (Plans/PMD_FLOOR_GENERATION_SPEC.md
// section 7), so a floor is the floor the original would make from the same state. A 32-bit LCG (x1566083941 +1), the top
// 16 bits out.
//   int(n)       0 .. n-1. ALWAYS one step, even for n = 0 or 1 (the generator's draws must stay in step).
//   range(a, b)  a .. b-1 (the upper bound is NOT included); the bounds may come in either order; equal bounds draw nothing.
// Pure: node-tested (overworld/tests/poketactica_mm_gen_test.mjs).
const MUL = 0x5D588B65;

export function makeRng(seed) {
	let s = ((seed >>> 0) | 1) >>> 0;
	const rng = {
		get state() { return s; },
		set state(v) { s = v >>> 0; },
		draws: 0,
		int(n) {
			s = (Math.imul(s, MUL) + 1) >>> 0;
			rng.draws++;
			return (((s >>> 16) * n) >> 16) & 0xFFFF;   // (a negative n: the original's signed product and shift, as written)
		},
		range(a, b) {
			if (a === b) return a;
			return a < b ? rng.int(b - a) + a : rng.int(a - b) + b;
		},
	};
	return rng;
}
/** The original's per-floor seed chain: each floor's start state comes from a 24-bit pre-seed that steps twice a floor. */
export function makeFloorSeeds(preseed) {
	let p = ((preseed | 1) & 0xFFFFFF) >>> 0;
	return () => {
		let r1 = (Math.imul(p, MUL) + 1) >>> 0;
		const r0 = r1 >>> 16;
		r1 = (Math.imul(r1, MUL) + 1) >>> 0;
		p = r1;
		return (((r0 | (r1 & 0xFFFF0000)) & 0x00FFFFFF) | 1) >>> 0;
	};
}
