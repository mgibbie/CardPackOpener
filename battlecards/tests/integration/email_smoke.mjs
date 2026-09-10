// email_smoke.mjs — the OPTIONAL recovery email (set-email), API-level.
// Opt-in only: accounts never require one. The address lives on the user doc,
// comes back only in the account's own authenticated state, is removable with
// an empty string, and NEVER appears in the public pubprofile subset.
// Boots the REAL dev server on a fresh sqlite (async_smoke pattern).
//   node battlecards/tests/integration/email_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8887;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + JSON.stringify(extra) : '')); } };
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
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'email-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	try {
		A(await waitUp(), 'dev server is up');
		const reg = await api('register', { username: 'wren', password: 'localdev1' });
		const ta = reg.token;
		const tb = (await api('register', { username: 'quill', password: 'localdev1' })).token;
		A(!!ta && !!tb, 'two accounts registered');
		A(reg.state.email === null, 'a fresh account has NO email — it is optional');

		// junk is refused
		A((await api('set-email', { email: 'not-an-email' }, ta)).error != null, 'junk is refused');
		A((await api('set-email', { email: 'a@b' }, ta)).error != null, 'a bare a@b is refused (needs a real TLD)');
		A((await api('set-email', { email: 'x'.repeat(250) + '@example.com' }, ta)).error != null, 'an oversized address is refused');
		A((await api('set-email', { email: 'nope' })).error === 'not logged in', 'setting an email requires a login');

		// a real address sticks, case-folded
		const set = await api('set-email', { email: '  Wren.Recovers@Example.COM ' }, ta);
		A(set.ok === true && set.email === 'wren.recovers@example.com', 'a real address saves (trimmed + lowercased)', set);
		A(set.state.email === 'wren.recovers@example.com', 'and rides back in the account state', set.state.email);
		const st = await api('state', {}, ta);
		A(st.state.email === 'wren.recovers@example.com', 'state echoes it on later loads');

		// never leaks to other players
		const pub = await api('pubprofile', { username: 'wren' }, tb);
		A(pub.profile && !('email' in pub.profile), 'pubprofile has NO email field — other players never see it', Object.keys(pub.profile || {}));

		// empty string removes it
		const rm = await api('set-email', { email: '' }, ta);
		A(rm.ok === true && rm.email === null, 'an empty save removes it', rm);
		A((await api('state', {}, ta)).state.email === null, 'and the account is back to no-email');
	} finally {
		server.kill();
	}
	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
