// micasurvivor_lobby_server_test.mjs — MicaSurvivor M5 batch 12b: online co-op on the site's backend, against the
// REAL handler (server/mp.mjs bundled like the dev server) over sqlite (an in-memory D1 stand-in that records row writes):
//   1. lobbies: msurv-lobby-create / -join / -leave / -poll / -update need a login, are FRIENDS-ONLY (the host must be
//      your friend and you theirs: a non-friend is refused and writes nothing), hold up to 4, compare-and-set on `rev`
//      (concurrent joins never clobber), ready + start (the server refuses a start until every guest is ready and stores
//      the seed + members), reopen after a run, a guest leaving is removed, the host leaving deletes the lobby and every
//      member's signalling / relay row and the invites it sent (exact keys only)
//   2. lifetimes: a waiting lobby whose host stopped polling is closed (TTL), a waiting guest who stopped polling is
//      dropped, an invite lasts 3 minutes, a poll with nothing new writes nothing, presence at most once a minute; the
//      msurv* prefixes are in the GC table
//   3. invites: host-only, friends-only, a row per pair + a bell message in the friend's DM inbox (once, not on a resend)
//   4. signalling: member-only, addressed to members, size-capped (413) and window-capped (400); a lobby's signals are
//      invisible from another lobby (403) and to non-members
//   5. relay: one row per sender, ≤ 1 write per MSURV_RELAY_MIN_MS per sender (429), message / row / window caps,
//      acks, the per-account rate limit (429), stale rows ignored, member-only
//   node overworld/tests/micasurvivor_lobby_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
const setRow = (k, v) => sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(v), k);
const keys = (prefix) => sqlite.prepare('SELECT key FROM mp_store WHERE key LIKE ? ORDER BY key').all(prefix + '%').map(r => r.key);

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-lobby-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
// the msurv actions' injectable clock (server/mp.mjs reads globalThis.__msurvClock): a virtual time the test moves by
// hand, so the 1000 ms relay floor, the per-minute relay budget and the UTC day can be crossed without waiting
let VT = Date.now();
globalThis.__msurvClock = () => VT;
const NOW = () => VT;
const tick = ms => { VT += ms; };

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.4.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const T = {};
const as = (who) => (action, body) => raw(action, body, T[who]);
const W = () => writes.length;

