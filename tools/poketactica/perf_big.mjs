// perf_big.mjs — the page on the biggest made map, on a phone: 32 x 32, you + 3 computer seats (6 figurines each), 24 wild
// foes. Headless Chrome at 390 x 844 (DPR 3) with the CPU slowed (--cpu=4: a mid phone), no GPU (SwiftShader: the frame
// times are a worst case, compare them run to run). Prints JSON: frame times idle, the longest task when you end your turn
// (the computers' and wild foes' phases), the enemy-range overlay, and the frame times while the round animates.
//   node tools/poketactica/perf_big.mjs [--cpu=4] [--size=32] [--foes=24]
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? +h.split('=')[1] : d; };
const CPU = arg('cpu', 4), SIZE = arg('size', 32), FOES = arg('foes', 24), PORT = 8961;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const out = { size: SIZE, foes: FOES, cpuSlowdown: CPU };
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
	const errors = []; page.on('pageerror', (e) => errors.push(e.message));
	const FIGS = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(['pikachu', 'machamp', 'charmander', 'squirtle', 'gengar', 'eevee'].map((sp, i) => [sp + '-pf' + i, { v: 1, id: sp + '-pf' + i, species: sp, level: 50, exp: 0, ability: null, shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'] }])) });
	await page.evaluateOnNewDocument((figs) => { try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_coach_v1', 'done'); localStorage.setItem('magepunk_poketactica_figs_v1', figs); } catch { /* */ } }, FIGS);
	await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(250);
	const cdp = await page.createCDPSession();
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
	// the match: a made map with 4 bases in the corners and the foes spread over the middle
	await page.evaluate(async (SIZE, FOES) => {
		const Ed = await import('/poketactica/js/editor.js');
		let m = Ed.newMap('Perf', SIZE, SIZE);
		m = Ed.apply(Ed.apply(m, 'seat', 0, 0).map, 'seat', SIZE - 1, SIZE - 1).map;
		const sps = ['machamp', 'gengar', 'dragonite', 'tyranitar', 'pikachu', 'snorlax'];
		for (let i = 0; i < FOES; i++) { const r = Ed.apply(m, 'foe', 3 + (i * 7) % (SIZE - 6), 3 + Math.floor(i * 7 / (SIZE - 6)) * 4 % (SIZE - 6), { foe: { sp: sps[i % sps.length], lv: 50, ai: 'aggro' } }); if (r.map) m = r.map; }
		for (let i = 0; i < SIZE * 3; i++) { const r = Ed.apply(m, 'raise', (i * 13) % SIZE, (i * 29) % SIZE); if (r.map) m = r.map; }
		const T = window.__poketactica, figs = Object.values(T.P.col.figs || {}).slice(0, 6);
		const me = figs.length ? figs : null;
		const picks = (k) => ['pikachu', 'charmander', 'squirtle', 'bulbasaur', 'machop', 'geodude', 'abra', 'gastly', 'eevee', 'growlithe'].slice(k, k + 6);
		const config = { arena: 'custom', map: m, lv: 50, seats: [me ? { name: 'me', team: me } : { name: 'me', cpu: false, picks: picks(0), level: 50 }, { name: 'CPU Blue', cpu: true, picks: picks(1), level: 50 }, { name: 'CPU Green', cpu: true, picks: picks(2), level: 50 }, { name: 'CPU Silver', cpu: true, picks: picks(3), level: 50 }] };
		T.online.call = async () => ({ ok: false });
		T.startOnline({ id: 'perf', players: [], size: 4 }, { seed: 'perf', side: 'a', config, actions: [] });
	}, SIZE, FOES);
	await sleep(3000);
	const frames = (ms) => page.evaluate((ms) => new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; const f = (now) => { d.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else { d.sort((a, b) => a - b); res({ fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p50: +d[d.length >> 1].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); }), ms);
	out.units = await page.evaluate(() => window.__poketactica.P.S.units.filter((u) => u.x != null && u.hp > 0).length);
	out.idle = await frames(3000);
	// the enemy range (👁): every foe's threat, drawn
	out.dangerMs = await page.evaluate(() => { const T = window.__poketactica, t0 = performance.now(); T.P.dangerOn = true; T.P.ver++; T.cursorTo(T.P.cursor.x, T.P.cursor.y); const ms = performance.now() - t0; T.P.dangerOn = false; T.cursorTo(T.P.cursor.x, T.P.cursor.y); return +ms.toFixed(0); });
	// end the turn: the 3 computers and the wild foes play (inside one act), then their moves animate
	for (let r = 1; r <= 2; r++) {
		const endMs = await page.evaluate(() => { const T = window.__poketactica, t0 = performance.now(); T.P.busy = false; T.act({ t: 'end' }); return +(performance.now() - t0).toFixed(0); });
		const during = await frames(4000);
		out['round' + r] = { endTurnMs: endMs, animating: during };
		await page.evaluate(async () => { const T = window.__poketactica; T.P.skip = true; for (let i = 0; i < 200 && T.P.busy; i++) await new Promise((r) => setTimeout(r, 50)); });
	}
	out.errors = errors.slice(0, 3);
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify(out));
