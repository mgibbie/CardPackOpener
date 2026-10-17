// micasurvivor_phone_test.mjs — MicaSurvivor on a phone (390px): touch controls appear.
// Portrait shows upstream's "rotate your phone" prompt; in landscape (844x390, touch) the
// game runs with body.touch, the floating joystick moves the partner, the on-canvas pause
// button pauses (with the touch hint), and a level-up card is taken with a tap. No console
// errors, no request to any non-localhost origin.
// Screenshots (portrait prompt, title, menu, mid-run, level-up) go to MICASURVIVOR_SHOTS=<dir>.
// Covers micasurvivor/index.html, micasurvivor/css/style.css, micasurvivor/js/core/touch.js,
// micasurvivor/js/ui/hud.js, micasurvivor/js/game.js (orientation + touch wiring).
//   node overworld/tests/micasurvivor_phone_test.mjs
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
const PORT = 8791;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
const external = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	await page.setRequestInterception(true);
	page.on('request', r => {
		const url = r.url();
		if (/^(data|blob):/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { r.continue(); return; }
		external.push(url); r.abort();
	});
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const tapEl = async (sel) => {
		const r = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
		if (!r) throw new Error('no element ' + sel);
		await page.touchscreen.tap(r.x, r.y);
	};

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000), 'boots on a phone', errors.slice(0, 3).join(' | '));
	await sleep(500);
	if (await visible('tap-start')) await tapEl('#tap-start');
	A(await page.evaluate(() => G.Touch.active && document.body.classList.contains('touch')), 'touch controls are on (body.touch)');
	A(await waitFor(() => visible('rotate'), 4000), 'portrait: "rotate your phone" prompt');
	A(/Rotate your phone/.test(await page.evaluate(() => document.getElementById('rotate').innerText)) && /MicaSurvivor/.test(await page.evaluate(() => document.getElementById('rotate').innerText)), 'prompt is English and names MicaSurvivor');
	await shot('phone_portrait_title.png');

	await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	A(await waitFor(async () => !await visible('rotate'), 4000), 'landscape: prompt goes away');
	A(await waitFor(() => visible('scr-login'), 8000), 'title screen in landscape');
	const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
	A(noScroll, 'no horizontal overflow');
	await shot('phone_title.png');
	await tapEl('#btn-guest');
	A(await waitFor(() => visible('scr-test'), 8000), 'tap Play -> personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await tapEl('#test-a button'); await sleep(150); }
	A(await waitFor(() => visible('scr-result'), 8000), 'result');
	await tapEl('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'menu');
	await sleep(1500);
	await shot('phone_menu.png');

	await tapEl('#scr-menu [data-go=play]');
	A(await waitFor(() => page.evaluate(() => G.Game.state === 'playing'), 15000), 'run starts from a tap');
	await sleep(1500);
	// floating joystick: put a finger down and drag right
	const p0 = await page.evaluate(() => ({ x: G.Game.player.x, y: G.Game.player.y }));
	await page.touchscreen.touchStart(420, 250);
	for (let i = 1; i <= 6; i++) { await page.touchscreen.touchMove(420 + i * 12, 250); await sleep(30); }
	const stick = await page.evaluate(() => !!G.Touch.stick);
	await sleep(1500);
	await shot('phone_midrun.png');
	await page.touchscreen.touchEnd();
	const p1 = await page.evaluate(() => ({ x: G.Game.player.x, y: G.Game.player.y }));
	A(stick, 'a finger on the field opens the joystick');
	A(p1.x - p0.x > 30 && Math.abs(p1.y - p0.y) < (p1.x - p0.x), `dragging right walks right (${Math.round(p0.x)} -> ${Math.round(p1.x)})`);
	A(await page.evaluate(() => !G.Touch.stick), 'lifting the finger releases the joystick');
	// on-canvas pause button (top right)
	await page.touchscreen.tap(844 - 52 + 20, 12 + 20);
	A(await waitFor(() => visible('scr-pause'), 4000), 'the HUD pause button pauses');
	A(await page.evaluate(() => getComputedStyle(document.querySelector('#scr-pause .touch-hint')).display !== 'none'), 'pause shows the touch hint, not the keyboard one');
	await tapEl('#btn-resume');
	A(await waitFor(() => page.evaluate(() => G.Game.state === 'playing'), 4000), 'resume');

	// walk to XP orbs (keyboard steering) until a level-up, then take a card with a tap
	let held = [];
	const hold = async (keys) => { for (const k of held) if (!keys.includes(k)) await page.keyboard.up(k); for (const k of keys) if (!held.includes(k)) await page.keyboard.down(k); held = keys; };
	const t0 = Date.now();
	while (!await visible('scr-levelup') && Date.now() - t0 < 90000) {
		if (await visible('scr-item') || await visible('scr-bond')) { await page.evaluate(() => { const c = document.querySelector('#scr-item:not(.hidden) .cards > *, #scr-bond:not(.hidden) .cards > *'); if (c) c.click(); }); await sleep(300); continue; }
		const dir = await page.evaluate(() => {
			const p = G.Game.player; if (!p) return null;
			const d2 = o => (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
			const near = l => l.reduce((b, o) => (!b || d2(o) < d2(b) ? o : b), null);
			const t = near(G.Pickups.all().filter(o => /^xp/.test(o.kind))) || near(G.EnemyMgr.all().filter(e => !e.dead));
			return t ? [t.x - p.x, t.y - p.y] : null;
		});
		const keys = [];
		if (dir) { const [dx, dy] = dir, m = Math.hypot(dx, dy) || 1; if (dx / m > 0.38) keys.push('KeyD'); else if (dx / m < -0.38) keys.push('KeyA'); if (dy / m > 0.38) keys.push('KeyS'); else if (dy / m < -0.38) keys.push('KeyW'); }
		await hold(keys);
		await sleep(250);
	}
	await hold([]);
	A(await visible('scr-levelup'), 'level-up screen on the phone');
	await sleep(500);
	await shot('phone_levelup.png');
	const fits = await page.evaluate(() => { const b = document.querySelector('#scr-levelup .box').getBoundingClientRect(); return b.top >= -1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.right <= innerWidth + 1; });
	A(fits, 'level-up box fits the 390px-tall screen');
	const lv = await page.evaluate(() => G.Game.player.level);
	await tapEl('#cards > *');
	A(await waitFor(async () => !await visible('scr-levelup'), 4000), `tapping a card takes it (level ${lv})`);

	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
	A(external.length === 0, 'no request to any non-localhost origin', external.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
