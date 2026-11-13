// micasurvivor_m3d_dive_pad_ult_test.mjs — the Ultimate in a 3D Dive, on a controller (Plans/IMPROVEMENT_PLAN_2026_11.md 3c).
// In a Dive the pad's X and Y are the two specials, so the Expedition's Y was not free and a controller had no way to
// fire the Ultimate (the keyboard had 3). It is both shoulders together: L + R.
//   * charged, L alone or R alone does nothing (they turn the camera); L + R casts it
//   * not charged, L + R does nothing; Q + E on the keyboard is the same press
//   * the chip says the keys; X and Y still fire the specials
//   node overworld/tests/micasurvivor_m3d_dive_pad_ult_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9657;
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
	const ult = () => page.evaluate(async () => { const U = await import('/micasurvivor/m3d/expult.js'), S = window.__m3d.dive, v = U.ultView(S); return { pct: v.pct, ready: v.ready, casting: v.casting, chip: (document.getElementById('rx-ult-pct') || {}).textContent || '' }; });
	const charge = (v) => page.evaluate(async (v) => { const U = await import('/micasurvivor/m3d/expult.js'); U.setCharge(window.__m3d.dive, v); }, v);
	const calm = () => page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 40000; });
	const cast = () => waitFor(async () => { const u = await ult(); return u.casting || u.pct < 100; }, 2500);

	const ok = await boot('dive=3&route=forest&dex=6&auto=1');
	await calm();
	A(ok && await page.evaluate(() => !!window.__m3d.dive.ult), 'a 3D Dive, with an Ultimate');
	await charge(1); await sleep(300);
	let u = await ult();
	A(u.ready && /READY \[3 \/ L\+R\]/.test(u.chip), `charged: the chip says how to fire it (${u.chip})`, u);
	await tap(4); const l = await ult();
	await tap(5); const r = await ult();
	A(l.ready && !l.casting && r.ready && !r.casting, 'L alone, then R alone: nothing is cast (they turn the camera)', { l, r });
	await btn(4, true); await sleep(150); await btn(5, true);
	const fired = await cast();
	await btn(4, false); await btn(5, false); await sleep(200);
	A(fired, 'L + R together: the Ultimate is cast', await ult());
	await waitFor(async () => !(await ult()).casting, 15000);
	await calm(); await charge(0.2); await sleep(200);
	await btn(4, true); await btn(5, true); await sleep(300); await btn(4, false); await btn(5, false); await sleep(200);
	u = await ult();
	A(!u.ready && !u.casting && u.pct >= 15 && u.pct <= 40, 'not charged: L + R casts nothing and spends nothing', u);
	await charge(1); await sleep(300);
	await page.keyboard.down('KeyQ'); await sleep(120); await page.keyboard.down('KeyE');
	const keyed = await cast();
	await page.keyboard.up('KeyQ'); await page.keyboard.up('KeyE');
	A(keyed, 'Q + E on the keyboard is the same press');
	await waitFor(async () => !(await ult()).casting, 15000);
	// X and Y are still the specials
	const sp = () => page.evaluate(async () => JSON.stringify((await import('/micasurvivor/m3d/dive.js')).specials(window.__m3d.dive)));
	const k0 = await sp(); await tap(2); await sleep(200); const k1 = await sp();
	A(k0 !== k1, "the pad's X still fires the first special", { k0: k0.slice(0, 160), k1: k1.slice(0, 160) });
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
