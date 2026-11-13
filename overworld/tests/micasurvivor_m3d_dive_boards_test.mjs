// micasurvivor_m3d_dive_boards_test.mjs — MicaSurvivor 3D, Dive part 7 (Plans/MICASURVIVOR_3D_PLAN.md §5.59): a 3D Dive has its
// OWN boards (owner, 2026-11-12: same save, separate boards). What the page sends (micasurvivor/m3d/divesave.js scoreBody,
// boardAsk) against the REAL handler (server/mp.mjs) over sqlite:
//   * a 3D Dive is filed under the route's 3D board (…:dive:<route>:3d), by its deepest floor, then the shorter time
//   * the 2D board of the route does not see it, and a 2D score does not reach the 3D board
//   * the board as the screen shows it: ten rows and yours
//   node overworld/tests/micasurvivor_m3d_dive_boards_test.mjs
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

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-dive3d-')), 'mp.bundle.mjs');
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
import * as DS from '../../micasurvivor/m3d/divesave.js';
import { SV } from '../../micasurvivor/m3d/expsave.js';
const BOARD = SV.BOARD;
/** A finished Dive as dive.js result() and the run give it. */
const dive = (o = {}) => { const p = { route: 'forest', deepest: 12, start: 1, time: 600, escaped: false, kills: 300, ...o }; return [{ w: { pl: { level: o.level || 14, mon: { dex: o.dex || 4 } } } }, { parts: p }]; };
const body = (o) => DS.scoreBody(...dive(o), { dv: SV.DV, board: BOARD });

try {
	for (const n of ['ana', 'ben']) T[n] = (await raw('register', { username: n, password: 'msurv-dive3d-pass-1' })).body.token;
	const ana = as('ana'), ben = as('ben');
	const b0 = body();
	A(b0.mode === 'micasurvivor_expedition' && b0.d3 === true && b0.expMode === 'exp-dive' && b0.route === 'forest' && b0.floor === 12 && b0.start === 1 && b0.time === 600 && b0.dex === 4 && b0.level === 14 && b0.dv === SV.DV, 'what the page sends: the route, the deepest floor, the start, the time, who dived, and d3', JSON.stringify(b0));
	A((await raw('run-score', b0)).status === 401, 'a score needs a login');
	const a1 = await ana('run-score', b0);
	A(a1.status === 200 && a1.body.better && a1.body.rank === 1 && a1.body.board === 'micasurvivor_expedition:dive:forest:3d', 'a first 3D Dive: the 3D board of the forest, rank 1', JSON.stringify(a1.body));
	A(!!row('runboard:micasurvivor_expedition:dive:forest:3d') && !row('runboard:micasurvivor_expedition:dive:forest'), 'it is filed under the 3D key; the 2D board of the route has nothing');
	const b1 = await ben('run-score', body({ deepest: 15, time: 900, escaped: true, dex: 7 }));
	A(b1.status === 200 && b1.body.rank === 1, 'a deeper Dive takes the first place', JSON.stringify(b1.body));
	const a2 = await ana('run-score', body({ deepest: 9, time: 300 }));
	A(a2.status === 200 && !a2.body.better && a2.body.rank === 2 && a2.body.best.floor === 12, 'a shallower Dive does not replace your best', JSON.stringify(a2.body));
	// the 2D game's board is its own
	const two = { ...body({ deepest: 20, time: 1200 }) }; delete two.d3;
	const a3 = await ana('run-score', two);
	A(a3.status === 200 && a3.body.board === 'micasurvivor_expedition:dive:forest' && a3.body.best.floor === 20, 'a 2D Dive by the same player goes to the 2D board, with its own best', JSON.stringify(a3.body));
	const r3 = await ana('run-leaderboard', DS.boardAsk('forest', BOARD));
	A(r3.status === 200 && r3.body.board === 'micasurvivor_expedition:dive:forest:3d' && r3.body.top.length === 2 && r3.body.top[0].name === 'ben' && r3.body.top[0].floor === 15 && r3.body.you.rank === 2 && r3.body.you.floor === 12, 'the 3D board read back: ben floor 15, then ana floor 12 (not her 2D floor 20)', JSON.stringify(r3.body).slice(0, 300));
	const r2 = await ana('run-leaderboard', { mode: BOARD, expMode: 'exp-dive', board: 'dive', route: 'forest' });
	A(r2.body.top.length === 1 && r2.body.top[0].floor === 20, 'the 2D board has only the 2D score', JSON.stringify(r2.body).slice(0, 200));
	A((await ana('run-score', { ...b0, d3: false })).status === 400 && (await ana('run-score', { ...b0, d3: 1 })).status === 400, 'd3 is true or absent');
	A((await ana('run-score', body({ route: 'nowhere' }))).status === 400 && (await ana('run-score', body({ deepest: 60, time: 20 }))).status === 400, 'the checks of the Dive boards still hold (an unknown route, an impossible depth)');
	// the rows the screen shows
	const rows = DS.boardRows(r3.body, (dex) => ({ 4: 'Charmander', 7: 'Squirtle' })[dex] || '', 'ana');
	A(rows.length === 2 && rows[0].rank === 1 && rows[0].name === 'ben' && rows[0].who === 'Squirtle Lv 14' && rows[0].score === 'Floor 15 ↑' && rows[0].time === '15:00' && !rows[0].me && rows[1].me && rows[1].score === 'Floor 12', 'the rows: rank, name, who, the floor (an arrow for an escape), the time; yours is marked', JSON.stringify(rows));
	const far = DS.boardRows({ top: Array.from({ length: 12 }, (_, i) => ({ name: 'p' + i, floor: 40 - i, time: 100, dex: 4 })), you: { rank: 37, floor: 3, time: 50, dex: 4 } }, () => 'Charmander', 'ana');
	A(far.length === 11 && far[10].rank === 37 && far[10].me && far[10].name === 'ana', 'ten rows, and yours below them when you are further down');
} catch (e) { fail++; console.log('FAIL: crashed: ' + (e && e.stack || e)); }
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
