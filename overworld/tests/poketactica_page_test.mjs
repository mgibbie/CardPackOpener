// poketactica_page_test.mjs — Poketactica's page (stage 4): it boots on MicaSurvivor 3D's renderer with the Balatro HUD,
// and the whole game plays by keyboard, by controller and by touch (the house rules: Plans/NEW_GAME_RULES.md). The arrow
// keys move the cursor the way they point ON SCREEN (Disgaea's diamond: up = up-right), also after the camera turns; the
// whole board fits a phone upright and on its side; no page errors.
// Needs headless Chrome/Edge + overworld/data + micasurvivor/assets (the PMD sheets).
//   node overworld/tests/poketactica_page_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8933;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const BTN = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

async function open(vp) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument(() => {
		try { localStorage.setItem('micatro_sfx', '0'); } catch { /* ignore */ }
		const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
		window.__owFakePads = [pad]; window.__pad = pad;
	});
	await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
	await sleep(800);
	const t = { ctx, page, errors };
	t.key = async (k, ms = 140) => { await page.keyboard.press(k); await sleep(ms); };
	t.idle = () => page.evaluate(() => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 20000 ? r() : setTimeout(k, 80)); k(); }));
	t.st = () => page.evaluate(() => { const P = window.__poketactica.P, S = P.S; return { phase: S.phase, turn: S.turn, mode: P.mode, cursor: { ...P.cursor }, units: S.units.map((u) => ({ uid: u.uid, side: u.side, x: u.x, y: u.y, hp: u.hp, moved: u.moved, acted: u.acted })), queue: S.queue.length, menu: P.menu ? P.menu.items.map((i) => i.label.replace(/<[^>]+>/g, '')) : null }; });
	t.tap = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(200); };
	return t;
}

