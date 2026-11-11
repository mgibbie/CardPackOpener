// ow_keyboard_scheme_test.mjs — the overworld on a KEYBOARD ALONE (controls sweep B6).
// No mouse event is sent anywhere in this suite: real key presses only
// (page.keyboard, trusted, with real e.code), through the game's own listeners.
//
// The owner's map (2026-11-10), by physical key, the same on every screen:
//   arrows / W A S D  move (walk, or the cursor in every menu, battle, PC, dialog, minigame)
//   Z confirm · X back (held: run, as Shift) · Enter start menu · Backspace party
//   C bag (the X button) · V bike (the Y button) · Q / E page · Esc: a tap = back, held = Games switcher
//
// Regressions pinned here (each fails with its fix reverted):
//   - Shift+W didn't walk at all, so Shift+WASD couldn't run (ow_input.js matched e.key 'W')
//   - W pressed, then Shift, then W released: the keyup said 'W', missed, and the player
//     walked on until the tab lost focus
//   - a focused checkbox counted as "typing" and froze the game
//   - Enter (the start-menu key) threw a half-done Unown puzzle away
//   - CARDS → CHALLENGE FRIEND and watching a friend's card game left for Battlecards
//     without saving the position (the return trip put you back at the last door)
//
//   node overworld/tests/ow_keyboard_scheme_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const t = await openOverworld(browser, port);
	const { page, st } = t;
	const kb = page.keyboard;
	const press = async (k, ms = 120) => { await kb.press(k); await sleep(ms); };
	const ow = fn => page.evaluate(fn);
	A(await ow(() => typeof window.mpLeaveGuard === 'function' && window.mpLeaveGuard().state === 'safe'), 'the overworld boots with its leave guard (safe while walking)');

	// ===== walking: WASD, Shift / X to run =====
	{
		const s0 = await st();
		await kb.down('KeyD'); await sleep(450); await kb.up('KeyD'); await sleep(350);
		const s1 = await st();
		A(s1.x > s0.x && !s1.held.length, 'D walks right, and letting go stops', `${s0.x} -> ${s1.x} held=${s1.held}`);
		// Shift+W runs (REGRESSION: the old map was keyed on e.key, 'W' with Shift held)
		await kb.down('Shift'); await kb.down('KeyW'); await sleep(200);
		const s2 = await st();
		A(s2.held.includes('up') && s2.run === true, 'Shift+W walks up AND runs', JSON.stringify({ held: s2.held, run: s2.run }));
		await kb.up('KeyW'); await sleep(60);
		const s3 = await st();
		A(!s3.held.includes('up'), 'letting go of W while Shift is still held stops the walk', JSON.stringify(s3.held));
		await kb.up('Shift'); await sleep(350);
		// the stuck-walk order: W first, THEN Shift, release W (its keyup reads 'W')
		await kb.down('KeyS'); await sleep(80); await kb.down('Shift'); await sleep(80); await kb.up('KeyS'); await sleep(60);
		const s4 = await st();
		A(!s4.held.includes('down'), 'W/S pressed before Shift and released during it: no walking on (stuck-walk regression)', JSON.stringify(s4.held));
		await kb.up('Shift'); await sleep(200);
		A((await st()).run === false, 'letting go of Shift stops running');
		// hold X to run, like the controller's and the touch pad's B
		await kb.down('KeyX'); await sleep(100);
		A((await st()).run === true, 'holding X runs');
		await kb.down('Shift'); await kb.up('KeyX'); await sleep(60);
		A((await st()).run === true, '...with Shift still down, letting go of X keeps running');
		await kb.up('Shift'); await sleep(60);
		A((await st()).run === false, '...and letting go of both walks again');
		await sleep(400);
	}

	// ===== the start menu: Enter opens, WASD moves the cursor, Z picks, X / Esc back =====
	{
		await press('Enter');
		A((await st()).start, 'Enter opens the start menu');
		const pos0 = await st();
		await press('KeyS');
		const i1 = (await st()).startIdx;
		await press('KeyS');
		const i2 = (await st()).startIdx;
		await press('KeyW');
		const i3 = (await st()).startIdx;
		const pos1 = await st();
		A(i1 === 1 && i2 === 2 && i3 === 1, 'S / W move the menu cursor (S was "swap"/"sort" before)', `${i1},${i2},${i3}`);
		A(pos1.x === pos0.x && pos1.y === pos0.y && !pos1.held.length, '...without walking the player behind the menu');
		await press('KeyX');
		A(!(await st()).start, 'X closes it');
		await press('Enter');
		await press('Escape', 250);   // a quick tap: the switcher replays it to the game
		const s = await st();
		A(!s.start && !s.switcher, 'a quick tap of Esc is back (it closes the menu, no switcher)', JSON.stringify(s));
	}

	// ===== C = bag, Backspace = party, V = bike; Esc backs out of each =====
	{
		await press('KeyC');
		A((await st()).bag, 'C opens the bag (the X button)');
		await press('KeyS');
		A(await ow(() => window.__ow.bagMenu.idx) >= 0 && (await st()).bag, '...S moves inside it');
		await press('Escape', 250);
		A(!(await st()).bag, '...Esc closes it');
		await press('Backspace');
		A((await st()).party, 'Backspace opens the party (Select)');
		await press('KeyX');
		A(!(await st()).party, '...X closes it');
		await press('KeyV');
		A(!(await st()).biking && /BIKE/.test(await ow(() => document.getElementById('hud').textContent)), 'V tries the bike (no bike owned: it says so)');
		await ow(() => window.__ow.Bag.addItem('bicycle', 1));
		await press('KeyV', 200);
		A((await st()).biking, 'V gets on the bike once you own one');
		await kb.down('KeyV'); await sleep(700); await kb.up('KeyV'); await sleep(100);   // auto-repeat must not flicker it
		A((await st()).biking === false, '...and a held V flips it once, not on every repeat');
		const p = await st();
		await press('KeyC');   // C is not the bike any more
		A((await st()).biking === false && (await st()).bag, 'C opens the bag instead of the bike now', JSON.stringify(p));
		await press('KeyX');
	}

	// ===== the PC: WASD rows, V sort, C switch side, Q / E boxes =====
	{
		await ow(() => { const pc = window.__ow.pcMenu; pc.open = true; pc.side = 1; pc.idx = 0; pc.box = 0; pc.sort = 'dex'; });
		await sleep(150);
		await press('KeyS');
		const r = await ow(() => ({ ...window.__ow.pcMenu }));
		A(r.idx === 1 || r.side === 1, 'S moves down the PC list', JSON.stringify({ idx: r.idx, side: r.side }));
		await press('KeyV');
		A(await ow(() => window.__ow.pcMenu.sort) !== 'dex', 'V sorts the box (was S)', await ow(() => window.__ow.pcMenu.sort));
		await press('KeyC');
		A(await ow(() => window.__ow.pcMenu.side) === 0, 'C switches side (the X button)');
		await ow(() => { window.__ow.pcMenu.side = 1; });
		await press('KeyE');
		A(await ow(() => window.__ow.pcMenu.box) === 1, 'E pages to the next box');
		await press('KeyQ');
		A(await ow(() => window.__ow.pcMenu.box) === 0, 'Q pages back');
		await press('KeyX');
		A(!(await ow(() => window.__ow.pcMenu.open)), 'X leaves the PC');
	}

	// ===== a battle: WASD on the menu and the moves, V swaps moves, Esc backs out =====
	{
		await ow(() => window.__ow.startWildBattle({ id: 'magikarp', level: 3 }));
		await waitFor(() => ow(() => window.__ow.battle.active?.phase === 'menu'), 15000) || (await (async () => { for (let i = 0; i < 30 && !(await ow(() => window.__ow.battle.active?.phase === 'menu')); i++) await press('KeyZ', 250); })());
		A(await ow(() => window.__ow.battle.active?.phase === 'menu'), 'a wild battle reaches its menu with Z alone');
		await press('KeyD');
		A(await ow(() => window.__ow.battle.active.menuIdx) === 1, 'D moves the battle cursor (FIGHT -> BAG)');
		await press('KeyA');
		await press('KeyZ');
		A(await ow(() => window.__ow.battle.active.phase) === 'moves', 'A back to FIGHT, Z opens the moves');
		await press('KeyV');
		A(await ow(() => window.__ow.battle.active.swapFrom) === 0, 'V arms a move swap (was S)');
		await press('KeyD'); await press('KeyZ');
		const moves = await ow(() => window.__ow.party[0].moves.map(m => m.id));
		A(moves[0] === 'icebeam' && moves[1] === 'surf', '...D + Z swaps the two moves', moves.join(','));
		await press('Escape', 250);
		A(await ow(() => window.__ow.battle.active.phase) === 'menu', 'a tap of Esc is back in a battle too (it did nothing)');
		await ow(() => window.__ow.battle.finish('ran'));
		await waitFor(() => ow(() => !window.__ow.battle.blocking), 8000);
		for (let i = 0; i < 10 && (await st()).dialog; i++) await press('KeyX');
	}

	// ===== dialogs: Esc answers "no" like X =====
	{
		const ans = await ow(() => new Promise(res => { window.__ans = null; window.__ow.dialog.open('Esc test?', k => { window.__ans = k; }); res(); }));
		await press('Escape', 250);
		A(await ow(() => window.__ans) === 'x' && !(await st()).dialog, 'a tap of Esc closes a dialog as X ("no")', String(ans));
	}

	// ===== Esc held: the Games switcher; the start menu's GAMES row too =====
	{
		await kb.down('Escape'); await sleep(850); await kb.up('Escape'); await sleep(150);
		A((await st()).switcher, 'holding Esc opens the Games switcher');
		await press('Escape', 200);
		A(!(await st()).switcher, '...Esc closes it again');
		const items = await ow(() => window.__ow.startItems());
		await press('Enter');
		for (let i = 0; i < items.indexOf('GAMES'); i++) await press('KeyS', 60);
		await press('KeyZ', 250);
		A(items.includes('GAMES') && (await st()).switcher, 'START menu -> GAMES opens the switcher (a no-mouse way home)', items.join(','));
		await press('KeyX', 200);
		A(!(await st()).switcher, '...X closes it');
	}

	// ===== typing never moves anything; a checkbox is not typing =====
	{
		await ow(() => {
			const i = document.createElement('input'); i.id = 'kbtest'; document.body.appendChild(i);
			const c = document.createElement('input'); c.type = 'checkbox'; c.id = 'kbcheck'; document.body.appendChild(c);
			i.focus();
		});
		const s0 = await st();
		await kb.type('wasd zxcv');
		await kb.down('KeyD'); await sleep(400); await kb.up('KeyD'); await sleep(200);
		const s1 = await st();
		A(s1.x === s0.x && s1.y === s0.y && !s1.bag && !s1.start && await ow(() => document.getElementById('kbtest').value) === 'wasd zxcvd', 'typing in a text field types (nothing walks or opens)', JSON.stringify(s1));
		await ow(() => document.getElementById('kbcheck').focus());
		await kb.down('KeyA'); await sleep(450); await kb.up('KeyA'); await sleep(300);
		A((await st()).x < s1.x, 'a focused checkbox is NOT typing: A still walks (it froze the game)', `${s1.x} -> ${(await st()).x}`);
		await ow(() => { document.getElementById('kbtest').remove(); document.getElementById('kbcheck').remove(); document.activeElement?.blur?.(); });
	}

	// ===== minigames on the keyboard: the Unown puzzle =====
	{
		await ow(async () => { const m = await import('./unown_puzzle.js'); window.__uz = null; m.openUnownPuzzle(0, s => { window.__uz = s; }); });
		await sleep(200);
		const c0 = await ow(async () => (await import('./unown_puzzle.js')).unownPuzzle.cursor);
		await press('KeyD'); await press('KeyS');
		const c1 = await ow(async () => (await import('./unown_puzzle.js')).unownPuzzle.cursor);
		A(c1 === c0 + 7, 'Unown puzzle: D / S move the cursor', `${c0} -> ${c1}`);
		await press('Enter');
		A(await ow(async () => (await import('./unown_puzzle.js')).unownPuzzle.open), 'Unown puzzle: Enter no longer throws the puzzle away');
		await press('KeyX');
		A(!(await ow(async () => (await import('./unown_puzzle.js')).unownPuzzle.open)) && await ow(() => window.__uz) === false, '...X quits it');
	}

	// ===== card flip on the keyboard: S / W pick NO / YES, Z answers =====
	{
		await ow(async () => { window.__ow.Bag.addCoins(30); const m = await import('./minigames/cardflip/cardflip.js'); window.__cfDone = false; m.startCardFlip(() => { window.__cfDone = true; }); });
		await waitFor(() => ow(async () => (await import('./minigames/cardflip/cardflip.js')).cardFlip.phase === 'AskPlayWithThree'), 8000);
		await sleep(500);
		await press('KeyS'); await press('KeyZ', 600);
		A(await ow(() => window.__cfDone), 'card flip: S moves to NO and Z leaves the table');
	}

	// ===== the CONTROLS screen lists the new keys =====
	{
		const rows = await ow(() => window.__ow.KEY_ACTIONS.map(a => `${a.id}=${a.keys}`));
		A(rows.includes('bike=V') && rows.includes('bag=C / B') && rows.includes('party=BACKSPACE / P'), 'OPTIONS > CONTROLS shows C = bag, V = bike, Backspace = party', rows.join(' '));
		A(await ow(() => window.__ow.assignKeyBind('bag', 'v')) === 'reserved' && await ow(() => window.__ow.assignKeyBind('bag', 'q')) === 'reserved', 'V and Q can no longer be rebound over');
	}

	// ===== leaving for Battlecards saves where you stand (REGRESSION) =====
	{
		await kb.down('KeyD'); await sleep(450); await kb.up('KeyD'); await sleep(400);
		const here = await st();
		await ow(() => localStorage.removeItem('magepunk_pos_v1'));
		await ow(() => window.__ow.friendAction({ username: 'pal', online: true, status: 'card:pvp' }));
		await sleep(150);
		A((await st()).dialog, '(the "watch?" question is up)');
		const nav = page.waitForNavigation({ timeout: 8000 }).catch(() => null);
		await press('KeyZ');   // the first Z finishes the typewriter, the second answers
		if (await page.evaluate(() => window.__ow?.dialog?.blocking).catch(() => false)) await press('KeyZ');
		await nav;
		A(/\/battlecards\/\?spectate=pal/.test(page.url()), '...Z went to watch it', page.url());
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'));
		A(saved && saved.map === here.map && saved.x === here.x && saved.y === here.y, 'watching a friend\'s card game saves the position before leaving', JSON.stringify({ saved, here }));
	}

	A(t.errors.length === 0, 'no page errors', t.errors.slice(0, 3).join(' | '));
	await t.ctx.close();

	// CARDS → CHALLENGE FRIEND: the accepted card duel leaves for Battlecards (goCardDuel) — position saved first
	{
		const t2 = await openOverworld(browser, port);
		await t2.page.keyboard.down('KeyA'); await sleep(450); await t2.page.keyboard.up('KeyA'); await sleep(400);
		const here = await t2.st();
		await t2.page.evaluate(() => localStorage.removeItem('magepunk_pos_v1'));
		const nav = t2.page.waitForNavigation({ timeout: 8000 }).catch(() => null);
		await t2.page.evaluate(async () => (await import('./ow_pvp.js')).goCardDuel('m1'));
		await nav;
		const saved = await t2.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'));
		A(/cardpvp=m1/.test(t2.page.url()) && saved && saved.x === here.x && saved.y === here.y && saved.map === here.map, 'a card duel from CARDS → CHALLENGE FRIEND saves the position before leaving', JSON.stringify({ saved, here, url: t2.page.url() }));
		await t2.ctx.close();
	}
} catch (e) {
	A(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
