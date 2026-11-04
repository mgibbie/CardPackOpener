// kanto_scripts_test.mjs — five FireRed script bugs from Instinct's reports
// (2026-10-06/07), each against the real map and script:
//   1. Silph Co's elevator opens its floor list (special ListMenu) and lets you
//      out on the floor you chose — it sent every ride to 11F
//   2. Route 10's Oak's Aide checks your caught count (GetPokedexCount ->
//      VAR_0x8006 vs the map's `.equ REQUIRED_OWNED_MONS, 20`) — he handed the
//      EVERSTONE over at 19
//   3. a BICYCLE from the bike shop counts at the Cycling Road gate
//      (FLAG_GOT_BICYCLE) — the guard turned riders back
//   4. Cinnabar Gym's ON_LOAD re-opens a shutter whose quiz is done
//   5. a static wild battle resumed after a reload runs the rest of its script
//      (Power Plant ELECTRODE: the fought flag, the object removed)
//
//   node overworld/tests/kanto_scripts_test.mjs
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
const PORT = 9255;
const STATE = { username: 'kantoscripts', friendCode: 'KSCR1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 180, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 180, curHP: 180,
	exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
// the first 20 Kanto dex entries (national #1-20)
const KANTO = ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle', 'blastoise', 'caterpie',
	'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot', 'rattata', 'raticate'];
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

