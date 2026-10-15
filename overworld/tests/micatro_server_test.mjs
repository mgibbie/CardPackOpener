// micatro_server_test.mjs — Micatro (/micatro/, the poker roguelike) on the site's
// account backend: live broadcasting, friend spectating, chat rooms, the score
// board, and every place a live friend is listed/routed.
//   1. the REAL handler (server/mp.mjs bundled like the dev server) over sqlite:
//      publish-micatro → micatro-state (friend ok / non-friend 403 / cap full /
//      unchanged delta / keep-alive skips the row write / stale + over), presence,
//      live-friends kind:'micatro', chat permissions, a snapshot size cap
//   2. run-score / run-leaderboard accept mode 'micatro', rank by best hand score,
//      clamp Infinity to a finite number, refuse NaN — and the W/L boards still work
//   3. micatro/js/net.js end-to-end against the same handler: the publisher bumps
//      seq only on a changed view and keep-alives carry no snapshot; spectate gets
//      the view, eases off when unchanged, and sees the final over/won push
//   4. routing (site/livewatch.js) + its callers, GC/rate-limit registration, the
//      Celadon Game Corner arcade cabinet and the landing tile
//
//   node overworld/tests/micatro_server_test.mjs
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

// ---------- a D1 stand-in that counts row writes ----------
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
			async run() { if (/^\s*INSERT/i.test(sql)) writes.push(String(bound[0])); return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const putRow = (k, v) => sqlite.prepare('UPDATE mp_store SET value = ? WHERE key = ?').run(JSON.stringify(v), k);

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: typeof body === 'string' ? body : JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const call = async (action, body, token) => (await raw(action, body, token)).body;

const tokens = {};
const reg = async (name) => { const r = await call('register', { username: name, password: 'micatro-pass-1' }); tokens[name] = r.token; return r.token; };

try {
	// alice runs; bob + viewers v1..v10 are her friends; carl is not
	for (const n of ['alice', 'bob', 'carl']) await reg(n);
	A(tokens.alice && tokens.bob && tokens.carl, 'test accounts register');
	await call('add-friend', { username: 'alice' }, tokens.bob);

	// ===== 1. publish → spectate =====
	const p1 = await raw('publish-micatro', { snapshot: { ante: 1, hand: ['AS', 'KD'] }, label: 'Ante 1 · Small Blind', seq: 100 }, tokens.alice);
	A(p1.status === 200 && p1.body.ok && p1.body.wrote === true, 'publish-micatro accepts a snapshot', JSON.stringify(p1));
	const ms = row('micatrostate:alice');
	A(ms && ms.seq === 100 && ms.label === 'Ante 1 · Small Blind' && ms.snapshot?.ante === 1 && ms.room === 'u:alice' && ms.over === false && ms.won === false && typeof ms.ts === 'number' && Array.isArray(ms.watcherNames),
		'the micatrostate:<user> row holds snapshot/label/seq/ts/over/won/watchers', JSON.stringify(ms));
	const pr = row('presence:alice');
	A(pr && pr.status === 'micatro:Ante 1 · Small Blind' && pr.region === 'Ante 1 · Small Blind', "presence says 'micatro:<label>'", JSON.stringify(pr));

	const s1 = await raw('micatro-state', { username: 'alice' }, tokens.bob);
	A(s1.status === 200 && s1.body.seq === 100 && s1.body.snapshot?.hand?.[0] === 'AS' && s1.body.room === 'u:alice', 'a friend reads the live snapshot', JSON.stringify(s1.body).slice(0, 200));
	A(s1.body.watchers === 1 && s1.body.watcherNames.includes('bob'), 'the reader is counted as a watcher', JSON.stringify(s1.body.watcherNames));
	A(typeof row('spec:alice:bob') === 'number', 'a spectator heartbeats spec:<runner>:<viewer>');
	const s2 = await raw('micatro-state', { username: 'alice', seq: 100 }, tokens.bob);
	A(s2.body.unchanged === true && !('snapshot' in s2.body) && s2.body.seq === 100 && s2.body.over === false && s2.body.label === 'Ante 1 · Small Blind', 'same seq → {unchanged:true} without the snapshot', JSON.stringify(s2.body));
	let w0 = writes.length;
	await raw('micatro-state', { username: 'alice', seq: 100 }, tokens.bob);
	A(writes.length === w0, 'a 1s re-poll does not rewrite the heartbeat row (throttled)', writes.slice(w0).join(','));
	const c1 = await raw('micatro-state', { username: 'alice' }, tokens.carl);
	A(c1.status === 403 && !c1.body.snapshot, 'a non-friend is refused (403)', JSON.stringify(c1));
	const self = await raw('micatro-state', { username: 'nobody_here' }, tokens.bob);
	A(self.status === 403, 'reading a non-friend name is refused');

	// keep-alive: same seq, no snapshot
	const k1 = await call('publish-micatro', { label: 'Ante 1 · Small Blind', seq: 100 }, tokens.alice);
	A(k1.ok && k1.wrote === true && k1.watchers === 1 && k1.watcherNames[0] === 'bob', 'the publisher hears who is watching (watcher list changed → row rewritten)', JSON.stringify(k1));
	A(row('micatrostate:alice').snapshot?.ante === 1, 'a snapshot-less keep-alive keeps the stored snapshot');
	w0 = writes.length;
	const k2 = await call('publish-micatro', { label: 'Ante 1 · Small Blind', seq: 100 }, tokens.alice);
	A(k2.ok && k2.wrote === false && writes.length === w0, 'an unchanged keep-alive writes NO rows (state + presence fresh)', writes.slice(w0).join(','));
	// an aging row is refreshed by the keep-alive so it never goes stale while live
	const aged = row('micatrostate:alice'); aged.ts -= 25_000; putRow('micatrostate:alice', aged);
	const k3 = await call('publish-micatro', { label: 'Ante 1 · Small Blind', seq: 100 }, tokens.alice);
	A(k3.wrote === true && Date.now() - row('micatrostate:alice').ts < 2000 && row('micatrostate:alice').snapshot?.ante === 1, 'a keep-alive refreshes an aging row (snapshot kept)');

	// a changed view → new seq → the spectator gets it
	await call('publish-micatro', { snapshot: { ante: 2 }, label: 'Ante 2 · Boss Blind', seq: 101 }, tokens.alice);
	const s3 = await call('micatro-state', { username: 'alice', seq: 100 }, tokens.bob);
	A(!s3.unchanged && s3.seq === 101 && s3.snapshot?.ante === 2 && s3.label === 'Ante 2 · Boss Blind', 'a new seq delivers the new view', JSON.stringify(s3).slice(0, 160));
	A(row('presence:alice').status === 'micatro:Ante 2 · Boss Blind', 'presence follows the label');

	// "Live now"
	const lf = await call('live-friends', {}, tokens.bob);
	const ent = (lf.live || []).find(e => e.username === 'alice');
	A(ent && ent.kind === 'micatro' && ent.mode === 'micatro' && ent.label === 'Ante 2 · Boss Blind' && typeof ent.watchers === 'number' && ent.full === false,
		"live-friends lists the run as {kind:'micatro', label, watchers, full}", JSON.stringify(lf));

	// chat: the runner's room + the spectator room behave exactly like card spectating
	const cp = async (room, who, extra = {}) => (await raw('chat-post', { room, text: 'hi from ' + who, ...extra }, tokens[who])).status;
	const cg = async (room, who) => (await raw('chat-get', { room }, tokens[who])).status;
	A(await cp('u:alice', 'alice') === 200, 'the runner posts in u:<runner>');
	A(await cg('u:alice', 'bob') === 200, 'a friend-spectator reads u:<runner>');
	A(await cp('u:alice', 'bob') === 403, 'a spectator cannot post in the runner room (read-only)');
	A(await cp('spec:alice', 'bob') === 200 && await cg('spec:alice', 'bob') === 200, 'a spectator chats in spec:<runner>');
	A(await cg('u:alice', 'carl') === 403 && await cg('spec:alice', 'carl') === 403 && await cp('spec:alice', 'carl') === 403, 'a non-friend can neither read nor post');
	A(await cg('spec:alice', 'alice') === 403, 'the runner cannot read the spectator-only room');

	// snapshot cap
	const big = await raw('publish-micatro', { snapshot: { blob: 'x'.repeat(210_000) }, label: 'x', seq: 102 }, tokens.alice);
	A(big.status === 413 && row('micatrostate:alice').seq === 101, 'an oversized snapshot is refused (413) and the live row kept', JSON.stringify(big.body));

	// the spectator cap: 10 watching → an 11th NEW viewer is turned away; a current one gets back in
	const viewers = [];
	for (let i = 1; i <= 9; i++) { const n = 'viewer' + i; viewers.push(n); await reg(n); await call('add-friend', { username: 'alice' }, tokens[n]); }
	await reg('viewer10'); await call('add-friend', { username: 'alice' }, tokens.viewer10);
	for (const n of viewers) await call('micatro-state', { username: 'alice' }, tokens[n]);
	const full = await raw('micatro-state', { username: 'alice' }, tokens.viewer10);
	A(full.status === 403 && full.body.full === true && full.body.max === 10, 'the 11th viewer gets 403 {full:true, max:10}', JSON.stringify(full));
	const back = await raw('micatro-state', { username: 'alice', seq: 101 }, tokens.bob);
	A(back.status === 200 && back.body.unchanged && back.body.watchers === 10, 'an existing watcher still gets in at the cap', JSON.stringify(back.body).slice(0, 120));
	await call('publish-micatro', { label: 'Ante 2 · Boss Blind', seq: 101 }, tokens.alice);
	const lfFull = (await call('live-friends', {}, tokens.bob)).live.find(e => e.username === 'alice');
	A(lfFull && lfFull.full === true && lfFull.watchers === 10, 'live-friends reports the run full', JSON.stringify(lfFull));

	// stale → not watchable
	const st = row('micatrostate:alice'); const realTs = st.ts; st.ts -= 60_000; putRow('micatrostate:alice', st);
	const stale = await call('micatro-state', { username: 'alice' }, tokens.bob);
	A(stale.snapshot === null && stale.live === false, 'a run that stopped publishing reads as not live', JSON.stringify(stale));
	A(!(await call('live-friends', {}, tokens.bob)).live.some(e => e.username === 'alice'), 'and drops out of live-friends');
	st.ts = realTs; putRow('micatrostate:alice', st);

	// the final push
	const fin = await call('publish-micatro', { label: 'Ante 8 · won', seq: 101, over: true, won: true }, tokens.alice);
	A(fin.ok && fin.wrote === true, 'the over:true push is written even with the same seq');
	const ov = await call('micatro-state', { username: 'alice', seq: 101 }, tokens.bob);
	A(ov.unchanged && ov.over === true && ov.won === true, 'a spectator on the current seq still sees over/won', JSON.stringify(ov));
	A(row('micatrostate:alice').snapshot?.ante === 2, 'the final row keeps the last view');
	A(row('presence:alice').status === '', 'a finished run drops presence back to plain online');
	A(!(await call('live-friends', {}, tokens.bob)).live.some(e => e.username === 'alice'), 'a finished run is not listed as live');
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 2. the score board =====
try {
	const sc = (who, body) => raw('run-score', { mode: 'micatro', ...body }, tokens[who]);
	const a1 = await sc('alice', { score: 125000, ante: 5, seed: 'ABCD1234', back: 'b_red', stake: 2, won: false });
	A(a1.status === 200 && a1.body.better === true && a1.body.rank === 1 && a1.body.best.score === 125000 && a1.body.best.ante === 5 && a1.body.best.seed === 'ABCD1234' && a1.body.best.back === 'b_red' && a1.body.best.stake === 2,
		'run-score accepts mode micatro with ante/seed/back/stake/won', JSON.stringify(a1.body));
	const a2 = await sc('alice', { score: 900, ante: 2 });
	A(a2.body.better === false && a2.body.best.score === 125000, 'a lower score does not replace the best');
	const b1 = await sc('bob', { score: 'Infinity', ante: 12, seed: 'ZZ', back: 'b_black', stake: 8, won: true });
	A(b1.body.better && b1.body.best.score === Number.MAX_VALUE && Number.isFinite(b1.body.best.score) && b1.body.rank === 1, 'Infinity is clamped to a finite Number.MAX_VALUE', JSON.stringify(b1.body));
	const nan = await sc('carl', { score: 'not a number' });
	const nul = await sc('carl', { score: null });
	A(nan.status === 400 && nul.status === 400, 'NaN / missing scores are refused (400)');
	const huge = await raw('run-score', `{"action":"run-score","mode":"micatro","score":1e400,"ante":9}`, tokens.carl);
	A(huge.status === 200 && huge.body.best.score === Number.MAX_VALUE, 'a raw JSON 1e400 (parses to Infinity) is clamped too', JSON.stringify(huge.body));
	const c2 = await sc('carl', { score: 3e20, ante: 9 });
	A(c2.body.better === false, 'nothing beats a clamped Infinity');
	const viewer = await sc('viewer1', { score: 125000, ante: 7 });
	const lb = await call('run-leaderboard', { mode: 'micatro' }, tokens.alice);
	const names = (lb.top || []).map(e => e.name);
	A(names[0] === 'bob' || names[0] === 'carl', 'the board ranks by score (higher first)', names.join(','));
	A(names.indexOf('viewer1') < names.indexOf('alice'), 'a score tie is broken by the higher ante', names.join(','));
	A(lb.you && lb.you.score === 125000 && lb.you.rank === names.indexOf('alice') + 1, "run-leaderboard returns the caller's best + rank", JSON.stringify(lb.you));
	const dl = await raw('run-score', { mode: 'duels', wins: 7, losses: 2, hero: 'Jaina' }, tokens.alice);
	const dlb = await call('run-leaderboard', { mode: 'duels' }, tokens.alice);
	A(dl.status === 200 && dlb.top[0]?.wins === 7 && dlb.top[0]?.losses === 2, 'the W/L run boards still work unchanged');
	A((await raw('run-score', { mode: 'micatrox', score: 5 }, tokens.alice)).status === 400, 'unknown modes are still refused');
} catch (e) {
	A(false, 'score harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 3. micatro/js/net.js against the real handler =====
try {
	// a localStorage + the two site modules net.js imports, served from the handler
	const store = new Map();
	globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
	const sent = [];
	let who = 'alice';
	globalThis.__MP = {
		hasToken: () => !!tokens[who],
		requireLogin: () => true,
		cachedState: () => ({ username: who }),
		call: async (action, payload = {}) => { sent.push({ who, action, payload }); return call(action, payload, tokens[who]); },
	};
	globalThis.__Chat = { mount() {}, unmount() {}, clear() {}, active: () => false };
	const src = fs.readFileSync(path.join(ROOT, 'micatro/js/net.js'), 'utf8')
		.replace("import * as MP from '/battlecards/mpmode.js';", 'const MP = globalThis.__MP;')
		.replace("import * as Chat from '/battlecards/chat.js';", 'const Chat = globalThis.__Chat;');
	A(/globalThis\.__MP/.test(src) && /globalThis\.__Chat/.test(src), 'net.js imports mpmode.js + chat.js (stubbed here)');
	const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'micatro-net-')), 'net.mjs');
	fs.writeFileSync(tmp, src);
	const Net = await import(pathToFileURL(tmp).href);
	A(Net.watchUrl('Bob Q') === '/micatro/?spectate=Bob%20Q', 'watchUrl(user) → /micatro/?spectate=<user>');

	// a fresh run for dana, watched by erin
	await reg('dana'); await reg('erin'); await call('add-friend', { username: 'dana' }, tokens.erin);
	who = 'dana';
	let view = { ante: 1, chips: 0 }, label = 'Ante 1';
	const watchersSeen = [];
	const pub = Net.startPublisher(() => view, () => label);
	pub.onWatchers((n, names) => watchersSeen.push([n, names.join(',')]));
	await sleep(300);
	const pubs = () => sent.filter(s => s.action === 'publish-micatro');
	A(pubs().length === 1 && pubs()[0].payload.snapshot?.ante === 1 && pubs()[0].payload.seq > 1e12, 'the publisher pushes the first view at once (seq seeded from the clock)', JSON.stringify(pubs()[0]?.payload));
	const seq0 = pubs()[0].payload.seq;
	await sleep(1400);
	A(pubs().length === 1, 'an unchanged view is not republished every tick');
	view = { ante: 1, chips: 300 };
	await sleep(1400);
	A(pubs().length === 2 && pubs()[1].payload.seq === seq0 + 1 && pubs()[1].payload.snapshot?.chips === 300, 'a changed view bumps seq by one and carries the snapshot', JSON.stringify(pubs()[1]?.payload));

	// erin spectates (switch the stub's identity per call)
	const statuses = [], snaps = [];
	const origCall = globalThis.__MP.call;
	globalThis.__MP.call = async (action, payload) => {
		if (action === 'micatro-state') { sent.push({ who: 'erin', action, payload }); return call(action, payload, tokens.erin); }
		return origCall(action, payload);
	};
	who = 'erin';
	const spec = Net.startSpectate('dana', { onSnapshot: (s, m) => snaps.push([s, m]), onStatus: (s, i) => statuses.push([s, i]) });
	who = 'dana';
	await sleep(400);
	A(snaps.length === 1 && snaps[0][0]?.chips === 300 && snaps[0][1].seq === seq0 + 1 && snaps[0][1].room === 'u:dana', 'startSpectate delivers the live view + meta', JSON.stringify(snaps[0]));
	A(statuses.map(s => s[0]).join(',').startsWith('connecting,live'), 'status: connecting → live', statuses.map(s => s[0]).join(','));
	await sleep(3200);
	const polls = sent.filter(s => s.action === 'micatro-state');
	A(polls.length >= 2 && polls.length <= 4 && polls.slice(1).every(p => p.payload.seq === seq0 + 1), 'unchanged polls send the known seq and ease off (~1s → 2.5s)', polls.length + ' polls');
	A(snaps.length === 1, 'an unchanged poll does not re-deliver the snapshot');
	// the publisher hears watchers on its next push (a changed view, or the ~10s keep-alive)
	view = { ante: 1, chips: 900 };
	await sleep(1400);
	A(watchersSeen.some(([n, names]) => n === 1 && names === 'erin'), 'onWatchers reports who is watching', JSON.stringify(watchersSeen));
	view = { ante: 2, chips: 0 }; label = 'Ante 2';
	await pub.finish({ won: true });
	const last = pubs()[pubs().length - 1].payload;
	A(last.over === true && last.won === true && last.snapshot?.ante === 2, 'finish({won}) sends one final over:true push with the last view', JSON.stringify(last));
	const nPub = pubs().length;
	await sleep(3000);
	A(pubs().length === nPub, 'the publisher stops after finish()');
	A(statuses.some(s => s[0] === 'over' && s[1].won === true) && snaps.some(s => s[0]?.ante === 2), 'the spectator gets the final view and an over status (won)', statuses.map(s => s[0]).join(','));
	const nPoll = sent.filter(s => s.action === 'micatro-state').length;
	await sleep(2800);
	A(sent.filter(s => s.action === 'micatro-state').length === nPoll, 'spectating stops polling once the run is over');
	spec.stop();

	// a non-friend spectator is told so and stops
	const st2 = [];
	globalThis.__MP.call = async (action, payload) => call(action, payload, tokens.carl);
	Net.startSpectate('dana', { onStatus: s => st2.push(s) });
	await sleep(300);
	A(st2.includes('forbidden'), 'a non-friend spectator gets status forbidden', st2.join(','));
	// scores through the client
	globalThis.__MP.call = async (action, payload) => { sent.push({ action, payload }); return call(action, payload, tokens.dana); };
	const r1 = await Net.submitScore({ score: Infinity, ante: 3, seed: 'S1', back: 'b_blue', stake: 1, won: false });
	A(r1.ok && r1.best.score === Number.MAX_VALUE && sent[sent.length - 1].payload.score === 'Infinity', 'submitScore sends Infinity as a string; the server clamps it', JSON.stringify(r1));
	const r2 = await Net.submitScore({ score: NaN });
	A(r2.error === 'bad score', 'submitScore refuses NaN locally');
	const r3 = await Net.submitScore({ score: 10n ** 30n, ante: 4 });
	A(r3.ok === true && r3.better === false, 'submitScore accepts a BigInt');
	const lb = await Net.fetchLeaderboard({ limit: 2 });
	A(lb.top.length === 2 && lb.you && lb.you.rank >= 1 && lb.me === 'dana', 'fetchLeaderboard returns top N + you', JSON.stringify(lb).slice(0, 200));
} catch (e) {
	A(false, 'net.js harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 4. routing, registration, launch points =====
{
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/\['micatrostate:', 6 \* HR\]/.test(sv.slice(sv.indexOf('const GC_TABLE'), sv.indexOf('const GC_TABLE') + 900)), "GC_TABLE sweeps 'micatrostate:' after 6h");
	const rl = sv.slice(sv.indexOf('const RATE_LIMITS'), sv.indexOf('const HIT_LIMIT'));
	A(/'publish-micatro': \[\d+, [\d_]+\]/.test(rl) && /'micatro-state': \[\d+, [\d_]+\]/.test(rl), 'publish-micatro + micatro-state are rate-limited');

	const LW = await import(pathToFileURL(path.join(ROOT, 'site/livewatch.js')).href);
	A(LW.watchHref({ username: 'amy', kind: 'micatro' }) === '/micatro/?spectate=amy', 'micatro → /micatro/?spectate=<user>');
	A(LW.watchHref({ username: 'amy', kind: 'factory' }) === '/overworld/?watchfactory=amy&mp=1', 'factory → the Overworld Frontier spectator (was misrouted to Battlecards)');
	A(LW.watchHref({ username: 'amy', kind: 'card' }) === '/battlecards/?spectate=amy&mp=1', 'card → Battlecards spectate');
	A(LW.watchHref({ username: 'amy', kind: 'pokemon', matchId: 'm 1' }) === '/overworld/?mp=1&watch=m%201' && LW.watchHref({ username: 'amy', kind: 'pokemon' }) === null, 'pokemon → the Overworld match (none without an id)');
	A(LW.watchHref({ username: 'amy', status: 'micatro:Ante 3' }) === '/micatro/?spectate=amy', 'a presence row routes by its status');
	const act = LW.activityFromStatus('micatro:Ante 3', 'Ante 3 · Boss');
	A(act.live && act.kind === 'micatro' && act.label === 'Ante 3 · Boss', 'activityFromStatus understands micatro:');
	A(LW.micatroActivityLabel('Ante 3') === 'Playing Micatro — Ante 3' && LW.micatroActivityLabel('') === 'Playing Micatro', 'the friend activity label reads "Playing Micatro — Ante 3"');

	const hub = fs.readFileSync(path.join(ROOT, 'battlecards/start.html'), 'utf8');
	const live = hub.slice(hub.indexOf('async function refreshLive'), hub.indexOf('refreshLive();'));
	A(/import \{[^}]*watchHref[^}]*\} from '\/site\/livewatch\.js'/.test(hub) && /watchHref\(f\)/.test(live) && !/index\.html\?spectate=/.test(live), 'the Live now hub routes Watch through watchHref (no hard-coded Battlecards fallback)');
	const tb = fs.readFileSync(path.join(ROOT, 'site/topbar.js'), 'utf8');
	const wf = tb.slice(tb.indexOf('function watchFriend'), tb.indexOf('function watchFriend') + 600);
	A(/watchHref\(/.test(wf) && /startsWith\('micatro:'\)/.test(tb) && /micatroActivityLabel/.test(tb), 'the top bar lists + routes micatro friends');
	A(/\/micatro'\)\) return q\.has\('spectate'\) \? 'micatro:spectate' : 'micatro'/.test(tb), 'the analytics label knows /micatro/');
	const scr = fs.readFileSync(path.join(ROOT, 'overworld/ow_screens.js'), 'utf8');
	const blk = scr.slice(scr.indexOf("startsWith('micatro:')"), scr.indexOf("startsWith('micatro:')") + 500);
	A(blk.length > 50 && /watchHref\(\{ username: f\.username, kind: 'micatro' \}\)/.test(blk) && /saveParty\(S\.party\); savePos\(\)/.test(blk), 'the Overworld friends menu offers to watch a micatro friend (saving first)');

	// the arcade cabinet
	const arc = fs.readFileSync(path.join(ROOT, 'overworld/arcade.js'), 'utf8');
	const m = arc.match(/MAP_CELADON_CITY_GAME_CORNER: \{ kind: 'micatro', tx: (\d+), ty: (\d+) \}/);
	A(!!m, 'the Celadon Game Corner has a micatro arcade box');
	A(/micatro: \{ img: 'micatrobox', src: 'fx\/micatrobox\.png', w: 20 \}/.test(arc), 'the micatro box draws its own cabinet sprite');
	const png = fs.readFileSync(path.join(ROOT, 'overworld/fx/micatrobox.png'));
	A(png.readUInt32BE(16) === 20 && png.readUInt32BE(20) === 32, 'fx/micatrobox.png is 20x32 (git-tracked, not in overworld/data)');
	const inp = fs.readFileSync(path.join(ROOT, 'overworld/ow_input.js'), 'utf8');
	const ib = inp.slice(inp.indexOf("arc === 'micatro'"), inp.indexOf("arc === 'micatro'") + 300);
	A(/MICATRO cabinet/.test(ib) && /saveParty\(S\.party\); savePos\(\); location\.href = '\/micatro\/\?direct=1'/.test(ib), 'interacting saves party + position, then launches /micatro/?direct=1');
	const mapF = path.join(ROOT, 'overworld/data/maps/CeladonCity_GameCorner_map.json');
	if (m && fs.existsSync(mapF)) {
		const tx = +m[1], ty = +m[2];
		const map = JSON.parse(fs.readFileSync(mapF, 'utf8'));
		const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/layouts', map.layout + '.json'), 'utf8'));
		const coll = (x, y) => (lay.map[y][x] & 0x0C00) !== 0;
		const used = [...map.object_events, ...map.warp_events, ...map.bg_events, ...(map.coord_events || [])];
		const on = (x, y) => used.some(e => e.x === x && e.y === y);
		A(map.id === 'MAP_CELADON_CITY_GAME_CORNER', 'the box map id is the real Game Corner');
		A(!coll(tx, ty) && !on(tx, ty), 'the cabinet base is open floor (no NPC/warp/sign/hidden item)');
		A(coll(tx, ty - 1), 'its top half stands on an already-solid tile (no new floor lost)');
		A(!coll(tx, ty + 1) && !on(tx, ty + 1), 'the play tile in front is walkable and free');
		A(!coll(tx - 1, ty + 1) && !coll(tx + 1, ty + 1), 'the aisle beside it stays open');
	} else console.log('skip - overworld/data not present: Game Corner tile checks');

	const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
	A(/<a class="tile" href="micatro\/">[^]*?Micatro <span class="arrow">→<\/span>[^]*?Friends can watch live\./.test(idx), 'the landing page has a Micatro tile');
	A(/michaelgibalerio\.com\/micatro\//.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'the sitemap lists /micatro/');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
