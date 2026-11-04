// crystal_signs_test.mjs — Crystal's directional and conditional signs are back.
//
// pokecrystal's `bg_event x, y, BGEVENT_UP|DOWN|LEFT|RIGHT, Label` is read only
// while facing that way, and `BGEVENT_IFSET|IFNOTSET, Label` (a `conditional_event
// FLAG, .Script`) only while FLAG is set / clear. The conversion kept BGEVENT_READ
// only, so ~60 of them never existed in the port: the Rocket base's security
// cameras and locked doors, the Ruins of Alph puzzle panels, the slot and
// card-flip machines, the vending machines (patched one-off before). They come
// back through crystal_callbacks.json `signs` (tools/gen_crystal_callbacks.mjs).
//   1. a security camera runs only when faced from the right side
//   2. a locked door (IFNOTSET) runs while its flag is clear, and not once it's set
//   3. a Ruins of Alph puzzle panel, a slot machine and a vending machine run
//
//   node overworld/tests/crystal_signs_test.mjs
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
const PORT = 9232;
const STATE = { username: 'crsigns', friendCode: 'CRSG01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	const go = async (map, x, y) => {
		await W(async ([m, x, y]) => { await window.__ow.moveToMap(m, x, y); }, [map, x, y]).catch(() => page.evaluate(async (m, x, y) => window.__ow.moveToMap(m, x, y), map, x, y));
		for (let i = 0; i < 60 && (await W(() => window.__ow.world.current?.name)) !== map; i++) await sleep(100);
		await sleep(500);
	};
	const read = async (x, y, facing) => {
		// clear any open text, stand, face, press Z; report the label the interaction started
		for (let i = 0; i < 10 && (await W(() => window.__ow.dialog.blocking || window.__ow.cutscene.blocking)); i++) { await page.keyboard.press('x'); await sleep(80); }
		await page.evaluate(async (x, y, f) => {
			const { S } = await import('./ow_state.js');
			S.lastScriptLabel = null;
			const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f;
		}, x, y, facing);
		await page.keyboard.press('z');
		await sleep(400);
		return page.evaluate(async () => (await import('./ow_state.js')).S.lastScriptLabel);
	};
	const setFlag = (f, v) => page.evaluate(async (f, v) => { const E = await import('./events.js'); if (v) E.setFlag(f); else E.clearFlag(f); }, f, v);

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=TeamRocketBaseB1F&x=24&y=3`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await W(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'TeamRocketBaseB1F')).catch(() => false)); i++) await sleep(100);
	await sleep(800);

	// ===== 1. a security camera: BGEVENT_UP at (24,1) =====
	A(await read(24, 2, 'up') === 'TeamRocketBaseB1FSecurityCamera', '1. facing UP below the Rocket security camera reads it');
	A(await read(23, 1, 'right') !== 'TeamRocketBaseB1FSecurityCamera', '1. ...but not from the side (it is a BGEVENT_UP sign)');

	// ===== 2. a locked door: BGEVENT_IFNOTSET EVENT_OPENED_DOOR_TO_ROCKET_HIDEOUT_TRANSMITTER =====
	await go('TeamRocketBaseB2F', 14, 13);
	await setFlag('EVENT_OPENED_DOOR_TO_ROCKET_HIDEOUT_TRANSMITTER', false);
	A(await read(14, 13, 'up') === 'TeamRocketBaseB2FLockedDoor.Script', '2. the locked transmitter door reads while its flag is clear');
	await setFlag('EVENT_OPENED_DOOR_TO_ROCKET_HIDEOUT_TRANSMITTER', true);
	A(await read(14, 13, 'up') !== 'TeamRocketBaseB2FLockedDoor.Script', '2. ...and not once the door is open (IFNOTSET)');

	// ===== 3. puzzle, slot machine, vending machine =====
	await go('RuinsOfAlphKabutoChamber', 3, 3);
	A(await read(3, 3, 'up') === 'RuinsOfAlphKabutoChamberPuzzle', '3. the Ruins of Alph puzzle panel reads (BGEVENT_UP)');
	await go('GoldenrodGameCorner', 5, 11);
	A(await read(5, 11, 'right') === 'GoldenrodGameCornerSlotsMachineScript', '3. a Goldenrod slot machine reads facing it (BGEVENT_RIGHT)');
	await go('GoldenrodDeptStore6F', 8, 2);
	A(await read(8, 2, 'up') === 'GoldenrodVendingMachine', '3. the 6F vending machine still reads (now from the general mechanism)');
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
