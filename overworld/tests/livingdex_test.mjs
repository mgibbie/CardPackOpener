// livingdex_test.mjs — Upscale 5 Batch 6 follow-up: the LIVING DEX grid. The
// Pokédex list gained a visual completion wall (press G) — the whole (filtered)
// roster as an icon grid: owned bright, seen dim, missing a silhouette.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/livingdex_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8886;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'ld', friendCode: 'LDLDLD', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'ld');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmander', name: 'CHARMANDER', level: 10, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 30, atk: 18, def: 16, spa: 20, spd: 16, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, num: 4, sprite: 's128.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.dexList && window.__ow.dexMenu && window.__ow.dexKey && window.__ow.Dex)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, d = ow.dexMenu, o = {};
			// seed a mix of states so the grid draws owned / seen / missing cells
			ow.Dex.markCaught('bulbasaur'); ow.Dex.markCaught('charmander'); ow.Dex.markSeen('pidgey');
			d.open = true; d.idx = 0; d.detail = false; d.grid = false; d.typeI = 0; d.regionI = 0; d.caughtI = 0;

			// G toggles the grid on/off
			ow.dexKey('g'); o.gridOn = d.grid === true;
			ow.dexKey('g'); o.gridOff = d.grid === false;
			ow.dexKey('g'); // back to grid for the rest

			const list = ow.dexList();
			// grid nav: right steps 1, down steps a full row (12)
			d.idx = 0; ow.dexKey('ArrowRight'); o.right = d.idx;
			d.idx = 0; ow.dexKey('ArrowDown'); o.down = d.idx;
			// down from the last row clamps (never runs off the end)
			d.idx = list.length - 1; ow.dexKey('ArrowDown'); o.clampEnd = d.idx === list.length - 1;
			d.idx = 0; ow.dexKey('ArrowLeft'); o.clampStart = d.idx === 0;

			// Z on a SEEN entry (bulbasaur = #1, index 0) opens the detail card
			d.grid = true; d.idx = 0; ow.dexKey('z'); o.detailOpened = d.detail === true;
			d.detail = false;
			// leave the grid open so the render loop paints it
			d.grid = true; d.idx = 5;
			return o;
		});
		await new Promise(r => setTimeout(r, 400)); // let the render loop paint the grid (icon loads)

		A(out.gridOn, 'G turns the LIVING DEX grid on');
		A(out.gridOff, 'G toggles the grid back off');
		A(out.right === 1, 'grid → arrow-right steps one cell', out.right);
		A(out.down === 12, 'grid → arrow-down steps a full row (DEX_GRID_COLS)', out.down);
		A(out.clampEnd, 'arrow-down clamps at the last row (no overrun)');
		A(out.clampStart, 'arrow-left clamps at the first cell');
		A(out.detailOpened, 'Z on a seen cell opens the detail card');
		A(errors.length === 0, 'no page errors while painting the grid', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
