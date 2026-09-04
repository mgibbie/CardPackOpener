// cardshare_test.mjs — Upscale 5 Batch 6 follow-up: share the Trainer Card. S on
// the card snapshots the frame to a PNG and shares it (Web Share API) or saves it
// as a download — mirroring battlecards' deck/replay sharing.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/cardshare_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8887;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'cs', friendCode: 'CSCSCS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			// stub the download click so headless doesn't actually navigate/download
			const origCreate = document.createElement.bind(document);
			document.createElement = tag => { const el = origCreate(tag); if (tag === 'a') el.click = () => { window.__downloaded = el.download; }; return el; };
			localStorage.setItem('magepunk_mp_token_v1', 'cs');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_name', 'RED');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmander', name: 'CHARMANDER', level: 10, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 30, atk: 18, def: 16, spa: 20, spd: 16, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, num: 4, sprite: 's128.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.shareTrainerCard && window.__ow.trainerCard)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, o = {};
			ow.trainerCard.open = true; ow.trainerCard.page = 0;
			await new Promise(r => setTimeout(r, 300)); // paint a frame so the canvas has content
			const url = await ow.shareTrainerCard();
			o.isPng = typeof url === 'string' && url.startsWith('data:image/png');
			o.big = typeof url === 'string' && url.length > 1000; // a real image, not an empty canvas
			o.downloaded = window.__downloaded || null; // headless has no Web Share → save fallback fired
			return o;
		});

		A(out.isPng, 'the share produces a PNG data URL (canvas not tainted)', (out.isPng ? '' : 'no png'));
		A(out.big, 'the snapshot has real image data');
		A(/red-trainer-card\.png$/.test(out.downloaded || ''), 'with no Web Share, it saves a named PNG', out.downloaded);
		A(errors.length === 0, 'no page errors during share', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
