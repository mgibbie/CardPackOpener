// crystal_side_walls_test.mjs — Crystal's side walls (the rims of cave rooms and ledges) are walls here too.
//
// Tester report (instinctgauntlet, 2026-11-11, bug:1794386083338): in Tohjo Falls you could step DOWN off the entrance
// floor at (12,15) onto (12,16), walk along the bottom of the cave and come up at the east exit: Route 27 west to east
// with no Surf and no Waterfall. In Crystal (12,16) is COLL_UP_WALL: floor with a wall along its top edge, which you can
// neither enter from above nor leave upwards (home/map.asm GetMovementPermissions). The port had no side walls at all,
// so the bottom rim of every cave room was plain floor, and on 19 maps you could walk round the outside of the rooms.
//
// overworld/crystal_side_walls.json is generated from pokecrystal's own collision (tools/gen_crystal_collision_fix.mjs)
// and read by World.edgeBlocked (engine.js). This test needs no pokecrystal checkout: the generated file and the maps.
//   1. the file: Tohjo Falls' rim is there, every wall is on a cell of its map, edges are 1 / 2 / 4 / 8 bits
//   2. Tohjo Falls, by the engine's own rule: neither exit reaches the cave's bottom row any more (both did), each exit
//      still has floor to stand on
//   3. the maps the walls change: the exits that the real game joins stay joined (Mount Moon's Route 3 and Route 4,
//      Ice Path's two halves, Diglett's Cave's two ends each with its ladder …), the rooms it separates are separate
//   4. in a browser, real keys: down from (12,15) bumps; so does down from (22,15) on the east side; walking the
//      entrance floor still works
//
//   node overworld/tests/crystal_side_walls_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9442;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---------------------------------------------------------------- 1. the file
const SW = J(path.join(ROOT, 'overworld', 'crystal_side_walls.json')).maps;
const INDEX = J(path.join(DATA, 'map_index.json'));
const fileOf = (id) => { const e = INDEX[id]; return typeof e === 'string' ? e : e && (e.file || e.name); };
const COLL = 0x0C00;
/** A map as the engine walks it: its grid, its warps, its walls. */
function load(id) {
	const name = fileOf(id); if (!name) return null;
	const map = J(path.join(DATA, 'maps', name + '_map.json')), layout = J(path.join(DATA, 'layouts', map.layout + '.json'));
	const grid = layout.map, H = grid.length, W = grid[0].length;
	const warps = (map.warp_events || []).map((w) => ({ x: +w.x, y: +w.y, to: String(w.dest_map) }));
	const isWarp = new Set(warps.map((w) => w.x + ',' + w.y));
	const walls = new Map((SW[id] || []).map(([x, y, e]) => [x + ',' + y, e]));
	const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] != null && ((grid[y][x] & COLL) === 0 || isWarp.has(x + ',' + y));
	// World.edgeBlocked's rule: a wall along the edge you would cross, on your tile or on the one you would enter
	const E = [[1, 0, 1, 2], [-1, 0, 2, 1], [0, -1, 4, 8], [0, 1, 8, 4]];
	const reach = (from, useWalls = true) => { const seen = new Set([from.x + ',' + from.y]), q = [[from.x, from.y]]; for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy, own, opp] of E) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || !open(nx, ny)) continue; if (useWalls && (((walls.get(x + ',' + y) || 0) & own) || ((walls.get(k) || 0) & opp))) continue; seen.add(k); q.push([nx, ny]); } } return seen; };
	const joined = (a, b, useWalls = true) => reach(warps[a], useWalls).has(warps[b].x + ',' + warps[b].y);
	return { name, W, H, grid, warps, walls, open, reach, joined };
}
{
	const ids = Object.keys(SW), cells = ids.reduce((n, k) => n + SW[k].length, 0);
	A(ids.length >= 60 && cells >= 1500, `the walls are generated: ${cells} cells on ${ids.length} maps`);
	const T = SW.MAP_TOHJO_FALLS || [];
	A(T.some(([x, y, e]) => x === 12 && y === 16 && e === 4) && T.some(([x, y, e]) => x === 22 && y === 16 && e === 4), 'Tohjo Falls: (12,16) and (22,16) have a wall along their top edge, as in Crystal (COLL_UP_WALL)');
	const bad = [];
	for (const id of ids) { const m = load(id); if (!m) { bad.push(id + ': no such map'); continue; } for (const [x, y, e] of SW[id]) { if (!(x >= 0 && y >= 0 && x < m.W && y < m.H)) bad.push(`${id}: (${x},${y}) is off the map`); else if (!(e > 0 && e < 16)) bad.push(`${id}: (${x},${y}) edges ${e}`); } }
	A(bad.length === 0, 'every wall is on a cell of its own map, with edges of 1 (right), 2 (left), 4 (up), 8 (down)', bad.slice(0, 5));
}

