// battlecards_gold_packs_page_test.mjs — gold buys packs, on the pack screen itself (Plans/IMPROVEMENT_PLAN_2026_11.md 1a).
// The server side is tested in battlecards_account_gold_test.mjs; the Buy button had never been clicked in a browser.
// The REAL server handler (server/mp.mjs over sqlite) behind a static server, and a signed-in account.
//   * the screen shows the account's packs and gold, and a Buy button with the server's price, only when you can afford it
//   * clicking it takes the gold and adds a pack, on the screen and on the account; when the gold runs short it goes away
//   * a bought pack opens; a signed-out player has no Buy button (the offline screen is as it was)
//   node overworld/tests/battlecards_gold_packs_page_test.mjs
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
const PORT = 9647;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-gold-packs-page-')), 'mp.bundle.mjs');
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
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
// (a suite rerun right after the first may find the port still held for a moment: retry for 20 s)
for (let i = 0; ; i++) {
	try { await new Promise((res, rej) => { server.once('error', rej); server.listen(PORT, () => { server.off('error', rej); res(); }); }); break; }
	catch (e) { if (e.code !== 'EADDRINUSE' || i >= 40) throw e; await sleep(500); }
}

const tok = (await call('register', { username: 'buyer', password: 'gold-packs-page-1' })).token;
const poor = (await call('register', { username: 'pauper', password: 'gold-packs-page-1' })).token;
await call('gold-earn', { kind: 'import', amount: 400 }, tok);
const st0 = (await call('state', {}, tok)).state;
A(!!tok && st0.gold === 400 && st0.packPrice === 150, 'an account with 400 gold; a pack costs 150', JSON.stringify([st0.gold, st0.packPrice, st0.packs]));

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (token) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		if (token) { const st = (await call('state', {}, token)).state; await page.evaluateOnNewDocument((tk, st) => { localStorage.setItem('magepunk_mp_token_v1', tk); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, token, st); }
		await page.goto(`http://localhost:${PORT}/battlecards/packs.html`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => { const g = document.getElementById('gold'); return !!g && g.textContent.trim().length > 1 && g.textContent.trim() !== '…'; }), 30000);
		await sleep(600);
		return page;
	};
	const ui = (p) => p.evaluate(() => { const b = document.getElementById('buy-btn'), r = b.getBoundingClientRect(); return { gold: document.getElementById('gold').textContent.trim(), buy: b.hidden ? null : b.textContent.trim(), seen: !b.hidden && r.width > 40 && r.height > 20 && r.right <= innerWidth && r.bottom <= innerHeight, hint: document.getElementById('hint').textContent.trim() }; });

	const P = await open(tok);
	let u = await ui(P);
	A(u.gold === `${st0.packs} pack${st0.packs === 1 ? '' : 's'} · 400 gold`, `the screen shows the account's packs and gold (${u.gold})`, JSON.stringify(u));
	A(u.buy === 'Buy a pack — 150 gold' && u.seen, 'and a Buy button with the server\'s price, on the screen', JSON.stringify(u));
	await P.click('#buy-btn');
	A(await waitFor(async () => (await ui(P)).gold === `${st0.packs + 1} pack${st0.packs + 1 === 1 ? '' : 's'} · 250 gold`, 6000), 'click: 150 gold gone, one more pack, on the screen', JSON.stringify(await ui(P)));
	let st = (await call('state', {}, tok)).state;
	A(st.gold === 250 && st.packs === st0.packs + 1, '…and on the account', JSON.stringify([st.gold, st.packs]));
	await P.click('#buy-btn');
	await waitFor(async () => (await ui(P)).gold.includes('100 gold'), 6000);
	u = await ui(P); st = (await call('state', {}, tok)).state;
	A(u.gold.includes('100 gold') && u.buy === null && st.gold === 100 && st.packs === st0.packs + 2, 'a second one; at 100 gold the button goes away', JSON.stringify([u, st.gold, st.packs]));
	// a bought pack opens
	const opened = await P.evaluate(async () => { const b = document.getElementById('next-btn'); return true; });
	const before = (await call('state', {}, tok)).state.packs;
	await P.keyboard.press('Space');
	const spent = await waitFor(async () => (await call('state', {}, tok)).state.packs === before - 1, 8000);
	A(opened && spent, 'a bought pack opens like any other (Space: the account has one fewer)', JSON.stringify([before, (await call('state', {}, tok)).state.packs]));
	// no gold: no button
	const Q = await open(poor);
	u = await ui(Q);
	A(u.buy === null && u.gold.includes('0 gold'), 'an account with no gold has no Buy button', JSON.stringify(u));
	// signed out: the offline screen, as it was
	const O = await open(null);
	u = await ui(O);
	A(u.buy === null && /^\d+ gold$/.test(u.gold), 'signed out: the offline screen as it was (its own gold, no Buy button)', JSON.stringify(u));
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
