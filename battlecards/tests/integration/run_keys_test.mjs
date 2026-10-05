// run_keys_test.mjs — every Battlecards run mode can save its run to the server.
//
// 2026-10-04 (Remy, blocker): Final Fantasy Lorequest wins never reached the
// server-side run record; the console showed 400s on every save. server/mp.mjs
// accepts run-save only for keys in RUN_KEYS, and the three newest run modes
// (Sword Coast, Final Fantasy, Multiverse) were never added, so each save got
// 400 "bad run key".
//   1. every run key game.js defines is in the server's RUN_KEYS (static guard,
//      so a new run mode can't be forgotten again)
//   2. against the real dev server: run-save then run-load round-trips for EVERY
//      run key, the three new modes included
//
//   node battlecards/tests/integration/run_keys_test.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 9223;
const BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ===== 1. static: client run keys vs server RUN_KEYS =====
const game = fs.readFileSync(path.join(ROOT, 'battlecards', 'game.js'), 'utf8');
const mp = fs.readFileSync(path.join(ROOT, 'server', 'mp.mjs'), 'utf8');
// a run mode's key: `const XYZ_KEY = 'magepunk_..._v1'` (RUN_KEY is the dungeon's); not the *_UNLOCK_KEY flags
const clientKeys = [...game.matchAll(/const ([A-Z_]*KEY) = '(magepunk_[a-z0-9]+_v\d)'/g)]
	.filter(m => !/UNLOCK/.test(m[1])).map(m => m[2]);
const serverKeys = new Set([...(mp.match(/const RUN_KEYS = new Set\(\[([^\]]*)\]\)/) || [, ''])[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
A(clientKeys.length >= 10, `found the client's run keys (${clientKeys.length})`, JSON.stringify(clientKeys));
const missing = clientKeys.filter(k => !serverKeys.has(k));
A(missing.length === 0, '1. every run mode\'s key is in the server\'s RUN_KEYS', 'missing: ' + missing.join(', '));

// ===== 2. live: run-save / run-load round trip for every key =====
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runkeys-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
try {
	let up = false;
	for (let i = 0; i < 100 && !up; i++) { up = await fetch(BASE + '/').then(r => r.ok).catch(() => false); if (!up) await sleep(200); }
	A(up, 'dev server is up');
	let r = await api('register', { username: 'runkeys', password: 'localdev1' });
	if (!r.body.token) r = await api('login', { username: 'runkeys', password: 'localdev1' });
	const token = r.body.token;
	A(!!token, 'setup: a test account');
	for (const key of clientKeys) {
		const run = { wins: 8, losses: 2, hero: 'Terra', deck: ['a', 'b'], key };
		const s = await api('run-save', { key, run }, token);
		A(s.status === 200 && s.body.ok, `2. run-save accepts ${key}`, JSON.stringify(s));
	}
	const l = await api('run-load', {}, token);
	const runs = (l.body && l.body.runs) || {};
	const notBack = clientKeys.filter(k => !(runs[k] && runs[k].run && runs[k].run.wins === 8));
	A(notBack.length === 0, '2. run-load returns every saved run (8 wins each)', 'missing: ' + notBack.join(', '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
