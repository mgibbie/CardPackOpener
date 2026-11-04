// slots_test.mjs — Crystal's slot machine (`special SlotMachine`) in the Goldenrod
// and Celadon Game Corners.
//
// #658 brought the Crystal slot signs back, but their scripts end in `special
// SlotMachine`, which runSpecial had no case for: reading a machine did nothing.
// It is now pokecrystal engine/games/slot_machine.asm ported frame for frame
// (overworld/minigames/slots/slots_engine.js, ow_crystalslots.js).
//   1. data: the sign scripts' `random 6` lucky roll and `setval TRUE/FALSE` are
//      restored (tools/gen_crystal_scriptvar.mjs), so the special can read them
//   2. engine: the decomp's reel strips + payout table; with Random() = 0 (SEVEN
//      bias, reel 2 skip-to-7, reel 3 Chansey) three 7s line up and pay 300
//   3. the real Goldenrod machines: no coins / no COIN CASE give the decomp's
//      refusals; the lucky machine opens the game in lucky mode; a 3-coin bet takes
//      3 coins; a forced 7-7-7 pays 300 into the COIN CASE; B at the bet menu
//      quits back to the overworld, which takes input again
//
//   node overworld/tests/slots_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9234;
const STATE = { username: 'slotstest', friendCode: 'SLOTS1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
{
	const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_scriptvar_data.json'), 'utf8')).patches;
	const ops = (stem, label) => JSON.stringify(((P[stem] || {})[label] || []).map(o => o.op === 'random' ? `random ${o.max}` : o.op === 'setvar' ? `setval ${o.value}` : o.op === 'branch' ? `if=${o.cond.value} ${o.label}` : o.op === 'special' ? `special ${o.name}` : o.op));
	A(ops('GoldenrodGameCorner', 'GoldenrodGameCornerSlotsMachineScript') === JSON.stringify(['random 6', 'if=0 GoldenrodGameCornerLuckySlotsMachineScript', 'setval 0', 'special SlotMachine', 'end']),
		'1. Goldenrod\'s machines roll random 6 for the lucky one, else setval FALSE', ops('GoldenrodGameCorner', 'GoldenrodGameCornerSlotsMachineScript'));
	A(ops('GoldenrodGameCorner', 'GoldenrodGameCornerLuckySlotsMachineScript') === JSON.stringify(['setval 1', 'special SlotMachine', 'end']), '1. Goldenrod\'s lucky machine sets TRUE');
	A(ops('JohKantoCeladonGameCorner', 'CeladonGameCornerLuckySlotMachineScript') === JSON.stringify(['random 6', 'if=0 CeladonGameCornerSlotMachineScript', 'setval 0', 'special SlotMachine', 'end'])
		&& ops('JohKantoCeladonGameCorner', 'CeladonGameCornerSlotMachineScript') === JSON.stringify(['setval 1', 'special SlotMachine', 'end']), '1. Celadon\'s machines likewise (its label names are swapped, as in the decomp)');
}

// ===== 2. engine =====
const E = await import(pathToFileURL(path.join(ROOT, 'overworld', 'minigames', 'slots', 'slots_engine.js')).href);
{
	A(JSON.stringify(E.PAYOUT) === JSON.stringify({ 0: 300, 4: 50, 8: 6, 12: 8, 16: 10, 20: 15 }), '2. payouts: 7 300, BALL 50, CHERRY 6, PIKACHU 8, SQUIRTLE 10, STARYU 15');
	A(E.REEL_STRIPS[0].slice(0, 15).join() === '0,8,20,12,16,0,8,20,12,16,4,8,20,12,16' && E.REEL_STRIPS[2].slice(0, 15).join() === '0,12,8,16,20,12,8,16,20,12,4,8,16,20,12', '2. reel strips are Reel1Tilemap..Reel3Tilemap');
	A(E.BIAS_NORMAL[0].join() === '1,0' && E.BIAS_LUCKY[5].join() === '80,8', '2. bias tables: normal SEVEN <= 1, lucky CHERRY <= 31% + 1');
	const bank = { v: 100, get() { return this.v; }, set(n) { this.v = n; } };
	const g = new E.SlotsEngine({ bank, rng: () => 0 });
	g.step(); g.step();   // SlotsAction_Init, then SlotsAction_BetAndStart
	A(g.ui && g.ui.kind === 'bet' && g.text === 'Bet how many\ncoins?', '2. it opens on "Bet how many coins?"');
	g.press('A');
	A(bank.v === 97 && g.bet === 3 && g.lights === 3 && g.bias === E.SEVEN, '2. the default bet is 3 coins (3 lines), Random 0 = SEVEN bias', JSON.stringify({ c: bank.v, bet: g.bet, bias: g.bias }));
	for (let i = 0; i < 40; i++) g.step();
	const hits = new Set([13, 14, 0, 3, 4, 5]);   // reel 1 windows that show a 7
	for (let i = 0; i < 300 && !hits.has((g.bottomIndex(g.reels[0]) + 1) % 15); i++) g.step();
	g.press('A'); for (let i = 0; i < 100; i++) g.step();
	g.press('A'); for (let i = 0; i < 600; i++) g.step();
	g.press('A');
	let n = 0; while (!(g.ui && g.ui.kind === 'waitAB') && n++ < 6000) g.step();
	A(g.matched === E.SEVEN && g.text === 'lined up!\nWon 300 coins!' && bank.v === 397, '2. three 7s pay the decomp\'s 300', JSON.stringify({ m: g.matched, t: g.text, c: bank.v, stopped: g.stopped }));
}

// ===== 3. the real machines =====
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
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5, coincase: 1 }));
		localStorage.setItem('magepunk_coins_v1', '0');
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, facing);
	const key = async k => { await page.keyboard.press(k); await sleep(60); };
	const slots = () => W(() => { const c = window.__ow.crystalSlots, g = c.engine; return { open: c.open, lucky: g && g.lucky, ui: g && g.ui && g.ui.kind, text: g && g.text, bet: g && g.bet, lights: g && g.lights, bias: g && g.bias, matched: g && g.matched, stopped: g && g.stopped, coins: +localStorage.getItem('magepunk_coins_v1') }; });
	const dialogText = () => W(() => { const d = window.__ow.dialog; return d.pages ? d.pages.map(p => Array.isArray(p) ? p.join('\n') : String(p)).join('\n') : null; });
	// read a machine and wait for whatever it opens (a dialog or the slots)
	const readMachine = async (x, y, facing) => {
		await place(x, y, facing);
		await key('z');
		for (let i = 0; i < 60; i++) { const s = await W(() => ({ d: window.__ow.dialog.blocking, s: window.__ow.crystalSlots.open })); if (s.d || s.s) return s; await sleep(50); }
		return {};
	};
	const settle = async () => {
		for (let i = 0; i < 80; i++) {
			const s = await W(() => ({ d: window.__ow.dialog.blocking, c: window.__ow.cutscene.blocking, s: window.__ow.crystalSlots.open }));
			if (!s.d && !s.c && !s.s) return true;
			if (s.d) await key('z');
			await sleep(60);
		}
		return false;
	};

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodGameCorner&x=5&y=8`, { waitUntil: 'domcontentloaded' });
	await boot('GoldenrodGameCorner');

	// no coins (CheckCoinsAndCoinCase checks the coins first)
	let r = await readMachine(5, 7, 'right');
	A(r.d && (await dialogText() || '').includes('You have no coins.') && !r.s, '3. no coins: "You have no coins." and no game', await dialogText());
	A(await settle(), '3. ...and the sign script ends');
	// coins but no COIN CASE
	await W(() => { localStorage.setItem('magepunk_coins_v1', '100'); localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5 })); });
	r = await readMachine(5, 7, 'right');
	A(r.d && /You don't have a\s+COIN CASE\./.test(await dialogText() || '') && !r.s, '3. no COIN CASE: "You don\'t have a COIN CASE."', await dialogText());
	A(await settle(), '3. ...and the sign script ends');

	// the lucky machine (7,7), from its right
	await W(() => localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5, coincase: 1 })));
	r = await readMachine(8, 7, 'left');
	await W(() => { window.__ow.crystalSlots.manual = true; window.__ow.crystalSlots.rng = () => 0; });
	await W(() => window.__ow.stepCrystalSlots(2));
	let s = await slots();
	A(r.s && s.open && s.ui === 'bet' && s.text === 'Bet how many\ncoins?', '3. reading a Goldenrod slot machine opens the slots at the bet menu', JSON.stringify(s));
	A(s.lucky === true, '3. the (7,7) machine plays in LUCKY mode (setval TRUE)', JSON.stringify(s));
	await key('z');
	s = await slots();
	A(s.bet === 3 && s.lights === 3 && s.coins === 97 && s.text === 'Start!', '3. betting 3 takes 3 coins from the COIN CASE (100 -> 97)', JSON.stringify(s));
	// stop reel 1 where a 7 can be reached, then reels 2 and 3 (Random() = 0 forces skip-to-7 + Chansey)
	await W(() => window.__ow.stepCrystalSlots(40));
	await W(() => { const g = window.__ow.crystalSlots.engine, hits = new Set([13, 14, 0, 3, 4, 5]); for (let i = 0; i < 300 && !hits.has((g.bottomIndex(g.reels[0]) + 1) % 15); i++) g.step(); });
	await key('z'); await W(() => window.__ow.stepCrystalSlots(100));
	await key('z'); await W(() => window.__ow.stepCrystalSlots(600));
	await key('z');
	await W(() => { const g = window.__ow.crystalSlots.engine; for (let i = 0; i < 6000 && !(g.ui && g.ui.kind === 'waitAB'); i++) g.step(); });
	s = await slots();
	A(s.matched === 0 && s.text === 'lined up!\nWon 300 coins!' && s.coins === 397, '3. a forced 7-7-7 pays the decomp\'s 300 coins (97 -> 397)', JSON.stringify(s));
	// A past the payout, YES to play again, then B at the bet menu quits
	await key('z');
	s = await slots();
	A(s.ui === 'yesno' && s.text === 'Play again?', '3. then "Play again?"', JSON.stringify(s));
	await key('z'); await W(() => window.__ow.stepCrystalSlots(3));
	s = await slots();
	A(s.ui === 'bet', '3. YES deals again (bet menu)', JSON.stringify(s));
	await key('x'); await W(() => window.__ow.stepCrystalSlots(5));
	s = await slots();
	A(!s.open && s.coins === 397, '3. B at the bet menu quits the slots, coins kept', JSON.stringify(s));
	A(await settle(), '3. ...back in the overworld: no dialog, no cutscene left running');
	const before = await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }));
	await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight'); await sleep(500);
	const after = await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty, f: window.__ow.player.facing, blocked: !window.__ow.world.isPassable(9, 7) }));
	A(after.f === 'right' && (after.x > before.x || after.blocked), '3. ...and the player walks again', JSON.stringify({ before, after }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
