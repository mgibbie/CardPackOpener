// warpfade_test.mjs — the warp/door screen fade.
// Standalone (headless Chrome + puppeteer-core + local overworld/data); NOT in
// run-all.  node overworld/tests/warpfade_test.mjs
// The warp fade: trigger a real door warp, sample fade.alpha
// over time (must rise toward 1 then settle back to 0), confirm the map changed,
// and screenshot mid-fade. Guards against a stuck-black screen.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OUT = HERE;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8891;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const STATE = { username: 'fd', friendCode: 'FD0000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

function startServer() {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	return new Promise(r => server.listen(PORT, () => r(server)));
}
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { } await sleep(100); } return false; }

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
	// a completed-intro save so we boot straight into a walkable town with warps
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'fd');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 14, gender: 'M', ability: 'Blaze', types: ['Fire'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 45, atk: 30, def: 28, spa: 32, spd: 30, spe: 34 }, maxHP: 45, curHP: 45, exp: 2744, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world?.current?.layout && window.__ow.fade)), 30000);
	A(booted, 'booted with fade hook');
	// dismiss any boot dialog
	for (let i = 0; i < 30; i++) { const b = await page.evaluate(() => { if (window.__ow.dialog.blocking) { window.__ow.dialog.key('z'); return true; } return false; }); if (!b) break; await sleep(200); }
	await sleep(800);

	const before = await page.evaluate(() => ({ map: window.__ow.world.current.name, alpha: window.__ow.fade.alpha, warps: (window.__ow.world.current.map.warp_events || []).length }));
	A(before.alpha < 0.01, 'fade starts clear (alpha 0)', JSON.stringify(before));

	// trigger a real warp — and record the fade peak IN-PAGE via rAF so a slow
	// node round-trip can't miss the fast (~170ms) ramp
	const destOk = await page.evaluate(() => {
		const w = (window.__ow.world.current.map.warp_events || [])[0];
		if (!w) return false;
		window.__fadePeak = 0;
		const watch = () => { window.__fadePeak = Math.max(window.__fadePeak, window.__ow.fade.alpha); requestAnimationFrame(watch); };
		requestAnimationFrame(watch);
		window.__ow.warpTo(w.dest_map, w.dest_warp_id ?? 0);
		return true;
	});
	A(destOk, 'triggered a door warp');

	await sleep(300); await page.screenshot({ path: path.join(HERE, 'warpfade_shot.png') }); // catch it dark
	await waitFor(() => page.evaluate(() => window.__ow.fade.alpha < 0.05 && window.__fadePeak > 0.5), 4000);
	const peak = await page.evaluate(() => window.__fadePeak);
	A(peak > 0.8, 'fade reached near-black during the warp', 'peak=' + peak.toFixed(2));
	const after = await page.evaluate(() => ({ map: window.__ow.world.current.name, alpha: window.__ow.fade.alpha }));
	A(after.map !== before.map, 'the map changed through the warp', before.map + ' -> ' + after.map);
	A(after.alpha < 0.05, 'fade cleared back to 0 (no stuck black)', 'alpha=' + after.alpha.toFixed(3));

	console.log(`\n${pass} passed, ${fail} failed`);
	await browser.close();
	server.close();
	process.exit(fail ? 1 : 0);
})();
