// rocket_elevator_test.mjs — FRLG elevators take you to the floor you chose.
//
// 2026-10-02, Instinct's bug report: the Rocket Hideout lift accepted the Lift
// Key, but riding it to B4F let you out at B4F's STAIR side (11,15), cut off
// from Giovanni. FRLG writes its elevator floors as `setdynamicwarp MAP, 255,
// x, y` (255 = WARP_ID_NONE), and tools/gen_multichoice.mjs read that as
// (MAP, x, y) — x=255 is off the map, so warpTo fell back to the floor's first
// warp. Same for all 19 FRLG floors (Rocket Hideout, Silph Co, Celadon Dept Store).
//   1. data: every restored setdynamicwarp lands on a real tile of its map
//   2. the real lift, B1F -> B4F: the doors let you out at B4F's elevator (20,23)
//
//   node overworld/tests/rocket_elevator_test.mjs
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
const PORT = 9203;
const STATE = { username: 'rocketlift', friendCode: 'RLIFT1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
{
	const overlay = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'multichoice_data.json'), 'utf8'));
	const byId = {};
	for (const f of fs.readdirSync(path.join(DATA, 'maps')).filter(f => f.endsWith('_map.json'))) {
		const m = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8'));
		if (m.id) byId[m.id] = m;
	}
	const warps = [];
	const scan = v => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') { if (v.op === 'setdynamicwarp') warps.push(v); else Object.values(v).forEach(scan); } };
	scan(overlay);
	const bad = [];
	for (const w of warps) {
		const m = byId[w.map];
		if (!m) { bad.push(w.map + ' (no map)'); continue; }
		if (w.x == null) continue;   // by warp id
		const lay = JSON.parse(fs.readFileSync(path.join(DATA, 'layouts', m.layout + '.json'), 'utf8'));
		if (!(w.x >= 0 && w.x < lay.width && w.y >= 0 && w.y < lay.height)) bad.push(`${w.map} (${w.x},${w.y}) outside ${lay.width}x${lay.height}`);
	}
	A(warps.length >= 30 && bad.length === 0, `1. all ${warps.length} restored setdynamicwarps land inside their map`, bad.slice(0, 6).join('; '));
	const b4 = warps.find(w => w.map === 'MAP_ROCKET_HIDEOUT_B4F');
	A(b4 && b4.x === 20 && b4.y === 23 && b4.warp == null, '1. the Rocket lift\'s B4F floor is B4F\'s elevator (20,23)', JSON.stringify(b4));
}

// ===== 2. the real lift =====
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
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const choice = () => page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, list: c.list, options: c.options.slice(), idx: c.idx }; });
	const drive = () => page.evaluate(async () => {
		const C = await import('./choice.js'), O = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 20000) {
			if (C.choiceMenu.open) return 'menu';
			const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
			if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
			if (d) press('z');
			await new Promise(r => setTimeout(r, 40));
		}
		return 'timeout';
	});
	const place = (x, y, facing) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing);
	const waitMap = async m => { for (let i = 0; i < 100 && (await mapName()) !== m; i++) await sleep(100); await sleep(600); return (await mapName()) === m; };
	const key = async k => { await page.keyboard.press(k); await sleep(60); };
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(400); };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=RocketHideout_B1F&x=24&y=26`, { waitUntil: 'domcontentloaded' });
	await boot('RocketHideout_B1F');
	await place(24, 26, 'up');
	await walk('ArrowUp');
	A(await waitMap('RocketHideout_Elevator'), 'setup: B1F\'s elevator doors lead into the lift', JSON.stringify(await pos()));
	// the floor panel (0,2), from below
	await place(0, 3, 'up');
	await key('z');
	const opened = (await drive()) === 'menu';
	const floors = await choice();
	A(opened && JSON.stringify(floors.options) === JSON.stringify(['B1F', 'B2F', 'B4F', 'EXIT']), '2. the panel offers B1F/B2F/B4F/EXIT', JSON.stringify(floors));
	await key('ArrowDown'); await key('ArrowDown'); await key('z');
	A((await drive()) === 'idle', '2. choosing B4F ends the scene');
	await place(1, 4, 'down');
	await walk('ArrowDown');
	A(await waitMap('RocketHideout_B4F'), '2. walking out of the lift lands on B4F', JSON.stringify(await pos()));
	const at = await pos();
	A(at.x >= 20 && at.x <= 21 && at.y >= 22 && at.y <= 23, '2. ...at B4F\'s ELEVATOR side (20,23), not the stair side (11,15) — Giovanni is reachable', JSON.stringify(at));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
