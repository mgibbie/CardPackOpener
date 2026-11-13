// micasurvivor_m3d_dive_coopplay_test.mjs — MicaSurvivor 3D, Dive part 17 (Plans/MICASURVIVOR_3D_PLAN.md §5.70): a Dive played
// together, on the page. One window HOSTS a Dive as a Squirtle (?dive=3&host=<name>); another JOINS it as a Charmander
// (?join=<name>), knowing nothing but the name. The rules are tested in node (micasurvivor_m3d_dive_coop_test.mjs); this
// is the page: the guest is sent to the Dive's page, plays its own kit, and what it does counts on both screens.
//   node overworld/tests/micasurvivor_m3d_dive_coopplay_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9933;
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

	const H = await open('?dive=3&route=forest&dex=7&auto=1&host=dvc', 'host');
	A(H.ok, 'a Dive is played and hosted as a Squirtle (?dive=3&host=dvc)');
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; m.world.pl.maxHp = m.world.pl.hp = 1e6; });
	const Gp = await open('?join=dvc&dex=4&auto=1', 'guest');
	A(Gp.ok, 'a second player opens ?join=dvc as a Charmander (it does not know what is being played)');
	const joined = await waitFor(() => Gp.page.evaluate(() => /dj=3/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.guestDive && window.__m3d.rv && window.__m3d.rv.dive && window.__m3d.net.joined)), 40000);
	const gside = () => Gp.page.evaluate(() => { const m = window.__m3d, g = m.guestDive, r = m.room; return { search: location.search, w: r.w, stairs: r.stairs.join(), floor: g.floor, member: g.lg && g.lg.member, moves: m.world.pl.moves.map((q) => [q.id, !!q.xman]), chests: m.rv.chests.filter((c) => !c.open).length, plugs: r.plugs.filter((q) => q.open).length, at: [m.state.x, m.state.z], items: g.lv.log.filter((q) => q[1] === 'item').length, slide: document.getElementById('b-slide').textContent, chips: document.body.innerText, hp: m.world.pl.hp, maxHp: m.world.pl.maxHp }; });
	const hside = () => H.page.evaluate(() => { const m = window.__m3d, d = m.dive, r = m.room; return { w: r.w, stairs: r.stairs.join(), floor: d.floor, mates: m.world.mates.map((q) => [q.dex, q.s.x, q.s.z]), chests: d.chests.filter((c) => !c.open).length, plugs: r.plugs.filter((q) => q.open).length, items: d.lv.log.filter((q) => q[1] === 'item').length, opened: d.opened, secrets: d.secrets, at: [m.state.x, m.state.z], notes: m.noteLog.join(' | ') }; });
	let g = joined ? await gside() : {}, h = await hside();
	A(joined && /route=forest/.test(g.search) && g.w === h.w && g.stairs === h.stairs && g.floor === 1 && g.member === 4 && h.mates.length === 1 && h.mates[0][0] === 4, 'it is sent to the Dive\'s page and builds floor 1 itself; the host has a Charmander beside it', JSON.stringify([{ ...g, chips: 0 }, h]).slice(0, 500));
	const chipsOk = await waitFor(async () => { const q = (await gside()).chips; return q.includes('KEY 1') && q.includes('FLOOR 1'); }, 6000);
	A(g.moves.length === 3 && !g.moves[0][1] && g.moves[1][1] && g.moves[2][1] && g.slide === 'DODGE' && chipsOk, 'the guest has its own kit of three, the DODGE button, and the Dive\'s chips', JSON.stringify([g.moves, g.slide, (await gside()).chips.slice(0, 300)]));
	A(/joined/.test(h.notes), 'the host is told it joined', h.notes.slice(0, 200));
	const gGo = (x, z) => Gp.page.evaluate((x, z) => { const s = window.__m3d.state; s.x = x; s.z = z; s.vx = s.vz = 0; }, x, z);
	// a chest: the guest opens it, and the item is the guest's
	const ch = await H.page.evaluate(() => { const c = window.__m3d.dive.chests.find((q) => !q.pocket); return [c.x, c.z]; });
	await gGo(ch[0] + 1, ch[1]);
	const opened = await waitFor(async () => { const q = await hside(), p = await gside(); return q.opened === 1 && p.chests === 3 && p.items === g.items + 1; }, 10000);
	const h2 = await hside();
	A(opened && h2.items === h.items, 'the GUEST stands by a chest: it opens on both screens, and the item is the guest\'s (the host has nothing new)', JSON.stringify([h2.opened, h2.items, (await gside()).items]));
	// the thicket: a Fire guest burns it for both
	const fc = await H.page.evaluate(() => window.__m3d.dive.w.room.plugs.find((q) => q.kind === 'thicket').faces[0]);
	await gGo(fc[0], fc[2]);
	A(await waitFor(async () => (await hside()).secrets === 1 && (await gside()).plugs === 1, 10000), 'the GUEST leans on the thicket: it burns, and both floors are open there');
	// the guest's special
	await Gp.page.bringToFront();
	const foe = await H.page.evaluate(async () => { const m = window.__m3d, g = m.world.mates[0].s, e = m.addEnemy(19, g.x + 2.5, g.z, { t: 0, ti: 0, hp: 1e6 }); e.dummy = true; window.__foe = e; return e.hp; });
	await sleep(1500);
	const hp1 = await H.page.evaluate(() => window.__foe.hp);
	await Gp.page.evaluate(() => { window.__m3d.world.pl.moves[1].t = 0; });
	await Gp.page.keyboard.press('Digit1');
	const fired = await waitFor(() => Gp.page.evaluate(() => window.__m3d.world.pl.moves[1].t > 0), 4000);
	A(fired, 'the guest presses 1: its special fires', JSON.stringify([foe, hp1]));
	await H.page.evaluate(() => { window.__m3d.world.enemies.length = 0; });
	// the stairs: the guest takes both down
	const st = await H.page.evaluate(() => { const r = window.__m3d.room; return [r.stairs[0], r.stairs[2]]; });
	await gGo(st[0], st[1]);
	const f2 = await waitFor(async () => (await hside()).floor === 2 && (await gside()).floor === 2, 15000);
	await H.page.evaluate(() => { const m = window.__m3d; m.world.enemies.length = 0; m.dive.groups.length = 0; m.dive.ft = 1e9; });
	await sleep(800);
	g = await gside(); h = await hside();
	A(f2 && g.stairs === h.stairs && Math.hypot(g.at[0] - h.at[0], g.at[1] - h.at[1]) < 10, 'the GUEST steps on the stairs: both are on floor 2, side by side', JSON.stringify([h.floor, g.floor, g.at, h.at]));
	// the end: the host faints
	await H.page.evaluate(() => { const m = window.__m3d; m.world.pl.hp = 0; m.world.pl.dead = true; });
	A(await waitFor(() => Gp.page.evaluate(() => window.__m3d.guestDive.ended && window.__m3d.noteLog.includes('RUN OVER')), 10000), 'the host faints: the Dive is over on the guest\'s screen too');
	A(await H.page.evaluate(() => window.__m3d.kept && window.__m3d.kept.ok === false), 'a Dive hosted by its address is a practice one: nothing is saved');
	A(errors.length === 0, 'no page errors on either side', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
