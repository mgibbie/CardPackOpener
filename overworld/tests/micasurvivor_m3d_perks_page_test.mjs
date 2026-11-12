// micasurvivor_m3d_perks_page_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.49): the upgrades
// bought for a Pokémon's family, on the 3D page, in a real browser (the rules: micasurvivor_m3d_expperks_test).
//   * a practice run has none of them
//   * a run that can be kept reads them from the base save in this browser (bought on Charmeleon, played as
//     Charmander): + HP, the kit's second move from the start, a Second chance on the screen
//   * Second chance: a hit that would end the run does not; the run says so
//   * the base save is read, never written
//   node overworld/tests/micasurvivor_m3d_perks_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9887;
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
	const hush = () => M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; });
	const BASE = JSON.stringify({ coins: 77, owned: { 4: { at: 1, from: 'test' } }, pupg: { 5: { hp: 5, revive: 1, moves: 1, reroll: 2 } }, stats: {} });
	const state = () => M(() => { const m = window.__m3d, pl = m.world.pl; return { up: m.upgrades ? { hp: m.upgrades.hp, revives: m.upgrades.revives, startMoves: m.upgrades.startMoves } : null, runUp: !!m.run.up, maxHp: pl.maxHp, moves: pl.moves.map((q) => q.id), refreshes: m.run.lv.refreshes, bag: [...document.querySelectorAll('#rx-bag .rx-chip')].map((e) => e.textContent), practice: m.practice, saveOk: m.saveOk }; });

	// ---- the base save is in this browser before the page loads
	await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?exp=7&map=viridian&dex=4&weather=0`, { waitUntil: 'domcontentloaded' });
	await M((s) => localStorage.setItem('micasurvivor_save.guest', s), BASE);

	// ---- a practice run has none
	const ok1 = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	const p = await state();
	A(ok1 && p.practice && p.up === null && !p.runUp && p.moves.length === 1 && !p.bag.some((t) => /Second chance/.test(t)), 'a practice run has none of the upgrades', p);

	// ---- a run that can be kept starts with them
	const ok2 = await boot('exp=7&map=viridian&dex=4');
	await hush();
	await sleep(400);
	const k = await state();
	A(ok2 && !k.practice && k.saveOk && k.up && k.up.hp === 40 && k.up.revives === 1 && k.up.startMoves === 2 && k.runUp, 'a run that can be kept reads them from the base save (bought on Charmeleon, played as Charmander: the family\'s)', k);
	A(k.maxHp === p.maxHp + 40 && k.moves.length === 2 && k.refreshes === p.refreshes + 2, `it starts with + 40 HP (${p.maxHp} -> ${k.maxHp}), the kit's second move (${k.moves.join(', ')}) and + 2 Refresh`, k);
	A(k.bag.some((t) => t === 'Second chance'), 'the screen shows the Second chance you have', k.bag);
	await shot('perks_start.png');

	// ---- Second chance
	await M(() => { const m = window.__m3d, pl = m.world.pl; pl.xproc.shield = 0; pl.invuln = 0; pl.hp = 1; const e = m.addEnemy(19, m.state.x + 0.3, m.state.z, {}); e.dmg = 1e6; });
	const used = await waitFor(() => M(() => window.__m3d.run.up.revives === 0), 8000);
	await M(() => { window.__m3d.world.enemies.length = 0; });
	await sleep(500);
	const after = await M(() => { const m = window.__m3d; return { ended: m.run.ended, dead: m.world.pl.dead, hp: m.world.pl.hp, max: m.world.pl.maxHp, said: m.noteLog.includes('Second chance!'), bag: [...document.querySelectorAll('#rx-bag .rx-chip')].map((e) => e.textContent) }; });
	A(used && !after.ended && !after.dead && after.hp > after.max * 0.5 && after.said && !after.bag.some((t) => /Second chance/.test(t)), 'a hit that would have ended the run: you are back, the run says "Second chance!", and it is spent', after);
	await shot('perks_second_chance.png');

	// ---- the base save is as it was
	A(await M(() => localStorage.getItem('micasurvivor_save.guest')) === BASE, 'the base save is read, never written');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
