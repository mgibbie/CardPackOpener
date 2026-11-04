// micatro_refused_server_test.mjs — Micatro's refused-actions log on the server (server/mp.mjs micatro-refused;
// client: micatro/js/refusedlog.js + micatro/js/net.js sendRefused). The REAL handler (bundled like the dev server) over
// an in-memory sqlite D1 stand-in:
//   * a login is required (401 without a token; nothing written)
//   * an append lands in exactly refused:<user>:<YYYYMMDD> (UTC, the user from the token — a username in the body is
//     ignored) as {v:1, entries}, each entry rebuilt from known fields: unknown fields (a token, a password) are dropped,
//     strings clipped and stripped, numbers clamped, the server's `at` stamped
//   * validation: entries must be a non-empty list of at most 50; an entry needs an action and a reason; a batch with no
//     valid entry is refused and writes nothing
//   * the row keeps the last 200 entries and stays under its byte cap; concurrent appends all land
//   * swept after 30 days (GC_TABLE) and rate-limited
//   node overworld/tests/micatro_refused_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() {
				const r = stmt.run(...bound);
				if (r.changes > 0) {
					if (/^\s*(INSERT|DELETE)/i.test(sql)) writes.push(String(bound[0]));
					else if (/^\s*UPDATE/i.test(sql)) writes.push(String(bound[1]));
				}
				return r;
			},
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-refused-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.33.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {};
const reg = async (name) => { const r = (await raw('register', { username: name, password: 'refused-pass-1' })).body; tokens[name] = r.token; return r.token; };
const own = (from) => writes.slice(from).filter((k) => !k.startsWith('rl:') && !k.startsWith('gc:'));
const day = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const entry = (over = {}) => ({ ts: Date.now(), runId: 'Lmabc12', action: 'use', card: 'c_magician', area: 'consumeables', reason: 'cannot use now', state: 'SELECTING_HAND', stateId: 1, ante: 2, round: 4, hl: 3, targets: 3, max: 2, dollars: 7, id: 41, ver: 'e1 pokermon@3.9.1+r15', ...over });

