// micasurvivor_dive_server_test.mjs — MicaSurvivor Dive V8: Expedition · Dive's boards on the site's backend (server/mp.mjs),
// against the REAL handler (bundled like the dev server) over sqlite (an in-memory D1 stand-in):
//   1. run-score expMode 'exp-dive': a route's board keeps each player's DEEPEST floor (then the faster); a worse run doesn't
//      replace it; the rank
//   2. validation: an unknown route, a bad floor / start, a depth faster than 4 s a floor, a missing content version: 400
//   3. the Weekly Dive: its own board per week (runboard:micasurvivor_expedition:dive:weekly:<week>), from floor 1 only;
//      last week's score is refused; reads with an old week still work
//   4. run-leaderboard (board 'dive'): the route's / the week's top and your row; the Classic / Survival boards untouched
//   node overworld/tests/micasurvivor_dive_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { stmt.run(...bound); return { success: true }; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-dive-srv-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const T = {};
const as = (who) => (action, body) => raw(action, body, T[who]);
const WEEK = Math.floor((Date.now() - Date.UTC(2026, 0, 5)) / 604800000);
const BOARD = 'micasurvivor_expedition';
const score = (o) => Object.assign({ mode: BOARD, expMode: 'exp-dive', dv: 20, route: 'reef', floor: 12, start: 1, time: 600, escaped: true, kills: 300, level: 14, dex: 7 }, o);

try {
	for (const n of ['ana', 'ben', 'cyd']) T[n] = (await raw('register', { username: n, password: 'msurv-dive-pass-1' })).body.token;
	A(['ana', 'ben', 'cyd'].every(n => T[n]), 'test accounts register');
	const ana = as('ana'), ben = as('ben'), cy = as('cyd');

	// ===== 1. a route's board: the deepest floor
	A((await raw('run-score', score())).status === 401, 'a score needs a login');
	const a1 = await ana('run-score', score({ floor: 12 }));
	A(a1.status === 200 && a1.body.better && a1.body.rank === 1 && a1.body.board === 'micasurvivor_expedition:dive:reef', 'a first Dive score: the reef board, rank 1', JSON.stringify(a1.body));
	const a2 = await ana('run-score', score({ floor: 9, time: 400 }));
	A(a2.status === 200 && !a2.body.better && a2.body.best.floor === 12, 'a shallower run doesn\'t replace the deepest', JSON.stringify(a2.body));
	const a3 = await ana('run-score', score({ floor: 12, time: 500 }));
	A(a3.body.better && a3.body.best.time === 500, 'the same floor faster replaces it', JSON.stringify(a3.body));
	await ben('run-score', score({ floor: 30, start: 26, time: 120 }));
	const b0 = row('runboard:micasurvivor_expedition:dive:reef');
	A(Array.isArray(b0) && b0.map(e => e.name).join() === 'ben,ana' && b0[0].floor === 30 && b0[0].start === 26, 'the board ranks the deepest first (ben from stage 26 on floor 30, then ana)', JSON.stringify(b0));

	// ===== 2. validation
	const bad = async (o, why) => { const r = await cy('run-score', score(o)); A(r.status === 400, why, JSON.stringify(r.body)); };
	await bad({ route: 'atlantis' }, 'an unknown route: 400');
	await bad({ floor: 0 }, 'floor 0: 400');
	await bad({ floor: 9999 }, 'past the deepest floor allowed: 400');
	await bad({ start: 7 }, 'a start that isn\'t 1 or a stage (26, 51...): 400');
	await bad({ start: 51, floor: 30 }, 'a start below the floor reached: 400');
	await bad({ floor: 100, time: 120 }, 'too fast (100 floors in 2 minutes): 400');
	await bad({ dv: undefined }, 'no content version: 400');
	A(!row('micasurvivor_expedition:dive:atlantis') && !(row('cyd') && row('cyd').runBest && Object.keys(row('cyd').runBest).length), '...and nothing was written for them');

	// ===== 3. the Weekly Dive
	const w1 = await cy('run-score', score({ weekly: true, week: WEEK, route: 'grotto', floor: 7, time: 300 }));
	A(w1.status === 200 && w1.body.board === 'micasurvivor_expedition:dive:weekly:' + WEEK && w1.body.week === WEEK, 'a Weekly Dive score lands on this week\'s board', JSON.stringify(w1.body));
	const wOld = await cy('run-score', score({ weekly: true, week: WEEK - 1, floor: 50, time: 3000 }));
	A(wOld.status === 400 && wOld.body.week === WEEK, 'last week\'s Weekly Dive is over: refused', JSON.stringify(wOld.body));
	const wSt = await cy('run-score', score({ weekly: true, week: WEEK, start: 26, floor: 40, time: 3000 }));
	A(wSt.status === 200 && wSt.body.best && wSt.body.best.start === 1 && wSt.body.best.floor === 40, 'the Weekly Dive is always from floor 1 (a stage start is taken as 1, and the time must cover it)', JSON.stringify(wSt.body));
	A(!row('runboard:micasurvivor_expedition:dive:reef').some(e => e.name === 'cyd'), '...and the weekly score stays off the route boards');

	// ===== 4. reads
	const r1 = await ana('run-leaderboard', { mode: BOARD, expMode: 'exp-dive', board: 'dive', route: 'reef' });
	A(r1.status === 200 && r1.body.top.length === 2 && r1.body.top[0].name === 'ben' && r1.body.you && r1.body.you.rank === 2 && r1.body.you.floor === 12, 'the reef board read: ben first, you (ana) rank 2 on floor 12', JSON.stringify(r1.body));
	const r2 = await ben('run-leaderboard', { mode: BOARD, board: 'dive', weekly: true, week: WEEK });
	A(r2.status === 200 && r2.body.top.length === 1 && r2.body.top[0].name === 'cyd' && r2.body.you === null && r2.body.week === WEEK, 'this week\'s board read: cy alone, ben not on it', JSON.stringify(r2.body));
	const r3 = await ben('run-leaderboard', { mode: BOARD, board: 'dive', weekly: true, week: WEEK - 3 });
	A(r3.status === 200 && r3.body.top.length === 0 && r3.body.week === WEEK - 3, 'an old week reads (empty)', JSON.stringify(r3.body));
	const r4 = await ana('run-leaderboard', { mode: BOARD, expMode: 'exp-dive', board: 'dive', route: 'nowhere' });
	A(r4.status === 400, 'a read of an unknown route: 400');
	const cl = await ana('run-leaderboard', { mode: BOARD, map: 'viridian', diff: 'normal' });
	A(cl.status === 200 && Array.isArray(cl.body.top) && cl.body.top.length === 0, 'the Classic boards are untouched (viridian / normal still reads, empty)', JSON.stringify(cl.body).slice(0, 200));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
