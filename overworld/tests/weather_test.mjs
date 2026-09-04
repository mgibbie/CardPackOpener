// weather_test.mjs — overworld weather particle rendering.
// Standalone (headless Chrome + puppeteer-core + local overworld/data); NOT in
// run-all.   node overworld/tests/weather_test.mjs
// MAP_WEATHER used to feed only BATTLE weather; the route drew clear sky. This
// asserts each weather route now runs a live particle system of the right type,
// that a clear route runs none, and that the WEATHER FX setting gates it.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8889;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const STATE = { username: 'wx', friendCode: 'WX0000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { } await sleep(120); } return false; }

async function bootMap(browser, map) {
	const page = await browser.newPage();
	await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'wx');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', name: 'MUDKIP', level: 14, gender: 'M', ability: 'Torrent', types: ['Water'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 45, atk: 30, def: 28, spa: 32, spd: 30, spe: 34 }, maxHP: 45, curHP: 45, exp: 2744, num: 258, sprite: 'mudkip.png', moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] }]));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
	const ok = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world?.current?.layout && window.__ow.weatherFx)), 30000);
	if (!ok) return { page, ok: false };
	for (let i = 0; i < 20; i++) { const b = await page.evaluate(() => { if (window.__ow.dialog.blocking) { window.__ow.dialog.key('z'); return true; } return false; }); if (!b) break; await sleep(150); }
	await sleep(1000); // let the particle system spin up
	return { page, ok: true };
}

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
	try {
		for (const [map, want] of [['Route119', 'rain'], ['Route111', 'sandstorm'], ['Route113', 'ash'], ['SilverCaveOutside', 'hail']]) {
			const { page, ok } = await bootMap(browser, map);
			A(ok, `${map}: booted`);
			if (!ok) { await page.close(); continue; }
			const r = await page.evaluate(() => ({ decl: window.__ow.mapWeatherNow(), type: window.__ow.weatherFx.type, parts: window.__ow.weatherFx.parts.length }));
			A(r.decl === want && r.type === want, `${map}: weather is '${want}'`, JSON.stringify(r));
			A(r.parts > 20, `${map}: a live particle system is running`, 'parts=' + r.parts);
			// the particles actually MOVE frame to frame
			const moved = await page.evaluate(async () => {
				const p0 = window.__ow.weatherFx.parts.slice(0, 5).map(p => p.y);
				await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
				const p1 = window.__ow.weatherFx.parts.slice(0, 5).map(p => p.y);
				return p0.some((y, i) => Math.abs(y - p1[i]) > 0.01);
			});
			A(moved, `${map}: particles animate`);
			await page.close();
		}
		// a clear route runs no weather
		{
			const { page, ok } = await bootMap(browser, 'Route101');
			A(ok, 'Route101 (clear): booted');
			if (ok) {
				const r = await page.evaluate(() => ({ decl: window.__ow.mapWeatherNow(), type: window.__ow.weatherFx.type }));
				A(!r.decl && !r.type, 'Route101: no weather on a clear route', JSON.stringify(r));
				await page.close();
			}
		}
		// the WEATHER FX setting gates it
		{
			const { page, ok } = await bootMap(browser, 'Route119');
			if (ok) {
				await page.evaluate(async () => { const S = (await import('/overworld/settings.js')); S.set('weather', false); });
				await sleep(300);
				const off = await page.evaluate(() => window.__ow.weatherFx.type);
				A(off === null, 'WEATHER FX = OFF clears the particle system', 'type=' + off);
				await page.close();
			}
		}
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
