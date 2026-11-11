// login_no_enumeration_test.mjs — signing in must not reveal which usernames exist (server/mp.mjs `login`).
// The REAL handler (bundled like the dev server) over an in-memory sqlite D1 stand-in:
//   * an unknown username and a wrong password get the SAME reply: same status (401), same body
//   * an unknown username still costs one scrypt, so the reply's timing doesn't tell them apart either
//     (before: the unknown-account path returned without hashing — a few hundred times faster)
//   * a row that fits the username rule but isn't an account (an unprefixed system key such as 'aideckpool')
//     gets that same refusal, not a 500
//   * the right password still signs in (token + state), username case/whitespace-insensitive as before
//   node overworld/tests/login_no_enumeration_test.mjs
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
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loginenum-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0; // a fresh IP per call: the per-IP login brake is not what this suite is about
const raw = async (action, body = {}) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)) },
		body: JSON.stringify({ action, ...body }),
	});
	const t0 = performance.now();
	const res = await handler(req, { MP_DB });
	const text = await res.text();
	return { status: res.status, text, body: JSON.parse(text), ms: performance.now() - t0 };
};
const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

const reg = await raw('register', { username: 'enum_real', password: 'localdev1' });
A(reg.status === 200 && !!reg.body.token, 'register makes the account', reg.text.slice(0, 120));

const wrongPw = await raw('login', { username: 'enum_real', password: 'not-the-password' });
const unknown = await raw('login', { username: 'enum_ghost', password: 'not-the-password' });
A(wrongPw.status === 401, 'a wrong password is refused with 401', wrongPw.status);
A(unknown.status === 401, 'an unknown username is refused with 401', unknown.status);
A(unknown.text === wrongPw.text, 'an unknown username and a wrong password get the identical reply', unknown.text + ' vs ' + wrongPw.text);
A(!/no such|not found|exist/i.test(unknown.text), 'the refusal does not say the account is missing', unknown.text);

// timing: both paths hash once. Medians over a few calls; the old unknown path skipped scrypt entirely
// (sub-millisecond against tens of milliseconds), so a generous floor still tells the two builds apart.
const tw = [], tu = [];
for (let i = 0; i < 7; i++) {
	tw.push((await raw('login', { username: 'enum_real', password: 'nope' + i })).ms);
	tu.push((await raw('login', { username: 'enum_ghost' + i, password: 'nope' + i })).ms);
}
const mw = median(tw), mu = median(tu);
A(mu > mw * 0.3, 'an unknown username costs a hash too (timing does not tell)', 'unknown ' + mu.toFixed(2) + 'ms vs wrong-password ' + mw.toFixed(2) + 'ms');

// a system row whose key fits the username rule is not an account
sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?)').run('aideckpool', JSON.stringify([{ id: 1 }]), Date.now());
const sys = await raw('login', { username: 'aideckpool', password: 'anything' });
A(sys.status === 401 && sys.text === wrongPw.text, 'a non-account row gets the same refusal (not a 500)', sys.status + ' ' + sys.text.slice(0, 120));

const good = await raw('login', { username: '  Enum_Real ', password: 'localdev1' });
A(good.status === 200 && !!good.body.token && !!good.body.state, 'the right password still signs in (case/space-insensitive name)', good.text.slice(0, 120));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
