// pocketenhanced_tourwatch_test.mjs — watching a tournament's matches (owner's third improvement list, 2026-11-18, "yes
// to all": "Watch tournaments. Players who are out (or friends) can spectate the bracket's live matches"). server/mp.mjs
// pocket-state + pocket_pvp.mjs tourmates; main.js tourScreen Watch, TOUR_PARAM.
//   1. the server: a player may watch the match of anyone in their tournament (not only a friend's); someone neither a
//      friend nor in the tournament may not
//   2. the page: the bracket's live pairing (not mine, not two computer players) has Watch; it opens the spectator view
//      of that player remembering the tournament; leaving it comes back to the tournament's bracket
//   node overworld/tests/pocketenhanced_tourwatch_test.mjs
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
import { starterDeck } from '../../pocketenhanced/js/decks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8687;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-twatch-')), 'mp.bundle.mjs');
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
for (const n of ['ann', 'ben', 'cat']) { tok[n] = (await call('register', { username: n, password: 'pocket-twatch-pass' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }

// a running tournament of four: ann against a computer player, ben against another (written as the server keeps it;
// the next look makes each pairing's match)
const TID = 'a1b2c3d4e5f6', D = starterDeck('pikachu');
setRow('pktour:' + TID, { id: TID, code: 'TWTCH', rev: 1, at: 1, ts: Date.now(), host: 'ann', size: 4, singles: false, state: 'running',
	players: [{ name: 'ann', deck: D.deck, energy: D.energy, prints: {} }, { name: 'ben', deck: D.deck, energy: D.energy, prints: {} }], cpus: ['CPU Blue', 'CPU Green'],
	rounds: [[{ a: 'ann', b: 'CPU Blue', lid: null, winner: null }, { a: 'ben', b: 'CPU Green', lid: null, winner: null }]], placed: {}, paid: {} });
const tv = await call('pkpvp-tget', { tid: TID }, tok.ann);
A(tv.tour && tv.tour.rounds[0].every(g => g.live), '(the tournament runs: both pairings are live matches)', tv);
// ===== 1. the server =====
const asAnn = await call('pocket-state', { username: 'ben' }, tok.ann);
A(!asAnn.error, "ann (not ben's friend, but in his tournament) may watch ben's match", asAnn);
const asCat = await call('pocket-state', { username: 'ben' }, tok.cat);
A(/not your friend/.test(asCat.error || ''), 'cat (neither a friend nor in it) may not', asCat);
// ===== 2. the page =====
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	const st = (await call('state', {}, tok.ann)).state;
	await page.evaluateOnNewDocument((t, st) => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true, guided: { tour: 1, draft: 1, event: 1, setrewards: 1, binder: 1, emblems: 1 } })); localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { /* */ } }, tok.ann, st);
	// ann opens the page at her tournament (as she would coming back from watching)
	await page.goto(`http://localhost:${PORT}/pocketenhanced/?tour=${TID}`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	// (her own match is ready, so the screen takes her into it: back out to the bracket)
	await waitFor(() => page.evaluate(() => window.__pocket.mode === 'online' || !!document.querySelector('.pe-bracket')), 15000);
	if (await page.evaluate(() => window.__pocket.mode === 'online')) {
		const lid = row('pkpvpcur:ann').id, lb = row('pkpvp:' + lid); lb.m.over = { winner: lb.m.config.players.findIndex(p => p.name === 'ann'), why: 'test' }; lb.rev++; setRow('pkpvp:' + lid, lb);
		await waitFor(() => page.evaluate(() => !!document.querySelector('.modal [data-k="totour"]')), 15000);
		await page.evaluate(() => document.querySelector('.modal [data-k="totour"]').click());
	}
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-bracket')), 10000), '?tour= opens the tournament (here after her own match)');
	const watch = await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="twatch:ben"]')), 10000);
	A(watch && await page.evaluate(() => !document.querySelector('[data-k="twatch:ann"]') && !document.querySelector('[data-k^="twatch:CPU"]')), "ben's live match has Watch; there is none for her own or a computer player's", await page.evaluate(() => [...document.querySelectorAll('[data-k^="twatch"]')].map(e => e.dataset.k)));
	const nav = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await page.evaluate(() => document.querySelector('[data-k="twatch:ben"]').click()); await nav;
	A(new RegExp(`\\?spectate=ben&tour=${TID}$`).test(page.url()), 'Watch: the spectator view of ben, remembering the tournament', page.url());
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready) && window.__pocket.mode === 'spectate'), 20000);
	const nav2 = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
	await page.evaluate(() => window.__pocket.leave ? window.__pocket.leave() : null);
	if (!(await nav2)) { const nav3 = page.waitForNavigation({ timeout: 15000 }).catch(() => null); await page.evaluate(() => { const m = document.querySelector('[data-k="menu"]'); m && m.click(); }); await sleep(300); await page.evaluate(() => { const l = [...document.querySelectorAll('[data-k="leave"]')].pop(); l && l.click(); }); await nav3; }
	A(new RegExp(`/pocketenhanced/\\?tour=${TID}$`).test(page.url()), 'leaving the spectator view: back to the tournament', page.url());
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-bracket')), 15000), 'and its bracket is on screen');
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
