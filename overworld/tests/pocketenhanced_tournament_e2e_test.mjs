// pocketenhanced_tournament_e2e_test.mjs — a tournament played from the page (owner's second improvement list,
// 2026-11-18, "yes to all": tournaments). pocketenhanced/js/main.js tourHost/tourScreen, server/pocket_pvp.mjs pkpvp-t*.
//   1. Play online > Host a tournament of 4: the tournament screen with its code; Start fills the seats with computer
//      players and draws the bracket
//   2. ann's match is ready: the page goes into it by itself (the table, an online match of this tournament)
//   3. her match won (the result written as the server would): its result offers "Back to the tournament"; the bracket
//      shows her through, and the final is entered by itself too
//   4. the final won: "You won the tournament!" with the stars, which reach her wallet
//   5. a second player (ben) who concedes his first match: back at the tournament, "You are out"
//   node overworld/tests/pocketenhanced_tournament_e2e_test.mjs
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
const PORT = 8681;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-tour-e2e-')), 'mp.bundle.mjs');
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
for (const n of ['ann', 'ben']) { tok[n] = (await call('register', { username: n, password: 'pocket-tour-e2e' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }
/** End a match with this winner, as the server would have it when it is played out. */
const winFor = (lid, name) => { const lb = row('pkpvp:' + lid); lb.m.over = { winner: lb.m.config.players.findIndex(p => p.name === name), why: 'test' }; lb.rev = (lb.rev || 0) + 1; setRow('pkpvp:' + lid, lb); };

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
	const mode = page => page.evaluate(() => window.__pocket.mode);
	// ===== 1 =====
	const a = await open('ann');
	await click(a.page, 'online'); await sleep(400);
	A(await click(a.page, 'thost4'), 'Play online: "Host a tournament of 4"');
	const code = await waitFor(() => a.page.evaluate(() => !!document.querySelector('[data-tcode]')), 8000) && await a.page.evaluate(() => document.querySelector('[data-tcode]').dataset.tcode);
	A(/^[A-Z2-9]{5}$/.test(code || ''), 'the tournament screen, with its code', code);
	// ben joins with the code before the start (through the server, as his page would)
	const bj = await call('pkpvp-tjoin', { code, deck: (await import('../../pocketenhanced/js/decks.js')).starterDeck('pikachu').deck, energy: ['Lightning'] }, tok.ben);
	A(!!bj.tour, '(ben joins with the code)', bj.error);
	await sleep(3000);
	A(await click(a.page, 'tstart'), 'the host starts it');
	// ===== 2 =====
	const inMatch = await waitFor(async () => (await mode(a.page)) === 'online' && await a.page.evaluate(() => !!window.__pocket.view()), 20000);
	const tid = bj.tour.id, lidA = row('pkpvpcur:ann').id;
	A(inMatch && row('pkpvp:' + lidA).tid === tid, "ann's match is ready: the page goes into it by itself", { inMatch, mode: await mode(a.page) });
	// ===== 5 (ben) =====
	const b = await open('ben');
	const bIn = await waitFor(async () => (await mode(b.page)) === 'online' && await b.page.evaluate(() => !!window.__pocket.view()), 15000);
	A(bIn, 'ben opening the page goes straight into his tournament match (rejoin)');
	const lidB = row('pkpvpcur:ben').id;
	// ===== 3 =====
	if (lidA === lidB) { winFor(lidA, 'ann'); }
	else { winFor(lidA, 'ann'); await call('pkpvp-act', { id: lidB, n: -1, a: { t: 'concede' } }, tok.ben); }
	const aEnd = await waitFor(() => a.page.evaluate(() => !!document.querySelector('.modal [data-k="totour"]')), 15000);
	A(aEnd, 'ann wins her match: its result offers "Back to the tournament"');
	await click(a.page, 'totour');
	// (the bracket shows her through; or, when the other semi-final is already decided, the final starts at once and the page
	// goes straight into it (as step 4 expects), so the bracket is gone before it can be read: then the tournament's own row
	// must show her through round 1 and her page in a new match. CI caught the second case several times.)
	const through = await waitFor(async () => (await a.page.evaluate(() => [...document.querySelectorAll('.pe-pair .won')].some(e => /^ann/.test(e.textContent))))
		|| ((row('pktour:' + tid) || { rounds: [] }).rounds[0] || []).some(x => x.winner === 'ann') && (await mode(a.page)) === 'online' && !!(row('pkpvpcur:ann') && row('pkpvpcur:ann').id && row('pkpvpcur:ann').id !== lidA), 10000);
	A(through, 'the bracket shows ann through', through ? '' : await a.page.evaluate(() => ({ mode: window.__pocket.mode, modals: [...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 300)), pairs: [...document.querySelectorAll('.pe-pair')].map(p => p.innerHTML.slice(0, 300)) })));
	const finIn = await waitFor(async () => (await mode(a.page)) === 'online' && row('pkpvpcur:ann') && row('pkpvpcur:ann').id && row('pkpvpcur:ann').id !== lidA, 30000);
	A(finIn, 'the final is ready: entered by itself');
	// ===== 4 =====
	winFor(row('pkpvpcur:ann').id, 'ann');
	await waitFor(() => a.page.evaluate(() => !!document.querySelector('.modal [data-k="totour"]')), 15000);
	await click(a.page, 'totour');
	const won = await waitFor(() => a.page.evaluate(() => /You won the tournament!/.test((document.querySelector('.pe-tourend') || {}).textContent || '')), 15000);
	const endText = await a.page.evaluate(() => (document.querySelector('.pe-tourend') || {}).textContent || '');
	A(won && /\+400 ★/.test(endText), '"You won the tournament! +400 ★"', endText);
	A((row('stars:ann') || { e: {} }).e.tour0 === 400, 'and the stars are in her wallet');
	// ===== 5 =====
	if (lidA !== lidB) {
		await waitFor(() => b.page.evaluate(() => !!document.querySelector('.modal [data-k="totour"]')), 15000);
		await click(b.page, 'totour');
		const out = await waitFor(() => b.page.evaluate(() => /You are out|Out in the semi-finals|The tournament is over/.test((document.querySelector('.pe-tour') || {}).textContent || '')), 10000);
		A(out, 'ben, who conceded: back at the tournament, out', await b.page.evaluate(() => ({ mode: window.__pocket.mode, modal: [...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 200)), toast: document.querySelector('.pe-banner').textContent })));
	} else A(true, '(ann and ben met in round 1: ben lost there)');
	A(!a.errors.length && !b.errors.length, 'no page errors', [...a.errors, ...b.errors].slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
