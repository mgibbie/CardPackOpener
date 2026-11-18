// pocketenhanced_profile_test.mjs — profiles, and emblems where others see them (owner's third improvement list,
// 2026-11-18, "yes to all": "Emblems on the ranked board and in online lobbies" and "Profile card. Tap any player's name
// ... to see their emblems, rating, record, favourite deck and a showcase of 3 cards"). server/pocket_profile.mjs,
// pocket_rank.mjs get, pocket_pvp.mjs deckOf/lobbyView/tourView; main.js profSync/nameTag/profileCard.
//   1. pkprof-set: only an emblem their progress has earned, only showcase cards they own, a plain deck name; pkprof-get:
//      emblem, count, this season's rating and record, showcase; an unknown player is an empty card; needs an account
//   2. the ranked board, a lobby and a tournament carry each player's emblem
//   3. the page: the board shows the emblem by the name; tapping the name opens the card
//   node overworld/tests/pocketenhanced_profile_test.mjs
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
import * as SO from '../../pocketenhanced/js/solo.js';
import { starterDeck } from '../../pocketenhanced/js/decks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8685;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-prof-')), 'mp.bundle.mjs');
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
for (const n of ['ann', 'ben', 'cat']) { tok[n] = (await call('register', { username: n, password: 'pocket-prof-pass' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }

const season = new Date().toISOString().slice(0, 7);
// ===== 1. setting a profile =====
{
	const r0 = await call('pkprof-set', { emblem: 'win1' }, tok.ben);
	A(/not earned/.test(r0.error || ''), 'an emblem not earned cannot be shown', r0);
	setRow('pksolo:ben', { rev: 1, solo: { ...SO.newProgress(), emblems: { win1: 1, gym8: 1, types: 1 } }, at: 1, ids: [] });
	const owned = Object.keys(C.newCollection().prints)[0];
	const bad = await call('pkprof-set', { emblem: 'gym8', showcase: ['A1-284'] }, tok.ben);
	A(/must be in your collection/.test(bad.error || ''), 'a showcase card not owned is refused', bad);
	const ok = await call('pkprof-set', { emblem: 'gym8', showcase: [owned], deck: 'My <b>Fire</b> deck' }, tok.ben);
	A(ok.ok && ok.profile.emblem === 'gym8' && ok.profile.emblems === 3 && ok.profile.showcase.join() === owned && ok.profile.deck === 'My bFire/b deck', 'an earned emblem, an owned showcase card and a plain deck name are kept (3 emblems counted)', ok);
	setRow('pkrank:ben', { rev: 1, season, rating: 1234, games: 7, wins: 5, best: 1250, done: [] });
	const g = await call('pkprof-get', { name: 'ben' }, tok.ann);
	A(g.emblem === 'gym8' && g.emblems === 3 && g.rating === 1234 && g.best === 1250 && g.games === 7 && g.wins === 5 && g.showcase.length === 1, "anyone signed in sees ben's card: emblem, count, rating, record, showcase", g);
	const none = await call('pkprof-get', { name: 'cat' }, tok.ann);
	A(none.emblem === null && none.emblems === 0 && none.rating === null && none.showcase.length === 0, 'a player with no profile: an empty card, no error', none);
	A((await call('pkprof-get', { name: 'ben' })).error, 'not signed in: refused');
}
// ===== 2. the ranked board, the lobby and the tournament carry the emblem =====
{
	setRow('pkrankboard:' + season, { rev: 1, rows: [{ name: 'ben', rating: 1234, games: 7 }, { name: 'cat', rating: 1100, games: 5 }] });
	const rk = await call('pkrank-get', {}, tok.ann);
	A(rk.board && rk.board.find(x => x.name === 'ben').emblem === 'gym8' && rk.board.find(x => x.name === 'cat').emblem === null, "the ranked board: ben's emblem beside his name, none for cat", rk.board);
	const D = starterDeck('pikachu');
	const made = await call('pkpvp-create', { size: 2, ...D }, tok.ben);
	A(made.lobby && made.lobby.players[0].emblem === 'gym8', 'a lobby ben hosts shows his emblem', made.lobby && made.lobby.players);
	await call('pkpvp-leave', { id: made.lobby.id }, tok.ben);
	const tc = await call('pkpvp-tcreate', { size: 4, ...D }, tok.ben);
	A(tc.tour && tc.tour.emblems && tc.tour.emblems.ben === 'gym8', "a tournament's view carries ben's emblem", tc.tour && tc.tour.emblems);
	await call('pkpvp-tleave', { tid: tc.tour.id }, tok.ben);
}
// ===== 3. the page: tap a name on the ranked board =====
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	const st = (await call('state', {}, tok.ann)).state;
	await page.evaluateOnNewDocument((t, st) => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { /* */ } }, tok.ann, st);
	await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const click = k => page.evaluate(k => { const e = [...document.querySelectorAll(`[data-k="${k}"]`)].pop(); if (e) e.click(); return !!e; }, k);
	await click('online'); await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="rankboard"]')), 8000);
	await click('rankboard'); await sleep(400);
	const tag = await page.evaluate(() => { const n = document.querySelector('.pe-board [data-prof="ben"]'); return n ? { emb: !!n.querySelector('.pe-emb'), text: n.textContent } : null; });
	A(tag && tag.emb, "the board on the page: ben's name with his emblem", tag);
	await page.evaluate(() => document.querySelector('.pe-board [data-prof="ben"]').click());
	const card = await waitFor(() => page.evaluate(() => /Emblems: 3 of 17/.test((document.querySelector('.pe-profile') || {}).textContent || '')), 8000);
	const text = await page.evaluate(() => (document.querySelector('.pe-profile') || {}).textContent || '');
	A(card && /Badge Case/.test(text) && /Ranked: 1234 \(best 1250\) · 5 won of 7/.test(text) && /Favourite deck: My bFire\/b deck/.test(text) && await page.evaluate(() => document.querySelectorAll('.pe-profile .pe-showcase .pf').length === 1), "tapping it: ben's card (emblem, count, ranked record, favourite deck, showcase)", text.slice(0, 300));
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
