// micasurvivor_m3d_lobbystart_test.mjs — MicaSurvivor 3D, co-op from the online lobby, second part (Plans/MICASURVIVOR_3D_PLAN.md
// §5.72): the lobby's START sends every player to the 3D page. The REAL server handler behind a static server, and signed-in
// friends in the 2D game's own menu, each in a browser context of their own.
//   * it is OFF unless the host's browser opted in (/micasurvivor/?coop3d=1); a guest needs no switch
//   * a Dive lobby: alice (opted in) starts it; the start says it is the 3D one; alice's page goes to the 3D Dive as its host
//     and bob's as a guest, with the lobby's line, and they are in one Dive
//   * an Expedition · Classic lobby: the same, to a 3D Expedition
//   * the server takes the 3D mark only for Classic and Dive lobbies
//   node overworld/tests/micasurvivor_m3d_lobbystart_test.mjs
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
const PORT = 9643;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3dstart-')), 'mp.bundle.mjs');
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
const NAMES = ['alice', 'bob', 'dave', 'erin', 'fay', 'gus'];
for (const n of NAMES) tokens[n] = (await call('register', { username: n, password: 'msurv-m3dstart-pass' })).token;
for (const [x, y] of [['alice', 'bob'], ['dave', 'erin'], ['fay', 'gus']]) { await call('add-friend', { username: x }, tokens[y]); await call('add-friend', { username: y }, tokens[x]); }
A(Object.values(tokens).every(Boolean), 'six real accounts, in three pairs of friends');

