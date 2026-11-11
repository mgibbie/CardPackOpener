// pairofpears_guest_test.mjs — Pair of Pears must be playable by someone who is NOT logged in (owner, 2026-11-11:
// "make sure pair of pears is playable by people who are not logged in"). An account adds only things round the game
// (friends watching, chat); the game itself is local. This plays it in a real browser, with no login, against a server
// that treats a guest as badly as it can:
//   * refused   every account call answers 401
//   * down      every account call is cut off, and the account code itself (battlecards/mpmode.js) cannot be loaded
//   * stale     the browser holds a login the server no longer accepts (an old token; every call 401)
// In each: the page boots to its menu without being sent to the login page, New Run starts a run, cards flip, a pair
// scores, the level is won, the run is saved in this browser and is there to Continue after a reload, and nothing
// throws. For a guest, logging in is an offer on the menu (a link), never a wall.
//   node overworld/tests/pairofpears_guest_test.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 9823;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let mode = 'refused';
const calls = { api: 0, mpmode: 0 };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) {
		calls.api++;
		for await (const _ of req) { /* drain */ }
		if (mode === 'down') { req.socket.destroy(); return; }
		res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"not logged in"}'); return;
	}
	if (mode === 'down' && u === '/battlecards/mpmode.js') { calls.mpmode++; res.writeHead(404); res.end('nf'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--mute-audio'] });
	const CASES = [
		['refused', 'the server refuses every account call', { width: 1280, height: 720, deviceScaleFactor: 1 }],
		['down', 'the account service is unreachable and its code will not load', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
		['stale', 'the browser holds a login the server no longer accepts', { width: 1280, height: 720, deviceScaleFactor: 1 }],
	];
	for (const [m, what, vp] of CASES) {
		mode = m; calls.api = 0; calls.mpmode = 0;
		const ctx = await browser.createBrowserContext();   // a fresh profile: nothing stored, no login
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [], navs = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname); });
		await page.evaluateOnNewDocument((stale) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); if (stale && !sessionStorage.getItem('planted')) { sessionStorage.setItem('planted', '1'); localStorage.setItem('magepunk_mp_token_v1', 'an-old-login-the-server-has-forgotten'); } } catch { /* ignore */ }
		}, m === 'stale');
		const view = () => page.evaluate(() => window.__pears.view());
		const idle = () => waitFor(() => page.evaluate(() => window.__pears.idle()), 8000);
		const centerOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
		const tapAt = async (r) => { if (vp.hasTouch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y); };
		const stillAt = async (sel) => { let prev = await centerOf(sel); for (let i = 0; i < 30; i++) { await sleep(120); const r = await centerOf(sel); if (r && prev && Math.abs(r.x - prev.x) < 0.5 && Math.abs(r.y - prev.y) < 0.5) return r; prev = r; } return prev; };
		const cardUp = (id) => view().then((v) => { const c = v && v.cards.find((x) => x.id === id); return !c || c.up || c.m; });
		const clickCard = async (id) => { for (let i = 0; i < 4; i++) { await idle(); const r = await stillAt(`.cards-layer .card[data-id="${id}"]`); if (r) await tapAt(r); if (await waitFor(() => cardUp(id), 1500)) return; } };

		await page.goto(`http://localhost:${PORT}/pairofpears/`, { waitUntil: 'domcontentloaded' });
		const booted = await waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 25000);
		A(booted, `${m} (${what}): the page boots`, errors.join(' | '));
		if (!booted) { await ctx.close(); continue; }
		const menu = await page.evaluate(() => ({
			path: location.pathname, newRun: !!document.querySelector('.menu-modal .b-new'), token: !!localStorage.getItem('magepunk_mp_token_v1'),
			login: (() => { const a = document.querySelector('.menu-foot a.login-link'); return a ? a.getAttribute('href') : null; })(),
			wall: !!document.querySelector('form[action*=login], input[type=password]') || /log in to play|sign in to play|must (log|sign) in/i.test(document.body.innerText),
		}));
		A(menu.path === '/pairofpears/' && navs.every((p) => p === '/pairofpears/') && menu.newRun && !menu.wall, `${m}: you are on the game's menu with New Run on it: not sent to the login page, no login wall`, JSON.stringify([menu, navs]));
		if (m === 'stale') A(!menu.token && calls.api > 0, 'stale: the dead login is forgotten and the page has come back as a guest page (it used to be thrown to the login page)', JSON.stringify([menu, navs, calls]));
		if (m !== 'stale') A(!menu.token && (m === 'down' ? true : /^\/login\/\?next=/.test(menu.login || '')), `${m}: you are a guest${m === 'refused' ? '; logging in is an offer on the menu (a link to /login/ that comes back here)' : ''}`, JSON.stringify(menu));

		// a run, by the page's own inputs
		const r = await centerOf('.menu-modal .b-new'); await tapAt(r);
		A(await waitFor(async () => { const v = await view(); return v && v.cards && v.cards.length === 6; }, 8000), `${m}: New Run deals level 1`);
		await idle();
		let cs = await page.evaluate(() => window.__pears.engine._cards());
		const fruit = (f) => cs.filter((c) => c.fruit === f && !c.matched);
		const other = [...new Set(cs.map((c) => c.fruit))].find((f) => f !== 'pear');
		await clickCard(fruit(other)[0].id); await clickCard(fruit(other)[1].id);
		A(await waitFor(async () => (await view()).pairs === 1, 5000), `${m}: two cards flip and match: a pair, and Berries for it (${(await view()).berries})`, JSON.stringify(await view()));
		A(await waitFor(() => page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('magepunk_pears_v1')); return !!(s && s.run && s.run.level === 1); } catch { return false; } }), 4000), `${m}: the run is saved in this browser as you play`);
		// leave and come back: it is there to continue
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 25000);
		const cont = await page.evaluate(() => { const b = document.querySelector('.menu-modal .b-continue') || [...document.querySelectorAll('.menu-modal button')].find((q) => /continue/i.test(q.textContent)); return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
		A(cont && /Level 1/.test(cont), `${m}: after a reload the menu offers to continue it ("${cont}")`, String(cont));
		const cb = await page.evaluate(() => { const b = document.querySelector('.menu-modal .b-continue') || [...document.querySelectorAll('.menu-modal button')].find((q) => /continue/i.test(q.textContent)); const bb = b.getBoundingClientRect(); return { x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 }; });
		await tapAt(cb);
		await waitFor(async () => { const v = await view(); return v && v.cards && v.pairs === 1; }, 8000);
		await idle();
		// win the level: the Pears
		cs = await page.evaluate(() => window.__pears.engine._cards());
		const pears = cs.filter((c) => c.fruit === 'pear' && !c.matched);
		await clickCard(pears[0].id); await clickCard(pears[1].id);
		const won = await waitFor(async () => { const v = await view(); return v && (v.level > 1 || v.won || v.cleared || v.shop || /level (clear|complete)|cleared|shop|next level/i.test(await page.evaluate(() => document.body.innerText))); }, 8000);
		A(won, `${m}: matching the Pears wins the level`, JSON.stringify(await view()).slice(0, 300));
		await sleep(600);
		A(errors.length === 0, `${m}: nothing threw (${calls.api} account calls were ${m === 'down' ? 'cut off' : 'refused'}${m === 'down' ? ', and the account code failed to load ' + calls.mpmode + ' time(s)' : ''})`, errors.slice(0, 4).join(' | '));
		A(navs.every((p) => p === '/pairofpears/'), `${m}: and you were never taken off the game's page`, navs.join(' -> '));
		await ctx.close();
	}
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
