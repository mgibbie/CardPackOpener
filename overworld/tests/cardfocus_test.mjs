// cardfocus_test.mjs — the Battlecards card FOCUS view (Plans/CONTROLLER_V2_PLAN.md C).
//
// Owner (2026-10-01): "i need to be able to select a card and look at it and have
// it be in focus", with or without a controller. A centered, large reader with the
// board dimmed behind it:
//   mouse      right-click a card (in a targeting mode right-click still cancels)
//   controller the left face button, or confirm on a card you can't act on
//   both       ◄ ► step through the cards beside it; Esc / cancel / backdrop close;
//              Play from the reader works; closing returns board focus to the card
//   never      an enemy's hand card or a face-down enemy card
//
//   node overworld/tests/cardfocus_test.mjs
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
].find(p => fs.existsSync(p));
const PORT = 9181;
const STATE = { username: 'cardfocus', friendCode: 'CFOCUS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});
const BTN = { bottom: 0, right: 1, left: 2, top: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, leftD: 14, rightD: 15 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
		window.__owFakePads = [pad]; window.__pad = pad;
		localStorage.setItem('magepunk_mp_token_v1', 'cardfocus-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	}, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state && window.__game.targeting)).catch(() => false))) await sleep(200);
	await sleep(2500);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(900);
	const tap = async (b, ms = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(ms); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(160); };
	const focus = () => page.evaluate(() => window.__game.cardFocus);
	const panel = () => page.evaluate(() => {
		const r = document.getElementById('card-focus'), p = r && r.querySelector('.cf-panel');
		if (!r || getComputedStyle(r).display === 'none') return null;
		const b = p.getBoundingClientRect();
		return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width, count: p.querySelector('.cf-count')?.textContent, actions: [...p.querySelectorAll('.ins-actions button')].map(x => x.textContent) };
	});

	// seed: my turn, 3 plain creatures in hand, one ready creature mine, one foe creature,
	// a foe HAND card, and a face-down (disguised) foe creature
	const seed = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E, H = g.HUMAN, F = 1 - H;
		const all = Object.values(s.cardsById).filter(Boolean);
		const plain = c => c.type === 'creature' && c.attack > 0 && c.health >= 3 && !c.activated && !c.titan && !c.magnetic && !c.disguised
			&& !c.adventure && !c.choices && !c.altCost && !c.kicker && !c.battlecry && !c.tradeable && !c.prepare && !c.forge && !E.targetSpec(s, H, c) && (c.cost || 0) <= 5;
		const cr = all.filter(plain);
		const p = s.players[H], f = s.players[F];
		p.board.length = 0; f.board.length = 0;
		E.summon(s, H, cr[2]);
		E.summon(s, F, cr[5]);
		for (const c of p.board) { c.sick = false; c.attacksUsed = 0; }
		p.mana.cur = 30; p.mana.bonus = 0;
		p.hand.length = 0;
		for (const i of [9, 12, 15]) { const c = E.instantiate(cr[i], H); c.zone = 'hand'; p.hand.push(c); }
		const fh = E.instantiate(cr[20], F); fh.zone = 'hand'; f.hand.push(fh);
		const dz = E.instantiate(cr[22], F); dz.zone = 'board'; dz.disguised = true; f.board.push(dz);
		s.current = H; s.priority = null; s.stack = [];
		g.pump();
		return { hand: p.hand.map(c => c.uid), mine: p.board[0].uid, foe: f.board[0].uid, foeHand: fh.uid, disguised: dz.uid };
	});
	await sleep(1000);
	A(seed.hand.length === 3, 'setup: three creatures in hand, a creature each side, a foe hand card and a face-down foe', JSON.stringify(seed));

	// ===== mouse =====
	const pos = uid => page.evaluate(u => window.__game.screenPosOf(u), uid);
	const h1 = await pos(seed.hand[1]);
	await page.mouse.move(h1.x, h1.y); await sleep(250);
	await page.mouse.click(h1.x, h1.y, { button: 'right' });
	await sleep(300);
	let f = await focus(), pn = await panel();
	A(f && f.uid === seed.hand[1], '[mouse] right-clicking a hand card opens the focus view on that card', JSON.stringify(f));
	A(pn && Math.abs(pn.cx - 640) < 8 && Math.abs(pn.cy - 360) < 40 && pn.w >= 360, '[mouse] ...centered and large (wider than the 300px side panel)', JSON.stringify(pn));
	A(pn && pn.count === '2 / 3', '[mouse] ...showing where it sits in your hand (2 / 3)', JSON.stringify(pn));
	A(await page.evaluate(() => getComputedStyle(document.querySelector('#card-focus .cf-backdrop')).backgroundColor !== 'rgba(0, 0, 0, 0)'), '[mouse] ...with the board dimmed behind it');
	await page.keyboard.press('ArrowRight'); await sleep(200);
	A((await focus())?.uid === seed.hand[2], '[mouse] → steps to the next card in your hand');
	await page.click('#card-focus .cf-prev'); await sleep(200);
	A((await focus())?.uid === seed.hand[1], '[mouse] the ◄ button steps back');
	await page.keyboard.press('Escape'); await sleep(200);
	A(!(await focus()) && !(await panel()), '[mouse] Esc closes it');
	// backdrop click closes
	await page.mouse.click(h1.x, h1.y, { button: 'right' }); await sleep(300);
	await page.mouse.click(30, 690); await sleep(250);
	A(!(await focus()), '[mouse] clicking the dimmed backdrop closes it');
	// an enemy creature on the board
	const fo = await pos(seed.foe);
	await page.mouse.click(fo.x, fo.y, { button: 'right' }); await sleep(300);
	A((await focus())?.uid === seed.foe, '[mouse] right-click works on an enemy creature too', JSON.stringify(await focus()));
	await page.keyboard.press('Escape'); await sleep(150);
	// a targeting mode: right-click still cancels it and opens nothing
	await page.evaluate(u => window.__game.armAttack(u), seed.mine); await sleep(150);
	await page.mouse.click(fo.x, fo.y, { button: 'right' }); await sleep(250);
	A(await page.evaluate(() => window.__game.targeting.attacker == null) && !(await focus()), '[mouse] while an attack is armed, right-click cancels it (no reader)');

	// ===== hidden information =====
	A(await page.evaluate(u => { const g = window.__game; return g.showCardFocus(g.state.players[1 - g.HUMAN].hand.find(c => c.uid === u)) === false && !g.cardFocus; }, seed.foeHand), 'an enemy HAND card never opens');
	A(await page.evaluate(u => { const g = window.__game; return g.showCardFocus(g.state.players[1 - g.HUMAN].board.find(c => c.uid === u)) === false && !g.cardFocus; }, seed.disguised), 'a face-down enemy card never opens');

	// ===== Play from the reader =====
	await page.mouse.click(h1.x, h1.y, { button: 'right' }); await sleep(300);
	pn = await panel();
	A(pn && pn.actions.includes('Play'), 'the reader offers Play for a playable hand card', JSON.stringify(pn && pn.actions));
	const hand0 = await page.evaluate(() => window.__game.state.players[window.__game.HUMAN].hand.length);
	await page.evaluate(() => [...document.querySelectorAll('#card-focus .ins-actions button')].find(b => b.textContent === 'Play').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
	await sleep(900);
	const after = await page.evaluate(u => { const g = window.__game, p = g.state.players[g.HUMAN]; return { hand: p.hand.length, onBoard: p.board.some(c => c.uid === u) }; }, seed.hand[1]);
	A(!(await focus()) && after.hand === hand0 - 1 && after.onBoard, 'Play closes the reader and plays the card', JSON.stringify(after));

	// ===== controller =====
	await page.mouse.move(5, 5);
	await tap(BTN.rightD);   // first press shows board focus
	await page.evaluate(u => window.__padboard.focusUid(u), seed.hand[0]);
	await tap(BTN.left);
	await sleep(200);
	A((await focus())?.uid === seed.hand[0], '[pad] the left face button opens the focus view on the focused card', JSON.stringify(await focus()));
	A(await page.evaluate(() => window.__padboard.active() === false), '[pad] ...and the board stands aside while it is open (padnav drives it)');
	await tap(BTN.rb); await sleep(150);
	const stepped = (await focus())?.uid;
	A(stepped && stepped !== seed.hand[0], '[pad] RB steps to the next card', JSON.stringify(await focus()));
	await tap(BTN.bottom); await sleep(250);
	A(!(await focus()), '[pad] cancel closes it');
	A(await page.evaluate(() => window.__padboard.focus) === 'u:' + stepped, '[pad] ...and board focus is now on the card you were reading', JSON.stringify({ focus: await page.evaluate(() => window.__padboard.focus), stepped }));
	// confirm on an enemy creature: nothing to do with it, so it opens the reader
	await page.evaluate(u => window.__padboard.focusUid(u), seed.foe);
	await tap(BTN.right); await sleep(250);
	A((await focus())?.uid === seed.foe && await page.evaluate(() => window.__padboard.mode === 'browse'), '[pad] confirm on an enemy creature opens the reader (no attack armed)', JSON.stringify(await focus()));
	await tap(BTN.bottom); await sleep(200);
	// the hero power orb: the inspect button reads it
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
