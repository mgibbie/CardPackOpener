// crystal_callbacks_test.mjs — pokecrystal's map callbacks run as the map loads.
//
// The port ran ONE of pokecrystal's 103 map callbacks (the Goldenrod move tutor,
// 2026-10-05). The Day-of-Week siblings never came and went, and every TILES
// callback (doors, stairs, staircases opening on story flags) had also lost its
// `changeblock` in transpile. tools/gen_crystal_callbacks.mjs now lists 82 of them
// (crystal_callbacks.json, with a reasoned deny-list), and
// tools/gen_crystal_scriptvar.mjs restores their changeblocks (whole callbacks only).
//   1. OBJECTS: Monica of Monday is on Route 40 on a Monday, and not on a Tuesday
//   2. TILES: Team Rocket HQ B3F — Giovanni's office door is open once
//      EVENT_OPENED_DOOR_TO_GIOVANNIS_OFFICE is set, and shut until then
//   3. a denied callback (Tin Tower 1F's stairs) does NOT run
//
//   node overworld/tests/crystal_callbacks_test.mjs
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
const PORT = 9230;
const STATE = { username: 'cbtest', friendCode: 'CBTS01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
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
async function boot(map, { day = 1, flags = {} } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, day, flags) => {
		const getDay = Date.prototype.getDay;
		Date.prototype.getDay = function () { return day; };   // force the weekday
		void getDay;
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, day, flags);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1500);
	return { page, ctx, errors };
}
const monicaHere = p => p.evaluate(() => window.__ow.npcs.list.some(n => n.ev && n.ev.x === 8 && n.ev.y === 10));
const grid = (p, cells) => p.evaluate(cs => cs.map(([x, y]) => window.__ow.world.current.layout.map[y][x]), cells);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// 1. Monica of Monday
	{
		const mon = await boot('Route40', { day: 1 });
		A(await monicaHere(mon.page), '1. Monday: Monica is on Route 40');
		A(mon.errors.length === 0, '1. no page errors (Monday)', JSON.stringify(mon.errors.slice(0, 3)));
		await mon.ctx.close();
		const tue = await boot('Route40', { day: 2 });
		A(!(await monicaHere(tue.page)), '1. Tuesday: she isn\'t');
		await tue.ctx.close();
	}

	// 2. TILES: Giovanni's office door
	{
		const DOOR = [[10, 9], [11, 9]];
		const shut = await boot('TeamRocketBaseB3F', {});
		const before = await grid(shut.page, DOOR);
		await shut.ctx.close();
		const open = await boot('TeamRocketBaseB3F', { flags: { EVENT_OPENED_DOOR_TO_GIOVANNIS_OFFICE: true } });
		const after = await grid(open.page, DOOR);
		const passable = await open.page.evaluate(cs => cs.every(([x, y]) => window.__ow.world.isPassable(x, y)), DOOR);
		A(JSON.stringify(after) !== JSON.stringify(before) && passable, '2. with EVENT_OPENED_DOOR_TO_GIOVANNIS_OFFICE the office door is open (changeblock ran)', JSON.stringify({ before, after, passable }));
		A(open.errors.length === 0, '2. no page errors', JSON.stringify(open.errors.slice(0, 3)));
		await open.ctx.close();
	}

	// 3. a denied callback doesn't run
	{
		const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_callbacks.json'), 'utf8'));
		A(!(table.callbacks.TinTower1F || []).some(([, l]) => /Stairs/.test(l)) && /RAINBOW WING/.test(table.denied['TinTower1F:TinTower1FStairsCallback'] || ''), '3. Tin Tower 1F\'s stairs callback is denied, with its reason');
		A(Object.values(table.callbacks).reduce((n, l) => n + l.length, 0) >= 80, '3. 80+ callbacks run in all');
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
