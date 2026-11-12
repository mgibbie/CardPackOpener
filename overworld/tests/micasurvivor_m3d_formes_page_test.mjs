// micasurvivor_m3d_formes_page_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.48): the species,
// formes and Megas whose sheets are fallbacks, drawn in a real browser (the rules: micasurvivor_m3d_expformes_test).
//   * a species with a fallback sheet (in its own folder: Squawkabilly's battle sprite, Liepard's follower sprite) is
//     LOADED and drawn. Before, the page asked for the wrong file and such an enemy was never drawn.
//   * a fallback sheet's rows and mirroring: front and back only, mirrored when it faces the other way; a follower
//     sheet is drawn 1.2 × to match its neighbours
//   * zone 3's Mega elite arrives, is named in English and is drawn
//   * a run that starts as a forme (Alolan Vulpix) shows it, by name
//   node overworld/tests/micasurvivor_m3d_formes_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9883;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const calls = [];   // (what the page asks of the server: a guest asks nothing)
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { calls.push(req.method + ' ' + u); res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"no"}'); return; }
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
	const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const boot = async (q) => { await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?${q}`, { waitUntil: 'domcontentloaded' }); return waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000); };
	const M = (f, ...a) => page.evaluate(f, ...a);
	const hush = () => M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const has = (keys) => waitFor(() => M((keys) => keys.every((k) => { const s = window.__m3d.sheets.get(k); return !!(s && s.img && s.img.width > 0); }), keys), 20000);

	// ---- species with a fallback sheet are loaded and drawn
	const ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	await M(() => { const m = window.__m3d, s = m.state; [931, 514, 25].forEach((d, i) => m.addEnemy(d, s.x + 3 + i * 2, s.z + 3, { dummy: true, hp: 1e5 })); });
	const loaded = await has(['931/Walk', '514/Walk', '25/Walk']);
	const got = await M(() => ['931/Walk', '514/Walk', '25/Walk'].map((k) => { const s = window.__m3d.sheets.get(k); return s ? { k, w: s.img.width, dm: s.dm, fx: s.fx, kk: s.k, n: s.batch.geometry.instanceCount } : { k }; }));
	A(ok && loaded, 'an enemy whose species has a fallback sheet (Squawkabilly: a battle sprite; Liepard: a follower sprite) has its sheet loaded', got);
	await sleep(400);
	const drawn = await M(() => ['931/Walk', '514/Walk'].map((k) => window.__m3d.sheets.get(k).batch.geometry.instanceCount));
	A(drawn.every((n) => n >= 1), '…and is drawn', drawn);
	await shot('formes_fallback.png');
	// rows and mirroring
	const q = await M(() => { const m = window.__m3d, f = (d) => m.sq('931/Walk', 0, d), s = m.sheets.get('931/Walk'); return { d0: f(0), d2: f(2), d4: f(4), d6: f(6), rowH: s.meta.h / s.img.height, plain: m.quadOf('514/Walk', 0, 0), big: m.sq('514/Walk', 0, 0), k: m.sheets.get('514/Walk').k, p0: m.sq('25/Walk', 0, 2), p1: m.quadOf('25/Walk', 0, 2) }; });
	const eq = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
	A(eq(q.d0.uv, q.d6.uv) && Math.abs(q.d4.uv[1] - q.rowH) < 1e-9 && q.d0.uv[1] === 0, 'a battle sprite has a front and a back only: every direction but "away" uses the front row');
	A(q.d2.uv[0] === q.d6.uv[2] && q.d2.uv[2] === q.d6.uv[0] && Math.abs(q.d2.rect[0] + q.d6.rect[2]) < 1e-9 && Math.abs(q.d2.rect[2] + q.d6.rect[0]) < 1e-9, '…mirrored about its anchor when it faces the other side');
	A(q.k === 1.2 && Math.abs(q.big.rect[3] - q.plain.rect[3] * 1.2) < 1e-6, 'a follower sheet is drawn 1.2 × (the 2D game\'s size for it)', [q.k, q.big.rect, q.plain.rect]);
	A(eq(q.p0.rect, q.p1.rect) && eq(q.p0.uv, q.p1.uv), 'a species with its own eight-way sheet is drawn as before');

	// ---- zone 3's Mega elite
	const mega = await M(() => { const m = window.__m3d, G = window.G, ev = G.ExpClassic.plan(7, 'viridian', 3, 'normal').events.find((e) => e.mega); m.run.plan.events = [Object.assign({}, ev, { at: 0 })]; m.run.n = 0; return ev; }).then(async (ev) => { await waitFor(() => M((d) => window.__m3d.world.enemies.some((e) => e.dex === d), ev.dex[0]), 5000); return M((ev) => { const e = window.__m3d.world.enemies.find((q) => q.dex === ev.dex[0]); return { ev, dex: e.dex, xk: e.xk, scale: e.scale, name: window.G.DEX_BY[e.dex].name }; }, ev); });
	const megaSheet = await has([mega.dex + '/Walk']);
	A(mega.ev && mega.dex === mega.ev.dex[0] && mega.xk === 'elite' && mega.scale === 1.3 && /^Mega /.test(mega.name) && await M((n) => window.__m3d.noteLog.includes('A wild ' + n + ' appears!'), mega.name), 'zone 3\'s Mega elite arrives, and the run names it (' + mega.name + ')', mega);
	await sleep(400);
	A(megaSheet && await M((k) => window.__m3d.sheets.get(k).batch.geometry.instanceCount >= 1, mega.dex + '/Walk'), '…and it is drawn');
	await shot('formes_mega.png');

	// ---- a run that starts as a forme
	const ok2 = await boot('exp=8&map=viridian&dex=37&form=10103&weather=0');
	const lead = await has(['10103/Walk']);
	const f = await M(() => ({ form: window.__m3d.run.lg.form, name: document.getElementById('rx-name').textContent, types: window.__m3d.world.pl.mon.types }));
	A(ok2 && lead && f.form === 10103 && f.name === 'Alolan Vulpix' && f.types.join() === 'ice', 'a run started as Alolan Vulpix: its own sheet is loaded and the screen names it', f);
	await shot('formes_lead.png');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
