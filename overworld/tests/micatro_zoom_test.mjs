// micatro_zoom_test.mjs — iPhone Safari must not get stuck zoomed into the Micatro board.
// A tester double-tapped into the right half of the board and couldn't zoom back out: iOS
// ignores `user-scalable=no` and `touch-action: none`, honouring only `manipulation`.
// Covers micatro/css/micatro.css (html/body touch-action), micatro/js/ui/zoomguard.js
// (shouldReset / resetZoom / installZoomGuard) and its wiring in micatro/js/ui/main.js.
//   node overworld/tests/micatro_zoom_test.mjs
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
const PORT = 8761;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
	await page.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__micatro && window.__micatro.ready, { timeout: 60000 });

	// 1. the page asks for `manipulation` (the only value iOS honours that kills double-tap zoom)
	const ta = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).touchAction, body: getComputedStyle(document.body).touchAction }));
	A(ta.html === 'manipulation' && ta.body === 'manipulation', 'html/body use touch-action: manipulation (iOS ignores none)', JSON.stringify(ta));

	// 2. the guard is installed and its rules are right
	const g = await page.evaluate(async () => {
		const Z = await import('/micatro/js/ui/zoomguard.js');
		const inp = document.createElement('input'); inp.type = 'text';
		const chk = document.createElement('input'); chk.type = 'checkbox';
		const meta = document.querySelector('meta[name="viewport"]');
		const before = meta.getAttribute('content');
		const seen = [];
		const mo = new MutationObserver(() => seen.push(meta.getAttribute('content')));
		mo.observe(meta, { attributes: true });
		const did = Z.resetZoom(document);
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		mo.disconnect();
		return {
			installed: !!window.__micatroZoomGuard,
			zoomed: Z.shouldReset(2, document.body), notZoomed: Z.shouldReset(1, document.body),
			typing: Z.shouldReset(2, inp), checkbox: Z.shouldReset(2, chk),
			did, rewrote: seen.length >= 2 && seen[0] !== before, restored: meta.getAttribute('content') === before,
		};
	});
	A(g.installed, 'main.js installs the zoom guard', JSON.stringify(g));
	A(g.zoomed && !g.notZoomed, 'a zoomed page (scale 2) is snapped back; 1x is left alone', JSON.stringify(g));
	A(!g.typing && g.checkbox, 'not while typing in a text box (a checkbox is not typing)', JSON.stringify(g));
	A(g.did && g.rewrote && g.restored, 'resetZoom rewrites the viewport meta (what iOS re-reads) then restores it exactly', JSON.stringify(g));

	// 3. the guard reacts to a real visualViewport zoom: report scale 2 and fire resize
	const reacted = await page.evaluate(async () => {
		const vv = window.visualViewport, meta = document.querySelector('meta[name="viewport"]');
		let n = 0; const mo = new MutationObserver(() => n++); mo.observe(meta, { attributes: true });
		Object.defineProperty(vv, 'scale', { configurable: true, get: () => 2 });
		vv.dispatchEvent(new Event('resize'));
		await new Promise(r => setTimeout(r, 600));
		delete vv.scale; mo.disconnect();
		return n;
	});
	A(reacted >= 2, 'a pinch/double-tap zoom (visualViewport scale 2) triggers the reset', reacted);
} finally {
	await browser.close(); server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
