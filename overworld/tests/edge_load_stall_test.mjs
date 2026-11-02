// edge_load_stall_test.mjs — a stalled download on the NEW map never freezes the
// player on the old one (bug:1793302854206, 2026-10-29, Instinct).
//
// Crossing Lavaridge Town's east edge onto Route 112 on a flaky link: world.current
// switched to Route 112 and the player stood at (0,50), but refreshMapContent was
// still awaiting the new map's object sprites — and the fetch layer only gives a
// stalled download up after ~54 s of retries, each retry a sign of life that held
// the load watchdog off to its 75 s cap. Lavaridge stayed on screen, the HUD said
// LAVARIDGE, every key was dead; then the watchdog said "you're back where you
// were" while the player was on Route 112.
//   a) every object sheet on Route 112 STALLS: the crossing still completes within a
//      few seconds (stand-in sheets), the objects are there (solid), and their real
//      sheets are swapped in once the link answers
//   b) the new map's SCRIPTS stall (a wedge after the swap): when the watchdog fires
//      it names the map the player is actually on, never "back where you were"
//
//   node overworld/tests/edge_load_stall_test.mjs
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
const PORT = 9811;
const STATE = { username: 'edgestall', friendCode: 'EDGS01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 30, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 90, atk: 45, def: 45, spa: 45, spd: 45, spe: 45 }, maxHP: 90, curHP: 90, exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
// (the Lavaridge gym guide on the east road reads the SHARED tier: 3 badges everywhere)
const BADGES = { badges: { KANTO: { boulder: true, cascade: true, thunder: true }, HOENN: { stone: true, knuckle: true, dynamo: true }, JOHTO: { zephyr: true, hive: true, plain: true } }, champion: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// what to stall: a predicate on the request path; stalled requests are held open
// and answered for real once `release` is called
let stall = () => false;
const held = [];
const serveFile = (u, res) => fs.readFile(path.join(ROOT, u), (e, d) => {
	if (e) { res.writeHead(404); res.end('nf'); return; }
	const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
	res.writeHead(200, { 'content-type': t }); res.end(d);
});
const release = () => { stall = () => false; while (held.length) { const [u, res] = held.shift(); if (!res.destroyed) serveFile(u, res); } };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	if (stall(u)) { held.push([u, res]); return; }
	serveFile(u, res);
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	const boot = async () => {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, badges) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, BADGES);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LavaridgeTown&x=18&y=10`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'LavaridgeTown' && !window.__ow.gateReport().loading).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		for (let i = 0; i < 15 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(250); }
		return page;
	};
	const st = page => page.evaluate(async () => {
		const S = (await import('./ow_state.js')).S; const W = window.__ow;
		return { map: W.world.current?.name, x: W.player.tx, y: W.player.ty, loading: !!S.loading, hud: document.getElementById('hud')?.textContent || '' };
	});
	const crossEast = async page => { await page.keyboard.down('ArrowRight'); await sleep(700); await page.keyboard.up('ArrowRight'); };

	// ===== a) the new map's object sheets stall =====
	{
		const page = await boot();
		A((await st(page)).map === 'LavaridgeTown', 'setup: standing in Lavaridge Town');
		stall = u => /\/(data\/people|data\/pokemon_ow|people_extra)\//.test(u);
		const t0 = Date.now();
		await crossEast(page);
		if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => ({ g: window.__ow.gateReport(), p: window.__ow.dialog.pages }))).slice(0, 900));
		let s = null;
		for (let i = 0; i < 300; i++) { s = await st(page); if (s.map === 'Route112' && !s.loading) break; await sleep(100); }
		const took = Date.now() - t0;
		A(s.map === 'Route112' && !s.loading && /Route112|ROUTE 112/i.test(s.hud), 'a) stalled sprites: the crossing completes on Route 112 with its HUD', JSON.stringify(s) + ' after ' + took + 'ms');
		A(took < 10000, 'a) ...in seconds, not the fetch layer\'s ~54 s give-up', took + 'ms');
		A(held.length > 0, 'a) (the sprite requests really were stalled)', String(held.length));
		const objs = await page.evaluate(() => ({ npcs: window.__ow.npcs.list.length, trainers: window.__ow.trainers.list.length,
			standIns: [...window.__ow.npcs.list, ...window.__ow.trainers.list].filter(o => o.img instanceof HTMLCanvasElement).length }));
		A(objs.npcs + objs.trainers > 0 && objs.standIns > 0, 'a) the map\'s objects are placed (stand-in sheets) rather than missing', JSON.stringify(objs));
		// the player can act: a step west is taken
		const x0 = (await st(page)).x;
		await page.keyboard.down('ArrowDown'); await sleep(350); await page.keyboard.up('ArrowDown'); await sleep(500);
		const s2 = await st(page);
		A(s2.map !== 'Route112' || s2.x !== x0 || s2.y !== 50, 'a) ...and the player can move', JSON.stringify(s2));
		release();
		let swapped = null;
		for (let i = 0; i < 80; i++) {
			swapped = await page.evaluate(() => [...window.__ow.npcs.list, ...window.__ow.trainers.list].filter(o => o.img instanceof HTMLCanvasElement).length);
			if (swapped === 0) break; await sleep(100);
		}
		A(swapped === 0, 'a) once the link answers, every stand-in is replaced by its real sheet', String(swapped));
		await page.close();
	}

	// ===== b) the new map's scripts stall: the watchdog names the right map =====
	{
		const page = await boot();
		stall = u => /\/data\/(scripts|strings)\/Route112\.json$/.test(u);
		await page.evaluate(async () => { const S = (await import('./ow_state.js')).S; S.loadWatchLimit = 1500; });
		await crossEast(page);
		let s = null;
		for (let i = 0; i < 200; i++) { s = await st(page); if (s.map === 'Route112' && !s.loading) break; await sleep(100); }
		A(s.map === 'Route112' && !s.loading, 'b) the watchdog releases the wedged load on Route 112', JSON.stringify(s));
		A(!/back where you were/.test(s.hud) && /Route112|ROUTE 112/i.test(s.hud), 'b) ...and its message names Route 112, not "back where you were"', s.hud);
		release();
		await page.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	release();
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