try {
	// the users have underscores and dots on purpose: the server's prefix scans must not let `_` (a LIKE
	// wildcard) match another user's rows
	const NAMES = ['al_ce', 'bob', 'carl', 'dora', 'eve', 'frank', 'alxce'];
	for (const n of NAMES) T[n] = (await raw('register', { username: n, password: 'msurv-lobby-pass-1' })).body.token;
	A(NAMES.every(n => T[n]), 'test accounts register');
	for (const n of ['bob', 'carl', 'dora', 'frank']) await as(n)('add-friend', { username: 'al_ce' });
	await as('eve')('add-friend', { username: 'alxce' });   // eve is NOT al_ce's friend
	const al = as('al_ce'), bob = as('bob'), carl = as('carl'), dora = as('dora'), eve = as('eve'), frank = as('frank'), alx = as('alxce');

	// ===== 1. lobbies =====
	const anon = await raw('msurv-lobby-create', { dex: 25 });
	A(anon.status === 401 && !keys('msurvlobby:').length, 'creating a lobby needs a login (401) and writes nothing');
	const c = await al('msurv-lobby-create', { dex: 6, shiny: true });
	const id = c.body.lobby && c.body.lobby.id;
	A(c.status === 200 && /^[0-9a-f]{12}$/.test(id) && c.body.lobby.host === 'al_ce' && c.body.lobby.members.length === 1
		&& c.body.lobby.members[0].dex === 6 && c.body.lobby.members[0].shiny && c.body.lobby.open, 'the host creates a lobby (random 12-hex id, host first, its Pokémon)', JSON.stringify(c.body));
	A(!!row('msurvlobby:' + id) && row('msurvlobby:' + id).rev === 1, 'the lobby is the exact row msurvlobby:<id> with a revision');

	let w0 = W();
	const ej = await eve('msurv-lobby-join', { id, dex: 1 });
	A(ej.status === 403 && /friends/.test(ej.body.error) && W() === w0 && row('msurvlobby:' + id).members.length === 1, 'a NON-friend cannot join (403) and nothing is written', JSON.stringify(ej));
	// a one-way "friend" (al_ce on eve's list, eve not on al_ce's) is still refused: the server checks both lists
	{
		const u = row('eve'); u.friends.push('al_ce'); setRow('eve', u);
		const oneWay = await eve('msurv-lobby-join', { id, dex: 1 });
		A(oneWay.status === 403, 'a one-way friendship is not enough: the host must have you too (403)');
		u.friends = u.friends.filter(f => f !== 'al_ce'); setRow('eve', u);
	}
	A((await bob('msurv-lobby-join', { id: 'nothex', dex: 1 })).status === 400, 'a malformed lobby id is refused (400)');
	const ghost = await bob('msurv-lobby-join', { id: '0123456789ab', dex: 1 });
	A(ghost.status === 404 && ghost.body.closed, 'an unknown lobby is closed (404)');

	// ===== 3. invites =====
	A((await al('msurv-invite', { id, to: 'eve' })).status === 403, 'you can only invite your friends (403)');
	A((await bob('msurv-invite', { id, to: 'carl' })).status === 403, 'a guest (not even a member) cannot invite');
	w0 = W();
	const inv = await al('msurv-invite', { id, to: 'bob' });
	A(inv.status === 200 && inv.body.sent && row('msurvinv:bob:al_ce') && row('msurvinv:bob:al_ce').id === id, 'the host invites a friend: the row msurvinv:<to>:<host>', JSON.stringify(inv.body));
	const dm = row('chat:dm:bob') || [];
	A(dm.length === 1 && dm[0].from === 'al_ce' && dm[0].kind === 'msurv-invite' && /MicaSurvivor/.test(dm[0].text) && dm[0].text.length <= 140,
		'...and a bell message in their Magepunk inbox (chat:dm:<to>, ≤ 140 chars)', JSON.stringify(dm));
	A(inv.body.lobby.invited.includes('bob'), 'the host sees who was invited');
	const touched = writes.slice(w0);
	A(touched.every(k => ['msurvlobby:' + id, 'msurvinv:bob:al_ce', 'chat:dm:bob'].includes(k)), 'an invite writes only the lobby, the invite row and the DM row', touched.join(','));
	w0 = W();
	const inv2 = await al('msurv-invite', { id, to: 'bob' });
	A(inv2.status === 200 && !inv2.body.sent && W() === w0 && (row('chat:dm:bob') || []).length === 1, 'inviting again right away writes nothing (no second bell message)');

	const bi = await bob('msurv-invites', { status: 'micasurvivor' });
	A(bi.status === 200 && bi.body.invites.length === 1 && bi.body.invites[0].from === 'al_ce' && bi.body.invites[0].id === id, 'the friend sees the invite', JSON.stringify(bi.body));
	const pres = row('presence:bob');
	A(pres && pres.status === 'micasurvivor' && pres.region === 'MicaSurvivor', 'polling invites marks you "in MicaSurvivor" for your friends');
	w0 = W();
	await bob('msurv-invites', { status: 'micasurvivor' });
	A(W() === w0, 'a second poll within a minute writes nothing (presence at most once a minute)');
	// prefix scans: al_ce's invites are not alxce's (the `_` in the LIKE pattern matches any character)
	await al('msurv-invite', { id, to: 'carl' });
	sqlite.prepare("INSERT INTO mp_store (key, value, updated_at) VALUES ('msurvinv:carl:alxce', ?, unixepoch())").run(JSON.stringify({ id, host: 'alxce', at: NOW() }));
	const ci = await carl('msurv-invites', { quiet: 1 });
	A(ci.body.invites.length === 1 && ci.body.invites[0].from === 'al_ce', 'an invite row that does not match its lobby (a forged host) is not shown', JSON.stringify(ci.body));
	A(!row('msurvinv:carl:alxce'), '...and is cleaned up (exact key)');

	// ===== joins =====
	w0 = W();
	const bj = await bob('msurv-lobby-join', { id, dex: 4 });
	A(bj.status === 200 && bj.body.lobby.members.map(m => m.name).join() === 'al_ce,bob' && !bj.body.lobby.members[1].ready, 'a friend joins (not ready yet)', JSON.stringify(bj.body));
	A(!row('msurvinv:bob:al_ce'), 'joining uses up the invite');
	A(writes.slice(w0).every(k => k === 'msurvlobby:' + id || k === 'msurvinv:bob:al_ce'), 'a join writes only the lobby row and its invite', writes.slice(w0).join(','));
	const bobLobby = bj.body.lobby;
	A(bobLobby.invited === undefined, 'a guest does not see the host\'s invite list');
	// concurrent joins: both land (compare-and-set on rev, retried)
	const [cj, dj] = await Promise.all([carl('msurv-lobby-join', { id, dex: 7 }), dora('msurv-lobby-join', { id, dex: 1 })]);
	const names = row('msurvlobby:' + id).members.map(m => m.name).sort().join();
	A(cj.status === 200 && dj.status === 200 && names === 'al_ce,bob,carl,dora', 'two friends joining at once both land (no lost update)', names);
	const fj = await frank('msurv-lobby-join', { id, dex: 1 });
	A(fj.status === 409 && /full/.test(fj.body.error), 'a 5th player is refused: up to 4 (409)', JSON.stringify(fj.body));
	A((await al('msurv-invite', { id, to: 'frank' })).status === 409, 'no invites into a full lobby');

	// polls
	const p1 = await bob('msurv-lobby-poll', { id });
	A(p1.status === 200 && p1.body.lobby && p1.body.lobby.members.length === 4, 'a member polls the lobby');
	w0 = W();
	const p2 = await bob('msurv-lobby-poll', { id, v: p1.body.lobby.v });
	A(p2.body.unchanged && W() === w0, 'a poll with nothing new is {unchanged} and writes nothing');
	A((await eve('msurv-lobby-poll', { id })).body.closed, 'a non-member\'s poll learns nothing');

	// ===== ready + start =====
	A((await bob('msurv-lobby-update', { id, start: { seed: 5 } })).status === 403, 'only the host can start');
	A((await bob('msurv-lobby-update', { id, open: false })).status === 403, 'only the host can close the lobby');
	const early = await al('msurv-lobby-update', { id, start: { seed: 5 } });
	A(early.status === 409 && /ready/.test(early.body.error) && !row('msurvlobby:' + id).start, 'the host cannot start before every guest is ready (409)', JSON.stringify(early.body));
	await bob('msurv-lobby-update', { id, ready: true, dex: 9, shiny: true });
	await carl('msurv-lobby-update', { id, ready: true });
	await dora('msurv-lobby-update', { id, ready: true });
	const lv = (await al('msurv-lobby-poll', { id })).body.lobby;
	A(lv.members.every(m => m.ready) && lv.members.find(m => m.name === 'bob').dex === 9 && lv.members.find(m => m.name === 'bob').shiny, 'guests set ready and their Pokémon');
	A((await al('msurv-lobby-update', { id, dex: 99999 })).body.lobby.members[0].dex === 25, 'a bad dex is clamped to a safe one');
	await al('msurv-lobby-update', { id, dex: 6 });
	const st = await al('msurv-lobby-update', { id, start: { seed: 4242 } });
	const sl = st.body.lobby;
	A(st.status === 200 && sl.start && sl.start.seed === 4242 && sl.start.host === 'al_ce' && sl.start.members.length === 4 && !sl.open
		&& sl.start.members.find(m => m.uid === 'bob').dex === 9, 'the host starts: the seed, host and members are stored, the lobby closes', JSON.stringify(sl));
	A((await bob('msurv-lobby-poll', { id })).body.lobby.start.seed === 4242, 'guests read the start from the lobby');
	A((await al('msurv-lobby-update', { id, start: { seed: 1 } })).status === 409, 'a second start is refused');
	A((await frank('msurv-lobby-join', { id, dex: 1 })).status === 409, 'nobody joins a started lobby');
	// a started lobby keeps members who do not poll (they are in the run)
	{
		const lb = row('msurvlobby:' + id); lb.members.find(m => m.name === 'dora').seen = NOW() - 10 * 60_000; setRow('msurvlobby:' + id, lb);
		await carl('msurv-lobby-update', { id, dex: 7 });
		A(row('msurvlobby:' + id).members.some(m => m.name === 'dora'), 'in a run, a guest who is not polling the lobby stays in it');
		const l2 = row('msurvlobby:' + id); l2.members.find(m => m.name === 'dora').seen = NOW(); setRow('msurvlobby:' + id, l2);
	}

	// ===== 4. signalling =====
	A((await raw('msurv-signal-put', { id, to: {} })).status === 401, 'signalling needs a login');
	const offer = { sdp: { type: 'offer', sdp: 'v=0 '.repeat(200) } };
	w0 = W();
	const sp = await al('msurv-signal-put', { id, to: { bob: [[1001, offer], [1002, { c: { candidate: 'x' } }]], carl: [[1003, offer]] } });
	A(sp.status === 200 && row('msurvsig:' + id + ':al_ce') && writes.slice(w0).join() === 'msurvsig:' + id + ':al_ce', 'the host puts its signals: ONE row, its own (msurvsig:<id>:<from>)');
	const bp = await bob('msurv-signal-poll', { id, since: {} });
	A(bp.status === 200 && bp.body.msgs.al_ce && bp.body.msgs.al_ce.length === 2 && bp.body.msgs.al_ce[0][1].sdp.type === 'offer' && !bp.body.msgs.carl,
		'a guest reads only the signals addressed to it', JSON.stringify(bp.body).slice(0, 200));
	const bp2 = await bob('msurv-signal-poll', { id, since: { al_ce: 1001 } });
	A(bp2.body.msgs.al_ce.length === 1 && bp2.body.msgs.al_ce[0][0] === 1002, '...newer than `since`');
	const big = await al('msurv-signal-put', { id, to: { bob: [[1, { sdp: { type: 'offer', sdp: 'x'.repeat(25_000) } }]] } });
	A(big.status === 413, 'an oversized signal row is refused (413)', JSON.stringify(big.body));
	const many = await al('msurv-signal-put', { id, to: { bob: Array.from({ length: 49 }, (_, i) => [i + 1, { c: {} }]) } });
	A(many.status === 400, 'more than 48 signals to one peer are refused (400)');
	A((await al('msurv-signal-put', { id, to: { eve: [[1, offer]] } })).status === 403, 'signals can only be addressed to members (403)');
	A((await al('msurv-signal-put', { id, to: { bob: [['x', offer]] } })).status === 400, 'a malformed signal is refused (400)');
	A(row('msurvsig:' + id + ':al_ce').to.bob.length === 2, 'a refused put leaves the stored window as it was');
	// another lobby's signals are invisible
	const c2 = await alx('msurv-lobby-create', { dex: 1 });
	const id2 = c2.body.lobby.id;
	await eve('msurv-lobby-join', { id: id2, dex: 1 });
	await eve('msurv-signal-put', { id: id2, to: { alxce: [[7, offer]] } });
	const cross = await eve('msurv-signal-poll', { id, since: {} });
	A(cross.status === 403 && cross.body.closed, 'a member of another lobby cannot read this lobby\'s signals (403)');
	const cross2 = await bob('msurv-signal-poll', { id: id2, since: {} });
	A(cross2.status === 403, '...nor can this lobby\'s members read the other\'s');
	const cross3 = await eve('msurv-signal-put', { id, to: { bob: [[1, offer]] } });
	A(cross3.status === 403 && !row('msurvsig:' + id + ':eve'), 'nor write into it');
	const al2 = await al('msurv-signal-poll', { id: id2, since: {} });
	A(al2.status === 403, 'even the host of one lobby cannot read another lobby (403)');

	// ===== 5. relay =====
	w0 = W();
	const rp = await bob('msurv-relay-push', { id, to: { al_ce: [[5001, { k: 'f', p: [1, 2, 3] }]] }, ack: {}, since: {} });
	A(rp.status === 200 && writes.slice(w0).filter(k => !k.startsWith('msurvrelaybudget:al_ce:')).join() === 'msurvrelay:' + id + ':bob', 'a relay push writes ONE row, the sender\'s own (+ the host\'s relay-minute row once a minute)', writes.slice(w0).join(','));
	const fast = await bob('msurv-relay-push', { id, to: { al_ce: [[5002, { k: 'f' }]] }, ack: {}, since: {} });
	A(fast.status === 429 && fast.body.wait > 0 && row('msurvrelay:' + id + ':bob').to.al_ce.length === 1, 'a second push within 1000 ms is refused (429): ≤ 1 relay write a second per sender', JSON.stringify(fast.body));
	const ap = await al('msurv-relay-pull', { since: {}, id });
	A(ap.status === 200 && ap.body.msgs.bob && ap.body.msgs.bob[0][1].k === 'f' && ap.body.age.bob >= 0, 'the host pulls the guest\'s relayed message', JSON.stringify(ap.body));
	A(!(await carl('msurv-relay-pull', { since: {}, id })).body.msgs.bob, 'a message to the host is not readable by another guest');
	tick(1100);
	await al('msurv-relay-push', { id, to: { bob: [[9001, { k: 'f', t: 1 }]] }, ack: { bob: 5001 }, since: { bob: 5001 } });
	const bpull = await bob('msurv-relay-pull', { since: {}, id });
	A(bpull.body.acks.al_ce === 5001 && bpull.body.msgs.al_ce[0][0] === 9001, 'acks come back to the sender (it drops what was received)', JSON.stringify(bpull.body));
	tick(1100);
	A((await bob('msurv-relay-push', { id, to: { al_ce: [[6000, { pad: 'x'.repeat(16_100) }]] } })).status === 413, 'a relayed message over 16 KB is refused (413)');
	tick(1100);
	A((await bob('msurv-relay-push', { id, to: { al_ce: Array.from({ length: 31 }, (_, i) => [6000 + i, { k: 'f' }]) } })).status === 400, 'more than 30 unacknowledged messages to one peer are refused (400)');
	tick(1100);
	const bigRow = await al('msurv-relay-push', { id, to: Object.fromEntries(['bob', 'carl', 'dora'].map(n => [n, Array.from({ length: 2 }, (_, i) => [7000 + i, { pad: 'y'.repeat(12_000) }])])) });
	A(bigRow.status === 413 && /window/.test(bigRow.body.error), 'a sender\'s whole relay row over 64 KB is refused (413)', JSON.stringify(bigRow.body));
	tick(1100);
	A((await bob('msurv-relay-push', { id, to: { eve: [[1, {}]] } })).status === 403, 'relay messages only go to members (403)');
	A((await eve('msurv-relay-pull', { since: {}, id })).status === 403 && !row('msurvrelay:' + id + ':eve'), 'a non-member cannot relay in this lobby');
	// a stale row (its sender's tab is gone) is ignored
	{ const r = row('msurvrelay:' + id + ':bob'); r.ts = NOW() - 31_000; setRow('msurvrelay:' + id + ':bob', r); }
	const stale = await al('msurv-relay-pull', { since: {}, id });
	A(!stale.body.msgs.bob && stale.body.age.bob === undefined, 'a relay row older than 30 s is ignored (its sender is gone)', JSON.stringify(stale.body));
	// the per-account rate limit (15 per 10 s) on top of the per-row floor
	let limited = 0;
	for (let i = 0; i < 20; i++) if ((await dora('msurv-relay-pull', { since: {}, id })).status === 429) limited++;
	A(limited >= 4, 'relay polls are rate-limited per account (429 past 15 in 10 s)', 'limited ' + limited);

	// ===== reopen after a run =====
	const ro = await al('msurv-lobby-update', { id, open: true });
	A(ro.status === 200 && ro.body.lobby.open && !ro.body.lobby.start && ro.body.lobby.members.filter(m => m.name !== 'al_ce').every(m => !m.ready), 'after the run the host reopens the lobby: start cleared, guests not ready');

	// ===== leaving =====
	await dora('msurv-signal-put', { id, to: { al_ce: [[1, offer]] } });
	tick(1100);
	await dora('msurv-relay-push', { id, to: { al_ce: [[1, { k: 'f' }]] } }).catch(() => {});
	w0 = W();
	const dl = await dora('msurv-lobby-leave', { id });
	A(dl.status === 200 && !row('msurvlobby:' + id).members.some(m => m.name === 'dora') && !row('msurvsig:' + id + ':dora'), 'a guest who leaves is removed, with their signalling / relay rows');
	A(writes.slice(w0).every(k => [ 'msurvlobby:' + id, 'msurvsig:' + id + ':dora', 'msurvrelay:' + id + ':dora'].includes(k)), 'leaving touches only exact keys of that guest', writes.slice(w0).join(','));

	// ===== 2. lifetimes =====
	// a waiting guest who stopped polling is dropped on the next change
	{ const lb = row('msurvlobby:' + id); lb.members.find(m => m.name === 'carl').seen = NOW() - 46_000; setRow('msurvlobby:' + id, lb); }
	await bob('msurv-lobby-update', { id, ready: true });
	A(!row('msurvlobby:' + id).members.some(m => m.name === 'carl'), 'a waiting guest silent for 45 s is dropped from the lobby');
	A((await carl('msurv-lobby-poll', { id })).body.removed, '...and their poll says so');
	// an invite older than 3 minutes is gone
	await al('msurv-invite', { id, to: 'frank' });
	{ const r = row('msurvinv:frank:al_ce'); r.at = NOW() - 3 * 60_000 - 1000; setRow('msurvinv:frank:al_ce', r); }
	const fi = await frank('msurv-invites', { quiet: 1 });
	A(fi.body.invites.length === 0 && !row('msurvinv:frank:al_ce'), 'an invite expires after 3 minutes (and its row is deleted)');
	// the host stopped polling: a waiting lobby is closed after 60 s
	await al('msurv-invite', { id, to: 'carl' });
	{ const lb = row('msurvlobby:' + id); lb.members.find(m => m.name === 'al_ce').seen = NOW() - 61_000; setRow('msurvlobby:' + id, lb); }
	A((await bob('msurv-lobby-poll', { id })).body.closed, 'a waiting lobby whose host stopped polling for 60 s is closed (TTL)');
	A((await frank('msurv-lobby-join', { id, dex: 1 })).status === 404, '...nobody can join it');
	A((await carl('msurv-invites', { quiet: 1 })).body.invites.length === 0, '...and its invites are not shown');
	A((await bob('msurv-relay-pull', { since: {}, id })).body.closed, '...and its relay is closed');
	{ const lb = row('msurvlobby:' + id); lb.members.find(m => m.name === 'al_ce').seen = NOW(); setRow('msurvlobby:' + id, lb); }
	// a started lobby lives longer (the host keeps it alive every ~2 min in a run)
	{ const lb = row('msurvlobby:' + id); lb.start = { seed: 1, at: NOW(), members: [] }; lb.members.find(m => m.name === 'al_ce').seen = NOW() - 5 * 60_000; setRow('msurvlobby:' + id, lb); }
	A(!(await bob('msurv-lobby-poll', { id })).body.closed, 'a STARTED lobby survives 5 min without a host poll');
	{ const lb = row('msurvlobby:' + id); lb.members.find(m => m.name === 'al_ce').seen = NOW() - 11 * 60_000; setRow('msurvlobby:' + id, lb); }
	A((await bob('msurv-lobby-poll', { id })).body.closed, '...but not 11 min');
	{ const lb = row('msurvlobby:' + id); lb.start = null; lb.members.find(m => m.name === 'al_ce').seen = NOW(); setRow('msurvlobby:' + id, lb); }

	// the host leaving deletes everything of the lobby (exact keys)
	tick(1100);
	await bob('msurv-relay-push', { id, to: { al_ce: [[8000, { k: 'f' }]] } });
	await bob('msurv-signal-put', { id, to: { al_ce: [[8000, offer]] } });
	await al('msurv-invite', { id, to: 'frank' });
	A(!!row('msurvinv:frank:al_ce') && !!row('msurvsig:' + id + ':bob') && !!row('msurvrelay:' + id + ':bob'), 'set-up: rows exist before the host leaves', JSON.stringify([!!row('msurvinv:frank:al_ce'), !!row('msurvsig:' + id + ':bob'), !!row('msurvrelay:' + id + ':bob')]));
	w0 = W();
	const hl = await al('msurv-lobby-leave', { id });
	A(hl.body.closed && !row('msurvlobby:' + id) && !keys('msurvsig:' + id).length && !keys('msurvrelay:' + id).length && !row('msurvinv:frank:al_ce'),
		'the host leaving deletes the lobby, every member\'s signalling / relay row and its invites', keys('msurv').filter(k => !k.startsWith('msurvrelaybudget:')).join(','));
	A(writes.slice(w0).every(k => k.endsWith(id) || k.includes(':' + id + ':') || k === 'msurvinv:frank:al_ce' || k === 'msurvinv:carl:al_ce' || k === 'msurvinv:bob:al_ce'), 'exact keys only, all of this lobby', writes.slice(w0).join(','));
	A(!!keys('msurvrelaybudget:al_ce:').length, '...the host\'s relay minutes of the day are kept (they are per host, not per lobby)');
	A(!!row('msurvlobby:' + id2) && !!row('msurvsig:' + id2 + ':eve'), 'the other lobby is untouched');
	A((await bob('msurv-lobby-poll', { id })).body.closed, 'the guests learn the lobby is closed');

	// ===== 6. the relay's daily minutes per host (owner 2026-10-18: "slow relay + time cap") =====
	{
		const day = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
		const BK = host => 'msurvrelaybudget:' + host + ':' + day(VT);
		// a fresh, started lobby of al_ce's with bob and frank; the clock at the start of a minute
		VT = (Math.floor(VT / 60_000) + 1) * 60_000 + 1000;
		const L = (await al('msurv-lobby-create', { dex: 6 })).body.lobby.id;
		for (const g of [bob, frank]) { await g('msurv-lobby-join', { id: L, dex: 1 }); await g('msurv-lobby-update', { id: L, ready: true }); }
		await al('msurv-lobby-update', { id: L, start: { seed: 1 } });
		const fresh = () => { const lb = row('msurvlobby:' + L); for (const m of lb.members) m.seen = VT; sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(lb), 'msurvlobby:' + L); };
		sqlite.prepare('DELETE FROM mp_store WHERE key LIKE ?').run('msurvrelaybudget:al_ce:%');   // (the earlier sections' relay minutes: start from 0)
		const push = (who, extra = {}) => who('msurv-relay-push', { id: L, to: {}, ack: {}, since: {}, ...extra });
		const used = () => (row(BK('al_ce')) || {}).used || 0;
		A((await push(bob)).status === 200 && used() === 1 && row(BK('al_ce')).last === Math.floor(VT / 60_000), 'the first relay write of a minute counts it: msurvrelaybudget:<host>:<YYYYMMDD> used 1');
		tick(1100); await push(al); tick(1100); await push(frank);
		A(used() === 1, 'more relay writes in the SAME minute (by anyone in the lobby) do not count again');
		const pl0 = (await al('msurv-lobby-poll', { id: L })).body;
		A(pl0.relayLeft === 29, 'the lobby poll says the minutes left today (29)', JSON.stringify(pl0.relayLeft));
		// minute by minute up to the cap: the users rotate so the per-account limit (real time) is never the one hit
		const who = [al, bob, frank];
		let ok = true;
		for (let i = 2; i <= 30; i++) { await sleep(450); tick(60_000); fresh(); const r = await push(who[i % 3]); if (r.status !== 200) { ok = false; console.log('   minute', i, r.status, JSON.stringify(r.body)); break; } }
		A(ok && used() === 30, 'each minute with a relay write counts once: 30 minutes used', 'used ' + used());
		await sleep(1500); tick(20_000);
		A((await push(bob)).status === 200, 'the 30th minute itself runs to its end');
		tick(60_000); fresh();
		let w0b = W();
		const cut = await push(frank);
		A(cut.status === 403 && cut.body.budget && /used up/.test(cut.body.error) && cut.body.max === 30 && used() === 30 && W() === w0b,
			'past 30 minutes the relay push is refused (403 {budget}) and NOTHING is written', JSON.stringify(cut));
		const cutPull = await bob('msurv-relay-pull', { id: L, since: {} });
		A(cutPull.status === 403 && cutPull.body.budget, '...and so is the pull (the relay stops for this host today)', JSON.stringify(cutPull.body));
		const pl1 = (await al('msurv-lobby-poll', { id: L })).body;
		A(pl1.relayLeft === 0 && !pl1.closed, 'the lobby itself goes on, and says 0 minutes left', JSON.stringify(pl1));
		// direct play is not affected: lobby, signalling (the WebRTC negotiation) all still work
		const sig = await bob('msurv-signal-put', { id: L, to: { al_ce: [[1, { c: {} }]] } });
		const sigp = await al('msurv-signal-poll', { id: L, since: {} });
		const upd = await bob('msurv-lobby-update', { id: L, dex: 4 });
		A(sig.status === 200 && sigp.status === 200 && sigp.body.msgs.bob && upd.status === 200, 'direct play is unaffected: signalling and the lobby still work');
		// ...across ALL of the host's lobbies
		await al('msurv-lobby-update', { id: L, open: true });
		const L2 = (await al('msurv-lobby-create', { dex: 6 })).body.lobby.id;
		await bob('msurv-lobby-join', { id: L2, dex: 1 });
		A((await bob('msurv-relay-pull', { id: L2, since: {} })).status === 403, 'a new lobby of the same host is out of relay minutes too (per host, not per lobby)');
		// per host: another host's lobby still relays
		const e2 = await eve('msurv-relay-push', { id: id2, to: {}, ack: {}, since: {} });
		{ const lb = row('msurvlobby:' + id2); for (const m of lb.members) m.seen = VT; sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(lb), 'msurvlobby:' + id2); }
		const e3 = await eve('msurv-relay-push', { id: id2, to: {}, ack: {}, since: {} });
		A(e3.status === 200 && (row(BK('alxce')) || {}).used === 1, 'another host\'s lobby still relays (its own budget: 1 minute used)', JSON.stringify([e2.status, e3.status, e3.body]));
		// per day: the next UTC day starts again from 30
		const next = (Math.floor(VT / 86_400_000) + 1) * 86_400_000 + 5000;
		VT = next;
		{ const lb = row('msurvlobby:' + L2); for (const m of lb.members) m.seen = VT; sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(lb), 'msurvlobby:' + L2); }
		await sleep(1500);
		const nd = await bob('msurv-relay-push', { id: L2, to: {}, ack: {}, since: {} });
		A(nd.status === 200 && (row(BK('al_ce')) || {}).used === 1 && nd.body.relayLeft === 29, 'the next UTC day the host has 30 minutes again (a new row per day)', JSON.stringify([nd.status, row(BK('al_ce'))]));
		const keysB = keys('msurvrelaybudget:al_ce:').filter(k => k.startsWith('msurvrelaybudget:al_ce:'));   // (LIKE's _ also matches alxce)
		A(keysB.length === 2 && keysB.every(k => /^msurvrelaybudget:al_ce:\d{8}$/.test(k)), 'one exact row per host per day', keysB.join(','));
	}

	// ===== static: GC + rate limits =====
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/\['msurvsig:', 1 \* HR\], \['msurvrelay:', 1 \* HR\], \['msurvinv:', 1 \* HR\], \['msurvlobby:', 12 \* HR\]/.test(sv), 'every msurv* prefix is swept by the GC');
	A(/'msurv-relay-push': \[15, 10_000\]/.test(sv) && /MSURV_RELAY_MIN_MS = \+process\.env\.MSURV_RELAY_MIN_MS \|\| 1000/.test(sv) && /const MSURV_RELAY_DAILY_MIN = 30;/.test(sv),
		'the relay\'s limits: 15 per 10 s per account, ≥ 1000 ms between one sender\'s writes, 30 minutes a day per host (a constant)');
	A(/\['msurvrelaybudget:', 48 \* HR\]/.test(sv), 'the relay budget rows are swept after 2 days');
	A(sv.indexOf("action.startsWith('msurv-')") > sv.indexOf("return json({ error: 'not logged in' }, 401)"), 'the msurv-* actions are all behind the login gate');
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
