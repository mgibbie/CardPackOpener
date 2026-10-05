// load_watchdog_test.mjs — a stalled map load never leaves the game black and frozen.
//
// 2026-10-05 (Instinct): leaving the Rustboro Pokémon Center, the destination's
// load never finished. The screen faded to black; the stuck-load watchdog then
// cleared `loading` and said "Recovered from a stuck load." — but left the fade
// at full black, so every step was rejected as "fading" until a page reload.
// An HTTP 500 for a map JSON had hit the same player that morning.
//   a) a warp whose destination map JSON HANGS -> the fetch times out, the player
//      is back on the old map, the fade is gone, and they can walk
//   b) a destination that 500s once -> the retry loads it and the warp completes
//   c) the watchdog itself (a load wedged some other way) -> fade back to 0 and
//      walking works, not just `loading` cleared
//
//   node overworld/tests/load_watchdog_test.mjs
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
const PORT = 9226;
const STATE = { username: 'loadwd', friendCode: 'LDWD01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 9, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 30, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, maxHP: 30, curHP: 30, exp: 600, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// per-file misbehaviour: 'hang' never answers; '500once' fails the first request
const mode = {}; const hits = {};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	const base = path.basename(u);
	hits[base] = (hits[base] || 0) + 1;
	if (mode[base] === 'hang') return;                              // never answer
	if (mode[base] === '500once' && hits[base] === 1) { res.writeHead(500); return res.end('boom'); }
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=10&y=10`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'PalletTown').catch(() => false)); i++) await sleep(100);
	await sleep(800);
	const st = () => page.evaluate(async () => { const S = (await import('./ow_state.js')).S; const W = window.__ow; return { map: W.world.current?.name, x: W.player.tx, y: W.player.ty, alpha: W.fade.alpha, target: W.fade.target, loading: !!S.loading }; });
	// can the player walk? step right then left on open grass
	const canWalk = async () => {
		const x0 = (await st()).x;
		await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight'); await sleep(400);
		const x1 = (await st()).x;
		await page.keyboard.down('ArrowLeft'); await sleep(300); await page.keyboard.up('ArrowLeft'); await sleep(400);
		return x1 !== x0;
	};
	A(await canWalk(), 'setup: the player can walk in Pallet Town');

	// ===== a) the destination hangs =====
	mode['PalletTown_RivalsHouse_map.json'] = 'hang';
	const t0 = Date.now();
	await page.evaluate(() => { window.__ow.warpTo('MAP_PALLET_TOWN_RIVALS_HOUSE', 0); });
	let s = null;
	for (let i = 0; i < 300; i++) { s = await st(); if (!s.loading && s.alpha < 0.01 && s.target < 0.01 && Date.now() - t0 > 1500) break; await sleep(100); }
	const took = Date.now() - t0;
	A(s.map === 'PalletTown' && s.alpha < 0.01 && s.target < 0.01 && !s.loading, 'a) a hung destination: back on the old map, no black fade, not loading', JSON.stringify(s) + ' after ' + took + 'ms');
	A(took < 25000, 'a) ...within the fetch timeout (no endless black screen)', took + 'ms');
	A(await canWalk(), 'a) ...and the player can walk');
	A((hits['PalletTown_RivalsHouse_map.json'] || 0) >= 2, 'a) the fetch was retried before giving up', String(hits['PalletTown_RivalsHouse_map.json']));

	// ===== b) the destination 500s once =====
	mode['PalletTown_ProfessorOaksLab_map.json'] = '500once';
	await page.evaluate(() => window.__ow.warpTo('MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB', 0));
	for (let i = 0; i < 100 && (await st()).map !== 'PalletTown_ProfessorOaksLab'; i++) await sleep(100);
	await sleep(500);
	s = await st();
	A(s.map === 'PalletTown_ProfessorOaksLab' && s.alpha < 0.01 && !s.loading, 'b) a transient 500 is retried and the warp completes', JSON.stringify(s) + ' hits ' + hits['PalletTown_ProfessorOaksLab_map.json']);

	// back outside for c
	await page.evaluate(() => window.__ow.moveToMap('PalletTown', 10, 10));
	for (let i = 0; i < 100 && (await st()).map !== 'PalletTown'; i++) await sleep(100);
	await sleep(600);

	// ===== c) the watchdog: a load wedged some other way =====
	await page.evaluate(async () => { const S = (await import('./ow_state.js')).S; S.loadWatchLimit = 1500; S.loading = true; window.__ow.fade.target = 1; window.__ow.fade.alpha = 1; });
	for (let i = 0; i < 60; i++) { s = await st(); if (!s.loading && s.alpha < 0.01) break; await sleep(100); }
	A(!s.loading && s.alpha < 0.01 && s.target < 0.01 && s.map === 'PalletTown', 'c) the watchdog clears the load AND the black fade', JSON.stringify(s));
	A(await canWalk(), 'c) ...and the player can walk again (not "fading")');
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
