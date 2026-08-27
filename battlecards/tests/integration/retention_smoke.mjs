// retention_smoke.mjs — the retention batch's server surface: run-mode
// leaderboards (Duels-family best runs) and the PvP Elo ladder. Boots the REAL
// dev server on a fresh sqlite and drives the API directly (no browser).
//   node battlecards/tests/integration/retention_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8883;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
const reg = async (u) => (await api('register', { username: u, password: 'localdev1' })).token;
const waitUp = async () => {
	for (let i = 0; i < 100; i++) {
		try { if ((await fetch(BASE + '/')).ok) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
};

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retention-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	try {
		A(await waitUp(), 'dev server is up');
		const alice = await reg('lb_alice');
		const bob = await reg('lb_bob');

		// ---- run-mode leaderboards ----
		const s1 = await api('run-score', { mode: 'lorequest', wins: 7, losses: 3, hero: 'Chandra' }, alice);
		A(s1.ok && s1.better && s1.rank === 1, 'first lorequest score posts at rank 1', JSON.stringify(s1));
		const s2 = await api('run-score', { mode: 'lorequest', wins: 12, losses: 1, hero: 'Karn' }, bob);
		A(s2.ok && s2.rank === 1, 'a better run takes rank 1', JSON.stringify(s2));
		const s3 = await api('run-score', { mode: 'lorequest', wins: 3, losses: 3, hero: 'Chandra' }, alice);
		A(s3.ok && s3.better === false && s3.best.wins === 7, 'a worse run never overwrites the best');
		const lb = await api('run-leaderboard', { mode: 'lorequest' }, alice);
		A(lb.top?.length === 2 && lb.top[0].name === 'lb_bob' && lb.you?.rank === 2, 'the board lists both, sorted', JSON.stringify(lb.top));
		A((await api('run-score', { mode: 'dungeon', wins: 5 }, alice)).error === 'no board for that mode', 'non-climb modes have no board');

		// ---- PvP Elo ----
		const d1 = await api('duel-result', { opponent: 'lb_bob' }, alice);
		A(d1.ok && d1.rating === 1016 && d1.delta === 16 && d1.rank === 1, 'even-rating win pays +16 (1000 -> 1016)', JSON.stringify(d1));
		const bobState = await api('state', {}, bob);
		A(!!bobState.state, 'loser account still readable');
		const board = await api('pvp-leaderboard', {}, bob);
		A(board.top?.length === 2 && board.top[0].name === 'lb_alice' && board.top[1].rating === 984,
			'ladder shows winner above loser (984 after the loss)', JSON.stringify(board.top));
		A((await api('duel-result', { opponent: 'lb_alice' }, alice)).error === 'bad opponent', 'self-report rejected');
		A((await api('duel-result', { opponent: 'nobody_here' }, alice)).error === 'no such opponent', 'unknown opponent rejected');
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
