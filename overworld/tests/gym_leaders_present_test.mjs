// gym_leaders_present_test.mjs — the first gym leaders are in their gyms and battle you.
//
// 2026-10-01, a playtester's automated census reported Brock, Roxanne and
// Falkner "missing — only the Gym Guy" and the 1st-badge shard quest blocked.
// They weren't: gym leaders and gym trainers live in `trainers.list`, which
// `npcs.list` deliberately excludes (a trainer is never also a plain NPC), and
// the census read `npcs.list` alone. Reproduced with the tester's real save on
// main (2026-10-02): all three present, drawn, and talking starts the battle.
// This guards it from a fresh, badgeless save:
//   1. each leader is loaded on their gym map (trainers.list), not hidden
//   2. talking to them opens their intro and starts the gym battle
//
//   node overworld/tests/gym_leaders_present_test.mjs
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
const PORT = 9210;
const STATE = { username: 'gymleaders', friendCode: 'GYML01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'bulbasaur', name: 'BULBASAUR', level: 12, gender: 'M', friend: 70, types: ['Grass', 'Poison'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 34, atk: 18, def: 18, spa: 21, spd: 21, spe: 17 }, maxHP: 34, curHP: 34,
	exp: 1500, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 1,
}];
// [label, map, leader gfx, leader tile, region]
const GYMS = [
	['Brock', 'PewterCity_Gym', 'OBJ_EVENT_GFX_BROCK', 6, 5, 'kanto', /BROCK/],
	['Roxanne', 'RustboroCity_Gym', 'OBJ_EVENT_GFX_ROXANNE', 5, 2, 'hoenn', /ROXANNE/],
	['Falkner', 'VioletGym', 'OBJ_EVENT_GFX_FALKNER', 5, 1, 'johto', /FALKNER/],
];
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
	for (const [who, map, gfx, lx, ly, region, nameRe] of GYMS) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, region) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, region);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${lx}&y=${ly + 2}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => window.__ow?.world?.current?.name === m && !!window.__ow?.battle?.data, map).catch(() => false)); i++) await sleep(100);
		await sleep(1200);
		const here = await page.evaluate((gfx, lx, ly) => {
			const t = window.__ow.trainers.list.find(t => t.ev && t.ev.graphics_id === gfx);
			return { found: !!t, at: t ? [t.ev.x, t.ev.y] : null, defeated: !!(t && t.defeated), inNpcs: window.__ow.npcs.list.some(n => n.ev && n.ev.graphics_id === gfx) };
		}, gfx, lx, ly);
		A(here.found && here.at && here.at[0] === lx && here.at[1] === ly && !here.defeated, `1. ${who} is in ${map} at (${lx},${ly}), unbeaten`, JSON.stringify(here));
		// talk to the leader from the tile below
		await page.evaluate((lx, ly) => { const P = window.__ow.player; P.tx = lx; P.ty = ly + 1; P.x = lx * 16; P.y = (ly + 1) * 16; P.facing = 'up'; }, lx, ly);
		await page.keyboard.press('z');
		let started = false, said = '';
		for (let i = 0; i < 100 && !started; i++) {
			started = await page.evaluate(() => !!(window.__ow.battle.active || window.__ow.battle.foe)).catch(() => false);
			const d = await page.evaluate(() => window.__ow.dialog.blocking ? JSON.stringify(window.__ow.dialog.pages) : '').catch(() => '');
			if (d) { said = said || d; await page.keyboard.press('z'); }
			await sleep(120);
		}
		A(nameRe.test(said), `2. talking to ${who} opens their intro`, said.slice(0, 120));
		A(started, `2. ...and starts the gym battle`);
		A(errors.length === 0, `${who}: no page errors`, JSON.stringify(errors.slice(0, 3)));
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
