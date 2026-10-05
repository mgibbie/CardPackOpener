// game_corner_vendors_test.mjs — Crystal's Game Corner prize counters and vending machines sell.
//
// The Crystal transpile dropped every purchase command at the Goldenrod and
// Celadon prize counters: the `loadmenu`+`verticalmenu` prize menu and its
// `ifequal`s, `checkcoins` + the HAVE_LESS refusal, the `iffalse` after the
// yes/no and after `giveitem`, `givepoke` and `takecoins`. So the clerks greeted
// you, then always said "come again" — no TM, no prize POKéMON, ever. The Dept.
// Store 6F vending machines lost `checkmoney`/`takemoney` the same way, and their
// BGEVENT_UP signs never made it into the converted maps at all.
// tools/gen_crystal_scriptvar.mjs restores the commands (crystal_scriptvar_data.json),
// tools/gen_crystal_callbacks.mjs adds the vending machines back (crystal_callbacks.json `signs`).
//   1. Goldenrod TM vendor: the menu offers TM25/TM14/TM38; TM25 THUNDER for 5500 coins
//   2. Goldenrod prize-POKéMON vendor: ABRA for 100 coins joins the party
//   3. too few coins: the refusal, nothing taken, nothing given
//   4. Goldenrod Dept. Store 6F vending machine: FRESH WATER for ¥200
//   5. Celadon (JohKanto) prize room TM counter: TM32 DOUBLE TEAM for 1500 coins
//
//   node overworld/tests/game_corner_vendors_test.mjs
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
const PORT = 9231;
const STATE = { username: 'gcvendor', friendCode: 'GCVND1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PIDGEOT = { speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 120, atk: 80, def: 75, spa: 70, spd: 70, spe: 101 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18 };
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
async function open(map, x, y, { coins = 0, money = 3000 } = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, mon, coins, money) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'johto');
		localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ coincase: 1 }));
		localStorage.setItem('magepunk_coins_v1', String(coins));
		localStorage.setItem('magepunk_money', String(money));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PIDGEOT, coins, money);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === m), map).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	return { page, ctx, errors };
}
const W = (p, f, ...a) => p.evaluate(f, ...a);
const choice = p => W(p, async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, options: c.options.slice() }; });
// press Z through dialog (Z = YES at a yes/no) until a menu opens or everything is still
const drive = p => W(p, async () => {
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
const key = async (p, k) => { await p.keyboard.press(k); await sleep(80); };
const talk = async (p, x, y) => {
	await W(p, (x, y) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = 'up'; window.__said = []; }, x, y);
	await key(p, 'z');
};
const state = p => W(p, () => ({ coins: +localStorage.getItem('magepunk_coins_v1'), money: +localStorage.getItem('magepunk_money'),
	bag: JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'), party: JSON.parse(localStorage.getItem('magepunk_party_v1')).map(m => m.speciesId),
	said: (window.__said || []).join(' | ') }));
const tmKeys = bag => Object.keys(bag).filter(k => /^tm/.test(k) && bag[k] > 0);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== 1. Goldenrod TM vendor (16,2): TM25 THUNDER for 5500 coins =====
	{
		const { page, ctx, errors } = await open('GoldenrodGameCorner', 16, 3, { coins: 6000 });
		await talk(page, 16, 3);
		let r = await drive(page);
		const menu = await choice(page);
		A(r === 'menu' && /TM25/.test(menu.options[0] || '') && /TM14/.test(menu.options[1] || '') && /TM38/.test(menu.options[2] || ''), '1. the TM vendor\'s menu offers TM25 / TM14 / TM38', JSON.stringify({ r, menu }));
		await key(page, 'z');            // TM25
		r = await drive(page);           // "...for 5500 coins?" (Z = yes) ... "here you go" ... the menu again
		await key(page, 'x');            // done
		await drive(page);
		const s = await state(page);
		A(s.coins === 500, '1. buying TM25 takes 5500 coins (6000 -> 500)', JSON.stringify({ coins: s.coins, said: s.said.slice(-200) }));
		A(tmKeys(s.bag).length === 1 && /thunder|tm25/i.test(tmKeys(s.bag)[0]), '1. ...and gives TM25 THUNDER', JSON.stringify(s.bag));
		A(errors.length === 0, '1. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 2. Goldenrod prize-POKéMON vendor (18,2): ABRA for 100 coins =====
	{
		const { page, ctx, errors } = await open('GoldenrodGameCorner', 18, 3, { coins: 1000 });
		await talk(page, 18, 3);
		let r = await drive(page);
		const menu = await choice(page);
		A(r === 'menu' && /ABRA/.test(menu.options[0] || '') && /CUBONE/.test(menu.options[1] || '') && /WOBBUFFET/.test(menu.options[2] || ''), '2. the prize vendor\'s menu offers ABRA / CUBONE / WOBBUFFET', JSON.stringify({ r, menu }));
		await key(page, 'z');            // ABRA
		r = await drive(page);
		if (r === 'menu' && (await choice(page)).options.some(o => /ABRA/.test(o))) { await key(page, 'x'); await drive(page); }
		const s = await state(page);
		A(s.coins === 900, '2. ABRA takes 100 coins (1000 -> 900)', JSON.stringify({ coins: s.coins, said: s.said.slice(-200) }));
		A(s.party.length === 2 && s.party[1] === 'abra', '2. ...and ABRA joins the party', JSON.stringify(s.party));
		A(errors.length === 0, '2. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 3. too few coins: refused, nothing taken =====
	{
		const { page, ctx } = await open('GoldenrodGameCorner', 18, 3, { coins: 50 });
		await talk(page, 18, 3);
		let r = await drive(page);
		A(r === 'menu', '3. setup: the prize menu');
		await key(page, 'z');            // ABRA (100) with 50 coins
		r = await drive(page);
		const s = await state(page);
		A(r === 'idle' && s.coins === 50 && s.party.length === 1 && /need[^a-z]+more[^a-z]+coins/i.test(s.said), '3. with 50 coins: "you need more coins", nothing taken, no ABRA', JSON.stringify({ r, coins: s.coins, party: s.party, said: s.said.slice(-200) }));
		await ctx.close();
	}

	// ===== 4. Goldenrod Dept. Store 6F vending machine (8,1, faced from below) =====
	{
		const { page, ctx, errors } = await open('GoldenrodDeptStore6F', 8, 2, { money: 1000 });
		await talk(page, 8, 2);
		let r = await drive(page);
		const menu = await choice(page);
		A(r === 'menu' && /FRESH WATER/.test(menu.options[0] || ''), '4. the vending machine answers, offering FRESH WATER', JSON.stringify({ r, menu }));
		await key(page, 'z');            // FRESH WATER
		r = await drive(page);           // "clang!" ... the menu again
		await key(page, 'x');
		await drive(page);
		const s = await state(page);
		A(s.money === 800 && (s.bag.freshwater || 0) === 1, '4. FRESH WATER for ¥200 (1000 -> 800), one in the bag', JSON.stringify({ money: s.money, bag: s.bag, said: s.said.slice(-200) }));
		A(errors.length === 0, '4. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}

	// ===== 5. Celadon prize room TM counter (bg_event 2,1, faced from below) =====
	{
		const { page, ctx, errors } = await open('JohKantoCeladonGameCornerPrizeRoom', 2, 2, { coins: 2000 });
		await talk(page, 2, 2);
		let r = await drive(page);
		const menu = await choice(page);
		A(r === 'menu' && /TM32/.test(menu.options[0] || '') && /1500/.test(menu.options[0] || ''), '5. the Celadon TM counter offers TM32 for 1500', JSON.stringify({ r, menu }));
		await key(page, 'z');            // TM32
		r = await drive(page);
		await key(page, 'x');
		await drive(page);
		const s = await state(page);
		A(s.coins === 500 && tmKeys(s.bag).length === 1 && /doubleteam|tm32/i.test(tmKeys(s.bag)[0]), '5. TM32 DOUBLE TEAM for 1500 coins (2000 -> 500)', JSON.stringify({ coins: s.coins, bag: s.bag }));
		A(errors.length === 0, '5. no page errors', JSON.stringify(errors.slice(0, 3)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
