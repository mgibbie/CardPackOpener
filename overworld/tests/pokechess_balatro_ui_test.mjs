// pokechess_balatro_ui_test.mjs — the PokéChess page (/overworld/pokechess.html) in the site's Balatro-style kit
// (site/ui/balatro.css + sfx.js + canvas.js), desktop and phone:
//   - it loads with no errors as a guest and reaches the player's turn;
//   - the page uses the kit: the body is .bal-page in the m6x11 font, the bar's buttons are kit buttons in the kit's
//     colours (Back orange, Replays blue, Resign red), the Replays list is a kit dialog with kit rows;
//   - the canvas is drawn with the kit: the felt behind the board, the dark squares in the kit grey, the side panel a
//     kit panel, its labels in m6x11;
//   - sounds: nothing before a gesture; a bar button presses with Micatro's button.ogg, Replays slides a card in, the
//     list's Close cancels, picking a piece on the board highlights (highlight1.ogg), a move deals a card (card1.ogg);
//   - the old paths still work: a click picks a piece and its moves, the keyboard (arrows + Z / X) moves the cursor
//     and picks, C opens the Replays list and X closes it, the bar's Resign arms the resign;
//   - the phone layout has no sideways scroll and the bar's buttons stay finger-sized.
//   node overworld/tests/pokechess_balatro_ui_test.mjs        (screenshots: SHOTS=<dir>)
// Covers overworld/pokechess.html, overworld/pokechess/game.js.
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const CELL = 72, PAD = 24, BOARD = CELL * 8;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const near = (p, c, tol = 8) => !!p && Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;
const rgb = (h) => `rgb(${hex(h).join(', ')})`;

const SPY = () => {
	window.__au = { ctx: 0, starts: 0, fetched: [] };
	const AC = window.AudioContext;
	if (AC) {
		window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__au.ctx++; } };
		const st = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); };
	}
	const f = window.fetch;
	window.fetch = function (u, ...a) { const s = String(u && u.url || u); if (/\.ogg/.test(s)) window.__au.fetched.push(s.split('/').pop().split('?')[0]); return f.call(this, u, ...a); };
	window.__fonts = {};
	const ft = CanvasRenderingContext2D.prototype.fillText;
	CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__fonts[String(t)] = this.font; return ft.call(this, t, ...a); };
	try { localStorage.removeItem('micatro_sfx'); } catch { }
};

async function open(browser, port, vp) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(SPY);
	await page.goto(`http://localhost:${port}/overworld/pokechess.html`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => window.__pokechess && window.__pokechess.phase === 'player'), 60000);
	await sleep(800);
	return { ctx, page, errors };
}
const px = (page, x, y) => page.evaluate((x, y) => Array.from(document.getElementById('board').getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data), x, y);
const au = (page) => page.evaluate(() => ({ ...window.__au, fetched: [...window.__au.fetched] }));
const heard = (page, file, after = 0) => waitFor(async () => { const s = await au(page); return s.fetched.includes(file) && s.starts > after; }, 6000);
// a board cell's centre in client coordinates
const cellPt = (page, r, c) => page.evaluate((r, c, CELL, PAD) => {
	const cv = document.getElementById('board'), b = cv.getBoundingClientRect();
	const x = PAD + (c - 1) * CELL + CELL / 2, y = PAD + (8 - r) * CELL + CELL / 2;
	return { x: b.left + x * b.width / cv.width, y: b.top + y * b.height / cv.height };
}, r, c, CELL, PAD);

