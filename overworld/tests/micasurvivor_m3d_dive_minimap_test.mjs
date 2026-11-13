// micasurvivor_m3d_dive_minimap_test.mjs — a 3D Dive's minimap marks its chests and its landmark once seen
// (Plans/IMPROVEMENT_PLAN_2026_11.md 3d). Before, the map showed the stairs, the stall and the bushes, and neither.
//   * a chest far away, in ground you have not explored, is not on the map
//   * come near: it is marked (shut); open it: the mark turns dull; walk away: it stays marked
//   * the landmark likewise; the big map's legend counts the chests and names the landmark
//   * an Expedition's map has no such marks
//   node overworld/tests/micasurvivor_m3d_dive_minimap_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9659;
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
	const calm = () => page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 40000; });
	const goTo = (x, z) => page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	const marks = () => page.evaluate(() => window.__m3d.mapMarks);
	const at = (list, o) => list.find((q) => Math.abs(q.x - o.x) < 0.01 && Math.abs(q.z - o.z) < 0.01);

	const ok = await boot('dive=3&route=forest&dex=6&auto=1');
	await calm();
	const lay = await page.evaluate(() => { const m = window.__m3d, d = m.dive, s = m.state, far = (o) => Math.hypot(o.x - s.x, o.z - s.z); return { chests: d.chests.filter((c) => !c.pocket).map((c) => ({ x: c.x, z: c.z, d: far(c) })).sort((p, q) => q.d - p.d), lm: d.lm ? { kind: d.lm.kind, x: d.lm.x, z: d.lm.z, d: far(d.lm) } : null, sp: [s.x, s.z] }; });
	const chest = lay.chests[0];
	A(ok && chest && chest.d > 40 && !!lay.lm, 'a 3D Dive: a chest far from the start, and a landmark', JSON.stringify(lay).slice(0, 400));
	await sleep(400);
	let mk = await marks();
	A(!at(mk, chest), 'the far chest, in ground not explored, is not on the map', JSON.stringify(mk));
	// near it (not on it): marked, shut
	await goTo(chest.x + 8, chest.z); await calm(); await sleep(500);
	mk = await marks();
	A(at(mk, chest) && at(mk, chest).kind === 'chest' && at(mk, chest).done === false, 'come near: the chest is marked, shut', JSON.stringify(mk));
	await goTo(chest.x + 1, chest.z);
	const opened = await waitFor(async () => { const q = at(await marks(), chest); return !!q && q.done === true; }, 8000);
	A(opened, 'open it: its mark turns dull (opened)', JSON.stringify(await marks()));
	await goTo(lay.sp[0], lay.sp[1]); await calm(); await sleep(500);
	mk = await marks();
	A(at(mk, chest) && at(mk, chest).done === true, 'back at the start: it stays on the map', JSON.stringify(mk));
	// the landmark
	await goTo(lay.lm.x + 9, lay.lm.z); await calm(); await sleep(500);
	mk = await marks();
	A(at(mk, lay.lm) && at(mk, lay.lm).kind === lay.lm.kind, `the landmark is marked once seen (${lay.lm.kind})`, JSON.stringify(mk));
	await page.evaluate(() => window.__m3d.toggleMap ? window.__m3d.toggleMap(true) : null);
	if (!(await page.evaluate(() => window.__m3d.mapBig))) await page.keyboard.press('Backspace');
	await sleep(400);
	const lg = await page.evaluate(() => ({ big: window.__m3d.mapBig, text: document.getElementById('maplegend').textContent }));
	A(lg.big && /chest/.test(lg.text) && /opened/.test(lg.text) && lg.text.includes(await page.evaluate(async (k) => (await import('/micasurvivor/m3d/dive.js')).LANDMARKS[k][0], lay.lm.kind)), `the big map's legend counts the chests and names the landmark (${lg.text.trim().slice(0, 140)})`, lg);
	const px = await page.evaluate((c) => { const el = document.getElementById('map'), k = 4 / 2, d = el.getContext('2d').getImageData(Math.round(c.x * k), Math.round(c.z * k), 1, 1).data; return [d[0], d[1], d[2]]; }, chest);
	A(Math.abs(px[0] - 0x6b) < 30 && Math.abs(px[1] - 0x5a) < 30 && Math.abs(px[2] - 0x2a) < 30, 'and it is drawn there: the opened chest\'s dull gold on the map canvas', JSON.stringify(px));
	// an Expedition has none
	const ok2 = await boot('exp=7&map=viridian&dex=6&weather=0');
	await sleep(600);
	A(ok2 && (await marks()).length === 0, "an Expedition's map has no such marks");
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
