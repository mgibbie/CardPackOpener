// run_handoff_test.mjs — the server side of the cross-device run hand-off.
//
// 1. instinctgauntlet, 2026-11-04: a mid-fight Lorequest run did not reach the server when the tab
//    went away, so another browser resumed the run but restarted the fight at turn 1. The unload push
//    is a keepalive request, whose body the browser caps at ~64KB, and a mid-fight run is ~150KB of
//    JSON: the push was rejected and the rejection swallowed. The client now keeps a gzip-packed copy
//    ready and sends that ({packed: 'G1.<base64url>'}); the server unpacks it.
// 2. instinctgauntlet, 2026-11-05: after a browser-profile turnover the account showed a day-old Lukka
//    run instead of the Ob Nixilis run being played: an old, DIFFERENT run's save overwrote the
//    server's newer run. The server now refuses an older different run over a newer active one
//    ({stale, otherRun}); a run started after the stored one still saves.
//
//   node overworld/tests/run_handoff_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { gameSource } from '../../battlecards/tests/helpers/gamesource.mjs';

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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-handoff-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.2.' + (1 + Math.floor(Math.random() * 200)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const KEY = 'magepunk_lorequest_v1';
const stored = () => { const row = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'run:handoff'").get(); return row ? JSON.parse(row.value)[KEY] : undefined; };
const pack = s => 'G1.' + zlib.gzipSync(Buffer.from(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// a mid-fight run the size the tester measured (~150KB of JSON): a board of many distinct cards
const bigSnapshot = () => {
	const cards = [];
	for (let i = 0; i < 700; i++) cards.push({ uid: 1000 + i, id: 'card_' + i, name: 'Card number ' + i, cost: i % 10, attack: i % 7, maxHealth: 1 + (i % 9), damage: 0, keywords: ['rush', 'taunt'].slice(0, i % 3), description: 'Battlecry: deal ' + (i % 5) + ' damage to a random enemy minion and draw a card. ' + i, zone: i % 2 ? 'hand' : 'deck' });
	return { schemaVersion: 1, turnNumber: 5, current: 0, players: [{ life: 39, hand: cards.slice(0, 350) }, { life: 38, hand: cards.slice(350) }] };
};
const runOf = (runId, rev, updatedAt, extra = {}) => ({ active: true, characterId: 'Nissa', wins: 4, losses: 2, runId, rev, updatedAt, enemy: { name: 'Lukka' }, ...extra });

try {
	const reg = await call('register', { username: 'handoff', password: 'handoff-password-1' });
	const token = reg.token;
	A(!!token, 'a test account registers');

	// ===== 1. the packed hand-off =====
	const mid = runOf('rN', 467, 1793850000000, { snapshot: bigSnapshot(), snapshotAt: 1793850000000 });
	const json = JSON.stringify(mid);
	const code = pack(json);
	A(json.length > 64 * 1024, `1. the mid-fight run is over the 64KB keepalive cap (${json.length}B)`);
	A(code.length < 60_000, `1. ...its packed copy fits under it (${code.length}B)`);
	await call('run-save', { key: KEY, run: { ...mid, snapshot: undefined, snapshotAt: undefined } }, token);   // the heartbeat copy, board stripped
	const r1 = await call('run-save', { key: KEY, packed: code }, token);
	A(r1.ok === true, '1. the server takes the packed run', JSON.stringify(r1));
	A(stored()?.run?.snapshot?.turnNumber === 5 && stored()?.run?.snapshot?.players?.[0]?.hand?.length === 350, '1. ...with its mid-fight board intact (a cross-device resume continues the fight)', JSON.stringify(stored()?.run?.snapshot || null).slice(0, 80));
	const loaded = await call('run-load', {}, token);
	A(loaded.runs?.[KEY]?.run?.rev === 467 && loaded.runs[KEY].run.wins === 4, '1. run-load hands the same run back (rev, record)', JSON.stringify(loaded.runs?.[KEY]?.run?.rev));
	const junk = await call('run-save', { key: KEY, packed: 'G1.not-gzip' }, token);
	A(junk.ok !== true && /bad run/.test(junk.error || '') && stored()?.run?.snapshot?.turnNumber === 5, '1. a packed body that is not a run is refused and changes nothing', JSON.stringify(junk));
	const bomb = await call('run-save', { key: KEY, packed: pack('x'.repeat(2_000_000)) }, token);
	A(bomb.ok !== true && stored()?.run?.rev === 467, '1. a packed body that inflates past the run cap is refused', JSON.stringify(bomb));
	const older = await call('run-save', { key: KEY, packed: pack(JSON.stringify({ ...mid, rev: 400 })) }, token);
	A(older.stale === true && stored()?.run?.rev === 467, '1. a packed OLDER revision of the run is refused like any other', JSON.stringify(older));

	// ===== 2. an older, different run never replaces a newer one =====
	const lukka = runOf('rL', 107, 1793803577832, { characterId: 'Lukka', wins: 2, losses: 1 });   // a day older
	const r2 = await call('run-save', { key: KEY, run: lukka }, token);
	A(r2.ok === false && r2.stale === true && r2.otherRun === true, '2. a stale profile\'s OLDER different run is refused (otherRun)', JSON.stringify(r2));
	A(stored()?.run?.runId === 'rN' && stored()?.run?.rev === 467, '2. ...and the newer run stays on the server', JSON.stringify(stored()?.run?.runId));
	const fresh = runOf('rZ', 1, 1793900000000, { characterId: 'Chandra', wins: 0, losses: 0 });   // started after it (e.g. after an abandon whose clear was lost)
	const r3 = await call('run-save', { key: KEY, run: fresh }, token);
	A(r3.ok === true && stored()?.run?.runId === 'rZ', '2. a run started AFTER the stored one still saves', JSON.stringify(r3));
	await call('run-clear', { key: KEY, runId: 'rZ' }, token);
	const after = await call('run-save', { key: KEY, run: lukka }, token);
	A(after.ok === true && stored()?.run?.runId === 'rL', '2. over an ended marker any other run saves, as before', JSON.stringify(after));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 3. the client =====
{
	const src = gameSource();
	A(/packRunForHandoff\(io\.key, run\)/.test(src), '3. every snapshot write refreshes the packed hand-off copy');
	A(/function handoffPayload/.test(src) && /payload: \{ key, packed: pk\.code \}/.test(src), '3. the unload push sends the packed copy when the run is over the keepalive cap');
	A(/if \(d\.stale && d\.otherRun\)/.test(src), '3. the client acts on an otherRun refusal (takes the newer run, stashes its own)');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
