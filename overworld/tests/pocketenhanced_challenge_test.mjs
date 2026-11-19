// pocketenhanced_challenge_test.mjs — a friend challenged in one tap (owner's third improvement list, 2026-11-18, "yes to
// all": "Challenge a friend in one tap. From the friends list, straight into a match with them, instead of going through
// host, invite and code"). pocketenhanced/js/main.js challengeMenu / challengeWatch.
//   1. Play online > Challenge a friend: the friends; a tap hosts a two-seat match with the chosen deck, invites the
//      friend, and waits in its lobby
//   2. the friend, on the main menu (not in Play online): "ann challenges you to a match!" with Accept; Accept puts them
//      in that match
//   node overworld/tests/pocketenhanced_challenge_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as C from '../../pocketenhanced/js/collection.js';
import * as E from '../../pocketenhanced/js/engine/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8683;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-chal-e2e-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'server/pocket_pvp.mjs'), 'utf8').match(/PKPVP_PROTOCOL = (\d+)/)[1], ev: E.ENGINE_VERSION };
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const r = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.1.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw }), { MP_DB });
		res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const tok = {};
for (const n of ['ann', 'ben']) { tok[n] = (await call('register', { username: n, password: 'pocket-chal-e2e' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }

// ann and ben are friends (as adding each other's friend code makes them)
for (const [a, b] of [['ann', 'ben'], ['ben', 'ann']]) { const u = row(a); u.friends = [...new Set([...(u.friends || []), b])]; setRow(a, u); }

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async who => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(e.message));
		const st = (await call('state', {}, tok[who])).state;
		await page.evaluateOnNewDocument((t, st) => { try { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { /* */ } }, tok[who], st);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(400);
		return { page, errors };
	};
	const click = (page, k) => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e) e.click(); return !!e; }, k);
	// ben waits on the main menu
	const b = await open('ben');
	// ===== 1. ann challenges ben =====
	const a = await open('ann');
	await click(a.page, 'online'); await sleep(400);
	A(await click(a.page, 'ochallenge'), 'Play online: "Challenge a friend"');
	A(await waitFor(() => a.page.evaluate(() => !!document.querySelector('[data-k="chben"]')), 8000), 'her friends: ben');
	await click(a.page, 'chben');
	const aIn = await waitFor(() => a.page.evaluate(() => window.__pocket.mode === 'online' && !!document.querySelector('[data-code]')), 8000);
	const inv = row('pkinvite:ben');
	A(aIn && inv && (inv.list || []).some(v => v.from === 'ann'), 'one tap: ann waits in a two-seat match she hosts, and ben is invited', { aIn, inv });
	// ===== 2. ben, on the main menu, sees it =====
	const seen = await waitFor(() => b.page.evaluate(() => /ann<\/b> challenges you/.test((document.querySelector('.pe-challenge') || {}).innerHTML || '')), 12000);
	A(seen, "ben's main menu: \"ann challenges you to a match!\" with Accept", await b.page.evaluate(async () => ({ mode: window.__pocket.mode, menu: !!document.querySelector('[data-k="online"]'), modals: [...document.querySelectorAll('.modal .modal-title')].map(e => e.textContent), state: !!window.__pocket.state(), view: !!window.__pocket.view() })));
	await click(b.page, 'chacc:ann');
	const bIn = await waitFor(() => b.page.evaluate(() => window.__pocket.mode === 'online'), 8000);
	const lb = row('pkpvp:' + row('pkpvpcur:ann').id);
	A(bIn && lb && lb.players.map(p => p.name).sort().join() === 'ann,ben', 'Accept: ben is in her match', lb && lb.players.map(p => p.name));
	// ===== 3. Not now =====
	{
		const c = await open('ann');   // (a second page of ann's is fine: the server sees one ann)
		void c;
	}
	A(!a.errors.length && !b.errors.length, 'no page errors', [...a.errors, ...b.errors].slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
