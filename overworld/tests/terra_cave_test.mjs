// terra_cave_test.mjs — Terra Cave lets you out where you came in.
//
// 2026-10-02, Muse's bug report (blocker): entering Terra Cave from Route 116
// was a one-way trip. The cave's exit (TerraCave_Entrance warp 0) is MAP_DYNAMIC
// in pokeemerald — "back out the door you came in" — but the exported data
// hardwired it to Route 114 warp 4, a Surf-only pocket at (7,4); with no Surf the
// save was sealed in. Now the exit is MAP_DYNAMIC again, and warpTo follows
// Gen 3's arrival rule (field_control_avatar.c SetupWarp): landing on a door
// whose own exit is MAP_DYNAMIC remembers the door you came through.
//   1. Route 116 (59,13) -> cave -> exit -> back on Route 116, not the pocket
//   2. Route 114's south entrance (6,46) -> cave -> exit -> back at (6,46)
//   3. a reload inside the cave still exits to Route 116
//
//   node overworld/tests/terra_cave_test.mjs
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
const PORT = 9209;
const STATE = { username: 'terracave', friendCode: 'TERRA1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'bulbasaur', name: 'BULBASAUR', level: 12, gender: 'M', friend: 70, types: ['Grass', 'Poison'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 34, atk: 20, def: 20, spa: 22, spd: 22, spe: 20 }, maxHP: 34, curHP: 34,
	exp: 1728, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 1,
}];
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
async function boot(map, x, y) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await waitMap(page, map);
	return { page, ctx, errors };
}
const mapName = page => page.evaluate(() => window.__ow?.world?.current?.name).catch(() => null);
const pos = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
async function waitMap(page, m) {
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m && !window.__ow.fade?.target), m).catch(() => false)); i++) await sleep(100);
	await sleep(700);
	return (await mapName(page)) === m;
}
// walk onto a door from the tile beside it (the warp fires as you step on)
async function stepOnto(page, fromX, fromY, key, facing) {
	await page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, fromX, fromY, facing);
	await page.keyboard.down(key); await sleep(260); await page.keyboard.up(key); await sleep(400);
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1 + 3. Route 116 -> cave -> (reload) -> exit
	{
		const { page, ctx, errors } = await boot('Route116', 59, 14);
		await stepOnto(page, 59, 14, 'ArrowUp', 'up');
		A(await waitMap(page, 'TerraCave_Entrance'), 'setup: Route 116 (59,13) leads into Terra Cave', JSON.stringify(await pos(page)));
		await stepOnto(page, 8, 17, 'ArrowDown', 'down');
		const out1 = (await waitMap(page, 'Route116')) && await pos(page);
		A(out1 && out1.map === 'Route116' && Math.abs(out1.x - 59) <= 1 && Math.abs(out1.y - 13) <= 1, '1. the exit puts you back on Route 116 where you came in — not the sealed Route 114 pocket', JSON.stringify(out1 || await pos(page)));

		A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// 3. the way out is saved with the position, so a reload inside keeps it
	//    (main.js restores saved.dyn into S.dynamicWarp at boot)
	{
		const { page, ctx } = await boot('Route116', 59, 14);
		await stepOnto(page, 59, 14, 'ArrowUp', 'up');
		A(await waitMap(page, 'TerraCave_Entrance'), 'setup: into Terra Cave from Route 116 again', JSON.stringify(await pos(page)));
		const saved = await page.evaluate(async () => { const I = await import('./ow_input.js'); I.savePos(); return JSON.parse(localStorage.getItem(I.POS_KEY) || 'null'); });
		A(saved && saved.map === 'TerraCave_Entrance' && saved.dyn && saved.dyn.map === 'MAP_ROUTE116' && +saved.dyn.warp === 3,
			'3. the saved position remembers the exit leads to Route 116 (warp 3), so a reload inside keeps the way out', JSON.stringify(saved));
		await ctx.close();
	}

	// 2. Route 114's south entrance
	{
		const { page, ctx } = await boot('Route114', 6, 47);
		await stepOnto(page, 6, 47, 'ArrowUp', 'up');
		A(await waitMap(page, 'TerraCave_Entrance'), 'setup: Route 114 (6,46) leads into Terra Cave', JSON.stringify(await pos(page)));
		await stepOnto(page, 8, 17, 'ArrowDown', 'down');
		const out2 = (await waitMap(page, 'Route114')) && await pos(page);
		A(out2 && Math.abs(out2.x - 6) <= 1 && Math.abs(out2.y - 46) <= 1, '2. entering from Route 114 (6,46) brings you back out there, not to the (7,4) pocket', JSON.stringify(out2 || await pos(page)));
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
