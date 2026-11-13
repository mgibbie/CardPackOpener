// micasurvivor_m3d_coop4_test.mjs — MicaSurvivor 3D co-op with a FULL lobby (Plans/IMPROVEMENT_PLAN_2026_11.md 1d). The lobby
// tests play two; a lobby holds four. The REAL server handler behind a static server, and signed-in players in the 2D
// game's own menu, each in a browser context of their own (one machine).
//   * a Dive lobby of four: the start sends all four to one 3D Dive, as the host and players 1, 2 and 3
//   * each sees the three others; one who walks is seen walking by the host and by another guest
//   * the Dive ends: all four keep it, with the same pay, each in their own save
//   * an Expedition · Classic lobby of three: one 3D run
//   * a fifth player is refused by the server
//   node overworld/tests/micasurvivor_m3d_coop4_test.mjs
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
const PORT = 9651;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3dcoop4-')), 'mp.bundle.mjs');
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
const NAMES = ['alice', 'bob', 'cara', 'dan', 'eve', 'fay', 'gus', 'hal'];
for (const n of NAMES) tokens[n] = (await call('register', { username: n, password: 'msurv-m3dcoop4-pass' })).token;
for (const g of [['alice', 'bob', 'cara', 'dan', 'eve'], ['fay', 'gus', 'hal']]) for (const x of g) for (const y of g) if (x !== y) await call('add-friend', { username: x }, tokens[y]);
A(Object.values(tokens).every(Boolean), 'eight real accounts: a group of five friends and a group of three');

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const menu = async (who) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 800, height: 500, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)|Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = (await call('state', {}, tokens[who])).state || { username: who };
		await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micasurvivor_lang', 'en'); window.__msurvNet = { ice: [] }; }, tokens[who], st);
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 40000);
		await sleep(300);
		if (await page.evaluate(() => { const e = document.getElementById('tap-start'); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; })) await page.click('#tap-start');
		if (await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-starters')), 6000)) { await page.evaluate(() => { const c = document.querySelector('#starter-grid .cell'); if (c) c.click(); }); await sleep(300); await page.click('#starter-ok'); }
		await waitFor(() => page.evaluate(() => G.UI.isOpen('scr-menu')), 15000);
		await waitFor(() => page.evaluate(() => G.Game.state === 'ui' && !!G.Social && !!G.PlayUI), 20000);
		await page.evaluate(async () => { await G.Social.start(); if (G.Expedition && G.Expedition.load) await G.Expedition.load(); });
		return page;
	};
	/** A lobby in the 2D game: the first page makes it, the others join and are ready. -> its id */
	const lobby = async (pages, opts) => {
		const id = await pages[0].evaluate(async (o) => { const r = await G.Social.createRoom(o); return r && r.id; }, opts);
		const js = [];
		for (const p of pages.slice(1)) js.push(await p.evaluate(async (id) => { const r = await G.Social.joinRoom(id); if (r.ok) await G.Social.setReady(true); return !!r.ok; }, id));
		const all = await waitFor(() => pages[0].evaluate((n) => { const R = G.Social.room; return !!R && R.members.length === n && R.members.every((m) => m.ready); }, pages.length), 20000);
		return { id, js, all };
	};
	const startIt = (hp) => hp.evaluate(() => { const R = G.Social.room, d3 = G.PlayUI.coop3d(R); setTimeout(async () => { const r = await G.Social.startRoom(4242, d3); if (r.ok) { G.Net.broadcast(r.cfg); G.Flow.startCoop(r.cfg); } }, 50); return d3; });
	const in3d = (p) => waitFor(() => p.evaluate(() => location.pathname === '/micasurvivor/m3d/' && !!(window.__m3d && window.__m3d.ready)), 90000);
	const calm = (hp) => hp.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; if (m.dive) { m.dive.groups.length = 0; m.dive.ft = 1e9; } });

	// ---- a Dive lobby of four
	const P = []; for (const n of ['alice', 'bob', 'cara', 'dan']) P.push(await menu(n));
	const L = await lobby(P, { mode: 'exp-dive', map: 'dive:forest', diff: 'normal', opts: { start: 1 } });
	A(/^[0-9a-f]{12}$/.test(L.id || '') && L.js.every(Boolean) && L.all, 'alice makes a Dive lobby; bob, cara and dan join and are ready: four of four', JSON.stringify(L));
	const five = await call('msurv-lobby-join', { id: L.id, dex: 4, rules: 2 }, tokens.eve);
	A(!five.ok, 'a fifth player is refused by the server', JSON.stringify(five).slice(0, 200));
	A(await startIt(P[0]) === true, 'alice starts it');
	const there = []; for (const p of P) there.push(await in3d(p));
	const urls = []; for (const p of P) urls.push(await p.evaluate(() => location.search));
	const ids = urls.slice(1).map((u) => (/[?&]id=(\d+)/.exec(u) || [])[1]).sort().join();
	A(there.every(Boolean) && urls[0].includes('host=' + L.id) && urls.slice(1).every((u) => u.includes('join=' + L.id) && u.includes('dj=4242')) && ids === '1,2,3', 'all four pages go to the 3D Dive: the host, and players 1, 2 and 3', JSON.stringify(urls));
	const joined = []; for (const p of P.slice(1)) joined.push(await waitFor(() => p.evaluate(() => !!(window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined && window.__m3d.world && window.__m3d.world.co && window.__m3d.world.co.mates.length === 3)), 90000));
	await calm(P[0]);
	const hostSees = await P[0].evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), mates: m.world.mates.map((q) => q.id).sort().join(), modes: m.link.modes }; });
	const guests = []; for (const p of P.slice(1)) guests.push(await p.evaluate(() => { const m = window.__m3d; return { stairs: m.room.stairs.join(), floor: m.guestDive && m.guestDive.floor, mates: m.world && m.world.co ? m.world.co.mates.map((q) => q.id).sort().join() : null }; }));
	A(joined.every(Boolean) && hostSees.mates === '1,2,3', 'the host has three other players, and each guest has joined', JSON.stringify([joined, hostSees]));
	A(guests.every((g) => g.stairs === hostSees.stairs && g.floor === 1), 'all four are on the same floor (the same stairs)', JSON.stringify(guests));
	A(guests.every((g) => g.mates && g.mates.split(',').length === 3), 'each guest sees the three others', JSON.stringify(guests));
	const linked = await waitFor(() => P[0].evaluate(() => { const q = window.__m3d.link.modes; return ['bob', 'cara', 'dan'].every((n) => q[n] === 'direct'); }), 60000);
	A(linked, 'the host is linked directly to all three', JSON.stringify(await P[0].evaluate(() => window.__m3d.link.modes)));
	// one guest walks: the host and another guest see it
	const myId = await P[2].evaluate(() => +new URLSearchParams(location.search).get('id'));
	const posOn = (p, id) => p.evaluate((id) => { const m = window.__m3d, w = m.world, q = (w.co ? w.co.mates : w.mates).find((x) => x.id === id); return q ? [q.s.x, q.s.z] : null; }, myId);
	const h0 = await posOn(P[0]), g0 = await posOn(P[3]);
	await P[2].bringToFront(); await P[2].keyboard.down('KeyD'); await sleep(1500); await P[2].keyboard.up('KeyD');
	const far = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1;
	const hm = await waitFor(async () => far(h0, await posOn(P[0])), 10000), gm = await waitFor(async () => far(g0, await posOn(P[3])), 10000);
	A(hm && gm, 'cara walks: the host sees her move, and so does dan', JSON.stringify([h0, await posOn(P[0]), g0, await posOn(P[3])]));
	const big = await P[0].evaluate(() => window.__m3d.net.biggest || 0);
	A(big > 0 && big < 16000, `with four players no message is larger than the relay takes (the largest: ${big} characters of 16,000)`);
	// the end: everyone keeps it
	await P[0].evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.dive.bank = 40; m.world.pl.hp = 0; m.world.pl.dead = true; for (const q of m.world.mates) { if (q.pl) { q.pl.hp = 0; q.pl.dead = true; } } });
	const kept = []; for (const p of P) kept.push(await waitFor(() => p.evaluate(() => !!window.__m3d.kept && window.__m3d.kept.ok === true), 30000) ? await p.evaluate(() => window.__m3d.kept.pay) : null);
	A(kept.every((k) => k === 120), 'the Dive ends with 40 secured: all four keep it, each owed the same ₽ 120', JSON.stringify(kept));
	const devs = []; for (const [i, n] of ['alice', 'bob', 'cara', 'dan'].entries()) devs.push(await P[i].evaluate((who) => { try { const s = JSON.parse(localStorage.getItem('micasurvivorexp_save.mp:' + who) || 'null'), dev = localStorage.getItem('micasurvivorexp_dev.mp:' + who); return s && s.counters['dive.runs'] === 1 && s.counters['pay3d.' + dev] === 120 ? dev : null; } catch (e) { return null; } }, n));
	A(devs.every(Boolean) && new Set(devs).size === 4, 'each has it in their own save, owed on their own browser', JSON.stringify(devs));
	for (const p of P) await p.close();

	// ---- an Expedition · Classic lobby of three
	const Q = []; for (const n of ['fay', 'gus', 'hal']) Q.push(await menu(n));
	const L2 = await lobby(Q, { mode: 'exp-classic', map: 'viridian', diff: 'normal', opts: {} });
	A(L2.all && await startIt(Q[0]) === true, 'fay starts an Expedition · Classic lobby with gus and hal', JSON.stringify(L2));
	const t3 = []; for (const p of Q) t3.push(await in3d(p));
	const j3 = []; for (const p of Q.slice(1)) j3.push(await waitFor(() => p.evaluate(() => !!(window.__m3d.rv && window.__m3d.net.joined && window.__m3d.world && window.__m3d.world.co && window.__m3d.world.co.mates.length === 2)), 90000));
	A(t3.every(Boolean) && j3.every(Boolean) && await Q[0].evaluate(() => window.__m3d.world.mates.length === 2 && !!window.__m3d.run), 'all three are in one 3D Expedition run, each seeing the two others', JSON.stringify([t3, j3]));
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
