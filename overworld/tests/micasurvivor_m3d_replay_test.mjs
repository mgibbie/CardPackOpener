// micasurvivor_m3d_replay_test.mjs — a 3D run's REPLAY (Plans/IMPROVEMENT_PLAN_2026_11.md 3f, part 2). A 3D run had none: the
// page recorded a tape only when asked (&tape=1), nothing stored it, and the server refused a replay on a 3D score.
// The REAL server handler (server/mp.mjs over sqlite) behind a static server; a signed-in player; a logged-out viewer.
//   * a Dive that will be kept is recorded as it is played; at its end the tape is stored and its id rides on the score
//   * the route's 3D board row carries it, and the board on screen has a ▶ to it
//   * anyone (logged out) opens ?replay=<id>: the page goes to that Dive's own floor and plays it from the start to the end
//   * an Expedition likewise; a practice run records nothing
//   * the server: a 3D tape never enters the 2D game's replay list; a replay that is not this run's, a 2D replay on a 3D
//     score and someone else's replay are refused; a replay that is gone says so
//   node overworld/tests/micasurvivor_m3d_replay_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

// the server's random GC sweep (server/mp.mjs gcRate) stays off: its `gc:last` stamp would land in this suite's write checks
process.env.MP_GC_RATE = '0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9667;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// ---------- the real handler over sqlite, counting row writes per key prefix ----------
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
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push({ k: String(bound[0]), t: Date.now() }); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3dreplay-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
const actions = [];   // every /api/mp call the pages make: {who, action, t}
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); actions.push({ action: b.action, t: Date.now(), auth: (req.headers.authorization || '').slice(-8) }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) && process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (a suite rerun right after the first may find the port still held for a moment: retry for 20 s)
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

