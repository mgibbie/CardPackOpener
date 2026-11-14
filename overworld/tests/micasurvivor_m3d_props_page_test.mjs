// micasurvivor_m3d_props_page_test.mjs — MicaSurvivor 3D: what lies on the ground is drawn as pictures, in a real browser;
// and the Pokémon screen's partner button reads right.
//
// Owner report, 2026-11-12 (two screenshots from the phone):
//   1. the Pokémon screen's button said "Choose de Partner": the text 'Elegir de compañero' had a translation only
//      with something after it (' (shiny)'), so the plain one fell back to word-by-word
//   2. "the blue & red dots need to be replaced with actual graphics": in a 3D Expedition, XP, berries, items and
//      everything a zone holds (Poké Balls, berry bushes, …) were beads in a colour
//   * the button: 'Choose as partner', and 'Choose as partner (shiny)'
//   * XP, a big XP, a berry, a magnet, a bomb and an item on the ground are each a picture (the 2D game's), none a bead
//   * everything the zone holds is a picture; the balls and the berry bush carry the overworld's item pictures
//   * Meowth stands at its stall, an Unown over its stone
//   node overworld/tests/micasurvivor_m3d_props_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import vm from 'vm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9899;
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

	// ---- 1. the button's text (the 2D game's own translator and table)
	{
		const ctx = vm.createContext({ console, location: { pathname: '/micasurvivor/' }, navigator: { language: 'en' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {} }, CanvasRenderingContext2D: function () {}, confirm() {}, alert() {} });
		vm.runInContext('var G = {}; var window = this;', ctx);
		for (const f of ['core/i18n.js', 'data/lang-en.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'micasurvivor/js', f), 'utf8'), ctx, { filename: f });
		const t = (s) => vm.runInContext('G.I18n.t(' + JSON.stringify(s) + ')', ctx);
		A(t('Elegir de compañero') === 'Choose as partner', '1. the Pokémon screen\'s button reads "Choose as partner" (it read "Choose de Partner")', t('Elegir de compañero'));
		A(t('Elegir de compañero (shiny)') === 'Choose as partner (shiny)' && t('Es tu compañero') === 'It\'s your partner', '1. …and "Choose as partner (shiny)" for a shiny, as before', t('Elegir de compañero (shiny)'));
	}

	// ---- 2. the ground's pictures
	const ok = await boot('exp=7&map=viridian&dex=4&weather=0');
	await hush();
	const P = () => M(() => { const p = window.__m3d.props(); return p ? { n: p.n, beads: p.beads, keys: p.keys } : null; });
	A(ok && !!(await P()), '2. the page has its pictures of the ground');
	// one of each pickup, a few metres off (out of reach, so they stay)
	await M(() => { const m = window.__m3d, s = m.state; m.world.pl.magnet = 0.01; m.world.pickups.length = 0; ['xp', 'xpBig', 'heal', 'magnet', 'bomb'].forEach((k, i) => m.drop(k, s.x + 3 + i * 0.8, s.z + 3, 5)); m.drop('item', s.x + 3, s.z + 4.5, 'leftovers'); });
	await sleep(400);
	// (the zone's things are laid out on the run's first ticks: wait for them. A fixed 400 ms read none on a loaded runner,
	//  "0 things of 0 kinds": four of main's eight gate runs on 2026-11-13.)
	await waitFor(() => M(() => window.__m3d.ecoView().length >= 3 && window.__m3d.props().keys.some((k) => k.startsWith('eco:'))), 20000);
	const eco = await M(() => window.__m3d.ecoView().map((o) => o.kind));
	let v = await P();
	const picks = ['xp', 'xpBig', 'heal', 'magnet', 'bomb', 'item:leftovers'];
	A(picks.every((k) => v.keys.includes(k)) && v.beads === 0, '2. XP, a big XP, a berry, a magnet, a bomb and an item on the ground: each has its picture, none is a bead', v);
	const ink = await M((ks) => ks.map((k) => [k, window.__m3d.props().ink(k), window.__m3d.props().colours(k)]), picks);
	A(ink.every((q) => q[1] >= 30 && q[2] >= 2), '2. …and each picture is really drawn (not an empty cell, not one flat colour)', ink);
	A(ink[0][1] < ink[1][1], '2. a big XP gem is bigger than a small one', ink.slice(0, 2));
	// ---- 3. what the zone holds
	const kinds = [...new Set(eco)];
	A(kinds.length >= 3 && kinds.every((k) => v.keys.includes('eco:' + k)) && v.n >= eco.length + 6, `3. everything the zone holds is a picture (${eco.length} things of ${kinds.length} kinds: ${kinds.join(', ')}), none a bead`, [kinds, v]);
	// every kind there is, asked for by hand: each has a picture (or only its Pokémon)
	const all = await M(() => { const m = window.__m3d, p = m.props(), A = window.__m3d_props_all = ['ball', 'freeball', 'cursedball', 'great', 'meowth', 'unown1', 'unown2', 'unown3', 'unown4', 'comet', 'challenge', 'cursedaltar', 'greed', 'ditto', 'hypno', 'rock', 'berry', 'cage', 'slots']; const z = m.run.eco.z, o0 = z.lay.objs[0], keep = z.lay.objs.slice(), st = z.st.slice(); z.lay.objs.length = 0; A.forEach((k, i) => { z.lay.objs.push({ ...o0, i, kind: k, x: m.state.x + (i % 5) * 2.5 - 5, z: m.state.z - 4 - Math.floor(i / 5) * 2.5, y: 0, v: 25 }); z.st[i] = k === 'comet' ? 4 : 0; z.ch[i] = 0; }); z.spot = 4; window.__m3d_props_restore = () => { z.lay.objs.length = 0; keep.forEach((o) => z.lay.objs.push(o)); st.forEach((s, i) => { z.st[i] = s; }); }; return A; });
	await sleep(2500);   // (the overworld's item pictures arrive)
	v = await P();
	const ecoInk = await M((ks) => ks.map((k) => [k, window.__m3d.props().ink('eco:' + k), window.__m3d.props().colours('eco:' + k)]), all);
	const onlyMon = ['ditto', 'hypno'];
	A(v.beads === 0 && all.every((k) => v.keys.includes('eco:' + k)) && ecoInk.every((q) => (onlyMon.includes(q[0]) ? q[1] === 0 : q[1] >= 60)), '3. each of the 19 kinds of thing has its picture (Ditto and Hypno are the Pokémon themselves); no bead is left', [v.beads, ecoInk]);
	const col = Object.fromEntries(ecoInk.map((q) => [q[0], q[2]]));
	A(col.ball >= 4 && col.great >= 4 && col.freeball >= 3 && col.berry >= 5 && col.comet >= 4, '3. the balls, the berry bush and the comet shard carry the overworld\'s item pictures (many colours, not a flat disc)', col);
	const mons = await M(() => { const m = window.__m3d; return ['52/Walk', '201/Walk', '94/Walk', '132/Walk', '97/Walk', '25/Walk'].map((k) => [k, !!m.sq && (() => { try { return !!m.sq(k, 0, 0); } catch (e) { return false; } })()]); });
	A(mons.every((q) => q[1]), '4. Meowth at its stall, the Unown over their stones, Gengar, Ditto, Hypno and the caged Pokémon are loaded to stand there', mons);
	await shot('props-eco.png');
	await M(() => window.__m3d_props_restore());
	A(errors.length === 0, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
