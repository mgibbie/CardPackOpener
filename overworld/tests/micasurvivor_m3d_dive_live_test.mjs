// micasurvivor_m3d_dive_live_test.mjs — a friend's 3D Dive watched LIVE over the site's own relay (Plans/IMPROVEMENT_PLAN_2026_11.md
// 1c). Watching a Dive was tested over the test room's channel (micasurvivor_m3d_dive_watch_test.mjs); this is the way a
// player does it: two signed-in friends, each in a browser context of their own, and the REAL server handler
// (server/mp.mjs: publish-micasurvivor / micasurvivor-state) behind a static server.
//   * alice plays a Dive (a fair one: it is kept); unwatched, her page sends no frames
//   * bob opens /micasurvivor/m3d/?live=alice: his page is sent to the Dive's page and builds her floor
//   * he sees a chest she opens, the stairs she takes (floor 2), and the end; her screen says "1 watching"
//   * no message is larger than the server takes
//   node overworld/tests/micasurvivor_m3d_dive_live_test.mjs
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
const PORT = 9649;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-m3ddivelive-')), 'mp.bundle.mjs');
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
for (const n of ['alice', 'bob']) tokens[n] = (await call('register', { username: n, password: 'msurv-m3ddivelive-1' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob); await call('add-friend', { username: 'bob' }, tokens.alice);
A(!!tokens.alice && !!tokens.bob, 'two real accounts, friends');

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000,
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const open = async (who, query) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of (409|429|404|403)|Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		const st = (await call('state', {}, tokens[who])).state || { username: who };
		await page.evaluateOnNewDocument((tok, st) => { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, tokens[who], st);
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 40000);
		return { page, ok };
	};
	const pubs = () => actions.filter((q) => q.action === 'publish-micasurvivor').length;

	const H = await open('alice', '?dive=3&route=forest&dex=4');
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; });
	const h0 = await H.page.evaluate(() => ({ host: !!window.__m3d.siteHost, save: window.__m3d.diveSave, sent: window.__m3d.net.sent }));
	A(H.ok && h0.host && h0.save.practice === null && h0.save.ok, "alice plays a Dive, signed in: it can be kept, and her page has the site's line to her friends", JSON.stringify(h0));
	A(await waitFor(() => pubs() >= 1, 15000), 'her page asks the server whether a friend is watching');
	A(await H.page.evaluate(() => window.__m3d.net.sent === 0 && !window.__m3d.siteHost.watched), 'unwatched, it sends no frames');

	const Wp = await open('bob', '?live=alice');
	const there = await waitFor(() => Wp.page.evaluate(() => /dw=3/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.rv && window.__m3d.rv.dive)), 90000);
	const side = (p, host) => p.evaluate((host) => { const m = window.__m3d, d = host ? m.dive : m.rv, r = m.room; return { search: location.search, w: r.w, stairs: r.stairs.join(), floor: d.floor, chests: d.chests.filter((c) => !c.open).length, lm: d.lm && d.lm.kind, text: document.body.innerText }; }, host);
	let h = await side(H.page, true), w = there ? await side(Wp.page, false) : {};
	A(Wp.ok && there && /live=alice/.test(w.search) && /route=forest/.test(w.search) && w.w === h.w && w.stairs === h.stairs && w.floor === 1 && w.chests === h.chests && w.lm === h.lm, "bob opens ?live=alice: his page is sent to the Dive's page and builds her floor (the same stairs, chests and landmark)", JSON.stringify([{ ...h, text: 0 }, { ...w, text: 0 }]).slice(0, 500));
	A(await waitFor(async () => (await side(H.page, true)).text.includes('1 watching'), 20000), 'her screen says "1 watching"');
	A(await waitFor(async () => { const q = (await side(Wp.page, false)).text; return q.includes('FLOOR 1') && q.includes('at stake'); }, 10000), "his chips have her Dive's line");
	const goTo = (x, z) => H.page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	const ch = await H.page.evaluate(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await goTo(ch[0] + 1, ch[1]);
	A(await waitFor(async () => (await side(Wp.page, false)).chests === h.chests - 1, 25000), 'she opens a chest: a few seconds later he has one fewer');
	const st = await H.page.evaluate(() => { const r = window.__m3d.room; return [r.stairs[0], r.stairs[2]]; });
	await goTo(st[0], st[1]);
	const f2 = await waitFor(async () => (await side(Wp.page, false)).floor === 2, 30000);
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; });
	h = await side(H.page, true); w = await side(Wp.page, false);
	A(f2 && w.stairs === h.stairs && w.chests === h.chests, 'she takes the stairs: he is on floor 2 too', JSON.stringify([h.floor, w.floor, h.stairs, w.stairs]));
	const big = await H.page.evaluate(() => window.__m3d.net.biggest || 0);
	A(big > 0 && big < 23000, `no message is larger than the server takes (the largest: ${big} characters of 23,000)`);
	await H.page.evaluate(() => { const m = window.__m3d; m.dive.bank = 40; m.world.pl.hp = 0; m.world.pl.dead = true; });
	A(await waitFor(() => Wp.page.evaluate(() => window.__m3d.rv.over === 'lost' || window.__m3d.noteLog.some((q) => /RUN OVER|over/i.test(q))), 30000), 'she faints: he is told the Dive is over');
	A(await waitFor(() => H.page.evaluate(() => !!window.__m3d.kept && window.__m3d.kept.ok === true), 10000), 'and her Dive is kept, watched or not');
	A(errors.length === 0, 'no page errors', errors.slice(0, 6).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