const tokens = {};
for (const n of ['alice', 'mallory']) tokens[n] = (await call('register', { username: n, password: 'msurv-m3dreplay-1' })).token;
A(!!tokens.alice && !!tokens.mallory, 'two real accounts');

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const open = async (who, query) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push((who || 'viewer') + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403|401)|Failed to load resource|favicon/.test(m.text())) errors.push((who || 'viewer') + ' console: ' + m.text().slice(0, 200)); });
		if (who) { const st = (await call('state', {}, tokens[who])).state || { username: who }; await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, tokens[who], st); }
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 40000);
		return { page, ok };
	};
	const calm = (p) => p.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; if (m.dive) { m.dive.groups.length = 0; m.dive.ft = 1e9; } });
	const rp = (p) => p.evaluate(() => window.__m3d.replay);
	const DASK = { mode: 'micasurvivor_expedition', d3: true, expMode: 'exp-dive', board: 'dive', route: 'forest' };

	// ---- a Dive, recorded and stored
	const H = await open('alice', '?dive=3&route=forest&dex=4');
	await calm(H.page);
	let r = await rp(H.page);
	A(H.ok && r.rec === true && r.sent === undefined, 'alice plays a Dive that will be kept: it is being recorded', JSON.stringify(r));
	const sp = await H.page.evaluate(() => { const s = window.__m3d.state; return [s.x, s.z]; });
	await H.page.keyboard.down('KeyD'); await sleep(1800); await H.page.keyboard.up('KeyD');
	const ch = await H.page.evaluate(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await H.page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x + 1; s.z = z; s.vx = s.vz = 0; }, ch[0], ch[1]);
	await waitFor(() => H.page.evaluate(() => window.__m3d.dive.chests.some((q) => q.open)), 8000);
	await waitFor(async () => (await rp(H.page)).taped >= 15, 30000);   // (frames, not seconds: a loaded runner tapes them slower)
	r = await rp(H.page);
	A(r.taped >= 15, `the tape grows as she plays (${r.taped} frames at 5 a second)`, JSON.stringify(r));
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.bank = 40; m.world.pl.hp = 0; m.world.pl.dead = true; });
	A(await waitFor(() => H.page.evaluate(() => !!window.__m3d.kept && window.__m3d.kept.ok === true && !!window.__m3d.kept.rank), 20000), 'she faints: the Dive is kept and is on the board', JSON.stringify(await H.page.evaluate(() => window.__m3d.kept)));
	r = await rp(H.page);
	const id = r.sent;
	A(/^[a-f0-9]{8,20}$/.test(id || ''), `its replay was stored (${id})`, JSON.stringify(r));
	const board = await call('run-leaderboard', DASK, tokens.alice), row = (board.top || []).find((e) => e.name === 'alice') || {};
	A(row.replay === id && row.floor === 1, "the route's 3D board row carries the replay's id", JSON.stringify(row));
	const got = await call('micasurvivor-replay-get', { id });
	A(got.by === 'alice' && got.meta && got.meta.d3 === true && got.meta.mode === 'exp-dive' && got.meta.map === 'forest' && got.meta.frames === r.taped && /^G1\./.test(got.code || '') && got.code.length < 200000, `the server has it: hers, a 3D Dive tape of the forest, ${got.meta && got.meta.frames} frames in ${(got.code || '').length} characters`, JSON.stringify({ ...got, code: (got.code || '').length }));
	const list2d = await call('micasurvivor-replay-list', {}, tokens.alice);
	A(Array.isArray(list2d.replays) && list2d.replays.length === 0, "it is not in the 2D game's list of her replays (that player cannot play it)", JSON.stringify(list2d).slice(0, 200));
	// the board on screen has a ▶
	await H.page.evaluate(() => { const b = document.getElementById('rx-boards'); if (b) b.click(); });
	const link = await waitFor(() => H.page.evaluate((id) => { const a = document.querySelector('#rx-board .rx-brow.me .rx-replay'); return !!a && a.getAttribute('href') === '?replay=' + id; }, id), 10000);
	A(link, "on screen, her row on the 3D board has a ▶ that leads to it", JSON.stringify(await H.page.evaluate(() => (document.getElementById('rx-board') || {}).innerHTML || '').then((q) => q.slice(0, 400))));
	const hostRoom = await H.page.evaluate(() => window.__m3d.room.stairs.join());

	// ---- anyone can watch it
	const V = await open(null, '?replay=' + id);
	const playing = await waitFor(() => V.page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.replay && window.__m3d.replay.state === 'playing')), 60000);
	const v0 = playing ? await V.page.evaluate(() => { const m = window.__m3d; return { search: location.search, rp: m.replay, stairs: m.room.stairs.join(), x: m.state.x, z: m.state.z }; }) : {};
	A(playing && /dw=3/.test(v0.search) && /route=forest/.test(v0.search) && /replay=/.test(v0.search) && v0.stairs === hostRoom && v0.rp.src === 'tape' && v0.rp.info.by === 'alice' && v0.rp.info.frames === r.taped, "a logged-out browser opens ?replay=<id>: the page goes to that Dive's floor and plays her tape", JSON.stringify(v0).slice(0, 500));
	A(Math.hypot(v0.x - sp[0], v0.z - sp[1]) < 6, 'it starts where she started', JSON.stringify([v0.x, v0.z, sp]));
	const moved = await waitFor(() => V.page.evaluate((sp) => Math.hypot(window.__m3d.state.x - sp[0], window.__m3d.state.z - sp[1]) > 3, sp), 15000);
	A(moved, 'she is seen walking, as she did');
	const chestSeen = await waitFor(() => V.page.evaluate(() => { const d = window.__m3d.rv; return !!d && d.chests.some((c) => c.open); }), 30000);
	A(chestSeen, 'and opening the chest');
	const ended = await waitFor(() => V.page.evaluate(() => { const q = window.__m3d.replay; return q.at >= q.end - 0.05; }), 40000);
	const v1 = await V.page.evaluate(() => ({ rp: window.__m3d.replay, text: document.body.innerText }));
	A(ended && /replay/i.test(v1.text), 'it plays to its end, and the screen says it is a replay', JSON.stringify(v1.rp));

	// ---- the server's refusals
	const SC = { mode: 'micasurvivor_expedition', d3: true, expMode: 'exp-dive', dv: 20, route: 'forest', floor: 1, start: 1, time: row.time, kills: 0, level: 1, dex: 4 };
	const bad = { wrongTime: await call('run-score', { ...SC, time: row.time + 60, replay: id }, tokens.alice), wrongRoute: await call('run-score', { ...SC, route: 'reef', replay: id }, tokens.alice), notHers: await call('run-score', { ...SC, replay: id }, tokens.mallory), not3d: await call('run-score', { ...SC, d3: undefined, replay: id }, tokens.alice), junk: await call('micasurvivor-replay-put', { d3: true, code: 'R1.' + Buffer.from(JSON.stringify({ v: 1, h: {}, f: [[1]] })).toString('base64url') }, tokens.alice) };
	A(Object.values(bad).every((q) => !!q.error), "the server refuses her replay on a score it does not match (another time, another route), on another player's score, on a 2D score, and a tape that is not a 3D one", JSON.stringify(Object.fromEntries(Object.entries(bad).map(([k, q]) => [k, q.error || 'ACCEPTED']))));
	const gone = await open(null, '?replay=deadbeef');
	A(await waitFor(() => gone.page.evaluate(() => window.__m3d && window.__m3d.replay.state === 'gone' && window.__m3d.noteLog.some((q) => /no longer kept/.test(q))), 20000), 'a replay that is not there: the page says it is no longer kept');

	// ---- a practice run records nothing; an Expedition is recorded too
	const Pp = await open('alice', '?dive=3&route=forest&dex=4&hp=9999');
	r = await rp(Pp.page);
	A(Pp.ok && r.rec === false && r.taped === 0, 'a practice Dive (a test parameter) is not recorded', JSON.stringify(r));
	const X = await open('alice', '?exp=7&map=viridian&dex=4');
	await waitFor(async () => (await rp(X.page)).taped >= 5, 30000);   // (it read 0 frames after a fixed 2.5 s on a loaded runner: main gate 2026-11-13)
	r = await rp(X.page);
	A(X.ok && r.rec === true && r.taped >= 5, `an Expedition that will be kept is recorded too (${r.taped} frames)`, JSON.stringify(r));
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
