// micasurvivor_m3d_exprelay_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.37): a 3D
// run watched live over the site's own lines (micasurvivor/m3d/exprelay.js), in node, against the REAL handler
// (server/mp.mjs bundled like the dev server, over sqlite) and a real run's frames.
//   * the player's end asks every 10 s with no snapshot (the beacon: mode exp-threed); nothing is sent unwatched
//   * a friend's end polls: "waiting" until the player's next ask sees it; then a snapshot a second
//   * what arrives is what the 3D page's relay sends: the run's header and a second of frames, which the page's own
//     Viewer plays (the player where the run has it; the run's row)
//   * the end: `over` once; the friend is told and stops
//   * a stranger, a logged-out visitor, a friend playing the 2D game: each is told so; a second too big is skipped
//   * the 2D game (js/mica/spectate.js, run as it is): a friend in a 3D run sends the watcher to the 3D page
//   node overworld/tests/micasurvivor_m3d_exprelay_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun } from '../../micasurvivor/m3d/expedition.js';
import { frame as netFrame, bundle, unbundle, Viewer, NK } from '../../micasurvivor/m3d/net.js';
import { runRow, rowView } from '../../micasurvivor/m3d/expnet.js';
import { HostLink, WatchLink, runId, RK, SAYS } from '../../micasurvivor/m3d/exprelay.js';
import { loadG } from './m3d_data.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };

// ---------- the real handler over sqlite (as micasurvivor_spectate_server_test.mjs) ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-m3d-relay-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: out, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(out).href);
let VT = Date.now(); globalThis.__msurvClock = () => VT;
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
/** A page's G.MicaAccount.call, for a logged-in player (or no one). */
const T = {}, callAs = (who) => async (action, body) => { if (!T[who]) return { ok: false, status: 401, body: { error: 'not logged in' } }; const r = await raw(action, body, T[who]); return { ok: r.status === 200, status: r.status, body: r.body }; };

