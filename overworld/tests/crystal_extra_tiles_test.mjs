// crystal_extra_tiles_test.mjs — Crystal changeblocks to blocks no map uses now apply.
//
// A map callback's `changeblock x, y, $BLOCK` needs that block's converted grid
// cells. tools/crystal_blocks.mjs could only learn them from a converted map where
// the block appears, so 32 changeblocks could not be built and their callbacks
// were withdrawn whole (all-or-nothing): Route 19's rocks, the Elite Four rooms'
// doors, the Ruins chambers' walls, Blackthorn Gym's boulder floor... The
// converter rendered EVERY block of each tileset (art and metatiles all exist);
// tools/gen_crystal_block_cells.mjs recomputes the missing block -> cells from
// the decomp with the converter's own code (validated against all 29 harvested
// blocks; shipped sheets pixel-identical).
//   1. Route 19: rocks while EVENT_CINNABAR_ROCKS_CLEARED is clear, none once set
//   2. Bruno's room: the exit block opens (walkable) once EVENT_BRUNOS_ROOM_EXIT_OPEN
//   3. the Kabuto chamber's hidden wall stays shut until EVENT_WALL_OPENED_IN_KABUTO_CHAMBER
// Each changed cell must draw a real metatile of the map's own tileset.
//
//   node overworld/tests/crystal_extra_tiles_test.mjs
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
const PORT = 9233;
const STATE = { username: 'crtiles', friendCode: 'CRTL01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 60, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 180, atk: 110, def: 105, spa: 100, spd: 100, spe: 131 }, maxHP: 180, curHP: 180, exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 }];
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
// boot `map` with these story flags set; return what the block at (bx,by) holds
async function boot(map, flags, bx, by) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, flags) => {
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		const f = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
		for (const k of flags) f[k] = true;
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: f, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, flags);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${bx}&y=${by + 3}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	const r = await page.evaluate((bx, by) => {
		const w = window.__ow.world, mt = w.current.ts?.primary?.metatiles || [];
		const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => w.gridAt(bx + dx, by + dy));
		const drawn = cells.every(v => { const m = mt[v & 0x3ff]; return Array.isArray(m) && m.some(t => t !== 0); });
		return { cells, walk: [[0, 1], [1, 1]].map(([dx, dy]) => w.isPassable(bx + dx, by + dy)), drawn, ts: w.current.layout.primary_tileset };
	}, bx, by);
	r.errors = errors;
	await ctx.close();
	return r;
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ROCK = [130, 131, 132, 133];

	// ===== 1. Route 19's rocks =====
	{
		const blocked = await boot('JohKantoRoute19', [], 6, 6);
		A(blocked.cells.join() === ROCK.join(), '1. Route 19: rocks block the way while the rocks are not cleared', JSON.stringify(blocked));
		A(blocked.drawn, '1. ...drawn from real metatiles of ' + blocked.ts);
		const clear = await boot('JohKantoRoute19', ['EVENT_CINNABAR_ROCKS_CLEARED'], 6, 6);
		A(clear.cells.join() !== ROCK.join(), '1. ...and gone once EVENT_CINNABAR_ROCKS_CLEARED', JSON.stringify(clear.cells));
	}

	// ===== 2. Bruno's room: the exit opens =====
	{
		const shut = await boot('BrunosRoom', ['EVENT_BRUNOS_ROOM_ENTRANCE_CLOSED'], 4, 2);
		const open = await boot('BrunosRoom', ['EVENT_BRUNOS_ROOM_ENTRANCE_CLOSED', 'EVENT_BRUNOS_ROOM_EXIT_OPEN'], 4, 2);
		A(open.cells.join() === '17,17,7,7' && shut.cells.join() !== open.cells.join(), '2. Bruno\'s exit block changes once EVENT_BRUNOS_ROOM_EXIT_OPEN', JSON.stringify({ shut: shut.cells, open: open.cells }));
		A(open.walk.every(Boolean) && open.drawn, '2. ...to a walkable, real-metatile doorway', JSON.stringify(open));
	}

	// ===== 3. the Kabuto chamber's hidden wall =====
	{
		const shut = await boot('RuinsOfAlphKabutoChamber', [], 4, 0);
		A(shut.cells.join() === '3109,3089,9,9' && shut.drawn, '3. the Kabuto chamber\'s back wall is closed (decomp block $2e) and drawn', JSON.stringify(shut));
		const opened = await boot('RuinsOfAlphKabutoChamber', ['EVENT_WALL_OPENED_IN_KABUTO_CHAMBER'], 4, 0);
		A(opened.cells.join() !== shut.cells.join(), '3. ...and not once the wall is opened', JSON.stringify(opened.cells));
		A(!shut.errors.length && !opened.errors.length, 'no page errors', JSON.stringify([...shut.errors, ...opened.errors].slice(0, 3)));
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
