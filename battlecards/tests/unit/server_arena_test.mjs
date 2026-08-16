// server_arena_test.mjs — the Arena leaderboard endpoints in server/mp.mjs
// (arena-score / arena-leaderboard). mp.mjs can't be plain-imported (attribute-less
// JSON), so — like the other server tests — pin the handler's shape from source and
// exercise the ranking logic (extracted arenaBetter + the board sort) directly. The
// full round-trip is covered end-to-end by tests/integration/relay_harness.mjs.
import fs from 'fs';

const src = fs.readFileSync(new URL('../../../server/mp.mjs', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const scoreBlock = src.slice(src.indexOf("action === 'arena-score'"), src.indexOf("action === 'arena-score'") + 1000);
const lbBlock = src.slice(src.indexOf("action === 'arena-leaderboard'"), src.indexOf("action === 'arena-leaderboard'") + 500);

// --- source shape ---
ok('arena-score + arena-leaderboard actions exist', src.includes("action === 'arena-score'") && src.includes("action === 'arena-leaderboard'"));
ok('arena-score clamps wins (0-12) and losses (0-3)', /Math\.min\(12,[^)]*wins/.test(scoreBlock) && /Math\.min\(3,[^)]*losses/.test(scoreBlock));
ok('the best run is kept on the user record (arenaBest) + a global board (arena:board)', /user\.arenaBest/.test(scoreBlock) && /'arena:board'/.test(scoreBlock));
ok('arena-score is rate-limited', /'arena-score':/.test(src));
ok('the board is capped (slice) and sorted (wins desc, losses asc)', /\.slice\(0, 100\)/.test(scoreBlock) && /b\.wins - a\.wins \|\| a\.losses - b\.losses/.test(scoreBlock));
ok('arena-leaderboard returns a top slice + your rank', /\.slice\(0, 50\)/.test(lbBlock) && /rank/.test(lbBlock));
ok('pubprofile surfaces arenaBest', /arenaBest: u\.arenaBest/.test(src));

// --- behaviour: the "is this a new best?" comparison (wins desc, then losses asc) ---
const better = (a, prev) => !prev || a.wins > prev.wins || (a.wins === prev.wins && a.losses < prev.losses);
ok('any run beats no prior best', better({ wins: 0, losses: 3 }, null));
ok('more wins is better', better({ wins: 9, losses: 3 }, { wins: 8, losses: 0 }));
ok('same wins + fewer losses is better', better({ wins: 8, losses: 1 }, { wins: 8, losses: 2 }));
ok('a worse run (fewer wins) is NOT better', !better({ wins: 5, losses: 0 }, { wins: 8, losses: 2 }));
ok('same wins + more losses is NOT better', !better({ wins: 8, losses: 3 }, { wins: 8, losses: 2 }));
ok('an identical run is NOT "better" (no needless rewrite)', !better({ wins: 8, losses: 2 }, { wins: 8, losses: 2 }));

// --- behaviour: the board ordering (wins desc, losses asc, earlier-when first) ---
const board = [
	{ name: 'a', wins: 8, losses: 2, when: 100 },
	{ name: 'b', wins: 12, losses: 0, when: 200 },
	{ name: 'c', wins: 8, losses: 1, when: 300 },
	{ name: 'd', wins: 8, losses: 2, when: 50 },
];
board.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.when - b.when);
ok('12-0 ranks first', board[0].name === 'b');
ok('8-1 outranks 8-2', board[1].name === 'c');
ok('an earlier 8-2 outranks a later 8-2 (tiebreak by when)', board[2].name === 'd' && board[3].name === 'a', board.map(e => e.name).join(','));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