const { server, port } = await startServer();
const browser = await launch();
try {
	// ------------------------------------------------------------------ desktop
	{
		const { ctx, page, errors } = await open(browser, port, { width: 1400, height: 1000 });
		A(await page.evaluate(() => window.__pokechess.phase) === 'player', 'desktop: a guest game reaches the player\'s turn');
		A((await au(page)).ctx === 0, 'desktop: no AudioContext before a user gesture');
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pokechess_desktop.png') });

		// the page: kit body, font, buttons
		const css = await page.evaluate(() => {
			const cs = (s) => getComputedStyle(document.querySelector(s));
			return { bodyClass: document.body.className, font: cs('body').fontFamily, bg: cs('body').backgroundImage, bgColor: cs('body').backgroundColor, leave: cs('#leave').backgroundColor, leaveFont: cs('#leave').fontFamily,
				replays: cs('#pcReplays').backgroundColor, resign: cs('#pcResign').backgroundColor, games: cs('#bar a').backgroundColor,
				fontOk: document.fonts.check('20px m6x11') };
		});
		A(/\bbal-page\b/.test(css.bodyClass) && /m6x11/.test(css.font), 'desktop: the page is a kit page in the m6x11 font', JSON.stringify([css.bodyClass, css.font]));
		// (the page behind the board is the kit's FLAT --bal-bg, not its fixed felt: the board is a canvas redrawn every frame;
		// the board draws its own felt, checked at the canvas corner below)
		A(css.bg === 'none' && css.bgColor === rgb('#2d3d40'), 'desktop: the page is the flat --bal-bg (no fixed felt under the per-frame board)', JSON.stringify([css.bg, css.bgColor]));
		A(css.fontOk, 'desktop: the m6x11 font has loaded');
		A(css.leave === rgb('#fda200') && /m6x11/.test(css.leaveFont), 'desktop: "Back to overworld" is the kit orange button', css.leave);
		A(css.replays === rgb('#009dff'), 'desktop: Replays is the kit blue button', css.replays);
		A(css.resign === rgb('#fe5f55'), 'desktop: Resign is the kit red button', css.resign);
		A(css.games === rgb('#5f7377'), 'desktop: the Games link is a kit grey button', css.games);

		// the canvas
		const dark = await px(page, PAD + 6, PAD + 3 * CELL + 6);   // row 5, col 1: an empty dark square
		A(near(dark, hex('#5f7377')), 'desktop: the dark squares are the kit grey', JSON.stringify(dark));
		const light = await px(page, PAD + CELL + 6, PAD + 3 * CELL + 6);   // row 5, col 2
		A(near(light, hex('#dfe7e8')), 'desktop: the light squares are the kit soft white', JSON.stringify(light));
		const panel = await px(page, PAD * 2 + BOARD + 14, PAD + 260);
		A(near(panel, hex('#3a4b4f')), 'desktop: the side panel is a kit panel', JSON.stringify(panel));
		const corner = await px(page, 3, 3);
		A(corner[1] > corner[0] && corner[1] > corner[2], 'desktop: the felt (green) shows around the board', JSON.stringify(corner));
		A(/m6x11/.test(await page.evaluate(() => window.__fonts['PokéChess'] || '')), 'desktop: the panel labels are drawn in m6x11');

		// sounds + the old paths: a click picks a pawn (highlight), a click on its target moves (card)
		const p = await cellPt(page, 2, 4);
		await page.mouse.click(p.x, p.y);
		A(await page.evaluate(() => JSON.stringify(window.__pokechess.sel)) === '[2,4]' && await page.evaluate(() => (window.__pokechess.validMoves || []).length > 0), 'desktop: a click picks the pawn and shows its moves (click path kept)');
		A(await heard(page, 'highlight1.ogg'), 'desktop: picking a piece plays the kit select sound (highlight1.ogg)', JSON.stringify(await au(page)));
		const q = await cellPt(page, 4, 4);
		await page.mouse.click(q.x, q.y);
		A(await waitFor(() => page.evaluate(() => !!window.__pokechess.board.getPiece(4, 4)), 3000), 'desktop: a click on a highlighted square moves the pawn');
		A(await heard(page, 'card1.ogg'), 'desktop: the move deals a card (card1.ogg)');
		await waitFor(() => page.evaluate(() => window.__pokechess.phase === 'player'), 20000);
		await sleep(400);

		// the keyboard still drives the board
		await page.evaluate(() => { const k = window.__pokechess; k.key('x'); });
		const c0 = await page.evaluate(() => window.__pokechess.cursor);
		await page.keyboard.press('ArrowRight');
		const c1 = await page.evaluate(() => window.__pokechess.cursor);
		A(c1[1] === Math.min(8, c0[1] + 1), 'desktop: the arrow keys move the cursor (keyboard path kept)', JSON.stringify([c0, c1]));

		// the bar: Replays opens the kit list with a card slide; Close cancels
		const s0 = (await au(page)).starts;
		await page.click('#pcReplays');
		A(await waitFor(() => page.evaluate(() => window.__pokechess.listOpen), 2000), 'desktop: Replays opens the list');
		A(await heard(page, 'cardSlide1.ogg', s0), 'desktop: Replays slides the list in (cardSlide1.ogg)');
		const list = await page.evaluate(() => {
			const el = document.getElementById('pcList'), cs = getComputedStyle(el), close = el.querySelector('.pc-close');
			return { panel: el.classList.contains('bal-panel'), bg: cs.backgroundColor, close: close && getComputedStyle(close).backgroundColor };
		});
		A(list.panel && list.bg === rgb('#3a4b4f') && list.close === rgb('#fda200'), 'desktop: the list is a kit dialog with an orange Close', JSON.stringify(list));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pokechess_replays_desktop.png') });
		const s1 = (await au(page)).starts;
		await page.click('#pcList .pc-close');
		A(await waitFor(() => page.evaluate(() => !window.__pokechess.listOpen), 2000), 'desktop: Close closes the list');
		A(await heard(page, 'cancel.ogg', s1), 'desktop: Close plays the kit back sound (cancel.ogg)');
		// C / X still open and close it
		await page.keyboard.press('c');
		A(await waitFor(() => page.evaluate(() => window.__pokechess.listOpen), 2000), 'desktop: C opens the Replays list (key kept)');
		await page.keyboard.press('x');
		A(await waitFor(() => page.evaluate(() => !window.__pokechess.listOpen), 2000), 'desktop: X closes it');

		// Resign presses with the button sound and arms
		const s2 = (await au(page)).starts;
		await page.click('#pcResign');
		A(await heard(page, 'button.ogg', s2), 'desktop: Resign presses with the kit button sound (button.ogg)');
		await sleep(300);
		A(await page.evaluate(() => Object.keys(window.__fonts).some((t) => /Resign\?/.test(t)) && !window.__pokechess.board.gameOver), 'desktop: Resign arms (asks again, the game goes on)');

		// sound off (Micatro's setting) is silence
		await page.evaluate(() => localStorage.setItem('micatro_sfx', '0'));
		const s3 = (await au(page)).starts;
		await page.click('#pcReplays'); await sleep(300); await page.click('#pcList .pc-close'); await sleep(400);
		A((await au(page)).starts === s3, "desktop: with Micatro's sound setting off the page is silent");
		A(errors.length === 0, 'desktop: no page errors', errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
	// ------------------------------------------------------------------ phone
	{
		const { ctx, page, errors } = await open(browser, port, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'pokechess_phone.png'), fullPage: true });
		const m = await page.evaluate(() => {
			const r = document.getElementById('leave').getBoundingClientRect();
			return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: r.height, kit: getComputedStyle(document.getElementById('leave')).backgroundColor };
		});
		A(m.sw <= m.cw + 1, 'phone: no sideways scroll', JSON.stringify(m));
		A(m.h >= 36 && m.kit === rgb('#fda200'), 'phone: the bar\'s buttons are finger-sized kit buttons', JSON.stringify(m));
		const p = await cellPt(page, 2, 5);
		await page.touchscreen.tap(p.x, p.y);
		A(await waitFor(() => page.evaluate(() => JSON.stringify(window.__pokechess.sel) === '[2,5]'), 3000), 'phone: a tap picks a piece (touch path kept)');
		A(errors.length === 0, 'phone: no page errors', errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
