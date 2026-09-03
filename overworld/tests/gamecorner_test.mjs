// gamecorner_test.mjs — the GAME CORNER (upscale plan item 26).
//
// The corners shipped as furniture: slot machines nobody could pull, clerks
// with mute decomp scripts. Now the counters open a hub — VOLTORB FLIP (HGSS
// rules, pure-logic module voltorbflip.js), a coin counter ($1,000 -> 50), and
// a prize desk (gen-1 classics + TMs). Coins live in the COIN CASE (cap
// 9,999), gifted free on the first visit.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/gamecorner_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the logic module, straight into node ----------
{
	const VF = await import('../voltorbflip.js');
	A(Object.keys(VF.LEVELS).length === 8, 'eight board levels exist');
	const b = VF.newBoard(3);
	const count = v => b.filter(t => t.v === v).length;
	A(b.length === 25 && count(2) === 4 && count(3) === 3 && count(0) === 8 && count(1) === 10,
		'a level-3 board deals the level-3 mix', JSON.stringify({ twos: count(2), threes: count(3), volts: count(0) }));

	// a hand-built board makes the hints checkable exactly:
	// row 0 = [2,3,0,1,1] -> sum 7, 1 volt; col 0 = [2,1,1,1,1] -> sum 6, 0 volts
	const known = [2, 3, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
		.map(v => ({ v, flipped: false, memo: false }));
	const h = VF.hints(known);
	A(h.rows[0].sum === 7 && h.rows[0].volts === 1 && h.cols[0].sum === 6 && h.cols[0].volts === 0,
		'row/column hints add up', JSON.stringify({ r0: h.rows[0], c0: h.cols[0] }));

	// scoring: first flip sets the score, later flips multiply, 1s keep it flat
	const g = { level: 1, board: known.map(t => ({ ...t })), coins: 0, flips: 0, phase: 'play', nextLevel: 1 };
	A(VF.flip(g, 3) === 'ok' && g.coins === 1, 'a 1 opens the score at 1');
	A(VF.flip(g, 0) === 'ok' && g.coins === 2, 'a 2 doubles it');
	A(VF.flip(g, 1) === 'clear' && g.coins === 6 && g.phase === 'won' && g.nextLevel === 2,
		'flipping the last 2/3 clears the round and promotes', JSON.stringify({ coins: g.coins, next: g.nextLevel }));
	A(VF.flip(g, 4) === null, 'a finished round refuses more flips');

	// the Voltorb demotion rule: drop to the safe-flip count, floor 1
	const g2 = { level: 5, board: known.map(t => ({ ...t })), coins: 0, flips: 0, phase: 'play', nextLevel: 5 };
	VF.flip(g2, 3); VF.flip(g2, 4); VF.flip(g2, 0);
	A(VF.flip(g2, 2) === 'volt' && g2.phase === 'lost' && g2.nextLevel === 3,
		'a Voltorb after 3 safe flips demotes level 5 -> 3', JSON.stringify({ next: g2.nextLevel }));
	A(VF.nextRound(g2).level === 3 && VF.nextRound(g2).board.length === 25, 'the next round deals at the demoted level');
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8947;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_money', '20000');
			localStorage.removeItem('magepunk_story');
			localStorage.removeItem('magepunk_coins_v1');
			localStorage.removeItem('magepunk_bag_v1');
			localStorage.removeItem('magepunk_box_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodGameCorner`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots in the Goldenrod Game Corner');

		// ---------- every corner counter answers ----------
		const zones = await page.evaluate(async () => {
			const ow = window.__ow;
			const out = { goldenrod: ow.services.kindAt(3, 2) };
			await ow.moveToMap('MauvilleCity_GameCorner');
			out.mauville = ow.services.kindAt(11, 2);
			await ow.moveToMap('CeladonCity_GameCorner');
			out.celadon = ow.services.kindAt(4, 2);
			await ow.moveToMap('JohKantoCeladonGameCorner');
			out.johkanto = ow.services.kindAt(5, 2);
			await ow.moveToMap('GoldenrodGameCorner');
			return out;
		});
		A(Object.values(zones).every(z => z === 'gamecorner'),
			'all four corners have live counters', JSON.stringify(zones));

		// ---------- first visit: the clerk hands over the COIN CASE ----------
		const visit = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.player.setTile(3, 3); ow.player.facing = 'up';
			ow.interact();
			const out = { gifted: ow.dialog.blocking };
			for (let i = 0; i < 10 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 120)); }
			out.hubOpen = ow.gcMenu.open;
			out.coincase = ow.Bag.count('coincase');
			return out;
		});
		A(visit.gifted && visit.coincase === 1 && visit.hubOpen,
			'the first visit gifts a COIN CASE and opens the hub', JSON.stringify(visit));

		// ---------- the coin counter ----------
		const coins = await page.evaluate(() => {
			const ow = window.__ow;
			ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('z'); // hub -> BUY COINS (row 2 since PLAY SLOTS joined)
			const out = { mode: ow.gcMenu.mode };
			ow.gcKey('z');                                              // 50 coins for $1,000
			out.c1 = ow.Bag.getCoins(); out.m1 = ow.Bag.getMoney();
			ow.gcKey('ArrowDown'); ow.gcKey('z');                       // 500 for $10,000
			out.c2 = ow.Bag.getCoins(); out.m2 = ow.Bag.getMoney();
			ow.gcKey('x');                                              // back to the hub
			return out;
		});
		A(coins.mode === 'coins' && coins.c1 === 50 && coins.m1 === 19000,
			'$1,000 buys 50 coins', JSON.stringify(coins));
		A(coins.c2 === 550 && coins.m2 === 9000, '$10,000 buys 500 more', JSON.stringify(coins));

		// ---------- the prize desk ----------
		const prizes = await page.evaluate(() => {
			const ow = window.__ow;
			ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('z'); // hub -> PRIZE CORNER
			const out = { mode: ow.gcMenu.mode };
			ow.gcKey('z');                                               // ABRA, 180 coins
			out.flash = ow.gcMenu.flash;
			out.coins = ow.Bag.getCoins();
			out.gotAbra = ow.party.some(m => m.speciesId === 'abra')
				|| JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]').some(m => m.speciesId === 'abra');
			// PORYGON costs 9,999 — 370 coins can't touch it
			ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('ArrowDown'); ow.gcKey('z');
			out.refusal = ow.gcMenu.flash;
			out.coinsAfterRefusal = ow.Bag.getCoins();
			ow.gcKey('x'); ow.gcKey('x');                                // hub, then close
			return out;
		});
		A(prizes.mode === 'prizes' && prizes.coins === 370 && prizes.gotAbra,
			'180 coins buys an ABRA', JSON.stringify(prizes));
		A(/Not enough coins/.test(prizes.refusal) && prizes.coinsAfterRefusal === 370,
			'PORYGON at 9,999 refuses without touching the balance', JSON.stringify(prizes));

		// ---------- Voltorb Flip at the table ----------
		const vf = await page.evaluate(() => {
			const ow = window.__ow;
			ow.gcMenu.open = true; ow.gcMenu.mode = 'hub'; ow.gcMenu.idx = 0;
			ow.gcKey('z');                                               // PLAY VOLTORB FLIP
			const out = { open: ow.vfMenu.open, level: ow.vfMenu.game?.level, boardSize: ow.vfMenu.game?.board?.length };
			// swap in a one-card-to-clear board so the win path is deterministic
			ow.vfMenu.game = { level: 1, coins: 0, flips: 0, phase: 'play', nextLevel: 1,
				board: [{ v: 2, flipped: false }].concat(Array.from({ length: 24 }, () => ({ v: 1, flipped: true }))) };
			ow.vfMenu.cur = 0;
			const before = ow.Bag.getCoins();
			ow.vfKey('z');                                               // flip the 2 -> clear
			out.banked = ow.Bag.getCoins() - before;
			out.flash = ow.vfMenu.flash;
			ow.vfKey('z');                                               // deal the next round
			out.nextLevel = ow.vfMenu.game.level;
			out.freshBoard = ow.vfMenu.game.board.filter(t => !t.flipped).length === 25;
			// now a rigged loss: Voltorb on the first flip
			ow.vfMenu.game = { level: 4, coins: 0, flips: 0, phase: 'play', nextLevel: 4,
				board: [{ v: 0, flipped: false }].concat(Array.from({ length: 24 }, () => ({ v: 1, flipped: false }))) };
			ow.vfMenu.cur = 0;
			ow.vfKey('z');
			out.lostPhase = ow.vfMenu.game.phase;
			out.demoted = ow.vfMenu.game.nextLevel;
			ow.vfKey('x');
			out.closed = !ow.vfMenu.open;
			return out;
		});
		A(vf.open && vf.level === 1 && vf.boardSize === 25, 'PLAY deals a level-1 board', JSON.stringify(vf));
		A(vf.banked === 2 && /Cleared! Banked 2 coins/.test(vf.flash),
			'clearing the round banks the score into the COIN CASE', JSON.stringify(vf));
		A(vf.nextLevel === 2 && vf.freshBoard, 'Z deals the next round one level up', JSON.stringify(vf));
		A(vf.lostPhase === 'lost' && vf.demoted === 1 && vf.closed,
			'a first-flip Voltorb demotes to level 1 and X leaves the table', JSON.stringify(vf));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