try {
	for (const n of ['hosty', 'viewer', 'stranger', 'twodee']) T[n] = (await raw('register', { username: n, password: 'm3d-relay-pass-1' })).body.token;
	for (const [a, b] of [['hosty', 'viewer'], ['viewer', 'hosty'], ['twodee', 'viewer'], ['viewer', 'twodee']]) await raw('add-friend', { username: b }, T[a]);
	A(Object.values(T).every(Boolean), 'the accounts: a player, a friend, a stranger, a friend who plays the 2D game');

	// ---------- a real run and its frames, as the 3D page's relay sends them ----------
	const G = loadG(), data = dataFrom(G), X = expFrom(G);
	const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0 }); S.plan.events = [];
	const HEAD = { gen: 7, biome: 'meadow', size: null, dex: 4, exp: { seed: 7, map: S.map, diff: S.diff } };
	/** One second of the run: ten frames (the run's row on each), bundled as the page does. */
	const second = () => { const batch = []; for (let i = 0; i < 60; i++) { S.acc = -1e9; stepRun(S, { mx: 1, mz: 0, jump: false, crouch: false }); if (i % 6 === 5) { const f = netFrame(S.w, []); f.r = runRow(S); batch.push(f); } } return JSON.stringify({ h: HEAD, b: bundle(batch) }); };

	// ---------- the player's end ----------
	const rid = runId(globalThis.crypto);
	const host = new HostLink({ call: callAs('hosty'), run: rid, label: '3D Expedition · Charmander', dex: 4, now: () => VT });
	A(/^[0-9a-f]{12}$/.test(rid) && runId(globalThis.crypto) !== rid && RK.MODE === 'exp-threed' && RK.CAP < 24000 && NK.RELAY_CAP <= RK.CAP, 'a run has an id the server takes; the sizes are within the server\'s');
	const a1 = await host.tick();
	const live = row('msurvlive:hosty');
	A(a1 && a1.ok && host.asks === 1 && host.sent === 0 && !host.watched && live && live.run === rid && live.mode === 'exp-threed' && live.label === '3D Expedition · Charmander' && !row('msurvstate:hosty'), 'the run begins: one ask with no snapshot; the server has the beacon (mode exp-threed), and no snapshot', live);
	host.postMessage(second()); VT += 3000;
	A(host.tick() === null && host.asks === 1 && host.sent === 0, 'unwatched, nothing more is asked or sent for ten seconds (whatever the page hands it)');

	// ---------- a friend's end ----------
	const timers = [], got = [], stats = [];
	const watch = new WatchLink({ call: callAs('viewer'), who: 'hosty', later: (fn, ms) => timers.push([fn, ms]) });
	watch.onmessage = (m) => got.push(m.data); watch.onstatus = (st) => stats.push(st);
	const next = async () => { const t = timers.shift(); VT += t[1]; await t[0](); };
	await watch.start();
	A(watch.status === 'waiting' && timers.length === 1 && timers[0][1] === RK.POLL_MS && got.length === 0 && SAYS.waiting, 'a friend opens the watch: "waiting" (the run is live and a 3D one, no frames yet), and it asks again in a second');
	VT += 8000;   // (ten seconds since the player's last ask)
	const a2 = await host.tick();
	A(a2 && host.asks === 2 && host.watched && host.watchers === 1 && host.names.join() === 'viewer', 'the player\'s next ask sees the friend: it is watched', { w: host.watchers, n: host.names });
	const msg = second(); host.postMessage(msg);
	VT += 1000; const s1 = await host.tick();
	const st1 = row('msurvstate:hosty');
	A(s1 && s1.body.wrote.state && host.sent === 1 && st1 && st1.snap.m3d === 1 && st1.seq === 1 && msg.length < NK.RELAY_CAP, `now a second of frames goes up (${msg.length} characters), and the server keeps it`, s1 && s1.body);
	await next();
	A(watch.status === 'live' && got.length === 1 && watch.seq === 1, 'the friend\'s next poll brings it');
	const m = JSON.parse(got[0]), frames = unbundle(m.b), v = new Viewer(); for (const f of frames) v.push(f);
	const mid = v.sample(v.newest - 0.2), rv = rowView(frames[frames.length - 1].r, X, {});
	A(m.h.exp.seed === 7 && m.h.exp.map === S.map && frames.length === 10 && mid && Math.abs(mid.pl.s.x - S.w.pl.s.x) < 3 && Math.abs(mid.pl.s.z - S.w.pl.s.z) < 3 && rv.league && rv.league.member === 4 && rv.room && rv.room.w === S.w.room.w, 'it is what the 3D page\'s relay sends: the run\'s header and ten frames; the page\'s own Viewer plays them (the player where the run has it, the run\'s zone and League member)');
	await next();
	A(watch.status === 'live' && got.length === 1, 'nothing new: the next poll says so and brings nothing twice');
	host.postMessage(second()); VT += 1000; await host.tick(); await next();
	A(host.sent === 2 && got.length === 2 && watch.seq === 2, 'the next second goes up and comes down');
	host.postMessage(JSON.stringify({ h: HEAD, b: 'x'.repeat(RK.CAP + 10) })); VT += 1000; const big = await host.tick();
	A(host.dropped === 1 && host.sent === 2 && big && big.ok && row('msurvstate:hosty').seq === 2, 'a second too big for the server is skipped, not sent (the run goes on)');

	// ---------- who may watch ----------
	const st2 = []; const w2 = new WatchLink({ call: callAs('stranger'), who: 'hosty', later: () => st2.push('again') }); w2.onstatus = (s) => st2.push(s); await w2.start();
	const st3 = []; const w3 = new WatchLink({ call: callAs('nobody'), who: 'hosty', later: () => st3.push('again') }); w3.onstatus = (s) => st3.push(s); await w3.start();
	A(st2.join() === 'notfriend' && w2.stopped && st3.join() === 'login' && w3.stopped && SAYS.notfriend && SAYS.login, 'a stranger is told it can only watch a friend; a logged-out visitor is told to log in; neither asks again');
	// a friend in the 2D game: its beacon and snapshot are the 2D game's
	await raw('publish-micasurvivor', { run: 'aaaabbbbcccc', label: 'Pikachu', mode: 'normal', dex: 25 }, T.twodee);
	const st4 = [], t4 = []; const w4 = new WatchLink({ call: callAs('viewer'), who: 'twodee', later: (fn, ms) => t4.push([fn, ms]) }); w4.onstatus = (s) => st4.push(s); let got4 = 0; w4.onmessage = () => got4++; await w4.start();
	VT += 1000; await raw('publish-micasurvivor', { run: 'aaaabbbbcccc', label: 'Pikachu', mode: 'normal', dex: 25, snapshot: { v: 1, t: 5, p: [1, 2] }, seq: 1 }, T.twodee); await t4[0][0]();
	A(st4.join() === 'not3d,not3d' && got4 === 0 && /2D game/.test(SAYS.not3d), 'a friend playing the 2D game: the 3D page says so and shows nothing of it');

	// ---------- the end ----------
	host.postMessage(second()); VT += 1000;
	const e1 = await host.end(), e2 = await host.end();
	A(e1 && e1.ok && e2 === null && host.done && host.tick() === null && row('msurvlive:hosty').over === true && row('msurvstate:hosty').over === true, 'the run ends: told once, with the last frames; nothing after');
	await next();
	A(watch.status === 'over' && watch.stopped && got.length === 3 && timers.length === 0 && stats[stats.length - 1] === 'over', 'the friend gets the last frames, is told it is over, and stops asking', { st: watch.status, got: got.length });

	// ---------- the 2D game sends a watcher of a 3D run to the 3D page ----------
	{
		const gone = [], seen = [];
		let answer = { ok: true, status: 200, body: { live: true, waiting: true, mode: 'exp-threed', snapshot: null } };
		const ctx = { console, performance, setTimeout: () => 0, clearTimeout() { }, encodeURIComponent, location: { replace: (u) => gone.push(u) } };
		ctx.window = ctx; ctx.G = { MicaAccount: { name: () => 'viewer', call: async () => answer }, I18n: { add() { }, t: (s) => s } };
		vm.createContext(ctx);
		vm.runInContext(fs.readFileSync(path.join(ROOT, 'micasurvivor/js/mica/spectate.js'), 'utf8'), ctx, { filename: 'spectate.js' });
		const Sp = ctx.G.Spectate, h = { snapshot: () => seen.push('snap'), waiting: () => seen.push('waiting'), ended: () => seen.push('ended'), gone: () => seen.push('gone'), error: () => seen.push('error'), info: () => seen.push('info') };
		Sp.watch('hosty', h); await new Promise((r) => setImmediate(r));
		A(gone.join() === '/micasurvivor/m3d/?live=hosty' && seen.length === 0 && Sp.watching === null, 'the 2D game, watching a friend whose run is a 3D one: it goes to the 3D page (' + gone.join() + ')', { gone, seen });
		gone.length = 0; answer = { ok: true, status: 200, body: { live: true, waiting: true, mode: 'exp-classic', snapshot: null } };
		Sp.watch('twodee', h); await new Promise((r) => setImmediate(r));
		const two = gone.length === 0 && seen.join() === 'waiting';
		Sp.unwatch(); seen.length = 0; answer = { ok: true, status: 200, body: { live: false, over: true, mode: 'exp-threed', snapshot: null } };
		Sp.watch('hosty', h); await new Promise((r) => setImmediate(r));
		A(two && gone.length === 0 && seen.join() === 'ended', 'a friend in a 2D run is watched in the 2D game as before; a 3D run that is over is just "ended"', { gone, seen });
	}
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
