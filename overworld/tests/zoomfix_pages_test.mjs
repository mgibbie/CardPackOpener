// zoomfix_pages_test.mjs — the full-screen game pages can't strand iPhone Safari zoomed in
// (a tester got stuck zoomed into Micatro; the same pattern was on these pages).
// Covers site/zoomfix.js + site/zoomguard.js and the pages that load it:
// overworld/index.html, overworld/pokechess.html, battlecards/viewer.html,
// pairofpears/index.html (the Micatro-UI card game), scoundrel/index.html + scoundrel/classic/, micasurvivor/m3d/ (3D Expedition;
// it also refuses the pinch itself: see the end of this file) (Micatro: micatro_zoom_test.mjs).
//   node overworld/tests/zoomfix_pages_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8762;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.data': 'application/octet-stream' };
const STATE = { username: 'zoomfix', friendCode: 'ZOOMFX', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };

// [page, locks zoom (guard expected)]
const PAGES = [
	['/overworld/index.html', true],
	['/battlecards/viewer.html', true],
	['/pairofpears/index.html', true],
	['/scoundrel/index.html', true],
	['/scoundrel/classic/index.html', true],   // (the original love.js build, kept reachable)
	['/micasurvivor/m3d/index.html', true],   // (3D Expedition: two thumbs on the screen were taken for a pinch, owner 2026-11-12)
	['/overworld/pokechess.html', false],
];

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [] })); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	for (const [url, locks] of PAGES) {
		const page = await browser.newPage();
		await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', st.username);
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, STATE);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const loaded = await page.waitForFunction(() => window.__zoomGuard !== undefined, { timeout: 15000 }).then(() => true).catch(() => false);
		const r = await page.evaluate(() => {
			const vis = (el) => el && getComputedStyle(el).touchAction;
			const btn = document.querySelector('button, a, [role="button"]') || (() => { const d = document.createElement('div'); document.body.appendChild(d); return d; })();
			const canvas = document.querySelector('canvas');
			return { css: !!document.getElementById('zoomfix-css'), guard: !!window.__zoomGuard, guardKnown: window.__zoomGuard !== undefined,
				el: vis(btn), canvas: canvas ? vis(canvas) : null };
		});
		A(loaded && r.css, `${url}: loads /site/zoomfix.js`, JSON.stringify(r));
		A(r.el === 'manipulation' || r.el === 'none', `${url}: page elements can't double-tap zoom (touch-action ${r.el})`, JSON.stringify(r));
		A(r.canvas == null || r.canvas === 'none', `${url}: the game canvas keeps full touch control (none)`, JSON.stringify(r));
		A(r.guard === locks, `${url}: zoom guard ${locks ? 'installed (page locks zoom)' : 'NOT installed (page allows zoom on purpose)'}`, JSON.stringify(r));
		if (locks) {
			const n = await page.evaluate(async () => {
				const vv = window.visualViewport, meta = document.querySelector('meta[name="viewport"]');
				let k = 0; const mo = new MutationObserver(() => k++); mo.observe(meta, { attributes: true });
				Object.defineProperty(vv, 'scale', { configurable: true, get: () => 2 });
				vv.dispatchEvent(new Event('resize'));
				await new Promise(r => setTimeout(r, 600));
				delete vv.scale; mo.disconnect();
				return k;
			});
			A(n >= 2, `${url}: a zoom (scale 2) is snapped back`, n);
		}
		await page.close();
	}
	// 3D Expedition: the pinch itself is refused (two thumbs are how it is played)
	{
		const page = await browser.newPage();
		await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/index.html`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => !!(window.__m3d && window.__m3d.ready), { timeout: 30000 }).catch(() => {});
		const r = await page.evaluate(() => {
			const fire = (type, init) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, init || {}); document.getElementById('c').dispatchEvent(e); return e.defaultPrevented; };
			const two = { touches: [{ identifier: 1 }, { identifier: 2 }] }, one = { touches: [{ identifier: 1 }] };
			const inp = document.createElement('input'); document.body.appendChild(inp);
			const ie = new Event('gesturestart', { bubbles: true, cancelable: true }); inp.dispatchEvent(ie); inp.remove();
			return { gs: fire('gesturestart'), gc: fire('gesturechange'), two: fire('touchmove', two), one: fire('touchmove', one), typing: ie.defaultPrevented, ready: !!(window.__m3d && window.__m3d.ready) };
		});
		A(r.ready && r.gs && r.gc && r.two, '/micasurvivor/m3d/: a pinch is refused (Safari\'s gesture events, and a move with two fingers down)', JSON.stringify(r));
		A(!r.one && !r.typing, '/micasurvivor/m3d/: one finger moving is left alone, and so is a text box', JSON.stringify(r));
		await page.close();
	}
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
