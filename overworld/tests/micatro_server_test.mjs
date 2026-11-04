// micatro_server_test.mjs — Micatro (/micatro/, the poker roguelike) on the site's
// account backend: live broadcasting, friend spectating, chat rooms, the score
// board, and every place a live friend is listed/routed.
//   1. the REAL handler (server/mp.mjs bundled like the dev server) over sqlite:
//      publish-micatro → micatro-state (friend ok / non-friend 403 / cap full /
//      unchanged delta / keep-alive skips the row write / stale + over), presence,
//      live-friends kind:'micatro', chat permissions, a snapshot size cap
//   2. run-score / run-leaderboard accept mode 'micatro', rank by best hand score,
//      clamp Infinity to a finite number, refuse NaN — and the W/L boards still work;
//      modded runs rank on their own board (mode 'micatro_modded', entries carry their mods)
//   3. micatro/js/net.js end-to-end against the same handler: the publisher bumps
//      seq only on a changed view and keep-alives carry no snapshot; spectate gets
//      the view, eases off when unchanged, and sees the final over/won push
//   4. routing (site/livewatch.js) + its callers, GC/rate-limit registration, the
//      Celadon Game Corner arcade cabinet and the landing tile
//   5. run replays (a WHOLE run's recipe, micatro/js/replays.js): micatro-replay-put needs an account,
//      validates the packed recipe (caps, shape, a zip bomb), stores exactly mreplay:<id> =
//      {code, meta (allow-listed), by, when}, extends YOUR replay in place; micatro-replay-get is
//      public (above the auth gate); run-score keeps a validated replay id on the board row; the
//      final publish carries it to spectators; GC + rate-limit registration; /mr/<id> short link
//
//   node overworld/tests/micatro_server_test.mjs
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Wait for a condition instead of a fixed sleep (real-time intervals jitter under load).
const until = async (cond, ms) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); };

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

	// modded runs: their own board (micatro_modded), each entry tagged with its mod list
	const m1 = await raw('run-score', { mode: 'micatro_modded', score: 9e9, ante: 6, back: 'b_red', stake: 1, mods: ['pokermon', 'Nacho_Dip', 'pokermon', 'bad mod!', 7] }, tokens.alice);
	A(m1.status === 200 && m1.body.better === true && m1.body.rank === 1 && m1.body.best.mods.join() === 'nacho_dip,pokermon', 'run-score accepts micatro_modded and stores the cleaned, sorted mod list', JSON.stringify(m1.body));
	const lbV = await call('run-leaderboard', { mode: 'micatro' }, tokens.alice);
	A(lbV.you && lbV.you.score === 125000 && !(lbV.top || []).some(e => e.score === 9e9 || e.mods), 'a modded score never lands on (or replaces the best of) the vanilla board', JSON.stringify(lbV.you));
	const lbM = await call('run-leaderboard', { mode: 'micatro_modded' }, tokens.alice);
	A(lbM.top.length === 1 && lbM.top[0].name === 'alice' && lbM.top[0].mods.join() === 'nacho_dip,pokermon' && lbM.you && lbM.you.score === 9e9 && lbM.you.rank === 1, 'run-leaderboard micatro_modded lists modded runs with their mods + your best', JSON.stringify(lbM));
	const m2 = await raw('run-score', { mode: 'micatro', score: 1e12, ante: 8, mods: ['pokermon'] }, tokens.bob);
	const lbM2 = await call('run-leaderboard', { mode: 'micatro_modded' }, tokens.bob);
	A(m2.status === 200 && lbM2.top[0].name === 'bob' && lbM2.top[0].mods.join() === 'pokermon', "a 'micatro' score that carries mods is filed on the modded board", JSON.stringify(lbM2.top));
	A((await raw('run-score', { mode: 'micatro_modded', score: 5, mods: [] }, tokens.carl)).status === 400, 'a modded score without mods is refused');
	const m3 = await raw('run-score', { mode: 'micatro_modded', score: 10, mods: ['pokermon'] }, tokens.alice);
	A(m3.body.better === false && m3.body.best.score === 9e9, 'one best per player on the modded board (a lower modded score does not replace it)');
	const lbV2 = await call('run-leaderboard', { mode: 'micatro' }, tokens.alice);
	A(lbV2.top.some(e => e.name === 'alice' && e.score === 125000 && !e.mods), 'existing vanilla rows are untouched (no mods field)', JSON.stringify(lbV2.top.find(e => e.name === 'alice')));

	// big-number scoring: a modded run's score past 1e308 arrives as text ("1.5e450"); the row keeps
	// it exactly (big) with a sortable key (exp, man) and ranks it above every plain number
	const md = (who, score, ante, mods = ['morefluff']) => raw('run-score', { mode: 'micatro_modded', score, ante, mods }, tokens[who]);
	const g1 = await md('viewer2', '1.5e450', 20);
	A(g1.status === 200 && g1.body.better === true && g1.body.rank === 1 && g1.body.best.big === '1.5e450' && g1.body.best.exp === 450 && g1.body.best.man === 1.5 && g1.body.best.score === Number.MAX_VALUE,
		'a big score is stored exactly (text + exponent/mantissa key; score clamped for old readers)', JSON.stringify(g1.body));
	await md('viewer3', '9.99e449', 30);
	// the scale tops out at 9.99e999: 1e1000 and above is naneinf (stored like Infinity), above every big score
	const g4 = await md('viewer4', '2e1000', 12, ['bunco']);
	A(g4.status === 200 && g4.body.best.score === Number.MAX_VALUE && !g4.body.best.big, 'an exponent >= 1000 is naneinf (clamped like Infinity, no big text)', JSON.stringify(g4.body.best));
	await md('viewer5', 'Infinity', 40, ['bunco']);
	const g5 = await md('viewer6', '1e1e+43', 50);
	A(g5.status === 200 && g5.body.best.score === Number.MAX_VALUE && !g5.body.best.big, 'a huge exponent ("1e1e+43") is naneinf too', JSON.stringify(g5.body.best));
	await md('viewer10', '9.99e999', 1);
	const lbB = await call('run-leaderboard', { mode: 'micatro_modded' }, tokens.viewer2);
	const order = (lbB.top || []).map(e => e.name).join(',');
	A(order === 'viewer6,viewer5,viewer4,viewer10,viewer2,viewer3,bob,alice', 'the board ranks naneinf (ties by ante) above 9.99e999, big scores by exponent then mantissa, then plain ones', order);
	A(lbB.you && lbB.you.big === '1.5e450' && lbB.you.rank === 5, "run-leaderboard returns the caller's big best + rank", JSON.stringify(lbB.you));
	A((await md('viewer2', '1.4e450', 21)).body.better === false && (await md('viewer2', 5e300, 22)).body.better === false, 'a smaller big score / a plain score does not beat a big best');
	const g7 = await md('viewer2', '1.6e450', 23);
	A(g7.body.better === true && g7.body.best.big === '1.6e450' && g7.body.rank === 5, 'a larger mantissa at the same exponent is better', JSON.stringify(g7.body));
	const g8 = await md('viewer7', '1.5e300', 9);
	A(g8.status === 200 && g8.body.best.score === 1.5e300 && !('big' in g8.body.best), 'a score a double can hold stays a plain number (no big field)', JSON.stringify(g8.body.best));
	A((await md('viewer7', '1.5e45x', 9)).status === 400, 'a malformed score is still refused');
	const lbV3 = await call('run-leaderboard', { mode: 'micatro' }, tokens.alice);
	A(lbV3.top.every(e => !e.big) && lbV3.you && lbV3.you.score === 125000, 'the vanilla board is untouched by big scores');

	// CUSTOM DECKS (the deck editor): a custom-deck run is modded — the vanilla board stays pure and the
	// Modded board's row carries the deck's name
	const cd1 = await raw('run-score', { mode: 'micatro', score: 4242, ante: 3, back: 'b_red', stake: 1, customDeck: 'Goth\u0001 Deck' }, tokens.carl);
	A(cd1.status === 200 && cd1.body.best.customDeck === 'Goth  Deck' && Array.isArray(cd1.body.best.mods) && cd1.body.best.mods.length === 0, 'a custom-deck score (even sent as micatro) goes to the Modded board, tagged with the cleaned deck name', JSON.stringify(cd1.body));
	A(row('runboard:micatro_modded').some(e => e.name === 'carl' && e.customDeck === 'Goth  Deck') && !(row('runboard:micatro') || []).some(e => e.name === 'carl' && (e.score === 4242 || e.customDeck)), 'the Modded board lists it; the vanilla board does not');
	const lbC = await call('run-leaderboard', { mode: 'micatro_modded' }, tokens.carl);
	A(lbC.top.some(e => e.name === 'carl' && e.customDeck === 'Goth  Deck') && lbC.you && lbC.you.customDeck === 'Goth  Deck', 'run-leaderboard returns the custom deck name (the Modded tab shows "Custom deck: <name>")');
	const cd2 = await raw('run-score', { mode: 'micatro_modded', score: 9, customDeck: 'X'.repeat(80), mods: ['bunco'] }, tokens.viewer8);
	A(cd2.status === 200 && cd2.body.best.customDeck.length === 32 && cd2.body.best.mods.join() === 'bunco', 'the deck name is clipped to 32 and kept beside the mod list');
	A((await raw('run-score', { mode: 'micatro_modded', score: 5, customDeck: '   ' }, tokens.viewer9)).status === 400, 'a blank deck name is not a modded run');

	// saved custom decks: one row per player (micatrodecks:<user>), rev-guarded, capped
	const dg0 = await call('micatro-decks-get', {}, tokens.carl);
	A(dg0.rev === 0 && Array.isArray(dg0.decks) && dg0.decks.length === 0, 'micatro-decks-get: no decks yet (rev 0)', JSON.stringify(dg0));
	const w0 = writes.length;
	const dp1 = await raw('micatro-decks-put', { rev: 0, decks: [{ id: 'd1', def: { name: 'First', rules: { aces_are_faces: true } }, updated: 5 }] }, tokens.carl);
	A(dp1.status === 200 && dp1.body.ok && dp1.body.rev === 1 && dp1.body.count === 1, 'micatro-decks-put saves (rev 1)', JSON.stringify(dp1.body));
	const wrote = writes.slice(w0).filter(k => !k.startsWith('rl:') && k !== 'carl' && !k.startsWith('gc:'));
	A(wrote.length === 1 && wrote[0] === 'micatrodecks:carl', 'it writes exactly micatrodecks:<user> (plus its rate-limit counter)', JSON.stringify(writes.slice(w0)));
	const dg1 = await call('micatro-decks-get', {}, tokens.carl);
	A(dg1.rev === 1 && dg1.decks.length === 1 && dg1.decks[0].id === 'd1' && dg1.decks[0].def.name === 'First' && dg1.decks[0].updated === 5, 'micatro-decks-get returns them');
	A((await call('micatro-decks-get', {}, tokens.alice)).decks.length === 0, 'a player only sees their own decks');
	const stale = await raw('micatro-decks-put', { rev: 0, decks: [] }, tokens.carl);
	A(stale.status === 409 && stale.body.error === 'stale' && stale.body.rev === 1 && stale.body.decks.length === 1 && row('micatrodecks:carl').decks.length === 1, 'a stale rev is refused with the current row (a second device merges, never clobbers)', JSON.stringify(stale.body).slice(0, 120));
	A((await raw('micatro-decks-put', { rev: 1, decks: [{ id: 'bad id!', def: {} }] }, tokens.carl)).status === 400, 'a bad deck id is refused');
	A((await raw('micatro-decks-put', { rev: 1, decks: [{ id: 'a', def: {} }, { id: 'a', def: {} }] }, tokens.carl)).status === 400, 'duplicate ids are refused');
	A((await raw('micatro-decks-put', { rev: 1, decks: [{ id: 'a', def: [1, 2] }] }, tokens.carl)).status === 400, 'a non-object definition is refused');
	A((await raw('micatro-decks-put', { rev: 1, decks: Array.from({ length: 31 }, (_, i) => ({ id: 'x' + i, def: {} })) }, tokens.carl)).status === 400, 'more than 30 decks are refused');
	A((await raw('micatro-decks-put', { rev: 1, decks: [{ id: 'big', def: { name: 'x'.repeat(70000) } }] }, tokens.carl)).status === 413, 'an oversized deck is refused (413)');
	A((await raw('micatro-decks-put', { rev: 1, decks: 'nope' }, tokens.carl)).status === 400 && row('micatrodecks:carl').rev === 1, 'a malformed body is refused and the row is unchanged');
	const dp2 = await raw('micatro-decks-put', { rev: 1, decks: [] }, tokens.carl);
	A(dp2.status === 200 && dp2.body.rev === 2 && row('micatrodecks:carl').decks.length === 0, 'deleting every deck is a put of [] at the current rev');
	A((await raw('micatro-decks-get', {})).status === 401, 'deck actions need a login');
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
	const pubs = () => sent.filter(s => s.action === 'publish-micatro');
	await until(() => pubs().length >= 1, 3000);
	A(pubs().length === 1 && pubs()[0].payload.snapshot?.ante === 1 && pubs()[0].payload.seq > 1e12, 'the publisher pushes the first view at once (seq seeded from the clock)', JSON.stringify(pubs()[0]?.payload));
	const seq0 = pubs()[0].payload.seq;
	await sleep(1400);
	A(pubs().length === 1, 'an unchanged view is not republished every tick');
	view = { ante: 1, chips: 300 };
	await until(() => pubs().length >= 2, 4000);
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
	await until(() => snaps.length >= 1, 3000);
	A(snaps.length === 1 && snaps[0][0]?.chips === 300 && snaps[0][1].seq === seq0 + 1 && snaps[0][1].room === 'u:dana', 'startSpectate delivers the live view + meta', JSON.stringify(snaps[0]));
	A(statuses.map(s => s[0]).join(',').startsWith('connecting,live'), 'status: connecting → live', statuses.map(s => s[0]).join(','));
	await sleep(3200);
	const polls = sent.filter(s => s.action === 'micatro-state');
	A(polls.length >= 2 && polls.length <= 5 && polls.slice(1).every(p => p.payload.seq === seq0 + 1), 'unchanged polls send the known seq and ease off (~1s → 2.5s)', polls.length + ' polls');
	A(snaps.length === 1, 'an unchanged poll does not re-deliver the snapshot');
	// the publisher hears watchers on its next push (a changed view, or the ~10s keep-alive)
	view = { ante: 1, chips: 900 };
	await until(() => watchersSeen.some(([n, names]) => n === 1 && names === 'erin'), 5000);
	A(watchersSeen.some(([n, names]) => n === 1 && names === 'erin'), 'onWatchers reports who is watching', JSON.stringify(watchersSeen));
	view = { ante: 2, chips: 0 }; label = 'Ante 2';
	await pub.finish({ won: true });
	const last = pubs()[pubs().length - 1].payload;
	A(last.over === true && last.won === true && last.snapshot?.ante === 2, 'finish({won}) sends one final over:true push with the last view', JSON.stringify(last));
	const nPub = pubs().length;
	await sleep(3000);
	await until(() => statuses.some(s => s[0] === 'over'), 4000);
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
	await until(() => st2.includes('forbidden'), 3000);
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
	// a modded run through the client: its own board, mods sorted + deduped
	const r4 = await Net.submitScore({ score: 777, ante: 2, mods: ['pokermon', 'nacho_dip', 'pokermon'] });
	A(r4.ok && sent[sent.length - 1].payload.mode === 'micatro_modded' && sent[sent.length - 1].payload.mods.join() === 'nacho_dip,pokermon' && r4.best.mods.join() === 'nacho_dip,pokermon', 'submitScore with mods posts to micatro_modded with the sorted mod list', JSON.stringify(sent[sent.length - 1].payload));
	const r5 = await Net.submitScore({ score: 1, ante: 1, mods: [] });
	A(r5.ok && sent[sent.length - 1].payload.mode === 'micatro' && !('mods' in sent[sent.length - 1].payload), 'submitScore with no mods stays on the vanilla board');
	const lbm = await Net.fetchLeaderboard({ modded: true });
	A(sent[sent.length - 1].payload.mode === 'micatro_modded' && lbm.top.some(e => e.name === 'dana' && e.mods && e.mods.join() === 'nacho_dip,pokermon') && lbm.you && lbm.you.score === 777, 'fetchLeaderboard({modded:true}) reads the Modded board', JSON.stringify(lbm).slice(0, 300));
	// big-number scoring: the engine's Decimal (or the view's "1.234e450" string) travels as text
	const r6 = await Net.submitScore({ score: { m: 1.234, e: 450, toJSON() { return '1.234e450'; } }, ante: 25, mods: ['morefluff'] });
	A(r6.ok && r6.better === true && sent[sent.length - 1].payload.score === '1.234e450' && r6.best.big === '1.234e450', 'submitScore sends a big (Decimal) score as its text', JSON.stringify(sent[sent.length - 1].payload));
	const r7 = await Net.submitScore({ score: '9.9e449', ante: 30, mods: ['morefluff'] });
	A(r7.ok && r7.better === false && sent[sent.length - 1].payload.score === '9.9e449', 'a big view string travels as text; a smaller big score is not better', JSON.stringify(r7));
	// a custom-deck run through the client: Modded board + the deck's name
	const r8 = await Net.submitScore({ score: 31337, ante: 5, back: 'b_red', mods: [], customDeck: 'Goth Deck' });
	A(r8.ok && sent[sent.length - 1].payload.mode === 'micatro_modded' && sent[sent.length - 1].payload.customDeck === 'Goth Deck' && !('mods' in sent[sent.length - 1].payload), 'submitScore({customDeck}) posts to micatro_modded with the deck name', JSON.stringify(sent[sent.length - 1].payload));
	// the deck editor's storage through the client: fetch, save, a stale save comes back as 'stale'
	const fd0 = await Net.fetchDecks();
	A(fd0.rev === 0 && fd0.decks.length === 0, 'fetchDecks: none yet', JSON.stringify(fd0));
	const sd1 = await Net.saveDecks([{ id: 'goth', def: { name: 'Goth Deck' }, updated: 1 }], 0);
	A(sd1.ok && sd1.rev === 1, 'saveDecks saves at rev 0 -> 1', JSON.stringify(sd1));
	const sd2 = await Net.saveDecks([], 0);
	A(sd2.error === 'stale' && sd2.rev === 1 && sd2.decks.length === 1, 'a stale saveDecks returns {error:stale, rev, decks}', JSON.stringify(sd2));
	const fd1 = await Net.fetchDecks();
	A(fd1.rev === 1 && fd1.decks[0].def.name === 'Goth Deck', 'fetchDecks returns the saved list');
	// run replays through the client: upload (signed in), extend in place, fetch (public), score row link
	const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
	globalThis.__MP.call = async (action, payload = {}) => { sent.push({ action, payload }); return call(action, payload, tokens.erin); }; // erin: no board row yet
	const rcp = { v: 1, seed: 'NETRP', back: 'b_red', stake: 1, mods: [], actions: [{ type: 'select_blind' }, { type: 'highlight', ids: [1] }] };
	const up1 = await Net.uploadReplay({ code: await RPm.packRecipe(rcp), meta: { score: 120, ante: 1 } });
	A(up1.ok && /^[a-f0-9]{8}$/.test(up1.id) && sent[sent.length - 1].action === 'micatro-replay-put', 'uploadReplay puts the packed recipe and returns its id', JSON.stringify(up1));
	const up2 = await Net.uploadReplay({ code: await RPm.packRecipe({ ...rcp, actions: [...rcp.actions, { type: 'play' }] }), meta: { score: 500, ante: 2 }, id: up1.id });
	A(up2.ok && up2.id === up1.id && sent[sent.length - 1].payload.id === up1.id, 'uploadReplay({id}) extends the same replay (win -> Endless)', JSON.stringify(up2));
	const sc = await Net.submitScore({ score: 99999999, ante: 9, mods: [], replay: up1.id });
	A(sc.ok && sent[sent.length - 1].payload.replay === up1.id && sc.best.replay === up1.id, 'submitScore({replay}) sends the id and the best row keeps it', JSON.stringify(sc.best));
	await Net.submitScore({ score: 1, ante: 1, replay: 'NOT-AN-ID' });
	A(!('replay' in sent[sent.length - 1].payload), 'submitScore drops a malformed replay id client-side');
	const realCall = globalThis.__MP.call, realHas = globalThis.__MP.hasToken;
	globalThis.__MP.call = async (action, payload = {}) => { sent.push({ action, payload }); return call(action, payload); }; // NO token
	globalThis.__MP.hasToken = () => false;
	const fr = await Net.fetchReplay(up1.id);
	const back = fr && fr.code ? await RPm.unpackRecipe(fr.code) : null;
	A(back && back.actions.length === 3 && fr.meta.score === 500 && fr.by === 'erin', 'fetchReplay works signed out and returns the extended run', JSON.stringify(fr).slice(0, 160));
	A((await Net.fetchReplay('zzz')).error === 'bad id' && (await Net.fetchReplay('abcdef0123')).error === 'not found', 'fetchReplay: a bad id / a missing replay come back as errors');
	A((await Net.uploadReplay({ code: 'G1.x' })).error === 'not logged in', 'uploadReplay needs an account');
	globalThis.__MP.call = realCall; globalThis.__MP.hasToken = realHas;
} catch (e) {
	A(false, 'net.js harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
}

// ===== 5. run replays (a whole run) =====
try {
	const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
	const recipe = { v: 1, seed: 'RPSEED', back: 'b_red', stake: 1, mods: ['pokermon'], modOptions: {}, actions: [{ type: 'select_blind' }, { type: 'highlight', ids: [3, 4] }, { type: 'play' }], started: 1 };
	const code = await RPm.packRecipe(recipe);
	const meta = { score: '1.234e450', handName: 'Flush', ante: 12, round: 30, won: true, endless: true, back: 'b_red', stake: 3, mods: ['pokermon', 'bad id!'], customDeck: 'Goth', seed: 'RPSEED', actions: 3, finalSeq: 77, checksum: 'A12R30$4#0badbeef', engineVersion: 1, evil: '<script>', username: 'mallory' };
	// put needs an account (it sits below the auth gate)
	const anon = await raw('micatro-replay-put', { code, meta });
	A(anon.status === 401, 'micatro-replay-put without a token is refused (401)', JSON.stringify(anon));
	let w0 = writes.length;
	const p1 = await raw('micatro-replay-put', { code, meta }, tokens.alice);
	const id = p1.body.id;
	A(p1.status === 200 && p1.body.ok && /^[a-f0-9]{8}$/.test(id), 'a signed-in player uploads a run replay -> an 8-hex id', JSON.stringify(p1.body));
	const rw = writes.slice(w0).filter(k => !k.startsWith('rl:') && !k.startsWith('gc:') && !k.startsWith('presence:'));
	A(rw.length === 1 && rw[0] === 'mreplay:' + id, 'the put writes exactly one row: mreplay:<id>', JSON.stringify(rw));
	const r1 = row('mreplay:' + id);
	A(r1 && Object.keys(r1).sort().join() === 'by,code,meta,when' && r1.code === code && r1.by === 'alice' && typeof r1.when === 'number', 'the row is exactly {code, meta, by, when}', JSON.stringify(Object.keys(r1 || {})));
	A(r1.meta.score === '1.234e450' && r1.meta.ante === 12 && r1.meta.won === true && r1.meta.endless === true && r1.meta.stake === 3 && r1.meta.checksum === 'A12R30$4#0badbeef' && r1.meta.customDeck === 'Goth', 'the meta keeps the run facts (big-number score as text)', JSON.stringify(r1.meta));
	A(!('evil' in r1.meta) && !('username' in r1.meta) && r1.meta.mods.join() === 'pokermon', 'the meta is allow-listed: unknown fields + bad mod ids dropped; the author comes from the token', JSON.stringify(r1.meta));
	// get is public: no token, IP-limited
	const g1 = await raw('micatro-replay-get', { id });
	A(g1.status === 200 && g1.body.code === code && g1.body.by === 'alice' && g1.body.meta.ante === 12, 'micatro-replay-get is public (no token) and returns {code, meta, by, when}', JSON.stringify(g1.body).slice(0, 120));
	A(JSON.stringify(await RPm.unpackRecipe(g1.body.code)) === JSON.stringify(recipe), 'the fetched code unpacks to the uploaded recipe');
	A((await raw('micatro-replay-get', { id: 'XYZ' })).status === 400 && (await raw('micatro-replay-get', { id: '../alice' })).status === 400, 'a malformed id is refused (400)');
	A((await raw('micatro-replay-get', { id: 'deadbeef00' })).status === 404, 'a missing replay is 404');
	A((await raw('micatro-replay-get', { id: 'deadbeef00' }, 'garbage-token')).status === 404, 'a bad token does not matter for the public read');
	// caps + shape validation
	const bad = async (body, tok = tokens.alice) => raw('micatro-replay-put', body, tok);
	A((await bad({ code: 'G1.' + 'A'.repeat(300_001) })).status === 413, 'a packed code over 300 KB is refused (413)');
	A((await bad({ code: 'X1.abc' })).status === 400 && (await bad({ code: 'G1.ab c' })).status === 400 && (await bad({})).status === 400, 'a non-code is refused (400)');
	A((await bad({ code: 'G1.' + Buffer.from('not gzip').toString('base64url') })).status === 400, 'a G1 code that is not gzip is refused');
	A((await bad({ code: await RPm.pack('{"seed":"x","actions":[]}') })).body.error === 'not a run recipe', 'a recipe without v is refused');
	A((await bad({ code: await RPm.pack(JSON.stringify({ ...recipe, actions: [1, 2] })) })).body.error === 'not a run recipe', 'actions that are not {type} objects are refused');
	A((await bad({ code: await RPm.pack(JSON.stringify({ ...recipe, seed: '' })) })).status === 400 && (await bad({ code: await RPm.pack('[1,2]') })).status === 400, 'an empty seed / a non-object is refused');
	const many = await RPm.pack(JSON.stringify({ ...recipe, actions: Array.from({ length: 20001 }, () => ({ type: 'highlight', ids: [] })) }));
	const mres = await bad({ code: many });
	A(many.length < 300_000 && mres.status === 413 && mres.body.error === 'too many actions', 'a run over 20000 actions is refused (413)', JSON.stringify(mres.body));
	const ok20k = await bad({ code: await RPm.pack(JSON.stringify({ ...recipe, actions: Array.from({ length: 20000 }, () => ({ type: 'highlight', ids: [] })) })) });
	A(ok20k.status === 200, 'exactly 20000 actions is accepted');
	const bomb = await RPm.pack('{"v":1,"seed":"x","actions":[],"pad":"' + '0'.repeat(6_000_000) + '"}');
	const bres = await bad({ code: bomb });
	A(bomb.length < 300_000 && bres.status === 400, 'a zip bomb (6 MB unpacked from a small code) is refused without inflating it all', JSON.stringify({ packed: bomb.length, status: bres.status }));
	// extend in place: your own id is overwritten; somebody else's id is not
	const code2 = await RPm.packRecipe({ ...recipe, actions: [...recipe.actions, { type: 'cash_out' }] });
	const p2 = await raw('micatro-replay-put', { code: code2, meta: { ...meta, ante: 13 }, id }, tokens.alice);
	A(p2.body.id === id && row('mreplay:' + id).code === code2 && row('mreplay:' + id).meta.ante === 13, 'putting with your own id extends that replay in place (win -> Endless)');
	const p3 = await raw('micatro-replay-put', { code, meta, id }, tokens.bob);
	A(p3.status === 200 && p3.body.id !== id && row('mreplay:' + id).code === code2 && row('mreplay:' + p3.body.id).by === 'bob', "another player's id is never overwritten (bob gets a new id)", JSON.stringify(p3.body));
	const p4 = await raw('micatro-replay-put', { code, meta, id: 'ffffffff' }, tokens.alice);
	A(p4.body.id !== 'ffffffff' && !row('mreplay:ffffffff'), 'a made-up id is not created on request');
	// the board row links the run's replay — only a well-formed id of the scorer's own upload
	const sc1 = await call('run-score', { mode: 'micatro', score: 10 ** 12, ante: 9, seed: 'RPSEED', back: 'b_red', stake: 1, won: true, replay: id }, tokens.alice);
	A(sc1.ok && sc1.best.replay === id, 'run-score keeps the run replay id on the best row', JSON.stringify(sc1.best));
	const lb = await call('run-leaderboard', { mode: 'micatro' }, tokens.carl);
	A((lb.top || []).find(e => e.name === 'alice')?.replay === id, 'the leaderboard row carries the replay id');
	const sc2 = await call('run-score', { mode: 'micatro', score: 10 ** 13, ante: 9, replay: p3.body.id }, tokens.alice);
	A(sc2.ok && sc2.better && !('replay' in sc2.best), "a replay id someone ELSE uploaded is not linked on your row", JSON.stringify(sc2.best));
	const sc3 = await call('run-score', { mode: 'micatro', score: 10 ** 14, ante: 9, replay: 'javascript:alert(1)' }, tokens.alice);
	const sc4 = await call('run-score', { mode: 'micatro', score: 10 ** 15, ante: 9, replay: 'aaaaaaaa' }, tokens.alice);
	A(sc3.ok && !('replay' in sc3.best) && sc4.ok && !('replay' in sc4.best), 'a malformed / nonexistent replay id is dropped (the score still posts)');
	// the final publish carries the replay to spectators (only on the over push)
	await call('add-friend', { username: 'carl' }, tokens.bob); // (bob already follows alice)
	await call('publish-micatro', { snapshot: { ante: 9 }, label: 'Ante 9', seq: 500, replay: id }, tokens.alice);
	A(!row('micatrostate:alice').replay, 'a live (not over) publish ignores a replay id');
	await call('publish-micatro', { label: 'Ante 9', seq: 500, over: true, won: true, replay: id }, tokens.alice);
	A(row('micatrostate:alice').replay === id && row('micatrostate:alice').over === true, 'the final over push stores the replay id on the state row');
	const sv = await call('micatro-state', { username: 'alice' }, tokens.bob);
	const su = await call('micatro-state', { username: 'alice', seq: 500 }, tokens.bob);
	A(sv.replay === id && su.unchanged && su.replay === id, 'spectators read it (full + unchanged replies)', JSON.stringify(su));
	await call('publish-micatro', { label: 'Ante 9', seq: 501, over: true, replay: 'NOPE' }, tokens.alice);
	A(!row('micatrostate:alice').replay, 'a malformed replay id is not stored on the state row');
	// registration: the public read sits ABOVE the auth gate, the put below it; GC + rate limit; the short link
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const gate = src.indexOf('// everything below requires a valid token');
	A(gate > 0 && src.indexOf("action === 'micatro-replay-get'") > 0 && src.indexOf("action === 'micatro-replay-get'") < gate && src.indexOf("action === 'micatro-replay-put'") > gate, 'micatro-replay-get is above the auth gate; micatro-replay-put below it');
	A(/\['mreplay:', 30 \* 24 \* HR\]/.test(src.slice(src.indexOf('const GC_TABLE'), src.indexOf('const GC_TABLE') + 1400)), "GC_TABLE sweeps 'mreplay:' after 30 days");
	A(/'micatro-replay-put': \[\d+, [\d_]+\]/.test(src.slice(src.indexOf('const RATE_LIMITS'), src.indexOf('const HIT_LIMIT'))), 'micatro-replay-put is rate-limited');
	const getBlk = src.slice(src.indexOf("action === 'micatro-replay-get'"), src.indexOf("action === 'micatro-replay-get'") + 400);
	A(getBlk.includes("rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1])") && getBlk.includes('REPLAY_ID_RE.test(id)'), 'the public read is IP-limited like replay-get, and checks the id');
	const rd = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
	A(rd.includes('/mr/* /micatro/?replay=:splat 302'), '/mr/<id> redirects (302) to the replay viewer');
} catch (e) {
	A(false, 'replay section crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
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
	// MicaSurvivor (M5 batch 12c): a run is watched on /micasurvivor/?watch=<user>
	A(LW.watchHref({ username: 'amy', kind: 'micasurvivor' }) === '/micasurvivor/?watch=amy' && LW.watchHref({ username: 'amy', status: 'micasurvivor:run' }) === '/micasurvivor/?watch=amy', 'micasurvivor → /micasurvivor/?watch=<user> (live-friends kind or presence status)');
	const ms = LW.activityFromStatus('micasurvivor:run', 'Pikachu');
	A(ms.live && ms.kind === 'micasurvivor' && ms.label === 'Playing MicaSurvivor — Pikachu' && !LW.activityFromStatus('micasurvivor', 'MicaSurvivor').live && LW.micasurvivorActivityLabel('MicaSurvivor') === 'Playing MicaSurvivor', 'activityFromStatus understands micasurvivor:run (not the menus / lobby)');

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
	const mblk = scr.slice(scr.indexOf("=== 'micasurvivor:run'"), scr.indexOf("=== 'micasurvivor:run'") + 500);
	A(mblk.length > 50 && /watchHref\(\{ username: f\.username, kind: 'micasurvivor' \}\)/.test(mblk) && /saveParty\(S\.party\); savePos\(\)/.test(mblk), '...and a MicaSurvivor friend (saving first)');
	A(/micasurvivorActivityLabel/.test(live) && /micasurvivor: '/.test(hub), 'the Live now hub labels MicaSurvivor runs (and gives them an icon)');

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
