// micasurvivor_spectate_server_test.mjs — MicaSurvivor M5 batch 12c: live spectating + run replays on the site's backend,
// against the REAL handler (server/mp.mjs bundled like the dev server) over sqlite (an in-memory D1 stand-in that records
// every row write):
//   1. publish-micasurvivor: needs a login; a friendless player writes NOTHING; the "in a run" beacon (msurvlive:<user>)
//      is written at a run's start, its end, a mode / group change and otherwise only every 5 minutes; a snapshot is
//      written ONLY while a friend's heartbeat is fresh (no watchers = no snapshot row, whatever the client sends);
//      ≤ 1 snapshot row per 900 ms; past 60 watched minutes a day, 1 per 5 s; caps (413) and validation (400)
//   2. micasurvivor-state: friends only, BOTH ways (a non-friend and a one-way "friend" are refused and write nothing);
//      waiting / live / unchanged / over (with the summary) / not live; the heartbeat msurvspec:<who>:<you> at most every
//      4 s and only while the run is live; the spectator cap; names with `_` (a LIKE wildcard) do not mix rows
//   3. lifetimes: a stale snapshot -> waiting, an old beacon -> not live (6 minutes), the GC sweeps every new prefix
//   4. discovery: `live-friends` lists kind micasurvivor (+ the watcher count and the co-op group); `friends` marks the
//      friend online with status micasurvivor:run (even with no presence row)
//   5. replays: put (login) / get (PUBLIC, no token, above the auth gate); size caps (packed 413, unpacked bomb 400,
//      frames 413), validation, the meta allow-list, a retried upload (same rid) returns the first id, the per-user cap
//      (10: the oldest is deleted — only if it is the player's own row), the replay list
//   6. no cross-user writes: every write lands on the caller's own keys
//   node overworld/tests/micasurvivor_spectate_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- a D1 stand-in that records row writes ----------
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
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0 && bound[0] !== 'gc:last' && !String(bound[0]).endsWith('%')) { if (/IN \(/.test(sql)) writes.push(...bound.map(String)); else writes.push(String(bound[0])); } return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-spec-srv-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
// the msurv clock (server/mp.mjs msurvNow reads globalThis.__msurvClock): a virtual time the test moves by hand
let VT = Date.now();
globalThis.__msurvClock = () => VT;
const tick = ms => { VT += ms; };

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.5.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const T = {};
const as = (who) => (action, body) => raw(action, body, T[who]);
const W = () => writes.length;
const since = (w0) => writes.slice(w0);
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pack = obj => 'G1.' + b64url(zlib.gzipSync(Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))));
const replay = (frames = 4) => ({ v: 1, h: { v: 1, sd: 5, m: 'normal', dex: 25, mon: 'Pikachu', end: { time: 30, level: 3 } }, f: Array.from({ length: frames }, (_, i) => [i ? 5 : 0, [1, 2, 0, 0, 0, 0, 0]]), ev: [[10, 'lv', 2]] });

