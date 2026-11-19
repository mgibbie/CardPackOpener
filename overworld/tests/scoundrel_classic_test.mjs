// scoundrel_classic_test.mjs — the original Love2D Scoundrel (scoundrel/classic/, love.js) is linked from the
// web-native Scoundrel's main menu instead of sitting orphaned (owner's list 5, item 10, 2026-11-19).
//   1. /scoundrel/'s main menu has "Classic version" -> /scoundrel/classic/, a link the controller can reach
//   2. following it loads the classic build: every file it asks for is there (no 404s), the loading screen
//      finishes and the game's canvas shows
//   node overworld/tests/scoundrel_classic_test.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeAsserter, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const R = makeAsserter(), A = R.A;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
let browser;
try {
	browser = await launch();
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 800 });
	const missing = [], errors = [];
	page.on('response', r => { if (r.status() === 404 && !/favicon\.ico$/.test(r.url())) missing.push(r.url()); });
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); } catch { /* ignore */ } });
	await page.goto(`http://localhost:${port}/scoundrel/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready)), 20000), 'Scoundrel boots');
	await sleep(500);
	const link = await page.evaluate(() => {
		const a = document.querySelector('.menu-modal .b-classic'), r = a && a.getBoundingClientRect();
		return a ? { href: a.getAttribute('href'), text: a.textContent, shown: r.width > 4 && r.height > 4, inModal: !!a.closest('.modal') } : null;
	});
	A(link && link.href === '/scoundrel/classic/' && /Classic version/.test(link.text), 'the main menu has "Classic version" -> /scoundrel/classic/', JSON.stringify(link));
	// (the controller's stops in a modal are its .btn and <a> elements: a shown link in the menu is reachable)
	A(link && link.shown && link.inModal, 'it is shown in the menu modal, where the controller and keyboard reach links');
	const nav = page.waitForNavigation({ timeout: 20000 }).catch(() => null);
	await page.click('.menu-modal .b-classic');
	await nav;
	A(new URL(page.url()).pathname === '/scoundrel/classic/', 'clicking it opens the classic build', page.url());
	const loaded = await waitFor(() => page.evaluate(() => window.Module && Module.remainingDependencies === 0 && document.getElementById('loadingCanvas').style.display === 'none'), 45000);
	const cv = await page.evaluate(() => { const c = document.getElementById('canvas'), r = c.getBoundingClientRect(); return { vis: getComputedStyle(c).visibility, w: r.width, h: r.height }; });
	A(loaded && cv.vis === 'visible' && cv.w >= 200 && cv.h >= 150, "the classic build loads: its loading screen finishes and the game's canvas shows", JSON.stringify(cv));
	A(!missing.length, 'every file it asks for is there (no 404s)', missing.slice(0, 5));
	A(!errors.length, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
