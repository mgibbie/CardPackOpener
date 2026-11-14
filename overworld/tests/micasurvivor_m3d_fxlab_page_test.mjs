// micasurvivor_m3d_fxlab_page_test.mjs — MicaSurvivor 3D: the effects gallery (?fxlab=1, micasurvivor/m3d/fxlab.js), in a
// real browser. A page the owner can open to look every attack over without playing for it.
//   * it lists every move that has a look of its own (base and Expedition; not the buffs, not the weather), then a hit
//     of every type, KOs, and an enemy's warning and blast
//   * nobody arrives by themselves and you cannot be hurt; three targets stand in front of you
//   * each move, given to you alone, is drawn by the effects layer within its few seconds: sampled across the list
//   * N goes to the next, B back; it moves on by itself when the time is up; &from= starts at a move
//   node overworld/tests/micasurvivor_m3d_fxlab_page_test.mjs      (SHOTS=<dir> for a screenshot of each sampled move)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9925;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
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
	// (the effects pinned to Full: this checks what Full draws. On Auto, the default since #1211, a busy machine steps down to Reduced
	//  mid-test, and your shots lose their light)
	await page.evaluateOnNewDocument(() => { try { localStorage.setItem('m3d.fx', 'full'); } catch { } });
	await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const M = (f, ...a) => page.evaluate(f, ...a);
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?gen=5&fight=1&dex=25&fxlab=1&secs=60`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.fxlab)), 30000), 'the gallery opens on a fight (?fxlab=1)');
	const info = await M(() => { const L = window.__m3d.fxlab; return { n: L.list.length, moves: L.list.filter((q) => q.kind === 'move').map((q) => q.id), tail: L.list.slice(-3).map((q) => q.kind), board: document.getElementById('fxlab').textContent }; });
	A(info.moves.length >= 60 && info.moves.includes('flamethrower') && info.moves.includes('thunderbolt') && !info.moves.includes('swords-dance') && info.tail.join() === 'types,ko,enemy', `it lists ${info.moves.length} moves with a look of their own (no buffs), then every type's hit, KOs, an enemy's warning`, info);
	A(/FX lab · 1 \/ \d+/.test(info.board) && /N next · B back/.test(info.board), 'a board over the screen says which one, of how many, and the keys', info.board);
	// sample across the list: each is drawn within its time
	const sample = [0, 7, 15, 23, 31, 39, 47, 55, info.moves.length - 1].filter((i, k, a) => i < info.moves.length && a.indexOf(i) === k), bad = [];
	for (const i of sample) {
		const before = await M((i) => { const m = window.__m3d; m.fxlab.go(i); const f = m.fx(); return { sprites: f.byShape, lights: f.byLight, sheets: f.bySheet, id: m.fxlab.now().id }; }, i);
		const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0), n0 = sum(before.sprites) + sum(before.lights) + sum(before.sheets);
		const drawn = await waitFor(async () => { const f = await M(() => window.__m3d.fx()); return sum(f.byShape) + sum(f.byLight) + sum(f.bySheet) > n0 + 3; }, 12000);
		const st = await M(() => ({ moves: window.__m3d.world.pl.moves.map((m) => m.id), enemies: window.__m3d.world.enemies.filter((e) => !e.dead).length, hurt: window.__m3d.world.pl.hp < window.__m3d.world.pl.maxHp }));
		if (!drawn || st.moves.join() !== before.id || st.enemies < 1 || st.hurt) bad.push({ i, id: before.id, drawn, ...st });
		if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(400); await page.screenshot({ path: path.join(SHOTS, `fxlab-${String(i).padStart(2, '0')}-${before.id}.png`) }); }
	}
	A(bad.length === 0, `each sampled move (${sample.length}) is yours alone, has its targets, and is drawn by the effects layer within its time; you are not hurt`, bad);
	const left = await M(() => window.__m3d.world.enemies.filter((e) => !e.dead && e.dex !== 10).length);
	A(left === 0, 'nobody arrives by themselves (only the lab\'s targets)', left);
	// the games' own sprites in flight, where the Emerald set has the right one
	const own = {};
	for (const [id, sheet] of [['shadow-ball', 'shadow_ball'], ['ember', 'small_ember'], ['bubble', 'bubble']]) {
		const n0 = await M(([id, sh]) => { const m = window.__m3d, L = m.fxlab; L.go(L.list.findIndex((q) => q.id === id)); return m.fx().bySheet[sh] || 0; }, [id, sheet]);
		own[id] = await waitFor(() => M(([sh, n0]) => { const f = window.__m3d.fx(); return f.animated && (f.bySheet[sh] || 0) > n0 + 5 && f.ownShots >= 0; }, [sheet, n0]), 12000);
	}
	A(Object.values(own).every(Boolean), 'Shadow Ball, Ember and Bubble fly as the games\' own sprites', own);
	// keys and the clock
	const i0 = await M(() => window.__m3d.fxlab.i);
	await page.keyboard.press('KeyN'); const i1 = await M(() => window.__m3d.fxlab.i);
	await page.keyboard.press('KeyB'); const i2 = await M(() => window.__m3d.fxlab.i);
	A(i1 === (i0 + 1) % info.n && i2 === i0, 'N goes to the next, B back', [i0, i1, i2]);
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?gen=5&fight=1&dex=25&fxlab=1&secs=1&from=thunderbolt`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready && window.__m3d.fxlab)), 30000);
	const f0 = await M(() => window.__m3d.fxlab.now().id), moved = await waitFor(() => M(() => window.__m3d.fxlab.shown >= 2), 6000);
	A(f0 === 'thunderbolt' && moved, '&from= starts at a move, and it moves on by itself when its time is up', f0);
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