// ---------------------------------------------------------------- 2. Tohjo Falls by the engine's rule
{
	const m = load('MAP_TOHJO_FALLS');
	A(m.warps.length === 2 && m.joined(0, 1, false), 'Tohjo Falls without its walls: west and east exits are joined along the cave\'s bottom (the bug)');
	const bottom = (r) => [...r].filter((k) => +k.split(',')[1] >= 17).length;   /* (this walk takes water for floor, so the falls themselves still join the exits: what must be gone is the way along the cave's bottom row) */
	A(bottom(m.reach(m.warps[0], false)) > 10 && bottom(m.reach(m.warps[0])) === 0 && bottom(m.reach(m.warps[1])) === 0, '…with them: neither exit reaches the bottom row of the cave any more (the way across is the water: Surf and the Waterfall)', [bottom(m.reach(m.warps[0], false)), bottom(m.reach(m.warps[0])), bottom(m.reach(m.warps[1]))]);
	A(m.reach(m.warps[0]).size >= 4 && m.reach(m.warps[1]).size >= 4, 'each exit still has floor to stand and walk on', [m.reach(m.warps[0]).size, m.reach(m.warps[1]).size]);
	A(!m.reach(m.warps[0]).has('12,16') && !m.reach(m.warps[0]).has('12,17'), 'the tester\'s first step, down from (12,15) onto (12,16), is not there to take');
}

// ---------------------------------------------------------------- 3. the real game's routes stay; its separate rooms are separate
{
	const byDest = (m, re, nth = 0) => m.warps.map((w, i) => (re.test(w.to) ? i : -1)).filter((i) => i >= 0)[nth];
	const mm = load('MAP_MOUNT_MOON'), r3 = byDest(mm, /ROUTE_3$/), r4 = byDest(mm, /ROUTE_4$/), sq = byDest(mm, /MOUNT_MOON_SQUARE/);
	A(mm.joined(r3, r4) && mm.joined(r4, r3), 'Mount Moon: Route 3 and Route 4 are still joined on foot (the way through)');
	A(mm.joined(r3, sq, false) && !mm.joined(r3, sq), '…and its square is no longer reached round the outside (the ladders lead there)');
	const ip = load('MAP_ICE_PATH_1F'), r44 = byDest(ip, /ROUTE_44/), bt = byDest(ip, /BLACKTHORN/);
	A(!ip.joined(r44, bt) && ip.warps.some((w, i) => /ICE_PATH_B1F/.test(w.to) && ip.joined(r44, i)) && ip.warps.some((w, i) => /ICE_PATH_B1F/.test(w.to) && ip.joined(bt, i)), 'Ice Path 1F: its two halves are separate, each with its own way down (the path goes through the floors below)');
	const dc = load('MAP_DIGLETTS_CAVE'), ver = byDest(dc, /VERMILION/), r2 = byDest(dc, /ROUTE_2/);
	A(!dc.joined(ver, r2) && dc.warps.some((w, i) => /DIGLETTS_CAVE/.test(w.to) && dc.joined(ver, i)) && dc.warps.some((w, i) => /DIGLETTS_CAVE/.test(w.to) && dc.joined(r2, i)), "Diglett's Cave: each end's hut has its ladder; the tunnel between them is the only way across");
	const uc = load('MAP_UNION_CAVE_B1F');
	A(uc.warps.some((w, i) => /UNION_CAVE_1F/.test(w.to) && uc.warps.some((v, j) => /RUINS_OF_ALPH/.test(v.to) && uc.joined(i, j))), 'Union Cave B1F: the Ruins of Alph are still reached from 1F');
	// no map loses an exit altogether: each warp can still be walked away from, or was already walled in
	const shut = [];
	for (const id of Object.keys(SW)) { const m = load(id); m.warps.forEach((w, i) => { const before = m.reach(w, false).size, after = m.reach(w).size; if (before > 1 && after <= 1) shut.push(`${m.name} warp ${i} (${w.x},${w.y})`); }); }
	A(shut.length === 0, 'no exit of any map is walled in by them', shut.slice(0, 6));
}

// ---------------------------------------------------------------- 4. in a browser, real keys
const STATE = { username: 'sidewall', friendCode: 'SIDEWA', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 220, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 220, curHP: 220, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19 }];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
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
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const pos = () => W(() => ({ map: window.__ow.world.current && window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty, out: window.__ow.player.moveOutcome }));
	const at = async (x, y, facing) => { await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; P.moving = false; }, x, y, facing); await sleep(150); };
	const walk = async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(450); };
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=TohjoFalls&x=13&y=15`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'TohjoFalls')).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	const eb = await W(() => { const w = window.__ow.world; if (!w.edgeBlocked) return { has: false }; return { has: !!(w.current.map.sideWalls && w.current.map.sideWalls.size), a: w.edgeBlocked(12, 15, 'down'), b: w.edgeBlocked(12, 16, 'up'), c: w.edgeBlocked(12, 15, 'left'), d: w.edgeBlocked(12, 16, 'left') }; });
	A(eb.has && eb.a && eb.b && !eb.c && !eb.d, 'the engine has the walls: (12,15) down and (12,16) up are barred, sideways along either is not', eb);
	await at(12, 15, 'down');
	await walk('ArrowDown', 500);
	let p = await pos();
	A(p.map === 'TohjoFalls' && p.x === 12 && p.y === 15, 'real keys: down from (12,15) bumps (the tester\'s first step off the entrance floor)', p);
	await at(22, 15, 'down');
	await walk('ArrowDown', 500);
	p = await pos();
	A(p.x === 22 && p.y === 15, '…and down from (22,15), on the east side, bumps too', p);
	await at(13, 15, 'left');
	await walk('ArrowLeft', 260);
	p = await pos();
	A(p.x < 13 && p.y === 15 && p.map === 'TohjoFalls', 'walking along the entrance floor still works', p);
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
