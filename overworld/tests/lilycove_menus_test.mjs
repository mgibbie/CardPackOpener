// lilycove_menus_test.mjs — Lilycove Department Store's elevator and rooftop vending machine.
//
// Same root cause as Trick House Puzzle 5 (#619): the map transpile dropped the
// commands with no op of their own. The elevator lost its `multichoicedefault
// MULTI_FLOORS` and every `setdynamicwarp`, so the attendant asked "Which floor?"
// and the doors (dest MAP_DYNAMIC) put you back where you came from. The vending
// machine lost its `multichoice`, `checkmoney` and `removemoney`, so it asked
// "Which drink?" and handed out whatever VAR_RESULT held, for free.
// tools/gen_multichoice.mjs now restores all of them (93 maps); this walks both
// with real keys:
//   1. the elevator shows 5F..1F/EXIT with the cursor on the floor you're on
//   2. picking a floor and walking out lands you ON that floor (MAP_DYNAMIC)
//   3. EXIT leaves you where you came from
//   4. the vending machine shows its 3 drinks + EXIT
//   5. a drink costs its price (200/300/350) and lands in the bag
//   6. too little money: the refusal, nothing charged, nothing given
//   7. B closes it; nothing charged
//
//   node overworld/tests/lilycove_menus_test.mjs
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
const PORT = 9180;
const STATE = { username: 'lilycove', friendCode: 'LILY01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
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
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_money', '1000');
	}, STATE, PARTY);
	const W = f => page.evaluate(f);
	const mapName = () => W(() => window.__ow.world.current && window.__ow.world.current.name);
	const pos = () => W(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const choice = () => page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, list: c.list, options: c.options.slice(), idx: c.idx }; });
	// press Z through dialog in the page until a menu opens or everything is still
	const drive = () => page.evaluate(async () => {
		const C = await import('./choice.js'), O = window.__ow;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 20000) {
			if (C.choiceMenu.open) return 'menu';
			const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
			if (!d && !c && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
			if (d) { (window.__said = window.__said || []).push(JSON.stringify(O.dialog.pages || '')); press('z'); }
			await new Promise(r => setTimeout(r, 40));
		}
		return 'timeout';
	});
	const said = () => W(() => (window.__said || []).join(' | '));
	const place = (x, y, facing) => page.evaluate((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing);
	const waitMap = async m => { for (let i = 0; i < 100 && (await mapName()) !== m; i++) await sleep(100); await sleep(600); return (await mapName()) === m; };
	const key = async k => { await page.keyboard.press(k); await sleep(60); };
	const walk = async k => { await page.keyboard.down(k); await sleep(260); await page.keyboard.up(k); await sleep(400); };

	// ===== the ELEVATOR =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LilycoveCity_DepartmentStore_3F&x=2&y=2`, { waitUntil: 'domcontentloaded' });
	await boot('LilycoveCity_DepartmentStore_3F');
	await place(2, 2, 'up');
	await walk('ArrowUp');
	A(await waitMap('LilycoveCity_DepartmentStoreElevator'), 'setup: the 3F elevator door leads into the elevator', JSON.stringify(await pos()));
	// the doors are the bottom-row warps: step off one and back on to go out
	const leave = async x => { await place(x, 4, 'down'); await walk('ArrowDown'); };
	// talk to the attendant (0,5) from the door tile
	const ask = async () => {
		await place(1, 5, 'left');
		await W(() => { window.__said = []; });
		await key('z');
		return (await drive()) === 'menu';
	};
	const opened = await ask();
	const floors = await choice();
	A(opened && JSON.stringify(floors.options) === JSON.stringify(['5F', '4F', '3F', '2F', '1F', 'EXIT']) && floors.list === 'MULTI_FLOORS',
		'[elevator] the attendant shows the floor menu 5F/4F/3F/2F/1F/EXIT', JSON.stringify(floors));
	A(floors.idx === 2, '[elevator] ...with the cursor on 3F, the floor you got on at', String(floors.idx));
	A(/floor/i.test(await said()), '[elevator] ...under "Which floor?"', (await said()).slice(0, 120));
	// ride to 5F: up twice, A
	await key('ArrowUp'); await key('ArrowUp'); await key('z');
	A((await drive()) === 'idle' && !(await choice()).open, '[elevator] choosing 5F closes the menu and ends the scene');
	A(await W(async () => (await import('./events.js')).getVar('VAR_DEPT_STORE_FLOOR')) === 8, '[elevator] the store now knows you are on 5F (DEPT_STORE_FLOORNUM_5F)');
	await leave(1);
	A(await waitMap('LilycoveCity_DepartmentStore_5F'), '[elevator] walking out of the doors lands you on 5F, not back on 3F', JSON.stringify(await pos()));
	const on5 = await pos();
	A(on5.x === 2 && on5.y === 1, '[elevator] ...at the 5F elevator door (2,1)', JSON.stringify(on5));

	// back in from 5F; the cursor starts on 5F; ride to 1F
	await place(2, 2, 'up');
	await walk('ArrowUp');
	await waitMap('LilycoveCity_DepartmentStoreElevator');
	await ask();
	A((await choice()).idx === 0, '[elevator] entering from 5F starts the cursor on 5F', String((await choice()).idx));
	for (let i = 0; i < 4; i++) await key('ArrowDown');
	await key('z'); await drive();
	await leave(2);
	A(await waitMap('LilycoveCity_DepartmentStore_1F'), '[elevator] choosing 1F takes you to 1F', JSON.stringify(await pos()));

	// EXIT: back where you came from
	const on1 = await pos();
	await place(on1.x, on1.y + 1, 'up');
	await walk('ArrowUp');
	await waitMap('LilycoveCity_DepartmentStoreElevator');
	await ask();
	await key('ArrowDown');   // the cursor starts on 1F; one down is EXIT
	const exitSt = await choice();
	await key('z'); await drive();
	await leave(1);
	A(await waitMap('LilycoveCity_DepartmentStore_1F'), '[elevator] EXIT: the doors let you out on the floor you boarded (1F)', JSON.stringify({ at: await pos(), exitSt }));

	// ===== the VENDING MACHINE =====
	const money = () => W(async () => (await import('./bag.js')).getMoney());
	const bag = () => W(async () => { const B = await import('./bag.js'); return { freshwater: B.count('freshwater'), sodapop: B.count('sodapop'), lemonade: B.count('lemonade') }; });
	await page.evaluate(() => window.__ow.moveToMap('LilycoveCity_DepartmentStoreRooftop', 9, 2));
	await waitMap('LilycoveCity_DepartmentStoreRooftop');
	const vend = async () => {
		await place(9, 2, 'up');
		await W(() => { window.__said = []; });
		await key('z');
		return (await drive()) === 'menu';
	};
	// buy each drink once; the machine sometimes drops a bonus can (random 1/64
	// per roll) and then asks again, so count cans against money spent
	const PRICE = [200, 300, 350], ITEM = ['freshwater', 'sodapop', 'lemonade'];
	for (let d = 0; d < 3; d++) {
		const m0 = await money(), b0 = await bag();
		const ok = await vend();
		const st = await choice();
		if (d === 0) A(ok && JSON.stringify(st.options) === JSON.stringify(['FRESH WATER¥200', 'SODA POP¥300', 'LEMONADE¥350', 'EXIT']),
			'[vending] the machine shows FRESH WATER/SODA POP/LEMONADE/EXIT', JSON.stringify(st));
		for (let i = 0; i < d; i++) await key('ArrowDown');
		await key('z');
		const next = await drive();   // it asks again after a sale ("Which drink?")
		const m1 = await money(), b1 = await bag();
		A(m0 - m1 === PRICE[d], `[vending] ${ITEM[d]} costs ¥${PRICE[d]}`, JSON.stringify({ m0, m1 }));
		A(b1[ITEM[d]] - b0[ITEM[d]] >= 1, `[vending] ...and lands in the bag`, JSON.stringify({ b0, b1 }));
		if (next === 'menu') { await key('x'); await drive(); }
	}
	// not enough money
	await W(async () => { localStorage.setItem('magepunk_money', '250'); });
	const b2 = await bag();
	await vend();
	await key('ArrowDown'); await key('z');   // SODA POP, ¥300
	const outcome = await drive();
	A(outcome === 'idle' && (await money()) === 250 && (await bag()).sodapop === b2.sodapop && /enough money/i.test(await said()),
		'[vending] with ¥250, SODA POP says "not enough money", charges nothing, gives nothing', JSON.stringify({ outcome, m: await money(), said: (await said()).slice(-160) }));
	// B cancels
	await vend();
	await key('x');
	A((await drive()) === 'idle' && (await money()) === 250 && !(await choice()).open, '[vending] B closes the machine; nothing charged');

	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
