// pocketenhanced_rejoin_test.mjs — back into an online match after the page was lost, and a lost connection said so
// (owner's second improvement list, 2026-11-18, "yes to all": "Rejoin a dropped online match. If your phone sleeps or your
// connection drops, you should land back in the match where you left it.") pocketenhanced/js/main.js rejoinOffer, connState.
//   1. a reload in the middle of an online match (here: the page opened cold) goes straight back into it: the table, the
//      seat, "Back to your online match." (before: the main menu, and nothing said a match was running)
//   2. the connection drops: after two syncs with no answer a "Reconnecting" banner shows; it comes back: the banner goes,
//      "Connected again.", and the table carries on
//   3. a lobby that has not started yet: the main menu's top button is "Back to your online lobby", which opens it
//   4. a guest (no account) sees no such button and no error
//   node overworld/tests/pocketenhanced_rejoin_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { starterDeck } from '../../pocketenhanced/js/decks.js';
import * as C from '../../pocketenhanced/js/collection.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8679;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { return st.run(...b); }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pocket-rejoin-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
// (the page's protocol, read from main.js, so this test follows it)
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'pocketenhanced/js/main.js'), 'utf8').match(/const PKV = \{ pv: (\d+)/)[1], ev: E.ENGINE_VERSION };
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
let dropApi = false;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		if (dropApi) { req.socket.destroy(); return; }   // (the connection is lost: no answer at all)
		let raw = ''; for await (const c of req) raw += c;
		const r = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw }), { MP_DB });
		res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const tok = {};
for (const n of ['ann', 'cat']) {
	tok[n] = (await call('register', { username: n, password: 'pocket-rejoin-pass' })).token;
	sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('pkcol:' + n, JSON.stringify({ rev: 1, col: C.newCollection(), at: 1, ids: [] }));
}
// ann: a match against a computer player, started; cat: a lobby waiting for a second player
const made = await call('pkpvp-create', { size: 2, bots: 1, ...starterDeck('charizard') }, tok.ann);
const started = made.lobby && await call('pkpvp-start', { id: made.lobby.id }, tok.ann);
A(!!(started && started.match), '(ann is in a running online match against a computer player)', made.error || (started && started.error));
const waiting = await call('pkpvp-create', { size: 2, ...starterDeck('pikachu') }, tok.cat);
A(!!(waiting.lobby && !waiting.lobby.started), '(cat has a lobby waiting for a second player)', waiting.error);

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async who => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		const st = who ? (await call('state', {}, tok[who])).state : null;
		await page.evaluateOnNewDocument((t, st) => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true }));
			if (t) { localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } } catch { /* */ } }, who ? tok[who] : null, st);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
		return { page, errors };
	};
	// ===== 1. straight back in =====
	const a = await open('ann');
	const back = await waitFor(() => a.page.evaluate(() => window.__pocket.mode === 'online' && !!window.__pocket.view()), 15000);
	const said = await a.page.evaluate(() => document.querySelector('.pe-banner') && document.querySelector('.pe-banner').textContent);
	A(back && /Back to your online match/.test(said || ''), 'ann opens the page with a match running: straight back at the table, "Back to your online match."', { back, said, mode: await a.page.evaluate(() => window.__pocket.mode) });
	// ===== 2. the connection drops and comes back =====
	const conn = () => a.page.evaluate(() => { const e = document.querySelector('.pe-conn'); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; });
	A(!(await conn()), 'connected: no banner');
	dropApi = true;
	const lost = await waitFor(conn, 15000);
	A(lost && /Reconnecting/.test(await a.page.evaluate(() => document.querySelector('.pe-conn').textContent)), 'the connection drops: "Connection lost. Reconnecting…" shows');
	dropApi = false;
	const again = await waitFor(async () => !(await conn()), 15000);
	const said2 = await a.page.evaluate(() => document.querySelector('.pe-banner').textContent);
	A(again && /Connected again/.test(said2) && await a.page.evaluate(() => window.__pocket.mode === 'online' && !!window.__pocket.view()), 'it comes back: the banner goes, "Connected again.", still at the table', { again, said2 });
	A(!a.errors.length, 'no page errors (ann)', a.errors.slice(0, 3));
	// ===== 3. a lobby not started yet =====
	const c = await open('cat');
	const offer = await waitFor(() => c.page.evaluate(() => !!document.querySelector('[data-k="rejoin"]')), 10000);
	const label = offer && await c.page.evaluate(() => document.querySelector('[data-k="rejoin"]').textContent);
	A(offer && /Back to your online lobby/.test(label) && label.includes(waiting.lobby.code) && await c.page.evaluate(() => window.__pocket.mode === 'normal'), 'cat (a lobby still waiting): the main menu offers "Back to your online lobby (code …)", and does not jump in', label);
	await c.page.evaluate(() => document.querySelector('[data-k="rejoin"]').click());
	const lobby = await waitFor(() => c.page.evaluate(code => window.__pocket.mode === 'online' && !!document.querySelector(`[data-code="${code}"]`), waiting.lobby.code), 8000);
	A(lobby, 'pressing it opens the lobby with its code');
	// ===== 4. a guest =====
	const g = await open(null); await sleep(1500);
	A(!(await g.page.evaluate(() => !!document.querySelector('[data-k="rejoin"]'))) && !g.errors.length, 'a guest: no rejoin button, no errors', g.errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
