// rng_test.mjs — engine/rng.js contract tests.
//
// The load-bearing guarantee (risk register: "Randomness change breaking
// seeded tests"): every makeRand helper consumes EXACTLY the same number of
// rng() calls, and produces EXACTLY the same result, as the raw idiom it
// replaces — so migrating a call site can never shift a seeded game's stream.
import fs from 'fs';
import * as E from '../../engine.js';
import { makeRand, seededRng, restoreRng } from '../../engine/rng.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// instrumented source: counts calls, delegates to a seeded stream
const counted = seed => {
	const core = seededRng(seed);
	const fn = () => { fn.n++; return core(); };
	fn.n = 0;
	return fn;
};

// --- call-count parity: helper vs idiom, same seed, same stream position ---
{
	const a = counted(7), b = counted(7);
	const r = makeRand(a);
	const pool = ['x', 'y', 'z', 'w'];

	ok('pick: same result as idiom', r.pick(pool) === pool[Math.floor(b() * pool.length)]);
	ok('pick: 1 call', a.n === 1 && b.n === 1, `${a.n}/${b.n}`);

	ok('int: same result as idiom', r.int(10) === Math.floor(b() * 10));
	ok('chance: same result as idiom', r.chance(0.5) === (b() < 0.5));

	// empty pick still consumes a call — exactly like the idiom
	const empty = [];
	const hr = r.pick(empty), hi = empty[Math.floor(b() * empty.length)];
	ok('pick on empty: undefined, call still consumed', hr === undefined && hi === undefined && a.n === b.n, `${a.n}/${b.n}`);

	// shuffle: identical permutation, exactly len-1 calls
	const s1 = [1, 2, 3, 4, 5, 6, 7, 8], s2 = [...s1];
	const before = a.n;
	r.shuffle(s1);
	for (let i = s2.length - 1; i > 0; i--) { const j = Math.floor(b() * (i + 1)); [s2[i], s2[j]] = [s2[j], s2[i]]; }
	ok('shuffle: identical permutation to createGame idiom', JSON.stringify(s1) === JSON.stringify(s2), `${s1} vs ${s2}`);
	ok('shuffle: len-1 calls', a.n - before === s1.length - 1, a.n - before);

	// take: same element removed as the splice idiom
	const t1 = ['a', 'b', 'c', 'd'], t2 = [...t1];
	const got = r.take(t1);
	const want = t2.splice(Math.floor(b() * t2.length), 1)[0];
	ok('take: same element as splice idiom, array matches', got === want && JSON.stringify(t1) === JSON.stringify(t2));
	ok('streams still in lockstep at the end', a.n === b.n, `${a.n}/${b.n}`);
}
// --- seededRng: determinism + snapshot/restore mid-stream ---
{
	const a = seededRng(123), b = seededRng(123);
	const s1 = Array.from({ length: 50 }, () => a());
	const s2 = Array.from({ length: 50 }, () => b());
	ok('same seed, same stream', JSON.stringify(s1) === JSON.stringify(s2));

	const c = seededRng(999);
	for (let i = 0; i < 37; i++) c();
	const snap = c.snapshot();
	ok('snapshot records position', snap.seed === 999 && snap.calls === 37, JSON.stringify(snap));
	const tail1 = Array.from({ length: 20 }, () => c());
	const d = restoreRng(snap);
	const tail2 = Array.from({ length: 20 }, () => d());
	ok('restore resumes mid-stream identically', JSON.stringify(tail1) === JSON.stringify(tail2));
	ok('restored rng keeps counting from the restore point', d.calls === 57, d.calls);
}
// --- replay-a-seed: two whole games from one seed are identical ---
{
	const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
	const byId = {}; for (const c of raw.cards) byId[c.id] = c;
	const playGame = seed => {
		const rng = seededRng(seed);
		const state = E.createGame(byId, rng, null, 2);
		// ten turn cycles: shuffled decks, draws, turn riders — all rng-driven
		for (let i = 0; i < 20 && !state.over; i++) E.endTurn(state);
		return {
			calls: rng.calls,
			digest: JSON.stringify(state.players.map(p => ({
				life: p.life, hand: p.hand.map(c => c.id), deck: p.deck.length,
			}))),
		};
	};
	const g1 = playGame(20260728), g2 = playGame(20260728), g3 = playGame(31337);
	ok('replay-a-seed: identical game digest', g1.digest === g2.digest);
	ok('replay-a-seed: identical rng call count', g1.calls === g2.calls, `${g1.calls}/${g2.calls}`);
	ok('different seed actually differs', g3.digest !== g1.digest);
	ok('a real game consumes rng (sanity)', g1.calls > 100, g1.calls);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
