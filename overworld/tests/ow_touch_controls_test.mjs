// ow_touch_controls_test.mjs — the overworld by TOUCH alone (controls sweep B6),
// on a phone held both ways: 390x844 portrait and 844x390 landscape. Only
// page.touchscreen taps: the on-screen pad, the canvas menus, and the minigames'
// own screens, which used to answer only the on-screen pad.
//
// Pinned here (each fails with its fix reverted):
//   - the START menu ran off the bottom of the menu band (16 rows signed in, 13 as
//     a guest): its last rows (GAMES, EXIT) could not be tapped
//   - the Unown puzzle, card flip, the berry blender and contests ignored taps on
//     their screens (a tap on a slot / bet square / berry / move did nothing)
//   - the Game Corner, Gen-3 SLOTS, the secret base and the other menus outside the
//     old anyMenuOpen() list ignored every tap on the canvas
//   - a tap on CLOSE sent Escape AND X, so it closed two layers (SLOTS → its menu → gone)
//
//   node overworld/tests/ow_touch_controls_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor, canvasToClient } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
		const t = await openOverworld(browser, port, { viewport, touch: true });
		const { page, st } = t;
		const ow = (fn, ...a) => page.evaluate(fn, ...a);
		const tapClient = async (x, y, ms = 150) => { await page.touchscreen.tap(Math.round(x), Math.round(y)); await sleep(ms); };
		const tapCanvas = async (x, y, ms) => { const p = await canvasToClient(page, x, y); await tapClient(p.x, p.y, ms); };
		const tapEl = async (id, ms) => { const b = await ow(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id); await tapClient(b.x, b.y, ms); };
		// a canvas menu button by its id (the rect the menu laid out this frame)
		const rectOf = id => ow(id => { const b = window.__ow.menuUi.find(b => b.id === id); return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null; }, id);
		const tapId = async (id, ms) => { const b = await rectOf(id); if (!b) return false; await tapCanvas(b.x + b.w / 2, b.y + b.h / 2, ms); return true; };
		// a point on a GB / GBA minigame screen -> canvas px (the module's last-frame placement)
		const gbTap = async (mod, view, gx, gy, ms) => {
			const v = await ow(async (mod, view) => (await import(mod))[view](), mod, view);
			if (!v) return false;
			await tapCanvas(v.ox + gx * v.k, v.oy + gy * v.k, ms);
			return true;
		};
		const L = m => `${label}: ${m}`;

		A(await ow(() => document.body.classList.contains('touch')), L('the touch pad is up'));
		// the pad walks, and its START opens the menu
		{
			const s0 = await st();
			const r = await ow(() => { const r = document.getElementById('t-right').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
			await page.touchscreen.touchStart(r.x, r.y); await sleep(450); await page.touchscreen.touchEnd(); await sleep(350);
			A((await st()).x > s0.x, L('the d-pad walks'));
		}
		// ===== the START menu fits, and every row can be tapped (GAMES -> the switcher) =====
		{
			await tapEl('t-start', 250);
			A((await st()).start, L('START opens the start menu'));
			const fit = await ow(() => {
				const c = document.getElementById('screen'), MH = Math.min(c.height, Math.round(c.width / 1.5));
				const rows = window.__ow.menuUi.filter(b => /^start:/.test(b.id));
				return { n: rows.length, items: window.__ow.startItems().length, out: rows.filter(b => b.y + b.h > MH + 1 || b.x < 0 || b.x + b.w > c.width).map(b => b.id) };
			});
			A(fit.n === fit.items && !fit.out.length, L(`all ${fit.items} START rows sit inside the menu band`), JSON.stringify(fit));
			const gi = (await ow(() => window.__ow.startItems())).indexOf('GAMES');
			await tapId('start:' + gi, 300);
			await sleep(500);
			A(/overworld\/index\.html/.test(page.url()) && (await st()).switcher, L('tapping GAMES opens the Games switcher (and the same tap does not pick a game in it)'), page.url());
			await ow(() => window.__mpSwitcher.close()); await sleep(200);
		}
		// ===== CLOSE backs out ONE layer: Gen-3 SLOTS -> the Game Corner menu =====
		{
			await ow(async () => { window.__ow.Bag.addCoins(50); const gc = await import('./ow_gamecorner.js'); const m = await import('./ow_minigames.js'); gc.gcMenu.open = false; m.slotsMenu.open = true; m.slotsMenu.game = null; m.slotsMenu.bet = 1; });
			await sleep(250);
			await tapId('gslot:plus');
			A(await ow(async () => (await import('./ow_minigames.js')).slotsMenu.bet) === 2, L('SLOTS: tapping + raises the bet'));
			await tapId('gslot:spin', 200);
			A(await ow(async () => !!(await import('./ow_minigames.js')).slotsMenu.game), L('SLOTS: tapping the reels spins'));
			for (let i = 0; i < 3; i++) await tapId('gslot:spin', 200);
			A(await ow(async () => (await import('./ow_minigames.js')).slotsMenu.game?.done), L('SLOTS: ...and each tap stops a reel'));
			await tapId('close', 250);
			const after = await ow(async () => ({ slots: (await import('./ow_minigames.js')).slotsMenu.open, gc: (await import('./ow_gamecorner.js')).gcMenu.open }));
			A(!after.slots && after.gc, L('CLOSE on SLOTS backs out to the Game Corner menu (it closed both)'), JSON.stringify(after));
			const gcRow = await rectOf('gc:0');
			A(!!gcRow, L('the Game Corner menu lays out tappable rows'));
			await tapId('close', 250);
			A(!(await ow(async () => (await import('./ow_gamecorner.js')).gcMenu.open)), L('...and its CLOSE closes it'));
		}
		// ===== the Unown puzzle: tap a piece, tap an empty slot, tap CANCEL =====
		{
			await ow(async () => { const m = await import('./unown_puzzle.js'); window.__uz = null; m.openUnownPuzzle(0, s => { window.__uz = s; }); });
			await waitFor(() => ow(async () => !!(await import('./unown_puzzle.js')).unownPuzzleTapView()), 4000);
			const pick = await ow(async () => { const u = (await import('./unown_puzzle.js')).unownPuzzle; const s = u.pieces.findIndex(Boolean); const e = u.pieces.findIndex((p, i) => !p && !(Math.floor(i / 6) === 5 && i % 6 > 0 && i % 6 < 5)); return { s, e, piece: u.pieces[s] }; });
			const slot = s => [(1 + (s % 6) * 3) * 8 + 12, Math.floor(s / 6) * 24 + 12];
			await gbTap('./unown_puzzle.js', 'unownPuzzleTapView', ...slot(pick.s));
			const held = await ow(async () => { const u = (await import('./unown_puzzle.js')).unownPuzzle; return { held: u.held, cur: u.cursor }; });
			A(held.held === pick.piece && held.cur === pick.s, L('Unown: a tap on a piece moves there and picks it up'), JSON.stringify({ pick, held }));
			await gbTap('./unown_puzzle.js', 'unownPuzzleTapView', ...slot(pick.e));
			const put2 = await ow(async e => { const u = (await import('./unown_puzzle.js')).unownPuzzle; return { held: u.held, at: u.pieces[e] }; }, pick.e);
			A(put2.held === 0 && put2.at === pick.piece, L('Unown: a tap on an empty slot puts it down'), JSON.stringify(put2));
			await gbTap('./unown_puzzle.js', 'unownPuzzleTapView', 80, 132);
			A(!(await ow(async () => (await import('./unown_puzzle.js')).unownPuzzle.open)) && await ow(() => window.__uz) === false, L('Unown: a tap on START/CANCEL quits'));
		}
		// ===== card flip: YES, the flashing cards, a bet square (twice), then NO =====
		{
			await ow(async () => { window.__ow.Bag.addCoins(30); const m = await import('./minigames/cardflip/cardflip.js'); window.__cfDone = false; m.startCardFlip(() => { window.__cfDone = true; }); });
			const CF = './minigames/cardflip/cardflip.js';
			const phase = () => ow(async () => (await import('./minigames/cardflip/cardflip.js')).cardFlip.phase);
			await waitFor(async () => await phase() === 'AskPlayWithThree', 8000); await sleep(400);
			await gbTap(CF, 'cardFlipTapView', 130, 66, 400);   // YES
			A(await waitFor(async () => ['DeductCoins', 'ChooseACard'].includes(await phase()), 4000), L('card flip: a tap on YES plays'), await phase());
			await waitFor(async () => await phase() === 'ChooseACard', 4000); await sleep(1200);
			await gbTap(CF, 'cardFlipTapView', 40, 40, 300);   // stop the flashing border
			A(await waitFor(async () => await phase() === 'PlaceYourBet', 5000), L('card flip: a tap picks a card'), await phase());
			await sleep(400);
			// the single square at cursor (x 3, y 4): tile (15, 8)
			await gbTap(CF, 'cardFlipTapView', 15 * 8 + 4, 8 * 8 - 12, 200);
			const cur = await ow(async () => { const f = (await import('./minigames/cardflip/cardflip.js')).cardFlip; return [f.cursorX, f.cursorY, f.phase]; });
			A(cur[2] === 'PlaceYourBet' && !(cur[0] === 2 && cur[1] === 2), L('card flip: a tap on a bet square moves the cursor there'), JSON.stringify(cur));
			await gbTap(CF, 'cardFlipTapView', 15 * 8 + 4, 8 * 8 - 12, 300);
			A(await waitFor(async () => ['CheckTheCard', 'TabulateTheResult', 'PlayAgain'].includes(await phase()), 4000), L('card flip: a second tap on it places the bet'), await phase());
			for (let i = 0; i < 40 && await phase() !== 'PlayAgain'; i++) await gbTap(CF, 'cardFlipTapView', 40, 120, 250);
			await sleep(600);
			await gbTap(CF, 'cardFlipTapView', 130, 84, 900);   // NO
			A(await waitFor(() => ow(() => window.__cfDone), 4000), L('card flip: a tap on NO leaves the table'));
		}
		// ===== the berry blender: tap through the intro, tap a berry =====
		{
			await ow(async () => { window.__ow.Bag.addItem('cheriberry', 2); const m = await import('./minigames/blender/blender.js'); m.startBerryBlender({ opponents: 1 }, () => {}); });
			const B = './minigames/blender/blender.js';
			const bs = () => ow(async () => { const b = (await import('./minigames/blender/blender.js')).blender; return { phase: b.phase, list: !!b.list, text: b.text, items: b.items && b.items.slice() }; });
			await waitFor(async () => (await bs()).phase !== 'off', 4000);
			for (let i = 0; i < 15 && !((await bs()).list && !(await bs()).text); i++) await gbTap(B, 'blenderTapView', 60, 60, 250);
			const s1 = await bs();
			A(s1.list && !s1.text, L('blender: taps turn the pages to the berry list'), JSON.stringify(s1));
			await gbTap(B, 'blenderTapView', 170, 20, 400);   // the first row
			const s2 = await bs();
			A(s2.items && s2.items[0] === 'cheriberry', L('blender: a tap on a berry row blends it'), JSON.stringify(s2));
			await ow(async () => (await import('./minigames/blender/blender.js')).closeBerryBlender());
		}
		// ===== a contest: taps turn the MC's pages, a tap on a move picks it =====
		{
			await ow(async () => { const m = await import('./contest_ui.js'); window.__contestDone = false; m.runContest(window.__ow.party[0], 0, 0).then(() => { window.__contestDone = true; }).catch(e => { window.__contestErr = String(e); }); });
			const cv = () => ow(async () => { const v = (await import('./contest_ui.js')).contestView(); return { phase: v.phase, choice: v.choice, waiting: v.waiting }; });
			await waitFor(async () => (await cv()).phase !== 'off', 6000);
			for (let i = 0; i < 40 && (await cv()).phase !== 'select'; i++) await gbTap('./contest_ui.js', 'contestTapView', 120, 60, 200);
			A((await cv()).phase === 'select', L('contest: taps reach the move select'), JSON.stringify(await cv()));
			await gbTap('./contest_ui.js', 'contestTapView', 30, 89 + 16 + 6, 250);   // the 2nd move
			const v = await cv();
			A(v.choice === 1 && v.phase !== 'select', L('contest: a tap on a move picks it'), JSON.stringify(v));
			await ow(async () => { const m = await import('./contest_ui.js'); m.contestMenu.open = false; });
		}
		A(t.errors.length === 0, L('no page errors'), t.errors.slice(0, 3).join(' | '));
		await page.screenshot({ path: process.env.B6_SHOTS ? `${process.env.B6_SHOTS}/touch_${label}.png` : undefined }).catch(() => {});
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
