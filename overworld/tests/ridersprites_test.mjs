// ridersprites_test.mjs — Upscale 5 Batch 7: rider sprites. Biking used to only
// change speed and Surf drew a generic blue ellipse. The real decomp bike/surf
// player sheets (already in data/people) are now wired: the player rides a proper
// bike and a proper surf mount, with the plain ellipse kept only as a fallback.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/ridersprites_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8888;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'rs', friendCode: 'RSRSRS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'rs');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmander', name: 'CHARMANDER', level: 10, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 30, atk: 18, def: 16, spa: 20, spd: 16, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, num: 4, sprite: 's128.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.player && window.__ow.player.img && window.__ow.player.rideImg)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');
		// give the ride sheets a moment to load
		await waitFor(() => page.evaluate(() => !!(window.__ow.player.bikeImg && window.__ow.player.surfImg)), 8000);

		const out = await page.evaluate(async () => {
			const p = window.__ow.player, o = {};
			o.bikeLoaded = !!p.bikeImg && p.bikeImg.width === 288;   // 18 frames of 16x32
			o.surfLoaded = !!p.surfImg && p.surfImg.width === 288;
			o.walkFrames = p.img.width === 144;                       // 9-frame walk sheet
			// mode → sheet selection
			p.surfing = false; p.biking = false; o.walkSheet = p.rideImg() === p.img;
			p.biking = true; o.bikeSheet = p.rideImg() === p.bikeImg;
			p.biking = false; p.surfing = true; o.surfSheet = p.rideImg() === p.surfImg;
			p.surfing = true; p.biking = true; o.surfWins = p.rideImg() === p.surfImg; // surf outranks bike
			p.surfing = false; p.biking = false;
			return o;
		});
		// let the render loop paint each mode (no page errors)
		await page.evaluate(() => { window.__ow.player.biking = true; });
		await new Promise(r => setTimeout(r, 250));
		await page.evaluate(() => { window.__ow.player.biking = false; window.__ow.player.surfing = true; });
		await new Promise(r => setTimeout(r, 250));
		await page.evaluate(() => { window.__ow.player.surfing = false; });

		A(out.walkFrames, 'the walk sheet is the 9-frame red_normal (unchanged)');
		A(out.bikeLoaded, 'the real bike sheet loads (data/people/red_bike.png)');
		A(out.surfLoaded, 'the real surf sheet loads (data/people/red_surf.png)');
		A(out.walkSheet, 'on foot → the walk sheet');
		A(out.bikeSheet, 'biking → the bike sheet (not just faster walking)');
		A(out.surfSheet, 'surfing → the surf-mount sheet (not the blue ellipse)');
		A(out.surfWins, 'surfing outranks biking for the sprite');
		A(errors.length === 0, 'no page errors while drawing biking + surfing', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
