// blackthorn_boulders_test.mjs — Crystal's STONE TABLE: a boulder shoved into its
// hole falls through, and the floor below gets its bridge.
//
// 2026-10-09, Instinct's blocker (bug:1791584933966): in Blackthorn Gym 2F the
// boulder pushed from (2,3) onto the hole (2,5) just sat there; all three
// EVENT_BOULDER_IN_BLACKTHORN_GYM_* stayed false, so 1F's callback never laid the
// bridges and Clair was unreachable. Crystal decides the fall per map
// (BlackthornGym2F's `stonetable` rows: this boulder on that warp -> disappear it),
// not by the tile like FRLG; the port only had FRLG's rule, and items.js dropped
// Crystal's EVENT_* boulder flags. Ice Path B1F's table also shows the boulder's
// twin on the floor below (clearevent EVENT_BOULDER_IN_ICE_PATH_NA).
//   1. Blackthorn 2F: STRENGTH, push (2,3) down twice -> it falls, flag set, text
//   2. 1F: the bridge for boulder 2 is laid (the callback's changeblock at 2,4)
//   3. 2F again: the fallen boulder stays gone
//   4. Ice Path B1F: boulder 1 into (11,2) -> falls, 1A (its twin below) shown
//   node overworld/tests/blackthorn_boulders_test.mjs
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
const PORT = 9370;
const STATE = { username: 'blackthorn', friendCode: 'BLKTH1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'machoke', name: 'MACHOKE', level: 40, gender: 'M', friend: 70, types: ['Fighting'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 90, def: 60, spa: 40, spd: 50, spe: 50 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'strength', name: 'Strength', pp: 15, maxPp: 15 }], sprite: 's67.png', num: 67,
}];
const FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, EVENT_CLEARED_RADIO_TOWER: true };
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
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party, flags) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true } }, champion: {} }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY, FLAGS);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.HM_FIELD && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const goMap = async (m, x, y) => {
		await W((m, x, y) => window.__ow.moveToMap(m, x, y), m, x, y);
		for (let i = 0; i < 80 && (await W(() => window.__ow.world.current.name)) !== m; i++) await sleep(100);
		await sleep(900);
	};
	const boulders = () => W(() => window.__ow.items.fieldObjs.filter(o => o.kind === 'boulder').map(o => [o.tx, o.ty, o.flag]));
	const flag = f => W(f => window.__ow.Story.getFlag(f), f);
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.setTile(x, y); P.facing = f; }, x, y, facing);
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(450); };
	const strength = async () => {
		await W(() => window.__ow.HM_FIELD.strength.use());
		for (let i = 0; i < 10 && await W(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(120); }
	};
	const dialogText = () => W(() => window.__ow.dialog.pages ? window.__ow.dialog.pages.flat().join(' ') : '');

	// the 1F cell the bridge for boulder 2 replaces, before anything has fallen
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=BlackthornGym1F&x=5&y=15`, { waitUntil: 'domcontentloaded' });
	await boot('BlackthornGym1F');
	const cells = () => W(() => [[2, 4], [3, 4], [2, 5], [3, 5]].map(([x, y]) => window.__ow.world.gridAt(x, y)));
	const cellBefore = await cells();

	// ===== 1. 2F: the push =====
	await goMap('BlackthornGym2F', 2, 2);
	const b0 = await boulders();
	A(b0.some(([x, y, f]) => x === 2 && y === 3 && f === 'EVENT_BOULDER_IN_BLACKTHORN_GYM_2'), '1. the (2,3) boulder carries its Crystal event flag', JSON.stringify(b0));
	await place(2, 2, 'down');
	await strength();
	await place(2, 2, 'down');
	await walk('ArrowDown');
	await walk('ArrowDown');
	const said = await dialogText();
	const b1 = await boulders();
	A(!b1.some(([x, y]) => x === 2 && (y === 5 || y === 4)), '1. pushed onto the hole (2,5), the boulder falls through instead of sitting there', JSON.stringify(b1));
	A(await flag('EVENT_BOULDER_IN_BLACKTHORN_GYM_2') === true, '1. EVENT_BOULDER_IN_BLACKTHORN_GYM_2 is set');
	A(/boulder fell/i.test(said), '1. "The boulder fell through!"', said);
	for (let i = 0; i < 6 && await W(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(120); }

	// ===== 2. 1F: the bridge =====
	await goMap('BlackthornGym1F', 5, 15);
	const cellAfter = await cells();
	A(JSON.stringify(cellAfter) === JSON.stringify([3092, 7, 52, 3091]) && JSON.stringify(cellBefore) !== JSON.stringify(cellAfter), "2. on 1F the callback lays boulder 2's bridge (the changeblock's cells at 2,4)", JSON.stringify({ cellBefore, cellAfter }));

	// ===== 3. 2F again =====
	await goMap('BlackthornGym2F', 1, 7);
	const b3 = await boulders();
	A(!b3.some(([, , f]) => f === 'EVENT_BOULDER_IN_BLACKTHORN_GYM_2'), '3. back on 2F the fallen boulder stays gone', JSON.stringify(b3));

	// ===== 4. Ice Path B1F =====
	await goMap('IcePathB1F', 3, 15);
	await W(() => { const b = window.__ow.items.fieldObjs.find(o => o.kind === 'boulder' && o.flag === 'EVENT_BOULDER_IN_ICE_PATH_1'); b.tx = 11; b.ty = 3; });
	await place(11, 4, 'up');
	await strength();
	await place(11, 4, 'up');
	// the push itself (the walk on Ice Path's ice floor slides instead; part 1 drives the real input)
	const pushed = await W(() => window.__ow.player.pushBoulder(11, 3, 0, -1));
	A(pushed === true, '4. the push goes through', String(pushed));
	A(await flag('EVENT_BOULDER_IN_ICE_PATH_1') === true, '4. Ice Path B1F: boulder 1 pushed into (11,2) falls (its flag set)', JSON.stringify(await boulders()));
	A(await flag('EVENT_BOULDER_IN_ICE_PATH_1A') === false, '4. ...and its twin on the floor below is shown (EVENT_BOULDER_IN_ICE_PATH_1A cleared)');

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
