// micasurvivor_m3d_dive_crater_test.mjs — the Ember Crater's own floor, and two of the 2D light map's lights, in a 3D Dive
// (Plans/IMPROVEMENT_PLAN_2026_11.md 3e). The crater was the 3D game's green mountain ground with blue water.
//   * the crater: basalt ground and lava (the 2D game's palette), on the floor and on the minimap; the lava flickers and is
//     not lost in the route's dark; ?calm=1 holds it still
//   * a landmark has a glow on the ground round it until it is used (every route)
//   * the woods are as they were: green ground, blue water that does not flicker
//   node overworld/tests/micasurvivor_m3d_dive_crater_test.mjs [--shots <dir>]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9661;
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
	const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
	const calm = () => page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 40000; });
	const goTo = (x, z) => page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	const lights = () => page.evaluate(() => window.__m3d.lights);
	const mapPx = (x, z) => page.evaluate((x, z) => { const el = document.getElementById('map'), d = el.getContext('2d').getImageData(Math.round(x * 2), Math.round(z * 2), 1, 1).data; return [d[0], d[1], d[2]]; }, x, z);
	const near = (p, q, tol = 40) => Math.abs(p[0] - q[0]) < tol && Math.abs(p[1] - q[1]) < tol && Math.abs(p[2] - q[2]) < tol;

	// ---- the Ember Crater
	let ok = await boot('dive=3&route=crater&dex=6&auto=1');
	await calm();
	const info = await page.evaluate(() => { const m = window.__m3d, r = m.room, s = m.state; let wet = null, best = 1e9; for (const [i] of r.water) { const x = (i % r.w + 0.5) * 2, z = (Math.floor(i / r.w) + 0.5) * 2, d = Math.hypot(x - s.x, z - s.z); if (d < best) { best = d; wet = [x, z]; } } return { wet, n: r.water.size, lm: m.dive.lm ? { kind: m.dive.lm.kind, x: m.dive.lm.x, z: m.dive.lm.z } : null, sp: [s.x, s.z] }; });
	let l = await lights();
	A(ok && l.look && l.liquid === 'lava' && info.n > 0, `the crater's floor is its own: basalt, and ${info.n} cells of lava`, JSON.stringify({ l, n: info.n }).slice(0, 300));
	A(l.lava && l.lava.fog === false && l.lava.opacity > 0.8, 'the lava is nearly solid and is not lost in the dark (no fog on it)', JSON.stringify(l.lava));
	const cols = new Set(); for (let i = 0; i < 12; i++) { cols.add((await lights()).lava.color); await sleep(120); }
	const reds = [...cols].every((c) => ((c >> 16) & 255) > 150 && (c & 255) < 60);
	A(cols.size >= 3 && reds, `it flickers: ${cols.size} colours in 1.5 s, all of them lava`, JSON.stringify([...cols].map((c) => c.toString(16))));
	await goTo(info.wet[0] + 6, info.wet[1]); await calm(); await sleep(500);   // (near the lava: it is explored, so it is on the map)
	await goTo(info.sp[0], info.sp[1]); await calm(); await sleep(500);
	const dry = await page.evaluate(() => { const m = window.__m3d, r = m.room, s = m.state, cx = Math.floor(s.x / 2), cz = Math.floor(s.z / 2); for (let d = 3; d < 9; d++) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = cx + dx, z = cz + dz, i = z * r.w + x; if (x > 0 && z > 0 && x < r.w && z < r.h && r.cells[i] < r.rimH && !r.water.has(i)) return [(x + 0.5) * 2, (z + 0.5) * 2]; } return [s.x + 6, s.z]; });
	const pw = await mapPx(info.wet[0], info.wet[1]), pg = await mapPx(dry[0], dry[1]);
	A(near(pw, [0xd0, 0x4e, 0x12]) && pg[1] < 90 && pg[0] >= pg[1], 'on the minimap the lava is orange and the ground dark basalt, not green', JSON.stringify({ pw, pg }));
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'crater.png') });
	// calm: no flicker
	ok = await boot('dive=3&route=crater&dex=6&auto=1&calm=1');
	await calm(); await sleep(500);   // (a frame or two: the sheet is built in its base colour)
	const still = new Set(); for (let i = 0; i < 8; i++) { still.add((await lights()).lava.color); await sleep(120); }
	A(ok && still.size === 1, '?calm=1 (the 2D game\'s Calm setting): the lava holds still', JSON.stringify([ok, [...still].map((c) => c.toString(16)), (await lights()).calm]));

	// ---- the woods: as they were
	ok = await boot('dive=3&route=forest&dex=6&auto=1');
	await calm(); await sleep(400);
	l = await lights();
	const w2 = new Set(); for (let i = 0; i < 6; i++) { w2.add((await lights()).lava.color); await sleep(120); }
	const sp = await page.evaluate(() => [window.__m3d.state.x, window.__m3d.state.z]);
	const dry2 = await page.evaluate(() => { const m = window.__m3d, r = m.room, s = m.state, cx = Math.floor(s.x / 2), cz = Math.floor(s.z / 2); for (let d = 3; d < 9; d++) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = cx + dx, z = cz + dz, i = z * r.w + x; if (x > 0 && z > 0 && x < r.w && z < r.h && r.cells[i] < r.rimH && !r.water.has(i)) return [(x + 0.5) * 2, (z + 0.5) * 2]; } return [s.x + 6, s.z]; });
	const fg = await mapPx(dry2[0], dry2[1]);
	A(ok && l.look === null && l.liquid === 'water' && l.lava.color === 0x3f8fe0 && l.lava.fog === true && w2.size === 1 && fg[1] > fg[0] && fg[1] > fg[2], 'the woods are as they were: green ground, blue water that does not flicker', JSON.stringify({ l, fg }));
	// the landmark's glow
	const flm = await page.evaluate(() => { const lm = window.__m3d.dive.lm; return lm ? { kind: lm.kind, x: lm.x, z: lm.z } : null; });
	A(!!flm, 'the floor has a landmark', JSON.stringify(flm));
	await goTo(flm.x + 7, flm.z); await calm(); await sleep(300);
	const g0 = (await lights()).glows; await sleep(1500); const g1 = (await lights()).glows;
	A(g1 - g0 >= 3 && g1 - g0 <= 8, `the landmark has a glow on the ground round it, laid down again a few times a second (${g1 - g0} in 1.5 s)`);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'woods-landmark.png') });
	await goTo(flm.x, flm.z);
	const used = await waitFor(() => page.evaluate(() => { const m = window.__m3d; if (m.world.pl.choices || m.dive.pick) return false; return m.dive.lm.used; }), 8000);
	await sleep(900); const g2 = (await lights()).glows; await sleep(1200); const g3 = (await lights()).glows;
	A(used && g3 === g2, 'used: its glow goes out', JSON.stringify({ used, g2, g3 }));
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
