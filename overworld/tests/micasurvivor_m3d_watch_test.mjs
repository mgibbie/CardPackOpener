// micasurvivor_m3d_watch_test.mjs — MicaSurvivor 3D, P3n (Plans/MICASURVIVOR_3D_PLAN.md 4.1): two tabs in a test room.
// One HOSTS a fight (?gen=7&fight=1&host=<name>); the other WATCHES it (?watch=<name>) through the frames of
// micasurvivor/m3d/net.js, carried here by a BroadcastChannel (the test room's transport; the format is the transport's
// cargo, whatever carries it). The plan's proof for P3n:
//   * a watcher sees the host JUMP (to the same height), SLIDE, and an enemy KNOCKED OFF A LEDGE fall (through heights
//     in between: an arc, not a jump from top to bottom)
//   * the watcher simulates nothing and has its own camera; it learns the level from the host and loads it
//   * enemies are where the host has them; hits show as damage numbers; the readout follows
//   * a recorded fight (tape v3) plays back on a page of its own to the same end
//   * the sizes of what was sent are within the caps
//   * sent as the site's relay would carry it (one message a second), a watcher still sees a jump whole, a second or
//     two behind
//   node overworld/tests/micasurvivor_m3d_watch_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9831;
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
		// each in a WINDOW of its own: a tab behind another is not animated, and a host that is not animated sends nothing
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

	// ======================== the host, then a watcher that only knows its name
	const H = await open('?gen=7&fight=1&host=room1&tape=1&moves=ember:3&cast=19,41&cap=14&weather=0&ability=0', 'host');
	A(H.ok, 'the host\'s fight boots');
	await H.page.evaluate(() => { window.__m3d.world.pl.invuln = 1e9; });
	const W = await open('?watch=room1', 'watcher');
	A(W.ok, 'a watcher opens ?watch=room1 (it does not know the level yet)');
	// both tabs must keep running: a tab in the background is throttled, so each is brought forward when it is asked
	const moved = await waitFor(() => W.page.evaluate(() => /gen=7/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.view)), 20000);
	const w0 = await W.page.evaluate(() => { const m = window.__m3d; return { search: location.search, gen: m.gen, biome: m.biome, world: m.world, frames: m.viewer.frames.length, got: m.net.got, hud: document.getElementById('hud').textContent, w: m.room.w }; });
	A(moved && w0.gen === 7 && w0.biome === 'meadow' && w0.w === 37, 'it learns the level from the host\'s first whole frame and loads it (level 7, meadow)', JSON.stringify(w0));
	A(w0.world === null && w0.frames > 0 && /watching room1/.test(w0.hud), 'it runs no fight of its own: it has frames, and the readout says who it is watching', JSON.stringify(w0));

	// what the watcher sees while the host does something: sample both every 50 ms
	const during = async (hostDo, ms, read) => {
		const seen = [];
		const hostP = H.page.evaluate(hostDo);
		const t0 = Date.now();
		while (Date.now() - t0 < ms) { const [h, w] = await Promise.all([H.page.evaluate(read.host), W.page.evaluate(read.watch)]); seen.push({ h, w }); await sleep(40); }
		await hostP;
		return seen;
	};
	// ---- a jump
	const jump = await during(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.setInput({ mx: 0, mz: 0, jump: true }); await wait(350); m.setInput(null); }, 1600,
		{ host: () => window.__m3d.state.y - window.__m3d.room.spawn[1], watch: () => (window.__m3d.view ? window.__m3d.state.y - window.__m3d.room.spawn[1] : 0) });
	const topH = Math.max(...jump.map(s => s.h)), topW = Math.max(...jump.map(s => s.w)), endW = jump[jump.length - 1].w;
	A(topH > 1.4 && Math.abs(topW - topH) < 0.2 && Math.abs(endW) < 0.05, `the host jumps ${topH.toFixed(2)} m: the watcher sees it rise to ${topW.toFixed(2)} m and come back down`, JSON.stringify([topH, topW, endW]));
	const steps = new Set(jump.map(s => Math.round(s.w * 5))).size;
	A(steps >= 5, `...through the heights in between (${steps} different heights seen on the way), not from floor to top`, String(steps));
	// ---- a slide
	const slide = await during(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.setInput({ mx: 1, mz: 0 }); await wait(700); m.setInput({ mx: 1, mz: 0, crouch: true }); await wait(500); m.setInput(null); }, 1700,
		{ host: () => [window.__m3d.state.sliding, window.__m3d.state.x], watch: () => [window.__m3d.state.sliding, window.__m3d.state.x] });
	const xH = slide[slide.length - 1].h[1], xW = slide[slide.length - 1].w[1];
	A(slide.some(s => s.h[0]) && slide.some(s => s.w[0]) && Math.abs(xH - xW) < 0.3, `the host runs and slides: the watcher sees the slide, and has it end in the same place (${xH.toFixed(2)} / ${xW.toFixed(2)} m)`, JSON.stringify([xH, xW]));
	// ---- an enemy knocked off a ledge: the host puts one at the top of a cliff and shoves it over
	const cliff = await H.page.evaluate(() => { const m = window.__m3d, r = m.room;
		for (let cz = 2; cz < r.h - 2; cz++) for (let cx = 2; cx < r.w - 3; cx++) { const a = cz * r.w + cx, b = a + 1, c = a + 2, hi = r.cells[a], lo = r.cells[b];
			if (hi < r.rimH && hi - lo >= 1.4 && r.cells[c] === lo && r.cells[a - 1] === hi && !r.slopes.has(a) && !r.slopes.has(b) && !r.slopes.has(c) && !r.water.has(b) && !r.water.has(c)) return { x: (cx + 0.6) * 2, z: (cz + 0.5) * 2, hi, lo }; }
		return null; });
	A(!!cliff, 'the level has a cliff to shove an enemy off', JSON.stringify(cliff));
	const fall = await during(async () => { }, 0, { host: () => 0, watch: () => 0 }).then(async () => {
		const id = await H.page.evaluate((c) => { const m = window.__m3d; m.put(c.x - 6, c.z); const e = m.addEnemy(19, c.x, c.z, { dummy: true, hp: 1e5 }); e.a.y = c.hi; e.a.grounded = true; window.__shove = e; return e.id; }, cliff);
		await sleep(500);
		const seen = [];
		await H.page.evaluate(() => { window.__shove.a.kx = 9; });
		const t0 = Date.now();
		while (Date.now() - t0 < 1500) { const [h, w] = await Promise.all([H.page.evaluate(() => window.__shove.a.y), W.page.evaluate((id) => { const v = window.__m3d.view, e = v && v.enemies.find(q => q.id === id); return e ? e.a.y : null; }, id)]); seen.push({ h, w }); await sleep(30); }
		return seen;
	});
	const ys = fall.map(s => s.w).filter(v => v !== null), between = ys.filter(y => y < cliff.hi - 0.12 && y > cliff.lo + 0.12);
	A(ys.length > 10 && Math.abs(ys[0] - cliff.hi) < 0.05 && Math.abs(ys[ys.length - 1] - cliff.lo) < 0.05, `an enemy shoved off a ${(cliff.hi - cliff.lo).toFixed(1)} m cliff: the watcher has it at the top, then at the bottom`, JSON.stringify([ys[0], ys[ys.length - 1], cliff]));
	A(between.length >= 2, `...and falling in between (seen at ${between.slice(0, 5).map(y => y.toFixed(2)).join(', ')} m on the way down)`, JSON.stringify(ys.slice(0, 40)));
	await shot(W.page, 'm3d_watch.png');

	// ---- the fight itself: enemies where the host has them, hits as numbers, cameras apart
	await H.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); m.put(m.room.spawn[0], m.room.spawn[2]); m.addEnemy(19, m.state.x + 5, m.state.z, { dummy: true, hp: 1e5 }); await wait(1500); });
	const both = await Promise.all([H.page.evaluate(() => { const m = window.__m3d; return { t: m.world.t, yaw: m.cam.yaw, n: m.world.enemies.length, e: m.world.enemies.map(e => [e.id, e.a.x, e.a.z, e.dex]), sent: m.net.sent, chars: m.net.chars, kills: m.world.stats.kills, hits: m.world.stats.hits }; }),
		W.page.evaluate(() => { const m = window.__m3d, v = m.view; return { t: v.t, n: v.enemies.length, e: v.enemies.map(e => [e.id, e.a.x, e.a.z, e.dex]), nums: m.numbers.length, sheets: [...m.sheets.keys()].filter(k => /Walk/.test(k)).length, calls: m.stats().calls, hud: document.getElementById('hud').textContent, got: m.net.got }; })]);
	const [h1, w1] = both, hb = new Map(h1.e.map(r => [r[0], r])), common = w1.e.filter(r => hb.has(r[0])), far = common.filter(r => { const o = hb.get(r[0]); return o[3] !== r[3] || Math.hypot(o[1] - r[1], o[2] - r[2]) > 1.5; });   // (the watcher is a moment behind: one it still shows may have fallen on the host since, and is no mismatch)
	A(w1.n >= 2 && Math.abs(w1.n - h1.n) <= 2 && common.length >= 1 && far.length <= 1, `the watcher has the host's ${h1.n} enemies (${w1.n}), each the same species and within 1.5 m of where the host has it a moment later`, JSON.stringify([h1.n, w1.n, far.slice(0, 3)]));
	A(h1.t - w1.t > 0 && h1.t - w1.t < 0.6, `the watcher runs ${((h1.t - w1.t) * 1000).toFixed(0)} ms behind the host: enough to always have a frame on each side`, JSON.stringify([h1.t, w1.t]));
	A(w1.sheets >= 1 && w1.calls >= 4 && /Lv \d+ · HP \d+ \/ \d+ · \d+ enemies · \d+ KOs/.test(w1.hud), 'it loaded the sprites of the species it was shown, draws them, and its readout has the host\'s level, HP, enemies and KOs', JSON.stringify([w1.sheets, w1.calls, w1.hud]));
	const nums = await waitFor(() => W.page.evaluate(() => window.__m3d.numbers.length > 0), 4000);
	A(nums, 'the host\'s hits show on the watcher as damage numbers');
	const camsApart = await (async () => { await W.page.evaluate(() => { const m = window.__m3d; m.cam.manual = performance.now() + 60000; m.cam.yaw = 1.1; }); await sleep(300); const [a, b] = await Promise.all([H.page.evaluate(() => window.__m3d.cam.yaw), W.page.evaluate(() => window.__m3d.cam.yaw)]); return [a, b]; })();
	A(Math.abs(camsApart[1] - 1.1) < 1e-6 && Math.abs(camsApart[0] - 1.1) > 0.05, 'the watcher turns its own camera; the host\'s does not move with it', JSON.stringify(camsApart));
	// ---- sizes
	const per = h1.chars / h1.sent;
	A(h1.sent > 50 && per < 16000 && h1.chars / h1.t < 60000, `what the host sent: ${h1.sent} messages, ${Math.round(per)} characters each on average, ${(h1.chars / h1.t / 1024).toFixed(1)} KB a second with ${h1.n} enemies`, JSON.stringify([h1.sent, h1.chars, h1.t]));

	// ======================== a tape: recorded by the host, played on a page of its own
	const rec = await H.page.evaluate(() => { const m = window.__m3d, text = m.tape.pack(); return { text, frames: m.tape.f.length, kills: m.world.stats.kills, t: m.world.t, level: m.world.pl.level }; });
	A(rec.frames > 20 && rec.text.length < 1200000, `the host's tape so far: ${rec.frames} frames (${(rec.t).toFixed(0)} s), ${(rec.text.length / 1024).toFixed(0)} KB as text`, String(rec.text.length));
	const R = await open('?watch=nobody&gen=7&dex=25', 'replay');
	const played = await R.page.evaluate((text) => window.__m3d.playTape(text), rec.text);
	A(R.ok && played.frames === rec.frames && played.header.gen === 7 && played.header.dex === 25, 'a page with no host plays the tape: its header names the level and who played', JSON.stringify(played));
	await sleep(1200);
	const mid = await R.page.evaluate(() => { const m = window.__m3d; return { t: m.watchT, view: !!m.view, x: m.state.x, hud: document.getElementById('hud').textContent }; });
	A(mid.view && mid.t > played.from + 0.5 && /replay/.test(mid.hud), `it plays: ${(mid.t - played.from).toFixed(1)} s in after a second, and the readout says replay`, JSON.stringify(mid));
	const end = await R.page.evaluate((to) => { const m = window.__m3d; const v = m.viewer.sample(to); return { kills: v.kills, level: v.pl.level, enemies: v.enemies.length }; }, played.to);
	A(Math.abs(end.kills - rec.kills) <= 1 && end.level === rec.level, `at its end the tape has the fight where the host had it: ${end.kills} KOs, level ${end.level}`, JSON.stringify([end, rec.kills, rec.level]));
	await shot(R.page, 'm3d_replay.png');
	// ======================== as the site's relay would carry it: ONE message a second
	{
		const H2 = await open('?gen=7&fight=1&host=room9&relay=1&moves=ember:3&cast=19,41&cap=14&weather=0&ability=0', 'relay host');
		await H2.page.evaluate(() => { window.__m3d.world.pl.invuln = 1e9; });
		const W2 = await open('?watch=room9', 'relay watcher');
		const up = await waitFor(() => W2.page.evaluate(() => /gen=7/.test(location.search) && !!(window.__m3d && window.__m3d.ready && window.__m3d.view)), 25000);
		A(H2.ok && W2.ok && up, 'a host sending as the relay would, and a watcher of it');
		await sleep(1500);
		// (each page keeps its own highest point, looked at every few ms inside the page. Asking both pages from here every
		//  40 ms missed the top of the jump on a loaded runner: CI read "1.38 m of 1.35 m", then "1.15 m of 1.56 m", 2026-11-13)
		const track = (p) => p.evaluate(() => { window.__peak = -1e9; clearInterval(window.__peakT); window.__peakT = setInterval(() => { const m = window.__m3d; window.__peak = Math.max(window.__peak, m.state.y - m.room.spawn[1]); }, 5); });
		await Promise.all([track(H2.page), track(W2.page)]);
		const hostP = H2.page.evaluate(async () => { const m = window.__m3d, wait = (ms) => new Promise(r => setTimeout(r, ms)); await wait(300); m.setInput({ mx: 0, mz: 0, jump: true }); await wait(350); m.setInput(null); });
		await sleep(3800);
		await hostP;
		const peak = (p) => p.evaluate(() => { clearInterval(window.__peakT); return window.__peak; });
		const [tH, tW] = await Promise.all([peak(H2.page), peak(W2.page)]);
		const rs = await Promise.all([H2.page.evaluate(() => ({ sent: window.__m3d.net.sent, biggest: window.__m3d.net.biggest, t: window.__m3d.world.t })), W2.page.evaluate(() => ({ got: window.__m3d.net.got, relay: window.__m3d.net.relay, behind: 0, frames: window.__m3d.viewer.frames.length, t: window.__m3d.watchT }))]);
		A(rs[1].relay && Math.abs(rs[0].sent - rs[0].t) < 2.5 && rs[0].biggest < 16000, `the host sent ${rs[0].sent} messages in ${rs[0].t.toFixed(0)} s (one a second), the biggest ${rs[0].biggest} characters (the relay's cap is 16,000)`, JSON.stringify(rs));
		// (what this guards: the jump is IN the message, not lost between one-a-second messages: a watcher given only the
		//  message's last position would see about 0 m. It is not a height match. On a loaded runner the host's held jump is
		//  lower (main gate 2026-11-13: 1.35 m) and each page samples its own top a little off (1.22 m of 1.56 m), so
		//  "host above 1.4 m and within 0.25 m" failed twice with the jump plainly seen.)
		A(tH > 1.0 && tW > 0.6 * tH && tW < tH + 0.5,`a jump inside one of those messages is seen whole by the watcher: ${tW.toFixed(2)} m of ${tH.toFixed(2)} m`, JSON.stringify([tH, tW]));
		A(rs[0].t - rs[1].t > 0.9 && rs[0].t - rs[1].t < 2.6, `the watcher runs ${(rs[0].t - rs[1].t).toFixed(1)} s behind: the price of one message a second`, JSON.stringify([rs[0].t, rs[1].t]));
	}
	A(errors.length === 0, 'no page errors on the host, the watcher or the replay', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
