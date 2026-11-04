// rocktunnel_test.mjs — Rock Tunnel is FireRed's map again, and no door strands you.
//
// Playtest 2026-09-26: Route 10's south door into Rock Tunnel landed the player at
// (18,37) of a 30x36 map — outside it, every neighbour void, no way out. Crystal's
// Rock Tunnel shares FireRed's layout ids, so its crystal_native build overwrote
// LAYOUT_ROCK_TUNNEL_1F/_B1F under FireRed's 48x40 events.
// tools/restore_frlg_layouts.py rebuilt them from the decomp's map.bin, and
// warpTo() now refuses a landing with no walkable way into the map and sends the
// player back through the door they came from.
//
//   node overworld/tests/rocktunnel_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- static: no FireRed/Emerald map serves a Crystal-built layout ----------
{
	const D = path.join(ROOT, 'overworld/data');
	const wrong = [];
	for (const f of fs.readdirSync(path.join(D, 'maps')).filter(f => f.endsWith('_map.json'))) {
		const mj = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
		if (mj._crystal_tileset) continue;
		const lp = path.join(D, 'layouts', mj.layout + '.json');
		if (!fs.existsSync(lp)) continue;
		if (JSON.parse(fs.readFileSync(lp, 'utf8'))._source === 'crystal_native') wrong.push(mj.name);
	}
	A(!wrong.length, 'no FireRed/Emerald map serves a Crystal-built layout', wrong.join(','));
	const L = JSON.parse(fs.readFileSync(path.join(D, 'layouts/LAYOUT_ROCK_TUNNEL_1F.json'), 'utf8'));
	A(L.width === 48 && L.height === 40 && L.secondary_tileset === 'gTileset_RockTunnel',
		"Rock Tunnel 1F is FireRed's 48x40 RockTunnel layout", `${L.width}x${L.height} ${L.secondary_tileset}`);
}

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9136;
const STATE = { username: 'rocktun', friendCode: 'ROCKT0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, lead) => {
		if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'rocktun-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true } }, champion: {} }));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE, LEAD);
	const boot = async (map, x, y) => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(1500);
	};
	const where = () => page.evaluate(() => { const W = window.__ow; return { map: W.world.current.name, x: W.player.tx, y: W.player.ty, w: W.world.current.layout.width, h: W.world.current.layout.height }; });
	const step = async (key, ms = 260) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(1600); };
	const openSides = () => page.evaluate(() => {
		const W = window.__ow, w = W.world, p = W.player;
		return [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => w.isPassable(p.tx + dx, p.ty + dy)).length;
	});

	// 1. the reported door: Route 10 south (8,57), walked into from below
	await boot('Route10', 8, 58);
	await step('ArrowUp');
	let at = await where();
	A(at.map === 'RockTunnel_1F', "Route 10's south door leads into Rock Tunnel 1F", JSON.stringify(at));
	A(at.x >= 0 && at.y >= 0 && at.x < at.w && at.y < at.h, '...landing INSIDE the map', JSON.stringify(at));
	A(await openSides() > 0, '...next to a walkable tile', JSON.stringify(at));
	await step('ArrowUp');
	const inside = await where();
	A(inside.map === 'RockTunnel_1F' && inside.y < at.y, 'the player can walk into the cave', JSON.stringify(inside));
	await step('ArrowDown'); await step('ArrowDown');
	at = await where();
	A(at.map === 'Route10', '...and walk back out through the same door', JSON.stringify(at));

	// 2. the north door (8,19)
	await boot('Route10', 8, 20);
	await step('ArrowUp');
	at = await where();
	A(at.map === 'RockTunnel_1F' && at.y < at.h && await openSides() > 0, "Route 10's north door lands on a walkable entrance too", JSON.stringify(at));

	// 3. every Rock Tunnel door on both floors is inside the map with a way in
	const doors = await page.evaluate(async () => {
		const W = window.__ow, out = [];
		for (const m of ['RockTunnel_1F', 'RockTunnel_B1F']) {
			await W.moveToMap(m);
			const w = W.world, L = w.current.layout;
			for (const [i, d] of w.warps.entries()) {
				const inB = d.x >= 0 && d.y >= 0 && d.x < L.width && d.y < L.height;
				const way = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => w.isPassable(d.x + dx, d.y + dy));
				if (!inB || !way) out.push(`${m}#${i}@${d.x},${d.y}`);
			}
		}
		return out;
	});
	A(!doors.length, 'all ten Rock Tunnel doors (1F and B1F) are in bounds and walkable-adjacent', doors.join(' '));

	// 4. the reporter's saved spot, (18,37) on 1F, is a real tile now: a reload frees them
	await boot('RockTunnel_1F', 18, 37);
	at = await where();
	await step('ArrowUp');
	const freed = await where();
	A(at.map === 'RockTunnel_1F' && freed.map === 'RockTunnel_1F' && freed.y < 37,
		'a save parked at (18,37) reloads onto the entrance and can walk in', JSON.stringify({ at, freed }));

	// 5. the guard: a malformed door with no way in sends you back where you came from
	const guard = await page.evaluate(async () => {
		const W = window.__ow;
		await W.moveToMap('Route10');
		W.player.setTile(8, 58);
		const { getJSON } = await import('/overworld/engine.js');           // the page's own module: same cache
		const mj = await getJSON('data/maps/RockTunnel_1F_map.json');     // the cached object world.load reads
		const saved = { ...mj.warp_events[5] };
		Object.assign(mj.warp_events[5], { x: 18, y: 60 });                 // far outside the 48x40 map
		try { await W.warpTo('MAP_ROCK_TUNNEL_1F', '5'); } finally { Object.assign(mj.warp_events[5], saved); }
		return { map: W.world.current.name, x: W.player.tx, y: W.player.ty };
	});
	A(guard.map === 'Route10' && guard.x === 8 && guard.y === 58, 'a door that lands in the void returns the player to the door they used', JSON.stringify(guard));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