// ---- the server: the 3D mark is for Classic and Dive lobbies only
{
	const c = await call('msurv-lobby-create', { dex: 7, rules: 2 }, tokens.fay), id = c.lobby && c.lobby.id;
	await call('msurv-lobby-join', { id, dex: 4, rules: 2 }, tokens.gus);
	await call('msurv-lobby-update', { id, ready: true }, tokens.gus);
	const s = await call('msurv-lobby-update', { id, start: { seed: 5, d3: true } }, tokens.fay);
	A(s.lobby && s.lobby.start && s.lobby.start.seed === 5 && s.lobby.start.d3 === undefined, 'a base (Survival) lobby started with the 3D mark: the server starts it without the mark', JSON.stringify(s.lobby && s.lobby.start || s));
}

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	/** The 2D game's menu, signed in as `who`. q: the address's query. */
	const menu = async (who, q = '') => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1000, height: 620, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)|Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = (await call('state', {}, tokens[who])).state || { username: who };
		await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micasurvivor_lang', 'en'); window.__msurvNet = { ice: [] }; }, tokens[who], st);
		await page.goto(`http://localhost:${PORT}/micasurvivor/${q}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 40000);
		await sleep(300);
		if (await page.evaluate(() => { const e = document.getElementById('tap-start'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })) await page.click('#tap-start');
		await waitFor(() => page.evaluate(() => G.Game.state === 'ui' && !!G.Social && !!G.PlayUI), 20000);
		await page.evaluate(async () => { await G.Social.start(); if (G.Expedition && G.Expedition.load) await G.Expedition.load(); });
		return page;
	};
	/** A lobby of two in the 2D game: `host` makes it (opts: what it plays), `guest` joins and is ready. -> its id */
	const lobby = async (hp, gp, opts) => {
		const id = await hp.evaluate(async (o) => { const r = await G.Social.createRoom(o); return r && r.id; }, opts);
		const j = await gp.evaluate(async (id) => { const r = await G.Social.joinRoom(id); if (r.ok) await G.Social.setReady(true); return r; }, id);
		const both = await waitFor(() => hp.evaluate(() => { const R = G.Social.room; return !!R && R.members.length === 2 && R.members.every((m) => m.ready); }), 15000);
		return { id, j, both };
	};
	const startIt = (hp) => hp.evaluate(() => { const R = G.Social.room, d3 = G.PlayUI.coop3d(R); setTimeout(async () => { const r = await G.Social.startRoom(4242, d3); if (r.ok) { G.Net.broadcast(r.cfg); G.Flow.startCoop(r.cfg); } }, 50); return d3; });
	const in3d = (p) => waitFor(() => p.evaluate(() => location.pathname === '/micasurvivor/m3d/' && !!(window.__m3d && window.__m3d.ready)), 60000);

	// ---- a Dive lobby, the host opted in
	const A1 = await menu('alice', '?coop3d=1'), B1 = await menu('bob');
	const L = await lobby(A1, B1, { mode: 'exp-dive', map: 'dive:forest', diff: 'normal', opts: { start: 1 } });
	A(/^[0-9a-f]{12}$/.test(L.id || '') && L.j.ok && L.both, 'alice makes a Dive lobby in the 2D game; bob joins and is ready', JSON.stringify(L));
	const sw = [await A1.evaluate(() => G.PlayUI.coop3d(G.Social.room)), await B1.evaluate(() => G.PlayUI.coop3d(G.Social.room)), await A1.evaluate(() => G.PlayUI.coop3d(Object.assign({}, G.Social.room, { opts: { weekly: 3 } }))), await A1.evaluate(() => G.PlayUI.coop3d(Object.assign({}, G.Social.room, { mode: 'exp-survival' })))];
	A(sw[0] === true && sw[1] === false && sw[2] === false && sw[3] === false, 'the switch: on for alice (she opened ?coop3d=1), off for bob; never for the Weekly Dive or Survival', JSON.stringify(sw));
	A(await startIt(A1) === true, 'alice starts the lobby');
	const a3 = await in3d(A1), b3 = await in3d(B1);
	const ua = await A1.evaluate(() => location.search), ub = await B1.evaluate(() => location.search);
	A(a3 && ua.includes('dive=4242') && ua.includes('route=forest') && ua.includes('host=' + L.id) && ua.includes('lobby=' + L.id), `alice's page goes to the 3D Dive as its host (${ua})`);
	A(b3 && ub.includes('join=' + L.id) && ub.includes('lobby=' + L.id) && ub.includes('lh=alice') && ub.includes('id=1') && ub.includes('dj=4242') && ub.includes('route=forest'), `bob's page goes to it as a guest, though he never opted in (${ub})`);
	const st = await call('msurv-lobby-poll', { id: L.id }, tokens.alice);
	A(st.lobby && st.lobby.start && st.lobby.start.d3 === true && st.lobby.start.seed === 4242, 'the lobby\'s start on the server says it is the 3D one');
	const joined = await waitFor(() => B1.evaluate(() => !!(window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined)), 60000);
	const pair = joined ? [await A1.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), mates: m.world.mates.map((q) => q.id + ':' + q.dex), modes: m.link.modes, floor: m.dive.floor }; }), await B1.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), floor: m.guestDive.floor, mode: m.link.modes.alice, reloaded: /gen=4242/.test(location.search) }; })] : [];
	A(joined && pair[0].stairs === pair[1].stairs && pair[0].mates.length === 1 && pair[0].mates[0].startsWith('1:') && pair[1].floor === 1 && (pair[1].mode === 'direct' || pair[1].mode === 'relay'), 'they are in one 3D Dive, linked, bob as player 1', JSON.stringify(pair));
	const direct = await waitFor(() => A1.evaluate(() => window.__m3d.link.modes.bob === 'direct'), 60000);
	A(direct, 'the link becomes a direct one (the relay carries the first moments, while the two new pages find each other)', JSON.stringify(await A1.evaluate(() => window.__m3d.link.modes)));
	await A1.close(); await B1.close();

	// ---- an Expedition · Classic lobby
	const A2 = await menu('dave', '?coop3d=1'), B2 = await menu('erin');
	const L2 = await lobby(A2, B2, { mode: 'exp-classic', map: 'viridian', diff: 'normal', opts: {} });
	A(L2.both && await startIt(A2) === true, 'dave (opted in) starts an Expedition · Classic lobby with erin', JSON.stringify(L2));
	const a4 = await in3d(A2), b4 = await in3d(B2);
	const ud = await A2.evaluate(() => location.search), ue = await B2.evaluate(() => location.search);
	A(a4 && b4 && ud.includes('exp=4242') && ud.includes('map=viridian') && ud.includes('diff=normal') && ud.includes('host=' + L2.id) && ue.includes('join=' + L2.id) && ue.includes('xj=4242') && ue.includes('map=viridian'), `both go to the 3D Expedition (${ud} / ${ue})`);
	const joined2 = await waitFor(() => B2.evaluate(() => !!(window.__m3d.rv && window.__m3d.net.joined)), 60000);
	A(joined2 && await A2.evaluate(() => window.__m3d.world.mates.length === 1 && !!window.__m3d.run), 'and are in one 3D Expedition run');
	await A2.close(); await B2.close();

	// ---- off by default
	const A3 = await menu('fay');
	A(await A3.evaluate(() => G.PlayUI.coop3d({ mode: 'exp-dive', opts: { start: 1 } }) === false && localStorage.getItem('micasurvivor_coop3d') === null), 'with nothing stored the switch is off: an online lobby starts the 2D run, as before');
	const src = fs.readFileSync(path.join(ROOT, 'micasurvivor/js/ui/social-ui.js'), 'utf8');
	A(src.includes('G.Social.startRoom(Math.floor(Math.random() * 1e6), !!(G.PlayUI && G.PlayUI.coop3d && G.PlayUI.coop3d(room)))'), "the lobby screen's START button asks the same switch");
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
