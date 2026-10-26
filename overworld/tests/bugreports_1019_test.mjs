// bugreports_1019_test.mjs — the tester bug-report list of 2026-10-19.
//
//   bug:1792223560422 / 1792234688669 / 1792252593657 (remygl): Cerulean's south and
//     east exits and Route 4's west half "sealed". NOT bugs: FireRed's own gates. The
//     SLOWBRO + LASS (and the POLICEMAN at the burgled house) stand in the way until
//     FLAG_GOT_SS_TICKET (CeruleanCity_EventScript_BlockExits), the east band is the
//     burgled house's back yard, and Route 4's ledges are one-way. Pinned as such.
//   bug:1792261107959 / 1792261204379 (Instinct): One Island's SEAGALLOP sailor stood
//     behind two solid rows: the Sevii harbors drew EMERALD's LAYOUT_ISLAND_HARBOR
//     (Emerald's converter wrote its same-id layout over FireRed's). They now use a
//     FireRed copy (tools/restore_frlg_layouts.py --emerald-splits) — and the sailor's
//     destination menu, a set of specials no map held, is the port's own SEAGALLOP menu.
//   bug:1792263054606 (Instinct): Mt. Ember's Rocket grunts never stayed beaten:
//     `goto_if_defeated` was dropped by the transpile (all 79 of the family). Restored
//     by tools/gen_multichoice.mjs; a scripted win now records its TRAINER_ id.
//   bug:1792312462383 (remygl): Dewford Gym "never engages" — does not reproduce
//     (talk, sight and the leader all work, from the door); pinned.
//   bug:1792354946145 (remytest): Route 107/108 strings 404. Every Emerald route
//     trainer's intro/defeat lives in data/text/trainers.inc, which the strings export
//     never read (1,464 labels): tools/gen_trainer_text.mjs.
//   bug:1792417108739 (Instinct): Burned Tower B1F's (10,8) warped you back to 1F —
//     a Crystal warp_event on a non-warp square, which the GBC never fires
//     (tools/gen_crystal_dead_warps.mjs).
//   bug:1792417144316 / 1792420478358 / 1792420786137 (Instinct): the Tin Tower beasts
//     and CELEBI stood on tiles nobody could step on (also DEOXYS and Navel Rock's
//     HO-OH): every hand-placed legendary tile is now walkable and reachable.
//
// The map data is the owdata deployment's. OW_DATA_DIRS (path.delimiter-separated,
// first wins) layers staged data over it; default: overworld/data.
//   node overworld/tests/bugreports_1019_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA_DIRS = (process.env.OW_DATA_DIRS ? process.env.OW_DATA_DIRS.split(path.delimiter) : [path.join(ROOT, 'overworld/data')]).filter(Boolean);
const dataFile = rel => DATA_DIRS.map(d => path.join(d, rel)).find(p => fs.existsSync(p)) || null;
const J = rel => { const f = dataFile(rel); if (!f) throw new Error('no ' + rel); return JSON.parse(fs.readFileSync(f, 'utf8')); };
const tryJ = rel => { try { return J(rel); } catch (e) { return null; } };
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9719;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- a World on one map, from the (layered) shipped data ----------
const { World } = await import(pathToFileURL(path.join(ROOT, 'overworld/engine.js')).href);
const mangle = n => n.replace('gTileset_', '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
	.replace(/([A-Za-z])(\d+)/g, '$1_$2').toLowerCase().replace(/^_/, '').replace(/__/g, '_');
const side = (name, primary, game) => tryJ(`tilesets/${game === 'emerald' ? 'emerald_' : ''}${primary ? 'primary' : 'secondary'}_${mangle(name)}_metatiles.json`);
const stemOf = new Map();
for (const d of DATA_DIRS) { try { for (const f of fs.readdirSync(path.join(d, 'maps'))) if (f.endsWith('_map.json') && !stemOf.has(f)) stemOf.set(f, d); } catch (e) {} }
function worldOn(stem) {
	const map = J(`maps/${stem}_map.json`);
	const layout = J(`layouts/${map.layout}.json`);
	const ts = { primary: side(layout.primary_tileset, true, layout.game), secondary: side(layout.secondary_tileset, false, layout.game), primaryMetatileCount: layout.game === 'emerald' ? 512 : 640 };
	const w = Object.create(World.prototype);
	w.current = { name: stem, map, layout, ts };
	w.connections = [];
	w.warps = (map.warp_events || []).map(x => ({ ...x, x: +x.x, y: +x.y }));
	return w;
}
// flood fill from (sx,sy) [or every warp]; stepping on a warp leaves the map; ledges hop
function reach(w, starts, { surf = false } = {}) {
	const lay = w.current.layout, seen = new Set(), q = [];
	for (const [x, y] of starts) { seen.add(x + ',' + y); q.push([x, y]); }
	const D = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
	while (q.length) {
		const [x, y] = q.pop();
		if (w.warpAt(x, y) && !starts.some(([a, b]) => a === x && b === y)) continue;
		for (const [dir, [dx, dy]] of Object.entries(D)) {
			let nx = x + dx, ny = y + dy;
			if (w.isLedge(nx, ny, dir) || w.isLedge(x, y, dir)) { nx += dx; ny += dy; }
			const k = nx + ',' + ny;
			if (nx < 0 || ny < 0 || nx >= lay.width || ny >= lay.height || seen.has(k)) continue;
			if (!w.isPassable(nx, ny) || (!surf && w.isSurfable(nx, ny))) continue;
			seen.add(k); q.push([nx, ny]);
		}
	}
	return seen;
}

// ===== bug:1792223560422 / 1792234688669 / 1792252593657: FireRed's own gates =====
{
	const scr = J('scripts/CeruleanCity.json');
	const block = JSON.stringify(scr.CeruleanCity_EventScript_BlockExits || []);
	A(/"cond":\{"flag":"FLAG_GOT_SS_TICKET","state":false\}/.test(JSON.stringify(scr.CeruleanCity_OnTransition))
		&& /LOCALID_CERULEAN_SLOWBRO","x":26,"y":31/.test(block) && /LOCALID_CERULEAN_LASS","x":27,"y":31/.test(block),
		'[1792223560422] the SLOWBRO + LASS on (26,31)/(27,31) are FireRed\'s exit block until the S.S. TICKET, not wild spawns');
	const w = worldOn('CeruleanCity');
	const yard = reach(w, [[31, 7]]);   // the burgled house's back door lets out at (31,8)
	A(yard.has('47,18') && yard.has('40,33') && yard.has('26,33'),
		'[1792234688669] the east band (the Route 9 edge at x=47, rows 18-19) and the south region are the burgled house\'s back yard');
	const r4 = worldOn('Route4');
	const fromMoon = reach(r4, [[32, 6]]), fromCerulean = reach(r4, [[107, 10]]);
	A(fromMoon.has('107,10') && !fromCerulean.has('19,6'),
		'[1792252593657] Route 4 runs one way: Mt. Moon -> Cerulean over its ledges, never back (FireRed)');
}

// ===== bug:1792261107959 / 1792261204379: the Sevii harbors' gangway =====
{
	const harbors = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'].map(n => n + 'Island_Harbor');
	const bad = [];
	for (const h of harbors) {
		const w = worldOn(h);
		const r = reach(w, [[8, 2]]);
		if (w.current.layout.game !== 'firered' || !r.has('8,5')) bad.push(`${h}(${w.current.map.layout}/${w.current.layout.game})`);
	}
	A(bad.length === 0, '[1792261107959] every Sevii harbor draws FireRed\'s pier: (8,2) walks to (8,5), in front of the sailor at (8,6)', bad.join(' '));
	const em = worldOn('BirthIsland_Harbor');
	A(em.current.layout.game === 'emerald' && reach(em, [[8, 2]]).has('8,4'), 'Emerald\'s own Birth Island harbor keeps its layout');
}

// ===== bug:1792354946145: every trainer's lines resolve =====
{
	const common = J('strings/_common.json');
	const shared = (tryJ('shared_scripts.json') || {}).strings || {};
	const dirs = new Set();
	for (const d of DATA_DIRS) { try { for (const f of fs.readdirSync(path.join(d, 'scripts'))) dirs.add(f); } catch (e) {} }
	let total = 0; const missing = [];
	for (const f of [...dirs].sort()) {
		const stem = f.replace(/\.json$/, '');
		const scr = J('scripts/' + f);
		const first = stem.replace(/_(B\d+F|\d+F)$/, '_1F');
		const str = { ...(first !== stem ? tryJ(`strings/${first}.json`) || {} : {}), ...(tryJ(`strings/${stem}.json`) || {}) };
		for (const ops of Object.values(scr)) {
			if (!Array.isArray(ops)) continue;
			for (const o of ops) {
				if (o?.op !== 'trainerbattle') continue;
				for (const a of o.args || []) if (/_Text_/.test(a)) { total++; if (!(a in str) && !(a in common) && !(a in shared)) missing.push(`${stem}:${a}`); }
			}
		}
	}
	// one FireRed label (CeladonCity_GameCorner_Text_DefeatedGrunt) names a script, not a text: no decomp string exists
	const real = missing.filter(m => !/CeladonCity_GameCorner_Text_DefeatedGrunt$/.test(m));
	A(real.length === 0, `[1792354946145] all ${total} trainer intro/defeat text labels resolve to a line`, `${real.length} unresolved, e.g. ${real.slice(0, 4).join(' ')}`);
	const r107 = tryJ('strings/Route107.json') || {}, r108 = tryJ('strings/Route108.json') || {};
	A(/drifted off to sleep/.test(r107.Route107_Text_DarrinIntro || '') && /seven seas/.test(r108.Route108_Text_JeromeIntro || ''),
		'[1792354946145] strings/Route107.json and Route108.json exist and carry the trainers\' lines');
}

// ===== bug:1792417108739: Burned Tower B1F's leftover warp =====
{
	let DEAD = null;
	try { DEAD = (await import(pathToFileURL(path.join(ROOT, 'overworld/crystal_dead_warps_data.js')).href)).DEAD_WARPS; } catch (e) {}
	const b1f = DEAD?.BurnedTowerB1F || [];
	A(b1f.includes('10,8') && b1f.includes('10,9') && !b1f.includes('7,15'),
		'[1792417108739] B1F (10,8)/(10,9) are landing squares the GBC never fires; the (7,15) ladder still is a warp', JSON.stringify(b1f));
	A(!(DEAD?.WillsRoom || []).length && !(DEAD?.MahoganyMart1F || []).length,
		'...and the doors a script opens (the Elite Four rooms, the Mahogany Mart stairs) are left alone');
}

// ===== bug:1792417144316 / 1792420478358: every hand-placed legendary can be stepped on =====
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/ow_legendaries.js'), 'utf8');
	const body = src.slice(src.indexOf('const HAND_PLACED_LEGENDS'), src.indexOf('\n};', src.indexOf('const HAND_PLACED_LEGENDS')));
	const idToStem = new Map();
	for (const [f, d] of stemOf) { try { const m = JSON.parse(fs.readFileSync(path.join(d, 'maps', f), 'utf8')); if (!idToStem.has(m.id)) idToStem.set(m.id, f.replace(/_map\.json$/, '')); } catch (e) {} }
	let cur = null; const spots = [];
	for (const line of body.split(/\r?\n/)) {
		const m = /^\t(MAP_\w+):/.exec(line); if (m) cur = m[1];
		for (const s of line.matchAll(/species: '(\w+)'.*?x: (\d+),\s*y: (\d+)/g)) spots.push({ map: cur, sp: s[1], x: +s[2], y: +s[3] });
	}
	const bad = [];
	for (const s of spots) {
		const stem = idToStem.get(s.map);
		if (!stem) { bad.push(`${s.sp}: no map ${s.map}`); continue; }
		const w = worldOn(stem);
		if (!w.isPassable(s.x, s.y)) { bad.push(`${s.sp}@${stem}(${s.x},${s.y}) solid`); continue; }
		if (!reach(w, w.warps.map(p => [p.x, p.y]), { surf: true }).has(s.x + ',' + s.y)) bad.push(`${s.sp}@${stem}(${s.x},${s.y}) unreachable`);
	}
	A(spots.length >= 20 && bad.length === 0, `[1792420478358] all ${spots.length} hand-placed legendary tiles are walkable and reachable from an entrance`, bad.join(' | '));
}

