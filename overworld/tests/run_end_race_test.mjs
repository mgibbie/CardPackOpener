// run_end_race_test.mjs — a run that has ENDED stays ended, even when a save of it
// is still in flight on the server.
//
// 2026-10, Muse's Final Fantasy runs (replay tapes): 36 fights were played after a
// run's third loss — 15 rebuilt the run-ending fight from its start, 21 resumed it
// mid-fight from an old snapshot. The run doc (run:<user>) holds every mode, and
// run-save / run-clear both READ it, then WROTE it whole. The client fires its 5 s
// heartbeat and pagehide pushes without waiting, so a save that read the doc before
// the end-of-run clear then wrote the finished run back over it; the next boot took
// that run from the server and replayed its last fight.
//   1. the race, on the REAL handler (bundled like the dev server) over sqlite:
//      a save of run A is held before writing; run-clear ends A; the save is
//      released -> refused, the server keeps the `ended` marker, not the run
//   2. an older revision of the same run never overwrites a newer one
//   3. a NEW run saves normally over the marker; an old run's clear can't touch it
//   4. a clear without a runId still deletes the entry (legacy clients)
//   5. the client sends the runId, remembers ended runs, and boot skips them
//
//   node overworld/tests/run_end_race_test.mjs
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

// a D1 stand-in, plus a hook that can hold one write until released
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
let holdWrite = null;   // { match, gate, reached } — the next INSERT bound to a string containing match waits on gate
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

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-runend-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import('file://' + bundle.replace(/\\/g, '/'));

const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.1.' + (1 + Math.floor(Math.random() * 200)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const KEY = 'magepunk_finalfantasy_v1';
const run = (runId, rev, extra = {}) => ({ active: true, characterId: 'Yuna', wins: 1, losses: 2, runId, rev, enemy: { name: 'Queen Brahne' }, ...extra });
const stored = () => {
	const row = sqlite.prepare("SELECT value FROM mp_store WHERE key = 'run:racer'").get();
	return row ? JSON.parse(row.value)[KEY] : undefined;
};

try {
	const reg = await call('register', { username: 'racer', password: 'racer-password-1' });
	const token = reg.token;
	A(!!token, 'a test account registers', JSON.stringify(reg).slice(0, 120));

	const first = await call('run-save', { key: KEY, run: run('rA', 5) }, token);
	A(first.ok === true && stored()?.run?.rev === 5, 'a run saves (run A, rev 5)', JSON.stringify(first));

	// ===== 1. the race =====
	let reached; const reachedP = new Promise(r => { reached = r; });
	let release; const gate = new Promise(r => { release = r; });
	holdWrite = { match: '"snapshot":{"turnNumber":9}', gate, reached };
	const inflight = call('run-save', { key: KEY, run: run('rA', 5, { snapshot: { turnNumber: 9 } }) }, token);   // a pagehide push, held
	await reachedP;
	const cleared = await call('run-clear', { key: KEY, runId: 'rA' }, token);   // the run ends at its third loss
	A(cleared.ok === true && stored()?.ended === 'rA' && !stored()?.run, '1. run-clear leaves an ended marker for run A', JSON.stringify(stored()));
	release();
	const late = await inflight;
	A(stored()?.ended === 'rA' && !stored()?.run, '1. ...and the held save of run A, released afterwards, does NOT bring it back', JSON.stringify(stored()));
	A(late.ok === false && late.stale === true, '1. the late save is answered as stale', JSON.stringify(late));
	const loaded = await call('run-load', {}, token);
	A(!loaded.runs?.[KEY]?.run, '1. run-load hands no run back for the ended mode', JSON.stringify(loaded.runs?.[KEY]));

	// a plain (non-interleaved) save of the ended run is refused too
	const again = await call('run-save', { key: KEY, run: run('rA', 9) }, token);
	A(again.stale === true && !stored()?.run, 'a later save of the ended run is still refused', JSON.stringify(again));

	// ===== 2. revisions =====
	await call('run-save', { key: KEY, run: run('rB', 7) }, token);
	const older = await call('run-save', { key: KEY, run: run('rB', 6) }, token);
	A(older.stale === true && stored()?.run?.rev === 7, '2. an older revision of the same run never overwrites a newer one', JSON.stringify(stored()?.run));
	const same = await call('run-save', { key: KEY, run: run('rB', 7, { wins: 2 }) }, token);
	A(same.ok === true && stored()?.run?.wins === 2, '2. the same revision still writes (the stripped heartbeat copy)', JSON.stringify(same));

	// ===== 3. a new run, and an old run's clear =====
	A(stored()?.run?.runId === 'rB' && !stored()?.ended, '3. a NEW run (B) saves over run A\'s ended marker', JSON.stringify(stored()));
	await call('run-clear', { key: KEY, runId: 'rA' }, token);
	A(stored()?.run?.runId === 'rB', '3. a late clear of old run A does not touch run B', JSON.stringify(stored()));
	const other = await call('run-save', { key: 'magepunk_middleearth_v1', run: run('rM', 1) }, token);
	A(other.ok === true && stored()?.run?.runId === 'rB', '3. another mode\'s save leaves this mode alone', JSON.stringify(other));

	// ===== 4. legacy clear =====
	await call('run-clear', { key: KEY }, token);
	A(stored() === undefined, '4. a clear without a runId deletes the entry (legacy clients)', JSON.stringify(stored()));
	const legacy = await call('run-save', { key: KEY, run: { active: true, wins: 0, losses: 0 } }, token);
	A(legacy.ok === true && stored()?.run?.active === true, '4. a run with no runId still saves', JSON.stringify(legacy));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 5. the client =====
{
	const src = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
	const clears = src.match(/^const clear[A-Za-z]+ = .*$/gm) || [];
	A(clears.length === 10 && clears.every(l => /= \(\) => endRunKey\([A-Z_]+\);$/.test(l)), '5. all 10 run modes end their run through endRunKey', clears.filter(l => !/endRunKey/.test(l)).join(' | '));
	const end = src.slice(src.indexOf('function endRunKey'), src.indexOf('function endRunKey') + 500);
	A(end.indexOf('safeLoad(key') < end.indexOf('localStorage.removeItem(key)') && /serverClearRun\(key, runId\)/.test(end), '5. endRunKey reads the runId before clearing and sends it with run-clear');
	A(/ENDED_RUNS_KEY/.test(end), '5. endRunKey remembers the ended run on this device');
	const hyd = src.slice(src.indexOf('async function hydrateRunsFromServer'), src.indexOf('async function hydrateRunsFromServer') + 1600);
	A(/endedRunIds\(\)\.includes/.test(hyd), '5. boot never takes a run this device ended back from the server');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