try {
	for (const n of ['rfalice', 'rfbob', 'rfcap', 'rfrace', 'rfbad']) await reg(n);
	A(Object.keys(tokens).length === 5 && Object.values(tokens).every(Boolean), 'test accounts register');
	const key = (u) => 'refused:' + u + ':' + day();

	// ----- auth -----
	const w0 = writes.length;
	const u = await raw('micatro-refused', { entries: [entry()] });
	A(u.status === 401 && own(w0).length === 0, 'signed out: 401, nothing written', u.status);

	// ----- append -----
	{
		const w1 = writes.length;
		const r = await raw('micatro-refused', { username: 'rfbob', entries: [entry({ token: 'SECRET-TOKEN', password: 'hunter2', extra: { big: 'x'.repeat(5000) } })] }, tokens.rfalice);
		A(r.status === 200 && r.body.ok && r.body.count === 1, 'an append is accepted', JSON.stringify(r.body));
		A(JSON.stringify(own(w1)) === JSON.stringify([key('rfalice')]), 'it writes exactly refused:<user>:<YYYYMMDD> (the token\'s user, not the body\'s)', JSON.stringify(own(w1)));
		const doc = row(key('rfalice'));
		const e = doc && doc.entries && doc.entries[0];
		A(doc && doc.v === 1 && e && e.action === 'use' && e.card === 'c_magician' && e.reason === 'cannot use now' && e.hl === 3 && e.max === 2 && e.ante === 2 && e.round === 4 && e.state === 'SELECTING_HAND' && e.runId === 'Lmabc12' && e.ver === 'e1 pokermon@3.9.1+r15', 'the entry keeps its fields', JSON.stringify(doc));
		A(e && typeof e.at === 'number' && Math.abs(e.at - Date.now()) < 60_000, 'the server stamps `at`');
		A(!JSON.stringify(doc).includes('SECRET') && !JSON.stringify(doc).includes('hunter2') && !('extra' in e) && !('token' in e), 'unknown fields (a token, a password, a blob) are never stored');
		A(!row(key('rfbob')), 'nothing lands on the user named in the body');
		const r2 = await raw('micatro-refused', { entries: [entry({ action: 'discard', card: undefined, reason: 'cannot discard', hl: 0 }), entry({ reason: 'busy' })] }, tokens.rfalice);
		A(r2.body.count === 3 && row(key('rfalice')).entries.map((x) => x.reason).join('|') === 'cannot use now|cannot discard|busy', 'a second append adds to the end of the day\'s row', JSON.stringify(r2.body));
	}

	// ----- validation + clipping -----
	{
		const T = tokens.rfbad, w2 = writes.length;
		const bad = await Promise.all([
			raw('micatro-refused', { entries: [] }, T),
			raw('micatro-refused', { entries: 'x' }, T),
			raw('micatro-refused', { entries: [{ action: 'use' }, { reason: 'x' }, null, 5, []] }, T),
			raw('micatro-refused', { entries: Array.from({ length: 51 }, () => entry()) }, T),
		]);
		A(bad.map((r) => r.status).join(',') === '400,400,400,413' && own(w2).length === 0, 'empty / not a list / no valid entry (400), over 50 (413) — nothing written', JSON.stringify(bad.map((r) => r.status)));
		const r = await raw('micatro-refused', { entries: [entry({ action: 'use<script>'.repeat(10), card: 'c_"magician";DROP', reason: 'line1\nline2\u0000' + 'y'.repeat(500), hl: 1e9, ante: 'abc', ts: 1, round: -5e12, state: 'S'.repeat(100) })] }, T);
		const e = row(key('rfbad')).entries[0];
		A(r.status === 200 && e.action.length <= 40 && !/[<>]/.test(e.action) && e.card === 'c_magicianDROP' && e.reason.length === 120 && !/[\n\u0000]/.test(e.reason), 'strings are stripped + clipped', JSON.stringify(e));
		A(e.hl === 999 && !('ante' in e) && e.round === -1000 && e.state.length === 32 && Math.abs(e.ts - Date.now()) < 87_000_000, 'numbers are clamped (a non-number dropped, an old ts pulled into range)', JSON.stringify(e));
	}

	// ----- caps -----
	{
		const T = tokens.rfcap;
		for (let b = 0; b < 5; b++) await raw('micatro-refused', { entries: Array.from({ length: 50 }, (_, i) => entry({ id: b * 50 + i, ver: 'v'.repeat(10) })) }, T);
		const doc = row(key('rfcap'));
		A(doc.entries.length === 200 && doc.entries[0].id === 50 && doc.entries[199].id === 249, 'the row keeps the LAST 200 entries', doc.entries.length + ' ' + doc.entries[0].id);
		let big; for (let b = 0; b < 2; b++) big = await raw('micatro-refused', { entries: Array.from({ length: 50 }, (_, i) => entry({ id: 1000 + b * 50 + i, ver: 'w'.repeat(200), reason: 'r'.repeat(120), card: 'c'.repeat(64), runId: 'R'.repeat(64) })) }, T);
		const len = sqlite.prepare('SELECT length(value) AS n FROM mp_store WHERE key = ?').get(key('rfcap')).n;
		const d2 = row(key('rfcap'));
		A(big.status === 200 && len <= 81_000 && d2.entries[d2.entries.length - 1].id === 1099 && d2.entries.length < 200, 'the row stays under its byte cap (oldest dropped, newest kept)', `len ${len} n ${d2.entries.length}`);
	}

	// ----- concurrent appends -----
	{
		const T = tokens.rfrace;
		const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => raw('micatro-refused', { entries: [entry({ id: i })] }, T)));
		const ids = (row(key('rfrace')).entries || []).map((e) => e.id).sort((a, b) => a - b);
		A(rs.every((r) => r.status === 200) && ids.join(',') === '0,1,2,3,4,5', 'concurrent appends all land (guarded on the row length)', JSON.stringify([rs.map((r) => r.status), ids]));
		// rate limit: 10 a minute per user
		const more = [];
		for (let i = 0; i < 6; i++) more.push((await raw('micatro-refused', { entries: [entry()] }, T)).status);
		A(more.includes(429), 'micatro-refused is rate-limited', JSON.stringify(more));
	}

	// ----- GC + docs -----
	const gcTable = (src.match(/const GC_TABLE = \[([\s\S]*?)\];/) || [])[1] || '';
	A(/\['refused:', 30 \* 24 \* HR\]/.test(gcTable), "GC_TABLE sweeps 'refused:' after 30 days");
	A(/'micatro-refused': \[\d+, [\d_]+\]/.test(src.slice(src.indexOf('const RATE_LIMITS'), src.indexOf('const HIT_LIMIT'))), 'micatro-refused is in RATE_LIMITS');
	A(/refused:<user>/.test(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')), 'CLAUDE.md says how to read the rows');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
