// micasurvivor_m3d_ult_page_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.47): the Ultimate and
// the elemental reactions on the run's screen, in a real browser (the rules themselves: micasurvivor_m3d_expult_test,
// micasurvivor_m3d_exprx_test).
//   * the run's screen has the Ultimate's meter, with its name; full, it says READY and the run says so
//   * V casts it: the cut-in with its name, the meter says CASTING, the world holds a moment, the foes near are hurt;
//     the meter is a button too (a tap or a click casts)
//   * U, and the menu's button, switch Auto-Ultimate (a practice run writes nothing)
//   * a reaction shows its name over the foe (your Ember on a poisoned foe: Poison Gas!)
//   node overworld/tests/micasurvivor_m3d_ult_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9879;
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
	const ult = () => M(() => { const e = document.getElementById('rx-ult'); return { show: e.classList.contains('show'), ready: e.classList.contains('ready'), casting: e.classList.contains('casting'), name: document.getElementById('rx-ult-name').textContent, pct: document.getElementById('rx-ult-pct').textContent, fill: parseFloat(document.getElementById('rx-ult-fill').style.width) || 0, v: window.__m3d.ult.view() }; });
	const hush = () => M(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
	const foes = (n, o) => M((n, o) => { const m = window.__m3d, s = m.state, out = []; for (let i = 0; i < n; i++) { const e = m.addEnemy(19, s.x + Math.cos(i * 2.1) * 3, s.z + Math.sin(i * 2.1) * 3, Object.assign({ dummy: true, hp: 1e5 }, o)); out.push(e.id); } return out; }, n, o || {});

	// ---- the meter
	const ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	await waitFor(async () => (await ult()).show, 4000);
	const u0 = await ult();
	A(ok && u0.show && u0.name === 'Roaring Ember' && /^\d+ %$/.test(u0.pct) && !u0.ready && !u0.casting && u0.fill < 5, 'the run\'s screen has the Ultimate\'s meter: its name (Charmander\'s Roaring Ember) and how full it is', u0);
	const box = await M(() => { const r = document.getElementById('rx-ult').getBoundingClientRect(), mv = document.getElementById('rx-moves').getBoundingClientRect(); return { w: r.width, h: r.height, above: r.bottom <= mv.top + 1, left: r.left, right: r.right, vw: innerWidth }; });
	A(box.w > 120 && box.h > 14 && box.above && box.left >= 0 && box.right <= box.vw, 'it sits above the four moves, on the screen', box);

	// ---- a reaction: your Ember on a poisoned foe
	const ids = await foes(3);
	await M((ids) => { const m = window.__m3d; for (const e of m.world.enemies) if (ids.includes(e.id)) { e.poison = 2; e.poisonT = 1e6; } }, ids);
	const gas = await waitFor(() => M(() => window.__m3d.numbers.some((n) => n.text === 'Poison Gas!') || (window.__m3d.run.rx.by.gas > 0 && window.__m3d.seenGas)), 15000) || await M(() => window.__m3d.run.rx.by.gas > 0);
	const rx = await M(() => ({ n: window.__m3d.run.rx.n, by: window.__m3d.run.rx.by, moves: window.__m3d.world.pl.moves.map((q) => q.id) }));
	A(gas && rx.by.gas >= 1, 'a Fire move on a poisoned foe: Poison Gas! (the run counts the reaction)', rx);
	await shot('ult_reaction.png');

	// ---- full: READY, and V casts it
	await M(() => window.__m3d.ult.charge(1));
	const ready = await waitFor(async () => (await ult()).ready, 4000), u1 = await ult();
	A(ready && /^READY/.test(u1.pct) && u1.fill === 100 && await M(() => window.__m3d.noteLog.includes('Ultimate ready!')), 'full: the meter says READY, and the run says "Ultimate ready!"', u1);
	await shot('ult_ready.png');
	const hp0 = await M(() => window.__m3d.world.enemies.reduce((a, e) => a + e.hp, 0));
	await page.keyboard.press('KeyV');
	const cast = await waitFor(() => M(() => window.__m3d.run.ult.casts === 1 && document.getElementById('rx-cut').classList.contains('show')), 4000);
	const c1 = await M(() => ({ name: document.getElementById('rx-cut-name').textContent, sub: document.getElementById('rx-cut-sub').textContent, shown: getComputedStyle(document.getElementById('rx-cut')).display, cut: window.__m3d.ult.cut && window.__m3d.ult.cut.name }));
	A(cast && c1.name === 'Roaring Ember' && /^ULTIMATE/.test(c1.sub) && c1.shown === 'flex', 'V casts it: the cut-in comes up with its name', c1);
	await shot('ult_cutin.png');
	const casting = await waitFor(async () => (await ult()).casting, 3000), u2 = await ult();
	A(casting && u2.pct === 'CASTING', 'while it is cast the meter says CASTING', u2);
	const over = await waitFor(() => M(() => !window.__m3d.run.ult.cast), 12000);
	const hp1 = await M(() => window.__m3d.world.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0)), u3 = await ult();
	A(over && hp1 < hp0 && !u3.casting && !u3.ready && /^\d+ %$/.test(u3.pct), 'the cast ends: the foes near were hurt, and the meter starts again', { hp0, hp1, u3 });

	// ---- the meter is a button
	await M(() => window.__m3d.ult.charge(1));
	await waitFor(async () => (await ult()).ready, 4000);
	await page.click('#rx-ult');
	A(await waitFor(() => M(() => window.__m3d.run.ult.casts === 2), 4000), 'the meter is a button: a click (or a tap) casts');
	await waitFor(() => M(() => !window.__m3d.run.ult.cast), 12000);
	// a press with nothing in it does nothing
	await page.keyboard.press('KeyV'); await sleep(300);
	A(await M(() => window.__m3d.run.ult.casts === 2 && !window.__m3d.run.ult.cast), 'pressed when it is not full: nothing');

	// ---- auto
	await page.keyboard.press('KeyU');
	const a1 = await waitFor(async () => (await ult()).v.auto, 3000), u4 = await ult();
	A(a1 && / · AUTO$/.test(u4.pct) && await M(() => window.__m3d.noteLog.includes('Auto-Ultimate: on')), 'U switches Auto-Ultimate on: the meter and the run say so', u4);
	await M(() => window.__m3d.ult.charge(1));
	A(await waitFor(() => M(() => window.__m3d.run.ult.casts === 3), 5000), 'with auto, full and a foe near: it casts by itself');
	await waitFor(() => M(() => !window.__m3d.run.ult.cast), 12000);
	await M(() => window.__m3d.setMenu(true));
	const mb = await waitFor(() => M(() => !!document.getElementById('rx-auto')), 3000), mt = await M(() => document.getElementById('rx-auto') && document.getElementById('rx-auto').textContent);
	A(mb && mt === 'Auto-Ultimate: on', 'the menu has its button: "Auto-Ultimate: on"', mt);
	await page.click('#rx-auto');
	const off = await waitFor(() => M(() => document.getElementById('rx-auto') && document.getElementById('rx-auto').textContent === 'Auto-Ultimate: off' && !window.__m3d.run.ult.auto), 3000);
	A(off, '…pressed: off');
	await M(() => window.__m3d.setMenu(false));
	const st = await M(() => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/micasurvivorexp_save/.test(k) && /ult\.auto/.test(localStorage.getItem(k) || '')) o.push(k); } return o; });
	A(st.length === 0, 'a practice run writes none of it to the save', st);

	// ---- a run that can be kept remembers the setting
	await boot('exp=8&map=viridian&dex=4');
	await hush();
	if (await M(() => window.__m3d.saveOk)) {
		await page.keyboard.press('KeyU');
		await waitFor(() => M(() => window.__m3d.run.ult.auto), 3000);
		const sv = await M(() => window.G.ExpSave.get('ult.auto.on') > window.G.ExpSave.get('ult.auto.off'));
		await boot('exp=9&map=viridian&dex=4');
		const again = await M(() => window.__m3d.run.ult.auto);
		A(sv && again, 'in a run that can be kept, the setting is saved (as the 2D game keeps it) and the next run starts with it');
	} else A(false, 'a fair run on this page can be kept (the save opens)');
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
