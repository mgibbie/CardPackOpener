// gate_edge_test.mjs — a badge guard on a map's EDGE stops you at the edge.
//
// 2026-10-02, Instinct's bug report: walking east from Route 42 into Mahogany
// Town with 5 shared-tier badges (the guard wants 6) loaded Mahogany and set
// the player down at (0,9) — ON the GYM GUIDE's solid column, boxed in by rock
// to the east and guard tiles north/south — and walking back west just repeated
// the guard's line. Fly was the only way out.
//
// The guard stands on Mahogany's west edge; the player walks there from Route 42
// through a map CONNECTION, which only the quest backstop (Quest.blocked) gated.
// That backstop reads the region you STARTED in, so a Kanto starter walking in
// Johto was never stopped, and nothing else checked the far side's guard.
//   1. walking east into the guard: you stay on Route 42, at its east edge, and
//      the guard's line shows (it is the guard who stops you)
//   2. you can walk straight back west along Route 42
//   3. a save already standing on the guard tile (the stranded case) can retreat
//      west to Route 42
//   4. with 6 shared badges the guard is gone and the road into Mahogany opens
//
//   node overworld/tests/gate_edge_test.mjs
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
const PORT = 9205;
const STATE = { username: 'gateedge', friendCode: 'GEDGE1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
// Instinct's badges: 5 in each shared region (Johto 6 makes no difference — the
// tier is the minimum across regions)
const BADGES = { badges: {
	JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true },
	KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true },
	HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, feather: true },
}, champion: {} };
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
	const open = async (map, x, y, badges) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, badges) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');   // a KANTO starter, walking in Johto (Instinct)
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, badges);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		const W = f => page.evaluate(f);
		const api = {
			page, ctx, errors,
			pos: () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty })),
			place: (x, y, f) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f),
			said: () => W(() => JSON.stringify(window.__ow.dialog.blocking ? window.__ow.dialog.pages : '')),
			closeDialog: async () => { for (let i = 0; i < 10 && await W(() => !!window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(120); } },
			walk: async (k, ms = 260) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(500); },
			settle: async () => { for (let i = 0; i < 60 && await W(() => !!(window.__ow.player.moving || window.__ow.S?.loading)); i++) await sleep(100); await sleep(500); },
		};
		return api;
	};

	// ===== 1-2. walking east into the guard =====
	{
		const g = await open('Route42', 58, 9, BADGES);
		await g.place(58, 9, 'right');
		await g.walk('ArrowRight', 600);   // two steps' worth: onto the edge (59,9), then into the guard
		await g.settle();
		const at = await g.pos();
		const said = await g.said();
		A(at.map === 'Route42' && at.x === 59 && at.y === 9, '1. walking east into the guard stops you on Route 42\'s edge (59,9), not on his tile in Mahogany', JSON.stringify(at));
		A(/6 badges/.test(said), '1. ...and it is the GYM GUIDE who stops you', said.slice(0, 120));
		await g.closeDialog();
		await g.walk('ArrowLeft', 600);
		await g.settle();
		const back = await g.pos();
		A(back.map === 'Route42' && back.x < 59, '2. you can walk straight back west along Route 42', JSON.stringify(back));
		A(g.errors.length === 0, '1-2. no page errors', JSON.stringify(g.errors.slice(0, 3)));
		await g.ctx.close();
	}

	// ===== 3. already standing on the guard tile: retreat works =====
	{
		const g = await open('MahoganyTown', 0, 9, BADGES);
		await g.place(0, 9, 'left');
		await g.walk('ArrowLeft');
		await g.settle();
		await g.closeDialog();
		await g.walk('ArrowLeft');
		await g.settle();
		const at = await g.pos();
		A(at.map === 'Route42', '3. a save stranded ON the guard tile can walk west back to Route 42', JSON.stringify({ at, said: await g.said() }));
		A(g.errors.length === 0, '3. no page errors', JSON.stringify(g.errors.slice(0, 3)));
		await g.ctx.close();
	}

	// ===== 4. six shared badges: the road opens =====
	{
		const six = JSON.parse(JSON.stringify(BADGES));
		six.badges.KANTO.marsh = true; six.badges.HOENN.balance = true;
		const g = await open('Route42', 58, 9, six);
		const tier = await g.page.evaluate(async () => (await import('./quest.js')).globalTier());
		await g.place(58, 9, 'right');
		await g.walk('ArrowRight', 600);
		await g.settle();
		const at = await g.pos();
		A(tier >= 6 && at.map === 'MahoganyTown', '4. with 6 shared badges the guard is gone and you walk into Mahogany', JSON.stringify({ tier, at }));
		A(g.errors.length === 0, '4. no page errors', JSON.stringify(g.errors.slice(0, 3)));
		await g.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
