// micasurvivor_m3d_polish_page_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.52): the run's art
// and effects, in a real browser.
//   * a move's emblem (the 2D game's own pixel icon) is on its tile and on its level-up card; a training card has its picture
//   * an evolution's card shows who you would become (Pikachu: Raichu and Alolan Raichu, each its own picture)
//   * the Ultimate's cut-in shows your Pokémon; its rings and strikes throw sparks, which fade away
//   * grinding a rail hisses (and only then)
//   node overworld/tests/micasurvivor_m3d_polish_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { moveSounds } from '../../micasurvivor/m3d/runsound.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9895;
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
	const hush = () => M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const cards = () => M(() => [...document.querySelectorAll('#cards button[data-i]')].map((b) => ({ text: b.querySelector('b').textContent, icon: !!b.querySelector('em img.pix'), spr: (() => { const s = b.querySelector('em .rx-spr'); if (!s) return null; const r = s.getBoundingClientRect(), bg = getComputedStyle(s.firstElementChild).backgroundImage; return { w: Math.round(r.width), h: Math.round(r.height), bg }; })(), type: !!b.querySelector('em .rx-type') })));

	// ---- the sound of a rail (the page's own module)
	const names = (s) => moveSounds(s).map((q) => q[0]);
	A(names({ rail: 0, tick: 9 }).includes('grass') && !names({ rail: 0, tick: 10 }).includes('grass') && !names({ rail: -1, tick: 9 }).includes('grass') && names({ rail: 0, tick: 9, railed: 1 }).join() === 'shake', 'grinding a rail hisses about seven times a second, only while you are on it (catching it is its own sound)');

	// ---- a move's emblem on its tile and its card
	const ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	await waitFor(() => M(() => !!document.querySelector('#rx-moves .rx-move img.pix')), 5000);
	const tile = await M(() => { const im = document.querySelector('#rx-moves .rx-move img.pix'), r = im && im.getBoundingClientRect(); return im ? { w: r.width, h: r.height, src: im.src.slice(0, 22), name: document.querySelector('#rx-moves .rx-move b').textContent } : null; });
	A(ok && tile && tile.w > 8 && tile.h > 8 && /^data:image/.test(tile.src), 'your move\'s tile has its emblem (the 2D game\'s own pixel icon)', tile);
	await M(() => { const m = window.__m3d, s = m.state; m.drop('xp', s.x, s.z, 60); });
	const up = await waitFor(() => M(() => document.querySelectorAll('#cards button[data-i]').length >= 3), 8000);
	const c1 = await cards();
	const kinds = await M(() => window.__m3d.world.pl.choices.map((c) => c.kind));
	A(up && c1.length >= 3 && c1.every((c, i) => kinds[i] !== 'move' || (c.icon && c.type)) && kinds.includes('move'), 'a level-up: every move card has the move\'s emblem beside its type', { c1, kinds });
	A(c1.every((c, i) => kinds[i] !== 'train' || c.icon), 'a training card has its picture', { c1, kinds });
	await shot('polish_cards.png');
	await M(() => { const m = window.__m3d; while (m.world.pl.choices) m.pickCard(0); });

	// ---- an evolution's card: who you would become
	await boot('exp=8&map=viridian&dex=172&form=25&weather=0');
	await hush();
	await M(() => { const m = window.__m3d, pl = m.world.pl; pl.level = 35; pl.xp = 0; m.drop('xp', m.state.x, m.state.z, pl.xpNext + 5); });
	const evo = await waitFor(async () => { const k = await M(() => (window.__m3d.world.pl.choices || []).map((c) => c.kind)); if (k.length && !k.includes('evo')) { await M(() => window.__m3d.pickCard(0)); return false; } return k.includes('evo') && (await M(() => document.querySelectorAll('#cards button[data-i] em .rx-spr').length >= 2)); }, 20000);
	const c2 = await cards();
	A(evo && c2.filter((c) => c.spr).length >= 2 && c2.filter((c) => c.spr).every((c) => c.spr.w > 12 && c.spr.h > 20 && /assets\/pokemon\/(26|10100)\/Idle\.png/.test(c.spr.bg)) && new Set(c2.filter((c) => c.spr).map((c) => c.spr.bg)).size === 2, 'Pikachu at 36: the two cards show Raichu and Alolan Raichu, each its own picture', c2);
	await shot('polish_evolution.png');
	await M(() => { const m = window.__m3d; while (m.world.pl.choices) m.pickCard(0); });

	// ---- the Ultimate: your Pokémon in the cut-in, and sparks
	await boot('exp=9&map=viridian&dex=4&weather=0');
	await hush();
	await M(() => { const m = window.__m3d, s = m.state; for (let i = 0; i < 4; i++) m.addEnemy(19, s.x + Math.cos(i * 1.6) * 3, s.z + Math.sin(i * 1.6) * 3, { dummy: true, hp: 1e5 }); });
	A(await M(() => window.__m3d.sparks.length === 0), 'no sparks before anything happens');
	await M(() => window.__m3d.ult.charge(1));
	await waitFor(() => M(() => window.__m3d.ult.view().ready), 4000);
	await page.keyboard.press('KeyV');
	const cut = await waitFor(() => M(() => document.getElementById('rx-cut').classList.contains('show') && !!document.querySelector('#rx-cut-art .rx-spr')), 5000);
	const art = await M(() => { const s = document.querySelector('#rx-cut-art .rx-spr'); if (!s) return null; const r = s.getBoundingClientRect(), bar = document.getElementById('rx-cut').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(s.firstElementChild).backgroundImage, aboveBar: r.bottom <= bar.top + bar.height * 0.6, onScreen: r.top >= 0 }; });
	A(cut && art && art.h >= 120 && /assets\/pokemon\/4\/Idle\.png/.test(art.bg) && art.aboveBar && art.onScreen, 'the cut-in shows your Pokémon (Charmander), standing on the banner', art);
	await shot('polish_cutin.png');
	const sparked = await waitFor(() => M(() => window.__m3d.sparks.length > 5), 8000), peak = await M(() => window.__m3d.sparks.length);
	A(sparked && peak <= 420, `the Ultimate's rings and strikes throw sparks (${peak} in the air, never more than 420)`);
	await shot('polish_sparks.png');
	await waitFor(() => M(() => !window.__m3d.run.ult.cast), 12000);
	const gone = await waitFor(() => M(() => window.__m3d.sparks.length === 0), 6000);
	A(gone, '…and they fade away after it');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
