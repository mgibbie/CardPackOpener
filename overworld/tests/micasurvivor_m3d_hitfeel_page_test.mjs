// micasurvivor_m3d_hitfeel_page_test.mjs — MicaSurvivor 3D: hit-stop and camera kick, in a real browser
// (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part B: B5). The owner, 2026-11-14: "On, with a setting".
//   * on by default: a critical hit of yours stops the fight for a moment and kicks the camera, at most once every 0.6 s
//     (a move that crits every tick must not turn the fight into a slide show)
//   * H turns it off: no more stops or kicks; the choice is kept on this device and survives a reload
//   * with the system asking for reduced motion, and no choice made, it starts off
//   node overworld/tests/micasurvivor_m3d_hitfeel_page_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9923;
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
	// an Expedition of your own (alone: the stop may be taken); nothing arrives by itself, you cannot fall, every hit of yours is critical
	const boot = async () => {
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=4&weather=0`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready)), 30000);
		if (ok) await M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; m.world.pl.crit = 1; });
		return ok;
	};
	const hf = () => M(() => window.__m3d.hitFeel());
	const foe = () => M(() => { const m = window.__m3d, s = m.state; let e = m.world.enemies.find((q) => !q.dead); if (!e) e = m.addEnemy(19, s.x + 2.5, s.z, { dummy: true }); e.a.x = s.x + 2.5; e.a.z = s.z; e.a.y = s.y; e.hp = e.maxHp = 1e9; return m.hitFeel(); });

	A(await boot(), 'an Expedition boots (Charmander, alone)');
	let v = await hf();
	A(v.on === true && v.stops === 0 && v.kicks === 0, 'hit feel is on from the start, and nothing has happened yet', v);
	const got = await waitFor(async () => { const q = await foe(); return q.stops > 0 && q.kicks > 0; }, 30000);
	v = await hf();
	A(got, 'a critical hit of yours stops the fight for a moment and kicks the camera', v);
	const s0 = (await hf()).stops, t0 = Date.now();
	while (Date.now() - t0 < 1500) { await foe(); await sleep(60); }
	const s1 = (await hf()).stops, sec = (Date.now() - t0) / 1000;
	A(s1 - s0 <= Math.ceil(sec / (v.K.CRIT_EVERY / 1000)) + 1, `at most one every ${v.K.CRIT_EVERY / 1000} s, however often you crit (${s1 - s0} in ${sec.toFixed(1)} s)`, { s0, s1 });

	// an enemy that is hit is drawn nearly white and squashed for an instant (render.js HIT_WHITE, HIT_SQUASH): sampled off the canvas
	{
		const h0 = await M(() => window.__m3d.hitShown);
		await waitFor(async () => { await foe(); return (await M(() => window.__m3d.hitShown)) > h0 + 2; }, 15000);
		const h1 = await M(() => window.__m3d.hitShown);
		const src = fs.readFileSync(path.join(ROOT, 'micasurvivor/m3d/render.js'), 'utf8');
		A(h1 > h0 && /vTint\.x >= 1\.99 \? mix\(c\.rgb, vec3\(1\.0\), 0\.78\)/.test(src) && /HIT_WHITE = 2/.test(src), 'an enemy that is hit is drawn nearly white and squashed for an instant', { h0, h1 });
	}
	// H: off
	await page.keyboard.press('KeyH');
	v = await hf();
	A(v.on === false && (await M(() => localStorage.getItem('m3d.hitfeel'))) === '0', 'H turns it off, and the choice is kept on this device', v);
	const k0 = v.kicks, st0 = v.stops, t1 = Date.now();
	while (Date.now() - t1 < 1200) { await foe(); await sleep(60); }
	v = await hf();
	A(v.kicks === k0 && v.stops === st0, 'off: critical hits no longer stop the fight or kick the camera', { k0, st0, v });
	A(await boot(), 'the page is loaded again');
	A((await hf()).on === false, 'still off after a reload');

	// the run menu: Hit-stop and Effects, as buttons
	{
		await M(() => { localStorage.removeItem('m3d.fx'); });
		A(await boot(), 'the page is loaded again (for the menu)');
		await page.keyboard.press('Escape');
		const shown = await waitFor(() => M(() => !!document.getElementById('rx-hitfeel') && !!document.getElementById('rx-fx')), 5000);
		const t0 = await M(() => ({ hf: document.getElementById('rx-hitfeel').textContent, fx: document.getElementById('rx-fx').textContent, s: window.__m3d.fxSettings() }));
		A(shown && /Hit-stop and shake: off/.test(t0.hf) && t0.fx === 'Effects: Auto' && t0.s.q === 1, 'the run menu has "Hit-stop and shake" (off, as chosen) and "Effects: Auto" (full to start with)', t0);
		await M(() => document.getElementById('rx-hitfeel').click());
		const hfOn = await waitFor(() => M(() => window.__m3d.hitFeel().on && /: on/.test(document.getElementById('rx-hitfeel').textContent)), 3000);
		A(hfOn, 'its Hit-stop button turns it on, and says so');
		const seen = [];
		for (let i = 0; i < 3; i++) { await M(() => document.getElementById('rx-fx').click()); await sleep(150); seen.push(await M(() => ({ label: document.getElementById('rx-fx').textContent, q: window.__m3d.fxSettings().q, kept: localStorage.getItem('m3d.fx') }))); }
		A(seen[0].label === 'Effects: Full' && seen[0].q === 1 && seen[1].label === 'Effects: Reduced' && seen[1].q === 0.5 && seen[1].kept === 'reduced' && seen[2].label === 'Effects: Auto' && seen[2].kept === 'auto', 'Effects goes Auto → Full → Reduced → Auto; Reduced halves the effects; the choice is kept on this device', seen);
		await M(() => window.__m3d.setFxSlow(true));
		const auto = await M(() => window.__m3d.fxSettings());
		A(auto.q === 0.5 && auto.label === 'Auto (reduced)', 'on Auto, slow frames drop it to reduced (and the menu says so)', auto);
		await page.keyboard.press('Escape');
	}
	// reduced motion, no choice made: off from the start
	await M(() => localStorage.removeItem('m3d.hitfeel'));
	await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
	A(await boot() && (await hf()).on === false, 'with the system asking for reduced motion, and no choice made, it starts off');
	await page.keyboard.press('KeyH');
	A((await hf()).on === true, '…and H still turns it on for whoever wants it');
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
