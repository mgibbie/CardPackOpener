// stepfx_test.mjs — grass rustle + sand/ash footprints on each step.
// Standalone (headless Chrome + puppeteer-core + local overworld/data); NOT in
// run-all.   node overworld/tests/stepfx_test.mjs
// Stepping into tall/long grass spawns a brief rustle; stepping in deep sand /
// ashy grass leaves a fading footprint. Purely cosmetic — this just asserts the
// right fx spawns on the right surface and animates.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8888;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const STATE = { username: 'rs', friendCode: 'RS0000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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

async function boot(browser, map) {
	const page = await browser.newPage();
	await page.setViewport({ width: 720, height: 480, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'rs');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		// high level + repel-ish: minimise wild-encounter interruptions during the walk
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'mudkip', name: 'MUDKIP', level: 80, gender: 'M', ability: 'Torrent', types: ['Water'], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, stats: { hp: 250, atk: 150, def: 140, spa: 140, spd: 140, spe: 130 }, maxHP: 250, curHP: 250, exp: 512000, num: 258, sprite: 'mudkip.png', moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] }]));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
	const ok = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world?.current?.layout && window.__ow.stepFx)), 30000);
	if (!ok) return { page, ok: false };
	for (let i = 0; i < 20; i++) { const b = await page.evaluate(() => { if (window.__ow.dialog.blocking) { window.__ow.dialog.key('z'); return true; } return false; }); if (!b) break; await sleep(150); }
	await sleep(700);
	return { page, ok: true };
}

// place the player next to a tile matching `pred`, facing it, then step in and
// return the peak count of `kind` fx that spawned
async function stepOntoAndPeak(page, predName, kind) {
	const setup = await page.evaluate((predName) => {
		const ow = window.__ow, w = ow.world, lay = w.current.layout;
		const pred = predName === 'grass' ? (x, y) => w.isTallGrass(x, y)
			: (x, y) => { const b = w.behaviorAt(x, y); return b === 0x0c || b === 0x24; };
		for (let y = 1; y < lay.height - 1; y++) for (let x = 1; x < lay.width - 1; x++) {
			// the TARGET tile must itself be walkable (you step ONTO it), and a
			// walkable neighbour to launch from
			if (pred(x, y) && w.isPassable(x, y)) for (const [dx, dy, f] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
				if (w.isPassable(x + dx, y + dy)) { ow.player.setTile(x + dx, y + dy); ow.player.facing = f; return { f, tile: [x, y] }; }
			}
		}
		return null;
	}, predName);
	if (!setup) return { setup: null, peak: 0 };
	await page.evaluate(k => { window.__pk = 0; const w = () => { window.__pk = Math.max(window.__pk, window.__ow.stepFx.filter(f => f.kind === k).length); requestAnimationFrame(w); }; requestAnimationFrame(w); }, kind);
	await sleep(300);
	const KEY = { up: 'w', down: 's', left: 'a', right: 'd' }[setup.f];
	await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), KEY);
	await sleep(400);
	await page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })), KEY);
	await sleep(150);
	const peak = await page.evaluate(() => window.__pk);
	return { setup, peak };
}

(async () => {
	const server = await startServer();
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
	try {
		// grass rustle
		{
			const { page, ok } = await boot(browser, 'Route101');
			A(ok, 'Route101: booted');
			if (ok) {
				const r = await stepOntoAndPeak(page, 'grass', 'rustle');
				A(r.setup, 'Route101: found tall grass with a walkable neighbour');
				A(r.peak >= 1, 'stepping into grass spawns a rustle', 'peak=' + r.peak);
				await page.close();
			}
		}
		// sand/ash footprint
		{
			const { page, ok } = await boot(browser, 'Route111');
			A(ok, 'Route111 (desert): booted');
			if (ok) {
				const r = await stepOntoAndPeak(page, 'sand', 'print');
				A(r.setup, 'Route111: found deep sand / ash with a walkable neighbour');
				A(r.peak >= 1, 'stepping in deep sand leaves a footprint', 'peak=' + r.peak);
				await page.close();
			}
		}
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
