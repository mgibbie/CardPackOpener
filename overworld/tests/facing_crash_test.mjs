// facing_crash_test.mjs — a cutscene can never leave an actor facing `undefined`.
//
// Live error reports (2026-09-30 / 10-01, Linux Chrome — a playtester):
//   ow_input.js:161/174  "undefined is not iterable"  — interact()'s
//       `const [dx, dy] = {...}[player.facing]` with player.facing undefined
//   npcs.js:111  "Cannot read properties of undefined (reading '0')" — an NPC's
//       walk frame `walks[this.facing][...]` with facing undefined
// Cause: the movement transpile kept 233 macros it couldn't express as
// { mode: 'raw', macro } with no `dir`; the walk code did `actor.facing = st.dir`
// for them. Now raw steps that mean a direction are translated and the rest do
// nothing, the interpreter only ever assigns a real direction, and the crash
// sites fall back instead of throwing.
//   1. a raw no-op step leaves facing as it was (player and NPC)
//   2. jump_in_place_left faces left; walk_slow_diag_southwest moves down+left;
//      walk_down_affine walks down
//   3. a `face` op with a bad dir changes nothing
//   4. even with facing forced to undefined: Z (interact) and an NPC's walk frame
//      don't throw
//
//   node overworld/tests/facing_crash_test.mjs
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
const PORT = 9189;
const STATE = { username: 'facing', friendCode: 'FACING', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the data really does carry raw steps (the cause)
{
	let raw = 0;
	const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.op === 'move' && Array.isArray(o.steps)) raw += o.steps.filter(s => s.mode === 'raw' && !s.dir).length; for (const v of Object.values(o)) if (typeof v === 'object') walk(v); } };
	const d = path.join(ROOT, 'overworld/data/scripts');
	for (const f of fs.readdirSync(d)) walk(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')));
	A(raw > 100, `setup: the scripts carry ${raw} direction-less raw movement steps`);
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		if (raw.includes('ow-load')) return res.end(JSON.stringify({ ow: null }));
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
	await page.evaluateOnNewDocument(st => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'pikachu', name: 'PIKA', level: 5, types: ['Electric'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20, exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's25.png', num: 25 }]));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown&x=10&y=10`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false)); i++) await sleep(100);
	await sleep(1500);

	// run a hand-made cutscene on the player, to the end
	const run = steps => page.evaluate(async steps => {
		const O = window.__ow;
		O.cutscene.stop();
		O.cutscene.run({ T: [{ op: 'move', who: 'LOCALID_PLAYER', steps }, { op: 'waitmove' }, { op: 'end' }] }, 'T', O.cutsceneCtxForTest());
		for (let i = 0; i < 400 && O.cutscene.blocking; i++) { O.cutscene.update(1 / 30); await new Promise(r => setTimeout(r, 5)); }
		return { facing: O.player.facing, x: O.player.tx, y: O.player.ty, done: !O.cutscene.blocking };
	}, steps);
	const place = (x, y, f) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, f);

	// 1. a raw no-op step
	await place(10, 10, 'up');
	let r = await run([{ mode: 'raw', macro: 'disable_jump_landing_ground_effect' }, { mode: 'raw', macro: 'init_affine_anim' }]);
	A(r.done && r.facing === 'up', 'raw no-op steps leave the player facing up (was: undefined)', JSON.stringify(r));
	// 2. translations
	await place(10, 10, 'up');
	r = await run([{ mode: 'raw', macro: 'jump_in_place_left' }]);
	A(r.facing === 'left' && r.x === 10 && r.y === 10, 'jump_in_place_left faces left without moving', JSON.stringify(r));
	await place(10, 10, 'up');
	r = await run([{ mode: 'raw', macro: 'walk_slow_diag_southwest' }]);
	A(r.x === 9 && r.y === 11 && ['down', 'left'].includes(r.facing), 'walk_slow_diag_southwest moves one tile down and one left', JSON.stringify(r));
	await place(10, 10, 'up');
	r = await run([{ mode: 'raw', macro: 'walk_down_affine' }]);
	A(r.x === 10 && r.y === 11 && r.facing === 'down', 'walk_down_affine walks down', JSON.stringify(r));
	// 3. a face op with a bad dir
	const faced = await page.evaluate(async () => {
		const O = window.__ow; O.player.facing = 'right';
		O.cutscene.stop();
		O.cutscene.run({ T: [{ op: 'face', who: 'LOCALID_PLAYER', dir: 'DIR_NORTHEAST' }, { op: 'end' }] }, 'T', O.cutsceneCtxForTest());
		for (let i = 0; i < 50 && O.cutscene.blocking; i++) O.cutscene.update(1 / 30);
		return O.player.facing;
	});
	A(faced === 'right', 'a face op with a bad dir changes nothing', faced);
	// 4. the crash sites, with facing forced bad
	const before = errors.length;
	await page.evaluate(() => { window.__ow.player.facing = undefined; window.__ow.interact(); });
	await sleep(200);
	A(errors.length === before, 'Z with an undefined facing does not throw (ow_input interact)', JSON.stringify(errors.slice(before)));
	const npcOk = await page.evaluate(() => {
		const O = window.__ow, n = O.npcs.list[0];
		if (!n) return 'no npc';
		const keep = { facing: n.facing, moving: n.moving, moveT: n.moveT };
		n.facing = undefined; n.moving = true; n.moveT = 0.1;
		try { const c = document.createElement('canvas').getContext('2d'); n.draw(c, 0, 0); return true; }
		catch (e) { return String(e.message); }
		finally { Object.assign(n, keep); }
	});
	A(npcOk === true, 'an NPC with an undefined facing draws its walk frame without throwing (npcs.js)', String(npcOk));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
