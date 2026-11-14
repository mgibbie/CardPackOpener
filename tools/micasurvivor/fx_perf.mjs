// tools/micasurvivor/fx_perf.mjs — how much the 3D effects cost a frame, on a phone-shaped page with the CPU slowed
// (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, B7). The same busy fight (four Fire moves, 40 tough enemies standing all round)
// is measured with the effects Full, Reduced, on Auto (the default: it should step down by itself), and with the effects layer
// emptied each frame (the "none" baseline).
// Headless Chrome draws with SwiftShader (on the CPU), so the absolute numbers are a slow phone's at best; compare the
// three with each other.
//   node tools/micasurvivor/fx_perf.mjs [--cpu 4] [--secs 12]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const CPU = arg('--cpu', 4), SECS = arg('--secs', 12);
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); if (u.startsWith('/api/')) { res.writeHead(401); res.end('{}'); return; } const f = u.endsWith('/') ? u + 'index.html' : u; fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
await new Promise((r) => server.listen(9931, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const out = {};
try {
	for (const mode of ['none', 'reduced', 'full', 'auto']) {
		const page = await browser.newPage();
		await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		await page.evaluateOnNewDocument((m) => { try { localStorage.setItem('m3d.fx', m === 'reduced' ? 'reduced' : m === 'auto' ? 'auto' : 'full'); } catch { } }, mode);
		await page.goto('http://localhost:9931/micasurvivor/m3d/?gen=5&fight=1&dex=4&moves=flamethrower:4,ember:5,fire-spin:3,heat-wave:3', { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.fx() && window.__m3d.fx().lit))); i++) await sleep(100);
		await page.evaluate((m) => {
			const M = window.__m3d, w = M.world, st = M.state; w.pl.maxHp = w.pl.hp = 1e9; w.cast = []; for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 3 + (i % 5) * 1.6, e = M.addEnemy(19, st.x + Math.cos(a) * r, st.z + Math.sin(a) * r, { dummy: true }); e.hp = e.maxHp = 1e12; }   // (40 tough enemies all round: every move has something to hit)
			if (m === 'none') { const f = window.__m3d.fxLayer, end = f.end.bind(f); f.end = () => { f.parts.length = 0; f.sprites.n = 0; f.glows.n = 0; if (f.lights) f.lights.n = 0; if (f.anims) f.anims.n = 0; end(); }; }
		}, mode);
		const cdp = await page.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
		await sleep(4000);   // (the fight fills up)
		await page.evaluate(() => { window.__fxperf = []; let last = performance.now(); const loop = (t) => { window.__fxperf.push(t - last); last = t; if (window.__fxperf.length < 100000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
		await sleep(SECS * 1000);
		const r = await page.evaluate(() => { const f = window.__fxperf.slice(5).sort((a, b) => a - b), s = window.__m3d.fx(); return { n: f.length, avg: f.reduce((a, b) => a + b, 0) / f.length, p50: f[Math.floor(f.length / 2)], p95: f[Math.floor(f.length * 0.95)], enemies: window.__m3d.world.enemies.filter((e) => !e.dead).length, sprites: s.sprites, lights: s.lights, anims: s.anims, parts: s.parts, set: window.__m3d.fxSettings().label }; });
		out[mode] = r; await page.close();
		console.log(`${mode.padEnd(8)} ${(1000 / r.avg).toFixed(0).padStart(3)} fps   frame avg ${r.avg.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms   (${r.enemies} enemies; drawn: ${r.sprites} sprites, ${r.lights} lights, ${r.anims} anims, ${r.parts} pieces; ${r.set})`);
	}
} finally { await browser.close(); server.close(); }
