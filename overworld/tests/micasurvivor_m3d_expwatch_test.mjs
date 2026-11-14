// micasurvivor_m3d_expwatch_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): watching and replaying an
// Expedition run, on the page. One window PLAYS a run (?exp=7&host=<name>&tape=1); another WATCHES it (?watch=<name>),
// knowing nothing but the name: it learns the run's seed and map from the host, builds each zone's level itself, and
// is told the rest by the run's row (micasurvivor/m3d/expnet.js; its rules are tested in node,
// micasurvivor_m3d_expnet_test.mjs). Then the run's tape is played in a third window.
//   * the watcher is on the same level, with the same altar and the same things, and reads the same readout line
//   * it sees the money change, the altar charge, the guardian wake and fall, a banner
//   * through the portal it is on zone 2's level too
//   * a capture: the fainted alpha, then the team
//   * the replay goes through the same run: zone 1, the guardian, zone 2
//   node overworld/tests/micasurvivor_m3d_expwatch_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9851;
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

	const H = await open('?exp=7&dex=6&weather=0&auto=0&host=xr&tape=1', 'host');
	A(H.ok, 'a run is played and hosted (?exp=7&host=xr), taped as it goes');
	await H.page.evaluate(() => { const m = window.__m3d; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const quiet = () => H.page.evaluate(() => { const m = window.__m3d; m.run.acc = -1e9; for (const e of m.world.enemies) if (e !== m.run.boss && e.xk !== 'alpha') e.dead = true; });
	const W = await open('?watch=xr', 'watcher');
	A(W.ok, 'a watcher opens ?watch=xr (it does not know what is being played)');
	const agree = (a, b) => !!b && b.zone === a.zone && b.w === a.w && b.altar === a.altar && b.things === a.things && b.coins === a.coins;   // (the watcher is a moment behind: a check waits for it)
	const both = async () => [await H.page.evaluate(() => { const m = window.__m3d; return { w: m.room.w, altar: m.room.altar.join(), zone: m.run.zone, things: m.ecoView().length, coins: m.run.coins }; }),
		await W.page.evaluate(() => { const m = window.__m3d; return !m || !m.rv ? null : { search: location.search, w: m.room.w, altar: m.room.altar.join(), zone: m.rv.zone, things: m.rv.eco.length, coins: m.rv.coins, form: m.rv.league && m.rv.league.form, crowd: m.crowd.length }; })];
	const there = await waitFor(async () => { const [a, b] = await both(); return agree(a, b) && /xw=7/.test(b.search); }, 40000);
	let [h, w] = await both();
	A(there && /map=viridian/.test(w.search) && w.w === h.w && w.altar === h.altar && w.zone === 1 && w.things === h.things && w.things > 20 && w.form === 4, `it is sent to the run's page and builds zone 1 itself: the same level, altar and ${w.things} things; the player is a Charmander`, JSON.stringify([h, w]));
	A(await hudHas(W.page, /ZONE 1\/3 · FINAL SWARM IN \d:\d\d · ALTAR \d+ m · ₽ 0 · charge 0 % · Charmander · kit 1\/4/), 'its readout has the run\'s line', await hud(W.page));
	const lead = await waitFor(() => W.page.evaluate(() => { const m = window.__m3d, q = m.sheets.get('4/Idle'); return !!q && !!q.img; }), 10000);
	A(lead && w.crowd === 0 && await hudHas(W.page, /0 sprites/) && await hudHas(W.page, /Charmander .fire. · League member Charmander/) && !/level 7 · meadow/.test(await hud(W.page)), 'the player is drawn as a Charmander, alone: the test room\'s crowd is not in a watched run', await hud(W.page));

	// ---- money, the altar, the guardian
	await quiet();
	await H.page.evaluate(() => { const m = window.__m3d, o = m.ecoView().find((q) => q.kind === 'rock'); m.put(o.x, o.z); });
	const paid = await waitFor(async () => { const [a, b] = await both(); return a.coins > 0 && agree(a, b); }, 6000);
	[h, w] = await both();
	A(paid, `the player breaks a gold rock: the watcher sees the ${h.coins} ₽, and one thing fewer (${w.things})`, JSON.stringify([h, w]));
	await quiet();
	await H.page.evaluate(() => { const m = window.__m3d, a = m.room.altar; m.put(a[0], a[2]); });
	const charging = await waitFor(() => W.page.evaluate(() => window.__m3d.rv.charge > 0.2 && window.__m3d.rv.ph === 0), 5000);
	const woke = await waitFor(async () => { await quiet(); return W.page.evaluate(() => window.__m3d.rv.ph === 1 && !!window.__m3d.rv.boss); }, 8000);
	const banner = await waitFor(() => W.page.evaluate(() => window.__m3d.noteLog.some((q) => /the guardian, awakens!/.test(q))), 4000);
	A(charging && woke && banner && await hudHas(W.page, /GUARDIAN/), 'it sees the altar charge and the guardian wake, banner and all', await hud(W.page));
	await shot(W.page, 'm3d_expwatch_guardian.png');
	await H.page.evaluate(() => { const m = window.__m3d, e = m.run.boss; m.respawn(); m.world.hit(e, e.hp + 10, 0, 0, 0); });   // (away from the altar first: the portal would open under the player)
	A(await waitFor(() => W.page.evaluate(() => window.__m3d.rv.ph === 2), 5000) && await hudHas(W.page, /PORTAL \d+ m/), 'and fall: the portal');

	// ---- through the portal
	await quiet();
	await H.page.evaluate(() => { const m = window.__m3d, a = m.room.altar; m.put(a[0], a[2]); });
	const z2 = await waitFor(async () => { await quiet(); const [a, b] = await both(); return a.zone === 2 && agree(a, b); }, 10000);
	[h, w] = await both();
	A(z2 && w && w.zone === 2, 'the player takes the portal: the watcher is on zone 2\'s level too, with its altar and its things', JSON.stringify([h, w]));
	await shot(W.page, 'm3d_expwatch_zone2.png');

	// ---- a capture
	await quiet();
	await H.page.evaluate(() => { const m = window.__m3d; m.respawn(); for (let k = 1; k < 40; k++) { m.fire({ at: 0, kind: 'alpha', n: 1, dex: [74], seed: k }); const e = m.world.enemies.find((q) => q.xk === 'alpha' && !q.dead); if (e) { e.dummy = true; m.world.hit(e, 1e12, 0, 0, 0); break; } } });
	const fainted = await waitFor(() => W.page.evaluate(() => window.__m3d.rv.faint.length === 1 && window.__m3d.rv.faint[0].dex === 74), 5000);
	await H.page.evaluate(() => { const m = window.__m3d, f = m.capView().faint[0]; m.run.acc = -1e9; m.put(f.x + 1, f.z); });
	const ball = await waitFor(() => W.page.evaluate(() => !!window.__m3d.rv.cine), 5000);
	const team = await waitFor(() => W.page.evaluate(() => window.__m3d.rv.sa.join() === '74'), 8000);
	A(fainted && ball && team && await hudHas(W.page, /team: Geodude/), 'an alpha faints, the ball goes out, and the watcher sees the Geodude join the team', await hud(W.page));
	await sleep(600);
	await shot(W.page, 'm3d_expwatch_team.png');

	// ---- the tape
	const text = await H.page.evaluate(() => window.__m3d.tape.pack());
	const head = JSON.parse(text).h;
	A(head.exp && head.exp.seed === 7 && head.exp.map === 'viridian' && text.length > 5000, `the run's tape names its seed and map (${(text.length / 1024).toFixed(0)} KB so far)`);
	const R = await open(`?watch=replay&xw=${head.exp.seed}&map=${head.exp.map}&gen=${head.gen}&dex=${head.dex}`, 'replay');
	const info = await R.page.evaluate((t) => window.__m3d.playTape(t), text);
	const seen = { zones: new Set(), phs: new Set(), team: false, max: 0 };
	const t0 = Date.now();
	// (until the tape has played to its end, not its length + 6 s: on a loaded runner the replay page runs behind, and the read stopped
	//  in zone 1 or before the team came: 7 of main's 14 gate runs to 2026-11-14)
	while (Date.now() - t0 < (info.to - info.from) * 3000 + 30000) {
		const s = await R.page.evaluate(() => { const m = window.__m3d; return m.rv ? { z: m.rv.zone, ph: m.rv.ph, sa: m.rv.sa.length, t: m.watchT, w: m.room.w, coins: m.rv.coins } : null; });
		if (s) { seen.zones.add(s.z); seen.phs.add(s.z + ':' + s.ph); if (s.sa) seen.team = true; seen.max = Math.max(seen.max, s.coins); if (s.t >= info.to - 0.05) break; }
		await sleep(100);
	}
	A(R.ok && info.frames > 20 && seen.zones.has(1) && seen.zones.has(2) && seen.phs.has('1:1') && seen.phs.has('1:2') && seen.team && seen.max > 0, `the tape played in a third window (${info.frames} frames, ${(info.to - info.from).toFixed(0)} s): zone 1, the guardian, the portal, zone 2, the team, as it happened`, JSON.stringify({ zones: [...seen.zones], phs: [...seen.phs], team: seen.team, max: seen.max }));
	A(await hudHas(R.page, /replay/) && await hudHas(R.page, /ZONE 2\/3/), 'its readout says it is a replay, and ends in zone 2', await hud(R.page));
	A(errors.length === 0, 'no page errors in any window', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
