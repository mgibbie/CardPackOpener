// flymap_test.mjs — the FLY MAP: a page for each region, each listing every place that region can be flown to.
// The owner, 2026-11-16: "we need a comprehensive fly map with different page for each region".
//   * six pages: Kanto, the Sevii Isles, Johto, Kanto (past), Hoenn, Sinnoh
//   * comprehensive: beside the towns, FireRed's two roadside Centers and its seven islands, Crystal's Lake of Rage
//     and Mt. Silver, old Kanto's Pallet Town, Hoenn's Battle Frontier, Sinnoh's eighteen
//   * every destination is a map that exists, lands inside it on a walkable tile, has its dot, and (on a page with
//     map art) its marker inside the art; no map is on two pages
//   * in a browser: the map opens on the page of the region you are in (a route is no fly point: it used to open
//     Kanto's), the tabs fit, the list shows every place and scrolls with the selection, a row can be clicked, an
//     unvisited place cannot be flown to, a visited one can, and where you stand is marked HERE
//   node overworld/tests/flymap_test.mjs        (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { FLY, REGION_ORDER, REGION_LABEL, REGION_OF, POS, GRID, IMG, markerPx } from '../flydata.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9975, SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

// ===== 1. the pages =====
A(JSON.stringify(REGION_ORDER) === JSON.stringify(['kanto', 'sevii', 'johto', 'johkanto', 'hoenn', 'sinnoh']) && REGION_ORDER.every(r => REGION_LABEL[r] && GRID[r] && (FLY[r] || []).length > 0),
	'six pages, a region each: ' + REGION_ORDER.map(r => `${REGION_LABEL[r]} (${(FLY[r] || []).length})`).join(', '));
const names = r => FLY[r].map(t => t.name);
A(['Route 4 (Mt. Moon)', 'Route 10 (Rock Tunnel)', 'Indigo Plateau'].every(n => names('kanto').includes(n)) && FLY.sevii.length === 7
	&& ['Lake of Rage', 'Mt. Silver'].every(n => names('johto').includes(n)) && names('johkanto').includes('Pallet Town')
	&& names('hoenn').includes('Battle Frontier') && FLY.sinnoh.length === 18,
	"comprehensive: the roadside Centers, the seven islands, Lake of Rage and Mt. Silver, old Pallet, the Battle Frontier, Sinnoh's eighteen");
const index = J('map_index.json'), bad = [], seenMaps = new Map();
for (const r of REGION_ORDER) for (const t of FLY[r]) {
	if (seenMaps.has(t.map)) bad.push(`${t.name}: also on ${seenMaps.get(t.map)}`);
	seenMaps.set(t.map, r);
	if (!index[t.map]) { bad.push(`${t.name}: no map ${t.map}`); continue; }
	const m = J(`maps/${index[t.map]}_map.json`), L = J(`layouts/${m.layout}.json`);
	if (!(t.x >= 0 && t.y >= 0 && t.x < L.width && t.y < L.height)) { bad.push(`${t.name}: lands outside the map`); continue; }
	// (Crystal's layouts are blocks, not cells with a collision bit: in bounds is what can be checked here)
	if (!m._crystal_tileset && ((L.map[t.y][t.x] >> 10) & 3)) bad.push(`${t.name}: lands on a wall`);
	if (!POS[t.map]) bad.push(`${t.name}: no dot`);
	else if (!(POS[t.map][0] >= 0 && POS[t.map][0] < GRID[r].w && POS[t.map][1] >= 0 && POS[t.map][1] < GRID[r].h)) bad.push(`${t.name}: dot off the grid`);
	if (IMG[r]) { const p = markerPx(r, t.map); if (!p || !(p[0] >= 0 && p[1] >= 0 && p[0] < IMG[r].w && p[1] < IMG[r].h)) bad.push(`${t.name}: marker off the art`); }
	if (REGION_OF[t.map] !== r) bad.push(`${t.name}: REGION_OF`);
}
A(bad.length === 0, `each of the ${seenMaps.size} destinations is a real map, lands in it on a walkable tile, has its dot (and its marker on the art), and is on one page only`, bad.slice(0, 8));
const art = REGION_ORDER.filter(r => IMG[r]), noArt = art.filter(r => !fs.existsSync(path.join(D, IMG[r].file)));
A(art.includes('sinnoh') && noArt.length === 0, `pages with map art: ${art.join(', ')} (Sinnoh's is its own region map); each file exists`, noArt);

