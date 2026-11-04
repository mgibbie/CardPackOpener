// safari_gate_test.mjs — the decomp SAFARI ZONE gates start (and refuse) the game.
//
// 2026-10-07, Instinct's reports (bug:1791405650035, bug:1791405801227): the FireRed
// gate said "Your PC BOX is full" with 15/240 stored, and with a smaller party it
// took the decomp's $500, warped in, and then the native gate asked for a SECOND
// $500. #664 restored `getpartysize`, so the decomp entrance scripts now run, and
// they call specials the port never had: IsThereRoomInAnyBoxForMorePokemon
// (Emerald: ScriptCheckFreePokemonStorageSpace) and EnterSafariMode. Now:
//   1. FRLG, full party + room: one $500, safari on (30 balls / 600 steps), no 2nd prompt
//   1a. FRLG, 5 in party: one $500, no second prompt (the double charge)
//   1b/1c. leaving: the decomp's ExitEarly; a native game-over leaves no stale scene
//   2. FRLG, full party + a full PC (240): refused, nothing charged
//   3. Emerald (Route 121), full party + room: one $500, safari on (30 / 500)
//
//   node overworld/tests/safari_gate_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9296;
const STATE = { username: 'safarigate', friendCode: 'SAFGAT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MON = n => ({
	speciesId: 'rattata', name: 'MON' + n, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's19.png', num: 19,
});
const PARTY6 = [1, 2, 3, 4, 5, 6].map(MON);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

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
	if (u === '/seed.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>seed</title>'); }
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
	const W = (f, ...a) => page.evaluate(f, ...a);
	// a fresh save on this origin, then boot the game on `map`
	const start = async ({ region, map, x, y, box, bag, party = PARTY6 }) => {
		await page.goto(`http://localhost:${PORT}/seed.html`, { waitUntil: 'domcontentloaded' });
		await W((st, party, region, box, bag) => {
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_box_v1', JSON.stringify(box));
			localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_money', '987');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, party, region, box, bag);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	// answer every message / YES-NO with Z until the scripts go quiet; note any
	// native "PA: Welcome to the SAFARI GAME" fee prompt on the way
	const drive = () => W(async () => {
		const O = window.__ow, press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = []; const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 25000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
			if (d) { const t = (O.dialog.pages || []).flat().join(' '); if (t && seen[seen.length - 1] !== t) seen.push(t); }
			if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 15) break; } else calm = 0;
			if (d) press('z');
			await new Promise(r => setTimeout(r, 40));
		}
		return seen;
	});
	const state = () => W(() => ({ map: window.__ow.world.current.name, money: window.__ow.Bag.getMoney(), safari: { ...window.__ow.safariState } }));
	const step = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(300); };
	const BOX15 = Array.from({ length: 15 }, (_, i) => MON(10 + i));

	// ===== 1. FireRed, full party, PC has room =====
	await start({ region: 'KANTO', map: 'FuchsiaCity_SafariZone_Entrance', x: 4, y: 4, box: BOX15, bag: {} });
	await step('ArrowUp');
	let said = await drive();
	await sleep(1500); said = said.concat(await drive());
	let s = await state();
	A(!said.some(t => /PC BOX is full/i.test(t)), '1. FRLG: 15/240 stored is NOT "PC BOX is full"', said.join(' | ').slice(0, 300));
	A(s.map === 'SafariZone_Center', '1. FRLG: the gate lets the full party in', JSON.stringify(s));
	A(s.money === 487, '1. FRLG: exactly one $500 fee', String(s.money));
	A(s.safari.on && s.safari.zone === 'fr' && s.safari.balls === 30 && s.safari.steps === 600, '1. FRLG: EnterSafariMode starts the game: 30 SAFARI BALLS, 600 steps', JSON.stringify(s.safari));
	A(!said.some(t => /PA: Welcome to the SAFARI GAME/.test(t)), '1. FRLG: no second fee prompt inside', said.filter(t => /PA:/.test(t)).join(' | '));

	// ===== 1a. a 5-POKeMON party (no PC check): still one fee, no second prompt =====
	await start({ region: 'KANTO', map: 'FuchsiaCity_SafariZone_Entrance', x: 4, y: 4, box: BOX15, bag: {}, party: PARTY6.slice(0, 5) });
	await step('ArrowUp');
	said = await drive();
	await sleep(1500); said = said.concat(await drive());
	s = await state();
	A(s.map === 'SafariZone_Center' && s.money === 487 && s.safari.on && s.safari.balls === 30, '1a. FRLG (5 in party): one $500 starts the game', JSON.stringify(s));
	A(!said.some(t => /PA: Welcome to the SAFARI GAME/.test(t)), '1a. FRLG (5 in party): no second $500 prompt after the warp in', said.filter(t => /PA:/.test(t)).join(' | '));

	// ===== 1b. walking back out mid-game: the decomp's ExitEarly owns the exit =====
	A(await W(() => window.__ow.Story.getVar('VAR_MAP_SCENE_FUCHSIA_CITY_SAFARI_ZONE_ENTRANCE')) === 2, '1b. FRLG: the gate marked the game running (scene 2)');
	await W(() => window.__ow.moveToMap('FuchsiaCity_SafariZone_Entrance', 4, 2));
	await sleep(800);
	said = await drive();
	s = await state();
	A(said.some(t => /leave the\s+SAFARI ZONE early/.test(t)), '1b. FRLG: back at the gate mid-game, the attendant asks "leave the SAFARI ZONE early?"', said.join(' | ').slice(0, 300));
	A(!s.safari.on && await W(() => window.__ow.Story.getVar('VAR_MAP_SCENE_FUCHSIA_CITY_SAFARI_ZONE_ENTRANCE')) === 0, '1b. FRLG: YES -> ExitSafariMode ends the game, scene back to 0', JSON.stringify(s.safari));

	// ===== 1c. the native time-up / out-of-balls end clears the gate's scene =====
	await W(() => { window.__ow.Story.setVar('VAR_MAP_SCENE_FUCHSIA_CITY_SAFARI_ZONE_ENTRANCE', 2); });
	await W(() => window.__ow.moveToMap('SafariZone_Center', 26, 30));
	await sleep(800);
	await W(() => { const sf = window.__ow.safariState; sf.on = true; sf.zone = 'fr'; sf.balls = 30; sf.steps = 1; });
	await W(() => window.__ow.endSafari('PA: Ding-dong! Your SAFARI GAME is over!'));
	said = await drive();
	await sleep(1000); said = said.concat(await drive());
	s = await state();
	A(s.map === 'FuchsiaCity_SafariZone_Entrance' && !s.safari.on, '1c. FRLG: game over sends you to the gate with the game ended', JSON.stringify(s));
	A(!said.some(t => /early/.test(t)), '1c. FRLG: ...and no stale "leave early?" prompt there', said.join(' | ').slice(0, 300));

	// ===== 2. FireRed, full party, the PC truly full =====
	await start({ region: 'KANTO', map: 'FuchsiaCity_SafariZone_Entrance', x: 4, y: 4, box: Array.from({ length: 240 }, (_, i) => MON(100 + i)), bag: {} });
	await step('ArrowUp');
	said = await drive();
	s = await state();
	A(said.some(t => /PC BOX is full/i.test(t)), '2. FRLG: a full PC (240) refuses a full party', said.join(' | ').slice(0, 300));
	A(s.map === 'FuchsiaCity_SafariZone_Entrance' && s.money === 987 && !s.safari.on, '2. FRLG: refused, nothing charged, no game', JSON.stringify(s));

	// ===== 3. Emerald (Route 121), full party, PC has room =====
	await start({ region: 'HOENN', map: 'Route121_SafariZoneEntrance', x: 9, y: 4, box: BOX15, bag: { pokeblockcase: 1 } });
	await step('ArrowLeft');
	said = await drive();
	await sleep(1500); said = said.concat(await drive());
	s = await state();
	A(s.map === 'SafariZone_South' && s.money === 487, '3. Emerald: in, one $500 fee', JSON.stringify(s) + ' ' + said.join(' | ').slice(0, 200));
	A(s.safari.on && s.safari.zone === 'hoenn' && s.safari.balls === 30 && s.safari.steps === 500, '3. Emerald: 30 SAFARI BALLS, 500 steps', JSON.stringify(s.safari));
	A(!said.some(t => /PA: Welcome to the SAFARI GAME/.test(t)), '3. Emerald: no second fee prompt', said.filter(t => /PA:/.test(t)).join(' | '));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
