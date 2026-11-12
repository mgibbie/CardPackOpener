// micasurvivor_m3d_shiny_page_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.50): shinies drawn
// as shinies, in a real browser (what the run and a watcher know: micasurvivor_m3d_expshiny_test).
//   * a wild shiny is drawn from its SHINY sheet (other colours than the plain one), with sparkles round it; the
//     plain one of the same species beside it is drawn from the plain sheet
//   * your League member: plain by default; shiny when a shiny of its family is in the Expedition save, or when the
//     base save says you play your shiny one; it stays shiny when it evolves
//   * a practice run is never shiny
//   node overworld/tests/micasurvivor_m3d_shiny_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9891;
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
	const has = (keys, ms = 20000) => waitFor(() => M((keys) => keys.every((k) => { const s = window.__m3d.sheets.get(k); return !!(s && s.img && s.img.width > 0); }), keys), ms);
	const count = (k) => M((k) => { const s = window.__m3d.sheets.get(k); return s ? s.batch.geometry.instanceCount : -1; }, k);
	/** How far apart two sheets' colours are: the mean difference of their pixels (0: the same picture). */
	const apart = (ka, kb) => M((ka, kb) => { const px = (k) => { const im = window.__m3d.sheets.get(k).img, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; }; const a = px(ka), b = px(kb); if (a.length !== b.length) return -1; let d = 0, n = 0; for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 16) { d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++; } return n ? d / n : 0; }, ka, kb);

	// ---- a wild shiny
	const ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	const ids = await M(() => { const m = window.__m3d, s = m.state, a = m.addEnemy(16, s.x + 3, s.z + 3, { dummy: true, hp: 1e5 }), b = m.addEnemy(16, s.x - 3, s.z + 3, { dummy: true, hp: 1e5 }); b.shiny = true; b.xk = 'shiny'; return [a.id, b.id]; });
	const both = await has(['16/Walk', '16s/Walk']);
	await sleep(400);
	const n = [await count('16/Walk'), await count('16s/Walk')], diff = both ? await apart('16/Walk', '16s/Walk') : -1;
	A(ok && both && n[0] === 1 && n[1] === 1, 'a wild shiny Pidgey is drawn from its shiny sheet, the plain one beside it from the plain sheet (one of each)', n);
	A(diff > 8, `the two sheets are different pictures (their colours are ${diff.toFixed(1)} apart on average)`, diff);
	const sparks = await M(() => window.__m3d.skey(16, true) === '16s' && window.__m3d.skey(16, false) === '16' && window.__m3d.skey(999999, true) === '999999');
	A(sparks, 'a species with no shiny sheet is drawn from its plain one');
	await shot('shiny_wild.png');

	// ---- your League member
	const p = await M(() => ({ lead: window.__m3d.leadShiny, lg: window.__m3d.run.lg.shiny }));
	A(p.lead === false && p.lg === false, 'a practice run is never shiny', p);
	await boot('exp=7&map=viridian&dex=4');
	const plain = await M(() => ({ lead: window.__m3d.leadShiny, lg: window.__m3d.run.lg.shiny, saveOk: window.__m3d.saveOk }));
	A(plain.saveOk && plain.lead === false && plain.lg === false, 'a run that can be kept, with no shiny of the family: plain', plain);
	// a shiny of its family caught in an Expedition (the Expedition save's league.shiny)
	await M(() => { const Sv = window.G.ExpSave; Sv.add('league.shiny', '4'); Sv.commit(); });
	await boot('exp=8&map=viridian&dex=4');
	await hush();
	const leadSheet = await has(['4s/Walk', '4s/Idle']);
	await sleep(400);
	const s1 = await M(() => ({ lead: window.__m3d.leadShiny, lg: window.__m3d.run.lg.shiny })), drawn = (await count('4s/Idle')) + (await count('4s/Walk')), plainDrawn = (await count('4/Idle')) + (await count('4/Walk'));
	A(s1.lead && s1.lg && leadSheet && drawn === 1 && plainDrawn === 0, 'with a shiny Charmander caught in an Expedition: you play shiny (drawn from its shiny sheet, not the plain one)', { s1, drawn, plainDrawn });
	await shot('shiny_lead.png');
	// it stays shiny when it evolves
	await M(() => { const m = window.__m3d, pl = m.world.pl; pl.level = 15; pl.xp = pl.xpNext; m.drop('xp', m.state.x, m.state.z, 400); });
	const evo = await waitFor(async () => { await M(() => { const m = window.__m3d; if (m.world.pl.choices) m.pickCard(0); }); return M(() => window.__m3d.run.lg.form === 5); }, 20000);
	const evoSheet = evo && await has(['5s/Walk'], 15000);
	await sleep(500);
	A(evo && evoSheet && (await count('5s/Walk')) + (await count('5s/Idle')) === 1, 'evolved into Charmeleon: still shiny');
	// the base save's "play my shiny one"
	await M(() => { localStorage.setItem('micasurvivor_save.guest', JSON.stringify({ owned: { 7: { at: 1 } }, shiny: { 7: { at: 1 } }, partnerShiny: true })); });
	await boot('exp=9&map=viridian&dex=7');
	const s2 = await M(() => ({ lead: window.__m3d.leadShiny, lg: window.__m3d.run.lg.shiny }));
	A(s2.lead && s2.lg, 'with a shiny Squirtle in the collection and "shiny" chosen in the 2D game: Squirtle plays shiny too', s2);
	await M(() => { localStorage.setItem('micasurvivor_save.guest', JSON.stringify({ owned: { 7: { at: 1 } }, shiny: { 7: { at: 1 } }, partnerShiny: false })); });
	await boot('exp=10&map=viridian&dex=7');
	A(await M(() => window.__m3d.leadShiny === false), '…and not when "shiny" is switched off there');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