// ===== 2. in the game =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgeot', name: 'PIDGEOT', level: 90, gender: 'M', friend: 70, types: ['Normal', 'Flying'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300, exp: 729000, moves: [{ id: 'fly', name: 'Fly', pp: 15, maxPp: 15 }], num: 18 }];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (map, visited, region) => {
		const page = await (await browser.createBrowserContext()).newPage(); page.errors = [];
		await page.setViewport({ width: 960, height: 640 });
		page.on('pageerror', e => page.errors.push(e.message));
		await page.evaluateOnNewDocument((st, party, visited, region) => {
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_flypoints', JSON.stringify(visited));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: {}, champion: { KANTO: true, JOHTO: true, HOENN: true, JOHKANTO: true } }));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, story_seeded: true, newgame_flags_seeded: true, rival_tier0_done: true, sinnoh_starter_given: true }, vars: {} }));
		}, STATE, PARTY, visited, region);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000);
		await sleep(2300);
		for (let i = 0; i < 40 && await page.evaluate(() => !!window.__ow.gateReport().blockedBy); i++) { await page.keyboard.press('KeyZ'); await sleep(220); }
		return page;
	};
	const openMap = page => page.evaluate(async () => { (await import('/overworld/ow_music.js')).openTownMap(); await new Promise(r => setTimeout(r, 500)); });
	const state = page => page.evaluate(async () => {
		const F = await import('/overworld/flydata.js'), st = (await import('/overworld/ow_menustate.js')).townMap, ow = window.__ow, c = document.querySelector('canvas');
		const ui = ow.menuUi || [], tabs = ui.filter(b => /^townreg:/.test(b.id)), rows = ui.filter(b => /^town:/.test(b.id) && b.w > 100), dots = ui.filter(b => /^town:/.test(b.id) && b.w <= 100);
		return { open: st.open, page: F.REGION_ORDER[st.region], idx: st.idx, flash: st.flash || null, tabs: tabs.map(b => b.label), tabsFit: tabs.every(b => b.x >= 0 && b.x + b.w <= c.width + 1 && b.w > 60),
			rows: rows.map(b => +b.id.split(':')[1]), rowBox: rows.map(b => [b.x, b.y, b.w, b.h]), dots: dots.length, fly: ui.some(b => b.id === 'townfly'), n: F.FLY[F.REGION_ORDER[st.region]].length, cw: c.width, ch: c.height };
	});

	// --- on a Sinnoh ROUTE: Sinnoh's page ---
	{
		const visited = ['MAP_SINNOH_SANDGEM_TOWN', 'MAP_SINNOH_JUBILIFE_CITY', 'MAP_SINNOH_SUNYSHORE_CITY', 'MAP_PALLET_TOWN'];
		const page = await open('SinnohRoute202', visited, 'hoenn');
		await openMap(page);
		let s = await state(page);
		A(s.open && s.page === 'sinnoh', "opened on a Sinnoh route, the map shows Sinnoh's page (a route is no fly point: it used to show Kanto's)", s.page);
		A(s.tabs.length === 6 && s.tabsFit && s.tabs.includes('SEVII ISLES') && s.tabs.includes('SINNOH'), 'six page tabs, all on screen', s.tabs);
		A(s.dots === 18 && s.rows.length >= 6 && s.rows.length < 18 && s.rows[0] === 0, `the list shows the first ${s.rows.length} of Sinnoh's 18 places, and the map all 18 dots`, [s.rows, s.dots]);
		if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'flymap-sinnoh.png') }); }
		for (let i = 0; i < 17; i++) { await page.keyboard.press('ArrowDown'); await sleep(60); }
		await sleep(300); s = await state(page);
		A(s.idx === 17 && s.rows.includes(17) && !s.rows.includes(0), 'moving down to the last place scrolls the list with the selection', [s.idx, s.rows]);
		A(!s.fly, 'a place not yet visited (the Resort Area) offers no FLY button');
		await page.keyboard.press('KeyZ'); await sleep(300); s = await state(page);
		A(s.open && /visited/i.test(s.flash || ''), 'and Z on it says so, and stays on the map', s.flash);
		// click the row of a visited place
		await page.keyboard.press('ArrowUp'); await sleep(80); await page.keyboard.press('ArrowUp'); await sleep(80); await page.keyboard.press('ArrowUp'); await sleep(250);
		s = await state(page);
		const k = s.rows.indexOf(13);   // Sunyshore City
		A(k >= 0, 'Sunyshore City is in view', s.rows);
		const rect = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.left, c.top, c.width, c.height]; });
		const [bx, by, bw, bh] = s.rowBox[k];
		await page.mouse.click(rect[0] + (bx + bw / 2) * rect[2] / s.cw, rect[1] + (by + bh / 2) * rect[3] / s.ch); await sleep(350);
		s = await state(page);
		A(s.idx === 13 && s.fly, 'clicking its row selects it, and a visited place offers FLY', [s.idx, s.fly]);
		await page.keyboard.press('KeyZ'); await sleep(500);
		const ask = await page.evaluate(() => { const d = window.__ow.dialog; return [(await0 => await0)(d && d.pages ? d.pages.flat().join(' ') : ''), window.__ow.gateReport().blockedBy]; });
		A(/Fly to Sunyshore City\?/.test(ask[0]), 'Z asks "Fly to Sunyshore City?"', ask);
		// (the first Z may only finish printing the question)
		for (let i = 0; i < 4 && await page.evaluate(() => !!window.__ow.dialog.blocking); i++) { await page.keyboard.press('KeyZ'); await sleep(350); }
		A(await waitFor(() => page.evaluate(() => window.__ow.world.current.map.id === 'MAP_SINNOH_SUNYSHORE_CITY'), 20000), 'Z, then yes, flies you to Sunyshore City', await page.evaluate(() => window.__ow.world.current.map.id));
		await sleep(1200);
		for (let i = 0; i < 10 && await page.evaluate(() => !!window.__ow.gateReport().blockedBy); i++) { await page.keyboard.press('KeyZ'); await sleep(220); }
		await openMap(page); s = await state(page);
		A(s.page === 'sinnoh' && s.idx === 13, 'opened there, the map is on Sinnoh with Sunyshore selected: where you are', [s.page, s.idx]);
		// the pages turn, each with its own list
		const pages = [];
		for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await sleep(250); const q = await state(page); pages.push(`${q.page}:${q.n}:${q.dots}`); }
		A(JSON.stringify(pages.map(p => p.split(':')[0])) === JSON.stringify(['kanto', 'sevii', 'johto', 'johkanto', 'hoenn', 'sinnoh']) && pages.every(p => { const [, n, d] = p.split(':'); return n === d; }), '◄► turns the pages in order, each drawing a dot for every one of its places', pages);
		if (SHOTS) { await page.keyboard.press('ArrowRight'); await sleep(200); await page.keyboard.press('ArrowRight'); await sleep(500); await page.screenshot({ path: path.join(SHOTS, 'flymap-sevii.png') }); }
		A(page.errors.length === 0, 'no page error', page.errors.slice(0, 3));
		await page.close();
	}

	// --- in a Sevii house, and in a Hoenn cave ---
	{
		const page = await open('OneIsland_PokemonCenter_1F', ['MAP_ONE_ISLAND'], 'kanto');
		await openMap(page);
		const s = await state(page);
		A(s.page === 'sevii' && s.n === 7, "opened inside One Island's Center, the map shows the Sevii Isles' page", s.page);
		await page.close();
		const page2 = await open('GraniteCave_1F', [], 'hoenn');
		await openMap(page2);
		const s2 = await state(page2);
		A(s2.page === 'hoenn', "and inside a Hoenn cave, Hoenn's", s2.page);
		await page2.close();
	}
} finally { if (browser) await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
