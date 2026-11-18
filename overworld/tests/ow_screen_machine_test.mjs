// ow_screen_machine_test.mjs — "which overworld screen is up", as ONE table (Plans/STATE_MACHINES.md).
// Three lists used to answer "is a menu open" and disagreed: anyMenuOpen (the guard that keeps a friend's challenge
// from popping up over a menu) left out twelve menus, the trade screen among them. Now canvasMenuOpen, anyMenuOpen and
// openCanvasMenus all read ow_menukeys.js CANVAS_MENUS, and site/machine.js watches 'overworld.screen': whenever the menu
// DRAWN on top is not the one that TAKES THE KEYS, it is reported (nothing about play changes).
//   1. the three answers agree for every menu in the table, one open at a time (the twelve anyMenuOpen missed included)
//   2. the draw order and the key order name every menu in the table, and nothing else
//   3. in play, by keyboard: walking is 'no-menu'; the start menu, the party and the bag are each 'menu'
//      with the right one on top; closing them comes back to 'no-menu'; nothing is reported
//   4. a case where the two orders disagree (made by hand: two menus open that the game does not open together) is
//      reported as illegal, once, naming both
//   node overworld/tests/ow_screen_machine_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const t = await openOverworld(browser, port);
	const { page, st } = t;
	const press = async (k, ms = 160) => { await page.keyboard.press(k); await sleep(ms); };
	// ===== 1 + 2. the table =====
	const tab = await page.evaluate(async () => {
		const K = await import('./ow_menukeys.js'), M = await import('./ow_menus.js'), D = await import('./ow_diagnostics.js');
		const table = K.CANVAS_MENUS(), names = Object.keys(table), bad = [];
		for (const n of names) {
			const m = table[n]; if (!m) { bad.push(n + ': missing'); continue; }
			const was = m.open; m.open = true;
			const a = K.canvasMenuOpen(), b = M.anyMenuOpen(), c = D.openCanvasMenus().includes(n);
			m.open = was;
			if (!(a && b && c)) bad.push(`${n}: canvas=${a} any=${b} open=${c}`);
		}
		const norm = x => (x === 'choice:over' ? 'choiceMenu' : x === 'shop:script' ? 'shopMenu' : x);
		const draw = new Set(K.DRAW_ORDER.map(norm)), keys = new Set(K.KEY_ORDER.map(norm));
		return { n: names.length, bad, notDrawn: names.filter(x => !draw.has(x)), noKeys: names.filter(x => !keys.has(x)), extra: [...draw, ...keys].filter(x => !names.includes(x)), none: K.canvasMenuOpen() || M.anyMenuOpen() || D.openCanvasMenus().length };
	});
	A(tab.n >= 41 && tab.bad.length === 0 && !tab.none, `the three answers agree for each of the ${tab.n} menus in the table, one open at a time (before: anyMenuOpen missed twelve, the trade screen among them)`, tab.bad);
	A(!tab.notDrawn.length && !tab.noKeys.length && !tab.extra.length, 'the draw order and the key order each name every menu in the table, and nothing else', tab);
	// ===== 3. in play =====
	const scr = () => page.evaluate(() => { const s = window.__states()['overworld.screen']; return { state: s.state, top: s.detail ? s.detail.top : null, open: s.detail ? s.detail.open : [] }; });
	await sleep(300);
	A((await scr()).state === 'no-menu', 'walking: overworld.screen is "no-menu"', await scr());
	await press('Enter');
	const s1 = await scr();
	A((await st()).start && s1.state === 'menu' && s1.top === 'startMenu', 'Enter: the start menu is up, and on top', JSON.stringify(s1));
	await press('KeyX', 260);
	A((await scr()).state === 'no-menu', 'X closes it: no menu', JSON.stringify(await scr()));
	await press('Backspace'); await sleep(200);
	const s2 = await scr();
	A(s2.state === 'menu' && s2.top === 'partyMenu', 'Backspace: the party is on top', JSON.stringify(s2));
	for (let i = 0; i < 4 && (await scr()).state !== 'no-menu'; i++) await press('KeyX', 220);
	A((await scr()).state === 'no-menu', 'X backs out of each: no menu again', await scr());
	await press('KeyC'); await sleep(200);
	const s3 = await scr();
	A(s3.state === 'menu' && s3.top === 'bagMenu', 'C: the bag is on top', s3);
	for (let i = 0; i < 4 && (await scr()).state !== 'no-menu'; i++) await press('KeyX', 220);
	A((await page.evaluate(() => window.__states.problems())).length === 0, 'through all of that nothing was reported');
	// ===== 4. two orders disagreeing =====
	const pair = await page.evaluate(async () => {
		const K = await import('./ow_menukeys.js'), norm = x => (x === 'choice:over' ? 'choiceMenu' : x === 'shop:script' ? 'shopMenu' : x);
		const D = K.DRAW_ORDER.map(norm), Kk = K.KEY_ORDER.map(norm);
		for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) { if (D[i] === D[j]) continue; const ki = Kk.indexOf(D[i]), kj = Kk.indexOf(D[j]); if (ki > kj && ki >= 0 && kj >= 0) return [D[i], D[j]]; }
		return null;
	});
	A(!!pair, `(the two orders disagree for some pair today, e.g. ${pair && pair.join(' / ')}: drawn one way, keys the other)`);
	if (pair) {
		await page.evaluate(async p => { const K = await import('./ow_menukeys.js'), m = K.CANVAS_MENUS(); m[p[0]].open = true; m[p[1]].open = true; }, pair);
		await sleep(300);
		const ill = await scr(), probs = await page.evaluate(() => window.__states.problems());
		await page.evaluate(async p => { const K = await import('./ow_menukeys.js'), m = K.CANVAS_MENUS(); m[p[0]].open = false; m[p[1]].open = false; }, pair);
		await sleep(400);
		A(/^illegal: \w+ is drawn on top but \w+ takes the keys$/.test(ill.state) && probs.length === 1 && probs[0].name === 'overworld.screen' && probs[0].text.includes(pair[0]) && probs[0].text.includes(pair[1]), `with ${pair[0]} and ${pair[1]} both open it is reported, once, naming both`, [ill, probs]);
		A((await page.evaluate(() => window.__states.problems())).length === 1, 'a frame later it is still reported once (not every frame)');
	}
	A(!t.errors || !t.errors.length, 'no page errors', t.errors && t.errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`
${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
