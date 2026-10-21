// bugreports_1021a_test.mjs — tester bug-report list of 2026-10-21, set A (Instinct).
//
//   bug:1792441645341: ROUTE 23's THUNDERBADGE guard at (8,140) said nothing. Every
//     Route 22/23 badge guard (and every trigger tile beside them) is a thin wrapper
//     that `goto`s the shared body in pokefirered data/scripts/route23.inc, which no
//     map file holds. tools/audit_missing_labels.mjs restores only an ALLOW-list of
//     such labels and these were not on it; their `bufferstdstring` (the badge's
//     name) had also been dropped by the transpile (now tools/gen_multichoice.mjs).
//   bug:1792554627432: VERMILION's SEAGALLOP with the TRI-PASS: picking ONE / TWO /
//     THREE ISLAND closed the menu and nothing sailed. The picks branch into
//     seagallop.inc's EventScript_SailTo*Island2 / SailToDest / SetSail, which no map
//     file holds either: events.js now carries them, and the crossing is a warp to
//     sSeagallopSpawnTable's tile.
//
// (The OUTRAGE 0-PP lock is rampage_pp_test.mjs.)
//   node overworld/tests/bugreports_1021a_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9273;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---- data: no Route 22/23 badge-guard label resolves to nothing any more ----
{
	const out = JSON.parse(execFileSync('node', [path.join(ROOT, 'tools/audit_missing_labels.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
	const left = out.unresolved.filter(r => /BadgeGuard/.test(r.label));
	A(left.length === 0, '[1792441645341] every Route 22/23 BadgeGuard / BadgeGuardTrigger label resolves', JSON.stringify(left));
	const sail = out.unresolved.filter(r => /^EventScript_(SailTo\w+2|SailToDest|SetSail|CancelSail|SeviiDestinationsPage1|SetResult(True|False))$/.test(r.label));
	A(sail.length === 0, '[1792554627432] the SEAGALLOP labels Vermilion / Cinnabar / One Island jump to all resolve', JSON.stringify(sail.map(r => r.label)));
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1021a', friendCode: 'B1021A', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const ALL = ids => Object.fromEntries(ids.map(i => [i, true]));
const KANTO8 = ALL(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']);
let browser;
async function open(map, x, y, { flags = {}, vars = {}, badges = { badges: {}, champion: {} } } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((flags, vars, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1021a', friendCode: 'B1021A', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20 }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...flags }, vars }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, flags, vars, badges);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	await page.evaluate(async () => { const B = await import('./battle.js'), S = (await import('./ow_state.js')).S; S.party = [B.buildMon('mewtwo', 70, window.__ow.battle.data)]; });
	await page.evaluate(() => { const d = window.__ow.dialog, o = d.open.bind(d); window.__dlg = []; d.open = (t, cb) => { window.__dlg.push(String(t)); return o(t, cb); }; });
	return page;
}
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const tap = async (page, k, ms = 60) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(350); };
async function step(page, dir) {
	const at = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		await sleep(25);
		const s = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
		if (s[0] !== at[0] || s[1] !== at[1] || s[2] !== at[2]) break;
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
	await sleep(250);
}
const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
const getVar = (page, v) => page.evaluate(async v => (await import('./events.js')).getVar(v), v);
// press through dialog until the scene is idle, a menu opens, or time runs out
const drive = (page, ms = 15000) => page.evaluate(async ms => {
	const C = await import('./choice.js'), M = await import('./ow_menukeys.js'), O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < ms) {
		if (C.choiceMenu.open) return 'menu';
		if (M.ferryMenu.open) return 'ferry';
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && !O.battle.blocking && !O.S?.loading && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, ms);
const talk = async (page, x, y, facing) => {
	await page.evaluate((x, y, f) => { const p = window.__ow.player; p.setTile(x, y); p.facing = f; window.__dlg = []; }, x, y, facing);
	await tap(page, 'z');
	const r = await drive(page);
	return { r, dlg: await page.evaluate(() => window.__dlg.slice()) };
};

// talk to the NPC whose script matches, from whichever neighbouring tile is open
async function talkTo(page, re) {
	const g = await page.evaluate(src => { const re = new RegExp(src); const n = window.__ow.npcs.list.find(n => re.test(n.ev?.script || '')); return n ? [n.tx, n.ty] : null; }, re.source);
	if (!g) return { g, dlg: [] };
	let t = { g, dlg: [] };
	for (const [dx, dy, f] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
		if (!(await page.evaluate((x, y) => window.__ow.world.isPassable(x, y), g[0] + dx, g[1] + dy))) continue;
		t = { g, ...(await talk(page, g[0] + dx, g[1] + dy, f)) };
		if (t.dlg.length) break;
	}
	return t;
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== ROUTE 23's THUNDERBADGE guard (bug:1792441645341) =====
	{
		// the tester's state: all 8 badges, VAR_MAP_SCENE_ROUTE23 never set
		const page = await open('Route23', 8, 141, { badges: { badges: { KANTO: KANTO8 }, champion: {} } });
		const t = await talk(page, 8, 141, 'up');
		A(t.dlg.some(s => /THUNDERBADGE/.test(s) && /go right ahead/i.test(s)),
			'[1792441645341] with the badge, the THUNDERBADGE guard at (8,140) recognizes it ("That is the THUNDERBADGE! ... go right ahead")', JSON.stringify(t));
		A(await getVar(page, 'VAR_MAP_SCENE_ROUTE23') === 3, '...and records it (VAR_MAP_SCENE_ROUTE23 = 3)', await getVar(page, 'VAR_MAP_SCENE_ROUTE23'));
		// the way north is the column beside him, (7,140): walk it up to (7,136)
		await page.evaluate(() => { window.__ow.player.setTile(7, 141); });
		for (let i = 0; i < 5; i++) { await step(page, 'up'); await drive(page, 4000); }
		const n = await where(page);
		A(n.map === 'Route23' && n.y <= 136, '...and the path north past him, through (7,140), is open', JSON.stringify(n));
		// the other six Route 23 guards say their own badge
		const heard = [];
		for (const badge of ['Cascade', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth']) {
			const r = await talkTo(page, new RegExp(`_${badge}BadgeGuard$`));
			heard.push([badge, r.g, r.dlg.some(s => s.includes(badge.toUpperCase() + 'BADGE'))]);
		}
		A(heard.every(h => h[2]), '...and every other Route 23 guard names its own badge', JSON.stringify(heard));
		await page.close();
	}
	{
		// without the THUNDERBADGE: he refuses, and his trigger tile turns you back
		const page = await open('Route23', 7, 141, { vars: { VAR_MAP_SCENE_ROUTE23: 2 }, badges: { badges: { KANTO: { boulder: true, cascade: true } }, champion: {} } });
		const t = await talk(page, 8, 141, 'up');
		A(t.dlg.some(s => /don't have the THUNDERBADGE/i.test(s)), '[1792441645341] without it, the guard says "You don\'t have the THUNDERBADGE yet!"', JSON.stringify(t));
		await page.evaluate(() => { window.__ow.player.setTile(7, 141); window.__dlg = []; });
		await step(page, 'up');
		await drive(page);
		const back = await where(page);
		const said = await page.evaluate(() => window.__dlg.slice());
		A(said.some(s => /THUNDERBADGE/.test(s)) && back.y === 141 && await getVar(page, 'VAR_MAP_SCENE_ROUTE23') === 2,
			'...and stepping on his trigger tile (7,140) stops you and walks you back down', JSON.stringify({ back, said }));
		await page.close();
	}
	{
		// ROUTE 22's gate: the BOULDERBADGE guard (Route22_NorthEntrance_EventScript_BadgeGuard)
		const page = await open('Route22_NorthEntrance', 6, 4, { badges: { badges: { KANTO: KANTO8 }, champion: {} } });
		const t = await talkTo(page, /BoulderBadgeGuard$/);
		A(t.dlg.some(s => /BOULDERBADGE/.test(s)), '[1792441645341] Route 22\'s gate guard recognizes the BOULDERBADGE', JSON.stringify(t));
		A(await getVar(page, 'VAR_MAP_SCENE_ROUTE23') === 1, '...and arms Route 23\'s first trigger (VAR_MAP_SCENE_ROUTE23 = 1)', await getVar(page, 'VAR_MAP_SCENE_ROUTE23'));
		await page.close();
	}

	// ===== VERMILION's SEAGALLOP with the TRI-PASS (bug:1792554627432) =====
	const TRIPASS = { vars: { VAR_MAP_SCENE_VERMILION_CITY: 3, VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F: 1 }, flags: { FLAG_SYS_GAME_CLEAR: true }, badges: { badges: { KANTO: KANTO8 }, champion: { KANTO: true, HOENN: true } } };
	for (const [label, file] of [['ONE ISLAND', 'OneIsland_Harbor'], ['THREE ISLAND', 'ThreeIsland_Harbor']]) {
		const page = await open('VermilionCity', 22, 32, TRIPASS);
		await step(page, 'down');   // onto the ticket check at (22,33)
		const r = await drive(page);
		const menu = await page.evaluate(async () => { const C = await import('./choice.js'); return { open: C.choiceMenu.open, options: C.choiceMenu.options.slice() }; });
		A(r === 'menu' && menu.options.join('|') === 'ONE ISLAND|TWO ISLAND|THREE ISLAND|EXIT',
			`[1792554627432] the TRI-PASS mat asks ONE / TWO / THREE ISLAND / EXIT`, JSON.stringify({ r, menu, dlg: await page.evaluate(() => window.__dlg) }));
		await page.evaluate(async label => { const C = await import('./choice.js'); C.choiceMenu.idx = C.choiceMenu.options.indexOf(label); window.__dlg = []; }, label);
		await tap(page, 'z');
		await drive(page);
		for (let i = 0; i < 60 && (await where(page)).map !== file; i++) await sleep(100);
		const at = await where(page);
		const dlg = await page.evaluate(() => window.__dlg.slice());
		A(at.map === file && at.x === 8 && at.y === 5 && dlg.some(s => /HI-SPEED 7/.test(s)),
			`[1792554627432] ...picking ${label} says SEAGALLOP HI-SPEED 7 is departing and lands at ${file} (8,5)`, JSON.stringify({ at, dlg }));
		await page.close();
	}
	{
		// EXIT keeps you in Vermilion; no TRI-PASS = no menu (the decomp's gate)
		const page = await open('VermilionCity', 22, 32, TRIPASS);
		await step(page, 'down');
		await drive(page);
		await page.evaluate(async () => { const C = await import('./choice.js'); C.choiceMenu.idx = 3; });
		await tap(page, 'z');
		await drive(page);
		const stay = await where(page);
		A(stay.map === 'VermilionCity', '[1792554627432] EXIT sails nowhere', JSON.stringify(stay));
		await page.close();
		const p2 = await open('VermilionCity', 22, 32, { ...TRIPASS, vars: { VAR_MAP_SCENE_VERMILION_CITY: 3 } });
		await step(p2, 'down');
		const r2 = await drive(p2);
		const d2 = await p2.evaluate(() => window.__dlg.slice());
		A(r2 !== 'menu' && d2.some(s => /ship set sail/i.test(s)) && (await where(p2)).map === 'VermilionCity',
			'[1792554627432] without the TRI-PASS the sailor only says "The ship set sail."', JSON.stringify({ r2, d2 }));
		await p2.close();
	}
	{
		// the same EventScript_SetSail ends BILL's trip from CINNABAR to ONE ISLAND
		// (CinnabarIsland_EventScript_SailToOneIsland, the map's ON_FRAME scene once
		// you agree to go: VAR_0x8006 = SEAGALLOP_ONE_ISLAND). Before, the scene ended
		// on the dock: Bill gone, the boat gone, and the player still on CINNABAR.
		const page = await open('CinnabarIsland', 21, 8, { flags: { FLAG_SYS_GAME_CLEAR: true }, vars: { VAR_MAP_SCENE_CINNABAR_ISLAND: 1 }, badges: { badges: { KANTO: KANTO8 }, champion: { KANTO: true } } });
		await drive(page);
		for (let i = 0; i < 80 && !/^OneIsland/.test((await where(page)).map); i++) await sleep(100);
		await drive(page);
		const at = await where(page);
		const v = await getVar(page, 'VAR_MAP_SCENE_CINNABAR_ISLAND');
		A(/^OneIsland/.test(at.map) && v === 2,
			'[1792554627432] EventScript_SetSail also carries BILL\'s SEAGALLOP from CINNABAR to ONE ISLAND', JSON.stringify({ at, v }));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
