// secret_key_test.mjs — picking up an item ball sets its story flag (the Secret Key opens Cinnabar Gym).
//
// 2026-10-04, Instinct (blocker): the Secret Key was in the bag, but Cinnabar
// Gym's door said "The door is locked..." and pushed them back. CinnabarIsland's
// OnTransition unlocks the door only when FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY
// is set — and a pickup recorded its ball only in the collected record, never in
// the story, as the decomp's finditem/removeobject does.
//   1. picking up the Secret Key ball sets the story flag, and the gym door opens
//   2. a save shaped like Instinct's (key collected + in the bag, story flag
//      missing) self-heals on boot: the door opens with no save edit
//   3. a SCRIPTED ball's flag is never set from the collected record
//
//   node overworld/tests/secret_key_test.mjs
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
const PORT = 9224;
const STATE = { username: 'secretkey', friendCode: 'SKEY01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 50, types: ['Normal', 'Flying'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 150, atk: 90, def: 85, spa: 80, spd: 80, spe: 110 }, maxHP: 150, curHP: 150, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
const FLAG = 'FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY';
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
		if (b.action === 'ow-save') return res.end('{"ok":true}');
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
async function open(map, x, y, seedExtra) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, extra) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'kanto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, rival_tier1_done: true, rival_tier2_done: true, rival_tier3_done: true, rival_tier4_done: true, rival_tier5_done: true, rival_tier6_done: true }, vars: {} }));   // rival beats done, as on Instinct's save
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		// six badges in every region, like Instinct's save (Cinnabar's gym guide
		// gates Blaine on 6 badges — that's a different door check from the key)
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: {
			KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true },
			JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true },
			HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true } }, champion: {} }));
		for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
	}, STATE, PARTY, seedExtra || {});
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1000);
	return { page, ctx, errors };
}
const drive = page => page.evaluate(async () => {
	const O = window.__ow; const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < 15000) {
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages).slice(0, 90)); press('z'); }
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
});
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
const place = (page, x, y, f) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, f);
const walkUp = async page => { await page.keyboard.down('ArrowUp'); await sleep(260); await page.keyboard.up('ArrowUp'); await sleep(450); await drive(page); };
const flag = (page, f) => page.evaluate(async f => (await import('./events.js')).getStoredFlag(f), f);
// walk from below the door to it: locked -> pushed back to (20,6); unlocked -> into the gym
async function tryGymDoor(page) {
	await page.evaluate(() => window.__ow.moveToMap('CinnabarIsland', 20, 6));
	for (let i = 0; i < 60 && (await pos(page)).map !== 'CinnabarIsland'; i++) await sleep(100);
	await sleep(700); await drive(page);
	await place(page, 20, 6, 'up');
	await walkUp(page); await walkUp(page);
	await sleep(800);
	return { ...(await pos(page)), said: await page.evaluate(() => (window.__said || []).slice(-3)) };
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. pick the key up =====
	{
		const { page, ctx, errors } = await open('PokemonMansion_B1F', 4, 7);
		A(await flag(page, FLAG) === false, 'setup: the story flag starts unset');
		await place(page, 4, 7, 'right');
		await page.keyboard.press('z'); await sleep(300); await drive(page);
		const bag = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
		A(bag.secretkey === 1, '1. the Secret Key is in the bag', JSON.stringify(bag));
		A(await flag(page, FLAG) === true, '1. ...and the pickup set its story flag (as finditem/removeobject does)');
		const at = await tryGymDoor(page);
		A(at.map !== 'CinnabarIsland' || at.y <= 4, '1. Cinnabar Gym\'s door opens (not turned back to (20,6))', JSON.stringify(at));
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 2. Instinct's save: collected + in the bag, but no story flag =====
	{
		const { page, ctx, errors } = await open('CinnabarIsland', 20, 6, {
			magepunk_collected_v1: JSON.stringify([FLAG, 'FLAG_HIDE_AQUA_HIDEOUT_B1F_ELECTRODE_2']),
			magepunk_bag_v1: JSON.stringify({ secretkey: 1 }),
		});
		A(await flag(page, FLAG) === true, '2. on boot, the collected Secret Key heals its story flag (no save edit)');
		A(await flag(page, 'FLAG_HIDE_AQUA_HIDEOUT_B1F_ELECTRODE_2') === false, '3. a SCRIPTED ball\'s flag in the collected record is NOT set (it must come back)');
		const at = await tryGymDoor(page);
		A(at.map !== 'CinnabarIsland' || at.y <= 4, '2. ...and the gym door opens', JSON.stringify(at));
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
