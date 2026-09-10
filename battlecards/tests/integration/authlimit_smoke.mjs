// authlimit_smoke.mjs — per-IP brakes on login and register (they had NONE:
// unlimited password brute-force, one scrypt per attempt). Boots the REAL dev
// server on a fresh sqlite (async_smoke pattern). Limits under test:
// LOGIN_LIMIT [30/min], REG_LIMIT [20/hour] — see server/mp.mjs.
//   node battlecards/tests/integration/authlimit_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8886;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + JSON.stringify(extra) : '')); } };
const api = (action, body = {}) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
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
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'authlim-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	try {
		A(await waitUp(), 'dev server is up');

		// login: 30 attempts pass through (here: unknown account), the 31st brakes
		let normal = 0, braked = null;
		for (let i = 0; i < 31; i++) {
			const r = await api('login', { username: 'ghost_account', password: 'wrong' });
			if (r.error === 'no such account') normal++;
			else if (i === 30) braked = r;
		}
		A(normal === 30, '30 login attempts reach the handler', normal);
		A(braked && /too many attempts/.test(braked.error || ''), 'the 31st is braked per-IP', braked);

		// a braked IP still can't grind passwords: even a CORRECT login is refused
		// (register first would eat the brake window — use a fresh action order:
		// the register below proves the brake is per-action, not global)
		const reg1 = await api('register', { username: 'realuser', password: 'localdev1' });
		A(!!reg1.token, 'register still works while login is braked (separate bucket)');

		// register: 19 more creations fit the window (20 total), the 21st brakes
		let made = 1, regBraked = null;
		for (let i = 0; i < 20; i++) {
			const r = await api('register', { username: 'bulk_' + i, password: 'localdev1' });
			if (r.token) made++;
			else if (!regBraked) regBraked = r;
		}
		A(made === 20, '20 registrations fit the per-IP window', made);
		A(regBraked && /too many new accounts/.test(regBraked.error || ''), 'the 21st is braked', regBraked);
	} finally {
		server.kill();
	}
	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
