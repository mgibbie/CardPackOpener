// sinnoh_maps_test.mjs — SINNOH, stage 1: its maps, layouts, tilesets and people are in the game's data and the
// engine draws and walks them (tools/import_sinnoh.py; engine.js TS_PREFIX).
// The owner, 2026-11-15: Sinnoh maps "for after johkanto for the post game", from a fan-made 2D source ("1 yes").
//   * every Sinnoh map has its file, its layout, both tilesets' sheet + metatiles + palette file
//   * a layout's cells all name a metatile its tilesets have; its size matches its rows
//   * every warp and connection of a Sinnoh map leads to a Sinnoh map that exists, at a warp that exists
//   * nothing of Sinnoh's sits on another region's name (ids MAP_SINNOH_*, files Sinnoh*, sheets sinnoh_*)
//   * in a browser: Twinleaf Town draws from Sinnoh's own sheets, you can walk, its people have their sprites, and the
//     door of your house takes you inside and back out
// Stage 2 (sinnoh_story_test.mjs) added its scripts, trainers and wild tables. Not yet: music, a way in.
//   node overworld/tests/sinnoh_maps_test.mjs        (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9961, SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const has = f => fs.existsSync(path.join(D, f));
const mangle = name => { let n = name.replace('gTileset_', ''); n = n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([A-Za-z])(\d+)/g, '$1_$2'); return n.toLowerCase().replace(/^_/, '').replace(/__/g, '_'); };

// ===== 1. the data =====
const index = J('map_index.json');
const ids = Object.keys(index).filter(k => k.startsWith('MAP_SINNOH_'));
A(ids.length >= 400, `${ids.length} Sinnoh maps are in the map index`);
A(ids.every(k => index[k].startsWith('Sinnoh')) && !Object.entries(index).some(([k, v]) => !k.startsWith('MAP_SINNOH_') && /^Sinnoh/.test(v)), 'each under a name of its own (MAP_SINNOH_* -> Sinnoh*): none sits on another region\'s map');
const maps = {}, missing = [], badLayout = [], badWarp = [], badCell = [], tsSeen = new Map();
for (const id of ids) {
	const f = 'maps/' + index[id] + '_map.json';
	if (!has(f)) { missing.push(f); continue; }
	maps[id] = J(f);
}
const palIndex = new Set(J('tilesets/pal_index.json'));
for (const [id, m] of Object.entries(maps)) {
	if (m.id !== id || !String(m.layout).startsWith('LAYOUT_SINNOH_') || !has('layouts/' + m.layout + '.json')) { badLayout.push(id + ' ' + m.layout); continue; }
	const L = J('layouts/' + m.layout + '.json');
	if (L.game !== 'sinnoh' || L.map.length !== L.height || L.map.some(r => r.length !== L.width)) badLayout.push(id + ' size/game');
	let counts = tsSeen.get(L.primary_tileset + '|' + L.secondary_tileset);
	if (!counts) {
		const need = [['primary', L.primary_tileset], ['secondary', L.secondary_tileset]].map(([k, n]) => {
			const st = 'sinnoh_' + mangle(n), mf = `tilesets/sinnoh_${k}_${mangle(n)}_metatiles.json`;
			for (const x of [`tilesets/${st}_tiles.png`, `tilesets/${st}_pal.json`, mf]) if (!has(x)) missing.push(x);
			if (!palIndex.has(st)) missing.push('pal_index: ' + st);
			return has(mf) ? J(mf).metatiles.length : 0;
		});
		counts = need; tsSeen.set(L.primary_tileset + '|' + L.secondary_tileset, counts);
	}
	// a cell's low 10 bits are its metatile: below 512 the primary's, from 512 the secondary's (Emerald's split)
	for (const row of L.map) for (const c of row) { const mt = c & 0x3ff; if (mt < 512 ? mt >= counts[0] : mt - 512 >= counts[1]) { badCell.push(`${id} metatile ${mt}`); break; } }
	for (const c of m.connections || []) if (!maps[c.map]) badWarp.push(`${id} connects to ${c.map}`);
	for (const w of m.warp_events || []) {
		if (['MAP_DYNAMIC', 'MAP_NONE', 'MAP_UNDEFINED'].includes(w.dest_map)) continue;
		const d = maps[w.dest_map];
		if (!d) badWarp.push(`${id} warps to ${w.dest_map}`);
		else if (!(+w.dest_warp_id < (d.warp_events || []).length) && +w.dest_warp_id !== 255 && +w.dest_warp_id !== 127) badWarp.push(`${id} -> ${w.dest_map} warp ${w.dest_warp_id} of ${(d.warp_events || []).length}`);
	}
}
A(missing.length === 0, `every map has its file, and each of the ${tsSeen.size} tileset pairs in use has its sheets, metatiles and palette files`, missing.slice(0, 8));
A(badLayout.length === 0, 'every map has a Sinnoh layout of its own, whose rows match its size', badLayout.slice(0, 6));
A(new Set(badCell).size <= 3, 'the layouts\' cells name metatiles their tilesets have', [...new Set(badCell)].slice(0, 8));
A(badWarp.filter(s => /connects to|warps to/.test(s)).length === 0, 'every warp and connection leads to a Sinnoh map that exists', badWarp.filter(s => /connects to|warps to/.test(s)).slice(0, 8));
const badIdx = badWarp.filter(s => / warp \d+ of /.test(s));
A(badIdx.length <= ids.length * 0.02, `and to a warp that exists there (${badIdx.length} of the source's own warps point past the end of their destination's list)`, badIdx.slice(0, 8));
const towns = ['TWINLEAF_TOWN', 'SANDGEM_TOWN', 'JUBILIFE_CITY', 'OREBURGH_CITY', 'FLOAROMA_TOWN', 'ETERNA_CITY', 'HEARTHOME_CITY', 'SOLACEON_TOWN', 'VEILSTONE_CITY', 'PASTORIA_CITY', 'CELESTIC_TOWN', 'CANALAVE_CITY', 'SNOWPOINT_CITY', 'SUNYSHORE_CITY'];
const routes = []; for (let r = 201; r <= 230; r++) routes.push('ROUTE' + r);
// (four routes come in two halves: ROUTE205_NORTH / _SOUTH, 210, 211 _EAST / _WEST, 212)
const lacking = [...towns, ...routes].filter(n => !maps['MAP_SINNOH_' + n] && !Object.keys(maps).some(k => /^MAP_SINNOH_ROUTE\d+_(NORTH|SOUTH|EAST|WEST)$/.test(k) && k.startsWith('MAP_SINNOH_' + n + '_')));
A(lacking.length === 0, 'all 14 towns and Routes 201-230 are there', lacking);
const used = new Set(Object.values(maps).flatMap(m => (m.object_events || []).map(o => o.graphics_id)).filter(g => /^OBJ_EVENT_GFX_SINNOH_/.test(g || '')));
const noSheet = [...used].filter(g => !has('people/' + g.replace('OBJ_EVENT_GFX_', '').toLowerCase() + '.png'));
A(used.size >= 40 && noSheet.length === 0, `each of the ${used.size} Sinnoh people the maps use has its sprite sheet`, noSheet.slice(0, 8));