try {
	// `al_ce` and `alxce`: the `_` in a LIKE prefix matches any character, so the server's scans must filter exactly
	const NAMES = ['al_ce', 'bob', 'carl', 'eve', 'alxce', 'loner', 'zed'];
	for (const n of NAMES) T[n] = (await raw('register', { username: n, password: 'msurv-spec-pass-1' })).body.token;
	A(NAMES.every(n => T[n]), 'test accounts register');
	for (const n of ['bob', 'carl', 'zed']) await as(n)('add-friend', { username: 'al_ce' });
	await as('bob')('add-friend', { username: 'alxce' });
	const al = as('al_ce'), bob = as('bob'), carl = as('carl'), eve = as('eve'), alx = as('alxce'), loner = as('loner');
	const snap = (x = 10, extra = {}) => Object.assign({ v: 1, t: 50, sd: 77, b: 0, m: 'normal', me: [25, 0], p: [x, 20, 0, 1, 40, 50, 2], lv: [3, 5, 20], k: 4, bo: 0, co: 9, mv: [['ember', 2, 0]], ac: 0, it: ['', ''], lu: 0, e: [[1, 19, 40, 50, 80, 30, 0, 8]], pk: [] }, extra);

	// ===== 1. publishing =====
	A((await raw('publish-micasurvivor', { run: 'abcdef12' })).status === 401, 'publishing needs a login');
	let w0 = W();
	const lp = await loner('publish-micasurvivor', { run: 'abcdef12', label: 'Pikachu', mode: 'normal', snapshot: snap() });
	A(lp.status === 200 && lp.body.watchers === 0 && W() === w0, 'a player with no friends writes NOTHING (nobody could watch)', JSON.stringify(lp.body));
	A((await al('publish-micasurvivor', { run: 'nothex!' })).status === 400, 'a bad run id is refused (400)');
	A((await al('publish-micasurvivor', { run: 'abcdef12', snapshot: [1, 2] })).status === 400, 'a snapshot must be an object (400)');
	const big = await al('publish-micasurvivor', { run: 'abcdef12', snapshot: { pad: 'x'.repeat(25_000) } });
	A(big.status === 413 && big.body.max === 24000, 'a snapshot over 24 KB is refused (413)', JSON.stringify(big.body));
	A(!row('msurvlive:al_ce') && !row('msurvstate:al_ce'), '...and the refused calls wrote nothing');

	const RUN = 'a1b2c3d4e5f6';
	w0 = W();
	const p1 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', dex: 25, snapshot: snap() });
	A(p1.status === 200 && p1.body.wrote.live && !p1.body.wrote.state && p1.body.watchers === 0, 'the first publish of a run writes the beacon; with no watcher, NO snapshot row (even though one was sent)', JSON.stringify(p1.body));
	A(since(w0).join() === 'msurvlive:al_ce', '...exactly one row write: msurvlive:al_ce', since(w0).join());
	const bc = row('msurvlive:al_ce');
	A(bc.run === RUN && bc.label === 'Pikachu' && bc.mode === 'normal' && bc.dex === 25 && !bc.over, 'the beacon: run id, label, mode, Pokémon', JSON.stringify(bc));
	// unwatched checks: nothing for 5 minutes
	w0 = W();
	for (let i = 0; i < 6; i++) { tick(10_000); await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal' }); }
	A(W() === w0, 'unwatched watcher checks (every 10 s) write nothing');
	tick(5 * 60_000);
	w0 = W();
	const p2 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal' });
	A(p2.body.wrote.live && since(w0).join() === 'msurvlive:al_ce' && row('msurvlive:al_ce').ts === VT, 'after 5 minutes the beacon is refreshed (one write): ~0.2 writes a minute unwatched', since(w0).join());
	w0 = W();
	await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', group: ['bob'] });
	A(since(w0).join() === 'msurvlive:al_ce' && row('msurvlive:al_ce').group.join() === 'bob', 'a co-op group change rewrites the beacon at once');
	await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal' });

	// ===== 2. watching =====
	A((await raw('micasurvivor-state', { username: 'al_ce' })).status === 401, 'watching needs a login');
	w0 = W();
	const ne = await eve('micasurvivor-state', { username: 'al_ce' });
	A(ne.status === 403 && W() === w0, 'a NON-friend is refused (403) and writes nothing', JSON.stringify(ne.body));
	{
		const u = row('eve'); u.friends.push('al_ce'); setRow('eve', u);
		const oneWay = await eve('micasurvivor-state', { username: 'al_ce' });
		A(oneWay.status === 403 && W() === w0, 'a one-way "friend" (al_ce on eve\'s list, not eve on al_ce\'s) is refused too');
		u.friends = u.friends.filter(f => f !== 'al_ce'); setRow('eve', u);
	}
	A((await al('micasurvivor-state', { username: 'al_ce' })).status === 403, 'you cannot "watch" yourself');
	w0 = W();
	const s1 = await bob('micasurvivor-state', { username: 'al_ce' });
	A(s1.status === 200 && s1.body.live && s1.body.waiting && !s1.body.snapshot && s1.body.label === 'Pikachu', 'a friend: live, waiting for the first snapshot', JSON.stringify(s1.body));
	A(since(w0).join() === 'msurvspec:al_ce:bob' && row('msurvspec:al_ce:bob') === VT, '...and the heartbeat msurvspec:al_ce:bob (his only write)', since(w0).join());
	w0 = W();
	tick(1000); await bob('micasurvivor-state', { username: 'al_ce' });
	tick(1000); await bob('micasurvivor-state', { username: 'al_ce' });
	A(W() === w0, 'polls within 4 s do not rewrite the heartbeat');
	tick(2500); await bob('micasurvivor-state', { username: 'al_ce' });
	A(since(w0).join() === 'msurvspec:al_ce:bob', 'past 4 s the heartbeat is rewritten (≤ 15 writes a minute per watcher)');
	// the publisher sees the watcher; now the snapshot is written
	w0 = W();
	const p3 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 1, snapshot: snap(10) });
	A(p3.body.watchers === 1 && p3.body.watcherNames.join() === 'bob' && p3.body.wrote.state, 'with a fresh heartbeat the publisher learns "bob" and the snapshot is written', JSON.stringify(p3.body));
	A(since(w0).every(k => k === 'msurvstate:al_ce' || k.startsWith('msurvspecbudget:al_ce:')) && since(w0).includes('msurvstate:al_ce'), '...only her own rows (the snapshot + her watched-minutes row)', since(w0).join());
	const s2 = await bob('micasurvivor-state', { username: 'al_ce' });
	A(s2.body.live && s2.body.seq === 1 && s2.body.snapshot && s2.body.snapshot.p[0] === 10 && s2.body.snapshot.e[0][1] === 19, 'bob reads her snapshot (position, enemies)', JSON.stringify(s2.body).slice(0, 200));
	const s3 = await bob('micasurvivor-state', { username: 'al_ce', seq: 1 });
	A(s3.body.unchanged && !s3.body.snapshot, 'polling the same seq: {unchanged}, no snapshot resent');
	// the floor: two snapshots within 900 ms -> the second is not written
	w0 = W();
	tick(300);
	const p4 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 2, snapshot: snap(11) });
	A(!p4.body.wrote.state && p4.body.wait > 0 && !since(w0).includes('msurvstate:al_ce'), 'a second snapshot within 900 ms is not written (the answer says how long to wait)', JSON.stringify(p4.body));
	tick(700);
	const p5 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 2, snapshot: snap(12) });
	A(p5.body.wrote.state && row('msurvstate:al_ce').seq === 2, 'after the floor it is written');
	// the daily watched minutes: past 60, one per 5 s
	{
		const day = new Date(VT).toISOString().slice(0, 10).replace(/-/g, '');
		const BK = 'msurvspecbudget:al_ce:' + day;
		A(row(BK) && row(BK).used >= 1, 'her watched minutes today are counted (msurvspecbudget:<user>:<YYYYMMDD>)', JSON.stringify(row(BK)));
		setRow(BK, { rev: 99, used: 60, last: -1 });
		tick(5000);
		const p6 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 3, snapshot: snap(13) });
		A(p6.body.slow && p6.body.every === 5000 && p6.body.wrote.state, 'past 60 watched minutes today: `slow`, one snapshot per 5 s', JSON.stringify(p6.body));
		tick(1500);
		const p7 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 4, snapshot: snap(14) });
		A(!p7.body.wrote.state && p7.body.wait > 3000, '...a second one 1.5 s later is not written', JSON.stringify(p7.body));
		setRow(BK, { rev: 100, used: 2, last: -1 });
	}
	// the watcher stops: within 12 s the publisher stops writing snapshots
	tick(13_000);
	w0 = W();
	const p8 = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 5, snapshot: snap(15) });
	A(p8.body.watchers === 0 && !p8.body.wrote.state && W() === w0, 'once the watcher stops polling (12 s), snapshots are no longer written', JSON.stringify(p8.body));
	// a stale snapshot -> waiting
	tick(8000);
	const s4 = await bob('micasurvivor-state', { username: 'al_ce', seq: 4 });
	A(s4.body.live && s4.body.waiting, 'a snapshot older than 20 s: the watcher is told {waiting} (the run is still live)', JSON.stringify(s4.body));
	// `_` in names: al_ce's watchers are not alxce's
	tick(1000);
	setRow('msurvspec:alxce:bob', VT);
	const pX = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 6, snapshot: snap(16) });
	A(pX.body.watcherNames.join() === 'bob', 'a heartbeat for alxce (LIKE `al_ce:` matches it) is not counted as al_ce\'s watcher', JSON.stringify(pX.body.watcherNames));
	const ax = await alx('publish-micasurvivor', { run: 'bbbbbbbb', label: 'Eevee', mode: 'normal', seq: 1, snapshot: snap(1) });
	A(ax.body.watcherNames.join() === 'bob' && !(ax.body.watcherNames || []).includes('carl'), '...and alxce sees only her own watcher', JSON.stringify(ax.body));
	// the spectator cap (10)
	{
		for (let i = 0; i < 10; i++) setRow('msurvspec:al_ce:ghost' + i, VT);
		const c1 = await carl('micasurvivor-state', { username: 'al_ce' });
		A(c1.status === 403 && c1.body.full && c1.body.max === 10 && !row('msurvspec:al_ce:carl'), 'with 10 watching, a NEW watcher is turned away (403 full) and writes no heartbeat', JSON.stringify(c1.body));
		const b5 = await bob('micasurvivor-state', { username: 'al_ce' });
		A(b5.status === 200, '...someone already watching keeps watching');
		sqlite.prepare("DELETE FROM mp_store WHERE key LIKE 'msurvspec:al_ce:ghost%'").run();
	}

	// ===== 4. discovery =====
	await carl('micasurvivor-state', { username: 'al_ce' });
	tick(1000);
	await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', seq: 7, snapshot: snap(17) });
	const lf = await bob('live-friends', {});
	const la = (lf.body.live || []).find(x => x.username === 'al_ce');
	A(la && la.kind === 'micasurvivor' && la.mode === 'micasurvivor' && la.label === 'Pikachu' && la.watchers === 2, '`live-friends`: kind micasurvivor, its label, the live watcher count', JSON.stringify(lf.body));
	A(!row('presence:al_ce'), '...from the beacon: she has no presence row at all (an unwatched solo run writes none)');
	const fr = await bob('friends', {});
	const fa = fr.body.friends.find(f => f.username === 'al_ce');
	A(fa.online && fa.status === 'micasurvivor:run' && fa.region === 'Pikachu' && fa.x === 0, '`friends`: online, status micasurvivor:run, region = the label', JSON.stringify(fa));
	const zf = (await as('zed')('live-friends', {})).body.live.find(x => x.username === 'al_ce');
	A(zf && zf.kind === 'micasurvivor', 'any friend sees it (zed)');
	A(!((await eve('live-friends', {})).body.live || []).some(x => x.username === 'al_ce'), 'a non-friend\'s live list does not include her');

	// ===== the run ends =====
	w0 = W();
	const po = await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', over: true, seq: 8, snapshot: snap(18, { over: { time: 300, level: 7, kills: 99, bosses: 1, dead: true, moves: [['ember', 3]] } }) });
	A(po.body.wrote.live && po.body.wrote.state && row('msurvlive:al_ce').over && row('msurvstate:al_ce').over, 'the end: the beacon says over, and (watched) the last snapshot carries the summary', JSON.stringify(po.body));
	const so = await bob('micasurvivor-state', { username: 'al_ce', seq: 7 });
	A(!so.body.live && so.body.over && so.body.snapshot && so.body.snapshot.over.level === 7, 'the watcher reads {over} with the summary', JSON.stringify(so.body).slice(0, 200));
	w0 = W();
	await bob('micasurvivor-state', { username: 'al_ce', seq: 8 });
	A(W() === w0, '...and polling an ended run writes no heartbeat');
	A(!((await bob('live-friends', {})).body.live || []).some(x => x.username === 'al_ce'), 'an ended run is no longer listed live');
	w0 = W();
	await al('publish-micasurvivor', { run: RUN, label: 'Pikachu', mode: 'normal', over: true });
	A(W() === w0, 'a second "over" (the tab closing after the end) writes nothing');
	// an unwatched end: the beacon only
	const RUN2 = 'ffff0000aaaa';
	await al('publish-micasurvivor', { run: RUN2, label: 'Pikachu · Boss Rush', mode: 'rush' });
	A(row('msurvlive:al_ce').run === RUN2 && !row('msurvlive:al_ce').over && row('msurvlive:al_ce').mode === 'rush', 'a new run: a new beacon (its own run id, its mode)');
	tick(30_000);
	w0 = W();
	await al('publish-micasurvivor', { run: RUN2, label: 'Pikachu · Boss Rush', mode: 'rush', over: true, snapshot: snap(1) });
	A(since(w0).join() === 'msurvlive:al_ce', 'an UNWATCHED run\'s end writes only the beacon', since(w0).join());
	const so2 = await bob('micasurvivor-state', { username: 'al_ce' });
	A(so2.body.over && !so2.body.snapshot, '...a late watcher learns it ended (no stale summary from the run before)', JSON.stringify(so2.body));

	// ===== 3. lifetimes =====
	const RUN3 = 'cccc1111dddd';
	await al('publish-micasurvivor', { run: RUN3, label: 'Pikachu', mode: 'normal' });
	A((await bob('micasurvivor-state', { username: 'al_ce' })).body.live, 'a fresh beacon: live');
	tick(6 * 60_000 + 1000);
	const old = await bob('micasurvivor-state', { username: 'al_ce' });
	A(old.body.live === false && !old.body.snapshot, 'a beacon not refreshed for 6 minutes (the tab died): not live', JSON.stringify(old.body));
	A(!((await bob('live-friends', {})).body.live || []).some(x => x.username === 'al_ce') && !(await bob('friends', {})).body.friends.find(f => f.username === 'al_ce').online, '...and not listed (live-friends, friends)');
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const gc = sv.slice(sv.indexOf('const GC_TABLE'), sv.indexOf('const GC_TABLE') + 3500);
	A(/\['msurvstate:', 1 \* HR\], \['msurvspec:', 1 \* HR\], \['msurvlive:', 6 \* HR\], \['msurvspecbudget:', 48 \* HR\]/.test(gc) && /\['msurvreplay:', 30 \* 24 \* HR\]/.test(gc) && /\['msurvreplays:', 60 \* 24 \* HR\]/.test(gc),
		'the GC sweeps every new prefix (state / heartbeats 1 h, beacons 6 h, budgets 2 days, replays 30 days, replay lists 60 days)');
	A(/const MSURV_LIVE_BEAT_MS = 5 \* 60_000;/.test(sv) && /const MSURV_LIVE_TTL_MS = 6 \* 60_000;/.test(sv) && /const MSURV_SPEC_DAILY_MIN = 60;/.test(sv), 'the beacon beat (5 min), its life (6 min) and the daily watched minutes (60) are constants');
	const rl = sv.slice(sv.indexOf('const RATE_LIMITS'), sv.indexOf('const HIT_LIMIT'));
	A(/'publish-micasurvivor': \[\d+, [\d_]+\]/.test(rl) && /'micasurvivor-state': \[\d+, [\d_]+\]/.test(rl) && /'micasurvivor-replay-put': \[\d+, [\d_]+\]/.test(rl), 'publish / state / replay-put are rate-limited per account');

	// ===== 5. replays =====
	A((await raw('micasurvivor-replay-put', { code: pack(replay()) })).status === 401, 'uploading a replay needs a login');
	w0 = W();
	const up = await al('micasurvivor-replay-put', { code: pack(replay(6)), meta: { dex: 25, mon: 'Pikachu<b>', mode: 'normal', time: 30, level: 3, kills: 12, bosses: 1, dead: true, coop: ['bob', 'NOT OK!'], evil: 'x', frames: 999 }, rid: 'aaaa1111' });
	const id = up.body.id;
	A(up.status === 200 && /^[a-f0-9]{8}$/.test(id || ''), 'a replay uploads -> an 8-hex id', JSON.stringify(up.body));
	A(since(w0).sort().join() === ['msurvreplay:' + id, 'msurvreplays:al_ce'].sort().join(), 'one upload = 2 writes: msurvreplay:<id> and her list msurvreplays:al_ce', since(w0).join());
	const rec = row('msurvreplay:' + id);
	A(rec.by === 'al_ce' && rec.meta.frames === 6 && rec.meta.mon === 'Pikachu<b>' && !('evil' in rec.meta) && rec.meta.coop.join() === 'bob' && rec.meta.kills === 12, 'the meta is allow-listed (frames counted by the server, unknown keys and bad names dropped)', JSON.stringify(rec.meta));
	// a public read, NO token
	const g = await raw('micasurvivor-replay-get', { id });
	A(g.status === 200 && g.body.code === rec.code && g.body.by === 'al_ce' && g.body.meta.level === 3, 'anyone reads it by id WITHOUT a login (public)', JSON.stringify(g.body).slice(0, 120));
	A((await raw('micasurvivor-replay-get', { id: 'zz' })).status === 400 && (await raw('micasurvivor-replay-get', { id: '0123abcd' })).status === 404, 'a bad id is 400, an unknown one 404');
	const gate = sv.indexOf('// everything below requires a valid token');
	A(sv.indexOf("action === 'micasurvivor-replay-get'") > 0 && sv.indexOf("action === 'micasurvivor-replay-get'") < gate && sv.indexOf("action === 'micasurvivor-replay-put'") > gate, 'micasurvivor-replay-get is above the auth gate, -put below it');
	const getBlk = sv.slice(sv.indexOf("action === 'micasurvivor-replay-get'"), sv.indexOf("action === 'micasurvivor-replay-get'") + 400);
	A(getBlk.includes("rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1])"), 'the public read is IP-limited like the other replay reads');
	// a retried upload of the same run
	w0 = W();
	const again = await al('micasurvivor-replay-put', { code: pack(replay(6)), meta: {}, rid: 'aaaa1111' });
	A(again.body.id === id && again.body.again && W() === w0, 'retrying the same upload (same rid) returns the first id and writes nothing', JSON.stringify(again.body));
	// validation + caps
	w0 = W();
	A((await al('micasurvivor-replay-put', { code: 'X1.abc' })).status === 400, 'a code that is not G1. / R1. is refused (400)');
	A((await al('micasurvivor-replay-put', { code: 'G1.' + 'A'.repeat(1_200_001) })).status === 413, 'a packed code over 1.2 MB is refused (413)');
	A((await al('micasurvivor-replay-put', { code: pack({ v: 2, h: {}, f: [[0]] }) })).status === 400, 'a wrong version is refused');
	A((await al('micasurvivor-replay-put', { code: pack({ v: 1, h: {}, f: [] }) })).status === 400, 'an empty replay is refused');
	A((await al('micasurvivor-replay-put', { code: pack({ v: 1, h: {}, f: ['x'] }) })).status === 400, 'frames must be arrays');
	A((await al('micasurvivor-replay-put', { code: pack('not json') })).status === 400, 'junk inside the gzip is refused');
	const many = await al('micasurvivor-replay-put', { code: pack({ v: 1, h: {}, f: Array.from({ length: 30_001 }, () => [5]) }) });
	A(many.status === 413 && many.body.max === 30000, 'more than 30,000 frames is refused (413)', JSON.stringify(many.body));
	const bomb = pack('{"v":1,"h":{},"f":[[' + '0,'.repeat(4_100_000) + '0]]}');
	A(bomb.length < 1_200_000 && (await al('micasurvivor-replay-put', { code: bomb })).status === 400, 'a "zip bomb" (8 MB+ unpacked) is refused without inflating it all', bomb.length);
	A(W() === w0, 'refused uploads write nothing');
	// the per-user cap: 10, the oldest goes (only her own row)
	// (nine more of hers, as if uploaded earlier: the rate limit allows 20 uploads a minute, so they are seeded)
	const ids = [id];
	{
		const lst = row('msurvreplays:al_ce');
		for (let i = 0; i < 9; i++) { const fid = (0xabc00000 + i).toString(16); setRow('msurvreplay:' + fid, { code: rec.code, meta: rec.meta, by: 'al_ce', when: VT + i }); lst.ids.unshift({ id: fid, when: VT + i }); ids.push(fid); }
		setRow('msurvreplays:al_ce', lst);
	}
	tick(1000);
	const r11 = await al('micasurvivor-replay-put', { code: pack(replay(3)), meta: { level: 9 } });
	ids.push(r11.body.id);
	A(r11.status === 200 && (r11.body.evicted || []).join() === id, 'the 11th replay evicts the oldest (her first)', JSON.stringify(r11.body));
	A(!row('msurvreplay:' + id) && ids.slice(1).every(x => row('msurvreplay:' + x)), 'she keeps 10 replays: the oldest row is deleted, the rest stay');
	A(row('msurvreplays:al_ce').ids.length === 10 && row('msurvreplays:al_ce').ids[0].id === ids[10], 'her list: 10, newest first');
	const list = await al('micasurvivor-replay-list', {});
	A(list.status === 200 && list.body.replays.length === 10 && list.body.replays[0].id === ids[10] && list.body.max === 10, 'micasurvivor-replay-list returns her 10 with their meta');
	// no cross-user deletes: a (forged) list naming bob's replay can't make her upload delete it
	const bu = await bob('micasurvivor-replay-put', { code: pack(replay(3)), meta: {} });
	{
		const lst = row('msurvreplays:al_ce');
		lst.ids.push({ id: bu.body.id, when: 1 });   // an 11th entry: bob's replay (as if the list were corrupted)
		setRow('msurvreplays:al_ce', lst);
	}
	w0 = W();
	const r12 = await al('micasurvivor-replay-put', { code: pack(replay(4)), meta: {} });
	A(row('msurvreplay:' + bu.body.id) && !(r12.body.evicted || []).includes(bu.body.id), 'an eviction never deletes another player\'s replay (the row\'s `by` is checked)', JSON.stringify(r12.body));
	A(since(w0).every(k => k === 'msurvreplay:' + r12.body.id || k === 'msurvreplays:al_ce' || (k.startsWith('msurvreplay:') && row(k) === null && ids.includes(k.slice(12)))), 'her upload touched only her own keys', since(w0).join());

	// ===== 6. no cross-user writes (the whole run) =====
	const touched = writes.filter(k => /^msurv(live|state|spec|specbudget|replay|replays):/.test(k));
	const own = k => {
		const m = /^msurv(live|state|replays):(.+)$/.exec(k); if (m) return m[2];
		const b = /^msurvspecbudget:([^:]+):\d{8}$/.exec(k); if (b) return b[1];
		const s = /^msurvspec:([^:]+):(.+)$/.exec(k); if (s) return s[2];   // a heartbeat belongs to the watcher
		return null;
	};
	const strangers = touched.filter(k => !k.startsWith('msurvreplay:') && !['al_ce', 'alxce', 'bob', 'carl', 'zed'].includes(own(k)));
	A(!strangers.length, 'every spectating row write is on the caller\'s own key (publisher rows / watcher heartbeats)', strangers.join(','));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
