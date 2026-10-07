// locked_door_test.mjs — a door a script LOCKS can't be walked through.
//
// World.isPassable let the player onto ANY warp cell ("doors are always
// enterable" — FRLG/Emerald put door warps on wall cells and enter them by
// walking in), so a locked door stayed walkable: Goldenrod Underground's
// Basement Key door (Crystal changeblocks a wall over it until you use the key)
// was a free pass to the Warehouse, and so were the Abandoned Ship's Storage Key
// doors, the sealed Regi tombs and Sootopolis's houses in the weather crisis.
// tools/gen_locked_warps.mjs lists the warp cells a script locks; isPassable
// honours their live cell (clear, or a door behavior = open).
//   0. data: the lockable cells, and ordinary doors aren't among them
//   1. the Basement Key door, locked: not passable, walking up stays put
//   2. ...unlocked with the key: passable, walking up goes through
//   3. an ordinary door in the same map is still enterable
//   4. Emerald: the Abandoned Ship Storage Key door is shut until unlocked
//
//   node overworld/tests/locked_door_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9281;
const STATE = { username: 'lockdoor', friendCode: 'LOCKD1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const PARTY = [mon('rattata', 'A')];
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. data =====
{
	const { LOCKED_WARPS } = await import(pathToFileURL(path.join(ROOT, 'overworld', 'locked_warps_data.js')).href);
	const has = (m, c) => (LOCKED_WARPS[m] || []).includes(c);
	A(has('GoldenrodUnderground', '18,6'), '0. the Basement Key door is a lockable warp');
	A(has('AbandonedShip_HiddenFloorCorridors', '3,8') && has('SootopolisCity', '31,32') && has('Route111', '29,87'), '0. ...and so are the Storage Key door, the Sootopolis Gym door and the Desert Ruins seal');
	A(!has('GoldenrodUnderground', '3,2') && !has('PalletTown_PlayersHouse_1F', '3,9'), '0. ordinary doors are not on the list');
}

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
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const scene = async (map, x, y, f, { flags = {}, bag = { pokeball: 5 }, region = 'JOHTO' } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: region, magepunk_name: 'KRIS',
			magepunk_party_v1: PARTY, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars: {} },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	const talk = () => W(async () => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = [];
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return seen;
	});
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(700); };
	const where = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const passable = (x, y) => W((x, y) => window.__ow.world.isPassable(x, y), x, y);

	// ===== 1. locked =====
	await scene('GoldenrodUnderground', 18, 7, 'up');
	A((await passable(18, 6)) === false, '1. the locked Basement Key door is not passable', JSON.stringify(await W(() => window.__ow.world.gridAt(18, 6))));
	await walk('ArrowUp');
	const p1 = await where();
	A(p1.map === 'GoldenrodUnderground' && p1.y === 7, '1. ...walking up into it stays put', JSON.stringify(p1));
	A((await passable(3, 2)) === true, '3. an ordinary door in the same map is still enterable');

	// ===== 2. unlocked with the key =====
	await scene('GoldenrodUnderground', 18, 7, 'up', { bag: { pokeball: 5, basementkey: 1 } });
	await talk();
	A((await passable(18, 6)) === true, '2. with the BASEMENT KEY used, the door is passable');
	await walk('ArrowUp');
	const p2 = await where();
	A(p2.map !== 'GoldenrodUnderground' || p2.y !== 7, '2. ...and walking up goes through', JSON.stringify(p2));

	// ===== 4. Emerald: the Storage Key door =====
	await scene('AbandonedShip_HiddenFloorCorridors', 3, 9, 'up', { region: 'HOENN' });
	A((await passable(3, 8)) === false, "4. the Abandoned Ship's locked Storage Key door is not passable");
	const opened = await W(() => { const w = window.__ow.world; w.setMetatile(3, 8, 'METATILE_InsideShip_IntactDoor_Bottom_Unlocked', 'TRUE'); return w.isPassable(3, 8); });
	A(opened === true, '4. ...the unlocked door (a wall cell with a door behavior) is enterable');

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
