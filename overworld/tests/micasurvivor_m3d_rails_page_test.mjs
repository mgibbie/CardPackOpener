// micasurvivor_m3d_rails_page_test.mjs — MicaSurvivor 3D: rails can be found and learnt, in a real browser (an Expedition).
// The owner, 2026-11-14: "I was not ever able to grind a rail" (and: saw them, could not get on).
//   * the minimap draws a rail bold, over the fog, once any of it is explored (with a dot at its high end)
//   * near a rail, until you have ground one on this device, a tip says how to get on it
//   * the first time you are on one, a tip says how to get off; it is counted on the device, and the get-on tips stop
//   node overworld/tests/micasurvivor_m3d_rails_page_test.mjs      (SHOTS=<dir> for a screenshot)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9943;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"no"}'); return; }
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
	const M = (f, ...a) => page.evaluate(f, ...a);
	await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('m3d.grinds'); } catch { } });
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=4&weather=0`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready)), 30000), 'an Expedition boots (Charmander)');
	const R = await M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; return m.room.rails.map((q) => [q.pts[0], q.pts[q.pts.length - 1]]); });
	A(R.length >= 1, `the zone has rails (${R.length})`);
	// a few metres from rail 0's high end: the map shows it, a tip says how to get on
	const hi = R[0][0][1] >= R[0][1][1] ? R[0][0] : R[0][1];
	await M((p) => { const m = window.__m3d; m.put(p[0] + 4, p[2] + 2); m.setCoach({ at: -1e9 }); }, hi);
	const mapped = await waitFor(() => M(() => window.__m3d.mapRails >= 1), 8000);
	A(mapped, 'the minimap draws the rail, over the fog, once you have been near it');
	const tip = await waitFor(() => M(() => window.__m3d.noteLog.some((t) => /^A rail: run along it onto its high end/.test(t))), 6000);
	A(tip, 'near its high end a tip says how to get on: run onto its high end, or jump and land on it', await M(() => window.__m3d.noteLog.slice(-3)));
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'rails_tip.png') }); }
	// on it: how to get off, counted on the device
	const P = await M(() => window.__m3d.room.rails[0].pts);
	const mid = P[Math.floor(P.length / 2)];
	await M((p) => { const m = window.__m3d, s = m.state; m.put(p[0], p[2]); s.y = p[1] + 0.4; s.vy = -1; s.grounded = false; }, mid);
	const onIt = await waitFor(() => M(() => window.__m3d.noteLog.some((t) => /^Grinding! Jump to leap off/.test(t))), 6000);
	A(onIt && (await M(() => localStorage.getItem('m3d.grinds'))) === '1', 'the first time on one: "Grinding! Jump to leap off with your speed, slide to drop off", and it is counted on the device', await M(() => ({ notes: window.__m3d.noteLog.slice(-3), n: localStorage.getItem('m3d.grinds') })));
	// after that, no more get-on tips
	await waitFor(() => M(() => window.__m3d.state.rail < 0), 8000);
	const n0 = await M(() => window.__m3d.noteLog.filter((t) => /^A rail:/.test(t)).length);
	await M((p) => { const m = window.__m3d; m.put(p[0] + 4, p[2] + 2); m.setCoach({ at: -1e9 }); }, hi);
	await sleep(1500);
	const n1 = await M(() => window.__m3d.noteLog.filter((t) => /^A rail:/.test(t)).length);
	A(n1 === n0, 'once you have ground one, the tips stop', { n0, n1 });
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
