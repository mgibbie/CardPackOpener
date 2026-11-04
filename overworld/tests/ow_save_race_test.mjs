// ow_save_race_test.mjs — an older overworld save can never overwrite a newer one,
// even when the two requests interleave on the server.
//
// 2026-10-08, Instinct's bug report (bug:1791511546649): after a long network stall
// (31 pushes "signal timed out") the client got ok=true for rev 37004 and then
// skipped every push as "already-acked" — but the server held 36998. The client
// had given up on requests the server was still running. ow-save checked the
// revision with a READ (store.get) and wrote with a separate statement
// (store.setJSON), so an older in-flight save could pass its check, a newer save
// land, and the older one then write over it.
//   1. the race, on the REAL handler (bundled like the dev server) over sqlite:
//      A (rev 36998) passes its check, is held before writing; B (rev 37004)
//      saves; A is released -> A is refused and the server keeps 37004
//   2. ow-save's ok names the revision it stored
//   3. the client acks only the revision the server confirms (source check of
//      pushOw: an ok for another revision is not an ack)
//
//   node overworld/tests/ow_save_race_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a D1 stand-in (the dev server's, plus a hook that can hold one write)
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
let holdWrite = null;   // { match: string, gate: Promise } — a write whose value contains match waits on gate
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() {
				const h = holdWrite;
				if (h && /INSERT INTO mp_store/.test(sql) && bound.some(b => typeof b === 'string' && b.includes(h.match))) {
					holdWrite = null;
					h.reached();
					await h.gate;
				}
				return stmt.run(...bound);
			},
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-race-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));

const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.' + (1 + Math.floor(Math.random() * 200)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const save = rev => ({
	magepunk_ow_rev: String(rev), magepunk_region: 'hoenn',
	magepunk_party_v1: JSON.stringify([{ speciesId: 'pidgeot', level: 54 }]),
	magepunk_pos_v1: JSON.stringify({ map: 'Route15', x: 37, y: rev % 50 }),
});
const storedRev = () => {
	const row = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'ow:racer'").get();
	return row ? parseInt(JSON.parse(row.value).ow.magepunk_ow_rev, 10) : null;
};

try {
	const reg = await call('register', { username: 'racer', password: 'racer-password-1' });
	const token = reg.token;
	A(!!token, 'a test account registers', JSON.stringify(reg).slice(0, 120));

	const first = await call('ow-save', { ow: save(36990) }, token);
	A(first.ok === true && storedRev() === 36990, 'a first save lands (rev 36990)', JSON.stringify(first));

	// ===== 1. the race =====
	let reached; const reachedP = new Promise(r => { reached = r; });
	let release; const gate = new Promise(r => { release = r; });
	holdWrite = { match: '"magepunk_ow_rev":"36998"', gate, reached };
	const older = call('ow-save', { ow: save(36998) }, token);   // passes its check, then waits at the write
	await reachedP;
	const newer = await call('ow-save', { ow: save(37004) }, token);
	A(newer.ok === true && storedRev() === 37004, '1. the newer save (37004) lands while the older one is held', JSON.stringify(newer));
	release();
	const olderRes = await older;
	A(storedRev() === 37004, '1. ...and the older save (36998), released afterwards, does NOT overwrite it', `stored ${storedRev()}`);
	A(olderRes.conflict === true && olderRes.rev === 37004 && !olderRes.ok, '1. the older save is answered as a stale-revision conflict naming 37004', JSON.stringify(olderRes));

	// a plain stale write (no interleaving) is still refused
	const stale = await call('ow-save', { ow: save(37000) }, token);
	A(stale.conflict === true && storedRev() === 37004, 'a plainly older save is still refused', JSON.stringify(stale));

	// ===== 2. the ok names the revision =====
	const next = await call('ow-save', { ow: save(37005) }, token);
	A(next.ok === true && next.rev === 37005 && storedRev() === 37005, '2. ow-save answers ok with the revision it stored', JSON.stringify(next));
	// a forced write (import / restore) still replaces regardless of revision
	const forced = await call('ow-save', { ow: save(10), force: true }, token);
	A(forced.ok === true && storedRev() === 10, 'a forced write still replaces whatever is stored', JSON.stringify(forced));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 3. the client acks only the confirmed revision =====
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/ow_saves.js'), 'utf8');
	const push = src.slice(src.indexOf('export function pushOw'), src.indexOf('// ---------- gifts'));
	A(/r\.ok && !r\.error && \(r\.rev == null \|\| Number\(r\.rev\) === rev\)\) return done\(true\)/.test(push),
		'3. pushOw acks only when the server confirms THIS revision');
	A(/ack for another revision/.test(push), '3. ...and an ok for another revision is not an ack (it stays dirty and retries)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
