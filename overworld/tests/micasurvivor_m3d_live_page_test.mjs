// micasurvivor_m3d_live_page_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.37): a 3D
// run watched live over the site's lines, in two real browsers (two people: each with its own login), with a stand-in
// for the server's two actions (the real handler: micasurvivor_m3d_exprelay_test.mjs).
//   * logged in, your run asks whether a friend is watching; unwatched it sends nothing
//   * a friend opens /micasurvivor/m3d/?live=<you>: "waiting", then the page loads the run's map and shows it
//   * the watcher sees you where you are, follows you when you move, and your screen says "1 watching"
//   * the run ends: the watcher is told
//   * logged out, ?live= says to log in
//   node overworld/tests/micasurvivor_m3d_live_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9875;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- the server's two actions, stood in for (friends: hosty and viewer)
const WHO = { 'Bearer tok-hosty': 'hosty', 'Bearer tok-viewer': 'viewer' };
const live = {}, state = {}, polls = {}, log = [];
function api(who, q) {
	const now = Date.now();
	if (q.action === 'publish-micasurvivor') {
		log.push({ who, snap: !!q.snapshot, over: !!q.over, mode: q.mode, size: q.snapshot ? JSON.stringify(q.snapshot).length : 0 });
		live[who] = { run: q.run, mode: q.mode, label: q.label, over: !!q.over };
		const names = Object.keys(polls[who] || {}).filter((n) => now - polls[who][n] < 5000);
		if (q.snapshot && names.length) state[who] = { run: q.run, seq: q.seq, snap: q.snapshot, over: !!q.over };
		return [200, { ok: true, watchers: names.length, watcherNames: names, every: 1000, wrote: { state: !!(q.snapshot && names.length) } }];
	}
	if (q.action === 'micasurvivor-state') {
		const them = q.username, b = live[them], st = state[them];
		if (!(who === 'viewer' && them === 'hosty')) return [403, { error: 'not your friend' }];
		if (!b) return [200, { live: false, snapshot: null }];
		const head = { mode: b.mode, label: b.label, run: b.run };
		if (b.over) return [200, st && st.over ? { ...head, live: false, over: true, seq: st.seq, snapshot: st.snap } : { ...head, live: false, over: true, snapshot: null }];
		(polls[them] = polls[them] || {})[who] = now;
		if (!st || st.run !== b.run) return [200, { ...head, live: true, waiting: true, snapshot: null }];
		if (q.seq != null && q.seq === st.seq) return [200, { ...head, live: true, unchanged: true, seq: st.seq }];
		return [200, { ...head, live: true, seq: st.seq, snapshot: st.snap }];
	}
	return [200, { ok: true }];
}
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp' && req.method === 'POST') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { let q = {}; try { q = JSON.parse(b); } catch { } const who = WHO[req.headers.authorization || '']; const [code, body] = who ? api(who, q) : [401, { error: 'no' }]; res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	/** A person: a browser of their own (their own login, or none). */
	const person = async (name) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
		await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
		page.on('pageerror', e => errors.push(name + ' pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(name + ' console: ' + m.text().slice(0, 200)); });
		if (name !== 'nobody') await page.evaluateOnNewDocument((n) => { localStorage.setItem('magepunk_mp_token_v1', 'tok-' + n); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: n })); }, name);
		return page;
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__m3d && window.__m3d.ready)), 30000);
	const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };

	// ---- the player
	const host = await person('hosty');
	await host.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=4&weather=0`, { waitUntil: 'domcontentloaded' });
	const hok = await ready(host);
	await host.evaluate(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const asked = await waitFor(() => log.some((q) => q.who === 'hosty'), 5000);
	await sleep(2500);
	const h0 = await host.evaluate(() => ({ link: !!window.__m3d.siteHost, watched: window.__m3d.siteHost.watched, sent: window.__m3d.siteHost.sent }));
	A(hok && asked && h0.link && !h0.watched && h0.sent === 0 && log.every((q) => !q.snap && q.mode === 'exp-threed'), 'logged in, your run asks the server whether a friend is watching (mode exp-threed); unwatched it sends no frames', { h0, log });

	// ---- a friend
	const viewer = await person('viewer');
	await viewer.goto(`http://localhost:${PORT}/micasurvivor/m3d/?live=hosty`, { waitUntil: 'domcontentloaded' });
	const vok = await ready(viewer);
	const waiting = await waitFor(() => viewer.evaluate(() => window.__m3d.siteWatch.status === 'waiting' && window.__m3d.noteLog.includes('Waiting for the run…')), 5000);
	A(vok && waiting, 'a friend opens ?live=hosty: "Waiting for the run…"');
	// (the player's next ask, within ten seconds, sees the friend; then a second of frames a second)
	const flowing = await waitFor(() => log.some((q) => q.who === 'hosty' && q.snap), 15000);
	const loaded = await waitFor(async () => /[?&]live=hosty/.test(viewer.url()) && /[?&]xw=7/.test(viewer.url()) && await viewer.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.view && window.__m3d.rv)), 30000);
	const sizes = log.filter((q) => q.snap).map((q) => q.size);
	A(flowing && loaded && Math.max(...sizes) < 23000, `the player's page notices and sends a second of frames a second (${sizes.length} so far, the largest ${Math.max(0, ...sizes)} characters); the friend's page loads the run's map and shows it`, viewer.url());
	const near = await waitFor(async () => { const a = await host.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z })), b = await viewer.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z, room: window.__m3d.room.w, st: window.__m3d.siteWatch.status })); return b.st === 'live' && Math.hypot(a.x - b.x, a.z - b.z) < 2; }, 10000);
	const hud = await host.evaluate(() => [...document.querySelectorAll('#rx-bag .rx-chip')].map((e) => e.textContent));
	const vhud = await viewer.evaluate(() => [...document.querySelectorAll('#rx-bag .rx-chip')].map((e) => e.textContent));
	A(near && hud.includes('1 watching') && vhud.includes('Watching hosty'), 'the friend sees you where you stand; your screen says "1 watching", theirs "Watching hosty"', { hud, vhud });
	const p0 = await viewer.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z }));
	await host.evaluate(() => window.__m3d.setInput({ mx: 0, mz: -1, jump: false, crouch: false }));
	await sleep(1500); await host.evaluate(() => window.__m3d.setInput(null));
	const moved = await waitFor(async () => { const a = await host.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z })), b = await viewer.evaluate(() => ({ x: window.__m3d.state.x, z: window.__m3d.state.z })); return Math.hypot(b.x - p0.x, b.z - p0.z) > 3 && Math.hypot(a.x - b.x, a.z - b.z) < 2; }, 12000);
	A(moved, 'you walk on; a few seconds later the friend\'s screen has followed you there');
	await shot(viewer, 'm3d_live_viewer.png'); await shot(host, 'm3d_live_host.png');

	// ---- the end
	await host.evaluate(() => { const m = window.__m3d; m.world.pl.maxHp = 10; m.world.pl.xproc.shield = 0; m.world.pl.invuln = 0; m.world.pl.hp = 1; m.addBoss(150, m.state.x + 1.5, m.state.z, { slot: 0 }); for (const e of m.world.enemies) e.atk = 1e6; });
	const ended = await waitFor(() => log.some((q) => q.who === 'hosty' && q.over), 20000);
	const told = await waitFor(() => viewer.evaluate(() => window.__m3d.siteWatch.status === 'over' && window.__m3d.noteLog.some((q) => q === 'The run is over.' || q === 'RUN OVER')), 12000);
	A(ended && told && log.filter((q) => q.over).length === 1, 'the run ends: the server is told once, and the friend\'s screen says it is over', log.slice(-3));

	// ---- logged out
	const nobody = await person('nobody');
	await nobody.goto(`http://localhost:${PORT}/micasurvivor/m3d/?live=hosty`, { waitUntil: 'domcontentloaded' });
	await ready(nobody);
	const login = await waitFor(() => nobody.evaluate(() => window.__m3d.siteWatch.status === 'login' && window.__m3d.noteLog.includes('Log in to Magepunk to watch a friend.')), 5000);
	A(login, 'logged out, ?live= says to log in');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