try {
	// ---------- keyboard: deploy, move, attack, execute, end phase
	{
		const t = await open({ width: 1280, height: 760 });
		const p = t.page;
		A(await p.evaluate(() => window.__poketactica.ready && !!document.querySelector('#c')), 'the page boots (renderer, data, the battle)');
		A(await p.evaluate(() => getComputedStyle(document.getElementById('boot')).display === 'none'), 'the loading screen goes away');
		const sprites = await p.evaluate(() => new Promise((r) => setTimeout(() => r((window.__poketactica.P.drawn || []).length), 1500)));
		A(sprites >= 4, 'the wild Pokémon are drawn as sprites', sprites);
		// REGRESSION: the sprites' shader keeps its own fog (MicaSurvivor's 26-78 m); this camera is 60 m away, so left alone every
		// sprite came out 65% sky-blue. The page moves it off the board with render.js setFog.
		const fogNear = await p.evaluate(() => { for (const s of window.__poketactica.sheets.values()) if (s) return s.batch.material.uniforms.uFogNear.value; return null; });
		A(fogNear > 200, "the sprites are not fogged (their shader's fog starts beyond the board)", fogNear);
		let s = await t.st();
		A(s.cursor.x === 1 && s.cursor.y === 8, 'the cursor starts on the base tile');
		// the arrows point the way they move on screen (Disgaea's diamond): up = up-right, right = down-right
		const scr = (x, y) => p.evaluate((x, y) => window.__poketactica.screenOf(x, y), x, y);
		const dirOK = async (k, wantDx, wantDy) => { const a = await t.st(); const s0 = await scr(a.cursor.x, a.cursor.y); await t.key(k); const b = await t.st(); const s1 = await scr(b.cursor.x, b.cursor.y); return Math.sign(s1[0] - s0[0]) === wantDx && Math.sign(s1[1] - s0[1]) === wantDy; };
		await t.key('ArrowLeft'); await t.key('ArrowDown');   // (off the board's edge first)
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1) && await dirOK('ArrowDown', -1, 1) && await dirOK('ArrowLeft', -1, -1), 'the arrows move the cursor the way they point on screen');
		await t.key('KeyE', 300);
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1), '... and still do after E turns the camera');
		await t.key('KeyQ', 300);
		await p.evaluate(() => { const P = window.__poketactica.P; P.cursor = { ...P.S.map.base }; });
		await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		const p0 = s.units.find((u) => u.uid === 'p0');
		A(p0.x === 1 && p0.y === 8, 'Z on the empty base deploys a figurine');
		await t.key('KeyZ');
		s = await t.st();
		A(s.mode === 'unit' && s.menu && s.menu.includes('Move') && s.menu.includes('Attack'), 'Z on it opens its menu', JSON.stringify(s.menu));
		await t.key('KeyZ');   // Move
		const before = (await t.st()).cursor;
		// walk the cursor to a reachable tile and confirm
		const goal = await p.evaluate(() => { const P = window.__poketactica.P; const t = P.hl.move.filter(([x, y]) => x !== 1 || y !== 8)[0]; return t; });
		await p.evaluate((g) => { window.__poketactica.P.cursor = { x: g[0], y: g[1] }; }, goal);
		await t.key('KeyZ', 300); await t.idle();
		s = await t.st();
		const moved = s.units.find((u) => u.uid === 'p0');
		A(moved.x === goal[0] && moved.y === goal[1] && moved.moved, 'Move, then Z on a highlighted tile moves it', JSON.stringify([before, goal, moved]));
		await t.key('KeyX', 200); await t.key('KeyX', 200);
		// End the phase by keyboard: Enter -> End phase
		await t.key('Enter');
		s = await t.st();
		A(s.menu && s.menu.includes('End phase'), 'Enter opens the phase menu', JSON.stringify(s.menu));
		await t.key('ArrowDown'); await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		A(s.turn === 2 && s.phase === 'player', 'End phase plays the enemy phase; it is turn 2', JSON.stringify([s.turn, s.phase]));
		A(t.errors.length === 0, 'no page errors (keyboard run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- controller only
	{
		const t = await open({ width: 1280, height: 760 });
		await t.tap(BTN.confirm); await t.idle();
		let s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === 1, 'controller: A on the base deploys');
		await t.tap(BTN.confirm);
		s = await t.st();
		A(s.mode === 'unit', 'controller: A opens the unit menu');
		await t.tap(BTN.down);
		A((await t.page.evaluate(() => window.__poketactica.P.menu.i)) === 1, 'controller: the d-pad moves through the menu');
		await t.tap(BTN.cancel);
		s = await t.st();
		A(s.mode === 'idle' && !s.menu, 'controller: B backs out');
		const c0 = s.cursor; await t.tap(BTN.up); s = await t.st();
		A(s.cursor.x !== c0.x || s.cursor.y !== c0.y, 'controller: the d-pad moves the cursor');
		A(t.errors.length === 0, 'no page errors (controller run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- touch, both orientations: tap the base twice to deploy; the whole board fits
	for (const [name, vp] of [['portrait', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['landscape', { width: 844, height: 390, isMobile: true, hasTouch: true }]]) {
		const t = await open(vp);
		const p = t.page;
		const fits = await p.evaluate(() => { const S = window.__poketactica.P.S; let ok = true; for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) { if (S.map.height[y * S.map.w + x] == null) continue; const [sx, sy] = window.__poketactica.screenOf(x, y); if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) ok = false; } return ok; });
		A(fits, `${name}: the whole board is on screen`);
		const [bx, by] = await p.evaluate(() => { const b = window.__poketactica.P.S.map.base; return window.__poketactica.screenOf(b.x, b.y); });
		await p.touchscreen.tap(bx, by); await sleep(250); await p.touchscreen.tap(bx, by); await sleep(500);
		await t.idle();
		const s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === 1, `${name}: tapping the base tile twice deploys`);
		const btn = await p.evaluate(() => { const b = document.getElementById('b-end').getBoundingClientRect(); return b.width > 0 && b.bottom <= innerHeight && b.right <= innerWidth; });
		A(btn, `${name}: the End phase button is on screen`);
		A(t.errors.length === 0, `no page errors (${name})`, t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
