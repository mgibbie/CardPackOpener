// ilex_cut_test.mjs — CUT clears Crystal's block trees (Ilex Forest first).
//
// 2026-10-02, Instinct's bug report: in Ilex Forest, CUT on the tree at (8,25)
// said it worked, but the path stayed blocked — "There's nothing here to CUT"
// on a retry. Crystal paints its cut trees into the map blocks; our port seeded
// a tree OBJECT over that solid tile, and cutting removed only the object. Now
// tools/gen_cut_blocks.mjs lists every Crystal block tree (40 on 23 maps) with
// its replacement tile, and CUT swaps the tile.
//   1. data: Ilex (8,25) is a solid tree that cuts to a walkable tile; every
//      listed tree is solid and every replacement walkable
//   2. Ilex: the tree blocks; CUT (party menu path, 2 Johto badges) opens it and
//      the player walks through to (8,24) and on north
//   3. like every cut tree it grows back next visit — and can be cut again
//
//   node overworld/tests/ilex_cut_test.mjs
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
const PORT = 9207;
const STATE = { username: 'ilexcut', friendCode: 'ILEX01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'diglett', name: 'DIGLETT', level: 25, gender: 'M', friend: 70, types: ['Ground'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 50, def: 30, spa: 30, spd: 40, spe: 80 }, maxHP: 60, curHP: 60,
	exp: 15625, moves: [{ id: 'cut', name: 'Cut', pp: 30, maxPp: 30 }, { id: 'scratch', name: 'Scratch', pp: 35, maxPp: 35 }], sprite: 's50.png', num: 50,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
{
	let d = {};
	try { d = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'cut_blocks.json'), 'utf8')).maps || {}; } catch (e) {}
	const ilex = (d.MAP_ILEX_FOREST || []).find(([x, y]) => x === 8 && y === 25);
	A(ilex && (ilex[2] & 0xC00) && !(ilex[3] & 0xC00), '1. Ilex (8,25) is listed: a solid tree tile that cuts to a walkable one', JSON.stringify(ilex));
	const all = Object.values(d).flat();
	A(all.length >= 30 && all.every(([, , t, c]) => (t & 0xC00) && !(c & 0xC00)), `1. all ${all.length} Crystal block trees: solid tree -> walkable replacement`);
}

// ===== 2-3. in game =====
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
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const closeDialogs = () => page.evaluate(async () => {
		const O = window.__ow; const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		for (let i = 0; i < 60 && O.dialog.blocking; i++) { press('z'); await new Promise(r => setTimeout(r, 60)); }
		return !O.dialog.blocking;
	});
	const place = (x, y, facing) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing);
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(400); };
	const cut = () => page.evaluate(async () => { const F = await import('./ow_fieldmoves.js'); F.useFieldMove('cut', window.__ow.party[0]); });
	const tile = () => W(() => ({ v: window.__ow.world.gridAt(8, 25), pass: window.__ow.world.isPassable(8, 25), obj: !!window.__ow.items.fieldObjAt(8, 25) }));

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=IlexForest&x=8&y=26`, { waitUntil: 'domcontentloaded' });
	await boot('IlexForest');
	await place(8, 26, 'up');
	A(!(await tile()).pass, '2. setup: the tree at (8,25) blocks the path', JSON.stringify(await tile()));
	await walk('ArrowUp');
	A((await pos()).y === 26, '2. ...walking up bumps', JSON.stringify(await pos()));

	await place(8, 26, 'up');
	await cut();
	const said = await W(() => JSON.stringify(window.__ow.dialog.pages || ''));
	await closeDialogs();
	const after = await tile();
	A(/CUT down/.test(said) && after.pass && !after.obj && after.v === 4, '2. CUT: "The tree was CUT down!" and the tile is now walkable path (4)', JSON.stringify({ said, after }));
	await walk('ArrowUp');
	await walk('ArrowUp');
	const p = await pos();
	A(p.map === 'IlexForest' && p.x === 8 && p.y <= 24, '2. the player walks through (8,25) and on north', JSON.stringify(p));

	// 3. leave and come back: the tree has grown back, and CUT works again
	await page.evaluate(() => window.__ow.moveToMap('Route34IlexForestGate', 4, 4));
	for (let i = 0; i < 60 && (await mapName()) !== 'Route34IlexForestGate'; i++) await sleep(100);
	await page.evaluate(() => window.__ow.moveToMap('IlexForest', 8, 26));
	for (let i = 0; i < 60 && (await mapName()) !== 'IlexForest'; i++) await sleep(100);
	await sleep(600);
	const back = await tile();
	A(back.v === 3087 && !back.pass && back.obj, '3. re-entering: the tree has grown back, like every cut tree (tile and obstacle both)', JSON.stringify(back));
	await place(8, 26, 'up');
	await cut();
	await closeDialogs();
	A((await tile()).pass, '3. ...and CUT clears it again', JSON.stringify(await tile()));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
