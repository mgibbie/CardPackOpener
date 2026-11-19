// ow_runmodes_menu_test.mjs — START > CARDS > DUNGEON RUN offers every Battlecards run mode (owner's list 5, item 8,
// 2026-11-19: it lacked Arena and the five Lorequest modes). overworld/ow_screens.js runModeItems / runKey.
//   1. DUNGEON RUN lists OG Dungeon Run, Dalaran Heist, Tombs of Terror, Duels, Arena and LOREQUEST SAGA; LOREQUEST SAGA
//      opens a sub-list of the five sagas. Neither list needs two columns.
//   2. by keyboard, every entry opens its battlecards page (?dungeon=1 ... ?multiverse=1), the position saved first
//   3. B in the sub-list steps back to the run modes (on LOREQUEST SAGA); B again goes back to CARDS
//   4. by touch/mouse: tapping a row opens it too (Arena; Final Fantasy inside the sub-list)
//   node overworld/tests/ow_runmodes_menu_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const MAIN = { 'OG DUNGEON RUN': 'dungeon', 'DALARAN HEIST': 'heist', 'TOMBS OF TERROR': 'tombs', 'DUELS': 'duels', 'ARENA': 'arena' };
const LORE = { 'LOREQUEST': 'lorequest', 'MIDDLE-EARTH': 'middleearth', 'SWORD COAST': 'swordcoast', 'FINAL FANTASY': 'finalfantasy', 'MULTIVERSE': 'multiverse' };
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const t = await openOverworld(browser, port);
	const { page } = t;
	// a page leaving for /battlecards/ is caught and stopped (the overworld stays, so the next entry can be tried)
	let went = null;
	await page.setRequestInterception(true);
	page.on('request', rq => {
		if (rq.isNavigationRequest() && /\/battlecards\//.test(rq.url())) { went = rq.url(); rq.abort('aborted').catch(() => {}); return; }
		rq.continue().catch(() => {});
	});
	const press = async (k, ms = 120) => { await page.keyboard.press(k); await sleep(ms); };
	const st = () => page.evaluate(async () => {
		const M = await import('./ow_screens.js'), S = await import('./ow_menustate.js'), ow = window.__ow;
		const rows = (ow.menuUi || []).filter(b => /^run:/.test(b.id));
		return { run: S.runMenu.open, lore: !!S.runMenu.lore, idx: S.runMenu.idx, items: M.runModeItems(), cards: S.cardsMenu.open, cardsIdx: S.cardsMenu.idx, cardsItems: M.cardsItems(),
			cols: new Set(rows.map(b => Math.round(b.x))).size, rows: rows.map(b => [b.label, b.x, b.y, b.w, b.h]), cw: document.querySelector('canvas').width, ch: document.querySelector('canvas').height };
	});
	const walkTo = async label => { for (let i = 0; i < 12; i++) { const s = await st(); if (s.items[s.idx] === label) return true; await press('ArrowDown', 80); } return false; };
	// clear the saved position, so "saved first" is what the leave itself wrote
	const clearPos = () => page.evaluate(() => localStorage.removeItem('magepunk_pos_v1'));
	const savedPos = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'), W = window.__ow; return !!p && p.map === W.world.current.name && p.x === W.player.tx && p.y === W.player.ty; });
	const opened = async (q, how) => {
		await sleep(400);
		const u = went ? new URL(went) : null;
		A(!!u && u.pathname === '/battlecards/' && new RegExp('^\\?' + q + '=1(&mp=1)?$').test(u.search), `${how}: opens /battlecards/?${q}=1`, went);
		A(await savedPos(), `${how}: the position was saved first`);
		went = null;
	};

	// ===== 1. into DUNGEON RUN by keyboard =====
	await press('Enter');
	const cardsAt = await page.evaluate(async () => (await import('./ow_screens.js')).startItems().indexOf('CARDS'));
	for (let k = 0; k < cardsAt; k++) await press('ArrowDown', 80);
	await press('KeyZ', 300);
	let s = await st();
	A(s.cards, 'START > CARDS is open', s);
	for (let i = 0; i < 10 && s.cardsItems[s.cardsIdx] !== 'DUNGEON RUN'; i++) { await press('ArrowDown', 80); s = await st(); }
	await press('KeyZ', 300);
	s = await st();
	A(s.run && !s.lore && s.items.join() === 'OG DUNGEON RUN,DALARAN HEIST,TOMBS OF TERROR,DUELS,ARENA,LOREQUEST SAGA,BACK', 'DUNGEON RUN lists the five climbs, LOREQUEST SAGA and BACK', s.items);
	A(s.cols === 1 && s.rows.length === 7, 'all seven rows drawn in one column', s.rows.length + ' rows, ' + s.cols + ' cols');

	// ===== 2. each climb opens its page =====
	for (const [label, q] of Object.entries(MAIN)) {
		A(await walkTo(label), `the cursor reaches ${label}`);
		await clearPos(); await press('KeyZ');
		await opened(q, label + ' (keyboard)');
	}
	// the sagas
	A(await walkTo('LOREQUEST SAGA'), 'the cursor reaches LOREQUEST SAGA');
	await press('KeyZ', 300);
	s = await st();
	A(s.run && s.lore && s.idx === 0 && s.items.join() === 'LOREQUEST,MIDDLE-EARTH,SWORD COAST,FINAL FANTASY,MULTIVERSE,BACK', 'LOREQUEST SAGA opens the five sagas', s.items);
	A(s.cols === 1 && s.rows.length === 6 && s.rows.every(r => r[1] >= 0 && r[1] + r[3] <= s.cw && r[2] + r[4] <= s.ch), 'drawn in one column, on screen', s.rows);
	for (const [label, q] of Object.entries(LORE)) {
		A(await walkTo(label), `the cursor reaches ${label}`);
		await clearPos(); await press('KeyZ');
		await opened(q, label + ' (keyboard)');
	}

	// ===== 3. B steps back one level at a time =====
	await press('KeyX', 250);
	s = await st();
	A(s.run && !s.lore && s.items[s.idx] === 'LOREQUEST SAGA', 'B in the sagas: back to the run modes, on LOREQUEST SAGA', [s.lore, s.items[s.idx]]);
	await press('KeyZ', 250); await walkTo('BACK'); await press('KeyZ', 250);
	s = await st();
	A(s.run && !s.lore && s.items[s.idx] === 'LOREQUEST SAGA', 'BACK in the sagas does the same', [s.lore, s.items[s.idx]]);
	await press('KeyX', 250);
	s = await st();
	A(!s.run && s.cards, 'B in the run modes: back to CARDS', s);

	// ===== 4. touch / mouse =====
	await press('KeyZ', 300);   // (CARDS' cursor is still on DUNGEON RUN)
	const tap = async label => {
		const q = await st(), row = q.rows.find(r => r[0] === label);
		if (!row) return false;
		const rect = await page.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.left, c.top, c.width, c.height]; });
		await page.mouse.click(rect[0] + (row[1] + row[3] / 2) * rect[2] / q.cw, rect[1] + (row[2] + row[4] / 2) * rect[3] / q.ch);
		return true;
	};
	s = await st();
	A(s.run && !s.lore, '(Z on DUNGEON RUN reopens the run modes, at the top)', s);
	await clearPos();
	A(await tap('ARENA'), 'ARENA has a row to tap');
	await opened('arena', 'ARENA (tap)');
	A(await tap('LOREQUEST SAGA'), 'LOREQUEST SAGA has a row to tap');
	await sleep(300);
	s = await st();
	A(s.run && s.lore, 'tapping LOREQUEST SAGA opens the sagas', s.items);
	await clearPos();
	A(await tap('FINAL FANTASY'), 'FINAL FANTASY has a row to tap');
	await opened('finalfantasy', 'FINAL FANTASY (tap)');
	A(!t.errors.length, 'no page errors', t.errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
