// trainercard_test.mjs — Upscale 5 Batch 6c: Trainer Card upgrades. It already
// carries the new Trainer ID (Batch 4); this adds a shiny count (party + PC boxes)
// and Battle Frontier progress (BP + symbols), and confirms the card renders with
// the extra rows.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/trainercard_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8884;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'tc', friendCode: 'TCTCTC', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'tc');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_name', 'RED');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			// a party with ONE shiny
			localStorage.setItem('magepunk_party_v1', JSON.stringify([
				{ speciesId: 'pikachu', name: 'PIKACHU', level: 20, gender: 'M', ability: 'static', types: ['Electric'], shiny: true, ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 34, spa: 40, spd: 40, spe: 60 }, maxHP: 60, curHP: 60, exp: 8000, num: 25, sprite: 's800.png', moves: [{ id: 'thundershock', name: 'ThunderShock', pp: 30, maxPp: 30 }] },
				{ speciesId: 'eevee', name: 'EEVEE', level: 20, gender: 'F', ability: 'runaway', types: ['Normal'], shiny: false, ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60, exp: 8000, num: 133, sprite: 's4256.png', moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] },
			]));
			// two more shinies in the PC boxes
			localStorage.setItem('magepunk_box_v1', JSON.stringify([
				{ speciesId: 'gyarados', name: 'GYARADOS', level: 30, shiny: true, types: ['Water', 'Flying'], num: 130, sprite: 's4160.png', maxHP: 100, curHP: 100, moves: [] },
				{ speciesId: 'rattata', name: 'RATTATA', level: 5, shiny: false, types: ['Normal'], num: 19, sprite: 's608.png', maxHP: 20, curHP: 20, moves: [] },
				{ speciesId: 'magikarp', name: 'MAGIKARP', level: 5, shiny: true, types: ['Water'], num: 129, sprite: 's4128.png', maxHP: 20, curHP: 20, moves: [] },
			]));
			localStorage.setItem('magepunk_bp', '42');
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.shinyOwnedCount && window.__ow.trainerCard && window.__ow.Frontier)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, o = {};
			o.shinies = ow.shinyOwnedCount();          // 2 party (1) + box (2) = 3
			o.bp = ow.Frontier.getBP();
			o.symObj = typeof ow.Frontier.getSymbols() === 'object';
			// open the Trainer Card and let the render loop paint both pages
			ow.trainerCard.open = true; ow.trainerCard.page = 0;
			return o;
		});
		await new Promise(r => setTimeout(r, 250));
		await page.evaluate(() => { window.__ow.trainerCard.page = 1; }); // journal page
		await new Promise(r => setTimeout(r, 250));

		A(out.shinies === 3, 'shiny count spans party + PC boxes', out.shinies);
		A(out.bp === 42, 'Frontier BP reads from the live store', out.bp);
		A(out.symObj, 'Frontier symbols are queryable');
		A(errors.length === 0, 'the Trainer Card renders (both pages) without error', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