// ===== the browser half =====
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1019', friendCode: 'B1019', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	const f = u.startsWith('/overworld/data/') ? dataFile(u.slice('/overworld/data/'.length)) : path.join(ROOT, u);
	fs.readFile(f || '', (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const ALL8 = ids => Object.fromEntries(ids.map(i => [i, true]));
const KANTO8 = ALL8(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']);
const JOHTO8 = ALL8(['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']);
let browser;
async function open(map, x, y, { region = 'KANTO', flags = {}, vars = {}, badges = { badges: {}, champion: {} } } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((region, flags, vars, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1019', friendCode: 'B1019', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20 }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		// a REPEL with the Lv 70 lead: these walks test warps, scenes and sight lines, and a 6%-a-step wild battle
		// (Burned Tower B1F) ate the step onto the beasts' trigger tile now and then
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, region, flags, vars, badges);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await boot(page, map);
	await page.evaluate(async () => { const B = await import('./battle.js'), S = (await import('./ow_state.js')).S; S.party = [B.buildMon('mewtwo', 70, window.__ow.battle.data)]; });
	await page.evaluate(() => { const d = window.__ow.dialog, o = d.open.bind(d); window.__dlg = []; d.open = (t, cb) => { window.__dlg.push(String(t)); return o(t, cb); }; });
	return page;
}
const boot = async (page, map) => { for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === m), map).catch(() => false)); i++) await sleep(100); await sleep(1200); };
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const tap = async (page, k, ms = 60) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(350); };
// one real step: hold the key until the tile changes (or a scene / battle / map change takes over)
async function step(page, dir) {
	const at = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		await sleep(25);
		const s = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty, window.__ow.player.moving]);
		if (s[0] !== at[0] || s[1] !== at[1] || s[2] !== at[2]) break;
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
	await sleep(250);
}
const face = (page, dir) => page.evaluate(d => { window.__ow.player.facing = d; }, dir);
const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
const drive = (page, ms = 20000) => page.evaluate(async ms => {
	const C = await import('./choice.js'), M = await import('./ow_menukeys.js'), O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < ms) {
		if (C.choiceMenu.open) return 'menu';
		if (M.ferryMenu.open) return 'ferry';
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && !O.battle.blocking && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, ms);
async function win(page) {
	await page.evaluate(() => window.__ow.battle.finish('victory'));
	for (let i = 0; i < 100 && await page.evaluate(() => !!window.__ow.battle.active); i++) await sleep(50);
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ---- the SEAGALLOP from One Island (bug:1792261107959 / 1792261204379) ----
	{
		const page = await open('OneIsland_Harbor', 8, 2, { badges: { badges: { KANTO: KANTO8 }, champion: { KANTO: true } } });
		for (let i = 0; i < 3; i++) await step(page, 'down');
		const at = await where(page);
		A(at.map === 'OneIsland_Harbor' && at.x === 8 && at.y === 5, '[1792261107959] from the warp (8,2) the pier walks down to (8,5)', JSON.stringify(at));
		await face(page, 'down'); await tap(page, 'z');
		const r = await drive(page);
		const menu = await page.evaluate(async () => (await import('./ow_menukeys.js')).ferryDests().map(d => d.label));
		A(r === 'ferry' && menu.includes('TWO ISLAND') && menu.includes('THREE ISLAND') && !menu.includes('ONE ISLAND'),
			'[1792261204379] the sailor asks where to sail and offers the other islands', JSON.stringify({ r, menu, dlg: await page.evaluate(() => window.__dlg) }));
		if (r === 'ferry') {
			await page.evaluate(async () => { const M = await import('./ow_menukeys.js'); M.ferryMenu.idx = M.ferryDests().findIndex(d => d.label === 'TWO ISLAND'); });
			await tap(page, 'z');
			for (let i = 0; i < 60 && (await where(page)).map !== 'TwoIsland_Harbor'; i++) await sleep(100);
		}
		const there = await where(page);
		A(there.map === 'TwoIsland_Harbor' && there.x === 8 && there.y === 5, '[1792261204379] ...and the SEAGALLOP lands at TWO ISLAND\'s harbor (8,5)', JSON.stringify(there));
		await page.close();
	}

	// ---- Mt. Ember's grunts (bug:1792263054606) ----
	{
		const page = await open('MtEmber_Exterior', 41, 41, { vars: { VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F: 4, VAR_MAP_SCENE_MT_EMBER_EXTERIOR: 2 }, badges: { badges: { KANTO: KANTO8 }, champion: { KANTO: true } } });
		const talk = async x => {
			await page.evaluate(x => { const p = window.__ow.player; p.setTile(x, 41); p.facing = 'up'; window.__dlg = []; }, x);
			await tap(page, 'z');
			let r = await drive(page), fought = false;
			if (r === 'battle') { fought = true; await win(page); r = await drive(page); }
			return { fought, r, dlg: await page.evaluate(() => window.__dlg.slice()) };
		};
		const g1a = await talk(41), g1b = await talk(41);
		A(g1a.fought && !g1b.fought && g1b.dlg.length > 0, '[1792263054606] GRUNT 1 battles once; talked to again, he only talks', JSON.stringify({ g1a, g1b }));
		const g2a = await talk(42);
		A(g2a.fought && g2a.dlg.some(t => /regroup/i.test(t)), '[1792263054606] beating GRUNT 2 too plays "We\'ll have to regroup"', JSON.stringify(g2a));
		const st = await page.evaluate(() => {
			const s = JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags || {};
			return { hide: !!s.FLAG_HIDE_MT_EMBER_EXTERIOR_ROCKETS, t43: Object.keys(s).some(k => /TEAM_ROCKET_GRUNT_43$/.test(k)), t44: Object.keys(s).some(k => /TEAM_ROCKET_GRUNT_44$/.test(k)) };
		});
		A(st.hide && st.t43 && st.t44, '...both grunts are recorded beaten and leave', JSON.stringify(st));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await boot(page, 'MtEmber_Exterior');
		const gone = await page.evaluate(() => !window.__ow.npcs.list.some(n => /Grunt/.test(n.ev?.script || '') && !n.hidden));
		await page.evaluate(() => { const p = window.__ow.player; p.setTile(42, 41); p.facing = 'up'; });
		await step(page, 'up'); await step(page, 'up');
		for (let i = 0; i < 40 && (await where(page)).map === 'MtEmber_Exterior'; i++) await sleep(100);
		const inside = await where(page);
		A(gone && /RubyPath/.test(inside.map), '[1792263054606] after a reload they stay gone and (42,39) leads into the Ruby Path', JSON.stringify({ gone, inside }));
		await page.close();
	}

	// ---- Dewford Gym engages (bug:1792312462383: does not reproduce) ----
	{
		const page = await open('DewfordTown', 8, 18, { region: 'HOENN', badges: { badges: { HOENN: { stone: true } }, champion: {} } });
		await step(page, 'up');
		for (let i = 0; i < 40 && (await where(page)).map !== 'DewfordTown_Gym'; i++) await sleep(100);
		await sleep(1500);   // let the door's fade finish
		const inGym = await where(page);
		const list = await page.evaluate(() => window.__ow.trainers.list.map(t => t.ev.script.replace('DewfordTown_Gym_EventScript_', '')).sort());
		A(inGym.map === 'DewfordTown_Gym' && list.length === 7, '[1792312462383] through the door, all 7 gym trainers (Brawly too) are on the map', JSON.stringify({ inGym, list }));
		// TAKAO (2,18) watches (2,15..17): walk the west corridor into his sight
		await page.evaluate(() => { const p = window.__ow.player; p.setTile(2, 14); p.facing = 'down'; window.__dlg = []; });
		await step(page, 'down');
		// (he walks over before he speaks: wait for his line, not a fixed 2.5 s — a slow runner's frames made the walk longer)
		for (let i = 0; i < 200 && !(await page.evaluate(() => window.__dlg.some(t => t.length > 3))); i++) await sleep(100);
		const seen = await page.evaluate(() => ({ dlg: window.__dlg.slice(), battle: !!window.__ow.battle.active || !!window.__ow.trainers.engaging || window.__ow.dialog.blocking }));
		A(seen.battle && seen.dlg.some(t => t.length > 3), '[1792312462383] stepping into TAKAO\'s sight line engages him', JSON.stringify(seen));
		await page.close();
		const p2 = await open('DewfordTown_Gym', 4, 4, { region: 'HOENN', badges: { badges: { HOENN: { stone: true } }, champion: {} } });
		await face(p2, 'up'); await tap(p2, 'z');
		const b = await p2.evaluate(() => window.__dlg.slice());
		A(b.some(t => /BRAWLY/.test(t)), '[1792312462383] facing BRAWLY and pressing Z opens his challenge', JSON.stringify(b));
		await p2.close();
	}

	// ---- a Route 107 trainer speaks (bug:1792354946145) ----
	{
		const page = await open('Route107', 41, 11, { region: 'HOENN', badges: { badges: { HOENN: { stone: true, knuckle: true } }, champion: {} } });
		await page.evaluate(() => { const O = window.__ow; const t = O.trainers.list.find(t => /Darrin/.test(t.ev.script)); window.__dlg = []; if (t) O.trainers.talkTo(t, 'up'); });
		await sleep(600);
		const said = await page.evaluate(() => window.__dlg.slice());
		A(said.some(t => /drifted off to sleep/.test(t)) && !said.includes('...'), '[1792354946145] Route 107\'s DARRIN opens with his own line, not "..."', JSON.stringify(said));
		await page.close();
	}

	// ---- Burned Tower B1F: walk up to the beasts (bug:1792417108739) ----
	{
		const page = await open('BurnedTowerB1F', 10, 9, { region: 'JOHTO', flags: { EVENT_BURNED_TOWER_B1F_BEASTS_1: true }, vars: { VAR_SCENE_BurnedTower1F: 2 }, badges: { badges: { JOHTO: { zephyr: true, hive: true, plain: true } }, champion: {} } });
		const path_ = [];
		for (let i = 0; i < 3; i++) { await step(page, 'up'); path_.push(await where(page)); if (path_[i].map !== 'BurnedTowerB1F') break; }
		await drive(page, 30000);
		const st = await page.evaluate(() => ({ battle: !!window.__ow.battle.active, map: window.__ow.world.current.name, released: !!(JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags || {}).EVENT_RELEASED_THE_BEASTS, ladder: !!window.__ow.world.warpAt(7, 15) }));
		A(path_.every(p => p.map === 'BurnedTowerB1F') && st.released, '[1792417108739] (10,9) -> (10,8) -> (10,7) -> (10,6) stays on B1F and releases the beasts', JSON.stringify({ path_, st }));
		A(st.ladder, '...and the B1F ladder at (7,15) is still a warp');
		await page.close();
	}

	// ---- CELEBI and the Tin Tower beasts start on a step (bug:1792420478358 / 1792417144316) ----
	for (const [map, from, to, dir, sp, extra] of [
		['IlexForest', [8, 24], [8, 23], 'up', 'celebi', { region: 'JOHTO', badges: { badges: { JOHTO: JOHTO8 }, champion: { JOHTO: true } } }],
		['TinTower1F', [9, 12], [9, 11], 'up', 'suicune', { region: 'JOHTO', flags: { EVENT_RELEASED_THE_BEASTS: true }, badges: { badges: { JOHTO: JOHTO8 }, champion: {} } }],
	]) {
		const page = await open(map, from[0], from[1], extra);
		await step(page, dir);
		await drive(page, 8000);   // its intro line, then the battle
		const b = await page.evaluate(() => ({ at: [window.__ow.player.tx, window.__ow.player.ty], battle: !!window.__ow.battle.active, foe: window.__ow.battle.endSpec?.kind === 'legendary' ? window.__ow.battle.endSpec.species : null }));
		A(b.battle && String(b.foe || '').toLowerCase().includes(sp), `[${sp === 'celebi' ? '1792420478358' : '1792417144316'}] stepping onto ${map} (${to}) starts the ${sp.toUpperCase()} battle`, JSON.stringify(b));
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