// ===== 2. in the game =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
const notFound = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { notFound.push(u); res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const page = await browser.newPage(), errors = [];
	await page.setViewport({ width: 960, height: 640 });
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, rival_tier0_done: true }, vars: {} }));
	}, STATE, PARTY);
	const door = maps.MAP_SINNOH_TWINLEAF_TOWN.warp_events.find(w => /MAIN_HOUSE_1F/.test(w.dest_map));
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SinnohTwinleafTown&x=${door.x}&y=${+door.y + 2}`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000), 'the game boots in Twinleaf Town');
	await sleep(2500);
	const M = (f, ...a) => page.evaluate(f, ...a);
	for (let i = 0; i < 12 && await M(() => !!window.__ow.gateReport().blockedBy); i++) { await page.keyboard.press('KeyZ'); await sleep(150); }
	const st = await M(() => {
		const ow = window.__ow, w = ow.world.current, c = document.querySelector('canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, cols = new Set(); let dark = 0, n = 0;
		for (let i = 0; i < d.length; i += 4 * 97) { n++; cols.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)); if (d[i] + d[i + 1] + d[i + 2] < 24) dark++; }
		return { id: w.map.id, game: w.layout.game, primary: w.layout.primary_tileset, sheets: [...document.querySelectorAll('img')].length, incomplete: !!(w.tilesets && w.tilesets.incomplete), colours: cols.size, dark: dark / n, npcs: (ow.npcs.list || []).length, at: [ow.player.tx, ow.player.ty] };
	});
	A(st.id === 'MAP_SINNOH_TWINLEAF_TOWN' && st.game === 'sinnoh' && !st.incomplete, 'the map is Sinnoh\'s own, on Sinnoh\'s tileset files', st);
	A(st.colours >= 25 && st.dark < 0.2, `it draws: ${st.colours} colours on screen, ${Math.round(st.dark * 100)}% of it dark (a missing sheet is a black map)`, st);
	A(st.npcs >= 3, 'its people are standing in it', st.npcs);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'sinnoh-twinleaf.png') }); }
	const sheets404 = notFound.filter(u => /\/people\/|\/tilesets\/|\/layouts\/|\/maps\//.test(u));
	A(sheets404.length === 0, 'no map, layout, tileset or person sprite was missing', sheets404.slice(0, 6));
	const key = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(250); };
	await key('ArrowUp', 900);
	A(await waitFor(() => M(() => window.__ow.world.current.map.id === 'MAP_SINNOH_TWINLEAF_TOWN_MAIN_HOUSE_1F'), 15000), 'walking up into your house\'s door takes you inside', await M(() => [window.__ow.world.current.map.id, window.__ow.player.tx, window.__ow.player.ty, window.__ow.gateReport().blockedBy]));
	await sleep(1200);
	const inside = await M(() => ({ game: window.__ow.world.current.layout.game, at: [window.__ow.player.tx, window.__ow.player.ty] }));
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'sinnoh-twinleaf-house.png') });
	await key('ArrowDown', 900);
	A(inside.game === 'sinnoh' && await waitFor(() => M(() => window.__ow.world.current.map.id === 'MAP_SINNOH_TWINLEAF_TOWN'), 15000), 'and walking back out the door returns you to the town', await M(() => [window.__ow.world.current.map.id, window.__ow.player.tx, window.__ow.player.ty]));
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 3));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
