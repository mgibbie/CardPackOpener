// micasurvivor_m3d_controls_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.33): the
// site's controls on the 3D page, in a real browser. The owner's scheme (site/input.js + site/gamepad.js): one
// vocabulary from the keyboard and a controller, and a run that can be played with no mouse.
//   * keyboard: Z jumps, X slides, Q / E turn the camera, Enter is the menu, Backspace the zone map (X closes it)
//   * the menu, a level's cards and the run's end are walked with the arrows and pressed with Z; X closes the menu
//   * a controller (the player's layout: the right face button confirms): Start is the menu, the d-pad walks it, the
//     face buttons press and jump, Select is the map, the stick moves
//   * the Games switcher (`): the fight waits under it, and leaving a run asks first
//   node overworld/tests/micasurvivor_m3d_controls_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9867;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	// a controller for the page to read (headless Chrome has none): site/gamepad.js's own test hook
	await page.evaluateOnNewDocument(() => { window.__owFakePads = [{ connected: true, index: 0, id: 'test pad', mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }]; });
	const btn = (i, on) => page.evaluate((i, on) => { const p = window.__owFakePads[0]; p.buttons[i] = { pressed: on, value: on ? 1 : 0 }; p.timestamp++; }, i, on);
	const tap = async (i) => { await btn(i, true); await sleep(120); await btn(i, false); await sleep(120); };
	const boot = async (q) => { await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?${q}`, { waitUntil: 'domcontentloaded' }); return waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000); };
	const hush = () => page.evaluate(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const menu = () => page.evaluate(() => ({ up: document.getElementById('rx-menu').classList.contains('show'), paused: window.__m3d.paused }));
	const ring = () => page.evaluate(() => { const e = document.querySelector('.focusnav-focus'); return e ? e.id || (e.dataset.i !== undefined ? 'card' + e.dataset.i : e.dataset.tool || e.textContent) : null; });

	const ok = await boot('exp=7&map=viridian&dex=6&weather=0');
	await hush();
	A(ok, 'a run on the 3D page');

	// ---- the keyboard, in the fight
	await page.keyboard.down('KeyZ');
	const jumped = await waitFor(() => page.evaluate(() => !window.__m3d.state.grounded && window.__m3d.acts.has('confirm')), 3000);
	await page.keyboard.up('KeyZ');
	const landed = await waitFor(() => page.evaluate(() => window.__m3d.state.grounded && !window.__m3d.acts.has('confirm')), 5000);
	A(jumped && landed, 'Z jumps (the site\'s confirm), as Space does');
	const yaw0 = await page.evaluate(() => window.__m3d.cam.yaw);
	await page.keyboard.down('KeyQ'); await sleep(300); await page.keyboard.up('KeyQ');
	const yaw1 = await page.evaluate(() => window.__m3d.cam.yaw);
	await page.keyboard.down('KeyX'); const sl = await waitFor(() => page.evaluate(() => window.__m3d.acts.has('cancel')), 2000); await page.keyboard.up('KeyX');
	A(yaw1 > yaw0 + 0.2 && sl, 'Q turns the camera (the site\'s prev); X is held as slide (the site\'s cancel)', [yaw0, yaw1]);
	await page.keyboard.press('Backspace');
	const mapUp = await page.evaluate(() => window.__m3d.mapBig);
	await page.keyboard.press('KeyX');
	const mapDown = await page.evaluate(() => !window.__m3d.mapBig && !document.getElementById('rx-menu').classList.contains('show'));
	A(mapUp && mapDown, 'Backspace opens the zone map (the site\'s select); X closes it');

	// ---- the menu, by keyboard
	await page.keyboard.press('Enter');
	const m1 = await menu();
	await page.keyboard.press('ArrowDown'); const r1 = await ring();
	await page.keyboard.press('ArrowDown'); const r2 = await ring();
	await page.keyboard.press('ArrowUp'); const r3 = await ring();
	A(m1.up && m1.paused && r1 === 'rx-resume' && r2 === 'rx-restart' && r3 === 'rx-resume', 'Enter opens the menu (the site\'s menu); the arrows walk its buttons with a ring', { m1, r1, r2, r3 });
	await page.keyboard.press('KeyZ');
	const m2 = await menu();
	await page.keyboard.press('Enter'); const m3 = await menu();
	await page.keyboard.press('KeyX'); const m4 = await menu();
	A(!m2.up && !m2.paused && m3.up && !m4.up, 'Z presses the ringed button (Resume); X closes the menu too', { m2, m3, m4 });
	const ctl = await page.evaluate(() => { window.__m3d.setMenu(true); const t = document.querySelector('#rx-menu p').textContent; window.__m3d.setMenu(false); return t; });
	A(/Jump: Z or Space/.test(ctl) && /Menu: Enter or Esc/.test(ctl) && /Map: Backspace or M/.test(ctl), 'the menu lists the controls');

	// ---- a level's cards, by keyboard
	await page.evaluate(() => { const m = window.__m3d, s = m.state, pl = m.world.pl; m.drop('xp', s.x, s.z, Math.ceil((pl.xpNext - pl.xp + 1) / (pl.xpMul || 1))); });
	const cardsUp = await waitFor(() => page.evaluate(() => document.querySelectorAll('#cards button[data-i]').length === 3 && document.getElementById('cards').style.display === 'grid'), 8000);
	await page.evaluate(() => { window.__picked = -1; window.__m3d.world.pl.choices.forEach((c, i) => { const f = c.apply; c.apply = () => { window.__picked = i; return f(); }; }); });
	await page.keyboard.press('Enter');   // (no menu over a level's cards: Enter presses nothing yet, it only shows the ring)
	const noMenu = await menu();
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');   // (to the first card, wherever the ring began)
	const c1 = await ring();
	await page.keyboard.press('ArrowRight'); const c2 = await ring();
	await page.keyboard.press('KeyZ');
	const picked = await waitFor(() => page.evaluate(() => window.__picked >= 0 && !window.__m3d.world.pl.choices && document.getElementById('cards').style.display === 'none'), 3000);
	const which = await page.evaluate(() => window.__picked);
	A(cardsUp && !noMenu.up && c1 === 'card0' && c2 === 'card1' && picked && which === 1, `a level's cards: the arrows walk them, Z takes the ringed one (${c1} > ${c2}, took card ${which})`, { c1, c2, which });

	// ---- a controller
	await tap(9);
	const p1 = await menu();
	await tap(13); const pr1 = await ring();
	await tap(13); const pr2 = await ring();
	let pr3 = pr2; for (let i = 0; i < 3 && pr3 !== 'rx-resume'; i++) { await tap(12); pr3 = await ring(); }   // (back up to Resume, wherever the ring began)
	await tap(1);
	const p2 = await menu();
	A(p1.up && p1.paused && /^rx-(resume|restart|quit)$/.test(pr1 || '') && pr2 !== pr1 && pr3 === 'rx-resume' && !p2.up && !p2.paused && (await page.evaluate(() => window.__m3d.run.seed === 7 && window.__picked !== undefined)), 'a controller: Start opens the menu, the d-pad walks it, the right face button presses (Resume)', { p1, pr1, pr2, pr3, p2 });
	await tap(9); await tap(0);
	const p3 = await menu();
	A(!p3.up, 'the bottom face button cancels (the menu closes)');
	await btn(1, true);
	const pj = await waitFor(() => page.evaluate(() => !window.__m3d.state.grounded), 3000);
	await btn(1, false);
	await waitFor(() => page.evaluate(() => window.__m3d.state.grounded), 5000);
	const x0 = await page.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z }));
	await page.evaluate(() => { const p = window.__owFakePads[0]; p.axes = [0, -1, 0, 0]; p.timestamp++; });
	const moved = await waitFor(() => page.evaluate((o) => Math.hypot(window.__m3d.state.x - o.x, window.__m3d.state.z - o.z) > 1.5, x0), 4000);
	await page.evaluate(() => { const p = window.__owFakePads[0]; p.axes = [0, 0, 0, 0]; p.timestamp++; });
	await tap(8);
	const pm = await page.evaluate(() => window.__m3d.mapBig);
	await tap(0);
	const pm2 = await page.evaluate(() => window.__m3d.mapBig);
	A(pj && moved && pm && !pm2, 'in the fight: the right face button jumps, the stick moves, Select opens the map and the bottom button closes it', { pj, moved, pm, pm2 });

	// ---- the run's end, by keyboard; the Games switcher
	const guard = await page.evaluate(() => window.mpLeaveGuard());
	await page.keyboard.press('Backquote');
	const sw = await waitFor(() => page.evaluate(() => !!document.getElementById('mpsw') && window.__m3d.paused), 4000);
	const t0 = await page.evaluate(() => window.__m3d.world.t); await sleep(400);
	const t1 = await page.evaluate(() => window.__m3d.world.t);
	A(guard.state === 'confirm' && /ends this run/.test(guard.message) && sw && t1 === t0, 'the Games switcher (`): the fight waits under it, and leaving a run asks first', { guard, sw, t0, t1 });
	await page.keyboard.press('Backquote'); await sleep(300);
	await page.evaluate(() => window.__m3d.setMenu(false));
	await page.evaluate(() => { const m = window.__m3d; m.world.pl.maxHp = 10; m.world.pl.xproc.shield = 0; m.world.pl.invuln = 0; m.world.pl.hp = 1; m.addBoss(150, m.state.x + 1.5, m.state.z, { slot: 0 }); for (const e of m.world.enemies) e.atk = 1e6; });
	const over = await waitFor(() => page.evaluate(() => window.__m3d.run.ended && document.getElementById('rx-end').classList.contains('show')), 20000);
	await page.keyboard.press('ArrowRight'); const e1 = await ring();
	await page.keyboard.press('ArrowRight'); const e2 = await ring();
	const g2 = await page.evaluate(() => window.mpLeaveGuard().state);
	A(over && e1 === 'rx-again' && e2 === 'rx-leave' && g2 === 'safe', 'the run\'s end: the arrows walk "Play again" and "Leave"; leaving a finished run asks nothing', { e1, e2, g2 });
	await page.keyboard.press('ArrowLeft');
	await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.keyboard.press('KeyZ')]);
	const again = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.run && window.__m3d.run.seed === 8)), 30000);
	A(again, 'Z on "Play again": a new run, with no mouse from start to end');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
