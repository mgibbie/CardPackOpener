// slow_tileset_test.mjs — a slow connection never leaves a black map.
//
// 2026-10-12, Instinct (three reports): after a Fly or a building exit the map
// came up black — tilesheets missing, "Loading got stuck — you're back where you
// were." — at Route 23, Indigo Plateau and Cerulean City, and a page reload did
// not recover it. general_tiles.png (285 KB) took 2.6 s to a lone fetch; amid an
// arrival's dozens of parallel downloads it ran past the image loader's flat 8 s
// timer (counted from the request, queue time included), was abandoned twice,
// and the map was drawn with null tilesets — then KEPT in the render cache, so
// it stayed black. A neighbour map's JSON timing out also held the whole warp
// until the 20 s watchdog.
//   1. a tilesheet that trickles in over ~10 s (headers at once, then slow bytes)
//      still draws the map — on boot, and again on a reload
//   2. a neighbour map that never answers doesn't hold the arrival
//   3. a tilesheet that fails outright a few times (503) recovers on its own,
//      without a reload: the map is repainted once the sheet arrives
//
//   node overworld/tests/slow_tileset_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9431;
const STATE = { username: 'slowtiles', friendCode: 'SLOWTL', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 20, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
	exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const SHEET = '/overworld/data/tilesets/general_tiles.png';
const NEIGHBOUR = '/overworld/data/maps/Route1_map.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the network, per phase
let mode = 'normal', sheetHits = 0;
const held = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	const noStore = { 'cache-control': 'no-store' };
	if (u === SHEET && mode === 'trickle') {
		// headers at once, then the body in small pieces over ~10 s: slow, never silent
		const d = fs.readFileSync(path.join(ROOT, u));
		res.writeHead(200, { ...noStore, 'content-type': 'image/png', 'content-length': d.length });
		const N = 20;
		for (let i = 0; i < N; i++) {
			if (res.destroyed) return;
			res.write(d.subarray(Math.floor(i * d.length / N), Math.floor((i + 1) * d.length / N)));
			await sleep(500);
		}
		return res.end();
	}
	if (u === SHEET && mode === 'flaky' && ++sheetHits <= 5) { res.writeHead(503, noStore); return res.end('busy'); }
	if (u === NEIGHBOUR && mode === 'hang') { held.push(res); return; }   // never answers
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404, noStore); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { ...noStore, 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const seed = async page => page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	// is PalletTown on screen with its tilesheets, painted, and done loading?
	const drawn = page => page.evaluate(async () => {
		const O = window.__ow; if (!O || !O.world || !O.world.current) return { ok: false };
		const S = (await import('./ow_state.js')).S;
		const cur = O.world.current, cv = cur.canvases && cur.canvases.bottom;
		let painted = 0;
		if (cv) {
			const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
			for (let i = 3; i < px.length; i += 4 * 97) if (px[i]) painted++;
		}
		return { ok: true, name: cur.name, primary: !!(cur.ts && cur.ts.primary), painted, loading: !!S.loading };
	}).catch(() => ({ ok: false }));
	const waitDrawn = async (page, ms) => {
		const t0 = Date.now(); let s;
		while (Date.now() - t0 < ms) { s = await drawn(page); if (s.ok && s.name === 'PalletTown' && s.primary && s.painted > 0 && !s.loading) return { ...s, ms: Date.now() - t0 }; await sleep(250); }
		return { ...s, ms: Date.now() - t0, timedOut: true };
	};

	// ===== 1. a slow tilesheet still draws, and draws again after a reload =====
	mode = 'trickle';
	let page = await browser.newPage();
	await seed(page);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=8&y=8`, { waitUntil: 'domcontentloaded' });
	let s = await waitDrawn(page, 45000);
	A(!s.timedOut, '1. a tilesheet trickling in over ~10 s still draws the map (no black screen)', JSON.stringify(s));
	await page.reload({ waitUntil: 'domcontentloaded' });
	s = await waitDrawn(page, 45000);
	A(!s.timedOut, '1. ...and again after a page reload', JSON.stringify(s));
	await page.close();

	// ===== 2. a neighbour map that never answers doesn't hold the arrival =====
	mode = 'hang';
	page = await browser.newPage();
	await seed(page);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=8&y=8`, { waitUntil: 'domcontentloaded' });
	s = await waitDrawn(page, 30000);
	A(!s.timedOut && s.ms < 14000, '2. Route 1 never answering does not hold Pallet Town\'s arrival (done well inside the 20 s watchdog)', JSON.stringify(s));
	await page.close();
	for (const r of held.splice(0)) { try { r.destroy(); } catch (e) {} }

	// ===== 3. a sheet that fails a few times recovers by itself, no reload =====
	mode = 'flaky'; sheetHits = 0;
	page = await browser.newPage();
	await seed(page);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=8&y=8`, { waitUntil: 'domcontentloaded' });
	s = await waitDrawn(page, 60000);
	A(!s.timedOut, '3. a tilesheet that 503s five times is refetched and the map repainted without a reload', JSON.stringify({ ...s, sheetHits }));
	A(sheetHits > 5, '3. ...by asking the server again after the failures', String(sheetHits));
	await page.close();
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	for (const r of held.splice(0)) { try { r.destroy(); } catch (e) {} }
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