const ONLY = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
const want = n => !ONLY || ONLY.has(n);

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const boot = async (page, map) => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	// a fresh page per scene, seeded with its own save
	const open = async (map, x, y, seed = {}) => {
		const page = await browser.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, seed) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, ...(seed.flags || {}) }, vars: seed.vars || {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
			if (seed.bag) localStorage.setItem('magepunk_bag_v1', JSON.stringify(seed.bag));
			if (seed.dex) localStorage.setItem('magepunk_dex_v1', JSON.stringify(seed.dex));
		}, STATE, PARTY, seed);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(page, map);
		return { page, errors };
	};
	const place = (page, x, y, facing) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, facing);
	const key = async (page, k) => { await page.keyboard.press(k); await sleep(120); };
	const walk = async (page, k) => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(400); };
	// press A through dialogs until a menu opens or everything is calm
	const drive = page => page.evaluate(async () => {
		const C = await import('./choice.js'), O = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 20000) {
			if (C.choiceMenu.open) return 'menu';
			const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
			if (!d && !c && !O.battle.blocking && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
			if (d) press('z');
			await new Promise(r => setTimeout(r, 40));
		}
		return 'timeout';
	});
	const choice = page => page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, options: c.options.slice(), idx: c.idx }; });
	const story = page => page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));
	const where = page => page.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const waitMap = async (page, m) => { for (let i = 0; i < 100 && (await where(page)).map !== m; i++) await sleep(100); await sleep(600); return (await where(page)).map === m; };

	// ===== 1. Silph Co elevator =====
	if (want(1)) {
		const { page, errors } = await open('SilphCo_1F', 22, 4);
		await place(page, 22, 4, 'up');
		await walk(page, 'ArrowUp');
		A(await waitMap(page, 'SilphCo_Elevator'), '1. the 1F lift door takes you into the elevator', JSON.stringify(await where(page)));
		await place(page, 0, 3, 'up');
		await key(page, 'z');
		const st = await drive(page);
		const c = await choice(page);
		A(st === 'menu' && c.options.length === 12 && c.options[0] === '11F' && c.options[10] === '1F' && c.options[11] === 'EXIT',
			'1. the panel opens the floor list: 11F ... 1F, EXIT', JSON.stringify([st, c]));
		A(c.idx === 10, '1. its cursor starts on the floor you came from (1F)', String(c.idx));
		for (let i = 0; i < 4; i++) await key(page, 'ArrowUp');   // 1F -> 5F
		await key(page, 'z');
		await drive(page);
		await place(page, 2, 4, 'down');
		await walk(page, 'ArrowDown');
		A(await waitMap(page, 'SilphCo_5F'), '1. choosing 5F lets you out on 5F (it was always 11F)', JSON.stringify(await where(page)));
		A(!errors.length, '1. no page errors', errors.slice(0, 3).join(' | '));
		await page.close();
	}

	// ===== 2. Route 10 Oak's Aide =====
	if (want(2)) for (const [n, gives] of [[19, false], [20, true]]) {
		const { page } = await open('Route10_PokemonCenter_1F', 11, 5, { bag: { pokeball: 5 }, dex: { seen: KANTO.slice(0, n), caught: KANTO.slice(0, n) } });
		await place(page, 11, 5, 'right');
		await key(page, 'z');
		for (let i = 0; i < 40; i++) {   // YES to "shall I check?", then read on
			const s = await drive(page);
			if (s === 'menu') { await key(page, 'z'); continue; }
			if (s === 'idle') break;
		}
		const bag = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
		const f = (await story(page)).flags || {};
		const v = await page.evaluate(async () => (await import('./events.js')).getVar('VAR_0x8006'));
		A(!!bag.everstone === gives && !!f.FLAG_GOT_EVERSTONE_FROM_OAKS_AIDE === gives,
			`2. ${n} caught: the aide ${gives ? 'gives' : 'withholds'} the EVERSTONE (needs 20)`, JSON.stringify({ everstone: bag.everstone, flag: f.FLAG_GOT_EVERSTONE_FROM_OAKS_AIDE, VAR_0x8006: v }));
		A(v === n, `2. GetPokedexCount left the caught count (${n}) in VAR_0x8006`, String(v));
		await page.close();
	}

	// ===== 3. the Cycling Road gate =====
	if (want(3)) {
		const { page } = await open('Route18_EastEntrance_1F', 8, 6, { bag: { bicycle: 1 } });
		const f = (await story(page)).flags || {};
		A(!!f.FLAG_GOT_BICYCLE, '3. owning a BICYCLE sets FLAG_GOT_BICYCLE', JSON.stringify(Object.keys(f)));
		await place(page, 7, 6, 'left');
		await walk(page, 'ArrowLeft');
		await drive(page);
		await walk(page, 'ArrowLeft');
		await drive(page);
		const p = await where(page);
		A(p.x <= 5, '3. walking west through the gate is not turned back ("You need a BICYCLE")', JSON.stringify(p));
		await page.close();
	}

	// ===== 4. Cinnabar Gym, door 1 after a reload =====
	if (want(4)) {
		const { page } = await open('CinnabarIsland_Gym', 27, 12, { flags: { FLAG_CINNABAR_GYM_QUIZ_1: true } });
		const open9 = await page.evaluate(() => [window.__ow.world.isPassable(26, 9), window.__ow.world.isPassable(27, 9)]);
		A(open9[0] && open9[1], '4. with quiz 1 done, the first shutter (26-27, 9) is open on entering', JSON.stringify(open9));
		await page.close();
	}

	// ===== 5. Power Plant ELECTRODE, resumed after a reload =====
	if (want(5)) {
		const { page } = await open('PowerPlant', 29, 38);
		await place(page, 29, 38, 'right');
		await key(page, 'z');
		let started = false;
		for (let i = 0; i < 60 && !started; i++) { started = await page.evaluate(() => !!window.__ow.battle.active); if (!started) await sleep(100); }
		A(started, '5. the fake item at (30,38) starts the ELECTRODE battle');
		await page.evaluate(async () => { const m = await import('./ow_battleresume.js'); m.persistBattle(); });
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null'));
		A(saved && saved.end && saved.end.kind === 'static' && Array.isArray(saved.end.frames), '5. the saved battle carries its script bookmark', JSON.stringify(saved && saved.end));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await boot(page, 'PowerPlant');
		let resumed = false;
		for (let i = 0; i < 60 && !resumed; i++) { resumed = await page.evaluate(() => !!window.__ow.battle.active); if (!resumed) await sleep(100); }
		A(resumed, '5. the battle resumes after the reload');
		await page.evaluate(() => window.__ow.battle.finish('victory'));
		await drive(page);
		await sleep(600);
		const f = (await story(page)).flags || {};
		const shown = await page.evaluate(() => (window.__ow.npcs.list || []).some(n => n.tx === 30 && n.ty === 38 && !n.hidden));
		A(!!f.FLAG_FOUGHT_POWER_PLANT_ELECTRODE_1, '5. the resumed win sets FLAG_FOUGHT_POWER_PLANT_ELECTRODE_1', JSON.stringify(Object.keys(f).filter(k => /ELECTRODE/.test(k))));
		A(!!f.FLAG_HIDE_POWER_PLANT_ELECTRODE_1 && !shown, '5. ...and the ELECTRODE item is gone', JSON.stringify({ hide: f.FLAG_HIDE_POWER_PLANT_ELECTRODE_1, shown }));
		await page.close();
	}
	// ===== 6. ...and an uninterrupted win removes it too =====
	// (the static ending, EventScript_RemoveStaticMon, was never restored: even a
	// live win left the ball on the floor to be fought again)
	if (want(6)) {
		const { page } = await open('PowerPlant', 36, 6);
		await place(page, 36, 6, 'up');
		await key(page, 'z');
		let started = false;
		for (let i = 0; i < 60 && !started; i++) { started = await page.evaluate(() => !!window.__ow.battle.active); if (!started) await sleep(100); }
		A(started, '6. the fake item at (36,5) starts the second ELECTRODE battle');
		await page.evaluate(() => window.__ow.battle.finish('victory'));
		await drive(page);
		const f = (await story(page)).flags || {};
		A(!!f.FLAG_FOUGHT_POWER_PLANT_ELECTRODE_2 && !!f.FLAG_HIDE_POWER_PLANT_ELECTRODE_2, '6. a live win sets the fought flag and removes the ball',
			JSON.stringify(Object.keys(f).filter(k => /ELECTRODE/.test(k))));
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
