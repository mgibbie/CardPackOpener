// index_nav_test.mjs — the main page (/) with no mouse (controls sweep B2): site/focusnav.js
// drives the tiles. Keyboard only (arrows / WASD / Z / Enter) and a fake controller
// (d-pad / A) pick a game; on a phone (portrait) a tap still opens a tile.
//
//   node overworld/tests/index_nav_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
// the page itself is real; anywhere it leads to is a stub (only the URL matters here)
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"state":null}'); }
	const f = u === '/' ? '/index.html' : u;
	if (/\/$/.test(f) || /\/(start|pokechess)\.html$/.test(f)) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<title>stub</title>stub'); }
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const open = async (viewport = { width: 1280, height: 800 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(viewport);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
		});
		await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 60 && !(await page.evaluate(() => !!window.__focusnav && !!window.__mpSwitcher)); i++) await sleep(100);
		await sleep(300);
		const focus = () => page.evaluate(() => { const f = window.__focusnav.focused; return f ? { href: f.getAttribute('href'), ring: f.classList.contains('focusnav-focus'), cls: f.className } : null; });
		const press = async k => { await page.keyboard.press(k); await sleep(60); };
		const tap = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(80); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(120); };
		return { ctx, page, errors, focus, press, tap };
	};

	// ---- keyboard only ----
	{
		const t = await open();
		await t.press('KeyS');
		let f = await t.focus();
		A(f && f.href === 'battlecards/start.html' && f.ring, 'the first key shows focus on the Featured Battlecards card, with the ring', JSON.stringify(f));
		await t.press('KeyS');
		f = await t.focus();
		A(f && /tile/.test(f.cls), 'S moves down into the Play grid', JSON.stringify(f));
		const seen = new Set([f.href]);
		for (let i = 0; i < 3; i++) { await t.press('KeyD'); seen.add((await t.focus()).href); }
		A(seen.size >= 3, 'D walks across the game tiles', [...seen].join(' '));
		await t.page.evaluate(() => window.__focusnav.focusTo(document.querySelector('a.tile[href="micatro/"]')));
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.press('KeyZ');
		await nav;
		A(new URL(t.page.url()).pathname === '/micatro/', 'Z opens the focused game', t.page.url());
		A(t.errors.length === 0, 'no page errors', t.errors.join(' | '));
		await t.ctx.close();
	}
	{
		const t = await open();
		await t.press('ArrowDown'); await t.press('ArrowDown');
		const href = (await t.focus()).href;
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.press('Enter');
		await nav;
		A(new URL(t.page.url()).pathname === '/' + href.replace(/\?.*/, ''), 'arrows + Enter open a tile too', `${href} -> ${t.page.url()}`);
		await t.ctx.close();
	}
	// ---- the controller only ----
	{
		const t = await open();
		await t.tap(13); await t.tap(13); await t.tap(15);
		const f = await t.focus();
		A(f && /tile/.test(f.cls) && f.ring, 'the d-pad moves over the tiles', JSON.stringify(f));
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.tap(1);   // A (the right face, Nintendo layout)
		await nav;
		A(new URL(t.page.url()).pathname === '/' + f.href.replace(/\?.*/, ''), 'A opens the focused game', `${f.href} -> ${t.page.url()}`);
		await t.ctx.close();
	}
	// ---- the wiki's Controls page documents the keyboard map and the switcher ----
	{
		const t = await open();
		await t.page.goto(`http://localhost:${PORT}/designwiki/index.html#/controls`, { waitUntil: 'domcontentloaded' });
		const ok = await (async () => { for (let i = 0; i < 50; i++) { const txt = await t.page.evaluate(() => document.body.innerText); if (/Games switcher/.test(txt)) return txt; await sleep(100); } return ''; })();
		A(/Games switcher/.test(ok) && /Backspace/.test(ok) && /W A S D/.test(ok) && /hold Esc/.test(ok), 'the wiki Controls page has the keyboard map and the Games switcher');
		A(await t.page.evaluate(() => !!document.querySelector('.site-home[data-mp-switcher]') && !!window.__mpSwitcher), "the wiki's ⚙️ opens the Games switcher");
		await t.ctx.close();
	}
	// ---- a phone: taps still work, and no ring appears for touch ----
	{
		const t = await open({ width: 390, height: 844, isMobile: true, hasTouch: true });
		const r = await t.page.evaluate(() => { const b = document.querySelector('a.tile[href="scoundrel/"]'); b.scrollIntoView({ block: 'center' }); const q = b.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
		const nav = t.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
		await t.page.touchscreen.tap(r[0], r[1]);
		await nav;
		A(new URL(t.page.url()).pathname === '/scoundrel/', 'portrait: tapping a tile opens it');
		await t.ctx.close();
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
