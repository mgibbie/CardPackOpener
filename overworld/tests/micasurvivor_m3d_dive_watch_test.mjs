// micasurvivor_m3d_dive_watch_test.mjs — MicaSurvivor 3D, Dive part 16 (Plans/MICASURVIVOR_3D_PLAN.md §5.69): watching a Dive,
// on the page. One window PLAYS a Dive (?dive=3&host=<name>); another WATCHES it (?watch=<name>), knowing nothing but the
// name: it learns the Dive's seed and route from the host, builds each floor itself, and is told the rest by the Dive's
// row (micasurvivor/m3d/divenet.js; its rules are tested in node, micasurvivor_m3d_dive_net_test.mjs).
//   * the watcher is on the same floor, with the same chests, landmark and things, and reads the same chips
//   * it sees the ₽ of a gold rock, a chest opened, a secret pocket burned open (its floor is built again), the shrine used
//   * down the stairs it is on floor 2 too; a faint ends it there as well
//   node overworld/tests/micasurvivor_m3d_dive_watch_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9931;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 800) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

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
	const open = async (query, who) => {
		// each in a WINDOW of its own: a tab behind another is not animated
		const cdp = await browser.target().createCDPSession();
		const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 900, height: 560 });
		const target = await browser.waitForTarget((q) => q._targetId === targetId);
		const page = await target.page();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(who + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(who + ' console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/${query}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000);
		return { page, ok };
	};
	const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const hud = (p) => p.evaluate(() => document.getElementById('hud').textContent);
	const hudHas = (p, re, ms = 6000) => waitFor(async () => re.test(await hud(p)), ms);

	const H = await open('?dive=3&route=forest&dex=4&auto=1&host=dvw', 'host');
	A(H.ok, 'a Dive is played and hosted (?dive=3&host=dvw)');
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 1e6; });
	const W = await open('?watch=dvw', 'watcher');
	A(W.ok, 'a watcher opens ?watch=dvw (it does not know what is being played)');
	const there = await waitFor(() => W.page.evaluate(() => /dw=3/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.rv && window.__m3d.rv.dive)), 30000);
	const side = (p, host) => p.evaluate((host) => { const m = window.__m3d, d = host ? m.dive : m.rv, r = m.room; return { search: location.search, w: r.w, h: r.h, stairs: r.stairs.join(), floor: d.floor, chests: d.chests.filter((c) => !c.open).length, lm: d.lm && d.lm.kind + ':' + d.lm.used, things: m.ecoView().length || (m.rv ? m.rv.eco.length : 0), plugs: r.plugs.filter((q) => q.open).length, coins: d.coins, chips: document.body.innerText }; }, host);
	let h = await side(H.page, true), w = there ? await side(W.page, false) : {};
	A(there && /route=forest/.test(w.search) && w.w === h.w && w.h === h.h && w.stairs === h.stairs && w.floor === 1 && w.chests === h.chests && w.chests === 4 && w.lm === 'shrine:false' && w.things === h.things && w.things >= 5, `it is sent to the Dive's page and builds floor 1 itself: the same floor, stairs, ${w.chests} chests, shrine and ${w.things} things`, JSON.stringify([h, w]).slice(0, 600));
	A(await waitFor(async () => /FLOOR 1/.test((await side(W.page, false)).chips) && /at stake/.test((await side(W.page, false)).chips), 5000), 'its chips have the Dive\'s line');
	const goTo = (x, z) => H.page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	// a gold rock
	const rock = await H.page.evaluate(() => { const o = window.__m3d.ecoView().find((q) => q.kind === 'rock'); return [o.x, o.z, o.v]; });
	await goTo(rock[0], rock[1]);
	A(await waitFor(async () => { const q = await side(W.page, false); return q.coins === rock[2] && q.things === h.things - 1; }, 8000), `the player breaks a gold rock: the watcher sees the ${rock[2]} ₽, and one thing fewer`, JSON.stringify(await side(W.page, false)).slice(0, 200));
	// a chest
	const ch = await H.page.evaluate(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await goTo(ch[0] + 1, ch[1]);
	A(await waitFor(async () => (await side(W.page, false)).chests === 3, 8000), 'a chest opened: the watcher has one fewer');
	// the thicket (Charmander burns it): the watcher's floor is built again, without it
	const fc = await H.page.evaluate(() => window.__m3d.dive.w.room.plugs.find((q) => q.kind === 'thicket').faces[0]);
	await goTo(fc[0], fc[2]);
	A(await waitFor(async () => (await side(W.page, false)).plugs === 1, 8000), 'the secret pocket burned open: the watcher\'s floor has it open too');
	// the shrine
	const lmAt = await H.page.evaluate(() => [window.__m3d.dive.lm.x, window.__m3d.dive.lm.z]);
	await goTo(lmAt[0], lmAt[1]);
	A(await waitFor(async () => (await side(W.page, false)).lm === 'shrine:true', 8000), 'the shrine used: the watcher sees it spent');
	// the stairs
	const st = await H.page.evaluate(() => { const r = window.__m3d.room; return [r.stairs[0], r.stairs[2]]; });
	await goTo(st[0], st[1]);
	const f2 = await waitFor(async () => (await side(W.page, false)).floor === 2, 12000);
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; });
	h = await side(H.page, true); w = await side(W.page, false);
	A(f2 && w.w === h.w && w.stairs === h.stairs && w.chests === h.chests && w.plugs === 0, 'down the stairs: the watcher is on floor 2 too, with its own stairs and chests', JSON.stringify([f2, h, w].map((q) => (q && q.chips ? { ...q, chips: 0, search: 0 } : q))));
	// the end
	await H.page.evaluate(() => { const m = window.__m3d; m.world.pl.hp = 0; m.world.pl.dead = true; });
	A(await waitFor(() => W.page.evaluate(() => window.__m3d.rv.over === 'lost' && window.__m3d.noteLog.includes('RUN OVER')), 10000), 'a faint: the watcher sees the Dive is over');
	A(errors.length === 0, 'no page errors in either window', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
