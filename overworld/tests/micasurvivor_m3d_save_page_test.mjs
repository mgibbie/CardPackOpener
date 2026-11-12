// micasurvivor_m3d_save_page_test.mjs — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.34): what
// a run on the 3D page leaves in this browser, in a real browser (the rules themselves: micasurvivor_m3d_expsave_test).
//   * a run with a test parameter is a practice run: its end says so, and nothing is written
//   * a member the save does not have: its end says so, and nothing is written
//   * a fair run of over a minute: the Expedition save holds it with the 2D game's keys, its pay is owed to this
//     browser, and its end says "Saved"
//   * a wild League member (met, not caught, in this browser's save) comes into the run; caught, it is saved at once
//     and does not come again
//   * the base save (your Pokémonedas, your collection) is never created or written by the 3D page
//   node overworld/tests/micasurvivor_m3d_save_page_test.mjs      (SHOTS=<dir> for screenshots; it plays 65 s)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { loadG } from './m3d_data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9871;
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
	const store = () => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
	const expSave = (s) => { try { return JSON.parse(s['micasurvivorexp_save.guest'] || 'null'); } catch { return null; } };
	/** Nothing comes at you, then a boss that ends the run at once (the run's own rules decide the rest). */
	const hush = () => page.evaluate(() => { const m = window.__m3d; m.run.plan.events = []; m.run.acc = -1e9; m.world.enemies.length = 0; });
	const die = async () => { await page.evaluate(() => { const m = window.__m3d; m.world.pl.xproc.shield = 0; m.world.pl.invuln = 0; m.world.pl.hp = 1; m.addBoss(150, m.state.x + 1.5, m.state.z, { slot: 0 }); for (const e of m.world.enemies) e.atk = 1e6; }); return waitFor(() => page.evaluate(() => window.__m3d.run.ended && !!window.__m3d.kept && document.getElementById('rx-end').classList.contains('show')), 20000); };
	const keptLine = () => page.evaluate(() => { const e = document.getElementById('rx-kept'); return { text: e ? e.textContent : null, ok: !!e && e.classList.contains('ok'), kept: window.__m3d.kept }; });

	// ---- a practice run
	const ok1 = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	const ended1 = await die(), k1 = await keptLine(), s1 = await store();
	A(ok1 && ended1 && k1.kept.ok === false && k1.kept.why === 'practice' && k1.kept.param === 'weather' && /Practice run/.test(k1.text) && !k1.ok, 'a run with a test parameter (weather=0) is a practice run, and its end says so', k1);
	A(!expSave(s1) || !(expSave(s1).counters || {}).runs, 'nothing of it is in the save', Object.keys(s1));

	// ---- a member the save does not have
	const ok2 = await boot('exp=7&map=viridian&dex=149');
	await hush();
	const ended2 = await die(), k2 = await keptLine(), s2 = await store();
	A(ok2 && ended2 && k2.kept.why === 'member' && /do not have this League member/.test(k2.text) && !(expSave(s2) && (expSave(s2).counters || {}).runs), 'Dragonite\'s family, which a new save does not have: its end says so, and nothing is written', k2);

	// ---- a fair run of over a minute
	const ok3 = await boot('exp=7&map=viridian&dex=4');
	const prac = await page.evaluate(() => window.__m3d.practice);
	const t0 = Date.now();
	while (Date.now() - t0 < 64000) { await hush(); await sleep(1500); }   // (alive past the first minute: under it a run pays nothing)
	const ended3 = await die(), k3 = await keptLine();
	await sleep(400);
	const s3 = await store(), x = expSave(s3), c = (x && x.counters) || {}, sets = (x && x.sets) || {}, dev = s3['micasurvivorexp_dev.guest'];
	const res = await page.evaluate(() => { const m = window.__m3d, v = m.runView().over; return { rows: v.rows, t: m.world.t, lv: m.world.pl.level }; });
	const pay = +String((res.rows.find((r) => r[0] === 'Pay') || [])[1]).replace(/\D/g, '');
	A(ok3 && prac === null && ended3 && k3.kept.ok === true && k3.ok && /^Saved\. ₽ \d+ will be in your wallet when you next open the Expedition\.( New in the wild: .+\.)?$/.test(k3.text) && pay > 0 && k3.kept.pay === pay, `a fair run of ${Math.floor(res.t)} s: its end says "Saved" and what it paid (₽ ${pay})`, { k3, res });
	A(x && x.v === 1 && c.runs === 1 && c['runs.exp-classic'] === 1 && c['best.time.viridian.normal'] === Math.floor(res.t) && c['zone.viridian.normal'] === 1 && c['lg.runs.4'] === 1 && c['lg.best.4'] === res.lv && (sets['league.played'] || []).includes('4') && (sets['league.form'] || []).includes('4') && !c['wins.viridian.normal'], 'the Expedition save in this browser holds it, with the 2D game\'s keys (the run, its time, its zone, the League\'s)', c);
	A(/^[a-z0-9]{4,12}$/.test(dev || '') && c['m3d.n.' + dev] === 1 && c['pay3d.' + dev] === pay && !c['pay3d.claimed.' + dev] && !c['pay.coins'], 'its pay is owed to this browser (the 2D game pays it into the wallet), not paid here', { dev, c });
	A(!Object.keys(s3).some((k) => /^micasurvivor_(save|session|rev|backup|accounts|dev)/.test(k)), 'the base save (your Pokémonedas, your collection) was never created or written by the 3D page', Object.keys(s3));
	A(!calls.some((q) => /POST/.test(q)), 'a guest asks nothing of the server (no score is posted)', calls);
	await shot('m3d_save_end.png');

	// ---- a wild League member: met and wild in this browser's save
	const G0 = loadG(), WM = Object.values(G0.ExpLeague.BY).find((m) => m.rank === 'common' && m.ch && G0.DEX_BY[m.dex] && G0.SPRITE_META[m.dex] && G0.SPRITE_META[m.dex].a && G0.SPRITE_META[m.dex].a.Walk).dex, wname = G0.DEX_BY[WM].name;
	await page.evaluate((d) => { const k = 'micasurvivorexp_save.guest', s = JSON.parse(localStorage.getItem(k)); s.sets['league.met'] = [String(d)]; s.sets['league.wild'] = [String(d)]; localStorage.setItem(k, JSON.stringify(s)); }, WM);
	const ok4 = await boot('exp=9&map=viridian&dex=4');
	const w0 = await page.evaluate(() => { const m = window.__m3d; return { wild: m.wild, pend: m.run.cap.pend, at: m.run.cap.zplan ? m.run.cap.zplan.league && m.run.cap.zplan.league.at : null }; });
	await hush();
	await waitFor(() => page.evaluate(() => !!window.__m3d.run.cap.zplan), 3000);
	await page.evaluate(() => { const m = window.__m3d; m.setZoneTime(m.run.cap.zplan.league.at); });
	const came = await waitFor(() => page.evaluate(() => window.__m3d.world.enemies.some((e) => e.xk === 'league')), 5000);
	A(ok4 && w0.wild.join() === String(WM) && w0.pend.join() === String(WM) && came && await page.evaluate((n) => window.__m3d.noteLog.includes(`A wild ${n} appeared!`), wname), `the save's wild member comes into the run: a wild ${wname} appeared`, w0);
	await page.evaluate(() => { const m = window.__m3d, e = m.world.enemies.find((q) => q.xk === 'league'); e.dummy = true; m.world.hit(e, 1e12, 0, 0, 0); });
	await waitFor(() => page.evaluate(() => window.__m3d.run.cap.faint.length === 1), 3000);
	await page.evaluate(() => { const m = window.__m3d, f = m.run.cap.faint[0]; m.put(f.x + 1, f.z); });
	// (its XP can bring a level: its cards are picked as a player would, and the catch goes on)
	const caught = await waitFor(async () => { if (await page.evaluate(() => !!window.__m3d.world.pl.choices && !!document.querySelector('#cards button[data-i="0"]'))) await page.click('#cards button[data-i="0"]'); return page.evaluate(() => window.__m3d.run.cap.log.league.length === 1 && !window.__m3d.run.cap.cine); }, 15000);
	await sleep(300);
	const s4 = await store(), x4 = expSave(s4);
	A(caught && x4 && (x4.sets['league.own'] || []).includes(String(WM)) && x4.counters['cap.league'] === 1 && await page.evaluate((n) => window.__m3d.noteLog.includes(`Gotcha! ${n} joins the League`), wname), `fainted and caught: ${wname} joins the League, and the save has it at once (the run is not over)`, x4 && x4.sets);
	A(!Object.keys(s4).some((k) => /^micasurvivor_(save|session|rev|backup|accounts|dev)/.test(k)), 'still without touching the base save');
	await shot('m3d_save_wild.png');
	const ok5 = await boot('exp=10&map=viridian&dex=' + WM);
	const w1 = await page.evaluate(() => ({ wild: window.__m3d.wild, member: window.__m3d.run.lg.member }));
	await hush(); const ended5 = await die(), k5 = await keptLine();
	A(ok5 && w1.wild.length === 0 && w1.member === WM && ended5 && k5.kept.ok === true, `the next run: it is not wild any more, and a run played as ${wname} is kept`, { w1, k5 });
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
