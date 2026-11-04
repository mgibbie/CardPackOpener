// unown_puzzle_test.mjs — the Ruins of Alph UNOWN PUZZLE (`special UnownPuzzle`).
//
// The chamber panels (restored as BGEVENT_UP signs in #658) ran a script whose
// `special UnownPuzzle` had no handler and whose `setval` / `iftrue .PuzzleComplete`
// were dropped by the transpile, so the panel did nothing and no chamber could
// ever be solved. And the port fires any warp_event on arrival, so the tile in
// front of the panel — a warp under Crystal's closed floor — pitched you into the
// inner chamber before you could read it.
//   1. walking up to the Kabuto panel keeps you in the chamber (floor closed)
//   2. A at the panel opens the KABUTO puzzle: 16 pieces on the 16 border slots,
//      the decomp graphics served from overworld/minigames/unown/
//   3. quitting leaves it unsolved: no flag, still in the chamber, script done
//   4. solving it (a test arrangement one piece from done, then real key presses)
//      sets EVENT_SOLVED_KABUTO_PUZZLE, applies the hole changeblocks and drops
//      you into the inner chamber (warpcheck)
//
//   node overworld/tests/unown_puzzle_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9236;
const STATE = { username: 'unownpz', friendCode: 'UNPZ01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const MAP = 'RuinsOfAlphKabutoChamber';
	const where = () => W(() => ({ map: window.__ow.world.current?.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const puzzle = () => page.evaluate(async () => { const m = await import('./unown_puzzle.js'); const u = m.unownPuzzle; return { open: u.open, which: u.which, pieces: u.pieces.slice(), cursor: u.cursor, held: u.held, solved: u.solved }; });
	const flag = f => page.evaluate(async f => (await import('./events.js')).getFlag(f), f);
	const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(90); } };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${MAP}&x=3&y=4`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'RuinsOfAlphKabutoChamber')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);

	// ===== 1. walk up to the panel: the floor in front of it is closed =====
	A(!(await flag('EVENT_SOLVED_KABUTO_PUZZLE')), '0. a fresh save has the Kabuto puzzle unsolved');
	for (let i = 0; i < 8 && (await where()).y !== 3; i++) {
		await page.keyboard.down('ArrowUp'); await sleep(260); await page.keyboard.up('ArrowUp'); await sleep(400);
		if ((await where()).map !== MAP) break;
	}
	await sleep(900);
	const stood = await where();
	A(stood.map === MAP && stood.x === 3 && stood.y === 3, '1. walking up to the panel keeps you in the chamber (the closed floor is no pit)', JSON.stringify(stood));
	if (stood.map !== MAP) {   // fall back so the rest still runs
		await page.evaluate(async m => window.__ow.moveToMap(m, 3, 3), MAP);
		for (let i = 0; i < 60 && (await where()).map !== MAP; i++) await sleep(100);
		await sleep(600);
	}
	await page.evaluate(() => { const P = window.__ow.player; P.tx = 3; P.ty = 3; P.x = 48; P.y = 48; P.facing = 'up'; });

	// ===== 2. A at the panel opens the Kabuto puzzle =====
	await key('z'); await sleep(600);
	let pz = await puzzle();
	const INITIAL = [0, 1, 2, 3, 4, 5, 6, 11, 12, 17, 18, 23, 24, 29, 30, 35];
	A(pz.open, '2. A at the panel opens the UNOWN PUZZLE');
	A(pz.open && pz.which === 0, '2. ...the KABUTO one (setval UNOWNPUZZLE_KABUTO)', JSON.stringify({ which: pz.which }));
	A(pz.open && [...pz.pieces.keys()].filter(i => pz.pieces[i]).join() === INITIAL.join() && [...pz.pieces].filter(Boolean).sort((a, b) => a - b).join() === Array.from({ length: 16 }, (_, i) => i + 1).join(),
		'2. its 16 pieces start on the 16 border slots', JSON.stringify(pz.pieces));
	const gfx = await page.evaluate(async () => (await Promise.all(['kabuto', 'omanyte', 'aerodactyl', 'hooh', 'cursor', 'tile_borders', 'start_cancel'].map(n => fetch(`minigames/unown/${n}.png`).then(r => r.status)))).join());
	A(gfx === '200,200,200,200,200,200,200', '2. the decomp graphics are served from overworld/minigames/unown/', gfx);
	// the GB frame's tilemap is drawn: the Kabuto picture's pieces appear on screen
	if (pz.open) {
		if (process.env.SHOT) { await sleep(700); await page.screenshot({ path: process.env.SHOT }); }
		await key('ArrowRight'); await sleep(150);
		const moved = (await puzzle()).cursor;
		A(moved === 1, '2. the d-pad moves the cursor', String(moved));
		await key('ArrowLeft');
	}

	// ===== 3. quit: unsolved =====
	await key('x'); await sleep(500);
	pz = await puzzle();
	const after = await where();
	A(!pz.open && !(await flag('EVENT_SOLVED_KABUTO_PUZZLE')), '3. quitting leaves the puzzle unsolved', JSON.stringify({ open: pz.open }));
	A(after.map === MAP && !(await W(() => window.__ow.cutscene.blocking)), '3. ...you stay in the chamber and the script ends', JSON.stringify(after));

	// ===== 4. solve it =====
	await page.evaluate(() => { const P = window.__ow.player; P.tx = 3; P.ty = 3; P.x = 48; P.y = 48; P.facing = 'up'; });
	await key('z'); await sleep(600);
	A((await puzzle()).open, '4. the panel opens the puzzle again');
	// test hook: every piece home except piece 16, parked on slot 0 under the cursor
	await page.evaluate(async () => {
		const { unownPuzzle: u } = await import('./unown_puzzle.js');
		u.pieces = new Array(36).fill(0);
		for (let r = 1; r <= 4; r++) for (let c = 1; c <= 4; c++) u.pieces[r * 6 + c] = (r - 1) * 4 + c;
		u.pieces[28] = 0; u.pieces[0] = 16; u.cursor = 0; u.held = 0;
		window.__cells = [];
		const w = window.__ow.world, set = w.setGridValue.bind(w);
		w.setGridValue = (x, y, v) => { window.__cells.push([w.current.name, x, y, v]); return set(x, y, v); };
	});
	await key('z');                         // pick piece 16 up
	A((await puzzle()).held === 16, '4. A picks the piece up');
	await key('ArrowDown', 4); await key('ArrowRight', 4);
	A((await puzzle()).cursor === 28, '4. the cursor walks to the last hole', String((await puzzle()).cursor));
	await key('z');                         // put it down: solved
	pz = await puzzle();
	A(pz.solved && pz.open, '4. placing the last piece solves it (and waits for a button)', JSON.stringify({ solved: pz.solved }));
	await key('z');                         // SimpleWaitPressAorB
	for (let i = 0; i < 60 && (await where()).map === MAP; i++) await sleep(100);
	await sleep(800);
	A(await flag('EVENT_SOLVED_KABUTO_PUZZLE'), '4. solving sets EVENT_SOLVED_KABUTO_PUZZLE');
	A(await flag('ENGINE_UNLOCKED_UNOWNS_A_TO_K'), '4. ...and unlocks UNOWN A to K');
	const cells = await W(() => window.__cells || []);
	const holes = cells.filter(c => c[0] === MAP && c[2] >= 2 && c[2] <= 3 && c[1] >= 2 && c[1] <= 5);
	A(holes.length === 8 && holes.find(c => c[1] === 3 && c[2] === 3)?.[3] === 0, '4. the floor changeblocks open the hole', JSON.stringify(holes));
	const fell = await where();
	A(fell.map === 'RuinsOfAlphInnerChamber', '4. ...and warpcheck drops you into the inner chamber', JSON.stringify(fell));
	A(!errors.length, 'no page errors', errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: test threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
