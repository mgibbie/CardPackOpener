// pocketenhanced_arcade_test.mjs — the way into Pocket Enhanced from the overworld: the card table in the Vermilion
// Pokémon Fan Club (overworld/arcade.js + ow_input.js), played with the overworld CONTROLLER:
//   1. the box stands at (10,8): solid (base + the tile above), interactable; the room is still walkable around it
//      (every floor tile that could be reached before can still be reached, and both doors)
//   2. from (7,8) the D-pad walks the player right into it: they stop at (9,8), facing it
//   3. confirm opens "A card table for POCKET ENHANCED! Play?"; confirming saves party + position and opens
//      /pocketenhanced/?direct=1
//   4. Pocket Enhanced (opened from the table) offers "Back to the overworld", which returns the player beside it;
//      opened any other way it does not
//   node overworld/tests/pocketenhanced_arcade_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8796;
const SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
if (!fs.existsSync(path.join(ROOT, 'overworld/data/maps/VermilionCity_PokemonFanClub_map.json'))) { console.log('skip - overworld/data not present'); process.exit(0); }

const STATE = { username: 'arcadeplayer', friendCode: 'ARCD01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const LEAD = { speciesId: 'pikachu', name: 'PIKACHU', level: 20, gender: 'M', friend: 70, types: ['Electric'], ability: 'static',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 50, atk: 35, def: 25, spa: 35, spd: 30, spe: 60 },
	maxHP: 50, curHP: 50, exp: 8000, sprite: 's25.png', num: 25, moves: [{ id: 'thundershock', name: 'Thunder Shock', pp: 30, maxPp: 30 }] };
// MicaSurvivor's save for this account (the stub server): a partner already, so it opens on the menu
const MS_SAVE = { v: 3, name: 'arcadeplayer', created: 1, updated: 1, coins: 500, owned: { 25: { at: 1, from: 'starter' } }, shiny: {}, partner: 25, starter: 25, stats: { runs: 0, bestTime: 0, bestLevel: 0, totalKills: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.md': 'text/markdown' };
let msRev = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch { }
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'micasurvivor-save-get') return res.end(JSON.stringify({ rev: msRev, save: MS_SAVE }));
		if (b.action === 'micasurvivor-save-put') return res.end(JSON.stringify({ ok: true, rev: ++msRev }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, lead) => {
		// a fake standard-mapping pad, live in the page (site/gamepad.js reads window.__owFakePads)
		const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard',
			buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
		window.__owFakePads = [pad];
		window.__pad = pad;
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 'arcade-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_repel_v1', '99999');
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, LEAD);
	const owReady = () => waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data && window.__ow.world.current.name === 'VermilionCity_PokemonFanClub')), 30000);
	const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
	const hold = (b, on) => page.evaluate((b, on) => { window.__pad.buttons[b] = { pressed: on, value: on ? 1 : 0 }; }, b, on);
	const tap = async b => { await hold(b, true); await sleep(90); await hold(b, false); await sleep(160); };
	const BTN = { right: 1, dright: 15 };   // Nintendo layout: the RIGHT face button confirms
	const pos = () => page.evaluate(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty, facing: window.__ow.player.facing, map: window.__ow.world.current.name }));

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=VermilionCity_PokemonFanClub&x=7&y=8`, { waitUntil: 'domcontentloaded' });
	A(await owReady(), 'the overworld opens in the Vermilion Pokémon Fan Club');
	await sleep(1500);

	// ===== 1. the box =====
	const box = await page.evaluate(async () => {
		const { arcade } = await import('./ow_core.js'), w = window.__ow.world, L = w.current.layout;
		const open = (x, y) => x >= 0 && y >= 0 && x < L.width && y < L.height && w.isPassable(x, y);
		const reach = (blocked) => { const seen = new Set(['7,8']), q = [[7, 8]]; while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!seen.has(k) && open(nx, ny) && !(blocked && arcade.blocks(nx, ny))) { seen.add(k); q.push([nx, ny]); } } } return seen; };
		const before = reach(false), after = reach(true);
		return { kind: arcade.kindAt(10, 8), base: arcade.blocks(10, 8), top: arcade.blocks(10, 7), other: arcade.kindAt(9, 8), lost: [...before].filter(k => !after.has(k)), doors: ['4,10', '5,10', '6,10'].every(k => after.has(k) || after.has(k.replace(',10', ',9'))) };
	});
	A(box.kind === 'pocket' && box.base && box.top && box.other === null, 'a solid Pocket Enhanced card table at (10,8) (and the tile above it)', JSON.stringify(box));
	A(box.lost.sort().join(' ') === '10,7 10,8' && box.doors, 'it takes only its own two tiles: every other floor tile, and the doors, can still be reached', JSON.stringify(box.lost));

	// ===== 2. walk to it with the D-pad =====
	await hold(BTN.dright, true);
	await waitFor(async () => (await pos()).x === 9, 4000);
	await sleep(700);   // keep pushing: the box stops them
	await hold(BTN.dright, false);
	await sleep(400);
	const p = await pos();
	A(p.x === 9 && p.y === 8 && p.facing === 'right', 'the D-pad walks to (9,8); the box stops them, facing it', JSON.stringify(p));
	await shot('pocket_fan_club.png');

	// ===== 3. confirm -> the prompt -> Pocket Enhanced =====
	await tap(BTN.right);
	const said = await waitFor(() => page.evaluate(() => window.__ow.dialog.blocking && /POCKET ENHANCED/.test((window.__ow.dialog.pages || []).map(x => [].concat(x).join(' ')).join(' '))), 4000);
	A(said, 'confirm at the box: "A card table for POCKET ENHANCED! Play?"');
	for (let i = 0; i < 6 && !(await page.evaluate(() => location.pathname).catch(() => '')).startsWith('/pocketenhanced'); i++) {
		await tap(BTN.right).catch(() => { });
		await sleep(300);
	}
	A(await waitFor(() => page.evaluate(() => location.pathname === '/pocketenhanced/' && location.search === '?direct=1'), 10000), 'confirming opens /pocketenhanced/?direct=1');
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'));
	A(saved && saved.map === 'VermilionCity_PokemonFanClub' && saved.x === 9 && saved.y === 8, 'position saved before leaving (the Fan Club, beside the box)', JSON.stringify(saved));

	// ===== 4. the way back =====
	A(await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000), 'Pocket Enhanced opens');
	const back = await page.evaluate(() => [...document.querySelectorAll('a.pe-back')].map(a => ({ href: a.getAttribute('href'), text: a.textContent })));
	A(back.length === 1 && back[0].href === '/overworld/' && back[0].text === '← Back to the overworld', 'opened from the box, its menu offers "Back to the overworld"', JSON.stringify(back));
	await shot('pocket_menu_from_overworld.png');
	await page.click('a.pe-back');
	A(await owReady(), 'back in the overworld: the Fan Club');
	const p2 = await pos();
	A(p2.x === 9 && p2.y === 8, 'standing beside the box again', JSON.stringify(p2));
	// opened on its own, the game has no such link
	await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	A(await page.evaluate(() => !!document.querySelector('.pe-list') && !document.querySelector('a.pe-back')), 'opened on its own, there is no overworld link');
	A(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
