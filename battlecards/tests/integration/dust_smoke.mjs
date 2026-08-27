// dust_smoke.mjs — the dust/crafting economy: disenchanting extras pays dust,
// crafting spends it, caps and validation hold. Boots the REAL dev server on a
// fresh sqlite; deterministic success-paths are set up by editing the account
// row directly in that sqlite between calls (the dev server reads per request).
//   node battlecards/tests/integration/dust_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8885;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
const waitUp = async () => {
	for (let i = 0; i < 100; i++) {
		try { if ((await fetch(BASE + '/')).ok) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
};

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dust-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	// edit the account row directly (dev server reads fresh per request)
	const patchUser = (name, fn) => {
		const db = new DatabaseSync(dbFile);
		const row = db.prepare('SELECT value FROM mp_store WHERE key = ?').get(name);
		const u = JSON.parse(row.value);
		fn(u);
		db.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(u), name);
		db.close();
	};
	try {
		A(await waitUp(), 'dev server is up');
		const t = (await api('register', { username: 'dusty', password: 'localdev1' })).token;
		A(!!t, 'account registered');

		const st0 = (await api('state', {}, t)).state;
		A(st0.dust === 0, 'fresh accounts start at 0 dust');
		const d0 = await api('dust-extras', {}, t);
		A(d0.ok && d0.dusted === 0 && d0.gained === 0, 'a fresh playset collection has nothing to dust');
		A((await api('craft', { id: 'not_a_card_xyz' }, t)).error === 'not a craftable card', 'craft rejects unknown ids');

		// pick a known common + legendary from the real pack pool
		const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/pool-rarity.json'), 'utf8'));
		const common = Object.keys(pool).find(id => pool[id][0] === 'common');
		const legend = Object.keys(pool).find(id => pool[id][0] === 'legendary' && !(st0.collection[id] > 0));
		A(!!common && !!legend, 'found pool exemplars', common + '/' + legend);
		A((await api('craft', { id: legend }, t)).error?.startsWith('not enough dust'), 'craft refuses without dust');

		// seed 5 copies of a common -> 3 extras -> +15 dust, capped at 2
		patchUser('dusty', u => { u.collection[common] = 5; });
		const d1 = await api('dust-extras', {}, t);
		A(d1.ok && d1.dusted === 3 && d1.gained === 15 && d1.dust === 15, 'extras dust at rarity value (3 commons -> 15)', JSON.stringify(d1));
		A(d1.state.collection[common] === 2, 'the playset (2) survives dusting');

		// bankroll a legendary craft: 1600 exactly
		patchUser('dusty', u => { u.dust = 1600; });
		const c1 = await api('craft', { id: legend }, t);
		A(c1.ok && c1.count === 1 && c1.dust === 0, 'a legendary crafts for exactly 1600', JSON.stringify(c1));
		A((await api('craft', { id: legend }, t)).error === 'you already have a full playset', 'legendaries cap at 1 copy');

		// commons cap at 2
		patchUser('dusty', u => { u.dust = 500; });
		const c2 = await api('craft', { id: common }, t);
		A(c2.error === 'you already have a full playset', 'commons cap at the playset');
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
