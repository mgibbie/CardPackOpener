// cardflip_test.mjs — Crystal's CARD FLIP plays at the Game Corner machines.
//
// #658 restored the Goldenrod (and JohKanto Celadon) card-flip machines' signs,
// but their script is `special CardFlip`, which nothing answered: you read the
// machine and nothing happened. engine/games/card_flip.asm is now ported
// (overworld/minigames/cardflip/), on the decomp's own graphics.
//   1. pure: the decomp's betting grid pays x6/x9/x12/x18/x72 exactly
//   2. no coins -> "You have no coins."; coins but no COIN CASE -> its refusal
//   3. the machine opens the table; a game costs 3 coins
//   4. a seeded deck (the decomp's ShuffleDeck) + a bet on the flipped card pays 72
//   5. a losing bet pays nothing
//   6. too few coins -> "Not enough coins…", and the table closes
//   7. B at "Play with three coins?" returns to the overworld, and you can walk
//
//   node overworld/tests/cardflip_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9235;
const STATE = { username: 'cardflip', friendCode: 'CFLIP1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the seeded RNG the page uses (same source text in both places)
const LCG_SRC = 'let s = 12345; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 16) & 0xff; };';
// CardFlip_ShuffleDeck, independently: 23..1 into random empty slots of 24
function expectedDeck() {
	const r = new Function(LCG_SRC)();
	const d = new Array(24).fill(0);
	for (let c = 23; c > 0;) { const a = r() & 0x1f; if (a >= 24 || d[a]) continue; d[a] = c--; }
	return d;
}

// ===== 1. the betting grid (pure) =====
{
	const { payoutFor } = await import('../minigames/cardflip/rules.js').catch(() => ({}));
	const card = (lvl, mon) => (lvl - 1) * 4 + mon;   // mon: 0 PIKA 1 JIGGLY 2 POLI 3 ODDISH
	A(typeof payoutFor === 'function', '1. the card flip module exports its win table');
	if (payoutFor) {
		const cases = [
			[0, 2, card(3, 1), 6], [0, 4, card(3, 1), 0], [0, 4, card(5, 3), 6], [0, 0, card(1, 0), 0],
			[1, 3, card(2, 1), 12], [1, 2, card(2, 1), 0],
			[2, 0, card(2, 2), 9], [4, 0, card(4, 0), 9], [6, 0, card(1, 0), 0], [7, 0, card(6, 3), 9],
			[4, 1, card(3, 2), 18], [4, 1, card(4, 2), 0],
			[3, 4, card(2, 2), 72], [3, 4, card(2, 3), 0], [7, 5, card(6, 3), 72],
		];
		const bad = cases.filter(([y, x, c, want]) => payoutFor(y, x, c) !== want).map(([y, x, c, w]) => `(${y},${x}) card ${c}: ${payoutFor(y, x, c)} != ${w}`);
		A(!bad.length, '1. pair x6, mon x12, level pair x9, level x18, exact card x72 (CardFlip_CheckWinCondition)', bad.join('; '));
	}
}

// ===== the real machines =====
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
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5 }));   // no COIN CASE yet
		localStorage.setItem('magepunk_coins_v1', '0');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const CF = () => W(async () => {
		const m = await import('./minigames/cardflip/cardflip.js').catch(() => null);
		const O = window.__ow;
		const c = m && m.cardFlip;
		return {
			open: !!(c && c.open), phase: c && c.phase, text: c && c.text, deck: c && c.deck, which: c && c.which, numPlayed: c && c.numPlayed,
			cursor: c && [c.cursorY, c.cursorX], faceUp: c && c.faceUp, lastPayout: c && c.lastPayout,
			coins: parseInt(localStorage.getItem('magepunk_coins_v1'), 10) || 0,
			dialog: O.dialog.pages ? JSON.stringify(O.dialog.pages) : null, cut: !!O.cutscene.blocking,
		};
	});
	const until = async (pred, ms = 8000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await CF(); if (pred(s)) return s; await sleep(50); } return s; };
	const key = async k => { await page.keyboard.press(k); await sleep(80); };
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.facing = f; }, x, y, facing);
	const pos = () => W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const setCoins = n => W(n => localStorage.setItem('magepunk_coins_v1', String(n)), n);
	// walk the bet cursor between grid cells in the level rows (y>=2, x>=2)
	const moveCursor = async (from, to) => {
		let [y, x] = from;
		while (x < to[1]) { await key('ArrowRight'); x++; }
		while (x > to[1]) { await key('ArrowLeft'); x--; }
		while (y < to[0]) { await key('ArrowDown'); y++; }
		while (y > to[0]) { await key('ArrowUp'); y--; }
	};

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodGameCorner&x=14&y=9`, { waitUntil: 'domcontentloaded' });
	await boot('GoldenrodGameCorner');
	// the card-flip machine column x=13 (bg_event 13,9 READ), from the aisle
	await place(14, 9, 'left');

	// ===== 2. CheckCoinsAndCoinCase =====
	await key('z');
	let s = await until(s => s.dialog);
	A(/You have no coins\./.test(s.dialog || '') && !s.open, '2. no coins: "You have no coins." and no table', JSON.stringify(s));
	await key('z');
	await until(s => !s.dialog && !s.cut);
	await setCoins(10);
	await key('z');
	s = await until(s => s.dialog);
	A(/You don't have a.*COIN CASE\./.test(s.dialog || '') && !s.open, '2. coins but no COIN CASE: "You don\'t have a COIN CASE."', JSON.stringify(s));
	await key('z');
	await until(s => !s.dialog && !s.cut);

	// ===== 3. the machine opens the table; 3 coins a game =====
	await W(() => { const b = JSON.parse(localStorage.getItem('magepunk_bag_v1')); b.coincase = 1; localStorage.setItem('magepunk_bag_v1', JSON.stringify(b)); });
	await W(async src => { (await import('./minigames/cardflip/cardflip.js')).cardFlip.rng = new Function(src)(); }, LCG_SRC).catch(() => {});
	await key('z');
	s = await until(s => s.open && s.phase === 'AskPlayWithThree');
	A(s.open && s.text === 'Play with three\ncoins?', '3. reading the machine opens CARD FLIP: "Play with three coins?"', JSON.stringify({ open: s.open, phase: s.phase, text: s.text, dialog: s.dialog }));
	await sleep(200);
	await key('z');   // YES
	s = await until(s => s.phase === 'ChooseACard' && s.text === 'Choose a card.');
	A(s.coins === 7, '3. a game costs 3 coins (10 -> 7)', s.coins);

	// ===== 4. seeded deck + the winning bet =====
	const want = expectedDeck();
	A(JSON.stringify(s.deck) === JSON.stringify(want), '4. the seeded deck is the decomp\'s ShuffleDeck order', JSON.stringify(s.deck));
	await key('z');   // stop the flashing border
	s = await until(s => s.phase === 'PlaceYourBet');
	let card = s.deck[2 * s.numPlayed + s.which];
	await moveCursor(s.cursor, [2 + (card >> 2), 2 + (card & 3)]);
	await sleep(100);
	if (process.env.CARDFLIP_SHOT) await page.screenshot({ path: path.join(process.env.CARDFLIP_SHOT, 'cardflip_bet.png') });
	await key('z');
	s = await until(s => s.phase === 'TabulateTheResult' && s.coins === 79, 10000);
	A(s.faceUp === card && s.text === 'Yeah!' && s.lastPayout === 72 && s.coins === 79,
		`4. betting on the exact card (${card}) turns it face up and pays 72 coins (7 -> 79)`, JSON.stringify({ faceUp: s.faceUp, text: s.text, pay: s.lastPayout, coins: s.coins }));

	if (process.env.CARDFLIP_SHOT) await page.screenshot({ path: path.join(process.env.CARDFLIP_SHOT, 'cardflip_win.png') });
	// ===== 5. a losing bet =====
	await sleep(150);
	await key('z');
	s = await until(s => s.phase === 'PlayAgain' && s.text === 'Want to play\nagain?');
	await sleep(200);
	await key('z');   // YES
	s = await until(s => s.phase === 'ChooseACard' && s.text === 'Choose a card.');
	A(s.coins === 76 && s.numPlayed === 1, '5. playing again costs 3 more (79 -> 76), second deal', JSON.stringify({ coins: s.coins, n: s.numPlayed }));
	await key('z');
	s = await until(s => s.phase === 'PlaceYourBet');
	card = s.deck[2 * s.numPlayed + s.which];
	const wrong = (card + 1) % 24;   // the next card: same row or the next, never this one
	await moveCursor(s.cursor, [2 + (wrong >> 2), 2 + (wrong & 3)]);
	await sleep(100);
	await key('z');
	s = await until(s => s.phase === 'TabulateTheResult' && s.text === 'Darn…', 10000);
	await sleep(300);
	s = await CF();
	A(s.faceUp === card && s.text === 'Darn…' && s.lastPayout === 0 && s.coins === 76, '5. a bet on another card: "Darn…", nothing paid', JSON.stringify({ faceUp: s.faceUp, text: s.text, pay: s.lastPayout, coins: s.coins }));

	// ===== 6. too few coins =====
	await key('z');
	s = await until(s => s.phase === 'PlayAgain' && s.text === 'Want to play\nagain?');
	await setCoins(2);
	await sleep(200);
	await key('z');   // YES
	s = await until(s => s.text === 'Not enough coins…');
	A(s.open && s.phase === 'DeductCoins' && s.coins === 2, '6. with 2 coins: "Not enough coins…", nothing taken', JSON.stringify({ text: s.text, phase: s.phase, coins: s.coins }));
	await sleep(150);
	await key('z');
	s = await until(s => !s.open && !s.cut);
	A(!s.open && !s.cut, '6. ...and the table closes back to the overworld', JSON.stringify(s));

	// ===== 7. B quits =====
	await sleep(300);
	await place(14, 9, 'left');
	await key('z');
	s = await until(s => s.open && s.phase === 'AskPlayWithThree');
	A(s.open, '7. the machine reopens the table (2 coins is still some coins)');
	await sleep(200);
	await key('x');
	s = await until(s => !s.open && !s.cut);
	A(!s.open && !s.cut && s.coins === 2, '7. B at "Play with three coins?" leaves, nothing spent', JSON.stringify(s));
	await sleep(300);
	const before = await pos();
	await page.keyboard.down('ArrowDown'); await sleep(260); await page.keyboard.up('ArrowDown'); await sleep(500);
	const after = await pos();
	A(after.y > before.y, '7. the overworld takes input again (walked down)', JSON.stringify({ before, after }));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
