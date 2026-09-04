// followtest_test.mjs — the owner-only follower previewer (?followtest=1). Mounts
// for mgibbie, pins the trailing follower to the chosen AI-generated sheet, cycles
// the set with [ / ], loads the promoted sheets, and refuses non-owner accounts.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/followtest_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8889;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const mkState = name => ({ username: name, friendCode: 'FTFTFT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } });
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

async function boot(browser, username) {
	const state = mkState(username);
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', st.username);
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 30, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 90, atk: 60, def: 55, spa: 65, spd: 55, spe: 70 }, maxHP: 90, curHP: 90, exp: 27000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
	}, state);
	return { page, state };
}

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { const uname = req.headers.authorization?.includes('grunt') ? 'grunt' : 'mgibbie'; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: mkState(uname), friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	try {
		// --- owner mounts, cycles, pins, loads sheets ---
		const { page } = await boot(browser, 'mgibbie');
		await page.goto(`http://localhost:${PORT}/overworld/index.html?followtest=1&map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const mounted = await waitFor(() => page.evaluate(() => !!window.__followtest), 30000);
		A(mounted, 'the follower test mounts for the owner (mgibbie)');
		if (!mounted) throw new Error('did not mount');
		await new Promise(r => setTimeout(r, 500)); // let a few rAF ticks pin the follower + load a sheet

		const out = await page.evaluate(async () => {
			const o = {}, ow = window.__ow;
			o.ids = window.__followtest.ids;
			o.pinned0 = ow.follower?.id || null;                 // pinned to ids[0]
			// sheet actually loads (promoted to data/pokemon_follow)
			await new Promise(r => setTimeout(r, 400));
			const img = ow.followSheet(o.ids[0]);
			o.sheetLoaded = !!img && img.width === 128 && img.height === 128;
			o.overlayCanvas = !!document.querySelector('canvas[style*="pixelated"]');
			return o;
		});
		A(Array.isArray(out.ids) && out.ids.length >= 7 && out.ids.includes('gigalion'), 'it exposes the AI-generated set', JSON.stringify(out.ids));
		A(out.pinned0 === out.ids[0], 'the live follower is pinned to the selected sprite', out.pinned0);
		A(out.sheetLoaded, 'the promoted 128x128 sheet loads from data/pokemon_follow', out.sheetLoaded);
		A(out.overlayCanvas, 'the preview overlay is on screen');

		// cycle with ']' → next id
		await page.keyboard.press(']');
		await new Promise(r => setTimeout(r, 250));
		const after = await page.evaluate(() => window.__ow.follower?.id || null);
		A(after === out.ids[1], "']' advances to the next sprite", `${after} vs ${out.ids[1]}`);
		// and back with '['
		await page.keyboard.press('[');
		await new Promise(r => setTimeout(r, 250));
		const back = await page.evaluate(() => window.__ow.follower?.id || null);
		A(back === out.ids[0], "'[' goes back to the previous sprite", back);
		await page.close();

		// --- a non-owner is refused ---
		const { page: page2 } = await boot(browser, 'grunt');
		await page2.goto(`http://localhost:${PORT}/overworld/index.html?followtest=1&map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page2.evaluate(() => !!window.__ow), 30000);
		await new Promise(r => setTimeout(r, 1500));
		const nonOwnerMounted = await page2.evaluate(() => !!window.__followtest);
		A(!nonOwnerMounted, 'a non-owner account does NOT get the tool');
		await page2.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
