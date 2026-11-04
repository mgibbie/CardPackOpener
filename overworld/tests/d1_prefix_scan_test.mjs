// D1 prefix scans use the primary-key index (2026-10-22). server/mp.mjs's store.list(prefix) and sweepOld(prefix) were
// `key LIKE 'prefix%'`: SQLite's LIKE is case-insensitive, so it can't use the key index and every call scanned the whole
// mp_store table — ~95% of all D1 rows read (63k list calls a day x ~1,570 rows). They are now a key RANGE
// (key >= prefix AND key < prefixEnd(prefix)). This suite checks, on the same schema as production:
//   1. no `LIKE` prefix scan is left in server/mp.mjs;
//   2. the range form SEARCHes the primary-key index (EXPLAIN QUERY PLAN), the old LIKE form SCANs;
//   3. the range returns exactly the keys that start with the prefix — '_' in a username is literal (LIKE's '_' matched
//      any character), and the row just past the range is not included;
//   4. the real handler still lists through it (a bug report filed and read back).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const src = fs.readFileSync(path.join(ROOT, 'server', 'mp.mjs'), 'utf8');
// 1.
A(!/key LIKE \?/.test(src), 'server/mp.mjs has no `key LIKE ?` prefix scan left', (src.match(/.*key LIKE \?.*/g) || []).join(' | '));
A(/function prefixEnd\(/.test(src), 'prefixEnd() is defined');
const prefixEnd = (p) => (!p ? '￿' : p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1));

// 2. + 3.
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const ins = db.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 0)');
const keys = ['bug:1-a', 'bug:2-b', 'bug;', 'buga', 'bugz:x', 'owh:jack_f:2026-10-01', 'owh:jack_f:2026-10-02', 'owh:jackxf:2026-10-01', 'owh:jack_g', 'presence:x', 'BUG:upper'];
for (const k of keys) ins.run(k, '{}');
for (let i = 0; i < 300; i++) ins.run('filler:' + i, '{}');
const plan = (sql, ...b) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...b).map((r) => r.detail).join(' / ');
const RANGE = 'SELECT key, value FROM mp_store WHERE key >= ? AND key < ? ORDER BY key';
const LIKE = 'SELECT key, value FROM mp_store WHERE key LIKE ? ORDER BY key';
const pr = plan(RANGE, 'bug:', prefixEnd('bug:'));
A(/SEARCH/.test(pr) && /PRIMARY KEY|autoindex/i.test(pr), 'the range query SEARCHes the primary-key index', pr);
const pl = plan(LIKE, 'bug:%');
A(/SCAN/.test(pl), '(the old LIKE query SCANs the table — the cost this fixes)', pl);
const range = (p) => db.prepare(RANGE).all(p, prefixEnd(p)).map((r) => r.key);
A(JSON.stringify(range('bug:')) === JSON.stringify(['bug:1-a', 'bug:2-b']), "range('bug:') is exactly the bug: rows (not 'bug;', 'buga', 'BUG:upper')", range('bug:'));
A(JSON.stringify(range('owh:jack_f:')) === JSON.stringify(['owh:jack_f:2026-10-01', 'owh:jack_f:2026-10-02']), "'_' is literal: owh:jack_f: does not pick up owh:jackxf:", range('owh:jack_f:'));
const likeRows = db.prepare(LIKE).all('owh:jack_f:%').map((r) => r.key);
A(likeRows.includes('owh:jackxf:2026-10-01'), "(the old LIKE treated '_' as a wildcard and did)", likeRows);
A(range('nope:').length === 0 && range('').length === keys.length + 300, 'an unused prefix lists nothing; the empty prefix lists every row');
const swept = db.prepare('DELETE FROM mp_store WHERE key >= ? AND key < ? AND updated_at < ?').run('filler:', prefixEnd('filler:'), 1);
A(swept.changes === 300 && range('bug:').length === 2, 'the sweep form deletes only its prefix', swept.changes);

// 4. the real handler, on a D1-shaped wrapper over node:sqlite
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		let args = [];
		const st = {
			bind(...a) { args = a; return st; },
			async all() { return { results: sqlite.prepare(sql).all(...args) }; },
			async first() { return sqlite.prepare(sql).get(...args) || null; },
			async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
		};
		return st;
	},
	async batch(sts) { const out = []; for (const s of sts) out.push(await s.run()); return out; },
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-d1range-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const call = async (action, body = {}, token) => {
	const r = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.' + (1 + (pass % 200)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return r.json();
};
const reg = await call('register', { username: 'remytest', password: 'testpass1' });
A(!!reg.token, 'a reporter account registers', JSON.stringify(reg).slice(0, 120));
const add = await call('bug-add', { text: 'range scan check' }, reg.token);
A(add && !add.error, 'it files a bug report', JSON.stringify(add).slice(0, 160));
const mine = await call('bug-mine', {}, reg.token);
const n = (mine.reports || mine.bugs || mine.rows || []).length;
A(n === 1, 'bug-mine reads it back through store.list (the range scan)', JSON.stringify(mine).slice(0, 200));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
